import { Directory, Secret } from "@dagger.io/dagger";

export type PublishContextType = "release" | "main" | "pr";

export interface PublishOptions {
  /**
   * Repository source directory to publish from.
   */
  source: Directory;

  /**
   * Git ref triggering the workflow (e.g. refs/heads/main, refs/tags/v1.2.3).
   */
  ref: string;

  /**
   * GitHub event name (e.g. push, release, workflow_dispatch).
   */
  eventName: string;

  /**
   * Manual branch input provided for workflow_dispatch.
   */
  inputBranch?: string;

  /**
   * GitHub PAT for npm authentication and PR validation.
   */
  githubToken: Secret;

  /**
   * Repository owner (e.g. StaytunedLLP).
   */
  repoOwner: string;

  /**
   * Repository name (e.g. devops).
   */
  repoName: string;

  /**
   * The scope of the npm package (e.g. staytunedllp).
   * Defaults to extracting from package.json if possible.
   */
  registryScope?: string;
}

export interface PackageManifest {
  name: string;
  version: string;
}
