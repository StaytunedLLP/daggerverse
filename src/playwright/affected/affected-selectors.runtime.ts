import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const selectorMode = "__SELECTOR_MODE__";
const baseRef = "__BASE_REF__";

const listOnly = selectorMode === "--list";
const listTestsAll = selectorMode === "--list-tests-all";
const shouldExecute = process.env.STAYTUNED_AFFECTED_RUNTIME_EXECUTE === "1";

function assertSafeBaseRef(ref) {
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
    throw new Error(`Invalid base ref '${ref}' for affected selector discovery.`);
  }

  return ref;
}

const statCache = new Map();

function safeStat(path) {
  const cached = statCache.get(path);
  if (cached) {
    return cached;
  }

  try {
    const stats = statSync(path);
    statCache.set(path, stats);
    return stats;
  } catch {
    return null;
  }
}

function safeExists(path) {
  return safeStat(path) !== null;
}

function globToRegex(pattern) {
  let regex = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const nextCharacter = pattern[index + 1];

    if (character === "*" && nextCharacter === "*") {
      regex += ".*";
      index += 1;
      continue;
    }

    if (character === "*") {
      regex += "[^/]+";
      continue;
    }

    if (/[\\^$.*+?()[\]{}|/]/.test(character)) {
      regex += `\\${character}`;
      continue;
    }

    regex += character;
  }

  regex += "$";
  return new RegExp(regex);
}

function getWorkspaces() {
  const pkgJson = JSON.parse(readFileSync("./package.json", "utf8"));
  const patterns = pkgJson.workspaces ?? [];
  const regexes = patterns.map(globToRegex);

  const results = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }

      const path = join(dir, entry.name);
      const normalized = path.startsWith("./") ? path.slice(2) : path;

      if (regexes.some((regex) => regex.test(normalized))) {
        if (safeExists(join(path, "package.json"))) {
          results.push(normalized);
          continue;
        }
      }

      walk(path);
    }
  }

  walk(".");
  return results;
}

function getPackageGraph(workspaceDirs) {
  const cacheDir = "./.cache";
  const cachePath = join(cacheDir, "package-graph.json");

  if (safeExists(cachePath)) {
    try {
      const cacheMtime = safeStat(cachePath)?.mtimeMs ?? 0;
      let stale = false;

      for (const directory of workspaceDirs) {
        const packageJsonPath = join(directory, "package.json");
        const packageJsonStats = safeStat(packageJsonPath);
        if (packageJsonStats && packageJsonStats.mtimeMs > cacheMtime) {
          stale = true;
          break;
        }
      }

      if (!stale) {
        return JSON.parse(readFileSync(cachePath, "utf8"));
      }
    } catch {
      // Fall through to regenerate cache.
    }
  }

  const graph = {};
  const nameMap = {};
  const pkgCache = {};

  for (const directory of workspaceDirs) {
    const packageJsonPath = join(directory, "package.json");
    if (!safeExists(packageJsonPath)) {
      continue;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    pkgCache[directory] = packageJson;
    nameMap[packageJson.name] = directory;
    graph[directory] = [];
  }

  for (const directory of workspaceDirs) {
    const packageJson = pkgCache[directory];
    if (!packageJson) {
      continue;
    }

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const dependencyName of Object.keys(dependencies)) {
      const dependencyDirectory = nameMap[dependencyName];
      if (dependencyDirectory) {
        graph[directory].push(dependencyDirectory);
      }
    }
  }

  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    writeFileSync(cachePath, JSON.stringify(graph));
  } catch {
    // Ignore cache write failures.
  }

  return graph;
}

function getDiff() {
  const safeBaseRef = assertSafeBaseRef(baseRef);

  if (process.env.CHANGED_FILES) {
    return process.env.CHANGED_FILES.split(/[\s,]+/).filter(Boolean);
  }

  const commands = [
    `git diff --name-only --diff-filter=ACMRTUXB ${safeBaseRef}...HEAD`,
    "git diff --name-only --diff-filter=ACMRTUXB HEAD~1",
    'git show --name-only --pretty="format:" HEAD',
  ];

  for (const command of commands) {
    try {
      const out = execSync(command, {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf-8",
      }).trim();

      if (out.length > 0) {
        return out.split("\n");
      }
    } catch {
      if (command.includes(safeBaseRef)) {
        try {
          const fetchRef =
            safeBaseRef.startsWith("origin/") ? safeBaseRef.slice("origin/".length) : safeBaseRef;
          execSync(`git fetch origin ${fetchRef} --depth=1`, {
            stdio: "ignore",
          });
        } catch {
          // Ignore fetch failures and continue fallback commands.
        }
      }
    }
  }

  return [];
}

const ignoredExtensions = new Set([
  ".md",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".yml",
  ".yaml",
]);

function isSourceFile(file) {
  for (const extension of ignoredExtensions) {
    if (file.endsWith(extension)) {
      return false;
    }
  }

  return !(file.includes("/docs/") || file.startsWith("docs/"));
}

function changedPackages(files, workspaceDirs) {
  const changed = new Set();

  for (const file of files) {
    if (!isSourceFile(file)) {
      continue;
    }

    for (const directory of workspaceDirs) {
      if (file.startsWith(`${directory}/`)) {
        changed.add(directory);
        break;
      }
    }
  }

  return Array.from(changed);
}

function getReverseGraph(graph) {
  const reverse = {};
  for (const packageName of Object.keys(graph)) {
    reverse[packageName] = [];
  }

  for (const packageName of Object.keys(graph)) {
    for (const dependency of graph[packageName]) {
      reverse[dependency].push(packageName);
    }
  }

  return reverse;
}

function affectedPackages(
  changed,
  allFiles,
  packageNames,
  reverseGraph
) {
  if (changed.length === 0) {
    const infrastructureChanged = allFiles.some(
      (file) =>
        file.includes("tools/scripts/") ||
        file.endsWith("package.json") ||
        file.endsWith("tsconfig.json") ||
        file.endsWith("yarn.lock") ||
        file.endsWith("package-lock.json") ||
        file.endsWith("playwright.config.ts"),
    );

    return infrastructureChanged ? packageNames : [];
  }

  const seen = new Set(changed);
  const queue = [...changed];

  let index = 0;
  while (index < queue.length) {
    const current = queue[index++];
    const dependencies = reverseGraph[current];
    if (!dependencies) {
      continue;
    }

    for (const dependency of dependencies) {
      if (!seen.has(dependency)) {
        seen.add(dependency);
        queue.push(dependency);
      }
    }
  }

  return packageNames.filter((packageName) => seen.has(packageName));
}

function run() {
  try {
    const workspaceDirs = getWorkspaces();
    const graph = getPackageGraph(workspaceDirs);
    const packageNames = Object.keys(graph);
    const reverseGraph = getReverseGraph(graph);

    const files = getDiff();
    const changed = changedPackages(files, workspaceDirs);
    const affected = listTestsAll ? packageNames : affectedPackages(changed, files, packageNames, reverseGraph);

    if (listOnly) {
      console.log(affected.join(","));
      return;
    }

    const tests = [];
    for (const packageName of affected) {
      const testsPath = join(packageName, "tests");
      if (safeExists(testsPath)) {
        tests.push(testsPath);
      }
    }

    console.log(tests.join(" "));
  } catch (error) {
    console.error("❌ Runtime Error:");
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  }
}

if (shouldExecute) {
  run();
}
