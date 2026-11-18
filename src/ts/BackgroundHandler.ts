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

//the page background's parallax (Game.scss, $bg-parallax-*): its layers drift left as the page scrolls down. Game.scss holds the
//settings and does the moving; this only hands it the scroll offset, as --nexo-parallax on <html> (a plain number of px), clamped
//where every layer has reached its cap so scrolling further writes nothing. Also puts in <body> the two layers a pseudo-element
//can't hold (body's two are the surface and the black disc): the black disc's shadow, then the red disc, which moves on its own.
//On mobile the red disc rises above BGA's floating buttons, so this also measures them (--floating-buttons-height), and keeps the
//window's stable height, which ignores a mobile browser's address bar showing or hiding (getStableViewportHeight)
export class BackgroundHandler{
    //custom properties on <html>: the scroll offset (set here) and the parallax's settings (set in Game.scss, :root)
    private static readonly PARALLAX_PROPERTY = '--nexo-parallax';
    private static readonly PARALLAX_LAYERS = ['near', 'far', 'red-disc']; //the red disc's growth ends with the near layer
    //on body: from the window's bottom to the top of BGA's floating buttons, px (measureFloatingButtons)
    private static readonly FLOATING_BUTTONS_PROPERTY = '--floating-buttons-height';
    //measureFloatingButtons(): the share of the window's width (from the right) and height (from the bottom) hit-tested for
    //BGA's floating buttons, every FLOATING_BUTTONS_SCAN_STEP screen px; anything fixed taller than the height share is not a
    //button (BGA's loading screen, an open chat window)
    private static readonly FLOATING_BUTTONS_SCAN_WIDTH_SHARE = 0.5;
    private static readonly FLOATING_BUTTONS_SCAN_HEIGHT_SHARE = 0.4;
    private static readonly FLOATING_BUTTONS_SCAN_STEP = 12;
    private static readonly FLOATING_BUTTONS_MAX_HEIGHT_SHARE = 0.4;
    //ms after setup when the buttons are measured again, while BGA finishes laying out its page: all before a first scroll,
    //usually, and any later change waits for the page's top (refreshFloatingButtons), so it never shows
    private static readonly FLOATING_BUTTONS_REMEASURE_DELAYS = [300, 1000, 2500];
    //px: a resize that only changes the height, by at most this, is a mobile browser's address bar showing or hiding (the first
    //scroll down hides it), not a real resize: nothing is measured again
    private static readonly ADDRESS_BAR_MAX_HEIGHT = 160;

    private static instance: BackgroundHandler | null = null; //guards against second layers if the game sets its UI up again

    private maxScroll = 0; //px of scroll past which every layer is at its cap
    private frame = 0;
    private stableWidth = 0; //the window's size at the last real resize (onResize)
    private stableHeight = 0;
    private floatingButtonsHeight: number | null = null; //the value set on body
    private pendingFloatingButtonsHeight: number | null = null; //a new value measured while scrolled, set back at the page's top

    public static getInstance(): BackgroundHandler {
        return BackgroundHandler.instance ??= new BackgroundHandler();
    }

    private constructor() {
        const arcShadow = document.createElement('div');
        arcShadow.classList.add('background-arc-shadow');
        document.body.insertAdjacentElement('afterbegin', arcShadow); //first in <body>: over body::before, under body::after
        const redDisc = document.createElement('div');
        redDisc.classList.add('background-red-disc');
        arcShadow.insertAdjacentElement('afterend', redDisc); //over the shadow, under body::after

        this.stableWidth = document.documentElement.clientWidth;
        this.stableHeight = document.documentElement.clientHeight;
        this.readParallaxSettings();
        this.refreshFloatingButtons(true);

        //the settings change with the window's width (the mobile breakpoint) and prefers-reduced-motion: read them again then,
        //never while scrolling
        window.addEventListener('resize', () => this.onResize());
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { this.readParallaxSettings(); this.refreshFloatingButtons(true); this.scheduleUpdate(); });
        window.addEventListener('scroll', () => this.scheduleUpdate(), { passive: true });

        //measure BGA's floating buttons again while its page settles, and whenever its chat bubbles come and go in #chatbar
        //(direct children only: on mobile the table log fills the chat windows inside it), which resizes nothing
        const remeasure = () => this.refreshFloatingButtons(false);
        requestAnimationFrame(remeasure);
        for(const delay of BackgroundHandler.FLOATING_BUTTONS_REMEASURE_DELAYS)
            setTimeout(remeasure, delay);
        if(document.readyState !== 'complete')
            window.addEventListener('load', remeasure, { once: true });
        document.fonts?.ready.then(remeasure);
        const chatBar = document.getElementById('chatbar');
        if(chatBar)
            new MutationObserver(remeasure).observe(chatBar, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });

        this.update();
    }

    //the window's height, held through a mobile browser's address bar showing or hiding: for anything measured from the
    //window's bottom that must not move then (BoardHandler.measureForBackgroundDisc)
    public getStableViewportHeight(): number {
        return this.stableHeight;
    }

    //a real resize (the width changed, a rotation, or the height by more than an address bar) measures everything again and
    //applies it at once: the layout moves then anyway. An address bar showing or hiding changes nothing
    private onResize(): void {
        const width = document.documentElement.clientWidth;
        const height = document.documentElement.clientHeight;
        if(width === this.stableWidth && Math.abs(height - this.stableHeight) <= BackgroundHandler.ADDRESS_BAR_MAX_HEIGHT)
            return;

        this.stableWidth = width;
        this.stableHeight = height;
        this.readParallaxSettings();
        this.refreshFloatingButtons(true);
        this.scheduleUpdate();
    }

    //the scroll offset where the slowest layer reaches its cap (0 when nothing moves: prefers-reduced-motion sets the ratios to 0)
    private readParallaxSettings(): void {
        const rootStyle = getComputedStyle(document.documentElement);
        this.maxScroll = 0;
        for(const layer of BackgroundHandler.PARALLAX_LAYERS){
            const ratio = parseFloat(rootStyle.getPropertyValue(`--bg-parallax-${layer}-ratio`));
            const cap = parseFloat(rootStyle.getPropertyValue(`--bg-parallax-${layer}-cap`));
            if(ratio > 0 && cap > 0)
                this.maxScroll = Math.max(this.maxScroll, Math.ceil(cap / ratio));
        }
    }

    //measures BGA's floating buttons and sets the result, at once if applyNow or the page is at its top (the red disc's rise is
    //multiplied by the scroll's progress, 0 there, so a new value can't show); otherwise it waits for the top (update), so the
    //disc never jumps mid-scroll
    private refreshFloatingButtons(applyNow: boolean): void {
        const height = this.measureFloatingButtons();
        if(height === this.floatingButtonsHeight){
            this.pendingFloatingButtonsHeight = null;
            return;
        }
        if(applyNow || window.scrollY <= 0)
            this.setFloatingButtonsHeight(height);
        else
            this.pendingFloatingButtonsHeight = height;
    }

    private setFloatingButtonsHeight(height: number): void {
        this.floatingButtonsHeight = height;
        this.pendingFloatingButtonsHeight = null;
        document.body.style.setProperty(BackgroundHandler.FLOATING_BUTTONS_PROPERTY, height + 'px');
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
    private measureFloatingButtons(): number {
        const root = document.documentElement;
        if(getComputedStyle(root).getPropertyValue('--bg-parallax-red-disc-rises').trim() !== '1')
            return 0;

        const width = root.clientWidth;
        const height = root.clientHeight;
        const maxHeight = height * BackgroundHandler.FLOATING_BUTTONS_MAX_HEIGHT_SHARE;
        const rects = new Map<Element, DOMRect>();
        const getRect = (element: Element): DOMRect => {
            if(!rects.has(element))
                rects.set(element, element.getBoundingClientRect());
            return rects.get(element);
        };
        const fixedRoots = new Map<Element, Element | null>(); //each element's nearest position: fixed ancestor (or itself), null if none
        const getFixedRoot = (element: Element): Element | null => {
            if(fixedRoots.has(element))
                return fixedRoots.get(element);
            const fixedRoot = element === document.body || element === root ? null
                : getComputedStyle(element).position === 'fixed' ? element
                : element.parentElement ? getFixedRoot(element.parentElement) : null;
            fixedRoots.set(element, fixedRoot);
            return fixedRoot;
        };

        let top = height;
        const step = BackgroundHandler.FLOATING_BUTTONS_SCAN_STEP;
        for(let y = height - 1; y >= height * (1 - BackgroundHandler.FLOATING_BUTTONS_SCAN_HEIGHT_SHARE); y -= step){
            for(let x = width - 1; x >= width * (1 - BackgroundHandler.FLOATING_BUTTONS_SCAN_WIDTH_SHARE); x -= step){
                for(const element of document.elementsFromPoint(x, y)){
                    const fixedRoot = getFixedRoot(element);
                    if(!fixedRoot || getRect(fixedRoot).height > maxHeight)
                        continue;
                    const rect = getRect(element);
                    if(rect.height > 0 && rect.height <= maxHeight)
                        top = Math.min(top, rect.top);
                }
            }
        }
        return Math.round(Math.max(0, height - top));
    }

    //one update per frame, whatever the number of scroll events; the scroll offset is read in the frame, not in the handler
    private scheduleUpdate(): void {
        if(this.frame)
            return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.update();
        });
    }

    private update(): void {
        const scrollY = window.scrollY;
        const offset = Math.round(Math.min(Math.max(scrollY, 0), this.maxScroll)).toString(); //never negative (iOS's bounce at the top)
        const root = document.documentElement;
        if(root.style.getPropertyValue(BackgroundHandler.PARALLAX_PROPERTY) !== offset)
            root.style.setProperty(BackgroundHandler.PARALLAX_PROPERTY, offset);

        if(this.pendingFloatingButtonsHeight !== null && scrollY <= 0) //back at the top: the red disc's rise is 0 here
            this.setFloatingButtonsHeight(this.pendingFloatingButtonsHeight);
    }
}
