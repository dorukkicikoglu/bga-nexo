/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * GameEnd.ts
 */
import { Game } from "../Game";

/**
 * BGA's final state: the game is over, so the board takes no more clicks and shows no draft.
 */
export class GameEnd {
    constructor(private game: Game, private bga: Bga<NexoPlayer, NexoGamedatas>) {
    }

    /**
     * This method is called each time we are entering the game state. You can use this method to perform some user interface changes at this moment.
     */
    onEnteringState(args: any, isCurrentPlayerActive: boolean) {
        this.game.boardHandler.setDraftClickHandlers(null);
        this.game.boardHandler.setDraft(null);
        this.game.updatePassedStamps(); //the game is over: no PASSED stamp
    }

    /**
     * This method is called each time we are leaving the game state. You can use this method to perform some user interface changes at this moment.
     */
    onLeavingState(args: any, isCurrentPlayerActive: boolean) {
    }
}
