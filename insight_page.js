/**
 * insight_page.js
 * Entry point for insight.html — the Player Insight page.
 */

import {
    db, checkAuth,
    getAllPlayers, getAllDecks, setAllPlayers, setAllDecks,
    getPlayerColor, getTagStyle, getColorPips, formatBracket,
    openModal, closeModal, renderColorGrid,
    MODERN_COLORS, BRACKET_COLORS,
} from "./shared.js";

import { initDatabase } from "./database.js";
import { initStandingsListener } from "./standings.js";
import { initInsight, renderInsightTab } from "./player_insight.js";

checkAuth().then(level => {
    if (!level) return;

    // Players + decks both needed for insight rendering.
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
        },
        {
            onPlayersUpdated: (players) => {
                setAllPlayers(players);
                renderInsightTab();
            },
        }
    );

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
            onDecksUpdated: (decks) => setAllDecks(decks),
            onAfterRender:  () => renderInsightTab(),
        }
    );

    initInsight({
        getAllDecks,
        getAllPlayers,
        getPlayerColor,
        getTagStyle,
        BRACKET_COLORS,
        formatBracket,
        getColorPips,
    });

}).catch(console.error);
