# Trust Compliance

A trust compliance reporting app for assigning portfolios, building nested rules, reviewing dated holdings, and running auditable pass/fail reports.

## Run & Operate

- `pnpm --filter @workspace/trust-compliance run dev` — run the React web app
- `pnpm --filter @workspace/api-server run dev` — run the Spring Boot API
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — apply Drizzle schema changes to the development database
- `mvn -f artifacts/api-server/pom.xml -DskipTests package` — build the Spring Boot API
- Required database environment: `DATABASE_URL` for Drizzle and `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` for Spring Boot

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React + Vite
- API: Spring Boot 3.4, Java 17 target, Maven
- DB: PostgreSQL + Drizzle ORM
- Validation: OpenAPI-generated TypeScript/Zod contracts; validated rule-tree SQL compiler
- API codegen: Orval (from OpenAPI spec)
- Build: Vite and Maven

## Where things live

- `artifacts/trust-compliance/` — React app and reporting UI
- `artifacts/api-server/src/main/java/` — Spring Boot REST API and SQL rule evaluator
- `lib/api-spec/openapi.yaml` — API source contract
- `lib/db/src/schema/` — PostgreSQL schema source of truth

## Architecture decisions

- Portfolio assignment is one-to-one: `trusts.portfolio_id` is unique.
- Compliance criteria are stored as a JSON tree and compiled to parameterized SQL using an allowlisted field/operator set.
- Global rules apply to all trusts; trust-bound rules apply only to their selected trust.
- PostgreSQL schema changes are defined in Drizzle and pushed to development with `pnpm --filter @workspace/db run push`.

## Product

- Create trusts and portfolios with unique assignments.
- Create global or trust-specific rules with nested AND/OR groups and condition leaves.
- Load and edit holdings for available month-end as-of dates.
- Run trust-level compliance reports with pass/fail results, measured values, and generated SQL.

## User preferences

_No additional standing user preferences recorded._

## Gotchas

- Regenerate API helpers after changing `lib/api-spec/openapi.yaml`.
- Do not add startup-time DDL; apply database schema changes through the development Drizzle workflow and Replit publishing flow.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
