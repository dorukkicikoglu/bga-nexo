# Nexo: game spec for the BGA adaptation

Source: TODO (official rulebook, language, version). Items marked **[BGA]** are deliberate choices for the BGA version, either where the rules are silent or where we knowingly differ from the physical game. Mark anything confirmed with the publisher as **[BGA, confirmed with publisher]** and anything still open as **[BGA, pending publisher confirmation]**.

## Glossary

TODO: one bullet per game term, bold term first, then its meaning and the code name it maps to (table, column, state or class), e.g. `- **Round**: ... (`roundNumber`, `RoundSetup` → `EndRound`).`

## Components

TODO: every physical component with counts.

### Sprite

TODO: for each sprite sheet in `img/`: file, grid (columns x rows), frame size, frame order, the frame index formula, and the `background-size` / `background-position` formulas.

## Setup

TODO: setup by player count. Mark random choices the rulebook leaves to the players **[BGA]**.

## Turn sequence

TODO: numbered steps. Under each step, the **[BGA]** choices (what the server automates, what the client shows).

## Scoring and game end

TODO: scoring, end trigger, tiebreakers (or "ties share the win"), end-game display.

## Zombie mode [BGA]

Level 1 (report it in the Game Metadata Manager): every choice is random among the actions a real player could take there (BGA's level 1: "a random possible action", `getRandomZombieChoice`).
TODO: list each decision point and what the zombie picks from.

## Game options [BGA]

TODO: none yet. For each option: label, constant (`OPTION_...`), id, values, default, and what each value does.

## Preferences [BGA]

TODO: none yet. For each preference: label, id, default, values.

## Hidden information

TODO: what each player sees, what others see (counts instead of ids), and what spectators see.

## BGA states

TODO: one bullet per state: name (type, id: what it does → next state).

## Statistics (stats.jsonc)

TODO: per player and table stats.

## Milestones

TODO: Riviera ran 1. Skeleton (template turned into Riviera's structure, build pipeline, material, DB, setup, `getAllDatas`, static client render, nothing playable), 2. Core loop (playable end to end), 3. game-specific features, 4. Polish (logs, tooltips, stats, end-game display, zombies, progression, preferences, alpha checklist). Adapt to Nexo.
Each milestone gets a status in its heading ("(done, awaiting Studio test)", "(done, tested in Studio)") and a "Notes" list once done: what was built, how it differs from the plan, debug functions, known limits, anything unverified until Studio.
