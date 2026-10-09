//! Screenshot-Funktion: Bildschirm einfrieren, Fensterliste ermitteln,
//! Hauptfenster als Vollbild-Auswahlfläche anzeigen.

use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::ipc::{Request, Response};
use tauri::{State, WebviewWindow};
use xcap::image::RgbaImage;
use xcap::{Monitor, Window};

/// Zwischenspeicher für die letzte Aufnahme (bis die Oberfläche sie abholt)
/// und Angaben zum aufgenommenen Bildschirm (für die Bildlauf-Aufnahme).
#[derive(Default)]
pub struct Shot {
    pub image: Mutex<Option<RgbaImage>>,
    pub mon: Mutex<Option<MonInfo>>,
}

/// Bildschirm der letzten Aufnahme.
#[derive(Clone, Copy, Debug)]
pub struct MonInfo {
    /// Index in xcap::Monitor::all()
    pub index: usize,
    /// Position/Größe in physischen Pixeln (Tauri-Koordinaten)
    pub px: i32,
    pub py: i32,
    pub pw: u32,
    pub ph: u32,
    pub scale: f64,
    /// Größe des aufgenommenen Bildes
    pub iw: u32,
    pub ih: u32,
}

#[derive(Serialize)]
pub struct WinRect {
    title: String,
    app: String,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

#[derive(Serialize)]
pub struct CaptureInfo {
    width: u32,
    height: u32,
    /// Fenster auf diesem Bildschirm, vorderstes zuerst, in Bild-Pixeln
    windows: Vec<WinRect>,
}

pub(crate) fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Bildschirm wählen, auf dem Bildwerk gerade geöffnet ist (sonst Hauptbildschirm).
fn pick_monitor(win: &WebviewWindow) -> Result<(usize, Monitor, Option<tauri::Monitor>), String> {
    let monitors = Monitor::all().map_err(err)?;
    let mut index = None;
    let current = win.current_monitor().ok().flatten();

    if let Some(cur) = &current {
        let p = cur.position();
        let s = cur.scale_factor();
        let (lx, ly) = ((p.x as f64 / s).round() as i32, (p.y as f64 / s).round() as i32);
        index = monitors.iter().position(|m| {
            let (mx, my) = (m.x().unwrap_or(i32::MIN), m.y().unwrap_or(i32::MIN));
            (mx == p.x && my == p.y) || (mx == lx && my == ly)
        });
    }
    let index = index
        .or_else(|| monitors.iter().position(|m| m.is_primary().unwrap_or(false)))
        .unwrap_or(0);

    let monitor = monitors
        .into_iter()
        .nth(index)
        .ok_or_else(|| "Kein Bildschirm gefunden.".to_string())?;
    Ok((index, monitor, current))
}

/// Fensterlose Systemebenen von macOS und Windows
fn is_system_window(app: &str, title: &str) -> bool {
    const APPS: [&str; 22] = [
        "Window Server", "WindowServer", "Dock", "Control Center", "Kontrollzentrum", "SystemUIServer",
        "Notification Center", "Mitteilungszentrale", "NotificationCenter", "Spotlight", "WindowManager",
        "TextInputMenuAgent", "loginwindow", "Wallpaper", "Hintergrundbild", "Screenshot", "Bildschirmfoto",
        "Program Manager", "Windows Input Experience", "Windows-Eingabeerfahrung",
        "Microsoft Text Input Application", "Bildwerk",
    ];
    let a = app.trim();
    APPS.iter().any(|s| a.eq_ignore_ascii_case(s))
        || title.trim() == "Program Manager"
        || title.starts_with("Wallpaper-")
        || title == "Menubar" || title == "Menüleiste" || title == "Item-0"
}

fn grab(monitor: &Monitor) -> Result<(RgbaImage, Vec<WinRect>), String> {
    let image = monitor.capture_image().map_err(err)?;
    let (iw, ih) = (image.width() as i32, image.height() as i32);
    let (mx, my) = (monitor.x().unwrap_or(0), monitor.y().unwrap_or(0));
    let mw = monitor.width().unwrap_or(image.width()).max(1);
    // Umrechnung Bildschirm-Koordinaten -> Bild-Pixel (z. B. Retina = 2.0)
    let scale = image.width() as f64 / mw as f64;

    let mut windows = Vec::new();
    let (mw_px, mh_px) = (iw as i64, ih as i64);
    for w in Window::all().unwrap_or_default() {
        // unbekannt = nicht minimiert (unter macOS liefert die Abfrage nicht immer einen Wert)
        if w.is_minimized().unwrap_or(false) {
            continue;
        }
        let title = w.title().unwrap_or_default();
        let app = w.app_name().unwrap_or_default();
        if title.trim().is_empty() && app.trim().is_empty() {
            continue;
        }
        // Systemebenen, die über allem liegen (Dock, Menüleiste, Schreibtisch …), sind keine Fenster
        if is_system_window(&app, &title) {
            continue;
        }
        let (wx, wy) = (w.x().unwrap_or(0), w.y().unwrap_or(0));
        let (ww, wh) = (w.width().unwrap_or(0) as i32, w.height().unwrap_or(0) as i32);
        if ww < 40 || wh < 40 {
            continue;
        }
        let r = WinRect {
            title,
            app,
            x: ((wx - mx) as f64 * scale).round() as i32,
            y: ((wy - my) as f64 * scale).round() as i32,
            w: (ww as f64 * scale).round() as i32,
            h: (wh as f64 * scale).round() as i32,
        };
        // nur Fenster, die auf diesem Bildschirm sichtbar sind
        if r.x + r.w <= 0 || r.y + r.h <= 0 || r.x >= iw || r.y >= ih {
            continue;
        }
        // namenlose Flächen über den ganzen Bildschirm sind Hintergründe/Ebenen, keine Fenster
        let covers = (r.w as i64) * (r.h as i64) * 100 >= mw_px * mh_px * 95;
        if covers && r.title.trim().is_empty() {
            continue;
        }
        windows.push(r);
    }
    Ok((image, windows))
}

/* macOS: Berechtigung „Bildschirm- & Systemaudioaufnahme“ */
#[cfg(target_os = "macos")]
mod mac_perm {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        pub fn CGPreflightScreenCaptureAccess() -> bool;
        pub fn CGRequestScreenCaptureAccess() -> bool;
    }
    pub static ASKED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
}

/// Darf Bildwerk den Bildschirm aufnehmen? Unter macOS wird das System nur einmal pro
/// Programmstart gefragt – jeder weitere Aufnahmeversuch ohne Erlaubnis würde sonst erneut
/// die Systemabfrage auslösen. Andere Systeme brauchen keine Erlaubnis.
#[cfg(target_os = "macos")]
fn screen_access() -> bool {
    use std::sync::atomic::Ordering;
    // SAFETY: einfache CoreGraphics-Abfragen ohne Argumente (verfügbar ab macOS 10.15)
    if unsafe { mac_perm::CGPreflightScreenCaptureAccess() } {
        return true;
    }
    if !mac_perm::ASKED.swap(true, Ordering::Relaxed) {
        // SAFETY: siehe oben; zeigt höchstens einmal die Systemabfrage
        return unsafe { mac_perm::CGRequestScreenCaptureAccess() };
    }
    false
}

#[cfg(not(target_os = "macos"))]
fn screen_access() -> bool {
    true
}

/// Öffnet unter macOS die passende Seite der Systemeinstellungen.
#[tauri::command]
pub fn open_screen_settings() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn();
    }
}

/// Blendet Bildwerk aus, nimmt den Bildschirm auf und merkt sich das Bild.
#[tauri::command]
pub async fn capture_begin(window: WebviewWindow, shot: State<'_, Shot>) -> Result<CaptureInfo, String> {
    // ohne Erlaubnis gar nicht erst versuchen (sonst fragt macOS bei jedem Versuch erneut)
    if !screen_access() {
        return Err("PERMISSION_SCREEN".into());
    }
    let (index, monitor, current) = pick_monitor(&window)?;
    window.hide().map_err(err)?;
    // dem System Zeit geben, das Fenster wirklich zu entfernen
    std::thread::sleep(Duration::from_millis(280));

    match grab(&monitor) {
        Ok((image, windows)) => {
            let (iw, ih) = (image.width(), image.height());
            let info = match &current {
                Some(m) => MonInfo {
                    index,
                    px: m.position().x,
                    py: m.position().y,
                    pw: m.size().width,
                    ph: m.size().height,
                    scale: m.scale_factor(),
                    iw,
                    ih,
                },
                None => MonInfo {
                    index,
                    px: monitor.x().unwrap_or(0),
                    py: monitor.y().unwrap_or(0),
                    pw: iw,
                    ph: ih,
                    scale: 1.0,
                    iw,
                    ih,
                },
            };
            *shot.mon.lock().map_err(err)? = Some(info);
            *shot.image.lock().map_err(err)? = Some(image);
            Ok(CaptureInfo { width: iw, height: ih, windows })
        }
        Err(e) => {
            let _ = window.show();
            let _ = window.set_focus();
            Err(e)
        }
    }
}

/// Liefert die Aufnahme als rohe RGBA-Pixel (schneller als PNG über die Brücke).
#[tauri::command]
pub fn capture_pixels(shot: State<'_, Shot>) -> Result<Response, String> {
    let image = shot.image.lock().map_err(err)?.take().ok_or("Keine Aufnahme vorhanden.")?;
    Ok(Response::new(image.into_raw()))
}

/// Zeigt Bildwerk randlos im Vollbild über allem als Auswahlfläche.
#[tauri::command]
pub fn overlay_show(window: WebviewWindow) -> Result<(), String> {
    window.set_always_on_top(true).map_err(err)?;
    window.set_fullscreen(true).map_err(err)?;
    window.show().map_err(err)?;
    window.set_focus().map_err(err)?;
    Ok(())
}

/// Stellt das normale Fenster wieder her.
#[tauri::command]
pub fn overlay_end(window: WebviewWindow) -> Result<(), String> {
    let _ = window.set_fullscreen(false);
    let _ = window.set_always_on_top(false);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    Ok(())
}

/// Hält die Zwischenablage offen. Unter Linux/X11 verschwindet der Inhalt,
/// sobald das Clipboard-Objekt freigegeben wird – deshalb lebt es so lange wie die App.
#[derive(Default)]
pub struct Clip(Mutex<Option<arboard::Clipboard>>);

fn num_header(req: &Request<'_>, key: &str) -> Option<usize> {
    req.headers().get(key)?.to_str().ok()?.parse().ok()
}

/// Kopiert ein Bild (rohe RGBA-Pixel) in die Zwischenablage des Systems.
/// Header: x-width, x-height
#[tauri::command]
pub fn copy_image(request: Request<'_>, clip: State<'_, Clip>) -> Result<(), String> {
    let bytes = crate::body_bytes(&request)?;
    let width = num_header(&request, "x-width").ok_or("Breite fehlt.")?;
    let height = num_header(&request, "x-height").ok_or("Höhe fehlt.")?;
    if bytes.len() != width * height * 4 {
        return Err("Bildgröße passt nicht zu den Daten.".into());
    }

    let mut guard = clip.0.lock().map_err(err)?;
    if guard.is_none() {
        *guard = Some(arboard::Clipboard::new().map_err(err)?);
    }
    let clipboard = guard.as_mut().ok_or("Zwischenablage nicht verfügbar.")?;
    clipboard
        .set_image(arboard::ImageData {
            width,
            height,
            bytes: std::borrow::Cow::Borrowed(&bytes[..]),
        })
        .map_err(err)
}
