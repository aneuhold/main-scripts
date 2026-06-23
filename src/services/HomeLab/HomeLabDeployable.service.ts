import { DR } from '@aneuhold/core-ts-lib';
import { findDeployable } from '../../config/homelab/registry.js';
import {
  Deployable,
  DeployableOpKey,
  DeployableState,
  DetectionContext
} from '../../config/homelab/types.js';
import { MainScriptsConfig } from '../Config.service.js';

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
   * declared via `dependsOn` are deployed first (in order), skipping any already
   * satisfied when a detection context is supplied.
   *
   * @param op the operation to run
   * @param target the deployable to act on
   * @param config user config (used by `deploy`)
   * @param extraArg service name for `logs`, or `removeVolumes` for `teardown`
   * @param ctx detection context used by `deploy` to skip already-satisfied dependencies; when omitted, dependencies always deploy
   */
  static async run(
    op: DeployableOpKey,
    target: Deployable,
    config: MainScriptsConfig,
    extraArg?: ExtraArg,
    ctx?: DetectionContext
  ): Promise<void> {
    if (!target.ops[op]) {
      DR.logger.error(
        `"${target.name}" does not support the "${op}" operation.`
      );
      return;
    }
    if (op === 'deploy') {
      await this.#deployWithDependencies(target, config, ctx, new Set(), true);
      return;
    }
    await this.#invoke(op, target, config, extraArg);
  }

  /**
   * Awaits a single op on a target, passing the argument that op expects.
   *
   * @param op the operation to run
   * @param target the deployable to act on
   * @param config user config (used by `deploy`)
   * @param extraArg service name for `logs`, or `removeVolumes` for `teardown`
   */
  static async #invoke(
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
   * the target itself. The explicitly chosen target always deploys; a dependency
   * deploys only when it is not already satisfied against `ctx`, so a
   * reconcile-driven deploy never re-runs a prerequisite that is already in place
   * (e.g. reinstalling Docker for a stack whose host is already a Docker host).
   * With no `ctx`, dependencies always deploy.
   *
   * @param target the deployable to deploy
   * @param config user config passed to each deploy op
   * @param ctx detection context for the satisfied check; when omitted, dependencies always deploy
   * @param visited names already deployed in this run
   * @param isRoot whether this is the explicitly chosen target (always deploys) rather than a dependency
   */
  static async #deployWithDependencies(
    target: Deployable,
    config: MainScriptsConfig,
    ctx: DetectionContext | undefined,
    visited: Set<string>,
    isRoot: boolean
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
      await this.#deployWithDependencies(
        dependency,
        config,
        ctx,
        visited,
        false
      );
    }

    if (!target.ops.deploy) {
      DR.logger.error(`"${target.name}" has no deploy op. Skipping.`);
      return;
    }

    if (!isRoot && ctx && (await this.#isSatisfied(target, ctx))) {
      DR.logger.info(`Dependency ${target.name} already satisfied. Skipping.`);
      return;
    }

    DR.logger.info(`Deploying ${target.name}...`);
    await target.ops.deploy(config);
  }

  /**
   * Reports whether a dependency's desired condition already holds, so the
   * dependency walk can skip a satisfied prerequisite. Satisfied means the
   * deployable observes itself present on its desired machine and not stopped.
   *
   * @param target the dependency to check
   * @param ctx the shared detection context
   */
  static async #isSatisfied(
    target: Deployable,
    ctx: DetectionContext
  ): Promise<boolean> {
    const observation = await target.observe(ctx);
    return observation.placements.some(
      (p) => p.machine === target.machine && p.state !== DeployableState.Stopped
    );
  }
}
