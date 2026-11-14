import {
  PiholeCollectorDeviceInfo,
  PiholeCollectorMinuteCounts
} from '../types.js';

/**
 * Renders collector data as InfluxDB line protocol. Reference:
 * https://docs.influxdata.com/influxdb/v2/reference/syntax/line-protocol/
 */
export default class PiholeCollectorLineProtocolService {
  /**
   * Renders counts: a `dns` point per device, IP, and minute, and a
   * `dns_domain` point per device, IP, site, and minute.
   *
   * @param counts the counts to render
   */
  static fromCounts(counts: PiholeCollectorMinuteCounts): string {
    return [
      ...counts.devices.map(
        ({ minute, device, ip, queries, blocked }) =>
          `dns,device=${this.#escapeTag(device)},ip=${this.#escapeTag(ip)} queries=${queries}i,blocked=${blocked}i ${minute}`
      ),
      ...counts.sites.map(
        ({ minute, device, ip, site, queries }) =>
          `dns_domain,device=${this.#escapeTag(device)},ip=${this.#escapeTag(ip)},site=${this.#escapeTag(site)} queries=${queries}i ${minute}`
      )
    ].join('\n');
  }

  /**
   * Renders device names and makers: a `device_info` point per device. Writing
   * again at the same time overwrites the points, so the latest names win.
   *
   * @param infos the devices to render
   * @param time the points' time, in seconds since the epoch
   */
  static fromDeviceInfos(
    infos: PiholeCollectorDeviceInfo[],
    time: number
  ): string {
    return infos
      .map(({ device, name, vendor }) => {
        const fields = [`name=${this.#quoteField(name)}`];
        if (vendor) fields.push(`vendor=${this.#quoteField(vendor)}`);
        return `device_info,device=${this.#escapeTag(device)} ${fields.join(',')} ${time}`;
      })
      .join('\n');
  }

  /**
   * Escapes a tag value. Sites can contain spaces, commas, and equals signs.
   *
   * @param value the raw tag value
   */
  static #escapeTag(value: string): string {
    return value.replace(/[ ,=\\]/g, '\\$&');
  }

  /**
   * Quotes a string field value.
   *
   * @param value the raw field value
   */
  static #quoteField(value: string): string {
    return `"${value.replace(/["\\]/g, '\\$&')}"`;
  }
}
