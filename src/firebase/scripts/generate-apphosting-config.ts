import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const backendId = process.env.APPHOSTING_BACKEND_ID?.trim() ?? "";
const rootDir = process.env.APPHOSTING_ROOT_DIR?.trim() ?? "";
const firebaseDir = process.env.APPHOSTING_FIREBASE_DIR?.trim() || ".";
const configName = process.env.APPHOSTING_CONFIG_NAME?.trim() || "firebase.apphosting.ci.json";

if (process.env.STAYDEVOPS_RUNTIME === "true") {
  if (!backendId) {
    throw new Error("backendId is required");
  }

  if (!rootDir) {
    throw new Error("rootDir is required");
  }

  const baseDir = firebaseDir === "." ? "." : firebaseDir;
  const relativeRootDir = path.posix.relative(baseDir, rootDir) || ".";
  const configPath = path.posix.join(baseDir, configName);

  mkdirSync(path.posix.dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        apphosting: [
          {
            backendId,
            rootDir: relativeRootDir,
            ignore: [
              "node_modules",
              ".git",
              "firebase-debug.log",
              "firebase-debug.*.log",
              "functions",
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}
