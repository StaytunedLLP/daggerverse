# Dagger Git Diff Files Module

## Overview

This Dagger module, `GitDiffFiles`, provides a set of functions to easily retrieve lists of files based on Git diff operations within your Dagger pipelines.  It's designed to help you automate tasks based on changes in your Git repository, such as identifying staged files, files from the previous commit, or files changed between specific commits.

This module is intended for use in Dagger workflows and provides convenient access to Git diff information.

## Functions

### `getStagedFiles`

**Description:**

Returns a list of file paths that are currently staged in your Git repository. This function uses the command `git diff --cached --name-only --diff-filter=ACMR` to identify staged files, including added, copied, modified, and renamed files.

**Usage:**

```bash
dagger call -m=.dagger get-staged-files --source=.
```

**Parameters:**

* `source`:  A `Directory` object in Dagger representing the source code directory where you want to check for staged files. Usually, you'll pass `.`, representing the current directory.

**Returns:**

An array of strings, where each string is a file path of a staged file.

---

### `getPreviousCommitFiles`

**Description:**

Returns a list of file paths that were included in the commit immediately preceding the current `HEAD`. This function utilizes `git diff-tree --no-commit-id --name-only -r HEAD~1` to retrieve the file list from the previous commit.

**Usage:**

```bash
dagger call -m=.dagger get-previous-commit-files --source=.
```

**Parameters:**

* `source`: A `Directory` object representing the source code directory.

**Returns:**

An array of strings, where each string is a file path from the previous commit.

---

### `getFilesBetweenCommits`

**Description:**

Returns a list of file paths that have changed between two specified Git commits. This function employs `git diff --name-only <commitRange>` to identify files modified within the provided commit range.

**Usage:**

```bash
dagger call -m=.dagger get-files-between-commits --source=. --commitRange=<commit-range>
```

**Parameters:**

* `source`: A `Directory` object representing the source code directory.
* `commitRange`: A string specifying the Git commit range. This can be:
  * A range like `commit1..commit2` (files changed between commit1 and commit2).
  * A three-dot range like `branch1...branch2` (files changed on branch2 since branch point from branch1).
  * A single commit SHA (files changed relative to the parent of that commit).
  * Branch names or tags that resolve to commit SHAs.

**Returns:**

An array of strings, where each string is a file path that has changed within the specified commit range.
