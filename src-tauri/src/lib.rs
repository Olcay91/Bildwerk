mod capture;
mod menu;
mod scroll;

use percent_encoding::percent_decode_str;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};

/// Liest die Binärdaten eines Aufrufs. Normalerweise kommen sie roh an; fällt Tauri auf den
/// Ausweichweg (postMessage) zurück, werden sie als JSON-Zahlenliste oder -Objekt übertragen.
pub(crate) fn body_bytes<'a>(req: &'a Request<'_>) -> Result<std::borrow::Cow<'a, [u8]>, String> {
    use std::borrow::Cow;
    let missing = || "Es wurden keine Binärdaten übergeben.".to_string();
    match req.body() {
        InvokeBody::Raw(b) => Ok(Cow::Borrowed(b.as_slice())),
        InvokeBody::Json(v) => match v {
            serde_json::Value::Array(a) => a
                .iter()
                .map(|x| x.as_u64().filter(|n| *n < 256).map(|n| n as u8))
                .collect::<Option<Vec<u8>>>()
                .map(Cow::Owned)
                .ok_or_else(missing),
            serde_json::Value::Object(o) => {
                // Uint8Array als {"0": 12, "1": 34, …}
                let mut out = vec![0u8; o.len()];
                for (k, x) in o {
                    let i: usize = k.parse().map_err(|_| missing())?;
                    let n = x.as_u64().filter(|n| *n < 256).ok_or_else(missing)?;
                    *out.get_mut(i).ok_or_else(missing)? = n as u8;
                }
                Ok(Cow::Owned(out))
            }
            _ => Err(missing()),
        },
        #[allow(unreachable_patterns)]
        _ => Err(missing()),
    }
}

/// Liest einen URL-kodierten Header (Pfade können Umlaute enthalten).
fn header(req: &Request<'_>, key: &str) -> Option<String> {
    let raw = req.headers().get(key)?.to_str().ok()?;
    percent_decode_str(raw).decode_utf8().ok().map(|s| s.into_owned())
}

/// Hängt -2, -3 … an, falls die Datei schon existiert.
fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let dir = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let mut n = 2u32;
    loop {
        let candidate = dir.join(format!("{stem}-{n}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// Schreibt Binärdaten aus der Oberfläche auf die Festplatte.
/// Header: x-path (voller Pfad) ODER x-dir + x-name; optional x-unique = 1.
/// Gibt den tatsächlich geschriebenen Pfad zurück.
#[tauri::command]
fn write_file(request: Request<'_>) -> Result<String, String> {
    let data = body_bytes(&request)?;

    let mut path = if let Some(p) = header(&request, "x-path") {
        PathBuf::from(p)
    } else {
        let dir = header(&request, "x-dir").ok_or("Zielordner fehlt.")?;
        let name = header(&request, "x-name").ok_or("Dateiname fehlt.")?;
        // Nur den reinen Dateinamen verwenden, keine Pfadbestandteile
        let name = Path::new(&name)
            .file_name()
            .ok_or("Ungültiger Dateiname.")?
            .to_owned();
        PathBuf::from(dir).join(name)
    };

    if header(&request, "x-unique").as_deref() == Some("1") {
        path = unique_path(path);
    }

    std::fs::write(&path, &*data).map_err(|e| format!("{}: {}", path.display(), e))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(capture::Shot::default())
        .manage(capture::Clip::default())
        .manage(scroll::ScrollCtl::default())
        // macOS: eigene Menüleiste (deutsch, ohne „Dienste“); die Oberfläche stellt danach die Sprache ein
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let m = menu::build(app.handle(), "de")?;
                app.set_menu(m)?;
            }
            let _ = app;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "settings" {
                use tauri::Emitter;
                let _ = app.emit("open-settings", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            write_file,
            capture::capture_begin,
            capture::capture_pixels,
            capture::overlay_show,
            capture::overlay_end,
            capture::copy_image,
            capture::open_screen_settings,
            scroll::scroll_start,
            scroll::scroll_auto,
            scroll::scroll_stop,
            menu::set_menu_lang
        ])
        .run(tauri::generate_context!())
        .expect("Bildwerk konnte nicht gestartet werden");
}
