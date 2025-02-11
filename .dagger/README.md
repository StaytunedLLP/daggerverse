# GitDiffFiles Module Documentation

## Overview

The `GitDiffFiles` module provides functions to interact with Git repositories and retrieve information about changed files. This module is generated via Dagger and serves as a reference for basic module structure.

## Functions

### getStagedFiles

**Description:**
Returns an array of files in the staged state.

**Usage:**

```bash
dagger call -m=.dagger get-staged-files --source=.
```

**Returns:**
An array of strings representing the staged files.

### getLastCommitFiles

**Description:**
Returns an array of files from the last commit.

**Usage:**

```bash
dagger call -m=.dagger get-last-commit-files --source=.
```

**Returns:**
An array of strings representing the files from the last commit.

### getCommitFilesInRange

**Description:**
Returns a JSON string containing arrays of files for each commit in the specified range.

**Usage:**

```bash
dagger call -m=.dagger get-commit-files-in-range --source=. --commitRange=<commit-range>
```

**Parameters:**

- `commitRange` (optional): A string specifying the range of commits. If not provided, defaults to `HEAD`.

**Returns:**
A JSON string containing arrays of files for each commit in the specified range.
