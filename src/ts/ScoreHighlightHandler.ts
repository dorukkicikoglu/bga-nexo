/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * ScoreHighlightHandler.ts
 */
import { Game } from "./Game";

/**
 * [BGA] The scoreboard at the board's top centre shows what it counts, on the saved board: both players' largest areas stay as
 * they are (one each: the top-left of areas tied for largest) and every other tower dims (BoardHandler.showScoringTowers,
 * Game.scss: .nexo-score-highlight). With towers drafted, the draft steps aside while it shows (PlaceTowers.getSavedBoardSpots,
 * html.nexo-saved-board-view: the board, the status bar's icons and the scoreboard as if nothing were drafted) and comes back
 * exactly as it was when it clears; "Confirm anyway?" closes. The whole scoreboard does the same, wherever it is pointed or tapped.
 * A mouse or a pen (pointerType not 'touch') shows it as it enters the scoreboard (pointerenter) and clears it as it leaves
 * (pointerleave), so a click on the board always finds the draft back.
 * A touch never hovers: a tap (a click after a touch pointerdown, like LogHighlightHandler's) toggles it. A touch starting anywhere outside the scoreboard clears it at once: on the board's column
 * (#nexo-board-column: the board, the avatars and reserves on its edge) its click is swallowed, since the board on screen was
 * not the draft; anywhere else (the log) the tap goes through.
 * A confirmed turn clears it as its towers start to fly (BoardHandler.applyPlacements) and nothing shows until they have landed;
 * entering or leaving PlaceTowers clears it too (a new turn, a turn ended by its timer or a zombie), the draft back first.
 * Off for good once the game is over (disable: from EndGameScoringHandler, live or after a reload, and GameEnd): the end-game
 * display already shows every largest group, and nothing here touches its classes
 */
export class ScoreHighlightHandler {
    private scoreboardElement: HTMLElement | null;
    private listeners: AbortController | null = null; //every listener of this handler, all removed at once by disable
    private shown: boolean = false;
    private lastPointerType: string = 'mouse'; //the last pointerdown's: a click after a touch is a tap
    private swallowBoardClick: boolean = false; //a touch on the board's column cleared the highlight: its click does nothing else

    constructor(private game: Game) {
        this.scoreboardElement = document.querySelector('#nexo-top-bar .top-bar-scoreboard');
        if(!this.scoreboardElement)
            return;

        this.listeners = new AbortController();
        const signal = this.listeners.signal;
        this.scoreboardElement.addEventListener('pointerenter', (event: PointerEvent) => this.onPointerEnter(event), { signal, passive: true });
        this.scoreboardElement.addEventListener('pointerleave', (event: PointerEvent) => this.onPointerLeave(event), { signal, passive: true });
        this.scoreboardElement.addEventListener('click', (event: MouseEvent) => this.onClick(event), { signal });
        document.addEventListener('pointerdown', (event: PointerEvent) => this.onDocumentPointerDown(event), { signal, capture: true, passive: true });
        document.addEventListener('click', (event: MouseEvent) => this.onDocumentClick(event), { signal, capture: true }); //capture: before any listener on the board
    }

    //the game is over: the end-game display takes over, so the scoreboard shows nothing more, for good (live, or from setup after a reload)
    public disable(): void {
        this.clear();
        this.listeners?.abort();
        this.listeners = null;
    }

    public clear(): void {
        this.shown = false;
        this.game.boardHandler?.clearScoringTowers();
    }

    private onPointerEnter(event: PointerEvent): void {
        if(event.pointerType === 'touch')
            return;
        this.show();
    }

    private onPointerLeave(event: PointerEvent): void {
        if(event.pointerType === 'touch')
            return;
        this.clear();
    }

    private onClick(event: MouseEvent): void {
        if(this.lastPointerType !== 'touch')
            return;
        if(this.shown)
            this.clear();
        else this.show();
    }

    private onDocumentPointerDown(event: PointerEvent): void {
        this.lastPointerType = event.pointerType || 'mouse';
        this.swallowBoardClick = false;
        if(event.pointerType !== 'touch' || !this.shown || this.scoreboardElement.contains(event.target as Node))
            return;
        this.swallowBoardClick = !!(event.target as Element | null)?.closest?.('#nexo-board-column');
        this.clear();
    }

    //the click of a touch that ended the highlight on the board's column: it only ended the highlight (no draft, no undo, no confirm)
    private onDocumentClick(event: MouseEvent): void {
        if(!this.swallowBoardClick)
            return;
        this.swallowBoardClick = false;
        if((event.target as Element | null)?.closest?.('#nexo-board-column')){
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }

    private show(): void {
        if(this.game.isGameOver()){ //never expected: disable came first
            this.disable();
            return;
        }
        if(this.shown || this.game.boardHandler.isApplyingPlacements())
            return;

        const playerIDs = Object.keys(this.game.players).map(Number); //both players' areas, always together
        const savedSpots = this.game.placeTowers?.getSavedBoardSpots() ?? null; //null: no draft to step aside from
        if(!this.game.boardHandler.showScoringTowers(playerIDs, savedSpots))
            return;
        this.shown = true;
        if(savedSpots)
            this.game.confirmPopover.close(); //a question about the draft, which is hidden: the confirm button asks again
    }
}
