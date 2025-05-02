# Technical Stack

## Technologies

1. Deno: The primary TypeScript/JavaScript runtime.
2. TypeScript: The primary programming language.
3. Fresh: The web framework used for building the UI and routing (within `fd_*/`
   domains).
4. Deno KV: The primary database solution, accessed ONLY via
   `bk_data_access_kv`.
5. GraphQL: The primary API query language, implemented in `bk_graphql`
   (resolvers delegate to `bk_api`).
6. Deno Deploy: The target deployment platform for the application.
7. OpenTelemetry: Used for observability (tracing, logging, metrics) via Deno's
   native integration and `bk_otel_*` blocks.
8. Dagger: Used for defining and running CI/CD pipelines.
9. Preact: The UI library used by Fresh for components and islands.

## Tools

1. GitHub: For version control, issue tracking, and project management.
2. GitHub Copilot: AI assistant, expected to strictly follow A2 guidelines
   defined in these instruction files.
3. VSCode: The recommended code editor.
4. Deno CLI: Used for local development, running tasks (`deno task ...`),
   testing (`deno test`), linting (`deno lint`), and formatting (`deno fmt`).
5. Deno Deploy CLI (`deployctl`): Used for manual deployments and management of
   Deno Deploy projects.
6. Github CLI (`gh`): Used for interacting with GitHub from the command line.
