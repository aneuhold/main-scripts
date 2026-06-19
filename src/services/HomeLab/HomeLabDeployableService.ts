import { DR } from '@aneuhold/core-ts-lib';
import { findDeployable } from '../../config/homelab/registry.js';
import { Deployable, DeployableOpKey } from '../../config/homelab/types.js';
import { MainScriptsConfig } from '../ConfigService.js';

/**
 * Extra argument carried by an op: a service name for `logs`, a `removeVolumes`
 * flag for `teardown`.
 */
type ExtraArg = string | boolean | undefined;

/**
 * Dispatches uniform lifecycle ops to a {@link Deployable}. Ops are pre-resolved
 * by the drivers (driver default + override), so there is no ops-first
 * branching here. `run` simply awaits the right op with the right argument.
 * `deploy` additionally resolves `dependsOn` ordering first.
 */
export default class HomeLabDeployableService {
  /**
   * Runs a single lifecycle op against the target. For `deploy`, dependencies
   * declared via `dependsOn` are deployed first (idempotently, in order).
   *
   * @param op the operation to run
   * @param target the deployable to act on
   * @param config user config (used by `deploy`)
   * @param extraArg service name for `logs`, or `removeVolumes` for `teardown`
   */
  static async run(
    op: DeployableOpKey,
    target: Deployable,
    config: MainScriptsConfig,
    extraArg?: ExtraArg
  ): Promise<void> {
    if (!target.ops[op]) {
      DR.logger.error(
        `"${target.name}" does not support the "${op}" operation.`
      );
      return;
    }
    if (op === 'deploy') {
      await this.deployWithDependencies(target, config, new Set());
      return;
    }
    await this.invoke(op, target, config, extraArg);
  }

  /**
   * Awaits a single op on a target, passing the argument that op expects.
   *
   * @param op the operation to run
   * @param target the deployable to act on
   * @param config user config (used by `deploy`)
   * @param extraArg service name for `logs`, or `removeVolumes` for `teardown`
   */
  private static async invoke(
    op: DeployableOpKey,
    target: Deployable,
    config: MainScriptsConfig,
    extraArg?: ExtraArg
  ): Promise<void> {
    switch (op) {
      case 'deploy':
        await target.ops.deploy?.(config);
        return;
      case 'teardown':
        await target.ops.teardown?.(
          typeof extraArg === 'boolean' ? extraArg : false
        );
        return;
      case 'logs':
        await target.ops.logs?.(
          typeof extraArg === 'string' ? extraArg : undefined
        );
        return;
      case 'start':
        await target.ops.start?.();
        return;
      case 'stop':
        await target.ops.stop?.();
        return;
      case 'restart':
        await target.ops.restart?.();
        return;
      case 'status':
        await target.ops.status?.();
        return;
    }
  }

  /**
   * Recursively deploys a target's dependencies (deduped, cycle-guarded) before
   * the target itself. Deploys are idempotent, so re-visiting a satisfied
   * dependency is harmless. The visited set merely avoids redundant work.
   *
   * @param target the deployable to deploy
   * @param config user config passed to each deploy op
   * @param visited names already deployed in this run
   */
  private static async deployWithDependencies(
    target: Deployable,
    config: MainScriptsConfig,
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(target.name)) return;
    visited.add(target.name);

    for (const depName of target.dependsOn) {
      const dependency = findDeployable(depName);
      if (!dependency) {
        DR.logger.error(
          `Unknown dependency "${depName}" declared by ${target.name}. Skipping.`
        );
        continue;
      }
      await this.deployWithDependencies(dependency, config, visited);
    }

    if (!target.ops.deploy) {
      DR.logger.error(`"${target.name}" has no deploy op. Skipping.`);
      return;
    }
    DR.logger.info(`Deploying ${target.name}...`);
    await target.ops.deploy(config);
  }
}
