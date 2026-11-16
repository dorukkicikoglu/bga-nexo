/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * EndGameScoringHandler.ts
 */
import { Game } from "./Game";

//the end of the game: each player's largest group(s) glow on the board (BoardHandler.highlightLargestGroups) and the scores
//are set to their final values. Live from EndScore's displayEndGameScoring, or from gamedatas after a reload
export class EndGameScoringHandler{
    private displayed: boolean = false;

	constructor(private game: Game) { }

    public displayEndGameScore(endGameScoring: EndGameScoreData): void {
        this.displayed = true;
        this.game.boardHandler.highlightLargestGroups(endGameScoring.groups);

        for(const player_id in endGameScoring.scores)
            this.game.players[player_id]?.setScore(endGameScoring.scores[player_id]);
    }

    public isDisplayed(): boolean { return this.displayed; }
}
