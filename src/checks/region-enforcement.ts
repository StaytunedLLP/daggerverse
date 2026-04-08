import { Directory } from "@dagger.io/dagger";
import { RegionConfig, RegionEnforcementOptions } from "./types.js";
import { gitDiffBetweenCommits, gitDiffStaged } from "../git/git-diff.js";

const DEFAULT_CONFIG: RegionConfig = {
  threshold: 30,
  extensions: {
    ".ts": { start: "// #region", end: "// #endregion" },
    ".js": { start: "// #region", end: "// #endregion" },
    ".tsx": { start: "// #region", end: "// #endregion" },
    ".jsx": { start: "// #region", end: "// #endregion" },
    ".css": { start: "/* #region", end: "/* #endregion" },
    ".scss": { start: "/* #region", end: "/* #endregion" },
    ".html": { start: "<!-- #region", end: "<!-- #endregion" },
    ".md": { start: "<!-- #region", end: "<!-- #endregion" },
  },
  ignore: [
    "node_modules/",
    "dist/",
    "build/",
    "generated/",
    "minified/",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
  ],
};

async function loadConfig(source: Directory): Promise<RegionConfig> {
  try {
    const configContent = await source.file("regions.json").contents();
    const config = JSON.parse(configContent);
    return {
      threshold: config.threshold ?? DEFAULT_CONFIG.threshold,
      extensions: { ...DEFAULT_CONFIG.extensions, ...config.extensions },
      ignore: [...DEFAULT_CONFIG.ignore, ...(config.ignore ?? [])],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function checkRegions(
  source: Directory,
  options: RegionEnforcementOptions = {},
): Promise<void> {
  const config = await loadConfig(source);
  const isCI = !!options.eventFile;
  const threshold = options.threshold ?? (isCI ? 0 : config.threshold);
  const extensions = options.extensions ?? Object.keys(config.extensions);
  const ignore = [...config.ignore, ...(options.ignore ?? [])];

  let changedFiles: string[] = [];
  if (isCI && options.eventFile) {
    const eventContent = await options.eventFile.contents();
    const event = JSON.parse(eventContent);
    const base =
      event.pull_request?.base?.sha || options.base || "origin/main";
    const head = event.pull_request?.head?.sha || "HEAD";
    changedFiles = await gitDiffBetweenCommits(source, `${base}..${head}`);
  } else {
    // Local or CI without event file: use staged or base diff
    if (options.base) {
      changedFiles = await gitDiffBetweenCommits(
        source,
        `${options.base}..HEAD`,
      );
    } else {
      changedFiles = await gitDiffStaged(source);
    }
  }

  const filesToCheck = changedFiles.filter((file) => {
    const hasValidExt = extensions.some((ext) => file.endsWith(ext));
    const isIgnored = ignore.some((pattern) => file.includes(pattern));
    return hasValidExt && !isIgnored;
  });

  const errors: string[] = [];

  for (const filepath of filesToCheck) {
    let content: string;
    try {
      content = await source.file(filepath).contents();
    } catch (e) {
      // File might have been deleted in the PR
      continue;
    }

    const lines = content.split("\n");
    const fileExtension = "." + filepath.split(".").pop();
    const pattern = config.extensions[fileExtension];

    if (!pattern) continue;

    // Rule 1: Region Presence for non-trivial files
    const regionCount = lines.filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.startsWith(pattern.start) && !trimmed.startsWith(pattern.end)
      );
    }).length;
    if (lines.length > threshold && regionCount === 0) {
      errors.push(
        `File "${filepath}" is non-trivial (${lines.length} lines) but contains no regions.`,
      );
      continue;
    }

    const stack: { name: string; line: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith(pattern.end)) {
        // Rule 2: Proper Pairing
        if (stack.length === 0) {
          errors.push(
            `File "${filepath}": Unmatched #endregion found at line ${i + 1}.`,
          );
        } else {
          stack.pop();
        }
      } else if (line.startsWith(pattern.start)) {
        // Rule 4: No Nested Regions
        if (stack.length > 0) {
          errors.push(
            `File "${filepath}": Nested region found at line ${i + 1}.`,
          );
        }

        // Rule 3: Non-Empty Region Names
        let name = line.slice(pattern.start.length).trim();
        // Strip block comment endings if present
        if (name.endsWith("*/")) {
          name = name.slice(0, -2).trim();
        } else if (name.endsWith("-->")) {
          name = name.slice(0, -3).trim();
        }

        if (!name) {
          errors.push(
            `File "${filepath}": Empty region name found at line ${i + 1}.`,
          );
        }
        stack.push({ name, line: i + 1 });
      }
    }

    // Rule 2: Proper Pairing (check for unclosed)
    while (stack.length > 0) {
      const unclosed = stack.pop();
      errors.push(`File "${filepath}": Unclosed #region "${unclosed?.name}" starting at line ${unclosed?.line}.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Region Enforcement Failed:\n${errors.join("\n")}`);
  }
}
