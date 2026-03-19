import { writeFileSync } from "node:fs";

const content = process.env.BUILD_ENV_SECRET ?? "";

function toDotenvLines(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const payload = (() => {
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }

      if (typeof parsed !== "string") {
        return null;
      }

      const nested = JSON.parse(parsed) as unknown;
      if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
        return null;
      }

      return nested as Record<string, unknown>;
    })();

    if (!payload) {
      return `${trimmed}\n`;
    }

    const lines = Object.entries(payload).map(([key, value]) => {
      const normalizedValue =
        typeof value === "string" ? value : JSON.stringify(value);
      return `${key}=${JSON.stringify(normalizedValue)}`;
    });

    return `${lines.join("\n")}\n`;
  } catch {
    return `${trimmed}\n`;
  }
}

if (process.env.STAYDEVOPS_RUNTIME === "true") {
  const envFileContent = toDotenvLines(content);
  if (envFileContent.trim().length > 0) {
    writeFileSync(".env", envFileContent);
  }
}
