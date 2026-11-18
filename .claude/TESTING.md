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
