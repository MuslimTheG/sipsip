// app.js

// --- Service worker registration (kept) ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" });
}

// --- Minimal IndexedDB setup ---
let db;
const openReq = indexedDB.open("sipsip-db", 1);
openReq.onupgradeneeded = (e) => {
  db = e.target.result;
  db.createObjectStore("notes", { keyPath: "id" });
};
openReq.onsuccess = (e) => {
  db = e.target.result;
  refreshList();
};
openReq.onerror = (e) => console.error("DB open error:", e.target.error);

// Save a note to the DB
async function saveNote(text) {
  await new Promise((res, rej) => {
    const tx = db.transaction("notes", "readwrite");
    tx.objectStore("notes").put({ id: Date.now(), text });
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

// Read all notes
function getAllNotes() {
  return new Promise((res, rej) => {
    const tx = db.transaction("notes");
    const req = tx.objectStore("notes").getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

// Render notes into <pre id="out">
async function refreshList() {
  const notes = await getAllNotes();
  document.getElementById("out").textContent = JSON.stringify(notes, null, 2);
}

// Button: save a sample entry, then refresh list
document.querySelector(".button").addEventListener("click", async () => {
  await saveNote("Hello iPhone 👋 " + new Date().toLocaleString());
  await refreshList();
});