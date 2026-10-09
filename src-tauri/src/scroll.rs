//! Bildlauf-Aufnahme: Ein Bereich wird wiederholt aufgenommen, während der
//! Inhalt (von Hand oder automatisch) nach unten gescrollt wird. Neue Zeilen
//! werden erkannt und zu einem langen Bild zusammengesetzt.

use crate::capture::{err, MonInfo, Shot};
use enigo::{Axis, Coordinate, Enigo, Mouse, Settings};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use xcap::image::RgbaImage;
use xcap::Monitor;

/// Höchstens so viele Zeilen (Browser können größere Bilder nicht darstellen).
const MAX_ROWS: usize = 30_000;
/// Standard-Wartezeit, wenn sich beim automatischen Scrollen nichts bewegt
/// (Endlos-Seiten laden in dieser Zeit neue Inhalte nach).
const DEFAULT_WAIT_MS: u64 = 5_000;
/// Höchstens so viele Pixel insgesamt.
const MAX_PIXELS: usize = 200_000_000;

#[derive(Deserialize, Clone, Copy)]
pub struct Region {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

#[derive(Serialize, Clone)]
struct Progress {
    rows: usize,
    max: usize,
}

#[derive(Serialize, Clone)]
struct Done {
    width: u32,
    height: u32,
}

/// Steuerung des laufenden Aufnahme-Threads.
#[derive(Default)]
pub struct ScrollCtl {
    stop: Arc<AtomicBool>,
    auto: Arc<AtomicBool>,
    handle: Mutex<Option<JoinHandle<Result<RgbaImage, String>>>>,
}

/* ---------------- Zusammensetzen ---------------- */

const SEG: usize = 16;
/// Merkmale je Zeile: mittlere Helligkeit und Kantenanzahl (Text, Konturen) in 16 Abschnitten
const NF: usize = SEG * 2;
type Feat = [i32; NF];
/// Zwei Zeilen gelten als gleich, wenn der (getrimmte) Unterschied darunter liegt
const SAME: i32 = (SEG as i32) * 4;
/// Höchster zulässiger mittlerer Unterschied für eine gefundene Verschiebung (×16)
const MATCH_MAX: i64 = (SEG as i64) * 6 * 16;

struct Rows {
    feat: Vec<Feat>,
    tex: Vec<bool>,
}

#[inline]
fn lum(p: &[u8]) -> i32 {
    (p[0] as i32 * 77 + p[1] as i32 * 150 + p[2] as i32 * 29) >> 8
}

fn features(buf: &[u8], w: usize, h: usize) -> Rows {
    let n = (w + 1) / 2; // jede zweite Spalte genügt
    let seg_w = (n / SEG).max(1);
    let mut feat = Vec::with_capacity(h);
    let mut tex = Vec::with_capacity(h);
    for y in 0..h {
        let row = &buf[y * w * 4..(y + 1) * w * 4];
        let (mut sum, mut edges, mut cnt) = ([0i32; SEG], [0i32; SEG], [0i32; SEG]);
        let (mut lo, mut hi, mut prev) = (255i32, 0i32, -1i32);
        for j in 0..n {
            let x = j * 2;
            let l = lum(&row[x * 4..x * 4 + 3]);
            let s = (j / seg_w).min(SEG - 1);
            sum[s] += l;
            cnt[s] += 1;
            if prev >= 0 && (l - prev).abs() > 24 {
                edges[s] += 1;
            }
            prev = l;
            lo = lo.min(l);
            hi = hi.max(l);
        }
        let mut f = [0i32; NF];
        for s in 0..SEG {
            if cnt[s] > 0 {
                f[s] = sum[s] / cnt[s];
                f[SEG + s] = edges[s] * 64 / cnt[s];
            }
        }
        feat.push(f);
        tex.push(hi - lo > 24);
    }
    Rows { feat, tex }
}

/// Unterschied zweier Zeilen. Die zwei am stärksten abweichenden Werte werden ignoriert,
/// damit schwebende Elemente (Chat-Blase, „Nach oben“-Button) nicht stören.
fn rdiff(a: &Feat, b: &Feat) -> i32 {
    let (mut sum, mut m1, mut m2) = (0i32, 0i32, 0i32);
    for (x, y) in a.iter().zip(b.iter()) {
        let d = (x - y).abs();
        sum += d;
        if d > m1 {
            m2 = m1;
            m1 = d;
        } else if d > m2 {
            m2 = d;
        }
    }
    sum - m1 - m2
}

/// Sind zwei Aufnahmen (praktisch) gleich? Für das Abwarten von Animationen.
fn frames_equal(a: &Rows, b: &Rows) -> bool {
    a.feat.iter().zip(b.feat.iter()).all(|(x, y)| rdiff(x, y) <= SAME)
}

/// Summe der kleinsten 75 % (mindestens `min_k`) – schlechte Zeilen (nachgeladene Inhalte,
/// Animationen) verfälschen den Abgleich so nicht.
fn trimmed(errs: &mut Vec<i32>, min_k: usize) -> Option<(i64, usize)> {
    if errs.len() < min_k {
        return None;
    }
    let k = (errs.len() * 3 / 4).max(min_k).min(errs.len());
    if k < errs.len() {
        errs.select_nth_unstable(k - 1);
    }
    Some((errs[..k].iter().map(|&e| e as i64).sum(), k))
}

/// Fehler für Verschiebung d (positiv: Inhalt nach oben gewandert) über jede `step`-te Zeile.
fn shift_error(cur: &Rows, prev: &Rows, d: isize, top: usize, bot: usize, h: usize, step: usize, min_k: usize, buf: &mut Vec<i32>) -> Option<(i64, usize)> {
    buf.clear();
    let (lo, hi) = if d > 0 { (top, h - bot - d as usize) } else { (top + (-d) as usize, h - bot) };
    let mut i = lo;
    while i < hi {
        if cur.tex[i] {
            let j = (i as isize + d) as usize;
            buf.push(rdiff(&cur.feat[i], &prev.feat[j]));
        }
        i += step;
    }
    trimmed(buf, min_k)
}

/// Sucht, um wie viele Zeilen sich der Inhalt verschoben hat. Gesucht wird in beide Richtungen;
/// gewinnt eine Verschiebung nach unten (zurückgescrollt), wird das Bild ignoriert.
fn find_shift(cur: &Rows, prev: &Rows, top: usize, bot: usize, h: usize) -> Option<usize> {
    let span = h - top - bot;
    let lim = span.saturating_sub((span / 5).max(12)) as isize;
    if lim < 2 {
        return None;
    }
    let mut buf = Vec::with_capacity(h);
    // grob: jede 4. Zeile
    let mut cands: Vec<(f64, isize)> = Vec::with_capacity(2 * lim as usize);
    for d in (1..lim).chain(-lim + 1..0) {
        if let Some((s, k)) = shift_error(cur, prev, d, top, bot, h, 4, 4, &mut buf) {
            cands.push((s as f64 / k as f64, d));
        }
    }
    if cands.is_empty() {
        return None;
    }
    cands.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    // eindeutig? Der beste Treffer muss klar besser sein als typische Verschiebungen
    let med = cands[cands.len() / 2].0;
    if med <= 0.5 || cands[0].0 > 0.5 * med {
        return None;
    }
    // fein: alle Zeilen für die besten Kandidaten
    let mut best: Option<(isize, i64)> = None;
    for &(_, d) in cands.iter().take(4) {
        if let Some((s, k)) = shift_error(cur, prev, d, top, bot, h, 1, 6, &mut buf) {
            let avg = s * 16 / k as i64;
            if best.map_or(true, |(_, b)| avg < b) {
                best = Some((d, avg));
            }
        }
    }
    match best {
        Some((d, avg)) if d > 0 && avg <= MATCH_MAX => Some(d as usize),
        _ => None,
    }
}

struct Stitcher {
    w: usize,
    h: usize,
    out: Vec<u8>,
    /// Merkmale und Pixel des zuletzt eingefügten Bildes
    prev: Option<Rows>,
    last: Vec<u8>,
    /// Zeilen am unteren Rand, die noch nicht übernommen sind: feststehende Fußzeile,
    /// Sperrzone (Steuerleiste im Bereich) und Rückhaltezone. In der Rückhaltezone lädt eine
    /// Endlos-Seite gerade nach – übernommen wird erst, wenn die Zeilen nach oben gewandert sind.
    cut: usize,
    hold: usize,
    ignore: usize,
    max_rows: usize,
    /// Höhe des zuletzt scrollenden Bereichs (für die Schrittweite beim automatischen Scrollen)
    span: usize,
    /// letztes Bild war unverändert (Seite steht wirklich still)
    pub last_unchanged: bool,
    pub full: bool,
}

impl Stitcher {
    fn new(w: usize, h: usize, max_rows: usize, ignore: usize) -> Self {
        let max_rows = max_rows.clamp(h, MAX_ROWS).min((MAX_PIXELS / w.max(1)).max(h));
        Stitcher {
            w,
            h,
            out: Vec::new(),
            prev: None,
            last: Vec::new(),
            cut: 0,
            hold: h / 6,
            ignore: ignore.min(h / 2),
            max_rows,
            span: h,
            last_unchanged: false,
            full: false,
        }
    }

    fn rows(&self) -> usize {
        self.out.len() / (self.w * 4)
    }

    /// Fügt ein neues Bild hinzu. Gibt die erkannte Verschiebung zurück (0 = nicht bewegt).
    fn push(&mut self, frame: Vec<u8>) -> usize {
        self.last_unchanged = false;
        if self.full {
            return 0;
        }
        let (rb, h) = (self.w * 4, self.h);
        let cur = features(&frame, self.w, h);
        let prev = match self.prev.take() {
            None => {
                self.cut = self.hold + self.ignore;
                self.out = frame[..(h - self.cut) * rb].to_vec();
                self.last = frame;
                self.prev = Some(cur);
                return 0;
            }
            Some(p) => p,
        };
        let same = |i: usize| rdiff(&cur.feat[i], &prev.feat[i]) <= SAME;

        // Nichts bewegt (oder nur unten etwas nachgeladen)?
        let n = h - self.ignore;
        let unchanged = (0..n).filter(|&i| same(i)).count();
        let top = (0..h).take_while(|&i| same(i)).count();
        let bot = (0..h).rev().take_while(|&i| same(i)).count().max(self.ignore);
        if unchanged * 100 >= n * 98 || top + bot + 16 >= h {
            self.last_unchanged = unchanged * 100 >= n * 98;
            self.prev = Some(prev);
            return 0;
        }
        self.span = h - top - bot;

        let d = match find_shift(&cur, &prev, top, bot, h) {
            Some(d) => d,
            None => {
                self.prev = Some(prev);
                return 0;
            }
        };

        let new_cut = bot + self.hold;
        if new_cut > self.cut {
            // Zeilen, die sich jetzt als feststehende Fußzeile zeigen, wieder entfernen
            let rm = (new_cut - self.cut).min(self.rows());
            let keep = self.rows() - rm;
            self.out.truncate(keep * rb);
            self.cut = new_cut;
        }
        // nie die feststehende Kopfzeile erneut anhängen
        let start = h.saturating_sub(self.cut + d).max(top);
        let end = h - new_cut;
        if end > start {
            self.out.extend_from_slice(&frame[start * rb..end * rb]);
        }
        self.cut = new_cut;
        self.prev = Some(cur);
        self.last = frame;
        if self.rows() + self.cut >= self.max_rows {
            self.full = true;
        }
        d
    }

    /// Letzte Aufnahme ohne Steuerleiste: ersetzt die Endzeilen, wenn sonst alles gleich ist.
    fn clean_tail(&mut self, frame: Vec<u8>) {
        let Some(prev) = &self.prev else { return };
        let cur = features(&frame, self.w, self.h);
        let n = self.h - self.ignore;
        let same = (0..n).filter(|&i| rdiff(&cur.feat[i], &prev.feat[i]) <= SAME).count();
        if same * 100 >= n * 95 {
            self.last = frame;
        }
    }

    fn finish(mut self) -> Result<RgbaImage, String> {
        if self.out.is_empty() && self.last.is_empty() {
            return Err("Es wurde nichts aufgenommen.".into());
        }
        let rb = self.w * 4;
        if self.cut > 0 && !self.last.is_empty() {
            self.out.extend_from_slice(&self.last[(self.h - self.cut) * rb..self.h * rb]);
        }
        let rows = self.rows() as u32;
        RgbaImage::from_raw(self.w as u32, rows, self.out).ok_or_else(|| "Bild konnte nicht erstellt werden.".into())
    }
}

/* ---------------- Aufnahme-Thread ---------------- */

fn crop(img: &RgbaImage, r: &Region) -> Option<Vec<u8>> {
    let (iw, ih) = (img.width(), img.height());
    if r.x + r.w > iw || r.y + r.h > ih {
        return None;
    }
    let raw = img.as_raw();
    let (x, y, w, h, iw) = (r.x as usize, r.y as usize, r.w as usize, r.h as usize, iw as usize);
    let mut out = Vec::with_capacity(w * h * 4);
    for row in y..y + h {
        let s = (row * iw + x) * 4;
        out.extend_from_slice(&raw[s..s + w * 4]);
    }
    Some(out)
}

fn grab(monitor: &Monitor, r: &Region) -> Result<Option<Vec<u8>>, String> {
    match monitor.capture_image() {
        Ok(img) => Ok(Some(crop(&img, r).ok_or("Der Bereich liegt außerhalb des Bildschirms.")?)),
        Err(_) => Ok(None),
    }
}

/// Nimmt den Bereich auf und wartet, bis sich das Bild nicht mehr ändert
/// (sanftes Scrollen, einblendende Bilder) – höchstens etwa 0,4 Sekunden.
fn grab_settled(monitor: &Monitor, r: &Region) -> Result<Option<Vec<u8>>, String> {
    let (w, h) = (r.w as usize, r.h as usize);
    let Some(mut frame) = grab(monitor, r)? else { return Ok(None) };
    let mut feat = features(&frame, w, h);
    for _ in 0..4 {
        std::thread::sleep(Duration::from_millis(90));
        let Some(next) = grab(monitor, r)? else { break };
        let nf = features(&next, w, h);
        let stable = frames_equal(&feat, &nf);
        frame = next;
        feat = nf;
        if stable {
            break;
        }
    }
    Ok(Some(frame))
}

struct LoopOpts {
    max_rows: usize,
    wait_ms: u64,
    ignore: usize,
}

fn scroll_loop(
    app: AppHandle,
    mon_index: usize,
    r: Region,
    mouse: (i32, i32),
    opts: LoopOpts,
    stop: Arc<AtomicBool>,
    auto: Arc<AtomicBool>,
) -> Result<RgbaImage, String> {
    let monitor = Monitor::all()
        .map_err(err)?
        .into_iter()
        .nth(mon_index)
        .ok_or("Bildschirm nicht gefunden.")?;
    let mut st = Stitcher::new(r.w as usize, r.h as usize, opts.max_rows, opts.ignore);
    let max = st.max_rows;
    let mut enigo: Option<Enigo> = None;
    let mut auto_before = false;
    // Schrittweite beim automatischen Scrollen: passt sich an, damit jeder Schritt
    // etwa 40 % des sichtbaren Bereichs weiterscrollt (genug Überlappung, aber zügig)
    let (mut notches, mut px_per_notch) = (3i32, 0f64);
    // Endlos-Seiten: seit wann bewegt sich nichts mehr, und wurde schon „angestupst“?
    let mut stalled_since: Option<std::time::Instant> = None;
    let mut nudged = false;
    let mut waiting = false;
    // Hat sich während des Stillstands irgendetwas geändert (Ladeanimation)? Dann länger warten.
    let mut stall_activity = false;
    // Hat das automatische Scrollen seit dem Einschalten überhaupt etwas bewegt?
    let mut auto_started = std::time::Instant::now();
    let (mut auto_moved, mut warned) = (false, false);

    // Steuerleiste erscheinen lassen
    std::thread::sleep(Duration::from_millis(300));

    while !stop.load(Ordering::Relaxed) {
        let is_auto = auto.load(Ordering::Relaxed);
        if is_auto {
            if enigo.is_none() {
                enigo = Enigo::new(&Settings::default()).ok();
                if enigo.is_none() {
                    auto.store(false, Ordering::Relaxed);
                    let _ = app.emit("scroll-auto-end", "Automatisches Scrollen ist auf diesem System nicht erlaubt.");
                }
            }
            if !auto_before {
                auto_started = std::time::Instant::now();
                auto_moved = false;
                warned = false;
            }
            if let Some(e) = enigo.as_mut() {
                if !auto_before {
                    let _ = e.move_mouse(mouse.0, mouse.1, Coordinate::Abs);
                    std::thread::sleep(Duration::from_millis(60));
                }
                let _ = e.scroll(notches, Axis::Vertical);
            }
        } else if waiting || stalled_since.is_some() {
            stalled_since = None;
            nudged = false;
            waiting = false;
            let _ = app.emit("scroll-status", "running");
        }
        auto_before = is_auto;

        let frame = if is_auto {
            std::thread::sleep(Duration::from_millis(50));
            grab_settled(&monitor, &r)?
        } else {
            std::thread::sleep(Duration::from_millis(110));
            grab(&monitor, &r)?
        };
        let Some(frame) = frame else { continue };
        if stop.load(Ordering::Relaxed) {
            break;
        }

        let d = st.push(frame);
        if is_auto {
            if d > 0 {
                auto_moved = true;
                let p = d as f64 / notches as f64;
                px_per_notch = if px_per_notch == 0.0 { p } else { px_per_notch * 0.6 + p * 0.4 };
                let target = 0.4 * st.span as f64;
                notches = ((target / px_per_notch.max(1.0)).floor() as i32).clamp(1, 15);
                if waiting {
                    let _ = app.emit("scroll-status", "running");
                }
                stalled_since = None;
                nudged = false;
                waiting = false;
                stall_activity = false;
            } else {
                if !st.last_unchanged {
                    stall_activity = true;
                }
                if !auto_moved && !warned && auto_started.elapsed() >= Duration::from_millis(2500) {
                    warned = true;
                    let _ = app.emit("scroll-status", "noscroll");
                }
                let since = *stalled_since.get_or_insert_with(std::time::Instant::now);
                let elapsed = since.elapsed().as_millis() as u64;
                if elapsed >= 700 && !waiting {
                    // vermutlich lädt die Seite gerade nach (Endlos-Scrollen)
                    waiting = true;
                    let _ = app.emit("scroll-status", "waiting");
                }
                // Seite steht völlig still: wahrscheinlich das Ende -> kurz warten.
                // Es bewegt sich noch etwas (Ladekreis): die eingestellte Wartezeit abwarten.
                let limit = if nudged {
                    opts.wait_ms.min(1_500)
                } else if stall_activity {
                    opts.wait_ms
                } else {
                    opts.wait_ms.min(2_000)
                };
                if elapsed >= limit {
                    if !nudged {
                        // manche Seiten laden erst nach einer weiteren Scroll-Bewegung nach
                        if let Some(e) = enigo.as_mut() {
                            let _ = e.scroll(-2, Axis::Vertical);
                            std::thread::sleep(Duration::from_millis(250));
                            let _ = e.scroll(2, Axis::Vertical);
                        }
                        nudged = true;
                        stall_activity = false;
                        stalled_since = Some(std::time::Instant::now());
                    } else {
                        auto.store(false, Ordering::Relaxed);
                        waiting = false;
                        stalled_since = None;
                        if auto_moved {
                            // Ende erreicht: automatisch abschließen, kein Klick auf „Fertig“ nötig
                            let _ = app.emit("scroll-autofinish", "end");
                        } else {
                            let _ = app.emit("scroll-auto-end", "Automatisches Scrollen hat die Seite nicht bewegt – bitte selbst scrollen.");
                        }
                    }
                }
            }
        }
        let _ = app.emit("scroll-progress", Progress { rows: st.rows() + st.cut, max });
        if st.full {
            auto.store(false, Ordering::Relaxed);
            let _ = app.emit("scroll-autofinish", "limit");
            break;
        }
    }

    // Auf „Fertig“ warten (falls die Grenze erreicht wurde), dann ein letztes Bild ohne
    // Steuerleiste aufnehmen – die Leiste wird von scroll_stop vorher ausgeblendet.
    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(50));
    }
    std::thread::sleep(Duration::from_millis(180));
    if let Ok(Some(frame)) = grab(&monitor, &r) {
        st.clean_tail(frame);
    }
    st.finish()
}

/* ---------------- Fenster ---------------- */

fn close_helpers(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("scroll") {
        let _ = w.destroy();
    }
}

fn helper(app: &AppHandle, label: &str, url: &str, x: f64, y: f64, w: f64, h: f64) -> Result<WebviewWindow, String> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("Bildlauf-Aufnahme")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .shadow(false)
        .inner_size(w.max(1.0), h.max(1.0))
        .position(x, y)
        .build()
        .map_err(err)
}

/// Startet die Bildlauf-Aufnahme für einen Bereich (in Bild-Pixeln der letzten Aufnahme).
#[tauri::command]
pub async fn scroll_start(
    app: AppHandle,
    window: WebviewWindow,
    region: Region,
    max_rows: Option<usize>,
    wait_ms: Option<u64>,
    shot: State<'_, Shot>,
    ctl: State<'_, ScrollCtl>,
) -> Result<(), String> {
    let mon: MonInfo = {
        let guard = shot.mon.lock().map_err(err)?;
        (*guard).ok_or("Keine Aufnahme vorhanden.")?
    };
    let r = region;
    if r.w < 40 || r.h < 40 || r.x + r.w > mon.iw || r.y + r.h > mon.ih {
        return Err("Ungültiger Bereich.".into());
    }
    if ctl.handle.lock().map_err(err)?.is_some() {
        return Err("Es läuft bereits eine Bildlauf-Aufnahme.".into());
    }

    // Hauptfenster aus dem Auswahl-Vollbild holen und verstecken
    let _ = window.set_fullscreen(false);
    let _ = window.set_always_on_top(false);
    let _ = window.hide();

    // Bild-Pixel -> physische -> logische Bildschirmkoordinaten
    let k = mon.pw as f64 / mon.iw.max(1) as f64;
    let s = mon.scale.max(0.1);
    let (px, py) = (mon.px as f64 + r.x as f64 * k, mon.py as f64 + r.y as f64 * k);
    let (pw, ph) = (r.w as f64 * k, r.h as f64 * k);
    let (lx, ly, lw, lh) = (px / s, py / s, pw / s, ph / s);
    let (mx, my, mw, mh) = (mon.px as f64 / s, mon.py as f64 / s, mon.pw as f64 / s, mon.ph as f64 / s);

    // Steuerleiste möglichst außerhalb des Bereichs platzieren (unten, oben, rechts, links).
    // Passt sie nirgends hin (Bereich = ganzer Bildschirm), sitzt sie unten rechts im Bereich;
    // diese Zeilen werden dann gesperrt und am Ende aus einem Bild ohne Leiste übernommen.
    let (cw, ch, gap) = (420.0, 108.0, 10.0);
    let cx = (lx + lw / 2.0 - cw / 2.0).clamp(mx, (mx + mw - cw).max(mx));
    let cy_mid = (ly + lh / 2.0 - ch / 2.0).clamp(my, (my + mh - ch).max(my));
    let mut ignore = 0usize;
    let (cx, cy) = if ly + lh + gap + ch <= my + mh {
        (cx, ly + lh + gap)
    } else if ly - gap - ch >= my {
        (cx, ly - gap - ch)
    } else if lx + lw + gap + cw <= mx + mw {
        (lx + lw + gap, cy_mid)
    } else if lx - gap - cw >= mx {
        (lx - gap - cw, cy_mid)
    } else {
        let (x, y) = (lx + lw - cw - 16.0, ly + lh - ch - 16.0);
        // Oberkante der Leiste in Bild-Pixeln relativ zum Bereich
        let bar_top = ((y * s - mon.py as f64) / k - r.y as f64).max(0.0);
        ignore = ((r.h as f64 - bar_top) + 12.0).ceil().max(0.0) as usize;
        (x, y)
    };
    helper(&app, "scroll", "scroll.html", cx, cy, cw, ch)?;

    // Mausposition für automatisches Scrollen (macOS: logische, sonst physische Pixel).
    // Liegt die Leiste im Bereich, zielt die Maus auf die Mitte oberhalb der Leiste.
    let usable_h = if ignore > 0 { ph - ignore as f64 * k } else { ph };
    let (cxp, cyp) = (px + pw / 2.0, py + usable_h / 2.0);
    let mouse = if cfg!(target_os = "macos") {
        ((cxp / s).round() as i32, (cyp / s).round() as i32)
    } else {
        (cxp.round() as i32, cyp.round() as i32)
    };

    let opts = LoopOpts {
        max_rows: max_rows.unwrap_or(MAX_ROWS),
        wait_ms: wait_ms.unwrap_or(DEFAULT_WAIT_MS).clamp(1_000, 30_000),
        ignore,
    };
    ctl.stop.store(false, Ordering::Relaxed);
    ctl.auto.store(false, Ordering::Relaxed);
    let (stop, auto, app2) = (ctl.stop.clone(), ctl.auto.clone(), app.clone());
    let index = mon.index;
    let handle = std::thread::spawn(move || scroll_loop(app2, index, r, mouse, opts, stop, auto));
    *ctl.handle.lock().map_err(err)? = Some(handle);
    Ok(())
}

/// Automatisches Scrollen ein-/ausschalten.
#[tauri::command]
pub fn scroll_auto(on: bool, ctl: State<'_, ScrollCtl>) {
    ctl.auto.store(on, Ordering::Relaxed);
}

/// Beendet die Bildlauf-Aufnahme. Ergebnis geht per Ereignis an das Hauptfenster.
#[tauri::command]
pub async fn scroll_stop(
    app: AppHandle,
    cancel: bool,
    shot: State<'_, Shot>,
    ctl: State<'_, ScrollCtl>,
) -> Result<(), String> {
    // Steuerleiste zuerst ausblenden, damit die letzte Aufnahme sie nicht enthält
    if let Some(w) = app.get_webview_window("scroll") {
        let _ = w.hide();
    }
    ctl.auto.store(false, Ordering::Relaxed);
    ctl.stop.store(true, Ordering::Relaxed);
    let handle = ctl.handle.lock().map_err(err)?.take();

    let result = match handle {
        Some(h) => h.join().unwrap_or_else(|_| Err("Die Aufnahme ist abgestürzt.".into())),
        None => Err("Es läuft keine Bildlauf-Aufnahme.".into()),
    };
    close_helpers(&app);
    if cancel {
        let _ = app.emit("scroll-cancel", ());
        return Ok(());
    }
    match result {
        Ok(img) => {
            let done = Done { width: img.width(), height: img.height() };
            *shot.image.lock().map_err(err)? = Some(img);
            let _ = app.emit("scroll-done", done);
        }
        Err(e) => {
            let _ = app.emit("scroll-error", e);
        }
    }
    Ok(())
}
