import { Directory } from "@dagger.io/dagger";
import { firebaseBase } from "./firebase.js";

export async function build(
  source: Directory,
  frontendDir?: string,
  backendDir?: string
): Promise<Directory> {
  let container = firebaseBase().withDirectory("/src", source);

  if (frontendDir) {
    container = container.withWorkdir(`/src/${frontendDir}`).withExec(["npm", "run", "build"]);
  }

  if (backendDir) {
    container = container.withWorkdir(`/src/${backendDir}`).withExec(["npm", "run", "build"]);
  }

  return container.directory("/src");
}
