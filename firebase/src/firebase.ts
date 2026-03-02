import { dag, Container } from "@dagger.io/dagger";

/**
 * Creates the base container for Firebase operations.
 * 
 * @returns {Container} A container with Node.js and firebase-tools installed.
 */
export function firebaseBase(): Container {
  const npmCache = dag.cacheVolume("npm_cache");
  return dag
    .container()
    .from("node:24")
    .withMountedCache("/root/.npm", npmCache)
    .withExec(["npm", "install", "-g", "firebase-tools"]);
}
