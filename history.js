/**
 * history.js
 * Handles all match history rendering for the Castle MTG Stat Tracker.
 * Imported by app.js — do not load independently.
 */

import {
    getFirestore, collection, query, orderBy, limit, onSnapshot,
    doc, deleteDoc, writeBatch, increment, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Builds a single history card DOM element for one match document.
 *
 * @param {Object} match        - Firestore document data
 * @param {string} matchId      - Firestore document ID
 * @param {Function} getPlayerColor - (playerName: string) => cssColor
 * @param {Function} getTagStyle    - (tag: string) => inlineStyleString
 * @returns {HTMLElement}
 */
export function buildHistoryCard(match, matchId, getPlayerColor, getTagStyle) {
    const dateStr = match.timestamp
        ? match.timestamp.toDate().toLocaleString([], {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : 'Just now';

    const card = document.createElement('div');
    card.className = 'history-card';
    card.dataset.matchId = matchId;

    card.innerHTML = `
        <div class="history-header">
            <div class="history-date">${dateStr}</div>
            <div style="display:flex; gap:10px; align-items:center;">
                <div class="history-date">${match.participants.length} Players</div>
                <button class="history-delete-btn" data-match-id="${matchId}" title="Delete match" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:0.75rem; font-weight:800; padding:2px 6px; border-radius:4px; transition:background 0.15s ease;">✕ Delete</button>
            </div>
        </div>
        <div class="history-body">
            ${match.participants.map(p => `
                <div class="history-participant">
                    <div class="history-deck-info">
                        <span class="history-player-name" style="color:${getPlayerColor(p.player)}">${p.player}</span>
                        <span class="history-deck-name">${p.deckName}</span>
                        <div class="deck-tags-grid">
                            ${(p.deckTags || []).map(t =>
                                `<span class="individual-tag" style="${getTagStyle(t)}">${t}</span>`
                            ).join('')}
                        </div>
                    </div>
                    <div class="history-stats">
                        ${p.funRating > 0  ? (() => {
                            const enjoyColors = [null,'#c0392b','#d44e1f','#e06b1a','#d4842a','#b89e30','#8fb335','#62c040','#36cc50','#18d464','#10d275'];
                            const c = enjoyColors[p.funRating] || '#888';
                            return `<div class="stat-badge-pill" style="background:${c}22; color:${c}; border:1px solid ${c}44;">ENJOYMENT ★ <b>${p.funRating}</b></div>`;
                        })() : ''}
                        ${p.sol            ? `<div class="stat-badge-pill pill-sol">SOL RING</div>`          : ''}
                        ${p.mulligan       ? `<div class="stat-badge-pill pill-mulligan">2+ MULLIGANS</div>` : ''}
                        ${p.snapkeep       ? `<div class="stat-badge-pill pill-snapkeep">SNAP KEEP</div>`    : ''}
                        ${p.blood          ? `<div class="stat-badge-pill pill-blood">FIRST BLOOD</div>`     : ''}
                        ${p.ramp           ? `<div class="stat-badge-pill pill-ramp">MOST RAMP</div>`        : ''}
                        ${p.draw           ? `<div class="stat-badge-pill pill-draw">MOST DRAW</div>`        : ''}
                        ${p.first          ? `<div class="stat-badge-pill pill-first">1ST</div>`             : ''}
                        ${p.last           ? `<div class="stat-badge-pill pill-last">LAST</div>`             : ''}
                        ${p.interaction    ? `<div class="stat-badge-pill pill-interaction">MOST INTERACTION</div>` : ''}
                        ${p.archenemy      ? `<div class="stat-badge-pill pill-archenemy">ARCH ENEMY</div>`  : ''}
                        ${p.takenout       ? `<div class="stat-badge-pill pill-takenout">TAKEN OUT FIRST</div>` : ''}
                    </div>
                </div>
            `).join('')}

            ${match.comment ? `
                <div class="history-comment-box">
                    <span class="history-comment-label">Match Notes</span>
                    <div class="history-comment-text">"${match.comment}"</div>
                </div>
            ` : ''}

            ${match.legendaryPlay ? `
                <div class="history-comment-box">
                    <span class="history-comment-label">⚡ Legendary Play</span>
                    <div class="history-comment-text">"${match.legendaryPlay}"</div>
                </div>
            ` : ''}
        </div>
    `;

    return card;
}

/**
 * Subscribes to the matches collection and keeps the history list in sync.
 * Returns the unsubscribe function so the caller can clean up if needed.
 *
 * @param {import("firebase/firestore").Firestore} db
 * @param {HTMLElement}  historyListEl   - The container element (#matchHistoryList)
 * @param {Function}     getPlayerColor
 * @param {Function}     getTagStyle
 * @param {number}       [maxMatches=20] - How many recent matches to show
 * @returns {Function}   Firestore unsubscribe function
 */

/**
 * Deletes a match and reverses all stat increments on the affected decks.
 *
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} matchId
 * @param {Object} matchData - The full match document data
 */
export async function deleteMatch(db, matchId, matchData) {
    const batch = writeBatch(db);

    for (const p of matchData.participants) {
        if (!p.deckId) continue;
        const deckRef = doc(db, "decks", p.deckId);

        // Verify deck still exists before trying to update
        const deckSnap = await getDoc(deckRef);
        if (!deckSnap.exists()) continue;

        const funRating = p.funRating || 0;

        batch.update(deckRef, {
            gamesPlayed:          increment(-1),
            funRatingTotal:       increment(-funRating),
            funRatingCount:       increment(funRating > 0 ? -1 : 0),
            solRingOpening:       increment(p.sol         ? -1 : 0),
            mulliganCount:        increment(p.mulligan    ? -1 : 0),
            snapKeepCount:        increment(p.snapkeep    ? -1 : 0),
            firstBloodCount:      increment(p.blood       ? -1 : 0),
            mostRampCount:        increment(p.ramp        ? -1 : 0),
            mostDrawCount:        increment(p.draw        ? -1 : 0),
            wentFirstCount:       increment(p.first       ? -1 : 0),
            wentLastCount:        increment(p.last        ? -1 : 0),
            mostInteractionCount: increment(p.interaction ? -1 : 0),
            archEnemyCount:       increment(p.archenemy   ? -1 : 0),
            takenOutFirstCount:   increment(p.takenout    ? -1 : 0),
        });
    }

    batch.delete(doc(db, "matches", matchId));
    await batch.commit();
}

export function initHistoryListener(db, historyListEl, getPlayerColor, getTagStyle, maxMatches = 20, onDeleteRequest = null) {
    const q = query(
        collection(db, "matches"),
        orderBy("timestamp", "desc"),
        limit(maxMatches)
    );

    return onSnapshot(q, (snapshot) => {
        historyListEl.innerHTML = '';
        snapshot.docs.forEach(docSnap => {
            const card = buildHistoryCard(
                docSnap.data(),
                docSnap.id,
                getPlayerColor,
                getTagStyle
            );

            // Wire up the delete button
            const deleteBtn = card.querySelector('.history-delete-btn');
            if (deleteBtn && !onDeleteRequest) { deleteBtn.style.display = 'none'; }
            if (deleteBtn && onDeleteRequest) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onDeleteRequest(docSnap.id, docSnap.data());
                });
            }

            historyListEl.appendChild(card);
        });
    });
}