/** Migration types for the schema versioning system. */

export interface MigrationRecord {
  version: number;
  applied_at: string;
}

/** Current schema version. Increment on breaking GraphSchema changes. */
export const CURRENT_SCHEMA_VERSION = 1;
