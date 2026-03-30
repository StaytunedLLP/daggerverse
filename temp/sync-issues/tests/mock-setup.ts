import { before, after } from "node:test";
import { mkdirSync, symlinkSync, rmSync, chmodSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempBin: string;
const originalPath = process.env.PATH;

export const setupMockEnv = () => {
    before(() => {
        const root = realpathSync(process.cwd());
        tempBin = join(tmpdir(), `test-bin-${Date.now()}`);
        mkdirSync(tempBin, { recursive: true });

        const mockGh = join(root, "tests/mock-gh.sh");
        const mockGcloud = join(root, "tests/mock-gcloud.sh");

        // Ensure mocks are executable
        try { chmodSync(mockGh, 0o755); } catch { }
        try { chmodSync(mockGcloud, 0o755); } catch { }

        symlinkSync(mockGh, join(tempBin, "gh"));
        symlinkSync(mockGcloud, join(tempBin, "gcloud"));

        process.env.PATH = `${tempBin}:${originalPath}`;
    });

    after(() => {
        process.env.PATH = originalPath;
        try { rmSync(tempBin, { recursive: true, force: true }); } catch { }
    });
};
