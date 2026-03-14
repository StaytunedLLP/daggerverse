import { Container } from "@dagger.io/dagger";
import {
  withFirebaseCli,
  withFirebaseSystemPackages,
} from "../shared/install.js";

export function withFirebaseTooling(container: Container): Container {
  return withFirebaseCli(withFirebaseSystemPackages(container));
}
