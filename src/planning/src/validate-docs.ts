import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, parseFlagBlock } from "../lib/parser.js";

const SRC_ROOT = join(process.cwd(), "src");

// Helper to find all domain requirement directories
const getDomainRequirementDirs = (): string[] => {
    if (!existsSync(SRC_ROOT)) return [];

    const entries = readdirSync(SRC_ROOT, { withFileTypes: true });
    const reqDirs: string[] = [];

    for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== "requirement" && entry.name !== "shared") {
            const reqDir = join(SRC_ROOT, entry.name, "requirement");
            if (existsSync(reqDir)) {
                reqDirs.push(reqDir);
            }
        }
    }
    return reqDirs;
};

const walkSync = (dir: string): string[] => {
    const results: string[] = [];
    if (!existsSync(dir)) return results;
    const items = readdirSync(dir);
    for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            results.push(...walkSync(fullPath));
        } else if (item.endsWith(".md")) {
            results.push(fullPath);
        }
    }
    return results;
};

const validate = () => {
    console.log("🔍 Validating Remote Config Documentation...");
    let hasError = false;

    // Collect all files from domain-specific requirement directories
    const domainDirs = getDomainRequirementDirs();
    let files: string[] = [];

    for (const domainDir of domainDirs) {
        const featuresDir = join(domainDir, "features");
        const epicsDir = join(domainDir, "epics");
        files = files.concat(walkSync(featuresDir), walkSync(epicsDir));
    }

    for (const file of files) {
        const content = readFileSync(file, "utf8");
        const relativePath = file.replace(process.cwd(), "");

        // 1. Validate Frontmatter
        try {
            const { data } = parseFrontmatter(content);
            if (file.includes("/features/") && !data.feature_name) {
                console.error(`❌ [${relativePath}] Missing 'feature_name' in frontmatter`);
                hasError = true;
            }
            if (file.includes("/epics/") && !data.epic_name) {
                console.error(`❌ [${relativePath}] Missing 'epic_name' in frontmatter`);
                hasError = true;
            }
            if (data.status && !["draft", "in-progress", "active", "completed"].includes(data.status as string)) {
                console.error(`❌ [${relativePath}] Invalid status: ${data.status}. Must be draft|in-progress|active|completed`);
                hasError = true;
            }
        } catch (e) {
            console.error(`❌ [${relativePath}] Failed to parse frontmatter: ${e}`);
            hasError = true;
        }

        // 2. Validate Flag Blocks (only for features)
        if (file.includes("/features/")) {
            if (content.includes("REMOTE_CONFIG_FLAG_START")) {
                const block = parseFlagBlock(content);
                if (!block) {
                    console.error(`❌ [${relativePath}] Broken flag block. Ensure correct start/end markers and table format.`);
                    hasError = true;
                } else if (block.flags.length === 0) {
                    console.error(`❌ [${relativePath}] Flag block found but no flags detected. Check table columns.`);
                    hasError = true;
                } else {
                    const seenFlags = new Set<string>();
                    for (const flag of block.flags) {
                        // Check for duplicates
                        if (seenFlags.has(flag.context)) {
                            console.error(`❌ [${relativePath}] Duplicate flag identifier: ${flag.context}`);
                            hasError = true;
                        }
                        seenFlags.add(flag.context);

                        if (!flag.context) {
                            console.error(`❌ [${relativePath}] Flag missing 'Context' identifier`);
                            hasError = true;
                        }
                        if (!["BOOLEAN", "STRING", "NUMBER", "JSON"].includes(flag.type)) {
                            console.error(`❌ [${relativePath}] Invalid flag type: ${flag.type}`);
                            hasError = true;
                        }
                        // Default value validation
                        if (!flag.defaultDev || !flag.defaultStg || !flag.defaultProd) {
                            console.error(`❌ [${relativePath}] Flag '${flag.context}' is missing default values for one or more environments`);
                            hasError = true;
                        }
                    }
                }
            }
        }
    }

    if (hasError) {
        console.error("\n🛑 Validation failed. Please fix the errors above.");
        process.exit(1);
    } else {
        console.log("\n✅ Documentation validation successful!");
    }
};

validate();
