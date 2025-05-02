# Feature Development Workflow (A2 Standard Process)

> **Note:** This workflow guide should be used in conjunction with the
> [A2 Standards](../standards/a2_standards.md) document, which defines mandatory
> naming conventions and import practices.

- Overview (Iterative, **TDD MANDATORY**, FP Focus)
- **Phase 1**: Understand & Prepare (Analyze Issue, Define FP Data
  Structures/Types (**emphasizing immutability)**, Define Pure Primitives/Utils)
- **Phase 2**: Backend (TDD Sequence):
  1. Define Data Access Layer Interfaces
  2. Write Data Access Layer Tests (Red)
  3. Implement Pure Data Access Layer Logic + Isolated KV Side Effects
     (Green/Refactor)
  4. Define API Contracts
  5. Write Service/Resolver Tests (Mock Dependencies) (Red)
  6. Implement Pure Service Logic (using Result/Option types for errors) +
     Isolated Side Effects (Green/Refactor)
  7. Write Integration Tests (Red)
  8. Implement Integration Logic (Green/Refactor)
- **Phase 3**: Frontend (TDD Sequence):
  1. Define/Test Invocation (Red)
  2. Implement Invocation (Green/Refactor)
  3. Define/Test UI Component API/Render (Red)
  4. Implement UI (Green/Refactor)
  5. Define/Test UI Logic/State (Red)
  6. Implement UI Logic/State with Signals (Green/Refactor)
  7. Connect UI
- **Phase 4**: **Documentation & Final Checks** (Generate TSDoc/**File
  Comments** -> Run `deno lint`/`fmt` -> Verify Tests/Coverage -> Review)
- _(Each step needs detailed explanation, emphasizing and enforcing the **FP
  approach** and **TDD cycles**)_
