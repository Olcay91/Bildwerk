(() => {
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const app = $("#app");

/* ---------- Storage (try/catch, works without) ---------- */
const store = {
  get(k, fb){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }catch{ return fb; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
};

/* ---------- Native (Tauri) ---------- */
const TAURI = window.__TAURI__ || null;
const NATIVE = !!(TAURI && TAURI.core && TAURI.dialog);
const baseOf = p => String(p).split(/[\\/]/).pop();
const dirOf = p => String(p).replace(/[\\/][^\\/]*$/, "");
const joinDir = (d, f) => d ? d.replace(/[\\/]+$/, "") + (d.includes("\\") ? "\\" : "/") + f : f;
const toBytes = async d => d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : new TextEncoder().encode(d);
function writeNative(bytes, headers){
  const h = {};
  for (const [k, v] of Object.entries(headers)) h[k] = encodeURIComponent(v);
  return TAURI.core.invoke("write_file", bytes, {headers:h});
}
if (NATIVE) document.documentElement.classList.add("native");

/* ---------- State ---------- */
const DEFAULTS = {
  ratio:"free", customW:3, customH:2,
  rotate:0, flipH:false, flipV:false,
  resize:{enabled:false, maxW:1920, maxH:1920, keepAspect:true},
  export:{format:"image/jpeg", quality:85, suffix:"_bearbeitet"}
};
const clone = o => JSON.parse(JSON.stringify(o));
function merge(base, over){
  const out = clone(base);
  if (!over || typeof over !== "object") return out;
  for (const k of Object.keys(base)){
    if (over[k] === undefined) continue;
    if (base[k] && typeof base[k] === "object") out[k] = merge(base[k], over[k]);
    else if (typeof over[k] === typeof base[k]) out[k] = over[k];
  }
  return out;
}
const S = {
  images:[], cur:-1, tool:null,
  settings: merge(DEFAULTS, store.get("bildwerk.settings", null)),
  workflows: store.get("bildwerk.workflows", [])
};
let disp = {dw:0, dh:0};
const cur = () => S.images[S.cur] || null;
const persist = () => store.set("bildwerk.settings", S.settings);
// App-Einstellungen (nicht Teil der Arbeitsabläufe)
const PREF_DEFAULTS = {
  ui:{theme:"system", zoom:100, tab:"info", toolStyle:"both", lang:"", mode:"advanced"},
  save:{dir:"", ask:true},
  update:{auto:true, download:false, lastCheck:0},
  screenshot:{enabled:false, shortcut:"Control+Alt+KeyS", mode:"region", clipboard:true, scrollMax:30000, scrollWait:5000, scrollAuto:true, format:"image/png", quality:90, autoSave:false}
};
const prefs = merge(PREF_DEFAULTS, store.get("bildwerk.prefs", null));
const savePrefs = () => store.set("bildwerk.prefs", prefs);

/* ---------- Sprache (Deutsch ist die Ausgangssprache) ---------- */
// Feste und von der App erzeugte Texte werden beim Erscheinen im Fenster übersetzt.
// Die deutschen Originale werden gemerkt, damit ein Wechsel zurück jederzeit möglich ist.
const I18N_ATTRS = ["title", "aria-label", "placeholder", "data-tip"];
const i18nMap = new WeakMap();
let LANG = "de";
const resolveLang = () => prefs.ui.lang || ((navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en");
const LOC = () => LANG === "en" ? "en-US" : "de-DE";
const tt = s => LANG === "en" && window.BW_I18N ? (window.BW_I18N.trCore(s) ?? s) : s;   // für Texte außerhalb des Fensters (Systemdialoge)
const skipNode = el => !!(el && el.closest && el.closest('[translate="no"], script, style'));
function trTextNode(n){
  if (LANG !== "en" || !window.BW_I18N || skipNode(n.parentElement)) return;
  const v = n.nodeValue; if (!v || !v.trim()) return;
  const m = i18nMap.get(n); if (m && m.en === v) return;
  const en = window.BW_I18N.tr(v); if (en == null) return;
  i18nMap.set(n, {de:v, en}); n.nodeValue = en;
}
function trAttr(el, a){
  if (LANG !== "en" || !window.BW_I18N || skipNode(el)) return;
  const v = el.getAttribute(a); if (!v) return;
  let m = i18nMap.get(el); if (!m){ m = {}; i18nMap.set(el, m); }
  if (m[a] && m[a].en === v) return;
  const en = window.BW_I18N.tr(v); if (en == null) return;
  m[a] = {de:v, en}; el.setAttribute(a, en);
}
function trTree(root){
  if (root.nodeType === 3){ trTextNode(root); return; }
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = root;
  do {
    if (n.nodeType === 3) trTextNode(n);
    else for (const a of I18N_ATTRS) if (n.hasAttribute(a)) trAttr(n, a);
  } while ((n = w.nextNode()));
}
function restoreTree(root){
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = root;
  do {
    const m = i18nMap.get(n);
    if (m){
      if (n.nodeType === 3){ if (n.nodeValue === m.en) n.nodeValue = m.de; }
      else for (const a of I18N_ATTRS) if (m[a] && n.getAttribute(a) === m[a].en) n.setAttribute(a, m[a].de);
    }
  } while ((n = w.nextNode()));
}
new MutationObserver(muts => {
  if (LANG !== "en") return;
  for (const m of muts){
    if (m.type === "characterData") trTextNode(m.target);
    else if (m.type === "attributes") trAttr(m.target, m.attributeName);
    else m.addedNodes.forEach(trTree);
  }
}).observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:I18N_ATTRS});
// Vorgaben, die in Dateinamen landen, je Sprache
const SUFFIX_DEFAULT = {de:"_bearbeitet", en:"_edited"};
function applyLang(rerender){
  const next = resolveLang();
  const sfx = S.settings.export.suffix;
  if (sfx === SUFFIX_DEFAULT.de || sfx === SUFFIX_DEFAULT.en){ S.settings.export.suffix = SUFFIX_DEFAULT[next]; persist(); }
  if (next === "de" && LANG === "en"){ LANG = "de"; restoreTree(document.body); }
  LANG = next;
  document.documentElement.lang = LANG;
  // macOS: Menüleiste in derselben Sprache
  if (window.__TAURI__ && window.__TAURI__.core) window.__TAURI__.core.invoke("set_menu_lang", {lang: LANG}).catch(() => {});
  if (rerender) rerenderAll();
  if (LANG === "en") trTree(document.body);
}
function rerenderAll(){
  try{
    renderRail(); renderBarEditor(); renderWorkflows(); syncUI(); syncSettings(); syncAppearance();
    syncSaveSettings(); syncUpdateSettings(); renderInfo(); syncCounts(); renderStrip(); drawStage(); updateInfo();
    setCollapseLabel(app.dataset.collapsed === "true"); setTab(curTab);
  }catch(e){ console.warn(e); }
}
/* Positionen in vergrößerten Bereichen (CSS zoom für die Symbol- und Textgröße).
   Chromium (Windows) liefert Elementpositionen in sichtbaren Pixeln, die Safari-Engine (macOS)
   in ungezoomten Werten. Welche Variante gilt, verrät die Seitenleiste: Sie ist immer so hoch
   (am Handy so breit) wie das Fenster. */
const ZOOMED = ".rail, .panel, .topbar, .strip-wrap, .setwin, .modal, .zoombar, .prog, .ctx";
function rectScale(){
  const z = prefs.ui.zoom / 100;
  if (Math.abs(z - 1) < 0.001) return 1;
  const rail = document.querySelector(".rail"); if (!rail) return 1;
  const r = rail.getBoundingClientRect(), mobile = matchMedia("(max-width:760px)").matches;
  const seen = mobile ? r.width : r.height, full = mobile ? window.innerWidth : window.innerHeight;
  // sichtbare Größe ÷ gemessene Größe: 1 (Chromium), z oder 1/z (ältere Safari-Varianten)
  const ratio = full / Math.max(1, seen);
  for (const f of [1, z, 1 / z]) if (Math.abs(ratio - f) < 0.02 * f) return f;
  return 1;
}
function vrect(el){
  const r = el.getBoundingClientRect();
  if (!el.closest || !el.closest(ZOOMED)) return r;
  const f = rectScale(); if (f === 1) return r;
  return {left:r.left * f, top:r.top * f, right:r.right * f, bottom:r.bottom * f, width:r.width * f, height:r.height * f, x:r.x * f, y:r.y * f};
}

// Einfacher / erweiterter Modus
function applyUiMode(){ document.documentElement.dataset.uimode = prefs.ui.mode === "simple" ? "simple" : "advanced"; }
applyUiMode();

const RATIOS = [
  ["free","Frei"],["original","Original"],["1:1","1:1"],
  ["4:3","4:3"],["3:4","3:4"],["3:2","3:2"],
  ["2:3","2:3"],["16:9","16:9"],["9:16","9:16"],
  ["4:5","4:5"],["5:4","5:4"],["custom","Eigenes"]
];
const FMT = {"image/jpeg":["jpg","JPEG"],"image/webp":["webp","WebP"],"image/png":["png","PNG"]};

/* ---------- Geometry ---------- */
function oriented(im){ return S.settings.rotate % 180 ? [im.h, im.w] : [im.w, im.h]; }
function ratioOf(im){
  const s = S.settings;
  if (s.ratio === "free") return null;
  if (s.ratio === "original"){ const [W,H] = oriented(im); return W/H; }
  if (s.ratio === "custom") return (s.customW > 0 && s.customH > 0) ? s.customW / s.customH : null;
  const [a,b] = s.ratio.split(":").map(Number); return a/b;
}
function defaultCrop(im){
  const r = ratioOf(im); if (!r) return {x:0,y:0,w:1,h:1};
  const [W,H] = oriented(im);
  if (W/H > r){ const w = (H*r)/W; return {x:(1-w)/2, y:0, w, h:1}; }
  const h = W/(r*H); return {x:0, y:(1-h)/2, w:1, h};
}
const cropOf = im => im.crop || defaultCrop(im);
function resetCrops(){ S.images.forEach(im => { im.crop = null; }); }
function cropPx(im){
  const [W,H] = oriented(im), c = cropOf(im);
  const x = Math.round(c.x*W), y = Math.round(c.y*H);
  return {x, y, w:Math.max(1, Math.min(W-x, Math.round(c.w*W))), h:Math.max(1, Math.min(H-y, Math.round(c.h*H)))};
}
function targetSize(cw, ch){
  const r = S.settings.resize;
  if (!r.enabled) return [cw, ch];
  const mw = r.maxW > 0 ? r.maxW : Infinity, mh = r.maxH > 0 ? r.maxH : Infinity;
  if (r.keepAspect){
    const s = Math.min(1, mw/cw, mh/ch);
    return [Math.max(1, Math.round(cw*s)), Math.max(1, Math.round(ch*s))];
  }
  return [Math.min(cw, mw), Math.min(ch, mh)];
}

/* ---------- Rendering ---------- */
function orient(src, w, h, scale){
  const s = S.settings;
  const sw = Math.max(1, Math.round(w*scale)), sh = Math.max(1, Math.round(h*scale));
  const swap = s.rotate % 180 !== 0;
  const c = document.createElement("canvas");
  c.width = swap ? sh : sw; c.height = swap ? sw : sh;
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.translate(c.width/2, c.height/2);
  x.scale(s.flipH ? -1 : 1, s.flipV ? -1 : 1);   // spiegeln in Bildschirmrichtung
  x.rotate(s.rotate * Math.PI / 180);
  x.drawImage(src, -sw/2, -sh/2, sw, sh);
  return c;
}
function renderFull(im){
  const o = orient(im.bmp, im.w, im.h, 1);
  const c = cropPx(im);
  const [tw, th] = targetSize(c.w, c.h);
  let src = o, sx = c.x, sy = c.y, sw = c.w, sh = c.h;
  // schrittweise halbieren für saubere Verkleinerung
  while (sw/2 >= tw && sh/2 >= th){
    const n = document.createElement("canvas");
    n.width = Math.ceil(sw/2); n.height = Math.ceil(sh/2);
    const nx = n.getContext("2d"); nx.imageSmoothingQuality = "high";
    nx.drawImage(src, sx, sy, sw, sh, 0, 0, n.width, n.height);
    if (src !== o) src.width = 0;
    src = n; sx = sy = 0; sw = n.width; sh = n.height;
  }
  const out = document.createElement("canvas");
  out.width = tw; out.height = th;
  const ox = out.getContext("2d");
  if (S.settings.export.format === "image/jpeg"){ ox.fillStyle = "#fff"; ox.fillRect(0,0,tw,th); }
  ox.imageSmoothingQuality = "high";
  ox.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
  o.width = 0; if (src !== o) src.width = 0;
  return out;
}
function encode(canvas){
  const e = S.settings.export;
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("Kodierung fehlgeschlagen")), e.format, e.quality/100));
}
function outName(im, blob){
  const base = im.name.replace(/\.[^.]+$/, "");
  const ext = (FMT[blob.type] || FMT[S.settings.export.format])[0];
  return base + (S.settings.export.suffix || "") + "." + ext;
}

/* ---------- Preview ---------- */
const view = $("#view"), frame = $("#frame"), cropbox = $("#cropbox");
function previewCanvas(im){
  const s = S.settings, key = s.rotate + "|" + s.flipH + "|" + s.flipV;
  if (!im.prev || im.prev.key !== key){
    const scale = Math.min(1, 1800 / Math.max(im.w, im.h));
    im.prev = {key, c: orient(im.bmp, im.w, im.h, scale)};
  }
  return im.prev.c;
}
// Ansicht: Zoom relativ zu „eingepasst“ (1) und Bildpunkt in der Mitte des sichtbaren Bereichs
const V = {z:1, cx:null, cy:null, key:""};
const MAX_SCALE = 16;   // höchstens 1600 %
function fullCanvas(im){
  const s = S.settings, key = s.rotate + "|" + s.flipH + "|" + s.flipV;
  if (!im.full || im.full.key !== key){
    if (im.full) im.full.c.width = 0;
    im.full = {key, c: orient(im.bmp, im.w, im.h, 1)};
  }
  return im.full.c;
}
function viewGeom(im){
  const wrap = $("#wrap"), cs = getComputedStyle(wrap);
  const pl = parseFloat(cs.paddingLeft), pt = parseFloat(cs.paddingTop);
  const aw = wrap.clientWidth - pl - parseFloat(cs.paddingRight);
  const ah = wrap.clientHeight - pt - parseFloat(cs.paddingBottom);
  const [W, H] = oriented(im);
  const fit = Math.max(1e-6, Math.min(aw / W, ah / H, 4));
  const s = fit * V.z, dw = W * s, dh = H * s;
  if (V.cx == null){ V.cx = W / 2; V.cy = H / 2; }
  let fx, fy;
  if (dw <= aw){ V.cx = W / 2; fx = pl + (aw - dw) / 2; }
  else { const hw = aw / 2 / s; V.cx = clamp(V.cx, hw, W - hw); fx = pl + aw / 2 - V.cx * s; }
  if (dh <= ah){ V.cy = H / 2; fy = pt + (ah - dh) / 2; }
  else { const hh = ah / 2 / s; V.cy = clamp(V.cy, hh, H - hh); fy = pt + ah / 2 - V.cy * s; }
  return {W, H, fit, s, dw, dh, fx, fy, pl, pt, aw, ah, ww: wrap.clientWidth, wh: wrap.clientHeight};
}
function drawStage(){
  const im = cur();
  $("#drop").hidden = !!im; frame.hidden = !im; view.hidden = !im; $("#zoombar").hidden = !im;
  $("#topExport").disabled = !im;
  if (!im){ updateInfo(); return; }
  // neues Bild oder gedreht: wieder einpassen
  const key = im.id + "|" + S.settings.rotate;
  if (V.key !== key){
    V.key = key; V.z = 1; V.cx = V.cy = null;
    S.images.forEach(o => { if (o !== im && o.full){ o.full.c.width = 0; o.full = null; } });
  }
  const g = viewGeom(im), dpr = window.devicePixelRatio || 1;
  Object.assign(frame.style, {left: g.fx + "px", top: g.fy + "px", width: g.dw + "px", height: g.dh + "px"});
  if (view.width !== Math.round(g.ww * dpr) || view.height !== Math.round(g.wh * dpr)){
    view.width = Math.round(g.ww * dpr); view.height = Math.round(g.wh * dpr);
  }
  const x = view.getContext("2d");
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, view.width, view.height);
  // sichtbarer Teil des Bildes
  const vx0 = Math.max(0, g.fx), vy0 = Math.max(0, g.fy);
  const vx1 = Math.min(g.ww, g.fx + g.dw), vy1 = Math.min(g.wh, g.fy + g.dh);
  if (vx1 > vx0 && vy1 > vy0){
    // Schachbrett für transparente Bereiche
    const st = getComputedStyle(document.documentElement);
    x.fillStyle = st.getPropertyValue("--bg").trim() || "#ddd";
    x.fillRect(vx0 * dpr, vy0 * dpr, (vx1 - vx0) * dpr, (vy1 - vy0) * dpr);
    x.fillStyle = st.getPropertyValue("--checker").trim() || "#ccc";
    const cs = 8 * dpr;
    x.save(); x.beginPath(); x.rect(vx0 * dpr, vy0 * dpr, (vx1 - vx0) * dpr, (vy1 - vy0) * dpr); x.clip();
    for (let yy = Math.floor(vy0 * dpr / cs) * cs; yy < vy1 * dpr; yy += cs)
      for (let xx = Math.floor(vx0 * dpr / cs) * cs + ((yy / cs) % 2 ? cs : 0); xx < vx1 * dpr; xx += 2 * cs) x.fillRect(xx, yy, cs, cs);
    x.restore();
    // Vorschau genügt bis zur eigenen Auflösung, darüber das Bild in voller Größe
    const pv = previewCanvas(im), ps = pv.width / g.W;
    const src = g.s * dpr <= ps * 1.05 ? pv : fullCanvas(im), k = src === pv ? ps : 1;
    const sx = (vx0 - g.fx) / g.s * k, sy = (vy0 - g.fy) / g.s * k;
    const sw = (vx1 - vx0) / g.s * k, sh = (vy1 - vy0) / g.s * k;
    x.imageSmoothingEnabled = g.s < 2;          // ab 200 % scharfe Pixel für genaues Zuschneiden
    x.imageSmoothingQuality = "high";
    x.drawImage(src, sx, sy, sw, sh, vx0 * dpr, vy0 * dpr, (vx1 - vx0) * dpr, (vy1 - vy0) * dpr);
  }
  disp = {dw: g.dw, dh: g.dh};
  $("#viewZoomVal").textContent = Math.round(g.s * 100) + " %";
  $("#wrap").classList.toggle("can-pan", V.z > 1.0001);
  layoutCrop(); updateInfo(false);
  scheduleInfo();
}
// Größe/Dateigröße nur neu berechnen, wenn sich am Bild etwas geändert hat – nicht bei jedem Zoom
let infoKey = "";
function scheduleInfo(){
  const im = cur(); if (!im) return;
  const c = cropOf(im), k = [im.id, JSON.stringify(S.settings), c.x, c.y, c.w, c.h].join("|");
  if (k !== infoKey){ infoKey = k; updateInfo(); }
}
function setViewZoom(z, ax, ay){
  const im = cur(); if (!im) return;
  const g = viewGeom(im);
  z = clamp(z, 1, Math.max(1, MAX_SCALE / g.fit));
  if (ax == null){ ax = g.pl + g.aw / 2; ay = g.pt + g.ah / 2; }
  const ix = (ax - g.fx) / g.s, iy = (ay - g.fy) / g.s;     // Bildpunkt unter dem Mauszeiger bleibt stehen
  const s = g.fit * z;
  V.z = z; V.cx = ix + (g.pl + g.aw / 2 - ax) / s; V.cy = iy + (g.pt + g.ah / 2 - ay) / s;
  drawStage();
}
function zoomBy(f, ax, ay){ setViewZoom(V.z * f, ax, ay); }
function zoomTo100(){ const im = cur(); if (!im) return; const g = viewGeom(im); setViewZoom(1 / g.fit); }
$("#zoombar").addEventListener("click", e => {
  const b = e.target.closest("[data-zoom]"); if (!b) return;
  const a = b.dataset.zoom;
  if (a === "in") zoomBy(1.25); else if (a === "out") zoomBy(1 / 1.25);
  else if (a === "fit") setViewZoom(1); else if (a === "one") zoomTo100();
});
// Strg + Mausrad (oder Zwei-Finger-Zoom am Touchpad): zoomen am Mauszeiger.
// Mausrad allein: verschieben, wenn vergrößert.
$("#wrap").addEventListener("wheel", e => {
  if (!cur() || !$("#shot").hidden) return;
  const r = $("#wrap").getBoundingClientRect(), ax = e.clientX - r.left, ay = e.clientY - r.top;
  if (e.ctrlKey || e.metaKey){
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), ax, ay);
  } else if (V.z > 1.0001){
    e.preventDefault();
    const g = viewGeom(cur()), k = e.deltaMode === 1 ? 32 : 1;
    let dx = e.deltaX * k, dy = e.deltaY * k;
    if (e.shiftKey && !dx){ dx = dy; dy = 0; }
    V.cx += dx / g.s; V.cy += dy / g.s; drawStage();
  }
}, {passive:false});
// Verschieben per Ziehen: mittlere Maustaste, Leertaste + Ziehen oder Ziehen außerhalb des Zuschnittrahmens
let pan = null, spaceDown = false;
document.addEventListener("keydown", e => {
  if (e.code === "Space" && !e.repeat && !e.target.closest("input, textarea, select, button") && cur()){ spaceDown = true; $("#wrap").classList.add("can-pan"); e.preventDefault(); }
});
document.addEventListener("keyup", e => { if (e.code === "Space"){ spaceDown = false; $("#wrap").classList.toggle("can-pan", V.z > 1.0001); } });
$("#wrap").addEventListener("pointerdown", e => {
  if (!cur() || e.target.closest(".zoombar")) return;
  const onCrop = e.target.closest("#cropbox") && S.tool === "crop";
  const want = e.button === 1 || spaceDown || (e.button === 0 && V.z > 1.0001 && !onCrop);
  if (!want) return;
  e.preventDefault(); e.stopPropagation();
  pan = {x:e.clientX, y:e.clientY, cx:V.cx, cy:V.cy, s:viewGeom(cur()).s};
  $("#wrap").setPointerCapture(e.pointerId); $("#wrap").classList.add("panning");
}, true);
$("#wrap").addEventListener("pointermove", e => {
  if (!pan) return;
  V.cx = pan.cx - (e.clientX - pan.x) / pan.s; V.cy = pan.cy - (e.clientY - pan.y) / pan.s; drawStage();
});
const endPan = () => { if (pan){ pan = null; $("#wrap").classList.remove("panning"); } };
$("#wrap").addEventListener("pointerup", endPan);
$("#wrap").addEventListener("pointercancel", endPan);
// Tastatur: + / − zoomen, 0 einpassen, 1 = 100 % (auch mit Strg)
document.addEventListener("keydown", e => {
  if (!cur() || e.altKey || e.target.closest("input, textarea, select") || !$("#shot").hidden || !$("#modal").hidden || !$("#setWin").hidden || recording) return;
  const k = e.key;
  if (k === "+" || k === "=" ){ zoomBy(1.25); e.preventDefault(); }
  else if (k === "-" || k === "_"){ zoomBy(1 / 1.25); e.preventDefault(); }
  else if (k === "0"){ setViewZoom(1); e.preventDefault(); }
  else if (k === "1" && !e.ctrlKey && !e.metaKey){ zoomTo100(); e.preventDefault(); }
});
function layoutCrop(){
  const im = cur(); if (!im) return;
  const c = cropOf(im);
  Object.assign(cropbox.style, {
    left: c.x*disp.dw + "px", top: c.y*disp.dh + "px",
    width: c.w*disp.dw + "px", height: c.h*disp.dh + "px"
  });
}

/* ---------- Crop interaction ---------- */
let drag = null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
cropbox.addEventListener("pointerdown", e => {
  const im = cur(); if (!im || S.tool !== "crop") return;
  const c = cropOf(im);
  drag = {h: e.target.dataset.h || "move", sx:e.clientX, sy:e.clientY,
    r:{x:c.x*disp.dw, y:c.y*disp.dh, w:c.w*disp.dw, h:c.h*disp.dh}};
  cropbox.setPointerCapture(e.pointerId); e.preventDefault();
});
cropbox.addEventListener("pointermove", e => {
  if (!drag) return;
  const im = cur(), {dw, dh} = disp, MIN = 24;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  const r = {...drag.r};
  if (drag.h === "move"){
    r.x = clamp(r.x + dx, 0, dw - r.w); r.y = clamp(r.y + dy, 0, dh - r.h);
  } else if (drag.h.length === 1){
    // Seite ziehen: nur diese Kante bewegt sich. Bei festem Seitenverhältnis wächst die andere
    // Richtung mittig mit und bleibt im Bild.
    const ratio = ratioOf(im);
    if (drag.h === "e" || drag.h === "w"){
      const west = drag.h === "w", ax = west ? r.x + r.w : r.x;
      const px = clamp((west ? r.x : r.x + r.w) + dx, 0, dw);
      let w = Math.min(Math.max(MIN, west ? ax - px : px - ax), west ? ax : dw - ax);
      if (ratio){
        let hh = w / ratio;
        if (hh > dh){ hh = dh; w = hh * ratio; }
        const cy = r.y + r.h / 2;
        r.h = hh; r.y = clamp(cy - hh / 2, 0, dh - hh);
      }
      r.w = w; r.x = west ? ax - w : ax;
    } else {
      const north = drag.h === "n", ay = north ? r.y + r.h : r.y;
      const py = clamp((north ? r.y : r.y + r.h) + dy, 0, dh);
      let hh = Math.min(Math.max(MIN, north ? ay - py : py - ay), north ? ay : dh - ay);
      if (ratio){
        let w = hh * ratio;
        if (w > dw){ w = dw; hh = w / ratio; }
        const cx = r.x + r.w / 2;
        r.w = w; r.x = clamp(cx - w / 2, 0, dw - w);
      }
      r.h = hh; r.y = north ? ay - hh : ay;
    }
  } else {
    const west = drag.h.includes("w"), north = drag.h.includes("n");
    const ax = west ? r.x + r.w : r.x, ay = north ? r.y + r.h : r.y;
    const px = clamp((west ? r.x : r.x + r.w) + dx, 0, dw);
    const py = clamp((north ? r.y : r.y + r.h) + dy, 0, dh);
    let w = Math.min(Math.max(MIN, west ? ax - px : px - ax), west ? ax : dw - ax);
    let h = Math.min(Math.max(MIN, north ? ay - py : py - ay), north ? ay : dh - ay);
    const ratio = ratioOf(im);
    if (ratio){ if (w/h > ratio) w = h*ratio; else h = w/ratio; }
    r.w = w; r.h = h; r.x = west ? ax - w : ax; r.y = north ? ay - h : ay;
  }
  im.crop = {x:r.x/dw, y:r.y/dh, w:r.w/dw, h:r.h/dh};
  layoutCrop(); updateInfo(false);
});
const endDrag = () => { if (drag){ drag = null; updateInfo(); updateToolState(); } };
cropbox.addEventListener("pointerup", endDrag);
cropbox.addEventListener("pointercancel", endDrag);

/* ---------- Info line ---------- */
let estTimer = 0, estToken = 0, estText = "";
const fmtBytes = n => n < 1024*1024
  ? Math.max(1, Math.round(n/1024)).toLocaleString(LOC()) + " KB"
  : (n/1048576).toLocaleString(LOC(), {maximumFractionDigits:1}) + " MB";
function updateInfo(estimate = true){
  const im = cur();
  if (!im){
    $("#fileName").textContent = "Kein Bild geöffnet";
    $("#dims").textContent = "Ziehe Bilder hierher oder wähle sie aus.";
    return;
  }
  const c = cropPx(im), [tw, th] = targetSize(c.w, c.h);
  $("#fileName").textContent = im.name + (S.images.length > 1 ? `  (${S.cur+1} von ${S.images.length})` : "");
  const base = `${im.w} × ${im.h} → ${tw} × ${th} px · ${FMT[S.settings.export.format][1]}`;
  if (!estimate){ $("#dims").textContent = base + (estText ? " · " + estText : ""); return; }
  $("#dims").textContent = base + " · Größe wird berechnet …";
  clearTimeout(estTimer);
  const tok = ++estToken;
  estTimer = setTimeout(async () => {
    try{
      const cv = renderFull(im), b = await encode(cv); cv.width = 0;
      if (tok !== estToken) return;
      estText = "≈ " + fmtBytes(b.size);
      $("#dims").textContent = base + " · " + estText;
    }catch{ if (tok === estToken) $("#dims").textContent = base; }
  }, 420);
  updateNamePreview();
}

/* ---------- Fortschritt (Laden und Stapel-Export) ---------- */
const Prog = {
  active:false, cancelled:false, total:0, done:0, t0:0, tLast:0, timer:0,
  start(total, label){
    Object.assign(this, {active:true, cancelled:false, total, done:0, t0:performance.now(), tLast:performance.now()});
    const el = $("#prog"); el.classList.remove("cancelling"); el.setAttribute("aria-label", label); el.hidden = false;
    this.place();
    $("#progX").disabled = false; $("#progX").setAttribute("aria-label", label + " abbrechen");
    clearInterval(this.timer); this.timer = setInterval(() => this.render(), 1000);
    this.render();
  },
  // über der Bildleiste platzieren, damit die Vorschaubilder sichtbar bleiben
  place(){
    const el = $("#prog"), strip = $("#stripWrap"), z = prefs.ui.zoom / 100;
    // mittig über der Bildfläche, nie breiter als sie und nie über den Fensterrand hinaus
    const st = $(".stage").getBoundingClientRect(), vw = window.innerWidth;
    const w = Math.max(220, Math.min(380 * z, st.width - 24, vw - 24));
    const cx = Math.min(Math.max(st.left + st.width / 2, 12 + w / 2), vw - 12 - w / 2);
    el.style.width = w / z + "px"; el.style.left = cx / z + "px";
    if (!strip.hidden && strip.offsetParent){
      el.style.bottom = (window.innerHeight - vrect(strip).top + 12) / z + "px";
    } else el.style.bottom = "";
  },
  step(){ this.done++; if (this.done === 1 || this.done % 12 === 0) this.place(); this.tLast = performance.now(); this.render(); },
  note(text){ $("#progEta").textContent = text; },
  cancel(){ if (!this.active) return; this.cancelled = true; $("#prog").classList.add("cancelling"); $("#progX").disabled = true; this.note("Wird abgebrochen …"); },
  end(){ this.active = false; clearInterval(this.timer); $("#prog").hidden = true; return (performance.now() - this.t0) / 1000; },
  render(){
    if (!this.active || this.cancelled) return;
    const pct = this.total ? Math.floor(this.done / this.total * 100) : 0;
    $("#progCount").textContent = `${this.done}/${this.total}`;
    $("#progFill").style.width = pct + "%"; $("#progPct").textContent = pct + " %";
    $("#prog").setAttribute("aria-valuenow", pct);
    const elapsed = performance.now() - this.t0;
    if (this.done >= this.total){ return; }
    if (this.done < 1 || elapsed < 800){ this.note("Restzeit wird berechnet …"); return; }
    const per = (this.tLast - this.t0) / this.done;
    const rest = Math.max(0, per * (this.total - this.done) - (performance.now() - this.tLast)) / 1000;
    this.note("Restzeit: " + fmtRest(rest));
  }
};
function fmtRest(s){
  if (s < 10) return "wenige Sekunden";
  if (s < 55) return `ca. ${Math.round(s / 5) * 5} Sekunden`;
  const m = Math.round(s / 60);
  if (m <= 1) return "ca. 1 Minute";
  if (m < 60) return `ca. ${m} Minuten`;
  const h = Math.floor(m / 60), mm = m % 60;
  return `ca. ${h} Std.` + (mm ? ` ${mm} Min.` : "");
}
function fmtDuration(s){
  if (s < 60) return `${Math.max(1, Math.round(s))} s`;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")} min`;
}
$("#progX").addEventListener("click", () => Prog.cancel());
window.addEventListener("resize", () => { if (Prog.active) Prog.place(); });

/* ---------- Loading images ---------- */
let nextId = 1;
async function addFiles(list){
  const files = [...list].filter(f => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
  if (!files.length){ toast("Keine Bilddateien gefunden."); return; }
  const showProg = files.length > 1 && !Prog.active;
  if (showProg) Prog.start(files.length, "Bilder laden");
  let failed = 0, loaded = 0;
  for (const f of files){
    if (showProg && Prog.cancelled) break;
    try{
      let bmp;
      try{ bmp = await createImageBitmap(f, {imageOrientation:"from-image"}); }
      catch{ bmp = await createImageBitmap(f); }
      const t = document.createElement("canvas"), ts = 128 / Math.max(bmp.width, bmp.height);
      t.width = Math.max(1, Math.round(bmp.width*ts)); t.height = Math.max(1, Math.round(bmp.height*ts));
      t.getContext("2d").drawImage(bmp, 0, 0, t.width, t.height);
      S.images.push({id:nextId++, name:f.name, bmp, w:bmp.width, h:bmp.height, crop:null, thumb:t.toDataURL("image/jpeg", .75)});
      loaded++;
      // erstes Bild sofort zeigen, Bildleiste in Schüben aktualisieren
      if (S.cur < 0){ S.cur = 0; drawStage(); }
      if (showProg && loaded % 12 === 0){ renderStrip(); syncCounts(); }
    }catch{ failed++; }
    if (showProg) Prog.step();
  }
  const cancelled = showProg && Prog.cancelled;
  if (showProg) Prog.end();
  if (S.cur < 0 && S.images.length) S.cur = 0;
  if (cancelled) toast(`Laden abgebrochen – ${loaded} von ${files.length} Bildern geladen`, 4000);
  else if (failed) toast(`${failed} Datei(en) konnten nicht geöffnet werden. Das Format wird vom Browser nicht unterstützt.`, 4500);
  renderStrip(); drawStage(); syncCounts();
}
function removeImage(i){
  const [im] = S.images.splice(i, 1);
  im.bmp.close && im.bmp.close();
  if (S.cur >= S.images.length) S.cur = S.images.length - 1;
  renderStrip(); drawStage(); syncCounts();
}
function selectImage(i){ S.cur = i; renderStrip(); drawStage(); }

function renderStrip(){
  const strip = $("#strip"); strip.textContent = "";
  $("#stripWrap").hidden = !S.images.length;
  if (!S.images.length) return;
  S.images.forEach((im, i) => {
    const b = document.createElement("div");
    b.className = "thumb"; b.setAttribute("aria-current", i === S.cur);
    b.innerHTML = `<button style="all:unset;display:block;width:100%;height:100%;cursor:pointer" aria-label=""><img alt=""></button><button class="x" aria-label="Bild entfernen"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    const sel = b.firstElementChild;
    sel.setAttribute("aria-label", im.name + " anzeigen");
    sel.querySelector("img").src = im.thumb;
    sel.onclick = () => selectImage(i);
    b.querySelector(".x").onclick = e => { e.stopPropagation(); removeImage(i); };
    strip.appendChild(b);
  });
  const add = document.createElement("button");
  add.className = "add-tile"; add.setAttribute("aria-label", "Weitere Bilder hinzufügen");
  add.innerHTML = `<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`;
  add.onclick = pick; strip.appendChild(add);
  strip.querySelector('[aria-current="true"]')?.scrollIntoView({block:"nearest", inline:"nearest"});
}
function syncCounts(){
  updateToolState();
  const n = S.images.length;
  $("#stripCount").textContent = n ? `${n} ${n === 1 ? "Bild" : "Bilder"}` : "";
  $("#clearBtn").disabled = !n;
  $("#exportAllBtn").disabled = n < 2;
  const target = NATIVE ? "in Ordner exportieren" : "als ZIP exportieren";
  $("#exportAllBtn").textContent = n > 1 ? `Alle ${n} ${target}` : "Alle " + target;
}
const fileIn = $("#fileIn");
function pick(){ fileIn.click(); }
fileIn.addEventListener("change", () => { addFiles(fileIn.files); fileIn.value = ""; });

const wrap = $("#wrap");
["dragenter","dragover"].forEach(t => document.addEventListener(t, e => { e.preventDefault(); wrap.classList.add("dragging"); }));
["dragleave","drop"].forEach(t => document.addEventListener(t, e => {
  if (t === "dragleave" && e.relatedTarget) return;
  e.preventDefault(); wrap.classList.remove("dragging");
}));
document.addEventListener("drop", e => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

/* ---------- Saving files ---------- */
let dlNs;
async function getDownloads(){
  if (dlNs !== undefined) return dlNs;
  try{ dlNs = (window.claude && window.claude.use) ? await window.claude.use("downloads") : null; }
  catch{ dlNs = null; }
  return dlNs;
}
async function saveFile(filename, data){
  if (NATIVE){
    const dir = await saveDir();
    try{
      let p;
      if (prefs.save.ask || !dir){
        const ext = filename.split(".").pop();
        const path = await TAURI.dialog.save({defaultPath: joinDir(dir, filename), filters:[{name: ext.toUpperCase(), extensions:[ext]}]});
        if (!path) return;
        p = await writeNative(await toBytes(data), {"x-path": path});
      } else {
        p = await writeNative(await toBytes(data), {"x-dir": dir, "x-name": filename, "x-unique": "1"});
      }
      toast("Gespeichert: " + baseOf(p));
    }catch(e){ toast("Speichern nicht möglich: " + e, 4500); }
    return;
  }
  const dl = await getDownloads();
  if (dl){
    try{
      const r = await dl.save({filename, data});
      if (r.status === "saved") toast("Gespeichert: " + filename);
    }catch(e){
      if (e && e.code === "declined") return;
      if (e && e.code === "rate_limited"){ toast("Bitte kurz warten und erneut versuchen."); return; }
      toast("Speichern nicht möglich: " + (e?.message || e?.code || "unbekannter Fehler"));
    }
    return;
  }
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Gespeichert: " + filename);
}

/* ---------- ZIP (unkomprimiert, Bilder sind bereits komprimiert) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files){
  const enc = new TextEncoder(), parts = [], central = [];
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const f of files){
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true);
    ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true);
    ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], {type:"application/zip"});
}

/* ---------- Export ---------- */
let busy = false;
async function exportOne(){
  const im = cur();
  if (!im){ toast("Öffne zuerst ein Bild."); return; }
  if (busy) return;
  busy = true;
  try{
    const cv = renderFull(im), blob = await encode(cv); cv.width = 0;
    warnFormat(blob);
    await saveFile(outName(im, blob), blob);
  }catch(e){ toast("Export fehlgeschlagen: " + e.message); }
  busy = false;
}
async function exportAll(){
  if (!S.images.length){ toast("Öffne zuerst Bilder."); return; }
  if (Prog.active){ toast("Bitte warten, bis der laufende Vorgang fertig ist."); return; }
  if (busy) return;
  if (S.images.length === 1) return exportOne();
  if (NATIVE) return exportAllToFolder();
  busy = true;
  const list = S.images.slice(), files = [], used = new Set();
  let failed = 0;
  Prog.start(list.length, "Export");
  try{
    for (let i = 0; i < list.length; i++){
      if (Prog.cancelled) break;
      await new Promise(r => setTimeout(r, 0));
      try{
        const im = list[i], cv = renderFull(im), blob = await encode(cv); cv.width = 0;
        if (i === 0) warnFormat(blob, true);
        let name = outName(im, blob), n = 2;
        while (used.has(name)){ name = name.replace(/(\.[^.]+)$/, `-${n++}$1`); }
        used.add(name);
        files.push({name, data:new Uint8Array(await blob.arrayBuffer())});
      }catch{ failed++; }
      Prog.step();
    }
    if (Prog.cancelled){ Prog.end(); toast("Export abgebrochen – es wurde nichts gespeichert.", 4000); busy = false; return; }
    Prog.note("ZIP wird erstellt …");
    await new Promise(r => setTimeout(r, 30));
    const zip = makeZip(files), secs = Prog.end();
    await saveFile("bildwerk-export.zip", zip);
    toast(`${files.length} Bilder in ${fmtDuration(secs)} verarbeitet` + (failed ? ` – ${failed} fehlgeschlagen` : ""), 4500);
  }catch(e){ Prog.end(); toast("Export fehlgeschlagen: " + e.message); }
  busy = false;
}
async function exportAllToFolder(){
  let dir = await saveDir();
  if (prefs.save.ask || !dir){
    try{
      dir = await TAURI.dialog.open({directory:true, multiple:false, title:tt("Zielordner für den Export wählen"), defaultPath: dir || undefined});
    }catch(e){ toast("Dialog konnte nicht geöffnet werden: " + e); return; }
    if (!dir) return;
  }
  busy = true;
  const list = S.images.slice(), total = list.length;
  let saved = 0, failed = 0;
  Prog.start(total, "Export");
  for (let i = 0; i < total; i++){
    if (Prog.cancelled) break;
    await new Promise(r => setTimeout(r, 0));
    try{
      const im = list[i], cv = renderFull(im), blob = await encode(cv); cv.width = 0;
      await writeNative(new Uint8Array(await blob.arrayBuffer()), {"x-dir": dir, "x-name": outName(im, blob), "x-unique": "1"});
      saved++;
    }catch{ failed++; }
    Prog.step();
  }
  const cancelled = Prog.cancelled, secs = Prog.end();
  if (cancelled) toast(`Export abgebrochen – ${saved} von ${total} Bildern gespeichert in „${baseOf(dir)}“`, 5000);
  else toast(`${saved} Bilder in ${fmtDuration(secs)} gespeichert in „${baseOf(dir)}“` + (failed ? ` – ${failed} fehlgeschlagen` : ""), 5000);
  busy = false;
}
// Standardordner: eigener Ordner aus den Einstellungen, sonst der Bilder-Ordner des Systems
let sysPictures = null;
async function saveDir(){
  if (prefs.save.dir) return prefs.save.dir;
  if (sysPictures === null){
    try{ sysPictures = NATIVE && TAURI.path ? await TAURI.path.pictureDir() : ""; }catch{ sysPictures = ""; }
  }
  return sysPictures;
}
function warnFormat(blob, silent){
  if (blob.type !== S.settings.export.format && !silent)
    toast(`${FMT[S.settings.export.format][1]} wird von diesem Browser nicht unterstützt, gespeichert als ${(FMT[blob.type]||["?","?"])[1]}.`, 4500);
}

/* ---------- Workflows ---------- */
function summary(s){
  const parts = [];
  const r = s.ratio === "free" ? "Freier Zuschnitt" : s.ratio === "original" ? "Original-Format" :
            s.ratio === "custom" ? `${s.customW}:${s.customH}` : s.ratio;
  parts.push(r);
  if (s.rotate) parts.push(`Drehung ${s.rotate}°`);
  if (s.flipH || s.flipV) parts.push("gespiegelt");
  if (s.resize.enabled) parts.push(`max. ${s.resize.maxW || "∞"} × ${s.resize.maxH || "∞"} px`);
  parts.push(FMT[s.export.format][1] + (s.export.format === "image/png" ? "" : ` ${s.export.quality} %`));
  return parts.join(" · ");
}
function renderWorkflows(){
  const box = $("#wfList"); box.textContent = "";
  if (!S.workflows.length){
    const e = document.createElement("div"); e.className = "empty-note";
    e.textContent = "Noch keine Abläufe gespeichert. Stelle alles ein, gib einen Namen ein und speichere."; box.appendChild(e); return;
  }
  S.workflows.forEach(w => {
    const el = document.createElement("div"); el.className = "wf";
    el.innerHTML = `<div class="wf-name" translate="no"></div><div class="wf-sum"></div><div class="wf-act"><button class="btn primary">Anwenden</button><button class="btn ghost">Löschen</button></div>`;
    el.querySelector(".wf-name").textContent = w.name;
    el.querySelector(".wf-sum").textContent = summary(w.settings);
    const [apply, del] = el.querySelectorAll("button");
    apply.onclick = () => {
      S.settings = merge(DEFAULTS, w.settings); resetCrops(); persist(); syncUI(); drawStage();
      toast(`„${w.name}“ angewendet`);
    };
    del.onclick = () => {
      S.workflows = S.workflows.filter(x => x.id !== w.id); store.set("bildwerk.workflows", S.workflows); renderWorkflows();
      toast(`„${w.name}“ gelöscht`);
    };
    box.appendChild(el);
  });
}
function saveWorkflow(){
  const inp = $("#wfName"), name = inp.value.trim();
  if (!name){ inp.focus(); toast("Gib dem Ablauf zuerst einen Namen."); return; }
  const existing = S.workflows.find(w => w.name.toLowerCase() === name.toLowerCase());
  if (existing){ existing.settings = clone(S.settings); }
  else S.workflows.unshift({id:Date.now().toString(36) + Math.random().toString(36).slice(2,6), name, settings:clone(S.settings)});
  store.set("bildwerk.workflows", S.workflows); inp.value = ""; renderWorkflows();
  toast(existing ? `„${name}“ aktualisiert` : `„${name}“ gespeichert`);
}
$("#wfIn").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try{
    const data = JSON.parse(await f.text());
    const list = (Array.isArray(data) ? data : data.workflows || []).filter(w => w && w.name && w.settings);
    if (!list.length) throw new Error();
    list.forEach(w => S.workflows.push({id:Date.now().toString(36) + Math.random().toString(36).slice(2,6), name:String(w.name), settings:merge(DEFAULTS, w.settings)}));
    store.set("bildwerk.workflows", S.workflows); renderWorkflows();
    toast(`${list.length} Ablauf/Abläufe importiert`);
  }catch{ toast("Die Datei enthält keine gültigen Arbeitsabläufe."); }
});

/* ---------- Werkzeugleiste ---------- */
const IC = {
  open:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 16l3-3 2 2 2-2 3 3"/>',
  crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  rotR:'<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  rotL:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/>',
  flipH:'<path d="M12 3v18"/><path d="M8 7l-5 5 5 5z"/><path d="M16 7l5 5-5 5z"/>',
  flipV:'<path d="M3 12h18"/><path d="M7 8l5-5 5 5z"/><path d="M7 16l5 5 5-5z"/>',
  resize:'<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  export:'<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  plusSq:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
  undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  camera:'<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>',
  stack:'<rect x="7" y="7" width="13" height="13" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  grip:'<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  up:'<path d="M6 15l6-6 6 6"/>', down:'<path d="M6 9l6 6 6-6"/>',
  minus:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>', plus:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'
};
const svg = p => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
// pane: öffnet einen Bereich im Seitenpanel · act: führt sofort eine Aktion aus
const TOOLS = {
  crop:{label:"Zuschneiden", pane:true, icon:IC.crop},
  transform:{label:"Drehen & Spiegeln", pane:true, icon:IC.rotR},
  resize:{label:"Größe", pane:true, icon:IC.resize},
  export:{label:"Export", pane:true, icon:IC.export},
  workflows:{label:"Arbeitsabläufe", pane:true, icon:IC.layers},
  pick:{label:"Bilder hinzufügen", act:"pick", icon:IC.plusSq},
  rotL:{label:"90° links drehen", act:"rotL", icon:IC.rotL},
  rotR:{label:"90° rechts drehen", act:"rotR", icon:IC.rotR},
  flipH:{label:"Horizontal spiegeln", act:"flipH", icon:IC.flipH},
  flipV:{label:"Vertikal spiegeln", act:"flipV", icon:IC.flipV},
  resetCrop:{label:"Zuschnitt zurücksetzen", act:"resetCrop", icon:IC.undo},
  exportOne:{label:"Schnell exportieren", act:"exportOne", icon:IC.bolt},
  exportAll:{label:"Alle exportieren", act:"exportAll", icon:IC.stack},
  screenshot:{label:"Screenshot", act:"screenshot", icon:IC.camera, feature:"screenshot"}
};
const toolEnabled = id => !TOOLS[id].feature || !!(prefs[TOOLS[id].feature] && prefs[TOOLS[id].feature].enabled);
const DEFAULT_BAR = ["crop","transform","resize","export","workflows"];
const cleanBar = list => (Array.isArray(list) ? list : DEFAULT_BAR).filter((id, i, a) => TOOLS[id] && toolEnabled(id) && a.indexOf(id) === i);
let bar = cleanBar(store.get("bildwerk.toolbar", null));

function renderRail(){
  const nav = $("#toolNav"); nav.textContent = "";
  for (const id of bar){
    const t = TOOLS[id], b = document.createElement("button");
    b.className = "tool"; b.title = t.label;
    if (t.pane){ b.dataset.tool = id; b.setAttribute("aria-pressed", S.tool === id); }
    else b.dataset.act = t.act;
    b.innerHTML = svg(t.icon) + '<span class="lbl"></span><span class="dot" aria-hidden="true"></span>';
    b.querySelector(".lbl").textContent = t.label;
    nav.appendChild(b);
  }
  updateToolState();
}
/* ---------- Welche Werkzeuge wirken gerade auf die Bilder? ---------- */
// Punkt an den Werkzeugen in der Leiste und Chips oben in der Kopfzeile, die sich einzeln
// zurücksetzen lassen. So ist auf einen Blick klar, was beim Export angewendet wird.
const fullCrop = c => !c || (c.x < 0.001 && c.y < 0.001 && c.w > 0.999 && c.h > 0.999);
function activeAdjustments(){
  const s = S.settings, list = [];
  const manual = S.images.some(im => im.crop && !fullCrop(im.crop));
  if (s.ratio !== "free" || manual){
    const r = RATIOS.find(x => x[0] === s.ratio);
    const lbl = s.ratio === "free" ? "" : s.ratio === "custom" ? `${s.customW}:${s.customH}` : r ? r[1] : s.ratio;
    list.push({tool:"crop", text: lbl ? `Zuschnitt ${lbl}` : "Zuschnitt", reset:"Zuschnitt zurücksetzen"});
  }
  if (s.rotate || s.flipH || s.flipV){
    const parts = [];
    if (s.rotate) parts.push(`Drehung ${s.rotate}°`);
    if (s.flipH) parts.push("horizontal gespiegelt");
    if (s.flipV) parts.push("vertikal gespiegelt");
    list.push({tool:"transform", text: parts.join(", "), reset:"Drehung zurücksetzen"});
  }
  if (s.resize.enabled){
    const w = s.resize.maxW || "∞", h = s.resize.maxH || "∞";
    list.push({tool:"resize", text: w === h ? `max. ${w} px` : `max. ${w} × ${h} px`, reset:"Größenbegrenzung aufheben"});
  }
  return list;
}
function updateToolState(){
  const list = activeAdjustments(), used = new Set(list.map(a => a.tool));
  $$(".rail .tool[data-tool]").forEach(b => b.classList.toggle("used", used.has(b.dataset.tool)));
  const box = $("#activeAdj"); if (!box) return;
  box.textContent = "";
  list.forEach(a => {
    const chip = document.createElement("span"); chip.className = "adj";
    chip.innerHTML = '<button class="adj-open"></button><button class="adj-x">' + svg('<path d="M6 6l12 12M18 6L6 18"/>') + '</button>';
    const open = chip.firstElementChild, x = chip.lastElementChild;
    open.textContent = a.text; open.title = TOOLS[a.tool] ? TOOLS[a.tool].label : a.text;
    open.onclick = () => { if (S.tool !== a.tool) setTool(a.tool); };
    x.title = a.reset; x.setAttribute("aria-label", a.reset);
    x.onclick = e => { e.stopPropagation(); resetAdjustment(a.tool); };
    box.appendChild(chip);
  });
}
function resetAdjustment(tool){
  const s = S.settings;
  if (tool === "crop"){ s.ratio = "free"; resetCrops(); }
  else if (tool === "transform") Object.assign(s, {rotate:0, flipH:false, flipV:false});
  else if (tool === "resize") s.resize.enabled = false;
  if (tool === "crop" || tool === "transform") resetCrops();
  persist(); syncUI(); drawStage();
}
function renderBarEditor(){
  const on = $("#barOn"), off = $("#barOff");
  on.textContent = ""; off.textContent = "";
  bar.forEach((id, i) => {
    const t = TOOLS[id], li = document.createElement("li");
    li.className = "bar-row"; li.dataset.id = id;
    li.innerHTML = `<span class="grip" title="Ziehen zum Sortieren">${svg(IC.grip)}</span>${svg(t.icon)}
      <span class="bar-txt"><span class="bar-lbl"></span></span>
      <button class="ib" data-m="up">${svg(IC.up)}</button>
      <button class="ib" data-m="down">${svg(IC.down)}</button>
      <button class="ib" data-m="remove">${svg(IC.minus)}</button>`;
    li.querySelector(".bar-lbl").textContent = t.label;
    const [up, down, rm] = li.querySelectorAll(".ib");
    up.setAttribute("aria-label", t.label + " nach oben"); up.disabled = i === 0;
    down.setAttribute("aria-label", t.label + " nach unten"); down.disabled = i === bar.length - 1;
    rm.setAttribute("aria-label", t.label + " aus der Leiste entfernen");
    on.appendChild(li);
  });
  if (!bar.length) on.innerHTML = '<li class="empty-note">Die Leiste ist leer. Füge unten Werkzeuge hinzu.</li>';
  const avail = Object.keys(TOOLS).filter(id => toolEnabled(id) && !bar.includes(id));
  avail.forEach(id => {
    const t = TOOLS[id], li = document.createElement("li");
    li.className = "bar-row"; li.dataset.id = id;
    li.innerHTML = `${svg(t.icon)}<span class="bar-txt"><span class="bar-lbl"></span><span class="bar-kind"></span></span>
      <button class="ib add" data-m="add">${svg(IC.plus)}</button>`;
    li.querySelector(".bar-lbl").textContent = t.label;
    li.querySelector(".bar-kind").textContent = t.pane ? "Öffnet einen Bereich" : "Sofort-Aktion";
    li.querySelector(".ib").setAttribute("aria-label", t.label + " zur Leiste hinzufügen");
    off.appendChild(li);
  });
  if (!avail.length) off.innerHTML = '<li class="empty-note">Alle Werkzeuge sind bereits in der Leiste.</li>';
}
function commitBar(focus){
  store.set("bildwerk.toolbar", bar);
  renderRail(); renderBarEditor();
  if (focus){
    const el = document.querySelector(focus) ||
      document.querySelector('#barOn .ib:not(:disabled)') || document.querySelector('#barOff .ib');
    el && el.focus();
  }
}
$("#barOn").addEventListener("click", e => {
  const b = e.target.closest("[data-m]"); if (!b || b.disabled) return;
  const id = b.closest(".bar-row").dataset.id, i = bar.indexOf(id);
  if (b.dataset.m === "up" && i > 0){ [bar[i-1], bar[i]] = [bar[i], bar[i-1]]; }
  else if (b.dataset.m === "down" && i < bar.length - 1){ [bar[i+1], bar[i]] = [bar[i], bar[i+1]]; }
  else if (b.dataset.m === "remove"){ bar.splice(i, 1); toast(`„${TOOLS[id].label}“ entfernt`); }
  else return;
  commitBar(b.dataset.m === "remove" ? "#barOn .ib" : `#barOn [data-id="${id}"] [data-m="${b.dataset.m}"]:not(:disabled)`);
});
$("#barOff").addEventListener("click", e => {
  const b = e.target.closest("[data-m=add]"); if (!b) return;
  const id = b.closest(".bar-row").dataset.id;
  bar.push(id); toast(`„${TOOLS[id].label}“ hinzugefügt`);
  commitBar("#barOff .ib");
});
// Sortieren per Ziehen (Maus und Touch)
let barDrag = null;
const barOn = $("#barOn");
barOn.addEventListener("pointerdown", e => {
  const g = e.target.closest(".grip"); if (!g) return;
  barDrag = g.closest(".bar-row"); barDrag.classList.add("dragging");
  barOn.setPointerCapture(e.pointerId); e.preventDefault();
});
barOn.addEventListener("pointermove", e => {
  if (!barDrag) return;
  let before = null;
  for (const r of barOn.querySelectorAll(".bar-row")){
    if (r === barDrag) continue;
    const rc = vrect(r);
    if (e.clientY < rc.top + rc.height/2){ before = r; break; }
  }
  if (before !== barDrag.nextElementSibling) barOn.insertBefore(barDrag, before);
});
const endBarDrag = () => {
  if (!barDrag) return;
  barDrag.classList.remove("dragging"); barDrag = null;
  bar = [...barOn.querySelectorAll(".bar-row")].map(r => r.dataset.id);
  commitBar();
};
barOn.addEventListener("pointerup", endBarDrag);
barOn.addEventListener("pointercancel", endBarDrag);

/* ---------- UI sync ---------- */
// Einstellungen und „Anpassen“ sind Nebenbereiche: Schließen führt zurück zum vorherigen Werkzeug,
// damit sich die Aufteilung des Fensters danach nicht verändert.
const SECONDARY = new Set(["toolbar"]);
function setTool(t){
  if (S.tool === t && t){
    if (SECONDARY.has(t)){ closeSecondary(); return; }
    closeTool(); return;                      // erneuter Klick: Werkzeug schließen
  } else {
    // „Anpassen“ merkt sich das Werkzeug für die Rückkehr
    if (SECONDARY.has(t) && !SECONDARY.has(S.tool)) S.prevTool = S.tool;
    S.tool = t; app.dataset.panel = "open";
  }
  app.dataset.tool = t;
  if (t === "toolbar") hideCoach();
  $$(".rail .tool[data-tool]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tool === t));
  $$(".pane").forEach(p => p.classList.toggle("on", p.dataset.pane === t));
  requestAnimationFrame(drawStage);
}
function syncUI(){
  const s = S.settings;
  updateToolState();
  $$("#ratioChips .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.ratio === s.ratio));
  $("#customRatio").hidden = s.ratio !== "custom";
  $("#customW").value = s.customW; $("#customH").value = s.customH;
  $("#flipHBtn").setAttribute("aria-pressed", s.flipH); $("#flipVBtn").setAttribute("aria-pressed", s.flipV);
  const tn = [];
  if (s.rotate) tn.push(`Gedreht um ${s.rotate}°`);
  if (s.flipH) tn.push("horizontal gespiegelt");
  if (s.flipV) tn.push("vertikal gespiegelt");
  $("#transformNote").textContent = tn.length ? tn.join(", ") + "." : "Keine Drehung oder Spiegelung.";
  $("#resizeOn").checked = s.resize.enabled; $("#resizeFields").disabled = !s.resize.enabled;
  $("#maxW").value = s.resize.maxW || ""; $("#maxH").value = s.resize.maxH || "";
  $("#keepAspect").checked = s.resize.keepAspect;
  $$("#sizeChips .chip").forEach(c => c.setAttribute("aria-pressed", +c.dataset.size === s.resize.maxW && +c.dataset.size === s.resize.maxH));
  $$("#fmtSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.fmt === s.export.format));
  const png = s.export.format === "image/png";
  $("#qualityGroup").disabled = png; $("#pngNote").hidden = !png;
  $("#quality").value = s.export.quality; $("#qVal").textContent = s.export.quality + " %";
  $$("[data-q]").forEach(c => c.setAttribute("aria-pressed", +c.dataset.q === s.export.quality));
  $("#suffix").value = s.export.suffix;
  $$("#setFmtSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.fmt === s.export.format));
  $("#setQualityGroup").disabled = png;
  $("#setQuality").value = s.export.quality; $("#setQVal").textContent = s.export.quality + " %";
  updateNamePreview();
}
function updateNamePreview(){
  const im = cur();
  const base = im ? im.name.replace(/\.[^.]+$/, "") : (LANG === "en" ? "photo" : "foto");
  $("#namePreview").textContent = "Beispiel: " + base + (S.settings.export.suffix || "") + "." + FMT[S.settings.export.format][0];
}
function changed(redraw = true, crops = false){
  if (crops) resetCrops();
  persist(); syncUI();
  if (redraw) drawStage(); else updateInfo();
}

// Ratio chips
const rc = $("#ratioChips");
const ADV_RATIOS = ["3:4","2:3","9:16","4:5","5:4","custom"];
RATIOS.forEach(([v, l]) => { const b = document.createElement("button"); b.className = "chip" + (ADV_RATIOS.includes(v) ? " adv" : ""); b.dataset.ratio = v; b.textContent = l; rc.appendChild(b); });
rc.addEventListener("click", e => { const v = e.target.dataset.ratio; if (!v) return; S.settings.ratio = v; changed(true, true); });
["customW","customH"].forEach(id => $("#" + id).addEventListener("input", e => {
  const n = parseFloat(e.target.value); if (!(n > 0)) return;
  S.settings[id] = n; resetCrops(); persist(); drawStage();
}));

// Resize
$("#resizeOn").addEventListener("change", e => { S.settings.resize.enabled = e.target.checked; changed(false); });
["maxW","maxH"].forEach(id => $("#" + id).addEventListener("input", e => {
  const n = parseInt(e.target.value, 10); S.settings.resize[id] = n > 0 ? n : 0; persist(); updateInfo();
  $$("#sizeChips .chip").forEach(c => c.setAttribute("aria-pressed", +c.dataset.size === S.settings.resize.maxW && +c.dataset.size === S.settings.resize.maxH));
}));
$("#keepAspect").addEventListener("change", e => { S.settings.resize.keepAspect = e.target.checked; changed(false); });
$("#sizeChips").addEventListener("click", e => {
  const n = +e.target.dataset.size; if (!n) return;
  Object.assign(S.settings.resize, {maxW:n, maxH:n, enabled:true}); changed(false);
});

// Export settings
$("#fmtSeg").addEventListener("click", e => { const f = e.target.dataset.fmt; if (!f) return; S.settings.export.format = f; changed(false); });
$("#quality").addEventListener("input", e => {
  S.settings.export.quality = +e.target.value; $("#qVal").textContent = e.target.value + " %";
  $$("[data-q]").forEach(c => c.setAttribute("aria-pressed", +c.dataset.q === S.settings.export.quality));
  persist(); updateInfo();
});
$$("[data-q]").forEach(c => c.addEventListener("click", () => { S.settings.export.quality = +c.dataset.q; changed(false); }));
$("#suffix").addEventListener("input", e => { S.settings.export.suffix = e.target.value.replace(/[\\/:*?"<>|]/g, ""); persist(); updateNamePreview(); });

// Actions
const ACTIONS = {
  pick, exportOne, exportAll, saveWf: saveWorkflow,
  clear(){
    const n = S.images.length; if (!n) return;
    const doClear = () => { S.images.forEach(im => im.bmp.close && im.bmp.close()); S.images = []; S.cur = -1; renderStrip(); drawStage(); syncCounts(); };
    if (n === 1){ doClear(); return; }
    showModal({title:"Alle Bilder entfernen?", body:[`Die ${n} Bilder werden aus Bildwerk entfernt. Die Dateien auf deinem Gerät bleiben erhalten, nicht exportierte Änderungen gehen aber verloren.`],
      actions:[{label:"Abbrechen"}, {label:"Alle entfernen", primary:true, onClick:doClear}]});
  },
  resetCrop(){ const im = cur(); if (im){ im.crop = null; layoutCrop(); updateInfo(); updateToolState(); } },
  rotL(){ S.settings.rotate = (S.settings.rotate + 270) % 360; changed(true, true); },
  rotR(){ S.settings.rotate = (S.settings.rotate + 90) % 360; changed(true, true); },
  flipH(){ S.settings.flipH = !S.settings.flipH; changed(true, true); },
  flipV(){ S.settings.flipV = !S.settings.flipV; changed(true, true); },
  resetTransform(){ Object.assign(S.settings, {rotate:0, flipH:false, flipV:false}); changed(true, true); },
  exportWf(){
    if (!S.workflows.length){ toast("Es gibt noch keine Abläufe zum Exportieren."); return; }
    saveFile(LANG === "en" ? "bildwerk-workflows.json" : "bildwerk-ablaeufe.json", JSON.stringify({app:"Bildwerk", version:1, workflows:S.workflows}, null, 2));
  },
  importWf(){ $("#wfIn").click(); },
  screenshot(){ startScreenshot(); },
  openGithub(){ openUrl(GITHUB_URL); },
  whatsNew(){ showWhatsNew(null); },
  checkUpdates(){ checkUpdates(true); },
  installUpdate(){ if (pendingUpdate) installUpdate(pendingUpdate); },
  async pickSaveDir(){
    if (!NATIVE) return;
    try{
      const d = await TAURI.dialog.open({directory:true, multiple:false, title:tt("Standardordner wählen"), defaultPath: (await saveDir()) || undefined});
      if (d){ prefs.save.dir = d; savePrefs(); syncSaveSettings(); toast("Standardordner: " + baseOf(d)); }
    }catch(e){ toast("Dialog konnte nicht geöffnet werden: " + e); }
  },
  resetSaveDir(){ prefs.save.dir = ""; savePrefs(); syncSaveSettings(); toast("Standardordner zurückgesetzt"); },
  clearShotKey(){ setShortcut(""); },
  closeCustomize(){ closeSecondary(); },
  openSettings(){ setWin.hidden ? openSettings() : closeSettings(); },
  closeSettings(){ closeSettings(); },
  resetBar(){ bar = [...DEFAULT_BAR]; commitBar(); toast("Standard-Werkzeugleiste wiederhergestellt"); }
};
document.addEventListener("click", e => {
  const a = e.target.closest("[data-act]"); if (a && ACTIONS[a.dataset.act]) ACTIONS[a.dataset.act]();
  const t = e.target.closest(".rail .tool[data-tool]"); if (t) setTool(t.dataset.tool);
});
$("#collapse").addEventListener("click", () => {
  const c = app.dataset.collapsed !== "true"; app.dataset.collapsed = c; store.set("bildwerk.collapsed", c);
  setCollapseLabel(c);
  setTimeout(() => { drawStage(); placeCoach(); }, 200);
});

// Nebenbereich schließen: zurück zum vorherigen Werkzeug (falls es noch in der Leiste ist)
// Kein Werkzeug geöffnet: Seitenfeld zu, nichts hervorgehoben
function closeTool(){
  S.tool = null; app.dataset.panel = "closed"; app.dataset.tool = "";
  $$(".rail .tool[data-tool]").forEach(b => b.setAttribute("aria-pressed", "false"));
  $$(".pane").forEach(p => p.classList.remove("on"));
  requestAnimationFrame(drawStage);
}
function closeSecondary(){
  if (!SECONDARY.has(S.tool)) return;
  if (!S.prevTool){ closeTool(); return; }  // vorher war kein Werkzeug offen
  let back = S.prevTool;
  if (!back || SECONDARY.has(back) || !TOOLS[back] || !bar.includes(back) || !TOOLS[back].pane) back = bar.find(id => TOOLS[id].pane) || "crop";
  setTool(back);
}
// Esc schließt Einstellungen und „Werkzeugleiste anpassen“
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !SECONDARY.has(S.tool) || app.dataset.panel === "closed") return;
  if (!$("#shot").hidden || !$("#modal").hidden || !$("#ctxMenu").hidden || !$("#coach").hidden || recording) return;
  if (e.target.closest("input, textarea, select")) e.target.blur();
  closeSecondary();
});

// Keyboard
document.addEventListener("keydown", e => {
  if (!$("#shot").hidden || !$("#modal").hidden || !$("#setWin").hidden) return;
  if (e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "r") e.shiftKey ? ACTIONS.rotL() : ACTIONS.rotR();
  else if (k === "h") ACTIONS.flipH();
  else if (k === "v") ACTIONS.flipV();
  else if (k === "o") pick();
  else if (e.key === "ArrowRight" && S.cur < S.images.length - 1) selectImage(S.cur + 1);
  else if (e.key === "ArrowLeft" && S.cur > 0) selectImage(S.cur - 1);
  else return;
  e.preventDefault();
});

// Toast
let toastT = 0;
function toast(msg, ms = 2600){
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms);
}

/* ---------- Version, Changelog, Info ---------- */
// Bei jeder neuen Version: APP_VERSION, tauri.conf.json, Cargo.toml, package.json und CHANGELOG anpassen.
const APP_VERSION = "0.3.0";
// Eigenes GitHub-Repository hier eintragen (auch in tauri.conf.json → plugins.updater.endpoints)
const GITHUB_URL = "https://github.com/Olcay91/Bildwerk";
const CHANGELOG = [
  {version:"0.3.0", items:[
    "Englische Sprache und einfacher/erweiterter Modus in den Einstellungen",
    "Tooltips im Stil der Oberfläche",
    "Behoben: Die Zoomanzeige blieb bei 100 % stehen",
    "Erneuter Klick auf ein Werkzeug schließt es; benutzte Werkzeuge sind markiert und oben als Chips aufgelistet",
    "Öffnen der Einstellungen schließt das geöffnete Werkzeug",
    "Englisch: Dateinamen-Zusatz und Dateinamen ebenfalls auf Englisch",
    "Einstellungen öffnen sich in einem eigenen Fenster (verschiebbar, Esc oder Klick daneben schließt)",
    "Beim Start ist kein Werkzeug geöffnet; die Einstellungen beginnen immer mit „Info“",
    "Zuschneiden: auch an den Seiten ziehen, nicht nur an den Ecken",
    "macOS: Fehlt die Erlaubnis für Bildschirmaufnahmen, erklärt Bildwerk das einmal, statt immer wieder nachzufragen",
    "Behoben: Im Screenshot-Modus „Fenster“ ließ sich unter macOS kein Fenster auswählen",
    "Behoben: Unter macOS erschien zusätzlich ein System-Tooltip versetzt am Mauszeiger",
    "Behoben: Unter macOS saßen Tooltips und Hinweise bei vergrößerter Symbol- und Textgröße an der falschen Stelle",
    "macOS: Menüleiste auf Deutsch bzw. Englisch, „Einstellungen …“ im Bildwerk-Menü mit ⌘ ,; „Dienste“ entfernt",
    "Einstellungen mit Reitern für Info, Darstellung, Speichern, Screenshots und Updates",
    "Automatische Updates: Bildwerk sucht beim Start nach neuen Versionen und lädt sie auf Wunsch im Hintergrund",
    "Speichereinstellungen: Standardordner, Speichern ohne Nachfrage und Standard-Dateiformat",
    "Übersicht aller Tastenkürzel und dieses Änderungsprotokoll",
    "Neuer Screenshot-Modus „Bildlauf“ für lange Seiten im Browser oder Explorer",
    "Screenshots werden automatisch in die Zwischenablage kopiert",
    "Hell- und Dunkelmodus sowie einstellbare Größe von Symbolen und Text",
    "Werkzeuge in der Seitenleiste wahlweise als Symbole, Text oder beides",
    "Werkzeugleiste anpassen jetzt per Rechtsklick auf die Leiste (auf Touch-Geräten: lange gedrückt halten)",
    "Fortschrittsanzeige beim Laden und Exportieren vieler Bilder mit Restzeit und Abbrechen",
    "Bildlauf-Screenshots berücksichtigen Seiten mit endlosem Scrollen: Nachladen wird abgewartet, Grenze für die Länge einstellbar",
    "Bildlauf deutlich schneller: Schrittweite passt sich an, schnellere Erkennung",
    "Bildlauf: keine gelben Balken mehr im Ergebnis, Steuerleiste wird nicht mitaufgenommen",
    "Werkzeug „Bilder“ entfernt: „Alle entfernen“ sitzt jetzt in der Bildleiste, Bilder kommen per Drag & Drop, „+“ oder Sofort-Aktion dazu",
    "Screenshots: eigenes Dateiformat und optional automatisches Speichern im Standardordner",
    "Updates jetzt im Reiter „Info“; Einklappen-Button oben neben dem Programmnamen",
    "Bildlauf scrollt jetzt standardmäßig automatisch (abschaltbar)",
    "Behoben: Speichern, Exportieren und Zwischenablage funktionierten in der Desktop-App nicht",
    "Rechtsklick-Menü nur noch auf den Werkzeugen; kein Browser-Kontextmenü mehr in der App",
    "Bildlauf schließt am Seitenende automatisch ab – kein Klick auf „Fertig“ mehr nötig",
    "Behoben: Nach Fenster- oder Vollbild-Screenshots war der gesamte Text markiert",
    "Behoben: Nach dem Schließen der Einstellungen oder erneutem Klick auf ein Werkzeug verschob sich die Bildfläche",
    "Zoom in der Bildansicht: Strg + Mausrad, +/−, 1:1 und Einpassen; verschieben per Ziehen oder Mausrad"
  ]},
  {version:"0.2.0", items:[
    "Werkzeugleiste anpassen: Werkzeuge hinzufügen, entfernen und per Ziehen umsortieren",
    "Sofort-Aktionen wie Schnell exportieren, 90° drehen und Spiegeln für die Werkzeugleiste",
    "Screenshots von Bereich, Fenster oder Vollbild mit frei wählbarem Tastenkürzel"
  ]},
  {version:"0.1.0", items:[
    "Erste Version: Stapelverarbeitung, Zuschneiden mit Seitenverhältnis-Vorlagen, Drehen und Spiegeln, maximale Auflösung, Export mit Qualitätsauswahl und gespeicherte Arbeitsabläufe"
  ]}
];
let appVersion = APP_VERSION;
const verParts = v => String(v).split(/[.-]/).map(n => parseInt(n, 10) || 0);
function cmpVer(a, b){
  const x = verParts(a), y = verParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++){ const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
function openUrl(url){
  if (NATIVE && TAURI.opener) TAURI.opener.openUrl(url).catch(e => toast("Link konnte nicht geöffnet werden: " + e));
  else window.open(url, "_blank", "noopener");
}

/* Dialog */
const modal = $("#modal");
let modalReturn = null;
function showModal({title, body, actions}){
  $("#modalTitle").textContent = title;
  const b = $("#modalBody"); b.textContent = "";
  (Array.isArray(body) ? body : [body]).forEach(n => b.appendChild(typeof n === "string" ? Object.assign(document.createElement("p"), {textContent:n}) : n));
  const act = $("#modalAct"); act.textContent = "";
  (actions || [{label:"Schließen", primary:true}]).forEach(a => {
    const btn = document.createElement("button");
    btn.className = "btn" + (a.primary ? " primary" : " ghost"); btn.textContent = a.label;
    btn.onclick = () => { hideModal(); a.onClick && a.onClick(); };
    act.appendChild(btn);
  });
  modalReturn = document.activeElement;
  modal.hidden = false; hideCoach();
  (act.querySelector(".primary") || act.lastElementChild).focus();
}
function hideModal(){
  if (modal.hidden) return;
  modal.hidden = true;
  modalReturn && modalReturn.focus && modalReturn.focus();
}
modal.addEventListener("click", e => { if (e.target === modal) hideModal(); });
document.addEventListener("keydown", e => {
  if (modal.hidden) return;
  if (e.key === "Escape"){ e.preventDefault(); e.stopImmediatePropagation(); hideModal(); }
}, true);

function changelogNodes(entries){
  return entries.map(e => {
    const wrap = document.createElement("div");
    const h = document.createElement("div"); h.className = "cl-ver"; h.textContent = "Version " + e.version;
    if (cmpVer(e.version, appVersion) === 0){ const pill = document.createElement("span"); pill.className = "pill"; pill.textContent = "installiert"; h.appendChild(pill); }
    const ul = document.createElement("ul"); ul.className = "cl-list";
    e.items.forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    wrap.append(h, ul); return wrap;
  });
}
// Nach einem Update einmalig: was ist seit der zuletzt gesehenen Version neu?
function showWhatsNew(since){
  const list = CHANGELOG.filter(e => cmpVer(e.version, appVersion) <= 0 && (since == null ? cmpVer(e.version, appVersion) === 0 : cmpVer(e.version, since) > 0));
  const entries = list.length ? list : CHANGELOG.slice(0, 1);
  showModal({
    title: "Neu in Bildwerk " + appVersion,
    body: changelogNodes(entries),
    actions: [{label:"Alles klar", primary:true}]
  });
}
function renderInfo(){
  $("#aboutVer").textContent = "Version " + appVersion + (NATIVE ? "" : " · Web");
  $("#updVer").textContent = "Installiert: Version " + appVersion;
  const cl = $("#changelog"); cl.textContent = ""; changelogNodes(CHANGELOG).forEach(n => cl.appendChild(n));
  renderKeyList();
}
function renderKeyList(){
  const sc = prefs.screenshot;
  const groups = [
    ["Editor", [
      ["Bilder öffnen", "KeyO"], ["Vorheriges / nächstes Bild", "ArrowLeft", "ArrowRight"],
      ["90° nach rechts drehen", "KeyR"], ["90° nach links drehen", "Shift+KeyR"],
      ["Horizontal spiegeln", "KeyH"], ["Vertikal spiegeln", "KeyV"],
      ["Vergrößern / verkleinern", "Equal", "Minus"], ["Einpassen", "Digit0"], ["Originalgröße (100 %)", "Digit1"],
      ["Zoomen am Mauszeiger", "Control+Mausrad"], ["Verschieben", "Leertaste+Ziehen"],
      ["Screenshot aufnehmen", sc.enabled ? (sc.shortcut || null) : null],
      ["Einstellungen öffnen", IS_MAC ? "Super+Comma" : "Control+Comma"]
    ]],
    ["Screenshot-Auswahl", [
      ["Bereich", "Digit1"], ["Fenster", "Digit2"], ["Vollbild", "Digit3"],
      ...(NATIVE ? [["Bildlauf", "Digit4"]] : []),
      ["Vollbild aufnehmen", "Enter"], ["Abbrechen", "Escape"]
    ]],
    ["Allgemein", [["Hinweis oder Dialog schließen", "Escape"]]]
  ];
  const box = $("#keyList"); box.textContent = "";
  groups.forEach(([name, rows]) => {
    const g = document.createElement("div"); g.className = "key-group"; g.textContent = name; box.appendChild(g);
    rows.forEach(([label, ...accs]) => {
      const row = document.createElement("div"); row.className = "key-row";
      const l = document.createElement("span"); l.textContent = label;
      const k = document.createElement("span"); k.className = "keys-k";
      const real = accs.filter(Boolean);
      if (!real.length){
        const m = document.createElement("span"); m.className = "muted";
        m.textContent = label.startsWith("Screenshot") && !sc.enabled ? "ausgeschaltet" : "nicht festgelegt"; k.appendChild(m);
      }
      real.forEach((acc, ai) => {
        if (ai){ const s = document.createElement("span"); s.className = "muted"; s.textContent = "/"; k.appendChild(s); }
        acc.split("+").forEach((part, i) => {
          if (i){ const s = document.createElement("span"); s.className = "muted"; s.textContent = "+"; k.appendChild(s); }
          const kb = document.createElement("kbd"); kb.className = "k";
          kb.textContent = MOD_LABEL[part] || (part === "Escape" ? "Esc" : keyLabel(part));
          k.appendChild(kb);
        });
      });
      row.append(l, k); box.appendChild(row);
    });
  });
}

/* Reiter */
// Aktiver Reiter der Einstellungen – wird nicht gespeichert, beim Öffnen steht immer „Info“ vorn
let curTab = "info";
function setTab(t){
  if (!$(`.tabpane[data-tab="${t}"]`)) t = "info";
  curTab = t;
  $$("#setTabs .tab").forEach(b => { const on = b.dataset.tab === t; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
  $$(".tabpane").forEach(p => { p.hidden = p.dataset.tab !== t; });
  if (t === "info") renderKeyList();
}
$("#setTabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
$("#setTabs").addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const tabs = $$("#setTabs .tab"), i = tabs.findIndex(b => b.getAttribute("aria-selected") === "true");
  const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
  setTab(n.dataset.tab); n.focus(); e.preventDefault(); e.stopPropagation();
});

/* Speichern */
async function syncSaveSettings(){
  $("#saveAsk").checked = prefs.save.ask;
  ["#saveAsk"].forEach(s => { $(s).disabled = !NATIVE; });
  $$('[data-act="pickSaveDir"],[data-act="resetSaveDir"]').forEach(b => { b.disabled = !NATIVE; });
  if (!NATIVE){
    $("#saveDir").textContent = "Download-Ordner des Browsers";
    $("#saveDirNote").textContent = "Im Browser bestimmt der Browser den Speicherort. In der Desktop-App kannst du einen eigenen Ordner festlegen.";
    return;
  }
  const d = await saveDir();
  $("#saveDir").textContent = d || "Noch kein Ordner gewählt";
  $("#saveDirNote").textContent = prefs.save.dir ? "" : "Standard ist der Bilder-Ordner des Systems.";
  $('[data-act="resetSaveDir"]').disabled = !prefs.save.dir;
}
$("#saveAsk").addEventListener("change", e => { prefs.save.ask = e.target.checked; savePrefs(); });
$("#setFmtSeg").addEventListener("click", e => { const f = e.target.closest("[data-fmt]"); if (!f) return; S.settings.export.format = f.dataset.fmt; changed(false); });
$("#setQuality").addEventListener("input", e => {
  S.settings.export.quality = +e.target.value; $("#setQVal").textContent = e.target.value + " %";
  persist(); syncUI(); updateInfo();
});

/* Updates (Tauri-Updater; Releases auf GitHub) */
let pendingUpdate = null, updateReady = false;
const HAS_UPDATER = NATIVE && !!TAURI.updater;
function setUpdStatus(t){ $("#updStatus").textContent = t; }
function syncUpdateSettings(){
  $("#updAuto").checked = prefs.update.auto; $("#updDownload").checked = prefs.update.download;
  $("#updDownload").disabled = !prefs.update.auto;
  $("#updFields").disabled = !HAS_UPDATER; $("#updCheck").disabled = !HAS_UPDATER;
  $("#updInstall").hidden = !pendingUpdate;
  $("#updInstall").textContent = updateReady ? "Neu starten und installieren" : "Update installieren";
  $("#updNote").textContent = HAS_UPDATER
    ? "Updates kommen aus den Releases auf GitHub und sind digital signiert."
    : "Die Web-Version ist immer automatisch aktuell. Updates gibt es nur in der Desktop-App.";
  if (prefs.update.lastCheck && !pendingUpdate && HAS_UPDATER && $("#updStatus").textContent === "Noch nicht geprüft.")
    setUpdStatus("Zuletzt geprüft: " + new Date(prefs.update.lastCheck).toLocaleString(LOC(), {dateStyle:"medium", timeStyle:"short"}));
}
$("#updAuto").addEventListener("change", e => { prefs.update.auto = e.target.checked; savePrefs(); syncUpdateSettings(); });
$("#updDownload").addEventListener("change", e => { prefs.update.download = e.target.checked; savePrefs(); });

async function checkUpdates(manual){
  if (!HAS_UPDATER) return;
  setUpdStatus("Suche nach Updates …"); $("#updCheck").disabled = true;
  try{
    const upd = await TAURI.updater.check();
    prefs.update.lastCheck = Date.now(); savePrefs();
    if (!upd){
      setUpdStatus("Bildwerk ist auf dem neuesten Stand.");
      if (manual) toast("Keine Updates verfügbar – Version " + appVersion + " ist aktuell.");
      return;
    }
    pendingUpdate = upd; updateReady = false;
    setUpdStatus(`Version ${upd.version} ist verfügbar.`); syncUpdateSettings();
    if (!manual && prefs.update.download){ await downloadUpdate(upd, true); return; }
    offerUpdate(upd);
  }catch(e){
    setUpdStatus("Update-Prüfung fehlgeschlagen: " + e);
    if (manual) toast("Update-Prüfung fehlgeschlagen. Ist das GitHub-Repository eingerichtet?", 4500);
  }finally{ $("#updCheck").disabled = !HAS_UPDATER; }
}
function updateNotes(upd){
  const nodes = [`Version ${upd.version} ist verfügbar (installiert: ${appVersion}).`];
  if (upd.body){ const n = document.createElement("div"); n.className = "notes"; n.textContent = upd.body; nodes.push(n); }
  return nodes;
}
function offerUpdate(upd){
  showModal({title:"Update verfügbar", body:updateNotes(upd), actions:[
    {label:"Später"}, {label:"Jetzt installieren", primary:true, onClick:() => installUpdate(upd)}
  ]});
}
async function downloadUpdate(upd, background){
  let total = 0, done = 0;
  setUpdStatus("Update wird heruntergeladen …");
  try{
    await upd.download(ev => {
      if (ev.event === "Started") total = ev.data.contentLength || 0;
      else if (ev.event === "Progress"){
        done += ev.data.chunkLength;
        if (total) setUpdStatus(`Update wird heruntergeladen … ${Math.round(done / total * 100)} %`);
      }
    });
    updateReady = true; syncUpdateSettings();
    setUpdStatus(`Version ${upd.version} ist bereit. Ein Neustart installiert das Update.`);
    if (background) showModal({title:"Update bereit", body:updateNotes(upd).concat(["Das Update wurde heruntergeladen. Nach einem Neustart ist es installiert."]), actions:[
      {label:"Später"}, {label:"Jetzt neu starten", primary:true, onClick:() => installUpdate(upd)}
    ]});
    return true;
  }catch(e){ setUpdStatus("Download fehlgeschlagen: " + e); return false; }
}
async function installUpdate(upd){
  try{
    if (!updateReady && !(await downloadUpdate(upd, false))) return;
    setUpdStatus("Update wird installiert …");
    await upd.install();                       // unter Windows beendet sich die App hier selbst
    if (TAURI.process) await TAURI.process.relaunch();
  }catch(e){ setUpdStatus("Installation fehlgeschlagen: " + e); toast("Update konnte nicht installiert werden.", 4500); }
}

/* ---------- Kontextmenü der Werkzeugleiste ---------- */
// Rechtsklick (oder Kontextmenü-Taste, Umschalt+F10) irgendwo auf der Leiste zeigt „Anpassen“
// direkt am Mauszeiger. Auf Touch-Geräten öffnet langes Drücken das Menü.
const ctxMenu = $("#ctxMenu"), rail = $(".rail"), toolArea = $("#toolNav");
// Das Standard-Kontextmenü der WebView (Zurück, Neu laden, Untersuchen …) gehört nicht in eine
// Desktop-App – nur in Textfeldern bleibt es für Kopieren/Einfügen erhalten.
document.addEventListener("contextmenu", e => {
  if (e.target.closest("input, textarea, [contenteditable]")) return;
  e.preventDefault();
});
function openCtx(x, y){
  hideCoach();
  ctxMenu.hidden = false;
  const z = prefs.ui.zoom / 100, w = ctxMenu.offsetWidth * z, h = ctxMenu.offsetHeight * z, m = 8;
  const left = Math.min(Math.max(m, x), window.innerWidth - w - m);
  const top = Math.min(Math.max(m, y), window.innerHeight - h - m);
  // zoom skaliert auch left/top dieses Elements – deshalb zurückrechnen
  ctxMenu.style.left = left / z + "px"; ctxMenu.style.top = top / z + "px";
  ctxMenu.querySelector("button").focus({preventScroll:true});
}
function closeCtx(){ if (!ctxMenu.hidden) ctxMenu.hidden = true; }
toolArea.addEventListener("contextmenu", e => {
  e.preventDefault();
  let {clientX:x, clientY:y} = e;
  if (!x && !y){                                   // per Tastatur ausgelöst
    const r = vrect(document.activeElement && toolArea.contains(document.activeElement) ? document.activeElement : toolArea);
    x = r.left + 12; y = r.bottom - 4;
  }
  openCtx(x, y);
});
ctxMenu.addEventListener("click", e => {
  const b = e.target.closest("[data-ctx]"); if (!b) return;
  closeCtx();
  if (b.dataset.ctx === "customize"){ if (S.tool !== "toolbar") setTool("toolbar"); else app.dataset.panel = "open"; }
});
document.addEventListener("pointerdown", e => { if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) closeCtx(); }, true);
document.addEventListener("keydown", e => {
  if (ctxMenu.hidden) return;
  if (e.key === "Escape" || e.key === "Tab"){ e.preventDefault(); e.stopImmediatePropagation(); closeCtx(); rail.querySelector(".tool")?.focus(); }
}, true);
["resize","blur"].forEach(t => window.addEventListener(t, closeCtx));
rail.addEventListener("scroll", closeCtx);
// langes Drücken auf Touch-Geräten
let lp = null, swallowClick = false;
toolArea.addEventListener("pointerdown", e => {
  if (e.pointerType !== "touch") return;
  const x = e.clientX, y = e.clientY;
  lp = {x, y, t:setTimeout(() => { lp = null; swallowClick = true; openCtx(x, y); }, 550)};
});
toolArea.addEventListener("pointermove", e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10){ clearTimeout(lp.t); lp = null; } });
["pointerup","pointercancel"].forEach(t => toolArea.addEventListener(t, () => { if (lp){ clearTimeout(lp.t); lp = null; } }));
toolArea.addEventListener("click", e => { if (swallowClick){ swallowClick = false; e.preventDefault(); e.stopPropagation(); } }, true);

/* ---------- Einstellungsfenster ---------- */
const setWin = $("#setWin"), setWinBox = setWin.querySelector(".setwin");
let setWinReturn = null;
function openSettings(){
  if (!setWin.hidden) return;
  hideCoach(); closeCtx && closeCtx();
  setWinBox.style.transform = "";                 // immer mittig öffnen
  setWin.hidden = false;
  $("#settingsBtn").setAttribute("aria-pressed", "true"); $("#settingsBtn").classList.add("open-win");
  setTab("info"); renderKeyList();
  setWin.querySelector(".setwin-body").scrollTop = 0;
  setWinReturn = document.activeElement;
  (setWin.querySelector('.tab[aria-selected="true"]') || setWinBox).focus({preventScroll:true});
}
function closeSettings(){
  if (setWin.hidden) return;
  if (recording) stopRec();
  setWin.hidden = true;
  $("#settingsBtn").setAttribute("aria-pressed", "false"); $("#settingsBtn").classList.remove("open-win");
  (setWinReturn && setWinReturn.focus) ? setWinReturn.focus({preventScroll:true}) : null;
}
// Menü „Bildwerk → Einstellungen …“ (macOS) und Cmd/Strg + Komma
if (window.__TAURI__ && window.__TAURI__.event) window.__TAURI__.event.listen("open-settings", () => { hideModal(); openSettings(); });
document.addEventListener("keydown", e => {
  if (e.key === "," && (e.metaKey || e.ctrlKey) && !e.altKey && $("#shot").hidden){ e.preventDefault(); openSettings(); }
});
// Klick neben das Fenster schließt es
setWin.addEventListener("pointerdown", e => { if (e.target === setWin) closeSettings(); });
// Esc schließt das Fenster (nicht während ein Kürzel aufgenommen wird oder ein Dialog offen ist)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || setWin.hidden || recording || !$("#modal").hidden || !$("#shot").hidden) return;
  e.preventDefault(); e.stopImmediatePropagation(); closeSettings();
}, true);
// Fenster an der Titelleiste verschieben
let winDrag = null;
const winHead = $("#setWinHead");
winHead.addEventListener("pointerdown", e => {
  if (e.target.closest("button") || e.button !== 0) return;
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(setWinBox.style.transform) || [0, 0, 0];
  winDrag = {x:e.clientX, y:e.clientY, ox:+m[1], oy:+m[2]};
  winHead.setPointerCapture(e.pointerId); winHead.classList.add("dragging"); e.preventDefault();
});
winHead.addEventListener("pointermove", e => {
  if (!winDrag) return;
  const z = prefs.ui.zoom / 100, r = vrect(setWinBox);
  let x = winDrag.ox + (e.clientX - winDrag.x) / z, y = winDrag.oy + (e.clientY - winDrag.y) / z;
  setWinBox.style.transform = `translate(${x}px, ${y}px)`;
  // nicht ganz aus dem Fenster schieben
  const r2 = vrect(setWinBox);
  if (r2.top < 0 || r2.bottom < 60 || r2.left > window.innerWidth - 80 || r2.right < 80 || r2.top > window.innerHeight - 50){
    setWinBox.style.transform = `translate(${winDrag.lx ?? winDrag.ox}px, ${winDrag.ly ?? winDrag.oy}px)`;
  } else { winDrag.lx = x; winDrag.ly = y; }
});
const endWinDrag = () => { if (winDrag){ winDrag = null; winHead.classList.remove("dragging"); } };
winHead.addEventListener("pointerup", endWinDrag);
winHead.addEventListener("pointercancel", endWinDrag);

/* ---------- Tooltips im Stil der Oberfläche ---------- */
// Ersetzt die System-Tooltips (title) durch eine eigene Sprechblase. Der Text wandert dafür
// in data-tip; Elemente ohne sichtbaren Text behalten ihn als aria-label für Screenreader.
const tipEl = $("#tip");
let tipFor = null, tipTimer = 0;
function hideTip(){ clearTimeout(tipTimer); tipFor = null; tipEl.classList.remove("on"); tipEl.hidden = true; }
function showTip(el){
  if (!document.body.contains(el) || !el.dataset.tip) return;
  tipEl.textContent = el.dataset.tip; tipEl.hidden = false;
  const z = prefs.ui.zoom / 100, r = vrect(el);
  tipEl.style.fontSize = 12.5 * z + "px"; tipEl.style.padding = `${5 * z}px ${9 * z}px`; tipEl.style.maxWidth = 260 * z + "px";
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight, m = 8, vw = window.innerWidth, vh = window.innerHeight;
  let x, y;
  if (el.closest(".rail") && !matchMedia("(max-width:760px)").matches){   // Seitenleiste: rechts daneben
    x = r.right + 10; y = r.top + r.height / 2 - th / 2;
  } else {                                                                   // sonst darunter, notfalls darüber
    x = r.left + r.width / 2 - tw / 2; y = r.bottom + 8;
    if (y + th > vh - m) y = r.top - th - 8;
  }
  x = Math.min(Math.max(m, x), vw - tw - m); y = Math.min(Math.max(m, y), vh - th - m);
  tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  requestAnimationFrame(() => tipEl.classList.add("on"));
}
// title-Attribute sofort in data-tip umwandeln – sobald ein title im Fenster steht, zeigt die
// WebView (vor allem unter macOS) sonst zusätzlich ihren eigenen Tooltip unten rechts am Mauszeiger.
function tipify(el){
  if (!el.hasAttribute || !el.hasAttribute("title")) return;
  const t = el.getAttribute("title"); el.removeAttribute("title");
  if (!t) return;
  el.dataset.tip = t;
  if (!el.getAttribute("aria-label") && !el.textContent.trim()) el.setAttribute("aria-label", t);
}
document.querySelectorAll("[title]").forEach(tipify);
new MutationObserver(ms => {
  for (const m of ms){
    if (m.type === "attributes") tipify(m.target);
    else m.addedNodes.forEach(n => { if (n.nodeType === 1){ tipify(n); n.querySelectorAll("[title]").forEach(tipify); } });
  }
}).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:["title"]});
document.addEventListener("mouseover", e => {
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (!el || el === tipFor) return;
  if (!el.dataset.tip) return;
  hideTip(); tipFor = el;
  tipTimer = setTimeout(() => showTip(el), 450);
});
document.addEventListener("mouseout", e => { if (tipFor && !tipFor.contains(e.relatedTarget)) hideTip(); });
["pointerdown", "keydown", "wheel"].forEach(t => document.addEventListener(t, hideTip, true));
window.addEventListener("blur", hideTip);

/* ---------- Erststart-Hinweis ---------- */
const coach = $("#coach");
let coachTarget = null;
function placeCoach(){
  if (coach.hidden || !coachTarget) return;
  const t = vrect(coachTarget), m = 12;
  const mobile = matchMedia("(max-width:760px)").matches;
  const cw = coach.offsetWidth, ch = coach.offsetHeight;
  coach.classList.toggle("top", mobile); coach.classList.toggle("left", !mobile);
  if (mobile){       // Blase über dem Button, Pfeil nach unten
    const left = Math.min(window.innerWidth - cw - m, Math.max(m, t.left + t.width/2 - cw/2));
    coach.style.left = left + "px"; coach.style.top = (t.top - ch - 12) + "px";
    coach.style.setProperty("--ax", (t.left + t.width/2 - left) + "px");
  } else {           // Blase rechts neben dem Button, Pfeil nach links
    const top = Math.min(window.innerHeight - ch - m, Math.max(m, t.top + t.height/2 - ch/2));
    coach.style.left = (t.right + 14) + "px"; coach.style.top = top + "px";
    coach.style.setProperty("--ay", (t.top + t.height/2 - top) + "px");
  }
}
function showCoach(){
  if (store.get("bildwerk.hint.toolbarmenu", false)) return;
  coachTarget = document.querySelector("#toolNav");
  if (matchMedia("(pointer: coarse)").matches)
    $("#coachText").textContent = "Halte den Finger auf den Werkzeugen gedrückt, um Werkzeuge hinzuzufügen, zu entfernen und umzusortieren.";
  if (!coachTarget || S.tool === "toolbar") return;
  coachTarget.scrollIntoView({block:"nearest", inline:"nearest"});
  coachTarget.classList.add("coach-target");
  coach.hidden = false; placeCoach();
  requestAnimationFrame(() => coach.classList.add("on"));
  coach.querySelector(".coach-ok").focus({preventScroll:true});
}
function hideCoach(){
  if (coach.hidden) return;
  store.set("bildwerk.hint.toolbarmenu", true);
  coach.classList.remove("on");
  coachTarget && coachTarget.classList.remove("coach-target");
  setTimeout(() => { coach.hidden = true; }, 180);
}
coach.addEventListener("click", e => { if (e.target.closest("[data-coach]")) hideCoach(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") hideCoach(); });
window.addEventListener("resize", placeCoach);

/* ---------- Screenshot: Einstellungen & Tastenkürzel ---------- */
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD_ORDER = ["Control","Alt","Shift","Super"];
const MOD_LABEL = IS_MAC ? {Control:"⌃", Alt:"⌥", Shift:"⇧", Super:"⌘"} : {Control:"Strg", Alt:"Alt", Shift:"Umschalt", Super:"Win"};
function accFromEvent(e){
  const m = [];
  if (e.ctrlKey) m.push("Control"); if (e.altKey) m.push("Alt");
  if (e.shiftKey) m.push("Shift"); if (e.metaKey) m.push("Super");
  return [...m, e.code].join("+");
}
function keyLabel(code){
  const map = {Equal:"+", Minus:"−", Mausrad:"Mausrad", Leertaste:"Leertaste", Ziehen:"Ziehen", PrintScreen:"Druck", Space:"Leertaste", Enter:"Eingabe", Backspace:"Rücktaste", Tab:"Tab", Pause:"Pause",
    ArrowUp:"↑", ArrowDown:"↓", ArrowLeft:"←", ArrowRight:"→", Insert:"Einfg", Delete:"Entf", Home:"Pos1", End:"Ende",
    PageUp:"Bild ↑", PageDown:"Bild ↓", Minus:"-", Equal:"=", Comma:",", Period:".", Slash:"/", Backquote:"^"};
  if (map[code]) return map[code];
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
}
function renderKeys(el, acc){
  el.textContent = "";
  if (!acc){ const s = document.createElement("span"); s.className = "muted"; s.textContent = "Kein Kürzel festgelegt"; el.appendChild(s); return; }
  acc.split("+").forEach((part, i) => {
    if (i){ const plus = document.createElement("span"); plus.className = "kbd-plus"; plus.textContent = "+"; el.appendChild(plus); }
    const k = document.createElement("kbd"); k.textContent = MOD_LABEL[part] || keyLabel(part); el.appendChild(k);
  });
}
const prettyAcc = acc => acc.split("+").map(p => MOD_LABEL[p] || keyLabel(p)).join(" + ");

let activeShortcut = null;
async function applyShortcut(){
  const gs = NATIVE && TAURI.globalShortcut;
  if (!gs) return true;                        // Web: Kürzel wird im Fenster abgefangen
  const want = prefs.screenshot.enabled && prefs.screenshot.shortcut ? prefs.screenshot.shortcut : null;
  if (activeShortcut === want) return true;
  if (activeShortcut){ try{ await gs.unregister(activeShortcut); }catch{} activeShortcut = null; }
  if (!want) return true;
  try{ await gs.unregister(want); }catch{}
  try{
    await gs.register(want, ev => { if (!ev || ev.state === undefined || ev.state === "Pressed") startScreenshot(); });
    activeShortcut = want; return true;
  }catch(e){ return String(e); }
}
async function setShortcut(acc){
  const old = prefs.screenshot.shortcut;
  prefs.screenshot.shortcut = acc;
  const r = await applyShortcut();
  if (r !== true){
    prefs.screenshot.shortcut = old; await applyShortcut();
    toast("Dieses Kürzel ist bereits von einem anderen Programm belegt. Bitte ein anderes wählen.", 4500);
  } else toast(acc ? "Tastenkürzel gespeichert: " + prettyAcc(acc) : "Tastenkürzel entfernt");
  savePrefs(); syncSettings(); renderKeyList();
}
async function setShotEnabled(on){
  prefs.screenshot.enabled = on; savePrefs();
  if (on && !bar.includes("screenshot")) bar.push("screenshot");
  if (!on) bar = bar.filter(id => id !== "screenshot");
  commitBar(); syncSettings(); renderKeyList();
  const r = await applyShortcut();
  if (r !== true) toast("Screenshots eingeschaltet, aber das Tastenkürzel ist belegt. Bitte ein anderes wählen.", 4500);
  else toast(on ? "Screenshots eingeschaltet" + (prefs.screenshot.shortcut ? " – Kürzel " + prettyAcc(prefs.screenshot.shortcut) : "") : "Screenshots ausgeschaltet");
}
let recording = false;
function syncSettings(){
  const p = prefs.screenshot;
  $("#shotOn").checked = p.enabled; $("#shotFields").disabled = !p.enabled;
  if (!recording) renderKeys($("#shotKey"), p.shortcut);
  $("#clearShotKey").disabled = !p.shortcut;
  $$("#shotModeSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === p.mode));
  $("#shotClip").checked = p.clipboard;
  $$("#shotFmtSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.fmt === p.format));
  $("#shotQualityGroup").disabled = p.format === "image/png";
  $("#shotQuality").value = p.quality; $("#shotQVal").textContent = p.quality + " %";
  $("#shotFmtNote").textContent = p.format === "image/png"
    ? "PNG ist verlustfrei und ideal für Texte und Bildschirminhalte."
    : "Kleinere Dateien; bei Text können leichte Unschärfen entstehen.";
  $("#shotAutoSave").checked = p.autoSave; $("#shotAutoSaveRow").hidden = !NATIVE;
  $("#modeScrollOpt").hidden = !NATIVE;
  $("#scrollOpts").hidden = !NATIVE;
  $("#scrollAuto").checked = p.scrollAuto;
  $$("#scrollMaxSeg button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.max === p.scrollMax));
  $$("#scrollWaitSeg button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.wait === p.scrollWait));
  $("#shotKeyNote").textContent = NATIVE
    ? "Funktioniert systemweit, auch wenn Bildwerk im Hintergrund ist."
    : "Funktioniert, solange Bildwerk im Vordergrund ist. Systemweit nur in der Desktop-App.";
}
function stopRec(){ recording = false; $("#shotKey").classList.remove("recording"); syncSettings(); }
$("#shotOn").addEventListener("change", e => setShotEnabled(e.target.checked));
$("#scrollAuto").addEventListener("change", e => { prefs.screenshot.scrollAuto = e.target.checked; savePrefs(); });
$("#scrollMaxSeg").addEventListener("click", e => { const b = e.target.closest("[data-max]"); if (!b) return; prefs.screenshot.scrollMax = +b.dataset.max; savePrefs(); syncSettings(); });
$("#scrollWaitSeg").addEventListener("click", e => { const b = e.target.closest("[data-wait]"); if (!b) return; prefs.screenshot.scrollWait = +b.dataset.wait; savePrefs(); syncSettings(); });
$("#shotFmtSeg").addEventListener("click", e => { const b = e.target.closest("[data-fmt]"); if (!b) return; prefs.screenshot.format = b.dataset.fmt; savePrefs(); syncSettings(); });
$("#shotQuality").addEventListener("input", e => { prefs.screenshot.quality = +e.target.value; $("#shotQVal").textContent = e.target.value + " %"; savePrefs(); });
$("#shotAutoSave").addEventListener("change", e => { prefs.screenshot.autoSave = e.target.checked; savePrefs(); });
$("#shotClip").addEventListener("change", e => { prefs.screenshot.clipboard = e.target.checked; savePrefs(); });
$("#shotModeSeg").addEventListener("click", e => { const m = e.target.closest("[data-mode]"); if (!m) return; prefs.screenshot.mode = m.dataset.mode; savePrefs(); syncSettings(); });
$("#shotKey").addEventListener("click", () => {
  if (recording) return;
  recording = true; const el = $("#shotKey");
  el.classList.add("recording"); el.textContent = "Tastenkombination drücken … (Esc bricht ab)";
});
$("#shotKey").addEventListener("blur", () => { if (recording) stopRec(); });
document.addEventListener("keydown", e => {
  if (!recording) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey){ stopRec(); return; }
  if (["Control","Alt","Shift","Meta","AltGraph","OS","Super","Hyper"].includes(e.key)) return;
  const solo = /^F\d{1,2}$/.test(e.code) || e.code === "PrintScreen" || e.code === "Pause";
  if (!solo && !(e.ctrlKey || e.altKey || e.metaKey)){ toast(`Bitte mit ${MOD_LABEL.Control}, ${MOD_LABEL.Alt} oder ${MOD_LABEL.Super} kombinieren.`); return; }
  stopRec(); setShortcut(accFromEvent(e));
}, true);
// Web: Kürzel innerhalb der Seite
document.addEventListener("keydown", e => {
  if (NATIVE || recording || !prefs.screenshot.enabled || !prefs.screenshot.shortcut) return;
  if (accFromEvent(e) === prefs.screenshot.shortcut){ e.preventDefault(); startScreenshot(); }
});

/* ---------- Screenshot: Aufnahme ---------- */
const shotEl = $("#shot"), shotSel = $("#shotSel");
const SH = {canvas:null, windows:[], mode:"region", scale:1, ox:0, oy:0, drag:null, rect:null, native:false};
let shotBusy = false;

async function startScreenshot(){
  if (!prefs.screenshot.enabled){ toast("Screenshots sind in den Einstellungen ausgeschaltet."); return; }
  if (shotBusy || recording) return;
  shotBusy = true; hideCoach();
  try{
    // In der Desktop-App immer die native Aufnahme verwenden – nie die Browser-Freigabe,
    // die unter macOS bei jedem Aufruf nach „Bildschirm und Audio“ fragt.
    if (TAURI && TAURI.core){
      const info = await TAURI.core.invoke("capture_begin");          // Fenster ausblenden, Bildschirm einfrieren
      const buf = await TAURI.core.invoke("capture_pixels");          // RGBA-Rohdaten
      const cv = document.createElement("canvas"); cv.width = info.width; cv.height = info.height;
      cv.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(buf), info.width, info.height), 0, 0);
      openShot(cv, info.windows, true);
      await TAURI.core.invoke("overlay_show");                         // Vollbild über dem eingefrorenen Bild
    } else {
      const cv = await webCapture();
      if (!cv){ shotBusy = false; return; }
      openShot(cv, [], false);
    }
  }catch(e){
    shotEl.hidden = true; shotBusy = false;
    if (TAURI && TAURI.core) TAURI.core.invoke("overlay_end").catch(() => {});
    if (String(e).includes("PERMISSION_SCREEN")){ askScreenPermission(); return; }
    toast("Screenshot fehlgeschlagen: " + (e && e.message || e), 4500);
  }
}
// macOS: Erlaubnis fehlt – einmal erklären, statt immer wieder die Systemabfrage auszulösen
function askScreenPermission(){
  showModal({
    title: "Bildschirmaufnahme erlauben",
    body: [
      "macOS erlaubt Bildwerk noch nicht, den Bildschirm aufzunehmen.",
      "Öffne die Systemeinstellungen → Datenschutz & Sicherheit → Bildschirm- & Systemaudioaufnahme, schalte Bildwerk ein und starte Bildwerk danach neu.",
      "Die Erlaubnis gilt dauerhaft. Bildwerk nimmt dabei nur Bilder auf, kein Audio."
    ],
    actions: [
      {label:"Später"},
      {label:"Systemeinstellungen öffnen", primary:true, onClick:() => TAURI.core.invoke("open_screen_settings").catch(() => {})}
    ]
  });
}
async function webCapture(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
    toast("Dieser Browser kann keine Bildschirmaufnahmen machen. In der Desktop-App funktioniert es.", 4500); return null;
  }
  let stream;
  try{ stream = await navigator.mediaDevices.getDisplayMedia({video:true, audio:false}); }
  catch{ toast("Aufnahme abgebrochen oder hier nicht erlaubt. In der Desktop-App funktioniert es immer.", 4500); return null; }
  try{
    const v = document.createElement("video"); v.srcObject = stream; v.muted = true; v.playsInline = true;
    await v.play();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cv = document.createElement("canvas"); cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext("2d").drawImage(v, 0, 0);
    return cv;
  } finally { stream.getTracks().forEach(t => t.stop()); }
}
function openShot(cv, windows, native){
  Object.assign(SH, {canvas:cv, windows:windows || [], native, rect:null, drag:null});
  shotEl.querySelector(".shot-img")?.remove();
  cv.className = "shot-img"; shotEl.prepend(cv);
  $("#shotWinBtn").hidden = !native;
  $("#shotScrollBtn").hidden = !native;
  let m = prefs.screenshot.mode;
  if ((m === "window" || m === "scroll") && !native) m = "region";
  setShotMode(m);
  shotEl.hidden = false; layoutShot();
}
function layoutShot(){
  if (shotEl.hidden || !SH.canvas) return;
  const W = SH.canvas.width, H = SH.canvas.height, vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / W, vh / H);
  Object.assign(SH, {scale:s, ox:(vw - W*s)/2, oy:(vh - H*s)/2});
  Object.assign(SH.canvas.style, {width:W*s + "px", height:H*s + "px", left:SH.ox + "px", top:SH.oy + "px"});
  drawSel();
}
window.addEventListener("resize", layoutShot);
const SHOT_HINT = {region:"Ziehe einen Bereich auf", window:"Klicke auf ein Fenster", full:"Klicke oder drücke Eingabe",
  scroll:"Scrollbereich aufziehen oder Fenster anklicken"};
function setShotMode(m){
  SH.mode = m; SH.drag = null;
  SH.rect = m === "full" && SH.canvas ? {x:0, y:0, w:SH.canvas.width, h:SH.canvas.height} : null;
  shotEl.dataset.mode = m;
  $$("[data-shot-mode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.shotMode === m));
  $("#shotHint").textContent = m === "window" && !SH.windows.length
    ? "Keine Fenster erkannt – Bereich aufziehen oder Vollbild nutzen"
    : SHOT_HINT[m] + " – Esc bricht ab";
  drawSel();
}
function drawSel(){
  const r = SH.rect;
  $("#shotDim").hidden = !!r; shotSel.hidden = !r;
  if (!r) return;
  const s = SH.scale, top = SH.oy + r.y*s;
  Object.assign(shotSel.style, {left:SH.ox + r.x*s + "px", top:top + "px", width:r.w*s + "px", height:r.h*s + "px"});
  shotSel.classList.toggle("inside", top < 72);
  $("#shotSize").textContent = `${Math.round(r.w)} × ${Math.round(r.h)}` + (r.title ? `  ${r.title}` : "");
}
function toImg(e){
  const W = SH.canvas.width, H = SH.canvas.height;
  return {x:clamp(Math.round((e.clientX - SH.ox) / SH.scale), 0, W), y:clamp(Math.round((e.clientY - SH.oy) / SH.scale), 0, H)};
}
function winAt(p){
  const W = SH.canvas.width, H = SH.canvas.height;
  for (const w of SH.windows){                                     // vorderstes Fenster zuerst
    if (p.x >= w.x && p.x < w.x + w.w && p.y >= w.y && p.y < w.y + w.h){
      const x = Math.max(0, w.x), y = Math.max(0, w.y);
      return {x, y, w:Math.min(W, w.x + w.w) - x, h:Math.min(H, w.y + w.h) - y, title:w.title || w.app};
    }
  }
  return null;
}
shotEl.addEventListener("pointerdown", e => {
  if (e.target.closest(".shot-bar") || e.button !== 0) return;
  e.preventDefault();                       // verhindert, dass eine Textmarkierung beginnt
  const p = toImg(e);
  shotEl.setPointerCapture(e.pointerId);
  if (SH.mode === "region" || SH.mode === "scroll"){
    SH.drag = p; SH.dragMoved = false;
    if (SH.mode === "region") SH.rect = {x:p.x, y:p.y, w:0, h:0};
    drawSel();
  } else SH.press = true;                    // Fenster/Vollbild: beim Loslassen aufnehmen
});
shotEl.addEventListener("pointerup", e => {
  if (!SH.press) return;
  SH.press = false;
  if (SH.mode === "window"){ const r = winAt(toImg(e)); if (r) finishShot(r); }
  else if (SH.mode === "full") finishShot(SH.rect);
});
shotEl.addEventListener("pointermove", e => {
  if (shotEl.hidden) return;
  const p = toImg(e), d = SH.drag;
  if (d && (SH.mode === "region" || SH.mode === "scroll")){
    if (Math.abs(p.x - d.x) * SH.scale > 4 || Math.abs(p.y - d.y) * SH.scale > 4) SH.dragMoved = true;
    if (SH.mode === "region" || SH.dragMoved){
      SH.rect = {x:Math.min(d.x, p.x), y:Math.min(d.y, p.y), w:Math.abs(p.x - d.x), h:Math.abs(p.y - d.y)};
      drawSel();
    }
  } else if ((SH.mode === "window" || SH.mode === "scroll") && !e.target.closest(".shot-bar")){ SH.rect = winAt(p); drawSel(); }
});
const endRegion = e => {
  if (!SH.drag) return;
  if (SH.mode === "scroll"){
    const moved = SH.dragMoved; SH.drag = null;
    const r = moved ? SH.rect : winAt(toImg(e));
    if (r) startScroll(r); else { SH.rect = null; drawSel(); }
    return;
  }
  if (SH.mode !== "region") return;
  SH.drag = null;
  const r = SH.rect;
  if (r && r.w*SH.scale >= 4 && r.h*SH.scale >= 4) finishShot(r);
  else { SH.rect = null; drawSel(); }
};
shotEl.addEventListener("pointerup", endRegion);
shotEl.addEventListener("pointercancel", () => { SH.drag = null; SH.rect = null; drawSel(); });
shotEl.addEventListener("click", e => {
  const m = e.target.closest("[data-shot-mode]");
  if (m){ setShotMode(m.dataset.shotMode); return; }
  if (e.target.closest("[data-shot=cancel]")) closeShot();
});
document.addEventListener("keydown", e => {
  if (shotEl.hidden) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.key === "Escape") closeShot();
  else if (e.key === "Enter" && SH.mode === "full") finishShot(SH.rect);
  else if (e.key === "1") setShotMode("region");
  else if (e.key === "2" && SH.native) setShotMode("window");
  else if (e.key === "3") setShotMode("full");
  else if (e.key === "4" && SH.native) setShotMode("scroll");
}, true);
function closeShot(){
  if (shotEl.hidden) return;
  SH.press = false;
  // falls der Browser doch eine Markierung begonnen hat: aufheben, und den Klick nach dem
  // Loslassen nicht an die darunterliegende Oberfläche weitergeben
  try{ window.getSelection().removeAllRanges(); }catch{}
  const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
  document.addEventListener("click", swallow, true);
  setTimeout(() => document.removeEventListener("click", swallow, true), 350);
  shotEl.hidden = true; SH.drag = null;
  if (SH.canvas){ SH.canvas.remove(); SH.canvas.width = 0; SH.canvas = null; }
  if (SH.native) TAURI.core.invoke("overlay_end").catch(() => {});
  shotBusy = false;
}
async function finishShot(r){
  if (!r || r.w < 1 || r.h < 1 || !SH.canvas) return;
  const out = document.createElement("canvas");
  out.width = Math.round(r.w); out.height = Math.round(r.h);
  out.getContext("2d").drawImage(SH.canvas, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
  closeShot();
  await deliverShot(out);
}
// Fertige Aufnahme: Zwischenablage, als Bild in den Editor, Meldung
async function deliverShot(out, kind = "Screenshot"){
  const p = prefs.screenshot, wantClip = p.clipboard;
  const rgba = wantClip && NATIVE ? out.getContext("2d").getImageData(0, 0, out.width, out.height) : null;
  const toBlob = (type, q) => new Promise(res => out.toBlob(res, type, q));
  // Datei im gewählten Format; die Zwischenablage bekommt immer verlustfreie Pixel
  const fileBlob = await toBlob(p.format, p.format === "image/png" ? undefined : p.quality / 100);
  const clipBlob = wantClip && !NATIVE ? (fileBlob && fileBlob.type === "image/png" ? fileBlob : await toBlob("image/png")) : null;
  out.width = 0;
  if (!fileBlob){ toast(kind + " konnte nicht gespeichert werden."); return; }
  const copied = wantClip ? await copyImage(clipBlob, rgba) : false;
  const d = new Date(), z = n => String(n).padStart(2, "0");
  const ext = (FMT[fileBlob.type] || FMT["image/png"])[0];
  const prefix = LANG === "en" && kind === "Bildlauf" ? "Scroll-capture" : kind;
  const name = `${prefix}_${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}.${ext}`;
  let saved = "", saveErr = false;
  if (p.autoSave && NATIVE){
    try{
      const dir = await saveDir();
      if (dir) saved = baseOf(await writeNative(new Uint8Array(await fileBlob.arrayBuffer()), {"x-dir": dir, "x-name": name, "x-unique": "1"}));
    }catch(e){ saveErr = true; console.warn(e); }
  }
  await addFiles([new File([fileBlob], name, {type:fileBlob.type})]);
  selectImage(S.images.length - 1);
  let msg = kind + " hinzugefügt";
  if (wantClip) msg += copied ? ", in die Zwischenablage kopiert" : " – Zwischenablage nicht möglich";
  if (saved) msg += ` und gespeichert als „${saved}“`;
  else if (saveErr) msg += " – automatisches Speichern fehlgeschlagen";
  toast(msg, 4000);
}

/* ---------- Bildlauf-Aufnahme (nur Desktop-App) ---------- */
async function startScroll(r){
  const region = {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.w), h:Math.round(r.h)};
  if (region.w < 40 || region.h < 40){ toast("Der Bereich ist zu klein für eine Bildlauf-Aufnahme."); SH.rect = null; drawSel(); return; }
  // Auswahlfläche ausblenden, aber Fenster nicht zurückholen – das übernimmt die App
  shotEl.hidden = true; SH.drag = null;
  if (SH.canvas){ SH.canvas.remove(); SH.canvas.width = 0; SH.canvas = null; }
  try{ await TAURI.core.invoke("scroll_start", {region, maxRows: prefs.screenshot.scrollMax, waitMs: prefs.screenshot.scrollWait}); }
  catch(e){
    shotBusy = false;
    TAURI.core.invoke("overlay_end").catch(() => {});
    toast("Bildlauf-Aufnahme nicht möglich: " + e, 4500);
  }
}
if (NATIVE && TAURI.event){
  TAURI.event.listen("scroll-done", async e => {
    try{
      const {width, height} = e.payload;
      const buf = await TAURI.core.invoke("capture_pixels");
      const cv = document.createElement("canvas"); cv.width = width; cv.height = height;
      cv.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(buf), width, height), 0, 0);
      await TAURI.core.invoke("overlay_end");
      await deliverShot(cv, "Bildlauf");
    }catch(err){
      TAURI.core.invoke("overlay_end").catch(() => {});
      toast("Bildlauf-Aufnahme fehlgeschlagen: " + (err && err.message || err), 4500);
    }
    shotBusy = false;
  });
  TAURI.event.listen("scroll-cancel", () => {
    shotBusy = false; TAURI.core.invoke("overlay_end").catch(() => {});
    toast("Bildlauf-Aufnahme abgebrochen");
  });
  TAURI.event.listen("scroll-error", e => {
    shotBusy = false; TAURI.core.invoke("overlay_end").catch(() => {});
    toast("Bildlauf-Aufnahme fehlgeschlagen: " + e.payload, 4500);
  });
}

// Bild in die Zwischenablage: Desktop-App nativ (alle Systeme), Web über die Clipboard-API
async function copyImage(blob, rgba){
  try{
    if (NATIVE && rgba){
      await TAURI.core.invoke("copy_image", new Uint8Array(rgba.data.buffer),
        {headers:{"x-width":String(rgba.width), "x-height":String(rgba.height)}});
      return true;
    }
    if (navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
      return true;
    }
  }catch(e){ console.warn("Zwischenablage:", e); }
  return false;
}

/* ---------- Darstellung: Hell/Dunkel und Skalierung ---------- */
function applyTheme(){
  const t = prefs.ui.theme, root = document.documentElement;
  if (t === "light" || t === "dark") root.dataset.theme = t; else delete root.dataset.theme;
  if (NATIVE && TAURI.window && TAURI.window.getCurrentWindow){
    try{ TAURI.window.getCurrentWindow().setTheme(t === "system" ? null : t).catch(() => {}); }catch{}
  }
}
function updateRailH(){
  const r = vrect(document.querySelector(".rail"));
  document.documentElement.style.setProperty("--rail-h", r.height + "px");
}
function applyZoom(){
  document.documentElement.style.setProperty("--ui-zoom", String(prefs.ui.zoom / 100));
  requestAnimationFrame(() => { updateRailH(); drawStage(); placeCoach(); });
}
function syncAppearance(){
  $$("#langSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === LANG));
  $$("#modeSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.uimode === (prefs.ui.mode === "simple" ? "simple" : "advanced")));
  $$("#themeSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.themeOpt === prefs.ui.theme));
  $("#uiZoom").value = prefs.ui.zoom; $("#zoomVal").textContent = prefs.ui.zoom + " %";
}
function setZoom(v){
  prefs.ui.zoom = clamp(Math.round(v / 5) * 5, 75, 150);
  savePrefs(); applyZoom(); syncAppearance();
}
$("#langSeg").addEventListener("click", e => {
  const b = e.target.closest("[data-lang]"); if (!b) return;
  prefs.ui.lang = b.dataset.lang; savePrefs(); applyLang(true); syncAppearance();
});
$("#modeSeg").addEventListener("click", e => {
  const b = e.target.closest("[data-uimode]"); if (!b) return;
  prefs.ui.mode = b.dataset.uimode; savePrefs(); applyUiMode(); syncAppearance();
});
$("#themeSeg").addEventListener("click", e => {
  const b = e.target.closest("[data-theme-opt]"); if (!b) return;
  prefs.ui.theme = b.dataset.themeOpt; savePrefs(); applyTheme(); syncAppearance();
});
const zoomInput = $("#uiZoom");
// Während des Ziehens nur die Anzeige ändern; angewendet wird beim Loslassen,
// sonst würde der Regler unter dem Mauszeiger mitwachsen.
zoomInput.addEventListener("input", () => { $("#zoomVal").textContent = zoomInput.value + " %"; });
// kurz verzögert anwenden, damit ein Doppelklick nicht vorher die Größe verändert
let zoomTimer = 0;
zoomInput.addEventListener("change", () => {
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => setZoom(+zoomInput.value), 320);
});
zoomInput.addEventListener("dblclick", () => {
  clearTimeout(zoomTimer);
  setTimeout(() => { clearTimeout(zoomTimer); setZoom(100); toast("Größe auf 100 % zurückgesetzt"); }, 0);
});
window.addEventListener("resize", updateRailH);
applyTheme();

// Init
// Darstellung der Werkzeuge (Symbole / Beides / Text). Ein- und Ausklappen ist davon
// unabhängig: eigener gespeicherter Zustand, Button immer sichtbar und immer nur ein Symbol.
function setCollapseLabel(c){
  const t = c ? "Seitenleiste ausklappen" : "Seitenleiste einklappen";
  $("#collapse").title = t; $("#collapse").setAttribute("aria-label", t);
}
function applyToolStyle(){
  const st = prefs.ui.toolStyle;
  const collapsed = !!store.get("bildwerk.collapsed", false);
  app.dataset.toolstyle = st;
  app.dataset.collapsed = String(collapsed);
  setCollapseLabel(collapsed);
  $$("#toolStyleSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.style === st));
}
$("#toolStyleSeg").addEventListener("click", e => {
  const b = e.target.closest("[data-style]"); if (!b) return;
  prefs.ui.toolStyle = b.dataset.style; savePrefs(); applyToolStyle();
  setTimeout(() => { updateRailH(); drawStage(); placeCoach(); }, 220);
});
applyToolStyle();
new ResizeObserver(() => drawStage()).observe(wrap);
renderRail(); renderBarEditor(); closeTool(); syncUI(); syncSettings(); syncAppearance(); applyZoom(); applyShortcut(); syncCounts(); renderWorkflows();
setTab("info"); syncSaveSettings(); syncUpdateSettings();
applyLang(false); syncAppearance();
(async () => {
  if (NATIVE && TAURI.app && TAURI.app.getVersion){ try{ appVersion = await TAURI.app.getVersion(); }catch{} }
  renderInfo(); syncUpdateSettings();
  const seen = store.get("bildwerk.seenVersion", null);
  store.set("bildwerk.seenVersion", appVersion);
  if (seen && cmpVer(appVersion, seen) > 0) setTimeout(() => showWhatsNew(seen), 600);
  else setTimeout(showCoach, 700);
  if (HAS_UPDATER && prefs.update.auto && Date.now() - prefs.update.lastCheck > 6*3600*1000) setTimeout(() => checkUpdates(false), 5000);
})();
})();
