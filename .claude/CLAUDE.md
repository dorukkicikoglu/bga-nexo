# Nexo: BGA adaptation

This folder is the BGA Studio project for **Nexo** (TODO: designer, publisher).
Game rules and every design decision live in `.claude/SPEC.md` (imported below, so it loads every session). Read it before writing game logic.
Per-milestone BGA Studio test checklists live in `.claude/TESTING.md`. The current milestone's implementation plan lives in `.claude/plans/`.

@SPEC.md

## Repository and setup

- **GitHub**: https://github.com/dorukkicikoglu/bga-nexo (public, default branch `main`, topic `boardgamearena`).
- **Naming pattern** (every BGA repo of mine: `bga-fugu`, `bga-ninjan`, `bga-odin`, `bga-riviera`, `bga-yaxha`): repo `bga-<game>` in lowercase, description `<Game> game implementation to BoardGameArena.com` (keep "to", it is the same on every repo), public, topic `boardgamearena`, issues/wiki/projects left at GitHub's defaults, no homepage. GitHub shows the licence as "Other" because of `LICENCE_BGA`.
- **README.md**: two lines only, `# bga-nexo` and `[Nexo](https://boardgamearena.com/gamepanel?game=nexo) game implementation for [BoardGameArena.com](https://boardgamearena.com/)`.
- **Repo-level files**: `.gitignore` (copied from Riviera: `.DS_Store`, `*.css.map`, `/.history`, `sftp.json`, `/reference`, `/node_modules`, `.claude/settings.local.json`) and `.gitattributes` (`* text=auto`).
- **Tracked**: the build output (`modules/js/Game.js`, `nexo.css`) and `package-lock.json` are committed like Riviera's; `.claude/` is committed except `settings.local.json`; `.vscode/settings.json` and `.vscode/tasks.json` (a `sass:watch` background task running `npm run watch:scss`, which compiles `src/scss/Game.scss` to `nexo.css`) are committed.
- **Never tracked**: `reference/` (read-only, see below), `.vscode/sftp.json` (BGA Studio credentials), `node_modules/`.
- **SFTP** (`.vscode/sftp.json`, VS Code SFTP extension): host `1.studio.boardgamearena.com`, port 2022, `name` "BGA Nexo", `remotePath` `/nexo/`, `uploadOnSave`, watcher with `autoUpload` and `autoDelete`. Ignores `reference/**`, `misc/psd/**`, `.claude/**`, `.vscode/**`, `.git/**`, `node_modules/**`, `**/*.css.map`, `.history/**`, `**/.DS_Store`.
- **Tooling on this Mac**: the `gh` CLI is not installed; repos are created on github.com by hand and pushed over HTTPS (credentials in the macOS keychain). Topics are set in the GitHub UI.
- **Starting point**: a fresh BGA Studio template. TS and SCSS sources ship in `src-disabled/`; move them to `src/` (`git mv`) at the start of milestone 1, like Riviera. `gameinfos.jsonc` still has the template's placeholders (game name, publisher, players, duration); `bgg_id` reads 478652, not checked yet.

## Reference project: Riviera

`reference/` (inside this repo, gitignored and excluded from SFTP upload, like `misc/psd/`, the Photoshop sources) is my previous BGA game, Riviera, with its own git history and its own `.claude/` docs (`reference/.claude/CLAUDE.md`, `SPEC.md`, `TESTING.md`, `plans/`). **Treat it as read-only.**
**Nexo must be built to look like Riviera's code.** Before creating any file, open the Riviera equivalent and copy its structure, naming, and patterns. When in doubt, do what Riviera does. When Riviera does something a particular way, its `.claude/CLAUDE.md` usually says why; read that before deviating.

Mirror these specifically:

- **Folder layout**: `src/ts/*.ts` and `src/scss/Game.scss` compiled by rollup/sass into `modules/js/Game.js` and `nexo.css`. Same `package.json` scripts, `rollup.config.mjs`, `tsconfig.json`.
- **TS architecture**: one `Game.ts` that owns handler classes, one class per concern in its own file (`PlayerHandler`, `TooltipHandler`, `PrefHandler`, `ModalBoxHandler`, `LogMutationObserver`, `EndGameScoringHandler`, plus Nexo's own handlers), and client state classes under `src/ts/States/`. Reuse Riviera files as-is only where they are truly game-agnostic (ModalBoxHandler, the core of LogMutationObserver, the slide animation helpers in `Game.ts`); everything else is adapted.
- **Logs**: same approach as Riviera (see Conventions > Logs).
- **PHP**: namespace `Bga\Games\Nexo` (already set by the template), `Game.php` + `material.inc.php` + a `NEXOTableManager.php` for reading table state (like Riviera's `RIVTableManager.php`), one class per state in `modules/php/States/` using the `GameState` class API like Riviera's.
- **Notifications**: same decorator in the `Game` constructor, same naming style, same way Riviera animates then resolves notifications on the client. Riviera uses `setupPromiseNotifications({ minDuration: 1 })`: BGA's default holds every notification with log text for 500ms even when nothing animates, so a notification lasts exactly as long as its handler awaits a real animation. A handler with no animation must not await anything.
- **DB**: TODO (Riviera: Deck component with a `cards` table and extra columns, plus its own tables).
- **Code style**: tabs/spaces, brace style, camelCase, type annotations, comment style: match Riviera.
- **Framework version**: Nexo's `bga-framework.d.ts` and `_ide_helper.php` are newer than Riviera's (typed `BgaLibraryName` for `importEsmLib` / `getLibUrl`, shared `AddActionButtonParams` / `PerformActionParams`, among others). Before porting a Riviera framework call, check it against Nexo's own copies; a Riviera workaround may no longer be needed.

## Assets

TODO: one bullet per image in `img/` (sprite grid, frame size, frame order, how `background-position` is computed). Never hardcode per-item sprite positions; compute them from an index (see SPEC.md > Components > Sprite).

## Layout (client)

TODO: game area order, player board contents, animations. One bullet per area, each naming the class or handler that owns it, as in Riviera.

## Workflow rules

- Work milestone by milestone (see `.claude/SPEC.md` > Milestones). Stop at the end of each milestone, write what to test in BGA Studio as a new section of `.claude/TESTING.md`, and tell me.
- Before each milestone, write its plan to `.claude/plans/milestone-N.md` (Riviera's are the model: status line, Context, file-by-file tables with NEW / COPY / ADAPT / EDIT / KEEP / DEL against Riviera, Verification, Questions / conflicts, and the doc diffs it will apply).
- After any TS/SCSS change run `npm run build` and fix all compiler errors before saying you're done.
- Run `php -l` on every PHP file you touch.
- I deploy to BGA Studio and test there myself; I'll paste errors back. Don't invent framework APIs: check `bga-framework.d.ts`, `_ide_helper.php`, and how Riviera does it.
- All player-facing strings go through `clienttranslate()` / `_()`.
- Never use em dashes in UI strings or comments.

## Conventions

Carried over from Riviera because they are framework or BGA facts, not Riviera rules. Add Nexo's own below them.

- **Class prefix**: Nexo's PHP helper classes take the prefix `NEXO` (`NEXOTableManager`, and later managers the same way: Riviera's `RIVUndoManager`, `RIVPowerManager` become `NEXO...`). Never port a `RIV` name unchanged.
- **Glossary**: use the terms in SPEC.md > Glossary in code comments, UI strings and docs. If I use a different word for one of them, treat it as the glossary term.
- **Globals** go through `$this->bga->globals`. Throw `\Bga\GameFramework\SystemException`, not the deprecated `\BgaSystemException`.
- **Score display**: use BGA's default score counter (`bga.playerPanels.getScoreCounter(id)`), not a second `ebg.counter`.
- **Scores on the server**: never touch `player_score` / `player_score_aux` with SQL (BGA's deploy check flags it): always go through `$this->bga->playerScore` (`get`, `getAll`, `getMax`, `set`, `setAll`, `inc`; pass `null` as the message when a game notification updates the counter itself). Don't write the column name in comments either.
- **Statistics** go through `$this->bga->playerStats` / `->tableStats`. Initialize every stat in `setupNewGame`, unless leaving one unset on purpose keeps an average honest.
- **Game options** (`gameoptions.jsonc`): each option id is a named constant in `material.inc.php`, with its values as constants too, read with `$this->bga->tableOptions->get($id)`. It returns `null` on a table created before the option existed, so compare against the non-default value and let `null` fall to the default.
- **Private state args**: per-player data goes in `getArgs()` as `['_private' => [playerId => [...]]]`; the client reads `args._private`. Act methods take the magic `int $currentPlayerId` (multiactive) parameter.
- **Hidden-info notifications**: one `notify->all()` per event, never a `notify->player()` with the secret plus a public twin (that gives the players involved two log rows). The secret goes in the args as `'_private' => [playerId => [...]]`: the framework sends each listed player only their own part, and everyone else, spectators included, gets the args without it. Don't merge it; list `'_private'` in `preserve`. Public args carry ids and counts only. Exception: a notification with no log row whose mere arrival would leak goes through `notify->player()` alone.
- **Ids can reveal identity**: if items are inserted in a fixed order, an id tells what the item is. Never send ids of things a player isn't allowed to see; send counts instead.
- **Simultaneous choices with Undo** (if Nexo has any): store each choice as pending `player` columns in the multiactive state and never apply it there; the last chooser's `setPlayerNonMultiactive` moves to a GAME "reveal" state that applies every choice and sends one notification. Undo re-activates the player (`setPlayersMultiactive([$playerId], '', false)`); the action carries `#[PossibleAction]` + `#[CheckAction(false)]` on the server and `checkAction: false` on the client. Riviera's `RIVUndoManager` / `UndoHandler.ts` are the model.
- **Undoing a logged action**: no `undoSavepoint` / `undoRestorePoint`. Save what the undo needs (with `$this->bga->logs->getCurrentMoveId()` from the action) in a global, put that `move_id` in the logged notification so the row carries `data-move-id`, and on undo restore the DB, `inc(-1)` any stat, call `$this->bga->logs->remove($moveId)` (stored logs: F5, replays), and send a notification with no log text whose handler removes the row already on the page.
- **Logs**: every log type has a `${X_LOG_STR}` server placeholder (plain fallback text as its value, plus `preserve` for the args the row needs), one `LogMutationObserver.createLog*()` method, one `*-log` class, and one `--bg-log-*` variable in `:root` (listed in `$log-types` in `Game.scss`). Only rows that got `a-game-log` show in the game log: one CSS rule hides every other row (BGA's own messages) in `#logs`, the mobile table log (`[id^="chatwindowlogs_zone_tablelog_"]`) and the replay log (`[id^="replaylogs"]`), with `!important` against BGA's inline `display: block`. So a notification whose log text has no `${X_LOG_STR}` placeholder is invisible. Decide any per-row styling (group gaps) from the notification's args, never from neighbouring rows: BGA's hidden rows sit between ours, and `#logs` (newest on top) and the mobile/replay logs (oldest on top) run in opposite orders.
- **Slide animations**: one `Game.animateSlide()` / `animateSlideAway()` pair for anything moving between containers (Riviera's). Measure with `getBoundingClientRect()` and move a copy in `<body>` with one `transform` (translate + scale), converting screen px with the copy's own measured zoom (BGA scales the game area on mobile; `offsetWidth` rounds and drifts). Never animate `left` / `top`. Layout never jumps when items leave: hold container sizes until the animation ends.
- **Never put `transform` on an element you later `cloneNode` to animate**: the clone inherits it and every measurement comes out skewed. Use the separate `translate`, `rotate` and `scale` properties.
- **Animations off**: no animation on F5, in fast replay or a hidden tab (`bgaAnimationsActive()` false), or in replays where noted (`isReplay()`); the end state just applies. Anything awaited is raced against a safety timeout so a notification always ends.
- **One-shot animation classes** (fade-ins, fade-outs, value changes) must be removed once they have played: a leftover one becomes the element's fallback `animation` and replays whenever another animation stops applying.
- **Player board bounce**: one shared class and keyframe for every bounce (Riviera: `.bouncing-player-board`, `0.175s ease-in-out 2`), added by `PlayerHandler.bounceBoard()`, removed on `animationend`.
- **Stacking with BGA**: BGA's fixed status bar is z-index 948, popins 949/950, dialogs 998/999, chat bar and tooltips 2000. A fixed overlay that must sit over the status bar uses 948 and comes later in `<body>`.
- **Mobile sizing**: `gameinfos` keeps `game_interface_width.min` at 740, so BGA lays the game out at 740px or more and scales it down on a phone; sizes on `.mobile_version` are large logical sizes. `Game.isTouchOrMobile()` (BGA's mobile layout or `(hover: none)`) is the touch check, not BGA's `touch-device` class (a touch laptop with a mouse has it too).
- **Tooltips**: they only reach elements already on the page and need an id on each element. **`addTooltipHtml()` wraps its HTML in a `.midSizeDialog` (500px at most)**. Custom-colored tooltips: the root is always a `.tooltip-wrapper` carrying the color, padding and radius; `.dijitTooltipContainer:has(.tooltip-wrapper)` empties BGA's wrapper with `!important` and `border: none` (never `border-color: transparent`). Arrow rules are `.tundra .dijitTooltip:has(...)`, never `.tundra:has(...)`. Every `.dijitTooltip` is at most `calc(100vw - 16px)`, so a `.tooltip-wrapper` never gets a fixed `max-width` and text never `white-space: nowrap` (`width: max-content; max-width: 100%`). **An element with a tooltip inside a button**: call `removeTooltip()` on it before the button goes, since no mouseleave comes.
- **Custom-colored action buttons**: only recolor them. Keep BGA's `.bgabutton` padding so they are as tall as the default buttons; never give them a height. A glyph BGA's font lacks (★) grows the button: wrap it in a `line-height: 0` span. Font Awesome: BGA loads 6.4 as `fa6 fa6-<name>` and 4.7 as `fa`. A layer behind a button's label goes at `z-index: -1` with `isolation: isolate` on the button.
- **Choose-a-player buttons** go through one `Game.addPlayerChoiceButton(playerID, label, callback, params)` (Riviera's): BGA's secondary button plus `.player-choice-button`, colored from an inline `--player-color`, never per-player CSS, with `!important` on the background, border, shadow and color in every state since BGA's gradient comes back on hover and active.
- **Zombies** are level 1 (report it in the Game Metadata Manager): every `zombie()` picks a random possible action with `getRandomZombieChoice()` among exactly the buttons a real player would see there. A zombie that would stay active finishes everything inside the same `zombie()` call, since the framework doesn't call it again.
- **`dbmodel.sql` comments**: put them on their own `--` lines, never after a `;` and never containing a `;`. BGA splits the file into statements itself and silently drops a statement with a trailing comment.
- **Copyright header**: every PHP and TS source file starts with the same header as `Game.php` (BGA checklist).
- **Deleting or renaming PHP files**: SFTP runs with `autoDelete: true`, so a file removed locally is removed on Studio on the next sync. Still check after a delete or rename: the framework loads every class in `modules/php/States/`, and a stale state class collides on its state id (the template's `PlayerTurn.php` takes id 10).
- **State ids**: TODO (list every state with its id here once fixed).

## Keeping the docs current

These files are the project's memory between sessions, so keep them true:

- All docs live in `.claude/` (`CLAUDE.md`, `SPEC.md`, `TESTING.md`, `plans/`), tracked in git (except `settings.local.json`) and excluded from SFTP upload.
- **End of every milestone**: in `.claude/SPEC.md` > Milestones, mark it done, add a short "Notes" list under it (what was built, known bugs, anything deferred), add its test checklist to `.claude/TESTING.md`, then tell me.
- **Whenever I decide something new or change a rule** during a session: update the relevant section of `.claude/SPEC.md` right away, marked **[BGA]** if it differs from the rulebook.
- **New code conventions** (a pattern we settle on, a framework gotcha, how something differs from Riviera): add it to this file.
- When a session has been long or covered several tasks, before wrapping up ask me whether to update the `.claude/` docs with anything from this chat worth keeping.
- Don't rewrite or reorganise these files beyond what changed. Show me the diff of any doc edit.
