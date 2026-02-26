import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import BattleArenaPixi from "./BattleArenaPixi";
import Codex from "./Codex";

// ═══ DATA IMPORTS (Phase 1: Single Source of Truth) ═══
import UNITS_DATA from './data/units.json';
import T7_UNITS_DATA from './data/t7-units.json';
import FACTIONS from './data/factions.json';
import KEYWORDS_DATA from './data/keywords.json';
import CHIPS_DATA from './data/chips.json';
import OPERATORS_DATA from './data/operators.json';
import MODS_DATA from './data/mods.json';
import CROSS_COMBOS from './data/combos.json';
import BREACHES_DATA from './data/breaches.json';
import NETWORK_EVENTS from './data/network-events.json';
import BOSSES_DATA from './data/bosses.json';
import CONFIG from './data/config.json';
import ABILITY_MAP from './data/unit-abilities.json';
import QUESTS_DATA from './data/quests.json';
import { setupInnateFlags, setAbilityMap } from './engine/AbilitySystem.js';
import { simCombat } from './engine/combat-esm.js';


const SFX={};
let _muted=false;let _vol=0.5;
// ═══ SOUND ARCHITECTURE ═══
// Voice = custom deep announcer ONLY (from generate-voices.cjs)
// SFX = sound effects for all combat events (from generate-sfx.cjs)
// Single voice channel: new voice stops previous — no overlap ever
const VOICE_ENABLED = false;
let _voiceAudio = null;
const playSound=(name,vol=0.5)=>{if(_muted)return;try{if(!SFX[name])SFX[name]=new Audio("/sounds/"+name+".mp3");SFX[name].volume=vol*_vol;SFX[name].currentTime=0;SFX[name].play().catch(()=>{});}catch(e){}};
const playKw=()=>{};
const playTrans=(name)=>playSound(name,0.6);
const playAnnouncer=()=>{};
const playOpVoice=(opId,vol=0.7)=>{if(_muted)return;try{if(_voiceAudio){_voiceAudio.pause();_voiceAudio=null;}const a=new Audio("/sounds/operators/op_"+opId+".mp3?v=2");a.volume=vol*_vol;a.play().catch(()=>{});_voiceAudio=a;a.onended=()=>{if(_voiceAudio===a)_voiceAudio=null;};}catch(e){}};
const playLanding=()=>playTrack("theme-landing",0.12);
const playCombatMusic=()=>switchTrack("theme-combat",0.18);
const playShopMusic=()=>switchTrack("theme",0.15);
let currentTrack=null,trackCheckInterval=null,currentTrackName=null;
const playTrack=(src,vol=0.15)=>{
  if(_muted)return;if(currentTrackName===src&&currentTrack&&!currentTrack.paused)return;currentTrackName=src;
  const nxt=new Audio("/sounds/"+src+".mp3");nxt.volume=0;nxt.loop=true;
  nxt.play().catch(()=>{});
  const tv=vol*_vol;let vi=0;const fi=setInterval(()=>{vi=Math.min(tv,vi+0.01);nxt.volume=vi;if(vi>=tv)clearInterval(fi);},30);
  if(currentTrack){const old=currentTrack;let vo=old.volume;const fo=setInterval(()=>{vo=Math.max(0,vo-0.008);try{old.volume=vo;}catch(e){}if(vo<=0){clearInterval(fo);try{old.pause();}catch(e){}}},50);}
  if(trackCheckInterval)clearInterval(trackCheckInterval);trackCheckInterval=null;
  currentTrack=nxt;
};
const switchTrack=(name,vol=0.15)=>{if(_muted)return;playTrack(name,vol);};
const stopTrack=()=>{if(trackCheckInterval)clearInterval(trackCheckInterval);trackCheckInterval=null;if(currentTrack){const old=currentTrack;currentTrack=null;currentTrackName=null;let v=old.volume;const fo=setInterval(()=>{v=Math.max(0,v-0.008);old.volume=v;if(v<=0){clearInterval(fo);old.pause();}},50);}};

// Old themeA/themeB removed  unified into playTrack/switchTrack system above

// ============================================================
// NEON ARENA v5  Contested Pool, Faction Identities, Scouting, Frontline/Backline
// ============================================================

const MAX_BOARD_SIZE = CONFIG.maxBoardSize;
const MAX_BENCH = CONFIG.maxBench;
const STARTING_HEALTH = CONFIG.startingHealth;
const STARTING_GOLD = CONFIG.startingGold;
const REROLL_COST = CONFIG.rerollCost;
const SCRAP9_LINES = CONFIG.shopkeeperLines;
const ENEMY_NAMES = CONFIG.enemyNames;
const COMBO_PAIRS = CONFIG.comboPairs;
const FACTION_LIST = CONFIG.factionList;
const MOD_LIST = CONFIG.modList;

// ═══ ROLE DATA — Class system layer ═══
const ROLES = {
  Vanguard:    { name: "Vanguard",    color: "#4488ff", icon: "🛡️", desc: "(2) 20% DR (4) Taunt 2 hits, team absorb +2" },
  Striker:     { name: "Striker",     color: "#ff4444", icon: "⚔️", desc: "(2) +1 ATK/attack (4) Strongest attacks 2×, +2 ATK" },
  Infiltrator: { name: "Infiltrator", color: "#aa44ff", icon: "🗡️", desc: "(2) Stealth, bypass front (4) Kill→reStealth, +3 backline dmg" },
  Architect:   { name: "Architect",   color: "#44ff88", icon: "🔧", desc: "(2) Shield by tier (4) Team +2 Shield, Architects +4" },
  Sentinel:    { name: "Sentinel",    color: "#ffaa00", icon: "⚡", desc: "(2) Random keyword (4) +2/+2, random keyword" },
};
const ROLE_LIST = ["Vanguard","Striker","Infiltrator","Architect","Sentinel"];

// ═══ UNIT DATA — Single source of truth from data files ═══
const T7_UNITS = T7_UNITS_DATA.map(u => ({
  name: u.name, f: u.faction, t: u.tier, a: u.atk, h: u.hp, e: u.emoji,
  kw: [...u.keywords], kwData: { ...u.kwData },
  _t7rule: u.t7rule || null, role: u.role || 'Sentinel'
}));

const U = UNITS_DATA.map(u => ({
  name: u.name, f: u.faction, t: u.tier, a: u.atk, h: u.hp, e: u.emoji,
  kw: [...u.keywords], kwData: { ...u.kwData }, innate: u.innate || "",
  _chipFree: u.chipFree || false, role: u.role || 'Sentinel'
}));

// Initialize ability system with structured data
setAbilityMap(ABILITY_MAP);

const SHOP_SIZE_BY_TIER = CONFIG.shopSizeByTier;
const TIER_UP_COST = CONFIG.tierUpCost;
const GOLD_PER_ROUND_BASE = CONFIG.goldPerRoundBase;
const getTimer = (round) => {
  const t = CONFIG.timerByRound;
  if (round <= t.early.maxRound) return t.early.seconds;
  if (round <= t.mid.maxRound) return t.mid.seconds;
  if (round <= t.late.maxRound) return t.late.seconds;
  return t.endgame.seconds;
};

// ═══ CONTESTED POOL SYSTEM (v5) ═══
const POOL_COPIES = CONFIG.poolCopies;
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

// ═══ AUGMENT CHIP SYSTEM (v6) ═══
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

// === BREACH SYSTEM ===
const BREACHES = BREACHES_DATA;

const BREACH_SVG = (() => {
  // Pure SVG path icons — no Unicode text, no encoding issues
  const defs = {
    steal:        {bg:"#ff2266", path:'<path d="M14 16L24 8L34 16L24 40Z" fill="FG" opacity="0.9"/><path d="M20 20L28 20L24 30Z" fill="BG"/>'},
    sabotage:     {bg:"#ff4444", path:'<polygon points="24,6 28,18 40,18 30,26 34,38 24,30 14,38 18,26 8,18 20,18" fill="FG" opacity="0.9"/>'},
    overclock:    {bg:"#ffcc00", path:'<path d="M26 6L20 22H30L18 42L28 24H18Z" fill="FG" opacity="0.9"/>'},
    duplicate:    {bg:"#00ff88", path:'<circle cx="24" cy="24" r="14" fill="none" stroke="FG" stroke-width="3"/><path d="M17 24H31M24 17V31" stroke="FG" stroke-width="3"/>'},
    glitch_market:{bg:"#cc44ff", path:'<rect x="12" y="12" width="24" height="24" rx="3" fill="none" stroke="FG" stroke-width="2.5" transform="rotate(45 24 24)"/>'},
    time_hack:    {bg:"#00bbff", path:'<circle cx="24" cy="24" r="14" fill="none" stroke="FG" stroke-width="2.5"/><path d="M24 14V24L32 28" stroke="FG" stroke-width="2.5" fill="none" stroke-linecap="round"/>'},
  };
  const out = {};
  for (const [id, d] of Object.entries(defs)) {
    const paths = d.path.replace(/FG/g, d.bg).replace(/BG/g, d.bg + '44');
    out[id] = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="10" fill="${d.bg}22" stroke="${d.bg}" stroke-width="2"/>${paths}</svg>`)}`;
  }
  return out;
})();


const KEYWORDS = KEYWORDS_DATA;

// --- ART ASSET PATHS --------------------------------------------
const ART = {
  unit: (name, faction) => { const c = name.replace(/^Golden /i,'').replace(/[^a-zA-Z0-9 ]/g,'').trim(); return `/art/units/unit_${faction.toLowerCase()}_${c.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+$/,'')}.png`; },
  op: (id) => `/art/operators/op_${id}.png`,
  faction: (f) => `/art/factions/faction_${f.toLowerCase()}.png`,
  kw: (k) => `/art/keywords/kw_${k}.png`,
    mod: (id) => `/art/mods/mod_${id}.png`,
  tier: (t) => `/art/tiers/tier_${t}.png`,
  bg: (screen) => `/art/backgrounds/bg_${screen}.png`,
  frame: (f) => `/art/frames/frame_${f.toLowerCase()}.png`,
  frameGolden: '/art/frames/frame_golden.png',
  combo: (f1, f2) => `/art/combos/combo_${f1.toLowerCase()}_${f2.toLowerCase()}.png`,
  ui: (id) => `/art/ui/ui_${id}.png`,
  anchor: (f, v) => `/art/anchors/anchor_${f}_v${v||1}.png`,
};


// Image component with text fallback
function Img({src, alt, className, style, fallback}) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    if (fallback) return <span className={className} style={{...style, display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,240,255,0.1)',borderRadius:'4px',fontWeight:700,fontSize:'0.6rem',color:'#00f0ff',textShadow:'0 0 4px rgba(0,240,255,0.4)'}}>{fallback}</span>;
    return <div className={className} style={{...style, background:'linear-gradient(135deg,#1a1a2e,#0d0d1a)',display:'flex',alignItems:'center',justifyContent:'center',color:'#335',fontSize:'1.5rem',fontWeight:700}}>?</div>;
  }
  return <img src={src} alt={alt||""} className={className} style={style} onError={() => setErr(true)} />;
}



// ============================================================
// OPERATORS  Pick 1 of 3 at game start, warps strategy
// ============================================================
const OPERATORS = OPERATORS_DATA;

// ============================================================
// MODS — imported from data files
// ============================================================
const MODS = MODS_DATA;



let uid = 0;
const gid = () => ++uid;

function mkUnit(tmpl, golden = false) {
  const m = golden ? 2 : 1;
  return { id: gid(), tn: tmpl.name, name: golden ? `Golden ${tmpl.name}` : tmpl.name,
    faction: tmpl.f, tier: tmpl.t, atk: tmpl.a * m, hp: tmpl.h * m, maxHp: tmpl.h * m,
    emoji: tmpl.e, golden, kw: [...tmpl.kw], kwData: { ...tmpl.kwData },
    mod: null, shield: 0, hardshellActive: tmpl.kw.includes("hardshell"),
    droneFirstMalware: false, _constructBonus: 0, _dodgeChance: 0, _overflowRatio: 0,
    _t7rule: tmpl._t7rule || null, _chipFree: tmpl._chipFree || false,
    role: tmpl.role || 'Sentinel', innate: tmpl.innate || null };
}

function rollShop(tier, count, extraFromComeback = 0, round = 1) {
  const total = Math.min(7, count + extraFromComeback);
  const result = [];

  // T6: guaranteed 1 legendary slot, 20% chance each additional slot
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
    // Normal tiers: draw from pool weighted by availability
    for (let i = 0; i < total; i++) {
      const pool = unitPool.getAvailablePool(tier);
      if (pool.length === 0) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      unitPool.take(pick.name);
      result.push(mkUnit(pick));
    }
  }

  // Augment chips appear in shop — keywords are gear, need plenty of options
  const chipCount = round >= 12 ? 3 : round >= 8 ? 3 : round >= 4 ? 2 : 1;
  for (let c = 0; c < chipCount; c++) result.push(rollAugmentChip(round));

  return result;
}

// ═══ SMART PVE AI ═══
// Builds coherent faction boards that scale with round, like a real player.
// Phases: Tutorial (R1-3) → Foundation (R4-6) → Midgame (R7-9) → Lategame (R10-15) → Endgame (R16-20)

const AI_ARCHETYPES = [
  // Each archetype: primary faction (4-6 units) + splash faction (1-3 units)
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

  // Rounds 1-3: Tutorial — weak random boards, no faction synergy needed
  if (round <= 3) {
    const pool = U.filter(t => t.t === 1);
    const result = [];
    for (let i = 0; i < count; i++) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      result.push(mkUnit(pick));
    }
    // Tiny stat buff for R2-3
    if (round >= 2) result.forEach(u => { u.atk += round - 1; u.hp += round; u.maxHp += round; });
    return result;
  }

  // Pick an archetype — seeded by round so it feels consistent but varied
  const arch = AI_ARCHETYPES[(round * 7 + 3) % AI_ARCHETYPES.length];
  const primaryFaction = arch.primary;
  const splashFaction = arch.splash;

  // Determine faction split: aim for faction thresholds
  // 4 primary + 1 splash at R4-6, 4 primary + 2 splash at R7-9, 5-6 primary + 1-2 splash at R10+
  const primaryCount = round <= 6 ? Math.min(count, 4) : round <= 10 ? Math.min(count, 5) : Math.min(count, 6);
  const splashCount = count - primaryCount;

  // Build primary faction units — prefer high-tier carries + low-tier support
  const primaryUnits = U.filter(t => t.f === primaryFaction && t.t <= maxTier);
  const splashUnits = U.filter(t => t.f === splashFaction && t.t <= maxTier);

  // Sort by tier descending — pick carries first, then fill with support
  const pickUnits = (pool, n) => {
    if (pool.length === 0) return [];
    const sorted = [...pool].sort((a, b) => b.t - a.t);
    const result = [];
    const used = new Set();
    // Pick 1-2 highest tier as carries
    const carryCount = Math.min(2, Math.ceil(n / 3));
    for (let i = 0; i < carryCount && result.length < n; i++) {
      const candidates = sorted.filter(t => !used.has(t.name));
      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))]; // Top 3 randomized
      result.push(pick);
      used.add(pick.name);
    }
    // Fill rest with varied tiers (prefer T1-T3 support)
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

  // If we couldn't fill, pad with random units
  while (allPicks.length < count) {
    const fallback = U.filter(t => t.t <= maxTier);
    if (fallback.length === 0) break;
    allPicks.push(fallback[Math.floor(Math.random() * fallback.length)]);
  }

  // Create actual units
  const result = allPicks.map(tmpl => {
    const isGolden = Math.random() < goldenChance;
    const u = mkUnit(tmpl, isGolden);

    // Progressive stat scaling — simulates economy/interest advantage
    const statBonus = round <= 5 ? 1 : round <= 10 ? Math.floor(round * 0.6) : Math.floor(round * 0.8);
    u.atk += statBonus;
    u.hp += Math.floor(statBonus * 1.2);
    u.maxHp += Math.floor(statBonus * 1.2);

    // Mods on higher rounds
    if (Math.random() < modChance && MODS.length > 0) {
      u.mod = MODS[Math.floor(Math.random() * MODS.length)];
      if (u.mod.effect.atk) u.atk += u.mod.effect.atk;
      if (u.mod.effect.hp) { u.hp += u.mod.effect.hp; u.maxHp += u.mod.effect.hp; }
      if (u.mod.effect.shield) u.shield += u.mod.effect.shield;
    }

    return u;
  });

  // Position: tanks/taunt front, carries back (sort by HP descending — tanky units first)
  result.sort((a, b) => b.hp - a.hp);

  return result;
}


// ============================================================
// BOSS ENCOUNTERS  R5, R10, R15, R20
// ============================================================
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
    gen: null // Special: copies player board
  },
};


// setupInnateFlags — now imported from engine/AbilitySystem.js



function ShopTimer({ seconds, onExpire }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => { setLeft(seconds); }, [seconds]);
  useEffect(() => {
    if (left <= 0) { onExpire(); return; }
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onExpire]);
  const pct = (left / seconds) * 100;
  const color = left > 15 ? "#00f0ff" : left > 7 ? "#ffaa00" : "#ff4444";
  const deg = (pct / 100) * 360;
  const urgent = left <= 7;
  return (
    <div className={"timer-ring-wrap"+(urgent?" timer-urgent":"")}>
      <div className="timer-ring" style={{background:`conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.05) ${deg}deg)`}}>
        <div className="timer-ring-inner">
          <div className="timer-ring-num" style={{color}}>{left}</div>
          <div className="timer-ring-label">SEC</div>
        </div>
      </div>
    </div>
  );
}

// ========== BATTLE ARENA ==========
// ========== UNIT CARD ==========
// Hearthstone-style: hover = card pops up bigger. Keywords show inside card.
function Card({unit, sz="board", onClick, showCost, ownedCount, onDragStart, _dragging, _anyDrag, _tapSelected, onHover, synActive, comboActive}) {
  const cardRef = useRef(null);
  const fc = FACTIONS[unit.faction];
  const isG = unit.golden;
  const dim = sz==="shop" ? {w:140,ah:165,fs:'0.8rem',sf:'0.9rem',kws:20} :
              sz==="board" ? {w:135,ah:155,fs:'0.82rem',sf:'0.92rem',kws:20} :
                             {w:105,ah:115,fs:'0.72rem',sf:'0.82rem',kws:17};
  const artSrc = ART.unit(unit.name, unit.faction);
  // Defensive keyword border color
  const defKw = unit.kw?.includes('firewall') ? 'rgba(0,240,255,0.5)' : unit.kw?.includes('taunt') ? 'rgba(255,136,0,0.5)' : unit.kw?.includes('hardshell') ? 'rgba(102,136,255,0.5)' : null;
  const kwAbbr = {firewall:"FW",deadswitch:"DS",bootseq:"BS",initprot:"IP",hardshell:"HS",malware:"MW",link:"LK",execute:"EX",cleave:"CL",sniper:"SN",splash:"SP",regen:"RG",stealth:"ST",taunt:"TN",adapt:"AD"};
  return (
    <div ref={cardRef} className={`c c-${sz} ${isG?'c-g':''} ${_dragging?'c-dragging':''} ${_tapSelected?'c-tap-selected':''} ${synActive?'c-syn-active':''} ${comboActive?'c-combo-active':''}`}
         data-unit-id={unit.id}
         style={{'--fc':fc?.color||'#888','--fcd':fc?.dark||'#222',width:dim.w, ...(defKw ? {borderColor:defKw,boxShadow:`inset 0 0 12px ${defKw.replace('0.5','0.15')}, 0 0 8px ${defKw.replace('0.5','0.1')}`} : {})}}
         onMouseEnter={()=>{if(!_anyDrag&&onHover)onHover(unit);}} onMouseLeave={()=>{if(onHover)onHover(null);}}
         onClick={(e)=>{if(window._naDragActive||!onClick)return;onClick();}}
         onMouseDown={(e)=>{if(onDragStart)onDragStart(e);}}>
      <div className="c-aura"/>
      <Img src={isG ? ART.frameGolden : ART.frame(unit.faction)} className="c-frame"/>
      <div className="c-art" style={{height:dim.ah}}>
        <Img src={artSrc} alt={unit.name} className="c-img" fallback={unit.faction?.[0]||"?"}/>
        <div className="c-grad"/>

        {/* ═══ SOCKET ZONE A — top row: tier left, keywords right ═══ */}
        <div className="c-tier"><Img src={ART.tier(unit.tier)} className="c-tier-i" fallback={`T${unit.tier}`}/><span>T{unit.tier}</span></div>
        {unit.role && ROLES[unit.role] && <div className="c-role" style={{color:ROLES[unit.role].color}} title={unit.role + ': ' + ROLES[unit.role].desc}>{ROLES[unit.role].icon}</div>}
        {unit.kw?.length>0&&<div className="c-kw-grid">{unit.kw.slice(0,6).map(k=>
          <Img key={k} src={KEYWORDS[k]?.img || ART.kw(k)} alt={k} className="c-kw-i" fallback={kwAbbr[k]||'?'} style={{width:dim.kws,height:dim.kws}}/>
        )}</div>}

        {/* ═══ SOCKET ZONE C — bottom-left: mod, bottom-right: owned ═══ */}
        {unit.mod&&<div className="c-mod-socket"><Img src={typeof unit.mod==='object'?ART.mod(unit.mod.id):ART.mod(unit.mod)} className="c-mod-socket-i"/></div>}
        {ownedCount>0&&<div className="c-own">{ownedCount}/3</div>}
        {/* Kill counter + veteran stars */}
        {(unit._lifetimeKills||0)>0&&<div className="c-kills" title={`${unit._lifetimeKills} lifetime kills${unit._lifetimeKills>=3?' • Sell bounty: +'+(Math.floor(unit._lifetimeKills/3))+'g':''}`}>💀{unit._lifetimeKills}{unit._lifetimeKills>=10?'⭐⭐⭐':unit._lifetimeKills>=6?'⭐⭐':unit._lifetimeKills>=3?'⭐':''}</div>}

        {/* ═══ SOCKET ZONE D — name overlay (always present) ═══ */}
        <div className="c-nover">
          <Img src={ART.faction(unit.faction)} className="c-fi"/>
          <span className="c-name" style={{color:fc?.color||'#888',fontSize:dim.fs}}>{unit.name}</span>
        </div>
      </div>
      <div className="c-bar" style={{fontSize:dim.sf}}>
        <span className="c-atk"><Img src={ART.ui("hp_heart")} className="c-stat-i" style={{filter:"hue-rotate(-60deg) saturate(2)"}}/>{unit.atk}</span>
        <span className="c-hp"><Img src={ART.ui("hp_heart")} className="c-stat-i"/>{unit.hp}</span>
        {unit.shield>0&&<span className="c-sh">🛡{unit.shield}</span>}
        {showCost&&<span className="c-cost"><Img src={ART.ui("gold_coin")} className="c-stat-i"/>{unit.tier}g</span>}
      </div>
      {unit.innate&&sz==="shop"&&<div className="c-innate">{unit.innate}</div>}
      <div className="c-strip" style={{background:`linear-gradient(90deg,transparent,${fc?.color||'#888'},transparent)`}}/>
      {isG&&<div className="c-shim"/>}
    </div>
  );
}

// ========== MAIN GAME ==========

// ═══ V3 UI COMPONENTS ═══

const VENDOR_LINES = [
  "These units won't buy themselves.",
  "Upgrade or die. Your choice.",
  "I've seen better boards... in tutorial.",
  "Gold is temporary. Victory is forever.",
  "That board? Bold strategy.",
  "You saving gold or just afraid to spend?",
  "Nice synergies... if this were round 2.",
  "CONSTRUCT scaling? I see you like living dangerously.",
  "Triple incoming? I can feel it.",
  "Last shop before combat. Choose wisely.",
];

// ========== ASSET AUDIT PANEL (F2) ==========
// Tests every image + sound path the game uses — green=loaded, red=broken
function AssetAudit({onClose}) {
  const [results, setResults] = useState({});
  const [testing, setTesting] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'broken'
  const [hovPath, setHovPath] = useState('');
  useEffect(() => {
    const paths = {};
    // Factions
    paths.factions = ['synth','hacker','augmented','drone','psionic','virus','phantom','construct','neutral'].map(f => ({path: ART.faction(f.toUpperCase()), label: f}));
    // Keywords
    paths.keywords = Object.entries(KEYWORDS).map(([k,v]) => ({path: v.img || ART.kw(k), label: k}));
    // Mods
    paths.mods = MOD_LIST.map(m => ({path: ART.mod(m), label: m}));
    // Tiers
    paths.tiers = [1,2,3,4,5,6,7].map(t => ({path: ART.tier(t), label: 'T'+t}));
    // Frames
    paths.frames = [...['synth','hacker','augmented','drone','psionic','virus','phantom','construct','neutral'].map(f => ({path: ART.frame(f), label: f})), {path: ART.frameGolden, label: 'golden'}];
    // UI icons
    paths.ui = ['hp_heart','gold_coin','freeze_crystal','reroll_dice'].map(u => ({path: ART.ui(u), label: u}));
    // Operators
    paths.operators = OPERATORS.map(op => ({path: ART.op(op.id), label: op.id}));
    paths.operators.push({path: '/art/operators/op_scrap9.png', label: 'scrap9'});
    // Combos
    paths.combos = COMBO_PAIRS.map(([a,b]) => ({path: ART.combo(a,b), label: a+'+'+b}));
    // Breach SVGs
    paths.breaches = BREACHES.map(b => ({path: BREACH_SVG[b.id], label: b.id}));
    // Anchors (faction legends)
    paths.anchors = [];
    ['synth','hacker','augmented','drone','psionic','virus','phantom','construct','neutral'].forEach(f => {
      [1,2,3].forEach(v => paths.anchors.push({path: ART.anchor(f,v), label: f+'_v'+v}));
    });
    // All units (including T7)
    paths.units = [...U, ...T7_UNITS].map(u => ({path: ART.unit(u.name, u.f), label: u.name.slice(0,14)}));
    // Sounds (tested via fetch HEAD)
    paths.sounds = [
      'buy','sell','reroll','freeze','tier-up','mod-drop','golden-merge',
      'trans-to-shop','trans-to-combat','trans-enter','trans-exit',
      'sfx-combo','theme','theme-landing','theme-combat'
    ].map(s => ({path: '/sounds/'+s+'.mp3', label: s, isAudio: true}));
    // SFX
    paths.sfx = [
      'atk-swoosh','atk-impact','sfx-fight-start','sfx-malware','sfx-execute','sfx-deadswitch'
    ].map(s => ({path: '/sounds/sfx/'+s+'.mp3', label: s, isAudio: true}));

    // Test all paths
    const res = {};
    let pending = 0;
    const checkDone = () => { if(pending<=0){setResults(r=>({...res}));setTesting(false);} };
    for (const [cat, items] of Object.entries(paths)) {
      res[cat] = items.map(item => ({...item, status: 'loading'}));
      items.forEach((item, i) => {
        pending++;
        if (item.path?.startsWith('data:')) {
          res[cat][i].status = item.path.length > 50 ? 'ok' : 'err';
          pending--; checkDone(); return;
        }
        if (item.isAudio) {
          // Test audio via fetch HEAD
          fetch(item.path, {method:'HEAD'}).then(r => {
            res[cat][i].status = r.ok ? 'ok' : 'err';
          }).catch(() => { res[cat][i].status = 'err'; }).finally(() => { pending--; if(pending%10===0) setResults({...res}); checkDone(); });
          return;
        }
        const img = new Image();
        img.onload = () => { res[cat][i].status = 'ok'; pending--; if(pending%20===0) setResults({...res}); checkDone(); };
        img.onerror = () => { res[cat][i].status = 'err'; pending--; if(pending%20===0) setResults({...res}); checkDone(); };
        img.src = item.path;
      });
    }
    setResults(res);
  }, []);

  const all = Object.values(results).flat();
  const totalOk = all.filter(r => r.status==='ok').length;
  const totalErr = all.filter(r => r.status==='err').length;
  const total = all.length;

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,0.97)',overflow:'auto',padding:20,fontFamily:"'Orbitron',monospace",color:'#ccc'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div>
          <span style={{fontSize:'1.2rem',fontWeight:900,color:'#00f0ff',letterSpacing:2}}>ASSET AUDIT</span>
          <span style={{marginLeft:16,fontSize:'0.85rem'}}>
            <span style={{color:'#44ff66'}}>{totalOk} OK</span>
            {totalErr > 0 && <span style={{color:'#ff4444',marginLeft:12}}>{totalErr} BROKEN</span>}
            <span style={{color:'#666',marginLeft:12}}>/ {total} total</span>
            {testing && <span style={{color:'#ffcc00',marginLeft:12,animation:'blink 1s infinite'}}>SCANNING...</span>}
          </span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setFilter(f=>f==='all'?'broken':'all')} style={{background:filter==='broken'?'#ff4444':'#333',color:'#fff',border:'1px solid #555',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontFamily:"'Orbitron',monospace",fontWeight:700,fontSize:'0.65rem'}}>{filter==='broken'?'SHOWING BROKEN':'SHOW ALL'}</button>
          <button onClick={onClose} style={{background:'#ff4444',color:'#fff',border:'none',borderRadius:6,padding:'5px 14px',cursor:'pointer',fontFamily:"'Orbitron',monospace",fontWeight:700,fontSize:'0.7rem'}}>CLOSE (F2)</button>
        </div>
      </div>
      {hovPath && <div style={{background:'rgba(255,255,255,0.06)',padding:'4px 10px',borderRadius:4,fontSize:'0.55rem',color:'#ff8844',marginBottom:8,wordBreak:'break-all'}}>{hovPath}</div>}
      {Object.entries(results).map(([cat, items]) => {
        const shown = filter==='broken' ? items.filter(i=>i.status==='err') : items;
        const errs = items.filter(i => i.status==='err').length;
        if (filter==='broken' && errs===0) return null;
        const isAudio = items[0]?.isAudio;
        return (
          <div key={cat} style={{marginBottom:14}}>
            <div style={{fontSize:'0.75rem',fontWeight:700,color:errs>0?'#ff4444':'#44ff66',marginBottom:5,letterSpacing:1}}>
              {(isAudio?'🔊 ':'')+cat.toUpperCase()} ({items.length}) {errs>0?<span style={{color:'#ff4444'}}>— {errs} MISSING</span>:<span style={{color:'#44ff66'}}>ALL OK</span>}
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
              {shown.map((item, i) => (
                <div key={i} title={item.path}
                  onMouseEnter={()=>setHovPath(item.path)} onMouseLeave={()=>setHovPath('')}
                  style={{width:cat==='units'?52:48,height:cat==='units'?62:56,border:`2px solid ${item.status==='ok'?'#44ff6655':item.status==='err'?'#ff4444':'#ffcc0044'}`,borderRadius:5,overflow:'hidden',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:item.status==='err'?'rgba(255,0,0,0.1)':'rgba(0,0,0,0.3)',cursor:'pointer'}}>
                  {isAudio ? (
                    <div style={{fontSize:'1.2rem',color:item.status==='ok'?'#44ff66':'#ff4444'}}>{item.status==='ok'?'♪':'✗'}</div>
                  ) : item.path?.startsWith('data:') ? (
                    <img src={item.path} alt="" style={{width:30,height:30,objectFit:'contain'}}/>
                  ) : (
                    <img src={item.path} alt="" style={{width:cat==='units'?44:32,height:cat==='units'?44:32,objectFit:'cover'}} onError={e=>{e.target.style.display='none';}}/>
                  )}
                  <div style={{fontSize:'0.3rem',color:item.status==='err'?'#ff6644':'#778',textAlign:'center',lineHeight:1.1,maxWidth:'100%',overflow:'hidden',whiteSpace:'nowrap'}}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!testing && totalErr===0 && <div style={{textAlign:'center',padding:40,fontSize:'1.1rem',color:'#44ff66',fontWeight:700,letterSpacing:2}}>ALL {total} ASSETS VERIFIED</div>}
      {!testing && totalErr>0 && (<div style={{marginTop:16,background:'rgba(255,0,0,0.06)',border:'1px solid #ff444466',borderRadius:10,padding:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <span style={{fontSize:'0.85rem',fontWeight:700,color:'#ff4444',letterSpacing:1}}>MISSING FILES ({totalErr})</span>
          <button onClick={()=>{const paths=Object.values(results).flat().filter(r=>r.status==='err').map(r=>r.path).join('\n');navigator.clipboard.writeText(paths).then(()=>alert('Copied '+totalErr+' paths to clipboard!'));}} style={{background:'#ff6644',color:'#fff',border:'none',borderRadius:6,padding:'5px 14px',cursor:'pointer',fontFamily:"'Orbitron',monospace",fontWeight:700,fontSize:'0.65rem'}}>COPY ALL PATHS</button>
        </div>
        <div style={{fontFamily:'monospace',fontSize:'0.55rem',color:'#ff8866',lineHeight:1.6,maxHeight:300,overflow:'auto',background:'rgba(0,0,0,0.4)',borderRadius:6,padding:10}}>
          {Object.entries(results).map(([cat, items]) => {
            const broken = items.filter(i=>i.status==='err');
            if(broken.length===0) return null;
            return <div key={cat}><div style={{color:'#ff4444',fontWeight:700,marginTop:4}}>{cat.toUpperCase()} ({broken.length} missing):</div>{broken.map((b,i)=><div key={i} style={{color:'#ff8866',paddingLeft:8}}>{b.path}</div>)}</div>;
          })}
        </div>
      </div>)}
    </div>
  );
}

function EmptySlot({className, style}) {
  return (
    <div className={"empty-slot " + (className||"")} style={style}>
      <span className="empty-slot-text">+</span>
    </div>
  );
}

function SynergyBar({board, round, gameState}) {
  const counts = {};
  const rawCounts = {};
  const roleCounts = {};
  const wildcards = [];
  (board||[]).forEach(u => {
    if (u && u.faction && u.faction !== 'NEUTRAL') {
      counts[u.faction] = (counts[u.faction]||0) + 1;
      rawCounts[u.faction] = (rawCounts[u.faction]||0) + 1;
    }
    if (u && u.role) {
      roleCounts[u.role] = (roleCounts[u.role]||0) + 1;
    }
    if (u && (u._wildcard || (u.innate && (u.innate.toLowerCase().includes("counts as any faction") || u.innate.toLowerCase().includes("counts as every faction"))))) {
      wildcards.push(u);
    }
  });
  // Wildcard: each picks the ONE faction with the highest count (mirrors engine logic)
  const NNF = ["SYNTH","HACKER","AUGMENTED","DRONE","PSIONIC","VIRUS","PHANTOM","CONSTRUCT"];
  let wildcardFaction = null;
  wildcards.forEach(() => {
    let bestF = null, bestC = 0;
    NNF.forEach(f => { if ((counts[f]||0) > bestC) { bestC = counts[f]; bestF = f; } });
    if (bestF) { counts[bestF] += 1; wildcardFaction = bestF; }
  });
  return (
    <div className="synergy-bar">
      <div className="synergy-row">
        {Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([f, ct]) => {
          const fc = FACTIONS[f];
          if (!fc) return null;
          const active = ct >= 2;
          const raw = rawCounts[f] || 0;
          const boosted = ct > raw;
          return (
            <div key={f} className={"synergy-badge" + (active ? " active" : "")} style={{'--fc': fc.color}} title={boosted ? `${raw} real + ${ct-raw} from Wildcard` : undefined}>
              <Img src={ART.faction(f)} alt="" style={{width:20,height:20,objectFit:'contain'}}/>
              <span className="syn-name">{fc.n || f.charAt(0) + f.slice(1).toLowerCase()}</span>
              <span className="syn-count">{boosted ? <>{raw}<span style={{color:'#ffcc00',fontSize:'0.55rem'}}>+{ct-raw}</span></> : ct}</span>
            </div>
          );
        })}
        {Object.keys(counts).length > 0 && Object.keys(roleCounts).length > 0 && (
          <div className="synergy-divider"/>
        )}
        {ROLE_LIST.map(r => {
          const ct = roleCounts[r] || 0;
          if (ct === 0) return null;
          const rd = ROLES[r];
          const active = ct >= 2;
          const high = ct >= 4;
          return (
            <div key={r} className={"synergy-badge role-badge" + (active ? " active" : "") + (high ? " high" : "")} style={{'--fc': rd.color}} title={rd.desc}>
              <span className="role-icon">{rd.icon}</span>
              <span className="syn-name">{rd.name}</span>
              <span className="syn-count">{ct}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Leaderboard({players, myId}) {
  const sorted = [...(players||[])].sort((a,b) => (b.hp||0) - (a.hp||0));
  return (
    <div>
      <div className="sb-title">STANDINGS</div>
      {sorted.map((p, i) => {
        const isMe = p.id === myId;
        return (
          <div key={p.id||i} className={"lb-row" + (isMe ? " me" : "")}>
            <span className="lb-rk">#{i+1}</span>
            <span className="lb-nm" style={{color: isMe ? '#00f0ff' : '#889'}}>{p.name || ('Player '+(i+1))}</span>
            <div className="lb-bar"><div className="lb-fill" style={{width: ((p.hp||0)/45*100)+'%', background: (p.hp||0)>30?'#44ff66':(p.hp||0)>15?'#ffaa00':'#ff4444'}}/></div>
            <span className="lb-hp">{p.hp||0}</span>
          </div>
        );
      })}
    </div>
  );
}

function AnchorShowcase({onHover}) {
  return (
    <div>
      <div className="sb-title" style={{marginTop:8}}>FACTION LEGENDS</div>
      <div className="anchor-grid">
        {FACTION_LIST.map(f => {
          const fd = FACTIONS[f.toUpperCase()];
          return (
            <div key={f} className="anchor-grid-wrap"
              onMouseEnter={()=>onHover&&onHover({type:'faction', name:fd?.name||f, color:fd?.color||'#888', desc:fd?.desc||'', id:f.toUpperCase()})}
              onMouseLeave={()=>onHover&&onHover(null)}>
              <Img src={ART.anchor(f, 1)} alt="" style={{borderColor: (fd?.color||'#555')+'55'}}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComboSidebar({onHover, activeCombos=[]}) {
  const activeNames = new Set(activeCombos.map(c=>c.name));
  return (
    <>
      <div className="sb-title">COMBOS</div>
      <div className="combo-grid">
        {COMBO_PAIRS.map(([a,b], i) => {
          const cc = CROSS_COMBOS.find(c => c.factions[0]===a.toUpperCase()&&c.factions[1]===b.toUpperCase());
          const isActive = cc && activeNames.has(cc.name);
          return (
            <div key={i} className={"combo-grid-item"+(isActive?" combo-active":"")}
              style={{'--c1':FACTIONS[a.toUpperCase()]?.color||'#888','--c2':FACTIONS[b.toUpperCase()]?.color||'#888'}}
              onMouseEnter={()=>onHover&&onHover({type:'combo', name:cc?.name||`${a}+${b}`, desc:cc?.desc||'', factions:[a.toUpperCase(),b.toUpperCase()], active:isActive, min:cc?.min||[2,2]})}
              onMouseLeave={()=>onHover&&onHover(null)}>
              <Img src={ART.combo(a,b)} alt="" style={{width:'100%',height:'100%',objectFit:'contain',borderRadius:4}}/>
            </div>
          );
        })}
      </div>
      <div className="sb-title" style={{marginTop:4,fontSize:'0.7rem'}}>MODS</div>
      <div className="mod-grid">
        {MOD_LIST.map(m => {
          const md = MODS.find(x=>x.id===m);
          return (
            <div key={m} className="mod-grid-wrap"
              onMouseEnter={()=>onHover&&onHover({type:'mod', name:md?.name||m, desc:md?.desc||'', id:m})}
              onMouseLeave={()=>onHover&&onHover(null)}>
              <Img src={ART.mod(m)} alt={m}/>
            </div>
          );
        })}
      </div>
    </>
  );
}

const styles = `
/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   NEON ARENA v3 — Genre-Defining Auto-Battler UI
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&display=swap');

/* ── ROOT ── */
.neon-arena{background:#050810;font-family:'Rajdhani',sans-serif;color:#dde4ec;height:100vh;overflow-x:hidden;overflow-y:hidden;position:relative;display:flex;flex-direction:column;}

/* â”€â”€ BACKGROUND â”€â”€ */
.na-bg-layer{position:fixed;inset:0;z-index:0;}
.na-bg-img{position:absolute;inset:0;background:url('/art/backgrounds/bg_shop.png') center/cover no-repeat,#050810;filter:brightness(0.45) saturate(0.5);}
.na-bg-ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,8,16,0.8),rgba(5,8,16,0.6) 50%,rgba(5,8,16,0.75));}

/* â”€â”€ HEADER (thin bar) â”€â”€ */
.game-header{position:relative;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:3px 16px;background:linear-gradient(180deg,rgba(0,0,0,0.6),rgba(0,0,0,0.25));border-bottom:1px solid rgba(0,240,255,0.1);backdrop-filter:blur(10px);flex-shrink:0;height:30px;}
.hd-left{display:flex;align-items:center;gap:8px;}
.game-title{font-family:'Orbitron',sans-serif;font-weight:900;font-size:0.8rem;letter-spacing:3px;background:linear-gradient(90deg,#00f0ff,#ff00ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.hd-badge{font-family:'Orbitron',sans-serif;font-size:0.4rem;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(0,240,255,0.08);color:#00f0ff;border:1px solid rgba(0,240,255,0.2);letter-spacing:1.5px;}
.hd-center{display:flex;align-items:center;gap:6px;font-family:'Orbitron',sans-serif;font-weight:800;}
.hd-rnd{font-size:0.65rem;color:#ff00ff;letter-spacing:1px;}
.hd-mi{width:14px;height:14px;object-fit:contain;}
.hd-gold{font-size:0.7rem;color:#ffcc00;}
.hd-win{font-size:0.6rem;color:#44ff66;}
.hd-cb{font-size:0.55rem;color:#ff8800;}
.hd-free{font-size:0.5rem;color:#00bbff;letter-spacing:0.5px;}
.hd-sep{width:1px;height:12px;background:rgba(255,255,255,0.08);}
.hd-right{display:flex;align-items:center;gap:5px;}
.hd-btn{font-family:'Orbitron',sans-serif;font-size:0.45rem;font-weight:700;padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid rgba(0,240,255,0.3);background:rgba(0,240,255,0.08);letter-spacing:1px;}
.hd-btn-x{color:#ff4444;border-color:#ff4444;background:rgba(255,68,68,0.1);}
.hd-vol{width:45px;height:3px;accent-color:#00f0ff;cursor:pointer;vertical-align:middle;}

/* Timer */
.timer-ring-wrap{flex-shrink:0;}
.timer-ring{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px rgba(0,240,255,0.2);}
.timer-ring-inner{width:32px;height:32px;border-radius:50%;background:rgba(5,8,16,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;}
.timer-ring-num{font-family:'Orbitron',sans-serif;font-size:0.85rem;font-weight:900;line-height:1;}
.timer-ring-label{font-family:'Orbitron',sans-serif;font-size:0.35rem;font-weight:600;color:#556;letter-spacing:2px;margin-top:1px;}
.timer-urgent{animation:timer-shake 0.5s ease-in-out infinite;}
@keyframes timer-shake{0%,100%{transform:translateX(0);}25%{transform:translateX(-2px);}75%{transform:translateX(2px);}}

/* â”€â”€ SYNERGY BAR â”€â”€ */
.synergy-bar{position:relative;z-index:10;display:flex;align-items:center;justify-content:center;padding:3px 20px;background:linear-gradient(90deg,transparent,rgba(0,240,255,0.04),transparent);border-bottom:1px solid rgba(0,240,255,0.06);flex-shrink:0;}
.synergy-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.synergy-badge{display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.04);transition:all 0.3s;}
.synergy-badge.active{border-color:var(--fc);background:linear-gradient(135deg,rgba(0,0,0,0.4),color-mix(in srgb,var(--fc) 10%,transparent));box-shadow:0 0 10px color-mix(in srgb,var(--fc) 15%,transparent);}
.synergy-badge img{width:20px;height:20px;object-fit:contain;filter:brightness(0.5);}
.synergy-badge.active img{filter:brightness(1.3);}
.synergy-badge .syn-name{font-family:'Orbitron',sans-serif;font-size:0.55rem;font-weight:700;color:#556;}
.synergy-badge.active .syn-name{color:var(--fc);}
.synergy-badge .syn-count{font-family:'Orbitron',sans-serif;font-size:0.65rem;font-weight:900;color:#334;}
.synergy-badge.active .syn-count{color:var(--fc);}
.synergy-divider{width:1px;height:18px;background:rgba(255,255,255,0.08);margin:0 4px;flex-shrink:0;}
.role-badge .role-icon{font-size:0.8rem;line-height:1;}
.role-badge.high{border-color:var(--fc);box-shadow:0 0 12px color-mix(in srgb,var(--fc) 25%,transparent),inset 0 0 8px color-mix(in srgb,var(--fc) 10%,transparent);}

/* â”€â”€ BODY 3-COL â”€â”€ */
.game-body{position:relative;display:flex;gap:8px;padding:4px 12px;flex:1;min-height:0;overflow:hidden;}

/* LEFT SIDEBAR */
.sidebar-left{width:195px;flex-shrink:0;display:flex;flex-direction:column;gap:5px;overflow-y:auto;scrollbar-width:none;}
.sidebar-left::-webkit-scrollbar{width:0;}
.sb-title{font-family:'Orbitron',sans-serif;font-size:0.75rem;font-weight:800;letter-spacing:2px;color:#aab;text-align:center;margin-bottom:4px;text-shadow:0 0 10px rgba(0,240,255,0.2);}
.lb-row{display:flex;align-items:center;gap:5px;padding:4px 8px;border-radius:5px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.03);font-size:0.85rem;font-weight:600;}
.lb-row.me{background:rgba(0,240,255,0.06);border-color:rgba(0,240,255,0.15);}
.lb-rk{width:26px;color:#889;font-family:'Orbitron',sans-serif;font-size:0.8rem;font-weight:800;}
.lb-nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#dde;}
.lb-bar{flex:0 0 40px;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;}
.lb-fill{height:100%;border-radius:3px;transition:width 0.5s;}
.lb-hp{width:30px;text-align:right;color:#ff4444;font-family:'Orbitron',sans-serif;font-size:0.8rem;font-weight:800;}
.anchor-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:4px;}
.anchor-grid img,.anchor-grid span{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;border:1px solid;opacity:0.55;transition:all 0.3s;cursor:pointer;display:block;}
.anchor-grid-wrap:hover img,.anchor-grid-wrap:hover span{opacity:1;box-shadow:0 0 14px rgba(0,240,255,0.35);}

/* RIGHT SIDEBAR */
.sidebar-right{width:220px;flex-shrink:0;display:flex;flex-direction:column;gap:4px;overflow:hidden;}
.sidebar-right::-webkit-scrollbar{width:0;}
.combo-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;flex-shrink:0;}
.combo-grid-item{aspect-ratio:1;border-radius:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.04);padding:3px;cursor:pointer;transition:all 0.25s;position:relative;overflow:hidden;}
.combo-grid-item:hover{border-color:rgba(255,255,255,0.2);transform:scale(1.15);z-index:5;box-shadow:0 0 12px rgba(0,240,255,0.2);}
.combo-grid-item.combo-active{border-color:rgba(68,255,102,0.4);box-shadow:0 0 10px rgba(68,255,102,0.2),inset 0 0 6px rgba(68,255,102,0.1);background:rgba(68,255,102,0.06);}
.combo-grid-item.combo-active::after{content:'';position:absolute;inset:0;border-radius:5px;background:radial-gradient(ellipse at center,rgba(68,255,102,0.08),transparent 70%);pointer-events:none;}
.mod-grid-wrap{cursor:pointer;transition:transform 0.2s;border-radius:4px;}
.mod-grid-wrap:hover{transform:scale(1.15);z-index:5;}
.anchor-grid-wrap{cursor:pointer;transition:transform 0.2s;border-radius:6px;}
.anchor-grid-wrap:hover{transform:scale(1.1);z-index:5;}
.mod-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;flex-shrink:0;}
.mod-grid img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:4px;background:rgba(0,0,0,0.3);padding:3px;border:1px solid rgba(255,204,0,0.1);transition:all 0.3s;cursor:pointer;}
.mod-grid-wrap:hover img{border-color:rgba(255,204,0,0.4);box-shadow:0 0 12px rgba(255,204,0,0.25);}

/* CENTER */
.game-center{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;overflow-y:auto;overflow-x:hidden;padding-bottom:0;position:relative;scrollbar-width:none;}
.game-center::-webkit-scrollbar{width:0;}
.bottom-row::-webkit-scrollbar{width:4px;}
.bottom-row::-webkit-scrollbar-thumb{background:rgba(0,240,255,0.2);border-radius:4px;}

/* Header mastery dots */
.hd-mastery{display:flex;align-items:center;gap:4px;}
.hd-mastery-label{font-size:0.5rem;color:#ffcc00;letter-spacing:0.5px;}
.hd-mastery-dots{display:flex;gap:2px;}
.hd-md{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);}
.hd-md-on{background:#ffcc00;border-color:#ffcc00;box-shadow:0 0 4px rgba(255,215,0,0.5);}

/* Vendor bar — character-driven sell zone */
.vendor-bar{display:flex;align-items:center;gap:12px;width:100%;padding:6px 14px;border-radius:10px;border:1px solid rgba(0,240,255,0.08);background:linear-gradient(135deg,rgba(0,10,20,0.6),rgba(0,20,40,0.4));transition:all 0.3s;flex-shrink:0;}
.vendor-bar.vendor-hot{border-color:rgba(255,200,0,0.6);background:linear-gradient(135deg,rgba(40,30,0,0.5),rgba(30,20,0,0.4));box-shadow:0 0 30px rgba(255,200,0,0.15),inset 0 0 30px rgba(255,200,0,0.05);}
.vendor-portrait{position:relative;flex-shrink:0;cursor:pointer;}
.vendor-portrait-img{width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid rgba(0,240,255,0.4);box-shadow:0 0 16px rgba(0,240,255,0.25),0 4px 12px rgba(0,0,0,0.5);background:#0d1220;transition:all 0.2s;}
.vendor-hot .vendor-portrait-img{border-color:rgba(255,200,0,0.7);box-shadow:0 0 24px rgba(255,200,0,0.4),0 0 40px rgba(255,200,0,0.15);}
.vendor-glow{position:absolute;inset:-4px;border-radius:50%;background:radial-gradient(circle,rgba(0,240,255,0.08),transparent 70%);animation:vendor-breathe 3s ease-in-out infinite;pointer-events:none;}
@keyframes vendor-breathe{0%,100%{opacity:0.5;transform:scale(1);}50%{opacity:1;transform:scale(1.05);}}
.vendor-speech{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
.vendor-tag{font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:800;color:rgba(0,240,255,0.4);letter-spacing:2px;}
.vendor-quote{font-size:0.8rem;color:#8a9ab8;font-style:italic;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.vendor-boss{font-size:0.75rem;color:#ff8866;font-weight:700;line-height:1.3;}
.vendor-evt-name{font-family:'Orbitron',sans-serif;font-size:0.65rem;font-weight:800;}
.vendor-evt-desc{font-size:0.7rem;line-height:1.2;}
.btn-fight{padding:10px 20px!important;font-size:0.85rem!important;flex-shrink:0;white-space:nowrap;}

/* === CENTER INFO BAR — full-width horizontal card details === */

.ib-desc{font-size:0.8rem;color:#aab;line-height:1.3;}
.ib-innate{font-size:0.8rem;color:#ffcc00;padding:5px 8px;background:rgba(255,204,0,0.08);border-radius:5px;border:1px solid rgba(255,204,0,0.2);font-style:italic;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;min-width:0;}
.ib-chipfree{font-size:0.75rem;color:#00f0ff;padding:5px 8px;background:rgba(0,240,255,0.08);border-radius:5px;border:1px solid rgba(0,240,255,0.2);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;min-width:0;}
.info-bar{width:100%;min-height:22px;max-height:64px;padding:0 12px;display:flex;align-items:center;gap:12px;background:rgba(0,0,0,0.35);border:1px solid rgba(0,240,255,0.06);border-radius:8px;flex-shrink:1;overflow:hidden;transition:all 0.12s ease;opacity:0.3;flex-wrap:nowrap;}
.info-bar-vis{opacity:1;border-color:rgba(0,240,255,0.15);background:rgba(0,8,16,0.85);padding:8px 14px;min-height:36px;max-height:72px;}
.ib-identity{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.ib-faction-icon{width:36px;height:36px;object-fit:contain;}
.ib-name{font-family:'Orbitron',sans-serif;font-size:0.95rem;font-weight:800;white-space:nowrap;}
.ib-tier{font-family:'Orbitron',sans-serif;font-size:0.75rem;font-weight:700;color:#aab;background:rgba(255,255,255,0.06);padding:2px 4px;border-radius:3px;}
.ib-golden{font-family:'Orbitron',sans-serif;font-size:0.8rem;font-weight:800;color:#ffcc00;background:rgba(255,204,0,0.1);padding:2px 6px;border-radius:3px;border:1px solid rgba(255,204,0,0.3);}
.ib-stats{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.ib-atk{font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:800;color:#ff6644;}
.ib-hp{font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:800;color:#44ff66;}
.ib-shield{font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:800;color:#6688ff;}
.ib-keywords{display:flex;flex-wrap:nowrap;gap:4px;overflow:hidden;flex-shrink:1;min-width:0;}
.ib-kw{display:flex;align-items:center;gap:4px;background:rgba(0,240,255,0.04);padding:3px 8px;border-radius:4px;border:1px solid rgba(0,240,255,0.08);white-space:nowrap;}
.ib-kw-icon{width:22px;height:22px;object-fit:contain;flex-shrink:0;}
.ib-kw-name{font-family:'Orbitron',sans-serif;font-size:0.75rem;font-weight:700;color:#00f0ff;white-space:nowrap;}
.ib-kw-desc{font-size:0.7rem;color:#dde;}
.ib-mod{display:flex;align-items:center;gap:5px;flex-shrink:1;background:rgba(255,204,0,0.06);padding:3px 10px;border-radius:5px;border:1px solid rgba(255,204,0,0.12);white-space:nowrap;overflow:hidden;min-width:0;}
.ib-mod-icon{width:28px;height:28px;object-fit:contain;}
.ib-mod-name{font-size:0.85rem;color:#ffcc00;font-weight:700;font-family:'Orbitron',sans-serif;}
.ib-hint{font-family:'Orbitron',sans-serif;font-size:0.65rem;color:rgba(255,255,255,0.12);letter-spacing:3px;}
.ib-combo-factions{display:flex;align-items:center;gap:6px;flex-shrink:0;}
/* Breach sidebar */
.breach-sidebar{padding:4px 6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:8px;flex-shrink:0;}
.breach-glyph-row{display:flex;gap:6px;justify-content:center;padding:4px 0;}
.breach-glyph{width:44px;height:44px;border-radius:10px;border:2px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-family:'Orbitron',sans-serif;transition:all 0.25s;position:relative;backdrop-filter:blur(4px);}
.breach-glyph-empty{border-style:dashed;border-color:rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);cursor:default;}
.breach-glyph-loaded{border-color:var(--bc,#00f0ff);background:radial-gradient(ellipse at center,color-mix(in srgb,var(--bc) 15%,transparent),rgba(0,0,0,0.7));box-shadow:0 0 14px color-mix(in srgb,var(--bc) 30%,transparent),inset 0 0 10px color-mix(in srgb,var(--bc) 10%,transparent);animation:breach-glow 2s ease-in-out infinite;}
.breach-glyph-loaded:hover{transform:scale(1.15);box-shadow:0 0 24px color-mix(in srgb,var(--bc) 55%,transparent),inset 0 0 16px color-mix(in srgb,var(--bc) 18%,transparent);}
.breach-glyph-svg{width:28px;height:28px;object-fit:contain;filter:drop-shadow(0 0 4px var(--bc));}
.breach-glyph-timer{font-size:0.4rem;font-weight:700;color:rgba(255,255,255,0.65);letter-spacing:0.5px;margin-top:1px;}
.breach-glyph-armed{border-color:#ff4444;background:radial-gradient(ellipse at center,rgba(255,68,68,0.2),rgba(0,0,0,0.7));box-shadow:0 0 18px rgba(255,68,68,0.4);color:#ff4444;font-weight:900;font-size:1.1rem;animation:breach-glow 1s ease-in-out infinite;}
.breach-armed-tag{text-align:center;font-family:'Orbitron',sans-serif;font-size:0.45rem;font-weight:800;color:#ff4444;letter-spacing:1.5px;padding:2px;text-shadow:0 0 8px rgba(255,68,68,0.5);animation:breach-glow 1s ease-in-out infinite;}

/* SHOP AREA — cards + action buttons side by side */
.shop-area{display:flex;align-items:stretch;justify-content:center;flex-shrink:0;overflow:visible;position:relative;z-index:40;}
.shop-grid{display:flex!important;justify-content:center;gap:6px;flex-shrink:0;flex-wrap:nowrap;overflow:visible;align-items:stretch;width:max-content;}
.shop-slot{transition:all 0.3s;position:relative;width:140px;flex-shrink:0;}
.shop-slot.sold{opacity:0.1;pointer-events:none;}
.shop-slot.unaffordable{opacity:0.4;}
.shop-slot-empty{width:140px;height:100%;min-height:200px;border-radius:14px;border:2px dashed rgba(0,240,255,0.08);background:rgba(0,0,0,0.15);}
/* Chip pod — stacked like bench pod */
.chip-pod{width:100px;flex-shrink:0;background:rgba(0,0,0,0.4);border-left:1px solid rgba(255,255,255,0.04);border-radius:0;padding:4px 5px;display:flex;flex-direction:column;gap:4px;align-items:center;align-self:stretch;}
.chip-pod-label{font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:600;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:1.5px;}
.chip-pod-slots{display:flex;flex-direction:column;gap:4px;width:100%;}
.chip-pod-unit{position:relative;width:90px;height:56px;border-radius:8px;overflow:hidden;border:2px solid rgba(100,150,200,0.4);cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;margin:0 auto;
  background:linear-gradient(135deg,rgba(15,22,45,0.95),rgba(8,12,28,0.95));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}
.chip-pod-unit:hover{transform:scale(1.12);z-index:20;box-shadow:0 4px 16px rgba(0,0,0,0.5);}
.chip-pod-icon{font-size:1.2rem;line-height:1;}
.chip-pod-info{display:flex;align-items:center;gap:4px;padding:0 4px;width:100%;}
.chip-pod-name{font-family:'Orbitron',sans-serif;font-weight:800;font-size:0.4rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;}
.chip-pod-cost{font-family:'Orbitron',sans-serif;font-weight:700;font-size:0.4rem;color:#ffcc00;flex-shrink:0;}
.chip-pod-empty{width:90px;height:56px;border-radius:8px;border:1px dashed rgba(255,255,255,0.05);margin:0 auto;}
.vendor-portrait{cursor:pointer;}
.vendor-portrait.vendor-sell-active .vendor-portrait-img{border-color:rgba(255,200,0,0.8);box-shadow:0 0 30px rgba(255,200,0,0.5),0 0 50px rgba(255,200,0,0.2);animation:vendor-pulse 0.6s ease-in-out infinite;}
.vendor-sell-flash{position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:900;color:#fff;background:rgba(255,180,0,0.85);padding:2px 8px;border-radius:6px;white-space:nowrap;pointer-events:none;z-index:5;}
@keyframes vendor-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}
.tap-sell-ready .vendor-portrait-img{border-color:rgba(255,68,68,0.7);box-shadow:0 0 24px rgba(255,68,68,0.4);animation:vendor-pulse 0.6s ease-in-out infinite;}
.shop-sold{width:170px;height:230px;display:flex;align-items:center;justify-content:center;font-family:'Orbitron',sans-serif;font-size:0.8rem;font-weight:900;color:#223;letter-spacing:3px;background:rgba(0,0,0,0.15);border-radius:14px;border:1px dashed rgba(255,255,255,0.04);}

/* BUTTONS */
.btn-dim{background:rgba(20,24,40,0.85)!important;border-color:rgba(255,255,255,0.2)!important;color:rgba(255,255,255,0.55)!important;}
.btn-dim:hover{background:rgba(30,36,55,0.9)!important;color:rgba(255,255,255,0.8)!important;border-color:rgba(255,255,255,0.3)!important;}
/* FIGHT small near vendor */
.btn-fight-sm{font-size:0.8rem!important;padding:6px 16px!important;letter-spacing:1px;flex-shrink:0;}
.btn-fight-sm img{width:16px;height:16px;}
/* TOP BAR: vendor+fight left, timer right */
.top-bar{display:flex;align-items:center;justify-content:space-between;width:100%;flex-shrink:0;gap:10px;}
.top-bar-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0;}
.top-bar-right{flex-shrink:0;}
/* SPACER / INFO PANEL ZONE — fills gap between shop and board */
/* GOLD DISPLAY above roll */
.action-gold{display:flex;align-items:center;gap:5px;font-family:'Orbitron',sans-serif;font-size:1.0rem;font-weight:800;color:#ffcc00;padding:4px 12px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,204,0,0.2);border-radius:20px;text-shadow:0 0 10px rgba(255,204,0,0.4);}
.action-gold img{width:18px;height:18px;}
/* BOARD DOCK — pinned to bottom */
.board-dock{width:100%;flex-shrink:0;padding-bottom:0;margin-top:auto;position:relative;}
.dock-top-bar{display:flex;align-items:flex-start;justify-content:space-between;padding:0 60px 0 8px;margin-bottom:4px;min-height:24px;}
.breach-slots{display:flex;flex-direction:column;gap:6px;align-items:flex-end;}
.breach-slot-btn{width:42px;height:42px;border-radius:10px;border:2px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.4);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-family:'Orbitron',sans-serif;transition:all 0.25s;position:relative;}
.breach-slot-empty{border-style:dashed;border-color:rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);}
.breach-slot-loaded{border-color:var(--bc,#00f0ff);background:radial-gradient(ellipse at center,color-mix(in srgb,var(--bc) 12%,transparent),rgba(0,0,0,0.6));box-shadow:0 0 14px color-mix(in srgb,var(--bc) 25%,transparent),inset 0 0 12px color-mix(in srgb,var(--bc) 8%,transparent);animation:breach-glow 2s ease-in-out infinite;}
.breach-slot-loaded:hover{transform:scale(1.15);box-shadow:0 0 24px color-mix(in srgb,var(--bc) 50%,transparent),inset 0 0 16px color-mix(in srgb,var(--bc) 15%,transparent);border-width:2px;}
.breach-slot-icon{font-size:0.85rem;font-weight:900;line-height:1;color:var(--bc,#fff);text-shadow:0 0 8px var(--bc,#fff);filter:drop-shadow(0 0 4px var(--bc));}
.breach-slot-timer{font-size:0.45rem;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:0.5px;}
.breach-slot-armed{border-color:#ff4444;background:radial-gradient(ellipse at center,rgba(255,68,68,0.15),rgba(0,0,0,0.6));box-shadow:0 0 14px rgba(255,68,68,0.3);color:#ff4444;font-weight:900;font-size:1rem;animation:breach-glow 1.2s ease-in-out infinite;}
.breach-free-tag{font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:700;color:#00bbff;text-shadow:0 0 6px rgba(0,187,255,0.4);text-align:center;}
@keyframes breach-glow{0%,100%{opacity:1;filter:brightness(1);}50%{opacity:0.85;filter:brightness(1.3);}}
/* BOTTOM ROW: hero + board + bench side by side */
.bottom-row{display:flex;align-items:flex-end;gap:6px;width:100%;}
.bottom-row .board-section{flex:1;min-width:0;margin:0;}
/* HERO PORTRAIT — operator avatar with HP + tier */
.hero-portrait{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;flex-shrink:0;padding:4px 8px;min-width:100px;cursor:pointer;}
.hero-ring{width:90px;height:90px;border-radius:50%;overflow:hidden;border:3px solid #00f0ff;box-shadow:0 0 20px rgba(0,240,255,0.3),0 0 50px rgba(0,240,255,0.1),0 4px 14px rgba(0,0,0,0.5);background:linear-gradient(135deg,#1a2540,#0d1220);transition:all 0.3s;}
.hero-ring:hover{transform:scale(1.08);box-shadow:0 0 30px rgba(0,240,255,0.45),0 0 60px rgba(0,240,255,0.18);}
.hero-img{width:100%;height:100%;object-fit:cover;}
.hero-hp{font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:800;display:flex;align-items:center;gap:4px;text-shadow:0 0 10px currentColor;}
.hero-tier{font-family:'Orbitron',sans-serif;font-size:0.75rem;font-weight:700;color:#ffcc00;display:flex;align-items:center;gap:3px;}
.hero-name{font-family:'Orbitron',sans-serif;font-size:0.55rem;font-weight:600;color:#778;letter-spacing:1px;text-align:center;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* ACTION ROW — horizontal, centered below shop, never overlaps cards */
.action-row{display:flex;align-items:center;justify-content:center;gap:32px;flex-shrink:0;padding:8px 0;z-index:40;}
/* ROLL button — circular hero button */
.roll-top-row{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:4px;}
.action-roll-group{display:flex;flex-direction:column;align-items:center;gap:4px;}
.action-roll-btn{width:72px!important;height:72px!important;border-radius:50%!important;padding:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:2px!important;font-size:0.65rem!important;letter-spacing:0.5px;background:radial-gradient(circle at 50% 38%,rgba(0,240,255,0.22),rgba(0,80,120,0.35) 60%,rgba(5,8,16,0.92))!important;border:2px solid rgba(0,240,255,0.55)!important;box-shadow:0 0 22px rgba(0,240,255,0.35),0 4px 16px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.1)!important;transition:all 0.2s!important;min-width:0!important;}
.action-roll-btn:hover:not(:disabled){transform:scale(1.12)!important;background:radial-gradient(circle at 50% 38%,rgba(0,240,255,0.32),rgba(0,100,140,0.45) 60%,rgba(5,8,16,0.92))!important;box-shadow:0 0 35px rgba(0,240,255,0.5),0 6px 20px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.15)!important;}
.action-roll-btn:active:not(:disabled){transform:scale(0.94)!important;}
.action-roll-btn span{font-size:0.6rem;font-weight:700;text-shadow:0 0 8px rgba(0,240,255,0.5);}
.action-roll-btn img{filter:brightness(1.5) drop-shadow(0 0 4px rgba(0,240,255,0.4));}
/* FREEZE button */
.action-freeze{display:flex!important;align-items:center!important;gap:8px!important;padding:12px 22px!important;font-size:0.75rem!important;letter-spacing:0.5px;border-radius:10px!important;min-width:110px!important;justify-content:center!important;background:linear-gradient(180deg,rgba(100,180,220,0.12),rgba(40,80,120,0.25),rgba(5,8,16,0.88))!important;border:2px solid rgba(100,180,220,0.4)!important;box-shadow:0 0 12px rgba(100,180,220,0.15),0 3px 10px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.08)!important;}
.action-freeze:hover{background:linear-gradient(180deg,rgba(100,180,220,0.2),rgba(40,80,120,0.35),rgba(5,8,16,0.88))!important;box-shadow:0 0 20px rgba(100,180,220,0.3),0 4px 14px rgba(0,0,0,0.5)!important;transform:scale(1.04);}
.action-freeze span{font-weight:700;}
.action-freeze.btn-gold{border-color:rgba(255,204,0,0.6)!important;background:linear-gradient(180deg,rgba(255,204,0,0.15),rgba(120,80,0,0.3),rgba(5,8,16,0.88))!important;box-shadow:0 0 16px rgba(255,204,0,0.25),0 3px 10px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.08)!important;}
/* TIER UP button */
.action-tier{display:flex!important;align-items:center!important;gap:8px!important;padding:12px 22px!important;font-size:0.75rem!important;letter-spacing:0.5px;border-radius:10px!important;min-width:110px!important;justify-content:center!important;background:linear-gradient(180deg,rgba(255,204,0,0.1),rgba(120,80,0,0.2),rgba(5,8,16,0.88))!important;border:2px solid rgba(255,204,0,0.45)!important;color:#ffcc00!important;box-shadow:0 0 14px rgba(255,204,0,0.18),0 3px 10px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.08)!important;}
.action-tier:hover{background:linear-gradient(180deg,rgba(255,204,0,0.18),rgba(120,80,0,0.35),rgba(5,8,16,0.88))!important;box-shadow:0 0 24px rgba(255,204,0,0.35),0 4px 14px rgba(0,0,0,0.5)!important;transform:scale(1.04);}
.action-tier span{font-weight:700;text-shadow:0 0 6px rgba(255,204,0,0.3);}
/* Glow gold when affordable */
.action-tier-glow{background:linear-gradient(180deg,rgba(255,204,0,0.2),rgba(160,100,0,0.35),rgba(5,8,16,0.88))!important;border-color:rgba(255,204,0,0.7)!important;color:#ffdd44!important;box-shadow:0 0 24px rgba(255,204,0,0.4),0 0 48px rgba(255,204,0,0.12),0 3px 10px rgba(0,0,0,0.5)!important;animation:tier-glow-pulse 1.5s ease-in-out infinite!important;}
.action-tier-glow:hover{box-shadow:0 0 36px rgba(255,204,0,0.55),0 0 60px rgba(255,204,0,0.2)!important;transform:scale(1.06);}
@keyframes tier-glow-pulse{0%,100%{box-shadow:0 0 24px rgba(255,204,0,0.4),0 0 48px rgba(255,204,0,0.12),0 3px 10px rgba(0,0,0,0.5);}50%{box-shadow:0 0 32px rgba(255,204,0,0.55),0 0 56px rgba(255,204,0,0.2),0 3px 10px rgba(0,0,0,0.5);}}
.btn{font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:800;padding:9px 20px;border-radius:5px;border:2px solid;cursor:pointer;background:rgba(5,8,16,0.85);color:inherit;letter-spacing:1.5px;display:flex;align-items:center;gap:6px;transition:all 0.2s;text-transform:uppercase;}
.btn img{width:16px;height:16px;object-fit:contain;}
.btn-cyan{color:#00f0ff;border-color:rgba(0,240,255,0.5);background:linear-gradient(180deg,rgba(0,240,255,0.08),rgba(5,8,16,0.85));}
.btn-cyan:hover{background:linear-gradient(180deg,rgba(0,240,255,0.16),rgba(5,8,16,0.85));box-shadow:0 0 18px rgba(0,240,255,0.25);}
.btn-magenta{color:#ff00ff;border-color:#ff00ff44;}
.btn-magenta:hover{background:rgba(255,0,255,0.1);}
.btn-gold{color:#ffcc00;border-color:rgba(255,204,0,0.5);background:linear-gradient(180deg,rgba(255,204,0,0.1),rgba(5,8,16,0.85));}
.btn-gold:hover{background:linear-gradient(180deg,rgba(255,204,0,0.18),rgba(5,8,16,0.85));box-shadow:0 0 16px rgba(255,204,0,0.2);}
.btn-red{color:#ff4444;border-color:#ff444466;}
.btn-fight{font-size:0.85rem;padding:10px 28px;text-shadow:0 0 10px rgba(255,68,68,0.4);}
.btn-fight:hover{background:rgba(255,68,68,0.12);box-shadow:0 0 20px rgba(255,68,68,0.25);transform:scale(1.04);}

/* SECTION DIVIDERS */
.section-divider{display:flex;align-items:center;gap:10px;width:100%;flex-shrink:0;margin-bottom:2px;}
.section-divider .line{flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(0,240,255,0.06),transparent);}
.section-divider span{font-family:'Orbitron',sans-serif;font-size:0.6rem;font-weight:600;color:rgba(255,255,255,0.2);letter-spacing:3px;white-space:nowrap;}
.section-divider.bench span{color:#334;}

/* BOARD / BENCH */
.board-grid{display:flex!important;justify-content:center;gap:6px;flex-shrink:0;flex-wrap:nowrap;align-items:flex-end;position:relative;padding:4px 8px 12px;}
.board-lane-labels{display:flex;justify-content:center;gap:0;margin-bottom:0;width:100%;}
.lane-label{font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;padding:3px 16px;border-radius:4px;}
.lane-front{color:#4488ff;background:rgba(68,136,255,0.06);border:1px solid rgba(68,136,255,0.12);margin-right:8px;}
.lane-back{color:#ffaa00;background:rgba(255,170,0,0.06);border:1px solid rgba(255,170,0,0.12);margin-left:8px;}

/* Lane divider - glowing separator */
.board-lane-divider{display:flex;align-items:center;justify-content:center;width:3px;margin:0 2px;align-self:stretch;position:relative;flex-shrink:0;}
.board-lane-divider::before{content:'';position:absolute;inset:8px 0;width:2px;background:linear-gradient(180deg,transparent,rgba(255,255,255,0.15),rgba(255,255,255,0.25),rgba(255,255,255,0.15),transparent);border-radius:1px;}
.board-lane-divider::after{content:'';position:absolute;inset:8px -3px;width:8px;background:linear-gradient(180deg,transparent,rgba(100,160,255,0.06),rgba(100,160,255,0.1),rgba(100,160,255,0.06),transparent);filter:blur(3px);}
.board-lane-divider span{display:none;}

/* Slot wrappers with position labels */
.board-slot-wrap{position:relative;display:flex;flex-direction:column;align-items:center;}
.board-slot-wrap::after{content:attr(data-pos);position:absolute;bottom:-11px;left:50%;transform:translateX(-50%);font-family:'Orbitron',sans-serif;font-size:0.4rem;font-weight:700;letter-spacing:1px;opacity:0.35;white-space:nowrap;pointer-events:none;}
.slot-front::after{color:#4488ff;}
.slot-back::after{color:#ffaa00;}

/* Subtle zone backgrounds */
.slot-front::before{content:'';position:absolute;inset:-4px -3px;border-radius:10px;background:linear-gradient(180deg,rgba(68,136,255,0.03),rgba(68,136,255,0.06));border:1px solid rgba(68,136,255,0.06);pointer-events:none;z-index:-1;}
.slot-back::before{content:'';position:absolute;inset:-4px -3px;border-radius:10px;background:linear-gradient(180deg,rgba(255,170,0,0.02),rgba(255,170,0,0.05));border:1px solid rgba(255,170,0,0.05);pointer-events:none;z-index:-1;}

/* Role glow on cards within slots */
.board-slot-wrap[data-role="Vanguard"] .c{box-shadow:0 0 8px rgba(68,136,255,0.15),inset 0 0 4px rgba(68,136,255,0.05);}
.board-slot-wrap[data-role="Striker"] .c{box-shadow:0 0 8px rgba(255,68,68,0.15),inset 0 0 4px rgba(255,68,68,0.05);}
.board-slot-wrap[data-role="Infiltrator"] .c{box-shadow:0 0 8px rgba(170,68,255,0.15),inset 0 0 4px rgba(170,68,255,0.05);}
.board-slot-wrap[data-role="Architect"] .c{box-shadow:0 0 8px rgba(68,255,136,0.15),inset 0 0 4px rgba(68,255,136,0.05);}
.board-slot-wrap[data-role="Sentinel"] .c{box-shadow:0 0 8px rgba(255,170,0,0.15),inset 0 0 4px rgba(255,170,0,0.05);}

/* Empty slot styling by zone */
.slot-front .empty-slot{border-color:rgba(68,136,255,0.12)!important;background:rgba(68,136,255,0.02)!important;}
.slot-back .empty-slot{border-color:rgba(255,170,0,0.1)!important;background:rgba(255,170,0,0.02)!important;}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   FLOATING CARD — ART IS KING
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
.c{position:relative;border-radius:14px;overflow:visible;transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.3s;transform-origin:center bottom;cursor:pointer;flex-shrink:0;user-select:none;-webkit-user-select:none;}
.c:hover,.c.c-h{transform:translateY(-6px) scale(1.03);z-index:20;}
/* No zoom — info panel shows details instead */
.c-aura{position:absolute;inset:-6px;border-radius:20px;background:radial-gradient(ellipse at 50% 75%,var(--fc),transparent 55%);opacity:0.12;transition:opacity 0.3s;pointer-events:none;z-index:-1;}
.c:hover .c-aura{opacity:0.35;}

.c-frame{position:absolute;inset:-3px;width:calc(100% + 6px);height:calc(100% + 6px);object-fit:fill;z-index:4;pointer-events:none;opacity:0.3;mix-blend-mode:screen;filter:brightness(1.5);}
.c:hover .c-frame{opacity:0.55;}
.c.c-g .c-frame{opacity:0.6;filter:brightness(2.2) sepia(0.5) saturate(3) hue-rotate(-10deg);}

.c-sell{position:absolute;top:4px;right:4px;z-index:10;width:22px;height:22px;border-radius:50%;background:rgba(255,50,50,0.7);border:1px solid rgba(255,100,100,0.5);color:#fff;font-size:0.65rem;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.15s;}
.c:hover .c-sell{opacity:1;}

.c-art{position:relative;width:100%;border-radius:14px 14px 0 0;overflow:hidden;background:#070b14;}
.c-img{width:100%;height:100%;object-fit:cover;transition:transform 0.4s,filter 0.3s;}
.c:hover .c-img{transform:scale(1.1);filter:brightness(1.12) contrast(1.05);}
.c-grad{position:absolute;bottom:0;left:0;right:0;height:50%;background:linear-gradient(transparent,rgba(5,8,16,0.92));pointer-events:none;}

.c-tier{position:absolute;top:6px;left:6px;z-index:5;font-family:'Orbitron',sans-serif;font-size:0.55rem;font-weight:900;padding:2px 6px;border-radius:4px;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);color:#abc;border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:3px;}
.c-role{position:absolute;top:6px;left:52px;z-index:5;font-size:0.7rem;padding:1px 3px;border-radius:4px;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.06);line-height:1;cursor:help;filter:drop-shadow(0 0 3px currentColor);}
.c-tier-i{width:14px;height:14px;object-fit:contain;}

/* ═══ SOCKET ZONE A — Keywords: 2-col grid, top-right ═══ */
.c-kw-grid{position:absolute;top:5px;right:5px;z-index:5;display:grid;grid-template-columns:repeat(2,auto);gap:2px;justify-items:end;justify-content:end;pointer-events:none;max-height:calc(100% - 50px);overflow:hidden;}
.c-kw-i{object-fit:contain;filter:drop-shadow(0 0 3px rgba(255,255,255,0.3)) brightness(1.4);background:rgba(0,0,0,0.55);border-radius:4px;padding:2px;backdrop-filter:blur(3px);border:1px solid rgba(255,255,255,0.08);}

/* (c-mod removed — replaced by c-mod-socket) */

/* ═══ SOCKET ZONE C — Owned count: bottom-right of art ═══ */
.c-own{position:absolute;bottom:22px;right:5px;z-index:6;font-family:'Orbitron',sans-serif;font-size:0.55rem;font-weight:900;color:#ffcc00;background:rgba(0,0,0,0.65);border-radius:4px;padding:2px 5px;border:1px solid rgba(255,204,0,0.25);text-shadow:0 0 6px rgba(255,204,0,0.4);}
.c-kills{position:absolute;bottom:38px;right:5px;z-index:6;font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:900;color:#ff8866;background:rgba(0,0,0,0.7);border-radius:4px;padding:2px 5px;border:1px solid rgba(255,100,80,0.3);text-shadow:0 0 4px rgba(255,100,80,0.4);cursor:help;letter-spacing:0.3px;white-space:nowrap;}

.c-nover{position:absolute;bottom:3px;left:0;right:0;z-index:5;display:flex;align-items:center;gap:4px;padding:0 8px;}
.c-fi{width:20px;height:20px;object-fit:contain;flex-shrink:0;}
.c-name{font-family:'Orbitron',sans-serif;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.95),0 0 20px rgba(0,0,0,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;font-size:0.88rem;}

.c-bar{display:flex;gap:8px;align-items:center;padding:4px 8px 5px;background:rgba(5,8,16,0.92);border-radius:0 0 14px 14px;font-family:'Orbitron',sans-serif;font-weight:900;}
.c-stat-i{width:12px;height:12px;object-fit:contain;vertical-align:middle;margin-right:2px;display:inline-block;}
.c-atk{color:#ff6644;display:flex;align-items:center;gap:2px;}
.c-hp{color:#44ff66;display:flex;align-items:center;gap:2px;}
.c-cost{color:#ffcc00;font-size:0.82rem;margin-left:auto;}

.c-strip{height:2px;border-radius:0 0 14px 14px;opacity:0.45;}
.c:hover .c-strip{opacity:1;}
.c-innate{font-size:0.45rem;color:#aab;padding:2px 6px;text-align:center;line-height:1.15;opacity:0.85;max-height:24px;overflow:hidden;font-style:italic;}

.c.c-g .c-aura{background:radial-gradient(ellipse at 50% 75%,#ffcc00,transparent 55%) !important;opacity:0.25;}
.c.c-g .c-strip{background:linear-gradient(90deg,transparent,#ffcc00,transparent) !important;}
.c-shim{position:absolute;inset:0;border-radius:14px;background:linear-gradient(135deg,transparent 25%,rgba(255,204,0,0.06) 50%,transparent 75%);background-size:200% 200%;animation:goldShim 3s ease-in-out infinite;pointer-events:none;z-index:3;}
@keyframes goldShim{0%{background-position:200% 0%;}100%{background-position:-200% 0%;}}

/* â•â•â• CLEAN VISUAL SYSTEM â•â•â• */

/* Synergy active — soft faction glow when 2+ of faction on board */
.c-syn-active{box-shadow:0 0 16px var(--fc,rgba(0,240,255,0.3)),0 0 32px color-mix(in srgb,var(--fc) 15%,transparent)!important;animation:syn-breathe 3s ease-in-out infinite;}
@keyframes syn-breathe{0%,100%{box-shadow:0 0 12px var(--fc,rgba(0,240,255,0.2));}50%{box-shadow:0 0 22px var(--fc,rgba(0,240,255,0.35));}}

/* Combo active — gold border strip at bottom */
.c-combo-active{border-bottom:2px solid rgba(255,204,0,0.6)!important;box-shadow:0 4px 12px rgba(255,204,0,0.15)!important;}

/* Mod badge — small icon at bottom-left corner of card */
/* ═══ SOCKET ZONE C — Mod badge: bottom-left of art (above name) ═══ */
.c-mod-socket{position:absolute;bottom:22px;left:5px;z-index:6;width:22px;height:22px;border-radius:5px;background:rgba(0,0,0,0.65);border:1px solid rgba(255,204,0,0.35);padding:2px;pointer-events:none;box-shadow:0 0 8px rgba(255,204,0,0.15),inset 0 0 4px rgba(255,204,0,0.08);}
.c-mod-socket-i{width:100%;height:100%;object-fit:contain;border-radius:3px;filter:drop-shadow(0 0 4px rgba(255,204,0,0.4));}
.c-board .c-mod-socket{width:20px;height:20px;bottom:20px;left:4px;}
/* Bench: tighter spacing for smallest cards */
.c-bench .c-kw-grid{top:3px;right:3px;gap:1px;}
.c-bench .c-mod-socket{width:16px;height:16px;bottom:18px;left:3px;}
.c-bench .c-own{bottom:18px;right:3px;font-size:0.5rem;padding:1px 4px;}
.c-bench .c-tier{top:3px;left:3px;font-size:0.48rem;padding:1px 4px;}
/* Shield stat in bar */
.c-sh{color:#6688ff;display:flex;align-items:center;gap:2px;font-size:0.8em;}

/* EMPTY SLOTS */
.empty-slot{border:1px dashed rgba(0,240,255,0.04);border-radius:14px;display:flex;align-items:center;justify-content:center;background:rgba(0,240,255,0.005);transition:all 0.3s;cursor:pointer;flex-shrink:0;width:135px;height:185px;}
.empty-slot:hover{border-color:rgba(0,240,255,0.12);background:rgba(0,240,255,0.015);box-shadow:inset 0 0 20px rgba(0,240,255,0.03);}
.empty-slot-text{font-family:'Orbitron',sans-serif;font-size:1.5rem;font-weight:200;color:rgba(0,240,255,0.06);}

/* â”€â”€ ARENA COMBAT (see ba- classes below) â”€â”€ */

/* â”€â”€ OPERATOR PICK â”€â”€ */
.operator-grid{display:flex;justify-content:center;gap:24px;flex-wrap:wrap;}
.operator-card{padding:20px;border-radius:12px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.08);cursor:pointer;text-align:center;min-width:180px;transition:all 0.3s;}
.operator-card:hover{transform:translateY(-6px);border-color:rgba(0,240,255,0.3);box-shadow:0 8px 24px rgba(0,0,0,0.5);}
.operator-card img{width:80px;height:80px;border-radius:10px;object-fit:cover;margin-bottom:8px;}
.operator-card .op-name{font-family:'Orbitron',sans-serif;font-size:0.85rem;font-weight:800;display:block;margin-bottom:4px;}
.operator-card .op-desc{font-size:0.75rem;color:#889;line-height:1.4;}

/* â”€â”€ GAME OVER â”€â”€ */
.game-over-card{padding:48px;max-width:460px;margin:0 auto;text-align:center;background:rgba(0,0,0,0.6);border-radius:16px;border:1px solid rgba(0,240,255,0.15);backdrop-filter:blur(12px);}

/* â”€â”€ TUTORIAL â”€â”€ */
.tutorial-section{font-size:0.85rem;padding:16px;background:rgba(0,0,0,0.3);border-radius:8px;margin-bottom:8px;}

/* â”€â”€ MOD PICK â”€â”€ */
.mod-choice{min-width:180px;padding:16px 24px;border-radius:10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);cursor:pointer;text-align:center;transition:all 0.3s;}
.mod-choice:hover{transform:translateY(-4px);border-color:rgba(255,204,0,0.3);box-shadow:0 4px 16px rgba(0,0,0,0.4);}
.mod-choice img{width:40px;height:40px;object-fit:contain;margin:0 auto 8px;display:block;}

/* â”€â”€ TOOLTIP â”€â”€ */
.unit-tooltip{position:absolute;z-index:100;min-width:240px;max-width:300px;padding:14px 16px;background:rgba(8,12,24,0.95);border:1px solid rgba(0,240,255,0.15);border-radius:10px;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.6);pointer-events:none;}
.tt-header{display:flex;gap:10px;align-items:center;margin-bottom:8px;}
.tt-name{font-family:'Orbitron',sans-serif;font-size:0.9rem;font-weight:800;}
.tt-faction{font-size:0.75rem;color:#889;}
.tt-emoji{width:48px;height:48px;border-radius:8px;overflow:hidden;}
.tt-emoji img{width:100%;height:100%;object-fit:cover;}
.tt-stats{font-family:'Orbitron',sans-serif;font-size:0.85rem;font-weight:700;display:flex;gap:10px;}
.tt-atk{color:#ff6644;}.tt-atk::before{content:'ATK ';}
.tt-hp{color:#44ff66;}.tt-hp::before{content:'HP ';}
.tt-shield{color:#66aaff;}.tt-shield::before{content:'SH ';}
.tt-kw-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;}
.tt-kw-icon img{width:18px;height:18px;vertical-align:middle;margin-right:3px;}

/* â”€â”€ BUTTONS EXTRA â”€â”€ */
.btn-green{color:#66ff00;border-color:rgba(102,255,0,0.4);}
.btn-green:hover:not(:disabled){background:rgba(102,255,0,0.08);box-shadow:0 0 15px rgba(102,255,0,0.2);border-color:rgba(102,255,0,0.7);}
.btn-locked{color:#556;border-color:rgba(255,255,255,0.08);cursor:not-allowed;opacity:0.6;}
.btn-lg{font-size:0.8rem;padding:10px 28px;letter-spacing:2px;}
.btn:disabled{opacity:0.4;cursor:not-allowed;}

/* â”€â”€ KEEPER / SELL ZONE â”€â”€ */
.keeper-row{display:flex;align-items:center;gap:12px;padding:4px 8px 8px;width:100%;max-width:700px;}
.keeper-dot{width:14px;height:14px;border-radius:50%;background:rgba(0,240,255,0.15);border:2px solid rgba(0,240,255,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;animation:keeper-dot-pulse 3s ease-in-out infinite;}
.keeper-dot-inner{width:6px;height:6px;border-radius:50%;background:#00f0ff;box-shadow:0 0 8px #00f0ff,0 0 16px rgba(0,240,255,0.3);animation:keeper-dot-blink 3s ease-in-out infinite;}
@keyframes keeper-dot-pulse{0%,100%{border-color:rgba(0,240,255,0.2);box-shadow:0 0 4px rgba(0,240,255,0.1);}50%{border-color:rgba(0,240,255,0.5);box-shadow:0 0 12px rgba(0,240,255,0.25);}}
@keyframes keeper-dot-blink{0%,40%,100%{background:#00f0ff;opacity:0.6;}45%,55%{background:#44ff66;opacity:1;}60%{background:#00f0ff;opacity:0.6;}}
.keeper-bubble{background:rgba(0,0,0,0.5);border:1px solid rgba(0,240,255,0.08);border-radius:8px;padding:6px 14px;flex:1;position:relative;min-height:36px;}
.keeper-bubble::before{content:'';position:absolute;left:-6px;top:50%;transform:translateY(-50%);border:6px solid transparent;border-right-color:rgba(0,240,255,0.08);}
.keeper-name{font-family:'Orbitron',sans-serif;font-weight:700;font-size:0.55rem;color:#00f0ff;letter-spacing:2px;}
.keeper-text{font-size:0.7rem;color:#8a9ab8;line-height:1.3;}
.keeper-sell-hot{background:rgba(255,68,68,0.08)!important;border-color:rgba(255,68,68,0.3)!important;box-shadow:0 0 20px rgba(255,68,68,0.15);}

/* â”€â”€ MASTERY â”€â”€ */
/* Mastery panel — right sidebar, always visible */
.mastery-panel{background:rgba(0,0,0,0.4);border:1px solid rgba(255,215,0,0.1);border-radius:8px;padding:6px 8px;flex-shrink:0;}
.mastery-list{display:flex;flex-direction:column;gap:2px;}
.mastery-item{display:flex;align-items:center;gap:5px;font-size:0.65rem;color:#667;padding:2px 4px;border-radius:4px;transition:all 0.3s;}
.mastery-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);flex-shrink:0;transition:all 0.3s;}
.mastery-done{color:#ffcc00;}
.mastery-done .mastery-dot{background:#ffcc00;border-color:#ffcc00;box-shadow:0 0 6px rgba(255,215,0,0.5);}
.m-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.1);flex-shrink:0;display:inline-block;}
.mastery-check.done .m-dot{background:#ffcc00;border-color:#ffcc00;box-shadow:0 0 6px rgba(255,215,0,0.4);}
.m-lock{width:10px;height:10px;display:inline-block;border:2px solid #ffcc00;border-radius:2px;position:relative;}
.m-lock::before{content:'';position:absolute;top:-5px;left:1px;width:4px;height:5px;border:2px solid #ffcc00;border-bottom:none;border-radius:3px 3px 0 0;}
.mastery-check.done{background:rgba(255,215,0,0.06);border-color:rgba(255,215,0,0.25);color:#ffcc00;text-shadow:0 0 4px rgba(255,215,0,0.3);}

/* â”€â”€ START / LANDING â”€â”€ */
.start-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px;position:relative;z-index:2;}
.start-logo{font-family:'Orbitron',sans-serif;font-size:3rem;font-weight:900;background:linear-gradient(90deg,#00f0ff,#ff00ff,#00f0ff);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:gradient-shift 3s linear infinite;margin-bottom:8px;letter-spacing:6px;text-shadow:0 0 30px rgba(0,240,255,0.3);}
@keyframes gradient-shift{0%{background-position:0%;}100%{background-position:200%;}}
.start-subtitle{font-family:'Rajdhani',sans-serif;font-size:1.1rem;color:#556;margin-bottom:32px;letter-spacing:4px;text-transform:uppercase;}
.faction-preview{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:32px;max-width:580px;width:100%;padding:0 20px;}
.faction-card{background:rgba(8,12,24,0.8);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 8px;text-align:center;backdrop-filter:blur(4px);transition:all 0.2s;cursor:default;}
.faction-card:hover{border-color:rgba(0,240,255,0.2);box-shadow:0 4px 16px rgba(0,0,0,0.3);transform:translateY(-2px);}
.faction-card-icon{font-size:1.5rem;}
.faction-card-name{font-weight:700;font-size:0.8rem;margin-top:4px;}
.faction-card-desc{font-size:0.5rem;color:#556;margin-top:3px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}

/* â”€â”€ GAME OVER â”€â”€ */
.game-over-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:100;backdrop-filter:blur(4px);}
.game-over-card{background:rgba(12,12,24,0.95);border:2px solid;border-radius:16px;padding:40px;text-align:center;max-width:400px;backdrop-filter:blur(12px);box-shadow:0 0 60px rgba(0,0,0,0.5);}
.game-over-card.win{border-color:#ffcc00;box-shadow:0 0 40px rgba(255,215,0,0.3);}
.game-over-card.lose{border-color:#ff4444;box-shadow:0 0 40px rgba(255,68,68,0.3);}
.game-over-title{font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;margin-bottom:12px;}
.game-over-subtitle{color:#556;margin-bottom:24px;font-size:1rem;}

/* â”€â”€ GAME CONTAINER â”€â”€ */
.game-container{position:relative;z-index:2;width:100%;max-width:1400px;margin:0 auto;padding:8px 24px;min-height:100vh;display:flex;flex-direction:column;}

/* â”€â”€ ALERTS â”€â”€ */
.op-alert{position:fixed;top:62%;left:50%;transform:translate(-50%,-50%);z-index:200;font-family:'Orbitron',sans-serif;font-size:0.85rem;font-weight:800;padding:12px 24px;background:rgba(0,0,0,0.85);border:2px solid var(--alert-color,#00f0ff);border-radius:8px;color:var(--alert-color,#00f0ff);text-shadow:0 0 12px var(--alert-color,#00f0ff);box-shadow:0 0 30px rgba(0,0,0,0.5);animation:alert-in 0.3s ease-out;white-space:nowrap;max-width:90vw;pointer-events:none;}
@keyframes alert-in{from{opacity:0;transform:translate(-50%,-50%) scale(0.8);}to{opacity:1;transform:translate(-50%,-50%) scale(1);}}
.net-event-banner{font-size:0.65rem;padding:4px 12px;border-radius:4px;background:rgba(0,0,0,0.6);border:1px solid var(--evt-color,#00f0ff);color:var(--evt-color,#00f0ff);margin-bottom:3px;display:inline-block;}

/* â”€â”€ GOLD FLASH VFX â”€â”€ */
.gold-flash-fx{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:150;font-family:'Orbitron',sans-serif;font-weight:900;font-size:2rem;pointer-events:none;animation:gf-pop 0.7s ease-out forwards;}
.gold-flash-earn{color:#ffcc00;text-shadow:0 0 20px rgba(255,204,0,0.5);}
.gold-flash-spend{color:#ff4444;text-shadow:0 0 20px rgba(255,68,68,0.5);}
.gf-coin{margin-right:4px;}
@keyframes gf-pop{0%{opacity:1;transform:translate(-50%,-50%) scale(0.5);}50%{transform:translate(-50%,-50%) scale(1.3);}100%{opacity:0;transform:translate(-50%,-80%) scale(1);}}

/* â”€â”€ PHASE TRANSITIONS â”€â”€ */
.phase-transition-overlay{position:fixed;inset:0;z-index:90;pointer-events:none;}
.phase-to-combat{background:linear-gradient(135deg,rgba(255,68,68,0.2),transparent);animation:phase-fade 0.5s ease-out forwards;}
.phase-to-shop{background:linear-gradient(135deg,rgba(0,240,255,0.15),transparent);animation:phase-fade 0.5s ease-out forwards;}
@keyframes phase-fade{from{opacity:1;}to{opacity:0;}}

/* â”€â”€ FROZEN CARD â”€â”€ */
.frozen-card{position:relative;box-shadow:0 0 18px rgba(80,160,255,0.5),inset 0 0 12px rgba(80,160,255,0.15)!important;border:2px solid rgba(100,180,255,0.6)!important;border-radius:14px;}
.frozen-card::before{content:"";position:absolute;inset:0;border-radius:14px;background:linear-gradient(180deg,rgba(100,180,255,0.12) 0%,transparent 40%,rgba(100,180,255,0.08) 100%);pointer-events:none;z-index:8;animation:frost-shimmer 2.5s ease-in-out infinite;}
.frozen-card::after{content:"FROZEN";position:absolute;top:6px;left:50%;transform:translateX(-50%);font-family:'Orbitron',sans-serif;font-size:0.45rem;font-weight:800;letter-spacing:2px;color:rgba(140,200,255,0.9);text-shadow:0 0 6px rgba(100,180,255,0.8);z-index:10;padding:1px 6px;background:rgba(0,0,0,0.5);border-radius:4px;border:1px solid rgba(100,180,255,0.3);}
@keyframes frost-shimmer{0%,100%{opacity:0.6;}50%{opacity:1;}}
@keyframes frost-pulse{0%,100%{opacity:0.5;transform:scale(1);}50%{opacity:1;transform:scale(1.2);}}

/* â”€â”€ STREAK / DANGER â”€â”€ */
.streak-fire{box-shadow:inset 0 0 80px rgba(255,100,0,0.04);}
.danger-low .game-header{border-bottom-color:rgba(255,68,68,0.3)!important;}

/* â”€â”€ SHOP SECTION â”€â”€ */
.shop-section{background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.08);border-radius:6px;padding:8px;margin-bottom:5px;}
.board-section{background:none;border:none;border-radius:0;padding:8px 0;}
.bench-pod{width:110px;flex-shrink:0;background:rgba(0,0,0,0.4);border:none;border-left:1px solid rgba(255,255,255,0.04);border-radius:0;padding:6px;display:flex;flex-direction:column;gap:4px;align-items:center;backdrop-filter:blur(6px);align-self:flex-end;max-height:340px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;}
.bench-pod:hover{border-left-color:rgba(0,240,255,0.12);background:rgba(0,0,0,0.5);}
.bench-pod-label{font-family:'Orbitron',sans-serif;font-size:0.55rem;font-weight:600;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:3px;}
.bench-pod-slots{display:flex;flex-direction:column;gap:4px;width:100%;}
.bench-pod-unit{position:relative;width:90px;height:56px;border-radius:8px;overflow:hidden;border:2px solid;cursor:grab;transition:transform 0.2s,box-shadow 0.2s;margin:0 auto;}
.bench-pod-unit:hover{transform:scale(1.15);z-index:20;box-shadow:0 4px 16px rgba(0,0,0,0.5);}
.bench-pod-unit img{width:100%;height:100%;object-fit:cover;}
.bench-pod-stats{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:6px;padding:2px 0;background:linear-gradient(transparent,rgba(0,0,0,0.85));font-family:'Orbitron',sans-serif;font-size:0.65rem;font-weight:700;color:#fff;}
.bench-pod-stats span:first-child{color:#ff6644;}
.bench-pod-stats span:last-child{color:#44ff66;}
.bench-pod-golden{position:absolute;top:2px;right:3px;font-size:0.7rem;filter:drop-shadow(0 0 3px #ffcc00);}
.bench-pod-empty{width:90px;height:56px;border-radius:8px;border:1px dashed rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.08);font-size:1.2rem;margin:0 auto;}

/* â”€â”€ TUTORIAL â”€â”€ */
.tutorial-title{font-family:'Orbitron',sans-serif;font-size:0.9rem;font-weight:800;color:#00f0ff;margin-bottom:8px;letter-spacing:2px;}
.tutorial-text{font-size:0.8rem;color:#889;line-height:1.6;}
.tutorial-faction-row{display:flex;gap:10px;align-items:center;padding:8px 10px;border:1px solid;border-radius:6px;background:rgba(0,0,0,0.2);}
.tutorial-phase-box{border:1px solid;border-radius:8px;padding:10px 14px;margin:8px 0;background:rgba(0,0,0,0.2);}
.tutorial-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
.tutorial-chip{font-size:0.7rem;padding:4px 8px;border:1px solid;border-radius:4px;background:rgba(0,0,0,0.3);}
.tutorial-tips{display:flex;flex-direction:column;gap:6px;}
.tutorial-tip{font-size:0.75rem;color:#889;padding:6px 10px;background:rgba(0,0,0,0.15);border-radius:4px;border-left:2px solid rgba(0,240,255,0.2);}

/* â”€â”€ MOD PANEL â”€â”€ */
.mod-panel{text-align:center;padding:32px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;gap:0;}
.mod-panel-header{font-family:'Orbitron',sans-serif;font-size:1.8rem;font-weight:900;color:#ffcc00;letter-spacing:6px;text-shadow:0 0 30px rgba(255,204,0,0.4),0 0 60px rgba(255,204,0,0.15);margin-bottom:4px;}
.mod-panel-sub{font-size:0.8rem;color:rgba(255,255,255,0.4);font-style:italic;margin-bottom:20px;}
.mod-unit-showcase{margin-bottom:20px;}
.mod-unit-card{display:flex;align-items:center;gap:20px;background:rgba(10,14,28,0.85);border:1px solid var(--fc,#888);border-radius:14px;padding:16px 24px;box-shadow:0 4px 30px rgba(0,0,0,0.5),inset 0 0 30px rgba(0,0,0,0.3),0 0 20px color-mix(in srgb,var(--fc) 15%,transparent);backdrop-filter:blur(8px);min-width:340px;}
.mod-unit-frame{width:110px;height:110px;border-radius:10px;overflow:hidden;border:2px solid;flex-shrink:0;position:relative;box-shadow:0 0 20px rgba(0,0,0,0.5);}
.mod-unit-art{width:100%;height:100%;object-fit:cover;}
.mod-unit-golden-badge{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(255,204,0,0.8));font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:900;color:#fff;padding:2px 0;text-align:center;letter-spacing:2px;text-shadow:0 0 6px rgba(0,0,0,0.8);}
.mod-unit-info{display:flex;flex-direction:column;gap:6px;text-align:left;}
.mod-unit-name{font-family:'Orbitron',sans-serif;font-size:1.1rem;font-weight:800;letter-spacing:1px;}
.mod-unit-meta{display:flex;align-items:center;gap:6px;}
.mod-unit-tier{font-family:'Orbitron',sans-serif;font-size:0.6rem;font-weight:700;padding:2px 8px;border:1px solid;border-radius:4px;background:rgba(0,0,0,0.3);}
.mod-unit-stats{display:flex;gap:12px;font-family:'Orbitron',sans-serif;font-size:0.8rem;font-weight:700;}
.mod-stat-atk{color:#ff4444;text-shadow:0 0 6px rgba(255,68,68,0.3);}
.mod-stat-hp{color:#44ff66;text-shadow:0 0 6px rgba(68,255,102,0.3);}
.mod-stat-shield{color:#4488ff;text-shadow:0 0 6px rgba(68,136,255,0.3);}
.mod-unit-keywords{display:flex;flex-wrap:wrap;gap:4px;}
.mod-kw-tag{display:flex;align-items:center;gap:3px;font-size:0.6rem;font-weight:600;color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:2px 6px;}
.mod-unit-current-mod{display:flex;align-items:center;gap:6px;font-size:0.65rem;font-weight:600;color:#ffcc00;background:rgba(255,204,0,0.08);border:1px solid rgba(255,204,0,0.2);border-radius:4px;padding:3px 8px;margin-top:2px;}
.mod-choices-label{font-family:'Orbitron',sans-serif;font-size:0.65rem;font-weight:700;color:rgba(255,255,255,0.35);letter-spacing:3px;margin-bottom:10px;text-transform:uppercase;}
.mod-choices{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;}
.mod-choice{background:rgba(10,14,28,0.9);border:2px solid rgba(255,204,0,0.2);border-radius:12px;padding:16px 20px;min-width:160px;max-width:200px;cursor:pointer;transition:all 0.25s;position:relative;overflow:hidden;text-align:center;}
.mod-choice::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,204,0,0.06),transparent 60%);pointer-events:none;}
.mod-choice:hover{transform:translateY(-6px) scale(1.04);border-color:rgba(255,204,0,0.6);box-shadow:0 8px 30px rgba(255,204,0,0.2),0 0 40px rgba(255,204,0,0.1);}
.mod-choice-icon{width:40px;height:40px;object-fit:contain;margin:0 auto 8px;filter:drop-shadow(0 0 8px rgba(255,204,0,0.4));}
.mod-choice-name{font-family:'Orbitron',sans-serif;font-size:0.8rem;font-weight:700;color:#ffcc00;margin-bottom:4px;}
.mod-choice-desc{font-size:0.7rem;color:rgba(255,255,255,0.5);margin-bottom:6px;}
.mod-choice-preview{display:flex;flex-direction:column;gap:2px;margin-top:4px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06);}
.mod-prev-stat{font-family:'Orbitron',sans-serif;font-size:0.6rem;font-weight:700;letter-spacing:0.5px;}
.mod-panel-title{font-family:'Orbitron',sans-serif;font-size:1.2rem;font-weight:800;color:#ffcc00;margin-bottom:24px;letter-spacing:2px;}

/* â”€â”€ RESPONSIVE â”€â”€ */
@media(max-width:1100px){
  .c{transform-origin:center center;}
  .sidebar-left,.sidebar-right{display:none;}
  .game-body{padding:4px 8px;}
  .bottom-row{flex-wrap:wrap;}
  .action-row{gap:16px;padding:6px 0;}
  .action-roll-btn{width:56px!important;height:56px!important;}
  .action-freeze,.action-tier{padding:10px 14px!important;min-width:80px!important;font-size:0.65rem!important;}
  .bench-pod{width:100%;flex-direction:row;border-left:none;border-top:1px solid rgba(255,255,255,0.04);}
  .bench-pod-slots{flex-direction:row;gap:6px;justify-content:center;}
  .hero-portrait{flex-direction:row;min-width:auto;gap:6px;padding:2px;}
  .hero-ring{width:40px;height:40px;}
  .hero-name{display:none;}
}

/* â”€â”€ SCREEN Z-INDEX (above bg-layer) â”€â”€ */
.start-screen,.game-over-overlay,.game-container,.mod-panel{position:relative;z-index:2;}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   CARD TOOLTIP (HOVER POPUP)
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* hover details handled by center info panel */
@keyframes tt-in{from{opacity:0;transform:translate(-50%,0) scale(0.95);}to{opacity:1;transform:translate(-50%,0) scale(1);}}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   BATTLE ARENA — CINEMATIC COMBAT
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
.battle-arena{position:relative;width:100%;height:calc(100vh - 120px);min-height:500px;overflow:hidden;background:radial-gradient(ellipse at 50% 50%,rgba(10,14,28,0.9),rgba(5,8,16,0.98));border-radius:0;border:none;}
/* Subtle grid floor */
.battle-arena::before{content:'';position:absolute;inset:0;background:linear-gradient(rgba(0,240,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,0.02) 1px,transparent 1px);background-size:60px 60px;pointer-events:none;opacity:0.4;animation:ba-grid-drift 20s linear infinite;}
@keyframes ba-grid-drift{from{background-position:0 0;}to{background-position:60px 60px;}}
/* Ambient particles */
.battle-arena::after{content:'';position:absolute;inset:0;background:radial-gradient(2px 2px at 20% 30%,rgba(0,240,255,0.15),transparent),radial-gradient(2px 2px at 80% 70%,rgba(255,0,255,0.1),transparent),radial-gradient(1px 1px at 50% 50%,rgba(255,255,255,0.08),transparent);pointer-events:none;animation:ba-ambient 8s ease-in-out infinite alternate;z-index:1;}
@keyframes ba-ambient{from{opacity:0.5;}to{opacity:1;}}

/* Screen flash */
.ba-screen-flash{position:absolute;inset:0;z-index:50;pointer-events:none;animation:ba-flash 0.3s ease-out forwards;}
@keyframes ba-flash{0%{opacity:0.6;}100%{opacity:0;}}

/* Announce banner */
.ba-announce{position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);z-index:40;font-family:'Orbitron',sans-serif;font-weight:900;font-size:2rem;letter-spacing:6px;text-transform:uppercase;padding:14px 36px;background:rgba(0,0,0,0.75);border-radius:10px;backdrop-filter:blur(10px);animation:ba-ann-in 0.25s cubic-bezier(0.34,1.56,0.64,1);white-space:nowrap;text-shadow:0 0 30px currentColor,0 0 60px currentColor;}
.ba-announce-start{color:#00f0ff;border:2px solid rgba(0,240,255,0.4);}
.ba-announce-combo{color:#ffcc00;border:2px solid rgba(255,204,0,0.4);font-size:1.6rem;animation:ba-ann-in 0.25s cubic-bezier(0.34,1.56,0.64,1),ba-pulse-gold 0.4s ease-in-out 3;}
.ba-announce-hack{color:#ff00ff;border:2px solid rgba(255,0,255,0.4);font-size:1.4rem;animation:ba-ann-in 0.25s cubic-bezier(0.34,1.56,0.64,1),ba-glitch 0.15s steps(2) 4;}
.ba-announce-buff{color:#00f0ff;border:1px solid rgba(0,240,255,0.3);font-size:1.1rem;}
.ba-announce-dodge{color:#aa66ff;border:2px solid rgba(170,100,255,0.4);font-size:1.6rem;}
.ba-announce-virus{color:#cc0044;border:2px solid rgba(204,0,68,0.4);font-size:1.5rem;animation:ba-ann-in 0.25s cubic-bezier(0.34,1.56,0.64,1),ba-pulse-red 0.4s ease-in-out 2;}
.ba-announce-execute{color:#ff4444;border:2px solid rgba(255,68,68,0.5);font-size:1.8rem;animation:ba-ann-in 0.25s cubic-bezier(0.34,1.56,0.64,1),ba-pulse-red 0.3s ease-in-out 3;}
.ba-announce-deadswitch{color:#aa66ff;border:2px solid rgba(170,100,255,0.4);font-size:1.5rem;}
.ba-announce-stalemate{color:#ffaa00;border:2px solid rgba(255,170,0,0.3);font-size:1.4rem;}
@keyframes ba-ann-in{from{opacity:0;transform:translate(-50%,-50%) scale(0.5);}to{opacity:1;transform:translate(-50%,-50%) scale(1);}}
@keyframes ba-pulse-red{0%,100%{box-shadow:0 0 20px rgba(255,68,68,0.2);}50%{box-shadow:0 0 50px rgba(255,68,68,0.6);}}
@keyframes ba-pulse-gold{0%,100%{box-shadow:0 0 20px rgba(255,204,0,0.2);}50%{box-shadow:0 0 50px rgba(255,204,0,0.6);}}
@keyframes ba-glitch{0%{transform:translate(-50%,-50%) skew(0);filter:hue-rotate(0);}50%{transform:translate(calc(-50% + 3px),calc(-50% - 2px)) skew(-2deg);filter:hue-rotate(90deg);}100%{transform:translate(-50%,-50%) skew(0);filter:hue-rotate(0);}}

/* Side labels */
.ba-label{position:absolute;z-index:8;font-family:'Orbitron',sans-serif;font-size:0.65rem;font-weight:700;letter-spacing:5px;opacity:0.4;}
.ba-label-enemy{top:2%;left:50%;transform:translateX(-50%);color:#ff4444;}
.ba-label-player{bottom:15%;left:50%;transform:translateX(-50%);color:#44ff66;}

/* VS Divider */
.ba-divider{position:absolute;top:46%;left:0;right:0;display:flex;align-items:center;gap:16px;z-index:6;padding:0 10%;}
.ba-divider-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent);}
.ba-divider span{font-family:'Orbitron',sans-serif;font-size:0.8rem;font-weight:900;color:rgba(255,255,255,0.2);letter-spacing:6px;}

/* Target SVG */
.ba-target-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:15;}
.ba-target-dash{animation:ba-dash 0.6s linear infinite;}
@keyframes ba-dash{to{stroke-dashoffset:-20;}}
.ba-impact-circle{animation:ba-ring-pulse 0.3s ease-out forwards;}
@keyframes ba-ring-pulse{from{r:6;opacity:1;stroke-width:3;}to{r:22;opacity:0;stroke-width:1;}}

/* â”€â”€ Arena Unit Card — BIGGER â”€â”€ */
.ba-unit{transition:all 0.35s cubic-bezier(0.4,0,0.2,1);filter:drop-shadow(0 6px 16px rgba(0,0,0,0.6));}
.ba-card{position:relative;min-width:140px;max-width:165px;border-radius:12px;overflow:hidden;border:2px solid var(--fc,#888);background:rgba(8,12,24,0.9);backdrop-filter:blur(6px);box-shadow:0 0 16px color-mix(in srgb,var(--fc) 25%,transparent);transition:box-shadow 0.3s;}
.ba-art{position:relative;width:100%;height:110px;overflow:hidden;}
.ba-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 0.3s;}
.ba-art-grad{position:absolute;inset:0;background:linear-gradient(transparent 30%,rgba(8,12,24,0.9));}
.ba-name{position:absolute;bottom:5px;left:8px;right:8px;font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:700;text-shadow:0 1px 6px rgba(0,0,0,0.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ba-shield-icon{position:absolute;top:4px;right:4px;font-size:0.7rem;animation:ba-shield-pulse 2s infinite;filter:drop-shadow(0 0 4px rgba(100,140,255,0.8));}
.ba-fw-icon{position:absolute;top:4px;left:4px;font-size:0.7rem;animation:ba-fw-pulse 1.5s infinite;filter:drop-shadow(0 0 4px rgba(255,100,0,0.8));}
@keyframes ba-shield-pulse{0%,100%{opacity:0.7;transform:scale(1);}50%{opacity:1;transform:scale(1.2);}}
@keyframes ba-fw-pulse{0%,100%{opacity:0.6;}50%{opacity:1;}}
.ba-stats{display:flex;justify-content:center;gap:10px;padding:5px 8px;font-family:'Orbitron',sans-serif;font-size:0.85rem;font-weight:800;}
.ba-s-atk{color:#ff6644;text-shadow:0 0 6px rgba(255,102,68,0.4);}
.ba-s-shield{color:#6688ff;text-shadow:0 0 6px rgba(102,136,255,0.4);}
.ba-s-hp{color:#44ff66;text-shadow:0 0 6px rgba(68,255,102,0.4);}
.ba-hp-track{height:5px;border-radius:3px;background:rgba(255,255,255,0.08);margin:0 8px 8px;overflow:hidden;}
.ba-hp-fill{height:100%;border-radius:3px;transition:width 0.4s cubic-bezier(0.4,0,0.2,1);box-shadow:0 0 8px currentColor;}

/* â”€â”€ Unit States â”€â”€ */
.ba-atk{z-index:25!important;filter:brightness(1.4) drop-shadow(0 0 20px var(--fc,#fff))!important;}
.ba-atk .ba-card{box-shadow:0 0 30px color-mix(in srgb,var(--fc) 50%,transparent)!important;}
.ba-hit{animation:ba-shake 0.3s ease-out!important;}
.ba-hit .ba-card{animation:ba-hit-flash 0.3s ease-out!important;}
.ba-target .ba-card{border-color:#ff4444!important;box-shadow:0 0 25px rgba(255,68,68,0.5)!important;animation:ba-target-pulse 0.3s ease-in-out!important;}
.ba-dodge{animation:ba-dodge-anim 0.6s ease-out!important;}
.ba-hardshell .ba-card{box-shadow:0 0 25px rgba(100,140,255,0.6)!important;animation:ba-hardshell-glow 0.7s ease-out!important;}
.ba-dead{animation:ba-death 0.7s ease-out forwards!important;}
.ba-golden .ba-card{border-color:#ffcc00!important;box-shadow:0 0 20px rgba(255,204,0,0.35)!important;}
/* NEW: Cleave — orange flash + card jitter */
.ba-cleaved{animation:ba-cleave-shake 0.35s ease-out!important;}
.ba-cleaved .ba-card{box-shadow:0 0 30px rgba(255,136,0,0.5)!important;border-color:#ff8800!important;}
/* NEW: Splash — yellow ripple */
.ba-splashed{animation:ba-splash-shake 0.35s ease-out!important;}
.ba-splashed .ba-card{box-shadow:0 0 25px rgba(255,204,0,0.5)!important;}
/* NEW: Execute — red flash + X mark */
.ba-executed .ba-card{box-shadow:0 0 40px rgba(255,0,0,0.6)!important;border-color:#ff0000!important;animation:ba-exec-flash 0.4s ease-out!important;}
/* NEW: Deadswitch — purple energy burst */
.ba-deadswitch-unit{filter:brightness(1.8) drop-shadow(0 0 24px rgba(170,100,255,0.8))!important;}
/* NEW: Thorned — orange reflect glow */
.ba-thorned .ba-card{box-shadow:0 0 30px rgba(255,136,0,0.6)!important;}

@keyframes ba-shake{0%{transform:translate(-50%,0);}15%{transform:translate(calc(-50% + 8px),3px);}30%{transform:translate(calc(-50% - 8px),-3px);}50%{transform:translate(calc(-50% + 5px),2px);}70%{transform:translate(calc(-50% - 3px),-1px);}100%{transform:translate(-50%,0);}}
@keyframes ba-hit-flash{0%{filter:brightness(1);}20%{filter:brightness(2.5) saturate(1.5);}100%{filter:brightness(1);}}
@keyframes ba-target-pulse{0%{transform:scale(1);}50%{transform:scale(1.06);}100%{transform:scale(1);}}
@keyframes ba-dodge-anim{0%{opacity:1;transform:translate(-50%,0);}15%{opacity:0.15;transform:translate(calc(-50% + 40px),-10px) scale(0.9);}40%{opacity:0;}60%{opacity:0.3;transform:translate(calc(-50% - 15px),5px) scale(0.95);}100%{opacity:1;transform:translate(-50%,0) scale(1);}}
@keyframes ba-death{0%{opacity:1;transform:translate(-50%,0) scale(1);filter:brightness(1);}15%{opacity:1;transform:translate(-50%,0) scale(1.2);filter:brightness(3) saturate(0);}40%{opacity:0.7;transform:translate(-50%,0) scale(1.1);filter:brightness(2) saturate(0);}100%{opacity:0;transform:translate(-50%,30px) scale(0.3);filter:brightness(0);}}
@keyframes ba-hardshell-glow{0%{box-shadow:0 0 10px rgba(100,140,255,0.3);}30%{box-shadow:0 0 40px rgba(100,140,255,0.8),inset 0 0 15px rgba(100,140,255,0.3);}100%{box-shadow:0 0 20px rgba(100,140,255,0.5);}}
@keyframes ba-cleave-shake{0%{transform:translate(-50%,0);}20%{transform:translate(calc(-50% + 6px),0) skew(-3deg);}40%{transform:translate(calc(-50% - 5px),0) skew(2deg);}60%{transform:translate(calc(-50% + 3px),0);}100%{transform:translate(-50%,0);}}
@keyframes ba-splash-shake{0%{transform:translate(-50%,0);}25%{transform:translate(-50%,4px);}50%{transform:translate(-50%,-3px);}75%{transform:translate(-50%,2px);}100%{transform:translate(-50%,0);}}
@keyframes ba-exec-flash{0%{filter:brightness(1);}25%{filter:brightness(4) saturate(2) hue-rotate(-20deg);}50%{filter:brightness(1) saturate(0.5);}75%{filter:brightness(2.5) saturate(2);}100%{filter:brightness(1);}}

/* Arena shake */
.arena-shake{animation:arena-shake-fx 0.35s ease-out!important;}
@keyframes arena-shake-fx{0%{transform:translate(0);}15%{transform:translate(-5px,3px);}30%{transform:translate(5px,-3px);}45%{transform:translate(-4px,2px);}60%{transform:translate(3px,-2px);}75%{transform:translate(-1px,1px);}100%{transform:translate(0);}}

/* â”€â”€ Impact VFX â”€â”€ */
.ba-impact-ring{position:absolute;top:50%;left:50%;width:60px;height:60px;transform:translate(-50%,-50%);border:3px solid;border-radius:50%;animation:ba-ring-expand 0.4s ease-out forwards;pointer-events:none;z-index:30;}
@keyframes ba-ring-expand{from{width:20px;height:20px;opacity:1;}to{width:100px;height:100px;opacity:0;}}

/* Particles — bigger, more dramatic */
.ba-particles{position:absolute;top:50%;left:50%;width:0;height:0;pointer-events:none;z-index:30;}
.ba-particle{position:absolute;width:5px;height:5px;border-radius:50%;background:var(--color,#ff4444);box-shadow:0 0 10px var(--color,#ff4444),0 0 20px var(--color,#ff4444);animation:ba-particle-fly 0.6s ease-out forwards;}
@keyframes ba-particle-fly{from{opacity:1;transform:translate(0,0) scale(1.5);}to{opacity:0;transform:translate(calc(cos(var(--angle))*55px),calc(sin(var(--angle))*55px)) scale(0);}}

/* Hardshell FX — hexagonal shield feel */
.ba-hardshell-fx{position:absolute;inset:-8px;border:2px solid rgba(100,140,255,0.7);border-radius:14px;animation:ba-hs-pulse 0.7s ease-out forwards;pointer-events:none;z-index:20;box-shadow:inset 0 0 18px rgba(100,140,255,0.4),0 0 20px rgba(100,140,255,0.3);}
@keyframes ba-hs-pulse{0%{opacity:1;transform:scale(0.85);}40%{transform:scale(1.08);}100%{opacity:0;transform:scale(1.15);}}

/* Dodge FX — ghost trail */
.ba-dodge-fx{position:absolute;top:15%;left:50%;transform:translateX(-50%);font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:900;color:#aa66ff;text-shadow:0 0 15px rgba(170,100,255,0.7);animation:ba-dodge-text 0.8s ease-out forwards;pointer-events:none;z-index:30;letter-spacing:3px;}
@keyframes ba-dodge-text{from{opacity:1;transform:translateX(-50%) translateY(0) scale(1.3);}50%{opacity:0.7;transform:translateX(-50%) translateY(-15px) scale(1);}to{opacity:0;transform:translateX(-50%) translateY(-30px) scale(0.7);}}

/* Explosion / Death FX — bigger, faction-colored */
.ba-explode-fx{position:absolute;top:50%;left:50%;width:0;height:0;pointer-events:none;z-index:30;}
.ba-ember{position:absolute;width:4px;height:4px;border-radius:50%;background:#ff4444;box-shadow:0 0 8px #ff4444,0 0 16px #ff8800;animation:ba-ember-fly var(--d,0.6s) ease-out forwards;}
@keyframes ba-ember-fly{from{opacity:1;transform:translate(0,0) scale(1.5);}to{opacity:0;transform:translate(calc(cos(var(--angle))*70px),calc(sin(var(--angle))*70px)) scale(0);}}

/* â•â•â• NEW: CLEAVE SLASH FX â•â•â• */
.ba-cleave-fx{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:140px;height:140px;pointer-events:none;z-index:30;}
.ba-cleave-slash{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 160deg,transparent,rgba(255,136,0,0.8) 40deg,transparent 80deg);animation:ba-cleave-spin 0.35s ease-out forwards;opacity:0.9;}
@keyframes ba-cleave-spin{from{transform:rotate(-60deg) scale(0.3);opacity:1;}to{transform:rotate(60deg) scale(1.2);opacity:0;}}

/* â•â•â• NEW: SPLASH WAVE FX â•â•â• */
.ba-splash-fx{position:absolute;top:50%;left:50%;width:0;height:0;pointer-events:none;z-index:30;}
.ba-splash-fx::before,.ba-splash-fx::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);border:2px solid rgba(255,204,0,0.6);border-radius:50%;animation:ba-splash-ring 0.5s ease-out forwards;}
.ba-splash-fx::after{animation-delay:0.1s;border-color:rgba(255,204,0,0.3);}
@keyframes ba-splash-ring{from{width:10px;height:10px;opacity:1;}to{width:120px;height:120px;opacity:0;}}

/* â•â•â• NEW: EXECUTE MARK FX â•â•â• */
.ba-execute-fx{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:'Orbitron',sans-serif;font-size:2.5rem;font-weight:900;color:#ff0000;text-shadow:0 0 20px rgba(255,0,0,0.8),0 0 40px rgba(255,0,0,0.4);animation:ba-exec-mark 0.5s ease-out forwards;pointer-events:none;z-index:30;}
@keyframes ba-exec-mark{0%{opacity:0;transform:translate(-50%,-50%) scale(3) rotate(15deg);}30%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0);}70%{opacity:1;}100%{opacity:0;transform:translate(-50%,-50%) scale(0.7);}}

/* â•â•â• NEW: DEADSWITCH NOVA FX â•â•â• */
.ba-deadswitch-nova{position:absolute;top:50%;left:50%;width:0;height:0;pointer-events:none;z-index:30;}
.ba-ds-ray{position:absolute;width:3px;height:50px;background:linear-gradient(to top,transparent,#aa66ff,transparent);box-shadow:0 0 8px rgba(170,100,255,0.6);transform-origin:bottom center;animation:ba-ds-burst 0.8s ease-out forwards;}
@keyframes ba-ds-burst{from{opacity:1;transform:rotate(var(--angle)) scaleY(0);}30%{opacity:1;transform:rotate(var(--angle)) scaleY(1.2);}to{opacity:0;transform:rotate(var(--angle)) scaleY(0.3) translateY(-30px);}}

/* â•â•â• NEW: THORNS REFLECT FX â•â•â• */
.ba-thorns-fx{position:absolute;top:50%;left:50%;width:0;height:0;pointer-events:none;z-index:30;}
.ba-thorn-spike{position:absolute;width:3px;height:25px;background:linear-gradient(to top,transparent,#ff8800);box-shadow:0 0 6px rgba(255,136,0,0.5);transform-origin:bottom center;animation:ba-thorn-out 0.5s ease-out forwards;}
@keyframes ba-thorn-out{from{opacity:1;transform:rotate(var(--angle)) scaleY(0);}40%{transform:rotate(var(--angle)) scaleY(1);}to{opacity:0;transform:rotate(var(--angle)) scaleY(0.5) translateY(-15px);}}

/* Damage Numbers — BIGGER, more variety */
.ba-dmg{position:absolute;top:-12px;left:50%;transform:translateX(-50%);z-index:35;font-family:'Orbitron',sans-serif;font-weight:900;font-size:1.2rem;text-shadow:0 2px 10px rgba(0,0,0,0.9),0 0 20px currentColor;animation:ba-dmg-float 0.9s ease-out forwards;pointer-events:none;white-space:nowrap;}
.ba-dmg-mal{font-size:1.4rem;animation:ba-dmg-malware 0.9s ease-out forwards!important;}
.ba-dmg-thorns{color:#ff8800;}
.ba-dmg-cleave{color:#ff8800;font-size:1rem;animation:ba-dmg-side 0.8s ease-out forwards!important;}
.ba-dmg-splash{color:#ffcc00;font-size:1rem;animation:ba-dmg-splash-float 0.8s ease-out forwards!important;}
@keyframes ba-dmg-float{0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1.5);}20%{transform:translateX(-50%) translateY(-14px) scale(1.1);}100%{opacity:0;transform:translateX(-50%) translateY(-40px) scale(0.7);}}
@keyframes ba-dmg-malware{0%{opacity:1;transform:translateX(-50%) scale(2);color:#ff00ff;}15%{transform:translateX(-50%) scale(1.2);}100%{opacity:0;transform:translateX(-50%) translateY(-50px) scale(0.6);}}
@keyframes ba-dmg-side{0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1.3);}100%{opacity:0;transform:translateX(-30%) translateY(-30px) rotate(10deg) scale(0.6);}}
@keyframes ba-dmg-splash-float{0%{opacity:1;transform:translateX(-50%) scale(1.3);}100%{opacity:0;transform:translateX(-70%) translateY(-25px) scale(0.5);}}

/* â•â•â• COMBAT LOG — Right-center, not overlapping cards â•â•â• */
.ba-log{position:absolute;top:30%;right:1.5%;width:240px;max-height:240px;overflow-y:auto;z-index:20;padding:8px 10px;background:rgba(0,0,0,0.55);border:1px solid rgba(0,240,255,0.06);border-radius:10px;backdrop-filter:blur(6px);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent;}
.ba-log-line{font-size:0.7rem;padding:3px 5px;opacity:0.9;animation:ba-log-in 0.25s ease-out;border-bottom:1px solid rgba(255,255,255,0.03);line-height:1.35;}
.ba-log-title{font-family:'Orbitron',sans-serif;font-size:0.6rem;font-weight:700;color:#556;letter-spacing:3px;text-align:center;padding-bottom:4px;margin-bottom:4px;border-bottom:1px solid rgba(0,240,255,0.08);}
@keyframes ba-log-in{from{opacity:0;transform:translateX(15px);}to{opacity:0.9;transform:translateX(0);}}

/* Result overlay */
.ba-result-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:45;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);animation:ba-result-bg 0.5s ease-out;}
@keyframes ba-result-bg{from{opacity:0;}to{opacity:1;}}
.ba-result{text-align:center;padding:36px 52px;border-radius:18px;animation:ba-result-in 0.5s cubic-bezier(0.34,1.56,0.64,1);}
@keyframes ba-result-in{from{opacity:0;transform:scale(0.5);}to{opacity:1;transform:scale(1);}}
.ba-result-win{background:rgba(0,20,0,0.85);border:2px solid #44ff66;box-shadow:0 0 60px rgba(68,255,102,0.3),inset 0 0 30px rgba(68,255,102,0.05);}
.ba-result-lose{background:rgba(20,0,0,0.85);border:2px solid #ff4444;box-shadow:0 0 60px rgba(255,68,68,0.3),inset 0 0 30px rgba(255,68,68,0.05);}
.ba-result-draw{background:rgba(10,10,20,0.85);border:2px solid #888;box-shadow:0 0 40px rgba(136,136,136,0.2);}
.ba-result-title{font-family:'Orbitron',sans-serif;font-size:2.4rem;font-weight:900;letter-spacing:5px;margin-bottom:10px;}
.ba-result-win .ba-result-title{color:#44ff66;text-shadow:0 0 30px rgba(68,255,102,0.6);}
.ba-result-lose .ba-result-title{color:#ff4444;text-shadow:0 0 30px rgba(255,68,68,0.6);}
.ba-result-draw .ba-result-title{color:#888;}
.ba-result-dmg{font-size:0.95rem;color:#99a;margin-top:10px;}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   IMPROVED DRAG & DROP
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
.dnd-ghost{position:fixed;z-index:1000;pointer-events:none;animation:dnd-ghost-in 0.12s ease-out;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.6));}
@keyframes dnd-ghost-in{from{opacity:0;transform:scale(0.7) rotate(-3deg);}to{opacity:0.95;transform:scale(1) rotate(0);}}
.dnd-ghost-card{min-width:110px;padding:10px;background:rgba(8,12,24,0.9);border-radius:10px;border:2px solid rgba(0,240,255,0.3);backdrop-filter:blur(8px);box-shadow:0 0 20px rgba(0,240,255,0.1);}
.dnd-ghost-card img{width:60px;height:60px;border-radius:8px;object-fit:cover;display:block;margin:0 auto 4px;}
.dnd-sell-zone{font-family:'Orbitron',sans-serif;font-size:0.85rem;font-weight:700;transition:all 0.2s;}
.dnd-drop-active{box-shadow:inset 0 0 30px rgba(0,240,255,0.06),0 0 16px rgba(0,240,255,0.08)!important;transition:all 0.2s;}
.dnd-drop-active.dnd-board{background:rgba(0,240,255,0.02)!important;border-radius:12px;}
.dnd-drop-active.dnd-bench{background:rgba(0,240,255,0.06)!important;border-left-color:rgba(0,240,255,0.2)!important;}
.keeper-sell-hot{background:rgba(255,68,68,0.1)!important;border-color:rgba(255,68,68,0.3)!important;box-shadow:inset 0 0 20px rgba(255,68,68,0.08)!important;}
.c[data-unit-id]{cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;}
.c[data-unit-id]:active{cursor:grabbing;}
.c[data-unit-id]>*{pointer-events:none;}
.c-dragging{opacity:0.4!important;transform:scale(0.95)!important;transition:none!important;pointer-events:none!important;}
.c-tap-selected{box-shadow:0 0 20px rgba(0,240,255,0.6),0 0 40px rgba(0,240,255,0.3),inset 0 0 15px rgba(0,240,255,0.15)!important;border-color:rgba(0,240,255,0.8)!important;transform:translateY(-4px) scale(1.03);z-index:10;}
.bench-pod-unit.tap-selected{box-shadow:0 0 15px rgba(0,240,255,0.6),0 0 30px rgba(0,240,255,0.3)!important;border-color:rgba(0,240,255,0.8)!important;transform:scale(1.08);z-index:10;}
.tap-target{border-color:rgba(0,240,255,0.3)!important;animation:tapPulse 1s ease-in-out infinite;cursor:pointer!important;}
@keyframes tapPulse{0%,100%{box-shadow:inset 0 0 10px rgba(0,240,255,0.05);}50%{box-shadow:inset 0 0 20px rgba(0,240,255,0.15);}}

/* === BREACH SYSTEM CSS === */
.breach-slot{display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;cursor:pointer;font-family:'Orbitron',sans-serif;font-size:0.65rem;font-weight:700;transition:all 0.3s;position:relative;border:2px solid;}
.breach-empty{background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);}
.breach-icon-empty{font-size:0.9rem;opacity:0.3;}
.breach-loaded{background:rgba(255,255,255,0.06);border-color:var(--breach-color,#00f0ff);color:var(--breach-color,#00f0ff);animation:breach-pulse 2s ease-in-out infinite;box-shadow:0 0 12px color-mix(in srgb,var(--breach-color) 30%,transparent);}
.breach-loaded:hover{transform:scale(1.08);box-shadow:0 0 20px color-mix(in srgb,var(--breach-color) 50%,transparent);}
.breach-armed{background:rgba(255,68,68,0.1);border-color:#ff4444;color:#ff4444;animation:breach-pulse 1.5s ease-in-out infinite;}
.breach-icon{font-size:1rem;}
.breach-label{text-transform:uppercase;letter-spacing:0.5px;}
.breach-timer{background:rgba(0,0,0,0.4);padding:1px 5px;border-radius:4px;font-size:0.55rem;color:rgba(255,255,255,0.7);}
.breach-rerolls{background:rgba(0,187,255,0.15);border:1px solid rgba(0,187,255,0.4);color:#00bbff;padding:2px 8px;border-radius:6px;font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:700;display:flex;align-items:center;gap:3px;}
@keyframes breach-pulse{0%,100%{box-shadow:0 0 8px color-mix(in srgb,var(--breach-color,#00f0ff) 20%,transparent);}50%{box-shadow:0 0 20px color-mix(in srgb,var(--breach-color,#00f0ff) 50%,transparent);}}

/* Breach pick overlay */
.breach-overlay{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);animation:breach-fade-in 0.3s ease-out;}
@keyframes breach-fade-in{from{opacity:0}to{opacity:1}}
.breach-pick-panel{text-align:center;max-width:800px;padding:32px 24px;}
.breach-glitch-text{font-family:'Orbitron',sans-serif;font-size:2.5rem;font-weight:900;color:#00ff88;text-shadow:0 0 40px rgba(0,255,136,0.6),0 0 80px rgba(0,255,136,0.3);letter-spacing:6px;margin-bottom:8px;animation:breach-glitch 0.5s steps(3) 2;}
@keyframes breach-glitch{0%{transform:translate(0);filter:hue-rotate(0deg);}25%{transform:translate(-3px,2px);filter:hue-rotate(90deg);}50%{transform:translate(3px,-2px);filter:hue-rotate(180deg);}75%{transform:translate(-1px,1px);filter:hue-rotate(270deg);}100%{transform:translate(0);filter:hue-rotate(0deg);}}
.breach-pick-title{font-family:'Orbitron',sans-serif;font-size:1.1rem;font-weight:800;color:#fff;margin-bottom:4px;}
.breach-pick-subtitle{font-size:0.8rem;color:rgba(255,255,255,0.5);margin-bottom:28px;font-style:italic;}
.breach-pick-cards{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;}
.breach-card{background:rgba(10,14,28,0.9);border:2px solid var(--bc,#444);border-radius:14px;padding:24px 20px;width:200px;cursor:pointer;transition:all 0.25s;position:relative;overflow:hidden;}
.breach-card::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,color-mix(in srgb,var(--bc) 10%,transparent),transparent 60%);pointer-events:none;}
.breach-card:hover{transform:translateY(-6px) scale(1.04);box-shadow:0 8px 40px color-mix(in srgb,var(--bc) 40%,transparent);border-color:var(--bc);}
.breach-card-svg{width:64px;height:64px;margin-bottom:12px;filter:drop-shadow(0 0 10px var(--bc));}
.breach-card-name{font-family:'Orbitron',sans-serif;font-size:0.85rem;font-weight:800;color:var(--bc);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;}
.breach-card-desc{font-size:0.75rem;color:rgba(255,255,255,0.65);line-height:1.5;}

/* Breach targeting */
.breach-targeting .breach-target-panel,.breach-glitch .breach-target-panel{background:rgba(8,12,24,0.95);border:2px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;max-width:700px;width:90vw;max-height:80vh;overflow-y:auto;}
.breach-target-title{font-family:'Orbitron',sans-serif;font-size:0.95rem;font-weight:800;color:#fff;text-align:center;margin-bottom:20px;}
.breach-target-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;}
.breach-target-unit{background:rgba(255,255,255,0.04);border:2px solid;border-radius:12px;padding:10px;width:120px;cursor:pointer;transition:all 0.2s;text-align:center;}
.breach-target-unit:hover{transform:scale(1.08);box-shadow:0 0 20px rgba(255,255,255,0.1);background:rgba(255,255,255,0.08);}
.breach-target-art{width:70px;height:70px;border-radius:8px;overflow:hidden;margin:0 auto 6px;background:#0a0e1c;}
.breach-target-name{font-family:'Orbitron',sans-serif;font-size:0.6rem;font-weight:700;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.breach-target-stats{display:flex;gap:8px;justify-content:center;font-family:'Orbitron',sans-serif;font-size:0.65rem;font-weight:700;}
.breach-target-cost{font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:800;color:#cc44ff;margin-top:4px;}
.breach-glitch-unit{border-style:dashed;position:relative;}
.glitch-disabled{pointer-events:auto;}
.glitch-disabled:hover{transform:none!important;box-shadow:none!important;}
.glitch-unit-blocked{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:900;color:#ff8800;letter-spacing:2px;background:rgba(0,0,0,0.6);border-radius:10px;text-shadow:0 0 8px currentColor;}

/* Breach animations */
.breach-anim-earned{animation:breach-earned-flash 1.5s ease-out!important;}
.breach-anim-used{animation:breach-used-flash 1.5s ease-out!important;}
@keyframes breach-earned-flash{0%{transform:scale(1.3);filter:brightness(3);}50%{transform:scale(1.1);filter:brightness(1.5);}100%{transform:scale(1);filter:brightness(1);}}
@keyframes breach-used-flash{0%{transform:scale(1.2);filter:brightness(2) hue-rotate(30deg);}100%{transform:scale(1);filter:brightness(1) hue-rotate(0deg);}}

/* Overclocked unit glow */
.c[data-overclocked="true"]{box-shadow:0 0 16px rgba(255,204,0,0.4)!important;}
.c[data-overclocked="true"]::after{content:'OC';position:absolute;top:2px;right:2px;font-size:0.7rem;filter:drop-shadow(0 0 4px #ffcc00);}

/* === DEBUG OVERLAY === */
.debug-overlay{position:fixed;right:0;top:0;width:380px;height:100vh;background:rgba(0,0,0,0.95);border-left:2px solid #00f0ff;z-index:9999;display:flex;flex-direction:column;font-family:monospace;font-size:11px;color:#ccc;overflow:hidden;}
.debug-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,240,255,0.1);border-bottom:1px solid #00f0ff44;font-size:13px;font-weight:bold;color:#00f0ff;}
.debug-boards{display:flex;gap:4px;padding:8px;border-bottom:1px solid #333;max-height:40vh;overflow-y:auto;}
.debug-side{flex:1;min-width:0;}
.debug-side-label{font-weight:bold;color:#00f0ff;margin-bottom:4px;font-size:10px;text-transform:uppercase;letter-spacing:1px;}
.debug-unit{background:rgba(255,255,255,0.05);border:1px solid #333;border-radius:4px;padding:3px 5px;margin-bottom:3px;display:flex;flex-direction:column;gap:1px;}
.du-name{color:#fff;font-weight:bold;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.du-stats{color:#0f0;font-size:10px;}
.du-kw{color:#ff0;font-size:9px;font-style:italic;}
.du-inn{color:#f0f;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.debug-log-label{padding:4px 12px;background:rgba(0,240,255,0.05);border-bottom:1px solid #333;color:#00f0ff;font-weight:bold;font-size:10px;}
.debug-log{flex:1;overflow-y:auto;padding:4px 8px;}
.dl-evt{padding:2px 4px;border-bottom:1px solid #111;font-size:10px;line-height:1.4;}
.dl-start{color:#00f0ff;font-weight:bold;}
.dl-atk{color:#ccc;}
.dl-kill{color:#ff4444;font-weight:bold;}
.dl-death{color:#ff6666;}
.dl-ds{color:#ff8800;font-weight:bold;}
.dl-splash{color:#44aaff;}
.dl-dodge{color:#44ff44;}
.dl-ann{color:#ffcc00;font-weight:bold;}
.dl-result{color:#fff;font-weight:bold;font-size:12px;padding:6px 4px;background:rgba(0,240,255,0.1);border-radius:4px;margin-top:4px;}

/* ── QUEST SYSTEM ── */
.quest-bar{display:flex;justify-content:center;padding:3px 20px;min-height:36px;}
.quest-offer{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,rgba(0,240,255,0.08),rgba(255,204,0,0.06));border:1px solid rgba(0,240,255,0.3);border-radius:10px;padding:4px 12px;cursor:pointer;transition:all 0.25s;max-width:600px;animation:questPulse 2s infinite alternate;}
.quest-offer:hover{border-color:rgba(0,240,255,0.6);background:linear-gradient(135deg,rgba(0,240,255,0.15),rgba(255,204,0,0.1));transform:scale(1.02);box-shadow:0 0 20px rgba(0,240,255,0.2);}
.quest-offer-tag{font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:900;color:#00f0ff;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;}
.quest-offer-body{display:flex;align-items:center;gap:8px;flex:1;}
.quest-offer-icon{font-size:1.2rem;min-width:24px;text-align:center;}
.quest-offer-info{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0;}
.quest-offer-name{font-family:'Orbitron',sans-serif;font-size:0.65rem;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:1px;}
.quest-offer-desc{font-size:0.55rem;color:rgba(255,255,255,0.6);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.quest-offer-reward{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:40px;}
.quest-offer-gold{font-family:'Orbitron',sans-serif;font-size:0.75rem;font-weight:900;color:#ffcc00;text-shadow:0 0 8px rgba(255,204,0,0.4);}
.quest-offer-rounds{font-family:'Orbitron',sans-serif;font-size:0.45rem;color:rgba(255,255,255,0.4);font-weight:700;}
@keyframes questPulse{0%{border-color:rgba(0,240,255,0.2);}100%{border-color:rgba(0,240,255,0.45);}}

.quest-active{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,rgba(68,255,102,0.06),rgba(255,204,0,0.04));border:1px solid rgba(68,255,102,0.25);border-radius:10px;padding:4px 12px;max-width:600px;}
.quest-active-tag{font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:900;color:#44ff66;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;}
.quest-active-body{display:flex;align-items:center;gap:8px;flex:1;}
.quest-active-icon{font-size:1.2rem;min-width:24px;text-align:center;}
.quest-active-info{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0;}
.quest-active-name{font-family:'Orbitron',sans-serif;font-size:0.65rem;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:1px;}
.quest-active-desc{font-size:0.55rem;color:rgba(255,255,255,0.6);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.quest-active-meta{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:44px;}
.quest-active-gold{font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:900;color:#ffcc00;text-shadow:0 0 8px rgba(255,204,0,0.4);}
.quest-active-timer{font-family:'Orbitron',sans-serif;font-size:0.5rem;font-weight:700;color:#44ff66;}
`;

// ── Inject game data for CombatTestHarness ──
if (typeof window !== "undefined") {
  window.__NA_TEST_DATA = { U, T7_UNITS, mkUnit, simCombat, rollShop, OPERATORS, CROSS_COMBOS, MODS, FACTIONS, KEYWORDS };
}

export default function NeonArena() {
  // ── Codex Mode: ?codex in URL ──
  const [isCodex] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("codex"));
  if (isCodex) return <Codex />;

  const [gs, setGs] = useState("start");
  const [round, setRound] = useState(0);
  const [hp, setHp] = useState(STARTING_HEALTH);
  const [gold, setGold] = useState(STARTING_GOLD);
  const [tier, setTier] = useState(1);
  const [board, setBoard] = useState([]);
  const [bench, setBench] = useState([]);
  const [shop, setShop] = useState([]);
  const [sold, setSold] = useState([]);
  const [frozen, setFrozen] = useState(false);
  const [sel, setSel] = useState(null);
  const [cEvents, setCEvents] = useState([]);
  const cEventsRef = useRef(cEvents);
  useEffect(() => { cEventsRef.current = cEvents; }, [cEvents]);
  const [debugOverlay, setDebugOverlay] = useState(false);  const [eName, setEName] = useState("");
  const [modC, setModC] = useState([]);
  const [modT, setModT] = useState(null);
  const [wins, setWins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lossStreak, setLossStreak] = useState(0);
  const [timerKey, setTimerKey] = useState(0);
  const [mode, setMode] = useState(null);
  const [showAudit, setShowAudit] = useState(false);
  const [pvpName, setPvpName] = useState("");
  const [playerId, setPlayerId] = useState(null);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [pvpOpponent, setPvpOpponent] = useState(null);
  const [pvpModDrop, setPvpModDrop] = useState(null);
  const [pvpConnecting, setPvpConnecting] = useState(false);
  const [pvpError, setPvpError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(50);
  const [operator, setOperator] = useState(null);
  const [opChoices, setOpChoices] = useState([]);
  const [freeReroll, setFreeReroll] = useState(false);
  const [lastRoundLost, setLastRoundLost] = useState(false);
  const [opAlert, setOpAlert] = useState(null);
  const [keeperLine, setKeeperLine] = useState("Welcome to the shop. Try not to break anything.");
  const playVendorVoice = (cat) => {if(_muted)return;try{if(_voiceAudio){_voiceAudio.pause();_voiceAudio=null;}const a=new Audio("/sounds/vendor/vendor_"+cat+".mp3?v=2");a.volume=0.5*_vol;a.play().catch(()=>{});_voiceAudio=a;a.onended=()=>{if(_voiceAudio===a)_voiceAudio=null;};}catch(e){}};
  const keeperSay = (cat) => { const lines = SCRAP9_LINES[cat] || SCRAP9_LINES.idle; setKeeperLine(lines[Math.floor(Math.random() * lines.length)]); playVendorVoice(cat); };
  const [dragUnit, setDragUnit] = useState(null);
  const [tapSelected, setTapSelected] = useState(null); // {unit, origin} — click-to-place
  const tapSelectedRef = useRef(null);
  useEffect(() => { tapSelectedRef.current = tapSelected; }, [tapSelected]);
  const doTapSwap = (fromUnit, fromOrigin, toUnit, toOrigin) => {
    if (fromOrigin === 'board' && toOrigin === 'board') {
      setBoard(b => { const a=[...b]; const fi=a.findIndex(u=>u.id===fromUnit.id); const ti=a.findIndex(u=>u.id===toUnit.id); if(fi>=0&&ti>=0)[a[fi],a[ti]]=[a[ti],a[fi]]; return a; });
    } else if (fromOrigin === 'bench' && toOrigin === 'bench') {
      setBench(b => { const a=[...b]; const fi=a.findIndex(u=>u.id===fromUnit.id); const ti=a.findIndex(u=>u.id===toUnit.id); if(fi>=0&&ti>=0)[a[fi],a[ti]]=[a[ti],a[fi]]; return a; });
    } else if (fromOrigin === 'bench' && toOrigin === 'board') {
      setBench(b => b.map(u => u.id === fromUnit.id ? toUnit : u));
      setBoard(b => b.map(u => u.id === toUnit.id ? fromUnit : u));
    } else if (fromOrigin === 'board' && toOrigin === 'bench') {
      setBoard(b => b.map(u => u.id === fromUnit.id ? toUnit : u));
      setBench(b => b.map(u => u.id === toUnit.id ? fromUnit : u));
    }
  };
  const [hovUnit, setHovUnit] = useState(null);
  const [hovInfo, setHovInfo] = useState(null); // universal hover: {type:'combo'|'mod'|'breach'|'keyword'|'faction', ...data}
  const [dragOrigin, setDragOrigin] = useState(null);
  const [dragPos, setDragPos] = useState({x:0,y:0});
  const [dropZone, setDropZone] = useState(null);
  const sellZoneActive = !!dragUnit && (dragOrigin==="board"||dragOrigin==="bench");
  const [netEvent, setNetEvent] = useState(null);
  const [boughtThisRound, setBoughtThisRound] = useState(false);
  const [buyCountThisRound, setBuyCountThisRound] = useState(0);
  // War Profiteer: +1 ATK per gold spent this round
  const buffWarProfiteer = useCallback((amt) => {
    if (amt <= 0) return;
    const buff = (units) => units.map(u => {
      const tn = u.tn || u.name.replace(/^Golden /, '');
      if (tn === 'War Profiteer') return {...u, atk: u.atk + amt};
      return u;
    });
    setBoard(b => buff(b));
    setBench(b => buff(b));
  }, []);
  const [recycledUnits, setRecycledUnits] = useState([]);
  const [pvpOpPicked, setPvpOpPicked] = useState(null);
  // === BREACH STATE ===
  const [breaches, setBreaches] = useState([]); // array of up to 3 breaches
  const [breachChoices, setBreachChoices] = useState([]); // 3 choices during pick
  const [breachMode, setBreachMode] = useState(null); // null | "picking" | "targeting" | "glitch-market"
  const [breachGlitchShop, setBreachGlitchShop] = useState([]); // glitch market shop
  const [breachFreeRerolls, setBreachFreeRerolls] = useState(0); // time hack free rerolls
  const [lastEnemyBoard, setLastEnemyBoard] = useState([]); // for PvE steal
  const [pendingChip, setPendingChip] = useState(null); // Augment chip waiting to be applied
  const [reconView, setReconView] = useState(false); // Recon Tab: viewing opponent's board
  const [reconEnemy, setReconEnemy] = useState([]); // Preview of next enemy (generated lazily)
  const [reconTimer, setReconTimer] = useState(0); // 10-second countdown
  const boardRef = useRef(board);
  const prevBoardRef = useRef([]);
  useEffect(() => {
    // Board audit: detect unexpected unit loss
    const prev = prevBoardRef.current;
    const curr = board;
    if (prev.length > 0 && curr.length < prev.length && gs === "shop") {
      const currIds = new Set(curr.map(u => u.id));
      const missing = prev.filter(u => !currIds.has(u.id));
      if (missing.length > 0) {
        console.warn("🔍 BOARD AUDIT: Units vanished during shop phase!", missing.map(u => `${u.name}(id:${u.id})`));
      }
    }
    prevBoardRef.current = curr.map(u => ({ id: u.id, name: u.name }));
    boardRef.current = board;
  }, [board]);

  // ═══ PROTOCOL QUEUE STATE (v5) ═══
  // v6: Protocol Queue removed. Augment chips are in the shop now.
  // v6: APM bonus removed. Speed is its own reward via time pressure.
  const [sabotageActive, setSabotageActive] = useState(false); // flag for next combat
  const [breachAnim, setBreachAnim] = useState(null); // animation state
  const [timerOverride, setTimerOverride] = useState(null); // for time_hack
  const [mastery, setMastery] = useState({ winStreak3: false, crossCombo: false, tripleUnit: false, bossSurvived: false, banked10: false });
  const masteryCount = Object.values(mastery).filter(Boolean).length;
  const t6Unlocked = masteryCount >= 5;
  // T6 mastery gate: cap effective shop tier at 5 unless mastery is complete (solo only)
  const maxShopTier = (mode !== "pvp" && !t6Unlocked) ? 5 : 6;
  // ── QUEST SYSTEM ──
  const [activeQuest, setActiveQuest] = useState(null); // { ...questDef, roundAccepted, roundsLeft }
  const [questOffer, setQuestOffer] = useState(null);   // quest card shown in shop (null = no offer)
  const questProgressRef = useRef({ sellCount: 0, buyKwCount: 0, chipApplied: false, tripled: false, soldVetKills: 0, lastWinFaction: null, consecWinFactions: 0 });
  const lastQuestIdRef = useRef(null); // prevent same quest twice in a row
  const maxBench = (operator && operator.id==="hard_reset") ? MAX_BENCH + 2 : MAX_BENCH;
  const prevMasteryRef = useRef(0);
  const wsRef = useRef(null);
  const gsRef = useRef(gs);
  useEffect(() => { gsRef.current = gs; }, [gs]);
  const pendingMsgRef = useRef(null);
  const combatDoneRef = useRef(null);

  const fCounts = useMemo(() => { const c = {}; board.forEach(u => { c[u.faction] = (c[u.faction]||0)+1; }); const wcs = board.filter(u => u._wildcard || (u.innate && (u.innate.toLowerCase().includes("counts as any faction") || u.innate.toLowerCase().includes("counts as every faction")))); const NNF = ["SYNTH","HACKER","AUGMENTED","DRONE","PSIONIC","VIRUS","PHANTOM","CONSTRUCT"]; wcs.forEach(() => { let bestF = null, bestC = 0; NNF.forEach(f => { if ((c[f]||0) > bestC) { bestC = c[f]; bestF = f; } }); if (bestF) c[bestF] += 1; }); return c; }, [board]);
  const rCounts = useMemo(() => { const c = {}; board.forEach(u => { const r = u.role || 'Sentinel'; c[r] = (c[r]||0)+1; }); return c; }, [board]);
  const bossWarn = BOSSES[round+1]&&mode!=="pvp"?("Next: "+BOSSES[round+1].name+" \u2014 "+BOSSES[round+1].desc):null;
  const activeCombos = useMemo(() => {
    const combos = CROSS_COMBOS.filter(cc => { const [f1,f2]=cc.factions; return (fCounts[f1]||0)>=cc.min[0]&&(fCounts[f2]||0)>=cc.min[1]; });
    if(combos.length > 0) setMastery(m => m.crossCombo ? m : {...m, crossCombo: true});
    return combos;
  }, [fCounts]);
  // v7: +1g bonus when a NEW combo activates
  const prevCombosRef = useRef(new Set());
  useEffect(() => {
    if (gs !== "shop") return;
    const currentNames = new Set(activeCombos.map(c=>c.name));
    let newCount = 0;
    currentNames.forEach(n => { if (!prevCombosRef.current.has(n)) newCount++; });
    if (newCount > 0) {
      setGold(g => g + newCount);
      showOpAlert(`⚡ Combo bonus: +${newCount}g!`, '#00f0ff');
    }
    prevCombosRef.current = currentNames;
  }, [activeCombos, gs]);
  const comebackBonus = hp < 10 ? 2 : hp < 20 ? 1 : 0;

  // ── QUEST ENGINE ──
  const rollQuestOffer = useCallback((currentTier) => {
    if (activeQuest) return null; // Already have a quest
    if (Math.random() > 0.30) return null; // 30% chance
    const pool = QUESTS_DATA.filter(q => q.tier.includes(currentTier) && q.id !== lastQuestIdRef.current);
    if (pool.length === 0) return null;
    const q = pool[Math.floor(Math.random() * pool.length)];
    lastQuestIdRef.current = q.id;
    return q;
  }, [activeQuest]);

  const acceptQuest = useCallback((q) => {
    setActiveQuest({ ...q, roundAccepted: round, roundsLeft: q.rounds });
    setQuestOffer(null);
    playSound("buy");
    showOpAlert(`📋 Quest accepted: ${q.name} — ${q.reward}g`, "#00f0ff");
  }, [round]);

  const completeQuest = useCallback((quest) => {
    const bonus = operator?.id === "killswitch" ? Math.ceil(quest.reward * 0.5) : 0;
    const total = quest.reward + bonus;
    setGold(g => g + total);
    setActiveQuest(null);
    playSound("tier-up");
    showOpAlert(`✅ Quest complete: ${quest.name} — +${total}g!${bonus > 0 ? ` (Killswitch +${bonus}g)` : ''}`, "#44ff66");
  }, [operator]);

  const failQuest = useCallback(() => {
    showOpAlert(`❌ Quest expired: ${activeQuest?.name}`, "#ff4444");
    setActiveQuest(null);
  }, [activeQuest]);

  // Check board-state quests (called when board changes)
  const checkBoardQuest = useCallback((quest, brd, fC, rC, combos) => {
    if (!quest) return false;
    const ch = quest.check;
    if (ch === "board_faction_stack") {
      return Object.values(fC).some(v => v >= quest.target);
    }
    if (ch === "board_has_faction") {
      return brd.filter(u => u.faction === quest.faction).length >= quest.target;
    }
    if (ch === "board_role_position") {
      return brd.filter(u => (u.role || 'Sentinel') === quest.role && quest.positions.includes(brd.indexOf(u))).length >= quest.target;
    }
    if (ch === "board_role_diversity") {
      const roles = new Set(brd.map(u => u.role || 'Sentinel'));
      return roles.size >= quest.target;
    }
    if (ch === "board_unit_keywords") {
      return brd.some(u => (u.kw || u.keywords || []).length >= quest.target);
    }
    if (ch === "board_role_count") {
      return brd.filter(u => (u.role || 'Sentinel') === quest.role).length >= quest.target;
    }
    if (ch === "board_chipped_units") {
      return brd.filter(u => u._chipCount && u._chipCount > 0).length >= quest.target;
    }
    if (ch === "board_veteran_count") {
      const vetKills = quest.vetTier === 3 ? 10 : quest.vetTier === 2 ? 6 : 3;
      return brd.filter(u => (u._lifetimeKills || 0) >= vetKills).length >= quest.target;
    }
    if (ch === "board_construct_bonus") {
      return brd.some(u => u.faction === "CONSTRUCT" && (u._constructBonus || 0) >= quest.target);
    }
    if (ch === "board_has_combo") {
      return combos.length >= quest.target;
    }
    if (ch === "board_specific_combo") {
      return combos.some(c => c.name === quest.combo);
    }
    if (ch === "board_wildcard_combo") {
      return brd.some(u => u._wildcard || (u.innate && (u.innate.toLowerCase().includes("counts as any faction") || u.innate.toLowerCase().includes("counts as every faction")))) && combos.length > 0;
    }
    if (ch === "board_adjacent_kw") {
      for (let i = 0; i < brd.length - 1; i++) {
        if ((brd[i].kw || brd[i].keywords || []).includes(quest.keyword) &&
            (brd[i+1].kw || brd[i+1].keywords || []).includes(quest.keyword)) return true;
      }
      return false;
    }
    if (ch === "board_golden_veteran") {
      const vetKills = quest.vetTier === 3 ? 10 : quest.vetTier === 2 ? 6 : 3;
      return brd.some(u => u.golden && (u._lifetimeKills || 0) >= vetKills);
    }
    return false;
  }, []);

  // Check combat quests (called after combat with events + result)
  const checkCombatQuest = useCallback((quest, evts, result, brd, fC, combos) => {
    if (!quest) return false;
    const ch = quest.check;
    const playerWon = result.playerWon;
    const pDeaths = evts.filter(e => e.type === "death" && e.side === "player");
    const eDeaths = evts.filter(e => e.type === "death" && e.side === "enemy");
    const attacks = evts.filter(e => e.type === "attack");

    if (ch === "combat_first_kill") {
      // First attack event that results in a kill
      for (const e of evts) {
        if (e.type === "attack" && e.side === "player") { return !!e.killed; }
        if (e.type === "attack") break; // first attack wasn't player's
      }
      return false;
    }
    if (ch === "combat_total_shield") {
      const startEvt = evts.find(e => e.type === "start");
      if (!startEvt || !startEvt.pBoard) return false;
      const totalShield = startEvt.pBoard.reduce((s, u) => s + (u.shield || 0), 0);
      return totalShield >= quest.target;
    }
    if (ch === "combat_close_win") {
      if (!playerWon) return false;
      const survivors = result.pBoard || [];
      return survivors.length > 0 && survivors.some(u => u.hp <= quest.hpThreshold && u.hp > 0);
    }
    if (ch === "combat_ds_deaths") {
      const dsDeaths = evts.filter(e => e.type === "deadswitch" && e.side === "player").length;
      return dsDeaths >= quest.target;
    }
    if (ch === "combat_backline_kills") {
      // Units originally at pos 4-6 getting kills
      const killsByPos = {};
      evts.filter(e => e.type === "attack" && e.side === "player" && e.killed).forEach(e => {
        const pos = e.attackerPos ?? -1;
        if (pos >= 4) killsByPos[e.attackerId] = (killsByPos[e.attackerId] || 0) + 1;
      });
      return Object.values(killsByPos).some(k => k >= quest.target);
    }
    if (ch === "combat_virus_aoe_kills") {
      // Count enemies killed by deadswitch AoE from Virus units
      const dsHitKills = evts.filter(e => e.type === "ds_hit" && e.killed).length;
      return dsHitKills >= quest.target;
    }
    if (ch === "combat_dodge_count") {
      const dodges = evts.filter(e => e.type === "dodge" && e.side === "player");
      if (quest.faction) {
        // Count max dodges by any single unit matching faction
        const byUnit = {};
        dodges.forEach(d => { byUnit[d.unitId] = (byUnit[d.unitId] || 0) + 1; });
        return Object.values(byUnit).some(c => c >= quest.target);
      }
      return dodges.length >= quest.target;
    }
    if (ch === "combat_max_faction") {
      // Check max units of faction at any point during combat
      const maxCount = Math.max(...evts.filter(e => e.pBoard).map(e =>
        e.pBoard.filter(u => u.faction === quest.faction).length), 0);
      return maxCount >= quest.target;
    }
    if (ch === "combat_atk_stolen") {
      const stolen = evts.filter(e => e.type === "steal" && e.side === "player")
        .reduce((s, e) => s + (e.amount || 1), 0);
      return stolen >= quest.target;
    }
    if (ch === "combat_damage_dealt") {
      if (!playerWon) return false;
      return (result.dmgToLoser || 0) >= quest.target;
    }
    if (ch === "combat_flawless") {
      return playerWon && pDeaths.length === 0;
    }
    if (ch === "combat_combo_win") {
      return playerWon && combos.some(c => c.name === quest.combo);
    }
    if (ch === "combat_stealth_kill") {
      // An attack by a stealthed unit that kills
      return evts.some(e => e.type === "attack" && e.side === "player" && e.killed && e.stealthed);
    }
    if (ch === "combat_ds_chain_kill") {
      // A deadswitch hit that kills → that death triggers another deadswitch
      let dsKillIdx = -1;
      for (let i = 0; i < evts.length; i++) {
        if (evts[i].type === "ds_hit" && evts[i].killed) dsKillIdx = i;
        if (dsKillIdx >= 0 && i > dsKillIdx && evts[i].type === "deadswitch") return true;
      }
      return false;
    }
    if (ch === "combat_synth_long") {
      if (!playerWon) return false;
      const hasSynth = (fC.SYNTH || 0) >= 2;
      return hasSynth && attacks.length >= quest.target;
    }
    if (ch === "combat_role_kills") {
      // Count kills by units of a specific role
      const roleKills = {};
      evts.filter(e => e.type === "attack" && e.side === "player" && e.killed).forEach(e => {
        const id = e.attackerId;
        roleKills[id] = (roleKills[id] || 0) + 1;
      });
      // Need to match role — check start board
      const startEvt = evts.find(e => e.type === "start");
      if (!startEvt?.pBoard) return false;
      return startEvt.pBoard.some(u => (u.role || 'Sentinel') === quest.role && (roleKills[u.id] || 0) >= quest.target);
    }
    if (ch === "combat_shield_destroyed") {
      const destroyed = evts.filter(e => e.type === "shield_hit" || e.type === "attack")
        .reduce((s, e) => s + (e.shieldDmg || 0), 0);
      return destroyed >= quest.target;
    }
    if (ch === "combat_survivors_low_hp") {
      if (!playerWon) return false;
      const lowSurvivors = (result.pBoard || []).filter(u => u.hp > 0 && u.hp <= (quest.hpThreshold || 2));
      return lowSurvivors.length >= quest.target;
    }
    if (ch === "combat_execute_kills") {
      const execKills = evts.filter(e => e.type === "execute" && e.side === "player").length;
      return execKills >= quest.target;
    }
    if (ch === "combat_perfect_board") {
      if (!playerWon) return false;
      const factionSyns = Object.values(fC).filter(v => v >= 2).length;
      return combos.length >= 2 && factionSyns >= 2;
    }
    if (ch === "combat_total_wipe") {
      return playerWon && (result.eBoard || []).filter(u => u.hp > 0).length === 0;
    }
    if (ch === "combat_faction_flex") {
      // Track consecutive wins with different primary factions
      if (!playerWon) { questProgressRef.current.consecWinFactions = 0; questProgressRef.current.lastWinFaction = null; return false; }
      const primary = Object.entries(fC).sort((a,b) => b[1]-a[1])[0]?.[0];
      if (primary && primary !== questProgressRef.current.lastWinFaction) {
        questProgressRef.current.consecWinFactions++;
        questProgressRef.current.lastWinFaction = primary;
      } else { questProgressRef.current.consecWinFactions = 1; questProgressRef.current.lastWinFaction = primary; }
      return questProgressRef.current.consecWinFactions >= 2;
    }
    if (ch === "combat_boss_win") {
      return playerWon && !!BOSSES[round];
    }
    if (ch === "combat_win_streak") {
      // Use current streak — streakRef gets updated before this check
      return false; // checked separately via streak state
    }
    return false;
  }, [round]);

  // Board quest effect — check whenever board/combos change during shop
  useEffect(() => {
    if (!activeQuest || gs !== "shop") return;
    const ch = activeQuest.check;
    if (!ch.startsWith("board_")) return;
    if (checkBoardQuest(activeQuest, board, fCounts, rCounts, activeCombos)) {
      completeQuest(activeQuest);
    }
  }, [board, fCounts, rCounts, activeCombos, activeQuest, gs, checkBoardQuest, completeQuest]);
  useEffect(() => {
    if(masteryCount > prevMasteryRef.current) {
      const names = {winStreak3:"Win Streak",crossCombo:"Cross-Combo",tripleUnit:"Triple Unit",bossSurvived:"Boss Survived",banked10:"Gold Banked"};
      const latest = Object.entries(mastery).find(([k,v])=>v&&!Object.entries(mastery).slice(0,Object.keys(mastery).indexOf(k)).every(([,val])=>val));
      showOpAlert(" MASTERY: " + masteryCount + "/5 complete!" + (t6Unlocked ? " T6 UNLOCKED!" : ""), "#ffcc00");
      prevMasteryRef.current = masteryCount;
    }
  }, [masteryCount]);
  const timerSec = getTimer(round);

  const pvpSend = useCallback((msg) => { if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify(msg)); }, []);
  const connectPvP = useCallback(() => {
    setPvpConnecting(true); setPvpError(null);
    const ws = new WebSocket("ws://localhost:3001"); wsRef.current = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ type: "join", name: pvpName || "Anon" })); setPvpConnecting(false); };
    ws.onmessage = (evt) => { const msg = JSON.parse(evt.data); switch (msg.type) {
      case "joined": setPlayerId(msg.playerId); setGs("pvpLobby"); setMode("pvp"); break;
      case "lobby": setLobbyPlayers(msg.players); break;
      case "leaderboard": setLeaderboard(msg.players); break;
      case "operatorPick": setOpChoices(msg.choices); setGs("operatorPick"); break;
      case "operatorConfirmed": setOperator(msg.operator); break;
      case "shopPhase": if(gsRef.current==="combat"){pendingMsgRef.current=msg;break;} if(msg.operator&&!operator)setOperator(msg.operator); setGs("shop"); playTrans("trans-to-shop"); setRound(msg.round); setGold(msg.gold); setBoard(msg.board); setBench(msg.bench); setShop(msg.shop); setTier(msg.tier); setHp(msg.hp); setWins(msg.wins); setStreak(msg.streak); setSold([]); setTimerKey(k=>k+1); if(msg.netEvent){setNetEvent(msg.netEvent);} else {setNetEvent(null);} if(msg.mastery)setMastery(msg.mastery); break;
      case "stateUpdate": setGold(msg.gold); setBoard(msg.board); setBench(msg.bench); setShop(msg.shop); setSold(msg.shopSold||[]); setTier(msg.tier); setHp(msg.hp); if(msg.frozen!==undefined)setFrozen(msg.frozen); break;
      case "masteryBlock": if(msg.mastery)setMastery(msg.mastery); showOpAlert(" T6 Locked! Complete 5/5 mastery goals. ("+msg.count+"/5)","#ff4444"); break;
      case "combatStart": setGs("combat"); playTrans("trans-to-combat"); setPvpOpponent(msg.opponent); setCEvents(msg.events); break;
      case "modDrop": if(gsRef.current==="combat"){pendingMsgRef.current=msg;break;} setPvpModDrop(msg); setGs("modPick"); break;
      case "gameOver": if(gsRef.current==="combat"){pendingMsgRef.current=msg;break;} setLeaderboard(msg.leaderboard); setGs("pvpGameOver"); break;
      // === BREACH PVP MESSAGES ===
      case "breachEarned": {
        const available=msg.choices||[];
        setBreachChoices(available);
        setBreachMode("picking");
        playSound("sfx-combo",0.4);
        break;
      }
      case "breachAlert": showOpAlert(msg.message, "#ff2266"); break;
      case "breached": showOpAlert("BREACHED! " + msg.breach.name + " hit you!" + (msg.lostUnit ? " Lost: " + msg.lostUnit : ""), "#ff4444"); break;
      case "breachGlitchMarket": setBreachGlitchShop(msg.shop); setHovUnit(null); setBreachMode("glitch-market"); playSound("sfx-combo",0.4); showOpAlert("BLACK ICE — Secret T" + msg.tier + " shop opened!", "#cc44ff"); break;
      case "breachTimeHack": setBreachFreeRerolls(msg.freeRerolls||3); setTimerOverride(45); setTimerKey(k=>k+1); playSound("sfx-combo",0.4); showOpAlert("CHRONOBREAK — Timer reset + 3 free rerolls!", "#00bbff"); break;
    }};
    ws.onclose = () => { setPvpConnecting(false); };
    ws.onerror = () => { setPvpConnecting(false); setPvpError("Could not connect. Is the server running on port 3001?"); };
  }, [pvpName]);
  const leaveGame = useCallback(() => { if(wsRef.current){wsRef.current.close();wsRef.current=null;} setGs("start"); setMode(null); setPlayerId(null); setLobbyPlayers([]); setLeaderboard([]); playTrans("trans-exit"); }, []);

  const startGame = () => {
    uid = 0; unitPool.init(); setRound(1); setHp(STARTING_HEALTH);
    setGold(STARTING_GOLD+1); setTier(1); setBoard([]); setBench([]);
    setWins(0); setStreak(0); setLossStreak(0); setSold([]); setFrozen(false); setMastery({winStreak3:false,crossCombo:false,tripleUnit:false,bossSurvived:false,banked10:false}); prevMasteryRef.current=0;
    setPendingChip(null); setReconView(false);
    setOperator(null); setBoughtThisRound(false); setBuyCountThisRound(0); setPvpOpPicked(null); setFreeReroll(false);
    setActiveQuest(null); setQuestOffer(null); questProgressRef.current = { sellCount: 0, buyKwCount: 0, chipApplied: false, tripled: false, soldVetKills: 0, lastWinFaction: null, consecWinFactions: 0 }; lastQuestIdRef.current = null;
    setBreaches([]); setBreachChoices([]); setBreachMode(null); setBreachGlitchShop([]); setBreachFreeRerolls(0); setLastEnemyBoard([]); setSabotageActive(false); setBreachAnim(null); setTimerOverride(null);
    const shuffled = [...OPERATORS].sort(() => Math.random() - 0.5);
    setOpChoices(shuffled.slice(0, 3));
    setGs("operatorPick"); setMode("pve"); playTrans("trans-enter");
  };
  const confirmOperator = (op) => {
    setOperator(op);
    playOpVoice(op.id);
    if(mode==="pvp") {
      pvpSend({type:"pickOperator", operatorId:op.id});
      setPvpOpPicked(op.id);
      playSound("buy");
      return;
    }
    // v5 Operator starting effects
    if(op.id==="phantom_root") { setHp(h => h - 10); setGold(g => g + 10); }
    if(op.id==="overclocker") { setTier(2); } // Start at T2
    // v6: Hard Reset gives +2 bench (kept). Protocol slots removed.
    // Shop size: Neon Broker +2, others default
    const baseSize = SHOP_SIZE_BY_TIER[op.id==="overclocker" ? 2 : 1] || 3;
    const shopSize = op.id==="neon_broker" ? baseSize + 2 : baseSize;
    setShop(rollShop(op.id==="overclocker" ? 2 : 1, shopSize, 0, 1)); setTimerKey(k=>k+1);
    setGs("shop"); playTrans("trans-enter"); playSound("buy");
  };


  // Stagger multiple alerts to prevent overlap
  const alertQueue = useRef([]);
  const alertTimer = useRef(null);
  const queueAlert = (msg, color) => {
    alertQueue.current.push({msg,color});
    if (!alertTimer.current) {
      const drain = () => {
        const item = alertQueue.current.shift();
        if (item) { showOpAlert(item.msg, item.color); alertTimer.current = setTimeout(drain, 1200); }
        else { alertTimer.current = null; }
      };
      drain();
    }
  };

  const showOpAlert = (msg, color) => {
    playSound("sfx-combo",0.4);
    setOpAlert({ msg, color: color || "#00f0ff" });
    setTimeout(() => setOpAlert(null), 2200);
  };

  const reroll = () => { const breachFree=breachFreeRerolls>0; const neonBrokerFree=(operator?.id==="neon_broker"); const actualCost=(netEvent?.id==="surge_pricing"||breachFree||neonBrokerFree)?0:REROLL_COST; if(gold<actualCost)return; if(breachFree)setBreachFreeRerolls(r=>r-1); playSound("reroll"); keeperSay("reroll"); if(mode==="pvp"){pvpSend({type:"reroll"});return;} setGold(g=>g-actualCost); buffWarProfiteer(actualCost);
    // Return unsold shop units to contested pool (only non-chip units)
    shop.filter(u => !sold.includes(u.id) && !u.isChip).forEach(u => unitPool.returnOne(u.tn));
    const rShopSize=(operator?.id==="neon_broker"?(SHOP_SIZE_BY_TIER[tier]||5)+2:(SHOP_SIZE_BY_TIER[tier]||5)); const rTier=netEvent?.id==="black_market"?Math.min(maxShopTier,tier+1):tier; const rExtra=netEvent?.id==="data_surge"?2:0; setShop(rollShop(rTier,rShopSize+rExtra,comebackBonus,round)); setSold([]);
    // Quest offer: 30% chance on reroll
    if (!activeQuest && !questOffer) { const qo = rollQuestOffer(tier); if (qo) setQuestOffer(qo); }
  };
  const tierUpFn = () => { let c=TIER_UP_COST[tier]; if(!c||tier>=6)return; if(mode!=="pvp"&&tier===5&&!t6Unlocked){showOpAlert(' T6 Locked! Complete 5/5 mastery goals to unlock.','#ff4444');return;} if(operator&&operator.id==="overclocker"){c=Math.max(1,c-3);} if(gold<c)return; if(mode==="pvp"){pvpSend({type:"tierUp"});return;} setGold(g=>g-c); buffWarProfiteer(c); setTier(t=>t+1); playSound("tier-up"); keeperSay("tierUp"); if(operator&&operator.id==="overclocker") showOpAlert("Overclocker: Tier up at discount!", operator.color);
  };

  const buyUnit = (unit) => {
    // Augment Chip: buy from shop → enter apply mode (click a board/bench unit to buff)
    if (unit.isChip) {
      const cost = operator?.id === "ghostwire" ? Math.max(0, unit.cost - 1) : unit.cost;
      if(gold<cost)return;
      if(board.length === 0 && bench.length === 0) { showOpAlert("No units to augment!", "#ff4444"); return; }
      setGold(g=>g-cost); buffWarProfiteer(cost); playSound("buy"); setGoldFlash({type:"spend",amt:cost});
      setSold(s=>[...s,unit.id]);
      // Enter chip-apply mode
      setPendingChip(unit.chipData);
      showOpAlert(`Click a unit to apply ${unit.chipData.name}!`, unit.chipData.color);
      return;
    }
    // Echo Protocol: 4th buy each round is free
    const echoFree = operator?.id==="echo_protocol" && buyCountThisRound === 3;
    const cost = echoFree ? 0 : unit.tier;
    if(gold<cost)return; setHovUnit(null); playSound("buy"); keeperSay("buy"); setGoldFlash({type:"spend",amt:cost});
    setBuyCountThisRound(c => c + 1);
    if(operator&&operator.id==="echo_protocol"&&!boughtThisRound){setBoughtThisRound(true);showOpAlert(" Echo Protocol: +1/+1 to first buy!", operator.color);const echoId=unit.id;setTimeout(()=>{setBoard(b=>b.map(u=>u.id===echoId?{...u,atk:u.atk+1,hp:u.hp+1,maxHp:u.maxHp+1}:u));setBench(b=>b.map(u=>u.id===echoId?{...u,atk:u.atk+1,hp:u.hp+1,maxHp:u.maxHp+1}:u));},100);}
    if(echoFree) showOpAlert(" Echo Protocol: 4th buy FREE!", operator.color);
    if(mode==="pvp"){pvpSend({type:"buy",unitId:unit.id});return;}
    // ── ON-BUY EFFECTS (parsed from innate text) ──
    const inn = unit.innate || "";
    const ilo = inn.toLowerCase();
    if (ilo.includes("on buy") || ilo.includes("on buy:")) {
      // Gold gain: match "1g", "2g", "3g", "1 gold", etc.
      if (ilo.includes("gain") && (ilo.includes("gold") || /\d+g[\s.,]/.test(ilo))) {
        const m = inn.match(/(\d+)\s*(?:gold|g\b)/i); const amt = m ? parseInt(m[1]) : 1;
        setGold(g => g + amt); showOpAlert(`${unit.name}: +${amt}g!`, "#ffcc00");
      }
      // Chip Miner: "Every 3rd Synth = 3g bonus"
      if (ilo.includes("every 3rd synth") || ilo.includes("3rd synth")) {
        const synthCount = [...board, ...bench].filter(u => u.faction === "SYNTH").length + (unit.faction === "SYNTH" ? 1 : 0);
        if (synthCount > 0 && synthCount % 3 === 0) {
          setGold(g => g + 3); showOpAlert(`${unit.name}: 3rd Synth bonus! +3g!`, "#00f0ff");
        }
      }
      if (ilo.includes("random ally gains +") && ilo.includes("atk")) {
        const m = inn.match(/\+(\d+)\s*ATK/i); const buff = m ? parseInt(m[1]) : 2;
        setBoard(b => {
          if (b.length === 0) return b;
          const pick = b[Math.floor(Math.random() * b.length)];
          showOpAlert(`${unit.name}: ${pick.name} +${buff} ATK!`, "#ff6600");
          return b.map(u => u.id === pick.id ? {...u, atk: u.atk + buff} : u);
        });
      }
      if (ilo.includes("random ally gains random keyword") || ilo.includes("give them a random keyword")) {
        const kws = ["firewall","stealth","cleave","sniper","regen","taunt","hardshell","splash"];
        setBoard(b => {
          if (b.length === 0) return b;
          const pick = b[Math.floor(Math.random() * b.length)];
          const avail = kws.filter(k => !pick.kw.includes(k));
          if (avail.length === 0) return b;
          const gained = avail[Math.floor(Math.random() * avail.length)];
          showOpAlert(`${unit.name}: ${pick.name} gained ${gained}!`, "#00f0ff");
          return b.map(u => u.id === pick.id ? {...u, kw: [...u.kw, gained], kwData: {...u.kwData, [gained]: gained}} : u);
        });
      }
      // Iron Seed: "gain +2/+2 for each other Construct you already own"
      if (ilo.includes("per construct") || ilo.includes("for each") && ilo.includes("construct")) {
        const m = inn.match(/\+(\d+)\/\+(\d+)/); const atkB = m ? parseInt(m[1]) : 1; const hpB = m ? parseInt(m[2]) : 1;
        const cCount = board.filter(u => u.faction === "CONSTRUCT").length;
        if (cCount > 0) {
          unit.atk += cCount * atkB; unit.hp += cCount * hpB; unit.maxHp += cCount * hpB;
          showOpAlert(`${unit.name}: +${cCount*atkB}/+${cCount*hpB} from ${cCount} Constructs!`, "#ffcc00");
        }
      }
      if (ilo.includes("+1 atk to a random synth")) {
        setBoard(b => {
          const synths = b.filter(u => u.faction === "SYNTH");
          if (synths.length === 0) return b;
          const pick = synths[Math.floor(Math.random() * synths.length)];
          showOpAlert(`${unit.name}: ${pick.name} +1 ATK!`, "#00f0ff");
          return b.map(u => u.id === pick.id ? {...u, atk: u.atk + 1} : u);
        });
      }
      if (ilo.includes("reduce random enemy -1 atk")) {
        if (!window.__bootseqDebuffs) window.__bootseqDebuffs = [];
        window.__bootseqDebuffs.push({type: "atkDebuff", amount: 1});
        showOpAlert(`${unit.name}: Random enemy -1 ATK next combat!`, "#ff00ff");
      }
      if (ilo.includes("steal 2g worth of stats")) {
        setBoard(b => {
          if (b.length === 0) return b;
          const pick = b[Math.floor(Math.random() * b.length)];
          showOpAlert(`${unit.name}: Stole stats for ${pick.name}!`, "#ff00ff");
          return b.map(u => u.id === pick.id ? {...u, atk: u.atk + 2, hp: u.hp + 1, maxHp: u.maxHp + 1} : u);
        });
      }
      // Smuggler: "a random unit in your next shop costs 0g"
      if (ilo.includes("next shop costs 0") || ilo.includes("costs 0g")) {
        window.__nextShopFreeSlot = true;
        showOpAlert(`${unit.name}: A random unit next shop is FREE!`, "#00f0ff");
      }
      // Access Point: "peek at opponent's board"
      if (ilo.includes("peek at") && ilo.includes("opponent")) {
        window.__peekNextEnemy = true;
        showOpAlert(`${unit.name}: Scouting next enemy!`, "#00f0ff");
      }
      // Phreaker: "steal a random unit" — in PvE, gives free unit next round
      if (ilo.includes("steal") && ilo.includes("opponent")) {
        window.__phreakerSteal = true;
        showOpAlert(`${unit.name}: Wiretap planted! Free unit next round!`, "#ff00ff");
      }
      // Fixer: "shop next round contains 1 unit from tier ABOVE"
      if (ilo.includes("tier above")) {
        window.__nextShopTierUp = true;
        showOpAlert(`${unit.name}: Next shop gets a tier-up unit!`, "#ffcc00");
      }
      // Black Market: interest gold → stats (handled at round start)
      if (ilo.includes("interest gold into")) {
        window.__interestToStats = true;
      }
    }
    const all=[...board,...bench];
    const match=all.filter(u=>u.tn===unit.tn&&!u.golden);
    if(match.length>=2){
      const golden=mkUnit(U.find(t=>t.name===unit.tn),true);
      const fm=match.find(m=>m.mod); if(fm)golden.mod=fm.mod;
      setGold(g=>g-cost); buffWarProfiteer(cost); let rem=0;
      const nb=board.filter(u=>{if(rem<2&&u.tn===unit.tn&&!u.golden){rem++;return false;}return true;});
      const nbe=bench.filter(u=>{if(rem<2&&u.tn===unit.tn&&!u.golden){rem++;return false;}return true;});
      if(nb.length<MAX_BOARD_SIZE){setBoard([...nb,golden]);setBench(nbe);}
      else if(nbe.length<maxBench){setBoard(nb);setBench([...nbe,golden]);}
      else{setBoard(nb);setBench(nbe);}
      setSold(s=>[...s,unit.id]); playSound("golden-merge"); setMastery(m=>m.tripleUnit?m:{...m,tripleUnit:true});
      // Quest: triple tracking
      if (activeQuest?.check === "shop_triple") { completeQuest(activeQuest); }
      // === BREACH: Triple triggers breach pick ===
      if(breaches.length < (operator?.id==="chrome_dealer" ? 5 : 3)) {
        let available = round < 5 ? BREACHES.filter(b => b.tier === 1) : BREACHES;
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        let choices = shuffled.slice(0, 3);
        if(operator?.id==="chrome_dealer" && !choices.find(b=>b.id==="glitch_market")) {
          const blackIce = BREACHES.find(b=>b.id==="glitch_market");
          if(blackIce) { choices[2] = blackIce; }
        }
        setBreachChoices(choices);
        setBreachMode("picking");
        playSound("sfx-combo",0.4);
      }
      return;
    }
    if(board.length>=MAX_BOARD_SIZE&&bench.length>=maxBench)return;
    setGold(g=>g-cost); buffWarProfiteer(cost);
    if(board.length<MAX_BOARD_SIZE)setBoard(b=>[...b,{...unit}]);
    else if(bench.length<maxBench) setBench(b=>[...b,{...unit}]);
    setSold(s=>[...s,unit.id]);
    // Quest: buy tracking
    if ((unit.keywords || []).length > 0) { questProgressRef.current.buyKwCount++; }
    if (activeQuest?.check === "shop_buy_kw" && questProgressRef.current.buyKwCount >= activeQuest.target) { completeQuest(activeQuest); }
  };

  const sellUnit = u => { setHovUnit(null); playSound("sell"); keeperSay("sell");
    if(mode==="pvp"){pvpSend({type:"sell",unitId:u.id});setGoldFlash({type:"earn",amt:u.tier});return;}
    // v6: Full refund — sell price = tier cost. No penalty for fast buying/selling.
    unitPool.returnOne(u.tn);
    let ref=u.golden?u.tier*3:u.tier; if(operator&&operator.id==="hard_reset"){ref+=1;showOpAlert(" Hard Reset: +1g + free reroll!", operator.color);
      // Free shop refresh on sell
      setTimeout(()=>{
        shop.filter(u2 => !sold.includes(u2.id) && !u2.isChip).forEach(u2 => unitPool.returnOne(u2.tn));
        const rTier=netEvent?.id==="black_market"?Math.min(maxShopTier,tier+1):tier;
        const rSize=(operator?.id==="neon_broker"?(SHOP_SIZE_BY_TIER[tier]||5)+2:(SHOP_SIZE_BY_TIER[tier]||5));
        setShop(rollShop(rTier,rSize,comebackBonus,round)); setSold([]);
      },50);
    }
    // Kill bounty: +1 gold per 3 lifetime kills
    const killBounty = Math.floor((u._lifetimeKills || 0) / 3);
    if (killBounty > 0) { ref += killBounty; showOpAlert(`💀 Kill Bounty: +${killBounty}g (${u._lifetimeKills} kills)`, '#ffcc00'); }
    // Junk Dealer: +1 bonus gold on any sell
    const hasJunkDealer = [...board, ...bench].some(x => x.id !== u.id && (x.tn === 'Junk Dealer' || x.name === 'Junk Dealer' || x.name === 'Golden Junk Dealer'));
    if (hasJunkDealer) { ref += 1; showOpAlert(`Junk Dealer: +1g recycle bonus!`, '#ffcc00'); }
    setGoldFlash({type:"earn",amt:ref});
    setGold(g=>g+ref); setBoard(b=>b.filter(x=>x.id!==u.id)); setBench(b=>b.filter(x=>x.id!==u.id));
    if(sel?.id===u.id)setSel(null);
    // Quest: sell tracking
    questProgressRef.current.sellCount++;
    if ((u._lifetimeKills || 0) >= 6) questProgressRef.current.soldVetKills = u._lifetimeKills;
    if (activeQuest?.check === "shop_sell_count" && questProgressRef.current.sellCount >= activeQuest.target) { completeQuest(activeQuest); }
    if (activeQuest?.check === "shop_sell_veteran" && (u._lifetimeKills || 0) >= (activeQuest.killTarget || 6)) { completeQuest(activeQuest); }
  };

  // === BREACH HANDLERS ===
  const pickBreach = (b) => {
    setBreaches(prev => [...prev, { ...b, roundEarned: round }]);
    setBreachChoices([]);
    setBreachMode(null);
    setBreachAnim("earned");
    playSound("tier-up");
    showOpAlert("BREACH EARNED: " + b.name + "!", b.color);
    setTimeout(() => setBreachAnim(null), 1500);
    if (mode === "pvp") pvpSend({ type: "breachPick", breachId: b.id });
  };

  const discardBreach = () => {
    setBreaches(prev => prev.filter((_,i) => i !== (idx||0)));
    showOpAlert("Breach discarded.", "#888");
  };

  const activateBreach = (idx) => {
    if (!breaches.length || gs !== "shop") return;
    const b = breaches[idx || 0];
    if (mode === "pvp") {
      // PvP breaches that need server interaction
      if (b.id === "steal" || b.id === "sabotage") {
        // Auto-target: server picks the strongest opponent and their strongest unit
        pvpSend({ type: "breachUse", breachId: b.id });
        setBreaches(prev => prev.filter((_,i) => i !== (idx||0)));
        setBreachAnim("used");
        showOpAlert("" + b.name + " ACTIVATED!", b.color);
        setTimeout(() => setBreachAnim(null), 1500);
        return;
      }
      if (b.id === "overclock" || b.id === "duplicate") {
        // These need unit targeting on your own board - handled client-side then sent
        if (b.id === "overclock") setBreachMode("targeting-overclock");
        else setBreachMode("targeting-duplicate");
        return;
      }
      if (b.id === "glitch_market") {
        pvpSend({ type: "breachUse", breachId: b.id });
        setBreaches(prev => prev.filter((_,i) => i !== (idx||0)));
        setBreachAnim("used");
        setTimeout(() => setBreachAnim(null), 1500);
        return;
      }
      if (b.id === "time_hack") {
        pvpSend({ type: "breachUse", breachId: b.id });
        setBreaches(prev => prev.filter((_,i) => i !== (idx||0)));
        setBreachAnim("used");
        setTimeout(() => setBreachAnim(null), 1500);
        return;
      }
    }
    switch (b.id) {
      case "steal": {
        // PvE: show last enemy board to pick from
        if (lastEnemyBoard.length === 0) {
          showOpAlert("No enemy data yet — fight first!", "#ff4444");
          return;
        }
        setBreachMode("targeting-steal");
        break;
      }
      case "sabotage": {
        // PvE: auto-flag for next combat
        setSabotageActive(true);
        setBreaches(prev => prev.filter((_,i) => i !== (idx||0)));
        setBreachAnim("used");
        playSound("sfx-combo",0.4);
        showOpAlert("SYSTEM CRASH ARMED — Enemy carry will be halved!", b.color);
        setTimeout(() => setBreachAnim(null), 1500);
        break;
      }
      case "overclock": {
        if (board.length === 0 && bench.length === 0) { showOpAlert("No units to overclock!", "#ff4444"); return; }
        setBreachMode("targeting-overclock");
        break;
      }
      case "duplicate": {
        if (board.length === 0 && bench.length === 0) { showOpAlert("No units to clone!", "#ff4444"); return; }
        if (board.length >= MAX_BOARD_SIZE && bench.length >= maxBench) { showOpAlert("No space for clone!", "#ff4444"); return; }
        setBreachMode("targeting-duplicate");
        break;
      }
      case "glitch_market": {
        // Black Ice balance: T5+ = exclusive T7 units. Below T5 = minimum T5 floor (always premium).
        // Cost is always 2x tier, so T5=10g, T6=12g, T7=14g — expensive but powerful.
        const gmTier = tier >= 5 ? 7 : Math.max(5, Math.min(maxShopTier, tier + 2));
        const gmShop = gmTier === 7 
          ? [...T7_UNITS].sort(() => Math.random() - 0.5).slice(0,5).map(u => mkUnit(u)) 
          : rollShop(gmTier, 5);
        setBreachGlitchShop(gmShop);
        setHovUnit(null);
        setBreachMode("glitch-market");
        setBreaches(prev => prev.filter((_,i) => i !== (idx||0)));
        setBreachAnim("used");
        playSound("sfx-combo",0.4);
        showOpAlert("BLACK ICE — Secret T" + gmTier + " shop opened!", b.color);
        setTimeout(() => setBreachAnim(null), 1500);
        break;
      }
      case "time_hack": {
        setBreachFreeRerolls(3);
        setTimerOverride(45); // Override timer to 45 seconds
        setTimerKey(k => k + 1); // resets timer
        setBreaches(prev => prev.filter((_,i) => i !== (idx||0)));
        setBreachAnim("used");
        playSound("sfx-combo",0.4);
        showOpAlert("CHRONOBREAK — Timer reset + 3 free rerolls!", b.color);
        setTimeout(() => setBreachAnim(null), 1500);
        break;
      }
    }
  };

  const breachTarget = (unit, source) => {
    if (!breaches.length && breachMode !== "targeting-steal") return;
    // Find the breach index matching current targeting mode
    const breachIdMap = {"targeting-steal":"steal","targeting-overclock":"overclock","targeting-duplicate":"duplicate"};
    const targetId = breachIdMap[breachMode];
    const bIdx = breaches.findIndex(b => b && b.id === targetId);

    if (breachMode === "targeting-steal") {
      // PvE: copy enemy unit to bench
      if (bench.length >= maxBench && board.length >= MAX_BOARD_SIZE) {
        showOpAlert("No space! Sell a unit first.", "#ff4444"); return;
      }
      const copy = mkUnit(U.find(t => t.name === unit.tn) || { name: unit.tn, f: unit.faction, t: unit.tier, a: unit.atk, h: unit.hp, e: "", kw: [], kwData: {} });
      // Give it the enemy's actual stats (they may be scaled)
      copy.atk = unit.atk; copy.hp = unit.hp; copy.maxHp = unit.maxHp;
      if (bench.length < maxBench) setBench(be => [...be, copy]);
      else if (board.length < MAX_BOARD_SIZE) setBoard(bo => [...bo, copy]);
      setBreaches(prev => prev.filter((_,i) => i !== (bIdx >= 0 ? bIdx : 0)));
      setBreachMode(null);
      setBreachAnim("used");
      playSound("golden-merge");
      showOpAlert("NEURAL HIJACK — " + unit.name + " stolen!", "#ff2266");
      setTimeout(() => setBreachAnim(null), 1500);
      return;
    }

    if (breachMode === "targeting-overclock") {
      // Double the unit's stats
      if (mode === "pvp") { pvpSend({ type: "breachUse", breachId: "overclock", targetUnitId: unit.id }); }
      const updateFn = arr => arr.map(u => u.id === unit.id ? { ...u, atk: u.atk * 2, hp: u.hp * 2, maxHp: u.maxHp * 2, _overclocked: true } : u);
      setBoard(updateFn); setBench(updateFn);
      setBreaches(prev => prev.filter((_,i) => i !== (bIdx >= 0 ? bIdx : 0)));
      setBreachMode(null);
      setBreachAnim("used");
      playSound("golden-merge");
      showOpAlert("SURGE PROTOCOL — " + unit.name + " stats DOUBLED!", "#ffcc00");
      setTimeout(() => setBreachAnim(null), 1500);
      return;
    }

    if (breachMode === "targeting-duplicate") {
      if (mode === "pvp") { pvpSend({ type: "breachUse", breachId: "duplicate", targetUnitId: unit.id }); }
      // Check for triple FIRST (like buyUnit does) — clone + 2 existing = triple
      const all = [...board, ...bench];
      const matchCount = all.filter(u => u.tn === unit.tn && !u.golden).length;
      if (matchCount >= 2) {
        // Triple! Clone completes the set — merge directly without needing a free slot
        const tmpl = U.find(t => t.name === unit.tn);
        if (tmpl) {
          const golden = mkUnit(tmpl, true);
          const matchUnits = all.filter(u => u.tn === unit.tn && !u.golden);
          const fm = matchUnits.find(m => m.mod); if (fm) golden.mod = fm.mod;
          let rem = 0;
          const nb = board.filter(u => { if (rem < 2 && u.tn === unit.tn && !u.golden) { rem++; return false; } return true; });
          const nbe = bench.filter(u => { if (rem < 2 && u.tn === unit.tn && !u.golden) { rem++; return false; } return true; });
          // Place golden — one setBench per branch to avoid overwrite
          if (nb.length < MAX_BOARD_SIZE) { setBoard([...nb, golden]); setBench(nbe); }
          else if (nbe.length < maxBench) { setBoard(nb); setBench([...nbe, golden]); }
          else { setBoard(nb); setBench(nbe); }
          setBreaches(prev => prev.filter((_, i) => i !== (bIdx >= 0 ? bIdx : 0)));
          setBreachMode(null);
          setBreachAnim("used");
          playSound("golden-merge");
          showOpAlert("CLONE TRIPLE — Golden " + unit.tn + "!", "#00ff88");
          setMastery(m => m.tripleUnit ? m : { ...m, tripleUnit: true });
          // Chain: new triple = new breach pick!
          if (breaches.length < (operator?.id==="chrome_dealer" ? 5 : 3)) {
            let available2 = round < 5 ? BREACHES.filter(br => br.tier === 1) : BREACHES;
            const shuffled2 = [...available2].sort(() => Math.random() - 0.5);
            let choices2 = shuffled2.slice(0, 3);
            if(operator?.id==="chrome_dealer" && !choices2.find(br=>br.id==="glitch_market")) {
              const bi = BREACHES.find(br=>br.id==="glitch_market");
              if(bi) { choices2[2] = bi; }
            }
            setBreachChoices(choices2);
            setBreachMode("picking");
          }
          setTimeout(() => setBreachAnim(null), 1500);
          return;
        }
      }
      // No triple — just place the clone
      const copy = { ...unit, id: gid(), _cloned: true };
      let placed = false;
      if (board.length < MAX_BOARD_SIZE) { setBoard(bo => [...bo, copy]); placed = true; }
      else if (bench.length < maxBench) { setBench(be => [...be, copy]); placed = true; }
      if (!placed) { showOpAlert("No space!", "#ff4444"); return; }
      setBreaches(prev => prev.filter((_, i) => i !== (bIdx >= 0 ? bIdx : 0)));
      setBreachMode(null);
      setBreachAnim("used");
      playSound("golden-merge");
      showOpAlert("CLONE PROTOCOL — " + unit.name + " duplicated!", "#00ff88");
      setTimeout(() => setBreachAnim(null), 1500);
      return;
    }
  };

  const buyGlitchUnit = (unit) => {
    setHovUnit(null);
    const cost = unit.tier * 2;
    const noSpace = board.length >= MAX_BOARD_SIZE && bench.length >= maxBench;
    if (noSpace) { showOpAlert("Board & bench full! Sell a unit first.", "#ff4444"); return; }
    if (gold < cost) { showOpAlert("Need " + cost + "g! (2x cost)", "#ff4444"); return; }
    setGold(g => g - cost); buffWarProfiteer(cost);
    setGoldFlash({ type: "spend", amt: cost });
    // Check triple before placing
    const all = [...board, ...bench];
    const matchCount = all.filter(u => u.tn === unit.tn && !u.golden).length;
    if (matchCount >= 2) {
      // Triple! 
      const tmpl = U.find(t => t.name === unit.tn) || U.find(t => t.name === unit.name);
      if (tmpl) {
        const golden = mkUnit(tmpl, true);
        let rem = 0;
        const nb = board.filter(u => { if (rem < 2 && u.tn === unit.tn && !u.golden) { rem++; return false; } return true; });
        const nbe = bench.filter(u => { if (rem < 2 && u.tn === unit.tn && !u.golden) { rem++; return false; } return true; });
        if (nb.length < MAX_BOARD_SIZE) { setBoard([...nb, golden]); setBench(nbe); }
        else if (nbe.length < maxBench) { setBoard(nb); setBench([...nbe, golden]); }
        else { setBoard(nb); setBench(nbe); } // Remove 2, no room for golden (rare edge)
        showOpAlert("BLACK ICE TRIPLE — Golden " + unit.tn + "!", "#ffcc00");
        playSound("triple");
        setBreachGlitchShop(s => s.filter(u2 => u2.id !== unit.id));
        return;
      }
    }
    if (board.length < MAX_BOARD_SIZE) setBoard(bo => [...bo, { ...unit }]);
    else if (bench.length < maxBench) setBench(be => [...be, { ...unit }]);
    setBreachGlitchShop(s => s.filter(u => u.id !== unit.id));
    playSound("buy");
  };

  const closeGlitchMarket = () => {
    setBreachMode(null);
    setBreachGlitchShop([]);
    setHovUnit(null);
  };

  const cancelBreachTarget = () => {
    setBreachMode(null);
  };


  // === DRAG AND DROP ===
  // Fresh closures per mousedown. No setPointerCapture (breaks elementFromPoint).
  const handlePointerDown = (e, unit, origin) => {
    if (e.button !== 0) return;
    // Augment Chip apply mode: click a board/bench unit to buff it
    if (pendingChip) {
      e.preventDefault();
      const chip = pendingChip;
      const msg = chip.apply({...unit});
      // Chaos Engine: refund chip cost (chips applied to this unit are free)
      if (unit._chipFree) {
        setGold(g => g + (chip.cost || 0));
        showOpAlert(`⚡ CHAOS ENGINE — FREE ${chip.name}!`, "#ffcc00");
      }
      // Apply to actual state
      const applyToUnit = u => {
        if(u.id !== unit.id) return u;
        const c = {...u, kw:[...u.kw], kwData:{...u.kwData}}; chip.apply(c); return c;
      };
      setBoard(b => b.map(applyToUnit));
      setBench(b => b.map(applyToUnit));
      setPendingChip(null);
      playSound("golden-merge");
      const chipPaid = operator?.id === "ghostwire" ? Math.max(0, (chip.cost||0) - 1) : (chip.cost||0);
      if (operator?.id === "glitch_matrix" && !unit._chipFree && Math.random() < 0.4) {
        setGold(g => g + chipPaid);
        setTimeout(() => showOpAlert("GLITCH MATRIX - Chip refunded! +" + chipPaid + "g!", "#ff00ff"), 300);
      }
      if (!unit._chipFree) showOpAlert(msg, chip.color);
      // Quest: chip apply tracking
      if (activeQuest?.check === "shop_apply_chip") { completeQuest(activeQuest); }
      return;
    }
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let active = false, dz = null, tid = null, ended = false;

    function onMove(ev) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!active && Math.sqrt(dx*dx + dy*dy) > 8) {
        active = true;
        window._naDragActive = true;
        setDragUnit(unit); setDragOrigin(origin);
        setTapSelected(null); // Clear click-selection when dragging
      }
      if (!active) return;
      setDragPos({x: ev.clientX, y: ev.clientY});
      const ghost = document.querySelector('.dnd-ghost');
      if (ghost) ghost.style.visibility = 'hidden';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (ghost) ghost.style.visibility = '';
      dz = null; tid = null;
      if (el) {
        if (el.closest('.dnd-sell-zone')) dz = 'sell';
        else if (el.closest('.dnd-board')) dz = 'board';
        else if (el.closest('.dnd-bench')) dz = 'bench';
        const card = el.closest('[data-unit-id]');
        if (card) { const c = Number(card.dataset.unitId); if (c !== unit.id) tid = c; }
      }
      setDropZone(dz);
    }

    function onUp() {
      if (ended) return;
      ended = true;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      if (!active) {
        // No drag — this was a click. Handle tap-selection for click-to-place.
        if (origin === 'shop') { buyUnit(unit); return; }
        if (origin !== 'bench' && origin !== 'board') return;

        // If clicking same unit as already selected → deselect
        if (tapSelectedRef.current && tapSelectedRef.current.unit.id === unit.id) {
          setTapSelected(null);
          return;
        }
        // If we have a previous selection → do swap/move
        if (tapSelectedRef.current) {
          const prev = tapSelectedRef.current;
          doTapSwap(prev.unit, prev.origin, unit, origin);
          setTapSelected(null);
          return;
        }
        // Nothing selected → select this unit
        setTapSelected({ unit, origin });
        return;
      }
      setTimeout(() => { window._naDragActive = false; }, 100);
      if (dz === 'sell' && (origin === 'board' || origin === 'bench')) {
        sellUnit(unit);
      } else if (origin === 'shop') {
        buyUnit(unit);
      } else if (dz === 'board' && origin === 'board' && tid) {
        setBoard(b => { const a=[...b], fi=a.findIndex(u=>u.id===unit.id), ti=a.findIndex(u=>u.id===tid); if(fi>=0&&ti>=0)[a[fi],a[ti]]=[a[ti],a[fi]]; return a; });
      } else if (dz === 'bench' && origin === 'bench' && tid) {
        setBench(b => { const a=[...b], fi=a.findIndex(u=>u.id===unit.id), ti=a.findIndex(u=>u.id===tid); if(fi>=0&&ti>=0)[a[fi],a[ti]]=[a[ti],a[fi]]; return a; });
      } else if (dz === 'board' && origin === 'bench') {
        if (tid) { const sw=board.find(u=>u.id===tid); if(sw){setBoard(b=>b.map(u=>u.id===tid?unit:u));setBench(b=>b.map(u=>u.id===unit.id?sw:u));} }
        else if (board.length < MAX_BOARD_SIZE) { setBench(b=>b.filter(u=>u.id!==unit.id)); setBoard(b=>[...b,unit]); }
      } else if (dz === 'bench' && origin === 'board') {
        if (tid) { const sw=bench.find(u=>u.id===tid); if(sw){setBench(b=>b.map(u=>u.id===tid?unit:u));setBoard(b=>b.map(u=>u.id===unit.id?sw:u));} }
        else if (bench.length < maxBench) { setBoard(b=>b.filter(u=>u.id!==unit.id)); setBench(b=>[...b,unit]); }
      }
      setDragUnit(null); setDragOrigin(null); setDropZone(null); setHovUnit(null);
    }

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  };

  // === VFX STATES ===
  // Safety: auto-clear drag if stuck for more than 3 seconds
  useEffect(() => {
    if(!dragUnit) return;
    const t = setTimeout(() => {
      setDragUnit(null); setDragOrigin(null); setDropZone(null); setHovUnit(null);
      window._naDragActive = false;
    }, 5000);
    return () => clearTimeout(t);
  }, [dragUnit]);
  const [goldFlash, setGoldFlash] = useState(null);
  const [phaseAnim, setPhaseAnim] = useState(null);
  useEffect(() => { if(!goldFlash) return; const t=setTimeout(()=>setGoldFlash(null), 700); return ()=>clearTimeout(t); }, [goldFlash]);
  useEffect(() => { const h = e => { if(e.key==='F2'){e.preventDefault();setShowAudit(v=>!v);} if(e.key==='d'&&e.ctrlKey){e.preventDefault();setDebugOverlay(v=>!v);} }; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); }, []);
  // Tab = Recon toggle, Escape = cancel chip apply
  useEffect(() => { const h = e => {
    if(e.key==='Tab'&&(gs==='shop')&&round>=2){
      e.preventDefault();
      setReconView(r => {
        if(!r) {
          setReconTimer(operator?.id === "ghostwire" ? 9999 : 10); // Ghostwire: unlimited recon
          // Lazily generate preview enemy when first opening recon this round
          setReconEnemy(prev => {
            if(prev.length > 0) return prev;
            if(BOSSES[round+1]) return BOSSES[round+1].gen();
            return genEnemy(round+1);
          });
        }
        return !r;
      });
    }
    if(e.key==='Escape'&&pendingChip){const refund=operator?.id==='ghostwire'?Math.max(0,(pendingChip?.cost||0)-1):(pendingChip?.cost||0);setPendingChip(null);setGold(g=>g+refund);}
  }; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); }, [gs,round,pendingChip]);
  // Recon auto-return after 10 seconds
  useEffect(() => {
    if (!reconView) return;
    const iv = setInterval(() => {
      setReconTimer(t => {
        if (t <= 1) { setReconView(false); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [reconView]);
  useEffect(() => { if(gs==="combat"||gs==="shop"||gs==="scout") { setPhaseAnim(gs==="combat"?"to-combat":"to-shop"); const t=setTimeout(()=>setPhaseAnim(null), 500); return ()=>clearTimeout(t); } }, [gs]);

  const startCombat = useCallback(() => {
    if(board.length===0||mode==="pvp")return;
    setHovUnit(null); setHovInfo(null); setTapSelected(null);
    if(gold >= 10) setMastery(m=>m.banked10?m:{...m,banked10:true});
    // Quest: gold banking check
    if (activeQuest?.check === "shop_bank_gold" && gold >= activeQuest.target) { completeQuest(activeQuest); }
    // Comeback: low HP = temporary combat buff
    if(hp < 15 && board.length > 0) {
      setBoard(b=>b.map(u=>({...u, atk: u.atk + 1})));
    }
    let enemy; let bossName = null;
    if(BOSSES[round]){ setTimeout(()=>playAnnouncer("ann-boss",0.5), 300);
      const boss = BOSSES[round];
      bossName = boss.name;
      if(round===20){
        enemy = board.map(u => {
          const copy = {...u, id:gid(), name:"? "+u.name, atk:u.atk+5, hp:u.hp+5, maxHp:u.maxHp+5};
          return copy;
        });
      } else {
        enemy = boss.gen();
      }
    } else {
      enemy = genEnemy(round);
    }
    setEName(bossName || ENEMY_NAMES[round%ENEMY_NAMES.length]);
    setLastEnemyBoard(enemy.map(u => ({ ...u })));
    // Apply sabotage breach if active
    if (sabotageActive) {
      const strongest = [...enemy].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
      if (strongest) {
        strongest.atk = Math.max(1, Math.floor(strongest.atk / 2));
        strongest.hp = Math.max(1, Math.floor(strongest.hp / 2));
        strongest.maxHp = Math.max(1, Math.floor(strongest.maxHp / 2));
      }
      setSabotageActive(false);
      showOpAlert("SYSTEM CRASH — Enemy " + (strongest?.name || "carry") + " corrupted!", "#ff4444");
    }
    // Apply Boot Sequence enemy debuffs
    if (window.__bootseqDebuffs && window.__bootseqDebuffs.length > 0) {
      window.__bootseqDebuffs.forEach(db => {
        if (db.type === "atkDebuff" && enemy.length > 0) {
          const pick = enemy[Math.floor(Math.random() * enemy.length)];
          pick.atk = Math.max(0, pick.atk - db.amount);
        }
      });
      window.__bootseqDebuffs = [];
    }

    // v6: No scout phase. Scouting is now via Recon Tab during shop. Jump straight to combat.
    setReconView(false); // Exit recon if open
    setPendingChip(null); // Cancel any pending chip
    setGs("combat"); playTrans("trans-to-combat");
    const combatBoard = boardRef.current.map(u => ({ ...u, kw: [...u.kw], kwData: { ...u.kwData } }));
    const r=simCombat(combatBoard,[...enemy],operator,netEvent);
    setCEvents(r.events);
    cEventsRef.current = r.events; // Sync ref immediately so combatDone reads current events
  }, [board, round, operator, netEvent]);

  const combatDone = useCallback((evt) => {
    // PvP: server handles HP/wins, but apply construct scaling client-side
    if(mode==="pvp"){
      setBoard(b=>b.map(u=>{
        if(u.faction==="CONSTRUCT"){
          const cCount=b.filter(x=>x.faction==="CONSTRUCT").length;
          const inc=cCount>=6?3:cCount>=4?2:cCount>=2?1:0;
          if(inc>0) return {...u, _constructBonus:Math.min(30,(u._constructBonus||0)+inc), atk:u.atk+inc, hp:u.hp+inc, maxHp:u.maxHp+inc};
        }
        return u;
      }));
      // Apply buffered message that arrived during combat animation
      const pm=pendingMsgRef.current;
      if(pm){pendingMsgRef.current=null;
        if(pm.type==="shopPhase"){if(pm.operator&&!operator)setOperator(pm.operator);setGs("shop");playTrans("trans-to-shop");setRound(pm.round);setGold(pm.gold);setBoard(pm.board);setBench(pm.bench);setShop(pm.shop);setTier(pm.tier);setHp(pm.hp);setWins(pm.wins);setStreak(pm.streak);setSold([]);setTimerKey(k=>k+1);if(pm.netEvent){setNetEvent(pm.netEvent);}else{setNetEvent(null);}}
        else if(pm.type==="modDrop"){setPvpModDrop(pm);setGs("modPick");}
        else if(pm.type==="gameOver"){setLeaderboard(pm.leaderboard);setGs("pvpGameOver");}
      }
      return;
    }
    if(!evt.playerWon&&!evt.draw){setHp(h=>Math.max(0,h-evt.dmgToLoser));setStreak(0);setLossStreak(s=>s+1);setLastRoundLost(true);}
    else if(evt.playerWon){setWins(w=>w+1);setLossStreak(0);setStreak(s=>{const ns=s+1; if(ns>=3) { setMastery(m=>m.winStreak3?m:{...m,winStreak3:true}); } return ns;});setLastRoundLost(false); if(operator&&operator.id==="surge"&&board.length>0){setBoard(b=>{const s=[...b].sort((a,c)=>c.atk-a.atk)[0];return b.map(u=>u.id===s.id?{...u,atk:u.atk+2,hp:u.hp+2,maxHp:u.maxHp+2}:u);});showOpAlert(" Surge: "+([...board].sort((a,c)=>c.atk-a.atk)[0]?.name||"Carry")+" +2/+2!", operator.color);} }
    else { setStreak(0); setLossStreak(0); } // draw resets both
    // Boss survived mastery: if this round is a boss round and player is still alive
    if (BOSSES[round]) {
      setMastery(m => m.bossSurvived ? m : {...m, bossSurvived: true});
    }
    // Killswitch: quest bonus handled in completeQuest(). No more passive death gold.
    // Ransomware: gold earned from kills (tracked by engine)
    if(evt.pGoldEarned && evt.pGoldEarned > 0){
      setGold(g => g + evt.pGoldEarned);
      showOpAlert(`💰 Ransomware: +${evt.pGoldEarned}g from kills!`, "#FFD700");
    }
    // Virus bleed: enemy Virus deaths deal direct damage to player
    if(evt.eVirusBleed && evt.eVirusBleed > 0){
      setHp(h=>Math.max(0,h-evt.eVirusBleed));
      showOpAlert(`VIRUS BLEED: -${evt.eVirusBleed} HP!`, "#cc0044");
    }
    // Construct scaling: surviving constructs gain permanent bonus (v5: 1/2/3 per combat, cap 30)
    setBoard(b=>{
      const fc={};b.forEach(x=>{fc[x.faction]=(fc[x.faction]||0)+1;});
      const hasRecursive=(fc.CONSTRUCT||0)>=2&&(fc.SYNTH||0)>=2;
      return b.map(u=>{
        if(u.faction==="CONSTRUCT"){
          // Colossus T7: +5/+5 per combat instead of normal scaling
          if(u._t7rule==="immuneToAll") {
            const inc = 5;
            return {...u, atk:u.atk+inc, hp:u.hp+inc, maxHp:u.maxHp+inc, _constructBonus:(u._constructBonus||0)+inc};
          }
          const cCount=fc.CONSTRUCT||0;
          let inc=cCount>=6?3:cCount>=4?2:cCount>=2?1:0;
          if(hasRecursive)inc=Math.min(inc+1,4);
          if(inc>0) return {...u, _constructBonus:Math.min(30,(u._constructBonus||0)+inc)};
        }
        return u;
      });
    });
    // Permanent on-kill ATK/HP gains (Street Samurai, Foundry Arm, Bounty Hunter): use engine-tracked gains
    if (evt.permanentGains && evt.permanentGains.length > 0) {
      setBoard(b => b.map(u => {
        const gain = evt.permanentGains.find(g => g.id === u.id);
        if (!gain) return u;
        return { ...u, atk: u.atk + gain.atkGain, hp: u.hp + gain.hpGain, maxHp: u.maxHp + gain.hpGain,
          _permKillAtk: (u._permKillAtk || 0) + gain.atkGain, _permKillHp: (u._permKillHp || 0) + gain.hpGain };
      }));
    }
    // ── VETERAN SYSTEM: Lifetime kills, veteran bonuses, sell bounty ──
    if (evt.combatKills && evt.combatKills.length > 0) {
      const VET_THRESHOLDS = [3, 6, 10]; // Kill thresholds for veteran bonuses
      const vetAlerts = [];
      setBoard(b => b.map(u => {
        const ck = evt.combatKills.find(k => k.id === u.id);
        if (!ck) return u;
        const prevKills = u._lifetimeKills || 0;
        const newKills = prevKills + ck.kills;
        let nu = { ...u, _lifetimeKills: newKills };
        // Check veteran thresholds crossed
        const role = u.role || 'Sentinel';
        VET_THRESHOLDS.forEach(thresh => {
          if (prevKills < thresh && newKills >= thresh) {
            // Veteran bonus based on role
            const vetTier = VET_THRESHOLDS.indexOf(thresh) + 1; // 1, 2, or 3
            switch (role) {
              case 'Striker':   nu.atk += 1; nu._vetAtkBonus = (nu._vetAtkBonus || 0) + 1; break;
              case 'Vanguard':  nu.hp += 2; nu.maxHp += 2; nu._vetHpBonus = (nu._vetHpBonus || 0) + 2; break;
              case 'Infiltrator': nu._vetDodge = (nu._vetDodge || 0) + 0.05; break;
              case 'Architect': nu._vetBuffBonus = (nu._vetBuffBonus || 0) + 1; break;
              default:          nu.atk += 1; nu.hp += 1; nu.maxHp += 1; nu._vetAtkBonus = (nu._vetAtkBonus || 0) + 1; nu._vetHpBonus = (nu._vetHpBonus || 0) + 1; break;
            }
            const stars = '⭐'.repeat(vetTier);
            vetAlerts.push(`${stars} ${nu.name} — VETERAN ${vetTier}! (${newKills} kills)`);
          }
        });
        return nu;
      }));
      if (vetAlerts.length > 0) {
        setTimeout(() => showOpAlert(vetAlerts.join('\n'), '#ffcc00'), 600);
      }
    }
    // Permanent on-death buffs (Genesis Monument): persist ds_buff from units with "permanently" in innate
    const evts=cEventsRef.current;
    if(evts.length>0){
      const deathBuffs={};
      evts.forEach(e=>{
        if(e.type==="ds_buff"&&e.side==="player"&&e.atkBuff){
          const srcName=(e.sourceName||"").replace(/^Golden /,"");
          const srcUnit=U.find(u=>u.name===srcName);
          if(srcUnit?.innate?.toLowerCase().includes("permanently")){
            if(!deathBuffs[e.targetId])deathBuffs[e.targetId]={atk:0,hp:0};
            deathBuffs[e.targetId].atk+=(e.atkBuff||0);
            deathBuffs[e.targetId].hp+=(e.hpBuff||0);
          }
        }
      });
      if(Object.keys(deathBuffs).length>0){
        setBoard(b=>b.map(u=>{
          const buff=deathBuffs[u.id];
          if(!buff)return u;
          return{...u, atk:u.atk+buff.atk, hp:u.hp+buff.hp, maxHp:u.maxHp+buff.hp,
            _permDeathAtk:(u._permDeathAtk||0)+buff.atk, _permDeathHp:(u._permDeathHp||0)+buff.hp};
        }));
      }
    }
    // ── QUEST: Combat quest checks ──
    if (activeQuest && activeQuest.check.startsWith("combat_")) {
      const qEvts = cEventsRef.current || [];
      if (checkCombatQuest(activeQuest, qEvts, evt, board, fCounts, activeCombos)) {
        setTimeout(() => completeQuest(activeQuest), 400);
      }
    }
    // Quest: win streak check
    if (activeQuest?.check === "combat_win_streak" && evt.playerWon) {
      const newStreak = streak + 1; // streak was just incremented above
      if (newStreak >= activeQuest.target) {
        setTimeout(() => completeQuest(activeQuest), 400);
      }
    }
    const nh=evt.playerWon||evt.draw?hp:hp-evt.dmgToLoser;
    if(nh<=0){setGs("gameOver");return;}
    if(round>=20&&(evt.playerWon||evt.draw)){setGs("gameOver");return;}
    if((evt.playerWon&&round%3===0&&board.length>0)||(round===10&&board.length>0)){
      const sh=[...MODS].sort(()=>Math.random()-0.5);
      setModC(sh.slice(0,3));
      const el=board.filter(u=>!u.mod);
      setModT(el.length>0?el[Math.floor(Math.random()*el.length)]:board[0]);
      setGs("modPick"); playSound("mod-drop"); return;
    }
    nextShop(!evt.playerWon&&!evt.draw);
  },[hp,round,board,streak,frozen,mode,operator,netEvent]);
  useEffect(()=>{combatDoneRef.current=combatDone;},[combatDone]);
  const stableCombatDone=useCallback((evt)=>{if(combatDoneRef.current)combatDoneRef.current(evt);},[]);

  const nextShop = (didLose=false) => {
    const nr=round+1; setRound(nr);
    // Network event every 4 rounds — use local var so shop roll uses CORRECT event
    let activeNetEvent = null;
    if(nr%4===0 && nr<=20){
      const evt=NETWORK_EVENTS[Math.floor(Math.random()*NETWORK_EVENTS.length)];
      activeNetEvent = evt;
      setNetEvent(evt);
      playSound("sfx-combo",0.3); setTimeout(()=>showOpAlert(evt.name+": "+evt.desc, evt.color), 500);
    } else { setNetEvent(null); }
    setBoughtThisRound(false); setBuyCountThisRound(0); setPendingChip(null); setReconView(false); setReconEnemy([]);
    setTimerOverride(null); // clear breach timer override
    setBreachFreeRerolls(0); // clear breach free rerolls
    // ── QUEST: Round countdown + offer generation ──
    questProgressRef.current = { ...questProgressRef.current, sellCount: 0, buyKwCount: 0, chipApplied: false, tripled: false, soldVetKills: 0 };
    if (activeQuest) {
      const remaining = activeQuest.roundsLeft - 1;
      if (remaining <= 0) { failQuest(); }
      else { setActiveQuest(q => q ? { ...q, roundsLeft: remaining } : null); }
    }
    setQuestOffer(null); // Clear any unaccepted offer
    // New quest offer on round start (30% chance)
    if (!activeQuest) { const qo = rollQuestOffer(tier); if (qo) setQuestOffer(qo); }
    // Breach expires after 5 rounds
    if (breaches.length > 0 && breaches.some(b => (nr - b.roundEarned)) >= 5) {
      setBreaches(prev => prev.filter((_,i) => i !== (idx||0)));
      showOpAlert("Breach expired! Use it or lose it.", "#888");
    }
    setFreeReroll(false);
    // v7: Neutral faction bonus — 3+ different Neutrals = +2g per round
    const neutralCount = board.filter(u=>u.faction==="NEUTRAL").length;
    const nNeutralBonus = neutralCount >= 3 ? 2 : 0;
    // v7 Economy: Flat 5g base. Interest rewards saving. Combo activation bonus. Gold-gen units matter.
    const opGold = operator?.id === "phantom_root" ? 1 : 0; // Phantom Root: +1g/round (nerfed from +3g)
    const nBonus=(activeNetEvent?.id==="gold_rush"?5:0);
    // Interest: +1g per 10g saved, max +3g
    const interest = Math.min(3, Math.floor(gold / 10));
    // Income: flat base only — no more round scaling
    const baseIncome = GOLD_PER_ROUND_BASE;
    const winStreakGold = streak >= 4 ? 3 : streak >= 2 ? 2 : streak >= 1 ? 1 : 0;
    const surgeMultiplier = operator?.id === "surge" ? 2 : 1;
    const lossStreakGold = lossStreak >= 4 ? 3 : lossStreak >= 2 ? 2 : lossStreak >= 1 ? 1 : 0;
    const streakGold = (winStreakGold * surgeMultiplier) + lossStreakGold;
    const totalGold = baseIncome+streakGold+opGold+nBonus+nNeutralBonus+interest;
    setGold(g => g + totalGold); // ADD to existing gold (interest rewards banking)
    if(interest>0) showOpAlert(`💰 Interest: +${interest}g!`,'#ffcc00');
    if(winStreakGold>0) showOpAlert(' Win streak: +'+winStreakGold+'g!','#44ff66');
    if(lossStreakGold>0) showOpAlert(' Loss streak: +'+lossStreakGold+'g!','#ff8844');
    setGs("shop");setSel(null);setCEvents([]); playTrans("trans-to-shop");
    // Per-round innate growth (Scrap Bot, Foundation, Growth Engine, etc.)
    setBoard(b => b.map(u => {
      const inn = (u.innate || "").toLowerCase();
      if (inn.includes("gains +1/+1 each round") || inn.includes("gains +1/+1 per round")) {
        return {...u, atk: u.atk + 1, hp: u.hp + 1, maxHp: u.maxHp + 1};
      }
      if (inn.includes("gains +0/+2 each round")) {
        return {...u, hp: u.hp + 2, maxHp: u.maxHp + 2};
      }
      if (inn.includes("gains +3/+3 permanently after each combat")) {
        return {...u, atk: u.atk + 3, hp: u.hp + 3, maxHp: u.maxHp + 3};
      }
      // Growth Engine: +1/+2 permanently each round
      if (inn.includes("+1/+2 permanently each round") || (u.tn === "Growth Engine")) {
        return {...u, atk: u.atk + 1, hp: u.hp + 2, maxHp: u.maxHp + 2};
      }
      // Monolith: +2 max HP per round (in addition to combat-engine shield)
      if (u.tn === "Monolith" || inn.includes("gains +2 max hp per")) {
        return {...u, hp: u.hp + 2, maxHp: u.maxHp + 2};
      }
      return u;
    }));
    // ── ROUND-START INNATE EFFECTS ──
    // Street Samurai: survived last combat → +2 ATK permanently
    setBoard(b => b.map(u => {
      if ((u.tn === "Street Samurai" || (u.innate||"").toLowerCase().includes("survived last combat")) && u.hp > 0 && nr > 1) {
        showOpAlert(`${u.name}: Bushido! +2 ATK!`, "#ff6600");
        return {...u, atk: u.atk + 2};
      }
      return u;
    }));
    // Scavenger: +1g per empty board slot at shop start
    const scavengers = board.filter(u => u.tn === "Scavenger" || u.tn === "Golden Scavenger");
    if (scavengers.length > 0) {
      const emptySlots = MAX_BOARD_SIZE - board.length;
      if (emptySlots > 0) {
        const scavGold = emptySlots * scavengers.length;
        setGold(g => g + scavGold);
        showOpAlert(`Scavenger: +${scavGold}g (${emptySlots} empty slots)!`, "#ffcc00");
      }
    }
    // Warlord: Augmented MVP from last combat gains +2/+2
    if (board.some(u => u.tn === "Warlord" || u.tn === "Golden Warlord")) {
      setBoard(b => {
        const augs = b.filter(u => u.faction === "AUGMENTED");
        if (augs.length === 0) return b;
        // Pick highest damage dealer (approximate: highest ATK = most damage)
        const mvp = [...augs].sort((a, b) => (b._lifetimeKills||0) - (a._lifetimeKills||0) || b.atk - a.atk)[0];
        if (mvp) {
          showOpAlert(`Warlord: ${mvp.name} is MVP! +2/+2!`, "#ff6600");
          return b.map(u => u.id === mvp.id ? {...u, atk: u.atk + 2, hp: u.hp + 2, maxHp: u.maxHp + 2} : u);
        }
        return b;
      });
    }
    // Bio-Forge: consume weakest bench Virus → buff strongest board Virus
    if (board.some(u => u.tn === "Bio-Forge" || u.tn === "Golden Bio-Forge")) {
      const benchVirus = bench.filter(u => u.faction === "VIRUS");
      const boardVirus = board.filter(u => u.faction === "VIRUS");
      if (benchVirus.length > 0 && boardVirus.length > 0) {
        const weakest = [...benchVirus].sort((a, b) => (a.atk + a.hp) - (b.atk + b.hp))[0];
        const strongest = [...boardVirus].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
        setBench(bn => bn.filter(u => u.id !== weakest.id));
        setBoard(b => b.map(u => u.id === strongest.id ? {...u, atk: u.atk + weakest.atk, hp: u.hp + weakest.hp, maxHp: u.maxHp + weakest.hp} : u));
        showOpAlert(`Bio-Forge: Consumed ${weakest.name} → ${strongest.name} +${weakest.atk}/+${weakest.hp}!`, "#00ff88");
      }
    }
    // Architect: reinforce strongest ally with +0/+4
    if (board.some(u => u.tn === "Architect" || u.tn === "Golden Architect")) {
      setBoard(b => {
        if (b.length <= 1) return b;
        const candidates = b.filter(u => u.tn !== "Architect");
        if (candidates.length === 0) return b;
        const target = [...candidates].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
        showOpAlert(`Architect: Reinforced ${target.name} +0/+4!`, "#ffcc00");
        return b.map(u => u.id === target.id ? {...u, hp: u.hp + 4, maxHp: u.maxHp + 4} : u);
      });
    }
    if(!frozen){
      // Return unsold shop units to contested pool (skip augment chips)
      shop.filter(u => !sold.includes(u.id) && !u.isChip).forEach(u => unitPool.returnOne(u.tn));
      const netShopTier=activeNetEvent?.id==="black_market"?Math.min(maxShopTier,tier+1):tier; const dataSurgeExtra=activeNetEvent?.id==="data_surge"?2:0; const nsSize=(operator?.id==="neon_broker"?(SHOP_SIZE_BY_TIER[netShopTier]||5)+2:(SHOP_SIZE_BY_TIER[netShopTier]||5))+dataSurgeExtra; setShop(rollShop(netShopTier,nsSize,hp<10?2:hp<20?1:0,nr));setSold([]);
    }
    else { 
      // Frozen: replace sold slots with fresh draws
      setShop(prev => { const netShopTier=activeNetEvent?.id==="black_market"?Math.min(maxShopTier,tier+1):tier; return prev.map(u => sold.includes(u.id) ? (u.isChip ? rollAugmentChip(nr) : rollShop(netShopTier,1,0,nr)[0]) : u); }); setSold([]); 
    }
    setFrozen(false);setTimerKey(k=>k+1);
    // ── CONSUME ON-BUY FLAGS FROM PREVIOUS ROUND ──
    // Smuggler: one random shop unit costs 0
    if (window.__nextShopFreeSlot) {
      window.__nextShopFreeSlot = false;
      setTimeout(() => {
        setShop(prev => {
          const nonChips = prev.filter(u => !u.isChip);
          if (nonChips.length === 0) return prev;
          const lucky = nonChips[Math.floor(Math.random() * nonChips.length)];
          showOpAlert(`Smuggler: ${lucky.name} is FREE!`, "#00f0ff");
          return prev.map(u => u.id === lucky.id ? {...u, tier: 0, _freeFromSmuggler: true} : u);
        });
      }, 200);
    }
    // Fixer: add one unit from tier above to shop
    if (window.__nextShopTierUp) {
      window.__nextShopTierUp = false;
      const upTier = Math.min(6, tier + 1);
      setTimeout(() => {
        setShop(prev => {
          const bonus = rollShop(upTier, 1, 0, nr);
          if (bonus.length > 0) {
            showOpAlert(`Fixer: ${bonus[0].name} (T${upTier}) added to shop!`, "#ffcc00");
            return [...prev, bonus[0]];
          }
          return prev;
        });
      }, 200);
    }
    // Access Point: reveal next enemy board (set reconEnemy for Recon Tab)
    if (window.__peekNextEnemy) {
      window.__peekNextEnemy = false;
      setTimeout(() => {
        // Generate a preview enemy board
        const enemyTier = Math.min(6, Math.max(1, tier));
        const previewEnemy = rollShop(enemyTier, Math.min(7, 2 + Math.floor(nr / 2)), 0, nr).map(u => mkUnit(u, false));
        setReconEnemy(previewEnemy);
        showOpAlert(`Access Point: Enemy board scouted! Check RECON tab.`, "#00f0ff");
      }, 300);
    }
    // Black Market: convert interest gold into +1/+1 stats on random board units
    if (window.__interestToStats) {
      window.__interestToStats = false;
      const intGold = Math.min(3, Math.floor(gold / 10));
      if (intGold > 0) {
        setBoard(b => {
          if (b.length === 0) return b;
          let updated = [...b];
          for (let i = 0; i < intGold; i++) {
            const idx = Math.floor(Math.random() * updated.length);
            updated = updated.map((u, j) => j === idx ? {...u, atk: u.atk + 1, hp: u.hp + 1, maxHp: u.maxHp + 1} : u);
          }
          showOpAlert(`Black Market: ${intGold} interest → +${intGold}/+${intGold} stats!`, "#ffcc00");
          return updated;
        });
      }
    }
    // Phreaker: in PvE, give a free random unit instead of stealing (no opponent shop to steal from)
    if (window.__phreakerSteal) {
      window.__phreakerSteal = false;
      if (bench.length < maxBench) {
        const pool = unitPool.getAvailableAtTier(tier);
        if (pool.length > 0) {
          const tmpl = pool[Math.floor(Math.random() * pool.length)];
          unitPool.take(tmpl.name);
          const freeU = mkUnit(tmpl);
          setBench(b => [...b, freeU]);
          showOpAlert(`Phreaker: Wiretapped ${freeU.name}!`, "#ff00ff");
        }
      }
    }
    if(operator&&operator.id==="data_miner"&&bench.length<maxBench){const pool=unitPool.getAvailableAtTier(tier); if(pool.length>0){const tmpl=pool[Math.floor(Math.random()*pool.length)]; unitPool.take(tmpl.name); const freeU=mkUnit(tmpl);setBench(b=>[...b,freeU]);showOpAlert(" Data Miner: Free " + freeU.name + "!", operator.color);}}
  };

  const pickMod = mod => {
    if(mode==="pvp"&&pvpModDrop){pvpSend({type:"modPick",modId:mod.id,targetId:pvpModDrop.target.id});setPvpModDrop(null);return;}
    if(modT){setBoard(b=>b.map(u=>{
      if(u.id===modT.id){const up={...u,mod};
        if(mod.effect.atk)up.atk+=mod.effect.atk;if(mod.effect.hp){up.hp+=mod.effect.hp;up.maxHp+=mod.effect.hp;}
        if(mod.effect.shield)up.shield=(up.shield||0)+mod.effect.shield;return up;}return u;}));}
    setModC([]);setModT(null);nextShop(lastRoundLost);
  };

  const isWin=gs==="gameOver"&&hp>0;

  useEffect(()=>{const play=()=>{if(_muted)return;if(gs==="start"||gs==="pvpJoin"||gs==="pvpLobby"||gs==="tutorial"||gs==="operatorPick")playLanding();else if(gs==="shop"||gs==="modPick"||gs==="scout")playShopMusic();else if(gs==="combat")playCombatMusic();else if(gs==="gameOver"||gs==="pvpGameOver")stopTrack();};play();const h=()=>{play();document.removeEventListener("click",h);};document.addEventListener("click",h);return ()=>document.removeEventListener("click",h);},[gs]);

  // === OPERATOR PICK ===
  if(gs==="operatorPick"){return(
    <div className="neon-arena" data-screen={gs==="combat"?"combat":gs==="shop"||gs==="modPick"||gs==="scout"?"shop":gs==="operatorPick"?"operator":gs==="gameOver"?"gameover":"landing"}>
      <div className="na-bg-layer"><div className="na-bg-img"/><div className="na-bg-ov"/></div><style>{styles}</style><div className="start-screen" style={{paddingTop:40}}>
      <div className="game-title" style={{fontSize:"2rem",marginBottom:4}}>CHOOSE YOUR OPERATOR</div>
      <div style={{color:"var(--text-dim)",fontSize:"0.85rem",marginBottom:28}}>Each operator warps the rules. Pick wisely.</div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",justifyContent:"center",maxWidth:900,opacity:pvpOpPicked?0.6:1}}>
        {pvpOpPicked&&<div style={{color:"var(--gold)",fontFamily:"'Orbitron',sans-serif",fontSize:"0.8rem",marginBottom:16,textAlign:"center"}}>? {OPERATORS?.find(o=>o.id===pvpOpPicked)?.name || "Operator"} selected  waiting for others...</div>}
        {opChoices.map(op=>(
          <div key={op.id} onClick={()=>!pvpOpPicked&&confirmOperator(op)} className="operator-card" style={{borderColor:op.color+"66","--op-color":op.color}}>
            <div style={{width:64,height:64,borderRadius:8,overflow:"hidden",marginBottom:6,border:"2px solid "+op.color+"66"}}>
              <Img src={ART.op(op.id)} fallback={op.name?.[0]||"O"} alt={op.name}
                style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            </div>
            <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"0.95rem",fontWeight:700,color:op.color,marginBottom:6}}>{op.name}</div>
            <div style={{fontSize:"0.8rem",color:"var(--text)",lineHeight:1.5,marginBottom:8}}>{op.desc}</div>
            <div style={{fontSize:"0.65rem",color:"var(--text-dim)",fontStyle:"italic"}}>"{op.flavor}"</div>
          </div>
        ))}
      </div>
    </div></div>);}

  // === START ===
  if(gs==="start"){return(
    <div className="neon-arena"><div className="na-bg-layer"><div className="na-bg-img"/><div className="na-bg-ov"/></div><style>{styles}</style><div className="start-screen">
      <div className="start-logo">NEON ARENA</div><div className="start-subtitle">Cyberpunk Auto-Battler</div>
      <div className="faction-preview">{Object.entries(FACTIONS).map(([k,f])=>(
        <div key={k} className="faction-card" style={{borderColor:f.color+"44"}}>
          <div className="faction-card-icon" style={{width:36,height:36,margin:"0 auto"}}>
            <Img src={ART.faction(k)} fallback={f.name?.[0]||"F"} alt={f.name}
              style={{width:"100%",height:"100%",objectFit:"contain"}}/>
          </div><div className="faction-card-name" style={{color:f.color}}>{f.name}</div>
          <div className="faction-card-desc">{f.desc}</div></div>))}
      </div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
        <button className="btn btn-cyan btn-lg" onClick={startGame}>? SOLO (PvE)</button>
        <button className="btn btn-magenta btn-lg" onClick={()=>setGs("pvpJoin")}> PLAY ONLINE</button>
        <button className="btn btn-gold btn-lg" onClick={()=>setGs("tutorial")}> HOW TO PLAY</button>
        <button className="btn btn-lg" style={{borderColor:"#00f0ff66",color:"#00f0ff"}} onClick={()=>window.location.href="/?codex"}>📖 CODEX</button>
      </div>
    </div></div>);}

  // === PVP JOIN ===
  if(gs==="pvpJoin"){return(
    <div className="neon-arena"><div className="na-bg-layer"><div className="na-bg-img"/><div className="na-bg-ov"/></div><style>{styles}</style><div className="start-screen">
      <div className="game-title" style={{fontSize:"1.8rem",marginBottom:16}}> PLAY ONLINE</div>
      <div style={{marginBottom:16,color:"var(--text-dim)"}}>Enter your arena name</div>
      <input style={{background:"var(--bg-card)",border:"2px solid var(--magenta)",borderRadius:8,padding:"10px 16px",color:"var(--text)",fontFamily:"'Orbitron',sans-serif",fontSize:"0.9rem",textAlign:"center",outline:"none",width:250}} type="text" maxLength={16} placeholder="Your name..." value={pvpName}
        onChange={e=>setPvpName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&pvpName.trim())connectPvP();}}/>
      <div style={{display:"flex",gap:12,marginTop:16}}>
        <button className="btn btn-magenta btn-lg" onClick={connectPvP} disabled={!pvpName.trim()||pvpConnecting}>{pvpConnecting?"CONNECTING...":"FIND MATCH"}</button>
        <button className="btn btn-cyan" onClick={()=>setGs("start")}>? BACK</button>
      </div>
      {pvpError&&<div style={{color:"#ff4444",marginTop:12,fontSize:"0.8rem"}}>{pvpError}</div>}
    </div></div>);}

  // === PVP LOBBY ===
  if(gs==="pvpLobby"){return(
    <div className="neon-arena"><div className="na-bg-layer"><div className="na-bg-img"/><div className="na-bg-ov"/></div><style>{styles}</style><div className="start-screen">
      <div className="game-title" style={{fontSize:"1.5rem",marginBottom:16}}>? WAITING FOR PLAYERS</div>
      <div style={{color:"var(--text-dim)",marginBottom:16}}>{lobbyPlayers.length}/6 players</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16,minWidth:250}}>
        {lobbyPlayers.map(p=>(<div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:6,fontSize:"0.8rem"}}><span style={{color:p.id===playerId?"var(--cyan)":"var(--text)"}}>{p.name}{p.id===playerId?" (you)":""}</span><span style={{color:"var(--green)"}}>?</span></div>))}
        {Array.from({length:6-lobbyPlayers.length}).map((_,i)=>(<div key={"e"+i} style={{padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:6,fontSize:"0.8rem",color:"var(--text-dim)"}}>Waiting...</div>))}
      </div>
      <button className="btn btn-red" onClick={leaveGame}>? LEAVE</button>
    </div></div>);}

  // === PVP GAME OVER ===
  if(gs==="pvpGameOver"){const myRank=leaderboard.findIndex(p=>p.id===playerId)+1;return(
    <div className="neon-arena"><div className="na-bg-layer"><div className="na-bg-img"/><div className="na-bg-ov"/></div><style>{styles}</style><div className="game-over-overlay">
      <div className={"game-over-card "+(myRank===1?"win":"lose")}>
        <div className="game-over-title" style={{color:myRank===1?"var(--gold)":myRank<=3?"var(--cyan)":"#ff4444"}}>{myRank===1?" 1ST PLACE!":"#"+myRank+" FINISH"}</div>
        <div style={{marginBottom:16}}>{leaderboard.map((p,i)=>(<div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border)",color:p.id===playerId?"var(--cyan)":"var(--text)"}}><span>#{i+1} {p.name}</span><span style={{color:p.hp>0?"#66ff66":"#ff4444"}}>{p.hp}</span></div>))}</div>
        <button className="btn btn-cyan btn-lg" onClick={leaveGame}>? MAIN MENU</button>
      </div></div></div>);}

  // === TUTORIAL ===
  if(gs==="tutorial"){return(
    <div className="neon-arena"><div className="na-bg-layer"><div className="na-bg-img"/><div className="na-bg-ov"/></div><style>{styles}</style><div className="game-container"><div style={{maxWidth:800,margin:"0 auto"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div className="game-title" style={{fontSize:"1.8rem",marginBottom:8}}> HOW TO PLAY</div>
        <div style={{color:"var(--text-dim)",fontSize:"0.9rem"}}>Master the arena</div>
      </div>
      <div className="tutorial-section"><div className="tutorial-title"> THE GOAL</div>
        <div className="tutorial-text">Survive 20 rounds. Build a team from 8 factions, upgrade to Tier 6, outlast AI and bosses. HP hits 0 = eliminated. Survive round 20 = victory.</div></div>
      <div className="tutorial-section"><div className="tutorial-title"> GAME FLOW</div>
        <div className="tutorial-text">Each round: SHOP ? FIGHT. Buy units, position them, then auto-battle.</div>
        <div className="tutorial-phase-box" style={{borderColor:"var(--cyan)"}}><div style={{color:"var(--cyan)",fontWeight:700,marginBottom:4,fontFamily:"'Orbitron',sans-serif",fontSize:"0.75rem"}}>SHOP PHASE</div>
          <div className="tutorial-text">You have a timer! Spend gold wisely: buy fighters, reroll for new options, freeze good shops, tier up for stronger units. Position units by clicking + swapping.</div></div>
        <div className="tutorial-phase-box" style={{borderColor:"#ff4444"}}><div style={{color:"#ff4444",fontWeight:700,marginBottom:4,fontFamily:"'Orbitron',sans-serif",fontSize:"0.75rem"}}>COMBAT PHASE</div>
          <div className="tutorial-text">Units attack left-to-right.  Firewall units are attacked first. Position matters  put tanks left, damage right,  Link units between allies they buff.</div></div></div>
      <div className="tutorial-section"><div className="tutorial-title"> ECONOMY</div>
        <div className="tutorial-text">Base income is 5g per round. Time is the constraint, not gold! Rerolls cost just 1g. Selling refunds full tier cost.<br/><br/>
        Win/loss streaks give bonus gold (1/2/3g). Bank gold for interest (+1g per 10g saved, max +3g). Activating new combos earns +1g each. Timer scales with game complexity — more time in later rounds.</div></div>
      <div className="tutorial-section"><div className="tutorial-title">? KEYWORDS</div>
        <div className="tutorial-text">Keywords are purchased as <b>Chips</b> in the shop. Buy a chip, then click a unit to apply it. Units start with NO keywords — you choose how to build them! Each unit also has a unique <b>innate effect</b> that triggers automatically in combat.</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
          {Object.entries(KEYWORDS).map(([k,v])=>(<div key={k} className="tutorial-faction-row" style={{borderColor:"var(--border)"}}>
            <Img src={ART.kw(k)} style={{width:24,height:24,objectFit:'contain'}} fallback={v.name?.[0]||"?"}/>
            <div><div style={{fontWeight:700,fontSize:"0.8rem",color:"var(--cyan)"}}>{v.name}</div><div style={{fontSize:"0.72rem",color:"var(--text-dim)"}}>{v.desc}</div></div></div>))}
        </div></div>
      <div className="tutorial-section"><div className="tutorial-title"> CROSS-FACTION COMBOS</div>
        <div className="tutorial-text">Have 2+ of two different factions? Unlock powerful combo bonuses:</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
          {CROSS_COMBOS.map(cc=>(<div key={cc.name} className="tutorial-faction-row" style={{borderColor:"var(--gold)33"}}>
            <Img src={ART.combo(cc.factions[0],cc.factions[1])} style={{width:28,height:28,objectFit:'contain'}} fallback="C"/>
            <div><div style={{fontWeight:700,fontSize:"0.8rem",color:"var(--gold)"}}>{cc.name}</div><div style={{fontSize:"0.72rem",color:"var(--text-dim)"}}>{cc.factions.join(" + ")} &mdash; {cc.desc}</div></div></div>))}
        </div></div>
      <div className="tutorial-section"><div className="tutorial-title">? GOLDEN TRIPLES</div>
        <div className="tutorial-text">Buy 3 of the same unit ? auto-merge into a ? Golden with doubled stats. Always chase triples!</div></div>
      <div className="tutorial-section"><div className="tutorial-title"> MODS</div>
        <div className="tutorial-text">Win every 3rd round = mod drop. Pick 1 of 3 to install on a unit. Mods on golden units are devastating.</div>
        <div className="tutorial-row">{MODS.map(m=>(<div key={m.id} className="tutorial-chip" style={{borderColor:"var(--gold)",color:"var(--gold)"}}> {m.name}: {m.desc}</div>))}</div></div>
      <div className="tutorial-section"><div className="tutorial-title">? FACTIONS</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
          {Object.entries(FACTIONS).map(([k,f])=>(<div key={k} className="tutorial-faction-row" style={{borderColor:f.color+"44"}}>
            <Img src={ART.faction(k)} style={{width:24,height:24,objectFit:'contain'}} fallback={f.name?.[0]||"F"}/>
            <div><div style={{color:f.color,fontWeight:700,fontSize:"0.85rem"}}>{f.name}</div><div style={{color:"var(--text-dim)",fontSize:"0.75rem"}}>{f.desc}</div></div></div>))}
        </div></div>
      <div className="tutorial-section"><div className="tutorial-title"> OPERATORS</div>
        <div className="tutorial-text">Choose 1 of 3 operators at game start. Each one warps the rules  from economy boosts to combat tricks. 20 total operators, each enabling different strategies.</div></div>
      <div className="tutorial-section"><div className="tutorial-title"> NETWORK EVENTS</div>
        <div className="tutorial-text">Every 4th round, a random event mutates the rules for that round. Free rerolls, +5 gold, all units attack twice, no keywords  adapt or die!</div></div>
      <div className="tutorial-section"><div className="tutorial-title"> T6 MASTERY SYSTEM</div>
        <div className="tutorial-text">Tier 6 is LOCKED until you prove yourself! Complete ALL 5 mastery goals in a single game:<br/>
          Win 3 combats in a row<br/>
          Activate a cross-faction combo<br/>
         ? Triple a unit into Golden<br/>
          Survive a boss round<br/>
          Bank 10+ gold going into combat<br/>
        The mastery bar appears at Tier 4. Good players unlock T6 naturally  no grinding required.</div></div>
      <div className="tutorial-section"><div className="tutorial-title"> BOSS ROUNDS</div>
        <div className="tutorial-text">Rounds 5, 10, 15, and 20 feature powerful bosses:<br/>
         R5: Firewall Prime  all enemies have Hardshell<br/>
         R10: The Swarm  7 Drones that attack 3x<br/>
         R15: Null Pointer  every enemy has Malware<br/>
         R20: The Architect  copies YOUR board with +5/+5</div></div>
      <div className="tutorial-section"><div className="tutorial-title"> FACTIONS</div>
        <div className="tutorial-text">Each faction has a UNIQUE win condition, not just stat buffs:<br/>
         SYNTH: Units scale +ATK per attack in combat. Longer fights = stronger.<br/>
         HACKER: Steal ATK from enemy carry, silence enemy keywords.<br/>
         AUGMENTED: All buffs stack on your strongest unit. One mega carry.<br/>
         DRONE: Attack 2x/3x. Deaths buff surviving Drones permanently.<br/>
         PSIONIC: All allies gain Shield. Shield break stuns the attacker!<br/>
         VIRUS: Deaths deal direct damage to enemy PLAYER. Suicide comp!<br/>
         PHANTOM: 25-50% dodge. Assassin targeting (lowest HP enemy).<br/>
         CONSTRUCT: +1/+1 per combat permanently (cap +30). Unkillable late.<br/>
         NEUTRAL: Adaptable fighters. 3+ Neutrals gain +2/+1 stats. Merc For Hire is the only wildcard unit.<br/>
        All factions activate at 2/4/6 units. Build around your faction's identity!</div></div>
      <div className="tutorial-section"><div className="tutorial-title">⟐ AUGMENT CHIPS</div>
        <div className="tutorial-text">Augment Chips appear in the shop alongside units starting round 4. Buy them, then CLICK a unit to apply the buff permanently.<br/><br/>
        <b>1g:</b> +2 ATK, +3 HP, +4 Shield — cheap stat injections<br/>
        <b>2g:</b> +4 ATK, +6 HP, Stealth/Cleave/Regen Graft — powerful buffs or keyword grafts<br/>
        <b>3g:</b> +5/+5, +8 Shield — premium combat boosters<br/><br/>
        Chips are consumed when applied — no refunds! Every chip you apply makes your board stronger, but every second spent applying is time you're not scouting or rerolling.</div></div>
      <div className="tutorial-section"><div className="tutorial-title">⟐ RECON TAB</div>
        <div className="tutorial-text">Press TAB during shop phase to peek at your next opponent's board. You can flip back and forth freely.<br/><br/>
        While scouting, your timer keeps ticking — time spent reading the enemy is time not spent shopping, rolling, or applying chips. The skill is balancing intel vs action.<br/><br/>
        High-APM players can scout for 2-3 seconds, identify threats, flip back, and counter-build all within the round. Slower players may want to skip scouting and focus on their own board.</div></div>
      <div className="tutorial-section"><div className="tutorial-title">BREACH SYSTEM</div>
        <div className="tutorial-text">When you triple a unit (combine 3 copies into a golden), you earn a <b>BREACH</b> — a powerful one-use ability you can activate at any time during a shop phase.<br/><br/>
        [NH] <b>Neural Hijack</b> — Steal/copy an enemy unit<br/>
        [SC] <b>System Crash</b> — Halve an enemy's strongest unit's stats<br/>
        [SP] <b>Surge Protocol</b> — Double one of your unit's stats<br/>
        [CP] <b>Clone Protocol</b> — Copy any unit you own (can chain triples!)<br/>
        [BI] <b>Black Ice</b> — Premium secret shop (min T5, T7 at T5+). 2x cost<br/>
        [CB] <b>Chronobreak</b> — Reset timer to 45s + 3 free rerolls<br/><br/>
        You can hold 1 Breach at a time. Breaches expire after 5 rounds. In PvP, opponents can see you have a Breach but not which one!</div></div>
      <div className="tutorial-section"><div className="tutorial-title"> PRO TIPS</div>
        <div className="tutorial-tips">
          <div className="tutorial-tip">FRONTLINE (slots 1-4) absorbs damage. BACKLINE (slots 5-7) is safe but exposed when frontline falls. Position carries in back!</div>
          <div className="tutorial-tip">Firewall forces targeting. Aggro Lock overrides everything. Put tanks in frontline with these keywords.</div>
          <div className="tutorial-tip">Put  Link units BETWEEN the allies you want to buff.</div>
          <div className="tutorial-tip"> Malware on a low-ATK unit is still deadly  it kills anything it touches.</div>
          <div className="tutorial-tip">Save gold for interest! +1g per 10g banked (max +3g). Combos give +1g when first activated. Rerolls are 1g — invest in gold-gen units for long-term income!</div>
          <div className="tutorial-tip">Win streaks AND loss streaks give bonus gold. Losing on purpose can fund a comeback pivot.</div>
          <div className="tutorial-tip">VIRUS wants its units to die  tuck them in backline and let frontline fall first for maximum bleed.</div>
          <div className="tutorial-tip">HACKER counters single-carry comps (AUGMENTED). PSIONIC stun counters multi-hit (DRONE). Every faction has a counter.</div>
          <div className="tutorial-tip">Boss rounds are fixed  build your board to counter them. Hardshell beats R5, shields beat R15 Malware.</div>
          <div className="tutorial-tip">Cross-faction combos are the hidden meta. 2 Synth + 2 Drone = massive damage.</div>
          <div className="tutorial-tip"> Deadswitch units are worth more than their stats  they fight twice.</div>
          <div className="tutorial-tip">Freeze the shop if you see a unit you can't afford yet.</div>
        </div></div>
      <div style={{textAlign:"center",marginTop:24,paddingBottom:24}}>
        <button className="btn btn-cyan btn-lg" onClick={()=>setGs("start")}>? BACK TO MENU</button></div>
    </div></div></div>);}

  // === GAME OVER ===
  if(gs==="gameOver"){return(
    <div className="neon-arena"><div className="na-bg-layer"><div className="na-bg-img"/><div className="na-bg-ov"/></div><style>{styles}</style><div className="game-over-overlay">
      <div className={`game-over-card ${isWin?"win":"lose"}`}>
        <div className="game-over-title" style={{color:isWin?"var(--gold)":"#ff4444"}}>{isWin?" VICTORY":" DEFEATED"}</div>
        <div className="game-over-subtitle">{isWin?`Dominated in ${round} rounds!`:`Eliminated round ${round}`}</div>
        <div style={{marginBottom:20,color:"var(--text-dim)"}}>Wins: {wins}  Tier: {tier}</div>
        <button className="btn btn-cyan btn-lg" onClick={()=>{setGs("start");setMode(null);playTrans("trans-exit");}}>? MAIN MENU</button>
      </div></div></div>);}

  // === MOD PICK ===
  if(gs==="modPick"){const mChoices=mode==="pvp"&&pvpModDrop?pvpModDrop.choices:modC;const mTarget=mode==="pvp"&&pvpModDrop?pvpModDrop.target:modT;const tFaction=FACTIONS[mTarget?.faction];const tColor=tFaction?.color||'#888';return(
    <div className="neon-arena"><div className="na-bg-layer"><div className="na-bg-img"/><div className="na-bg-ov"/></div><style>{styles}</style><div className="game-container"><div className="mod-panel">
      {/* Header */}
      <div className="mod-panel-header">MOD DROP</div>
      <div className="mod-panel-sub">Choose an upgrade to install</div>

      {/* Unit Showcase */}
      {mTarget&&<div className="mod-unit-showcase" style={{'--fc':tColor}}>
        <div className="mod-unit-card">
          <div className="mod-unit-frame" style={{borderColor:mTarget.golden?'#ffcc00':tColor}}>
            <Img src={ART.unit(mTarget.name,mTarget.faction)} className="mod-unit-art" fallback={mTarget.faction?.[0]||'?'}/>
            {mTarget.golden&&<div className="mod-unit-golden-badge">GOLDEN</div>}
          </div>
          <div className="mod-unit-info">
            <div className="mod-unit-name" style={{color:mTarget.golden?'#ffcc00':tColor}}>{mTarget.name}</div>
            <div className="mod-unit-meta">
              <span className="mod-unit-tier" style={{borderColor:tColor+'66',color:tColor}}>T{mTarget.tier}</span>
              <Img src={ART.faction(mTarget.faction)} style={{width:18,height:18,objectFit:'contain'}} fallback={tFaction?.name?.[0]||'?'}/>
              <span style={{color:tColor,fontSize:'0.7rem',fontWeight:700}}>{tFaction?.name}</span>
            </div>
            <div className="mod-unit-stats">
              <span className="mod-stat-atk"><Img src={ART.ui("hp_heart")} style={{width:14,height:14,objectFit:'contain',filter:'hue-rotate(-60deg) saturate(2)'}}/>{mTarget.atk}</span>
              <span className="mod-stat-hp"><Img src={ART.ui("hp_heart")} style={{width:14,height:14,objectFit:'contain'}}/>{mTarget.hp}/{mTarget.maxHp}</span>
              {mTarget.shield>0&&<span className="mod-stat-shield">SH {mTarget.shield}</span>}
            </div>
            {mTarget.kw&&mTarget.kw.length>0&&<div className="mod-unit-keywords">
              {mTarget.kw.map(k=>{const kd=KEYWORDS[k]||{};return(
                <div key={k} className="mod-kw-tag">
                  <Img src={kd.img||ART.kw(k)} style={{width:14,height:14,objectFit:'contain'}} fallback={k[0]}/> {kd.name||k}
                </div>);})}
            </div>}
            {mTarget.mod&&<div className="mod-unit-current-mod">
              <Img src={ART.mod(mTarget.mod.id)} style={{width:16,height:16,objectFit:'contain'}} fallback="M"/>
              <span>Installed: {mTarget.mod.name}</span>
            </div>}
          </div>
        </div>
      </div>}

      {/* Mod Choices */}
      <div className="mod-choices-label">SELECT A MOD</div>
      <div className="mod-choices">{mChoices.map(m=>(<div key={m.id} className="mod-choice" onClick={()=>pickMod(m)} style={{'--mc':'#ffcc00'}}>
        <Img src={ART.mod(m.id)} className="mod-choice-icon" fallback="M"/>
        <div className="mod-choice-name">{m.name}</div>
        <div className="mod-choice-desc">{m.desc}</div>
        {mTarget&&<div className="mod-choice-preview">
          {m.effect?.atk?<span className="mod-prev-stat" style={{color:'#ff4444'}}>ATK {mTarget.atk}→{mTarget.atk+(m.effect.atk||0)}</span>:null}
          {m.effect?.hp?<span className="mod-prev-stat" style={{color:'#44ff66'}}>HP {mTarget.maxHp}→{mTarget.maxHp+(m.effect.hp||0)}</span>:null}
          {m.effect?.shield?<span className="mod-prev-stat" style={{color:'#4488ff'}}>+{m.effect.shield} Shield</span>:null}
          {m.effect?.lifesteal?<span className="mod-prev-stat" style={{color:'#ff66aa'}}>Heal {m.effect.lifesteal} on kill</span>:null}
          {m.effect?.thorns?<span className="mod-prev-stat" style={{color:'#ff8800'}}>Reflect {m.effect.thorns} dmg</span>:null}
          {m.effect?.swift?<span className="mod-prev-stat" style={{color:'#00f0ff'}}>Attack first</span>:null}
          {m.effect?.doubleDeadswitch?<span className="mod-prev-stat" style={{color:'#aa66ff'}}>2× Deadswitch</span>:null}
        </div>}
      </div>))}
      </div></div></div></div>);}


  // === MAIN GAME ===
  const showLB=mode==="pvp"&&leaderboard.length>0;
  return(
    <div className={"neon-arena"+(dragUnit?" is-dragging":"")+(streak>=3?" streak-fire":"")+(hp<15&&hp>0?" danger-low":"")+(phaseAnim?" phase-"+phaseAnim:"")}
      onClick={(e)=>{if(tapSelected&&!e.target.closest('.c,.bench-pod-unit,.empty-slot,.bench-pod-empty,.dnd-sell-zone'))setTapSelected(null);}}>
      <div className="na-bg-layer"><div className="na-bg-img"/><div className="na-bg-ov"/></div>
      <style>{styles}</style>

      {/* === HEADER === */}
      <header className="game-header">
        <div className="hd-left">
          <span className="game-title">NEON ARENA</span>
          <span className="hd-badge">{mode==='pvp'?'PVP':'SOLO'}</span>
        </div>
        <div className="hd-center">
          <span className="hd-rnd">R{round}/20</span>
          <span className="hd-sep"/>
          <Img src={ART.ui('gold_coin')} className="hd-mi"/><span className="hd-gold">{gold}</span>
          <span className="hd-sep"/>
          <span className="hd-win">W{wins}{streak>1?("/S"+streak):""}</span>
          {comebackBonus>0&&<><span className="hd-sep"/><span className="hd-cb">+{comebackBonus}</span></>}
          {tier>=4&&<><span className="hd-sep"/><div className="hd-mastery">
            <span className="hd-mastery-label">T6 {t6Unlocked?"OK":masteryCount+"/5"}</span>
            <div className="hd-mastery-dots">
              <span className={"hd-md"+(mastery.winStreak3?" hd-md-on":"")} title="Win 3 in a row"/>
              <span className={"hd-md"+(mastery.crossCombo?" hd-md-on":"")} title="Cross combo"/>
              <span className={"hd-md"+(mastery.tripleUnit?" hd-md-on":"")} title="Triple a unit"/>
              <span className={"hd-md"+((mode==="pvp"?mastery.faction4:mastery.bossSurvived)?" hd-md-on":"")} title={mode==="pvp"?"4-stack faction":"Survive a boss"}/>
              <span className={"hd-md"+(mastery.banked10?" hd-md-on":"")} title="Bank 10+ gold"/>
            </div>
          </div></>}
        </div>
        <div className="hd-right">
          {breachFreeRerolls>0&&<span className="hd-free">FREE x{breachFreeRerolls}</span>}
          <button className="hd-btn" onClick={()=>{_muted=!_muted;setMuted(m=>{const n=!m;if(n){stopTrack();currentTrackName=null;}else{currentTrackName=null;if(gs==="combat")playCombatMusic();else if(gs==="shop"||gs==="modPick")playShopMusic();else playLanding();}return n;});}} title={muted?"Unmute":"Mute"} style={{color:muted?"#ff4444":"#00f0ff",borderColor:muted?"#ff4444":"rgba(0,240,255,0.4)"}}>{muted?"OFF":"ON"}</button>
          <input type="range" min="0" max="100" value={vol} onChange={e=>{const v=parseInt(e.target.value);setVol(v);_vol=v/100;if(currentTrack&&!_muted)currentTrack.volume=(_vol*(currentTrackName==="theme-combat"?0.18:currentTrackName==="theme"?0.15:0.12));}} className="hd-vol" title={"Volume: "+vol+"%"}/>
          <button className="hd-btn hd-btn-x" onClick={leaveGame} title="Leave game">X</button>
        </div>
      </header>

      {/* === SYNERGY BAR (v3 component) === */}
      <SynergyBar board={board} round={round} gameState={gs}/>

      {/* Timer moved into vendor row below */}

      {/* === OPERATOR ALERT (centered popup) === */}
      {opAlert&&<div className="op-alert" style={{"--alert-color":opAlert.color}}>{opAlert.msg}</div>}

      {/* === BREACH PICK OVERLAY === */}
      {breachMode==="picking"&&breachChoices.length>0&&(
        <div className="breach-overlay">
          <div className="breach-pick-panel">
            <div className="breach-glitch-text">ACCESS GRANTED</div>
            <div className="breach-pick-title"> BREACH EARNED — Choose Your Weapon</div>
            <div className="breach-pick-subtitle">Bank it. Time it. Unleash it.</div>
            <div className="breach-pick-cards">
              {breachChoices.map(b=>(
                <div key={b.id} className="breach-card" style={{"--bc":b.color}} onClick={()=>pickBreach(b)}>
                  <img src={BREACH_SVG[b.id]} className="breach-card-svg" alt={b.name}/>
                  <div className="breach-card-name">{b.name}</div>
                  <div className="breach-card-desc">{mode==="pvp"?b.desc:b.pveDesc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === BREACH TARGETING OVERLAY === */}
      {(breachMode==="targeting-steal"||breachMode==="targeting-overclock"||breachMode==="targeting-duplicate")&&(
        <div className="breach-overlay breach-targeting">
          <div className="breach-target-panel">
            <div className="breach-target-title">
              {breachMode==="targeting-steal"&&"NEURAL HIJACK — Pick a unit to steal"}
              {breachMode==="targeting-overclock"&&"SURGE PROTOCOL — Pick a unit to double"}
              {breachMode==="targeting-duplicate"&&"CLONE PROTOCOL — Pick a unit to copy"}
            </div>
            <div className="breach-target-grid">
              {(breachMode==="targeting-steal"?lastEnemyBoard.filter(u=>!u.golden):[...board,...bench]).map(u=>(
                <div key={u.id} className="breach-target-unit" onClick={()=>breachTarget(u,"board")}
                  style={{borderColor:FACTIONS[u.faction]?.color||"#888"}}>
                  <div className="breach-target-art">
                    <Img src={ART.unit(u.name,u.faction)} fallback={u.faction?.[0]||"U"} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  </div>
                  <div className="breach-target-name" style={{color:FACTIONS[u.faction]?.color}}>{u.name}</div>
                  <div className="breach-target-stats">
                    <span style={{color:"#ff6644"}}>A:{u.atk}</span>
                    <span style={{color:"#44ff66"}}>H:{u.hp}</span>
                    {u.golden&&<span style={{color:"#ffcc00"}}>G</span>}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-red" onClick={cancelBreachTarget} style={{marginTop:12}}>CANCEL</button>
          </div>
        </div>
      )}

      {/* === GLITCH MARKET OVERLAY === */}
      {breachMode==="glitch-market"&&(
        <div className="breach-overlay breach-glitch">
          <div className="breach-target-panel">
            <div className="breach-glitch-text">BLACK ICE</div>
            <div className="breach-target-title">[BI] SECRET SHOP — {tier>=5?"Exclusive T7":"T"+Math.max(5,Math.min(6,tier+2))} Units (2x Gold Cost)</div>
            <div className="breach-target-grid">
              {breachGlitchShop.map(u=>{
                const cost=u.tier*2;
                const noSpace=board.length>=MAX_BOARD_SIZE&&bench.length>=maxBench;
                const cantAfford=gold<cost;
                const disabled=noSpace||cantAfford;
                return(
                <div key={u.id} className={"breach-target-unit breach-glitch-unit"+(disabled?" glitch-disabled":"")} onClick={()=>buyGlitchUnit(u)}
                  style={{borderColor:FACTIONS[u.faction]?.color||"#888",opacity:disabled?0.35:1,cursor:disabled?"not-allowed":"pointer"}}>
                  <div className="breach-target-art">
                    <Img src={ART.unit(u.name,u.faction)} fallback={u.faction?.[0]||"U"} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  </div>
                  <div className="breach-target-name" style={{color:FACTIONS[u.faction]?.color}}>{u.name}</div>
                  <div className="breach-target-stats">
                    <span style={{color:"#ff6644"}}>A:{u.atk}</span>
                    <span style={{color:"#44ff66"}}>H:{u.hp}</span>
                  </div>
                  <div className="breach-target-cost">{cost}g</div>
                  {noSpace&&<div className="glitch-unit-blocked">FULL</div>}
                  {!noSpace&&cantAfford&&<div className="glitch-unit-blocked" style={{color:"#ff4444"}}>NEED {cost}g</div>}
                </div>);
              })}
            </div>
            {board.length>=MAX_BOARD_SIZE&&bench.length>=maxBench&&<div style={{color:'#ff8800',fontFamily:"'Orbitron',sans-serif",fontSize:'0.7rem',fontWeight:700,marginTop:8,textShadow:'0 0 8px rgba(255,136,0,0.3)'}}>Board & bench full — sell a unit to make room</div>}
            <button className="btn btn-magenta" onClick={closeGlitchMarket} style={{marginTop:12}}>CLOSE MARKET</button>
          </div>
        </div>
      )}

      {/* === COMBAT VIEW (PixiJS) === */}
      {gs==="combat"&&<BattleArenaPixi events={cEvents} onComplete={stableCombatDone}/>}

      {/* === DEBUG OVERLAY (Ctrl+D) === */}
      {debugOverlay && cEvents.length > 0 && (
        <div className="debug-overlay">
          <div className="debug-header">
            <span>🔧 COMBAT DEBUG</span>
            <button onClick={()=>setDebugOverlay(false)} style={{background:'none',border:'1px solid #f44',color:'#f44',borderRadius:4,cursor:'pointer',padding:'2px 8px'}}>✕</button>
          </div>
          <div className="debug-boards">
            {(() => {
              const start = cEvents.find(e => e.type === "start");
              if (!start) return null;
              return <>
                <div className="debug-side">
                  <div className="debug-side-label">👤 PLAYER</div>
                  {start.pBoard?.map((u,i) => (
                    <div key={i} className="debug-unit">
                      <span className="du-name">{u.emoji} {u.tn}</span>
                      <span className="du-stats">{u.atk}⚔ {u.hp}/{u.maxHp}❤ {u.shield>0?u.shield+'🛡 ':''}</span>
                      <span className="du-kw">{u.kw.join(',')}</span>
                      {u.innate && <span className="du-inn">{u.innate.slice(0,40)}</span>}
                    </div>
                  ))}
                </div>
                <div className="debug-side">
                  <div className="debug-side-label">👾 ENEMY</div>
                  {start.eBoard?.map((u,i) => (
                    <div key={i} className="debug-unit">
                      <span className="du-name">{u.emoji} {u.tn}</span>
                      <span className="du-stats">{u.atk}⚔ {u.hp}/{u.maxHp}❤ {u.shield>0?u.shield+'🛡 ':''}</span>
                      <span className="du-kw">{u.kw.join(',')}</span>
                    </div>
                  ))}
                </div>
              </>;
            })()}
          </div>
          <div className="debug-log-label">EVENT LOG ({cEvents.length} events)</div>
          <div className="debug-log">
            {cEvents.map((e,i) => {
              if (e.type === "start") return <div key={i} className="dl-evt dl-start">⚡ COMBAT START — {e.pBoard?.length}v{e.eBoard?.length}</div>;
              if (e.type === "phase") return <div key={i} className="dl-evt" style={{color:'#ffcc00',fontWeight:700,borderTop:'1px solid rgba(255,204,0,0.3)',paddingTop:4,marginTop:2}}>{'━━ '+(e.phase==='setup'?'SETUP PHASE':'COMBAT PHASE')+' ━━'}</div>;
              if (e.type === "silence") return <div key={i} className="dl-evt" style={{color:'#ff0066',fontWeight:700,background:'rgba(255,0,102,0.1)',borderRadius:3,padding:'2px 4px'}}>🔇 {e.side==="player"?"👤":"👾"} SILENCED: {e.targetName}'s {(e.keyword||"?").toUpperCase()} removed!</div>;
              if (e.type === "attack") return <div key={i} className={"dl-evt dl-atk"+(e.killed?" dl-kill":"")}>
                {e.side==="player"?"👤":"👾"} {e.attackerName||"?"} → {e.targetName||"?"}: {e.actualDmg}dmg{e.shieldAbsorbed>0?` (${e.shieldAbsorbed} shld)`:""}{e.killed?" 💀 KILL":""}
                {e.actualCounterDmg>0?` ↩${e.actualCounterDmg}`:""}{e.counterKilled?" 💀":""}
              </div>;
              if (e.type === "death") return <div key={i} className="dl-evt dl-death">💀 {e.unitName||"unit"} died</div>;
              if (e.type === "deadswitch") return <div key={i} className="dl-evt dl-ds">💣 DEADSWITCH: {e.msg||""}</div>;
              if (e.type === "splash") return <div key={i} className="dl-evt dl-splash">🌊 Splash {e.dmg}dmg to {e.targets||"all"}</div>;
              if (e.type === "cleave") return <div key={i} className="dl-evt dl-splash">🔪 Cleave {e.dmg||"?"}dmg</div>;
              if (e.type === "dodge") return <div key={i} className="dl-evt dl-dodge">💨 {e.defenderName||"?"} dodged!</div>;
              if (e.type === "hardshell") return <div key={i} className="dl-evt dl-dodge">🛡 Hardshell blocked!</div>;
              if (e.type === "heal") return <div key={i} className="dl-evt" style={{color:'#44ff66'}}>💚 {e.unitName||"?"} healed +{e.amount||"?"}{e.source?" ("+e.source+")":""}</div>;
              if (e.type === "announce") return <div key={i} className="dl-evt dl-ann">📢 {e.side==="player"?"[YOU] ":e.side==="enemy"?"[FOE] ":""}{e.msg}</div>;
              if (e.type === "result") return <div key={i} className="dl-evt dl-result">{e.playerWon?"✅ PLAYER WIN":"❌ PLAYER LOSS"}{e.draw?" 🤝 DRAW":""} — {e.dmgToLoser}dmg</div>;
              return <div key={i} className="dl-evt">[{e.type}] {e.msg||""}</div>;
            })}
          </div>
        </div>
      )}

      {/* === VFX OVERLAYS === */}
      {phaseAnim&&<div className={"phase-transition-overlay phase-"+phaseAnim}/>}
      {goldFlash&&<div className={"gold-flash-fx gold-flash-"+goldFlash.type}>
        {goldFlash?.type==="earn"&&<><span className="gf-coin"></span><span className="gf-text">+{goldFlash.amt}g</span></>}
        {goldFlash?.type==="spend"&&<><span className="gf-coin"></span><span className="gf-text">-{goldFlash.amt}g</span></>}
      </div>}

      {/* === DRAG GHOST === */}
      {dragUnit&&<div className="dnd-ghost" style={{left:dragPos.x-55,top:dragPos.y-70,pointerEvents:"none"}}>
        <div className="dnd-ghost-card" style={{borderColor:(FACTIONS[dragUnit.faction]?.color||'#00f0ff')+'66'}}>
          <div style={{width:60,height:60,borderRadius:6,overflow:"hidden",margin:"0 auto 4px",border:'1px solid '+(FACTIONS[dragUnit.faction]?.color||'#888')+'44'}}>
            <Img src={ART.unit(dragUnit.name,dragUnit.faction)} fallback={dragUnit.faction?.[0]||"U"} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:800,fontSize:"0.6rem",color:FACTIONS[dragUnit.faction]?.color,textAlign:"center",marginBottom:2}}>{dragUnit.name}</div>
          <div style={{display:"flex",justifyContent:"center",gap:8,fontSize:"0.65rem",fontFamily:"'Orbitron',sans-serif",fontWeight:700}}><span style={{color:"#ff6644"}}>A:{dragUnit.atk}</span><span style={{color:"#44ff66"}}>H:{dragUnit.hp}</span></div>
        </div>
      </div>}

      {/* === SHOP: 3-COLUMN LAYOUT (also shown during scout for board rearranging) === */}
      {(gs==="shop"||gs==="scout")&&(
        <div className="game-body">

          {/* LEFT SIDEBAR */}
          <aside className="sidebar-left">
            <Leaderboard players={leaderboard.length>0?leaderboard:[
              {id:"you",name:operator?.name||"You",hp:hp},
              {id:"e1",name:"Rival",hp:Math.max(0,45-round*2)},
              {id:"e2",name:"Contender",hp:Math.max(0,40-round*2)},
              {id:"e3",name:"Rookie",hp:Math.max(0,35-round*3)}
            ]} myId={mode==="pvp"?playerId:"you"}/>
            <AnchorShowcase onHover={setHovInfo}/>
            {/* Breach power glyphs */}
            {breaches.some(b=>b)&&<div className="breach-sidebar">
              <div className="sb-title">BREACHES</div>
              <div className="breach-glyph-row">
                {[0,1,2].map(i => {
                  const b = breaches[i];
                  return b ? (
                    <button key={i} className={"breach-glyph breach-glyph-loaded"+(breachAnim?" breach-anim-"+breachAnim:"")}
                      onClick={()=>activateBreach(i)} style={{"--bc":b.color}}
                      title={b.name+": "+b.desc+" ("+(5-(round-b.roundEarned))+"r left)"}
                      onMouseEnter={()=>setHovInfo({type:'breach', name:b.name, desc:mode==="pvp"?b.desc:b.pveDesc, color:b.color, id:b.id, roundsLeft:5-(round-b.roundEarned)})}
                      onMouseLeave={()=>setHovInfo(null)}>
                      <img src={BREACH_SVG[b.id]} className="breach-glyph-svg" alt={b.name}/>
                      <span className="breach-glyph-timer">{5-(round-b.roundEarned)}r</span>
                    </button>
                  ) : <div key={i} className="breach-glyph breach-glyph-empty"/>;
                })}
              </div>
              {sabotageActive&&<div className="breach-armed-tag">SABOTAGE ARMED</div>}
            </div>}

          </aside>

          {/* CENTER COLUMN */}
          <div className="game-center">
            {/* VENDOR BAR — character-driven sell zone */}
            <div className={"vendor-bar"+(dropZone==="sell"&&dragUnit?" vendor-hot":"")+(tapSelected?" tap-sell-ready":"")}>
              <div className={"vendor-portrait dnd-sell-zone"+(dropZone==="sell"&&dragUnit?" vendor-sell-active":"")}
                onClick={()=>{if(tapSelected){sellUnit(tapSelected.unit);setTapSelected(null);}}}
                title={tapSelected?"Click to sell":"Drag unit here to sell"}>
                <Img src="/art/operators/op_scrap9.png" alt="Scrap-9" className="vendor-portrait-img" fallback="S9"/>
                <div className="vendor-glow"/>
                {dropZone==="sell"&&dragUnit&&<div className="vendor-sell-flash">SELL{(dragUnit._lifetimeKills||0)>=3?' 💀':''}</div>}
                {tapSelected&&<div className="vendor-sell-flash" style={{background:'rgba(255,68,68,0.85)'}}>SELL {(tapSelected.unit.golden?tapSelected.unit.tier*3:tapSelected.unit.tier)+Math.floor((tapSelected.unit._lifetimeKills||0)/3)}g{(tapSelected.unit._lifetimeKills||0)>=3?' 💀':''}</div>}
              </div>
              <div className="vendor-speech">
                {bossWarn?(<span className="vendor-boss">{bossWarn}</span>
                ):netEvent?(<><span className="vendor-evt-name" style={{color:netEvent.color}}>{netEvent.name}</span><span className="vendor-evt-desc" style={{color:netEvent.color+'bb'}}>{netEvent.desc}</span></>
                ):(<span className="vendor-quote">{keeperLine||VENDOR_LINES[(round||0)%VENDOR_LINES.length]}</span>)}
                <span className="vendor-tag">SCRAP-9</span>
              </div>
              {mode!=="pvp"&&gs!=="scout"&&<button className="btn btn-red btn-fight" onClick={startCombat} disabled={board.length===0}>
                <Img src={ART.ui('hp_heart')} style={{width:16,height:16,objectFit:'contain'}}/> FIGHT</button>}
            </div>

            {/* SHOP GRID — fixed unit slots + chip pod */}
            <div className="shop-area">
              <div className="shop-grid">
                {shop.filter(u=>!u.isChip).map(unit=>{
                  const isSold=sold.includes(unit.id);
                  const echoFree4 = operator?.id==="echo_protocol" && buyCountThisRound === 3;
                  const ca=(gold>=unit.tier||echoFree4)&&!isSold&&gs!=="scout";
                  return(
                    <div key={unit.id} className={`shop-slot${frozen&&!isSold?" frozen-card":""}`}>
                      {isSold?<div className="shop-slot-empty"/>:
                      <div style={{opacity:ca?1:0.5}}>
                      <Card unit={unit} sz="shop" onClick={()=>ca&&buyUnit(unit)} showCost
                        ownedCount={[...board,...bench].filter(u=>u.tn===unit.tn&&!u.golden).length}
                        onDragStart={ca?(e)=>handlePointerDown(e,unit,"shop"):undefined}
                        _dragging={dragUnit?.id===unit.id} _anyDrag={!!dragUnit} onHover={setHovUnit}/>
                      </div>}
                    </div>
                  );
                })}
                {/* CHIP POD — stacked like bench */}
                {shop.some(u=>u.isChip)&&<div className="chip-pod">
                  <div className="chip-pod-label">CHIPS</div>
                  <div className="chip-pod-slots">
                    {shop.filter(u=>u.isChip).slice(0,3).map(unit=>{
                      const isSold=sold.includes(unit.id);
                      const chip=unit.chipData;
                      const chipCost=operator?.id==="ghostwire"?Math.max(0,chip.cost-1):chip.cost;
                      const canBuy=gold>=chipCost&&!isSold&&gs!=="scout";
                      return isSold?<div key={unit.id} className="chip-pod-empty"/>:(
                        <div key={unit.id} className={`chip-pod-unit${frozen?" frozen-card":""}`}
                          onClick={()=>canBuy&&buyUnit(unit)}
                          onMouseEnter={()=>setHovInfo({type:'mod',name:chip.name,desc:chip.desc,id:'chip',color:chip.color})}
                          onMouseLeave={()=>setHovInfo(null)}
                          style={{opacity:canBuy?1:0.4,cursor:canBuy?"pointer":"default",borderColor:chip.color+'88'}}>
                          <div className="chip-pod-icon">{chip.icon}</div>
                          <div className="chip-pod-info">
                            <span className="chip-pod-name" style={{color:chip.color}}>{chip.name}</span>
                            <span className="chip-pod-cost">🪙{chipCost}g{operator?.id==="ghostwire"&&chip.cost>chipCost?<span style={{color:"#aa66ff",fontSize:"0.35rem"}}> (-1)</span>:null}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>}
              </div>
            </div>

            {/* QUEST OFFER / ACTIVE QUEST */}
            {(questOffer || activeQuest) && gs === "shop" && (
              <div className="quest-bar">
                {questOffer && !activeQuest && (
                  <div className="quest-offer" onClick={() => acceptQuest(questOffer)}>
                    <div className="quest-offer-tag">📋 CONTRACT</div>
                    <div className="quest-offer-body">
                      <span className="quest-offer-icon">{questOffer.icon}</span>
                      <div className="quest-offer-info">
                        <span className="quest-offer-name">{questOffer.name}</span>
                        <span className="quest-offer-desc">{questOffer.desc}</span>
                      </div>
                      <div className="quest-offer-reward">
                        <span className="quest-offer-gold">+{questOffer.reward}g</span>
                        <span className="quest-offer-rounds">{questOffer.rounds}R</span>
                      </div>
                    </div>
                  </div>
                )}
                {activeQuest && (
                  <div className="quest-active">
                    <div className="quest-active-tag">📋 ACTIVE</div>
                    <div className="quest-active-body">
                      <span className="quest-active-icon">{activeQuest.icon}</span>
                      <div className="quest-active-info">
                        <span className="quest-active-name">{activeQuest.name}</span>
                        <span className="quest-active-desc">{activeQuest.desc}</span>
                      </div>
                      <div className="quest-active-meta">
                        <span className="quest-active-gold">+{activeQuest.reward}g{operator?.id === "killswitch" ? ` +${Math.ceil(activeQuest.reward*0.5)}` : ''}</span>
                        <span className="quest-active-timer">{activeQuest.roundsLeft}R left</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ACTION ROW */}
            <div className="action-row">
              <button className={`btn action-freeze ${frozen?"btn-gold":"btn-dim"}`} onClick={()=>{if(mode==="pvp")pvpSend({type:"freeze"});playSound("freeze");setFrozen(f=>{if(!f){keeperSay("frozen");}return !f;});}}>
                <Img src={ART.ui('freeze_crystal')} style={{width:18,height:18,objectFit:'contain'}}/>
                <span>{frozen?"THAW":"FREEZE"}</span></button>

              <div className="action-roll-group">
                <div className="roll-top-row">
                  {gs==="shop"&&<ShopTimer key={timerKey} seconds={timerOverride||timerSec} onExpire={startCombat}/>}
                  <div className="action-gold">
                    <Img src={ART.ui('gold_coin')} style={{width:18,height:18,objectFit:'contain'}}/>
                    <span>{gold}</span>
                  </div>
                  {/* Recon Tab Button */}
                  {gs==="shop"&&round>=2&&<button onClick={()=>{
                    setReconView(r => {
                      if(!r) {
                        setReconTimer(10);
                        setReconEnemy(prev => {
                          if(prev.length > 0) return prev;
                          if(BOSSES[round+1]) return BOSSES[round+1].gen();
                          return genEnemy(round+1);
                        });
                      }
                      return !r;
                    });
                  }} style={{
                    fontFamily:"'Orbitron',sans-serif",fontSize:"0.5rem",fontWeight:700,
                    padding:"3px 10px",borderRadius:8,cursor:"pointer",border:"1px solid",
                    color:reconView?"#ffcc00":"#00f0ff",
                    borderColor:reconView?"rgba(255,204,0,0.4)":"rgba(0,240,255,0.25)",
                    background:reconView?"rgba(255,204,0,0.1)":"rgba(0,240,255,0.05)",
                    transition:"all 0.15s",letterSpacing:1
                  }}>{reconView?`◀ BACK (${reconTimer}s)`:"⟐ RECON [Tab]"}</button>}
                  {/* Pending Chip indicator */}
                  {pendingChip&&<div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"0.45rem",fontWeight:700,color:pendingChip.color,padding:"2px 8px",borderRadius:8,border:`1px solid ${pendingChip.color}55`,background:`${pendingChip.color}10`,animation:"pulse 0.6s infinite alternate"}}>
                    {pendingChip.icon} CLICK A UNIT TO APPLY
                    <span onClick={(e)=>{e.stopPropagation();setPendingChip(null);setGold(g=>g+(operator?.id==='ghostwire'?Math.max(0,(pendingChip?.cost||0)-1):(pendingChip?.cost||0)));}} style={{marginLeft:6,color:"#ff4444",cursor:"pointer",fontSize:"0.5rem"}}>✕</span>
                  </div>}
                </div>
                <button className="btn btn-cyan action-roll-btn" onClick={reroll} disabled={gold<(operator?.id==="neon_broker"?0:REROLL_COST)&&!breachFreeRerolls}>
                  <Img src={ART.ui('reroll_dice')} style={{width:22,height:22,objectFit:'contain'}}/>
                  <span>{breachFreeRerolls>0?("FREE("+breachFreeRerolls+")"):operator?.id==="neon_broker"?"ROLL FREE":"ROLL "+REROLL_COST+"g"}</span></button>
              </div>

              <button className={`btn action-tier ${tier>=6?"btn-dim":gold>=(operator?.id==="overclocker"?Math.max(1,(TIER_UP_COST[tier]||99)-3):(TIER_UP_COST[tier]||99))?"action-tier-glow":"btn-green"} ${mode!=="pvp"&&tier===5&&!t6Unlocked?"btn-locked":""}`} onClick={tierUpFn} disabled={gs==="scout"||tier>=6||gold<(operator?.id==="overclocker"?Math.max(1,(TIER_UP_COST[tier]||99)-3):(TIER_UP_COST[tier]||99))||(mode!=="pvp"&&tier===5&&!t6Unlocked)}>
                <Img src={ART.tier(Math.min(6,tier+1))} style={{width:18,height:18,objectFit:'contain'}}/>
                <span>{"T"+(tier+1)+" "+(operator?.id==="overclocker"?Math.max(1,(TIER_UP_COST[tier]||99)-3):(TIER_UP_COST[tier]||"--"))+"g"}</span></button>
            </div>

            {/* === CENTER INFO BAR — always present, horizontal === */}
            <div className={`info-bar ${(hovInfo||hovUnit)?'info-bar-vis':''}`}>
              {hovInfo?.type==='combo' ? (<>
                <div className="ib-identity">
                  <span className="ib-name" style={{background:`linear-gradient(90deg,${FACTIONS[hovInfo.factions[0]]?.color||'#888'},${FACTIONS[hovInfo.factions[1]]?.color||'#888'})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>{hovInfo.name}</span>
                  <span className="ib-tier" style={hovInfo.active?{color:'#44ff66',borderColor:'rgba(68,255,102,0.3)',background:'rgba(68,255,102,0.08)'}:{}}>{hovInfo.active?'ACTIVE':'NEED '+hovInfo.min[0]+'+'+hovInfo.min[1]}</span>
                </div>
                <span className="ib-desc">{hovInfo.desc}</span>
              </>) : hovInfo?.type==='mod' ? (<>
                <div className="ib-identity">
                  <span className="ib-name" style={{color:'#ffcc00'}}>{hovInfo.name}</span>
                  <span className="ib-tier" style={{color:'#ffcc00',borderColor:'rgba(255,204,0,0.3)',background:'rgba(255,204,0,0.08)'}}>MOD</span>
                </div>
                <span className="ib-desc">{hovInfo.desc}</span>
              </>) : hovInfo?.type==='breach' ? (<>
                <div className="ib-identity">
                  <span className="ib-name" style={{color:hovInfo.color}}>{hovInfo.name}</span>
                  <span className="ib-tier" style={{color:hovInfo.color,borderColor:hovInfo.color+'44',background:hovInfo.color+'11'}}>BREACH</span>
                </div>
                <span className="ib-desc">{hovInfo.desc}</span>
              </>) : hovInfo?.type==='faction' ? (<>
                <div className="ib-identity">
                  <span className="ib-name" style={{color:hovInfo.color}}>{hovInfo.name}</span>
                </div>
                <span className="ib-desc">{hovInfo.desc}</span>
              </>) : hovInfo?.type==='operator' ? (<>
                <div className="ib-identity">
                  <span className="ib-name" style={{color:hovInfo.color}}>{hovInfo.name}</span>
                </div>
                <span className="ib-desc">{hovInfo.desc}</span>
              </>) : hovUnit ? (<>
                <div className="ib-identity">
                  <Img src={ART.faction(hovUnit.faction)} className="ib-faction-icon"/>
                  <span className="ib-name" style={{color:FACTIONS[hovUnit.faction]?.color}}>{hovUnit.name}</span>
                  <span className="ib-tier">T{hovUnit.tier}</span>
                  {hovUnit.golden&&<span className="ib-golden">★ GOLDEN</span>}
                  {hovUnit.role&&ROLES[hovUnit.role]&&<span style={{color:ROLES[hovUnit.role].color,fontSize:'0.65rem',fontWeight:700}}>{ROLES[hovUnit.role].icon} {hovUnit.role}</span>}
                </div>
                <div className="ib-stats">
                  <span className="ib-atk">⚔{hovUnit.atk}</span>
                  <span className="ib-hp">❤{hovUnit.hp}/{hovUnit.maxHp}</span>
                  {hovUnit.shield>0&&<span className="ib-shield">🛡{hovUnit.shield}</span>}
                </div>
                {hovUnit.kw?.length>0&&<div className="ib-keywords">
                  {hovUnit.kw.map(k=>{const kd=KEYWORDS[k];return kd?(
                    <div key={k} className="ib-kw">
                      <span className="ib-kw-name">{kd.name}</span>
                      <span className="ib-kw-desc">{hovUnit.kwData?.[k]||kd.desc}</span>
                    </div>
                  ):null;})}
                </div>}
                {hovUnit.innate&&<div className="ib-innate">⚡ {hovUnit.innate}</div>}
                {hovUnit._chipFree&&<div className="ib-chipfree">🎲 CHIP MAGNET — Free chip applications</div>}
                {hovUnit.mod&&<div className="ib-mod">
                  <span className="ib-mod-name">{typeof hovUnit.mod==='object'?hovUnit.mod.name:hovUnit.mod}</span>
                </div>}
                {(hovUnit._lifetimeKills||0)>0&&<div className="ib-vet" style={{color:'#ff8866',fontSize:'0.6rem',marginTop:2}}>
                  💀 {hovUnit._lifetimeKills} kills{hovUnit._lifetimeKills>=3?` • Sell bounty: +${Math.floor(hovUnit._lifetimeKills/3)}g`:''}
                  {hovUnit._lifetimeKills>=10?' • ⭐⭐⭐ Veteran III':hovUnit._lifetimeKills>=6?' • ⭐⭐ Veteran II':hovUnit._lifetimeKills>=3?' • ⭐ Veteran I':''}
                  {(hovUnit._vetAtkBonus||hovUnit._vetHpBonus||hovUnit._vetDodge||hovUnit._vetBuffBonus)?
                    ` (${[hovUnit._vetAtkBonus?'+'+hovUnit._vetAtkBonus+' ATK':'',hovUnit._vetHpBonus?'+'+hovUnit._vetHpBonus+' HP':'',hovUnit._vetDodge?'+'+Math.round(hovUnit._vetDodge*100)+'% dodge':'',hovUnit._vetBuffBonus?'+'+hovUnit._vetBuffBonus+' team shield':''].filter(Boolean).join(', ')})`:''
                  }
                </div>}
              </>):(<span className="ib-hint">HOVER FOR INFO</span>)}
            </div>

            {/* BOARD DOCK — board + bench flush to bottom */}
            <div className="board-dock">

              {/* Board + Bench */}
              <div className="bottom-row">
                {/* HERO PORTRAIT — operator icon with HP + tier */}
                {operator&&<div className="hero-portrait"
                  onMouseEnter={()=>setHovInfo({type:'operator', name:operator.name, desc:operator.desc, flavor:operator.flavor, color:operator.color, icon:operator.icon, id:operator.id})}
                  onMouseLeave={()=>setHovInfo(null)}>
                  <div className="hero-ring" style={{borderColor:hp>20?'#00f0ff':hp>10?'#ffaa00':'#ff4444'}}>
                    <Img src={ART.op(operator.id)} alt={operator.name} className="hero-img"/>
                  </div>
                  <div className="hero-hp" style={{color:hp>20?'#44ff66':hp>10?'#ffaa00':'#ff4444'}}>
                    <Img src={ART.ui('hp_heart')} style={{width:16,height:16,objectFit:'contain'}}/> {hp}
                  </div>
                  <div className="hero-tier">
                    <Img src={ART.tier(tier)} style={{width:18,height:18,objectFit:'contain'}}/> T{tier}
                  </div>
                  <div className="hero-name">{operator.name}</div>
                </div>}

                {/* Board */}
                <div className={"board-section dnd-board"+(dropZone==="board"&&dragUnit?" dnd-drop-active":"")} style={{borderColor:reconView?"rgba(255,204,0,0.3)":"var(--cyan)33",transition:"border-color 0.2s"}}>
                  <div className="section-divider"><div className="line"/><span>{reconView?"⟐ ENEMY RECON":"YOUR ARENA ("+board.length+"/"+MAX_BOARD_SIZE+")"}</span><div className="line"/></div>
                  {!reconView && <div className="board-lane-labels"><span className="lane-label lane-front">🛡 FRONTLINE</span><span className="lane-label lane-back">BACKLINE 🗡</span></div>}
                  <div className="board-grid">
                    {reconView ? (
                      reconEnemy.length > 0 ? reconEnemy.map((u,idx)=>(
                        <Card key={u.id||idx} unit={u} sz="board" onHover={setHovUnit}/>
                      )) : <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"0.6rem",color:"#556",padding:20}}>Generating intel...</div>
                    ) : (<>
                    {board.map((u,idx)=>{
                      const synA = (fCounts[u.faction]||0)>=2;
                      const comA = activeCombos.some(cc=>cc.factions.includes(u.faction));
                      const isFront = idx <= 3;
                      const posLabel = isFront ? `F${idx+1}` : `B${idx-3}`;
                      return (<div key={u.id} style={{display:"contents"}}>
                        {idx === 4 && <div className="board-lane-divider"><span>│</span></div>}
                        <div className={"board-slot-wrap" + (isFront ? " slot-front" : " slot-back")} data-pos={posLabel} data-role={u.role||""}>
                          <Card unit={u} sz="board" synActive={synA} comboActive={comA} onDragStart={(e)=>handlePointerDown(e,u,"board")} _dragging={dragUnit?.id===u.id} _anyDrag={!!dragUnit} _tapSelected={tapSelected?.unit.id===u.id} onHover={setHovUnit}/>
                        </div>
                      </div>);
                    })}
                    {board.length<MAX_BOARD_SIZE&&Array.from({length:MAX_BOARD_SIZE-board.length}).map((_,i)=>{
                      const slotIdx = board.length + i;
                      const isFront = slotIdx <= 3;
                      const posLabel = isFront ? `F${slotIdx+1}` : `B${slotIdx-3}`;
                      return (<div key={`e-${i}`} style={{display:"contents"}}>
                        {slotIdx === 4 && <div className="board-lane-divider"><span>│</span></div>}
                        <div className={"board-slot-wrap" + (isFront ? " slot-front" : " slot-back")} data-pos={posLabel}>
                          <div className={"empty-slot"+(tapSelected?" tap-target":"")} onClick={()=>{
                            if(!tapSelected)return;
                            const prev=tapSelected;
                            if(prev.origin==='bench'&&board.length<MAX_BOARD_SIZE){
                              setBench(b=>b.filter(u=>u.id!==prev.unit.id));
                              setBoard(b=>[...b,prev.unit]);
                            }
                            setTapSelected(null);
                          }}><span className="empty-slot-text">+</span></div>
                        </div>
                      </div>);
                    })}                    </>)}
                  </div>
                </div>

                {/* Bench Pod */}
                <div className={"bench-pod dnd-bench"+(dropZone==="bench"&&dragUnit?" dnd-drop-active":"")}>
                  <div className="bench-pod-label">BENCH {bench.length}/{maxBench}</div>
                  <div className="bench-pod-slots">
                    {bench.map(u=>(
                      <div key={u.id} className={"bench-pod-unit"+(tapSelected?.unit.id===u.id?" tap-selected":"")} onPointerDown={(e)=>handlePointerDown(e,u,"bench")}
                        onMouseEnter={()=>setHovUnit(u)} onMouseLeave={()=>setHovUnit(null)}
                        style={{borderColor:FACTIONS[u.faction]?.color||"#888"}}>
                        <Img src={ART.unit(u.name,u.faction)} fallback={u.faction?.[0]||"U"} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        <div className="bench-pod-stats">
                          <span>{u.atk}</span><span>{u.hp}</span>
                        </div>
                        {u.golden&&<div className="bench-pod-golden">G</div>}
                      </div>
                    ))}
                    {bench.length<maxBench&&Array.from({length:maxBench-bench.length}).map((_,i)=>(
                      <div key={`be-${i}`} className={"bench-pod-empty"+(tapSelected?" tap-target":"")} onClick={()=>{
                        if(!tapSelected)return;
                        const prev=tapSelected;
                        if(prev.origin==='board'&&bench.length<maxBench){
                          setBoard(b=>b.filter(u=>u.id!==prev.unit.id));
                          setBench(b=>[...b,prev.unit]);
                        }
                        setTapSelected(null);
                      }}>+</div>))}
                  </div>
                </div>
              </div>{/* end bottom-row */}

            </div>{/* end board-dock */}

          </div>{/* end game-center */}

          {/* RIGHT SIDEBAR */}
          <aside className="sidebar-right">
            <ComboSidebar onHover={setHovInfo} activeCombos={activeCombos}/>
            {tier>=4&&<div className="mastery-panel">
              <div className="sb-title" style={{marginTop:6,fontSize:'0.7rem'}}>T6 MASTERY {t6Unlocked?"UNLOCKED":"("+masteryCount+"/5)"}</div>
              <div className="mastery-list">
                <div className={"mastery-item"+(mastery.winStreak3?" mastery-done":"")}><span className="mastery-dot"/><span>Win 3 in a row</span></div>
                <div className={"mastery-item"+(mastery.crossCombo?" mastery-done":"")}><span className="mastery-dot"/><span>Activate a cross-combo</span></div>
                <div className={"mastery-item"+(mastery.tripleUnit?" mastery-done":"")}><span className="mastery-dot"/><span>Triple a unit</span></div>
                {mode==="pvp"
                  ?<div className={"mastery-item"+(mastery.faction4?" mastery-done":"")}><span className="mastery-dot"/><span>4 units same faction</span></div>
                  :<div className={"mastery-item"+(mastery.bossSurvived?" mastery-done":"")}><span className="mastery-dot"/><span>Survive a boss round</span></div>}
                <div className={"mastery-item"+(mastery.banked10?" mastery-done":"")}><span className="mastery-dot"/><span>Bank 10+ gold</span></div>
              </div>
            </div>}
          </aside>

        </div>
      )}
    {showAudit && <AssetAudit onClose={()=>setShowAudit(false)}/>}
    </div>
  );
}



