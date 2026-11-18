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

export class PlayerHandler{
    private static readonly BOUNCE_CLASS = 'bouncing-player-board'; //the one shared bounce class, its timing lives in Game.scss
    //the reserve: RESERVE_STACK_COUNT stacks of up to RESERVE_STACK_SIZE discs side by side, DISCS_PER_PLAYER (25) in all
    private static readonly RESERVE_STACK_COUNT = 5;
    private static readonly RESERVE_STACK_SIZE = 5;

    private playerBoardContainer: HTMLDivElement;
    private reserveStacksElement: HTMLDivElement;
    private reserveStacks: HTMLDivElement[] = []; //left to right
    private boardElement: HTMLDivElement;

	constructor(private game: Game, private playerID: number, private reserve: number, private passed: boolean) {
        this.createPlayerBoardContainer();

        this.setReserve(this.reserve);
        this.showPassedStamp(false); //Game.updatePassedStamps() decides once every player board exists
	}

    //every player board, spectators included, shows the reserve (its discs as stacks in the player's color) and, after an
    //automatic pass, a PASSED stamp (shown by data-passed). The score is BGA's own counter: the player's largest group
    private createPlayerBoardContainer(){
        this.playerBoardContainer = document.createElement('div');
        this.playerBoardContainer.classList.add('nexo-player-board');
        this.playerBoardContainer.innerHTML = `
            <div class="player-board-reserve-row">
                <div class="reserve-stacks"></div>
                <div class="passed-stamp"><i class="fa6 fa-forward"></i>${_('Passed')}</div>
            </div>
        `;

        const playerPanel = this.game.bga.playerPanels.getElement(this.playerID);
        playerPanel.appendChild(this.playerBoardContainer);

        //each stack is a .nexo-tower box (Game.scss .reserve-stack) holding its discs, bottom first, like a tower
        this.reserveStacksElement = this.playerBoardContainer.querySelector('.reserve-stacks');
        const discColor = this.game.getDiscColor(this.playerID);
        for(let stackIndex = 0; stackIndex < PlayerHandler.RESERVE_STACK_COUNT; stackIndex++){
            const stack = document.createElement('div');
            stack.className = 'nexo-tower reserve-stack';
            stack.setAttribute('data-disc-color', discColor);
            this.reserveStacksElement.appendChild(stack);
            this.reserveStacks.push(stack);
        }

        this.boardElement = (playerPanel.closest('.player-board') as HTMLDivElement) ?? playerPanel; //BGA's whole board around our panel
        this.boardElement.classList.add('positioned-player-board');
        this.boardElement.addEventListener('animationend', (event: AnimationEvent) => { //the board's own bounce, not a child's animation
            if(event.target === this.boardElement && event.animationName === PlayerHandler.BOUNCE_CLASS)
                this.boardElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        });

        //ids for TooltipHandler
        this.reserveStacksElement.id = 'reserve-stacks-' + this.playerID;
        this.playerBoardContainer.querySelector('.passed-stamp').id = 'passed-stamp-' + this.playerID;
    }

    /**
     * The reserve as the server counts it (gamedatas on setup and F5, every notification): whenever the stacks don't show
     * exactly this many discs, filled left to right, they are rebuilt from it, so they never drift from the real count.
     * After a turn's flights (takeDiscs, addDiscs) they normally match already. Discs leave from the top of the rightmost
     * stack that has any and come back onto the top of the leftmost stack with room, so a reserve of n is always the first n
     * slots, stack by stack
     */
    public setReserve(reserve: number): void {
        this.reserve = Math.max(0, reserve);
        if(!this.reserveStacks.every((stack, stackIndex) => PlayerHandler.getStackDiscs(stack).length === this.getStackHeight(stackIndex)))
            this.reserveStacks.forEach((stack, stackIndex) => {
                PlayerHandler.getStackDiscs(stack).forEach(disc => disc.remove());
                for(let level = 0; level < this.getStackHeight(stackIndex); level++)
                    PlayerHandler.addStackDisc(stack);
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
            const stack = this.reserveStacks.find(stack => PlayerHandler.getStackDiscs(stack).length < PlayerHandler.RESERVE_STACK_SIZE);
            if(!stack)
                break;
            const disc = PlayerHandler.addStackDisc(stack);
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

    //a disc on top of the stack, drawn like a tower's (.tower-disc at its --disc-index)
    private static addStackDisc(stack: HTMLDivElement): HTMLDivElement {
        const disc = document.createElement('div');
        disc.className = 'tower-disc';
        disc.style.setProperty('--disc-index', PlayerHandler.getStackDiscs(stack).length.toString());
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
        this.playerBoardContainer.setAttribute('data-passed', show ? 'true' : 'false');
    }

    //[BGA] a pass, seen by everyone: a big PASSED stamp with the player's name pops in at the centre of the screen, holds,
    //then shrinks onto this board's PASSED stamp. The player is marked passed as it lands: the board's stamp fades in under
    //it, or, when it doesn't show (both players passed: the game is over), the banner fades out where it landed.
    //The banner is in <body>, outside BGA's mobile scaling: it converts screen px with its own measured zoom, like
    //Game.getSlidingCloneTransform. Its transform holds its rotation (the stamp's rotate), so translate is never rotated
    public async animatePass(): Promise<void> {
        const passedStamp = this.playerBoardContainer.querySelector('.passed-stamp') as HTMLDivElement;
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

        //the board's stamp, measured unrotated now (the page may have scrolled during the hold); hidden, it keeps its place
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
        if(this.playerBoardContainer.getAttribute('data-passed') !== 'true'){
            banner.style.transition = `opacity ${Game.PASS_BANNER_SETTLE_DURATION}ms ease`;
            banner.style.opacity = '0';
        }
        await this.game.bga.gameui.wait(Game.PASS_BANNER_SETTLE_DURATION);
        banner.remove();
    }

    //every live score change goes through here: BGA's score counter is the player's largest group
    public setScore(score: number): void {
        this.game.bga.playerPanels.getScoreCounter(this.playerID)?.toValue(score);
    }

    //the score counter's value: the player's largest group (the game end row's fallback for the loser's score)
    public getScore(): number | undefined {
        return this.game.bga.playerPanels.getScoreCounter(this.playerID)?.getValue();
    }

    //the one shared bounce (discs given back by a replacement land on this board), removed on animationend
    public bounceBoard(): void {
        if(!this.game.bga.gameui.bgaAnimationsActive())
            return;

        this.boardElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        void this.boardElement.offsetWidth; //restarts a bounce still playing
        this.boardElement.classList.add(PlayerHandler.BOUNCE_CLASS);
    }

    //the stacks' row on screen: where a disc flies from or to when its own disc is missing from the stacks (never expected)
    public getReserveRect(): DOMRect { return this.reserveStacksElement.getBoundingClientRect(); }
    public getReserve(): number { return this.reserve; } //as tracked by setReserve(), takeDiscs() and addDiscs()
    public isPassed(): boolean { return this.passed; }
}
