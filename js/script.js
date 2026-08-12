'use strict';
(() => {

  /* ─────────────────────────── 0. UTILITIES ─────────────────── */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, '0');
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtDate = ts =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const fmtMin = m => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;

  const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ICON = {
    pencil: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8M9 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ─────────────────────── 1. STORAGE ADAPTER ─────────────────────── */

  const storage = (() => {
    let ok = false;
    try {
      const k = '__tempo_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      ok = true;
    } catch (_) { ok = false; }

    const mem = new Map();
    return {
      get ok() { return ok; },
      get(key) {
        try { return ok ? localStorage.getItem(key) : (mem.get(key) ?? null); }
        catch (_) { return mem.get(key) ?? null; }
      },
      set(key, val) {
        mem.set(key, val); // always mirror to memory
        try { if (ok) localStorage.setItem(key, val); }
        catch (_) { ok = false; }
        return ok;
      }
    };
  })();

  const KEY = 'tempo.dashboard.v1';

  const DEFAULTS = Object.freeze({
    name: 'Friend',
    theme: null,
    tasks: [],
    links: [],
    focus: { sessions: 0, minutes: 0 },
    ui: { filter: 'all', sort: 'new' },
    timerMinutes: 25
  });

  let state = loadState();
  let storageWarned = !storage.ok;

  /** survive from corrupted JSON. */
  function loadState() {
    const fresh = JSON.parse(JSON.stringify(DEFAULTS));
    const raw = storage.get(KEY);
    if (!raw) return fresh;
    try {
      const p = JSON.parse(raw);
      return {
        ...fresh,
        ...p,
        focus: { ...fresh.focus, ...(p.focus || {}) },
        ui: { ...fresh.ui, ...(p.ui || {}) },
        tasks: Array.isArray(p.tasks) ? p.tasks : [],
        links: Array.isArray(p.links) ? p.links : []
      };
    } catch (_) {
      console.warn('Tempo: stored data was corrupted — reset to defaults.');
      return fresh;
    }
  }

  function save() {
    const persisted = storage.set(KEY, JSON.stringify(state));
    if (!persisted && !storageWarned) {
      storageWarned = true;
      toast('Storage unavailable — changes live in memory only.', 'warn');
    }
    renderStorageBadge();
  }

  /* ─────────────────────────── 2. TOASTS ─────────────────────────── */

  const toastRoot = $('#toast-root');

  function toast(msg, type = 'ok', ms = 3200) {
    while (toastRoot.children.length >= 4) toastRoot.firstChild.remove();
    const el = document.createElement('div');
    el.className = `toast t-${type}`;
    el.textContent = msg;
    toastRoot.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(() => el.remove(), 280);
    }, ms);
  }

  /* ─────────────────────────── 3. THEME ─────────────────────────── */

  const mql = matchMedia('(prefers-color-scheme: dark)');

  const currentTheme = () => document.documentElement.dataset.theme || 'light';

  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    state.theme = next;
    save();
    applyTheme(next);
  }

  applyTheme(state.theme || (mql.matches ? 'dark' : 'light'));

  mql.addEventListener?.('change', e => {
    if (!state.theme) applyTheme(e.matches ? 'dark' : 'light');
  });

  /* ─────────────────────── 4. CLOCK + GREETING ─────────────────────── */

  const greetWord = $('#greet-word'), greetEyebrow = $('#greet-eyebrow'),
    greetSub = $('#greet-sub'), nameBtn = $('#name-btn'),
    nameInput = $('#name-input'),
    clockHH = $('#clock-hh'), clockMM = $('#clock-mm'), clockSS = $('#clock-ss'),
    clockDate = $('#clock-date'), clockTz = $('#clock-tz');

  const PERIODS = {
    morning: { word: 'Good morning', label: 'Morning block', sub: 'Fresh hours — plan the day’s first win.' },
    afternoon: { word: 'Good afternoon', label: 'Afternoon block', sub: 'Momentum window. Keep the streak alive.' },
    evening: { word: 'Good evening', label: 'Evening block', sub: 'Wind-down ops — close the open loops.' },
    night: { word: 'Late night', label: 'Night block', sub: 'Quiet hours. Deep work or deep rest.' }
  };

  function periodFor(hour) {
    if (hour >= 5 && hour <= 11) return 'morning';
    if (hour >= 12 && hour <= 16) return 'afternoon';
    if (hour >= 17 && hour <= 20) return 'evening';
    return 'night';
  }

  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y) / 864e5 + 1) / 7);
  }

  const dayOfYear = d =>
    Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);

  function utcOffsetLabel(d) {
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '−';
    return `UTC${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  }

  function renderGreeting() {
    const p = PERIODS[periodFor(new Date().getHours())];
    greetWord.textContent = p.word;
    greetEyebrow.textContent = p.label;
    greetSub.textContent = p.sub;
    nameBtn.firstChild.textContent = state.name + ' ';
  }

  let lastDayKey = '';
  function tickClock() {
    const d = new Date();
    clockHH.textContent = pad(d.getHours());
    clockMM.textContent = pad(d.getMinutes());
    clockSS.textContent = pad(d.getSeconds());

    const dayKey = d.toDateString();
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      clockDate.textContent =
        `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` +
        ` · Week ${isoWeek(d)} · Day ${dayOfYear(d)}`;
      const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local').replace(/_/g, ' ');
      clockTz.textContent = `${tz} · ${utcOffsetLabel(d)}`;
      renderGreeting();
    }
  }


  function startNameEdit() {
    nameBtn.hidden = true;
    nameInput.hidden = false;
    nameInput.value = state.name === 'Friend' ? '' : state.name;
    nameInput.placeholder = 'Friend';
    nameInput.focus();
  }
  function commitName(cancel = false) {
    if (!cancel) {
      const v = nameInput.value.trim().slice(0, 24);
      state.name = v || 'Friend';
      save();
    }
    nameInput.hidden = true;
    nameBtn.hidden = false;
    renderGreeting();
  }

  /* ─────────────────────────── 5. HUD ─────────────────────────── */

  const hudEls = {
    done: $('#hud-done'), pending: $('#hud-pending'),
    sessions: $('#hud-sessions'), minutes: $('#hud-minutes')
  };

  /** Animate a number change. */
  function setNum(el, to, fmt = String) {
    const from = Number(el.dataset.v ?? 0);
    el.dataset.v = to;
    if (REDUCED_MOTION || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), D = 450;
    const step = t => {
      const p = Math.min(1, (t - t0) / D);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderHUD() {
    const done = state.tasks.filter(t => t.done).length;
    setNum(hudEls.done, done);
    setNum(hudEls.pending, state.tasks.length - done);
    setNum(hudEls.sessions, state.focus.sessions);
    setNum(hudEls.minutes, state.focus.minutes, fmtMin);
  }

  /* ─────────────────────── 6. FOCUS TIMER + AUDIO ─────────────────────── */

  const PRESETS = [
    { id: 'pomodoro', label: 'Pomodoro', min: 25 },
    { id: 'short', label: 'Short Break', min: 5 },
    { id: 'long', label: 'Long Break', min: 15 }
  ];
  const BASE_TITLE = document.title;

  const T = {
    mode: 'pomodoro', label: 'Pomodoro',
    dur: 25 * 60, rem: 25 * 60,
    status: 'idle',        // idle | running | paused
    endAt: 0, iv: null, lastShown: -1
  };

  const timerDisplay = $('#timer-display'), modeLabel = $('#timer-mode-label'),
    statePill = $('#timer-state'), toggleBtn = $('#timer-toggle'),
    ringProg = $('#ring-prog'), customMin = $('#custom-min'),
    timerPanel = $('#timer-panel'), presetGroup = $('#preset-group');

  /* — Web Audio chime — */
  let audioCtx = null;
  function ensureAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (_) { /* audio unsupported — silently degrade */ }
  }
  function chime() {
    ensureAudio();
    if (!audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      [880, 1108.73, 1318.51].forEach((freq, i) => {   // A5 · C#6 · E6
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = t0 + i * 0.13;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 1.25);
      });
    } catch (_) { /* ignore */ }
  }
  // Unlock audio on first user gesture.
  document.addEventListener('pointerdown', ensureAudio, { once: true, passive: true });

  const fmtTimer = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const remainingNow = () => Math.max(0, Math.ceil((T.endAt - Date.now()) / 1000));

  function renderTimer() {
    timerDisplay.textContent = fmtTimer(T.rem);
    ringProg.style.strokeDashoffset = String(100 - (T.rem / T.dur) * 100);
    modeLabel.textContent = T.label;

    statePill.className = 'state-pill ' +
      (T.status === 'running' ? 'p-run' : T.status === 'paused' ? 'p-pause' : 'p-idle');
    statePill.textContent =
      T.status === 'running' ? 'Running' : T.status === 'paused' ? 'Paused' : 'Idle';

    toggleBtn.textContent =
      T.status === 'running' ? 'Pause' : T.status === 'paused' ? 'Resume' : 'Start';

    timerPanel.classList.toggle('running', T.status === 'running');

    document.title = T.status === 'idle'
      ? BASE_TITLE
      : `${fmtTimer(T.rem)} · ${T.label} — Tempo`;
  }

  function tick() {
    const r = remainingNow();
    T.rem = r;
    if (r !== T.lastShown) { T.lastShown = r; renderTimer(); }
    if (r <= 0) completeSession();
  }

  function startTimer() {
    if (T.rem <= 0) T.rem = T.dur;
    ensureAudio();
    T.endAt = Date.now() + T.rem * 1000;
    T.status = 'running';
    clearInterval(T.iv);
    T.iv = setInterval(tick, 200);
    renderTimer();
  }

  function pauseTimer() {
    T.rem = remainingNow();
    clearInterval(T.iv);
    T.status = 'paused';
    renderTimer();
  }

  function resetTimer() {
    clearInterval(T.iv);
    T.rem = T.dur;
    T.status = 'idle';
    T.lastShown = -1;
    renderTimer();
  }

  const toggleTimer = () => (T.status === 'running' ? pauseTimer() : startTimer());

  function completeSession() {
    clearInterval(T.iv);
    T.status = 'idle';
    chime();
    const isFocus = T.mode === 'pomodoro' || T.mode === 'custom';
    if (isFocus) {
      state.focus.sessions += 1;
      state.focus.minutes += Math.round(T.dur / 60);
      save();
      renderHUD();
    }
    toast(`“${T.label}” complete${isFocus ? ' — session logged ✓' : '. Take it easy.'}`, 'ok');
    T.rem = T.dur;
    T.lastShown = -1;
    renderTimer();
  }

  /** Switch mode/preset; always resets the countdown. */
  function setMode(id, min, label) {
    clearInterval(T.iv);
    T.mode = id; T.label = label;
    T.dur = clamp(min, 1, 180) * 60;
    T.rem = T.dur; T.status = 'idle'; T.lastShown = -1;
    customMin.value = T.dur / 60;
    $$('button', presetGroup).forEach(b => {
      const on = b.dataset.preset === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    renderTimer();
  }

  /* Recalculate instantly when the tab regains visibility (throttled tabs). */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && T.status === 'running') tick();
  });

  /* ─────────────────────────── 7. TASKS ─────────────────────────── */

  const taskForm = $('#task-form'), taskInput = $('#task-input'),
    taskError = $('#task-error'), taskList = $('#task-list'),
    tasksEmpty = $('#tasks-empty'), taskSort = $('#task-sort'),
    taskBar = $('#task-bar'), taskBarLabel = $('#task-progress-label'),
    taskCountBadge = $('#task-count'), filterGroup = $('#task-filter');

  let editingId = null;
  let editCancelled = false;

  function visibleTasks() {
    const f = state.ui.filter;
    const list = state.tasks.filter(t =>
      f === 'all' ? true : f === 'active' ? !t.done : t.done);
    const dir = state.ui.sort === 'old' ? 1 : -1;
    return [...list].sort((a, b) => (a.createdAt - b.createdAt) * dir);
  }

  function renderTasks() {
    const list = visibleTasks();
    taskList.innerHTML = '';

    const frag = document.createDocumentFragment();
    for (const t of list) {
      const li = document.createElement('li');
      li.dataset.id = t.id;
      if (t.done) li.classList.add('done');

      if (t.id === editingId) {
        li.innerHTML =
          `<input class="task-edit-input" maxlength="120" value="${esc(t.title)}" aria-label="Edit task">`;
      } else {
        li.innerHTML = `
          <button class="check ${t.done ? 'on' : ''}" role="checkbox"
                  aria-checked="${t.done}" aria-label="Toggle ${esc(t.title)}">
            <svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 5"/></svg>
          </button>
          <div class="t-body">
            <span class="t-title">${esc(t.title)}</span>
            <span class="t-meta">added ${fmtDate(t.createdAt)}</span>
          </div>
          <div class="t-actions">
            <button class="icon-btn t-edit" aria-label="Edit task">${ICON.pencil}</button>
            <button class="icon-btn danger t-del" aria-label="Delete task">${ICON.trash}</button>
          </div>`;
      }
      frag.appendChild(li);
    }
    taskList.appendChild(frag);

    if (editingId) {
      const inp = $('.task-edit-input', taskList);
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }

    // Counts, empty state, progress bar, filter badges
    const done = state.tasks.filter(t => t.done).length;
    const total = state.tasks.length;
    tasksEmpty.hidden = list.length > 0;
    taskCountBadge.textContent = `${total - done} open`;
    taskBar.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
    taskBarLabel.textContent = total ? `${Math.round((done / total) * 100)}%` : '0%';

    const counts = { all: total, active: total - done, done };
    $$('button', filterGroup).forEach(b => {
      b.querySelector('.cnt').textContent = counts[b.dataset.filter];
      const on = b.dataset.filter === state.ui.filter;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    taskSort.value = state.ui.sort;
  }

  function showTaskError(msg) {
    taskError.textContent = msg;
    if (msg) {
      taskInput.classList.remove('shake');
      void taskInput.offsetWidth;
      taskInput.classList.add('shake');
    }
  }

  function isDuplicate(title, exceptId = null) {
    return state.tasks.some(t =>
      t.id !== exceptId && t.title.toLowerCase() === title.toLowerCase());
  }

  function addTask(title) {
    if (!title) { showTaskError('Task can’t be blank.'); return false; }
    if (isDuplicate(title)) { showTaskError('That task already exists.'); return false; }
    state.tasks.push({ id: uid(), title, done: false, createdAt: Date.now() });
    save();
    renderTasks();
    renderHUD();
    showTaskError('');
    return true;
  }

  function startEdit(id) {
    editingId = id;
    editCancelled = false;
    renderTasks();
  }

  function cancelEdit() {
    editCancelled = true;
    editingId = null;
    renderTasks();
  }

  function commitEdit(input) {
    const li = input.closest('li');
    if (!li || !editingId) return;
    const id = editingId;
    editingId = null;
    const task = state.tasks.find(t => t.id === id);
    if (!task) { renderTasks(); return; }

    const val = input.value.trim().slice(0, 120);
    if (!val) { toast('Edit discarded — title can’t be blank.', 'warn'); }
    else if (isDuplicate(val, id)) { toast('Edit discarded — duplicate title.', 'warn'); }
    else task.title = val;

    save();
    renderTasks();
  }

  /* Delegated task-list events (leak-free: 3 listeners total) */
  taskList.addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li) return;
    const id = li.dataset.id;
    if (e.target.closest('.check')) {
      const t = state.tasks.find(x => x.id === id);
      if (t) { t.done = !t.done; save(); renderTasks(); renderHUD(); }
    } else if (e.target.closest('.t-edit')) {
      startEdit(id);
    } else if (e.target.closest('.t-del')) {
      state.tasks = state.tasks.filter(x => x.id !== id);
      save(); renderTasks(); renderHUD();
      toast('Task deleted.', 'ok');
    }
  });

  taskList.addEventListener('keydown', e => {
    if (!e.target.matches('.task-edit-input')) return;
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.target); }
    else if (e.key === 'Escape') { e.stopPropagation(); cancelEdit(); }
  });

  taskList.addEventListener('focusout', e => {
    if (e.target.matches('.task-edit-input') && editingId) commitEdit(e.target);
  });

  taskForm.addEventListener('submit', e => {
    e.preventDefault();
    const ok = addTask(taskInput.value.trim());
    if (ok) { taskInput.value = ''; taskInput.focus(); }
  });
  taskInput.addEventListener('input', () => showTaskError(''));

  filterGroup.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    state.ui.filter = btn.dataset.filter;
    save(); renderTasks();
  });

  taskSort.addEventListener('change', () => {
    state.ui.sort = taskSort.value;
    save(); renderTasks();
  });

  /* ─────────────────────────── 8. QUICK LINKS ─────────────────────────── */

  const linkGrid = $('#link-grid'), linksEmpty = $('#links-empty');
  const AVA_CLASSES = ['a1', 'a2', 'a3', 'a4'];

  /** Normalise + validate a URL: auto-prefix https, allow http(s) only. */
  function normalizeUrl(raw) {
    let u = String(raw).trim();
    if (!u) return null;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) u = 'https://' + u;
    try {
      const p = new URL(u);
      return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : null;
    } catch (_) { return null; }
  }

  const hostOf = url => { try { return new URL(url).hostname; } catch (_) { return url; } };

  function renderLinks() {
    linkGrid.innerHTML = '';
    linksEmpty.hidden = state.links.length > 0;

    const frag = document.createDocumentFragment();
    state.links.forEach(l => {
      const hash = [...l.name].reduce((a, c) => a + c.charCodeAt(0), 0);
      const card = document.createElement('div');
      card.className = 'link-card';
      card.innerHTML = `
        <a class="link-hit" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
          <span class="ava ${AVA_CLASSES[hash % AVA_CLASSES.length]}">${esc(l.name[0].toUpperCase())}</span>
          <span class="l-txt"><strong>${esc(l.name)}</strong><em>${esc(hostOf(l.url))}</em></span>
          ${ICON.ext}
        </a>
        <button class="icon-btn danger l-del" aria-label="Remove ${esc(l.name)}">${ICON.x}</button>`;
      frag.appendChild(card);
    });
    linkGrid.appendChild(frag);
  }

  linkGrid.addEventListener('click', e => {
    const btn = e.target.closest('.l-del'); if (!btn) return;
    const card = btn.closest('.link-card');
    const idx = [...linkGrid.children].indexOf(card);
    const removed = state.links[idx];
    state.links.splice(idx, 1);
    save(); renderLinks();
    if (removed) toast(`Removed “${removed.name}”.`, 'ok');
  });

  /* ─────────────────────────── 9. MODAL ─────────────────────────── */

  const modal = $('#link-modal'), linkForm = $('#link-form'),
    linkName = $('#link-name'), linkUrl = $('#link-url'),
    linkError = $('#link-error'), linkAddBtn = $('#link-add-btn');
  let lastFocused = null;

  function openModal() {
    lastFocused = document.activeElement;
    modal.hidden = false;
    linkForm.reset();
    linkError.textContent = '';
    linkName.focus();
  }
  function closeModal() {
    modal.hidden = true;
    lastFocused?.focus?.();
  }

  linkAddBtn.addEventListener('click', openModal);
  $('#link-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  linkForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = linkName.value.trim().slice(0, 40);
    const url = normalizeUrl(linkUrl.value);
    if (!name) { linkError.textContent = 'Name is required.'; return; }
    if (!url) { linkError.textContent = 'Enter a valid http(s) URL.'; return; }
    if (state.links.some(l => l.url.toLowerCase() === url.toLowerCase())) {
      linkError.textContent = 'That link already exists.'; return;
    }
    state.links.push({ id: uid(), name, url });
    save(); renderLinks(); closeModal();
    toast(`Added “${name}”.`, 'ok');
  });

  /* ─────────────────────── 10. EXPORT / IMPORT ─────────────────────── */

  const importFile = $('#import-file');

  $('#export-btn').addEventListener('click', () => {
    const payload = {
      app: 'tempo-dashboard', version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        name: state.name, tasks: state.tasks, links: state.links,
        focus: state.focus, ui: state.ui, timerMinutes: state.timerMinutes
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `tempo-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup exported.', 'ok');
  });

  $('#import-btn').addEventListener('click', () => importFile.click());

  /** Coerce unknown imported JSON into a safe state shape. */
  function sanitizeImport(raw) {
    const d = raw && typeof raw.data === 'object' ? raw.data : raw;
    if (!d || typeof d !== 'object') throw new Error('bad shape');

    const tasks = Array.isArray(d.tasks) ? d.tasks
      .map(t => ({
        id: String(t?.id || uid()),
        title: String(t?.title || '').trim().slice(0, 120),
        done: Boolean(t?.done),
        createdAt: Number(t?.createdAt) || Date.now()
      }))
      .filter(t => t.title) : [];

    const links = Array.isArray(d.links) ? d.links
      .map(l => ({
        id: String(l?.id || uid()),
        name: String(l?.name || '').trim().slice(0, 40),
        url: normalizeUrl(l?.url || '')
      }))
      .filter(l => l.name && l.url) : [];

    return {
      name: String(d.name || 'Friend').trim().slice(0, 24) || 'Friend',
      theme: state.theme, // keep current theme choice
      tasks, links,
      focus: {
        sessions: Math.max(0, Number(d.focus?.sessions) || 0),
        minutes: Math.max(0, Number(d.focus?.minutes) || 0)
      },
      ui: {
        filter: ['all', 'active', 'done'].includes(d.ui?.filter) ? d.ui.filter : 'all',
        sort: d.ui?.sort === 'old' ? 'old' : 'new'
      },
      timerMinutes: clamp(Number(d.timerMinutes) || 25, 1, 180)
    };
  }

  importFile.addEventListener('change', () => {
    const file = importFile.files[0];
    importFile.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = sanitizeImport(JSON.parse(reader.result));
        if (!confirm('Replace current dashboard data with this backup?')) return;
        state = next;
        editingId = null;
        save();
        renderAll();
        toast('Backup imported successfully.', 'ok');
      } catch (_) {
        toast('Import failed — not a valid Tempo backup.', 'err');
      }
    };
    reader.onerror = () => toast('Could not read that file.', 'err');
    reader.readAsText(file);
  });

  /* ─────────────────────── 11. STORAGE BADGE ─────────────────────── */

  const storageBadge = $('#storage-badge');
  function renderStorageBadge() {
    const ok = storage.ok;
    storageBadge.classList.toggle('warn', !ok);
    storageBadge.innerHTML =
      `<i class="dot"></i>${ok ? 'localStorage · synced' : 'memory mode · not persisted'}`;
  }

  /* ─────────────────────── 12. KEYBOARD SHORTCUTS ─────────────────────── */

  const isInteractive = el =>
    el?.closest?.('input, textarea, select, button, a, [contenteditable="true"]');

  document.addEventListener('keydown', e => {
    // Escape: modal → inline edit → name edit → clear add-task field
    if (e.key === 'Escape') {
      if (!modal.hidden) { closeModal(); return; }
      if (editingId) { cancelEdit(); return; }
      if (document.activeElement === nameInput) { commitName(true); return; }
      if (document.activeElement === taskInput) { showTaskError(''); taskInput.blur(); }
      return;
    }

    // Alt+N: jump to "Add Task" input
    if (e.altKey && e.code === 'KeyN') {
      e.preventDefault();
      if (!modal.hidden) closeModal();
      taskInput.focus();
      taskInput.scrollIntoView({ block: 'center', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
      return;
    }

    // Alt+T: toggle theme
    if (e.altKey && e.code === 'KeyT') {
      e.preventDefault();
      toggleTheme();
      return;
    }

    // Space: start/pause timer (only when not interacting with controls)
    if (e.code === 'Space' && !e.repeat && modal.hidden && !isInteractive(e.target)) {
      e.preventDefault();
      toggleTimer();
    }
  });

  /* ─────────────────────────── 13. WIRING ─────────────────────────── */

  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#timer-toggle').addEventListener('click', toggleTimer);
  $('#timer-reset').addEventListener('click', resetTimer);

  presetGroup.addEventListener('click', e => {
    const btn = e.target.closest('button[data-preset]'); if (!btn) return;
    const p = PRESETS.find(x => x.id === btn.dataset.preset);
    if (p) setMode(p.id, p.min, p.label);
  });

  customMin.addEventListener('change', () => {
    const v = clamp(Math.round(Number(customMin.value) || 1), 1, 180);
    customMin.value = v;
    state.timerMinutes = v;
    save();
    setMode('custom', v, 'Custom');
  });

  nameBtn.addEventListener('click', startNameEdit);
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commitName(); }
  });
  nameInput.addEventListener('blur', () => { if (!nameInput.hidden) commitName(); });

  /* ─────────────────────────── 14. BOOT ─────────────────────────── */

  function renderAll() {
    renderGreeting();
    renderHUD();
    renderTimer();
    renderTasks();
    renderLinks();
    customMin.value = state.timerMinutes;
  }

  tickClock();
  setInterval(tickClock, 1000);
  renderAll();
  renderStorageBadge();

  if (!storage.ok) {
    toast('LocalStorage unavailable — running in memory-only mode.', 'warn', 5000);
  }

})();