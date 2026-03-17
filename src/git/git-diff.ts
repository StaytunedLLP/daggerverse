import { dag, Directory } from "@dagger.io/dagger";

/**
 * Retrieves an array of files that are staged for commit.
 *
 * @param source - The source directory to check for staged files.
 * @returns An array of staged file paths.
 */
export async function gitDiffStaged(source: Directory): Promise<string[]> {
  const container = dag
    .container()
    .from("alpine/git:latest")
    .withDirectory("/app", source)
    .withWorkdir("/app");

  const changedFilesOutput = await container
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
 * @returns An array of file paths from the previous commit.
 */
export async function gitDiffPrevious(source: Directory): Promise<string[]> {
  const container = dag
    .container()
    .from("alpine/git:latest")
    .withDirectory("/app", source)
    .withWorkdir("/app");

  const lastCommitFilesOutput = await container
    .withExec(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD~1"])
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
 * @returns An array of file paths changed between the commits.
 */
export async function gitDiffBetweenCommits(
  source: Directory,
  commitRange: string,
): Promise<string[]> {
  const container = dag
    .container()
    .from("alpine/git:latest")
    .withDirectory("/app", source)
    .withWorkdir("/app");

  const filesOutput = await container
    .withExec(["git", "diff", "--name-only", commitRange])
    .stdout();

  // Split the output into an array of files, removing any empty entries
  const files = filesOutput
    .split("\n")
    .map((file: string) => file.trim())
    .filter(Boolean);

  return files;
}
