// stamp-version.js
// Inserts current git short hash into index.html meta and script cache-bust.
// Usage: node scripts/stamp-version.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const indexPath = path.join(repoRoot, 'index.html');

function getGitShortHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();
  } catch (e) {
    return null;
  }
}

function stamp() {
  const hash = getGitShortHash() || 'dev';
  let html = fs.readFileSync(indexPath, 'utf8');

  // Replace meta tag content
  html = html.replace(/<meta name="app-version" content="[^"]*">/, `<meta name="app-version" content="v0.0.0-${hash}">`);

  // Replace script cache-bust query for js/app.js?v=
  html = html.replace(/<script src="js\/app\.js\?v=[^\"]+"><\/script>/, `<script src="js/app.js?v=${hash}"></script>`);

  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('Stamped index.html with hash:', hash);
}

if (require.main === module) stamp();

module.exports = { stamp };
