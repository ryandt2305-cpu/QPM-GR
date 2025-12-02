# Aries Mod Integration Guide

## How to Enable QPM ↔ Aries Integration

Since Aries mod doesn't currently expose its PetsService globally, there are two ways to enable integration:

---

## Option 1: Patch Aries Mod (Recommended)

### Step 1: Locate the Aries Mod Source

Find the file where `PetsService` is exported (likely `src/services/pets.ts`).

### Step 2: Add Global Exposure

After the PetsService export, add these lines:

```typescript
// At the end of src/services/pets.ts
export const PetsService = {
  // ... existing service methods
};

// Add QPM integration export
if (typeof window !== 'undefined') {
  window.QWS = window.QWS || {};
  window.QWS.PetsService = PetsService;
  console.log('[Aries] PetsService exposed for QPM integration');
}
```

### Step 3: Rebuild Aries Mod

```bash
npm run build
```

### Step 4: Reload Game

Both mods should now detect each other!

---

## Option 2: Use localStorage Fallback (Automatic)

QPM now automatically checks localStorage for Aries teams! No setup needed.

### How It Works

QPM checks these localStorage keys automatically:
- `aries:teams`
- `aries:petTeams`
- `qws:teams`
- `qws:petTeams`
- `petTeams`
- `teams`

If Aries stores teams in any of these keys with the correct structure, QPM will detect them automatically.

### Find Your Storage Key

Open console and run:
```javascript
// List all localStorage keys
Object.keys(localStorage).filter(k =>
  k.toLowerCase().includes('aries') ||
  k.toLowerCase().includes('pet') ||
  k.toLowerCase().includes('team')
).forEach(k => {
  console.log(k + ':', localStorage.getItem(k)?.substring(0, 100));
});
```

### Manual Testing

If Aries uses a different key, you can test by manually creating teams:
```javascript
localStorage.setItem('aries:teams', JSON.stringify([
  {
    id: 'test-1',
    name: 'Test Team',
    slots: ['petId1', 'petId2', null]
  }
]));
// Then refresh Pet Hub 3v3 tab
```

---

## Option 3: Ask Aries Author

Contact [@Ariedam64](https://github.com/Ariedam64) and request an official API:

```typescript
// Requested API structure
interface AriesPetsAPI {
  getTeams(): PetTeam[];
  onTeamsChange(callback: (teams: PetTeam[]) => void): () => void;
}

// Expose as:
window.QWS.PetsService = AriesPetsAPI;
```

---

## Testing Integration

Once exposed, test with:

```javascript
// In browser console
QPM.debugAriesIntegration()
```

You should see:
```
✅ window.QWS.PetsService: [object Object]
   Properties: ['getTeams', 'onTeamsChangeNow', ...]
   Teams (3): [{id: '...', name: 'Team 1', slots: [...]}]
```

---

## Expected Data Structure

Aries mod should return teams in this format:

```typescript
interface PetTeam {
  id: string;           // Unique team ID
  name: string;         // Display name (e.g., "Farming Team")
  slots: (string | null)[];  // Array of 3 pet IDs or null
}
```

Example:
```javascript
[
  {
    id: "team-001",
    name: "Farming Team",
    slots: ["pet-abc123", "pet-def456", "pet-ghi789"]
  },
  {
    id: "team-002",
    name: "PvP Team",
    slots: ["pet-xyz999", null, "pet-aaa111"]
  }
]
```

---

## Current Status

✅ **QPM Side**: Fully implemented and ready
❌ **Aries Side**: Not exposed globally yet

The integration will automatically activate once Aries exposes `window.QWS.PetsService`.
