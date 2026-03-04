# Commit Plan — Hospital Operations Platform

Ordered, meaningful commits. Each is self-contained and builds on the prior ones.
Pace them across real working sessions — every commit lands with the true date it was made.

Status legend: `[ ]` todo  `[~]` in progress  `[x]` done

## Phase 1 — Foundation
- [x] 1. Project scaffold & tooling (package.json, tsconfig, vitest, lint, gitignore, README skeleton)
- [x] 2. Core domain primitives (shared types, Result/error model, ID generation, shared enums)
- [x] 3. Clock utilities (SystemClock + FixedClock) + tests
- [x] 4. Storage layer (repository interface, in-memory + file-backed JSON store) + tests
- [x] 5. Audit logging core (before/after snapshots, actor/timestamp/reason, history queries) + tests
- [x] 6. Role-based permissions (roles + authorization matrix) + tests

## Phase 2 — Core clinical modules
- [x] 7. Patient admission & triage (lifecycle, triage levels, priority scoring, SLA windows) + tests
- [x] 8. Ward & bed management (bed status machine, capacity, isolation rules, overflow) + tests
- [x] 9. Staff scheduling & credentialing (shifts, cert expiry, on-call escalation) + tests
- [x] 10. Order management & clinical workflow (order lifecycle, allergy/contraindication, order sets) + tests
- [x] 11. Pharmacy & medication (inventory, double-verification, controlled substances) + tests
- [x] 12. Lab & diagnostics (sample lifecycle, critical-value alerting, TAT SLA, delta checks) + tests
- [x] 13. Surgical suite & scheduling (OR rooms, conflict prevention, case states, recovery) + tests
- [x] 14. Infection control & outbreak (organism registry, contact tracing, isolation, thresholds) + tests

## Phase 3 — Supporting / business modules
- [x] 15. Billing & insurance claims (charge capture, eligibility, claim lifecycle, reconciliation) + tests
- [x] 16. Patient safety & incident reporting (events, severity, RCA, regulatory deadlines) + tests
- [x] 17. Compliance & accreditation (policy lifecycle, audits, remediation, gap tracking) + tests
- [x] 18. Reporting & analytics (SLA attainment, occupancy trends, risk banding, period compare) + tests

## Phase 4 — Rulepack system
- [x] 19. Rulepack core (registry/loader `src/rules/rulepackIndex.ts`, metadata/threshold schema) + tests
- [x] 20. Rulepack profiles `pack-01`…`pack-47`, wired into triage/escalation/allergy/compliance + tests

## Phase 5 — Integration, polish, docs
- [x] 21. Demo app entrypoint `src/app.ts` (end-to-end flow)
- [x] 22. Integration + smoke tests (`tests/smoke.test.ts`)
- [x] 23. Real fixes surfaced during integration (genuine edge cases only)
- [x] 24. Docs (README expansion, CHANGELOG, CONTRIBUTING)
- [x] 25. `potential-task.md` mapping seams to candidate tasks

## Pacing notes
- ~2–4 commits per session is a natural rhythm.
- Phase 1 is a good first batch — it's the load-bearing foundation.
- Commit 23 must be *real* fixes that surface during integration, not invented ones.
