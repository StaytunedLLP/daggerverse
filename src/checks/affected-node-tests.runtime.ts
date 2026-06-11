import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

type WorkspaceDir = string;
type PackageGraph = Record<WorkspaceDir, WorkspaceDir[]>;

type PackageJson = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[];
};

const baseRef: string = "__BASE_REF__";
const shouldExecute = process.env.STAYTUNED_AFFECTED_RUNTIME_EXECUTE === "1";

function assertSafeBaseRef(ref: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
    throw new Error(`Invalid base ref '${ref}' for affected selector discovery.`);
  }
  return ref;
}

const statCache = new Map<string, ReturnType<typeof statSync>>();

function safeStat(path: string): ReturnType<typeof statSync> | null {
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

function safeExists(path: string): boolean {
  return safeStat(path) !== null;
}

function globToRegex(pattern: string): RegExp {
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

// Helper to find files matching a pattern recursively (e.g. *.test.ts, *.spec.ts)
function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  if (!safeExists(dir)) {
    return results;
  }

  function walk(currentDir: string): void {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== ".artifacts" && entry.name !== "dist") {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts") || entry.name.endsWith(".test.js") || entry.name.endsWith(".spec.js")) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

function getWorkspaces(): { workspaces: WorkspaceDir[]; isWorkspaces: boolean } {
  if (!safeExists("./package.json")) {
    return { workspaces: [], isWorkspaces: false };
  }

  const pkgJson = JSON.parse(readFileSync("./package.json", "utf8")) as PackageJson;
  const patterns = pkgJson.workspaces;

  if (patterns && Array.isArray(patterns) && patterns.length > 0) {
    const regexes = patterns.map(globToRegex);
    const results: WorkspaceDir[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".artifacts" || entry.name === "dist") {
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
    return { workspaces: results, isWorkspaces: true };
  }

  // If there are no workspaces, treat direct subfolders in src/ as packages/modules (staystack-style)
  const results: WorkspaceDir[] = [];
  if (safeExists("./src")) {
    for (const entry of readdirSync("./src", { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "scripts" && entry.name !== "cli-utils") {
        results.push(join("src", entry.name));
      }
    }
  }

  return { workspaces: results, isWorkspaces: false };
}

function getPackageGraph(workspaceDirs: WorkspaceDir[], isWorkspaces: boolean): PackageGraph {
  const graph: PackageGraph = {};

  if (isWorkspaces) {
    const nameMap: Record<string, WorkspaceDir> = {};
    const pkgCache: Record<WorkspaceDir, PackageJson> = {};

    for (const directory of workspaceDirs) {
      const packageJsonPath = join(directory, "package.json");
      if (!safeExists(packageJsonPath)) {
        continue;
      }
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
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
  } else {
    // Single package monorepo: Build graph using import analysis on files in src/<package>
    // We treat each workspace directory as a key.
    for (const directory of workspaceDirs) {
      graph[directory] = [];
    }

    const packageNames = workspaceDirs.map((dir) => dir.slice("src/".length));

    for (const directory of workspaceDirs) {
      const files: string[] = [];
      function collectFiles(currentDir: string): void {
        if (!safeExists(currentDir)) return;
        for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
          const fullPath = join(currentDir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== "node_modules" && entry.name !== "tests") {
              collectFiles(fullPath);
            }
          } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
            files.push(fullPath);
          }
        }
      }
      collectFiles(directory);

      const importedPackages = new Set<string>();

      for (const file of files) {
        try {
          const content = readFileSync(file, "utf8");
          // Match ESM imports: import ... from '...'
          const importRegex = /from\s+['"]([^'"]+)['"]/g;
          let match;
          while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            if (importPath.startsWith("#")) {
              // Extract subpackage name, e.g. #staybase/errors -> staybase
              const cleanImport = importPath.slice(1).split("/")[0];
              if (cleanImport && packageNames.includes(cleanImport) && cleanImport !== directory.slice("src/".length)) {
                importedPackages.add(`src/${cleanImport}`);
              }
            } else if (importPath.startsWith(".")) {
              // Relative import crossing package boundary
              const absoluteImport = resolve(join(file, ".."), importPath);
              const relativeToSrc = relative(resolve("./src"), absoluteImport);
              if (!relativeToSrc.startsWith("..") && !relativeToSrc.startsWith(".")) {
                const parts = relativeToSrc.split("/");
                const targetPkg = parts[0];
                if (targetPkg && packageNames.includes(targetPkg) && targetPkg !== directory.slice("src/".length)) {
                  importedPackages.add(`src/${targetPkg}`);
                }
              }
            }
          }
        } catch {
          // Ignore read/parse errors
        }
      }

      graph[directory] = Array.from(importedPackages);
    }
  }

  return graph;
}

function getDiff(): string[] {
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
          // Ignore
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

function isSourceFile(file: string): boolean {
  for (const extension of ignoredExtensions) {
    if (file.endsWith(extension)) {
      return false;
    }
  }
  return !(file.includes("/docs/") || file.startsWith("docs/"));
}

function changedPackages(files: string[], workspaceDirs: WorkspaceDir[]): WorkspaceDir[] {
  const changed = new Set<WorkspaceDir>();

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

function getReverseGraph(graph: PackageGraph): PackageGraph {
  const reverse: PackageGraph = {};
  for (const packageName of Object.keys(graph)) {
    reverse[packageName] = [];
  }

  for (const packageName of Object.keys(graph)) {
    for (const dependency of graph[packageName]) {
      if (reverse[dependency]) {
        reverse[dependency].push(packageName);
      }
    }
  }

  return reverse;
}

function affectedPackages(
  changed: WorkspaceDir[],
  allFiles: string[],
  packageNames: WorkspaceDir[],
  reverseGraph: PackageGraph,
): WorkspaceDir[] {
  if (changed.length === 0) {
    const infrastructureChanged = allFiles.some(
      (file) =>
        !file.startsWith(".github/") &&
        !file.startsWith("dagger/") &&
        (file.includes("tools/scripts/") ||
          file.endsWith("package.json") ||
          file.endsWith("tsconfig.json") ||
          file.endsWith("yarn.lock") ||
          file.endsWith("package-lock.json") ||
          file.endsWith("playwright.config.ts") ||
          file.endsWith("eslint.config.ts")),
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

function run(): void {
  try {
    const { workspaces: workspaceDirs, isWorkspaces } = getWorkspaces();
    const graph = getPackageGraph(workspaceDirs, isWorkspaces);
    const packageNames = Object.keys(graph);
    const reverseGraph = getReverseGraph(graph);

    const files = getDiff();
    const changed = changedPackages(files, workspaceDirs);
    const affected = affectedPackages(changed, files, packageNames, reverseGraph);

    // If everything is affected or base config changed, run everything
    const allTests = workspaceDirs.flatMap((dir) => findTestFiles(dir));
    if (affected.length === packageNames.length) {
      console.log(allTests.join(" "));
      return;
    }

    const testFiles = affected.flatMap((dir) => findTestFiles(dir));
    console.log(testFiles.join(" "));
  } catch (error) {
    console.error("❌ Runtime Error:");
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  }
}

if (shouldExecute) {
  run();
}
