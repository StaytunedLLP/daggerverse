import { Container } from "@dagger.io/dagger";
import {
  createBaseNodeContainer,
  withFirebaseCli,
  withNpmCache,
} from "../shared/index.js";
import {
  FIREBASE_APPHOSTING_NPM_CACHE,
  FIREBASE_WORKDIR,
} from "./constants.js";

const FIREBASE_NPM_CACHE = "firebase-node24-npm";

export function firebaseNodeBase(): Container {
  return withNpmCache(
    createBaseNodeContainer({
      workspace: FIREBASE_WORKDIR,
    }),
    { cacheVolume: FIREBASE_NPM_CACHE },
  );
}

export function firebaseCliBase(): Container {
  return withFirebaseCli(firebaseNodeBase());
}

export function firebaseAppHostingBase(): Container {
  return withFirebaseCli(
    withNpmCache(
      createBaseNodeContainer({
        workspace: FIREBASE_WORKDIR,
      }),
      { cacheVolume: FIREBASE_APPHOSTING_NPM_CACHE },
    ),
  );
}
