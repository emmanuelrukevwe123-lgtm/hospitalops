# REPO 01 — Hospital Operations and Clinical Workflow Platform

Build a **private TypeScript repository** for a **hospital operations and clinical workflow platform** that is production-like, submission-ready for Silver, and intentionally designed to support **20+ hard task opportunities** over time.

## Product Scope

The app should cover these domains with realistic business rules, state transitions, and cross-module behavior:

* **Patient admission and triage management**
  * Register patients with demographics, presenting complaint, and arrival source
  * Triage levels: `Immediate`, `Urgent`, `Semi-Urgent`, `Non-Urgent`, `Deceased`
  * Patient lifecycle states: `Registered`, `Triaged`, `Admitted`, `InTreatment`, `Transferred`, `Discharged`, `Deceased`
  * SLA windows for triage-to-doctor, triage-to-bed, and discharge target times
  * Priority scoring from triage level, age risk, and comorbidity flags

* **Ward and bed management**
  * Register wards, rooms, and individual beds with type (ICU, General, Isolation, Surgical, Maternity)
  * Bed status states: `Available`, `Occupied`, `Reserved`, `OutOfService`, `Cleaning`
  * Ward capacity tracking and overflow routing to partner facilities
  * Isolation bed enforcement rules for infectious flags

* **Staff scheduling and credentialing**
  * Register clinicians with specialty, license number, and certification expiry
  * Shift assignment by department and role
  * Staff status states: `OnDuty`, `OffDuty`, `OnLeave`, `Suspended`, `OnCall`
  * Certification expiry checks before procedure assignment
  * On-call escalation when primary physician is unavailable

* **Order management and clinical workflow**
  * Medication, lab, imaging, and procedure orders
  * Order lifecycle: `Draft`, `Submitted`, `Acknowledged`, `InProgress`, `Completed`, `Cancelled`, `OnHold`
  * Allergy and contraindication rule enforcement
  * Order sets and protocol-driven auto-ordering by diagnosis
  * Verbal order audit requirements

* **Pharmacy and medication management**
  * Drug inventory by formulary, ward stock, and crash cart
  * Dispensing workflow with double-verification rules for high-alert medications
  * Stock states: `InStock`, `LowStock`, `OutOfStock`, `Recalled`, `Expired`
  * Controlled substance tracking with chain-of-custody log
  * Replenishment request and approval workflow

* **Lab and diagnostics management**
  * Sample registration, processing, and result lifecycle
  * Sample states: `Collected`, `InTransit`, `Received`, `Processing`, `Resulted`, `Verified`, `Rejected`
  * Critical value alerting with mandatory acknowledgement
  * Turnaround time SLA tracking per test type
  * Result delta checks flagging abnormal changes from prior results

* **Surgical suite and procedure scheduling**
  * OR room registration with equipment and specialty classification
  * Case scheduling: `Elective`, `Urgent`, `Emergency`
  * Scheduling conflict prevention across room, surgeon, and anesthesia provider
  * Case states: `Scheduled`, `PreOpComplete`, `InProgress`, `Completed`, `Cancelled`, `Postponed`
  * Post-op recovery bay assignment and monitoring

* **Infection control and outbreak management**
  * Organism and pathogen registry with transmission risk levels
  * Contact tracing within wards and procedure rooms
  * Isolation precaution enforcement by pathogen type
  * Outbreak threshold triggers and response escalation
  * Hand hygiene compliance observation tracking

* **Billing and insurance claims**
  * Encounter-level charge capture by procedure, supply, and drug code
  * Insurance eligibility verification and prior authorization workflow
  * Claim lifecycle: `Draft`, `Submitted`, `Adjudicated`, `Paid`, `Denied`, `Appealed`, `Written-Off`
  * Itemized bill reconciliation and adjustment audit trail
  * Payer contract rate enforcement and underpayment flagging

* **Patient safety and incident reporting**
  * Near-miss, adverse event, and sentinel event registration
  * Event severity levels: `NearMiss`, `Minor`, `Moderate`, `Serious`, `Sentinel`
  * Root cause analysis workflow with corrective action tracking
  * Mandatory regulatory reporting deadlines and escalation
  * Aggregated safety metrics by unit, event type, and time period

* **Compliance and accreditation management**
  * Policy and procedure document lifecycle: `Draft`, `UnderReview`, `Approved`, `Superseded`, `Retired`
  * Audit and inspection scheduling with finding severity levels
  * Remediation task lifecycle: `Open`, `Planned`, `InProgress`, `Blocked`, `ReadyForReview`, `Completed`, `Verified`
  * Accreditation standard mapping and gap tracking
  * Overdue escalation and compliance dashboard

* **Reporting and analytics**
  * Department-level and hospital-level operational summaries
  * SLA attainment (triage, admission, discharge, lab turnaround)
  * Bed occupancy trends and capacity forecasting
  * Risk banding: `Low`, `Moderate`, `High`, `Critical`
  * Comparative period reporting and readmission rate tracking

* **Role-based permissions**
  * Roles: `Admin`, `ChiefMedicalOfficer`, `Clinician`, `Nurse`, `Pharmacist`, `LabTechnician`, `BillingOfficer`, `ComplianceOfficer`, `Auditor`
  * Action authorization matrix for clinical, pharmacy, billing, and compliance operations

* **Audit logging**
  * Action history for create/update/delete/approve/reject/escalate/override
  * Before/after snapshots with actor/timestamp/reason
  * Entity history queries and investigation trails

* **Rulepack system**
  * Rulepack registry/loader (`src/rules/rulepackIndex.ts`)
  * 47+ hospital protocol rulepack profiles (`pack-01` ... `pack-47`)
  * Rulepack metadata + thresholds for triage, escalation, allergy checking, and compliance tuning

* **Storage/runtime**
  * In-memory store and file-backed JSON store
  * Deterministic clock utilities (`FixedClock`) for reliable tests
  * Demo app flow entrypoint (`src/app.ts`)

* **Testing**
  * Extensive behavioral suite (200+ passing tests)
  * Unit, matrix, and integration coverage across all major modules

## Submission and Review Hard Requirements

1. Tests must be unambiguously detectable — `tests/**/*.test.ts` / `tests/**/*.spec.ts`, smoke test at `tests/smoke.test.ts`, explicit `test` script in `package.json`
2. Commit identity must match submitter across all history
3. Avoid suspicious history artifacts — no filter-branch artifacts, no machine-generated timestamps
4. Metadata consistency — repository naming, commit author identity, and submission profile must be coherent

## Commit Realism Requirements

5. Commit messages and commit substance must read authentic and human
6. Non-boilerplate quality — concrete domain logic, explicit invariants, meaningful module boundaries; include `README.md`, optionally `CHANGELOG.md` and `CONTRIBUTING.md`
7. Natural "messy" development — post-feature bug fix, test adjustment after behavior change, naming cleanup, integration edge-case fix
8. Timing realism — avoid perfectly uniform cadence; include occasional late-night, weekend, and burst-day commits
9. History integrity guardrails — no repeated message templates, no empty commits; maintain a clear evolution narrative (foundation → features → fixes → tests → docs)

## Task-Authoring Intent

Design the repository intentionally so it can generate **20+ high-quality hard tasks**:
* Bug fixes (`UPDATE`)
* Features (`CREATE/ADD`)
* Refactors (`UPDATE/DELETE`)
* Performance upgrades (`UPDATE/ADD/DELETE`)

Leave meaningful seams for later tasks:
* allergy-contraindication edge cases in medication ordering
* concurrent bed reservation conflicts under surge conditions
* critical lab value acknowledgement race conditions
* rulepack threshold bugs in triage priority scoring
* billing charge capture inconsistencies at discharge
* isolation enforcement bypass on emergency admits

After building, create `potential-task.md` mapping key commits, the hard task idea each commit unlocks, affected modules, and why each task is non-trivial but solvable.
