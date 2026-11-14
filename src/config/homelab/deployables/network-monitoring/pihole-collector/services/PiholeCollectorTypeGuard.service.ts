/**
 * Type guards for values that arrive untyped, such as parsed JSON.
 */
export default class PiholeCollectorTypeGuardService {
  /**
   * Narrows an unknown value to a plain object.
   *
   * @param value the value to narrow
   */
  static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
