# HospitalOps

A hospital operations and clinical workflow platform written in TypeScript.

It models the day-to-day operational core of a hospital — patient admission and triage, ward and bed management, staffing, clinical orders, pharmacy, lab, surgery, infection control, billing, patient safety, and compliance — with explicit state machines, business rules, and an audit trail across modules.

There is no external database: persistence is provided by an in-memory store and a file-backed JSON store, and time is injected through a `Clock` abstraction so behaviour is deterministic under test.

## Features & Modules

- **Patient Admission & Triage**: Custom state machines, SLA calculators, age/comorbidity-based triage priority scoring.
- **Ward & Bed Management**: Ward capacity limits, isolation checks for infectious patients.
- **Staff Scheduling**: Clinician credential expiry checks and on-call escalation rules.
- **Order Management**: Medication, lab, imaging, and procedure order sets (e.g., Sepsis protocol) and allergy checks.
- **Pharmacy & Medication**: Stock state tracking, high-alert drug double-verification, controlled substance chains of custody.
- **Lab & Diagnostics**: SLA TAT tracking, critical value warnings, delta variation tests.
- **Surgical Suite Scheduling**: Multi-resource scheduling conflict resolution.
- **Infection Control**: Outbreak triggers and movement contact tracing.
- **Billing & Claims**: Capturing charges, claim lifecycle workflows, contracted rate mismatch checks.
- **Patient Safety**: Incident reporting, severity tracking, regulatory deadlines.
- **Compliance & Accreditation**: Document control lifecycle and remediation task escalations.
- **Reporting & Analytics**: SLA attainment reporting and occupancy trend calculations.
- **Rulepack System**: 47 hospital configuration profiles loaded dynamically.

## Status

**Production Ready (v1.0.0)**. All clinical modules, supporting modules, and rulepacks are complete and tested. See [`COMMIT_PLAN.md`](./COMMIT_PLAN.md) for the implementation history.

## Requirements

- Node.js >= 20

## Getting started

```bash
npm install
npm test          # run the test suite (100+ passing tests)
npm run typecheck # type-check without emitting
```

## Running the E2E Demo

You can run the end-to-end demo showcasing the integrated workflow:
```bash
npx vitest run tests/smoke.test.ts
```

## Running with Docker

This project includes support for Docker and Docker Compose for containerized development and testing.

### Using Docker Compose (Recommended)

- **Start the application**:
  ```bash
  docker compose up app
  ```

- **Run the test suite**:
  ```bash
  docker compose up test
  ```

### Manual Docker Build

- **Build the runner image**:
  ```bash
  docker build -t hospitalops .
  ```

- **Run tests using the test build stage**:
  ```bash
  docker build --target test -t hospitalops-test .
  ```

## Project layout

```
src/
  core/       shared types, errors, ids, enums, clock
  storage/    repository interface + in-memory and file-backed stores
  audit/      action history with before/after snapshots
  auth/       roles and the authorization matrix
  clinical/   patient triage, beds, staff, orders, meds, labs, surgery, infection
  billing/    charge captures and insurance claim workflows
  safety/     incident registries and severity levels
  compliance/ policies and remediation tasks tracking
  analytics/  SLA and bed occupancy reports
  rules/      rulepack loader and dynamic hospital parameters
  app.ts      E2E demonstration flow entrypoint
tests/        behavioural test suite (Vitest)
```

## Design notes

- **Determinism.** Anything time-dependent takes a `Clock`. Tests use `FixedClock` so SLA windows, expiries, and timestamps are reproducible.
- **Explicit transitions.** Entity lifecycles are modelled as state machines; illegal transitions fail loudly rather than silently corrupting state.
- **Auditability.** Mutating operations can be recorded with actor, reason, and before/after snapshots for later investigation.
