import { dag, Directory, Secret } from "@dagger.io/dagger";

/**
 * Resolve the changed file set from git, inside the engine.
 *
 * The alternative this replaces is passing a comma-joined list in from the
 * caller. That path has two costs, both paid in production:
 *
 * The list has to travel through a Dagger local default, and `env://` there is
 * a *secret provider* URI -- it resolves for Secret-typed arguments and is
 * handed through verbatim for plain strings. The changed set is a string, so it
 * arrived as the literal text "env://CHANGED_FILES". Every consumer then failed
 * silently, in both directions: the scoped scripts filtered the phantom path out
 * and reported "no changes -- skip", becoming checks that could not fail, while
 * staytest resolved it against the repo root and read it as a root-level change,
 * escalating to every package plus a full build.
 *
 * And it requires `.git` in the container so the scripts can run `git diff`.
 * `.git` measures 5-12x the tracked source in these repositories and its digest
 * changes on every commit, so the workspace layer is re-materialised for each of
 * the four checks.
 *
 * Resolving here removes both. The engine already has the repository, the
 * result is a typed value rather than a string that can silently be the wrong
 * thing, and it is cached on the commit digests.
 */

export interface GitChangedOptions {
  /** Repository URL, https form. */
  url: string;
  /** Base ref to compare against, typically origin/main or a merge base sha. */
  base: string;
  /** Head ref. Defaults to the repository HEAD. */
  head?: string;
  /**
   * Credential for private repositories. Populates the password during basic
   * HTTP authorization, which is what a GitHub installation token needs.
   */
  token?: Secret;
}

/** A changed set, split by how each path changed. */
export interface ChangedSet {
  added: string[];
  modified: string[];
  removed: string[];
  /**
   * added + modified, the set that can actually be read from disk.
   *
   * Removed paths are deliberately excluded here and reported separately:
   * prettier and eslint treat a missing path as an error rather than as nothing
   * to do, so handing them a deleted file fails the run for the wrong reason.
   * They are still worth knowing about -- a delete-only change currently gets
   * no scoped checking at all, because the shell resolvers drop deletions with
   * an existsSync filter and are then left with an empty set.
   */
  present: string[];
}

// Content only. `tree()` includes `.git` by default -- verified, it is in the
// entries -- and shipping it is the thing this is meant to avoid. depth 1
// because nothing here reads history: the base and head trees are compared as
// content, not as commits.
const TREE_OPTS = { discardGitDir: true, depth: 1 } as const;

function repo(options: GitChangedOptions) {
  return options.token
    ? dag.git(options.url, { httpAuthToken: options.token })
    : dag.git(options.url);
}

/** The tree at a ref, without .git. */
export function treeAt(options: GitChangedOptions, ref: string): Directory {
  return repo(options).ref(ref).tree(TREE_OPTS);
}

/**
 * Paths that differ between base and head.
 *
 * Note this compares *trees*, not commits, so it reports the net difference.
 * A file added and then reverted within the range does not appear, which is the
 * correct scope for a check: the question is what the merge would change, not
 * what happened along the way.
 */
export async function changedBetween(
  options: GitChangedOptions,
): Promise<ChangedSet> {
  const source = repo(options);
  const headTree = options.head
    ? source.ref(options.head).tree(TREE_OPTS)
    : source.head().tree(TREE_OPTS);
  const baseTree = source.ref(options.base).tree(TREE_OPTS);

  const changeset = headTree.changes(baseTree);

  const [added, modified, removed] = await Promise.all([
    changeset.addedPaths(),
    changeset.modifiedPaths(),
    changeset.removedPaths(),
  ]);

  return {
    added,
    modified,
    removed,
    present: [...new Set([...added, ...modified])].sort(),
  };
}

/**
 * Uncommitted changes: the local profile, natively.
 *
 * Replaces a merge-base diff unioned with `git ls-files --others`, which had to
 * be hand-written once per repository and had already started to diverge
 * between them.
 */
export async function uncommittedChanges(
  options: GitChangedOptions,
): Promise<ChangedSet> {
  const changeset = repo(options).uncommitted();

  const [added, modified, removed] = await Promise.all([
    changeset.addedPaths(),
    changeset.modifiedPaths(),
    changeset.removedPaths(),
  ]);

  return {
    added,
    modified,
    removed,
    present: [...new Set([...added, ...modified])].sort(),
  };
}

/**
 * Comma-joined form, for consumers whose scripts still read CHANGED_FILES.
 *
 * The env variable is not going away in this change: the repository scripts
 * read it, and replacing both halves at once would leave nothing to compare a
 * regression against. This is the bridge, and it is the reason the value is now
 * produced by the engine rather than smuggled in as a string.
 */
export function asChangedFilesValue(set: ChangedSet): string {
  return set.present.join(",");
}
