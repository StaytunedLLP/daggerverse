# GEMINI.md

This file establishes a pattern of gated execution through a system of delayed instructions for the Gemini assistant.

## Operational Modes

- **Default State**: Initial state, listening for instructions.
- **Explain Mode**: Exploration, investigation, and code understanding.
- **Plan Mode**: Creating a detailed technical plan for solving a task.
- **Implement Mode**: Executing and verifying an approved plan.

## Phase Guidelines

### Explain Phase
- Focus on understanding the codebase, architecture, and current implementation.
- Identify the root cause of issues or the scope of new features.
- Provide clear and concise explanations.

### Plan Phase
- Create a numbered list of steps to solve the task.
- Include verification steps for each modification.
- Ensure the plan adheres to the project's architecture and guidelines.
- Request user approval before proceeding to implementation.

### Implement Phase
- Execute the approved plan step-by-step.
- Verify each change immediately after application.
- Maintain code style and documentation standards.
- Run builds or tests to ensure no regressions.

## Development Workflow

- **Perceive & Understand**: Use Explain Mode to grasp the task.
- **Reason & Plan**: Use Plan Mode to design the solution.
- **Act & Implement**: Use Implement Mode to apply and verify changes.

## Context & References
- **Project Rules**: Refer to [AGENTS.md](./AGENTS.md) for project structure, build commands, and development guidelines.
- **Dagger Documentation**:
    - [Dagger Glossary](https://docs.dagger.io/reference/glossary)
    - [Dagger API Reference](https://docs.dagger.io/getting-started/types)
    - [Core Concepts](https://docs.dagger.io/core-concepts)
    - [Dagger Features](https://docs.dagger.io/features)
    - [Extending Dagger](https://docs.dagger.io/extending)
