const crypto = require('crypto');

function nonce() {
  return crypto.randomBytes(16).toString('base64');
}

module.exports = { nonce };
