const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create scripts directory if it doesn't exist
const scriptsDir = path.join(__dirname, '..');
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

// Ensure the build/node_modules directory exists
const buildNodeModulesDir = path.join(__dirname, '..', 'build', 'node_modules');
if (!fs.existsSync(buildNodeModulesDir)) {
  fs.mkdirSync(buildNodeModulesDir, { recursive: true });
}

// List of packages with native dependencies that need to be copied
const nativePackages = ['@nut-tree-fork', '@nut-tree', 'node-global-key-listener', 'uiohook-napi'];

// Copy packages to the build/node_modules directory
for (const pkg of nativePackages) {
  const sourcePath = path.join(__dirname, '..', 'node_modules', pkg);
  const destPath = path.join(buildNodeModulesDir, pkg);

  if (fs.existsSync(sourcePath)) {
    console.log(`Copying ${pkg} to build/node_modules...`);

    // Remove destination if it exists
    if (fs.existsSync(destPath)) {
      if (process.platform === 'win32') {
        execSync(`rmdir /s /q "${destPath}"`, { stdio: 'inherit' });
      } else {
        execSync(`rm -rf "${destPath}"`, { stdio: 'inherit' });
      }
    }

    // Create destination directory
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    // Copy files
    if (process.platform === 'win32') {
      execSync(`xcopy "${sourcePath}" "${destPath}" /E /I /H`, { stdio: 'inherit' });
    } else {
      execSync(`cp -R "${sourcePath}" "${path.dirname(destPath)}"`, { stdio: 'inherit' });
    }

    console.log(`Successfully copied ${pkg}`);
  } else {
    console.log(`Warning: ${pkg} not found in node_modules, skipping.`);
  }
}

// Copy ModelContext SDK package
const modelContextSDKSource = path.join(__dirname, '..', 'node_modules', '@modelcontextprotocol');
const modelContextSDKDest = path.join(buildNodeModulesDir, '@modelcontextprotocol');

if (fs.existsSync(modelContextSDKSource)) {
  console.log('Copying @modelcontextprotocol SDK to build/node_modules...');

  // Remove destination if it exists
  if (fs.existsSync(modelContextSDKDest)) {
    if (process.platform === 'win32') {
      execSync(`rmdir /s /q "${modelContextSDKDest}"`, { stdio: 'inherit' });
    } else {
      execSync(`rm -rf "${modelContextSDKDest}"`, { stdio: 'inherit' });
    }
  }

  // Create destination directory
  fs.mkdirSync(modelContextSDKDest, { recursive: true });

  // Copy files
  if (process.platform === 'win32') {
    execSync(`xcopy "${modelContextSDKSource}" "${modelContextSDKDest}" /E /I /H`, {
      stdio: 'inherit',
    });
  } else {
    execSync(`cp -R "${modelContextSDKSource}" "${path.dirname(modelContextSDKDest)}"`, {
      stdio: 'inherit',
    });
  }

  console.log('Successfully copied @modelcontextprotocol SDK');

  // Create and run the pkce-challenge shim
  console.log('Creating pkce-challenge compatibility shim...');
  execSync(`node "${path.join(__dirname, 'pkce-shim.js')}"`, { stdio: 'inherit' });

  // Patch the ModelContext SDK auth.js file to use our shim
  const authJsPath = path.join(
    buildNodeModulesDir,
    '@modelcontextprotocol',
    'sdk',
    'dist',
    'cjs',
    'client',
    'auth.js'
  );

  if (fs.existsSync(authJsPath)) {
    console.log('Patching ModelContext SDK auth.js to use pkce-challenge compatibility shim...');

    let authJsContent = fs.readFileSync(authJsPath, 'utf8');

    // Replace any require of pkce-challenge with our shim
    authJsContent = authJsContent.replace(
      /require\(['"]pkce-challenge['"]\)/g,
      'require("../../../../../pkce-challenge")'
    );

    fs.writeFileSync(authJsPath, authJsContent);
    console.log('Successfully patched ModelContext SDK auth.js');
  } else {
    console.log('Warning: ModelContext SDK auth.js not found, skipping patch');
  }
} else {
  console.log('Warning: @modelcontextprotocol SDK not found in node_modules, skipping.');
}

console.log('Native dependency copying completed!');
