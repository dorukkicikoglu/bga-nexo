/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * HeightMenu.ts
 */
import { Game } from "./Game";
import { BoardHandler } from "./BoardHandler";

//what the menu offers: the spot it belongs to, the heights it may take, and for a replacement the enemy tower under it
export type HeightMenuRequest = {
    spot: NexoSpot;
    heights: number[];
    discColor: DiscColor;
    replacedTower: NexoTower | null;
};

type MenuPlacement = 'above' | 'below' | 'right' | 'left';

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
export class HeightMenu {
    private menuElement: HTMLDivElement | null = null;
    private request: HeightMenuRequest | null = null;
    private onChoose: ((height: number) => void) | null = null;
    private onDismiss: (() => void) | null = null;
    private repositionFrame: number = 0;

    private readonly pointerDownListener = (event: PointerEvent) => this.onDocumentPointerDown(event);
    private readonly keyDownListener = (event: KeyboardEvent) => this.onDocumentKeyDown(event);
    private readonly viewportChangeListener = () => this.scheduleReposition();

    constructor(private game: Game) {
    }

    public isOpen(): boolean { return !!this.menuElement; }

    //opens the menu at request.spot, or moves it there (a new menu is built: the heights may differ)
    public open(request: HeightMenuRequest, onChoose: (height: number) => void, onDismiss: () => void): void {
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
    public close(): void {
        this.removeMenuElement();
        this.removeListeners();
        this.request = null;
        this.onChoose = null;
        this.onDismiss = null;
    }

    private removeMenuElement(): void {
        if(this.repositionFrame){
            cancelAnimationFrame(this.repositionFrame);
            this.repositionFrame = 0;
        }
        this.menuElement?.remove();
        this.menuElement = null;
    }

    private createMenuElement(request: HeightMenuRequest): HTMLDivElement {
        const menu = document.createElement('div');
        menu.className = 'height-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('data-disc-color', request.discColor);

        let captionHTML = `<span class="height-menu-caption-text">${_('Tower height')}</span>`;
        if(request.replacedTower){
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

        menu.addEventListener('click', (event: MouseEvent) => {
            const option = (event.target as HTMLElement).closest('.height-menu-option') as HTMLElement | null;
            if(option)
                this.choose(parseInt(option.getAttribute('data-height')));
        });

        return menu;
    }

    private choose(height: number): void {
        if(!this.request?.heights.includes(height) || !this.onChoose)
            return;
        this.onChoose(height); //the owner places the tower and closes the menu
    }

    private dismiss(): void {
        const onDismiss = this.onDismiss;
        this.close();
        onDismiss?.();
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

    //outside the menu: dismissed. Not on the board's clickable spots or drafted towers: those clicks go to PlaceTowers, which
    //moves the menu to another spot, closes it on the same spot, or takes a drafted tower back
    private onDocumentPointerDown(event: PointerEvent): void {
        const target = event.target as HTMLElement;
        if(!this.menuElement || this.menuElement.contains(target))
            return;
        if(target.closest?.('#nexo-board .clickable-spot, #nexo-board .pending-tower'))
            return;
        this.dismiss();
    }

    //never while typing (BGA's chat): digits there are text
    private onDocumentKeyDown(event: KeyboardEvent): void {
        const target = event.target as HTMLElement;
        if(target?.closest?.('input, textarea, select, [contenteditable="true"]'))
            return;

        if(event.key === 'Escape'){
            this.dismiss();
            return;
        }

        const height = parseInt(event.key);
        if(!isNaN(height) && this.request?.heights.includes(height)){
            event.preventDefault();
            this.choose(height);
        }
    }

    private scheduleReposition(): void {
        if(!this.menuElement || this.repositionFrame)
            return;
        this.repositionFrame = requestAnimationFrame(() => {
            this.repositionFrame = 0;
            this.reposition();
        });
    }

    //places the menu next to its spot on screen: the first side where it fits whole (above, below, right, left), else above;
    //then clamped inside the viewport (below a fixed BGA top bar). The arrow keeps pointing at the spot's centre
    public reposition(): void {
        if(!this.menuElement || !this.request)
            return;

        const anchor = this.game.boardHandler.getSpotElement(this.request.spot);
        if(!anchor){
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

        const candidates: { placement: MenuPlacement; left: number; top: number; fits: boolean; }[] = [
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
    private getMinTop(margin: number): number {
        const topBar = document.getElementById('topbar');
        if(!topBar || getComputedStyle(topBar).position !== 'fixed')
            return margin;
        return Math.max(margin, topBar.getBoundingClientRect().bottom + margin);
    }
}
