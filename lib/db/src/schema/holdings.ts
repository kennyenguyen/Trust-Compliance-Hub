import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  numeric,
  pgTable,
  serial,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { trustsTable } from "./trusts";

export const holdingsTable = pgTable(
  "holdings",
  {
    id: serial("id").primaryKey(),
    trustId: integer("trust_id")
      .notNull()
      .references(() => trustsTable.id, { onDelete: "restrict" }),
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    cusip: varchar("cusip", { length: 32 }).notNull(),
    issuer: varchar("issuer", { length: 180 }).notNull(),
    assetClass: varchar("asset_class", { length: 80 }).notNull(),
    naicDesignationCode: varchar("naic_designation_code", { length: 40 })
      .notNull()
      .default(""),
    coreLevel1Code: varchar("core_level1_code", { length: 100 })
      .notNull()
      .default(""),
    coreLevel2Code: varchar("core_level2_code", { length: 100 })
      .notNull()
      .default(""),
    generalLedgerGroup: varchar("general_ledger_group", { length: 120 })
      .notNull()
      .default(""),
    bvAccrued: numeric("bv_accrued", { precision: 18, scale: 2 }).notNull(),
    mvAccrued: numeric("mv_accrued", { precision: 18, scale: 2 }).notNull(),
  },
  (table) => [
    uniqueIndex("holdings_trust_date_cusip_unique").on(
      table.trustId,
      table.asOfDate,
      table.cusip,
    ),
  ],
);

export const insertHoldingSchema = createInsertSchema(holdingsTable).omit({
  id: true,
});
export type InsertHolding = z.infer<typeof insertHoldingSchema>;
export type Holding = typeof holdingsTable.$inferSelect;
