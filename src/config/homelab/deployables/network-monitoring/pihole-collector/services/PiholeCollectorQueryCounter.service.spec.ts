import { describe, expect, it } from 'vitest';
import { PiholeCollectorDeviceDirectory } from '../PiholeCollectorDeviceDirectory.js';
import PiholeCollectorQueryCounterService from './PiholeCollectorQueryCounter.service.js';
import { PiholeApiQuery } from '../types.js';

/** Start of a minute, in seconds since the epoch. */
const MINUTE = 1700000040;
const DESK_MAC = 'aa:bb:cc:00:00:01';

/**
 * Builds a Pi-hole query with defaults for the fields a test does not care
 * about.
 *
 * @param overrides fields to set
 */
const query = (overrides: Partial<PiholeApiQuery> = {}): PiholeApiQuery => ({
  time: MINUTE + 0.5,
  domain: 'example.com',
  status: 'FORWARDED',
  client: { ip: '192.168.0.51' },
  ...overrides
});

describe('PiholeCollectorQueryCounterService', () => {
  describe('count', () => {
    const directory = new PiholeCollectorDeviceDirectory(
      [
        {
          hwaddr: DESK_MAC,
          firstSeen: MINUTE - 1000,
          macVendor: null,
          ips: [{ ip: '192.168.0.51', name: 'desk', lastSeen: MINUTE + 1000 }]
        }
      ],
      {}
    );

    it('counts lookups and blocks per device, IP, and minute', () => {
      const { devices } = PiholeCollectorQueryCounterService.count(
        [
          query({ time: MINUTE }),
          query({ time: MINUTE + 59.9, status: 'GRAVITY' }),
          query({ time: MINUTE + 60 }),
          query({
            status: 'SPECIAL_DOMAIN',
            client: { ip: '192.168.0.9' }
          })
        ],
        directory
      );
      expect(devices).toEqual([
        {
          minute: MINUTE,
          device: DESK_MAC,
          ip: '192.168.0.51',
          queries: 2,
          blocked: 1
        },
        {
          minute: MINUTE + 60,
          device: DESK_MAC,
          ip: '192.168.0.51',
          queries: 1,
          blocked: 0
        },
        {
          minute: MINUTE,
          device: '192.168.0.9',
          ip: '192.168.0.9',
          queries: 1,
          blocked: 1
        }
      ]);
    });

    it('counts lookups per device, IP, site, and minute', () => {
      const { sites } = PiholeCollectorQueryCounterService.count(
        [
          query({ domain: 'meet.google.com' }),
          query({ domain: 'apis.google.com' }),
          query({ domain: 'example.com' })
        ],
        directory
      );
      expect(sites).toEqual([
        {
          minute: MINUTE,
          device: DESK_MAC,
          ip: '192.168.0.51',
          site: 'google.com',
          queries: 2
        },
        {
          minute: MINUTE,
          device: DESK_MAC,
          ip: '192.168.0.51',
          site: 'example.com',
          queries: 1
        }
      ]);
    });
  });

  describe('toSite', () => {
    it('keeps the last two labels', () => {
      expect(
        PiholeCollectorQueryCounterService.toSite(
          'rr3---sn-abc.googlevideo.com'
        )
      ).toBe('googlevideo.com');
    });

    it('keeps three labels under a country second-level suffix', () => {
      expect(PiholeCollectorQueryCounterService.toSite('www.bbc.co.uk')).toBe(
        'bbc.co.uk'
      );
    });

    it('keeps two labels under a plain country TLD', () => {
      expect(PiholeCollectorQueryCounterService.toSite('api.example.io')).toBe(
        'example.io'
      );
    });

    it('lowercases and ignores a trailing dot', () => {
      expect(
        PiholeCollectorQueryCounterService.toSite('Meet.Google.COM.')
      ).toBe('google.com');
    });

    it('returns a single-label domain as-is and an empty one as the root', () => {
      expect(PiholeCollectorQueryCounterService.toSite('wpad')).toBe('wpad');
      expect(PiholeCollectorQueryCounterService.toSite('')).toBe('.');
    });
  });
});
