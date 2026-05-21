/**
 * database_page.js
 * Entry point for database.html — the Database management page.
 */

import {
    db, checkAuth,
    getAllPlayers, getAllDecks, setAllPlayers, setAllDecks,
    getPlayerColor, getTagStyle, getColorPips, formatBracket,
    openModal, closeModal, renderColorGrid,
    MODERN_COLORS, BRACKET_COLORS, TAG_COLORS,
    initAuthButton,
} from "./shared.js";

import { initDatabase, updateRosterView } from "./database.js";
import { initStandingsListener } from "./standings.js";

initAuthButton();
checkAuth(true).then(level => {
    if (!level) return;

    initDatabase(
        {
            db,
            getAllDecks,
            getAllPlayers,
            getTagStyle,
            openModal,
            closeModal,
            renderColorGrid,
            MODERN_COLORS,
            TAG_COLORS,
            BRACKET_COLORS,
            formatBracket,
            getColorPips,
        },
        {
            onPlayersUpdated:     (players) => { setAllPlayers(players); },
            onAfterPlayersRender: () => { if (updateRosterView) updateRosterView(); },
        }
    );

    // Need decks for the roster view and delete/merge logic.
    initStandingsListener(
        db,
        document.createElement('ul'),  // no standings UI on this page
        document.createElement('div'),
        BRACKET_COLORS,
        formatBracket,
        getColorPips,
        getPlayerColor,
        getTagStyle,
        {
            onDecksUpdated: (decks) => {
                setAllDecks(decks);
                updateRosterView();
            },
        }
    );

}).catch(console.error);