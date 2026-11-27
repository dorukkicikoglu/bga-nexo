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

//[BGA] a player's top corner of the board, avatar and reserve (Game.getTopBarSide): the viewer's own on the left, red on the left for a spectator
type TopBarSide = 'left' | 'right';

//what the board's spot size was last computed from (BoardHandler.fitToViewport): the room, in the board's own px, the board's
//span and what the column adds to it across and down (the avatars outside the board, the board's top band), in spots
type FitRoom = { width: number; height: number; boardSize: number; extraX: number; extraY: number; };

//[BGA] where a disc sits, which alone decides its look (BoardHandler.getDiscLook): a board spot (board towers, drafted towers,
//log tower icons: x, y), a player's reserve stack on the board's top edge (x: its index) or a status bar icon (x: its index); level, 0 for the
//bottom disc. Never an id: the same slot always gives the same disc, after a reload and in a replay too
type DiscSlot = { kind: 'board' | 'reserve' | 'status'; x: number; y: number; level: number; };

//[BGA] a disc's look, from its slot (BoardHandler.getDiscLook): its wooden sprite in img/wooden_discs.webp ("Disc style" Wooden:
//column and row) and its hand-piled jitter (x and y offsets from -1 to 1, Game.scss scales them; the wooden grain's rotation in
//degrees), set on the disc once, when it is made, as --col / --row / --jitter-x / --jitter-y / --jitter-rot
type DiscLook = { col: number; row: number; jitterX: number; jitterY: number; rotation: number; };

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
//[BGA] the target rings of the saved board, as if nothing were drafted (PlaceTowers.getSavedBoardSpots), for the scoreboard's highlight
interface SavedBoardSpots {
    legalNewSpots: NexoSpot[];
    replaceableTowers: NexoTower[];
}

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
    log_spots?: NexoSpot[]; //every spot the turn touched, for its log row's highlight on the board (LogHighlightHandler). Missing in turns logged before it existed (the placements' spots are the same)
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
