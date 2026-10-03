/* Regatul Cărților — reading app built for VoiceOver. User data stays on the phone (localStorage).
   Catalog: Google Books, Voxa and Open Library. Texts come from i18n.js (I18N). */
(() => {
'use strict';

/* ================= constants ================= */
const STATUS_KEYS = ['reading', 'want', 'read', 'dnf'];
const FORMAT_KEYS = ['print', 'ebook', 'audio'];
const COLORS = ['#2448B8','#B0413E','#2E7D5B','#8A5A2B','#6B4FA3','#1F7A8C','#A2662A','#4B5563','#9C3D6E','#3F6E2A'];
const DISCOVER = [
  ['fiction', 'subject:fiction'], ['romanianLit', 'literatura romana'], ['classics', 'subject:classics'], ['poetry', 'subject:poetry'],
  ['history', 'subject:history'], ['psychology', 'subject:psychology'], ['selfHelp', 'subject:self-help'], ['fantasy', 'subject:fantasy'],
  ['romance', 'subject:romance'], ['scifi', 'subject:"science fiction"'], ['mystery', 'subject:mystery'], ['thriller', 'subject:thriller'],
  ['horror', 'subject:horror'], ['children', 'subject:juvenile'], ['music', 'subject:music'], ['religion', 'subject:religion'], ['biography', 'subject:biography']
];
const AUTHORS = ['Liviu Rebreanu','Mircea Cărtărescu','Mircea Eliade','Ana Blandiana','Fiodor Dostoievski','Lev Tolstoi','Gabriel García Márquez','Haruki Murakami','Agatha Christie','Stephen King','Jane Austen','George Orwell','Yuval Noah Harari','Freida McFadden','Sarah J. Maas','Colleen Hoover'];
const GB_KEY = 'AIzaSyDo2zgdcJa20QAX8toPECUUZMAMsNyR5SI';   // Google Books key, works only from razvan-raftul.github.io
const KEY = 'raftul-meu-v2';
const LANGS = { en: 'English', ro: 'Română', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português' };
const SORTS = ['added_desc', 'added_asc', 'title_asc', 'title_desc', 'read_desc', 'read_asc', 'rating', 'author', 'genre'];

/* ================= state ================= */
const blank = () => ({
  books: [], lists: [], sessions: [], events: [],
  profile: { name: '', bio: '', favorite: '', genres: [] },
  account: { email: '', username: '' },
  social: { friends: [] },
  settings: { theme: 'auto', goal: 12, onlyRo: true, lang: 'en', sort: '' }
});
let S = blank();
try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) { S = Object.assign(blank(), d); S.settings = Object.assign(blank().settings, d.settings || {}); S.profile = Object.assign(blank().profile, d.profile || {}); S.social = Object.assign(blank().social, d.social || {}); } } catch (e) {}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast(t('saveFail')); } }

let tab = 'home';
let stack = { home: [], library: [], discover: [], search: [], profile: [], more: [] };
let libSeg = 'reading';
let statYear = new Date().getFullYear();
let openMonths = new Set();
let searchState = { q: '', results: null, loading: false, err: '', autoAdd: false };
let discoverState = { genre: null, results: null, loading: false };
const cache = {};

/* ================= i18n ================= */
const L = () => (I18N[S.settings.lang] ? S.settings.lang : 'en');
const LOC = () => ({ en: 'en-GB', ro: 'ro-RO', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-PT' }[L()]);
function t(k, vars) {
  let s = (I18N[L()] && I18N[L()][k]) ?? I18N.en[k] ?? k;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, v) => (vars[v] ?? m));
  return s;
}
const tn = (n, k) => t(n === 1 ? k + '_1' : k + '_n', { n: n.toLocaleString(LOC()) });
const STATUS = k => t('st_' + k);
const FORMAT = k => t('fmt_' + k);
const MONTH = i => { const s = new Date(2024, i, 15).toLocaleDateString(LOC(), { month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const genreName = id => { const g = GENRES[id]; if (!g) return id; return g[LANG_IDX[L()]] || g[0]; };
const LANG_IDX = { en: 0, ro: 1, es: 2, fr: 3, de: 4, it: 5, pt: 6 };

/* ================= utilities ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString(LOC(), { day: 'numeric', month: 'long', year: 'numeric' }); };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const color = s => COLORS[[...String(s || '?')].reduce((h, c) => h + c.charCodeAt(0), 0) % COLORS.length];
const hours = m => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`; };
const hoursSpoken = m => { const h = Math.floor(m / 60), r = Math.round(m % 60); const hs = tn(h, 'hour'), ms = tn(r, 'minute'); return h ? (r ? t('andJoin', { a: hs, b: ms }) : hs) : ms; };
const numTxt = n => String(n).replace('.', L() === 'en' ? '.' : ',');
const starsTxt = n => { if (!n) return ''; const f = Math.floor(n), h = n - f >= 0.5 ? 1 : 0; return '★'.repeat(f) + (h ? '½' : '') + '☆'.repeat(5 - f - h); };
const rateTxt = n => n ? t(n === 1 ? 'stars_1' : 'stars_n', { n: numTxt(n) }) : t('noRating');
const slider = ({ id, name = '', label, min, max, step = 1, value, text, extra = '' }) => `<div class="field"><label for="${id}">${esc(label)}</label><div class="range"><input type="range" id="${id}" ${name ? `name="${name}"` : ''} min="${min}" max="${max}" step="${step}" value="${value}" aria-valuetext="${esc(text)}" ${extra}><output for="${id}" aria-hidden="true">${esc(text)}</output></div></div>`;
const goalText = g => t('perYear', { x: tn(g, 'book') });
const pct = b => b.pages ? Math.min(100, Math.round((b.page || 0) / b.pages * 100)) : 0;
const icon = name => ICONS[name] || '';
const bookGenre = b => b.genre ? genreName(b.genre) : ((b.categories || [])[0] || '');
function say(msg) { const l = $('#live'); l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 80); }
let toastT;
function toast(msg) { say(msg); let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); } el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 2600); }
const ICONS = {
  chev: '<svg viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 2 6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 12 20" width="12" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 2 10l8 8"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M10 3v14M3 10h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4l2 2h7A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 3a7 7 0 0 0-6.7 9.1L3 16.4V21h4.6v-2.4H10v-2.4h2.4l1.5-1.5A7 7 0 1 0 14 3zm2 6a1.8 1.8 0 1 1 0-3.6A1.8 1.8 0 0 1 16 9z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.3 2h3.4l.5 2.6 1.7.9 2.4-1.2 2.4 2.4-1.2 2.4.9 1.7 2.6.5v3.4l-2.6.5-.9 1.7 1.2 2.4-2.4 2.4-2.4-1.2-1.7.9-.5 2.6h-3.4l-.5-2.6-1.7-.9-2.4 1.2-2.4-2.4 1.2-2.4-.9-1.7L2 13.7v-3.4l2.6-.5.9-1.7-1.2-2.4 2.4-2.4 2.4 1.2 1.7-.9zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m-5 5 5-5 5 5M5 20h14"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.6 2.1-1 1.7L11 13V6h2z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5C5.5 4.3 8.6 4.3 12 6c3.4-1.7 6.5-1.7 9-.5v13c-2.5-1.2-5.6-1.2-9 .5-3.4-1.7-6.5-1.7-9-.5z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 20V11h3v9zm6.5 0V4h3v16zM17 20v-7h3v7z"/></svg>'
};

/* ================= theme ================= */
function applyTheme() {
  const th = S.settings.theme;
  if (th === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th);
  document.documentElement.lang = L();
}

/* ================= external catalog ================= */
function gbToBook(v) {
  const i = v.volumeInfo || {};
  const ids = i.industryIdentifiers || [];
  const isbn = (ids.find(x => x.type === 'ISBN_13') || ids.find(x => x.type === 'ISBN_10') || {}).identifier || '';
  let cover = (i.imageLinks && (i.imageLinks.thumbnail || i.imageLinks.smallThumbnail)) || '';
  cover = cover.replace(/^http:/, 'https:').replace('&edge=curl', '');
  return {
    ext: 'gb:' + v.id, title: [i.title, i.subtitle].filter(Boolean).join(': ') || t('noTitle'),
    author: (i.authors || []).join(', '), pages: i.pageCount || 0, year: (i.publishedDate || '').slice(0, 4),
    publisher: i.publisher || '', description: (i.description || '').replace(/<[^>]+>/g, ''), isbn, cover,
    categories: i.categories || [], avg: i.averageRating || 0, ratings: i.ratingsCount || 0, lang: i.language || ''
  };
}
function olToBook(d) {
  return {
    ext: 'ol:' + (d.key || ''), title: d.title || t('noTitle'), author: (d.author_name || []).join(', '),
    pages: d.number_of_pages_median || 0, year: d.first_publish_year ? String(d.first_publish_year) : '',
    publisher: (d.publisher || [])[0] || '', description: '', isbn: (d.isbn || [])[0] || '',
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
    categories: (d.subject || []).slice(0, 3), avg: d.ratings_average ? Math.round(d.ratings_average * 10) / 10 : 0, ratings: d.ratings_count || 0, lang: ''
  };
}
async function catalog(q, opts = {}) {
  const k = JSON.stringify([q, opts, S.settings.onlyRo]);
  if (cache[k]) return cache[k];
  const p = new URLSearchParams({ q, maxResults: String(opts.max || 20), printType: 'books' });
  if (opts.order) p.set('orderBy', opts.order);
  let out = [];
  try { out = (await gbFetch(p)).map(gbToBook); } catch (e) {}
  if (!out.length && !opts.noFallback) {
    try {
      const op = new URLSearchParams({ q: q.replace(/subject:|inauthor:|isbn:/g, ''), limit: String(opts.max || 20), fields: 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn,publisher,subject,ratings_average,ratings_count' });
      const r = await fetch('https://openlibrary.org/search.json?' + op.toString());
      if (r.ok) { const j = await r.json(); out = (j.docs || []).map(olToBook); }
    } catch (e) {}
  }
  const seen = new Set(); out = out.filter(b => { const k2 = norm(b.title) + '|' + norm(b.author).split(' ')[0]; if (seen.has(k2)) return false; seen.add(k2); return true; });
  if (S.settings.onlyRo) out = [...out.filter(b => b.lang === 'ro'), ...out.filter(b => b.lang !== 'ro')];
  cache[k] = out; return out;
}
async function gbFetch(p) {
  for (const withKey of [true, false]) {
    const q = new URLSearchParams(p); if (withKey) q.set('key', GB_KEY);
    try { const r = await fetch('https://www.googleapis.com/books/v1/volumes?' + q.toString()); if (r.ok) { const j = await r.json(); return j.items || []; } } catch (e) {}
  }
  return [];
}
async function voxaSearch(q) {
  try {
    const r = await fetch('https://api.voxabooks.com/api/v1/client/search/all?' + new URLSearchParams({ query: q }).toString());
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j) ? j : []).filter(v => v && v.title && !/rezumat|summary|comentariu|recenzie/i.test(v.title)).map((v, i) => {
      const isbn = String(v.isbn || '').replace(/[^0-9X]/gi, '');
      return { ext: 'vx:' + v.id, title: String(v.title).trim(), author: (v.authors || []).map(a => a.name).join(', '), pages: v.pages_count || 0, year: '',
        publisher: 'Voxa', description: String(v.description || '').replace(/<[^>]+>/g, ''), isbn: isbn.length === 10 || isbn.length === 13 ? isbn : '',
        cover: (v.image && (v.image.default_320x320 || v.image.url)) || '', categories: (v.tags || []).map(x => x.name).filter(n => !/noutat|voxa/i.test(n)).slice(0, 3),
        avg: v.ratings_avg || 0, ratings: v.ratings_count || 0, lang: v.language || '', format: v.type === 'Ebook' ? 'ebook' : 'audio', _src: 'vx', _i: i };
    });
  } catch (e) { return []; }
}
const findSame = c => S.books.find(b => (c.ext && b.ext === c.ext) || (c.isbn && b.isbn === c.isbn) || (norm(b.title) === norm(c.title) && norm(b.author) === norm(c.author)));

/* ================= data operations ================= */
function addBook(c, status) {
  const ex = findSame(c);
  if (ex) return ex;
  const b = { id: uid(), ext: c.ext || '', title: c.title, author: c.author || '', pages: c.pages || 0, page: 0, year: c.year || '', publisher: c.publisher || '',
    description: c.description || '', isbn: c.isbn || '', cover: c.cover || '', categories: c.categories || [], avg: c.avg || 0, ratings: c.ratings || 0, genre: c.genre || '',
    format: c.format || 'print', status: status || 'want', rating: 0, review: '', lists: [], dateAdded: today(), dateStarted: '', dateFinished: '', minutes: 0 };
  if (b.status === 'reading') b.dateStarted = today();
  if (b.status === 'read') { b.dateFinished = today(); b.page = b.pages; }
  S.books.push(b); logEvent(b, 'add'); persist(); return b;
}
function setStatus(b, st) {
  if (b.status === st) return;
  b.status = st;
  if (st === 'reading' && !b.dateStarted) b.dateStarted = today();
  if (st === 'read') { b.dateFinished = b.dateFinished || today(); if (b.pages) b.page = b.pages; }
  if (st !== 'read') b.dateFinished = st === 'dnf' ? b.dateFinished : '';
  logEvent(b, st); persist();
}
function logEvent(b, type, extra) { S.events.push({ id: uid(), bookId: b.id, title: b.title, type, date: today(), ...extra }); if (S.events.length > 3000) S.events = S.events.slice(-3000); }
function logSession(b, pages, minutes, date) {
  pages = Math.max(0, +pages || 0); minutes = Math.max(0, +minutes || 0);
  if (!pages && !minutes) return;
  S.sessions.push({ id: uid(), bookId: b.id, date: date || today(), pages, minutes });
  if (pages) b.page = Math.min(b.pages || Infinity, (b.page || 0) + pages);
  b.minutes = (b.minutes || 0) + minutes;
  if (b.status === 'want') setStatus(b, 'reading');
  logEvent(b, 'session', { pages, minutes });
  persist();
}
const byId = id => S.books.find(b => b.id === id);
const listById = id => S.lists.find(l => l.id === id);

function sortBooks(items, view) {
  let s = S.settings.sort || (view === 'read' ? 'read_desc' : 'added_desc');
  const c = (a, b) => String(a || '').localeCompare(String(b || ''), LOC(), { sensitivity: 'base' });
  const by = {
    added_desc: (a, b) => c(b.dateAdded, a.dateAdded) || (b.lastTouch || 0) - (a.lastTouch || 0),
    added_asc: (a, b) => c(a.dateAdded, b.dateAdded),
    title_asc: (a, b) => c(a.title, b.title),
    title_desc: (a, b) => c(b.title, a.title),
    read_desc: (a, b) => c(b.dateFinished, a.dateFinished),
    read_asc: (a, b) => (!a.dateFinished) - (!b.dateFinished) || c(a.dateFinished, b.dateFinished),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || c(a.title, b.title),
    author: (a, b) => c((a.author || '').split(',')[0].split(' ').pop(), (b.author || '').split(',')[0].split(' ').pop()) || c(a.title, b.title),
    genre: (a, b) => (!bookGenre(a)) - (!bookGenre(b)) || c(bookGenre(a), bookGenre(b)) || c(a.title, b.title)
  };
  return [...items].sort(by[s] || by.added_desc);
}
function sortSelectHTML(view) {
  const cur = S.settings.sort || (view === 'read' ? 'read_desc' : 'added_desc');
  return `<div class="sortbar"><label for="sortSel">${esc(t('sortBy'))}</label><select id="sortSel" data-sort>${SORTS.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(t('sort_' + k))}</option>`).join('')}</select></div>`;
}

/* ================= stats ================= */
function statsFor(year) {
  const m = Array.from({ length: 12 }, () => ({ books: 0, pages: 0, minutes: 0 }));
  const sessByBook = {};
  S.sessions.forEach(s => { const d = new Date(s.date + 'T12:00:00'); sessByBook[s.bookId] = true; if (d.getFullYear() === year) { m[d.getMonth()].pages += s.pages; m[d.getMonth()].minutes += s.minutes; } });
  S.books.forEach(b => {
    if (b.status === 'read' && b.dateFinished) {
      const d = new Date(b.dateFinished + 'T12:00:00');
      if (d.getFullYear() === year) {
        m[d.getMonth()].books++;
        if (!sessByBook[b.id]) { if (b.format !== 'audio') m[d.getMonth()].pages += b.pages || 0; m[d.getMonth()].minutes += b.minutes || 0; }
      }
    }
  });
  return m;
}
function yearsWithData() {
  const ys = new Set([new Date().getFullYear()]);
  S.books.forEach(b => b.dateFinished && ys.add(+b.dateFinished.slice(0, 4)));
  S.sessions.forEach(s => ys.add(+s.date.slice(0, 4)));
  return [...ys].filter(Boolean).sort((a, b) => b - a);
}
function best(arr, key, labelFn) { let bi = -1, bv = 0; arr.forEach((x, i) => { if (x[key] > bv) { bv = x[key]; bi = i; } }); return bi < 0 ? null : { label: labelFn(bi), v: bv }; }
const readInMonth = (i, y) => S.books.filter(b => b.status === 'read' && b.dateFinished && +b.dateFinished.slice(0, 4) === y && +b.dateFinished.slice(5, 7) === i + 1).sort((a, b) => String(b.dateFinished).localeCompare(String(a.dateFinished)));

/* ================= components ================= */
function coverHTML(b, cls = '') {
  const ph = `<div class="ph" style="background:${color(b.title)}"><span>${esc((b.title || '').slice(0, 60))}</span><small>${esc((b.author || '').split(',')[0])}</small></div>`;
  return `<div class="${cls}"><div class="cover" aria-hidden="true">${ph}${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div></div>`;
}
const byAuthor = a => a ? t('byAuthor', { a }) : '';
function ratingSpoken(b) { return b.avg ? t('avgSpoken', { avg: numTxt(b.avg) }) + (b.ratings ? t('fromReaders', { n: b.ratings }) : '') : ''; }
function tileHTML(c, kind) {
  const lib = findSame(c);
  const label = `${c.title}${byAuthor(c.author)}${ratingSpoken(c)}${lib ? '. ' + t('inYourLibrary') : ''}`;
  const key = kind === 'lib' ? `data-book="${esc(c.id)}"` : `data-cand="${esc(remember(c))}"`;
  return `<button class="tile" ${key} aria-label="${esc(label)}">${coverHTML(c)}<div class="t" aria-hidden="true">${esc(c.title)}</div><div class="a" aria-hidden="true">${esc(c.author)}</div>${c.avg ? `<div class="r" aria-hidden="true"><span class="stars">★</span> ${numTxt(c.avg)}${c.ratings ? ` · ${c.ratings}` : ''}</div>` : ''}</button>`;
}
const candStore = {}; function remember(c) { const k = c.ext || ('c' + uid()); candStore[k] = c; return k; }
function bookRowHTML(b) {
  let sub = '', label = `${b.title}${byAuthor(b.author)}`;
  if (b.status === 'reading') { sub = b.pages ? `<span>${pct(b)}% · ${t('pageOf', { p: b.page || 0, n: b.pages })}</span>` : `<span>${FORMAT(b.format)}</span>`; if (b.pages) label += '. ' + t('pctRead', { p: pct(b) }); }
  else if (b.status === 'read') { sub = `${b.rating ? `<span class="stars">${starsTxt(b.rating)}</span>` : ''}${b.dateFinished ? `<span>${fmtDate(b.dateFinished)}</span>` : ''}`; if (b.rating) label += '. ' + t('yourRating', { r: rateTxt(b.rating) }); if (b.dateFinished) label += '. ' + t('finishedOn', { d: fmtDate(b.dateFinished) }); }
  else if (b.status === 'dnf') { sub = `<span>${b.pages ? t('stoppedAt', { p: pct(b) }) : t('stopped')}</span>`; label += '. ' + STATUS('dnf'); }
  else { sub = `<span class="pill">${FORMAT(b.format)}</span>`; }
  const bar = b.status === 'reading' && b.pages ? `<div class="bar"><i style="width:${pct(b)}%"></i></div>` : '';
  return `<button class="row" data-book="${esc(b.id)}" aria-label="${esc(label)}">${coverHTML(b, 'mini')}<span class="meta" aria-hidden="true"><span class="t">${esc(b.title)}</span><span class="a">${esc(b.author)}</span><span class="s">${sub}</span>${bar}</span><span class="chev" aria-hidden="true">${icon('chev')}</span></button>`;
}
function candRowHTML(c) {
  const lib = findSame(c);
  const label = `${c.title}${byAuthor(c.author)}${c.year ? ', ' + c.year : ''}${ratingSpoken(c)}`;
  return `<div class="row" style="cursor:default"><button class="row" style="padding:0;flex:1;min-width:0" data-cand="${esc(remember(c))}" aria-label="${esc(label + '. ' + t('details'))}">${coverHTML(c, 'mini')}<span class="meta" aria-hidden="true"><span class="t">${esc(c.title)}</span><span class="a">${esc(c.author)}</span><span class="s">${c.year ? `<span>${esc(c.year)}</span>` : ''}${c.pages ? `<span>${tn(c.pages, 'page')}</span>` : ''}${c.avg ? `<span><span class="stars">★</span> ${numTxt(c.avg)}</span>` : ''}</span></span></button>
    ${lib ? `<button class="addmini done" data-book="${esc(lib.id)}" aria-label="${esc(t('alreadyIn', { title: c.title, shelf: STATUS(lib.status) }))}">${esc(t('inLibraryShort'))}</button>` : `<button class="addmini" data-quickadd="${esc(remember(c))}" aria-label="${esc(t('addToAppNamed', { title: c.title }))}">${esc(t('add'))}</button>`}</div>`;
}
function shelfHTML(title, items, kind) {
  if (!items || !items.length) return '';
  return `<h2 class="sec">${esc(title)}</h2><div class="shelf" role="list" aria-label="${esc(title)}">${items.map(c => `<div role="listitem">${tileHTML(c, kind)}</div>`).join('')}</div>`;
}
function navHTML(title, opts = {}) {
  const back = opts.back ? `<button class="back" data-back aria-label="${esc(t('backTo', { x: opts.back }))}">${icon('back')} ${esc(t('back'))}</button>` : '<span></span>';
  const act = opts.act || '<span></span>';
  return `<div class="nav">${back}${act}</div><h1 id="title" tabindex="-1">${esc(title)}</h1>`;
}
function emptyHTML(a, d) { return `<div class="empty"><b>${esc(a)}</b>${esc(d)}</div>`; }
function cell({ attrs = '', ico, icoColor = '#8E8E93', label, value = '', chev = true, aria }) {
  return `<button class="cell" ${attrs} ${aria ? `aria-label="${esc(aria)}"` : ''}>${ico ? `<span class="ico" style="background:${icoColor}" aria-hidden="true">${icon(ico)}</span>` : ''}<span class="grow">${esc(label)}</span>${value ? `<span class="val">${esc(value)}</span>` : ''}${chev ? `<span class="chev" aria-hidden="true">${icon('chev')}</span>` : ''}</button>`;
}
const infoRow = (a, v) => `<div class="cell" style="cursor:default"><span class="grow">${esc(a)}</span><span class="val">${esc(v)}</span></div>`;

/* ================= screens ================= */
const screens = {};

screens.home = () => {
  const reading = S.books.filter(b => b.status === 'reading');
  const y = new Date().getFullYear(), done = statsFor(y).reduce((a, m) => a + m.books, 0), goal = S.settings.goal || 12;
  let h = navHTML(t('tab_home'), { act: `<button class="round" data-go="search" aria-label="${esc(t('searchBook'))}">${icon('search')}</button>` });
  if (reading.length) {
    const b = reading.sort((a, c) => (c.lastTouch || 0) - (a.lastTouch || 0))[0];
    h += `<div class="hero">${coverHTML(b, 'mini')}<div style="min-width:0;flex:1"><div class="s">${esc(t('continueReading'))}</div><div class="t">${esc(b.title)}</div>${b.pages ? `<div class="s">${esc(t('pctReadShort', { p: pct(b) }))}</div><div class="bar"><i style="width:${pct(b)}%"></i></div>` : ''}</div><button class="go" data-book="${esc(b.id)}" aria-label="${esc(t('continueReading') + ': ' + b.title + (b.pages ? ', ' + t('pctRead', { p: pct(b) }) : ''))}">${esc(t('open'))}</button></div>`;
  } else {
    h += `<div class="hero"><div style="flex:1"><div class="t">${esc(t('welcome'))}</div><div class="s">${esc(t('welcomeSub'))}</div></div><button class="go" data-go="search">${esc(t('tab_search'))}</button></div>`;
  }
  const goalLabel = t('challenge', { y });
  h += `<div class="label">${esc(goalLabel)}</div><div class="group"><button class="cell" data-push="stats" aria-label="${esc(goalLabel + ': ' + t('xOfY', { x: done, y: tn(goal, 'book') }) + '. ' + t('openStats'))}"><span class="grow"><b>${esc(t('xOfY', { x: done, y: tn(goal, 'book') }))}</b><div class="goalbar" style="margin-top:8px"><i style="width:${Math.min(100, Math.round(done / goal * 100))}%"></i></div></span><span class="chev" aria-hidden="true">${icon('chev')}</span></button></div>`;
  if (reading.length > 1) h += shelfHTML(t('readingNow'), reading, 'lib');
  h += `<div id="homeRecs"><div class="spin" role="status">${esc(t('loadingRecs'))}</div></div>`;
  setTimeout(loadHomeRecs, 0);
  return h;
};
async function loadHomeRecs() {
  const box = $('#homeRecs'); if (!box) return;
  const liked = S.books.filter(b => b.rating >= 4 || b.status === 'reading').slice(-6);
  const authors = [...new Set(liked.map(b => (b.author || '').split(',')[0]).filter(Boolean))].slice(0, 2);
  const cats = [...new Set(liked.flatMap(b => b.categories || []))].slice(0, 1);
  const tasks = [
    [t('popularNow'), catalog('subject:fiction', { order: 'relevance' })],
    [t('wellRated'), catalog('literatura', { max: 30 }).then(r => r.filter(c => c.avg).sort((a, b) => (b.avg * Math.log(2 + b.ratings)) - (a.avg * Math.log(2 + a.ratings))))],
  ];
  if (authors.length) tasks.unshift([t('forYou'), catalog(authors.map(a => `inauthor:"${a}"`).join(' OR ')).then(r => r.filter(c => !findSame(c)))]);
  else if (cats.length) tasks.unshift([t('forYou'), catalog(`subject:"${cats[0]}"`).then(r => r.filter(c => !findSame(c)))]);
  const res = await Promise.all(tasks.map(x => x[1].catch(() => [])));
  if (!$('#homeRecs')) return;
  const html = tasks.map((x, i) => shelfHTML(x[0], res[i].slice(0, 15), 'cand')).join('');
  $('#homeRecs').innerHTML = html || emptyHTML(t('recsUnavailable'), t('checkInternetOffline'));
}

screens.library = () => {
  const segs = [...STATUS_KEYS, 'lists', 'stats'];
  const segLabel = k => k === 'lists' ? t('lists') : k === 'stats' ? t('stats') : STATUS(k);
  const segCount = k => k === 'lists' ? S.lists.length : k === 'stats' ? null : S.books.filter(b => b.status === k).length;
  let h = navHTML(t('tab_library'), { act: libSeg === 'lists' ? `<button class="round" data-newlist aria-label="${esc(t('newList'))}">${icon('plus')}</button>` : `<button class="round" data-go="search" aria-label="${esc(t('addBook'))}">${icon('plus')}</button>` });
  h += `<div class="chips" role="tablist" aria-label="${esc(t('librarySections'))}">${segs.map(k => { const n = segCount(k); return `<button class="chip" role="tab" data-libseg="${k}" aria-selected="${libSeg === k}" aria-label="${esc(segLabel(k) + (n == null ? '' : ', ' + tn(n, k === 'lists' ? 'list' : 'book')))}">${esc(segLabel(k))}${n == null ? '' : ` <span class="cnt" aria-hidden="true">${n}</span>`}</button>`; }).join('')}</div>`;
  if (libSeg === 'lists') return h + listsHTML();
  if (libSeg === 'stats') return h + statsHTML();
  const items = sortBooks(S.books.filter(b => b.status === libSeg), libSeg);
  if (!items.length) return h + `<div style="margin-top:12px">${emptyHTML(t('noBooksHere'), t('hint_' + libSeg))}</div>`;
  return h + sortSelectHTML(libSeg) + `<div class="label">${esc(tn(items.length, 'book'))}</div><div class="group" role="list">${items.map(b => `<div role="listitem">${bookRowHTML(b)}</div>`).join('')}</div>`;
};
function listsHTML() {
  if (!S.lists.length) return `<div style="margin-top:12px">${emptyHTML(t('noListsYet'), t('noListsHint'))}</div>`;
  return `<div class="label">${esc(tn(S.lists.length, 'list'))}</div><div class="group">${S.lists.map(l => { const n = S.books.filter(b => (b.lists || []).includes(l.id)).length; return cell({ attrs: `data-openlist="${esc(l.id)}"`, ico: 'folder', icoColor: '#2B7BE4', label: l.name, value: String(n), aria: `${l.name}, ${tn(n, 'book')}` }); }).join('')}</div>`;
}
function statsHTML() {
  const ys = yearsWithData(); if (!ys.includes(statYear)) statYear = ys[0];
  const m = statsFor(statYear);
  const tot = m.reduce((a, x) => ({ books: a.books + x.books, pages: a.pages + x.pages, minutes: a.minutes + x.minutes }), { books: 0, pages: 0, minutes: 0 });
  const goal = S.settings.goal || 12, isCur = statYear === new Date().getFullYear();
  const maxB = Math.max(1, ...m.map(x => x.books));
  const bm = best(m, 'books', MONTH), bp = best(m, 'pages', MONTH), bt = best(m, 'minutes', MONTH);
  const allY = ys.map(y => ({ y, ...statsFor(y).reduce((a, x) => ({ books: a.books + x.books, pages: a.pages + x.pages, minutes: a.minutes + x.minutes }), { books: 0, pages: 0, minutes: 0 }) }));
  const by = best(allY, 'books', i => String(allY[i].y)), byp = best(allY, 'pages', i => String(allY[i].y)), byt = best(allY, 'minutes', i => String(allY[i].y));
  let h = `<div class="chips" role="tablist" aria-label="${esc(t('chooseYear'))}">${ys.map(y => `<button class="chip" role="tab" data-year="${y}" aria-selected="${y === statYear}">${y}</button>`).join('')}</div>`;
  h += `<div class="grid2" style="margin-top:8px">
    <div class="stat" role="group" aria-label="${esc(t('inYear', { x: tn(tot.books, 'bookRead'), y: statYear }))}"><div class="n" aria-hidden="true">${tot.books}</div><div class="l" aria-hidden="true">${esc(t('booksRead'))}</div></div>
    <div class="stat" role="group" aria-label="${esc(t('inYear', { x: tn(tot.pages, 'page'), y: statYear }))}"><div class="n" aria-hidden="true">${tot.pages.toLocaleString(LOC())}</div><div class="l" aria-hidden="true">${esc(t('pages'))}</div></div>
    <div class="stat" role="group" aria-label="${esc(t('readingTimeIn', { x: hoursSpoken(tot.minutes), y: statYear }))}"><div class="n" aria-hidden="true">${(Math.round(tot.minutes / 6) / 10).toLocaleString(LOC())}</div><div class="l" aria-hidden="true">${esc(t('readingHours'))}</div></div>
    <div class="stat" role="group" aria-label="${esc(t('goalXofY', { x: tot.books, y: goal }))}"><div class="n" aria-hidden="true">${Math.min(100, Math.round(tot.books / goal * 100))}%</div><div class="l" aria-hidden="true">${esc(t('ofGoal', { n: goal }))}</div></div></div>`;
  if (isCur) h += `<div class="label">${esc(t('goalFor', { y: statYear }))}</div><div class="group">${slider({ id: 'goalR', label: t('yearlyGoal'), min: 1, max: Math.max(200, goal), value: goal, text: goalText(goal), extra: 'data-goalr' })}</div>`;
  // one folder per month of the selected year; opening it shows a full page with that month's books
  h += `<div class="label">${esc(t('monthsOfYear', { y: statYear }))}</div><div class="group">${m.map((x, i) => {
    const n = readInMonth(i, statYear).length;
    const aria = MONTH(i) + ': ' + tn(n, 'book') + (x.pages ? ', ' + tn(x.pages, 'page') : '') + (x.minutes ? ', ' + hoursSpoken(x.minutes) : '');
    return `<button class="cell" data-month="${i}" aria-label="${esc(aria)}"><span class="ico" style="background:#2B7BE4" aria-hidden="true">${icon('folder')}</span><span class="grow">${esc(MONTH(i))}<div class="mb" aria-hidden="true"><i style="width:${Math.round(x.books / maxB * 100)}%"></i></div></span><span class="val">${n}</span><span class="chev" aria-hidden="true">${icon('chev')}</span></button>`;
  }).join('')}</div>`;
  const line = (a, b, unit) => infoRow(a, b ? `${b.label} (${unit(b.v)})` : '–');
  h += `<div class="label">${esc(t('records', { y: statYear }))}</div><div class="group">${line(t('mostBooks'), bm, v => tn(v, 'book'))}${line(t('mostPages'), bp, v => v + ' ' + t('pagesShort'))}${line(t('mostTime'), bt, hours)}</div>`;
  h += `<div class="label">${esc(t('allYears'))}</div><div class="group">${line(t('yearMostBooks'), by, v => tn(v, 'book'))}${line(t('yearMostPages'), byp, v => v + ' ' + t('pagesShort'))}${line(t('yearMostTime'), byt, hours)}</div>`;
  h += `<div class="foot">${esc(t('hoursNote'))}</div>`;
  h += `<div class="group" style="margin-top:20px">${cell({ attrs: 'data-push="history"', ico: 'clock', icoColor: '#8E5CD9', label: t('history') })}</div>`;
  return h;
}

screens.discover = () => {
  let h = navHTML(t('tab_discover'));
  h += `<div class="chips" role="group" aria-label="${esc(t('genres'))}">${DISCOVER.map(([k], i) => `<button class="chip" data-genre="${i}" aria-pressed="${discoverState.genre === i}">${esc(genreName(k))}</button>`).join('')}</div>`;
  if (discoverState.genre != null) {
    h += `<h2 class="sec">${esc(genreName(DISCOVER[discoverState.genre][0]))}</h2><div id="genreBox">${discoverState.results ? (discoverState.results.length ? `<div class="group" role="list">${discoverState.results.map(c => `<div role="listitem">${candRowHTML(c)}</div>`).join('')}</div>` : emptyHTML(t('nothingFound'), t('tryOtherGenre'))) : `<div class="spin" role="status">${esc(t('loading'))}</div>`}</div>`;
  }
  h += `<div id="discBox"><div class="spin" role="status">${esc(t('loading'))}</div></div>`;
  h += `<h2 class="sec">${esc(t('popularAuthors'))}</h2><div class="group">${AUTHORS.map(a => cell({ attrs: `data-author="${esc(a)}"`, label: a })).join('')}</div>`;
  setTimeout(loadDiscover, 0);
  return h;
};
async function loadDiscover() {
  if (!$('#discBox')) return;
  const [nou, pop, top] = await Promise.all([catalog('carte', { order: 'newest' }), catalog('roman', { order: 'relevance' }), catalog('subject:fiction romania', { max: 30 }).then(r => r.filter(c => c.avg).sort((a, b) => b.avg - a.avg))].map(p => p.catch(() => [])));
  if (!$('#discBox')) return;
  $('#discBox').innerHTML = shelfHTML(t('newReleases'), nou, 'cand') + shelfHTML(t('popularBooks'), pop, 'cand') + shelfHTML(t('readersLike'), top, 'cand') || '';
}

screens.search = () => {
  let h = navHTML(t('tab_search'));
  h += `<form id="searchForm" role="search"><div class="search">${icon('search')}<input id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" placeholder="${esc(t('bookTitle'))}" aria-label="${esc(t('searchAria'))}" value="${esc(searchState.q)}"></div></form>`;
  h += `<div class="foot">${esc(t('searchHint'))}</div>`;
  h += `<div id="sres">${searchResultsHTML()}</div>`;
  return h;
};
let searchSeq = 0, liveT = null;
async function gbSearch(q, max) {
  const items = await gbFetch(new URLSearchParams({ q, maxResults: String(max), printType: 'books' }));
  return items.map((v, i) => ({ ...gbToBook(v), _src: 'gb', _i: i }));
}
async function olSearch(q, max) {
  try {
    const p = new URLSearchParams({ q, limit: String(max), fields: 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn,publisher,subject,ratings_average,ratings_count,language,edition_count' });
    const r = await fetch('https://openlibrary.org/search.json?' + p.toString());
    if (!r.ok) return [];
    const j = await r.json();
    return (j.docs || []).map((d, i) => ({ ...olToBook(d), lang: (d.language || []).includes('rum') ? 'ro' : '', _ed: d.edition_count || 0, _src: 'ol', _i: i }));
  } catch (e) { return []; }
}
async function olAuthors(q) {
  try {
    const r = await fetch('https://openlibrary.org/search/authors.json?' + new URLSearchParams({ q, limit: '5' }).toString());
    if (!r.ok) return [];
    const j = await r.json(); return (j.docs || []).filter(a => a.name && (a.work_count || 0) >= 3).map(a => ({ name: a.name, works: a.work_count || 0, top: a.top_work || '' }));
  } catch (e) { return []; }
}
function scoreCand(c, qn, toks, hint) {
  const ti = norm(c.title), a = norm(c.author), all = ti + ' ' + a;
  let s = 0;
  const hits = toks.filter(w => all.includes(w)).length;
  s += hits / (toks.length || 1) * 60;
  if (toks.length && toks.every(w => all.split(' ').some(x => x.startsWith(w)))) s += 20;
  if (ti === qn) s += 45; else if (ti.startsWith(qn)) s += 30; else if (ti.includes(qn)) s += 15;
  if (a && (a === qn || a.includes(qn))) s += 25;
  if (hint) { if (ti.includes(norm(hint.title))) s += 30; if (a.includes(norm(hint.author))) s += 30; }
  s += Math.log10((c.ratings || 0) + (c._ed || 0) * 3 + 1) * 9;
  if (S.settings.onlyRo && c.lang === 'ro') s += 22;
  if (c.cover) s += 4;
  if (c._src === 'gb' || c._src === 'vx') s += Math.max(0, 12 - c._i);
  return s;
}
function mergeCands(list, qn, toks, hint) {
  const by = new Map();
  for (const c of list) {
    const k = norm(c.title).split(' ').slice(0, 6).join(' ') + '|' + norm(c.author).split(' ').pop();
    const ex = by.get(k);
    if (!ex) { by.set(k, c); continue; }
    const keep = (c.lang === 'ro' && S.settings.onlyRo && ex.lang !== 'ro') || (!ex.cover && c.cover && c._src === ex._src) ? c : ex;
    const other = keep === c ? ex : c;
    for (const f of ['cover', 'pages', 'isbn', 'year', 'description', 'publisher', 'format']) if (!keep[f] && other[f]) keep[f] = other[f];
    keep.ratings = Math.max(keep.ratings || 0, other.ratings || 0); keep.avg = keep.avg || other.avg; keep._ed = Math.max(keep._ed || 0, other._ed || 0);
    by.set(k, keep);
  }
  return [...by.values()].map(c => ({ c, s: scoreCand(c, qn, toks, hint) })).sort((x, y) => y.s - x.s).map(x => x.c);
}
async function findBooks(q) {
  const key = JSON.stringify(['find', q, S.settings.onlyRo]);
  if (cache[key]) return cache[key];
  const digits = q.replace(/[^0-9xX]/g, '');
  if ((digits.length === 10 || digits.length === 13) && digits.length >= q.replace(/[\s-]/g, '').length - 1) {
    const r = await catalog('isbn:' + digits, { max: 5 });
    return cache[key] = { books: r, authors: [] };
  }
  const byMatch = q.match(/^(.+?)\s+(?:de|by|von|di|par)\s+(.+)$/i);
  const hint = byMatch ? { title: byMatch[1], author: byMatch[2] } : null;
  const plain = hint ? `${hint.title} ${hint.author}` : q;
  const [gb, ol, au, vx] = await Promise.all([gbSearch(plain, 30), olSearch(plain, 30), hint ? Promise.resolve([]) : olAuthors(q), voxaSearch(plain)]);
  const qn = norm(plain), toks = qn.split(' ').filter(w => w.length > 1);
  const books = mergeCands([...vx, ...gb, ...ol], qn, toks, hint).slice(0, 30);
  const authors = au.filter(a => { const n = norm(a.name); return toks.length && toks.every(w => n.split(' ').some(x => x.startsWith(w))); }).slice(0, 3);
  const res = { books, authors };
  if (books.length) cache[key] = res;
  return res;
}
function localMatches(q) {
  const toks = norm(q).split(' ').filter(Boolean); if (!toks.length) return [];
  return S.books.filter(b => { const all = norm(b.title + ' ' + b.author); return toks.every(w => all.includes(w)); }).slice(0, 5);
}
function searchResultsHTML() {
  if (searchState.loading && !searchState.results) return `<div class="spin" role="status">${esc(t('searching'))}</div>`;
  if (searchState.err) return emptyHTML(t('searchFailed'), searchState.err);
  if (!searchState.results) {
    const recent = S.books.slice(-5).reverse();
    return recent.length ? `<div class="label">${esc(t('recentlyAdded'))}</div><div class="group">${recent.map(bookRowHTML).join('')}</div>` : '';
  }
  const mine = localMatches(searchState.q), au = searchState.authors || [], r = searchState.results;
  let h = '';
  if (mine.length) h += `<div class="label">${esc(t('inYourLibrary'))}</div><div class="group">${mine.map(bookRowHTML).join('')}</div>`;
  if (au.length) h += `<div class="label">${esc(t('authors'))}</div><div class="group">${au.map(a => cell({ attrs: `data-author="${esc(a.name)}"`, ico: 'person', icoColor: '#2B7BE4', label: a.name, aria: t('authorAria', { a: a.name, n: tn(a.works, 'book') }) + (a.top ? ', ' + t('bestKnown', { x: a.top }) : '') + '. ' + t('seeBooks') })).join('')}</div>`;
  if (!r.length && !mine.length && !au.length) return emptyHTML(t('noBookFound'), t('noBookFoundHint')) + `<div class="btns"><button class="btn plain" data-manual>${esc(t('addManuallyNamed', { q: searchState.q }))}</button></div>`;
  if (r.length) h += `<div class="label">${esc(tn(r.length, 'bookFound'))}</div><div class="group" role="list">${r.map(c => `<div role="listitem">${candRowHTML(c)}</div>`).join('')}</div>`;
  return h + `<div class="btns"><button class="btn plain" data-manual>${esc(t('cantFindAddManually'))}</button></div>`;
}
async function runSearch(raw, live = false) {
  let q = String(raw || '').trim(); if (!q) return;
  let auto = false;
  const m = q.match(/^(adaug[aă]|pune|add|añadir|agregar|ajouter|hinzufügen|aggiungi|adicionar)\s+(cartea\s+|the book\s+)?(.+)$/i);
  if (m) { q = m[3]; auto = !live; }
  q = q.replace(/[.!?]+$/, '');
  const seq = ++searchSeq;
  searchState = { q, results: live ? searchState.results : null, authors: live ? searchState.authors : [], loading: true, err: '', autoAdd: auto };
  if (!live) renderPart('#sres', searchResultsHTML());
  const { books, authors } = await findBooks(q);
  if (seq !== searchSeq) return;
  searchState.loading = false; searchState.results = books; searchState.authors = authors;
  if (navigator.onLine === false && !books.length) searchState.err = t('noInternet');
  renderPart('#sres', searchResultsHTML());
  const first = books[0];
  const authTxt = authors.length ? ' ' + t('authorFound', { a: authors[0].name }) : '';
  if (books.length) {
    say(`${tn(books.length, 'bookFound')}.${authTxt} ${t('first', { x: first.title + byAuthor(first.author) })}${auto ? ' ' + t('addButtonNext') : ''}`);
    if (auto) setTimeout(() => $('#sres [data-quickadd]')?.focus(), 300);
  } else say(authors.length ? authTxt.trim() : t('noBookFound'));
}
function rangeLive(el) {
  const out = el.parentElement.querySelector('output'); const v = +el.value; let txt = '';
  if (el.dataset.rater !== undefined) { txt = rateTxt(v); const st = $('#rateStars'); if (st) st.textContent = starsTxt(v) || '☆☆☆☆☆'; }
  else if (el.dataset.pctr !== undefined) { const b = byId($('#sheets [data-edit]')?.dataset.edit); if (b) txt = pctText(b, v); }
  else if (el.dataset.goalr !== undefined) txt = goalText(v);
  else if (el.dataset.pctedit !== undefined) { const n = +($('#e-pages')?.value || 0); const pg = Math.round(v / 100 * n); const hh = $('#e-page'); if (hh) hh.value = pg; txt = n ? t('pctPageOf', { p: v, pg, n }) : t('pctOnly', { p: v }); }
  else if (el.dataset.link) { const other = document.getElementById(el.dataset.link); if (el.type === 'range') { if (other) other.value = v || ''; txt = tn(v, 'page'); } else { if (other) { if (v > +other.max) other.max = v; other.value = v; rangeLive(other); } return; } const pr = $('#e-pageR'); if (pr) rangeLive(pr); }
  if (out) out.textContent = txt; el.setAttribute('aria-valuetext', txt);
}
function rangeCommit(el) {
  const v = +el.value;
  if (el.dataset.rater !== undefined) { const b = byId(el.dataset.rater || $('#sheets [data-edit]')?.dataset.edit); if (b) { b.rating = v; persist(); render(); } return; }
  if (el.dataset.pctr !== undefined) { const b = byId($('#sheets [data-edit]')?.dataset.edit); if (b && b.pages) { setPage(b, Math.round(v / 100 * b.pages)); render(); } return; }
  if (el.dataset.goalr !== undefined) { S.settings.goal = Math.max(1, v); persist(); const id = el.id; render(); setTimeout(() => document.getElementById(id)?.focus(), 30); return; }
}
document.addEventListener('input', e => {
  if (e.target.type === 'range' || e.target.dataset.link) { rangeLive(e.target); return; }
  if (e.target.id !== 'q') return;
  clearTimeout(liveT);
  const v = e.target.value.trim();
  if (v.length < 3) { if (!v) { searchSeq++; searchState = { q: '', results: null, loading: false, err: '', autoAdd: false }; renderPart('#sres', searchResultsHTML()); } return; }
  liveT = setTimeout(() => runSearch(v, true), 700);
});
function renderPart(sel, html) { const el = $(sel); if (el) el.innerHTML = html; }

/* ---- Profile tab ---- */
screens.profile = () => {
  const name = S.profile.name || t('reader');
  const read = S.books.filter(b => b.status === 'read');
  const want = S.books.filter(b => b.status === 'want').length;
  const last5 = [...read].sort((a, b) => String(b.dateFinished).localeCompare(String(a.dateFinished))).slice(0, 5);
  const friends = (S.social.friends || []).length;
  const genres = (S.profile.genres || []).filter(g => GENRES[g]);
  let h = navHTML(t('tab_profile'), { act: `<button class="act" data-push="profile">${esc(t('edit'))}</button>` });
  h += `<div class="profhead"><span class="avatar" style="background:${color(name)}" aria-hidden="true">${esc(name[0].toUpperCase())}</span><div><div class="pname">${esc(name)}</div>${S.profile.bio ? `<div class="pbio">${esc(S.profile.bio)}</div>` : ''}</div></div>`;
  h += `<div class="grid3">
    <button class="stat" data-friends aria-label="${esc(tn(friends, 'friend'))}"><div class="n" aria-hidden="true">${friends}</div><div class="l" aria-hidden="true">${esc(t('friends'))}</div></button>
    <button class="stat" data-libseg="read" aria-label="${esc(tn(read.length, 'bookRead') + '. ' + t('open'))}"><div class="n" aria-hidden="true">${read.length}</div><div class="l" aria-hidden="true">${esc(t('booksRead'))}</div></button>
    <button class="stat" data-libseg="want" aria-label="${esc(t('wantCount', { x: tn(want, 'book') }) + '. ' + t('open'))}"><div class="n" aria-hidden="true">${want}</div><div class="l" aria-hidden="true">${esc(STATUS('want'))}</div></button></div>`;
  h += `<div class="label">${esc(t('lastRead'))}</div>` + (last5.length ? `<div class="group" role="list">${last5.map(b => `<div role="listitem">${bookRowHTML(b)}</div>`).join('')}</div>` : emptyHTML(t('noReadYet'), t('noReadYetHint')));
  h += `<div class="label">${esc(t('favGenres'))}</div>`;
  h += genres.length ? `<div class="chips wrap" role="list" aria-label="${esc(t('favGenres'))}">${genres.map(g => `<span class="chip" role="listitem">${esc(genreName(g))}</span>`).join('')}</div>` : `<div class="foot" style="margin-top:0">${esc(t('noGenresYet'))}</div>`;
  h += `<div class="btns"><button class="btn plain" data-genrepick>${esc(t('chooseGenres'))}</button></div>`;
  return h;
};

screens.more = () => {
  let h = navHTML(t('tab_more'));
  h += `<div class="label">${esc(t('yourAccount'))}</div><div class="group">${cell({ attrs: 'data-push="profile"', ico: 'person', icoColor: '#2B7BE4', label: t('editProfile') })}${cell({ attrs: 'data-push="account"', ico: 'key', icoColor: '#8E8E93', label: t('editAccount') })}</div>`;
  h += `<div class="label">${esc(t('data'))}</div><div class="group">${cell({ attrs: 'data-push="import"', ico: 'down', icoColor: '#1E8E4E', label: t('importOther'), aria: t('importAria') })}${cell({ attrs: 'data-push="backup"', ico: 'up', icoColor: '#E08A00', label: t('backup') })}${cell({ attrs: 'data-push="history"', ico: 'clock', icoColor: '#8E5CD9', label: t('history') })}</div>`;
  h += `<div class="label">${esc(t('app'))}</div><div class="group">${cell({ attrs: 'data-push="language"', ico: 'globe', icoColor: '#1F7A8C', label: t('language'), value: LANGS[L()], aria: t('language') + ': ' + LANGS[L()] })}${cell({ attrs: 'data-push="settings"', ico: 'gear', icoColor: '#636366', label: t('settings') })}${cell({ attrs: 'data-push="install"', ico: 'info', icoColor: '#2448B8', label: t('installHome') })}${cell({ attrs: 'data-push="about"', ico: 'book', icoColor: '#B0413E', label: t('aboutApp') })}</div>`;
  return h;
};

/* ---- secondary pages (all have a Back button) ---- */
const pages = {};
pages.stats = () => navHTML(t('stats'), { back: backLabel() }) + statsHTML();
pages.month = arg => {
  const [y, i] = arg.split('-').map(Number);
  const list = readInMonth(i, y);
  return navHTML(`${MONTH(i)} ${y}`, { back: backLabel() }) + (list.length ? `<div class="label">${esc(tn(list.length, 'book'))}</div><div class="group" role="list">${list.map(b => `<div role="listitem">${bookRowHTML(b)}</div>`).join('')}</div>` : emptyHTML(t('noBooksHere'), t('noBooksMonth')));
};
pages.profile = () => `${navHTML(t('editProfile'), { back: backLabel() })}
  <form id="profileForm"><div class="group">
   <div class="field"><label for="p-name">${esc(t('displayName'))}</label><input id="p-name" name="name" value="${esc(S.profile.name)}" autocomplete="name"></div>
   <div class="field"><label for="p-bio">${esc(t('aboutMe'))}</label><textarea id="p-bio" name="bio">${esc(S.profile.bio)}</textarea></div>
  </div><div class="foot">${esc(t('publicNote'))}</div>
  <div class="btns"><button class="btn primary" type="submit">${esc(t('saveProfile'))}</button><button class="btn plain" type="button" data-genrepick>${esc(t('chooseGenres'))}</button></div></form>`;
pages.account = () => `${navHTML(t('account'), { back: backLabel() })}
  <form id="accountForm"><div class="group">
   <div class="field"><label for="a-user">${esc(t('username'))}</label><input id="a-user" name="username" value="${esc(S.account.username)}" autocapitalize="off"></div>
   <div class="field"><label for="a-mail">${esc(t('email'))}</label><input id="a-mail" name="email" type="email" value="${esc(S.account.email)}" autocomplete="email"></div>
  </div><div class="foot">${esc(t('localOnlyNote'))}</div>
  <div class="btns"><button class="btn primary" type="submit">${esc(t('saveAccount'))}</button></div></form>
  <div class="label">${esc(t('dangerZone'))}</div><div class="group">${cell({ attrs: 'data-askwipe', ico: 'trash', icoColor: '#D23B33', label: t('deleteAll'), chev: false })}</div><div id="wipeBox"></div>`;
pages.settings = () => `${navHTML(t('settings'), { back: backLabel() })}
  <div class="group"><fieldset class="field"><legend>${esc(t('appearance'))}</legend><div class="seg">${[['auto', 'themeAuto'], ['light', 'themeLight'], ['dark', 'themeDark']].map(([k, v]) => `<label>${esc(t(v))}<input type="radio" name="theme" value="${k}" ${S.settings.theme === k ? 'checked' : ''}></label>`).join('')}</div></fieldset></div>
  <div class="label">${esc(t('catalog'))}</div><div class="group"><label class="cell" style="cursor:pointer"><span class="grow">${esc(t('roFirst'))}</span><span class="toggle"><input type="checkbox" id="onlyRo" ${S.settings.onlyRo ? 'checked' : ''}><span></span></span></label></div>
  <div class="foot">${esc(t('roFirstNote'))}</div>
  <div class="label">${esc(t('yearlyGoal'))}</div><div class="group">${slider({ id: 'goalR', label: t('yearlyGoal'), min: 1, max: Math.max(200, S.settings.goal), value: S.settings.goal, text: goalText(S.settings.goal), extra: 'data-goalr' })}</div>`;
pages.language = () => `${navHTML(t('language'), { back: backLabel() })}
  <div class="group" role="radiogroup" aria-label="${esc(t('language'))}">${Object.entries(LANGS).map(([k, v]) => `<label class="cell" style="cursor:pointer" lang="${k}"><span class="grow">${esc(v)}</span><input type="radio" name="lang" value="${k}" ${L() === k ? 'checked' : ''}></label>`).join('')}</div>`;
pages.import = () => `${navHTML(t('import'), { back: backLabel() })}
  <div class="desc">${esc(t('importDesc'))}</div>
  <div class="btns"><label class="btn primary" style="text-align:center;cursor:pointer" for="csvFile">${esc(t('chooseExport'))}</label><input id="csvFile" type="file" accept=".csv,text/csv" class="sr"></div>
  <div class="foot">${esc(t('importNote'))}</div>
  <div id="importOut" role="status"></div>`;
pages.backup = () => `${navHTML(t('backup'), { back: backLabel() })}
  <div class="desc">${esc(t('backupDesc'))}</div>
  <div class="btns"><button class="btn primary" data-export>${esc(t('saveBackup'))}</button><label class="btn plain" style="text-align:center;cursor:pointer" for="jsonFile">${esc(t('restoreBackup'))}</label><input id="jsonFile" type="file" accept=".json,application/json" class="sr"></div>
  <div id="backupOut" role="status"></div>`;
pages.history = () => {
  const ev = [...S.events].reverse().slice(0, 300);
  const txt = e => t('ev_' + e.type) || t('ev_other');
  const detail = e => e.type === 'session' ? ' ' + [e.pages ? tn(e.pages, 'page') : '', e.minutes ? hoursSpoken(e.minutes) : ''].filter(Boolean).join(', ') + ' ' + t('ofBook') : '';
  return `${navHTML(t('historyTitle'), { back: backLabel() })}${ev.length ? `<div class="group hist">${ev.map(e => `<div class="cell" style="cursor:default;flex-direction:column;align-items:flex-start;gap:2px"><span>${esc(txt(e) + detail(e))} „${esc(e.title)}”</span><span class="d">${fmtDate(e.date)}</span></div>`).join('')}</div>` : emptyHTML(t('noActivity'), t('noActivityHint'))}`;
};
pages.install = () => `${navHTML(t('install'), { back: backLabel() })}<div class="desc">${esc(t('installDesc'))}</div>`;
pages.about = () => `${navHTML(t('about'), { back: backLabel() })}<div class="desc">${esc(t('aboutDesc', { v: '0.4' }))}</div>`;
pages.list = id => {
  const l = listById(id); if (!l) return navHTML(t('list'), { back: backLabel() }) + emptyHTML(t('listGone'), '');
  const items = sortBooks(S.books.filter(b => (b.lists || []).includes(id)), 'list');
  return `${navHTML(l.name, { back: backLabel(), act: `<button class="act" data-listmenu="${esc(id)}">${esc(t('edit'))}</button>` })}
  ${items.length ? sortSelectHTML('list') + `<div class="label">${esc(tn(items.length, 'book'))}</div><div class="group">${items.map(bookRowHTML).join('')}</div>` : emptyHTML(t('listEmpty'), t('listEmptyHint'))}
  <div class="btns"><button class="btn plain" data-addtolist="${esc(id)}">${esc(t('addBooksToList'))}</button></div>`;
};
pages.author = a => `${navHTML(a, { back: backLabel() })}<div id="authBox"><div class="spin" role="status">${esc(t('loading'))}</div></div>`;

/* ================= navigation ================= */
function current() { const st = stack[tab]; return st[st.length - 1]; }
function backLabel() { const st = stack[tab]; if (st.length < 2) return t('tab_' + tab); const p = st[st.length - 2]; return p.title || t('back'); }
function push(name, arg, title) { stack[tab].push({ name, arg, title }); render(true); }
function pop() { stack[tab].pop(); render(true); }
function renderTabs() {
  document.querySelectorAll('.tab').forEach(el => { el.setAttribute('aria-selected', String(el.dataset.tab === tab)); const lb = el.querySelector('.tl'); if (lb) lb.textContent = t('tab_' + el.dataset.tab); });
  const nav = $('.tabbar'); if (nav) nav.setAttribute('aria-label', t('mainMenu'));
}
function render(focusTitle) {
  applyTheme();
  const top = current();
  const html = top ? pages[top.name](top.arg) : screens[tab]();
  $('#app').innerHTML = html;
  renderTabs();
  if (top && top.name === 'author') loadAuthor(top.arg);
  if (focusTitle) { window.scrollTo(0, 0); setTimeout(() => $('#title')?.focus(), 30); }
}
async function loadAuthor(a) {
  let r = await catalog(`inauthor:"${a}"`, { max: 30 }).catch(() => []);
  const an = norm(a).split(' ').pop();
  const vx = (await voxaSearch(a)).filter(c => norm(c.author).includes(an));
  const seen = new Set(r.map(c => norm(c.title)));
  r = [...vx.filter(c => !seen.has(norm(c.title))), ...r];
  renderPart('#authBox', r.length ? `<div class="group" role="list">${r.map(c => `<div role="listitem">${candRowHTML(c)}</div>`).join('')}</div>` : emptyHTML(t('nothingFound'), t('checkInternet')));
}
function goTab(tb) {
  if (tab === tb && stack[tb].length) stack[tb] = [];
  tab = tb; render(true);
  if (tb === 'search') setTimeout(() => { if (!searchState.results) $('#q')?.focus(); }, 60);
}

/* ================= sheets ================= */
let sheetReturn = null;
function openSheet(html, label) {
  if (!$('#sheets').innerHTML) sheetReturn = document.activeElement;
  $('#sheets').innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="in"><div class="grab" aria-hidden="true"></div>${html}</div></div>`;
  $('#app').setAttribute('aria-hidden', 'true'); $('.tabbar').setAttribute('aria-hidden', 'true');
  setTimeout(() => ($('#sheets [autofocus]') || $('#sheets h2, #sheets h3'))?.focus(), 60);
}
function closeSheet(noRestore) {
  $('#sheets').innerHTML = ''; $('#app').removeAttribute('aria-hidden'); $('.tabbar').removeAttribute('aria-hidden');
  if (!noRestore && sheetReturn && document.contains(sheetReturn)) sheetReturn.focus();
}
function refreshSheet(html) { const i = $('#sheets .in'); if (i) i.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html; }
const sheetHead = (title, right = '<span style="min-width:70px"></span>', focusTitle = true) => `<div class="shead"><button data-close aria-label="${esc(t('back'))}">${icon('back')} ${esc(t('back'))}</button><h2 ${focusTitle ? 'tabindex="-1"' : 'class="sr"'}>${esc(title)}</h2>${right}</div>`;

function pctText(b, p) { const pg = Math.round(p / 100 * (b.pages || 0)); return t(b.format === 'audio' ? 'pctChapterOf' : 'pctPageOf', { p, pg, n: b.pages }); }
function setPage(b, page) {
  const old = b.page || 0; b.page = Math.max(0, Math.min(b.pages, page)); const diff = b.page - old;
  if (diff > 0) { S.sessions.push({ id: uid(), bookId: b.id, date: today(), pages: diff, minutes: 0 }); if (b.status === 'want') setStatus(b, 'reading'); }
  else if (diff < 0) { for (let i = S.sessions.length - 1, left = -diff; i >= 0 && left > 0; i--) { const s = S.sessions[i]; if (s.bookId === b.id && s.date === today() && s.pages && !s.minutes) { const k = Math.min(left, s.pages); s.pages -= k; left -= k; } } S.sessions = S.sessions.filter(s => s.pages || s.minutes); }
  b.lastTouch = Date.now(); persist();
}
const shortStatus = k => t('stShort_' + k);
function bookSheet(b) {
  const prog = b.pages ? `<div class="label">${esc(t('progress'))}</div><div class="group"><div class="field"><div style="font-weight:600">${pct(b)}% · ${esc(t(b.format === 'audio' ? 'chapterOf' : 'pageOf', { p: b.page || 0, n: b.pages }))}</div><div class="bar"><i style="width:${pct(b)}%"></i></div></div>${slider({ id: 'pctR', label: t('howMuchRead'), min: 0, max: 100, value: pct(b), text: pctText(b, pct(b)), extra: 'data-pctr' })}</div>` : '';
  const listsOf = (b.lists || []).map(id => listById(id)?.name).filter(Boolean);
  return `${sheetHead(t('bookDetails'), `<button class="strong" data-edit="${esc(b.id)}">${esc(t('edit'))}</button>`, false)}
  <div class="dtop">${coverHTML(b, 'mini')}<div style="min-width:0"><h3 tabindex="-1">${esc(b.title)}</h3><div style="color:var(--muted)">${esc(b.author)}</div><div style="font-size:14px;color:var(--muted);margin-top:6px">${[b.year, b.pages ? tn(b.pages, 'page') : '', FORMAT(b.format), bookGenre(b)].filter(Boolean).map(esc).join(' · ')}</div>${b.avg ? `<div style="font-size:14px;margin-top:4px"><span class="stars">★</span> ${numTxt(b.avg)} <span style="color:var(--muted)">${b.ratings ? `(${esc(tn(b.ratings, 'reader'))})` : ''}</span></div>` : ''}</div></div>
  <div class="group"><fieldset class="field"><legend>${esc(t('shelf'))}</legend><div class="seg">${STATUS_KEYS.map(k => `<label>${esc(shortStatus(k))}<input type="radio" name="bstatus" value="${k}" ${b.status === k ? 'checked' : ''} aria-label="${esc(STATUS(k))}"></label>`).join('')}</div></fieldset>
  ${slider({ id: 'rateR', label: t('yourRatingLabel'), min: 0, max: 5, step: 0.5, value: b.rating || 0, text: rateTxt(b.rating || 0), extra: 'data-rater' })}<div class="field stars big" id="rateStars" aria-hidden="true">${starsTxt(b.rating || 0) || '☆☆☆☆☆'}</div></div>
  ${b.status === 'reading' || b.status === 'want' ? prog : ''}
  <div class="btns">${b.status !== 'read' ? `<button class="btn primary" data-session="${esc(b.id)}">${esc(t('logSession'))}</button>` : ''}${b.status === 'reading' ? `<button class="btn plain" data-finish="${esc(b.id)}">${esc(t('finishedIt'))}</button>` : ''}${b.status === 'read' ? `<button class="btn plain" data-askformat="${esc(b.id)}">${esc(t('formatReadIn', { f: FORMAT(b.format) }))}</button>` : ''}</div>
  <div class="label">${esc(t('lists'))}</div><div class="group">${cell({ attrs: `data-picklists="${esc(b.id)}"`, ico: 'folder', icoColor: '#2B7BE4', label: listsOf.length ? listsOf.join(', ') : t('addToList'), aria: listsOf.length ? t('inLists', { x: listsOf.join(', ') }) : t('addToList') })}</div>
  ${b.review ? `<div class="label">${esc(t('yourReview'))}</div><div class="desc">${esc(b.review)}</div>` : ''}
  ${b.description ? `<div class="label">${esc(t('aboutBook'))}</div><div class="desc">${esc(b.description.slice(0, 1500))}${b.description.length > 1500 ? '…' : ''}</div>` : ''}
  <div class="label">${esc(t('dates'))}</div><div class="group">${infoRow(t('added'), fmtDate(b.dateAdded))}${b.dateStarted ? infoRow(t('started'), fmtDate(b.dateStarted)) : ''}${b.dateFinished ? infoRow(t('finished'), fmtDate(b.dateFinished)) : ''}${b.minutes ? infoRow(t('readingTime'), hours(b.minutes)) : ''}${b.isbn ? infoRow('ISBN', b.isbn) : ''}</div>
  <div class="btns">${b.author ? `<button class="btn plain" data-author="${esc(b.author.split(',')[0])}">${esc(t('moreBy', { a: b.author.split(',')[0] }))}</button>` : ''}<button class="btn danger" data-askdel="${esc(b.id)}">${esc(t('deleteFromLibrary'))}</button><div id="delBox"></div></div>`;
}
function candSheet(c) {
  const lib = findSame(c);
  return `${sheetHead(t('bookDetails'), undefined, false)}
  <div class="dtop">${coverHTML(c, 'mini')}<div style="min-width:0"><h3 tabindex="-1">${esc(c.title)}</h3><div style="color:var(--muted)">${esc(c.author)}</div><div style="font-size:14px;color:var(--muted);margin-top:6px">${[c.year, c.pages ? tn(c.pages, 'page') : '', c.publisher].filter(Boolean).map(esc).join(' · ')}</div>${c.avg ? `<div style="font-size:14px;margin-top:4px"><span class="stars">★</span> ${numTxt(c.avg)} <span style="color:var(--muted)">${c.ratings ? `(${esc(tn(c.ratings, 'reader'))})` : ''}</span></div>` : ''}</div></div>
  ${lib ? `<div class="btns"><button class="btn plain" data-book="${esc(lib.id)}">${esc(t('isInLibraryOpen', { shelf: STATUS(lib.status) }))}</button></div>` : `<div class="label">${esc(t('addToApp'))}</div><div class="group">${STATUS_KEYS.filter(k => k !== 'dnf').map(k => cell({ attrs: `data-addto="${k}" data-c="${esc(remember(c))}"`, label: STATUS(k), aria: t('addTo', { x: STATUS(k) }) })).join('')}</div>`}
  ${c.description ? `<div class="label">${esc(t('aboutBook'))}</div><div class="desc">${esc(c.description.slice(0, 2000))}</div>` : ''}
  ${c.author ? `<div class="btns"><button class="btn plain" data-author="${esc(c.author.split(',')[0])}">${esc(t('moreBy', { a: c.author.split(',')[0] }))}</button></div>` : ''}`;
}
function quickAddSheet(c) {
  return `${sheetHead(t('addNamed', { title: c.title }))}
  <div class="label">${esc(t('whichShelf'))}</div><div class="group">${STATUS_KEYS.filter(k => k !== 'dnf').map((k, i) => cell({ attrs: `data-addto="${k}" data-c="${esc(remember(c))}" ${i === 0 ? 'autofocus' : ''}`, label: STATUS(k), aria: t('addTo', { x: STATUS(k) }) })).join('')}</div>`;
}
/* long-press menu */
function actionSheet(kind, key) {
  const b = kind === 'book' ? byId(key) : null, c = kind === 'cand' ? candStore[key] : null;
  const item = b || c; if (!item) return;
  const ref = b ? `data-ab="${esc(b.id)}"` : `data-ac="${esc(key)}"`;
  const lib = b || findSame(c);
  const opts = [];
  if (!lib || lib.status !== 'want') opts.push(['want', t('act_want')]);
  if (!lib || lib.status !== 'read') opts.push(['read', t('act_read')]);
  opts.push(['rate', t('act_rate')], ['open', t('act_open')]);
  if (item.author) opts.push(['author', t('act_author', { a: item.author.split(',')[0] })]);
  if (lib) opts.push(['lists', t('addToList')]);
  openSheet(`${sheetHead(item.title)}<div class="group">${opts.map(([k, v], i) => cell({ attrs: `data-act="${k}" ${ref} ${i === 0 ? 'autofocus' : ''}`, label: v, chev: false })).join('')}</div>`, t('optionsFor', { x: item.title }));
}
function rateSheet(b) {
  return `${sheetHead(t('rateTitle', { title: b.title }), `<button class="strong" data-close>${esc(t('done'))}</button>`)}
  <div class="group">${slider({ id: 'rateR2', label: t('yourRatingLabel'), min: 0, max: 5, step: 0.5, value: b.rating || 0, text: rateTxt(b.rating || 0), extra: `data-rater="${esc(b.id)}" autofocus` })}<div class="field stars big" id="rateStars" aria-hidden="true">${starsTxt(b.rating || 0) || '☆☆☆☆☆'}</div></div>`;
}
function formatSheet(b) {
  return `${sheetHead(t('whatFormat'))}
  <div class="foot" style="margin:0 4px 10px">${esc(b.title)}</div><div class="group" role="radiogroup" aria-label="${esc(t('whatFormat'))}">${FORMAT_KEYS.map((k, i) => cell({ attrs: `data-setformat="${k}" data-fb="${esc(b.id)}" ${b.format === k || (i === 0 && !FORMAT_KEYS.includes(b.format)) ? 'autofocus' : ''}`, label: FORMAT(k), value: b.format === k ? '✓' : '', aria: FORMAT(k) + (b.format === k ? ', ' + t('selected') : ''), chev: false })).join('')}</div>`;
}
function markRead(b, after) {
  setStatus(b, 'read'); b.lastTouch = Date.now(); persist();
  openSheet(formatSheet(b), t('whatFormat'));
  formatAfter = after || null;
}
let formatAfter = null;
function genreSheet() {
  const sel = new Set(S.profile.genres || []);
  return `${sheetHead(t('favGenres'), `<button class="strong" data-close>${esc(t('done'))}</button>`)}
  <div class="foot" style="margin:0 4px 10px">${esc(t('genresHint'))}</div>
  ${GENRE_GROUPS.map(([gk, ids]) => `<div class="label">${esc(t(gk))}</div><div class="group">${ids.map(id => `<label class="cell" style="cursor:pointer"><span class="grow">${esc(genreName(id))}</span><span class="toggle"><input type="checkbox" data-genretoggle="${id}" ${sel.has(id) ? 'checked' : ''} aria-label="${esc(genreName(id))}"><span></span></span></label>`).join('')}</div>`).join('')}`;
}
function editSheet(b) {
  const isNew = !b.id;
  b = Object.assign({ title: '', author: '', pages: 0, page: 0, format: 'print', status: 'want', review: '', dateFinished: '', genre: '' }, b);
  const allGenres = GENRE_GROUPS.flatMap(g => g[1]);
  return `<form id="editForm" data-id="${esc(b.id || '')}">${sheetHead(isNew ? t('newBook') : t('edit'), `<button type="submit" class="strong">${esc(t('save'))}</button>`).replace('data-close', 'type="button" data-close')}
  <div class="group">
   <div class="field"><label for="e-title">${esc(t('bookTitle'))}</label><input id="e-title" name="title" value="${esc(b.title)}" ${isNew ? 'autofocus' : ''}></div>
   <div class="field"><label for="e-author">${esc(t('author'))}</label><input id="e-author" name="author" value="${esc(b.author)}"></div>
   <fieldset class="field"><legend>${esc(t('format'))}</legend><div class="seg">${FORMAT_KEYS.map(k => `<label>${esc(FORMAT(k))}<input type="radio" name="format" value="${k}" ${b.format === k ? 'checked' : ''}></label>`).join('')}</div></fieldset>
   ${isNew ? `<fieldset class="field"><legend>${esc(t('shelf'))}</legend><div class="seg">${STATUS_KEYS.map(k => `<label>${esc(shortStatus(k))}<input type="radio" name="status" value="${k}" ${b.status === k ? 'checked' : ''} aria-label="${esc(STATUS(k))}"></label>`).join('')}</div></fieldset>` : ''}
   <div class="field"><label for="e-genre">${esc(t('genre'))}</label><select id="e-genre" name="genre"><option value="">${esc(t('noGenre'))}</option>${allGenres.map(id => `<option value="${id}" ${b.genre === id ? 'selected' : ''}>${esc(genreName(id))}</option>`).join('')}</select></div>
   ${slider({ id: 'e-pagesR', label: t('pagesCount'), min: 0, max: Math.max(2000, b.pages || 0), step: 5, value: b.pages || 0, text: tn(b.pages || 0, 'page'), extra: 'data-link="e-pages"' })}
   <div class="field"><label for="e-pages">${esc(t('exactPages'))}</label><input id="e-pages" name="pages" type="number" inputmode="numeric" min="0" value="${b.pages || ''}" data-link="e-pagesR"></div>
   ${slider({ id: 'e-pageR', label: t('howMuchRead'), min: 0, max: 100, value: b.pages ? Math.round((b.page || 0) / b.pages * 100) : 0, text: t('pctOnly', { p: b.pages ? Math.round((b.page || 0) / b.pages * 100) : 0 }), extra: 'data-pctedit' })}
   <input type="hidden" id="e-page" name="page" value="${b.page || 0}">
   <div class="field"><label for="e-fin">${esc(t('finishDate'))}</label><input id="e-fin" name="dateFinished" type="date" value="${esc(b.dateFinished || '')}"></div>
   <div class="field"><label for="e-rev">${esc(t('reviewNotes'))}</label><textarea id="e-rev" name="review">${esc(b.review)}</textarea></div>
  </div><p class="foot" id="editErr" role="alert"></p></form>`;
}
function sessionSheet(b) {
  return `<form id="sessionForm" data-id="${esc(b.id)}">${sheetHead(t('readingSession'), `<button type="submit" class="strong">${esc(t('save'))}</button>`).replace('data-close', 'type="button" data-close')}
  <div class="foot" style="margin:0 4px 10px">${esc(b.title)}</div><div class="group">
   <div class="field"><label for="s-pages">${esc(t(b.format === 'audio' ? 'chaptersListened' : 'pagesReadQ'))}</label><input id="s-pages" name="pages" type="number" inputmode="numeric" min="0" autofocus></div>
   <div class="field"><label for="s-min">${esc(t('minutesReadQ'))}</label><input id="s-min" name="minutes" type="number" inputmode="numeric" min="0"></div>
   <div class="field"><label for="s-date">${esc(t('date'))}</label><input id="s-date" name="date" type="date" value="${today()}"></div>
  </div><p class="foot">${esc(t('minutesNote'))}</p></form>`;
}
function pickListsSheet(b) {
  return `${sheetHead(t('lists'), `<button class="strong" data-newlist>${esc(t('newList'))}</button>`)}
  ${S.lists.length ? `<div class="group">${S.lists.map(l => `<label class="cell" style="cursor:pointer"><span class="grow">${esc(l.name)}</span><span class="toggle"><input type="checkbox" data-togglelist="${esc(l.id)}" data-bk="${esc(b.id)}" ${(b.lists || []).includes(l.id) ? 'checked' : ''} aria-label="${esc(l.name)}"><span></span></span></label>`).join('')}</div>` : emptyHTML(t('noListsYet'), t('pressNewList'))}`;
}
function listNameSheet(l) {
  return `<form id="listForm" data-id="${esc(l ? l.id : '')}">${sheetHead(l ? t('renameList') : t('newList'), `<button type="submit" class="strong">${esc(t('save'))}</button>`).replace('data-close', 'type="button" data-close')}
  <div class="group"><div class="field"><label for="l-name">${esc(t('listName'))}</label><input id="l-name" name="name" value="${esc(l ? l.name : '')}" autofocus></div></div><p class="foot" id="listErr" role="alert"></p></form>
  ${l ? `<div class="btns"><button class="btn danger" data-dellist="${esc(l.id)}">${esc(t('deleteList'))}</button></div><p class="foot">${esc(t('deleteListNote'))}</p>` : ''}`;
}
function addToListSheet(id) {
  const l = listById(id); const cands = [...S.books].sort((a, b) => a.title.localeCompare(b.title, LOC()));
  return `${sheetHead(t('addToNamed', { x: l.name }), `<button class="strong" data-close>${esc(t('done'))}</button>`)}
  ${cands.length ? `<div class="group">${cands.map(b => `<label class="cell" style="cursor:pointer"><span class="grow">${esc(b.title)}<div class="val" style="font-size:14px">${esc(b.author)}</div></span><span class="toggle"><input type="checkbox" data-togglelist="${esc(id)}" data-bk="${esc(b.id)}" ${(b.lists || []).includes(id) ? 'checked' : ''} aria-label="${esc(b.title + byAuthor(b.author))}"><span></span></span></label>`).join('')}</div>` : emptyHTML(t('libraryEmpty'), t('libraryEmptyHint'))}`;
}

/* ================= import / export ================= */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0]);
}
function importCSV(text) {
  const rows = parseCSV(text.replace(/^﻿/, '')); if (rows.length < 2) throw new Error(t('csvNoBooks'));
  const H = rows[0].map(h => h.trim().toLowerCase());
  const col = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
  const c = { title: col('title'), author: col('author', 'authors'), isbn: col('isbn', 'isbn/uid'), isbn13: col('isbn13'), rating: col('my rating', 'star rating'), pages: col('number of pages'), year: col('year published', 'original publication year'),
    dateRead: col('date read', 'last date read'), dateAdded: col('date added'), shelves: col('bookshelves', 'tags'), excl: col('exclusive shelf', 'read status'), review: col('my review', 'review'), publisher: col('publisher'), format: col('binding', 'format'), started: col('date started', 'dates read') };
  if (c.title < 0) throw new Error(t('csvUnknown'));
  const g = (r, i) => i >= 0 ? String(r[i] || '').trim() : '';
  const clean = s => s.replace(/^="?|"$/g, '').replace(/[^0-9Xx]/g, '');
  const date = s => { s = s.trim(); if (!s) return ''; const m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
  const shelfMap = s => { s = s.toLowerCase(); if (s === 'read') return 'read'; if (s === 'currently-reading') return 'reading'; if (s === 'to-read') return 'want'; if (/did-not-finish|dnf|abandon|nefinal/.test(s)) return 'dnf'; return null; };
  let added = 0, skipped = 0, listsMade = 0;
  for (const r of rows.slice(1)) {
    const title = g(r, c.title); if (!title) continue;
    const cand = { title, author: g(r, c.author), isbn: clean(g(r, c.isbn13)) || clean(g(r, c.isbn)), pages: +g(r, c.pages) || 0, year: g(r, c.year).slice(0, 4), publisher: g(r, c.publisher) };
    if (findSame(cand)) { skipped++; continue; }
    const ex = g(r, c.excl); const st = shelfMap(ex) || 'want';
    const shelves = g(r, c.shelves).split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (ex && !shelfMap(ex)) shelves.push(ex);
    const fmt = /audio/i.test(g(r, c.format)) ? 'audio' : /kindle|ebook|e-book/i.test(g(r, c.format)) ? 'ebook' : 'print';
    const b = { id: uid(), ext: '', ...cand, page: st === 'read' ? cand.pages : 0, description: '', cover: cand.isbn ? `https://covers.openlibrary.org/b/isbn/${cand.isbn}-M.jpg?default=false` : '', categories: [], avg: 0, ratings: 0, genre: '',
      format: fmt, status: st, rating: Math.round((+g(r, c.rating) || 0) * 2) / 2, review: g(r, c.review).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''), lists: [],
      dateAdded: date(g(r, c.dateAdded)) || today(), dateStarted: date(g(r, c.started)), dateFinished: st === 'read' ? (date(g(r, c.dateRead)) || '') : '', minutes: 0 };
    for (const sh of shelves) { if (shelfMap(sh)) continue; let l = S.lists.find(x => norm(x.name) === norm(sh)); if (!l) { l = { id: uid(), name: sh }; S.lists.push(l); listsMade++; } b.lists.push(l.id); }
    S.books.push(b); added++;
  }
  S.events.push({ id: uid(), bookId: '', title: tn(added, 'book'), type: 'import', date: today() });
  persist(); return { added, skipped, listsMade };
}

/* ================= events ================= */
let suppressClick = false;
document.addEventListener('click', e => {
  if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
  const el = e.target.closest('button,[data-close],label.btn'); if (!el) return;
  const d = el.dataset;
  if ('close' in d) { closeSheet(); if (formatAfter) { const f = formatAfter; formatAfter = null; f(); } return; }
  if (d.tab) { goTab(d.tab); return; }
  if ('back' in d) { pop(); return; }
  if (d.go) { goTab(d.go); return; }
  if (d.push) { const titles = { profile: t('editProfile'), account: t('account'), settings: t('settings'), import: t('import'), backup: t('backup'), history: t('historyTitle'), install: t('install'), about: t('about'), stats: t('stats'), language: t('language') }; push(d.push, null, titles[d.push]); return; }
  if (d.libseg) { if (tab !== 'library') { tab = 'library'; stack.library = []; } libSeg = d.libseg; render(true); return; }
  if (el.hasAttribute('data-month')) { const i = +d.month; push('month', `${statYear}-${i}`, `${MONTH(i)} ${statYear}`); return; }
  if (d.year) { statYear = +d.year; openMonths.clear(); render(); $(`[data-year="${statYear}"]`)?.focus(); return; }
  if (d.book) { const b = byId(d.book); if (b) { closeSheet(true); openSheet(bookSheet(b), b.title); } return; }
  if (d.cand) { const c = candStore[d.cand]; if (c) openSheet(candSheet(c), c.title); return; }
  if (d.quickadd) { const c = candStore[d.quickadd]; if (c) openSheet(quickAddSheet(c), t('add')); return; }
  if (d.addto) { const c = candStore[d.c]; if (!c) return; const b = addBook(c, d.addto); libSeg = b.status; toast(t('addedTo', { title: b.title, shelf: STATUS(b.status) })); render(); if (b.status === 'read') openSheet(formatSheet(b), t('whatFormat')); else closeSheet(); return; }
  if ('manual' in d) { openSheet(editSheet({ title: searchState.q }), t('newBook')); return; }
  if (d.edit) { const b = byId(d.edit); if (b) { closeSheet(true); openSheet(editSheet(b), t('edit')); } return; }
  if (d.session) { const b = byId(d.session); if (b) { closeSheet(true); openSheet(sessionSheet(b), t('readingSession')); } return; }
  if (d.finish) { const b = byId(d.finish); if (b) { toast(t('congrats', { title: b.title })); markRead(b, () => openSheet(bookSheet(b), b.title)); render(); } return; }
  if (d.askformat) { const b = byId(d.askformat); if (b) { openSheet(formatSheet(b), t('whatFormat')); formatAfter = () => openSheet(bookSheet(b), b.title); } return; }
  if (d.setformat) { const b = byId(d.fb); if (b) { b.format = d.setformat; persist(); toast(t('formatSaved', { f: FORMAT(b.format) })); closeSheet(true); render(); if (formatAfter) { const f = formatAfter; formatAfter = null; f(); } } return; }
  if (d.act) { doAction(d.act, d.ab, d.ac); return; }
  if (d.askdel) { $('#delBox').innerHTML = `<div class="confirm" role="group" aria-label="${esc(t('confirmDelete'))}"><div>${esc(t('confirmDeleteQ'))}</div><button class="btn danger" style="background:var(--accent-soft)" data-del="${esc(d.askdel)}">${esc(t('yesDelete'))}</button><button class="btn plain" data-nodel>${esc(t('noKeep'))}</button></div>`; $('[data-del]').focus(); return; }
  if ('nodel' in d) { $('#delBox').innerHTML = ''; $('[data-askdel]').focus(); return; }
  if (d.del) { const b = byId(d.del); S.books = S.books.filter(x => x.id !== d.del); S.sessions = S.sessions.filter(s => s.bookId !== d.del); persist(); closeSheet(true); render(); toast(t('deletedNamed', { title: b ? b.title : '' })); $('#title')?.focus(); return; }
  if (d.picklists) { const b = byId(d.picklists); if (b) { closeSheet(true); openSheet(pickListsSheet(b), t('lists')); sheetBook = b.id; } return; }
  if ('newlist' in d) { openSheet(listNameSheet(null), t('newList')); return; }
  if (d.openlist) { const l = listById(d.openlist); if (l) push('list', l.id, l.name); return; }
  if (d.listmenu) { const l = listById(d.listmenu); if (l) openSheet(listNameSheet(l), t('editList')); return; }
  if (d.dellist) { const l = listById(d.dellist); S.lists = S.lists.filter(x => x.id !== d.dellist); S.books.forEach(b => b.lists = (b.lists || []).filter(id => id !== d.dellist)); persist(); closeSheet(true); if (current() && current().name === 'list') stack[tab].pop(); render(true); toast(t('listDeleted', { x: l ? l.name : '' })); return; }
  if (d.addtolist) { openSheet(addToListSheet(d.addtolist), t('addToListTitle')); return; }
  if (d.genre) { const i = +d.genre; if (discoverState.genre === i) { discoverState = { genre: null, results: null }; render(); return; } discoverState = { genre: i, results: null }; render(); $(`[data-genre="${i}"]`)?.focus(); catalog(DISCOVER[i][1], { max: 30 }).then(r => { if (discoverState.genre !== i) return; discoverState.results = r; renderPart('#genreBox', r.length ? `<div class="group" role="list">${r.map(c => `<div role="listitem">${candRowHTML(c)}</div>`).join('')}</div>` : emptyHTML(t('nothingFound'), t('tryOtherGenre'))); say(`${genreName(DISCOVER[i][0])}: ${tn(r.length, 'book')}`); }); return; }
  if (d.author) { closeSheet(true); push('author', d.author, d.author); return; }
  if ('genrepick' in d) { openSheet(genreSheet(), t('favGenres')); return; }
  if ('friends' in d) { toast(t('friendsSoon')); return; }
  if ('export' in d) { exportBackup(); return; }
  if ('askwipe' in d) { $('#wipeBox').innerHTML = `<div class="confirm" style="margin-top:12px" role="group" aria-label="${esc(t('confirmWipe'))}"><div>${esc(t('confirmWipeQ'))}</div><button class="btn danger" style="background:var(--accent-soft)" data-wipe>${esc(t('yesDeleteAll'))}</button><button class="btn plain" data-nowipe>${esc(t('no'))}</button></div>`; $('[data-wipe]').focus(); return; }
  if ('nowipe' in d) { $('#wipeBox').innerHTML = ''; return; }
  if ('wipe' in d) { const lang = S.settings.lang; S = blank(); S.settings.lang = lang; persist(); stack.more = []; render(true); toast(t('allDeleted')); return; }
});
function doAction(act, bid, ckey) {
  let b = bid ? byId(bid) : null; const c = ckey ? candStore[ckey] : null;
  if (!b && c) b = findSame(c) || null;
  const ensure = st => { if (!b) { b = addBook(c, st); return true; } return false; };
  closeSheet(true);
  switch (act) {
    case 'want': if (!ensure('want')) setStatus(b, 'want'); toast(t('addedTo', { title: b.title, shelf: STATUS('want') })); render(); break;
    case 'read': if (!b) b = addBook(c, 'read'); markRead(b); render(); break;
    case 'rate': if (!b) { b = addBook(c, 'read'); render(); } openSheet(rateSheet(b), t('rateTitle', { title: b.title })); break;
    case 'open': if (b) openSheet(bookSheet(b), b.title); else openSheet(candSheet(c), c.title); break;
    case 'author': push('author', (b || c).author.split(',')[0], (b || c).author.split(',')[0]); break;
    case 'lists': if (b) { openSheet(pickListsSheet(b), t('lists')); sheetBook = b.id; } break;
  }
}
let sheetBook = null;
document.addEventListener('change', e => {
  const el = e.target;
  if (el.name === 'bstatus') {
    const b = byId($('#sheets [data-edit]')?.dataset.edit); if (!b) return;
    if (el.value === 'read') { markRead(b, () => openSheet(bookSheet(b), b.title)); render(); return; }
    setStatus(b, el.value); b.lastTouch = Date.now(); persist(); say(t('movedTo', { x: STATUS(el.value) })); refreshSheet(bookSheet(b)); $(`#sheets input[name=bstatus][value=${el.value}]`)?.focus(); render(); return;
  }
  if (el.dataset.rater !== undefined || el.dataset.pctr !== undefined || el.dataset.goalr !== undefined) { rangeCommit(el); return; }
  if (el.dataset.togglelist) { const b = byId(el.dataset.bk); if (!b) return; b.lists = b.lists || []; if (el.checked) { if (!b.lists.includes(el.dataset.togglelist)) b.lists.push(el.dataset.togglelist); } else b.lists = b.lists.filter(x => x !== el.dataset.togglelist); persist(); say(el.checked ? t('addedToList') : t('removedFromList')); render(); return; }
  if (el.dataset.genretoggle) { const id = el.dataset.genretoggle; const s = new Set(S.profile.genres || []); if (el.checked) s.add(id); else s.delete(id); S.profile.genres = [...s]; persist(); say(el.checked ? t('genreAdded') : t('genreRemoved')); render(); return; }
  if (el.dataset.sort !== undefined) { S.settings.sort = el.value; persist(); render(); $('#sortSel')?.focus(); say(t('sortedBy', { x: t('sort_' + el.value) })); return; }
  if (el.name === 'theme') { S.settings.theme = el.value; persist(); applyTheme(); return; }
  if (el.name === 'lang') { S.settings.lang = el.value; persist(); const top = current(); if (top) top.title = t('language'); stack[tab].forEach(p => { if (p.name !== 'list' && p.name !== 'author' && p.name !== 'language') p.title = null; }); render(); $(`input[name=lang][value=${el.value}]`)?.focus(); say(t('languageChanged')); return; }
  if (el.id === 'onlyRo') { S.settings.onlyRo = el.checked; persist(); for (const k in cache) delete cache[k]; say(el.checked ? t('roFirstOn') : t('roFirstOff')); return; }
  if (el.id === 'csvFile' && el.files[0]) { const fr = new FileReader(); fr.onload = () => { try { const r = importCSV(String(fr.result)); renderPart('#importOut', `<div class="desc" style="margin-top:14px">${esc(t('importDone', { x: tn(r.added, 'book') }) + (r.listsMade ? ' ' + t('importLists', { x: tn(r.listsMade, 'list') }) : '') + (r.skipped ? ' ' + t('importSkipped', { x: tn(r.skipped, 'book') }) : ''))}</div>`); say(t('importDone', { x: tn(r.added, 'book') })); } catch (err) { renderPart('#importOut', `<div class="desc" style="margin-top:14px">${esc(err.message)}</div>`); say(err.message); } }; fr.readAsText(el.files[0]); return; }
  if (el.id === 'jsonFile' && el.files[0]) { const fr = new FileReader(); fr.onload = () => { try { const d = JSON.parse(String(fr.result)); if (!d.books) throw 0; const lang = S.settings.lang; S = Object.assign(blank(), d); S.settings = Object.assign(blank().settings, d.settings || {}, { lang }); persist(); renderPart('#backupOut', `<div class="desc" style="margin-top:14px">${esc(t('restored', { x: tn(S.books.length, 'book') }))}</div>`); say(t('restoredShort')); } catch (err) { renderPart('#backupOut', `<div class="desc" style="margin-top:14px">${esc(t('notBackup'))}</div>`); } }; fr.readAsText(el.files[0]); return; }
});
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target, fd = new FormData(f);
  if (f.id === 'searchForm') { clearTimeout(liveT); const q = $('#q').value; $('#q').blur(); runSearch(q); return; }
  if (f.id === 'editForm') {
    const title = String(fd.get('title') || '').trim(); if (!title) { $('#editErr').textContent = t('writeTitle'); $('#e-title').focus(); return; }
    const id = f.dataset.id; let b = id ? byId(id) : null;
    const vals = { title, author: String(fd.get('author') || '').trim(), format: fd.get('format') || 'print', genre: String(fd.get('genre') || ''), pages: +fd.get('pages') || 0, page: +fd.get('page') || 0, review: String(fd.get('review') || '').trim(), dateFinished: String(fd.get('dateFinished') || '') };
    if (b) { Object.assign(b, vals); b.lastTouch = Date.now(); persist(); closeSheet(true); openSheet(bookSheet(b), b.title); toast(t('changesSaved')); }
    else { b = addBook(vals, fd.get('status') || 'want'); Object.assign(b, vals); libSeg = b.status; persist(); closeSheet(true); toast(t('addedNamed', { title: b.title })); }
    render(); return;
  }
  if (f.id === 'sessionForm') { const b = byId(f.dataset.id); if (!b) return; const p = +fd.get('pages') || 0, m = +fd.get('minutes') || 0; if (!p && !m) { toast(t('writePagesOrMinutes')); return; } logSession(b, p, m, String(fd.get('date') || today())); b.lastTouch = Date.now(); persist(); closeSheet(true); openSheet(bookSheet(b), b.title); toast(t('sessionSaved')); render(); return; }
  if (f.id === 'listForm') { const name = String(fd.get('name') || '').trim(); if (!name) { $('#listErr').textContent = t('writeListName'); return; } const id = f.dataset.id; if (id) { listById(id).name = name; const top = current(); if (top && top.name === 'list') top.title = name; } else S.lists.push({ id: uid(), name }); persist(); closeSheet(true); render(); toast(id ? t('listRenamed') : t('listCreated', { x: name })); if (sheetBook && !id) { const b = byId(sheetBook); if (b) openSheet(pickListsSheet(b), t('lists')); } return; }
  if (f.id === 'profileForm') { S.profile.name = String(fd.get('name') || '').trim(); S.profile.bio = String(fd.get('bio') || '').trim(); persist(); toast(t('profileSaved')); return; }
  if (f.id === 'accountForm') { S.account = { username: String(fd.get('username') || '').trim(), email: String(fd.get('email') || '').trim() }; persist(); toast(t('accountSaved')); return; }
});
function exportBackup() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const name = `regatul-cartilor-${today()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Regatul Cărților' }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(t('backupSaved'));
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#sheets').innerHTML) closeSheet();
  const el = e.target;
  if (el.getAttribute && el.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const tabs = [...el.parentElement.querySelectorAll('[role=tab]')]; const i = tabs.indexOf(el); const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; n.focus(); n.click(); }
  if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && el.closest) { const it = el.closest('[data-book],[data-cand]'); if (it) { e.preventDefault(); openActionsFor(it); } }
});
/* long press (also VoiceOver double-tap-and-hold) and right click open the options menu */
function openActionsFor(it) {
  if (it.closest('#sheets') && !it.closest('[role=list]')) return;
  if (it.dataset.book) actionSheet('book', it.dataset.book); else if (it.dataset.cand) actionSheet('cand', it.dataset.cand);
}
let lpTimer = null, lpStart = null;
document.addEventListener('touchstart', e => {
  const it = e.target.closest && e.target.closest('[data-book],[data-cand]'); if (!it || it.classList.contains('go') || it.classList.contains('addmini')) return;
  const tch = e.touches[0]; lpStart = { x: tch.clientX, y: tch.clientY };
  clearTimeout(lpTimer);
  lpTimer = setTimeout(() => { lpTimer = null; suppressClick = true; setTimeout(() => { suppressClick = false; }, 900); if (navigator.vibrate) navigator.vibrate(15); openActionsFor(it); }, 550);
}, { passive: true });
document.addEventListener('touchmove', e => { if (!lpTimer || !lpStart) return; const tch = e.touches[0]; if (Math.abs(tch.clientX - lpStart.x) > 10 || Math.abs(tch.clientY - lpStart.y) > 10) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true });
document.addEventListener('touchend', () => { clearTimeout(lpTimer); lpTimer = null; });
document.addEventListener('contextmenu', e => { const it = e.target.closest && e.target.closest('[data-book],[data-cand]'); if (it && !it.classList.contains('go') && !it.classList.contains('addmini')) { e.preventDefault(); openActionsFor(it); } });

/* ================= start ================= */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
})();
