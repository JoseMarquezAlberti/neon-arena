# NEON ARENA

A cyberpunk auto-battler built with React + Vite. Buy units, build synergies, fight AI opponents across 20 rounds.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Project Structure

```
├── App.jsx                  # Main game UI — shop, board, game loop
├── combat-esm.js            # Combat engine — all battle logic
├── AbilitySystem.js          # Innate ability flag wiring
├── AbilitySystem-esm.js      # ESM version of AbilitySystem
├── BattleArenaPixi.jsx       # PixiJS battle renderer
├── CombatSpectator.jsx       # Combat playback/spectator UI
├── Codex.jsx                 # In-game encyclopedia
├── TutorialCoach.jsx         # New player tutorial
├── main.jsx                  # React entry point
├── index.html                # HTML shell
├── index.css                 # Global styles
├── vite_config.js            # Vite configuration
│
├── units.json                # All 180 units (stats, innates, factions)
├── unit-abilities.json       # Ability flags for combat engine
├── t7-units.json             # Tier 7 legendary units
├── operators.json            # 12 operators (game-start perks)
├── factions.json             # 9 factions + synergy descriptions
├── combos.json               # Cross-faction combo bonuses
├── chips.json                # Augment chips (shop items)
├── mods.json                 # Equipment mods
├── keywords.json             # Keyword definitions
├── config.json               # Game constants (HP, gold, timers)
├── bosses.json               # Boss encounter data
├── breaches.json             # Breach system events
├── network-events.json       # Network event modifiers
├── quests.json               # Quest system data
└── quest-design.md           # Quest design notes
```

## Game Systems

- **180 units** across 9 factions (Synth, Hacker, Virus, Phantom, Augmented, Drone, Psionic, Construct, Neutral)
- **284 combat flags** wired through AbilitySystem
- **12 operators** with unique starting perks
- **14 cross-faction combos**
- **Boss fights** at rounds 5, 10, 15, 20
- **Veteran system** — units gain permanent bonuses from kills
- **Construct scaling** — Constructs grow stronger each combat
- **Mod drops** — equipment upgrades on win rounds
- **Augment chips** — keyword and stat items in shop

## Build

```bash
npm run build     # Production build → dist/
npm run preview   # Preview production build
```
