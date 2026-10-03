/* Raftul Meu — aplicație de lectură în limba română, gândită pentru VoiceOver.
   Datele utilizatorului stau pe telefon (localStorage). Catalogul extern: Google Books, Voxa și Open Library, cărți din orice țară. */
(() => {
'use strict';

/* ================= constante ================= */
const STATUS = { reading: 'Citesc acum', want: 'Vreau să citesc', read: 'Citite', dnf: 'Nefinalizate' };
const FORMATS = { print: 'Tipărită', ebook: 'eBook', audio: 'Audiobook' };
const MONTHS = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
const COLORS = ['#2448B8','#B0413E','#2E7D5B','#8A5A2B','#6B4FA3','#1F7A8C','#A2662A','#4B5563','#9C3D6E','#3F6E2A'];
const GENRES = [
  ['Romane', 'subject:fiction'], ['Literatură română', 'literatura romana'], ['Clasici', 'subject:classics'], ['Poezie', 'subject:poetry'],
  ['Istorie', 'subject:history'], ['Psihologie', 'subject:psychology'], ['Dezvoltare personală', 'subject:self-help'],
  ['Fantasy', 'subject:fantasy'], ['Science fiction', 'subject:"science fiction"'], ['Polițiste', 'subject:mystery'],
  ['Copii', 'subject:juvenile'], ['Muzică', 'subject:music'], ['Religie', 'subject:religion'], ['Biografii', 'subject:biography']
];
const AUTHORS = ['Liviu Rebreanu','Mircea Cărtărescu','Mircea Eliade','Ana Blandiana','Fiodor Dostoievski','Lev Tolstoi','Gabriel García Márquez','Haruki Murakami','Agatha Christie','Stephen King','Jane Austen','George Orwell','Yuval Noah Harari','Freida McFadden'];
const GB_KEY = 'AIzaSyDo2zgdcJa20QAX8toPECUUZMAMsNyR5SI';   // cheie Google Books, merge doar de pe razvan-raftul.github.io
const KEY = 'raftul-meu-v2';

/* ================= stare ================= */
const blank = () => ({
  books: [], lists: [], sessions: [], events: [],
  profile: { name: '', bio: '', favorite: '' },
  account: { email: '', username: '' },
  settings: { theme: 'auto', goal: 12, onlyRo: true }
});
let S = blank();
try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) S = Object.assign(blank(), d); } catch (e) {}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Nu am putut salva pe telefon. Spațiul poate fi plin.'); } }

let tab = 'home';
let stack = { home: [], library: [], discover: [], search: [], more: [] };   // pagini deschise în fiecare tab
let libSeg = 'reading';
let statYear = new Date().getFullYear();
let searchState = { q: '', results: null, loading: false, err: '', autoAdd: false };
let discoverState = { genre: null, results: null, loading: false };
const cache = {};

/* ================= utilitare ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }); };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const color = s => COLORS[[...String(s || '?')].reduce((h, c) => h + c.charCodeAt(0), 0) % COLORS.length];
const plural = (n, one, many) => n === 1 ? `1 ${one}` : `${n} ${many}`;
const hours = m => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`; };
const hoursSpoken = m => { const h = Math.floor(m / 60), r = Math.round(m % 60); const hs = h === 1 ? '1 oră' : `${h} ore`; const ms = r === 1 ? '1 minut' : `${r} minute`; return h ? (r ? `${hs} și ${ms}` : hs) : ms; };
const starsTxt = n => { if (!n) return ''; const f = Math.floor(n), h = n - f >= 0.5 ? 1 : 0; return '★'.repeat(f) + (h ? '½' : '') + '☆'.repeat(5 - f - h); };
const rateTxt = n => n ? `${String(n).replace('.', ',')} ${n === 1 ? 'stea' : 'stele'}` : 'Fără notă';
const slider = ({ id, name = '', label, min, max, step = 1, value, text, extra = '' }) => `<div class="field"><label for="${id}">${esc(label)}</label><div class="range"><input type="range" id="${id}" ${name ? `name="${name}"` : ''} min="${min}" max="${max}" step="${step}" value="${value}" aria-valuetext="${esc(text)}" ${extra}><output for="${id}" aria-hidden="true">${esc(text)}</output></div></div>`;
const goalText = g => plural(g, 'carte', 'cărți') + ' pe an';
const pct = b => b.pages ? Math.min(100, Math.round((b.page || 0) / b.pages * 100)) : 0;
const icon = name => ICONS[name] || '';
function say(msg) { const l = $('#live'); l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 80); }
let toastT;
function toast(msg) { say(msg); let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('aria-hidden', 'true'); document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); }
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
  chart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 20V11h3v9zm6.5 0V4h3v16zM17 20v-7h3v7z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.6 2.1-1 1.7L11 13V6h2z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5C5.5 4.3 8.6 4.3 12 6c3.4-1.7 6.5-1.7 9-.5v13c-2.5-1.2-5.6-1.2-9 .5-3.4-1.7-6.5-1.7-9-.5z"/></svg>'
};

/* ================= temă ================= */
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}

/* ================= catalog extern ================= */
function gbToBook(v) {
  const i = v.volumeInfo || {};
  const ids = i.industryIdentifiers || [];
  const isbn = (ids.find(x => x.type === 'ISBN_13') || ids.find(x => x.type === 'ISBN_10') || {}).identifier || '';
  let cover = (i.imageLinks && (i.imageLinks.thumbnail || i.imageLinks.smallThumbnail)) || '';
  cover = cover.replace(/^http:/, 'https:').replace('&edge=curl', '');
  return {
    ext: 'gb:' + v.id, title: [i.title, i.subtitle].filter(Boolean).join(': ') || 'Fără titlu',
    author: (i.authors || []).join(', '), pages: i.pageCount || 0, year: (i.publishedDate || '').slice(0, 4),
    publisher: i.publisher || '', description: (i.description || '').replace(/<[^>]+>/g, ''), isbn, cover,
    categories: i.categories || [], avg: i.averageRating || 0, ratings: i.ratingsCount || 0, lang: i.language || ''
  };
}
function olToBook(d) {
  return {
    ext: 'ol:' + (d.key || ''), title: d.title || 'Fără titlu', author: (d.author_name || []).join(', '),
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
  // elimină dublurile
  const seen = new Set(); out = out.filter(b => { const k2 = norm(b.title) + '|' + norm(b.author).split(' ')[0]; if (seen.has(k2)) return false; seen.add(k2); return true; });
  if (S.settings.onlyRo) out = [...out.filter(b => b.lang === 'ro'), ...out.filter(b => b.lang !== 'ro')];
  cache[k] = out; return out;
}
async function gbFetch(p) {
  // cu cheia proprie; dacă cheia nu e acceptată (de ex. altă adresă), încearcă și fără ea
  for (const withKey of [true, false]) {
    const q = new URLSearchParams(p); if (withKey) q.set('key', GB_KEY);
    try { const r = await fetch('https://www.googleapis.com/books/v1/volumes?' + q.toString()); if (r.ok) { const j = await r.json(); return j.items || []; } } catch (e) {}
  }
  return [];
}
/* Voxa: catalog românesc de audiobook-uri și ebook-uri (folosit doar pentru căutare) */
async function voxaSearch(q) {
  try {
    const r = await fetch('https://api.voxabooks.com/api/v1/client/search/all?' + new URLSearchParams({ query: q }).toString());
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j) ? j : []).filter(v => v && v.title && !/rezumat|summary|comentariu|recenzie/i.test(v.title)).map((v, i) => {
      const isbn = String(v.isbn || '').replace(/[^0-9X]/gi, '');
      return { ext: 'vx:' + v.id, title: String(v.title).trim(), author: (v.authors || []).map(a => a.name).join(', '), pages: v.pages_count || 0, year: '',
        publisher: 'Voxa', description: String(v.description || '').replace(/<[^>]+>/g, ''), isbn: isbn.length === 10 || isbn.length === 13 ? isbn : '',
        cover: (v.image && (v.image.default_320x320 || v.image.url)) || '', categories: (v.tags || []).map(t => t.name).filter(n => !/noutat|voxa/i.test(n)).slice(0, 3),
        avg: v.ratings_avg || 0, ratings: v.ratings_count || 0, lang: v.language || '', format: v.type === 'Ebook' ? 'ebook' : 'audio', _src: 'vx', _i: i };
    });
  } catch (e) { return []; }
}
const inLibrary = ext => S.books.find(b => b.ext && b.ext === ext);
const findSame = c => S.books.find(b => (c.ext && b.ext === c.ext) || (c.isbn && b.isbn === c.isbn) || (norm(b.title) === norm(c.title) && norm(b.author) === norm(c.author)));

/* ================= operații pe date ================= */
function addBook(c, status) {
  const ex = findSame(c);
  if (ex) { return ex; }
  const b = { id: uid(), ext: c.ext || '', title: c.title, author: c.author || '', pages: c.pages || 0, page: 0, year: c.year || '', publisher: c.publisher || '',
    description: c.description || '', isbn: c.isbn || '', cover: c.cover || '', categories: c.categories || [], avg: c.avg || 0, ratings: c.ratings || 0,
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

/* ================= statistici ================= */
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

/* ================= componente ================= */
function coverHTML(b, cls = '') {
  const ph = `<div class="ph" style="background:${color(b.title)}"><span>${esc((b.title || '').slice(0, 60))}</span><small>${esc((b.author || '').split(',')[0])}</small></div>`;
  return `<div class="${cls}"><div class="cover" aria-hidden="true">${ph}${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div></div>`;
}
function ratingSpoken(b) { return b.avg ? `, notă medie ${String(b.avg).replace('.', ',')} din 5${b.ratings ? ` de la ${b.ratings} cititori` : ''}` : ''; }
function tileHTML(c, kind) {
  const lib = findSame(c);
  const label = `${c.title}${c.author ? ', de ' + c.author : ''}${ratingSpoken(c)}${lib ? '. În biblioteca ta' : ''}`;
  const key = kind === 'lib' ? `data-book="${esc(c.id)}"` : `data-cand="${esc(remember(c))}"`;
  return `<button class="tile" ${key} aria-label="${esc(label)}">${coverHTML(c)}<div class="t" aria-hidden="true">${esc(c.title)}</div><div class="a" aria-hidden="true">${esc(c.author)}</div>${c.avg ? `<div class="r" aria-hidden="true"><span class="stars">★</span> ${String(c.avg).replace('.', ',')}${c.ratings ? ` · ${c.ratings}` : ''}</div>` : ''}</button>`;
}
const candStore = {}; function remember(c) { const k = c.ext || ('c' + uid()); candStore[k] = c; return k; }
function bookRowHTML(b) {
  let sub = '', label = `${b.title}${b.author ? ', de ' + b.author : ''}`;
  if (b.status === 'reading') { sub = b.pages ? `<span>${pct(b)}% · pagina ${b.page || 0} din ${b.pages}</span>` : `<span>${FORMATS[b.format]}</span>`; if (b.pages) label += `. ${pct(b)} la sută citit`; }
  else if (b.status === 'read') { sub = `${b.rating ? `<span class="stars">${starsTxt(b.rating)}</span>` : ''}${b.dateFinished ? `<span>${fmtDate(b.dateFinished)}</span>` : ''}`; if (b.rating) label += `. Nota ta ${rateTxt(b.rating)}`; if (b.dateFinished) label += `. Terminată pe ${fmtDate(b.dateFinished)}`; }
  else if (b.status === 'dnf') { sub = `<span>Oprită${b.pages ? ` la ${pct(b)}%` : ''}</span>`; label += '. Nefinalizată'; }
  else { sub = `<span class="pill">${FORMATS[b.format]}</span>`; }
  const bar = b.status === 'reading' && b.pages ? `<div class="bar"><i style="width:${pct(b)}%"></i></div>` : '';
  return `<button class="row" data-book="${esc(b.id)}" aria-label="${esc(label)}">${coverHTML(b, 'mini')}<span class="meta" aria-hidden="true"><span class="t">${esc(b.title)}</span><span class="a">${esc(b.author)}</span><span class="s">${sub}</span>${bar}</span><span class="chev" aria-hidden="true">${icon('chev')}</span></button>`;
}
function candRowHTML(c) {
  const lib = findSame(c);
  const label = `${c.title}${c.author ? ', de ' + c.author : ''}${c.year ? ', ' + c.year : ''}${ratingSpoken(c)}`;
  return `<div class="row" style="cursor:default"><button class="row" style="padding:0;flex:1;min-width:0" data-cand="${esc(remember(c))}" aria-label="${esc(label + '. Detalii')}">${coverHTML(c, 'mini')}<span class="meta" aria-hidden="true"><span class="t">${esc(c.title)}</span><span class="a">${esc(c.author)}</span><span class="s">${c.year ? `<span>${esc(c.year)}</span>` : ''}${c.pages ? `<span>${c.pages} pagini</span>` : ''}${c.avg ? `<span><span class="stars">★</span> ${String(c.avg).replace('.', ',')}</span>` : ''}</span></span></button>
    ${lib ? `<button class="addmini done" data-book="${esc(lib.id)}" aria-label="${esc(c.title)} este deja în bibliotecă, la ${STATUS[lib.status]}. Deschide">În bibliotecă</button>` : `<button class="addmini" data-quickadd="${esc(remember(c))}" aria-label="Adaugă în aplicație: ${esc(c.title)}">Adaugă</button>`}</div>`;
}
function shelfHTML(title, items, kind, moreAction) {
  if (!items || !items.length) return '';
  return `<h2 class="sec">${esc(title)}</h2><div class="shelf" role="list" aria-label="${esc(title)}">${items.map(c => `<div role="listitem">${tileHTML(c, kind)}</div>`).join('')}</div>`;
}
function navHTML(title, opts = {}) {
  const back = opts.back ? `<button class="back" data-back aria-label="Înapoi la ${esc(opts.back)}">${icon('back')} ${esc(opts.back)}</button>` : '<span></span>';
  const act = opts.act || '<span></span>';
  return `<div class="nav">${back}${act}</div><h1 id="title" tabindex="-1">${esc(title)}</h1>`;
}
function emptyHTML(t, d) { return `<div class="empty"><b>${esc(t)}</b>${esc(d)}</div>`; }
function cell({ attrs = '', ico, icoColor = '#8E8E93', label, value = '', chev = true, aria }) {
  return `<button class="cell" ${attrs} ${aria ? `aria-label="${esc(aria)}"` : ''}>${ico ? `<span class="ico" style="background:${icoColor}" aria-hidden="true">${icon(ico)}</span>` : ''}<span class="grow">${esc(label)}</span>${value ? `<span class="val">${esc(value)}</span>` : ''}${chev ? `<span class="chev" aria-hidden="true">${icon('chev')}</span>` : ''}</button>`;
}

/* ================= ecrane ================= */
const screens = {};

screens.home = () => {
  const reading = S.books.filter(b => b.status === 'reading');
  const y = new Date().getFullYear(), done = statsFor(y).reduce((a, m) => a + m.books, 0), goal = S.settings.goal || 12;
  let h = navHTML('Acasă', { act: `<button class="round" data-go="search" aria-label="Caută o carte">${icon('search')}</button>` });
  if (reading.length) {
    const b = reading.sort((a, c) => (c.lastTouch || 0) - (a.lastTouch || 0))[0];
    h += `<div class="hero">${coverHTML(b, 'mini')}<div style="min-width:0;flex:1"><div class="s">Continuă lectura</div><div class="t">${esc(b.title)}</div>${b.pages ? `<div class="s">${pct(b)}% citit</div><div class="bar"><i style="width:${pct(b)}%"></i></div>` : ''}</div><button class="go" data-book="${esc(b.id)}" aria-label="Continuă lectura: ${esc(b.title)}${b.pages ? `, ${pct(b)} la sută citit` : ''}">Deschide</button></div>`;
  } else {
    h += `<div class="hero"><div style="flex:1"><div class="t">Bun venit în Raftul Meu</div><div class="s">Caută o carte și adaug-o în biblioteca ta.</div></div><button class="go" data-go="search">Caută</button></div>`;
  }
  h += `<div class="label">Provocarea de lectură ${y}</div><div class="group"><button class="cell" data-libseg="stats" aria-label="Provocarea de lectură ${y}: ${done} din ${goal} cărți. Deschide statisticile"><span class="grow"><b>${done} din ${goal} cărți</b><div class="goalbar" style="margin-top:8px"><i style="width:${Math.min(100, Math.round(done / goal * 100))}%"></i></div></span><span class="chev" aria-hidden="true">${icon('chev')}</span></button></div>`;
  if (reading.length > 1) h += shelfHTML('Citești acum', reading, 'lib');
  h += `<div id="homeRecs"><div class="spin" role="status">Se încarcă recomandările…</div></div>`;
  setTimeout(loadHomeRecs, 0);
  return h;
};
async function loadHomeRecs() {
  const box = $('#homeRecs'); if (!box) return;
  const liked = S.books.filter(b => b.rating >= 4 || b.status === 'reading').slice(-6);
  const authors = [...new Set(liked.map(b => (b.author || '').split(',')[0]).filter(Boolean))].slice(0, 2);
  const cats = [...new Set(liked.flatMap(b => b.categories || []))].slice(0, 1);
  const tasks = [
    ['Populare acum', catalog('subject:fiction', { order: 'relevance' })],
    ['Bine cotate de cititori', catalog('literatura', { max: 30 }).then(r => r.filter(c => c.avg).sort((a, b) => (b.avg * Math.log(2 + b.ratings)) - (a.avg * Math.log(2 + a.ratings))))],
  ];
  if (authors.length) tasks.unshift(['Recomandate pentru tine', catalog(authors.map(a => `inauthor:"${a}"`).join(' OR ')).then(r => r.filter(c => !findSame(c)))]);
  else if (cats.length) tasks.unshift(['Recomandate pentru tine', catalog(`subject:"${cats[0]}"`).then(r => r.filter(c => !findSame(c)))]);
  const res = await Promise.all(tasks.map(t => t[1].catch(() => [])));
  if (!$('#homeRecs')) return;
  const html = tasks.map((t, i) => shelfHTML(t[0], res[i].slice(0, 15), 'cand')).join('');
  $('#homeRecs').innerHTML = html || emptyHTML('Recomandările nu sunt disponibile', 'Verifică legătura la internet. Biblioteca ta funcționează și fără internet.');
}

screens.library = () => {
  const segs = [['reading', 'Citesc acum'], ['want', 'Vreau să citesc'], ['read', 'Citite'], ['dnf', 'Nefinalizate'], ['lists', 'Liste'], ['stats', 'Statistici']];
  let h = navHTML('Bibliotecă', { act: libSeg === 'lists' ? `<button class="round" data-newlist aria-label="Listă nouă">${icon('plus')}</button>` : `<button class="round" data-go="search" aria-label="Adaugă o carte">${icon('plus')}</button>` });
  h += `<div class="chips" role="tablist" aria-label="Secțiuni bibliotecă">${segs.map(([k, v]) => `<button class="chip" role="tab" data-libseg="${k}" aria-selected="${libSeg === k}">${v}${k in STATUS ? ` <span aria-hidden="true">${S.books.filter(b => b.status === k).length}</span>` : ''}</button>`).join('')}</div>`;
  if (libSeg === 'lists') return h + listsHTML();
  if (libSeg === 'stats') return h + statsHTML();
  const items = S.books.filter(b => b.status === libSeg).sort((a, b) => libSeg === 'read' ? String(b.dateFinished).localeCompare(String(a.dateFinished)) : (b.lastTouch || 0) - (a.lastTouch || 0) || String(b.dateAdded).localeCompare(String(a.dateAdded)));
  const hints = { reading: 'Când începi o carte, o găsești aici, cu progresul ei.', want: 'Adaugă aici cărțile pe care vrei să le citești.', read: 'Cărțile terminate apar aici, cu nota și data.', dnf: 'Cărțile lăsate neterminate apar aici.' };
  if (!items.length) return h + `<div style="margin-top:12px">${emptyHTML('Nicio carte aici', hints[libSeg])}</div>`;
  return h + `<div class="label">${plural(items.length, 'carte', 'cărți')}</div><div class="group" role="list">${items.map(b => `<div role="listitem">${bookRowHTML(b)}</div>`).join('')}</div>`;
};
function listsHTML() {
  if (!S.lists.length) return `<div style="margin-top:12px">${emptyHTML('Nicio listă încă', 'Creează liste ca „2024”, „Preferatele mele” sau „Cărți de muzică” cu butonul Listă nouă, din dreapta sus.')}</div>`;
  return `<div class="label">${plural(S.lists.length, 'listă', 'liste')}</div><div class="group">${S.lists.map(l => { const n = S.books.filter(b => (b.lists || []).includes(l.id)).length; return cell({ attrs: `data-openlist="${esc(l.id)}"`, ico: 'folder', icoColor: '#2B7BE4', label: l.name, value: String(n), aria: `Lista ${l.name}, ${plural(n, 'carte', 'cărți')}` }); }).join('')}</div>`;
}
function statsHTML() {
  const ys = yearsWithData(); if (!ys.includes(statYear)) statYear = ys[0];
  const m = statsFor(statYear);
  const tot = m.reduce((a, x) => ({ books: a.books + x.books, pages: a.pages + x.pages, minutes: a.minutes + x.minutes }), { books: 0, pages: 0, minutes: 0 });
  const goal = S.settings.goal || 12, isCur = statYear === new Date().getFullYear();
  const maxB = Math.max(1, ...m.map(x => x.books));
  const bm = best(m, 'books', i => MONTHS[i]), bp = best(m, 'pages', i => MONTHS[i]), bt = best(m, 'minutes', i => MONTHS[i]);
  const allY = ys.map(y => ({ y, ...statsFor(y).reduce((a, x) => ({ books: a.books + x.books, pages: a.pages + x.pages, minutes: a.minutes + x.minutes }), { books: 0, pages: 0, minutes: 0 }) }));
  const by = best(allY, 'books', i => String(allY[i].y)), byp = best(allY, 'pages', i => String(allY[i].y)), byt = best(allY, 'minutes', i => String(allY[i].y));
  let h = `<div class="chips" role="tablist" aria-label="Alege anul">${ys.map(y => `<button class="chip" role="tab" data-year="${y}" aria-selected="${y === statYear}">${y}</button>`).join('')}</div>`;
  h += `<div class="grid2" style="margin-top:8px">
    <div class="stat" role="group" aria-label="${plural(tot.books, 'carte citită', 'cărți citite')} în ${statYear}"><div class="n" aria-hidden="true">${tot.books}</div><div class="l" aria-hidden="true">cărți citite</div></div>
    <div class="stat" role="group" aria-label="${tot.pages} pagini în ${statYear}"><div class="n" aria-hidden="true">${tot.pages.toLocaleString('ro-RO')}</div><div class="l" aria-hidden="true">pagini</div></div>
    <div class="stat" role="group" aria-label="${hoursSpoken(tot.minutes)} de lectură în ${statYear}"><div class="n" aria-hidden="true">${(Math.round(tot.minutes / 6) / 10).toLocaleString('ro-RO')}</div><div class="l" aria-hidden="true">ore de lectură</div></div>
    <div class="stat" role="group" aria-label="Obiectiv: ${tot.books} din ${goal}"><div class="n" aria-hidden="true">${Math.min(100, Math.round(tot.books / goal * 100))}%</div><div class="l" aria-hidden="true">din obiectivul de ${goal}</div></div></div>`;
  if (isCur) h += `<div class="label">Obiectivul pe ${statYear}</div><div class="group">${slider({ id: 'goalR', label: 'Obiectiv anual', min: 1, max: Math.max(200, goal), value: goal, text: goalText(goal), extra: 'data-goalr' })}</div>`;
  h += `<div class="label">Pe luni, ${statYear}</div><div class="group months">${m.map((x, i) => `<div class="mrow" role="group" aria-label="${MONTHS[i]}: ${plural(x.books, 'carte', 'cărți')}, ${x.pages} pagini, ${hoursSpoken(x.minutes)}"><span class="mn" aria-hidden="true">${MONTHS[i]}</span><span aria-hidden="true"><span class="mv">${plural(x.books, 'carte', 'cărți')} · ${x.pages} pag. · ${hours(x.minutes)}</span><div class="mb"><i style="width:${Math.round(x.books / maxB * 100)}%"></i></div></span></div>`).join('')}</div>`;
  const line = (t, b, unit) => b ? `<div class="cell" style="cursor:default"><span class="grow">${t}</span><span class="val">${b.label} (${unit(b.v)})</span></div>` : `<div class="cell" style="cursor:default"><span class="grow">${t}</span><span class="val">–</span></div>`;
  h += `<div class="label">Recorduri ${statYear}</div><div class="group">${line('Cele mai multe cărți', bm, v => plural(v, 'carte', 'cărți'))}${line('Cele mai multe pagini', bp, v => v + ' pag.')}${line('Cel mai mult timp', bt, hours)}</div>`;
  h += `<div class="label">Toți anii</div><div class="group">${line('Anul cu cele mai multe cărți', by, v => plural(v, 'carte', 'cărți'))}${line('Anul cu cele mai multe pagini', byp, v => v + ' pag.')}${line('Anul cu cel mai mult timp', byt, hours)}</div>`;
  h += `<div class="foot">Orele se adună din sesiunile de lectură pe care le notezi la fiecare carte.</div>`;
  h += `<div class="group" style="margin-top:20px">${cell({ attrs: 'data-push="history"', ico: 'clock', icoColor: '#8E5CD9', label: 'Istoricul lecturii' })}</div>`;
  return h;
}

screens.discover = () => {
  let h = navHTML('Descoperă');
  h += `<div class="chips" role="group" aria-label="Genuri">${GENRES.map(([n, q], i) => `<button class="chip" data-genre="${i}" aria-pressed="${discoverState.genre === i}">${n}</button>`).join('')}</div>`;
  if (discoverState.genre != null) {
    h += `<h2 class="sec">${esc(GENRES[discoverState.genre][0])}</h2><div id="genreBox">${discoverState.results ? (discoverState.results.length ? `<div class="group" role="list">${discoverState.results.map(c => `<div role="listitem">${candRowHTML(c)}</div>`).join('')}</div>` : emptyHTML('Nimic găsit', 'Încearcă alt gen sau verifică internetul.')) : '<div class="spin" role="status">Se încarcă…</div>'}</div>`;
  }
  h += `<div id="discBox"><div class="spin" role="status">Se încarcă…</div></div>`;
  h += `<h2 class="sec">Autori populari</h2><div class="group">${AUTHORS.map(a => cell({ attrs: `data-author="${esc(a)}"`, label: a })).join('')}</div>`;
  setTimeout(loadDiscover, 0);
  return h;
};
async function loadDiscover() {
  const box = $('#discBox'); if (!box) return;
  const [nou, pop, top] = await Promise.all([catalog('carte', { order: 'newest' }), catalog('roman', { order: 'relevance' }), catalog('subject:fiction romania', { max: 30 }).then(r => r.filter(c => c.avg).sort((a, b) => b.avg - a.avg))].map(p => p.catch(() => [])));
  if (!$('#discBox')) return;
  $('#discBox').innerHTML = shelfHTML('Noutăți', nou, 'cand') + shelfHTML('Cărți populare', pop, 'cand') + shelfHTML('Apreciate de cititori', top, 'cand') || '';
}

screens.search = () => {
  let h = navHTML('Caută');
  h += `<form id="searchForm" role="search"><div class="search">${icon('search')}<input id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" placeholder="Titlul cărții" aria-label="Titlul cărții. Poți scrie și autorul sau ISBN-ul; rezultatele apar singure" value="${esc(searchState.q)}"></div></form>`;
  h += `<div class="foot">Poți scrie titlul, doar o parte din el sau numele autorului. Rezultatele apar singure după ce te oprești din scris. Dacă dictezi și începi cu „Adaugă”, ajungi direct la butonul de adăugare.</div>`;
  h += `<div id="sres">${searchResultsHTML()}</div>`;
  return h;
};
/* ---- căutare ca pe Goodreads: scrii o parte din titlu SAU numele autorului, rezultatele apar pe măsură ce scrii ---- */
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
  const t = norm(c.title), a = norm(c.author), all = t + ' ' + a;
  let s = 0;
  const hits = toks.filter(w => all.includes(w)).length;
  s += hits / (toks.length || 1) * 60;                       // câte cuvinte din căutare se regăsesc
  if (toks.length && toks.every(w => all.split(' ').some(x => x.startsWith(w)))) s += 20;
  if (t === qn) s += 45; else if (t.startsWith(qn)) s += 30; else if (t.includes(qn)) s += 15;
  if (a && (a === qn || a.includes(qn))) s += 25;             // ai scris numele autorului
  if (hint) { if (t.includes(norm(hint.title))) s += 30; if (a.includes(norm(hint.author))) s += 30; }
  s += Math.log10((c.ratings || 0) + (c._ed || 0) * 3 + 1) * 9; // popularitate
  if (S.settings.onlyRo && c.lang === 'ro') s += 22;
  if (c.cover) s += 4;
  if (c._src === 'gb' || c._src === 'vx') s += Math.max(0, 12 - c._i);   // ordinea sursei contează puțin
  return s;
}
function mergeCands(list, qn, toks, hint) {
  const by = new Map();
  for (const c of list) {
    const k = norm(c.title).split(' ').slice(0, 6).join(' ') + '|' + norm(c.author).split(' ').pop();
    const ex = by.get(k);
    if (!ex) { by.set(k, c); continue; }
    // păstrează varianta mai bună, dar completează ce lipsește
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
    const r = await catalog('isbn:' + digits, { max: 5, anyLang: true });
    return cache[key] = { books: r, authors: [] };
  }
  const byMatch = q.match(/^(.+?)\s+de\s+(.+)$/i);
  const hint = byMatch ? { title: byMatch[1], author: byMatch[2] } : null;
  const plain = hint ? `${hint.title} ${hint.author}` : q;
  const jobs = [gbSearch(plain, 30), olSearch(plain, 30), hint ? Promise.resolve([]) : olAuthors(q), voxaSearch(plain)];
  const [gb, ol, au, vx] = await Promise.all(jobs);
  const olro = [];
  const qn = norm(plain), toks = qn.split(' ').filter(w => w.length > 1);
  const books = mergeCands([...vx, ...gb, ...ol, ...olro], qn, toks, hint).slice(0, 30);
  // autorii apar doar dacă ce ai scris seamănă cu numele lor
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
  if (searchState.loading && !searchState.results) return '<div class="spin" role="status">Caut…</div>';
  if (searchState.err) return emptyHTML('Căutarea nu a mers', searchState.err);
  if (!searchState.results) {
    const recent = S.books.slice(-5).reverse();
    return recent.length ? `<div class="label">Adăugate recent</div><div class="group">${recent.map(bookRowHTML).join('')}</div>` : '';
  }
  const mine = localMatches(searchState.q), au = searchState.authors || [], r = searchState.results;
  let h = '';
  if (mine.length) h += `<div class="label">În biblioteca ta</div><div class="group">${mine.map(bookRowHTML).join('')}</div>`;
  if (au.length) h += `<div class="label">Autori</div><div class="group">${au.map(a => cell({ attrs: `data-author="${esc(a.name)}"`, ico: 'person', icoColor: '#2B7BE4', label: a.name, aria: `Autor: ${a.name}, ${a.works} cărți${a.top ? ', cea mai cunoscută ' + a.top : ''}. Vezi cărțile` })).join('')}</div>`;
  if (!r.length && !mine.length && !au.length) return emptyHTML('Nicio carte găsită', 'Încearcă doar un cuvânt din titlu sau doar numele autorului. Poți adăuga cartea și manual.') + `<div class="btns"><button class="btn plain" data-manual>Adaugă manual „${esc(searchState.q)}”</button></div>`;
  if (r.length) h += `<div class="label">${plural(r.length, 'carte găsită', 'cărți găsite')}</div><div class="group" role="list">${r.map(c => `<div role="listitem">${candRowHTML(c)}</div>`).join('')}</div>`;
  return h + `<div class="btns"><button class="btn plain" data-manual>Nu găsesc cartea, o adaug manual</button></div>`;
}
async function runSearch(raw, live = false) {
  let q = String(raw || '').trim(); if (!q) return;
  let auto = false;
  const m = q.match(/^(adaug[aă]|pune|adauga)\s+(cartea\s+)?(.+)$/i);
  if (m) { q = m[3]; auto = !live; }
  q = q.replace(/[.!?]+$/, '');
  const seq = ++searchSeq;
  searchState = { q, results: live ? searchState.results : null, authors: live ? searchState.authors : [], loading: true, err: '', autoAdd: auto };
  if (!live) renderPart('#sres', searchResultsHTML());
  const { books, authors } = await findBooks(q);
  if (seq !== searchSeq) return;                              // între timp ai scris altceva
  searchState.loading = false; searchState.results = books; searchState.authors = authors;
  if (navigator.onLine === false && !books.length) searchState.err = 'Nu există conexiune la internet.';
  renderPart('#sres', searchResultsHTML());
  const first = books[0];
  const authTxt = authors.length ? ` Autor găsit: ${authors[0].name}.` : '';
  if (books.length) {
    say(`${plural(books.length, 'carte găsită', 'cărți găsite')}.${authTxt} Prima: ${first.title}${first.author ? ', de ' + first.author : ''}.${auto ? ' Butonul Adaugă este următorul.' : ''}`);
    if (auto) setTimeout(() => $('#sres [data-quickadd]')?.focus(), 300);
  } else say(authors.length ? authTxt.trim() : 'Nicio carte găsită.');
}
function rangeLive(t) {
  const out = t.parentElement.querySelector('output'); const v = +t.value; let txt = '';
  if (t.dataset.rater !== undefined) { txt = rateTxt(v); const st = $('#rateStars'); if (st) st.textContent = starsTxt(v) || '☆☆☆☆☆'; }
  else if (t.dataset.pctr !== undefined) { const b = byId($('#sheets [data-edit]')?.dataset.edit); if (b) txt = pctText(b, v); }
  else if (t.dataset.goalr !== undefined) txt = goalText(v);
  else if (t.dataset.pctedit !== undefined) { const n = +($('#e-pages')?.value || 0); const pg = Math.round(v / 100 * n); const h = $('#e-page'); if (h) h.value = pg; txt = n ? `${v} la sută, pagina ${pg} din ${n}` : `${v} la sută`; }
  else if (t.dataset.link) { const other = document.getElementById(t.dataset.link); if (t.type === 'range') { if (other) other.value = v || ''; txt = plural(v, 'pagină', 'pagini'); } else { if (other) { if (v > +other.max) other.max = v; other.value = v; rangeLive(other); } return; } const pr = $('#e-pageR'); if (pr) rangeLive(pr); }
  if (out) out.textContent = txt; t.setAttribute('aria-valuetext', txt);
}
function rangeCommit(t) {
  const v = +t.value;
  if (t.dataset.rater !== undefined) { const b = byId($('#sheets [data-edit]')?.dataset.edit); if (b) { b.rating = v; persist(); render(); } return; }
  if (t.dataset.pctr !== undefined) { const b = byId($('#sheets [data-edit]')?.dataset.edit); if (b && b.pages) { setPage(b, Math.round(v / 100 * b.pages)); render(); } return; }
  if (t.dataset.goalr !== undefined) { S.settings.goal = Math.max(1, v); persist(); const id = t.id; render(); setTimeout(() => document.getElementById(id)?.focus(), 30); return; }
}
document.addEventListener('input', e => {
  if (e.target.type === 'range' || e.target.dataset.link) { rangeLive(e.target); return; }
  if (e.target.id !== 'q') return;
  clearTimeout(liveT);
  const v = e.target.value.trim();
  if (v.length < 3) { if (!v) { searchSeq++; searchState = { q: '', results: null, loading: false, err: '', autoAdd: false }; renderPart('#sres', searchResultsHTML()); } return; }
  liveT = setTimeout(() => runSearch(v, true), 700);         // caută singur după ce te oprești din scris
});
function renderPart(sel, html) { const el = $(sel); if (el) el.innerHTML = html; }

screens.more = () => {
  let h = navHTML('Mai multe');
  const name = S.profile.name || 'Cititor';
  h += `<div class="group"><button class="cell" data-push="profile" aria-label="Profil: ${esc(name)}. Editează profilul" style="min-height:72px"><span class="ico" style="width:48px;height:48px;border-radius:50%;background:${color(name)};font:600 20px var(--display)" aria-hidden="true">${esc(name[0].toUpperCase())}</span><span class="grow"><b>${esc(name)}</b><div class="val" style="font-size:14px">${plural(S.books.filter(b => b.status === 'read').length, 'carte citită', 'cărți citite')}</div></span><span class="chev" aria-hidden="true">${icon('chev')}</span></button></div>`;
  h += `<div class="label">Contul tău</div><div class="group">${cell({ attrs: 'data-push="profile"', ico: 'person', icoColor: '#2B7BE4', label: 'Editează profilul' })}${cell({ attrs: 'data-push="account"', ico: 'key', icoColor: '#8E8E93', label: 'Editează contul' })}</div>`;
  h += `<div class="label">Date</div><div class="group">${cell({ attrs: 'data-push="import"', ico: 'down', icoColor: '#1E8E4E', label: 'Importă din altă aplicație', aria: 'Importă din Goodreads sau StoryGraph' })}${cell({ attrs: 'data-push="backup"', ico: 'up', icoColor: '#E08A00', label: 'Copie de siguranță' })}${cell({ attrs: 'data-push="history"', ico: 'clock', icoColor: '#8E5CD9', label: 'Istoricul lecturii' })}</div>`;
  h += `<div class="label">Aplicație</div><div class="group">${cell({ attrs: 'data-push="settings"', ico: 'gear', icoColor: '#636366', label: 'Setări' })}${cell({ attrs: 'data-push="install"', ico: 'info', icoColor: '#2448B8', label: 'Instalează pe ecranul principal' })}${cell({ attrs: 'data-push="about"', ico: 'book', icoColor: '#B0413E', label: 'Despre Raftul Meu' })}</div>`;
  return h;
};

/* ---- pagini secundare ---- */
const pages = {};
pages.profile = () => `${navHTML('Profil', { back: backLabel() })}
  <form id="profileForm"><div class="group">
   <div class="field"><label for="p-name">Nume afișat</label><input id="p-name" name="name" value="${esc(S.profile.name)}" autocomplete="name"></div>
   <div class="field"><label for="p-bio">Despre mine</label><textarea id="p-bio" name="bio">${esc(S.profile.bio)}</textarea></div>
   <div class="field"><label for="p-fav">Gen preferat</label><input id="p-fav" name="favorite" value="${esc(S.profile.favorite)}"></div>
  </div><div class="foot">Aceste informații vor fi publice când aplicația va avea partea socială.</div>
  <div class="btns"><button class="btn primary" type="submit">Salvează profilul</button></div></form>`;
pages.account = () => `${navHTML('Cont', { back: backLabel() })}
  <form id="accountForm"><div class="group">
   <div class="field"><label for="a-user">Nume de utilizator</label><input id="a-user" name="username" value="${esc(S.account.username)}" autocapitalize="off"></div>
   <div class="field"><label for="a-mail">Adresă de e-mail</label><input id="a-mail" name="email" type="email" value="${esc(S.account.email)}" autocomplete="email"></div>
  </div><div class="foot">Deocamdată datele tale stau doar pe acest telefon. Sincronizarea între dispozitive și autentificarea vor veni în versiunea finală.</div>
  <div class="btns"><button class="btn primary" type="submit">Salvează contul</button></div></form>
  <div class="label">Zona periculoasă</div><div class="group">${cell({ attrs: 'data-askwipe', ico: 'trash', icoColor: '#D23B33', label: 'Șterge toate datele', chev: false })}</div><div id="wipeBox"></div>`;
pages.settings = () => `${navHTML('Setări', { back: backLabel() })}
  <div class="group"><fieldset class="field"><legend>Aspect</legend><div class="seg">${[['auto', 'Automat'], ['light', 'Luminos'], ['dark', 'Întunecat']].map(([k, v]) => `<label>${v}<input type="radio" name="theme" value="${k}" ${S.settings.theme === k ? 'checked' : ''}></label>`).join('')}</div></fieldset></div>
  <div class="label">Catalog</div><div class="group"><label class="cell" style="cursor:pointer"><span class="grow">Cărțile în română primele</span><span class="toggle"><input type="checkbox" id="onlyRo" ${S.settings.onlyRo ? 'checked' : ''}><span></span></span></label></div>
  <div class="foot">Căutarea găsește cărți din orice țară și în orice limbă. Când e pornit, cele în limba română apar primele.</div>
  <div class="label">Obiectiv anual</div><div class="group">${slider({ id: 'goalR', label: 'Obiectiv anual', min: 1, max: Math.max(200, S.settings.goal), value: S.settings.goal, text: goalText(S.settings.goal), extra: 'data-goalr' })}</div>`;
pages.import = () => `${navHTML('Importă', { back: backLabel() })}
  <div class="desc">Poți aduce biblioteca din Goodreads sau din StoryGraph. Pe site-ul Goodreads, intră la My Books, apoi Import and export, și apasă Export Library. Primești un fișier CSV. Salvează-l pe telefon, apoi alege-l aici.</div>
  <div class="btns"><label class="btn primary" style="text-align:center;cursor:pointer" for="csvFile">Alege fișierul exportat</label><input id="csvFile" type="file" accept=".csv,text/csv" class="sr"></div>
  <div class="foot">Se preiau: cărțile citite, cele de citit, cele în curs și cele abandonate, notele, datele de citire, numărul de pagini, recenziile și rafturile tale, care devin liste.</div>
  <div id="importOut" role="status"></div>`;
pages.backup = () => `${navHTML('Copie de siguranță', { back: backLabel() })}
  <div class="desc">Salvează toată biblioteca ta într-un fișier, ca s-o poți muta pe alt telefon sau s-o recuperezi.</div>
  <div class="btns"><button class="btn primary" data-export>Salvează copia de siguranță</button><label class="btn plain" style="text-align:center;cursor:pointer" for="jsonFile">Restaurează dintr-un fișier</label><input id="jsonFile" type="file" accept=".json,application/json" class="sr"></div>
  <div id="backupOut" role="status"></div>`;
pages.history = () => {
  const ev = [...S.events].reverse().slice(0, 300);
  const txt = e => ({ add: 'Ai adăugat', reading: 'Ai început', read: 'Ai terminat', want: 'Ai mutat la Vreau să citesc', dnf: 'Ai abandonat', session: 'Ai citit', import: 'Ai importat' }[e.type] || 'Activitate');
  const detail = e => e.type === 'session' ? ` ${e.pages ? e.pages + ' pagini' : ''}${e.pages && e.minutes ? ', ' : ''}${e.minutes ? hoursSpoken(e.minutes) : ''} din` : '';
  return `${navHTML('Istoric', { back: backLabel() })}${ev.length ? `<div class="group hist">${ev.map(e => `<div class="cell" style="cursor:default;flex-direction:column;align-items:flex-start;gap:2px"><span>${txt(e)}${detail(e)} „${esc(e.title)}”</span><span class="d">${fmtDate(e.date)}</span></div>`).join('')}</div>` : emptyHTML('Nicio activitate încă', 'Tot ce faci cu cărțile tale apare aici.')}`;
};
pages.install = () => `${navHTML('Instalează', { back: backLabel() })}
  <div class="desc">Ca Raftul Meu să apară pe ecranul principal, cu iconița lui, ca o aplicație obișnuită:

În Safari: apasă butonul Partajare din bara de jos, derulează și alege „Adaugă pe ecranul principal”, apoi Adaugă.

În Chrome: apasă butonul Partajare din dreapta barei de adrese, apoi „Adaugă pe ecranul principal”.

Aplicația trebuie deschisă din adresa ei de internet. Dacă o deschizi ca fișier, din WhatsApp sau din aplicația Fișiere, iPhone-ul o arată doar ca previzualizare și butoanele nu funcționează.</div>`;
pages.about = () => `${navHTML('Despre', { back: backLabel() })}<div class="desc">Raftul Meu, versiunea 0.3.

O aplicație de lectură în limba română, gândită pentru VoiceOver. Datele cărților vin din Google Books, Voxa și Open Library, din orice țară și în orice limbă. Biblioteca ta rămâne pe telefonul tău.</div>`;
pages.list = id => {
  const l = listById(id); if (!l) return navHTML('Listă', { back: backLabel() }) + emptyHTML('Lista nu mai există', '');
  const items = S.books.filter(b => (b.lists || []).includes(id));
  return `${navHTML(l.name, { back: backLabel(), act: `<button class="act" data-listmenu="${esc(id)}">Editează</button>` })}
  ${items.length ? `<div class="label">${plural(items.length, 'carte', 'cărți')}</div><div class="group">${items.map(bookRowHTML).join('')}</div>` : emptyHTML('Lista e goală', 'Adaugă cărți din biblioteca ta cu butonul de mai jos, sau din pagina oricărei cărți.')}
  <div class="btns"><button class="btn plain" data-addtolist="${esc(id)}">Adaugă cărți în listă</button></div>`;
};
pages.author = a => `${navHTML(a, { back: backLabel() })}<div id="authBox"><div class="spin" role="status">Se încarcă…</div></div>`;

/* ================= navigare ================= */
function current() { const st = stack[tab]; return st[st.length - 1]; }
function backLabel() { const st = stack[tab]; if (st.length < 2) return { home: 'Acasă', library: 'Bibliotecă', discover: 'Descoperă', search: 'Caută', more: 'Mai multe' }[tab]; const p = st[st.length - 2]; return p.title || 'Înapoi'; }
function push(name, arg, title) { stack[tab].push({ name, arg, title }); render(true); }
function pop() { stack[tab].pop(); render(true); }
function render(focusTitle) {
  applyTheme();
  const top = current();
  let html;
  if (top) { html = pages[top.name](top.arg); }
  else html = screens[tab]();
  $('#app').innerHTML = html;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
  if (top && top.name === 'author') loadAuthor(top.arg);
  if (focusTitle) { window.scrollTo(0, 0); setTimeout(() => $('#title')?.focus(), 30); }
}
async function loadAuthor(a) {
  let r = await catalog(`inauthor:"${a}"`, { max: 30 }).catch(() => []);
  const an = norm(a).split(' ').pop();
  const vx = (await voxaSearch(a)).filter(c => norm(c.author).includes(an));
  const seen = new Set(r.map(c => norm(c.title)));
  r = [...vx.filter(c => !seen.has(norm(c.title))), ...r];
  renderPart('#authBox', r.length ? `<div class="group" role="list">${r.map(c => `<div role="listitem">${candRowHTML(c)}</div>`).join('')}</div>` : emptyHTML('Nimic găsit', 'Verifică legătura la internet.'));
}
function goTab(t) {
  if (tab === t && stack[t].length) { stack[t] = []; }
  tab = t; render(true);
  if (t === 'search') setTimeout(() => { if (!searchState.results) $('#q')?.focus(); }, 60);
}

/* ================= foi (sheets) ================= */
let sheetReturn = null;
function openSheet(html, label) {
  sheetReturn = document.activeElement;
  $('#sheets').innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="in"><div class="grab" aria-hidden="true"></div>${html}</div></div>`;
  $('#app').setAttribute('aria-hidden', 'true'); $('.tabbar').setAttribute('aria-hidden', 'true');
  setTimeout(() => ($('#sheets [autofocus]') || $('#sheets h2, #sheets h3'))?.focus(), 60);
}
function closeSheet(noRestore) {
  $('#sheets').innerHTML = ''; $('#app').removeAttribute('aria-hidden'); $('.tabbar').removeAttribute('aria-hidden');
  if (!noRestore && sheetReturn && document.contains(sheetReturn)) sheetReturn.focus();
}
function refreshSheet(html) { const i = $('#sheets .in'); if (i) i.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html; }

function pctText(b, p) { const pg = Math.round(p / 100 * (b.pages || 0)); return `${p} la sută, ${b.format === 'audio' ? 'capitolul' : 'pagina'} ${pg} din ${b.pages}`; }
function setPage(b, page) {
  const old = b.page || 0; b.page = Math.max(0, Math.min(b.pages, page)); const diff = b.page - old;
  if (diff > 0) { S.sessions.push({ id: uid(), bookId: b.id, date: today(), pages: diff, minutes: 0 }); if (b.status === 'want') setStatus(b, 'reading'); }
  else if (diff < 0) { for (let i = S.sessions.length - 1, left = -diff; i >= 0 && left > 0; i--) { const s = S.sessions[i]; if (s.bookId === b.id && s.date === today() && s.pages && !s.minutes) { const k = Math.min(left, s.pages); s.pages -= k; left -= k; } } S.sessions = S.sessions.filter(s => s.pages || s.minutes); }
  b.lastTouch = Date.now(); persist();
}
function bookSheet(b) {
  const unit = b.format === 'audio' ? 'Capitolul' : 'Pagina';
  const prog = b.pages ? `<div class="label">Progres</div><div class="group"><div class="field"><div style="font-weight:600">${pct(b)}% · ${unit.toLowerCase()} ${b.page || 0} din ${b.pages}</div><div class="bar"><i style="width:${pct(b)}%"></i></div></div>${slider({ id: 'pctR', label: 'Cât ai citit', min: 0, max: 100, value: pct(b), text: pctText(b, pct(b)), extra: 'data-pctr' })}</div>` : '';
  const listsOf = (b.lists || []).map(id => listById(id)?.name).filter(Boolean);
  return `<div class="shead"><button data-close>Gata</button><h2 class="sr">Detalii carte</h2><button class="strong" data-edit="${esc(b.id)}">Editează</button></div>
  <div class="dtop">${coverHTML(b, 'mini')}<div style="min-width:0"><h3 tabindex="-1">${esc(b.title)}</h3><div style="color:var(--muted)">${esc(b.author)}</div><div style="font-size:14px;color:var(--muted);margin-top:6px">${[b.year, b.pages ? b.pages + ' pagini' : '', FORMATS[b.format]].filter(Boolean).join(' · ')}</div>${b.avg ? `<div style="font-size:14px;margin-top:4px"><span class="stars">★</span> ${String(b.avg).replace('.', ',')} <span style="color:var(--muted)">${b.ratings ? `(${b.ratings} cititori)` : ''}</span></div>` : ''}</div></div>
  <div class="group"><fieldset class="field"><legend>Raft</legend><div class="seg">${Object.entries(STATUS).map(([k, v]) => `<label>${v.replace('Vreau să citesc', 'De citit').replace('Citesc acum', 'Citesc')}<input type="radio" name="bstatus" value="${k}" ${b.status === k ? 'checked' : ''} aria-label="${v}"></label>`).join('')}</div></fieldset>
  ${slider({ id: 'rateR', label: 'Nota ta', min: 0, max: 5, step: 0.5, value: b.rating || 0, text: rateTxt(b.rating || 0), extra: 'data-rater' })}<div class="field stars big" id="rateStars" aria-hidden="true">${starsTxt(b.rating || 0) || '☆☆☆☆☆'}</div></div>
  ${b.status === 'reading' || b.status === 'want' ? prog : ''}
  <div class="btns">${b.status !== 'read' ? `<button class="btn primary" data-session="${esc(b.id)}">Notează o sesiune de lectură</button>` : ''}${b.status === 'reading' ? `<button class="btn plain" data-finish="${esc(b.id)}">Am terminat-o</button>` : ''}</div>
  <div class="label">Liste</div><div class="group">${cell({ attrs: `data-picklists="${esc(b.id)}"`, ico: 'folder', icoColor: '#2B7BE4', label: listsOf.length ? listsOf.join(', ') : 'Adaugă într-o listă', aria: listsOf.length ? `În listele: ${listsOf.join(', ')}. Modifică` : 'Adaugă într-o listă' })}</div>
  ${b.review ? `<div class="label">Recenzia ta</div><div class="desc">${esc(b.review)}</div>` : ''}
  ${b.description ? `<div class="label">Despre carte</div><div class="desc">${esc(b.description.slice(0, 1500))}${b.description.length > 1500 ? '…' : ''}</div>` : ''}
  <div class="label">Date</div><div class="group"><div class="cell" style="cursor:default"><span class="grow">Adăugată</span><span class="val">${fmtDate(b.dateAdded)}</span></div>${b.dateStarted ? `<div class="cell" style="cursor:default"><span class="grow">Începută</span><span class="val">${fmtDate(b.dateStarted)}</span></div>` : ''}${b.dateFinished ? `<div class="cell" style="cursor:default"><span class="grow">Terminată</span><span class="val">${fmtDate(b.dateFinished)}</span></div>` : ''}${b.minutes ? `<div class="cell" style="cursor:default"><span class="grow">Timp de lectură</span><span class="val">${hours(b.minutes)}</span></div>` : ''}${b.isbn ? `<div class="cell" style="cursor:default"><span class="grow">ISBN</span><span class="val">${esc(b.isbn)}</span></div>` : ''}</div>
  <div class="btns">${b.author ? `<button class="btn plain" data-author="${esc(b.author.split(',')[0])}">Alte cărți de ${esc(b.author.split(',')[0])}</button>` : ''}<button class="btn danger" data-askdel="${esc(b.id)}">Șterge din bibliotecă</button><div id="delBox"></div></div>`;
}
function candSheet(c) {
  const lib = findSame(c);
  return `<div class="shead"><button data-close>Închide</button><h2 class="sr">Detalii carte</h2><span style="min-width:70px"></span></div>
  <div class="dtop">${coverHTML(c, 'mini')}<div style="min-width:0"><h3 tabindex="-1">${esc(c.title)}</h3><div style="color:var(--muted)">${esc(c.author)}</div><div style="font-size:14px;color:var(--muted);margin-top:6px">${[c.year, c.pages ? c.pages + ' pagini' : '', c.publisher].filter(Boolean).map(esc).join(' · ')}</div>${c.avg ? `<div style="font-size:14px;margin-top:4px"><span class="stars">★</span> ${String(c.avg).replace('.', ',')} <span style="color:var(--muted)">${c.ratings ? `(${c.ratings} cititori)` : ''}</span></div>` : ''}</div></div>
  ${lib ? `<div class="btns"><button class="btn plain" data-book="${esc(lib.id)}">Este în bibliotecă, la ${STATUS[lib.status]}. Deschide</button></div>` : `<div class="label">Adaugă în aplicație</div><div class="group">${Object.entries(STATUS).filter(([k]) => k !== 'dnf').map(([k, v]) => cell({ attrs: `data-addto="${k}" data-c="${esc(remember(c))}"`, label: v, aria: `Adaugă la ${v}` })).join('')}</div>`}
  ${c.description ? `<div class="label">Despre carte</div><div class="desc">${esc(c.description.slice(0, 2000))}</div>` : ''}
  ${c.author ? `<div class="btns"><button class="btn plain" data-author="${esc(c.author.split(',')[0])}">Alte cărți de ${esc(c.author.split(',')[0])}</button></div>` : ''}`;
}
function quickAddSheet(c) {
  return `<div class="shead"><button data-close>Renunță</button><h2 tabindex="-1">Adaugă „${esc(c.title)}”</h2><span style="min-width:70px"></span></div>
  <div class="label">Pe ce raft o pui?</div><div class="group">${Object.entries(STATUS).filter(([k]) => k !== 'dnf').map(([k, v], i) => cell({ attrs: `data-addto="${k}" data-c="${esc(remember(c))}" ${i === 0 ? 'autofocus' : ''}`, label: v, aria: `Adaugă la ${v}` })).join('')}</div>`;
}
function editSheet(b) {
  const isNew = !b.id;
  b = Object.assign({ title: '', author: '', pages: 0, page: 0, format: 'print', status: 'want', review: '', dateFinished: '' }, b);
  return `<form id="editForm" data-id="${esc(b.id || '')}"><div class="shead"><button type="button" data-close>Renunță</button><h2 tabindex="-1">${isNew ? 'Carte nouă' : 'Editează'}</h2><button type="submit" class="strong">Salvează</button></div>
  <div class="group">
   <div class="field"><label for="e-title">Titlul cărții</label><input id="e-title" name="title" value="${esc(b.title)}" ${isNew ? 'autofocus' : ''}></div>
   <div class="field"><label for="e-author">Autorul</label><input id="e-author" name="author" value="${esc(b.author)}"></div>
   <fieldset class="field"><legend>Format</legend><div class="seg">${Object.entries(FORMATS).map(([k, v]) => `<label>${v}<input type="radio" name="format" value="${k}" ${b.format === k ? 'checked' : ''}></label>`).join('')}</div></fieldset>
   ${isNew ? `<fieldset class="field"><legend>Raft</legend><div class="seg">${Object.entries(STATUS).map(([k, v]) => `<label>${v.replace('Vreau să citesc', 'De citit').replace('Citesc acum', 'Citesc')}<input type="radio" name="status" value="${k}" ${b.status === k ? 'checked' : ''} aria-label="${v}"></label>`).join('')}</div></fieldset>` : ''}
   ${slider({ id: 'e-pagesR', label: 'Număr de pagini (sau capitole, la audiobook)', min: 0, max: Math.max(2000, b.pages || 0), step: 5, value: b.pages || 0, text: plural(b.pages || 0, 'pagină', 'pagini'), extra: 'data-link="e-pages"' })}
   <div class="field"><label for="e-pages">Număr exact de pagini</label><input id="e-pages" name="pages" type="number" inputmode="numeric" min="0" value="${b.pages || ''}" data-link="e-pagesR"></div>
   ${slider({ id: 'e-pageR', label: 'Cât ai citit', min: 0, max: 100, value: b.pages ? Math.round((b.page || 0) / b.pages * 100) : 0, text: `${b.pages ? Math.round((b.page || 0) / b.pages * 100) : 0} la sută`, extra: 'data-pctedit' })}
   <input type="hidden" id="e-page" name="page" value="${b.page || 0}">
   <div class="field"><label for="e-fin">Data terminării</label><input id="e-fin" name="dateFinished" type="date" value="${esc(b.dateFinished || '')}"></div>
   <div class="field"><label for="e-rev">Recenzia sau notițele tale</label><textarea id="e-rev" name="review">${esc(b.review)}</textarea></div>
  </div><p class="foot" id="editErr" role="alert"></p></form>`;
}
function sessionSheet(b) {
  return `<form id="sessionForm" data-id="${esc(b.id)}"><div class="shead"><button type="button" data-close>Renunță</button><h2 tabindex="-1">Sesiune de lectură</h2><button type="submit" class="strong">Salvează</button></div>
  <div class="foot" style="margin:0 4px 10px">${esc(b.title)}</div><div class="group">
   <div class="field"><label for="s-pages">${b.format === 'audio' ? 'Câte capitole ai ascultat' : 'Câte pagini ai citit'}</label><input id="s-pages" name="pages" type="number" inputmode="numeric" min="0" autofocus></div>
   <div class="field"><label for="s-min">Câte minute ai citit</label><input id="s-min" name="minutes" type="number" inputmode="numeric" min="0"></div>
   <div class="field"><label for="s-date">Data</label><input id="s-date" name="date" type="date" value="${today()}"></div>
  </div><p class="foot">Minutele se adună în statisticile tale de timp.</p></form>`;
}
function pickListsSheet(b) {
  return `<div class="shead"><button data-close>Gata</button><h2 tabindex="-1">Liste</h2><button class="strong" data-newlist>Listă nouă</button></div>
  ${S.lists.length ? `<div class="group">${S.lists.map(l => `<label class="cell" style="cursor:pointer"><span class="grow">${esc(l.name)}</span><span class="toggle"><input type="checkbox" data-togglelist="${esc(l.id)}" data-bk="${esc(b.id)}" ${(b.lists || []).includes(l.id) ? 'checked' : ''} aria-label="${esc(l.name)}"><span></span></span></label>`).join('')}</div>` : emptyHTML('Nicio listă încă', 'Apasă Listă nouă, sus, ca să creezi prima listă.')}`;
}
function listNameSheet(l) {
  return `<form id="listForm" data-id="${esc(l ? l.id : '')}"><div class="shead"><button type="button" data-close>Renunță</button><h2 tabindex="-1">${l ? 'Redenumește lista' : 'Listă nouă'}</h2><button type="submit" class="strong">Salvează</button></div>
  <div class="group"><div class="field"><label for="l-name">Numele listei</label><input id="l-name" name="name" value="${esc(l ? l.name : '')}" autofocus></div></div><p class="foot" id="listErr" role="alert"></p></form>
  ${l ? `<div class="btns"><button class="btn danger" data-dellist="${esc(l.id)}">Șterge lista</button></div><p class="foot">Ștergerea listei nu șterge cărțile din bibliotecă.</p>` : ''}`;
}
function addToListSheet(id) {
  const l = listById(id); const cands = [...S.books].sort((a, b) => a.title.localeCompare(b.title, 'ro'));
  return `<div class="shead"><button data-close>Gata</button><h2 tabindex="-1">Adaugă în ${esc(l.name)}</h2><span style="min-width:70px"></span></div>
  ${cands.length ? `<div class="group">${cands.map(b => `<label class="cell" style="cursor:pointer"><span class="grow">${esc(b.title)}<div class="val" style="font-size:14px">${esc(b.author)}</div></span><span class="toggle"><input type="checkbox" data-togglelist="${esc(id)}" data-bk="${esc(b.id)}" ${(b.lists || []).includes(id) ? 'checked' : ''} aria-label="${esc(b.title)}${b.author ? ', de ' + esc(b.author) : ''}"><span></span></span></label>`).join('')}</div>` : emptyHTML('Biblioteca e goală', 'Adaugă întâi cărți din Caută.')}`;
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
  const rows = parseCSV(text.replace(/^﻿/, '')); if (rows.length < 2) throw new Error('Fișierul nu are cărți.');
  const H = rows[0].map(h => h.trim().toLowerCase());
  const col = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
  const c = { title: col('title'), author: col('author', 'authors'), isbn: col('isbn', 'isbn/uid'), isbn13: col('isbn13'), rating: col('my rating', 'star rating'), pages: col('number of pages'), year: col('year published', 'original publication year'),
    dateRead: col('date read', 'last date read'), dateAdded: col('date added', 'date added'), shelves: col('bookshelves', 'tags'), excl: col('exclusive shelf', 'read status'), review: col('my review', 'review'), publisher: col('publisher'), format: col('binding', 'format'), started: col('date started', 'dates read') };
  if (c.title < 0) throw new Error('Nu recunosc fișierul. Alege exportul CSV din Goodreads sau StoryGraph.');
  const g = (r, i) => i >= 0 ? String(r[i] || '').trim() : '';
  const clean = s => s.replace(/^="?|"$/g, '').replace(/[^0-9Xx]/g, '');
  const date = s => { s = s.trim(); if (!s) return ''; const m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
  const shelfMap = s => { s = s.toLowerCase(); if (s === 'read') return 'read'; if (s === 'currently-reading') return 'reading'; if (s === 'to-read') return 'want'; if (/did-not-finish|dnf|abandon|nefinal/.test(s)) return 'dnf'; return null; };
  let added = 0, skipped = 0, listsMade = 0;
  for (const r of rows.slice(1)) {
    const title = g(r, c.title); if (!title) continue;
    const cand = { title, author: g(r, c.author), isbn: clean(g(r, c.isbn13)) || clean(g(r, c.isbn)), pages: +g(r, c.pages) || 0, year: g(r, c.year).slice(0, 4), publisher: g(r, c.publisher) };
    if (findSame(cand)) { skipped++; continue; }
    const ex = g(r, c.excl); let st = shelfMap(ex) || 'want';
    const shelves = g(r, c.shelves).split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (ex && !shelfMap(ex)) shelves.push(ex);
    const fmt = /audio/i.test(g(r, c.format)) ? 'audio' : /kindle|ebook|e-book/i.test(g(r, c.format)) ? 'ebook' : 'print';
    const b = { id: uid(), ext: '', ...cand, page: st === 'read' ? cand.pages : 0, description: '', cover: cand.isbn ? `https://covers.openlibrary.org/b/isbn/${cand.isbn}-M.jpg?default=false` : '', categories: [], avg: 0, ratings: 0,
      format: fmt, status: st, rating: Math.round((+g(r, c.rating) || 0) * 2) / 2, review: g(r, c.review).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''), lists: [],
      dateAdded: date(g(r, c.dateAdded)) || today(), dateStarted: date(g(r, c.started)), dateFinished: st === 'read' ? (date(g(r, c.dateRead)) || '') : '', minutes: 0 };
    for (const sh of shelves) { if (shelfMap(sh)) continue; let l = S.lists.find(x => norm(x.name) === norm(sh)); if (!l) { l = { id: uid(), name: sh }; S.lists.push(l); listsMade++; } b.lists.push(l.id); }
    S.books.push(b); added++;
  }
  S.events.push({ id: uid(), bookId: '', title: `${added} cărți`, type: 'import', date: today() });
  persist(); return { added, skipped, listsMade };
}

/* ================= evenimente ================= */
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-close],label.btn'); if (!t) return;
  const d = t.dataset;
  if ('close' in d) { closeSheet(); return; }
  if (d.tab) { goTab(d.tab); return; }
  if ('back' in d) { pop(); return; }
  if (d.go) { goTab(d.go); return; }
  if (d.push) { const titles = { profile: 'Profil', account: 'Cont', settings: 'Setări', import: 'Importă', backup: 'Copie de siguranță', history: 'Istoric', install: 'Instalează', about: 'Despre' }; push(d.push, null, titles[d.push]); return; }
  if (d.libseg) { if (tab !== 'library') { tab = 'library'; stack.library = []; } libSeg = d.libseg; render(true); return; }
  if (d.year) { statYear = +d.year; render(); $(`[data-year="${statYear}"]`)?.focus(); return; }
  if (d.goal) { S.settings.goal = Math.max(1, (S.settings.goal || 12) + +d.goal); persist(); render(); $(`[data-goal="${d.goal}"]`)?.focus(); say(`Obiectiv: ${plural(S.settings.goal, 'carte', 'cărți')}`); return; }
  if (d.book) { const b = byId(d.book); if (b) { closeSheet(true); openSheet(bookSheet(b), b.title); } return; }
  if (d.cand) { const c = candStore[d.cand]; if (c) openSheet(candSheet(c), c.title); return; }
  if (d.quickadd) { const c = candStore[d.quickadd]; if (c) openSheet(quickAddSheet(c), 'Adaugă'); return; }
  if (d.addto) { const c = candStore[d.c]; if (!c) return; const b = addBook(c, d.addto); libSeg = b.status; closeSheet(); toast(`Am adăugat „${b.title}” la ${STATUS[b.status]}.`); render(); return; }
  if ('manual' in d) { openSheet(editSheet({ title: searchState.q }), 'Carte nouă'); return; }
  if (d.edit) { const b = byId(d.edit); if (b) { closeSheet(true); openSheet(editSheet(b), 'Editează'); } return; }
  if (d.session) { const b = byId(d.session); if (b) { closeSheet(true); openSheet(sessionSheet(b), 'Sesiune de lectură'); } return; }
  if (d.finish) { const b = byId(d.finish); if (b) { setStatus(b, 'read'); toast(`Felicitări! „${b.title}” e acum la Citite.`); refreshSheet(bookSheet(b)); render(); } return; }
  if (d.pg) { const b = byId($('#sheets [data-edit]')?.dataset.edit); if (!b) return; const old = b.page || 0; b.page = Math.max(0, Math.min(b.pages, old + +d.pg)); const diff = b.page - old; if (diff > 0) { S.sessions.push({ id: uid(), bookId: b.id, date: today(), pages: diff, minutes: 0 }); if (b.status === 'want') setStatus(b, 'reading'); } else if (diff < 0) { for (let i = S.sessions.length - 1, left = -diff; i >= 0 && left > 0; i--) { const s = S.sessions[i]; if (s.bookId === b.id && s.date === today() && s.pages && !s.minutes) { const k = Math.min(left, s.pages); s.pages -= k; left -= k; } } S.sessions = S.sessions.filter(s => s.pages || s.minutes); } b.lastTouch = Date.now(); persist(); refreshSheet(bookSheet(b)); $(`#sheets [data-pg="${d.pg}"]`)?.focus(); say(`${b.format === 'audio' ? 'Capitolul' : 'Pagina'} ${b.page}, ${pct(b)} la sută`); render(); return; }
  if (d.askdel) { $('#delBox').innerHTML = `<div class="confirm" role="group" aria-label="Confirmă ștergerea"><div>Ștergi definitiv această carte din bibliotecă?</div><button class="btn danger" style="background:var(--accent-soft)" data-del="${esc(d.askdel)}">Da, șterge</button><button class="btn plain" data-nodel>Nu, păstreaz-o</button></div>`; $('[data-del]').focus(); return; }
  if ('nodel' in d) { $('#delBox').innerHTML = ''; $('[data-askdel]').focus(); return; }
  if (d.del) { const b = byId(d.del); S.books = S.books.filter(x => x.id !== d.del); S.sessions = S.sessions.filter(s => s.bookId !== d.del); persist(); closeSheet(true); render(); toast(`Am șters „${b ? b.title : 'cartea'}”.`); $('#title')?.focus(); return; }
  if (d.picklists) { const b = byId(d.picklists); if (b) { closeSheet(true); openSheet(pickListsSheet(b), 'Liste'); sheetBook = b.id; } return; }
  if ('newlist' in d) { openSheet(listNameSheet(null), 'Listă nouă'); return; }
  if (d.openlist) { const l = listById(d.openlist); if (l) push('list', l.id, l.name); return; }
  if (d.listmenu) { const l = listById(d.listmenu); if (l) openSheet(listNameSheet(l), 'Editează lista'); return; }
  if (d.dellist) { const l = listById(d.dellist); S.lists = S.lists.filter(x => x.id !== d.dellist); S.books.forEach(b => b.lists = (b.lists || []).filter(id => id !== d.dellist)); persist(); closeSheet(true); if (current() && current().name === 'list') stack[tab].pop(); render(true); toast(`Am șters lista „${l ? l.name : ''}”.`); return; }
  if (d.addtolist) { openSheet(addToListSheet(d.addtolist), 'Adaugă în listă'); return; }
  if (d.genre) { const i = +d.genre; if (discoverState.genre === i) { discoverState = { genre: null, results: null }; render(); return; } discoverState = { genre: i, results: null }; render(); $(`[data-genre="${i}"]`)?.focus(); catalog(GENRES[i][1], { max: 30 }).then(r => { if (discoverState.genre !== i) return; discoverState.results = r; renderPart('#genreBox', r.length ? `<div class="group" role="list">${r.map(c => `<div role="listitem">${candRowHTML(c)}</div>`).join('')}</div>` : emptyHTML('Nimic găsit', 'Încearcă alt gen sau verifică internetul.')); say(`${GENRES[i][0]}: ${plural(r.length, 'carte', 'cărți')}`); }); return; }
  if (d.author) { closeSheet(true); push('author', d.author, d.author); return; }
  if ('export' in d) { exportBackup(); return; }
  if ('askwipe' in d) { $('#wipeBox').innerHTML = `<div class="confirm" style="margin-top:12px" role="group" aria-label="Confirmă ștergerea tuturor datelor"><div>Se șterg toate cărțile, listele și statisticile de pe acest telefon. Nu se poate anula.</div><button class="btn danger" style="background:var(--accent-soft)" data-wipe>Da, șterge tot</button><button class="btn plain" data-nowipe>Nu</button></div>`; $('[data-wipe]').focus(); return; }
  if ('nowipe' in d) { $('#wipeBox').innerHTML = ''; return; }
  if ('wipe' in d) { S = blank(); persist(); stack.more = []; render(true); toast('Toate datele au fost șterse.'); return; }
});
let sheetBook = null;
document.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'bstatus') { const b = byId($('#sheets [data-edit]')?.dataset.edit); if (b) { setStatus(b, t.value); b.lastTouch = Date.now(); persist(); say(`Mutată la ${STATUS[t.value]}.`); refreshSheet(bookSheet(b)); $(`#sheets input[name=bstatus][value=${t.value}]`)?.focus(); render(); } return; }
  if (t.dataset.rater !== undefined || t.dataset.pctr !== undefined || t.dataset.goalr !== undefined) { rangeCommit(t); return; }
  if (t.name === 'brate') { const b = byId($('#sheets [data-edit]')?.dataset.edit); if (b) { b.rating = +t.value; persist(); $$('#sheets .rate label').forEach((l, i) => l.classList.toggle('on', i < b.rating)); say(`Nota ta: ${b.rating} ${b.rating === 1 ? 'stea' : 'stele'}`); render(); } return; }
  if (t.dataset.togglelist) { const b = byId(t.dataset.bk); if (!b) return; b.lists = b.lists || []; if (t.checked) { if (!b.lists.includes(t.dataset.togglelist)) b.lists.push(t.dataset.togglelist); } else b.lists = b.lists.filter(x => x !== t.dataset.togglelist); persist(); say(t.checked ? 'Adăugată în listă' : 'Scoasă din listă'); render(); return; }
  if (t.name === 'theme') { S.settings.theme = t.value; persist(); applyTheme(); return; }
  if (t.id === 'onlyRo') { S.settings.onlyRo = t.checked; persist(); for (const k in cache) delete cache[k]; say(t.checked ? 'Cărțile în română primele, pornit' : 'Cărțile în română primele, oprit'); return; }
  if (t.id === 'csvFile' && t.files[0]) { const fr = new FileReader(); fr.onload = () => { try { const r = importCSV(String(fr.result)); renderPart('#importOut', `<div class="desc" style="margin-top:14px">Gata! Am importat ${plural(r.added, 'carte', 'cărți')}${r.listsMade ? ` și am creat ${plural(r.listsMade, 'listă', 'liste')}` : ''}.${r.skipped ? ` ${plural(r.skipped, 'carte era', 'cărți erau')} deja în bibliotecă.` : ''}</div>`); say(`Am importat ${plural(r.added, 'carte', 'cărți')}.`); } catch (err) { renderPart('#importOut', `<div class="desc" style="margin-top:14px">${esc(err.message)}</div>`); say(err.message); } }; fr.readAsText(t.files[0]); return; }
  if (t.id === 'jsonFile' && t.files[0]) { const fr = new FileReader(); fr.onload = () => { try { const d = JSON.parse(String(fr.result)); if (!d.books) throw 0; S = Object.assign(blank(), d); persist(); renderPart('#backupOut', `<div class="desc" style="margin-top:14px">Am restaurat ${plural(S.books.length, 'carte', 'cărți')}.</div>`); say('Biblioteca a fost restaurată.'); } catch (err) { renderPart('#backupOut', '<div class="desc" style="margin-top:14px">Fișierul nu este o copie de siguranță Raftul Meu.</div>'); } }; fr.readAsText(t.files[0]); return; }
});
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target, fd = new FormData(f);
  if (f.id === 'searchForm') { clearTimeout(liveT); const q = $('#q').value; $('#q').blur(); runSearch(q); return; }
  if (f.id === 'editForm') {
    const title = String(fd.get('title') || '').trim(); if (!title) { $('#editErr').textContent = 'Scrie titlul cărții.'; $('#e-title').focus(); return; }
    const id = f.dataset.id; let b = id ? byId(id) : null;
    const vals = { title, author: String(fd.get('author') || '').trim(), format: fd.get('format') || 'print', pages: +fd.get('pages') || 0, page: +fd.get('page') || 0, review: String(fd.get('review') || '').trim(), dateFinished: String(fd.get('dateFinished') || '') };
    if (b) { Object.assign(b, vals); b.lastTouch = Date.now(); persist(); closeSheet(true); openSheet(bookSheet(b), b.title); toast('Modificările au fost salvate.'); }
    else { b = addBook(vals, fd.get('status') || 'want'); Object.assign(b, vals); libSeg = b.status; persist(); closeSheet(true); toast(`Am adăugat „${b.title}”.`); }
    render(); return;
  }
  if (f.id === 'sessionForm') { const b = byId(f.dataset.id); if (!b) return; const p = +fd.get('pages') || 0, m = +fd.get('minutes') || 0; if (!p && !m) { toast('Scrie paginile sau minutele.'); return; } logSession(b, p, m, String(fd.get('date') || today())); b.lastTouch = Date.now(); persist(); closeSheet(true); openSheet(bookSheet(b), b.title); toast('Sesiunea a fost notată.'); render(); return; }
  if (f.id === 'listForm') { const name = String(fd.get('name') || '').trim(); if (!name) { $('#listErr').textContent = 'Scrie un nume pentru listă.'; return; } const id = f.dataset.id; if (id) { listById(id).name = name; const top = current(); if (top && top.name === 'list') top.title = name; } else S.lists.push({ id: uid(), name }); persist(); closeSheet(true); render(); toast(id ? 'Lista a fost redenumită.' : `Am creat lista „${name}”.`); if (sheetBook && !id) { const b = byId(sheetBook); if (b) openSheet(pickListsSheet(b), 'Liste'); } return; }
  if (f.id === 'profileForm') { S.profile = { name: String(fd.get('name') || '').trim(), bio: String(fd.get('bio') || '').trim(), favorite: String(fd.get('favorite') || '').trim() }; persist(); toast('Profilul a fost salvat.'); return; }
  if (f.id === 'accountForm') { S.account = { username: String(fd.get('username') || '').trim(), email: String(fd.get('email') || '').trim() }; persist(); toast('Contul a fost salvat.'); return; }
});
function exportBackup() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const name = `raftul-meu-${today()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Copie Raftul Meu' }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Copia de siguranță a fost salvată.');
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#sheets').innerHTML) closeSheet();
  const t = e.target; if (t.getAttribute && t.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const tabs = [...t.parentElement.querySelectorAll('[role=tab]')]; const i = tabs.indexOf(t); const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; n.focus(); n.click(); }
});

/* ================= pornire ================= */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
})();
