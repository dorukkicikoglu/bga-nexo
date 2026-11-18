/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * ConfirmPopover.ts
 */
import { Game } from "./Game";

type PopoverPlacement = 'below' | 'above';

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
export class ConfirmPopover {
    private popoverElement: HTMLDivElement | null = null;
    private onConfirm: (() => void) | null = null;
    private repositionFrame: number = 0;

    private readonly pointerDownListener = (event: PointerEvent) => this.onDocumentPointerDown(event);
    private readonly keyDownListener = (event: KeyboardEvent) => this.onDocumentKeyDown(event);
    private readonly viewportChangeListener = () => this.scheduleReposition();

    constructor(private game: Game) {
    }

    public isOpen(): boolean { return !!this.popoverElement; }

    //opens the card under the confirm button (closing any other first); onConfirm sends the turn
    public open(onConfirm: () => void): void {
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
        buttons.append( //Cancel on the left, Confirm on the right, on one line
            this.createButton('confirm-popover-cancel', _('Cancel'), () => this.close()),
            this.createButton('confirm-popover-confirm', _('Confirm'), () => this.confirm()),
        );

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
    public close(): void {
        if(this.repositionFrame){
            cancelAnimationFrame(this.repositionFrame);
            this.repositionFrame = 0;
        }
        this.removeListeners();
        this.popoverElement?.remove();
        this.popoverElement = null;
        this.onConfirm = null;
    }

    //"Confirm", or a second press of the board's confirm button while open (PlaceTowers)
    public confirm(): void {
        const onConfirm = this.onConfirm;
        this.close();
        onConfirm?.();
    }

    private createButton(className: string, label: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'confirm-popover-button ' + className;
        button.textContent = label;
        button.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    private addListeners(): void {
        document.addEventListener('pointerdown', this.pointerDownListener, true);
        document.addEventListener('keydown', this.keyDownListener);
        window.addEventListener('scroll', this.viewportChangeListener, true); //capture: any scrolling ancestor, not only the page
        window.addEventListener('resize', this.viewportChangeListener);
    }

    private removeListeners(): void {
        document.removeEventListener('pointerdown', this.pointerDownListener, true);
        document.removeEventListener('keydown', this.keyDownListener);
        window.removeEventListener('scroll', this.viewportChangeListener, true);
        window.removeEventListener('resize', this.viewportChangeListener);
    }

    //outside the card: closed. Not on the board's confirm button, whose click (after this pointer down) confirms
    private onDocumentPointerDown(event: PointerEvent): void {
        const target = event.target as HTMLElement;
        if(!this.popoverElement || this.popoverElement.contains(target) || target.closest?.('#nexo-board .pending-confirm-button'))
            return;
        this.close();
    }

    //never while typing (BGA's chat)
    private onDocumentKeyDown(event: KeyboardEvent): void {
        const target = event.target as HTMLElement;
        if(event.key !== 'Escape' || target?.closest?.('input, textarea, select, [contenteditable="true"]'))
            return;
        event.preventDefault();
        this.close();
    }

    private scheduleReposition(): void {
        if(!this.popoverElement || this.repositionFrame)
            return;
        this.repositionFrame = requestAnimationFrame(() => {
            this.repositionFrame = 0;
            this.reposition();
        });
    }

    //below the confirm button when the card fits there, else above it (else wherever has more room), then kept inside the game
    //area and the viewport across (the viewport alone when the game area is narrower than the card) and inside the viewport
    //down (below a fixed BGA top bar). The arrow keeps pointing at the button's centre
    private reposition(): void {
        if(!this.popoverElement)
            return;

        const anchor = this.game.boardHandler.getConfirmButton();
        if(!anchor){
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
        const placement: PopoverPlacement = (roomBelow >= height || roomBelow >= roomAbove + height) ? 'below' : 'above';
        const top = Math.max(minTop, Math.min(placement === 'below' ? belowTop : aboveTop, viewportHeight - margin - height));

        let minLeft = margin;
        let maxLeft = viewportWidth - margin - width;
        const gameAreaRect = this.game.bga.gameArea.getElement()?.getBoundingClientRect();
        if(gameAreaRect){
            const areaMinLeft = Math.max(minLeft, gameAreaRect.left + margin);
            const areaMaxLeft = Math.min(maxLeft, gameAreaRect.right - margin - width);
            if(areaMinLeft <= areaMaxLeft){
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
    private getMinTop(margin: number): number {
        const topBar = document.getElementById('topbar');
        if(!topBar || getComputedStyle(topBar).position !== 'fixed')
            return margin;
        return Math.max(margin, topBar.getBoundingClientRect().bottom + margin);
    }
}
