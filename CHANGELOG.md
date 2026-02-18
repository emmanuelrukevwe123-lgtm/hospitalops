# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-06-04

### Added
- Core clinical modules:
  - Patient admission & triage management (priority scoring, SLA tracking).
  - Ward & bed management (isolation checks, bed states).
  - Staff scheduling & credentialing (cert validation, escalations).
  - Order management & clinical workflow (allergy checks, protocol auto-ordering).
  - Pharmacy & medication (dual verification, inventory).
  - Lab & diagnostics (critical value alerts, delta checks).
  - Surgical suite scheduling (conflict detection).
  - Infection control & outbreak (contact tracing, outbreak threshold checking).
- Supporting business modules:
  - Billing & insurance claims (charge capture, contracted rates verification).
  - Patient safety & incident reporting (regulatory reporting deadlines).
  - Compliance & accreditation (policies and remediation tasks tracking).
  - Reporting & analytics (bed occupancy rate and SLA attainment).
- Rulepack system containing 47 dynamic hospital operating profiles.
- End-to-end flow demo application under `src/app.ts` and integration smoke tests.

## [0.1.0] - 2026-06-04

### Added
- Scaffold TypeScript project with Vitest and strict tsconfig.
- Injectable deterministic Clock (`FixedClock`).
- Repository storage abstraction for in-memory and file-backed JSON stores.
- Audit logging system with before/after snapshots.
- Role-based access control matrix (RBAC).
