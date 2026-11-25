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
 * NEXOTableManager.php
 */

namespace Bga\Games\Nexo;

use Bga\Games\Nexo\Game;
use Bga\GameFramework\UserException;

/**
 * Reads and writes the table state (towers, reserves) and holds every rule of the board. The client's BoardRules.ts
 * mirrors the rule methods (legal spots, heights, groups) for the draft; the server checks the whole turn on confirm.
 * A board is an array "x,y" => ['x' => int, 'y' => int, 'player_id' => int, 'height' => int].
 */
class NEXOTableManager{
    public Game $game;

    function __construct(Game $game) {
        $this->game = $game;
    }

    //every tower on the board, public: spectators get them too
    function getTowers(): array{
        return array_values($this->getBoard());
    }

    function getBoard(): array{
        $towersDB = $this->game->getObjectListFromDB("SELECT `tower_x`, `tower_y`, `player_id`, `height` FROM `towers` ORDER BY `tower_y`, `tower_x`");

        $board = [];
        foreach($towersDB as $towerDB){
            $tower = [
                'x' => (int) $towerDB['tower_x'],
                'y' => (int) $towerDB['tower_y'],
                'player_id' => (int) $towerDB['player_id'],
                'height' => (int) $towerDB['height'],
            ];
            $board[self::cellKey($tower['x'], $tower['y'])] = $tower;
        }
        return $board;
    }

    static function cellKey(int $x, int $y): string{
        return $x.','.$y;
    }

    function getReserves(): array{
        $reserves = [];
        foreach($this->game->getCollectionFromDB("SELECT `player_id`, `reserve` FROM `player`", true) as $playerID => $reserve)
            $reserves[(int) $playerID] = (int) $reserve;
        return $reserves;
    }

    function getReserve(int $playerID): int{
        return (int) $this->game->getUniqueValueFromDB("SELECT `reserve` FROM `player` WHERE `player_id` = $playerID");
    }

    function getPlayerIDs(): array{
        return array_map('intval', $this->game->getObjectListFromDB("SELECT `player_id` FROM `player` ORDER BY `player_no`", true));
    }

    //Nexo is 2 players only
    function getOpponentID(int $playerID): int{
        foreach($this->getPlayerIDs() as $otherPlayerID){
            if($otherPlayerID !== $playerID)
                return $otherPlayerID;
        }
        throw new \Bga\GameFramework\SystemException('No opponent for player '.$playerID);
    }

    //the most discs a player may still use this turn: never more than MAX_DISCS_PER_TURN in a turn, never more than their reserve
    function getDiscsLeftThisTurn(int $reserve, int $discsUsed = 0): int{
        return max(0, min(MAX_DISCS_PER_TURN, $reserve) - $discsUsed);
    }

    //rules

    //min and max x and y of the occupied spots, null for an empty board
    static function getBounds(array $board): ?array{
        if(empty($board))
            return null;

        $xs = array_column($board, 'x');
        $ys = array_column($board, 'y');
        return ['min_x' => min($xs), 'max_x' => max($xs), 'min_y' => min($ys), 'max_y' => max($ys)];
    }

    //whether a tower at x y keeps the grid within GRID_SIZE rows and GRID_SIZE columns
    static function fitsGrid(array $board, int $x, int $y): bool{
        $bounds = self::getBounds($board);
        if($bounds === null)
            return true;

        return max($bounds['max_x'], $x) - min($bounds['min_x'], $x) + 1 <= GRID_SIZE
            && max($bounds['max_y'], $y) - min($bounds['min_y'], $y) + 1 <= GRID_SIZE;
    }

    static function getNeighborKeys(int $x, int $y): array{
        return [self::cellKey($x + 1, $y), self::cellKey($x - 1, $y), self::cellKey($x, $y + 1), self::cellKey($x, $y - 1)];
    }

    /**
     * Empty spots where a new tower may go: orthogonally adjacent to a tower of any color, within the grid. On an empty
     * board, the first tower of the game is exempt: it goes at 0 0 (coordinates are relative, so any spot is the same).
     */
    static function getLegalNewSpots(array $board): array{
        if(empty($board))
            return [['x' => 0, 'y' => 0]];

        $spots = [];
        foreach($board as $tower){
            foreach([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]){
                $x = $tower['x'] + $dx;
                $y = $tower['y'] + $dy;
                $key = self::cellKey($x, $y);
                if(isset($board[$key]) || isset($spots[$key]) || !self::fitsGrid($board, $x, $y))
                    continue;

                $spots[$key] = ['x' => $x, 'y' => $y];
            }
        }
        ksort($spots);
        return array_values($spots);
    }

    //enemy towers $playerID can replace with at most $maxHeight discs: at least one disc higher than them
    static function getReplaceableTowers(array $board, int $playerID, int $maxHeight): array{
        return array_values(array_filter($board, fn(array $tower) => $tower['player_id'] !== $playerID && $tower['height'] + 1 <= min(MAX_TOWER_HEIGHT, $maxHeight)));
    }

    /**
     * Whether the player can make a valid move: discs in reserve and either an empty spot for a new tower or an enemy tower
     * they can out-height. Without one they must pass (NextPlayer does it for them).
     */
    function hasValidMove(int $playerID): bool{
        $maxHeight = min(MAX_TOWER_HEIGHT, $this->getDiscsLeftThisTurn($this->getReserve($playerID)));
        if($maxHeight < MIN_TOWER_HEIGHT)
            return false;

        $board = $this->getBoard();
        return !empty(self::getLegalNewSpots($board)) || !empty(self::getReplaceableTowers($board, $playerID, $maxHeight));
    }

    /**
     * Checks a whole turn sent by the client and returns its placements in order, each with its kind and, for a
     * replacement, the tower it replaces. The turn is checked as a whole ([BGA], see SPEC.md > Turn sequence): every new
     * tower must reach the towers already on the board through towers placed this turn, so the order the towers were
     * drafted in doesn't matter. A spot can only be used once in a turn: replacing a tower placed earlier in the turn
     * would mean replacing your own tower. On an empty board, one of the new towers must be at 0 0.
     */
    function validateTurn(int $playerID, array $placements): array{
        if(count($placements) < 1)
            throw new UserException(clienttranslate('You must place at least one tower'));
        if(count($placements) > MAX_DISCS_PER_TURN)
            throw new UserException(clienttranslate('You cannot place more than 5 discs in a turn'));

        $board = $this->getBoard();
        $reserve = $this->getReserve($playerID);

        $validated = [];
        $discsUsed = 0;
        $newTowersBoard = []; //the new towers of this turn, keyed like a board
        foreach($placements as $placement){
            if(!is_array($placement) || !is_int($placement['x'] ?? null) || !is_int($placement['y'] ?? null) || !is_int($placement['height'] ?? null))
                throw new UserException(clienttranslate('Invalid tower'));

            $x = $placement['x'];
            $y = $placement['y'];
            $height = $placement['height'];
            $key = self::cellKey($x, $y);

            if($height < MIN_TOWER_HEIGHT || $height > MAX_TOWER_HEIGHT)
                throw new UserException(clienttranslate('A tower must be 1 to 5 discs high'));
            if(isset($validated[$key]))
                throw new UserException(clienttranslate('You cannot place discs on top of an existing tower'));

            $discsUsed += $height;
            if($discsUsed > MAX_DISCS_PER_TURN)
                throw new UserException(clienttranslate('You cannot place more than 5 discs in a turn'));
            if($discsUsed > $reserve)
                throw new UserException(clienttranslate('You do not have enough discs in your reserve'));

            $existingTower = $board[$key] ?? null;
            if($existingTower !== null){
                if($existingTower['player_id'] === $playerID)
                    throw new UserException(clienttranslate('You cannot place discs on top of an existing tower'));
                if($height < $existingTower['height'] + 1)
                    throw new UserException(clienttranslate('Your tower must be at least one disc higher than the tower it replaces'));

                $validated[$key] = [
                    'x' => $x,
                    'y' => $y,
                    'height' => $height,
                    'kind' => PLACEMENT_REPLACE,
                    'replaced_player_id' => $existingTower['player_id'],
                    'replaced_height' => $existingTower['height'],
                ];
            } else {
                $newTower = ['x' => $x, 'y' => $y, 'player_id' => $playerID, 'height' => $height];
                $newTowersBoard[$key] = $newTower;
                $validated[$key] = [
                    'x' => $x,
                    'y' => $y,
                    'height' => $height,
                    'kind' => PLACEMENT_NEW,
                    'replaced_player_id' => null,
                    'replaced_height' => null,
                ];
            }
        }

        //[BGA] the very first tower of the game goes at 0 0 (coordinates are relative, so every spot of an empty board is the same)
        if(empty($board) && !isset($newTowersBoard[self::cellKey(0, 0)]))
            throw new UserException(clienttranslate('The first tower of the game must be placed on the centre spot'));

        //replacements keep their spot occupied, so only the new towers change adjacency and the grid's bounds
        $finalBoard = $board + $newTowersBoard;
        if(!self::isConnected($finalBoard))
            throw new UserException(clienttranslate('Every new tower must be orthogonally adjacent to a tower'));

        $bounds = self::getBounds($finalBoard);
        if($bounds['max_x'] - $bounds['min_x'] + 1 > GRID_SIZE || $bounds['max_y'] - $bounds['min_y'] + 1 > GRID_SIZE)
            throw new UserException(clienttranslate('You cannot create a 6th row or a 6th column'));

        return array_values($validated);
    }

    //whether every spot of the board is reachable from every other one orthogonally (an empty board is)
    static function isConnected(array $board): bool{
        if(empty($board))
            return true;

        return count(self::getComponent($board, array_key_first($board))) === count($board);
    }

    //the keys of the spots orthogonally connected to $startKey (itself included), among $board's spots
    static function getComponent(array $board, string $startKey): array{
        $visited = [$startKey => true];
        $queue = [$startKey];
        while(!empty($queue)){
            $tower = $board[array_shift($queue)];
            foreach(self::getNeighborKeys($tower['x'], $tower['y']) as $neighborKey){
                if(isset($board[$neighborKey]) && !isset($visited[$neighborKey])){
                    $visited[$neighborKey] = true;
                    $queue[] = $neighborKey;
                }
            }
        }
        return array_keys($visited);
    }

    /**
     * The player's largest areas of orthogonally connected towers (height doesn't matter): every area of the largest size,
     * each as a list of ['x', 'y'] spots. The score is that size. Empty when they have no tower.
     */
    static function getLargestGroups(array $board, int $playerID): array{
        $ownBoard = array_filter($board, fn(array $tower) => $tower['player_id'] === $playerID);
        ksort($ownBoard);

        $groups = [];
        $grouped = [];
        foreach(array_keys($ownBoard) as $key){
            if(isset($grouped[$key]))
                continue;

            $component = self::getComponent($ownBoard, $key);
            foreach($component as $componentKey)
                $grouped[$componentKey] = true;
            $groups[] = array_map(fn(string $componentKey) => ['x' => $ownBoard[$componentKey]['x'], 'y' => $ownBoard[$componentKey]['y']], $component);
        }

        if(empty($groups))
            return [];

        $largestSize = max(array_map('count', $groups));
        return array_values(array_filter($groups, fn(array $group) => count($group) === $largestSize));
    }

    static function getLargestGroupSize(array $board, int $playerID): int{
        $groups = self::getLargestGroups($board, $playerID);
        return empty($groups) ? 0 : count($groups[0]);
    }

    //end rules

    /**
     * Puts a validated turn on the board: new towers are inserted, replaced towers change owner and height and their discs
     * go back to their owner's reserve. The player's reserve drops by the discs used and they are no longer passed.
     * Returns the discs used and the discs given back.
     */
    function applyTurn(int $playerID, array $placements): array{
        $discsUsed = 0;
        $discsReturned = 0;
        foreach($placements as $placement){
            $x = $placement['x'];
            $y = $placement['y'];
            $height = $placement['height'];
            $discsUsed += $height;

            if($placement['kind'] === PLACEMENT_REPLACE){
                $replacedPlayerID = (int) $placement['replaced_player_id'];
                $replacedHeight = (int) $placement['replaced_height'];
                $this->game->DbQuery("UPDATE `towers` SET `player_id` = $playerID, `height` = $height WHERE `tower_x` = $x AND `tower_y` = $y");
                $this->game->DbQuery("UPDATE `player` SET `reserve` = `reserve` + $replacedHeight WHERE `player_id` = $replacedPlayerID");
                $discsReturned += $replacedHeight;
            } else {
                $this->game->DbQuery("INSERT INTO `towers` (`tower_x`, `tower_y`, `player_id`, `height`) VALUES ($x, $y, $playerID, $height)");
            }
        }

        $this->game->DbQuery("UPDATE `player` SET `reserve` = `reserve` - $discsUsed, `passed` = 'no' WHERE `player_id` = $playerID");

        return ['discs_used' => $discsUsed, 'discs_returned' => $discsReturned];
    }

    //each player's score is their largest group, recomputed for both after every turn (a replacement can split the opponent's)
    function updateScores(): array{
        $board = $this->getBoard();
        $scores = [];
        foreach($this->getPlayerIDs() as $playerID){
            $scores[$playerID] = self::getLargestGroupSize($board, $playerID);
            $this->game->bga->playerScore->set($playerID, $scores[$playerID], null); //null: no framework notif, towersPlaced updates the counters
        }
        return $scores;
    }

    function getPassedPlayerIDs(): array{
        return array_map('intval', $this->game->getObjectListFromDB("SELECT `player_id` FROM `player` WHERE `passed` = 'yes'", true));
    }

    function getDiscsOnBoard(): int{
        return (int) $this->game->getUniqueValueFromDB("SELECT COALESCE(SUM(`height`), 0) FROM `towers`");
    }

    function getTowerCount(): int{
        return (int) $this->game->getUniqueValueFromDB("SELECT COUNT(*) FROM `towers`");
    }
}

?>
