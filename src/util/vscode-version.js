const vscode = require('vscode');

// Same threshold as the official extension: the secondarySidebar view container exists from 1.106.
function supportsSecondarySidebar(version = vscode.version) {
  const [major, minor] = version.split('.').map(Number);
  return major > 1 || (major === 1 && minor >= 106);
}

module.exports = { supportsSecondarySidebar };
