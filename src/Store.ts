import levelup, { LevelUp } from "levelup";
import leveldown, { LevelDown } from "leveldown";
import { AbstractIterator } from "abstract-leveldown";

const dbPath = `../localData/storedb`;

/**
 * Represents the secondary storage data store for the scripts. Think of it as
 * a persistent simple key-value store.
 */
class Store {
  /**
   * Holds the database from the key-value store provider. The provider of which
   * can be changed later if wanted.
   */
  private static db: LevelUp<LevelDown, AbstractIterator<string, any>>;

  /**
   * Builds an instance of the Store.
   * 
   * This can be built many times, without worry for performance.
   */
  constructor() {
    if (!Store.db) {
      Store.db = levelup(leveldown(dbPath));
    }
  }

  /**
   * Sets a value.
   * 
   * @param {string} key the name of the key
   * @param {any} value the value to assign to the key 
   */
  async set(key: string, value: any) {
    await Store.db.put(key, value);
  }

  async get(key: string) {
    return await Store.db.get(key);
  }
}

module.exports = Store;
