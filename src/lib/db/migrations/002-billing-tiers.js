// Reseller billing / tiers schema. Additive — the auto-sync in syncSchemaFromTables
// would also create these, but an explicit migration keeps the version history clear.
import { TABLES, buildCreateTableSql } from "../schema.js";

const NEW_TABLES = ["plans", "subscriptions", "keyUsageDaily", "abuseEvents"];

export default {
  version: 2,
  name: "billing-tiers",
  up(db) {
    for (const name of NEW_TABLES) {
      const def = TABLES[name];
      if (!def) continue;
      db.exec(buildCreateTableSql(name, def));
      for (const idx of def.indexes || []) db.exec(idx);
    }
  },
};
