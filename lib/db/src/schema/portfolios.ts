import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const portfoliosTable = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPortfolioSchema = createInsertSchema(portfoliosTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfoliosTable.$inferSelect;
