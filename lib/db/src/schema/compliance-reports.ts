import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { trustsTable } from "./trusts";

export const complianceReportsTable = pgTable("compliance_reports", {
  id: serial("id").primaryKey(),
  trustId: integer("trust_id")
    .notNull()
    .references(() => trustsTable.id, { onDelete: "restrict" }),
  asOfDate: date("as_of_date", { mode: "string" }).notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  totalHoldingCount: integer("total_holding_count").notNull(),
  passCount: integer("pass_count").notNull(),
  failCount: integer("fail_count").notNull(),
  results: jsonb("results").$type<Record<string, unknown>[]>().notNull(),
});

export const insertComplianceReportSchema = createInsertSchema(
  complianceReportsTable,
).omit({
  id: true,
  runAt: true,
});
export type InsertComplianceReport = z.infer<typeof insertComplianceReportSchema>;
export type ComplianceReportRow = typeof complianceReportsTable.$inferSelect;
