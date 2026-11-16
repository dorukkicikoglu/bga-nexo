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
//the board rules the draft needs, the same as NEXOTableManager's (which checks the whole turn again on confirm). A board is a
//Map "x,y" => spot; every method is pure
class BoardRules {
    constructor(rules) {
        this.rules = rules;
    }
    static key(x, y) { return x + ',' + y; }
    getRules() { return this.rules; }
    //the most discs a player may still use this turn: never more than maxDiscsPerTurn in a turn, never more than their reserve
    getDiscsLeftThisTurn(reserve, discsUsed) {
        return Math.max(0, Math.min(this.rules.maxDiscsPerTurn, reserve) - discsUsed);
    }
    static getBounds(board) {
        if (board.size === 0)
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
    fitsGrid(board, x, y) {
        const bounds = BoardRules.getBounds(board);
        if (!bounds)
            return true;
        return Math.max(bounds.maxX, x) - Math.min(bounds.minX, x) + 1 <= this.rules.gridSize
            && Math.max(bounds.maxY, y) - Math.min(bounds.minY, y) + 1 <= this.rules.gridSize;
    }
    //empty spots where a new tower may go: orthogonally adjacent to a tower, within the grid. The first tower of the game goes at 0 0
    getLegalNewSpots(board) {
        if (board.size === 0)
            return [{ x: 0, y: 0 }];
        const spots = new Map();
        for (const spot of board.values()) {
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const x = spot.x + dx, y = spot.y + dy;
                const key = BoardRules.key(x, y);
                if (board.has(key) || spots.has(key) || !this.fitsGrid(board, x, y))
                    continue;
                spots.set(key, { x: x, y: y });
            }
        }
        return Array.from(spots.values());
    }
    //the spots the grid can still reach: every column from maxX - (gridSize - 1) to minX + (gridSize - 1), the same for rows.
    //Once gridSize columns (or rows) are taken, only those remain. Null for an empty board (anywhere)
    getPossibleArea(board) {
        const bounds = BoardRules.getBounds(board);
        if (!bounds)
            return null;
        const reach = this.rules.gridSize - 1;
        return { minX: bounds.maxX - reach, maxX: bounds.minX + reach, minY: bounds.maxY - reach, maxY: bounds.minY + reach };
    }
    //the heights a tower on this spot may have with maxHeight discs left: from 1 (a new tower) or the enemy tower's height + 1
    getHeightOptions(replacedHeight, discsLeft) {
        const minHeight = (replacedHeight === null) ? this.rules.minTowerHeight : replacedHeight + 1;
        const maxHeight = Math.min(this.rules.maxTowerHeight, discsLeft);
        const heights = [];
        for (let height = minHeight; height <= maxHeight; height++)
            heights.push(height);
        return heights;
    }
    //the keys of the spots orthogonally connected to startKey (itself included), among board's spots
    static getComponent(board, startKey) {
        const visited = new Set([startKey]);
        const queue = [startKey];
        while (queue.length > 0) {
            const spot = board.get(queue.shift());
            for (const neighborKey of [BoardRules.key(spot.x + 1, spot.y), BoardRules.key(spot.x - 1, spot.y), BoardRules.key(spot.x, spot.y + 1), BoardRules.key(spot.x, spot.y - 1)]) {
                if (board.has(neighborKey) && !visited.has(neighborKey)) {
                    visited.add(neighborKey);
                    queue.push(neighborKey);
                }
            }
        }
        return visited;
    }
    /**
     * The draft after a tower of the turn is taken back: replacements stay, and a new tower stays only if it still reaches the
     * towers on the board through the turn's other new towers (the server checks the turn the same way). On an empty board,
     * the new towers reached from the earliest one left stay.
     */
    static keepConnectedPending(board, pending) {
        const newTowers = pending.filter(tower => tower.kind === 'new');
        if (newTowers.length === 0)
            return pending;
        const occupied = new Map(board);
        for (const tower of newTowers)
            occupied.set(BoardRules.key(tower.x, tower.y), tower);
        const reached = new Set();
        const startKeys = board.size > 0 ? Array.from(board.keys()) : [BoardRules.key(newTowers[0].x, newTowers[0].y)];
        for (const startKey of startKeys) {
            if (!reached.has(startKey))
                BoardRules.getComponent(occupied, startKey).forEach(key => reached.add(key));
        }
        return pending.filter(tower => tower.kind === 'replace' || reached.has(BoardRules.key(tower.x, tower.y)));
    }
    //the player's largest areas of orthogonally connected towers (height doesn't matter), every one of the largest size
    static getLargestGroups(towers, playerID) {
        const ownBoard = new Map();
        for (const tower of towers) {
            if (tower.player_id === playerID)
                ownBoard.set(BoardRules.key(tower.x, tower.y), tower);
        }
        const grouped = new Set();
        const groups = [];
        for (const key of ownBoard.keys()) {
            if (grouped.has(key))
                continue;
            const component = BoardRules.getComponent(ownBoard, key);
            component.forEach(componentKey => grouped.add(componentKey));
            groups.push(Array.from(component).map(componentKey => ({ x: ownBoard.get(componentKey).x, y: ownBoard.get(componentKey).y })));
        }
        const largestSize = Math.max(0, ...groups.map(group => group.length));
        return groups.filter(group => group.length === largestSize && largestSize > 0);
    }
}

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
/**
 * The board: a window of (2 * gridSize - 1) x (2 * gridSize - 1) spots (9 x 9), always big enough for every spot the grid
 * can still reach this turn. The window is laid on the towers already on the board (computeWindow) and only moves after a
 * turn (recenter), never while drafting, so nothing jumps under the cursor. Spots outside the reachable area (getPossibleArea)
 * are not shown: once 5 columns or 5 rows are taken, only those remain. Towers and spots sit in .board-layer at their own
 * board coordinates, and the layer's translate (animated) brings the window into view.
 */
class BoardHandler {
    constructor(game, towers) {
        this.game = game;
        this.windowLeft = 0;
        this.windowTop = 0;
        this.towers = new Map();
        this.towerElements = new Map();
        this.pendingElements = new Map();
        this.draft = null;
        this.spotClickHandler = null;
        this.windowSize = 2 * this.game.getRules().gridSize - 1;
        this.boardElement = document.getElementById('nexo-board');
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
        for (const tower of towers)
            this.addBoardTower(tower);
        this.computeWindow();
        this.applyWindow();
        this.renderSpots();
        this.layerElement.addEventListener('click', (event) => this.onBoardClick(event));
    }
    //a tower of height discs in discColor: one .tower-disc per disc, bottom one first, and its height as a number on top. Also
    //used for log rows, the player boards' reserve and the draft panel, each sized by its own --cell-size
    static createTowerDiv(discColor, height, extraClass = '') {
        const tower = document.createElement('div');
        tower.className = 'nexo-tower' + (extraClass ? ' ' + extraClass : '');
        tower.setAttribute('data-disc-color', discColor);
        tower.setAttribute('data-height', height.toString());
        tower.style.setProperty('--tower-height', height.toString());
        let discsHTML = '';
        for (let discIndex = 0; discIndex < height; discIndex++)
            discsHTML += `<div class="tower-disc" style="--disc-index: ${discIndex}"></div>`;
        tower.innerHTML = discsHTML + `<div class="tower-height-number">${height}</div>`;
        return tower;
    }
    //the spot element now on the page at spot (renderSpots redraws them on every draft change), null if not shown
    getSpotElement(spot) {
        return this.spotsLayer.querySelector(`.board-spot[data-x="${spot.x}"][data-y="${spot.y}"]`);
    }
    getTowers() { return Array.from(this.towers.values()); }
    getTowerMap() { return new Map(this.towers); }
    addBoardTower(tower) {
        const key = BoardRules.key(tower.x, tower.y);
        const towerElement = BoardHandler.createTowerDiv(this.game.getDiscColor(tower.player_id), tower.height, 'board-tower');
        BoardHandler.placeOnBoard(towerElement, tower);
        this.towersLayer.appendChild(towerElement);
        this.towers.set(key, { x: tower.x, y: tower.y, player_id: tower.player_id, height: tower.height });
        this.towerElements.set(key, towerElement);
        return towerElement;
    }
    static placeOnBoard(element, spot) {
        element.style.setProperty('--x', spot.x.toString());
        element.style.setProperty('--y', spot.y.toString());
        element.setAttribute('data-x', spot.x.toString());
        element.setAttribute('data-y', spot.y.toString());
    }
    //the window's top-left spot, centred on the spots the grid can reach from the towers on the board: columns maxX - 4 to
    //minX + 4 (2 * gridSize - w of them, w the columns taken), so (w - 1) columns are left over, split on both sides. An
    //empty board centres the window on 0 0, where the first tower goes
    computeWindow() {
        const reach = this.game.getRules().gridSize - 1;
        const bounds = BoardRules.getBounds(this.towers);
        const left = bounds ? bounds.maxX - reach - Math.floor((bounds.maxX - bounds.minX) / 2) : -reach;
        const top = bounds ? bounds.maxY - reach - Math.floor((bounds.maxY - bounds.minY) / 2) : -reach;
        const changed = left !== this.windowLeft || top !== this.windowTop;
        this.windowLeft = left;
        this.windowTop = top;
        return changed;
    }
    applyWindow() {
        this.layerElement.style.translate = `calc(${-this.windowLeft} * var(--cell-size)) calc(${-this.windowTop} * var(--cell-size))`;
    }
    //after a turn: the window follows the towers, sliding the whole layer (towers and spots together). Instant with animations off
    async recenter() {
        const changed = this.computeWindow();
        this.renderSpots();
        if (!changed)
            return;
        if (!this.game.bga.gameui.bgaAnimationsActive()) {
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
    renderSpots() {
        this.spotsLayer.innerHTML = '';
        const occupied = new Map(this.towers);
        for (const pendingTower of this.draft?.pending ?? []) {
            if (pendingTower.kind === 'new')
                occupied.set(BoardRules.key(pendingTower.x, pendingTower.y), pendingTower);
        }
        const area = this.game.boardRules.getPossibleArea(occupied);
        const windowArea = { minX: this.windowLeft, maxX: this.windowLeft + this.windowSize - 1, minY: this.windowTop, maxY: this.windowTop + this.windowSize - 1 };
        const shownArea = area ? {
            minX: Math.max(area.minX, windowArea.minX), maxX: Math.min(area.maxX, windowArea.maxX),
            minY: Math.max(area.minY, windowArea.minY), maxY: Math.min(area.maxY, windowArea.maxY),
        } : windowArea;
        const legalKeys = new Set((this.draft?.legalNewSpots ?? []).map(spot => BoardRules.key(spot.x, spot.y)));
        const replaceableKeys = new Set((this.draft?.replaceableTowers ?? []).map(tower => BoardRules.key(tower.x, tower.y)));
        const selectedKey = this.draft?.selectedSpot ? BoardRules.key(this.draft.selectedSpot.x, this.draft.selectedSpot.y) : null;
        if (area) {
            const areaOutline = document.createElement('div');
            areaOutline.className = 'possible-area';
            areaOutline.style.setProperty('--x', shownArea.minX.toString());
            areaOutline.style.setProperty('--y', shownArea.minY.toString());
            areaOutline.style.setProperty('--columns', (shownArea.maxX - shownArea.minX + 1).toString());
            areaOutline.style.setProperty('--rows', (shownArea.maxY - shownArea.minY + 1).toString());
            this.spotsLayer.appendChild(areaOutline);
        }
        for (let y = shownArea.minY; y <= shownArea.maxY; y++) {
            for (let x = shownArea.minX; x <= shownArea.maxX; x++) {
                const key = BoardRules.key(x, y);
                const spot = document.createElement('div');
                spot.className = 'board-spot';
                BoardHandler.placeOnBoard(spot, { x: x, y: y });
                if (!occupied.has(key))
                    spot.classList.add('empty-spot');
                if (legalKeys.has(key))
                    spot.classList.add('legal-spot', 'clickable-spot');
                if (replaceableKeys.has(key))
                    spot.classList.add('replaceable-spot', 'clickable-spot');
                if (key === selectedKey)
                    spot.classList.add('selected-spot');
                this.spotsLayer.appendChild(spot);
            }
        }
        if (this.draft)
            this.boardElement.setAttribute('data-draft-color', this.draft.discColor);
        else
            this.boardElement.removeAttribute('data-draft-color');
    }
    //the turn being drafted (PlaceTowers), or null once it is over: its towers shown semi-transparent on their spots (a replaced
    //enemy tower fades under its replacement), legal spots and replaceable towers highlighted
    setDraft(draft) {
        this.draft = draft;
        this.renderPending();
        this.updateTowerDraftClasses();
        this.renderSpots();
    }
    setSpotClickHandler(handler) {
        this.spotClickHandler = handler;
        this.boardElement.classList.toggle('accepting-clicks', !!handler);
    }
    renderPending() {
        this.pendingElements.forEach(element => element.remove());
        this.pendingElements.clear();
        for (const pendingTower of this.draft?.pending ?? []) {
            const pendingElement = BoardHandler.createTowerDiv(this.draft.discColor, pendingTower.height, 'board-tower pending-tower');
            BoardHandler.placeOnBoard(pendingElement, pendingTower);
            this.towersLayer.appendChild(pendingElement);
            this.pendingElements.set(BoardRules.key(pendingTower.x, pendingTower.y), pendingElement);
        }
    }
    updateTowerDraftClasses() {
        const replacedKeys = new Set((this.draft?.pending ?? []).filter(tower => tower.kind === 'replace').map(tower => BoardRules.key(tower.x, tower.y)));
        const replaceableKeys = new Set((this.draft?.replaceableTowers ?? []).map(tower => BoardRules.key(tower.x, tower.y)));
        this.towerElements.forEach((element, key) => {
            element.classList.toggle('being-replaced', replacedKeys.has(key));
            element.classList.toggle('replaceable-tower', replaceableKeys.has(key));
        });
    }
    //a click on a tower of the draft takes it back; a click on a highlighted spot (empty or an enemy tower) selects it
    onBoardClick(event) {
        if (!this.spotClickHandler)
            return;
        const target = event.target;
        const clicked = (target.closest('.pending-tower') ?? target.closest('.board-spot.clickable-spot'));
        if (!clicked)
            return;
        this.spotClickHandler({ x: parseInt(clicked.getAttribute('data-x')), y: parseInt(clicked.getAttribute('data-y')) });
    }
    /**
     * A confirmed turn: each replaced enemy tower flies back to its owner's reserve on their player board, and each new tower
     * flies from the player's reserve to its spot, one after the other (TOWER_SLIDE_STAGGER). A tower I drafted is already in
     * place: it just becomes solid. Nothing flies with animations off. Resolves once every tower has landed.
     */
    async applyPlacements(playerID, placements) {
        //the turn is over: no more clicks while it animates (the next PlaceTowers sets a handler again)
        this.setSpotClickHandler(null);
        const draftedElements = new Map(this.pendingElements);
        this.pendingElements.clear();
        this.draft = null;
        this.updateTowerDraftClasses();
        const animate = this.game.bga.gameui.bgaAnimationsActive();
        const mover = this.game.players[playerID];
        const slides = [];
        let flightIndex = 0;
        for (const placement of placements) {
            const key = BoardRules.key(placement.x, placement.y);
            const replacedElement = this.towerElements.get(key);
            if (replacedElement) {
                this.towerElements.delete(key);
                const owner = this.game.players[placement.replaced_player_id ?? 0];
                if (animate && owner)
                    slides.push(this.game.animateSlideAway(replacedElement, owner.getReserveIconElement().getBoundingClientRect(), Game.TOWER_SLIDE_DURATION, { easing: Game.TOWER_SLIDE_EASING }));
                replacedElement.remove();
            }
            const towerElement = this.addBoardTower({ x: placement.x, y: placement.y, player_id: playerID, height: placement.height });
            const draftedElement = draftedElements.get(key);
            if (draftedElement) {
                draftedElement.remove();
                draftedElements.delete(key);
                continue;
            }
            if (animate && mover) {
                slides.push(this.game.animateSlide(towerElement, mover.getReserveIconElement(), null, Game.TOWER_SLIDE_DURATION, { easing: Game.TOWER_SLIDE_EASING, delayMs: flightIndex * Game.TOWER_SLIDE_STAGGER }));
                flightIndex++;
            }
        }
        draftedElements.forEach(element => element.remove()); //never expected: the server keeps every drafted tower
        this.renderSpots();
        await Promise.all(slides);
    }
    //end of the game: each player's largest group(s) glow in their color, every other tower dims
    highlightLargestGroups(groups) {
        this.boardElement.classList.add('showing-largest-groups');
        for (const playerID in groups) {
            for (const group of groups[playerID]) {
                for (const spot of group)
                    this.towerElements.get(BoardRules.key(spot.x, spot.y))?.classList.add('largest-group-tower');
            }
        }
    }
}

/**
 * [BGA] The active player drafts their turn on the client, then confirms it: click a highlighted spot (an empty spot next to a
 * tower, or an enemy tower they can out-height), then pick its height in the popup next to it (HeightMenu: only the heights that
 * are legal and affordable; with a single one, it is placed at once). Clicking the same spot again, outside or Escape closes the
 * popup; another highlighted spot moves it there. The status bar keeps one title for the whole draft. Each drafted tower shows semi-transparent on the board; clicking it
 * takes it back (with any new tower that no longer reaches the board through the others), "Reset turn" takes them all back,
 * "Confirm" sends the whole turn (actPlaceTowers), which the server checks again. Legal spots are recomputed after every
 * change. Everyone else only sees the status text. The draft lives on this page only: a reload starts it again.
 */
class PlaceTowers {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
        this.stateArgs = null;
        this.pending = [];
        this.selectedSpot = null;
        this.drafting = false;
    }
    /**
     * This method is called each time we are entering the game state. You can use this method to perform some user interface changes at this moment.
     */
    onEnteringState(args, isCurrentPlayerActive) {
        this.stateArgs = args;
        this.pending = [];
        this.selectedSpot = null;
        this.drafting = isCurrentPlayerActive;
        if (!isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(_('${actplayer} must place towers'));
            return;
        }
        this.game.boardHandler.setSpotClickHandler(spot => this.spotClicked(spot));
        this.update();
    }
    /**
     * This method is called each time we are leaving the game state. You can use this method to perform some user interface changes at this moment.
     */
    onLeavingState(args, isCurrentPlayerActive) {
        this.drafting = false;
        this.pending = [];
        this.selectedSpot = null;
        this.game.heightMenu.close();
        this.game.boardHandler.setSpotClickHandler(null);
        this.game.boardHandler.setDraft(null);
        this.hideDraftPanel();
    }
    getDiscsUsed() { return this.pending.reduce((sum, tower) => sum + tower.height, 0); }
    getDiscsLeft() { return Math.max(0, (this.stateArgs?.discsThisTurn ?? 0) - this.getDiscsUsed()); }
    getReserve() { return this.stateArgs?.reserve ?? 0; }
    //the towers on the board plus the draft's new towers: what adjacency and the grid's bounds are checked against
    getDraftOccupied() {
        const occupied = new Map(this.game.boardHandler.getTowerMap());
        for (const tower of this.pending) {
            if (tower.kind === 'new')
                occupied.set(BoardRules.key(tower.x, tower.y), tower);
        }
        return occupied;
    }
    getLegalNewSpots() {
        if (this.getDiscsLeft() < this.game.getRules().minTowerHeight)
            return [];
        return this.game.boardRules.getLegalNewSpots(this.getDraftOccupied());
    }
    //enemy towers on the board, not already replaced in this draft, that the discs left can out-height
    getReplaceableTowers() {
        const maxHeight = Math.min(this.game.getRules().maxTowerHeight, this.getDiscsLeft());
        const myPlayerID = this.game.getMyPlayerID();
        return this.game.boardHandler.getTowers().filter(tower => tower.player_id !== myPlayerID && tower.height + 1 <= maxHeight && !this.getPendingAt(tower));
    }
    getPendingAt(spot) {
        return this.pending.find(tower => tower.x === spot.x && tower.y === spot.y);
    }
    //the enemy tower a click on spot would replace (null for an empty spot), or undefined when the spot can't take a tower now
    getSpotTarget(spot) {
        if (this.getLegalNewSpots().some(legalSpot => legalSpot.x === spot.x && legalSpot.y === spot.y))
            return null;
        return this.getReplaceableTowers().find(tower => tower.x === spot.x && tower.y === spot.y);
    }
    getHeightOptions(spot) {
        const target = this.getSpotTarget(spot);
        if (target === undefined)
            return [];
        return this.game.boardRules.getHeightOptions(target ? target.height : null, this.getDiscsLeft());
    }
    //called by BoardHandler: a drafted tower is taken back, the selected spot is unselected, a highlighted spot is selected
    spotClicked(spot) {
        if (!this.drafting || this.game.isInterfaceLocked())
            return;
        if (this.getPendingAt(spot)) {
            this.removePending(spot);
            return;
        }
        if (this.selectedSpot && this.selectedSpot.x === spot.x && this.selectedSpot.y === spot.y) {
            this.selectedSpot = null;
            this.update();
            return;
        }
        const heightOptions = this.getHeightOptions(spot);
        if (heightOptions.length === 0)
            return;
        //[BGA] a single possible height needs no choice
        if (heightOptions.length === 1) {
            this.addPending(spot, heightOptions[0]);
            return;
        }
        this.selectedSpot = { x: spot.x, y: spot.y };
        this.update();
    }
    addPending(spot, height) {
        const target = this.getSpotTarget(spot);
        if (target === undefined || !this.getHeightOptions(spot).includes(height))
            return;
        this.pending.push({ x: spot.x, y: spot.y, height: height, kind: target ? 'replace' : 'new', replaced: target ?? null });
        this.selectedSpot = null;
        this.update();
    }
    //a new tower that no longer reaches the board through the turn's other new towers goes too (BoardRules.keepConnectedPending)
    removePending(spot) {
        const remaining = this.pending.filter(tower => tower.x !== spot.x || tower.y !== spot.y);
        this.pending = BoardRules.keepConnectedPending(this.game.boardHandler.getTowerMap(), remaining);
        this.selectedSpot = null;
        this.update();
    }
    resetTurn() {
        this.pending = [];
        this.selectedSpot = null;
        this.update();
    }
    confirmTurn() {
        if (this.pending.length === 0)
            return;
        const placements = this.pending.map(tower => ({ x: tower.x, y: tower.y, height: tower.height }));
        this.bga.actions.performAction('actPlaceTowers', { placements: JSON.stringify(placements) });
    }
    //redraws everything the draft shows: the board (drafted towers, legal spots, replaceable towers), the draft panel and the status bar
    update() {
        if (!this.drafting)
            return;
        const legalNewSpots = this.getLegalNewSpots();
        const replaceableTowers = this.getReplaceableTowers();
        if (this.selectedSpot && this.getHeightOptions(this.selectedSpot).length === 0)
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
    updateStatusBar() {
        this.bga.statusBar.removeActionButtons();
        const discsThisTurn = this.stateArgs?.discsThisTurn ?? 1;
        const title = discsThisTurn > 1 ? _('${you} must place 1 to ${count} discs') : _('${you} must place 1 disc');
        this.bga.statusBar.setTitle(title, { count: discsThisTurn });
        if (this.pending.length === 0)
            return;
        this.bga.statusBar.addActionButton(_('Confirm'), () => this.confirmTurn(), { id: 'confirm-turn-button' });
        this.bga.statusBar.addActionButton(_('Reset turn'), () => this.resetTurn(), { id: 'reset-turn-button', color: 'secondary' });
    }
    //[BGA] the selected spot's heights in a popup next to it (HeightMenu): a choice drafts the tower, a dismissal (a click outside,
    //Escape) unselects the spot. Called after setDraft, so the spot it anchors to is on the page
    updateHeightMenu() {
        const selectedSpot = this.selectedSpot;
        if (!selectedSpot) {
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
    renderDraftPanel() {
        const panel = document.getElementById('draft-panel');
        if (!panel)
            return;
        const rules = this.game.getRules();
        const discColor = this.game.getDiscColor(this.game.getMyPlayerID());
        const discsUsed = this.getDiscsUsed();
        const discsThisTurn = this.stateArgs?.discsThisTurn ?? 0;
        let pipsHTML = '';
        for (let discIndex = 0; discIndex < rules.maxDiscsPerTurn; discIndex++) {
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
    hideDraftPanel() {
        document.getElementById('draft-panel')?.classList.remove('drafting');
    }
}

/**
 * BGA's final state: the game is over, so the board takes no more clicks and shows no draft.
 */
class GameEnd {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    /**
     * This method is called each time we are entering the game state. You can use this method to perform some user interface changes at this moment.
     */
    onEnteringState(args, isCurrentPlayerActive) {
        this.game.boardHandler.setSpotClickHandler(null);
        this.game.boardHandler.setDraft(null);
    }
    /**
     * This method is called each time we are leaving the game state. You can use this method to perform some user interface changes at this moment.
     */
    onLeavingState(args, isCurrentPlayerActive) {
    }
}

class PlayerHandler {
    constructor(game, playerID, playerName, playerColor, playerNo, reserve, passed, score) {
        this.game = game;
        this.playerID = playerID;
        this.playerName = playerName;
        this.playerColor = playerColor;
        this.playerNo = playerNo;
        this.reserve = reserve;
        this.passed = passed;
        this.score = score;
        this.createPlayerBoardContainer();
        this.setReserve(this.reserve);
        this.setPassed(this.passed);
    }
    //every player board, spectators included, shows the reserve (a disc in the player's color and its count) and, after an
    //automatic pass, a PASSED stamp (shown by data-passed). The score is BGA's own counter: the player's largest group
    createPlayerBoardContainer() {
        this.playerBoardContainer = document.createElement('div');
        this.playerBoardContainer.classList.add('nexo-player-board');
        this.playerBoardContainer.innerHTML = `
            <div class="player-board-reserve-row">
                <div class="reserve-indicator">
                    <span class="reserve-icon-slot"></span>
                    <span class="reserve-times">×</span>
                    <span class="reserve-count"></span>
                </div>
                <div class="passed-stamp"><i class="fa6 fa-forward"></i>${_('Passed')}</div>
            </div>
        `;
        const playerPanel = this.game.bga.playerPanels.getElement(this.playerID);
        playerPanel.appendChild(this.playerBoardContainer);
        this.reserveIcon = BoardHandler.createTowerDiv(this.game.getDiscColor(this.playerID), 1, 'mini-tower reserve-tower-icon');
        this.playerBoardContainer.querySelector('.reserve-icon-slot').appendChild(this.reserveIcon);
        this.reserveCount = this.playerBoardContainer.querySelector('.reserve-count');
        this.boardElement = playerPanel.closest('.player-board') ?? playerPanel; //BGA's whole board around our panel
        this.boardElement.classList.add('positioned-player-board');
        this.boardElement.addEventListener('animationend', (event) => {
            if (event.target === this.boardElement && event.animationName === PlayerHandler.BOUNCE_CLASS)
                this.boardElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        });
        //ids for TooltipHandler
        this.playerBoardContainer.querySelector('.reserve-indicator').id = 'reserve-indicator-' + this.playerID;
        this.playerBoardContainer.querySelector('.passed-stamp').id = 'passed-stamp-' + this.playerID;
    }
    setReserve(reserve) {
        this.reserve = reserve;
        this.reserveCount.textContent = reserve.toString();
        this.playerBoardContainer.setAttribute('data-empty-reserve', reserve <= 0 ? 'true' : 'false');
    }
    //[BGA] the player's last turn was an automatic pass (no valid move); cleared when they place towers again
    setPassed(passed) {
        this.passed = passed;
        this.playerBoardContainer.setAttribute('data-passed', passed ? 'true' : 'false');
    }
    //every live score change goes through here: BGA's score counter is the player's largest group
    setScore(score) {
        this.score = score;
        this.game.bga.playerPanels.getScoreCounter(this.playerID)?.toValue(score);
    }
    //the one shared bounce (discs given back by a replacement land on this board), removed on animationend
    bounceBoard() {
        if (!this.game.bga.gameui.bgaAnimationsActive())
            return;
        this.boardElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        void this.boardElement.offsetWidth; //restarts a bounce still playing
        this.boardElement.classList.add(PlayerHandler.BOUNCE_CLASS);
    }
    //where towers leave from and replaced towers fly back to
    getReserveIconElement() { return this.reserveIcon; }
    getPlayerID() { return this.playerID; }
    getReserve() { return this.reserve; } //as tracked by setReserve()
    isPassed() { return this.passed; }
    getScore() { return this.score; } //as tracked by setScore()
}
PlayerHandler.BOUNCE_CLASS = 'bouncing-player-board'; //the one shared bounce class, its timing lives in Game.scss

class LogMutationObserver {
    constructor(game) {
        this.game = game;
        this.nextTimestampValue = '';
        this.observeLogs();
    }
    observeLogs() {
        let observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && node.tagName.toLowerCase() === 'div' && node.classList.contains('log')) {
                            this.processLogDiv(node);
                        }
                    });
                }
            });
        });
        // Configure the MutationObserver to observe changes to the container's child nodes
        const config = {
            childList: true,
            subtree: true // Set to true if you want to observe all descendants of the container
        };
        // Start observing the container
        observer.observe($('logs'), config);
        observer.observe($('chatbar'), config); //mobile notifs
        if (this.game.isReplay()) { //to observe replayLogs that appears at the bottom of the page on replays
            let replayLogsObserverStarted = false;
            const replayLogsObserver = new MutationObserver((mutations, obs) => {
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length) {
                        mutation.addedNodes.forEach((node) => {
                            if (!replayLogsObserverStarted && node instanceof HTMLElement && node.id.startsWith('replaylogs')) {
                                this.processLogDiv(node);
                            }
                        });
                    }
                }
            });
            replayLogsObserver.observe(document.body, { childList: true, subtree: true });
        }
    }
    processLogDiv(node) {
        const classTags = Array.from(node.querySelectorAll('*[log-class-tag]'));
        for (const classTag of classTags) {
            const logClassName = classTag.getAttribute('log-class-tag');
            let parentLog = null;
            let current = classTag;
            while (current) {
                if (current.classList.contains('gamelogreview') || current.classList.contains('log')) {
                    parentLog = current;
                    break;
                }
                current = current.parentElement;
            }
            if (parentLog)
                parentLog.classList.add('a-game-log', logClassName);
        }
        classTags.forEach(classTag => classTag.remove());
        node.querySelectorAll('.playername').forEach((playerName) => {
            playerName.setAttribute('player-color', this.game.rgbToHex(window.getComputedStyle(playerName).color));
        });
        if (this.game.isDesktop() && node.classList.contains('a-game-log')) {
            let timestamp = Array.from(node.querySelectorAll('.timestamp'));
            if (timestamp.length > 0) {
                this.nextTimestampValue = timestamp[0].innerText;
            }
            else if (this.observeLogs.hasOwnProperty('nextTimestampValue')) {
                let newTimestamp = document.createElement('div');
                newTimestamp.classList.add('timestamp');
                newTimestamp.innerHTML = this.nextTimestampValue;
                node.appendChild(newTimestamp);
            }
        }
    }
    //gapBefore: the row starts a new group in the log (log-gap-before, a gap on the side of the previous row). Decided from the
    //notification's args, never from the rows around it, so live rows, F5 and replays all get the same gaps
    addLogClassTag(logHTML, logClass, gapBefore = false) {
        const gapTagHTML = gapBefore ? '<div log-class-tag="log-gap-before"></div>' : '';
        return { log_html: logHTML + `<div log-class-tag="${logClass}"></div>` + gapTagHTML, log_class: logClass };
    }
    //create specific log types
    //"name [tower] [tower] [enemy tower → tower]": every tower of the turn as a mini tower in the player's color, in the order
    //they were drafted; a replacement shows the enemy tower it replaced, faded and crossed, then the new one
    createLogTowersPlaced(player_id, placements) {
        const discColor = this.game.getDiscColor(player_id);
        const towersHTML = placements.map(placement => {
            const towerHTML = this.getMiniTowerHTML(discColor, placement.height);
            if (placement.kind !== 'replace' || placement.replaced_player_id === null)
                return towerHTML;
            const replacedHTML = this.getMiniTowerHTML(this.game.getDiscColor(placement.replaced_player_id), placement.replaced_height ?? 1, 'replaced-log-tower');
            return `<span class="log-replacement">${replacedHTML}<i class="fa6 fa-arrow-right log-replacement-arrow" aria-hidden="true"></i>${towerHTML}</span>`;
        }).join('');
        let logHTML = `
            <div class="towers-placed-row">
                ${this.getCutPlayerNameHTML(player_id)}
                <span class="log-towers">${towersHTML}</span>
            </div>` + ' &nbsp;';
        return this.addLogClassTag(logHTML, 'towers-placed-log');
    }
    //[BGA] the automatic pass: "[forward] name has no valid move and passes" (the server's PASS_LOG_STR is the plain-text fallback)
    createLogPlayerPassed(player_id) {
        const passText = (player_id === this.game.getMyPlayerID()) ? _('${you} have no valid move and pass') : _('${player_name} has no valid move and passes');
        const passHTML = passText
            .replace('${you}', this.game.divYou({ class: 'playername' }))
            .replace('${player_name}', this.game.divColoredPlayer(player_id, { class: 'playername' }));
        let logHTML = `
            <div class="player-passed-row">
                <i class="fa6 fa-forward player-passed-icon" aria-hidden="true"></i>
                <span>${passHTML}</span>
            </div>` + ' &nbsp;';
        return this.addLogClassTag(logHTML, 'player-passed-log');
    }
    //the game ends: everyone at the top score wins (a tie shares the victory)
    createLogGameEnd(winner_ids, winningScore) {
        const iWin = winner_ids.includes(this.game.getMyPlayerID());
        const otherWinnersHTML = winner_ids.filter(player_id => player_id !== this.game.getMyPlayerID()).map(player_id => this.game.divColoredPlayer(player_id, { class: 'playername' }));
        //one string per case, since other languages conjugate "you", one other player and several players differently
        let gameEndText;
        if (iWin)
            gameEndText = (otherWinnersHTML.length === 0) ? _('${you} win with ${score} connected towers') : _('${you} and ${players} share the victory with ${score} connected towers');
        else
            gameEndText = (otherWinnersHTML.length === 1) ? _('${player_name} wins with ${score} connected towers') : _('${players} share the victory with ${score} connected towers');
        const gameEndHTML = gameEndText
            .replace('${you}', iWin ? this.game.divYou({ class: 'playername' }) : '')
            .replace('${player_name}', otherWinnersHTML[0] ?? '')
            .replace('${players}', otherWinnersHTML.join(', '))
            .replace('${score}', `<b>${winningScore}</b>`);
        let logHTML = `
            <div class="game-end-row">
                <i class="fa6 fa-trophy"></i>&nbsp;${gameEndHTML}
            </div>` + ' &nbsp;';
        return this.addLogClassTag(logHTML, 'game-end-log');
    }
    //a tower drawn at log size (.log-tower sets its own --cell-size)
    getMiniTowerHTML(discColor, height, extraClass = '') {
        return BoardHandler.createTowerDiv(discColor, height, 'log-tower' + (extraClass ? ' ' + extraClass : '')).outerHTML;
    }
    //a player name the row's CSS cuts with an ellipsis (max-width), so its title shows it whole
    getCutPlayerNameHTML(player_id) {
        const nameText = (player_id === this.game.getMyPlayerID()) ? _('You') : this.game.getPlayerName(player_id);
        return this.game.divColoredPlayer(player_id, { class: 'playername', title: nameText.replace(/"/g, '&quot;') });
    }
}

//BGA's default tooltips (addTooltip) on the player boards. Tooltips only reach elements already on the page, with an id
class TooltipHandler {
    constructor(game) {
        this.game = game;
        this.addTooltipsToBoards();
    }
    addTooltipsToBoards() {
        for (const player_id in this.game.players) {
            this.game.bga.gameui.addTooltip('reserve-indicator-' + player_id, _('Discs in reserve. Discs of a replaced tower come back here.'), '', TooltipHandler.TOOLTIP_DELAY);
            this.game.bga.gameui.addTooltip('passed-stamp-' + player_id, _('No valid move on the last turn: passed automatically. Back in the game as soon as a move is possible.'), '', TooltipHandler.TOOLTIP_DELAY);
            //BGA's score: the largest group
            const scoreElement = document.getElementById('player_score_' + player_id);
            if (scoreElement)
                this.game.bga.gameui.addTooltip(scoreElement.id, _('Score: the number of towers in your largest area of orthogonally connected towers'), '', TooltipHandler.TOOLTIP_DELAY);
        }
    }
}
TooltipHandler.TOOLTIP_DELAY = 400;

//the end of the game: each player's largest group(s) glow on the board (BoardHandler.highlightLargestGroups) and the scores
//are set to their final values. Live from EndScore's displayEndGameScoring, or from gamedatas after a reload
class EndGameScoringHandler {
    constructor(game) {
        this.game = game;
        this.displayed = false;
    }
    displayEndGameScore(endGameScoring) {
        this.displayed = true;
        this.game.boardHandler.highlightLargestGroups(endGameScoring.groups);
        for (const player_id in endGameScoring.scores)
            this.game.players[player_id]?.setScore(endGameScoring.scores[player_id]);
    }
    isDisplayed() { return this.displayed; }
}

/**
 * [BGA] The height picker of the draft (PlaceTowers): a small popup next to the selected spot, one button per legal height,
 * each a tower of that height in the player's color with its number on top. For a replacement, a caption shows the enemy
 * tower and "at least N discs". It lives in <body>, position fixed, outside BGA's mobile scaling of the game area, so its
 * buttons keep their real size (at least $height-menu-option-size) at any zoom. Its place is measured on screen from the
 * spot (found again by its board coordinates, since the board redraws its spots on every draft change): above the spot,
 * else below, else to the right, else to the left, always clamped inside the viewport, and measured again on scroll,
 * resize and board recentring. A pointer down outside the menu and the board's clickable spots, or Escape, dismisses it;
 * digits pick a height. The anchor gap and the viewport margin come from Game.scss (--height-menu-anchor-gap,
 * --height-menu-edge-margin), like every other size of the menu.
 */
class HeightMenu {
    constructor(game) {
        this.game = game;
        this.menuElement = null;
        this.request = null;
        this.onChoose = null;
        this.onDismiss = null;
        this.repositionFrame = 0;
        this.pointerDownListener = (event) => this.onDocumentPointerDown(event);
        this.keyDownListener = (event) => this.onDocumentKeyDown(event);
        this.viewportChangeListener = () => this.scheduleReposition();
    }
    isOpen() { return !!this.menuElement; }
    //opens the menu at request.spot, or moves it there (a new menu is built: the heights may differ)
    open(request, onChoose, onDismiss) {
        this.removeMenuElement();
        this.request = request;
        this.onChoose = onChoose;
        this.onDismiss = onDismiss;
        this.menuElement = this.createMenuElement(request);
        document.body.appendChild(this.menuElement);
        this.addListeners();
        this.reposition();
    }
    //closes without choosing (the owner has already updated its own state)
    close() {
        this.removeMenuElement();
        this.removeListeners();
        this.request = null;
        this.onChoose = null;
        this.onDismiss = null;
    }
    removeMenuElement() {
        if (this.repositionFrame) {
            cancelAnimationFrame(this.repositionFrame);
            this.repositionFrame = 0;
        }
        this.menuElement?.remove();
        this.menuElement = null;
    }
    createMenuElement(request) {
        const menu = document.createElement('div');
        menu.className = 'height-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('data-disc-color', request.discColor);
        let captionHTML = `<span class="height-menu-caption-text">${_('Tower height')}</span>`;
        if (request.replacedTower) {
            const replacedTowerHTML = BoardHandler.createTowerDiv(this.game.getDiscColor(request.replacedTower.player_id), request.replacedTower.height, 'height-menu-replaced-tower').outerHTML;
            const minimumText = _('Replace: at least ${count} discs').replace('${count}', `<b>${request.replacedTower.height + 1}</b>`);
            captionHTML = `${replacedTowerHTML}<span class="height-menu-caption-text">${minimumText}</span>`;
        }
        const optionsHTML = request.heights.map(height => {
            const label = (height === 1 ? _('1 disc') : _('${count} discs').replace('${count}', height.toString())).replace(/"/g, '&quot;');
            const towerHTML = BoardHandler.createTowerDiv(request.discColor, height, 'height-menu-tower').outerHTML;
            return `<button type="button" class="height-menu-option" role="menuitem" data-height="${height}" aria-label="${label}" title="${label}">${towerHTML}</button>`;
        }).join('');
        menu.innerHTML = `
            <div class="height-menu-caption">${captionHTML}</div>
            <div class="height-menu-options">${optionsHTML}</div>
            <div class="height-menu-arrow" aria-hidden="true"></div>
        `;
        menu.addEventListener('click', (event) => {
            const option = event.target.closest('.height-menu-option');
            if (option)
                this.choose(parseInt(option.getAttribute('data-height')));
        });
        return menu;
    }
    choose(height) {
        if (!this.request?.heights.includes(height) || !this.onChoose)
            return;
        this.onChoose(height); //the owner places the tower and closes the menu
    }
    dismiss() {
        const onDismiss = this.onDismiss;
        this.close();
        onDismiss?.();
    }
    addListeners() {
        document.addEventListener('pointerdown', this.pointerDownListener, true);
        document.addEventListener('keydown', this.keyDownListener);
        window.addEventListener('scroll', this.viewportChangeListener, true); //capture: any scrolling ancestor, not only the page
        window.addEventListener('resize', this.viewportChangeListener);
    }
    removeListeners() {
        document.removeEventListener('pointerdown', this.pointerDownListener, true);
        document.removeEventListener('keydown', this.keyDownListener);
        window.removeEventListener('scroll', this.viewportChangeListener, true);
        window.removeEventListener('resize', this.viewportChangeListener);
    }
    //outside the menu: dismissed. Not on the board's clickable spots or drafted towers: those clicks go to PlaceTowers, which
    //moves the menu to another spot, closes it on the same spot, or takes a drafted tower back
    onDocumentPointerDown(event) {
        const target = event.target;
        if (!this.menuElement || this.menuElement.contains(target))
            return;
        if (target.closest?.('#nexo-board .clickable-spot, #nexo-board .pending-tower'))
            return;
        this.dismiss();
    }
    //never while typing (BGA's chat): digits there are text
    onDocumentKeyDown(event) {
        const target = event.target;
        if (target?.closest?.('input, textarea, select, [contenteditable="true"]'))
            return;
        if (event.key === 'Escape') {
            this.dismiss();
            return;
        }
        const height = parseInt(event.key);
        if (!isNaN(height) && this.request?.heights.includes(height)) {
            event.preventDefault();
            this.choose(height);
        }
    }
    scheduleReposition() {
        if (!this.menuElement || this.repositionFrame)
            return;
        this.repositionFrame = requestAnimationFrame(() => {
            this.repositionFrame = 0;
            this.reposition();
        });
    }
    //places the menu next to its spot on screen: the first side where it fits whole (above, below, right, left), else above;
    //then clamped inside the viewport (below a fixed BGA top bar). The arrow keeps pointing at the spot's centre
    reposition() {
        if (!this.menuElement || !this.request)
            return;
        const anchor = this.game.boardHandler.getSpotElement(this.request.spot);
        if (!anchor) {
            this.dismiss(); //the spot is gone (never expected while the menu is open)
            return;
        }
        const menuStyle = getComputedStyle(this.menuElement);
        const gap = parseFloat(menuStyle.getPropertyValue('--height-menu-anchor-gap')) || 0;
        const margin = parseFloat(menuStyle.getPropertyValue('--height-menu-edge-margin')) || 0;
        const anchorRect = anchor.getBoundingClientRect();
        const menuWidth = this.menuElement.offsetWidth;
        const menuHeight = this.menuElement.offsetHeight;
        const viewportWidth = document.documentElement.clientWidth; //leaves out a vertical scrollbar, which innerWidth counts
        const viewportHeight = window.innerHeight;
        const minTop = this.getMinTop(margin);
        const centerX = anchorRect.left + anchorRect.width / 2;
        const centerY = anchorRect.top + anchorRect.height / 2;
        const candidates = [
            { placement: 'above', left: centerX - menuWidth / 2, top: anchorRect.top - gap - menuHeight, fits: anchorRect.top - gap - menuHeight >= minTop },
            { placement: 'below', left: centerX - menuWidth / 2, top: anchorRect.bottom + gap, fits: anchorRect.bottom + gap + menuHeight <= viewportHeight - margin },
            { placement: 'right', left: anchorRect.right + gap, top: centerY - menuHeight / 2, fits: anchorRect.right + gap + menuWidth <= viewportWidth - margin },
            { placement: 'left', left: anchorRect.left - gap - menuWidth, top: centerY - menuHeight / 2, fits: anchorRect.left - gap - menuWidth >= margin },
        ];
        const chosen = candidates.find(candidate => candidate.fits) ?? candidates[0];
        const left = Math.max(margin, Math.min(chosen.left, viewportWidth - margin - menuWidth));
        const top = Math.max(minTop, Math.min(chosen.top, viewportHeight - margin - menuHeight));
        this.menuElement.style.left = `${left}px`;
        this.menuElement.style.top = `${top}px`;
        this.menuElement.setAttribute('data-placement', chosen.placement);
        const arrowOffset = (chosen.placement === 'above' || chosen.placement === 'below') ? centerX - left : centerY - top;
        const arrowLength = (chosen.placement === 'above' || chosen.placement === 'below') ? menuWidth : menuHeight;
        this.menuElement.style.setProperty('--height-menu-arrow-offset', `${Math.max(14, Math.min(arrowLength - 14, arrowOffset))}px`);
    }
    //the menu never goes under BGA's top bar when it is fixed (it paints over everything on mobile)
    getMinTop(margin) {
        const topBar = document.getElementById('topbar');
        if (!topBar || getComputedStyle(topBar).position !== 'fixed')
            return margin;
        return Math.max(margin, topBar.getBoundingClientRect().bottom + margin);
    }
}

/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * Game.ts
 */
class Game {
    constructor(bga) {
        this.players = {};
        this.bga = bga;
        // Declare the State classes
        this.placeTowers = new PlaceTowers(this, bga);
        this.bga.states.register('PlaceTowers', this.placeTowers);
        this.bga.states.register('gameEnd', new GameEnd(this, bga));
        // Uncomment the next line to show debug informations about state changes in the console. Remove before going to production!
        // this.bga.states.logger = console.log;
    }
    /*
        setup:

        This method must set up the game user interface according to current game situation specified
        in parameters.

        The method is called each time the game interface is displayed to a player, ie:
        _ when the game starts
        _ when a player refreshes the game page (F5)

        "gamedatas" argument contains all datas retrieved by your "getAllDatas" PHP method.
    */
    setup(gamedatas) {
        this.gamedatas = gamedatas;
        //the draft panel keeps its height when hidden, so the board never moves when a turn starts or ends
        this.bga.gameArea.getElement().insertAdjacentHTML('beforeend', `
            <div id="nexo-board-container">
                <div id="draft-panel"></div>
                <div id="nexo-board"></div>
            </div>
        `);
        this.myPlayerID = this.bga.players.getCurrentPlayerId();
        this.boardRules = new BoardRules(gamedatas.rules);
        this.endGameScoringHandler = new EndGameScoringHandler(this);
        // Setting up player boards
        for (let player_id in gamedatas.players) {
            const { name, color, player_no, reserve, passed, score } = this.gamedatas.players[player_id];
            this.players[player_id] = new PlayerHandler(this, parseInt(player_id), name, color, player_no, reserve, passed, Number(score));
        }
        this.boardHandler = new BoardHandler(this, gamedatas.towers);
        this.heightMenu = new HeightMenu(this);
        this.logMutationObserver = new LogMutationObserver(this);
        this.tooltipHandler = new TooltipHandler(this);
        this.bga.gameui.onScreenWidthChange = () => this.onScreenWidthChange();
        if (gamedatas.hasOwnProperty('endGameScoring'))
            this.endGameScoringHandler.displayEndGameScore(gamedatas.endGameScoring);
        // Setup game notifications to handle (see "setupNotifications" method below)
        this.setupNotifications();
    }
    ///////////////////////////////////////////////////
    //// Utility methods
    /*

        Here, you can defines some utility methods that you can use everywhere in your javascript
        script. Typically, functions that are used in multiple state classes or outside a state class.

    */
    bgaFormatText(log, args) {
        try {
            log = _(log);
            if (log && args && !args.processed) {
                args.processed = true;
                // list of special keys we want to replace with images
                const keys = ['TOWERS_PLACED_LOG_STR', 'PASS_LOG_STR', 'GAME_END_LOG_STR'];
                for (let key of keys) {
                    if (key in args) {
                        if (key == 'TOWERS_PLACED_LOG_STR')
                            log = this.logMutationObserver.createLogTowersPlaced(args['player_id'], args['placements']).log_html;
                        else if (key == 'PASS_LOG_STR')
                            log = this.logMutationObserver.createLogPlayerPassed(args['player_id']).log_html;
                        else if (key == 'GAME_END_LOG_STR')
                            log = this.logMutationObserver.createLogGameEnd(args['winner_ids'], args['winning_score']).log_html;
                    }
                }
            }
        }
        catch (e) {
            console.error(log, args, "Exception thrown", e.stack);
        }
        return { log, args };
    }
    divYou(attributes = {}) {
        let color = this.gamedatas.players[this.myPlayerID].color;
        attributes['player-color'] = color;
        let html = "<span style=\"font-weight:bold;color:#" + color + ";\" " + this.getAttributesHTML(attributes) + ">" + _("You") + "</span>";
        return html;
    }
    divColoredPlayer(player_id, attributes = {}, detectYou = true) {
        if (detectYou && parseInt(player_id) === this.myPlayerID)
            return this.divYou(attributes);
        player_id = player_id.toString();
        let color = this.gamedatas.players[player_id].color;
        attributes['player-color'] = color;
        let html = "<span style=\"color:#" + color + ";\" " + this.getAttributesHTML(attributes) + ">" + this.gamedatas.players[player_id].name + "</span>";
        return html;
    }
    getAttributesHTML(attributes) { return Object.entries(attributes || {}).map(([key, value]) => `${key}="${value}"`).join(' '); }
    //slides element into the container `to`, starting from where `from` is now (from may be element itself).
    //A copy flies over the page while the real element waits hidden in `to`.
    //With `to` null, element is already in its place (a tower on its spot) and only the copy moves.
    //The copy also changes size on the way: it starts at the size `from` has on screen (a player board's reserve disc) and
    //lands exactly at the size and place of element, so nothing jumps at the end.
    //Everything is measured on screen (getBoundingClientRect), and the copy (in <body>, outside BGA's mobile scaling of the
    //game area) converts screen px into its own px with its measured zoom, so it matches on desktop and mobile alike.
    //`from` can also be a DOMRect on screen, for a start point with no element.
    //With options.keepSize, the copy keeps element's size the whole way and starts centered on `from`.
    //Everything before the first await runs synchronously, so `from` can be removed as soon as this is called
    async animateSlide(element, from, to, durationMs, options = {}) {
        const fromRect = (from instanceof DOMRect) ? from : from.getBoundingClientRect(); //before element moves: from may be element itself
        const slidingClone = this.createSlidingClone(element);
        element.style.visibility = 'hidden';
        if (to)
            to.appendChild(element);
        const toRect = element.getBoundingClientRect();
        const startRect = options.keepSize ? Game.getCenteredRect(fromRect, toRect.width, toRect.height) : fromRect;
        await this.moveSlidingClone(slidingClone, startRect, toRect, durationMs, options);
        element.style.visibility = null;
    }
    //the other way round: a copy of element flies from where element is now to toRect on screen, then disappears.
    //Element itself is left alone and can be removed as soon as this is called (a replaced tower going back to its reserve).
    //With options.keepSize, the copy keeps element's size and lands centered on toRect; with options.fadeOutMs, it fades out once there.
    //The copy shows at the opacity element shows at, which it doesn't inherit in <body>
    async animateSlideAway(element, toRect, durationMs, options = {}) {
        const fromRect = element.getBoundingClientRect();
        const shownOpacity = Game.getShownOpacity(element);
        const slidingClone = this.createSlidingClone(element);
        if (shownOpacity < 1)
            slidingClone.style.opacity = shownOpacity.toString();
        const endRect = options.keepSize ? Game.getCenteredRect(toRect, fromRect.width, fromRect.height) : toRect;
        await this.moveSlidingClone(slidingClone, fromRect, endRect, durationMs, options);
    }
    //a width x height rect on screen, centered on rect
    static getCenteredRect(rect, width, height) {
        return new DOMRect(rect.left + (rect.width - width) / 2, rect.top + (rect.height - height) / 2, width, height);
    }
    //element's own opacity times its ancestors'
    static getShownOpacity(element) {
        let opacity = 1;
        for (let node = element; node && node !== document.body; node = node.parentElement)
            opacity *= parseFloat(getComputedStyle(node).opacity);
        return opacity;
    }
    createSlidingClone(element) {
        const slidingClone = element.cloneNode(true);
        slidingClone.removeAttribute('id');
        slidingClone.classList.add('sliding-clone');
        slidingClone.style.removeProperty('visibility'); //element may already wait hidden in its place
        document.body.appendChild(slidingClone);
        return slidingClone;
    }
    //moves the copy from fromRect to toRect (both on screen), after options.delayMs at its start, fades it out there if
    //options.fadeOutMs (after options.holdMs of stillness), then removes it
    async moveSlidingClone(slidingClone, fromRect, toRect, durationMs, options) {
        const { easing = Game.TOWER_SLIDE_EASING, delayMs = 0, holdMs = 0, fadeOutMs = 0 } = options;
        const transformOnto = this.getSlidingCloneTransform(slidingClone);
        slidingClone.style.transform = transformOnto(fromRect);
        await this.bga.gameui.wait(20); //let the clone's start position paint before the transition kicks in
        slidingClone.style.transition = `transform ${durationMs}ms ${easing} ${delayMs}ms`;
        slidingClone.style.transform = transformOnto(toRect);
        await this.bga.gameui.wait(delayMs + durationMs);
        if (holdMs > 0)
            await this.bga.gameui.wait(holdMs);
        if (fadeOutMs > 0) {
            slidingClone.style.transition = `opacity ${fadeOutMs}ms ease`;
            slidingClone.style.opacity = '0';
            await this.bga.gameui.wait(fadeOutMs);
        }
        slidingClone.remove();
    }
    //returns the transform that puts the copy (a fresh createSlidingClone, untransformed) onto an on-screen rect: scaled to
    //rect's height (towers keep their aspect) and centered on rect. The copy converts screen px with its own measured zoom
    getSlidingCloneTransform(slidingClone) {
        const baseRect = slidingClone.getBoundingClientRect(); //on screen, untransformed at the viewport's top-left corner
        const cssWidth = parseFloat(getComputedStyle(slidingClone).width); //unrounded, unlike offsetWidth
        const zoom = (cssWidth > 0) ? baseRect.width / cssWidth : 1;
        return (rect) => {
            const scale = (baseRect.height > 0) ? rect.height / baseRect.height : 1;
            const left = rect.left + (rect.width - baseRect.width * scale) / 2;
            return `translate(${(left - baseRect.left) / zoom}px, ${(rect.top - baseRect.top) / zoom}px) scale(${scale})`;
        };
    }
    rgbToHex(rgb) {
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) {
            console.error('-- rgb --', rgb);
            throw new Error("Invalid RGB format");
        }
        // Convert each component to a two-character hexadecimal
        const [, r, g, b] = match;
        return [r, g, b]
            .map((num) => {
            const hex = parseInt(num, 10).toString(16);
            return hex.padStart(2, '0'); // Ensure two digits
        })
            .join(''); // Combine into a single string
    }
    onScreenWidthChange() {
        this.heightMenu?.reposition();
    }
    isDesktop() { return document.body.classList.contains('desktop_version'); }
    isMobile() { return document.body.classList.contains('mobile_version'); }
    isTouchOrMobile() { return this.isMobile() || window.matchMedia('(hover: none)').matches; } //BGA's mobile layout, or a device that can't hover (a tablet in the desktop layout). Not BGA's touch-device class, which a touch laptop with a mouse has too
    isReplay() { return typeof g_replayFrom != 'undefined' || g_archive_mode; } //"replay from this move" in an ongoing game, or an archived game
    isInterfaceLocked() { return document.body.classList.contains('lockedInterface'); } //gameui.isInterfaceLocked() is not in this framework version
    getGameStateName() { return this.gamedatas.gamestate.name; }
    getRules() { return this.gamedatas.rules; }
    getPlayerColor(playerID) { return this.gamedatas.players[playerID]?.color; }
    getPlayerName(playerID) { return this.gamedatas.players[playerID]?.name ?? ''; }
    //the disc color of a player's towers, from their BGA color (material.inc.php's DISC_COLOR_BY_PLAYER_COLOR)
    getDiscColor(playerID) {
        const playerColor = this.getPlayerColor(playerID) ?? '';
        return this.gamedatas.discColorByPlayerColor?.[playerColor] ?? (playerColor === '000000' ? 'black' : 'red');
    }
    //BGA's final state, or the largest groups already shown (they arrive in EndScore, just before gameEnd)
    isGameOver() { return this.getGameStateName() === 'gameEnd' || !!this.endGameScoringHandler?.isDisplayed(); }
    getMyPlayerID() { return this.myPlayerID; }
    getPlayerOrder() { return this.gamedatas.playerorder; } //turn order, starting with myself
    //end utility
    ///////////////////////////////////////////////////
    //// Reaction to cometD notifications
    /*
        setupNotifications:

        In this method, you associate each of your game notifications with your local method to handle it.

        Note: game notification names correspond to "bga->notify->all" calls in your Game.php file.

    */
    setupNotifications() {
        // automatically listen to the notifications, based on the `notif_xxx` function on this class.
        // Uncomment the logger param to see debug information in the console about notifications.
        //minDuration: BGA holds every notification with log text for 500ms by default, even when nothing animates (a pass row).
        //A notification now lasts as long as its handler awaits a real animation
        this.bga.notifications.setupPromiseNotifications({
            minDuration: 1,
            // logger: console.log
        });
    }
    // Add the notification handlers
    //a confirmed turn: the player's discs leave their reserve, replaced towers fly back to their owner's reserve (whose board
    //bounces once they have landed), new towers fly to their spots, the scores update, then the board window follows the towers
    async notif_towersPlaced(args) {
        const mover = this.players[args.player_id];
        mover?.setReserve(args.reserves[args.player_id] ?? mover.getReserve());
        mover?.setPassed(false);
        await this.boardHandler.applyPlacements(args.player_id, args.placements);
        const playerIDsGivenBack = new Set(args.placements.filter(placement => placement.kind === 'replace' && placement.replaced_player_id !== null).map(placement => placement.replaced_player_id));
        for (let player_id in args.reserves)
            this.players[player_id]?.setReserve(args.reserves[player_id]);
        playerIDsGivenBack.forEach(playerID => this.players[playerID]?.bounceBoard());
        for (let player_id in args.scores)
            this.players[player_id]?.setScore(args.scores[player_id]);
        await this.boardHandler.recenter();
    }
    //[BGA] the automatic pass: the log row and the player board's PASSED stamp, no animation
    async notif_playerPassed(args) {
        this.players[args.player_id]?.setPassed(true);
        this.players[args.player_id]?.setReserve(args.reserve);
    }
    async notif_displayEndGameScoring(args) {
        this.endGameScoringHandler.displayEndGameScore(args.endGameScoring);
    }
}
//every board animation's timing, in one place to tune them together (BoardHandler reads them too)
Game.TOWER_SLIDE_DURATION = 520; //ms of a tower flying between a player board's reserve and its spot
Game.TOWER_SLIDE_STAGGER = 110; //ms between two new towers of the same turn leaving the reserve
Game.TOWER_SLIDE_EASING = 'ease-in-out';
Game.BOARD_RECENTER_DURATION = 450; //ms of the board window sliding to follow the towers after a turn
Game.BOARD_RECENTER_EASING = 'ease-in-out';

export { Game };
