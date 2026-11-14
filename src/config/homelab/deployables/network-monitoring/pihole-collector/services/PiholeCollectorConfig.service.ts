import { readFile } from 'node:fs/promises';
import {
  PiholeApiSettings,
  PiholeCollectorDeviceNames,
  PiholeCollectorInfluxSettings
} from '../types.js';
import PiholeCollectorTypeGuardService from './PiholeCollectorTypeGuard.service.js';

/**
 * Reads the collector's settings.
 */
export default class PiholeCollectorConfigService {
  /**
   * Name of the device names file, which sits in the collector's folder. Holds
   * a JSON object of MAC address to name.
   */
  static readonly DEVICE_NAMES_FILE = 'device-names.json';

  /**
   * Reads Pi-hole's connection settings.
   */
  static getPiholeSettings(): PiholeApiSettings {
    return {
      url: this.#readEnv('PIHOLE_URL'),
      password: this.#readEnv('PIHOLE_PASSWORD')
    };
  }

  /**
   * Reads InfluxDB's connection settings.
   */
  static getInfluxSettings(): PiholeCollectorInfluxSettings {
    return {
      url: this.#readEnv('INFLUX_URL'),
      token: this.#readEnv('INFLUX_TOKEN'),
      org: this.#readEnv('INFLUX_ORG'),
      bucket: this.#readEnv('INFLUX_BUCKET')
    };
  }

  /**
   * Reads and validates a device names file.
   *
   * @param path path of the file
   */
  static async loadDeviceNames(
    path: string
  ): Promise<PiholeCollectorDeviceNames> {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!PiholeCollectorTypeGuardService.isRecord(parsed)) {
      throw new Error(`${path} must be a JSON object of MAC address to name`);
    }
    const names: PiholeCollectorDeviceNames = {};
    for (const [mac, name] of Object.entries(parsed)) {
      if (typeof name !== 'string') {
        throw new Error(`Device name for ${mac} in ${path} is not a string`);
      }
      names[mac] = name;
    }
    return names;
  }

  /**
   * Reads a required environment variable, throwing when it is unset.
   *
   * @param name the variable name
   */
  static #readEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable ${name}`);
    }
    return value;
  }
}
