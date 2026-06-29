/* ═══════════════════════════════════════════════
   BUDGETFLOW — APP.JS
   Complete application logic
   ═══════════════════════════════════════════════ */

'use strict';

/* ─── STATE ─── */
let state = {
  transactions: [],
  budgets: {},
  goals: [],
  settings: {
    currency: '€',
    theme: 'dark',
    monthlyIncome: 0
  },
  filters: { type: 'all', cat: 'all', sort: 'date-desc', search: '' },
  analyticsPeriod: 'month',
  selectedGoalColor: '#6c8aff'
};

/* ─── CHART INSTANCES ─── */
let charts = {};

/* ─── CATEGORY CONFIG ─── */
const CAT_COLORS = {
  'Wonen':         '#6c8aff',
  'Boodschappen':  '#34d48a',
  'Transport':     '#ffb340',
  'Eten & Drinken':'#ff5e6c',
  'Gezondheid':    '#a78bfa',
  'Vrije tijd':    '#f472b6',
  'Abonnementen':  '#fb923c',
  'Kleding':       '#22d3ee',
  'Sparen':        '#4ade80',
  'Overig':        '#94a3b8'
};

const GOAL_COLORS = ['#6c8aff','#34d48a','#ffb340','#ff5e6c','#a78bfa','#f472b6','#fb923c','#22d3ee'];

/* ─── UTILS ─── */
const fmt = (n) => {
  const sym = state.settings.currency;
  const abs = Math.abs(Math.round(n));
  return sym + abs.toLocaleString('nl-NL');
};

const fmtSigned = (n) => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));

const today = () => new Date().toISOString().split('T')[0];

const getDayOfMonth = () => new Date().getDate();
const getDaysInMonth = () => new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();

const monthName = (d) => d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

/* ─── PERSISTENCE ─── */
function saveState() {
  try { localStorage.setItem('budgetflow_v2', JSON.stringify(state)); } catch(e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('budgetflow_v2');
    if (raw) {
      const saved = JSON.parse(raw);
      state = { ...state, ...saved };
    }
  } catch(e) {}
}

/* ─── NAVIGATION ─── */
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transacties',
  analytics: 'Analytics',
  budget: 'Budgetten',
  goals: 'Doelen',
  settings: 'Instellingen'
};

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page];

  if (window.innerWidth <= 900) closeSidebar();

  if (page === 'dashboard') renderDashboard();
  if (page === 'transactions') renderTransactions();
  if (page === 'analytics') renderAnalytics();
  if (page === 'budget') renderBudgets();
  if (page === 'goals') renderGoals();
  if (page === 'settings') renderSettings();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

/* ─── MODAL ─── */
function openModal(id) {
  document.getElementById('modalBackdrop').classList.add('open');
  document.getElementById('modal-' + id).classList.add('open');

  if (id === 'addTransaction') {
    document.getElementById('txDate').value = today();
    document.getElementById('txDesc').focus();
  }
  if (id === 'addGoal') {
    renderGoalColorPicker();
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    document.getElementById('goalDate').value = d.toISOString().split('T')[0];
  }
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
  ['txDesc','txAmount','txNote','budgetLimit','goalName','goalTarget','goalSaved'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/* ─── TRANSACTION FORM ─── */
let currentTxType = 'income';

function setTxType(type) {
  currentTxType = type;
  document.getElementById('typeBtnIncome').classList.toggle('active', type === 'income');
  document.getElementById('typeBtnExpense').classList.toggle('active', type === 'expense');
  document.getElementById('catGroupWrap').style.display = type === 'income' ? 'none' : '';
}

function saveTx() {
  const desc = document.getElementById('txDesc').value.trim();
  const amt = parseFloat(document.getElementById('txAmount').value);
  const date = document.getElementById('txDate').value || today();
  const cat = currentTxType === 'income' ? 'Inkomst' : document.getElementById('txCat').value;
  const note = document.getElementById('txNote').value.trim();

  if (!desc || !amt || amt <= 0) {
    document.getElementById('txDesc').focus();
    return;
  }

  state.transactions.push({ id: Date.now(), type: currentTxType, desc, amt, date, cat, note });
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

/* ─── FILTERS ─── */
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
  if (state.filters.type !== 'all') tx = tx.filter(t => t.type === state.filters.type);
  if (state.filters.cat !== 'all') tx = tx.filter(t => t.cat === state.filters.cat);
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    tx = tx.filter(t => t.desc.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q));
  }
  switch(state.filters.sort) {
    case 'date-asc': tx.sort((a,b) => a.date.localeCompare(b.date)); break;
    case 'date-desc': tx.sort((a,b) => b.date.localeCompare(a.date)); break;
    case 'amt-desc': tx.sort((a,b) => b.amt - a.amt); break;
    case 'amt-asc': tx.sort((a,b) => a.amt - b.amt); break;
  }
  return tx;
}

function updateCatFilter() {
  const sel = document.getElementById('catFilter');
  const cats = [...new Set(state.transactions.map(t => t.cat))].sort();
  sel.innerHTML = '<option value="all">Alle categorieën</option>';
  cats.forEach(c => { sel.innerHTML += `<option value="${c}">${c}</option>`; });
}

/* ─── BUDGET FORM ─── */
function saveBudget() {
  const cat = document.getElementById('budgetCat').value;
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

/* ─── GOAL FORM ─── */
function renderGoalColorPicker() {
  const wrap = document.getElementById('goalColorPicker');
  wrap.innerHTML = GOAL_COLORS.map(c =>
    `<div class="color-swatch${c === state.selectedGoalColor ? ' selected' : ''}"
      style="background:${c}" onclick="selectGoalColor('${c}',this)"></div>`
  ).join('');
}

function selectGoalColor(color, el) {
  state.selectedGoalColor = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

function saveGoal() {
  const name = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  const saved = parseFloat(document.getElementById('goalSaved').value) || 0;
  const date = document.getElementById('goalDate').value;
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

/* ─── SETTINGS ─── */
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
  const rows = [['Datum','Omschrijving','Categorie','Type','Bedrag','Notitie']];
  state.transactions.sort((a,b) => b.date.localeCompare(a.date)).forEach(t => {
    rows.push([t.date, t.desc, t.cat, t.type === 'income' ? 'Inkomst' : 'Uitgave', t.amt.toFixed(2), t.note || '']);
  });
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
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
  const pm = String(now.getMonth()).padStart(2,'0') || '12';
  const py = now.getMonth() === 0 ? y - 1 : y;

  state.transactions = [
    { id: 1, type:'income',  desc:'Salaris',           amt:2850, date:`${y}-${m}-01`, cat:'Inkomst',       note:'' },
    { id: 2, type:'income',  desc:'Freelance project',  amt:450,  date:`${y}-${m}-05`, cat:'Inkomst',       note:'Webdesign' },
    { id: 3, type:'expense', desc:'Huur',               amt:950,  date:`${y}-${m}-01`, cat:'Wonen',         note:'' },
    { id: 4, type:'expense', desc:'Albert Heijn',       amt:94,   date:`${y}-${m}-03`, cat:'Boodschappen',  note:'' },
    { id: 5, type:'expense', desc:'NS Maandkaart',      amt:110,  date:`${y}-${m}-01`, cat:'Transport',     note:'' },
    { id: 6, type:'expense', desc:'Netflix',            amt:13,   date:`${y}-${m}-02`, cat:'Abonnementen',  note:'' },
    { id: 7, type:'expense', desc:'Spotify',            amt:10,   date:`${y}-${m}-02`, cat:'Abonnementen',  note:'' },
    { id: 8, type:'expense', desc:'Gym abonnement',     amt:35,   date:`${y}-${m}-01`, cat:'Gezondheid',    note:'' },
    { id: 9, type:'expense', desc:'Restaurant',         amt:67,   date:`${y}-${m}-08`, cat:'Eten & Drinken',note:'Diner' },
    { id:10, type:'expense', desc:'Jumbo',              amt:78,   date:`${y}-${m}-10`, cat:'Boodschappen',  note:'' },
    { id:11, type:'expense', desc:'Koffie & lunch',     amt:42,   date:`${y}-${m}-11`, cat:'Eten & Drinken',note:'' },
    { id:12, type:'expense', desc:'Zara',               amt:89,   date:`${y}-${m}-14`, cat:'Kleding',       note:'' },
    { id:13, type:'expense', desc:'Energie rekening',   amt:85,   date:`${y}-${m}-04`, cat:'Wonen',         note:'' },
    { id:14, type:'expense', desc:'Internet',           amt:45,   date:`${y}-${m}-04`, cat:'Abonnementen',  note:'' },
    { id:15, type:'expense', desc:'Huisarts eigen risico',amt:50, date:`${y}-${m}-09`, cat:'Gezondheid',    note:'' },
    { id:16, type:'expense', desc:'Bar avondje uit',    amt:55,   date:`${y}-${m}-13`, cat:'Vrije tijd',    note:'' },
    { id:17, type:'expense', desc:'Bioscoop',           amt:24,   date:`${y}-${m}-15`, cat:'Vrije tijd',    note:'' },
    { id:18, type:'income',  desc:'Salaris',            amt:2850, date:`${py}-${pm}-01`, cat:'Inkomst',     note:'' },
    { id:19, type:'expense', desc:'Huur',               amt:950,  date:`${py}-${pm}-01`, cat:'Wonen',       note:'' },
    { id:20, type:'expense', desc:'Boodschappen',       amt:160,  date:`${py}-${pm}-05`, cat:'Boodschappen',note:'' },
    { id:21, type:'expense', desc:'Transport',          amt:110,  date:`${py}-${pm}-01`, cat:'Transport',   note:'' },
    { id:22, type:'expense', desc:'Abonnementen',       amt:68,   date:`${py}-${pm}-02`, cat:'Abonnementen',note:'' },
    { id:23, type:'expense', desc:'Gezondheid',         amt:35,   date:`${py}-${pm}-01`, cat:'Gezondheid',  note:'' },
    { id:24, type:'expense', desc:'Eten & Drinken',     amt:120,  date:`${py}-${pm}-10`, cat:'Eten & Drinken',note:''},
  ];

  state.budgets = {
    'Wonen': 1100, 'Boodschappen': 200, 'Transport': 130,
    'Eten & Drinken': 150, 'Vrije tijd': 100, 'Abonnementen': 80, 'Gezondheid': 100
  };

  state.goals = [
    { id: 1, name: 'Vakantie Japan', target: 3000, saved: 1200, date: `${y+1}-06-01`, color: '#6c8aff' },
    { id: 2, name: 'Noodfonds',      target: 5000, saved: 2750, date: `${y+1}-12-31`, color: '#34d48a' },
    { id: 3, name: 'Nieuwe laptop',  target: 1500, saved: 600,  date: `${y}-10-01`,   color: '#ffb340' },
  ];

  saveState();
  navigate('dashboard');
}

/* ─── COMPUTE METRICS ─── */
function getCurrentMonthTx() {
  const now = new Date();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const y = now.getFullYear();
  const prefix = `${y}-${m}`;
  return state.transactions.filter(t => t.date.startsWith(prefix));
}

function computeMetrics() {
  const tx = getCurrentMonthTx();
  const income = tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const expense = tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const balance = income - expense;

  const cats = {};
  tx.filter(t=>t.type==='expense').forEach(t => { cats[t.cat]=(cats[t.cat]||0)+t.amt; });

  const biggest = tx.filter(t=>t.type==='expense').sort((a,b)=>b.amt-a.amt)[0] || null;

  const day = getDayOfMonth();
  const daysInMonth = getDaysInMonth();
  const burnDaily = day > 0 ? expense / day : 0;
  const projected = burnDaily * daysInMonth;

  let score = 0;
  const breakdown = [];
  if (income > 0) {
    const savRate = balance / income;
    let pts = savRate >= 0.3 ? 35 : savRate >= 0.2 ? 25 : savRate >= 0.1 ? 15 : savRate >= 0 ? 5 : 0;
    score += pts;
    breakdown.push({ name: 'Spaarquote', pts, max: 35 });

    const spendRate = expense / income;
    pts = spendRate <= 0.6 ? 25 : spendRate <= 0.75 ? 18 : spendRate <= 0.9 ? 10 : 3;
    score += pts;
    breakdown.push({ name: 'Uitgavenratio', pts, max: 25 });

    const housingPct = (cats['Wonen']||0) / income;
    pts = housingPct <= 0.3 ? 20 : housingPct <= 0.4 ? 14 : housingPct <= 0.5 ? 7 : 0;
    score += pts;
    breakdown.push({ name: 'Woonlasten', pts, max: 20 });

    const nCats = Object.keys(cats).length;
    pts = nCats >= 4 ? 20 : nCats >= 2 ? 12 : nCats >= 1 ? 6 : 0;
    score += pts;
    breakdown.push({ name: 'Diversiteit', pts, max: 20 });
  }

  return { income, expense, balance, cats, biggest, burnDaily, projected, score: Math.min(100, score), breakdown };
}

/* ─── RENDER DASHBOARD ─── */
function renderDashboard() {
  const now = new Date();
  document.getElementById('dashSub').textContent = monthName(now);
  document.getElementById('sidebarMonth').textContent = monthName(now);

  const { income, expense, balance, cats, burnDaily, projected, score, breakdown } = computeMetrics();

  // KPIs
  document.getElementById('kpiIncome').textContent = fmt(income);
  document.getElementById('kpiExpense').textContent = fmt(expense);
  document.getElementById('kpiBalance').textContent = fmt(Math.abs(balance));
  document.getElementById('kpiBalance').style.color = balance >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('kpiBalSub').textContent = income > 0
    ? Math.round((balance/income)*100) + '% van inkomsten'
    : 'van inkomsten';

  const expBar = income > 0 ? Math.min(100, (expense/income)*100) : 0;
  document.getElementById('kpiExpenseBar').style.width = expBar + '%';

  document.getElementById('kpiScore').textContent = income > 0 ? score : '—';
  document.getElementById('kpiScoreLabel').textContent = score >= 80 ? 'Uitstekend' : score >= 60 ? 'Goed' : score >= 40 ? 'Matig' : income > 0 ? 'Aandacht' : 'Voeg data toe';

  // Cashflow chart
  renderCashflowChart();

  // Donut
  renderDonutChart(cats);

  // Health score
  const arc = document.getElementById('healthRing');
  const circ = 301.6;
  arc.style.strokeDashoffset = circ - (circ * score / 100);
  arc.style.stroke = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)';
  document.getElementById('healthScore').textContent = score;

  const hBreak = document.getElementById('healthBreakdown');
  hBreak.innerHTML = breakdown.map(b => {
    const pct = Math.round((b.pts/b.max)*100);
    const col = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)';
    return `<div class="health-item">
      <span class="health-item-name">${b.name}</span>
      <span class="health-item-pts" style="color:${col}">${b.pts}/${b.max}</span>
    </div>`;
  }).join('') || '<div class="empty-state" style="padding:8px;font-size:12px">Voeg data toe</div>';

  // Recent transactions
  const recent = [...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  const recEl = document.getElementById('recentTxList');
  if (!recent.length) {
    recEl.innerHTML = '<div class="empty-state">Nog geen transacties</div>';
  } else {
    recEl.innerHTML = recent.map(t => {
      const col = t.type === 'income' ? 'var(--green)' : (CAT_COLORS[t.cat]||'#94a3b8');
      const amtCol = t.type === 'income' ? 'var(--green)' : 'var(--red)';
      const sign = t.type === 'income' ? '+' : '−';
      return `<div class="tx-mini-row">
        <span class="tx-mini-dot" style="background:${col}"></span>
        <span class="tx-mini-name">${t.desc}</span>
        <span class="tx-mini-cat">${t.cat}</span>
        <span class="tx-mini-amt" style="color:${amtCol}">${sign}${fmt(t.amt)}</span>
      </div>`;
    }).join('');
  }

  // Burn rate
  document.getElementById('burnDaily').textContent = fmt(burnDaily);
  document.getElementById('burnWeekly').textContent = fmt(burnDaily * 7);
  document.getElementById('burnProjected').textContent = fmt(projected);

  const day = getDayOfMonth();
  const daysInMonth = getDaysInMonth();
  const dayPct = Math.round((day / daysInMonth) * 100);
  const projPct = income > 0 ? Math.min(100, Math.round((projected / income) * 100)) : 0;
  document.getElementById('projFill').style.width = projPct + '%';
  document.getElementById('projMarker').style.left = dayPct + '%';
  document.getElementById('projCurrent').textContent = fmt(expense);
  document.getElementById('projEnd').textContent = fmt(projected);

  // Update page-sub for transactions
  document.getElementById('txPageSub').textContent = state.transactions.length + ' transacties in totaal';
}

/* ─── CASHFLOW CHART ─── */
function renderCashflowChart() {
  const isDark = state.settings.theme !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? '#5a5a72' : '#9090a8';

  const months = [];
  const incomeData = [];
  const expenseData = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const prefix = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('nl-NL', { month: 'short' });
    months.push(label);
    const tx = state.transactions.filter(t => t.date.startsWith(prefix));
    incomeData.push(Math.round(tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0)));
    expenseData.push(Math.round(tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0)));
  }

  const ctx = document.getElementById('cashflowChart').getContext('2d');
  if (charts.cashflow) charts.cashflow.destroy();

  charts.cashflow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: 'Inkomsten', data: incomeData, backgroundColor: 'rgba(52,212,138,0.75)', borderRadius: 4, borderSkipped: false },
        { label: 'Uitgaven', data: expenseData, backgroundColor: 'rgba(255,94,108,0.75)', borderRadius: 4, borderSkipped: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + state.settings.currency + ctx.raw.toLocaleString('nl-NL')
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, callback: v => state.settings.currency + v.toLocaleString('nl-NL') } }
      }
    }
  });

  document.getElementById('cashflowLegend').innerHTML = [
    { label: 'Inkomsten', color: '#34d48a' },
    { label: 'Uitgaven',  color: '#ff5e6c' }
  ].map(l => `<span class="legend-item"><span class="legend-dot" style="background:${l.color}"></span>${l.label}</span>`).join('');
}

/* ─── DONUT CHART ─── */
function renderDonutChart(cats) {
  const entries = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((a,[,v])=>a+v,0);

  document.getElementById('donutTotal').textContent = fmt(total);

  const ctx = document.getElementById('donutChart').getContext('2d');
  if (charts.donut) charts.donut.destroy();

  if (!entries.length) {
    document.getElementById('donutLegend').innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center">Geen uitgaven</div>';
    return;
  }

  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([k])=>k),
      datasets: [{ data: entries.map(([,v])=>Math.round(v)), backgroundColor: entries.map(([k])=>CAT_COLORS[k]||'#94a3b8'), borderWidth: 2, borderColor: state.settings.theme === 'light' ? '#ffffff' : '#16161d', hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + state.settings.currency + ctx.raw.toLocaleString('nl-NL') + ' (' + Math.round(ctx.raw/total*100) + '%)' } }
      }
    }
  });

  document.getElementById('donutLegend').innerHTML = entries.slice(0,6).map(([k,v]) =>
    `<div class="donut-leg-row">
      <span class="donut-leg-name"><span class="donut-leg-dot" style="background:${CAT_COLORS[k]||'#94a3b8'}"></span>${k}</span>
      <span class="donut-leg-amt">${fmt(v)}</span>
    </div>`
  ).join('');
}

/* ─── RENDER TRANSACTIONS ─── */
function renderTransactions() {
  updateCatFilter();
  const tx = getFilteredTx();
  const tbody = document.getElementById('txTableBody');

  if (!tx.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Geen transacties gevonden</td></tr>';
    document.getElementById('txSummary').innerHTML = '';
    return;
  }

  tbody.innerHTML = tx.map(t => {
    const col = t.type === 'income' ? 'var(--green)' : (CAT_COLORS[t.cat]||'#94a3b8');
    const amtClass = t.type === 'income' ? 'income' : 'expense';
    const sign = t.type === 'income' ? '+' : '−';
    const d = new Date(t.date);
    const dateStr = d.toLocaleDateString('nl-NL', { day:'numeric', month:'short', year:'numeric' });
    return `<tr>
      <td>
        <div style="font-weight:500">${t.desc}</div>
        ${t.note ? `<div style="font-size:11px;color:var(--text3);margin-top:1px">${t.note}</div>` : ''}
      </td>
      <td>
        <span class="tx-cat-badge">
          <span class="tx-cat-dot" style="background:${col}"></span>
          ${t.cat}
        </span>
      </td>
      <td class="tx-date-cell">${dateStr}</td>
      <td class="tx-amount-cell">
        <span class="tx-amount ${amtClass}">${sign}${fmt(t.amt)}</span>
      </td>
      <td class="tx-actions">
        <button class="tx-del-btn" onclick="deleteTx(${t.id})" title="Verwijderen">×</button>
      </td>
    </tr>`;
  }).join('');

  const inc = tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const exp = tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  document.getElementById('txSummary').innerHTML = `
    <span class="tx-summary-item">${tx.length} transacties</span>
    <span class="tx-summary-item">Inkomsten: <strong style="color:var(--green)">${fmt(inc)}</strong></span>
    <span class="tx-summary-item">Uitgaven: <strong style="color:var(--red)">${fmt(exp)}</strong></span>
    <span class="tx-summary-item">Saldo: <strong style="color:${inc-exp>=0?'var(--green)':'var(--red)'}">${fmtSigned(inc-exp)}</strong></span>
  `;
}

/* ─── RENDER ANALYTICS ─── */
function renderAnalytics() {
  const isDark = state.settings.theme !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? '#5a5a72' : '#9090a8';

  const nMonths = state.analyticsPeriod === 'month' ? 1 : state.analyticsPeriod === 'quarter' ? 3 : 12;
  const periods = [];
  for (let i = Math.max(nMonths, 6) - 1; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth()-i);
    periods.push({ d, prefix: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleDateString('nl-NL',{month:'short'}) });
  }

  const incArr = periods.map(p => Math.round(state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='income').reduce((a,t)=>a+t.amt,0)));
  const expArr = periods.map(p => Math.round(state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='expense').reduce((a,t)=>a+t.amt,0)));
  const labels = periods.map(p=>p.label);

  // Inc vs Exp
  const ctx1 = document.getElementById('incExpChart').getContext('2d');
  if (charts.incExp) charts.incExp.destroy();
  charts.incExp = new Chart(ctx1, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Inkomsten', data: incArr, borderColor:'#34d48a', backgroundColor:'rgba(52,212,138,0.08)', tension:0.4, fill:true, pointRadius:4, pointBackgroundColor:'#34d48a' },
        { label:'Uitgaven',  data: expArr, borderColor:'#ff5e6c', backgroundColor:'rgba(255,94,108,0.08)', tension:0.4, fill:true, pointRadius:4, pointBackgroundColor:'#ff5e6c' }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: c => ' '+state.settings.currency+c.raw.toLocaleString('nl-NL') }}},
      scales:{
        x:{grid:{display:false}, ticks:{color:textColor,font:{size:11}}},
        y:{grid:{color:gridColor}, ticks:{color:textColor,font:{size:11}, callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}
      }
    }
  });

  document.getElementById('incExpLegend').innerHTML = [
    {label:'Inkomsten',color:'#34d48a'},{label:'Uitgaven',color:'#ff5e6c'}
  ].map(l=>`<span class="legend-item"><span class="legend-dot" style="background:${l.color}"></span>${l.label}</span>`).join('');

  // Category trend (top 4)
  const topCats = Object.entries(
    state.transactions.filter(t=>t.type==='expense').reduce((a,t)=>{a[t.cat]=(a[t.cat]||0)+t.amt;return a;},{})
  ).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k])=>k);

  const ctx2 = document.getElementById('catTrendChart').getContext('2d');
  if (charts.catTrend) charts.catTrend.destroy();
  charts.catTrend = new Chart(ctx2, {
    type: 'line',
    data: {
      labels,
      datasets: topCats.map(cat => ({
        label: cat,
        data: periods.map(p => Math.round(state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='expense'&&t.cat===cat).reduce((a,t)=>a+t.amt,0))),
        borderColor: CAT_COLORS[cat]||'#94a3b8',
        backgroundColor: 'transparent',
        tension: 0.4, pointRadius: 3
      }))
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: c => c.dataset.label+': '+state.settings.currency+c.raw.toLocaleString('nl-NL') }}},
      scales:{
        x:{grid:{display:false},ticks:{color:textColor,font:{size:11}}},
        y:{grid:{color:gridColor},ticks:{color:textColor,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}
      }
    }
  });

  // Savings rate
  const savRates = periods.map(p => {
    const inc = state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='income').reduce((a,t)=>a+t.amt,0);
    const exp = state.transactions.filter(t=>t.date.startsWith(p.prefix)&&t.type==='expense').reduce((a,t)=>a+t.amt,0);
    return inc > 0 ? Math.round(((inc-exp)/inc)*100) : 0;
  });

  const ctx3 = document.getElementById('savingsRateChart').getContext('2d');
  if (charts.savRate) charts.savRate.destroy();
  charts.savRate = new Chart(ctx3, {
    type:'bar',
    data:{
      labels,
      datasets:[{
        data: savRates,
        backgroundColor: savRates.map(v => v >= 20 ? 'rgba(52,212,138,0.75)' : v >= 0 ? 'rgba(255,179,64,0.75)' : 'rgba(255,94,108,0.75)'),
        borderRadius:4, borderSkipped:false
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: c => ' '+c.raw+'%' }}},
      scales:{
        x:{grid:{display:false},ticks:{color:textColor,font:{size:11}}},
        y:{grid:{color:gridColor},ticks:{color:textColor,font:{size:11},callback:v=>v+'%'}}
      }
    }
  });

  // Weekday pattern
  const weekdays = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
  const weekdaySums = new Array(7).fill(0);
  const weekdayCounts = new Array(7).fill(0);
  state.transactions.filter(t=>t.type==='expense').forEach(t => {
    const dow = (new Date(t.date).getDay() + 6) % 7;
    weekdaySums[dow] += t.amt;
    weekdayCounts[dow]++;
  });
  const weekdayAvg = weekdaySums.map((s,i) => weekdayCounts[i]>0 ? Math.round(s/weekdayCounts[i]) : 0);

  const ctx4 = document.getElementById('weekdayChart').getContext('2d');
  if (charts.weekday) charts.weekday.destroy();
  charts.weekday = new Chart(ctx4, {
    type:'bar',
    data:{
      labels:weekdays,
      datasets:[{ data:weekdayAvg, backgroundColor:'rgba(108,138,255,0.7)', borderRadius:4, borderSkipped:false }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: c => ' gem. '+state.settings.currency+c.raw.toLocaleString('nl-NL') }}},
      scales:{
        x:{grid:{display:false},ticks:{color:textColor,font:{size:11}}},
        y:{grid:{color:gridColor},ticks:{color:textColor,font:{size:11},callback:v=>state.settings.currency+v.toLocaleString('nl-NL')}}
      }
    }
  });

  // Insights
  renderInsights();
}

/* ─── RENDER INSIGHTS ─── */
function renderInsights() {
  const { income, expense, balance, cats, burnDaily, projected, score } = computeMetrics();
  const insights = [];

  if (income > 0) {
    const savPct = Math.round((balance/income)*100);
    if (savPct >= 20) insights.push({ type:'good', icon:'💚', title:'Spaardoel gehaald', body:`Je spaart ${savPct}% van je inkomsten — boven de aanbevolen 20%.` });
    else if (savPct < 0) insights.push({ type:'bad', icon:'🚨', title:'Budget overschreden', body:`Je hebt ${fmt(Math.abs(balance))} meer uitgegeven dan je hebt verdiend deze maand.` });
    else insights.push({ type:'warn', icon:'⚠️', title:'Spaarquote laag', body:`Je spaart ${savPct}% — probeer 20% als doel. Dat is ${fmt(income*0.2)} per maand.` });

    const housingPct = Math.round(((cats['Wonen']||0)/income)*100);
    if (housingPct > 40) insights.push({ type:'warn', icon:'🏠', title:'Hoge woonlasten', body:`Wonen is ${housingPct}% van je inkomsten. Financieel advies is max. 30-35%.` });

    const subs = cats['Abonnementen'] || 0;
    if (subs > 0) insights.push({ type:'info', icon:'📱', title:'Abonnementen', body:`Je geeft ${fmt(subs)} per maand uit aan abonnementen. Check regelmatig welke je echt gebruikt.` });

    if (projected > income) insights.push({ type:'bad', icon:'📈', title:'Burn rate te hoog', body:`Op dit tempo geef je ${fmt(projected)} uit deze maand, maar verdien je ${fmt(income)}.` });
    else if (projected < income * 0.85) insights.push({ type:'good', icon:'📉', title:'Burn rate gezond', body:`Je projectie van ${fmt(projected)} ligt comfortabel onder je inkomen.` });

    const bigCat = Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
    if (bigCat) insights.push({ type:'info', icon:'📊', title:'Grootste categorie', body:`Je grootste uitgavenpost is ${bigCat[0]}: ${fmt(bigCat[1])} (${Math.round(bigCat[1]/expense*100)}% van totaal).` });
  } else {
    insights.push({ type:'info', icon:'💡', title:'Voeg inkomsten toe', body:'Voeg je maandinkomen toe om inzichten te zien over je spaarquote en budget gezondheid.' });
  }

  const grid = document.getElementById('insightsGrid');
  grid.innerHTML = insights.map(i => `
    <div class="insight-tile ${i.type}">
      <div class="insight-icon">${i.icon}</div>
      <div class="insight-title">${i.title}</div>
      <div class="insight-body">${i.body}</div>
    </div>
  `).join('');
}

/* ─── RENDER BUDGETS ─── */
function renderBudgets() {
  const grid = document.getElementById('budgetGrid');
  const entries = Object.entries(state.budgets);

  if (!entries.length) {
    grid.innerHTML = `<div class="empty-card">
      <div class="empty-icon">◎</div>
      <div class="empty-title">Nog geen budgetten</div>
      <div class="empty-sub">Stel een limiet in per categorie om je uitgaven bij te houden.</div>
      <button class="btn-primary" onclick="openModal('addBudget')">Budget toevoegen</button>
    </div>`;
    return;
  }

  const tx = getCurrentMonthTx();
  grid.innerHTML = entries.map(([cat, limit]) => {
    const spent = tx.filter(t=>t.type==='expense'&&t.cat===cat).reduce((a,t)=>a+t.amt,0);
    const pct = Math.min(100, Math.round((spent/limit)*100));
    const over = spent > limit;
    const warn = pct >= 80 && !over;
    const color = CAT_COLORS[cat]||'#94a3b8';
    const barColor = over ? 'var(--red)' : warn ? 'var(--amber)' : color;
    const badgeClass = over ? 'over' : warn ? 'warn' : 'ok';
    const remaining = limit - spent;
    return `<div class="budget-card">
      <div class="budget-card-header">
        <div class="budget-cat-name">
          <span class="budget-cat-dot" style="background:${color}"></span>
          ${cat}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="budget-pct-badge ${badgeClass}">${pct}%</span>
          <button class="budget-del-btn" onclick="deleteBudget('${cat}')" title="Verwijderen">×</button>
        </div>
      </div>
      <div class="budget-spent">${fmt(spent)}</div>
      <div class="budget-amounts">
        <span>van ${fmt(limit)} budget</span>
        <span style="color:${over?'var(--red)':remaining<limit*0.2?'var(--amber)':'var(--green)'}">${over?'−'+fmt(Math.abs(remaining))+' over':fmt(remaining)+' resterend'}</span>
      </div>
      <div class="budget-bar-track">
        <div class="budget-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
    </div>`;
  }).join('');
}

/* ─── RENDER GOALS ─── */
function renderGoals() {
  const grid = document.getElementById('goalsGrid');
  if (!state.goals.length) {
    grid.innerHTML = `<div class="empty-card">
      <div class="empty-icon">★</div>
      <div class="empty-title">Nog geen doelen</div>
      <div class="empty-sub">Voeg een spaardoel toe om je voortgang bij te houden.</div>
      <button class="btn-primary" onclick="openModal('addGoal')">Doel toevoegen</button>
    </div>`;
    return;
  }

  grid.innerHTML = state.goals.map(g => {
    const pct = Math.min(100, Math.round((g.saved/g.target)*100));
    const remaining = g.target - g.saved;
    const targetDate = new Date(g.date);
    const monthsLeft = Math.max(1, Math.ceil((targetDate - new Date()) / (1000*60*60*24*30)));
    const monthlyNeeded = remaining > 0 ? remaining / monthsLeft : 0;
    const dateStr = targetDate.toLocaleDateString('nl-NL',{month:'long',year:'numeric'});
    const done = g.saved >= g.target;
    return `<div class="goal-card" style="border-top:3px solid ${g.color}">
      <div class="goal-header">
        <div>
          <div class="goal-name">${g.name}${done?' ✓':''}</div>
          <div class="goal-date">Doel: ${dateStr}</div>
        </div>
        <button class="goal-del-btn" onclick="deleteGoal(${g.id})">×</button>
      </div>
      <div class="goal-pct" style="color:${g.color}">${pct}%</div>
      <div class="goal-amounts">${fmt(g.saved)} gespaard van ${fmt(g.target)}</div>
      <div class="goal-bar-track">
        <div class="goal-bar-fill" style="width:${pct}%;background:${g.color}"></div>
      </div>
      ${done
        ? `<div class="goal-monthly" style="color:var(--green)">🎉 Doel behaald!</div>`
        : `<div class="goal-monthly">Nog <strong>${fmt(remaining)}</strong> — spaar <strong>${fmt(monthlyNeeded)}/maand</strong> om op tijd klaar te zijn</div>`
      }
    </div>`;
  }).join('');
}

/* ─── RENDER SETTINGS ─── */
function renderSettings() {
  document.getElementById('themeLight').classList.toggle('active', state.settings.theme === 'light');
  document.getElementById('themeDark').classList.toggle('active', state.settings.theme === 'dark');
  document.getElementById('currencySelect').value = state.settings.currency;
  if (state.settings.monthlyIncome) document.getElementById('incomeInput').value = state.settings.monthlyIncome;
}

/* ─── PERIOD SWITCHER ─── */
function setPeriod(p, el) {
  state.analyticsPeriod = p;
  document.querySelectorAll('#page-analytics .pill').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderAnalytics();
}

/* ─── INIT ─── */
function init() {
  loadState();
  document.documentElement.setAttribute('data-theme', state.settings.theme);

  // Set currency symbols in modals
  document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = state.settings.currency);

  // Set today's date in form
  document.getElementById('txDate').value = today();

  // Sidebar month
  document.getElementById('sidebarMonth').textContent = monthName(new Date());

  // Render initial page
  renderDashboard();
  updateCatFilter();

  // Update currency symbols on change
  document.getElementById('currencySelect')?.addEventListener('change', function() { setCurrency(this.value); });
}

document.addEventListener('DOMContentLoaded', init);
