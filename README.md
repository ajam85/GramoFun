# GramoFun (Electron)

Jednoduchý desktopový přehrávač hudby s knihovnou playlistů.

## Jak to funguje

- U ovládání hlasitosti (vlevo dole) jsou dvě ikony: **fronta
  přehrávání** a **nastavení** (sliders-vertical). Po kliknutí na
  ikonu nastavení se otevře panel (nahoru) s:
  - **Vybrat knihovnu…** – zvolí kořenovou složku, ve které se
    rekurzivně najdou všechny soubory `.m3u8`.
  - **Vygenerovat playlisty…** – použije se aktuálně vybraná
    knihovna (pokud žádná není načtená, nejprve se vybere složka,
    která se zároveň nastaví jako knihovna). Pro každou podsložku
    obsahující hudební soubory (mp3, flac, wav, m4a), která ještě
    nemá `.m3u8`, se vytvoří nový playlist.
  - **Zobrazit název** – přepínač (stejný vizuál jako ostatní) zapíná
    a vypíná zobrazení názvu pod labely.
  - **Světlý režim** – přepínač mezi tmavým a světlým motivem.
  - **English** – přepínač jazyka rozhraní (čeština/angličtina),
    uloží se pro příští spuštění.
  - **Barva posuvníků** – vlastní barva pro posuvník přehrávání
    (seek) a hlasitosti, vybraná přes barevnou paletku.
- Ikonou vedle ovládání hlasitosti (list-music) lze zobrazit/skrýt
  boční panel **Fronta přehrávání**. Přetažením labelu playlistu z
  knihovny do panelu ho přidáte do fronty; po dohrání jednoho
  playlistu se automaticky pokračuje dalším ve frontě.
- Každý nalezený playlist se zobrazí jako čtvercový label s názvem
  pod ním. Pokud první skladba v playlistu obsahuje v ID3 tagu
  obrázek (cover art), použije se jako pozadí labelu; pokud ne,
  zobrazí se logo GramoFun jako výchozí obrázek.
- **Náhodné přehrávání** – ikona shuffle vedle ovládání hlasitosti
  zamíchá pořadí skladeb v právě hraném playlistu (aktuální skladba
  zůstává první). Volba se ukládá.
- **Štítky** – pravým tlačítkem myši na albu otevřete okno, kde
  můžete albu přiřadit existující štítky nebo vytvořit nový. Nad
  knihovnou se objeví řádek se štítky; kliknutím na jeden či více
  štítků se knihovna vyfiltruje na alba, která mají všechny vybrané
  štítky. Štítky se ukládají do konfigurace aplikace.
- Při přehrávání se u názvu playlistu zobrazuje počítadlo skladeb,
  např. `(2/10)`. Informace o přehrávané skladbě jsou vycentrované
  uprostřed panelu, ovládání hlasitosti je vlevo dole vedle
  posuvníku pozice.
- Vybraná složka se ukládá, takže při dalším spuštění se knihovna
  načte automaticky.
- Nativní okenní nabídka (File/Edit/View…) je vypnutá.

## Spuštění (vývoj)

```bash
npm install
npm start
```

## Vytvoření portable buildu

Build řeší balíček `electron-builder` (už je v `devDependencies`).
Ikony pro Windows/macOS/Linux jsou připravené ve složce `build/`
(`icon.ico`, `icon.icns`, `icon.png`), vygenerované z loga
`assets/logo/gramofun.svg`.

```bash
npm install

# Windows - jeden spustitelný .exe soubor bez instalace
npm run build:win

# macOS - .zip s hotovou aplikací (bez instalátoru)
npm run build:mac

# Linux - přenosný .AppImage
npm run build:linux

# Vše najednou (viz poznámka níže)
npm run build:all
```

Na Windows můžete místo ručního psaní příkazů dvojklikem spustit
`build-win.bat` přímo ve složce projektu – udělá `npm install` i
`npm run build:win` za vás a na konci počká na stisk klávesy, takže
uvidíte i případnou chybu (okno se samo nezavře).

Výsledné soubory se objeví ve složce `dist/`.

**Poznámka k cross-platform buildu:** `electron-builder` umí sestavit
Windows i Linux build z libovolného hostitelského systému (Windows,
macOS i Linux). Sestavení pro **macOS** (`.zip`/`.app`) ale ze své
podstaty vyžaduje spuštění na macOS – pokud budete build spouštět na
Windows/Linuxu, macOS verzi si nechte sestavit na Macu (nebo přes CI,
např. GitHub Actions s `macos` runnerem).

## Struktura projektu

```
main.js       - hlavní proces: okno, dialogy, skenování/tvorba playlistů, cover art
preload.js    - bezpečné API vystavené do rendereru (contextBridge)
index.html    - rozhraní (knihovna, fronta, panel nastavení, ovládací panel)
renderer.js   - logika UI, motivy, přehrávání, fronta
icons.js      - inline SVG ikony (Lucide)
i18n.js       - slovník pro CZ/EN rozhraní
styles.css    - vzhled, proměnné pro tmavý/světlý motiv
assets/logo/  - logo GramoFun (SVG) použité v UI
assets/icons/ - ovládací ikony (Lucide SVG)
build/        - ikony aplikace pro balíčkování (icon.ico/.icns/.png)
```

## Formát m3u8

Očekává se prostý seznam cest ke skladbám (řádky začínající `#` se
ignorují), např.:

```
#EXTM3U
#EXTINF:-1,Název skladby
skladba1.mp3
skladba2.mp3
```

Cesty mohou být relativní (vztažené ke složce s `.m3u8`) nebo absolutní.
