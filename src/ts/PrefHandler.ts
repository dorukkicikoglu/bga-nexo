/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * PrefHandler.ts
 */
import { Game } from "./Game";

export class PrefHandler{
    //"Always show stack heights" (gamepreferences.jsonc, pref 100): the height number on top of every tower, 1 Enabled, 2 Disabled
    private static readonly STACK_HEIGHTS_DISABLED = 2;
    //"Disc style" (pref 101): 1 Wooden (img/wooden_discs.webp), 2 Marble (the CSS discs)
    private static readonly DISC_STYLE_MARBLE = 2;
    //Game.php $userPrefs, for gamedatas without pref_names: a replay starts from the gamedatas saved when its game began, so a
    //game begun before a preference existed has no pref_names (or lacks the newer ones). Keep in sync with Game.php
    private static readonly DEFAULT_PREF_NAMES: GamePrefs = {
        show_stack_heights: 100,
        disc_style: 101,
    };

    private prefNameToIndex: GamePrefs;

    constructor(private game: Game, prefNameToIndex: GamePrefs | undefined) {
        this.prefNameToIndex = { ...PrefHandler.DEFAULT_PREF_NAMES, ...prefNameToIndex };
        this.game.bga.userPreferences.onChange = (prefIndex, prefValue) => this.onGameUserPreferenceChanged(prefIndex, prefValue);

        for(const prefName in this.prefNameToIndex){
            const prefIndex = this.prefNameToIndex[prefName];
            this.onGameUserPreferenceChanged(prefIndex, this.game.bga.userPreferences.get(prefIndex), true);
        }
    }

    //on page load (isInitialLoad) the state classes haven't received their args yet, so nothing is redrawn
    private onGameUserPreferenceChanged(prefIndex: number, prefValue: number, isInitialLoad: boolean = false): void{
        switch (prefIndex) {
            case this.prefNameToIndex.show_stack_heights:
                this.applyStackHeights(prefValue);
            break;
            case this.prefNameToIndex.disc_style:
                this.applyDiscStyle(prefValue);
            break;
        }
    }

    //game specific functions

    //one class on <html>, so it reaches every tower: the board, the flying copies (in <body>) and the log rows. Any value other
    //than Disabled is Enabled (the default; also a missing value, as for a spectator with no saved preference)
    private applyStackHeights(prefValue: number): void{
        document.documentElement.classList.toggle('hide-stack-heights', prefValue == PrefHandler.STACK_HEIGHTS_DISABLED);
    }

    //one class on <html> like applyStackHeights, so every disc switches at once, wherever it is (the board, the flying copies, the
    //reserve stacks, the status bar, the log rows). Every disc always carries its wooden sprite (BoardHandler.setDiscSprite), so
    //nothing is redrawn. Any value other than Marble is Wooden (the default; also a missing value, as for a spectator with no
    //saved preference)
    private applyDiscStyle(prefValue: number): void{
        document.documentElement.classList.toggle('nexo-discs-wooden', prefValue != PrefHandler.DISC_STYLE_MARBLE);
    }

    //end game specific functions
}
