# Crop Size Indicator Debugging Instructions

## What to Check:

### 1. Open Browser Console (F12)
Look for these log messages when you hover over a crop:

```
📐 Crop Size Indicator: Starting
📐 Crop Size Indicator: Watching for crop tooltips
📐 Processing tooltip element: [class names]
📐 Element HTML preview: [HTML content]
```

### 2. If You See "Config disabled":
- The feature is off in settings
- Should be enabled by default

### 3. If You Don't See ANY "📐" Messages:
- Feature isn't starting at all
- Check if `initCropSizeIndicator()` is being called

### 4. If You See "No crop name element found":
- The HTML structure changed
- Game CSS class names changed
- Provide the full HTML of the tooltip (right-click → Inspect Element)

### 5. Expected Behavior:
When you hover over a crop in your garden, you should see:
- Aries' price line (if Aries mod is installed): `💰 Price: XXXXX`
- Our size line right below it: `📏 Size: XX% (X.XXx)`

### 6. What to Report:
Please provide:
1. Screenshot of browser console with all "📐" messages
2. Right-click the crop tooltip → Inspect Element → Copy the full HTML
3. Does Aries' price show up? (This confirms tooltips are working)

## Quick Test:
1. Reload the page with Tampermonkey script active
2. Open console (F12)
3. Hover over ANY crop in your garden
4. Look for "📐" messages in console
5. Look at the tooltip for the `📏 Size:` line
