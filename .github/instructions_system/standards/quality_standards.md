# Quality Standards

- **Testing (TDD MANDATORY)**: Unit test pure functions extensively. Test
  side-effecting functions by mocking dependencies. Integration tests verify
  block interactions. Strive for 100% coverage.
- **Functional Programming (MANDATORY):** Adherence to Functional Programming
  (FP) principles is strictly required to enhance code predictability,
  testability, and maintainability. This involves:
  - **Pure Functions:** Functions must be pure. Given the same input, they must
    always produce the same output and have no observable side effects (e.g., no
    modifying external state, no I/O, no network calls, no database interactions
    within the function itself). Side effects must be isolated and managed
    explicitly, often passed in as dependencies or handled at the application's
    boundaries.
  - **Immutability:** Data structures must be treated as immutable. Once
    created, they cannot be changed. Operations that appear to modify data must
    return new instances with the changes applied, leaving the original
    unchanged. Use techniques like object/array spreading (`{...obj}`,
    `[...arr]`) or dedicated immutable libraries if necessary (though native
    TS/JS features are often sufficient).
  - **Composition:** Build complex logic by composing smaller, reusable pure
    functions together. Favor function composition (e.g., `f(g(x))`) over
    complex, imperative control flow.
  - **Avoiding Side Effects:** Minimize and isolate side effects. Functions
    performing side effects (like interacting with Deno KV, logging via
    `bk_otel_logs`, making API calls) should be clearly delineated and ideally
    separated from pure business logic. Pure logic should operate on data, and
    impure functions should orchestrate the execution of pure logic and handle
    the effects.
  - **Error Handling (Result/Option Types):** Use functional error handling
    patterns like `Result<T, E>` (for operations that can fail with a specific
    error) or `Option<T>` (for values that might be absent). Avoid throwing
    exceptions for expected error conditions; instead, return these types to
    make error paths explicit and force callers to handle them.
  - **Explicit Prohibition:** **Classes, the `this` keyword, and prototype
    manipulation are strictly forbidden.** Use functions and plain objects/data
    structures exclusively. This enforces a consistent functional style and
    avoids the complexities and potential pitfalls of object-oriented paradigms
    within this FP context.
- **Linting & Formatting:** Must pass `deno lint` & `deno fmt`. Fixes required
  before proceeding/committing.
- **Documentation (MANDATORY):** Detailed standard for file-level comments.
  TSDoc requirements (`@description`, `@param`, `@returns`, **`@example`
  MANDATORY** for non-trivial pure functions).

- **Tracing**: Use Deno's automatic tracing and supplement with custom spans via
  @opentelemetry/api in bk_middleware, bk_graphql resolvers, and bk_api
  services. Tag spans with `fd_*.feature` and `fd_*.story` attributes. Keep span
  creation out of pure functions.
- **Logging**: Use the bk_otel_logs service (wrapping console.*). Deno
  automatically links these logs to the active trace/span.
- **User Info**: Identify users in bk_auth middleware. Add non-sensitive
  identifiers (e.g., enduser.id) as attributes to the main request span and
  include them in structured log attributes via bk_otel_logs. Prioritize
  security and avoid logging PII. Make user context available via mechanisms
  like AsyncLocalStorage or explicit passing.
- **Error Handling** (FP patterns using `Result`/`Option` types, see
  `bk_error_handling`)
- **Readability** (FP context, e.g., predictability via immutability)
- **Performance** (FP context, e.g., memoization opportunities for pure
  functions)
- **Accessibility** (WCAG AA+)

## Common Patterns & Anti-Patterns (A2 + FP)**

- **Patterns:** Pure data transformation pipelines, composing functions,
  handling side effects via dependency injection, using Signals effectively.
- **Anti-Patterns:** Mutating state directly, using classes/`this`, large impure
  functions, skipping tests, violating block placement, inconsistent naming.
