import { writeFile, readFile, access } from "fs/promises";
import { existsSync, fstat, mkdirSync } from "fs";

/**
 * The database store path. This is relative to the root of the project
 */
const DB_PATH = `./localData/storeDb.json`;

export type StoreDb = {
  lastUpdateCheckDate?: Date;
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
    await writeFile(DB_PATH, JSON.stringify(updatedDb), { flag: "w+" });
  }

  private static async checkDb() {
    if (!Store.db) {
      Store.db = await Store.getDb();
    }
  }

  private static async getDb(): Promise<StoreDb> {
    try {
      console.log(`Checking to see if ${DB_PATH} exists`);
      await access(DB_PATH);
      console.log(`${DB_PATH} exists...`);
      return JSON.parse(await readFile(DB_PATH, "utf-8"));
    } catch {
      // DB doesn't exist, so write the file first.
      console.log("Creating the database...");
      if (!existsSync("./localData")) {
        mkdirSync("./localData");
      }
      await writeFile(DB_PATH, "{}", { flag: "w+" });
      return {};
    }
  }

  /**
   * Sets a value on the db.
   *
   * @param key the name of the key
   * @param value the value to assign to the key
   */
  static async set(key: keyof StoreDb, value: any): Promise<void> {
    await Store.checkDb();
    Store.db[key] = value;
    await Store.writeDb(Store.db);
  }

  static async get(key: keyof StoreDb): Promise<any> {
    await Store.checkDb();
    return Store.db[key];
  }

  static async getLastCheckedDate(): Promise<Date> {
    await Store.checkDb();
    if (Store.db.lastUpdateCheckDate) {
      return new Date(Store.db.lastUpdateCheckDate);
    }
    throw new Error(`Store.db.lastUpdateCheckData did not have a value`);
  }
}

export default Store;
