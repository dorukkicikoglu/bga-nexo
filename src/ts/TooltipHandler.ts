/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * TooltipHandler.ts
 */
import { Game } from "./Game";

//BGA's default tooltips (addTooltip) on the player boards. Tooltips only reach elements already on the page, with an id
export class TooltipHandler{
    private static readonly TOOLTIP_DELAY = 400;

    constructor(private game: Game) {
        this.addTooltipsToBoards();
	}

    private addTooltipsToBoards(){
        for(const player_id in this.game.players){
            this.game.bga.gameui.addTooltip('reserve-indicator-' + player_id, _('Discs in reserve. Discs of a replaced tower come back here.'), '', TooltipHandler.TOOLTIP_DELAY);
            this.game.bga.gameui.addTooltip('passed-stamp-' + player_id, _('No valid move on the last turn: passed automatically. Back in the game as soon as a move is possible.'), '', TooltipHandler.TOOLTIP_DELAY);

            //BGA's score: the largest group
            const scoreElement = document.getElementById('player_score_' + player_id);
            if(scoreElement)
                this.game.bga.gameui.addTooltip(scoreElement.id, _('Score: the number of towers in your largest area of orthogonally connected towers'), '', TooltipHandler.TOOLTIP_DELAY);
        }
    }
}
