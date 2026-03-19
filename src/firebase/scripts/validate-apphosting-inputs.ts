import { existsSync } from "node:fs";

const rootDir = process.env.APPHOSTING_ROOT_DIR?.trim() ?? "";

if (process.env.STAYDEVOPS_RUNTIME === "true") {
  if (!rootDir) {
    throw new Error("rootDir is required");
  }

  if (!existsSync(rootDir)) {
    throw new Error(`App Hosting root directory not found: ${rootDir}`);
  }
}
