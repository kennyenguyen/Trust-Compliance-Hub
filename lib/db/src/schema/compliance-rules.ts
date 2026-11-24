import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { trustsTable } from "./trusts";

export const complianceRulesTable = pgTable("compliance_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  trustId: integer("trust_id").references(() => trustsTable.id, {
    onDelete: "set null",
  }),
  enabled: boolean("enabled").notNull().default(true),
  aggregationCriteria: jsonb("aggregation_criteria")
    .$type<Record<string, unknown>>()
    .notNull(),
  limitMetric: varchar("limit_metric", { length: 24 }).notNull(),
  limitComparator: varchar("limit_comparator", { length: 8 }).notNull(),
  limitValue: numeric("limit_value", { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertComplianceRuleSchema = createInsertSchema(
  complianceRulesTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertComplianceRule = z.infer<typeof insertComplianceRuleSchema>;
export type ComplianceRule = typeof complianceRulesTable.$inferSelect;
