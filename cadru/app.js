/* Asistent de cadru — ghidează vocal o persoană nevăzătoare să se încadreze corect în cameră.
   Totul rulează pe telefon (MediaPipe în browser). Nimic nu pleacă de pe telefon. */
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = {
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  object: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite'
};
const $ = s => document.querySelector(s);
const REF_KEY = 'cadru-studio-ref';

/* ---------------- texte ---------------- */
const OBJ_RO = { bottle: 'o sticlă', cup: 'o cană', 'wine glass': 'un pahar', 'cell phone': 'un telefon', remote: 'o telecomandă', book: 'o carte', chair: 'un scaun', couch: 'o canapea', bed: 'un pat',
  'potted plant': 'o plantă', tv: 'un televizor', laptop: 'un laptop', mouse: 'un mouse', keyboard: 'o tastatură', backpack: 'un rucsac', handbag: 'o geantă', suitcase: 'o valiză', umbrella: 'o umbrelă',
  clock: 'un ceas', vase: 'o vază', scissors: 'o foarfecă', 'teddy bear': 'o jucărie de pluș', 'hair drier': 'un uscător de păr', toothbrush: 'o periuță', bowl: 'un bol', banana: 'o banană', apple: 'un măr',
  orange: 'o portocală', sandwich: 'un sandviș', 'dining table': 'o masă', toilet: 'o toaletă', sink: 'o chiuvetă', refrigerator: 'un frigider', oven: 'un cuptor', microwave: 'un cuptor cu microunde',
  cat: 'o pisică', dog: 'un câine', bird: 'o pasăre', tie: 'o cravată', 'sports ball': 'o minge', knife: 'un cuțit', fork: 'o furculiță', spoon: 'o lingură', bench: 'o bancă', bicycle: 'o bicicletă' };
const objName = c => OBJ_RO[c] || c;

/* ---------------- stare ---------------- */
let mode = 'head', facing = 'user', running = false, stream = null;
let pose = null, hands = null, objects = null, vision = null;
let lastPose = null, lastHands = null, lastObjects = [], lastLight = null, tiltDeg = null;
let lastSaid = '', lastSaidAt = 0, okSince = 0, okAnnounced = false, lastDet = 0, lastObjAt = 0;
let studioRef = null; try { studioRef = JSON.parse(localStorage.getItem(REF_KEY) || 'null'); } catch (e) {}
let wakeLock = null;

/* ---------------- vorbire ---------------- */
let muted = false;
function say(text, force = false, auto = false) {
  const now = Date.now();
  if (auto && muted) { $('#status').textContent = text; return; }
  if (!force && text === lastSaid && now - lastSaidAt < 6000) return;
  if (!force && now - lastSaidAt < 1800) return;
  lastSaid = text; lastSaidAt = now;
  $('#status').textContent = text;
  if (useVoice() && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ro-RO'; u.rate = 1.1;
    micPause(true);
    u.onend = u.onerror = () => setTimeout(() => micPause(false), 250);
    speechSynthesis.speak(u);
  } else {
    const el = $('#say'); el.textContent = ''; setTimeout(() => { el.textContent = text; }, 60);
  }
}
const useVoice = () => $('#optVoice').checked || $('#optMic').checked;
let actx = null;
function chime() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 1320].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(actx.destination);
      const t0 = actx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.start(t0); o.stop(t0 + 0.3);
    });
  } catch (e) {}
}

/* ---------------- logica de încadrare (funcție pură, testabilă) ----------------
   Coordonate normalizate 0..1 față de imaginea camerei. Camera privește spre utilizator,
   deci ce e în stânga imaginii este în dreapta lui. Indicațiile sunt din perspectiva utilizatorului. */
const amount = d => d > 0.25 ? 'mult ' : d > 0.1 ? '' : 'puțin ';
function vis(p, i, min = 0.5) { return p && p[i] && (p[i].visibility ?? 1) >= min && p[i].x > -0.05 && p[i].x < 1.05 && p[i].y > -0.05 && p[i].y < 1.05; }
function guide(m, P, H, opts = {}) {
  const portrait = opts.portrait !== false;
  const msgs = [];
  let box = null;           // zona subiectului: {l,r,t,b}
  let need = [];            // ce părți trebuie să se vadă
  if (m === 'hands') {
    if (!H || !H.length) return { ok: false, msgs: ['Nu îți văd mâinile. Pune mâinile în fața camerei sau mută telefonul spre ele.'], box };
    const pts = H.flat();
    box = { l: Math.min(...pts.map(p => p.x)), r: Math.max(...pts.map(p => p.x)), t: Math.min(...pts.map(p => p.y)), b: Math.max(...pts.map(p => p.y)) };
    const pad = (box.r - box.l) * 0.12;
    box = { l: box.l - pad, r: box.r + pad, t: box.t - pad, b: box.b + pad };
    if (H.length === 1 && opts.wantTwoHands !== false) msgs.push('Văd o singură mână.');
    return finish(m, box, msgs, { minW: 0.45, maxW: 0.88 });
  }
  if (!P) return { ok: false, msgs: ['Nu te văd. Verifică dacă e camera potrivită și dacă telefonul e îndreptat spre tine.'], box };
  const eyes = [2, 5].filter(i => vis(P, i, 0.3)).map(i => P[i]);
  const sh = [11, 12].filter(i => vis(P, i)).map(i => P[i]);
  const hips = [23, 24].filter(i => vis(P, i)).map(i => P[i]);
  const feet = [27, 28, 29, 30, 31, 32].filter(i => vis(P, i, 0.4)).map(i => P[i]);
  const nose = vis(P, 0, 0.3) ? P[0] : null;
  const head = eyes.length ? eyes : nose ? [nose] : [];
  if (!head.length && !sh.length) return { ok: false, msgs: ['Nu te văd. Verifică dacă e camera potrivită și dacă telefonul e îndreptat spre tine.'], box };
  const avg = a => a.reduce((s, p) => s + p, 0) / a.length;
  const eyeY = head.length ? avg(head.map(p => p.y)) : null;
  const shY = sh.length ? avg(sh.map(p => p.y)) : null;
  const span = eyeY != null && shY != null ? Math.max(0.03, shY - eyeY) : 0.12;
  const topY = eyeY != null ? eyeY - span * 0.6 : (shY - 0.25);
  const xs = [...head, ...sh, ...(m === 'head' ? [] : hips)].map(p => p.x);
  let bottom;
  if (m === 'head') { bottom = (shY ?? eyeY + 0.2) + span * 0.35; need = ['nu ți se văd umerii']; }
  else if (m === 'waist' || m === 'side') { bottom = hips.length ? avg(hips.map(p => p.y)) + span * 0.25 : 1.08; need = ['nu ți se vede talia']; }
  else { bottom = feet.length ? Math.max(...feet.map(p => p.y)) + 0.02 : 1.08; need = ['nu ți se văd picioarele']; }
  const cx = xs.length ? avg(xs) : 0.5;
  const halfW = m === 'head' ? Math.max(span * 1.4, sh.length === 2 ? Math.abs(sh[0].x - sh[1].x) * 0.7 : 0.1) : Math.max(span * 1.2, 0.08);
  box = { l: cx - halfW, r: cx + halfW, t: topY, b: bottom };
  // ce lipsește de jos
    const target = { head: { minH: 0.45, maxH: 0.82 }, waist: { minH: 0.62, maxH: 0.9 }, side: { minH: 0.6, maxH: 0.9 }, full: { minH: 0.7, maxH: 0.95 } }[m];
  return finish(m, box, msgs, target, need, portrait);
}
function finish(m, box, msgs, target, need = [], portrait = true) {
  const top = box.t, bot = box.b, left = box.l, right = box.r;
  const h = bot - top, w = right - left, cx = (left + right) / 2, cy = (top + bot) / 2;
  const cutTop = top < 0.02, cutBot = bot > 0.98, cutL = left < 0.02, cutR = right > 0.98;
  const subject = m === 'hands' ? 'mâinile' : 'tu';
  // prea aproape: tăiat în ambele părți sau prea mare
  if ((cutTop && cutBot) || (cutTop && cutL && cutR) || (target.maxH && h > 1.02) || (target.maxW && w > 1.02)) {
    msgs.unshift(m === 'hands' ? 'Mâinile nu încap. Depărtează telefonul.' : 'Ești prea aproape. Depărtează telefonul sau fă un pas înapoi.');
    return { ok: false, msgs, box };
  }
  if (cutTop) msgs.push(m === 'hands' ? 'Partea de sus a mâinilor iese din cadru. Ridică puțin telefonul sau înclină-l în sus.' : 'Ți se taie capul. Ridică telefonul sau înclină-l puțin în sus.');
  else if (cutBot) msgs.push(m === 'hands' ? 'Partea de jos a mâinilor iese din cadru. Coboară puțin telefonul.' : `${(need[0] || 'nu te văd întreg').replace(/^n/, 'N')}. Coboară telefonul, înclină-l în jos sau depărtează-l.`);
  if (cutL && !cutR) msgs.push(`${m === 'hands' ? 'Mâinile ies' : 'Ieși'} din cadru în partea ta dreaptă. Mută telefonul spre dreapta ta.`);
  else if (cutR && !cutL) msgs.push(`${m === 'hands' ? 'Mâinile ies' : 'Ieși'} din cadru în partea ta stângă. Mută telefonul spre stânga ta.`);
  else if (cutL && cutR) msgs.push(m === 'hands' ? 'Mâinile nu încap pe lățime. Depărtează telefonul.' : 'Nu încapi pe lățime. Depărtează telefonul.');
  if (!msgs.length) {
    // centrare
    const dx = cx - 0.5;
    if (Math.abs(dx) > 0.08) msgs.push(`Mută telefonul ${amount(Math.abs(dx))}spre ${dx < 0 ? 'dreapta' : 'stânga'} ta.`);
    // spațiu deasupra capului / poziție verticală
    if (m !== 'hands') {
      if (top > 0.2 && bot < 0.9) msgs.push(`Ai prea mult spațiu deasupra capului. Coboară ${amount(top - 0.12)}telefonul sau înclină-l în jos.`);
      else if (top < 0.04) msgs.push('Ai prea puțin spațiu deasupra capului. Ridică puțin telefonul.');
    } else {
      const dy = cy - 0.5;
      if (Math.abs(dy) > 0.1) msgs.push(`${dy < 0 ? 'Ridică' : 'Coboară'} ${amount(Math.abs(dy))}telefonul.`);
    }
    // distanță
    if (target.minH && h < target.minH) msgs.push(`Ești ${h < target.minH - 0.2 ? 'mult ' : ''}prea departe. Apropie telefonul.`);
    if (target.minW && w < target.minW) msgs.push(`Mâinile sunt prea mici în cadru. Apropie telefonul.`);
    if (target.maxH && h > target.maxH && !(top < 0.04)) msgs.push('Ești puțin prea aproape. Depărtează puțin telefonul.');
  }
  const blocking = msgs.filter(x => !/^Văd o singură/.test(x));
  return { ok: blocking.length === 0, msgs, box };
}
window.__guide = guide;   // pentru teste

/* ---------------- obiecte ---------------- */
function objPlace(b, W, H) {
  const cx = (b.originX + b.width / 2) / W, cy = (b.originY + b.height / 2) / H;
  const side = cx < 0.33 ? 'în dreapta ta' : cx > 0.67 ? 'în stânga ta' : 'în mijloc';
  const vert = cy < 0.33 ? 'sus' : cy > 0.67 ? 'jos' : '';
  return (side + (vert ? ', ' + vert : '')).replace('în mijloc, ', '').replace(/^în mijloc$/, 'în mijloc');
}
function overlapsBox(b, box, W, H) {
  if (!box) return false;
  const l = b.originX / W, r = (b.originX + b.width) / W, t = b.originY / H, bt = (b.originY + b.height) / H;
  const ix = Math.max(0, Math.min(r, box.r) - Math.max(l, box.l)), iy = Math.max(0, Math.min(bt, box.b) - Math.max(t, box.t));
  return ix * iy > 0.6 * (r - l) * (bt - t);
}
function inStudioRef(name, b, W, H) {
  if (!studioRef) return false;
  const cx = (b.originX + b.width / 2) / W, cy = (b.originY + b.height / 2) / H;
  return studioRef.some(o => o.name === name && Math.abs(o.cx - cx) < 0.15 && Math.abs(o.cy - cy) < 0.15);
}
function strayObjects(box, W, H) {
  return lastObjects.filter(d => {
    const c = d.categories[0]; if (!c || c.score < 0.45) return false;
    const n = c.categoryName; if (n === 'person') return false;
    if (overlapsBox(d.boundingBox, box, W, H)) return false;
    return !inStudioRef(n, d.boundingBox, W, H);
  }).map(d => `${objName(d.categories[0].categoryName)} ${objPlace(d.boundingBox, W, H)}`);
}

/* ---------------- lumină și înclinare ---------------- */
const lc = document.createElement('canvas'); lc.width = 48; lc.height = 48;
function measureLight(video, box) {
  try {
    const g = lc.getContext('2d', { willReadFrequently: true }); g.drawImage(video, 0, 0, 48, 48);
    const d = g.getImageData(0, 0, 48, 48).data;
    let all = 0, n = 0, sub = 0, sn = 0;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const i = (y * 48 + x) * 4, L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      all += L; n++;
      if (box && x / 48 > box.l && x / 48 < box.r && y / 48 > box.t && y / 48 < box.b) { sub += L; sn++; }
    }
    return { all: all / n, subj: sn ? sub / sn : null };
  } catch (e) { return null; }
}
function lightMsg(L) {
  if (!L) return null;
  if (L.all < 45) return 'E prea întuneric. Pornește ring light-ul sau mărește lumina.';
  if (L.subj != null && L.all > 70 && L.subj < L.all * 0.6) return 'Lumina vine din spatele tău, apari întunecat. Întoarce-te spre lumină sau mută lampa în față.';
  if (L.all > 235) return 'Imaginea e prea luminoasă. Micșorează lumina.';
  return null;
}
function onMotion(e) {
  const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
  const portrait = Math.abs(g.y) >= Math.abs(g.x);
  const a = portrait ? Math.atan2(g.x, Math.abs(g.y)) : Math.atan2(g.y, Math.abs(g.x));
  tiltDeg = Math.round(a * 180 / Math.PI);
}

/* ---------------- încărcare modele ---------------- */
async function loadModels() {
  const m = await import(`${MP}/vision_bundle.mjs`);
  vision = vision || await m.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const mk = async (Cls, path, extra) => {
    for (const delegate of ['GPU', 'CPU']) {
      try { return await Cls.createFromOptions(vision, { baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', ...extra }); } catch (e) { if (delegate === 'CPU') throw e; }
    }
  };
  if (mode === 'hands') { if (!hands) hands = await mk(m.HandLandmarker, MODELS.hand, { numHands: 2 }); }
  else if (!pose) pose = await mk(m.PoseLandmarker, MODELS.pose, { numPoses: 1 });
  if ($('#optObjects').checked && !objects) objects = await mk(m.ObjectDetector, MODELS.object, { scoreThreshold: 0.4, maxResults: 8 });
}

/* ---------------- bucla principală ---------------- */
const video = $('#video'), overlay = $('#overlay');
function loop() {
  if (!running) return;
  requestAnimationFrame(loop);
  const now = performance.now();
  if (video.readyState < 2 || now - lastDet < 200) return;
  lastDet = now;
  const W = video.videoWidth, H = video.videoHeight;
  try {
    if (mode === 'hands' && hands) { const r = hands.detectForVideo(video, now); lastHands = r.landmarks && r.landmarks.length ? r.landmarks : null; }
    else if (pose) { const r = pose.detectForVideo(video, now); lastPose = r.landmarks && r.landmarks[0] ? r.landmarks[0] : null; }
    if (objects && now - lastObjAt > 1500) { lastObjAt = now; lastObjects = objects.detectForVideo(video, now).detections || []; }
  } catch (e) { return; }
  const g = guide(mode, lastPose, lastHands, { portrait: H >= W });
  draw(g.box, W, H);
  if (now % 1000 < 220) lastLight = measureLight(video, g.box);
  const extra = [];
  const lm = lightMsg(lastLight); if (lm) extra.push(lm);
  if (tiltDeg != null && Math.abs(tiltDeg) >= 4) extra.push(`Telefonul e strâmb cu ${Math.abs(tiltDeg)} grade. Rotește-l încet până îți spun că e drept.`);
  const stray = $('#optObjects').checked ? strayObjects(g.box, W, H) : [];
  $('#details').textContent = [g.msgs.join(' '), ...extra, stray.length ? 'În cadru: ' + stray.join('; ') + '.' : ''].filter(Boolean).join('\n');
  if (!g.ok) { okSince = 0; if (okAnnounced) { okAnnounced = false; } say(g.msgs[0], false, true); $('#status').classList.remove('ok'); return; }
  if (extra.length) { okSince = 0; say(extra[0], false, true); return; }
  if (!okSince) okSince = now;
  if (now - okSince > 1200 && !okAnnounced) {
    okAnnounced = true; chime();
    say('Perfect, ești bine încadrat. Nu mai mișca telefonul.' + (stray.length ? ' Atenție, în cadru apare ' + stray.join(', ') + '.' : ''), true);
    $('#status').classList.add('ok');
  } else if (okAnnounced && stray.length && Date.now() - lastSaidAt > 15000) say('În cadru apare ' + stray.join(', ') + '.', false, true);
}
function draw(box, W, H) {
  overlay.width = video.clientWidth; overlay.height = video.clientHeight;
  const c = overlay.getContext('2d'); c.clearRect(0, 0, overlay.width, overlay.height);
  if (!box) return;
  c.strokeStyle = okAnnounced ? '#30D158' : '#FFD60A'; c.lineWidth = 3;
  c.strokeRect(box.l * overlay.width, box.t * overlay.height, (box.r - box.l) * overlay.width, (box.b - box.t) * overlay.height);
}

/* ---------------- descriere completă ---------------- */
function describe() {
  const W = video.videoWidth, H = video.videoHeight;
  const parts = [];
  parts.push(H >= W ? 'Telefonul e vertical.' : 'Telefonul e orizontal.');
  if (mode === 'hands') parts.push(lastHands ? `Văd ${lastHands.length === 1 ? 'o mână' : 'ambele mâini'}.` : 'Nu văd mâinile.');
  else if (lastPose) {
    const seen = [];
    if (vis(lastPose, 0, 0.3)) seen.push('fața');
    if (vis(lastPose, 11) || vis(lastPose, 12)) seen.push('umerii');
    if (vis(lastPose, 15) || vis(lastPose, 16)) seen.push('mâinile');
    if (vis(lastPose, 23) || vis(lastPose, 24)) seen.push('talia');
    if (vis(lastPose, 25) || vis(lastPose, 26)) seen.push('genunchii');
    if (vis(lastPose, 27) || vis(lastPose, 28)) seen.push('picioarele');
    parts.push(seen.length ? 'Se văd: ' + seen.join(', ') + '.' : 'Te văd doar parțial.');
  } else parts.push('Nu văd nicio persoană.');
  const g = guide(mode, lastPose, lastHands, { portrait: H >= W });
  parts.push(g.ok ? 'Încadrarea e bună.' : g.msgs.join(' '));
  const lm = lightMsg(lastLight); parts.push(lm || 'Lumina e bună.');
  if (tiltDeg != null) parts.push(Math.abs(tiltDeg) < 4 ? 'Telefonul e drept.' : `Telefonul e strâmb cu ${Math.abs(tiltDeg)} grade.`);
  const stray = strayObjects(g.box, W, H);
  const all = lastObjects.filter(d => d.categories[0] && d.categories[0].categoryName !== 'person' && d.categories[0].score >= 0.45).map(d => objName(d.categories[0].categoryName));
  parts.push(stray.length ? 'Obiecte care nu sunt din studio: ' + stray.join('; ') + '.' : all.length ? 'Obiectele văzute fac parte din studioul învățat.' : 'Nu văd alte obiecte.');
  say(parts.join(' '), true);
}


/* ---------------- comenzi vocale: întrebi, aplicația răspunde imediat ---------------- */
let rec = null, micOn = false, micPaused = false, lastHeard = '';
const norm = x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function micPause(p) {
  micPaused = p;
  if (!rec || !micOn) return;
  try { if (p) rec.abort(); else rec.start(); } catch (e) {}
}
function current() {
  const W = video.videoWidth, H = video.videoHeight;
  const g = guide(mode, lastPose, lastHands, { portrait: H >= W });
  return { g, W, H, light: lightMsg(lastLight), stray: strayObjects(g.box, W, H) };
}
function score(c) {
  let sc = 100;
  if (!c.g.box) return 0;
  c.g.msgs.forEach((m, i) => { if (/^Văd o singură/.test(m)) return; sc -= /taie|ies|Ieși|Nu ți se|nu încap|Nu încapi|prea aproape\. Dep/.test(m) ? 35 : 15; });
  if (c.light) sc -= 15;
  if (tiltDeg != null && Math.abs(tiltDeg) >= 4) sc -= Math.min(20, Math.abs(tiltDeg));
  sc -= Math.min(20, c.stray.length * 7);
  return Math.max(0, Math.min(100, sc));
}
const MODES = { head: 'cap și umeri', waist: 'până la talie', full: 'tot corpul', side: 'din lateral', hands: 'doar mâinile' };
async function setMode(m) {
  mode = m; okSince = 0; okAnnounced = false; lastPose = null; lastHands = null;
  say('Am trecut pe ' + MODES[m] + '.', true);
  try { await loadModels(); } catch (e) { say('Nu am putut încărca recunoașterea pentru acest mod.', true); }
}
function answer(raw) {
  const q = norm(raw); if (!q) return;
  const has = (...w) => w.some(x => q.includes(x));
  const c = current();
  if (has('ajutor', 'ce pot', 'comenzi')) return say('Poți întreba: ce se vede, în ce direcție mut camera, cât de bine mă văd, e ceva nepotrivit, ce e în cadru, cum e lumina, e drept telefonul. Pentru alt mod spui: mod cap și umeri, mod talie, mod tot corpul, mod lateral sau mod mâini. Mai poți spune: învață studioul, uită studioul, repetă, liniște, vorbește, oprește.', true);
  if (has('repeta', 'ce ai zis', 'inca o data')) return say(lastSaid || 'Nu am spus nimic încă.', true);
  if (has('liniste', 'taci', 'gata cu indicatiile', 'nu mai vorbi')) { muted = true; return say('Bine, tac. Îmi poți pune oricând întrebări. Spune „vorbește” ca să reiau indicațiile.', true); }
  if (has('vorbeste', 'reia', 'continua')) { muted = false; okAnnounced = false; return say('Reiau indicațiile.', true); }
  if (has('opreste', 'stop', 'inchide')) { say('Opresc.', true); return setTimeout(stop, 800); }
  if (has('uita studio')) { $('#forget').click(); return; }
  if (has('invata studio', 'memoreaza studio', 'studioul gol')) return learnStudio();
  const sw = q.startsWith('mod ') || has('treci pe', 'schimba pe', 'modul ', 'trece pe');
  const exact = p => q === p || q === 'mod ' + p;
  if (sw || exact('cap si umeri') || exact('tot corpul') || exact('pana la talie') || exact('din lateral') || exact('doar mainile')) {
    if (has('cap', 'umeri', 'portret')) return setMode('head');
    if (has('tot corpul', 'intreg', 'picioare')) return setMode('full');
    if (has('talie', 'jumatate')) return setMode('waist');
    if (has('lateral', 'profil', 'din parte')) return setMode('side');
    if (has('maini', 'mainile', 'clape')) return setMode('hands');
  }
  if (has('directie', 'unde mut', 'unde sa mut', 'cum mut', 'cum sa mut', 'ce sa fac', 'incotro', 'muta')) return say(c.g.ok ? (c.light || (tiltDeg != null && Math.abs(tiltDeg) >= 4 ? `Încadrarea e bună. Doar telefonul e strâmb cu ${Math.abs(tiltDeg)} grade.` : 'Nu muta nimic, ești bine încadrat.')) : c.g.msgs.join(' '), true);
  if (has('cat de bine', 'cum ma vezi', 'cum arat', 'sunt incadrat', 'e bine', 'ma vezi bine', 'nota')) { const sc = score(c); return say(`${sc >= 85 ? 'Te văd bine' : sc >= 60 ? 'Te văd destul de bine' : sc > 0 ? 'Nu te văd bine' : 'Nu te văd deloc'}, cam ${sc} din 100.` + (c.g.ok ? '' : ' ' + c.g.msgs[0]) + (c.light ? ' ' + c.light : '') + (c.stray.length ? ' În cadru mai apare ' + c.stray.join(', ') + '.' : ''), true); }
  if (has('nepotrivit', 'in plus', 'deranjeaza', 'fundal', 'obiect', 'ce e in cadru', 'ce mai e')) {
    const all = lastObjects.filter(d => d.categories[0] && d.categories[0].categoryName !== 'person' && d.categories[0].score >= 0.45);
    return say(c.stray.length ? 'Da: ' + c.stray.join('; ') + '.' : all.length ? 'Nu văd nimic nepotrivit. Ce e în cadru face parte din studioul învățat.' : 'Nu văd nimic nepotrivit în cadru.', true);
  }
  if (has('lumina', 'intuneric', 'luminos')) return say(c.light || 'Lumina e bună.', true);
  if (has('drept', 'strimb', 'strâmb', 'inclinat')) return say(tiltDeg == null ? 'Nu pot citi înclinarea telefonului.' : Math.abs(tiltDeg) < 4 ? 'Telefonul e drept.' : `Telefonul e strâmb cu ${Math.abs(tiltDeg)} grade.`, true);
  if (has('ce se vede', 'ce vezi', 'descrie', 'ce e pe ecran', 'cadru')) return describe();
  say('Nu am înțeles. Spune „ajutor” ca să auzi ce poți întreba.', true);
}
window.__answer = answer;
function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { say('Telefonul nu permite comenzi vocale în acest browser. Folosește Safari și activează Dictarea din Setări, Tastatură.', true); return false; }
  rec = new SR(); rec.lang = 'ro-RO'; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) {
      const t = e.results[i][0].transcript.trim();
      if (!t || norm(t) === norm(lastHeard)) continue;
      if (lastSaid && norm(lastSaid).includes(norm(t)) && Date.now() - lastSaidAt < 4000) continue; // propria voce
      lastHeard = t; $('#heard').textContent = 'Am auzit: ' + t;
      answer(t);
    }
  };
  rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { micOn = false; say('Nu am voie la microfon. Permite microfonul și Dictarea pentru Safari.', true); updateMicBtn(); } };
  rec.onend = () => { if (micOn && !micPaused && running) setTimeout(() => { try { rec.start(); } catch (e) {} }, 150); };
  micOn = true; try { rec.start(); } catch (e) {}
  updateMicBtn();
  return true;
}
function stopMic() { micOn = false; try { rec && rec.abort(); } catch (e) {} updateMicBtn(); }
function updateMicBtn() { const b = $('#mic'); if (b) { b.textContent = micOn ? 'Oprește comenzile vocale' : 'Pornește comenzile vocale'; b.setAttribute('aria-pressed', String(micOn)); } }

/* ---------------- pornire / oprire ---------------- */
async function start() {
  mode = document.querySelector('input[name=mode]:checked').value;
  facing = document.querySelector('input[name=cam]:checked').value;
  $('#setup').classList.add('hidden'); $('#live').classList.remove('hidden');
  $('#forget').classList.toggle('hidden', !studioRef);
  $('#status').setAttribute('aria-live', 'off');
  say('Pornesc camera și încarc recunoașterea. Durează câteva secunde.', true);
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') { try { await DeviceMotionEvent.requestPermission(); } catch (e) {} }
    window.addEventListener('devicemotion', onMotion);
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
    video.srcObject = stream; await video.play();
    await loadModels();
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {}
    running = true; okSince = 0; okAnnounced = false; lastSaidAt = 0;
    loop();
    if ($('#optMic').checked && startMic()) say('Gata. Te ghidez acum. Îmi poți pune întrebări oricând, de exemplu: cât de bine mă văd? Spune „ajutor” pentru toate comenzile.', true);
    else say('Gata. Te ghidez acum.', true);
  } catch (e) {
    say('Nu am putut porni camera sau recunoașterea: ' + (e && e.message ? e.message : e) + '. Verifică permisiunea pentru cameră și legătura la internet.', true);
  }
}
function stop() {
  running = false; stopMic(); muted = false;
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; window.removeEventListener('devicemotion', onMotion);
  try { wakeLock && wakeLock.release(); } catch (e) {}
  $('#live').classList.add('hidden'); $('#setup').classList.remove('hidden');
  $('#start').focus();
}
async function learnStudio() {
  say('Ieși din cadru. Peste 5 secunde memorez studioul gol.', true);
  setTimeout(async () => {
    if (!objects) { try { const m = await import(`${MP}/vision_bundle.mjs`); objects = await m.ObjectDetector.createFromOptions(vision, { baseOptions: { modelAssetPath: MODELS.object }, runningMode: 'VIDEO', scoreThreshold: 0.4, maxResults: 8 }); } catch (e) {} }
    const W = video.videoWidth, H = video.videoHeight;
    const det = objects ? (objects.detectForVideo(video, performance.now()).detections || []) : [];
    studioRef = det.filter(d => d.categories[0] && d.categories[0].categoryName !== 'person').map(d => ({ name: d.categories[0].categoryName, cx: (d.boundingBox.originX + d.boundingBox.width / 2) / W, cy: (d.boundingBox.originY + d.boundingBox.height / 2) / H }));
    try { localStorage.setItem(REF_KEY, JSON.stringify(studioRef)); } catch (e) {}
    $('#forget').classList.remove('hidden');
    chime();
    say(studioRef.length ? 'Am memorat studioul cu ' + studioRef.map(o => objName(o.name)).join(', ') + '. De acum îți spun doar obiectele noi.' : 'Am memorat studioul. Nu am văzut obiecte în el.', true);
  }, 5000);
}
$('#start').addEventListener('click', start);
$('#mic').addEventListener('click', () => { if (micOn) { stopMic(); say('Comenzile vocale sunt oprite.', true); } else if (startMic()) say('Te ascult.', true); });
$('#stop').addEventListener('click', stop);
$('#describe').addEventListener('click', describe);
$('#learn').addEventListener('click', learnStudio);
$('#forget').addEventListener('click', () => { studioRef = null; try { localStorage.removeItem(REF_KEY); } catch (e) {} $('#forget').classList.add('hidden'); say('Am uitat studioul învățat.', true); $('#learn').focus(); });
