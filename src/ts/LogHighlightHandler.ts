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
 * [BGA] A log row's spots on the board: every row that touched the board (a tower placed) carries them as data-log-spots
 * (LogMutationObserver), in the board's own x,y, so they still point at the right spots however the grid grew or the board
 * slid since. A mouse over a row rings them (BoardHandler.showLogHighlight) until it leaves the row. A tap (touch or pen: the
 * pointerdown's pointerType, so a hybrid device's mouse still hovers and its finger still taps, never both for one gesture)
 * rings them for LOG_HIGHLIGHT_TOUCH_HOLD, then they fade; another tap, or any press on the board, clears them at once. A tap
 * in BGA's mobile table log (a chat window in #chatbar) also collapses that window, so the board shows. One set of listeners
 * on the document for every log (the desktop log, the mobile table log, the replay log): rows added later, after a reload
 * too, need nothing of their own
 */
export class LogHighlightHandler {
    private hoveredRow: HTMLElement | null = null; //the row the mouse is over
    private tapTimer: number = 0; //the tapped row's hold before its highlight fades, 0 when none
    private lastPointerType: string = 'mouse'; //the last pointerdown's: a click after a touch or a pen press is a tap
    private warnedLogClose: boolean = false;

    constructor(private game: Game) {
        document.addEventListener('pointerdown', (event: PointerEvent) => { this.lastPointerType = event.pointerType || 'mouse'; }, { capture: true, passive: true });
        document.addEventListener('pointerover', (event: PointerEvent) => this.onPointerOver(event), { passive: true });
        document.addEventListener('pointerout', (event: PointerEvent) => this.onPointerOut(event), { passive: true });
        document.addEventListener('click', (event: MouseEvent) => this.onClick(event), { capture: true }); //capture: before anything of BGA's in the log may stop it
        this.game.boardHandler.getBoardElement().addEventListener('pointerdown', () => this.clear(), { passive: true });
    }

    //a mouse moving onto a row rings its spots, onto anything else (another row, a row with no spots, the page) clears them
    private onPointerOver(event: PointerEvent): void {
        if(event.pointerType !== 'mouse')
            return; //a finger or a pen fires it too, on the tap itself: onClick handles those
        const row = LogHighlightHandler.getLogRow(event.target);
        if(row === this.hoveredRow)
            return;

        this.hoveredRow = row;
        this.stopTapTimer();
        if(row)
            this.game.boardHandler.showLogHighlight(LogHighlightHandler.getRowSpots(row));
        else this.game.boardHandler.clearLogHighlight(false);
    }

    //the mouse leaving the window (no element under it any more): pointerover never fires for that
    private onPointerOut(event: PointerEvent): void {
        if(event.pointerType !== 'mouse' || event.relatedTarget || !this.hoveredRow)
            return;
        this.hoveredRow = null;
        this.game.boardHandler.clearLogHighlight(false);
    }

    //a tap on a row with spots: rings them for a while, and collapses the mobile table log over the board
    private onClick(event: MouseEvent): void {
        if(this.lastPointerType === 'mouse')
            return; //a mouse already rings them on hover
        const row = LogHighlightHandler.getLogRow(event.target);
        const spots = row ? LogHighlightHandler.getRowSpots(row) : [];
        if(spots.length === 0)
            return;

        this.hoveredRow = null;
        this.stopTapTimer();
        this.game.boardHandler.showLogHighlight(spots);
        this.tapTimer = window.setTimeout(() => {
            this.tapTimer = 0;
            this.game.boardHandler.clearLogHighlight(true);
        }, Game.LOG_HIGHLIGHT_TOUCH_HOLD);
        this.closeMobileLog(row);
    }

    //any press on the board: the highlight goes at once
    private clear(): void {
        this.hoveredRow = null;
        this.stopTapTimer();
        this.game.boardHandler.clearLogHighlight(false);
    }

    private stopTapTimer(): void {
        if(this.tapTimer)
            window.clearTimeout(this.tapTimer);
        this.tapTimer = 0;
    }

    /**
     * On a phone, BGA shows the table log in a chat window of #chatbar (its rows in #chatwindowlogs_zone_<window id>), opened
     * from its floating button; a tapped row collapses that window the way its own control does, so the same button opens it
     * again: BGA's collapseChatWindow(window id) when gameui has it, else a click on the window's own collapse control. Neither
     * is in bga-framework.d.ts, so both are looked up first and nothing happens without them (a warning, once, in the console).
     * The desktop log (#logs) and the replay log never collapse
     */
    private closeMobileLog(row: HTMLElement): void {
        const zone = row.closest('[id^="chatwindowlogs_zone_"]');
        if(!zone || !zone.closest('#chatbar'))
            return;

        const windowID = zone.id.substring('chatwindowlogs_zone_'.length);
        try {
            const gameui = this.game.bga.gameui as unknown as Record<string, unknown>;
            if(typeof gameui.collapseChatWindow === 'function'){
                (gameui.collapseChatWindow as (id: string) => void).call(gameui, windowID);
                return;
            }
            const collapseControl = document.getElementById('chatwindowcollapse_' + windowID);
            if(collapseControl){
                collapseControl.click();
                return;
            }
        } catch(error) {
            console.error('LogHighlightHandler: could not collapse the table log', error);
            return;
        }

        if(!this.warnedLogClose){
            this.warnedLogClose = true;
            const ancestors: string[] = [];
            for(let node: HTMLElement | null = zone as HTMLElement; node && node.id !== 'chatbar'; node = node.parentElement)
                ancestors.push(node.id ? `#${node.id}` : `.${Array.from(node.classList).join('.')}`);
            console.warn(`LogHighlightHandler: no way found to collapse the table log window "${windowID}" (no gameui.collapseChatWindow, no #chatwindowcollapse_${windowID}). Its ancestors: ${ancestors.join(' < ')}`);
        }
    }

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
