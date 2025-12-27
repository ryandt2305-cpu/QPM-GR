// scripts/build-userscript.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         QPM (ALPHA)
// @namespace    Quinoa
// @version      3.0.57
// @description  Quality-of-life enhancements for Magic Garden: crop type locking, mutation tracking, value calculator, harvest reminders, journal species checker, and persistent feed statistics.
// @author       TOKYO.#6464
// @match        https://1227719606223765687.discordsays.com/*
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @connect      magicgarden.gg
// @connect      magiccircle.gg
// @connect      starweaver.org
// @connect      1227719606223765687.discordsays.com
// @connect      ariesmod-api.ariedam.fr
// @updateURL    https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/master/dist/QPM.user.js
// @downloadURL  https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/master/dist/QPM.user.js
// @run-at       document-start
// @inject-into  page
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      raw.githubusercontent.com
// @grant        GM_openInTab
// @grant        unsafeWindow
// ==/UserScript==

(function() {

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