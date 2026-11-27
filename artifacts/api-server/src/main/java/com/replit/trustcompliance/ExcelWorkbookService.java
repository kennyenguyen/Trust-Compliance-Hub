package com.replit.trustcompliance;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.DefaultIndexedColorMap;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

@Service
public class ExcelWorkbookService {
  private static final int EXCEL_MAX_ROWS = 1_048_576;

  public byte[] generate(Map<String, Object> template, List<Map<String, Object>> holdings) {
    try (XSSFWorkbook workbook = new XSSFWorkbook();
        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      Map<StyleKey, CellStyle> styles = new HashMap<>();
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> sheets =
          (List<Map<String, Object>>) template.get("sheets");

      for (Map<String, Object> sheetDefinition : sheets) {
        Sheet sheet = workbook.createSheet(text(sheetDefinition.get("name")));
        sheet.createFreezePane(0, 1);
        int rowIndex = 0;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sections =
            (List<Map<String, Object>>) sheetDefinition.get("sections");
        for (Map<String, Object> section : sections) {
          rowIndex = writeSection(workbook, sheet, rowIndex, section, holdings, styles);
          if (bool(section.get("blankRowAfter"))) {
            rowIndex = ensureRowLimit(rowIndex + 1);
          }
        }
        sheet.setColumnWidth(0, 24 * 256);
        int maxColumns = sections.stream()
            .mapToInt(section -> nestedColumns(section).size())
            .max().orElse(1);
        for (int column = 1; column < maxColumns; column++) {
          sheet.setColumnWidth(column, 18 * 256);
        }
      }
      workbook.write(output);
      return output.toByteArray();
    } catch (IOException error) {
      throw new IllegalStateException("The Excel workbook could not be generated.", error);
    }
  }

  private int writeSection(
      XSSFWorkbook workbook,
      Sheet sheet,
      int rowIndex,
      Map<String, Object> section,
      List<Map<String, Object>> holdings,
      Map<StyleKey, CellStyle> styles) {
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> columns =
        (List<Map<String, Object>>) section.get("columns");
    int width = Math.max(1, columns.size());

    Row title = sheet.createRow(ensureRowLimit(rowIndex++));
    Cell titleCell = title.createCell(0);
    titleCell.setCellValue(text(section.get("name")));
    titleCell.setCellStyle(style(workbook, styles, sectionStyle(section, null, false)));
    for (int columnIndex = 1; columnIndex < width; columnIndex++) {
      title.createCell(columnIndex).setCellStyle(
          style(workbook, styles, sectionStyle(section, null, false)));
    }
    if (width > 1) {
      sheet.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(
          title.getRowNum(), title.getRowNum(), 0, width - 1));
    }

    boolean showHoldings = bool(section.get("showHoldings"));
    if (showHoldings) {
      boolean twoHeaderRows = bool(section.get("twoHeaderRows"));
      int headerRows = twoHeaderRows ? 2 : 1;
      for (int headerRow = 0; headerRow < headerRows; headerRow++) {
        Row row = sheet.createRow(ensureRowLimit(rowIndex++));
        for (int columnIndex = 0; columnIndex < columns.size(); columnIndex++) {
          Map<String, Object> column = columns.get(columnIndex);
          String label = headerRow == 1
              ? text(column.get("secondHeaderLabel"))
              : text(column.get("headerLabel"));
          Cell cell = row.createCell(columnIndex);
          cell.setCellValue(label);
          cell.setCellStyle(style(workbook, styles,
              columnStyle(section, column, column.get("headerBackgroundColor"), false)));
        }
      }

      for (Map<String, Object> holding : holdings) {
        Row row = sheet.createRow(ensureRowLimit(rowIndex++));
        for (int columnIndex = 0; columnIndex < columns.size(); columnIndex++) {
          Map<String, Object> column = columns.get(columnIndex);
          Object value = holding.get(text(column.get("field")));
          Cell cell = row.createCell(columnIndex);
          setCellValue(cell, value);
          cell.setCellStyle(style(workbook, styles, columnStyle(section, column, null,
              isNumericField(column.get("field")))));
        }
      }
    }

    List<Map<String, Object>> aggregatedColumns = columns.stream()
        .filter(column -> bool(column.get("aggregate")))
        .toList();
    if (!aggregatedColumns.isEmpty()) {
      Row totals = sheet.createRow(ensureRowLimit(rowIndex++));
      int labelIndex = -1;
      for (int columnIndex = 0; columnIndex < columns.size(); columnIndex++) {
        if (!bool(columns.get(columnIndex).get("aggregate"))) {
          labelIndex = columnIndex;
          break;
        }
      }
      if (labelIndex >= 0) {
        Cell label = totals.createCell(labelIndex);
        label.setCellValue(text(section.get("aggregationLabel")));
        label.setCellStyle(style(workbook, styles, sectionStyle(section, null, false)));
      }
      for (int columnIndex = 0; columnIndex < columns.size(); columnIndex++) {
        Map<String, Object> column = columns.get(columnIndex);
        if (!bool(column.get("aggregate"))) {
          if (columnIndex != labelIndex) {
            totals.createCell(columnIndex);
          }
          continue;
        }
        BigDecimal sum = holdings.stream()
            .map(holding -> decimal(holding.get(text(column.get("field")))))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        Cell cell = totals.createCell(columnIndex);
        cell.setCellValue(sum.doubleValue());
        cell.setCellStyle(style(workbook, styles,
            columnStyle(section, column, null, true)));
      }
      if (labelIndex < 0) {
        Cell label = totals.createCell(columns.size());
        label.setCellValue(text(section.get("aggregationLabel")));
        label.setCellStyle(style(workbook, styles, sectionStyle(section, null, false)));
        sheet.setColumnWidth(columns.size(), 24 * 256);
      }
    }
    return rowIndex;
  }

  private static StyleKey sectionStyle(
      Map<String, Object> section, String headerBackground, boolean numeric) {
    return new StyleKey(
        bool(section.get("bold")),
        bool(section.get("italic")),
        nullableText(section.get("textColor")),
        headerBackground != null ? headerBackground : nullableText(section.get("backgroundColor")),
        numeric ? "#,##0.00;[Red](#,##0.00)" : null);
  }

  private static StyleKey columnStyle(
      Map<String, Object> section,
      Map<String, Object> column,
      Object headerBackground,
      boolean numeric) {
    return new StyleKey(
        bool(section.get("bold")) || bool(column.get("bold")),
        bool(section.get("italic")) || bool(column.get("italic")),
        nullableText(column.get("textColor")) != null
            ? nullableText(column.get("textColor"))
            : nullableText(section.get("textColor")),
        headerBackground != null
            ? nullableText(headerBackground)
            : nullableText(column.get("backgroundColor")) != null
                ? nullableText(column.get("backgroundColor"))
                : nullableText(section.get("backgroundColor")),
        numeric ? "#,##0.00;[Red](#,##0.00)" : null);
  }

  private static CellStyle style(
      XSSFWorkbook workbook, Map<StyleKey, CellStyle> styles, StyleKey key) {
    return styles.computeIfAbsent(key, styleKey -> {
      XSSFCellStyle cellStyle = workbook.createCellStyle();
      XSSFFont font = workbook.createFont();
      font.setBold(styleKey.bold());
      font.setItalic(styleKey.italic());
      if (styleKey.textColor() != null) {
        font.setColor(color(styleKey.textColor()));
      }
      cellStyle.setFont(font);
      if (styleKey.backgroundColor() != null) {
        cellStyle.setFillForegroundColor(color(styleKey.backgroundColor()));
        cellStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
      }
      if (styleKey.dataFormat() != null) {
        cellStyle.setDataFormat(
            workbook.createDataFormat().getFormat(styleKey.dataFormat()));
      }
      return cellStyle;
    });
  }

  private static XSSFColor color(String hex) {
    byte[] rgb = new byte[] {
      (byte) Integer.parseInt(hex.substring(1, 3), 16),
      (byte) Integer.parseInt(hex.substring(3, 5), 16),
      (byte) Integer.parseInt(hex.substring(5, 7), 16)
    };
    return new XSSFColor(rgb, new DefaultIndexedColorMap());
  }

  private static void setCellValue(Cell cell, Object value) {
    if (value == null) {
      cell.setBlank();
    } else if (value instanceof Number number) {
      cell.setCellValue(number.doubleValue());
    } else if (value instanceof java.sql.Date date) {
      cell.setCellValue(date.toLocalDate().toString());
    } else {
      cell.setCellValue(value.toString());
    }
  }

  private static boolean isNumericField(Object field) {
    return "bvAccrued".equals(field) || "mvAccrued".equals(field);
  }

  private static BigDecimal decimal(Object value) {
    if (value == null) {
      return BigDecimal.ZERO;
    }
    if (value instanceof BigDecimal amount) {
      return amount;
    }
    return new BigDecimal(value.toString());
  }

  private static int ensureRowLimit(int rowIndex) {
    if (rowIndex < 0 || rowIndex >= EXCEL_MAX_ROWS) {
      throw new IllegalArgumentException("The report exceeds Excel's worksheet row limit.");
    }
    return rowIndex;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> nestedColumns(Map<String, Object> section) {
    return (List<Map<String, Object>>) section.get("columns");
  }

  private static boolean bool(Object value) {
    return Boolean.TRUE.equals(value);
  }

  private static String text(Object value) {
    return value == null ? "" : value.toString();
  }

  private static String nullableText(Object value) {
    String text = text(value).trim();
    return text.isEmpty() ? null : text;
  }

  private record StyleKey(
      boolean bold,
      boolean italic,
      String textColor,
      String backgroundColor,
      String dataFormat) {}
}
