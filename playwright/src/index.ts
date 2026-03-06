import { dag, Container, Directory, Secret, object, func } from "@dagger.io/dagger"

@object()
export class Playwright {
    /**
     * Run Playwright E2E tests for the provided project source.
     *
     * @param source Project source directory containing package.json and Playwright tests.
     * @param nodeAuthToken GitHub NPM token for authenticating with @staytunedllp registry.
     * @param testSelector Optional string to pass to test:e2e (selector or path).
     * @returns Standard output from Playwright tests.
     */
    @func()
    async test(
        source: Directory,
        nodeAuthToken: Secret,
        testSelector: string = ""
    ): Promise<string> {
        // -------------------------------------------------------------------------
        // 1. Volumes for Caching
        // -------------------------------------------------------------------------
        // Caching npm packages to save bandwidth and install time.
        const nodeCache = dag.cacheVolume("st-node24-npm")

        // Caching playwright browsers to avoid re-downloading them every time.
        // They are stored in /root/.cache/ms-playwright inside the container.
        const playwrightCache = dag.cacheVolume("st-playwright-browsers")

        // -------------------------------------------------------------------------
        // 2. Base Container Setup
        // -------------------------------------------------------------------------
        const base = dag
            .container()
            .from("node:24")
            .withWorkdir("/src")
            .withMountedCache("/root/.npm", nodeCache)
            .withMountedCache("/root/.cache/ms-playwright", playwrightCache)
            .withSecretVariable("NODE_AUTH_TOKEN", nodeAuthToken)
            .withEnvVariable("HUSKY", "0")

        // -------------------------------------------------------------------------
        // 3. GitHub Packages Authentication & Dependency Installation (Cached)
        // -------------------------------------------------------------------------
        // Only copy lockfiles first to ensure caching works correctly.
        // If package-lock.json hasn't changed, Dagger will reuse the 'npm ci' layer.
        let setup = base.withExec([
            "sh", "-c",
            "echo \"@staytunedllp:registry=https://npm.pkg.github.com\" > .npmrc && " +
            "echo \"//npm.pkg.github.com/:_authToken=\\\${NODE_AUTH_TOKEN}\" >> .npmrc && " +
            "echo \"always-auth=true\" >> .npmrc"
        ])
            .withFile("package.json", source.file("package.json"))

        try {
            setup = setup.withFile("package-lock.json", source.file("package-lock.json"))
        } catch {
            // Fallback if no lockfile
        }

        const installed = setup.withExec(["npm", "ci", "--legacy-peer-deps"])

        // -------------------------------------------------------------------------
        // 4. Copy Rest of Source
        // -------------------------------------------------------------------------
        // Now that dependencies are installed, we copy the actual code.
        const fullSource = installed.withDirectory(".", source, {
            exclude: ["node_modules", "dist", ".git", "dagger"]
        })

        // -------------------------------------------------------------------------
        // 5. Build Project
        // -------------------------------------------------------------------------
        const built = fullSource.withExec(["npm", "run", "build"])

        // -------------------------------------------------------------------------
        // 6. Playwright Browser & OS Dependency Installation
        // -------------------------------------------------------------------------
        // This step installs browsers (cached in playwrightCache) 
        // and system dependencies (cached in the container layers).
        const bws = built.withExec(["sh", "-c", "npx playwright install --with-deps"])

        // -------------------------------------------------------------------------
        // 7. Test Execution
        // -------------------------------------------------------------------------
        let cmd = ["npm", "run", "test:e2e"]
        if (testSelector) {
            cmd.push("--", testSelector)
        }

        const testOutput = await bws.withExec(cmd).stdout()

        return testOutput
    }
}
