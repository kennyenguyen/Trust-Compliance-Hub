package com.replit.trustcompliance;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

@Component
public class RuleSqlCompiler {
  private static final Map<String, String> COLUMNS = Map.ofEntries(
      Map.entry("naic_designation_code", "naic_designation_code"),
      Map.entry("core_level1_code", "core_level1_code"),
      Map.entry("core_level2_code", "core_level2_code"),
      Map.entry("general_ledger_group", "general_ledger_group"),
      Map.entry("cusip", "cusip"),
      Map.entry("issuer", "issuer"),
      Map.entry("asset_class", "asset_class"),
      Map.entry("bv_accrued", "bv_accrued"),
      Map.entry("mv_accrued", "mv_accrued"));
  private static final Set<String> NUMERIC_FIELDS = Set.of("bv_accrued", "mv_accrued");
  private static final Map<String, String> COMPARATORS = Map.of(
      "EQ", "=",
      "NE", "<>",
      "LIKE", "LIKE",
      "NOT_LIKE", "NOT LIKE",
      "LT", "<",
      "LTE", "<=",
      "GT", ">",
      "GTE", ">=");

  public record Compiled(String sql, List<Object> parameters) {}

  public Compiled compile(Map<String, Object> root) {
    if (!"group".equals(root.get("nodeType"))) {
      throw new IllegalArgumentException("The rule must have one top-level AND/OR group.");
    }
    List<Object> parameters = new ArrayList<>();
    String sql = compileNode(root, parameters, 0, new int[] {0});
    return new Compiled(sql, parameters);
  }

  private String compileNode(
      Map<String, Object> node,
      List<Object> parameters,
      int depth,
      int[] nodeCount) {
    if (depth > 12 || ++nodeCount[0] > 120) {
      throw new IllegalArgumentException("Rule criteria is too deeply nested or has too many nodes.");
    }
    Object nodeType = node.get("nodeType");
    if ("group".equals(nodeType)) {
      Object rawOperator = node.get("operator");
      if (!(rawOperator instanceof String operator) ||
          !("AND".equals(operator) || "OR".equals(operator))) {
        throw new IllegalArgumentException("Each criteria group must use AND or OR.");
      }
      Object rawChildren = node.get("children");
      if (!(rawChildren instanceof List<?> children) || children.isEmpty()) {
        throw new IllegalArgumentException("Each criteria group needs at least one condition or group.");
      }
      List<String> parts = new ArrayList<>();
      for (Object child : children) {
        if (!(child instanceof Map<?, ?> rawMap)) {
          throw new IllegalArgumentException("Criteria children must be groups or conditions.");
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> childMap = (Map<String, Object>) rawMap;
        parts.add(compileNode(childMap, parameters, depth + 1, nodeCount));
      }
      return "(" + String.join(" " + operator + " ", parts) + ")";
    }
    if (!"condition".equals(nodeType)) {
      throw new IllegalArgumentException("Criteria nodes must be groups or conditions.");
    }

    Object rawField = node.get("field");
    Object rawComparator = node.get("comparator");
    if (!(rawField instanceof String field) || !COLUMNS.containsKey(field)) {
      throw new IllegalArgumentException("The criteria field is not supported.");
    }
    if (!(rawComparator instanceof String comparator) || !COMPARATORS.containsKey(comparator)) {
      throw new IllegalArgumentException("The criteria comparator is not supported.");
    }
    if (!node.containsKey("value") || node.get("value") == null) {
      throw new IllegalArgumentException("Every condition needs a value.");
    }

    Object value = node.get("value");
    if (NUMERIC_FIELDS.contains(field)) {
      if ("LIKE".equals(comparator) || "NOT_LIKE".equals(comparator)) {
        throw new IllegalArgumentException("LIKE comparisons require a text field.");
      }
      try {
        value = new BigDecimal(value.toString());
      } catch (NumberFormatException error) {
        throw new IllegalArgumentException("Numeric fields need a numeric comparison value.");
      }
    } else if ("LIKE".equals(comparator) || "NOT_LIKE".equals(comparator)) {
      value = value.toString();
    } else {
      value = value.toString();
    }
    parameters.add(value);
    return "\"" + COLUMNS.get(field) + "\" " + COMPARATORS.get(comparator) + " ?";
  }

  public String sqlComparator(String comparator) {
    String result = COMPARATORS.get(comparator);
    if (result == null || "LIKE".equals(comparator) || "NOT_LIKE".equals(comparator)) {
      throw new IllegalArgumentException("The limit comparator is not supported.");
    }
    return result;
  }
}
