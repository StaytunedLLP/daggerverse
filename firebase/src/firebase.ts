import { dag, Container } from "@dagger.io/dagger";

/**
 * Creates the base container for Firebase operations.
 * 
 * @returns {Container} A container with Node.js and firebase-tools installed.
 */
export function firebaseBase(): Container {
  return dag
    .container()
    .from("node:22-slim")
    .withExec(["npm", "install", "-g", "firebase-tools"]);
}
