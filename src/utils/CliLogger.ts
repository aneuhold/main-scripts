import type { ILogger } from '@aneuhold/core-ts-lib';

/**
 * Braille animation frames cycled while a spinner is active.
 */
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Milliseconds between spinner animation frames.
 */
const FRAME_INTERVAL_MS = 80;

/**
 * The project's {@link ILogger}: it logs exactly like the default console logger
 * (same emoji-prefixed lines) but additionally owns a single live spinner for
 * signalling long-running work. Because the spinner lives in the logger, every
 * `info`/`warn`/etc. call automatically clears the spinner line, writes its
 * message, and redraws the spinner beneath it — so real-time output and the
 * loading indicator never corrupt one another.
 *
 * Register it once at startup via `DR.registerLogger(new CliLogger())`; drive
 * the spinner through the static `startSpinner`/`succeedSpinner`/... methods, or
 * the {@link withSpinner} wrapper, from anywhere.
 *
 * The animation only runs on an interactive TTY with verbose logging off; on a
 * non-TTY (piped output, CI) or in verbose mode it degrades to plain status
 * lines, so nothing is lost and captured output stays clean.
 */
export default class CliLogger implements ILogger {
  private static verboseEnabled = false;
  private static spinnerText: string | undefined;
  private static spinnerFrame = 0;
  private static spinnerTimer: NodeJS.Timeout | undefined;

  private readonly logOnlyIfVerbose: boolean;

  /**
   * @param logOnlyIfVerbose if true, this instance only logs when verbose
   * logging is globally enabled (used for the `verbose` child logger)
   */
  constructor(logOnlyIfVerbose = false) {
    this.logOnlyIfVerbose = logOnlyIfVerbose;
  }

  /**
   * Starts the live spinner with the given status text, replacing any spinner
   * already running.
   *
   * @param text the status text shown next to the spinner
   */
  static startSpinner(text: string): void {
    CliLogger.stopTimer();
    CliLogger.spinnerText = text;
    CliLogger.spinnerFrame = 0;
    if (!CliLogger.canAnimate()) {
      console.log(`… ${text}`);
      return;
    }
    CliLogger.renderFrame();
    CliLogger.spinnerTimer = setInterval(() => {
      CliLogger.spinnerFrame = (CliLogger.spinnerFrame + 1) % FRAMES.length;
      CliLogger.renderFrame();
    }, FRAME_INTERVAL_MS);
    // Never let a lingering spinner hold the process open on exit.
    CliLogger.spinnerTimer.unref();
  }

  /**
   * Updates the active spinner's status text without restarting it.
   *
   * @param text the new status text
   */
  static updateSpinner(text: string): void {
    CliLogger.spinnerText = text;
    if (CliLogger.spinnerTimer && CliLogger.canAnimate()) {
      CliLogger.renderFrame();
    }
  }

  /**
   * Stops the active spinner and prints a success line.
   *
   * @param text optional final text; defaults to the current spinner text
   */
  static succeedSpinner(text?: string): void {
    CliLogger.finalize('✓', text);
  }

  /**
   * Stops the active spinner and prints a failure line.
   *
   * @param text optional final text; defaults to the current spinner text
   */
  static failSpinner(text?: string): void {
    CliLogger.finalize('✗', text);
  }

  /**
   * Stops the active spinner without printing a result line.
   */
  static stopSpinner(): void {
    CliLogger.stopTimer();
    if (CliLogger.canAnimate()) CliLogger.clearLine();
    CliLogger.spinnerText = undefined;
  }

  /**
   * Runs an async task with a spinner, resolving it to a success line when the
   * task settles or a failure line when it throws. Returns the task's result
   * (or re-throws its error) so call sites read naturally.
   *
   * @param text the status text shown while the task runs
   * @param task the async work to await
   */
  static async withSpinner<T>(
    text: string,
    task: () => Promise<T>
  ): Promise<T> {
    CliLogger.startSpinner(text);
    try {
      const result = await task();
      CliLogger.succeedSpinner();
      return result;
    } catch (err) {
      CliLogger.failSpinner();
      throw err;
    }
  }

  /**
   * Gets a child logger that only emits when verbose logging is enabled.
   */
  get verbose(): ILogger {
    return new CliLogger(true);
  }

  /**
   * Logs an informational message, prefixed with `ℹ️`.
   *
   * @param msg the message to log
   * @param skipNewline if true, writes without a trailing newline
   */
  info(msg: string, skipNewline?: boolean): void {
    if (!this.shouldLog()) return;
    const line = `ℹ️  ${msg}`;
    if (skipNewline) {
      CliLogger.aroundSpinner(() => process.stdout.write(line), false);
      return;
    }
    CliLogger.aroundSpinner(() => {
      console.log(line);
    }, true);
  }

  /**
   * Logs a success message, prefixed with `✅`.
   *
   * @param msg the message to log
   */
  success(msg: string): void {
    if (this.shouldLog())
      CliLogger.aroundSpinner(() => {
        console.log(`✅ ${msg}`);
      });
  }

  /**
   * Logs a warning message, prefixed with `🟡`.
   *
   * @param msg the message to log
   */
  warn(msg: string): void {
    if (this.shouldLog())
      CliLogger.aroundSpinner(() => {
        console.warn(`🟡 ${msg}`);
      });
  }

  /**
   * Logs an error message, prefixed with `💀`.
   *
   * @param msg the message to log
   */
  error(msg: string): void {
    if (this.shouldLog())
      CliLogger.aroundSpinner(() => {
        console.error(`💀 ${msg}`);
      });
  }

  /**
   * Sets the global verbose logging state.
   *
   * @param enabled whether to enable verbose logging globally
   */
  setVerboseLogging(enabled: boolean): void {
    CliLogger.verboseEnabled = enabled;
  }

  /**
   * Gets the current global verbose logging state.
   */
  isVerboseLoggingEnabled(): boolean {
    return CliLogger.verboseEnabled;
  }

  /**
   * True only when output is an interactive TTY and verbose logging is off — the
   * conditions under which animating (and rewriting) a line is safe.
   */
  private static canAnimate(): boolean {
    return process.stdout.isTTY && !CliLogger.verboseEnabled;
  }

  /**
   * Runs a write that produces normal log output, first clearing the spinner
   * line if one is animating and then optionally redrawing it beneath the new
   * output so the spinner stays pinned to the bottom.
   *
   * @param write the output-producing write to perform
   * @param redraw whether to redraw the spinner afterward (false for partial,
   * newline-less writes)
   */
  private static aroundSpinner(write: () => void, redraw = true): void {
    const active =
      CliLogger.spinnerText !== undefined && CliLogger.canAnimate();
    if (active) CliLogger.clearLine();
    write();
    if (active && redraw) CliLogger.renderFrame();
  }

  /**
   * Stops the spinner and prints its final result line.
   *
   * @param mark the leading status mark (e.g. `✓` or `✗`)
   * @param text optional final text; defaults to the current spinner text
   */
  private static finalize(mark: string, text?: string): void {
    const finalText = text ?? CliLogger.spinnerText ?? '';
    CliLogger.stopTimer();
    if (CliLogger.canAnimate()) CliLogger.clearLine();
    CliLogger.spinnerText = undefined;
    console.log(`${mark} ${finalText}`);
  }

  /**
   * Draws the current spinner frame and text on the active line.
   */
  private static renderFrame(): void {
    CliLogger.clearLine();
    process.stdout.write(
      `${FRAMES[CliLogger.spinnerFrame]} ${CliLogger.spinnerText ?? ''}`
    );
  }

  /**
   * Returns the cursor to the start of the line and clears it.
   */
  private static clearLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  /**
   * Clears the animation interval if one is running.
   */
  private static stopTimer(): void {
    if (CliLogger.spinnerTimer) {
      clearInterval(CliLogger.spinnerTimer);
      CliLogger.spinnerTimer = undefined;
    }
  }

  /**
   * Determines whether this instance should emit, honoring its verbose-only
   * setting against the global verbose flag.
   */
  private shouldLog(): boolean {
    return !this.logOnlyIfVerbose || CliLogger.verboseEnabled;
  }
}
