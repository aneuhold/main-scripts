import { PiholeCollectorDeviceDirectory } from '../PiholeCollectorDeviceDirectory.js';
import {
  PiholeCollectorDeviceMinuteCount,
  PiholeCollectorMinuteCounts,
  PiholeApiQuery,
  PiholeCollectorSiteMinuteCount
} from '../types.js';

/**
 * Turns Pi-hole queries into per-minute lookup counts.
 */
export default class PiholeCollectorQueryCounterService {
  /**
   * Query statuses Pi-hole counts as blocked. Matches the `blocked` total of
   * Pi-hole's `GET /api/stats/summary`, which includes `SPECIAL_DOMAIN`.
   */
  static readonly #BLOCKED_STATUSES = new Set([
    'GRAVITY',
    'REGEX',
    'DENYLIST',
    'GRAVITY_CNAME',
    'REGEX_CNAME',
    'DENYLIST_CNAME',
    'EXTERNAL_BLOCKED_IP',
    'EXTERNAL_BLOCKED_NULL',
    'EXTERNAL_BLOCKED_NXRA',
    'EXTERNAL_BLOCKED_EDE15',
    'SPECIAL_DOMAIN'
  ]);

  /**
   * Second-level labels that sit under a two-letter country TLD as part of the
   * public suffix (e.g. `co.uk`, `com.au`), so the site keeps three labels.
   */
  static readonly #COUNTRY_SECOND_LEVEL_LABELS = new Set([
    'ac',
    'co',
    'com',
    'edu',
    'gov',
    'ne',
    'net',
    'or',
    'org'
  ]);

  /**
   * Counts queries per device and per device and site, in one-minute buckets.
   *
   * @param queries the queries to count
   * @param directory identifies the device behind each client IP
   */
  static count(
    queries: PiholeApiQuery[],
    directory: PiholeCollectorDeviceDirectory
  ): PiholeCollectorMinuteCounts {
    const devices = new Map<string, PiholeCollectorDeviceMinuteCount>();
    const sites = new Map<string, PiholeCollectorSiteMinuteCount>();
    for (const { time, domain, status, client } of queries) {
      const minute = Math.floor(time / 60) * 60;
      const { ip } = client;
      const device = directory.getDevice(ip, time);
      const deviceKey = `${minute}|${device}|${ip}`;
      const deviceCount = devices.get(deviceKey) ?? {
        minute,
        device,
        ip,
        queries: 0,
        blocked: 0
      };
      deviceCount.queries += 1;
      if (status !== null && this.#BLOCKED_STATUSES.has(status)) {
        deviceCount.blocked += 1;
      }
      devices.set(deviceKey, deviceCount);

      const site = this.toSite(domain);
      const siteKey = `${deviceKey}|${site}`;
      const siteCount = sites.get(siteKey) ?? {
        minute,
        device,
        ip,
        site,
        queries: 0
      };
      siteCount.queries += 1;
      sites.set(siteKey, siteCount);
    }
    return { devices: [...devices.values()], sites: [...sites.values()] };
  }

  /**
   * Collapses a domain to the site it belongs to: its last two labels, or three
   * under a country suffix like `co.uk`. Keeps InfluxDB's series count bounded,
   * since many services use random subdomains (e.g.
   * `rr3---sn-abc.googlevideo.com` becomes `googlevideo.com`). A heuristic, not
   * the Public Suffix List.
   *
   * @param domain the queried domain
   */
  static toSite(domain: string): string {
    const labels = domain
      .toLowerCase()
      .split('.')
      .filter((label) => label !== '');
    if (labels.length === 0) return '.';
    const tld = labels[labels.length - 1];
    const secondLevel = labels[labels.length - 2] ?? '';
    const kept =
      tld.length === 2 && this.#COUNTRY_SECOND_LEVEL_LABELS.has(secondLevel)
        ? 3
        : 2;
    return labels.slice(-kept).join('.');
  }
}
