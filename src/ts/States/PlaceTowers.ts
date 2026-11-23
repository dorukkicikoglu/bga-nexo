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
 * [BGA] The active player drafts their turn on the client, then confirms it. A click on a highlighted spot (an empty spot next to
 * a tower, or an enemy tower they can out-height) drafts a tower there at the lowest legal height (1, or the enemy tower's
 * height + 1); each click on that drafted tower adds one disc, and a click when it is already at the most it may take (5, or
 * every disc left this turn) takes it back, so the next click starts again at the lowest. A turn may hold several towers, so
 * another highlighted spot starts a tower of its own and the others stay. Each drafted tower shows semi-transparent with a
 * count badge. The active tower (the one clicked last that is still drafted: clickHistory) alone has the gold ring and, under
 * it, an undo button that takes it back (with any new tower that no longer reaches the board through the others) and a
 * confirm button, which sends the whole turn (actPlaceTowers, checked again by the server) and is disabled until the server
 * answers. Once the active tower is taken back (undo, or a click past its highest), the one clicked before it is active again. No action buttons in the status bar: they changed its height and moved the board. The status bar keeps
 * one sentence for the whole draft, with one disc icon per disc the turn may use, the drafted ones dimmed (updateTitle); the
 * confirm button's ring shows the same count (BoardHandler.renderPendingControls). Everyone else only sees the status text. The draft lives on this page only: a reload starts it again.
 */
//whether an enemy tower can be replaced with the discs left this turn (getCaptureCheck): needed, its height + 1; available, the
//discs left
export type CaptureCheck = { canCapture: boolean; needed: number; available: number; };

export class PlaceTowers {
    private stateArgs: PlaceTowersArgs | null = null;
    private pending: PendingTower[] = [];
    private clickHistory: NexoSpot[] = []; //the drafted towers in the order last clicked, each once: the last one is active (gold ring, buttons)
    private drafting: boolean = false;
    private confirming: boolean = false; //the turn is on its way to the server
    //[BGA] the status bar's disc icons' wooden sprites, by color, one per icon slot: the title is rebuilt on every draft change,
    //and each icon keeps its grain through it (getDiscIconsHTML)
    private statusDiscSprites: Partial<Record<DiscColor, DiscSprite[]>> = {};

    constructor(private game: Game, private bga: Bga<NexoPlayer, NexoGamedatas>) {
    }

    /**
     * This method is called each time we are entering the game state. You can use this method to perform some user interface changes at this moment.
     */
    onEnteringState(args: PlaceTowersArgs, isCurrentPlayerActive: boolean) {
        this.stateArgs = args;
        this.pending = [];
        this.clickHistory = [];
        this.drafting = isCurrentPlayerActive;
        this.confirming = false;

        if(!isCurrentPlayerActive){ //they can't see the draft: every icon stays full
            const activePlayerID = this.bga.players.getActivePlayerId() ?? 0;
            this.bga.statusBar.setTitle(_('${actplayer} must place up to ${discs}'), { discs: this.getDiscIconsHTML(this.game.getDiscColor(activePlayerID), args.discsThisTurn ?? 1, 0) });
            return;
        }

        this.game.boardHandler.setDraftClickHandlers({
            spotClicked: spot => this.spotClicked(spot),
            undoClicked: spot => this.undoClicked(spot),
            confirmClicked: () => this.confirmClicked(),
            warningTowerClicked: spot => this.warningTowerClicked(spot),
        });
        this.update();
    }

    /**
     * This method is called each time we are leaving the game state. You can use this method to perform some user interface changes at this moment.
     */
    onLeavingState(args: PlaceTowersArgs, isCurrentPlayerActive: boolean) {
        this.drafting = false;
        this.confirming = false;
        this.pending = [];
        this.clickHistory = [];
        this.game.confirmPopover.close();
        this.game.boardHandler.setDraftClickHandlers(null);
        this.game.boardHandler.setDraft(null);
    }

    private canDraft(): boolean { return this.drafting && !this.confirming && !this.game.isInterfaceLocked(); }
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
        return this.game.boardHandler.getTowers().filter(tower => this.getCaptureCheck(tower)?.canCapture);
    }

    //[BGA] the board towers a click answers with a warning (warningTowerClicked): those with a sentence in getTowerWarningHTML
    private getWarningTowers(): NexoTower[] {
        return this.game.boardHandler.getTowers().filter(tower => this.getTowerWarningHTML(tower) !== null);
    }

    //[BGA] why a click on this board tower does nothing, as the sentence for its bubble, or null when there is nothing to say (a
    //replaceable tower, which a click drafts on; a 5-disc enemy tower or one already replaced in this draft, which stay as they
    //were). My own towers: no disc goes on them. An enemy tower the discs left can't out-height: the numbers, from the same rule as
    //the rings (getCaptureCheck). ${disc} becomes a disc icon in my color after translation, so a translation may put it
    //anywhere in the sentence
    private getTowerWarningHTML(tower: NexoTower): string | null {
        const discIconHTML = this.getDiscIconsHTML(this.game.getDiscColor(this.game.getMyPlayerID()), 1, 0);
        if(tower.player_id === this.game.getMyPlayerID())
            return _('You cannot add ${disc} to your own towers').replace('${disc}', discIconHTML);

        const check = this.getCaptureCheck(tower);
        if(!check || check.canCapture)
            return null;
        return _('Not enough ${disc}: need ${needed}, you have ${available}')
            .replace('${disc}', discIconHTML).replace('${needed}', check.needed.toString()).replace('${available}', check.available.toString());
    }

    //the one rule for replacing a tower: an enemy tower, not already replaced in this draft, takes its height + 1 discs, never
    //more than a tower's highest height, out of the discs left this turn. null when no number of discs could replace it (my own
    //tower, one already replaced in this draft, or one already as high as a tower goes)
    private getCaptureCheck(tower: NexoTower): CaptureCheck | null {
        if(tower.player_id === this.game.getMyPlayerID() || this.getPendingAt(tower))
            return null;
        const needed = tower.height + 1;
        if(needed > this.game.getRules().maxTowerHeight)
            return null;
        const available = this.getDiscsLeft();
        return { canCapture: needed <= available, needed: needed, available: available };
    }

    private getPendingAt(spot: NexoSpot): PendingTower | undefined {
        return this.pending.find(tower => tower.x === spot.x && tower.y === spot.y);
    }

    //a click on a spot makes its tower the active one: on top of the history, wherever it was
    private activate(spot: NexoSpot): void {
        this.clickHistory = this.clickHistory.filter(clicked => clicked.x !== spot.x || clicked.y !== spot.y);
        this.clickHistory.push({ x: spot.x, y: spot.y });
    }

    //the active tower: the last clicked one still drafted, null with no draft
    private getActiveSpot(): NexoSpot | null {
        return this.clickHistory[this.clickHistory.length - 1] ?? null;
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
    //the highest height, the tower taken back like an undo (the tower clicked before it is active again)
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
            this.activate(spot);
            this.update();
            return;
        }

        const heightOptions = this.getHeightOptions(spot);
        if(heightOptions.length > 0)
            this.addPending(spot, heightOptions[0]);
    }

    //[BGA] called by BoardHandler: a board tower a click can't draft on (getTowerWarningHTML: my own, or an enemy tower too high
    //for the discs left). Nothing changes: the tower shakes and a bubble over it says why. Client only
    private warningTowerClicked(spot: NexoSpot): void {
        if(!this.canDraft())
            return;
        const tower = this.game.boardHandler.getTowerMap().get(BoardRules.key(spot.x, spot.y));
        const messageHTML = tower ? this.getTowerWarningHTML(tower) : null;
        if(messageHTML !== null)
            this.game.boardHandler.showTowerWarning(spot, messageHTML);
    }

    //called by BoardHandler: the active tower's undo button (never also a click on its spot)
    private undoClicked(spot: NexoSpot): void {
        if(this.canDraft() && this.getPendingAt(spot))
            this.removePending(spot);
    }

    private addPending(spot: NexoSpot, height: number): void {
        const target = this.getSpotTarget(spot);
        if(target === undefined || !this.getHeightOptions(spot).includes(height))
            return;

        this.pending.push({ x: spot.x, y: spot.y, height: height, kind: target ? 'replace' : 'new', replaced: target ?? null });
        this.activate(spot);
        this.update();
    }

    //a new tower that no longer reaches the board through the turn's other new towers goes too (BoardRules.keepConnectedPending).
    //Every tower gone leaves the history in update(), so the one clicked before is active again
    private removePending(spot: NexoSpot): void {
        const remaining = this.pending.filter(tower => tower.x !== spot.x || tower.y !== spot.y);
        this.pending = BoardRules.keepConnectedPending(this.game.boardHandler.getTowerMap(), remaining);
        this.update();
    }

    //[BGA] the board's confirm button: sends the turn at once when no more disc can be placed this turn, else asks first
    //(ConfirmPopover: "Confirm anyway?"). Pressed again while the card is open, it confirms
    private confirmClicked(): void {
        if(!this.canDraft() || this.pending.length === 0)
            return;

        const popover = this.game.confirmPopover;
        if(popover.isOpen())
            popover.confirm();
        else if(!this.canPlaceMore())
            this.confirmTurn();
        else popover.open(() => this.confirmTurn());
    }

    //whether a disc can still go somewhere this turn: discs left, and a legal spot, a replaceable tower, or a drafted tower one
    //more click would raise. Every disc drafted, or none placeable (a full board, enemy towers too high), sends the turn at once
    private canPlaceMore(): boolean {
        if(this.getDiscsLeft() === 0)
            return false;
        return this.getLegalNewSpots().length > 0 || this.getReplaceableTowers().length > 0 || this.pending.some(tower => this.getCycleHeights(tower).includes(tower.height + 1));
    }

    //sends the turn once (the buttons are disabled until the server answers). A refused turn (BGA shows the server's message)
    //is editable again; an accepted one ends with towersPlaced and the state change, which clear the draft
    private confirmTurn(): void {
        if(!this.canDraft() || this.pending.length === 0)
            return;

        this.confirming = true;
        this.update();
        const placements = this.pending.map(tower => ({ x: tower.x, y: tower.y, height: tower.height }));
        this.bga.actions.performAction('actPlaceTowers', { placements: JSON.stringify(placements) }).catch(() => {
            if(!this.drafting || !this.confirming)
                return;
            this.confirming = false;
            this.update();
        });
    }

    //redraws everything the draft shows on the board: drafted towers with their badges and buttons, legal spots, replaceable
    //towers, the gold ring
    private update(): void {
        if(!this.drafting)
            return;

        this.game.confirmPopover.close(); //any change to the draft (and sending it) closes "Confirm anyway?"

        //towers taken back leave the history: the last one clicked that is still drafted is active
        this.clickHistory = this.clickHistory.filter(clicked => this.getPendingAt(clicked));

        this.game.boardHandler.setDraft({
            pending: this.pending,
            legalNewSpots: this.getLegalNewSpots(),
            replaceableTowers: this.getReplaceableTowers(),
            warningTowers: this.getWarningTowers(),
            selectedSpot: this.getActiveSpot(),
            discColor: this.game.getDiscColor(this.game.getMyPlayerID()),
            confirming: this.confirming,
            discsUsed: this.getDiscsUsed(),
            discsThisTurn: this.stateArgs?.discsThisTurn ?? 1,
        });
        this.updateTitle();
    }

    //the same sentence for the whole draft, with one disc icon per disc the turn may use, the drafted ones dimmed: only the
    //icons change while drafting, so the status bar never changes width or height (which would move the board)
    private updateTitle(): void {
        const discsThisTurn = this.stateArgs?.discsThisTurn ?? 1;
        const discColor = this.game.getDiscColor(this.game.getMyPlayerID());
        this.bga.statusBar.setTitle(_('${you} must place up to ${discs}'), { discs: this.getDiscIconsHTML(discColor, discsThisTurn, Math.min(this.getDiscsUsed(), discsThisTurn)) });
    }

    //the status bar's allowance: count mini discs in the drafting player's color (Game.scss .status-disc, a one-disc .nexo-tower
    //sized to the text line; a single one is also the disc in the "Not enough discs" bubble), the last usedCount dimmed (.used-status-disc): they dim from the right, so the full ones stay next to
    //the text, and an undo brightens the leftmost dimmed one first. HTML for statusBar.setTitle's args, never part of
    //the translated string
    private getDiscIconsHTML(discColor: DiscColor, count: number, usedCount: number): string {
        const sprites = this.statusDiscSprites[discColor] ??= [];
        while(sprites.length < count)
            sprites.push(BoardHandler.getRandomDiscSprite(discColor));
        let discsHTML = '';
        for(let discIndex = 0; discIndex < count; discIndex++)
            discsHTML += `<span class="nexo-tower status-disc${discIndex >= count - usedCount ? ' used-status-disc' : ''}" data-disc-color="${discColor}"><span class="tower-disc" style="--disc-index: 0; ${BoardHandler.getDiscSpriteStyle(sprites[discIndex])}"></span></span>`;
        return `<span class="status-discs">${discsHTML}</span>`;
    }
}
