/**
 * standings_page.js
 * Entry point for standings.html — the Leaderboard page.
 */

import {
    db, checkAuth,
    getAllPlayers, getAllDecks, setAllPlayers, setAllDecks,
    getPlayerColor, getTagStyle, getColorPips, formatBracket,
    MODERN_COLORS, BRACKET_COLORS,
} from "./shared.js";

import { initDatabase } from "./database.js";
import { initStandingsListener } from "./standings.js";

checkAuth().then(level => {
    if (!level) return;

    // Need allPlayers so getPlayerColor works for deck owner labels.
    initDatabase(
        {
            db,
            getAllDecks,
            getAllPlayers,
            getTagStyle,
            openModal:        () => {},
            closeModal:       () => {},
            renderColorGrid:  () => {},
            MODERN_COLORS,
        },
        { onPlayersUpdated: (players) => setAllPlayers(players) }
    );

    initStandingsListener(
        db,
        document.getElementById('deckList'),
        document.getElementById('loading'),
        BRACKET_COLORS,
        formatBracket,
        getColorPips,
        getPlayerColor,
        getTagStyle,
        { onDecksUpdated: (decks) => setAllDecks(decks) }
    );

}).catch(console.error);
