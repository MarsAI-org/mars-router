// Uptime monitoring: one row per probe (model or combo). Additive.
import { TABLES, buildCreateTableSql } from "../schema.js";

const NEW_TABLES = ["uptimeChecks"];

export default {
  version: 3,
  name: "uptime-monitor",
  up(db) {
    for (const name of NEW_TABLES) {
      const def = TABLES[name];
      if (!def) continue;
      db.exec(buildCreateTableSql(name, def));
      for (const idx of def.indexes || []) db.exec(idx);
    }
  },
};
