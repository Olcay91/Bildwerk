//! Menüleiste unter macOS (Bildwerk · Bearbeiten · Fenster) in der Sprache der App.
//! Unter Windows und Linux hat das Fenster keine Menüleiste – dort passiert hier nichts.

use tauri::{AppHandle, Runtime};

/// Baut die Menüleiste. `lang` ist "de" oder "en".
#[cfg(target_os = "macos")]
pub fn build<R: Runtime>(app: &AppHandle<R>, lang: &str) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
    let de = lang != "en";
    let t = |d: &'static str, e: &'static str| if de { d } else { e };

    // Programm-Menü – bewusst ohne „Dienste“
    let about = PredefinedMenuItem::about(app, Some(t("Über Bildwerk", "About Bildwerk")), Some(AboutMetadata::default()))?;
    let settings = MenuItemBuilder::with_id("settings", t("Einstellungen …", "Settings …"))
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let hide = PredefinedMenuItem::hide(app, Some(t("Bildwerk ausblenden", "Hide Bildwerk")))?;
    let hide_others = PredefinedMenuItem::hide_others(app, Some(t("Andere ausblenden", "Hide Others")))?;
    let show_all = PredefinedMenuItem::show_all(app, Some(t("Alle einblenden", "Show All")))?;
    let quit = PredefinedMenuItem::quit(app, Some(t("Bildwerk beenden", "Quit Bildwerk")))?;
    let app_menu = SubmenuBuilder::new(app, "Bildwerk")
        .item(&about)
        .separator()
        .item(&settings)
        .separator()
        .item(&hide)
        .item(&hide_others)
        .item(&show_all)
        .separator()
        .item(&quit)
        .build()?;

    // Bearbeiten – nötig, damit Kopieren/Einsetzen in Eingabefeldern per Tastatur funktioniert
    let undo = PredefinedMenuItem::undo(app, Some(t("Widerrufen", "Undo")))?;
    let redo = PredefinedMenuItem::redo(app, Some(t("Wiederholen", "Redo")))?;
    let cut = PredefinedMenuItem::cut(app, Some(t("Ausschneiden", "Cut")))?;
    let copy = PredefinedMenuItem::copy(app, Some(t("Kopieren", "Copy")))?;
    let paste = PredefinedMenuItem::paste(app, Some(t("Einsetzen", "Paste")))?;
    let select_all = PredefinedMenuItem::select_all(app, Some(t("Alles auswählen", "Select All")))?;
    let edit_menu = SubmenuBuilder::new(app, t("Bearbeiten", "Edit"))
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&select_all)
        .build()?;

    // Fenster
    let minimize = PredefinedMenuItem::minimize(app, Some(t("Im Dock ablegen", "Minimize")))?;
    let zoom = PredefinedMenuItem::maximize(app, Some(t("Zoomen", "Zoom")))?;
    let fullscreen = PredefinedMenuItem::fullscreen(app, Some(t("Vollbildmodus", "Enter Full Screen")))?;
    let close = PredefinedMenuItem::close_window(app, Some(t("Fenster schließen", "Close Window")))?;
    let window_menu = SubmenuBuilder::new(app, t("Fenster", "Window"))
        .item(&minimize)
        .item(&zoom)
        .item(&fullscreen)
        .separator()
        .item(&close)
        .build()?;

    MenuBuilder::new(app).item(&app_menu).item(&edit_menu).item(&window_menu).build()
}

/// Wird von der Oberfläche beim Start und bei jedem Sprachwechsel aufgerufen.
#[tauri::command]
pub fn set_menu_lang<R: Runtime>(app: AppHandle<R>, lang: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let menu = build(&app, &lang).map_err(|e| e.to_string())?;
        app.set_menu(menu).map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, lang);
    }
    Ok(())
}
