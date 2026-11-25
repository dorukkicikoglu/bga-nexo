/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * LogHighlightHandler.ts
 */
import { Game } from "./Game";

/**
 * [BGA] A log row's towers jump on the board (BoardHandler.jumpTowers): every turn row carries the spots it touched as
 * data-log-spots (LogMutationObserver), in the board's own x,y, so they still point at the right towers however the grid grew
 * or the board slid since. A mouse resting on a row for LOG_JUMP_HOVER_DELAY (cancelled if it leaves sooner, so skimming the
 * log jumps nothing) makes them jump LOG_JUMP_HOVER_COUNT times, once per time the mouse enters the row. A tap (touch or pen:
 * the pointerdown's pointerType, so a hybrid device's mouse still hovers and its finger still taps, never both for one
 * gesture) first collapses BGA's mobile table log (a chat window in #chatbar) if the row is in it, waits until it has closed,
 * then makes them jump LOG_JUMP_TAP_COUNT times. One set of listeners on the document for every log (the desktop log, the
 * mobile table log, the replay log): rows added later, after a reload too, need nothing of their own.
 * [BGA] Rows look tappable on touch devices (Game.scss: the pressed row): an empty touchstart listener lets iOS apply :active.
 * On touch devices ((hover: none)) the mobile table log also shows a banner at its top, "Tap a move to see it on the board"
 * (.nexo-log-tap-hint), its pointing hand tapping every few seconds until the player taps any log row once: then the hand is
 * still for good on that device (localStorage), the banner stays
 */
export class LogHighlightHandler {
    private hoveredRow: HTMLElement | null = null; //the row the mouse is over
    private hoverTimer: number = 0; //the hover's delay before the jump, 0 when none
    private tapID: number = 0; //the latest tap: an earlier one still waiting for the log to close jumps nothing
    private lastPointerType: string = 'mouse'; //the last pointerdown's: a click after a touch or a pen press is a tap
    private warnedLogClose: boolean = false;
    private tapHintAnimated: boolean = !LogHighlightHandler.isTapHintSeen(); //the banner's hand taps until a log row has been tapped once
    private static readonly TAP_HINT_STORAGE_KEY = 'nexo.logTapHintSeen';

    constructor(private game: Game) {
        document.addEventListener('pointerdown', (event: PointerEvent) => { this.lastPointerType = event.pointerType || 'mouse'; }, { capture: true, passive: true });
        document.addEventListener('pointerover', (event: PointerEvent) => this.onPointerOver(event), { passive: true });
        document.addEventListener('pointerout', (event: PointerEvent) => this.onPointerOut(event), { passive: true });
        document.addEventListener('click', (event: MouseEvent) => this.onClick(event), { capture: true }); //capture: before anything of BGA's in the log may stop it
        document.addEventListener('touchstart', () => {}, { passive: true }); //iOS applies :active (the pressed row) only with a touch listener
        this.setupTapHint();
    }

    //[BGA] on a touch device: the banner at the top of every mobile table log, put back whenever BGA builds or refills that window
    //(a MutationObserver on #chatbar)
    private setupTapHint(): void {
        const chatBar = document.getElementById('chatbar');
        if(!chatBar || !window.matchMedia('(hover: none)').matches)
            return;
        new MutationObserver(() => this.placeTapHints()).observe(chatBar, { childList: true, subtree: true });
        this.placeTapHints();
    }

    //one banner per mobile table log, its first child: under the window's title, above the rows and any date header. A sticky
    //line, so it stays under the title while the log scrolls, and adds nothing around the window (BGA sizes it). Its hand taps
    //(.animated-tap-hint) until a log row has been tapped once
    private placeTapHints(): void {
        for(const zone of Array.from(document.querySelectorAll<HTMLElement>('#chatbar [id^="chatwindowlogs_zone_tablelog_"]'))){
            let hint = zone.querySelector<HTMLElement>(':scope > .nexo-log-tap-hint');
            if(!hint){
                hint = document.createElement('div');
                hint.className = 'nexo-log-tap-hint' + (this.tapHintAnimated ? ' animated-tap-hint' : '');
                hint.innerHTML = `<span class="nexo-log-tap-hint-hand"><i class="fa fa-hand-pointer-o" aria-hidden="true"></i></span><span class="nexo-log-tap-hint-text">${_('Tap a move to see it on the board')}</span>`;
            }
            if(zone.firstElementChild !== hint)
                zone.prepend(hint);
        }
    }

    //the player tapped a log row: the banner's hand stops tapping, for good on this device; the banner stays
    private markTapHintSeen(): void {
        this.tapHintAnimated = false;
        document.querySelectorAll('.nexo-log-tap-hint.animated-tap-hint').forEach(hint => hint.classList.remove('animated-tap-hint'));
        try {
            window.localStorage.setItem(LogHighlightHandler.TAP_HINT_STORAGE_KEY, '1');
        } catch(error) {} //storage off (private browsing): the hand only stops for this page
    }

    private static isTapHintSeen(): boolean {
        try {
            return window.localStorage.getItem(LogHighlightHandler.TAP_HINT_STORAGE_KEY) === '1';
        } catch(error) {
            return false;
        }
    }

    //the mouse entering a row: its towers jump if it is still there after the delay. Moving within the row changes nothing
    private onPointerOver(event: PointerEvent): void {
        if(event.pointerType !== 'mouse')
            return; //a finger or a pen fires it too, on the tap itself: onClick handles those
        const row = LogHighlightHandler.getLogRow(event.target);
        if(row === this.hoveredRow)
            return;

        this.hoveredRow = row;
        this.stopHoverTimer();
        const spots = row ? LogHighlightHandler.getRowSpots(row) : [];
        if(spots.length === 0)
            return;

        this.hoverTimer = window.setTimeout(() => {
            this.hoverTimer = 0;
            if(this.hoveredRow === row)
                this.game.boardHandler.jumpTowers(spots, Game.LOG_JUMP_HOVER_COUNT);
        }, Game.LOG_JUMP_HOVER_DELAY);
    }

    //the mouse leaving the window (no element under it any more): pointerover never fires for that
    private onPointerOut(event: PointerEvent): void {
        if(event.pointerType !== 'mouse' || event.relatedTarget || !this.hoveredRow)
            return;
        this.hoveredRow = null;
        this.stopHoverTimer();
    }

    private stopHoverTimer(): void {
        if(this.hoverTimer)
            window.clearTimeout(this.hoverTimer);
        this.hoverTimer = 0;
    }

    //a tap on a row with spots: the mobile table log closes first, then its towers jump
    private async onClick(event: MouseEvent): Promise<void> {
        if(this.lastPointerType === 'mouse')
            return; //a mouse makes them jump on hover
        const row = LogHighlightHandler.getLogRow(event.target);
        if(row && this.tapHintAnimated)
            this.markTapHintSeen(); //any log row, even one with nothing to show
        const spots = row ? LogHighlightHandler.getRowSpots(row) : [];
        if(spots.length === 0)
            return;

        this.hoveredRow = null;
        this.stopHoverTimer();
        const tapID = ++this.tapID;
        const logWindow = this.closeMobileLog(row);
        if(logWindow)
            await this.waitForLogClosed(logWindow);
        if(tapID === this.tapID)
            this.game.boardHandler.jumpTowers(spots, Game.LOG_JUMP_TAP_COUNT);
    }

    /**
     * On a phone, BGA shows the table log in a chat window of #chatbar (its rows in #chatwindowlogs_zone_<window id>), opened
     * from its floating button; a tapped row collapses that window the way its own control does, so the same button opens it
     * again: BGA's collapseChatWindow(window id) when gameui has it, else a click on the window's own collapse control. Neither
     * is in bga-framework.d.ts, so both are looked up first and nothing happens without them (a warning, once, in the console).
     * Returns the window's element in #chatbar (to wait for its closing), null when nothing was collapsed: the desktop log
     * (#logs) and the replay log never collapse
     */
    private closeMobileLog(row: HTMLElement): HTMLElement | null {
        const zone = row.closest<HTMLElement>('[id^="chatwindowlogs_zone_"]');
        const chatBar = zone?.closest<HTMLElement>('#chatbar');
        if(!zone || !chatBar)
            return null;

        let logWindow: HTMLElement = zone;
        while(logWindow.parentElement && logWindow.parentElement !== chatBar)
            logWindow = logWindow.parentElement;

        const windowID = zone.id.substring('chatwindowlogs_zone_'.length);
        try {
            const gameui = this.game.bga.gameui as unknown as Record<string, unknown>;
            if(typeof gameui.collapseChatWindow === 'function'){
                (gameui.collapseChatWindow as (id: string) => void).call(gameui, windowID);
                return logWindow;
            }
            const collapseControl = document.getElementById('chatwindowcollapse_' + windowID);
            if(collapseControl){
                collapseControl.click();
                return logWindow;
            }
        } catch(error) {
            console.error('LogHighlightHandler: could not collapse the table log', error);
            return null;
        }

        if(!this.warnedLogClose){
            this.warnedLogClose = true;
            const ancestors: string[] = [];
            for(let node: HTMLElement | null = zone; node && node !== chatBar; node = node.parentElement)
                ancestors.push(node.id ? `#${node.id}` : `.${Array.from(node.classList).join('.')}`);
            console.warn(`LogHighlightHandler: no way found to collapse the table log window "${windowID}" (no gameui.collapseChatWindow, no #chatwindowcollapse_${windowID}). Its ancestors: ${ancestors.join(' < ')}`);
        }
        return null;
    }

    /**
     * Resolves once the collapsed log window has finished closing, so the jump plays on a visible board: every CSS animation or
     * transition running in #chatbar has finished (the Web Animations API sees both), then the window's box and opacity have held
     * still for LOG_CLOSE_STABLE_FRAMES frames (a close driven by script, which no CSS animation shows). Never longer than
     * LOG_CLOSE_MAX_WAIT
     */
    private async waitForLogClosed(logWindow: HTMLElement): Promise<void> {
        const deadline = performance.now() + Game.LOG_CLOSE_MAX_WAIT;
        const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
        await nextFrame(); //the collapse's styles apply, its transitions start

        const chatBar = document.getElementById('chatbar');
        const running = document.getAnimations().filter(animation => {
            const target = (animation.effect as KeyframeEffect | null)?.target;
            //not a log row's own (the pressed row springing back: Game.scss), which has nothing to do with the window closing
            return animation.playState === 'running' && target instanceof Element && !!chatBar?.contains(target) && !target.closest('.a-game-log');
        });
        if(running.length > 0)
            await Promise.race([Promise.all(running.map(animation => animation.finished.catch(() => undefined))), this.game.bga.gameui.wait(Math.max(0, deadline - performance.now()))]);

        let lastLook = '';
        let stableFrames = 0;
        while(stableFrames < LogHighlightHandler.LOG_CLOSE_STABLE_FRAMES && performance.now() < deadline){
            const rect = logWindow.getBoundingClientRect();
            const look = `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)},${getComputedStyle(logWindow).opacity}`;
            stableFrames = (look === lastLook) ? stableFrames + 1 : 0;
            lastLook = look;
            await nextFrame();
        }
    }
    private static readonly LOG_CLOSE_STABLE_FRAMES = 3;

    //the game log row (one of ours: .a-game-log, LogMutationObserver) the event happened in, null outside every log row
    private static getLogRow(target: EventTarget | null): HTMLElement | null {
        return (target instanceof Element) ? target.closest<HTMLElement>('.a-game-log') : null;
    }

    //the spots a row touched, from its data-log-spots ("x,y;x,y"); none for a row without (a pass, the game end) or a value
    //that doesn't read as whole numbers
    private static getRowSpots(row: HTMLElement): NexoSpot[] {
        const value = row.querySelector('[data-log-spots]')?.getAttribute('data-log-spots') ?? '';
        const spots: NexoSpot[] = [];
        for(const spotText of value.split(';')){
            const match = spotText.trim().match(/^(-?\d+),(-?\d+)$/);
            if(match)
                spots.push({ x: parseInt(match[1]), y: parseInt(match[2]) });
        }
        return spots;
    }
}
