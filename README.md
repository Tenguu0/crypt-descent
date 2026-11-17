# Crypt Descent

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Tenguu0/crypt-descent/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Tenguu0/crypt-descent/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A roguelike dungeon crawler for the [make.fun](https://make.fun/bounty/best-game-01) best-game-01 bounty. One delver, nine procedurally generated floors, and one Crypt Lord waiting at the bottom. Death is permanent — the crypt does not forgive.

## How to play

Open `game/index.html` in a desktop browser (or serve the `game/` folder with any static server). No build step, no network requests, no external assets — all art is canvas-drawn and all sound is synthesized with WebAudio.

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Space / J | Sword swing |
| Shift | Dash (brief invulnerability, cooldown) |
| E | Take loot / descend the stairs |
| Q | Drink a healing potion |
| M | Toggle sound |
| Click a tile | Walk there (click a nearby enemy to attack it) |
| Touch buttons | On-screen D-pad + ATK / DASH / USE on touch devices |

## The game

- **Procedural dungeon** — every floor is generated from a seed: rooms, corridors, torches, loot and monsters are different each run.
- **Four monsters + a boss** — slimes, skeletons, cave bats and wraiths (ranged), plus the Crypt Lord on every third floor, who summons skeletons and fires radial bolts.
- **Loot** — gold (auto-collected), potions, and weapons in four rarities (rusty, fine, rare, epic) with random damage rolls. Bosses drop epic loot.
- **Level-ups** — earn XP from kills and pick 1 of 3 boons each level: max HP, damage, speed, dash recharge, crit chance, or potions.
- **Permadeath + score** — score comes from floors descended, kills and gold. Kill the Crypt Lord on floor 9 to win; die anywhere and the run ends.
- **Minimap, fog of war, torchlight** — explored rooms stay mapped; the dark closes in beyond your lantern light.

## Repo layout

- `main.ts` — entrypoint: copies `game/` + `screenshots/` to the output directory and writes `dossier.json` via `vendor/makefun-game.ts`.
- `game/` — the playable game (static files only): `index.html`, `css/style.css`, `js/audio.js` (WebAudio synth), `js/dungeon.js` (procedural generation), `js/game.js` (entities, combat, rendering, input).
- `vendor/makefun-game.ts` — the kit's dossier library, copied unchanged.
- `screenshots/` — real renders of the game in Chromium.

## License

MIT — see [LICENSE](LICENSE).
