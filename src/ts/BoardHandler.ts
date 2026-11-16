/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * BoardHandler.ts
 */
import { Game } from "./Game";
import { BoardRules, GridBounds } from "./BoardRules";

//what the turn being drafted shows on the board (PlaceTowers, for the active player only)
export type DraftView = {
    pending: PendingTower[];
    legalNewSpots: NexoSpot[];
    replaceableTowers: NexoTower[];
    selectedSpot: NexoSpot | null;
    discColor: DiscColor;
};

/**
 * The board: a window of (2 * gridSize - 1) x (2 * gridSize - 1) spots (9 x 9), anchored on the first tower (0 0, the
 * window's centre) for the whole game, so the grid never shifts (computeWindow). Spots outside the reachable area
 * (getPossibleArea) are not shown: once 5 columns or 5 rows are taken, only those remain. Towers and spots sit in .board-layer
 * at their own board coordinates, and the layer's translate brings the window into view.
 */
export class BoardHandler {
    private boardElement: HTMLDivElement;
    private layerElement: HTMLDivElement;
    private spotsLayer: HTMLDivElement;
    private towersLayer: HTMLDivElement;
    private windowSize: number;
    private windowLeft: number = 0;
    private windowTop: number = 0;
    private towers = new Map<string, NexoTower>();
    private towerElements = new Map<string, HTMLDivElement>();
    private pendingElements = new Map<string, HTMLDivElement>();
    private draft: DraftView | null = null;
    private spotClickHandler: ((spot: NexoSpot) => void) | null = null;

    constructor(private game: Game, towers: NexoTower[]) {
        this.windowSize = 2 * this.game.getRules().gridSize - 1;
        this.windowLeft = this.windowTop = -(this.game.getRules().gridSize - 1); //the anchor: the first tower (0 0) in the centre

        this.boardElement = document.getElementById('nexo-board') as HTMLDivElement;
        this.boardElement.style.setProperty('--board-window-size', this.windowSize.toString());
        this.boardElement.innerHTML = `
            <div class="board-layer">
                <div class="spots-layer"></div>
                <div class="towers-layer"></div>
            </div>
        `;
        this.layerElement = this.boardElement.querySelector('.board-layer');
        this.spotsLayer = this.boardElement.querySelector('.spots-layer');
        this.towersLayer = this.boardElement.querySelector('.towers-layer');

        for(const tower of towers)
            this.addBoardTower(tower);

        this.computeWindow();
        this.applyWindow();
        this.renderSpots();

        this.layerElement.addEventListener('click', (event: MouseEvent) => this.onBoardClick(event));
    }

    //a tower of height discs in discColor: one .tower-disc per disc, bottom one first, and its height as a number on top. Also
    //used for log rows, the player boards' reserve and the draft panel, each sized by its own --cell-size
    public static createTowerDiv(discColor: DiscColor, height: number, extraClass: string = ''): HTMLDivElement {
        const tower = document.createElement('div');
        tower.className = 'nexo-tower' + (extraClass ? ' ' + extraClass : '');
        tower.setAttribute('data-disc-color', discColor);
        tower.setAttribute('data-height', height.toString());
        tower.style.setProperty('--tower-height', height.toString());

        let discsHTML = '';
        for(let discIndex = 0; discIndex < height; discIndex++)
            discsHTML += `<div class="tower-disc" style="--disc-index: ${discIndex}"></div>`;
        tower.innerHTML = discsHTML + `<div class="tower-height-number">${height}</div>`;
        return tower;
    }

    //the spot element now on the page at spot (renderSpots redraws them on every draft change), null if not shown
    public getSpotElement(spot: NexoSpot): HTMLDivElement | null {
        return this.spotsLayer.querySelector(`.board-spot[data-x="${spot.x}"][data-y="${spot.y}"]`);
    }

    public getTowers(): NexoTower[] { return Array.from(this.towers.values()); }
    public getTowerMap(): Map<string, NexoTower> { return new Map(this.towers); }

    private addBoardTower(tower: NexoTower): HTMLDivElement {
        const key = BoardRules.key(tower.x, tower.y);
        const towerElement = BoardHandler.createTowerDiv(this.game.getDiscColor(tower.player_id), tower.height, 'board-tower');
        BoardHandler.placeOnBoard(towerElement, tower);
        this.towersLayer.appendChild(towerElement);

        this.towers.set(key, { x: tower.x, y: tower.y, player_id: tower.player_id, height: tower.height });
        this.towerElements.set(key, towerElement);
        return towerElement;
    }

    private static placeOnBoard(element: HTMLElement, spot: NexoSpot): void {
        element.style.setProperty('--x', spot.x.toString());
        element.style.setProperty('--y', spot.y.toString());
        element.setAttribute('data-x', spot.x.toString());
        element.setAttribute('data-y', spot.y.toString());
    }

    //the window's top-left spot. It stays on its anchor (the first tower, 0 0, in the centre: columns and rows -4 to 4) for the
    //whole game: the reachable area (columns maxX - 4 to minX + 4) starts as exactly that window once the first tower is down,
    //and every turn's towers land inside it, so it only ever shrinks and never leaves the window. Re-centring on the towers
    //instead shifted the grid by a column or row after most turns. Only an area that left the window anyway (never under the
    //rules) moves it, by the smallest shift that holds it again
    private computeWindow(): boolean {
        let left = this.windowLeft;
        let top = this.windowTop;
        const area = this.game.boardRules.getPossibleArea(this.towers);
        if(area){
            left = Math.min(Math.max(left, area.maxX - this.windowSize + 1), area.minX);
            top = Math.min(Math.max(top, area.maxY - this.windowSize + 1), area.minY);
        }

        const changed = left !== this.windowLeft || top !== this.windowTop;
        this.windowLeft = left;
        this.windowTop = top;
        return changed;
    }

    private applyWindow(): void {
        this.layerElement.style.translate = `calc(${-this.windowLeft} * var(--cell-size)) calc(${-this.windowTop} * var(--cell-size))`;
    }

    //after a turn: redraws the spots for the new reachable area. The window itself stays on its anchor (computeWindow); the slide
    //(the whole layer, towers and spots together, instant with animations off) is only a safety net that the rules never trigger
    public async recenter(): Promise<void> {
        const changed = this.computeWindow();
        this.renderSpots();
        if(!changed)
            return;

        if(!this.game.bga.gameui.bgaAnimationsActive()){
            this.applyWindow();
            this.game.heightMenu?.reposition();
            return;
        }

        this.layerElement.style.transition = `translate ${Game.BOARD_RECENTER_DURATION}ms ${Game.BOARD_RECENTER_EASING}`;
        this.applyWindow();
        await this.game.bga.gameui.wait(Game.BOARD_RECENTER_DURATION);
        this.layerElement.style.transition = '';
        this.game.heightMenu?.reposition(); //an open height menu follows its spot (none is open after a turn, but nothing assumes it)
    }

    //every spot of the window the grid can still reach, from the towers on the board and the draft's new towers: a faint dot
    //where empty, the draft's legal spots (new towers) and replaceable enemy towers highlighted, plus the reachable area's outline
    private renderSpots(): void {
        this.spotsLayer.innerHTML = '';

        const occupied = new Map<string, NexoSpot>(this.towers);
        for(const pendingTower of this.draft?.pending ?? []){
            if(pendingTower.kind === 'new')
                occupied.set(BoardRules.key(pendingTower.x, pendingTower.y), pendingTower);
        }

        const area = this.game.boardRules.getPossibleArea(occupied);
        const windowArea: GridBounds = { minX: this.windowLeft, maxX: this.windowLeft + this.windowSize - 1, minY: this.windowTop, maxY: this.windowTop + this.windowSize - 1 };
        const shownArea: GridBounds = area ? {
            minX: Math.max(area.minX, windowArea.minX), maxX: Math.min(area.maxX, windowArea.maxX),
            minY: Math.max(area.minY, windowArea.minY), maxY: Math.min(area.maxY, windowArea.maxY),
        } : windowArea;

        const legalKeys = new Set((this.draft?.legalNewSpots ?? []).map(spot => BoardRules.key(spot.x, spot.y)));
        const replaceableKeys = new Set((this.draft?.replaceableTowers ?? []).map(tower => BoardRules.key(tower.x, tower.y)));
        const selectedKey = this.draft?.selectedSpot ? BoardRules.key(this.draft.selectedSpot.x, this.draft.selectedSpot.y) : null;

        if(area){
            const areaOutline = document.createElement('div');
            areaOutline.className = 'possible-area';
            areaOutline.style.setProperty('--x', shownArea.minX.toString());
            areaOutline.style.setProperty('--y', shownArea.minY.toString());
            areaOutline.style.setProperty('--columns', (shownArea.maxX - shownArea.minX + 1).toString());
            areaOutline.style.setProperty('--rows', (shownArea.maxY - shownArea.minY + 1).toString());
            this.spotsLayer.appendChild(areaOutline);
        }

        for(let y = shownArea.minY; y <= shownArea.maxY; y++){
            for(let x = shownArea.minX; x <= shownArea.maxX; x++){
                const key = BoardRules.key(x, y);
                const spot = document.createElement('div');
                spot.className = 'board-spot';
                BoardHandler.placeOnBoard(spot, { x: x, y: y });

                if(!occupied.has(key))
                    spot.classList.add('empty-spot');
                if(legalKeys.has(key))
                    spot.classList.add('legal-spot', 'clickable-spot');
                if(replaceableKeys.has(key))
                    spot.classList.add('replaceable-spot', 'clickable-spot');
                if(key === selectedKey)
                    spot.classList.add('selected-spot');

                this.spotsLayer.appendChild(spot);
            }
        }

        if(this.draft)
            this.boardElement.setAttribute('data-draft-color', this.draft.discColor);
        else this.boardElement.removeAttribute('data-draft-color');
    }

    //the turn being drafted (PlaceTowers), or null once it is over: its towers shown semi-transparent on their spots (a replaced
    //enemy tower fades under its replacement), legal spots and replaceable towers highlighted
    public setDraft(draft: DraftView | null): void {
        this.draft = draft;
        this.renderPending();
        this.updateTowerDraftClasses();
        this.renderSpots();
    }

    public setSpotClickHandler(handler: ((spot: NexoSpot) => void) | null): void {
        this.spotClickHandler = handler;
        this.boardElement.classList.toggle('accepting-clicks', !!handler);
    }

    private renderPending(): void {
        this.pendingElements.forEach(element => element.remove());
        this.pendingElements.clear();

        for(const pendingTower of this.draft?.pending ?? []){
            const pendingElement = BoardHandler.createTowerDiv(this.draft.discColor, pendingTower.height, 'board-tower pending-tower');
            BoardHandler.placeOnBoard(pendingElement, pendingTower);
            this.towersLayer.appendChild(pendingElement);
            this.pendingElements.set(BoardRules.key(pendingTower.x, pendingTower.y), pendingElement);
        }
    }

    private updateTowerDraftClasses(): void {
        const replacedKeys = new Set((this.draft?.pending ?? []).filter(tower => tower.kind === 'replace').map(tower => BoardRules.key(tower.x, tower.y)));
        const replaceableKeys = new Set((this.draft?.replaceableTowers ?? []).map(tower => BoardRules.key(tower.x, tower.y)));
        this.towerElements.forEach((element, key) => {
            element.classList.toggle('being-replaced', replacedKeys.has(key));
            element.classList.toggle('replaceable-tower', replaceableKeys.has(key));
        });
    }

    //a click on a tower of the draft takes it back; a click on a highlighted spot (empty or an enemy tower) selects it
    private onBoardClick(event: MouseEvent): void {
        if(!this.spotClickHandler)
            return;

        const target = event.target as HTMLElement;
        const clicked = (target.closest('.pending-tower') ?? target.closest('.board-spot.clickable-spot')) as HTMLElement | null;
        if(!clicked)
            return;

        this.spotClickHandler({ x: parseInt(clicked.getAttribute('data-x')), y: parseInt(clicked.getAttribute('data-y')) });
    }

    /**
     * A confirmed turn: each replaced enemy tower flies back to its owner's reserve on their player board, and each new tower
     * flies from the player's reserve to its spot, one after the other (TOWER_SLIDE_STAGGER). A tower I drafted is already in
     * place: it just becomes solid. Nothing flies with animations off. Resolves once every tower has landed.
     */
    public async applyPlacements(playerID: number, placements: NexoPlacement[]): Promise<void> {
        //the turn is over: no more clicks while it animates (the next PlaceTowers sets a handler again)
        this.setSpotClickHandler(null);
        const draftedElements = new Map(this.pendingElements);
        this.pendingElements.clear();
        this.draft = null;
        this.updateTowerDraftClasses();

        const animate = this.game.bga.gameui.bgaAnimationsActive();
        const mover = this.game.players[playerID];
        const slides: Promise<void>[] = [];
        let flightIndex = 0;

        for(const placement of placements){
            const key = BoardRules.key(placement.x, placement.y);

            const replacedElement = this.towerElements.get(key);
            if(replacedElement){
                this.towerElements.delete(key);
                const owner = this.game.players[placement.replaced_player_id ?? 0];
                if(animate && owner)
                    slides.push(this.game.animateSlideAway(replacedElement, owner.getReserveIconElement().getBoundingClientRect(), Game.TOWER_SLIDE_DURATION, { easing: Game.TOWER_SLIDE_EASING }));
                replacedElement.remove();
            }

            const towerElement = this.addBoardTower({ x: placement.x, y: placement.y, player_id: playerID, height: placement.height });

            const draftedElement = draftedElements.get(key);
            if(draftedElement){
                draftedElement.remove();
                draftedElements.delete(key);
                continue;
            }

            if(animate && mover){
                slides.push(this.game.animateSlide(towerElement, mover.getReserveIconElement(), null, Game.TOWER_SLIDE_DURATION, { easing: Game.TOWER_SLIDE_EASING, delayMs: flightIndex * Game.TOWER_SLIDE_STAGGER }));
                flightIndex++;
            }
        }

        draftedElements.forEach(element => element.remove()); //never expected: the server keeps every drafted tower
        this.renderSpots();

        await Promise.all(slides);
    }

    //end of the game: each player's largest group(s) glow in their color, every other tower dims
    public highlightLargestGroups(groups: Record<number, NexoSpot[][]>): void {
        this.boardElement.classList.add('showing-largest-groups');
        for(const playerID in groups){
            for(const group of groups[playerID]){
                for(const spot of group)
                    this.towerElements.get(BoardRules.key(spot.x, spot.y))?.classList.add('largest-group-tower');
            }
        }
    }
}
