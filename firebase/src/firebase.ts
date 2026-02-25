import { dag, Container, Secret } from "@dagger.io/dagger";

/**
 * Returns a base container with Node.js and Firebase Tools installed.
 * 
 * @returns {Container} The base Firebase container.
 */
export function firebaseBase(): Container {
  return dag
    .container()
    .from("node:22")
    .withExec(["npm", "install", "-g", "firebase-tools"]);
}
