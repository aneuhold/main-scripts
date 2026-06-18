/**
 * Pure command-builders for the remote Docker / docker-compose commands the
 * home lab issues over SSH. Every method returns a shell-command string and has
 * no side effects, so the exact strings can be unit-tested without SSH or mocks.
 * The shell-sensitive `--format` strings are preserved verbatim — do not reflow.
 */
export default class RemoteDocker {
  /**
   * `docker compose up -d` in the given remote directory.
   *
   * @param remoteDir directory holding the compose file
   */
  static composeUp(remoteDir: string): string {
    return `cd ${remoteDir} && docker compose up -d`;
  }

  /**
   * `docker compose stop` in the given remote directory.
   *
   * @param remoteDir directory holding the compose file
   */
  static composeStop(remoteDir: string): string {
    return `cd ${remoteDir} && docker compose stop`;
  }

  /**
   * `docker compose restart` in the given remote directory.
   *
   * @param remoteDir directory holding the compose file
   */
  static composeRestart(remoteDir: string): string {
    return `cd ${remoteDir} && docker compose restart`;
  }

  /**
   * `docker compose ps` in the given remote directory.
   *
   * @param remoteDir directory holding the compose file
   */
  static composePs(remoteDir: string): string {
    return `cd ${remoteDir} && docker compose ps`;
  }

  /**
   * `docker compose logs -f` in the given remote directory, optionally filtered
   * to a single service.
   *
   * @param remoteDir directory holding the compose file
   * @param service optional service/container name to filter
   */
  static composeLogs(remoteDir: string, service?: string): string {
    const serviceArg = service ? ` ${service}` : '';
    return `cd ${remoteDir} && docker compose logs -f${serviceArg}`;
  }

  /**
   * `docker compose down` in the given remote directory, optionally removing
   * named volumes.
   *
   * @param remoteDir directory holding the compose file
   * @param removeVolumes if true, passes -v
   */
  static composeDown(remoteDir: string, removeVolumes: boolean): string {
    const flag = removeVolumes ? ' -v' : '';
    return `cd ${remoteDir} && docker compose down${flag}`;
  }

  /**
   * `docker start <name>`.
   *
   * @param name container name
   */
  static containerStart(name: string): string {
    return `docker start ${name}`;
  }

  /**
   * `docker stop <name>`.
   *
   * @param name container name
   */
  static containerStop(name: string): string {
    return `docker stop ${name}`;
  }

  /**
   * `docker restart <name>`.
   *
   * @param name container name
   */
  static containerRestart(name: string): string {
    return `docker restart ${name}`;
  }

  /**
   * Prints the run-state of a single container.
   *
   * @param name container name
   */
  static containerStatus(name: string): string {
    return `docker inspect --format='{{.State.Status}}' ${name}`;
  }

  /**
   * `docker logs -f <name>`.
   *
   * @param name container name
   */
  static containerLogs(name: string): string {
    return `docker logs -f ${name}`;
  }

  /** Lists the names of currently running containers, one per line. */
  static runningContainers(): string {
    return "docker ps --format '{{.Names}}'";
  }

  /** Lists the names of stopped (exited) containers, one per line. */
  static exitedContainers(): string {
    return "docker ps -a --filter status=exited --format '{{.Names}}'";
  }

  /** Prints `ok` if the Docker daemon is up, `no_docker` otherwise. */
  static dockerInfoCheck(): string {
    return 'docker info > /dev/null 2>&1 && echo ok || echo no_docker';
  }
}
