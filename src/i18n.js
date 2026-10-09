/* Bildwerk – Übersetzung (Deutsch ist die Ausgangssprache, hier steht Englisch).
   Feste Texte werden direkt nachgeschlagen, Texte mit Zahlen/Namen über Muster. */
(() => {
"use strict";
const EN = {
  // Werkzeuge und Bereiche
  "Einstellungen":"Settings","Zuschneiden":"Crop","Drehen & Spiegeln":"Rotate & flip","Größe":"Size","Export":"Export",
  "Arbeitsabläufe":"Workflows","Screenshot":"Screenshot","Anpassen":"Customize","Werkzeuge":"Tools","Werkzeugleiste":"Toolbar",
  "Bilder hinzufügen":"Add images","90° links drehen":"Rotate 90° left","90° rechts drehen":"Rotate 90° right",
  "Horizontal spiegeln":"Flip horizontally","Vertikal spiegeln":"Flip vertically","Zuschnitt zurücksetzen":"Reset crop",
  "Schnell exportieren":"Quick export","Alle exportieren":"Export all","Öffnet einen Bereich":"Opens a panel","Sofort-Aktion":"Instant action",
  "Seitenleiste einklappen":"Collapse sidebar","Seitenleiste ausklappen":"Expand sidebar",
  // Zuschneiden
  "Ziehe die gelben Ecken oder verschiebe den Rahmen im Bild.":"Drag the yellow corners or move the frame in the image.",
  "Seitenverhältnis":"Aspect ratio","Breite":"Width","Höhe":"Height","Frei":"Free","Original":"Original","Eigenes":"Custom",
  "Bilder ohne eigenen Zuschnitt werden mittig zugeschnitten.":"Images without their own crop are cropped from the center.",
  // Drehen
  "Tastenkürzel: R dreht nach rechts, H und V spiegeln.":"Shortcuts: R rotates right, H and V flip.",
  "90° links":"90° left","90° rechts":"90° right","Horizontal":"Horizontal","Vertikal":"Vertical","Drehung zurücksetzen":"Reset rotation",
  "Keine Drehung oder Spiegelung.":"No rotation or flip.","horizontal gespiegelt":"flipped horizontally","vertikal gespiegelt":"flipped vertically",
  // Größe
  "Begrenzt die Ausgabe auf eine maximale Auflösung. Kleinere Bilder werden nie hochskaliert.":"Limits the output to a maximum resolution. Smaller images are never upscaled.",
  "Größe begrenzen":"Limit size","Max. Breite (px)":"Max. width (px)","Max. Höhe (px)":"Max. height (px)",
  "Feld leer lassen = keine Grenze in dieser Richtung.":"Leave empty = no limit in this direction.",
  "Längste Seite":"Longest side","Seitenverhältnis beibehalten":"Keep aspect ratio",
  // Export
  "Format und Qualität gelten für das einzelne Bild und den ganzen Stapel.":"Format and quality apply to the single image and the whole batch.",
  "Format":"Format","Qualität":"Quality","Klein":"Small","Mittel":"Medium","Hoch":"High","Max.":"Max.",
  "PNG ist verlustfrei, die Qualität spielt keine Rolle.":"PNG is lossless, quality doesn't matter.",
  "Zusatz für den Dateinamen":"File name suffix","Dieses Bild exportieren":"Export this image","Alle als ZIP exportieren":"Export all as ZIP",
  "Alle in Ordner exportieren":"Export all to folder","Exportieren":"Export","Importieren":"Import","z. B. _web":"e.g. _web",
  // Arbeitsabläufe
  "Speichert Seitenverhältnis, Drehung, Größe und Export-Einstellungen, um sie später mit einem Klick anzuwenden.":"Saves aspect ratio, rotation, size and export settings so you can apply them later with one click.",
  "Name":"Name","Ablauf speichern":"Save workflow","z. B. Instagram quadratisch":"e.g. Instagram square",
  "Abläufe werden auf diesem Gerät gespeichert. Mit Exportieren erhältst du eine JSON-Datei zum Sichern oder Teilen.":"Workflows are stored on this device. Export gives you a JSON file for backup or sharing.",
  "Noch keine Abläufe gespeichert. Stelle alles ein, gib einen Namen ein und speichere.":"No workflows saved yet. Set everything up, enter a name and save.",
  "Anwenden":"Apply","Löschen":"Delete","Gib dem Ablauf zuerst einen Namen.":"Give the workflow a name first.",
  "Die Datei enthält keine gültigen Arbeitsabläufe.":"The file contains no valid workflows.",
  "Es gibt noch keine Abläufe zum Exportieren.":"There are no workflows to export yet.",
  "Freier Zuschnitt":"Free crop","Original-Format":"Original format","gespiegelt":"flipped",
  // Werkzeugleiste anpassen
  "Werkzeugleiste anpassen":"Customize toolbar",
  "Ziehe Werkzeuge am Griff in die gewünschte Reihenfolge, entferne sie mit Minus oder füge neue mit Plus hinzu. Änderungen werden sofort gespeichert.":"Drag tools by the handle into the order you want, remove them with minus or add new ones with plus. Changes are saved immediately.",
  "In der Leiste":"In the toolbar","Verfügbar":"Available","Fertig":"Done","Standard wiederherstellen":"Restore defaults",
  "Ziehen zum Sortieren":"Drag to reorder","Die Leiste ist leer. Füge unten Werkzeuge hinzu.":"The toolbar is empty. Add tools below.",
  "Alle Werkzeuge sind bereits in der Leiste.":"All tools are already in the toolbar.","Anpassen schließen":"Close customize",
  "Standard-Werkzeugleiste wiederhergestellt":"Default toolbar restored",
  // Einstellungen
  "Info":"About","Ansicht":"View","Speichern":"Saving","Screenshots":"Screenshots","Bereiche der Einstellungen":"Settings sections",
  "Einstellungen schließen":"Close settings","Schließen (Esc)":"Close (Esc)","Schließen":"Close",
  "Schlanker Bildeditor für Windows, macOS, Linux und den Browser: Stapelverarbeitung, Zuschneiden, Größe, Export und Screenshots.":"Lightweight image editor for Windows, macOS, Linux and the browser: batch processing, cropping, resizing, export and screenshots.",
  "GitHub":"GitHub","Was ist neu?":"What's new?","Updates":"Updates","Version –":"Version –","Installiert: Version –":"Installed: version –",
  "Noch nicht geprüft.":"Not checked yet.","Update installieren":"Install update","Jetzt nach Updates suchen":"Check for updates now",
  "Automatisch nach Updates suchen":"Check for updates automatically","Beim Start, höchstens alle sechs Stunden.":"On startup, at most every six hours.",
  "Updates im Hintergrund herunterladen":"Download updates in the background","Danach genügt ein Neustart zum Installieren.":"A restart is then enough to install.",
  "Tastenkürzel":"Keyboard shortcuts","Tastenkürzel zum Auslösen":"Shortcut to trigger","Änderungsprotokoll":"Changelog","installiert":"installed",
  "Sprache":"Language","Modus":"Mode","Einfach":"Simple","Erweitert":"Advanced",
  "Einfach blendet selten genutzte Optionen aus, zum Beispiel Feineinstellungen für Qualität, Dateinamen und Bildlauf.":"Simple hides rarely used options, such as fine controls for quality, file names and scrolling capture.",
  "Erscheinungsbild":"Appearance","System":"System","Hell":"Light","Dunkel":"Dark",
  "Werkzeuge in der Seitenleiste zeigen als":"Show tools in the sidebar as","Nur Symbole":"Icons only","Beides":"Both","Nur Text":"Text only",
  "Symbol- und Textgröße":"Icon and text size","Doppelklick auf den Regler setzt auf 100 % zurück.":"Double-click the slider to reset to 100 %.",
  "Größe auf 100 % zurückgesetzt":"Size reset to 100 %",
  "Standardordner":"Default folder","Ändern":"Change","Zurücksetzen":"Reset","Immer nach dem Speicherort fragen":"Always ask where to save",
  "Aus: Exporte landen ohne Nachfrage direkt im Standardordner.":"Off: exports go straight to the default folder without asking.",
  "Dateiformat":"File format","Gilt auch im Bereich „Export“ und wird in Arbeitsabläufen mitgespeichert.":"Also applies in “Export” and is saved with workflows.",
  "Download-Ordner des Browsers":"The browser's download folder",
  "Im Browser bestimmt der Browser den Speicherort. In der Desktop-App kannst du einen eigenen Ordner festlegen.":"In the browser, the browser decides where files go. In the desktop app you can set your own folder.",
  "Noch kein Ordner gewählt":"No folder chosen yet","Standard ist der Bilder-Ordner des Systems.":"Default is the system's Pictures folder.",
  "Standardordner wählen":"Choose default folder","Zielordner für den Export wählen":"Choose a destination folder for the export","Standardordner zurückgesetzt":"Default folder reset",
  "Screenshot-Funktion":"Screenshot feature","Bildschirmaufnahmen direkt in Bildwerk öffnen und bearbeiten.":"Open and edit screen captures directly in Bildwerk.",
  "Zum Ändern anklicken":"Click to change","Entfernen":"Remove","Tastenkürzel ändern":"Change shortcut","Dateiformat für Screenshots":"File format for screenshots",
  "PNG ist verlustfrei und ideal für Texte und Bildschirminhalte.":"PNG is lossless and ideal for text and screen content.",
  "Kleinere Dateien; bei Text können leichte Unschärfen entstehen.":"Smaller files; text may look slightly blurry.",
  "Automatisch im Standardordner speichern":"Save automatically to the default folder",
  "Jeder Screenshot wird zusätzlich als Datei gespeichert (Ordner unter „Speichern“).":"Each screenshot is also saved as a file (folder under “Saving”).",
  "In die Zwischenablage kopieren":"Copy to clipboard","Jeder Screenshot wird zusätzlich automatisch kopiert.":"Each screenshot is also copied automatically.",
  "Startmodus":"Start mode","Bereich":"Region","Fenster":"Window","Vollbild":"Full screen","Bildlauf":"Scrolling",
  "Während der Aufnahme kannst du den Modus jederzeit wechseln.":"You can switch the mode at any time during capture.",
  "Bildlauf: automatisch scrollen":"Scrolling: scroll automatically",
  "Startet sofort nach der Auswahl. Aus: Du scrollst selbst und kannst die Automatik in der Steuerleiste einschalten.":"Starts right after the selection. Off: you scroll yourself and can turn on auto-scroll in the control bar.",
  "Bildlauf: maximale Länge":"Scrolling: maximum length","Bildlauf: auf Nachladen warten":"Scrolling: wait for loading",
  "Seiten mit endlosem Scrollen laden unten neue Inhalte nach. So lange wartet das automatische Scrollen, bevor es das Ende annimmt. Bei Endlos-Seiten stoppt die Aufnahme spätestens bei der maximalen Länge.":"Pages with endless scrolling load new content at the bottom. Auto-scroll waits this long before assuming the end. On endless pages, capture stops at the maximum length at the latest.",
  "Screenshot aufnehmen":"Take screenshot","Kein Kürzel festgelegt":"No shortcut set",
  "Funktioniert systemweit, auch wenn Bildwerk im Hintergrund ist.":"Works system-wide, even when Bildwerk is in the background.",
  "Funktioniert, solange Bildwerk im Vordergrund ist. Systemweit nur in der Desktop-App.":"Works while Bildwerk is in the foreground. System-wide only in the desktop app.",
  "Tastenkombination drücken … (Esc bricht ab)":"Press a key combination … (Esc cancels)",
  // Updates
  "Neu starten und installieren":"Restart and install",
  "Updates kommen aus den Releases auf GitHub und sind digital signiert.":"Updates come from the releases on GitHub and are digitally signed.",
  "Die Web-Version ist immer automatisch aktuell. Updates gibt es nur in der Desktop-App.":"The web version is always up to date. Updates are only for the desktop app.",
  "Suche nach Updates …":"Checking for updates …","Bildwerk ist auf dem neuesten Stand.":"Bildwerk is up to date.",
  "Update-Prüfung fehlgeschlagen. Ist das GitHub-Repository eingerichtet?":"Update check failed. Is the GitHub repository set up?",
  "Update verfügbar":"Update available","Später":"Later","Jetzt installieren":"Install now","Update wird heruntergeladen …":"Downloading update …",
  "Update bereit":"Update ready","Das Update wurde heruntergeladen. Nach einem Neustart ist es installiert.":"The update has been downloaded. It will be installed after a restart.",
  "Jetzt neu starten":"Restart now","Update wird installiert …":"Installing update …","Update konnte nicht installiert werden.":"The update couldn't be installed.",
  "Alles klar":"Got it",
  // Tastenkürzel-Liste
  "Editor":"Editor","Bilder öffnen":"Open images","Vorheriges / nächstes Bild":"Previous / next image","90° nach rechts drehen":"Rotate 90° right",
  "90° nach links drehen":"Rotate 90° left","Vergrößern / verkleinern":"Zoom in / out","Einpassen":"Fit","Originalgröße (100 %)":"Actual size (100 %)",
  "Zoomen am Mauszeiger":"Zoom at pointer","Verschieben":"Pan","Screenshot-Auswahl":"Screenshot selection","Vollbild aufnehmen":"Capture full screen",
  "Allgemein":"General","Hinweis oder Dialog schließen":"Close hint or dialog","nicht festgelegt":"not set","ausgeschaltet":"off",
  "Strg":"Ctrl","Umschalt":"Shift","Mausrad":"Wheel","Leertaste":"Space","Ziehen":"Drag","Druck":"PrtSc","Eingabe":"Enter","Rücktaste":"Backspace",
  "Einfg":"Ins","Entf":"Del","Ende":"End","Pos1":"Home","Bild ↑":"PgUp","Bild ↓":"PgDn",
  // Bildfläche, Bildleiste, Zoom
  "Kein Bild geöffnet":"No image open","Ziehe Bilder hierher oder wähle sie aus.":"Drag images here or choose them.",
  "Bilder hierher ziehen":"Drop images here","JPG, PNG, WebP oder GIF – gern mehrere auf einmal.":"JPG, PNG, WebP or GIF – several at once is fine.",
  "Bilder auswählen":"Choose images","Alle entfernen":"Remove all","Alle Bilder aus Bildwerk entfernen":"Remove all images from Bildwerk",
  "Bild entfernen":"Remove image","Weitere Bilder hinzufügen":"Add more images","1 Bild":"1 image",
  "Zoom":"Zoom","Verkleinern (−)":"Zoom out (−)","Verkleinern":"Zoom out","Einpassen (0)":"Fit (0)","Vergrößern (+)":"Zoom in (+)","Vergrößern":"Zoom in",
  "Originalgröße 100 % (1)":"Actual size 100 % (1)","Ins Fenster einpassen (0)":"Fit to window (0)",
  "Größe wird berechnet …":"Calculating size …","Zuschnitt":"Crop","Größenbegrenzung aufheben":"Remove size limit","Aktive Änderungen":"Active adjustments",
  "Bildschirmaufnahme erlauben":"Allow screen recording","Einstellungen öffnen":"Open settings",
  "macOS: Menüleiste auf Deutsch bzw. Englisch, „Einstellungen …“ im Bildwerk-Menü mit ⌘ ,; „Dienste“ entfernt":"macOS: menu bar in German or English, “Settings …” in the Bildwerk menu with ⌘ ,; “Services” removed",
  "Behoben: Unter macOS saßen Tooltips und Hinweise bei vergrößerter Symbol- und Textgröße an der falschen Stelle":"Fixed: on macOS, tooltips and hints were misplaced with a larger icon and text size",
  "Behoben: Unter macOS erschien zusätzlich ein System-Tooltip versetzt am Mauszeiger":"Fixed: on macOS an extra system tooltip appeared offset at the pointer",
  "Keine Fenster erkannt – Bereich aufziehen oder Vollbild nutzen":"No windows detected – drag a region or use full screen",
  "Behoben: Im Screenshot-Modus „Fenster“ ließ sich unter macOS kein Fenster auswählen":"Fixed: no window could be selected in the “Window” screenshot mode on macOS",
  "macOS erlaubt Bildwerk noch nicht, den Bildschirm aufzunehmen.":"macOS doesn't allow Bildwerk to record the screen yet.",
  "Öffne die Systemeinstellungen → Datenschutz & Sicherheit → Bildschirm- & Systemaudioaufnahme, schalte Bildwerk ein und starte Bildwerk danach neu.":"Open System Settings → Privacy & Security → Screen & System Audio Recording, turn on Bildwerk and then restart Bildwerk.",
  "Die Erlaubnis gilt dauerhaft. Bildwerk nimmt dabei nur Bilder auf, kein Audio.":"The permission is permanent. Bildwerk only captures images, no audio.",
  "Systemeinstellungen öffnen":"Open System Settings",
  "macOS: Fehlt die Erlaubnis für Bildschirmaufnahmen, erklärt Bildwerk das einmal, statt immer wieder nachzufragen":"macOS: if screen recording permission is missing, Bildwerk explains it once instead of asking again and again",
  "Zuschneiden: auch an den Seiten ziehen, nicht nur an den Ecken":"Cropping: drag the sides too, not just the corners",
  "Ziehe die gelben Ecken oder Seiten oder verschiebe den Rahmen im Bild.":"Drag the yellow corners or sides, or move the frame in the image.",
  "Beim Start ist kein Werkzeug geöffnet; die Einstellungen beginnen immer mit „Info“":"No tool is open on startup; the settings always start with “About”",
  "Einstellungen öffnen sich in einem eigenen Fenster (verschiebbar, Esc oder Klick daneben schließt)":"Settings open in their own window (movable; Esc or clicking outside closes it)",
  "Englisch: Dateinamen-Zusatz und Dateinamen ebenfalls auf Englisch":"English: file name suffix and file names in English too",
  "Öffnen der Einstellungen schließt das geöffnete Werkzeug":"Opening the settings closes the open tool",
  "Erneuter Klick auf ein Werkzeug schließt es; benutzte Werkzeuge sind markiert und oben als Chips aufgelistet":"Clicking a tool again closes it; tools in use are marked and listed as chips at the top",
  // Fortschritt
  "Restzeit wird berechnet …":"Calculating time remaining …","Wird abgebrochen …":"Cancelling …","wenige Sekunden":"a few seconds",
  "ca. 1 Minute":"about 1 minute","Bilder laden":"Loading images","Bilder laden abbrechen":"Cancel loading images","Export abbrechen":"Cancel export",
  "ZIP wird erstellt …":"Creating ZIP …","Abbrechen":"Cancel",
  // Meldungen
  "Keine Bilddateien gefunden.":"No image files found.","Bitte kurz warten und erneut versuchen.":"Please wait a moment and try again.",
  "unbekannter Fehler":"unknown error","Öffne zuerst ein Bild.":"Open an image first.","Öffne zuerst Bilder.":"Open images first.",
  "Bitte warten, bis der laufende Vorgang fertig ist.":"Please wait until the current task has finished.",
  "Export abgebrochen – es wurde nichts gespeichert.":"Export cancelled – nothing was saved.","Kodierung fehlgeschlagen":"Encoding failed",
  "Alle Bilder entfernen?":"Remove all images?","Tastenkürzel entfernt":"Shortcut removed",
  "Dieses Kürzel ist bereits von einem anderen Programm belegt. Bitte ein anderes wählen.":"This shortcut is already used by another program. Please choose a different one.",
  "Screenshots eingeschaltet, aber das Tastenkürzel ist belegt. Bitte ein anderes wählen.":"Screenshots turned on, but the shortcut is taken. Please choose another one.",
  "Screenshots eingeschaltet":"Screenshots turned on","Screenshots ausgeschaltet":"Screenshots turned off",
  "Screenshots sind in den Einstellungen ausgeschaltet.":"Screenshots are turned off in the settings.",
  "Dieser Browser kann keine Bildschirmaufnahmen machen. In der Desktop-App funktioniert es.":"This browser can't capture the screen. It works in the desktop app.",
  "Aufnahme abgebrochen oder hier nicht erlaubt. In der Desktop-App funktioniert es immer.":"Capture cancelled or not allowed here. It always works in the desktop app.",
  "Ziehe einen Bereich auf":"Drag to select a region","Klicke auf ein Fenster":"Click a window","Klicke oder drücke Eingabe":"Click or press Enter",
  "Scrollbereich aufziehen oder Fenster anklicken":"Drag over the scrolling area or click a window",
  "Der Bereich ist zu klein für eine Bildlauf-Aufnahme.":"The region is too small for a scrolling capture.",
  "Bildlauf-Aufnahme abgebrochen":"Scrolling capture cancelled","Screenshot abbrechen":"Cancel screenshot",
  "Bereich (1)":"Region (1)","Fenster (2)":"Window (2)","Vollbild (3)":"Full screen (3)","Bildlauf (4)":"Scrolling (4)",
  // Hinweise, Kontextmenü
  "Deine Werkzeugleiste":"Your toolbar","Verstanden":"Got it","Hinweis schließen":"Close hint",
  "Rechtsklick auf die Werkzeuge, um Werkzeuge hinzuzufügen, zu entfernen und umzusortieren.":"Right-click the tools to add, remove and reorder tools.",
  "Halte den Finger auf den Werkzeugen gedrückt, um Werkzeuge hinzuzufügen, zu entfernen und umzusortieren.":"Press and hold the tools to add, remove and reorder tools.",
  // Fehlermeldungen aus der Desktop-App
  "Es wurden keine Binärdaten übergeben.":"No binary data received.","Zielordner fehlt.":"Destination folder missing.","Dateiname fehlt.":"File name missing.",
  "Ungültiger Dateiname.":"Invalid file name.","Kein Bildschirm gefunden.":"No screen found.","Keine Aufnahme vorhanden.":"No capture available.",
  "Der Bereich liegt außerhalb des Bildschirms.":"The region is outside the screen.","Ungültiger Bereich.":"Invalid region.",
  "Es läuft bereits eine Bildlauf-Aufnahme.":"A scrolling capture is already running.","Es läuft keine Bildlauf-Aufnahme.":"No scrolling capture is running.",
  "Die Aufnahme ist abgestürzt.":"The capture crashed.","Es wurde nichts aufgenommen.":"Nothing was captured.","Bild konnte nicht erstellt werden.":"Couldn't create the image.",
  "Bildgröße passt nicht zu den Daten.":"Image size doesn't match the data.","Zwischenablage nicht verfügbar.":"Clipboard not available.",
  "Breite fehlt.":"Width missing.","Höhe fehlt.":"Height missing.","Es wurden keine Bilddaten übergeben.":"No image data received.",
  // Steuerleiste der Bildlauf-Aufnahme
  "Bildlauf-Aufnahme":"Scrolling capture","Automatisch scrollen":"Scroll automatically","Automatik stoppen":"Stop auto-scroll",
  "Scrolle jetzt im gewählten Bereich langsam nach unten.":"Now scroll down slowly in the selected region.",
  "Bildwerk scrollt automatisch. Maus bitte nicht bewegen.":"Bildwerk is scrolling automatically. Please don't move the mouse.",
  "Seite lädt weitere Inhalte nach … bitte warten.":"The page is loading more content … please wait.",
  "Die Seite reagiert nicht auf das automatische Scrollen. Klicke einmal in die Seite oder scrolle selbst.":"The page doesn't respond to auto-scroll. Click into the page once or scroll yourself.",
  "Ende erreicht – Bild wird zusammengesetzt …":"End reached – assembling image …","Maximale Länge erreicht – Bild wird zusammengesetzt …":"Maximum length reached – assembling image …",
  "Bild wird zusammengesetzt …":"Assembling image …",
  "Automatisches Scrollen ist auf diesem System nicht erlaubt.":"Auto-scroll isn't allowed on this system.",
  "Automatisches Scrollen hat die Seite nicht bewegt – bitte selbst scrollen.":"Auto-scroll didn't move the page – please scroll yourself.",
  "Ende erreicht – klicke auf „Fertig“.":"End reached – click “Done”.",
  // Änderungsprotokoll
  "Englische Sprache und einfacher/erweiterter Modus in den Einstellungen":"English language and simple/advanced mode in the settings",
  "Tooltips im Stil der Oberfläche":"Tooltips in the style of the interface",
  "Behoben: Die Zoomanzeige blieb bei 100 % stehen":"Fixed: the zoom display stayed at 100 %",
  "Einstellungen mit Reitern für Info, Darstellung, Speichern, Screenshots und Updates":"Settings with tabs for About, Appearance, Saving, Screenshots and Updates",
  "Automatische Updates: Bildwerk sucht beim Start nach neuen Versionen und lädt sie auf Wunsch im Hintergrund":"Automatic updates: Bildwerk checks for new versions on startup and can download them in the background",
  "Speichereinstellungen: Standardordner, Speichern ohne Nachfrage und Standard-Dateiformat":"Saving settings: default folder, saving without asking and default file format",
  "Übersicht aller Tastenkürzel und dieses Änderungsprotokoll":"Overview of all keyboard shortcuts and this changelog",
  "Neuer Screenshot-Modus „Bildlauf“ für lange Seiten im Browser oder Explorer":"New “Scrolling” screenshot mode for long pages in the browser or file explorer",
  "Screenshots werden automatisch in die Zwischenablage kopiert":"Screenshots are copied to the clipboard automatically",
  "Hell- und Dunkelmodus sowie einstellbare Größe von Symbolen und Text":"Light and dark mode plus adjustable icon and text size",
  "Werkzeuge in der Seitenleiste wahlweise als Symbole, Text oder beides":"Sidebar tools shown as icons, text or both",
  "Werkzeugleiste anpassen jetzt per Rechtsklick auf die Leiste (auf Touch-Geräten: lange gedrückt halten)":"Customize the toolbar by right-clicking it (on touch devices: press and hold)",
  "Fortschrittsanzeige beim Laden und Exportieren vieler Bilder mit Restzeit und Abbrechen":"Progress display when loading and exporting many images, with time remaining and cancel",
  "Bildlauf-Screenshots berücksichtigen Seiten mit endlosem Scrollen: Nachladen wird abgewartet, Grenze für die Länge einstellbar":"Scrolling screenshots handle endless pages: waits for loading, adjustable length limit",
  "Bildlauf deutlich schneller: Schrittweite passt sich an, schnellere Erkennung":"Scrolling capture much faster: adaptive step size, faster detection",
  "Bildlauf: keine gelben Balken mehr im Ergebnis, Steuerleiste wird nicht mitaufgenommen":"Scrolling capture: no more yellow bars in the result, the control bar isn't captured",
  "Werkzeug „Bilder“ entfernt: „Alle entfernen“ sitzt jetzt in der Bildleiste, Bilder kommen per Drag & Drop, „+“ oder Sofort-Aktion dazu":"“Images” tool removed: “Remove all” is now in the image strip; add images via drag & drop, “+” or an instant action",
  "Screenshots: eigenes Dateiformat und optional automatisches Speichern im Standardordner":"Screenshots: own file format and optional automatic saving to the default folder",
  "Updates jetzt im Reiter „Info“; Einklappen-Button oben neben dem Programmnamen":"Updates now under “About”; collapse button at the top next to the app name",
  "Bildlauf scrollt jetzt standardmäßig automatisch (abschaltbar)":"Scrolling capture now scrolls automatically by default (can be turned off)",
  "Behoben: Speichern, Exportieren und Zwischenablage funktionierten in der Desktop-App nicht":"Fixed: saving, exporting and clipboard didn't work in the desktop app",
  "Rechtsklick-Menü nur noch auf den Werkzeugen; kein Browser-Kontextmenü mehr in der App":"Right-click menu only on the tools; no more browser context menu in the app",
  "Bildlauf schließt am Seitenende automatisch ab – kein Klick auf „Fertig“ mehr nötig":"Scrolling capture finishes automatically at the end of the page – no need to click “Done”",
  "Behoben: Nach Fenster- oder Vollbild-Screenshots war der gesamte Text markiert":"Fixed: all text was selected after window or full-screen screenshots",
  "Behoben: Nach dem Schließen der Einstellungen oder erneutem Klick auf ein Werkzeug verschob sich die Bildfläche":"Fixed: the image area shifted after closing the settings or clicking a tool again",
  "Zoom in der Bildansicht: Strg + Mausrad, +/−, 1:1 und Einpassen; verschieben per Ziehen oder Mausrad":"Zoom in the image view: Ctrl + wheel, +/−, 1:1 and fit; pan by dragging or with the wheel",
  "Werkzeugleiste anpassen: Werkzeuge hinzufügen, entfernen und per Ziehen umsortieren":"Customize the toolbar: add, remove and reorder tools by dragging",
  "Sofort-Aktionen wie Schnell exportieren, 90° drehen und Spiegeln für die Werkzeugleiste":"Instant actions such as quick export, rotate 90° and flip for the toolbar",
  "Screenshots von Bereich, Fenster oder Vollbild mit frei wählbarem Tastenkürzel":"Screenshots of a region, window or full screen with a custom shortcut",
  "Erste Version: Stapelverarbeitung, Zuschneiden mit Seitenverhältnis-Vorlagen, Drehen und Spiegeln, maximale Auflösung, Export mit Qualitätsauswahl und gespeicherte Arbeitsabläufe":"First version: batch processing, cropping with aspect ratio presets, rotate and flip, maximum resolution, export with quality selection and saved workflows"
};

// Texte mit Zahlen oder Namen. T(x) übersetzt eingesetzte Teile, wenn möglich.
const T = s => trCore(s) ?? s;
const keys = s => s.split(" + ").map(T).join(" + ");
const q = s => "“" + s + "”";
const kind = k => k === "Bildlauf" ? "Scrolling capture" : T(k);
const EN_RX = [
  [/^(.+)  \((\d+) von (\d+)\)$/, (m, a, b, c) => `${a}  (${b} of ${c})`],
  [/^(\d+) Bilder$/, (m, n) => `${n} images`],
  [/^Alle (\d+) als ZIP exportieren$/, (m, n) => `Export all ${n} as ZIP`],
  [/^Alle (\d+) in Ordner exportieren$/, (m, n) => `Export all ${n} to folder`],
  [/^Restzeit: (.+)$/, (m, a) => `Time remaining: ${T(a)}`],
  [/^ca\. (\d+) Sekunden$/, (m, n) => `about ${n} seconds`],
  [/^ca\. (\d+) Minuten$/, (m, n) => `about ${n} minutes`],
  [/^ca\. (\d+) Std\.(?: (\d+) Min\.)?$/, (m, h, mm) => `about ${h} h` + (mm ? ` ${mm} min` : "")],
  [/^(.+) anzeigen$/, (m, a) => `Show ${a}`],
  [/^Gespeichert: (.+)$/, (m, a) => `Saved: ${a}`],
  [/^Speichern nicht möglich: (.+)$/, (m, a) => `Couldn't save: ${T(a)}`],
  [/^Export fehlgeschlagen: (.+)$/, (m, a) => `Export failed: ${T(a)}`],
  [/^Dialog konnte nicht geöffnet werden: (.+)$/, (m, a) => `Couldn't open the dialog: ${T(a)}`],
  [/^Link konnte nicht geöffnet werden: (.+)$/, (m, a) => `Couldn't open the link: ${T(a)}`],
  [/^Laden abgebrochen – (\d+) von (\d+) Bildern geladen$/, (m, a, b) => `Loading cancelled – ${a} of ${b} images loaded`],
  [/^(\d+) Datei\(en\) konnten nicht geöffnet werden\. Das Format wird vom Browser nicht unterstützt\.$/, (m, n) => `${n} file(s) couldn't be opened. The format isn't supported by the browser.`],
  [/^(\d+) Bilder in (.+) verarbeitet(?: – (\d+) fehlgeschlagen)?$/, (m, n, d, f) => `${n} images processed in ${d}` + (f ? ` – ${f} failed` : "")],
  [/^Export abgebrochen – (\d+) von (\d+) Bildern gespeichert in „(.+)“$/, (m, a, b, d) => `Export cancelled – ${a} of ${b} images saved to ${q(d)}`],
  [/^(\d+) Bilder in (.+) gespeichert in „(.+)“(?: – (\d+) fehlgeschlagen)?$/, (m, n, t, d, f) => `${n} images saved to ${q(d)} in ${t}` + (f ? ` – ${f} failed` : "")],
  [/^(\w+) wird von diesem Browser nicht unterstützt, gespeichert als (\w+)\.$/, (m, a, b) => `${a} isn't supported by this browser, saved as ${b}.`],
  [/^Drehung (\d+)°$/, (m, n) => `Rotation ${n}°`],
  [/^Zuschnitt (\d+(?:\.\d+)?:\d+(?:\.\d+)?|Original)$/, (m, r) => `Crop ${T(r)}`],
  [/^Gedreht um (\d+)°$/, (m, n) => `Rotated by ${n}°`],
  [/^Beispiel: (.+)$/, (m, a) => `Example: ${a}`],
  [/^„(.+)“ angewendet$/, (m, a) => `${q(a)} applied`],
  [/^„(.+)“ gelöscht$/, (m, a) => `${q(a)} deleted`],
  [/^„(.+)“ aktualisiert$/, (m, a) => `${q(a)} updated`],
  [/^„(.+)“ gespeichert$/, (m, a) => `${q(a)} saved`],
  [/^„(.+)“ entfernt$/, (m, a) => `${q(T(a))} removed`],
  [/^„(.+)“ hinzugefügt$/, (m, a) => `${q(T(a))} added`],
  [/^(\d+) Ablauf\/Abläufe importiert$/, (m, n) => `${n} workflow(s) imported`],
  [/^(.+) nach oben$/, (m, a) => `Move ${T(a)} up`],
  [/^(.+) nach unten$/, (m, a) => `Move ${T(a)} down`],
  [/^(.+) aus der Leiste entfernen$/, (m, a) => `Remove ${T(a)} from the toolbar`],
  [/^(.+) zur Leiste hinzufügen$/, (m, a) => `Add ${T(a)} to the toolbar`],
  [/^Die (\d+) Bilder werden aus Bildwerk entfernt\..*$/, (m, n) => `The ${n} images will be removed from Bildwerk. The files on your device stay, but unexported changes will be lost.`],
  [/^Standardordner: (.+)$/, (m, a) => `Default folder: ${a}`],
  [/^Neu in Bildwerk (.+)$/, (m, v) => `What's new in Bildwerk ${v}`],
  [/^Installiert: Version (.+)$/, (m, v) => `Installed: version ${v}`],
  [/^Version (.+) · Web$/, (m, v) => `Version ${v} · Web`],
  [/^Zuletzt geprüft: (.+)$/, (m, a) => `Last checked: ${a}`],
  [/^Keine Updates verfügbar – Version (.+) ist aktuell\.$/, (m, v) => `No updates available – version ${v} is current.`],
  [/^Update-Prüfung fehlgeschlagen: (.+)$/, (m, a) => `Update check failed: ${T(a)}`],
  [/^Version (.+) ist verfügbar\.$/, (m, v) => `Version ${v} is available.`],
  [/^Version (.+) ist verfügbar \(installiert: (.+)\)\.$/, (m, v, i) => `Version ${v} is available (installed: ${i}).`],
  [/^Update wird heruntergeladen … (\d+) %$/, (m, n) => `Downloading update … ${n} %`],
  [/^Version (.+) ist bereit\. Ein Neustart installiert das Update\.$/, (m, v) => `Version ${v} is ready. A restart installs the update.`],
  [/^Download fehlgeschlagen: (.+)$/, (m, a) => `Download failed: ${T(a)}`],
  [/^Installation fehlgeschlagen: (.+)$/, (m, a) => `Installation failed: ${T(a)}`],
  [/^Tastenkürzel gespeichert: (.+)$/, (m, a) => `Shortcut saved: ${keys(a)}`],
  [/^Screenshots eingeschaltet – Kürzel (.+)$/, (m, a) => `Screenshots turned on – shortcut ${keys(a)}`],
  [/^Bitte mit (.+), (.+) oder (.+) kombinieren\.$/, (m, a, b, c) => `Please combine with ${T(a)}, ${T(b)} or ${T(c)}.`],
  [/^Screenshot fehlgeschlagen: (.+)$/, (m, a) => `Screenshot failed: ${T(a)}`],
  [/^(.+) – Esc bricht ab$/, (m, a) => `${T(a)} – Esc cancels`],
  [/^(Screenshot|Bildlauf) konnte nicht gespeichert werden\.$/, (m, k) => `${kind(k)} couldn't be saved.`],
  [/^(Screenshot|Bildlauf) hinzugefügt(.*)$/, (m, k, rest) => {
    let r = `${kind(k)} added`;
    if (rest.includes(", in die Zwischenablage kopiert")) r += ", copied to the clipboard";
    if (rest.includes(" – Zwischenablage nicht möglich")) r += " – clipboard not available";
    const sv = rest.match(/ und gespeichert als „(.+)“/); if (sv) r += ` and saved as ${q(sv[1])}`;
    if (rest.includes(" – automatisches Speichern fehlgeschlagen")) r += " – automatic saving failed";
    return r;
  }],
  [/^Bildlauf-Aufnahme nicht möglich: (.+)$/, (m, a) => `Scrolling capture not possible: ${T(a)}`],
  [/^Bildlauf-Aufnahme fehlgeschlagen: (.+)$/, (m, a) => `Scrolling capture failed: ${T(a)}`],
  [/^Maximale Länge \((.+) px\) erreicht – klicke auf „Fertig“\.$/, (m, n) => `Maximum length (${n} px) reached – click “Done”.`]
];
const SEPS = [" · ", " – ", ", "];
function trCore(k, depth = 0){
  if (Object.prototype.hasOwnProperty.call(EN, k)) return EN[k];
  for (const [re, f] of EN_RX){ const m = k.match(re); if (m) return f(...m); }
  if (depth > 2) return null;
  for (const sep of SEPS){
    if (!k.includes(sep)) continue;
    const parts = k.split(sep), tr = parts.map(p => trCore(p, depth + 1));
    if (tr.some(x => x != null)) return tr.map((x, i) => x ?? parts[i]).join(sep);
  }
  if (k.endsWith(".")){ const r = trCore(k.slice(0, -1), depth + 1); if (r != null) return r + "."; }
  return null;
}
// übersetzt einen Text samt umgebender Leerzeichen; null = nichts zu übersetzen
function tr(s){
  const k = s.trim(); if (!k) return null;
  const r = trCore(k); if (r == null || r === k) return null;
  return s.slice(0, s.indexOf(k)) + r + s.slice(s.indexOf(k) + k.length);
}
window.BW_I18N = {EN, tr, trCore};
})();
