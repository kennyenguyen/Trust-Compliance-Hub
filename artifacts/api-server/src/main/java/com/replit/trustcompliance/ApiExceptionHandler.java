package com.replit.trustcompliance;

import java.util.Map;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<Map<String, String>> handleStatus(ResponseStatusException error) {
    return ResponseEntity.status(error.getStatusCode())
        .body(Map.of("error", error.getReason() == null ? "Request failed." : error.getReason()));
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Map<String, String>> handleInvalidInput(IllegalArgumentException error) {
    return ResponseEntity.badRequest().body(Map.of("error", error.getMessage()));
  }

  @ExceptionHandler(DataAccessException.class)
  public ResponseEntity<Map<String, String>> handleDatabase(DataAccessException error) {
    String message = "The request conflicts with existing portfolio, trust, or holdings data.";
    return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", message));
  }
}
