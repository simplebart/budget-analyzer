'use strict';

/* ═══════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════ */
let state = {
  transactions: [],
  budgets: {},
  goals: [],
  categories: [
    { name: 'Wonen',         emoji: '🏠', color: '#6c8aff', deletable: false },
    { name: 'Boodschappen',  emoji: '🛒', color: '#34d48a', deletable: false },
    { name: 'Transport',     emoji: '🚌', color: '#ffb340', deletable: false },
    { name: 'Eten & Drinken',emoji: '🍽', color: '#ff5e6c', deletable: false },
    { name: 'Gezondheid',    emoji: '💊', color: '#a78bfa', deletable: false },
    { name: 'Vrije tijd',    emoji: '🎮', color: '#f472b6', deletable: false },
    { name: 'Abonnementen',  emoji: '📱', color: '#fb923c', deletable: false },
    { name: 'Kleding',       emoji: '👕', color: '#22d3ee', deletable: false },
    { name: 'Sparen',        emoji: '💰', color: '#4ade80', deletable: false },
    { name: 'Overig',        emoji: '📦', color: '#94a3b8', deletable: false },
  ],
  settings: { currency: '€', theme: 'dark', monthlyIncome: 0 },
  filters: { type: 'all', cat: 'all', sort: 'date-desc', search: '' },
  analyticsPeriod: 'month',
  selectedGoalColor: '#6c8aff'
};

let charts = {};
let csvParsed = { headers: [], rows: [], mapping: {}, bank: 'auto' };
let csvStep = 1;

const GOAL_COLORS = ['#6c8aff','#34d48a','#ffb340','#ff5e6c','#a78bfa','#f472b6','#fb923c','#22d3ee'];

/* ═══════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════ */
const fmt = n => state.settings.currency + Math.abs(Math.round(n)).toLocaleString('nl-NL');
const fmtSigned = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const today = () => new Date().toISOString().split('T')[0];
const getDayOfMonth = () => new Date().getDate();
const getDaysInMonth = () => new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
const monthName = d => d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

function catColor(name) {
  const c = state.categories.find(c => c.name === name);
  return c ? c.color : '#94a3b8';
}
function catEmoji(name) {
  const c = state.categories.find(c => c.name === name);
  return c ? c.emoji : '📦';
}

/* ═══════════════════════════════════════════════
   PERSISTENCE
   ═══════════════════════════════════════════════ */
function saveState() {
  try { localStorage.setItem('budgetflow_v3', JSON.stringify(state)); } catch(e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem('budgetflow_v3');
    if (raw) {
      const saved = JSON.parse(raw);
      // Merge categories carefully so defaults stay
      if (saved.categories && saved.categories.length) state.categories = saved.categories;
      state = { ...state, ...saved, categories: state.categories };
    }
  } catch(e) {}
}

/* ═══════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════ */
const PAGE_TITLES = { dashboard:'Dashboard', transactions:'Transacties', analytics:'Analytics', budget:'Budgetten', goals:'Doelen', settings:'Instellingen' };

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page];
  if (window.innerWidth <= 900) closeSidebar();
  if (page === 'dashboard')    renderDashboard();
  if (page === 'transactions') renderTransactions();
  if (page === 'analytics')    renderAnalytics();
  if (page === 'budget')       renderBudgets();
  if (page === 'goals')        renderGoals();
  if (page === 'settings')     renderSettings();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function closeSidebar()   { document.getElementById('sidebar').classList.remove('open'); }

/* ═══════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════ */
function openModal(id) {
  document.getElementById('modalBackdrop').classList.add('open');
  document.getElementById('modal-' + id).classList.add('open');
  if (id === 'addTransaction') {
    document.getElementById('txDate').value = today();
    populateCatSelect('txCat', false);
    document.getElementById('txDesc').focus();
  }
  if (id === 'addBudget') populateCatSelect('budgetCat', false);
  if (id === 'addGoal') {
    renderGoalColorPicker();
    const d = new Date(); d.setFullYear(d.getFullYear()+1);
    document.getElementById('goalDate').value = d.toISOString().split('T')[0];
  }
  if (id === 'importCSV') resetCSVModal();
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
  ['txDesc','txAmount','txNote','txFromAccount','txToAccount','budgetLimit','goalName','goalTarget','goalSaved'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

function populateCatSelect(selectId, includeTransfer) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = state.categories.map(c =>
    `<option value="${c.name}">${c.emoji} ${c.name}</option>`
  ).join('');
}

/* ═══════════════════════════════════════════════
   TRANSACTION FORM
   ═══════════════════════════════════════════════ */
let currentTxType = 'income';

function setTxType(type) {
  currentTxType = type;
  ['income','expense','transfer'].forEach(t => {
    document.getElementById('typeBtn' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === type);
  });
  document.getElementById('catGroupWrap').style.display = (type === 'expense') ? '' : 'none';
  document.getElementById('transferAccountsWrap').style.display = (type === 'transfer') ? '' : 'none';
}

function saveTx() {
  const desc = document.getElementById('txDesc').value.trim();
  const amt  = parseFloat(document.getElementById('txAmount').value);
  const date = document.getElementById('txDate').value || today();
  const note = document.getElementById('txNote').value.trim();
  if (!desc || !amt || amt <= 0) { document.getElementById('txDesc').focus(); return; }

  let cat = 'Overig';
  let fromAccount = '', toAccount = '';
  if (currentTxType === 'expense') {
    cat = document.getElementById('txCat').value;
  } else if (currentTxType === 'income') {
    cat = 'Inkomst';
  } else if (currentTxType === 'transfer') {
    cat = 'Transfer';
    fromAccount = document.getElementById('txFromAccount').value.trim();
    toAccount   = document.getElementById('txToAccount').value.trim();
  }

  state.transactions.push({ id: Date.now(), type: currentTxType, desc, amt, date, cat, note, fromAccount, toAccount });
  saveState();
  closeModal();
  renderDashboard();
  updateCatFilter();
}

function deleteTx(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
  renderDashboard();
  renderTransactions();
}

/* ═══════════════════════════════════════════════
   CATEGORIES
   ═══════════════════════════════════════════════ */
function addCategory() {
  const name  = document.getElementById('newCatName').value.trim();
  const emoji = document.getElementById('newCatEmoji').value.trim() || '🏷';
  const color = document.getElementById('newCatColor').value;
  if (!name) return;
  if (state.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    alert('Categorie bestaat al.'); return;
  }
  state.categories.push({ name, emoji, color, deletable: true });
  document.getElementById('newCatName').value = '';
  document.getElementById('newCatEmoji').value = '';
  saveState();
  renderCatManageList();
  populateCatSelect('txCat', false);
  updateCatFilter();
}

function deleteCategory(name) {
  const inUse = state.transactions.some(t => t.cat === name);
  if (inUse && !confirm(`Categorie "${name}" wordt gebruikt in transacties. Toch verwijderen?`)) return;
  state.categories = state.categories.filter(c => c.name !== name);
  if (inUse) state.transactions.forEach(t => { if (t.cat === name) t.cat = 'Overig'; });
  saveState();
  renderCatManageList();
  renderDashboard();
}

function renderCatManageList() {
  const el = document.getElementById('catManageList');
  if (!el) return;
  el.innerHTML = state.categories.map(c => `
    <div class="cat-manage-row">
      <span class="cat-manage-dot" style="background:${c.color}"></span>
      <span class="cat-manage-emoji">${c.emoji}</span>
      <span class="cat-manage-name">${c.name}</span>
      <button class="cat-manage-del" onclick="deleteCategory('${c.name}')" ${!c.deletable ? 'disabled title="Standaard categorie"' : ''}>×</button>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════
   FILTERS
   ═══════════════════════════════════════════════ */
function setFilter(key, val, el) {
  state.filters[key] = val;
  if (el) {
    const group = el.closest('.pill-group');
    if (group) group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
  }
  renderTransactions();
}

function getFilteredTx() {
  let tx = [...state.transactions];
  if (state.filters.type !== 'all')    tx = tx.filter(t => t.type === state.filters.type);
  if (state.filters.cat !== 'all')     tx = tx.filter(t => t.cat === state.filters.cat);
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    tx = tx.filter(t => t.desc.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q));
  }
  switch(state.filters.sort) {
    case 'date-asc':  tx.sort((a,b) => a.date.localeCompare(b.date)); break;
    case 'date-desc': tx.sort((a,b) => b.date.localeCompare(a.date)); break;
    case 'amt-desc':  tx.sort((a,b) => b.amt - a.amt); break;
    case 'amt-asc':   tx.sort((a,b) => a.amt - b.amt); break;
  }
  return tx;
}

function updateCatFilter() {
  const sel = document.getElementById('catFilter');
  if (!sel) return;
  const cats = [...new Set(state.transactions.map(t => t.cat))].sort();
  sel.innerHTML = '<option value="all">Alle categorieën</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

/* ═══════════════════════════════════════════════
   BUDGET
   ═══════════════════════════════════════════════ */
function saveBudget() {
  const cat   = document.getElementById('budgetCat').value;
  const limit = parseFloat(document.getElementById('budgetLimit').value);
  if (!cat || !limit || limit <= 0) return;
  state.budgets[cat] = limit;
  saveState();
  closeModal();
  renderBudgets();
}
function deleteBudget(cat) {
  delete state.budgets[cat];
  saveState();
  renderBudgets();
}

/* ═══════════════════════════════════════════════
   GOALS
   ═══════════════════════════════════════════════ */
function renderGoalColorPicker() {
  document.getElementById('goalColorPicker').innerHTML = GOAL_COLORS.map(c =>
    `<div class="color-swatch${c===state.selectedGoalColor?' selected':''}" style="background:${c}" onclick="selectGoalColor('${c}',this)"></div>`
  ).join('');
}
function selectGoalColor(color, el) {
  state.selectedGoalColor = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}
function saveGoal() {
  const name   = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  const saved  = parseFloat(document.getElementById('goalSaved').value) || 0;
  const date   = document.getElementById('goalDate').value;
  if (!name || !target || target <= 0) return;
  state.goals.push({ id: Date.now(), name, target, saved, date, color: state.selectedGoalColor });
  saveState();
  closeModal();
  renderGoals();
}
function deleteGoal(id) {
  state.goals = state.goals.filter(g => g.id !== id);
  saveState();
  renderGoals();
}

/* ═══════════════════════════════════════════════
   SETTINGS
   ═══════════════════════════════════════════════ */
function setTheme(theme) {
  state.settings.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeLight').classList.toggle('active', theme === 'light');
  document.getElementById('themeDark').classList.toggle('active', theme === 'dark');
  saveState();
  setTimeout(() => { Object.values(charts).forEach(c => { if(c) c.destroy(); }); charts = {}; renderDashboard(); renderAnalytics(); }, 50);
}
function setCurrency(sym) {
  state.settings.currency = sym;
  document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = sym);
  saveState();
  renderDashboard();
}
function saveIncome() {
  const val = parseFloat(document.getElementById('incomeInput').value);
  if (val > 0) { state.settings.monthlyIncome = val; saveState(); renderDashboard(); }
}
function exportCSV() {
  const rows = [['Datum','Omschrijving','Categorie','Type','Bedrag','Van','Naar','Notitie']];
  [...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)).forEach(t => {
    rows.push([t.date, t.desc, t.cat, t.type, t.amt.toFixed(2), t.fromAccount||'', t.toAccount||'', t.note||'']);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'budgetflow-export.csv';
  a.click();
}
function clearAllData() {
  if (!confirm('Weet je zeker dat je alle data wilt wissen?')) return;
  state.transactions = [];
  state.budgets = {};
  state.goals = [];
  saveState();
  renderDashboard();
  navigate('dashboard');
}
function loadDemoData() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const pm = String(now.getMonth() || 12).padStart(2,'0');
  const py = now.getMonth() === 0 ? y-1 : y;
  state.transactions = [
    { id:1,  type:'income',   desc:'Salaris',            amt:2850, date:`${y}-${m}-01`, cat:'Inkomst',       note:'', fromAccount:'', toAccount:'' },
    { id:2,  type:'income',   desc:'Freelance project',  amt:450,  date:`${y}-${m}-05`, cat:'Inkomst',       note:'Webdesign', fromAccount:'', toAccount:'' },
    { id:3,  type:'expense',  desc:'Huur',               amt:950,  date:`${y}-${m}-01`, cat:'Wonen',         note:'', fromAccount:'', toAccount:'' },
    { id:4,  type:'expense',  desc:'Albert Heijn',       amt:94,   date:`${y}-${m}-03`, cat:'Boodschappen',  note:'', fromAccount:'', toAccount:'' },
    { id:5,  type:'expense',  desc:'NS Maandkaart',      amt:110,  date:`${y}-${m}-01`, cat:'Transport',     note:'', fromAccount:'', toAccount:'' },
    { id:6,  type:'expense',  desc:'Netflix',            amt:13,   date:`${y}-${m}-02`, cat:'Abonnementen',  note:'', fromAccount:'', toAccount:'' },
    { id:7,  type:'expense',  desc:'Spotify',            amt:10,   date:`${y}-${m}-02`, cat:'Abonnementen',  note:'', fromAccount:'', toAccount:'' },
    { id:8,  type:'expense',  desc:'Gym abonnement',     amt:35,   date:`${y}-${m}-01`, cat:'Gezondheid',    note:'', fromAccount:'', toAccount:'' },
    { id:9,  type:'expense',  desc:'Restaurant',         amt:67,   date:`${y}-${m}-08`, cat:'Eten & Drinken',note:'Diner', fromAccount:'', toAccount:'' },
    { id:10, type:'expense',  desc:'Jumbo',              amt:78,   date:`${y}-${m}-10`, cat:'Boodschappen',  note:'', fromAccount:'', toAccount:'' },
    { id:11, type:'expense',  desc:'Koffie & lunch',     amt:42,   date:`${y}-${m}-11`, cat:'Eten & Drinken',note:'', fromAccount:'', toAccount:'' },
    { id:12, type:'expense',  desc:'Zara',               amt:89,   date:`${y}-${m}-14`, cat:'Kleding',       note:'', fromAccount:'', toAccount:'' },
    { id:13, type:'expense',  desc:'Energie rekening',   amt:85,   date:`${y}-${m}-04`, cat:'Wonen',         note:'', fromAccount:'', toAccount:'' },
    { id:14, type:'expense',  desc:'Internet',           amt:45,   date:`${y}-${m}-04`, cat:'Abonnementen',  note:'', fromAccount:'', toAccount:'' },
    { id:15, type:'transfer', desc:'Naar spaarrekening', amt:300,  date:`${y}-${m}-01`, cat:'Transfer',      note:'Maandelijks sparen', fromAccount:'Betaalrekening', toAccount:'Spaarrekening' },
    { id:16, type:'expense',  desc:'Bar avondje uit',    amt:55,   date:`${y}-${m}-13`, cat:'Vrije tijd',    note:'', fromAccount:'', toAccount:'' },
    { id:17, type:'income',   desc:'Salaris',            amt:2850, date:`${py}-${pm}-01`, cat:'Inkomst',     note:'', fromAccount:'', toAccount:'' },
    { id:18, type:'expense',  desc:'Huur',               amt:950,  date:`${py}-${pm}-01`, cat:'Wonen',       note:'', fromAccount:'', toAccount:'' },
    { id:19, type:'expense',  desc:'Boodschappen',       amt:160,  date:`${py}-${pm}-05`, cat:'Boodschappen',note:'', fromAccount:'', toAccount:'' },
    { id:20, type:'expense',  desc:'Transport',          amt:110,  date:`${py}-${pm}-01`, cat:'Transport',   note:'', fromAccount:'', toAccount:'' },
    { id:21, type:'expense',  desc:'Abonnementen',       amt:68,   date:`${py}-${pm}-02`, cat:'Abonnementen',note:'', fromAccount:'', toAccount:'' },
    { id:22, type:'transfer', desc:'Sparen',             amt:250,  date:`${py}-${pm}-01`, cat:'Transfer',    note:'', fromAccount:'Betaalrekening', toAccount:'Spaarrekening' },
  ];
  state.budgets = { 'Wonen':1100,'Boodschappen':200,'Transport':130,'Eten & Drinken':150,'Vrije tijd':100,'Abonnementen':80,'Gezondheid':100 };
  state.goals   = [
    { id:1, name:'Vakantie Japan', target:3000, saved:1200, date:`${y+1}-06-01`, color:'#6c8aff' },
    { id:2, name:'Noodfonds',      target:5000, saved:2750, date:`${y+1}-12-31`, color:'#34d48a' },
    { id:3, name:'Nieuwe laptop',  target:1500, saved:600,  date:`${y}-10-01`,   color:'#ffb340' },
  ];
  saveState();
  navigate('dashboard');
}

/* ═══════════════════════════════════════════════
   CSV IMPORT
   ═══════════════════════════════════════════════ */

// Bank column presets
const BANK_PRESETS = {
  ing:     { date:'Datum',         desc:'Naam / Omschrijving', amt:'Bedrag (EUR)', type:'Af Bij' },
  rabo:    { date:'Datum',         desc:'Omschrijving',         amt:'Bedrag',       type:'Debet/Credit' },
  abn:     { date:'Transactiedatum',desc:'Omschrijving',        amt:'Bedrag',       type:'Mutatiecode' },
  sns:     { date:'Boekingsdatum', desc:'Omschrijving',         amt:'Bedrag',       type:'Af/Bij' },
  generic: { date:'',             desc:'',                      amt:'',             type:'' },
  auto:    { date:'',             desc:'',                      amt:'',             type:'' },
};

let selectedBank = 'auto';

function selectBank(bank, el) {
  selectedBank = bank;
  document.querySelectorAll('#modal-importCSV .pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
}

function resetCSVModal() {
  csvStep = 1;
  csvParsed = { headers:[], rows:[], mapping:{}, bank:'auto' };
  document.getElementById('csvStep1').style.display = '';
  document.getElementById('csvStep2').style.display = 'none';
  document.getElementById('csvStep3').style.display = 'none';
  document.getElementById('csvNextBtn').style.display = 'none';
  document.getElementById('csvFileInput').value = '';
  const dz = document.getElementById('csvDropzone');
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag-over'); };
  dz.ondragleave = () => dz.classList.remove('drag-over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('drag-over'); handleCSVFile(e.dataTransfer.files[0]); };
}

function handleCSVFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    parseCSV(text);
  };
  reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
  // Auto-detect delimiter
  const firstLine = text.split('\n')[0];
  const delimiters = [',', ';', '\t', '|'];
  let delim = ',';
  let maxCount = 0;
  delimiters.forEach(d => {
    const count = (firstLine.match(new RegExp('\\' + d === '\\|' ? '\\|' : d, 'g')) || []).length;
    if (count > maxCount) { maxCount = count; delim = d; }
  });

  const lines = text.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0], delim).map(h => h.trim().replace(/^"|"$/g,''));
  const rows = lines.slice(1)
    .map(l => parseCSVLine(l, delim).map(v => v.trim().replace(/^"|"$/g,'')))
    .filter(r => r.length >= Math.max(2, headers.length - 2) && r.some(v => v));

  csvParsed.headers = headers;
  csvParsed.rows = rows;
  csvParsed.delim = delim;

  document.getElementById('csvRowCount').textContent = rows.length;

  // Auto-map columns
  const preset = BANK_PRESETS[selectedBank] || {};
  const autoMapping = {};
  const fields = ['date','desc','amt','type'];
  const fieldLabels = { date:'Datum', desc:'Omschrijving', amt:'Bedrag', type:'Type (Af/Bij)' };

  fields.forEach(f => {
    // Try preset first
    if (preset[f] && headers.includes(preset[f])) {
      autoMapping[f] = preset[f];
    } else {
      // Auto-detect by common keywords
      const keywords = {
        date: ['datum','date','boekdatum','transactiedatum','boekingsdatum','valuedate'],
        desc: ['omschrijving','naam','description','mededelingen','name/omschrijving','naam / omschrijving','omschrijving-1'],
        amt:  ['bedrag','amount','bedrag (eur)','mutatie','saldo','credit','debit'],
        type: ['af bij','af/bij','debet/credit','mutatiecode','bij/af','credit/debet','type']
      };
      const found = headers.find(h => keywords[f].some(k => h.toLowerCase().includes(k)));
      if (found) autoMapping[f] = found;
    }
  });

  csvParsed.mapping = autoMapping;

  // Go to step 2
  csvStep = 2;
  document.getElementById('csvStep1').style.display = 'none';
  document.getElementById('csvStep2').style.display = '';
  document.getElementById('csvNextBtn').style.display = '';
  document.getElementById('csvNextBtn').textContent = 'Voorbeeld →';

  renderCSVMapGrid(fields, fieldLabels);
  renderCSVPreview();
}

function parseCSVLine(line, delim) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === delim && !inQuote) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

function renderCSVMapGrid(fields, fieldLabels) {
  const grid = document.getElementById('csvMapGrid');
  const options = ['(negeer)', ...csvParsed.headers];
  grid.innerHTML = fields.map(f => `
    <div class="csv-map-row">
      <label class="csv-map-label">${fieldLabels[f]}${f==='date'||f==='desc'||f==='amt'?' *':''}</label>
      <select class="filter-select" id="csvMap_${f}" style="width:100%">
        ${options.map(o => `<option value="${o}"${csvParsed.mapping[f]===o?' selected':''}>${o}</option>`).join('')}
      </select>
    </div>`).join('');
}

function renderCSVPreview() {
  const table = document.getElementById('csvPreviewTable');
  const preview = csvParsed.rows.slice(0,5);
  table.innerHTML = `
    <thead><tr>${csvParsed.headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${preview.map(r=>`<tr>${r.map(c=>`<td>${c||'—'}</td>`).join('')}</tr>`).join('')}</tbody>
  `;
}

function csvNext() {
  if (csvStep === 2) {
    // Read mapping
    ['date','desc','amt','type'].forEach(f => {
      const sel = document.getElementById('csvMap_' + f);
      if (sel) csvParsed.mapping[f] = sel.value === '(negeer)' ? '' : sel.value;
    });
    if (!csvParsed.mapping.date || !csvParsed.mapping.desc || !csvParsed.mapping.amt) {
      alert('Vul minimaal Datum, Omschrijving en Bedrag in.'); return;
    }
    buildFinalPreview();
    csvStep = 3;
    document.getElementById('csvStep2').style.display = 'none';
    document.getElementById('csvStep3').style.display = '';
    document.getElementById('csvNextBtn').textContent = '✓ Importeren';
  } else if (csvStep === 3) {
    doImport();
  }
}

function buildFinalPreview() {
  const { headers, rows, mapping } = csvParsed;
  const hi = k => headers.indexOf(mapping[k]);

  const parsed = rows.map(r => {
    const dateRaw = mapping.date ? r[hi('date')] || '' : '';
    const desc    = mapping.desc ? r[hi('desc')] || '' : '';
    const amtRaw  = mapping.amt  ? r[hi('amt')]  || '0' : '0';
    const typeRaw = mapping.type ? r[hi('type')] || '' : '';

    // Parse amount — handle comma as decimal separator
    let amt = parseFloat(amtRaw.replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,'')) || 0;
    amt = Math.abs(amt);

    // Determine type from type column or amount sign
    let type = 'expense';
    const tl = typeRaw.toLowerCase();
    if (tl.includes('bij') || tl.includes('credit') || tl.includes('cr') || tl === 'c') type = 'income';
    else if (tl.includes('af') || tl.includes('debet') || tl.includes('db') || tl === 'd') type = 'expense';
    // If no type column, use original sign of amount
    else if (!mapping.type && parseFloat(amtRaw.replace(',','.')) > 0) type = 'income';
    else if (!mapping.type && parseFloat(amtRaw.replace(',','.')) < 0) type = 'expense';

    // Parse date
    let date = today();
    const dClean = dateRaw.replace(/\./g,'-').replace(/\//g,'-');
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dClean)) date = dClean;
    // Try DD-MM-YYYY
    else if (/^\d{2}-\d{2}-\d{4}$/.test(dClean)) { const p=dClean.split('-'); date=`${p[2]}-${p[1]}-${p[0]}`; }
    // Try YYYYMMDD
    else if (/^\d{8}$/.test(dateRaw)) date=`${dateRaw.slice(0,4)}-${dateRaw.slice(4,6)}-${dateRaw.slice(6,8)}`;

    return { date, desc, amt, type, cat: type === 'income' ? 'Inkomst' : 'Overig' };
  }).filter(r => r.amt > 0 && r.desc);

  csvParsed.finalRows = parsed;

  const inc = parsed.filter(r=>r.type==='income').reduce((a,r)=>a+r.amt,0);
  const exp = parsed.filter(r=>r.type==='expense').reduce((a,r)=>a+r.amt,0);
  document.getElementById('csvImportSummary').innerHTML = `
    <span class="csv-sum-item"><strong>${parsed.length}</strong> transacties</span>
    <span class="csv-sum-item">Inkomsten: <strong style="color:var(--green)">${fmt(inc)}</strong></span>
    <span class="csv-sum-item">Uitgaven: <strong style="color:var(--red)">${fmt(exp)}</strong></span>
  `;

  const table = document.getElementById('csvFinalTable');
  table.innerHTML = `
    <thead><tr><th>Datum</th><th>Omschrijving</th><th>Type</th><th>Bedrag</th><th>Categorie</th></tr></thead>
    <tbody>${parsed.slice(0,50).map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.desc}</td>
        <td><span class="tx-type-badge ${r.type}">${r.type==='income'?'Inkomst':'Uitgave'}</span></td>
        <td style="font-family:'Space Grotesk',sans-serif;font-weight:600;color:${r.type==='income'?'var(--green)':'var(--red)'}">${fmt(r.amt)}</td>
        <td>
          <select class="filter-select" style="font-size:11px;padding:3px 6px" onchange="csvParsed.finalRows[${parsed.indexOf(r)}].cat=this.value">
            ${state.categories.map(c=>`<option value="${c.name}"${r.cat===c.name?' selected':''}>${c.emoji} ${c.name}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('')}
    </tbody>`;
}

function doImport() {
  const rows = csvParsed.finalRows || [];
  if (!rows.length) { alert('Geen geldige transacties gevonden.'); return; }
  rows.forEach(r => {
    state.transactions.push({ id: Date.now() + Math.random(), type: r.type, desc: r.desc, amt: r.amt, date: r.date, cat: r.cat, note: '', fromAccount: '', toAccount: '' });
  });
  saveState();
  closeModal();
  updateCatFilter();
  navigate('transactions');
  const toast = document.createElement('div');
  toast.textContent = `✓ ${rows.length} transacties geïmporteerd`;
  Object.assign(toast.style, { position:'fixed', bottom:'24px', right:'24px', background:'var(--green)', color:'#fff', padding:'10px 18px', borderRadius:'8px', fontFamily:"'Space Grotesk',sans-serif", fontWeight:'600', fontSize:'13px', zIndex:'9999', animation:'none' });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* ═══════════════════════════════════════════════
   COMPUTE METRICS
   ═══════════════════════════════════════════════ */
function getCurrentMonthTx() {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  return state.transactions.filter(t => t.date.startsWith(prefix));
}

function computeMetrics() {
  const tx      = getCurrentMonthTx();
  const income   = tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const expense  = tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const transfer = tx.filter(t=>t.type==='transfer').reduce((a,t)=>a+t.amt,0);
  const balance  = income - expense;
  const cats     = {};
  tx.filter(t=>t.type==='expense').forEach(t => { cats[t.cat]=(cats[t.cat]||0)+t.amt; });
  const day = getDayOfMonth();
  const burnDaily = day > 0 ? expense/day : 0;
  const projected = burnDaily * getDaysInMonth();
  let score = 0;
  const breakdown = [];
  if (income > 0) {
    const sr = balance/income;
    let pts = sr>=0.3?35:sr>=0.2?25:sr>=0.1?15:sr>=0?5:0; score+=pts;
    breakdown.push({ name:'Spaarquote', pts, max:35 });
    const er = expense/income;
    pts = er<=0.6?25:er<=0.75?18:er<=0.9?10:3; score+=pts;
    breakdown.push({ name:'Uitgavenratio', pts, max:25 });
    const hp = (cats['Wonen']||0)/income;
    pts = hp<=0.3?20:hp<=0.4?14:hp<=0.5?7:0; score+=pts;
    breakdown.push({ name:'Woonlasten', pts, max:20 });
    const nc = Object.keys(cats).length;
    pts = nc>=4?20:nc>=2?12:nc>=1?6:0; score+=pts;
    breakdown.push({ name:'Diversiteit', pts, max:20 });
  }
  return { income, expense, transfer, balance, cats, burnDaily, projected, score:Math.min(100,score), breakdown };
}

/* ═══════════════════════════════════════════════
   RENDER DASHBOARD
   ═══════════════════════════════════════════════ */
function renderDashboard() {
  const now = new Date();
  document.getElementById('dashSub').textContent = monthName(now);
  document.getElementById('sidebarMonth').textContent = monthName(now);
  const { income, expense, transfer, balance, cats, burnDaily, projected, score, breakdown } = computeMetrics();

  document.getElementById('kpiIncome').textContent = fmt(income);
  document.getElementById('kpiExpense').textContent = fmt(expense);
  const transCount = getCurrentMonthTx().filter(t=>t.type==='transfer').length;
  document.getElementById('kpiTransfer').textContent = fmt(transfer);
  document.getElementById('kpiTransferSub').textContent = transCount + ' transfer' + (transCount!==1?'s':'');
  document.getElementById('kpiBalance').textContent = fmt(Math.abs(balance));
  document.getElementById('kpiBalance').style.color = balance>=0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('kpiBalSub').textContent = income>0 ? Math.round((balance/income)*100)+'% van inkomsten' : 'van inkomsten';
  document.getElementById('kpiExpenseBar').style.width = income>0 ? Math.min(100,(expense/income)*100)+'%' : '0%';
  document.getElementById('kpiScore').textContent = income>0 ? score : '—';
  document.getElementById('kpiScoreLabel').textContent = score>=80?'Uitstekend':score>=60?'Goed':score>=40?'Matig':income>0?'Aandacht':'Voeg data toe';

  renderCashflowChart();
  renderDonutChart(cats);

  // Health ring
  const arc = document.getElementById('healthRing');
  arc.style.strokeDashoffset = 301.6 - (301.6*score/100);
  arc.style.stroke = score>=70?'var(--green)':score>=40?'var(--amber)':'var(--red)';
  document.getElementById('healthScore').textContent = score;
  document.getElementById('healthBreakdown').innerHTML = breakdown.map(b => {
    const pct = Math.round((b.pts/b.max)*100);
    const col = pct>=70?'var(--green)':pct>=40?'var(--amber)':'var(--red)';
    return `<div class="health-item"><span class="health-item-name">${b.name}</span><span class="health-item-pts" style="color:${col}">${b.pts}/${b.max}</span></div>`;
  }).join('') || '<div class="empty-state" style="padding:8px;font-size:12px">Voeg data toe</div>';

  // Recent
  const recent = [...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  const recEl = document.getElementById('recentTxList');
  recEl.innerHTML = recent.length ? recent.map(t => {
    const col = t.type==='income'?'var(--green)':t.type==='transfer'?'var(--purple)':(catColor(t.cat));
    const amtCol = t.type==='income'?'var(--green)':t.type==='transfer'?'var(--purple)':'var(--red)';
    const sign = t.type==='income'?'+':t.type==='transfer'?'⇄':'−';
    return `<div class="tx-mini-row">
      <span class="tx-mini-dot" style="background:${col}"></span>
      <span class="tx-mini-name">${t.desc}</span>
      <span class="tx-mini-cat">${t.cat}</span>
      <span class="tx-mini-amt" style="color:${amtCol}">${sign}${fmt(t.amt)}</span>
    </div>`;
  }).join('') : '<div class="empty-state">Nog geen transacties</div>';

  // Burn
  document.getElementById('burnDaily').textContent = fmt(burnDaily);
  document.getElementById('burnWeekly').textContent = fmt(burnDaily*7);
  document.getElementById('burnProjected').textContent = fmt(projected);
  const day = getDayOfMonth(), dim = getDaysInMonth();
  document.getElementById('projFill').style.width = income>0 ? Math.min(100,Math.round((projected/income)*100))+'%' : '0%';
  document.getElementById('projMarker').style.left = Math.round((day/dim)*100)+'%';
  document.getElementById('projCurrent').textContent = fmt(expense);
  document.getElementById('projEnd').textContent = fmt(projected);
  document.getElementById('txPageSub').textContent = state.transactions.length+' transacties in totaal';
}

/* ═══════════════════════════════════════════════
   CHARTS
   ═══════════════════════════════════════════════ */
function chartColors() {
  return {
    grid: state.settings.theme==='light'?'rgba(0,0,0,0.05)':'rgba(255,255,255,0.05)',
    text: state.settings.theme==='light'?'#9090a8':'#5a5a72'
  };
}

function renderCashflowChart() {
  const { grid, text } = chartColors();
  const months=[], incD=[], expD=[], traD=[];
  for (let i=5;i>=0;i--) {
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const prefix=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months.push(d.toLocaleDateString('nl-NL',{month:'short'}));
    const tx=state.transactions.filter(t=>t.date.startsWith(prefix));
    incD.push(Math.round(tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0)));
    expD.push(Math.round(tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0)));
    traD.push(Math.round(tx.filter(t=>t.type==='transfer').reduce((a,t)=>a+t.amt,0)));
  }
  const ctx=document.getElementById('cashflowChart').getContext('2d');
  if (charts.cashflow) charts.cashflow.destroy();
  charts.cashflow=new Chart(ctx,{type:'bar',data:{labels:months,datasets:[
    {label:'Inkomsten',data:incD,backgroundColor:'rgba(52,212,138,0.75)',borderRadius:4,borderSkipped:false},
    {label:'Uitgaven', data:expD,backgroundColor:'rgba(255,94,108,0.75)', borderRadius:4,borderSkipped:false},
    {label:'Transfers',data:traD,backgroundColor:'rgba(167,139,250,0.65)',borderRadius:4,borderSkipped:false},
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});
  document.getElementById('cashflowLegend').innerHTML=[{label:'Inkomsten',color:'#34d48a'},{label:'Uitgaven',color:'#ff5e6c'},{label:'Transfers',color:'#a78bfa'}].map(l=>`<span class="legend-item"><span class="legend-dot" style="background:${l.color}"></span>${l.label}</span>`).join('');
}

function renderDonutChart(cats) {
  const entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const total=entries.reduce((a,[,v])=>a+v,0);
  document.getElementById('donutTotal').textContent=fmt(total);
  const ctx=document.getElementById('donutChart').getContext('2d');
  if (charts.donut) charts.donut.destroy();
  if (!entries.length) { document.getElementById('donutLegend').innerHTML='<div style="font-size:12px;color:var(--text3);text-align:center">Geen uitgaven</div>'; return; }
  charts.donut=new Chart(ctx,{type:'doughnut',data:{labels:entries.map(([k])=>k),datasets:[{data:entries.map(([,v])=>Math.round(v)),backgroundColor:entries.map(([k])=>catColor(k)),borderWidth:2,borderColor:state.settings.theme==='light'?'#ffffff':'#16161d',hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:true,cutout:'68%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+state.settings.currency+c.raw.toLocaleString('nl-NL')+' ('+Math.round(c.raw/total*100)+'%)'}}}}});
  document.getElementById('donutLegend').innerHTML=entries.slice(0,6).map(([k,v])=>`<div class="donut-leg-row"><span class="donut-leg-name"><span class="donut-leg-dot" style="background:${catColor(k)}"></span>${k}</span><span class="donut-leg-amt">${fmt(v)}</span></div>`).join('');
}

/* ═══════════════════════════════════════════════
   RENDER TRANSACTIONS
   ═══════════════════════════════════════════════ */
function renderTransactions() {
  updateCatFilter();
  const tx=getFilteredTx();
  const tbody=document.getElementById('txTableBody');
  if (!tx.length) { tbody.innerHTML='<tr><td colspan="5" class="empty-state">Geen transacties gevonden</td></tr>'; document.getElementById('txSummary').innerHTML=''; return; }
  tbody.innerHTML=tx.map(t=>{
    const col=t.type==='income'?'var(--green)':t.type==='transfer'?'var(--purple)':(catColor(t.cat));
    const amtClass=t.type==='income'?'income':t.type==='transfer'?'transfer':'expense';
    const sign=t.type==='income'?'+':t.type==='transfer'?'⇄':'−';
    const d=new Date(t.date);
    const dateStr=d.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'});
    const subLine=t.type==='transfer'&&(t.fromAccount||t.toAccount)?`<div style="font-size:11px;color:var(--text3)">${t.fromAccount||'?'} → ${t.toAccount||'?'}</div>`:t.note?`<div style="font-size:11px;color:var(--text3)">${t.note}</div>`:'';
    return `<tr>
      <td><div style="font-weight:500">${t.desc}</div>${subLine}</td>
      <td><span class="tx-cat-badge"><span class="tx-cat-dot" style="background:${col}"></span>${t.cat}</span></td>
      <td class="tx-date-cell">${dateStr}</td>
      <td class="tx-amount-cell"><span class="tx-amount ${amtClass}">${sign}${fmt(t.amt)}</span></td>
      <td class="tx-actions"><button class="tx-del-btn" onclick="deleteTx(${t.id})">×</button></td>
    </tr>`;
  }).join('');
  const inc=tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const exp=tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const tra=tx.filter(t=>t.type==='transfer').reduce((a,t)=>a+t.amt,0);
  document.getElementById('txSummary').innerHTML=`
    <span class="tx-summary-item">${tx.length} transacties</span>
    <span class="tx-summary-item">Inkomsten: <strong style="color:var(--green)">${fmt(inc)}</strong></span>
    <span class="tx-summary-item">Uitgaven: <strong style="color:var(--red)">${fmt(exp)}</strong></span>
    ${tra>0?`<span class="tx-summary-item">Transfers: <strong style="color:var(--purple)">${fmt(tra)}</strong></span>`:''}
    <span class="tx-summary-item">Saldo: <strong style="color:${inc-exp>=0?'var(--green)':'var(--red)'}">${fmtSigned(inc-exp)}</strong></span>`;
}

/* ═══════════════════════════════════════════════
   RENDER ANALYTICS
   ═══════════════════════════════════════════════ */
function renderAnalytics() {
  const { grid, text } = chartColors();
  const nM=state.analyticsPeriod==='year'?12:6;
  const periods=[];
  for (let i=nM-1;i>=0;i--) { const d=new Date(); d.setMonth(d.getMonth()-i); periods.push({d,prefix:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleDateString('nl-NL',{month:'short'})}); }
  const labels=periods.map(p=>p.label);
  const incArr=periods.map(p=>Math.round(state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='income').reduce((a,t)=>a+t.amt,0)));
  const expArr=periods.map(p=>Math.round(state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='expense').reduce((a,t)=>a+t.amt,0)));

  const ctx1=document.getElementById('incExpChart').getContext('2d');
  if (charts.incExp) charts.incExp.destroy();
  charts.incExp=new Chart(ctx1,{type:'line',data:{labels,datasets:[{label:'Inkomsten',data:incArr,borderColor:'#34d48a',backgroundColor:'rgba(52,212,138,0.08)',tension:0.4,fill:true,pointRadius:4,pointBackgroundColor:'#34d48a'},{label:'Uitgaven',data:expArr,borderColor:'#ff5e6c',backgroundColor:'rgba(255,94,108,0.08)',tension:0.4,fill:true,pointRadius:4,pointBackgroundColor:'#ff5e6c'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});
  document.getElementById('incExpLegend').innerHTML=[{label:'Inkomsten',color:'#34d48a'},{label:'Uitgaven',color:'#ff5e6c'}].map(l=>`<span class="legend-item"><span class="legend-dot" style="background:${l.color}"></span>${l.label}</span>`).join('');

  const topCats=Object.entries(state.transactions.filter(t=>t.type==='expense').reduce((a,t)=>{a[t.cat]=(a[t.cat]||0)+t.amt;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k])=>k);
  const ctx2=document.getElementById('catTrendChart').getContext('2d');
  if (charts.catTrend) charts.catTrend.destroy();
  charts.catTrend=new Chart(ctx2,{type:'line',data:{labels,datasets:topCats.map(cat=>({label:cat,data:periods.map(p=>Math.round(state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='expense'&&t.cat===cat).reduce((a,t)=>a+t.amt,0))),borderColor:catColor(cat),backgroundColor:'transparent',tension:0.4,pointRadius:3}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+': '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});

  const savRates=periods.map(p=>{const inc=state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='income').reduce((a,t)=>a+t.amt,0);const exp=state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='expense').reduce((a,t)=>a+t.amt,0);return inc>0?Math.round(((inc-exp)/inc)*100):0;});
  const ctx3=document.getElementById('savingsRateChart').getContext('2d');
  if (charts.savRate) charts.savRate.destroy();
  charts.savRate=new Chart(ctx3,{type:'bar',data:{labels,datasets:[{data:savRates,backgroundColor:savRates.map(v=>v>=20?'rgba(52,212,138,0.75)':v>=0?'rgba(255,179,64,0.75)':'rgba(255,94,108,0.75)'),borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.raw+'%'}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>v+'%'}}}}});

  const wd=new Array(7).fill(0),wc=new Array(7).fill(0);
  state.transactions.filter(t=>t.type==='expense').forEach(t=>{const d=(new Date(t.date).getDay()+6)%7;wd[d]+=t.amt;wc[d]++;});
  const wAvg=wd.map((s,i)=>wc[i]>0?Math.round(s/wc[i]):0);
  const ctx4=document.getElementById('weekdayChart').getContext('2d');
  if (charts.weekday) charts.weekday.destroy();
  charts.weekday=new Chart(ctx4,{type:'bar',data:{labels:['Ma','Di','Wo','Do','Vr','Za','Zo'],datasets:[{data:wAvg,backgroundColor:'rgba(108,138,255,0.7)',borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' gem. '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});

  renderInsights();
}

function renderInsights() {
  const { income, expense, balance, cats, burnDaily, projected } = computeMetrics();
  const insights = [];
  if (income > 0) {
    const sp=Math.round((balance/income)*100);
    if (sp>=20) insights.push({type:'good',icon:'💚',title:'Spaardoel gehaald',body:`Je spaart ${sp}% van je inkomsten — boven de aanbevolen 20%.`});
    else if (sp<0) insights.push({type:'bad',icon:'🚨',title:'Budget overschreden',body:`Je hebt ${fmt(Math.abs(balance))} meer uitgegeven dan je hebt verdiend.`});
    else insights.push({type:'warn',icon:'⚠️',title:'Spaarquote laag',body:`Je spaart ${sp}% — probeer 20% als doel (${fmt(income*0.2)}/maand).`});
    const hp=Math.round(((cats['Wonen']||0)/income)*100);
    if (hp>40) insights.push({type:'warn',icon:'🏠',title:'Hoge woonlasten',body:`Wonen is ${hp}% van je inkomsten. Aanbeveling is max. 30-35%.`});
    const subs=cats['Abonnementen']||0;
    if (subs>0) insights.push({type:'info',icon:'📱',title:'Abonnementen',body:`Je geeft ${fmt(subs)}/maand uit aan abonnementen.`});
    if (projected>income) insights.push({type:'bad',icon:'📈',title:'Burn rate te hoog',body:`Op dit tempo: ${fmt(projected)} uitgaven vs ${fmt(income)} inkomen.`});
    else insights.push({type:'good',icon:'📉',title:'Burn rate gezond',body:`Projectie ${fmt(projected)} blijft onder inkomen ${fmt(income)}.`});
    const bigCat=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
    if (bigCat) insights.push({type:'info',icon:'📊',title:'Grootste categorie',body:`${bigCat[0]}: ${fmt(bigCat[1])} (${Math.round(bigCat[1]/expense*100)}% van totaal).`});
  } else {
    insights.push({type:'info',icon:'💡',title:'Voeg inkomsten toe',body:'Voeg je maandinkomen toe om inzichten te genereren.'});
  }
  document.getElementById('insightsGrid').innerHTML=insights.map(i=>`<div class="insight-tile ${i.type}"><div class="insight-icon">${i.icon}</div><div class="insight-title">${i.title}</div><div class="insight-body">${i.body}</div></div>`).join('');
}

/* ═══════════════════════════════════════════════
   RENDER BUDGETS
   ═══════════════════════════════════════════════ */
function renderBudgets() {
  const grid=document.getElementById('budgetGrid');
  const entries=Object.entries(state.budgets);
  if (!entries.length) { grid.innerHTML=`<div class="empty-card"><div class="empty-icon">◎</div><div class="empty-title">Nog geen budgetten</div><div class="empty-sub">Stel een limiet in per categorie.</div><button class="btn-primary" onclick="openModal('addBudget')">Budget toevoegen</button></div>`; return; }
  const tx=getCurrentMonthTx();
  grid.innerHTML=entries.map(([cat,limit])=>{
    const spent=tx.filter(t=>t.type==='expense'&&t.cat===cat).reduce((a,t)=>a+t.amt,0);
    const pct=Math.min(100,Math.round((spent/limit)*100));
    const over=spent>limit, warn=pct>=80&&!over;
    const col=catColor(cat);
    const barCol=over?'var(--red)':warn?'var(--amber)':col;
    const remaining=limit-spent;
    return `<div class="budget-card">
      <div class="budget-card-header">
        <div class="budget-cat-name"><span class="budget-cat-dot" style="background:${col}"></span>${catEmoji(cat)} ${cat}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="budget-pct-badge ${over?'over':warn?'warn':'ok'}">${pct}%</span>
          <button class="budget-del-btn" onclick="deleteBudget('${cat}')">×</button>
        </div>
      </div>
      <div class="budget-spent">${fmt(spent)}</div>
      <div class="budget-amounts"><span>van ${fmt(limit)} budget</span><span style="color:${over?'var(--red)':remaining<limit*0.2?'var(--amber)':'var(--green)'}">${over?'−'+fmt(Math.abs(remaining))+' over':fmt(remaining)+' resterend'}</span></div>
      <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${pct}%;background:${barCol}"></div></div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════
   RENDER GOALS
   ═══════════════════════════════════════════════ */
function renderGoals() {
  const grid=document.getElementById('goalsGrid');
  if (!state.goals.length) { grid.innerHTML=`<div class="empty-card"><div class="empty-icon">★</div><div class="empty-title">Nog geen doelen</div><div class="empty-sub">Voeg een spaardoel toe.</div><button class="btn-primary" onclick="openModal('addGoal')">Doel toevoegen</button></div>`; return; }
  grid.innerHTML=state.goals.map(g=>{
    const pct=Math.min(100,Math.round((g.saved/g.target)*100));
    const remaining=g.target-g.saved;
    const ml=Math.max(1,Math.ceil((new Date(g.date)-new Date())/(1000*60*60*24*30)));
    const monthly=remaining>0?remaining/ml:0;
    const done=g.saved>=g.target;
    return `<div class="goal-card" style="border-top:3px solid ${g.color}">
      <div class="goal-header">
        <div><div class="goal-name">${g.name}${done?' ✓':''}</div><div class="goal-date">Doel: ${new Date(g.date).toLocaleDateString('nl-NL',{month:'long',year:'numeric'})}</div></div>
        <button class="goal-del-btn" onclick="deleteGoal(${g.id})">×</button>
      </div>
      <div class="goal-pct" style="color:${g.color}">${pct}%</div>
      <div class="goal-amounts">${fmt(g.saved)} gespaard van ${fmt(g.target)}</div>
      <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%;background:${g.color}"></div></div>
      ${done?`<div class="goal-monthly" style="color:var(--green)">🎉 Doel behaald!</div>`:`<div class="goal-monthly">Nog <strong>${fmt(remaining)}</strong> — spaar <strong>${fmt(monthly)}/maand</strong></div>`}
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════
   RENDER SETTINGS
   ═══════════════════════════════════════════════ */
function renderSettings() {
  document.getElementById('themeLight').classList.toggle('active', state.settings.theme==='light');
  document.getElementById('themeDark').classList.toggle('active', state.settings.theme==='dark');
  document.getElementById('currencySelect').value = state.settings.currency;
  if (state.settings.monthlyIncome) document.getElementById('incomeInput').value = state.settings.monthlyIncome;
  renderCatManageList();
}

function setPeriod(p, el) {
  state.analyticsPeriod=p;
  document.querySelectorAll('#page-analytics .pill').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderAnalytics();
}

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
function init() {
  loadState();
  document.documentElement.setAttribute('data-theme', state.settings.theme);
  document.querySelectorAll('.currency-symbol').forEach(el=>el.textContent=state.settings.currency);
  document.getElementById('txDate').value = today();
  document.getElementById('sidebarMonth').textContent = monthName(new Date());
  populateCatSelect('txCat', false);
  populateCatSelect('budgetCat', false);
  updateCatFilter();
  renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);
