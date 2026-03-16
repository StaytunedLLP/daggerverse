# AGENTS.md

This repository contains the `staydevops-ts` Dagger module, which provides shared CI/CD helpers for Node.js and TypeScript projects, specifically focusing on Firebase deployment and Playwright-ready environments.

## Setup & Build
- Install dependencies: `npm install`
- Build the project: `npm run build`
- Clean build artifacts: `npm run clean`

## Project Structure
- `src/staydevops-ts.ts`: Main entry point for the Dagger module.
- `src/checks/`: Implementation of repository checks (format, lint, build, test).
- `src/firebase/`: Firebase deployment logic.
- `src/copilot/`: Node workspace preparation helpers.
- `src/shared/`: Shared utilities and constants.

## Development Guidelines
- This is a Dagger module written in TypeScript.
- Follow Dagger SDK patterns for all core types and interactions as defined in the [Dagger API Reference](https://docs.dagger.io/getting-started/types).
- Use TSDoc for all public-facing module members to ensure they are documented in Daggerverse.
- When adding new functionality, export it from `src/index.ts`.

## Testing
- Local verification: Run `npm run build` to ensure TypeScript compilation passes.
- Module verification: Use `dagger call` from a sample repository to test the module functions.

## References & Documentation
- [Dagger Glossary](https://docs.dagger.io/reference/glossary): Definitions of key terminology.
- [Core Concepts](https://docs.dagger.io/core-concepts): Understanding the Dagger Engine and architecture.
- [Dagger Features](https://docs.dagger.io/features): Overview of what Dagger can do.
- [Extending Dagger](https://docs.dagger.io/extending): How to build and share Dagger modules.
- [Dagger API Reference](https://docs.dagger.io/getting-started/types): Comprehensive reference for all Dagger types, functions, and modules.
