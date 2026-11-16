# Nexo: game spec for the BGA adaptation

Source: official rulebook, English, `misc/Nexo_Rules (EN).pdf` (Marc Rebillet, Steffen Spiele; 4 pages EN). Items marked **[BGA]** are deliberate choices for the BGA version, either where the rules are silent or where we knowingly differ from the physical game. Mark anything confirmed with the publisher as **[BGA, confirmed with publisher]** and anything still open as **[BGA, pending publisher confirmation]**. Open questions and the defaults chosen for them: `.claude/open-questions.md`.

## Glossary

- **Disc**: one wooden piece. Each player has 25 in their color, red or black.
- **Reserve**: a player's discs not on the board (`player.reserve`, starts at `DISCS_PER_PLAYER` 25).
- **Tower**: 1 to 5 discs of one color stacked on one spot (one `towers` row: `tower_x`, `tower_y`, `player_id`, `height`). Its **height** is its number of discs.
- **Spot**: a position of the invisible grid (`x`, `y`, unbounded integers, the first tower of the game at 0 0, y growing downwards).
- **Grid**: the invisible, dynamic 5x5 grid (`GRID_SIZE`), its bounds set by the furthest towers in each direction. A tower may not create a 6th row or a 6th column.
- **Turn**: a player uses 1 to 5 discs from their reserve (`MAX_DISCS_PER_TURN`), split into one or more towers (`PlaceTowers`, `actPlaceTowers`).
- **New tower**: a tower on an empty spot, orthogonally adjacent to a tower of any color (`kind` `new`, `PLACEMENT_NEW`).
- **Replacement**: a tower put on an enemy tower's spot, at least one disc higher; the enemy tower's discs go back to its owner's reserve (`kind` `replace`, `PLACEMENT_REPLACE`).
- **Pass**: a player with no valid move skips their turn (`NextPlayer`, `playerPassed`). **Passed**: their last turn was a pass (`player.passed`), until they place again.
- **Group** (rulebook: "area"): towers of one color connected orthogonally. A player's **score** is the number of towers in their largest group, whatever their heights (`getLargestGroups()`).
- **Draft** [BGA]: the turn being built on the client before it is confirmed (`PlaceTowers.ts`); its towers are **drafted towers** (`PendingTower`).
- **Legal spot** [BGA]: an empty spot where the active player may place a new tower now. **Replaceable tower**: an enemy tower they can out-height with the discs left this turn.

## Components

- 50 wooden discs: 25 red, 25 black.
- No board: the grid is invisible.

### Sprite

No image yet: discs, spots and the board are drawn in CSS (placeholder art, see CLAUDE.md > Assets). Every size and color is a variable at the top of `src/scss/Game.scss`, so real art can replace them.

## Setup

- 2 players only. Each takes the 25 discs of a color as their reserve.
- **[BGA]** Colors are BGA player colors: `ff0000` plays red, `000000` plays black (`gameinfos.jsonc` `player_colors`, `DISC_COLOR_BY_PLAYER_COLOR`). `reattributeColorsBasedOnPreferences` may give either color to either player.
- The player with the red discs begins. **[BGA]** `setupNewGame` makes the red player active, whatever the seat order.

## Turn sequence

1. The active player must place a minimum of 1 and a maximum of 5 discs from their reserve, as 1 or more towers, each either:
   - a **new tower** on an empty spot, orthogonally adjacent to at least one tower of any color (except the very first tower of the game), or
   - a **replacement** of an enemy tower by a tower at least one disc higher; the replaced discs go back to the opponent's reserve.
   - A tower is 1 to 5 discs high. Nobody ever adds discs on top of an existing tower, theirs or the opponent's.
   - No tower may create a 6th row or a 6th column of the grid.
   - **[BGA]** The turn is checked as a whole: every new tower must reach the towers already on the board through the turn's other new towers, so a new tower may be adjacent only to a tower placed earlier in the same turn, and the order the towers were drafted in doesn't matter. A spot is used once per turn: a spot taken earlier in the turn can't be replaced again (it would be replacing your own tower). Replacements need no adjacency (the spot is already in the grid) and never change the grid's bounds.
   - **[BGA]** The very first tower of the game goes at 0 0: coordinates are relative, so every spot of an empty board is the same.
   - **[BGA] Draft then confirm**: the active player clicks or taps a highlighted spot (a teal ring: an empty legal spot; a pulsing orange ring around an enemy tower: a replaceable tower). A gold ring marks it and a small **height menu** opens right next to it: one button per legal and affordable height (1 up to the discs left this turn; for a replacement, from the enemy height + 1), each drawn as a tower of that height in the player's color with its number on top. For a replacement, the menu's caption shows the enemy tower and "Replace: at least N discs"; for a new tower it reads "Tower height". Clicking a height drafts the tower and closes the menu. The menu sits above the spot, or below, to the right or to the left when there is no room, always wholly on screen (desktop, phone, any BGA zoom), with an arrow pointing at the spot, and it follows the spot when the page scrolls, resizes or the board recentres. It closes with nothing drafted on a click or tap outside it, a second click on the same spot, or Escape; another highlighted spot moves it there. Keys 1 to 5 pick a height while it is open (not while typing in the chat). Its buttons are at least 48px (52px on BGA's mobile layout), real screen size. With a single possible height (1 disc left, or a 4 replaced with the last 5), the tower is drafted at once, with no menu. The status bar keeps one title for the whole draft ("You must place 1 to N discs", or "1 disc"), plus "Confirm" and "Reset turn" once a tower is drafted; selecting a spot never changes it. Each drafted tower shows semi-transparent on its spot (a replaced enemy tower fades under it). Clicking a drafted tower takes it back, together with any new tower that no longer reaches the board through the others (on the first turn, the towers still connected to the earliest one left stay). "Reset turn" takes them all back, "Confirm" sends the turn; the server checks every rule again. Legal spots and replaceable towers are recomputed after every change (adjacency and the grid's bounds both change as you draft). A panel above the board shows the discs left this turn (5 discs: used, left, or beyond the reserve) and the reserve left after the turn. A reload loses the draft (it lives on the page only).
   - **[BGA] Board view**: the board shows a 9x9 window of spots (2 x 5 - 1), laid on the towers already placed so that it holds every spot the grid can still reach this turn. It recentres (slides) after each turn, never while drafting. Spots outside the reachable area are not shown, and the reachable area is outlined: once 5 columns or 5 rows are taken, only those remain. Empty reachable spots show a faint dot.
2. **Pass**: a player who can't make a valid move (no discs left in their reserve, or no legal empty spot and no enemy tower they can out-height with at most min(5, reserve) discs) must pass. A player with a valid move can't pass.
   - **[BGA]** Passing is automatic: the server passes for them (`NextPlayer`), logs it ("name has no valid move and passes") and shows a PASSED stamp on their player board until they place again. A passed player is back in the game as soon as they have a valid move (discs returned by a replacement, or a spot opening up).
3. The turn goes to the other player.
   - **[BGA]** Client: the other player's (and every spectator's) view of a turn: replaced towers fly back to their owner's reserve on the player board (which bounces once they land), new towers fly one after another from the mover's reserve to their spots, scores update, then the board window recentres. The active player's own drafted towers just become solid. No flights on F5, in fast replay or with animations off.

## Scoring and game end

- The game ends when both players pass consecutively (`PASSES_TO_END_GAME` 2, global `consecutivePasses`, reset by every turn with a placement).
- Each player scores 1 point per tower in their single largest group of orthogonally connected towers of their color; height doesn't matter. Most points wins; a tie shares the victory (equal score, no tiebreaker, `tie_breaker_description` empty).
- **[BGA]** Live score: BGA's score counter on each player board always shows the current largest group, recomputed for both players after every turn (a replacement can split the opponent's group).
- **[BGA]** End-game display: every largest group of each player glows under its towers (several when two groups tie for largest), every other tower dims. A log row names the winner(s): "name wins with N connected towers", or "... share the victory ...". Restored after F5 (`getAllDatas` `endGameScoring`).
- **[BGA]** Game progression: half the share of the 25 spots taken, half the share of the 50 discs on the board (discs on the board only ever go up: a replacement always puts down more than it gives back, so the game always ends), capped at 99 until the end.

## Zombie mode [BGA]

Level 1 (report it in the Game Metadata Manager): every choice is random among the actions a real player could take there (BGA's level 1: "a random possible action", `getRandomZombieChoice`).
- Place towers: like a real player's clicks, a random spot among every legal empty spot and every replaceable enemy tower, then a random height among the ones its height menu would offer, and the turn is confirmed with that single tower.
- Passing is automatic for everyone, zombies included.

## Game options [BGA]

None.

## Preferences [BGA]

None.

## Hidden information

None: the board, both reserves and the scores are public, to spectators too. The draft is local to the active player's page until confirmed. **[BGA]** Nothing in the design blocks a hidden element later (a possible "secret bomb" expansion): a placement already carries a `kind`, and the `towers` table can take more columns.

## BGA states

Registered like Riviera's: one class per state in `modules/php/States/`, each with its `id:` in its constructor, and nothing else (no `states.inc.php`, no `$machinestates` array). The framework loads every class in that folder, so a stale file there (on Studio too) is a state. Ids 1 (setup) and 99 (game end) are BGA's own: no class uses them. Every transition is a returned class name, or `ST_END_GAME` (99) from `EndScore`. Only `PlaceTowers` and BGA's `gameEnd` have a client state class (`bga.states.register`); GAME states need none, as in Riviera.

| Id | Class | Type | Comes from | Goes to |
|---|---|---|---|---|
| 1 | (BGA setup) | | | `setupNewGame` returns `PlaceTowers` (10), red active |
| 10 | `PlaceTowers` | ACTIVE_PLAYER | setup; `NextPlayer` | `actPlaceTowers` (and the zombie, through it) → `NextPlayer` (90) |
| 90 | `NextPlayer` | GAME, updates progression | `PlaceTowers` | the next player has a valid move → `PlaceTowers` (10); else an automatic pass and the same check for the player after; the 2nd pass in a row → `EndScore` (98) |
| 98 | `EndScore` | GAME | `NextPlayer` | `ST_END_GAME` (99) |
| 99 | (BGA game end, client `gameEnd`) | | `EndScore` | |

- `PlaceTowers`: the active player drafts and confirms a turn (`actPlaceTowers`, a JSON list of `{x, y, height}`). Only reached with a valid move, so no pass action.
- `NextPlayer`: activates the other player and passes for anyone with no valid move (at most `PASSES_TO_END_GAME` loops).
- `EndScore`: final scores, stats, `displayEndGameScoring` (largest groups, winner log row).
- Debug jumps (Studio only): `debug_goToState($state = 10)`; `debug_setReserves()` and `debug_fillBoard()` → 10; `debug_endGame()` → 98.

## Statistics (stats.jsonc)

Table: turns played (10), passes (11).
Per player: turns played (10), passes (11), discs placed (12), new towers placed (13), enemy towers replaced (14), discs returned to their reserve by the opponent (15), largest connected area at the end (16), towers on the board at the end (17). All initialized in `setupNewGame`; 16 and 17 are set by `EndScore`.

## Milestones

**[BGA]** Built as one milestone at the user's request ("the whole base game in one go"); plan: `.claude/plans/milestone-1.md`.

1. **Base game** (done, awaiting Studio test): rules, server validation, draft-then-confirm UI, automatic pass, live score, end-game highlight, logs, stats, zombie, debug functions.
   - Notes:
     - Built: `towers` table and `player.reserve` / `player.passed`; `NEXOTableManager` (board reads and writes plus every rule: legal spots, replaceable towers, whole-turn validation, valid-move check, largest groups); states `PlaceTowers` (10), `NextPlayer` (90), `EndScore` (98). The template's `PlayerTurn` is gone (PHP and TS).
     - Client: `BoardRules.ts` mirrors the server's rule methods for the draft; `BoardHandler` (9x9 window, spots, towers, draft view, flights, recentring, group highlight); `States/PlaceTowers.ts` (the draft, draft panel); `PlayerHandler` (reserve, PASSED stamp, score, bounce); `LogMutationObserver` (Riviera's core) with three rows: towers placed, pass, game end; `TooltipHandler` (reserve, PASSED, score); `EndGameScoringHandler` (group highlight); `States/GameEnd.ts`.
     - Differs from Riviera: no Undo (the draft is client-side), no PrefHandler (no preferences yet), no end-game table (one score per player; the board highlight shows it).
     - Debug: `debug_setReserves($myReserve, $opponentReserve)`, `debug_fillBoard($emptySpots, $maxHeight)` (a full 5x5 from 0 0 with random owners and heights, reserves recomputed), `debug_endGame()`, `debug_goToState($state)`.
     - Unverified until Studio: `#[JsonParam]` reading the `placements` JSON the client sends (fallback: a flat `#[IntArrayParam]` "x,y,h,x,y,h", if negative numbers pass); `changeActivePlayer()` inside `setupNewGame` (fallback: `activeNextPlayer()` until red is active); `reattributeColorsBasedOnPreferences` with only 2 colors.
     - Not code, yours: the Game Metadata Manager (designer Marc Rebillet, publisher Steffen Spiele, graphic design Ewelina Proczko-Bazaczek, zombie level 1, images); `estimated_duration` (20, a guess) in `gameinfos.jsonc` (`publisher_bgg_id` 4666 and the website are set).
   - After M1, height menu (2026-11-16): the status bar height buttons are replaced by a popup next to the selected spot (`HeightMenu.ts`, see Turn sequence, step 1); the draft's status bar title no longer changes with the selection. Checklist: `.claude/TESTING.md` > After M1: height menu.
