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
import { PlaceTowers } from "./States/PlaceTowers";
import { GameEnd } from "./States/GameEnd";
import { PlayerHandler } from "./PlayerHandler";
import { BoardHandler } from "./BoardHandler";
import { BoardRules } from "./BoardRules";
import { LogMutationObserver } from "./LogMutationObserver";
import { TooltipHandler } from "./TooltipHandler";
import { EndGameScoringHandler } from "./EndGameScoringHandler";
import { PrefHandler } from "./PrefHandler";
import { BackgroundHandler } from "./BackgroundHandler";
import { ConfirmPopover } from "./ConfirmPopover";

//optional settings of Game.animateTowerSlide / animateTowerSlideAway
export type SlideOptions = {
    easing?: string; //CSS timing function, Game.TOWER_SLIDE_EASING by default
    delayMs?: number; //the copy waits this long at its start before it moves (a stagger)
};

export class Game {
    //every board animation's timing, in one place to tune them together (BoardHandler reads them too)
    public static readonly TOWER_SLIDE_DURATION = 520; //ms of a disc flying between a player board's reserve and its spot; a turn plays its spots one after the other
    public static readonly CONFIRM_RING_STAGGER = 50; //ms between two segments of the confirm button's ring filling when it first shows (BoardHandler.createConfirmRing)
    public static readonly TOWER_DISC_STAGGER = 50; //ms between two discs of the same tower leaving (bottom disc first onto the board, top disc first off it); a spot takes TOWER_SLIDE_DURATION plus this much per disc above the first
    public static readonly TOWER_SLIDE_EASING = 'ease-in-out';
    public static readonly BOARD_RECENTER_DURATION = 280; //ms of the board's contents sliding to stay centred (BoardHandler.centerContents; Yaxha's was 400ms)
    public static readonly BOARD_RECENTER_EASING = 'ease-out';
    public static readonly BOARD_VIEWPORT_MARGIN = 10; //screen px from the board to the window's bottom (BoardHandler.fitToViewport); the status bar's gap is #nexo-board-container's padding
    public static readonly MIN_BOARD_CELL_SIZE = 40; //px of a spot, however short the window
    //[BGA] a pass (PlayerHandler.animatePass): the big PASSED stamp pops in at the centre, holds, flies onto the player
    //board's stamp, then settles there (or fades out when both players have passed). About 1.5s in all
    public static readonly PASS_BANNER_POP_DURATION = 150;
    public static readonly PASS_BANNER_HOLD = 600;
    public static readonly PASS_BANNER_FLIGHT_DURATION = 450;
    public static readonly PASS_BANNER_SETTLE_DURATION = 300; //the board's stamp fades in under the banner (its own 0.3s transition)

    public bga: Bga<NexoPlayer, NexoGamedatas>;
    private gamedatas: NexoGamedatas;

    public placeTowers: PlaceTowers;
    public players: Record<number, PlayerHandler> = {};
    private myPlayerID: number;

    public boardRules: BoardRules;
    public boardHandler: BoardHandler;
    public logMutationObserver: LogMutationObserver;
    public tooltipHandler: TooltipHandler;
    public prefHandler: PrefHandler;
    public backgroundHandler: BackgroundHandler;
    public confirmPopover: ConfirmPopover;
    private endGameScoringHandler: EndGameScoringHandler;

    constructor(bga: Bga<NexoPlayer, NexoGamedatas>) {
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

    setup(gamedatas: NexoGamedatas) {
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
        for(let player_id in gamedatas.players) {
            const {reserve, passed} = this.gamedatas.players[player_id];
            this.players[player_id] = new PlayerHandler(this, parseInt(player_id), reserve, passed);
        }
        this.updatePassedStamps();

        this.boardHandler = new BoardHandler(this, gamedatas.towers);
        this.confirmPopover = new ConfirmPopover(this);
        this.logMutationObserver = new LogMutationObserver(this);
        this.tooltipHandler = new TooltipHandler(this);
        this.prefHandler = new PrefHandler(this, gamedatas.pref_names);
        this.bga.gameui.onScreenWidthChange = () => this.onScreenWidthChange();
        Object.assign(this.bga.gameui, { //client-only console helpers (debug_passAnim)
            debug_passAnim: (who: number | string) => this.debug_passAnim(who),
            debug_clearPassed: () => this.debug_clearPassed(),
        });

        if(gamedatas.hasOwnProperty('endGameScoring'))
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
    private bgaFormatText(log, args) {
        try {
            log = _(log);
            //no args.processed guard (Riviera's): when BGA formats the same args object a second time, a guarded pass returns the
            //plain *_LOG_STR fallback, a row with no log-class-tag that the log CSS hides (black replaying from the first move lost
            //red's first row). Each row is built from args alone, so building it again is harmless
            if (log && args) {
                // list of special keys we want to replace with images
                const keys = ['TOWERS_PLACED_LOG_STR', 'PASS_LOG_STR', 'GAME_END_LOG_STR'];
                for(let key of keys) {
                    if(key in args) {
                        if(key == 'TOWERS_PLACED_LOG_STR')
                            log = this.logMutationObserver.createLogTowersPlaced(args['player_id'], args['placements'], args['board_snapshot']).log_html;
                        else if(key == 'PASS_LOG_STR')
                            log = this.logMutationObserver.createLogPlayerPassed(args['player_id']).log_html;
                        else if(key == 'GAME_END_LOG_STR')
                            log = this.logMutationObserver.createLogGameEnd(args['winner_ids'], args['winning_score'], args['end_result'], args['loser_score'], args['endGameScoring']?.scores).log_html;
                    }
                }
            }
        } catch (e) {
            console.error(log,args,"Exception thrown", e.stack);
        }
        return { log, args };
    }
    public divYou(attributes = {}): string {
        let color = this.gamedatas.players[this.myPlayerID].color;
        let html = "<span style=\"font-weight:bold;color:#" + color + ";\" " + this.getAttributesHTML(attributes) + ">" + _("You") + "</span>";
        return html;
    }
    public divColoredPlayer(player_id, attributes = {}, detectYou = true): string {
        if(detectYou && parseInt(player_id) === this.myPlayerID)
            return this.divYou(attributes);

        player_id = player_id.toString();

        let color = this.gamedatas.players[player_id].color;
        let html = "<span style=\"color:#" + color + ";\" " + this.getAttributesHTML(attributes) + ">" + this.gamedatas.players[player_id].name + "</span>";
        return html;
    }
    private getAttributesHTML(attributes): string{ return Object.entries(attributes || {}).map(([key, value]) => `${key}="${value}"`).join(' '); }

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
    public async animateTowerSlide(towerElement: HTMLDivElement, fromDiscRects: DOMRect[], fallbackFromRect: DOMRect, durationMs: number, staggerMs: number = Game.TOWER_DISC_STAGGER, options: SlideOptions = {}, placeholder: HTMLDivElement | null = null): Promise<void> {
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
    public async animateTowerSlideAway(towerElement: HTMLDivElement, landingDiscs: (HTMLDivElement | null)[], fallbackToRect: DOMRect, durationMs: number, staggerMs: number = Game.TOWER_DISC_STAGGER, options: SlideOptions = {}): Promise<void> {
        const fromRect = towerElement.getBoundingClientRect();
        const shownOpacity = Game.getShownOpacity(towerElement);
        const discCount = Game.getTowerDiscParts(towerElement).length;

        await Promise.all(Array.from({ length: discCount }, async (_, discIndex) => {
            const slidingClone = this.createDiscSlidingClone(towerElement, discIndex);
            if(shownOpacity < 1)
                slidingClone.style.opacity = shownOpacity.toString();
            const landingDisc = landingDiscs[discIndex] ?? null;
            const toRect = landingDisc ? this.getCloneRectOverDisc(slidingClone, discIndex, landingDisc.getBoundingClientRect()) : fallbackToRect;
            await this.moveSlidingClone(slidingClone, fromRect, toRect, durationMs, { ...options, delayMs: (options.delayMs ?? 0) + (discCount - 1 - discIndex) * staggerMs });
            if(landingDisc)
                landingDisc.style.visibility = null;
        }));
    }

    //the on-screen rect the whole copy (a fresh createDiscSlidingClone, untransformed) must cover for its disc discIndex to lie
    //exactly over discRect, a disc of the same art at any size (a reserve stack's): scaled by the discs' widths, aligned on their
    //top-left corners, so the top faces match. Read by getSlidingCloneTransform, which scales by height and centres by width
    private getCloneRectOverDisc(slidingClone: HTMLDivElement, discIndex: number, discRect: DOMRect): DOMRect {
        const boxRect = slidingClone.getBoundingClientRect();
        const cloneDiscRect = Game.getTowerDiscParts(slidingClone)[discIndex][0].getBoundingClientRect();
        const scale = (cloneDiscRect.width > 0) ? discRect.width / cloneDiscRect.width : 1;
        return new DOMRect(discRect.left - (cloneDiscRect.left - boxRect.left) * scale, discRect.top - (cloneDiscRect.top - boxRect.top) * scale, boxRect.width * scale, boxRect.height * scale);
    }

    //a tower's discs, bottom first, each with what shows and goes with it: the top disc carries the height number
    private static getTowerDiscParts(towerElement: HTMLDivElement): HTMLElement[][] {
        const discs = Array.from(towerElement.querySelectorAll<HTMLElement>(':scope > .tower-disc'));
        const heightNumber = towerElement.querySelector<HTMLElement>(':scope > .tower-height-number');
        return discs.map((disc, discIndex) => (discIndex === discs.length - 1 && heightNumber) ? [disc, heightNumber] : [disc]);
    }

    //a sliding copy of the whole tower showing only one of its discs (and the height number if it is the top one)
    private createDiscSlidingClone(towerElement: HTMLDivElement, discIndex: number): HTMLDivElement {
        const slidingClone = this.createSlidingClone(towerElement);
        Game.getTowerDiscParts(slidingClone).forEach((part, partIndex) => part.forEach(element => element.style.visibility = (partIndex === discIndex) ? null : 'hidden'));
        return slidingClone;
    }

    //element's own opacity times its ancestors'
    private static getShownOpacity(element: HTMLElement): number {
        let opacity = 1;
        for(let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement)
            opacity *= parseFloat(getComputedStyle(node).opacity);
        return opacity;
    }

    public createSlidingClone(element: HTMLDivElement): HTMLDivElement {
        const slidingClone = element.cloneNode(true) as HTMLDivElement;
        slidingClone.removeAttribute('id');
        slidingClone.classList.add('sliding-clone');
        slidingClone.style.removeProperty('visibility'); //element may already wait hidden in its place
        document.body.appendChild(slidingClone);
        return slidingClone;
    }

    //moves the copy from fromRect to toRect (both on screen), after options.delayMs at its start, then removes it
    private async moveSlidingClone(slidingClone: HTMLDivElement, fromRect: DOMRect, toRect: DOMRect, durationMs: number, options: SlideOptions): Promise<void> {
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
    public getSlidingCloneTransform(slidingClone: HTMLDivElement): (rect: DOMRect) => string {
        const baseRect = slidingClone.getBoundingClientRect(); //on screen, untransformed at the viewport's top-left corner
        const cssWidth = parseFloat(getComputedStyle(slidingClone).width); //unrounded, unlike offsetWidth
        const zoom = (cssWidth > 0) ? baseRect.width / cssWidth : 1;

        return (rect: DOMRect): string => {
            const scale = (baseRect.height > 0) ? rect.height / baseRect.height : 1;
            const left = rect.left + (rect.width - baseRect.width * scale) / 2;
            return `translate(${(left - baseRect.left) / zoom}px, ${(rect.top - baseRect.top) / zoom}px) scale(${scale})`;
        };
    }
    public onScreenWidthChange(): void { //BGA's resize hook (window resize, including orientation changes, and BGA's own relayout); also fires once at load
        this.boardHandler?.fitToViewport();
    }
    public isReplay(): boolean { return typeof g_replayFrom != 'undefined' || g_archive_mode; } //"replay from this move" in an ongoing game, or an archived game
    public isInterfaceLocked(): boolean { return document.body.classList.contains('lockedInterface'); } //gameui.isInterfaceLocked() is not in this framework version
    public getGameStateName(): string { return this.gamedatas.gamestate.name; }

    public getRules(): NexoRulesData { return this.gamedatas.rules; }
    public getPlayerColor(playerID: number): string { return this.gamedatas.players[playerID]?.color; }
    public getPlayerName(playerID: number): string { return this.gamedatas.players[playerID]?.name ?? ''; }
    //the disc color of a player's towers, from their BGA color (material.inc.php's DISC_COLOR_BY_PLAYER_COLOR)
    public getDiscColor(playerID: number): DiscColor {
        const playerColor = this.getPlayerColor(playerID) ?? '';
        return this.gamedatas.discColorByPlayerColor?.[playerColor] ?? (playerColor === '000000' ? 'black' : 'red');
    }
    //BGA's final state, or the largest groups already shown (they arrive in EndScore, just before gameEnd)
    public isGameOver(): boolean { return this.getGameStateName() === 'gameEnd' || !!this.endGameScoringHandler?.isDisplayed(); }
    //[BGA] the PASSED stamp shows only while exactly one player is passed: both passed means the game is over, and the
    //end-game display says so. Hidden on both boards once the game is over (live or after a reload)
    public updatePassedStamps(): void {
        const players = Object.values(this.players);
        const passedCount = players.filter(player => player.isPassed()).length;
        const showStamp = passedCount === 1 && !this.isGameOver();
        players.forEach(player => player.showPassedStamp(showStamp && player.isPassed()));
    }
    public getMyPlayerID(): number{ return this.myPlayerID; }

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
    public async notif_towersPlaced(args: TowersPlacedArgs) {
        this.players[args.player_id]?.setPassed(false);

        await this.boardHandler.applyPlacements(args.player_id, args.placements);

        const playerIDsGivenBack = new Set(args.placements.filter(placement => placement.kind === 'replace' && placement.replaced_player_id !== null).map(placement => placement.replaced_player_id));
        for(let player_id in args.reserves)
            this.players[player_id]?.setReserve(args.reserves[player_id]);
        playerIDsGivenBack.forEach(playerID => this.players[playerID]?.bounceBoard());

        for(let player_id in args.scores)
            this.players[player_id]?.setScore(args.scores[player_id]);

        await this.boardHandler.recenter();
    }

    //[BGA] the automatic pass: the log row, the big PASSED banner flying onto the player board's stamp (the notification
    //lasts as long as it does, so a second pass or the game end waits for it), and the stamp. No banner with animations off
    //(instantaneous mode, fast replay, a hidden tab) or in a replay: the stamp just applies
    public async notif_playerPassed(args: PlayerPassedArgs) {
        const player = this.players[args.player_id];
        if(!player)
            return;

        player.setReserve(args.reserve);
        await this.showPass(player);
    }

    //a pass on a player board, for the notification and debug_passAnim alike: the big banner flying onto the board's stamp,
    //or, with animations off or in a replay, just the stamp
    private async showPass(player: PlayerHandler): Promise<void> {
        if(this.bga.gameui.bgaAnimationsActive() && !this.isReplay())
            await player.animatePass(); //marks the player passed as it lands
        else player.setPassed(true);
    }

    //client-only console helpers, nothing reaches the server (on gameui in setup()): window[0].gameui.debug_passAnim(2).
    //`who` is a turn-order position (1 to 4, by player_no, the same for every viewer) or a player id. The pass plays
    //exactly as a real one, so with the other player already passed it is the game-ending pass (the banner fades out)
    public async debug_passAnim(who: number | string): Promise<void> {
        const order = Object.keys(this.gamedatas.players).map(Number).sort((a, b) => Number(this.gamedatas.players[a].player_no) - Number(this.gamedatas.players[b].player_no));
        const value = Number(who);
        const playerID = (Number.isInteger(value) && value >= 1 && value <= 4) ? order[value - 1] : value;
        const player = this.players[playerID];

        if(!player){
            const valid = order.map((id, index) => `${index + 1} or ${id} (${this.getPlayerName(id)})`).join(', ');
            console.warn(`debug_passAnim: no player for ${JSON.stringify(who)}. Use a position or a player id: ${valid}`);
            return;
        }

        await this.showPass(player);
        console.log(`debug_passAnim: done for ${playerID} (${this.getPlayerName(playerID)})`);
    }

    //hides every PASSED stamp (client only), so debug_passAnim can run again from a clean state
    public debug_clearPassed(): void {
        Object.values(this.players).forEach(player => player.setPassed(false));
    }

    private async notif_displayEndGameScoring(args: DisplayEndGameScoringArgs) {
        this.endGameScoringHandler.displayEndGameScore(args.endGameScoring);
    }
}
