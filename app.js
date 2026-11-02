/* ことばパッド — 単語アイコンを選んで合成音声で話すアプリ */
(() => {
'use strict';

const STORE_KEY = 'kotobapad.v1';
const PER_PAGE = { subject: 8, predicate: 12 };   // 主語: 4×2 / 述語: 4×3
const LONG_PRESS_MS = 480;
const COLORS = ['#ffd27a','#ffb38a','#ff9fae','#f6a8e0','#c7b3ff','#9fc9ff','#8fe0e0','#a8e6a0','#e0e89a','#e6dccb'];

const W = (text, emoji, color, reading = '') => ({ id: uid(), text, emoji, color, reading });
function uid(){ return Math.random().toString(36).slice(2, 10); }

function defaultWords(){
  return {
    subject: [
      W('わたしは','🙋','#ffd27a'), W('ぼくは','🧒','#ffd27a'), W('あなたは','👉','#ffb38a'), W('みんなは','👨‍👩‍👧','#ffb38a'),
      W('ママは','👩','#ff9fae'), W('パパは','👨','#9fc9ff'), W('せんせいは','🧑‍🏫','#a8e6a0'), W('ともだちは','🤝','#e0e89a'),
      W('きょう','📅','#c7b3ff'), W('あした','🌅','#c7b3ff'), W('いま','⏰','#c7b3ff'), W('あとで','⏳','#c7b3ff'),
      W('いぬが','🐕','#e6dccb'), W('ねこが','🐈','#e6dccb'), W('おばあちゃんは','👵','#ff9fae'), W('おじいちゃんは','👴','#9fc9ff'),
    ],
    predicate: [
      W('ありがとう','🙏','#a8e6a0'), W('ごめんなさい','🙇','#e6dccb'), W('はい','⭕','#a8e6a0'), W('いいえ','❌','#ff9fae'),
      W('おなかがすいた','🍙','#ffd27a'), W('のどがかわいた','🥤','#9fc9ff'), W('ねむい','😴','#c7b3ff'), W('いたい','🤕','#ff9fae'),
      W('たすけて','🆘','#ff9fae'), W('まって','✋','#ffb38a'), W('わからない','🤔','#e6dccb'), W('だいすき','❤️','#f6a8e0'),
      W('うれしい','😊','#ffd27a'), W('かなしい','😢','#9fc9ff'), W('こわい','😨','#c7b3ff'), W('たのしい','😆','#ffd27a'),
      W('みずがほしい','💧','#8fe0e0'), W('ごはんをたべたい','🍚','#ffd27a'), W('トイレにいきたい','🚻','#9fc9ff'), W('そとであそびたい','⚽','#a8e6a0'),
      W('いえにかえりたい','🏠','#ffb38a'), W('あいたい','🫂','#f6a8e0'), W('げんきです','💪','#a8e6a0'), W('てつだって','🙌','#e0e89a'),
    ],
  };
}
function defaultSettings(){ return { voiceURI: '', rate: 1, pitch: 1, joiner: '', tapSpeak: false }; }

/* ---------- 状態 ---------- */
let state = load();
let sentence = [];          // [{text, reading, color}]
let reorderMode = false;
let press = null;           // 長押し判定中
let drag = null;            // 並び替えドラッグ中
let editing = null;         // {area, id|null}

function load(){
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.words && Array.isArray(s.words.subject)) return { words: s.words, settings: { ...defaultSettings(), ...s.settings } };
  } catch (_) {}
  return { words: defaultWords(), settings: defaultSettings() };
}
function save(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {} }

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- 描画 ---------- */
function render(area){
  const pager = $('#pager-' + area);
  const keep = pager.scrollLeft;
  const list = state.words[area];
  const per = PER_PAGE[area];
  const items = reorderMode ? list.slice() : [...list, { add: true }];
  const pages = Math.max(1, Math.ceil(items.length / per));
  let html = '';
  for (let p = 0; p < pages; p++){
    html += '<div class="page">';
    for (const w of items.slice(p * per, (p + 1) * per)){
      if (w.add) html += `<div class="tile add" data-area="${area}" data-add="1"><span class="em">＋</span><span class="tx">追加</span></div>`;
      else html += `<div class="tile${drag && drag.id === w.id ? ' placeholder' : ''}" data-area="${area}" data-id="${w.id}" style="--c:${esc(w.color)}"><span class="em">${esc(w.emoji || '')}</span><span class="tx">${esc(w.text)}</span></div>`;
    }
    html += '</div>';
  }
  pager.innerHTML = html;
  pager.scrollLeft = Math.min(keep, pager.scrollWidth - pager.clientWidth);
  renderDots(area);
}
function renderAll(){ render('subject'); render('predicate'); }

function renderDots(area){
  const pager = $('#pager-' + area);
  const n = pager.children.length;
  const cur = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
  $('#dots-' + area).innerHTML = n > 1 ? Array.from({ length: n }, (_, i) => `<i class="${i === cur ? 'on' : ''}"></i>`).join('') : '';
}

function renderSentence(){
  const el = $('#chips');
  if (!sentence.length){ el.innerHTML = '<span class="placeholder">ことばを えらんでね</span>'; return; }
  el.innerHTML = sentence.map((w, i) => `<span class="chip" data-i="${i}" style="--cc:${esc(w.color)}">${esc(w.text)}</span>`).join('');
  el.scrollTop = el.scrollHeight;
}

/* ---------- 音声合成 ---------- */
let jaVoices = [];
function loadVoices(){
  const all = speechSynthesis.getVoices();
  jaVoices = all.filter(v => /^ja/i.test(v.lang));
  const sel = $('#s-voice');
  sel.innerHTML = '<option value="">自動(日本語)</option>' +
    jaVoices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)}${v.localService ? '' : '(オンライン)'}</option>`).join('');
  sel.value = state.settings.voiceURI;
}
function speak(text){
  if (!text || !('speechSynthesis' in window)) return;
  const go = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    const v = jaVoices.find(v => v.voiceURI === state.settings.voiceURI) || jaVoices[0];
    if (v) u.voice = v;
    u.rate = state.settings.rate; u.pitch = state.settings.pitch;
    u.onstart = () => document.body.classList.add('speaking');
    u.onend = u.onerror = () => { if (!speechSynthesis.speaking) document.body.classList.remove('speaking'); };
    speechSynthesis.speak(u);
  };
  if (speechSynthesis.speaking || speechSynthesis.pending){ speechSynthesis.cancel(); setTimeout(go, 60); }
  else go();
}
function sentenceText(){ return sentence.map(w => w.reading || w.text).join(state.settings.joiner); }
function stopSpeaking(){ speechSynthesis.cancel(); document.body.classList.remove('speaking'); }

/* ---------- 単語操作 ---------- */
function findWord(area, id){ return state.words[area].find(w => w.id === id); }

function tapWord(tile){
  const w = findWord(tile.dataset.area, tile.dataset.id);
  if (!w) return;
  sentence.push({ text: w.text, reading: w.reading, color: w.color });
  renderSentence();
  tile.classList.remove('flash'); void tile.offsetWidth; tile.classList.add('flash');
  if (state.settings.tapSpeak) speak(w.reading || w.text);
}

/* 長押し・タップ判定(通常モード) */
function onPointerDown(e){
  const tile = e.target.closest('.tile');
  if (!tile || (e.button && e.button !== 0)) return;
  if (reorderMode){ if (tile.dataset.id) startDrag(e, tile); return; }
  cancelPress();
  tile.classList.add('pressed');
  press = { tile, x: e.clientX, y: e.clientY, fired: false,
    timer: setTimeout(() => {
      press.fired = true; tile.classList.remove('pressed');
      if (navigator.vibrate) navigator.vibrate(15);
      openEditor(tile.dataset.area, tile.dataset.id || null);
    }, LONG_PRESS_MS) };
}
function onPointerMove(e){
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress();
}
function onPointerUp(){
  if (!press) return;
  const { tile, fired } = press;
  cancelPress();
  if (fired) return;
  if (tile.dataset.add) openEditor(tile.dataset.area, null);
  else tapWord(tile);
}
function cancelPress(){
  if (!press) return;
  clearTimeout(press.timer); press.tile.classList.remove('pressed'); press = null;
}

/* ---------- 並び替え ---------- */
function setReorder(on){
  reorderMode = on;
  document.body.classList.toggle('reordering', on);
  renderAll();
}
function startDrag(e, tile){
  e.preventDefault();
  const r = tile.getBoundingClientRect();
  const ghost = tile.cloneNode(true);
  ghost.classList.add('ghost');
  Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px', left: r.left + 'px', top: r.top + 'px' });
  document.body.appendChild(ghost);
  drag = { id: tile.dataset.id, area: tile.dataset.area, dx: e.clientX - r.left, dy: e.clientY - r.top, ghost, edgeTimer: null, edgeDir: 0 };
  tile.classList.add('placeholder');
  window.addEventListener('pointermove', onDragMove, { passive: false });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}
function onDragMove(e){
  if (!drag) return;
  e.preventDefault();
  drag.ghost.style.left = (e.clientX - drag.dx) + 'px';
  drag.ghost.style.top = (e.clientY - drag.dy) + 'px';

  const over = document.elementFromPoint(e.clientX, e.clientY);
  const t = over && over.closest('.tile[data-id]');
  if (t && t.dataset.area === drag.area && t.dataset.id !== drag.id){
    const list = state.words[drag.area];
    const from = list.findIndex(w => w.id === drag.id);
    const to = list.findIndex(w => w.id === t.dataset.id);
    list.splice(to, 0, list.splice(from, 1)[0]);
    render(drag.area);
  }
  // 端で止めるとページ送り
  const pr = $('#pager-' + drag.area).getBoundingClientRect();
  const inY = e.clientY > pr.top - 30 && e.clientY < pr.bottom + 30;
  const dir = !inY ? 0 : e.clientX < pr.left + 34 ? -1 : e.clientX > pr.right - 34 ? 1 : 0;
  if (dir !== drag.edgeDir){
    clearInterval(drag.edgeTimer); drag.edgeTimer = null; drag.edgeDir = dir;
    if (dir) drag.edgeTimer = setInterval(() => turnPage(drag.area, dir), 650);
  }
}
function endDrag(){
  if (!drag) return;
  clearInterval(drag.edgeTimer);
  drag.ghost.remove();
  const area = drag.area;
  drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', endDrag);
  save(); render(area);
}
function turnPage(area, dir){
  const pager = $('#pager-' + area);
  const w = pager.clientWidth;
  const cur = Math.round(pager.scrollLeft / w);
  const next = Math.max(0, Math.min(pager.children.length - 1, cur + dir));
  pager.scrollTo({ left: next * w, behavior: 'smooth' });
}

/* ---------- 編集シート ---------- */
const editor = $('#editor');
let fColor = COLORS[0], fArea = 'subject';

function setSeg(root, v){ root.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
function setColor(c){ fColor = c; $('#f-colors').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === c)); }

function openEditor(area, id){
  const w = id ? findWord(area, id) : null;
  editing = { area, id };
  $('#editor-title').textContent = w ? 'ことばを編集' : 'ことばを追加';
  $('#f-text').value = w ? w.text : '';
  $('#f-reading').value = w ? (w.reading || '') : '';
  $('#f-emoji').value = w ? (w.emoji || '') : '';
  setColor(w ? w.color : (area === 'subject' ? '#ffd27a' : '#9fc9ff'));
  fArea = area; setSeg($('#f-area'), area);
  $('#e-delete').hidden = !w;
  $('#e-reorder').hidden = !w;
  editor.showModal();
}
function saveEditor(){
  const text = $('#f-text').value.trim();
  if (!text) return;
  const data = { text, reading: $('#f-reading').value.trim(), emoji: $('#f-emoji').value.trim(), color: fColor };
  const { area, id } = editing;
  if (id){
    const list = state.words[area];
    const i = list.findIndex(w => w.id === id);
    const w = Object.assign(list[i], data);
    if (fArea !== area){ list.splice(i, 1); state.words[fArea].push(w); }
  } else {
    state.words[fArea].push({ id: uid(), ...data });
  }
  save(); renderAll();
  if (!id) setTimeout(() => turnPage(fArea, 99), 50);  // 追加したページへ
}

/* ---------- 設定シート ---------- */
const settings = $('#settings');
function openSettings(){
  loadVoices();
  const s = state.settings;
  $('#s-rate').value = s.rate; $('#o-rate').textContent = (+s.rate).toFixed(2);
  $('#s-pitch').value = s.pitch; $('#o-pitch').textContent = (+s.pitch).toFixed(2);
  setSeg($('#s-joiner'), s.joiner);
  $('#s-tapspeak').checked = s.tapSpeak;
  settings.showModal();
}
function exportData(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'kotobapad.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importData(file){
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.words || !Array.isArray(d.words.subject) || !Array.isArray(d.words.predicate)) throw 0;
      for (const a of ['subject','predicate']) d.words[a] = d.words[a].map(w => ({ id: w.id || uid(), text: String(w.text || ''), reading: String(w.reading || ''), emoji: String(w.emoji || ''), color: String(w.color || '#e6dccb') })).filter(w => w.text);
      state = { words: d.words, settings: { ...defaultSettings(), ...d.settings } };
      save(); renderAll(); settings.close(); alert('読み込みました');
    } catch (_) { alert('ファイルの形式が正しくありません'); }
  };
  r.readAsText(file);
}

/* ---------- 初期化 ---------- */
function init(){
  for (const area of ['subject','predicate']){
    const pager = $('#pager-' + area);
    pager.addEventListener('pointerdown', onPointerDown);
    pager.addEventListener('scroll', () => { cancelPress(); renderDots(area); }, { passive: true });
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', cancelPress);
  document.addEventListener('contextmenu', e => { if (e.target.closest('.tile')) e.preventDefault(); });
  window.addEventListener('resize', renderAll);

  // セリフ
  $('#chips').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    sentence.splice(+c.dataset.i, 1); renderSentence();
  });
  $('#btn-back').onclick = () => { sentence.pop(); renderSentence(); };
  $('#btn-clear').onclick = () => { sentence = []; renderSentence(); stopSpeaking(); };

  $('#btn-speak').onclick = () => {
    if (document.body.classList.contains('speaking')) return stopSpeaking();
    speak(sentenceText());
  };
  $('#btn-random').onclick = () => {
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const s = pick(state.words.subject), p = pick(state.words.predicate);
    sentence = [s, p].filter(Boolean).map(w => ({ text: w.text, reading: w.reading, color: w.color }));
    renderSentence(); speak(sentenceText());
  };
  $('#btn-done').onclick = () => setReorder(false);

  // 編集シート
  $('#f-colors').innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('');
  $('#f-colors').onclick = e => { const b = e.target.closest('button'); if (b) setColor(b.dataset.c); };
  $('#f-area').onclick = e => { const b = e.target.closest('button'); if (b){ fArea = b.dataset.v; setSeg($('#f-area'), fArea); } };
  $('#editor-form').onsubmit = () => saveEditor();
  $('#e-cancel').onclick = () => editor.close();
  $('#e-test').onclick = () => speak($('#f-reading').value.trim() || $('#f-text').value.trim());
  $('#e-delete').onclick = () => {
    const { area, id } = editing;
    if (!confirm('このことばを削除しますか?')) return;
    state.words[area] = state.words[area].filter(w => w.id !== id);
    save(); renderAll(); editor.close();
  };
  $('#e-reorder').onclick = () => { editor.close(); setReorder(true); };

  // 設定シート
  $('#btn-settings').onclick = openSettings;
  $('#s-voice').onchange = e => { state.settings.voiceURI = e.target.value; save(); };
  $('#s-rate').oninput = e => { state.settings.rate = +e.target.value; $('#o-rate').textContent = (+e.target.value).toFixed(2); save(); };
  $('#s-pitch').oninput = e => { state.settings.pitch = +e.target.value; $('#o-pitch').textContent = (+e.target.value).toFixed(2); save(); };
  $('#s-joiner').onclick = e => { const b = e.target.closest('button'); if (b){ state.settings.joiner = b.dataset.v; setSeg($('#s-joiner'), b.dataset.v); save(); } };
  $('#s-tapspeak').onchange = e => { state.settings.tapSpeak = e.target.checked; save(); };
  $('#s-export').onclick = exportData;
  $('#s-import').onclick = () => $('#s-file').click();
  $('#s-file').onchange = e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };
  $('#s-reset').onclick = () => {
    if (!confirm('単語と設定を初期状態に戻しますか?')) return;
    state = { words: defaultWords(), settings: defaultSettings() };
    save(); renderAll(); settings.close();
  };

  if ('speechSynthesis' in window){
    loadVoices();
    speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  }
  renderAll(); renderSentence();

  if ('serviceWorker' in navigator && location.protocol === 'https:'){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
})();
