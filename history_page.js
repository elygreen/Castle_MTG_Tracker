/**
 * history_page.js
 * Entry point for history.html — the Match History page.
 */

import {
    db, checkAuth,
    getAllPlayers, setAllPlayers,
    getPlayerColor, getTagStyle,
    MODERN_COLORS,
} from "./shared.js";

import { initDatabase } from "./database.js";
import { initHistoryListener } from "./history.js";

checkAuth().then(level => {
    if (!level) return;

    // Need allPlayers so history cards can colour player names correctly.
    // Init database purely for its players snapshot side-effect.
    initDatabase(
        {
            db,
            getAllDecks:      () => [],
            getAllPlayers,
            getTagStyle,
            openModal:        () => {},
            closeModal:       () => {},
            renderColorGrid:  () => {},
            MODERN_COLORS,
        },
        { onPlayersUpdated: (players) => setAllPlayers(players) }
    );

    initHistoryListener(
        db,
        document.getElementById('matchHistoryList'),
        getPlayerColor,
        getTagStyle
    );

}).catch(console.error);
