# Configuration Files

This directory contains configuration files for the QPM project.

## Firebase Configuration

The Firebase configuration is stored in a separate file that is **gitignored** to keep sensitive API keys secure.

### Setup Instructions

1. Copy the template file:
   ```bash
   cp firebase.config.template.ts firebase.config.ts
   ```

2. Edit `firebase.config.ts` and fill in your actual Firebase credentials

3. The file `firebase.config.ts` will NOT be committed to git (it's in `.gitignore`)

### File Structure

- `firebase.config.template.ts` - Template with placeholder values (committed to git)
- `firebase.config.ts` - Actual config with real keys (gitignored, not committed)

## Security Notes

- Never commit `firebase.config.ts` to the repository
- The template file is safe to commit as it contains no real credentials
- When sharing the project, other developers should create their own `firebase.config.ts` from the template
