import { writeFile, readFile, access } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { logInfo } from './helperFunctions/logger';

/**
 * The database store path. This is relative to the root of the project
 */
const DB_PATH = `./localData/storeDb.json`;

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

  private static async writeDb(
    updatedDb: StoreDb,
    verboseLoggingEnabled?: boolean
  ) {
    if (verboseLoggingEnabled) {
      logInfo('Attempting to write to the store db file...');
    }
    const result = await writeFile(DB_PATH, JSON.stringify(updatedDb), {
      flag: 'w+',
    });
    if (verboseLoggingEnabled) {
      logInfo(`Wrote to the db file with result of: ${result}`);
    }
  }

  private static async checkDb(verboseLoggingEnabled?: boolean) {
    if (!Store.db) {
      Store.db = await Store.getDb(verboseLoggingEnabled);
    }
  }

  private static async getDb(
    verboseLoggingEnabled?: boolean
  ): Promise<StoreDb> {
    try {
      if (verboseLoggingEnabled) {
        console.log(`Checking to see if ${DB_PATH} exists`);
      }
      await access(DB_PATH);
      if (verboseLoggingEnabled) {
        console.log(`${DB_PATH} exists...`);
      }
      return JSON.parse(await readFile(DB_PATH, 'utf-8'));
    } catch {
      // DB doesn't exist, so write the file first.
      if (verboseLoggingEnabled) {
        console.log('Creating the database...');
      }
      if (!existsSync('./localData')) {
        mkdirSync('./localData');
      }
      await writeFile(DB_PATH, '{}', { flag: 'w+' });
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
    value: StoreDb[T],
    verboseLoggingEnabled?: boolean
  ): Promise<void> {
    await Store.checkDb(verboseLoggingEnabled);
    Store.db[key] = value;
    await Store.writeDb(Store.db);
  }

  static async get<T extends keyof StoreDb>(
    key: T,
    verboseLoggingEnabled?: boolean
  ): Promise<StoreDb[T] | null> {
    await Store.checkDb(verboseLoggingEnabled);
    return Store.db[key];
  }

  static async getLastCheckedDate(
    verboseLoggingEnabled?: boolean
  ): Promise<Date> {
    await Store.checkDb(verboseLoggingEnabled);
    if (Store.db.lastUpdateCheckDate) {
      return new Date(Store.db.lastUpdateCheckDate);
    }
    throw new Error(`Store.db.lastUpdateCheckData did not have a value`);
  }
}

export default Store;
