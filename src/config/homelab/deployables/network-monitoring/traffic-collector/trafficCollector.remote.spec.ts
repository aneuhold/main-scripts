import { describe, expect, it } from 'vitest';
import {
  parseExportFrame,
  StatsFrameReader,
  toLineProtocol
} from './trafficCollector.remote.js';

/**
 * Frames the given payload the way the router does: `<length>\n<json>`.
 *
 * @param payload the JSON payload
 */
const frame = (payload: string): string => `${payload.length}\n${payload}`;

/** An `export` frame as the router sends it in "Hosts only" mode. */
const HOSTS_ONLY_EXPORT = JSON.stringify({
  export: {
    '192.168.0.85': {
      'Other|Other': {
        tx_bytes: '63424',
        tx_rate: '0',
        rx_bytes: '57496',
        rx_rate: '0'
      }
    }
  }
});

describe('StatsFrameReader', () => {
  describe('push', () => {
    it('returns a frame delivered in one message', () => {
      const reader = new StatsFrameReader();
      expect(reader.push(frame('{"a":1}'))).toEqual(['{"a":1}']);
    });

    it('buffers a frame split across messages', () => {
      const reader = new StatsFrameReader();
      const full = frame('{"a":1}');
      expect(reader.push(full.slice(0, 4))).toEqual([]);
      expect(reader.push(full.slice(4))).toEqual(['{"a":1}']);
    });

    it('returns every frame packed into one message', () => {
      const reader = new StatsFrameReader();
      expect(reader.push(frame('{"a":1}') + frame('{"b":2}'))).toEqual([
        '{"a":1}',
        '{"b":2}'
      ]);
    });

    it('skips whitespace ahead of the length prefix', () => {
      const reader = new StatsFrameReader();
      expect(reader.push(` ${frame('{"a":1}')}`)).toEqual(['{"a":1}']);
    });
  });
});

describe('parseExportFrame', () => {
  it('parses a "Hosts only" frame into one counter per host', () => {
    expect(parseExportFrame(HOSTS_ONLY_EXPORT)).toEqual([
      {
        ip: '192.168.0.85',
        category: 'Other',
        app: 'Other',
        txBytes: 63424,
        rxBytes: 57496
      }
    ]);
  });

  it('parses a DPI frame into one counter per host and app', () => {
    const dpiExport = JSON.stringify({
      export: {
        '192.168.0.51': {
          'YouTube|Media streaming services': {
            tx_bytes: '10',
            rx_bytes: '2000'
          },
          'HTTPS|Web': { tx_bytes: '5', rx_bytes: '50' }
        }
      }
    });
    expect(parseExportFrame(dpiExport)).toEqual([
      {
        ip: '192.168.0.51',
        category: 'Media streaming services',
        app: 'YouTube',
        txBytes: 10,
        rxBytes: 2000
      },
      {
        ip: '192.168.0.51',
        category: 'Web',
        app: 'HTTPS',
        txBytes: 5,
        rxBytes: 50
      }
    ]);
  });

  it('returns no counters for an empty export', () => {
    expect(parseExportFrame('{"export":{}}')).toEqual([]);
  });

  it('returns null for other stats streams and malformed frames', () => {
    expect(parseExportFrame('{"system-stats":{"cpu":"3"}}')).toBeNull();
    expect(parseExportFrame('not json')).toBeNull();
  });
});

describe('toLineProtocol', () => {
  it('renders one point per counter with escaped tags', () => {
    expect(
      toLineProtocol(
        [
          {
            ip: '192.168.0.51',
            name: 'BIG RED',
            category: 'Media streaming services',
            app: 'YouTube',
            txBytes: 10,
            rxBytes: 2000
          }
        ],
        1700000000
      )
    ).toBe(
      'traffic,ip=192.168.0.51,name=BIG\\ RED,category=Media\\ streaming\\ services,app=YouTube tx_bytes=10i,rx_bytes=2000i 1700000000'
    );
  });
});
