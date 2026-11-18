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
import { BoardRules } from "./BoardRules";

export class LogMutationObserver{
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
            const replayLogsObserver = new MutationObserver((mutations, obs) => {
              for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node: HTMLDivElement) => {
                        if(node instanceof HTMLElement && node.id.startsWith('replaylogs')) {
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
    }

    //the row's class (logClass, its *-log type) as a log-class-tag, which processLogDiv moves onto the row
    private addLogClassTag(logHTML: string, logClass: string): LogRowData {
        return { log_html: logHTML + `<div log-class-tag="${logClass}"></div>`, log_class: logClass };
    }

    //the row's player's disc color as a class on the row (red-disc-log, black-disc-log): its accent bar. From the notification's
    //args, like every per-row style
    private getDiscColorTag(player_id: number): string {
        return `<div log-class-tag="${this.game.getDiscColor(player_id)}-disc-log"></div>`;
    }

    //create specific log types
    //"name [board]": the board as it stood at the end of the turn (board_snapshot), cropped to its towers, every spot the turn
    //touched ringed in gold (the placements: a new tower or a replacement)
    public createLogTowersPlaced(player_id: number, placements: NexoPlacement[], boardSnapshot?: string): LogRowData {
        let logHTML = `
            <div class="towers-placed-row">
                ${this.getCutPlayerNameHTML(player_id)}
                ${this.getBoardSnapshotHTML(player_id, placements, boardSnapshot)}
            </div>` + this.getDiscColorTag(player_id) + ' &nbsp;';

        return this.addLogClassTag(logHTML, 'towers-placed-log');
    }

    //[BGA] the automatic pass, icons only like Riviera's skipped power: "name [ban]", the ban sign titled with its meaning (the
    //server's PASS_LOG_STR is the plain-text fallback)
    public createLogPlayerPassed(player_id: number): LogRowData {
        const passTitle = _('No valid move, passes').replace(/"/g, '&quot;');

        let logHTML = `
            <div class="player-passed-row">
                ${this.getCutPlayerNameHTML(player_id)}
                <i class="fa6 fa-ban player-passed-icon" title="${passTitle}" aria-label="${passTitle}" role="img"></i>
            </div>` + this.getDiscColorTag(player_id) + ' &nbsp;';

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
            </div>` + (winner_ids.length === 1 ? this.getDiscColorTag(winner_ids[0]) : '') + ' &nbsp;';

        return this.addLogClassTag(logHTML, 'game-end-log');
    }

    /**
     * [BGA] A turn's board snapshot: one .snapshot-cell per spot of the bounding box of the towers (BoardRules.getBounds, the
     * main board's own coordinates, so negative ones too), row by row, each holding its tower (createTowerDiv, sized by the
     * snapshot's --cell-size) or a faint dot. The turn's spots (placements) get .changed-snapshot-cell, a gold ring. Built
     * from the notification's args alone, so a reload and a
     * replay draw the same. A turn logged before board_snapshot existed shows its own towers only
     */
    private getBoardSnapshotHTML(player_id: number, placements: NexoPlacement[], boardSnapshot?: string): string {
        const towers = new Map<string, { discColor: DiscColor, height: number }>();
        if(typeof boardSnapshot === 'string'){
            for(const cellText of boardSnapshot.split(' ')){
                const cell = cellText.match(/^(-?\d+),(-?\d+)([rb])(\d+)$/);
                if(cell)
                    towers.set(BoardRules.key(parseInt(cell[1]), parseInt(cell[2])), { discColor: cell[3] === 'b' ? 'black' : 'red', height: parseInt(cell[4]) });
            }
        } else {
            for(const placement of placements)
                towers.set(BoardRules.key(placement.x, placement.y), { discColor: this.game.getDiscColor(player_id), height: placement.height });
        }

        const changedKeys = new Set(placements.map(placement => BoardRules.key(placement.x, placement.y)));
        const spots = new Map<string, NexoSpot>();
        for(const key of [...towers.keys(), ...changedKeys]){
            const [x, y] = key.split(',').map(Number);
            spots.set(key, { x, y });
        }
        const bounds = BoardRules.getBounds(spots);
        if(!bounds)
            return '';

        let cellsHTML = '';
        for(let y = bounds.minY; y <= bounds.maxY; y++){
            for(let x = bounds.minX; x <= bounds.maxX; x++){
                const key = BoardRules.key(x, y);
                const tower = towers.get(key);
                const cellClass = 'snapshot-cell' + (tower ? '' : ' empty-snapshot-cell') + (changedKeys.has(key) ? ' changed-snapshot-cell' : '');
                const towerHTML = tower ? BoardHandler.createTowerDiv(tower.discColor, tower.height, 'snapshot-tower').outerHTML : '';
                cellsHTML += `<div class="${cellClass}">${towerHTML}</div>`;
            }
        }

        return `<div class="log-board-snapshot" style="--snapshot-columns: ${bounds.maxX - bounds.minX + 1}; --snapshot-rows: ${bounds.maxY - bounds.minY + 1}">${cellsHTML}</div>`;
    }

    //a player name the row's CSS cuts with an ellipsis (max-width), so its title shows it whole
    private getCutPlayerNameHTML(player_id: number): string {
        const nameText = (player_id === this.game.getMyPlayerID()) ? _('You') : this.game.getPlayerName(player_id);
        return this.game.divColoredPlayer(player_id, {class: 'playername', title: nameText.replace(/"/g, '&quot;')});
    }
}
