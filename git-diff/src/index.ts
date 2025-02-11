/**
 * A Dagger module providing Git diff functionalities to retrieve lists of files
 * based on different Git diff operations.
 *
 * This module allows you to get staged files, files from the previous commit,
 * or files changed between two specific commits within your Dagger pipelines.
 *
 * @module
 */
import { dag, Directory, func, object } from "@dagger.io/dagger";

@object()
export class GitDiffFiles {
  /**
   * Retrieves an array of files that are staged for commit.
   *
   * @param {Directory} source - The source directory to check for staged files.
   * @returns {Promise<string[]>} - An array of staged file paths.
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
   * Retrieves an array of files from the previous commit.
   *
   * @param {Directory} source - The source directory to check for files in the previous commit.
   * @returns {Promise<string[]>} - An array of file paths from the previous commit.
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
   * Retrieves an array of files that have changed between two commits.
   *
   * @param {Directory} source - The source directory to check for files in the commit range.
   * @param {string} commitRange - A string specifying the range of commits.
   * @returns {Promise<string[]>} - An array of file paths changed between the commits.
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
