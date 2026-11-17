<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * material.inc.php
 *
 * Nexo game material description
 *
 * Here, you can describe the material of your game with PHP variables.
 *
 * This file is loaded in your game logic class constructor, ie these variables
 * are available everywhere in your game logic code.
 *
 */

if (!defined('GRID_SIZE')) { // guard since this included multiple times
    define("GRID_SIZE", 5); //the invisible grid is GRID_SIZE x GRID_SIZE: a tower may not create a 6th row or a 6th column
    define("DISCS_PER_PLAYER", 25); //each player's starting reserve
    define("MIN_TOWER_HEIGHT", 1);
    define("MAX_TOWER_HEIGHT", 5);
    define("MIN_DISCS_PER_TURN", 1);
    define("MAX_DISCS_PER_TURN", 5);
    define("PASSES_TO_END_GAME", 2); //the game ends when both players pass consecutively

    //player colors (gameinfos.jsonc player_colors, same order): the BGA color decides the disc color. Red starts
    define("DISC_COLOR_BY_PLAYER_COLOR", ['ff0000' => 'red', '000000' => 'black']);
    define("FIRST_DISC_COLOR", 'red');

    //a placement in a turn: a new tower on an empty spot, or one replacing an enemy tower
    define("PLACEMENT_NEW", 'new');
    define("PLACEMENT_REPLACE", 'replace');
}
