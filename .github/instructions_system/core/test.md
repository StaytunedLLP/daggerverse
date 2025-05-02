# Testing Instructions (A2/FP/TDD)

> ⚠️ **Special Note for Web Component Reviews:** If the code being reviewed is a
> web component (custom element), apply **both** the core checklist (points 1-8
> below) **AND** the specialized
> [Additional Web Component Review Guidelines](../architecture/intro_web_component_test.md)
> further down.

- **TDD Mandate (Strictly Enforced):**
  - Tests **MUST** be written _before_ implementation code. No exceptions.
  - Strictly follow the **Red-Green-Refactor** cycle defined in
    `a2_workflow.md`:
    1. **Red:** Write a failing test for the desired functionality.
    2. **Green:** Write the minimum implementation code necessary to make the
       test pass.
    3. **Refactor:** Improve the implementation code while ensuring all tests
       still pass.
- **Test Definition (`Deno.test`) (TDD Step 1: Red):**
  - Define the test structure, assertions, and necessary mocks _before_ writing
    implementation code, strictly following the Red-Green-Refactor cycle defined
    in `a2_workflow.md`.
  - **Numbering:** Assign a unique sequential number (e.g., '001', '002') within
    the test description string for each test case (e.g.,
    `Deno.test("001: description", ...)` or
    `Deno.test({ name: "001: description", fn: ... })`).
  - **Adding Tests:** When adding new tests to an existing file, **scan the
    file** to find the highest current test number and assign the next
    sequential number to the new test(s).
  - **Test Steps (`t.step`):** Use `t.step` within a test function to structure
    complex tests into logical sub-parts. Steps run sequentially and failures in
    a step prevent subsequent steps from running.
- **Test Types & Scope (Defined during TDD):**
  - **Unit Tests (`*.test.ts`):** Focus on testing individual pure functions
    exhaustively and isolated impure functions with mocks. Place test files
    alongside the source file. Write these _before_ the function implementation.
  - **Integration Tests (`*.integration.test.ts`):** Verify interaction between
    blocks within their allowed scope (e.g., `bk_api` using
    `bk_data_access_providers`). Place within the relevant `sy_*`, `fe_*`, or
    `fd_*` scope (`bk_integration_tests` block). Write these _before_
    implementing the interaction logic.
- **Pure Function Testing:** Test with various valid inputs, edge cases, and
  invalid inputs (where applicable). Ensure deterministic output (same input ->
  same output) and immutability (inputs are not modified).
- **Impure Function Testing:** Isolate side effects. **MANDATORY**
  mocking/stubbing/spying of dependencies (e.g., `bk_data_access_kv` functions,
  `fetch`, `bk_otel_logs`, `Date.now()`).
  - **Mocking Library:** Use `jsr:@std/testing/mock` for creating mocks, stubs,
    and spies.
  - Verify the function calls dependencies correctly and handles their
    responses/errors.
- **FP Specifics:** Explicitly test `Result<T, E>` and `Option<T>` return types,
  covering both success (`Ok`/`Some`) and failure/absence (`Err`/`None`) paths.
  Verify immutability.
- **Documentation Tests (`deno test --doc`):**
  - Write runnable examples within TSDoc comments (`@example`).
  - Run `deno test --doc` to verify examples are correct and up-to-date. This is
    crucial for maintaining accurate documentation (`quality_standards.md`).
- **Coverage:** Aim for 100% statement/branch coverage (`quality_standards.md`).
  Use `deno test --coverage`. Generate reports (e.g.,
  `deno coverage --lcov > coverage.lcov`).
- **Execution & Filtering:**
  - Use `deno task test` (preferred if defined) or
    `deno test --allow-all --coverage`.
  - Filter tests using:
    - `--filter "pattern"` flag (runs tests whose names contain the pattern).
    - `only: true` in `Deno.test` object (temporary).
    - `deno.json` configuration (`test.include`, `test.exclude`).
  - Use `--fail-fast` to stop on the first failure.
  - Use reporters (`--reporter=dot|junit|pretty`) and JUnit output
    (`--junit-path=report.xml`) for CI/CD integration.
- **Sanitizers:** Be aware of Deno's built-in sanitizers (resource, async ops,
  exit), enabled by default. They help detect resource leaks, unhandled async
  operations, and unexpected exits. Ensure tests pass without sanitizer errors.
- **Other Standard Tools:**
  - BDD (`describe`/`it`): Available via `jsr:@std/testing/bdd` if BDD style is
    preferred for specific tests.
  - Snapshot Testing: Available via `jsr:@std/testing/snapshot` for testing
    complex outputs or UI component structures.
