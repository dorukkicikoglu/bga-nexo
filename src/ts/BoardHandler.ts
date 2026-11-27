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
    warningTowers: NexoTower[]; //towers a click can't draft on but answers (my own, enemy towers too high for the discs left): they shake and say why
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
    warningTowerClicked: (spot: NexoSpot) => void;
};

/**
 * The board, with Yaxha's grid logic (reference/yaxha/src/PyramidHandler.ts): towers and legal spots sit in .board-layer at
 * their own board coordinates (--x, --y times --cell-size), in a frame anchored to the first tower (0 0) for the whole game, so
 * a tower's grid position never changes. Only the layer moves: like Yaxha's centerCubesContainer(), its translate centres the
 * bounding box of the towers plus the legal spots in the board (centerContents), sliding over BOARD_RECENTER_DURATION when
 * that box changes, at once on load. The legal spots count in the box for everyone but only the player drafting sees them.
 * Nothing else is drawn: no empty spots, no grid outline. The board is (gridSize + 1 + 2 * --board-edge-padding) spots across
 * and down (readBoardSize): the largest box is gridSize + 1 (4 columns of towers with a legal spot on each side; with 5, no spot
 * beyond them is legal), plus Game.scss's $board-edge-padding on each side (smaller on BGA's mobile layout). Its spot size
 * (--cell-size) comes from the window, never from the box.
 */
export class BoardHandler {
    private boardElement: HTMLDivElement;
    private layerElement: HTMLDivElement;
    private spotsLayer: HTMLDivElement;
    private towersLayer: HTMLDivElement;
    private controlsLayer: HTMLDivElement;
    private messageLayer: HTMLDivElement;
    private towerMessage: { element: HTMLDivElement; timers: number[]; } | null = null; //the bubble over a warning tower (showTowerWarning), one at a time
    private boardSize: number; //in spots (readBoardSize)
    private columnElement: HTMLDivElement | null; //[BGA] the board and the players' avatars and reserves on its top edge (Game.setup, PlayerHandler)
    private fitFrame: number = 0; //the one pending fit (requestFit), 0 when none
    //what the spot size was last computed from (fitToViewport): the room for the column, in the board's own px, and its spans in spots
    private fittedRoom: FitRoom | null = null;
    //the last time the fit shrank the board for lack of width alone, and the room it had just before: growing straight back into
    //that room soon after, with no window resize between, is the board answering its own shrink (a scrollbar going away), so it doesn't
    private lastShrink: { at: number; roomBefore: FitRoom; } | null = null;
    private lastWindowResizeAt: number = 0;
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
    private towerJumpSafetyTimers = new Map<HTMLDivElement, number>(); //a jump's class goes even if its animationend never comes (jumpTowers)
    private draftClickHandlers: DraftClickHandlers | null = null;
    private confirmWasFull: boolean = false; //every disc of the turn was drafted at the last render: the confirm button pulses once on reaching it
    private ringWasFilled: number | null = null; //the confirm ring's filled segments at the last render, null when no confirm button showed

    //the undo button's icon: a curved arrow turning back counter-clockwise, drawn with currentColor
    //[BGA] "Disc style" Wooden (PrefHandler.applyDiscStyle, Game.scss html.nexo-discs-wooden): img/wooden_discs.webp, a grid of
    //single discs, WOODEN_SPRITE_COLUMNS across and WOODEN_SPRITE_ROWS_PER_COLOR rows per color, from WOODEN_SPRITE_FIRST_ROW
    //(red rows 0 to 5, black rows 6 to 11). Game.scss holds the sheet's size ($wooden-disc-sprite-columns / -rows): keep in sync
    private static readonly WOODEN_SPRITE_COLUMNS = 10;
    private static readonly WOODEN_SPRITE_ROWS_PER_COLOR = 6;
    private static readonly WOODEN_SPRITE_FIRST_ROW: Record<DiscColor, number> = { red: 0, black: 6 };
    private static readonly DISC_SLOT_KINDS: DiscSlot['kind'][] = ['board', 'reserve', 'status']; //hashed by index (getDiscLook)
    private static readonly UNDO_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12a7 7 0 1 0 2.05-4.95"/><path d="M11 7.05H7.05V3.1"/></svg>';
    //a target ring's dashed outline (legal spots and replaceable towers): Game.scss sizes the SVG to the ring and marches its
    //dashes. pathLength 100 makes the dash pattern a whole number around the ring; the attributes are a fallback for a browser
    //without CSS ellipse geometry (the stroke then centred on the box's edge)
    private static readonly SPOT_RING_SVG = '<svg class="spot-ring" aria-hidden="true" focusable="false"><ellipse cx="50%" cy="50%" rx="50%" ry="50%" pathLength="100"/></svg>';
    //the confirm button's icon: a tick
    private static readonly CONFIRM_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

    constructor(private game: Game, towers: NexoTower[]) {
        this.boardElement = document.getElementById('nexo-board') as HTMLDivElement;
        this.columnElement = document.getElementById('nexo-board-column') as HTMLDivElement | null;
        this.boardSize = this.readBoardSize();
        this.boardElement.style.setProperty('--board-size', this.boardSize.toString());
        this.boardElement.innerHTML = `
            <div class="board-layer">
                <div class="spots-layer"></div>
                <div class="towers-layer"></div>
                <div class="draft-controls-layer"></div>
                <div class="board-message-layer"></div>
            </div>
        `;
        this.layerElement = this.boardElement.querySelector('.board-layer');
        this.spotsLayer = this.boardElement.querySelector('.spots-layer');
        this.towersLayer = this.boardElement.querySelector('.towers-layer');
        this.controlsLayer = this.boardElement.querySelector('.draft-controls-layer');
        this.messageLayer = this.boardElement.querySelector('.board-message-layer');

        for(const tower of towers)
            this.addBoardTower(tower);

        this.fitToViewport();
        this.renderSpots();
        this.centerContents(false); //on load (F5, a replay's start): no slide

        //BGA's onScreenWidthChange (Game) only follows the width, and the page above the board is still being laid out when
        //setup measures it (a board measured too low stayed too small): fit again on every window resize and whenever the
        //layout around the board changes, one fit per frame (requestFit). Never on anything whose size follows the board's (body,
        //the page's height, the container's height, the column and the avatars' overlay): a fit there would answer its own resize.
        //So: the container's width only (the columns settling), and everything laid out before the column, whose height moves
        //its top (BGA's bars, the status bar, panels above the game area; observeLayoutAboveBoard)
        window.addEventListener('resize', () => {
            this.lastWindowResizeAt = performance.now();
            this.requestFit();
        });
        let observedContainerWidth = -1;
        const widthObserver = new ResizeObserver(entries => {
            const width = entries[entries.length - 1].contentRect.width;
            if(width !== observedContainerWidth){
                observedContainerWidth = width;
                this.requestFit();
            }
        });
        const container = this.getContainerElement();
        if(container)
            widthObserver.observe(container);
        this.observeStatusBar();
        this.observeLayoutAboveBoard(new ResizeObserver(() => this.requestFit()));

        this.layerElement.addEventListener('click', (event: MouseEvent) => this.onBoardClick(event));
    }

    //fits the board on the next frame, once, however many times it is asked for before then (resize, BGA's onScreenWidthChange,
    //the layout observers)
    public requestFit(): void {
        if(this.fitFrame)
            return;
        this.fitFrame = requestAnimationFrame(() => {
            this.fitFrame = 0;
            this.fitToViewport();
        });
    }

    //[BGA] mobile: the status bar's (#page-title) height on screen, as --status-bar-height on the container, whose top padding takes
    //up what the bar is short of its tallest state (Game.scss: $status-bar-mobile-reserved-height), so the board never moves when
    //the bar changes height. A ResizeObserver runs after layout and before paint, so the padding changes in the same frame as the
    //bar, and the fit (requestFit, the next frame) finds the board's top where it was. Written on desktop too, where nothing reads it
    private observeStatusBar(): void {
        const statusBar = document.getElementById('page-title');
        const container = this.getContainerElement();
        if(!statusBar || !container)
            return;
        const update = (): void => {
            const height = `${Math.round(statusBar.getBoundingClientRect().height * 100) / 100}px`; //screen px, BGA's zoom included
            if(container.style.getPropertyValue('--status-bar-height') !== height)
                container.style.setProperty('--status-bar-height', height);
        };
        update();
        new ResizeObserver(update).observe(statusBar);
    }

    //observes every element laid out before the board: the earlier siblings of the board's column and of each of its ancestors
    //up to body (BGA's top bar, the status bar, anything above the game area), never the board's own siblings (the avatars'
    //overlay, sized from the board). Their size moves the board's top, never the other way round. One added before the board later (or removed from there) is observed and fits again; anything added
    //after it (the flying copies, popins and dialogs at the end of body) is ignored
    private observeLayoutAboveBoard(observer: ResizeObserver): void {
        const ancestors: Element[] = [];
        for(let node: Element | null = this.columnElement ?? this.boardElement.parentElement; node && node !== document.documentElement; node = node.parentElement)
            ancestors.push(node);
        for(const ancestor of ancestors)
            for(let sibling = ancestor.previousElementSibling; sibling; sibling = sibling.previousElementSibling)
                observer.observe(sibling);
        const statusBar = document.getElementById('page-title');
        if(statusBar)
            observer.observe(statusBar); //already among them in BGA's layout; observing it twice does nothing

        //a node at or before the board in the page's order: it holds the board, or the board comes after it
        const isAboveBoard = (node: Node | null): boolean => !!node && (node.contains(this.boardElement) || !!(node.compareDocumentPosition(this.boardElement) & Node.DOCUMENT_POSITION_FOLLOWING));
        const childrenObserver = new MutationObserver(mutations => {
            let moved = false;
            for(const mutation of mutations){
                mutation.addedNodes.forEach(node => {
                    if(node instanceof Element && isAboveBoard(node) && !node.contains(this.boardElement)){
                        observer.observe(node);
                        moved = true;
                    }
                });
                if(mutation.removedNodes.length > 0 && isAboveBoard(mutation.nextSibling))
                    moved = true;
            }
            if(moved)
                this.requestFit();
        });
        for(const ancestor of ancestors)
            childrenObserver.observe(ancestor, { childList: true });
    }

    /**
     * [BGA] The board as big as the window allows: its grid square plus its top band (the players' avatars and reserves), in a
     * column padded for the avatars' parts outside the board (--board-extra-span-x / -y, in spots, so it all scales with the
     * board), from #nexo-board-container's padding under the status bar down to BOARD_VIEWPORT_MARGIN above the window's bottom
     * when the page is at its top (then the gap under it, $below-board-gap-*, and BGA's settings below), never wider than the game
     * area, nor smaller than MIN_BOARD_CELL_SIZE spots. Sized through --cell-size on #nexo-board, so the towers, spots and the
     * layer's translate scale with it, and --board-cell-size on the column, which sizes the avatars and reserves.
     * Measured on screen, converted with the container's measured zoom (BGA scales the game area down on a phone). The room is
     * measured from what doesn't follow the board's size: the container's width (html's scrollbar-gutter keeps a scrollbar from
     * changing it), and the window's height under the column's top edge (the column's padding follows the board's size, so the
     * board's top would). The spot size is only computed again when that room changed by FIT_ROOM_THRESHOLD or more
     * since the last time (or the board no longer fits across), so a few px of jitter can never make it flip between two sizes;
     * and right after a shrink, it never grows straight back into the room it shrank from unless the window was resized (a
     * board whose own size made a scrollbar come and go would otherwise flip between two sizes forever)
     */
    public fitToViewport(): void {
        const container = this.getContainerElement();
        if(!container)
            return;

        //BGA switches to and from its mobile layout as the window changes, and the edge padding with it: centre again at once
        const boardSize = this.readBoardSize();
        const boardSizeChanged = boardSize !== this.boardSize;
        if(boardSizeChanged){
            this.boardSize = boardSize;
            this.boardElement.style.setProperty('--board-size', boardSize.toString());
        }

        const containerRect = container.getBoundingClientRect();
        const containerWidth = parseFloat(getComputedStyle(container).width); //unrounded, unlike offsetWidth
        if(!(containerWidth > 0))
            return;
        const zoom = containerRect.width / containerWidth;

        //the column is boardSize + extra.x spots across (the avatars outside the board's sides) and boardSize + extra.y down (the
        //avatars above it and the board's top band)
        const extra = this.readColumnExtraSpans();
        const columnTop = (this.columnElement ?? this.boardElement).getBoundingClientRect().top + window.scrollY; //on the page, in screen px
        const borders = this.boardElement.offsetWidth - this.boardElement.clientWidth; //the board's own border, both sides
        const maxHeight = (window.innerHeight - columnTop - Game.BOARD_VIEWPORT_MARGIN) / zoom - borders;
        const maxWidth = containerWidth - borders;

        const currentCellSize = parseFloat(this.boardElement.style.getPropertyValue('--cell-size'));
        const fitted = this.fittedRoom;
        const roomUnchanged = !!fitted && fitted.boardSize === this.boardSize && fitted.extraX === extra.x && fitted.extraY === extra.y && currentCellSize > 0
            && Math.abs(maxWidth - fitted.width) < Game.FIT_ROOM_THRESHOLD && Math.abs(maxHeight - fitted.height) < Game.FIT_ROOM_THRESHOLD
            && (currentCellSize * (this.boardSize + extra.x) <= maxWidth + 0.5 || currentCellSize <= Game.MIN_BOARD_CELL_SIZE); //a board too wide for the container always shrinks
        let cellSize = roomUnchanged ? currentCellSize : Math.max(Game.MIN_BOARD_CELL_SIZE, Math.floor(Math.min(maxHeight / (this.boardSize + extra.y), maxWidth / (this.boardSize + extra.x))));
        if(!roomUnchanged){
            const now = performance.now();
            const shrink = this.lastShrink;
            const growsBack = cellSize > currentCellSize && !!shrink && now - shrink.at < Game.FIT_GROW_BACK_WINDOW && this.lastWindowResizeAt < shrink.at
                && shrink.roomBefore.boardSize === this.boardSize && shrink.roomBefore.extraX === extra.x && shrink.roomBefore.extraY === extra.y
                && Math.abs(maxWidth - shrink.roomBefore.width) < Game.FIT_ROOM_THRESHOLD && Math.abs(maxHeight - shrink.roomBefore.height) < Game.FIT_ROOM_THRESHOLD;
            if(growsBack)
                cellSize = currentCellSize; //stays at the smaller size, which fits both rooms
            else if(cellSize < currentCellSize && fitted && Math.abs(maxHeight - fitted.height) < Game.FIT_ROOM_THRESHOLD)
                this.lastShrink = { at: now, roomBefore: fitted }; //only a shrink the width alone caused (a scrollbar): never the status bar's height flickering
            this.fittedRoom = { width: maxWidth, height: maxHeight, boardSize: this.boardSize, extraX: extra.x, extraY: extra.y };
        }
        if(this.boardElement.style.getPropertyValue('--cell-size') !== cellSize + 'px')
            this.boardElement.style.setProperty('--cell-size', cellSize + 'px');
        //the avatars' and reserves' sizes, and the column's padding, are shares of the board's spot (Game.scss: #nexo-board-column)
        if(this.columnElement && this.columnElement.style.getPropertyValue('--board-cell-size') !== cellSize + 'px')
            this.columnElement.style.setProperty('--board-cell-size', cellSize + 'px');
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

        if(boardSizeChanged && this.contentsCenterX !== null){
            this.contentsCenterX = null; //applies again, without a slide
            this.contentsCenterY = null;
            this.centerContents(false);
        }
    }

    //#nexo-board-container: the game area's column the board is centred in, whose width alone (never its height) sizes the board
    private getContainerElement(): HTMLElement | null {
        return document.getElementById('nexo-board-container') ?? this.boardElement.parentElement;
    }

    //[BGA] what the column adds to the board's span, in spots (Game.scss: #nexo-board-column): across, the avatars outside the board's
    //sides; down, the avatars above it and the board's top band. 0 when unset
    private readColumnExtraSpans(): { x: number; y: number; } {
        if(!this.columnElement)
            return { x: 0, y: 0 };
        const style = getComputedStyle(this.columnElement);
        const read = (name: string) => { const value = parseFloat(style.getPropertyValue(name)); return value >= 0 ? value : 0; };
        return { x: read('--board-extra-span-x'), y: read('--board-extra-span-y') };
    }

    //the board's span in spots: the largest box (gridSize + 1) plus Game.scss's --board-edge-padding on each side
    private readBoardSize(): number {
        const padding = parseFloat(getComputedStyle(this.boardElement).getPropertyValue('--board-edge-padding'));
        return this.game.getRules().gridSize + 1 + 2 * (padding >= 0 ? padding : 0.5);
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
    //used for log rows, each sized by its own --cell-size. Its discs' looks come from their slots on spot (getDiscLook), so the
    //same tower on the same spot always looks the same: on the board, drafted, flying, in the log, after a reload. The height
    //number follows the top disc's offset
    public static createTowerDiv(discColor: DiscColor, height: number, spot: NexoSpot, extraClass: string = ''): HTMLDivElement {
        const tower = document.createElement('div');
        tower.className = 'nexo-tower' + (extraClass ? ' ' + extraClass : '');
        tower.setAttribute('data-disc-color', discColor);
        tower.setAttribute('data-height', height.toString());
        tower.style.setProperty('--tower-height', height.toString());

        let discsHTML = '';
        let topLook: DiscLook | null = null;
        for(let discIndex = 0; discIndex < height; discIndex++){
            topLook = BoardHandler.getDiscLook(discColor, { kind: 'board', x: spot.x, y: spot.y, level: discIndex });
            discsHTML += `<div class="tower-disc" style="--disc-index: ${discIndex}; ${BoardHandler.getDiscLookStyle(topLook)}"></div>`;
        }
        const numberStyle = topLook ? ` style="--jitter-x: ${topLook.jitterX}; --jitter-y: ${topLook.jitterY}"` : '';
        tower.innerHTML = discsHTML + `<div class="tower-height-number"${numberStyle}>${height}</div>`;
        return tower;
    }

    /**
     * [BGA] A disc's look (its wooden sprite and its hand-piled jitter: offsets and the grain's rotation), from a hash of its color
     * and its slot alone, never Math.random(): discs have no ids, so the same slot always gives the same disc, after a reload, in a
     * replay, in the log's tower icons and while the drafted towers are rebuilt on every click. Set once, inline, when the disc's
     * element is made (getDiscLookStyle), whatever the disc style, so switching style redraws nothing; nothing ever writes it
     * again. Each disc's offsets are its own, not added to the ones below, so a stack never leans, and a disc added on top never
     * changes the ones under it. A disc flying between a reserve stack and the board is a copy of the tower it lands in, so it
     * lands with its own look (Game.animateTowerSlide); it shows its new look from the moment it leaves the stack, at the
     * stack's size
     */
    public static getDiscLook(discColor: DiscColor, slot: DiscSlot): DiscLook {
        const hash = (salt: number) => BoardHandler.hashDiscSlot(discColor === 'red' ? 0 : 1, BoardHandler.DISC_SLOT_KINDS.indexOf(slot.kind), slot.x, slot.y, slot.level, salt);
        const round = (value: number) => Math.round(value * 1000) / 1000;
        return {
            col: Math.floor(hash(1) * BoardHandler.WOODEN_SPRITE_COLUMNS),
            row: BoardHandler.WOODEN_SPRITE_FIRST_ROW[discColor] + Math.floor(hash(2) * BoardHandler.WOODEN_SPRITE_ROWS_PER_COLOR),
            jitterX: round(hash(3) * 2 - 1),
            jitterY: round(hash(4) * 2 - 1),
            rotation: Math.floor(hash(5) * 360),
        };
    }

    //the inline style a disc's look takes (Game.scss reads them), for HTML strings and new elements
    public static getDiscLookStyle(look: DiscLook): string {
        return `--col: ${look.col}; --row: ${look.row}; --jitter-x: ${look.jitterX}; --jitter-y: ${look.jitterY}; --jitter-rot: ${look.rotation}deg`;
    }

    //a number in [0, 1) from whole numbers (negative ones too), the same for the same numbers on every browser: 32-bit
    //multiply-xorshift mixing (Math.imul), one round per value
    private static hashDiscSlot(...values: number[]): number {
        let hash = 0x9e3779b9;
        for(const value of values){
            hash = Math.imul(hash ^ (value | 0), 0x85ebca6b);
            hash ^= hash >>> 13;
            hash = Math.imul(hash, 0xc2b2ae35);
            hash ^= hash >>> 16;
        }
        return (hash >>> 0) / 4294967296;
    }

    //the spot element now on the page at spot (renderSpots redraws them on every draft change), null if not shown
    public getSpotElement(spot: NexoSpot): HTMLDivElement | null {
        return this.spotsLayer.querySelector(`.board-spot[data-x="${spot.x}"][data-y="${spot.y}"]`);
    }

    //the confirm button under the active drafted tower, null when none shows (renderPendingControls rebuilds it on every draft change)
    public getConfirmButton(): HTMLButtonElement | null { return this.controlsLayer.querySelector('.pending-confirm-button'); }

    public getTowers(): NexoTower[] { return Array.from(this.towers.values()); }
    public getTowerMap(): Map<string, NexoTower> { return new Map(this.towers); }

    private addBoardTower(tower: NexoTower): HTMLDivElement {
        const key = BoardRules.key(tower.x, tower.y);
        const towerElement = BoardHandler.createTowerDiv(this.game.getDiscColor(tower.player_id), tower.height, tower, 'board-tower');
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
        //every ring's dashes march on one clock (Game.scss: spot-ring-march): rebuilt spots carry on instead of starting over
        this.spotsLayer.style.setProperty('--spot-ring-march-delay', `-${Math.round(performance.now())}ms`);
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
                if(legalKeys.has(key) || replaceableKeys.has(key))
                    spot.innerHTML = BoardHandler.SPOT_RING_SVG; //the dashed outline (the fill is the spot's ::before)

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

        //rebuilt on every draft change: each disc's look comes from its slot (getDiscLook), so a click that adds a disc changes
        //none under it, and the tower that replaces the drafted one after Confirm looks exactly the same
        for(const pendingTower of this.draft?.pending ?? []){
            const key = BoardRules.key(pendingTower.x, pendingTower.y);
            const pendingElement = BoardHandler.createTowerDiv(this.draft.discColor, pendingTower.height, pendingTower, 'board-tower pending-tower');
            BoardHandler.placeOnBoard(pendingElement, pendingTower);
            this.towersLayer.appendChild(pendingElement);
            this.pendingElements.set(key, pendingElement);
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
        //clickable only for the player drafting, as the rings are (never in a replay, nor while the turn is on its way)
        const showWarnings = !!this.draft && !this.draft.confirming && !this.game.isReplay();
        const warningKeys = new Set(showWarnings ? this.draft.warningTowers.map(tower => BoardRules.key(tower.x, tower.y)) : []);
        this.towerElements.forEach((element, key) => {
            element.classList.toggle('being-replaced', replacedKeys.has(key));
            element.classList.toggle('warning-tower', warningKeys.has(key));
        });
        if(!this.draft)
            this.clearTowerMessage();
    }

    /**
     * [BGA] A board tower the player clicked but can't draft on (PlaceTowers.getTowerWarningHTML: their own, or an enemy tower too
     * high for the discs left), every case alike: it shakes (shakeTower) and a bubble over it says why (showTowerMessage), one
     * bubble at a time, a new one replacing it. Client only: nothing changes on the board
     */
    public showTowerWarning(spot: NexoSpot, messageHTML: string): void {
        const towerElement = this.towerElements.get(BoardRules.key(spot.x, spot.y));
        if(!towerElement)
            return;
        this.showTowerMessage(spot, towerElement, messageHTML); //measured before the shake moves it
        this.shakeTower(towerElement);
    }

    //a short shake (one-shot .shaking-tower, the translate property, so it never fights a transform), restarted by a click
    //mid-shake; none with reduced motion or animations off
    private shakeTower(towerElement: HTMLDivElement): void {
        if(!this.game.bga.gameui.bgaAnimationsActive() || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        towerElement.classList.remove('shaking-tower');
        void towerElement.offsetWidth; //restarts it when clicked again mid-shake
        towerElement.classList.add('shaking-tower');
        towerElement.addEventListener('animationend', function onEnd(event: AnimationEvent){
            if(event.target !== towerElement)
                return;
            towerElement.classList.remove('shaking-tower');
            towerElement.removeEventListener('animationend', onEnd);
        });
    }

    //a speech bubble just over the tower's top face, its arrow pointing down at it, in its own layer over everything on the board
    //(the board clips it, so it never leaves the board). Nudged sideways to stay TOWER_MESSAGE_EDGE_MARGIN inside the board's
    //edges (the arrow keeps pointing at the tower), under the tower instead when there is no room above. Fades in, stays
    //TOWER_MESSAGE_HOLD, fades out and leaves the page; a new one replaces it. No clicks. messageHTML: a translated sentence
    //(from _(), with our own disc icon and numbers in it)
    private showTowerMessage(spot: NexoSpot, towerElement: HTMLDivElement, messageHTML: string): void {
        this.clearTowerMessage();

        const message = document.createElement('div');
        message.className = 'tower-message';
        message.setAttribute('role', 'status');
        message.style.setProperty('--tower-message-fade-in', `${Game.TOWER_MESSAGE_FADE_IN}ms`);
        message.style.setProperty('--tower-message-fade-out', `${Game.TOWER_MESSAGE_FADE_OUT}ms`);
        const textElement = document.createElement('span');
        textElement.className = 'tower-message-text';
        textElement.innerHTML = messageHTML;
        const arrow = document.createElement('span');
        arrow.className = 'tower-message-arrow';
        message.append(textElement, arrow);

        //anchored in the layer's own px: across, the spot's middle; up and down, the tower's top face (or bottom, below it)
        const zoom = parseFloat(this.boardElement.style.getPropertyValue('--board-zoom')) || 1;
        const cellSize = parseFloat(this.boardElement.style.getPropertyValue('--cell-size')) || 0;
        const layerRect = this.layerElement.getBoundingClientRect();
        const discs = towerElement.querySelectorAll<HTMLElement>(':scope > .tower-disc');
        const topRect = discs[discs.length - 1]?.getBoundingClientRect() ?? towerElement.getBoundingClientRect();
        const bottomRect = discs[0]?.getBoundingClientRect() ?? towerElement.getBoundingClientRect();
        message.style.setProperty('--message-x', `${(spot.x + 0.5) * cellSize}px`);
        message.style.setProperty('--message-above-y', `${(topRect.top - layerRect.top) / zoom}px`);
        message.style.setProperty('--message-below-y', `${(bottomRect.bottom - layerRect.top) / zoom}px`);
        message.setAttribute('data-placement', 'above');
        this.messageLayer.appendChild(message);

        //kept inside the board: measured where it landed, in screen px, converted back with the board's zoom
        const boardRect = this.boardElement.getBoundingClientRect();
        const margin = Game.TOWER_MESSAGE_EDGE_MARGIN;
        if(message.getBoundingClientRect().top < boardRect.top + margin)
            message.setAttribute('data-placement', 'below');
        const messageRect = message.getBoundingClientRect();
        let shift = 0;
        if(messageRect.left < boardRect.left + margin)
            shift = boardRect.left + margin - messageRect.left;
        else if(messageRect.right > boardRect.right - margin)
            shift = boardRect.right - margin - messageRect.right;
        message.style.setProperty('--message-shift', `${shift / zoom}px`);

        const timers = [
            window.setTimeout(() => message.classList.add('leaving-tower-message'), Game.TOWER_MESSAGE_FADE_IN + Game.TOWER_MESSAGE_HOLD),
            window.setTimeout(() => this.clearTowerMessage(message), Game.TOWER_MESSAGE_FADE_IN + Game.TOWER_MESSAGE_HOLD + Game.TOWER_MESSAGE_FADE_OUT),
        ];
        this.towerMessage = { element: message, timers: timers };
    }

    //removes the bubble at once (only `message` when given, so an old timer never removes a newer one)
    private clearTowerMessage(message: HTMLDivElement | null = null): void {
        if(!this.towerMessage || (message && this.towerMessage.element !== message))
            return;
        this.towerMessage.timers.forEach(timer => window.clearTimeout(timer));
        this.towerMessage.element.remove();
        this.towerMessage = null;
    }

    //a click on a highlighted spot (empty or an enemy tower) or on a tower of the draft: PlaceTowers drafts or cycles its height
    private onBoardClick(event: MouseEvent): void {
        if(!this.draftClickHandlers)
            return;

        const target = event.target as HTMLElement;
        if(target.closest('.pending-actions'))
            return; //a disabled button's click, which no listener of its own receives: never a click on the tower under it
        const warningTower = target.closest('.warning-tower') as HTMLElement | null;
        if(warningTower){
            this.draftClickHandlers.warningTowerClicked({ x: parseInt(warningTower.getAttribute('data-x')), y: parseInt(warningTower.getAttribute('data-y')) });
            return;
        }
        const clicked = (target.closest('.pending-tower') ?? target.closest('.board-spot.clickable-spot')) as HTMLElement | null;
        if(!clicked)
            return;

        this.draftClickHandlers.spotClicked({ x: parseInt(clicked.getAttribute('data-x')), y: parseInt(clicked.getAttribute('data-y')) });
    }

    /**
     * A confirmed turn, played one spot at a time in the order the turn was drafted (the payload's order): on each spot, the
     * replaced enemy tower (if any) flies back onto its owner's reserve stacks on the board's top edge, top disc first, while
     * the new tower's discs fly from the top of the player's stacks onto it, bottom disc first (discs TOWER_DISC_STAGGER
     * apart); the next spot starts TOWER_SPOT_DELAY_SHARE (0.3) of the way through this one's flight. Every viewer sees the same flights, the player who drafted
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

        //each spot's flights start TOWER_SPOT_DELAY_SHARE of the previous spot's flight time after it (or once it has landed,
        //if that comes first); the turn ends once every disc has landed
        const animate = this.game.bga.gameui.bgaAnimationsActive();
        const allFlights: Promise<void>[] = [];
        for(const placement of placements){
            const flights = this.applyPlacement(playerID, placement, draftedElements, animate);
            if(flights.length === 0)
                continue;

            allFlights.push(...flights);
            const spotDiscCount = Math.max(placement.height, placement.replaced_height ?? 0);
            const spotFlightMs = Game.TOWER_SLIDE_DURATION + (spotDiscCount - 1) * Game.TOWER_DISC_STAGGER;
            await Promise.race([Promise.all(flights), this.game.bga.gameui.wait(spotFlightMs * Game.TOWER_SPOT_DELAY_SHARE)]);
        }
        if(allFlights.length > 0)
            await Promise.all(allFlights);

        draftedElements.forEach(element => element.remove()); //never expected: the server keeps every drafted tower
        this.renderSpots();
    }

    //one spot of a confirmed turn: swaps its towers on the board, moves their discs between the players' reserve stacks (board's top edge)
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

    /**
     * [BGA] The towers a log row touched jump (LogHighlightHandler: hovering the row, or tapping it): `jumps` quick jumps in a row
     * (Game.scss: tower-jump, one CSS animation, its iteration count --tower-jumps), or with reduced motion one brightness pulse
     * instead. Only the tower moves (its translate and scale properties, never a transform: towers are cloned to fly): the
     * target rings live in the spots layer, and the end-game glow under it (its ::before) runs the opposite animation, so it
     * stays on the ground. Found by board coordinates, so they follow however the grid grew or slid; a spot with no tower is
     * skipped. A tower already jumping (or shaking) is left alone, never restarted. The class goes on animationend (the tower's
     * own, not its ::before's), or after a safety timeout if that never comes (a tower hidden meanwhile)
     */
    public jumpTowers(spots: NexoSpot[], jumps: number): void {
        for(const spot of spots){
            if(!Number.isInteger(spot?.x) || !Number.isInteger(spot?.y))
                continue;
            const towerElement = this.towerElements.get(BoardRules.key(spot.x, spot.y));
            if(!towerElement || towerElement.classList.contains('jumping-tower') || towerElement.classList.contains('shaking-tower'))
                continue;

            towerElement.style.setProperty('--tower-jumps', jumps.toString());
            towerElement.classList.add('jumping-tower');
            const endJump = () => {
                towerElement.classList.remove('jumping-tower');
                towerElement.removeEventListener('animationend', onEnd);
                window.clearTimeout(this.towerJumpSafetyTimers.get(towerElement));
                this.towerJumpSafetyTimers.delete(towerElement);
            };
            const onEnd = (event: AnimationEvent) => {
                if(event.target === towerElement && !event.pseudoElement)
                    endJump();
            };
            towerElement.addEventListener('animationend', onEnd);
            this.towerJumpSafetyTimers.set(towerElement, window.setTimeout(endJump, jumps * Game.TOWER_JUMP_SAFETY_PER_JUMP + Game.TOWER_JUMP_SAFETY_MARGIN));
        }
    }
}
