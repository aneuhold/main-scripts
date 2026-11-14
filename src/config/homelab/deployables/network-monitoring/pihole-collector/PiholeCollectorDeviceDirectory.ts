import {
  PiholeCollectorDeviceInfo,
  PiholeCollectorDeviceNames,
  PiholeApiDevice
} from './types.js';

/**
 * A span of time in which an IP belonged to a device, in seconds since the
 * epoch (both ends inclusive).
 */
type AddressOwner = {
  device: string;
  from: number;
  until: number;
};

/**
 * Identifies the device behind each client IP by MAC address, so a device's
 * history stays together when its IP changes, and names each device.
 *
 * Pi-hole keeps only the latest device at each IP, plus when each device was
 * last seen at each of its IPs. A device's IPv4 addresses are therefore taken
 * to have been held one after another: each from the time the previous one was
 * last seen until its own last-seen time, and the newest with no end. IPs last
 * seen at the same moment share a span, since Pi-hole sometimes updates many at
 * once. IPv6 addresses are held side by side, so each covers the device's whole history.
 * A lookup outside every known span keeps its IP as the device.
 */
export class PiholeCollectorDeviceDirectory {
  /** Matches a MAC address, in lowercase. */
  static readonly #MAC_PATTERN = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;

  /**
   * Name and maker of every device Pi-hole knows by MAC address, plus any
   * configured name for a device it does not. Names are unique: a name shared
   * by several devices gets the end of each one's MAC address appended, since
   * the dashboard uses names as column names.
   */
  readonly deviceInfos: PiholeCollectorDeviceInfo[];
  #owners = new Map<string, AddressOwner>();

  /**
   * @param devices Pi-hole's devices
   * @param deviceNames configured names, keyed by MAC address; they win over
   * the hostnames Pi-hole resolved
   */
  constructor(
    devices: PiholeApiDevice[],
    deviceNames: PiholeCollectorDeviceNames
  ) {
    const configuredNames = new Map(
      Object.entries(deviceNames).map(([key, name]) => [
        key.toLowerCase(),
        name
      ])
    );
    const infos: PiholeCollectorDeviceInfo[] = [];
    for (const device of devices) {
      const mac = device.hwaddr.toLowerCase();
      if (!PiholeCollectorDeviceDirectory.#MAC_PATTERN.test(mac)) continue;
      this.#addOwners(mac, device);
      const resolvedName = device.ips
        .toSorted((a, b) => b.lastSeen - a.lastSeen)
        .find(({ name }) => name)?.name;
      infos.push({
        device: mac,
        name: configuredNames.get(mac) ?? resolvedName ?? mac,
        vendor: device.macVendor
      });
      configuredNames.delete(mac);
    }
    for (const [device, name] of configuredNames) {
      infos.push({ device, name, vendor: null });
    }
    const nameCounts = new Map<string, number>();
    for (const { name } of infos) {
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    this.deviceInfos = infos.map((info) =>
      (nameCounts.get(info.name) ?? 0) > 1
        ? { ...info, name: `${info.name} (${info.device.slice(-8)})` }
        : info
    );
  }

  /**
   * Returns the device that made a lookup: its MAC address, or the IP when no
   * device is known to have held the IP at that time.
   *
   * @param ip the client IP
   * @param time when the lookup happened, in seconds since the epoch
   */
  getDevice(ip: string, time: number): string {
    const owner = this.#owners.get(ip);
    return owner && time >= owner.from && time <= owner.until
      ? owner.device
      : ip;
  }

  /**
   * Records the spans in which a device held each of its IPs.
   *
   * @param mac the device's MAC address
   * @param device the device
   */
  #addOwners(mac: string, device: PiholeApiDevice) {
    const ipv4 = device.ips.filter(({ ip }) => !ip.includes(':'));
    const lastSeenTimes = [
      ...new Set(ipv4.map(({ lastSeen }) => lastSeen))
    ].toSorted((a, b) => a - b);
    for (const { ip, lastSeen } of ipv4) {
      const index = lastSeenTimes.indexOf(lastSeen);
      this.#owners.set(ip, {
        device: mac,
        from: index === 0 ? device.firstSeen : lastSeenTimes[index - 1],
        until:
          index === lastSeenTimes.length - 1
            ? Number.POSITIVE_INFINITY
            : lastSeen
      });
    }
    for (const { ip } of device.ips) {
      if (!ip.includes(':')) continue;
      this.#owners.set(ip, {
        device: mac,
        from: device.firstSeen,
        until: Number.POSITIVE_INFINITY
      });
    }
  }
}
