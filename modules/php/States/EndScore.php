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
 * EndScore.php
 */

declare(strict_types=1);

namespace Bga\Games\Nexo\States;

use Bga\GameFramework\StateType;
use Bga\Games\Nexo\Game;

const ST_END_GAME = 99;

class EndScore extends \Bga\GameFramework\States\GameState
{

    function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 98,
            type: StateType::GAME,
        );
    }

    /**
     * Both players passed in a row: each scores their single largest area of orthogonally connected towers, 1 point per
     * tower whatever its height (the scores are already up to date after every turn). Everyone gets each player's largest
     * group(s) to highlight on the board and one log row naming the winner(s); a tie shares the victory.
     */
    public function onEnteringState() {
        $this->game->tableManager->updateScores();
        $endGameScoring = $this->game->getEndGameScoring();

        $board = $this->game->tableManager->getBoard();
        foreach($endGameScoring['scores'] as $playerID => $score){
            $this->game->bga->playerStats->set('largestGroup', $score, $playerID);
            $this->game->bga->playerStats->set('towersAtEnd', count(array_filter($board, fn(array $tower) => $tower['player_id'] === $playerID)), $playerID);
        }

        //the result row: a win (one top score) shows "winner_score-loser_score", a draw (both at the top score) the tied score
        $endResult = (count($endGameScoring['winner_ids']) > 1) ? 'draw' : 'win';
        $winnerScore = (int) $endGameScoring['winning_score'];
        $loserScore = (int) min($endGameScoring['scores']);
        $score = $winnerScore.'-'.$loserScore;
        $gameEndLogStr = ($endResult === 'draw') ? 'Draw '.$score : $this->game->getPlayerNameById($endGameScoring['winner_ids'][0]).' wins '.$score;

        $this->bga->notify->all('displayEndGameScoring', '${GAME_END_LOG_STR}', [
            'preserve' => ['winner_ids', 'winning_score', 'end_result', 'winner_score', 'loser_score'],
            'winner_ids' => $endGameScoring['winner_ids'],
            'winning_score' => $endGameScoring['winning_score'],
            'end_result' => $endResult,
            'winner_score' => $winnerScore,
            'loser_score' => $loserScore,
            'endGameScoring' => $endGameScoring,
            'GAME_END_LOG_STR' => $gameEndLogStr, //plain fallback: the client builds the row from end_result and the scores
        ]);

        return ST_END_GAME;
    }
}
