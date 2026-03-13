/** Storage plugin interface for persisting UI preferences. */

export interface StoragePlugin {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}
