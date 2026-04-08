import { File, Secret, dag } from "@dagger.io/dagger";

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
 * Validates a PR title against the Conventional Commits 1.0.0 specification.
 *
 * @param title - The PR title to validate.
 * @throws Error if the title is invalid.
 */
export function validatePrTitle(title: string): void {
  const prefixPattern = ALLOWED_PREFIXES.join("|");
  // Conventional Commits 1.0.0:
  // <type>[optional scope][optional !]: <description>
  // MUST be followed by REQUIRED terminal colon and space.
  const regex = new RegExp(`^(${prefixPattern})(\\([\\w.-]+\\))?!?: .+$`);

  if (!regex.test(title)) {
    let reason = "The title must follow the pattern: <type>[optional scope][optional !]: <description>";

    if (!ALLOWED_PREFIXES.some(p => title.startsWith(p))) {
      reason = `The type must be one of: ${ALLOWED_PREFIXES.join(", ")}.`;
    } else if (!title.includes(": ")) {
      reason = "A space MUST follow the terminal colon after the type/scope (e.g., 'feat: my feature').";
    } else if (title.includes("(!)")) {
      reason = "Breaking changes are indicated by a '!' before the colon (e.g., 'feat!: description'), not inside the scope.";
    }

    throw new Error(
      `PR title "${title}" is invalid according to Conventional Commits 1.0.0. ${reason}`,
    );
  }
}

/**
 * Reads the PR title from the GitHub event file and validates it.
 * This is intended to be used in GitHub Actions.
 *
 * @param eventFile - Optional Dagger File containing the GitHub event JSON.
 * @param githubToken - Optional GitHub token to post a comment if validation fails.
 */
export async function checkPrTitleFromEvent(
  eventFile?: File,
  githubToken?: Secret,
): Promise<void> {
  let content: string;

  if (eventFile) {
    content = await eventFile.contents();
  } else {
    const eventPath = process.env.GITHUB_EVENT_PATH;

    if (!eventPath) {
      console.warn("GITHUB_EVENT_PATH not set, skipping PR title check.");
      return;
    }

    try {
      content = await dag.host().file(eventPath).contents();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read event file from host: ${errorMessage}`);
    }
  }

  let event: any;
  try {
    event = JSON.parse(content);
  } catch (error: unknown) {
    throw new Error(
      `Failed to parse GitHub event file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const title = event.pull_request?.title;

  if (!title) {
    console.warn("No pull_request.title found in event file, skipping.");
    return;
  }

  try {
    validatePrTitle(title);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (githubToken) {
      const prNumber = event.pull_request?.number;
      const repoFullName = event.repository?.full_name;

      if (prNumber && repoFullName) {
        try {
          await postPrComment(
            githubToken,
            repoFullName,
            prNumber,
            `❌ **PR Title Validation Failed**\n\n${errorMessage}`,
          );
        } catch (commentError) {
          console.warn(
            `Failed to post PR comment: ${commentError instanceof Error ? commentError.message : String(commentError)}`,
          );
        }
      } else {
        console.warn(
          "Could not post PR comment: pull_request.number or repository.full_name missing in event file.",
        );
      }
    }

    if (errorMessage.includes("PR title")) {
      throw error;
    }
    throw new Error(`PR title validation failed: ${errorMessage}`);
  }
}

/**
 * Posts a comment to a GitHub Pull Request using the official `gh` CLI image.
 */
async function postPrComment(
  githubToken: Secret,
  repoFullName: string,
  prNumber: number,
  comment: string,
): Promise<void> {
  await dag
    .container()
    .from("ghcr.io/cli/cli:2.89.0")
    .withSecretVariable("GH_TOKEN", githubToken)
    .withNewFile("/tmp/comment.md", comment)
    .withExec(
      [
        "pr",
        "comment",
        prNumber.toString(),
        "--repo",
        repoFullName,
        "--body-file",
        "/tmp/comment.md",
      ],
      {
        useEntrypoint: true,
      },
    )
    .sync();
}
