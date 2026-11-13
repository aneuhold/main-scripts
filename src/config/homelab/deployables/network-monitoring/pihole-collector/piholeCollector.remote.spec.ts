import { describe, expect, it } from 'vitest';
import {
  countQueries,
  PiholeQuery,
  toLineProtocol,
  toSite
} from './piholeCollector.remote.js';

/** Start of a minute, in seconds since the epoch. */
const MINUTE = 1700000040;

/**
 * Builds a Pi-hole query with defaults for the fields a test does not care
 * about.
 *
 * @param overrides fields to set
 */
const query = (overrides: Partial<PiholeQuery> = {}): PiholeQuery => ({
  time: MINUTE + 0.5,
  domain: 'example.com',
  status: 'FORWARDED',
  client: { ip: '192.168.0.51', name: 'desk' },
  ...overrides
});

describe('toSite', () => {
  it('keeps the last two labels', () => {
    expect(toSite('rr3---sn-abc.googlevideo.com')).toBe('googlevideo.com');
  });

  it('keeps three labels under a country second-level suffix', () => {
    expect(toSite('www.bbc.co.uk')).toBe('bbc.co.uk');
  });

  it('keeps two labels under a plain country TLD', () => {
    expect(toSite('api.example.io')).toBe('example.io');
  });

  it('lowercases and ignores a trailing dot', () => {
    expect(toSite('Meet.Google.COM.')).toBe('google.com');
  });

  it('returns a single-label domain as-is and an empty one as the root', () => {
    expect(toSite('wpad')).toBe('wpad');
    expect(toSite('')).toBe('.');
  });
});

describe('countQueries', () => {
  it('counts lookups and blocks per device and minute', () => {
    const { devices } = countQueries([
      query({ time: MINUTE }),
      query({ time: MINUTE + 59.9, status: 'GRAVITY' }),
      query({ time: MINUTE + 60 }),
      query({
        status: 'SPECIAL_DOMAIN',
        client: { ip: '192.168.0.9', name: null }
      })
    ]);
    expect(devices).toEqual([
      {
        minute: MINUTE,
        ip: '192.168.0.51',
        name: 'desk',
        queries: 2,
        blocked: 1
      },
      {
        minute: MINUTE + 60,
        ip: '192.168.0.51',
        name: 'desk',
        queries: 1,
        blocked: 0
      },
      {
        minute: MINUTE,
        ip: '192.168.0.9',
        name: '192.168.0.9',
        queries: 1,
        blocked: 1
      }
    ]);
  });

  it('counts lookups per device, site, and minute', () => {
    const { sites } = countQueries([
      query({ domain: 'meet.google.com' }),
      query({ domain: 'apis.google.com' }),
      query({ domain: 'example.com' })
    ]);
    expect(sites).toEqual([
      {
        minute: MINUTE,
        ip: '192.168.0.51',
        name: 'desk',
        site: 'google.com',
        queries: 2
      },
      {
        minute: MINUTE,
        ip: '192.168.0.51',
        name: 'desk',
        site: 'example.com',
        queries: 1
      }
    ]);
  });
});

describe('toLineProtocol', () => {
  it('renders device and site points with escaped tags', () => {
    expect(
      toLineProtocol({
        devices: [
          {
            minute: MINUTE,
            ip: '192.168.0.51',
            name: 'BIG RED',
            queries: 3,
            blocked: 1
          }
        ],
        sites: [
          {
            minute: MINUTE,
            ip: '192.168.0.51',
            name: 'BIG RED',
            site: 'google.com',
            queries: 3
          }
        ]
      })
    ).toBe(
      [
        `dns,ip=192.168.0.51,name=BIG\\ RED queries=3i,blocked=1i ${MINUTE}`,
        `dns_domain,ip=192.168.0.51,name=BIG\\ RED,site=google.com queries=3i ${MINUTE}`
      ].join('\n')
    );
  });
});
