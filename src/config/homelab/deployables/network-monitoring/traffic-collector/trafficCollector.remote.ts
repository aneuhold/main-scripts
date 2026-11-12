/**
 * Streams the EdgeRouter's Traffic Analysis byte counters into InfluxDB. Runs on
 * the monitoring host in a plain `node` container, which executes this file
 * directly through Node's type stripping. It therefore uses only Node built-ins
 * and erasable TypeScript syntax (no enums), see:
 * https://nodejs.org/api/typescript.html#type-stripping
 *
 * The router protocol below has no public documentation. It is read from the
 * router's own web UI on EdgeOS v3.0.1:
 * - Login: `login()` in `/var/www/python/edgeos_gui/views.py` on the router,
 *   routed from `POST /` in `/var/www/python/edgeos_gui/__main__.py`.
 * - Stats socket: `/etc/lighttpd/lighttpd.conf` on the router tunnels
 *   `/ws/stats` to the stats daemon's `/tmp/ubnt.socket.statsd`.
 * - Framing, subscribe, and keepalive: the `subscribe`, `send`, `clientPing`,
 *   and `parse` methods of the stats client in the UI script, served at
 *   https://192.168.0.2/lib/1758660541/js/edge.min.js (the numbered path
 *   segment changes with each firmware build).
 *
 * Protocol:
 * 1. POST the login form to `https://<router>/`. Success answers 303 and sets a
 *    `PHPSESSID` cookie.
 * 2. Open `wss://<router>/ws/stats`. Every message in both directions is framed
 *    as `<length>\n<json>`, and the session ID travels inside each JSON message.
 * 3. Subscribe to the `export` stream. Pushed frames map each LAN IP to
 *    cumulative counters per `<app>|<category>` key (the UI's
 *    `importTrafficAnalysisUser` splits it in that order), e.g.
 *    `{"export":{"192.168.0.85":{"Other|Other":{"tx_bytes":"63424","rx_bytes":"57496",...}}}}`.
 *    "Hosts only" mode reports a single `Other|Other` key per host; "Enabled"
 *    mode (DPI) reports one key per identified app. With Traffic Analysis off,
 *    no counters arrive and nothing is written.
 *
 * Device names come from reverse DNS. In the container that resolves through
 * Pi-hole, which forwards LAN lookups to the router's DHCP leases.
 *
 * The router serves a self-signed certificate, so the container sets
 * `NODE_TLS_REJECT_UNAUTHORIZED=0`.
 */
import { reverse } from 'node:dns/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/**
 * Cumulative byte counters for one host and app, as of the latest export frame.
 */
export type TrafficCounters = {
  ip: string;
  category: string;
  app: string;
  txBytes: number;
  rxBytes: number;
};

/**
 * {@link TrafficCounters} labeled with the host's device name.
 */
export type NamedTrafficCounters = TrafficCounters & {
  /** Reverse DNS name of the host, or its IP when it has none. */
  name: string;
};

/**
 * Connection settings, read from the container's environment.
 */
type CollectorEnv = {
  routerHost: string;
  routerUser: string;
  routerPassword: string;
  influxUrl: string;
  influxToken: string;
  influxOrg: string;
  influxBucket: string;
};

/**
 * Splits the router's `<length>\n<json>` stream into complete JSON payloads. One
 * websocket message can carry a partial frame or several frames, so input is
 * buffered until each declared length is satisfied.
 */
export class StatsFrameReader {
  #buffer = '';

  /**
   * Appends a websocket message and returns every frame it completed.
   *
   * @param chunk raw websocket message text
   */
  push(chunk: string): string[] {
    this.#buffer += chunk;
    const frames: string[] = [];
    for (;;) {
      // The router may send whitespace ahead of the length prefix.
      this.#buffer = this.#buffer.trimStart();
      const newline = this.#buffer.indexOf('\n');
      if (newline === -1) {
        return frames;
      }
      const end = newline + 1 + Number(this.#buffer.slice(0, newline));
      if (this.#buffer.length < end) {
        return frames;
      }
      frames.push(this.#buffer.slice(newline + 1, end));
      this.#buffer = this.#buffer.slice(end);
    }
  }
}

/**
 * Resolves host IPs to device names via reverse DNS, caching each result
 * (including misses, which fall back to the IP) so a write does not trigger a
 * lookup per host.
 */
class DeviceNameResolver {
  /** How long a resolved name is reused before it is looked up again. */
  static readonly #TTL_MS = 60 * 60_000;

  #cache = new Map<string, { name: string; expiresAt: number }>();

  /**
   * Returns the device name for an IP, or the IP itself when it has none.
   *
   * @param ip the host IP
   */
  async resolve(ip: string): Promise<string> {
    const cached = this.#cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.name;
    }
    let name = ip;
    try {
      // Resolves with at least one name, or rejects (e.g. ENOTFOUND).
      [name] = await reverse(ip);
    } catch {
      // No PTR record: keep the IP as the name.
    }
    this.#cache.set(ip, {
      name,
      expiresAt: Date.now() + DeviceNameResolver.#TTL_MS
    });
    return name;
  }
}

/** Keepalive interval; matches the router web UI's own ping. */
const PING_INTERVAL_MS = 30_000;
/** How often the latest counter snapshot is written to InfluxDB. */
const WRITE_INTERVAL_MS = 60_000;
/** Pause before logging in again after the stats socket closes or fails. */
const RECONNECT_DELAY_MS = 10_000;

/**
 * Narrows an unknown value to a plain object.
 *
 * @param value the value to narrow
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parses one stats frame into per-host, per-app counters. Returns null when the
 * frame is not an `export` update, and an empty list when it carries no hosts.
 *
 * @param frame one complete JSON payload from {@link StatsFrameReader}
 */
export const parseExportFrame = (frame: string): TrafficCounters[] | null => {
  let message: unknown;
  try {
    message = JSON.parse(frame);
  } catch {
    return null;
  }
  if (!isRecord(message) || !isRecord(message.export)) {
    return null;
  }

  const counters: TrafficCounters[] = [];
  for (const [ip, apps] of Object.entries(message.export)) {
    if (!isRecord(apps)) continue;
    for (const [key, stats] of Object.entries(apps)) {
      if (!isRecord(stats)) continue;
      const [app = 'Other', category = 'Other'] = key.split('|');
      counters.push({
        ip,
        category,
        app,
        txBytes: Number(stats.tx_bytes) || 0,
        rxBytes: Number(stats.rx_bytes) || 0
      });
    }
  }
  return counters;
};

/**
 * Escapes an InfluxDB line protocol tag value. App and category names from DPI
 * can contain spaces and commas.
 *
 * @param value the raw tag value
 */
const escapeTag = (value: string): string => value.replace(/[ ,=\\]/g, '\\$&');

/**
 * Renders counters as InfluxDB line protocol, one `traffic` point per host and
 * app. The counters are cumulative, so per-interval usage is derived at query
 * time (e.g. Flux `difference(nonNegative: true)`, which also absorbs counter
 * resets).
 *
 * @param counters the counters to render
 * @param timestampSeconds point timestamp, in seconds since the epoch
 */
export const toLineProtocol = (
  counters: NamedTrafficCounters[],
  timestampSeconds: number
): string =>
  counters
    .map(
      ({ ip, name, category, app, txBytes, rxBytes }) =>
        `traffic,ip=${escapeTag(ip)},name=${escapeTag(name)},category=${escapeTag(category)},app=${escapeTag(app)} ` +
        `tx_bytes=${txBytes}i,rx_bytes=${rxBytes}i ${timestampSeconds}`
    )
    .join('\n');

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
 * Logs in to the router web UI and returns the session ID.
 *
 * @param env connection settings
 */
const login = async (env: CollectorEnv): Promise<string> => {
  const response = await fetch(`https://${env.routerHost}/`, {
    method: 'POST',
    body: new URLSearchParams({
      username: env.routerUser,
      password: env.routerPassword
    }),
    redirect: 'manual'
  });
  const sessionId = response.headers
    .getSetCookie()
    .map((cookie) => /^PHPSESSID=([^;]+)/.exec(cookie)?.[1])
    .find((value) => value !== undefined);
  // A rejected login re-renders the login page (200) instead of redirecting.
  if (response.status !== 303 || !sessionId) {
    throw new Error(`Router login failed (HTTP ${response.status})`);
  }
  return sessionId;
};

/**
 * Labels counters with device names and writes them to InfluxDB. Skips the
 * request when there is nothing to write.
 *
 * @param env connection settings
 * @param names resolver for device names
 * @param counters the counters to write
 */
const writeCounters = async (
  env: CollectorEnv,
  names: DeviceNameResolver,
  counters: TrafficCounters[]
) => {
  if (counters.length === 0) return;

  const named = await Promise.all(
    counters.map(async (counter) => ({
      ...counter,
      name: await names.resolve(counter.ip)
    }))
  );

  const url = new URL('/api/v2/write', env.influxUrl);
  url.searchParams.set('org', env.influxOrg);
  url.searchParams.set('bucket', env.influxBucket);
  url.searchParams.set('precision', 's');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Token ${env.influxToken}` },
    body: toLineProtocol(named, Math.floor(Date.now() / 1000))
  });
  if (!response.ok) {
    throw new Error(
      `InfluxDB write failed (HTTP ${response.status}): ${await response.text()}`
    );
  }
  const hosts = new Set(counters.map(({ ip }) => ip)).size;
  console.log(`Wrote ${counters.length} counters for ${hosts} hosts`);
};

/**
 * Runs one stats session: logs in, subscribes to the `export` stream, and
 * writes the latest snapshot on a fixed interval rather than on every push, so
 * writes to the host's storage stay predictable. Resolves when the socket
 * closes.
 *
 * @param env connection settings
 * @param names resolver for device names, shared across sessions so its cache
 *   survives reconnects
 */
const runSession = async (env: CollectorEnv, names: DeviceNameResolver) => {
  const sessionId = await login(env);
  const socket = new WebSocket(`wss://${env.routerHost}/ws/stats`);
  const reader = new StatsFrameReader();
  let latest: TrafficCounters[] | null = null;

  const send = (message: Record<string, unknown>) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const json = JSON.stringify({ ...message, SESSION_ID: sessionId });
    socket.send(`${json.length}\n${json}`);
  };

  socket.addEventListener('open', () => {
    console.log(`Subscribed to Traffic Analysis on ${env.routerHost}`);
    send({ SUBSCRIBE: [{ name: 'export' }], UNSUBSCRIBE: [] });
  });
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    for (const frame of reader.push(event.data)) {
      latest = parseExportFrame(frame) ?? latest;
    }
  });

  const pingTimer = setInterval(() => {
    send({ CLIENT_PING: '' });
  }, PING_INTERVAL_MS);
  const writeTimer = setInterval(() => {
    if (!latest) return;
    const snapshot = latest;
    latest = null;
    writeCounters(env, names, snapshot).catch((error: unknown) => {
      console.error(error);
    });
  }, WRITE_INTERVAL_MS);

  // An `error` event is always followed by `close`.
  await new Promise<void>((resolve) => {
    socket.addEventListener('close', () => {
      resolve();
    });
  });
  clearInterval(pingTimer);
  clearInterval(writeTimer);
};

/**
 * Runs stats sessions forever, logging in again after each disconnect or
 * failure.
 */
const main = async () => {
  const env: CollectorEnv = {
    routerHost: readEnv('ROUTER_HOST'),
    routerUser: readEnv('ROUTER_USER'),
    routerPassword: readEnv('ROUTER_PASSWORD'),
    influxUrl: readEnv('INFLUX_URL'),
    influxToken: readEnv('INFLUX_TOKEN'),
    influxOrg: readEnv('INFLUX_ORG'),
    influxBucket: readEnv('INFLUX_BUCKET')
  };
  const names = new DeviceNameResolver();
  for (;;) {
    try {
      await runSession(env, names);
      console.warn('Router stats socket closed');
    } catch (error) {
      console.error(error);
    }
    await sleep(RECONNECT_DELAY_MS);
  }
};

// Run only when executed directly, so tests can import the parsing helpers.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
