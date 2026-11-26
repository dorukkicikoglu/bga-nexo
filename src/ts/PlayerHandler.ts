/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * PlayerHandler.ts
 */
import { Game } from "./Game";
import { BoardHandler } from "./BoardHandler";

export class PlayerHandler{
    private static readonly BOUNCE_CLASS = 'bouncing-player-board'; //the one shared bounce class, its timing lives in Game.scss
    private static readonly SCORE_PULSE_CLASS = 'score-pulse'; //one-shot, on a score that changed (Game.scss: $top-bar-score-pulse-*)
    //the reserve: RESERVE_STACK_COUNT stacks of up to RESERVE_STACK_SIZE discs side by side, DISCS_PER_PLAYER (25) in all
    private static readonly RESERVE_STACK_COUNT = 5;
    private static readonly RESERVE_STACK_SIZE = 5;

    private sideElement: HTMLDivElement; //this player's side on the board's top edge: avatar, reserve stacks, PASSED stamp
    private reserveStacksElement: HTMLDivElement;
    private scoreValueElement: HTMLSpanElement; //[BGA] this player's number in the scoreboard at the board's top centre
    private score: number;
    private reserveStacks: HTMLDivElement[] = []; //stack 0 first: next to the avatar on either side (Game.scss mirrors the right side)

	constructor(private game: Game, private playerID: number, private reserve: number, private passed: boolean, side: TopBarSide, score: number) {
        this.createTopBarSide(side);
        this.createScore(side, score);

        this.setReserve(this.reserve);
        this.showPassedStamp(false); //Game.updatePassedStamps() decides once every player has a side
	}

    /**
     * [BGA] This player's side on the board's top edge (#nexo-top-bar, over the board's top band, Game.setup): the avatar on the
     * board's top corner, about half outside it, then, on the board's surface beside it, the reserve (its discs as stacks in the
     * player's color) growing toward the centre and, after an automatic pass, a PASSED stamp over the stacks (shown by
     * data-passed). The left side is the viewer's own (Game.getTopBarSide); the right side is the same DOM, mirrored in Game.scss.
     * BGA's player panel keeps only its own content (name, score counter)
     */
    private createTopBarSide(side: TopBarSide){
        this.sideElement = document.createElement('div');
        this.sideElement.className = 'top-bar-player';
        this.sideElement.setAttribute('data-side', side);
        this.sideElement.setAttribute('data-disc-color', this.game.getDiscColor(this.playerID));
        this.sideElement.innerHTML = `
            <img class="top-bar-avatar" alt="">
            <div class="player-board-reserve-row">
                <div class="reserve-stacks"></div>
                <div class="passed-stamp"><i class="fa6 fa-forward"></i>${_('Passed')}</div>
            </div>
        `;
        document.getElementById('nexo-top-bar').appendChild(this.sideElement);

        //the BGA avatar, large and sharp (getAvatarUrl), ringed in the player's color
        const avatar = this.sideElement.querySelector('.top-bar-avatar') as HTMLImageElement;
        const { url, fallbackUrl } = this.getAvatarUrls();
        avatar.alt = this.game.getPlayerName(this.playerID);
        avatar.style.setProperty('--player-color', '#' + this.game.getPlayerColor(this.playerID)); //the active glow (Game.scss)
        avatar.style.borderColor = '#' + this.game.getPlayerColor(this.playerID);
        if(fallbackUrl && fallbackUrl !== url)
            avatar.addEventListener('error', () => { avatar.src = fallbackUrl; }, { once: true }); //no 184 version: the panel's own size
        if(url)
            avatar.src = url;

        //each stack is a .nexo-tower box (Game.scss .reserve-stack) holding its discs, bottom first, like a tower
        this.reserveStacksElement = this.sideElement.querySelector('.reserve-stacks');
        const discColor = this.game.getDiscColor(this.playerID);
        for(let stackIndex = 0; stackIndex < PlayerHandler.RESERVE_STACK_COUNT; stackIndex++){
            const stack = document.createElement('div');
            stack.className = 'nexo-tower reserve-stack';
            stack.setAttribute('data-disc-color', discColor);
            this.reserveStacksElement.appendChild(stack);
            this.reserveStacks.push(stack);
        }

        this.sideElement.addEventListener('animationend', (event: AnimationEvent) => { //the side's own bounce, not a child's animation
            if(event.target === this.sideElement && event.animationName === PlayerHandler.BOUNCE_CLASS)
                this.sideElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        });

        //ids for TooltipHandler
        this.reserveStacksElement.id = 'reserve-stacks-' + this.playerID;
        this.sideElement.querySelector('.passed-stamp').id = 'passed-stamp-' + this.playerID;
    }

    //the avatar at 184px: the player panel's avatar (BGA's avatar_<id>) with its size suffix (_32, _50, _92) swapped for _184, or
    //the framework's own 184px url when the panel has none. fallbackUrl: the panel's image as it is, if the 184 one fails to load
    private getAvatarUrls(): { url: string; fallbackUrl: string; } {
        const panelSrc = (document.getElementById('avatar_' + this.playerID) as HTMLImageElement | null)?.getAttribute('src') ?? '';
        const largeSrc = panelSrc.replace(/_\d+(\.[a-z]+)(\?|$)/i, '_184$1$2');
        if(panelSrc)
            return { url: largeSrc, fallbackUrl: panelSrc };
        return { url: this.game.bga.players.getPlayerAvatarUrl(this.playerID, 184) ?? '', fallbackUrl: '' };
    }

    /**
     * The reserve as the server counts it (gamedatas on setup and F5, every notification): whenever the stacks don't show
     * exactly this many discs, filled left to right, they are rebuilt from it, so they never drift from the real count.
     * After a turn's flights (takeDiscs, addDiscs) they normally match already. Discs leave from the top of the rightmost
     * stack that has any and come back onto the top of the leftmost stack with room, so a reserve of n is always the first n
     * slots, stack by stack. Each disc's look comes from its slot (addStackDisc), so a rebuild looks the same
     */
    public setReserve(reserve: number): void {
        this.reserve = Math.max(0, reserve);
        if(!this.reserveStacks.every((stack, stackIndex) => PlayerHandler.getStackDiscs(stack).length === this.getStackHeight(stackIndex)))
            this.reserveStacks.forEach((stack, stackIndex) => {
                PlayerHandler.getStackDiscs(stack).forEach(disc => disc.remove());
                for(let level = 0; level < this.getStackHeight(stackIndex); level++)
                    this.addStackDisc(stackIndex);
            });
        this.game.tooltipHandler?.updateReserveTooltip(this.playerID, this.reserve);
    }

    //a turn's tower takes count discs, one at a time, each from the top of the rightmost stack that has any. Returns where each
    //was on screen, in the order taken (Game.animateTowerSlide starts the tower's discs there, bottom disc first), measured
    //just before it goes; fewer if the stacks run out (setReserve sets them right after the turn)
    public takeDiscs(count: number): DOMRect[] {
        const takenRects: DOMRect[] = [];
        for(let taken = 0; taken < count; taken++){
            const stack = [...this.reserveStacks].reverse().find(stack => PlayerHandler.getStackDiscs(stack).length > 0);
            if(!stack)
                break;
            const disc = PlayerHandler.getStackDiscs(stack).pop();
            takenRects.push(disc.getBoundingClientRect());
            disc.remove();
        }
        this.reserve = Math.max(0, this.reserve - count);
        this.game.tooltipHandler?.updateReserveTooltip(this.playerID, this.reserve);
        return takenRects;
    }

    //a replaced tower's count discs come back, one at a time, each onto the top of the leftmost stack with room. Returns the new
    //discs in the order placed (Game.animateTowerSlideAway lands the tower's discs on them, top disc first). Hidden, they keep
    //their place until their flight lands and shows them; fewer if the stacks are full (setReserve sets them right after the turn)
    public addDiscs(count: number, hidden: boolean): HTMLDivElement[] {
        const addedDiscs: HTMLDivElement[] = [];
        for(let added = 0; added < count; added++){
            const stackIndex = this.reserveStacks.findIndex(stack => PlayerHandler.getStackDiscs(stack).length < PlayerHandler.RESERVE_STACK_SIZE);
            if(stackIndex < 0)
                break;
            const disc = this.addStackDisc(stackIndex);
            if(hidden)
                disc.style.visibility = 'hidden';
            addedDiscs.push(disc);
        }
        this.reserve += count;
        this.game.tooltipHandler?.updateReserveTooltip(this.playerID, this.reserve);
        return addedDiscs;
    }

    //how many discs stack stackIndex holds for the current reserve: stacks fill left to right
    private getStackHeight(stackIndex: number): number {
        return Math.max(0, Math.min(PlayerHandler.RESERVE_STACK_SIZE, this.reserve - stackIndex * PlayerHandler.RESERVE_STACK_SIZE));
    }

    private static getStackDiscs(stack: HTMLDivElement): HTMLDivElement[] {
        return Array.from(stack.querySelectorAll<HTMLDivElement>(':scope > .tower-disc'));
    }

    //a disc on top of stack stackIndex, drawn like a tower's (.tower-disc at its --disc-index), its look from its slot (the stack
    //and the level: BoardHandler.getDiscLook), set once here and never again
    private addStackDisc(stackIndex: number): HTMLDivElement {
        const stack = this.reserveStacks[stackIndex];
        const level = PlayerHandler.getStackDiscs(stack).length;
        const disc = document.createElement('div');
        disc.className = 'tower-disc';
        const look = BoardHandler.getDiscLook(this.game.getDiscColor(this.playerID), { kind: 'reserve', x: stackIndex, y: 0, level: level });
        disc.setAttribute('style', `--disc-index: ${level}; ${BoardHandler.getDiscLookStyle(look)}`);
        stack.appendChild(disc);
        return disc;
    }

    //[BGA] the player's last turn was an automatic pass (no valid move); cleared when they place towers again.
    //Whether the stamp shows is Game.updatePassedStamps()'s call: never when both passed (the game is over)
    public setPassed(passed: boolean): void {
        this.passed = passed;
        this.game.updatePassedStamps();
    }

    public showPassedStamp(show: boolean): void {
        this.sideElement.setAttribute('data-passed', show ? 'true' : 'false');
    }

    //[BGA] the active player's avatar glows (Game.setActivePlayer)
    public setActive(active: boolean): void {
        this.sideElement.classList.toggle('active-top-bar-player', active);
    }

    //[BGA] a pass, seen by everyone: a big PASSED stamp with the player's name pops in at the centre of the screen, holds,
    //then shrinks onto this player's PASSED stamp over their reserve. The player is marked passed as it lands: the stamp fades in under
    //it, or, when it doesn't show (both players passed: the game is over), the banner fades out where it landed.
    //The banner is in <body>, outside BGA's mobile scaling: it converts screen px with its own measured zoom, like
    //Game.getSlidingCloneTransform. Its transform holds its rotation (the stamp's rotate), so translate is never rotated
    public async animatePass(): Promise<void> {
        const passedStamp = this.sideElement.querySelector('.passed-stamp') as HTMLDivElement;
        const rotation = getComputedStyle(passedStamp).rotate;
        const rotate = (rotation && rotation !== 'none') ? rotation : '0deg';

        const banner = document.createElement('div');
        banner.classList.add('passed-banner');
        banner.innerHTML = `<div class="passed-banner-name">${this.game.divColoredPlayer(this.playerID, {class: 'playername'})}</div><i class="fa6 fa-forward"></i>${_('Passed')}`;
        banner.style.opacity = '0';
        document.body.appendChild(banner);

        //the zoom compares like with like: the rect is the border box, and computed `width` is only the content box (the
        //banner's 3x padding and border made it about 1.3 on an unzoomed page, so it flew about 77% of the way)
        const bannerRect = banner.getBoundingClientRect(); //unrotated: no transform yet
        const bannerStyle = getComputedStyle(banner);
        const cssWidth = (bannerStyle.boxSizing === 'border-box') ? parseFloat(bannerStyle.width) : ['width', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, property) => sum + parseFloat(bannerStyle[property]), 0);
        const zoom = (cssWidth > 0) ? bannerRect.width / cssWidth : 1;
        const transformTo = (dx: number, dy: number, scale: number): string => `translate(${dx / zoom}px, ${dy / zoom}px) scale(${scale}) rotate(${rotate})`;

        banner.style.transform = transformTo(0, 0, 1.4);
        await this.game.bga.gameui.wait(20); //let the start paint before the transition kicks in

        banner.style.transition = `transform ${Game.PASS_BANNER_POP_DURATION}ms ease-out, opacity ${Game.PASS_BANNER_POP_DURATION}ms ease-out`;
        banner.style.transform = transformTo(0, 0, 1);
        banner.style.opacity = '1';
        await this.game.bga.gameui.wait(Game.PASS_BANNER_POP_DURATION + Game.PASS_BANNER_HOLD);

        //the reserve's stamp, measured unrotated now (the page may have scrolled during the hold); hidden, it keeps its place
        passedStamp.style.rotate = '0deg';
        const stampRect = passedStamp.getBoundingClientRect();
        passedStamp.style.rotate = '';
        const dx = (stampRect.left + stampRect.width / 2) - (bannerRect.left + bannerRect.width / 2);
        const dy = (stampRect.top + stampRect.height / 2) - (bannerRect.top + bannerRect.height / 2);
        const scale = (bannerRect.width > 0) ? stampRect.width / bannerRect.width : 1;

        //the flight's transition is .passed-banner-flying's (Game.scss): the transform and the shadow together, so it lands
        //with the board stamp's shadow. The name fades out on the way
        banner.style.transition = '';
        banner.style.setProperty('--passed-banner-flight-duration', `${Game.PASS_BANNER_FLIGHT_DURATION}ms`);
        banner.classList.add('passed-banner-flying');
        banner.style.transform = transformTo(dx, dy, scale);
        await this.game.bga.gameui.wait(Game.PASS_BANNER_FLIGHT_DURATION);

        this.setPassed(true);
        if(this.sideElement.getAttribute('data-passed') !== 'true'){
            banner.style.transition = `opacity ${Game.PASS_BANNER_SETTLE_DURATION}ms ease`;
            banner.style.opacity = '0';
        }
        await this.game.bga.gameui.wait(Game.PASS_BANNER_SETTLE_DURATION);
        banner.remove();
    }

    //[BGA] this player's half of the scoreboard at the board's top centre (#nexo-top-bar .top-bar-scoreboard, Game.setup), on their
    //side (Game.getTopBarSide), next to the centre line, in their color (data-disc-color). Set from gamedatas, no pulse
    private createScore(side: TopBarSide, score: number): void {
        const scoreElement = document.querySelector(`#nexo-top-bar .top-bar-score[data-side="${side}"]`) as HTMLDivElement;
        scoreElement.setAttribute('data-disc-color', this.game.getDiscColor(this.playerID));
        this.scoreValueElement = document.createElement('span');
        this.scoreValueElement.className = 'top-bar-score-value';
        this.scoreValueElement.addEventListener('animationend', (event: AnimationEvent) => {
            if(event.target === this.scoreValueElement && event.animationName === PlayerHandler.SCORE_PULSE_CLASS)
                this.scoreValueElement.classList.remove(PlayerHandler.SCORE_PULSE_CLASS);
        });
        scoreElement.appendChild(this.scoreValueElement);
        this.score = score;
        this.scoreValueElement.textContent = score.toString();
    }

    //every live score change goes through here (towersPlaced, the end of the game live or after a reload): BGA's score counter and
    //the scoreboard's number are the player's largest group. A number that changed pulses once (none with animations off or
    //reduced motion)
    public setScore(score: number): void {
        this.game.bga.playerPanels.getScoreCounter(this.playerID)?.toValue(score);
        if(score === this.score)
            return;
        this.score = score;
        this.scoreValueElement.textContent = score.toString();
        if(!this.game.bga.gameui.bgaAnimationsActive() || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        this.scoreValueElement.classList.remove(PlayerHandler.SCORE_PULSE_CLASS);
        void this.scoreValueElement.offsetWidth; //restarts a pulse still playing
        this.scoreValueElement.classList.add(PlayerHandler.SCORE_PULSE_CLASS);
    }

    //the score counter's value: the player's largest group (the game end row's fallback for the loser's score)
    public getScore(): number | undefined {
        return this.game.bga.playerPanels.getScoreCounter(this.playerID)?.getValue();
    }

    //the one shared bounce (discs given back by a replacement land on this player's stacks): their avatar and stacks bounce,
    //removed on animationend
    public bounceBoard(): void {
        if(!this.game.bga.gameui.bgaAnimationsActive())
            return;

        this.sideElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        void this.sideElement.offsetWidth; //restarts a bounce still playing
        this.sideElement.classList.add(PlayerHandler.BOUNCE_CLASS);
    }

    //the stacks' row on screen: where a disc flies from or to when its own disc is missing from the stacks (never expected)
    public getReserveRect(): DOMRect { return this.reserveStacksElement.getBoundingClientRect(); }
    public getReserve(): number { return this.reserve; } //as tracked by setReserve(), takeDiscs() and addDiscs()
    public isPassed(): boolean { return this.passed; }
}
