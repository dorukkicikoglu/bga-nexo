/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * types.d.ts
 */
interface NexoPlayer extends Player {
    player_no: number;
    reserve: number;
    passed: boolean; //the player's last turn was an automatic pass
}

interface NexoGamedatas extends Gamedatas<NexoPlayer> {
    // Add here variables you set up in getAllDatas
    towers: NexoTower[];
    rules: NexoRulesData;
    discColorByPlayerColor: Record<string, DiscColor>;
    pref_names?: GamePrefs; //missing in a replay of a game begun before preferences existed (PrefHandler.DEFAULT_PREF_NAMES)
    endGameScoring?: EndGameScoreData;
}

//gamepreferences.jsonc's ids, by name (Game.php $userPrefs)
interface GamePrefs{
    show_stack_heights: number;
    disc_style: number;
}

//material.inc.php's constants, sent once in gamedatas
interface NexoRulesData {
    gridSize: number;
    minTowerHeight: number;
    maxTowerHeight: number;
    maxDiscsPerTurn: number;
}

type DiscColor = 'red' | 'black';

//[BGA] one disc's sprite in img/wooden_discs.webp ("Disc style" Wooden): its column and row, set on the disc as --col / --row
//(BoardHandler.setDiscSprite)
type DiscSprite = { col: number; row: number; };

//a spot of the invisible grid: unbounded integers, the first tower of the game at 0 0, y growing downwards
interface NexoSpot {
    x: number;
    y: number;
}

interface NexoTower extends NexoSpot {
    player_id: number;
    height: number;
}

type PlacementKind = 'new' | 'replace';

//a tower of a confirmed turn, as the server validated it
interface NexoPlacement extends NexoSpot {
    height: number;
    kind: PlacementKind;
    replaced_player_id: number | null;
    replaced_height: number | null;
}

//a tower of the turn being drafted (PlaceTowers), not sent yet. replaced: the enemy tower under it, for a replacement
interface PendingTower extends NexoSpot {
    height: number;
    kind: PlacementKind;
    replaced: NexoTower | null;
}

interface EndGameScoreData {
    winner_ids: number[];
    winning_score: number;
    scores: Record<number, number>;
    groups: Record<number, NexoSpot[][]>; //player_id => every largest group of theirs
}

interface LogRowData { //this is used to return strings containing log-class-tag divs
    log_html: string;
    log_class: string;
}

/*
 * Describe here the types for your state args
 */
interface PlaceTowersArgs {
    reserve: number;
    discsThisTurn: number; //the most discs the active player may use this turn: min(5, reserve)
}

/*
 * Describe here the types for your notif args
 */
interface TowersPlacedArgs {
    player_id: number;
    placements: NexoPlacement[];
    board_snapshot?: string; //the board after the turn, for its log row (NEXOTableManager::getBoardSnapshot): "x,y" + r/b + height per tower, space separated. Missing in turns logged before it existed
    reserves: Record<number, number>;
    scores: Record<number, number>;
}

interface PlayerPassedArgs {
    player_id: number;
    reserve: number;
}

interface DisplayEndGameScoringArgs {
    winner_ids: number[];
    winning_score: number;
    end_result?: 'win' | 'draw'; //missing in a game ended before the result row (an old replay)
    winner_score?: number;
    loser_score?: number; //the other player's largest group (a draw: the same as winner_score)
    endGameScoring: EndGameScoreData;
}
