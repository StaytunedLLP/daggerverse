import {
  Directory,
  Secret,
  argument,
  func,
  object,
} from "@dagger.io/dagger";
import {
  DEFAULT_SOURCE_EXCLUDES,
  createNodeWorkspace,
  withFullSource,
  withGhCli,
  withGCloudCli,
  withFirebaseCli,
} from "../shared/index.js";

@object()
export class Planning {
  /**
   * Sync planning documents (Epics, Features, Flags) with GitHub Issues.
   *
   * @param source - Repository source directory containing the planning documents.
   * @param githubToken - GitHub PAT with permissions to create and update issues.
   * @param dryRun - When true, only performs a dry run and logs intended actions.
   * @param repo - Optional repository in "owner/repo" format. Defaults to current repository.
   */
  @func()
  async syncPlanning(
    @argument({
      defaultPath: ".",
      ignore: DEFAULT_SOURCE_EXCLUDES,
    })
    source: Directory,
    githubToken: Secret,
    dryRun = false,
    repo?: string,
  ): Promise<Directory> {
    const workspace = createNodeWorkspace(source, undefined, {
      packagePaths: "src/planning",
    });

    const env = workspace
      .with(withGhCli)
      .withSecretVariable("GH_TOKEN", githubToken)
      .withExec(["gh", "auth", "setup-git"])
      .withExec(["git", "config", "--global", "user.name", "github-actions[bot]"])
      .withExec(["git", "config", "--global", "user.email", "github-actions[bot]@users.noreply.github.com"])
      .with(container => withFullSource(container, source, { strategy: "overlay" }))
      .withExec([
        "npx",
        "tsx",
        "src/planning/src/sync-planning.ts",
        ...(dryRun ? ["--dry-run"] : []),
        ...(repo ? ["--repo", repo] : []),
      ]);

    return env.directory(".");
  }

  /**
   * Sync feature flags from planning documents to Firebase Remote Config.
   *
   * @param source - Repository source directory containing the planning documents.
   * @param gcpCredentials - Secret containing GCP service account JSON.
   * @param env - Target environment (e.g., "dev", "stg", "prod").
   * @param dryRun - When true, only performs a dry run and logs intended actions.
   */
  @func()
  async syncRemoteConfig(
    @argument({
      defaultPath: ".",
      ignore: DEFAULT_SOURCE_EXCLUDES,
    })
    source: Directory,
    gcpCredentials: Secret,
    env = "dev",
    dryRun = false,
  ): Promise<string> {
    const workspace = createNodeWorkspace(source, undefined, {
      packagePaths: "src/planning",
    });

    const runner = workspace
      .with(withGCloudCli)
      .with(withFirebaseCli)
      .withSecretVariable("GOOGLE_APPLICATION_CREDENTIALS_JSON", gcpCredentials)
      .withExec([
        "bash",
        "-c",
        "echo $GOOGLE_APPLICATION_CREDENTIALS_JSON > /tmp/gcp-creds.json",
      ])
      .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/gcp-creds.json")
      .withExec(["gcloud", "auth", "activate-service-account", "--key-file=/tmp/gcp-creds.json"])
      .with(container => withFullSource(container, source, { strategy: "overlay" }))
      .withExec([
        "npx",
        "tsx",
        "src/planning/src/sync-remote-config.ts",
        `--env=${env}`,
        ...(dryRun ? ["--dry-run"] : []),
      ]);

    return runner.stdout();
  }
}
