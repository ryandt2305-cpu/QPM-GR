# Troubleshooting Guide

## Issue: Pet Feeder Not Connecting

### Symptoms
- Auto-feed section shows "No pets found" or doesn't update hunger levels
- Pet feed statistics don't increase

### Solutions

1. **Refresh the page** - Press `F5` or `Ctrl+R` to reload
2. **Clear browser cache** - Hold `Ctrl+Shift+R` (hard refresh)
3. **Reinstall the script**:
   - Open Tampermonkey Dashboard
   - Delete the old "Quinoa Pet Manager" script
   - Copy the NEW `dist/userscript.js` contents
   - Create a new script and paste
   - Save

4. **Check Console for Errors**:
   - Press `F12` to open Developer Tools
   - Go to "Console" tab
   - Look for errors starting with `[QuinoaPetMgr]`
   - If you see "Game UI not detected", the page might not have loaded fully

5. **Verify Pets Are Visible**:
   - Make sure your pet panel is visible on the game screen
   - Pets should show hunger bars
   - Try clicking a pet manually to verify they work

## Issue: Shop Still Closing Too Early

### Symptoms
- Shop closes after clicking one item
- "Buy All" button doesn't get clicked
- Items aren't being purchased

### Solutions

1. **Update to Latest Version** (v3.3.7+)
   - The old version had Escape key issues
   - Make sure you're using the newly built `dist/userscript.js`

2. **Verify Arie's Mod is Installed**:
   - This script requires **Arie's Shop Mod** for the "Buy All" button
   - Look for `.romann-buyall-btn` button when you click an item
   - If not found, the script will skip that item

3. **Check Console Logs**:
   - Press `F12` → Console tab
   - Watch for messages like:
     - `🖱️ Clicking item card...`
     - `🔍 Looking for .romann-buyall-btn button...`
     - `🛒 Clicking Buy All button...`
     - `🔒 Closing shop modal...` (should only appear AFTER all items)

4. **Hard Refresh**:
   - Hold `Ctrl+Shift+R` to clear cache
   - Or clear Tampermonkey cache:
     - Tampermonkey Dashboard → Settings
     - Scroll to "Cache" section
     - Click "Clear cache"

## Issue: Script Not Loading At All

### Symptoms
- No UI panel appears in bottom-right corner
- Nothing happens on the game page

### Solutions

1. **Check Tampermonkey is Enabled**:
   - Click Tampermonkey icon in browser toolbar
   - Make sure it shows "Enabled" (not grayed out)
   - Check the script toggle is ON

2. **Verify URL Match**:
   - Script works on:
     - `https://1227719606223765687.discordsays.com/*`
     - `https://magiccircle.gg/r/*`
     - `https://magicgarden.gg/r/*`
     - `https://starweaver.org/r/*`
   - Make sure you're on one of these domains

3. **Check for Script Errors**:
   - Tampermonkey Dashboard
   - Find "Quinoa Pet Manager"
   - Click on it
   - Look for syntax errors (red underlines)

4. **Reinstall from Scratch**:
   - Delete the script completely
   - Copy FRESH contents from `dist/userscript.js`
   - Create new script
   - Paste and save

## Current Build Info

- **Version**: 3.3.7
- **Build Size**: ~43KB
- **Last Updated**: Check `dist/userscript.js` modification date

## Expected Behavior

### Auto-Feed
- Updates every 3 seconds (default)
- Shows `Pet 1: 45% | Pet 2: 60% | Pet 3: 70%` in status
- Feeds when hunger ≤ threshold (default 40%)

### Auto-Shop
- Opens shop with `Alt+S/E/T/D` keyboard shortcuts
- Clicks each enabled item's card
- Clicks "Buy All" button (requires Arie's mod)
- Item card auto-closes after purchase
- **Shop modal closes ONLY after all items in category are processed**
- Moves to next category after 1.5 second delay

### UI Panel
- Bottom-right corner
- Collapsible sections
- Status indicators update in real-time
- Settings persist across sessions

## Still Having Issues?

1. Check browser console (`F12` → Console)
2. Look for `[QuinoaPetMgr]` log messages
3. Note any error messages
4. Try disabling other userscripts temporarily to check for conflicts
