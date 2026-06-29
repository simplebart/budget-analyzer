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
    { name:'Wonen',          emoji:'🏠', color:'#6c8aff', deletable:false },
    { name:'Boodschappen',   emoji:'🛒', color:'#34d48a', deletable:false },
    { name:'Transport',      emoji:'🚌', color:'#ffb340', deletable:false },
    { name:'Eten & Drinken', emoji:'🍽', color:'#ff5e6c', deletable:false },
    { name:'Gezondheid',     emoji:'💊', color:'#a78bfa', deletable:false },
    { name:'Vrije tijd',     emoji:'🎮', color:'#f472b6', deletable:false },
    { name:'Abonnementen',   emoji:'📱', color:'#fb923c', deletable:false },
    { name:'Kleding',        emoji:'👕', color:'#22d3ee', deletable:false },
    { name:'Sparen',         emoji:'💰', color:'#4ade80', deletable:false },
    { name:'Overig',         emoji:'📦', color:'#94a3b8', deletable:false },
  ],
  settings: { currency:'€', theme:'dark', monthlyIncome:0 },
  filters: { type:'all', cat:'all', sort:'date-desc', search:'' },
  analyticsPeriod: 'month',
  selectedGoalColor: '#6c8aff'
};

let charts = {};

// CSV state
let csvParsed = { headers:[], rows:[], mapping:{}, finalRows:[] };
let csvStep = 1;
let selectedBank = 'auto';

const GOAL_COLORS = ['#6c8aff','#34d48a','#ffb340','#ff5e6c','#a78bfa','#f472b6','#fb923c','#22d3ee'];
const SAVINGS_COLORS = ['#34d48a','#6c8aff','#ffb340','#f472b6','#a78bfa','#22d3ee','#fb923c','#ff5e6c'];

/* ═══════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════ */
const fmt = n => state.settings.currency + Math.abs(Math.round(n * 100) / 100).toLocaleString('nl-NL', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtSigned = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const today = () => new Date().toISOString().split('T')[0];
const getDayOfMonth = () => new Date().getDate();
const getDaysInMonth = () => new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
const monthName = d => d.toLocaleDateString('nl-NL', { month:'long', year:'numeric' });
const catColor = name => (state.categories.find(c=>c.name===name)||{color:'#94a3b8'}).color;
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
};

function navigate(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  const navBtn = document.querySelector(`[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page]||page;
  if (window.innerWidth <= 900) closeSidebar();
  if (page==='dashboard')    renderDashboard();
  if (page==='transactions') renderTransactions();
  if (page==='analytics')    renderAnalytics();
  if (page==='budget')       renderBudgets();
  if (page==='goals')        renderGoals();
  if (page==='savings')      renderSavings();
  if (page==='settings')     renderSettings();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function closeSidebar()   { document.getElementById('sidebar').classList.remove('open'); }

/* ═══════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════ */
function openModal(id) {
  document.getElementById('modalBackdrop').classList.add('open');
  document.getElementById('modal-'+id).classList.add('open');
  if (id==='addTransaction') {
    document.getElementById('txDate').value = today();
    populateCatSelect('txCat');
    setTimeout(()=>document.getElementById('txDesc').focus(), 50);
  }
  if (id==='addBudget') populateCatSelect('budgetCat');
  if (id==='addGoal') {
    renderGoalColorPicker();
    const d=new Date(); d.setFullYear(d.getFullYear()+1);
    document.getElementById('goalDate').value = d.toISOString().split('T')[0];
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

function setTxType(type) {
  currentTxType = type;
  ['income','expense','transfer'].forEach(t => {
    const btn = document.getElementById('typeBtn'+t.charAt(0).toUpperCase()+t.slice(1));
    if (btn) btn.classList.toggle('active', t===type);
  });
  document.getElementById('catGroupWrap').style.display = type==='expense' ? '' : 'none';
  document.getElementById('transferAccountsWrap').style.display = type==='transfer' ? '' : 'none';
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
  state.transactions.push({ id:Date.now(), type:currentTxType, desc, amt, date, cat, note, fromAccount, toAccount });
  saveState();
  closeModal();
  renderDashboard();
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
      <button class="cat-manage-del" onclick="deleteCategory('${c.name}')" ${!c.deletable?'disabled title="Standaard"':''}>×</button>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════
   FILTERS
   ═══════════════════════════════════════════════ */
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
let selectedSavingsColor = '#34d48a';

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
  if (totalPct) totalPct.textContent = overallPct!==null ? overallPct+'%' : '—';

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
      const monthlyTxs = state.savings.transactions.filter(t=>t.accountId===acc.id&&t.date.startsWith(new Date().toISOString().slice(0,7)));
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
          <span style="color:${monthNet>=0?'var(--green)':'var(--red)'};font-weight:600">${monthNet>=0?'+':''}${fmt(monthNet)}</span>
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
          const accColor = acc?acc.color:'#94a3b8';
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

  // Build 6-month running balance per account
  const months = [];
  for (let i=5;i>=0;i--) { const d=new Date(); d.setMonth(d.getMonth()-i); months.push({ prefix:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label:d.toLocaleDateString('nl-NL',{month:'short'}) }); }

  const { grid, text } = chartColors();

  // Total balance trend (simulated by adding up all deposits - withdrawals up to each month end)
  const datasets = accs.map(acc=>{
    const data = months.map(m=>{
      const txsUpTo = state.savings.transactions.filter(t=>t.accountId===acc.id&&t.date<=m.prefix+'-31');
      const bal = txsUpTo.reduce((sum,t)=>sum+(t.type==='withdrawal'?-t.amt:t.amt),0);
      return Math.round(bal*100)/100;
    });
    return { label:acc.name, data, borderColor:acc.color, backgroundColor:acc.color+'22', tension:0.4, fill:true, pointRadius:4, pointBackgroundColor:acc.color };
  });

  charts.savings = new Chart(ctx.getContext('2d'),{
    type:'line',
    data:{ labels:months.map(m=>m.label), datasets },
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
function loadDemoData() {
  const now=new Date(), y=now.getFullYear(), m=String(now.getMonth()+1).padStart(2,'0');
  const pm=String(now.getMonth()||12).padStart(2,'0'), py=now.getMonth()===0?y-1:y;
  state.transactions=[
    {id:1, type:'income',  desc:'Salaris',           amt:2850,date:`${y}-${m}-01`,cat:'Inkomst',      note:'',fromAccount:'',toAccount:''},
    {id:2, type:'income',  desc:'Freelance project', amt:450, date:`${y}-${m}-05`,cat:'Inkomst',      note:'Webdesign',fromAccount:'',toAccount:''},
    {id:3, type:'expense', desc:'Huur',               amt:950, date:`${y}-${m}-01`,cat:'Wonen',        note:'',fromAccount:'',toAccount:''},
    {id:4, type:'expense', desc:'Albert Heijn',       amt:94,  date:`${y}-${m}-03`,cat:'Boodschappen', note:'',fromAccount:'',toAccount:''},
    {id:5, type:'expense', desc:'NS Maandkaart',      amt:110, date:`${y}-${m}-01`,cat:'Transport',    note:'',fromAccount:'',toAccount:''},
    {id:6, type:'expense', desc:'Netflix',            amt:13,  date:`${y}-${m}-02`,cat:'Abonnementen', note:'',fromAccount:'',toAccount:''},
    {id:7, type:'expense', desc:'Spotify',            amt:10,  date:`${y}-${m}-02`,cat:'Abonnementen', note:'',fromAccount:'',toAccount:''},
    {id:8, type:'expense', desc:'Gym abonnement',     amt:35,  date:`${y}-${m}-01`,cat:'Gezondheid',   note:'',fromAccount:'',toAccount:''},
    {id:9, type:'expense', desc:'Restaurant',         amt:67,  date:`${y}-${m}-08`,cat:'Eten & Drinken',note:'Diner',fromAccount:'',toAccount:''},
    {id:10,type:'expense', desc:'Jumbo',              amt:78,  date:`${y}-${m}-10`,cat:'Boodschappen', note:'',fromAccount:'',toAccount:''},
    {id:11,type:'expense', desc:'Energie rekening',   amt:85,  date:`${y}-${m}-04`,cat:'Wonen',        note:'',fromAccount:'',toAccount:''},
    {id:12,type:'expense', desc:'Kleding',            amt:89,  date:`${y}-${m}-14`,cat:'Kleding',      note:'',fromAccount:'',toAccount:''},
    {id:13,type:'transfer',desc:'Naar spaarrekening', amt:300, date:`${y}-${m}-01`,cat:'Transfer',     note:'Maandelijks',fromAccount:'Betaalrekening',toAccount:'Spaarrekening'},
    {id:14,type:'income',  desc:'Salaris',            amt:2850,date:`${py}-${pm}-01`,cat:'Inkomst',    note:'',fromAccount:'',toAccount:''},
    {id:15,type:'expense', desc:'Huur',               amt:950, date:`${py}-${pm}-01`,cat:'Wonen',      note:'',fromAccount:'',toAccount:''},
    {id:16,type:'expense', desc:'Boodschappen',       amt:155, date:`${py}-${pm}-05`,cat:'Boodschappen',note:'',fromAccount:'',toAccount:''},
    {id:17,type:'transfer',desc:'Sparen',             amt:250, date:`${py}-${pm}-01`,cat:'Transfer',   note:'',fromAccount:'Betaalrekening',toAccount:'Spaarrekening'},
  ];
  state.savings = {
    accounts:[
      {id:101,name:'Noodfonds',      balance:4250, target:5000, color:'#34d48a', note:'6 maanden kosten'},
      {id:102,name:'Vakantie Japan', balance:1800, target:3000, color:'#6c8aff', note:'Gepland zomer 2027'},
      {id:103,name:'Vrij sparen',    balance:620,  target:0,    color:'#ffb340', note:''},
    ],
    transactions:[
      {id:201,accountId:101,type:'deposit',   amt:300,date:`${y}-${m}-01`,  desc:'Maandelijkse storting'},
      {id:202,accountId:102,type:'deposit',   amt:200,date:`${y}-${m}-01`,  desc:'Vakantie sparen'},
      {id:203,accountId:103,type:'deposit',   amt:100,date:`${y}-${m}-01`,  desc:'Overig'},
      {id:204,accountId:101,type:'interest',  amt:3.5,date:`${y}-${m}-01`,  desc:'Rente'},
      {id:205,accountId:101,type:'deposit',   amt:300,date:`${py}-${pm}-01`,desc:'Maandelijkse storting'},
      {id:206,accountId:102,type:'deposit',   amt:200,date:`${py}-${pm}-01`,desc:'Vakantie sparen'},
    ]
  };
  state.budgets={'Wonen':1100,'Boodschappen':200,'Transport':130,'Eten & Drinken':150,'Vrije tijd':100,'Abonnementen':80,'Gezondheid':100};
  state.goals=[
    {id:1,name:'Vakantie Japan',target:3000,saved:1200,date:`${y+1}-06-01`,color:'#6c8aff'},
    {id:2,name:'Noodfonds',     target:5000,saved:2750,date:`${y+1}-12-31`,color:'#34d48a'},
    {id:3,name:'Nieuwe laptop', target:1500,saved:600, date:`${y}-10-01`,  color:'#ffb340'},
  ];
  saveState(); navigate('dashboard');
}

/* ═══════════════════════════════════════════════
   COMPUTE METRICS
   ═══════════════════════════════════════════════ */
function getCurrentMonthTx() {
  const prefix=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  return state.transactions.filter(t=>t.date.startsWith(prefix));
}

function computeMetrics() {
  const tx=getCurrentMonthTx();
  const income  =tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const expense =tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const transfer=tx.filter(t=>t.type==='transfer').reduce((a,t)=>a+t.amt,0);
  const balance =income-expense;
  const cats={};
  tx.filter(t=>t.type==='expense').forEach(t=>{cats[t.cat]=(cats[t.cat]||0)+t.amt;});
  const burnDaily=getDayOfMonth()>0?expense/getDayOfMonth():0;
  const projected=burnDaily*getDaysInMonth();
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
   RENDER DASHBOARD
   ═══════════════════════════════════════════════ */
function renderDashboard(){
  const now=new Date();
  document.getElementById('dashSub').textContent=monthName(now);
  document.getElementById('sidebarMonth').textContent=monthName(now);
  const{income,expense,transfer,balance,cats,burnDaily,projected,score,breakdown}=computeMetrics();
  const transCount=getCurrentMonthTx().filter(t=>t.type==='transfer').length;

  document.getElementById('kpiIncome').textContent=fmt(income);
  document.getElementById('kpiExpense').textContent=fmt(expense);
  document.getElementById('kpiTransfer').textContent=fmt(transfer);
  document.getElementById('kpiTransferSub').textContent=transCount+' transfer'+(transCount!==1?'s':'');
  document.getElementById('kpiBalance').textContent=fmt(Math.abs(balance));
  document.getElementById('kpiBalance').style.color=balance>=0?'var(--green)':'var(--red)';
  document.getElementById('kpiBalSub').textContent=income>0?Math.round((balance/income)*100)+'% van inkomsten':'van inkomsten';
  document.getElementById('kpiExpenseBar').style.width=income>0?Math.min(100,(expense/income)*100)+'%':'0%';
  document.getElementById('kpiScore').textContent=income>0?score:'—';
  document.getElementById('kpiScoreLabel').textContent=score>=80?'Uitstekend':score>=60?'Goed':score>=40?'Matig':income>0?'Aandacht':'Voeg data toe';

  renderCashflowChart();
  renderDonutChart(cats);

  const arc=document.getElementById('healthRing');
  arc.style.strokeDashoffset=301.6-(301.6*score/100);
  arc.style.stroke=score>=70?'var(--green)':score>=40?'var(--amber)':'var(--red)';
  document.getElementById('healthScore').textContent=score;
  document.getElementById('healthBreakdown').innerHTML=breakdown.map(b=>{
    const pct=Math.round((b.pts/b.max)*100);
    const col=pct>=70?'var(--green)':pct>=40?'var(--amber)':'var(--red)';
    return `<div class="health-item"><span class="health-item-name">${b.name}</span><span class="health-item-pts" style="color:${col}">${b.pts}/${b.max}</span></div>`;
  }).join('')||'<div class="empty-state" style="padding:8px;font-size:12px">Voeg data toe</div>';

  const recent=[...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  document.getElementById('recentTxList').innerHTML=recent.length?recent.map(t=>{
    const col=t.type==='income'?'var(--green)':t.type==='transfer'?'var(--purple)':catColor(t.cat);
    const amtCol=t.type==='income'?'var(--green)':t.type==='transfer'?'var(--purple)':'var(--red)';
    const sign=t.type==='income'?'+':t.type==='transfer'?'⇄':'−';
    return `<div class="tx-mini-row">
      <span class="tx-mini-dot" style="background:${col}"></span>
      <span class="tx-mini-name">${t.desc}</span>
      <span class="tx-mini-cat">${t.cat}</span>
      <span class="tx-mini-amt" style="color:${amtCol}">${sign}${fmt(t.amt)}</span>
    </div>`;
  }).join(''):'<div class="empty-state">Nog geen transacties</div>';

  document.getElementById('burnDaily').textContent=fmt(burnDaily);
  document.getElementById('burnWeekly').textContent=fmt(burnDaily*7);
  document.getElementById('burnProjected').textContent=fmt(projected);
  const day=getDayOfMonth(),dim=getDaysInMonth();
  document.getElementById('projFill').style.width=income>0?Math.min(100,Math.round((projected/income)*100))+'%':'0%';
  document.getElementById('projMarker').style.left=Math.round((day/dim)*100)+'%';
  document.getElementById('projCurrent').textContent=fmt(expense);
  document.getElementById('projEnd').textContent=fmt(projected);
  document.getElementById('txPageSub').textContent=state.transactions.length+' transacties in totaal';
}

/* ═══════════════════════════════════════════════
   CHARTS HELPERS
   ═══════════════════════════════════════════════ */
function chartColors(){
  return{
    grid:state.settings.theme==='light'?'rgba(0,0,0,0.05)':'rgba(255,255,255,0.05)',
    text:state.settings.theme==='light'?'#9090a8':'#5a5a72'
  };
}

function renderCashflowChart(){
  const{grid,text}=chartColors();
  const months=[],incD=[],expD=[],traD=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const prefix=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;months.push(d.toLocaleDateString('nl-NL',{month:'short'}));const tx=state.transactions.filter(t=>t.date.startsWith(prefix));incD.push(Math.round(tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0)));expD.push(Math.round(tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0)));traD.push(Math.round(tx.filter(t=>t.type==='transfer').reduce((a,t)=>a+t.amt,0)));}
  const ctx=document.getElementById('cashflowChart').getContext('2d');
  if(charts.cashflow)charts.cashflow.destroy();
  charts.cashflow=new Chart(ctx,{type:'bar',data:{labels:months,datasets:[{label:'Inkomsten',data:incD,backgroundColor:'rgba(52,212,138,0.75)',borderRadius:4,borderSkipped:false},{label:'Uitgaven',data:expD,backgroundColor:'rgba(255,94,108,0.75)',borderRadius:4,borderSkipped:false},{label:'Transfers',data:traD,backgroundColor:'rgba(167,139,250,0.65)',borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});
  document.getElementById('cashflowLegend').innerHTML=[{label:'Inkomsten',color:'#34d48a'},{label:'Uitgaven',color:'#ff5e6c'},{label:'Transfers',color:'#a78bfa'}].map(l=>`<span class="legend-item"><span class="legend-dot" style="background:${l.color}"></span>${l.label}</span>`).join('');
}

function renderDonutChart(cats){
  const entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const total=entries.reduce((a,[,v])=>a+v,0);
  document.getElementById('donutTotal').textContent=fmt(total);
  const ctx=document.getElementById('donutChart').getContext('2d');
  if(charts.donut)charts.donut.destroy();
  if(!entries.length){document.getElementById('donutLegend').innerHTML='<div style="font-size:12px;color:var(--text3);text-align:center">Geen uitgaven</div>';return;}
  charts.donut=new Chart(ctx,{type:'doughnut',data:{labels:entries.map(([k])=>k),datasets:[{data:entries.map(([,v])=>Math.round(v)),backgroundColor:entries.map(([k])=>catColor(k)),borderWidth:2,borderColor:state.settings.theme==='light'?'#ffffff':'#16161d',hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:true,cutout:'68%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+state.settings.currency+c.raw.toLocaleString('nl-NL')+' ('+Math.round(c.raw/total*100)+'%)'}}}}});
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
    return `<tr><td><div style="font-weight:500">${t.desc}</div>${sub}</td><td><span class="tx-cat-badge"><span class="tx-cat-dot" style="background:${col}"></span>${t.cat}</span></td><td class="tx-date-cell">${dateStr}</td><td class="tx-amount-cell"><span class="tx-amount ${amtClass}">${sign}${fmt(t.amt)}</span></td><td class="tx-actions"><button class="tx-del-btn" onclick="deleteTx(${t.id})">×</button></td></tr>`;
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
  const nM=state.analyticsPeriod==='year'?12:6;
  const periods=[];
  for(let i=nM-1;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);periods.push({prefix:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleDateString('nl-NL',{month:'short'})});}
  const labels=periods.map(p=>p.label);
  const incArr=periods.map(p=>Math.round(state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='income').reduce((a,t)=>a+t.amt,0)));
  const expArr=periods.map(p=>Math.round(state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='expense').reduce((a,t)=>a+t.amt,0)));
  const ctx1=document.getElementById('incExpChart').getContext('2d');
  if(charts.incExp)charts.incExp.destroy();
  charts.incExp=new Chart(ctx1,{type:'line',data:{labels,datasets:[{label:'Inkomsten',data:incArr,borderColor:'#34d48a',backgroundColor:'rgba(52,212,138,0.08)',tension:0.4,fill:true,pointRadius:4,pointBackgroundColor:'#34d48a'},{label:'Uitgaven',data:expArr,borderColor:'#ff5e6c',backgroundColor:'rgba(255,94,108,0.08)',tension:0.4,fill:true,pointRadius:4,pointBackgroundColor:'#ff5e6c'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});
  document.getElementById('incExpLegend').innerHTML=[{label:'Inkomsten',color:'#34d48a'},{label:'Uitgaven',color:'#ff5e6c'}].map(l=>`<span class="legend-item"><span class="legend-dot" style="background:${l.color}"></span>${l.label}</span>`).join('');
  const topCats=Object.entries(state.transactions.filter(t=>t.type==='expense').reduce((a,t)=>{a[t.cat]=(a[t.cat]||0)+t.amt;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k])=>k);
  const ctx2=document.getElementById('catTrendChart').getContext('2d');
  if(charts.catTrend)charts.catTrend.destroy();
  charts.catTrend=new Chart(ctx2,{type:'line',data:{labels,datasets:topCats.map(cat=>({label:cat,data:periods.map(p=>Math.round(state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='expense'&&t.cat===cat).reduce((a,t)=>a+t.amt,0))),borderColor:catColor(cat),backgroundColor:'transparent',tension:0.4,pointRadius:3}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+': '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});
  const savRates=periods.map(p=>{const inc=state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='income').reduce((a,t)=>a+t.amt,0);const exp=state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='expense').reduce((a,t)=>a+t.amt,0);return inc>0?Math.round(((inc-exp)/inc)*100):0;});
  const ctx3=document.getElementById('savingsRateChart').getContext('2d');
  if(charts.savRate)charts.savRate.destroy();
  charts.savRate=new Chart(ctx3,{type:'bar',data:{labels,datasets:[{data:savRates,backgroundColor:savRates.map(v=>v>=20?'rgba(52,212,138,0.75)':v>=0?'rgba(255,179,64,0.75)':'rgba(255,94,108,0.75)'),borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.raw+'%'}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>v+'%'}}}}});
  const wd=new Array(7).fill(0),wc=new Array(7).fill(0);
  state.transactions.filter(t=>t.type==='expense').forEach(t=>{const d=(new Date(t.date).getDay()+6)%7;wd[d]+=t.amt;wc[d]++;});
  const wAvg=wd.map((s,i)=>wc[i]>0?Math.round(s/wc[i]):0);
  const ctx4=document.getElementById('weekdayChart').getContext('2d');
  if(charts.weekday)charts.weekday.destroy();
  charts.weekday=new Chart(ctx4,{type:'bar',data:{labels:['Ma','Di','Wo','Do','Vr','Za','Zo'],datasets:[{data:wAvg,backgroundColor:'rgba(108,138,255,0.7)',borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' gem. '+state.settings.currency+c.raw.toLocaleString('nl-NL')}}},scales:{x:{grid:{display:false},ticks:{color:text,font:{size:11}}},y:{grid:{color:grid},ticks:{color:text,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}}}});
  renderInsights();
}

function renderInsights(){
  const{income,expense,balance,cats,burnDaily,projected}=computeMetrics();
  const ins=[];
  if(income>0){
    const sp=Math.round((balance/income)*100);
    if(sp>=20)ins.push({type:'good',icon:'💚',title:'Spaardoel gehaald',body:`Je spaart ${sp}% van je inkomsten — boven de aanbevolen 20%.`});
    else if(sp<0)ins.push({type:'bad',icon:'🚨',title:'Budget overschreden',body:`Je hebt ${fmt(Math.abs(balance))} meer uitgegeven dan je hebt verdiend.`});
    else ins.push({type:'warn',icon:'⚠️',title:'Spaarquote laag',body:`Je spaart ${sp}% — probeer 20% (${fmt(income*0.2)}/maand).`});
    const hp=Math.round(((cats['Wonen']||0)/income)*100);
    if(hp>40)ins.push({type:'warn',icon:'🏠',title:'Hoge woonlasten',body:`Wonen is ${hp}% van inkomen. Max. advies: 30-35%.`});
    const subs=cats['Abonnementen']||0;
    if(subs>0)ins.push({type:'info',icon:'📱',title:'Abonnementen',body:`${fmt(subs)}/maand. Check regelmatig welke je gebruikt.`});
    if(projected>income)ins.push({type:'bad',icon:'📈',title:'Burn rate te hoog',body:`Projectie ${fmt(projected)} > inkomen ${fmt(income)}.`});
    else ins.push({type:'good',icon:'📉',title:'Burn rate gezond',body:`Projectie ${fmt(projected)} blijft onder inkomen.`});
    const bc=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
    if(bc)ins.push({type:'info',icon:'📊',title:'Grootste categorie',body:`${bc[0]}: ${fmt(bc[1])} (${Math.round(bc[1]/expense*100)}%).`});
    const savTotal=state.savings.accounts.reduce((a,acc)=>a+acc.balance,0);
    if(savTotal>0)ins.push({type:'good',icon:'🏦',title:'Totaal gespaard',body:`Je hebt ${fmt(savTotal)} op je spaarrekening(en) staan.`});
  }else{ins.push({type:'info',icon:'💡',title:'Voeg inkomsten toe',body:'Voeg je maandinkomen toe om inzichten te genereren.'});}
  document.getElementById('insightsGrid').innerHTML=ins.map(i=>`<div class="insight-tile ${i.type}"><div class="insight-icon">${i.icon}</div><div class="insight-title">${i.title}</div><div class="insight-body">${i.body}</div></div>`).join('');
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
    const over=spent>limit,warn=pct>=80&&!over;
    const col=catColor(cat);
    const barCol=over?'var(--red)':warn?'var(--amber)':col;
    const rem=limit-spent;
    return `<div class="budget-card"><div class="budget-card-header"><div class="budget-cat-name"><span class="budget-cat-dot" style="background:${col}"></span>${catEmoji(cat)} ${cat}</div><div style="display:flex;gap:8px;align-items:center"><span class="budget-pct-badge ${over?'over':warn?'warn':'ok'}">${pct}%</span><button class="budget-del-btn" onclick="deleteBudget('${cat}')">×</button></div></div><div class="budget-spent">${fmt(spent)}</div><div class="budget-amounts"><span>van ${fmt(limit)} budget</span><span style="color:${over?'var(--red)':rem<limit*0.2?'var(--amber)':'var(--green)'}">${over?'−'+fmt(Math.abs(rem))+' over':fmt(rem)+' resterend'}</span></div><div class="budget-bar-track"><div class="budget-bar-fill" style="width:${pct}%;background:${barCol}"></div></div></div>`;
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
  settings:     'Instellingen'
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
      ['currency',     state.settings.currency],
      ['theme',        state.settings.theme],
      ['monthlyIncome',state.settings.monthlyIncome]
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
        saved:parseFloat(r[3])||0, date:r[4]||'', color:r[5]||'#6c8aff'
      }));
    }

    const savAccRows = await gsGet(SHEET_TABS.savings_acc);
    if (savAccRows.length > 1) {
      state.savings.accounts = savAccRows.slice(1).filter(r=>r[0]).map(r=>({
        id:Number(r[0]), name:r[1]||'', balance:parseFloat(r[2])||0,
        target:parseFloat(r[3])||0, color:r[4]||'#34d48a', note:r[5]||''
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
        name:r[0], emoji:r[1]||'📦', color:r[2]||'#94a3b8', deletable:r[3]==='1'
      }));
    }

    const setRows = await gsGet(SHEET_TABS.settings);
    if (setRows.length > 1) {
      setRows.slice(1).forEach(r=>{
        if (r[0]==='currency')      state.settings.currency      = r[1]||'€';
        if (r[0]==='theme')         state.settings.theme         = r[1]||'dark';
        if (r[0]==='monthlyIncome') state.settings.monthlyIncome = parseFloat(r[1])||0;
      });
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
   INIT
   ═══════════════════════════════════════════════ */
function init(){
  loadState();
  document.documentElement.setAttribute('data-theme',state.settings.theme);
  document.querySelectorAll('.currency-symbol').forEach(el=>el.textContent=state.settings.currency);
  const txDateEl=document.getElementById('txDate');
  if(txDateEl)txDateEl.value=today();
  document.getElementById('sidebarMonth').textContent=monthName(new Date());
  populateCatSelect('txCat');
  populateCatSelect('budgetCat');
  updateCatFilter();
  renderDashboard();
}

document.addEventListener('DOMContentLoaded',init);
