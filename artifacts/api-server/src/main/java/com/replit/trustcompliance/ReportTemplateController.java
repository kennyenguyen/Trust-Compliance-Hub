package com.replit.trustcompliance;

import java.nio.charset.StandardCharsets;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ReportTemplateController {
  private static final Set<String> HOLDING_FIELDS = Set.of(
      "cusip", "issuer", "assetClass", "naicDesignationCode", "coreLevel1Code",
      "coreLevel2Code", "generalLedgerGroup", "bvAccrued", "mvAccrued");
  private static final Set<String> NUMERIC_FIELDS = Set.of("bvAccrued", "mvAccrued");

  private final JdbcTemplate jdbc;
  private final ExcelWorkbookService workbookService;

  public ReportTemplateController(JdbcTemplate jdbc, ExcelWorkbookService workbookService) {
    this.jdbc = jdbc;
    this.workbookService = workbookService;
  }

  @GetMapping("/report-templates/fields")
  public List<Map<String, Object>> fields() {
    return List.of(
        field("cusip", "CUSIP", false),
        field("issuer", "Issuer", false),
        field("assetClass", "Asset class", false),
        field("naicDesignationCode", "NAIC designation", false),
        field("coreLevel1Code", "Core level 1", false),
        field("coreLevel2Code", "Core level 2", false),
        field("generalLedgerGroup", "General ledger group", false),
        field("bvAccrued", "Book value", true),
        field("mvAccrued", "Market value", true));
  }

  @GetMapping("/report-templates")
  public List<Map<String, Object>> templates(
      @RequestParam(required = false) Integer trustId) {
    List<Map<String, Object>> rows;
    if (trustId == null) {
      rows = jdbc.queryForList("""
          select rt.id, rt.name, rt.trust_id, t.name as trust_name, rt.created_at
          from report_templates rt
          left join trusts t on t.id = rt.trust_id
          order by rt.created_at desc, rt.id desc
          """);
    } else {
      requireTrust(trustId);
      rows = jdbc.queryForList("""
          select rt.id, rt.name, rt.trust_id, t.name as trust_name, rt.created_at
          from report_templates rt
          left join trusts t on t.id = rt.trust_id
          where rt.trust_id = ?
          order by rt.created_at desc, rt.id desc
          """, trustId);
    }
    return rows.stream().map(this::templateDto).toList();
  }

  @PostMapping("/report-templates")
  @Transactional
  public ResponseEntity<Map<String, Object>> createTemplate(
      @RequestBody Map<String, Object> body) {
    Map<String, Object> definition = validateDefinition(body);
    Integer id = jdbc.queryForObject("""
        insert into report_templates (name, trust_id)
        values (?, ?)
        returning id
        """, Integer.class, definition.get("name"), definition.get("trustId"));
    saveSheets(id, definition);
    return ResponseEntity.status(HttpStatus.CREATED).body(findTemplate(id));
  }

  @PutMapping("/report-templates/{templateId}")
  @Transactional
  public Map<String, Object> updateTemplate(
      @PathVariable int templateId,
      @RequestBody Map<String, Object> body) {
    findTemplate(templateId);
    Map<String, Object> definition = validateDefinition(body);
    jdbc.update(
        "update report_templates set name = ?, trust_id = ? where id = ?",
        definition.get("name"), definition.get("trustId"), templateId);
    jdbc.update("delete from report_template_sheets where template_id = ?", templateId);
    saveSheets(templateId, definition);
    return findTemplate(templateId);
  }

  @DeleteMapping("/report-templates/{templateId}")
  @Transactional
  public ResponseEntity<Void> deleteTemplate(@PathVariable int templateId) {
    findTemplate(templateId);
    jdbc.update("delete from report_templates where id = ?", templateId);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/report-templates/{templateId}/generate")
  public ResponseEntity<byte[]> generate(
      @PathVariable int templateId,
      @RequestBody Map<String, Object> body) {
    LocalDate asOfDate = requiredDate(body.get("asOfDate"));
    Map<String, Object> template = findTemplate(templateId);
    Integer trustId = nullableInteger(template.get("trustId"));
    if (trustId == null) {
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Assign this report template to a trust before generating it.");
    }
    int count = jdbc.queryForObject(
        "select count(*) from holdings where trust_id = ? and as_of_date = ?",
        Integer.class, trustId, Date.valueOf(asOfDate));
    if (count == 0) {
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND, "No holdings are available for this trust and month-end date.");
    }
    List<Map<String, Object>> holdings = jdbc.queryForList("""
        select cusip, issuer, asset_class as "assetClass",
          naic_designation_code as "naicDesignationCode",
          core_level1_code as "coreLevel1Code",
          core_level2_code as "coreLevel2Code",
          general_ledger_group as "generalLedgerGroup",
          bv_accrued as "bvAccrued", mv_accrued as "mvAccrued"
        from holdings
        where trust_id = ? and as_of_date = ?
        order by id
        """, trustId, Date.valueOf(asOfDate));
    byte[] workbook = workbookService.generate(template, holdings);
    String filename = safeFilename(text(template.get("name")) + "_" + asOfDate + ".xlsx");
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        .header(HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build()
                .toString())
        .body(workbook);
  }

  private Map<String, Object> validateDefinition(Map<String, Object> body) {
    String name = requiredText(body, "name", 180);
    Integer trustId = nullableInteger(body.get("trustId"));
    if (trustId != null) {
      requireTrust(trustId);
    }
    List<Map<String, Object>> inputSheets = objectList(body.get("sheets"), "sheets");
    if (inputSheets.isEmpty()) {
      throw new IllegalArgumentException("Add at least one sheet to the report template.");
    }
    Set<String> sheetNames = new HashSet<>();
    List<Map<String, Object>> sheets = new ArrayList<>();
    Set<Integer> sheetOrders = new HashSet<>();
    for (Map<String, Object> rawSheet : inputSheets) {
      String sheetName = requiredText(rawSheet, "name", 31);
      validateSheetName(sheetName);
      if (!sheetNames.add(sheetName.toLowerCase(Locale.ROOT))) {
        throw new IllegalArgumentException("Sheet names must be unique within a workbook.");
      }
      int order = requiredOrder(rawSheet, sheetOrders, "sheet");
      List<Map<String, Object>> inputSections =
          objectList(rawSheet.get("sections"), "sections");
      if (inputSections.isEmpty()) {
        throw new IllegalArgumentException("Each sheet must contain at least one section.");
      }
      List<Map<String, Object>> sections = new ArrayList<>();
      Set<Integer> sectionOrders = new HashSet<>();
      for (Map<String, Object> rawSection : inputSections) {
        String sectionName = requiredText(rawSection, "name", 120);
        int sectionOrder = requiredOrder(rawSection, sectionOrders, "section");
        boolean twoHeaderRows = requiredBoolean(rawSection, "twoHeaderRows");
        boolean showHoldings = requiredBoolean(rawSection, "showHoldings");
        boolean blankRowAfter = requiredBoolean(rawSection, "blankRowAfter");
        Map<String, Object> sectionStyle = validateStyle(rawSection);
        List<Map<String, Object>> inputColumns =
            objectList(rawSection.get("columns"), "columns");
        if (inputColumns.isEmpty()) {
          throw new IllegalArgumentException("Each section must contain at least one column.");
        }
        List<Map<String, Object>> columns = new ArrayList<>();
        Set<Integer> columnOrders = new HashSet<>();
        boolean hasAggregation = false;
        for (Map<String, Object> rawColumn : inputColumns) {
          String field = requiredText(rawColumn, "field", 64);
          if (!HOLDING_FIELDS.contains(field)) {
            throw new IllegalArgumentException("Choose a valid holding field for each column.");
          }
          int columnOrder = requiredOrder(rawColumn, columnOrders, "column");
          String headerLabel = requiredText(rawColumn, "headerLabel", 120);
          String secondHeaderLabel = nullableText(rawColumn.get("secondHeaderLabel"), 120);
          if (twoHeaderRows && (secondHeaderLabel == null || secondHeaderLabel.isBlank())) {
            throw new IllegalArgumentException(
                "Enter a second header label for every column in a two-row section.");
          }
          boolean aggregate = requiredBoolean(rawColumn, "aggregate");
          if (aggregate && !NUMERIC_FIELDS.contains(field)) {
            throw new IllegalArgumentException(
                "Only book value and market value columns can be aggregated.");
          }
          hasAggregation |= aggregate;
          Map<String, Object> columnStyle = validateStyle(rawColumn);
          columns.add(map(
              "field", field,
              "order", columnOrder,
              "headerLabel", headerLabel,
              "secondHeaderLabel", secondHeaderLabel,
              "headerBackgroundColor",
                  nullableColor(rawColumn.get("headerBackgroundColor"), "headerBackgroundColor"),
              "aggregate", aggregate,
              "bold", columnStyle.get("bold"),
              "italic", columnStyle.get("italic"),
              "textColor", columnStyle.get("textColor"),
              "backgroundColor", columnStyle.get("backgroundColor")));
        }
        if (!showHoldings && !hasAggregation) {
          throw new IllegalArgumentException(
              "A section that hides holdings must contain at least one aggregated column.");
        }
        String aggregationLabel = nullableText(rawSection.get("aggregationLabel"), 120);
        if (hasAggregation && (aggregationLabel == null || aggregationLabel.isBlank())) {
          throw new IllegalArgumentException(
              "Enter an aggregation row label when a section contains aggregated columns.");
        }
        if (!hasAggregation) {
          aggregationLabel = null;
        }
        sections.add(map(
            "name", sectionName,
            "order", sectionOrder,
            "twoHeaderRows", twoHeaderRows,
            "showHoldings", showHoldings,
            "blankRowAfter", blankRowAfter,
            "aggregationLabel", aggregationLabel,
            "bold", sectionStyle.get("bold"),
            "italic", sectionStyle.get("italic"),
            "textColor", sectionStyle.get("textColor"),
            "backgroundColor", sectionStyle.get("backgroundColor"),
            "columns", columns));
      }
      sheets.add(map("name", sheetName, "order", order, "sections", sections));
    }
    return map("name", name, "trustId", trustId, "sheets", sheets);
  }

  private Map<String, Object> validateStyle(Map<String, Object> input) {
    return map(
        "bold", requiredBoolean(input, "bold"),
        "italic", requiredBoolean(input, "italic"),
        "textColor", nullableColor(input.get("textColor"), "textColor"),
        "backgroundColor", nullableColor(input.get("backgroundColor"), "backgroundColor"));
  }

  private void saveSheets(int templateId, Map<String, Object> definition) {
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> sheets = (List<Map<String, Object>>) definition.get("sheets");
    for (Map<String, Object> sheet : sheets) {
      Integer sheetId = jdbc.queryForObject("""
          insert into report_template_sheets (template_id, name, order_index)
          values (?, ?, ?)
          returning id
          """, Integer.class, templateId, sheet.get("name"), sheet.get("order"));
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> sections = (List<Map<String, Object>>) sheet.get("sections");
      for (Map<String, Object> section : sections) {
        Integer sectionId = jdbc.queryForObject("""
            insert into report_template_sections
              (sheet_id, name, order_index, two_header_rows, show_holdings, blank_row_after,
               aggregation_label, bold, italic, text_color, background_color)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            returning id
            """, Integer.class,
            sheetId, section.get("name"), section.get("order"), section.get("twoHeaderRows"),
            section.get("showHoldings"), section.get("blankRowAfter"),
            section.get("aggregationLabel"), section.get("bold"), section.get("italic"),
            section.get("textColor"), section.get("backgroundColor"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> columns = (List<Map<String, Object>>) section.get("columns");
        for (Map<String, Object> column : columns) {
          jdbc.update("""
              insert into report_template_columns
                (section_id, field, order_index, header_label, second_header_label,
                 header_background_color, aggregate, bold, italic, text_color, background_color)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              """,
              sectionId, column.get("field"), column.get("order"), column.get("headerLabel"),
              column.get("secondHeaderLabel"), column.get("headerBackgroundColor"),
              column.get("aggregate"), column.get("bold"), column.get("italic"),
              column.get("textColor"), column.get("backgroundColor"));
        }
      }
    }
  }

  private Map<String, Object> findTemplate(int templateId) {
    try {
      return templateDto(jdbc.queryForMap("""
          select rt.id, rt.name, rt.trust_id, t.name as trust_name, rt.created_at
          from report_templates rt
          left join trusts t on t.id = rt.trust_id
          where rt.id = ?
          """, templateId));
    } catch (EmptyResultDataAccessException error) {
      throw notFound();
    }
  }

  private Map<String, Object> templateDto(Map<String, Object> row) {
    int templateId = ((Number) row.get("id")).intValue();
    List<Map<String, Object>> sheets = jdbc.queryForList("""
        select id, name, order_index as "order"
        from report_template_sheets
        where template_id = ?
        order by order_index, id
        """, templateId).stream().map(sheet -> {
      int sheetId = ((Number) sheet.get("id")).intValue();
      List<Map<String, Object>> sections = jdbc.queryForList("""
          select id, name, order_index as "order", two_header_rows as "twoHeaderRows",
            show_holdings as "showHoldings", blank_row_after as "blankRowAfter",
            aggregation_label as "aggregationLabel", bold, italic,
            text_color as "textColor", background_color as "backgroundColor"
          from report_template_sections
          where sheet_id = ?
          order by order_index, id
          """, sheetId).stream().map(section -> {
        int sectionId = ((Number) section.get("id")).intValue();
        List<Map<String, Object>> columns = jdbc.queryForList("""
            select field, order_index as "order", header_label as "headerLabel",
              second_header_label as "secondHeaderLabel",
              header_background_color as "headerBackgroundColor",
              aggregate, bold, italic, text_color as "textColor",
              background_color as "backgroundColor"
            from report_template_columns
            where section_id = ?
            order by order_index, id
            """, sectionId);
        return map(
            "name", section.get("name"),
            "order", ((Number) section.get("order")).intValue(),
            "twoHeaderRows", section.get("twoHeaderRows"),
            "showHoldings", section.get("showHoldings"),
            "blankRowAfter", section.get("blankRowAfter"),
            "aggregationLabel", section.get("aggregationLabel"),
            "bold", section.get("bold"),
            "italic", section.get("italic"),
            "textColor", section.get("textColor"),
            "backgroundColor", section.get("backgroundColor"),
            "columns", columns);
      }).toList();
      return map(
          "name", sheet.get("name"),
          "order", ((Number) sheet.get("order")).intValue(),
          "sections", sections);
    }).toList();
    return map(
        "id", templateId,
        "name", row.get("name"),
        "trustId", nullableInteger(row.get("trust_id")),
        "trustName", row.get("trust_name"),
        "createdAt", isoDateTime(row.get("created_at")),
        "sheets", sheets);
  }

  private int requiredOrder(
      Map<String, Object> input, Set<Integer> seen, String entity) {
    Integer order = nullableInteger(input.get("order"));
    if (order == null || order < 1) {
      throw new IllegalArgumentException(entity + " order must be a positive integer.");
    }
    if (!seen.add(order)) {
      throw new IllegalArgumentException(
          "Order values must be unique within each sheet, section, or column group.");
    }
    return order;
  }

  private static void validateSheetName(String name) {
    if (name.matches(".*[\\\\/?:*\\[\\]].*")
        || name.startsWith("'")
        || name.endsWith("'")) {
      throw new IllegalArgumentException(
          "Sheet names cannot contain Excel-reserved characters or begin or end with an apostrophe.");
    }
  }

  private static Map<String, Object> field(String field, String label, boolean numeric) {
    return map("field", field, "label", label, "numeric", numeric);
  }

  private static String safeFilename(String name) {
    String safe = name.replaceAll("[\\\\/\\r\\n\\\"<>|:*?]", "_").trim();
    return safe.isBlank() ? "trust-report.xlsx" : safe;
  }

  private void requireTrust(int trustId) {
    if (jdbc.queryForObject(
        "select count(*) from trusts where id = ?", Integer.class, trustId) == 0) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Trust not found.");
    }
  }

  private static String requiredText(
      Map<String, Object> input, String key, int maxLength) {
    Object value = input.get(key);
    if (!(value instanceof String text) || text.isBlank()) {
      throw new IllegalArgumentException(key + " is required.");
    }
    String normalized = text.trim();
    if (normalized.length() > maxLength) {
      throw new IllegalArgumentException(key + " must be " + maxLength + " characters or fewer.");
    }
    return normalized;
  }

  private static String nullableText(Object value, int maxLength) {
    if (value == null) {
      return null;
    }
    if (!(value instanceof String text)) {
      throw new IllegalArgumentException("Optional text fields must be strings.");
    }
    String normalized = text.trim();
    if (normalized.length() > maxLength) {
      throw new IllegalArgumentException(
          "Optional text fields must be " + maxLength + " characters or fewer.");
    }
    return normalized.isEmpty() ? null : normalized;
  }

  private static String nullableColor(Object value, String field) {
    String color = nullableText(value, 7);
    if (color == null) {
      return null;
    }
    if (!color.matches("#[0-9A-Fa-f]{6}")) {
      throw new IllegalArgumentException(field + " must be a six-digit hexadecimal color.");
    }
    return color.toUpperCase(Locale.ROOT);
  }

  private static boolean requiredBoolean(Map<String, Object> input, String key) {
    Object value = input.get(key);
    if (!(value instanceof Boolean result)) {
      throw new IllegalArgumentException(key + " must be true or false.");
    }
    return result;
  }

  private static List<Map<String, Object>> objectList(Object value, String name) {
    if (!(value instanceof List<?> list)) {
      throw new IllegalArgumentException(name + " must be an array.");
    }
    List<Map<String, Object>> result = new ArrayList<>();
    for (Object child : list) {
      if (!(child instanceof Map<?, ?> raw)) {
        throw new IllegalArgumentException(name + " must contain only objects.");
      }
      @SuppressWarnings("unchecked")
      Map<String, Object> object = (Map<String, Object>) raw;
      result.add(object);
    }
    return result;
  }

  private static Integer nullableInteger(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Number number) {
      int parsed = number.intValue();
      if (number.doubleValue() != parsed) {
        throw new IllegalArgumentException("Expected a whole-number identifier.");
      }
      return parsed;
    }
    try {
      return Integer.valueOf(value.toString());
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException("Expected a whole-number identifier.");
    }
  }

  private static LocalDate requiredDate(Object value) {
    try {
      return LocalDate.parse(value.toString());
    } catch (Exception error) {
      throw new IllegalArgumentException("asOfDate must be a valid calendar date.");
    }
  }

  private static String isoDateTime(Object value) {
    if (value instanceof OffsetDateTime dateTime) {
      return dateTime.toString();
    }
    if (value instanceof Timestamp timestamp) {
      return timestamp.toInstant().toString();
    }
    if (value instanceof Instant instant) {
      return instant.toString();
    }
    return String.valueOf(value);
  }

  private static String text(Object value) {
    return value == null ? "" : value.toString();
  }

  private static ResponseStatusException notFound() {
    return new ResponseStatusException(
        HttpStatus.NOT_FOUND, "Excel report template not found.");
  }

  private static Map<String, Object> map(Object... pairs) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) {
      result.put((String) pairs[i], pairs[i + 1]);
    }
    return result;
  }
}
