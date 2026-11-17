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
import { HeightMenu } from "./HeightMenu";
import { PrefHandler } from "./PrefHandler";

//optional settings of Game.animateSlide / animateSlideAway
export type SlideOptions = {
    easing?: string; //CSS timing function, Game.TOWER_SLIDE_EASING by default
    keepSize?: boolean; //the copy keeps the element's size, centered on the other end, instead of changing size on the way
    delayMs?: number; //the copy waits this long at its start before it moves (a stagger)
    holdMs?: number; //animateSlideAway: the copy stays fully shown this long once it has arrived, before it fades or goes
    fadeOutMs?: number; //animateSlideAway: the copy fades out for this long once it has arrived (and held)
};

export class Game {
    //every board animation's timing, in one place to tune them together (BoardHandler reads them too)
    public static readonly TOWER_SLIDE_DURATION = 520; //ms of a tower flying between a player board's reserve and its spot
    public static readonly TOWER_SLIDE_STAGGER = 110; //ms between two new towers of the same turn leaving the reserve
    public static readonly TOWER_SLIDE_EASING = 'ease-in-out';
    public static readonly BOARD_RECENTER_DURATION = 400; //ms of the board's contents sliding to stay centred (BoardHandler.centerContents, Yaxha's 400ms)
    public static readonly BOARD_RECENTER_EASING = 'ease-in-out';
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
    public heightMenu: HeightMenu;
    public logMutationObserver: LogMutationObserver;
    public tooltipHandler: TooltipHandler;
    public prefHandler: PrefHandler;
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

        this.myPlayerID = this.bga.players.getCurrentPlayerId();
        this.boardRules = new BoardRules(gamedatas.rules);
        this.endGameScoringHandler = new EndGameScoringHandler(this);

        // Setting up player boards
        for(let player_id in gamedatas.players) {
            const {name, color, player_no, reserve, passed, score} = this.gamedatas.players[player_id];
            this.players[player_id] = new PlayerHandler(this, parseInt(player_id), name, color, player_no, reserve, passed, Number(score));
        }
        this.updatePassedStamps();

        this.boardHandler = new BoardHandler(this, gamedatas.towers);
        this.heightMenu = new HeightMenu(this);
        this.logMutationObserver = new LogMutationObserver(this);
        this.tooltipHandler = new TooltipHandler(this);
        this.prefHandler = new PrefHandler(this, gamedatas.pref_names);
        this.bga.gameui.onScreenWidthChange = () => this.onScreenWidthChange();

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
            if (log && args && !args.processed) {
                args.processed = true;

                // list of special keys we want to replace with images
                const keys = ['TOWERS_PLACED_LOG_STR', 'PASS_LOG_STR', 'GAME_END_LOG_STR'];
                for(let key of keys) {
                    if(key in args) {
                        if(key == 'TOWERS_PLACED_LOG_STR')
                            log = this.logMutationObserver.createLogTowersPlaced(args['player_id'], args['placements']).log_html;
                        else if(key == 'PASS_LOG_STR')
                            log = this.logMutationObserver.createLogPlayerPassed(args['player_id']).log_html;
                        else if(key == 'GAME_END_LOG_STR')
                            log = this.logMutationObserver.createLogGameEnd(args['winner_ids'], args['winning_score']).log_html;
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
        attributes['player-color'] = color;
        let html = "<span style=\"font-weight:bold;color:#" + color + ";\" " + this.getAttributesHTML(attributes) + ">" + _("You") + "</span>";
        return html;
    }
    public divColoredPlayer(player_id, attributes = {}, detectYou = true): string {
        if(detectYou && parseInt(player_id) === this.myPlayerID)
            return this.divYou(attributes);

        player_id = player_id.toString();

        let color = this.gamedatas.players[player_id].color;
        attributes['player-color'] = color;
        let html = "<span style=\"color:#" + color + ";\" " + this.getAttributesHTML(attributes) + ">" + this.gamedatas.players[player_id].name + "</span>";
        return html;
    }
    private getAttributesHTML(attributes): string{ return Object.entries(attributes || {}).map(([key, value]) => `${key}="${value}"`).join(' '); }

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
    public async animateSlide(element: HTMLDivElement, from: HTMLDivElement | DOMRect, to: HTMLDivElement | null, durationMs: number, options: SlideOptions = {}): Promise<void> {
        const fromRect = (from instanceof DOMRect) ? from : from.getBoundingClientRect(); //before element moves: from may be element itself
        const slidingClone = this.createSlidingClone(element);

        element.style.visibility = 'hidden';
        if(to)
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
    public async animateSlideAway(element: HTMLDivElement, toRect: DOMRect, durationMs: number, options: SlideOptions = {}): Promise<void> {
        const fromRect = element.getBoundingClientRect();
        const shownOpacity = Game.getShownOpacity(element);
        const slidingClone = this.createSlidingClone(element);
        if(shownOpacity < 1)
            slidingClone.style.opacity = shownOpacity.toString();
        const endRect = options.keepSize ? Game.getCenteredRect(toRect, fromRect.width, fromRect.height) : toRect;

        await this.moveSlidingClone(slidingClone, fromRect, endRect, durationMs, options);
    }

    //a width x height rect on screen, centered on rect
    private static getCenteredRect(rect: DOMRect, width: number, height: number): DOMRect {
        return new DOMRect(rect.left + (rect.width - width) / 2, rect.top + (rect.height - height) / 2, width, height);
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

    //moves the copy from fromRect to toRect (both on screen), after options.delayMs at its start, fades it out there if
    //options.fadeOutMs (after options.holdMs of stillness), then removes it
    private async moveSlidingClone(slidingClone: HTMLDivElement, fromRect: DOMRect, toRect: DOMRect, durationMs: number, options: SlideOptions): Promise<void> {
        const { easing = Game.TOWER_SLIDE_EASING, delayMs = 0, holdMs = 0, fadeOutMs = 0 } = options;
        const transformOnto = this.getSlidingCloneTransform(slidingClone);

        slidingClone.style.transform = transformOnto(fromRect);

        await this.bga.gameui.wait(20); //let the clone's start position paint before the transition kicks in

        slidingClone.style.transition = `transform ${durationMs}ms ${easing} ${delayMs}ms`;
        slidingClone.style.transform = transformOnto(toRect);

        await this.bga.gameui.wait(delayMs + durationMs);

        if(holdMs > 0)
            await this.bga.gameui.wait(holdMs);

        if(fadeOutMs > 0){
            slidingClone.style.transition = `opacity ${fadeOutMs}ms ease`;
            slidingClone.style.opacity = '0';
            await this.bga.gameui.wait(fadeOutMs);
        }

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
    public rgbToHex(rgb: string): string { // Extract the numeric values using a regex
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match){
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
    public onScreenWidthChange(): void { //BGA's resize hook (window resize, including orientation changes, and BGA's own relayout); also fires once at load
        this.boardHandler?.fitToViewport();
        this.heightMenu?.reposition();
    }
    public isDesktop(): boolean { return document.body.classList.contains('desktop_version'); }
    public isMobile(): boolean { return document.body.classList.contains('mobile_version'); }
    public isTouchOrMobile(): boolean { return this.isMobile() || window.matchMedia('(hover: none)').matches; } //BGA's mobile layout, or a device that can't hover (a tablet in the desktop layout). Not BGA's touch-device class, which a touch laptop with a mouse has too
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
    public getPlayerOrder(): number[]{ return this.gamedatas.playerorder; } //turn order, starting with myself

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
    public async notif_towersPlaced(args: TowersPlacedArgs) {
        const mover = this.players[args.player_id];
        mover?.setReserve(args.reserves[args.player_id] ?? mover.getReserve());
        mover?.setPassed(false);

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
        if(this.bga.gameui.bgaAnimationsActive() && !this.isReplay())
            await player.animatePass(); //marks the player passed as it lands
        else player.setPassed(true);
    }

    private async notif_displayEndGameScoring(args: DisplayEndGameScoringArgs) {
        this.endGameScoringHandler.displayEndGameScore(args.endGameScoring);
    }
}
