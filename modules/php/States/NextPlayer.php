<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * NextPlayer.php
 */

declare(strict_types=1);

namespace Bga\Games\Nexo\States;

use Bga\GameFramework\StateType;
use Bga\Games\Nexo\Game;

class NextPlayer extends \Bga\GameFramework\States\GameState
{

    function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 90,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    /**
     * The turn goes to the other player. A player with no valid move (no discs left, or no empty spot to use and no enemy
     * tower they can out-height) must pass: [BGA] the server passes for them, logs it and marks them passed until they
     * place again. The game ends when both players pass consecutively (PASSES_TO_END_GAME passes in a row).
     */
    function onEnteringState(int $activePlayerId) {
        // Give some extra time to the active player when he completed an action
        $this->game->giveExtraTime($activePlayerId);

        for($pass = 0; $pass < PASSES_TO_END_GAME; $pass++){
            $playerID = (int) $this->game->activeNextPlayer();

            if($this->game->tableManager->hasValidMove($playerID))
                return PlaceTowers::class;

            $consecutivePasses = (int) $this->game->bga->globals->inc('consecutivePasses', 1);
            $this->game->DbQuery("UPDATE `player` SET `passed` = 'yes' WHERE `player_id` = $playerID");
            $this->game->bga->tableStats->inc('passes', 1);
            $this->game->bga->playerStats->inc('passes', 1, $playerID);

            $this->bga->notify->all('playerPassed', '${PASS_LOG_STR}', [
                'preserve' => ['player_id', 'reserve'],
                'player_id' => $playerID,
                'reserve' => $this->game->tableManager->getReserve($playerID),
                'PASS_LOG_STR' => $this->game->getPlayerNameById($playerID).' has no valid move and passes', //plain fallback: the client builds the row from player_id
            ]);

            if($consecutivePasses >= PASSES_TO_END_GAME)
                return EndScore::class;
        }

        return EndScore::class; //never expected: the loop ends on its PASSES_TO_END_GAME-th pass
    }
}
