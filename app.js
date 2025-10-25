// app.js — menu toggles ONLY by the button (and closes when picking a menu item);
// notes removed; hearts only (no chips)

/* ---------- NAV + INITIAL UI ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const sheet = document.getElementById("sheet");
  const menuBtn = document.getElementById("menuBtn");

  if (menuBtn && sheet) {
    const toggle = (e) => {
      e?.preventDefault?.(); e?.stopPropagation?.();
      sheet.classList.toggle("hidden");
    };
    // Toggle open/close on button
    menuBtn.addEventListener("click", toggle);
    menuBtn.addEventListener("touchstart", toggle, { passive:false });

    // Close when selecting a sheet item
    sheet.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-view]");
      if (!btn) return;
      switchView(btn.dataset.view);
      sheet.classList.add("hidden");
    });
  }

  // Build drink select immediately
  initDrinkSelect();

  // Café heart toggle
  const cafeInput = document.getElementById("cafe");
  const cafeHeart = document.getElementById("cafeFavToggle");
  if (cafeHeart && cafeInput) {
    const toggleCafe = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const name = cafeInput.value.trim();
      if (!name) return;
      await toggleFavCafe(name);
      await updateCafeHeart();
    };
    cafeHeart.addEventListener("mousedown", (e) => e.preventDefault());
    cafeHeart.addEventListener("click", toggleCafe);
    cafeHeart.addEventListener("touchstart", toggleCafe, { passive:false });
    cafeInput.addEventListener("input", updateCafeHeart);
  }
});

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
const openReq = indexedDB.open("sipsip-db", 7);

openReq.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains("orders"))    db.createObjectStore("orders", { keyPath: "id", autoIncrement: true });
  if (!db.objectStoreNames.contains("favs"))      db.createObjectStore("favs", { keyPath: "id" });       // drinks
  if (!db.objectStoreNames.contains("favCafes"))  db.createObjectStore("favCafes", { keyPath: "id" });   // cafés
};
openReq.onsuccess = async (e) => {
  db = e.target.result;
  await updateDrinkHeart();
  await updateCafeHeart();
  await renderStats();
  await renderHistory();
};
openReq.onerror = (e) => console.error("DB open error:", e.target.error);

// helpers
const store = (name, mode="readonly") => db.transaction(name, mode).objectStore(name);

/* ---------- Orders API ---------- */
const Orders = {
  add(data) {
    return new Promise((res, rej) => {
      const t = db.transaction("orders", "readwrite");
      t.objectStore("orders").add({ ...data, ts: Date.now() });
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  },
  all() {
    return new Promise((res, rej) => {
      const req = store("orders").getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror  = () => rej(req.error);
    });
  },
  update(id, patch) {
    return new Promise((res, rej) => {
      const t = db.transaction("orders", "readwrite");
      const s = t.objectStore("orders");
      const g = s.get(id);
      g.onsuccess = () => { s.put({ ...g.result, ...patch }); };
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  },
  delete(id) {
    return new Promise((res, rej) => {
      const t = db.transaction("orders", "readwrite");
      t.objectStore("orders").delete(id);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }
};

/* ---------- Favourites (drinks/cafés) ---------- */
async function isFavDrink(name) {
  return new Promise((res, rej) => {
    const req = store("favs").get(name);
    req.onsuccess = () => res(!!req.result);
    req.onerror = () => rej(req.error);
  });
}
async function toggleFavDrink(name) {
  return new Promise((res, rej) => {
    const s = store("favs", "readwrite");
    const g = s.get(name);
    g.onsuccess = () => { g.result ? s.delete(name) : s.put({ id: name }); s.transaction.oncomplete = res; };
    g.onerror = () => rej(g.error);
  });
}
async function isFavCafe(name) {
  return new Promise((res, rej) => {
    const req = store("favCafes").get(name);
    req.onsuccess = () => res(!!req.result);
    req.onerror = () => rej(req.error);
  });
}
async function toggleFavCafe(name) {
  return new Promise((res, rej) => {
    const s = store("favCafes", "readwrite");
    const g = s.get(name);
    g.onsuccess = () => { g.result ? s.delete(name) : s.put({ id: name }); s.transaction.oncomplete = res; };
    g.onerror = () => rej(g.error);
  });
}

/* ---------- Views ---------- */
function switchView(name) {
  document.querySelectorAll("main > section").forEach(sec => sec.classList.add("hidden"));
  document.getElementById(`view-${name}`)?.classList.remove("hidden");
}

/* ---------- Form: select + hearts ---------- */
function initDrinkSelect() {
  const sel = document.getElementById("drink");
  if (!sel) return;
  sel.innerHTML = DRINKS.map(d => `<option value="${d}">${d}</option>`).join("");

  const btn = document.getElementById("drinkFavToggle");
  if (btn) {
    const toggle = async (e) => {
      e.preventDefault(); e.stopPropagation();
      await toggleFavDrink(sel.value);
      await updateDrinkHeart();
    };
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // stop focusing select
    btn.addEventListener("click", toggle);
    btn.addEventListener("touchstart", toggle, { passive:false });
  }
  sel.addEventListener("change", updateDrinkHeart);
}

async function updateDrinkHeart() {
  if (!db) return;
  const sel = document.getElementById("drink");
  const btn = document.getElementById("drinkFavToggle");
  if (!sel || !btn) return;
  const fav = await isFavDrink(sel.value);
  btn.textContent = fav ? "♥" : "♡";
  btn.setAttribute("aria-pressed", String(!!fav));
}

async function updateCafeHeart() {
  if (!db) return;
  const input = document.getElementById("cafe");
  const btn = document.getElementById("cafeFavToggle");
  if (!input || !btn) return;
  const name = input.value.trim();
  const fav = name ? await isFavCafe(name) : false;
  btn.textContent = fav ? "♥" : "♡";
  btn.setAttribute("aria-pressed", String(!!fav));
}

/* ---------- Add Order ---------- */
document.getElementById("order-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cafe  = document.getElementById("cafe").value.trim();
  const drink = document.getElementById("drink").value;
  const price = Number(document.getElementById("price").value);
  const note  = document.getElementById("note").value.trim();
  if (!cafe || !drink || isNaN(price)) return;

  await Orders.add({ cafe, drink, price, note });
  e.target.reset();
  initDrinkSelect();
  await updateCafeHeart();
  await updateDrinkHeart();
  await renderStats();
  await renderHistory();
  switchView("stats");
});

/* ---------- Stats ---------- */
async function renderStats() {
  const orders = await Orders.all();
  const total = orders.length;
  const spent = orders.reduce((s, o) => s + (Number(o.price) || 0), 0);

  const top = (key) => {
    const m = new Map();
    for (const o of orders) m.set(o[key], (m.get(o[key]) || 0) + 1);
    let k = "—", best = 0;
    for (const [name, ct] of m) if (ct > best && name) { k = name; best = ct; }
    return k;
  };

  document.getElementById("stats").innerHTML = `
    <div class="card"><strong>Total drinks</strong><div>${total}</div></div>
    <div class="card"><strong>Total spent</strong><div>€ ${spent.toFixed(2)}</div></div>
    <div class="card"><strong>Top café</strong><div>${escapeHtml(top("cafe"))}</div></div>
    <div class="card"><strong>Top drink</strong><div>${escapeHtml(top("drink"))}</div></div>
  `;
}

/* ---------- History (editable) ---------- */
async function renderHistory() {
  const tbody = document.querySelector("#history tbody");
  if (!tbody) return;
  const orders = (await Orders.all()).sort((a, b) => b.ts - a.ts);
  tbody.innerHTML = "";
  for (const o of orders) {
    const tr = document.createElement("tr");
    tr.dataset.id = o.id;
    tr.innerHTML = rowHtml(o);
    tbody.appendChild(tr);
  }
}
function rowHtml(o) {
  return `
    <td>${new Date(o.ts).toLocaleString()}</td>
    <td>${escapeHtml(o.cafe || "")}</td>
    <td>${escapeHtml(o.drink || "")}</td>
    <td>${Number(o.price).toFixed(2)}</td>
    <td>${escapeHtml(o.note || "")}</td>
    <td>
      <button class="btn btn-ghost edit">Edit</button>
      <button class="btn btn-del" data-del>Delete</button>
    </td>
  `;
}
function editRowHtml(o) {
  return `
    <td>${new Date(o.ts).toLocaleString()}</td>
    <td><input value="${attr(o.cafe)}"></td>
    <td>
      <select>
        ${DRINKS.map(d => `<option ${d===o.drink?'selected':''}>${d}</option>`).join("")}
      </select>
    </td>
    <td><input type="number" step="0.01" min="0" value="${attr(Number(o.price).toFixed(2))}"></td>
    <td><input value="${attr(o.note)}"></td>
    <td>
      <button class="btn save">Save</button>
      <button class="btn btn-ghost cancel">Cancel</button>
    </td>
  `;
}
document.querySelector("#history tbody")?.addEventListener("click", async (e) => {
  const tr = e.target.closest("tr"); if (!tr) return;
  const id = Number(tr.dataset.id);

  if (e.target.closest("[data-del]")) {
    await Orders.delete(id);
    await renderStats(); await renderHistory();
    return;
  }
  if (e.target.classList.contains("edit")) {
    const all = await Orders.all();
    const o = all.find(x => x.id === id);
    tr.classList.add("editing");
    tr.innerHTML = editRowHtml(o);
    return;
  }
  if (e.target.classList.contains("cancel")) {
    const all = await Orders.all();
    const o = all.find(x => x.id === id);
    tr.classList.remove("editing");
    tr.innerHTML = rowHtml(o);
    return;
  }
  if (e.target.classList.contains("save")) {
    const inputs = tr.querySelectorAll("input, select");
    const [cafe, drink, priceStr, note] = [inputs[0].value, inputs[1].value, inputs[2].value, inputs[3].value];
    const price = Number(priceStr);
    await Orders.update(id, { cafe, drink, price, note });
    tr.classList.remove("editing");
    await renderStats(); await renderHistory();
    return;
  }
});

/* ---------- Utils ---------- */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function attr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }