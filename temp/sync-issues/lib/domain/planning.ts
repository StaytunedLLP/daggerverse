/**
 * planning.ts
 *
 * Pure domain logic for planning sync.
 */

import { pipe } from "../fp.js";
import type { RepoInfo, DocProcessResult, RenameOperation } from "../types.js";

// This file would contain functions that take data and return data/Results,
// with NO side effects like reading files or calling GitHub.
// Those will be orchestrated in the main script using Tasks.

export type PlanningConfig = {
    readonly repoInfo: RepoInfo;
    readonly dryRun: boolean;
    readonly epicType: string | null;
    readonly featureType: string | null;
    readonly flagType: string | null;
};

// ... existing logic from sync-planning.ts refactored to be pure ...
