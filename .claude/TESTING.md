# Nexo: BGA Studio test checklists

One section per milestone, written when the milestone ends. Tick items as you test; note failures inline.

<!--
Template for each section (Riviera's style):

## Milestone N: <name>

Deploy: `img/`, `modules/`, `nexo.css`, `dbmodel.sql`, `*.jsonc` (SFTP uploads them on save; `src/`, `.claude/`, `node_modules/` are ignored). If the schema changed, start a **new** table.

<Area> (where to look, or the SQL to run):
- [ ] What to do, then what you should see.

Debug functions (Studio debug menu):
- [ ] `debug_xxx()`: what it sets up and what to check.

Spectator and display:
- [ ] A spectator sees ... and no private information.
- [ ] Mobile layout (or a narrow window): nothing overflows horizontally.
- [ ] No errors in the browser console on load or F5.

Changes after a milestone get their own section: "## After MN: <change>".
-->

## Milestone 1: Base game

Deploy: `modules/`, `nexo.css`, `dbmodel.sql`, `*.jsonc` (SFTP uploads them on save; `src/`, `.claude/`, `node_modules/` are ignored). The schema is new, so start a **new** table. Check that `modules/php/States/PlayerTurn.php` is gone from Studio too (it took id 10). Keep the browser console open: report any error.

Setup:
- [ ] A 2-player game starts without errors. One player is red, the other black.
- [ ] The red player is active first, whatever the seat order.
- [ ] Each player board shows a red or black disc "× 25" and a score of 0. No PASSED stamp.
- [ ] Red sees a single legal spot (a red dashed ellipse) in the board's centre. Black sees an empty board and "<name> must place towers", with nothing clickable.
- [ ] `SELECT * FROM towers` is empty; `SELECT player_id, player_color, reserve, passed FROM player`: 25 and `no` each.

Drafting (as the active player):
- [ ] Click the centre spot: it gets a gold ring and the height menu opens next to it with towers 1 to 5 (details: After M1: height menu).
- [ ] Pick 2: a semi-transparent 2-disc tower appears; the title is unchanged; Confirm and Reset turn show. New legal spots appear around it.
- [ ] Place a 1 next to it, then a 1 next to that one (adjacent only to this turn's tower): allowed. With 1 disc left, a click places a 1 at once (no buttons).
- [ ] With 0 discs left, no ring shows; the title stays "You must place 1 to 5 discs" and Confirm is there.
- [ ] Hover a drafted tower: an × shows. Click the middle one of a line of three: it goes, and so does the far one (no longer connected). Reset turn clears everything.
- [ ] Legal spots never go beyond 5 columns or 5 rows: build a row of 4 over two turns, then check that only one more column is offered at either end.
- [ ] Confirm: the drafted towers become solid; your reserve drops; your score becomes your largest group (towers, not discs).

The other player's view of a turn (and a spectator's):
- [ ] New towers fly one after another from the mover's reserve disc on their player board to their spots.
- [ ] After each turn the board's contents slide smoothly to stay centred, never jump (see After M1: Yaxha grid).
- [ ] The log row reads "name [board snapshot]" (details: After M1: board snapshot in the log).

Replacements:
- [ ] An enemy tower you can out-height has a dashed ring in your color around its base, like an empty legal spot (no orange, no pulse). Towers as tall as your discs left (or height 5) have none.
- [ ] Click one: the menu's caption shows that tower and "Replace: at least N discs", and its towers start at its height + 1. Once picked, the enemy tower fades under your drafted one.
- [ ] Confirm: on the other screen the enemy tower flies back to its owner's reserve while the new one flies in; once the turn's last tower has landed, the owner's board bounces and their reserve goes up by the replaced height. The log row's snapshot shows your tower on that spot, ringed in gold.
- [ ] A replacement that splits the opponent's group lowers their score at once.

Server checks (browser console, `window[0].gameui.bga.actions.performAction('actPlaceTowers', {placements: '...'})`):
- [ ] `[{"x":5,"y":5,"height":1}]` (not adjacent): "Every new tower must be orthogonally adjacent to a tower".
- [ ] Two towers totalling 6 discs: "You cannot place more than 5 discs in a turn".
- [ ] A tower on your own tower: "You cannot place discs on top of an existing tower".
- [ ] A replacement at the same height as the enemy tower: refused.
- [ ] A 6th column: "You cannot create a 6th row or a 6th column".
- [ ] If every `actPlaceTowers` fails with a parameter error, `#[JsonParam]` doesn't read the JSON string: paste the error.

Passes and game end (Studio debug menu):
- [ ] On your turn, `debug_setReserves(5, 0)`, then confirm a turn: the opponent (reserve 0) is passed automatically: a grey log row "<name> has no valid move and passes", a PASSED stamp on their board, and you are active again.
- [ ] Their PASSED stamp goes once they place again (`debug_setReserves` giving them discs back, or a replacement of their tower returning discs).
- [ ] `debug_fillBoard(0)`: a full 5x5. Whoever can't out-height any enemy tower passes; when both pass in a row, the game ends.
- [ ] `debug_fillBoard(2, 2)`: a 5x5 with 2 holes; only the holes and replaceable towers are offered.
- [ ] At the end: each player's largest group glows (red: light red, black: gold) and every other tower dims; the log names the winner ("share the victory" on a tie); BGA's end screen ranks the higher score first, a tie as a shared win.
- [ ] F5 after the end: the highlight is still there.
- [ ] `debug_endGame()` mid-game: the same end display.

Zombie:
- [ ] Make a player quit: on their turns a single random legal tower is placed (log row as usual), and passes still happen on their own.

Spectator and display:
- [ ] A spectator sees the board, both reserves, PASSED stamps and the log, and no rings.
- [ ] Mobile layout (or a narrow window): the board is large and fits the width; the action buttons wrap under the title; nothing overflows horizontally.
- [ ] Statistics at the end (turns, passes, discs placed, towers placed and replaced, discs returned, largest area, towers at the end) look right.
- [ ] No errors in the browser console on load or F5.

## After M1: height menu

Deploy `modules/` and `nexo.css`; no schema change, an ongoing table is fine (F5). Test everything below twice: on desktop, and on a narrow mobile viewport (a phone, or the browser's device toolbar at about 375px wide, which gives BGA's mobile layout).

Opening and choosing:
- [ ] Click or tap a legal (ringed) spot: a gold ring on the spot and a small menu right next to it, with an arrow pointing at the spot. One button per possible height, each a tower of that height in your color with its number on top; caption "Tower height". Buttons are a comfortable tap size (about 48px on desktop, a little bigger on mobile).
- [ ] The status bar title doesn't change when the menu opens or closes ("You must place 1 to N discs"); no height buttons in the status bar.
- [ ] Click a height: the drafted tower appears and the menu closes. The next menu only offers the heights the discs left allow (after a 3, only 1 and 2).
- [ ] Click a ringed enemy tower: the caption shows that enemy tower and "Replace: at least N discs" (N = its height + 1), and the lowest button is N.
- [ ] A spot with one possible height (1 disc left, or replacing a 4 with exactly 5 left) drafts it at once, with no menu.
- [ ] With the menu open, keys 1 to 5 pick a height it offers (other digits do nothing). Typing digits in the chat does nothing to the board.

Closing and moving:
- [ ] Click outside the menu (empty board area, the log, the page): it closes, nothing drafted, the gold ring goes.
- [ ] Click the same spot again: it closes. Escape: it closes.
- [ ] Click another legal spot or ringed enemy tower with the menu open: the menu moves there in one click.
- [ ] Click a drafted tower with the menu open: the tower is taken back and the menu closes.
- [ ] Confirm, Reset turn and the end of the turn close it too.

Placement on screen:
- [ ] On a spot in the top rows of the board (scroll so the board's top is near the top of the window): the menu flips below the spot, the arrow now on its top edge.
- [ ] On a spot near the left or right edge of a narrow window: the menu shifts to stay wholly on screen, the arrow still pointing at the spot.
- [ ] Scroll the page with the menu open: it follows its spot. Resize the window or rotate the phone: same.
- [ ] Mobile: the menu is never under BGA's top bar, never cut by the screen's edges, and its buttons keep their size whatever BGA's zoom.
- [ ] No errors in the browser console.

## After M1: page background

Deploy `nexo.css`; no schema change, an ongoing table is fine (F5). Check on desktop and on a phone (or the browser's device toolbar at about 375px wide).

- [ ] Desktop: a warm white surface with faint grey veins; a black area on the left with a clean curved edge, covering a little over half the width at the bottom and a little less than half at the top, with a faint shadow along the edge on the white side.
- [ ] Scroll the page: the background stays put (no tiling, no seam at the bottom of a long page).
- [ ] Phone (portrait): the black disc stays in the bottom-left corner and leaves most of the screen white; landscape looks like desktop.
- [ ] Nothing of BGA's default background shows anywhere (top, bottom, behind the side column).
- [ ] Readable over the black: the status bar, the board, the log (on a phone it sits under the board), player boards, the end-of-game result box. Note anything that isn't.
- [ ] No other page of BGA changes (the lobby, another game).

## After M1: material styling and anchored grid

Deploy `modules/` and `nexo.css`; no schema change, an ongoing table is fine (F5).

Board:
- [ ] The board is a pale white marble slab (no beige) with small rounded corners and a soft shadow; it reads well where it crosses the black arc's edge.
- [ ] (Superseded by After M1: Yaxha grid: no dots, no outline.)
- [ ] Legal spots: see After M1: Yaxha grid. Replaceable enemy towers: the same dashed ring in your color, around their base. The selected spot: gold. All three are easy to tell apart, for both players.
- [ ] Discs look exactly as before.

Anchored grid: superseded by After M1: Yaxha grid (the contents now re-centre).

Player boards and log:
- [ ] Player boards: the same white marble and a soft shadow, no beige.
- [ ] Log rows: white marble, near-black text, a soft line under each, a red bar on the left of the red player's rows and a black bar on the black player's (pass rows too; the game end row in the winner's color, neutral on a shared victory). "You" and other names in their own player's color. No gold tones (the board snapshot's gold rings came later, see After M1: board snapshot in the log).
- [ ] Timestamps, hovering a row and the replay links ("replay from this move") work as before, in the desktop log, the mobile log and a replay.

## After M1: Yaxha grid

Deploy `modules/` and `nexo.css`; no schema change, an ongoing table is fine (F5). Check as both players and as a spectator.

Display:
- [ ] Only towers and legal spots show: no grid dots, no frame, no empty space marked out. (Board size: see After M1: board size.)
- [ ] Legal spots are dashed ellipses in your own color (red or black), only on your turn while you place (pointer, solid on hover); the selected spot's gold ring and the replaceable towers get the same dashed ring in your color as the empty spots (see After M1: replaceable rings). The passive player, a spectator and a replay see no ellipses at all.
- [ ] When the turn passes, the board doesn't slide on either screen: both players' boards sit in the same place.
- [ ] Game start: red sees one legal spot in the middle of the board, black an empty board; after the first tower, the tower sits in the middle on both screens (with 4 legal spots around it on the placing player's).

Re-centring (Yaxha's):
- [ ] Draft a tower at an edge of the contents: everything slides smoothly (about 0.4s) to stay centred, nothing jumps. Taking it back slides back.
- [ ] Confirm: on the other screen (and a spectator's) the towers fly to their spots first, then everything slides to the new centre. The mover's screen ends in the same place.
- [ ] Build towards each edge and each corner of the 5x5 over several turns: every tower keeps its place relative to the others, the contents never leave the board or get clipped, and they always end centred.
- [ ] F5 at any point: the same layout as before the reload, with no slide. A replay shows the same layout at each move.
- [ ] Animations off (BGA's setting) or fast replay: the board just applies the new centre.
- [ ] Once the game ends, legal spots go and the towers re-centre on their own; F5 after the end shows the same.

## After M1: board size

Deploy `modules/` and `nexo.css`; no schema change, an ongoing table is fine (F5).

- [ ] No panel above the board (no discs-left panel), for anyone.
- [ ] Desktop, page at its top, right after F5 and after waiting a moment: the board is square, about 10px under the status bar, its bottom about 10px above the window's bottom (Studio's debug buttons only appear after scrolling); towers and legal spots scale with it. Scroll down: BGA's settings and the rest of the page are still below it.
- [ ] Resize the window taller, shorter, narrower: the board follows (never wider than the game area, never under the right column); the towers stay centred and in place relative to each other.
- [ ] Mobile (portrait): the board fills the game area's width; nothing overflows horizontally. Rotate the phone: it resizes.
- [ ] The height menu still opens next to its spot and its buttons keep their size; flights to and from the board land on the right spots.

## After M1: "Show stack heights" preference

Deploy `gamepreferences.jsonc`, `modules/` and `nexo.css`, then Studio's game page > "Reload game options configuration". No schema change; open a new table, or F5 an ongoing one after the reload.

- [ ] BGA's preferences menu (the cog) lists "Show stack heights", Enabled by default; a new player sees numbers on every tower.
- [ ] Switch it to Disabled: at once, with no reload, no number on the board's towers, the drafted towers, the height menu's buttons (their tooltip still says the height) or the log rows. Back to Enabled: they all come back.
- [ ] Disabled, then F5: still no numbers. Each player's choice is their own (the opponent's screen doesn't change).
- [ ] Disabled, watch the opponent's turn: the flying towers and replaced towers have no number while they fly, and none appears when they land.
- [ ] A spectator sees numbers (the default).
- [ ] Replay (`replayFrom`) of a game begun before "Show stack heights" existed: it loads (no `show_stack_heights` error in the console), and the towers show or hide their numbers according to your preference; switching it during the replay applies at once.

## After M1: replaceable rings

Deploy `nexo.css`; no schema change, an ongoing table is fine (F5).

- [ ] As black: the red towers you can replace have a black dashed ring around their base, the same style as the empty legal spots; as red, black towers get a red one. No orange ring and no pulse anywhere.
- [ ] Hover a ringed tower: its ring turns solid, like an empty spot's. Click it: the gold selected ring and the height menu, as before.
- [ ] The passive player, a spectator and a replay see no rings at all.

## After M1: turn animation one spot at a time

Deploy `modules/` and `nexo.css`; no schema change, an ongoing table is fine (F5).

- [ ] Opponent's turn with several towers (as the passive player and as a spectator): the towers fly in one at a time, each landing before the next leaves the reserve, in the order they were drafted.
- [ ] A turn with a replacement: on that spot, the enemy tower flies back to its owner's reserve at the same time as the new tower flies in; the next spot waits for both.
- [ ] Your own turn with replacements: after Confirm, each replaced tower flies away in turn and your drafted tower on that spot becomes solid then; the drafted towers still waiting show no × on hover and don't react to clicks.
- [ ] The next notification (a pass banner, the end of the game) and the board's re-centring wait until the last spot has landed.
- [ ] Replay from a log row: the same one-spot-at-a-time sequence. Fast replay, instantaneous mode or F5: everything applies at once, no flight.
- [ ] Discs of a tower leave one after the other (50ms apart): a new tower's bottom disc first, each disc appearing in the tower as it lands, the height number with the top one; a replaced tower's top disc first. The next spot starts only after the last disc has landed.

## After M1: replay keeps every log row

Deploy `modules/`; no schema change, an ongoing table is fine (F5).

- [ ] With at least 3 turns played: "Replay from this move" on the game's first move, as the red player. When the replay ends, every log row is there (the first move included).
- [ ] The same as the black player: the red player's first move is still in the log when the replay ends.
- [ ] The same as a spectator, if BGA lets a spectator start the replay (see the note on spectators): every row remains.
- [ ] If a row is missing anyway: in the console, `window[0].document.querySelectorAll('#logs .log:not(.a-game-log), [id^="replaylogs"] .gamelogreview:not(.a-game-log)')` lists the rows the log CSS hides; paste the text of the "places towers" one.

## After M1: board snapshot in the log

Deploy `modules/` and `nexo.css`; no schema change. Start a fresh table: turns logged before this deploy have no snapshot and show only their own towers.

- [ ] First turn (red, one tower): the row reads "name [1 x 1 snapshot]", the tower ringed in gold. Name on the left, snapshot on its right, the red bar on the row's left edge.
- [ ] A few turns in: each row's snapshot is the board's bounding box at that moment (a 2 x 3 board gives a 2 x 3 snapshot), with a faint dot on the empty spots inside it. Earlier rows keep their own smaller snapshots.
- [ ] Grow the board left and up of the first tower (negative coordinates): the snapshot matches the main board's layout, nothing shifted or missing.
- [ ] A turn with a replacement: the spot shows the new tower (the mover's color, its new height) ringed in gold, like a new tower. Every spot of a several-tower turn is ringed; untouched towers are not.
- [ ] `debug_fillBoard()` then a turn: a 5 x 5 snapshot, as wide as it gets, still inside the desktop log column with the name readable (cut with an ellipsis if long). Narrow the window until the right column is at its narrowest: the snapshot shrinks as a whole, never overflows.
- [ ] Mobile layout (or a phone): the table log shows the same rows, snapshots inside the log's width.
- [ ] F5: every row rebuilds with the same snapshots and gold rings. Replay from a log row and an archived replay: the same rows.
- [ ] "Show stack heights" off: no numbers on the snapshot towers; on: numbers readable on the towers' faces.

## After M1: docs audit

Deploy `modules/`, `nexo.css` and `gameinfos.jsonc`, then Studio's game page > "Reload game informations"; no schema change, an ongoing table is fine (F5) except for the colors check. Mostly dead code removed, so everything should look and play as before.

- [ ] Start several new tables (and a rematch): red lands on either seat at random, and whoever is red is always active first.

- [ ] New table, as red, before placing anything: `window[0].gameui.bga.actions.performAction('actPlaceTowers', {placements: '[{"x":1,"y":0,"height":1}]'})` is refused with "The first tower of the game must be placed on the centre spot". Clicking the centre spot and confirming still works.
- [ ] A turn as usual on both screens: towers and replaced towers fly disc by disc to and from the player boards' reserve discs, land at the right size and place, and the owner's board bounces.
- [ ] Log rows: name, snapshot and colored bar as before, on desktop, the mobile table log and a replay; timestamps still show on desktop.
- [ ] Legal spots and replaceable rings in your disc color, the selected spot gold, as before.
- [ ] The end of the game: the log row reads "name wins with N connected towers" (or "share the victory" on a tie), and the largest groups glow as before.
- [ ] No errors in the browser console on load, during a turn, or on F5.

## After M1: red disc in the background

Deploy `modules/`, `nexo.css` and `img/bg_red_disc.png`; no schema change, an ongoing table is fine (F5).

- [ ] Desktop (about 1584 x 814): a red disc with its shadow in the bottom-right corner, its centre about 83% across and 84% down, between the board and the right column, about 1.6 times a board disc wide. Scroll the page: it stays put.
- [ ] Clicks near it go through (nothing blocks the log, the chat bar or the board).
- [ ] Resize the window: it scales with the board's discs and stays in the corner. Make the window narrow until the board nears it: it shrinks, never overlaps the board, and disappears when there's no room. Make it short until the player boards reach down to it: same.
- [ ] It stays clear of the "Discuss at this table" bar at the bottom; an open chat window, the log rows and the height menu all cover it.
- [ ] Mobile (or a phone, portrait): bottom right under the board, the same size relative to the board's discs, partly cropped off the right edge at most, never shrunk to nothing. Landscape phone: still there, behind the board where it can't fit.
- [ ] Light and dark BGA themes: the disc looks the same, the black disc in the bottom left is untouched.
