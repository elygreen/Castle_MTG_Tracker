// Import Firebase functions from the web (No installation needed)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, increment } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDAT1UIM1mFMH1vh_Wal4SqXOY6NSr0_6c",
  authDomain: "castle-mtg-stat-tracker.firebaseapp.com",
  projectId: "castle-mtg-stat-tracker",
  storageBucket: "castle-mtg-stat-tracker.firebasestorage.app",
  messagingSenderId: "503581755862",
  appId: "1:503581755862:web:10222b71ae270b6ca03c77",
  measurementId: "G-XP3BG4VB6S"
};

// ----------------------------------------

// Initialize
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const deckList = document.getElementById('deckList');
const loading = document.getElementById('loading');

// 1. ADD DATA (Create a Deck)
document.getElementById('addBtn').addEventListener('click', async () => {
    const player = document.getElementById('playerName').value;
    const deck = document.getElementById('deckName').value;

    if (!player || !deck) return alert("Please enter both names!");

    try {
        await addDoc(collection(db, "decks"), {
            player: player,
            deckName: deck,
            wins: 0,
            losses: 0,
            createdAt: new Date()
        });
        document.getElementById('playerName').value = '';
        document.getElementById('deckName').value = '';
    } catch (e) {
        console.error("Error adding deck: ", e);
        alert("Could not save data. Check console.");
    }
});

// 2. READ DATA (Real-time Listener)
// This runs automatically whenever the database changes
const q = collection(db, "decks");
onSnapshot(q, (snapshot) => {
    loading.style.display = 'none';
    deckList.innerHTML = ''; // Clear list to prevent duplicates
    
    snapshot.forEach((doc) => {
        const data = doc.data();
        const li = document.createElement('li');
        li.className = 'deck-card';
        
        // Calculate Win Rate
        const total = data.wins + data.losses;
        const rate = total === 0 ? 0 : Math.round((data.wins / total) * 100);

        li.innerHTML = `
            <div class="deck-info">
                <h3>${data.deckName}</h3>
                <p>Owner: ${data.player}</p>
                <p><strong>${data.wins}W - ${data.losses}L</strong> (${rate}%)</p>
            </div>
            <div class="actions">
                <button class="win-btn" data-id="${doc.id}">+ Win</button>
                <button class="loss-btn" data-id="${doc.id}">+ Loss</button>
                <button class="del-btn" data-id="${doc.id}">X</button>
            </div>
        `;
        deckList.appendChild(li);
    });
    
    // Re-attach button listeners
    attachButtonListeners();
});

// 3. UPDATE & DELETE Logic
function attachButtonListeners() {
    document.querySelectorAll('.win-btn').forEach(btn => {
        btn.addEventListener('click', (e) => updateStats(e.target.dataset.id, 'wins'));
    });
    document.querySelectorAll('.loss-btn').forEach(btn => {
        btn.addEventListener('click', (e) => updateStats(e.target.dataset.id, 'losses'));
    });
    document.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteDeck(e.target.dataset.id));
    });
}

async function updateStats(id, field) {
    const ref = doc(db, "decks", id);
    await updateDoc(ref, {
        [field]: increment(1)
    });
}

async function deleteDeck(id) {
    if(confirm("Delete this deck?")) {
        await deleteDoc(doc(db, "decks", id));
    }
}