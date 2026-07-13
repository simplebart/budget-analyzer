/* ═══════════════════════════════════════════════════════════
   HET AVONTUUR — pad, stad, missies, levels
   ═══════════════════════════════════════════════════════════ */

/* ── LEVELS 1-100 met titels ── */
const LEVEL_TITLES = [
  { min: 1,   title: 'Dwaler',            icon: '🥾' },
  { min: 5,   title: 'Zoeker',            icon: '🧭' },
  { min: 10,  title: 'Spoorzoeker',       icon: '🔍' },
  { min: 15,  title: 'Reiziger',          icon: '🎒' },
  { min: 20,  title: 'Verkenner',         icon: '🗺️' },
  { min: 25,  title: 'Padvinder',         icon: '🏕️' },
  { min: 30,  title: 'Bouwer',            icon: '🔨' },
  { min: 35,  title: 'Metselaar',         icon: '🧱' },
  { min: 40,  title: 'Architect',         icon: '📐' },
  { min: 45,  title: 'Rentmeester',       icon: '⚖️' },
  { min: 50,  title: 'Schatbewaarder',    icon: '🗝️' },
  { min: 55,  title: 'Handelaar',         icon: '⚓' },
  { min: 60,  title: 'Koopman',           icon: '💼' },
  { min: 65,  title: 'Bankier',           icon: '🏛️' },
  { min: 70,  title: 'Strateeg',          icon: '♟️' },
  { min: 75,  title: 'Raadsheer',         icon: '📜' },
  { min: 80,  title: 'Gouverneur',        icon: '🏰' },
  { min: 85,  title: 'Vorst',             icon: '👑' },
  { min: 90,  title: 'Grootmeester',      icon: '🌟' },
  { min: 95,  title: 'Legende',           icon: '⚡' },
  { min: 100, title: 'Onsterfelijk',      icon: '🔱' },
];

/* XP-curve: level N vereist meer XP naarmate je stijgt */
function xpForLevel(level) {
  if (level <= 1) return 0;
  // Zachte exponentiële curve — level 100 ≈ 250.000 XP
  return Math.round(50 * Math.pow(level - 1, 1.9));
}

function levelFromXp(xp) {
  let lvl = 1;
  while (lvl < 100 && xp >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

function getLevelInfo() {
  const a = state.adventure;
  const level = levelFromXp(a.xp);
  const titleEntry = [...LEVEL_TITLES].reverse().find(t => level >= t.min) || LEVEL_TITLES[0];
  const curLevelXp  = xpForLevel(level);
  const nextLevelXp = level < 100 ? xpForLevel(level + 1) : curLevelXp;
  const xpInLevel   = a.xp - curLevelXp;
  const xpNeeded    = nextLevelXp - curLevelXp;
  const progress    = level >= 100 ? 100 : Math.round((xpInLevel / xpNeeded) * 100);

  return {
    level,
    title: titleEntry.title,
    icon: titleEntry.icon,
    xp: a.xp,
    xpInLevel,
    xpNeeded,
    progress,
    isMax: level >= 100,
  };
}

/* ═══════════════════════════════════════════════
   HET PAD — haltes die je aflegt
   ═══════════════════════════════════════════════ */
const PATH_STOPS = [
  { name: 'Het Startpunt',      icon: '🚩', desc: 'Waar elke reis begint' },
  { name: 'Eerste Vuur',        icon: '🔥', desc: 'Je eerste missie volbracht' },
  { name: 'Kleine Kreek',       icon: '🏞️', desc: 'De eerste euro\'s stromen' },
  { name: 'Buffersteen',        icon: '🪨', desc: 'Een fundament gelegd' },
  { name: 'Wachtpost',          icon: '🗼', desc: 'Overzicht over je uitgaven' },
  { name: 'De Kruising',        icon: '🔀', desc: 'Keuzes maken die tellen' },
  { name: 'Spaarheuvel',        icon: '⛰️', desc: 'Langzaam maar zeker omhoog' },
  { name: 'Stille Vallei',      icon: '🌾', desc: 'Rust in je financiën' },
  { name: 'De Brug',            icon: '🌉', desc: 'Over de kloof heen' },
  { name: 'Handelspost',        icon: '🏪', desc: 'Je weet wat dingen kosten' },
  { name: 'Bergpas',            icon: '🏔️', desc: 'De klim wordt steiler' },
  { name: 'Kristalmeer',        icon: '💧', desc: 'Helder inzicht' },
  { name: 'Oude Toren',         icon: '🗿', desc: 'Discipline die standhoudt' },
  { name: 'Gouden Poort',       icon: '🚪', desc: 'Een nieuw hoofdstuk' },
  { name: 'Schatkamer',         icon: '💎', desc: 'Je buffer groeit gestaag' },
  { name: 'Sterrenwacht',       icon: '🔭', desc: 'Ver vooruit kunnen kijken' },
  { name: 'Hoge Muur',          icon: '🧱', desc: 'Bestand tegen tegenslag' },
  { name: 'Kroonzaal',          icon: '👑', desc: 'Meester over je geld' },
  { name: 'Vrijheidsmeer',      icon: '🕊️', desc: 'Geld werkt voor jou' },
  { name: 'De Horizon',         icon: '🌅', desc: 'Er is altijd meer' },
];

/* Hoeveel geslaagde missies kost het om deze halte te verlaten?
   Hoe verder op het pad, hoe zwaarder elke halte weegt. */
function stepsForStop(index) {
  if (index < 5)  return 1;   // halte 1-5:   1 missie
  if (index < 10) return 2;   // halte 6-10:  2 missies
  if (index < 15) return 3;   // halte 11-15: 3 missies
  return 4;                   // halte 16-20: 4 missies
}

function getPathInfo() {
  const a = state.adventure;
  const pos = Math.max(0, Math.min(a.pathPosition, PATH_STOPS.length - 1));
  const needed = stepsForStop(pos);
  const done   = Math.max(0, Math.min(a.pathSteps || 0, needed));

  return {
    position: pos,
    current: PATH_STOPS[pos],
    next: pos < PATH_STOPS.length - 1 ? PATH_STOPS[pos + 1] : null,
    total: PATH_STOPS.length,
    stops: PATH_STOPS,
    stepsDone: done,
    stepsNeeded: needed,
    stepsLeft: Math.max(0, needed - done),
    stepProgress: needed > 0 ? Math.round((done / needed) * 100) : 100,
    isFinalStop: pos >= PATH_STOPS.length - 1,
  };
}

/* ═══════════════════════════════════════════════
   DE STAD — groeit mee, krimpt nooit
   ═══════════════════════════════════════════════ */
const CITY_STAGES = [
  { min: 0,  name: 'Kampvuur',        emoji: '🔥',  desc: 'Een plek om te beginnen' },
  { min: 2,  name: 'Tentenkamp',      emoji: '⛺',  desc: 'De eerste bewoners' },
  { min: 4,  name: 'Gehucht',         emoji: '🛖',  desc: 'Een paar hutten' },
  { min: 7,  name: 'Dorp',            emoji: '🏡',  desc: 'Er ontstaat een gemeenschap' },
  { min: 11, name: 'Marktplaats',     emoji: '🏘️',  desc: 'Handel bloeit op' },
  { min: 16, name: 'Stadje',          emoji: '🏙️',  desc: 'Muren en poorten' },
  { min: 22, name: 'Handelsstad',     emoji: '🌆',  desc: 'Karavanen komen en gaan' },
  { min: 30, name: 'Vestingstad',     emoji: '🏰',  desc: 'Sterk en welvarend' },
  { min: 40, name: 'Metropool',       emoji: '🌃',  desc: 'Een baken van welvaart' },
  { min: 55, name: 'Rijkshoofdstad',  emoji: '🗼',  desc: 'Het hart van een rijk' },
];

function getCityInfo() {
  const lvl = state.adventure.cityLevel;
  const stage = [...CITY_STAGES].reverse().find(s => lvl >= s.min) || CITY_STAGES[0];
  const nextStage = CITY_STAGES.find(s => s.min > lvl);
  return {
    level: lvl,
    stage,
    nextStage,
    toNext: nextStage ? nextStage.min - lvl : 0,
  };
}

/* ═══════════════════════════════════════════════
   MISSIES — automatisch gekozen, moeilijker per level
   ═══════════════════════════════════════════════ */

/* Elke missie: check(mission) → { success: bool, progress: string } */
const MISSIONS = [

  /* ── TIER 1: level 1-9 — gewenning, licht ── */
  { id: 'log_3', tier: 1, icon: '📝', name: 'Houd bij',
    build: () => ({ target: 3 }),
    describe: m => `Log minstens ${m.target} transacties deze week`,
    check: m => {
      const n = txInRange(m.weekStart, m.weekEnd).length;
      return { success: n >= m.target, progress: `${n} van ${m.target} gelogd` };
    }},

  { id: 'no_small_2', tier: 1, icon: '☕', name: 'Geen impulsjes',
    build: () => ({ target: 0 }),
    describe: () => `Géén uitgave onder €15 deze week`,
    check: m => {
      const n = txInRange(m.weekStart, m.weekEnd).filter(t=>t.type==='expense'&&t.amt<15).length;
      return { success: n === 0, progress: n === 0 ? 'Nog vlekkeloos' : `${n} kleine uitgaven` };
    }},

  { id: 'spend_free_1', tier: 1, icon: '🚫', name: 'Eén stille dag',
    build: () => ({ target: 1 }),
    describe: m => `${m.target} dag zonder enige uitgave deze week`,
    check: m => {
      const days = daysInRange(m.weekStart, m.weekEnd);
      const free = days.filter(d => !state.transactions.some(t=>t.type==='expense'&&t.date===d)).length;
      return { success: free >= m.target, progress: `${free} van ${m.target} nuldagen` };
    }},

  /* ── TIER 2: level 10-24 — beginnen te sturen ── */
  { id: 'spend_free_2', tier: 2, icon: '🚫', name: 'Twee stille dagen',
    build: () => ({ target: 2 }),
    describe: m => `${m.target} dagen zonder enige uitgave deze week`,
    check: m => {
      const days = daysInRange(m.weekStart, m.weekEnd);
      const free = days.filter(d => !state.transactions.some(t=>t.type==='expense'&&t.date===d)).length;
      return { success: free >= m.target, progress: `${free} van ${m.target} nuldagen` };
    }},

  { id: 'weekly_cap_10', tier: 2, icon: '🎯', name: 'Weekplafond',
    build: () => {
      const avg = avgWeeklySpend();
      return { target: Math.round(avg * 0.9) };
    },
    describe: m => `Blijf deze week onder ${fmt(m.target)} — 10% onder je gemiddelde`,
    check: m => {
      const spent = txInRange(m.weekStart, m.weekEnd).filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
      return { success: spent <= m.target, progress: `${fmt(spent)} van ${fmt(m.target)}` };
    }},

  { id: 'max_tx_5', tier: 2, icon: '🔢', name: 'Weinig transacties',
    build: () => ({ target: 5 }),
    describe: m => `Maximaal ${m.target} uitgaven deze week`,
    check: m => {
      const n = txInRange(m.weekStart, m.weekEnd).filter(t=>t.type==='expense').length;
      return { success: n <= m.target, progress: `${n} van max ${m.target} uitgaven` };
    }},

  /* ── TIER 3: level 25-44 — categorie-discipline ── */
  { id: 'cat_cap_25', tier: 3, icon: '🍽️', name: 'Categorie-limiet',
    build: () => {
      const cat = topSpendCategory();
      const avg = avgWeeklySpendInCat(cat);
      return { cat, target: Math.round(Math.max(10, avg * 0.75)) };
    },
    describe: m => `Houd ${m.cat} onder ${fmt(m.target)} deze week — 25% minder`,
    check: m => {
      const spent = txInRange(m.weekStart, m.weekEnd).filter(t=>t.type==='expense'&&t.cat===m.cat).reduce((a,t)=>a+t.amt,0);
      return { success: spent <= m.target, progress: `${fmt(spent)} van ${fmt(m.target)}` };
    }},

  { id: 'spend_free_3', tier: 3, icon: '🧘', name: 'Drie stille dagen',
    build: () => ({ target: 3 }),
    describe: m => `${m.target} dagen zonder enige uitgave deze week`,
    check: m => {
      const days = daysInRange(m.weekStart, m.weekEnd);
      const free = days.filter(d => !state.transactions.some(t=>t.type==='expense'&&t.date===d)).length;
      return { success: free >= m.target, progress: `${free} van ${m.target} nuldagen` };
    }},

  { id: 'weekly_cap_20', tier: 3, icon: '📉', name: 'Twintig procent minder',
    build: () => {
      const avg = avgWeeklySpend();
      return { target: Math.round(avg * 0.8) };
    },
    describe: m => `Blijf deze week onder ${fmt(m.target)} — 20% onder je gemiddelde`,
    check: m => {
      const spent = txInRange(m.weekStart, m.weekEnd).filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
      return { success: spent <= m.target, progress: `${fmt(spent)} van ${fmt(m.target)}` };
    }},

  /* ── TIER 4: level 45-69 — zwaar ── */
  { id: 'spend_free_4', tier: 4, icon: '🏔️', name: 'Vier stille dagen',
    build: () => ({ target: 4 }),
    describe: m => `${m.target} dagen zonder enige uitgave deze week`,
    check: m => {
      const days = daysInRange(m.weekStart, m.weekEnd);
      const free = days.filter(d => !state.transactions.some(t=>t.type==='expense'&&t.date===d)).length;
      return { success: free >= m.target, progress: `${free} van ${m.target} nuldagen` };
    }},

  { id: 'weekly_cap_30', tier: 4, icon: '🔻', name: 'Dertig procent minder',
    build: () => {
      const avg = avgWeeklySpend();
      return { target: Math.round(avg * 0.7) };
    },
    describe: m => `Blijf deze week onder ${fmt(m.target)} — 30% onder je gemiddelde`,
    check: m => {
      const spent = txInRange(m.weekStart, m.weekEnd).filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
      return { success: spent <= m.target, progress: `${fmt(spent)} van ${fmt(m.target)}` };
    }},

  { id: 'cat_cap_50', tier: 4, icon: '✂️', name: 'Harde snede',
    build: () => {
      const cat = topSpendCategory();
      const avg = avgWeeklySpendInCat(cat);
      return { cat, target: Math.round(Math.max(5, avg * 0.5)) };
    },
    describe: m => `Halveer ${m.cat} — blijf onder ${fmt(m.target)} deze week`,
    check: m => {
      const spent = txInRange(m.weekStart, m.weekEnd).filter(t=>t.type==='expense'&&t.cat===m.cat).reduce((a,t)=>a+t.amt,0);
      return { success: spent <= m.target, progress: `${fmt(spent)} van ${fmt(m.target)}` };
    }},

  /* ── TIER 5: level 70-100 — meesterschap, combinaties ── */
  { id: 'combo_master', tier: 5, icon: '⚔️', name: 'Dubbele beproeving',
    build: () => {
      const avg = avgWeeklySpend();
      return { target: Math.round(avg * 0.7), days: 3 };
    },
    describe: m => `Onder ${fmt(m.target)} blijven ÉN ${m.days} nuldagen halen`,
    check: m => {
      const spent = txInRange(m.weekStart, m.weekEnd).filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
      const days = daysInRange(m.weekStart, m.weekEnd);
      const free = days.filter(d => !state.transactions.some(t=>t.type==='expense'&&t.date===d)).length;
      const ok = spent <= m.target && free >= m.days;
      return { success: ok, progress: `${fmt(spent)}/${fmt(m.target)} · ${free}/${m.days} nuldagen` };
    }},

  { id: 'spend_free_5', tier: 5, icon: '🏆', name: 'Vijf stille dagen',
    build: () => ({ target: 5 }),
    describe: m => `${m.target} dagen zonder enige uitgave deze week`,
    check: m => {
      const days = daysInRange(m.weekStart, m.weekEnd);
      const free = days.filter(d => !state.transactions.some(t=>t.type==='expense'&&t.date===d)).length;
      return { success: free >= m.target, progress: `${free} van ${m.target} nuldagen` };
    }},

  { id: 'weekly_cap_40', tier: 5, icon: '💀', name: 'Veertig procent minder',
    build: () => {
      const avg = avgWeeklySpend();
      return { target: Math.round(avg * 0.6) };
    },
    describe: m => `Blijf deze week onder ${fmt(m.target)} — 40% onder je gemiddelde`,
    check: m => {
      const spent = txInRange(m.weekStart, m.weekEnd).filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
      return { success: spent <= m.target, progress: `${fmt(spent)} van ${fmt(m.target)}` };
    }},
];

/* ── Helpers voor missies ── */
function txInRange(start, end) {
  return state.transactions.filter(t => t.date >= start && t.date <= end);
}

/* Alleen dagen die daadwerkelijk voorbij zijn.
   Een dag die nog moet komen kan geen "stille dag" zijn — hij heeft nog
   geen kans gehad. Zonder deze knip staat er op maandag al "7 van 1
   nuldagen", alsof de missie al voltooid is. */
function daysInRange(start, end) {
  const out = [];
  const vandaag = today();
  const stop = end < vandaag ? end : vandaag;   // niet verder dan nu

  let d = new Date(start + 'T12:00:00');
  const endD = new Date(stop + 'T12:00:00');
  while (d <= endD) {
    out.push(dateToStr(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function avgWeeklySpend() {
  const cycles = getLastNCycles(3);
  const totals = cycles.map(c => {
    const exp = state.transactions.filter(t => t.type==='expense' && c.match(t)).reduce((a,t)=>a+t.amt,0);
    return exp;
  }).filter(v => v > 0);
  if (!totals.length) return 150; // fallback
  const avgCycle = totals.reduce((a,b)=>a+b,0) / totals.length;
  return Math.max(50, avgCycle / 4.3); // ~4.3 weken per cyclus
}

function avgWeeklySpendInCat(cat) {
  const cycles = getLastNCycles(3);
  const totals = cycles.map(c =>
    state.transactions.filter(t => t.type==='expense' && t.cat===cat && c.match(t)).reduce((a,t)=>a+t.amt,0)
  ).filter(v => v > 0);
  if (!totals.length) return 40;
  const avgCycle = totals.reduce((a,b)=>a+b,0) / totals.length;
  return Math.max(15, avgCycle / 4.3);
}

function topSpendCategory() {
  const cats = {};
  const cycles = getLastNCycles(2);
  cycles.forEach(c => {
    state.transactions.filter(t=>t.type==='expense' && c.match(t)).forEach(t => {
      cats[t.cat] = (cats[t.cat]||0) + t.amt;
    });
  });
  // Sla vaste lasten over — daar kun je deze week niks aan doen
  const skip = ['Wonen','Verzekeringen','Bankkosten','Lening','Abonnementen'];
  const sorted = Object.entries(cats).filter(([c]) => !skip.includes(c)).sort((a,b)=>b[1]-a[1]);
  return sorted.length ? sorted[0][0] : 'Boodschappen';
}

/* ── Missie selectie: de app kiest, niet de gebruiker ── */
/* De missie wordt NIET willekeurig gekozen.

   Met Math.random() kiest elk apparaat zijn eigen missie zodra het
   opstart — vóór de synchronisatie klaar is. Dan heeft je telefoon een
   andere opdracht dan je computer, en wint wie het laatst synchroniseert.

   In plaats daarvan leiden we de keuze af uit de week en je tier. Twee
   apparaten met dezelfde week en hetzelfde level komen dan onafhankelijk
   op precies dezelfde missie uit. Geen race, geen afwijking. */
function pickMissionForLevel(level, weekStart) {
  let tier;
  if (level < 10)      tier = 1;
  else if (level < 25) tier = 2;
  else if (level < 45) tier = 3;
  else if (level < 70) tier = 4;
  else                 tier = 5;

  const pool = MISSIONS.filter(m => m.tier === tier);
  if (!pool.length) return MISSIONS[0];

  // Zaad uit week + tier: elke week een andere missie, maar overal dezelfde
  const seed = `${weekStart}|${tier}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;

  return pool[Math.abs(h) % pool.length];
}

/* ── Weekgrenzen (ma t/m zo) ── */
function currentWeekRange() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // ma = 0
  const monday = new Date(now);
  monday.setDate(monday.getDate() - dow);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { start: dateToStr(monday), end: dateToStr(sunday) };
}

/* ── Zorg dat er altijd een actieve missie is; evalueer de vorige ── */
function ensureMission() {
  const a = state.adventure;
  const { start, end } = currentWeekRange();

  // Geen missie? Start er een.
  if (!a.currentMission) {
    assignNewMission(start, end);
    return;
  }

  // Nieuwe week begonnen? Evalueer de oude en start een nieuwe.
  if (a.currentMission.weekStart !== start) {
    evaluateMission(a.currentMission);
    assignNewMission(start, end);
  }
}

function assignNewMission(weekStart, weekEnd) {
  const lvl = getLevelInfo().level;
  const tpl = pickMissionForLevel(lvl, weekStart);
  const config = tpl.build();

  state.adventure.currentMission = {
    id: tpl.id,
    weekStart,
    weekEnd,
    ...config,
  };
  saveState(true);
}

/* ── Beoordeel een afgelopen missie: XP, pad, stad ── */
function evaluateMission(mission) {
  const tpl = MISSIONS.find(m => m.id === mission.id);
  if (!tpl) return;

  const result = tpl.check(mission);
  const a = state.adventure;
  const tier = tpl.tier;

  let xpChange = 0;
  if (a.pathSteps === undefined) a.pathSteps = 0;

  const posBefore = a.pathPosition;
  let advanced = false;   // halte bereikt?
  let fellBack = false;   // halte verloren?

  if (result.success) {
    xpChange = 100 * tier;
    a.cityLevel += 1;                         // stad groeit — ALTIJD, krimpt nooit
    a.stats.missionsCompleted++;
    a.stats.streak++;
    a.stats.bestStreak = Math.max(a.stats.bestStreak, a.stats.streak);
    if (a.stats.streak >= 3) xpChange += 50 * Math.min(5, a.stats.streak - 2);

    // Stap vooruit binnen de huidige halte
    a.pathSteps++;
    const needed = stepsForStop(a.pathPosition);
    if (a.pathSteps >= needed && a.pathPosition < PATH_STOPS.length - 1) {
      a.pathPosition++;
      a.pathSteps = 0;    // reset voor de nieuwe halte
      advanced = true;
    } else if (a.pathPosition >= PATH_STOPS.length - 1) {
      a.pathSteps = Math.min(a.pathSteps, stepsForStop(a.pathPosition)); // cap op laatste halte
    }
  } else {
    xpChange = -40 * tier;
    a.stats.missionsFailed++;
    a.stats.streak = 0;

    // Eén stap terug binnen de halte; op 0 → val terug naar vorige halte
    a.pathSteps--;
    if (a.pathSteps < 0) {
      if (a.pathPosition > 0) {
        a.pathPosition--;
        // Je begint op de vorige halte met bijna alle stappen nog gedaan (één eraf)
        a.pathSteps = Math.max(0, stepsForStop(a.pathPosition) - 1);
        fellBack = true;
      } else {
        a.pathSteps = 0;   // op het startpunt kun je niet verder terug
      }
    }
  }

  a.xp = Math.max(0, a.xp + xpChange);

  a.missionHistory.push({
    id: mission.id,
    name: tpl.name,
    icon: tpl.icon,
    week: mission.weekStart,
    success: result.success,
    xpChange,
    advanced,
    fellBack,
    progress: result.progress,
  });

  // Bewaar alleen laatste 20
  if (a.missionHistory.length > 20) a.missionHistory = a.missionHistory.slice(-20);

  saveState(true);

  // Toon het resultaat
  setTimeout(() => showMissionResult(tpl, result, xpChange, { advanced, fellBack, posBefore }), 700);
}

function showMissionResult(tpl, result, xpChange, pathInfo) {
  const success = result.success;
  const path = getPathInfo();
  const { advanced, fellBack } = pathInfo;

  // Beschrijf wat er met het pad gebeurde
  let pathLine, pathColor, pathSub;
  if (advanced) {
    pathLine  = '🎏 Nieuwe halte bereikt!';
    pathColor = 'var(--green)';
    pathSub   = `${path.current.icon} ${path.current.name}`;
  } else if (fellBack) {
    pathLine  = '⬅️ Teruggevallen naar vorige halte';
    pathColor = 'var(--red)';
    pathSub   = `${path.current.icon} ${path.current.name}`;
  } else if (success) {
    pathLine  = `→ Stap ${path.stepsDone} van ${path.stepsNeeded}`;
    pathColor = 'var(--green)';
    pathSub   = `Nog ${path.stepsLeft} tot ${path.next ? path.next.name : 'het einde'}`;
  } else {
    pathLine  = `← Stap verloren`;
    pathColor = 'var(--red)';
    pathSub   = `${path.stepsDone} van ${path.stepsNeeded} op ${path.current.name}`;
  }

  const overlay = document.createElement('div');
  overlay.className = 'adv-overlay';
  overlay.innerHTML = `
    <div class="adv-result-card ${success ? 'win' : 'lose'}">
      <div class="adv-result-glow"></div>
      <div class="adv-result-icon">${advanced ? '🎉' : success ? '✨' : '💨'}</div>
      <div class="adv-result-label">${success ? 'Missie volbracht' : 'Missie mislukt'}</div>
      <div class="adv-result-name">${tpl.icon} ${tpl.name}</div>
      <div class="adv-result-progress">${result.progress}</div>

      <div class="adv-result-rewards">
        <div class="adv-reward">
          <span class="adv-reward-val" style="color:${xpChange>=0?'var(--green)':'var(--red)'}">
            ${xpChange >= 0 ? '+' : ''}${xpChange} XP
          </span>
        </div>

        <div class="adv-reward">
          <span class="adv-reward-val" style="color:${pathColor}">${pathLine}</span>
          <span class="adv-reward-lbl">${pathSub}</span>
          ${!advanced && !fellBack ? `
          <div class="adv-step-track">
            ${Array.from({length: path.stepsNeeded}, (_, i) =>
              `<span class="adv-step-dot ${i < path.stepsDone ? 'filled' : ''}"></span>`
            ).join('')}
          </div>` : ''}
        </div>

        ${success ? `
        <div class="adv-reward">
          <span class="adv-reward-val" style="color:var(--accent)">🏗️ Stad groeit</span>
        </div>` : `
        <div class="adv-reward">
          <span class="adv-reward-val" style="color:var(--text3)">🏛️ Stad blijft staan</span>
        </div>`}
      </div>

      <button class="btn-primary" onclick="this.closest('.adv-overlay').remove()">Verder</button>
    </div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

/* ═══════════════════════════════════════════════
   CYCLUS-RAPPORT — aan het einde van elke cyclus
   ═══════════════════════════════════════════════ */
function checkCycleReport() {
  const a = state.adventure;
  const { start } = getCurrentCycleRange();
  const cycleKey = dateToStr(start);

  // Al gerapporteerd voor deze cyclus?
  if (a.lastCycleReport === cycleKey) return;

  // Is er een vorige cyclus met data?
  const cycles = getLastNCycles(2);
  const prev = cycles[0];
  const prevTx = state.transactions.filter(t => prev.match(t));
  if (!prevTx.length) {
    a.lastCycleReport = cycleKey;
    saveState(true);
    return;
  }

  a.lastCycleReport = cycleKey;
  saveState(true);

  setTimeout(() => showCycleReport(prev, prevTx), 1200);
}

function showCycleReport(cycle, tx) {
  const income  = tx.filter(t=>t.type==='income').reduce((a,t)=>a+t.amt,0);
  const expense = tx.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amt,0);
  const saved   = income - expense;
  const savedPct = income > 0 ? Math.round((saved/income)*100) : 0;

  // Missies van deze cyclus
  const cycleStart = dateToStr(cycle.start);
  const cycleEnd   = dateToStr(cycle.end);
  const missions = state.adventure.missionHistory.filter(m => m.week >= cycleStart && m.week <= cycleEnd);
  const won  = missions.filter(m=>m.success).length;
  const lost = missions.filter(m=>!m.success).length;
  const xpGained = missions.reduce((a,m)=>a+m.xpChange, 0);

  const lvl = getLevelInfo();
  const city = getCityInfo();
  const path = getPathInfo();

  const overlay = document.createElement('div');
  overlay.className = 'adv-overlay';
  overlay.innerHTML = `
    <div class="adv-report-card">
      <div class="adv-report-header">
        <div class="adv-report-title">Cyclusrapport</div>
        <div class="adv-report-sub">${cycle.fullLabel}</div>
      </div>

      <div class="adv-report-money">
        <div class="adv-money-item">
          <span class="adv-money-lbl">Verdiend</span>
          <span class="adv-money-val" style="color:var(--green)">${fmt(income)}</span>
        </div>
        <div class="adv-money-item">
          <span class="adv-money-lbl">Uitgegeven</span>
          <span class="adv-money-val" style="color:var(--red)">${fmt(expense)}</span>
        </div>
        <div class="adv-money-item">
          <span class="adv-money-lbl">Overgehouden</span>
          <span class="adv-money-val" style="color:${saved>=0?'var(--green)':'var(--red)'}">${fmt(saved)} (${savedPct}%)</span>
        </div>
      </div>

      ${missions.length ? `
      <div class="adv-report-missions">
        <div class="adv-report-section-title">Missies deze cyclus</div>
        ${missions.map(m => `
          <div class="adv-mission-row ${m.success ? 'win' : 'lose'}">
            <span>${m.icon}</span>
            <span class="adv-mission-name">${m.name}</span>
            <span class="adv-mission-result">${m.success ? '✅' : '❌'} ${m.xpChange >= 0 ? '+' : ''}${m.xpChange} XP</span>
          </div>`).join('')}
        <div class="adv-report-summary">
          ${won} volbracht · ${lost} mislukt · <strong style="color:${xpGained>=0?'var(--green)':'var(--red)'}">${xpGained >= 0 ? '+' : ''}${xpGained} XP</strong>
        </div>
      </div>` : ''}

      <div class="adv-report-status">
        <div class="adv-status-item">
          <div class="adv-status-icon">${lvl.icon}</div>
          <div>
            <div class="adv-status-val">Level ${lvl.level}</div>
            <div class="adv-status-lbl">${lvl.title}</div>
          </div>
        </div>
        <div class="adv-status-item">
          <div class="adv-status-icon">${path.current.icon}</div>
          <div>
            <div class="adv-status-val">${path.current.name}</div>
            <div class="adv-status-lbl">halte ${path.position + 1}/${path.total}</div>
          </div>
        </div>
        <div class="adv-status-item">
          <div class="adv-status-icon">${city.stage.emoji}</div>
          <div>
            <div class="adv-status-val">${city.stage.name}</div>
            <div class="adv-status-lbl">jouw stad</div>
          </div>
        </div>
      </div>

      <button class="btn-primary" onclick="this.closest('.adv-overlay').remove()">Naar de volgende cyclus</button>
    </div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

/* ═══════════════════════════════════════════════
   RENDER — de avontuurpagina
   ═══════════════════════════════════════════════ */
function renderAdventure() {
  ensureMission();

  const lvl  = getLevelInfo();
  const path = getPathInfo();
  const city = getCityInfo();
  const a    = state.adventure;

  /* ── Level & XP ── */
  const lvlEl = document.getElementById('advLevel');
  if (lvlEl) {
    lvlEl.innerHTML = `
      <div class="adv-level-top">
        <div class="adv-level-icon">${lvl.icon}</div>
        <div class="adv-level-info">
          <div class="adv-level-title">${lvl.title}</div>
          <div class="adv-level-num">Level ${lvl.level}${lvl.isMax ? ' — MAX' : ''}</div>
        </div>
        <div class="adv-level-xp">${lvl.xp.toLocaleString('nl-NL')} XP</div>
      </div>
      ${!lvl.isMax ? `
      <div class="adv-xp-track">
        <div class="adv-xp-fill" style="width:${lvl.progress}%"></div>
      </div>
      <div class="adv-xp-label">${lvl.xpInLevel.toLocaleString('nl-NL')} / ${lvl.xpNeeded.toLocaleString('nl-NL')} XP naar level ${lvl.level + 1}</div>
      ` : '<div class="adv-xp-label" style="text-align:center;color:var(--green)">Maximum bereikt</div>'}
    `;
  }

  /* ── Actieve missie ── */
  const misEl = document.getElementById('advMission');
  if (misEl) {
    if (!a.currentMission) {
      // Geen missie? Forceer er een.
      const { start, end } = currentWeekRange();
      assignNewMission(start, end);
    }
    const tpl = a.currentMission ? MISSIONS.find(m => m.id === a.currentMission.id) : null;

    if (!tpl) {
      // Missie-ID onbekend (bijv. na een update waarin missies zijn hernoemd) — reset
      const { start, end } = currentWeekRange();
      assignNewMission(start, end);
      misEl.innerHTML = '<div class="empty-state">Nieuwe missie wordt geladen...</div>';
      setTimeout(() => renderAdventure(), 100);
      return;
    }

    {
      const res = tpl.check(a.currentMission);
      const daysLeft = Math.max(0, Math.ceil((new Date(a.currentMission.weekEnd + 'T23:59:59') - new Date()) / 86400000));
      misEl.innerHTML = `
        <div class="adv-mission-card ${res.success ? 'on-track' : ''}">
          <div class="adv-mission-head">
            <span class="adv-mission-icon">${tpl.icon}</span>
            <div class="adv-mission-meta">
              <div class="adv-mission-title">${tpl.name}</div>
              <div class="adv-mission-tier">Tier ${tpl.tier} · nog ${daysLeft} ${daysLeft===1?'dag':'dagen'}</div>
            </div>
          </div>
          <div class="adv-mission-desc">${tpl.describe(a.currentMission)}</div>
          <div class="adv-mission-status ${res.success ? 'good' : 'bad'}">
            ${res.success ? '✓' : '○'} ${res.progress}
          </div>
          <div class="adv-mission-stakes">
            <span class="stake win">Slagen: +${100 * tpl.tier} XP · pad vooruit · stad groeit</span>
            <span class="stake lose">Falen: −${40 * tpl.tier} XP · pad terug</span>
          </div>
        </div>`;
    }
  }

  /* ── Het pad ── */
  const pathEl = document.getElementById('advPath');
  if (pathEl) {
    pathEl.innerHTML = `
      <!-- Voortgang binnen de huidige halte -->
      <div class="adv-step-banner">
        <div class="adv-step-banner-top">
          <span class="adv-step-banner-label">Voortgang op ${path.current.name}</span>
          <span class="adv-step-banner-count">${path.stepsDone} / ${path.stepsNeeded}</span>
        </div>
        <div class="adv-step-track big">
          ${Array.from({length: path.stepsNeeded}, (_, i) =>
            `<span class="adv-step-dot ${i < path.stepsDone ? 'filled' : ''}"></span>`
          ).join('')}
        </div>
        <div class="adv-step-banner-sub">
          ${path.isFinalStop
            ? 'Je hebt de laatste halte bereikt — blijf bouwen aan je stad.'
            : path.stepsLeft === 0
              ? 'Volgende missie brengt je naar de volgende halte!'
              : `Nog <strong>${path.stepsLeft}</strong> ${path.stepsLeft===1?'geslaagde missie':'geslaagde missies'} tot <strong>${path.next.name}</strong> ${path.next.icon}`}
        </div>
      </div>

      <div class="adv-path">
        ${path.stops.map((s, i) => {
          const isPast    = i < path.position;
          const isCurrent = i === path.position;
          const cls = isCurrent ? 'current' : isPast ? 'past' : 'future';
          return `
            <div class="adv-path-stop ${cls}">
              <div class="adv-path-marker">
                <span class="adv-path-icon">${isPast || isCurrent ? s.icon : '·'}</span>
              </div>
              <div class="adv-path-info">
                <div class="adv-path-name">${s.name}</div>
                ${isCurrent ? `<div class="adv-path-desc">${s.desc}</div>` : ''}
              </div>
              ${isCurrent ? '<span class="adv-path-you">jij</span>' : ''}
            </div>`;
        }).join('')}
      </div>`;

    setTimeout(() => {
      const cur = pathEl.querySelector('.adv-path-stop.current');
      if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);
  }

  /* ── De stad ── */
  const cityEl = document.getElementById('advCity');
  if (cityEl) {
    cityEl.innerHTML = `
      <div class="adv-city">
        <div class="adv-city-emoji">${city.stage.emoji}</div>
        <div class="adv-city-name">${city.stage.name}</div>
        <div class="adv-city-desc">${city.stage.desc}</div>
        <div class="adv-city-meta">
          <span>${a.stats.missionsCompleted} missies volbracht</span>
          ${city.nextStage ? `<span>Nog ${city.toNext} tot ${city.nextStage.name} ${city.nextStage.emoji}</span>` : '<span>Maximale grootte</span>'}
        </div>
        <div class="adv-city-note">🛡️ Je stad krimpt nooit — wat je bouwt, blijft staan.</div>
      </div>`;
  }

  /* ── Statistieken ── */
  const statEl = document.getElementById('advStats');
  if (statEl) {
    statEl.innerHTML = `
      <div class="adv-stat"><span class="adv-stat-val">${a.stats.missionsCompleted}</span><span class="adv-stat-lbl">volbracht</span></div>
      <div class="adv-stat"><span class="adv-stat-val">${a.stats.missionsFailed}</span><span class="adv-stat-lbl">mislukt</span></div>
      <div class="adv-stat"><span class="adv-stat-val">${a.stats.streak}</span><span class="adv-stat-lbl">huidige reeks</span></div>
      <div class="adv-stat"><span class="adv-stat-val">${a.stats.bestStreak}</span><span class="adv-stat-lbl">beste reeks</span></div>`;
  }

  /* ── Geschiedenis ── */
  const histEl = document.getElementById('advHistory');
  if (histEl) {
    const hist = [...a.missionHistory].reverse().slice(0, 8);
    histEl.innerHTML = hist.length
      ? hist.map(m => `
          <div class="adv-hist-row ${m.success ? 'win' : 'lose'}">
            <span class="adv-hist-icon">${m.icon}</span>
            <span class="adv-hist-name">${m.name}</span>
            <span class="adv-hist-week">${new Date(m.week + 'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}</span>
            <span class="adv-hist-xp" style="color:${m.xpChange>=0?'var(--green)':'var(--red)'}">${m.xpChange>=0?'+':''}${m.xpChange}</span>
          </div>`).join('')
      : '<div class="empty-state">Nog geen missies afgerond</div>';
  }
}


/* ═══════════════════════════════════════════════════════════
   DE HUD — je status, zichtbaar op elke pagina
   ═══════════════════════════════════════════════════════════ */
function renderHUD() {
  const hud = document.getElementById('hud');
  if (!hud) return;

  // Vang een ontbrekende avontuur-state op i.p.v. stil te falen
  if (!state.adventure) {
    state.adventure = { xp:0, pathPosition:0, pathSteps:0, cityLevel:0,
      currentMission:null, missionHistory:[], lastCycleReport:null,
      stats:{missionsCompleted:0,missionsFailed:0,streak:0,bestStreak:0} };
  }

  // Op de avontuurpagina staat alles al uitgebreid — dan is de HUD dubbelop
  const onAdventurePage = document.getElementById('page-achievements')?.classList.contains('active');
  if (onAdventurePage) { hud.style.display = 'none'; return; }

  ensureMission();

  const lvl  = getLevelInfo();
  const path = getPathInfo();
  const a    = state.adventure;

  hud.style.display = '';

  // Level + titel
  document.getElementById('hudCrest').textContent = lvl.icon;
  document.getElementById('hudLvl').textContent   = `Level ${lvl.level}`;
  document.getElementById('hudTitle').textContent = lvl.title;

  // XP-rail
  document.getElementById('hudXpNum').textContent =
    lvl.isMax ? 'MAX' : `${lvl.xpInLevel.toLocaleString('nl-NL')} / ${lvl.xpNeeded.toLocaleString('nl-NL')}`;
  document.getElementById('hudXpFill').style.width = lvl.progress + '%';

  // Halte + stappen als pips
  document.getElementById('hudQuestIcon').textContent = path.current.icon;
  document.getElementById('hudQuestName').textContent = path.current.name;
  document.getElementById('hudPips').innerHTML =
    Array.from({ length: path.stepsNeeded }, (_, i) =>
      `<span class="hud-pip ${i < path.stepsDone ? 'on' : ''}"></span>`
    ).join('');

  // Missiestatus
  const misEl  = document.getElementById('hudMission');
  const misTxt = document.getElementById('hudMissionText');
  if (a.currentMission) {
    const tpl = MISSIONS.find(m => m.id === a.currentMission.id);
    if (tpl) {
      const res  = tpl.check(a.currentMission);
      const days = Math.max(0, Math.ceil(
        (new Date(a.currentMission.weekEnd + 'T23:59:59') - new Date()) / 86400000
      ));
      misEl.className = 'hud-mission ' + (res.success ? 'on-track' : 'at-risk');
      misTxt.textContent = `${tpl.icon} ${res.success ? 'Op koers' : 'Nog niet'} · ${days}d`;
      misEl.style.display = '';
      return;
    }
  }
  misEl.style.display = 'none';
}


/* ── Het personagepaneel in de zijbalk ── */
function renderPlayer() {
  const crest = document.getElementById('sbCrest');
  if (!crest || !state.adventure) return;

  ensureMission();
  const lvl  = getLevelInfo();
  const path = getPathInfo();

  crest.textContent = lvl.icon;
  document.getElementById('sbTitle').textContent = lvl.title;
  document.getElementById('sbLvl').textContent   = `Level ${lvl.level}`;

  document.getElementById('sbXpFill').style.width = lvl.progress + '%';
  document.getElementById('sbXpNum').textContent  = lvl.isMax
    ? 'Maximum bereikt'
    : `${lvl.xpInLevel.toLocaleString('nl-NL')} / ${lvl.xpNeeded.toLocaleString('nl-NL')} XP`;

  document.getElementById('sbStopIcon').textContent = path.current.icon;
  document.getElementById('sbStopName').textContent = path.current.name;
  document.getElementById('sbPips').innerHTML =
    Array.from({ length: path.stepsNeeded }, (_, i) =>
      `<span class="hud-pip ${i < path.stepsDone ? 'on' : ''}"></span>`).join('');
}
