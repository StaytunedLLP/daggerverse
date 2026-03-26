import { Directory, Secret } from "@dagger.io/dagger";

export type PublishContextType = "main" | "pr";

export interface PublishOptions {
  /**
   * Repository source directory to publish from.
   */
  source: Directory;

  /**
   * Git ref for the commit being published (e.g. a merged release-PR commit SHA or a branch ref for manual dispatch).
   */
  ref: string;

  /**
   * GitHub event name (e.g. pull_request, workflow_dispatch).
   */
  eventName: string;

  /**
   * Manual branch input provided for workflow_dispatch.
   */
  inputBranch?: string;

  /**
   * Release PR number to finalize after publishing a merged release commit.
   */
  releasePrNumber?: number;

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
