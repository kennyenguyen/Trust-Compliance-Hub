import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { trustsTable } from "./trusts";

export const reportTemplatesTable = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  trustId: integer("trust_id").references(() => trustsTable.id, {
    onDelete: "restrict",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reportSheetsTable = pgTable(
  "report_template_sheets",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .notNull()
      .references(() => reportTemplatesTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 31 }).notNull(),
    order: integer("order_index").notNull(),
  },
  (table) => [
    uniqueIndex("report_template_sheets_order_unique").on(
      table.templateId,
      table.order,
    ),
  ],
);

export const reportSectionsTable = pgTable(
  "report_template_sections",
  {
    id: serial("id").primaryKey(),
    sheetId: integer("sheet_id")
      .notNull()
      .references(() => reportSheetsTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    order: integer("order_index").notNull(),
    twoHeaderRows: boolean("two_header_rows").notNull().default(false),
    showHoldings: boolean("show_holdings").notNull().default(true),
    blankRowAfter: boolean("blank_row_after").notNull().default(false),
    aggregationLabel: varchar("aggregation_label", { length: 120 }),
    bold: boolean("bold").notNull().default(false),
    italic: boolean("italic").notNull().default(false),
    textColor: varchar("text_color", { length: 7 }),
    backgroundColor: varchar("background_color", { length: 7 }),
  },
  (table) => [
    uniqueIndex("report_template_sections_order_unique").on(
      table.sheetId,
      table.order,
    ),
  ],
);

export const reportColumnsTable = pgTable(
  "report_template_columns",
  {
    id: serial("id").primaryKey(),
    sectionId: integer("section_id")
      .notNull()
      .references(() => reportSectionsTable.id, { onDelete: "cascade" }),
    field: varchar("field", { length: 64 }).notNull(),
    order: integer("order_index").notNull(),
    headerLabel: varchar("header_label", { length: 120 }).notNull(),
    secondHeaderLabel: varchar("second_header_label", { length: 120 }),
    headerBackgroundColor: varchar("header_background_color", { length: 7 }),
    aggregate: boolean("aggregate").notNull().default(false),
    bold: boolean("bold").notNull().default(false),
    italic: boolean("italic").notNull().default(false),
    textColor: varchar("text_color", { length: 7 }),
    backgroundColor: varchar("background_color", { length: 7 }),
  },
  (table) => [
    uniqueIndex("report_template_columns_order_unique").on(
      table.sectionId,
      table.order,
    ),
  ],
);

export const insertReportTemplateSchema = createInsertSchema(
  reportTemplatesTable,
).omit({ id: true, createdAt: true });
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type ReportTemplateRow = typeof reportTemplatesTable.$inferSelect;
