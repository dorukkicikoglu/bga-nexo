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

//the page background's parallax (Game.scss, $bg-parallax-*): its layers drift left as the page scrolls down. Puts the three layers
//first in <body> (the surface, the red disc, the black disc with its shadow); Game.scss holds the settings and does the moving,
//by transform only. This only hands each layer the scroll offset, as --nexo-parallax inline on the layer itself (a plain number
//of px), never on <html> or <body>: a custom property changed there restyles every element of the page, every frame. Clamped
//where every layer has reached its cap, so scrolling further writes nothing.
//On mobile the red disc travels from behind the board (measureRedDiscStart) to a spot above BGA's floating buttons, so this also
//measures those (--floating-buttons-height, --fixed-header-height, --red-disc-start-right / -bottom), and keeps the window's stable
//height, which ignores a mobile browser's address bar showing or hiding (getStableViewportHeight)
type RedDiscMeasurements = { buttons: number, header: number, start: { right: number, bottom: number } | null };

export class BackgroundHandler{
    //the scroll offset, set here on each layer (LAYER_CLASSES); the parallax's settings are on <html> (Game.scss, :root)
    private static readonly PARALLAX_PROPERTY = '--nexo-parallax';
    //the layers, in paint order (each over the one before, all under the page), each one composited layer in Game.scss
    private static readonly LAYER_CLASSES = ['background-surface', 'background-red-disc', 'background-arc'];
    private static readonly PARALLAX_LAYERS = ['near', 'far', 'red-disc']; //each with its ratio and cap; the red disc's growth has its own end
    //on body: from the window's bottom to the top of BGA's floating buttons, px (measureFloatingButtons)
    private static readonly FLOATING_BUTTONS_PROPERTY = '--floating-buttons-height';
    //on body: how far from the window's top BGA's fixed header reaches once the page scrolls, px (measureFixedHeader)
    private static readonly FIXED_HEADER_PROPERTY = '--fixed-header-height';
    //on body: where the red disc starts on mobile, its centre from the window's right and bottom edges, px (measureRedDiscStart)
    private static readonly RED_DISC_START_RIGHT_PROPERTY = '--red-disc-start-right';
    private static readonly RED_DISC_START_BOTTOM_PROPERTY = '--red-disc-start-bottom';
    //measureFloatingButtons(): the share of the window's width (from the right) and height (from the bottom) hit-tested for
    //BGA's floating buttons, every FLOATING_BUTTONS_SCAN_STEP screen px; anything fixed taller than the height share is not a
    //button (BGA's loading screen, an open chat window)
    private static readonly FLOATING_BUTTONS_SCAN_WIDTH_SHARE = 0.5;
    private static readonly FLOATING_BUTTONS_SCAN_HEIGHT_SHARE = 0.4;
    private static readonly FLOATING_BUTTONS_SCAN_STEP = 12;
    private static readonly FLOATING_BUTTONS_MAX_HEIGHT_SHARE = 0.4;
    //ms after setup when the buttons are measured again, while BGA finishes laying out its page: all before a first scroll,
    //usually, and any later change waits for the page's top (refreshRedDiscPath), so it never shows
    private static readonly FLOATING_BUTTONS_REMEASURE_DELAYS = [300, 1000, 2500];
    //px: a resize that only changes the height, by at most this, is a mobile browser's address bar showing or hiding (the first
    //scroll down hides it), not a real resize: nothing is measured again
    private static readonly ADDRESS_BAR_MAX_HEIGHT = 160;

    private static instance: BackgroundHandler | null = null; //guards against second layers if the game sets its UI up again

    private maxScroll = 0; //px of scroll past which every layer is at its cap
    private frame = 0;
    private layers: HTMLDivElement[];
    private appliedOffset = -1; //the --nexo-parallax last written on the layers (-1: none yet), so a frame that changes nothing writes nothing
    private stableWidth = 0; //the window's size at the last real resize (onResize)
    private stableHeight = 0;
    private redDiscElement: HTMLDivElement;
    private redDiscMeasurements: RedDiscMeasurements = { buttons: 0, header: 0, start: null }; //the latest measured
    private appliedRedDiscKey = ''; //the values set on body, as a string to compare
    private redDiscPending = false; //measured while scrolled: set back at the page's top (update)
    private layoutFrame = 0;
    private observedBoard: HTMLElement | null = null;
    private layoutObserver = new ResizeObserver(() => this.scheduleRedDiscStart());

    public static getInstance(): BackgroundHandler {
        return BackgroundHandler.instance ??= new BackgroundHandler();
    }

    private constructor() {
        this.layers = BackgroundHandler.LAYER_CLASSES.map(className => {
            const layer = document.createElement('div');
            layer.classList.add(className);
            return layer;
        });
        document.body.prepend(...this.layers); //first in <body>, in this order: under the whole page
        this.redDiscElement = this.layers[BackgroundHandler.LAYER_CLASSES.indexOf('background-red-disc')];

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
        for(const delay of BackgroundHandler.FLOATING_BUTTONS_REMEASURE_DELAYS)
            setTimeout(remeasure, delay);
        if(document.readyState !== 'complete')
            window.addEventListener('load', remeasure, { once: true });
        document.fonts?.ready.then(remeasure);
        const chatBar = document.getElementById('chatbar');
        if(chatBar)
            new MutationObserver(remeasure).observe(chatBar, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });
        this.layoutObserver.observe(document.body);

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
        this.refreshRedDiscPath(true);
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
        //the red disc's growth and rise have their own end; with prefers-reduced-motion they are held at their end, nothing to follow
        const progressScroll = parseFloat(rootStyle.getPropertyValue('--bg-parallax-red-disc-progress-scroll'));
        if(progressScroll > 0 && rootStyle.getPropertyValue('--bg-parallax-still').trim() !== '1')
            this.maxScroll = Math.max(this.maxScroll, Math.ceil(progressScroll));
    }

    //measures what sets the red disc's path (BGA's floating buttons and fixed header, unless scanButtons is false: the start alone,
    //for a layout change, without the corner's hit-test) and sets it, at once if applyNow or the page is at its top (the path is
    //multiplied by the scroll's progress, 0 there, and the disc is behind the board then, so a new value can't show); otherwise it
    //waits for the top (update), so the disc never jumps mid-scroll
    private refreshRedDiscPath(applyNow: boolean, scanButtons: boolean = true): void {
        if(scanButtons){
            this.redDiscMeasurements.buttons = this.measureFloatingButtons();
            this.redDiscMeasurements.header = this.measureFixedHeader();
        }
        this.redDiscMeasurements.start = this.measureRedDiscStart();

        if(JSON.stringify(this.redDiscMeasurements) === this.appliedRedDiscKey){
            this.redDiscPending = false;
            return;
        }
        if(applyNow || window.scrollY <= 0)
            this.applyRedDiscMeasurements();
        else
            this.redDiscPending = true;
    }

    private applyRedDiscMeasurements(): void {
        const { buttons, header, start } = this.redDiscMeasurements;
        this.appliedRedDiscKey = JSON.stringify(this.redDiscMeasurements);
        this.redDiscPending = false;
        const bodyStyle = document.body.style;
        bodyStyle.setProperty(BackgroundHandler.FLOATING_BUTTONS_PROPERTY, buttons + 'px');
        bodyStyle.setProperty(BackgroundHandler.FIXED_HEADER_PROPERTY, header + 'px');
        if(start){
            bodyStyle.setProperty(BackgroundHandler.RED_DISC_START_RIGHT_PROPERTY, start.right + 'px');
            bodyStyle.setProperty(BackgroundHandler.RED_DISC_START_BOTTOM_PROPERTY, start.bottom + 'px');
        } else { //desktop, or no board: Game.scss starts the disc at its own place
            bodyStyle.removeProperty(BackgroundHandler.RED_DISC_START_RIGHT_PROPERTY);
            bodyStyle.removeProperty(BackgroundHandler.RED_DISC_START_BOTTOM_PROPERTY);
        }
    }

    //a layout change (the board's size or place, the page above it): the start again, once per frame
    private scheduleRedDiscStart(): void {
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
    private measureRedDiscStart(): { right: number, bottom: number } | null {
        const root = document.documentElement;
        const rootStyle = getComputedStyle(root);
        if(rootStyle.getPropertyValue('--bg-parallax-red-disc-rises').trim() !== '1')
            return null;
        const board = document.getElementById('nexo-board');
        if(!board)
            return null;
        if(this.observedBoard !== board){
            this.observedBoard = board;
            this.layoutObserver.observe(board);
        }

        const width = this.redDiscElement.offsetWidth;
        const height = this.redDiscElement.offsetHeight;
        if(!(width > 0 && height > 0))
            return null;

        const read = (property: string) => parseFloat(rootStyle.getPropertyValue(property));
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
    private measureFixedHeader(): number {
        if(getComputedStyle(document.documentElement).getPropertyValue('--bg-parallax-red-disc-rises').trim() !== '1')
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

    //one update per frame, whatever the number of scroll events (the listener is passive and only asks for a frame); the scroll
    //offset is read in the frame, not in the handler
    private scheduleUpdate(): void {
        if(this.frame)
            return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.update();
        });
    }

    //one read (scrollY, first, before any write, so it never forces a layout of ours) then only writes: no style or size is read here
    private update(): void {
        const scrollY = window.scrollY;
        const offset = Math.round(Math.min(Math.max(scrollY, 0), this.maxScroll)); //never negative (iOS's bounce at the top)
        if(offset !== this.appliedOffset){
            this.appliedOffset = offset;
            for(const layer of this.layers)
                layer.style.setProperty(BackgroundHandler.PARALLAX_PROPERTY, offset.toString());
        }

        if(this.redDiscPending && scrollY <= 0) //back at the top: the red disc's path is at its start here
            this.applyRedDiscMeasurements();
    }
}
