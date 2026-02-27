import { Directory } from "@dagger.io/dagger";
import { firebaseBase } from "./firebase.js";

/**
 * Builds the frontend and/or backend directories using 'npm run build'.
 * 
 * @param {Directory} source - The source directory containing the project.
 * @param {string} [frontendDir] - Optional path to the frontend directory relative to /src.
 * @param {string} [backendDir] - Optional path to the backend directory relative to /src.
 * @returns {Promise<Directory>} The directory containing the build output.
 */
export async function build(
  source: Directory,
  frontendDir?: string,
  backendDir?: string
): Promise<Directory> {
  let container = firebaseBase().withDirectory("/src", source);

  if (frontendDir) {
    container = container
      .withWorkdir(`/src/${frontendDir}`)
      .withExec(["npm", "run", "build"]);
  }

  if (backendDir) {
    container = container
      .withWorkdir(`/src/${backendDir}`)
      .withExec(["npm", "run", "build"]);
  }

  return container.directory("/src");
}
