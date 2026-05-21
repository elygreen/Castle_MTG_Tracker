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
import { initHistoryListener, deleteMatch } from "./history.js";

checkAuth().then(level => {
    if (!level) return;

    // Need allPlayers so history cards can colour player names correctly.
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
        getTagStyle,
        20,
        (matchId, matchData) => {
            // Show confirmation modal
            const dateStr = matchData.timestamp
                ? matchData.timestamp.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'this match';
            const names = matchData.participants.map(p => p.player).join(', ');

            document.getElementById('deleteModalDate').textContent   = dateStr;
            document.getElementById('deleteModalPlayers').textContent = names;
            document.getElementById('deleteModal').classList.add('active');

            document.getElementById('confirmDeleteBtn').onclick = async () => {
                document.getElementById('deleteModal').classList.remove('active');
                try {
                    await deleteMatch(db, matchId, matchData);
                } catch (err) {
                    console.error("Failed to delete match:", err);
                    alert("Error deleting match. Check the console.");
                }
            };

            document.getElementById('cancelDeleteBtn').onclick = () => {
                document.getElementById('deleteModal').classList.remove('active');
            };
        }
    );

}).catch(console.error);