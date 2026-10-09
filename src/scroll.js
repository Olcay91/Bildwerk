(() => {
  "use strict";
  const T = window.__TAURI__;
  const $ = s => document.querySelector(s);
  const hint = $("#hint"), autoBtn = $("#auto");
  let auto = false, ending = false, waiting = false;
  // Sprache wie im Hauptfenster (gleicher Speicher)
  let prefs = {};
  try{ prefs = JSON.parse(localStorage.getItem("bildwerk.prefs") || "{}"); }catch{}
  const lang = (prefs.ui && prefs.ui.lang) || ((navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en");
  document.documentElement.lang = lang;
  if (lang === "en" && window.BW_I18N){
    const done = new WeakMap();
    const tn = n => { const v = n.nodeValue; if (!v || done.get(n) === v) return; const en = window.BW_I18N.tr(v); if (en != null){ done.set(n, en); n.nodeValue = en; } };
    const walk = r => { if (r.nodeType === 3) return tn(r); const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) tn(n); };
    walk(document.body);
    new MutationObserver(ms => ms.forEach(m => m.type === "characterData" ? tn(m.target) : m.addedNodes.forEach(walk)))
      .observe(document.body, {subtree:true, childList:true, characterData:true});
  }
  const fmt = n => Number(n).toLocaleString(lang === "en" ? "en-US" : "de-DE");
  const HINT_MANUAL = "Scrolle jetzt im gewählten Bereich langsam nach unten.";
  const HINT_AUTO = "Bildwerk scrollt automatisch. Maus bitte nicht bewegen.";

  const setAuto = on => {
    auto = on;
    autoBtn.setAttribute("aria-pressed", on);
    autoBtn.textContent = on ? "Automatik stoppen" : "Automatisch scrollen";
    T.core.invoke("scroll_auto", {on}).catch(() => {});
    waiting = false; document.body.classList.remove("waiting");
    hint.textContent = on ? HINT_AUTO : HINT_MANUAL;
  };
  const stop = cancel => {
    if (ending) return;
    ending = true;
    hint.textContent = cancel ? "Wird abgebrochen …" : "Bild wird zusammengesetzt …";
    T.core.invoke("scroll_stop", {cancel}).catch(e => { hint.textContent = String(e); ending = false; });
  };

  T.event.listen("scroll-progress", e => {
    const p = e.payload || {};
    $("#height").textContent = `${fmt(p.rows || 0)} / ${fmt(p.max || 0)} px`;
  });
  // Endlos-Seiten: Seite steht, weil sie gerade Inhalte nachlädt
  T.event.listen("scroll-status", e => {
    if (ending) return;
    if (e.payload === "noscroll"){
      hint.textContent = "Die Seite reagiert nicht auf das automatische Scrollen. Klicke einmal in die Seite oder scrolle selbst.";
      document.body.classList.add("waiting");
      return;
    }
    waiting = e.payload === "waiting";
    document.body.classList.toggle("waiting", waiting);
    hint.textContent = waiting ? "Seite lädt weitere Inhalte nach … bitte warten." : (auto ? HINT_AUTO : HINT_MANUAL);
  });
  T.event.listen("scroll-auto-end", e => {
    auto = false; waiting = false; document.body.classList.remove("waiting");
    autoBtn.setAttribute("aria-pressed", "false");
    autoBtn.textContent = "Automatisch scrollen";
    hint.textContent = String(e.payload || "Ende erreicht – klicke auf „Fertig“.");
  });
  // Ende erreicht oder Grenze erreicht: selbstständig abschließen
  T.event.listen("scroll-autofinish", e => {
    document.body.classList.remove("waiting");
    hint.textContent = e.payload === "limit" ? "Maximale Länge erreicht – Bild wird zusammengesetzt …" : "Ende erreicht – Bild wird zusammengesetzt …";
    stop(false);
  });
  T.event.listen("scroll-limit", e => {
    auto = false; autoBtn.setAttribute("aria-pressed", "false"); autoBtn.textContent = "Automatisch scrollen";
    document.body.classList.remove("waiting");
    hint.textContent = `Maximale Länge (${fmt(e.payload || 0)} px) erreicht – klicke auf „Fertig“.`;
  });

  autoBtn.addEventListener("click", () => setAuto(!auto));
  // Automatisch scrollen gleich zu Beginn, wenn das in den Einstellungen so eingestellt ist
  let startAuto = true;
  if (prefs.screenshot && prefs.screenshot.scrollAuto === false) startAuto = false;
  if (startAuto) setTimeout(() => { if (!ending) setAuto(true); }, 400);
  $("#done").addEventListener("click", () => stop(false));
  $("#cancel").addEventListener("click", () => stop(true));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") stop(true);
    else if (e.key === "Enter" && e.target === document.body) stop(false);
  });
})();
