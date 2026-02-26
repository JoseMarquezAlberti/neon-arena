const UNITS_DATA = require('../data/units.json');
const T7_UNITS_DATA = require('../data/t7-units.json');
const MODS = require('../data/mods.json');
const KEYWORDS = require('../data/keywords.json');
const CROSS_COMBOS = require('../data/combos.json');
const CONFIG = require('../data/config.json');
const ABILITY_MAP = require("../data/unit-abilities.json");
const { setupInnateFlags, setAbilityMap } = require("./AbilitySystem.js");
// ═══ DATA IMPORTS (Phase 1: Single Source of Truth) ═══







const MAX_BOARD_SIZE = CONFIG.maxBoardSize;

// Map JSON to internal short format
const U = UNITS_DATA.map(u => ({
  name: u.name, f: u.faction, t: u.tier, a: u.atk, h: u.hp, e: u.emoji,
  kw: [...u.keywords], kwData: { ...u.kwData }, innate: u.innate || '',
  _chipFree: u.chipFree || false
}));

const T7_UNITS = T7_UNITS_DATA.map(u => ({
  name: u.name, f: u.faction, t: u.tier, a: u.atk, h: u.hp, e: u.emoji,
  kw: [...u.keywords], kwData: { ...u.kwData },
  _t7rule: u.t7rule || null
}));


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
    innate: tmpl.innate || null };
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

function genEnemy(round) {
  const tier = Math.min(6, round <= 3 ? 1 : Math.ceil(round / 3) + 1);
  const count = Math.min(MAX_BOARD_SIZE, 2 + Math.floor(round * 0.7));
  const result = [];
  for (let i = 0; i < count; i++) {
    const pool = unitPool.getAvailablePool(tier);
    if (pool.length === 0) break;
    const t = pool[Math.floor(Math.random() * pool.length)];
    unitPool.take(t.name);
    const u = mkUnit(t, Math.random() < round * 0.04);
    if (round > 3 && Math.random() < Math.min(0.6, 0.15 + round * 0.025)) {
      u.mod = MODS[Math.floor(Math.random() * MODS.length)];
      if (u.mod.effect.atk) u.atk += u.mod.effect.atk;
      if (u.mod.effect.hp) { u.hp += u.mod.effect.hp; u.maxHp += u.mod.effect.hp; }
      if (u.mod.effect.shield) u.shield += u.mod.effect.shield;
    }
    result.push(u);
  }
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

// ═══ ABILITY SYSTEM (Phase 2: Data-driven, no regex) ═══


setAbilityMap(ABILITY_MAP);


// === COMBAT ENGINE WITH KEYWORDS ===
function simCombat(pOrig, eOrig, op=null, netEvt=null) {
  const snap = (p, e) => ({ pBoard: p.map(u => ({ ...u, kw: [...u.kw], kwData: { ...u.kwData } })), eBoard: e.map(u => ({ ...u, kw: [...u.kw], kwData: { ...u.kwData } })) });
  const events = [];
  const pDead = []; // Track dead player units for Resummon effects
  const eDead = []; // Track dead enemy units for Resummon effects

  let pBoard = pOrig.map(u => ({ ...u, kw: [...(u.kw||[])], kwData: { ...(u.kwData||{}) }, shield: u.shield || 0, hardshellActive: (u.kw||[]).includes("hardshell") }));
  let eBoard = eOrig.map(u => ({ ...u, kw: [...(u.kw||[])], kwData: { ...(u.kwData||{}) }, shield: u.shield || 0, hardshellActive: (u.kw||[]).includes("hardshell") }));

  // 1. Faction buffs (v5: unique win conditions, not stat buffs)
  let pVirusBleed = 0; // Tracks direct player damage from Virus deaths
  let eVirusBleed = 0;
  let pGoldEarned = 0; // Gold earned from Ransomware kills
  let eGoldEarned = 0;
  const applyFaction = (board, enemyBoard, side) => {
    const c = {};
    board.forEach(u => { c[u.faction] = (c[u.faction] || 0) + 1; });
    // Wildcard units (Merc For Hire) count as +1 for EVERY faction present
    // Note: _wildcard flag is set by setupInnateFlags which runs AFTER this,
    // so we check ABILITY_MAP directly for wildcard units
    const wildcardCount = board.filter(u => {
      const tn = u.tn || u.name.replace(/^Golden /, '');
      const ab = ABILITY_MAP[tn];
      return u._wildcard || (ab && ab.flags && ab.flags.wildcard);
    }).length;
    if (wildcardCount > 0) {
      ["SYNTH","HACKER","AUGMENTED","DRONE","PSIONIC","VIRUS","PHANTOM","CONSTRUCT"].forEach(f => {
        if (c[f]) c[f] += wildcardCount; // Only boost factions already on board
      });
    }

    // NEUTRAL — Wildcard: Neutral units count toward ALL other faction thresholds
    // Only boosts factions that already have at least 1 real (non-Neutral) unit
    if (c.NEUTRAL >= 1) {
      const neutralCount = c.NEUTRAL;
      Object.keys(c).forEach(f => {
        if (f !== "NEUTRAL" && c[f] > 0) c[f] = c[f] + neutralCount;
      });
    }
    // NEUTRAL combat bonus: Adaptable fighters
    if (c.NEUTRAL >= 3) {
      board.filter(u => u.faction === "NEUTRAL").forEach(u => { u.atk += 2; u.hp += 1; u.maxHp += 1; });
      events.push({ type: "announce", side, msg: `⚪ Neutral 3+: Neutrals gain +2/+1`, ...snap(pBoard, eBoard) });
    }

    // SYNTH — The Engine: scaling per attack in combat
    if (c.SYNTH >= 2) {
      const tier = c.SYNTH >= 6 ? 3 : c.SYNTH >= 4 ? 2 : 2;
      board.filter(u => u.faction === "SYNTH").forEach(u => {
        u._synthScale = tier; // +tier ATK per attack (at 4+: +HP too)
        // (4+) Frontloaded shield for survivability
        if (c.SYNTH >= 4) u.shield = (u.shield || 0) + (c.SYNTH >= 6 ? 6 : 4);
      });
      // (4) Combat timer extension handled in combat loop via extra turns
      if (c.SYNTH >= 4) board._synthExtraTurns = 10;
      if (c.SYNTH >= 6) board._synthExtraTurns = 20;
      const desc = c.SYNTH >= 6 ? "Synth 6: +3/+3 per attack, +6 Shield, +20 turns" : c.SYNTH >= 4 ? "Synth 4: +2/+2 per attack, +4 Shield, +10 turns" : "Synth 2: +2 ATK per attack";
      events.push({ type: "announce", side, msg: `⚙️ ${desc}`, ...snap(pBoard, eBoard) });
    }

    // HACKER — The Saboteur: steal ATK + silence keywords + survivability
    if (c.HACKER >= 2) {
      const stealPerHacker = c.HACKER >= 6 ? 3 : c.HACKER >= 4 ? 2 : 2;
      const hpBuff = c.HACKER >= 6 ? 5 : c.HACKER >= 4 ? 4 : 3;
      // Each hacker steals from a random enemy
      const hackers = board.filter(u => u.faction === "HACKER");
      const enemies = enemyBoard.filter(u => u.atk > 0);
      let totalStolen = 0;
      hackers.forEach(h => {
        // HP buff for survivability
        h.hp += hpBuff; h.maxHp += hpBuff;
        if (enemies.length === 0) return;
        const victim = enemies[Math.floor(Math.random() * enemies.length)];
        const steal = Math.min(stealPerHacker, victim.atk);
        victim.atk -= steal;
        h.atk += steal;
        totalStolen += steal;
      });
      // (4+) Silence random enemy keywords — more silences at higher tiers
      if (c.HACKER >= 4) {
        const silenceCount = c.HACKER >= 6 ? 3 : 2;
        const kwEnemies = enemyBoard.filter(u => u.kw.length > 0);
        for (let s = 0; s < silenceCount && kwEnemies.length > 0; s++) {
          const target = kwEnemies[Math.floor(Math.random() * kwEnemies.length)];
          if (target.kw.length > 0) {
            const removedKw = target.kw.splice(Math.floor(Math.random() * target.kw.length), 1)[0];
            target._silenced = true;
            events.push({ type: "hack", side, msg: `Hackers silenced ${target.name}'s ${removedKw}!`, ...snap(pBoard, eBoard) });
          }
        }
      }
      // (6) Double damage to silenced/keyword-less units
      if (c.HACKER >= 6) {
        board.filter(u => u.faction === "HACKER").forEach(u => { u._doubleDmgSilenced = true; });
      }
      if (totalStolen > 0) {
        events.push({ type: "hack", side, msg: `Hackers stole ${totalStolen} ATK across ${hackers.length} units!`, ...snap(pBoard, eBoard) });
      }
      const desc = c.HACKER >= 6 ? `Hacker 6: Steal ${stealPerHacker}/hacker, +${hpBuff} HP, silence ×3, 2× dmg` : c.HACKER >= 4 ? `Hacker 4: Steal ${stealPerHacker}/hacker, +${hpBuff} HP, silence ×2` : `Hacker 2: Steal ${stealPerHacker} ATK/hacker, +${hpBuff} HP`;
      events.push({ type: "announce", side, msg: `🔓 ${desc}`, ...snap(pBoard, eBoard) });
    }

    // VIRUS — The Plague: bleed damage to enemy player on Virus death + survivability
    if (c.VIRUS >= 2) {
      const bleedPerDeath = c.VIRUS >= 6 ? 2 : c.VIRUS >= 4 ? 1 : 1;
      const hpBuff = c.VIRUS >= 6 ? 3 : c.VIRUS >= 4 ? 2 : 2;
      board.filter(u => u.faction === "VIRUS").forEach(u => {
        u._virusBleed = bleedPerDeath;
        u.hp += hpBuff; u.maxHp += hpBuff;
        if (c.VIRUS >= 4) u._virusDeathAtk = 1;
        if (c.VIRUS >= 6) u._virusPermanentDebuff = true;
      });
      const desc = c.VIRUS >= 6 ? `Virus 6: ${bleedPerDeath} bleed/death, +${hpBuff} HP, +1 ATK on death, debuff` : c.VIRUS >= 4 ? `Virus 4: ${bleedPerDeath} bleed/death, +${hpBuff} HP, +1 ATK on death` : `Virus 2: ${bleedPerDeath} bleed/death, +${hpBuff} HP`;
      events.push({ type: "announce", side, msg: `🦠 ${desc}`, ...snap(pBoard, eBoard) });
    }

    // DRONE — The Swarm: multi-attack + frontloaded stats + death synergy
    if (c.DRONE >= 2) {
      const atkBuff = c.DRONE >= 6 ? 2 : c.DRONE >= 4 ? 1 : 1;
      const hpBuff = c.DRONE >= 6 ? 3 : c.DRONE >= 4 ? 3 : 2;
      board.filter(u => u.faction === "DRONE").forEach(u => {
        u._droneMultiAtk = c.DRONE >= 4 ? 3 : 2;
        u.atk += atkBuff; u.hp += hpBuff; u.maxHp += hpBuff;
        if (c.DRONE >= 4) u._droneDeathBuff = true;
      });
      if (c.DRONE >= 6) {
        board.filter(u => u.faction === "DRONE").forEach(u => { u.atk += 2; u.hp += 2; u.maxHp += 2; });
      }
      const desc = c.DRONE >= 6 ? `Drone 6: 3× atk, +${atkBuff+2}/+${hpBuff+2}, death buff` : c.DRONE >= 4 ? `Drone 4: 3× atk, +${atkBuff}/+${hpBuff}, death buff` : `Drone 2: 2× atk, +${atkBuff}/+${hpBuff}`;
      events.push({ type: "announce", side, msg: `🛸 ${desc}`, ...snap(pBoard, eBoard) });
    }

    // PHANTOM — The Ghost: dodge + assassination + scaling + HP buff
    if (c.PHANTOM >= 2) {
      const fullDodge = c.PHANTOM >= 6 ? 0.50 : c.PHANTOM >= 4 ? 0.42 : 0.33;
      const allyDodge = c.PHANTOM >= 6 ? 0.25 : c.PHANTOM >= 4 ? 0.20 : 0.20;
      const bonusDmg = c.PHANTOM >= 6 ? 8 : c.PHANTOM >= 4 ? 6 : 5;
      const dodgeAtkGain = c.PHANTOM >= 6 ? 4 : c.PHANTOM >= 4 ? 3 : 2;
      const hpBuff = c.PHANTOM >= 6 ? 4 : c.PHANTOM >= 4 ? 3 : 3;
      board.forEach(u => {
        const isPhantom = u.faction === "PHANTOM";
        u._dodgeChance = Math.min(0.50, (u._dodgeChance || 0) + (isPhantom ? fullDodge : allyDodge));
        if (isPhantom) {
          u.hp += hpBuff; u.maxHp += hpBuff;
          u._phantomBonusDmg = bonusDmg; // extra true damage on each attack
          u._dodgeAtkGain = Math.max(u._dodgeAtkGain || 0, dodgeAtkGain);
          if (c.PHANTOM >= 4) u._assassinTarget = true;
          if (c.PHANTOM >= 6) u._phantomStealthOnKill = true;
        }
      });
      const desc = c.PHANTOM >= 6 ? `Phantom 6: 50% dodge, +${bonusDmg} dmg, +${dodgeAtkGain} ATK/dodge, +${hpBuff} HP, stealth` : c.PHANTOM >= 4 ? `Phantom 4: 42% dodge, +${bonusDmg} dmg, +${dodgeAtkGain} ATK/dodge, +${hpBuff} HP, assassinate` : `Phantom 2: 33% dodge, +${bonusDmg} dmg, +${dodgeAtkGain} ATK/dodge, +${hpBuff} HP`;
      events.push({ type: "announce", side, msg: `👻 ${desc}`, ...snap(pBoard, eBoard) });
    }

    // PSIONIC — The Barrier: shields + stun on shield break
    if (c.PSIONIC >= 2) {
      let shieldAmt = c.PSIONIC >= 6 ? 3 : c.PSIONIC >= 4 ? 3 : 2;
      // Mind Lord: double all Psionic shield effects
      if (board.some(u => u._doublePsionicShields)) shieldAmt *= 2;
      board.forEach(u => {
        u.shield = (u.shield || 0) + shieldAmt;
        if (c.PSIONIC >= 6) u._stunOnShieldBreak = 2.0;
        if (c.PSIONIC >= 6) u._shieldRegen = board.some(u2 => u2._doublePsionicShields) ? 2 : 1;
      });
      const desc = c.PSIONIC >= 6 ? `Psionic 6: +${shieldAmt} Shield, stun on break, regen` : c.PSIONIC >= 4 ? `Psionic 4: +${shieldAmt} Shield to all` : `Psionic 2: +${shieldAmt} Shield to all`;
      events.push({ type: "announce", side, msg: `🔮 ${desc}`, ...snap(pBoard, eBoard) });
    }

    // AUGMENTED — The Titan: carry voltron + team support
    if (c.AUGMENTED >= 2) {
      const augUnits = board.filter(u => u.faction === "AUGMENTED").sort((a, b) => b.atk - a.atk);
      if (augUnits.length > 0) {
        const carry = augUnits[0];
        const carryBuff = c.AUGMENTED >= 6 ? 5 : c.AUGMENTED >= 4 ? 3 : 2;
        const teamBuff = c.AUGMENTED >= 6 ? 2 : c.AUGMENTED >= 4 ? 1 : 1;
        // Carry gets big buffs
        carry.atk += carryBuff; carry.hp += carryBuff; carry.maxHp += carryBuff;
        carry._augCarry = true;
        // All other Augmented get smaller buffs
        augUnits.slice(1).forEach(u => {
          u.atk += teamBuff; u.hp += teamBuff; u.maxHp += teamBuff;
        });
        if (c.AUGMENTED >= 4 && !carry.kw.includes("cleave")) carry.kw.push("cleave");
        if (c.AUGMENTED >= 6) {
          carry._dmgReduction = 0.20; // 20% damage reduction
          carry._regen = Math.max(carry._regen || 0, 2); // Regen 2 HP/turn
          // All other allies gain Aggro Lock to protect carry
          board.filter(u => u.id !== carry.id).forEach(u => {
            if (!u.kw.includes("taunt")) u.kw.push("taunt");
          });
        }
        const desc = c.AUGMENTED >= 6 ? `Aug 6: ${carry.name} +${carryBuff}/+${carryBuff}, Cleave, 20% DR, Regen, team +${teamBuff}` : c.AUGMENTED >= 4 ? `Aug 4: ${carry.name} +${carryBuff}/+${carryBuff}, Cleave, team +${teamBuff}` : `Aug 2: ${carry.name} +${carryBuff}/+${carryBuff}, team +${teamBuff}`;
        events.push({ type: "announce", side, msg: `🦾 ${desc}`, ...snap(pBoard, eBoard) });
      }
    }

    // CONSTRUCT — The Fortress: permanent scaling + hardshell + immediate HP
    if (c.CONSTRUCT >= 2) {
      const immHP = c.CONSTRUCT >= 6 ? 5 : c.CONSTRUCT >= 4 ? 3 : 2;
      board.filter(u => u.faction === "CONSTRUCT").forEach(u => {
        // Apply stored scaling from prior combats
        const cb = u._constructBonus || 0;
        u.atk += cb; u.hp += cb; u.maxHp += cb;
        // Immediate HP buff for survivability
        u.hp += immHP; u.maxHp += immHP;
        // Earn scaling amount for AFTER this combat — doubled rates
        u._constructScaleRate = c.CONSTRUCT >= 6 ? 3 : c.CONSTRUCT >= 4 ? 2 : 2;
        // (4+) Hardshell at combat start
        if (c.CONSTRUCT >= 4) u.hardshellActive = true;
        // (6) Cannot be one-shot (survives at 1 HP once per combat) — removed HP > 20 gate
        if (c.CONSTRUCT >= 6) u._constructSurvive = true;
      });
      const scaleRate = c.CONSTRUCT >= 6 ? 3 : c.CONSTRUCT >= 4 ? 2 : 2;
      const desc = c.CONSTRUCT >= 6 ? `Construct 6: +${scaleRate}/round, +${immHP} HP, Hardshell, survive lethal` : c.CONSTRUCT >= 4 ? `Construct 4: +${scaleRate}/round, +${immHP} HP, Hardshell` : `Construct 2: +${scaleRate}/round, +${immHP} HP`;
      events.push({ type: "announce", side, msg: `🏛️ ${desc}`, ...snap(pBoard, eBoard) });
    }

    return c;
  };
  // Pre-set flags that affect faction threshold processing
  // (setupInnateFlags runs later, but these flags need to be available during applyFaction)
  const EARLY_FLAGS = { doublePsionicShields: true, doubleSynthLinks: true, doubleSynthInnate: true };
  [...pBoard, ...eBoard].forEach(u => {
    const entry = ABILITY_MAP[u.tn || u.name.replace(/^Golden /, '')];
    if (!entry?.flags) return;
    Object.keys(EARLY_FLAGS).forEach(f => {
      if (entry.flags[f]) u['_' + f] = entry.flags[f];
    });
  });
  const pCounts = applyFaction(pBoard, eBoard, "player");
  const eCounts = applyFaction(eBoard, pBoard, "enemy");
  // Operator combat hooks
  if(op){
    if(op.id==="ironclad") pBoard.forEach(u=>{ u.shield=(u.shield||0)+Math.max(1,Math.floor(u.maxHp*0.15)); });
    if(op.id==="overclocker") pBoard.forEach(u=>{ u.hp=Math.max(1,u.hp-2);u.maxHp=Math.max(1,u.maxHp-2); });
  }
  // Network event combat hooks
  if(netEvt){
    if(netEvt.id==="firewall_breach"){ pBoard.forEach(u=>{u.shield=0;u.hardshellActive=false;}); eBoard.forEach(u=>{u.shield=0;u.hardshellActive=false;}); }
    if(netEvt.id==="power_outage"){ pBoard.forEach(u=>{u.atk=Math.max(0,u.atk-2);}); eBoard.forEach(u=>{u.atk=Math.max(0,u.atk-2);}); }
    if(netEvt.id==="arms_race"){ pBoard.forEach(u=>{u.atk+=3;u.hp+=3;u.maxHp+=3;}); eBoard.forEach(u=>{u.atk+=3;u.hp+=3;u.maxHp+=3;}); }
    if(netEvt.id==="quantum_flux"){ pBoard.sort(()=>Math.random()-0.5); eBoard.sort(()=>Math.random()-0.5); }
    if(netEvt.id==="static_field"){ pBoard.forEach(u=>{u.kw=[];u.kwData={};}); eBoard.forEach(u=>{u.kw=[];u.kwData={};}); }
  }

  // 2. Cross-faction combos
  const applyCombo = (board, counts, enemyBoard, side) => {
    CROSS_COMBOS.forEach(cc => {
      const [f1, f2] = cc.factions;
      if ((counts[f1] || 0) >= cc.min[0] && (counts[f2] || 0) >= cc.min[1]) {
        const eff = cc.effect;
        if (eff.targetFaction) board.filter(u => u.faction === eff.targetFaction).forEach(u => { u.atk += eff.atk || 0; });
        if (eff.allHp) board.forEach(u => { u.hp += eff.allHp; u.maxHp += eff.allHp; });
        if (eff.allAtk) board.forEach(u => { u.atk += eff.allAtk; });
        // Quantum Link: defer shield doubling until after ALL shields are applied
        if (eff.doubleShields) board._pendingDoubleShields = true;
        if (eff.debuffStrongest && enemyBoard.length > 0) {
          const strongest = [...enemyBoard].sort((a, b) => b.atk - a.atk)[0];
          if (strongest) strongest.atk = Math.max(0, strongest.atk - eff.debuffStrongest);
        }
        if (eff.droneFirstMalware) board.filter(u => u.faction === "DRONE").forEach(u => { u.droneFirstMalware = true; });
        // Bioweapon: malware attacks also reduce target ATK
        if (eff.malwareDebuff) board.forEach(u => { if (u.kw.includes("malware")) u._malwareDebuff = eff.malwareDebuff; });
        // Phase Strike: faction gains dodge chance
        if (eff.factionDodge) board.filter(u => u.faction === eff.factionDodge.faction).forEach(u => { u._dodgeChance = Math.min(0.45, (u._dodgeChance || 0) + eff.factionDodge.chance); });
        // Recursive Build: Constructs get +1 extra scaling bonus
        if (eff.doubleConstruct) board.filter(u => u.faction === "CONSTRUCT").forEach(u => { u.atk += 1; u.hp += 1; u.maxHp += 1; });
        // Ghost Network: shields grant dodge
        if (eff.shieldDodge) board.forEach(u => { u._shieldDodge = true; });
        // Swarm Protocol: flag so dead Virus units spawn a Drone
        if (eff.virusSpawnDrone) board.forEach(u => { if (u.faction === "VIRUS") u._virusSpawnDrone = true; });
        // Siege Engine: Constructs gain Cleave keyword
        if (eff.constructCleave) board.filter(u => u.faction === "CONSTRUCT").forEach(u => { if (!u.kw.includes("cleave")) u.kw.push("cleave"); });
        // Digital Plague: flag Virus overflow to ignore shields
        if (eff.overflowIgnoreShield) board.filter(u => u.faction === "VIRUS").forEach(u => { u._overflowIgnoreShield = true; });
        // Shadow Swarm: Drones start stealthed
        if (eff.droneStealth) board.filter(u => u.faction === "DRONE").forEach(u => { u._droneStealth = true; });
        events.push({ type: "combo", side, name: cc.name, icon: cc.icon, desc: cc.desc, ...snap(pBoard, eBoard) });
      }
    });
  };
  applyCombo(pBoard, pCounts, eBoard, "player");
  applyCombo(eBoard, eCounts, pBoard, "enemy");

  // 2b. Wire innate effects → combat flags
  setupInnateFlags(pBoard, eBoard);
  setupInnateFlags(eBoard, pBoard);

  // Wire innate text for combat-start announcements
  // setupInnateFlags sets _innateStart for 22 combat-start-specific innates;
  // set it from unit.innate for ALL remaining units so they get announced too
  [...pBoard, ...eBoard].forEach(u => {
    if (!u._innateStart && u.innate) u._innateStart = u.innate;
  });

  // 2c. Post-setup fixup: Bioweapon malwareDebuff for units that gained malware from autoKeywords
  // (Combos run before setupInnateFlags, so Ghost Protocol etc. didn't have malware yet)
  const fixBioweapon = (board, counts) => {
    // Check if Bioweapon combo is active (VIRUS+HACKER both >= 2)
    if ((counts.VIRUS || 0) < 2 || (counts.HACKER || 0) < 2) return;
    const debuffAmt = 3; // Bioweapon effect amount
    board.forEach(u => {
      if (u.kw.includes("malware") && !u._malwareDebuff) {
        u._malwareDebuff = debuffAmt;
      }
    });
  };
  fixBioweapon(pBoard, pCounts);
  fixBioweapon(eBoard, eCounts);

  // 2d. Drone HP Pool (The Motherbrain): combine all drone HP into shared pool
  const applyDronePool = (board) => {
    if (!board.some(u => u._droneHpPool)) return;
    const drones = board.filter(u => u.faction === "DRONE" && u.hp > 0);
    if (drones.length <= 1) return;
    const totalHp = drones.reduce((s, u) => s + u.hp, 0);
    const perDrone = Math.floor(totalHp / drones.length);
    const remainder = totalHp - perDrone * drones.length;
    drones.forEach((u, i) => {
      u.hp = perDrone + (i === 0 ? remainder : 0);
      u.maxHp = u.hp;
    });
    // Enable damage sharing so the pool stays balanced
    drones.forEach(u => { u._droneShareDmg = true; });
  };
  applyDronePool(pBoard);
  applyDronePool(eBoard);

  // 3. (Hacker debuff now handled inside applyFaction)

  // 4. Link buffs
  const applyLinks = (board) => {
    for (let i = 0; i < board.length; i++) {
      const u = board[i];
      if (!u.kw.includes("link")) continue;
      const left = i > 0 ? board[i - 1] : null;
      const right = i < board.length - 1 ? board[i + 1] : null;
      const d = u.kwData.link || "";
      const atkMatch = d.match(/\+(\d+)\s*ATK/i);
      const hpMatch = d.match(/\+(\d+).*HP/i) || d.match(/\+\d+\/\+(\d+)/);
      const shieldMatch = d.match(/\+(\d+)\s*Shield/i);
      const atkBuff = atkMatch ? parseInt(atkMatch[1]) : 0;
      const comboMatch = d.match(/\+(\d+)\/\+(\d+)/);
      const atkB = comboMatch ? parseInt(comboMatch[1]) : atkBuff;
      const hpB = comboMatch ? parseInt(comboMatch[2]) : (hpMatch ? parseInt(hpMatch[1]) : 0);
      const shieldB = shieldMatch ? parseInt(shieldMatch[1]) : 0;
      const droneLinkOnly = d.toLowerCase().includes("drone");
      [left, right].filter(Boolean).forEach(n => {
        if (droneLinkOnly && n.faction !== "DRONE") return;
        n.atk += atkB; n.hp += hpB; n.maxHp += hpB; n.shield += shieldB;
      });
    }
  };
  applyLinks(pBoard);
  applyLinks(eBoard);

  // 4b. (v5 Protocol Chips removed in v6 — keywords are now chips in shop)

  // 4c. T7 Rule-Breaker pre-combat hooks
  const hasT7 = (board, rule) => board.some(u => u._t7rule === rule);
  // Zero Point: silence ALL enemy keywords for this combat
  if (hasT7(pBoard, "silenceAll")) { eBoard.forEach(u => { u.kw = []; u.kwData = {}; u.hardshellActive = false; }); events.push({ type: "announce", msg: "⚡ ZERO POINT: All enemy keywords SILENCED!" }); }
  if (hasT7(eBoard, "silenceAll")) { pBoard.forEach(u => { u.kw = []; u.kwData = {}; u.hardshellActive = false; }); events.push({ type: "announce", msg: "⚡ ZERO POINT: All your keywords SILENCED!" }); }
  // Ascendant: triple all shields
  if (hasT7(pBoard, "tripleShields")) { pBoard.forEach(u => { u.shield = (u.shield || 0) * 3; }); }
  if (hasT7(eBoard, "tripleShields")) { eBoard.forEach(u => { u.shield = (u.shield || 0) * 3; }); }
  // War Engine: 40% damage reduction flag + mark as 3x attacker
  [...pBoard, ...eBoard].filter(u => u._t7rule === "tripleSlotBoss").forEach(u => { u._dmgReduction = 0.4; u._droneMultiAtk = 3; if (!u.kw.includes("cleave")) u.kw.push("cleave"); if (!u.kw.includes("splash")) u.kw.push("splash"); });
  // Colossus: immune to all effects flag
  [...pBoard, ...eBoard].filter(u => u._t7rule === "immuneToAll").forEach(u => { u._immune = true; });
  // Quantum Apex: flag synths for 3x scaling
  if (hasT7(pBoard, "synthTripleScale")) { pBoard.filter(u => u.faction === "SYNTH").forEach(u => { u._synthScaleMultiplier = 3; }); }
  if (hasT7(eBoard, "synthTripleScale")) { eBoard.filter(u => u.faction === "SYNTH").forEach(u => { u._synthScaleMultiplier = 3; }); }
  // Patient Zero: double virus bleed
  if (hasT7(pBoard, "virusDoubleBleed")) { pBoard._virusBleedMultiplier = 2; }
  if (hasT7(eBoard, "virusDoubleBleed")) { eBoard._virusBleedMultiplier = 2; }
  // Hivemind: merge all Drone HP into shared pool
  const setupHive = (board) => {
    if (!hasT7(board, "droneHiveHP")) return;
    const drones = board.filter(u => u.faction === "DRONE");
    const totalHP = drones.reduce((s, u) => s + u.hp, 0);
    drones.forEach(u => { u._hiveHP = totalHP; u._hiveTotal = totalHP; });
  };
  setupHive(pBoard); setupHive(eBoard);

  // 5. Init Protocols
  const fireInit = (board, enemy, side) => {
    board.forEach(u => {
      if (!u.kw.includes("initprot")) return;
      const d = u.kwData.initprot || "";
      if (d.includes("Heal all")) { const m = d.match(/(\d+)/); const amt = m ? parseInt(m[1]) : 2; board.forEach(a => { a.hp = Math.min(a.maxHp, a.hp + amt); }); }
      if (d.includes("ATK to all allies") || d.includes("ATK to all al")) { const m = d.match(/\+(\d+)/); const amt = m ? parseInt(m[1]) : 2; board.forEach(a => { a.atk += amt; }); }
      if (d.includes("Deal") && d.includes("all enemies")) { const m = d.match(/(\d+)/); const amt = m ? parseInt(m[1]) : 2; enemy.forEach(e => { e.hp -= amt; }); }
      if (d.includes("Deal") && d.includes("random enemy")) { const m = d.match(/(\d+)/); const amt = m ? parseInt(m[1]) : 1; if (enemy.length > 0) { const t = enemy[Math.floor(Math.random() * enemy.length)]; t.hp -= amt; } }
      if (d.includes("ATK to all Synths")) { const m = d.match(/\+(\d+)/); const amt = m ? parseInt(m[1]) : 2; board.filter(a => a.faction === "SYNTH").forEach(a => { a.atk += amt; }); }
      if (d.includes("ATK to all Augmented")) { const m = d.match(/\+(\d+)/); const amt = m ? parseInt(m[1]) : 3; board.filter(a => a.faction === "AUGMENTED").forEach(a => { a.atk += amt; }); }
      if (d.includes("ATK to random enemy")) { const m = d.match(/(\d+)/); const amt = m ? parseInt(m[1]) : 2; if (enemy.length > 0) { const t = enemy[Math.floor(Math.random() * enemy.length)]; t.atk = Math.max(0, t.atk - amt); } }
      if (d.includes("ATK to ALL enemies") || d.includes("ATK to all enemies")) { const m = d.match(/(\d+)/); const amt = m ? parseInt(m[1]) : 1; enemy.forEach(e => { e.atk = Math.max(0, e.atk - amt); }); }
      if (d.includes("Shield to all")) { const m = d.match(/\+(\d+)/); const amt = m ? parseInt(m[1]) : 2; board.forEach(a => { a.shield += amt; }); }
      if (d.includes("Shield to self")) { const m = d.match(/\+(\d+)/); const amt = m ? parseInt(m[1]) : 1; u.shield += amt; }
      if (d.includes("ATK to self")) { const m = d.match(/\+(\d+)/); const amt = m ? parseInt(m[1]) : 1; u.atk += amt; }
      if (d.includes("ATK to strongest enemy")) { const m = d.match(/(\d+)/); const amt = m ? parseInt(m[1]) : 2; if (enemy.length > 0) { const s = [...enemy].sort((a, b) => b.atk - a.atk)[0]; s.atk = Math.max(0, s.atk - amt); } }
      if (d.includes("Steal") && d.includes("ATK from strongest")) { const m = d.match(/(\d+)/); const amt = m ? parseInt(m[1]) : 2; if (enemy.length > 0) { const s = [...enemy].sort((a, b) => b.atk - a.atk)[0]; s.atk = Math.max(0, s.atk - amt); u.atk += amt; } }
      if (d.includes("Hardshell")) { board.forEach(a => { a.hardshellActive = true; }); }
      events.push({ type: "initprot", side, unitId: u.id, unitName: u.name, unitEmoji: u.emoji, msg: `${u.name}: ${d}`, ...snap(pBoard, eBoard) });
    });
  };
  fireInit(pBoard, eBoard, "player");
  fireInit(eBoard, pBoard, "enemy");

  // 5b. Innate combat-start effects (not covered by initprot keyword)
  const fireInnateStart = (board, enemy, side) => {
    // Mainframe: all Synth buffs to neighbors are doubled
    const synthLinkMult = board.some(u => u._doubleSynthLinks) ? 2 : 1;
    board.forEach((u, idx) => {
      const inn = u._innateStart || "";
      if (!inn) return;
      const lo = inn.toLowerCase();
      // Multiplier: apply to Synth neighbor buffs only
      const isSynth = u.faction === "SYNTH";
      const neighborMult = isSynth ? synthLinkMult : 1;

      // ── ALL ALLIES GAIN +X/+Y ──
      if (lo.includes("all allies gain") && lo.includes("/+")) {
        const m = inn.match(/\+(\d+)\/\+(\d+)/);
        if(m){ const ba=parseInt(m[1]),bh=parseInt(m[2]); board.forEach(a=>{a.atk+=ba;a.hp+=bh;a.maxHp+=bh;}); }
      }
      // ── ALL ALLIES GAIN +1/+1 (no slash parse needed) ──
      else if (lo.includes("all allies gain +1/+1")) {
        board.forEach(a=>{a.atk+=1;a.hp+=1;a.maxHp+=1;});
      }
      // ── ALL ENEMIES LOSE ATK ──
      else if (lo.includes("all enemies lose") && lo.includes("atk")) {
        const m = inn.match(/(\d+)\s*ATK/i); const amt = m ? parseInt(m[1]) : 2;
        enemy.forEach(e => { e.atk = Math.max(0, e.atk - amt); });
      }
      // ── FACTION-SPECIFIC ALLY BUFFS ──
      else if (lo.includes("all synths gain +1 atk")) {
        board.filter(a => a.faction==="SYNTH").forEach(a => { a.atk += 1 * neighborMult; });
      }
      else if (lo.includes("all constructs gain +1 atk")) {
        board.filter(a => a.faction==="CONSTRUCT").forEach(a => { a.atk += 1; });
      }
      // ── PER-ALLY SELF BUFF (Thought Wisp: "+1 ATK to self per ally") ──
      else if (lo.includes("per ally") && lo.includes("atk")) {
        const m = inn.match(/\+(\d+)\s*ATK/i); const amt = m ? parseInt(m[1]) : 1;
        const allyCount = board.filter(a => a.id !== u.id && a.hp > 0).length;
        u.atk += amt * allyCount;
      }
      // ── ALL ALLIES +X ATK PER FACTION (Warlord, Oracle Node) ──
      else if (lo.includes("all allies gain") && lo.includes("per") && lo.includes("atk")) {
        const m = inn.match(/\+(\d+)\s*ATK/i); const amt = m ? parseInt(m[1]) : 1;
        let fCount = 0;
        if (lo.includes("augmented")) fCount = board.filter(a => a.faction === "AUGMENTED").length;
        else if (lo.includes("psionic")) fCount = board.filter(a => a.faction === "PSIONIC").length;
        else if (lo.includes("drone")) fCount = board.filter(a => a.faction === "DRONE").length;
        else if (lo.includes("synth")) fCount = board.filter(a => a.faction === "SYNTH").length;
        else if (lo.includes("hacker")) fCount = board.filter(a => a.faction === "HACKER").length;
        else if (lo.includes("virus")) fCount = board.filter(a => a.faction === "VIRUS").length;
        else if (lo.includes("construct")) fCount = board.filter(a => a.faction === "CONSTRUCT").length;
        else if (lo.includes("phantom")) fCount = board.filter(a => a.faction === "PHANTOM").length;
        board.forEach(a => { a.atk += amt * fCount; });
      }
      // ── SELF GAINS PER FACTION (Quantum Core, Legion Swarm) ──
      else if (lo.includes("gains") && lo.includes("for each") && lo.includes("on board")) {
        const m = inn.match(/\+(\d+)\/\+(\d+)/); 
        const ba = m ? parseInt(m[1]) : 1, bh = m ? parseInt(m[2]) : 1;
        let fCount = 0;
        if (lo.includes("synth")) fCount = board.filter(a => a.faction === "SYNTH").length;
        else if (lo.includes("drone")) fCount = board.filter(a => a.faction === "DRONE").length;
        else if (lo.includes("construct")) fCount = board.filter(a => a.faction === "CONSTRUCT").length;
        else if (lo.includes("augmented")) fCount = board.filter(a => a.faction === "AUGMENTED").length;
        else if (lo.includes("psionic")) fCount = board.filter(a => a.faction === "PSIONIC").length;
        else fCount = board.length;
        u.atk += ba * fCount; u.hp += bh * fCount; u.maxHp += bh * fCount;
      }
      // ── ALL ALLIES GAIN SHIELD = TIER (Nexus Prime) ──
      else if (lo.includes("shield equal to their tier")) {
        board.forEach(a => { a.shield = (a.shield || 0) + (a.tier || 1); });
      }
      // ── ALL ALLIES GAIN SHIELD = HP (Ascendant) ──
      else if (lo.includes("shield equal to their hp")) {
        board.forEach(a => { a.shield = (a.shield || 0) + a.hp; });
      }
      // ── ENEMY MISS CHANCE (Event Horizon) → give all allies dodge ──
      else if (lo.includes("miss chance")) {
        const m = inn.match(/(\d+)%/); const pct = m ? parseInt(m[1]) / 100 : 0.2;
        board.forEach(a => { a._dodgeChance = Math.min(0.5, (a._dodgeChance || 0) + pct); });
      }
      // ── ADJACENT ALLIES IMMUNE TO FIRST ATTACK (Relic Guard) ──
      else if (lo.includes("adjacent allies immune to first")) {
        const adj = [idx - 1, idx + 1].filter(i => i >= 0 && i < board.length);
        adj.forEach(i => { board[i].hardshellActive = true; if (!board[i].kw.includes("hardshell")) board[i].kw.push("hardshell"); });
      }
      // ── STRONGEST ENEMY LOSES ATK (Dominator etc) ──
      else if (lo.includes("strongest enemy loses") && lo.includes("atk")) {
        const m = inn.match(/(\d+)\s*ATK/i); const amt = m ? parseInt(m[1]) : 3;
        const strongest = [...enemy].sort((a, b) => b.atk - a.atk)[0];
        if (strongest) strongest.atk = Math.max(0, strongest.atk - amt);
      }
      // ── +X SHIELD TO ALL ALLIES (Mind Spark, Shield Drone) ──
      else if (lo.includes("shield to all") || lo.includes("shield to all allies")) {
        const m = inn.match(/\+?(\d+)\s*Shield/i); const amt = m ? parseInt(m[1]) : 1;
        board.forEach(a => { a.shield = (a.shield || 0) + amt; });
      }
      // ── ADJACENT ALLIES GAIN +X SHIELD (Thought Weaver, Aura Guard) ──
      else if (lo.includes("adjacent allies gain") && lo.includes("shield")) {
        const m = inn.match(/\+?(\d+)\s*Shield/i); const amt = (m ? parseInt(m[1]) : 2) * neighborMult;
        [idx - 1, idx + 1].filter(i => i >= 0 && i < board.length).forEach(i => {
          board[i].shield = (board[i].shield || 0) + amt;
        });
      }
      // ── DEAL X DMG TO RANDOM ENEMY (Psi Probe) ──
      else if (lo.includes("deal") && lo.includes("damage to random enemy")) {
        const m = inn.match(/(\d+)\s*damage/i); const amt = m ? parseInt(m[1]) : 1;
        const alive = enemy.filter(e => e.hp > 0);
        if (alive.length > 0) {
          const pick = alive[Math.floor(Math.random() * alive.length)];
          pick.hp -= amt;
        }
      }
      // ── ALL NEUTRAL ALLIES GAIN +X/+Y (Merc Captain) ──
      else if (lo.includes("all neutral allies gain")) {
        const m = inn.match(/\+(\d+)\/\+(\d+)/);
        if (m) { const ba=parseInt(m[1]),bh=parseInt(m[2]); board.filter(a => a.faction === "NEUTRAL" && a.id !== u.id).forEach(a => { a.atk+=ba;a.hp+=bh;a.maxHp+=bh; }); }
      }
      // ── IF ONLY NEUTRAL ON BOARD: SELF BUFF (Lone Wolf) ──
      else if (lo.includes("if only neutral on board")) {
        const m = inn.match(/\+(\d+)\/\+(\d+)/);
        if (m && board.filter(a => a.faction === "NEUTRAL").length === 1) {
          const ba=parseInt(m[1]),bh=parseInt(m[2]); u.atk+=ba;u.hp+=bh;u.maxHp+=bh;
        }
      }
      // ── ALL ALLIES DEAL +X BONUS DAMAGE PER HACKER (Code Strike) ──
      else if (lo.includes("bonus damage per hacker")) {
        const hackCount = board.filter(a => a.faction === "HACKER").length;
        board.forEach(a => { a._bonusDmg = (a._bonusDmg||0) + hackCount; });
      }
      // ── ADJACENT ALLIES/DRONES GAIN +X/+Y (Relay Drone etc.) ──
      else if (lo.includes("adjacent") && lo.includes("gain") && lo.includes("/+") && !lo.includes("all allies") && !lo.includes("shield")) {
        const m = inn.match(/\+(\d+)\/\+(\d+)/);
        if (m) {
          const ba = parseInt(m[1]) * neighborMult, bh = parseInt(m[2]) * neighborMult;
          const fFilter = lo.includes("drone") ? "DRONE" : null;
          [idx - 1, idx + 1].filter(i => i >= 0 && i < board.length).forEach(i => {
            if (!fFilter || board[i].faction === fFilter) {
              board[i].atk += ba; board[i].hp += bh; board[i].maxHp += bh;
            }
          });
        }
      }

      events.push({ type: "innate_start", side, unitId: u.id, unitName: u.name, msg: u.name + ": " + inn, ...snap(pBoard, eBoard) });
    });
  };
  fireInnateStart(pBoard, eBoard, "player");
  fireInnateStart(eBoard, pBoard, "enemy");

  // ── Balance patch: flag-based combat-start handlers ──
  const applyBalanceFlags = (board, enemy, side) => {
    board.forEach(u => {
      // Proxy Node: start with shield
      if (u._shieldOnCombatStart) {
        u.shield = (u.shield || 0) + u._shieldOnCombatStart;
      }
      // Merc Captain: +1/+1 per unique faction on board
      if (u._factionDiversityBonus) {
        const factions = new Set(board.map(a => a.faction));
        const bonus = factions.size * u._factionDiversityBonus;
        u.atk += bonus; u.hp += bonus; u.maxHp += bonus;
        events.push({ type: "scale", side, targetId: u.id, msg: `${u.name} +${bonus}/+${bonus} (${factions.size} factions)`, ...snap(pBoard, eBoard) });
      }
      // Neural Titan: debuff enemies based on Psionic count
      if (u._debuffPerPsionic) {
        const psionicCount = board.filter(a => a.faction === "PSIONIC").length;
        const debuff = Math.min(u._maxDebuff || 99, psionicCount * u._debuffPerPsionic);
        if (debuff > 0) {
          enemy.forEach(e => { e.atk = Math.max(0, e.atk - debuff); });
          events.push({ type: "innate_start", side, unitId: u.id, unitName: u.name, msg: `${u.name}: All enemies -${debuff} ATK (${psionicCount} Psionics)`, ...snap(pBoard, eBoard) });
        }
      }
      // Psi Nexus: swap weakest ally ↔ strongest enemy stats (single, not whole board)
      if (u._singleStatSwap) {
        const weakest = [...board].filter(a => a.id !== u.id).sort((a, b) => (a.atk + a.hp) - (b.atk + b.hp))[0];
        const strongest = [...enemy].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
        if (weakest && strongest) {
          const [wa, wh] = [weakest.atk, weakest.hp];
          weakest.atk = strongest.atk; weakest.hp = strongest.hp; weakest.maxHp = strongest.hp;
          strongest.atk = wa; strongest.hp = wh; strongest.maxHp = wh;
          events.push({ type: "innate_start", side, unitId: u.id, unitName: u.name, msg: `${u.name}: Swapped ${weakest.name} ↔ ${strongest.name} stats`, ...snap(pBoard, eBoard) });
        }
      }
    });
  };
  applyBalanceFlags(pBoard, eBoard, "player");
  applyBalanceFlags(eBoard, pBoard, "enemy");

  // Store base ATK for revive reset
  pBoard.forEach(u => { u._baseAtk = u.atk; });
  eBoard.forEach(u => { u._baseAtk = u.atk; });

  // 5c. God Compiler: All Synth innate abilities trigger twice
  const doubleSynthInnates = (board, enemy, side) => {
    if (!board.some(u => u._doubleSynthInnate)) return;
    const synthUnits = board.filter(u => u.faction === "SYNTH" && u._innateStart && !u._doubleSynthInnate);
    synthUnits.forEach((u, _) => {
      const idx = board.indexOf(u);
      const inn = u._innateStart || "";
      const lo = inn.toLowerCase();
      // Re-apply the combat-start effect (second trigger)
      if (lo.includes("all allies gain") && lo.includes("/+")) {
        const m = inn.match(/\+(\d+)\/\+(\d+)/); if(m){ const ba=parseInt(m[1]),bh=parseInt(m[2]); board.forEach(a=>{a.atk+=ba;a.hp+=bh;a.maxHp+=bh;}); }
      } else if (lo.includes("all synths gain +1 atk")) {
        board.filter(a => a.faction==="SYNTH").forEach(a => { a.atk += 1; });
      } else if (lo.includes("shield equal to their tier")) {
        board.forEach(a => { a.shield = (a.shield || 0) + (a.tier || 1); });
      } else if (lo.includes("copies") && lo.includes("keyword") && lo.includes("adjacent")) {
        const ns = [idx > 0 ? board[idx-1] : null, idx < board.length-1 ? board[idx+1] : null].filter(Boolean);
        const av = ns.flatMap(n => n.kw).filter(k => !u.kw.includes(k));
        if (av.length > 0) { const g = av[Math.floor(Math.random() * av.length)]; u.kw.push(g); if (g==='stealth') u._stealthLeft=2; if (g==='hardshell') u.hardshellActive=true; }
      } else if (lo.includes("adjacent") && lo.includes("gain") && lo.includes("/+")) {
        const m = inn.match(/\+(\d+)\/\+(\d+)/);
        if (m) { const ba=parseInt(m[1]),bh=parseInt(m[2]); [idx-1,idx+1].filter(i=>i>=0&&i<board.length).forEach(i=>{ board[i].atk+=ba;board[i].hp+=bh;board[i].maxHp+=bh; }); }
      } else if (lo.includes("adjacent allies gain") && lo.includes("shield")) {
        const m = inn.match(/\+?(\d+)\s*Shield/i); const amt = m ? parseInt(m[1]) : 2;
        [idx-1,idx+1].filter(i=>i>=0&&i<board.length).forEach(i=>{ board[i].shield=(board[i].shield||0)+amt; });
      }
      events.push({ type: "innate_start", side, unitId: u.id, unitName: u.name, msg: `${u.name} (×2 God Compiler): ${inn}`, ...snap(pBoard, eBoard) });
    });
    // Also re-apply boardEffects for Synth units
    const AM = ABILITY_MAP;
    board.forEach((u, idx) => {
      if (u.faction !== "SYNTH" || u._doubleSynthInnate) return;
      const entry = AM[u.tn || u.name.replace(/^Golden /, '')];
      if (!entry?.boardEffects) return;
      entry.boardEffects.forEach(fx => {
        const left = idx > 0 ? board[idx-1] : null;
        const right = idx < board.length-1 ? board[idx+1] : null;
        if (fx.type === 'allShieldByTier') board.forEach(a => { a.shield = (a.shield||0) + (a.tier||1); });
        if (fx.type === 'allShield') board.forEach(a => { a.shield = (a.shield||0) + (fx.amount||0); });
        if (fx.type === 'allBuff') board.forEach(a => { a.atk += (fx.atk||0); a.hp += (fx.hp||0); a.maxHp += (fx.hp||0); });
        if (fx.type === 'adjacentShield') [left,right].filter(Boolean).forEach(n => { n.shield = (n.shield||0) + (fx.amount||0); });
      });
    });
  };
  doubleSynthInnates(pBoard, eBoard, "player");
  doubleSynthInnates(eBoard, pBoard, "enemy");

  // 5d. Quantum Link (deferred): double ALL shields AFTER everything has been applied
  const applyDeferredShields = (board, side) => {
    if (!board._pendingDoubleShields) return;
    board.forEach(u => { u.shield = (u.shield || 0) * 2; });
    delete board._pendingDoubleShields;
    events.push({ type: "announce", side, msg: "🔗 Quantum Link: All shields DOUBLED!", ...snap(pBoard, eBoard) });
  };
  applyDeferredShields(pBoard, "player");
  applyDeferredShields(eBoard, "enemy");

  // Remove dead from init
  for (let i = pBoard.length - 1; i >= 0; i--) if (pBoard[i].hp <= 0) pBoard.splice(i, 1);
  for (let i = eBoard.length - 1; i >= 0; i--) if (eBoard[i].hp <= 0) eBoard.splice(i, 1);

  // Sort: swift first
  const sortSwift = (a, b) => (b.mod?.effect?.swift ? 1 : 0) - (a.mod?.effect?.swift ? 1 : 0);
  pBoard.sort(sortSwift); eBoard.sort(sortSwift);
  // Init stealth counters
  pBoard.forEach(u => { if (u.kw.includes("stealth")) u._stealthLeft = 2; });
  eBoard.forEach(u => { if (u.kw.includes("stealth")) u._stealthLeft = 2; });
  // Shadow Swarm: Drones flagged for stealth get 1 turn
  pBoard.forEach(u => { if (u._droneStealth && !u._stealthLeft) u._stealthLeft = 1; });
  eBoard.forEach(u => { if (u._droneStealth && !u._stealthLeft) u._stealthLeft = 1; });
  // Adapt: gain random keyword
  const adaptKws = ["firewall","hardshell","stealth","cleave","sniper","splash","regen","taunt"];
  [...pBoard, ...eBoard].forEach(u => {
    if (u.kw.includes("adapt")) {
      const available = adaptKws.filter(k => !u.kw.includes(k));
      if (available.length > 0) {
        const gained = available[Math.floor(Math.random() * available.length)];
        u.kw.push(gained);
        if (gained === "stealth") u._stealthLeft = 2;
        if (gained === "hardshell") u.hardshellActive = true;
      }
    }
  });
  events.push({ type: "start", ...snap(pBoard, eBoard) });

  // 5b. Enforce minimum 1 ATK (prevents 0-ATK stalemates from Hacker mirrors)
  pBoard.forEach(u => { if (u.atk <= 0) u.atk = 1; });
  eBoard.forEach(u => { if (u.atk <= 0) u.atk = 1; });

  // 6. Combat loop
  // Chrono Weaver T7: save initial state for potential round 2
  const chronoActive = hasT7(pBoard, "combatRunsTwice") || hasT7(eBoard, "combatRunsTwice");
  const chronoSnapP = chronoActive ? pBoard.map(u => ({ ...u, kw: [...u.kw], kwData: { ...u.kwData } })) : [];
  const chronoSnapE = chronoActive ? eBoard.map(u => ({ ...u, kw: [...u.kw], kwData: { ...u.kwData } })) : [];
  let chronoRound = 1;

  let pIdx = 0, eIdx = 0, turn = 0;

  const getTarget = (defenders, attacker) => {
    // Filter dead units first — they may still be in the array before splice
    const alive = defenders.filter(u => u.hp > 0);
    if (!alive.length) return null;
    if (!attacker) { const fw=alive.filter(u=>u.kw.includes("firewall")); return fw.length>0?fw[0]:alive[0]; }

    // Focus Fire chip: first attack targets enemy's strongest, then the flag is consumed
    if (attacker._focusStrongest) {
      attacker._focusStrongest = false;
      const sorted = [...alive].sort((a, b) => b.atk - a.atk);
      return sorted[0];
    }

    // ── INNATE TARGETING OVERRIDES ──
    if (attacker._targetHighestAtk) {
      let pool = alive.filter(u => !u._stealthLeft || u._stealthLeft <= 0);
      if (pool.length === 0) pool = alive;
      return [...pool].sort((a, b) => b.atk - a.atk)[0];
    }
    if (attacker._targetWeakest) {
      let pool = alive.filter(u => !u._stealthLeft || u._stealthLeft <= 0);
      if (pool.length === 0) pool = alive;
      return [...pool].sort((a, b) => a.hp - b.hp)[0];
    }
    if (attacker._targetMostKw) {
      let pool = alive.filter(u => !u._stealthLeft || u._stealthLeft <= 0);
      if (pool.length === 0) pool = alive;
      return [...pool].sort((a, b) => b.kw.length - a.kw.length)[0];
    }
    if (attacker._targetBackline) {
      let pool = alive.filter(u => !u._stealthLeft || u._stealthLeft <= 0);
      if (pool.length === 0) pool = alive;
      return pool[pool.length - 1]; // Last = backline
    }
    if (attacker._targetRandom) {
      return alive[Math.floor(Math.random() * alive.length)];
    }

    // Phantom assassin targeting (4+): bypass frontline, target lowest HP
    if (attacker._assassinTarget) {
      let pool = alive.filter(u => !u._stealthLeft || u._stealthLeft <= 0);
      if (pool.length === 0) pool = alive;
      // Aggro Lock still overrides assassination
      const aggroLock = pool.filter(u => u.kw.includes("taunt"));
      if (aggroLock.length > 0) return aggroLock[Math.floor(Math.random() * aggroLock.length)];
      return [...pool].sort((a, b) => a.hp - b.hp)[0];
    }

    // Stealth: filter out stealthed units
    let pool = alive.filter(u => !u._stealthLeft || u._stealthLeft <= 0);
    if (pool.length === 0) pool = alive;

    // Aggro Lock (taunt) overrides ALL targeting
    const aggroLock = pool.filter(u => u.kw.includes("taunt"));
    if (aggroLock.length > 0) return aggroLock[Math.floor(Math.random() * aggroLock.length)];

    // Firewall: must be attacked first
    const fw = pool.filter(u => u.kw.includes("firewall"));
    if (fw.length > 0) return fw[Math.floor(Math.random() * fw.length)];

    // Frontline/Backline: prefer frontline (indices 0-3), backline (4-6) only if frontline empty
    const frontline = pool.filter((u, idx) => {
      const origIdx = alive.indexOf(u);
      return origIdx <= 3;
    });
    if (frontline.length > 0) pool = frontline;

    // Sniper: target lowest HP (ignores frontline/backline)
    if (attacker.kw.includes("sniper")) {
      const fullPool = alive.filter(u => !u._stealthLeft || u._stealthLeft <= 0);
      const sorted = [...(fullPool.length ? fullPool : alive)].sort((a, b) => a.hp - b.hp);
      return sorted[0];
    }
    // Default: random from pool
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // Spawn art lookup — maps faction to a real T1 unit whose art we reuse for spawns
  const SPAWN_ART = {
    SYNTH:     { tn: "Scrap Bot",       name: "Scrap" },
    HACKER:    { tn: "Net Runner",      name: "Hack Spawn" },
    AUGMENTED: { tn: "Street Samurai",  name: "Aug Spawn" },
    DRONE:     { tn: "Scout Fly",       name: "Drone" },
    PSIONIC:   { tn: "Mind Spark",      name: "Psi Spawn" },
    VIRUS:     { tn: "Microbe",         name: "Spore" },
    PHANTOM:   { tn: "Flicker",         name: "Shade" },
    CONSTRUCT: { tn: "Foundation",      name: "Construct" },
    NEUTRAL:   { tn: "Scavenger",       name: "Spawn" },
  };
  const getSpawnInfo = (faction) => SPAWN_ART[faction] || SPAWN_ART.NEUTRAL;

  const doDeadswitch = (dead, allies, enemies, side, op) => {
    // Track dead unit for Resummon effects
    (side === "player" ? pDead : eDead).push({ ...dead });
    // Swarm Protocol: dead Virus with flag spawns a 1/1 Drone
    if (dead._virusSpawnDrone && dead.faction === "VIRUS" && allies.length < MAX_BOARD_SIZE) {
      const si = getSpawnInfo("DRONE");
      const spawned = { id: gid(), tn: si.tn, name: si.name, faction: "DRONE", tier: 1, atk: 1, hp: 1, maxHp: 1, emoji: "", golden: false, kw: [], kwData: {}, mod: null, shield: 0, hardshellActive: false };
      allies.push(spawned);
      events.push({ type: "spawn", side, unitId: spawned.id, unitName: spawned.name, source: "Swarm Protocol", ...snap(pBoard, eBoard) });
    }
    if (!dead.kw.includes("deadswitch")) return;
    const d = dead.kwData.deadswitch || "";
    const times = (dead.mod?.effect?.doubleDeadswitch || (op && op.id==="killswitch") || dead._chipDoubleDS) ? 2 : 1;
    for (let t = 0; t < times; t++) {
      if (d.includes("Summon") && d.includes("copy")) {
        const spawned = { ...dead, id: gid(), hp: 1, maxHp: 1, atk: 1, name: "Echo " + dead.name, kw: [], kwData: {}, mod: null, hardshellActive: false };
        if (d.includes("Stealth")) spawned._stealthLeft = 2;
        if (allies.length < MAX_BOARD_SIZE) allies.push(spawned);
      } else if (d.match(/Summon (\d+)x/)) {
        const countMatch = d.match(/Summon (\d+)x/); const count = countMatch ? parseInt(countMatch[1]) : 2;
        const m = d.match(/(\d+)\/(\d+)/); const sa = m ? parseInt(m[1]) : 2; const sh = m ? parseInt(m[2]) : 2;
        const spawnFaction = dead.faction;
        const si = getSpawnInfo(spawnFaction);
        for (let i = 0; i < count && allies.length < MAX_BOARD_SIZE; i++) {
          allies.push({ id: gid(), tn: si.tn, name: si.name, faction: spawnFaction, tier: 1, atk: sa, hp: sh, maxHp: sh, emoji: "", golden: false, kw: [], kwData: {}, mod: null, shield: 0, hardshellActive: false });
        }
      } else if (d.includes("Summon two")) {
        const m = d.match(/(\d+)\/(\d+)/); const sa = m ? parseInt(m[1]) : 2; const sh = m ? parseInt(m[2]) : 2;
        const spawnFaction = dead.faction;
        const si = getSpawnInfo(spawnFaction);
        for (let i = 0; i < 2 && allies.length < MAX_BOARD_SIZE; i++) {
          allies.push({ id: gid(), tn: si.tn, name: si.name, faction: spawnFaction, tier: 1, atk: sa, hp: sh, maxHp: sh, emoji: "", golden: false, kw: [], kwData: {}, mod: null, shield: 0, hardshellActive: false });
        }
      } else if (d.includes("Summon")) {
        const m = d.match(/(\d+)\/(\d+)/); const sa = m ? parseInt(m[1]) : 1; const sh = m ? parseInt(m[2]) : 1;
        const si = getSpawnInfo(dead.faction);
        if (allies.length < MAX_BOARD_SIZE) {
          allies.push({ id: gid(), tn: si.tn, name: si.name, faction: dead.faction, tier: 1, atk: sa, hp: sh, maxHp: sh, emoji: "", golden: false, kw: [], kwData: {}, mod: null, shield: 0, hardshellActive: false });
        }
      } else if (d.includes("Fill board")) {
        const m = d.match(/(\d+)\/(\d+)/); const sa = m ? parseInt(m[1]) : 3; const sh = m ? parseInt(m[2]) : 3;
        const spawnFaction = dead.faction;
        const si = getSpawnInfo(spawnFaction);
        while (allies.length < MAX_BOARD_SIZE) {
          allies.push({ id: gid(), tn: si.tn, name: si.name, faction: spawnFaction, tier: 1, atk: sa, hp: sh, maxHp: sh, emoji: "", golden: false, kw: [], kwData: {}, mod: null, shield: 0, hardshellActive: false });
        }
      } else if (d.includes("Deal") && d.includes("all enemies")) {
        // ── AoE DAMAGE: emit per-unit hit events so renderer shows each hit ──
        const m = d.match(/Deal (\d+)/); const dmg = m ? parseInt(m[1]) : 2;
        const hitTargets = enemies.filter(e => e.hp > 0);
        hitTargets.forEach(e => {
          e.hp -= dmg;
          if (e.hp <= 0 && e._constructSurvive) { e.hp = 1; e._constructSurvive = false; }
          if (e.hp <= 0 && e._surviveLethal) { e.hp = 1; e._surviveLethal = false; }
          events.push({ type: "ds_hit", side, sourceId: dead.id, sourceName: dead.name, targetId: e.id, targetName: e.name, damage: dmg, killed: e.hp <= 0, ...snap(pBoard, eBoard) });
        });
        // Process deaths from AoE — route through handleDeath for proper triggers + dedup
        const aoeDead = hitTargets.filter(e => e.hp <= 0);
        const defSide = side === "player" ? "enemy" : "player";
        aoeDead.forEach(victim => {
          const defIdx = enemies.indexOf(victim);
          if (defIdx >= 0) enemies.splice(defIdx, 1);
          handleDeath(victim, enemies, allies, defSide);
        });
      } else if (d.includes("Deal") && d.includes("random enemy")) {
        const m = d.match(/Deal (\d+)/); const dmg = m ? parseInt(m[1]) : 3;
        const alive = enemies.filter(e => e.hp > 0);
        if (alive.length > 0) {
          const target = alive[Math.floor(Math.random() * alive.length)];
          target.hp -= dmg;
          events.push({ type: "ds_hit", side, sourceId: dead.id, sourceName: dead.name, targetId: target.id, targetName: target.name, damage: dmg, killed: target.hp <= 0, ...snap(pBoard, eBoard) });
          if (target.hp <= 0) {
            const defSide = side === "player" ? "enemy" : "player";
            const defIdx = enemies.indexOf(target);
            if (defIdx >= 0) enemies.splice(defIdx, 1);
            handleDeath(target, enemies, allies, defSide);
          }
        }
      } else if (d.includes("enemies") && d.includes("ATK")) {
        // ── AoE DEBUFF: emit per-unit events ──
        const m = d.match(/(\d+)\s*ATK/); const debuff = m ? parseInt(m[1]) : 3;
        enemies.forEach(e => {
          if (e.hp > 0) {
            e.atk = Math.max(0, e.atk - debuff);
            events.push({ type: "ds_debuff", side, sourceId: dead.id, sourceName: dead.name, targetId: e.id, targetName: e.name, stat: "atk", amount: debuff, ...snap(pBoard, eBoard) });
          }
        });
      } else if (d.toLowerCase().includes("all allies") && d.includes("stealth")) {
        allies.forEach(a => {
          if (a.hp > 0 && !a._stealthLeft) {
            a._stealthLeft = 2;
            events.push({ type: "ds_buff", side, sourceId: dead.id, sourceName: dead.name, targetId: a.id, targetName: a.name, buff: "stealth", ...snap(pBoard, eBoard) });
          }
        });
      } else if (d.toLowerCase().includes("all allies")) {
        // ── AoE BUFF: emit per-unit events ──
        const m = d.match(/\+(\d+)\/\+(\d+)/); const ba = m ? parseInt(m[1]) : 2; const bh = m ? parseInt(m[2]) : 2;
        allies.forEach(a => {
          a.atk += ba; a.hp += bh; a.maxHp += bh;
          events.push({ type: "ds_buff", side, sourceId: dead.id, sourceName: dead.name, targetId: a.id, targetName: a.name, buff: `+${ba}/+${bh}`, atkBuff: ba, hpBuff: bh, ...snap(pBoard, eBoard) });
        });
      } else if (d.includes("Killer loses") || d.includes("killer loses")) {
        const m = d.match(/(\d+)/); const debuff = m ? parseInt(m[1]) : 2;
        // The killer is the last attacker — approximate by reducing strongest remaining enemy ATK
        if (enemies.length > 0) {
          const strongest = [...enemies].sort((a,b) => b.atk - a.atk)[0];
          if (strongest) strongest.atk = Math.max(0, strongest.atk - debuff);
        }
      } else if (d.includes("Strongest ally gains this unit ATK") || d.includes("strongest ally gains this unit")) {
        const aliveAllies = allies.filter(a => a.hp > 0);
        if (aliveAllies.length > 0) {
          const strongest = [...aliveAllies].sort((a,b) => b.atk - a.atk)[0];
          strongest.atk += dead.atk;
        }
      } else if (d.includes("Random Construct")) {
        const constructs = allies.filter(a => a.faction === "CONSTRUCT" && a.hp > 0);
        if (constructs.length > 0) {
          const target = constructs[Math.floor(Math.random() * constructs.length)];
          const m = d.match(/(\d+)\/\+(\d+)/); const ba = m?parseInt(m[1]):3; const bh = m?parseInt(m[2]):3;
          target.atk += ba; target.hp += bh; target.maxHp += bh;
        }
      } else if (d.includes("All Drones")) {
        const m = d.match(/(\d+)\/\+(\d+)/); const ba = m?parseInt(m[1]):4; const bh = m?parseInt(m[2]):4;
        allies.filter(a => a.faction === "DRONE" && a.hp > 0).forEach(a => { a.atk += ba; a.hp += bh; a.maxHp += bh; });
      } else if (d.includes("Revive as 1/1")) {
        if (dead._reviveCount && dead._reviveCount > 0 && allies.length < MAX_BOARD_SIZE) {
          const baseAtk = dead._baseAtk || 1;
          const revHp = dead._reviveHpFraction ? Math.max(1, Math.floor(dead.maxHp * dead._reviveHpFraction)) : 1;
          const revAtk = dead._reviveAtkBoost && dead._reviveAtkBoost > 1 ? Math.max(1, Math.floor(baseAtk * dead._reviveAtkBoost)) : baseAtk;
          const revived = { ...dead, id: gid(), hp: revHp, maxHp: revHp, atk: revAtk, kw: [...dead.kw], kwData: {...dead.kwData}, _reviveCount: dead._reviveCount - 1 };
          // Strip all snowball/on-kill flags to prevent infinite scaling loops
          delete revived._onKillGainVictimAtk;
          delete revived._collectInnatesOnRevive;
          delete revived._onKillHealFull;
          delete revived._onKillHealHalf;
          delete revived._onKillStealth;
          delete revived._onKillAtkGain;
          delete revived._onKillHpGain;
          delete revived._permanentKillGain;
          delete revived._onKillGainHighestStat;
          delete revived._onKillSplash;
          delete revived._onKillGoldPerTier;
          delete revived._chainTripleOnKill;
          delete revived._onKillBecomeVictim;
          delete revived._onKillGainInnate;
          allies.push(revived);
          events.push({ type: "revive", side, unitId: revived.id, unitName: revived.name, msg: `${dead.name} revived at ${revAtk}/${revHp}!`, ...snap(pBoard, eBoard) });
        }
      } else if (d.includes("Enemy player takes") && d.includes("direct damage")) {
        const m = d.match(/(\d+)/); const dmg = m ? parseInt(m[1]) : 3;
        if (side === "player") eVirusBleed += dmg;
        else pVirusBleed += dmg;
      } else if (d.includes("Resummon")) {
        const synthOnly = d.includes("Synth");
        const deadAllies = (side === "player" ? pDead : eDead) || [];
        const toResummon = synthOnly ? deadAllies.filter(u => u.faction === "SYNTH") : deadAllies;
        toResummon.forEach(u => {
          if (allies.length < MAX_BOARD_SIZE) {
            allies.push({ ...u, id: gid(), hp: 1, maxHp: 1, atk: Math.max(1, u.atk), kw: u.kw.filter(k => k !== "deadswitch"), mod: null, shield: 0, hardshellActive: false });
          }
        });
      }
    }
    events.push({ type: "deadswitch", side, unitId: dead.id, emoji: dead.emoji, name: dead.name, msg: `${dead.name} Deadswitch: ${d}`, ...snap(pBoard, eBoard) });
  };

  const doExecute = (killer, side) => {
    if (!killer.kw.includes("execute")) return;
    const d = killer.kwData.execute || "";
    const m = d.match(/\+(\d+)\s*ATK/);
    if (m) killer.atk += parseInt(m[1]);
    if (d.includes("Destroy random enemy")) {
      const enemies = side === "player" ? eBoard : pBoard;
      if (enemies.length > 0) {
        const idx = Math.floor(Math.random() * enemies.length);
        const victim = enemies[idx];
        victim.hp = 0;
        events.push({ type: "execute_destroy", side, unitId: killer.id, victimId: victim.id, msg: `${killer.name} Execute: destroyed ${victim.name}!`, ...snap(pBoard, eBoard) });
      }
    }
  };

  // handleDeath: wraps doDeadswitch + death event + faction death triggers
  const _deadIds = new Set(); // Track units that already died to prevent duplicate death events
  const handleDeath = (dead, allies, enemies, side) => {
    if (_deadIds.has(dead.id)) return; // Already processed
    _deadIds.add(dead.id);
    // Deadswitch Amp chip: first ally death triggers 2x (then consumed)
    const boardArr = side === "player" ? pBoard : eBoard;
    if (boardArr._deadswitchAmp && dead.kw.includes("deadswitch")) {
      dead._chipDoubleDS = true; // Signal to doDeadswitch
      boardArr._deadswitchAmp = false; // Consumed
    }
    events.push({ type: "death", side, unitId: dead.id, unitName: dead.name, unitEmoji: dead.emoji, ...snap(pBoard, eBoard) });
    const alliesBefore = allies.length;
    doDeadswitch(dead, allies, enemies, side, op);
    // Emit spawn events for any units created by deadswitch
    if (allies.length > alliesBefore) {
      for (let si = alliesBefore; si < allies.length; si++) {
        events.push({ type: "spawn", side, unitId: allies[si].id, unitName: allies[si].name, source: dead.name + " deadswitch", ...snap(pBoard, eBoard) });
      }
    }

    // VIRUS bleed: deal direct damage to enemy player
    if (dead._virusBleed) {
      const bleedMult = (side === "player" ? pBoard : eBoard)._virusBleedMultiplier || 1;
      const bleedDmg = dead._virusBleed * bleedMult;
      if (side === "player") pVirusBleed += bleedDmg;
      else eVirusBleed += bleedDmg;
    }
    // Patient Zero T7: on death, enemy player takes 10 direct damage
    if (dead._t7rule === "virusDoubleBleed") {
      if (side === "player") eVirusBleed += 10; // Player's Patient Zero dying hurts enemy
      else pVirusBleed += 10; // Enemy Patient Zero dying hurts player... but enemies don't have T7s in PvE
    }
    // VIRUS (4+): remaining Virus allies gain +2 ATK on any ally death
    if (dead._virusDeathAtk) {
      allies.filter(u => u.faction === "VIRUS" && u.hp > 0).forEach(u => { u.atk += dead._virusDeathAtk; });
    }
    // DRONE (4+): remaining Drones gain +1 ATK permanently on Drone death
    if (dead._droneDeathBuff && dead.faction === "DRONE") {
      allies.filter(u => u.faction === "DRONE" && u.hp > 0).forEach(u => { u.atk += 1; });
    }
    // Innate: when any ally dies, all allies heal X HP (Empathic Core)
    allies.filter(u => u.hp > 0 && u._healAllOnAllyDeath).forEach(u => {
      allies.filter(a => a.hp > 0).forEach(a => { a.hp = Math.min(a.maxHp, a.hp + u._healAllOnAllyDeath); });
    });
    // Extinction Event: on death, infect all enemies with fixed stacks
    if (dead._deathMassInfect) {
      const stacks = dead._deathInfectStacks || 2;
      enemies.filter(e => e.hp > 0).forEach(e => {
        e._infected = true;
        e._infectionDmg = (e._infectionDmg || 0) + stacks;
      });
      events.push({ type: "infect", side, msg: `${dead.name} death: all enemies infected +${stacks}!`, ...snap(pBoard, eBoard) });
    }
    // Double Virus death effects
    if (dead.faction === "VIRUS" && allies.some(u => u._doubleVirusDeath)) {
      doDeadswitch(dead, allies, enemies, side, op);
    }
  };

  const doAttack = (attacker, defenders, attackerSide) => {
    if (attacker.hp <= 0) return; // Dead from deadswitch AoE cascade
    const target = getTarget(defenders, attacker);
    if (!target) return;

    // Psionic stun: skip this attack if stunned
    if (attacker._stunTurns && attacker._stunTurns > 0) {
      attacker._stunTurns--;
      events.push({ type: "stun", side: attackerSide, unitId: attacker.id, unitName: attacker.name, msg: `${attacker.name} STUNNED!`, ...snap(pBoard, eBoard) });
      return; // Stunned, can't attack
    }

    let dmg = attacker.atk;
    let absorbInfo = null; // Psychic Wall absorb tracking
    let hiveShareCount = 0; // Hive Mind share tracking
    let goldEarned = 0; // Ransomware gold tracking
    // Phantom bonus true damage (ignores shield)
    if (attacker._phantomBonusDmg) dmg += attacker._phantomBonusDmg;
    const hasMalware = attacker.kw.includes("malware") || attacker.droneFirstMalware;

    // Miss chance (Event Horizon)
    if (attacker._missChance && Math.random() < attacker._missChance) {
      events.push({ type: "dodge", targetId: target.id, side: attackerSide === "player" ? "enemy" : "player", msg: attacker.name + " MISSED!", ...snap(pBoard, eBoard) });
      return;
    }

    // Block first hit (Phase Knight, Sentinel, Reflex Agent)
    if (target._blockFirstHit) {
      target._blockFirstHit = false;
      events.push({ type: "hardshell", targetId: target.id, side: attackerSide === "player" ? "enemy" : "player", msg: target.name + " blocked first hit!", ...snap(pBoard, eBoard) });
      return;
    }

    // First attack multiplier (crits, double/triple damage)
    if (attacker._firstAtkMultiplier && !attacker._firstAtkUsed) {
      dmg *= attacker._firstAtkMultiplier;
      attacker._firstAtkUsed = true;
    }
    // Copy target ATK for first attack
    if (attacker._copyTargetAtk && !attacker._copyTargetAtkUsed) {
      dmg = target.atk;
      attacker._copyTargetAtkUsed = true;
    }
    // Berserk: double ATK when below 50%
    if (attacker._berserk && attacker.hp < attacker.maxHp * 0.5) dmg *= 2;
    // Execute multiplier: triple dmg to targets below 50%
    if (attacker._execDmgMultiplier && target.hp < target.maxHp * 0.5) dmg *= attacker._execDmgMultiplier;
    // Bonus flat damage
    if (attacker._bonusDmg) dmg += attacker._bonusDmg;
    if (attacker._bonusDmgIfKw && target.kw.length > 0) dmg += attacker._bonusDmgIfKw;

    // Hacker (6): double damage to silenced/keyword-less units
    if (attacker._doubleDmgSilenced && (target._silenced || target.kw.length === 0)) {
      dmg *= 2;
    }

    // Phantom dodge
    if (target._dodgeChance && Math.random() < target._dodgeChance) {
      if (target._dodgeAtkGain) {
        target.atk += target._dodgeAtkGain;
        events.push({ type: "scale", targetId: target.id, side: attackerSide === "player" ? "enemy" : "player", msg: `${target.name} +${target._dodgeAtkGain} ATK (dodge)`, ...snap(pBoard, eBoard) });
      }
      events.push({ type: "dodge", targetId: target.id, side: attackerSide === "player" ? "enemy" : "player", msg: `${target.name} Dodged!`, ...snap(pBoard, eBoard) });
      return;
    }
    // Ghost Network: shields grant 10% dodge
    if (target._shieldDodge && target.shield > 0 && Math.random() < 0.10) {
      events.push({ type: "dodge", targetId: target.id, side: attackerSide === "player" ? "enemy" : "player", msg: `${target.name} Shield Dodge!`, ...snap(pBoard, eBoard) });
      return;
    }
    // Hardshell blocks first hit
    if (target.hardshellActive) {
      target.hardshellActive = false;
      events.push({ type: "hardshell", targetId: target.id, side: attackerSide === "player" ? "enemy" : "player", msg: `${target.name} Hardshell blocked!`, ...snap(pBoard, eBoard) });
      if (attacker.droneFirstMalware) attacker.droneFirstMalware = false;
      return;
    }

    // Decrement stealth
    if (target._stealthLeft && target._stealthLeft > 0) target._stealthLeft--;
    // Ignore shield flag
    let shieldAbs = 0;
    const hadShield = target.shield > 0;
    if (target.shield > 0 && !attacker._ignoreShield) {
      let shieldDmg = dmg;
      if (attacker._shieldDmgBonus) shieldDmg = Math.floor(shieldDmg * attacker._shieldDmgBonus);
      shieldAbs = Math.min(target.shield, shieldDmg);
      target.shield -= shieldAbs;
      dmg -= Math.min(dmg, shieldAbs); // Don't reduce more than original dmg
    }

    // Flat damage reduction (Brick Golem, Iron Hide, adjacent auras)
    if (target._flatDmgReduce && dmg > 0) {
      dmg = Math.max(1, dmg - target._flatDmgReduce);
    }
    // Flat absorb (Stone Sentinel)
    if (target._flatAbsorb && target._flatAbsorb > 0 && dmg > 0) {
      const absorbed = Math.min(target._flatAbsorb, dmg);
      target._flatAbsorb -= absorbed;
      dmg -= absorbed;
    }
    // Augmented carry damage reduction
    if (target._dmgReduction && dmg > 0) {
      dmg = Math.max(1, Math.floor(dmg * (1 - target._dmgReduction)));
    }
    // Above 50% HP damage reduction
    if (target._dmgReduceAboveHalf && target.hp > target.maxHp * 0.5 && dmg > 0) {
      dmg = Math.max(1, Math.floor(dmg * (1 - target._dmgReduceAboveHalf)));
    }
    // Immune to effects during first N turns
    if (target._immuneTurns && target._immuneTurns > 0) {
      target._immuneTurns--;
    }

    // Psychic Wall: absorbs half of damage dealt to adjacent allies
    if (dmg > 0 && !target._adjacentTank) {
      const defBoard = attackerSide === "player" ? eBoard : pBoard;
      const tIdx = defBoard.indexOf(target);
      if (tIdx >= 0) {
        const adjTanks = [tIdx - 1, tIdx + 1]
          .filter(i => i >= 0 && i < defBoard.length)
          .map(i => defBoard[i])
          .filter(u => u._adjacentTank && u.hp > 0 && u.id !== target.id);
        if (adjTanks.length > 0) {
          const tank = adjTanks[0];
          const absorbed = Math.min(Math.floor(dmg * 0.5), tank.hp - 1);
          if (absorbed > 0) {
            dmg -= absorbed;
            tank.hp -= absorbed;
            absorbInfo = { tankId: tank.id, tankName: tank.name, absorbed };
          }
        }
      }
    }

    target.hp -= dmg;
    // Wire Rat: gain ATK on hit
    if (attacker._onHitGainAtk && dmg > 0) {
      attacker.atk += attacker._onHitGainAtk;
      events.push({ type: "scale", side: attackerSide, targetId: attacker.id, msg: `${attacker.name} +${attacker._onHitGainAtk} ATK (hit)`, ...snap(pBoard, eBoard) });
    }
    // Hive Mind: Drone damage is shared across all living Drones
    if (target.faction === "DRONE" && dmg > 0) {
      const allies = attackerSide === "player" ? eBoard : pBoard;
      const hasHiveMind = allies.some(u => u._droneShareDmg && u.hp > 0);
      if (hasHiveMind) {
        const hiveDrones = allies.filter(u => u.faction === "DRONE" && u.hp > 0 && u.id !== target.id);
        if (hiveDrones.length > 0) {
          target.hp += dmg; // restore, then redistribute
          const perDrone = Math.floor(dmg / (hiveDrones.length + 1));
          const remainder = dmg - perDrone * (hiveDrones.length + 1);
          target.hp -= (perDrone + remainder);
          hiveDrones.forEach(d => { d.hp -= perDrone; });
          hiveShareCount = hiveDrones.length;
        }
      }
    }
    // Hivemind T7: Drone HP pool (separate system)
    if (target._hiveHP !== undefined && dmg > 0) {
      const allies = attackerSide === "player" ? eBoard : pBoard;
      const hiveDrones = allies.filter(u => u._hiveHP !== undefined && u.hp > 0 && u.id !== target.id);
      if (hiveDrones.length > 0) {
        // Restore target HP, distribute dmg evenly
        target.hp += dmg;
        const perDrone = Math.floor(dmg / (hiveDrones.length + 1));
        const remainder = dmg - perDrone * (hiveDrones.length + 1);
        target.hp -= (perDrone + remainder);
        hiveDrones.forEach(d => { d.hp -= perDrone; });
      }
    }
    if (hasMalware && dmg > 0 && !target._immune) target.hp = 0; // Colossus is immune to malware
    if (hasMalware && attacker._malwareDebuff && !target._immune) { target.atk = Math.max(0, target.atk - attacker._malwareDebuff); }
    if (attacker.droneFirstMalware) attacker.droneFirstMalware = false;

    // Construct survive at 1 HP (once per combat)
    if (target.hp <= 0 && target._constructSurvive) {
      target.hp = 1;
      target._constructSurvive = false; // Only once
    }
    // Innate survive lethal (Juggernaut, Steel Spine — once per combat)
    if (target.hp <= 0 && target._surviveLethal) {
      target.hp = 1;
      target._surviveLethal = false;
    }

    // Psionic stun on shield break: if shield was fully consumed, stun the attacker
    if (hadShield && target.shield <= 0 && target._stunOnShieldBreak && !attacker._immune) {
      // Ascendant T7: stun lasts 5 turns instead of normal
      const hasAscendant = (attackerSide === "player" ? eBoard : pBoard).some(u => u._t7rule === "tripleShields");
      const stunDur = hasAscendant ? 5 : Math.ceil(target._stunOnShieldBreak);
      attacker._stunTurns = (attacker._stunTurns || 0) + stunDur;
    }

    // Counter-damage: target hits attacker back
    let counterAbs = 0;
    let counterDmg = target.atk;
    // Augmented carry damage reduction on counter too
    if (attacker._dmgReduction && counterDmg > 0) {
      counterDmg = Math.max(1, Math.floor(counterDmg * (1 - attacker._dmgReduction)));
    }
    if (attacker.shield > 0) { counterAbs = Math.min(attacker.shield, counterDmg); attacker.shield -= counterAbs; counterDmg -= counterAbs; }
    // Apply attacker's flat damage reduction to counter damage
    if (attacker._flatDmgReduce && counterDmg > 0) counterDmg = Math.max(1, counterDmg - attacker._flatDmgReduce);
    if (attacker._flatAbsorb && attacker._flatAbsorb > 0 && counterDmg > 0) {
      const abs = Math.min(attacker._flatAbsorb, counterDmg);
      attacker._flatAbsorb -= abs; counterDmg -= abs;
    }
    if (attacker._dmgReduceAboveHalf && attacker.hp > attacker.maxHp * 0.5 && counterDmg > 0) {
      counterDmg = Math.max(1, Math.floor(counterDmg * (1 - attacker._dmgReduceAboveHalf)));
    }
    attacker.hp -= counterDmg;
    // Survive lethal from counter damage
    if (attacker.hp <= 0 && attacker._constructSurvive) { attacker.hp = 1; attacker._constructSurvive = false; }
    if (attacker.hp <= 0 && attacker._surviveLethal) { attacker.hp = 1; attacker._surviveLethal = false; }
    const killed = target.hp <= 0;
    const counterKilled = attacker.hp <= 0;
    events.push({ type: "attack", side: attackerSide, attackerId: attacker.id, targetId: target.id, damage: dmg + shieldAbs, actualDmg: dmg, shieldAbsorbed: shieldAbs, killed, counterDmg: counterDmg + counterAbs, actualCounterDmg: counterDmg, counterAbs, counterKilled, malware: hasMalware && killed, attackerEmoji: attacker.emoji, targetEmoji: target.emoji, attackerName: attacker.name, targetName: target.name, attackerFaction: attacker.faction, absorbInfo, hiveShareCount, goldEarned, ...snap(pBoard, eBoard) });

    // ── INNATE ON-HIT EFFECTS ──
    if (attacker.hp > 0 && target.hp > 0 && !target._immune && !target._immuneToEffects) {
      if (attacker._onHitStealAtk) {
        const steal = attacker._onHitStealAtk;
        target.atk = Math.max(0, target.atk - steal);
        attacker.atk += steal;
      }
      if (attacker._onHitStealStats) {
        target.atk = Math.max(0, target.atk - 1);
        attacker.atk += 1;
      }
      if (attacker._onHitReduceMaxHp) {
        target.maxHp = Math.max(1, target.maxHp - 1);
        target.hp = Math.min(target.hp, target.maxHp);
      }
      if (attacker._onHitRemoveKw && target.kw.length > 0) {
        const removed = target.kw.splice(Math.floor(Math.random() * target.kw.length), 1)[0];
        if (removed) delete target.kwData[removed];
      }
      if (attacker._onHitInfect && !target._infected) {
        target._infected = true; target._infectionDmg = 1;
        // Contagion: infected enemies deal -1 ATK
        const atkBoard = attackerSide === "player" ? pBoard : eBoard;
        if (atkBoard.some(u => u._infectionAtkDebuff)) target.atk = Math.max(0, target.atk - 1);
      }
      if (attacker._onHitSpreadInfect) {
        const defSide = attackerSide === "player" ? eBoard : pBoard;
        const atkBoard = attackerSide === "player" ? pBoard : eBoard;
        const hasContagion = atkBoard.some(u => u._infectionAtkDebuff);
        const tIdx = defSide.indexOf(target);
        [tIdx-1, tIdx+1].filter(i => i >= 0 && i < defSide.length).forEach(ai => {
          if (!defSide[ai]._infected) {
            defSide[ai]._infected = true; defSide[ai]._infectionDmg = 1;
            if (hasContagion) defSide[ai].atk = Math.max(0, defSide[ai].atk - 1);
          }
        });
      }
      if (attacker._firstAtkSilence && !attacker._firstAtkSilenceUsed) {
        attacker._firstAtkSilenceUsed = true;
        if (target.kw.length > 0) {
          const removed = target.kw.splice(Math.floor(Math.random() * target.kw.length), 1)[0];
          if (removed) delete target.kwData[removed];
        }
      }
      if (attacker._splashOneRandom) {
        const others = (attackerSide === "player" ? eBoard : pBoard).filter(e => e.hp > 0 && e.id !== target.id);
        if (others.length > 0) {
          const extra = others[Math.floor(Math.random() * others.length)];
          extra.hp -= attacker.atk;
          if (extra.hp <= 0) {
            const defArr = attackerSide === "player" ? eBoard : pBoard;
            const ei = defArr.indexOf(extra);
            if (ei >= 0) defArr.splice(ei, 1);
            handleDeath(extra, defArr, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player");
          }
        }
      }
    }
    if (attacker._swapAfterAttack && attacker.hp > 0) {
      const allies = attackerSide === "player" ? pBoard : eBoard;
      if (allies.length > 1) {
        const otherIdx = Math.floor(Math.random() * allies.length);
        const myIdx = allies.indexOf(attacker);
        if (otherIdx !== myIdx && myIdx >= 0) [allies[myIdx], allies[otherIdx]] = [allies[otherIdx], allies[myIdx]];
      }
    }
    // Track attack counter for every-3rd effects
    if (attacker._attackCounter !== undefined) attacker._attackCounter++;
    if (attacker._aoeEvery3 && attacker._attackCounter % 3 === 0 && attacker.hp > 0) {
      const enemies = attackerSide === "player" ? eBoard : pBoard;
      enemies.filter(e => e.hp > 0 && e.id !== target.id).forEach(e => {
        e.hp -= attacker.atk;
      });
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].hp <= 0) {
          const dead = enemies[i]; enemies.splice(i, 1);
          handleDeath(dead, enemies, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player");
        }
      }
    }
    // Heal on attack
    if (attacker._healOnAttack && attacker.hp > 0) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker._healOnAttack);
    }
    // On-damaged ATK gain
    if (target.hp > 0 && target._onDamagedAtkGain && dmg > 0) {
      target.atk += target._onDamagedAtkGain;
    }
    // Dream Walker: swap position with attacker when hit
    if (target.hp > 0 && target._swapOnHit) {
      const atkAllies = attackerSide === "player" ? pBoard : eBoard;
      const defAllies = attackerSide === "player" ? eBoard : pBoard;
      const atkIdx = atkAllies.indexOf(attacker);
      const defIdx = defAllies.indexOf(target);
      // Swap visual positions (move target to front, push attacker back)
      if (atkIdx >= 0 && defIdx >= 0) {
        // Just swap within defender array to simulate repositioning
        if (defIdx > 0) { [defAllies[defIdx], defAllies[0]] = [defAllies[0], defAllies[defIdx]]; }
      }
    }
    // Execute threshold (Void Reaper: 33%)
    if (target.hp > 0 && attacker._executeBelow && target.hp < target.maxHp * attacker._executeBelow) {
      target.hp = 0;
      events.push({ type: "execute_destroy", side: attackerSide, unitId: attacker.id, victimId: target.id, msg: attacker.name + " EXECUTED " + target.name + "!", ...snap(pBoard, eBoard) });
    }

    // Synth scaling: gain stats after each attack
    if (attacker._synthScale && attacker.hp > 0) {
      const synthMult = attacker._synthScaleMultiplier || 1;
      attacker.atk += attacker._synthScale * synthMult;
      if (attacker._synthScale >= 2) { attacker.hp += attacker._synthScale * synthMult; attacker.maxHp += attacker._synthScale * synthMult; }
    }

    // Regen: heal after attacking
    if (attacker.kw.includes("regen") && attacker.hp > 0) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + 2);
    }

    // Phantom stealth on kill
    if (killed && attacker._phantomStealthOnKill && attacker.hp > 0) {
      attacker._stealthLeft = 2;
    }

    // ── INNATE ON-KILL EFFECTS ──
    if (killed && attacker.hp > 0) {
      if (attacker._onKillAtkGain) { attacker.atk += attacker._onKillAtkGain; attacker._killsThisCombat = (attacker._killsThisCombat || 0) + 1; if (attacker._permanentKillGain) { attacker._permAtkGained = (attacker._permAtkGained || 0) + attacker._onKillAtkGain; } }
      if (attacker._onKillHpGain) { attacker.hp += attacker._onKillHpGain; attacker.maxHp += attacker._onKillHpGain; if (attacker._permanentKillGain) { attacker._permHpGained = (attacker._permHpGained || 0) + attacker._onKillHpGain; } }
      if (attacker._onKillHealFull) attacker.hp = attacker.maxHp;
      if (attacker._onKillHealHalf) attacker.hp = Math.min(attacker.maxHp, Math.max(attacker.hp, Math.floor(attacker.maxHp * 0.5)));
      if (attacker._onKillStealth) attacker._stealthLeft = 2;
      if (attacker._onKillGainVictimAtk) attacker.atk += target.atk;
      // Ransomware: gain gold equal to victim's tier
      if (attacker._onKillGoldPerTier) {
        const tierGold = target.tier || 1;
        if (attackerSide === "player") { pGoldEarned += tierGold; goldEarned = tierGold; }
        else eGoldEarned += tierGold;
      }
      if (attacker._onKillGainHighestStat) {
        const gain = Math.max(target.atk, target.maxHp);
        attacker.atk += Math.floor(gain * 0.5); attacker.hp += Math.floor(gain * 0.5); attacker.maxHp += Math.floor(gain * 0.5);
      }
      if (attacker._onKillSplash) {
        const enemies = attackerSide === "player" ? eBoard : pBoard;
        const killSplashKills = [];
        enemies.filter(e => e.hp > 0 && e.id !== target.id).forEach(e => {
          e.hp -= attacker._onKillSplash;
          if (e.hp <= 0) killSplashKills.push(e);
        });
        killSplashKills.forEach(e => {
          const idx = enemies.indexOf(e);
          if (idx >= 0) enemies.splice(idx, 1);
          handleDeath(e, enemies, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player");
        });
      }
      if (attacker._onKillExtraAttack && !attacker._extraAttackUsedThisTurn) {
        attacker._extraAttackUsedThisTurn = true; // One extra attack per round (reset in combat loop)
        const enemies = attackerSide === "player" ? eBoard : pBoard;
        const alive = enemies.filter(e => e.hp > 0);
        if (alive.length > 0) doAttack(attacker, enemies, attackerSide);
      }
      // Untargetable until attack: re-stealth consumed on first attack
      if (attacker._untargetableUntilAttack && attacker._stealthLeft === 99) {
        attacker._stealthLeft = 0; // Consumed after first attack
      }
    }

    // Cleave: damage units adjacent to target
    if (attacker.kw.includes("cleave") && attacker.hp > 0 && attacker.atk > 0) {
      const deadTgtOrigIdx = defenders.findIndex(u => u.id === target.id);
      const adjIdxs = [deadTgtOrigIdx - 1, deadTgtOrigIdx + 1].filter(i => i >= 0 && i < defenders.length);
      const cleaveKills = [];
      adjIdxs.forEach(ai => {
        const adj = defenders[ai];
        if (!adj || adj.hp <= 0 || adj.id === target.id) return;
        let cleaveDmg = attacker.atk;
        let cleaveShieldAbs = 0;
        if (adj.shield > 0) { cleaveShieldAbs = Math.min(adj.shield, cleaveDmg); adj.shield -= cleaveShieldAbs; cleaveDmg -= cleaveShieldAbs; }
        adj.hp -= cleaveDmg;
        if (adj.hp <= 0 && adj._constructSurvive) { adj.hp = 1; adj._constructSurvive = false; }
        events.push({ type: "cleave", side: attackerSide, attackerId: attacker.id, attackerName: attacker.name, targetId: adj.id, targetName: adj.name, damage: attacker.atk, shieldAbsorbed: cleaveShieldAbs, killed: adj.hp <= 0, ...snap(pBoard, eBoard) });
        if (adj.hp <= 0) cleaveKills.push(adj);
      });
      cleaveKills.forEach(adj => {
        const idx = defenders.indexOf(adj);
        if (idx >= 0) defenders.splice(idx, 1);
        handleDeath(adj, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player");
      });
    }
    // Splash: 50% ATK to all OTHER enemies
    if (attacker.kw.includes("splash") && attacker.hp > 0) {
      const splashDmg = Math.max(1, Math.floor(attacker.atk * 0.5));
      const splashKills = [];
      defenders.filter(u => u.hp > 0 && u.id !== target.id).forEach(adj => {
        let sDmg = splashDmg;
        let sAbs = 0;
        if (adj.shield > 0) { sAbs = Math.min(adj.shield, sDmg); adj.shield -= sAbs; sDmg -= sAbs; }
        adj.hp -= sDmg;
        if (adj.hp <= 0 && adj._constructSurvive) { adj.hp = 1; adj._constructSurvive = false; }
        events.push({ type: "splash", side: attackerSide, attackerId: attacker.id, attackerName: attacker.name, targetId: adj.id, targetName: adj.name, damage: splashDmg, shieldAbsorbed: sAbs, killed: adj.hp <= 0, ...snap(pBoard, eBoard) });
        if (adj.hp <= 0) splashKills.push(adj);
      });
      // Process splash kills: splice + handleDeath
      splashKills.forEach(adj => {
        const idx = defenders.indexOf(adj);
        if (idx >= 0) defenders.splice(idx, 1);
        handleDeath(adj, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player");
      });
    }
    // Clean cleave/splash kills
    // FIRST: handle counter-killed attacker BEFORE filtering boards
    if (counterKilled) {
      const attackers = attackerSide === "player" ? pBoard : eBoard;
      const idx = attackers.indexOf(attacker);
      if (idx >= 0) attackers.splice(idx, 1);
      handleDeath(attacker, attackers, defenders, attackerSide);
    }
    // Thorns
    if (target.mod?.effect?.thorns && attacker.hp > 0) {
      attacker.hp -= target.mod.effect.thorns;
      events.push({ type: "thorns", targetId: attacker.id, damage: target.mod.effect.thorns, ...snap(pBoard, eBoard) });
    }

    if (killed) {
      if (attacker.mod?.effect?.lifesteal) attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker.mod.effect.lifesteal);
      doExecute(attacker, attackerSide);
      const deadIdx = defenders.indexOf(target);
      if (deadIdx >= 0) defenders.splice(deadIdx, 1);
      handleDeath(target, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player");
      // VIRUS overflow: overkill damage spreads
      if (attacker._overflowRatio && attacker._overflowRatio > 0 && defenders.length > 0) {
        const overkill = Math.min(20, Math.abs(target.hp));
        const overflowDmg = Math.max(1, Math.floor(overkill * attacker._overflowRatio));
        if (overflowDmg > 0) {
          const nextTarget = defenders[Math.floor(Math.random() * defenders.length)];
          if (nextTarget && nextTarget.hp > 0) {
            let oDmg = overflowDmg;
            let oAbs = 0;
            if (!attacker._overflowIgnoreShield && nextTarget.shield > 0) { oAbs = Math.min(nextTarget.shield, oDmg); nextTarget.shield -= oAbs; oDmg -= oAbs; }
            nextTarget.hp -= oDmg;
            if (nextTarget.hp <= 0 && nextTarget._constructSurvive) { nextTarget.hp = 1; nextTarget._constructSurvive = false; }
            events.push({ type: "overflow", side: attackerSide, attackerId: attacker.id, attackerName: attacker.name, targetId: nextTarget.id, targetName: nextTarget.name, damage: overflowDmg, shieldAbsorbed: oAbs, killed: nextTarget.hp <= 0, ...snap(pBoard, eBoard) });
            if (nextTarget.hp <= 0) {
              const oi = defenders.indexOf(nextTarget); if (oi >= 0) defenders.splice(oi, 1);
              handleDeath(nextTarget, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player");
            }
          }
        }
      }
    }

    // Attacker died to thorns (only if not already handled by counter-kill above)
    if (attacker.hp <= 0 && !counterKilled) {
      const attackers = attackerSide === "player" ? pBoard : eBoard;
      const idx = attackers.indexOf(attacker);
      if (idx >= 0) {
        attackers.splice(idx, 1);
        handleDeath(attacker, attackers, defenders, attackerSide);
      }
      // If idx < 0, attacker was already spliced (e.g., killed by deadswitch AoE) — skip
    }

    // Clean up any 0 HP units from execute_destroy — splice to preserve references
    for (let i = pBoard.length - 1; i >= 0; i--) if (pBoard[i].hp <= 0) pBoard.splice(i, 1);
    for (let i = eBoard.length - 1; i >= 0; i--) if (eBoard[i].hp <= 0) eBoard.splice(i, 1);
  };

  let turnsSinceLastDeath = 0;
  // Synth extra turns extend the combat
  const pExtraTurns = pBoard._synthExtraTurns || 0;
  const eExtraTurns = eBoard._synthExtraTurns || 0;
  // Overclock chip: +6 extra turns
  const overclockBonus = (pBoard._overclockBonus ? 6 : 0) + (eBoard._overclockBonus ? 6 : 0);
  const maxTurns = 60 + Math.max(pExtraTurns, eExtraTurns) + overclockBonus;

  while (pBoard.length > 0 && eBoard.length > 0 && turn < maxTurns) {
    turn++;
    const pBefore = pBoard.length, eBefore = eBoard.length;

    // Psionic shield regen: all units with _shieldRegen regain shield each turn
    [...pBoard, ...eBoard].forEach(u => {
      if (u._shieldRegen && u.hp > 0) u.shield = (u.shield || 0) + u._shieldRegen;
    });

    // ── INNATE PER-TURN PASSIVES ──
    const runPassives = (board, enemy) => {
      board.forEach(u => {
        if (u.hp <= 0) return;
        // Heal lowest ally
        if (u._healLowestPerTurn) {
          const lowest = board.filter(a => a.hp > 0 && a.hp < a.maxHp).sort((a,b) => a.hp - b.hp)[0];
          if (lowest) lowest.hp = Math.min(lowest.maxHp, lowest.hp + u._healLowestPerTurn);
        }
        // Heal all drones
        if (u._healDronesPerTurn) {
          board.filter(a => a.faction === "DRONE" && a.hp > 0).forEach(a => { a.hp = Math.min(a.maxHp, a.hp + u._healDronesPerTurn); });
        }
        // Self heal
        if (u._selfHealPerTurn) u.hp = Math.min(u.maxHp, u.hp + u._selfHealPerTurn);
        // Random buff
        if (u._randomBuffPerTurn) { u.atk += 1; u.hp += 1; u.maxHp += 1; }
        // Mutagen: +1/+1 each combat turn
        if (u._growPerTurn) { u.atk += 1; u.hp += 1; u.maxHp += 1; }
        // AoE tick damage to all enemies
        if (u._aoeTickDmg) {
          enemy.forEach(e => { if (e.hp > 0) e.hp -= u._aoeTickDmg; });
        }
        // Infection tick damage
        if (u._infected && u._infectionDmg) {
          // Omega Strain: infection multiplier from opposing board
          const mult = board.some(a => a._infectionMultiplier) ? board.find(a => a._infectionMultiplier)._infectionMultiplier : 1;
          u.hp -= Math.floor(u._infectionDmg * mult);
        }
      });
      // Clean infection deaths
      for (let i = enemy.length - 1; i >= 0; i--) {
        if (!enemy[i]) { enemy.splice(i, 1); continue; }
        if (enemy[i].hp <= 0) {
          const dead = enemy[i]; enemy.splice(i, 1);
          handleDeath(dead, enemy, board, enemy === eBoard ? "enemy" : "player");
        }
      }
    };
    runPassives(pBoard, eBoard);
    runPassives(eBoard, pBoard);
    // Emit passives snapshot so renderer/fuzzer can see heal/tick/infection changes
    events.push({ type: "passives", ...snap(pBoard, eBoard) });

    // Heal-all-on-ally-death tracking (set flag, resolved in handleDeath)


    if (pBoard.length > 0 && eBoard.length > 0) {
      const attIdx = pIdx % pBoard.length;
      const att = pBoard[attIdx];
      // DDoS Node: enemy _enemySlowdown causes 30% skip
      const pSlowed = eBoard.some(u => u._enemySlowdown);
      const pSkipDDoS = pSlowed && Math.random() < 0.3;
      if (att.hp > 0 && !pSkipDDoS) {
        const attId = att.id;
        att._extraAttackUsedThisTurn = false;
        let atkCount = att._droneMultiAtk || 1; if(netEvt?.id==="overclock_event") atkCount*=2;
        if (att._doubleAttackEvery3 && att._attackCounter !== undefined && att._attackCounter % 3 === 0) atkCount *= 2;
        for (let i = 0; i < atkCount && eBoard.length > 0 && att.hp > 0; i++) doAttack(att, eBoard, "player");
        if (pBoard.length > 0) {
          const si = pBoard.findIndex(u => u.id === attId);
          pIdx = si >= 0 ? (si + 1) % pBoard.length : attIdx % pBoard.length;
        }
      } else {
        if (pSkipDDoS) events.push({ type: "slowdown", side: "player", unitId: att.id, unitName: att.name, ...snap(pBoard, eBoard) });
        pIdx = (pIdx + 1) % pBoard.length;
      }
    }
    if (pBoard.length > 0 && eBoard.length > 0) {
      const attIdx = eIdx % eBoard.length;
      const att = eBoard[attIdx];
      // DDoS Node: player _enemySlowdown causes 30% skip
      const eSlowed = pBoard.some(u => u._enemySlowdown);
      const eSkipDDoS = eSlowed && Math.random() < 0.3;
      if (att.hp > 0 && !eSkipDDoS) {
        const attId = att.id;
        att._extraAttackUsedThisTurn = false;
        let atkCount = att._droneMultiAtk || 1; if(netEvt?.id==="overclock_event") atkCount*=2;
        if (att._doubleAttackEvery3 && att._attackCounter !== undefined && att._attackCounter % 3 === 0) atkCount *= 2;
        for (let i = 0; i < atkCount && pBoard.length > 0 && att.hp > 0; i++) doAttack(att, pBoard, "enemy");
        if (eBoard.length > 0) {
          const si = eBoard.findIndex(u => u.id === attId);
          eIdx = si >= 0 ? (si + 1) % eBoard.length : attIdx % eBoard.length;
        }
      } else {
        if (eSkipDDoS) events.push({ type: "slowdown", side: "enemy", unitId: att.id, unitName: att.name, ...snap(pBoard, eBoard) });
        eIdx = (eIdx + 1) % eBoard.length;
      }
    }
    // Stalemate detection: if no deaths for 12 consecutive turns, force draw
    if (pBoard.length === pBefore && eBoard.length === eBefore) { turnsSinceLastDeath++; } else { turnsSinceLastDeath = 0; }
    if (turnsSinceLastDeath >= 12) { events.push({ type: "announce", msg: "STALEMATE — DRAW!" }); break; }
  }

  // Chrono Weaver T7: after round 1, revive dead units at 50% HP for round 2
  if (chronoActive && chronoRound === 1) {
    chronoRound = 2;
    events.push({ type: "announce", msg: "⟐ CHRONO WEAVER: TIME REWINDS! Round 2!" });
    // Find units that died (in snapshots but not in current boards)
    const pAlive = new Set(pBoard.map(u => u.id));
    const eAlive = new Set(eBoard.map(u => u.id));
    chronoSnapP.filter(u => !pAlive.has(u.id)).forEach(u => {
      const rev = { ...u, hp: Math.max(1, Math.floor(u.maxHp * 0.5)), kw: [...u.kw], kwData: { ...u.kwData } };
      pBoard.push(rev);
    });
    chronoSnapE.filter(u => !eAlive.has(u.id)).forEach(u => {
      const rev = { ...u, hp: Math.max(1, Math.floor(u.maxHp * 0.5)), kw: [...u.kw], kwData: { ...u.kwData } };
      eBoard.push(rev);
    });
    events.push({ type: "start", ...snap(pBoard, eBoard) });
    // Run combat loop round 2
    pIdx = 0; eIdx = 0; turn = 0; turnsSinceLastDeath = 0;
    for (; turn < maxTurns && pBoard.length > 0 && eBoard.length > 0; turn++) {
      const pBefore2 = pBoard.length, eBefore2 = eBoard.length;
      if (pIdx < pBoard.length) {
        const att = pBoard[pIdx];
        const attId = att.id;
        att._extraAttackUsedThisTurn = false;
        let atkCount2 = att._droneMultiAtk || 1; if(netEvt?.id==="overclock_event") atkCount2*=2;
        for (let i = 0; i < atkCount2 && eBoard.length > 0 && att.hp > 0; i++) doAttack(att, eBoard, "player");
        if (pBoard.length > 0) {
          const si = pBoard.findIndex(u => u.id === attId);
          pIdx = si >= 0 ? (si + 1) % pBoard.length : pIdx % pBoard.length;
        }
      }
      if (eIdx < eBoard.length) {
        const att = eBoard[eIdx];
        const attId = att.id;
        att._extraAttackUsedThisTurn = false;
        let atkCount2 = att._droneMultiAtk || 1; if(netEvt?.id==="overclock_event") atkCount2*=2;
        for (let i = 0; i < atkCount2 && pBoard.length > 0 && att.hp > 0; i++) doAttack(att, pBoard, "enemy");
        if (eBoard.length > 0) {
          const si = eBoard.findIndex(u => u.id === attId);
          eIdx = si >= 0 ? (si + 1) % eBoard.length : eIdx % eBoard.length;
        }
      }
      if (pBoard.length === pBefore2 && eBoard.length === eBefore2) { turnsSinceLastDeath++; } else { turnsSinceLastDeath = 0; }
      if (turnsSinceLastDeath >= 12) { events.push({ type: "announce", msg: "STALEMATE — DRAW!" }); break; }
    }
  }

  // If both sides still have units (timeout or stalemate), it's a DRAW
  const timedOut = pBoard.length > 0 && eBoard.length > 0;
  const pw = !timedOut && pBoard.length > 0;
  const draw = timedOut || (pBoard.length === 0 && eBoard.length === 0);
  let dmg = draw ? 0 : (pw ? pBoard.reduce((s, u) => s + u.tier, 0) + 1 : eBoard.reduce((s, u) => s + u.tier, 0) + 1);
  // Emergency Patch: reduce damage taken if player lost
  if (!pw && !draw && pBoard._emergencyPatch) dmg = Math.max(1, dmg - pBoard._emergencyPatch);
  // Overclock bonus: if active, extra turn benefit was already given via combat loop
  // Collect permanent kill gains for units with permanentKillGain flag
  const permanentGains = pBoard.filter(u => u._permanentKillGain && (u._permAtkGained || u._permHpGained))
    .map(u => ({ id: u.id, tn: u.tn || u.name, atkGain: u._permAtkGained || 0, hpGain: u._permHpGained || 0 }));

  events.push({ type: "result", playerWon: pw, draw, dmgToLoser: dmg, pVirusBleed, eVirusBleed, permanentGains, pGoldEarned, pBoard: pBoard.map(u => ({ ...u })), eBoard: eBoard.map(u => ({ ...u })) });
  return { playerWon: pw, draw, dmgToLoser: dmg, pVirusBleed, eVirusBleed, events, permanentGains, pGoldEarned };
}


module.exports = { U, T7_UNITS, mkUnit, simCombat, setupInnateFlags, gid };
