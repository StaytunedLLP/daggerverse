import { dag, Container } from "@dagger.io/dagger";

const NODE_MAJOR = "24";

// Safe to share across repos because npm's content store is content-addressed.
export const SHARED_NPM_CACHE_VOLUME = `st-node${NODE_MAJOR}-npm`;

/**
 * Creates the base Node.js container used by install/build/test style steps.
 *
 * @returns {Container} A container with Node.js and shared npm cache mounted.
 */
export function nodeBase(): Container {
  const npmCache = dag.cacheVolume(SHARED_NPM_CACHE_VOLUME);
  return dag
    .container()
    .from("node:24")
    .withMountedCache("/root/.npm", npmCache);
}

/**
 * Creates a container with Firebase CLI installed for deploy operations.
 *
 * @returns {Container} A container with Node.js, npm cache, and firebase-tools.
 */
export function firebaseCliBase(): Container {
  return nodeBase().withExec(["npm", "install", "-g", "firebase-tools"]);
}
