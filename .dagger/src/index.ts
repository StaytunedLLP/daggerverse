/**
 * A generated module for GitDiffFiles functions
 *
 * This module has been generated via dagger init and serves as a reference to
 * basic module structure as you get started with Dagger.
 *
 * Two functions have been pre-created. You can modify, delete, or add to them,
 * as needed. They demonstrate usage of arguments and return types using simple
 * echo and grep commands. The functions can be called from the dagger CLI or
 * from one of the SDKs.
 *
 * The first line in this comment block is a short description line and the
 * rest is a long description with more detail on the module's purpose or usage,
 * if appropriate. All modules should have a short description.
 */
import { dag, Directory, func, object } from "@dagger.io/dagger";

@object()
export class GitDiffFiles {
  /**
   *  TO RUN (`dagger call  -m=.dagger get-staged-files --source=.`)
   * Returns an array of files in the staged state
   *
   * @param {Directory} source - The source directory to check for staged files.
   * @returns {Promise<string[]>} - A promise that resolves to an array of staged files.
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
   *  TO RUN (`dagger call  -m=.dagger get-last-commit-files --source=.`)
   * Returns an array of files from the last commit
   *
   * @param {Directory} source - The source directory to check for files in the last commit.
   * @returns {Promise<string[]>} - A promise that resolves to an array of files from the last commit.
   */
  @func()
  async getLastCommitFiles(source: Directory): Promise<string[]> {
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
        "HEAD",
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
   *  TO RUN (`dagger call  -m=.dagger get-commit-files-in-range --source=. --commitRange=<commit-range>`)
   * Returns a JSON string containing arrays of files for each commit in the specified range
   *
   * @param {Directory} source - The source directory to check for files in the commit range.
   * @param {string} [commitRange] - A string specifying the range of commits. If not provided, defaults to `HEAD`.
   * @returns {Promise<string>} - A promise that resolves to a JSON string containing arrays of files for each commit in the specified range.
   */
  @func()
  async getCommitFilesInRange(
    source: Directory,
    commitRange?: string,
  ): Promise<string> {
    const container = dag
      .container()
      .from("alpine/git:latest")
      .withDirectory("/app", source)
      .withWorkdir("/app");

    const revListArgs = ["git", "rev-list", "--pretty=format:%H"];
    if (commitRange) {
      revListArgs.push(commitRange); // Add commit range if provided
    } else {
      revListArgs.push("HEAD"); // Default to HEAD if no range
    }

    const commitRangeOutput = await container
      .withExec(revListArgs)
      .stdout();

    const commits = commitRangeOutput
      .split("\n")
      .map((line: string) =>
        line.trim().startsWith("commit ") ? line.replace("commit ", "") : ""
      )
      .filter(Boolean);

    const commitFilesPromises = commits.map(async (commit: string) => {
      const filesOutput = await container
        .withExec([
          "git",
          "diff-tree",
          "--no-commit-id",
          "--name-only",
          "-r",
          commit,
        ])
        .stdout();

      const files = filesOutput
        .split("\n")
        .map((file: string) => file.trim())
        .filter(Boolean);

      return { commit, files };
    });

    const result = await Promise.all(commitFilesPromises);
    return JSON.stringify(result, null, 2);
  }
}
