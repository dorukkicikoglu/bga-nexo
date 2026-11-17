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
 * Game.php
 *
 * This is the main file for your game logic.
 *
 * In this PHP file, you are going to defines the rules of the game.
 */
declare(strict_types=1);

namespace Bga\Games\Nexo;

use Bga\Games\Nexo\States\PlaceTowers;
use Bga\Games\Nexo\NEXOTableManager;
use Bga\GameFramework\Actions\Debug;

class Game extends \Bga\GameFramework\Table
{
    public NEXOTableManager $tableManager;
    //gamepreferences.jsonc's ids by name, sent as gamedatas.pref_names; PrefHandler.DEFAULT_PREF_NAMES repeats them for replays of older games
    public array $userPrefs = array(
        'show_stack_heights' => 100,
    );

    /**
     * Your global variables labels:
     *
     * Nexo stores its globals with $this->bga->globals:
     * - consecutivePasses: automatic passes in a row since the last turn with a placement; PASSES_TO_END_GAME ends the game
     */
    public function __construct()
    {
        parent::__construct();

        require_once 'material.inc.php';

        // automatically complete notification args when needed
        $this->bga->notify->addDecorator(function(string $message, array $args) {
            if (isset($args['player_id']) && !isset($args['player_name']) && str_contains($message, '${player_name}')) {
                $args['player_name'] = $this->getPlayerNameById($args['player_id']);
            }

            return $args;
        });

        $this->tableManager = new NEXOTableManager($this);
    }

    /**
     * How full the board is: half the share of the GRID_SIZE x GRID_SIZE spots taken, half the share of all discs on the
     * board. Discs on the board only ever go up (a replacement always puts more discs than it gives back), so it never goes
     * back. Capped at 99: the game only reaches 100 when it really ends. Recomputed in NextPlayer.
     */
    public function getGameProgression()
    {
        $spotShare = $this->tableManager->getTowerCount() / (GRID_SIZE * GRID_SIZE);
        $discShare = $this->tableManager->getDiscsOnBoard() / (DISCS_PER_PLAYER * 2);
        $progress = (int) floor(100 * ($spotShare + $discShare) / 2);

        return min(99, max(0, $progress));
    }

    /**
     * Migrate database.
     *
     * You don't have to care about this until your game has been published on BGA. Once your game is on BGA, this
     * method is called everytime the system detects a game running with your old database scheme. In this case, if you
     * change your database scheme, you just have to apply the needed changes in order to update the game database and
     * allow the game to continue to run with your new version.
     *
     * @param int $from_version
     * @return void
     */
    public function upgradeTableDb($from_version)
    {
//       if ($from_version <= 1404301345)
//       {
//            // ! important ! Use `DBPREFIX_<table_name>` for all tables
//
//            $sql = "ALTER TABLE `DBPREFIX_xxxxxxx` ....";
//            $this->applyDbUpgradeToAllDB( $sql );
//       }
//
//       if ($from_version <= 1405061421)
//       {
//            // ! important ! Use `DBPREFIX_<table_name>` for all tables
//
//            $sql = "CREATE TABLE `DBPREFIX_xxxxxxx` ....";
//            $this->applyDbUpgradeToAllDB( $sql );
//       }
    }

    /*
     * Gather all information about current game situation (visible by the current player).
     *
     * The method is called each time the game interface is displayed to a player, i.e.:
     *
     * - when the game starts
     * - when a player refreshes the game page (F5)
     */
    protected function getAllDatas(int $currentPlayerId): array
    {
        $result = [];
        // WARNING: We must only return information visible by the current player (using $currentPlayerId).
        // Nexo has no hidden information: everyone, spectators included, gets the same data.

        // Get information about players.
        // NOTE: you can retrieve some extra field you added for "player" table in `dbmodel.sql` if you need it.
        $result["players"] = $this->getCollectionFromDb("SELECT `player_id`, `player_no`, `reserve`, `passed` FROM `player`");
        $scores = $this->bga->playerScore->getAll();
        foreach($result["players"] as $player_id => $row){
            $result["players"][$player_id]['score'] = $scores[(int) $player_id] ?? 0;
            $result["players"][$player_id]['reserve'] = (int) $row['reserve'];
            $result["players"][$player_id]['passed'] = ($row['passed'] == 'yes') ? true : false;
        }

        $result['towers'] = $this->tableManager->getTowers();
        $result['rules'] = [
            'gridSize' => GRID_SIZE,
            'minTowerHeight' => MIN_TOWER_HEIGHT,
            'maxTowerHeight' => MAX_TOWER_HEIGHT,
            'maxDiscsPerTurn' => MAX_DISCS_PER_TURN,
            'discsPerPlayer' => DISCS_PER_PLAYER,
        ];
        $result['discColorByPlayerColor'] = DISC_COLOR_BY_PLAYER_COLOR;
        $result['pref_names'] = $this->userPrefs;

        $state = $this->gamestate->getCurrentMainState();
        if($state->name == 'gameEnd')
            $result['endGameScoring'] = $this->getEndGameScoring();

        return $result;
    }

    /**
     * This method is called only once, when a new game is launched. In this method, you must setup the game
     *  according to the game rules, so that the game is ready to be played.
     */
    protected function setupNewGame($players, $options = [])
    {
        // Set the colors of the players with HTML color code. The default below is red/green/blue/orange/brown. The
        // number of colors defined here must correspond to the maximum number of players allowed for the gams.
        $gameinfos = $this->getGameinfos();
        $default_colors = $gameinfos['player_colors'];

        foreach ($players as $player_id => $player) {
            // Now you can access both $player_id and $player array
            $query_values[] = vsprintf("(%s, '%s', '%s')", [
                $player_id,
                array_shift($default_colors),
                addslashes($player["player_name"]),
            ]);
        }

        // Create players based on generic information.
        //
        // NOTE: You can add extra field on player table in the database (see dbmodel.sql) and initialize
        // additional fields directly here.
        static::DbQuery(
            sprintf(
                "INSERT INTO `player` (`player_id`, `player_color`, `player_name`) VALUES %s",
                implode(",", $query_values)
            )
        );

        $this->reattributeColorsBasedOnPreferences($players, $gameinfos["player_colors"]);
        $this->reloadPlayersBasicInfos();

        //Setup the initial game situation: an empty board, DISCS_PER_PLAYER discs in each reserve (dbmodel.sql default)
        self::DbQuery("UPDATE `player` SET `reserve` = ".DISCS_PER_PLAYER.", `passed` = 'no'");

        // Init game statistics. largestGroup and towersAtEnd are set by EndScore
        $this->bga->tableStats->init(['turns', 'passes'], 0);
        $this->bga->playerStats->init(['turnsPlayed', 'passes', 'discsPlaced', 'towersPlaced', 'towersReplaced', 'discsReturned', 'largestGroup', 'towersAtEnd'], 0);

        // Init global values with their initial values.
        $this->bga->globals->set('consecutivePasses', 0);

        //the player with the red discs begins (reattributeColorsBasedOnPreferences may have given red to either player)
        $this->gamestate->changeActivePlayer($this->getFirstPlayerID());

        return PlaceTowers::class;
    }

    //utility functions

    //the player with FIRST_DISC_COLOR (red)
    public function getFirstPlayerID(): int{
        $firstPlayerColor = array_search(FIRST_DISC_COLOR, DISC_COLOR_BY_PLAYER_COLOR, true);
        $playerID = $this->getUniqueValueFromDB("SELECT `player_id` FROM `player` WHERE `player_color` = '$firstPlayerColor'");
        if($playerID === null) //never expected: player_colors only holds red and black
            $playerID = $this->getUniqueValueFromDB("SELECT `player_id` FROM `player` ORDER BY `player_no` LIMIT 1");
        return (int) $playerID;
    }

    /**
     * Everything the end of the game shows: each player's score (largest group) and every largest group of theirs, to
     * highlight on the board. Everyone at the top score wins (ties share the victory, no tiebreaker).
     */
    public function getEndGameScoring(): array {
        $board = $this->tableManager->getBoard();

        $scores = [];
        $groups = [];
        foreach($this->tableManager->getPlayerIDs() as $playerID){
            $scores[$playerID] = NEXOTableManager::getLargestGroupSize($board, $playerID);
            $groups[$playerID] = NEXOTableManager::getLargestGroups($board, $playerID);
        }

        $winningScore = max($scores);
        $winnerIDs = array_keys(array_filter($scores, fn(int $score) => $score === $winningScore));

        return [
            'winner_ids' => $winnerIDs,
            'winning_score' => $winningScore,
            'scores' => $scores,
            'groups' => $groups,
        ];
    }

    //end utility functions

    /**
     * Example of debug function.
     * Here, jump to a state you want to test (by default, jump to next player state)
     * You can trigger it on Studio using the Debug button on the right of the top bar.
     */
    #[Debug(reload: true)]
    public function debug_goToState(int $state = 10) {
        $this->gamestate->jumpToState($state);
    }

    // sets both reserves (the current player's, then the opponent's), then re-enters PlaceTowers. A reserve of 0 makes that player pass on their next turn
    #[Debug(reload: true)]
    public function debug_setReserves(int $myReserve = 1, int $opponentReserve = 1) {
        $currentPlayerID = (int) $this->getCurrentPlayerId();
        $opponentID = $this->tableManager->getOpponentID($currentPlayerID);
        self::DbQuery("UPDATE `player` SET `reserve` = ".max(0, min(DISCS_PER_PLAYER, $myReserve))." WHERE `player_id` = $currentPlayerID");
        self::DbQuery("UPDATE `player` SET `reserve` = ".max(0, min(DISCS_PER_PLAYER, $opponentReserve))." WHERE `player_id` = $opponentID");
        $this->gamestate->jumpToState(10); //PlaceTowers
    }

    // fills a GRID_SIZE x GRID_SIZE board from 0 0 with towers of random owners and heights 1 to $maxHeight, leaving $emptySpots
    // random spots empty. Reserves become DISCS_PER_PLAYER minus each player's discs on the board. Then re-enters PlaceTowers
    // for the active player (pass and game end tests)
    #[Debug(reload: true)]
    public function debug_fillBoard(int $emptySpots = 2, int $maxHeight = 2) {
        $playerIDs = $this->tableManager->getPlayerIDs();
        $spots = [];
        for($y = 0; $y < GRID_SIZE; $y++){
            for($x = 0; $x < GRID_SIZE; $x++)
                $spots[] = [$x, $y];
        }
        shuffle($spots);
        $emptyKeys = [];
        foreach(array_slice($spots, 0, max(0, $emptySpots)) as [$x, $y])
            $emptyKeys[NEXOTableManager::cellKey($x, $y)] = true;

        self::DbQuery("DELETE FROM `towers`");
        $discsByPlayer = array_fill_keys($playerIDs, 0);
        foreach($spots as [$x, $y]){
            if(isset($emptyKeys[NEXOTableManager::cellKey($x, $y)]))
                continue;

            $playerID = $playerIDs[bga_rand(0, count($playerIDs) - 1)];
            $height = bga_rand(MIN_TOWER_HEIGHT, max(MIN_TOWER_HEIGHT, min(MAX_TOWER_HEIGHT, $maxHeight)));
            if($discsByPlayer[$playerID] + $height > DISCS_PER_PLAYER)
                $height = MIN_TOWER_HEIGHT;
            $discsByPlayer[$playerID] += $height;
            self::DbQuery("INSERT INTO `towers` (`tower_x`, `tower_y`, `player_id`, `height`) VALUES ($x, $y, $playerID, $height)");
        }

        foreach($discsByPlayer as $playerID => $discs)
            self::DbQuery("UPDATE `player` SET `reserve` = ".max(0, DISCS_PER_PLAYER - $discs).", `passed` = 'no' WHERE `player_id` = $playerID");

        $this->bga->globals->set('consecutivePasses', 0);
        $this->tableManager->updateScores();
        $this->gamestate->jumpToState(10); //PlaceTowers
    }

    // ends the game now, with the end-of-game scoring and highlight
    #[Debug(reload: true)]
    public function debug_endGame() {
        $this->gamestate->jumpToState(98); //EndScore
    }
}
