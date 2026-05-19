/**
 * player_insight.js
 * Handles all Player Insight tab rendering and charts for the Castle MTG Stat Tracker.
 * Imported by app.js — do not load independently.
 *
 * External globals expected at runtime (loaded via <script> in index.html):
 *   - Chart         (chart.js)
 *   - ChartDataLabels (chartjs-plugin-datalabels)
 */

// --- MODULE STATE ---
let selectedInsightPlayer = null;
let selectedInsightDeckId = null;
let activeBarChart        = null;
let activePieChart        = null;

// Refs to app.js data — set once via initInsight()
let _getAllDecks    = null;
let _getAllPlayers  = null;
let _getPlayerColor = null;
let _getTagStyle    = null;
let _BRACKET_COLORS = null;
let _formatBracket  = null;
let _getColorPips   = null;

export function getSelectedInsightPlayer() { return selectedInsightPlayer; }

/**
 * Wire up the module with the live data accessors it needs from app.js.
 * Call this once, before the insight tab can be used.
 *
 * @param {Object} deps
 * @param {() => Object[]}          deps.getAllDecks
 * @param {() => Object[]}          deps.getAllPlayers
 * @param {(name: string) => string} deps.getPlayerColor
 * @param {(tag: string)  => string} deps.getTagStyle
 * @param {Object}                  deps.BRACKET_COLORS
 * @param {(val) => string}         deps.formatBracket
 * @param {(identity: string[]) => string} deps.getColorPips
 */
export function initInsight(deps) {
    _getAllDecks    = deps.getAllDecks;
    _getAllPlayers  = deps.getAllPlayers;
    _getPlayerColor = deps.getPlayerColor;
    _getTagStyle    = deps.getTagStyle;
    _BRACKET_COLORS = deps.BRACKET_COLORS;
    _formatBracket  = deps.formatBracket;
    _getColorPips   = deps.getColorPips;

    // Back button
    document.getElementById('backToPlayersBtn').onclick = () => {
        selectedInsightPlayer = null;
        renderInsightTab();
    };

    // Expose select handler for inline onclick attributes in rendered HTML
    window.selectInsightPlayer = (name) => {
        selectedInsightPlayer = name;
        renderInsightTab();
    };

    window.selectInsightDeck = (deckId) => {
        selectedInsightDeckId = selectedInsightDeckId === deckId ? null : deckId;
        const allDecks = _getAllDecks();
        const playerDecks = allDecks.filter(d => d.player === selectedInsightPlayer);
        initBarChart(playerDecks, document.getElementById('insightStatSelect')?.value || 'games');
    };
}

/**
 * Re-renders the insight tab. Call whenever the active player changes
 * or the underlying deck data is refreshed.
 */
export function renderInsightTab() {
    const playerListContainer = document.getElementById('insightPlayerList');
    const detailContainer     = document.getElementById('insightDetailView');
    const slider              = document.getElementById('insightSlider');
    const backBtn             = document.getElementById('backToPlayersBtn');
    const title               = document.getElementById('insightTitle');

    const allPlayers = _getAllPlayers();
    const allDecks   = _getAllDecks();

    // Always rebuild the player grid (left slide)
    playerListContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; margin-top: 20px;">
            ${allPlayers.map(p => `
                <button class="roster-tab-btn"
                        style="background-color: ${p.color}; border-color: ${p.color}; text-align: center; height: 80px;"
                        onclick="selectInsightPlayer('${p.name}')">
                    ${p.name}
                </button>
            `).join('')}
        </div>`;

    if (!selectedInsightPlayer) {
        selectedInsightDeckId = null;
        backBtn.style.display = 'none';
        title.textContent = "Select a Player";
        slider.classList.remove('show-detail');
        setTimeout(() => {
            if (!selectedInsightPlayer) detailContainer.innerHTML = '';
        }, 500);
        return;
    }

    // --- Detail view ---
    backBtn.style.display = 'block';
    title.textContent = '';
    slider.classList.add('show-detail');

    const playerDecks = allDecks.filter(d => d.player === selectedInsightPlayer);

    // Aggregate totals across all of the player's decks
    const playerStats = playerDecks.reduce((acc, d) => ({
        games: acc.games + (d.gamesPlayed || ((d.wins || 0) + (d.losses || 0)) || 0),
        blood: acc.blood + (d.firstBloodCount  || 0),
        ramp:  acc.ramp  + (d.mostRampCount    || 0),
        draw:  acc.draw  + (d.mostDrawCount    || 0),
        first: acc.first + (d.wentFirstCount   || 0),
        last:  acc.last  + (d.wentLastCount    || 0),
    }), { games: 0, blood: 0, ramp: 0, draw: 0, first: 0, last: 0 });

    const playerColor = _getPlayerColor(selectedInsightPlayer);

    detailContainer.innerHTML = `
        <div class="card" style="margin-bottom: 25px; padding: 25px; border-left: 5px solid ${playerColor}; background: linear-gradient(90deg, var(--surface) 0%, rgba(0,0,0,0.2) 100%);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
                <div>
                    <h1 style="margin: 0; font-size: 2.5rem; font-weight: 900; color: ${playerColor}; text-transform: uppercase; letter-spacing: -1px;">${selectedInsightPlayer}</h1>
                    <p style="margin: 0; color: var(--text-dim); font-weight: 800; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;">Overall Performance</p>
                </div>
            </div>
            <div class="stat-badges" style="margin-top: 20px; background: rgba(0,0,0,0.3); padding: 15px; gap: 10px;">
                <div class="stat-badge-pill pill-blood">FIRST BLOOD <b>${playerStats.blood}</b></div>
                <div class="stat-badge-pill pill-ramp">MOST RAMP <b>${playerStats.ramp}</b></div>
                <div class="stat-badge-pill pill-draw">MOST DRAW <b>${playerStats.draw}</b></div>
                <div class="stat-badge-pill pill-first">WENT FIRST <b>${playerStats.first}</b></div>
                <div class="stat-badge-pill pill-last">WENT LAST <b>${playerStats.last}</b></div>
            </div>
        </div>

        <div class="insight-grid">
            <div id="insightDeckList" style="display: flex; flex-direction: column; gap: 15px;">
                ${playerDecks.map(deck => {
                    const total  = deck.gamesPlayed || ((deck.wins || 0) + (deck.losses || 0)) || 0;
                    const bgArt  = deck.commanderImage ? `url(${deck.commanderImage})` : 'none';
                    const calcPct = (val) => total > 0 ? ` (${((val / total) * 100).toFixed(0)}%)` : ' (0%)';
                    return `
                        <div class="deck-card ${deck.id === selectedInsightDeckId ? 'selected' : ''}"
                             onclick="selectInsightDeck('${deck.id}')"
                             style="--commander-art: ${bgArt}; cursor: pointer;">
                            <div class="deck-header">
                                <div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <h3 style="margin:0; font-size:1.5rem; display: flex; align-items: center;">
                                            ${deck.deckName}
                                            <span style="font-size: 1.0rem; color: white; background: ${_BRACKET_COLORS[deck.bracket] || 'var(--accent)'}; padding: 1px 5px; border-radius: 4px; margin-left: 8px;">
                                                ${_formatBracket(deck.bracket)}
                                            </span>
                                            <span style="margin-left: 10px; font-size: 1.2rem; letter-spacing: -3px;">
                                                ${_getColorPips(deck.colorIdentity)}
                                            </span>
                                        </h3>
                                        <div class="player-controls">
                                            <button class="player-edit-btn" onclick="event.stopPropagation(); handleEditDeckSettingsTrigger('${deck.id}')">✏️</button>
                                        </div>
                                    </div>
                                    <div class="deck-tags-grid" style="margin-top: 5px;">
                                        ${(deck.deckTags || []).map(t => `<span class="individual-tag" style="${_getTagStyle(t)}">${t}</span>`).join('')}
                                    </div>
                                </div>
                            </div>
                            <div class="stat-badges">
                                <div class="stat-badge-pill" style="background:rgba(255,255,255,0.1);">GAMES <b>${total}</b></div>
                                <div class="stat-badge-pill pill-blood">BLOOD <b>${deck.firstBloodCount || 0}${calcPct(deck.firstBloodCount)}</b></div>
                                <div class="stat-badge-pill pill-ramp">RAMP <b>${deck.mostRampCount || 0}${calcPct(deck.mostRampCount)}</b></div>
                                <div class="stat-badge-pill pill-draw">MOST DRAW <b>${deck.mostDrawCount || 0}${calcPct(deck.mostDrawCount)}</b></div>
                                <div class="stat-badge-pill pill-first">1ST <b>${deck.wentFirstCount || 0}${calcPct(deck.wentFirstCount)}</b></div>
                                <div class="stat-badge-pill pill-last">LAST <b>${deck.wentLastCount || 0}${calcPct(deck.wentLastCount)}</b></div>
                            </div>
                        </div>`;
                }).join('')}
            </div>

            <div class="insight-stats-card">
                <div class="pie-chart-container" style="margin-bottom: 30px; border-bottom: 1px solid var(--border); padding-bottom: 20px;">
                    <label style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; display:block; margin-bottom:10px; text-align:center;">Color Preference</label>
                    <div style="height: 180px; position: relative;"><canvas id="colorPieChart"></canvas></div>
                </div>
                <div class="chart-controls">
                    <select id="insightStatSelect" style="margin:0;">
                        <option value="games">Total Games played</option>
                    </select>
                </div>
                <canvas id="insightChart"></canvas>
            </div>
        </div>`;

    // Init charts after DOM is rendered
    const currentStat = document.getElementById('insightStatSelect').value;
    initBarChart(playerDecks, currentStat);
    initPieChart(playerDecks);
    document.getElementById('insightStatSelect').onchange = (e) => initBarChart(playerDecks, e.target.value);
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function initBarChart(decks, stat = 'games') {
    const canvas = document.getElementById('insightChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (activeBarChart) {
        activeBarChart.destroy();
        activeBarChart = null;
    }

    const sortedDecks = [...decks].sort((a, b) => {
        const valA = a.gamesPlayed || ((a.wins || 0) + (a.losses || 0)) || 0;
        const valB = b.gamesPlayed || ((b.wins || 0) + (b.losses || 0)) || 0;
        return valB - valA;
    });

    const dataLabels = sortedDecks.map(d => d.deckName);
    const dataValues = sortedDecks.map(d => d.gamesPlayed || ((d.wins || 0) + (d.losses || 0)) || 0);

    const PALETTE = ["#3d85ff", "#ff4444", "#4caf50", "#ffeb3b", "#9c27b0", "#ff9800", "#00bcd4", "#e91e63"];
    const backgroundColors = sortedDecks.map((d, i) => {
        const base = PALETTE[i % PALETTE.length];
        return selectedInsightDeckId === null
            ? base + "cc"
            : (d.id === selectedInsightDeckId ? base : base + "22");
    });

    const calculatedHeight = (sortedDecks.length * 35) + 100;
    canvas.style.height = `${calculatedHeight}px`;

    activeBarChart = new Chart(ctx, {
        type: 'bar',
        plugins: [ChartDataLabels],
        data: {
            labels: dataLabels,
            datasets: [{
                data: dataValues,
                backgroundColor: backgroundColors,
                borderWidth: 0,
                borderRadius: 4,
                barPercentage: 0.5,
                categoryPercentage: 0.8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 750, easing: 'easeInOutQuart' },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#8e9297' }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: (context) => {
                            const deckId = sortedDecks[context.index]?.id;
                            return deckId === selectedInsightDeckId ? '#ffffff' : '#8e9297';
                        },
                        font: { weight: 'bold', size: 11 }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: 'rgba(0,0,0,0.8)' },
                datalabels: {
                    color: '#ffffff',
                    anchor: 'end',
                    align: 'right',
                    offset: 5,
                    font: { weight: 'bold', size: 11 },
                    formatter: (value) => value
                }
            }
        }
    });
}

function initPieChart(decks) {
    const canvas = document.getElementById('colorPieChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (activePieChart) {
        activePieChart.destroy();
        activePieChart = null;
    }

    // Weighted color distribution (colorless excluded)
    const colorTotals = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    decks.forEach(deck => {
        const colors = deck.colorIdentity || [];
        if (colors.length > 0) {
            const weight = 1 / colors.length;
            colors.forEach(c => {
                if (Object.prototype.hasOwnProperty.call(colorTotals, c)) {
                    colorTotals[c] += weight;
                }
            });
        }
    });

    const colorMap = {
        W: { label: 'White', color: '#f8f1d1' },
        U: { label: 'Blue',  color: '#007dddff' },
        B: { label: 'Black', color: '#0f0801ff' },
        R: { label: 'Red',   color: '#ca0912ff' },
        G: { label: 'Green', color: '#049931ff' }
    };

    const labels    = [];
    const data      = [];
    const bgColors  = [];

    Object.keys(colorTotals).forEach(key => {
        if (colorTotals[key] > 0) {
            labels.push(colorMap[key].label);
            data.push(parseFloat(colorTotals[key].toFixed(2)));
            bgColors.push(colorMap[key].color);
        }
    });

    if (data.length === 0) return;

    activePieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: bgColors,
                borderWidth: 1,
                borderColor: 'var(--surface)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#8e9297', font: { size: 10, weight: 'bold' }, padding: 15 }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            return `${((value / total) * 100).toFixed(1)}%`;
                        }
                    }
                }
            }
        }
    });
}