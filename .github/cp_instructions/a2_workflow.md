# Feature Development Workflow (A2 Standard Process)

- Overview (Iterative, **TDD MANDATORY**, FP Focus)
- **Phase 1**: Understand & Prepare (Analyze Issue, Define FP Data
  Structures/Types, Define Pure Primitives/Utils)
- **Phase 2**: Backend (TDD: Define DAL Interfaces -> Write DAL Tests ->
  Implement Pure DAL Logic + Isolated KV Side Effects -> Define API Contracts ->
  Write Service/Resolver Tests (Mock Dependencies) -> Implement Pure Service
  Logic + Isolated Side Effects -> Write Integration Tests)
- **Phase 3**: Frontend (TDD: Define/Test Invocation -> Impl. Invocation ->
  Define/Test UI Component API/Render -> Impl. UI -> Define/Test UI Logic/State
  -> Impl. UI Logic/State with Signals -> Connect UI)
- **Phase 4**: **Documentation & Final Checks** (Generate TSDoc/**File
  Comments** -> Run `deno lint`/`fmt` -> Verify Tests/Coverage -> Review)
- _(Each step needs detailed explanation, emphasizing and enforcing the **FP
  approach** and **TDD cycles**)_
