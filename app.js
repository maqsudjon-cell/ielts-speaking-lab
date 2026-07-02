/* IELTS Speaking Lab — AI Examiner (Voice + AR modes) */
(() => {
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const body = document.body;
const toastEl = $('#toast');
let toastTimer;
function toast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

/* ================= settings ================= */
let settings = store.get('ielts_settings_v1', { worker: '', key: '', tts: 'gemini', auto: 'on' });
const CHAT_MODEL = 'gemini-2.5-flash';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const TTS_VOICE = 'Kore';

async function gemini(model, payload) {
  if (settings.worker) {
    const r = await fetch(settings.worker.replace(/\/+$/, '') + '/gemini', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, payload }),
    });
    if (!r.ok) throw new Error('Worker ' + r.status + ': ' + (await r.text()).slice(0, 160));
    return r.json();
  }
  if (settings.key) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('Gemini ' + r.status + ': ' + (await r.text()).slice(0, 160));
    return r.json();
  }
  throw new Error('NO_CREDS');
}
function needCreds(e) {
  if (String(e.message).includes('NO_CREDS')) {
    toast('Connect the examiner first: add a Worker URL or API key in Settings');
    openModal('settingsModal');
    return true;
  }
  return false;
}

/* ================= data ================= */
const DATA = window.IELTS_DATA || { part1: [], part2_3: [] };
let custom = store.get('ielts_custom_v1', { p1: [], p23: [] });
let hidden = store.get('ielts_hidden_v1', []);

function allTopics(tab) {
  if (tab === 'p1') {
    const base = DATA.part1.map((t, i) => ({ id: 'd1-' + i, part: 'p1', title: t.topic, tag: t.tag, questions: t.questions }));
    const cus = custom.p1.map((t, i) => ({ id: 'c1-' + i, part: 'p1', custom: true, ...t }));
    return [...cus, ...base].filter(t => !hidden.includes(t.id));
  }
  const base = DATA.part2_3.map((t, i) => ({
    id: 'd2-' + i, part: 'p23', title: t.title, tag: t.tag,
    cue: t.cueCard, part3: t.part3,
  }));
  const cus = custom.p23.map((t, i) => ({ id: 'c2-' + i, part: 'p23', custom: true, ...t }));
  return [...cus, ...base].filter(t => !hidden.includes(t.id));
}
function topicById(id) {
  return [...allTopics('p1'), ...allTopics('p23')].find(t => t.id === id);
}

/* ================= question panel ================= */
let curTab = 'p1';
const qList = $('#qList');
function renderList() {
  const q = $('#qSearch').value.trim().toLowerCase();
  const topics = allTopics(curTab).filter(t => {
    if (!q) return true;
    const hay = [t.title, t.tag, ...(t.questions || []), t.cue?.prompt, ...(t.part3?.questions || [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
  qList.innerHTML = '';
  topics.forEach(t => {
    const el = document.createElement('div');
    el.className = 'topic';
    el.dataset.id = t.id;
    const tag = t.tag ? `<span class="tag">${esc(t.tag)}${t.custom ? ' · yours' : ''}</span>` : (t.custom ? '<span class="tag">yours</span>' : '');
    let bodyHtml = '';
    if (t.part === 'p1') {
      bodyHtml = `<ol>${(t.questions || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
    } else {
      bodyHtml = `<div class="cue"><b>${esc(t.cue?.prompt || '')}</b>${t.cue?.points?.length ? `<ul>${t.cue.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div>`;
      if (t.part3?.questions?.length) {
        bodyHtml += `<h5>Part 3 — ${esc(t.part3.theme || 'Discussion')}</h5><ol>${t.part3.questions.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
      }
    }
    el.innerHTML = `
      <div class="topic-head">
        <div class="tt">${esc(t.title)}${tag}</div>
        <button class="mini-btn play" data-start="${t.id}" title="Start with examiner">▶</button>
        <button class="mini-btn del" data-del="${t.id}" title="Remove">✕</button>
      </div>
      <div class="topic-body">${bodyHtml}</div>`;
    qList.appendChild(el);
  });
  if (!topics.length) qList.innerHTML = '<p style="color:var(--muted);text-align:center;margin-top:30px">Nothing found</p>';
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

qList.addEventListener('click', e => {
  const start = e.target.closest('[data-start]');
  const del = e.target.closest('[data-del]');
  if (start) { startTopic(start.dataset.start); return; }
  if (del) {
    const id = del.dataset.del;
    if (id.startsWith('c')) {
      const arr = id.startsWith('c1') ? custom.p1 : custom.p23;
      arr.splice(+id.split('-')[1], 1);
      store.set('ielts_custom_v1', custom);
    } else {
      hidden.push(id);
      store.set('ielts_hidden_v1', hidden);
    }
    renderList(); toast('Topic removed');
    return;
  }
  const head = e.target.closest('.topic-head');
  if (head) head.parentElement.classList.toggle('open');
});
$('#qSearch').addEventListener('input', renderList);
$$('.tab').forEach(b => b.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  curTab = b.dataset.tab;
  renderList();
}));

/* ================= session / examiner brain ================= */
const session = { active: false, topic: null, messages: [], phase: 'idle' };
const TITLES = () => [...DATA.part1.map(t => t.topic), ...DATA.part2_3.map(t => t.title)].join('; ');

function systemPrompt(topic) {
  const base = `You are a friendly but professional IELTS Speaking examiner named Aria. You speak clearly and naturally, like a real British examiner.
RULES:
- Ask ONE question at a time, then wait for the candidate's answer.
- Keep your turns SHORT (1-3 sentences). Never lecture. Occasionally give a tiny natural reaction ("Interesting.", "I see.") before the next question.
- Do not correct the candidate mid-test unless they ask. Save analysis for feedback.
- If the candidate asks you to switch to another topic, do it. Known topic names: ${TITLES()}.
- Never use emojis, markdown, or stage directions. Output plain spoken text only.`;
  if (!topic) {
    return base + `\nNo topic selected yet. Greet the candidate briefly, ask which topic or which part they want to practise (they can also pick from the on-screen list).`;
  }
  if (topic.part === 'p1') {
    return base + `\nCurrent task: IELTS Part 1 interview on "${topic.title}".
Question bank (use them in order, natural follow-ups allowed):\n${(topic.questions || []).map((q, i) => `${i + 1}. ${q}`).join('\n')}
Start by briefly greeting the candidate and asking the first question. After around 6-8 questions, thank them and suggest pressing the Feedback button (or continuing with another topic).`;
  }
  const p3 = topic.part3?.questions?.length ? `\nAfter the long turn, ask these Part 3 discussion questions one at a time:\n${topic.part3.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : '';
  return base + `\nCurrent task: IELTS Part 2 cue card, then Part 3 discussion. Topic: "${topic.title}".
Cue card: ${topic.cue?.prompt} You should say: ${(topic.cue?.points || []).join('; ')}.
FLOW: First, read the cue card to the candidate and tell them they have one minute to prepare and should press the microphone when ready. When they give their long answer, listen fully, then ask one or two short rounding-off questions, then move to Part 3.${p3}
When everything is covered, thank them and suggest the Feedback button.`;
}

async function llmReply() {
  setStatus('thinking');
  const payload = {
    system_instruction: { parts: [{ text: session.sys }] },
    contents: session.messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { temperature: 0.8, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await gemini(CHAT_MODEL, payload);
  const text = res?.candidates?.[0]?.content?.parts?.map(p => p.text).join(' ').trim();
  if (!text) throw new Error('Empty reply');
  return text;
}

async function examinerSay(text) {
  session.messages.push({ role: 'model', text });
  addBubble('examiner', text);
  $('#subExaminer').textContent = text;
  await speak(text);
  if (session.phase === 'await-prep') { startPrep(); return; }
  if (settings.auto === 'on' && session.active) startListening();
}

async function studentSaid(text) {
  if (!text.trim()) return;
  addBubble('you', text);
  $('#subYou').textContent = '';
  session.messages.push({ role: 'user', text });
  try {
    const reply = await llmReply();
    await examinerSay(reply);
  } catch (e) {
    setStatus('idle');
    if (!needCreds(e)) toast('⚠ ' + e.message, 4000);
  }
}

async function startTopic(id) {
  const t = topicById(id);
  if (!t) return;
  stopAllAudio();
  session.active = true;
  session.topic = t;
  session.sys = systemPrompt(t);
  session.messages = [{ role: 'user', text: '(The candidate is ready. Begin.)' }];
  session.phase = t.part === 'p23' ? 'await-prep' : 'test';
  $('#partChip').textContent = t.part === 'p1' ? 'Part 1 · ' + t.title : 'Part 2 & 3 · ' + t.title;
  $('#transcript').innerHTML = '';
  body.classList.remove('qpanel-open');
  try {
    const reply = await llmReply();
    await examinerSay(reply);
  } catch (e) {
    setStatus('idle');
    if (!needCreds(e)) toast('⚠ ' + e.message, 4000);
  }
}

/* Part 2 preparation countdown */
let prepTimer = null;
function startPrep() {
  session.phase = 'prep';
  let left = 60;
  const ring = $('#prepRing'), num = $('#prepNum');
  ring.classList.add('show');
  num.textContent = left;
  setStatus('idle', 'preparing');
  prepTimer = setInterval(() => {
    left--;
    num.textContent = left;
    if (left <= 0) endPrep(true);
  }, 1000);
}
function endPrep(auto) {
  if (session.phase !== 'prep') return;
  clearInterval(prepTimer);
  $('#prepRing').classList.remove('show');
  session.phase = 'test';
  if (auto) {
    speak('Your one minute is over. Please start speaking now.').then(() => startListening());
  } else {
    startListening();
  }
}

/* ================= status / transcript UI ================= */
function setStatus(state, label) {
  body.classList.remove('orb-speaking', 'orb-listening', 'orb-thinking');
  if (state !== 'idle') body.classList.add('orb-' + state);
  $('#statusTxt').textContent = label || state;
  $('#orbState').textContent = label || state;
}
function addBubble(who, text) {
  const row = document.createElement('div');
  row.className = 't-row ' + (who === 'you' ? 'you' : 'ex');
  row.innerHTML = `<div class="t-bubble"><div class="t-who">${who === 'you' ? 'You' : 'Examiner'}</div>${esc(text)}</div>`;
  const tr = $('#transcript');
  tr.appendChild(row);
  tr.scrollTop = tr.scrollHeight;
}

/* ================= TTS ================= */
let audioCtx, orbRaf, curSource, speakingFlag = false;
function ctx() { return audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); }

function orbLevelFrom(analyser) {
  const buf = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    analyser.getByteFrequencyData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i];
    const lvl = Math.min(1, (s / buf.length) / 90);
    $('#orb').style.setProperty('--level', lvl.toFixed(3));
    orbRaf = requestAnimationFrame(tick);
  };
  tick();
}
function stopOrbLevel() {
  cancelAnimationFrame(orbRaf);
  $('#orb').style.setProperty('--level', 0);
}

async function speak(text) {
  stopSpeaking();
  speakingFlag = true;
  setStatus('speaking');
  try {
    if (settings.tts === 'gemini') {
      await speakGemini(text);
    } else {
      await speakBrowser(text);
    }
  } catch (e) {
    if (speakingFlag) {  // don't fallback if user interrupted
      console.warn('TTS fallback:', e);
      try { await speakBrowser(text); } catch {}
    }
  }
  speakingFlag = false;
  stopOrbLevel();
  if (session.active) setStatus('idle', 'your turn'); else setStatus('idle');
}

async function speakGemini(text) {
  const payload = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
    },
  };
  const res = await gemini(TTS_MODEL, payload);
  const b64 = res?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error('No audio in TTS response');
  if (!speakingFlag) return;
  // decode base64 → 16-bit PCM 24kHz mono → AudioBuffer
  const bin = atob(b64);
  const pcm = new Int16Array(bin.length / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(2 * i + 1) << 8) | bin.charCodeAt(2 * i);
  const buf = ctx().createBuffer(1, pcm.length, 24000);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
  await ctx().resume();
  return new Promise(resolve => {
    const src = ctx().createBufferSource();
    src.buffer = buf;
    const analyser = ctx().createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser).connect(ctx().destination);
    orbLevelFrom(analyser);
    curSource = src;
    src.onended = () => { curSource = null; resolve(); };
    src.start();
  });
}

function speakBrowser(text) {
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    const vs = speechSynthesis.getVoices();
    u.voice = vs.find(v => /en[-_](GB|UK)/i.test(v.lang) && /female|Google|Serena|Kate|Stephanie/i.test(v.name))
      || vs.find(v => /^en[-_]/i.test(v.lang) && /Google|Samantha|Serena/i.test(v.name))
      || vs.find(v => /^en/i.test(v.lang));
    u.rate = 0.98; u.pitch = 1.02;
    let iv = setInterval(() => $('#orb').style.setProperty('--level', (0.25 + Math.random() * 0.5).toFixed(2)), 120);
    u.onend = u.onerror = () => { clearInterval(iv); resolve(); };
    speechSynthesis.speak(u);
  });
}
if ('speechSynthesis' in window) speechSynthesis.getVoices(); // warm up

function stopSpeaking() {
  speakingFlag = false;
  try { curSource?.stop(); } catch {}
  curSource = null;
  try { speechSynthesis.cancel(); } catch {}
  stopOrbLevel();
}
function stopAllAudio() {
  stopSpeaking();
  stopListening(true);
  clearInterval(prepTimer);
  $('#prepRing').classList.remove('show');
}

/* ================= STT ================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, finalText = '', silenceTimer = null;
const SILENCE_MS = 2400;

function startListening() {
  if (listening) return;
  if (!SR) { toast('Speech recognition is not supported in this browser. Use Chrome.', 4000); return; }
  if (session.phase === 'prep') { endPrep(false); return; }
  stopSpeaking();
  finalText = '';
  rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = ev => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    $('#subYou').textContent = (finalText + interim).trim().slice(-140);
    bumpSilence();
  };
  rec.onerror = ev => {
    if (ev.error === 'not-allowed') toast('Microphone permission denied', 4000);
    stopListening(true);
  };
  rec.onend = () => {
    if (listening) { // ended by silence timer or browser — submit what we have
      stopListening();
    }
  };
  try { rec.start(); } catch { return; }
  listening = true;
  $('#micBtn').classList.add('listening');
  setStatus('listening');
  bumpSilence();
}
function bumpSilence() {
  clearTimeout(silenceTimer);
  // Part 2 long turn: allow longer pauses
  const ms = session.phase === 'test' && session.topic?.part === 'p23' && session.messages.filter(m => m.role === 'user').length <= 1 ? 4000 : SILENCE_MS;
  silenceTimer = setTimeout(() => { if (listening && finalText.trim()) stopListening(); else if (listening) bumpSilence(); }, ms);
}
function stopListening(discard) {
  clearTimeout(silenceTimer);
  if (!listening) return;
  listening = false;
  $('#micBtn').classList.remove('listening');
  try { rec?.stop(); } catch {}
  rec = null;
  setStatus('idle');
  const text = finalText.trim();
  finalText = '';
  if (!discard && text) studentSaid(text);
}

/* ================= feedback ================= */
async function getFeedback() {
  const answers = session.messages.filter(m => m.role === 'user' && !m.text.startsWith('('));
  if (!answers.length) { toast('Answer at least one question first'); return; }
  openModal('fbModal');
  $('#fbBody').innerHTML = '<p class="sub">The examiner is analysing your answers…</p>';
  const convo = session.messages.filter(m => !m.text.startsWith('(')).map(m => (m.role === 'user' ? 'CANDIDATE: ' : 'EXAMINER: ') + m.text).join('\n');
  const payload = {
    system_instruction: { parts: [{ text: 'You are a senior IELTS Speaking examiner giving feedback to a candidate after a practice session. Be encouraging but honest and specific. Note: the transcript comes from speech recognition, so ignore punctuation/casing and likely mis-transcriptions; do not judge pronunciation or spelling from it.' }] },
    contents: [{ role: 'user', parts: [{ text: `Here is the transcript of my IELTS speaking practice:\n\n${convo}\n\nGive me feedback in this exact format:\nBAND: <estimated band, e.g. 6.5>\n\n## Fluency & Coherence\n<2-3 sentences>\n\n## Lexical Resource\n<2-3 sentences, mention good words I used and suggest 3 stronger alternatives>\n\n## Grammar\n<2-3 sentences, quote 1-2 of my sentences and show the corrected version>\n\n## Top 3 improvements\n1. ...\n2. ...\n3. ...` }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  };
  try {
    const res = await gemini(CHAT_MODEL, payload);
    const text = res?.candidates?.[0]?.content?.parts?.map(p => p.text).join(' ') || 'No feedback returned.';
    $('#fbBody').innerHTML = renderFeedback(text);
  } catch (e) {
    $('#fbBody').innerHTML = `<p class="sub">⚠ ${esc(e.message)}</p>`;
    needCreds(e);
  }
}
function renderFeedback(md) {
  let h = esc(md);
  h = h.replace(/^BAND:\s*(.+)$/m, '<div style="text-align:center"><div class="band">Band $1</div></div>');
  h = h.replace(/^## (.+)$/gm, '<h4>$1</h4>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/&quot;([^&]{8,}?)&quot;/g, '<em>“$1”</em>');
  h = h.replace(/^(\d+)\. (.+)$/gm, '<p><strong>$1.</strong> $2</p>');
  h = h.split(/\n{2,}/).map(p => p.startsWith('<') ? p : `<p>${p}</p>`).join('');
  return h;
}

/* ================= media capture ================= */
let camStream = null, micStream = null;
let vidRecorder = null, audRecorder = null;

async function ensureMic() {
  if (!micStream) micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return micStream;
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function takePhoto() {
  const v = $('#cam');
  if (!v.videoWidth) { toast('Camera is not ready'); return; }
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext('2d');
  g.translate(c.width, 0); g.scale(-1, 1);
  g.drawImage(v, 0, 0);
  c.toBlob(b => { download(b, `ielts-photo-${stamp()}.png`); toast('📸 Photo saved'); }, 'image/png');
}

async function toggleVideoRec(btn) {
  if (vidRecorder) {
    vidRecorder.stop(); vidRecorder = null;
    btn.classList.remove('rec-on');
    return;
  }
  if (!camStream) { toast('Camera is not ready'); return; }
  try { await ensureMic(); } catch { toast('Microphone needed for video'); return; }
  const mix = new MediaStream([...camStream.getVideoTracks(), ...micStream.getAudioTracks()]);
  const mime = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  const chunks = [];
  vidRecorder = new MediaRecorder(mix, { mimeType: mime });
  vidRecorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  vidRecorder.onstop = () => {
    download(new Blob(chunks, { type: mime }), `ielts-video-${stamp()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`);
    toast('🎥 Video saved');
  };
  vidRecorder.start();
  btn.classList.add('rec-on');
  toast('Recording video… press again to stop');
}

async function toggleAudioRec(btn) {
  if (audRecorder) {
    audRecorder.stop(); audRecorder = null;
    btn.classList.remove('rec-on');
    return;
  }
  try { await ensureMic(); } catch { toast('Microphone permission needed'); return; }
  const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m));
  const chunks = [];
  audRecorder = new MediaRecorder(micStream, { mimeType: mime });
  audRecorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  audRecorder.onstop = () => {
    download(new Blob(chunks, { type: mime }), `ielts-audio-${stamp()}.${mime.includes('mp4') ? 'm4a' : 'webm'}`);
    toast('⏺ Audio saved');
  };
  audRecorder.start();
  btn.classList.add('rec-on');
  toast('Recording audio… press again to stop');
}

/* ================= AR: camera + hand gestures ================= */
let handLandmarker = null, gestureRaf = null, lastVideoTime = -1;
const cursor = $('#gcursor');
const hintEl = $('#gestureHint');
let smooth = { x: innerWidth / 2, y: innerHeight / 2 };
let pinch = { on: false, startX: 0, startY: 0, lastY: 0, moved: 0, t: 0 };
let holdState = { gesture: null, since: 0, cooldown: 0 };

async function startCamera() {
  camStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  const v = $('#cam');
  v.srcObject = camStream;
  await v.play();
}
function stopCamera() {
  camStream?.getTracks().forEach(t => t.stop());
  camStream = null;
  $('#cam').srcObject = null;
}

async function initHands() {
  showHint('Loading gesture engine…');
  try {
    const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
    const files = await mp.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    handLandmarker = await mp.HandLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
    });
    showHint('🖐 Show your hand · 👌 pinch = tap', 3500);
    gestureLoop();
  } catch (e) {
    console.warn('MediaPipe failed', e);
    showHint('');
    toast('Gestures unavailable — use touch instead', 3500);
  }
}
let hintTimer;
function showHint(txt, ms) {
  hintEl.textContent = txt;
  hintEl.classList.toggle('show', !!txt);
  clearTimeout(hintTimer);
  if (ms) hintTimer = setTimeout(() => hintEl.classList.remove('show'), ms);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function mapToScreen(lm) {
  const v = $('#cam');
  const vw = innerWidth, vh = innerHeight;
  const scale = Math.max(vw / v.videoWidth, vh / v.videoHeight);
  const dw = v.videoWidth * scale, dh = v.videoHeight * scale;
  const ox = (vw - dw) / 2, oy = (vh - dh) / 2;
  return { x: vw - (lm.x * v.videoWidth * scale + ox), y: lm.y * v.videoHeight * scale + oy };
}

function fingersExtended(lm) {
  // tip further from wrist than pip → extended (works for generic orientations)
  const w = lm[0];
  const ext = [];
  [[8, 6], [12, 10], [16, 14], [20, 18]].forEach(([tip, pip]) => {
    ext.push(dist(lm[tip], w) > dist(lm[pip], w) * 1.12);
  });
  return ext; // [index, middle, ring, pinky]
}

function gestureLoop() {
  const v = $('#cam');
  const step = () => {
    if (body.dataset.mode !== 'ar' || body.dataset.screen !== 'app') { cursor.style.display = 'none'; return; }
    gestureRaf = requestAnimationFrame(step);
    if (!handLandmarker || !v.videoWidth || v.currentTime === lastVideoTime) return;
    lastVideoTime = v.currentTime;
    const res = handLandmarker.detectForVideo(v, performance.now());
    const lm = res?.landmarks?.[0];
    if (!lm) { cursor.style.display = 'none'; endPinch(); holdState.gesture = null; return; }

    const ref = dist(lm[0], lm[9]); // palm size for scale-invariant thresholds
    const idxTip = lm[8], thumbTip = lm[4];
    const mid = { x: (idxTip.x + thumbTip.x) / 2, y: (idxTip.y + thumbTip.y) / 2 };
    const p = mapToScreen(mid);
    smooth.x += (p.x - smooth.x) * 0.35;
    smooth.y += (p.y - smooth.y) * 0.35;
    cursor.style.display = 'block';
    cursor.style.left = smooth.x + 'px';
    cursor.style.top = smooth.y + 'px';

    const pinchDist = dist(idxTip, thumbTip) / ref;
    const ext = fingersExtended(lm);
    const now = performance.now();

    /* --- pinch: tap / drag-scroll --- */
    if (!pinch.on && pinchDist < 0.38) beginPinch(now);
    else if (pinch.on && pinchDist > 0.52) endPinch(true);
    if (pinch.on) {
      const dy = smooth.y - pinch.lastY;
      pinch.moved += Math.abs(smooth.x - pinch.startX) + Math.abs(dy);
      pinch.lastY = smooth.y;
      // drag over the question list scrolls it
      const overList = document.elementFromPoint(smooth.x, smooth.y)?.closest('#qList');
      if (overList && Math.abs(dy) > 1) overList.scrollTop -= dy * 2.2;
    }

    /* --- hold gestures (only when not pinching) --- */
    if (!pinch.on) {
      const allExt = ext.every(Boolean);
      const noneExt = ext.every(x => !x);
      const g = allExt ? 'palm' : (noneExt ? 'fist' : null);
      if (g !== holdState.gesture) { holdState.gesture = g; holdState.since = now; }
      else if (g && now - holdState.since > 750 && now > holdState.cooldown) {
        holdState.cooldown = now + 1800;
        if (g === 'palm') {
          body.classList.toggle('qpanel-open');
          showHint(body.classList.contains('qpanel-open') ? '🖐 Questions opened' : '🖐 Questions closed', 1600);
        } else {
          stopAllAudio();
          showHint('✊ Stopped', 1400);
        }
      }
    }
  };
  step();
}
function beginPinch(now) {
  pinch = { on: true, startX: smooth.x, startY: smooth.y, lastY: smooth.y, moved: 0, t: now };
  cursor.classList.add('pinch');
}
function endPinch(commit) {
  if (!pinch.on) return;
  cursor.classList.remove('pinch');
  const wasTap = commit && pinch.moved < 24 && performance.now() - pinch.t < 900;
  pinch.on = false;
  if (!wasTap) return;
  const el = document.elementFromPoint(smooth.x, smooth.y);
  const target = el?.closest('button, .topic-head, .tab, [data-act]');
  if (target) {
    target.click();
    showHint('👌 Tap', 900);
  }
}

/* ================= modals & actions ================= */
function openModal(id) { $('#' + id).classList.add('open'); }
function closeModals() { $$('.modal-veil').forEach(m => m.classList.remove('open')); }
$$('.modal-veil').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModals(); }));

$$('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('button', seg).forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  if (seg.id === 'addPart') {
    const p23 = b.dataset.v === 'p23';
    $('#addCueRow').style.display = p23 ? '' : 'none';
    $('#addQLabel').textContent = p23 ? 'Part 3 questions (one per line)' : 'Questions (one per line)';
  }
}));

function loadSettingsUI() {
  $('#setWorker').value = settings.worker || '';
  $('#setKey').value = settings.key || '';
  $$('#setTts button').forEach(b => b.classList.toggle('active', b.dataset.v === settings.tts));
  $$('#setAuto button').forEach(b => b.classList.toggle('active', b.dataset.v === settings.auto));
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  switch (act) {
    case 'settings': loadSettingsUI(); openModal('settingsModal'); break;
    case 'close-modal': closeModals(); break;
    case 'save-settings': {
      settings.worker = $('#setWorker').value.trim();
      settings.key = $('#setKey').value.trim();
      settings.tts = $('#setTts .active')?.dataset.v || 'gemini';
      settings.auto = $('#setAuto .active')?.dataset.v || 'on';
      store.set('ielts_settings_v1', settings);
      closeModals(); toast('Settings saved');
      break;
    }
    case 'toggle-questions': body.classList.toggle('qpanel-open'); break;
    case 'add-topic': openModal('addModal'); break;
    case 'save-topic': {
      const part = $('#addPart .active')?.dataset.v || 'p1';
      const title = $('#addTitle').value.trim();
      const qs = $('#addQs').value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!title) { toast('Give the topic a title'); return; }
      if (part === 'p1') {
        if (!qs.length) { toast('Add at least one question'); return; }
        custom.p1.unshift({ title: title.toUpperCase(), tag: 'Custom', questions: qs });
      } else {
        const cue = $('#addCue').value.trim();
        if (!cue) { toast('Add the cue card text'); return; }
        custom.p23.unshift({ title: title.toUpperCase(), tag: 'Custom', cue: { prompt: cue, points: [] }, part3: { theme: title, questions: qs } });
      }
      store.set('ielts_custom_v1', custom);
      $('#addTitle').value = ''; $('#addQs').value = ''; $('#addCue').value = '';
      curTab = part;
      $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === part));
      renderList(); closeModals(); toast('Topic added ✓');
      break;
    }
    case 'mic':
      if (listening) stopListening();
      else startListening();
      break;
    case 'feedback': getFeedback(); break;
    case 'photo': takePhoto(); break;
    case 'video': toggleVideoRec(btn); break;
    case 'audio': toggleAudioRec(btn); break;
    case 'exit': exitToLanding(); break;
  }
});

/* ================= mode switching ================= */
async function enterMode(mode) {
  body.dataset.mode = mode;
  body.dataset.screen = 'app';
  $('#partChip').textContent = 'Pick a topic →';
  setStatus('idle', 'ready');
  body.classList.add('qpanel-open');
  renderList();
  if (mode === 'ar') {
    try {
      await startCamera();
    } catch {
      toast('Camera permission is needed for AR mode', 4000);
      exitToLanding();
      return;
    }
    initHands();
  }
  // free-chat session so the student can just talk
  session.active = true;
  session.topic = null;
  session.sys = systemPrompt(null);
  session.messages = [];
  session.phase = 'test';
}
function exitToLanding() {
  stopAllAudio();
  stopCamera();
  cancelAnimationFrame(gestureRaf);
  if (vidRecorder) { try { vidRecorder.stop(); } catch {} vidRecorder = null; }
  if (audRecorder) { try { audRecorder.stop(); } catch {} audRecorder = null; }
  session.active = false;
  body.dataset.screen = 'landing';
  body.classList.remove('qpanel-open', 'orb-speaking', 'orb-listening', 'orb-thinking');
  $('#transcript').innerHTML = '';
  $('#subExaminer').textContent = '';
  $('#subYou').textContent = '';
}
$$('[data-pick]').forEach(b => b.addEventListener('click', () => enterMode(b.dataset.pick)));

/* ================= init ================= */
$('#qCount').textContent = `${DATA.part1.length} Part 1 topics · ${DATA.part2_3.length} cue cards`;
renderList();
if (!settings.worker && !settings.key) {
  setTimeout(() => toast('Tip: open ⚙ Settings to connect the AI examiner', 4500), 1200);
}
})();
