# OSProcessService Plan

## Goal

Move process work out of `ShellService` into an `OSProcessService` that owns processes as a subject. Every process question goes through it, and `ShellService` runs no commands of its own.

Scope is listing processes with working directory and memory usage. Killing processes and CPU usage extend the same entry point later.

## Target Structure

Create `src/services/OSProcess.service.ts` with `OSProcessService` as the default export. It sits at the top level rather than under `applications/`, which `src/services/applications/readme.md` scopes to applications with a GUI.

```ts
export enum ProcessDetail {
  TerminalId = 'terminalId',
  GroupLeadership = 'groupLeadership',
  WorkingDirectory = 'workingDirectory',
  MemoryUsage = 'memoryUsage'
}

export type ProcessInfo = {
  pid: number;
  /** The name the process runs under, with any path and login `-` prefix removed. */
  commandName: string;
  /**
   * Identifies the terminal the process is attached to, undefined when it is
   * attached to none. Check whether it is set, compare it against another
   * process's value to find the ones sharing a terminal, or show it as a
   * label. Its shape differs by OS, so nothing is read out of it or built
   * from it. Values look like:
   *
   * - Mac: `ttys003`
   * - Linux: `pts/3` or `tty1`
   * - Windows: `30796`, the PID of the terminal host it descends from
   *
   * Only present when {@link ProcessDetail.TerminalId} is requested.
   */
  terminalId?: string;
  /**
   * Whether the process heads its own group rather than belonging to a group
   * another process heads.
   *
   * Only present when {@link ProcessDetail.GroupLeadership} is requested.
   */
  leadsOwnGroup?: boolean;
  /** Only present when {@link ProcessDetail.WorkingDirectory} is requested. */
  cwd?: string;
  /** Only present when {@link ProcessDetail.MemoryUsage} is requested. */
  memoryBytes?: number;
};

static getProcessInfo(options?: {
  /**
   * Runs against every listed process. Details are looked up only for the
   * processes it keeps, so it sees `pid` and `commandName` and nothing else.
   */
  filter?: (process: ProcessInfo) => boolean;
  requestedDetails?: ProcessDetail[];
}): Promise<ProcessInfo[]>
```

`getProcessInfo` lists the processes, drops the ones the filter excludes, then populates each requested detail for the survivors only.

`pid` and `commandName` are the only fields every OS reports for free, so they are always present and are all the filter sees. Everything else is a detail. Narrowing on a detail means chaining two calls: request it, filter the returned array, then pass the surviving IDs into a second call that asks for the next detail. That keeps the expensive work proportional to what the caller actually wants, whichever attribute the narrowing is based on.

The filter is a predicate the caller supplies rather than a set of declarative fields. The service reports what the OS records and holds no opinion about which processes are interesting.

`terminalId` and `leadsOwnGroup` name concepts rather than mechanisms, so each OS maps its own:

| Field           | macOS and Linux                          | Windows                                                         |
| --------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `terminalId`    | controlling terminal, undefined for `??` | PID of the terminal host ancestor, undefined when there is none   |
| `leadsOwnGroup` | `pid === pgid`                           | the terminal host is the parent, rather than another shell        |

### Private members

- `#listProcesses(): Promise<ProcessInfo[]>` reads `ps` and maps each row into the shape above
- `#getTerminalAndGroup(pids: number[]): Promise<Map<number, { terminalId?: string; leadsOwnGroup: boolean }>>`
- `#getWorkingDirectoriesOfPids(pids: number[]): Promise<Map<number, string>>` reads `lsof`
- `#getMemoryUsageOfPids(pids: number[]): Promise<Map<number, number>>` reads `top`
- `#parseTopMemoryValue(value: string): number`

`#getTerminalAndGroup` resolves both fields together, since Windows derives them from one traversal:

```ts
/**
 * Maps each of the given process IDs to the terminal it is attached to and
 * whether it heads its own group.
 *
 * On macOS and Linux `ps` reports the controlling terminal and the process
 * group directly. Windows reports neither, so both are derived by walking
 * `ParentProcessId` up to a terminal host such as `WindowsTerminal.exe`,
 * `conhost.exe`, `OpenConsole.exe`, or `sshd.exe`. `GetConsoleProcessList`
 * cannot stand in for that walk, since it answers only for the caller's own
 * console. The walk runs in memory over the full process listing rather than
 * as a query per process, and each parent link is checked against
 * `CreationDate`, because Windows leaves the link stale once the parent exits
 * and recycles PIDs.
 *
 * @param pids the process IDs to look up
 */
```

The detail lookups stay private so `getProcessInfo` is the single entry point, and so a new detail arrives as a `ProcessDetail` member rather than as another public method.

### What is left on ShellService

`getInteractiveShells` and the `InteractiveShellInfo` type. It runs no commands, and chains two calls because it narrows on a detail:

```ts
// Widened to `string[]` so a command name read off the system can be checked
// against it.
const shellCommandNames: string[] = Object.values(ShellType);

const candidates = await OSProcessService.getProcessInfo({
  filter: ({ commandName }) => shellCommandNames.includes(commandName),
  requestedDetails: [ProcessDetail.TerminalId, ProcessDetail.GroupLeadership]
});

const shellPids = new Set(
  candidates
    .filter(({ leadsOwnGroup, terminalId }) => leadsOwnGroup && terminalId !== undefined)
    .map(({ pid }) => pid)
);

const shells = await OSProcessService.getProcessInfo({
  filter: ({ pid }) => shellPids.has(pid),
  requestedDetails: [ProcessDetail.WorkingDirectory, ProcessDetail.MemoryUsage]
});

return shells.map(({ pid, cwd, memoryBytes }) => ({
  pid,
  cwd: cwd ?? '',
  memoryBytes: memoryBytes ?? 0
}));
```

Filtering on the command name first means the terminal derivation covers only shell-named processes, and `lsof` and `top` cover only the shells that survive both checks.

Interactivity is decided here rather than reported by the service. Terminal attachment alone does not make a process interactive, since a process inherits it from its parent and keeps it while running unattended. The claim comes from combining attachment with group leadership and a shell command name, and that combination is what `ShellService` exists to state.

`InteractiveShellInfo` stays required in both fields, so `show.ts` needs no change.

## Steps

1. Create `src/services/OSProcess.service.ts`. The `ps`, `lsof`, and `top` bodies move over from `ShellService`, with `#listProcesses` mapping `pid` and `comm` and `#getTerminalAndGroup` mapping `tty` and `pgid`.
2. Rewrite `Shell.service.ts` down to `getInteractiveShells`, `InteractiveShellInfo`, and the two calls above. Delete `#getMacOsInteractiveShells`, `#getShellProcessIds`, `#getWorkingDirectoriesOfPids`, `#getMemoryUsageOfPids`, and `#parseTopMemoryValue`.
3. Create `src/services/OSProcess.service.spec.ts` covering:
   - a call with no filter and no details returning every process with `pid` and `commandName` only
   - a filter narrowing the result, with the detail lookups carrying only the surviving IDs
   - each detail populating its own field and leaving the unrequested ones undefined
   - the mapping into `terminalId` and `leadsOwnGroup`, including `undefined` for a `??` row, and command name normalization for `-zsh` and `/bin/zsh`
   - memory parsing across `B`, `K`, `M`, `G`, and `T`, plus an unparseable value returning `0`
   - a non-macOS OS returning an empty list
4. Trim `src/services/applications/Shell.service.spec.ts` to the shell question, mocking `OSProcessService.getProcessInfo` for both calls. Assert which processes survive the two stages, and the mapping of the result. The `ps`, `lsof`, and `top` fixtures move to the new spec.

## Constraints Worth Preserving

- Memory comes from `top -l 1 -stats pid,mem -pid <n>`, which reports the physical footprint. `ps -o rss` looks simpler but excludes pages the system has compressed, so an idle shell holding 500 MB can report 8 MB.
- Each method guards its own OS with the supported branch first, then falls through to `DR.logger.error` and an empty result.
- Shell matching runs against `Object.values(ShellType)` so any shell type is found on any OS. A hardcoded list misses `pwsh` on macOS.
- Command name normalization belongs in `#listProcesses`. A login shell reports as `-zsh` and an explicit invocation as `/bin/zsh`, and every caller comparing names needs the same treatment.
- `|| true` on the `lsof` call keeps one exited process from discarding the output for every other process.
- The detail lookups run against the filtered IDs, and independent ones run concurrently with `Promise.all`.
- A missing `cwd` is expected rather than a failure. `lsof` reports one only for live processes the current user owns, so a zombie or another user's process has none.
- A process can exit between two chained calls, so the second call returning fewer processes than the first is normal.

## Verification

Run `pnpm lint --fix`, `pnpm check`, and `pnpm test`. Then `npx tsx src/index.ts show shell-mem-usage` and confirm the table is unchanged.

`src/services/applications/VSCode.service.spec.ts` fails on a `better-sqlite3` native module built for a different Node version. It is unrelated to this work and fails on a clean checkout.
