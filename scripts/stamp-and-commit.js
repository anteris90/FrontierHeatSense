// stamp-and-commit.js
// Stamps index.html with current git short hash and commits the change
// Usage: node scripts/stamp-and-commit.js [--push]

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
const stampScript = path.join(repoRoot, 'scripts', 'stamp-version.js');

function git(cmd) {
  return execSync(cmd, { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
}

function main() {
  const args = process.argv.slice(2);
  const doPush = args.includes('--push');

  let hash;
  try {
    hash = git('git rev-parse --short HEAD');
  } catch (e) {
    console.error('Failed to get git hash:', e.message);
    process.exit(1);
  }

  // Run stamp script
  try {
    require(stampScript).stamp();
  } catch (e) {
    // fallback to executing the script if require fails
    try {
      execSync(`node "${stampScript}"`, { cwd: repoRoot, stdio: 'inherit' });
    } catch (e2) {
      console.error('Failed to run stamp-version.js:', e2.message);
      process.exit(1);
    }
  }

  // Stage index.html
  try {
    execSync('git add index.html', { cwd: repoRoot, stdio: 'inherit' });
  } catch (e) {
    console.error('git add failed:', e.message);
    process.exit(1);
  }

  // Commit with message containing the original hash
  const commitMsg = `chore: stamp version ${hash}`;
  try {
    // If there are no changes, git commit will fail; handle that gracefully
    const status = git('git status --porcelain');
    if (!status) {
      console.log('No changes to commit. index.html already stamped.');
    } else {
      execSync(`git commit -m "${commitMsg}"`, { cwd: repoRoot, stdio: 'inherit' });
      console.log('Committed:', commitMsg);
      if (doPush) {
        try {
          execSync('git push', { cwd: repoRoot, stdio: 'inherit' });
          console.log('Pushed to remote.');
        } catch (e) {
          console.error('Push failed:', e.message);
        }
      }
    }
  } catch (e) {
    console.error('git commit failed:', e.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { main };
