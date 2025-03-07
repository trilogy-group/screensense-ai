// pkce-shim.js
// This is a compatibility shim that makes pkce-challenge work in CommonJS
// Instead of using the original ES module, we're implementing the functionality directly

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Path to our shim directory
const shimDir = path.join(__dirname, '..', 'build', 'node_modules', 'pkce-challenge');

// Create a CommonJS-compatible version of pkce-challenge
function createPkceShim() {
  console.log('Creating pkce-challenge compatibility shim...');

  // Create the shim directory
  if (!fs.existsSync(shimDir)) {
    fs.mkdirSync(shimDir, { recursive: true });
  }

  // Create a simple package.json
  const packageJson = {
    name: 'pkce-challenge-shim',
    version: '1.0.0',
    description: 'CommonJS shim for pkce-challenge',
    main: 'index.js',
    type: 'commonjs',
  };

  // Write the package.json
  fs.writeFileSync(path.join(shimDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  // Create a cryptographically secure implementation
  const indexJs = `// CommonJS implementation of pkce-challenge
const crypto = require('crypto');

/**
 * Generates a cryptographically secure random string
 * @param {number} length The length of the string to generate
 * @returns {string} The generated string
 */
function generateVerifier(length = 43) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomBytes = crypto.randomBytes(length);
  let text = '';
  
  for (let i = 0; i < length; i++) {
    text += possible.charAt(randomBytes[i] % possible.length);
  }
  
  return text;
}

/**
 * Creates a code challenge from a verifier
 * @param {string} verifier The code verifier
 * @returns {string} The code challenge
 */
function generateChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64URLEncode(hash);
}

/**
 * Base64URL encoding
 * @param {Buffer} buffer The buffer to encode
 * @returns {string} The encoded string
 */
function base64URLEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\\+/g, '-')
    .replace(/\\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a PKCE challenge pair
 * @param {number} length The length of the code verifier
 * @returns {Object} The code_verifier and code_challenge
 */
function generate(length = 43) {
  const code_verifier = generateVerifier(length);
  const code_challenge = generateChallenge(code_verifier);
  return { code_verifier, code_challenge };
}

// For compatibility with different ways of importing
module.exports = generate;
module.exports.default = generate;
module.exports.generate = generate;
module.exports.generateVerifier = generateVerifier;
module.exports.generateChallenge = generateChallenge;
`;

  // Write the index.js file
  fs.writeFileSync(path.join(shimDir, 'index.js'), indexJs);

  console.log('Successfully created pkce-challenge compatibility shim');
}

// Create the shim
createPkceShim();

// Export for potential reuse
module.exports = { createPkceShim };
