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
//settings and does the moving; this only hands it the scroll offset, as --nexo-parallax on <html>, clamped where every layer has
//reached its cap so scrolling further writes nothing. Also puts the black disc's shadow layer in <body>, which a pseudo-element
//can't hold (body's two are the surface and the disc)
export class BackgroundHandler{
    //custom properties on <html>: the scroll offset (set here) and the parallax's settings (set in Game.scss, :root)
    private static readonly PARALLAX_PROPERTY = '--nexo-parallax';
    private static readonly PARALLAX_LAYERS = ['near', 'far'];

    private static instance: BackgroundHandler | null = null; //guards against a second shadow layer if the game sets its UI up again

    private maxScroll = 0; //px of scroll past which every layer is at its cap
    private frame = 0;

    public static getInstance(): BackgroundHandler {
        return BackgroundHandler.instance ??= new BackgroundHandler();
    }

    private constructor() {
        const arcShadow = document.createElement('div');
        arcShadow.classList.add('background-arc-shadow');
        document.body.insertAdjacentElement('afterbegin', arcShadow); //first in <body>: over body::before, under body::after

        this.readParallaxSettings();
        //the settings change with the window's width (the mobile breakpoint) and prefers-reduced-motion: read them again then,
        //never while scrolling
        window.addEventListener('resize', () => { this.readParallaxSettings(); this.scheduleUpdate(); });
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { this.readParallaxSettings(); this.scheduleUpdate(); });
        window.addEventListener('scroll', () => this.scheduleUpdate(), { passive: true });
        this.update();
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
        const offset = Math.round(Math.min(Math.max(window.scrollY, 0), this.maxScroll)) + 'px'; //never negative (iOS's bounce at the top)
        const root = document.documentElement;
        if(root.style.getPropertyValue(BackgroundHandler.PARALLAX_PROPERTY) !== offset)
            root.style.setProperty(BackgroundHandler.PARALLAX_PROPERTY, offset);
    }
}
