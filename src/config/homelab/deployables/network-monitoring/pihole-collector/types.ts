/**
 * Where Pi-hole's API is and how to log in to it.
 */
export type PiholeApiSettings = {
  /** Pi-hole's base URL, without the `/api` path. */
  url: string;
  /** Pi-hole's web password. */
  password: string;
};

/**
 * Where and as whom to reach InfluxDB.
 */
export type PiholeCollectorInfluxSettings = {
  url: string;
  token: string;
  org: string;
  bucket: string;
};

/**
 * Configured names for network devices, keyed by MAC address.
 */
export type PiholeCollectorDeviceNames = Record<string, string>;

/**
 * One query from Pi-hole's `GET /api/queries`, narrowed to the fields used
 * here.
 */
export type PiholeApiQuery = {
  /** Seconds since the epoch, with a fractional part. */
  time: number;
  domain: string;
  status: string | null;
  client: { ip: string };
};

/**
 * One device from Pi-hole's `GET /api/network/devices`, narrowed to the fields
 * used here.
 */
export type PiholeApiDevice = {
  /** MAC address, or `ip-<address>` for a client Pi-hole has no MAC for. */
  hwaddr: string;
  /** When Pi-hole first saw the device, in seconds since the epoch. */
  firstSeen: number;
  macVendor: string | null;
  ips: PiholeApiDeviceAddress[];
};

/**
 * One IP a device has used, from Pi-hole's `GET /api/network/devices`.
 */
export type PiholeApiDeviceAddress = {
  ip: string;
  /** Hostname Pi-hole resolved for the address. */
  name: string | null;
  /** When the device was last seen at this address, in seconds since the epoch. */
  lastSeen: number;
};

/**
 * The name and maker shown for a device.
 */
export type PiholeCollectorDeviceInfo = {
  /** The device's MAC address. */
  device: string;
  name: string;
  /** Maker of the device's network hardware, from its MAC address. */
  vendor: string | null;
};

/**
 * Lookup counts for every device and site seen in a range of queries.
 */
export type PiholeCollectorMinuteCounts = {
  devices: PiholeCollectorDeviceMinuteCount[];
  sites: PiholeCollectorSiteMinuteCount[];
};

/**
 * Lookups one device made from one IP in one minute.
 */
export type PiholeCollectorDeviceMinuteCount = {
  /** Start of the minute, in seconds since the epoch. */
  minute: number;
  /** The device's MAC address, or the IP when the device is unknown. */
  device: string;
  ip: string;
  queries: number;
  blocked: number;
};

/**
 * Lookups one device made from one IP for one site in one minute.
 */
export type PiholeCollectorSiteMinuteCount = {
  minute: number;
  device: string;
  ip: string;
  /** The domain collapsed to its site by `PiholeCollectorQueryCounterService.toSite`. */
  site: string;
  queries: number;
};
