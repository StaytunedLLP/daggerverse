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
import { dag, Container, Directory, object, func } from "@dagger.io/dagger"

@object()
export class GitDiffFiles {
  /**
   *  TO RUN (`dagger call  -m=.dagger get-staged-files --source=.`)
   * Returns an array of files in the staged state
   */
  @func()
  async getStagedFiles(source: Directory): Promise<string[]> {
    const container = dag
      .container()
      .from("alpine/git:latest")
      .withDirectory("/app", source)
      .withWorkdir("/app")

    const changedFilesOutput = await container
      .withExec(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"])
      .stdout();

    // Split the output into an array of files, removing any empty entries
    const files = changedFilesOutput
      .split("\n")
      .map((file) => file.trim())
      .filter(Boolean);

    return files;
  }
}
