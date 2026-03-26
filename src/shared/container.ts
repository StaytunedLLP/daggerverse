import { Container, dag } from "@dagger.io/dagger";
import {
  DEFAULT_IMAGE,
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

  let container = dag
    .container()
    .from(options.image ?? DEFAULT_IMAGE)
    .withWorkdir(workspace)
    .withEnvVariable("HUSKY", "0");

  container = withNpmCache(container);

  return container;
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
