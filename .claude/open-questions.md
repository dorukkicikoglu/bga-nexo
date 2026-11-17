# Nexo: open questions

Questions the rulebook (`misc/Nexo_Rules (EN).pdf`) leaves open, and their answers. Each is marked **[BGA]** in SPEC.md where it differs from or goes beyond the rulebook. Move a question to "Settled" once the publisher (or you) answers it, and fix SPEC.md if the answer differs.

## Open

(none)

## Conflicts between the brief and the rulebook

None found. The brief's rules summary matches the English rulebook. The rulebook's pass condition names two causes ("no discs left in your reserve or ... you cannot replace an opponent's tower"); the brief adds "no legal new spot", which the rulebook implies (a new tower on a legal spot is always a valid move), so both agree.

## Metadata to confirm

- `publisher_bgg_id` 4666 and `publisher_website` https://steffen-spiele.com/: set by you in `gameinfos.jsonc`.
- `estimated_duration`: 20 minutes, a guess (not on the rulebook).
- `bgg_id` 478652: from the brief's BGG link, not checked against BGG.

## Settled

Answered by you on 2026-11-17; each matches the code as built.

1. **Within one turn, can a new tower be adjacent only to a tower placed earlier that same turn?**
   Yes: a new tower may be adjacent to any tower, including one placed earlier in the same turn; the turn is checked as a whole and the drafting order doesn't matter **[BGA]** (`NEXOTableManager::validateTurn()`, `BoardRules.keepConnectedPending()`). Rulebook: "every new tower must be placed orthogonally adjacent (horizontally or vertically) to at least 1 existing tower of any color."
2. **Can a spot taken earlier in the turn be replaced again in the same turn?**
   No: you never replace your own tower (`validateTurn()` rejects a repeated spot; the client never offers it). Rulebook: "Replace an enemy's tower with a new tower." and "You cannot place discs on top of an existing tower!"
3. **Can a replacement tower be placed on an enemy tower that isn't adjacent to anything?**
   No adjacency check, because the case can't happen: every tower on the board except the first is adjacent to another tower, and spots are never emptied. Rulebook: "Except for the first tower, every new tower must be placed orthogonally adjacent [...] to at least 1 existing tower"; the replacement rule asks for no adjacency.
4. **Can a player pass while they still have a valid move?**
   No voluntary pass: a player with a valid move must place; one with no valid move (no discs, or discs but nowhere legal to put them) is passed automatically **[BGA: automatic]**. Rulebook: "On your turn, you must place a minimum of 1 and a maximum of 5 from your reserve." and "If you can no longer make a valid move [...] you must pass."
5. **Where does the first tower go?**
   At 0 0, enforced on the server too **[BGA]**: the grid is invisible and relative, so every spot of an empty board is the same.
6. **A player whose only moves would need more than 5 discs (or more than their reserve) and with no legal empty spot.**
   They have no valid move and pass. Rulebook: "If you can no longer make a valid move – either because you have no discs left in your reserve or because you cannot replace an opponent's tower – you must pass."
7. **Two groups of the same player tied for largest.**
   They score that size, and the end-game highlight shows both **[BGA: highlight]**. Rulebook: "Identify your single largest area of orthogonally connected towers. Each tower of this area scores 1 point."
8. **A height with a single option.**
   A spot with only one legal height (1 disc left, or replacing a 4 with the last 5) drafts that tower at once, with no height menu **[BGA, UI only]**.
