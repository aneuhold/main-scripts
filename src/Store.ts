import levelup from "levelup";
import leveldown from "leveldown";

const dbPath = `../localData/storedb`;

export const KEYS = {
  lastUpdateCheckDate: "lastUpdateCheckDate"
}

/**
 * Represents the secondary storage data store for the scripts. Think of it as
 * a persistent simple key-value store.
 */
class Store {
  /**
   * Holds the database from the key-value store provider. The provider of which
   * can be changed later if wanted.
   */
  private static db = levelup(leveldown(dbPath)); 

  /**
   * Sets a value.
   * 
   * @param {string} key the name of the key
   * @param {any} value the value to assign to the key 
   */
  static async set(key: string, value: any) {
    await Store.db.put(key, value);
  }

  static async get<T>(key: string): Promise<T> {
    // Casting it like this so that it can return a specified type through the
    // generic.
    return await (Store.db.get(key) as unknown) as T;
  }
}

export default Store;
