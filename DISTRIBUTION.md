# Distribution Guide

## 📦 Sending to Mac Users

Your Mac user needs **only the userscript file** - no build tools required!

### Option 1: Send the Built File (Easiest)

1. Build the distributable:
   ```bash
   npm run build:dist
   ```

2. Send them this file:
   ```
   dist/userscript.js
   ```

3. Mac user installation steps:
   - Install [Tampermonkey for Safari/Chrome/Firefox](https://www.tampermonkey.net/)
   - Open Tampermonkey Dashboard
   - Click the "+" icon to create new script
   - Delete the default template
   - Copy/paste the entire contents of `userscript.js`
   - Save (Cmd+S or File → Save)
   - Refresh Magic Garden page

### Option 2: GitHub Release (Recommended for Multiple Users)

1. Build the distributable:
   ```bash
   npm run build:dist
   ```

2. Create a GitHub release:
   - Tag: `v3.3.7` (or your version)
   - Attach: `dist/userscript.js`
   - Mac users can download directly from releases

3. Mac user installation:
   - Download `userscript.js` from releases
   - Follow same Tampermonkey steps as Option 1

### Option 3: Direct Install Link (Advanced)

If you host the userscript on GitHub Pages or a CDN:

1. Upload `userscript.js` to a public URL
2. Mac user clicks the raw URL
3. Tampermonkey automatically prompts to install

Example URL structure:
```
https://raw.githubusercontent.com/yourname/repo/main/dist/userscript.js
```

## 🔧 For Developers (Mac/Windows/Linux)

If your Mac user wants to **modify and build** the code:

```bash
# Clone repository
git clone <your-repo-url>
cd Quinoa-Pet-Manager

# Install dependencies
npm install

# Development mode (auto-rebuild on changes)
npm run dev

# Build for distribution
npm run build:dist
```

The built file will be in `dist/userscript.js`.

## ✅ What's Included

The `userscript.js` file contains:
- Full Tampermonkey headers with @match directives
- All compiled TypeScript code for every feature (auto-feed, weather swap, auto-shop, crop locking, richer notifications)
- Updated notification center UI (filters, collapsible cards, toggleable metadata/raw payload)
- Minified and optimized output (~42KB)

✅ Windows - Builds successfully  
✅ Mac - Compatible (uses LF line endings, Node.js path.join)  
✅ Linux - Compatible (same as Mac)

The userscript itself runs in the browser via Tampermonkey, so it's 100% cross-platform once installed!
