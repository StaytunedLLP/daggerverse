import { Directory } from "@dagger.io/dagger";
import { firebaseBase } from "./firebase.js";

/**
 * Installs npm dependencies for the frontend and/or backend directories.
 * 
 * @param {Directory} source - The project source directory.
 * @param {string} [frontendDir] - Path to the frontend directory.
 * @param {string} [backendDir] - Path to the backend directory.
 * @returns {Promise<Directory>} The directory with node_modules installed.
 */
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
