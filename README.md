# QPM - General Release

**Quinoa Pet Manager: General Release Edition**

A powerful information and analytics tool for Magic Garden that enhances manual gameplay through better game information.

![Version](https://img.shields.io/badge/version-5.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Tampermonkey-orange)

## 🎯 Philosophy

This General Release version focuses on **enhancing manual gameplay** through better information and tools. It helps you:

- **Make informed decisions** with real-time mutation and value data
- **Track progress** with detailed statistics and ability logs
- **Optimize timing** with manual growth timers
- **Protect valuables** with crop locking system
- **Understand mechanics** with ability calculations and analytics

---

## ✨ Features

### 🔒 Crop Type Locking
- Click crop sprites to favorite/unfavorite entire crop types
- Visual lock indicators on inventory items
- Persistent lock states across sessions
- Prevents accidental selling or feeding of locked crops
- **Sync Mode**: Keeps QPM locks synchronized with in-game favorites

### 🧬 Mutation Tracking & Analytics
- Real-time mutation detection in garden and inventory
- Visual highlights for valuable mutations (Rainbow, Gold, Frozen, etc.)
- Configurable mutation notifications
- Mutation summary statistics and breakdowns
- Garden overlay system for easy identification
- Track mutation patterns and frequencies

### 🐢 Turtle Timer (Manual)
- Manual growth timer with pet ability calculations
- ETA countdowns based on active pets
- Support for Plant Grower and Egg Hatcher abilities
- Multiple timer channels (plants, eggs, support)
- Milestone notifications at key percentages
- Manual override system for custom targets
- Pet hunger threshold tracking

### ⚡ Ability Tracking & Analytics
- Real-time pet ability event logs
- Proc rate statistics and analysis
- XP tracking and level estimates
- Ability value calculations
- Effect-per-hour metrics
- Historical ability data
- Per-pet performance tracking

### 💎 Value Calculator
- Live crop value calculations
- Inventory value tracking
- Friend bonus integration
- Mutation multiplier breakdowns

### 📊 Statistics Dashboard
- Session uptime tracking
- Mutation ratio analytics
- Ability trigger metrics
- Garden state analytics

---

## 🚀 Quick Start

### Installation

1. **Install Tampermonkey**
   - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. **Install QPM General Release**
   - Download `dist/QPM.user.js`
   - Drag and drop into your browser
   - Click "Install" in Tampermonkey

3. **Play Magic Garden**
   - The panel will appear automatically
   - All features are ready to use!

---

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
- `dist/QPM.user.js` - Complete userscript (114KB)

---

## 🎮 Usage Guide

### Crop Type Locking
1. Open your inventory (E key)
2. Look for the lock buttons on crop items
3. Click to lock/unlock entire crop type
4. Locked crops show gold highlighting
5. **Tip**: Use Sync Mode to keep locks in sync with favorites

### Mutation Tracker
1. Plant crops in your garden
2. QPM automatically detects mutations
3. Check the mutation overlay for highlights
4. View statistics in the panel
5. **Tip**: Enable notifications for rare mutations

### Turtle Timer
1. Plant crops or place eggs
2. Timer starts automatically
3. View ETA based on your active pets
4. Get notifications at key milestones
5. **Tip**: Set manual overrides for specific targets

### Ability Analytics
1. Have pets active while playing
2. QPM tracks all ability triggers
3. View proc rates and statistics
4. Track XP gain and level progress
5. **Tip**: Open tracker window for detailed analysis

---

## 🔧 Configuration

All settings are automatically saved to localStorage and persist across sessions.

### Available Settings
- **Mutation Tracking**: Enable/disable notifications, select tracked mutations
- **Turtle Timer**: Include/exclude Boardwalk, set hunger thresholds, focus mode
- **Crop Locking**: Toggle sync mode with in-game favorites

---

## 📊 Statistics

QPM tracks:
- Session uptime and initialization time
- Mutation frequencies and ratios
- Ability trigger counts and proc rates
- Pet XP gain and level progress
- Garden state snapshots

---

## 🐛 Troubleshooting

### Script Not Working
1. Ensure Tampermonkey is enabled
2. Check browser console for errors (F12)
3. Verify script is enabled for Magic Garden URLs
4. Try hard refresh (Ctrl+Shift+R)

### UI Not Appearing
- Panel appears after game fully loads
- Check if other scripts are conflicting
- Ensure game UI is detected (QuinoaUI element)
- Look for errors in console

### Features Not Responding
- Check feature enable toggles in panel
- Some features require specific game elements
- Mutation detection needs garden/inventory data
- Timer requires active pets for calculations

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make changes and test thoroughly
4. Commit with clear messages
5. Push to branch
6. Submit a pull request

---

## 📜 License

This project is licensed under the MIT License.

---

## 🎯 Compatibility

- **Platforms**: Windows, Mac, Linux (fully cross-platform)
- **Game**: Magic Garden (magiccircle.gg, magicgarden.gg, starweaver.org)
- **Browser**: Chrome, Firefox, Edge, Safari (with Tampermonkey)
- **Userscript Manager**: Tampermonkey (recommended), Greasemonkey, Violentmonkey

---

## 🔄 Version History

### v5.0.0 - General Release (Current)
- 🚀 **Initial General Release** - Pure information and tracking tools
- ✅ Crop Type Locking with sync mode
- ✅ Advanced Mutation Tracking & Analytics
- ✅ Manual Turtle Timer with pet calculations
- ✅ Comprehensive Ability Analytics
- ✅ Live Value Calculator
- ✅ Statistics Dashboard
- 📦 Optimized build (114KB)

---

## 💡 What Makes This "General Release"?

This version is specifically designed for general distribution and focuses exclusively on:

1. **Information Tools** - Better game data visibility
2. **Analytics** - Understanding game mechanics
3. **Manual Helpers** - Timers and calculators
4. **Protection** - Crop locking to prevent mistakes

This tool enhances your gameplay experience by providing better information and analytics.

---

## 🙏 Acknowledgments

- Magic Garden community for feedback and testing
- Data sourced from community research and game analysis

---

## 📞 Support

- **Issues**: Open an issue on GitHub
- **Questions**: Check the troubleshooting guide above
- **Feature Requests**: Submit via GitHub issues

---

Made with ❤️ for the Magic Garden community
