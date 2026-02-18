# Contributing to HospitalOps

Thank you for contributing! Please follow these guidelines:

## Development Flow

1. **Coding Style**:
   - Write clean, type-safe TypeScript.
   - Use strict mode in tsconfig.
   - Avoid implicit any and always specify explicit return types on exports.
   - Use standard JS/TS coding patterns. Avoid browser-only or Node-only global variables where a helper or abstraction exists.

2. **Testing**:
   - Write behavioral tests in the `tests/` directory matching the suffix `.test.ts`.
   - Use deterministic clock (`FixedClock`) for any unit testing involving time or delays.
   - Ensure all tests pass before proposing a pull request.

3. **Architecture Rules**:
   - Keep modules decoupled. Primitives live in `src/core`, data operations in `src/storage`, and clinical domain logic in `src/clinical/` or other dedicated directories.
   - Record mutating actions to the `AuditLog` when implementing new services.
   - Enforce explicit state transitions for all lifecycles.
