/**
 * A generated module for Modules functions
 *
 * This module has been generated via dagger init and serves as a reference to
 * basic module structure as you get started with Dagger.
 *
 * Two functions have been pre-created. You can modify, delete, or add to them,
 * as needed. They demonstrate usage of arguments and return types using simple
 * echo and grep commands. The functions can be called from the dagger CLI or
 * from one of the SDKs.
 *
 * The first line in this comment block is a short description line and the
 * rest is a long description with more detail on the module's purpose or usage,
 * if appropriate. All modules should have a short description.
 */
import {
    argument,
    dag,
    type Directory,
    func,
    object,
    type Secret,
} from "@dagger.io/dagger";

@object()
export class Modules {
    /**
     * Deploys a project using the deployctl tool in a Deno container.
     *
     * @param {Directory} source - The source directory containing the project files to be deployed.
     * @param {Secret} token - The secret token used for authentication with the deployment service.
     * @param {string} project - The name of the project to be deployed.
     * @param {string} org - The organization under which the project is to be deployed.
     * @param {string} entrypoint - The entry point file for the deployment.
     * @param {boolean} prod - A flag indicating whether to deploy in production mode (true) or preview mode (false).
     * @returns {Promise<string>} A promise that resolves to the standard output of the deployment command.
     */
    @func()
    async runDeployctl(
        source: Directory,
        token: Secret,
        project: string,
        org: string,
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
                "--org",
                org,
                "--entrypoint",
                entrypoint,
            ]);

        // log the output and errors
        // console.log("Out", await pipelineContainer.stdout());
        // console.log("Err", await pipelineContainer.stderr());

        await pipelineContainer.stdout();
        return Promise.resolve("Deployment Successful");
    }

    /**
     * Deploys a project using the deployctl tool in a Deno container.
     *
     * @param {Directory} source - The source directory containing the project files to be deployed.
     * @param {Secret} token - The secret token used for authentication with the deployment service.
     * @param {string} project - The name of the project to be deployed.
     * @param {string} org - The organization under which the project is to be deployed.
     * @param {string} entrypoint - The entry point file for the deployment.
     * @param {boolean} prod - A flag indicating whether to deploy in production mode (true) or preview mode (false).
     * @returns {Promise<string>} A promise that resolves to the standard output of the deployment command.
     */
    @func()
    async deployArmoryDocs(
        @argument({ defaultPath: "/" }) source: Directory,
        token: Secret,
        project: string,
        org: string,
        entrypoint: string,
        prod: boolean,
    ): Promise<string> {
        const pipelineContainer = dag
            .container()
            // start from a base Node.js container
            .from("denoland/deno:ubuntu")
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
            // .withExec([
            //     "deno",
            //     "install",
            //     "--allow-script=npm:sharp@0.33.5",
            // ])
            .withExec([
                "deno",
                "task",
                "lume-build",
            ])
            .withExec([
                "deployctl",
                "deploy",
                prod ? "--prod" : "--preview",
                "--project",
                project,
                "--org",
                org,
                "--entrypoint",
                entrypoint,
                "--include=src/armory-docs.staytuned.company/,lume/,deno.json",
            ]);

        // log the output and errors
        // console.log("Out", await pipelineContainer.stdout());
        // console.log("Err", await pipelineContainer.stderr());

        await pipelineContainer.stdout();
        return Promise.resolve("Deployment Successful");
    }
}
