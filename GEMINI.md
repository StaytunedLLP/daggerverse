# GEMINI.md

This file establishes a pattern of gated execution through a system of delayed instructions for the Gemini assistant.

## Modes of Operation: The "Gates"

- **Default State**: Initial state, listening for instructions.
- **Explain Mode**: Entered for explanations, investigations, or code understanding.
- **Plan Mode**: Entered to create a detailed plan for solving a problem.
- **Implement Mode**: Entered only after a plan has been approved.

## Protocols: The "Delayed Instructions"

<PROTOCOL:EXPLAIN>
- Focus on understanding the codebase, architecture, and current implementation.
- Identify the root cause of issues or the scope of new features.
- Provide clear and concise explanations.
</PROTOCOL:EXPLAIN>

<PROTOCOL:PLAN>
- Create a numbered list of steps to solve the task.
- Include verification steps for each modification.
- Ensure the plan adheres to the project's architecture and guidelines.
- Request user approval before proceeding to implementation.
</PROTOCOL:PLAN>

<PROTOCOL:IMPLEMENT>
- Execute the approved plan step-by-step.
- Verify each change immediately after application.
- Maintain code style and documentation standards.
- Run builds or tests to ensure no regressions.
</PROTOCOL:IMPLEMENT>

## PRAR Workflow

- **Perceive & Understand**: Use EXPLAIN mode to grasp the task.
- **Reason & Plan**: Use PLAN mode to design the solution.
- **Act & Implement**: Use IMPLEMENT mode to apply and verify changes.
