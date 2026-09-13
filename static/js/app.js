// ---------- Idle wordmark waveform (decorative bars, static heights) ----------
(function drawIdleWave() {
  const svg = document.getElementById('idleWave');
  const barCount = 26;
  const gap = 3;
  const barWidth = (220 - gap * (barCount - 1)) / barCount;
  const profile = [4,7,11,8,14,18,10,6,16,20,12,8,15,22,17,9,13,19,11,6,14,10,7,12,8,5];
  profile.forEach((h, i) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', i * (barWidth + gap));
    rect.setAttribute('y', (24 - h) / 2);
    rect.setAttribute('width', barWidth);
    rect.setAttribute('height', h);
    rect.setAttribute('rx', 1);
    rect.setAttribute('fill', 'var(--brass)');
    svg.appendChild(rect);
  });
})();

// ---------- Data ----------
const VOICES = JSON.parse(document.getElementById('voiceData').textContent || '[]');

// ---------- Elements ----------
const textEl = document.getElementById('text');
const charCount = document.getElementById('charCount');
const languageEl = document.getElementById('language');
const voiceNameEl = document.getElementById('voiceName');
const genderBtns = Array.from(document.querySelectorAll('.gender-btn'));
const pacingGroup = document.getElementById('pacingGroup');
const pitchGroup = document.getElementById('pitchGroup');
const generateBtn = document.getElementById('generateBtn');
const generateLabel = document.getElementById('generateLabel');
const errorMsg = document.getElementById('errorMsg');

const player = document.getElementById('player');
const nowPlayingVoice = document.getElementById('nowPlayingVoice');
const timeDisplay = document.getElementById('timeDisplay');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const canvas = document.getElementById('waveform');
const ctx = canvas.getContext('2d');
const seekBar = document.getElementById('seekBar');
const seekFill = document.getElementById('seekFill');
const seekThumb = document.getElementById('seekThumb');
const restartBtn = document.getElementById('restartBtn');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const loopBtn = document.getElementById('loopBtn');
const volumeSlider = document.getElementById('volumeSlider');
const downloadLink = document.getElementById('downloadLink');
const audioEl = document.getElementById('audioEl');

const historyList = document.getElementById('historyList');
const emptyState = document.getElementById('emptyState');

// ---------- State ----------
let currentGender = 'Female';
let rate = pacingGroup.querySelector('.segment.active').dataset.value;
let pitch = pitchGroup.querySelector('.segment.active').dataset.value;

// ---------- Character counter ----------
textEl.addEventListener('input', () => {
  charCount.textContent = textEl.value.length;
});

// ---------- Build language list from voice catalog ----------
function uniqueLanguages() {
  const seen = new Map();
  VOICES.forEach(v => { if (!seen.has(v.Language)) seen.set(v.Language, v.Locale); });
  return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function populateLanguages() {
  uniqueLanguages().forEach(([lang]) => {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    languageEl.appendChild(opt);
  });
  const englishUS = uniqueLanguages().find(([lang]) => lang.toLowerCase().includes('english'));
  if (englishUS) languageEl.value = englishUS[0];
}

function populateVoicesForSelection() {
  const lang = languageEl.value;
  const matches = VOICES.filter(v => v.Language === lang && v.Gender === currentGender);
  const pool = matches.length ? matches : VOICES.filter(v => v.Language === lang);

  voiceNameEl.innerHTML = '';
  pool.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.ShortName;
    opt.textContent = v.ShortName.split('-').slice(2).join('-').replace('Neural', '');
    voiceNameEl.appendChild(opt);
  });

  // Keep the gender buttons honest about what's actually available.
  const hasFemale = VOICES.some(v => v.Language === lang && v.Gender === 'Female');
  const hasMale = VOICES.some(v => v.Language === lang && v.Gender === 'Male');
  genderBtns.forEach(btn => {
    const available = btn.dataset.gender === 'Female' ? hasFemale : hasMale;
    btn.disabled = !available;
    btn.style.opacity = available ? '1' : '0.4';
  });
}

languageEl.addEventListener('change', populateVoicesForSelection);

genderBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    genderBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentGender = btn.dataset.gender;
    populateVoicesForSelection();
  });
});

populateLanguages();
populateVoicesForSelection();

// ---------- Pacing / pitch segmented controls ----------
function wireSegmented(group, onSelect) {
  group.querySelectorAll('.segment').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.segment').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(btn.dataset.value);
    });
  });
}
wireSegmented(pacingGroup, v => { rate = v; });
wireSegmented(pitchGroup, v => { pitch = v; });

// ---------- Web Audio setup for live waveform ----------
let audioCtx, analyser, sourceNode, dataArray, rafId;

function ensureAudioGraph() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  sourceNode = audioCtx.createMediaElementSource(audioEl);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);
}

function drawIdleBars() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#2b3240';
  const bars = 48, gap = 3;
  const barW = (w - gap * (bars - 1)) / bars;
  for (let i = 0; i < bars; i++) {
    ctx.fillRect(i * (barW + gap), (h - 4) / 2, barW, 4);
  }
}

function renderFrame() {
  analyser.getByteFrequencyData(dataArray);
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const bars = 48, gap = 3;
  const barW = (w - gap * (bars - 1)) / bars;
  const step = Math.floor(dataArray.length / bars);
  for (let i = 0; i < bars; i++) {
    const v = dataArray[i * step] / 255;
    const barH = Math.max(4, v * h);
    const l = Math.min(1, v * 1.4);
    ctx.fillStyle = `rgb(${201 + l * 30}, ${146 + l * 50}, ${78 + l * 20})`;
    ctx.fillRect(i * (barW + gap), (h - barH) / 2, barW, barH);
  }
  rafId = requestAnimationFrame(renderFrame);
}

function stopFrame() {
  if (rafId) cancelAnimationFrame(rafId);
  drawIdleBars();
}

drawIdleBars();

// ---------- Time formatting ----------
function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function updateTimeAndSeek() {
  const dur = audioEl.duration || 0;
  const cur = audioEl.currentTime || 0;
  timeDisplay.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
  const pct = dur ? (cur / dur) * 100 : 0;
  seekFill.style.width = pct + '%';
  seekThumb.style.left = pct + '%';
}

audioEl.addEventListener('timeupdate', updateTimeAndSeek);
audioEl.addEventListener('loadedmetadata', updateTimeAndSeek);

// ---------- Seek bar interaction ----------
function seekToClientX(clientX) {
  const rect = seekBar.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  if (audioEl.duration) audioEl.currentTime = pct * audioEl.duration;
  updateTimeAndSeek();
}

seekBar.addEventListener('click', e => seekToClientX(e.clientX));
let dragging = false;
seekBar.addEventListener('mousedown', () => { dragging = true; });
window.addEventListener('mousemove', e => { if (dragging) seekToClientX(e.clientX); });
window.addEventListener('mouseup', () => { dragging = false; });

// ---------- Transport controls ----------
playBtn.addEventListener('click', () => {
  ensureAudioGraph();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (audioEl.paused) audioEl.play(); else audioEl.pause();
});
restartBtn.addEventListener('click', () => { audioEl.currentTime = 0; updateTimeAndSeek(); });
backBtn.addEventListener('click', () => { audioEl.currentTime = Math.max(0, audioEl.currentTime - 5); });
forwardBtn.addEventListener('click', () => { audioEl.currentTime = Math.min(audioEl.duration || 0, audioEl.currentTime + 5); });
loopBtn.addEventListener('click', () => {
  audioEl.loop = !audioEl.loop;
  loopBtn.classList.toggle('active', audioEl.loop);
});
volumeSlider.addEventListener('input', () => { audioEl.volume = parseFloat(volumeSlider.value); });

audioEl.addEventListener('play', () => {
  playIcon.hidden = true;
  pauseIcon.hidden = false;
  renderFrame();
});
audioEl.addEventListener('pause', () => {
  playIcon.hidden = false;
  pauseIcon.hidden = true;
  stopFrame();
});
audioEl.addEventListener('ended', () => {
  playIcon.hidden = false;
  pauseIcon.hidden = true;
  stopFrame();
});

// ---------- Load an entry into the player ----------
function loadEntry(entry, autoplay) {
  audioEl.src = entry.url;
  downloadLink.href = entry.url;
  downloadLink.download = `vocalize-${entry.id}.mp3`;
  nowPlayingVoice.textContent = `${entry.voice_label || entry.voice} · ${entry.gender || ''}`.trim();
  player.hidden = false;
  drawIdleBars();
  updateTimeAndSeek();
  if (autoplay) {
    ensureAudioGraph();
    audioEl.play();
  }
}

// ---------- Generate ----------
generateBtn.addEventListener('click', async () => {
  const text = textEl.value.trim();
  errorMsg.textContent = '';
  if (!text) {
    errorMsg.textContent = 'Type or paste some text first.';
    return;
  }
  if (!voiceNameEl.value) {
    errorMsg.textContent = 'No voice available for this language.';
    return;
  }
  generateBtn.disabled = true;
  generateLabel.textContent = 'Generating…';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: voiceNameEl.value,
        rate,
        pitch,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorMsg.textContent = data.error || 'Something went wrong.';
      return;
    }
    loadEntry(data.entry, true);
    prependHistory(data.entry);
  } catch (err) {
    errorMsg.textContent = 'Could not reach the server. Is it still running?';
  } finally {
    generateBtn.disabled = false;
    generateLabel.textContent = 'Generate speech';
  }
});

// ---------- History ----------
function historyItemNode(entry) {
  const li = document.createElement('li');
  li.className = 'history-item';
  li.dataset.id = entry.id;

  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.textContent = entry.preview;
  preview.title = 'Play this line';
  preview.addEventListener('click', () => loadEntry(entry, true));

  const meta = document.createElement('div');
  meta.className = 'history-meta';

  const tags = document.createElement('div');
  tags.className = 'history-tags';
  const voiceTag = document.createElement('span');
  voiceTag.className = 'tag';
  voiceTag.textContent = entry.gender || entry.voice_label;
  tags.appendChild(voiceTag);
  if (entry.rate && entry.rate !== '+0%') {
    const rateTag = document.createElement('span');
    rateTag.className = 'tag';
    rateTag.textContent = entry.rate;
    tags.appendChild(rateTag);
  }

  const actions = document.createElement('div');
  actions.className = 'history-actions';

  const time = document.createElement('span');
  time.textContent = entry.created_at;

  const del = document.createElement('button');
  del.className = 'delete';
  del.textContent = 'Remove';
  del.addEventListener('click', async () => {
    await fetch(`/api/history/${entry.id}`, { method: 'DELETE' });
    li.remove();
    toggleEmptyState();
  });

  actions.appendChild(time);
  actions.appendChild(del);
  meta.appendChild(tags);
  meta.appendChild(actions);
  li.appendChild(preview);
  li.appendChild(meta);
  return li;
}

function prependHistory(entry) {
  historyList.prepend(historyItemNode(entry));
  toggleEmptyState();
}

function toggleEmptyState() {
  emptyState.style.display = historyList.children.length ? 'none' : '';
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    (data.history || []).forEach(entry => historyList.appendChild(historyItemNode(entry)));
    toggleEmptyState();
  } catch (err) {
    // An empty history list is a fine fallback.
  }
}

loadHistory();
