import { setIssueFieldValue, getRepoInfo } from "./lib/github.js";
import { isSuccess, isFailure } from "./lib/fp.js";
import { execSync } from "node:child_process";

async function verify() {
    const issueNumber = 290;
    const repoInfoRes = getRepoInfo();

    if (isFailure(repoInfoRes)) {
        console.error("Could not find repo info");
        return;
    }
    const repoInfo = repoInfoRes.value;

    console.log(`Setting Flag Stage to 'backlog ✳️' for issue #${issueNumber}...`);
    const result = setIssueFieldValue(
        repoInfo.owner,
        repoInfo.repo,
        issueNumber,
        "Flag Stage",
        "backlog ✳️"
    );

    if (isSuccess(result)) {
        console.log("✅ Successfully updated issue field!");
        // Verify by reading the values back
        const apiResult = execSync(`gh api /repos/${repoInfo.owner}/${repoInfo.repo}/issues/${issueNumber}/issue-field-values`, { encoding: 'utf8' });
        console.log("Current field values:");
        console.log(apiResult);
    } else {
        console.log("❌ Failed to update issue field.");
        console.error(result.error);
    }
}

verify().catch(console.error);
