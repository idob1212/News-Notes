#!/usr/bin/env node

/**
 * Environment switcher for TruthPilot Extension
 * Usage: node switch-env.js [dev|prod]
 */

const fs = require('fs');
const path = require('path');

const backgroundPath = path.join(__dirname, 'background.js');
const sidebarPath = path.join(__dirname, 'sidebar.js');
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node switch-env.js [dev|prod]');
  console.log('  dev  - Switch to development mode (localhost)');
  console.log('  prod - Switch to production mode (onrender)');
  process.exit(1);
}

const env = args[0].toLowerCase();
let targetEnv;

switch (env) {
  case 'dev':
  case 'development':
    targetEnv = 'development';
    break;
  case 'prod':
  case 'production':
    targetEnv = 'production';
    break;
  default:
    console.error(`Unknown environment: ${env}`);
    console.log('Valid options: dev, development, prod, production');
    process.exit(1);
}

// Function to update environment in a file
function updateEnvironmentInFile(filePath, fileName) {
  try {
    // Read current file
    let fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Replace the ENVIRONMENT line
    const envRegex = /ENVIRONMENT:\s*['"`](\w+)['"`]/;
    const newEnvLine = `ENVIRONMENT: '${targetEnv}'`;
    
    if (envRegex.test(fileContent)) {
      fileContent = fileContent.replace(envRegex, newEnvLine);
      
      // Write back to file
      fs.writeFileSync(filePath, fileContent, 'utf8');
      console.log(`✅ Updated ${fileName}`);
      return true;
    } else {
      console.error(`Could not find ENVIRONMENT setting in ${fileName}`);
      return false;
    }
  } catch (error) {
    console.error(`Error updating ${fileName}:`, error.message);
    return false;
  }
}

try {
  let success = true;
  
  // Update background.js
  success = updateEnvironmentInFile(backgroundPath, 'background.js') && success;
  
  // Update sidebar.js
  success = updateEnvironmentInFile(sidebarPath, 'sidebar.js') && success;
  
  if (success) {
    console.log(`✅ Successfully switched to ${targetEnv} mode`);
    
    if (targetEnv === 'production') {
      console.log('📝 Don\'t forget to update your Render URLs in background.js and sidebar.js if needed!');
    }
  } else {
    console.error('❌ Some files could not be updated');
    process.exit(1);
  }
  
} catch (error) {
  console.error('Error switching environment:', error.message);
  process.exit(1);
} 