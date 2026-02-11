# Potential Hard Tasks Map — Hospital Operations Platform

This document outlines 6 candidate hard tasks designed to be added on top of the current codebase structure. Each task is non-trivial and leverages specific architectural seams in the platform.

---

## 1. Allergy-Contraindication Drug-Drug Interaction Check
* **Module(s) Affected**: `src/clinical/order.ts`, `src/clinical/pharmacy.ts`
* **Task Idea**: Implement a multi-drug interaction checking rule where prescribing a medication checks for active/dispensed medications in the patient's record to prevent drug-drug contraindications (e.g., Sildenafil + Nitroglycerin).
* **Seam**: The `verifyAllergies` function only checks patient allergy lists. Adding a parameter for active/current orders in `ClinicalOrder` allows cross-referencing existing medication orders.
* **Why it's non-trivial**: Requires keeping state of active medication therapies, parsing drug class maps, and integrating with rulepack profiles to determine alert strictness.

## 2. Concurrent Bed Reservation Under Surge Conditions
* **Module(s) Affected**: `src/clinical/ward.ts`
* **Task Idea**: Resolve race conditions when multiple nurses attempt to reserve or occupy the same Bed under high-traffic surge conditions, ensuring mutual exclusion.
* **Seam**: Bed reservations transition between states, but the repository is synchronous. Introducing concurrent transaction/locking helpers in `storage/` or checking timestamp version locks during state transitions creates a safety guardrail.
* **Why it's non-trivial**: Requires implementing optimistic concurrency controls or version tokens on the `Bed` entity without adding a full SQL database.

## 3. Critical Lab Value Acknowledgement Race Conditions
* **Module(s) Affected**: `src/clinical/lab.ts`, `src/audit/auditLog.ts`
* **Task Idea**: Ensure that if a critical lab result (e.g. Troponin > 0.04) is generated, it *must* be acknowledged by a clinician within 15 minutes, otherwise escalations trigger automatically in the background.
* **Seam**: The `evaluateCriticalThresholds` flag is set, but there is no timed background checker. An asynchronous scheduler or clock-check integration is needed.
* **Why it's non-trivial**: Requires coordinating clock checks, audit records, and managing async state.

## 4. Rulepack Threshold Bugs in Triage Priority Scoring
* **Module(s) Affected**: `src/clinical/patient.ts`, `src/rules/rulepackIndex.ts`
* **Task Idea**: Wire the rulepack dynamic thresholds (e.g., `triageAgeRiskLimit`) directly into `calculatePriorityScore` so that age risk varies based on the active hospital profile pack.
* **Seam**: Currently, `calculatePriorityScore` hardcodes age > 65. Refactoring it to look up the active rulepack's `triageAgeRiskLimit` parameter will dynamically shift scoring.
* **Why it's non-trivial**: Changing the risk age threshold from 65 to 60 (or vice versa) across rulepacks can alter patient queue priority rankings, exposing bugs in priority queues.

## 5. Billing Charge Capture Inconsistencies at Discharge
* **Module(s) Affected**: `src/clinical/patient.ts`, `src/billing/billing.ts`
* **Task Idea**: Implement an automated discharge charge auditor that verifies whether all medication orders marked as `Completed` have corresponding `BillingCharge` items created before the patient is allowed to move to `Discharged` state.
* **Seam**: The `validateStateTransition` in `Patient` only validates states. Adding a cross-check verification using the clinical orders and billing charges before final discharge enforces billing integrity.
* **Why it's non-trivial**: Requires orchestrating data from three separate domains: clinical orders, billing charges, and patient lifecycle, handling partial or adjusted charges correctly.

## 6. Isolation Enforcement Bypass on Emergency Admits
* **Module(s) Affected**: `src/clinical/patient.ts`, `src/clinical/ward.ts`
* **Task Idea**: Handle emergency admissions where a patient with unknown/high transmission risk needs immediate bed placement, creating an override rule path with a strict audit log trail.
* **Seam**: Currently, `checkIsolationEnforcement` throws immediately. Allowing a CMO override permission to bypass isolation checks when triage level is `Immediate`, while logging an `Override` action to the `AuditLog`, creates an audited emergency pathway.
* **Why it's non-trivial**: Requires role checking (CMO only), matching triage levels, audit trails, and managing patient safety margins.
