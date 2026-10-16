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

const shuffleBtn = document.getElementById('shuffle-btn');
const filterBarEl = document.getElementById('filter-bar');
const tagPopover = document.getElementById('tag-popover');
const tagPopoverTitle = document.getElementById('tag-popover-title');
const tagPopoverChips = document.getElementById('tag-popover-chips');
const tagInput = document.getElementById('tag-input');
const tagAddBtn = document.getElementById('tag-add-btn');

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

let isShuffle = false;
let playOrder = [];           // pořadí přehrávání (indexy do currentTracks)
let orderPos = 0;             // aktuální pozice v playOrder

let tagsMap = {};             // { m3u8Path: [štítky] }
let activeFilters = new Set();
let tagEditItem = null;
let coverCache = new Map();   // m3u8Path -> dataUrl | null
let activePlaylistPath = null;

// ---- statické ikony ----

prevBtn.innerHTML = ICONS.skipBack;
nextBtn.innerHTML = ICONS.skipForward;
playBtn.innerHTML = ICONS.play;
volumeIconEl.innerHTML = ICONS.volume2;
settingsBtn.innerHTML = ICONS.slidersVertical;
queueToggleBtn.innerHTML = ICONS.listMusic;
queueCloseBtn.innerHTML = ICONS.close;
shuffleBtn.innerHTML = ICONS.shuffle;

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

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = I18N[lang][el.dataset.i18nPlaceholder];
  });

  renderFilterBar();
  renderTiles();
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
  coverCache.clear();
  library = await window.api.scanLibrary(folderPath);
  renderTiles();
}

function getVisibleLibrary() {
  if (activeFilters.size === 0) return library;
  return library.filter((item) => {
    const tags = tagsMap[item.m3u8Path] || [];
    return [...activeFilters].every((f) => tags.includes(f));
  });
}

function applyCover(tile, dataUrl) {
  tile.classList.add('has-cover');
  tile.style.backgroundImage = `url("${dataUrl}")`;
}

function renderTiles() {
  tilesEl.innerHTML = '';
  emptyStateEl.style.display = library.length === 0 ? 'block' : 'none';
  activeWrapperEl = null;

  getVisibleLibrary().forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'tile-wrapper';
    wrapper.draggable = true;
    wrapper.title = t('tile_hint');
    wrapper.innerHTML = `
      <div class="tile"><img class="tile-icon" src="assets/logo/gramofun.svg" alt="" /></div>
      <div class="tile-title">${item.title}</div>
    `;
    const tile = wrapper.querySelector('.tile');

    if (!isQueuePlayback && activePlaylistPath === item.m3u8Path) {
      wrapper.classList.add('active');
      activeWrapperEl = wrapper;
    }

    wrapper.addEventListener('click', () => playPlaylistFromLibrary(item, wrapper));

    wrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openTagPopover(item, e.clientX, e.clientY);
    });

    wrapper.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/json', JSON.stringify(item));
      e.dataTransfer.effectAllowed = 'copy';
      wrapper.classList.add('dragging');
    });
    wrapper.addEventListener('dragend', () => {
      wrapper.classList.remove('dragging');
    });

    tilesEl.appendChild(wrapper);

    if (coverCache.has(item.m3u8Path)) {
      const cached = coverCache.get(item.m3u8Path);
      if (cached) applyCover(tile, cached);
    } else {
      window.api.getPlaylistCover(item.m3u8Path).then((dataUrl) => {
        coverCache.set(item.m3u8Path, dataUrl || null);
        if (dataUrl) applyCover(tile, dataUrl);
      });
    }
  });
}

// ---- přehrávání jednotlivého playlistu z knihovny (mimo frontu) ----

async function playPlaylistFromLibrary(item, wrapperEl) {
  activePlaylistPath = item.m3u8Path;
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
  activePlaylistPath = null;

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

function buildPlayOrder(startIndex) {
  const n = currentTracks.length;
  const idx = Array.from({ length: n }, (_, i) => i);

  if (!isShuffle) {
    playOrder = idx;
    orderPos = startIndex;
    return;
  }

  const rest = idx.filter((i) => i !== startIndex);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  playOrder = [startIndex, ...rest];
  orderPos = 0;
}

function updateTrackCounter() {
  trackCounterEl.textContent = currentTracks.length
    ? `(${orderPos + 1}/${currentTracks.length})`
    : '';
}

async function startPlaylist(item) {
  const tracks = await window.api.parsePlaylist(item.m3u8Path);
  if (tracks.length === 0) return;

  currentTracks = tracks;
  currentPlaylistTitle = item.title;
  const start = isShuffle ? Math.floor(Math.random() * tracks.length) : 0;
  buildPlayOrder(start);
  playAtOrderPos(orderPos);
}

function playAtOrderPos(pos) {
  if (pos < 0 || pos >= playOrder.length) return;
  orderPos = pos;
  currentTrackIndex = playOrder[pos];
  const track = currentTracks[currentTrackIndex];
  audio.src = track.url;
  audio.play();
  trackTitleEl.textContent = track.title;
  playlistTitleEl.textContent = currentPlaylistTitle;
  updateTrackCounter();
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
  if (orderPos + 1 < playOrder.length) {
    playAtOrderPos(orderPos + 1);
    return;
  }
  // konec playlistu - pokud hrajeme frontu, pokračuj dalším playlistem
  if (isQueuePlayback && queueIndex + 1 < playbackQueue.length) {
    playQueueFromIndex(queueIndex + 1);
  }
}

function playPrev() {
  if (orderPos > 0) {
    playAtOrderPos(orderPos - 1);
  }
}

// ---- náhodné přehrávání ----

function setShuffle(on) {
  isShuffle = on;
  shuffleBtn.classList.toggle('active', on);
  localStorage.setItem('shuffle', on ? '1' : '0');

  if (currentTracks.length > 0 && currentTrackIndex !== -1) {
    buildPlayOrder(currentTrackIndex);
    updateTrackCounter();
  }
}

shuffleBtn.addEventListener('click', () => setShuffle(!isShuffle));

// ---- štítky a filtrování knihovny ----

function allTags() {
  const set = new Set();
  Object.values(tagsMap).forEach((arr) => arr.forEach((tag) => set.add(tag)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function makeChip(label, selected, onClick) {
  const chip = document.createElement('button');
  chip.className = 'chip' + (selected ? ' selected' : '');
  chip.textContent = label;
  chip.addEventListener('click', onClick);
  return chip;
}

function renderFilterBar() {
  const tags = allTags();
  filterBarEl.innerHTML = '';
  if (tags.length === 0) {
    filterBarEl.classList.add('hidden');
    return;
  }
  filterBarEl.classList.remove('hidden');

  filterBarEl.appendChild(
    makeChip(t('filter_all'), activeFilters.size === 0, () => {
      activeFilters.clear();
      renderFilterBar();
      renderTiles();
    })
  );

  tags.forEach((tag) => {
    filterBarEl.appendChild(
      makeChip(tag, activeFilters.has(tag), () => {
        if (activeFilters.has(tag)) activeFilters.delete(tag);
        else activeFilters.add(tag);
        renderFilterBar();
        renderTiles();
      })
    );
  });
}

async function saveItemTags(item, tags) {
  if (tags.length > 0) tagsMap[item.m3u8Path] = tags;
  else delete tagsMap[item.m3u8Path];
  await window.api.setTags(item.m3u8Path, tags);

  const existing = allTags();
  [...activeFilters].forEach((f) => {
    if (!existing.includes(f)) activeFilters.delete(f);
  });

  renderTagPopover();
  renderFilterBar();
  renderTiles();
}

function renderTagPopover() {
  if (!tagEditItem) return;
  const current = tagsMap[tagEditItem.m3u8Path] || [];
  const tags = allTags();
  tagPopoverChips.innerHTML = '';

  if (tags.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'tag-none';
    hint.textContent = t('tag_none');
    tagPopoverChips.appendChild(hint);
    return;
  }

  tags.forEach((tag) => {
    const selected = current.includes(tag);
    tagPopoverChips.appendChild(
      makeChip(tag, selected, () => {
        const next = selected ? current.filter((x) => x !== tag) : [...current, tag];
        saveItemTags(tagEditItem, next);
      })
    );
  });
}

function openTagPopover(item, x, y) {
  tagEditItem = item;
  tagPopoverTitle.textContent = item.title;
  tagInput.value = '';
  renderTagPopover();
  tagPopover.classList.remove('hidden');

  const margin = 8;
  const left = Math.max(margin, Math.min(x, window.innerWidth - tagPopover.offsetWidth - margin));
  const top = Math.max(margin, Math.min(y, window.innerHeight - tagPopover.offsetHeight - margin));
  tagPopover.style.left = `${left}px`;
  tagPopover.style.top = `${top}px`;
  tagInput.focus();
}

function closeTagPopover() {
  tagPopover.classList.add('hidden');
  tagEditItem = null;
}

function addTagFromInput() {
  const value = tagInput.value.trim();
  if (!value || !tagEditItem) return;
  const current = tagsMap[tagEditItem.m3u8Path] || [];
  tagInput.value = '';
  if (current.includes(value)) return;
  saveItemTags(tagEditItem, [...current, value]);
}

tagAddBtn.addEventListener('click', addTagFromInput);
tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTagFromInput();
});

document.addEventListener('click', (e) => {
  if (!e.composedPath().includes(tagPopover)) closeTagPopover();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTagPopover();
});

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

  tagsMap = await window.api.getTags();
  renderFilterBar();
  setShuffle(localStorage.getItem('shuffle') === '1');

  const lastFolder = await window.api.getLastFolder();
  if (lastFolder) {
    await loadLibrary(lastFolder);
  }
})();
