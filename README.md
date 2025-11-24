# Quinoa Pet Manager

A comprehensive TypeScript userscript that provides:

## ✨ Features

### 🍖 Auto-Feed System
- Automatically feeds pets when hunger drops below configurable threshold
- Persistent feed statistics with session tracking
- Manual feed triggers and cooldown management
- Pet name detection and logging
- Session summary now shows estimated feeds/hour (labelled `est.` when model-driven)

### 🌤️ Weather Pet Swapper  
- Detects weather changes via canvas analysis
- Automatically switches pet teams based on weather conditions
- Configurable keybinds for sunny/weather team swaps
- Debug tools to test keybind functionality

### 🛒 Auto Shop (Manual Mode)
- Watches for shop restock and auto-feed notifications
- Automatically scans and catalogs available items
- Configurable per-item auto-purchasing
- Manual shop opening triggers automatic buying

### 🔒 **NEW: Crop Type Locking**
- Click crop sprites in inventory to favorite/unfavorite ALL items of that type
- Visual lock buttons on inventory items
- Persistent lock states across sessions
- Prevents accidental selling or feeding of locked crop types

## 🚀 Installation


## 🛠️ Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
npm install
```

### Development Build
```bash
npm run dev
```

### Production Build  
```bash
npm run build
npm run build:userscript
```

This creates:
- `dist/quinoa-pet-manager.iife.js` - Bundled library
- `dist/userscript.js` - Complete userscript with headers

### Cross-Platform Compatibility

This project is fully compatible with **Windows, Mac, and Linux**:

- ✅ **Line Endings**: Automatically normalized via `.gitattributes` (LF)
- ✅ **Build Scripts**: Uses Node.js `path.join()` for cross-platform paths
- ✅ **npm Scripts**: Work identically on all platforms
- ✅ **Editor Config**: `.editorconfig` ensures consistent formatting across IDEs

**Mac/Linux Users**: All npm scripts work without modification. Simply clone and run `npm install` to get started.

### Project Structure
```
src/
├── features/           # Individual feature modules
│   ├── autoFeed.ts    # Pet feeding automation
│   ├── weatherSwap.ts # Weather-based team swapping  
│   ├── autoShop.ts    # Shop automation
│   └── cropTypeLocking.ts # NEW: Crop type locking
├── ui/                # User interface components
│   ├── mainPanel.ts   # Main control panel
│   └── keybindCapture.ts # Keybind configuration
├── utils/             # Utility functions
│   ├── dom.ts        # DOM manipulation helpers
│   ├── storage.ts    # Storage abstraction
│   ├── logger.ts     # Logging utilities
│   └── helpers.ts    # General helpers
└── main.ts           # Entry point
```

## 🎮 Usage

The script adds a control panel in the bottom-right corner with sections for:

### Auto-Feed Controls
- Enable/disable automatic feeding
- Set hunger threshold (0-100%)
- View live pet hunger levels
- Manual feed trigger
- Session statistics
- Notifications for completed feeds and retry warnings

### Weather Swapper
- Configure keybinds for sunny/weather teams
- Test keybinds manually  
- View current weather detection
- Enable/disable weather swapping

### Auto Shop
- Enable/disable auto-purchasing
- Scan shops to configure items
- View restock notifications
- Track purchase statistics

### Crop Type Locking ⭐
- Open inventory (E key)
- Click the lock button (🔒/🔓) on any crop item
- All items of that crop type will be favorited/unfavorited
- Locked crops are protected from selling/feeding

## 🔧 Configuration

All settings are automatically saved to Tampermonkey storage and persist across browser sessions.

### Feed Thresholds
Default: 40% - pets will be fed when hunger drops to or below this level

### Weather Keybinds  
Set custom key combinations for weather-based team swaps

### Shop Auto-Buy
Configure which items to automatically purchase when shops restock

## 📊 Statistics

The script tracks:
- Session uptime
- Total feeds performed
- Feeds per pet with timestamps
- Estimated feeds/hour plus sample sources (events vs est.)
- Weather detection count
- Shop purchases made
- Crop locks applied

## 🐛 Troubleshooting

### Script Not Working
1. Ensure Tampermonkey is enabled
2. Check browser console for errors
3. Verify the script matches the correct game URLs
4. Try refreshing the page

### UI Not Appearing
- The panel appears after the game loads
- Check if other scripts are conflicting
- Ensure the game UI (.QuinoaUI) is detected

### Features Not Responding
- Check the status indicators in each section
- Some features require game elements to be visible
- Weather detection needs the weather icon to be rendered

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and test thoroughly
4. Submit a pull request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🎯 Compatibility

- **Platforms**: Windows, Mac, Linux (fully cross-platform)
- **Game**: Magic Garden (magiccircle.gg, magicgarden.gg, starweaver.org)  
- **Browser**: Chrome, Firefox, Edge, Safari (with Tampermonkey)
- **Userscript Manager**: Tampermonkey (recommended), Greasemonkey

## 🔄 Version History

### v4.0.0 (Latest)
- ✨ **NEW**: Crop Type Locking feature
- 🏗️ Complete TypeScript rewrite
- 🎨 Improved UI with collapsible sections
- 🐛 Enhanced error handling and stability
- 📊 Better statistics tracking

### v3.3.7 (Previous)
- Auto-feed pets with configurable thresholds
- Weather-based pet team swapping
- Auto-shop purchasing with manual mode
- Feed statistics and session tracking
