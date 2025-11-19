// scripts/build-userscript.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         QPM - General Release
// @namespace    Quinoa
// @version      5.0.0
// @description  Information and analytics tools for Magic Garden. Features crop locking, mutation tracking, manual timers, and ability analytics.
// @match        https://1227719606223765687.discordsays.com/*
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @run-at       document-start
// @inject-into  page
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// ==/UserScript==

(function() {
'use strict';

`;

const USERSCRIPT_FOOTER = `
})();`;

async function buildUserscript() {
  console.log('🔨 Building userscript...');
  
  try {
    // Run Vite build
    console.log('📦 Running Vite build...');
    execSync('npx vite build', { stdio: 'inherit' });
    
    // Read the built file
    const builtFile = path.join(__dirname, '..', 'dist', 'quinoa-pet-manager.iife.js');
    
    if (!fs.existsSync(builtFile)) {
      throw new Error(`Built file not found: ${builtFile}`);
    }
    
    const builtCode = fs.readFileSync(builtFile, 'utf8');
    
    // Clean up the code (remove any UMD wrapper if present)
    let cleanedCode = builtCode;
    
    // Remove any source map references
    cleanedCode = cleanedCode.replace(/\/\/# sourceMappingURL=.*$/gm, '');
    
    // Create the final userscript
    const userscript = USERSCRIPT_HEADER + cleanedCode + USERSCRIPT_FOOTER;
    
    // Write the userscript
    const outputPath = path.join(__dirname, '..', 'dist', 'QPM.user.js');
    fs.writeFileSync(outputPath, userscript, 'utf8');

    console.log('✅ Userscript built successfully!');
    console.log(`📄 Output: ${outputPath}`);
    console.log(`📊 Size: ${Math.round(userscript.length / 1024)}KB`);
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

buildUserscript();