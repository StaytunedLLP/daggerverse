#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper to run shell commands safely
function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return null;
  }
}

// 1. Get current PR or branch details
let prNumber = process.argv[2];
if (!prNumber) {
  prNumber = runCmd('gh pr view --json number -q .number');
}

if (!prNumber) {
  console.error("❌ Error: Could not determine PR number. Please pass a PR number as an argument.");
  process.exit(1);
}

console.log(`🔍 Monitoring GHA Checks for PR #${prNumber}...`);

// 2. Fetch GHA checks using gh CLI
const checksJson = runCmd(`gh pr checks ${prNumber} --json name,state,event,link`);
if (!checksJson) {
  console.error(`❌ Error: Failed to fetch checks for PR #${prNumber}.`);
  process.exit(1);
}

const checks = JSON.parse(checksJson);
const failures = checks.filter(c => c.state === 'FAILING' || c.state === 'FAILURE');
const pending = checks.filter(c => c.state === 'PENDING');

console.log(`✅ Passed/Skipped: ${checks.length - failures.length - pending.length}`);
console.log(`⏳ Pending: ${pending.length}`);
console.log(`❌ Failed: ${failures.length}`);

const report = {
  prNumber: parseInt(prNumber, 10),
  timestamp: new Date().toISOString(),
  status: failures.length > 0 ? 'FAILED' : pending.length > 0 ? 'PENDING' : 'SUCCESS',
  failures: [],
};

if (failures.length > 0) {
  console.log("\n🚨 Analyzing failures...");
  for (const fail of failures) {
    console.log(`- Job: ${fail.name}`);
    console.log(`  Link: ${fail.link}`);
    
    // Extract run ID from check link if possible
    // Example GHA link: https://github.com/StaytunedLLP/staystack/actions/runs/28767270015/job/85293944533
    const runMatch = fail.link.match(/\/runs\/(\d+)/);
    if (runMatch) {
      const runId = runMatch[1];
      console.log(`  Run ID: ${runId}. Fetching failed logs...`);
      const logs = runCmd(`gh run view ${runId} --log-failed`);
      if (logs) {
        report.failures.push({
          jobName: fail.name,
          link: fail.link,
          runId: runId,
          logs: logs
        });
      } else {
        report.failures.push({
          jobName: fail.name,
          link: fail.link,
          runId: runId,
          logs: "Could not fetch failed logs."
        });
      }
    } else {
      report.failures.push({
        jobName: fail.name,
        link: fail.link,
        logs: "No run ID found in link."
      });
    }
  }
}

// Write the report
const reportsDir = path.resolve(process.cwd(), '.artifacts/pr-monitor');
fs.mkdirSync(reportsDir, { recursive: true });
const reportPath = path.join(reportsDir, `pr-${prNumber}-status.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`\n📝 Status report written to ${reportPath}`);

if (failures.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
