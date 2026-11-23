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

    //the game ends: two centred lines between two icons at the row's edges. A win: [trophy] winner's name / "wins 13-9"
    //[trophy], its row a light marble with the winner's accent bar. A draw (both at the top score): [handshake] "Draw" /
    //"11-11" [handshake], its row (game-end-draw-log) a marble going from light to dark grey. The winner's own name even on
    //their page (no "You", so "wins" always fits). The loser's score is loser_score; a game ended before it existed (an old
    //replay) takes it from the notification's endGameScoring, else the loser's score counter (already their final largest
    //group: passes never change it), so the row still reads "13-9". The trailing &nbsp; every row ends with is in a hidden span
    //here: as plain text it took a line of its own under the two lines, which then sat at the top of a taller row
    public createLogGameEnd(winner_ids: number[], winningScore: number, endResult?: 'win' | 'draw', loserScore?: number, endScores?: Record<number, number>): LogRowData {
        const isDraw = (endResult ?? (winner_ids.length > 1 ? 'draw' : 'win')) === 'draw';
        if(isDraw)
            loserScore = winningScore;
        else if(loserScore === undefined || loserScore === null){
            const loserID = Object.keys(this.game.players).map(Number).find(player_id => !winner_ids.map(Number).includes(player_id));
            loserScore = endScores?.[loserID] ?? this.game.players[loserID]?.getScore();
        }

        const scoreText = `${winningScore}${(loserScore === undefined || loserScore === null) ? '' : '-' + loserScore}`;

        //line 1: "Draw", or "name wins" as one string (other languages may put the name elsewhere). The words around the name
        //keep their spaces (white-space: pre) and never shrink: only a long name is cut with an ellipsis
        let titleHTML = `<span class="nexo-log-result-text nexo-log-result-draw">${_('Draw')}</span>`;
        if(!isDraw){
            const [beforeName, afterName] = _('${player_name} wins').split('${player_name}');
            titleHTML = `<span class="nexo-log-result-text">${beforeName ?? ''}</span>${this.game.divColoredPlayer(winner_ids[0], {class: 'playername'}, false)}<span class="nexo-log-result-text">${afterName ?? ''}</span>`;
        }
        const iconHTML = `<i class="fa ${isDraw ? 'fa-handshake-o' : 'fa-trophy'} nexo-log-result-icon" aria-hidden="true"></i>`;

        let logHTML = `
            <div class="game-end-row nexo-log-result">
                ${iconHTML}
                <div class="nexo-log-result-lines">
                    <div class="nexo-log-result-title">${titleHTML}</div>
                    <div class="nexo-log-result-score">${scoreText}</div>
                </div>
                ${iconHTML}
            </div>` + (isDraw ? '<div log-class-tag="game-end-draw-log"></div>' : this.getDiscColorTag(winner_ids[0])) + '<span class="nexo-log-result-spacer"> &nbsp;</span>';

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
                const towerHTML = tower ? BoardHandler.createTowerDiv(tower.discColor, tower.height, { x: x, y: y }, 'snapshot-tower').outerHTML : '';
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
