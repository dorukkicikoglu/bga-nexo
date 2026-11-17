# Nexo: game spec for the BGA adaptation

Source: official rulebook, English, `misc/Nexo_Rules (EN).pdf` (Marc Rebillet, Steffen Spiele; 4 pages EN). Items marked **[BGA]** are deliberate choices for the BGA version, either where the rules are silent or where we knowingly differ from the physical game. Mark anything confirmed with the publisher as **[BGA, confirmed with publisher]** and anything still open as **[BGA, pending publisher confirmation]**. Rule questions the rulebook left open, and their answers: `.claude/open-questions.md`.

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
- **Legal spot** [BGA]: an empty spot where the active player may place a new tower now. **Replaceable tower**: an enemy tower they can out-height with the discs left this turn (highlighted and clickable like a legal spot).

## Components

- 50 wooden discs: 25 red, 25 black.
- No board: the grid is invisible.

### Sprite

No image yet: discs, spots, the board and the page background (a white marble surface under a giant black disc's curved edge) are drawn in CSS (placeholder art, see CLAUDE.md > Assets). Every size and color is a variable at the top of `src/scss/Game.scss`, so real art can replace them.

## Setup

- 2 players only. Each takes the 25 discs of a color as their reserve.
- **[BGA]** Colors are BGA player colors: `ff0000` plays red, `000000` plays black (`gameinfos.jsonc` `player_colors`, `DISC_COLOR_BY_PLAYER_COLOR`). **[BGA]** The colors are random every game (`setupNewGame` shuffles them), whatever the seats; favourite colors are ignored (`favorite_colors_support` false, no `reattributeColorsBasedOnPreferences`). Red starts.
- The player with the red discs begins. **[BGA]** `setupNewGame` makes the red player active, whatever the seat order.

## Turn sequence

1. The active player must place a minimum of 1 and a maximum of 5 discs from their reserve, as 1 or more towers, each either:
   - a **new tower** on an empty spot, orthogonally adjacent to at least one tower of any color (except the very first tower of the game), or
   - a **replacement** of an enemy tower by a tower at least one disc higher; the replaced discs go back to the opponent's reserve. A replacement needs no adjacency check: every tower on the board except the first is adjacent to another tower and spots are never emptied, so an enemy tower is never on its own. Replacements never change the grid's bounds.
   - A tower is 1 to 5 discs high. Nobody ever adds discs on top of an existing tower, theirs or the opponent's. Only an enemy's tower can be replaced, so a spot taken earlier in the turn can't be replaced again: you never replace your own tower.
   - No tower may create a 6th row or a 6th column of the grid.
   - **[BGA]** The turn is checked as a whole: a new tower may be adjacent to any tower, including one placed earlier in the same turn (every new tower must reach the towers already on the board through the turn's other new towers), and the order the towers were drafted in doesn't matter.
   - **[BGA]** The very first tower of the game goes at 0 0 (coordinates are relative, so every spot of an empty board is the same); the server refuses a first turn without a tower there.
   - **[BGA] Draft then confirm**: the active player clicks or taps a highlighted spot (a dashed ellipse in their own disc color: an empty legal spot, or, a little wider and under the tower, an enemy tower they can replace, clickable like a legal spot). A gold ring marks it and a small **height menu** opens right next to it: one button per legal and affordable height (1 up to the discs left this turn; for a replacement, from the enemy height + 1), each drawn as a tower of that height in the player's color with its number on top. For a replacement, the menu's caption shows the enemy tower and "Replace: at least N discs"; for a new tower it reads "Tower height". Clicking a height drafts the tower and closes the menu. The menu sits above the spot, or below, to the right or to the left when there is no room, always wholly on screen (desktop, phone, any BGA zoom), with an arrow pointing at the spot, and it follows the spot when the page scrolls or resizes. It closes with nothing drafted on a click or tap outside it, a second click on the same spot, or Escape; another highlighted spot moves it there. Keys 1 to 5 pick a height while it is open (not while typing in the chat). Its buttons stay a comfortable tap size at any zoom. **[BGA, UI only]** A spot with only one legal height (1 disc left, or a 4 replaced with the last 5) drafts that tower at once, with no menu. The status bar keeps one title for the whole draft ("You must place 1 to N discs", or "1 disc"), plus "Confirm" and "Reset turn" once a tower is drafted; selecting a spot never changes it. Each drafted tower shows semi-transparent on its spot (a replaced enemy tower fades under it). Clicking a drafted tower takes it back, together with any new tower that no longer reaches the board through the others (on the first turn, the towers still connected to the earliest one left stay). "Reset turn" takes them all back, "Confirm" sends the turn; the server checks every rule again. Legal spots and replaceable towers are recomputed after every change (adjacency and the grid's bounds both change as you draft). A reload loses the draft (it lives on the page only).
   - **[BGA] Board view**: the board shows only the towers (and, to the player placing, the legal spots around them): no grid dots, no frame, no other space. It starts small around the first tower and stays centred on the bounding box of the towers plus the legal spots: whenever that box changes (a drafted tower, the end of every turn once the opponent's towers have landed), the contents slide smoothly (about 0.4s) to the new centre, never jump; on load there is no slide. Towers never move relative to each other: only the whole contents move together. Both players, spectators, a reload and a replay show the same layout. Legal spots show only to the active player while they place, as dashed ellipses in their own disc color (red or black); the passive player, spectators and replays never see them, so nothing looks clickable when it isn't. They still count in the box for everyone, so the board sits in the same place on every screen and doesn't slide when the turn passes. The board is 7 x 7 spots, room for the largest possible box (6 x 6), and as big as the window allows: square, about 10px under the status bar and 10px above the window's bottom (with the page scrolled to its top, so BGA's settings are still below it), never wider than the game area; it resizes with the window. No panel above the board.
2. **Pass**: there is no voluntary pass: a player with a valid move must place. A player who can't make a valid move must pass: no discs left in their reserve, or discs but nowhere legal to put them (no legal empty spot, and no enemy tower they can out-height with at most min(5, reserve) discs, so a player whose only moves would need more than 5 discs, or more than their reserve, passes).
   - **[BGA]** Passing is automatic: the server passes for them (`NextPlayer`), logs it ("name has no valid move and passes") and shows a PASSED stamp on their player board until they place again. The stamp shows only while exactly one player is passed: both passed means the game is over, so neither board shows it then, nor once the game has ended (after a reload too). Every pass, the player's own included, first shows a big PASSED stamp with the player's name at the centre of the screen: it holds briefly, then shrinks onto that player board's stamp and becomes it, or fades out there on the pass that ends the game; the next pass or the game end waits for it (about 1.5s). No banner with animations off, in fast replay or in a replay. A passed player is back in the game as soon as they have a valid move (discs returned by a replacement, or a spot opening up).
3. The turn goes to the other player.
   - **[BGA]** Client: the other player's (and every spectator's) view of a turn: the turn plays one spot at a time, in the order it was drafted: on each spot, the replaced tower (if any) flies back to its owner's reserve on the player board, top disc first, while the new tower flies from the mover's reserve onto the spot, bottom disc first, its discs leaving 50ms apart, and the next spot starts once every disc has landed. Then the boards that got discs back bounce, scores update, then the board re-centres (a smooth slide). The active player's own drafted towers become solid one spot at a time, as their replaced towers fly away. No flights on F5, in fast replay or with animations off.
   - **[BGA]** Game log: each turn's row shows the player's name and, on its right, a small snapshot of the board as it stood after the turn, cropped to the towers (a 2 x 3 board gives a 2 x 3 snapshot, at most 5 x 5), every tower at its height and color, a faint dot on empty spots inside it, and a gold ring on every spot the turn touched (new towers and replacements). Its spots have a fixed size (a bigger board, a bigger snapshot), scaled down only when the log is too narrow. The same after a reload and in a replay.

## Scoring and game end

- The game ends when both players pass consecutively (`PASSES_TO_END_GAME` 2, global `consecutivePasses`, reset by every turn with a placement).
- Each player scores 1 point per tower in their single largest group of orthogonally connected towers of their color; height doesn't matter. Two groups tied for largest score that size. Most points wins; a tie shares the victory (equal score, no tiebreaker, `tie_breaker_description` empty).
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

- **Show stack heights** (pref 100, `show_stack_heights`): Enabled (1, default) / Disabled (2). Disabled hides the height number on top of every tower: on the board, the flying towers, the height menu's buttons and the log rows. Display only, applied at once (no reload).

## Hidden information

None: the board, both reserves and the scores are public, to spectators too. The draft is local to the active player's page until confirmed.

## BGA states

Registered like Riviera's: one class per state in `modules/php/States/`, each with its `id:` in its constructor, and nothing else (no `states.inc.php`, no `$machinestates` array; see CLAUDE.md > Deleting or renaming PHP files). Ids 1 (setup) and 99 (game end) are BGA's own: no class uses them. Every transition is a returned class name, or `ST_END_GAME` (99) from `EndScore`. Only `PlaceTowers` and BGA's `gameEnd` have a client state class (`bga.states.register`); GAME states need none, as in Riviera.

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

1. **Base game** (done, tested on Studio): rules, server validation, draft-then-confirm UI, automatic pass, live score, end-game highlight, logs, stats, zombie, debug functions.
   - Notes:
     - Built: `towers` table and `player.reserve` / `player.passed`; `NEXOTableManager` (board reads and writes plus every rule: legal spots, replaceable towers, whole-turn validation, valid-move check, largest groups); states `PlaceTowers` (10), `NextPlayer` (90), `EndScore` (98). The template's `PlayerTurn` is gone (PHP and TS).
     - Client: `BoardRules.ts` mirrors the server's rule methods for the draft; `BoardHandler` (board view, spots, towers, draft view, flights, group highlight); `States/PlaceTowers.ts` (the draft); `PlayerHandler` (reserve, PASSED stamp, score, bounce); `LogMutationObserver` (Riviera's core) with three rows: towers placed, pass, game end; `TooltipHandler` (reserve, PASSED, score); `EndGameScoringHandler` (group highlight); `States/GameEnd.ts`.
     - Differs from Riviera: no Undo (the draft is client-side), no end-game table (one score per player; the board highlight shows it). `PrefHandler` came after M1, with "Show stack heights".
     - Debug: `debug_setReserves($myReserve, $opponentReserve)`, `debug_fillBoard($emptySpots, $maxHeight)` (a full 5x5 from 0 0 with random owners and heights, reserves recomputed), `debug_endGame()`, `debug_goToState($state)`.
     - Verified on Studio: `#[JsonParam]` reading the `placements` JSON the client sends (turns go through, negative coordinates included: towers left of and above the first tower); `changeActivePlayer()` inside `setupNewGame` (red is active first, whatever the seat order). `reattributeColorsBasedOnPreferences` was removed instead of verified (see Setup).
     - Not code, yours: the Game Metadata Manager (designer Marc Rebillet, publisher Steffen Spiele, graphic design Ewelina Proczko-Bazaczek, zombie level 1, images); the `gameinfos.jsonc` values still to check are in `.claude/open-questions.md` > Metadata to confirm.
   - After M1, height menu (2026-11-16): the status bar height buttons are replaced by a popup next to the selected spot (`HeightMenu.ts`, see Turn sequence, step 1); the draft's status bar title no longer changes with the selection. Checklist: `.claude/TESTING.md` > After M1: height menu.
   - After M1, material styling and anchored grid (2026-11-16): the board, player boards and log rows in the page background's white marble and charcoal (legal spots in the game's red, log rows with a bar in the player's color); the board window stays anchored on the first tower instead of re-centring after each turn (see Turn sequence, Board view). Checklist: `.claude/TESTING.md` > After M1: material styling and anchored grid. Superseded in part: the anchored window and the red legal spots by "Yaxha grid" below (the contents re-centre; legal spots in the drafting player's disc color); the marble styling stays.
   - After M1, Yaxha grid (2026-11-16): Yaxha's grid logic ported as is (`centerCubesContainer()` as `BoardHandler.centerContents()`: the contents re-centre, animated, on the bounding box of the towers plus the legal spots, with the frame anchored to the first tower); no grid dots, no frame, no 9x9 window; legal spots as ellipses in the placing player's disc color, shown only to them (they still count in the centring box for everyone). Yaxha's square legal spots were tried and reverted, and so was the anchored 9x9 window of "material styling and anchored grid". Checklist: `.claude/TESTING.md` > After M1: Yaxha grid.
   - After M1, board size (2026-11-16): the draft panel is removed; the board is as big as the window allows (`BoardHandler.fitToViewport()`). Checklist: `.claude/TESTING.md` > After M1: board size.
   - After M1, page background (2026-11-16): a white marble surface with a giant black disc's curved edge in the bottom-left, CSS gradients only (see CLAUDE.md > Assets). Checklist: `.claude/TESTING.md` > After M1: page background.
   - After M1, board snapshot in the log (2026-11-17): each turn's log row shows the board after the turn instead of one mini tower per placement (`towersPlaced` carries `board_snapshot`; see Turn sequence, step 3). Checklist: `.claude/TESTING.md` > After M1: board snapshot in the log.
   - After M1, "Show stack heights" preference (2026-11-17): pref 100 hides the height numbers on every tower (`PrefHandler`, see Preferences). Checklist: `.claude/TESTING.md` > After M1: "Show stack heights" preference.
   - After M1, replaceable rings (2026-11-17): replaceable enemy towers get the legal spots' dashed ring in the drafting player's disc color instead of the orange pulsing ring. Checklist: `.claude/TESTING.md` > After M1: replaceable rings.
   - After M1, turn animation one spot at a time (2026-11-17): a confirmed turn plays spot by spot, disc by disc, in replays too (see Turn sequence, step 3). Checklist: `.claude/TESTING.md` > After M1: turn animation one spot at a time.
   - After M1, replay keeps every log row (2026-11-17): `bgaFormatText()` dropped Riviera's `args.processed` guard (see CLAUDE.md > Conventions > Logs). Checklist: `.claude/TESTING.md` > After M1: replay keeps every log row.
   - After M1, docs audit (2026-11-17): the server refuses a first turn without a tower at 0 0; players' colors are random each game (see Setup); the open questions are settled (`.claude/open-questions.md`); dead code removed (Riviera leftovers such as the plain `animateSlide()` pair, `isTouchOrMobile()`, `rgbToHex()` and log groups, plus unused `BoardRules` methods and SCSS variables). Riviera's `LogMutationObserver` has the same two dead branches; fix there later. Checklist: `.claude/TESTING.md` > After M1: docs audit.
   - After M1, red disc in the background (2026-11-17): a decorative red disc (`img/bg_red_disc.png`) lies in the page background's bottom-right corner, 1.6 times a board disc wide, never over the board, the player boards or the chat bar (smaller, or hidden, on narrow windows; on mobile, under the board, never hidden). See CLAUDE.md > Assets. Checklist: `.claude/TESTING.md` > After M1: red disc in the background.
