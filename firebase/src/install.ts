import { Directory } from "@dagger.io/dagger";
import { firebaseBase } from "./firebase.js";

export async function installDeps(
  source: Directory,
  frontendDir?: string,
  backendDir?: string
): Promise<Directory> {
  let container = firebaseBase().withDirectory("/src", source);

  if (frontendDir) {
    container = container.withWorkdir(`/src/${frontendDir}`).withExec(["npm", "ci", "--legacy-peer-deps"]);
  }

  if (backendDir) {
    container = container.withWorkdir(`/src/${backendDir}`).withExec(["npm", "ci", "--legacy-peer-deps"]);
  }

  return container.directory("/src");
}
