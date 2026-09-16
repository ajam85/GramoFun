// ---- reference na prvky ----

const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const selectFolderBtn = document.getElementById('select-folder-btn');
const createPlaylistBtn = document.getElementById('create-playlist-btn');
const showTitleCheckbox = document.getElementById('show-title-checkbox');
const lightThemeCheckbox = document.getElementById('light-theme-checkbox');
const langCheckbox = document.getElementById('lang-checkbox');
const sliderColorPicker = document.getElementById('slider-color-picker');

const queueToggleBtn = document.getElementById('queue-toggle-btn');
const queueCloseBtn = document.getElementById('queue-close-btn');
const queuePanel = document.getElementById('queue-panel');
const queueListEl = document.getElementById('queue-list');
const queueEmptyHint = document.getElementById('queue-empty-hint');
const playQueueBtn = document.getElementById('play-queue-btn');

const tilesEl = document.getElementById('tiles');
const emptyStateEl = document.getElementById('empty-state');

const trackTitleEl = document.getElementById('track-title');
const playlistTitleEl = document.getElementById('playlist-title');
const trackCounterEl = document.getElementById('track-counter');
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const seekEl = document.getElementById('seek');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const volumeEl = document.getElementById('volume');
const volumeIconEl = document.getElementById('volume-icon');

const audio = document.getElementById('audio');

let library = [];             // [{ title, m3u8Path }]
let currentTracks = [];       // tracky aktuálně hraného playlistu [{ title, url }]
let currentTrackIndex = -1;
let currentPlaylistTitle = '';
let currentRootFolder = null;
let activeWrapperEl = null;

let playbackQueue = [];       // fronta playlistů [{ title, m3u8Path }]
let queueIndex = -1;          // index aktuálně hraného playlistu ve frontě
let isQueuePlayback = false;  // hraje se právě fronta, nebo jednotlivý playlist z knihovny?

let isSeeking = false;
let currentLang = 'cs';

// ---- statické ikony ----

prevBtn.innerHTML = ICONS.skipBack;
nextBtn.innerHTML = ICONS.skipForward;
playBtn.innerHTML = ICONS.play;
volumeIconEl.innerHTML = ICONS.volume2;
settingsBtn.innerHTML = ICONS.slidersVertical;
queueToggleBtn.innerHTML = ICONS.listMusic;
queueCloseBtn.innerHTML = ICONS.close;

// ---- lokalizace ----

function t(key) {
  return I18N[currentLang][key];
}

function applyLanguage(lang) {
  currentLang = lang;
  langCheckbox.checked = lang === 'en';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    if (el.id === 'track-title' && currentTrackIndex !== -1) return;
    el.textContent = I18N[lang][el.dataset.i18n];
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const text = I18N[lang][el.dataset.i18nTitle];
    el.title = text;
    el.setAttribute('aria-label', text);
  });
}

langCheckbox.addEventListener('change', () => {
  const lang = langCheckbox.checked ? 'en' : 'cs';
  applyLanguage(lang);
  localStorage.setItem('lang', lang);
});

// ---- pomocné funkce ----

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function loadLibrary(folderPath) {
  currentRootFolder = folderPath;
  library = await window.api.scanLibrary(folderPath);
  renderTiles();
}

function renderTiles() {
  tilesEl.innerHTML = '';
  emptyStateEl.style.display = library.length === 0 ? 'block' : 'none';
  activeWrapperEl = null;

  library.forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'tile-wrapper';
    wrapper.draggable = true;
    wrapper.innerHTML = `
      <div class="tile"><img class="tile-icon" src="assets/logo/gramofun.svg" alt="" /></div>
      <div class="tile-title">${item.title}</div>
    `;
    const tile = wrapper.querySelector('.tile');

    wrapper.addEventListener('click', () => playPlaylistFromLibrary(item, wrapper));

    wrapper.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/json', JSON.stringify(item));
      e.dataTransfer.effectAllowed = 'copy';
      wrapper.classList.add('dragging');
    });
    wrapper.addEventListener('dragend', () => {
      wrapper.classList.remove('dragging');
    });

    tilesEl.appendChild(wrapper);

    window.api.getPlaylistCover(item.m3u8Path).then((dataUrl) => {
      if (!dataUrl) return;
      tile.classList.add('has-cover');
      tile.style.backgroundImage = `url("${dataUrl}")`;
    });
  });
}

// ---- přehrávání jednotlivého playlistu z knihovny (mimo frontu) ----

async function playPlaylistFromLibrary(item, wrapperEl) {
  isQueuePlayback = false;
  queueIndex = -1;
  renderQueue();

  if (activeWrapperEl) activeWrapperEl.classList.remove('active');
  activeWrapperEl = wrapperEl;
  wrapperEl.classList.add('active');

  await startPlaylist(item);
}

// ---- přehrávání fronty playlistů ----

function renderQueue() {
  queueListEl.innerHTML = '';
  queueEmptyHint.style.display = playbackQueue.length === 0 ? 'block' : 'none';

  playbackQueue.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'queue-item' + (isQueuePlayback && index === queueIndex ? ' active' : '');
    row.innerHTML = `
      <span class="queue-item-title">${item.title}</span>
      <button class="queue-item-remove" title="${t('remove_from_queue')}">${ICONS.close}</button>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.queue-item-remove')) return;
      playQueueFromIndex(index);
    });

    row.querySelector('.queue-item-remove').addEventListener('click', () => {
      const removingCurrent = isQueuePlayback && index === queueIndex;
      playbackQueue.splice(index, 1);
      if (removingCurrent) {
        isQueuePlayback = false;
        queueIndex = -1;
      } else if (isQueuePlayback && index < queueIndex) {
        queueIndex -= 1;
      }
      renderQueue();
    });

    queueListEl.appendChild(row);
  });
}

async function playQueueFromIndex(index) {
  if (index < 0 || index >= playbackQueue.length) return;
  isQueuePlayback = true;
  queueIndex = index;

  if (activeWrapperEl) {
    activeWrapperEl.classList.remove('active');
    activeWrapperEl = null;
  }

  renderQueue();
  await startPlaylist(playbackQueue[index]);
}

playQueueBtn.addEventListener('click', () => {
  if (playbackQueue.length > 0) playQueueFromIndex(0);
});

// drag & drop do panelu fronty
queuePanel.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  queuePanel.classList.add('drag-over');
});
queuePanel.addEventListener('dragleave', () => {
  queuePanel.classList.remove('drag-over');
});
queuePanel.addEventListener('drop', (e) => {
  e.preventDefault();
  queuePanel.classList.remove('drag-over');
  const raw = e.dataTransfer.getData('application/json');
  if (!raw) return;
  try {
    const item = JSON.parse(raw);
    playbackQueue.push(item);
    renderQueue();
  } catch (err) {
    /* ignore neplatná data */
  }
});

// ---- sdílená logika přehrávání playlistu ----

async function startPlaylist(item) {
  const tracks = await window.api.parsePlaylist(item.m3u8Path);
  if (tracks.length === 0) return;

  currentTracks = tracks;
  currentPlaylistTitle = item.title;
  currentTrackIndex = 0;
  playTrackAtIndex(0);
}

function playTrackAtIndex(index) {
  if (index < 0 || index >= currentTracks.length) return;
  currentTrackIndex = index;
  const track = currentTracks[index];
  audio.src = track.url;
  audio.play();
  trackTitleEl.textContent = track.title;
  playlistTitleEl.textContent = currentPlaylistTitle;
  trackCounterEl.textContent = `(${index + 1}/${currentTracks.length})`;
}

function togglePlay() {
  if (!audio.src) return;
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

function playNext() {
  if (currentTrackIndex + 1 < currentTracks.length) {
    playTrackAtIndex(currentTrackIndex + 1);
    return;
  }
  // konec playlistu - pokud hrajeme frontu, pokračuj dalším playlistem
  if (isQueuePlayback && queueIndex + 1 < playbackQueue.length) {
    playQueueFromIndex(queueIndex + 1);
  }
}

function playPrev() {
  if (currentTrackIndex > 0) {
    playTrackAtIndex(currentTrackIndex - 1);
  }
}

function closeSettingsPanel() {
  settingsPanel.classList.add('hidden');
}

// ---- nastavení: otevření/zavření panelu ----

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
    closeSettingsPanel();
  }
});

// ---- fronta: zobrazení/skrytí panelu ----

queueToggleBtn.addEventListener('click', () => {
  queuePanel.classList.toggle('hidden');
});
queueCloseBtn.addEventListener('click', () => {
  queuePanel.classList.add('hidden');
});

// ---- nastavení: výběr knihovny ----

selectFolderBtn.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (folder) await loadLibrary(folder);
  closeSettingsPanel();
});

// ---- nastavení: hromadné generování playlistů ----

createPlaylistBtn.addEventListener('click', async () => {
  let folder = currentRootFolder;

  if (!folder) {
    folder = await window.api.selectFolder();
    if (!folder) return;
    currentRootFolder = folder;
  }

  const result = await window.api.generatePlaylists(folder);
  closeSettingsPanel();

  window.alert(I18N[currentLang].generate_result(result.created.length, result.skipped.length));

  await loadLibrary(folder);
});

// ---- nastavení: zobrazení názvu ----

showTitleCheckbox.addEventListener('change', () => {
  tilesEl.classList.toggle('hide-titles', !showTitleCheckbox.checked);
});

// ---- nastavení: světlý/tmavý režim ----

function applyTheme(isLight) {
  document.body.classList.toggle('theme-light', isLight);
  lightThemeCheckbox.checked = isLight;
}

lightThemeCheckbox.addEventListener('change', () => {
  applyTheme(lightThemeCheckbox.checked);
  localStorage.setItem('theme', lightThemeCheckbox.checked ? 'light' : 'dark');
});

// ---- nastavení: barva posuvníků (progress bar + hlasitost) ----

sliderColorPicker.addEventListener('input', () => {
  document.documentElement.style.setProperty('--slider-accent', sliderColorPicker.value);
  localStorage.setItem('sliderColor', sliderColorPicker.value);
});

// ---- přehrávač: ovládací prvky ----

playBtn.addEventListener('click', togglePlay);
nextBtn.addEventListener('click', playNext);
prevBtn.addEventListener('click', playPrev);

audio.addEventListener('play', () => {
  playBtn.innerHTML = ICONS.pause;
});

audio.addEventListener('pause', () => {
  playBtn.innerHTML = ICONS.play;
});

audio.addEventListener('ended', () => {
  playNext();
});

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = formatTime(audio.duration);
  seekEl.max = audio.duration || 0;
});

audio.addEventListener('timeupdate', () => {
  if (isSeeking) return;
  currentTimeEl.textContent = formatTime(audio.currentTime);
  seekEl.value = audio.currentTime;
});

seekEl.addEventListener('input', () => {
  isSeeking = true;
  currentTimeEl.textContent = formatTime(Number(seekEl.value));
});

seekEl.addEventListener('change', () => {
  audio.currentTime = Number(seekEl.value);
  isSeeking = false;
});

volumeEl.addEventListener('input', () => {
  audio.volume = Number(volumeEl.value);
});

// ---- start ----

(async () => {
  const savedLang = localStorage.getItem('lang');
  applyLanguage(savedLang === 'en' ? 'en' : 'cs');

  const savedTheme = localStorage.getItem('theme');
  applyTheme(savedTheme === 'light');

  const savedColor = localStorage.getItem('sliderColor');
  if (savedColor) {
    sliderColorPicker.value = savedColor;
    document.documentElement.style.setProperty('--slider-accent', savedColor);
  }

  const lastFolder = await window.api.getLastFolder();
  if (lastFolder) {
    await loadLibrary(lastFolder);
  }
})();
