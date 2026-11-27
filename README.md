[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/basyarferdi-hub/makefun-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/basyarferdi-hub/makefun-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# Kestrel Skies — a bush-pilot flight game (make.fun entry)

A complete 3D flight game in the browser: fly the Kestrel, a fabric-and-tube
bush plane, through glowing ring courses in a hand-built valley, mind your
fuel and airframe, respect the stall, and land back on the strip.

- Bounty: https://make.fun/bounty/best-flight-game-20261126-0057
- Play: serve `game/` with any static server (or run `node serve.ts` here)
  and open `game/index.html` in desktop Chrome. No build step, no network:
  the engine (three.js, vendored as `game/vendor/three.min.js`) and every
  script are files in this repository.
- Controls: W/S throttle, arrow keys pitch and bank, A/D rudder,
  Space brake, R restart.
- Three sorties: Ring Run (8 rings), Summit Circuit (6 climbing rings),
  Short Field (one low ring, then stop inside the zone). Landings are
  graded by sink rate, speed, bank and touchdown point; fuel burns with
  the throttle and the wing stalls faster in a bank.
- Layout: `main.ts` hands the game in (copies `game/` + `screenshots/`
  to the output and writes `dossier.json` via the kit's
  `vendor/makefun-game.ts`); the game's own source is split by job under
  `game/src/` — terrain, aircraft, course, hud, camera, input, audio.
- Screenshots in `screenshots/` are real renders of this code in a
  browser (staged with the game's own `?shot=` scenes). MIT licensed.
