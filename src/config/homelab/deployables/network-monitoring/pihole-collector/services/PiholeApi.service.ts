import PiholeCollectorConfigService from './PiholeCollectorConfig.service.js';
import PiholeCollectorTypeGuardService from './PiholeCollectorTypeGuard.service.js';
import {
  PiholeApiDevice,
  PiholeApiDeviceAddress,
  PiholeApiQuery,
  PiholeApiSettings
} from '../types.js';

/**
 * A page of queries from `GET /api/queries`.
 */
type QueriesResponse = {
  queries: PiholeApiQuery[];
  /** Number of queries matching the filters, which can exceed `queries.length`. */
  recordsFiltered: number;
  /** Earliest query time held in Pi-hole's in-memory database. */
  earliestInMemory: number;
  /** Earliest query time held in Pi-hole's on-disk database. */
  earliestOnDisk: number;
};

/**
 * Reads Pi-hole's query log and network table through its API, keeping one
 * login session alive across requests. Pi-hole caps concurrent sessions, so the
 * session is reused and closed on shutdown rather than opened per request.
 *
 * Pi-hole API reference: the instance serves its own OpenAPI docs at
 * `/api/docs`.
 */
export default class PiholeApiService {
  /**
   * Most queries one request may return. Far above a real hour of traffic; a
   * range that exceeds it fails rather than being counted short.
   */
  static readonly #QUERY_LIMIT = 1_000_000;
  /** Most devices, and addresses per device, read from Pi-hole's network table. */
  static readonly #DEVICE_LIMIT = 10_000;

  static #settings: PiholeApiSettings | null = null;
  static #sid: string | null = null;
  /**
   * Earliest query time in Pi-hole's in-memory database, from the latest
   * response. Ranges before it are read from disk. Starts at infinity so the
   * first request reads from disk.
   */
  static #earliestInMemory = Number.POSITIVE_INFINITY;

  /**
   * Returns every query in `[from, until)`.
   *
   * @param from range start, in seconds since the epoch
   * @param until range end (exclusive), in seconds since the epoch
   */
  static async getQueries(
    from: number,
    until: number
  ): Promise<PiholeApiQuery[]> {
    const params = new URLSearchParams({
      from: String(from),
      until: String(until),
      length: String(this.#QUERY_LIMIT),
      disk: String(from < this.#earliestInMemory)
    });
    const response = this.#toQueriesResponse(
      await this.#get(`/api/queries?${params}`)
    );
    this.#earliestInMemory = response.earliestInMemory;
    if (response.recordsFiltered > response.queries.length) {
      throw new Error(
        `Pi-hole returned ${response.queries.length} of ${response.recordsFiltered} queries for ${from}-${until}`
      );
    }
    // Pi-hole's range bounds are not documented as exclusive, so the end is
    // trimmed here to keep adjacent ranges from counting a query twice.
    return response.queries.filter(({ time }) => time >= from && time < until);
  }

  /**
   * Returns every device in Pi-hole's network table, with all of its IPs.
   */
  static async getDevices(): Promise<PiholeApiDevice[]> {
    const params = new URLSearchParams({
      max_devices: String(this.#DEVICE_LIMIT),
      max_addresses: String(this.#DEVICE_LIMIT)
    });
    const body = await this.#get(`/api/network/devices?${params}`);
    if (
      !PiholeCollectorTypeGuardService.isRecord(body) ||
      !Array.isArray(body.devices)
    ) {
      throw new Error('Unexpected Pi-hole /api/network/devices response');
    }
    return body.devices
      .map((device) => this.#toDevice(device))
      .filter((device) => device !== null);
  }

  /**
   * Returns the time of the oldest query in Pi-hole's on-disk database.
   */
  static async getEarliestOnDisk(): Promise<number> {
    const response = this.#toQueriesResponse(
      await this.#get('/api/queries?length=1&disk=true')
    );
    return response.earliestOnDisk;
  }

  /**
   * Ends the login session, freeing its slot.
   */
  static async logout(): Promise<void> {
    if (!this.#sid) return;
    await fetch(new URL('/api/auth', this.#getSettings().url), {
      method: 'DELETE',
      headers: { sid: this.#sid }
    });
    this.#sid = null;
  }

  /**
   * Narrows the body of `GET /api/queries`.
   *
   * @param body the parsed JSON body
   */
  static #toQueriesResponse(body: unknown): QueriesResponse {
    if (
      !PiholeCollectorTypeGuardService.isRecord(body) ||
      !Array.isArray(body.queries) ||
      typeof body.recordsFiltered !== 'number' ||
      typeof body.earliest_timestamp !== 'number' ||
      typeof body.earliest_timestamp_disk !== 'number'
    ) {
      throw new Error('Unexpected Pi-hole /api/queries response');
    }
    return {
      queries: body.queries
        .map((query) => this.#toQuery(query))
        .filter((query) => query !== null),
      recordsFiltered: body.recordsFiltered,
      earliestInMemory: body.earliest_timestamp,
      earliestOnDisk: body.earliest_timestamp_disk
    };
  }

  /**
   * Narrows one entry of Pi-hole's `queries` array, or returns null when it
   * lacks a field the collector needs.
   *
   * @param value one raw entry
   */
  static #toQuery(value: unknown): PiholeApiQuery | null {
    if (
      !PiholeCollectorTypeGuardService.isRecord(value) ||
      !PiholeCollectorTypeGuardService.isRecord(value.client)
    ) {
      return null;
    }
    const { time, domain, status } = value;
    const { ip } = value.client;
    if (
      typeof time !== 'number' ||
      typeof domain !== 'string' ||
      typeof ip !== 'string'
    ) {
      return null;
    }
    return {
      time,
      domain,
      status: typeof status === 'string' ? status : null,
      client: { ip }
    };
  }

  /**
   * Narrows one entry of Pi-hole's `devices` array, or returns null when it
   * lacks a field the collector needs.
   *
   * @param value one raw entry
   */
  static #toDevice(value: unknown): PiholeApiDevice | null {
    if (
      !PiholeCollectorTypeGuardService.isRecord(value) ||
      !Array.isArray(value.ips)
    ) {
      return null;
    }
    const { hwaddr, firstSeen, macVendor } = value;
    if (typeof hwaddr !== 'string' || typeof firstSeen !== 'number') {
      return null;
    }
    return {
      hwaddr,
      firstSeen,
      macVendor: typeof macVendor === 'string' ? macVendor : null,
      ips: value.ips
        .map((address) => this.#toDeviceAddress(address))
        .filter((address) => address !== null)
    };
  }

  /**
   * Narrows one address of a Pi-hole device, or returns null when it lacks a
   * field the collector needs.
   *
   * @param value one raw entry
   */
  static #toDeviceAddress(value: unknown): PiholeApiDeviceAddress | null {
    if (!PiholeCollectorTypeGuardService.isRecord(value)) return null;
    const { ip, name, lastSeen } = value;
    if (typeof ip !== 'string' || typeof lastSeen !== 'number') return null;
    return { ip, name: typeof name === 'string' ? name : null, lastSeen };
  }

  /**
   * GETs an API path, logging in first when there is no session and once more
   * when the session has expired.
   *
   * @param path the path and query string
   */
  static async #get(path: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      this.#sid ??= await this.#login();
      const response = await fetch(new URL(path, this.#getSettings().url), {
        headers: { sid: this.#sid }
      });
      if (response.status === 401 && attempt === 0) {
        this.#sid = null;
        continue;
      }
      if (!response.ok) {
        throw new Error(
          `Pi-hole ${path} failed (HTTP ${response.status}): ${await response.text()}`
        );
      }
      return response.json();
    }
  }

  /**
   * Logs in and returns the session ID.
   */
  static async #login(): Promise<string> {
    const { url, password } = this.#getSettings();
    const response = await fetch(new URL('/api/auth', url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const body: unknown = await response.json();
    const sid =
      PiholeCollectorTypeGuardService.isRecord(body) &&
      PiholeCollectorTypeGuardService.isRecord(body.session)
        ? body.session.sid
        : null;
    if (!response.ok || typeof sid !== 'string') {
      throw new Error(`Pi-hole login failed (HTTP ${response.status})`);
    }
    return sid;
  }

  /**
   * Returns Pi-hole's connection settings, reading them on first use.
   */
  static #getSettings(): PiholeApiSettings {
    this.#settings ??= PiholeCollectorConfigService.getPiholeSettings();
    return this.#settings;
  }
}
