import { describe, expect, it } from 'vitest';
import { PiholeCollectorDeviceDirectory } from './PiholeCollectorDeviceDirectory.js';
import { PiholeApiDevice } from './types.js';

/** A time, in seconds since the epoch. */
const MINUTE = 1700000040;
const DESK_MAC = 'aa:bb:cc:00:00:01';
const LIGHTS_MAC = 'aa:bb:cc:00:00:02';

/**
 * Builds a Pi-hole device with defaults for the fields a test does not care
 * about.
 *
 * @param overrides fields to set
 */
const piholeDevice = (
  overrides: Partial<PiholeApiDevice> = {}
): PiholeApiDevice => ({
  hwaddr: DESK_MAC,
  firstSeen: MINUTE - 1000,
  macVendor: 'Desk Maker',
  ips: [{ ip: '192.168.0.51', name: 'desk', lastSeen: MINUTE + 1000 }],
  ...overrides
});

describe('PiholeCollectorDeviceDirectory', () => {
  describe('getDevice', () => {
    it('gives each IPv4 address the span since the previous one was last seen', () => {
      const directory = new PiholeCollectorDeviceDirectory(
        [
          piholeDevice({
            ips: [
              { ip: '192.168.0.130', name: null, lastSeen: 2000 },
              { ip: '192.168.0.117', name: null, lastSeen: 3000 },
              { ip: '192.168.0.116', name: null, lastSeen: 4000 }
            ],
            firstSeen: 1000
          })
        ],
        {}
      );
      expect(directory.getDevice('192.168.0.130', 999)).toBe('192.168.0.130');
      expect(directory.getDevice('192.168.0.130', 1500)).toBe(DESK_MAC);
      expect(directory.getDevice('192.168.0.117', 1500)).toBe('192.168.0.117');
      expect(directory.getDevice('192.168.0.117', 2500)).toBe(DESK_MAC);
      expect(directory.getDevice('192.168.0.117', 3500)).toBe('192.168.0.117');
      expect(directory.getDevice('192.168.0.116', 3500)).toBe(DESK_MAC);
      expect(directory.getDevice('192.168.0.116', 9999)).toBe(DESK_MAC);
    });

    it('gives IPv4 addresses last seen at the same moment the same span', () => {
      const directory = new PiholeCollectorDeviceDirectory(
        [
          piholeDevice({
            firstSeen: 1000,
            ips: [
              { ip: '192.168.0.213', name: null, lastSeen: 2000 },
              { ip: '192.168.0.168', name: null, lastSeen: 2000 },
              { ip: '192.168.0.166', name: null, lastSeen: 3000 }
            ]
          })
        ],
        {}
      );
      expect(directory.getDevice('192.168.0.213', 1500)).toBe(DESK_MAC);
      expect(directory.getDevice('192.168.0.168', 1500)).toBe(DESK_MAC);
      expect(directory.getDevice('192.168.0.168', 2500)).toBe('192.168.0.168');
      expect(directory.getDevice('192.168.0.166', 2500)).toBe(DESK_MAC);
    });

    it("gives IPv6 addresses the device's whole history", () => {
      const directory = new PiholeCollectorDeviceDirectory(
        [
          piholeDevice({
            firstSeen: 1000,
            ips: [
              { ip: '192.168.0.51', name: null, lastSeen: 5000 },
              { ip: 'fe80::1', name: null, lastSeen: 2000 }
            ]
          })
        ],
        {}
      );
      expect(directory.getDevice('fe80::1', 4000)).toBe(DESK_MAC);
    });

    it('keeps the IP for addresses no device holds', () => {
      const directory = new PiholeCollectorDeviceDirectory(
        [
          piholeDevice({
            hwaddr: 'ip-127.0.0.1',
            ips: [{ ip: '127.0.0.1', name: 'localhost', lastSeen: MINUTE }]
          })
        ],
        {}
      );
      expect(directory.getDevice('127.0.0.1', MINUTE)).toBe('127.0.0.1');
      expect(directory.getDevice('192.168.0.9', MINUTE)).toBe('192.168.0.9');
    });
  });

  describe('deviceInfos', () => {
    it('prefers configured names, then the newest resolved hostname, then the MAC', () => {
      const directory = new PiholeCollectorDeviceDirectory(
        [
          piholeDevice({
            ips: [
              { ip: '192.168.0.51', name: 'old-desk', lastSeen: 1000 },
              { ip: '192.168.0.52', name: 'desk', lastSeen: 2000 },
              { ip: '192.168.0.53', name: null, lastSeen: 3000 }
            ]
          }),
          piholeDevice({
            hwaddr: LIGHTS_MAC.toUpperCase(),
            macVendor: null,
            ips: [{ ip: '192.168.0.190', name: 'Old-Phone', lastSeen: 1000 }]
          }),
          piholeDevice({
            hwaddr: 'aa:bb:cc:00:00:03',
            ips: [{ ip: '192.168.0.60', name: null, lastSeen: 1000 }]
          })
        ],
        {
          [LIGHTS_MAC.toUpperCase()]: 'Hex Lights',
          'aa:bb:cc:00:00:04': 'Gone'
        }
      );
      expect(directory.deviceInfos).toEqual([
        { device: DESK_MAC, name: 'desk', vendor: 'Desk Maker' },
        { device: LIGHTS_MAC, name: 'Hex Lights', vendor: null },
        {
          device: 'aa:bb:cc:00:00:03',
          name: 'aa:bb:cc:00:00:03',
          vendor: 'Desk Maker'
        },
        { device: 'aa:bb:cc:00:00:04', name: 'Gone', vendor: null }
      ]);
    });

    it('appends the end of the MAC address to names shared by several devices', () => {
      const directory = new PiholeCollectorDeviceDirectory(
        [
          piholeDevice(),
          piholeDevice({ hwaddr: LIGHTS_MAC }),
          piholeDevice({
            hwaddr: 'aa:bb:cc:00:00:03',
            ips: [{ ip: '192.168.0.60', name: 'lights', lastSeen: 1000 }]
          })
        ],
        {}
      );
      expect(directory.deviceInfos.map(({ name }) => name)).toEqual([
        'desk (00:00:01)',
        'desk (00:00:02)',
        'lights'
      ]);
    });
  });
});
