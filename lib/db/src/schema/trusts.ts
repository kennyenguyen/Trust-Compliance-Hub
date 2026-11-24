import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { portfoliosTable } from "./portfolios";

export const trustsTable = pgTable(
  "trusts",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    code: varchar("code", { length: 40 }).notNull().unique(),
    portfolioId: integer("portfolio_id").references(() => portfoliosTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("trusts_portfolio_id_unique").on(table.portfolioId),
  ],
);

export const insertTrustSchema = createInsertSchema(trustsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTrust = z.infer<typeof insertTrustSchema>;
export type Trust = typeof trustsTable.$inferSelect;
