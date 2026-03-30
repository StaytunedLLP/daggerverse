// @ts-check
import { execSync } from "node:child_process";
import { join } from "node:path";
import {
  readdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from "node:fs";

/** ---------------- TYPES ---------------- */

/// <reference types="node" />

/** @typedef {string} WorkspaceDir */
/** @typedef {Record<WorkspaceDir, WorkspaceDir[]>} PackageGraph */

/**
 * @typedef {Object} PackageJson
 * @property {string} name
 * @property {Record<string,string>=} dependencies
 * @property {Record<string,string>=} devDependencies
 */

/** ---------------- FLAGS ---------------- */

const selectorMode = "__SELECTOR_MODE__";
const baseRef = "__BASE_REF__";

const listOnly = selectorMode === "--list";
const listTestsOnly = selectorMode === "--list-tests";
const listTestsAll = selectorMode === "--list-tests-all";
const shouldExecute = process.env.STAYLOOK_AFFECTED_RUNTIME_EXECUTE === "1";

/** ---------------- FS CACHE ---------------- */

const statCache = new Map();
/**
 * @param {string} path
 */
const safeStat = (path) => {
  if (statCache.has(path)) return statCache.get(path);
  try {
    const s = statSync(path);
    statCache.set(path, s);
    return s;
  } catch {
    return null;
  }
};

/**
 * @param {string} path
 */
const safeExists = (path) => {
  return safeStat(path) !== null;
};

/** ---------------- WORKSPACES ---------------- */

/**
 * Faster workspace discovery using pattern filtering early
 * @returns {WorkspaceDir[]}
 */
const getWorkspaces = () => {
  const pkgJson = JSON.parse(readFileSync("./package.json", "utf8"));
  const patterns = pkgJson.workspaces || [];

  /** @type {RegExp[]} */
  const regexes = patterns.map((p) => {
    const pattern = p
      .replace(/\./g, "\\.")
      .replace(/\//g, "\\/")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]+");
    return new RegExp(`^${pattern}$`);
  });

  /** @type {WorkspaceDir[]} */
  const results = [];

  /**
   * @param {string} dir
   */
  /**
   * @param {string} dir
   */
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;

      const path = join(dir, entry.name);
      const normalized = path.startsWith("./") ? path.slice(2) : path;

      if (regexes.some((re) => re.test(normalized))) {
        if (safeExists(join(path, "package.json"))) {
          results.push(normalized);
          continue; // do not recurse deeper unnecessarily
        }
      }

      walk(path);
    }
  }

  walk(".");
  return results;
};

/** ---------------- GRAPH ---------------- */

/**
 * @param {WorkspaceDir[]} workspaceDirs
 * @returns {PackageGraph}
 */
const getPackageGraph = (workspaceDirs) => {
  const cacheDir = "./.cache";
  const cachePath = join(cacheDir, "package-graph.json");

  if (safeExists(cachePath)) {
    try {
      const cacheMtime = safeStat(cachePath)?.mtimeMs ?? 0;

      let stale = false;
      for (const d of workspaceDirs) {
        const p = join(d, "package.json");
        const stat = safeStat(p);
        if (stat && stat.mtimeMs > cacheMtime) {
          stale = true;
          break;
        }
      }

      if (!stale) {
        return JSON.parse(readFileSync(cachePath, "utf8"));
      }
    } catch {}
  }

  /** @type {PackageGraph} */
  const graph = {};
  /** @type {Record<string, WorkspaceDir>} */
  const nameMap = {};

  /** @type {Record<WorkspaceDir, PackageJson>} */
  const pkgCache = {};

  // SINGLE PASS READ
  for (const dir of workspaceDirs) {
    const path = join(dir, "package.json");
    if (!safeExists(path)) continue;

    const pkg = JSON.parse(readFileSync(path, "utf8"));
    pkgCache[dir] = pkg;
    nameMap[pkg.name] = dir;
    graph[dir] = [];
  }

  // BUILD GRAPH
  for (const dir of workspaceDirs) {
    const pkg = pkgCache[dir];
    if (!pkg) continue;

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const depName in deps) {
      const depDir = nameMap[depName];
      if (depDir) {
        graph[dir].push(depDir);
      }
    }
  }

  try {
    if (!safeExists(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(graph));
  } catch {}

  return graph;
};

/** ---------------- DIFF ---------------- */

/**
 * @returns {string[]}
 */
const getDiff = () => {
  if (process.env.CHANGED_FILES) {
    return process.env.CHANGED_FILES.split(/[\s,]+/).filter(Boolean);
  }

  // reordered: fastest first
  const commands = [
    "git diff --name-only --diff-filter=ACMRTUXB HEAD~1",
    'git show --name-only --pretty="format:" HEAD',
    "git diff --name-only --diff-filter=ACMRTUXB " + baseRef + "...HEAD",
    "git diff --name-only --diff-filter=ACMRTUXB origin/master...HEAD",
  ];

  for (const command of commands) {
    try {
      const out = execSync(command, {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf-8",
      }).trim();

      if (out) return out.split("\n");
    } catch {
      if (command.includes(baseRef)) {
        try {
          execSync(
            "git fetch origin " + baseRef.replace("origin/", "") + " --depth=1",
            { stdio: "ignore" }
          );
        } catch {}
      }
    }
  }

  return [];
};

/** ---------------- FILTER ---------------- */

const ignoredExt = new Set([
  ".md",".txt",".png",".jpg",".jpeg",".gif",".svg",".yml",".yaml"
]);

/**
 * @param {string} file
 */
const isSourceFile = (file) => {
  for (const ext of ignoredExt) {
    if (file.endsWith(ext)) return false;
  }
  return !(file.includes("/docs/") || file.startsWith("docs/"));
};

/**
 * @param {string[]} files
 * @param {WorkspaceDir[]} workspaceDirs
 */
const changedPackages = (files, workspaceDirs) => {
  const changed = new Set();

  for (const file of files) {
    /** @type {string} */
    const f = file;
    if (!isSourceFile(f)) continue;

    for (const dir of workspaceDirs) {
      if (file.startsWith(dir + "/")) {
        changed.add(dir);
        break;
      }
    }
  }

  return Array.from(changed);
};

/** ---------------- GRAPH OPS ---------------- */

/**
 * @param {PackageGraph} graph
 */
const getReverseGraph = (graph) => {
  /** @type {PackageGraph} */
  const reverse = {};

  for (const k in graph) reverse[k] = [];

  for (const pkg in graph) {
    for (const dep of graph[pkg]) {
      reverse[dep].push(pkg);
    }
  }

  return reverse;
};

/**
 * Optimized BFS (no shift)
 */
const affectedPackages = (changed, allFiles, packageNames, reverseGraph) => {
  if (changed.length === 0) {
    const infra = allFiles.some((f) =>
      f.includes("tools/scripts/") ||
      f.endsWith("package.json") ||
      f.endsWith("tsconfig.json") ||
      f.endsWith("yarn.lock") ||
      f.endsWith("package-lock.json") ||
      f.endsWith("playwright.config.ts")
    );

    return infra ? packageNames : [];
  }

  const seen = new Set(changed);
  const queue = [...changed];

  let i = 0;
  while (i < queue.length) {
    const current = queue[i++];

    const deps = reverseGraph[current];
    if (!deps) continue;

    for (const d of deps) {
      if (!seen.has(d)) {
        seen.add(d);
        queue.push(d);
      }
    }
  }

  return packageNames.filter((p) => seen.has(p));
};

/** ---------------- MAIN ---------------- */

const run = () => {
  try {
    const workspaceDirs = getWorkspaces();
    const graph = getPackageGraph(workspaceDirs);
    const packageNames = Object.keys(graph);
    const reverseGraph = getReverseGraph(graph);

    const files = getDiff();
    const changed = changedPackages(files, workspaceDirs);

    const affected =
      listTestsAll ? packageNames
      : affectedPackages(changed, files, packageNames, reverseGraph);

    if (listOnly) {
      console.log(affected.join(","));
      return;
    }

    const tests = [];
    for (const pkg of affected) {
      const t = join(pkg, "tests");
      if (safeExists(t)) tests.push(t);
    }

    console.log(tests.join(" "));
  } catch (err) {
    console.error("❌ Runtime Error:");
    console.error(err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  }
};

if (shouldExecute) {
  run();
}
