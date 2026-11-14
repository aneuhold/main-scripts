/**
 * Entry point of the Pi-hole collector, which copies Pi-hole's DNS query log
 * into InfluxDB as per-minute lookup counts, per device and per device and
 * site, plus a name for each device. Devices are identified by MAC address
 * (see {@link PiholeCollectorDeviceDirectory}), and the dashboard looks their names up at
 * query time, so renaming a device relabels its whole history.
 *
 * Each pass counts every complete minute since the last one written. On the
 * first start the bucket is empty, so the first pass walks back through all of
 * Pi-hole's on-disk history one hour at a time. A minute's counts are complete
 * when written, so writing a minute again overwrites it with the same values.
 * That makes resuming after a restart safe.
 *
 * `pnpm build` bundles this file and everything it imports into one
 * `piholeCollector.remote.mjs`, which runs on the monitoring host in a plain `node`
 * container.
 */
import { setTimeout } from 'node:timers/promises';
import PiholeCollectorConfigService from './services/PiholeCollectorConfig.service.js';
import { PiholeCollectorDeviceDirectory } from './PiholeCollectorDeviceDirectory.js';
import PiholeCollectorInfluxDbService from './services/PiholeCollectorInfluxDb.service.js';
import PiholeCollectorLineProtocolService from './services/PiholeCollectorLineProtocol.service.js';
import PiholeApiService from './services/PiholeApi.service.js';
import PiholeCollectorQueryCounterService from './services/PiholeCollectorQueryCounter.service.js';

/** Largest span of history read from Pi-hole in one request. */
const CHUNK_SECONDS = 60 * 60;
/** Pause after each minute boundary before counting the minute that ended. */
const SETTLE_MS = 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns where counting starts: the latest minute already written, or the
 * start of Pi-hole's on-disk history when the bucket is empty.
 */
const getStartMinute = async (): Promise<number> => {
  const latest = await PiholeCollectorInfluxDbService.getLatestWrittenMinute();
  if (latest !== null) return latest;
  const earliest = await PiholeApiService.getEarliestOnDisk();
  console.log(
    `Bucket is empty; backfilling from ${new Date(earliest * 1000).toISOString()}`
  );
  return Math.floor(earliest / 60) * 60;
};

/**
 * Writes every device's name, then counts and writes every complete minute
 * from the cursor on, then waits for the next minute boundary, forever. A
 * failed range is retried on the next pass.
 */
const main = async () => {
  process.on('SIGTERM', () => {
    PiholeApiService.logout()
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => process.exit(0));
  });

  let cursor: number | null = null;
  for (;;) {
    try {
      cursor ??= await getStartMinute();
      const directory = new PiholeCollectorDeviceDirectory(
        await PiholeApiService.getDevices(),
        await PiholeCollectorConfigService.loadDeviceNames()
      );
      // One point per device per day, overwritten on every pass that day.
      const today = Math.floor(Date.now() / DAY_MS) * (DAY_MS / 1000);
      await PiholeCollectorInfluxDbService.write(
        PiholeCollectorLineProtocolService.fromDeviceInfos(
          directory.deviceInfos,
          today
        )
      );
      const currentMinute = Math.floor(Date.now() / 60_000) * 60;
      while (cursor < currentMinute) {
        const until = Math.min(cursor + CHUNK_SECONDS, currentMinute);
        const counts = PiholeCollectorQueryCounterService.count(
          await PiholeApiService.getQueries(cursor, until),
          directory
        );
        await PiholeCollectorInfluxDbService.write(
          PiholeCollectorLineProtocolService.fromCounts(counts)
        );
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

await main();
