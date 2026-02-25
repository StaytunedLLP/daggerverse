import { dag, Directory, object, func, File } from "@dagger.io/dagger";
import { installDeps } from "./install.js";
import { build } from "./build.js";
import { deploy } from "./deploy.js";

@object()
export class Firebase {
  /**
   * Main reusable pipeline to build and deploy Firebase
   */
  @func()
  async firebaseDeploy(
    source: Directory,
    projectId: string,
    gcpCredentials: File,
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
}
