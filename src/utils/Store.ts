import { DR } from '@aneuhold/core-ts-lib';
import { access, mkdir, readFile, writeFile } from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * The path to the localData folder. This should be targeted to one level out
 * of the root directory that way it isn't stored in the `lib` folder when
 * compiled.
 */
const fileName = fileURLToPath(import.meta.url);
const directoryName = dirname(fileName);
const LOCALDATA_PATH = path.join(directoryName, '..', '..', '..', 'localData');

/**
 * The database store path. This is relative to the root of the project
 */
const DB_PATH = path.join(LOCALDATA_PATH, 'storeDb.json');

export type StoreDb = {
  lastUpdateCheckDate?: string;
};

/**
 * Represents the secondary storage data store for the scripts.
 */
class Store {
  /**
   * Holds the database in-memory for use.
   */
  private static db: StoreDb | undefined;

  private static async writeDb(updatedDb: StoreDb) {
    DR.logger.verbose.info('Attempting to write to the store db file...');
    await writeFile(DB_PATH, JSON.stringify(updatedDb), {
      flag: 'w+'
    });
  }

  private static async checkDb() {
    if (!Store.db) {
      Store.db = await Store.getDb();
    }
  }

  private static async getDb(): Promise<StoreDb> {
    try {
      DR.logger.verbose.info(`Checking to see if ${DB_PATH} exists`);
      await access(DB_PATH);
      DR.logger.verbose.info(`${DB_PATH} exists...`);
      return JSON.parse(await readFile(DB_PATH, 'utf-8')) as StoreDb;
    } catch {
      // DB doesn't exist, so write the file first.
      DR.logger.verbose.info('Creating the database...');
      try {
        await access(LOCALDATA_PATH);
        DR.logger.verbose.success(`${LOCALDATA_PATH} exists.`);
      } catch {
        DR.logger.verbose.failure(
          `${LOCALDATA_PATH} doesn't exist. Creating now...`
        );
        await mkdir(LOCALDATA_PATH);
      }
      await writeFile(DB_PATH, '{}', { flag: 'w+' });
      DR.logger.verbose.success(`Created ${DB_PATH}`);
      return {};
    }
  }

  /**
   * Sets a value on the db.
   *
   * @param key the name of the key
   * @param value the value to assign to the key
   */
  static async set<T extends keyof StoreDb>(
    key: T,
    value: StoreDb[T]
  ): Promise<void> {
    await Store.checkDb();
    if (!Store.db) {
      return;
    }
    Store.db[key] = value;
    await Store.writeDb(Store.db);
  }

  static async get<T extends keyof StoreDb>(
    key: T
  ): Promise<StoreDb[T] | null> {
    await Store.checkDb();
    if (!Store.db) {
      return null;
    }
    return Store.db[key];
  }
}

export default Store;
