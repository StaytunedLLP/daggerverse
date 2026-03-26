import { dag } from "@dagger.io/dagger";

const ALLOWED_PREFIXES = [
  "feat",
  "fix",
  "chore",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
];

/**
 * Validates a PR title against the Conventional Commits-inspired format.
 *
 * @param title - The PR title to validate.
 * @throws Error if the title is invalid.
 */
export function validatePrTitle(title: string): void {
  const prefixPattern = ALLOWED_PREFIXES.join("|");
  // Matches: <prefix>[(<scope>)]: <description>
  // Case-sensitive, supports optional space after colon, supports optional scope.
  const regex = new RegExp(`^(${prefixPattern})(\\([\\w.-]+\\))?:.*$`);

  if (!regex.test(title)) {
    throw new Error(
      `PR title "${title}" does not follow the naming convention. It must start with one of: ${ALLOWED_PREFIXES.join(
        ", ",
      )} (e.g., "feat: my feature" or "feat(scope): my feature").`,
    );
  }
}

/**
 * Reads the PR title from the GitHub event file and validates it.
 * This is intended to be used in GitHub Actions.
 */
export async function checkPrTitleFromEvent(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath) {
    console.warn("GITHUB_EVENT_PATH not set, skipping PR title check.");
    return;
  }

  try {
    const content = await dag.host().file(eventPath).contents();
    const event = JSON.parse(content);
    const title = event.pull_request?.title;

    if (!title) {
      console.warn("No pull_request.title found in event file, skipping.");
      return;
    }

    validatePrTitle(title);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("PR title")) {
      throw error;
    }
    throw new Error(`PR title validation failed: ${errorMessage}`);
  }
}
