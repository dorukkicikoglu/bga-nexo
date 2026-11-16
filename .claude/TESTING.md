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
- [ ] A 2-player game starts without errors. One player is red, the other black (try a table where your favorite color is black, too).
- [ ] The red player is active first, whatever the seat order.
- [ ] Each player board shows a red or black disc "× 25" and a score of 0. No PASSED stamp.
- [ ] The board is a 9x9 area of faint dots with a dashed outline; only the centre spot has a teal ring for red. Black sees "<name> must place towers" and no rings.
- [ ] `SELECT * FROM towers` is empty; `SELECT player_id, player_color, reserve, passed FROM player`: 25 and `no` each.

Drafting (as the active player):
- [ ] Click the centre spot: it gets a gold ring and the height menu opens next to it with towers 1 to 5 (details: After M1: height menu).
- [ ] Pick 2: a semi-transparent 2-disc tower appears; the panel above the board reads 3 discs left and reserve 23; the title is unchanged; Confirm and Reset turn show. New teal rings appear around it.
- [ ] Place a 1 next to it, then a 1 next to that one (adjacent only to this turn's tower): allowed. With 1 disc left, a click places a 1 at once (no buttons).
- [ ] With 0 discs left, no ring shows; the title stays "You must place 1 to 5 discs" and Confirm is there.
- [ ] Hover a drafted tower: an × shows. Click the middle one of a line of three: it goes, and so does the far one (no longer connected). Reset turn clears everything.
- [ ] Rings never go beyond 5 columns or 5 rows from the towers: build a row of 4 over two turns, then check that only one more column is offered at either end, and the dashed outline shrinks to 5 columns.
- [ ] Confirm: the drafted towers become solid; your reserve drops; your score becomes your largest group (towers, not discs).

The other player's view of a turn (and a spectator's):
- [ ] New towers fly one after another from the mover's reserve disc on their player board to their spots.
- [ ] After each turn the board slides to keep the towers centred; no jump while drafting.
- [ ] The log row reads "name [tower][tower]...", each tower drawn with its height.

Replacements:
- [ ] An enemy tower you can out-height has a pulsing orange ring. Towers as tall as your discs left (or height 5) have none.
- [ ] Click one: the menu's caption shows that tower and "Replace: at least N discs", and its towers start at its height + 1. Once picked, the enemy tower fades under your drafted one.
- [ ] Confirm: on the other screen the enemy tower flies back to its owner's reserve, whose board bounces, then the new one flies in. The owner's reserve goes up by the replaced height. The log shows "[enemy tower, crossed] → [your tower]" on an orange tint.
- [ ] A replacement that splits the opponent's group lowers their score at once.

Server checks (browser console, `bgaPerformAction` / `gameui.bga.actions.performAction('actPlaceTowers', {placements: '...'})`):
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
- [ ] A spectator sees the board, both reserves, PASSED stamps and the log, and no rings or draft panel.
- [ ] Mobile layout (or a narrow window): the board is large and fits the width; the action buttons wrap under the title; nothing overflows horizontally.
- [ ] Statistics at the end (turns, passes, discs placed, towers placed and replaced, discs returned, largest area, towers at the end) look right.
- [ ] No errors in the browser console on load or F5.

## After M1: height menu

Deploy `modules/` and `nexo.css`; no schema change, an ongoing table is fine (F5). Test everything below twice: on desktop, and on a narrow mobile viewport (a phone, or the browser's device toolbar at about 375px wide, which gives BGA's mobile layout).

Opening and choosing:
- [ ] Click or tap a teal spot: a gold ring on the spot and a small menu right next to it, with an arrow pointing at the spot. One button per possible height, each a tower of that height in your color with its number on top; caption "Tower height". Buttons are a comfortable tap size (about 48px on desktop, a little bigger on mobile).
- [ ] The status bar title doesn't change when the menu opens or closes ("You must place 1 to N discs"); no height buttons in the status bar.
- [ ] Click a height: the drafted tower appears and the menu closes. The next menu only offers the heights the discs left allow (after a 3, only 1 and 2).
- [ ] Click an orange-ringed enemy tower: the caption shows that enemy tower and "Replace: at least N discs" (N = its height + 1), and the lowest button is N.
- [ ] A spot with one possible height (1 disc left, or replacing a 4 with exactly 5 left) drafts it at once, with no menu.
- [ ] With the menu open, keys 1 to 5 pick a height it offers (other digits do nothing). Typing digits in the chat does nothing to the board.

Closing and moving:
- [ ] Click outside the menu (empty board area, the log, the page): it closes, nothing drafted, the gold ring goes.
- [ ] Click the same spot again: it closes. Escape: it closes.
- [ ] Click another teal spot or orange tower with the menu open: the menu moves there in one click.
- [ ] Click a drafted tower with the menu open: the tower is taken back and the menu closes.
- [ ] Confirm, Reset turn and the end of the turn close it too.

Placement on screen:
- [ ] On a spot in the top rows of the board (scroll so the board's top is near the top of the window): the menu flips below the spot, the arrow now on its top edge.
- [ ] On a spot near the left or right edge of a narrow window: the menu shifts to stay wholly on screen, the arrow still pointing at the spot.
- [ ] Scroll the page with the menu open: it follows its spot. Resize the window or rotate the phone: same.
- [ ] Mobile: the menu is never under BGA's top bar, never cut by the screen's edges, and its buttons keep their size whatever BGA's zoom.
- [ ] No errors in the browser console.
