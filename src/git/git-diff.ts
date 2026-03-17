import { dag, Directory, Container } from "@dagger.io/dagger";

/**
 * Creates a reusable git container with the source directory mounted.
 *
 * @param source - The source directory to mount.
 * @returns A Container ready for git operations.
 */
function createGitContainer(source: Directory): Container {
  return dag
    .container()
    .from("alpine/git:latest")
    .withDirectory("/app", source)
    .withWorkdir("/app");
}

/**
 * Retrieves an array of files that are staged for commit.
 *
 * @param source - The source directory to check for staged files.
 * @param container - Optional pre-built container (must have git and source mounted).
 * @returns An array of staged file paths.
 * @example
 * // TypeScript usage with source directory (automatic container creation)
 * const staged = await gitDiffStaged(sourceDir);
 *
 * // TypeScript usage with pre-built container
 * const container = createGitContainer(sourceDir);
 * const staged = await gitDiffStaged(sourceDir, container);
 *
 * // Dagger CLI usage
 * dagger call git-diff-staged --source=.
 */
export async function gitDiffStaged(
  source: Directory,
  container?: Container,
): Promise<string[]> {
  const gitContainer = container || createGitContainer(source);

  const changedFilesOutput = await gitContainer
    .withExec(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    .stdout();

  // Split the output into an array of files, removing any empty entries
  const files = changedFilesOutput
    .split("\n")
    .map((file: string) => file.trim())
    .filter(Boolean);

  return files;
}

/**
 * Retrieves an array of files from the previous commit.
 *
 * @param source - The source directory to check for files in the previous commit.
 * @param container - Optional pre-built container (must have git and source mounted).
 * @returns An array of file paths from the previous commit.
 * @example
 * // TypeScript usage with source directory
 * const previous = await gitDiffPrevious(sourceDir);
 *
 * // TypeScript usage with pre-built container
 * const container = createGitContainer(sourceDir);
 * const previous = await gitDiffPrevious(sourceDir, container);
 *
 * // Dagger CLI usage
 * dagger call git-diff-previous --source=.
 */
export async function gitDiffPrevious(
  source: Directory,
  container?: Container,
): Promise<string[]> {
  const gitContainer = container || createGitContainer(source);

  const lastCommitFilesOutput = await gitContainer
    .withExec([
      "git",
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "HEAD~1",
    ])
    .stdout();

  // Split the output into an array of files, removing any empty entries
  const files = lastCommitFilesOutput
    .split("\n")
    .map((file: string) => file.trim())
    .filter(Boolean);

  return files;
}

/**
 * Retrieves an array of files that have changed between two commits.
 *
 * @param source - The source directory to check for files in the commit range.
 * @param commitRange - A string specifying the range of commits.
 * @param container - Optional pre-built container (must have git and source mounted).
 * @returns An array of file paths changed between the commits.
 * @example
 * // TypeScript usage with source directory
 * const between = await gitDiffBetweenCommits(sourceDir, "HEAD~2..HEAD");
 *
 * // TypeScript usage with pre-built container
 * const container = createGitContainer(sourceDir);
 * const between = await gitDiffBetweenCommits(sourceDir, "HEAD~2..HEAD", container);
 *
 * // Dagger CLI usage
 * dagger call git-diff-between-commits --source=. --commit-range="HEAD~2..HEAD"
 */
export async function gitDiffBetweenCommits(
  source: Directory,
  commitRange: string,
  container?: Container,
): Promise<string[]> {
  const gitContainer = container ?? createGitContainer(source);

  const filesOutput = await gitContainer
    .withExec(["git", "diff", "--name-only", commitRange])
    .stdout();

  // Split the output into an array of files, removing any empty entries
  const files = filesOutput
    .split("\n")
    .map((file: string) => file.trim())
    .filter(Boolean);

  return files;
}
