import { MainScriptsConfig } from '../../services/ConfigService.js';

/**
 * Identifies a physical machine in the home lab. Use stable hardware
 * identifiers here — not roles like "primary" or "spare", which can change.
 */
export enum HomeLabMachine {
  Pi1 = 'pi3-bplus-1',
  Pi2 = 'pi3-b-1',
  Router = 'edgerouter-x'
}

/**
 * Operations that can be performed on a stack or individual application.
 */
export type StackOrAppOps = {
  deploy?: (config: MainScriptsConfig) => void;
  teardown?: (removeVolumes: boolean) => void;
  start?: () => void;
  stop?: () => void;
  restart?: () => void;
  status?: () => void;
  logs?: (service?: string) => void;
};

/**
 * A service running in the home lab.
 */
export enum HomeLabApplication {
  Docker = 'docker',
  Pihole = 'pihole',
  Ntopng = 'ntopng',
  Loki = 'loki',
  Promtail = 'promtail',
  Grafana = 'grafana'
}

/**
 * A group of applications deployed together on a single machine, with optional
 * op overrides for the whole group.
 */
export type HomeLabStack = {
  /** Human-readable name used in CLI output and prompts. */
  name: string;
  /** Machine that hosts this stack. */
  machine: HomeLabMachine;
  /** Remote directory where docker-compose.yaml and config files live. */
  remoteDir: string;
  /** Applications that make up this stack. */
  applications: HomeLabApplication[];
  /**
   * Applications from other stacks that must already be running before this
   * stack can be deployed.
   */
  peerDependencies: HomeLabApplication[];
  ops?: StackOrAppOps;
};

/**
 * Full definition of an individual home lab application, including optional
 * op overrides.
 */
export type HomeLabApplicationInfo = {
  id: HomeLabApplication;
  ops?: StackOrAppOps;
};
