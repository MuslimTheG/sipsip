// app.js — Optimized app for tracking café drinks

/* ---------- INITIALIZATION ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initSheet();
  initDrinkSelect();
  initCafeHeartToggle();
  initRatingInput();
});

// Menu sheet: toggle on button, close on item selection
function initSheet() {
  const sheet = document.getElementById("sheet");
  const menuBtn = document.getElementById("menuBtn");
  if (!sheet || !menuBtn) return;

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    sheet.classList.toggle("hidden");
  };

  menuBtn.addEventListener("click", toggle);
  sheet.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (btn) {
      switchView(btn.dataset.view);
      sheet.classList.add("hidden");
    }
  });
}

// Café input heart toggle
function initCafeHeartToggle() {
  const input = document.getElementById("cafe");
  const heart = document.getElementById("cafeFavToggle");
  if (!input || !heart) return;

  const toggle = async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (name) {
      await toggleFav("favCafes", name);
      await updateHeart("cafe");
    }
  };

  heart.addEventListener("mousedown", (e) => e.preventDefault());
  heart.addEventListener("click", toggle);
  input.addEventListener("input", () => updateHeart("cafe"));
}

// Initialize star rating widget
function initRatingInput() {
  const container = document.getElementById("rating-input");
  const input = document.getElementById("rating-value");
  if (!container || !input) return;

  const stars = container.querySelectorAll(".star");
  
  stars.forEach(star => {
    star.addEventListener("click", (e) => {
      e.preventDefault();
      const rating = Number(star.dataset.rating);
      input.value = rating;
      updateRatingDisplay(rating);
    });

    star.addEventListener("mouseenter", () => {
      const rating = Number(star.dataset.rating);
      updateRatingDisplay(rating);
    });
  });

  container.addEventListener("mouseleave", () => {
    updateRatingDisplay(Number(input.value));
  });
}

function updateRatingDisplay(rating) {
  const stars = document.querySelectorAll("#rating-input .star");
  stars.forEach((star, idx) => {
    star.textContent = (idx + 1) <= rating ? "★" : "☆";
  });
  document.getElementById("rating-input").setAttribute("aria-valuenow", rating);
}

/* ---------- SERVICE WORKER ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" });
}

/* ---------- DRINK CATALOG ---------- */
const DRINKS = [
  "Espresso", "Cappuccino", "Latte", "Americano", "Macchiato", "Mocha", "Filter Coffee"
];

/* ---------- INDEXEDDB ---------- */
let db;
const DB_NAME = "sipsip-db";
const DB_VERSION = 8;

const dbInit = indexedDB.open(DB_NAME, DB_VERSION);
dbInit.onupgradeneeded = (e) => {
  const d = e.target.result;
  ["orders", "favs", "favCafes"].forEach(name => {
    if (!d.objectStoreNames.contains(name)) {
      d.createObjectStore(name, { keyPath: "id", autoIncrement: name === "orders" });
    }
  });
};

dbInit.onsuccess = async (e) => {
  db = e.target.result;
  await Promise.all([
    updateHeart("drink"),
    updateHeart("cafe"),
    renderStats(),
    renderHistory()
  ]);
};

dbInit.onerror = (e) => console.error("DB error:", e.target.error);

// Helper: consistent IndexedDB transaction wrapper
const dbGet = (store, key, mode = "readonly") =>
  new Promise((res, rej) => {
    const req = db.transaction(store, mode).objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

const dbGetAll = (store) =>
  new Promise((res, rej) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });

/* ---------- DATA OPERATIONS ---------- */
const Orders = {
  add(data) {
    return new Promise((res, rej) => {
      const t = db.transaction("orders", "readwrite");
      t.objectStore("orders").add({ ...data, ts: Date.now() });
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  },
  all() {
    return dbGetAll("orders");
  },
  update(id, patch) {
    return new Promise((res, rej) => {
      const t = db.transaction("orders", "readwrite");
      const s = t.objectStore("orders");
      const g = s.get(id);
      g.onsuccess = () => s.put({ ...g.result, ...patch });
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  },
  delete(id) {
    return new Promise((res, rej) => {
      const t = db.transaction("orders", "readwrite");
      t.objectStore("orders").delete(id);
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  }
};

// Unified favorites handler for drinks and cafés
async function isFav(store, name) {
  if (!db) return false;
  return !!(await dbGet(store, name));
}

async function toggleFav(store, name) {
  if (!db) return;
  const exists = await isFav(store, name);
  const t = db.transaction(store, "readwrite");
  exists ? t.objectStore(store).delete(name) : t.objectStore(store).put({ id: name });
  return new Promise((res, rej) => {
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

/* ---------- Views ---------- */
function switchView(name) {
  document.querySelectorAll("main > section").forEach(sec => sec.classList.add("hidden"));
  document.getElementById(`view-${name}`)?.classList.remove("hidden");
}

/* ---------- DRINK SELECT + HEART ---------- */
function initDrinkSelect() {
  const select = document.getElementById("drink");
  if (!select) return;

  // Populate options
  select.innerHTML = DRINKS.map(d => `<option value="${d}">${d}</option>`).join("");

  // Heart toggle
  const heart = document.getElementById("drinkFavToggle");
  if (heart) {
    const toggle = async (e) => {
      e.preventDefault();
      await toggleFav("favs", select.value);
      await updateHeart("drink");
    };
    heart.addEventListener("mousedown", (e) => e.preventDefault());
    heart.addEventListener("click", toggle);
  }

  // Update on drink change
  select.addEventListener("change", () => updateHeart("drink"));
}

// Unified heart updater for both drink and café
async function updateHeart(type) {
  if (!db) return;
  
  const config = {
    drink: { el: "drink", btn: "drinkFavToggle", store: "favs" },
    cafe: { el: "cafe", btn: "cafeFavToggle", store: "favCafes" }
  };
  
  const { el, btn, store } = config[type];
  const input = document.getElementById(el);
  const heart = document.getElementById(btn);
  
  if (!input || !heart) return;
  
  const name = (el === "cafe" ? input.value.trim() : input.value) || "";
  const isFavored = name ? await isFav(store, name) : false;
  
  heart.textContent = isFavored ? "♥" : "♡";
  heart.setAttribute("aria-pressed", String(isFavored));
}

/* ---------- ORDER FORM ---------- */
document.getElementById("order-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const cafe = document.getElementById("cafe").value.trim();
  const drink = document.getElementById("drink").value;
  const price = Number(document.getElementById("price").value);
  const rating = Number(document.getElementById("rating-value").value) || 0;
  const note = document.getElementById("note").value.trim();
  
  if (!cafe || !drink || isNaN(price)) return;

  await Orders.add({ cafe, drink, price, rating, note });
  e.target.reset();
  updateRatingDisplay(0); // Reset rating display
  
  // Refresh UI
  await Promise.all([
    updateHeart("cafe"),
    updateHeart("drink"),
    renderStats(),
    renderHistory()
  ]);
  
  switchView("stats");
});

/* ---------- STATS ---------- */
async function renderStats() {
  const orders = await Orders.all();
  const total = orders.length;
  const spent = orders.reduce((s, o) => s + (Number(o.price) || 0), 0);
  const avgRating = total > 0 
    ? (orders.reduce((s, o) => s + (Number(o.rating) || 0), 0) / total).toFixed(1)
    : 0;

  // Find top item by frequency
  const getTopItem = (key) => {
    const freq = new Map();
    for (const o of orders) {
      const val = o[key]?.trim();
      if (val) freq.set(val, (freq.get(val) || 0) + 1);
    }
    let top = "—", count = 0;
    for (const [name, ct] of freq) {
      if (ct > count) { top = name; count = ct; }
    }
    return top;
  };

  document.getElementById("stats").innerHTML = `
    <div class="card"><strong>Total drinks</strong><div>${total}</div></div>
    <div class="card"><strong>Total spent</strong><div>€ ${spent.toFixed(2)}</div></div>
    <div class="card"><strong>Avg. rating</strong><div>${starsDisplay(Math.round(avgRating))}</div></div>
    <div class="card"><strong>Top café</strong><div>${escapeHtml(getTopItem("cafe"))}</div></div>
    <div class="card"><strong>Top drink</strong><div>${escapeHtml(getTopItem("drink"))}</div></div>
  `;
}

/* ---------- HISTORY TABLE ---------- */
async function renderHistory() {
  const tbody = document.querySelector("#history tbody");
  if (!tbody) return;
  
  const orders = (await Orders.all()).sort((a, b) => b.ts - a.ts);
  tbody.innerHTML = orders.map(o => 
    `<tr data-id="${o.id}">${rowHtml(o)}</tr>`
  ).join("");
}

function starsDisplay(rating) {
  const r = Number(rating) || 0;
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function rowHtml(o) {
  return `
    <td>${new Date(o.ts).toLocaleString()}</td>
    <td>${escapeHtml(o.cafe || "")}</td>
    <td>${escapeHtml(o.drink || "")}</td>
    <td>${Number(o.price).toFixed(2)}</td>
    <td class="rating">${starsDisplay(o.rating || 0)}</td>
    <td>${escapeHtml(o.note || "")}</td>
    <td>
      <button class="btn btn-ghost edit" aria-label="Edit">Edit</button>
      <button class="btn btn-del" aria-label="Delete" data-del>Delete</button>
    </td>
  `;
}

function editRowHtml(o) {
  return `
    <td>${new Date(o.ts).toLocaleString()}</td>
    <td><input value="${attr(o.cafe)}"></td>
    <td>
      <select>
        ${DRINKS.map(d => `<option ${d === o.drink ? "selected" : ""}>${d}</option>`).join("")}
      </select>
    </td>
    <td><input type="number" step="0.01" min="0" value="${attr(Number(o.price).toFixed(2))}"></td>
    <td>
      <div class="rating-edit" data-id="${o.id}">
        ${[1, 2, 3, 4, 5].map(i => `<button type="button" class="star-edit" data-rating="${i}" title="${i} star${i > 1 ? "s" : ""}">${i <= (o.rating || 0) ? "★" : "☆"}</button>`).join("")}
      </div>
    </td>
    <td><input value="${attr(o.note)}"></td>
    <td>
      <button class="btn save" aria-label="Save">Save</button>
      <button class="btn btn-ghost cancel" aria-label="Cancel">Cancel</button>
    </td>
  `;
}

document.querySelector("#history tbody")?.addEventListener("click", async (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  
  const id = Number(tr.dataset.id);
  const all = await Orders.all();
  const order = all.find(x => x.id === id);
  if (!order) return;

  // Delete
  if (e.target.closest("[data-del]")) {
    await Orders.delete(id);
    await Promise.all([renderStats(), renderHistory()]);
    return;
  }

  // Edit mode
  if (e.target.classList.contains("edit")) {
    tr.classList.add("editing");
    tr.innerHTML = editRowHtml(order);
    
    // Add rating star click handlers
    const stars = tr.querySelectorAll(".star-edit");
    stars.forEach(star => {
      star.addEventListener("click", (ev) => {
        ev.preventDefault();
        const rating = Number(star.dataset.rating);
        stars.forEach((s, idx) => {
          s.textContent = (idx + 1) <= rating ? "★" : "☆";
        });
      });
    });
    return;
  }

  // Cancel edit
  if (e.target.classList.contains("cancel")) {
    tr.classList.remove("editing");
    tr.innerHTML = rowHtml(order);
    return;
  }

  // Save edit
  if (e.target.classList.contains("save")) {
    const inputs = tr.querySelectorAll("input, select");
    const stars = tr.querySelectorAll(".star-edit");
    const rating = Math.max(
      0,
      Array.from(stars).filter(s => s.textContent === "★").length
    );
    const [cafe, drink, priceStr, note] = [
      inputs[0].value,
      inputs[1].value,
      inputs[2].value,
      inputs[3].value
    ];
    const price = Number(priceStr);

    await Orders.update(id, { cafe, drink, price, rating, note });
    tr.classList.remove("editing");
    await Promise.all([renderStats(), renderHistory()]);
  }
});

/* ---------- UTILITIES ---------- */
const HTML_ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

function attr(s) {
  return escapeHtml(s);
}