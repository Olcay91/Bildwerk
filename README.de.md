# Bildwerk

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/screenshot-light.png">
  <img alt="Bildwerk: fünf Bilder werden auf 16:9 zugeschnitten und auf 1920 px begrenzt" src="docs/screenshot-light.png">
</picture>

[English version](README.md) · Repository: https://github.com/Olcay91/Bildwerk

Schlanker, plattformübergreifender Bildeditor mit Stapelverarbeitung, Zuschnitt-Presets,
Größenbegrenzung, Export-Qualität und speicherbaren Arbeitsabläufen.

Gebaut mit [Tauri 2](https://tauri.app): Rust-Kern + System-WebView. Ergebnis sind echte
native Programme mit Installer für Windows, macOS und Linux (ca. 5–10 MB). Dieselbe
Oberfläche in `src/` läuft zusätzlich als Web-Version in jedem Browser.

## Projektaufbau

```
src/                Oberfläche (index.html, style.css, app.js, i18n.js = englische Texte; scroll.html = Steuerleiste)
src-tauri/          Native App (Rust)
  src/lib.rs        Befehl write_file: speichert Exporte direkt auf die Festplatte
  src/capture.rs    Screenshot: Bildschirm einfrieren, Fensterliste, Auswahl-Vollbild
  src/scroll.rs     Bildlauf-Aufnahme: Bereich verfolgen und zusammensetzen
  src/menu.rs       Menüleiste unter macOS
  tauri.conf.json   Fenster, Sicherheitsrichtlinie, Installer-Einstellungen
  capabilities/     Rechte der Oberfläche (Dateidialoge)
  icons/            App-Icons für alle Systeme
.github/workflows/  Automatischer Build für alle drei Systeme
docs/               Screenshots für das README
```

## Variante A: Bauen über GitHub (empfohlen, auch ohne Mac)

1. Projekt in ein GitHub-Repository hochladen.
2. Unter **Actions → Bildwerk bauen → Run workflow** starten.
3. Nach ca. 10–15 Minuten liegen die Installer unter dem Lauf als Artefakte bereit:
   `bildwerk-windows`, `bildwerk-macos`, `bildwerk-linux`.

Wird ein Tag wie `v0.1.0` gepusht, entsteht zusätzlich ein Release-Entwurf mit allen Installern.

## Variante B: Lokal bauen

Einmalig einrichten:

- **Alle Systeme:** [Rust](https://rustup.rs) und [Node.js LTS](https://nodejs.org)
- **Windows:** „Microsoft C++ Build Tools“ mit der Komponente *Desktopentwicklung mit C++*.
  WebView2 ist in Windows 10/11 bereits enthalten.
- **macOS:** `xcode-select --install`
- **Debian/Ubuntu:**
  `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libxcb1-dev libxrandr-dev libdbus-1-dev libpipewire-0.3-dev libwayland-dev libegl-dev libgbm-dev clang`

Dann im Projektordner:

```bash
npm install
npm run dev      # App im Entwicklungsmodus starten
npm run build    # Installer erzeugen
```

Die Installer liegen danach in `src-tauri/target/release/bundle/`:

| System  | Dateien                                   |
|---------|-------------------------------------------|
| Windows | `msi/*.msi`, `nsis/*-setup.exe`           |
| macOS   | `macos/Bildwerk.app`, `dmg/*.dmg`         |
| Linux   | `deb/*.deb`, `rpm/*.rpm`, `appimage/*.AppImage` |

Jedes System kann nur Installer für sich selbst bauen. Für alle drei auf einmal Variante A nutzen.

## Ansicht

Unter **Einstellungen → Ansicht**: Hell, Dunkel oder System (folgt automatisch dem Betriebssystem,
inklusive Titelleiste der App) sowie die Größe von Symbolen und Text von 75 % bis 150 %.
Doppelklick auf den Regler setzt auf 100 % zurück.

## Screenshots

In **Einstellungen → Screenshots** ein- und ausschaltbar (standardmäßig aus). Dort lassen sich
ein systemweites Tastenkürzel (Standard: Strg + Alt + S) und der Startmodus festlegen.
Beim Auslösen wird Bildwerk ausgeblendet, der Bildschirm eingefroren und eine Auswahl angezeigt:

- **Bereich:** Rechteck frei aufziehen
- **Fenster:** auf ein Fenster klicken (es wird hervorgehoben)
- **Vollbild:** klicken oder Eingabe drücken
- **Bildlauf** (nur Desktop-App): Scrollbereich aufziehen oder ein Fenster anklicken. Neben dem
  Bereich erscheint eine Steuerleiste (passt sie nicht daneben, unten rechts im Bereich – sie
  landet trotzdem nicht im Bild). Jetzt im Bereich nach unten scrollen – von Hand oder mit
  „Automatisch scrollen“ (die Schrittweite passt sich automatisch an). Bildwerk erkennt die neuen
  Zeilen und setzt ein langes Bild zusammen; feststehende Kopf- und Fußzeilen erscheinen nur einmal.
  Tipp: Nur den scrollenden Bereich aufziehen – feste Seitenleisten (Lesezeichen, Navigationsbereich)
  und Scrollbalken würden sonst bei jedem Schritt mit aufgenommen. Am Seitenende schließt die
  Aufnahme von selbst ab; beim Scrollen von Hand beendet „Fertig“ sie (max. 30.000 Pixel Höhe).
  Seiten mit **endlosem Scrollen** (Social Media, Shops, Suchergebnisse): Bildwerk wartet, bis
  nachgeladene Inhalte erscheinen, übernimmt die untersten Zeilen erst, wenn sie fertig geladen
  sind, und stoppt spätestens bei der eingestellten maximalen Länge (Einstellungen → Screenshots).

Tasten 1/2/3/4 wechseln den Modus, Esc bricht ab. Das Ergebnis landet als neues Bild im Editor und wird
automatisch in die Zwischenablage kopiert (abschaltbar).

Systemhinweise:

- **macOS:** Beim ersten Screenshot fragt macOS nach „Bildschirm- & Systemaudioaufnahme“
  (Systemeinstellungen → Datenschutz & Sicherheit). Bildwerk einschalten und neu starten.
  macOS knüpft diese Erlaubnis an die **Signatur** der App. Ohne feste Signatur (Standard bei
  eigenen Builds) gilt jeder neue Build als neue App und fragt erneut. Abhilfe für Tests:
  1. Schlüsselbundverwaltung → Zertifikatsassistent → Zertifikat erstellen: Name z. B.
     „Bildwerk Entwicklung“, Identitätstyp „Root/selbst signiert“, Zertifikattyp „Codesignatur“.
  2. Vor dem Bauen: `export APPLE_SIGNING_IDENTITY="Bildwerk Entwicklung"` und `npm run build`.
  3. Die gebaute App nach /Programme kopieren und von dort starten; alte Einträge entfernen mit
     `tccutil reset ScreenCapture de.bildwerk.editor`.
- **Linux/Wayland:** Globale Tastenkürzel und die Fensterliste funktionieren nur unter X11.
  Unter Wayland über den Button „Screenshot“ auslösen; je nach Desktop kann die Aufnahme eingeschränkt sein.
- Aufgenommen wird der Bildschirm, auf dem Bildwerk gerade geöffnet ist.
- **Automatisch scrollen** steuert das Mausrad. macOS fragt dafür nach der Berechtigung
  „Bedienungshilfen“; unter Wayland ist es nicht möglich (von Hand scrollen funktioniert).

## Bildansicht und Zoom

Strg + Mausrad (oder Zwei-Finger-Geste am Touchpad) zoomt am Mauszeiger, `+`/`−` zoomen, `0` passt
ein, `1` zeigt 100 %. Vergrößert verschiebt man das Bild per Ziehen (außerhalb des Zuschnittrahmens),
mit der mittleren Maustaste, Leertaste + Ziehen oder dem Mausrad. Ab 200 % werden Pixel scharf
dargestellt – praktisch für pixelgenaues Zuschneiden. Unten rechts gibt es dafür auch Buttons.

## Werkzeugleiste

Klick auf ein Werkzeug öffnet es, erneuter Klick schließt es. Rechtsklick auf die Werkzeuge (auf Touch-Geräten: lange gedrückt halten) öffnet
„Anpassen“: Werkzeuge hinzufügen, entfernen und per Ziehen umsortieren.

## Einstellungen

Eigenes Fenster: Zahnrad unten links oder **⌘ ,** (macOS) bzw. **Strg + ,**.

- **Info:** Version, Updates, Link zum GitHub-Projekt, Übersicht aller Tastenkürzel, Änderungsprotokoll.
  Nach einem Update zeigt Bildwerk einmalig einen Dialog mit den Neuerungen.
- **Ansicht:** Sprache (Deutsch/English, beim ersten Start nach Systemsprache), Modus (Einfach blendet
  Feineinstellungen aus, Erweitert zeigt alles), Hell/Dunkel/System, Werkzeuge als Symbole, Text oder
  beides, Größe von Symbolen und Text.
- **Speichern:** Standardordner (Standard: Bilder-Ordner des Systems), Speichern ohne Nachfrage,
  Dateiformat und Qualität.
- **Screenshots:** siehe oben, außerdem Dateiformat (PNG/JPEG/WebP) und automatisches Speichern
  im Standardordner.
- **Updates** (im Reiter Info): automatische Suche beim Start, optional Download im Hintergrund.

## Automatische Updates einrichten (einmalig)

Updates werden über GitHub-Releases verteilt und mit einem eigenen Schlüssel signiert.

1. Schlüssel erzeugen: `npm run tauri signer generate -- -w ~/.tauri/bildwerk.key`
   (Passwort merken; die Datei `bildwerk.key` niemals veröffentlichen).
2. In `src-tauri/tauri.conf.json`:
   - `plugins.updater.pubkey` = Inhalt von `~/.tauri/bildwerk.key.pub`
   - `bundle.createUpdaterArtifacts` = `true`
   (Die Update-Adresse zeigt bereits auf github.com/Olcay91/Bildwerk.)
3. Im GitHub-Repository unter *Settings → Secrets and variables → Actions* anlegen:
   `TAURI_SIGNING_PRIVATE_KEY` (Inhalt von `bildwerk.key`) und
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Neue Version veröffentlichen:

1. Versionsnummer erhöhen in `tauri.conf.json`, `Cargo.toml`, `package.json` und `APP_VERSION` in `src/app.js`.
2. Neuen Eintrag oben in `CHANGELOG` (in `src/app.js`) und in `CHANGELOG.md` ergänzen.
3. Tag pushen, z. B. `git tag v0.3.1 && git push --tags`.
4. Den vom Workflow erstellten Release-Entwurf auf GitHub veröffentlichen.
   Ab dann bieten installierte Versionen das Update an.

## Übersetzung

Die Oberfläche ist auf Deutsch geschrieben; `src/i18n.js` enthält die englischen Texte. Feste Texte
stehen im Wörterbuch `EN`, Texte mit Zahlen oder Namen als Muster in `EN_RX`. Neue deutsche Texte
dort ergänzen – fehlt ein Eintrag, bleibt der Text in der englischen Oberfläche einfach deutsch.

## Schrift

Die Oberfläche nutzt **Office Code Pro Regular** (SIL Open Font License 1.1, github.com/nathco/Office-Code-Pro).
Die Schriftdatei liegt nicht im Projekt bei: `OfficeCodePro-Regular.woff2` (oder `.woff`/`.otf`) aus dem
Repository nach `src/fonts/` kopieren, ebenso die Lizenzdatei. Ohne Datei verwendet Bildwerk eine
installierte Office Code Pro bzw. Source Code Pro oder eine Festbreitenschrift des Systems.

## Hinweise

- Die Installer sind nicht signiert. Windows zeigt beim ersten Start eventuell
  SmartScreen („Weitere Informationen → Trotzdem ausführen“), macOS verlangt
  Rechtsklick → Öffnen.
- Neues Icon: eigenes 1024×1024-PNG als `app-icon.png` ablegen und
  `npm run tauri icon app-icon.png` ausführen.
- Web-Version: Den Ordner `src/` auf einen beliebigen Webserver legen.
  Dort wird der Stapel als ZIP heruntergeladen, in der App direkt in einen Ordner gespeichert.
