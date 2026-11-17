> Status: built 2026-11-16 in one go (no approval stop, at your request), tested on BGA Studio (see .claude/TESTING.md). Later changes (the height menu, `src/ts/HeightMenu.ts` NEW, the Yaxha grid, `PrefHandler.ts` and the rest) are listed in SPEC.md > Milestones; the tables below describe M1 as built.

# Nexo: Milestone 1 (Base game)

## Context

Nexo is a fresh copy of the BGA template. You asked for the whole base game in one milestone: rules, full server validation, a draft-then-confirm client, automatic passes, live scores and the end-game highlight, built like Riviera (`reference/riviera/`). No AI opponent, no secret bomb. Open rule questions and their defaults: `.claude/open-questions.md`.

Decisions:
- **Reserve as a `player` column**, not the newer framework's `PlayerCounter` (the template's example): like Riviera's own `player` columns, and our notifications update the client, so no framework counter notifications.
- **Rules live in `NEXOTableManager`** (like Riviera's `RIVTableManager`, which holds its game's rules), mirrored on the client by `BoardRules.ts` for the draft.
- **Whole-turn check**: connectivity of the board plus the new towers, and the final bounds, rather than replaying the towers in order. Same outcome for every order, so the client's "take a tower back" stays simple.
- **The turn is sent as JSON** (`#[JsonParam]`): coordinates can be negative, which a comma-separated `#[IntArrayParam]` might not accept.
- **One GAME state for passes** (`NextPlayer`): it loops over at most 2 players, so a pass never needs a client state.

## File-by-file

Legend: **NEW** = no Riviera equivalent · **COPY** = Riviera unchanged · **ADAPT** = Riviera file reshaped · **EDIT** = BGA template file edited · **KEEP** = unchanged · **DEL** = removed.

### Build / repo

| File | Kind | Mirrors | Content |
|---|---|---|---|
| `src-disabled/` → `src/` | EDIT (git mv) | Riviera `src/` | As CLAUDE.md says. |
| `package.json` | EDIT | Riviera | `"author": "Doruk Kicikoglu"`; scripts already matched. |
| `package-lock.json` | ADAPT | Riviera | Copied, `riviera` → `nexo`, then `npm install`. |
| `rollup.config.mjs`, `tsconfig.json` | KEEP | Riviera (identical) | none |
| `nexo.css`, `modules/js/Game.js` | generated | Riviera | `npm run build`. |
| `gameinfos.jsonc` | EDIT | Riviera | Name, publisher, website, 2 players, 20 min, colors `ff0000` / `000000`. |
| `stats.jsonc` | EDIT | Riviera | 2 table, 8 player stats. |
| `gameoptions.jsonc`, `gamepreferences.jsonc` | KEEP | n/a | None yet. |

### PHP

| File | Kind | Mirrors | Content |
|---|---|---|---|
| `dbmodel.sql` | EDIT | Riviera | `towers` table, `player.reserve`, `player.passed`. |
| `modules/php/material.inc.php` | NEW | Riviera | Grid, heights, discs per turn, colors, placement kinds. |
| `modules/php/Game.php` | EDIT | Riviera `Game.php` | Decorator, `getAllDatas`, setup (red active), progression, end-game scoring, debug functions. |
| `modules/php/NEXOTableManager.php` | NEW | `RIVTableManager.php` | Board reads and writes, every rule. |
| `modules/php/States/PlaceTowers.php` | NEW | Riviera's active-player state classes | `actPlaceTowers`, zombie. |
| `modules/php/States/NextPlayer.php` | EDIT | template | Automatic passes, game end. |
| `modules/php/States/EndScore.php` | ADAPT | Riviera `EndScore.php` | Final scores, stats, `displayEndGameScoring`. |
| `modules/php/States/PlayerTurn.php` | DEL | template | Its id 10 is PlaceTowers'. |

### TS / SCSS

| File | Kind | Mirrors | Content |
|---|---|---|---|
| `src/ts/Game.ts` | ADAPT | Riviera `Game.ts` | Handlers, `bgaFormatText`, slide helpers (copied), notifications. |
| `src/ts/BoardRules.ts` | NEW | n/a | Client copy of the rules. |
| `src/ts/BoardHandler.ts` | NEW | Riviera's game-area handlers | Board window, towers, spots, draft, flights. |
| `src/ts/PlayerHandler.ts` | ADAPT | Riviera | Reserve, PASSED stamp, score, bounce. |
| `src/ts/LogMutationObserver.ts` | ADAPT | Riviera (core copied) | Three `createLog*` rows. |
| `src/ts/TooltipHandler.ts` | ADAPT | Riviera | Player board tooltips only (reserve, PASSED, score). |
| `src/ts/EndGameScoringHandler.ts` | ADAPT | Riviera | Group highlight instead of a table. |
| `src/ts/States/PlaceTowers.ts` | NEW | Riviera's state classes | The draft. |
| `src/ts/States/GameEnd.ts` | ADAPT | Riviera | Clears the draft. |
| `src/ts/States/PlayerTurn.ts` | DEL | template | |
| `src/ts/types.d.ts`, `src/ts/libs.ts` | EDIT | Riviera | Types; header. |
| `src/scss/Game.scss` | ADAPT | Riviera | Towers, board, draft panel, boards, logs. |

## Verification

`npm run build` clean; `php -l` on every PHP file; the static rule methods run against a few boards (empty, full row, holes, split groups). Studio checks: `.claude/TESTING.md` > Milestone 1.

## Questions / conflicts

See `.claude/open-questions.md`. No conflict between the brief and the rulebook.
