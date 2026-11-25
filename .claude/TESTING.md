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

## After M1: reserve stacks

Deploy `modules/` and `nexo.css`; no server or schema change, an ongoing table is fine (F5).

- [ ] Start of a game: each player board shows 5 full stacks of 5 discs in the player's color, side by side, no "× 25". The player board is no wider than before; with a PASSED stamp showing, the stamp sits at the right end of the row (over the last stacks only if the board is narrow).
- [ ] Hover the stacks: a tooltip "25 discs left" plus the reserve explanation; it follows every change ("1 disc left" at 1, "0 discs left" at 0).
- [ ] Opponent's turn (as the passive player and as a spectator): each new tower's discs leave the top of the rightmost non-empty stack, one by one, bottom disc first, and the stack loses each disc as it leaves. A 3-disc tower from a reserve of 12 (5, 5, 2): the 2 discs of the third stack go first, then the top of the second stack.
- [ ] A replacement: the replaced tower's discs fly back onto the owner's stacks, top disc first, each landing on the top of the leftmost stack with room (a reserve of 8 getting 3 back: 5, 3 becomes 5, 5, 1) and appearing there as it lands; the board then bounces.
- [ ] Your own turn: after Confirm, your drafted towers stay put and your stacks lose their discs spot by spot; replaced enemy towers fly back onto the opponent's stacks.
- [ ] Each flying disc starts exactly over its stack disc and lands exactly on its slot (no jump at either end), on desktop and on a phone.
- [ ] Empty stacks show a faint dashed outline; a reserve of 0 shows 5 outlines. Use `debug_setReserves(0, 25)`, then F5: 5 outlines on your board, 5 full stacks on the other.
- [ ] F5 mid-game, and a spectator joining: the stacks match the reserve (count them against the tooltip).
- [ ] Replay from a log row: the same flights from and to the stacks. Fast replay, instantaneous mode: no flights, the stacks just update to the right count at each turn.
- [ ] After `debug_setReserves` (no notification), the stacks only update on F5 or after the next turn, and then show the right count.
- [ ] No errors in the browser console on load, during a turn, or on F5.

## After M1: clearer disc seams

Deploy `nexo.css` only; an ongoing table is fine (F5).

- [ ] Board: in a 5-disc tower of each color, every disc is easy to count: a red tower shows a light edge over a dark maroon line between discs, a black tower a dark gap over a grey highlight. Not heavy: the towers still look like smooth stacks.
- [ ] A 5-disc tower still stays inside its spot (its top face never covers the tower in the row above), on desktop and mobile.
- [ ] Player boards: each stack's discs read as separate pieces at a glance on both colors (count a stack of 3 and a stack of 5). The row is a few px taller, no wider; the PASSED stamp is still centred on the row.
- [ ] The log snapshots (24px spots) and the height menu: seams visible, nothing overflows its cell.
- [ ] Flights between the stacks and the board still start and land without a jump.

## After M1: own towers fly too

Deploy `modules/` only; an ongoing table is fine (F5).

- [ ] Your turn, 1 disc: after Confirm, the drafted placeholder stays until its turn, then goes and the disc flies from the top of your rightmost non-empty stack onto the spot; that stack loses the disc as it leaves.
- [ ] Your turn, 5 discs (one 5-disc tower, then also 5 towers of 1): the discs leave your stacks one after another, 50ms apart within a tower, spot by spot in the order you drafted; the stacks shrink right to left as each one leaves.
- [ ] Capture: your replacement of an enemy tower: the enemy discs fly back onto their stacks while your new tower's discs fly in from yours, on the same spot, at the same time. The opponent's replacement of yours: the same, seen from the other side.
- [ ] The opponent's view of the same turns (second browser) and a spectator's: identical flights.
- [ ] F5 mid-game (also during the other player's turn): the stacks match the tooltip count, the board matches; no flight on load.
- [ ] Replay from a log row: the same flights. Fast replay or instantaneous mode: nothing flies, stacks and board just match after each turn.
- [ ] No errors in the browser console.

## After M1: height by clicks

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). After the deploy, delete the remote `src/ts/HeightMenu.ts` if it is still on Studio (harmless, never loaded).

- [ ] Your turn, 5 discs: click a legal empty spot: a 1-disc tower appears semi-transparent with a gold ring under it, a badge "1" on its top right corner and a round undo button just under it. No popup anywhere.
- [ ] Click that tower again and again: 2, 3, 4, 5 (badge and tower follow), then the next click removes it (no tower, no badge, no button, the spot is a dashed legal ring again); the next click starts at 1.
- [ ] A replacement: click an enemy 2 tower: your tower starts at 3 ("3" on the badge), the enemy tower fades under it; clicks go 4, 5, then back to the enemy tower alone.
- [ ] Discs left: with 3 discs this turn, a tower cycles 1, 2, 3, then none. With a 2-tower drafted elsewhere, a new spot cycles 1, 2, 3, then none (5 minus the other tower's 2).
- [ ] Several towers: draft a 2 on one spot, then click another legal spot: the first tower stays (still 2, its badge and button too), the new one starts at its lowest and takes the gold ring. Click the first tower again: it becomes 3 and the gold ring moves back to it.
- [ ] Undo: click a tower's undo button: only that tower goes (and any new tower that only reached the board through it); the tower under the button never gets a disc added. With no tower left, Confirm and Reset turn go away.
- [ ] Undo button: round, at least 32px on screen on desktop and on a phone (also at a small BGA zoom), a soft shadow, a hover ring and glow in your disc color; a tap on it on a phone works the first time. It sits over the row below, never under a tower there.
- [ ] "Show stack heights" Disabled: the towers lose their numbers, the badges keep theirs.
- [ ] Confirm: the undo buttons disappear at once; the towers then fly in as before and the badges go. Reset turn: everything drafted goes. F5 mid-draft: no draft, no badge, no button.
- [ ] The opponent and spectators never see badges or undo buttons.
- [ ] Zombie (kick a player): it still plays a single random tower of a random legal height.
- [ ] No errors in the browser console.

## After M1: steady status bar while drafting

Deploy `modules/` and `nexo.css`; an ongoing table is fine (F5).

- [ ] Phone (or the browser's device mode at 375px wide), your turn: note where the board's top edge sits. Draft a tower, cycle it up, take it back with the undo button, cycle it past its highest, draft a second one, Reset turn: the board's top edge and size never change (Confirm and Reset turn come and go on the second line of the status bar without changing its height).
- [ ] The same on desktop, with the window narrow enough that the title and buttons share one line, and wide.
- [ ] Nothing visible or clickable where the invisible button sits (no gap before Confirm, no focus ring when tabbing through the status bar).
- [ ] Confirm still works; the opponent's turn and the game end look as before.

## After M1: confirm on the board

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). Supersedes "After M1: steady status bar while drafting" (the invisible status bar button is gone).

- [ ] Your turn: the status bar shows only "You must place 1 to N discs", never Confirm or Reset turn, at any point of the draft.
- [ ] Phone (or device mode at 375px) and desktop: note the board's top edge, then draft a tower, cycle it, draft a second, undo one, cycle one past its highest, confirm: the board's frame never moves or resizes (the towers may still slide inside it as the draft re-centres).
- [ ] One drafted tower: under it, side by side and centred, a neutral round undo button (curved arrow) and a green confirm button (white tick), the same size, a small gap between, both at least 32px on screen, with a shadow, over the row below.
- [ ] Two drafted towers: only the one clicked last has the gold ring and the two buttons; the other shows its discs and badge only. Click the other (it gains a disc): the ring and buttons move to it.
- [ ] History: draft A, then B, then C, then click A again (A active). Undo A: C is active. Undo C: B is active. Cycle B past its highest: no tower left, no buttons. Same with cycling instead of undo at each step.
- [ ] Undo of a tower that links two others to the board: the cut-off towers go too, and the buttons move to the last clicked tower still drafted.
- [ ] Tap undo, tap confirm, tap the gap between them: the tower under the buttons never gets a disc added.
- [ ] Edges: a drafted tower in the board's leftmost or rightmost column keeps both buttons wholly inside the board (nudged sideways); one on the bottom row shows them above the tower instead. Use `debug_fillBoard` with a few empty spots to reach the edges.
- [ ] Confirm: both buttons grey out at once; double-tapping confirm sends one turn only (one log row). Then the towers fly in and the badges and buttons disappear.
- [ ] A refused turn can't be reached through the UI (the draft only offers legal moves). To check the recovery, block the request in the browser's dev tools (Network > Block request URL for `actPlaceTowers`) and confirm: BGA shows an error, the buttons come back usable, and confirming again with the block removed works.
- [ ] The opponent, spectators and replays never see these buttons. F5 mid-draft: no draft, no buttons.
- [ ] No errors in the browser console.

## After M1: board frozen while drafting

Deploy `modules/` only; an ongoing table is fine (F5).

- [ ] Your turn: draft a tower on the edge of the cluster (new legal spots appear beyond it): the board does not move, even if it now looks off-centre. Cycle it, draft a second tower, switch the active tower, undo: still no movement at any point.
- [ ] Draft on a legal spot that only appeared because of your own drafted tower: it works, and the turn confirms.
- [ ] Undo every drafted tower: nothing moves.
- [ ] Confirm: your towers fly in onto the board as it is, then the board slides to its new centre in about 0.3s, easing out, no jump.
- [ ] Edge: from a single tower (or on the first turn), draft a line of 1-disc towers in one direction: once the next legal spot would fall outside the board, the board slides just enough to keep every tower and legal spot inside (never cut off). Undo them all: it slides back.
- [ ] The opponent's turn (as the passive player and as a spectator) and a replay: the board re-centres once their towers have landed, with the same short slide. Fast replay: no slide, the board just ends centred.
- [ ] Phone (375px) and desktop: nothing outside the board moves during the draft.
- [ ] No errors in the browser console.

## After M1: placeholders stay until their discs land

Deploy `modules/` only; an ongoing table is fine (F5).

- [ ] Your turn, one 1-disc tower: confirm: the semi-transparent placeholder stays on its spot while the disc flies in, and the solid disc replaces it as it lands, with no gap or flicker.
- [ ] One 3-disc tower: the placeholder's bottom disc turns solid as the first disc lands, then the second, then the top one; the placeholder's upper discs still show over the solid ones below until their own disc lands.
- [ ] "Show stack heights" Enabled: the number stays on the placeholder's top face until the top disc lands, then the solid tower's number takes its place; it never shows a wrong height in between.
- [ ] Several towers (a 2 and a 1, also 4 towers of 1): each placeholder stays until its own spot's discs land; later spots' placeholders wait in place until their turn.
- [ ] A replacement: the enemy tower flies back to its owner's stacks at once while your placeholder stays on the spot until your discs land.
- [ ] Undo and cycling past the highest still remove a drafted tower at once.
- [ ] Instantaneous mode (or a hidden tab when the turn confirms): no placeholder left on the board after the turn.
- [ ] The opponent and spectators: unchanged (they never had placeholders).
- [ ] No errors in the browser console.

## After M1: gap under the board

Deploy `nexo.css` and `modules/` (F5 on an ongoing table is fine).

- [ ] Desktop, page at its top: BGA's top bar at the very top, then the status bar and the board, as before; nothing of BGA's below the board is on screen.
- [ ] Desktop: scroll down: under the board about 40% of the window's height is only the background, then BGA's footer and other content start.
- [ ] Phone (about 375px wide, and a tall phone or device mode such as 390 x 844 or 412 x 915), page at its top: nothing of BGA's below the board shows, only the background under it. Scroll: about half the screen's height of background, then BGA's content.
- [ ] Phone: the gap doesn't move things around noticeably when the browser's address bar hides or shows while scrolling.
- [ ] Click and right-click (tap and long-press on a phone) in the gap: nothing reacts.
- [ ] Resize the window across BGA's mobile switch (about 740px): the gap goes from 40% to 50% and back, the board refits.
- [ ] Nothing jumps once loading ends; F5 at the top and F5 scrolled down come back the same.
- [ ] A replay: the same gap; the replay controls work.
- [ ] The red disc in the background: unchanged on desktop; on a phone it sits in the background under the board, no longer covered by BGA's content.
- [ ] No errors in the browser console.

## After M1: mobile arc

Deploy `nexo.css` (F5 on an ongoing table is fine). Phone held upright, or the browser's device mode at about 375 and 430 px wide (375 x 812, 430 x 932, and a shorter 375 x 667).

- [ ] The black disc covers about half the screen's width at the bottom and about a third at the top, its edge running up behind the board (a 375 x 667 a little less: about 42% and 31%).
- [ ] The edge is one clean, crisp curve (no jagged pixels, no straight-looking line), with the faint rim light inside it and the soft shadow outside; the sheen and veins show on the black like on desktop.
- [ ] Scroll the whole page, the gap under the board included: the disc stays put on the screen.
- [ ] The board, the player boards and the status bar stay readable where they cross the black.
- [ ] The red disc in the bottom-right corner sits on the white side, clear of the black.
- [ ] Scroll down to BGA's content after the gap (footer, links): note whether any of it is hard to read over the black.
- [ ] Turn the phone sideways: the arc is the landscape one (as on desktop). Back upright: the mobile arc again.
- [ ] Desktop, landscape and a tall portrait window: the arc is unchanged.

## After M1: board veins

Deploy `nexo.css` (F5 is fine).

- [ ] Desktop: the board's faint veins run top-left to bottom-right, clearly across the page background's (bottom-left to top-right); the board no longer looks cut out of the background.
- [ ] The board's colour, brightness, light top-left corner, shadow and rounded corners are as before; no edge or empty corner anywhere.
- [ ] Resize the window (small and large board) and try a phone (about 375 and 430 px wide): the veins scale with the board and keep their direction.
- [ ] Towers, legal spots, the undo and confirm buttons all show and work as before.

## After M1: background parallax

Deploy `modules/` and `nexo.css`; no schema change, an ongoing table is fine (F5).

- [ ] Desktop, page at its top: the background looks exactly as before (arc, its shadow, veins, red disc).
- [ ] Scroll down slowly: the black disc drifts left, the marble and the red disc drift left more slowly; it feels like the surface drifting, not sliding. Scroll back up: everything returns, and sits exactly in place at the top.
- [ ] Scroll far down (past about 2300px): the drift stops at its most (black about 90px, marble about 40px); no gap or edge ever shows on the right.
- [ ] At the most drift: the arc's soft shadow still hugs its edge (no white line or doubled shadow between them); text and log rows over the black stay readable.
- [ ] Clicks and scrolling everywhere behave as before (nothing new catches a click); the board, log, player boards and chat stay above the background.
- [ ] Phone (or a window under 768px): the same, smaller (black about 45px, marble about 20px at most).
- [ ] System setting "Reduce motion" on (macOS Accessibility > Display, or iOS): no drift at all, also when switched while the page is open.
- [ ] No jank while scrolling, and no errors in the console.

## After M1: confirm progress ring

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). New strings to translate: "${you} must place 1 to ${count} discs (${left} more available)" and "${you} must place 1 disc (${left} more available)".

- [ ] Your turn with 25 discs: the status bar reads "You must place 1 to 5 discs (5 more available)" before anything is drafted.
- [ ] Draft a 1-disc tower: around the confirm button, a ring of 5 thick segments with small gaps, the first (top right) solid green, 4 pale grey, filling with a quick fade and pop; the button is light green with a green tick and outline, clearly clickable (hover changes it). The title says "(4 more available)".
- [ ] Cycle it to 3: 3 segments filled, "(2 more available)". Draft a 2-disc tower elsewhere (the buttons move to it): 5 filled, the button turns solid green with a white tick and pulses once; "(0 more available)".
- [ ] Undo one tower: its segments fade back to grey with the same pop (only those; the others don't replay), the button is light green again, no pulse. Bring it back to full: one pulse again.
- [ ] Undo every tower, then draft a 3-disc replacement: the buttons appear and the 3 segments fill one after another, fast (about 50ms apart). Nothing animates while nothing changes (hover, waiting), and nothing loops.
- [ ] Over a black tower under the buttons, the grey segments and the gaps still read.
- [ ] Confirm early (2 of 5 discs): the turn goes through.
- [ ] Low reserve (`debug_setReserves(3, 25)`, F5): "You must place 1 to 3 discs (3 more available)", a 3-segment ring. With 1 disc: "You must place 1 disc (1 more available)", a single ring, full and solid after one click.
- [ ] Confirming: the whole pair greys out (ring included) until the server answers.
- [ ] Phone (375px) and desktop: the ring's segments are readable, it never touches the undo button, and stays inside the board at its edges (rightmost column, bottom row). The status bar never changes height while drafting (the board doesn't move).
- [ ] Reduced motion (OS setting) or BGA animations off: no pop, no stagger, no pulse; the ring and the button still change state.
- [ ] No errors in the browser console.

## After M1: short pass log

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). New string to translate: "No valid move, passes" (the old "${you} have no valid move and pass" and "${player_name} has no valid move and passes" are no longer used).

- [ ] Force a pass (`debug_setReserves(0, 25)` while the opponent is active, then let them play): the log row shows only the passer's name and a grey ban sign, on the passer's color bar, no ">>" icon and no sentence.
- [ ] Hover the ban sign: "No valid move, passes".
- [ ] Both sides: on the passer's own page "You" in their color; on the opponent's and a spectator's, the passer's name.
- [ ] A long player name is cut with an ellipsis, the ban sign stays visible after it.
- [ ] Same row after F5, in the mobile table log and in a replay.
- [ ] No errors in the browser console.

## After M1: game result row

Deploy `modules/` (PHP and JS) and `nexo.css`. The new args only reach games that end after the deploy. New strings to translate: "Draw" and "${player_name} wins" (the old "... win with ${score} connected towers" and "... share the victory ..." strings are no longer used).

- [ ] Win (`debug_endGame()` on a board where one player's largest group is bigger): no box inside the row; the row itself is a black-and-white marble, a charcoal trophy at its left and right edges, centred on the two lines; line 1 "name wins", the name in their color and bold, "wins" plain; line 2 only the score, "13-9", a little larger and bolder than line 1, the winner's largest group first, the loser's second.
- [ ] Red wins: the row's red bar on its left edge. Black wins: the black bar. The text reads easily over the marble.
- [ ] On the winner's own page, the loser's and a spectator's: the winner's name (never "You"), so "wins" always fits.
- [ ] Draw (`debug_fillBoard()` until both largest groups tie, then `debug_endGame()`): handshakes at both edges, "Draw" (bold) over "11-11" (larger), the row a marble going from light on the left to dark grey on the right, the neutral bar. It reads as different from a win at a glance.
- [ ] A long winner name is cut with an ellipsis, "wins" stays after it; the trophies stay at the edges.
- [ ] The trophies (handshakes) and the two lines share one centre line, in the vertical middle of the row: no empty band under them, in the desktop log, the mobile table log and the replay log. If BGA shows a timestamp in the row, it doesn't overlap the right icon.
- [ ] The row is compact (about two text lines tall) and looks the same with BGA's dark mode on (the row keeps its own background).
- [ ] F5 after the end, the mobile table log and a replay (from the first move and from near the end): the same box.
- [ ] A table that ended before the PHP deploy (F5 on it, or its replay): still "wins 13-9", the loser's score taken from their score counter.
- [ ] BGA's end-of-game result panel is unchanged and nothing in it shows raw HTML or the plain fallback text.
- [ ] No errors in the browser console.

## After M1: disc icons in the status bar

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). New strings to translate: "${you} must place up to ${discs}" and "${actplayer} must place up to ${discs}" (the old "${you} must place 1 to ${count} discs (${left} more available)", "${you} must place 1 disc (${left} more available)" and "${actplayer} must place towers" are no longer used).

- [ ] Start of my turn with 5 or more discs: "You must place up to" and 5 mini discs in my color, on the text line (not above or below it), each drawn like a board disc (face and edge), with no number on them.
- [ ] Draft a 2-disc tower: the 2 rightmost icons dim (still visible), the 3 next to the text stay full. Add discs, cycle a tower past its highest, undo: the dimmed count always equals the discs drafted, dimming moves leftwards, and undo brightens the leftmost dimmed icon first.
- [ ] Every disc drafted: all 5 icons dimmed. The title's width never changes while drafting, and the board never moves.
- [ ] With 1 disc in reserve (`debug_setReserves(1, 25)`): "You must place up to" and a single icon. With 3: 3 icons.
- [ ] Both colors: red icons when red drafts, black icons when black drafts; the dimmed black icons still read as discs.
- [ ] Opponent's and a spectator's page during my turn: "[my name] must place up to" with the same number of icons, in my color, all full whatever I draft.
- [ ] Phone (375px) and desktop: the title stays on one line (also with a long player name on the opponent's page), and the icons are crisp at BGA's mobile scaling.
- [ ] BGA dark mode: the icons still show on the status bar.
- [ ] The player boards' reserve stacks are unchanged: they don't move while I draft, only when the turn plays.
- [ ] A refused confirm keeps the dimmed icons as they were. F5 during a draft: every icon full again.
- [ ] No errors in the browser console.

## After M1: red disc grows on scroll

Deploy `modules/` and `nexo.css`; no schema change, an ongoing table is fine (F5).

- [ ] Desktop, page at its top: the red disc is smaller than before (70%), in the same place (its centre hasn't moved).
- [ ] Scroll down slowly: it grows smoothly in place, its centre fixed, its shadow growing with it, and drifts left only a little (far less than the marble and the black disc). It is full size (as before this change) when the black disc stops drifting (about 2140px down); scrolling further changes nothing. Scroll back up: it shrinks back to 70% at the top.
- [ ] Full size: never cut off (disc and shadow whole), never over the board, the player boards or the chat bar; the log may cover it, as before.
- [ ] Narrow window until it shrinks or hides (the board's room rule): the 70% start and the growth follow that size.
- [ ] Phone (or a window under 768px): the same, drifting even less (8px at most).
- [ ] System setting "Reduce motion" on: full size at the top and no movement or growth at all, also when switched while the page is open.
- [ ] The black disc, its shadow and the marble still drift as before.

## After M1: red disc drifts further and rises on mobile

Deploy `modules/` and `nexo.css`; no schema change, an ongoing table is fine (F5).

- [ ] Desktop: scrolling down, the red disc drifts left clearly more than before (60px at most, reached about 1875px down), still growing from 70% to 100%; it never moves up or down.
- [ ] Phone, page at its top: the disc is at 70%, where it was (it may sit under BGA's round buttons in the bottom-right corner).
- [ ] Phone, scroll down: it grows, drifts left (32px at most) and rises, smoothly, all three ending together (about 1300px down). At the end it sits well above the round buttons (its rise is twice what would just clear them), inside the screen. Scroll back up: it returns.
- [ ] In the console on the phone (or Chrome's device mode under 768px): `getComputedStyle(document.body).getPropertyValue('--floating-buttons-height')` gives the buttons' height from the screen's bottom (their top edge); compare with the buttons on screen. Note the value.
- [ ] Open and close a chat bubble, rotate the phone: the disc still ends above the buttons.
- [ ] Reduce motion on, phone: the disc shows at 100%, already at that final height, and never moves; if the board leaves no room for it there, it stays clear of the board instead.

## After M1: red disc rises smoothly from the first scroll

Deploy `modules/` and `nexo.css`; no schema change. Use a real phone (the address bar matters), each check from a fresh load (close the tab, open the table again).

- [ ] Fresh load, page at its top: the disc at 70%, where it was; nothing moves by itself in the first few seconds.
- [ ] Fresh load, first scroll down slowly: the disc grows, drifts left and rises smoothly from the very first px, with no jump when the address bar hides. Scroll back up: the same, in reverse.
- [ ] Fresh load, first scroll down fast (a flick): it ends at the same final spot above the round buttons, with no jump on the way.
- [ ] Rotate the phone (both ways), then scroll: the disc is right for the new orientation and smooth again (a change of place right at the rotation is expected).
- [ ] Open a chat bubble while scrolled down: the disc keeps its course; back at the top it takes the new buttons into account.
- [ ] In the console: `getComputedStyle(document.body).getPropertyValue('--floating-buttons-height')` right after load gives the buttons' height already (not 0px).

## After M1: status bar on one line

Deploy `nexo.css`; no server change, an ongoing table is fine (F5). Checked only on a mock status bar in headless Chromium (BGA's real markup and styles aren't available locally), so the real bar needs these checks.

- [ ] Phone around 360px and 400px wide (BGA's mobile layout), my turn: "You must place up to" with the disc icons and BGA's arrow button on the right are on one line; the bar is one line tall, not two.
- [ ] Same widths, my turn: the icons, the text and the arrow button share one vertical centre (no icon or button sitting high or low).
- [ ] Draft discs until every icon is dimmed, then undo them all: the bar's height never changes and the board never moves.
- [ ] Opponent's turn on the phone: "[name] must place up to" with full icons and the arrow button on one line. A long player name: if it doesn't fit, the arrow wraps to a second line rather than overflowing the bar or squashing the text.
- [ ] Game over (BGA's end state, its own buttons if any) and spectator view: buttons wrap to a new line only when they don't fit, never overflow the bar.
- [ ] 768px (tablet or narrow window) and desktop width: the title and anything in `#generalactions` on one line, as before.
- [ ] No errors in the browser console.

## After M1: confirm anyway

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). New strings to translate: "You haven't placed all your discs. Confirm anyway?" and "Cancel" ("Confirm" already exists).

- [ ] Your turn with 5 discs: draft a 3-disc tower and press the confirm button: nothing is sent; a small light card fades in just under it, its arrow pointing at the button: "You haven't placed all your discs. Confirm anyway?", then one line with a neutral "Cancel" on the left and a green "Confirm" on the right. The board doesn't move.
- [ ] "Cancel": the card closes, nothing is sent, the draft is untouched. Open it again and press "Confirm": the turn is sent (the buttons grey out, then the towers fly in).
- [ ] Open it, then press the board's confirm button again: the turn is sent.
- [ ] Open it, then each of: click or tap outside it (the board, the page), Escape, undo, a click on a legal spot, a click on a drafted tower: it closes (and the click still does its own thing). Typing Escape in the chat doesn't close it.
- [ ] Draft all 5 discs: the confirm button sends at once, no card. Same with discs left but nowhere to put them (`debug_fillBoard` with 1 empty spot: fill it with a 1, then confirm with discs left).
- [ ] Placement: on a tower in the bottom row (the buttons sit above it) or with the page scrolled so the button is near the window's bottom, the card opens above the button, arrow pointing down at it. Near the board's left or right edge, the card stays whole inside the game area and the window, its arrow still at the button.
- [ ] Phone (375px): the card is whole on screen, its buttons easy to tap, over the board's towers and the status bar; it follows the button when the page scrolls.
- [ ] Reduced motion (OS setting): the card appears without fading or sliding.
- [ ] Only one card at a time; none left behind after the turn is sent, after F5, or when the turn passes (zombie, timeout).
- [ ] No errors in the browser console.

## After M1: shorter delay between towers

Deploy `modules/`; no schema change, an ongoing table is fine (F5).

- [ ] Opponent's turn with 3 or more towers: each tower's discs start leaving about 30% of the way through the previous tower's flight, so the towers overlap instead of waiting for each other; within a tower the discs still leave 50ms apart, at the same speed as before.
- [ ] A turn with a replacement: the next spot still starts 30% of the way through, the replaced discs land on their owner's stacks and the mover's discs leave their stacks without any disc going to the wrong place.
- [ ] Your own turn: each placeholder disc still hides as its solid disc lands, even with the next tower already flying.
- [ ] The board re-centres, and the next notification (pass banner, game end) plays, only after the last disc of the turn has landed.
- [ ] Fast replay or F5: everything applies at once.

## After M1: marching dashes

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). In the console (`window[0]` on Studio): `window[0].document.querySelectorAll('#nexo-board .spot-ring')` lists the rings' SVGs, `getComputedStyle(window[0].document.querySelector('#nexo-board .spot-ring ellipse')).animationName` gives `spot-ring-march`.

- [ ] Your turn: every legal spot's and replaceable tower's ring looks as before (same size, place, color, 2px dashes, light fill), and its dashes slowly travel around it, about one full trip every 7 seconds, smoothly, with no jump anywhere on the ring and no tilt or change of shape.
- [ ] Draft a tower, cycle it, undo: the rings are redrawn, and their dashes carry on where they were (no restart, all in step).
- [ ] Hover a ring (an empty legal spot, a replaceable tower): it turns solid with the stronger fill and glow, as before.
- [ ] A replaceable tower's ring is still under the tower (only its edge shows around the base), and a click on the tower still drafts on its spot; a click on an empty ring still drafts there.
- [ ] Phone (375px): the rings look as before, the dashes march too, taps work.
- [ ] Reduced motion (OS setting): the rings are dashed and still.
- [ ] The opponent and spectators still see no rings.
- [ ] No errors in the browser console.

## After M1: bigger discs on the board

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). Tune live in the console (`window[0]` on Studio): `window[0].document.documentElement.style.setProperty('--nexo-disc-scale', '1.05')` on desktop (on mobile set it on `window[0].document.body`; above 1.11 it is capped); the edge is `--board-edge-padding` on `#nexo-board` (read again on the next resize).

- [ ] Desktop: discs bigger than before the change (about 15%), with a small, clear gap between side-by-side towers (about 15px on a large window); the outer targets have room between them and the board's left and right edges.
- [ ] 3- and 4-disc towers stay below the tower behind them; a 5-disc tower doesn't reach it either.
- [ ] The height numbers are centred on the top faces and in proportion; the "Always show stack heights" preference still hides them.
- [ ] Your turn: an empty target ring is exactly the size, shape and place of the disc you then draft on it (the drafted disc covers it).
- [ ] A replaceable enemy tower's ring follows its base: the same ellipse a little larger, showing evenly left, right and in front (about 5px beside on desktop, 3px on a phone), never touching a neighbour's ring.
- [ ] Draft a tower: its badge, gold ring, undo and confirm buttons (with the progress ring) are in proportion, on the board, nudged sideways at the left and right edges, above the tower on the bottom row.
- [ ] The largest possible box (4 columns of towers with legal spots on both sides, `debug_fillBoard` then free a column): nothing is cut off; draft a 5-disc tower on the top row of legal spots: its top face is not cut off.
- [ ] Turn animation: every disc flies from the reserve stacks and lands exactly on the board's tower, no jump in size at the end; a replaced tower flies back the same way.
- [ ] End of the game: the largest groups' glows sit under their towers like the replaceable rings and don't run into each other.
- [ ] Phone (375px): the board fits the width, no horizontal scroll; discs a little smaller than the first try (0.87 of a spot instead of 0.94), still a gap between them; rings and buttons tappable.
- [ ] Resize a desktop window down until BGA switches to its mobile layout and back: the board re-centres at once, nothing cut off.
- [ ] The background's red disc is a little bigger than before the change (1.6 board discs), still clear of the board and the player boards on desktop.
- [ ] The log snapshots and the reserve stacks look as before.

## After M1: slower marching dashes

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5).

- [ ] Your turn: the dashes travel around every legal spot's and replaceable tower's ring clearly slower than before (one trip in about 97s on desktop, 83s on a phone), smoothly, all in step, no seam.
- [ ] Draft, cycle and undo towers: the new rings (spots your draft opens) march in step with the others, never starting over.
- [ ] The drafted tower, its count badge, the gold ring under it, the undo and confirm buttons (and the confirm ring) and the towers don't move.
- [ ] Hover a ring: it turns solid with the stronger fill and glow; a click drafts as before.
- [ ] Reduced motion (OS setting): dashed, still rings.
- [ ] `window[0].gameui.debug_ringStyle` is gone (undefined in the console).
- [ ] No errors in the browser console.

## After M1: faster black disc

Deploy `nexo.css` and `modules/`; no schema change, an ongoing table is fine (F5).

- [ ] Desktop, page at its top: the background exactly as before.
- [ ] Scroll down: the black disc's edge, with its shadow, slides left clearly faster than before, still smoothly, and stops about 2140px down, 270px further left; no gap or edge ever shows on the right. Scroll back up: it returns.
- [ ] The marble (40px at most) and the red disc (growth to full size about 2140px down, 60px drift) move exactly as before.
- [ ] Everything over the black stays readable (board, log rows, player boards keep their own light backgrounds); nothing new ends up over the black.
- [ ] Phone (or a window under 768px): the black disc drifts 68px at most (1.5 times before); the red disc grows and rises as before, finishing about 1290px down.

## After M1: red disc starts higher on mobile

Deploy `nexo.css` and `modules/`; no schema change, an ongoing table is fine (F5).

- [ ] Phone, page at its top: the red disc (70%) sits about its own height higher than before, no longer behind BGA's round buttons; behind the board's bottom-right corner if the board ends close enough above it. Note how much of it shows under the board.
- [ ] In the console: `document.querySelector('.background-red-disc').getBoundingClientRect()` and the board's (`#nexo-board`) bottom, to compare; the lift is the disc's height at 70% (about 39px on a typical phone).
- [ ] Scroll down: it grows, drifts left and rises exactly as much as before, just from higher up; it ends inside the screen, never under BGA's header or the status bar pinned at the top.
- [ ] Nothing of the disc shows through the board (the board's corner is rounded: a pixel or two may peek there).
- [ ] Reduce motion on: parked at the new path's end, still, clear of the board.
- [ ] Desktop: no change.

## After M1: red disc starts behind the board on mobile

Deploy `nexo.css` and `modules/`; no schema change, an ongoing table is fine (F5). Supersedes "red disc starts higher on mobile".

- [ ] Phone, fresh load, page at its top: no red disc anywhere (hidden behind the board's bottom-right corner); at most a pixel or two at the board's rounded corner.
- [ ] Scroll down slowly from a fresh load: the disc shows up from behind the board as it scrolls away, growing and drifting left smoothly, then (if the board ends low) rising to just above the round buttons; no jump, the first scroll included.
- [ ] All the way down and back, the disc only ever moves left (or up), never right, whatever the board's height (also with `debug_fillBoard()`, and held sideways).
- [ ] In the console: `document.body.style.getPropertyValue('--red-disc-start-right')` and `'--red-disc-start-bottom'` give the start (px from the window's right and bottom edges to the disc's centre).
- [ ] Reload while scrolled down, then scroll to the top: the disc is behind the board there again.
- [ ] Rotate the phone and back, and play a few turns: still hidden at the top every time.
- [ ] Reduce motion on: the disc is parked at its end, still.
- [ ] Desktop: no change.

## After M1: board no longer shakes

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). Best on Windows or Linux (classic scrollbars; macOS and phones use overlay scrollbars, which never took any width).

- [ ] End of the game (`debug_endGame()`), F5 and live: the board keeps one size, no shaking; resize the window slowly in width and height across the size where the page starts to scroll: the board resizes smoothly and never flips back and forth.
- [ ] Windows/Linux: the page's right edge keeps a scrollbar's room even when nothing scrolls (`scrollbar-gutter: stable`); the layout is otherwise as before.
- [ ] Load (F5): the board still ends up as big as the window allows once BGA has laid out the page (not about 200px short).
- [ ] The status bar's height changes (a long title on a narrow window, the game end message): the board resizes to fit under it.
- [ ] Switch between BGA's desktop and mobile layouts (narrow the window): the board refits and re-centres at once.
- [ ] During a turn's flights and the pass banner, the board doesn't resize.
- [ ] Phone (375px): the board fits the width as before.

## After M1: too high to replace

Deploy `modules/` and `nexo.css`; no server change, an ongoing table is fine (F5). Quick setup: on your turn, draft a tower of 2 discs first, so a 3-disc or taller enemy tower is out of reach (or `debug_setReserves(2, 25)` from Studio's debug menu, then F5). Console (`window[0]` on Studio): `window[0].gameui.debug_towerWarning()` clicks the first tower that answers with a warning (one of your own or an enemy tower too high), `window[0].gameui.debug_towerWarning(x, y)` a given one; `window[0].document.querySelectorAll('#nexo-board .warning-tower')` lists them.

- [ ] Click an enemy tower too high for your discs left: it shakes briefly side to side and settles back exactly in place; a bubble just above it reads "Not enough [disc]: need N, you have M", the disc a small icon in your own color (red or black, like the status bar's), level with the text, with the right numbers (N its height + 1, M the discs you have left this turn), arrow pointing at it.
- [ ] The bubble fades in, stays about 2 seconds, fades out; clicking again while it shows replaces it (one bubble, the shake starts again).
- [ ] Towers near the board's left and right edges: the bubble stays inside the board, its arrow still on the tower; a tower in the top row on a phone: the bubble shows under it.
- [ ] Clicks still work through the bubble's area (it never blocks a click), and the board doesn't change: no tower drafted, nothing sent, nothing in the log.
- [ ] Undo a drafted tower so the same enemy tower becomes affordable: it gets its ring back and a click drafts on it as before.
- [ ] Click one of your own towers on the board: the same shake and bubble, reading "You cannot add [disc] to your own towers" with the disc icon in your color; a second click (on it or another warning tower) replaces the bubble.
- [ ] A drafted tower still takes a disc per click (no warning), a 5-disc enemy tower still does nothing. The opponent, spectators and replays: nothing happens on any tower.
- [ ] Reduced motion (OS setting): no shake, the bubble still shows.
- [ ] Phone (375px): the bubble's text is readable (about 13px), on one line with its disc icon, the shake visible.
- [ ] The status bar's disc icons look as before.
- [ ] No errors in the browser console.

## After M1: flat target rings

Deploy `nexo.css` only (no TS or server change); an ongoing table is fine (F5).

- [ ] Your turn: every empty target ring has the same flat shape as a disc's base, a touch larger than a disc, where a disc's base would sit; draft on one: the drafted disc sits inside it, centred.
- [ ] Enemy towers you can replace: the ring lies around the tower's base like a ring painted on the board, a whole spot wide and a little rounder than a disc, centred under the tower, showing beside it and in front of its bottom disc, its back hidden by the tower, on desktop and on a phone (375px); its fill and dashed outline line up exactly.
- [ ] The dashed lines read clearly, about 2.5px on a desktop and about half that on a phone (375px), never hairline thin, dashes marching evenly with no seam on both; hover still makes a ring solid with its glow.
- [ ] Two replaceable enemy towers side by side: their rings meet at their tips, never overlap; an empty ring next to one keeps a gap. A click anywhere on a target's spot (on a replaceable tower, anywhere on the tower) drafts there.
- [ ] The gold ring under the drafted tower and the end-game glow have the same shape and place as a replaceable tower's ring; empty rings look exactly as before this change.
- [ ] Discs, towers and the board's spacing look exactly as before.

## After M1: wooden discs

Deploy `gamepreferences.jsonc`, `img/wooden_discs.webp`, `modules/` and `nexo.css`, then Studio's game page > "Reload game options configuration". No schema change; open a new table, or F5 an ongoing one after the reload.

- [ ] BGA's preferences menu (the cog) lists "Disc style", Wooden by default; a new player and a spectator see wooden discs.
- [ ] With Wooden on, every disc is wood: the board's towers, the drafted towers, the reserve stacks on both player boards, the status bar's disc icons, the "Not enough" / "own towers" bubble's icon and the log rows' snapshots. Red discs red wood, black discs black wood; neighbouring discs show different grains.
- [ ] Stacks of 2 to 5 discs show each disc on its own: a thin seam between discs (lighter over maroon on red, a dark gap over a grey line on black), the seam lying on the disc's curved edge (no gap or overlap at the sides), on the board, in the stacks and in the log. A 1-disc tower has a soft shadow under it.
- [ ] The height number is white and readable on both colors, on the board and in the log (and hidden with "Show stack heights" Disabled).
- [ ] Draft a tower and click it up to 5 discs, then draft a second one: no disc already drafted changes its grain on any click.
- [ ] Watch the opponent's turn: each disc takes its board grain as it leaves the reserve stack (at the stack's size) and keeps it through the flight; a replaced tower's discs take their stack grains as they land.
- [ ] The status bar's icons keep their grains while drafting (only their dimming changes).
- [ ] No disc shows a sliver of a neighbouring sprite at its edges, at desktop size, on a phone and in the log's small snapshots.
- [ ] Switch to Marble: at once, with no reload, every disc is exactly the old marble look (seams, gradients, shadow); back to Wooden, the same discs get their same grains again. F5 keeps your choice; the opponent's screen follows their own preference.
- [ ] Replay (`replayFrom`) of a game begun before "Disc style" existed: it loads (no `disc_style` error in the console), and switching the preference during the replay applies at once.

## After M1: hand-piled stacks

Deploy `modules/` and `nexo.css`. No server change. Check with both disc styles (Wooden and Marble), on desktop and on a phone.

- [ ] Every stack of 2 to 5 discs looks piled by hand: each disc a hair off to the left or right (1% of its width, about 1px on a desktop board; neighbours never visibly apart) and a hair up or down, none leaning as a whole. The same on the board, the drafted towers, the reserve stacks and the log's snapshots, in proportion on the small ones. The height number sits centred on the top disc.
- [ ] Wooden: every disc's grain runs in its own direction, but the rim, the side and the light (lighter at the back) look the same on every disc. No visible ring where the turned grain meets the rim, at desktop size, on a phone and in the log.
- [ ] Marble: the offsets only; the discs otherwise look exactly as before.
- [ ] Draft a tower and click it up to 5 discs: each click adds a disc on top and none under it moves or changes. Undo and draft it again: it looks exactly the same.
- [ ] Confirm: each disc lands exactly on its drafted copy (no jump when the copy goes), and the tower stays exactly as it looked while drafted.
- [ ] Watch the opponent's turn: each disc leaves its reserve stack exactly from where it sat and lands exactly at its place in the tower, with no snap after landing. A replaced tower's discs land exactly on the reserve stacks' slots.
- [ ] The log's snapshot of a turn shows the board's towers exactly as they look on the board.
- [ ] F5: every stack on the board, in the reserves and in the log looks exactly as before the reload (wooden grain and angle included). The opponent and a spectator see the same stacks. A replay shows the same stacks too.
- [ ] Switch the disc style mid-game, both ways: the offsets stay exactly the same; only the look of the discs changes, at once.
- [ ] The status bar's disc icons stay in a straight row (no offsets).

## After M1: compact log

Deploy `modules/` (PHP and `modules/js/Game.js`) and `nexo.css`. No schema change. Server change: `towersPlaced` carries `log_spots` instead of `board_snapshot`. Check on desktop and on a phone, as both players and as a spectator.

Log rows
- [ ] Each turn is one compact row: the name, then a small tower per tower of the turn, in the order drafted; a replacement is an orange-tinted pill with the old tower faded and crossed, an arrow, the new tower. No words, no board snapshot.
- [ ] The towers look like the board's on those spots (same grains with Wooden); with "Show stack heights" Disabled their numbers go.
- [ ] Every row is one line: the name and its icons side by side, the name whole when the row has room (a three-tower turn shows "fenadoruk0" whole), cut with an ellipsis in the player's color only as far as the icons need (never under about 5 characters), "You" right next to its icons, the full name on hovering it, without stopping the row's towers from hopping.
- [ ] The widest turns (two replacements and a tower; a replacement and three towers) fit on one line at the default desktop log width (towers at full size or a little smaller) and in the mobile table log; on a narrower log the icons shrink, never wrap or overflow.
- [ ] Turn animation, pass and game end rows unchanged.
- [ ] F5 mid-game: every row comes back the same. Replay (`replayFrom`) and an archived game: the same rows.
- [ ] A game begun before this deploy: its earlier rows (logged with `board_snapshot`) show as icon rows too, and their highlight works.

Desktop hover
- [ ] Resting the mouse on a turn's row: after a moment (about 0.1s), every tower that turn touched hops twice, quickly and heavily (about 0.22s a hop, low, no bounce, a barely visible compression on landing and a short rest between hops), then stays still while the mouse stays. Moving within the row does nothing more; leaving and coming back makes them hop again.
- [ ] Skimming quickly down the log makes nothing hop. Pass and game end rows make nothing hop.
- [ ] The dashed target rings (while drafting), the gold ring under the active drafted tower and the end-game glow stay exactly in place while a tower hops; nothing is drawn over them.
- [ ] Moving back onto a row whose towers are still hopping doesn't restart them mid-hop.
- [ ] After the board has grown and re-centred several turns later, hovering an early row makes the right towers hop. In a replay, a row whose spot has no tower yet makes only the existing ones hop, with no error in the console.
- [ ] Hovering the log while drafting doesn't affect the draft; clicks on legal spots and drafted towers still work.
- [ ] With the OS's reduce-motion setting on: the towers briefly brighten instead of hopping.

Touch (phone, and a tablet's desktop log)
- [ ] On a phone, open the log from BGA's floating log button and tap a turn's row: the log window closes first, and once it has closed the turn's towers hop 2 times. The log button opens the log again normally afterwards.
- [ ] If the log does not close: open the console and paste me the warning that starts with "LogHighlightHandler: no way found to collapse the table log" (it lists the window's ids). The towers must still hop.
- [ ] On a tablet's desktop log (no window to close), a tap makes the towers hop 2 times at once.
- [ ] Tapping a pass or game end row does nothing (the log stays open).

Rows look tappable
- [ ] No crosshair in any row's corner, desktop or phone.
- [ ] Phone (iPhone too): pressing a turn row darkens it and shrinks it slightly at once, springing back on release; the log still closes and the towers jump with no extra delay.
- [ ] Phone: the mobile log shows "Tap a move to see it on the board" at its top, just under its title, above the rows and any date header, staying there while the log scrolls: red bold text on a light red tint, after a pointing hand, in a bar about twice as tall as one line of text.
- [ ] Before any row has been tapped on that phone: about every 2 seconds the hand gives a quick press with a small ripple under its fingertip, with a short pause between taps; the text and the rows below never move.
- [ ] Tap any row: the hand stops tapping, the banner stays (same colours). It stays still after closing and reopening the log, after F5 and in other games on that phone. (To see the animation again: `localStorage.removeItem('nexo.logTapHintSeen')` in the console.)
- [ ] With the phone's reduce-motion setting on: the banner shows, the hand never moves.
- [ ] Desktop: no banner.
