import { Directory } from "@dagger.io/dagger";
import { firebaseBase } from "./firebase.js";

/**
 * Builds the web application and/or functions.
 * 
 * @param {Directory} source - The project source directory.
 * @param {string} [frontendDir] - Path to the frontend directory.
 * @param {string} [backendDir] - Path to the backend directory.
 * @returns {Promise<Directory>} The directory containing the built assets.
 */
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
