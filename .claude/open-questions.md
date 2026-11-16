# Nexo: open questions

Questions the rulebook (`misc/Nexo_Rules (EN).pdf`) leaves open, with the default we built. Each is marked **[BGA]** in SPEC.md where it applies. Move a question to "Settled" once the publisher (or you) answers it, and fix SPEC.md if the answer differs.

## Open

1. **Within one turn, can a new tower be adjacent only to a tower placed earlier that same turn?**
   Built: **yes.** The server checks the turn as a whole: every new tower must reach the towers already on the board through the turn's other new towers (`NEXOTableManager::validateTurn()`, `isConnected()`), which is the same as "towers resolve in order" for any order that works. Taking a drafted tower back also drops any new tower that no longer connects (`BoardRules.keepConnectedPending()`).
2. **Can a spot taken earlier in the turn be replaced again in the same turn?**
   Built: **no.** It would mean replacing your own tower. A spot is used once per turn (`validateTurn()` rejects a repeated spot; the client never offers it).
3. **Can a replacement tower be placed on an enemy tower that isn't adjacent to anything?**
   Built: **yes, no adjacency check.** The rulebook only asks adjacency of a tower on an empty spot. In practice every tower on the board is connected to the others (spots are never emptied), so it never matters.
4. **Can a player pass while they still have a valid move?**
   Built: **no.** "You must place a minimum of 1": passing is only for a player with no valid move, and it is automatic.
5. **Where does the first tower go?**
   Built: at 0 0. The grid is invisible and relative, so every spot of an empty board is the same; the first player's first click is on the board's centre spot.
6. **A player whose only moves would need more than 5 discs (every enemy tower is height 5, or taller than their reserve allows) and with no empty legal spot.**
   Built: they have no valid move and pass, as the rulebook's "because you cannot replace an opponent's tower" says.
7. **Two groups of the same player tied for largest.**
   Built: the score is that size either way; the end-game highlight shows both groups.
8. **A height with a single option.**
   Built [BGA, UI only]: when a clicked spot allows only one height (1 disc left, or replacing a 4 with the last 5), the tower is drafted at once, with no height menu.

## Conflicts between the brief and the rulebook

None found. The brief's rules summary matches the English rulebook. The rulebook's pass condition names two causes ("no discs left in your reserve or ... you cannot replace an opponent's tower"); the brief adds "no legal new spot", which the rulebook implies (a new tower on a legal spot is always a valid move), so both agree.

## Metadata to confirm

- `publisher_bgg_id` 4666 and `publisher_website` https://steffen-spiele.com/: set by you in `gameinfos.jsonc`.
- `estimated_duration`: 20 minutes, a guess (not on the rulebook).
- `bgg_id` 478652: from the brief's BGG link, not checked against BGG.

## Settled

(none yet)
