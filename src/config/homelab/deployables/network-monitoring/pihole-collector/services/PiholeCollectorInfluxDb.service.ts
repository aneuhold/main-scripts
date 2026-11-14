import { PiholeCollectorInfluxSettings } from '../types.js';
import PiholeCollectorConfigService from './PiholeCollectorConfig.service.js';

/**
 * Reads from and writes to the collector's InfluxDB bucket through the v2 HTTP
 * API.
 */
export default class PiholeCollectorInfluxDbService {
  static #settings: PiholeCollectorInfluxSettings | null = null;

  /**
   * Returns the start of the latest minute of lookup counts in the bucket, or
   * null when there are none.
   */
  static async getLatestWrittenMinute(): Promise<number | null> {
    const { token, bucket } = this.#getSettings();
    const response = await fetch(this.#url('/api/v2/query'), {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        Accept: 'application/csv',
        'Content-Type': 'application/vnd.flux'
      },
      body: [
        // Not using a template literal here for the whole block because it would then have the
        // indentation added. The indentation can be removed, but then it would look ugly here.
        `from(bucket: "${bucket}")`,
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
  }

  /**
   * Writes line protocol with second-precision timestamps. Skips the request
   * when there is nothing to write.
   *
   * @param lines the points to write, built by `PiholeCollectorLineProtocolService`
   */
  static async write(lines: string): Promise<void> {
    if (lines === '') return;
    const { token, bucket } = this.#getSettings();
    const url = this.#url('/api/v2/write');
    url.searchParams.set('bucket', bucket);
    url.searchParams.set('precision', 's');
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Token ${token}` },
      body: lines
    });
    if (!response.ok) {
      throw new Error(
        `InfluxDB write failed (HTTP ${response.status}): ${await response.text()}`
      );
    }
  }

  /**
   * Builds an API URL scoped to the organization.
   *
   * @param path the API path
   */
  static #url(path: string): URL {
    const { url: baseUrl, org } = this.#getSettings();
    const url = new URL(path, baseUrl);
    url.searchParams.set('org', org);
    return url;
  }

  /**
   * Returns InfluxDB's connection settings, reading them on first use.
   */
  static #getSettings(): PiholeCollectorInfluxSettings {
    this.#settings ??= PiholeCollectorConfigService.getInfluxSettings();
    return this.#settings;
  }
}
