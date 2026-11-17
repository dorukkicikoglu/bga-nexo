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
import { BoardRules } from "./BoardRules";

//what the turn being drafted shows on the board (PlaceTowers, for the active player only)
export type DraftView = {
    pending: PendingTower[];
    legalNewSpots: NexoSpot[];
    replaceableTowers: NexoTower[];
    selectedSpot: NexoSpot | null;
    discColor: DiscColor;
};

/**
 * The board, with Yaxha's grid logic (reference/yaxha/src/PyramidHandler.ts): towers and legal spots sit in .board-layer at
 * their own board coordinates (--x, --y times --cell-size), in a frame anchored to the first tower (0 0) for the whole game, so
 * a tower's grid position never changes. Only the layer moves: like Yaxha's centerCubesContainer(), its translate centres the
 * bounding box of the towers plus the legal spots in the board (centerContents), sliding over BOARD_RECENTER_DURATION when
 * that box changes, at once on load. The legal spots count in the box for everyone but only the player drafting sees them.
 * Nothing else is drawn: no empty spots, no grid outline. The board is (gridSize + 2)
 * spots across and down: the largest box is gridSize + 1 (4 columns of towers with a legal spot on each side; with 5, no
 * spot beyond them is legal), plus half a spot on each side.
 */
export class BoardHandler {
    private boardElement: HTMLDivElement;
    private layerElement: HTMLDivElement;
    private spotsLayer: HTMLDivElement;
    private towersLayer: HTMLDivElement;
    private boardSize: number;
    private contentsCenterX: number | null = null; //the middle of the towers' and legal spots' bounding box, in spots, once centred
    private contentsCenterY: number | null = null;
    private boxLegalSpots: NexoSpot[] = []; //the legal spots the box is centred on, shown or not (getBoxLegalSpots)
    private towers = new Map<string, NexoTower>();
    private towerElements = new Map<string, HTMLDivElement>();
    private pendingElements = new Map<string, HTMLDivElement>();
    private draft: DraftView | null = null;
    private spotClickHandler: ((spot: NexoSpot) => void) | null = null;

    constructor(private game: Game, towers: NexoTower[]) {
        this.boardSize = this.game.getRules().gridSize + 2;

        this.boardElement = document.getElementById('nexo-board') as HTMLDivElement;
        this.boardElement.style.setProperty('--board-window-size', this.boardSize.toString());
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

        this.fitToViewport();
        this.renderSpots();
        this.centerContents(false); //on load (F5, a replay's start): no slide

        //BGA's onScreenWidthChange (Game) only follows the width, and the page above the board is still being laid out when
        //setup measures it (a board measured too low stayed too small): fit again on every window resize and whenever the page's
        //layout changes (body's size: BGA's bars, the status bar, the columns settling). Fitting again where nothing moved
        //changes nothing, so this never loops
        let fitFrame = 0;
        const scheduleFit = () => {
            cancelAnimationFrame(fitFrame);
            fitFrame = requestAnimationFrame(() => this.fitToViewport());
        };
        window.addEventListener('resize', scheduleFit);
        const layoutObserver = new ResizeObserver(scheduleFit);
        layoutObserver.observe(document.body);
        const statusBar = document.getElementById('page-title');
        if(statusBar)
            layoutObserver.observe(statusBar);

        this.layerElement.addEventListener('click', (event: MouseEvent) => this.onBoardClick(event));
    }

    /**
     * [BGA] The board as big as the window allows: square, from #nexo-board-container's padding under the status bar down to
     * BOARD_VIEWPORT_MARGIN above the window's bottom when the page is at its top (so the page still scrolls down to BGA's
     * settings below), never wider than the game area, nor smaller than MIN_BOARD_CELL_SIZE spots. Sized through --cell-size
     * on #nexo-board, so the towers, spots and the layer's translate scale with it. Measured on screen, converted with the
     * container's measured zoom (BGA scales the game area down on a phone)
     */
    public fitToViewport(): void {
        const container = this.boardElement.parentElement;
        if(!container)
            return;

        const containerRect = container.getBoundingClientRect();
        const containerWidth = parseFloat(getComputedStyle(container).width); //unrounded, unlike offsetWidth
        if(!(containerWidth > 0))
            return;
        const zoom = containerRect.width / containerWidth;

        const boardTop = this.boardElement.getBoundingClientRect().top + window.scrollY; //on the page, in screen px
        const borders = this.boardElement.offsetWidth - this.boardElement.clientWidth; //the board's own border, both sides
        const maxHeight = (window.innerHeight - boardTop - Game.BOARD_VIEWPORT_MARGIN) / zoom - borders;
        const maxWidth = containerWidth - borders;

        const cellSize = Math.max(Game.MIN_BOARD_CELL_SIZE, Math.floor(Math.min(maxHeight, maxWidth) / this.boardSize)) + 'px';
        if(this.boardElement.style.getPropertyValue('--cell-size') === cellSize)
            return;
        this.boardElement.style.setProperty('--cell-size', cellSize);
        this.game.heightMenu?.reposition(); //an open height menu follows its spot
    }

    //a tower of height discs in discColor: one .tower-disc per disc, bottom one first, and its height as a number on top. Also
    //used for log rows, the player boards' reserve and the height menu, each sized by its own --cell-size
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

    /**
     * Yaxha's centerCubesContainer(): the layer's translate puts the middle of the bounding box of the towers, the draft's new
     * towers and the legal spots (shown or not, getBoxLegalSpots) in the middle of the board. Computed from board coordinates rather than measured on the
     * page (Yaxha measures its cubes), so every viewer, a reload and a replay get the very same layout. Slides when animate
     * (BOARD_RECENTER_DURATION, Yaxha's 400ms) and animations are on, else applies at once (on load). Resolves once it has slid
     */
    private async centerContents(animate: boolean): Promise<void> {
        const contents = new Map<string, NexoSpot>(this.towers);
        for(const pendingTower of this.draft?.pending ?? [])
            contents.set(BoardRules.key(pendingTower.x, pendingTower.y), pendingTower);
        for(const spot of this.boxLegalSpots)
            contents.set(BoardRules.key(spot.x, spot.y), spot);

        const bounds = BoardRules.getBounds(contents);
        const centerX = bounds ? (bounds.minX + bounds.maxX + 1) / 2 : 0.5; //spot x covers x to x + 1
        const centerY = bounds ? (bounds.minY + bounds.maxY + 1) / 2 : 0.5;
        if(centerX === this.contentsCenterX && centerY === this.contentsCenterY)
            return;

        const slide = animate && this.contentsCenterX !== null && this.game.bga.gameui.bgaAnimationsActive();
        this.contentsCenterX = centerX;
        this.contentsCenterY = centerY;

        //a slide set while another runs carries on from where the layer is, so the layer never jumps
        this.layerElement.style.transition = slide ? `translate ${Game.BOARD_RECENTER_DURATION}ms ${Game.BOARD_RECENTER_EASING}` : 'none';
        this.layerElement.style.translate = `calc(${this.boardSize / 2 - centerX} * var(--cell-size)) calc(${this.boardSize / 2 - centerY} * var(--cell-size))`;
        if(slide)
            await this.game.bga.gameui.wait(Game.BOARD_RECENTER_DURATION);
        this.game.heightMenu?.reposition(); //an open height menu follows its spot
    }

    //after a turn (notif_towersPlaced, once the towers have landed): the spots for the new board, then the layer slides to
    //centre the new bounding box
    public async recenter(): Promise<void> {
        this.renderSpots();
        await this.centerContents(true);
    }

    //the legal spots the box is centred on (centerContents), for every viewer: the draft's while I draft, otherwise the empty
    //spots where the active player could put a new tower, from the towers on the board alone (so the same for every viewer and
    //the same as the draft's when a turn starts: the board doesn't slide when the turn passes), none once the game is over.
    //Only the drafting player sees them (renderSpots)
    private getBoxLegalSpots(): NexoSpot[] {
        if(this.draft)
            return this.draft.legalNewSpots;
        if(this.game.isGameOver())
            return [];
        return this.game.boardRules.getLegalNewSpots(this.towers);
    }

    //the spots only the player drafting their turn sees (nobody else, spectators and replays included, so nothing looks
    //clickable to them): the legal spots (an ellipse ring where the tower's bottom disc would go, in their own disc color),
    //the replaceable enemy towers and the selected spot. Empty spots and the grid's outline are never drawn
    private renderSpots(): void {
        this.spotsLayer.innerHTML = '';
        this.boxLegalSpots = this.getBoxLegalSpots();

        if(this.draft && !this.game.isReplay()){
            const legalKeys = new Set(this.draft.legalNewSpots.map(spot => BoardRules.key(spot.x, spot.y)));
            const replaceableKeys = new Set(this.draft.replaceableTowers.map(tower => BoardRules.key(tower.x, tower.y)));
            const selectedSpot = this.draft.selectedSpot;
            const selectedKey = selectedSpot ? BoardRules.key(selectedSpot.x, selectedSpot.y) : null;

            const shownSpots = new Map<string, NexoSpot>();
            for(const spot of [...this.draft.legalNewSpots, ...this.draft.replaceableTowers, ...(selectedSpot ? [selectedSpot] : [])])
                shownSpots.set(BoardRules.key(spot.x, spot.y), { x: spot.x, y: spot.y });

            shownSpots.forEach((shownSpot, key) => {
                const spot = document.createElement('div');
                spot.className = 'board-spot';
                BoardHandler.placeOnBoard(spot, shownSpot);

                if(legalKeys.has(key))
                    spot.classList.add('legal-spot', 'clickable-spot');
                if(replaceableKeys.has(key))
                    spot.classList.add('replaceable-spot', 'clickable-spot');
                if(key === selectedKey)
                    spot.classList.add('selected-spot');

                this.spotsLayer.appendChild(spot);
            });
        }

        if(this.draft){
            this.boardElement.setAttribute('data-legal-spot-color', this.draft.discColor); //the drafting player's own disc color
            this.boardElement.setAttribute('data-draft-color', this.draft.discColor);
        } else {
            this.boardElement.removeAttribute('data-legal-spot-color');
            this.boardElement.removeAttribute('data-draft-color');
        }
    }

    //the turn being drafted (PlaceTowers), or null once it is over: its towers shown semi-transparent on their spots (a replaced
    //enemy tower fades under its replacement), legal spots and replaceable towers highlighted
    public setDraft(draft: DraftView | null): void {
        this.draft = draft;
        this.renderPending();
        this.updateTowerDraftClasses();
        this.renderSpots();
        this.centerContents(true); //like Yaxha after each cube: the layer slides as drafted towers and legal spots change the box
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
