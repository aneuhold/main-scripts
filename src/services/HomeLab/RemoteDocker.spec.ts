import { describe, expect, it } from 'vitest';
import RemoteDocker from './RemoteDocker.js';

describe('RemoteDocker', () => {
  describe('compose builders', () => {
    it('builds compose up/stop/restart/ps for a remote dir', () => {
      expect(RemoteDocker.composeUp('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose up -d'
      );
      expect(RemoteDocker.composeStop('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose stop'
      );
      expect(RemoteDocker.composeRestart('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose restart'
      );
      expect(RemoteDocker.composePs('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose ps'
      );
    });

    it('builds compose logs with and without a service filter', () => {
      expect(RemoteDocker.composeLogs('~/monitoring')).toBe(
        'cd ~/monitoring && docker compose logs -f'
      );
      expect(RemoteDocker.composeLogs('~/monitoring', 'pihole')).toBe(
        'cd ~/monitoring && docker compose logs -f pihole'
      );
    });

    it('builds compose down with and without volume removal', () => {
      expect(RemoteDocker.composeDown('~/monitoring', false)).toBe(
        'cd ~/monitoring && docker compose down'
      );
      expect(RemoteDocker.composeDown('~/monitoring', true)).toBe(
        'cd ~/monitoring && docker compose down -v'
      );
    });
  });

  describe('container builders', () => {
    it('builds single-container lifecycle commands by name', () => {
      expect(RemoteDocker.containerStart('pihole')).toBe('docker start pihole');
      expect(RemoteDocker.containerStop('pihole')).toBe('docker stop pihole');
      expect(RemoteDocker.containerRestart('pihole')).toBe(
        'docker restart pihole'
      );
      expect(RemoteDocker.containerStatus('pihole')).toBe(
        "docker inspect --format='{{.State.Status}}' pihole"
      );
      expect(RemoteDocker.containerLogs('pihole')).toBe(
        'docker logs -f pihole'
      );
    });
  });

  describe('probe builders', () => {
    it('preserves the exact --format strings for ps queries', () => {
      expect(RemoteDocker.runningContainers()).toBe(
        "docker ps --format '{{.Names}}'"
      );
      expect(RemoteDocker.exitedContainers()).toBe(
        "docker ps -a --filter status=exited --format '{{.Names}}'"
      );
    });

    it('builds the docker-info reachability check', () => {
      expect(RemoteDocker.dockerInfoCheck()).toBe(
        'docker info > /dev/null 2>&1 && echo ok || echo no_docker'
      );
    });
  });
});
