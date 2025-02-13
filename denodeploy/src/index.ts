/**
 * A module for deploying projects using the deployctl tool in a Deno container.
 *
 * This module provides functionality to deploy projects to Deno Deploy using the deployctl tool.
 * It includes a function to run the deployment process with specified parameters such as source directory,
 * authentication token, project name, organization, entry point file, and deployment mode (production or preview).
 *
 * ## Prerequisites
 *
 * ### CI/CD
 *
 * To use the `DenoDeploy` module in your CI/CD pipeline, you need to store the `DENO_DEPLOY_TOKEN` as a secret in your CI/CD environment.
 * This token is used for authentication with the Deno Deploy service.
 *
 * 1. **Store the Token**: Add the `DENO_DEPLOY_TOKEN` as a secret in your CI/CD environment (e.g., GitHub Actions, GitLab CI, etc.).
 * 2. **Pass the Token**: Pass the token in the `token` field when calling the `runDeployctl` function.
 *
 * Example for GitHub Actions:
 *
 * ```yaml
 * jobs:
 *   deploy:
 *     runs-on: ubuntu-latest
 *     steps:
 *       - name: Checkout code
 *         uses: actions/checkout@v2
 *       - name: Deploy to Deno
 *         env:
 *           DENO_DEPLOY_TOKEN: ${{ secrets.DENO_DEPLOY_TOKEN }}
 * ```
 *
 * ### Local Development
 *
 * For local development, you need to set the `DENO_DEPLOY_TOKEN` in your terminal and pass it as an environment variable when running the deployment command.
 *
 * 1. **Set the Token**: Set the `DENO_DEPLOY_TOKEN` in your terminal.
 *
 * ```sh
 * export DENO_DEPLOY_TOKEN=your_token_here
 * ```
 *
 * 2. **Pass the Token**: Pass the token as an environment variable when running the deployment command.
 *
 * ```sh
 * dagger call <YOUR_COMMAND_HERE> --token=env:DENO_DEPLOY_TOKEN
 * ```
 */
import {
    dag,
    type Directory,
    func,
    object,
    type Secret,
} from "@dagger.io/dagger";

@object()
export class DenoDeploy {
    /**
     * Deploys a project using the deployctl tool in a Deno container.
     *
     * @param {Directory} source - The source directory containing the project files to be deployed.
     * @param {Secret} token - The secret token used for authentication with the deployment service.
     * @param {string} project - The name of the project to be deployed.
     * @param {string} [org] - The organization under which the project is to be deployed (optional).
     * @param {string} entrypoint - The entry point file for the deployment.
     * @param {boolean} prod - A flag indicating whether to deploy in production mode (true) or preview mode (false).
     * @returns {Promise<string>} A promise that resolves to the standard output of the deployment command.
     */
    @func()
    async runDeployctl(
        source: Directory,
        token: Secret,
        project: string,
        org: string | undefined,
        entrypoint: string,
        prod: boolean,
    ): Promise<string> {
        const pipelineContainer = dag
            .container()
            // start from a base Node.js container
            .from("denoland/deno:alpine")
            .withSecretVariable("DENO_DEPLOY_TOKEN", token)
            // install deployctl
            .withExec([
                "deno",
                "install",
                "-Arf",
                "--global",
                "jsr:@deno/deployctl",
            ])
            // add the source code at /src
            .withDirectory("/src", source)
            // change the working directory to /src
            .withWorkdir("/src")
            .withExec([
                "deployctl",
                "deploy",
                prod ? "--prod" : "--preview",
                "--project",
                project,
                ...(org ? ["--org", org] : []),
                "--entrypoint",
                entrypoint,
            ]);

        // log the output and errors
        // console.log("Out", await pipelineContainer.stdout());
        // console.log("Err", await pipelineContainer.stderr());

        await pipelineContainer.stdout();
        return Promise.resolve("Deployment Successful");
    }
}
