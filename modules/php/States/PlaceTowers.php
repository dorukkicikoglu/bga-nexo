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
 * PlaceTowers.php
 */

declare(strict_types=1);

namespace Bga\Games\Nexo\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\Actions\Types\JsonParam;
use Bga\Games\Nexo\Game;
use Bga\Games\Nexo\NEXOTableManager;

/**
 * The active player uses 1 to 5 discs from their reserve, split into one or more towers, each a new tower on an empty
 * spot next to a tower or a replacement of an enemy tower by a higher one. [BGA] The turn is drafted on the client and
 * sent whole on confirm (actPlaceTowers); the server checks every rule again. NextPlayer only comes here when the player
 * has a valid move, so there is no pass action.
 */
class PlaceTowers extends GameState
{
    function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 10,
            type: StateType::ACTIVE_PLAYER,
        );
    }

    //everything is public: the draft limits of the active player (the board itself is in gamedatas and the notifications)
    public function getArgs(): array
    {
        $activePlayerID = (int) $this->game->getActivePlayerId();
        $reserve = $this->game->tableManager->getReserve($activePlayerID);

        return [
            'reserve' => $reserve,
            'discsThisTurn' => $this->game->tableManager->getDiscsLeftThisTurn($reserve),
        ];
    }

    /**
     * The whole turn, in the order the towers were drafted: a JSON list of {x, y, height}.
     */
    #[PossibleAction]
    public function actPlaceTowers(#[JsonParam] array $placements, int $activePlayerId)
    {
        $validatedPlacements = $this->game->tableManager->validateTurn($activePlayerId, array_values($placements));
        $result = $this->game->tableManager->applyTurn($activePlayerId, $validatedPlacements);
        $scores = $this->game->tableManager->updateScores();
        $this->game->bga->globals->set('consecutivePasses', 0);

        $newTowerCount = count(array_filter($validatedPlacements, fn(array $placement) => $placement['kind'] === PLACEMENT_NEW));
        $this->game->bga->tableStats->inc('turns', 1);
        $this->game->bga->playerStats->inc('turnsPlayed', 1, $activePlayerId);
        $this->game->bga->playerStats->inc('discsPlaced', $result['discs_used'], $activePlayerId);
        $this->game->bga->playerStats->inc('towersPlaced', $newTowerCount, $activePlayerId);
        $this->game->bga->playerStats->inc('towersReplaced', count($validatedPlacements) - $newTowerCount, $activePlayerId);
        if($result['discs_returned'] > 0)
            $this->game->bga->playerStats->inc('discsReturned', $result['discs_returned'], $this->game->tableManager->getOpponentID($activePlayerId));

        $heightsLog = array_map(fn(array $placement) => $placement['kind'] === PLACEMENT_REPLACE ? $placement['height'].' (replacing '.$placement['replaced_height'].')' : (string) $placement['height'], $validatedPlacements);
        $this->bga->notify->all('towersPlaced', '${TOWERS_PLACED_LOG_STR}', [
            'preserve' => ['player_id', 'placements'],
            'player_id' => $activePlayerId,
            'placements' => $validatedPlacements,
            'reserves' => $this->game->tableManager->getReserves(),
            'scores' => $scores,
            'TOWERS_PLACED_LOG_STR' => $this->game->getPlayerNameById($activePlayerId).' places towers: '.implode(', ', $heightsLog), //plain fallback: the client builds the row from placements
        ]);

        return NextPlayer::class;
    }

    /**
     * This method is called each time it is the turn of a player who has quit the game (= "zombie" player).
     * Zombie level 1: like a real player's clicks, a random legal spot (an empty spot or an enemy tower it can replace),
     * then a random legal height for it, and the turn is confirmed with that single tower.
     */
    function zombie(int $playerId) {
        $board = $this->game->tableManager->getBoard();
        $maxHeight = min(MAX_TOWER_HEIGHT, $this->game->tableManager->getDiscsLeftThisTurn($this->game->tableManager->getReserve($playerId)));

        $heightsBySpot = [];
        foreach(NEXOTableManager::getLegalNewSpots($board) as $spot)
            $heightsBySpot[NEXOTableManager::cellKey($spot['x'], $spot['y'])] = range(MIN_TOWER_HEIGHT, $maxHeight);
        foreach(NEXOTableManager::getReplaceableTowers($board, $playerId, $maxHeight) as $tower)
            $heightsBySpot[NEXOTableManager::cellKey($tower['x'], $tower['y'])] = range($tower['height'] + 1, $maxHeight);

        if(empty($heightsBySpot) || $maxHeight < MIN_TOWER_HEIGHT) //never expected: NextPlayer passes for a player with no valid move
            return NextPlayer::class;

        $spotKey = $this->getRandomZombieChoice(array_keys($heightsBySpot));
        $height = (int) $this->getRandomZombieChoice($heightsBySpot[$spotKey]);
        [$x, $y] = array_map('intval', explode(',', $spotKey));

        return $this->actPlaceTowers([['x' => $x, 'y' => $y, 'height' => $height]], $playerId);
    }
}
