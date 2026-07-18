'use strict';

/* ═══════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════ */
let state = {
  transactions: [],
  budgets: {},
  goals: [],
  savings: {
    accounts: [],       // [{ id, name, balance, color, target, note }]
    transactions: []    // [{ id, accountId, type:'deposit'|'withdrawal'|'interest', amt, date, desc }]
  },
  categories: [
    { name:'Wonen',          emoji:'🏠', color:'#8B7FF7', deletable:false },
    { name:'Boodschappen',   emoji:'🛒', color:'#2FCB8B', deletable:false },
    { name:'Transport',      emoji:'🚌', color:'#E9A83C', deletable:false },
    { name:'Eten & Drinken', emoji:'🍽', color:'#FF6A4D', deletable:false },
    { name:'Gezondheid',     emoji:'💊', color:'#8B7FF7', deletable:false },
    { name:'Vrije tijd',     emoji:'🎮', color:'#E87BC7', deletable:false },
    { name:'Abonnementen',   emoji:'📱', color:'#FFA36B', deletable:false },
    { name:'Kleding',        emoji:'👕', color:'#5FD3E8', deletable:false },
    { name:'Sparen',         emoji:'💰', color:'#7BE0B0', deletable:false },
    { name:'Overig',         emoji:'📦', color:'#8B84AC', deletable:false },
  ],
  settings: { currency:'€', theme:'dark', monthlyIncome:0, cycleStartDay:1,
              checkingName:'', openingBalance:null, openingDate:'', keepTarget:0,
              budgetRhythm:'day', loggedThrough:'' },
  recurring: [],        // [{ id, type, desc, amt, day, cat }]
  adventure: {
    xp: 0,                    // totale ervaring, bepaalt level 1-100
    pathPosition: 0,          // huidige halte op het pad
    pathSteps: 0,             // geslaagde missies binnen de huidige halte
    cityLevel: 0,             // stad groeit, krimpt NOOIT
    unlockedBadges: [],
    currentMission: null,     // { id, weekStart, weekEnd, config }
    missionHistory: [],       // [{ id, week, success, xpChange }]
    lastCycleReport: null,    // datum van laatste cyclusrapport
    stats: { missionsCompleted: 0, missionsFailed: 0, streak: 0, bestStreak: 0 }
  },
  lastRecurringMonth: '',  // 'YYYY-MM' of last applied month
  firstVisit: true,
  filters: { type:'all', cat:'all', sort:'date-desc', search:'' },
  analyticsPeriod: 'month',
  selectedGoalColor: '#8B7FF7'
};

let charts = {};

// CSV state
let csvParsed = { headers:[], rows:[], mapping:{}, finalRows:[] };
let csvStep = 1;
let selectedBank = 'auto';

const GOAL_COLORS = ['#8B7FF7','#2FCB8B','#E9A83C','#FF6A4D','#8B7FF7','#E87BC7','#FFA36B','#5FD3E8'];
const SAVINGS_COLORS = ['#2FCB8B','#8B7FF7','#E9A83C','#E87BC7','#8B7FF7','#5FD3E8','#FFA36B','#FF6A4D'];

/* ═══════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════ */
const fmt = n => state.settings.currency + Math.abs(Math.round(n * 100) / 100).toLocaleString('nl-NL', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtSigned = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
/* Tijdzone-veilige datumfunctie: gebruikt ALTIJD de lokale datum,
   nooit UTC. toISOString() converteert naar UTC, wat in Nederland/België
   (UTC+1 of UTC+2) ervoor zorgt dat datums rond middernacht naar de
   verkeerde dag verschuiven. Dit was de oorzaak van de mei/juni-bug. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const getDayOfMonth = () => new Date().getDate();
const getDaysInMonth = () => new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
const monthName = d => d.toLocaleDateString('nl-NL', { month:'long', year:'numeric' });

/* ── Budgetcyclus: aangepaste periode i.p.v. kalendermaand ──
   cycleStartDay = 1 betekent gewone kalendermaand.
   cycleStartDay = 25 betekent: periode loopt van de 25e t/m de 24e volgende maand. */
function getCycleStartDay() { return state.settings.cycleStartDay || 1; }

function getCurrentCycleRange() {
  const startDay = getCycleStartDay();
  const now = new Date();
  let cycleStart;
  if (now.getDate() >= startDay) {
    cycleStart = new Date(now.getFullYear(), now.getMonth(), startDay);
  } else {
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, startDay);
  }
  const cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, startDay - 1);
  return { start: cycleStart, end: cycleEnd };
}

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getCycleDayProgress() {
  const { start } = getCurrentCycleRange();
  const now = new Date();
  const diffMs = now - start;
  return Math.floor(diffMs / (1000*60*60*24)) + 1; // day 1 = start day
}

function getCycleTotalDays() {
  const { start, end } = getCurrentCycleRange();
  const diffMs = end - start;
  return Math.round(diffMs / (1000*60*60*24)) + 1;
}

function cycleLabel() {
  const startDay = getCycleStartDay();
  const { start, end } = getCurrentCycleRange();
  if (startDay === 1) return monthName(start);
  const fmt = (d) => d.toLocaleDateString('nl-NL', { day:'numeric', month:'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function getCycleRangeFor(refDate) {
  const startDay = getCycleStartDay();
  let cycleStart;
  if (refDate.getDate() >= startDay) {
    cycleStart = new Date(refDate.getFullYear(), refDate.getMonth(), startDay);
  } else {
    cycleStart = new Date(refDate.getFullYear(), refDate.getMonth() - 1, startDay);
  }
  const cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, startDay - 1);
  return { start: cycleStart, end: cycleEnd };
}

/* ── Centrale helper: bouw de laatste N budgetcycli, nieuwste laatst ──
   Gebruikt overal waar voorheen kalendermaanden werden opgebouwd
   (Cashflow-grafiek, Analytics, Categorie-trends, etc). Elke cyclus
   krijgt zijn eigen 'match'-functie (tijdzone-veilige stringvergelijking,
   géén Date-objecten, dus geen risico op de eerdere UTC-verschuivingsbug)
   en een leesbaar label gebaseerd op de startdag van de cyclus. */
function getLastNCycles(n) {
  const startDay = getCycleStartDay();
  const { start: currentCycleStart } = getCurrentCycleRange();
  const cycles = [];

  for (let i = n - 1; i >= 0; i--) {
    const cycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() - i, startDay);
    const cycleEnd   = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, startDay - 1);
    const startStr = dateToStr(cycleStart);
    const endStr   = dateToStr(cycleEnd);

    // Label toont de maand waar de cyclus het MEEST in valt (gebaseerd op het einde),
    // niet de maand waarin hij toevallig begint. Een cyclus van 25 april t/m 24 mei
    // bevat 6 dagen april en 24 dagen mei, en hoort dus "mei" te heten — niet "apr".
    const label = cycleEnd.toLocaleDateString('nl-NL', { month:'short' });

    cycles.push({
      start: cycleStart,
      end: cycleEnd,
      match: t => t.date >= startStr && t.date <= endStr,
      label,
      fullLabel: startDay === 1
        ? cycleStart.toLocaleDateString('nl-NL', { month:'long', year:'numeric' })
        : `${cycleStart.toLocaleDateString('nl-NL',{day:'numeric',month:'short'})} – ${cycleEnd.toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}`
    });
  }
  return cycles;
}
const catColor = name => (state.categories.find(c=>c.name===name)||{color:'#8B84AC'}).color;
const catEmoji = name => (state.categories.find(c=>c.name===name)||{emoji:'📦'}).emoji;

/* ═══════════════════════════════════════════════
   PERSISTENCE
   ═══════════════════════════════════════════════ */
function saveState(skipSync) {
  try { localStorage.setItem('budgetflow_v4', JSON.stringify(state)); } catch(e) {}
  if (!skipSync) autoSync();
}
function loadState() {
  loadGsConfig();
  try {
    const raw = localStorage.getItem('budgetflow_v4');
    if (!raw) {
      // Migrate from v3
      const old = localStorage.getItem('budgetflow_v3');
      if (old) {
        const s = JSON.parse(old);
        state.transactions = s.transactions || [];
        state.budgets = s.budgets || {};
        state.goals = s.goals || [];
        state.settings = { ...state.settings, ...(s.settings||{}) };
        if (s.categories && s.categories.length) state.categories = s.categories;
      }
      return;
    }
    const saved = JSON.parse(raw);
    if (saved.categories && saved.categories.length) state.categories = saved.categories;
    state = { ...state, ...saved, categories: state.categories };
    if (!state.savings) state.savings = { accounts:[], transactions:[] };
  } catch(e) {}
}

/* ═══════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════ */
const PAGE_TITLES = {
  dashboard:'Dashboard', transactions:'Transacties', analytics:'Analytics',
  budget:'Budgetten', goals:'Doelen', savings:'Spaarrekening', settings:'Instellingen'
, achievements: 'Avontuur' };

function navigate(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(el=>el.classList.add('active'));
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page]||page;
  if (typeof renderHUD === 'function') renderHUD();
  if (typeof renderPlayer === 'function') renderPlayer();
  // Show/hide topbar action button based on page
  const actionBtn = document.getElementById('topbarAction');
  if (actionBtn) {
    const showAction = ['dashboard','transactions'].includes(page);
    actionBtn.style.display = showAction ? '' : 'none';
    actionBtn.onclick = page === 'transactions'
      ? () => openModal('addTransaction')
      : () => openModal('addTransaction');
  }
  if (window.innerWidth <= 900) closeSidebar();
  if (page==='dashboard')    renderDashboard();
  if (page==='transactions') { resetTxFilters(); renderTransactions(); }
  if (page==='analytics')    renderAnalytics();
  if (page==='budget')       renderBudgets();
  if (page==='goals')        renderGoals();
  if (page==='savings')      renderSavings();
  if (page==='settings')     renderSettings();
  if (page==='recurring')    renderRecurring();
  if (page==='achievements' && typeof renderAdventure === 'function') renderAdventure();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function closeSidebar()   { document.getElementById('sidebar').classList.remove('open'); }

/* ═══════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════ */
function openModal(id) {
  document.getElementById('modalBackdrop').classList.add('open');
  document.getElementById('modal-'+id).classList.add('open');
  if (id==='addTransaction' && !editingTxId) {
    _autoCatUserChanged = false; // reset auto-categorisatie flag
    document.getElementById('txDate').value = today();
    populateCatSelect('txCat');
    document.querySelector('#modal-addTransaction .modal-title').textContent = 'Transactie toevoegen';
    document.querySelector('#modal-addTransaction .btn-primary').textContent = 'Opslaan';
    setTimeout(()=>document.getElementById('txDesc').focus(), 50);
  }
  if (id==='addBudget') populateCatSelect('budgetCat');
  if (id==='addGoal') {
    renderGoalColorPicker();
    const d=new Date(); d.setFullYear(d.getFullYear()+1);
    document.getElementById('goalDate').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  if (id==='importCSV') resetCSVModal();
  if (id==='addSavingsAccount') {
    document.getElementById('savAccName').value = '';
    document.getElementById('savAccBalance').value = '';
    document.getElementById('savAccTarget').value = '';
    document.getElementById('savAccNote').value = '';
    renderSavingsColorPicker();
  }
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m=>m.classList.remove('open'));
  editingTxId = null;
  document.querySelector('#modal-addTransaction .modal-title').textContent = 'Transactie toevoegen';
  document.querySelector('#modal-addTransaction .btn-primary').textContent = 'Opslaan';
}

function populateCatSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = state.categories.map(c=>`<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
}

/* ═══════════════════════════════════════════════
   TRANSACTION FORM
   ═══════════════════════════════════════════════ */
let currentTxType = 'income';
let editingTxId = null;

function setTxType(type) {
  currentTxType = type;
  ['income','expense','transfer'].forEach(t => {
    const btn = document.getElementById('typeBtn'+t.charAt(0).toUpperCase()+t.slice(1));
    if (btn) btn.classList.toggle('active', t===type);
  });
  document.getElementById('catGroupWrap').style.display = type==='expense' ? '' : 'none';
  document.getElementById('transferAccountsWrap').style.display = type==='transfer' ? '' : 'none';
}

function editTx(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  editingTxId = id;

  // Pre-fill the form
  setTxType(tx.type);
  document.getElementById('txDesc').value = tx.desc;
  document.getElementById('txAmount').value = tx.amt;
  // Zorg dat de datum altijd in YYYY-MM-DD formaat staat voor het datumveld
  // tx.date kan opgeslagen zijn als "2026-05-28" of als timestamp "2026-05-28T22:00:00.000Z"
  let txDateStr = tx.date || '';
  if (txDateStr.includes('T')) {
    // ISO timestamp — haal lokale datum eruit zonder tijdzone-verschuiving
    const d = new Date(txDateStr);
    txDateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  // Als het nog steeds geen YYYY-MM-DD is, probeer te parsen
  if (txDateStr && !/^\d{4}-\d{2}-\d{2}$/.test(txDateStr)) {
    const parsed = new Date(txDateStr);
    if (!isNaN(parsed)) {
      txDateStr = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
    } else {
      txDateStr = today(); // fallback naar vandaag als datum onparseerbaar is
    }
  }
  document.getElementById('txDate').value = txDateStr;
  // Repareer ook de opgeslagen datum als die een tijdstempel bevat
  if (tx.date && tx.date.includes('T')) { tx.date = txDateStr; }
  document.getElementById('txNote').value = tx.note || '';
  populateCatSelect('txCat');
  if (tx.type === 'expense') document.getElementById('txCat').value = tx.cat;
  if (tx.type === 'transfer') {
    document.getElementById('txFromAccount').value = tx.fromAccount || '';
    document.getElementById('txToAccount').value = tx.toAccount || '';
  }

  document.querySelector('#modal-addTransaction .modal-title').textContent = 'Transactie bewerken';
  document.querySelector('#modal-addTransaction .btn-primary').textContent = 'Wijzigingen opslaan';

  document.getElementById('modalBackdrop').classList.add('open');
  document.getElementById('modal-addTransaction').classList.add('open');
  setTimeout(()=>document.getElementById('txDesc').focus(), 50);
}

/* ═══════════════════════════════════════════════
   AUTO-CATEGORISATIE
   Leert van je transactiegeschiedenis: als je "Albert Heijn"
   eerder als Boodschappen categoriseerde, stelt de app dat
   automatisch voor bij een volgende invoer.
   ═══════════════════════════════════════════════ */

function suggestCategory(desc) {
  if (!desc || desc.length < 2) return null;
  const q = desc.toLowerCase().trim();

  // Zoek exacte of gedeeltelijke matches in eerdere uitgaven
  const matches = state.transactions
    .filter(t => t.type === 'expense' && t.cat)
    .filter(t => {
      const d = t.desc.toLowerCase();
      return d === q || d.includes(q) || q.includes(d);
    });

  if (!matches.length) return null;

  // Tel welke categorie het vaakst voorkomt voor deze omschrijving
  const counts = {};
  matches.forEach(t => { counts[t.cat] = (counts[t.cat] || 0) + 1; });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

let _autoCatUserChanged = false;

function initAutoCategory() {
  const descEl = document.getElementById('txDesc');
  const catEl  = document.getElementById('txCat');
  if (!descEl || !catEl) return;

  // Als gebruiker zelf categorie wijzigt, niet meer overschrijven
  catEl.addEventListener('change', () => { _autoCatUserChanged = true; });

  descEl.addEventListener('input', () => {
    if (_autoCatUserChanged || currentTxType !== 'expense') return;
    const suggestion = suggestCategory(descEl.value);
    if (suggestion && [...catEl.options].some(o => o.value === suggestion)) {
      catEl.value = suggestion;
      catEl.style.transition = 'border-color 0.3s';
      catEl.style.borderColor = 'var(--green)';
      setTimeout(() => { catEl.style.borderColor = ''; }, 800);
    }
  });
}

function saveTx() {
  const desc = document.getElementById('txDesc').value.trim();
  const amt  = parseFloat(document.getElementById('txAmount').value);
  const date = document.getElementById('txDate').value || today();
  const note = document.getElementById('txNote').value.trim();
  if (!desc || isNaN(amt) || amt <= 0) { document.getElementById('txDesc').focus(); return; }
  let cat = currentTxType==='income' ? 'Inkomst' : currentTxType==='transfer' ? 'Transfer' : document.getElementById('txCat').value;
  const fromAccount = currentTxType==='transfer' ? document.getElementById('txFromAccount').value.trim() : '';
  const toAccount   = currentTxType==='transfer' ? document.getElementById('txToAccount').value.trim() : '';

  if (editingTxId) {
    // Update existing transaction in place
    const tx = state.transactions.find(t => t.id === editingTxId);
    if (tx) {
      tx.type = currentTxType;
      tx.desc = desc;
      tx.amt = amt;
      tx.date = date;
      tx.note = note;
      tx.cat = cat;
      tx.fromAccount = fromAccount;
      tx.toAccount = toAccount;
    }
    showToast('Transactie bijgewerkt', 'success');
  } else {
    state.transactions.push({ id:Date.now(), type:currentTxType, desc, amt, date, cat, note, fromAccount, toAccount });
  }

  /* Je logt nu, dus je bent bij tot vandaag. Dat sluit het gat
     zonder dat je er apart op hoeft te klikken. */
  state.settings.loggedThrough = today();

  saveState();
  closeModal();
  renderDashboard();
  renderTransactions();
  updateCatFilter();
}

function deleteTx(id) {
  state.transactions = state.transactions.filter(t=>t.id!==id);
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
  if (state.categories.find(c=>c.name.toLowerCase()===name.toLowerCase())) { alert('Categorie bestaat al.'); return; }
  state.categories.push({ name, emoji, color, deletable:true });
  document.getElementById('newCatName').value = '';
  document.getElementById('newCatEmoji').value = '';
  saveState();
  renderCatManageList();
  populateCatSelect('txCat');
  updateCatFilter();
}

function deleteCategory(name) {
  const inUse = state.transactions.some(t=>t.cat===name);
  if (inUse && !confirm(`"${name}" wordt gebruikt. Toch verwijderen?`)) return;
  state.categories = state.categories.filter(c=>c.name!==name);
  if (inUse) state.transactions.forEach(t=>{ if(t.cat===name) t.cat='Overig'; });
  saveState();
  renderCatManageList();
  renderDashboard();
}

function renderCatManageList() {
  const el = document.getElementById('catManageList');
  if (!el) return;
  el.innerHTML = state.categories.map(c=>`
    <div class="cat-manage-row">
      <span class="cat-manage-dot" style="background:${c.color}"></span>
      <span class="cat-manage-emoji">${c.emoji}</span>
      <span class="cat-manage-name">${c.name}</span>
      <button class="cat-manage-edit" onclick="openEditCategory('${c.name}')" title="Bewerken">✎</button>
      <button class="cat-manage-del" onclick="deleteCategory('${c.name}')" ${!c.deletable?'disabled title="Standaard"':''}>×</button>
    </div>`).join('');
}

let editingCatName = null;

function openEditCategory(name) {
  const cat = state.categories.find(c => c.name === name);
  if (!cat) return;
  editingCatName = name;
  document.getElementById('editCatName').value = cat.name;
  document.getElementById('editCatEmoji').value = cat.emoji;
  document.getElementById('editCatColor').value = cat.color;
  document.getElementById('modalBackdrop').classList.add('open');
  document.getElementById('modal-editCategory').classList.add('open');
  setTimeout(() => document.getElementById('editCatName').focus(), 50);
}

function saveEditCategory() {
  const cat = state.categories.find(c => c.name === editingCatName);
  if (!cat) return;
  const newName  = document.getElementById('editCatName').value.trim();
  const newEmoji = document.getElementById('editCatEmoji').value.trim() || cat.emoji;
  const newColor = document.getElementById('editCatColor').value;
  if (!newName) return;

  // If name changed, update all transactions that use the old name
  if (newName !== editingCatName) {
    if (state.categories.find(c => c.name.toLowerCase() === newName.toLowerCase() && c.name !== editingCatName)) {
      alert('Die naam bestaat al.'); return;
    }
    state.transactions.forEach(t => { if (t.cat === editingCatName) t.cat = newName; });
    state.budgets[newName] = state.budgets[editingCatName];
    delete state.budgets[editingCatName];
  }

  cat.name  = newName;
  cat.emoji = newEmoji;
  cat.color = newColor;

  saveState();
  closeModal();
  renderCatManageList();
  populateCatSelect('txCat');
  populateCatSelect('budgetCat');
  updateCatFilter();
  renderDashboard();
}

/* ═══════════════════════════════════════════════
   FILTERS
   ═══════════════════════════════════════════════ */
function resetTxFilters() {
  state.filters = { type:'all', cat:'all', sort:'date-desc', search:'' };
  // Reset pill UI for type filter
  document.querySelectorAll('#page-transactions .filter-bar [data-filter="type"]').forEach((p,i) => {
    p.classList.toggle('active', p.dataset.value === 'all');
  });
  const search = document.getElementById('txSearch');
  if (search) search.value = '';
  const sortSel = document.getElementById('sortFilter');
  if (sortSel) sortSel.value = 'date-desc';
}

function setFilter(key, val, el) {
  state.filters[key] = val;
  if (el) {
    const g = el.closest('.pill-group');
    if (g) g.querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));
    el.classList.add('active');
  }
  renderTransactions();
}

function getFilteredTx() {
  let tx = [...state.transactions];
  if (state.filters.type!=='all')  tx = tx.filter(t=>t.type===state.filters.type);
  if (state.filters.cat!=='all')   tx = tx.filter(t=>t.cat===state.filters.cat);
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    tx = tx.filter(t=>t.desc.toLowerCase().includes(q)||t.cat.toLowerCase().includes(q));
  }
  switch(state.filters.sort) {
    case 'date-asc':  tx.sort((a,b)=>a.date.localeCompare(b.date)); break;
    case 'date-desc': tx.sort((a,b)=>b.date.localeCompare(a.date)); break;
    case 'amt-desc':  tx.sort((a,b)=>b.amt-a.amt); break;
    case 'amt-asc':   tx.sort((a,b)=>a.amt-b.amt); break;
  }
  return tx;
}

function updateCatFilter() {
  const sel = document.getElementById('catFilter');
  if (!sel) return;
  const cats = [...new Set(state.transactions.map(t=>t.cat))].sort();
  sel.innerHTML = '<option value="all">Alle categorieën</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  // Houd de huidige filterselectie zichtbaar in de dropdown
  sel.value = state.filters.cat;
}

/* ═══════════════════════════════════════════════
   BUDGET
   ═══════════════════════════════════════════════ */
function saveBudget() {
  const cat   = document.getElementById('budgetCat').value;
  const limit = parseFloat(document.getElementById('budgetLimit').value);
  if (!cat||isNaN(limit)||limit<=0) return;
  state.budgets[cat] = limit;
  saveState(); closeModal(); renderBudgets();
}
function deleteBudget(cat) { delete state.budgets[cat]; saveState(); renderBudgets(); }

/* ═══════════════════════════════════════════════
   GOALS
   ═══════════════════════════════════════════════ */
function renderGoalColorPicker() {
  document.getElementById('goalColorPicker').innerHTML = GOAL_COLORS.map(c=>
    `<div class="color-swatch${c===state.selectedGoalColor?' selected':''}" style="background:${c}" onclick="selectGoalColor('${c}',this)"></div>`
  ).join('');
}
function selectGoalColor(color, el) {
  state.selectedGoalColor = color;
  document.querySelectorAll('#goalColorPicker .color-swatch').forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected');
}
function saveGoal() {
  const name   = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  const saved  = parseFloat(document.getElementById('goalSaved').value)||0;
  const date   = document.getElementById('goalDate').value;
  if (!name||isNaN(target)||target<=0) return;
  state.goals.push({ id:Date.now(), name, target, saved, date, color:state.selectedGoalColor });
  saveState(); closeModal(); renderGoals();
}
function deleteGoal(id) { state.goals=state.goals.filter(g=>g.id!==id); saveState(); renderGoals(); }

/* ═══════════════════════════════════════════════
   SAVINGS ACCOUNTS
   ═══════════════════════════════════════════════ */
let selectedSavingsColor = '#2FCB8B';

function renderSavingsColorPicker() {
  const wrap = document.getElementById('savAccColorPicker');
  if (!wrap) return;
  wrap.innerHTML = SAVINGS_COLORS.map(c=>
    `<div class="color-swatch${c===selectedSavingsColor?' selected':''}" style="background:${c}" onclick="selectSavingsColor('${c}',this)"></div>`
  ).join('');
}

function selectSavingsColor(color, el) {
  selectedSavingsColor = color;
  document.querySelectorAll('#savAccColorPicker .color-swatch').forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected');
}

function saveSavingsAccount() {
  const name    = document.getElementById('savAccName').value.trim();
  const balance = parseFloat(document.getElementById('savAccBalance').value)||0;
  const target  = parseFloat(document.getElementById('savAccTarget').value)||0;
  const note    = document.getElementById('savAccNote').value.trim();
  if (!name) { document.getElementById('savAccName').focus(); return; }
  state.savings.accounts.push({ id:Date.now(), name, balance, target, color:selectedSavingsColor, note });
  saveState(); closeModal(); renderSavings();
}

function deleteSavingsAccount(id) {
  if (!confirm('Rekening en alle bijbehorende mutaties verwijderen?')) return;
  state.savings.accounts = state.savings.accounts.filter(a=>a.id!==id);
  state.savings.transactions = state.savings.transactions.filter(t=>t.accountId!==id);
  saveState(); renderSavings();
}

function openSavingsTxModal(accountId) {
  document.getElementById('savTxAccountId').value = accountId;
  document.getElementById('savTxDate').value = today();
  document.getElementById('savTxDesc').value = '';
  document.getElementById('savTxAmt').value = '';
  setSavTxType('deposit');
  openModal('addSavingsTx');
}

let currentSavTxType = 'deposit';
function setSavTxType(type) {
  currentSavTxType = type;
  ['deposit','withdrawal','interest'].forEach(t=>{
    const btn = document.getElementById('savTxBtn_'+t);
    if (btn) btn.classList.toggle('active', t===type);
  });
}

function saveSavingsTx() {
  const accountId = parseInt(document.getElementById('savTxAccountId').value);
  const amt  = parseFloat(document.getElementById('savTxAmt').value);
  const date = document.getElementById('savTxDate').value||today();
  const desc = document.getElementById('savTxDesc').value.trim()||
    (currentSavTxType==='deposit'?'Storting':currentSavTxType==='withdrawal'?'Opname':'Rente');
  if (isNaN(amt)||amt<=0) { document.getElementById('savTxAmt').focus(); return; }

  const account = state.savings.accounts.find(a=>a.id===accountId);
  if (!account) return;
  if (currentSavTxType==='deposit'||currentSavTxType==='interest') account.balance += amt;
  else account.balance = Math.max(0, account.balance - amt);

  state.savings.transactions.push({ id:Date.now(), accountId, type:currentSavTxType, amt, date, desc });
  saveState(); closeModal(); renderSavings();
}

function renderSavings() {
  const accs = state.savings.accounts;
  const grid = document.getElementById('savingsAccountGrid');
  const txList = document.getElementById('savingsTxList');
  const totalEl = document.getElementById('savingsTotalBalance');
  const totalTarget = document.getElementById('savingsTotalTarget');
  const totalPct = document.getElementById('savingsTotalPct');

  const totalBal = accs.reduce((a,acc)=>a+acc.balance,0);
  const totalTgt = accs.reduce((a,acc)=>a+(acc.target||0),0);
  const overallPct = totalTgt>0 ? Math.min(100,Math.round((totalBal/totalTgt)*100)) : null;

  if (totalEl) totalEl.textContent = fmt(totalBal);
  if (totalTarget) totalTarget.textContent = totalTgt>0 ? 'van '+fmt(totalTgt)+' doel' : 'totaal spaarsaldo';

  // Zonder doelbedrag is een percentage betekenisloos — nodig dan uit
  // om er een te stellen i.p.v. een streepje te tonen.
  if (totalPct) {
    if (overallPct !== null) {
      totalPct.textContent = overallPct + '%';
      totalPct.style.fontSize = '';
      totalPct.style.color = '';
      const sub = totalPct.nextElementSibling;
      if (sub) sub.textContent = 'van totaal doelbedrag';
    } else {
      totalPct.textContent = 'Stel een doel';
      totalPct.style.fontSize = '15px';
      totalPct.style.color = 'var(--text3)';
      const sub = totalPct.nextElementSibling;
      if (sub) sub.textContent = 'geef je spaarpot een bestemming';
    }
  }

  // Render savings chart
  renderSavingsChart(accs);

  if (!accs.length) {
    grid.innerHTML = `<div class="empty-card">
      <div class="empty-icon">🏦</div>
      <div class="empty-title">Nog geen spaarrekeningen</div>
      <div class="empty-sub">Voeg je spaarrekeningen toe om je spaarsaldo bij te houden.</div>
      <button class="btn-primary" onclick="openModal('addSavingsAccount')">Rekening toevoegen</button>
    </div>`;
  } else {
    grid.innerHTML = accs.map(acc=>{
      const pct = acc.target>0 ? Math.min(100,Math.round((acc.balance/acc.target)*100)) : null;
      const { start: cStart, end: cEnd } = getCurrentCycleRange();
      const cStartStr = dateToStr(cStart), cEndStr = dateToStr(cEnd);
      const monthlyTxs = state.savings.transactions.filter(t=>t.accountId===acc.id&&t.date>=cStartStr&&t.date<=cEndStr);
      const monthNet = monthlyTxs.reduce((a,t)=>a+(t.type==='withdrawal'?-t.amt:t.amt),0);
      return `<div class="savings-acc-card" style="border-top:3px solid ${acc.color}">
        <div class="savings-acc-header">
          <div>
            <div class="savings-acc-name">${acc.name}</div>
            ${acc.note?`<div class="savings-acc-note">${acc.note}</div>`:''}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn-primary-sm" onclick="openSavingsTxModal(${acc.id})">+ Mutatie</button>
            <button class="budget-del-btn" onclick="deleteSavingsAccount(${acc.id})">×</button>
          </div>
        </div>
        <div class="savings-acc-balance" style="color:${acc.color}">${fmt(acc.balance)}</div>
        ${acc.target>0?`
          <div class="savings-acc-target">Doel: ${fmt(acc.target)}</div>
          <div class="budget-bar-track" style="margin:8px 0 4px">
            <div class="budget-bar-fill" style="width:${pct}%;background:${acc.color}"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2)">
            <span>${pct}% behaald</span>
            <span>${pct<100?fmt(acc.target-acc.balance)+' te gaan':'🎉 Doel behaald!'}</span>
          </div>`:''
        }
        <div class="savings-acc-month">
          <span>Deze maand:</span>
          <span style="color:${monthNet>=0?'var(--green)':'var(--red)'};font-weight:600">${monthNet===0?fmt(0):fmtSigned(monthNet)}</span>
        </div>
      </div>`;
    }).join('');
  }

  // Recent savings transactions
  const allTx = [...state.savings.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
  if (!txList) return;
  if (!allTx.length) {
    txList.innerHTML = '<div class="empty-state">Nog geen mutaties</div>';
  } else {
    txList.innerHTML = `
      <table class="tx-table">
        <thead><tr><th>Datum</th><th>Rekening</th><th>Omschrijving</th><th>Type</th><th class="right">Bedrag</th><th></th></tr></thead>
        <tbody>${allTx.map(t=>{
          const acc = state.savings.accounts.find(a=>a.id===t.accountId);
          const accName = acc?acc.name:'?';
          const accColor = acc?acc.color:'#8B84AC';
          const isPos = t.type!=='withdrawal';
          const typeLabel = t.type==='deposit'?'Storting':t.type==='withdrawal'?'Opname':'Rente';
          const typeColor = t.type==='deposit'?'var(--green)':t.type==='interest'?'var(--accent)':'var(--red)';
          return `<tr>
            <td class="tx-date-cell">${new Date(t.date).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'})}</td>
            <td><span class="tx-cat-badge"><span class="tx-cat-dot" style="background:${accColor}"></span>${accName}</span></td>
            <td>${t.desc}</td>
            <td><span class="tx-type-badge" style="background:${typeColor}22;color:${typeColor}">${typeLabel}</span></td>
            <td class="tx-amount-cell"><span class="tx-amount ${isPos?'income':'expense'}">${isPos?'+':'−'}${fmt(t.amt)}</span></td>
            <td><button class="tx-del-btn" onclick="deleteSavingsTx(${t.id})">×</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }
}

function deleteSavingsTx(id) {
  const tx = state.savings.transactions.find(t=>t.id===id);
  if (!tx) return;
  const acc = state.savings.accounts.find(a=>a.id===tx.accountId);
  if (acc) {
    if (tx.type==='deposit'||tx.type==='interest') acc.balance = Math.max(0,acc.balance-tx.amt);
    else acc.balance += tx.amt;
  }
  state.savings.transactions = state.savings.transactions.filter(t=>t.id!==id);
  saveState(); renderSavings();
}

function renderSavingsChart(accs) {
  const ctx = document.getElementById('savingsChart');
  if (!ctx) return;
  if (charts.savings) charts.savings.destroy();
  if (!accs.length) return;

  // Bouw saldo-verloop over de laatste 6 budgetcycli i.p.v. kalendermaanden
  const cycles = getLastNCycles(6);

  const { grid, text } = chartColors();

  // Total balance trend (simulated by adding up all deposits - withdrawals up to each cycle end)
  const datasets = accs.map(acc=>{
    const data = cycles.map(c=>{
      const endStr = dateToStr(c.end);
      const txsUpTo = state.savings.transactions.filter(t=>t.accountId===acc.id&&t.date<=endStr);
      const bal = txsUpTo.reduce((sum,t)=>sum+(t.type==='withdrawal'?-t.amt:t.amt),0);
      return Math.round(bal*100)/100;
    });
    return { label:acc.name, data, borderColor:acc.color, backgroundColor:acc.color+'22', tension:0.4, fill:true, pointRadius:4, pointBackgroundColor:acc.color };
  });

  charts.savings = new Chart(ctx.getContext('2d'),{
    type:'line',
    data:{ labels:cycles.map(c=>c.label), datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:accs.length>1, labels:{ color:text, font:{size:11}, boxWidth:10 } }, tooltip:{ callbacks:{ label:c=>c.dataset.label+': '+state.settings.currency+c.raw.toLocaleString('nl-NL') }}},
      scales:{
        x:{ grid:{display:false}, ticks:{color:text,font:{size:11}} },
        y:{ grid:{color:grid}, ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')} }
      }
    }
  });
}

/* ═══════════════════════════════════════════════
   CSV IMPORT — FIXED
   ═══════════════════════════════════════════════ */
const BANK_PRESETS = {
  ing:     { date:'Datum',              desc:'Naam / Omschrijving', amt:'Bedrag (EUR)', type:'Af Bij' },
  rabo:    { date:'Datum',              desc:'Omschrijving',         amt:'Bedrag',       type:'Debet/Credit' },
  abn:     { date:'Transactiedatum',    desc:'Omschrijving',         amt:'Bedrag',       type:'Mutatiecode' },
  sns:     { date:'Boekingsdatum',      desc:'Omschrijving',         amt:'Bedrag',       type:'Af/Bij' },
  generic: { date:'', desc:'', amt:'', type:'' },
  auto:    { date:'', desc:'', amt:'', type:'' },
};

function selectBank(bank, el) {
  selectedBank = bank;
  document.querySelectorAll('#modal-importCSV .pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
}

function resetCSVModal() {
  csvStep = 1;
  csvParsed = { headers:[], rows:[], mapping:{}, finalRows:[] };
  selectedBank = 'auto';
  document.getElementById('csvStep1').style.display = '';
  document.getElementById('csvStep2').style.display = 'none';
  document.getElementById('csvStep3').style.display = 'none';
  document.getElementById('csvNextBtn').style.display = 'none';
  const fi = document.getElementById('csvFileInput');
  if (fi) fi.value = '';
  // Reset bank pills
  document.querySelectorAll('#modal-importCSV .pill').forEach((p,i)=>p.classList.toggle('active',i===0));
  const dz = document.getElementById('csvDropzone');
  if (dz) {
    dz.ondragover = e=>{ e.preventDefault(); dz.classList.add('drag-over'); };
    dz.ondragleave = ()=>dz.classList.remove('drag-over');
    dz.ondrop = e=>{ e.preventDefault(); dz.classList.remove('drag-over'); if(e.dataTransfer.files[0]) handleCSVFile(e.dataTransfer.files[0]); };
  }
}

function handleCSVFile(file) {
  if (!file) return;
  // Try UTF-8 first, fall back to latin-1 (covers ISO-8859-1 bank exports)
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result);
  reader.onerror = () => {
    const r2 = new FileReader();
    r2.onload = e => parseCSV(e.target.result);
    r2.readAsText(file, 'ISO-8859-1');
  };
  reader.readAsText(file, 'UTF-8');
}

/* ── Proper CSV line parser (handles escaped quotes, all delimiters) ── */
function parseCSVLine(line, delim) {
  const result = [];
  let cur = '', inQuote = false, i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuote) {
      if (ch==='"' && line[i+1]==='"') { cur+='"'; i+=2; continue; } // escaped quote
      if (ch==='"') { inQuote=false; i++; continue; }
      cur += ch;
    } else {
      if (ch==='"') { inQuote=true; i++; continue; }
      if (ch===delim) { result.push(cur.trim()); cur=''; i++; continue; }
      cur += ch;
    }
    i++;
  }
  result.push(cur.trim());
  return result;
}

/* ── Detect delimiter by counting occurrences outside quotes ── */
function detectDelimiter(line) {
  const candidates = [';', ',', '\t', '|'];
  let best = ',', bestCount = 0;
  candidates.forEach(d => {
    let count = 0, inQ = false;
    for (const ch of line) {
      if (ch==='"') { inQ=!inQ; continue; }
      if (!inQ && ch===d) count++;
    }
    if (count > bestCount) { bestCount=count; best=d; }
  });
  return best;
}

/* ── Parse amount string robustly (handles 1.234,56 and 1,234.56 and -1.23) ── */
function parseAmount(raw) {
  if (!raw) return 0;
  // Strip currency symbols and whitespace
  let s = raw.replace(/[€$£\s]/g,'').trim();
  // Detect format: if both . and , present, the last one is decimal separator
  const lastDot   = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot > -1 && lastComma > -1) {
    if (lastComma > lastDot) {
      // Format: 1.234,56 → European
      s = s.replace(/\./g,'').replace(',','.');
    } else {
      // Format: 1,234.56 → Anglo
      s = s.replace(/,/g,'');
    }
  } else if (lastComma > -1) {
    // Only comma — treat as decimal if ≤2 digits follow it, else thousands
    const afterComma = s.slice(lastComma+1);
    if (afterComma.length <= 2) s = s.replace(',','.');
    else s = s.replace(',','');
  }
  return parseFloat(s) || 0;
}

function parseCSV(text) {
  // Strip BOM
  if (text.charCodeAt(0)===0xFEFF) text = text.slice(1);

  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l);
  if (!lines.length) { alert('Leeg bestand.'); return; }

  const delim = detectDelimiter(lines[0]);
  const headers = parseCSVLine(lines[0], delim);
  const rows = lines.slice(1)
    .map(l=>parseCSVLine(l,delim))
    .filter(r=>r.length>=2 && r.some(v=>v));

  csvParsed.headers = headers;
  csvParsed.rows    = rows;
  csvParsed.delim   = delim;

  document.getElementById('csvRowCount').textContent = rows.length;

  // Auto-map columns
  const preset = BANK_PRESETS[selectedBank]||{};
  const mapping = {};
  const KEYWORDS = {
    date: ['datum','date','boekdatum','transactiedatum','boekingsdatum','valuedate','booking date'],
    desc: ['omschrijving','naam','naam / omschrijving','description','mededelingen','name/omschrijving'],
    amt:  ['bedrag (eur)','bedrag','amount','mutatie','credit','debet'],
    type: ['af bij','af/bij','debet/credit','mutatiecode','bij/af','credit/debet','dc','type']
  };

  ['date','desc','amt','type'].forEach(f=>{
    if (preset[f] && headers.some(h=>h===preset[f])) { mapping[f]=preset[f]; return; }
    const found = headers.find(h=>KEYWORDS[f].some(k=>h.toLowerCase().trim()===k));
    if (found) { mapping[f]=found; return; }
    const partial = headers.find(h=>KEYWORDS[f].some(k=>h.toLowerCase().includes(k)));
    if (partial) mapping[f]=partial;
  });

  csvParsed.mapping = mapping;
  csvStep = 2;
  document.getElementById('csvStep1').style.display = 'none';
  document.getElementById('csvStep2').style.display = '';
  document.getElementById('csvNextBtn').style.display = '';
  document.getElementById('csvNextBtn').textContent = 'Voorbeeld bekijken →';
  renderCSVMapGrid();
  renderCSVRawPreview();
}

function renderCSVMapGrid() {
  const LABELS = { date:'Datum *', desc:'Omschrijving *', amt:'Bedrag *', type:'Type (Af/Bij)' };
  const options = ['— niet gebruiken —', ...csvParsed.headers];
  document.getElementById('csvMapGrid').innerHTML = ['date','desc','amt','type'].map(f=>`
    <div class="csv-map-row">
      <label class="csv-map-label">${LABELS[f]}</label>
      <select class="filter-select" id="csvMap_${f}" style="width:100%">
        ${options.map(o=>`<option value="${o}"${csvParsed.mapping[f]===o?' selected':''}>${o}</option>`).join('')}
      </select>
    </div>`).join('');
}

function renderCSVRawPreview() {
  const preview = csvParsed.rows.slice(0,5);
  document.getElementById('csvPreviewTable').innerHTML =
    `<thead><tr>${csvParsed.headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`+
    `<tbody>${preview.map(r=>`<tr>${csvParsed.headers.map((_,i)=>`<td>${r[i]||'—'}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function csvNext() {
  if (csvStep===2) {
    // Read mapping from dropdowns
    const IGNORE = '— niet gebruiken —';
    ['date','desc','amt','type'].forEach(f=>{
      const sel=document.getElementById('csvMap_'+f);
      csvParsed.mapping[f] = sel&&sel.value!==IGNORE ? sel.value : '';
    });
    if (!csvParsed.mapping.date||!csvParsed.mapping.desc||!csvParsed.mapping.amt) {
      alert('Koppel minimaal: Datum, Omschrijving en Bedrag.'); return;
    }
    buildFinalPreview();
    csvStep=3;
    document.getElementById('csvStep2').style.display='none';
    document.getElementById('csvStep3').style.display='';
    document.getElementById('csvNextBtn').textContent='✓ Importeren';
  } else if (csvStep===3) {
    doImport();
  }
}

function buildFinalPreview() {
  const { headers, rows, mapping } = csvParsed;
  const hi = k => mapping[k] ? headers.indexOf(mapping[k]) : -1;

  const parsed = rows.map((r,rowIdx)=>{
    const dateRaw = hi('date')>=0 ? r[hi('date')]||'' : '';
    const desc    = hi('desc')>=0 ? r[hi('desc')]||'' : '';
    const amtRaw  = hi('amt') >=0 ? r[hi('amt')] ||'0' : '0';
    const typeRaw = hi('type')>=0 ? r[hi('type')]||'' : '';

    // Parse amount — preserves sign for type detection
    const amtSigned = parseAmount(amtRaw);
    const amt = Math.abs(amtSigned);

    // Determine income/expense
    let type = 'expense';
    const tl = typeRaw.toLowerCase().trim();
    if      (tl==='bij'||tl==='credit'||tl==='c'||tl==='cr'||tl==='b') type='income';
    else if (tl==='af' ||tl==='debet' ||tl==='d'||tl==='db'||tl==='a') type='expense';
    else if (!mapping.type) {
      // Fallback: positive = income, negative = expense
      type = amtSigned>=0 ? 'income' : 'expense';
    }

    // Parse date — handles YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, YYYYMMDD, D-M-YYYY
    let date = today();
    const dClean = dateRaw.replace(/\//g,'-').replace(/\./g,'-').trim();
    if      (/^\d{4}-\d{2}-\d{2}$/.test(dClean)) { date=dClean; }
    else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(dClean)) { const p=dClean.split('-'); date=`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; }
    else if (/^\d{8}$/.test(dateRaw)) { date=`${dateRaw.slice(0,4)}-${dateRaw.slice(4,6)}-${dateRaw.slice(6,8)}`; }

    return { _rowIdx:rowIdx, date, desc, amt, type, cat:type==='income'?'Inkomst':'Overig' };
  }).filter(r=>r.amt>0 && r.desc.trim());

  csvParsed.finalRows = parsed;

  const inc = parsed.filter(r=>r.type==='income').reduce((a,r)=>a+r.amt,0);
  const exp = parsed.filter(r=>r.type==='expense').reduce((a,r)=>a+r.amt,0);
  const skipped = csvParsed.rows.length - parsed.length;

  document.getElementById('csvImportSummary').innerHTML = `
    <span class="csv-sum-item"><strong>${parsed.length}</strong> transacties</span>
    <span class="csv-sum-item">Inkomsten: <strong style="color:var(--green)">${fmt(inc)}</strong></span>
    <span class="csv-sum-item">Uitgaven: <strong style="color:var(--red)">${fmt(exp)}</strong></span>
    ${skipped>0?`<span class="csv-sum-item" style="color:var(--text3)">${skipped} rijen overgeslagen</span>`:''}`;

  document.getElementById('csvFinalTable').innerHTML =
    `<thead><tr><th>Datum</th><th>Omschrijving</th><th>Type</th><th>Bedrag</th><th>Categorie</th></tr></thead>`+
    `<tbody>${parsed.slice(0,100).map((r,i)=>`
      <tr>
        <td>${r.date}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.desc}">${r.desc}</td>
        <td><span class="tx-type-badge ${r.type}">${r.type==='income'?'Inkomst':'Uitgave'}</span></td>
        <td style="font-family:'Space Grotesk',sans-serif;font-weight:600;color:${r.type==='income'?'var(--green)':'var(--red)'}">${fmt(r.amt)}</td>
        <td>
          <select class="filter-select" style="font-size:11px;padding:3px 6px" onchange="csvParsed.finalRows[${i}].cat=this.value">
            ${state.categories.map(c=>`<option value="${c.name}"${r.cat===c.name?' selected':''}>${c.emoji} ${c.name}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('')}
    </tbody>`;
}

function doImport() {
  const rows = csvParsed.finalRows||[];
  if (!rows.length) { alert('Geen geldige transacties gevonden.'); return; }
  let count = 0;
  rows.forEach(r=>{
    state.transactions.push({ id:Date.now()+Math.random(), type:r.type, desc:r.desc, amt:r.amt, date:r.date, cat:r.cat, note:'', fromAccount:'', toAccount:'' });
    count++;
  });
  saveState(); closeModal(); updateCatFilter(); navigate('transactions');
  const toast=document.createElement('div');
  toast.textContent=`✓ ${count} transacties geïmporteerd`;
  Object.assign(toast.style,{position:'fixed',bottom:'24px',right:'24px',background:'var(--green)',color:'#fff',padding:'10px 18px',borderRadius:'8px',fontFamily:"'Space Grotesk',sans-serif",fontWeight:'600',fontSize:'13px',zIndex:'9999'});
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(),3000);
}

/* ═══════════════════════════════════════════════
   SETTINGS
   ═══════════════════════════════════════════════ */
function setTheme(theme) {
  state.settings.theme=theme;
  document.documentElement.setAttribute('data-theme',theme);
  document.getElementById('themeLight').classList.toggle('active',theme==='light');
  document.getElementById('themeDark').classList.toggle('active',theme==='dark');
  saveState();
  setTimeout(()=>{ Object.values(charts).forEach(c=>{if(c)c.destroy();}); charts={}; renderDashboard(); try{renderAnalytics();}catch(e){} try{renderSavings();}catch(e){} },50);
}
function setCurrency(sym) { state.settings.currency=sym; document.querySelectorAll('.currency-symbol').forEach(el=>el.textContent=sym); saveState(); renderDashboard(); }
function saveIncome() { const v=parseFloat(document.getElementById('incomeInput').value); if(v>0){state.settings.monthlyIncome=v;saveState();renderDashboard();} }


function saveOpeningBalance() {
  const bal  = parseFloat(document.getElementById('openingBalInput').value);
  const date = document.getElementById('openingDateInput').value;

  if (isNaN(bal))  { showToast('Vul een beginsaldo in.', 'warn'); return; }
  if (!date)       { showToast('Kies de datum waarop dat saldo gold.', 'warn'); return; }

  state.settings.openingBalance = bal;
  state.settings.openingDate    = date;
  saveState();
  renderSettings();
  renderDashboard();
  showToast('Beginsaldo opgeslagen. Je saldo wordt nu doorgerekend.', 'success');
}

function saveRhythm(r) {
  state.settings.budgetRhythm = r;
  saveState();
  renderSettings();
  renderDashboard();
  showToast(r === 'week'
    ? 'Weekbudget — werk één keer per week bij.'
    : 'Dagbudget — het scherpst als je dagelijks logt.', 'success');
}

function saveKeepTarget() {
  const v = parseFloat(document.getElementById('keepTargetInput').value);
  state.settings.keepTarget = isNaN(v) || v < 0 ? 0 : v;
  saveState();
  renderSettings();
  renderDashboard();
  showToast(state.settings.keepTarget > 0
    ? `${fmt(state.settings.keepTarget)} gereserveerd — telt niet mee in je dagbudget.`
    : 'Streefbedrag gewist.', 'success');
}

function saveCheckingName() {
  state.settings.checkingName = document.getElementById('checkingNameInput').value.trim();
  saveState();
  renderSettings();
  renderDashboard();
  showToast(state.settings.checkingName
    ? 'Betaalrekening ingesteld.'
    : 'Naam gewist — alle transfers gelden weer als uitgaand.', 'success');
}

/* Laat zien hoe de app aan het saldo komt, zodat het navolgbaar is */
function renderBankPreview() {
  const el = document.getElementById('bankPreview');
  if (!el) return;

  if (!hasBankSetup()) {
    el.innerHTML = `<div class="bank-preview-empty">
      Nog geen beginsaldo. Het speelbord toont daarom wat je deze cyclus
      <strong>overhield</strong> — niet wat er op je rekening staat.
    </div>`;
    return;
  }

  const s     = state.settings;
  const since = s.openingDate;
  const tx    = state.transactions.filter(t => t.date >= since);

  const inc  = tx.filter(t => t.type === 'income').reduce((a,t) => a + t.amt, 0);
  const exp  = tx.filter(t => t.type === 'expense').reduce((a,t) => a + t.amt, 0);
  const out  = tx.filter(t => t.type === 'transfer' && transferDirection(t) === 'out')
                 .reduce((a,t) => a + t.amt, 0);
  const inn  = tx.filter(t => t.type === 'transfer' && transferDirection(t) === 'in')
                 .reduce((a,t) => a + t.amt, 0);

  const saldo = computeBankBalance();
  const d = new Date(since + 'T12:00:00').toLocaleDateString('nl-NL',
              { day:'numeric', month:'long', year:'numeric' });

  el.innerHTML = `
    <div class="bank-preview-title">Zo komt de app aan je saldo</div>
    <div class="bank-row"><span>Beginsaldo op ${d}</span><span>${fmt(s.openingBalance)}</span></div>
    <div class="bank-row"><span>Inkomsten sindsdien</span><span class="pos">+${fmt(inc)}</span></div>
    <div class="bank-row"><span>Uitgaven sindsdien</span><span class="neg">−${fmt(exp)}</span></div>
    ${out ? `<div class="bank-row"><span>Weggeboekt (transfers eruit)</span><span class="neg">−${fmt(out)}</span></div>` : ''}
    ${inn ? `<div class="bank-row"><span>Binnengekomen (transfers erin)</span><span class="pos">+${fmt(inn)}</span></div>` : ''}
    <div class="bank-row total"><span>Op je betaalrekening</span><span>${saldo < 0 ? '−' : ''}${fmt(Math.abs(saldo))}</span></div>
  `;
}

function saveCycleStart() {
  const v = parseInt(document.getElementById('cycleStartInput').value);
  if (v >= 1 && v <= 28) {
    state.settings.cycleStartDay = v;
    saveState();
    renderDashboard();
    showToast(`Budgetcyclus ingesteld: start op dag ${v}`, 'success');
  } else {
    showToast('Kies een dag tussen 1 en 28', 'warn');
  }
}
function exportCSV() {
  const rows=[['Datum','Omschrijving','Categorie','Type','Bedrag','Van','Naar','Notitie']];
  [...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)).forEach(t=>rows.push([t.date,t.desc,t.cat,t.type,t.amt.toFixed(2),t.fromAccount||'',t.toAccount||'',t.note||'']));
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  a.download='budgetflow-export.csv'; a.click();
}
function clearAllData() {
  if(!confirm('Alles wissen inclusief spaarrekeningen?'))return;
  state.transactions=[]; state.budgets={}; state.goals=[]; state.savings={accounts:[],transactions:[]};
  saveState(); navigate('dashboard');
}

/* ═══════════════════════════════════════════════════════════
   HET BANKSALDO — een voorraad, geen stroom
   De app kende alleen bewegingen, geen vertrekpunt. Met een
   beginsaldo kan hij uitrekenen wat er écht op je rekening staat.

   Transfers zijn hier wél van belang: dat geld is niet uitgegeven,
   maar het is wel van je betaalrekening af.
   ═══════════════════════════════════════════════════════════ */
function hasBankSetup() {
  const s = state.settings;
  return s.openingBalance !== null && s.openingBalance !== undefined && !!s.openingDate;
}

/* Raakt deze transfer de betaalrekening, en in welke richting? */
function transferDirection(t) {
  const naam = (state.settings.checkingName || '').trim().toLowerCase();
  const from = (t.fromAccount || '').trim().toLowerCase();
  const to   = (t.toAccount   || '').trim().toLowerCase();

  // Geen rekeningnaam ingesteld? Dan is de aanname: transfers gaan de
  // betaalrekening uit. Dat is het gangbare patroon (sparen, beleggen).
  if (!naam) return 'out';

  const fromIsChecking = from.includes(naam);
  const toIsChecking   = to.includes(naam);

  if (fromIsChecking && !toIsChecking) return 'out';   // eraf
  if (toIsChecking && !fromIsChecking) return 'in';    // erbij
  return 'none';                                        // raakt de rekening niet
}


/* Wat stond er op je rekening aan het EIND van deze datum?
   Hiermee kunnen we de cycli aan elkaar knopen: het slotsaldo van
   de ene cyclus is het startsaldo van de volgende. */
function bankBalanceAt(dateStr) {
  if (!hasBankSetup()) return null;

  const s = state.settings;
  if (dateStr < s.openingDate) return null;   // vóór je ijkpunt weten we niets

  let saldo = Number(s.openingBalance) || 0;

  state.transactions
    .filter(t => t.date >= s.openingDate && t.date <= dateStr)
    .forEach(t => {
      if (t.type === 'income')  saldo += t.amt;
      if (t.type === 'expense') saldo -= t.amt;
      if (t.type === 'transfer') {
        const dir = transferDirection(t);
        if (dir === 'out') saldo -= t.amt;
        if (dir === 'in')  saldo += t.amt;
      }
    });

  return Math.round(saldo * 100) / 100;
}

function computeBankBalance() {
  if (!hasBankSetup()) return null;

  const s     = state.settings;
  const since = s.openingDate;
  let saldo   = Number(s.openingBalance) || 0;

  state.transactions
    .filter(t => t.date >= since)
    .forEach(t => {
      if (t.type === 'income')  saldo += t.amt;
      if (t.type === 'expense') saldo -= t.amt;
      if (t.type === 'transfer') {
        const dir = transferDirection(t);
        if (dir === 'out') saldo -= t.amt;
        if (dir === 'in')  saldo += t.amt;
      }
    });

  return Math.round(saldo * 100) / 100;
}

/* ═══════════════════════════════════════════════
   COMPUTE METRICS
   ═══════════════════════════════════════════════ */
function getCurrentMonthTx() {
  const { start, end } = getCurrentCycleRange();
  const startStr = dateToStr(start);
  const endStr = dateToStr(end);
  return state.transactions.filter(t => t.date >= startStr && t.date <= endStr);
}



/* ═══════════════════════════════════════════════════════════
   BIJGEWERKT TOT — het verschil tussen "niks uitgegeven"
   en "vergeten te loggen"

   Een lege dag ziet er in de data hetzelfde uit als een dag die je
   niet hebt bijgewerkt. De app kan dat niet weten, dus vraagt hij
   het. Pas als je bevestigt schuift 'loggedThrough' op, en pas dan
   mag het dagbudget die dagen als écht-niks-uitgegeven meetellen.
   ═══════════════════════════════════════════════════════════ */

/* Datums die via Google Sheets terugkomen kunnen een tijdstempel
   meekrijgen (2026-07-11T22:00:00.000Z). Alles wat een datum
   verwacht, knipt die er eerst af. Anders krijg je Invalid Date. */
function cleanDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;      // al goed

  if (s.includes('T')) {
    const datum = s.split('T')[0];
    const uur   = parseInt((s.match(/T(\d{2}):/) || [])[1] || '0', 10);

    /* 22:00 of 23:00 UTC is in Nederland al de VOLGENDE dag. Zomaar het
       datumdeel afknippen levert dan een dag te vroeg op — dezelfde val
       als bij de transacties. Dus schuif een dag op. */
    if (uur >= 22) {
      const d = new Date(datum + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    }
    return datum;
  }

  const d = new Date(s);
  return isNaN(d) ? '' : dateToStr(d);
}

function loggedThroughDate() {
  const s = cleanDate(state.settings.loggedThrough);
  if (s) return s;
  // Nooit bevestigd? Val terug op je laatste transactie.
  const laatste = state.transactions
    .map(t => cleanDate(t.date))
    .filter(Boolean)
    .sort()
    .pop();
  return laatste || today();
}

/* Hoeveel dagen liggen er tussen 'bijgewerkt tot' en gisteren? */
function loggingGap() {
  const door = loggedThroughDate();
  const nu   = today();
  if (!door || door >= nu) return null;

  const d1 = new Date(door + 'T12:00:00');
  const d2 = new Date(nu   + 'T12:00:00');
  if (isNaN(d1) || isNaN(d2)) return null;              // liever niks dan onzin

  const dagen = Math.round((d2 - d1) / 86400000) - 1;   // gisteren is de laatste
  if (!Number.isFinite(dagen) || dagen <= 0) return null;

  const van = new Date(d1); van.setDate(van.getDate() + 1);
  const tot = new Date(d2); tot.setDate(tot.getDate() - 1);

  // Is er in dat gat al iets geboekt? Dan heb je dus wél bijgewerkt.
  const vanStr = dateToStr(van), totStr = dateToStr(tot);
  const geboekt = state.transactions.filter(t => t.date >= vanStr && t.date <= totStr);

  return {
    dagen,
    van: vanStr,
    tot: totStr,
    geboekt: geboekt.length,
    bedrag: geboekt.filter(t => t.type === 'expense').reduce((a,t) => a + t.amt, 0),
  };
}

/* "Ja, ik gaf die dagen niks uit" — de app mag ze meetellen */
function confirmNoSpend() {
  const gap = loggingGap();
  state.settings.loggedThrough = today();
  saveState();
  renderDashboard();
  if (gap) {
    showToast(`${gap.dagen} ${gap.dagen === 1 ? 'dag' : 'dagen'} zonder uitgaven — je budget is bijgewerkt.`, 'success');
  }
}

/* "Nee, ik vul ze nog aan" — laat het gat staan, maar onthoud dat je het weet */
function dismissGap() {
  state.settings.loggedThrough = today();
  saveState();
  renderDashboard();
}

/* ═══════════════════════════════════════════════════════════
   HET DAGBUDGET — wat kun je vandaag uitgeven?

   Zelfcorrigerend: het rekent elke dag opnieuw met wat er nog is
   en hoeveel dagen er nog komen. Blijf je vandaag onder je bedrag,
   dan is er morgen méér over voor minder dagen — dus je dagbudget
   stijgt. Geef je te veel uit, dan krimpt het. Zo stuurt het zichzelf.

   Vaste lasten die nog moeten komen worden eerst gereserveerd, want
   die kun je niet opeten. En wil je aan het eind iets overhouden,
   dan wordt dat er ook afgehaald.
   ═══════════════════════════════════════════════════════════ */
function computeDailyAllowance() {
  const { start, end } = getCurrentCycleRange();
  const totalDays = getCycleTotalDays();
  const dayNow    = Math.max(1, Math.min(totalDays, getCycleDayProgress()));
  const daysLeft  = Math.max(1, totalDays - dayNow + 1);   // vandaag telt mee

  const weekly = state.settings.budgetRhythm === 'week';
  const todayStr0 = today();

  /* Het budget van deze periode moet berekend worden vanaf wat je bij het
     BEGIN ervan had — niet vanaf je saldo van dit moment. Anders krimpt je
     budget terwijl de periode loopt, en telt wat je al uitgaf dubbel mee. */

  // Grens van de huidige periode: vandaag, of het begin van deze week
  let periodStart = todayStr0;
  if (weekly) {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;             // ma = 0
    const ma  = new Date(now); ma.setDate(ma.getDate() - dow);
    const maStr = dateToStr(ma);
    const cycleStartStr = dateToStr(start);
    periodStart = maStr > cycleStartStr ? maStr : cycleStartStr;  // niet vóór de cyclus
  }

  const spentPeriod = state.transactions
    .filter(t => t.type === 'expense' && t.date >= periodStart && t.date <= todayStr0)
    .reduce((a, t) => a + t.amt, 0);

  const bank = computeBankBalance();
  const { income, expense } = computeMetrics();
  const nu  = bank !== null ? bank : (income - expense);
  const pot = nu + spentPeriod;      // saldo zoals het bij aanvang van de periode was

  // Vaste lasten die deze cyclus nog moeten komen — die zijn al vergeven
  let upcoming = 0;
  (state.recurring || []).filter(r => r.type === 'expense').forEach(r => {
    let d = new Date(start.getFullYear(), start.getMonth(), Math.min(r.day, 28));
    if (d < start) d = new Date(start.getFullYear(), start.getMonth() + 1, Math.min(r.day, 28));
    if (d > end) return;
    const ds = dateToStr(d);
    if (ds <= todayStr0) return;
    const alDeze = getCurrentMonthTx().some(t =>
      t.type === 'expense' && t.desc === r.desc && Math.abs(t.amt - r.amt) < 0.01);
    if (!alDeze) upcoming += r.amt;
  });

  const keep = Number(state.settings.keepTarget) || 0;
  const vrij = pot - upcoming - keep;

  // Hoeveel periodes resten er nog?
  const perioden = weekly ? Math.max(1, Math.ceil(daysLeft / 7)) : daysLeft;
  const perPeriode = vrij / perioden;

  return {
    weekly,
    perDag:      Math.round(perPeriode * 100) / 100,       // budget voor deze periode
    restVandaag: Math.round((perPeriode - spentPeriod) * 100) / 100,
    spentToday:  Math.round(spentPeriod * 100) / 100,
    daysLeft,
    perioden,
    upcoming:    Math.round(upcoming * 100) / 100,
    keep,
    pot:         Math.round(pot * 100) / 100,
    periodStart,
  };
}

function computeMetrics() {
  const tx=getCurrentMonthTx();
  const income  =tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const expense =tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const transfer=tx.filter(t=>t.type==='transfer').reduce((a,t)=>a+t.amt,0);
  const balance =income-expense;
  const cats={};
  tx.filter(t=>t.type==='expense').forEach(t=>{cats[t.cat]=(cats[t.cat]||0)+t.amt;});
  const dayProgress = Math.max(1, getCycleDayProgress());
  const totalDays = getCycleTotalDays();

  /* ── Slimme projectie ──
     Splits uitgaven in vaste lasten (die één keer per cyclus komen)
     en variabele uitgaven (die per dag doorgaan). De projectie is dan:
     al betaalde vaste lasten + nog verwachte vaste lasten (uit terugkerende
     transacties) + variabele burn-rate doorgetrokken naar het einde. */
  const fixedCatsSet = new Set(['Wonen','Abonnementen','Verzekeringen','Bankkosten','Lening']);
  const fixedSpent    = tx.filter(t=>t.type==='expense'&&fixedCatsSet.has(t.cat)).reduce((a,t)=>a+t.amt,0);
  const variableSpent = expense - fixedSpent;
  const variableDaily = variableSpent / dayProgress;

  // Verwachte nog-niet-betaalde terugkerende lasten binnen deze cyclus
  const { start: cycStart, end: cycEnd } = getCurrentCycleRange();
  const todayStr = today();
  let upcomingFixed = 0;
  (state.recurring||[]).filter(r=>r.type==='expense').forEach(r => {
    // Bepaal de datum van deze terugkerende transactie binnen de cyclus
    let recDate = new Date(cycStart.getFullYear(), cycStart.getMonth(), Math.min(r.day, 28));
    if (recDate < cycStart) recDate = new Date(cycStart.getFullYear(), cycStart.getMonth()+1, Math.min(r.day, 28));
    if (recDate > cycEnd) return; // valt buiten cyclus
    const recStr = dateToStr(recDate);
    if (recStr <= todayStr) return; // al geweest — zit in fixedSpent als hij is toegevoegd
    // Check of hij niet al handmatig is ingevoerd
    const alreadyIn = tx.some(t=>t.desc===r.desc&&t.amt===r.amt&&t.type==='expense');
    if (!alreadyIn) upcomingFixed += r.amt;
  });

  const burnDaily = expense / dayProgress;
  const projected = fixedSpent + upcomingFixed + (variableDaily * totalDays);
  let score=0; const breakdown=[];
  if(income>0){
    const sr=balance/income;
    let pts=sr>=0.3?35:sr>=0.2?25:sr>=0.1?15:sr>=0?5:0; score+=pts; breakdown.push({name:'Spaarquote',pts,max:35});
    const er=expense/income;
    pts=er<=0.6?25:er<=0.75?18:er<=0.9?10:3; score+=pts; breakdown.push({name:'Uitgavenratio',pts,max:25});
    const hp=(cats['Wonen']||0)/income;
    pts=hp<=0.3?20:hp<=0.4?14:hp<=0.5?7:0; score+=pts; breakdown.push({name:'Woonlasten',pts,max:20});
    const nc=Object.keys(cats).length;
    pts=nc>=4?20:nc>=2?12:nc>=1?6:0; score+=pts; breakdown.push({name:'Diversiteit',pts,max:20});
  }
  return{income,expense,transfer,balance,cats,burnDaily,projected,score:Math.min(100,score),breakdown};
}

/* ═══════════════════════════════════════════════
   GELDCOACH — slimme observaties & bespaartips
   Analyseert patronen in je uitgaven en geeft
   concrete, persoonlijke adviezen.
   ═══════════════════════════════════════════════ */
function generateCoachTips() {
  const tips = [];
  const cycles = getLastNCycles(3);
  const curr = cycles[cycles.length - 1];
  const prev = cycles[cycles.length - 2];

  const currTx = state.transactions.filter(t => curr.match(t));
  const prevTx = prev ? state.transactions.filter(t => prev.match(t)) : [];

  const income  = currTx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const expense = currTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const prevExp = prevTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);

  // Categorieën deze en vorige cyclus
  const cats = {}, prevCats = {};
  currTx.filter(t=>t.type==='expense').forEach(t=>{cats[t.cat]=(cats[t.cat]||0)+t.amt;});
  prevTx.filter(t=>t.type==='expense').forEach(t=>{prevCats[t.cat]=(prevCats[t.cat]||0)+t.amt;});

  // ── 1. Abonnementen-analyse ──
  const subs = currTx.filter(t=>t.type==='expense'&&t.cat==='Abonnementen');
  const subTotal = subs.reduce((a,t)=>a+t.amt,0);
  if (subs.length >= 4) {
    const yearly = subTotal * 12;
    tips.push({
      type: 'warn',
      icon: '📺',
      title: `${subs.length} abonnementen = ${fmt(subTotal)}/maand`,
      text: `Dat is <strong>${fmt(yearly)}</strong> per jaar. Loop ze eens langs — welke gebruik je echt nog? Eén opzeggen van ${fmt(subs[0].amt)}/mnd bespaart al ${fmt(subs[0].amt*12)}/jaar.`
    });
  }

  // ── 2. Grootste stijger t.o.v. vorige cyclus ──
  if (prevExp > 0) {
    const risers = Object.entries(cats)
      .map(([cat,amt])=>({cat,amt,prev:prevCats[cat]||0,diff:amt-(prevCats[cat]||0)}))
      .filter(r=>r.prev>0 && r.diff>0)
      .sort((a,b)=>b.diff-a.diff);
    if (risers.length && risers[0].diff > 20) {
      const r = risers[0];
      const pctUp = Math.round((r.diff/r.prev)*100);
      tips.push({
        type: 'alert',
        icon: '📈',
        title: `${r.cat} steeg met ${pctUp}%`,
        text: `Je gaf hier <strong>${fmt(r.diff)} meer</strong> uit dan vorige cyclus (${fmt(r.prev)} → ${fmt(r.amt)}). Bewuste keuze, of sluipt het erin?`
      });
    }
  }

  // ── 3. Uitgaven vs inkomen waarschuwing ──
  if (income > 0) {
    const ratio = expense / income;
    if (ratio > 0.9) {
      tips.push({
        type: 'alert',
        icon: '⚠️',
        title: 'Je geeft bijna alles uit',
        text: `Deze cyclus ging <strong>${Math.round(ratio*100)}%</strong> van je inkomen op. Probeer eerst ${fmt(income*0.1)} (10%) opzij te zetten zodra je salaris binnenkomt — betaal jezelf eerst.`
      });
    } else if (ratio < 0.6 && expense > 0) {
      tips.push({
        type: 'good',
        icon: '🎉',
        title: 'Sterke spaarcyclus!',
        text: `Je hield <strong>${fmt(income-expense)}</strong> over (${Math.round((1-ratio)*100)}%). Overweeg dit automatisch naar een spaarrekening te zetten zodat je het niet per ongeluk uitgeeft.`
      });
    }
  }

  // ── 4. Kleine frequente uitgaven (het "latte-effect") ──
  const smallFreq = currTx.filter(t=>t.type==='expense'&&t.amt<15);
  if (smallFreq.length >= 8) {
    const smallTotal = smallFreq.reduce((a,t)=>a+t.amt,0);
    tips.push({
      type: 'tip',
      icon: '☕',
      title: `${smallFreq.length} kleine uitgaven`,
      text: `Al die kleine bedragen onder €15 tellen op tot <strong>${fmt(smallTotal)}</strong> deze cyclus. Kleine lekken zinken grote schepen — het loont om hier bewust op te letten.`
    });
  }

  // ── 5. Vaste lasten aandeel ──
  const fixedCats = ['Wonen','Abonnementen','Verzekeringen','Bankkosten','Lening'];
  const fixed = currTx.filter(t=>t.type==='expense'&&fixedCats.includes(t.cat)).reduce((a,t)=>a+t.amt,0);
  if (income > 0 && fixed > 0) {
    const fixedPct = Math.round((fixed/income)*100);
    if (fixedPct > 55) {
      tips.push({
        type: 'warn',
        icon: '🏠',
        title: `Vaste lasten zijn ${fixedPct}% van je inkomen`,
        text: `Dat is aan de hoge kant — vuistregel is max 50%. Je hebt weinig ruimte voor sparen of onverwachte kosten. De grootste winst zit vaak in energie, verzekeringen of je abonnementen heronderhandelen.`
      });
    }
  }

  // ── 6. Terugkerende dubbele omschrijvingen (mogelijk dubbel abonnement) ──
  const descCounts = {};
  currTx.filter(t=>t.type==='expense').forEach(t=>{
    const key = t.desc.toLowerCase().trim();
    descCounts[key] = (descCounts[key]||0)+1;
  });
  const doubles = Object.entries(descCounts).filter(([k,c])=>c>1 && k.length>2);
  // (informatief, alleen als er echt iets opvalt — laten we streaming-achtige namen niet forceren)

  // ── 6b. Grootste daler — een compliment is ook sturing ──
  if (prevExp > 0) {
    const dalers = Object.entries(prevCats)
      .map(([cat, was]) => ({ cat, was, nu: cats[cat] || 0, diff: (cats[cat] || 0) - was }))
      .filter(d => d.was > 20 && d.diff < -15)
      .sort((a, b) => a.diff - b.diff);
    if (dalers.length) {
      const d = dalers[0];
      const pct = Math.round((Math.abs(d.diff) / d.was) * 100);
      tips.push({
        type: 'good',
        icon: '📉',
        title: `${d.cat} ging ${pct}% omlaag`,
        text: `Je gaf hier <strong>${fmt(Math.abs(d.diff))} minder</strong> uit dan vorige cyclus (${fmt(d.was)} → ${fmt(d.nu)}). Als je dit vasthoudt, scheelt dat <strong>${fmt(Math.abs(d.diff) * 12)}</strong> per jaar.`
      });
    }
  }

  // ── 6c. Loopt je uitgeven voor op de klok? ──
  if (income > 0 && expense > 0) {
    const totalDays = getCycleTotalDays();
    const dayNow    = Math.max(1, Math.min(totalDays, getCycleDayProgress()));
    const tijdPct   = (dayNow / totalDays) * 100;
    const geldPct   = (expense / income) * 100;

    if (geldPct - tijdPct > 15) {
      const perDagRest = (income - expense) / Math.max(1, totalDays - dayNow);
      tips.push({
        type: 'alert',
        icon: '⏳',
        title: 'Je geeft sneller uit dan de tijd verstrijkt',
        text: `Je bent <strong>${Math.round(tijdPct)}%</strong> van de cyclus door, maar <strong>${Math.round(geldPct)}%</strong> van je inkomen is al op. Om het uit te zingen kun je nog zo'n <strong>${fmt(perDagRest)} per dag</strong> uitgeven.`
      });
    } else if (tijdPct - geldPct > 15) {
      tips.push({
        type: 'good',
        icon: '🐢',
        title: 'Je ligt voor op schema',
        text: `Je bent <strong>${Math.round(tijdPct)}%</strong> van de cyclus door en pas <strong>${Math.round(geldPct)}%</strong> van je inkomen uitgegeven. Mooie marge — zet het verschil opzij voordat het vanzelf opgaat.`
      });
    }
  }

  // ── 7. Positieve nudge als er weinig data is ──
  if (tips.length === 0) {
    if (expense === 0) {
      tips.push({
        type: 'tip',
        icon: '👋',
        title: 'Nog geen uitgaven deze cyclus',
        text: 'Voeg je uitgaven toe en je geldcoach begint patronen te herkennen en persoonlijke bespaartips te geven.'
      });
    } else {
      tips.push({
        type: 'good',
        icon: '✅',
        title: 'Alles ziet er gezond uit',
        text: `Je uitgaven zijn in balans deze cyclus. Blijf zo doorgaan — consistentie is de sleutel tot financiële rust.`
      });
    }
  }

  return tips;
}

function renderCoach() {
  const tips = generateCoachTips();

  // Volledige coach op Analytics
  const el = document.getElementById('coachTips');
  if (el) {
    el.innerHTML = tips.map(t => `
      <div class="coach-tip coach-tip-${t.type}">
        <span class="coach-tip-icon">${t.icon}</span>
        <div class="coach-tip-body">
          <div class="coach-tip-title">${t.title}</div>
          <div class="coach-tip-text">${t.text}</div>
        </div>
      </div>`).join('');
  }

  // Compacte toptip op dashboard (alleen de belangrijkste)
  const dashCard = document.getElementById('dashCoachCard');
  const dashTip  = document.getElementById('dashCoachTip');
  if (dashCard && dashTip && tips.length) {
    // Prioriteit: alert > warn > tip > good
    const priority = { alert: 0, warn: 1, tip: 2, good: 3 };
    const top = [...tips].sort((a,b)=>priority[a.type]-priority[b.type])[0];
    dashTip.innerHTML = `
      <div class="coach-tip coach-tip-${top.type}">
        <span class="coach-tip-icon">${top.icon}</span>
        <div class="coach-tip-body">
          <div class="coach-tip-title">${top.title}</div>
          <div class="coach-tip-text">${top.text}</div>
        </div>
      </div>`;
    dashCard.style.display = '';
  } else if (dashCard) {
    dashCard.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════
   MOBIELE HERO — "nog te besteden" als hoofdgetal
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   RENDER DASHBOARD
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   SPARKLINE — een verloop van een paar pixels hoog

   Inline SVG in plaats van Chart.js: op dit formaat is een canvas
   zonde van het geheugen, en SVG blijft scherp op elk scherm.
   ═══════════════════════════════════════════════════════════ */
function sparkline(waarden, kleur) {
  const n = waarden.length;
  if (!n) return '';

  const max = Math.max(...waarden, 1);
  const W = 64, H = 22, gap = 2;
  const bw = (W - gap * (n - 1)) / n;

  const staven = waarden.map((v, i) => {
    const h = Math.max(1.5, (v / max) * H);
    const x = i * (bw + gap);
    const y = H - h;
    // De laatste staaf is 'nu' — die krijgt volle kleur, de rest dempt weg
    const op = i === n - 1 ? 1 : 0.28 + (i / n) * 0.32;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"
             rx="1" fill="${kleur}" opacity="${op.toFixed(2)}"/>`;
  }).join('');

  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
            width="${W}" height="${H}" aria-hidden="true">${staven}</svg>`;
}

/* ═══════════════════════════════════════════════════════════
   DE KPI-STRIP — vier waarden, elk met verloop en vergelijking

   Een getal zonder context zegt weinig: is €1.494 aan uitgaven veel?
   Naast de vorige cyclus, met het verloop van een half jaar ernaast,
   zegt het alles.
   ═══════════════════════════════════════════════════════════ */
function renderKpiStrip() {
  const el = document.getElementById('kpis');
  if (!el) return;

  const cycli = getLastNCycles(6);
  const som = (c, filter) =>
    state.transactions.filter(t => c.match(t) && filter(t)).reduce((a, t) => a + t.amt, 0);

  const reeks = {
    in:  cycli.map(c => som(c, t => t.type === 'income')),
    uit: cycli.map(c => som(c, t => t.type === 'expense')),
    weg: cycli.map(c => som(c, t => t.type === 'transfer' && transferDirection(t) === 'out')),
  };
  reeks.over = cycli.map((_, i) => reeks.in[i] - reeks.uit[i]);

  const laatste = a => a[a.length - 1] || 0;
  const vorige  = a => a.length > 1 ? a[a.length - 2] : 0;

  const kaarten = [
    { sleutel:'in',   label:'Binnen',   kleur:'var(--jade)',  hex:'#2FCB8B', omlaagIsGoed:false },
    { sleutel:'uit',  label:'Eruit',    kleur:'var(--ember)', hex:'#FF6A4D', omlaagIsGoed:true  },
    { sleutel:'weg',  label:'Weggezet', kleur:'var(--lilac)', hex:'#8B7FF7', omlaagIsGoed:false },
    { sleutel:'over', label:'Over',     kleur:'var(--gold)',  hex:'#E9A83C', omlaagIsGoed:false },
  ];

  el.innerHTML = kaarten.map(k => {
    const nu  = laatste(reeks[k.sleutel]);
    const was = vorige(reeks[k.sleutel]);
    const d   = nu - was;

    let delta = '';
    if (was > 0 || nu > 0) {
      const pct = was > 0 ? Math.round((d / Math.abs(was)) * 100) : null;
      const omhoog = d > 0;
      // Groen betekent 'goede kant op' — bij uitgaven is dat omlaag
      const goed = k.omlaagIsGoed ? !omhoog : omhoog;
      const cls  = Math.abs(d) < 0.5 ? 'flat' : goed ? 'good' : 'bad';
      const pijl = Math.abs(d) < 0.5 ? '→' : omhoog ? '↑' : '↓';
      const tekst = pct !== null ? `${Math.abs(pct)}%` : fmt(Math.abs(d));
      delta = `<span class="kpi-delta ${cls}">${pijl} ${tekst}</span>
               <span class="kpi-vs">vs vorige cyclus</span>`;
    }

    return `<div class="kpi">
      <div class="kpi-head">
        <span class="kpi-name">${k.label}</span>
        ${sparkline(reeks[k.sleutel], k.hex)}
      </div>
      <div class="kpi-num" style="color:${k.sleutel === 'over' ? k.kleur : 'var(--chalk)'}">${fmt(nu)}</div>
      <div class="kpi-foot">${delta}</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   DE TRECHTER — waar je inkomen onderweg blijft hangen

   Van alles wat binnenkwam, hoeveel overleeft de vaste lasten? En
   daarna de boodschappen? Wat er onderaan uit komt, is wat je echt
   overhield. Elke versmalling is een hap.
   ═══════════════════════════════════════════════════════════ */
function renderFunnel() {
  const el  = document.getElementById('funnel');
  const sub = document.getElementById('funnelSub');
  if (!el) return;

  const tx = getCurrentMonthTx();
  const inkomen = tx.filter(t => t.type === 'income').reduce((a, t) => a + t.amt, 0);

  if (inkomen <= 0) {
    el.innerHTML = '<div class="empty-state">Nog geen inkomsten deze cyclus.</div>';
    if (sub) sub.textContent = '';
    return;
  }

  const VAST = ['Wonen','Abonnementen','Verzekeringen','Bankkosten','Lening'];
  const vast = tx.filter(t => t.type === 'expense' && VAST.includes(t.cat)).reduce((a,t) => a+t.amt, 0);
  const vrij = tx.filter(t => t.type === 'expense' && !VAST.includes(t.cat)).reduce((a,t) => a+t.amt, 0);
  const weg  = tx.filter(t => t.type === 'transfer' && transferDirection(t) === 'out').reduce((a,t) => a+t.amt, 0);

  const stappen = [
    { label:'Binnengekomen', waarde: inkomen,                        hap: 0    },
    { label:'Na vaste lasten', waarde: inkomen - vast,               hap: vast },
    { label:'Na dagelijks',    waarde: inkomen - vast - vrij,        hap: vrij },
    { label:'Na wegzetten',    waarde: inkomen - vast - vrij - weg,  hap: weg  },
  ];

  if (sub) sub.textContent = `${fmt(inkomen)} binnen`;

  el.innerHTML = stappen.map((s, i) => {
    const laat = i === stappen.length - 1;
    const tekort = s.waarde < 0;
    const pct = Math.max(0, Math.min(100, (s.waarde / inkomen) * 100));

    /* Gaat de laatste stap onder nul, dan heb je meer weggezet dan er deze
       cyclus binnenkwam — het verschil kwam uit je buffer. Dat is geen fout
       maar een keuze, en die verdient een eerlijk label in plaats van een
       lege balk met 0%. */
    const balk = tekort
      ? `<div class="fun-track short">
           <div class="fun-fill deficit" style="width:100%"></div>
           <span class="fun-pct">uit je buffer</span>
         </div>`
      : `<div class="fun-track">
           <div class="fun-fill" style="width:${pct}%"></div>
           <span class="fun-pct">${Math.round(pct)}%</span>
         </div>`;

    return `<div class="fun-step ${laat ? 'last' : ''}">
      <div class="fun-top">
        <span class="fun-label">${s.label}</span>
        <span class="fun-val ${tekort ? 'neg' : ''}">${tekort ? '−' : ''}${fmt(Math.abs(s.waarde))}</span>
      </div>
      ${balk}
      ${s.hap > 0 ? `<div class="fun-cut">− ${fmt(s.hap)} ${
        i === 1 ? 'vaste lasten' : i === 2 ? 'dagelijkse uitgaven' : 'naar spaarpotten'
      }</div>` : ''}
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   DE KALENDER — elke dag van de cyclus als vakje

   Donkerder is meer uitgegeven. Zo zie je in één blik je patroon:
   pieken rond het weekend, stille periodes, de dag dat de huur ging.
   ═══════════════════════════════════════════════════════════ */
function renderHeatmap() {
  const el  = document.getElementById('heat');
  const sub = document.getElementById('heatSub');
  if (!el) return;

  const { start, end } = getCurrentCycleRange();
  const vandaag = today();

  // Alle dagen van de cyclus, met wat er die dag uitging
  const dagen = [];
  let d = new Date(start);
  while (d <= end) {
    const ds = dateToStr(d);
    dagen.push({
      datum: ds,
      dag: d.getDate(),
      dow: (d.getDay() + 6) % 7,          // ma = 0
      bedrag: state.transactions
        .filter(t => t.type === 'expense' && t.date === ds)
        .reduce((a, t) => a + t.amt, 0),
      toekomst: ds > vandaag,
      isVandaag: ds === vandaag,
    });
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }

  const geweest = dagen.filter(x => !x.toekomst);
  const max = Math.max(...geweest.map(x => x.bedrag), 1);
  const stil = geweest.filter(x => x.bedrag === 0).length;

  if (sub) sub.textContent = `${stil} ${stil === 1 ? 'stille dag' : 'stille dagen'}`;

  // Lege vakjes vooraan, zodat de eerste dag onder de juiste weekdag valt
  const opvul = Array(dagen[0].dow).fill('<span class="heat-cell pad"></span>').join('');

  const cellen = dagen.map(x => {
    if (x.toekomst) return `<span class="heat-cell future" title="${x.dag}"></span>`;
    const f = x.bedrag / max;                       // 0 … 1
    const stap = x.bedrag === 0 ? 0 : Math.min(4, Math.ceil(f * 4));
    const t = x.bedrag > 0
      ? `${x.dag}: ${fmt(x.bedrag)}`
      : `${x.dag}: niets uitgegeven`;
    return `<span class="heat-cell s${stap}${x.isVandaag ? ' now' : ''}" title="${t}"></span>`;
  }).join('');

  el.innerHTML = `
    <div class="heat-dows">${['M','D','W','D','V','Z','Z'].map(l => `<span>${l}</span>`).join('')}</div>
    <div class="heat-grid">${opvul}${cellen}</div>
    <div class="heat-legend">
      <span>minder</span>
      <span class="heat-cell s0"></span>
      <span class="heat-cell s1"></span>
      <span class="heat-cell s2"></span>
      <span class="heat-cell s3"></span>
      <span class="heat-cell s4"></span>
      <span>meer</span>
    </div>`;
}

function renderDashboard(){
  document.getElementById('sidebarMonth').textContent = cycleLabel();

  const { income, expense, transfer, balance, cats, burnDaily } = computeMetrics();
  const { start, end } = getCurrentCycleRange();
  const totalDays   = getCycleTotalDays();
  const dayProgress = Math.max(1, Math.min(totalDays, getCycleDayProgress()));
  const daysLeft    = Math.max(0, totalDays - dayProgress);

  /* ── HET SPEELBORD ──
     Het heldgetal is wat er ÉCHT op je betaalrekening staat, want dat
     is wat je kunt uitgeven. Heb je geen beginsaldo ingesteld, dan valt
     de app terug op wat je deze cyclus overhield — met een eerlijk label,
     zodat het niet klinkt als een banksaldo. */
  const bank      = computeBankBalance();
  const kept      = income - expense;          // een STROOM: wat je overhield
  const hasBank   = bank !== null;

  const hero      = hasBank ? bank : kept;
  const over      = hero < 0;

  document.getElementById('boardEyebrow').textContent =
    hasBank
      ? (over ? 'Je staat rood' : 'Op je betaalrekening')
      : (over ? 'Meer uitgegeven dan verdiend' : 'Overgehouden deze cyclus');

  const amtEl = document.getElementById('boardAmount');
  amtEl.textContent = (over ? '−' : '') + fmt(Math.abs(hero));
  amtEl.style.color = over ? 'var(--ember)' : 'var(--chalk)';

  // De cyclusmeter: hoeveel van je inkomen is nog niet uitgegeven
  const spentPct = income > 0 ? Math.min(100, (expense / income) * 100) : 0;
  const leftPct  = Math.max(0, 100 - spentPct);
  const fill = document.getElementById('boardMeterFill');
  fill.style.width = leftPct + '%';
  fill.style.background =
    leftPct <= 10 ? 'var(--ember)' :
    leftPct <= 30 ? 'var(--gold)'  : 'var(--jade)';

  // Waar staan we in de tijd? Loopt het uitgeven voor op de klok?
  const timePct = (dayProgress / totalDays) * 100;
  document.getElementById('boardMeterToday').style.left = (100 - timePct) + '%';

  document.getElementById('boardSpent').textContent = fmt(expense) + ' uitgegeven';
  document.getElementById('boardDays').textContent  =
    daysLeft === 0 ? 'laatste dag' : `nog ${daysLeft} ${daysLeft === 1 ? 'dag' : 'dagen'}`;




  /* ── De KPI-strip ── */
  renderKpiStrip();

  /* ── Het dagbudget ── */
  renderToday();

  /* ── Trechter en kalender ── */
  renderFunnel();
  renderHeatmap();

  /* ── De volgende zet: de missie ── */
  renderBoardQuest();

  /* ── Waar het heen ging ── */
  renderDashCategories(cats, expense);

  /* ── Laatste zetten ── */
  const recent = [...state.transactions]
    .sort((a,b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  document.getElementById('recentTxList').innerHTML = recent.length ? recent.map(t => {
    const col    = t.type==='income' ? 'var(--jade)' : t.type==='transfer' ? 'var(--lilac)' : catColor(t.cat);
    const amtCol = t.type==='income' ? 'var(--jade)' : t.type==='transfer' ? 'var(--lilac)' : 'var(--ember)';
    const sign   = t.type==='income' ? '+' : t.type==='transfer' ? '⇄' : '−';
    const d = new Date(t.date + 'T12:00:00');
    return `<div class="tx-mini-row" onclick="editTx(${t.id})">
      <span class="tx-mini-dot" style="background:${col}"></span>
      <span class="tx-mini-name">${t.desc}</span>
      <span class="tx-mini-cat">${d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}</span>
      <span class="tx-mini-amt" style="color:${amtCol}">${sign}${fmt(t.amt)}</span>
    </div>`;
  }).join('') : '<div class="empty-state">Nog geen transacties. Tik op + om te beginnen.</div>';

  /* ── De cyclus tot nu toe ── */
  renderCashflowChart();

  /* ── Coach + HUD ── */
  renderCoach();
  if (typeof renderHUD === 'function') renderHUD();
  if (typeof renderPlayer === 'function') renderPlayer();

  const txSub = document.getElementById('txPageSub');
  if (txSub) txSub.textContent = state.transactions.length + ' transacties in totaal';
}


/* Het budget op het speelbord — per dag of per week, en eerlijk
   over gaten in je administratie. */
function renderToday() {
  const el = document.getElementById('today');
  if (!el) return;

  const a   = computeDailyAllowance();
  const gap = loggingGap();

  if (a.pot <= 0 && a.spentToday === 0 && !gap) { el.innerHTML = ''; return; }

  /* ── Eerst het gat: een budget dat op verouderde data leunt is een
        leugen, geen schatting. Dus vraag het, in plaats van te gokken. ── */
  if (gap) {
    const van = new Date(gap.van + 'T12:00:00');
    const tot = new Date(gap.tot + 'T12:00:00');
    const f = d => d.toLocaleDateString('nl-NL', { day:'numeric', month:'short' });
    const periode = gap.van === gap.tot ? f(van) : `${f(van)} – ${f(tot)}`;

    el.innerHTML = `
      <div class="gap">
        <div class="gap-head">
          <span class="gap-icon">🕳️</span>
          <div>
            <div class="gap-title">${gap.dagen} ${gap.dagen === 1 ? 'dag' : 'dagen'} niet bijgewerkt</div>
            <div class="gap-sub">${periode}${gap.geboekt ? ` · ${gap.geboekt} transactie${gap.geboekt !== 1 ? 's' : ''} geboekt (${fmt(gap.bedrag)})` : ' · niets geboekt'}</div>
          </div>
        </div>
        <div class="gap-body">
          Zonder die dagen weet ik niet wat je te besteden hebt.
          ${gap.geboekt ? 'Zijn ze compleet?' : 'Gaf je toen echt niets uit?'}
        </div>
        <div class="gap-actions">
          <button class="btn-primary-sm" onclick="confirmNoSpend()">
            ${gap.geboekt ? 'Ja, compleet' : 'Ja, niets uitgegeven'}
          </button>
          <button class="btn-secondary btn-sm" onclick="openModal('addTransaction')">Aanvullen</button>
        </div>
      </div>`;
    return;
  }

  /* ── Geen gat: toon het budget ── */
  const over   = a.restVandaag;
  const opraak = over <= 0;
  const pct    = a.perDag > 0
    ? Math.max(0, Math.min(100, (a.spentToday / a.perDag) * 100))
    : 100;

  const kleur = opraak ? 'var(--ember)'
              : pct > 70 ? 'var(--gold)'
              : 'var(--jade)';

  const label = a.weekly ? 'Deze week te besteden' : 'Vandaag te besteden';
  const uit   = a.weekly ? 'deze week al uit'      : 'vandaag al uit';
  const rest  = a.weekly
    ? `${a.perioden} ${a.perioden === 1 ? 'week' : 'weken'} te gaan`
    : `${a.daysLeft} ${a.daysLeft === 1 ? 'dag' : 'dagen'} te gaan`;

  el.innerHTML = `
    <div class="today-top">
      <span class="today-lbl">${label}</span>
      <span class="today-amt" style="color:${kleur}">
        ${opraak ? '−' : ''}${fmt(Math.abs(over))}
      </span>
    </div>

    <div class="today-rail">
      <div class="today-fill" style="width:${pct}%;background:${kleur}"></div>
    </div>

    <div class="today-meta">
      <span>${a.spentToday > 0 ? fmt(a.spentToday) + ' ' + uit : 'nog niets uitgegeven'}
            · budget ${fmt(a.perDag)}</span>
      <span>${a.upcoming > 0 ? fmt(a.upcoming) + ' vast · ' : ''}${rest}</span>
    </div>`;
}

/* De missie als "volgende zet" op het speelbord */


function renderBoardQuest() {
  const el = document.getElementById('boardQuestInner');
  if (!el) return;

  if (typeof ensureMission !== 'function' || !state.adventure) {
    el.innerHTML = '<div class="empty-state">—</div>';
    return;
  }

  ensureMission();
  const m = state.adventure.currentMission;
  const tpl = m ? MISSIONS.find(x => x.id === m.id) : null;
  if (!tpl) { el.innerHTML = '<div class="empty-state">—</div>'; return; }

  const res  = tpl.check(m);
  const days = Math.max(0, Math.ceil((new Date(m.weekEnd + 'T23:59:59') - new Date()) / 86400000));
  const path = getPathInfo();

  el.innerHTML = `
    <div class="board-quest-eyebrow">Je volgende zet</div>
    <div class="board-quest-icon">${tpl.icon}</div>
    <div class="board-quest-name">${tpl.name}</div>
    <div class="board-quest-desc">${tpl.describe(m)}</div>

    <div class="board-quest-state ${res.success ? 'good' : 'bad'}">
      ${res.success ? '✓' : '○'} ${res.progress}
    </div>

    <div class="board-quest-pips">
      ${Array.from({length: path.stepsNeeded}, (_, i) =>
        `<span class="adv-step-dot ${i < path.stepsDone ? 'filled' : ''}"></span>`).join('')}
    </div>

    <div class="board-quest-foot">
      <span>${path.current.icon} ${path.current.name}</span>
      <span>${days === 0 ? 'laatste dag' : `nog ${days}d`}</span>
    </div>`;
}

/* ── VERGELEKEN MET VORIGE CYCLUS ──
   Een lijst met alleen bedragen zegt weinig — je weet niet of €531
   aan Wonen veel of weinig is. Naast de vorige cyclus gezet zegt het
   alles: is het gestegen, gedaald, of gelijk gebleven?
   Gesorteerd op de grootste verandering, want daar zit het nieuws. */
function renderDashCategories(cats, total) {
  const el   = document.getElementById('dashCatList');
  const meta = document.getElementById('catStripMeta');
  if (!el) return;

  const cycles = getLastNCycles(2);
  const prev   = cycles[0];

  const prevCats = {};
  state.transactions
    .filter(t => t.type === 'expense' && prev.match(t))
    .forEach(t => { prevCats[t.cat] = (prevCats[t.cat] || 0) + t.amt; });

  const prevTotal = Object.values(prevCats).reduce((a, v) => a + v, 0);

  // Alles wat in één van beide cycli voorkomt
  const alle = [...new Set([...Object.keys(cats), ...Object.keys(prevCats)])];

  const rijen = alle.map(cat => {
    const nu  = cats[cat]     || 0;
    const was = prevCats[cat] || 0;
    return { cat, nu, was, diff: nu - was, nieuw: was === 0 && nu > 0, weg: nu === 0 && was > 0 };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));   // grootste verandering eerst

  if (meta) {
    if (prevTotal > 0) {
      const d = total - prevTotal;
      const teken = d >= 0 ? '+' : '−';
      meta.textContent = `${fmt(total)} nu · ${fmt(prevTotal)} toen · ${teken}${fmt(Math.abs(d))}`;
    } else {
      meta.textContent = total > 0 ? `${fmt(total)} deze cyclus` : '';
    }
  }

  if (!rijen.length) {
    el.innerHTML = '<div class="empty-state">Nog geen uitgaven om te vergelijken.</div>';
    renderDonutChart(cats);
    return;
  }

  el.innerHTML = rijen.map(r => {
    const col = catColor(r.cat);

    // Hoe leest de verandering?
    let deltaTxt, deltaCls;
    if (r.nieuw)       { deltaTxt = 'nieuw';  deltaCls = 'new';  }
    else if (r.weg)    { deltaTxt = 'weg';    deltaCls = 'gone'; }
    else if (Math.abs(r.diff) < 0.5) { deltaTxt = 'gelijk'; deltaCls = 'same'; }
    else {
      const pct = r.was > 0 ? Math.round((r.diff / r.was) * 100) : null;
      const up  = r.diff > 0;
      deltaTxt  = `${up ? '↑' : '↓'} ${fmt(Math.abs(r.diff))}${pct !== null ? ` · ${Math.abs(pct)}%` : ''}`;
      deltaCls  = up ? 'up' : 'down';
    }

    // Twee balken onder elkaar: toen en nu, op dezelfde schaal
    const schaal = Math.max(r.nu, r.was, 1);
    const pctNu  = (r.nu  / schaal) * 100;
    const pctWas = (r.was / schaal) * 100;

    return `<div class="cmp-row">
      <span class="cmp-dot" style="background:${col}"></span>
      <span class="cmp-name">${catEmoji(r.cat)} ${r.cat}</span>

      <span class="cmp-bars">
        <span class="cmp-bar was" style="width:${pctWas}%"></span>
        <span class="cmp-bar nu"  style="width:${pctNu}%;background:${col}"></span>
      </span>

      <span class="cmp-amt">${fmt(r.nu)}</span>
      <span class="cmp-delta ${deltaCls}">${deltaTxt}</span>
    </div>`;
  }).join('');

  renderDonutChart(cats);
}

function chartColors(){
  const light = state.settings.theme === 'light';
  return {
    grid: light ? 'rgba(27,22,56,0.07)'  : 'rgba(242,237,227,0.06)',
    text: light ? '#8B84AC'              : '#6F678F'
  };
}

/* De standaard categoriekleuren van het palet — gebruikt als een
   categorie geen eigen kleur heeft. */
const PALETTE = ['#8B7FF7','#2FCB8B','#FF6A4D','#E9A83C','#5FD3E8','#E87BC7','#7BE0B0','#FFA36B'];

function renderCashflowChart(){
  const { grid, text } = chartColors();
  const cycles = getLastNCycles(6);

  const months = cycles.map(c => c.label);
  const incD = cycles.map(c => Math.round(state.transactions.filter(t=>t.type==='income'  && c.match(t)).reduce((a,t)=>a+t.amt,0)));
  const expD = cycles.map(c => Math.round(state.transactions.filter(t=>t.type==='expense' && c.match(t)).reduce((a,t)=>a+t.amt,0)));
  const traD = cycles.map(c => Math.round(state.transactions.filter(t=>t.type==='transfer'&& c.match(t)).reduce((a,t)=>a+t.amt,0)));

  /* De saldolijn: wat er aan het EIND van elke cyclus op je rekening stond.
     Dit is wat de cycli met elkaar verbindt — het slot van de één is de
     start van de volgende. Zonder beginsaldo kunnen we dit niet weten. */
  const saldoLijn = cycles.map(c => {
    const eind = dateToStr(c.end) > today() ? today() : dateToStr(c.end);
    return bankBalanceAt(eind);
  });
  const toonSaldo = hasBankSetup() && saldoLijn.some(v => v !== null);

  const datasets = [
    { type:'bar', label:'Binnen',   data:incD, backgroundColor:'rgba(47,203,139,0.78)',  borderRadius:5, borderSkipped:false, order:2 },
    { type:'bar', label:'Eruit',    data:expD, backgroundColor:'rgba(255,106,77,0.78)',  borderRadius:5, borderSkipped:false, order:2 },
    { type:'bar', label:'Weggezet', data:traD, backgroundColor:'rgba(139,127,247,0.70)', borderRadius:5, borderSkipped:false, order:2 },
  ];

  if (toonSaldo) {
    datasets.unshift({
      type:'line',
      label:'Op je rekening',
      data: saldoLijn,
      borderColor:'#E9A83C',
      backgroundColor:'rgba(233,168,60,0.10)',
      borderWidth:2.5,
      tension:0.35,
      fill:true,
      pointRadius:4,
      pointBackgroundColor:'#E9A83C',
      pointBorderColor: state.settings.theme==='light' ? '#fff' : '#16122E',
      pointBorderWidth:2,
      spanGaps:true,
      order:1,
    });
  }

  const ctx = document.getElementById('cashflowChart').getContext('2d');
  if (charts.cashflow) charts.cashflow.destroy();

  charts.cashflow = new Chart(ctx, {
    data: { labels: months, datasets },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ display:false },
        tooltip:{
          callbacks:{
            title: items => cycles[items[0].dataIndex].fullLabel,
            label: c => ' ' + c.dataset.label + ': ' + state.settings.currency +
                        c.raw.toLocaleString('nl-NL'),
          }
        }
      },
      scales:{
        x:{ grid:{ display:false }, ticks:{ color:text, font:{ size:11 } } },
        y:{ grid:{ color:grid }, ticks:{ color:text, font:{ size:11 },
            callback:v => state.settings.currency + v.toLocaleString('nl-NL') } }
      }
    }
  });

  const leg = [
    ...(toonSaldo ? [{ label:'Op je rekening', color:'#E9A83C' }] : []),
    { label:'Binnen',   color:'#2FCB8B' },
    { label:'Eruit',    color:'#FF6A4D' },
    { label:'Weggezet', color:'#8B7FF7' },
  ];
  document.getElementById('cashflowLegend').innerHTML = leg.map(l =>
    `<span class="legend-item"><span class="legend-dot" style="background:${l.color}"></span>${l.label}</span>`
  ).join('');
}

function renderDonutChart(cats){
  const entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const total=entries.reduce((a,[,v])=>a+v,0);
  document.getElementById('donutTotal').textContent=fmt(total);
  const ctx=document.getElementById('categoryChart').getContext('2d');
  if(charts.donut)charts.donut.destroy();
  if(!entries.length){ if(charts.donut) charts.donut.destroy(); return; }
  charts.donut=new Chart(ctx,{type:'doughnut',data:{labels:entries.map(([k])=>k),datasets:[{data:entries.map(([,v])=>Math.round(v)),backgroundColor:entries.map(([k])=>catColor(k)),borderWidth:2,borderColor:state.settings.theme==='light'?'#ffffff':'#16122E',hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:true,cutout:'68%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+state.settings.currency+c.raw.toLocaleString('nl-NL')+' ('+Math.round(c.raw/total*100)+'%)'}}}}});
  document.getElementById('donutLegend').innerHTML=entries.slice(0,6).map(([k,v])=>`<div class="donut-leg-row"><span class="donut-leg-name"><span class="donut-leg-dot" style="background:${catColor(k)}"></span>${k}</span><span class="donut-leg-amt">${fmt(v)}</span></div>`).join('');
}

/* ═══════════════════════════════════════════════
   RENDER TRANSACTIONS
   ═══════════════════════════════════════════════ */
function renderTransactions(){
  updateCatFilter();
  const tx=getFilteredTx();
  const tbody=document.getElementById('txTableBody');
  if(!tx.length){tbody.innerHTML='<tr><td colspan="5" class="empty-state">Geen transacties gevonden</td></tr>';document.getElementById('txSummary').innerHTML='';return;}
  tbody.innerHTML=tx.map(t=>{
    const col=t.type==='income'?'var(--green)':t.type==='transfer'?'var(--purple)':catColor(t.cat);
    const amtClass=t.type==='income'?'income':t.type==='transfer'?'transfer':'expense';
    const sign=t.type==='income'?'+':t.type==='transfer'?'⇄':'−';
    const dateStr=new Date(t.date).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'});
    const sub=t.type==='transfer'&&(t.fromAccount||t.toAccount)?`<div style="font-size:11px;color:var(--text3)">${t.fromAccount||'?'} → ${t.toAccount||'?'}</div>`:t.note?`<div style="font-size:11px;color:var(--text3)">${t.note}</div>`:'';
    return `<tr><td><div style="font-weight:500">${t.desc}</div>${sub}</td><td><span class="tx-cat-badge"><span class="tx-cat-dot" style="background:${col}"></span>${t.cat}</span></td><td class="tx-date-cell">${dateStr}</td><td class="tx-amount-cell"><span class="tx-amount ${amtClass}">${sign}${fmt(t.amt)}</span></td><td class="tx-actions"><button class="tx-del-btn" onclick="editTx(${t.id})" title="Bewerken" style="margin-right:2px">✎</button><button class="tx-del-btn" onclick="deleteTx(${t.id})" title="Verwijderen">×</button></td></tr>`;
  }).join('');
  const inc=tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const exp=tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const tra=tx.filter(t=>t.type==='transfer').reduce((a,t)=>a+t.amt,0);
  document.getElementById('txSummary').innerHTML=`<span class="tx-summary-item">${tx.length} transacties</span><span class="tx-summary-item">Inkomsten: <strong style="color:var(--green)">${fmt(inc)}</strong></span><span class="tx-summary-item">Uitgaven: <strong style="color:var(--red)">${fmt(exp)}</strong></span>${tra>0?`<span class="tx-summary-item">Transfers: <strong style="color:var(--purple)">${fmt(tra)}</strong></span>`:''}<span class="tx-summary-item">Saldo: <strong style="color:${inc-exp>=0?'var(--green)':'var(--red)'}">${fmtSigned(inc-exp)}</strong></span>`;
}

/* ═══════════════════════════════════════════════
   RENDER ANALYTICS
   ═══════════════════════════════════════════════ */
function renderAnalytics(){
  const{grid,text}=chartColors();
  const subEl = document.getElementById('analyticsSub');
  if (subEl) {
    if (state.analyticsPeriod === 'month')   subEl.textContent = `Per dag — ${cycleLabel()}`;
    if (state.analyticsPeriod === 'quarter') subEl.textContent = 'Per week — laatste 13 weken';
    if (state.analyticsPeriod === 'year')    subEl.textContent = 'Per cyclus — laatste 12 cycli';
  }

  // ── Bouw periode-buckets ──
  let periods = [];
  const todayDate = new Date();
  if (state.analyticsPeriod === 'month') {
    const { start, end } = getCurrentCycleRange();
    let cursor = new Date(start);
    while (cursor <= end) {
      const dayStr = dateToStr(cursor);
      periods.push({ match: t => t.date === dayStr, label: cursor.getDate().toString() });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
  } else if (state.analyticsPeriod === 'quarter') {
    for (let i = 12; i >= 0; i--) {
      const weekEnd = new Date(todayDate); weekEnd.setDate(weekEnd.getDate() - (i * 7));
      const weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() - 6);
      const ws = dateToStr(weekStart), we = dateToStr(weekEnd);
      periods.push({ match: t => t.date >= ws && t.date <= we, label: weekStart.toLocaleDateString('nl-NL',{day:'numeric',month:'short'}) });
    }
  } else {
    periods = getLastNCycles(12);
  }

  const labels  = periods.map(p => p.label);
  const incArr  = periods.map(p => Math.round(state.transactions.filter(t=>t.type==='income'&&p.match(t)).reduce((a,t)=>a+t.amt,0)));
  const expArr  = periods.map(p => Math.round(state.transactions.filter(t=>t.type==='expense'&&p.match(t)).reduce((a,t)=>a+t.amt,0)));
  const maxTicks = state.analyticsPeriod==='month' ? 15 : 13;
  const ptRadius = state.analyticsPeriod==='month' ? 2 : 4;

  // ── Verhaal: wat gebeurt er met je geld? ──
  renderMoneyStory();

  // ── Wat je coach ziet — draagt nu de hele adviesrol ──
  renderCoach();

  // ── Vast vs vrij ──
  renderFixedVarChart(grid, text);

  // ── Inkomsten vs Uitgaven chart ──
  const ctx1=document.getElementById('incExpChart').getContext('2d');
  if(charts.incExp)charts.incExp.destroy();
  charts.incExp=new Chart(ctx1,{type:'line',data:{labels,datasets:[
    {label:'Inkomsten',data:incArr,borderColor:'#2FCB8B',backgroundColor:'rgba(47,203,139,0.10)',tension:0.4,fill:true,pointRadius:ptRadius,pointBackgroundColor:'#2FCB8B'},
    {label:'Uitgaven', data:expArr,borderColor:'#FF6A4D',backgroundColor:'rgba(255,106,77,0.10)',tension:0.4,fill:true,pointRadius:ptRadius,pointBackgroundColor:'#FF6A4D'}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:10},maxRotation:0,autoSkip:true,maxTicksLimit:maxTicks}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});
  document.getElementById('incExpLegend').innerHTML=[{label:'Inkomsten',color:'#2FCB8B'},{label:'Uitgaven',color:'#FF6A4D'}].map(l=>`<span class="legend-item"><span class="legend-dot" style="background:${l.color}"></span>${l.label}</span>`).join('');

  // ── Categorie trend ──
  const topCats=Object.entries(state.transactions.filter(t=>t.type==='expense').reduce((a,t)=>{a[t.cat]=(a[t.cat]||0)+t.amt;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k])=>k);
  const ctx2=document.getElementById('catTrendChart').getContext('2d');
  if(charts.catTrend)charts.catTrend.destroy();
  charts.catTrend=new Chart(ctx2,{type:'line',data:{labels,datasets:topCats.map(cat=>({label:cat,data:periods.map(p=>Math.round(state.transactions.filter(t=>t.type==='expense'&&t.cat===cat&&p.match(t)).reduce((a,t)=>a+t.amt,0))),borderColor:catColor(cat),backgroundColor:'transparent',tension:0.4,pointRadius:ptRadius}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+': '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:10},maxRotation:0,autoSkip:true,maxTicksLimit:maxTicks}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});

  // ── Spaarquote ──
  const savRates=periods.map(p=>{const inc=state.transactions.filter(t=>t.type==='income'&&p.match(t)).reduce((a,t)=>a+t.amt,0);const exp=state.transactions.filter(t=>t.type==='expense'&&p.match(t)).reduce((a,t)=>a+t.amt,0);return inc>0?Math.round(((inc-exp)/inc)*100):0;});
  const ctx3=document.getElementById('savingsRateChart').getContext('2d');
  if(charts.savRate)charts.savRate.destroy();
  charts.savRate=new Chart(ctx3,{type:'bar',data:{labels,datasets:[{data:savRates,backgroundColor:savRates.map(v=>v>=20?'rgba(47,203,139,0.78)':v>=0?'rgba(233,168,60,0.78)':'rgba(255,106,77,0.78)'),borderRadius:3,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.raw+'%'}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:10},maxRotation:0,autoSkip:true,maxTicksLimit:maxTicks}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>v+'%'}}}}});

  // ── Weekdag patroon ──
  const wd=new Array(7).fill(0),wc=new Array(7).fill(0);
  state.transactions.filter(t=>t.type==='expense').forEach(t=>{const d=(new Date(t.date).getDay()+6)%7;wd[d]+=t.amt;wc[d]++;});
  const wAvg=wd.map((s,i)=>wc[i]>0?Math.round(s/wc[i]):0);
  const ctx4=document.getElementById('weekdayChart').getContext('2d');
  if(charts.weekday)charts.weekday.destroy();
  charts.weekday=new Chart(ctx4,{type:'bar',data:{labels:['Ma','Di','Wo','Do','Vr','Za','Zo'],datasets:[{data:wAvg,backgroundColor:wAvg.map((_,i)=>i===wAvg.indexOf(Math.max(...wAvg))?'rgba(255,106,77,0.80)':'rgba(139,127,247,0.65)'),borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' gem. '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});

  renderYearReport();
}

/* ── Verhaal: wat gebeurt er met je geld ── */
function renderMoneyStory() {
  const storyEl = document.getElementById('moneyStory');
  const flowEl  = document.getElementById('moneyFlowBars');
  if (!storyEl || !flowEl) return;

  const cycles = getLastNCycles(2);
  const [prev, curr] = cycles;
  const currTx = state.transactions.filter(t => curr.match(t));
  const prevTx = state.transactions.filter(t => prev.match(t));

  const income  = currTx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const expense = currTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const prevExp = prevTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const savings = income - expense;
  const savPct  = income > 0 ? Math.round((savings/income)*100) : 0;
  const expDiff = expense - prevExp;

  // Categorie met grootste stijging
  const cats = {};
  const prevCats = {};
  currTx.filter(t=>t.type==='expense').forEach(t=>{cats[t.cat]=(cats[t.cat]||0)+t.amt;});
  prevTx.filter(t=>t.type==='expense').forEach(t=>{prevCats[t.cat]=(prevCats[t.cat]||0)+t.amt;});
  const biggestCat = Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
  const biggestRise = Object.entries(cats)
    .map(([cat,amt])=>({cat,amt,prev:prevCats[cat]||0,diff:amt-(prevCats[cat]||0)}))
    .sort((a,b)=>b.diff-a.diff)[0];

  // Bouw het verhaal
  let story = '';
  if (income === 0) {
    story = 'Voeg inkomsten en uitgaven toe om je geldverhaal te zien.';
  } else {
    const cycleLabel_ = curr.fullLabel || curr.label;
    story += `In de cyclus <strong>${cycleLabel_}</strong> verdiende je <strong style="color:var(--green)">${fmt(income)}</strong> en gaf je <strong style="color:var(--red)">${fmt(expense)}</strong> uit. `;

    if (savings >= 0) {
      story += `Je hield <strong style="color:var(--green)">${fmt(savings)}</strong> over — dat is <strong>${savPct}%</strong> van je inkomen. `;
    } else {
      story += `Je gaf <strong style="color:var(--red)">${fmt(Math.abs(savings))}</strong> meer uit dan je verdiende. `;
    }

    if (biggestCat) {
      story += `Het meeste ging naar <strong>${biggestCat[0]}</strong> (${fmt(biggestCat[1])}). `;
    }

    if (prevExp > 0 && expDiff !== 0) {
      const dir = expDiff > 0 ? 'meer' : 'minder';
      const color = expDiff > 0 ? 'var(--red)' : 'var(--green)';
      story += `Ten opzichte van de vorige cyclus gaf je <strong style="color:${color}">${fmt(Math.abs(expDiff))} ${dir}</strong> uit`;
      if (biggestRise && biggestRise.diff > 0 && expDiff > 0) {
        story += `, vooral door een stijging in <strong>${biggestRise.cat}</strong> (+${fmt(biggestRise.diff)})`;
      }
      story += '.';
    }
  }
  storyEl.innerHTML = story;

  // Geldstroom balken: hoe wordt het inkomen verdeeld?
  if (income > 0) {
    const catTotals = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
    const transferAmt = currTx.filter(t=>t.type==='transfer').reduce((a,t)=>a+t.amt,0);
    const allItems = [...catTotals.map(([cat,amt])=>({label:cat,amt,color:catColor(cat)}))];
    if (transferAmt > 0) allItems.push({label:'Transfers',amt:transferAmt,color:'var(--purple)'});
    if (savings > 0) allItems.push({label:'Gespaard',amt:savings,color:'var(--green)'});

    flowEl.innerHTML = `
      <div class="flow-bar-track">
        ${allItems.map(item=>`<div class="flow-bar-seg" style="width:${Math.min(100,Math.round((item.amt/income)*100))}%;background:${item.color}" title="${item.label}: ${fmt(item.amt)}"></div>`).join('')}
      </div>
      <div class="flow-bar-legend">
        ${allItems.slice(0,6).map(item=>`<span class="flow-legend-item"><span style="background:${item.color}" class="flow-legend-dot"></span>${item.label} <span class="flow-legend-pct">${Math.round((item.amt/income)*100)}%</span></span>`).join('')}
      </div>`;
  } else {
    flowEl.innerHTML = '';
  }
}


/* ── Vaste vs variabele lasten ── */
const FIXED_CATS = ['Wonen','Abonnementen','Verzekeringen','Bankkosten','Lening','Transport'];

function renderFixedVarChart(grid, text) {
  const cycles = getLastNCycles(2);
  const curr = cycles[1];
  const currTx = state.transactions.filter(t=>curr.match(t)&&t.type==='expense');
  const fixed    = currTx.filter(t=>FIXED_CATS.includes(t.cat)).reduce((a,t)=>a+t.amt,0);
  const variable = currTx.filter(t=>!FIXED_CATS.includes(t.cat)).reduce((a,t)=>a+t.amt,0);

  const ctx = document.getElementById('fixedVarChart');
  if (!ctx) return;
  if (charts.fixedVar) charts.fixedVar.destroy();

  if (fixed + variable === 0) return;

  charts.fixedVar = new Chart(ctx.getContext('2d'),{
    type:'doughnut',
    data:{
      labels:['Vaste lasten','Variabel'],
      datasets:[{
        data:[Math.round(fixed),Math.round(variable)],
        backgroundColor:['rgba(139,127,247,0.80)','rgba(47,203,139,0.80)'],
        borderWidth:2,
        borderColor: 'var(--bg2)',
        hoverOffset:6
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${state.settings.currency}${c.raw.toLocaleString('nl-NL')} (${Math.round(c.raw/(fixed+variable)*100)}%)`}}}}
  });

  const legEl = document.getElementById('fixedVarLegend');
  if (legEl) {
    const total = fixed + variable;
    legEl.innerHTML = `
      <div class="donut-leg-row"><span class="donut-leg-name"><span class="donut-leg-dot" style="background:rgba(139,127,247,0.80)"></span>Vaste lasten</span><span class="donut-leg-amt">${fmt(fixed)} <small style="color:var(--text3)">${Math.round(fixed/total*100)}%</small></span></div>
      <div class="donut-leg-row"><span class="donut-leg-name"><span class="donut-leg-dot" style="background:rgba(47,203,139,0.80)"></span>Variabel</span><span class="donut-leg-amt">${fmt(variable)} <small style="color:var(--text3)">${Math.round(variable/total*100)}%</small></span></div>`;
  }
}



/* ═══════════════════════════════════════════════
   JAAROVERZICHT
   ═══════════════════════════════════════════════ */
function renderYearReport() {
  const sel = document.getElementById('yearReportSelect');
  const el  = document.getElementById('yearReport');
  if (!sel || !el) return;

  // Vul jaren dropdown op basis van beschikbare data
  const years = [...new Set(state.transactions.map(t => t.date.slice(0,4)))].sort().reverse();
  if (!years.length) { el.innerHTML = '<div class="empty-state">Nog geen data</div>'; return; }

  if (!sel.options.length || sel.options.length !== years.length) {
    const current = sel.value;
    sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (current && years.includes(current)) sel.value = current;
  }

  const year = sel.value || years[0];
  const yearTx = state.transactions.filter(t => t.date.startsWith(year));

  const income  = yearTx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const expense = yearTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const saved   = income - expense;
  const savedPct = income > 0 ? Math.round((saved/income)*100) : 0;

  // Per maand analyse — beste en slechtste maand
  const monthlyData = [];
  for (let m = 1; m <= 12; m++) {
    const prefix = `${year}-${String(m).padStart(2,'0')}`;
    const mTx = yearTx.filter(t => t.date.startsWith(prefix));
    const mInc = mTx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
    const mExp = mTx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
    if (mTx.length > 0) {
      monthlyData.push({ month: m, income: mInc, expense: mExp, net: mInc - mExp,
        name: new Date(parseInt(year), m-1, 1).toLocaleDateString('nl-NL',{month:'long'}) });
    }
  }

  const bestMonth  = [...monthlyData].sort((a,b)=>b.net-a.net)[0];
  const worstMonth = [...monthlyData].sort((a,b)=>a.net-b.net)[0];

  // Top categorieën
  const cats = {};
  yearTx.filter(t=>t.type==='expense').forEach(t=>{cats[t.cat]=(cats[t.cat]||0)+t.amt;});
  const topCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // Aantal transacties en gemiddelde
  const txCount = yearTx.filter(t=>t.type==='expense').length;
  const avgTx   = txCount > 0 ? expense / txCount : 0;

  el.innerHTML = `
    <div class="year-report-grid">
      <div class="year-stat">
        <div class="year-stat-label">Totaal verdiend</div>
        <div class="year-stat-value" style="color:var(--green)">${fmt(income)}</div>
      </div>
      <div class="year-stat">
        <div class="year-stat-label">Totaal uitgegeven</div>
        <div class="year-stat-value" style="color:var(--red)">${fmt(expense)}</div>
      </div>
      <div class="year-stat">
        <div class="year-stat-label">Overgehouden</div>
        <div class="year-stat-value" style="color:${saved>=0?'var(--green)':'var(--red)'}">${fmt(saved)} <small>(${savedPct}%)</small></div>
      </div>
      <div class="year-stat">
        <div class="year-stat-label">Gem. per uitgave</div>
        <div class="year-stat-value">${fmt(avgTx)} <small>(${txCount}x)</small></div>
      </div>
    </div>

    ${monthlyData.length >= 2 ? `
    <div class="year-months-row">
      ${bestMonth ? `<div class="year-month-card best">
        <span class="year-month-icon">🏆</span>
        <div>
          <div class="year-month-label">Beste maand</div>
          <div class="year-month-name">${bestMonth.name}</div>
          <div class="year-month-val" style="color:var(--green)">+${fmt(bestMonth.net)}</div>
        </div>
      </div>` : ''}
      ${worstMonth && worstMonth !== bestMonth ? `<div class="year-month-card worst">
        <span class="year-month-icon">📉</span>
        <div>
          <div class="year-month-label">Duurste maand</div>
          <div class="year-month-name">${worstMonth.name}</div>
          <div class="year-month-val" style="color:var(--red)">${fmt(worstMonth.net)}</div>
        </div>
      </div>` : ''}
    </div>` : ''}

    ${topCats.length ? `
    <div class="year-topcats">
      <div class="year-topcats-title">Top uitgaven categorieën</div>
      ${topCats.map(([cat, amt], i) => `
        <div class="year-topcat-row">
          <span class="year-topcat-rank">${i+1}</span>
          <span class="year-topcat-name">${catEmoji(cat)} ${cat}</span>
          <span class="year-topcat-amt">${fmt(amt)}</span>
        </div>`).join('')}
    </div>` : ''}
  `;
}


/* ═══════════════════════════════════════════════
   RENDER BUDGETS & GOALS
   ═══════════════════════════════════════════════ */
function renderBudgets(){
  const grid=document.getElementById('budgetGrid');
  const entries=Object.entries(state.budgets);
  if(!entries.length){grid.innerHTML=`<div class="empty-card"><div class="empty-icon">◎</div><div class="empty-title">Nog geen budgetten</div><div class="empty-sub">Stel een limiet in per categorie.</div><button class="btn-primary" onclick="openModal('addBudget')">Budget toevoegen</button></div>`;return;}
  const tx=getCurrentMonthTx();
  grid.innerHTML=entries.map(([cat,limit])=>{
    const spent=tx.filter(t=>t.type==='expense'&&t.cat===cat).reduce((a,t)=>a+t.amt,0);
    const pct=Math.min(100,Math.round((spent/limit)*100));
    const rawPct=(spent/limit)*100;
    const stateCls = rawPct >= 100 ? 'over' : rawPct >= 80 ? 'close' : 'safe';
    const over=spent>limit,warn=pct>=80&&!over;
    const col=catColor(cat);
    const barCol=over?'var(--red)':warn?'var(--amber)':col;
    const rem=limit-spent;
    return `<div class="budget-card ${stateCls}"><div class="budget-card-header"><div class="budget-cat-name"><span class="budget-cat-dot" style="background:${col}"></span>${catEmoji(cat)} ${cat}</div><div style="display:flex;gap:8px;align-items:center"><span class="budget-pct-badge ${over?'over':warn?'warn':'ok'}">${pct}%</span><button class="budget-del-btn" onclick="deleteBudget('${cat}')">×</button></div></div><div class="budget-spent">${fmt(spent)}</div><div class="budget-amounts"><span>van ${fmt(limit)} budget</span><span style="color:${over?'var(--red)':rem<limit*0.2?'var(--amber)':'var(--green)'}">${over?'−'+fmt(Math.abs(rem))+' over':fmt(rem)+' resterend'}</span></div><div class="budget-bar-track"><div class="budget-bar-fill" style="width:${pct}%;background:${barCol}"></div></div></div>`;
  }).join('');
}

function renderGoals(){
  const grid=document.getElementById('goalsGrid');
  if(!state.goals.length){grid.innerHTML=`<div class="empty-card"><div class="empty-icon">★</div><div class="empty-title">Nog geen doelen</div><div class="empty-sub">Voeg een spaardoel toe.</div><button class="btn-primary" onclick="openModal('addGoal')">Doel toevoegen</button></div>`;return;}
  grid.innerHTML=state.goals.map(g=>{
    const pct=Math.min(100,Math.round((g.saved/g.target)*100));
    const rem=g.target-g.saved;
    const ml=Math.max(1,Math.ceil((new Date(g.date)-new Date())/(1000*60*60*24*30)));
    const monthly=rem>0?rem/ml:0;
    const done=g.saved>=g.target;
    return `<div class="goal-card" style="border-top:3px solid ${g.color}"><div class="goal-header"><div><div class="goal-name">${g.name}${done?' ✓':''}</div><div class="goal-date">Doel: ${new Date(g.date).toLocaleDateString('nl-NL',{month:'long',year:'numeric'})}</div></div><button class="goal-del-btn" onclick="deleteGoal(${g.id})">×</button></div><div class="goal-pct" style="color:${g.color}">${pct}%</div><div class="goal-amounts">${fmt(g.saved)} gespaard van ${fmt(g.target)}</div><div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%;background:${g.color}"></div></div>${done?`<div class="goal-monthly" style="color:var(--green)">🎉 Doel behaald!</div>`:`<div class="goal-monthly">Nog <strong>${fmt(rem)}</strong> — spaar <strong>${fmt(monthly)}/maand</strong></div>`}</div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════
   RENDER SETTINGS
   ═══════════════════════════════════════════════ */
function renderSettings(){
  document.getElementById('themeLight').classList.toggle('active',state.settings.theme==='light');
  document.getElementById('themeDark').classList.toggle('active',state.settings.theme==='dark');
  document.getElementById('currencySelect').value=state.settings.currency;
  if(state.settings.monthlyIncome)document.getElementById('incomeInput').value=state.settings.monthlyIncome;
  document.getElementById('cycleStartInput').value=state.settings.cycleStartDay||1;

  const ob = document.getElementById('openingBalInput');
  const od = document.getElementById('openingDateInput');
  const cn = document.getElementById('checkingNameInput');
  if (ob && state.settings.openingBalance !== null && state.settings.openingBalance !== undefined)
    ob.value = state.settings.openingBalance;
  if (od) od.value = state.settings.openingDate || '';
  if (cn) cn.value = state.settings.checkingName || '';
  const kt = document.getElementById('keepTargetInput');
  if (kt) kt.value = state.settings.keepTarget || '';

  const r = state.settings.budgetRhythm || 'day';
  const rd = document.getElementById('rhythmDay');
  const rw = document.getElementById('rhythmWeek');
  if (rd) rd.classList.toggle('active', r === 'day');
  if (rw) rw.classList.toggle('active', r === 'week');
  renderBankPreview();
  renderCatManageList();
  renderSyncSettings();
}

function setPeriod(p,el){
  state.analyticsPeriod=p;
  document.querySelectorAll('#page-analytics .pill').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderAnalytics();
}


/* ═══════════════════════════════════════════════
   GOOGLE SHEETS SYNC — via Apps Script
   ═══════════════════════════════════════════════ */

const GS_URL = 'https://script.google.com/macros/s/AKfycbwv5eBxrbDZONavQKmwWVIvIhMQ3QpH-1k8_s7VV6l8LmOhPvcWIqwFI0hBrDaNtWAb/exec';

const SHEET_TABS = {
  transactions: 'Transacties',
  budgets:      'Budgetten',
  goals:        'Doelen',
  savings_acc:  'Spaarrekeningen',
  savings_tx:   'SpaarmutaTies',
  categories:   'Categorieen',
  settings:     'Instellingen',
  security:     'Beveiliging',
  adventure:    'Avontuur'
};

let gsConfig = { autoSync: false };
let syncInProgress = false;

function loadGsConfig() {
  try {
    const raw = localStorage.getItem('budgetflow_gs');
    if (raw) gsConfig = { ...gsConfig, ...JSON.parse(raw) };
  } catch(e) {}
}

function saveGsConfig() {
  localStorage.setItem('budgetflow_gs', JSON.stringify(gsConfig));
}

function setAutoSync(on) {
  gsConfig.autoSync = on;
  saveGsConfig();
  const onBtn  = document.getElementById('autoSyncOn');
  const offBtn = document.getElementById('autoSyncOff');
  if (onBtn)  onBtn.classList.toggle('active',  on);
  if (offBtn) offBtn.classList.toggle('active', !on);
}

/* ── Toast ── */
function showToast(msg, type) {
  type = type || 'success';
  const colors = { success:'var(--green)', error:'var(--red)', info:'var(--accent)', warn:'var(--amber)' };
  const icons  = { success:'✓', error:'✗', info:'ℹ', warn:'⚠' };
  const t = document.createElement('div');
  t.className = 'sync-toast';
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:10px 18px;border-radius:10px;font-family:Space Grotesk,sans-serif;font-weight:600;font-size:13px;z-index:9999;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.3);color:#fff;animation:slideUp .2s ease';
  t.style.background = colors[type] || colors.info;
  t.innerHTML = '<span>' + (icons[type]||'ℹ') + '</span><span>' + msg + '</span>';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/* ── Status indicator ── */
function updateSyncStatus(status, msg) {
  const dot  = document.getElementById('syncDot');
  const text = document.getElementById('syncStatusText');
  const last = document.getElementById('syncLast');
  if (!dot) return;
  dot.className = 'sync-dot';
  if (status === 'connected') {
    dot.classList.add('connected');
    text.textContent = msg || 'Gesynchroniseerd';
    if (last) last.textContent = 'Laatste sync: ' + new Date().toLocaleTimeString('nl-NL', {hour:'2-digit',minute:'2-digit'});
  } else if (status === 'syncing') {
    dot.classList.add('syncing');
    text.textContent = msg || 'Synchroniseren...';
  } else if (status === 'error') {
    dot.classList.add('error');
    text.textContent = msg || 'Fout bij synchroniseren';
  } else {
    text.textContent = 'Klaar om te synchroniseren';
    if (last) last.textContent = '';
  }
}

/* ── Apps Script GET — via URL with callback to bypass CORS ── */
async function gsGet(tab) {
  // Apps Script GET responses include CORS headers when deployed as "anyone"
  // Use no-cors for POST, but GET works fine with regular fetch
  const url = GS_URL + '?tab=' + encodeURIComponent(tab) + '&t=' + Date.now();
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error);
    return data.values || [];
  } catch(e) {
    throw new Error('Ongeldige response van server');
  }
}

/* ── Apps Script POST — no-cors mode, then verify via GET ── */
async function gsPut(tab, values) {
  // With no-cors we can't read the response, but the write still happens
  await fetch(GS_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify({ tab, values })
  });
  // Small delay to let Apps Script process
  await new Promise(r => setTimeout(r, 400));
}

/* ══════════════════════════════════════════
   UPLOAD → SHEETS
   ══════════════════════════════════════════ */
async function syncToSheets() {
  if (syncInProgress) return;
  syncInProgress = true;
  updateSyncStatus('syncing', 'Uploaden...');

  try {
    await gsPut(SHEET_TABS.transactions, [
      ['id','type','desc','amt','date','cat','note','fromAccount','toAccount'],
      ...state.transactions.map(t=>[t.id,t.type,t.desc,t.amt,t.date,t.cat,t.note||'',t.fromAccount||'',t.toAccount||''])
    ]);

    await gsPut(SHEET_TABS.budgets, [
      ['category','limit'],
      ...Object.entries(state.budgets).map(([cat,lim])=>[cat,lim])
    ]);

    await gsPut(SHEET_TABS.goals, [
      ['id','name','target','saved','date','color'],
      ...state.goals.map(g=>[g.id,g.name,g.target,g.saved,g.date,g.color])
    ]);

    await gsPut(SHEET_TABS.savings_acc, [
      ['id','name','balance','target','color','note'],
      ...state.savings.accounts.map(a=>[a.id,a.name,a.balance,a.target||0,a.color,a.note||''])
    ]);

    await gsPut(SHEET_TABS.savings_tx, [
      ['id','accountId','type','amt','date','desc'],
      ...state.savings.transactions.map(t=>[t.id,t.accountId,t.type,t.amt,t.date,t.desc])
    ]);

    await gsPut(SHEET_TABS.categories, [
      ['name','emoji','color','deletable'],
      ...state.categories.map(c=>[c.name,c.emoji,c.color,c.deletable?'1':'0'])
    ]);

    await gsPut(SHEET_TABS.settings, [
      ['key','value'],
      ['currency',      state.settings.currency],
      ['theme',         state.settings.theme],
      ['monthlyIncome', state.settings.monthlyIncome],
      ['cycleStartDay',  state.settings.cycleStartDay || 1],
      ['userName',       state.settings.userName || ''],
      ['checkingName',   state.settings.checkingName || ''],
      ['openingBalance', state.settings.openingBalance ?? ''],
      ['openingDate',    state.settings.openingDate || ''],
      ['keepTarget',     state.settings.keepTarget || 0],
      ['budgetRhythm',   state.settings.budgetRhythm || 'day'],
      ['loggedThrough',  state.settings.loggedThrough || '']
    ]);

    // Avontuur: level, pad, stad, missie — als JSON zodat het compact blijft
    const adv = state.adventure || {};
    await gsPut(SHEET_TABS.adventure, [
      ['key','value'],
      ['xp',              adv.xp || 0],
      ['pathPosition',    adv.pathPosition || 0],
      ['pathSteps',       adv.pathSteps || 0],
      ['cityLevel',       adv.cityLevel || 0],
      ['lastCycleReport', adv.lastCycleReport || ''],
      ['currentMission',  JSON.stringify(adv.currentMission || null)],
      ['missionHistory',  JSON.stringify(adv.missionHistory || [])],
      ['stats',           JSON.stringify(adv.stats || {})]
    ]);

    updateSyncStatus('connected', 'Opgeslagen in Sheets');
    showToast('Alles opgeslagen in Google Sheets!', 'success');

  } catch(e) {
    updateSyncStatus('error', 'Upload mislukt');
    showToast('Fout: ' + e.message, 'error');
    console.error('syncToSheets:', e);
  } finally {
    syncInProgress = false;
  }
}

/* ══════════════════════════════════════════
   DOWNLOAD ← SHEETS
   ══════════════════════════════════════════ */
/* ── Debug helper: roep dit aan vanuit de browser console (F12) ──
   debugMonth('2026-05') toont exact welke transacties de app telt voor die maand,
   inclusief het 'type' veld, zodat verkeerd ingelezen rijen zichtbaar worden. */
function debugMonth(prefix) {
  const tx = state.transactions.filter(t => t.date.startsWith(prefix));
  console.log(`=== ${prefix}: ${tx.length} transacties ===`);
  let totalExpense = 0;
  tx.forEach(t => {
    if (t.type === 'expense') totalExpense += t.amt;
    console.log(`${t.date} | type="${t.type}" | ${t.desc} | €${t.amt}`);
  });
  console.log(`--- Totaal uitgaven (type==='expense'): €${totalExpense.toFixed(2)} ---`);
  return tx;
}

/* ── Debug helper voor cycli: toont EXACT dezelfde balken als de Cashflow-grafiek ──
   Roep aan via de console: debugCycles()
   Toont per balk de exacte start/eind-datum, het label, en alle transacties
   die daar volgens de huidige code in vallen. */
function debugCycles() {
  const cycles = getLastNCycles(6);
  cycles.forEach((c, idx) => {
    const startStr = dateToStr(c.start);
    const endStr = dateToStr(c.end);
    const tx = state.transactions.filter(t => c.match(t));
    const exp = tx.filter(t => t.type === 'expense').reduce((a, t) => a + t.amt, 0);
    console.log(`%c[${idx}] ${c.label} (${startStr} t/m ${endStr}) — ${tx.length} tx — uitgaven: €${exp.toFixed(2)}`, 'font-weight:bold;color:#8B7FF7');
    tx.filter(t => t.type === 'expense').forEach(t => {
      console.log(`   ${t.date} | ${t.desc} | €${t.amt}`);
    });
  });
}

async function syncFromSheets() {
  if (syncInProgress) return;
  syncInProgress = true;
  updateSyncStatus('syncing', 'Laden uit Sheets...');

  try {
    const txRows = await gsGet(SHEET_TABS.transactions);
    if (txRows.length > 1) {
      state.transactions = txRows.slice(1).filter(r=>r[0]).map(r=>({
        id:Number(r[0]), type:r[1]||'expense', desc:r[2]||'',
        amt:parseFloat(r[3])||0, date:r[4]||today(), cat:r[5]||'Overig',
        note:r[6]||'', fromAccount:r[7]||'', toAccount:r[8]||''
      }));
    }

    const budRows = await gsGet(SHEET_TABS.budgets);
    if (budRows.length > 1) {
      state.budgets = {};
      budRows.slice(1).filter(r=>r[0]).forEach(r=>{ state.budgets[r[0]]=parseFloat(r[1])||0; });
    }

    const goalRows = await gsGet(SHEET_TABS.goals);
    if (goalRows.length > 1) {
      state.goals = goalRows.slice(1).filter(r=>r[0]).map(r=>({
        id:Number(r[0]), name:r[1]||'', target:parseFloat(r[2])||0,
        saved:parseFloat(r[3])||0, date:r[4]||'', color:r[5]||'#8B7FF7'
      }));
    }

    const savAccRows = await gsGet(SHEET_TABS.savings_acc);
    if (savAccRows.length > 1) {
      state.savings.accounts = savAccRows.slice(1).filter(r=>r[0]).map(r=>({
        id:Number(r[0]), name:r[1]||'', balance:parseFloat(r[2])||0,
        target:parseFloat(r[3])||0, color:r[4]||'#2FCB8B', note:r[5]||''
      }));
    }

    const savTxRows = await gsGet(SHEET_TABS.savings_tx);
    if (savTxRows.length > 1) {
      state.savings.transactions = savTxRows.slice(1).filter(r=>r[0]).map(r=>({
        id:Number(r[0]), accountId:Number(r[1]), type:r[2]||'deposit',
        amt:parseFloat(r[3])||0, date:r[4]||today(), desc:r[5]||''
      }));
    }

    const catRows = await gsGet(SHEET_TABS.categories);
    if (catRows.length > 1) {
      state.categories = catRows.slice(1).filter(r=>r[0]).map(r=>({
        name:r[0], emoji:r[1]||'📦', color:r[2]||'#8B84AC', deletable:r[3]==='1'
      }));
    }

    const setRows = await gsGet(SHEET_TABS.settings);
    if (setRows.length > 1) {
      setRows.slice(1).forEach(r=>{
        if (r[0]==='currency')      state.settings.currency      = r[1]||'€';
        if (r[0]==='theme')         state.settings.theme         = r[1]||'dark';
        if (r[0]==='monthlyIncome') state.settings.monthlyIncome = parseFloat(r[1])||0;
        if (r[0]==='cycleStartDay') state.settings.cycleStartDay = parseInt(r[1])||1;
        if (r[0]==='userName')      state.settings.userName      = r[1]||'';
        if (r[0]==='checkingName')  state.settings.checkingName  = r[1]||'';
        if (r[0]==='openingDate')   state.settings.openingDate   = cleanDate(r[1]);
        if (r[0]==='keepTarget')    state.settings.keepTarget    = parseFloat(r[1])||0;
        if (r[0]==='budgetRhythm')  state.settings.budgetRhythm  = r[1]||'day';
        if (r[0]==='loggedThrough') state.settings.loggedThrough = cleanDate(r[1]);
        if (r[0]==='openingBalance')
          state.settings.openingBalance = (r[1]==='' || r[1]==null) ? null : parseFloat(r[1]);
      });
    }

    // Avontuur laden — zodat missie, level en pad op elk apparaat gelijk zijn
    try {
      const advRows = await gsGet(SHEET_TABS.adventure);
      if (advRows.length > 1) {
        if (!state.adventure) state.adventure = {};
        const a = state.adventure;
        advRows.slice(1).forEach(r => {
          const k = r[0], v = r[1];
          if (k === 'xp')              a.xp = parseInt(v) || 0;
          if (k === 'pathPosition')    a.pathPosition = parseInt(v) || 0;
          if (k === 'pathSteps')       a.pathSteps = parseInt(v) || 0;
          if (k === 'cityLevel')       a.cityLevel = parseInt(v) || 0;
          if (k === 'lastCycleReport') a.lastCycleReport = v || null;
          if (k === 'currentMission') {
            try { a.currentMission = v && v !== 'null' ? JSON.parse(v) : null; } catch(e) { a.currentMission = null; }
          }
          if (k === 'missionHistory') {
            try { a.missionHistory = v ? JSON.parse(v) : []; } catch(e) { a.missionHistory = []; }
          }
          if (k === 'stats') {
            try { a.stats = v ? JSON.parse(v) : { missionsCompleted:0, missionsFailed:0, streak:0, bestStreak:0 }; }
            catch(e) { a.stats = { missionsCompleted:0, missionsFailed:0, streak:0, bestStreak:0 }; }
          }
        });
      }
    } catch(e) {
      console.log('Avontuur-tab nog niet aanwezig — wordt aangemaakt bij volgende upload');
    }

    saveState(true); // skip autoSync to avoid loop
    updateSyncStatus('connected', 'Geladen uit Sheets');
    showToast('Data geladen uit Google Sheets!', 'success');

    document.documentElement.setAttribute('data-theme', state.settings.theme);
    populateCatSelect('txCat');
    populateCatSelect('budgetCat');
    updateCatFilter();
    renderDashboard();
    renderSettings();

  } catch(e) {
    updateSyncStatus('error', 'Laden mislukt');
    showToast('Fout: ' + e.message, 'error');
    console.error('syncFromSheets:', e);
  } finally {
    syncInProgress = false;
  }
}

/* ── Auto-sync after every save ── */
function autoSync() {
  if (gsConfig.autoSync) syncToSheets();
}

/* ── Render sync panel in settings ── */
function renderSyncSettings() {
  const onBtn  = document.getElementById('autoSyncOn');
  const offBtn = document.getElementById('autoSyncOff');
  if (onBtn)  onBtn.classList.toggle('active',  gsConfig.autoSync);
  if (offBtn) offBtn.classList.toggle('active', !gsConfig.autoSync);
  updateSyncStatus('idle');
}


/* ═══════════════════════════════════════════════
   WELCOME SCREEN — minimal
   ═══════════════════════════════════════════════ */
function checkFirstVisit() {
  // Naamscherm verwijderd op verzoek — niets te doen hier.
}



/* ═══════════════════════════════════════════════
   BUDGET NOTIFICATIONS
   ═══════════════════════════════════════════════ */
function checkBudgetNotifications() {
  if (!Object.keys(state.budgets).length) return;
  const tx = getCurrentMonthTx();
  const alerts = [];

  Object.entries(state.budgets).forEach(([cat, limit]) => {
    const spent = tx.filter(t=>t.type==='expense'&&t.cat===cat).reduce((a,t)=>a+t.amt,0);
    const pct = Math.round((spent/limit)*100);
    if (pct >= 100) alerts.push({ cat, pct, type:'over',  msg:`${cat}: budget overschreden (${pct}%)` });
    else if (pct >= 80) alerts.push({ cat, pct, type:'warn', msg:`${cat}: ${pct}% van budget opgebruikt` });
  });

  const container = document.getElementById('notifContainer');
  if (!container || !alerts.length) return;

  // Only show once per session
  const shownKey = 'budgetflow_notif_' + today();
  if (sessionStorage.getItem(shownKey)) return;
  sessionStorage.setItem(shownKey, '1');

  alerts.slice(0,3).forEach((a, i) => {
    setTimeout(() => {
      const n = document.createElement('div');
      n.className = 'budget-notif';
      n.style.cssText = `position:fixed;top:${20+i*70}px;right:20px;z-index:8000;background:var(--bg2);border:1px solid ${a.type==='over'?'var(--red)':'var(--amber)'};border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-size:13px;max-width:280px;animation:slideUp .3s ease`;
      n.innerHTML = `<span style="font-size:18px">${a.type==='over'?'🚨':'⚠️'}</span><span style="color:var(--text);flex:1">${a.msg}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;padding:0">×</button>`;
      document.body.appendChild(n);
      setTimeout(() => n.remove(), 6000);
    }, i * 400);
  });
}

/* ═══════════════════════════════════════════════
   RECURRING TRANSACTIONS
   ═══════════════════════════════════════════════ */
let currentRecType = 'expense';

function setRecType(type) {
  currentRecType = type;
  ['income','expense'].forEach(t => {
    const btn = document.getElementById('recTypeBtn'+t.charAt(0).toUpperCase()+t.slice(1));
    if (btn) btn.classList.toggle('active', t===type);
  });
  const catWrap = document.getElementById('recCatWrap');
  if (catWrap) catWrap.style.display = type==='expense' ? '' : 'none';
}

function saveRecurring() {
  const desc = document.getElementById('recDesc').value.trim();
  const amt  = parseFloat(document.getElementById('recAmt').value);
  const day  = parseInt(document.getElementById('recDay').value)||1;
  const cat  = currentRecType==='expense' ? document.getElementById('recCat').value : 'Inkomst';
  if (!desc||isNaN(amt)||amt<=0) return;
  if (!state.recurring) state.recurring = [];
  state.recurring.push({ id:Date.now(), type:currentRecType, desc, amt, day:Math.min(28,Math.max(1,day)), cat });
  saveState();
  closeModal();
  renderRecurring();
}

function deleteRecurring(id) {
  state.recurring = (state.recurring||[]).filter(r=>r.id!==id);
  saveState();
  renderRecurring();
}

function applyRecurring() {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  let added = 0;
  (state.recurring||[]).forEach(r => {
    const day = String(Math.min(r.day, getDaysInMonth())).padStart(2,'0');
    const date = `${monthPrefix}-${day}`;
    // Check not already added this month
    const alreadyExists = state.transactions.some(t=>t.desc===r.desc&&t.date.startsWith(monthPrefix)&&t.amt===r.amt&&t.type===r.type);
    if (!alreadyExists) {
      state.transactions.push({ id:Date.now()+Math.random(), type:r.type, desc:r.desc, amt:r.amt, date, cat:r.cat, note:'Terugkerend', fromAccount:'', toAccount:'' });
      added++;
    }
  });
  state.lastRecurringMonth = monthPrefix;
  saveState();
  renderRecurring();
  renderDashboard();
  if (added>0) showToast(`${added} terugkerende transacties toegevoegd!`, 'success');
  else showToast('Alles was al toegevoegd deze maand.', 'info');
}

function renderRecurring() {
  const list = document.getElementById('recurringList');
  const applyRow = document.getElementById('recurringApplyRow');
  const statusEl = document.getElementById('recurringMonthStatus');
  if (!list) return;

  const recurring = state.recurring||[];
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const alreadyApplied = state.lastRecurringMonth === monthPrefix;

  if (statusEl) statusEl.textContent = alreadyApplied ? '✓ Toegevoegd deze maand' : 'Nog niet toegevoegd';
  if (applyRow) applyRow.style.display = (!alreadyApplied && recurring.length) ? '' : 'none';

  if (!recurring.length) {
    list.innerHTML = '<div class="empty-state">Nog geen terugkerende transacties<br><span style="font-size:12px;color:var(--text3)">Voeg vaste lasten toe zoals huur, abonnementen of salaris</span></div>';
    return;
  }

  const totalIn  = recurring.filter(r=>r.type==='income').reduce((a,r)=>a+r.amt,0);
  const totalOut = recurring.filter(r=>r.type==='expense').reduce((a,r)=>a+r.amt,0);

  list.innerHTML = `
    <div style="display:flex;gap:16px;padding:0 0 14px;border-bottom:1px solid var(--border);margin-bottom:12px;font-size:13px">
      <span style="color:var(--text2)">Maandelijks in: <strong style="color:var(--green);font-family:'Space Grotesk',sans-serif">${fmt(totalIn)}</strong></span>
      <span style="color:var(--text2)">Maandelijks uit: <strong style="color:var(--red);font-family:'Space Grotesk',sans-serif">${fmt(totalOut)}</strong></span>
    </div>
    <table class="tx-table">
      <thead><tr><th>Omschrijving</th><th>Categorie</th><th>Dag</th><th class="right">Bedrag</th><th></th></tr></thead>
      <tbody>${recurring.map(r=>{
        const col = r.type==='income'?'var(--green)':catColor(r.cat);
        const sign = r.type==='income'?'+':'−';
        const amtCol = r.type==='income'?'var(--green)':'var(--red)';
        return `<tr>
          <td><div style="font-weight:500">${r.desc}</div><div style="font-size:11px;color:var(--text3)">Elke maand dag ${r.day}</div></td>
          <td><span class="tx-cat-badge"><span class="tx-cat-dot" style="background:${col}"></span>${r.cat}</span></td>
          <td style="color:var(--text2)">${r.day}</td>
          <td class="tx-amount-cell"><span class="tx-amount ${r.type==='income'?'income':'expense'}">${sign}${fmt(r.amt)}</span></td>
          <td><button class="tx-del-btn" onclick="deleteRecurring(${r.id})">×</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

/* ═══════════════════════════════════════════════
   MONTH COMPARISON (dashboard addition)
   ═══════════════════════════════════════════════ */
function getMonthTx(monthPrefix) {
  return state.transactions.filter(t=>t.date.startsWith(monthPrefix));
}




/* ═══════════════════════════════════════════════
   PIN / BEVEILIGING — opgeslagen in Google Sheets
   ═══════════════════════════════════════════════ */

let pinBuffer   = '';
let pinMode     = 'enter'; // 'enter' | 'setup' | 'confirm'
let pinTemp     = '';
let pinAttempts = 0;
const PIN_MAX_ATTEMPTS = 5;
const PIN_TAB = 'Beveiliging';

function hashPin(pin) {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = Math.imul(31, h) + pin.charCodeAt(i) | 0;
  }
  return h.toString(36);
}

/* ── Lees pin hash uit Sheets ── */
async function getPinFromSheet() {
  try {
    const rows = await gsGet('Beveiliging');
    if (rows.length > 1 && rows[1][0]) return rows[1][0];
  } catch(e) {}
  return null;
}

/* ── Sla pin hash op in Sheets ── */
async function savePinToSheet(hash) {
  try {
    await gsPut('Beveiliging', [['pin_hash'], [hash]]);
  } catch(e) {
    showToast('Opslaan mislukt: ' + e.message, 'error');
    throw e;
  }
}

/* ── Verwijder pin uit Sheets ── */
async function deletePinFromSheet() {
  try {
    await gsPut('Beveiliging', [['pin_hash']]);
  } catch(e) {}
}

let _pinUnlockResolve = null;

function checkPinSetup() {
  return new Promise(async (resolve) => {
    const screen = document.getElementById('pinScreen');
    if (!screen) { resolve(); return; }

    // GS_URL is hardcoded en werkt overal — geen lokale config nodig om de PIN te checken.
    // Dit is de bewuste keuze: de pincode-check moet werken op élk apparaat,
    // ook als dat apparaat zelf nooit een Sheets-verbinding heeft opgeslagen.
    let stored;
    try {
      stored = await getPinFromSheet();
    } catch(e) {
      // Sheets niet bereikbaar — uit voorzorg toch blokkeren i.p.v. doorlaten
      console.error('PIN check kon Sheets niet bereiken:', e);
      stored = '__UNREACHABLE__'; // forceer lock-out i.p.v. open laten
    }

    if (!stored) { resolve(); return; }
    if (stored === '__UNREACHABLE__') {
      // Toon een duidelijke foutmelding i.p.v. de app gewoon open te laten
      pinMode = 'enter';
      screen.style.display = 'flex';
      document.getElementById('pinSub').textContent = 'Kan beveiliging niet controleren — check je internetverbinding';
      document.getElementById('pinPad') && (document.getElementById('pinPad').style.opacity = '0.4');
      return; // resolve NIET aanroepen — app blijft op slot
    }

    // Pincode is ingesteld — toon slotscherm en wacht op correcte invoer
    pinMode = 'enter';
    pinBuffer = '';
    pinAttempts = 0;
    updatePinUI();
    screen.style.display = 'flex';
    document.getElementById('pinForgot').style.display = 'none';
    document.addEventListener('keydown', onPinKeydown);
    document.addEventListener('focusin', preventFocusUnderPin);

    // Bewaar de resolve-functie zodat handlePinComplete de wachtende init() kan vrijgeven
    _pinUnlockResolve = resolve;
  });
}

function preventFocusUnderPin() {
  const screen = document.getElementById('pinScreen');
  if (screen && screen.style.display !== 'none') {
    // Blur any focused element that's not in the pin screen
    if (document.activeElement && !screen.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }
}

function onPinKeydown(e) {
  if (document.getElementById('pinScreen').style.display === 'none') return;
  if (e.key >= '0' && e.key <= '9') pinKey(e.key);
  if (e.key === 'Backspace') pinDelete();
}

function pinKey(digit) {
  if (pinBuffer.length >= 8) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === 8) setTimeout(() => handlePinComplete(), 120);
}

function pinDelete() {
  if (pinBuffer.length > 0) { pinBuffer = pinBuffer.slice(0,-1); updatePinDots(); }
}

function updatePinDots() {
  for (let i = 0; i < 8; i++) {
    const dot = document.getElementById('dot'+i);
    if (!dot) continue;
    dot.classList.toggle('filled', i < pinBuffer.length);
    dot.classList.remove('error');
  }
}

function updatePinUI() {
  const sub = document.getElementById('pinSub');
  if (!sub) return;
  if (pinMode === 'enter')   sub.textContent = 'Voer je 8-cijferige pincode in';
  if (pinMode === 'setup')   sub.textContent = 'Kies een 8-cijferige pincode';
  if (pinMode === 'confirm') sub.textContent = 'Bevestig je pincode';
  updatePinDots();
}

async function handlePinComplete() {
  if (pinMode === 'enter') {
    document.getElementById('pinSub').textContent = 'Controleren...';
    const stored = await getPinFromSheet();
    if (hashPin(pinBuffer) === stored) {
      pinAttempts = 0;
      document.removeEventListener('keydown', onPinKeydown);
      document.removeEventListener('focusin', preventFocusUnderPin);
      const screen = document.getElementById('pinScreen');
      screen.style.transition = 'opacity 0.3s ease';
      screen.style.opacity = '0';
      setTimeout(() => { screen.style.display = 'none'; screen.style.opacity = ''; }, 300);
      // Geef de wachtende init()-functie vrij zodat de app pas nu gerenderd wordt
      if (_pinUnlockResolve) { _pinUnlockResolve(); _pinUnlockResolve = null; }
    } else {
      pinAttempts++;
      pinBuffer = '';
      shakeDots();
      if (pinAttempts >= PIN_MAX_ATTEMPTS) {
        document.getElementById('pinForgot').style.display = 'block';
        document.getElementById('pinSub').textContent = 'Te veel pogingen — wacht 30 seconden';
        setTimeout(() => {
          pinAttempts = 0;
          document.getElementById('pinSub').textContent = 'Voer je 8-cijferige pincode in';
        }, 30000);
      } else {
        document.getElementById('pinSub').textContent = `Verkeerd — nog ${PIN_MAX_ATTEMPTS - pinAttempts} poging${PIN_MAX_ATTEMPTS - pinAttempts !== 1 ? 'en' : ''}`;
      }
    }
  } else if (pinMode === 'setup') {
    pinTemp = pinBuffer;
    pinBuffer = '';
    pinMode = 'confirm';
    updatePinUI();
  } else if (pinMode === 'confirm') {
    if (pinBuffer === pinTemp) {
      document.getElementById('pinSub').textContent = 'Opslaan in Sheets...';
      try {
        await savePinToSheet(hashPin(pinBuffer));
        pinBuffer = ''; pinTemp = '';
        const screen = document.getElementById('pinScreen');
        screen.style.transition = 'opacity 0.3s ease';
        screen.style.opacity = '0';
        setTimeout(() => { screen.style.display = 'none'; screen.style.opacity = ''; }, 300);
        showToast('Pincode opgeslagen in Google Sheets!', 'success');
        document.removeEventListener('keydown', onPinKeydown);
      } catch(e) {
        pinBuffer = ''; pinTemp = '';
        pinMode = 'setup';
        updatePinUI();
      }
    } else {
      pinBuffer = ''; pinTemp = '';
      pinMode = 'setup';
      shakeDots();
      document.getElementById('pinSub').textContent = 'Komt niet overeen — probeer opnieuw';
    }
  }
}

function shakeDots() {
  const dots = document.getElementById('pinDots');
  dots.classList.remove('shake');
  void dots.offsetWidth;
  dots.classList.add('shake');
  for (let i = 0; i < 8; i++) {
    const dot = document.getElementById('dot'+i);
    if (dot) dot.classList.add('error');
  }
  setTimeout(() => { dots.classList.remove('shake'); updatePinDots(); }, 500);
}

async function pinReset() {
  // Must verify current PIN via Sheets before resetting
  pinBuffer = '';
  pinTemp = '';
  pinMode = 'enter';
  const screen = document.getElementById('pinScreen');
  screen.style.display = 'flex';
  document.getElementById('pinSub').textContent = 'Voer huidige pincode in om te resetten';
  document.getElementById('pinForgot').style.display = 'none';
  // Override handlePinComplete temporarily
  window._pinResetMode = true;
  updatePinDots();
  document.addEventListener('keydown', onPinKeydown);
}

async function setupPin() {
  const screen = document.getElementById('pinScreen');
  if (!screen) return;
  pinMode = 'setup';
  pinBuffer = ''; pinTemp = '';
  updatePinUI();
  screen.style.display = 'flex';
  document.addEventListener('keydown', onPinKeydown);
}


/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
function repairTimestampDates() {
  let repaired = 0;
  state.transactions.forEach(t => {
    if (t.date && t.date.includes('T')) {
      // Gebruik UTC-datum uit de string direct (voor 22:00 UTC = 00:00 lokaal +2 uur, dus +1 dag)
      const parts = t.date.split('T')[0];
      // Maar controleer: als de tijd 22:00 of 23:00 is, was het door tijdzone-shift een dag te vroeg
      const timeMatch = t.date.match(/T(\d{2}):/);
      const hour = timeMatch ? parseInt(timeMatch[1]) : 0;
      if (hour >= 22) {
        // Was lokaal al de volgende dag — schuif een dag op
        const d = new Date(parts + 'T12:00:00Z'); // gebruik 12:00 UTC om veilig te zijn
        d.setDate(d.getDate() + 1);
        t.date = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      } else {
        t.date = parts;
      }
      repaired++;
    }
  });
  if (repaired > 0) {
    console.log(`Gerepareerd: ${repaired} transacties met timestamp-datum omgezet naar lokale datum`);
    saveState(true); // sla op zonder autoSync te triggeren
  }
}

async function init(){
  loadState();
  if(!state.recurring) state.recurring=[];
  if(!state.adventure) state.adventure = {
    xp: 0, pathPosition: 0, pathSteps: 0, cityLevel: 0, unlockedBadges: [],
    currentMission: null, missionHistory: [], lastCycleReport: null,
    stats: { missionsCompleted: 0, missionsFailed: 0, streak: 0, bestStreak: 0 }
  };
  if(state.adventure.pathSteps === undefined) state.adventure.pathSteps = 0;
  if(!state.adventure.stats) state.adventure.stats = { missionsCompleted:0, missionsFailed:0, streak:0, bestStreak:0 };
  if(!state.adventure.missionHistory) state.adventure.missionHistory = [];
  // Repareer eventuele datums die als ISO timestamp zijn opgeslagen (met T en tijdzone)
  // Dit was veroorzaakt door de toISOString()-bug die inmiddels is opgelost
  repairTimestampDates();
  // Instellingen-datums kunnen ook vervuild zijn geraakt via Sheets
  state.settings.openingDate   = cleanDate(state.settings.openingDate);
  state.settings.loggedThrough = cleanDate(state.settings.loggedThrough);
  document.documentElement.setAttribute('data-theme',state.settings.theme);

  // KRITIEK: app-inhoud blijft verborgen tot de PIN-check is afgerond.
  // Dit voorkomt dat iemand het dashboard heel even ziet voordat het slotscherm verschijnt.
  document.body.classList.add('app-locked');

  await checkPinSetup(); // wacht tot dit klaar is — toont evt. het PIN-scherm en blokkeert verder

  document.querySelectorAll('.currency-symbol').forEach(el=>el.textContent=state.settings.currency);
  const txDateEl=document.getElementById('txDate');
  if(txDateEl)txDateEl.value=today();
  document.getElementById('sidebarMonth').textContent=monthName(new Date());
  populateCatSelect('txCat');
  populateCatSelect('budgetCat');
  populateCatSelect('recCat');
  updateCatFilter();
  renderDashboard();
  checkFirstVisit();
  initAutoCategory();

  document.body.classList.remove('app-locked');

  setTimeout(()=>checkBudgetNotifications(), 1500);

  // Avontuur: zorg dat er een missie loopt, evalueer afgelopen week, toon cyclusrapport
  if (typeof ensureMission === 'function') {
    ensureMission();
    if (typeof renderHUD === 'function') renderHUD();
  if (typeof renderPlayer === 'function') renderPlayer();
    if (typeof checkCycleReport === 'function') checkCycleReport();
  }

  if(!state.firstVisit && gsConfig.apiKey) {
    setTimeout(()=>syncFromSheets(), 1000);
  }
}

document.addEventListener('DOMContentLoaded',init);
