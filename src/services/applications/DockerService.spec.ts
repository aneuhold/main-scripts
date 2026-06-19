import { describe, expect, it } from 'vitest';
import DockerService from './DockerService.js';

describe('DockerService command builders', () => {
  describe('compose builders', () => {
    it('builds compose up/stop/restart/ps for a directory', () => {
      expect(DockerService.getComposeUpCommand('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose up -d'
      );
      expect(DockerService.getComposeStopCommand('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose stop'
      );
      expect(DockerService.getComposeRestartCommand('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose restart'
      );
      expect(DockerService.getComposePsCommand('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose ps'
      );
    });

    it('builds compose logs with and without a service filter', () => {
      expect(DockerService.getComposeLogsCommand('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose logs -f'
      );
      expect(
        DockerService.getComposeLogsCommand('~/monitoring', 'pihole')
      ).toBe('cd ~/monitoring && docker compose logs -f pihole');
    });

    it('builds compose down with and without volume removal', () => {
      expect(DockerService.getComposeDownCommand('~/monitoring', false)).toBe(
        'cd ~/monitoring && docker compose down'
      );
      expect(DockerService.getComposeDownCommand('~/monitoring', true)).toBe(
        'cd ~/monitoring && docker compose down -v'
      );
    });
  });

  describe('container builders', () => {
    it('builds single-container lifecycle commands by name', () => {
      expect(DockerService.getContainerStartCommand('pihole')).toBe(
        'docker start pihole'
      );
      expect(DockerService.getContainerStopCommand('pihole')).toBe(
        'docker stop pihole'
      );
      expect(DockerService.getContainerRestartCommand('pihole')).toBe(
        'docker restart pihole'
      );
      expect(DockerService.getContainerStatusCommand('pihole')).toBe(
        "docker inspect --format='{{.State.Status}}' pihole"
      );
      expect(DockerService.getContainerLogsCommand('pihole')).toBe(
        'docker logs -f pihole'
      );
    });
  });

  describe('detection builders', () => {
    it('preserves the exact --format strings for ps queries', () => {
      expect(DockerService.getRunningContainersCommand()).toBe(
        "docker ps --format '{{.Names}}'"
      );
      expect(DockerService.getExitedContainersCommand()).toBe(
        "docker ps -a --filter status=exited --format '{{.Names}}'"
      );
    });

    it('builds the docker-info reachability check', () => {
      expect(DockerService.getDockerInfoCheckCommand()).toBe(
        'docker info > /dev/null 2>&1 && echo ok || echo no_docker'
      );
    });
  });
});
