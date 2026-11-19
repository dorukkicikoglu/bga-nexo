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
//the board rules the draft needs (bounds, legal spots, height options, connectivity), the same as NEXOTableManager's (which
//checks the whole turn again on confirm). A board is a Map "x,y" => spot; every method is pure
class BoardRules {
    constructor(rules) {
        this.rules = rules;
    }
    static key(x, y) { return x + ',' + y; }
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
}

class PlaceTowers {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
        this.stateArgs = null;
        this.pending = [];
        this.clickHistory = []; //the drafted towers in the order last clicked, each once: the last one is active (gold ring, buttons)
        this.drafting = false;
        this.confirming = false; //the turn is on its way to the server
    }
    /**
     * This method is called each time we are entering the game state. You can use this method to perform some user interface changes at this moment.
     */
    onEnteringState(args, isCurrentPlayerActive) {
        this.stateArgs = args;
        this.pending = [];
        this.clickHistory = [];
        this.drafting = isCurrentPlayerActive;
        this.confirming = false;
        if (!isCurrentPlayerActive) { //they can't see the draft: every icon stays full
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
    onLeavingState(args, isCurrentPlayerActive) {
        this.drafting = false;
        this.confirming = false;
        this.pending = [];
        this.clickHistory = [];
        this.game.confirmPopover.close();
        this.game.boardHandler.setDraftClickHandlers(null);
        this.game.boardHandler.setDraft(null);
    }
    canDraft() { return this.drafting && !this.confirming && !this.game.isInterfaceLocked(); }
    getDiscsUsed() { return this.pending.reduce((sum, tower) => sum + tower.height, 0); }
    getDiscsLeft() { return Math.max(0, (this.stateArgs?.discsThisTurn ?? 0) - this.getDiscsUsed()); }
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
        return this.game.boardHandler.getTowers().filter(tower => this.getCaptureCheck(tower)?.canCapture);
    }
    //[BGA] the board towers a click answers with a warning (warningTowerClicked): those with a sentence in getTowerWarningHTML
    getWarningTowers() {
        return this.game.boardHandler.getTowers().filter(tower => this.getTowerWarningHTML(tower) !== null);
    }
    //[BGA] why a click on this board tower does nothing, as the sentence for its bubble, or null when there is nothing to say (a
    //replaceable tower, which a click drafts on; a 5-disc enemy tower or one already replaced in this draft, which stay as they
    //were). My own towers: no disc goes on them. An enemy tower the discs left can't out-height: the numbers, from the same rule as
    //the rings (getCaptureCheck). ${disc} becomes a disc icon in my color after translation, so a translation may put it
    //anywhere in the sentence
    getTowerWarningHTML(tower) {
        const discIconHTML = this.getDiscIconsHTML(this.game.getDiscColor(this.game.getMyPlayerID()), 1, 0);
        if (tower.player_id === this.game.getMyPlayerID())
            return _('You cannot add ${disc} to your own towers').replace('${disc}', discIconHTML);
        const check = this.getCaptureCheck(tower);
        if (!check || check.canCapture)
            return null;
        return _('Not enough ${disc}: need ${needed}, you have ${available}')
            .replace('${disc}', discIconHTML).replace('${needed}', check.needed.toString()).replace('${available}', check.available.toString());
    }
    //the one rule for replacing a tower: an enemy tower, not already replaced in this draft, takes its height + 1 discs, never
    //more than a tower's highest height, out of the discs left this turn. null when no number of discs could replace it (my own
    //tower, one already replaced in this draft, or one already as high as a tower goes)
    getCaptureCheck(tower) {
        if (tower.player_id === this.game.getMyPlayerID() || this.getPendingAt(tower))
            return null;
        const needed = tower.height + 1;
        if (needed > this.game.getRules().maxTowerHeight)
            return null;
        const available = this.getDiscsLeft();
        return { canCapture: needed <= available, needed: needed, available: available };
    }
    getPendingAt(spot) {
        return this.pending.find(tower => tower.x === spot.x && tower.y === spot.y);
    }
    //a click on a spot makes its tower the active one: on top of the history, wherever it was
    activate(spot) {
        this.clickHistory = this.clickHistory.filter(clicked => clicked.x !== spot.x || clicked.y !== spot.y);
        this.clickHistory.push({ x: spot.x, y: spot.y });
    }
    //the active tower: the last clicked one still drafted, null with no draft
    getActiveSpot() {
        return this.clickHistory[this.clickHistory.length - 1] ?? null;
    }
    //the enemy tower a click on spot would replace (null for an empty spot), or undefined when the spot can't take a tower now
    getSpotTarget(spot) {
        if (this.getLegalNewSpots().some(legalSpot => legalSpot.x === spot.x && legalSpot.y === spot.y))
            return null;
        return this.getReplaceableTowers().find(tower => tower.x === spot.x && tower.y === spot.y);
    }
    //the heights a tower may have on a spot with no drafted tower: from 1 (or the enemy tower's height + 1) up to the discs left
    getHeightOptions(spot) {
        const target = this.getSpotTarget(spot);
        if (target === undefined)
            return [];
        return this.game.boardRules.getHeightOptions(target ? target.height : null, this.getDiscsLeft());
    }
    //the heights a drafted tower cycles through: the same rule, with its own discs back among the discs left
    getCycleHeights(tower) {
        return this.game.boardRules.getHeightOptions(tower.replaced ? tower.replaced.height : null, this.getDiscsLeft() + tower.height);
    }
    //called by BoardHandler, on a highlighted spot or a drafted tower: a new tower at its lowest height, one more disc, or, past
    //the highest height, the tower taken back like an undo (the tower clicked before it is active again)
    spotClicked(spot) {
        if (!this.canDraft())
            return;
        const pendingTower = this.getPendingAt(spot);
        if (pendingTower) {
            const nextHeight = pendingTower.height + 1;
            if (!this.getCycleHeights(pendingTower).includes(nextHeight)) {
                this.removePending(spot);
                return;
            }
            this.pending = this.pending.map(tower => tower === pendingTower ? { ...tower, height: nextHeight } : tower);
            this.activate(spot);
            this.update();
            return;
        }
        const heightOptions = this.getHeightOptions(spot);
        if (heightOptions.length > 0)
            this.addPending(spot, heightOptions[0]);
    }
    //[BGA] called by BoardHandler: a board tower a click can't draft on (getTowerWarningHTML: my own, or an enemy tower too high
    //for the discs left). Nothing changes: the tower shakes and a bubble over it says why. Client only
    warningTowerClicked(spot) {
        if (!this.canDraft())
            return;
        const tower = this.game.boardHandler.getTowerMap().get(BoardRules.key(spot.x, spot.y));
        const messageHTML = tower ? this.getTowerWarningHTML(tower) : null;
        if (messageHTML !== null)
            this.game.boardHandler.showTowerWarning(spot, messageHTML);
    }
    //called by BoardHandler: the active tower's undo button (never also a click on its spot)
    undoClicked(spot) {
        if (this.canDraft() && this.getPendingAt(spot))
            this.removePending(spot);
    }
    addPending(spot, height) {
        const target = this.getSpotTarget(spot);
        if (target === undefined || !this.getHeightOptions(spot).includes(height))
            return;
        this.pending.push({ x: spot.x, y: spot.y, height: height, kind: target ? 'replace' : 'new', replaced: target ?? null });
        this.activate(spot);
        this.update();
    }
    //a new tower that no longer reaches the board through the turn's other new towers goes too (BoardRules.keepConnectedPending).
    //Every tower gone leaves the history in update(), so the one clicked before is active again
    removePending(spot) {
        const remaining = this.pending.filter(tower => tower.x !== spot.x || tower.y !== spot.y);
        this.pending = BoardRules.keepConnectedPending(this.game.boardHandler.getTowerMap(), remaining);
        this.update();
    }
    //[BGA] the board's confirm button: sends the turn at once when no more disc can be placed this turn, else asks first
    //(ConfirmPopover: "Confirm anyway?"). Pressed again while the card is open, it confirms
    confirmClicked() {
        if (!this.canDraft() || this.pending.length === 0)
            return;
        const popover = this.game.confirmPopover;
        if (popover.isOpen())
            popover.confirm();
        else if (!this.canPlaceMore())
            this.confirmTurn();
        else
            popover.open(() => this.confirmTurn());
    }
    //whether a disc can still go somewhere this turn: discs left, and a legal spot, a replaceable tower, or a drafted tower one
    //more click would raise. Every disc drafted, or none placeable (a full board, enemy towers too high), sends the turn at once
    canPlaceMore() {
        if (this.getDiscsLeft() === 0)
            return false;
        return this.getLegalNewSpots().length > 0 || this.getReplaceableTowers().length > 0 || this.pending.some(tower => this.getCycleHeights(tower).includes(tower.height + 1));
    }
    //sends the turn once (the buttons are disabled until the server answers). A refused turn (BGA shows the server's message)
    //is editable again; an accepted one ends with towersPlaced and the state change, which clear the draft
    confirmTurn() {
        if (!this.canDraft() || this.pending.length === 0)
            return;
        this.confirming = true;
        this.update();
        const placements = this.pending.map(tower => ({ x: tower.x, y: tower.y, height: tower.height }));
        this.bga.actions.performAction('actPlaceTowers', { placements: JSON.stringify(placements) }).catch(() => {
            if (!this.drafting || !this.confirming)
                return;
            this.confirming = false;
            this.update();
        });
    }
    //redraws everything the draft shows on the board: drafted towers with their badges and buttons, legal spots, replaceable
    //towers, the gold ring
    update() {
        if (!this.drafting)
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
    updateTitle() {
        const discsThisTurn = this.stateArgs?.discsThisTurn ?? 1;
        const discColor = this.game.getDiscColor(this.game.getMyPlayerID());
        this.bga.statusBar.setTitle(_('${you} must place up to ${discs}'), { discs: this.getDiscIconsHTML(discColor, discsThisTurn, Math.min(this.getDiscsUsed(), discsThisTurn)) });
    }
    //the status bar's allowance: count mini discs in the drafting player's color (Game.scss .status-disc, a one-disc .nexo-tower
    //sized to the text line; a single one is also the disc in the "Not enough discs" bubble), the last usedCount dimmed (.used-status-disc): they dim from the right, so the full ones stay next to
    //the text, and an undo brightens the leftmost dimmed one first. HTML for statusBar.setTitle's args, never part of
    //the translated string
    getDiscIconsHTML(discColor, count, usedCount) {
        let discsHTML = '';
        for (let discIndex = 0; discIndex < count; discIndex++)
            discsHTML += `<span class="nexo-tower status-disc${discIndex >= count - usedCount ? ' used-status-disc' : ''}" data-disc-color="${discColor}"><span class="tower-disc" style="--disc-index: 0"></span></span>`;
        return `<span class="status-discs">${discsHTML}</span>`;
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
        this.game.boardHandler.setDraftClickHandlers(null);
        this.game.boardHandler.setDraft(null);
        this.game.updatePassedStamps(); //the game is over: no PASSED stamp
    }
    /**
     * This method is called each time we are leaving the game state. You can use this method to perform some user interface changes at this moment.
     */
    onLeavingState(args, isCurrentPlayerActive) {
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
 * PlayerHandler.ts
 */
class PlayerHandler {
    constructor(game, playerID, reserve, passed) {
        this.game = game;
        this.playerID = playerID;
        this.reserve = reserve;
        this.passed = passed;
        this.reserveStacks = []; //left to right
        this.createPlayerBoardContainer();
        this.setReserve(this.reserve);
        this.showPassedStamp(false); //Game.updatePassedStamps() decides once every player board exists
    }
    //every player board, spectators included, shows the reserve (its discs as stacks in the player's color) and, after an
    //automatic pass, a PASSED stamp (shown by data-passed). The score is BGA's own counter: the player's largest group
    createPlayerBoardContainer() {
        this.playerBoardContainer = document.createElement('div');
        this.playerBoardContainer.classList.add('nexo-player-board');
        this.playerBoardContainer.innerHTML = `
            <div class="player-board-reserve-row">
                <div class="reserve-stacks"></div>
                <div class="passed-stamp"><i class="fa6 fa-forward"></i>${_('Passed')}</div>
            </div>
        `;
        const playerPanel = this.game.bga.playerPanels.getElement(this.playerID);
        playerPanel.appendChild(this.playerBoardContainer);
        //each stack is a .nexo-tower box (Game.scss .reserve-stack) holding its discs, bottom first, like a tower
        this.reserveStacksElement = this.playerBoardContainer.querySelector('.reserve-stacks');
        const discColor = this.game.getDiscColor(this.playerID);
        for (let stackIndex = 0; stackIndex < PlayerHandler.RESERVE_STACK_COUNT; stackIndex++) {
            const stack = document.createElement('div');
            stack.className = 'nexo-tower reserve-stack';
            stack.setAttribute('data-disc-color', discColor);
            this.reserveStacksElement.appendChild(stack);
            this.reserveStacks.push(stack);
        }
        this.boardElement = playerPanel.closest('.player-board') ?? playerPanel; //BGA's whole board around our panel
        this.boardElement.classList.add('positioned-player-board');
        this.boardElement.addEventListener('animationend', (event) => {
            if (event.target === this.boardElement && event.animationName === PlayerHandler.BOUNCE_CLASS)
                this.boardElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        });
        //ids for TooltipHandler
        this.reserveStacksElement.id = 'reserve-stacks-' + this.playerID;
        this.playerBoardContainer.querySelector('.passed-stamp').id = 'passed-stamp-' + this.playerID;
    }
    /**
     * The reserve as the server counts it (gamedatas on setup and F5, every notification): whenever the stacks don't show
     * exactly this many discs, filled left to right, they are rebuilt from it, so they never drift from the real count.
     * After a turn's flights (takeDiscs, addDiscs) they normally match already. Discs leave from the top of the rightmost
     * stack that has any and come back onto the top of the leftmost stack with room, so a reserve of n is always the first n
     * slots, stack by stack
     */
    setReserve(reserve) {
        this.reserve = Math.max(0, reserve);
        if (!this.reserveStacks.every((stack, stackIndex) => PlayerHandler.getStackDiscs(stack).length === this.getStackHeight(stackIndex)))
            this.reserveStacks.forEach((stack, stackIndex) => {
                PlayerHandler.getStackDiscs(stack).forEach(disc => disc.remove());
                for (let level = 0; level < this.getStackHeight(stackIndex); level++)
                    PlayerHandler.addStackDisc(stack);
            });
        this.game.tooltipHandler?.updateReserveTooltip(this.playerID, this.reserve);
    }
    //a turn's tower takes count discs, one at a time, each from the top of the rightmost stack that has any. Returns where each
    //was on screen, in the order taken (Game.animateTowerSlide starts the tower's discs there, bottom disc first), measured
    //just before it goes; fewer if the stacks run out (setReserve sets them right after the turn)
    takeDiscs(count) {
        const takenRects = [];
        for (let taken = 0; taken < count; taken++) {
            const stack = [...this.reserveStacks].reverse().find(stack => PlayerHandler.getStackDiscs(stack).length > 0);
            if (!stack)
                break;
            const disc = PlayerHandler.getStackDiscs(stack).pop();
            takenRects.push(disc.getBoundingClientRect());
            disc.remove();
        }
        this.reserve = Math.max(0, this.reserve - count);
        this.game.tooltipHandler?.updateReserveTooltip(this.playerID, this.reserve);
        return takenRects;
    }
    //a replaced tower's count discs come back, one at a time, each onto the top of the leftmost stack with room. Returns the new
    //discs in the order placed (Game.animateTowerSlideAway lands the tower's discs on them, top disc first). Hidden, they keep
    //their place until their flight lands and shows them; fewer if the stacks are full (setReserve sets them right after the turn)
    addDiscs(count, hidden) {
        const addedDiscs = [];
        for (let added = 0; added < count; added++) {
            const stack = this.reserveStacks.find(stack => PlayerHandler.getStackDiscs(stack).length < PlayerHandler.RESERVE_STACK_SIZE);
            if (!stack)
                break;
            const disc = PlayerHandler.addStackDisc(stack);
            if (hidden)
                disc.style.visibility = 'hidden';
            addedDiscs.push(disc);
        }
        this.reserve += count;
        this.game.tooltipHandler?.updateReserveTooltip(this.playerID, this.reserve);
        return addedDiscs;
    }
    //how many discs stack stackIndex holds for the current reserve: stacks fill left to right
    getStackHeight(stackIndex) {
        return Math.max(0, Math.min(PlayerHandler.RESERVE_STACK_SIZE, this.reserve - stackIndex * PlayerHandler.RESERVE_STACK_SIZE));
    }
    static getStackDiscs(stack) {
        return Array.from(stack.querySelectorAll(':scope > .tower-disc'));
    }
    //a disc on top of the stack, drawn like a tower's (.tower-disc at its --disc-index)
    static addStackDisc(stack) {
        const disc = document.createElement('div');
        disc.className = 'tower-disc';
        disc.style.setProperty('--disc-index', PlayerHandler.getStackDiscs(stack).length.toString());
        stack.appendChild(disc);
        return disc;
    }
    //[BGA] the player's last turn was an automatic pass (no valid move); cleared when they place towers again.
    //Whether the stamp shows is Game.updatePassedStamps()'s call: never when both passed (the game is over)
    setPassed(passed) {
        this.passed = passed;
        this.game.updatePassedStamps();
    }
    showPassedStamp(show) {
        this.playerBoardContainer.setAttribute('data-passed', show ? 'true' : 'false');
    }
    //[BGA] a pass, seen by everyone: a big PASSED stamp with the player's name pops in at the centre of the screen, holds,
    //then shrinks onto this board's PASSED stamp. The player is marked passed as it lands: the board's stamp fades in under
    //it, or, when it doesn't show (both players passed: the game is over), the banner fades out where it landed.
    //The banner is in <body>, outside BGA's mobile scaling: it converts screen px with its own measured zoom, like
    //Game.getSlidingCloneTransform. Its transform holds its rotation (the stamp's rotate), so translate is never rotated
    async animatePass() {
        const passedStamp = this.playerBoardContainer.querySelector('.passed-stamp');
        const rotation = getComputedStyle(passedStamp).rotate;
        const rotate = (rotation && rotation !== 'none') ? rotation : '0deg';
        const banner = document.createElement('div');
        banner.classList.add('passed-banner');
        banner.innerHTML = `<div class="passed-banner-name">${this.game.divColoredPlayer(this.playerID, { class: 'playername' })}</div><i class="fa6 fa-forward"></i>${_('Passed')}`;
        banner.style.opacity = '0';
        document.body.appendChild(banner);
        //the zoom compares like with like: the rect is the border box, and computed `width` is only the content box (the
        //banner's 3x padding and border made it about 1.3 on an unzoomed page, so it flew about 77% of the way)
        const bannerRect = banner.getBoundingClientRect(); //unrotated: no transform yet
        const bannerStyle = getComputedStyle(banner);
        const cssWidth = (bannerStyle.boxSizing === 'border-box') ? parseFloat(bannerStyle.width) : ['width', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, property) => sum + parseFloat(bannerStyle[property]), 0);
        const zoom = (cssWidth > 0) ? bannerRect.width / cssWidth : 1;
        const transformTo = (dx, dy, scale) => `translate(${dx / zoom}px, ${dy / zoom}px) scale(${scale}) rotate(${rotate})`;
        banner.style.transform = transformTo(0, 0, 1.4);
        await this.game.bga.gameui.wait(20); //let the start paint before the transition kicks in
        banner.style.transition = `transform ${Game.PASS_BANNER_POP_DURATION}ms ease-out, opacity ${Game.PASS_BANNER_POP_DURATION}ms ease-out`;
        banner.style.transform = transformTo(0, 0, 1);
        banner.style.opacity = '1';
        await this.game.bga.gameui.wait(Game.PASS_BANNER_POP_DURATION + Game.PASS_BANNER_HOLD);
        //the board's stamp, measured unrotated now (the page may have scrolled during the hold); hidden, it keeps its place
        passedStamp.style.rotate = '0deg';
        const stampRect = passedStamp.getBoundingClientRect();
        passedStamp.style.rotate = '';
        const dx = (stampRect.left + stampRect.width / 2) - (bannerRect.left + bannerRect.width / 2);
        const dy = (stampRect.top + stampRect.height / 2) - (bannerRect.top + bannerRect.height / 2);
        const scale = (bannerRect.width > 0) ? stampRect.width / bannerRect.width : 1;
        //the flight's transition is .passed-banner-flying's (Game.scss): the transform and the shadow together, so it lands
        //with the board stamp's shadow. The name fades out on the way
        banner.style.transition = '';
        banner.style.setProperty('--passed-banner-flight-duration', `${Game.PASS_BANNER_FLIGHT_DURATION}ms`);
        banner.classList.add('passed-banner-flying');
        banner.style.transform = transformTo(dx, dy, scale);
        await this.game.bga.gameui.wait(Game.PASS_BANNER_FLIGHT_DURATION);
        this.setPassed(true);
        if (this.playerBoardContainer.getAttribute('data-passed') !== 'true') {
            banner.style.transition = `opacity ${Game.PASS_BANNER_SETTLE_DURATION}ms ease`;
            banner.style.opacity = '0';
        }
        await this.game.bga.gameui.wait(Game.PASS_BANNER_SETTLE_DURATION);
        banner.remove();
    }
    //every live score change goes through here: BGA's score counter is the player's largest group
    setScore(score) {
        this.game.bga.playerPanels.getScoreCounter(this.playerID)?.toValue(score);
    }
    //the score counter's value: the player's largest group (the game end row's fallback for the loser's score)
    getScore() {
        return this.game.bga.playerPanels.getScoreCounter(this.playerID)?.getValue();
    }
    //the one shared bounce (discs given back by a replacement land on this board), removed on animationend
    bounceBoard() {
        if (!this.game.bga.gameui.bgaAnimationsActive())
            return;
        this.boardElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        void this.boardElement.offsetWidth; //restarts a bounce still playing
        this.boardElement.classList.add(PlayerHandler.BOUNCE_CLASS);
    }
    //the stacks' row on screen: where a disc flies from or to when its own disc is missing from the stacks (never expected)
    getReserveRect() { return this.reserveStacksElement.getBoundingClientRect(); }
    getReserve() { return this.reserve; } //as tracked by setReserve(), takeDiscs() and addDiscs()
    isPassed() { return this.passed; }
}
PlayerHandler.BOUNCE_CLASS = 'bouncing-player-board'; //the one shared bounce class, its timing lives in Game.scss
//the reserve: RESERVE_STACK_COUNT stacks of up to RESERVE_STACK_SIZE discs side by side, DISCS_PER_PLAYER (25) in all
PlayerHandler.RESERVE_STACK_COUNT = 5;
PlayerHandler.RESERVE_STACK_SIZE = 5;

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
class BoardHandler {
    constructor(game, towers) {
        this.game = game;
        this.towerMessage = null; //the bubble over a warning tower (showTowerWarning), one at a time
        this.fitFrame = 0; //the one pending fit (requestFit), 0 when none
        //what the spot size was last computed from (fitToViewport): the room for the board, in the board's own px, and its span
        this.fittedRoom = null;
        //the last time the fit shrank the board for lack of width alone, and the room it had just before: growing straight back into
        //that room soon after, with no window resize between, is the board answering its own shrink (a scrollbar going away), so it doesn't
        this.lastShrink = null;
        this.lastWindowResizeAt = 0;
        this.contentsCenterX = null; //the middle of the towers' and legal spots' bounding box, in spots, once centred
        this.contentsCenterY = null;
        //[BGA] while my draft has towers, the centre is frozen where it was when the first one was drafted (centerContents), until
        //the turn's towers have landed (recenter) or the draft is emptied (setDraft)
        this.frozenCenter = null;
        this.boxLegalSpots = []; //the legal spots the box is centred on, shown or not (getBoxLegalSpots)
        this.towers = new Map();
        this.towerElements = new Map();
        this.pendingElements = new Map();
        this.draft = null;
        this.draftClickHandlers = null;
        this.confirmWasFull = false; //every disc of the turn was drafted at the last render: the confirm button pulses once on reaching it
        this.ringWasFilled = null; //the confirm ring's filled segments at the last render, null when no confirm button showed
        this.boardElement = document.getElementById('nexo-board');
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
        for (const tower of towers)
            this.addBoardTower(tower);
        this.fitToViewport();
        this.renderSpots();
        this.centerContents(false); //on load (F5, a replay's start): no slide
        //BGA's onScreenWidthChange (Game) only follows the width, and the page above the board is still being laid out when
        //setup measures it (a board measured too low stayed too small): fit again on every window resize and whenever the
        //layout around the board changes, one fit per frame (requestFit). Never on anything whose size follows the board's (body,
        //the page's height, the container's height): a fit there would answer its own resize. So: the container's width only
        //(the columns settling), and everything laid out before the board, whose height moves the board's top (BGA's bars,
        //the status bar, panels above the game area; observeLayoutAboveBoard)
        window.addEventListener('resize', () => {
            this.lastWindowResizeAt = performance.now();
            this.requestFit();
        });
        let observedContainerWidth = -1;
        const widthObserver = new ResizeObserver(entries => {
            const width = entries[entries.length - 1].contentRect.width;
            if (width !== observedContainerWidth) {
                observedContainerWidth = width;
                this.requestFit();
            }
        });
        if (this.boardElement.parentElement)
            widthObserver.observe(this.boardElement.parentElement);
        this.observeLayoutAboveBoard(new ResizeObserver(() => this.requestFit()));
        this.layerElement.addEventListener('click', (event) => this.onBoardClick(event));
    }
    //fits the board on the next frame, once, however many times it is asked for before then (resize, BGA's onScreenWidthChange,
    //the layout observers)
    requestFit() {
        if (this.fitFrame)
            return;
        this.fitFrame = requestAnimationFrame(() => {
            this.fitFrame = 0;
            this.fitToViewport();
        });
    }
    //observes every element laid out before the board: the earlier siblings of the board's container and of each of its
    //ancestors up to body (BGA's top bar, the status bar, anything above the game area). Their size moves the board's top, never
    //the other way round. One added before the board later (or removed from there) is observed and fits again; anything added
    //after it (the flying copies, popins and dialogs at the end of body) is ignored
    observeLayoutAboveBoard(observer) {
        const ancestors = [];
        for (let node = this.boardElement.parentElement; node && node !== document.documentElement; node = node.parentElement)
            ancestors.push(node);
        for (const ancestor of ancestors)
            for (let sibling = ancestor.previousElementSibling; sibling; sibling = sibling.previousElementSibling)
                observer.observe(sibling);
        const statusBar = document.getElementById('page-title');
        if (statusBar)
            observer.observe(statusBar); //already among them in BGA's layout; observing it twice does nothing
        //a node at or before the board in the page's order: it holds the board, or the board comes after it
        const isAboveBoard = (node) => !!node && (node.contains(this.boardElement) || !!(node.compareDocumentPosition(this.boardElement) & Node.DOCUMENT_POSITION_FOLLOWING));
        const childrenObserver = new MutationObserver(mutations => {
            let moved = false;
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(node => {
                    if (node instanceof Element && isAboveBoard(node) && !node.contains(this.boardElement)) {
                        observer.observe(node);
                        moved = true;
                    }
                });
                if (mutation.removedNodes.length > 0 && isAboveBoard(mutation.nextSibling))
                    moved = true;
            }
            if (moved)
                this.requestFit();
        });
        for (const ancestor of ancestors)
            childrenObserver.observe(ancestor, { childList: true });
    }
    /**
     * [BGA] The board as big as the window allows: square, from #nexo-board-container's padding under the status bar down to
     * BOARD_VIEWPORT_MARGIN above the window's bottom when the page is at its top (then the gap under it, $below-board-gap-*,
     * and BGA's settings below), never wider than the game area, nor smaller than MIN_BOARD_CELL_SIZE spots. Sized through --cell-size
     * on #nexo-board, so the towers, spots and the layer's translate scale with it. Measured on screen, converted with the
     * container's measured zoom (BGA scales the game area down on a phone). The room is measured from what doesn't follow the
     * board's size: the container's width (html's scrollbar-gutter keeps a scrollbar from changing it), and the window's height
     * under the board's top edge. The spot size is only computed again when that room changed by FIT_ROOM_THRESHOLD or more
     * since the last time (or the board no longer fits across), so a few px of jitter can never make it flip between two sizes;
     * and right after a shrink, it never grows straight back into the room it shrank from unless the window was resized (a
     * board whose own size made a scrollbar come and go would otherwise flip between two sizes forever)
     */
    fitToViewport() {
        const container = this.boardElement.parentElement;
        if (!container)
            return;
        //BGA switches to and from its mobile layout as the window changes, and the edge padding with it: centre again at once
        const boardSize = this.readBoardSize();
        const boardSizeChanged = boardSize !== this.boardSize;
        if (boardSizeChanged) {
            this.boardSize = boardSize;
            this.boardElement.style.setProperty('--board-size', boardSize.toString());
        }
        const containerRect = container.getBoundingClientRect();
        const containerWidth = parseFloat(getComputedStyle(container).width); //unrounded, unlike offsetWidth
        if (!(containerWidth > 0))
            return;
        const zoom = containerRect.width / containerWidth;
        const boardTop = this.boardElement.getBoundingClientRect().top + window.scrollY; //on the page, in screen px
        const borders = this.boardElement.offsetWidth - this.boardElement.clientWidth; //the board's own border, both sides
        const maxHeight = (window.innerHeight - boardTop - Game.BOARD_VIEWPORT_MARGIN) / zoom - borders;
        const maxWidth = containerWidth - borders;
        const currentCellSize = parseFloat(this.boardElement.style.getPropertyValue('--cell-size'));
        const fitted = this.fittedRoom;
        const roomUnchanged = !!fitted && fitted.boardSize === this.boardSize && currentCellSize > 0
            && Math.abs(maxWidth - fitted.width) < Game.FIT_ROOM_THRESHOLD && Math.abs(maxHeight - fitted.height) < Game.FIT_ROOM_THRESHOLD
            && (currentCellSize * this.boardSize <= maxWidth + 0.5 || currentCellSize <= Game.MIN_BOARD_CELL_SIZE); //a board too wide for the container always shrinks
        let cellSize = roomUnchanged ? currentCellSize : Math.max(Game.MIN_BOARD_CELL_SIZE, Math.floor(Math.min(maxHeight, maxWidth) / this.boardSize));
        if (!roomUnchanged) {
            const now = performance.now();
            const shrink = this.lastShrink;
            const growsBack = cellSize > currentCellSize && !!shrink && now - shrink.at < Game.FIT_GROW_BACK_WINDOW && this.lastWindowResizeAt < shrink.at
                && shrink.roomBefore.boardSize === this.boardSize
                && Math.abs(maxWidth - shrink.roomBefore.width) < Game.FIT_ROOM_THRESHOLD && Math.abs(maxHeight - shrink.roomBefore.height) < Game.FIT_ROOM_THRESHOLD;
            if (growsBack)
                cellSize = currentCellSize; //stays at the smaller size, which fits both rooms
            else if (cellSize < currentCellSize && fitted && Math.abs(maxHeight - fitted.height) < Game.FIT_ROOM_THRESHOLD)
                this.lastShrink = { at: now, roomBefore: fitted }; //only a shrink the width alone caused (a scrollbar): never the status bar's height flickering
            this.fittedRoom = { width: maxWidth, height: maxHeight, boardSize: this.boardSize };
        }
        if (this.boardElement.style.getPropertyValue('--cell-size') !== cellSize + 'px')
            this.boardElement.style.setProperty('--cell-size', cellSize + 'px');
        //the draft's controls keep a minimum size on screen (Game.scss: $pending-undo-min-size), whatever BGA's scaling
        const boardZoom = zoom.toFixed(4);
        if (zoom > 0 && this.boardElement.style.getPropertyValue('--board-zoom') !== boardZoom)
            this.boardElement.style.setProperty('--board-zoom', boardZoom);
        //the gap under the board (Game.scss: #nexo-board-container) keeps BGA's content after the game area under the window's
        //bottom with the page at its top: the board's bottom on the page, screen px, measured at its new size
        const boardPageBottom = Math.ceil(this.boardElement.getBoundingClientRect().bottom + window.scrollY) + 'px';
        if (container.style.getPropertyValue('--board-page-bottom') !== boardPageBottom)
            container.style.setProperty('--board-page-bottom', boardPageBottom);
        this.measureForBackgroundDisc(cellSize * zoom);
        if (boardSizeChanged && this.contentsCenterX !== null) {
            this.contentsCenterX = null; //applies again, without a slide
            this.contentsCenterY = null;
            this.centerContents(false);
        }
    }
    //the board's span in spots: the largest box (gridSize + 1) plus Game.scss's --board-edge-padding on each side
    readBoardSize() {
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
    measureForBackgroundDisc(cellScreenSize) {
        const viewport = document.documentElement;
        const boardRect = this.boardElement.getBoundingClientRect();
        const panelsRect = document.getElementById('player_boards')?.getBoundingClientRect();
        const panelsBeside = !!panelsRect && panelsRect.width > 0 && panelsRect.left >= boardRect.right;
        const viewportHeight = this.game.backgroundHandler?.getStableViewportHeight() || viewport.clientHeight;
        const values = {
            '--board-cell-screen-size': cellScreenSize,
            '--board-right-gap': viewport.clientWidth - boardRect.right,
            '--panels-right-gap': panelsBeside ? viewport.clientWidth - panelsRect.left : 0,
            '--panels-bottom-gap': panelsBeside ? viewportHeight - (panelsRect.bottom + window.scrollY) : 0,
            '--board-bottom-gap': viewportHeight - (boardRect.bottom + window.scrollY),
        };
        for (const [name, value] of Object.entries(values)) {
            const px = Math.round(value) + 'px';
            if (document.body.style.getPropertyValue(name) !== px)
                document.body.style.setProperty(name, px);
        }
    }
    //a tower of height discs in discColor: one .tower-disc per disc, bottom one first, and its height as a number on top. Also
    //used for log rows and the player boards' reserve, each sized by its own --cell-size
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
    //the confirm button under the active drafted tower, null when none shows (renderPendingControls rebuilds it on every draft change)
    getConfirmButton() { return this.controlsLayer.querySelector('.pending-confirm-button'); }
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
    /**
     * Yaxha's centerCubesContainer(): the layer's translate puts the middle of the bounding box of the towers, the draft's new
     * towers and the legal spots (shown or not, getBoxLegalSpots) in the middle of the board. Computed from board coordinates rather than measured on the
     * page (Yaxha measures its cubes), so every viewer, a reload and a replay get the very same layout. Slides when animate
     * (BOARD_RECENTER_DURATION) and animations are on, else applies at once (on load). Resolves once it has slid.
     * [BGA] While my draft has towers (frozenCenter), the contents keep the centre they had when it began, even off-centre: they
     * only move when the draft would leave the board (a line of new towers from the edge of the box, whose own new legal spots
     * may be built on this turn), by the least that keeps the whole box on it; the box is never wider than the board
     */
    async centerContents(animate) {
        const contents = new Map(this.towers);
        for (const pendingTower of this.draft?.pending ?? [])
            contents.set(BoardRules.key(pendingTower.x, pendingTower.y), pendingTower);
        for (const spot of this.boxLegalSpots)
            contents.set(BoardRules.key(spot.x, spot.y), spot);
        const bounds = BoardRules.getBounds(contents);
        let centerX = bounds ? (bounds.minX + bounds.maxX + 1) / 2 : 0.5; //spot x covers x to x + 1
        let centerY = bounds ? (bounds.minY + bounds.maxY + 1) / 2 : 0.5;
        if (this.frozenCenter) {
            const halfBoard = this.boardSize / 2;
            if (bounds) {
                this.frozenCenter.x = Math.min(Math.max(this.frozenCenter.x, bounds.maxX + 1 - halfBoard), bounds.minX + halfBoard);
                this.frozenCenter.y = Math.min(Math.max(this.frozenCenter.y, bounds.maxY + 1 - halfBoard), bounds.minY + halfBoard);
            }
            centerX = this.frozenCenter.x;
            centerY = this.frozenCenter.y;
        }
        if (centerX === this.contentsCenterX && centerY === this.contentsCenterY)
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
        if (slide)
            await this.game.bga.gameui.wait(Game.BOARD_RECENTER_DURATION);
    }
    //after a turn (notif_towersPlaced, once the towers have landed, so my own confirmed towers land on the frozen layout): the
    //centre is free again, the spots for the new board, then the layer slides to centre the new bounding box
    async recenter() {
        this.frozenCenter = null;
        this.renderSpots();
        await this.centerContents(true);
    }
    //the legal spots the box is centred on (centerContents), for every viewer: the draft's while I draft, otherwise the empty
    //spots where the active player could put a new tower, from the towers on the board alone (so the same for every viewer and
    //the same as the draft's when a turn starts: the board doesn't slide when the turn passes), none once the game is over.
    //Only the drafting player sees them (renderSpots)
    getBoxLegalSpots() {
        if (this.draft)
            return this.draft.legalNewSpots;
        if (this.game.isGameOver())
            return [];
        return this.game.boardRules.getLegalNewSpots(this.towers);
    }
    //the spots only the player drafting their turn sees (nobody else, spectators and replays included, so nothing looks
    //clickable to them): the legal spots (an ellipse ring where the tower's bottom disc would go, in their own disc color),
    //the replaceable enemy towers and the gold ring under the drafted tower clicked last. Empty spots and the grid's outline are never drawn
    renderSpots() {
        this.spotsLayer.innerHTML = '';
        //every ring's dashes march on one clock (Game.scss: spot-ring-march): rebuilt spots carry on instead of starting over
        this.spotsLayer.style.setProperty('--spot-ring-march-delay', `-${Math.round(performance.now())}ms`);
        this.boxLegalSpots = this.getBoxLegalSpots();
        if (this.draft && !this.game.isReplay()) {
            const legalKeys = new Set(this.draft.legalNewSpots.map(spot => BoardRules.key(spot.x, spot.y)));
            const replaceableKeys = new Set(this.draft.replaceableTowers.map(tower => BoardRules.key(tower.x, tower.y)));
            const selectedSpot = this.draft.selectedSpot;
            const selectedKey = selectedSpot ? BoardRules.key(selectedSpot.x, selectedSpot.y) : null;
            const shownSpots = new Map();
            for (const spot of [...this.draft.legalNewSpots, ...this.draft.replaceableTowers, ...(selectedSpot ? [selectedSpot] : [])])
                shownSpots.set(BoardRules.key(spot.x, spot.y), { x: spot.x, y: spot.y });
            shownSpots.forEach((shownSpot, key) => {
                const spot = document.createElement('div');
                spot.className = 'board-spot';
                BoardHandler.placeOnBoard(spot, shownSpot);
                if (legalKeys.has(key))
                    spot.classList.add('legal-spot', 'clickable-spot');
                if (replaceableKeys.has(key))
                    spot.classList.add('replaceable-spot', 'clickable-spot');
                if (key === selectedKey)
                    spot.classList.add('selected-spot');
                if (legalKeys.has(key) || replaceableKeys.has(key))
                    spot.innerHTML = BoardHandler.SPOT_RING_SVG; //the dashed outline (the fill is the spot's ::before)
                this.spotsLayer.appendChild(spot);
            });
        }
        if (this.draft)
            this.boardElement.setAttribute('data-legal-spot-color', this.draft.discColor); //the drafting player's own disc color
        else
            this.boardElement.removeAttribute('data-legal-spot-color');
    }
    //the turn being drafted (PlaceTowers), or null once it is over: its towers shown semi-transparent on their spots (a replaced
    //enemy tower fades under its replacement) with their count badges and undo buttons, legal spots and replaceable towers highlighted
    setDraft(draft) {
        this.draft = draft;
        //[BGA] the first drafted tower freezes the centre where it is (centerContents has not seen it yet); an empty draft frees
        //it, which moves nothing: the box is the same as when the turn began, unless the draft had to shift it at the board's edge
        if ((draft?.pending.length ?? 0) === 0)
            this.frozenCenter = null;
        else if (!this.frozenCenter && this.contentsCenterX !== null)
            this.frozenCenter = { x: this.contentsCenterX, y: this.contentsCenterY };
        this.renderPending();
        this.renderPendingControls();
        this.updateTowerDraftClasses();
        this.renderSpots();
        this.centerContents(true); //frozen while drafting (frozenCenter): moves only to keep the draft on the board
    }
    setDraftClickHandlers(handlers) {
        this.draftClickHandlers = handlers;
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
    //on each drafted tower, in a layer over every tower: a badge with its height (the discs it adds) on its top right corner.
    //Under the active tower only, round buttons side by side: undo (takes it back) and confirm (sends the whole turn).
    //Game.scss keeps them inside the board (nudged sideways, or above the tower on the bottom row). Their clicks never reach
    //the tower or spot underneath. While the turn is on its way to the server, both are disabled. The confirm button wears a
    //ring of one segment per disc the turn may use, filled for each drafted disc (createConfirmRing): light green while discs
    //are left (still a live button: a turn may stop early), solid green once every disc is drafted, with one pulse when it
    //gets there (not on a render that was already full, nor with animations off or reduced motion)
    renderPendingControls() {
        this.controlsLayer.innerHTML = '';
        const draft = this.draft;
        const full = !!draft && draft.discsThisTurn > 0 && draft.discsUsed >= draft.discsThisTurn;
        const animate = this.game.bga.gameui.bgaAnimationsActive() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const pulse = full && !this.confirmWasFull && animate;
        this.confirmWasFull = full;
        const ringWasFilled = this.ringWasFilled;
        this.ringWasFilled = null; //set again below if the confirm button shows
        if (!draft)
            return;
        const activeKey = draft.selectedSpot ? BoardRules.key(draft.selectedSpot.x, draft.selectedSpot.y) : null;
        for (const pendingTower of draft.pending) {
            const spot = { x: pendingTower.x, y: pendingTower.y };
            const controls = document.createElement('div');
            controls.className = 'pending-controls';
            BoardHandler.placeOnBoard(controls, spot);
            const badge = document.createElement('div');
            badge.className = 'pending-count-badge';
            badge.textContent = pendingTower.height.toString();
            controls.appendChild(badge);
            if (BoardRules.key(spot.x, spot.y) === activeKey) {
                const actions = document.createElement('div');
                actions.className = 'pending-actions';
                actions.style.setProperty('--pending-actions-count', '2');
                const confirmButton = this.createPendingButton('pending-confirm-button', _('Confirm'), BoardHandler.CONFIRM_ICON_SVG, draft.confirming, () => this.draftClickHandlers?.confirmClicked());
                confirmButton.setAttribute('data-full', full.toString());
                const ringFilled = Math.min(draft.discsUsed, draft.discsThisTurn);
                this.createConfirmRing(confirmButton, draft.discsThisTurn, ringFilled, animate ? ringWasFilled : ringFilled);
                this.ringWasFilled = ringFilled;
                if (pulse) {
                    confirmButton.classList.add('confirm-full-pulse');
                    confirmButton.addEventListener('animationend', (event) => {
                        if (event.target === confirmButton)
                            confirmButton.classList.remove('confirm-full-pulse');
                    });
                }
                actions.append(this.createPendingButton('pending-undo-button', _('Take this tower back'), BoardHandler.UNDO_ICON_SVG, draft.confirming, () => this.draftClickHandlers?.undoClicked(spot)), confirmButton);
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
    createConfirmRing(confirmButton, segments, filled, wasFilled) {
        confirmButton.style.setProperty('--ring-segments', segments.toString());
        for (let segmentIndex = 0; segmentIndex < segments; segmentIndex++) {
            const segment = document.createElement('div');
            segment.className = 'confirm-ring-segment';
            segment.style.setProperty('--segment-index', segmentIndex.toString());
            segment.classList.toggle('filled', segmentIndex < filled);
            let changeClass = null;
            if (wasFilled === null && segmentIndex < filled) {
                changeClass = 'ring-segment-fill';
                segment.style.setProperty('--segment-delay', `${segmentIndex * Game.CONFIRM_RING_STAGGER}ms`);
            }
            else if (wasFilled !== null && segmentIndex >= wasFilled && segmentIndex < filled)
                changeClass = 'ring-segment-fill';
            else if (wasFilled !== null && segmentIndex >= filled && segmentIndex < wasFilled)
                changeClass = 'ring-segment-empty';
            if (changeClass) {
                segment.classList.add(changeClass);
                segment.addEventListener('animationend', (event) => {
                    if (event.target === segment && !event.pseudoElement) //its own pop, not its ::before's color fade (same length)
                        segment.classList.remove(changeClass);
                });
            }
            confirmButton.appendChild(segment);
        }
    }
    createPendingButton(className, label, iconSVG, disabled, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pending-button ' + className;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = iconSVG;
        button.disabled = disabled;
        button.addEventListener('click', (event) => {
            event.stopPropagation(); //not a click on the drafted tower under it, which would add a disc
            if (!button.disabled)
                onClick();
        });
        return button;
    }
    //an enemy tower under a drafted replacement fades (being-replaced)
    updateTowerDraftClasses() {
        const replacedKeys = new Set((this.draft?.pending ?? []).filter(tower => tower.kind === 'replace').map(tower => BoardRules.key(tower.x, tower.y)));
        //clickable only for the player drafting, as the rings are (never in a replay, nor while the turn is on its way)
        const showWarnings = !!this.draft && !this.draft.confirming && !this.game.isReplay();
        const warningKeys = new Set(showWarnings ? this.draft.warningTowers.map(tower => BoardRules.key(tower.x, tower.y)) : []);
        this.towerElements.forEach((element, key) => {
            element.classList.toggle('being-replaced', replacedKeys.has(key));
            element.classList.toggle('warning-tower', warningKeys.has(key));
        });
        if (!this.draft)
            this.clearTowerMessage();
    }
    /**
     * [BGA] A board tower the player clicked but can't draft on (PlaceTowers.getTowerWarningHTML: their own, or an enemy tower too
     * high for the discs left), every case alike: it shakes (shakeTower) and a bubble over it says why (showTowerMessage), one
     * bubble at a time, a new one replacing it. Client only: nothing changes on the board
     */
    showTowerWarning(spot, messageHTML) {
        const towerElement = this.towerElements.get(BoardRules.key(spot.x, spot.y));
        if (!towerElement)
            return;
        this.showTowerMessage(spot, towerElement, messageHTML); //measured before the shake moves it
        this.shakeTower(towerElement);
    }
    //a short shake (one-shot .shaking-tower, the translate property, so it never fights a transform), restarted by a click
    //mid-shake; none with reduced motion or animations off
    shakeTower(towerElement) {
        if (!this.game.bga.gameui.bgaAnimationsActive() || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        towerElement.classList.remove('shaking-tower');
        void towerElement.offsetWidth; //restarts it when clicked again mid-shake
        towerElement.classList.add('shaking-tower');
        towerElement.addEventListener('animationend', function onEnd(event) {
            if (event.target !== towerElement)
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
    showTowerMessage(spot, towerElement, messageHTML) {
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
        const discs = towerElement.querySelectorAll(':scope > .tower-disc');
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
        if (message.getBoundingClientRect().top < boardRect.top + margin)
            message.setAttribute('data-placement', 'below');
        const messageRect = message.getBoundingClientRect();
        let shift = 0;
        if (messageRect.left < boardRect.left + margin)
            shift = boardRect.left + margin - messageRect.left;
        else if (messageRect.right > boardRect.right - margin)
            shift = boardRect.right - margin - messageRect.right;
        message.style.setProperty('--message-shift', `${shift / zoom}px`);
        const timers = [
            window.setTimeout(() => message.classList.add('leaving-tower-message'), Game.TOWER_MESSAGE_FADE_IN + Game.TOWER_MESSAGE_HOLD),
            window.setTimeout(() => this.clearTowerMessage(message), Game.TOWER_MESSAGE_FADE_IN + Game.TOWER_MESSAGE_HOLD + Game.TOWER_MESSAGE_FADE_OUT),
        ];
        this.towerMessage = { element: message, timers: timers };
    }
    //removes the bubble at once (only `message` when given, so an old timer never removes a newer one)
    clearTowerMessage(message = null) {
        if (!this.towerMessage || (message && this.towerMessage.element !== message))
            return;
        this.towerMessage.timers.forEach(timer => window.clearTimeout(timer));
        this.towerMessage.element.remove();
        this.towerMessage = null;
    }
    //a click on a highlighted spot (empty or an enemy tower) or on a tower of the draft: PlaceTowers drafts or cycles its height
    onBoardClick(event) {
        if (!this.draftClickHandlers)
            return;
        const target = event.target;
        if (target.closest('.pending-actions'))
            return; //a disabled button's click, which no listener of its own receives: never a click on the tower under it
        const warningTower = target.closest('.warning-tower');
        if (warningTower) {
            this.draftClickHandlers.warningTowerClicked({ x: parseInt(warningTower.getAttribute('data-x')), y: parseInt(warningTower.getAttribute('data-y')) });
            return;
        }
        const clicked = (target.closest('.pending-tower') ?? target.closest('.board-spot.clickable-spot'));
        if (!clicked)
            return;
        this.draftClickHandlers.spotClicked({ x: parseInt(clicked.getAttribute('data-x')), y: parseInt(clicked.getAttribute('data-y')) });
    }
    /**
     * A confirmed turn, played one spot at a time in the order the turn was drafted (the payload's order): on each spot, the
     * replaced enemy tower (if any) flies back onto its owner's reserve stacks on their player board, top disc first, while
     * the new tower's discs fly from the top of the player's stacks onto it, bottom disc first (discs TOWER_DISC_STAGGER
     * apart); the next spot starts TOWER_SPOT_DELAY_SHARE (0.3) of the way through this one's flight. Every viewer sees the same flights, the player who drafted
     * the turn included: their drafted towers only stay as placeholders until their spot's turn, then fly in from their
     * stacks like anyone's. With animations off nothing flies and nothing is awaited: every spot applies at once, stacks
     * included. Resolves once every tower has landed.
     */
    async applyPlacements(playerID, placements) {
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
        const allFlights = [];
        for (const placement of placements) {
            const flights = this.applyPlacement(playerID, placement, draftedElements, animate);
            if (flights.length === 0)
                continue;
            allFlights.push(...flights);
            const spotDiscCount = Math.max(placement.height, placement.replaced_height ?? 0);
            const spotFlightMs = Game.TOWER_SLIDE_DURATION + (spotDiscCount - 1) * Game.TOWER_DISC_STAGGER;
            await Promise.race([Promise.all(flights), this.game.bga.gameui.wait(spotFlightMs * Game.TOWER_SPOT_DELAY_SHARE)]);
        }
        if (allFlights.length > 0)
            await Promise.all(allFlights);
        draftedElements.forEach(element => element.remove()); //never expected: the server keeps every drafted tower
        this.renderSpots();
    }
    //one spot of a confirmed turn: swaps its towers on the board, moves their discs between the player boards' reserve stacks
    //(with animations off too, so the stacks match the turn) and returns the flights to await (none with animations off)
    applyPlacement(playerID, placement, draftedElements, animate) {
        const key = BoardRules.key(placement.x, placement.y);
        const flights = [];
        //the replaced tower's discs go back onto its owner's stacks, top disc first: the first disc placed is the top one's
        const replacedElement = this.towerElements.get(key);
        if (replacedElement) {
            this.towerElements.delete(key);
            const owner = this.game.players[placement.replaced_player_id ?? 0];
            if (owner) {
                const replacedHeight = placement.replaced_height ?? parseInt(replacedElement.getAttribute('data-height'));
                const placedDiscs = owner.addDiscs(replacedHeight, animate);
                if (animate) {
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
        if (placeholder)
            this.towersLayer.appendChild(placeholder); //in front of the new tower: its upper discs still sit over the discs landed under them
        //the new tower's discs leave the player's stacks, bottom disc first: the first disc taken is the bottom one's. The same
        //flight for every viewer, the player who drafted it included
        const mover = this.game.players[playerID];
        const takenDiscRects = mover?.takeDiscs(placement.height) ?? [];
        if (animate && mover)
            flights.push(this.game.animateTowerSlide(towerElement, takenDiscRects, mover.getReserveRect(), Game.TOWER_SLIDE_DURATION, Game.TOWER_DISC_STAGGER, { easing: Game.TOWER_SLIDE_EASING }, placeholder).finally(() => placeholder?.remove()));
        else
            placeholder?.remove(); //nothing flies: the tower is already whole
        return flights;
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
//the undo button's icon: a curved arrow turning back counter-clockwise, drawn with currentColor
BoardHandler.UNDO_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12a7 7 0 1 0 2.05-4.95"/><path d="M11 7.05H7.05V3.1"/></svg>';
//a target ring's dashed outline (legal spots and replaceable towers): Game.scss sizes the SVG to the ring and marches its
//dashes. pathLength 100 makes the dash pattern a whole number around the ring; the attributes are a fallback for a browser
//without CSS ellipse geometry (the stroke then centred on the box's edge)
BoardHandler.SPOT_RING_SVG = '<svg class="spot-ring" aria-hidden="true" focusable="false"><ellipse cx="50%" cy="50%" rx="50%" ry="50%" pathLength="100"/></svg>';
//the confirm button's icon: a tick
BoardHandler.CONFIRM_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

class LogMutationObserver {
    constructor(game) {
        this.game = game;
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
            const replayLogsObserver = new MutationObserver((mutations, obs) => {
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length) {
                        mutation.addedNodes.forEach((node) => {
                            if (node instanceof HTMLElement && node.id.startsWith('replaylogs')) {
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
    }
    //the row's class (logClass, its *-log type) as a log-class-tag, which processLogDiv moves onto the row
    addLogClassTag(logHTML, logClass) {
        return { log_html: logHTML + `<div log-class-tag="${logClass}"></div>`, log_class: logClass };
    }
    //the row's player's disc color as a class on the row (red-disc-log, black-disc-log): its accent bar. From the notification's
    //args, like every per-row style
    getDiscColorTag(player_id) {
        return `<div log-class-tag="${this.game.getDiscColor(player_id)}-disc-log"></div>`;
    }
    //create specific log types
    //"name [board]": the board as it stood at the end of the turn (board_snapshot), cropped to its towers, every spot the turn
    //touched ringed in gold (the placements: a new tower or a replacement)
    createLogTowersPlaced(player_id, placements, boardSnapshot) {
        let logHTML = `
            <div class="towers-placed-row">
                ${this.getCutPlayerNameHTML(player_id)}
                ${this.getBoardSnapshotHTML(player_id, placements, boardSnapshot)}
            </div>` + this.getDiscColorTag(player_id) + ' &nbsp;';
        return this.addLogClassTag(logHTML, 'towers-placed-log');
    }
    //[BGA] the automatic pass, icons only like Riviera's skipped power: "name [ban]", the ban sign titled with its meaning (the
    //server's PASS_LOG_STR is the plain-text fallback)
    createLogPlayerPassed(player_id) {
        const passTitle = _('No valid move, passes').replace(/"/g, '&quot;');
        let logHTML = `
            <div class="player-passed-row">
                ${this.getCutPlayerNameHTML(player_id)}
                <i class="fa6 fa-ban player-passed-icon" title="${passTitle}" aria-label="${passTitle}" role="img"></i>
            </div>` + this.getDiscColorTag(player_id) + ' &nbsp;';
        return this.addLogClassTag(logHTML, 'player-passed-log');
    }
    //the game ends: two centred lines between two icons at the row's edges. A win: [trophy] winner's name / "wins 13-9"
    //[trophy], its row a light marble with the winner's accent bar. A draw (both at the top score): [handshake] "Draw" /
    //"11-11" [handshake], its row (game-end-draw-log) a marble going from light to dark grey. The winner's own name even on
    //their page (no "You", so "wins" always fits). The loser's score is loser_score; a game ended before it existed (an old
    //replay) takes it from the notification's endGameScoring, else the loser's score counter (already their final largest
    //group: passes never change it), so the row still reads "13-9". The trailing &nbsp; every row ends with is in a hidden span
    //here: as plain text it took a line of its own under the two lines, which then sat at the top of a taller row
    createLogGameEnd(winner_ids, winningScore, endResult, loserScore, endScores) {
        const isDraw = (endResult ?? (winner_ids.length > 1 ? 'draw' : 'win')) === 'draw';
        if (isDraw)
            loserScore = winningScore;
        else if (loserScore === undefined || loserScore === null) {
            const loserID = Object.keys(this.game.players).map(Number).find(player_id => !winner_ids.map(Number).includes(player_id));
            loserScore = endScores?.[loserID] ?? this.game.players[loserID]?.getScore();
        }
        const scoreText = `${winningScore}${(loserScore === undefined || loserScore === null) ? '' : '-' + loserScore}`;
        //line 1: "Draw", or "name wins" as one string (other languages may put the name elsewhere). The words around the name
        //keep their spaces (white-space: pre) and never shrink: only a long name is cut with an ellipsis
        let titleHTML = `<span class="nexo-log-result-text nexo-log-result-draw">${_('Draw')}</span>`;
        if (!isDraw) {
            const [beforeName, afterName] = _('${player_name} wins').split('${player_name}');
            titleHTML = `<span class="nexo-log-result-text">${beforeName ?? ''}</span>${this.game.divColoredPlayer(winner_ids[0], { class: 'playername' }, false)}<span class="nexo-log-result-text">${afterName ?? ''}</span>`;
        }
        const iconHTML = `<i class="fa ${isDraw ? 'fa-handshake-o' : 'fa-trophy'} nexo-log-result-icon" aria-hidden="true"></i>`;
        let logHTML = `
            <div class="game-end-row nexo-log-result">
                ${iconHTML}
                <div class="nexo-log-result-lines">
                    <div class="nexo-log-result-title">${titleHTML}</div>
                    <div class="nexo-log-result-score">${scoreText}</div>
                </div>
                ${iconHTML}
            </div>` + (isDraw ? '<div log-class-tag="game-end-draw-log"></div>' : this.getDiscColorTag(winner_ids[0])) + '<span class="nexo-log-result-spacer"> &nbsp;</span>';
        return this.addLogClassTag(logHTML, 'game-end-log');
    }
    /**
     * [BGA] A turn's board snapshot: one .snapshot-cell per spot of the bounding box of the towers (BoardRules.getBounds, the
     * main board's own coordinates, so negative ones too), row by row, each holding its tower (createTowerDiv, sized by the
     * snapshot's --cell-size) or a faint dot. The turn's spots (placements) get .changed-snapshot-cell, a gold ring. Built
     * from the notification's args alone, so a reload and a
     * replay draw the same. A turn logged before board_snapshot existed shows its own towers only
     */
    getBoardSnapshotHTML(player_id, placements, boardSnapshot) {
        const towers = new Map();
        if (typeof boardSnapshot === 'string') {
            for (const cellText of boardSnapshot.split(' ')) {
                const cell = cellText.match(/^(-?\d+),(-?\d+)([rb])(\d+)$/);
                if (cell)
                    towers.set(BoardRules.key(parseInt(cell[1]), parseInt(cell[2])), { discColor: cell[3] === 'b' ? 'black' : 'red', height: parseInt(cell[4]) });
            }
        }
        else {
            for (const placement of placements)
                towers.set(BoardRules.key(placement.x, placement.y), { discColor: this.game.getDiscColor(player_id), height: placement.height });
        }
        const changedKeys = new Set(placements.map(placement => BoardRules.key(placement.x, placement.y)));
        const spots = new Map();
        for (const key of [...towers.keys(), ...changedKeys]) {
            const [x, y] = key.split(',').map(Number);
            spots.set(key, { x, y });
        }
        const bounds = BoardRules.getBounds(spots);
        if (!bounds)
            return '';
        let cellsHTML = '';
        for (let y = bounds.minY; y <= bounds.maxY; y++) {
            for (let x = bounds.minX; x <= bounds.maxX; x++) {
                const key = BoardRules.key(x, y);
                const tower = towers.get(key);
                const cellClass = 'snapshot-cell' + (tower ? '' : ' empty-snapshot-cell') + (changedKeys.has(key) ? ' changed-snapshot-cell' : '');
                const towerHTML = tower ? BoardHandler.createTowerDiv(tower.discColor, tower.height, 'snapshot-tower').outerHTML : '';
                cellsHTML += `<div class="${cellClass}">${towerHTML}</div>`;
            }
        }
        return `<div class="log-board-snapshot" style="--snapshot-columns: ${bounds.maxX - bounds.minX + 1}; --snapshot-rows: ${bounds.maxY - bounds.minY + 1}">${cellsHTML}</div>`;
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
            this.updateReserveTooltip(parseInt(player_id), this.game.players[player_id].getReserve());
            this.game.bga.gameui.addTooltip('passed-stamp-' + player_id, _('No valid move on the last turn: passed automatically. Back in the game as soon as a move is possible.'), '', TooltipHandler.TOOLTIP_DELAY);
            //BGA's score: the largest group
            const scoreElement = document.getElementById('player_score_' + player_id);
            if (scoreElement)
                this.game.bga.gameui.addTooltip(scoreElement.id, _('Score: the number of towers in your largest area of orthogonally connected towers'), '', TooltipHandler.TOOLTIP_DELAY);
        }
    }
    //the reserve stacks: the exact number of discs left, kept current by PlayerHandler on every change (adding a tooltip to the
    //same id again replaces it, like Riviera's updateDieTooltip)
    updateReserveTooltip(playerID, reserve) {
        const countText = (reserve === 1) ? _('1 disc left') : _('${count} discs left').replace('${count}', reserve.toString());
        this.game.bga.gameui.addTooltipHtml('reserve-stacks-' + playerID, `<b>${countText}</b><br>${_('Discs in reserve. Discs of a replaced tower come back here.')}`, TooltipHandler.TOOLTIP_DELAY);
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
        this.game.updatePassedStamps(); //the game is over: no PASSED stamp
    }
    isDisplayed() { return this.displayed; }
}

class PrefHandler {
    constructor(game, prefNameToIndex) {
        this.game = game;
        this.prefNameToIndex = { ...PrefHandler.DEFAULT_PREF_NAMES, ...prefNameToIndex };
        this.game.bga.userPreferences.onChange = (prefIndex, prefValue) => this.onGameUserPreferenceChanged(prefIndex, prefValue);
        for (const prefName in this.prefNameToIndex) {
            const prefIndex = this.prefNameToIndex[prefName];
            this.onGameUserPreferenceChanged(prefIndex, this.game.bga.userPreferences.get(prefIndex), true);
        }
    }
    //on page load (isInitialLoad) the state classes haven't received their args yet, so nothing is redrawn
    onGameUserPreferenceChanged(prefIndex, prefValue, isInitialLoad = false) {
        switch (prefIndex) {
            case this.prefNameToIndex.show_stack_heights:
                this.applyStackHeights(prefValue);
                break;
        }
    }
    //game specific functions
    //one class on <html>, so it reaches every tower: the board, the flying copies (in <body>) and the log rows. Any value other
    //than Disabled is Enabled (the default; also a missing value, as for a spectator with no saved preference)
    applyStackHeights(prefValue) {
        document.documentElement.classList.toggle('hide-stack-heights', prefValue == PrefHandler.STACK_HEIGHTS_DISABLED);
    }
}
//"Always show stack heights" (gamepreferences.jsonc, pref 100): the height number on top of every tower, 1 Enabled, 2 Disabled
PrefHandler.STACK_HEIGHTS_DISABLED = 2;
//Game.php $userPrefs, for gamedatas without pref_names: a replay starts from the gamedatas saved when its game began, so a
//game begun before a preference existed has no pref_names (or lacks the newer ones). Keep in sync with Game.php
PrefHandler.DEFAULT_PREF_NAMES = {
    show_stack_heights: 100,
};

/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * BackgroundHandler.ts
 */
class BackgroundHandler {
    static getInstance() {
        return BackgroundHandler.instance ?? (BackgroundHandler.instance = new BackgroundHandler());
    }
    constructor() {
        this.maxScroll = 0; //px of scroll past which every layer is at its cap
        this.frame = 0;
        this.stableWidth = 0; //the window's size at the last real resize (onResize)
        this.stableHeight = 0;
        this.redDiscMeasurements = { buttons: 0, header: 0, start: null }; //the latest measured
        this.appliedRedDiscKey = ''; //the values set on body, as a string to compare
        this.redDiscPending = false; //measured while scrolled: set back at the page's top (update)
        this.layoutFrame = 0;
        this.observedBoard = null;
        this.layoutObserver = new ResizeObserver(() => this.scheduleRedDiscStart());
        const arcShadow = document.createElement('div');
        arcShadow.classList.add('background-arc-shadow');
        document.body.insertAdjacentElement('afterbegin', arcShadow); //first in <body>: over body::before, under body::after
        this.redDiscElement = document.createElement('div');
        this.redDiscElement.classList.add('background-red-disc');
        arcShadow.insertAdjacentElement('afterend', this.redDiscElement); //over the shadow, under body::after
        this.stableWidth = document.documentElement.clientWidth;
        this.stableHeight = document.documentElement.clientHeight;
        this.readParallaxSettings();
        this.refreshRedDiscPath(true);
        //the settings change with the window's width (the mobile breakpoint) and prefers-reduced-motion: read them again then,
        //never while scrolling
        window.addEventListener('resize', () => this.onResize());
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { this.readParallaxSettings(); this.refreshRedDiscPath(true); this.scheduleUpdate(); });
        window.addEventListener('scroll', () => this.scheduleUpdate(), { passive: true });
        //measure BGA's floating buttons again while its page settles (the first frame after setup: the board exists and has its
        //size), and whenever its chat bubbles come and go in #chatbar (direct children only: on mobile the table log fills the
        //chat windows inside it), which resizes nothing. The red disc's start follows the board's size and place: a ResizeObserver
        //on the board (once it exists) and on body (the page above it settling)
        const remeasure = () => this.refreshRedDiscPath(false);
        requestAnimationFrame(remeasure);
        for (const delay of BackgroundHandler.FLOATING_BUTTONS_REMEASURE_DELAYS)
            setTimeout(remeasure, delay);
        if (document.readyState !== 'complete')
            window.addEventListener('load', remeasure, { once: true });
        document.fonts?.ready.then(remeasure);
        const chatBar = document.getElementById('chatbar');
        if (chatBar)
            new MutationObserver(remeasure).observe(chatBar, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });
        this.layoutObserver.observe(document.body);
        this.update();
    }
    //the window's height, held through a mobile browser's address bar showing or hiding: for anything measured from the
    //window's bottom that must not move then (BoardHandler.measureForBackgroundDisc)
    getStableViewportHeight() {
        return this.stableHeight;
    }
    //a real resize (the width changed, a rotation, or the height by more than an address bar) measures everything again and
    //applies it at once: the layout moves then anyway. An address bar showing or hiding changes nothing
    onResize() {
        const width = document.documentElement.clientWidth;
        const height = document.documentElement.clientHeight;
        if (width === this.stableWidth && Math.abs(height - this.stableHeight) <= BackgroundHandler.ADDRESS_BAR_MAX_HEIGHT)
            return;
        this.stableWidth = width;
        this.stableHeight = height;
        this.readParallaxSettings();
        this.refreshRedDiscPath(true);
        this.scheduleUpdate();
    }
    //the scroll offset where the slowest layer reaches its cap (0 when nothing moves: prefers-reduced-motion sets the ratios to 0)
    readParallaxSettings() {
        const rootStyle = getComputedStyle(document.documentElement);
        this.maxScroll = 0;
        for (const layer of BackgroundHandler.PARALLAX_LAYERS) {
            const ratio = parseFloat(rootStyle.getPropertyValue(`--bg-parallax-${layer}-ratio`));
            const cap = parseFloat(rootStyle.getPropertyValue(`--bg-parallax-${layer}-cap`));
            if (ratio > 0 && cap > 0)
                this.maxScroll = Math.max(this.maxScroll, Math.ceil(cap / ratio));
        }
        //the red disc's growth and rise have their own end; with prefers-reduced-motion they are held at their end, nothing to follow
        const progressScroll = parseFloat(rootStyle.getPropertyValue('--bg-parallax-red-disc-progress-scroll'));
        if (progressScroll > 0 && rootStyle.getPropertyValue('--bg-parallax-still').trim() !== '1')
            this.maxScroll = Math.max(this.maxScroll, Math.ceil(progressScroll));
    }
    //measures what sets the red disc's path (BGA's floating buttons and fixed header, unless scanButtons is false: the start alone,
    //for a layout change, without the corner's hit-test) and sets it, at once if applyNow or the page is at its top (the path is
    //multiplied by the scroll's progress, 0 there, and the disc is behind the board then, so a new value can't show); otherwise it
    //waits for the top (update), so the disc never jumps mid-scroll
    refreshRedDiscPath(applyNow, scanButtons = true) {
        if (scanButtons) {
            this.redDiscMeasurements.buttons = this.measureFloatingButtons();
            this.redDiscMeasurements.header = this.measureFixedHeader();
        }
        this.redDiscMeasurements.start = this.measureRedDiscStart();
        if (JSON.stringify(this.redDiscMeasurements) === this.appliedRedDiscKey) {
            this.redDiscPending = false;
            return;
        }
        if (applyNow || window.scrollY <= 0)
            this.applyRedDiscMeasurements();
        else
            this.redDiscPending = true;
    }
    applyRedDiscMeasurements() {
        const { buttons, header, start } = this.redDiscMeasurements;
        this.appliedRedDiscKey = JSON.stringify(this.redDiscMeasurements);
        this.redDiscPending = false;
        const bodyStyle = document.body.style;
        bodyStyle.setProperty(BackgroundHandler.FLOATING_BUTTONS_PROPERTY, buttons + 'px');
        bodyStyle.setProperty(BackgroundHandler.FIXED_HEADER_PROPERTY, header + 'px');
        if (start) {
            bodyStyle.setProperty(BackgroundHandler.RED_DISC_START_RIGHT_PROPERTY, start.right + 'px');
            bodyStyle.setProperty(BackgroundHandler.RED_DISC_START_BOTTOM_PROPERTY, start.bottom + 'px');
        }
        else { //desktop, or no board: Game.scss starts the disc at its own place
            bodyStyle.removeProperty(BackgroundHandler.RED_DISC_START_RIGHT_PROPERTY);
            bodyStyle.removeProperty(BackgroundHandler.RED_DISC_START_BOTTOM_PROPERTY);
        }
    }
    //a layout change (the board's size or place, the page above it): the start again, once per frame
    scheduleRedDiscStart() {
        cancelAnimationFrame(this.layoutFrame);
        this.layoutFrame = requestAnimationFrame(() => this.refreshRedDiscPath(false, false));
    }
    /**
     * Under Game.scss's mobile breakpoint, where the red disc starts, at the page's top: its centre from the window's right and
     * bottom edges, px, so that its whole image at its starting scale (--bg-parallax-red-disc-min-scale), shadow included
     * (--bg-red-disc-footprint-*-share), sits --bg-red-disc-start-margin inside the board's bottom-right corner, hidden behind it
     * (the board is opaque and over the disc). The board is measured with getBoundingClientRect() plus scrollY, so where it is with
     * the page at its top, even if measured while scrolled; a corner past the window's right or bottom edge is taken at that edge
     * instead (the board still covers it there). The disc's size is its box's, which is its full size (offsetWidth / offsetHeight
     * ignore its transform). Null on desktop, without a board, or while the disc is hidden: Game.scss then starts it at its own
     * place. Never called from the scroll handler
     */
    measureRedDiscStart() {
        const root = document.documentElement;
        const rootStyle = getComputedStyle(root);
        if (rootStyle.getPropertyValue('--bg-parallax-red-disc-rises').trim() !== '1')
            return null;
        const board = document.getElementById('nexo-board');
        if (!board)
            return null;
        if (this.observedBoard !== board) {
            this.observedBoard = board;
            this.layoutObserver.observe(board);
        }
        const width = this.redDiscElement.offsetWidth;
        const height = this.redDiscElement.offsetHeight;
        if (!(width > 0 && height > 0))
            return null;
        const read = (property) => parseFloat(rootStyle.getPropertyValue(property));
        const scale = read('--bg-parallax-red-disc-min-scale');
        const margin = read('--bg-red-disc-start-margin');
        const reachRight = (read('--bg-red-disc-footprint-right-share') - read('--bg-red-disc-center-x-share')) * width * scale; //from the centre
        const reachDown = (read('--bg-red-disc-footprint-bottom-share') - read('--bg-red-disc-center-y-share')) * height * scale;
        const viewportWidth = root.clientWidth;
        const viewportHeight = this.stableHeight;
        const boardRect = board.getBoundingClientRect();
        const cornerX = Math.min(boardRect.right, viewportWidth);
        const cornerY = Math.min(boardRect.bottom + window.scrollY, viewportHeight); //with the page at its top
        return {
            right: Math.round(viewportWidth - (cornerX - margin - reachRight)),
            bottom: Math.round(viewportHeight - (cornerY - margin - reachDown)),
        };
    }
    //under Game.scss's mobile breakpoint, how far from the window's top BGA's header reaches once the page scrolls (the red disc's
    //rise stays under it): the status bar (#page-title), which pins to the window's top, plus the top bar (#topbar) when it is fixed
    //too (ConfirmPopover's check). Their heights, not where they are now: at the page's top the status bar is still in the flow
    measureFixedHeader() {
        if (getComputedStyle(document.documentElement).getPropertyValue('--bg-parallax-red-disc-rises').trim() !== '1')
            return 0;
        const statusBar = document.getElementById('page-title');
        const topBar = document.getElementById('topbar');
        const statusBarHeight = statusBar ? statusBar.getBoundingClientRect().height : 0;
        const topBarHeight = topBar && getComputedStyle(topBar).position === 'fixed' ? topBar.getBoundingClientRect().height : 0;
        return Math.round(statusBarHeight + topBarHeight);
    }
    /**
     * Under Game.scss's mobile breakpoint (--bg-parallax-red-disc-rises), how high BGA's floating round buttons in the window's
     * bottom-right corner (the replay / history and chat bubbles) reach: screen px from the window's bottom edge to their top, so
     * their bottom offset and the safe-area inset are counted. 0 when there are none, or on desktop. BGA's markup for them is
     * not ours to rely on, so this hit-tests the corner (FLOATING_BUTTONS_SCAN_*) with elementsFromPoint, which lists every
     * element at a point, not only the topmost: the buttons are found even under BGA's loading screen, which covers the page
     * during setup (elementFromPoint only found that, and the first scroll's address bar resize then corrected it, mid-scroll).
     * It takes the highest top among the elements fixed in place (themselves or an ancestor position: fixed) that are no taller
     * than FLOATING_BUTTONS_MAX_HEIGHT_SHARE of the window, inside a fixed element no taller either (not the loading screen, not
     * an open chat window). Our own layers take no clicks, so they are never listed
     */
    measureFloatingButtons() {
        const root = document.documentElement;
        if (getComputedStyle(root).getPropertyValue('--bg-parallax-red-disc-rises').trim() !== '1')
            return 0;
        const width = root.clientWidth;
        const height = root.clientHeight;
        const maxHeight = height * BackgroundHandler.FLOATING_BUTTONS_MAX_HEIGHT_SHARE;
        const rects = new Map();
        const getRect = (element) => {
            if (!rects.has(element))
                rects.set(element, element.getBoundingClientRect());
            return rects.get(element);
        };
        const fixedRoots = new Map(); //each element's nearest position: fixed ancestor (or itself), null if none
        const getFixedRoot = (element) => {
            if (fixedRoots.has(element))
                return fixedRoots.get(element);
            const fixedRoot = element === document.body || element === root ? null
                : getComputedStyle(element).position === 'fixed' ? element
                    : element.parentElement ? getFixedRoot(element.parentElement) : null;
            fixedRoots.set(element, fixedRoot);
            return fixedRoot;
        };
        let top = height;
        const step = BackgroundHandler.FLOATING_BUTTONS_SCAN_STEP;
        for (let y = height - 1; y >= height * (1 - BackgroundHandler.FLOATING_BUTTONS_SCAN_HEIGHT_SHARE); y -= step) {
            for (let x = width - 1; x >= width * (1 - BackgroundHandler.FLOATING_BUTTONS_SCAN_WIDTH_SHARE); x -= step) {
                for (const element of document.elementsFromPoint(x, y)) {
                    const fixedRoot = getFixedRoot(element);
                    if (!fixedRoot || getRect(fixedRoot).height > maxHeight)
                        continue;
                    const rect = getRect(element);
                    if (rect.height > 0 && rect.height <= maxHeight)
                        top = Math.min(top, rect.top);
                }
            }
        }
        return Math.round(Math.max(0, height - top));
    }
    //one update per frame, whatever the number of scroll events; the scroll offset is read in the frame, not in the handler
    scheduleUpdate() {
        if (this.frame)
            return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.update();
        });
    }
    update() {
        const scrollY = window.scrollY;
        const offset = Math.round(Math.min(Math.max(scrollY, 0), this.maxScroll)).toString(); //never negative (iOS's bounce at the top)
        const root = document.documentElement;
        if (root.style.getPropertyValue(BackgroundHandler.PARALLAX_PROPERTY) !== offset)
            root.style.setProperty(BackgroundHandler.PARALLAX_PROPERTY, offset);
        if (this.redDiscPending && scrollY <= 0) //back at the top: the red disc's path is at its start here
            this.applyRedDiscMeasurements();
    }
}
//custom properties on <html>: the scroll offset (set here) and the parallax's settings (set in Game.scss, :root)
BackgroundHandler.PARALLAX_PROPERTY = '--nexo-parallax';
BackgroundHandler.PARALLAX_LAYERS = ['near', 'far', 'red-disc']; //each with its ratio and cap; the red disc's growth has its own end
//on body: from the window's bottom to the top of BGA's floating buttons, px (measureFloatingButtons)
BackgroundHandler.FLOATING_BUTTONS_PROPERTY = '--floating-buttons-height';
//on body: how far from the window's top BGA's fixed header reaches once the page scrolls, px (measureFixedHeader)
BackgroundHandler.FIXED_HEADER_PROPERTY = '--fixed-header-height';
//on body: where the red disc starts on mobile, its centre from the window's right and bottom edges, px (measureRedDiscStart)
BackgroundHandler.RED_DISC_START_RIGHT_PROPERTY = '--red-disc-start-right';
BackgroundHandler.RED_DISC_START_BOTTOM_PROPERTY = '--red-disc-start-bottom';
//measureFloatingButtons(): the share of the window's width (from the right) and height (from the bottom) hit-tested for
//BGA's floating buttons, every FLOATING_BUTTONS_SCAN_STEP screen px; anything fixed taller than the height share is not a
//button (BGA's loading screen, an open chat window)
BackgroundHandler.FLOATING_BUTTONS_SCAN_WIDTH_SHARE = 0.5;
BackgroundHandler.FLOATING_BUTTONS_SCAN_HEIGHT_SHARE = 0.4;
BackgroundHandler.FLOATING_BUTTONS_SCAN_STEP = 12;
BackgroundHandler.FLOATING_BUTTONS_MAX_HEIGHT_SHARE = 0.4;
//ms after setup when the buttons are measured again, while BGA finishes laying out its page: all before a first scroll,
//usually, and any later change waits for the page's top (refreshRedDiscPath), so it never shows
BackgroundHandler.FLOATING_BUTTONS_REMEASURE_DELAYS = [300, 1000, 2500];
//px: a resize that only changes the height, by at most this, is a mobile browser's address bar showing or hiding (the first
//scroll down hides it), not a real resize: nothing is measured again
BackgroundHandler.ADDRESS_BAR_MAX_HEIGHT = 160;
BackgroundHandler.instance = null; //guards against second layers if the game sets its UI up again

/**
 * [BGA] "Confirm anyway?" (PlaceTowers.confirmClicked): when the player confirms a turn with discs still placeable, a small card
 * opens under the board's confirm button instead of sending it: "You haven't placed all your discs. Confirm anyway?", then
 * one line of two buttons, "Cancel" (closes) on the left and "Confirm" (sends the turn) on the right. Our own card, not BGA's confirmationDialog. It lives in <body>,
 * position fixed, outside BGA's mobile scaling (real screen px), over the board's discs and over the status bar (z-index 948,
 * later in <body>), and never moves the page's layout. Its place is measured on screen from the confirm button (found again
 * by BoardHandler.getConfirmButton, the board rebuilds its controls on every draft change): below it, else above it, and
 * kept inside the game area and the viewport (below a fixed BGA top bar), with an arrow at the button; measured again on
 * scroll and resize. Closed by "Cancel", a pointer down outside it (not on the confirm button: a second press of it
 * confirms), Escape, and by PlaceTowers on any draft change, on sending the turn and on leaving the state. One at a time.
 * The anchor gap and the edge margin come from Game.scss (--confirm-popover-anchor-gap, --confirm-popover-edge-margin)
 */
class ConfirmPopover {
    constructor(game) {
        this.game = game;
        this.popoverElement = null;
        this.onConfirm = null;
        this.repositionFrame = 0;
        this.pointerDownListener = (event) => this.onDocumentPointerDown(event);
        this.keyDownListener = (event) => this.onDocumentKeyDown(event);
        this.viewportChangeListener = () => this.scheduleReposition();
    }
    isOpen() { return !!this.popoverElement; }
    //opens the card under the confirm button (closing any other first); onConfirm sends the turn
    open(onConfirm) {
        this.close();
        this.onConfirm = onConfirm;
        const popover = document.createElement('div');
        popover.className = 'confirm-popover';
        popover.setAttribute('role', 'dialog');
        const text = document.createElement('div');
        text.className = 'confirm-popover-text';
        text.textContent = _("You haven't placed all your discs. Confirm anyway?");
        popover.setAttribute('aria-label', text.textContent);
        const buttons = document.createElement('div');
        buttons.className = 'confirm-popover-buttons';
        buttons.append(//Cancel on the left, Confirm on the right, on one line
        this.createButton('confirm-popover-cancel', _('Cancel'), () => this.close()), this.createButton('confirm-popover-confirm', _('Confirm'), () => this.confirm()));
        const arrow = document.createElement('div');
        arrow.className = 'confirm-popover-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        popover.append(text, buttons, arrow);
        this.popoverElement = popover;
        document.body.appendChild(popover);
        this.addListeners();
        this.reposition();
    }
    //closes without confirming (also what "Cancel" does)
    close() {
        if (this.repositionFrame) {
            cancelAnimationFrame(this.repositionFrame);
            this.repositionFrame = 0;
        }
        this.removeListeners();
        this.popoverElement?.remove();
        this.popoverElement = null;
        this.onConfirm = null;
    }
    //"Confirm", or a second press of the board's confirm button while open (PlaceTowers)
    confirm() {
        const onConfirm = this.onConfirm;
        this.close();
        onConfirm?.();
    }
    createButton(className, label, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'confirm-popover-button ' + className;
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            onClick();
        });
        return button;
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
    //outside the card: closed. Not on the board's confirm button, whose click (after this pointer down) confirms
    onDocumentPointerDown(event) {
        const target = event.target;
        if (!this.popoverElement || this.popoverElement.contains(target) || target.closest?.('#nexo-board .pending-confirm-button'))
            return;
        this.close();
    }
    //never while typing (BGA's chat)
    onDocumentKeyDown(event) {
        const target = event.target;
        if (event.key !== 'Escape' || target?.closest?.('input, textarea, select, [contenteditable="true"]'))
            return;
        event.preventDefault();
        this.close();
    }
    scheduleReposition() {
        if (!this.popoverElement || this.repositionFrame)
            return;
        this.repositionFrame = requestAnimationFrame(() => {
            this.repositionFrame = 0;
            this.reposition();
        });
    }
    //below the confirm button when the card fits there, else above it (else wherever has more room), then kept inside the game
    //area and the viewport across (the viewport alone when the game area is narrower than the card) and inside the viewport
    //down (below a fixed BGA top bar). The arrow keeps pointing at the button's centre
    reposition() {
        if (!this.popoverElement)
            return;
        const anchor = this.game.boardHandler.getConfirmButton();
        if (!anchor) {
            this.close(); //the button is gone (never expected while open: PlaceTowers closes the card first)
            return;
        }
        const popoverStyle = getComputedStyle(this.popoverElement);
        const gap = parseFloat(popoverStyle.getPropertyValue('--confirm-popover-anchor-gap')) || 0;
        const margin = parseFloat(popoverStyle.getPropertyValue('--confirm-popover-edge-margin')) || 0;
        const anchorRect = anchor.getBoundingClientRect();
        const width = this.popoverElement.offsetWidth;
        const height = this.popoverElement.offsetHeight;
        const viewportWidth = document.documentElement.clientWidth; //leaves out a vertical scrollbar, which innerWidth counts
        const viewportHeight = window.innerHeight;
        const minTop = this.getMinTop(margin);
        const belowTop = anchorRect.bottom + gap;
        const aboveTop = anchorRect.top - gap - height;
        const roomBelow = viewportHeight - margin - belowTop;
        const roomAbove = aboveTop - minTop;
        const placement = (roomBelow >= height || roomBelow >= roomAbove + height) ? 'below' : 'above';
        const top = Math.max(minTop, Math.min(placement === 'below' ? belowTop : aboveTop, viewportHeight - margin - height));
        let minLeft = margin;
        let maxLeft = viewportWidth - margin - width;
        const gameAreaRect = this.game.bga.gameArea.getElement()?.getBoundingClientRect();
        if (gameAreaRect) {
            const areaMinLeft = Math.max(minLeft, gameAreaRect.left + margin);
            const areaMaxLeft = Math.min(maxLeft, gameAreaRect.right - margin - width);
            if (areaMinLeft <= areaMaxLeft) {
                minLeft = areaMinLeft;
                maxLeft = areaMaxLeft;
            }
        }
        const centerX = anchorRect.left + anchorRect.width / 2;
        const left = Math.max(minLeft, Math.min(centerX - width / 2, maxLeft));
        this.popoverElement.style.left = `${left}px`;
        this.popoverElement.style.top = `${top}px`;
        this.popoverElement.setAttribute('data-placement', placement);
        this.popoverElement.style.setProperty('--confirm-popover-arrow-offset', `${Math.max(16, Math.min(width - 16, centerX - left))}px`);
    }
    //the card never goes under BGA's top bar when it is fixed (it paints over everything on mobile)
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
        this.bga.gameArea.getElement().insertAdjacentHTML('beforeend', `
            <div id="nexo-board-container">
                <div id="nexo-board"></div>
            </div>
        `);
        this.backgroundHandler = BackgroundHandler.getInstance();
        this.myPlayerID = this.bga.players.getCurrentPlayerId();
        this.boardRules = new BoardRules(gamedatas.rules);
        this.endGameScoringHandler = new EndGameScoringHandler(this);
        // Setting up player boards
        for (let player_id in gamedatas.players) {
            const { reserve, passed } = this.gamedatas.players[player_id];
            this.players[player_id] = new PlayerHandler(this, parseInt(player_id), reserve, passed);
        }
        this.updatePassedStamps();
        this.boardHandler = new BoardHandler(this, gamedatas.towers);
        this.confirmPopover = new ConfirmPopover(this);
        this.logMutationObserver = new LogMutationObserver(this);
        this.tooltipHandler = new TooltipHandler(this);
        this.prefHandler = new PrefHandler(this, gamedatas.pref_names);
        this.bga.gameui.onScreenWidthChange = () => this.onScreenWidthChange();
        Object.assign(this.bga.gameui, {
            debug_passAnim: (who) => this.debug_passAnim(who),
            debug_clearPassed: () => this.debug_clearPassed(),
            debug_towerWarning: (x, y) => this.debug_towerWarning(x, y),
        });
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
            //no args.processed guard (Riviera's): when BGA formats the same args object a second time, a guarded pass returns the
            //plain *_LOG_STR fallback, a row with no log-class-tag that the log CSS hides (black replaying from the first move lost
            //red's first row). Each row is built from args alone, so building it again is harmless
            if (log && args) {
                // list of special keys we want to replace with images
                const keys = ['TOWERS_PLACED_LOG_STR', 'PASS_LOG_STR', 'GAME_END_LOG_STR'];
                for (let key of keys) {
                    if (key in args) {
                        if (key == 'TOWERS_PLACED_LOG_STR')
                            log = this.logMutationObserver.createLogTowersPlaced(args['player_id'], args['placements'], args['board_snapshot']).log_html;
                        else if (key == 'PASS_LOG_STR')
                            log = this.logMutationObserver.createLogPlayerPassed(args['player_id']).log_html;
                        else if (key == 'GAME_END_LOG_STR')
                            log = this.logMutationObserver.createLogGameEnd(args['winner_ids'], args['winning_score'], args['end_result'], args['loser_score'], args['endGameScoring']?.scores).log_html;
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
        let html = "<span style=\"font-weight:bold;color:#" + color + ";\" " + this.getAttributesHTML(attributes) + ">" + _("You") + "</span>";
        return html;
    }
    divColoredPlayer(player_id, attributes = {}, detectYou = true) {
        if (detectYou && parseInt(player_id) === this.myPlayerID)
            return this.divYou(attributes);
        player_id = player_id.toString();
        let color = this.gamedatas.players[player_id].color;
        let html = "<span style=\"color:#" + color + ";\" " + this.getAttributesHTML(attributes) + ">" + this.gamedatas.players[player_id].name + "</span>";
        return html;
    }
    getAttributesHTML(attributes) { return Object.entries(attributes || {}).map(([key, value]) => `${key}="${value}"`).join(' '); }
    //a tower already on its spot (BoardHandler.createTowerDiv) flies in from its player board's reserve stacks, one disc at a
    //time: each disc flies on its own, bottom disc first and staggerMs apart, as a copy of the whole tower with every other disc
    //hidden. Disc i starts exactly over the reserve disc it was taken from, fromDiscRects[i] (PlayerHandler.takeDiscs, already
    //gone from the stacks: the copy takes its place), or with the whole copy over fallbackFromRect if it has none. Each copy
    //lands at the tower's own size and place, so nothing jumps at the end. Each disc shows in the tower as it lands, the height
    //number with the top one. Everything is measured on screen (getBoundingClientRect), and the copies (in <body>, outside
    //BGA's mobile scaling of the game area) convert screen px with their measured zoom, so they match on desktop and mobile
    //alike. A placeholder (the drafted tower on the same spot, in front of it) hides its disc i, and with the top one its height
    //number, as disc i lands, so the solid disc takes its place in the same frame. Resolves once the top disc has landed.
    //Everything before the first await runs synchronously
    async animateTowerSlide(towerElement, fromDiscRects, fallbackFromRect, durationMs, staggerMs = Game.TOWER_DISC_STAGGER, options = {}, placeholder = null) {
        const toRect = towerElement.getBoundingClientRect();
        const discParts = Game.getTowerDiscParts(towerElement);
        const placeholderParts = placeholder ? Game.getTowerDiscParts(placeholder) : [];
        const slidingClones = discParts.map((_, discIndex) => this.createDiscSlidingClone(towerElement, discIndex)); //before the tower's own discs are hidden
        const startRects = slidingClones.map((slidingClone, discIndex) => fromDiscRects[discIndex] ? this.getCloneRectOverDisc(slidingClone, discIndex, fromDiscRects[discIndex]) : fallbackFromRect);
        discParts.forEach(part => part.forEach(element => element.style.visibility = 'hidden'));
        await Promise.all(slidingClones.map(async (slidingClone, discIndex) => {
            await this.moveSlidingClone(slidingClone, startRects[discIndex], toRect, durationMs, { ...options, delayMs: (options.delayMs ?? 0) + discIndex * staggerMs });
            discParts[discIndex].forEach(element => element.style.visibility = null);
            placeholderParts[discIndex]?.forEach(element => element.style.visibility = 'hidden');
        }));
    }
    //the other way round: a tower flies from its spot back to its owner's reserve stacks and disappears, one disc at a time: top
    //disc first, staggerMs apart, each a copy of the whole tower with every other disc hidden (the height number leaves with
    //the top one). Disc i lands exactly on landingDiscs[i] (PlayerHandler.addDiscs, hidden until then), which shows as it
    //lands, or with the whole copy over fallbackToRect if it has none. The copies show at the opacity the tower shows at,
    //which they don't inherit in <body>. The tower can be removed as soon as this is called
    async animateTowerSlideAway(towerElement, landingDiscs, fallbackToRect, durationMs, staggerMs = Game.TOWER_DISC_STAGGER, options = {}) {
        const fromRect = towerElement.getBoundingClientRect();
        const shownOpacity = Game.getShownOpacity(towerElement);
        const discCount = Game.getTowerDiscParts(towerElement).length;
        await Promise.all(Array.from({ length: discCount }, async (_, discIndex) => {
            const slidingClone = this.createDiscSlidingClone(towerElement, discIndex);
            if (shownOpacity < 1)
                slidingClone.style.opacity = shownOpacity.toString();
            const landingDisc = landingDiscs[discIndex] ?? null;
            const toRect = landingDisc ? this.getCloneRectOverDisc(slidingClone, discIndex, landingDisc.getBoundingClientRect()) : fallbackToRect;
            await this.moveSlidingClone(slidingClone, fromRect, toRect, durationMs, { ...options, delayMs: (options.delayMs ?? 0) + (discCount - 1 - discIndex) * staggerMs });
            if (landingDisc)
                landingDisc.style.visibility = null;
        }));
    }
    //the on-screen rect the whole copy (a fresh createDiscSlidingClone, untransformed) must cover for its disc discIndex to lie
    //exactly over discRect, a disc of the same art at any size (a reserve stack's): scaled by the discs' widths, aligned on their
    //top-left corners, so the top faces match. Read by getSlidingCloneTransform, which scales by height and centres by width
    getCloneRectOverDisc(slidingClone, discIndex, discRect) {
        const boxRect = slidingClone.getBoundingClientRect();
        const cloneDiscRect = Game.getTowerDiscParts(slidingClone)[discIndex][0].getBoundingClientRect();
        const scale = (cloneDiscRect.width > 0) ? discRect.width / cloneDiscRect.width : 1;
        return new DOMRect(discRect.left - (cloneDiscRect.left - boxRect.left) * scale, discRect.top - (cloneDiscRect.top - boxRect.top) * scale, boxRect.width * scale, boxRect.height * scale);
    }
    //a tower's discs, bottom first, each with what shows and goes with it: the top disc carries the height number
    static getTowerDiscParts(towerElement) {
        const discs = Array.from(towerElement.querySelectorAll(':scope > .tower-disc'));
        const heightNumber = towerElement.querySelector(':scope > .tower-height-number');
        return discs.map((disc, discIndex) => (discIndex === discs.length - 1 && heightNumber) ? [disc, heightNumber] : [disc]);
    }
    //a sliding copy of the whole tower showing only one of its discs (and the height number if it is the top one)
    createDiscSlidingClone(towerElement, discIndex) {
        const slidingClone = this.createSlidingClone(towerElement);
        Game.getTowerDiscParts(slidingClone).forEach((part, partIndex) => part.forEach(element => element.style.visibility = (partIndex === discIndex) ? null : 'hidden'));
        return slidingClone;
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
    //moves the copy from fromRect to toRect (both on screen), after options.delayMs at its start, then removes it
    async moveSlidingClone(slidingClone, fromRect, toRect, durationMs, options) {
        const { easing = Game.TOWER_SLIDE_EASING, delayMs = 0 } = options;
        const transformOnto = this.getSlidingCloneTransform(slidingClone);
        slidingClone.style.transform = transformOnto(fromRect);
        await this.bga.gameui.wait(20); //let the clone's start position paint before the transition kicks in
        slidingClone.style.transition = `transform ${durationMs}ms ${easing} ${delayMs}ms`;
        slidingClone.style.transform = transformOnto(toRect);
        await this.bga.gameui.wait(delayMs + durationMs);
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
    onScreenWidthChange() {
        this.boardHandler?.requestFit(); //batched with the resize and layout observers' fits: one per frame
    }
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
    //[BGA] the PASSED stamp shows only while exactly one player is passed: both passed means the game is over, and the
    //end-game display says so. Hidden on both boards once the game is over (live or after a reload)
    updatePassedStamps() {
        const players = Object.values(this.players);
        const passedCount = players.filter(player => player.isPassed()).length;
        const showStamp = passedCount === 1 && !this.isGameOver();
        players.forEach(player => player.showPassedStamp(showStamp && player.isPassed()));
    }
    getMyPlayerID() { return this.myPlayerID; }
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
    //a confirmed turn: spot by spot, the replaced tower flies back onto its owner's reserve stacks while the new tower's discs
    //leave the player's stacks for its spot (BoardHandler.applyPlacements); then the reserves are checked against the server's
    //count (rebuilt if they differ), the boards that got discs back bounce, the scores update and the board re-centres
    async notif_towersPlaced(args) {
        this.players[args.player_id]?.setPassed(false);
        await this.boardHandler.applyPlacements(args.player_id, args.placements);
        const playerIDsGivenBack = new Set(args.placements.filter(placement => placement.kind === 'replace' && placement.replaced_player_id !== null).map(placement => placement.replaced_player_id));
        for (let player_id in args.reserves)
            this.players[player_id]?.setReserve(args.reserves[player_id]);
        playerIDsGivenBack.forEach(playerID => this.players[playerID]?.bounceBoard());
        for (let player_id in args.scores)
            this.players[player_id]?.setScore(args.scores[player_id]);
        await this.boardHandler.recenter();
    }
    //[BGA] the automatic pass: the log row, the big PASSED banner flying onto the player board's stamp (the notification
    //lasts as long as it does, so a second pass or the game end waits for it), and the stamp. No banner with animations off
    //(instantaneous mode, fast replay, a hidden tab) or in a replay: the stamp just applies
    async notif_playerPassed(args) {
        const player = this.players[args.player_id];
        if (!player)
            return;
        player.setReserve(args.reserve);
        await this.showPass(player);
    }
    //a pass on a player board, for the notification and debug_passAnim alike: the big banner flying onto the board's stamp,
    //or, with animations off or in a replay, just the stamp
    async showPass(player) {
        if (this.bga.gameui.bgaAnimationsActive() && !this.isReplay())
            await player.animatePass(); //marks the player passed as it lands
        else
            player.setPassed(true);
    }
    //client-only console helpers, nothing reaches the server (on gameui in setup()): window[0].gameui.debug_passAnim(2).
    //`who` is a turn-order position (1 to 4, by player_no, the same for every viewer) or a player id. The pass plays
    //exactly as a real one, so with the other player already passed it is the game-ending pass (the banner fades out)
    async debug_passAnim(who) {
        const order = Object.keys(this.gamedatas.players).map(Number).sort((a, b) => Number(this.gamedatas.players[a].player_no) - Number(this.gamedatas.players[b].player_no));
        const value = Number(who);
        const playerID = (Number.isInteger(value) && value >= 1 && value <= 4) ? order[value - 1] : value;
        const player = this.players[playerID];
        if (!player) {
            const valid = order.map((id, index) => `${index + 1} or ${id} (${this.getPlayerName(id)})`).join(', ');
            console.warn(`debug_passAnim: no player for ${JSON.stringify(who)}. Use a position or a player id: ${valid}`);
            return;
        }
        await this.showPass(player);
        console.log(`debug_passAnim: done for ${playerID} (${this.getPlayerName(playerID)})`);
    }
    //hides every PASSED stamp (client only), so debug_passAnim can run again from a clean state
    debug_clearPassed() {
        Object.values(this.players).forEach(player => player.setPassed(false));
    }
    //client-only console helper: clicks a tower that answers with a warning (your own, or an enemy tower too high for the discs
    //left), as a player would (the first one, or the one at x y), so its shake and bubble play: window[0].gameui.debug_towerWarning()
    debug_towerWarning(x, y) {
        const selector = (x === undefined || y === undefined) ? '#nexo-board .warning-tower' : `#nexo-board .warning-tower[data-x="${x}"][data-y="${y}"]`;
        const tower = document.querySelector(selector);
        if (!tower) {
            console.warn('debug_towerWarning: no tower with a warning' + (x === undefined ? '' : ` at ${x} ${y}`) + ' (only while you draft your turn)');
            return;
        }
        tower.click();
        console.log(`debug_towerWarning: clicked ${tower.getAttribute('data-x')} ${tower.getAttribute('data-y')}`);
    }
    async notif_displayEndGameScoring(args) {
        this.endGameScoringHandler.displayEndGameScore(args.endGameScoring);
    }
}
//every board animation's timing, in one place to tune them together (BoardHandler reads them too)
Game.TOWER_SLIDE_DURATION = 520; //ms of a disc flying between a player board's reserve and its spot; a turn plays its spots one after the other
Game.TOWER_SPOT_DELAY_SHARE = 0.3; //share of a spot's flight time (TOWER_SLIDE_DURATION plus its disc staggers) before the next spot's discs leave; 1: the next spot waits until every disc has landed (until 2026-11-18), then 0.5, then 0.4
Game.CONFIRM_RING_STAGGER = 50; //ms between two segments of the confirm button's ring filling when it first shows (BoardHandler.createConfirmRing)
Game.TOWER_DISC_STAGGER = 50; //ms between two discs of the same tower leaving (bottom disc first onto the board, top disc first off it); a spot takes TOWER_SLIDE_DURATION plus this much per disc above the first
Game.TOWER_SLIDE_EASING = 'ease-in-out';
Game.BOARD_RECENTER_DURATION = 280; //ms of the board's contents sliding to stay centred (BoardHandler.centerContents; Yaxha's was 400ms)
Game.BOARD_RECENTER_EASING = 'ease-out';
//[BGA] the bubble over a tower a click can't draft on (BoardHandler.showTowerWarning); its shake is CSS only (Game.scss: $tower-shake-*)
Game.TOWER_MESSAGE_FADE_IN = 150;
Game.TOWER_MESSAGE_HOLD = 1800;
Game.TOWER_MESSAGE_FADE_OUT = 250;
Game.TOWER_MESSAGE_EDGE_MARGIN = 6; //screen px kept between the bubble and the board's edges
Game.BOARD_VIEWPORT_MARGIN = 10; //screen px from the board to the window's bottom (BoardHandler.fitToViewport); the status bar's gap is #nexo-board-container's padding
Game.MIN_BOARD_CELL_SIZE = 40; //px of a spot, however short the window
Game.FIT_ROOM_THRESHOLD = 4; //px the room for the board must change by before its spot size is computed again (BoardHandler.fitToViewport)
Game.FIT_GROW_BACK_WINDOW = 1000; //ms after a shrink during which the board doesn't grow straight back into the room it shrank from, unless the window is resized
//[BGA] a pass (PlayerHandler.animatePass): the big PASSED stamp pops in at the centre, holds, flies onto the player
//board's stamp, then settles there (or fades out when both players have passed). About 1.5s in all
Game.PASS_BANNER_POP_DURATION = 150;
Game.PASS_BANNER_HOLD = 600;
Game.PASS_BANNER_FLIGHT_DURATION = 450;
Game.PASS_BANNER_SETTLE_DURATION = 300; //the board's stamp fades in under the banner (its own 0.3s transition)

export { Game };
