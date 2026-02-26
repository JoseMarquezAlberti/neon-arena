// ═══════════════════════════════════════════════════════════
// SHOP LOGIC — Unit pool, shop rolls, enemy generation, bosses
// Pure game logic — no React dependency
// ═══════════════════════════════════════════════════════════
import { U, T7_UNITS, mkUnit, gid } from './combat-esm.js';
import CONFIG from '../data/config.json';
import CHIPS_DATA from '../data/chips.json';
import MODS_DATA from '../data/mods.json';

const MAX_BOARD_SIZE = CONFIG.maxBoardSize;
const POOL_COPIES = CONFIG.poolCopies;
const MODS = MODS_DATA;

// ═══ CONTESTED POOL SYSTEM ═══
const unitPool = {
  _pool: {},
  init() {
    this._pool = {};
    U.forEach(t => { this._pool[t.name] = POOL_COPIES[t.t] || 10; });
    T7_UNITS.forEach(t => { this._pool[t.name] = POOL_COPIES[7]; });
  },
  available(templateName) { return this._pool[templateName] || 0; },
  take(templateName) {
    if ((this._pool[templateName] || 0) <= 0) return false;
    this._pool[templateName]--;
    return true;
  },
  returnOne(templateName) {
    const tmpl = U.find(t => t.name === templateName) || T7_UNITS.find(t => t.name === templateName);
    if (!tmpl) return;
    const max = POOL_COPIES[tmpl.t] || 10;
    this._pool[templateName] = Math.min(max, (this._pool[templateName] || 0) + 1);
  },
  removePermanently(templateName, count = 1) {},
  getAvailablePool(maxTier) {
    return U.filter(t => t.t <= maxTier && (this._pool[t.name] || 0) > 0);
  },
  getAvailableAtTier(tier) {
    return U.filter(t => t.t === tier && (this._pool[t.name] || 0) > 0);
  },
};

// ═══ AUGMENT CHIP SYSTEM ═══
const AUGMENT_CHIPS = CHIPS_DATA.map(c => ({
  ...c,
  apply: (u) => {
    const e = c.effect;
    if (e.type === 'statBuff') {
      if (e.atk) u.atk += e.atk;
      if (e.hp) { u.hp += e.hp; u.maxHp += e.hp; }
      if (e.shield) u.shield = (u.shield || 0) + e.shield;
      const parts = [];
      if (e.atk) parts.push(`+${e.atk} ATK`);
      if (e.hp) parts.push(`+${e.hp} HP`);
      if (e.shield) parts.push(`+${e.shield} Shield`);
      return `${u.name} ${parts.join(', ')}!`;
    }
    if (e.type === 'addKeyword') {
      if (!u.kw.includes(e.keyword)) {
        u.kw.push(e.keyword);
        if (e.kwData) u.kwData[e.keyword] = e.kwData;
        if (e.keyword === 'hardshell') u.hardshellActive = true;
      }
      return `${u.name} gained ${c.name}!`;
    }
    return `${u.name} modified!`;
  }
}));

const CHIP_TIERS_BY_ROUND = (round) => {
  if (round >= 12) return 4;
  if (round >= 8)  return 3;
  if (round >= 4)  return 2;
  return 1;
};

const rollAugmentChip = (round) => {
  const maxTier = CHIP_TIERS_BY_ROUND(round);
  const pool = AUGMENT_CHIPS.filter(c => c.tier <= maxTier);
  const chip = pool[Math.floor(Math.random() * pool.length)];
  return { id: gid(), isChip: true, chipData: chip, name: chip.name, tier: chip.cost, emoji: chip.icon, faction: "CHIP", cost: chip.cost };
};

// ═══ SHOP ROLLS ═══
function rollShop(tier, count, extraFromComeback = 0, round = 1) {
  const total = Math.min(7, count + extraFromComeback);
  const result = [];

  if (tier >= 6) {
    const t6avail = unitPool.getAvailableAtTier(6);
    const lowerAvail = unitPool.getAvailablePool(5);
    if (t6avail.length > 0) {
      const pick = t6avail[Math.floor(Math.random() * t6avail.length)];
      unitPool.take(pick.name);
      result.push(mkUnit(pick));
    } else if (lowerAvail.length > 0) {
      const pick = lowerAvail[Math.floor(Math.random() * lowerAvail.length)];
      unitPool.take(pick.name);
      result.push(mkUnit(pick));
    }
    for (let i = result.length; i < total; i++) {
      const useT6 = Math.random() < 0.20 && t6avail.length > 0;
      const pool = useT6 ? unitPool.getAvailableAtTier(6) : unitPool.getAvailablePool(5);
      if (pool.length === 0) continue;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      unitPool.take(pick.name);
      result.push(mkUnit(pick));
    }
  } else {
    for (let i = 0; i < total; i++) {
      const pool = unitPool.getAvailablePool(tier);
      if (pool.length === 0) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      unitPool.take(pick.name);
      result.push(mkUnit(pick));
    }
  }

  const chipCount = round >= 12 ? 3 : round >= 8 ? 3 : round >= 4 ? 2 : 1;
  for (let c = 0; c < chipCount; c++) result.push(rollAugmentChip(round));

  return result;
}

// ═══ SMART PVE AI ═══
const AI_ARCHETYPES = [
  { name: "Synth Engine",    primary: "SYNTH",     splash: "AUGMENTED", style: "scale" },
  { name: "Hacker Raid",     primary: "HACKER",    splash: "PSIONIC",   style: "disrupt" },
  { name: "Virus Swarm",     primary: "VIRUS",     splash: "DRONE",     style: "bleed" },
  { name: "Phantom Strike",  primary: "PHANTOM",   splash: "HACKER",    style: "burst" },
  { name: "Augmented Carry",  primary: "AUGMENTED", splash: "CONSTRUCT", style: "carry" },
  { name: "Drone Flood",     primary: "DRONE",     splash: "SYNTH",     style: "swarm" },
  { name: "Psionic Shield",  primary: "PSIONIC",   splash: "CONSTRUCT", style: "tank" },
  { name: "Construct Wall",  primary: "CONSTRUCT",  splash: "AUGMENTED", style: "tank" },
  { name: "Virus Hacker",    primary: "VIRUS",     splash: "HACKER",    style: "disrupt" },
  { name: "Phantom Psionic", primary: "PHANTOM",   splash: "PSIONIC",   style: "burst" },
];

function genEnemy(round, playerBoard) {
  const count = Math.min(MAX_BOARD_SIZE, round <= 2 ? 3 : round <= 4 ? 4 : round <= 7 ? 5 : round <= 10 ? 6 : 7);
  const maxTier = Math.min(6, round <= 3 ? 1 : round <= 5 ? 2 : round <= 7 ? 3 : round <= 10 ? 4 : round <= 14 ? 5 : 6);
  const goldenChance = round <= 5 ? 0 : round <= 10 ? 0.08 : round <= 15 ? 0.15 : 0.25;
  const modChance = round <= 4 ? 0 : round <= 8 ? 0.2 : round <= 12 ? 0.4 : 0.6;

  if (round <= 3) {
    const pool = U.filter(t => t.t === 1);
    const result = [];
    for (let i = 0; i < count; i++) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      result.push(mkUnit(pick));
    }
    if (round >= 2) result.forEach(u => { u.atk += round - 1; u.hp += round; u.maxHp += round; });
    return result;
  }

  const arch = AI_ARCHETYPES[(round * 7 + 3) % AI_ARCHETYPES.length];
  const primaryFaction = arch.primary;
  const splashFaction = arch.splash;

  const primaryCount = round <= 6 ? Math.min(count, 4) : round <= 10 ? Math.min(count, 5) : Math.min(count, 6);
  const splashCount = count - primaryCount;

  const primaryUnits = U.filter(t => t.f === primaryFaction && t.t <= maxTier);
  const splashUnits = U.filter(t => t.f === splashFaction && t.t <= maxTier);

  const pickUnits = (pool, n) => {
    if (pool.length === 0) return [];
    const sorted = [...pool].sort((a, b) => b.t - a.t);
    const result = [];
    const used = new Set();
    const carryCount = Math.min(2, Math.ceil(n / 3));
    for (let i = 0; i < carryCount && result.length < n; i++) {
      const candidates = sorted.filter(t => !used.has(t.name));
      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
      result.push(pick);
      used.add(pick.name);
    }
    const support = pool.filter(t => t.t <= Math.max(2, maxTier - 1) && !used.has(t.name));
    const anyRemaining = pool.filter(t => !used.has(t.name));
    const fillPool = support.length >= (n - result.length) ? support : anyRemaining;
    while (result.length < n && fillPool.length > 0) {
      const pick = fillPool.splice(Math.floor(Math.random() * fillPool.length), 1)[0];
      if (!used.has(pick.name)) {
        result.push(pick);
        used.add(pick.name);
      }
    }
    return result;
  };

  const pPicks = pickUnits(primaryUnits, primaryCount);
  const sPicks = pickUnits(splashUnits, splashCount);
  const allPicks = [...pPicks, ...sPicks];

  while (allPicks.length < count) {
    const fallback = U.filter(t => t.t <= maxTier);
    if (fallback.length === 0) break;
    allPicks.push(fallback[Math.floor(Math.random() * fallback.length)]);
  }

  const result = allPicks.map(tmpl => {
    const isGolden = Math.random() < goldenChance;
    const u = mkUnit(tmpl, isGolden);
    const statBonus = round <= 5 ? 1 : round <= 10 ? Math.floor(round * 0.6) : Math.floor(round * 0.8);
    u.atk += statBonus;
    u.hp += Math.floor(statBonus * 1.2);
    u.maxHp += Math.floor(statBonus * 1.2);
    if (Math.random() < modChance && MODS.length > 0) {
      u.mod = MODS[Math.floor(Math.random() * MODS.length)];
      if (u.mod.effect.atk) u.atk += u.mod.effect.atk;
      if (u.mod.effect.hp) { u.hp += u.mod.effect.hp; u.maxHp += u.mod.effect.hp; }
      if (u.mod.effect.shield) u.shield += u.mod.effect.shield;
    }
    return u;
  });

  result.sort((a, b) => b.hp - a.hp);
  return result;
}

// ═══ BOSS ENCOUNTERS ═══
const BOSSES = {
  5: {
    name: " FIREWALL PRIME",
    desc: "All enemies have Hardshell",
    gen: () => {
      const pool = U.filter(t => t.t <= 2);
      return Array.from({length:5}, () => {
        const u = mkUnit(pool[Math.floor(Math.random()*pool.length)]);
        u.hardshellActive = true;
        if(!u.kw.includes("hardshell")) u.kw.push("hardshell");
        u.hp += 3; u.maxHp += 3;
        return u;
      });
    }
  },
  10: {
    name: " THE SWARM",
    desc: "7 Drones that attack 3x each",
    gen: () => {
      const dronePool = U.filter(t => t.f === "DRONE" && t.t <= 3);
      return Array.from({length:7}, () => {
        const u = mkUnit(dronePool[Math.floor(Math.random()*dronePool.length)]);
        u.atk += 2; u.hp += 4; u.maxHp += 4;
        return u;
      });
    }
  },
  15: {
    name: " NULL POINTER",
    desc: "Every enemy has Malware",
    gen: () => {
      const pool = U.filter(t => t.t <= 4);
      return Array.from({length:6}, () => {
        const u = mkUnit(pool[Math.floor(Math.random()*pool.length)], Math.random() < 0.2);
        if(!u.kw.includes("malware")) u.kw.push("malware");
        u.atk += 3; u.hp += 5; u.maxHp += 5;
        return u;
      });
    }
  },
  20: {
    name: "THE ARCHITECT",
    desc: "Copies your board with +5/+5",
    gen: null
  },
};

export {
  MAX_BOARD_SIZE, POOL_COPIES, MODS,
  unitPool, rollShop, genEnemy, rollAugmentChip,
  AUGMENT_CHIPS, BOSSES, AI_ARCHETYPES
};
