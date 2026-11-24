package com.replit.trustcompliance;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.postgresql.util.PGobject;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TrustComplianceController {
  private static final Set<String> LIMIT_METRICS = Set.of("total_bv", "total_mv", "actual_pct");

  private final JdbcTemplate jdbc;
  private final ObjectMapper objectMapper;
  private final RuleSqlCompiler ruleSqlCompiler;

  public TrustComplianceController(
      JdbcTemplate jdbc,
      ObjectMapper objectMapper,
      RuleSqlCompiler ruleSqlCompiler) {
    this.jdbc = jdbc;
    this.objectMapper = objectMapper;
    this.ruleSqlCompiler = ruleSqlCompiler;
  }

  @GetMapping("/healthz")
  public Map<String, Object> health() {
    jdbc.queryForObject("select 1", Integer.class);
    return map("status", "ok");
  }

  @GetMapping("/summary")
  public Map<String, Object> summary() {
    List<Map<String, Object>> recent = recentReports(null);
    return map(
        "trustCount", jdbc.queryForObject("select count(*) from trusts", Integer.class),
        "portfolioCount", jdbc.queryForObject("select count(*) from portfolios", Integer.class),
        "ruleCount", jdbc.queryForObject("select count(*) from compliance_rules where enabled = true", Integer.class),
        "latestReport", recent.isEmpty() ? null : recent.get(0));
  }

  @GetMapping("/portfolios")
  public List<Map<String, Object>> portfolios() {
    return jdbc.queryForList("""
        select p.id, p.name, p.code, t.id as trust_id, t.name as trust_name
        from portfolios p
        left join trusts t on t.portfolio_id = p.id
        order by p.name
        """).stream().map(this::portfolioDto).toList();
  }

  @PostMapping("/portfolios")
  public ResponseEntity<Map<String, Object>> createPortfolio(@RequestBody Map<String, Object> body) {
    String name = requiredText(body, "name");
    String code = requiredText(body, "code");
    Integer id = jdbc.queryForObject(
        "insert into portfolios (name, code) values (?, ?) returning id",
        Integer.class, name, code);
    return ResponseEntity.status(HttpStatus.CREATED).body(findPortfolio(id));
  }

  @PatchMapping("/portfolios/{portfolioId}")
  public Map<String, Object> updatePortfolio(
      @PathVariable int portfolioId,
      @RequestBody Map<String, Object> body) {
    requirePortfolio(portfolioId);
    List<String> sets = new ArrayList<>();
    List<Object> values = new ArrayList<>();
    if (body.containsKey("name")) {
      sets.add("name = ?");
      values.add(requiredText(body, "name"));
    }
    if (body.containsKey("code")) {
      sets.add("code = ?");
      values.add(requiredText(body, "code"));
    }
    if (sets.isEmpty()) {
      throw new IllegalArgumentException("Provide a portfolio name or code to update.");
    }
    values.add(portfolioId);
    jdbc.update("update portfolios set " + String.join(", ", sets) + " where id = ?", values.toArray());
    return findPortfolio(portfolioId);
  }

  @DeleteMapping("/portfolios/{portfolioId}")
  public ResponseEntity<Void> deletePortfolio(@PathVariable int portfolioId) {
    requirePortfolio(portfolioId);
    int assignments = jdbc.queryForObject(
        "select count(*) from trusts where portfolio_id = ?", Integer.class, portfolioId);
    if (assignments > 0) {
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "This portfolio is assigned to a trust. Reassign the trust before deleting it.");
    }
    if (jdbc.update("delete from portfolios where id = ?", portfolioId) == 0) {
      throw notFound("Portfolio");
    }
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/trusts")
  public List<Map<String, Object>> trusts() {
    return jdbc.queryForList("""
        select t.id, t.name, t.code, t.portfolio_id, p.name as portfolio_name
        from trusts t
        left join portfolios p on p.id = t.portfolio_id
        order by t.name
        """).stream().map(this::trustDto).toList();
  }

  @PostMapping("/trusts")
  public ResponseEntity<Map<String, Object>> createTrust(@RequestBody Map<String, Object> body) {
    String name = requiredText(body, "name");
    String code = requiredText(body, "code");
    Integer portfolioId = nullableInteger(body.get("portfolioId"));
    requirePortfolioIfPresent(portfolioId);
    Integer id = jdbc.queryForObject(
        "insert into trusts (name, code, portfolio_id) values (?, ?, ?) returning id",
        Integer.class, name, code, portfolioId);
    return ResponseEntity.status(HttpStatus.CREATED).body(findTrust(id));
  }

  @PatchMapping("/trusts/{trustId}")
  public Map<String, Object> updateTrust(
      @PathVariable int trustId,
      @RequestBody Map<String, Object> body) {
    requireTrust(trustId);
    List<String> sets = new ArrayList<>();
    List<Object> values = new ArrayList<>();
    if (body.containsKey("name")) {
      sets.add("name = ?");
      values.add(requiredText(body, "name"));
    }
    if (body.containsKey("code")) {
      sets.add("code = ?");
      values.add(requiredText(body, "code"));
    }
    if (body.containsKey("portfolioId")) {
      Integer portfolioId = nullableInteger(body.get("portfolioId"));
      requirePortfolioIfPresent(portfolioId);
      sets.add("portfolio_id = ?");
      values.add(portfolioId);
    }
    if (sets.isEmpty()) {
      throw new IllegalArgumentException("Provide a trust name, code, or portfolio assignment to update.");
    }
    values.add(trustId);
    jdbc.update("update trusts set " + String.join(", ", sets) + " where id = ?", values.toArray());
    return findTrust(trustId);
  }

  @DeleteMapping("/trusts/{trustId}")
  public ResponseEntity<Void> deleteTrust(@PathVariable int trustId) {
    requireTrust(trustId);
    int holdings = jdbc.queryForObject(
        "select count(*) from holdings where trust_id = ?", Integer.class, trustId);
    int reports = jdbc.queryForObject(
        "select count(*) from compliance_reports where trust_id = ?", Integer.class, trustId);
    if (holdings > 0 || reports > 0) {
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "This trust has holdings or reports. Remove its records before deleting the trust.");
    }
    jdbc.update("delete from trusts where id = ?", trustId);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/rules")
  public List<Map<String, Object>> rules(@RequestParam(required = false) Integer trustId) {
    String sql = """
        select r.*, t.name as trust_name
        from compliance_rules r
        left join trusts t on t.id = r.trust_id
        """;
    List<Map<String, Object>> rows;
    if (trustId == null) {
      rows = jdbc.queryForList(sql + " order by r.created_at desc, r.id desc");
    } else {
      requireTrust(trustId);
      rows = jdbc.queryForList(
          sql + " where r.trust_id is null or r.trust_id = ? order by r.created_at desc, r.id desc",
          trustId);
    }
    return rows.stream().map(this::ruleDto).toList();
  }

  @PostMapping("/rules")
  public ResponseEntity<Map<String, Object>> createRule(@RequestBody Map<String, Object> body) {
    String name = requiredText(body, "name");
    Integer trustId = nullableInteger(body.get("trustId"));
    requireTrustIfPresent(trustId);
    boolean enabled = booleanValue(body.getOrDefault("enabled", true));
    Map<String, Object> criteria = objectMap(body.get("aggregationCriteria"), "aggregationCriteria");
    ruleSqlCompiler.compile(criteria);
    Map<String, Object> limit = validateLimit(body.get("limit"));
    Integer id = jdbc.queryForObject("""
        insert into compliance_rules
          (name, trust_id, enabled, aggregation_criteria, limit_metric, limit_comparator, limit_value)
        values (?, ?, ?, ?::jsonb, ?, ?, ?)
        returning id
        """, Integer.class,
        name, trustId, enabled, toJson(criteria), limit.get("metric"),
        limit.get("comparator"), limit.get("value"));
    return ResponseEntity.status(HttpStatus.CREATED).body(findRule(id));
  }

  @PatchMapping("/rules/{ruleId}")
  public Map<String, Object> updateRule(
      @PathVariable int ruleId,
      @RequestBody Map<String, Object> body) {
    findRule(ruleId);
    List<String> sets = new ArrayList<>();
    List<Object> values = new ArrayList<>();
    if (body.containsKey("name")) {
      sets.add("name = ?");
      values.add(requiredText(body, "name"));
    }
    if (body.containsKey("trustId")) {
      Integer trustId = nullableInteger(body.get("trustId"));
      requireTrustIfPresent(trustId);
      sets.add("trust_id = ?");
      values.add(trustId);
    }
    if (body.containsKey("enabled")) {
      sets.add("enabled = ?");
      values.add(booleanValue(body.get("enabled")));
    }
    if (body.containsKey("aggregationCriteria")) {
      Map<String, Object> criteria = objectMap(body.get("aggregationCriteria"), "aggregationCriteria");
      ruleSqlCompiler.compile(criteria);
      sets.add("aggregation_criteria = ?::jsonb");
      values.add(toJson(criteria));
    }
    if (body.containsKey("limit")) {
      Map<String, Object> limit = validateLimit(body.get("limit"));
      sets.add("limit_metric = ?");
      values.add(limit.get("metric"));
      sets.add("limit_comparator = ?");
      values.add(limit.get("comparator"));
      sets.add("limit_value = ?");
      values.add(limit.get("value"));
    }
    if (sets.isEmpty()) {
      throw new IllegalArgumentException("Provide at least one rule field to update.");
    }
    values.add(ruleId);
    jdbc.update("update compliance_rules set " + String.join(", ", sets) + " where id = ?", values.toArray());
    return findRule(ruleId);
  }

  @DeleteMapping("/rules/{ruleId}")
  public ResponseEntity<Void> deleteRule(@PathVariable int ruleId) {
    if (jdbc.update("delete from compliance_rules where id = ?", ruleId) == 0) {
      throw notFound("Compliance rule");
    }
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/holdings/as-of-dates")
  public List<String> holdingDates(@RequestParam int trustId) {
    requireTrust(trustId);
    return jdbc.query(
        "select distinct as_of_date from holdings where trust_id = ? order by as_of_date desc",
        (resultSet, rowNum) -> resultSet.getDate(1).toLocalDate().toString(),
        trustId);
  }

  @GetMapping("/holdings")
  public List<Map<String, Object>> holdings(
      @RequestParam int trustId,
      @RequestParam LocalDate asOfDate) {
    requireTrust(trustId);
    return getHoldingRows(trustId, asOfDate);
  }

  @PutMapping("/holdings/bulk")
  @Transactional
  public List<Map<String, Object>> updateHoldings(@RequestBody Map<String, Object> body) {
    int trustId = requiredInteger(body.get("trustId"), "trustId");
    LocalDate asOfDate = requiredDate(body.get("asOfDate"), "asOfDate");
    requireTrust(trustId);
    Object rawHoldings = body.get("holdings");
    if (!(rawHoldings instanceof List<?> rows)) {
      throw new IllegalArgumentException("Holdings must be an array.");
    }
    Set<Integer> ids = new HashSet<>();
    for (Object rawRow : rows) {
      Map<String, Object> row = objectMap(rawRow, "holding");
      int id = requiredInteger(row.get("id"), "id");
      if (!ids.add(id)) {
        throw new IllegalArgumentException("A holding can only appear once in a save request.");
      }
      Object[] values = {
        requiredText(row, "cusip"),
        requiredText(row, "issuer"),
        requiredText(row, "assetClass"),
        requiredText(row, "naicDesignationCode"),
        requiredText(row, "coreLevel1Code"),
        requiredText(row, "coreLevel2Code"),
        requiredText(row, "generalLedgerGroup"),
        requiredDecimal(row.get("bvAccrued"), "bvAccrued"),
        requiredDecimal(row.get("mvAccrued"), "mvAccrued"),
        id,
        trustId,
        Date.valueOf(asOfDate)
      };
      int changed = jdbc.update("""
          update holdings set cusip = ?, issuer = ?, asset_class = ?,
            naic_designation_code = ?, core_level1_code = ?, core_level2_code = ?,
            general_ledger_group = ?, bv_accrued = ?, mv_accrued = ?
          where id = ? and trust_id = ? and as_of_date = ?
          """, values);
      if (changed != 1) {
        throw notFound("Holding");
      }
    }
    return getHoldingRows(trustId, asOfDate);
  }

  @GetMapping("/reports")
  public List<Map<String, Object>> reports(@RequestParam(required = false) Integer trustId) {
    return recentReports(trustId);
  }

  @PostMapping("/reports/run")
  public ResponseEntity<Map<String, Object>> runReport(@RequestBody Map<String, Object> body) {
    int trustId = requiredInteger(body.get("trustId"), "trustId");
    LocalDate asOfDate = requiredDate(body.get("asOfDate"), "asOfDate");
    Map<String, Object> trust = findTrust(trustId);
    int totalHoldingCount = jdbc.queryForObject(
        "select count(*) from holdings where trust_id = ? and as_of_date = ?",
        Integer.class, trustId, Date.valueOf(asOfDate));
    if (totalHoldingCount == 0) {
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND,
          "No holdings are available for this trust and as-of date.");
    }
    BigDecimal trustBookValue = jdbc.queryForObject("""
        select coalesce(sum(bv_accrued), 0)
        from holdings where trust_id = ? and as_of_date = ?
        """, BigDecimal.class, trustId, Date.valueOf(asOfDate));
    List<Map<String, Object>> ruleRows = jdbc.queryForList("""
        select * from compliance_rules
        where enabled = true and (trust_id is null or trust_id = ?)
        order by id
        """, trustId);
    List<Map<String, Object>> results = new ArrayList<>();
    int passCount = 0;
    int failCount = 0;
    for (Map<String, Object> rule : ruleRows) {
      Map<String, Object> criteria = objectMap(readJson(rule.get("aggregation_criteria")), "aggregationCriteria");
      RuleSqlCompiler.Compiled compiled = ruleSqlCompiler.compile(criteria);
      String sql = """
          select coalesce(sum("bv_accrued"), 0) as total_bv,
                 coalesce(sum("mv_accrued"), 0) as total_mv,
                 count(*) as selected_count
          from "holdings"
          where "trust_id" = ? and "as_of_date" = ? and
          """ + compiled.sql();
      List<Object> parameters = new ArrayList<>();
      parameters.add(trustId);
      parameters.add(Date.valueOf(asOfDate));
      parameters.addAll(compiled.parameters());
      Map<String, Object> aggregate = jdbc.queryForMap(sql, parameters.toArray());
      BigDecimal bookValue = decimalOrZero(aggregate.get("total_bv"));
      BigDecimal marketValue = decimalOrZero(aggregate.get("total_mv"));
      String metric = stringValue(rule.get("limit_metric"));
      BigDecimal measured = switch (metric) {
        case "total_bv" -> bookValue;
        case "total_mv" -> marketValue;
        case "actual_pct" -> trustBookValue.signum() == 0
            ? BigDecimal.ZERO
            : bookValue.multiply(BigDecimal.valueOf(100))
                .divide(trustBookValue, 10, RoundingMode.HALF_UP);
        default -> throw new IllegalArgumentException("The rule limit metric is not supported.");
      };
      String comparator = stringValue(rule.get("limit_comparator"));
      BigDecimal limitValue = decimalOrZero(rule.get("limit_value"));
      boolean passes = compare(measured, limitValue, comparator);
      if (passes) {
        passCount++;
      } else {
        failCount++;
      }
      results.add(map(
          "ruleId", ((Number) rule.get("id")).intValue(),
          "ruleName", stringValue(rule.get("name")),
          "status", passes ? "PASS" : "FAIL",
          "measuredValue", measured.doubleValue(),
          "limitMetric", metric,
          "limitComparator", comparator,
          "limitValue", limitValue.doubleValue(),
          "selectedHoldingCount", ((Number) aggregate.get("selected_count")).intValue(),
          "sql", sql.replaceAll("\\s+", " ").trim()));
    }
    Integer reportId = jdbc.queryForObject("""
        insert into compliance_reports
          (trust_id, as_of_date, total_holding_count, pass_count, fail_count, results)
        values (?, ?, ?, ?, ?, ?::jsonb)
        returning id
        """, Integer.class,
        trustId, Date.valueOf(asOfDate), totalHoldingCount, passCount, failCount, toJson(results));
    return ResponseEntity.status(HttpStatus.CREATED).body(findReport(reportId));
  }

  private List<Map<String, Object>> getHoldingRows(int trustId, LocalDate asOfDate) {
    return jdbc.queryForList("""
        select id, trust_id, as_of_date, cusip, issuer, asset_class,
          naic_designation_code, core_level1_code, core_level2_code,
          general_ledger_group, bv_accrued, mv_accrued
        from holdings
        where trust_id = ? and as_of_date = ?
        order by id
        """, trustId, Date.valueOf(asOfDate)).stream().map(this::holdingDto).toList();
  }

  private List<Map<String, Object>> recentReports(Integer trustId) {
    List<Map<String, Object>> rows;
    if (trustId == null) {
      rows = jdbc.queryForList("""
          select r.*, t.name as trust_name
          from compliance_reports r join trusts t on t.id = r.trust_id
          order by r.run_at desc, r.id desc limit 10
          """);
    } else {
      requireTrust(trustId);
      rows = jdbc.queryForList("""
          select r.*, t.name as trust_name
          from compliance_reports r join trusts t on t.id = r.trust_id
          where r.trust_id = ?
          order by r.run_at desc, r.id desc limit 10
          """, trustId);
    }
    return rows.stream().map(this::reportDto).toList();
  }

  private Map<String, Object> findReport(int id) {
    try {
      return reportDto(jdbc.queryForMap("""
          select r.*, t.name as trust_name
          from compliance_reports r join trusts t on t.id = r.trust_id
          where r.id = ?
          """, id));
    } catch (EmptyResultDataAccessException error) {
      throw notFound("Compliance report");
    }
  }

  private Map<String, Object> findPortfolio(int id) {
    try {
      return portfolioDto(jdbc.queryForMap("""
          select p.id, p.name, p.code, t.id as trust_id, t.name as trust_name
          from portfolios p left join trusts t on t.portfolio_id = p.id
          where p.id = ?
          """, id));
    } catch (EmptyResultDataAccessException error) {
      throw notFound("Portfolio");
    }
  }

  private Map<String, Object> findTrust(int id) {
    try {
      return trustDto(jdbc.queryForMap("""
          select t.id, t.name, t.code, t.portfolio_id, p.name as portfolio_name
          from trusts t left join portfolios p on p.id = t.portfolio_id
          where t.id = ?
          """, id));
    } catch (EmptyResultDataAccessException error) {
      throw notFound("Trust");
    }
  }

  private Map<String, Object> findRule(int id) {
    try {
      return ruleDto(jdbc.queryForMap("""
          select r.*, t.name as trust_name
          from compliance_rules r left join trusts t on t.id = r.trust_id
          where r.id = ?
          """, id));
    } catch (EmptyResultDataAccessException error) {
      throw notFound("Compliance rule");
    }
  }

  private Map<String, Object> portfolioDto(Map<String, Object> row) {
    return map(
        "id", ((Number) row.get("id")).intValue(),
        "name", row.get("name"),
        "code", row.get("code"),
        "trustId", nullableInt(row.get("trust_id")),
        "trustName", row.get("trust_name"));
  }

  private Map<String, Object> trustDto(Map<String, Object> row) {
    return map(
        "id", ((Number) row.get("id")).intValue(),
        "name", row.get("name"),
        "code", row.get("code"),
        "portfolioId", nullableInt(row.get("portfolio_id")),
        "portfolioName", row.get("portfolio_name"));
  }

  private Map<String, Object> ruleDto(Map<String, Object> row) {
    Map<String, Object> limit = map(
        "metric", row.get("limit_metric"),
        "comparator", row.get("limit_comparator"),
        "value", decimalOrZero(row.get("limit_value")).doubleValue());
    return map(
        "id", ((Number) row.get("id")).intValue(),
        "name", row.get("name"),
        "trustId", nullableInt(row.get("trust_id")),
        "trustName", row.get("trust_name"),
        "enabled", row.get("enabled"),
        "aggregationCriteria", readJson(row.get("aggregation_criteria")),
        "limit", limit,
        "createdAt", isoDateTime(row.get("created_at")));
  }

  private Map<String, Object> holdingDto(Map<String, Object> row) {
    Object date = row.get("as_of_date");
    String asOfDate = date instanceof Date sqlDate ? sqlDate.toLocalDate().toString() : String.valueOf(date);
    return map(
        "id", ((Number) row.get("id")).intValue(),
        "trustId", ((Number) row.get("trust_id")).intValue(),
        "asOfDate", asOfDate,
        "cusip", row.get("cusip"),
        "issuer", row.get("issuer"),
        "assetClass", row.get("asset_class"),
        "naicDesignationCode", row.get("naic_designation_code"),
        "coreLevel1Code", row.get("core_level1_code"),
        "coreLevel2Code", row.get("core_level2_code"),
        "generalLedgerGroup", row.get("general_ledger_group"),
        "bvAccrued", decimalOrZero(row.get("bv_accrued")).doubleValue(),
        "mvAccrued", decimalOrZero(row.get("mv_accrued")).doubleValue());
  }

  private Map<String, Object> reportDto(Map<String, Object> row) {
    Object date = row.get("as_of_date");
    String asOfDate = date instanceof Date sqlDate ? sqlDate.toLocalDate().toString() : String.valueOf(date);
    return map(
        "id", ((Number) row.get("id")).intValue(),
        "trustId", ((Number) row.get("trust_id")).intValue(),
        "trustName", row.get("trust_name"),
        "asOfDate", asOfDate,
        "runAt", isoDateTime(row.get("run_at")),
        "totalHoldingCount", ((Number) row.get("total_holding_count")).intValue(),
        "passCount", ((Number) row.get("pass_count")).intValue(),
        "failCount", ((Number) row.get("fail_count")).intValue(),
        "results", readJson(row.get("results")));
  }

  private Map<String, Object> validateLimit(Object rawLimit) {
    Map<String, Object> limit = objectMap(rawLimit, "limit");
    String metric = requiredText(limit, "metric");
    String comparator = requiredText(limit, "comparator");
    if (!LIMIT_METRICS.contains(metric)) {
      throw new IllegalArgumentException("Choose total_bv, total_mv, or actual_pct as the rule limit.");
    }
    ruleSqlCompiler.sqlComparator(comparator);
    return map(
        "metric", metric,
        "comparator", comparator,
        "value", requiredDecimal(limit.get("value"), "limit value"));
  }

  private boolean compare(BigDecimal measured, BigDecimal limit, String comparator) {
    int result = measured.compareTo(limit);
    return switch (comparator) {
      case "EQ" -> result == 0;
      case "NE" -> result != 0;
      case "LT" -> result < 0;
      case "LTE" -> result <= 0;
      case "GT" -> result > 0;
      case "GTE" -> result >= 0;
      default -> throw new IllegalArgumentException("The rule limit comparator is not supported.");
    };
  }

  private void requirePortfolio(int id) {
    if (jdbc.queryForObject("select count(*) from portfolios where id = ?", Integer.class, id) == 0) {
      throw notFound("Portfolio");
    }
  }

  private void requirePortfolioIfPresent(Integer id) {
    if (id != null) {
      requirePortfolio(id);
    }
  }

  private void requireTrust(int id) {
    if (jdbc.queryForObject("select count(*) from trusts where id = ?", Integer.class, id) == 0) {
      throw notFound("Trust");
    }
  }

  private void requireTrustIfPresent(Integer id) {
    if (id != null) {
      requireTrust(id);
    }
  }

  private static String requiredText(Map<String, Object> body, String key) {
    Object value = body.get(key);
    if (!(value instanceof String text) || text.isBlank()) {
      throw new IllegalArgumentException(key + " is required.");
    }
    return text.trim();
  }

  private static int requiredInteger(Object value, String name) {
    Integer parsed = nullableInteger(value);
    if (parsed == null) {
      throw new IllegalArgumentException(name + " is required.");
    }
    return parsed;
  }

  private static Integer nullableInteger(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Number number) {
      return number.intValue();
    }
    try {
      return Integer.valueOf(value.toString());
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException("Expected a whole-number identifier.");
    }
  }

  private static Integer nullableInt(Object value) {
    return value == null ? null : ((Number) value).intValue();
  }

  private static BigDecimal requiredDecimal(Object value, String name) {
    if (value == null) {
      throw new IllegalArgumentException(name + " is required.");
    }
    try {
      return new BigDecimal(value.toString());
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException(name + " must be numeric.");
    }
  }

  private static BigDecimal decimalOrZero(Object value) {
    if (value == null) {
      return BigDecimal.ZERO;
    }
    if (value instanceof BigDecimal decimal) {
      return decimal;
    }
    return new BigDecimal(value.toString());
  }

  private static LocalDate requiredDate(Object value, String name) {
    try {
      return LocalDate.parse(value.toString());
    } catch (Exception error) {
      throw new IllegalArgumentException(name + " must be a valid calendar date.");
    }
  }

  private static boolean booleanValue(Object value) {
    if (value instanceof Boolean result) {
      return result;
    }
    throw new IllegalArgumentException("enabled must be true or false.");
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> objectMap(Object value, String name) {
    if (!(value instanceof Map<?, ?> rawMap)) {
      throw new IllegalArgumentException(name + " must be an object.");
    }
    return (Map<String, Object>) rawMap;
  }

  private String toJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException error) {
      throw new IllegalArgumentException("The rule data could not be saved.");
    }
  }

  private Object readJson(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return objectMapper.readValue(value.toString(), Object.class);
    } catch (JsonProcessingException error) {
      throw new IllegalStateException("Stored rule or report JSON is invalid.", error);
    }
  }

  private static String stringValue(Object value) {
    return value == null ? "" : value.toString();
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

  private static ResponseStatusException notFound(String entity) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, entity + " not found.");
  }

  private static Map<String, Object> map(Object... pairs) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) {
      result.put((String) pairs[i], pairs[i + 1]);
    }
    return result;
  }
}
