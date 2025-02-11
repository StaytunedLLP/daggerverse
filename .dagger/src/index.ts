import { dag, Directory, func, object } from "@dagger.io/dagger";

/**
 *  A Dagger module providing Git diff functionalities to retrieve lists of files
 *  based on different Git diff operations.
 *  It allows you to easily get staged files, files from the previous commit,
 *  or files changed between two specific commits within your Dagger pipelines.
 *
 *  @module
 */
@object()
export class GitDiffFiles {
  /**
   *  TO RUN (`dagger call  -m=.dagger get-staged-files --source=.`)
   * Returns an array of files in the staged state.
   * This function utilizes `git diff --cached --name-only --diff-filter=ACMR`
   * to list files that are staged for commit, considering added, copied, modified, and renamed files.
   *
   * @param {Directory} source - The source directory to check for staged files.
   * @returns {Promise<string[]>} - A promise that resolves to an array of staged file paths.
   */
  @func()
  async getStagedFiles(source: Directory): Promise<string[]> {
    const container = dag
      .container()
      .from("alpine/git:latest")
      .withDirectory("/app", source)
      .withWorkdir("/app");

    const changedFilesOutput = await container
      .withExec([
        "git",
        "diff",
        "--cached",
        "--name-only",
        "--diff-filter=ACMR",
      ])
      .stdout();

    // Split the output into an array of files, removing any empty entries
    const files = changedFilesOutput
      .split("\n")
      .map((file: string) => file.trim())
      .filter(Boolean);

    return files;
  }

  /**
   *  TO RUN (`dagger call  -m=.dagger get-previous-commit-files --source=.`)
   * Returns an array of files from the previous commit.
   * This function uses `git diff-tree --no-commit-id --name-only -r HEAD~1`
   * to list files that were part of the commit immediately preceding the current HEAD.
   *
   * @param {Directory} source - The source directory to check for files in the previous commit.
   * @returns {Promise<string[]>} - A promise that resolves to an array of file paths from the previous commit.
   */
  @func()
  async getPreviousCommitFiles(source: Directory): Promise<string[]> {
    const container = dag
      .container()
      .from("alpine/git:latest")
      .withDirectory("/app", source)
      .withWorkdir("/app");

    const lastCommitFilesOutput = await container
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
   *  TO RUN (`dagger call  -m=.dagger get-files-between-commits --source=. --commitRange=<commit-range>`)
   * Returns an array of files that have changed between two commits.
   * This function leverages `git diff --name-only <commitRange>`
   * to identify files modified within the specified commit range.
   * The `commitRange` parameter should be a valid Git commit range expression
   * (e.g., `commit1..commit2`, `branch1...branch2`, or a single commit SHA).
   *
   * @param {Directory} source - The source directory to check for files in the commit range.
   * @param {string} commitRange - A string specifying the range of commits (e.g., "HEAD~2..HEAD").
   * @returns {Promise<string[]>} - A promise that resolves to an array of file paths changed between the commits.
   */
  @func()
  async getFilesBetweenCommits(
    source: Directory,
    commitRange: string,
  ): Promise<string[]> {
    const container = dag
      .container()
      .from("alpine/git:latest")
      .withDirectory("/app", source)
      .withWorkdir("/app");

    const filesOutput = await container
      .withExec([
        "git",
        "diff",
        "--name-only",
        commitRange,
      ])
      .stdout();

    // Split the output into an array of files, removing any empty entries
    const files = filesOutput
      .split("\n")
      .map((file: string) => file.trim())
      .filter(Boolean);

    return files;
  }
}