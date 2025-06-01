#!/usr/bin/env node

// Script to switch between development and production environments
// Usage: node switch-env.js dev|prod

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.js');
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node switch-env.js [dev|prod]');
  console.log('Current environment check:');
  
  // Read current config
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const match = configContent.match(/ENVIRONMENT:\s*['"]([^'"]+)['"]/);
    if (match) {
      console.log(`Current environment: ${match[1]}`);
    }
  } catch (error) {
    console.error('Error reading config file:', error.message);
  }
  process.exit(1);
}

const environment = args[0].toLowerCase();

if (!['dev', 'development', 'prod', 'production'].includes(environment)) {
  console.error('Invalid environment. Use "dev" or "prod"');
  process.exit(1);
}

// Normalize environment names
const envName = (environment === 'dev') ? 'development' : 
                (environment === 'prod') ? 'production' : environment;

try {
  // Read the current config file
  let configContent = fs.readFileSync(configPath, 'utf8');
  
  // Replace the ENVIRONMENT value
  configContent = configContent.replace(
    /ENVIRONMENT:\s*['"][^'"]+['"]/,
    `ENVIRONMENT: '${envName}'`
  );
  
  // Write back to file
  fs.writeFileSync(configPath, configContent, 'utf8');
  
  console.log(`✅ Environment switched to: ${envName}`);
  
  if (envName === 'production') {
    console.log('⚠️  Remember to update your Render URL in config.js if you haven\'t already!');
  }
  
} catch (error) {
  console.error('Error updating config file:', error.message);
  process.exit(1);
} 