# HospitalOps

A hospital operations and clinical workflow platform written in TypeScript.

It models the day-to-day operational core of a hospital — patient admission and
triage, ward and bed management, staffing, clinical orders, pharmacy, lab,
surgery, infection control, billing, patient safety, and compliance — with
explicit state machines, business rules, and an audit trail across modules.

There is no external database: persistence is provided by an in-memory store and
a file-backed JSON store, and time is injected through a `Clock` abstraction so
behaviour is deterministic under test.

## Status

Early development. The foundation (core primitives, clock, storage, audit log,
permissions) is in place; clinical modules are being added incrementally. See
[`COMMIT_PLAN.md`](./COMMIT_PLAN.md) for the build order.

## Requirements

- Node.js >= 20

## Getting started

```bash
npm install
npm test          # run the test suite
npm run typecheck # type-check without emitting
npm run lint      # lint sources
```

## Project layout

```
src/
  core/      shared types, errors, ids, enums, clock
  storage/   repository interface + in-memory and file-backed stores
  audit/     action history with before/after snapshots
  auth/      roles and the authorization matrix
tests/       behavioural test suite (Vitest)
```

## Design notes

- **Determinism.** Anything time-dependent takes a `Clock`. Tests use
  `FixedClock` so SLA windows, expiries, and timestamps are reproducible.
- **Explicit transitions.** Entity lifecycles are modelled as state machines;
  illegal transitions fail loudly rather than silently corrupting state.
- **Auditability.** Mutating operations can be recorded with actor, reason, and
  before/after snapshots for later investigation.
