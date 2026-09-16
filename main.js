const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const mm = require('music-metadata');

const configPath = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function writeConfig(data) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(data, null, 2), 'utf-8');
}

// Rekurzivně najde všechny .m3u8 soubory pod zadanou složkou.
async function findM3u8Files(dir) {
  let results = [];
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await findM3u8Files(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.m3u8')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function getFirstTrackPath(m3u8Path) {
  const content = await fs.promises.readFile(m3u8Path, 'utf-8');
  const dir = path.dirname(m3u8Path);
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length === 0) return null;
  const first = lines[0];
  return path.isAbsolute(first) ? first : path.join(dir, first);
}

function createWindow() {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#161616',
    icon: path.join(__dirname, 'build', iconFile),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC handlery ----

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folder = result.filePaths[0];
  writeConfig({ ...readConfig(), lastFolder: folder });
  return folder;
});

ipcMain.handle('get-last-folder', async () => {
  return readConfig().lastFolder || null;
});

ipcMain.handle('scan-library', async (event, rootPath) => {
  const files = await findM3u8Files(rootPath);
  return files.map((f) => ({
    title: path.basename(path.dirname(f)),
    m3u8Path: f
  }));
});

ipcMain.handle('parse-playlist', async (event, m3u8Path) => {
  const content = await fs.promises.readFile(m3u8Path, 'utf-8');
  const dir = path.dirname(m3u8Path);
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  return lines.map((line) => {
    const absPath = path.isAbsolute(line) ? line : path.join(dir, line);
    return {
      title: path.basename(absPath, path.extname(absPath)),
      url: pathToFileURL(absPath).href
    };
  });
});

ipcMain.handle('get-playlist-cover', async (event, m3u8Path) => {
  try {
    const trackPath = await getFirstTrackPath(m3u8Path);
    if (!trackPath) return null;
    const metadata = await mm.parseFile(trackPath, { duration: false, skipCovers: false });
    const picture = metadata.common.picture && metadata.common.picture[0];
    if (!picture) return null;
    const base64 = Buffer.from(picture.data).toString('base64');
    return `data:${picture.format};base64,${base64}`;
  } catch (e) {
    return null;
  }
});

ipcMain.handle('select-folder-plain', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.m4a'];

ipcMain.handle('generate-playlists', async (event, rootPath) => {
  const created = [];
  const skipped = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    const subdirs = entries.filter((e) => e.isDirectory());
    const audioFiles = entries.filter(
      (e) => e.isFile() && AUDIO_EXTENSIONS.includes(path.extname(e.name).toLowerCase())
    );

    if (dir !== rootPath && audioFiles.length > 0) {
      const folderName = path.basename(dir);
      const playlistPath = path.join(dir, `${folderName}.m3u8`);
      let exists = true;
      try {
        await fs.promises.access(playlistPath);
      } catch (e) {
        exists = false;
      }

      if (!exists) {
        const lines = ['#EXTM3U'];
        for (const f of audioFiles) {
          const baseName = path.basename(f.name, path.extname(f.name));
          lines.push(`#EXTINF:-1,${baseName}`);
          lines.push(f.name);
        }
        await fs.promises.writeFile(playlistPath, lines.join('\n'), 'utf-8');
        created.push(folderName);
      } else {
        skipped.push(folderName);
      }
    }

    for (const sub of subdirs) {
      await walk(path.join(dir, sub.name));
    }
  }

  await walk(rootPath);
  return { created, skipped };
});
