// SPDX-License-Identifier: MIT
// Crypt Descent — make.fun best-game-01 entrypoint (Node 22, erasable TypeScript).
//
// Hands the game in: copies game/ and screenshots/ from this repository into
// the output directory (/output on the grader, MAKEFUN_OUTPUT_DIR elsewhere)
// and writes /output/dossier.json with buildDossier from vendor/makefun-game.ts.
//
// Usage:  MAKEFUN_OUTPUT_DIR=out node main.ts
//         node main.ts            (writes to /output)

import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function fail(message: string): never {
  console.error('crypt-descent main.ts: ' + message);
  process.exit(1);
}

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(gameDir)) fail('game/ is missing in ' + repoRoot);
if (!existsSync(shotsDir)) fail('screenshots/ is missing in ' + repoRoot);

// Start from a clean output directory so stale files never leak into the entry.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(gameDir, join(outDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, caps);
const dossierPath = join(outDir, 'dossier.json');
writeFileSync(dossierPath, dossier);
if (!existsSync(dossierPath)) fail('dossier.json was not written');

console.log('crypt-descent: wrote ' + dossierPath + ' (' + dossier.length + ' bytes)');
