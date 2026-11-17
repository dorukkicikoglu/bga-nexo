/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * PlaceTowers.ts
 */
import { Game } from "../Game";
import { BoardRules } from "../BoardRules";

/**
 * [BGA] The active player drafts their turn on the client, then confirms it. A click on a highlighted spot (an empty spot next to
 * a tower, or an enemy tower they can out-height) drafts a tower there at the lowest legal height (1, or the enemy tower's
 * height + 1); each click on that drafted tower adds one disc, and a click when it is already at the most it may take (5, or
 * every disc left this turn) takes it back, so the next click starts again at the lowest. A turn may hold several towers, so
 * another highlighted spot starts a tower of its own and the others stay. The tower clicked last keeps the gold ring. Each
 * drafted tower shows semi-transparent with a count badge and an undo button under it that takes it back (with any new tower
 * that no longer reaches the board through the others). "Reset turn" takes them all back, "Confirm" sends the whole turn
 * (actPlaceTowers), which the server checks again. Legal spots are recomputed after every change. The status bar keeps one
 * title for the whole draft. Everyone else only sees the status text. The draft lives on this page only: a reload starts it again.
 */
export class PlaceTowers {
    private stateArgs: PlaceTowersArgs | null = null;
    private pending: PendingTower[] = [];
    private selectedSpot: NexoSpot | null = null; //the drafted tower clicked last (gold ring), null once it is taken back
    private drafting: boolean = false;

    constructor(private game: Game, private bga: Bga<NexoPlayer, NexoGamedatas>) {
    }

    /**
     * This method is called each time we are entering the game state. You can use this method to perform some user interface changes at this moment.
     */
    onEnteringState(args: PlaceTowersArgs, isCurrentPlayerActive: boolean) {
        this.stateArgs = args;
        this.pending = [];
        this.selectedSpot = null;
        this.drafting = isCurrentPlayerActive;

        if(!isCurrentPlayerActive){
            this.bga.statusBar.setTitle(_('${actplayer} must place towers'));
            return;
        }

        this.game.boardHandler.setDraftClickHandlers({
            spotClicked: spot => this.spotClicked(spot),
            undoClicked: spot => this.undoClicked(spot),
        });
        this.update();
    }

    /**
     * This method is called each time we are leaving the game state. You can use this method to perform some user interface changes at this moment.
     */
    onLeavingState(args: PlaceTowersArgs, isCurrentPlayerActive: boolean) {
        this.drafting = false;
        this.pending = [];
        this.selectedSpot = null;
        this.game.boardHandler.setDraftClickHandlers(null);
        this.game.boardHandler.setDraft(null);
    }

    private canDraft(): boolean { return this.drafting && !this.game.isInterfaceLocked(); }
    private getDiscsUsed(): number { return this.pending.reduce((sum, tower) => sum + tower.height, 0); }
    private getDiscsLeft(): number { return Math.max(0, (this.stateArgs?.discsThisTurn ?? 0) - this.getDiscsUsed()); }

    //the towers on the board plus the draft's new towers: what adjacency and the grid's bounds are checked against
    private getDraftOccupied(): Map<string, NexoSpot> {
        const occupied = new Map<string, NexoSpot>(this.game.boardHandler.getTowerMap());
        for(const tower of this.pending){
            if(tower.kind === 'new')
                occupied.set(BoardRules.key(tower.x, tower.y), tower);
        }
        return occupied;
    }

    private getLegalNewSpots(): NexoSpot[] {
        if(this.getDiscsLeft() < this.game.getRules().minTowerHeight)
            return [];
        return this.game.boardRules.getLegalNewSpots(this.getDraftOccupied());
    }

    //enemy towers on the board, not already replaced in this draft, that the discs left can out-height
    private getReplaceableTowers(): NexoTower[] {
        const maxHeight = Math.min(this.game.getRules().maxTowerHeight, this.getDiscsLeft());
        const myPlayerID = this.game.getMyPlayerID();
        return this.game.boardHandler.getTowers().filter(tower => tower.player_id !== myPlayerID && tower.height + 1 <= maxHeight && !this.getPendingAt(tower));
    }

    private getPendingAt(spot: NexoSpot): PendingTower | undefined {
        return this.pending.find(tower => tower.x === spot.x && tower.y === spot.y);
    }

    //the enemy tower a click on spot would replace (null for an empty spot), or undefined when the spot can't take a tower now
    private getSpotTarget(spot: NexoSpot): NexoTower | null | undefined {
        if(this.getLegalNewSpots().some(legalSpot => legalSpot.x === spot.x && legalSpot.y === spot.y))
            return null;
        return this.getReplaceableTowers().find(tower => tower.x === spot.x && tower.y === spot.y);
    }

    //the heights a tower may have on a spot with no drafted tower: from 1 (or the enemy tower's height + 1) up to the discs left
    private getHeightOptions(spot: NexoSpot): number[] {
        const target = this.getSpotTarget(spot);
        if(target === undefined)
            return [];
        return this.game.boardRules.getHeightOptions(target ? target.height : null, this.getDiscsLeft());
    }

    //the heights a drafted tower cycles through: the same rule, with its own discs back among the discs left
    private getCycleHeights(tower: PendingTower): number[] {
        return this.game.boardRules.getHeightOptions(tower.replaced ? tower.replaced.height : null, this.getDiscsLeft() + tower.height);
    }

    //called by BoardHandler, on a highlighted spot or a drafted tower: a new tower at its lowest height, one more disc, or, past
    //the highest height, the tower taken back
    private spotClicked(spot: NexoSpot): void {
        if(!this.canDraft())
            return;

        const pendingTower = this.getPendingAt(spot);
        if(pendingTower){
            const nextHeight = pendingTower.height + 1;
            if(!this.getCycleHeights(pendingTower).includes(nextHeight)){
                this.removePending(spot);
                return;
            }
            this.pending = this.pending.map(tower => tower === pendingTower ? { ...tower, height: nextHeight } : tower);
            this.selectedSpot = { x: spot.x, y: spot.y };
            this.update();
            return;
        }

        const heightOptions = this.getHeightOptions(spot);
        if(heightOptions.length > 0)
            this.addPending(spot, heightOptions[0]);
    }

    //called by BoardHandler: a drafted tower's undo button (never also a click on its spot)
    private undoClicked(spot: NexoSpot): void {
        if(this.canDraft() && this.getPendingAt(spot))
            this.removePending(spot);
    }

    private addPending(spot: NexoSpot, height: number): void {
        const target = this.getSpotTarget(spot);
        if(target === undefined || !this.getHeightOptions(spot).includes(height))
            return;

        this.pending.push({ x: spot.x, y: spot.y, height: height, kind: target ? 'replace' : 'new', replaced: target ?? null });
        this.selectedSpot = { x: spot.x, y: spot.y };
        this.update();
    }

    //a new tower that no longer reaches the board through the turn's other new towers goes too (BoardRules.keepConnectedPending)
    private removePending(spot: NexoSpot): void {
        const remaining = this.pending.filter(tower => tower.x !== spot.x || tower.y !== spot.y);
        this.pending = BoardRules.keepConnectedPending(this.game.boardHandler.getTowerMap(), remaining);
        this.update();
    }

    private resetTurn(): void {
        this.pending = [];
        this.selectedSpot = null;
        this.update();
    }

    private confirmTurn(): void {
        if(this.pending.length === 0)
            return;

        const placements = this.pending.map(tower => ({ x: tower.x, y: tower.y, height: tower.height }));
        this.bga.actions.performAction('actPlaceTowers', { placements: JSON.stringify(placements) });
    }

    //redraws everything the draft shows: the board (drafted towers with their badges and undo buttons, legal spots, replaceable
    //towers, the gold ring) and the status bar
    private update(): void {
        if(!this.drafting)
            return;

        if(this.selectedSpot && !this.getPendingAt(this.selectedSpot))
            this.selectedSpot = null;

        this.game.boardHandler.setDraft({
            pending: this.pending,
            legalNewSpots: this.getLegalNewSpots(),
            replaceableTowers: this.getReplaceableTowers(),
            selectedSpot: this.selectedSpot,
            discColor: this.game.getDiscColor(this.game.getMyPlayerID()),
        });
        this.updateStatusBar();
    }

    //the same title for the whole draft, with Confirm and Reset turn once a tower is drafted
    private updateStatusBar(): void {
        this.bga.statusBar.removeActionButtons();

        const discsThisTurn = this.stateArgs?.discsThisTurn ?? 1;
        const title = discsThisTurn > 1 ? _('${you} must place 1 to ${count} discs') : _('${you} must place 1 disc');
        this.bga.statusBar.setTitle(title, { count: discsThisTurn });

        //a real BGA button, invisible and zero wide (.action-row-strut), for the whole draft: the action buttons' line is always
        //one button tall, so the status bar keeps its height when Confirm and Reset turn come and go. Without it, on mobile
        //(where #generalactions::before gives the buttons a line of their own) that line grew a few px with them and pushed
        //the board down. The label is a zero-width space, so the button has a line of text like a real one
        this.bga.statusBar.addActionButton('​', () => {}, { id: 'action-row-strut', classes: 'action-row-strut', color: 'secondary' });

        if(this.pending.length === 0)
            return;

        this.bga.statusBar.addActionButton(_('Confirm'), () => this.confirmTurn(), { id: 'confirm-turn-button' });
        this.bga.statusBar.addActionButton(_('Reset turn'), () => this.resetTurn(), { id: 'reset-turn-button', color: 'secondary' });
    }
}
