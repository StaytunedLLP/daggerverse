import { Container, dag } from "@dagger.io/dagger";
import {
  DEFAULT_IMAGE,
  DEFAULT_NODE_MAX_OLD_SPACE_MB,
  DEFAULT_NPM_CACHE,
  DEFAULT_NPM_CACHE_PATH,
  DEFAULT_PLAYWRIGHT_CACHE,
  DEFAULT_PLAYWRIGHT_CACHE_PATH,
  DEFAULT_WORKSPACE,
} from "./constants.js";
import type { BaseContainerOptions, CacheOptions } from "./types.js";

export function createBaseNodeContainer(
  options: BaseContainerOptions = {},
): Container {
  const workspace = options.workspace ?? DEFAULT_WORKSPACE;

  const maxOldSpaceMb =
    options.nodeMaxOldSpaceMb ?? DEFAULT_NODE_MAX_OLD_SPACE_MB;

  return dag
    .container()
    .from(options.image ?? DEFAULT_IMAGE)
    .withWorkdir(workspace)
    .withEnvVariable("HUSKY", "0")
    .withEnvVariable("NODE_OPTIONS", `--max-old-space-size=${maxOldSpaceMb}`);
}

export function withMountedCache(
  container: Container,
  path: string,
  cacheVolume: string,
): Container {
  return container.withMountedCache(path, dag.cacheVolume(cacheVolume));
}

export function withNpmCache(
  container: Container,
  options: CacheOptions = {},
): Container {
  return withMountedCache(
    container,
    DEFAULT_NPM_CACHE_PATH,
    options.cacheVolume ?? DEFAULT_NPM_CACHE,
  );
}

export function withPlaywrightCache(
  container: Container,
  options: CacheOptions = {},
): Container {
  return withMountedCache(
    container,
    DEFAULT_PLAYWRIGHT_CACHE_PATH,
    options.cacheVolume ?? DEFAULT_PLAYWRIGHT_CACHE,
  ).withEnvVariable("PLAYWRIGHT_BROWSERS_PATH", DEFAULT_PLAYWRIGHT_CACHE_PATH);
}
