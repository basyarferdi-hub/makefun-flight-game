// Kestrel Skies — hand-in program for make.fun's Best Flight Game bounty.
// The game itself is the static site in game/ (open game/index.html in any
// desktop browser, no build step, no network). This program copies game/ and
// screenshots/ into the output directory and writes dossier.json with the
// kit's buildDossier, exactly the summary the judge reads.
//
// Run locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play locally: node serve.ts  →  http://localhost:8080

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Walks a directory and totals its files and bytes, so the hand-in can be
// verified against the gate's caps before it is ever submitted.
function measureTree(dir) {
  let files = 0, bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = measureTree(path);
      files += sub.files; bytes += sub.bytes;
    } else {
      files += 1; bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The grader accepts only plain relative names in the output: a stray
// dotfile (.gitkeep, .DS_Store) copied in makes the whole run fail, so the
// copies below skip any path whose segments include a dot-name.
const noDotNames = (path) => !path.split('/').some((seg) => seg.length > 1 && seg.startsWith('.'));

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true, filter: noDotNames });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true, filter: noDotNames });
}

// The caps below are the gate's own (see the competition's RULES.txt): the
// dossier builder refuses anything the sealed scorer would refuse — more
// than 4 screenshots or one over 256 KiB, more than 993 files or 48 MiB
// under game/, or a path under game/ longer than 1000 bytes.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// Verify the hand-in against the gate's caps and say so in the log: the game
// tree within its file and byte caps, 3–4 screenshots each under 256 KiB,
// and the dossier itself under its 1.5 MiB cap.
const gameTree = measureTree(join(out, 'game'));
const shots = readdirSync(join(out, 'screenshots')).filter((name) => !name.startsWith('.'));
const shotBytes = shots.map((name) => statSync(join(out, 'screenshots', name)).size);
if (gameTree.files > 993 || gameTree.bytes > 50331648) {
  throw new Error(`game/ over its caps: ${gameTree.files} files, ${gameTree.bytes} bytes`);
}
if (shots.length < 3 || shots.length > 4 || shotBytes.some((b) => b > 262144)) {
  throw new Error(`screenshots/ out of shape: ${shots.length} files of ${shotBytes.join('/')} bytes`);
}
if (dossier.length > 1572864) {
  throw new Error(`dossier.json over its cap: ${dossier.length} bytes`);
}
console.log(`Kestrel Skies handed in: game/ ${gameTree.files} files ${gameTree.bytes} bytes, `
  + `${shots.length} screenshots, dossier.json ${dossier.length} bytes -> ${out} (verified)`);
