/**
 * Copies Pi-hole's DNS query log into InfluxDB as per-minute lookup counts, per
 * device and per device and site. Runs on the monitoring host in a plain `node`
 * container, which executes this file directly through Node's type stripping.
 * It therefore uses only Node built-ins and erasable TypeScript syntax (no
 * enums), see: https://nodejs.org/api/typescript.html#type-stripping
 *
 * Each pass counts every complete minute since the last one written. On the
 * first start the bucket is empty, so the first pass walks back through all of
 * Pi-hole's on-disk history one hour at a time. A minute's counts are complete
 * when written, so writing a minute again overwrites it with the same values.
 * That makes resuming after a restart safe.
 *
 * Pi-hole API reference: the instance serves its own OpenAPI docs at
 * `/api/docs`.
 */
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/**
 * Lookup counts for every device and site seen in a range of queries.
 */
export type MinuteCounts = {
  devices: DeviceMinuteCount[];
  sites: SiteMinuteCount[];
};

/**
 * Lookups one device made in one minute.
 */
export type DeviceMinuteCount = {
  /** Start of the minute, in seconds since the epoch. */
  minute: number;
  ip: string;
  /** Pi-hole's hostname for the device, or its IP when it has none. */
  name: string;
  queries: number;
  blocked: number;
};

/**
 * Lookups one device made for one site in one minute.
 */
export type SiteMinuteCount = {
  minute: number;
  ip: string;
  name: string;
  /** The domain collapsed by {@link toSite}. */
  site: string;
  queries: number;
};

/**
 * One query from Pi-hole's `GET /api/queries`, narrowed to the fields used
 * here.
 */
export type PiholeQuery = {
  /** Seconds since the epoch, with a fractional part. */
  time: number;
  domain: string;
  status: string | null;
  client: { ip: string; name: string | null };
};

/**
 * A page of queries from `GET /api/queries`.
 */
type QueriesResponse = {
  queries: PiholeQuery[];
  /** Number of queries matching the filters, which can exceed `queries.length`. */
  recordsFiltered: number;
  /** Earliest query time held in Pi-hole's in-memory database. */
  earliestInMemory: number;
  /** Earliest query time held in Pi-hole's on-disk database. */
  earliestOnDisk: number;
};

/**
 * Connection settings, read from the container's environment.
 */
type CollectorEnv = {
  piholeUrl: string;
  piholePassword: string;
  influxUrl: string;
  influxToken: string;
  influxOrg: string;
  influxBucket: string;
};

/**
 * Query statuses Pi-hole counts as blocked. Matches the `blocked` total of
 * Pi-hole's `GET /api/stats/summary`, which includes `SPECIAL_DOMAIN`.
 */
const BLOCKED_STATUSES = new Set([
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
const COUNTRY_SECOND_LEVEL_LABELS = new Set([
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

/** Largest span of history read from Pi-hole in one request. */
const CHUNK_SECONDS = 60 * 60;
/**
 * Most queries one request may return. Far above a real hour of traffic; a
 * range that exceeds it fails rather than being counted short.
 */
const QUERY_LIMIT = 1_000_000;
/** Pause after each minute boundary before counting the minute that ended. */
const SETTLE_MS = 5_000;

/**
 * Collapses a domain to the site it belongs to: its last two labels, or three
 * under a country suffix like `co.uk`. Keeps InfluxDB's series count bounded,
 * since many services use random subdomains (e.g. `rr3---sn-abc.googlevideo.com`
 * becomes `googlevideo.com`). A heuristic, not the Public Suffix List.
 *
 * @param domain the queried domain
 */
export const toSite = (domain: string): string => {
  const labels = domain
    .toLowerCase()
    .split('.')
    .filter((label) => label !== '');
  if (labels.length === 0) return '.';
  const tld = labels[labels.length - 1];
  const secondLevel = labels[labels.length - 2] ?? '';
  const kept =
    tld.length === 2 && COUNTRY_SECOND_LEVEL_LABELS.has(secondLevel) ? 3 : 2;
  return labels.slice(-kept).join('.');
};

/**
 * Counts queries per device and per device and site, in one-minute buckets.
 *
 * @param queries the queries to count
 */
export const countQueries = (queries: PiholeQuery[]): MinuteCounts => {
  const devices = new Map<string, DeviceMinuteCount>();
  const sites = new Map<string, SiteMinuteCount>();
  for (const { time, domain, status, client } of queries) {
    const minute = Math.floor(time / 60) * 60;
    const { ip } = client;
    const name = client.name || ip;
    const deviceKey = `${minute}|${ip}|${name}`;
    const device = devices.get(deviceKey) ?? {
      minute,
      ip,
      name,
      queries: 0,
      blocked: 0
    };
    device.queries += 1;
    if (status !== null && BLOCKED_STATUSES.has(status)) {
      device.blocked += 1;
    }
    devices.set(deviceKey, device);

    const site = toSite(domain);
    const siteKey = `${deviceKey}|${site}`;
    const siteCount = sites.get(siteKey) ?? {
      minute,
      ip,
      name,
      site,
      queries: 0
    };
    siteCount.queries += 1;
    sites.set(siteKey, siteCount);
  }
  return { devices: [...devices.values()], sites: [...sites.values()] };
};

/**
 * Escapes an InfluxDB line protocol tag value. Device names and sites can
 * contain spaces, commas, and equals signs.
 *
 * @param value the raw tag value
 */
const escapeTag = (value: string): string => value.replace(/[ ,=\\]/g, '\\$&');

/**
 * Renders counts as InfluxDB line protocol: a `dns` point per device and minute,
 * and a `dns_domain` point per device, site, and minute.
 *
 * @param counts the counts to render
 */
export const toLineProtocol = (counts: MinuteCounts): string =>
  [
    ...counts.devices.map(
      ({ minute, ip, name, queries, blocked }) =>
        `dns,ip=${escapeTag(ip)},name=${escapeTag(name)} queries=${queries}i,blocked=${blocked}i ${minute}`
    ),
    ...counts.sites.map(
      ({ minute, ip, name, site, queries }) =>
        `dns_domain,ip=${escapeTag(ip)},name=${escapeTag(name)},site=${escapeTag(site)} queries=${queries}i ${minute}`
    )
  ].join('\n');

/**
 * Narrows an unknown value to a plain object.
 *
 * @param value the value to narrow
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Narrows one entry of Pi-hole's `queries` array, or returns null when it lacks
 * a field this collector needs.
 *
 * @param value one raw entry
 */
const toPiholeQuery = (value: unknown): PiholeQuery | null => {
  if (!isRecord(value) || !isRecord(value.client)) return null;
  const { time, domain, status } = value;
  const { ip, name } = value.client;
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
    client: { ip, name: typeof name === 'string' ? name : null }
  };
};

/**
 * Narrows the body of `GET /api/queries`.
 *
 * @param body the parsed JSON body
 */
const toQueriesResponse = (body: unknown): QueriesResponse => {
  if (
    !isRecord(body) ||
    !Array.isArray(body.queries) ||
    typeof body.recordsFiltered !== 'number' ||
    typeof body.earliest_timestamp !== 'number' ||
    typeof body.earliest_timestamp_disk !== 'number'
  ) {
    throw new Error('Unexpected Pi-hole /api/queries response');
  }
  return {
    queries: body.queries.map(toPiholeQuery).filter((query) => query !== null),
    recordsFiltered: body.recordsFiltered,
    earliestInMemory: body.earliest_timestamp,
    earliestOnDisk: body.earliest_timestamp_disk
  };
};

/**
 * Reads Pi-hole's query log through its API, keeping one login session alive
 * across requests. Pi-hole caps concurrent sessions, so the session is reused
 * and closed on shutdown rather than opened per request.
 */
class PiholeClient {
  #url: string;
  #password: string;
  #sid: string | null = null;
  /**
   * Earliest query time in Pi-hole's in-memory database, from the latest
   * response. Ranges before it are read from disk. Starts at infinity so the
   * first request reads from disk.
   */
  #earliestInMemory = Number.POSITIVE_INFINITY;

  /**
   * @param url Pi-hole's base URL, without the `/api` path
   * @param password Pi-hole's web password
   */
  constructor(url: string, password: string) {
    this.#url = url;
    this.#password = password;
  }

  /**
   * Returns every query in `[from, until)`.
   *
   * @param from range start, in seconds since the epoch
   * @param until range end (exclusive), in seconds since the epoch
   */
  async getQueries(from: number, until: number): Promise<PiholeQuery[]> {
    const params = new URLSearchParams({
      from: String(from),
      until: String(until),
      length: String(QUERY_LIMIT),
      disk: String(from < this.#earliestInMemory)
    });
    const response = toQueriesResponse(
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
   * Returns the time of the oldest query in Pi-hole's on-disk database.
   */
  async getEarliestOnDisk(): Promise<number> {
    const response = toQueriesResponse(
      await this.#get('/api/queries?length=1&disk=true')
    );
    return response.earliestOnDisk;
  }

  /**
   * Ends the login session, freeing its slot.
   */
  async logout(): Promise<void> {
    if (!this.#sid) return;
    await fetch(new URL('/api/auth', this.#url), {
      method: 'DELETE',
      headers: { sid: this.#sid }
    });
    this.#sid = null;
  }

  /**
   * GETs an API path, logging in first when there is no session and once more
   * when the session has expired.
   *
   * @param path the path and query string
   */
  async #get(path: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      this.#sid ??= await this.#login();
      const response = await fetch(new URL(path, this.#url), {
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
  async #login(): Promise<string> {
    const response = await fetch(new URL('/api/auth', this.#url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: this.#password })
    });
    const body: unknown = await response.json();
    const sid =
      isRecord(body) && isRecord(body.session) ? body.session.sid : null;
    if (!response.ok || typeof sid !== 'string') {
      throw new Error(`Pi-hole login failed (HTTP ${response.status})`);
    }
    return sid;
  }
}

/**
 * Reads a required environment variable, throwing when it is unset.
 *
 * @param name the variable name
 */
const readEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

/**
 * Returns the start of the latest minute written to the bucket, or null when
 * the bucket is empty.
 *
 * @param env connection settings
 */
const getLatestWrittenMinute = async (
  env: CollectorEnv
): Promise<number | null> => {
  const url = new URL('/api/v2/query', env.influxUrl);
  url.searchParams.set('org', env.influxOrg);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${env.influxToken}`,
      Accept: 'application/csv',
      'Content-Type': 'application/vnd.flux'
    },
    body: [
      `from(bucket: "${env.influxBucket}")`,
      '  |> range(start: 1970-01-01T00:00:00Z)',
      '  |> filter(fn: (r) => r._measurement == "dns" and r._field == "queries")',
      '  |> group()',
      '  |> last()',
      '  |> keep(columns: ["_time"])'
    ].join('\n')
  });
  if (!response.ok) {
    throw new Error(
      `InfluxDB query failed (HTTP ${response.status}): ${await response.text()}`
    );
  }
  // Plain CSV without annotations: a header row naming `_time`, then at most
  // one data row.
  const [header, row] = (await response.text())
    .split(/\r?\n/)
    .filter((line) => line !== '');
  if (!header || !row) return null;
  const time = row.split(',')[header.split(',').indexOf('_time')];
  return time ? Date.parse(time) / 1000 : null;
};

/**
 * Writes counts to InfluxDB. Skips the request when there is nothing to write.
 *
 * @param env connection settings
 * @param counts the counts to write
 */
const writeCounts = async (env: CollectorEnv, counts: MinuteCounts) => {
  if (counts.devices.length === 0) return;
  const url = new URL('/api/v2/write', env.influxUrl);
  url.searchParams.set('org', env.influxOrg);
  url.searchParams.set('bucket', env.influxBucket);
  url.searchParams.set('precision', 's');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Token ${env.influxToken}` },
    body: toLineProtocol(counts)
  });
  if (!response.ok) {
    throw new Error(
      `InfluxDB write failed (HTTP ${response.status}): ${await response.text()}`
    );
  }
};

/**
 * Returns where counting starts: the latest minute already written, or the
 * start of Pi-hole's on-disk history when the bucket is empty.
 *
 * @param env connection settings
 * @param pihole the Pi-hole client
 */
const getStartMinute = async (
  env: CollectorEnv,
  pihole: PiholeClient
): Promise<number> => {
  const latest = await getLatestWrittenMinute(env);
  if (latest !== null) return latest;
  const earliest = await pihole.getEarliestOnDisk();
  console.log(
    `Bucket is empty; backfilling from ${new Date(earliest * 1000).toISOString()}`
  );
  return Math.floor(earliest / 60) * 60;
};

/**
 * Counts and writes every complete minute from the cursor on, then waits for
 * the next minute boundary, forever. A failed range is retried on the next
 * pass.
 */
const main = async () => {
  const env: CollectorEnv = {
    piholeUrl: readEnv('PIHOLE_URL'),
    piholePassword: readEnv('PIHOLE_PASSWORD'),
    influxUrl: readEnv('INFLUX_URL'),
    influxToken: readEnv('INFLUX_TOKEN'),
    influxOrg: readEnv('INFLUX_ORG'),
    influxBucket: readEnv('INFLUX_BUCKET')
  };
  const pihole = new PiholeClient(env.piholeUrl, env.piholePassword);
  process.on('SIGTERM', () => {
    pihole
      .logout()
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => process.exit(0));
  });

  let cursor: number | null = null;
  for (;;) {
    try {
      cursor ??= await getStartMinute(env, pihole);
      const currentMinute = Math.floor(Date.now() / 60_000) * 60;
      while (cursor < currentMinute) {
        const until = Math.min(cursor + CHUNK_SECONDS, currentMinute);
        const counts = countQueries(await pihole.getQueries(cursor, until));
        await writeCounts(env, counts);
        console.log(
          `Wrote ${counts.devices.length} device and ${counts.sites.length} site counts up to ${new Date(until * 1000).toISOString()}`
        );
        cursor = until;
      }
    } catch (error) {
      console.error(error);
    }
    await setTimeout(60_000 - (Date.now() % 60_000) + SETTLE_MS);
  }
};

// Run only when executed directly, so tests can import the counting helpers.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
