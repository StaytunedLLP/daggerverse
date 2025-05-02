# Code Review Instructions (A2/FP/TDD Checklist)

When reviewing code (or generating code for review), verify strict adherence to
the following core checklist:

> ⚠️ **Special Note for Web Component Reviews:** If the code being reviewed is a
> web component (custom element), apply **both** the core checklist (points 1-8
> below) **AND** the specialized
> [Additional Web Component Review Guidelines](../architecture/intro_web_component_review.md)
> further down.

1. **A2 Adherence:**
   - Block placement follows `../architecture/a2_blocks_placement_guide.md`.
   - Naming prefixes (`fd_`, `fe_`, `sy_`, `bk_`) used correctly per
     `../standards/naming_standards.md`.
2. **FP Strictness (`../standards/quality_standards.md`):**
   - **NO** `class`, `this`, or prototype manipulation.
   - Functions are predominantly pure (deterministic output for same input, no
     side effects).
   - Immutability is maintained (no direct state mutation; use spread syntax
     `{...}`, `[...]` or immutable helpers).
   - Side effects are minimal, isolated (e.g., in `bk_api` services, GraphQL
     resolvers, middleware), and clearly handled (often via dependency injection
     or at boundaries).
   - `Result`/`Option` types used appropriately for error handling/optionality
     instead of throwing exceptions for control flow.
   - Function composition and declarative style (e.g., `map`, `filter`,
     `reduce`) preferred over imperative loops where it enhances clarity.
3. **TDD Verification:**
   - Tests exist for the implemented logic.
   - Tests cover relevant scenarios (happy path, errors, edge cases).
   - Tests appear to follow the TDD cycle (written before/with code).
   - Coverage meets the 100% goal (`../standards/quality_standards.md`).
4. **Documentation (`../standards/quality_standards.md`):**
   - **Mandatory** file-level comments are present and informative.
   - **Mandatory** TSDoc for non-trivial functions/types, including
     `@description`, `@param`, `@returns`.
   - **Mandatory** `@example` provided for non-trivial pure functions.
5. **Naming & Formatting:**
   - File, variable, function, type, constant names follow
     `../standards/naming_standards.md`.
   - Code passes `deno lint` and `deno fmt`.
   - **NO** `mod.ts` files used for re-exporting; direct imports are used
     (`../standards/naming_standards.md`).
6. **Readability & Simplicity:**
   - Code is clear, understandable, and follows logical functional patterns.
   - Avoids unnecessary complexity (e.g., overly nested composition, complex
     point-free style where clarity suffers).
   - Function signatures clearly communicate intent and dependencies.
   - Pure functions are easily distinguishable from impure ones.
7. **Observability (`../standards/quality_standards.md`):**
   - Appropriate logging (`bk_otel_logs`) implemented in impure boundary
     functions (e.g., `bk_api` services, GraphQL resolvers, middleware).
   - Custom spans with `fd_*.feature`/`fd_*.story` attributes added in relevant
     boundary functions (e.g., `bk_middleware`, `bk_graphql` resolvers, `bk_api`
     service entry points).
8. **Security:**
   - No logging of sensitive PII (adheres to User Info guidelines in
     `../standards/quality_standards.md`).
   - Input validation (`bk_validators`) used where necessary.
   - Dependencies are up-to-date (conceptual check).

## Review Summary Format (Core Checklist)

After reviewing the code against the **core checklist (1-8)** above, provide a
concise summary using the following icons for each numbered point:

- ✅ : **Pass / Compliant**
- ❌ : **Fail / Non-Compliant (Requires Fix)**
- ⚠️ : **Needs Attention / Minor Issue / Question**

Present the summary as a list corresponding to the checklist numbers. For any
items marked with ❌ or ⚠️, provide a brief explanation immediately following
the summary list.

**Example Summary:**

1. ✅
2. ⚠️
3. ✅
4. ❌
5. ✅
6. ✅
7. ✅
8. ⚠️

**Comments:**

- **Point 2 (FP Strictness):** ⚠️ Found one instance where an array was mutated
  directly. Suggest using array spread syntax for immutability.
- **Point 4 (Documentation):** ❌ Missing file-level comment and TSDoc
  `@example` for the `calculateTotals` function.
- **Point 8 (Security):** ⚠️ Input validation seems present, but consider adding
  stricter checks for the 'email' field format.
