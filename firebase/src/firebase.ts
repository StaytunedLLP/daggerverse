import { dag, Container, Secret } from "@dagger.io/dagger";

export function firebaseBase(): Container {
  return dag
    .container()
    .from("node:22")
    .withExec(["npm", "install", "-g", "firebase-tools"]);
}
