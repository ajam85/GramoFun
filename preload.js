const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getLastFolder: () => ipcRenderer.invoke('get-last-folder'),
  scanLibrary: (rootPath) => ipcRenderer.invoke('scan-library', rootPath),
  parsePlaylist: (m3u8Path) => ipcRenderer.invoke('parse-playlist', m3u8Path),
  getPlaylistCover: (m3u8Path) => ipcRenderer.invoke('get-playlist-cover', m3u8Path),
  getTags: () => ipcRenderer.invoke('get-tags'),
  setTags: (m3u8Path, tags) => ipcRenderer.invoke('set-tags', m3u8Path, tags),
  selectFolderPlain: () => ipcRenderer.invoke('select-folder-plain'),
  generatePlaylists: (rootPath) => ipcRenderer.invoke('generate-playlists', rootPath)
});
