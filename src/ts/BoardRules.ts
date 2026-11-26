/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * BoardRules.ts
 */

export type GridBounds = { minX: number; maxX: number; minY: number; maxY: number; };

//the board rules the draft needs (bounds, legal spots, height options, connectivity), the same as NEXOTableManager's (which
//checks the whole turn again on confirm). A board is a Map "x,y" => spot; every method is pure
export class BoardRules {
    constructor(private rules: NexoRulesData) {
    }

    public static key(x: number, y: number): string { return x + ',' + y; }

    public static getBounds(board: Map<string, NexoSpot>): GridBounds | null {
        if(board.size === 0)
            return null;

        const spots = Array.from(board.values());
        return {
            minX: Math.min(...spots.map(spot => spot.x)),
            maxX: Math.max(...spots.map(spot => spot.x)),
            minY: Math.min(...spots.map(spot => spot.y)),
            maxY: Math.max(...spots.map(spot => spot.y)),
        };
    }

    //whether a tower at x y keeps the grid within gridSize rows and gridSize columns
    public fitsGrid(board: Map<string, NexoSpot>, x: number, y: number): boolean {
        const bounds = BoardRules.getBounds(board);
        if(!bounds)
            return true;

        return Math.max(bounds.maxX, x) - Math.min(bounds.minX, x) + 1 <= this.rules.gridSize
            && Math.max(bounds.maxY, y) - Math.min(bounds.minY, y) + 1 <= this.rules.gridSize;
    }

    //empty spots where a new tower may go: orthogonally adjacent to a tower, within the grid. The first tower of the game goes at 0 0
    public getLegalNewSpots(board: Map<string, NexoSpot>): NexoSpot[] {
        if(board.size === 0)
            return [{ x: 0, y: 0 }];

        const spots = new Map<string, NexoSpot>();
        for(const spot of board.values()){
            for(const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
                const x = spot.x + dx, y = spot.y + dy;
                const key = BoardRules.key(x, y);
                if(board.has(key) || spots.has(key) || !this.fitsGrid(board, x, y))
                    continue;
                spots.set(key, { x: x, y: y });
            }
        }
        return Array.from(spots.values());
    }

    //the heights a tower on this spot may have with maxHeight discs left: from 1 (a new tower) or the enemy tower's height + 1
    public getHeightOptions(replacedHeight: number | null, discsLeft: number): number[] {
        const minHeight = (replacedHeight === null) ? this.rules.minTowerHeight : replacedHeight + 1;
        const maxHeight = Math.min(this.rules.maxTowerHeight, discsLeft);
        const heights: number[] = [];
        for(let height = minHeight; height <= maxHeight; height++)
            heights.push(height);
        return heights;
    }

    //the keys of the spots orthogonally connected to startKey (itself included), among board's spots
    public static getComponent(board: Map<string, NexoSpot>, startKey: string): Set<string> {
        const visited = new Set<string>([startKey]);
        const queue = [startKey];
        while(queue.length > 0){
            const spot = board.get(queue.shift());
            for(const neighborKey of [BoardRules.key(spot.x + 1, spot.y), BoardRules.key(spot.x - 1, spot.y), BoardRules.key(spot.x, spot.y + 1), BoardRules.key(spot.x, spot.y - 1)]){
                if(board.has(neighborKey) && !visited.has(neighborKey)){
                    visited.add(neighborKey);
                    queue.push(neighborKey);
                }
            }
        }
        return visited;
    }

    /**
     * [BGA] A player's score on a board: the size of their largest area of orthogonally connected towers (height doesn't matter), 0
     * with no tower. The same rule as NEXOTableManager::getLargestGroupSize() (its getLargestGroups(): the player's own towers only,
     * grouped by getComponent()); used for the scoreboard's preview of a draft (PlaceTowers.getPreviewScores). Change both together
     */
    public static getLargestGroupSize(board: Map<string, NexoTower>, playerID: number): number {
        const ownBoard = new Map<string, NexoSpot>();
        board.forEach((tower, key) => {
            if(Number(tower.player_id) === Number(playerID))
                ownBoard.set(key, tower);
        });

        let largestSize = 0;
        const grouped = new Set<string>();
        for(const key of ownBoard.keys()){
            if(grouped.has(key))
                continue;
            const component = BoardRules.getComponent(ownBoard, key);
            component.forEach(componentKey => grouped.add(componentKey));
            largestSize = Math.max(largestSize, component.size);
        }
        return largestSize;
    }

    /**
     * The draft after a tower of the turn is taken back: replacements stay, and a new tower stays only if it still reaches the
     * towers on the board through the turn's other new towers (the server checks the turn the same way). On an empty board,
     * the new towers reached from the earliest one left stay.
     */
    public static keepConnectedPending(board: Map<string, NexoTower>, pending: PendingTower[]): PendingTower[] {
        const newTowers = pending.filter(tower => tower.kind === 'new');
        if(newTowers.length === 0)
            return pending;

        const occupied = new Map<string, NexoSpot>(board);
        for(const tower of newTowers)
            occupied.set(BoardRules.key(tower.x, tower.y), tower);

        const reached = new Set<string>();
        const startKeys = board.size > 0 ? Array.from(board.keys()) : [BoardRules.key(newTowers[0].x, newTowers[0].y)];
        for(const startKey of startKeys){
            if(!reached.has(startKey))
                BoardRules.getComponent(occupied, startKey).forEach(key => reached.add(key));
        }

        return pending.filter(tower => tower.kind === 'replace' || reached.has(BoardRules.key(tower.x, tower.y)));
    }
}
