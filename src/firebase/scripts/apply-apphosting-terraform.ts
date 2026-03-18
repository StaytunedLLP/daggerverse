import { spawnSync } from "node:child_process";

const commands: Array<[string, string[]]> = [
  ["terraform", ["init", "-input=false"]],
  ["terraform", ["apply", "-input=false", "-auto-approve"]],
  ["terraform", ["output", "-json"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio:
      command === "terraform" && args[0] === "output"
        ? ["ignore", "pipe", "inherit"]
        : "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (command === "terraform" && args[0] === "output" && result.stdout) {
    process.stdout.write(result.stdout);
  }
}
