/**
 * A module for building and deploying projects to Firebase.
 *
 * This module provides a reusable pipeline to automate the deployment process of Firebase applications.
 * It handles dependency installation, building (with VITE environment injection), and deployment
 * using Google Cloud Workload Identity Federation for secure authentication.
 *
 * For more information about prerequisites and setup, please refer to:
 * https://github.com/StaytunedLLP/daggerverse/blob/main/firebase/README.md
 */
import { dag, Directory, object, func, File, Secret } from "@dagger.io/dagger";
import { installDeps } from "./install.js";
import { build } from "./build.js";
import { deploy } from "./deploy.js";

@object()
export class Firebase {
  /**
   * Main reusable pipeline to build and deploy Firebase applications.
   *
   * @param {Directory} source - The source directory containing the project files.
   * @param {string} projectId - The Google Cloud Project ID for Firebase deployment.
   * @param {Secret} gcpCredentials - The JSON credentials secret for authentication (Service Account Key).
   * @param {string} [appId] - The Firebase App ID (optional, used for VITE environment injection).
   * @param {string} [only] - Firebase deploy filter (e.g., 'hosting', 'functions').
   * @param {string} [frontendDir] - Path to the frontend directory relative to the source.
   * @param {string} [backendDir] - Path to the backend directory relative to the source.
   * @param {string} [firebaseDir] - Directory containing firebase.json relative to the source.
   * @returns {Promise<string>} A promise that resolves to the standard output of the deployment command.
   */
  @func()
  async firebaseDeploy(
    source: Directory,
    projectId: string,
    gcpCredentials: Secret,
    appId?: string,
    only?: string,
    frontendDir?: string,
    backendDir?: string,
    firebaseDir?: string
  ): Promise<string> {
    // 1. Install dependencies
    const installedSrc = await installDeps(source, frontendDir, backendDir);
    
    // 2. Inject VITE parameters into Web App's .env file 
    // This matches the github actions extract step
    let configuredSrc = installedSrc;
    if (frontendDir) {
      let envContent = `VITE_FIREBASE_PROJECT_ID=${projectId}\n`;
      if (appId) {
         envContent += `VITE_FIREBASE_APP_ID=${appId}\n`;
      }
      configuredSrc = configuredSrc.withNewFile(`${frontendDir}/.env`, envContent);
    }

    // 3. Build web app and functions
    const builtSrc = await build(configuredSrc, frontendDir, backendDir);
    
    // 4. Deploy to Firebase using Workload Identity Credentials
    const deployC = await deploy(builtSrc, projectId, gcpCredentials, only, firebaseDir);
    
    return deployC.stdout();
  }

  /**
   * Orchestrates deployment by automatically selecting the target project ID
   * based on Git event and reference metadata.
   *
   * @param {Directory} source - The source directory containing the project files.
   * @param {Secret} gcpCredentials - The JSON credentials secret for authentication.
   * @param {string} projectIdDev - The Firebase Project ID for Development/PRs.
   * @param {string} projectIdStg - The Firebase Project ID for Staging/Main branch.
   * @param {string} projectIdProd - The Firebase Project ID for Production/Tags.
   * @param {string} event - The GitHub event name (e.g., 'pull_request', 'push').
   * @param {string} ref - The Git reference (e.g., 'refs/heads/main', 'refs/tags/v1.0.0').
   * @param {string} [appId] - Optional Firebase App ID.
   * @param {string} [only] - Optional deployment filter.
   * @param {string} [frontendDir] - Path to the frontend directory.
   * @param {string} [backendDir] - Path to the backend directory.
   * @param {string} [firebaseDir] - Directory containing firebase.json.
   * @returns {Promise<string>} Output of the deployment.
   */
  @func()
  async deployToEnv(
    source: Directory,
    gcpCredentials: Secret,
    projectIdDev: string,
    projectIdStg: string,
    projectIdProd: string,
    event: string,
    ref: string,
    appId?: string,
    only?: string,
    frontendDir?: string,
    backendDir?: string,
    firebaseDir?: string
  ): Promise<string> {
    let targetProjectId = projectIdDev;
    let targetOnly = only;

    if (event === "push") {
      if (ref.startsWith("refs/tags/v")) {
        targetProjectId = projectIdProd;
      } else {
        targetProjectId = projectIdStg;
      }
      // Default to hosting only for automated push deployments if not specified
      if (!targetOnly) {
        targetOnly = "hosting";
      }
    } else if (event === "pull_request") {
      targetProjectId = projectIdDev;
      if (!targetOnly) {
        targetOnly = "hosting";
      }
    }

    return this.firebaseDeploy(
      source,
      targetProjectId,
      gcpCredentials,
      appId,
      targetOnly,
      frontendDir,
      backendDir,
      firebaseDir
    );
  }
}
