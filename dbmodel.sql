
-- ------
-- BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
-- Nexo implementation : © Doruk Kicikoglu <doruk.kicikoglu@gmail.com>
--
-- This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
-- See http://en.boardgamearena.com/#!doc/Studio for more information.
-- -----

-- This is the file where you are describing the database schema of your game
-- Basically, you just have to export from PhpMyAdmin your table structure and copy/paste
-- this export here.
-- Note that the database itself and the standard tables ("global", "stats", "gamelog" and "player") are
-- already created and must not be created here

-- Note: The database schema is created from this file when the game starts. If you modify this file,
--       you have to restart a game to see your changes in database.

-- one row per occupied spot of the invisible grid. Coordinates are unbounded integers: the first tower of the game is at
-- 0 0 and the grid grows from it in any direction. The GRID_SIZE x GRID_SIZE rule is enforced from the min and max of
-- tower_x and tower_y. y grows downwards. A tower is always a single color: player_id owns every disc of it
-- keep comments on their own lines and without semicolons: BGA splits this file into statements itself
CREATE TABLE IF NOT EXISTS `towers` (
  `tower_x` SMALLINT NOT NULL,
  `tower_y` SMALLINT NOT NULL,
  `player_id` INT UNSIGNED NOT NULL,
  `height` TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (`tower_x`, `tower_y`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- reserve: discs not on the board. passed: the player's last turn was an automatic pass, cleared when they place again
ALTER TABLE `player` ADD `reserve` TINYINT UNSIGNED NOT NULL DEFAULT 25 AFTER `player_state`;
ALTER TABLE `player` ADD `passed` ENUM('yes', 'no') NOT NULL DEFAULT 'no' AFTER `reserve`;
