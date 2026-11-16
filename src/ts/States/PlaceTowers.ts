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
import { BoardHandler } from "../BoardHandler";

/**
 * [BGA] The active player drafts their turn on the client, then confirms it: click a highlighted spot (an empty spot next to a
 * tower, or an enemy tower they can out-height), then pick its height in the popup next to it (HeightMenu: only the heights that
 * are legal and affordable; with a single one, it is placed at once). Clicking the same spot again, outside or Escape closes the
 * popup; another highlighted spot moves it there. The status bar keeps one title for the whole draft. Each drafted tower shows semi-transparent on the board; clicking it
 * takes it back (with any new tower that no longer reaches the board through the others), "Reset turn" takes them all back,
 * "Confirm" sends the whole turn (actPlaceTowers), which the server checks again. Legal spots are recomputed after every
 * change. Everyone else only sees the status text. The draft lives on this page only: a reload starts it again.
 */
export class PlaceTowers {
    private stateArgs: PlaceTowersArgs | null = null;
    private pending: PendingTower[] = [];
    private selectedSpot: NexoSpot | null = null;
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

        this.game.boardHandler.setSpotClickHandler(spot => this.spotClicked(spot));
        this.update();
    }

    /**
     * This method is called each time we are leaving the game state. You can use this method to perform some user interface changes at this moment.
     */
    onLeavingState(args: PlaceTowersArgs, isCurrentPlayerActive: boolean) {
        this.drafting = false;
        this.pending = [];
        this.selectedSpot = null;
        this.game.heightMenu.close();
        this.game.boardHandler.setSpotClickHandler(null);
        this.game.boardHandler.setDraft(null);
        this.hideDraftPanel();
    }

    private getDiscsUsed(): number { return this.pending.reduce((sum, tower) => sum + tower.height, 0); }
    private getDiscsLeft(): number { return Math.max(0, (this.stateArgs?.discsThisTurn ?? 0) - this.getDiscsUsed()); }
    private getReserve(): number { return this.stateArgs?.reserve ?? 0; }

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

    private getHeightOptions(spot: NexoSpot): number[] {
        const target = this.getSpotTarget(spot);
        if(target === undefined)
            return [];
        return this.game.boardRules.getHeightOptions(target ? target.height : null, this.getDiscsLeft());
    }

    //called by BoardHandler: a drafted tower is taken back, the selected spot is unselected, a highlighted spot is selected
    private spotClicked(spot: NexoSpot): void {
        if(!this.drafting || this.game.isInterfaceLocked())
            return;

        if(this.getPendingAt(spot)){
            this.removePending(spot);
            return;
        }

        if(this.selectedSpot && this.selectedSpot.x === spot.x && this.selectedSpot.y === spot.y){
            this.selectedSpot = null;
            this.update();
            return;
        }

        const heightOptions = this.getHeightOptions(spot);
        if(heightOptions.length === 0)
            return;

        //[BGA] a single possible height needs no choice
        if(heightOptions.length === 1){
            this.addPending(spot, heightOptions[0]);
            return;
        }

        this.selectedSpot = { x: spot.x, y: spot.y };
        this.update();
    }

    private addPending(spot: NexoSpot, height: number): void {
        const target = this.getSpotTarget(spot);
        if(target === undefined || !this.getHeightOptions(spot).includes(height))
            return;

        this.pending.push({ x: spot.x, y: spot.y, height: height, kind: target ? 'replace' : 'new', replaced: target ?? null });
        this.selectedSpot = null;
        this.update();
    }

    //a new tower that no longer reaches the board through the turn's other new towers goes too (BoardRules.keepConnectedPending)
    private removePending(spot: NexoSpot): void {
        const remaining = this.pending.filter(tower => tower.x !== spot.x || tower.y !== spot.y);
        this.pending = BoardRules.keepConnectedPending(this.game.boardHandler.getTowerMap(), remaining);
        this.selectedSpot = null;
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

    //redraws everything the draft shows: the board (drafted towers, legal spots, replaceable towers), the draft panel and the status bar
    private update(): void {
        if(!this.drafting)
            return;

        const legalNewSpots = this.getLegalNewSpots();
        const replaceableTowers = this.getReplaceableTowers();
        if(this.selectedSpot && this.getHeightOptions(this.selectedSpot).length === 0)
            this.selectedSpot = null;

        this.game.boardHandler.setDraft({
            pending: this.pending,
            legalNewSpots: legalNewSpots,
            replaceableTowers: replaceableTowers,
            selectedSpot: this.selectedSpot,
            discColor: this.game.getDiscColor(this.game.getMyPlayerID()),
        });
        this.renderDraftPanel();
        this.updateStatusBar();
        this.updateHeightMenu();
    }

    //the same title for the whole draft (a selected spot doesn't change it: its heights are in the height menu), with Confirm and
    //Reset turn once a tower is drafted
    private updateStatusBar(): void {
        this.bga.statusBar.removeActionButtons();

        const discsThisTurn = this.stateArgs?.discsThisTurn ?? 1;
        const title = discsThisTurn > 1 ? _('${you} must place 1 to ${count} discs') : _('${you} must place 1 disc');
        this.bga.statusBar.setTitle(title, { count: discsThisTurn });

        if(this.pending.length === 0)
            return;

        this.bga.statusBar.addActionButton(_('Confirm'), () => this.confirmTurn(), { id: 'confirm-turn-button' });
        this.bga.statusBar.addActionButton(_('Reset turn'), () => this.resetTurn(), { id: 'reset-turn-button', color: 'secondary' });
    }

    //[BGA] the selected spot's heights in a popup next to it (HeightMenu): a choice drafts the tower, a dismissal (a click outside,
    //Escape) unselects the spot. Called after setDraft, so the spot it anchors to is on the page
    private updateHeightMenu(): void {
        const selectedSpot = this.selectedSpot;
        if(!selectedSpot){
            this.game.heightMenu.close();
            return;
        }

        this.game.heightMenu.open({
            spot: selectedSpot,
            heights: this.getHeightOptions(selectedSpot),
            discColor: this.game.getDiscColor(this.game.getMyPlayerID()),
            replacedTower: this.getSpotTarget(selectedSpot) ?? null,
        }, height => this.addPending(selectedSpot, height), () => {
            this.selectedSpot = null;
            this.update();
        });
    }

    //above the board, for the active player only: the discs left this turn (one disc per disc of the turn: used, left, or not
    //affordable with the reserve), the reserve left after this turn and, once a tower is drafted, how to take one back
    private renderDraftPanel(): void {
        const panel = document.getElementById('draft-panel');
        if(!panel)
            return;

        const rules = this.game.getRules();
        const discColor = this.game.getDiscColor(this.game.getMyPlayerID());
        const discsUsed = this.getDiscsUsed();
        const discsThisTurn = this.stateArgs?.discsThisTurn ?? 0;

        let pipsHTML = '';
        for(let discIndex = 0; discIndex < rules.maxDiscsPerTurn; discIndex++){
            const pipClass = discIndex < discsUsed ? 'used-pip' : (discIndex < discsThisTurn ? 'available-pip' : 'unavailable-pip');
            pipsHTML += BoardHandler.createTowerDiv(discColor, 1, 'mini-tower draft-pip ' + pipClass).outerHTML;
        }

        panel.innerHTML = `
            <div class="draft-discs">
                <span class="draft-label">${_('Discs left this turn')}</span>
                <span class="draft-pips">${pipsHTML}</span>
                <b class="draft-count">${this.getDiscsLeft()}</b>
            </div>
            <div class="draft-reserve">
                <span class="draft-label">${_('Reserve')}</span>
                <b class="draft-count">${this.getReserve() - discsUsed}</b>
            </div>
            <div class="draft-hint">${this.pending.length > 0 ? _('Click a tower of this turn to take it back') : ''}</div>
        `;
        panel.classList.add('drafting');
    }

    private hideDraftPanel(): void {
        document.getElementById('draft-panel')?.classList.remove('drafting');
    }
}
