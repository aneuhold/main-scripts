import { describe, expect, it } from 'vitest';
import PiholeCollectorLineProtocolService from './PiholeCollectorLineProtocol.service.js';

/** Start of a minute, in seconds since the epoch. */
const MINUTE = 1700000040;
const DESK_MAC = 'aa:bb:cc:00:00:01';
const LIGHTS_MAC = 'aa:bb:cc:00:00:02';

describe('PiholeCollectorLineProtocolService', () => {
  describe('fromCounts', () => {
    it('renders device and site points with escaped tags', () => {
      expect(
        PiholeCollectorLineProtocolService.fromCounts({
          devices: [
            {
              minute: MINUTE,
              device: DESK_MAC,
              ip: '192.168.0.51',
              queries: 3,
              blocked: 1
            }
          ],
          sites: [
            {
              minute: MINUTE,
              device: DESK_MAC,
              ip: '192.168.0.51',
              site: 'my site,1',
              queries: 3
            }
          ]
        })
      ).toBe(
        [
          `dns,device=${DESK_MAC},ip=192.168.0.51 queries=3i,blocked=1i ${MINUTE}`,
          `dns_domain,device=${DESK_MAC},ip=192.168.0.51,site=my\\ site\\,1 queries=3i ${MINUTE}`
        ].join('\n')
      );
    });
  });

  describe('fromDeviceInfos', () => {
    it('renders quoted names and makers, omitting an unknown maker', () => {
      expect(
        PiholeCollectorLineProtocolService.fromDeviceInfos(
          [
            {
              device: DESK_MAC,
              name: 'Big "Red" \\ Desk',
              vendor: 'Desk Maker'
            },
            { device: LIGHTS_MAC, name: 'Hex Lights', vendor: null }
          ],
          MINUTE
        )
      ).toBe(
        [
          `device_info,device=${DESK_MAC} name="Big \\"Red\\" \\\\ Desk",vendor="Desk Maker" ${MINUTE}`,
          `device_info,device=${LIGHTS_MAC} name="Hex Lights" ${MINUTE}`
        ].join('\n')
      );
    });
  });
});
