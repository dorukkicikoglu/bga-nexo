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
    selectedSpot: NexoSpot | null; //the active drafted tower: the gold ring, and the undo and confirm buttons under it
    discColor: DiscColor;
    confirming: boolean; //the turn is on its way to the server: the buttons stay, disabled
    discsUsed: number; //the discs drafted so far: the confirm button's filled ring segments
    discsThisTurn: number; //the most this turn may use (min(5, reserve)): the ring's segments
};

//what the draft's clicks on the board do (PlaceTowers): a highlighted spot or a drafted tower, a drafted tower's undo button,
//the confirm button
export type DraftClickHandlers = {
    spotClicked: (spot: NexoSpot) => void;
    undoClicked: (spot: NexoSpot) => void;
    confirmClicked: () => void;
};

/**
 * The board, with Yaxha's grid logic (reference/yaxha/src/PyramidHandler.ts): towers and legal spots sit in .board-layer at
 * their own board coordinates (--x, --y times --cell-size), in a frame anchored to the first tower (0 0) for the whole game, so
 * a tower's grid position never changes. Only the layer moves: like Yaxha's centerCubesContainer(), its translate centres the
 * bounding box of the towers plus the legal spots in the board (centerContents), sliding over BOARD_RECENTER_DURATION when
 * that box changes, at once on load. The legal spots count in the box for everyone but only the player drafting sees them.
 * Nothing else is drawn: no empty spots, no grid outline. The board is (gridSize + 2) spots across and down: the largest
 * box is gridSize + 1 (4 columns of towers with a legal spot on each side; with 5, no spot beyond them is legal), plus half
 * a spot on each side.
 */
export class BoardHandler {
    private boardElement: HTMLDivElement;
    private layerElement: HTMLDivElement;
    private spotsLayer: HTMLDivElement;
    private towersLayer: HTMLDivElement;
    private controlsLayer: HTMLDivElement;
    private boardSize: number;
    private contentsCenterX: number | null = null; //the middle of the towers' and legal spots' bounding box, in spots, once centred
    private contentsCenterY: number | null = null;
    //[BGA] while my draft has towers, the centre is frozen where it was when the first one was drafted (centerContents), until
    //the turn's towers have landed (recenter) or the draft is emptied (setDraft)
    private frozenCenter: { x: number; y: number; } | null = null;
    private boxLegalSpots: NexoSpot[] = []; //the legal spots the box is centred on, shown or not (getBoxLegalSpots)
    private towers = new Map<string, NexoTower>();
    private towerElements = new Map<string, HTMLDivElement>();
    private pendingElements = new Map<string, HTMLDivElement>();
    private draft: DraftView | null = null;
    private draftClickHandlers: DraftClickHandlers | null = null;
    private confirmWasFull: boolean = false; //every disc of the turn was drafted at the last render: the confirm button pulses once on reaching it
    private ringWasFilled: number | null = null; //the confirm ring's filled segments at the last render, null when no confirm button showed

    //the undo button's icon: a curved arrow turning back counter-clockwise, drawn with currentColor
    private static readonly UNDO_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12a7 7 0 1 0 2.05-4.95"/><path d="M11 7.05H7.05V3.1"/></svg>';
    //the confirm button's icon: a tick
    private static readonly CONFIRM_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

    constructor(private game: Game, towers: NexoTower[]) {
        this.boardSize = this.game.getRules().gridSize + 2;

        this.boardElement = document.getElementById('nexo-board') as HTMLDivElement;
        this.boardElement.style.setProperty('--board-size', this.boardSize.toString());
        this.boardElement.innerHTML = `
            <div class="board-layer">
                <div class="spots-layer"></div>
                <div class="towers-layer"></div>
                <div class="draft-controls-layer"></div>
            </div>
        `;
        this.layerElement = this.boardElement.querySelector('.board-layer');
        this.spotsLayer = this.boardElement.querySelector('.spots-layer');
        this.towersLayer = this.boardElement.querySelector('.towers-layer');
        this.controlsLayer = this.boardElement.querySelector('.draft-controls-layer');

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
     * BOARD_VIEWPORT_MARGIN above the window's bottom when the page is at its top (then the gap under it, $below-board-gap-*,
     * and BGA's settings below), never wider than the game area, nor smaller than MIN_BOARD_CELL_SIZE spots. Sized through --cell-size
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

        const cellSize = Math.max(Game.MIN_BOARD_CELL_SIZE, Math.floor(Math.min(maxHeight, maxWidth) / this.boardSize));
        if(this.boardElement.style.getPropertyValue('--cell-size') !== cellSize + 'px')
            this.boardElement.style.setProperty('--cell-size', cellSize + 'px');
        //the draft's controls keep a minimum size on screen (Game.scss: $pending-undo-min-size), whatever BGA's scaling
        const boardZoom = zoom.toFixed(4);
        if(zoom > 0 && this.boardElement.style.getPropertyValue('--board-zoom') !== boardZoom)
            this.boardElement.style.setProperty('--board-zoom', boardZoom);
        //the gap under the board (Game.scss: #nexo-board-container) keeps BGA's content after the game area under the window's
        //bottom with the page at its top: the board's bottom on the page, screen px, measured at its new size
        const boardPageBottom = Math.ceil(this.boardElement.getBoundingClientRect().bottom + window.scrollY) + 'px';
        if(container.style.getPropertyValue('--board-page-bottom') !== boardPageBottom)
            container.style.setProperty('--board-page-bottom', boardPageBottom);
        this.measureForBackgroundDisc(cellSize * zoom);
    }

    /**
     * The page background's red disc ($bg-red-disc-* in Game.scss) is outside the board and can't read its --cell-size: hand
     * it, on body, the board's spot size on screen and where the board and the player boards are, from the window's right edge
     * (the player boards only when beside the board) and its bottom edge (page at its top; the window's stable height, which a
     * mobile browser's address bar showing or hiding doesn't change, BackgroundHandler.getStableViewportHeight). Game.scss
     * decides the disc's size and place from these (and its rise from BackgroundHandler's --floating-buttons-height). Set only
     * when they change
     */
    private measureForBackgroundDisc(cellScreenSize: number): void {
        const viewport = document.documentElement;
        const boardRect = this.boardElement.getBoundingClientRect();
        const panelsRect = document.getElementById('player_boards')?.getBoundingClientRect();
        const panelsBeside = !!panelsRect && panelsRect.width > 0 && panelsRect.left >= boardRect.right;
        const viewportHeight = this.game.backgroundHandler?.getStableViewportHeight() || viewport.clientHeight;

        const values: Record<string, number> = {
            '--board-cell-screen-size': cellScreenSize,
            '--board-right-gap': viewport.clientWidth - boardRect.right,
            '--panels-right-gap': panelsBeside ? viewport.clientWidth - panelsRect.left : 0,
            '--panels-bottom-gap': panelsBeside ? viewportHeight - (panelsRect.bottom + window.scrollY) : 0,
            '--board-bottom-gap': viewportHeight - (boardRect.bottom + window.scrollY),
        };
        for(const [name, value] of Object.entries(values)){
            const px = Math.round(value) + 'px';
            if(document.body.style.getPropertyValue(name) !== px)
                document.body.style.setProperty(name, px);
        }
    }

    //a tower of height discs in discColor: one .tower-disc per disc, bottom one first, and its height as a number on top. Also
    //used for log rows and the player boards' reserve, each sized by its own --cell-size
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
     * (BOARD_RECENTER_DURATION) and animations are on, else applies at once (on load). Resolves once it has slid.
     * [BGA] While my draft has towers (frozenCenter), the contents keep the centre they had when it began, even off-centre: they
     * only move when the draft would leave the board (a line of new towers from the edge of the box, whose own new legal spots
     * may be built on this turn), by the least that keeps the whole box on it; the box is never wider than the board
     */
    private async centerContents(animate: boolean): Promise<void> {
        const contents = new Map<string, NexoSpot>(this.towers);
        for(const pendingTower of this.draft?.pending ?? [])
            contents.set(BoardRules.key(pendingTower.x, pendingTower.y), pendingTower);
        for(const spot of this.boxLegalSpots)
            contents.set(BoardRules.key(spot.x, spot.y), spot);

        const bounds = BoardRules.getBounds(contents);
        let centerX = bounds ? (bounds.minX + bounds.maxX + 1) / 2 : 0.5; //spot x covers x to x + 1
        let centerY = bounds ? (bounds.minY + bounds.maxY + 1) / 2 : 0.5;
        if(this.frozenCenter){
            const halfBoard = this.boardSize / 2;
            if(bounds){
                this.frozenCenter.x = Math.min(Math.max(this.frozenCenter.x, bounds.maxX + 1 - halfBoard), bounds.minX + halfBoard);
                this.frozenCenter.y = Math.min(Math.max(this.frozenCenter.y, bounds.maxY + 1 - halfBoard), bounds.minY + halfBoard);
            }
            centerX = this.frozenCenter.x;
            centerY = this.frozenCenter.y;
        }
        if(centerX === this.contentsCenterX && centerY === this.contentsCenterY)
            return;

        const slide = animate && this.contentsCenterX !== null && this.game.bga.gameui.bgaAnimationsActive();
        this.contentsCenterX = centerX;
        this.contentsCenterY = centerY;

        //a slide set while another runs carries on from where the layer is, so the layer never jumps
        this.layerElement.style.transition = slide ? `translate ${Game.BOARD_RECENTER_DURATION}ms ${Game.BOARD_RECENTER_EASING}` : 'none';
        this.layerElement.style.translate = `calc(${this.boardSize / 2 - centerX} * var(--cell-size)) calc(${this.boardSize / 2 - centerY} * var(--cell-size))`;
        //the same offsets, in spots, for what must stay inside the board (Game.scss: .pending-actions)
        this.layerElement.style.setProperty('--layer-offset-x', (this.boardSize / 2 - centerX).toString());
        this.layerElement.style.setProperty('--layer-offset-y', (this.boardSize / 2 - centerY).toString());
        if(slide)
            await this.game.bga.gameui.wait(Game.BOARD_RECENTER_DURATION);
    }

    //after a turn (notif_towersPlaced, once the towers have landed, so my own confirmed towers land on the frozen layout): the
    //centre is free again, the spots for the new board, then the layer slides to centre the new bounding box
    public async recenter(): Promise<void> {
        this.frozenCenter = null;
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
    //the replaceable enemy towers and the gold ring under the drafted tower clicked last. Empty spots and the grid's outline are never drawn
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

        if(this.draft)
            this.boardElement.setAttribute('data-legal-spot-color', this.draft.discColor); //the drafting player's own disc color
        else this.boardElement.removeAttribute('data-legal-spot-color');
    }

    //the turn being drafted (PlaceTowers), or null once it is over: its towers shown semi-transparent on their spots (a replaced
    //enemy tower fades under its replacement) with their count badges and undo buttons, legal spots and replaceable towers highlighted
    public setDraft(draft: DraftView | null): void {
        this.draft = draft;
        //[BGA] the first drafted tower freezes the centre where it is (centerContents has not seen it yet); an empty draft frees
        //it, which moves nothing: the box is the same as when the turn began, unless the draft had to shift it at the board's edge
        if((draft?.pending.length ?? 0) === 0)
            this.frozenCenter = null;
        else if(!this.frozenCenter && this.contentsCenterX !== null)
            this.frozenCenter = { x: this.contentsCenterX, y: this.contentsCenterY };
        this.renderPending();
        this.renderPendingControls();
        this.updateTowerDraftClasses();
        this.renderSpots();
        this.centerContents(true); //frozen while drafting (frozenCenter): moves only to keep the draft on the board
    }

    public setDraftClickHandlers(handlers: DraftClickHandlers | null): void {
        this.draftClickHandlers = handlers;
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

    //on each drafted tower, in a layer over every tower: a badge with its height (the discs it adds) on its top right corner.
    //Under the active tower only, round buttons side by side: undo (takes it back) and confirm (sends the whole turn).
    //Game.scss keeps them inside the board (nudged sideways, or above the tower on the bottom row). Their clicks never reach
    //the tower or spot underneath. While the turn is on its way to the server, both are disabled. The confirm button wears a
    //ring of one segment per disc the turn may use, filled for each drafted disc (createConfirmRing): light green while discs
    //are left (still a live button: a turn may stop early), solid green once every disc is drafted, with one pulse when it
    //gets there (not on a render that was already full, nor with animations off or reduced motion)
    private renderPendingControls(): void {
        this.controlsLayer.innerHTML = '';
        const draft = this.draft;
        const full = !!draft && draft.discsThisTurn > 0 && draft.discsUsed >= draft.discsThisTurn;
        const animate = this.game.bga.gameui.bgaAnimationsActive() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const pulse = full && !this.confirmWasFull && animate;
        this.confirmWasFull = full;
        const ringWasFilled = this.ringWasFilled;
        this.ringWasFilled = null; //set again below if the confirm button shows
        if(!draft)
            return;

        const activeKey = draft.selectedSpot ? BoardRules.key(draft.selectedSpot.x, draft.selectedSpot.y) : null;
        for(const pendingTower of draft.pending){
            const spot: NexoSpot = { x: pendingTower.x, y: pendingTower.y };
            const controls = document.createElement('div');
            controls.className = 'pending-controls';
            BoardHandler.placeOnBoard(controls, spot);

            const badge = document.createElement('div');
            badge.className = 'pending-count-badge';
            badge.textContent = pendingTower.height.toString();

            controls.appendChild(badge);

            if(BoardRules.key(spot.x, spot.y) === activeKey){
                const actions = document.createElement('div');
                actions.className = 'pending-actions';
                actions.style.setProperty('--pending-actions-count', '2');
                const confirmButton = this.createPendingButton('pending-confirm-button', _('Confirm'), BoardHandler.CONFIRM_ICON_SVG, draft.confirming, () => this.draftClickHandlers?.confirmClicked());
                confirmButton.setAttribute('data-full', full.toString());
                const ringFilled = Math.min(draft.discsUsed, draft.discsThisTurn);
                this.createConfirmRing(confirmButton, draft.discsThisTurn, ringFilled, animate ? ringWasFilled : ringFilled);
                this.ringWasFilled = ringFilled;
                if(pulse){
                    confirmButton.classList.add('confirm-full-pulse');
                    confirmButton.addEventListener('animationend', (event: AnimationEvent) => { //the ring's segments' animationend bubbles here too
                        if(event.target === confirmButton)
                            confirmButton.classList.remove('confirm-full-pulse');
                    });
                }
                actions.append(
                    this.createPendingButton('pending-undo-button', _('Take this tower back'), BoardHandler.UNDO_ICON_SVG, draft.confirming, () => this.draftClickHandlers?.undoClicked(spot)),
                    confirmButton,
                );
                controls.appendChild(actions);
            }
            this.controlsLayer.appendChild(controls);
        }
    }

    /**
     * The confirm button's ring: one .confirm-ring-segment per disc the turn may use, the first `filled` green (Game.scss draws
     * and colors them). The board redraws its controls on every draft change, so a CSS transition would never run: the
     * segments that changed since the last render (`wasFilled`) get a one-shot class instead, removed once it has played.
     * The ring follows the turn's total, wherever the buttons are, so moving them to another tower changes nothing: a drafted
     * disc fills its segment (ring-segment-fill), an undo empties its own (ring-segment-empty). When the button first shows
     * (`wasFilled` null), its filled segments fill one after another, CONFIRM_RING_STAGGER apart. `wasFilled` equal to
     * `filled`: nothing plays (animations off, reduced motion)
     */
    private createConfirmRing(confirmButton: HTMLButtonElement, segments: number, filled: number, wasFilled: number | null): void {
        confirmButton.style.setProperty('--ring-segments', segments.toString());
        for(let segmentIndex = 0; segmentIndex < segments; segmentIndex++){
            const segment = document.createElement('div');
            segment.className = 'confirm-ring-segment';
            segment.style.setProperty('--segment-index', segmentIndex.toString());
            segment.classList.toggle('filled', segmentIndex < filled);

            let changeClass: string | null = null;
            if(wasFilled === null && segmentIndex < filled){
                changeClass = 'ring-segment-fill';
                segment.style.setProperty('--segment-delay', `${segmentIndex * Game.CONFIRM_RING_STAGGER}ms`);
            }
            else if(wasFilled !== null && segmentIndex >= wasFilled && segmentIndex < filled)
                changeClass = 'ring-segment-fill';
            else if(wasFilled !== null && segmentIndex >= filled && segmentIndex < wasFilled)
                changeClass = 'ring-segment-empty';

            if(changeClass){
                segment.classList.add(changeClass);
                segment.addEventListener('animationend', (event: AnimationEvent) => {
                    if(event.target === segment && !event.pseudoElement) //its own pop, not its ::before's color fade (same length)
                        segment.classList.remove(changeClass);
                });
            }
            confirmButton.appendChild(segment);
        }
    }

    private createPendingButton(className: string, label: string, iconSVG: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pending-button ' + className;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = iconSVG;
        button.disabled = disabled;
        button.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation(); //not a click on the drafted tower under it, which would add a disc
            if(!button.disabled)
                onClick();
        });
        return button;
    }

    //an enemy tower under a drafted replacement fades (being-replaced)
    private updateTowerDraftClasses(): void {
        const replacedKeys = new Set((this.draft?.pending ?? []).filter(tower => tower.kind === 'replace').map(tower => BoardRules.key(tower.x, tower.y)));
        this.towerElements.forEach((element, key) => element.classList.toggle('being-replaced', replacedKeys.has(key)));
    }

    //a click on a highlighted spot (empty or an enemy tower) or on a tower of the draft: PlaceTowers drafts or cycles its height
    private onBoardClick(event: MouseEvent): void {
        if(!this.draftClickHandlers)
            return;

        const target = event.target as HTMLElement;
        if(target.closest('.pending-actions'))
            return; //a disabled button's click, which no listener of its own receives: never a click on the tower under it
        const clicked = (target.closest('.pending-tower') ?? target.closest('.board-spot.clickable-spot')) as HTMLElement | null;
        if(!clicked)
            return;

        this.draftClickHandlers.spotClicked({ x: parseInt(clicked.getAttribute('data-x')), y: parseInt(clicked.getAttribute('data-y')) });
    }

    /**
     * A confirmed turn, played one spot at a time in the order the turn was drafted (the payload's order): on each spot, the
     * replaced enemy tower (if any) flies back onto its owner's reserve stacks on their player board, top disc first, while
     * the new tower's discs fly from the top of the player's stacks onto it, bottom disc first (discs TOWER_DISC_STAGGER
     * apart); once every disc has landed, the next spot starts. Every viewer sees the same flights, the player who drafted
     * the turn included: their drafted towers only stay as placeholders until their spot's turn, then fly in from their
     * stacks like anyone's. With animations off nothing flies and nothing is awaited: every spot applies at once, stacks
     * included. Resolves once every tower has landed.
     */
    public async applyPlacements(playerID: number, placements: NexoPlacement[]): Promise<void> {
        //the turn is over: no more clicks while it animates (the next PlaceTowers sets its handlers again), no more badges or
        //undo buttons
        this.setDraftClickHandlers(null);
        const draftedElements = new Map(this.pendingElements);
        this.pendingElements.clear();
        this.draft = null;
        this.updateTowerDraftClasses();
        this.renderPendingControls();
        draftedElements.forEach((draftedElement, key) => {
            draftedElement.classList.add('confirmed-tower'); //no more hover or click while it waits for its spot's turn
            this.towerElements.get(key)?.classList.add('being-replaced'); //the enemy tower it replaces stays faded until then
        });

        const animate = this.game.bga.gameui.bgaAnimationsActive();
        for(const placement of placements){
            const flights = this.applyPlacement(playerID, placement, draftedElements, animate);
            if(flights.length > 0)
                await Promise.all(flights);
        }

        draftedElements.forEach(element => element.remove()); //never expected: the server keeps every drafted tower
        this.renderSpots();
    }

    //one spot of a confirmed turn: swaps its towers on the board, moves their discs between the player boards' reserve stacks
    //(with animations off too, so the stacks match the turn) and returns the flights to await (none with animations off)
    private applyPlacement(playerID: number, placement: NexoPlacement, draftedElements: Map<string, HTMLDivElement>, animate: boolean): Promise<void>[] {
        const key = BoardRules.key(placement.x, placement.y);
        const flights: Promise<void>[] = [];

        //the replaced tower's discs go back onto its owner's stacks, top disc first: the first disc placed is the top one's
        const replacedElement = this.towerElements.get(key);
        if(replacedElement){
            this.towerElements.delete(key);
            const owner = this.game.players[placement.replaced_player_id ?? 0];
            if(owner){
                const replacedHeight = placement.replaced_height ?? parseInt(replacedElement.getAttribute('data-height'));
                const placedDiscs = owner.addDiscs(replacedHeight, animate);
                if(animate){
                    const landingDiscs = Array.from({ length: replacedHeight }, (_, discIndex) => placedDiscs[replacedHeight - 1 - discIndex] ?? null);
                    flights.push(this.game.animateTowerSlideAway(replacedElement, landingDiscs, owner.getReserveRect(), Game.TOWER_SLIDE_DURATION, Game.TOWER_DISC_STAGGER, { easing: Game.TOWER_SLIDE_EASING }));
                }
            }
            replacedElement.remove();
        }

        //a tower I drafted waited here as a placeholder until its spot's turn: it stays while its discs fly in, each of its discs
        //hiding as the real one lands on it, and goes once the top one has landed
        const placeholder = draftedElements.get(key) ?? null;
        draftedElements.delete(key);

        const towerElement = this.addBoardTower({ x: placement.x, y: placement.y, player_id: playerID, height: placement.height });
        if(placeholder)
            this.towersLayer.appendChild(placeholder); //in front of the new tower: its upper discs still sit over the discs landed under them

        //the new tower's discs leave the player's stacks, bottom disc first: the first disc taken is the bottom one's. The same
        //flight for every viewer, the player who drafted it included
        const mover = this.game.players[playerID];
        const takenDiscRects = mover?.takeDiscs(placement.height) ?? [];
        if(animate && mover)
            flights.push(this.game.animateTowerSlide(towerElement, takenDiscRects, mover.getReserveRect(), Game.TOWER_SLIDE_DURATION, Game.TOWER_DISC_STAGGER, { easing: Game.TOWER_SLIDE_EASING }, placeholder).finally(() => placeholder?.remove()));
        else placeholder?.remove(); //nothing flies: the tower is already whole
        return flights;
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
