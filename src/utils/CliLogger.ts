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
 * Handle to one live loading indicator. The handle is intentionally dumb. All
 * spinner coordination lives inside {@link CliLogger}.
 */
type Spinner = {
  /** Replaces the status text shown next to the spinner. */
  update: (text: string) => void;
  /** Signals activity: hides the spinner if shown and restarts any delay. */
  poke: () => void;
  /** Stops the spinner and prints a success line. */
  succeed: (text?: string) => void;
  /** Stops the spinner and prints a failure line. */
  fail: (text?: string) => void;
  /** Stops the spinner without printing a result line. */
  stop: () => void;
};

/**
 * The project's {@link ILogger}. Logs emoji-prefixed lines and additionally owns
 * a single live spinner for signalling long-running work. Because the spinner
 * lives in the logger, every `info`/`warn`/etc. call automatically clears the
 * spinner line, writes its message, and redraws the spinner beneath it, so
 * normal output and the loading indicator never corrupt one another.
 *
 * Register it once at startup via `DR.registerLogger(new CliLogger())`; create
 * spinners through the static {@link spinner} factory, or the
 * {@link withSpinner} wrapper, from anywhere.
 *
 * The animation only runs on an interactive TTY with verbose logging off; on a
 * non-TTY (piped output, CI) or in verbose mode it degrades to plain status
 * lines, so nothing is lost and captured output stays clean.
 */
export default class CliLogger implements ILogger {
  static #verboseEnabled = false;
  static #spinnerText: string | undefined;
  static #spinnerFrame = 0;
  static #spinnerTimer: NodeJS.Timeout | undefined;
  static #owner: symbol | undefined;

  readonly #logOnlyIfVerbose: boolean;

  /**
   * @param logOnlyIfVerbose if true, this instance only logs when verbose
   * logging is globally enabled (used for the `verbose` child logger)
   */
  constructor(logOnlyIfVerbose = false) {
    this.#logOnlyIfVerbose = logOnlyIfVerbose;
  }

  /**
   * Creates a loading indicator and returns a handle to drive it. With no delay
   * the spinner appears immediately; with `delayMs` it appears only once the
   * operation has stayed silent that long, so quick operations never flash a
   * spinner. Report activity with {@link Spinner.poke} and completion with
   * `succeed`/`fail`/`stop`.
   *
   * Coordination is automatic: a delayed spinner stays suppressed while another
   * spinner already owns the line or output is non-interactive, and each handle
   * only ever touches the line it owns, so concurrent callers never collide.
   *
   * @param text the status text shown next to the spinner
   * @param options spinner settings
   * @param options.delayMs milliseconds of silence before the spinner appears;
   * omit or pass 0 to show it immediately
   */
  static spinner(text: string, options: { delayMs?: number } = {}): Spinner {
    const id = Symbol(text);
    const delayMs = options.delayMs ?? 0;
    let label = text;
    let delayTimer: NodeJS.Timeout | undefined;

    const clearDelay = (): void => {
      if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = undefined;
      }
    };
    const start = (): void => {
      if (delayMs <= 0) {
        CliLogger.#claim(id, label);
        return;
      }
      delayTimer = setTimeout(() => {
        // Claim the line only when nothing else owns it.
        if (CliLogger.#owner === undefined && CliLogger.#isInteractive()) {
          CliLogger.#claim(id, label);
        }
      }, delayMs);
      delayTimer.unref();
    };

    start();

    return {
      update: (next: string): void => {
        label = next;
        CliLogger.#redraw(id, label);
      },
      poke: (): void => {
        clearDelay();
        CliLogger.#release(id);
        start();
      },
      succeed: (next?: string): void => {
        clearDelay();
        CliLogger.#finalize(id, '✓', next ?? label);
      },
      fail: (next?: string): void => {
        clearDelay();
        CliLogger.#finalize(id, '✗', next ?? label);
      },
      stop: (): void => {
        clearDelay();
        CliLogger.#release(id);
      }
    };
  }

  /**
   * Runs an async task with an immediate spinner, resolving it to a success line
   * when the task settles or a failure line when it throws. Returns the task's
   * result (or re-throws its error) so call sites read naturally.
   *
   * @param text the status text shown while the task runs
   * @param task the async work to await
   */
  static async withSpinner<T>(
    text: string,
    task: () => Promise<T>
  ): Promise<T> {
    const spinner = CliLogger.spinner(text);
    try {
      const result = await task();
      spinner.succeed();
      return result;
    } catch (err) {
      spinner.fail();
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
    if (!this.#shouldLog()) return;
    const line = `ℹ️  ${msg}`;
    if (skipNewline) {
      CliLogger.#aroundSpinner(() => process.stdout.write(line), false);
      return;
    }
    CliLogger.#aroundSpinner(() => {
      console.log(line);
    }, true);
  }

  /**
   * Logs a success message, prefixed with `✅`.
   *
   * @param msg the message to log
   */
  success(msg: string): void {
    if (this.#shouldLog())
      CliLogger.#aroundSpinner(() => {
        console.log(`✅ ${msg}`);
      });
  }

  /**
   * Logs a warning message, prefixed with `🟡`.
   *
   * @param msg the message to log
   */
  warn(msg: string): void {
    if (this.#shouldLog())
      CliLogger.#aroundSpinner(() => {
        console.warn(`🟡 ${msg}`);
      });
  }

  /**
   * Logs an error message, prefixed with `💀`.
   *
   * @param msg the message to log
   */
  error(msg: string): void {
    if (this.#shouldLog())
      CliLogger.#aroundSpinner(() => {
        console.error(`💀 ${msg}`);
      });
  }

  /**
   * Sets the global verbose logging state.
   *
   * @param enabled whether to enable verbose logging globally
   */
  setVerboseLogging(enabled: boolean): void {
    CliLogger.#verboseEnabled = enabled;
  }

  /**
   * Gets the current global verbose logging state.
   */
  isVerboseLoggingEnabled(): boolean {
    return CliLogger.#verboseEnabled;
  }

  /**
   * True when output is an interactive TTY and verbose logging is off: the
   * conditions under which a spinner can safely animate and rewrite the line.
   */
  static #isInteractive(): boolean {
    return process.stdout.isTTY && !CliLogger.#verboseEnabled;
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
  static #aroundSpinner(write: () => void, redraw = true): void {
    const active =
      CliLogger.#spinnerText !== undefined && CliLogger.#isInteractive();
    if (active) CliLogger.#clearLine();
    write();
    if (active && redraw) CliLogger.#renderFrame();
  }

  /**
   * Makes `id` the owner of the line and shows its spinner: animates on an
   * interactive TTY, otherwise prints a single plain status line.
   *
   * @param id the owning handle's identity
   * @param label the status text to show
   */
  static #claim(id: symbol, label: string): void {
    CliLogger.#stopTimer();
    CliLogger.#owner = id;
    CliLogger.#spinnerText = label;
    CliLogger.#spinnerFrame = 0;
    if (!CliLogger.#isInteractive()) {
      console.log(`… ${label}`);
      return;
    }
    CliLogger.#renderFrame();
    CliLogger.#spinnerTimer = setInterval(() => {
      CliLogger.#spinnerFrame = (CliLogger.#spinnerFrame + 1) % FRAMES.length;
      CliLogger.#renderFrame();
    }, FRAME_INTERVAL_MS);
    // Never let a lingering spinner hold the process open on exit.
    CliLogger.#spinnerTimer.unref();
  }

  /**
   * Redraws the line with new text when `id` owns it.
   *
   * @param id the requesting handle's identity
   * @param label the new status text
   */
  static #redraw(id: symbol, label: string): void {
    if (CliLogger.#owner !== id) return;
    CliLogger.#spinnerText = label;
    if (CliLogger.#spinnerTimer && CliLogger.#isInteractive()) {
      CliLogger.#renderFrame();
    }
  }

  /**
   * Releases the line when `id` owns it, stopping the animation and clearing the
   * rendered spinner. Only rewrites the line when a spinner is actually
   * rendered, so it is safe to call between chunks of streamed output without
   * erasing partial lines.
   *
   * @param id the releasing handle's identity
   */
  static #release(id: symbol): void {
    if (CliLogger.#owner !== id) return;
    CliLogger.#stopTimer();
    if (CliLogger.#spinnerText !== undefined && CliLogger.#isInteractive()) {
      CliLogger.#clearLine();
    }
    CliLogger.#spinnerText = undefined;
    CliLogger.#owner = undefined;
  }

  /**
   * Releases the line (if owned) and prints a final result line, coexisting with
   * any other spinner still showing.
   *
   * @param id the finishing handle's identity
   * @param mark the leading status mark (e.g. `✓` or `✗`)
   * @param label the final text to print
   */
  static #finalize(id: symbol, mark: string, label: string): void {
    CliLogger.#release(id);
    CliLogger.#aroundSpinner(() => {
      console.log(`${mark} ${label}`);
    });
  }

  /**
   * Draws the current spinner frame and text on the active line.
   */
  static #renderFrame(): void {
    CliLogger.#clearLine();
    process.stdout.write(
      `${FRAMES[CliLogger.#spinnerFrame]} ${CliLogger.#spinnerText ?? ''}`
    );
  }

  /**
   * Returns the cursor to the start of the line and clears it.
   */
  static #clearLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  /**
   * Clears the animation interval if one is running.
   */
  static #stopTimer(): void {
    if (CliLogger.#spinnerTimer) {
      clearInterval(CliLogger.#spinnerTimer);
      CliLogger.#spinnerTimer = undefined;
    }
  }

  /**
   * Determines whether this instance should emit, honoring its verbose-only
   * setting against the global verbose flag.
   */
  #shouldLog(): boolean {
    return !this.#logOnlyIfVerbose || CliLogger.#verboseEnabled;
  }
}
