/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * LogMutationObserver.ts
 */
import { Game } from "./Game";
import { BoardHandler } from "./BoardHandler";

interface LogRowData { //this is used to return strings containing log-class-tag divs
    log_html: string;
    log_class: string;
}

export class LogMutationObserver{
	private nextTimestampValue:string = '';

    constructor(private game: Game) {
		this.observeLogs();
    }

    private observeLogs(): void{
        let observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node: HTMLDivElement) => {
                        if (node.nodeType === 1 && node.tagName.toLowerCase() === 'div' && node.classList.contains('log')){
                            this.processLogDiv(node);
                        }
                    });
                }
            });
        });

        // Configure the MutationObserver to observe changes to the container's child nodes
        const config = {
            childList: true,
            subtree: true // Set to true if you want to observe all descendants of the container
        };

        // Start observing the container
        observer.observe($('logs'), config);
        observer.observe($('chatbar'), config); //mobile notifs

        if(this.game.isReplay()){ //to observe replayLogs that appears at the bottom of the page on replays
            let replayLogsObserverStarted = false;
            const replayLogsObserver = new MutationObserver((mutations, obs) => {
              for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node: HTMLDivElement) => {
                        if(!replayLogsObserverStarted && node instanceof HTMLElement && node.id.startsWith('replaylogs')) {
                            this.processLogDiv(node);
                        }
                    });
                }
              }
            });
            replayLogsObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    private processLogDiv(node: HTMLDivElement): void{
        const classTags: HTMLDivElement[] = Array.from(node.querySelectorAll('*[log-class-tag]'));

        for(const classTag of classTags){
            const logClassName: string = classTag.getAttribute('log-class-tag');

            let parentLog: HTMLDivElement = null;
            let current: HTMLDivElement = classTag;
            while (current) {
                if (current.classList.contains('gamelogreview') || current.classList.contains('log')) {
                    parentLog = current;
                    break;
                }
                current = current.parentElement as HTMLDivElement;
            }

            if(parentLog)
                parentLog.classList.add('a-game-log', logClassName);
        }

        classTags.forEach(classTag => classTag.remove());

        node.querySelectorAll('.playername').forEach((playerName: HTMLElement) => {
            playerName.setAttribute('player-color', this.game.rgbToHex(window.getComputedStyle(playerName).color));
        });

        if(this.game.isDesktop() && node.classList.contains('a-game-log')){
            let timestamp: HTMLDivElement[] = Array.from(node.querySelectorAll('.timestamp'));
            if(timestamp.length > 0){
                this.nextTimestampValue = timestamp[0].innerText;
            } else if(this.observeLogs.hasOwnProperty('nextTimestampValue')){
                let newTimestamp: HTMLDivElement = document.createElement('div');
                newTimestamp.classList.add('timestamp');
                newTimestamp.innerHTML = this.nextTimestampValue;

                node.appendChild(newTimestamp);
            }
        }
    }

    //gapBefore: the row starts a new group in the log (log-gap-before, a gap on the side of the previous row). Decided from the
    //notification's args, never from the rows around it, so live rows, F5 and replays all get the same gaps
    private addLogClassTag(logHTML: string, logClass: string, gapBefore: boolean = false): LogRowData {
        const gapTagHTML = gapBefore ? '<div log-class-tag="log-gap-before"></div>' : '';
        return { log_html: logHTML + `<div log-class-tag="${logClass}"></div>` + gapTagHTML, log_class: logClass };
    }

    //create specific log types
    //"name [tower] [tower] [enemy tower → tower]": every tower of the turn as a mini tower in the player's color, in the order
    //they were drafted; a replacement shows the enemy tower it replaced, faded and crossed, then the new one
    public createLogTowersPlaced(player_id: number, placements: NexoPlacement[]): LogRowData {
        const discColor = this.game.getDiscColor(player_id);
        const towersHTML = placements.map(placement => {
            const towerHTML = this.getMiniTowerHTML(discColor, placement.height);
            if(placement.kind !== 'replace' || placement.replaced_player_id === null)
                return towerHTML;

            const replacedHTML = this.getMiniTowerHTML(this.game.getDiscColor(placement.replaced_player_id), placement.replaced_height ?? 1, 'replaced-log-tower');
            return `<span class="log-replacement">${replacedHTML}<i class="fa6 fa-arrow-right log-replacement-arrow" aria-hidden="true"></i>${towerHTML}</span>`;
        }).join('');

        let logHTML = `
            <div class="towers-placed-row">
                ${this.getCutPlayerNameHTML(player_id)}
                <span class="log-towers">${towersHTML}</span>
            </div>` + ' &nbsp;';

        return this.addLogClassTag(logHTML, 'towers-placed-log');
    }

    //[BGA] the automatic pass: "[forward] name has no valid move and passes" (the server's PASS_LOG_STR is the plain-text fallback)
    public createLogPlayerPassed(player_id: number): LogRowData {
        const passText = (player_id === this.game.getMyPlayerID()) ? _('${you} have no valid move and pass') : _('${player_name} has no valid move and passes');
        const passHTML = passText
            .replace('${you}', this.game.divYou({class: 'playername'}))
            .replace('${player_name}', this.game.divColoredPlayer(player_id, {class: 'playername'}));

        let logHTML = `
            <div class="player-passed-row">
                <i class="fa6 fa-forward player-passed-icon" aria-hidden="true"></i>
                <span>${passHTML}</span>
            </div>` + ' &nbsp;';

        return this.addLogClassTag(logHTML, 'player-passed-log');
    }

    //the game ends: everyone at the top score wins (a tie shares the victory)
    public createLogGameEnd(winner_ids: number[], winningScore: number): LogRowData {
        const iWin = winner_ids.includes(this.game.getMyPlayerID());
        const otherWinnersHTML = winner_ids.filter(player_id => player_id !== this.game.getMyPlayerID()).map(player_id => this.game.divColoredPlayer(player_id, {class: 'playername'}));

        //one string per case, since other languages conjugate "you", one other player and several players differently
        let gameEndText: string;
        if(iWin)
            gameEndText = (otherWinnersHTML.length === 0) ? _('${you} win with ${score} connected towers') : _('${you} and ${players} share the victory with ${score} connected towers');
        else gameEndText = (otherWinnersHTML.length === 1) ? _('${player_name} wins with ${score} connected towers') : _('${players} share the victory with ${score} connected towers');

        const gameEndHTML = gameEndText
            .replace('${you}', iWin ? this.game.divYou({class: 'playername'}) : '')
            .replace('${player_name}', otherWinnersHTML[0] ?? '')
            .replace('${players}', otherWinnersHTML.join(', '))
            .replace('${score}', `<b>${winningScore}</b>`);

        let logHTML = `
            <div class="game-end-row">
                <i class="fa6 fa-trophy"></i>&nbsp;${gameEndHTML}
            </div>` + ' &nbsp;';

        return this.addLogClassTag(logHTML, 'game-end-log');
    }

    //a tower drawn at log size (.log-tower sets its own --cell-size)
    private getMiniTowerHTML(discColor: DiscColor, height: number, extraClass: string = ''): string {
        return BoardHandler.createTowerDiv(discColor, height, 'log-tower' + (extraClass ? ' ' + extraClass : '')).outerHTML;
    }

    //a player name the row's CSS cuts with an ellipsis (max-width), so its title shows it whole
    private getCutPlayerNameHTML(player_id: number): string {
        const nameText = (player_id === this.game.getMyPlayerID()) ? _('You') : this.game.getPlayerName(player_id);
        return this.game.divColoredPlayer(player_id, {class: 'playername', title: nameText.replace(/"/g, '&quot;')});
    }
}
