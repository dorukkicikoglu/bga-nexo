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

    private playerBoardContainer: HTMLDivElement;
    private reserveIcon: HTMLDivElement;
    private reserveCount: HTMLSpanElement;
    private boardElement: HTMLDivElement;

	constructor(private game: Game, private playerID: number, private playerName: string, private playerColor: string, private playerNo: number, private reserve: number, private passed: boolean, private score: number) {
        this.createPlayerBoardContainer();

        this.setReserve(this.reserve);
        this.showPassedStamp(false); //Game.updatePassedStamps() decides once every player board exists
	}

    //every player board, spectators included, shows the reserve (a disc in the player's color and its count) and, after an
    //automatic pass, a PASSED stamp (shown by data-passed). The score is BGA's own counter: the player's largest group
    private createPlayerBoardContainer(){
        this.playerBoardContainer = document.createElement('div');
        this.playerBoardContainer.classList.add('nexo-player-board');
        this.playerBoardContainer.innerHTML = `
            <div class="player-board-reserve-row">
                <div class="reserve-indicator">
                    <span class="reserve-icon-slot"></span>
                    <span class="reserve-times">×</span>
                    <span class="reserve-count"></span>
                </div>
                <div class="passed-stamp"><i class="fa6 fa-forward"></i>${_('Passed')}</div>
            </div>
        `;

        const playerPanel = this.game.bga.playerPanels.getElement(this.playerID);
        playerPanel.appendChild(this.playerBoardContainer);

        this.reserveIcon = BoardHandler.createTowerDiv(this.game.getDiscColor(this.playerID), 1, 'mini-tower reserve-tower-icon');
        this.playerBoardContainer.querySelector('.reserve-icon-slot').appendChild(this.reserveIcon);
        this.reserveCount = this.playerBoardContainer.querySelector('.reserve-count');

        this.boardElement = (playerPanel.closest('.player-board') as HTMLDivElement) ?? playerPanel; //BGA's whole board around our panel
        this.boardElement.classList.add('positioned-player-board');
        this.boardElement.addEventListener('animationend', (event: AnimationEvent) => { //the board's own bounce, not a child's animation
            if(event.target === this.boardElement && event.animationName === PlayerHandler.BOUNCE_CLASS)
                this.boardElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        });

        //ids for TooltipHandler
        this.playerBoardContainer.querySelector('.reserve-indicator').id = 'reserve-indicator-' + this.playerID;
        this.playerBoardContainer.querySelector('.passed-stamp').id = 'passed-stamp-' + this.playerID;
    }

    public setReserve(reserve: number): void {
        this.reserve = reserve;
        this.reserveCount.textContent = reserve.toString();
        this.playerBoardContainer.setAttribute('data-empty-reserve', reserve <= 0 ? 'true' : 'false');
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

        const bannerRect = banner.getBoundingClientRect(); //unrotated: no transform yet
        const cssWidth = parseFloat(getComputedStyle(banner).width);
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

        banner.classList.add('passed-banner-flying'); //the name fades out on the way
        banner.style.transition = `transform ${Game.PASS_BANNER_FLIGHT_DURATION}ms ease-in-out`;
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
        this.score = score;
        this.game.bga.playerPanels.getScoreCounter(this.playerID)?.toValue(score);
    }

    //the one shared bounce (discs given back by a replacement land on this board), removed on animationend
    public bounceBoard(): void {
        if(!this.game.bga.gameui.bgaAnimationsActive())
            return;

        this.boardElement.classList.remove(PlayerHandler.BOUNCE_CLASS);
        void this.boardElement.offsetWidth; //restarts a bounce still playing
        this.boardElement.classList.add(PlayerHandler.BOUNCE_CLASS);
    }

    //where towers leave from and replaced towers fly back to
    public getReserveIconElement(): HTMLDivElement { return this.reserveIcon; }
    public getPlayerID(): number { return this.playerID; }
    public getReserve(): number { return this.reserve; } //as tracked by setReserve()
    public isPassed(): boolean { return this.passed; }
    public getScore(): number { return this.score; } //as tracked by setScore()
}
