# Setup Instructions for QPM General Release Repository

This guide will help you push this repository to GitHub and set it up for distribution.

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `QPM-GeneralRelease` (or your preferred name)
3. Description: `QPM General Release - Information and analytics tools for Magic Garden`
4. **Important**: Choose **Public** (so users can download the userscript)
5. **Do NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

## Step 2: Push to GitHub

### macOS Instructions

Open Terminal (Cmd+Space, type "Terminal", press Enter) and run:

```bash
cd /Users/YOUR-MAC-USERNAME/QPM-GeneralRelease

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/QPM-GeneralRelease.git

# Push to GitHub
git push -u origin master
```

Replace:
- `YOUR-MAC-USERNAME` with your macOS username (check with `whoami` command)
- `YOUR-GITHUB-USERNAME` with your GitHub username

**Note**: If you get authentication errors, you may need to use a GitHub Personal Access Token instead of your password. Create one at: https://github.com/settings/tokens

## Step 3: Enable GitHub Pages (Optional)

This allows users to directly install from a URL:

1. Go to your repository on GitHub
2. Click "Settings" → "Pages"
3. Under "Source", select "Deploy from a branch"
4. Select "master" branch and "/ (root)" folder
5. Click "Save"

After a few minutes, your userscript will be available at:
```
https://YOUR-USERNAME.github.io/QPM-GeneralRelease/dist/QPM.user.js
```

Users can click this URL to install directly in Tampermonkey!

## Step 4: Create a Release

1. Go to your repository on GitHub
2. Click "Releases" → "Create a new release"
3. Tag version: `v5.0.0`
4. Release title: `QPM General Release v5.0.0`
5. Description:
```markdown
# QPM General Release v5.0.0

Complete information and analytics tool for Magic Garden.

## Features
- 🔒 Crop Type Locking
- 🧬 Mutation Tracking & Analytics
- 🐢 Manual Turtle Timer
- ⚡ Ability Analytics
- 💎 Value Calculator
- 📊 Statistics Dashboard

## Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Click the userscript file below
3. Click "Install"

## What's New
- Initial General Release
- Pure information and analytics tools
- Enhanced manual gameplay through better data

[Download Userscript](https://github.com/YOUR-USERNAME/QPM-GeneralRelease/raw/master/dist/QPM.user.js)
```

6. Attach the file: `dist/QPM.user.js`
7. Click "Publish release"

## Step 5: Update README with Install Link

After creating the release, update the README.md with your actual GitHub username:

```bash
# In README.md, add:
### Quick Install
[Click here to install QPM General Release](https://github.com/YOUR-USERNAME/QPM-GeneralRelease/raw/master/dist/QPM.user.js)
```

## Repository Structure

```
QPM-GeneralRelease/
├── README.md              # Main documentation
├── SETUP.md              # This file
├── .gitignore            # Git ignore rules
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript config
├── vite.config.ts        # Build configuration
├── src/                  # Source code
│   ├── features/         # Feature modules
│   ├── store/            # State management
│   ├── ui/               # User interface
│   ├── utils/            # Utilities
│   ├── core/             # Core systems
│   ├── data/             # Game data
│   └── main.ts           # Entry point
├── scripts/              # Build scripts
│   └── build-userscript.js
└── dist/                 # Built files (after npm run build)
    └── QPM.user.js       # Userscript for distribution
```

## Development

### macOS Terminal Commands

```bash
# Navigate to project directory
cd /Users/YOUR-MAC-USERNAME/QPM-GeneralRelease

# Install dependencies
npm install

# Build
npm run build:userscript

# Development (watch mode)
npm run dev
```

**Note**: Make sure you have Node.js installed. Install via Homebrew:
```bash
brew install node
```

## Support

- **Issues**: Open an issue on GitHub
- **Pull Requests**: Contributions welcome!
- **Documentation**: See README.md

## License

MIT License - See LICENSE file (if added)

---

## Next Steps

1. ✅ Repository created locally
2. ⏳ Push to GitHub (follow Step 2 above)
3. ⏳ Set up GitHub Pages (optional, Step 3)
4. ⏳ Create first release (Step 4)
5. ⏳ Share with users!

**Ready to push!** Follow Step 2 above to get started.
