// Beer Journal — Offline Beer Tracker 🍺

document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  initRatingToggle();
  initFavToggle();
});

// -------- IndexedDB --------
let db;
const DB_NAME = "beer-journal";
const DB_VERSION = 1;

const dbReq = indexedDB.open(DB_NAME, DB_VERSION);
dbReq.onupgradeneeded = (e) => {
  const d = e.target.result;
  if (!d.objectStoreNames.contains("beers")) {
    d.createObjectStore("beers", { keyPath: "id", autoIncrement: true });
  }
};
dbReq.onsuccess = async (e) => {
  db = e.target.result;
  await Promise.all([renderStats(), renderHistory(), renderFavourites()]);
};
dbReq.onerror = (e) => console.error("DB error:", e.target.error);

const dbAll = (store) =>
  new Promise((res, rej) => {
    const tx = db.transaction(store);
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });

const dbAdd = (store, data) =>
  new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).add(data);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });

const dbUpdate = (store, id, patch) =>
  new Promise(async (res, rej) => {
    const tx = db.transaction(store, "readwrite");
    const storeObj = tx.objectStore(store);
    const getReq = storeObj.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      storeObj.put({ ...existing, ...patch });
    };
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });

const dbDelete = (store, id) =>
  new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });

// -------- Menu --------
function initMenu() {
  const sheet = document.getElementById("sheet");
  const menuBtn = document.getElementById("menuBtn");
  menuBtn.addEventListener("click", (e) => {
    e.preventDefault();
    sheet.classList.toggle("hidden");
  });
  sheet.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (btn) {
      switchView(btn.dataset.view);
      sheet.classList.add("hidden");
    }
  });
}

function switchView(name) {
  document.querySelectorAll("main > section").forEach(s => s.classList.add("hidden"));
  document.getElementById(`view-${name}`)?.classList.remove("hidden");
}

// -------- Rating Toggle --------
function initRatingToggle() {
  const buttons = document.querySelectorAll("#rating-toggle button");
  const input = document.getElementById("rating-value");
  buttons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const rating = Number(btn.dataset.value);
      input.value = rating;
      
      // Update all stars: fill up to selected, empty the rest
      buttons.forEach((b, idx) => {
        const starValue = Number(b.dataset.value);
        b.textContent = starValue <= rating ? "★" : "☆";
        b.classList.toggle("active", starValue === rating);
      });
    });
  });
}

// -------- Favourite Toggle (in form) --------
function initFavToggle() {
  const favBtn = document.getElementById("favToggle");
  favBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const pressed = favBtn.getAttribute("aria-pressed") === "true";
    favBtn.setAttribute("aria-pressed", String(!pressed));
    favBtn.textContent = pressed ? "♡" : "♥";
  });
}

// -------- Add Beer --------
document.getElementById("beer-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  const type = document.getElementById("type").value.trim();
  const price = Number(document.getElementById("price").value) || 0;
  const rating = Number(document.getElementById("rating-value").value) || 0;
  const note = document.getElementById("note").value.trim();
  const fav = document.getElementById("favToggle").getAttribute("aria-pressed") === "true";

  if (!name || !type) return;

  await dbAdd("beers", { name, type, price, rating, note, fav, ts: Date.now() });

  e.target.reset();
  document.getElementById("rating-value").value = 0;
  document.querySelectorAll("#rating-toggle button").forEach(b => {
    b.textContent = "☆";
    b.classList.remove("active");
  });
  document.getElementById("favToggle").setAttribute("aria-pressed", "false");
  document.getElementById("favToggle").textContent = "♡";

  await Promise.all([renderStats(), renderHistory(), renderFavourites()]);
  switchView("stats");
});

// -------- Stats --------
async function renderStats() {
  const beers = await dbAll("beers");
  const total = beers.length;
  const spent = beers.reduce((sum, b) => sum + (b.price || 0), 0);
  const avgRating = total ? (beers.reduce((s, b) => s + (b.rating || 0), 0) / total).toFixed(1) : 0;

  const freq = (key) => {
    const map = new Map();
    for (const b of beers) map.set(b[key], (map.get(b[key]) || 0) + 1);
    let max = [null, 0];
    for (const [k, v] of map) if (v > max[1]) max = [k, v];
    return max[0] || "—";
  };

  document.getElementById("stats").innerHTML = `
    <div class="card"><strong>Total beers</strong><div>${total}</div></div>
    <div class="card"><strong>Total spent</strong><div>€ ${spent.toFixed(2)}</div></div>
    <div class="card"><strong>Average rating</strong><div>${avgRating}</div></div>
    <div class="card"><strong>Most common type</strong><div>${escapeHtml(freq("type"))}</div></div>
    <div class="card"><strong>Top beer</strong><div>${escapeHtml(freq("name"))}</div></div>
  `;
}

// -------- History --------
async function renderHistory() {
  const tbody = document.querySelector("#history tbody");
  const beers = (await dbAll("beers")).sort((a, b) => b.ts - a.ts);
  tbody.innerHTML = beers.map(b => `
    <tr data-id="${b.id}">
      <td>${new Date(b.ts).toLocaleString()}</td>
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.type)}</td>
      <td>${b.price.toFixed(2)}</td>
      <td>${b.rating}</td>
      <td>${escapeHtml(b.note || "")}</td>
      <td>${b.fav ? "♥" : "♡"}</td>
      <td>
        <button class="btn-ghost edit">Edit</button>
        <button class="btn-del" data-del>Delete</button>
      </td>
    </tr>
  `).join("");
}

// Edit/Delete handlers
document.querySelector("#history tbody")?.addEventListener("click", async (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const id = Number(tr.dataset.id);

  if (e.target.dataset.del !== undefined) {
    await dbDelete("beers", id);
    await Promise.all([renderStats(), renderHistory(), renderFavourites()]);
    return;
  }

  if (e.target.classList.contains("edit")) {
    const beers = await dbAll("beers");
    const beer = beers.find(b => b.id === id);
    if (!beer) return;
    tr.innerHTML = editRowHtml(beer);
  }

  if (e.target.classList.contains("save")) {
    const inputs = tr.querySelectorAll("input");
    const [name, type, priceStr, ratingStr, note] = Array.from(inputs).map(i => i.value);
    const fav = tr.querySelector(".fav-check").checked;
    const patch = {
      name: name.trim(),
      type: type.trim(),
      price: Number(priceStr),
      rating: Number(ratingStr),
      note: note.trim(),
      fav
    };
    await dbUpdate("beers", id, patch);
    await Promise.all([renderStats(), renderHistory(), renderFavourites()]);
  }

  if (e.target.classList.contains("cancel")) {
    await renderHistory();
  }
});

function editRowHtml(b) {
  return `
    <td>${new Date(b.ts).toLocaleString()}</td>
    <td><input value="${attr(b.name)}"></td>
    <td><input value="${attr(b.type)}"></td>
    <td><input type="number" step="0.01" min="0" value="${b.price.toFixed(2)}"></td>
    <td><input type="number" step="1" min="1" max="5" value="${b.rating}"></td>
    <td><input value="${attr(b.note || "")}"></td>
    <td><input type="checkbox" class="fav-check" ${b.fav ? "checked" : ""}></td>
    <td>
      <button class="btn save">Save</button>
      <button class="btn-ghost cancel">Cancel</button>
    </td>
  `;
}

// -------- Favourites --------
async function renderFavourites() {
  const list = document.getElementById("fav-list");
  const beers = (await dbAll("beers")).filter(b => b.fav);
  if (beers.length === 0) {
    list.innerHTML = "<p>No favourites yet 🍺</p>";
    return;
  }
  list.innerHTML = beers.map(b => `
    <div class="card">
      <strong>${escapeHtml(b.name)}</strong><br>
      <span class="badge">${escapeHtml(b.type)}</span><br>
      Rating: ${b.rating}/5<br>
      ${b.price ? `€${b.price.toFixed(2)}` : ""}
    </div>
  `).join("");
}

// -------- Utilities --------
const HTML_ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => HTML_ESCAPE[c]); }
function attr(s) { return escapeHtml(s); }

// -------- Service Worker --------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" });
}