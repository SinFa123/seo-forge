import { getTableName, is, Table } from "drizzle-orm";
import { getTableConfig as getSqliteTableConfig } from "drizzle-orm/sqlite-core";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as sqliteYoutube from "../youtube.schema";
import * as pgYoutube from "../pg/youtube.schema";

// SEO Forge twin of src/db/schema-parity.test.ts for the YouTube tables, which
// live outside the upstream barrels (own migration stream). The provider-aware
// barrel in ./schema.ts types Postgres as the SQLite schema via a cast, so the
// two dialect definitions MUST stay structurally interchangeable.

type Dialect = "sqlite" | "pg";

type ColumnShape = {
  name: string;
  notNull: boolean;
  hasDefault: boolean;
  primary: boolean;
};

type TableShape = {
  columns: ColumnShape[];
  uniqueIndexes: string[];
  indexes: string[];
};

function tablesFrom(mod: Record<string, unknown>) {
  const out = new Map<string, Table>();
  for (const value of Object.values(mod)) {
    if (is(value, Table)) out.set(getTableName(value), value);
  }
  return out;
}

function shapeOf(table: Table, dialect: Dialect): TableShape {
  const config =
    dialect === "pg" ? getPgTableConfig(table) : getSqliteTableConfig(table);
  const columns = config.columns
    .map((column) => ({
      name: column.name,
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      primary: column.primary,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
  const uniqueIndexes: string[] = [];
  const indexes: string[] = [];
  for (const index of config.indexes) {
    const columnNames = index.config.columns
      .map((column) => ("name" in column ? String(column.name) : ""))
      .join(",");
    const entry = `${index.config.name ?? ""}(${columnNames})`;
    (index.config.unique ? uniqueIndexes : indexes).push(entry);
  }
  return {
    columns,
    uniqueIndexes: uniqueIndexes.toSorted(),
    indexes: indexes.toSorted(),
  };
}

describe("YouTube schema parity (sqlite vs postgres)", () => {
  const sqliteTables = tablesFrom(sqliteYoutube);
  const pgTables = tablesFrom(pgYoutube);

  it("defines the same tables in both dialects", () => {
    expect([...pgTables.keys()].toSorted()).toEqual(
      [...sqliteTables.keys()].toSorted(),
    );
    expect(sqliteTables.size).toBeGreaterThan(0);
  });

  it("defines identical columns, nullability, defaults, keys, and indexes", () => {
    for (const [name, sqliteTable] of sqliteTables) {
      const pgTable = pgTables.get(name);
      expect(pgTable, `missing Postgres table ${name}`).toBeDefined();
      if (!pgTable) continue;
      expect(shapeOf(pgTable, "pg")).toEqual(shapeOf(sqliteTable, "sqlite"));
    }
  });
});
