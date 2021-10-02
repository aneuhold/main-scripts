import { writeFile, readFile, access, mkdir } from 'fs/promises';
import path from 'path';
import Log from './helperFunctions/logger';

const LOCALDATA_PATH = path.join(__dirname, '..', '..', 'localData');

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
  private static db: StoreDb;

  private static async writeDb(updatedDb: StoreDb) {
    Log.verbose.info('Attempting to write to the store db file...');
    await writeFile(DB_PATH, JSON.stringify(updatedDb), {
      flag: 'w+',
    });
  }

  private static async checkDb() {
    if (!Store.db) {
      Store.db = await Store.getDb();
    }
  }

  private static async getDb(): Promise<StoreDb> {
    try {
      Log.verbose.info(`Checking to see if ${DB_PATH} exists`);
      await access(DB_PATH);
      Log.verbose.info(`${DB_PATH} exists...`);
      return JSON.parse(await readFile(DB_PATH, 'utf-8'));
    } catch {
      // DB doesn't exist, so write the file first.
      Log.verbose.info('Creating the database...');
      try {
        await access(LOCALDATA_PATH);
        Log.verbose.success(`${LOCALDATA_PATH} exists.`);
      } catch {
        Log.verbose.failure(`${LOCALDATA_PATH} doesn't exist. Creating now...`);
        await mkdir(LOCALDATA_PATH);
      }
      await writeFile(DB_PATH, '{}', { flag: 'w+' });
      Log.verbose.success(`Created ${DB_PATH}`);
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
    Store.db[key] = value;
    await Store.writeDb(Store.db);
  }

  static async get<T extends keyof StoreDb>(
    key: T
  ): Promise<StoreDb[T] | null> {
    await Store.checkDb();
    return Store.db[key];
  }
}

export default Store;
