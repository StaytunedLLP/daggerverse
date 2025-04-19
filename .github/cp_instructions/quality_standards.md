# Quality Standards

- _(Expand on each standard, adding specific detail for FP, TDD, Documentation
  rules, and Linting)_
- **Testing (TDD MANDATORY)**: Unit test pure functions extensively. Test
  side-effecting functions by mocking dependencies. Integration tests verify
  block interactions. Strive for 100% coverage.
- **Functional Programming (MANDATORY):** Detailed explanation of pure
  functions, immutability (techniques/libraries if any), composition, avoiding
  side effects, handling errors with Result/Option types. **Explicitly forbid
  classes, `this`, prototypes.**
- **Linting & Formatting:** Must pass `deno lint` & `deno fmt`. Fixes required
  before proceeding/committing.
- **Documentation (MANDATORY):** Detailed standard for file-level comments.
  TSDoc requirements (`@description`, `@param`, `@returns`, **`@example`
  MANDATORY** for non-trivial pure functions).
- Security
- Error Handling (FP patterns)
- Logging (`bk_otel_logs`)
- Readability (FP context)
- Performance (FP context, e.g., memoization)
- Accessibility (WCAG AA)

## Common Patterns & Anti-Patterns (A2 + FP)**

- **Patterns:** Pure data transformation pipelines, composing functions,
  handling side effects via dependency injection, using Signals effectively.
- **Anti-Patterns:** Mutating state directly, using classes/`this`, large impure
  functions, skipping tests, violating block placement, inconsistent naming.
