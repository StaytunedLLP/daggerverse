import { writeFileSync } from "node:fs";

const content = process.env.BUILD_ENV_SECRET ?? "";

if (content.trim().length > 0) {
  writeFileSync(".env", `${content.trimEnd()}\n`);
}
