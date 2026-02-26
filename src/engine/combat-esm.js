// ═══ DATA IMPORTS (Phase 1: Single Source of Truth) ═══
import UNITS_DATA from '../data/units.json';
import T7_UNITS_DATA from '../data/t7-units.json';
import CROSS_COMBOS from '../data/combos.json';
import CONFIG from '../data/config.json';

const MAX_BOARD_SIZE = CONFIG.maxBoardSize;

// Map JSON to internal short format
const U = UNITS_DATA.map(u => ({
  name: u.name, f: u.faction, t: u.tier, a: u.atk, h: u.hp, e: u.emoji,
  kw: [...u.keywords], kwData: { ...u.kwData }, innate: u.innate || '',
  _chipFree: u.chipFree || false, role: u.role || 'Sentinel'
}));

const T7_UNITS = T7_UNITS_DATA.map(u => ({
  name: u.name, f: u.faction, t: u.tier, a: u.atk, h: u.hp, e: u.emoji,
  kw: [...u.keywords], kwData: { ...u.kwData },
  _t7rule: u.t7rule || null, role: u.role || 'Sentinel'
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
    role: tmpl.role || 'Sentinel', innate: tmpl.innate || null };
}

// rollShop and genEnemy live in App.jsx (they depend on unitPool state)


// Boss generation lives in App.jsx (uses bosses.json data)

// ═══ ABILITY SYSTEM (Phase 2: Data-driven, no regex) ═══
import ABILITY_MAP from '../data/unit-abilities.json';
import { setupInnateFlags, setAbilityMap } from './AbilitySystem.js';
setAbilityMap(ABILITY_MAP);


// === COMBAT ENGINE WITH KEYWORDS ===
function simCombat(pOrig, eOrig, op=null, netEvt=null) {
  const snap = (p, e) => ({ pBoard: p.map(u => ({ ...u, kw: [...u.kw], kwData: { ...u.kwData } })), eBoard: e.map(u => ({ ...u, kw: [...u.kw], kwData: { ...u.kwData } })) });
  const events = [];
  const pDead = []; // Track dead player units for Resummon effects
  const eDead = []; // Track dead enemy units for Resummon effects

  let pBoard = pOrig.map(u => ({ ...u, kw: [...(u.kw||[])], kwData: { ...(u.kwData||{}) }, shield: u.shield || 0, hardshellActive: (u.kw||[]).includes("hardshell") }));
  let eBoard = eOrig.map(u => ({ ...u, kw: [...(u.kw||[])], kwData: { ...(u.kwData||{}) }, shield: u.shield || 0, hardshellActive: (u.kw||[]).includes("hardshell") }));

  // Stamp original board position for frontline/backline targeting (survives unit death/splice)
  pBoard.forEach((u, i) => { u._boardPos = i; });
  eBoard.forEach((u, i) => { u._boardPos = i; });

  // 1. Faction buffs (v5: unique win conditions, not stat buffs)
  let pVirusBleed = 0; // Tracks direct player damage from Virus deaths
  let eVirusBleed = 0;
  let pGoldEarned = 0; // Gold earned from Ransomware kills
  let eGoldEarned = 0;
  const applyFaction = (board, enemyBoard, side) => {
    const c = {};
    board.forEach(u => { c[u.faction] = (c[u.faction] || 0) + 1; });
    // Wildcard units (Merc For Hire) count as +1 for ONE faction (the one with the most units)
    // Note: _wildcard flag is set by setupInnateFlags which runs AFTER this,
    // so we check ABILITY_MAP directly for wildcard units
    const wildcards = board.filter(u => {
      const tn = u.tn || u.name.replace(/^Golden /, '');
      const ab = ABILITY_MAP[tn];
      return u._wildcard || (ab && ab.flags && ab.flags.wildcard);
    });
    const NON_NEUTRAL = ["SYNTH","HACKER","AUGMENTED","DRONE","PSIONIC","VIRUS","PHANTOM","CONSTRUCT"];
    wildcards.forEach(wc => {
      let bestF = null, bestC = 0;
      NON_NEUTRAL.forEach(f => {
        if ((c[f] || 0) > bestC) { bestC = c[f]; bestF = f; }
      });
      if (bestF) { c[bestF] += 1; wc._wildcardFaction = bestF; }
    });

    // NEUTRAL combat bonus: Adaptable fighters
    if (c.NEUTRAL >= 3) {
      board.filter(u => u.faction === "NEUTRAL").forEach(u => { u.atk += 2; u.hp += 1; u.maxHp += 1; });
      events.push({ type: "announce", side, msg: `⚪ Neutral 3+: Neutrals gain +2/+1`, ...snap(pBoard, eBoard) });
    }

    // SYNTH — The Engine: scaling per attack in combat
    if (c.SYNTH >= 2) {
      const tier = c.SYNTH >= 6 ? 3 : c.SYNTH >= 4 ? 2 : 1;
      board.filter(u => u.faction === "SYNTH").forEach(u => {
        u._synthScale = tier; // +tier ATK per attack (at 4+: +HP too)
      });
      // (4) Combat timer extension handled in combat loop via extra turns
      if (c.SYNTH >= 4) board._synthExtraTurns = 10;
      if (c.SYNTH >= 6) board._synthExtraTurns = 20;
      const desc = c.SYNTH >= 6 ? "Synth 6: +3/+3 per attack, +20 extra turns" : c.SYNTH >= 4 ? "Synth 4: +2/+2 per attack, +10 extra turns" : "Synth 2: +1 ATK per attack";
      events.push({ type: "announce", side, msg: `⚙️ ${desc}`, ...snap(pBoard, eBoard) });
    }

    // HACKER — The Saboteur: steal ATK + silence keywords
    if (c.HACKER >= 2) {
      const stealPerHacker = c.HACKER >= 6 ? 3 : c.HACKER >= 4 ? 2 : 2;
      // Each hacker steals from a random enemy (re-filter each pick to skip drained targets)
      const hackers = board.filter(u => u.faction === "HACKER");
      let totalStolen = 0;
      hackers.forEach(h => {
        const alive = enemyBoard.filter(u => u.atk > 0);
        if (alive.length === 0) return;
        const victim = alive[Math.floor(Math.random() * alive.length)];
        const steal = Math.min(stealPerHacker, victim.atk);
        victim.atk -= steal;
        h.atk += steal;
        totalStolen += steal;
      });
      // (4+) Silence random enemy keywords
      // (4+) Silence random enemy keywords — DEFERRED until both sides have keywords
      if (c.HACKER >= 4) {
        board._pendingHackerSilence = { count: c.HACKER >= 6 ? 2 : 1, side };
      }
      // (6) Double damage to silenced/keyword-less units
      if (c.HACKER >= 6) {
        board.filter(u => u.faction === "HACKER").forEach(u => { u._doubleDmgSilenced = true; });
      }
      if (totalStolen > 0) {
        events.push({ type: "hack", side, msg: `Hackers stole ${totalStolen} ATK across ${hackers.length} units!`, ...snap(pBoard, eBoard) });
      }
      const desc = c.HACKER >= 6 ? `Hacker 6: Steal ${stealPerHacker}/hacker, silence ×2, 2× dmg silenced` : c.HACKER >= 4 ? `Hacker 4: Steal ${stealPerHacker}/hacker, silence keywords` : `Hacker 2: Steal ${stealPerHacker} ATK per hacker`;
      events.push({ type: "announce", side, msg: `🔓 ${desc}`, ...snap(pBoard, eBoard) });
    }

    // VIRUS — The Plague: bleed damage to enemy player on Virus death
    if (c.VIRUS >= 2) {
      const bleedPerDeath = c.VIRUS >= 6 ? 2 : c.VIRUS >= 4 ? 1 : 1;
      board.filter(u => u.faction === "VIRUS").forEach(u => {
        u._virusBleed = bleedPerDeath;
        if (c.VIRUS >= 4) u._virusDeathAtk = 1; // +1 ATK to remaining Virus on any death
        if (c.VIRUS >= 6) u._virusPermanentDebuff = true; // enemy strongest loses -1/-1 permanently
      });
      const desc = c.VIRUS >= 6 ? `Virus 6: ${bleedPerDeath} bleed/death, +1 ATK on death, perm debuff` : c.VIRUS >= 4 ? `Virus 4: ${bleedPerDeath} bleed/death, +1 ATK on death` : `Virus 2: ${bleedPerDeath} bleed per death`;
      events.push({ type: "announce", side, msg: `🦠 ${desc}`, ...snap(pBoard, eBoard) });
    }

    // DRONE — The Swarm: multi-attack + death buffs
    if (c.DRONE >= 2) {
      board.filter(u => u.faction === "DRONE").forEach(u => {
        u._droneMultiAtk = c.DRONE >= 4 ? 3 : 2;
        if (c.DRONE >= 4) u._droneDeathBuff = true; // +1 ATK perm to all Drones on Drone death
        if (c.DRONE >= 6) u._droneFullBoardBonus = (board.filter(x => x.faction === "DRONE").length >= 7);
      });
      // (6) Full board bonus: all Drones +2/+2
      if (c.DRONE >= 6 && board.filter(x => x.faction === "DRONE").length >= 7) {
        board.filter(u => u.faction === "DRONE").forEach(u => { u.atk += 2; u.hp += 2; u.maxHp += 2; });
      }
      const desc = c.DRONE >= 6 ? "Drone 6: 3× attacks, death buff, +2/+2 full board" : c.DRONE >= 4 ? "Drone 4: 3× attacks, +1 ATK on Drone death" : "Drone 2: 2× attacks";
      events.push({ type: "announce", side, msg: `🤖 ${desc}`, ...snap(pBoard, eBoard) });
    }

    // PHANTOM — The Ghost: dodge + assassination + phantom strikes
    if (c.PHANTOM >= 2) {
      const fullDodge = c.PHANTOM >= 6 ? 0.50 : c.PHANTOM >= 4 ? 0.40 : 0.30;
      const allyDodge = c.PHANTOM >= 6 ? 0.25 : c.PHANTOM >= 4 ? 0.20 : 0.20;
      const bonusDmg = c.PHANTOM >= 6 ? 6 : c.PHANTOM >= 4 ? 5 : 4;
      board.forEach(u => {
        const isPhantom = u.faction === "PHANTOM";
        u._dodgeChance = Math.min(0.50, (u._dodgeChance || 0) + (isPhantom ? fullDodge : allyDodge));
        if (isPhantom) {
          u._phantomBonusDmg = bonusDmg; // extra true damage on each attack
          if (c.PHANTOM >= 4) u._assassinTarget = true;
          if (c.PHANTOM >= 6) u._phantomStealthOnKill = true;
        }
      });
      const desc = c.PHANTOM >= 6 ? `Phantom 6: 50% dodge, +${bonusDmg} dmg, assassinate, stealth` : c.PHANTOM >= 4 ? `Phantom 4: 40% dodge, +${bonusDmg} dmg, assassinate` : `Phantom 2: 30% dodge, +${bonusDmg} true dmg`;
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

    // AUGMENTED — The Titan: single carry voltron
    if (c.AUGMENTED >= 2) {
      const augUnits = board.filter(u => u.faction === "AUGMENTED").sort((a, b) => b.atk - a.atk);
      if (augUnits.length > 0) {
        const carry = augUnits[0];
        const buff = c.AUGMENTED >= 6 ? 4 : c.AUGMENTED >= 4 ? 2 : 1;
        carry.atk += buff; carry.hp += buff; carry.maxHp += buff;
        carry._augCarry = true;
        if (c.AUGMENTED >= 4 && !carry.kw.includes("cleave")) carry.kw.push("cleave");
        if (c.AUGMENTED >= 6) {
          carry._dmgReduction = 0.15; // 20% damage reduction
          // All other allies gain Aggro Lock to protect carry
          board.filter(u => u.id !== carry.id).forEach(u => {
            if (!u.kw.includes("taunt")) u.kw.push("taunt");
          });
        }
        const desc = c.AUGMENTED >= 6 ? `Aug 6: ${carry.name} +${buff}/+${buff}, Cleave, 15% DR, team Taunt` : c.AUGMENTED >= 4 ? `Aug 4: ${carry.name} +${buff}/+${buff}, Cleave` : `Aug 2: ${carry.name} +${buff}/+${buff}`;
        events.push({ type: "announce", side, msg: `🦾 ${desc}`, ...snap(pBoard, eBoard) });
      }
    }

    // CONSTRUCT — The Fortress: permanent scaling + hardshell + unkillable
    if (c.CONSTRUCT >= 2) {
      board.filter(u => u.faction === "CONSTRUCT").forEach(u => {
        // Apply stored scaling from prior combats
        const cb = u._constructBonus || 0;
        u.atk += cb; u.hp += cb; u.maxHp += cb;
        // Earn scaling amount for AFTER this combat
        u._constructScaleRate = c.CONSTRUCT >= 6 ? 3 : c.CONSTRUCT >= 4 ? 2 : 1;
        // (4+) Hardshell at combat start
        if (c.CONSTRUCT >= 4) u.hardshellActive = true;
        // (6) Cannot be one-shot (survives at 1 HP once per combat)
        if (c.CONSTRUCT >= 6) u._constructSurvive = true;
      });
      const desc = c.CONSTRUCT >= 6 ? `Construct 6: +${c.CONSTRUCT >= 6 ? 3 : 2}/round, Hardshell, survive lethal` : c.CONSTRUCT >= 4 ? `Construct 4: +2/round, Hardshell` : `Construct 2: +1/round scaling`;
      events.push({ type: "announce", side, msg: `🏗️ ${desc}`, ...snap(pBoard, eBoard) });
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

  // 2a. ROLE SYNERGIES — the class system layer
  const applyRoles = (board, enemyBoard, side) => {
    const rc = {};
    board.forEach(u => { rc[u.role] = (rc[u.role] || 0) + 1; });
    if (rc.Vanguard >= 2) {
      board.filter(u => u.role === "Vanguard").forEach(u => { u._roleDR = rc.Vanguard >= 4 ? 0.25 : 0.20; });
      if (rc.Vanguard >= 4) {
        board.filter(u => u.role === "Vanguard" && (u._boardPos ?? 0) <= 3).forEach(u => { u._roleTauntHits = 2; });
        board.forEach(u => { u._roleFlatAbsorb = 2; });
      }
      events.push({ type: "announce", side, msg: rc.Vanguard >= 4 ? `🛡️ Vanguard 4: 25% DR, Taunt 2 hits, team absorb +2` : `🛡️ Vanguard 2: 20% damage reduction`, ...snap(pBoard, eBoard) });
    }
    if (rc.Striker >= 2) {
      board.filter(u => u.role === "Striker").forEach(u => { u._roleStrikerScale = 1; });
      if (rc.Striker >= 4) {
        const strongest = board.filter(u => u.role === "Striker").sort((a,b) => b.atk - a.atk)[0];
        if (strongest) strongest._roleDoubleAttack = true;
        board.filter(u => u.role === "Striker").forEach(u => { u.atk += 2; });
      }
      events.push({ type: "announce", side, msg: rc.Striker >= 4 ? `⚔️ Striker 4: +2 ATK, scaling, strongest attacks 2×` : `⚔️ Striker 2: +1 ATK per attack (scaling)`, ...snap(pBoard, eBoard) });
    }
    if (rc.Infiltrator >= 2) {
      board.filter(u => u.role === "Infiltrator").forEach(u => { u._stealthLeft = (u._stealthLeft || 0) + 2; u._roleBypassFront = true; });
      if (rc.Infiltrator >= 4) {
        board.filter(u => u.role === "Infiltrator").forEach(u => { u._roleKillStealth = true; u._roleBacklineDmg = 3; });
      }
      events.push({ type: "announce", side, msg: rc.Infiltrator >= 4 ? `🗡️ Infiltrator 4: Stealth, bypass, kill→reStealth, +3 backline` : `🗡️ Infiltrator 2: Start Stealthed, bypass frontline`, ...snap(pBoard, eBoard) });
    }
    if (rc.Architect >= 2) {
      board.filter(u => u.role === "Architect").forEach(u => { u.shield = (u.shield || 0) + (u.tier || 1); });
      if (rc.Architect >= 4) {
        board.forEach(u => { u.shield = (u.shield || 0) + 2; });
        board.filter(u => u.role === "Architect").forEach(u => { u.shield = (u.shield || 0) + 2; });
      }
      events.push({ type: "announce", side, msg: rc.Architect >= 4 ? `🔧 Architect 4: Architects Shield, team +2 Shield` : `🔧 Architect 2: Architects gain Shield`, ...snap(pBoard, eBoard) });
    }
    if (rc.Sentinel >= 2) {
      const adaptKws = ["firewall","hardshell","stealth","cleave","sniper","splash","regen","taunt"];
      board.filter(u => u.role === "Sentinel").forEach(u => {
        const available = adaptKws.filter(k => !u.kw.includes(k));
        if (available.length > 0) { const kw1 = available[Math.floor(Math.random() * available.length)]; u.kw.push(kw1); if (kw1 === "hardshell") u.hardshellActive = true; }
        if (rc.Sentinel >= 4) { u.atk += 2; u.hp += 2; u.maxHp += 2; }
      });
      events.push({ type: "announce", side, msg: rc.Sentinel >= 4 ? `⚡ Sentinel 4: +2/+2, random keyword` : `⚡ Sentinel 2: Random keyword`, ...snap(pBoard, eBoard) });
    }
    return rc;
  };
  const pRoles = applyRoles(pBoard, eBoard, "player");
  const eRoles = applyRoles(eBoard, pBoard, "enemy");

  // 2b. Wire innate effects → combat flags
  setupInnateFlags(pBoard, eBoard);
  setupInnateFlags(eBoard, pBoard);
  // Wire dead absorb flags into working mechanics
  const wireAbsorbs = (board) => {
    board.forEach((u, idx) => {
      // _adjacentAbsorb: give adjacent allies flat absorb
      if (u._adjacentAbsorb) {
        [idx-1, idx+1].filter(i => i >= 0 && i < board.length).forEach(i => {
          board[i]._flatAbsorb = (board[i]._flatAbsorb || 0) + u._adjacentAbsorb;
        });
      }
      // _boardAbsorb: give all allies flat absorb
      if (u._boardAbsorb) board.forEach(a => { a._flatAbsorb = (a._flatAbsorb || 0) + u._boardAbsorb; });
      // _globalAbsorb: give all allies % damage reduction
      if (u._globalAbsorb) board.forEach(a => { a._dmgReduction = Math.min(0.5, (a._dmgReduction || 0) + u._globalAbsorb); });
    });
  };
  wireAbsorbs(pBoard);
  wireAbsorbs(eBoard);

  // 2c-vet. Apply veteran bonuses from persistent _vet* flags
  [...pBoard, ...eBoard].forEach(u => {
    if (u._vetDodge) u._dodgeChance = Math.min(0.5, (u._dodgeChance || 0) + u._vetDodge);
  });
  // Architect vet bonus: each vet level gives +1 Shield to all allies
  const applyArchVet = (board) => {
    let totalArchShield = 0;
    board.filter(u => u._vetBuffBonus).forEach(u => { totalArchShield += u._vetBuffBonus; });
    if (totalArchShield > 0) board.forEach(u => { u.shield = (u.shield || 0) + totalArchShield; });
  };
  applyArchVet(pBoard); applyArchVet(eBoard);

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

      // ── COPY ALL ADJACENT ALLY INNATES (Singularity) ──
      else if (lo.includes("copies") && lo.includes("adjacent") && lo.includes("innate")) {
        const neighbors = [idx > 0 ? board[idx-1] : null, idx < board.length-1 ? board[idx+1] : null].filter(Boolean);
        neighbors.forEach(n => {
          if (!n.innate || n.innate.toLowerCase().includes("copies")) return;
          // Copy all combat flags from neighbor
          const flagKeys = Object.keys(n).filter(k => k.startsWith("_") && !["_innateStart","_copyAdjacentInnates","_copyDone"].includes(k));
          flagKeys.forEach(k => {
            if (typeof n[k] === 'boolean') u[k] = n[k];
            else if (typeof n[k] === 'number') u[k] = (u[k] || 0) + n[k];
          });
          // Copy deadswitch if neighbor has one
          if (n.kw.includes("deadswitch") && !u.kw.includes("deadswitch")) {
            u.kw.push("deadswitch");
            u.kwData.deadswitch = n.kwData.deadswitch || "";
          }
          // Copy auto-keywords (cleave, splash, etc.)
          n.kw.forEach(k => {
            if (!u.kw.includes(k) && k !== "deadswitch") {
              u.kw.push(k);
              if (n.kwData[k] !== undefined) u.kwData[k] = n.kwData[k];
              if (k === "hardshell") u.hardshellActive = true;
              if (k === "stealth") u._stealthLeft = 2;
            }
          });
        });
      }

      events.push({ type: "innate_start", side, unitId: u.id, unitName: u.name, msg: u.name + ": " + inn, ...snap(pBoard, eBoard) });
    });
  };
  fireInnateStart(pBoard, eBoard, "player");
  fireInnateStart(eBoard, pBoard, "enemy");

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

  // 5e. Flag-based combat-start effects (from unit-abilities.json flags)
  const fireFlagStart = (board, enemy, side) => {
    board.forEach((u, idx) => {
      // Monolith: all allies gain Shield = % of Monolith's max HP
      if (u._shieldFromMaxHp) {
        const shAmt = Math.max(1, Math.ceil(u.maxHp * u._shieldFromMaxHp));
        board.forEach(a => { a.shield = (a.shield || 0) + shAmt; });
      }
      // Aura Sprite: gain ATK per total shield on board (count shield HP/5 rounded up)
      if (u._atkFromBoardShields) {
        const totalShields = board.reduce((s, a) => s + (a.shield || 0), 0);
        u.atk += Math.ceil(totalShields / 5);
      }
      // Phase Lord: all Phantom allies gain dodge bonus
      if (u._teamDodgeBonus) {
        board.filter(a => a.faction === "PHANTOM" && a.hp > 0).forEach(a => {
          a._dodgeChance = Math.min(0.75, (a._dodgeChance || 0) + u._teamDodgeBonus);
        });
      }
      // Rune Carver: inscribe reflect onto highest-HP ally
      if (u._inscribeReflect) {
        const best = [...board].filter(a => a.hp > 0 && a.id !== u.id).sort((a, b) => b.hp - a.hp)[0];
        if (best) best._inscribeReflectActive = u._inscribeReflect;
      }
      // Exo Frame: bodyguard — mark self as bodyguard with charges
      if (u._bodyguard) {
        u._bodyguardChargesLeft = u._bodyguardCharges || 3;
      }
      // Void Dancer: start targetable (alternates each turn)
      if (u._alternatingUntargetable) {
        u._isUntargetable = false;
        u._altTurnCount = 0;
      }
      // Chrome Fist: destroyShield is on-hit, no setup needed
      // Siege Tower: doubleDmgToShielded is on-attack, no setup needed
      // Brick Golem: damageCap is on-take-damage, no setup needed
      // Legion Swarm: absorbDeadDroneAtk is on-ally-death, no setup needed
      // Root Shell: intercept enemy buffs — at combat start, steal ATK buffs from enemies
      if (u._interceptEnemyBuffs) {
        let stolen = 0;
        enemy.forEach(e => {
          if (e.atk > 3) { // If enemy got buffed above base
            const excess = Math.floor(e.atk * 0.2);
            e.atk -= excess; u.atk += excess; stolen += excess;
          }
        });
        if (stolen > 0) events.push({ type: "death_effect", side, unitId: u.id, msg: `${u.name} intercepted ${stolen} ATK from enemies!`, ...snap(pBoard, eBoard) });
      }
      // Proxy Node: start with shield
      if (u._shieldOnCombatStart) u.shield = (u.shield || 0) + u._shieldOnCombatStart;
      // Shield Drone: give shield = Drone count to all allies
      if (u._shieldPerDroneCount) {
        const droneCount = board.filter(a => a.faction === "DRONE").length;
        board.forEach(a => { a.shield = (a.shield || 0) + droneCount; });
      }
      // Ascendant: all allies gain shield = tier × multiplier
      if (u._shieldByTier) {
        board.forEach(a => { a.shield = (a.shield || 0) + (a.tier || 1) * u._shieldByTier; });
      }
      // Ascendant: shields persist (flag, handled at combat end in App.jsx)
      // u._shieldsPersist — no runtime action needed, signals to App.jsx
      // Thought Weaver: shield entire board equal to this unit's ATK
      if (u._shieldBoardFromAtk) {
        board.forEach(a => { a.shield = (a.shield || 0) + u.atk; });
      }
      // Mind Spark: protect weakest — give weakest ally surviveLethal
      if (u._protectWeakest) {
        const weakest = [...board].filter(a => a.hp > 0 && a.id !== u.id).sort((a, b) => a.hp - b.hp)[0];
        if (weakest) { weakest._surviveLethal = true; }
      }
      // Psychic Wall: debuff N strongest enemies' ATK
      if (u._debuffStrongestAtk) {
        const count = u._debuffStrongestCount || 1;
        const sorted = [...enemy].filter(e => e.hp > 0).sort((a, b) => b.atk - a.atk);
        sorted.slice(0, count).forEach(e => { e.atk = Math.max(0, e.atk - u._debuffStrongestAtk); });
      }
      // Shadow Broker: swap ATK/HP of N strongest enemies
      if (u._swapEnemyAtkHp) {
        const count = u._swapEnemyAtkHp;
        const sorted = [...enemy].filter(e => e.hp > 0).sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp));
        sorted.slice(0, count).forEach(e => {
          const tmp = e.atk; e.atk = e.hp; e.hp = tmp;
          e.maxHp = Math.max(e.maxHp, e.hp);
        });
      }
      // Event Horizon: pull enemies closer + halve adjacent ATK
      if (u._pullEnemies) {
        // pullEnemies just compresses; halveAdjacentEnemyAtk does the real work
      }
      if (u._halveAdjacentEnemyAtk) {
        const myIdx = board.indexOf(u);
        // Adjacent in enemy array (first 2 enemies = "closest")
        enemy.slice(0, 2).forEach(e => {
          if (e.hp > 0) e.atk = Math.max(1, Math.floor(e.atk / 2));
        });
      }
      // Barricade: delay N lowest-position enemies for N turns (stun them)
      if (u._delayEnemies) {
        const delayCount = u._delayEnemies;
        const delayTurns = u._delayTurns || 2;
        enemy.slice(0, delayCount).forEach(e => {
          e._stunTurns = (e._stunTurns || 0) + delayTurns;
        });
      }
      // Ping Flood: slowest implementation — stun fastest enemy for 1 turn
      if (u._slowFastestEnemy) {
        const fastest = [...enemy].filter(e => e.hp > 0).sort((a, b) => b.atk - a.atk)[0];
        if (fastest) fastest._stunTurns = (fastest._stunTurns || 0) + 1;
      }
      // Zero Day Prime: silence all enemies for N attacks
      if (u._globalSilenceDuration) {
        const hackCount = board.filter(a => a.faction === "HACKER").length;
        const dur = u._globalSilenceDuration + (u._silencePerHacker ? hackCount * u._silencePerHacker : 0);
        enemy.forEach(e => {
          e._silenced = true; e._silenceTurns = dur;
          e._innateDisabled = true;
        });
      }
      // DDoS Node: slowdown per hacker (adds to existing enemySlowdown)
      if (u._slowdownPerHacker) {
        const hackCount = board.filter(a => a.faction === "HACKER").length;
        const extraSlow = hackCount * u._slowdownPerHacker;
        // Apply as miss chance to all enemies (stacks)
        enemy.forEach(e => { e._missChance = Math.min(0.6, (e._missChance || 0) + extraSlow); });
      }
      // Psi Nexus: swap weakest ally stats with strongest enemy stats
      if (u._singleStatSwap) {
        const weakest = [...board].filter(a => a.hp > 0 && a.id !== u.id).sort((a, b) => (a.atk + a.hp) - (b.atk + b.hp))[0];
        const strongest = [...enemy].filter(e => e.hp > 0).sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
        if (weakest && strongest) {
          const wa = weakest.atk, wh = weakest.hp, wmh = weakest.maxHp;
          weakest.atk = strongest.atk; weakest.hp = strongest.hp; weakest.maxHp = strongest.maxHp;
          strongest.atk = wa; strongest.hp = wh; strongest.maxHp = wmh;
        }
      }
      // World Shaper: all allies gain HP = position × multiplier
      if (u._hpByPosition) {
        board.forEach((a, i) => {
          const bonus = (i + 1) * u._hpByPosition;
          a.hp += bonus; a.maxHp += bonus;
        });
      }
      // Pulse Drone: mark an enemy target
      if (u._markTarget) {
        const target = enemy.find(e => e.hp > 0);
        if (target) target._marked = true;
      }
      // Phase Assassin: mark highest-ATK enemy, phase until mark attacked
      if (u._markHighestAtk) {
        const highest = [...enemy].filter(e => e.hp > 0).sort((a, b) => b.atk - a.atk)[0];
        if (highest) {
          highest._marked = true;
          if (u._phasedUntilMark) { u._stealthLeft = 99; u._phasedTarget = highest.id; }
        }
      }
      // Bounty Hunter: mark highest-tier enemy
      if (u._markHighestTier) {
        const highest = [...enemy].filter(e => e.hp > 0).sort((a, b) => b.tier - a.tier)[0];
        if (highest) { highest._marked = true; highest._bountyTarget = true; }
      }
      // The Colosseum: force all enemies to attack this unit
      if (u._forceAllAttackThis) {
        u._taunt = true; // getTarget will check for _taunt
      }
      // Mirror Ghost: copy strongest enemy at 60% stats for 4 attacks
      if (u._copyStrongestEnemy) {
        const strongest = [...enemy].filter(e => e.hp > 0).sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
        if (strongest) {
          const ratio = u._copyStatRatio || 0.6;
          u.atk = Math.max(1, Math.floor(strongest.atk * ratio));
          u.hp = Math.max(1, Math.floor(strongest.hp * ratio));
          u.maxHp = u.hp;
          u._copyAttacksLeft = u._copyAttackLimit || 4;
        }
      }
      // Root Access: steal strongest enemy's innate flags
      if (u._stealStrongestInnate) {
        const strongest = [...enemy].filter(e => e.hp > 0).sort((a, b) => b.atk - a.atk)[0];
        if (strongest) {
          Object.keys(strongest).filter(k => k.startsWith('_') && !['_boardPos','_stunTurns','_immune'].includes(k)).forEach(k => {
            if (u[k] === undefined) u[k] = strongest[k];
          });
          strongest._innateDisabled = true;
        }
      }
      // Compile Core: copy 1 random ally innate
      if (u._copyRandomAllyInnate) {
        const allies = board.filter(a => a.hp > 0 && a.id !== u.id);
        if (allies.length > 0) {
          const src = allies[Math.floor(Math.random() * allies.length)];
          Object.keys(src).filter(k => k.startsWith('_') && !['_boardPos','_copyRandomAllyInnate'].includes(k)).forEach(k => {
            if (u[k] === undefined) u[k] = src[k];
          });
        }
      }
      // Lone Wolf: solo buffs
      if (u._soloTriple) {
        const nonNeutral = board.filter(a => a.faction !== "NEUTRAL");
        if (nonNeutral.length === 0 && board.length === 1 && u._soloQuadruple) {
          u.atk *= 4; u.hp *= 4; u.maxHp *= 4;
        } else if (nonNeutral.length === 0) {
          u.atk *= 3; u.hp *= 3; u.maxHp *= 3;
        }
      }
      // Omega Swarm: if 5+ Drones, all Drones gain +100% ATK
      if (u._criticalMassThreshold) {
        const droneCount = board.filter(a => a.faction === "DRONE").length;
        if (droneCount >= u._criticalMassThreshold) {
          const bonus = u._criticalMassBonus || 1;
          board.filter(a => a.faction === "DRONE").forEach(a => { a.atk = Math.floor(a.atk * (1 + bonus)); });
        }
      }
      // Merc Captain: all allies gain stats per unique faction
      if (u._factionDiversityBonus) {
        const factions = new Set(board.map(a => a.faction));
        const bonus = factions.size * u._factionDiversityBonus;
        board.forEach(a => { a.atk += bonus; a.hp += bonus; a.maxHp += bonus; });
      }
      // War Totem: all allies gain bonus damage = % of War Totem's HP
      if (u._auraAtk) {
        const bonus = Math.floor(u.hp * (u._auraAtkFromHpPercent || 0.1));
        board.forEach(a => { if (a.id !== u.id) a._bonusDmg = (a._bonusDmg || 0) + bonus; });
      }
      // Outbreak Prime: every Virus applies 1 Infection to ALL enemies
      if (u._virusMassInfect) {
        const virusCount = board.filter(a => a.faction === "VIRUS").length;
        enemy.forEach(e => {
          if (!e._infected) { e._infected = true; e._infectionDmg = virusCount; }
          else { e._infectionDmg = (e._infectionDmg || 1) + virusCount; }
        });
      }
      // Fever Spike: deal 1 damage to ALL units, Virus heal instead
      if (u._aoeAllDmg) {
        const dmg = u._aoeAllDmg;
        board.forEach(a => {
          if (a.faction === "VIRUS" && u._virusHealFromAoe) { a.hp = Math.min(a.maxHp, a.hp + dmg); }
          else { a.hp -= dmg; }
        });
        enemy.forEach(e => { e.hp -= dmg; });
      }
      // Street Doc: heal most damaged ally + cleanse debuffs
      if (u._healMostDamaged) {
        const damaged = [...board].filter(a => a.hp > 0 && a.hp < a.maxHp && a.id !== u.id).sort((a, b) => (a.hp/a.maxHp) - (b.hp/b.maxHp))[0];
        if (damaged) {
          damaged.hp = damaged.maxHp;
          if (u._cleanseDebuffs) { damaged._infected = false; damaged._infectionDmg = 0; damaged._stunTurns = 0; damaged._silenced = false; damaged._innateDisabled = false; }
        }
      }
      // Predator Drone: true damage while stealthed
      if (u._trueDamageWhileStealthed && u._stealthLeft && u._stealthLeft > 0) {
        u._trueDamage = true;
      }
      // Patient Zero: immortal while any enemy is infected
      if (u._immortalWhileInfected) {
        // Set flag — checked in survive section
      }
      // Genesis Monument: immortal while other Construct alive
      if (u._immortalWhileConstructAlive) {
        // Set flag — checked in survive section
      }
      // Mist Walker: miss chance stacks
      if (u._missChanceStacks && u._missChance) {
        // Already applied via _missChance — stacking is handled by forEach applying to all
      }
      // Neural Titan: debuff ALL enemy ATK = psionic count × debuffPerPsionic (max cap)
      if (u._debuffAllEnemyAtk) {
        const psionicCount = board.filter(a => a.faction === "PSIONIC").length;
        const debuffAmt = Math.min(u._maxDebuff || 99, psionicCount * (u._debuffPerPsionic || 1));
        enemy.forEach(e => { e.atk = Math.max(0, e.atk - debuffAmt); });
        events.push({ type: "death_effect", side, unitId: u.id, msg: `${u.name} suppressed all enemies: -${debuffAmt} ATK!`, ...snap(pBoard, eBoard) });
      }
      // Psi Probe: deal damage to random enemy = psionic count
      if (u._dmgPerFactionCount) {
        const faction = u._dmgPerFactionCount; // e.g. "PSIONIC"
        const fCount = board.filter(a => a.faction === faction).length;
        const alive = enemy.filter(e => e.hp > 0);
        if (alive.length > 0 && fCount > 0) {
          const pick = alive[Math.floor(Math.random() * alive.length)];
          pick.hp -= fCount;
          events.push({ type: "death_effect", side, unitId: u.id, msg: `${u.name} Mind Spike: ${fCount} dmg to ${pick.name}!`, ...snap(pBoard, eBoard) });
        }
      }
      // Rogue AI: copy strongest enemy's innate (adaptiveCounter)
      if (u._adaptiveCounter || u._copyStrongestInnate) {
        const strongest = [...enemy].filter(e => e.hp > 0).sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
        if (strongest) {
          Object.keys(strongest).filter(k => k.startsWith('_') && !['_boardPos','_stunTurns','_immune','_adaptiveCounter','_copyStrongestInnate'].includes(k)).forEach(k => {
            if (u[k] === undefined) u[k] = strongest[k];
          });
        }
      }
      // Sentinel: absorb first enemy innate that targets this unit
      if (u._absorbFirstEnemyInnate) {
        u._innateShield = true; // Flag checked in on-hit effects
      }
      // Dominator / Overmind: mind control weakest enemy
      if (u._mindControl) {
        const target = u._mindControl === "weakest"
          ? [...enemy].filter(e => e.hp > 0).sort((a, b) => (a.atk + a.hp) - (b.atk + b.hp))[0]
          : [...enemy].filter(e => e.hp > 0).sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
        if (target) {
          const idx = enemy.indexOf(target);
          if (idx >= 0) {
            enemy.splice(idx, 1);
            board.push(target);
            events.push({ type: "death_effect", side, unitId: u.id, msg: `${u.name} mind-controlled ${target.name}!`, ...snap(pBoard, eBoard) });
          }
        }
      }
      // Singularity: merge N weakest allies into self
      if (u._mergeWeakestAllies) {
        const n = u._mergeWeakestAllies;
        const weakest = [...board].filter(a => a.hp > 0 && a.id !== u.id).sort((a, b) => (a.atk + a.hp) - (b.atk + b.hp)).slice(0, n);
        weakest.forEach(w => {
          u.atk += w.atk; u.hp += w.hp; u.maxHp += w.hp;
          w.hp = 0; // Kill merged unit
          events.push({ type: "death_effect", side, unitId: u.id, msg: `${u.name} absorbed ${w.name} (+${w.atk}/${w.hp})!`, ...snap(pBoard, eBoard) });
        });
      }
      // Bounty Hunter: gold reward on kill (flag for post-combat, handled in App.jsx)
      if (u._bountyGoldReward) {
        u._bountyGoldOnKill = u._bountyGoldReward; // Signal to App.jsx
      }
      // Junk Dealer: bonus sell gold (shop-phase, handled in App.jsx)
      // u._bonusSellGold — read by App.jsx sell handler
      // Thought Wisp: gain stats per combat-start innate activated
      if (u._gainStatsPerCombatStartInnate) {
        const innateCount = board.filter(a => a._innateStart && a.id !== u.id).length;
        u.atk += innateCount; u.hp += innateCount; u.maxHp += innateCount;
      }
      // The Architect (T7): double all combat-start innates
      if (u._doubleCombatStartInnates) {
        // This is handled by re-running fireInnateStart after this — flagged for post-processing
        board._doubleInnates = true;
      }
      // The Overmind (T7): double all Psionic combat-start values
      if (u._doublePsionicStart) {
        board._doublePsionicStart = true;
      }
      // Mind Lord: boost all Psionic innate values by 50%
      if (u._boostPsionicValues || u._doublePsionicValues) {
        // Already applied multiplicatively through innateStart text parsing
        // Flag for Psionic shield/debuff amplification
        board._psionicBoost = u._boostPsionicValues || 1.5;
      }
      // Riot Shield: AoE damage reduction — transfer flag to all allies
      if (u._aoeReduction) {
        if (u._aoeReductionTransfer) {
          board.forEach(a => { a._aoeReduction = u._aoeReduction; });
        }
      }
      // Relay Drone: boost nearby Drone innates
      if (u._boostNearbyDroneInnate) {
        // Adjacent Drones get +1/+1
        [idx - 1, idx + 1].filter(i => i >= 0 && i < board.length).forEach(i => {
          if (board[i].faction === "DRONE") {
            board[i].atk += u._boostNearbyDroneInnate;
            board[i].hp += u._boostNearbyDroneInnate;
            board[i].maxHp += u._boostNearbyDroneInnate;
          }
        });
      }
      // Proxy Node: copy adjacent ally buffs (gain same ATK/HP boosts)
      if (u._copyAdjacentBuffs) {
        [idx - 1, idx + 1].filter(i => i >= 0 && i < board.length).forEach(i => {
          const adj = board[i];
          if (adj.shield > 0) u.shield = (u.shield || 0) + adj.shield;
          if (adj._bonusDmg) u._bonusDmg = (u._bonusDmg || 0) + adj._bonusDmg;
        });
      }
      // Phase Wisp: start phased out for N turns
      if (u._rePhaseDelay) {
        u._stealthLeft = u._rePhaseDelay;
      }
      // God Compiler: Synth innates trigger 3× (extends existing double to triple)
      if (u._synthInnateTriple) {
        board._synthTriple = true;
      }
      // Oracle Node: auto-optimize board (sort by optimal positions)
      if (u._autoOptimizeBoard) {
        // Sort board: tanks (high HP) front, damage (high ATK) back
        board.sort((a, b) => {
          const aRatio = a.hp / Math.max(1, a.atk);
          const bRatio = b.hp / Math.max(1, b.atk);
          return bRatio - aRatio; // High HP/ATK ratio = front
        });
      }
      // Foundry Arm: spawn a Construct Token at combat start
      if (u._spawnTokenOnCombat && board.length < MAX_BOARD_SIZE) {
        const stats = u._tokenStats || [2, 2];
        const token = { id: gid(), tn: "Token", name: "Construct Token", faction: "CONSTRUCT", tier: 1, atk: stats[0], hp: stats[1], maxHp: stats[1], emoji: "", golden: false, kw: [], kwData: {}, mod: null, shield: 0, hardshellActive: false };
        board.push(token);
        events.push({ type: "spawn", side, unitId: token.id, unitName: token.name, source: u.name + " Fabricate", ...snap(pBoard, eBoard) });
      }
      // The Motherbrain: share all Drone innates to all Drones
      if (u._shareAllDroneInnates) {
        const drones = board.filter(a => a.faction === "DRONE" && a.hp > 0);
        const allFlags = {};
        drones.forEach(d => {
          Object.keys(d).filter(k => k.startsWith('_') && !['_boardPos','_shareAllDroneInnates'].includes(k)).forEach(k => {
            if (allFlags[k] === undefined) allFlags[k] = d[k];
          });
        });
        drones.forEach(d => {
          Object.keys(allFlags).forEach(k => { if (d[k] === undefined) d[k] = allFlags[k]; });
        });
      }
      // Quantum Core: superposition — create a linked copy of self
      if (u._superposition && !u._superCopy && board.length < MAX_BOARD_SIZE) {
        const copy = { ...u, id: gid(), name: "Echo " + u.name, _superCopy: true, kw: [...u.kw], kwData: {...u.kwData} };
        u._superLink = copy.id; copy._superLink = u.id;
        u._splitDamage = u._splitDamage || 0.5;
        copy._splitDamage = u._splitDamage;
        board.push(copy);
        events.push({ type: "spawn", side, unitId: copy.id, unitName: copy.name, source: u.name + " Superposition", ...snap(pBoard, eBoard) });
      }
      // Aura Guard: reflectDamageNearby — nearby allies reflect damage
      if (u._reflectDamageNearby) {
        const range = u._reflectRange || 2;
        for (let r = 1; r <= range; r++) {
          [idx - r, idx + r].filter(i => i >= 0 && i < board.length).forEach(i => {
            board[i]._inscribeReflectActive = Math.max(board[i]._inscribeReflectActive || 0, Math.floor(u._reflectDamageNearby * 10)); // 30% → reflect 3
          });
        }
      }
      // Growth Engine: locked in place (can't be repositioned — shop-phase flag)
      if (u._lockedInPlace) u._locked = true;
      // War Profiteer: shop-phase economy flags (read by App.jsx)
      if (u._globalBuySellAtkGain) u._shopAtkGain = u._globalBuySellAtkGain;
      if (u._goldSpendAtk !== undefined) u._shopGoldAtk = true;
    });
  };
  fireFlagStart(pBoard, eBoard, "player");
  fireFlagStart(eBoard, pBoard, "enemy");

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

  // Sort: Attack initiative by role priority (decoupled from board position)
  // Swift (mod/innate) → 0, Infiltrator → 1, Striker → 2, Sentinel → 3, Architect → 4, Vanguard → 5
  const ROLE_INIT = { Infiltrator: 1, Striker: 2, Sentinel: 3, Architect: 4, Vanguard: 5 };
  const getInitiative = (u) => {
    if (u.mod?.effect?.swift || u._swift) return 0; // Swift always first
    return ROLE_INIT[u.role] ?? 3; // Default to Sentinel priority
  };
  const sortInit = (a, b) => {
    const pa = getInitiative(a), pb = getInitiative(b);
    if (pa !== pb) return pa - pb;
    return (a._boardPos ?? 0) - (b._boardPos ?? 0);
  };
  pBoard.sort(sortInit); eBoard.sort(sortInit);
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

  // ── DEFERRED HACKER SILENCE ──
  // Runs AFTER adapt keywords, faction keywords, and all other keyword sources
  const runDeferredSilence = (board, enemyBoard, pending) => {
    if (!pending) return;
    const { count, side } = pending;
    const kwEnemies = enemyBoard.filter(u => {
      const realKws = u.kw.filter(k => k !== "adapt");
      return realKws.length > 0 || u.hardshellActive;
    });
    for (let s = 0; s < count && kwEnemies.length > 0; s++) {
      const target = kwEnemies[Math.floor(Math.random() * kwEnemies.length)];
      const realKws = target.kw.filter(k => k !== "adapt");
      if (realKws.length > 0) {
        const kwToRemove = realKws[Math.floor(Math.random() * realKws.length)];
        const idx = target.kw.indexOf(kwToRemove);
        if (idx >= 0) target.kw.splice(idx, 1);
        if (kwToRemove === "hardshell") target.hardshellActive = false;
        target._silenced = true;
        events.push({ type: "silence", side, targetId: target.id, targetName: target.name, keyword: kwToRemove, msg: `🔇 SILENCED: ${target.name} lost ${kwToRemove.toUpperCase()}!`, ...snap(pBoard, eBoard) });
      } else if (target.hardshellActive) {
        target.hardshellActive = false;
        target._silenced = true;
        events.push({ type: "silence", side, targetId: target.id, targetName: target.name, keyword: "hardshell", msg: `🔇 SILENCED: ${target.name} lost HARDSHELL!`, ...snap(pBoard, eBoard) });
      }
    }
    delete board._pendingHackerSilence;
  };
  runDeferredSilence(pBoard, eBoard, pBoard._pendingHackerSilence);
  runDeferredSilence(eBoard, pBoard, eBoard._pendingHackerSilence);

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
    // Innates are top-of-food-chain: they bypass taunt, firewall, everything
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

    // The Colosseum: force ALL enemies to attack this unit
    const taunters = pool.filter(u => u._taunt || u._forceAllAttackThis);
    if (taunters.length > 0) return taunters[0];

    // Phase Assassin: if attacker has a phased target, attack that specific enemy
    if (attacker._phasedTarget) {
      const mark = alive.find(u => u.id === attacker._phasedTarget);
      if (mark && mark.hp > 0) return mark;
      // Marked target dead — clear phase
      attacker._phasedTarget = null;
      if (attacker._stealthLeft === 99) attacker._stealthLeft = 0;
    }

    // Role: Vanguard taunt (first N hits, then fades)
    const roleTaunters = pool.filter(u => u._roleTauntHits && u._roleTauntHits > 0);
    if (roleTaunters.length > 0) {
      const t = roleTaunters[Math.floor(Math.random() * roleTaunters.length)];
      t._roleTauntHits--;
      return t;
    }

    // Aggro Lock (taunt) overrides ALL targeting
    const aggroLock = pool.filter(u => u.kw.includes("taunt"));
    if (aggroLock.length > 0) return aggroLock[Math.floor(Math.random() * aggroLock.length)];

    // Firewall: must be attacked first
    const fw = pool.filter(u => u.kw.includes("firewall"));
    if (fw.length > 0) return fw[Math.floor(Math.random() * fw.length)];

    // Role: Infiltrator bypasses frontline, targets backline
    if (attacker._roleBypassFront) {
      const backline = pool.filter(u => (u._boardPos ?? 0) > 3);
      if (backline.length > 0) return [...backline].sort((a, b) => a.hp - b.hp)[0];
      return [...pool].sort((a, b) => a.hp - b.hp)[0];
    }

    // Frontline/Backline: prefer frontline (original positions 0-3), backline (4-6) only if frontline empty
    const frontline = pool.filter(u => (u._boardPos ?? 0) <= 3);
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
      const spawned = { id: gid(), tn: si.tn, name: si.name, faction: "DRONE", tier: 1, atk: 1, hp: 1, maxHp: 1, emoji: "", golden: false, kw: [], kwData: {}, mod: null, shield: 0, hardshellActive: false, _spawnEvtDone: true };
      allies.push(spawned);
      events.push({ type: "spawn", side, unitId: spawned.id, unitName: spawned.name, source: "Swarm Protocol", ...snap(pBoard, eBoard) });
    }
    if (!dead.kw.includes("deadswitch")) return;
    const _rawDs = dead.kwData.deadswitch || "";
    // Normalize catch-all deadswitch values (setupInnateFlags preserves lowercase, handlers expect Title Case)
    let d = _rawDs;
    const _dl = _rawDs.toLowerCase();
    if (_dl.startsWith("spawn") && _dl.includes("copy")) d = "Summon 1/1 copy";
    else if (_dl.startsWith("spawn") && _dl.includes("spore")) d = "Summon 2/2 Spore";
    else if (_dl.startsWith("spawn") && _dl.includes("drone")) { const m=_rawDs.match(/(\d+)\/(\d+)/); d = "Summon "+(m?m[1]:"1")+"/"+(m?m[2]:"1")+" Drone"; }
    else if (_dl.startsWith("deal") && _dl.includes("random enemy")) { const m=_rawDs.match(/(\d+)/); d = "Deal "+(m?m[1]:"2")+" dmg to random enemy"; }
    else if (_dl.startsWith("deal") && _dl.includes("equal to its atk")) d = "Deal " + (dead.atk||3) + " dmg to random enemy";
    else if (_dl.includes("fill") && _dl.includes("board") && _dl.includes("drone")) { const m=_rawDs.match(/(\d+)\/(\d+)/); d = "Fill board with "+(m?m[1]:"2")+"/"+(m?m[2]:"2")+" Drones"; }
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
        let m = d.match(/Deal (\d+)/); let dmg = m ? parseInt(m[1]) : 2;
        // Per-faction scaling (e.g., "Deal 2 per Drone dmg to all enemies")
        if (d.includes("per Drone")) {
          const droneCount = allies.filter(u => u.faction === "DRONE" && u.hp > 0).length;
          dmg *= Math.max(1, droneCount);
        } else if (d.includes("per Virus")) {
          const virusCount = allies.filter(u => u.faction === "VIRUS" && u.hp > 0).length;
          dmg *= Math.max(1, virusCount);
        } else if (d.includes("per Synth")) {
          const synthCount = allies.filter(u => u.faction === "SYNTH" && u.hp > 0).length;
          dmg *= Math.max(1, synthCount);
        }
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
          const revived = { ...dead, id: gid(), hp: 1, maxHp: 1, atk: 1, kw: [...dead.kw], kwData: {...dead.kwData}, _reviveCount: dead._reviveCount - 1 };
          allies.push(revived);
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
  const handleDeath = (dead, allies, enemies, side, killer) => {
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
    // Emit spawn events for any units created by deadswitch (skip those already emitted by doDeadswitch)
    if (allies.length > alliesBefore) {
      for (let si = alliesBefore; si < allies.length; si++) {
        if (!allies[si]._spawnEvtDone) {
          events.push({ type: "spawn", side, unitId: allies[si].id, unitName: allies[si].name, source: dead.name + " deadswitch", ...snap(pBoard, eBoard) });
        }
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
    // Double Virus death effects
    if (dead.faction === "VIRUS" && allies.some(u => u._doubleVirusDeath)) {
      doDeadswitch(dead, allies, enemies, side, op);
    }

    // ── FLAG-BASED ON-DEATH EFFECTS (innates) ──

    // deathDmgToKiller: deal flat damage back to whoever killed this unit
    if (dead._deathDmgToKiller && killer && killer.hp > 0) {
      killer.hp -= dead._deathDmgToKiller;
      events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} dealt ${dead._deathDmgToKiller} dmg to ${killer.name} on death!`, ...snap(pBoard, eBoard) });
    }

    // deathStunKiller: stun the killer for N turns
    if (dead._deathStunKiller && killer && killer.hp > 0 && !killer._immune) {
      killer._stunTurns = (killer._stunTurns || 0) + dead._deathStunKiller;
      events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} STUNNED ${killer.name} on death!`, ...snap(pBoard, eBoard) });
    }

    // deathCurseKiller: reduce killer's ATK permanently
    if (dead._deathCurseKiller && killer && killer.hp > 0) {
      killer.atk = Math.max(0, killer.atk - dead._deathCurseKiller);
      events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} cursed ${killer.name}: -${dead._deathCurseKiller} ATK!`, ...snap(pBoard, eBoard) });
    }

    // deathTrojan: implant trojan on killer (disable their innate)
    if (dead._deathTrojan && killer && killer.hp > 0 && !killer._immune) {
      killer._innateDisabled = true;
      events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} planted Trojan on ${killer.name}!`, ...snap(pBoard, eBoard) });
    }

    // deathAoeDmg: deal AoE damage to all enemies on death
    if (dead._deathAoeDmg) {
      let aoeDmg = dead._deathAoeDmg;
      // Riot Shield: allies take reduced AoE damage
      const hasRiotShield = enemies.some(e => e._aoeReduction && e.hp > 0);
      if (hasRiotShield) {
        const reduction = enemies.find(e => e._aoeReduction)._aoeReduction;
        aoeDmg = Math.max(1, Math.floor(aoeDmg * (1 - reduction)));
      }
      const deathAoeKills = [];
      enemies.filter(e => e.hp > 0).forEach(e => {
        e.hp -= aoeDmg;
        if (e.hp <= 0 && e._constructSurvive) { e.hp = 1; e._constructSurvive = false; }
        if (e.hp <= 0 && e._surviveLethal) { e.hp = 1; e._surviveLethal = false; }
        events.push({ type: "ds_hit", side, sourceId: dead.id, sourceName: dead.name, targetId: e.id, targetName: e.name, damage: aoeDmg, killed: e.hp <= 0, ...snap(pBoard, eBoard) });
        if (e.hp <= 0) deathAoeKills.push(e);
      });
      // Chain Detonation (Cluster Bomb): killed enemies also explode for 1 damage each
      if (dead._chainDetonation && deathAoeKills.length > 0) {
        enemies.filter(e => e.hp > 0).forEach(e => {
          e.hp -= deathAoeKills.length; // 1 damage per chain explosion
        });
        events.push({ type: "death_effect", side, unitId: dead.id, msg: `Chain Detonation! ${deathAoeKills.length} explosions!`, ...snap(pBoard, eBoard) });
      }
      deathAoeKills.forEach(e => {
        const idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
        handleDeath(e, enemies, allies, side === "player" ? "enemy" : "player");
      });
    }

    // deathDmgPerMaxHp: deal % of max HP as damage to all enemies
    if (dead._deathDmgPerMaxHp) {
      const pctDmg = Math.floor(dead.maxHp * dead._deathDmgPerMaxHp);
      if (pctDmg > 0) {
        const hpDeathKills = [];
        enemies.filter(e => e.hp > 0).forEach(e => {
          e.hp -= pctDmg;
          if (e.hp <= 0 && e._constructSurvive) { e.hp = 1; e._constructSurvive = false; }
          if (e.hp <= 0 && e._surviveLethal) { e.hp = 1; e._surviveLethal = false; }
          if (e.hp <= 0) hpDeathKills.push(e);
        });
        events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} exploded for ${pctDmg} dmg!`, ...snap(pBoard, eBoard) });
        hpDeathKills.forEach(e => {
          const idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
          handleDeath(e, enemies, allies, side === "player" ? "enemy" : "player");
        });
      }
    }

    // deathPlayerDmg: deal direct damage to enemy player on death
    if (dead._deathPlayerDmg) {
      const pdmg = dead._deathPlayerDmg;
      if (side === "player") eVirusBleed += pdmg;
      else pVirusBleed += pdmg;
      events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} dealt ${pdmg} direct player dmg!`, ...snap(pBoard, eBoard) });
    }

    // playerDmgFromAtk: deal damage to enemy player equal to % of ATK
    if (dead._playerDmgFromAtk) {
      const pdmg = Math.floor(dead.atk * dead._playerDmgFromAtk);
      if (pdmg > 0) {
        if (side === "player") eVirusBleed += pdmg;
        else pVirusBleed += pdmg;
      }
    }

    // deathInfectAll / deathMassInfect: infect all enemies on death
    if (dead._deathInfectAll || dead._deathMassInfect) {
      const stacks = dead._deathInfectStacks || 1;
      enemies.filter(e => e.hp > 0).forEach(e => {
        if (!e._infected) { e._infected = true; e._infectionDmg = stacks; }
        else { e._infectionDmg = (e._infectionDmg || 1) + stacks; }
      });
      events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} infected all enemies (${stacks} stacks)!`, ...snap(pBoard, eBoard) });
    }

    // deathInfectionBurst: burst infection damage on all infected enemies
    if (dead._deathInfectionBurst) {
      const burstMult = dead._deathInfectionBurst;
      const burstKills = [];
      enemies.filter(e => e.hp > 0 && e._infected).forEach(e => {
        const burstDmg = (e._infectionDmg || 1) * burstMult;
        e.hp -= burstDmg;
        if (e.hp <= 0 && e._constructSurvive) { e.hp = 1; e._constructSurvive = false; }
        if (e.hp <= 0 && e._surviveLethal) { e.hp = 1; e._surviveLethal = false; }
        events.push({ type: "ds_hit", side, sourceId: dead.id, sourceName: dead.name, targetId: e.id, targetName: e.name, damage: burstDmg, killed: e.hp <= 0, ...snap(pBoard, eBoard) });
        if (e.hp <= 0) burstKills.push(e);
      });
      burstKills.forEach(e => {
        const idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
        handleDeath(e, enemies, allies, side === "player" ? "enemy" : "player");
      });
    }

    // deathHpGift: give HP to all living allies on death
    if (dead._deathHpGift) {
      allies.filter(a => a.hp > 0).forEach(a => {
        a.hp += dead._deathHpGift; a.maxHp += dead._deathHpGift;
      });
      events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} gifted +${dead._deathHpGift} HP to all allies!`, ...snap(pBoard, eBoard) });
    }

    // deathTransferHpToConstruct: transfer HP to random Construct ally
    if (dead._deathTransferHpToConstruct) {
      const constructs = allies.filter(a => a.faction === "CONSTRUCT" && a.hp > 0);
      if (constructs.length > 0) {
        const target = constructs[Math.floor(Math.random() * constructs.length)];
        target.hp += dead._deathTransferHpToConstruct; target.maxHp += dead._deathTransferHpToConstruct;
        events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} transferred +${dead._deathTransferHpToConstruct} HP to ${target.name}!`, ...snap(pBoard, eBoard) });
      }
    }

    // deathSwapEnemies: swap 2 random enemies' positions + stun swapped
    if (dead._deathSwapEnemies && enemies.length >= 2) {
      const alive = enemies.filter(e => e.hp > 0);
      if (alive.length >= 2) {
        const i1 = Math.floor(Math.random() * alive.length);
        let i2 = Math.floor(Math.random() * (alive.length - 1));
        if (i2 >= i1) i2++;
        const e1idx = enemies.indexOf(alive[i1]);
        const e2idx = enemies.indexOf(alive[i2]);
        if (e1idx >= 0 && e2idx >= 0) {
          [enemies[e1idx], enemies[e2idx]] = [enemies[e2idx], enemies[e1idx]];
          if (dead._deathStunSwapped) {
            alive[i1]._stunTurns = (alive[i1]._stunTurns || 0) + dead._deathStunSwapped;
            alive[i2]._stunTurns = (alive[i2]._stunTurns || 0) + dead._deathStunSwapped;
          }
          events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} swapped ${alive[i1].name} and ${alive[i2].name}!`, ...snap(pBoard, eBoard) });
        }
      }
    }

    // deathConsumeAllDrones: consume all ally drones, gain their total stats
    if (dead._deathConsumeAllDrones) {
      // This unit already died, so the "consume" effect buffs a random surviving ally
      const drones = allies.filter(a => a.faction === "DRONE" && a.hp > 0);
      let totalAtk = 0, totalHp = 0;
      drones.forEach(d => { totalAtk += d.atk; totalHp += d.hp; d.hp = 0; });
      // Remove consumed drones
      for (let i = allies.length - 1; i >= 0; i--) {
        if (allies[i].faction === "DRONE" && allies[i].hp <= 0 && allies[i].id !== dead.id) {
          allies.splice(i, 1);
        }
      }
      // Buff strongest surviving ally with consumed stats
      const strongest = allies.filter(a => a.hp > 0).sort((a, b) => b.atk - a.atk)[0];
      if (strongest && (totalAtk + totalHp) > 0) {
        strongest.atk += totalAtk; strongest.hp += totalHp; strongest.maxHp += totalHp;
        events.push({ type: "death_effect", side, unitId: dead.id, msg: `${dead.name} consumed ${drones.length} Drones: +${totalAtk}/${totalHp} to ${strongest.name}!`, ...snap(pBoard, eBoard) });
      }
    }

    // deathSplit: split into 2 copies with reduced stats
    if (dead._deathSplit && allies.length < MAX_BOARD_SIZE) {
      const splitAtk = Math.max(1, Math.floor(dead.atk * 0.5));
      const splitHp = Math.max(1, Math.floor(dead.maxHp * 0.5));
      const remainingSplits = (dead._recursiveSplit || 0) - 1;
      for (let i = 0; i < 2 && allies.length < MAX_BOARD_SIZE; i++) {
        const copy = {
          id: gid(), tn: dead.tn, name: "Split " + dead.name, faction: dead.faction,
          tier: dead.tier, atk: splitAtk, hp: splitHp, maxHp: splitHp,
          emoji: dead.emoji, golden: false, mod: null, shield: 0, hardshellActive: false,
          kw: dead._splitRetainBuffs ? [...dead.kw] : [],
          kwData: dead._splitRetainBuffs ? { ...dead.kwData } : {},
          _inheritBuffs: dead._inheritBuffs || false,
          _deathSplit: remainingSplits >= 0 ? dead._deathSplit : 0,
          _recursiveSplit: remainingSplits >= 0 ? remainingSplits : 0,
        };
        if (dead._inheritBuffs) {
          // Copy innate flags to split copies
          Object.keys(dead).filter(k => k.startsWith('_') && k !== '_deathSplit' && k !== '_recursiveSplit').forEach(k => {
            if (copy[k] === undefined) copy[k] = dead[k];
          });
        }
        allies.push(copy);
        events.push({ type: "spawn", side, unitId: copy.id, unitName: copy.name, source: dead.name + " split", ...snap(pBoard, eBoard) });
      }
    }

    // deathSpawnCount + recursiveSplit: spawn N mini copies
    if (dead._deathSpawnCount && !dead._deathSplit && allies.length < MAX_BOARD_SIZE) {
      const count = dead._deathSpawnCount;
      const remainingSplits = (dead._recursiveSplit || 0) - 1; // Decrement generation counter
      for (let i = 0; i < count && allies.length < MAX_BOARD_SIZE; i++) {
        const spawned = {
          id: gid(), tn: dead.tn, name: "Mini " + dead.name, faction: dead.faction,
          tier: 1, atk: 1, hp: 1, maxHp: 1,
          emoji: dead.emoji, golden: false, mod: null, shield: 0, hardshellActive: false,
          kw: [], kwData: {},
          _deathSpawnCount: remainingSplits >= 0 ? dead._deathSpawnCount : 0,
          _recursiveSplit: remainingSplits >= 0 ? remainingSplits : 0,
        };
        allies.push(spawned);
        events.push({ type: "spawn", side, unitId: spawned.id, unitName: spawned.name, source: dead.name + " spawn", ...snap(pBoard, eBoard) });
      }
    }

    // deathGhost: persist as a ghost for N turns (attacks but can't be targeted)
    if (dead._deathGhost && allies.length < MAX_BOARD_SIZE) {
      const ghostTurns = dead._ghostPersistTurns || 2;
      const ghost = {
        id: gid(), tn: dead.tn, name: "Ghost " + dead.name, faction: dead.faction,
        tier: dead.tier, atk: dead.atk, hp: 1, maxHp: 1,
        emoji: dead.emoji, golden: false, mod: null, shield: 0, hardshellActive: false,
        kw: [], kwData: {},
        _isGhost: true, _ghostTurnsLeft: ghostTurns,
        _stealthLeft: ghostTurns, // Ghosts are untargetable (stealth) for their duration
        _trueDamage: dead._ghostTrueDmg || false, // Soul Echo: ghost deals true dmg
      };
      allies.push(ghost);
      events.push({ type: "spawn", side, unitId: ghost.id, unitName: ghost.name, source: dead.name + " ghost", ...snap(pBoard, eBoard) });
    }

    // nineLives: revive multiple times with diminishing stats
    if (dead._nineLives && dead._nineLives > 0 && allies.length < MAX_BOARD_SIZE) {
      const newLives = dead._nineLives - 1;
      const atkBonus = dead._nineLivesAtkGain || 0;
      const revived = {
        ...dead, id: gid(), hp: Math.max(1, Math.floor(dead.maxHp * 0.5)),
        maxHp: Math.max(1, Math.floor(dead.maxHp * 0.5)),
        atk: dead.atk + atkBonus,
        _nineLives: newLives,
        kw: [...dead.kw], kwData: { ...dead.kwData },
      };
      allies.push(revived);
      events.push({ type: "spawn", side, unitId: revived.id, unitName: revived.name, source: dead.name + " nine lives (" + newLives + " left)", ...snap(pBoard, eBoard) });
    }

    // reviveDeadDrones (Hive Queen): after delay, revive dead drones
    if (dead._reviveDeadDrones) {
      // Immediate: revive up to reviveMaxPerUnit dead drones at 1 HP
      const maxRevive = dead._reviveMaxPerUnit || 2;
      const deadDrones = (side === "player" ? pDead : eDead).filter(u => u.faction === "DRONE");
      let revived = 0;
      for (let i = 0; i < deadDrones.length && revived < maxRevive && allies.length < MAX_BOARD_SIZE; i++) {
        const d = deadDrones[i];
        const rev = { ...d, id: gid(), hp: 1, maxHp: 1, atk: Math.max(1, d.atk), kw: [], kwData: {}, mod: null, shield: 0, hardshellActive: false };
        allies.push(rev);
        events.push({ type: "spawn", side, unitId: rev.id, unitName: rev.name, source: dead.name + " revive", ...snap(pBoard, eBoard) });
        revived++;
      }
    }

    // reviveCount + reviveAtkBoost (Patient Infinity): already handled in doDeadswitch via "Revive as 1/1"
    // but reviveAtkBoost (gain ATK each revive) needs explicit check
    if (dead._reviveAtkBoost && dead._reviveCount && dead._reviveCount > 0 && allies.length < MAX_BOARD_SIZE) {
      // If not already revived by doDeadswitch, handle here
      const alreadyRevived = allies.some(u => u.name === "Echo " + dead.name || u.name === dead.name);
      if (!alreadyRevived) {
        const revived = { ...dead, id: gid(), hp: 1, maxHp: 1, atk: dead.atk + dead._reviveAtkBoost, _reviveCount: dead._reviveCount - 1, kw: [...dead.kw], kwData: { ...dead.kwData }, mod: null, shield: 0, hardshellActive: false };
        allies.push(revived);
        events.push({ type: "spawn", side, unitId: revived.id, unitName: revived.name, source: dead.name + " revive (ATK boosted)", ...snap(pBoard, eBoard) });
      }
    }

    // ── BOARD-WIDE ALLY-DEATH LISTENERS ──

    // droneDeathAtkStack (Swarm Lord): when ANY Drone ally dies, gain ATK
    if (dead.faction === "DRONE") {
      allies.filter(u => u.hp > 0 && u._droneDeathAtkStack).forEach(u => {
        u.atk += u._droneDeathAtkStack;
        events.push({ type: "death_effect", side, unitId: u.id, msg: `${u.name} gained +${u._droneDeathAtkStack} ATK from Drone death!`, ...snap(pBoard, eBoard) });
      });
      // Legion Swarm: absorb dead drone's ATK
      allies.filter(u => u.hp > 0 && u._absorbDeadDroneAtk).forEach(u => {
        u.atk += dead.atk;
        events.push({ type: "death_effect", side, unitId: u.id, msg: `${u.name} absorbed ${dead.name}'s ATK (+${dead.atk})!`, ...snap(pBoard, eBoard) });
      });
    }

    // healOnDroneDeath (Repair Drone): when Drone ally dies, heal all Drone allies
    if (dead.faction === "DRONE") {
      allies.filter(u => u.hp > 0 && u._healOnDroneDeath).forEach(u => {
        allies.filter(a => a.faction === "DRONE" && a.hp > 0).forEach(a => {
          a.hp = Math.min(a.maxHp, a.hp + u._healOnDroneDeath);
        });
      });
    }

    // onAllyDeathGainStats (Empathic Core): gain stats when any ally dies
    allies.filter(u => u.hp > 0 && u._onAllyDeathGainStats).forEach(u => {
      u.atk += u._onAllyDeathGainStats;
      u.hp += u._onAllyDeathGainStats; u.maxHp += u._onAllyDeathGainStats;
      events.push({ type: "death_effect", side, unitId: u.id, msg: `${u.name} gained +${u._onAllyDeathGainStats}/+${u._onAllyDeathGainStats} from ally death!`, ...snap(pBoard, eBoard) });
    });

    // onAllyDeathFireInnate (Empathic Core): trigger this unit's innate again on ally death
    // This re-applies combat-start innate effects
    allies.filter(u => u.hp > 0 && u._onAllyDeathFireInnate && u.id !== dead.id).forEach(u => {
      // Re-trigger the unit's innate start effects (shields, buffs, etc.)
      if (u._innateStart && u._shieldWeakest) {
        const weakest = allies.filter(a => a.hp > 0).sort((a, b) => a.hp - b.hp)[0];
        if (weakest) weakest.shield = (weakest.shield || 0) + (u._shieldWeakest || 3);
      }
      if (u._innateStart && u._stimLowestAlly) {
        const lowest = allies.filter(a => a.hp > 0 && a.id !== u.id).sort((a, b) => a.atk - b.atk)[0];
        if (lowest) { lowest.atk += u._stimLowestAlly; }
      }
    });

    // Assembly Matrix: collect dead ally innates — gain all their combat flags
    allies.filter(u => u.hp > 0 && u._collectDeadAllyInnates && u.id !== dead.id).forEach(u => {
      Object.keys(dead).filter(k => k.startsWith('_') && !['_boardPos','_collectDeadAllyInnates','_stunTurns'].includes(k)).forEach(k => {
        if (u[k] === undefined) u[k] = dead[k];
      });
      events.push({ type: "death_effect", side, unitId: u.id, msg: `${u.name} absorbed ${dead.name}'s innate!`, ...snap(pBoard, eBoard) });
    });
  };

  const doAttack = (attacker, defenders, attackerSide) => {
    if (attacker.hp <= 0) return; // Dead from deadswitch AoE cascade
    let target = getTarget(defenders, attacker);
    if (!target) return;

    // Exo Frame bodyguard: redirect attacks on adjacent allies to self
    const defB2 = attackerSide === "player" ? eBoard : pBoard;
    const tgtIdx = defB2.indexOf(target);
    if (tgtIdx >= 0) {
      const adjBodyguards = [tgtIdx - 1, tgtIdx + 1]
        .filter(i => i >= 0 && i < defB2.length)
        .map(i => defB2[i])
        .filter(u => u._bodyguardChargesLeft && u._bodyguardChargesLeft > 0 && u.hp > 0 && u.id !== target.id);
      if (adjBodyguards.length > 0) {
        const bg = adjBodyguards[0];
        bg._bodyguardChargesLeft--;
        target = bg; // Redirect attack to bodyguard
        events.push({ type: "death_effect", side: attackerSide === "player" ? "enemy" : "player", unitId: bg.id, msg: `${bg.name} bodyguarded!`, ...snap(pBoard, eBoard) });
      }
    }

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

    // Stone Sentinel: first enemy to attack loses 50% ATK (petrify)
    if (target._petrifyFirstAttacker && !target._petrifyUsed) {
      target._petrifyUsed = true;
      const lost = Math.floor(attacker.atk * 0.5);
      attacker.atk = Math.max(1, attacker.atk - lost);
      events.push({ type: "death_effect", side: attackerSide, unitId: target.id, msg: `${target.name} petrified ${attacker.name}: -${lost} ATK!`, ...snap(pBoard, eBoard) });
    }

    // Black Hat: redirect first attacker's damage to a random enemy ally
    if (target._redirectFirstAttacker && !target._redirectUsed) {
      target._redirectUsed = true;
      const otherEnemies = defenders.filter(d => d.hp > 0 && d.id !== target.id);
      if (otherEnemies.length > 0) {
        const redirectTarget = otherEnemies[Math.floor(Math.random() * otherEnemies.length)];
        const rdmg = attacker.atk;
        redirectTarget.hp -= rdmg;
        events.push({ type: "death_effect", side: attackerSide, unitId: target.id, msg: `${target.name} redirected ${attacker.name}'s attack to ${redirectTarget.name}!`, ...snap(pBoard, eBoard) });
        if (redirectTarget.hp <= 0) {
          const defSide = attackerSide === "player" ? "enemy" : "player";
          const idx = defenders.indexOf(redirectTarget);
          if (idx >= 0) defenders.splice(idx, 1);
          handleDeath(redirectTarget, defenders, attackerSide === "player" ? pBoard : eBoard, defSide, attacker);
        }
        return; // Attack was redirected, don't continue normal attack
      }
    }

    // The Unseen: can only be hit by AoE, not normal attacks
    if (target._onlyAoECanHit) {
      events.push({ type: "dodge", targetId: target.id, side: attackerSide === "player" ? "enemy" : "player", msg: `${target.name} is Unseen — immune to direct attacks!`, ...snap(pBoard, eBoard) });
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
    // Berserker X tiered berserk: triple below 25%, double below 50%
    if (attacker._berserkTripleAt && attacker.hp < attacker.maxHp * attacker._berserkTripleAt) dmg *= 3;
    else if (attacker._berserkDoubleAt && attacker.hp < attacker.maxHp * attacker._berserkDoubleAt) dmg *= 2;
    // Execute multiplier: triple dmg to targets below 50%
    if (attacker._execDmgMultiplier && target.hp < target.maxHp * 0.5) dmg *= attacker._execDmgMultiplier;
    // Bonus flat damage
    if (attacker._bonusDmg) dmg += attacker._bonusDmg;
    if (attacker._bonusDmgIfKw && target.kw.length > 0) dmg += attacker._bonusDmgIfKw;
    // Enforcer: bonus damage vs no-keyword / 1-keyword units
    if (attacker._bonusDmgNoKw && target.kw.length === 0) dmg += attacker._bonusDmgNoKw;
    if (attacker._bonusDmg1Kw && target.kw.length === 1) dmg += attacker._bonusDmg1Kw;
    // Pain Engine: bonus damage equal to target's missing HP
    if (attacker._bonusDmgMissingHp) dmg += Math.max(0, target.maxHp - target.hp);
    // Exploit Kit: bonus damage per debuff on target (infection, stun, silence, etc.)
    if (attacker._bonusDmgPerDebuff) {
      let debuffCount = 0;
      if (target._infected) debuffCount++;
      if (target._stunTurns > 0) debuffCount++;
      if (target._silenced) debuffCount++;
      if (target._missChance) debuffCount++;
      if (target._innateDisabled) debuffCount++;
      dmg += debuffCount * attacker._bonusDmgPerDebuff;
    }
    // Mind Crusher: bonus damage per keyword removed from target this combat
    if (attacker._bonusDmgPerKwRemoved && attacker._kwRemovedCount) {
      dmg += attacker._kwRemovedCount * attacker._bonusDmgPerKwRemoved;
    }
    // Pulse Drone: bonus damage to marked target
    if (attacker._markBonusDmg && target._marked) dmg += attacker._markBonusDmg;
    // Momentum: cumulative +1 per attack (Juggernaut)
    if (attacker._momentumDmg) {
      attacker._momentumHits = (attacker._momentumHits || 0) + 1;
      dmg += attacker._momentumHits;
    }
    // Siege Ram: first attack uses HP as damage instead of ATK
    if (attacker._firstAtkUsesHp && !attacker._firstAtkHpUsed) {
      dmg = attacker.hp;
      attacker._firstAtkHpUsed = true;
    }
    // Knuckle Duster: every Nth attack is a crit (3× damage)
    if (attacker._critEvery3) {
      attacker._hitCount = (attacker._hitCount || 0) + 1;
      if (attacker._hitCount % attacker._critEvery3 === 0) dmg *= 3;
    }
    // Turret Node: cumulative lock-on damage to same target
    if (attacker._lockOnDmg && attacker._lockOnStacks) dmg += attacker._lockOnStacks;
    // Legion Virus: bonus damage per total infection stacks on all enemies
    if (attacker._dmgPerTotalInfection) {
      const defSide = attackerSide === "player" ? eBoard : pBoard;
      const totalStacks = defSide.reduce((s, e) => s + (e._infected ? (e._infectionDmg || 1) : 0), 0);
      dmg += totalStacks * attacker._dmgPerTotalInfection;
    }
    // Role: Infiltrator bonus damage to backline targets
    if (attacker._roleBacklineDmg) {
      // Use original board position, not current array index
      if ((target._boardPos ?? 0) > 3) dmg += attacker._roleBacklineDmg;
    }

    // Hacker (6): double damage to silenced/keyword-less units
    if (attacker._doubleDmgSilenced && (target._silenced || target.kw.length === 0)) {
      dmg *= 2;
    }
    // Siege Tower: double damage to shielded targets
    if (attacker._doubleDmgToShielded && target.shield > 0) {
      dmg *= 2;
    }
    // Predator Drone: true damage while stealthed
    if (attacker._trueDamageWhileStealthed && attacker._stealthLeft && attacker._stealthLeft > 0) {
      attacker._trueDamageThisHit = true;
    }
    // Void Dancer: true damage while untargetable (alternating turns)
    if (attacker._trueDmgWhileUntargetable && attacker._isUntargetable) {
      attacker._trueDamageThisHit = true;
    }

    // Phase Knight: alternating dodge (takes 1st, dodges 2nd, takes 3rd...)
    if (target._alternatingDodge) {
      target._altDodgeCount = (target._altDodgeCount || 0) + 1;
      if (target._altDodgeCount % 2 === 0) {
        events.push({ type: "dodge", targetId: target.id, side: attackerSide === "player" ? "enemy" : "player", msg: `${target.name} phased through!`, ...snap(pBoard, eBoard) });
        // Reflex Agent: counter-attack on dodge
        if (target._counterAttackOnDodge && target.hp > 0 && attacker.hp > 0) {
          attacker.hp -= target.atk;
          events.push({ type: "death_effect", side: attackerSide === "player" ? "enemy" : "player", unitId: target.id, msg: `${target.name} counter-attacked for ${target.atk}!`, ...snap(pBoard, eBoard) });
        }
        return;
      }
    }

    // Phantom dodge
    if (target._dodgeChance && Math.random() < target._dodgeChance) {
      events.push({ type: "dodge", targetId: target.id, side: attackerSide === "player" ? "enemy" : "player", msg: `${target.name} Dodged!`, ...snap(pBoard, eBoard) });
      if (target._dodgeAtkGain) target.atk += target._dodgeAtkGain;
      // Phase Lord: gain ATK when any Phantom dodges
      const defBrd = attackerSide === "player" ? eBoard : pBoard;
      defBrd.filter(u => u._atkPerTeamDodge && u.hp > 0).forEach(u => {
        u.atk += u._atkPerTeamDodge;
      });
      // Reflex Agent: counter-attack on dodge
      if (target._counterAttackOnDodge && target.hp > 0 && attacker.hp > 0) {
        attacker.hp -= target.atk;
        events.push({ type: "death_effect", side: attackerSide === "player" ? "enemy" : "player", unitId: target.id, msg: `${target.name} counter-attacked for ${target.atk}!`, ...snap(pBoard, eBoard) });
      }
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
    // Chrome Fist: destroy ALL enemy shield on hit
    if (attacker._destroyShield && target.shield > 0) {
      events.push({ type: "death_effect", side: attackerSide, unitId: attacker.id, msg: `${attacker.name} shattered ${target.name}'s shield!`, ...snap(pBoard, eBoard) });
      target.shield = 0;
    }
    // Mind Blade: drain shield per hit
    if (attacker._drainShieldPerHit && target.shield > 0) {
      const drain = Math.min(target.shield, attacker._drainShieldPerHit);
      target.shield -= drain;
    }
    // Ignore shield flag — also true damage bypasses shields
    let shieldAbs = 0;
    const hadShield = target.shield > 0;
    if (target.shield > 0 && !attacker._ignoreShield && !attacker._trueDamage && !attacker._trueDamageThisHit) {
      let shieldDmg = dmg;
      if (attacker._shieldDmgBonus) shieldDmg = Math.floor(shieldDmg * attacker._shieldDmgBonus);
      shieldAbs = Math.min(target.shield, shieldDmg);
      target.shield -= shieldAbs;
      dmg -= Math.min(dmg, shieldAbs); // Don't reduce more than original dmg
    }

    // Brick Golem: damage cap (cannot take more than N damage per hit)
    if (target._damageCap && dmg > target._damageCap) {
      dmg = target._damageCap;
    }

    // Flat damage reduction (Brick Golem, Iron Hide, adjacent auras)
    if (target._flatDmgReduce && dmg > 0) {
      dmg = Math.max(1, dmg - target._flatDmgReduce);
      // Iron Hide: gain HP each time damage is reduced
      if (target._gainHpOnReduce) {
        target.hp += target._gainHpOnReduce;
        target.maxHp += target._gainHpOnReduce;
      }
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
    // Role: Vanguard damage reduction
    if (target._roleDR && dmg > 0) {
      dmg = Math.max(1, Math.floor(dmg * (1 - target._roleDR)));
    }
    // Role: Vanguard team flat absorb per hit
    if (target._roleFlatAbsorb && target._roleFlatAbsorb > 0 && dmg > 0) {
      dmg = Math.max(1, dmg - target._roleFlatAbsorb);
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

    // Living Fortress: while alive, allies can't be reduced below 25% HP by a single attack
    const defBoard = attackerSide === "player" ? eBoard : pBoard;
    if (dmg > 0 && defBoard.some(u => u._antiOneShot && u.hp > 0)) {
      const minHp = Math.max(1, Math.floor(target.maxHp * 0.25));
      if (target.hp - dmg < minHp && target.hp > minHp) {
        dmg = target.hp - minHp; // Cap damage to not go below 25%
      }
    }
    // Juggernaut: can't be one-shot (needs at least 2 hits to die)
    if (target._cantBeOneShot && !target._hasBeenHit && dmg >= target.hp) {
      dmg = target.hp - 1; // Leave at 1 HP on first hit
    }
    if (target._cantBeOneShot) target._hasBeenHit = true;

    target.hp -= dmg;
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

    // Data Leech: lifesteal — heal % of damage dealt
    if (attacker._lifesteal && dmg > 0 && attacker.hp > 0) {
      const heal = Math.max(1, Math.floor(dmg * attacker._lifesteal));
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    }
    // Rune Carver: inscribed reflect — target reflects damage back to attacker
    if (target._inscribeReflectActive && dmg > 0 && attacker.hp > 0) {
      const reflectDmg = target._inscribeReflectActive;
      attacker.hp -= reflectDmg;
      events.push({ type: "death_effect", side: attackerSide === "player" ? "enemy" : "player", unitId: target.id, msg: `${target.name} reflected ${reflectDmg} damage!`, ...snap(pBoard, eBoard) });
    }

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
    // Nine Lives (Stray Cat): survive lethal N times, gain ATK each time
    if (target.hp <= 0 && target._nineLives && target._nineLives > 0) {
      target.hp = 1;
      target._nineLives--;
      if (target._nineLivesAtkGain) target.atk += target._nineLivesAtkGain;
      events.push({ type: "nine_lives", side: attackerSide === "player" ? "enemy" : "player", unitId: target.id, unitName: target.name, msg: `${target.name} Nine Lives! (+${target._nineLivesAtkGain||0} ATK, ${target._nineLives} left)`, ...snap(pBoard, eBoard) });
    }
    // Steel Spine: when surviveLethal triggered above, gain bonus ATK
    if (target.hp === 1 && target._surviveLethalAtkBonus && !target._surviveLethalAtkUsed) {
      target.atk += target._surviveLethalAtkBonus;
      target._surviveLethalAtkUsed = true;
      events.push({ type: "death_effect", side: attackerSide === "player" ? "enemy" : "player", unitId: target.id, msg: `${target.name} Grit! +${target._surviveLethalAtkBonus} ATK!`, ...snap(pBoard, eBoard) });
    }
    // Omega Frame: first lethal → heal to 50% HP and double ATK
    if (target.hp <= 0 && target._onSurviveDoubleAtk && !target._omegaSurviveUsed) {
      target._omegaSurviveUsed = true;
      target.hp = Math.max(1, Math.floor(target.maxHp * (target._onSurviveHealHalf ? 0.5 : 0.25)));
      target.atk *= 2;
      events.push({ type: "death_effect", side: attackerSide === "player" ? "enemy" : "player", unitId: target.id, msg: `${target.name} Kernel Panic! Healed + ATK doubled!`, ...snap(pBoard, eBoard) });
    }
    // Relic Guard: team-wide first lethal protection (once per ally)
    if (target.hp <= 0 && !target._relicSaved) {
      const defB = attackerSide === "player" ? eBoard : pBoard;
      const relics = defB.filter(u => u._teamLethalProtection && u.hp > 0 && u.id !== target.id);
      if (relics.length > 0) {
        target.hp = 1;
        target._relicSaved = true;
        const relic = relics[0];
        if (relic._hpCostPerSave) relic.hp -= relic._hpCostPerSave;
        events.push({ type: "death_effect", side: attackerSide === "player" ? "enemy" : "player", unitId: relic.id, msg: `${relic.name} saved ${target.name} from death!`, ...snap(pBoard, eBoard) });
        if (relic.hp <= 0) {
          const idx = defB.indexOf(relic);
          if (idx >= 0) defB.splice(idx, 1);
          handleDeath(relic, defB, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player");
        }
      }
    }
    // Patient Zero: immortal while any enemy is infected
    if (target.hp <= 0 && target._immortalWhileInfected) {
      const enemies = attackerSide === "player" ? pBoard : eBoard; // attacker's side = enemies of target
      // Actually target is on the defender side, attacker is on attackerSide
      const targetEnemies = attackerSide === "player" ? pBoard : eBoard;
      const anyInfected = (attackerSide === "player" ? eBoard : pBoard).some(e => e.hp > 0 && e._infected) 
                       || targetEnemies.some(e => e._infected && e.hp > 0);
      // Check if any enemy (from target's perspective) is infected
      const defEnemies = attackerSide === "player" ? pBoard : eBoard;
      if (defEnemies.some(e => e._infected && e.hp > 0)) {
        target.hp = 1;
      }
    }
    // Genesis Monument: immortal while other Construct alive
    if (target.hp <= 0 && target._immortalWhileConstructAlive) {
      const defB3 = attackerSide === "player" ? eBoard : pBoard;
      const otherConstructs = defB3.filter(u => u.faction === "CONSTRUCT" && u.hp > 0 && u.id !== target.id);
      if (otherConstructs.length > 0) {
        target.hp = 1;
        // Redirect damage to nearest Construct
        const nearest = otherConstructs[0];
        nearest.hp -= Math.min(nearest.hp - 1, 3); // Take some redirected damage
      }
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
    let counterDmg = 0;
    // Blink Striker: can't be counter-attacked
    if (attacker._cantBeCountered) {
      counterDmg = 0;
    }
    // Dream Walker: attacker is stunned + Dream Walker counters instead
    else if (target._nightmareCounter && target.hp > 0 && !target._immune) {
      attacker._stunTurns = (attacker._stunTurns || 0) + 1;
      counterDmg = target.atk;
      events.push({ type: "death_effect", side: attackerSide === "player" ? "enemy" : "player", unitId: target.id, msg: `${target.name} Nightmare! ${attacker.name} stunned!`, ...snap(pBoard, eBoard) });
    } else {
      counterDmg = target.atk;
    }
    // Augmented carry damage reduction on counter too
    if (counterDmg > 0 && attacker._dmgReduction) {
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
    // Drone HP sharing applies to counter damage too
    if (attacker.faction === "DRONE" && counterDmg > 0) {
      const counterAllies = attackerSide === "player" ? pBoard : eBoard;
      const hasShare = counterAllies.some(u => u._droneShareDmg && u.hp > 0);
      if (hasShare) {
        const shareDrones = counterAllies.filter(u => u.faction === "DRONE" && u.hp > 0 && u.id !== attacker.id);
        if (shareDrones.length > 0) {
          attacker.hp += counterDmg;
          const perD = Math.floor(counterDmg / (shareDrones.length + 1));
          const remD = counterDmg - perD * (shareDrones.length + 1);
          attacker.hp -= (perD + remD);
          shareDrones.forEach(d => { d.hp -= perD; });
        }
      }
    }
    // Survive lethal from counter damage
    if (attacker.hp <= 0 && attacker._constructSurvive) { attacker.hp = 1; attacker._constructSurvive = false; }
    if (attacker.hp <= 0 && attacker._surviveLethal) { attacker.hp = 1; attacker._surviveLethal = false; }
    if (attacker.hp <= 0 && attacker._nineLives && attacker._nineLives > 0) {
      attacker.hp = 1; attacker._nineLives--;
      if (attacker._nineLivesAtkGain) attacker.atk += attacker._nineLivesAtkGain;
    }
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
        if (removed) {
          delete target.kwData[removed];
          // Mind Crusher: track removals for bonus damage scaling
          if (attacker._bonusDmgPerKwRemoved) attacker._kwRemovedCount = (attacker._kwRemovedCount || 0) + 1;
        }
      }
      if (attacker._onHitInfect) {
        const baseStacks = attacker._infectionStacks || 1;
        if (!target._infected) {
          target._infected = true; target._infectionDmg = baseStacks;
        } else if (attacker._doubleStacksIfInfected) {
          target._infectionDmg = (target._infectionDmg || 1) + baseStacks * 2;
        } else {
          target._infectionDmg = (target._infectionDmg || 1) + baseStacks;
        }
        // Contagion: infected enemies deal -1 ATK
        const atkBoard = attackerSide === "player" ? pBoard : eBoard;
        if (atkBoard.some(u => u._infectionAtkDebuff)) target.atk = Math.max(0, target.atk - 1);
      }
      // Carrier: transfer ALL stacks to target
      if (attacker._transferAllStacks && attacker._infected && target.hp > 0) {
        if (!target._infected) { target._infected = true; target._infectionDmg = attacker._infectionDmg || 1; }
        else { target._infectionDmg = (target._infectionDmg || 1) + (attacker._infectionDmg || 1); }
        attacker._infected = false; attacker._infectionDmg = 0;
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
      // Wire Rat: gain ATK on each hit
      if (attacker._onHitGainAtk) attacker.atk += attacker._onHitGainAtk;
      // Dream Eater: steal max HP from target
      if (attacker._onHitStealMaxHp) {
        const steal = Math.min(target.maxHp - 1, attacker._onHitStealMaxHp);
        if (steal > 0) {
          target.maxHp -= steal; target.hp = Math.min(target.hp, target.maxHp);
          attacker.maxHp += steal; attacker.hp += steal;
        }
      }
      // Zero Day: disable ALL keywords + innate
      if (attacker._onHitDisableInnate && !target._innateDisabled) {
        target._innateDisabled = true;
        target._silenced = true;
        target.kw = []; target.kwData = {};
        events.push({ type: "death_effect", side: attackerSide, unitId: attacker.id, msg: `${attacker.name} wiped ${target.name}'s innate + keywords!`, ...snap(pBoard, eBoard) });
      }
      // Glitch Imp: corrupt innate (replace with self-damage tick)
      if (attacker._onHitCorruptInnate && !target._innateCorrupted) {
        target._innateCorrupted = true;
        target._innateDisabled = true;
        target._corruptDmgPerTurn = 1;
        events.push({ type: "death_effect", side: attackerSide, unitId: attacker.id, msg: `${attacker.name} corrupted ${target.name}'s innate!`, ...snap(pBoard, eBoard) });
      }
      // Turret Node: lock-on bonus damage to same target
      if (attacker._lockOnDmg) {
        if (attacker._lockOnTarget === target.id) {
          attacker._lockOnStacks = (attacker._lockOnStacks || 0) + attacker._lockOnDmg;
        } else {
          attacker._lockOnTarget = target.id;
          attacker._lockOnStacks = 0;
        }
      }
      // Alley Rat: steal a random buff from target
      if (attacker._stealRandomBuff) {
        // Steal ATK buffs (any ATK above base)
        if (target.atk > 1) {
          const stolen = Math.min(2, target.atk - 1);
          target.atk -= stolen; attacker.atk += stolen;
        }
      }
      // Root Shell: steal an enemy keyword
      if (attacker._stealEnemyKw && target.kw.length > 0) {
        const idx = Math.floor(Math.random() * target.kw.length);
        const stolenKw = target.kw.splice(idx, 1)[0];
        if (stolenKw && !attacker.kw.includes(stolenKw)) {
          attacker.kw.push(stolenKw);
          attacker.kwData[stolenKw] = target.kwData[stolenKw] || "";
        }
        delete target.kwData[stolenKw];
      }
      // Legion Virus: spread 1 infection stack to ALL other enemies on attack
      if (attacker._spreadInfectionOnAttack) {
        const defSide = attackerSide === "player" ? eBoard : pBoard;
        defSide.filter(e => e.hp > 0 && e.id !== target.id).forEach(e => {
          if (!e._infected) { e._infected = true; e._infectionDmg = 1; }
          else { e._infectionDmg = (e._infectionDmg || 1) + 1; }
        });
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
            handleDeath(extra, defArr, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
          }
        }
      }
      // Arc Welder: attack bounces to 2nd enemy (75%) then 3rd (50%)
      if (attacker._arcChain) {
        const defArr = attackerSide === "player" ? eBoard : pBoard;
        const bounceTargets = defArr.filter(e => e.hp > 0 && e.id !== target.id);
        if (bounceTargets.length > 0 && attacker._arcBounce1) {
          const b1 = bounceTargets[Math.floor(Math.random() * bounceTargets.length)];
          const b1dmg = Math.floor(attacker.atk * attacker._arcBounce1);
          b1.hp -= b1dmg;
          events.push({ type: "ds_hit", side: attackerSide, sourceId: attacker.id, sourceName: attacker.name, targetId: b1.id, targetName: b1.name, damage: b1dmg, killed: b1.hp <= 0, ...snap(pBoard, eBoard) });
          if (b1.hp <= 0) {
            const bi = defArr.indexOf(b1); if (bi >= 0) defArr.splice(bi, 1);
            handleDeath(b1, defArr, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
          }
          // 3rd bounce
          const bounce2 = defArr.filter(e => e.hp > 0 && e.id !== target.id && e.id !== b1.id);
          if (bounce2.length > 0 && attacker._arcBounce2) {
            const b2 = bounce2[Math.floor(Math.random() * bounce2.length)];
            const b2dmg = Math.floor(attacker.atk * attacker._arcBounce2);
            b2.hp -= b2dmg;
            events.push({ type: "ds_hit", side: attackerSide, sourceId: attacker.id, sourceName: attacker.name, targetId: b2.id, targetName: b2.name, damage: b2dmg, killed: b2.hp <= 0, ...snap(pBoard, eBoard) });
            if (b2.hp <= 0) {
              const bi2 = defArr.indexOf(b2); if (bi2 >= 0) defArr.splice(bi2, 1);
              handleDeath(b2, defArr, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
            }
          }
        }
      }
      // Ghost Protocol: first attack from stealth applies all ally on-hit effects
      if (attacker._applyAllOnHitFromStealth && attacker._stealthLeft && attacker._stealthLeft > 0 && !attacker._ghostProtocolUsed) {
        attacker._ghostProtocolUsed = true;
        const allies = attackerSide === "player" ? pBoard : eBoard;
        allies.filter(u => u.hp > 0 && u.id !== attacker.id).forEach(u => {
          if (u._onHitStealAtk && target.hp > 0) { target.atk = Math.max(0, target.atk - u._onHitStealAtk); attacker.atk += u._onHitStealAtk; }
          if (u._onHitInfect && !target._infected && target.hp > 0) { target._infected = true; target._infectionDmg = 1; }
          if (u._onHitRemoveKw && target.kw.length > 0 && target.hp > 0) { target.kw.splice(Math.floor(Math.random() * target.kw.length), 1); }
        });
        events.push({ type: "death_effect", side: attackerSide, unitId: attacker.id, msg: `${attacker.name} Zero-Day Ambush! Applied all ally on-hits!`, ...snap(pBoard, eBoard) });
      }
    }
    if (attacker._swapAfterAttack && attacker.hp > 0) {
      const allies = attackerSide === "player" ? pBoard : eBoard;
      if (allies.length > 1) {
        const otherIdx = Math.floor(Math.random() * allies.length);
        const myIdx = allies.indexOf(attacker);
        if (otherIdx !== myIdx && myIdx >= 0) {
          // Rift Walker: swapped ally gets ATK bonus
          if (attacker._swapAllyAtkBonus) allies[otherIdx].atk += attacker._swapAllyAtkBonus;
          [allies[myIdx], allies[otherIdx]] = [allies[otherIdx], allies[myIdx]];
        }
      }
    }
    // Track attack counter for every-3rd effects
    if (attacker._attackCounter !== undefined) attacker._attackCounter++;
    // Dimension Ripper: each attack tears a rift
    if (attacker._riftPerAttack) attacker._riftCount = (attacker._riftCount || 0) + 1;
    // Net Runner: track stolen ATK for redistribution
    if (attacker._redistributeStolenAtk && attacker._onHitStealAtk) {
      attacker._stolenAtk = (attacker._stolenAtk || 0) + (attacker._onHitStealAtk || 1);
    }
    if (attacker._aoeEvery3 && attacker._attackCounter % 3 === 0 && attacker.hp > 0) {
      const enemies = attackerSide === "player" ? eBoard : pBoard;
      enemies.filter(e => e.hp > 0 && e.id !== target.id).forEach(e => {
        e.hp -= attacker.atk;
      });
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].hp <= 0) {
          const dead = enemies[i]; enemies.splice(i, 1);
          handleDeath(dead, enemies, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
        }
      }
    }
    // Reality Tear: every 4th attack, AoE all enemies + stun all
    if (attacker._aoeEvery4 && attacker._attackCounter % 4 === 0 && attacker.hp > 0) {
      const enemies = attackerSide === "player" ? eBoard : pBoard;
      const aoeDmg = attacker.atk;
      enemies.filter(e => e.hp > 0).forEach(e => {
        e.hp -= aoeDmg;
        if (attacker._aoeStunAll) e._stunTurns = (e._stunTurns || 0) + attacker._aoeStunAll;
      });
      events.push({ type: "death_effect", side: attackerSide, unitId: attacker.id, msg: `${attacker.name} Dimensional Collapse! AoE ${aoeDmg} + stun!`, ...snap(pBoard, eBoard) });
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].hp <= 0) {
          const dead = enemies[i]; enemies.splice(i, 1);
          handleDeath(dead, enemies, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
        }
      }
    }
    // Psi Storm: every 3rd turn, AoE damage = ATK, costs HP
    if (attacker._aoeUsesAtk && attacker._attackCounter % 3 === 0 && attacker.hp > 0) {
      const enemies = attackerSide === "player" ? eBoard : pBoard;
      const aoeDmg = attacker.atk;
      enemies.filter(e => e.hp > 0).forEach(e => { e.hp -= aoeDmg; });
      if (attacker._aoeCostsHp) attacker.hp -= attacker._aoeCostsHp;
      events.push({ type: "death_effect", side: attackerSide, unitId: attacker.id, msg: `${attacker.name} Psionic Tempest! ${aoeDmg} AoE!`, ...snap(pBoard, eBoard) });
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].hp <= 0) {
          const dead = enemies[i]; enemies.splice(i, 1);
          handleDeath(dead, enemies, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
        }
      }
    }
    // Heal on attack
    if (attacker._healOnAttack && attacker.hp > 0) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker._healOnAttack);
    }
    // Mirror Ghost: decrement copy attack limit
    if (attacker._copyAttacksLeft !== undefined && attacker._copyAttacksLeft > 0) {
      attacker._copyAttacksLeft--;
      if (attacker._copyAttacksLeft <= 0) { attacker.hp = 0; } // Ghost expires
    }
    // Silence turn decrement
    if (target._silenceTurns && target._silenceTurns > 0) {
      target._silenceTurns--;
      if (target._silenceTurns <= 0) { target._silenced = false; target._innateDisabled = false; }
    }
    // Clear trueDamageThisHit flag
    if (attacker._trueDamageThisHit) attacker._trueDamageThisHit = false;
    // Overclock Drone: self-damage per attack
    if (attacker._selfDmgPerAttack && attacker.hp > 0) {
      attacker.hp -= attacker._selfDmgPerAttack;
      // If self-damage kills, explode for AoE
      if (attacker.hp <= 0 && attacker._explodeOnSelfKill) {
        const aoe = attacker.atk * 2;
        const enemies = attackerSide === "player" ? eBoard : pBoard;
        enemies.filter(e => e.hp > 0).forEach(e => { e.hp -= aoe; });
        events.push({ type: "death_effect", side: attackerSide, unitId: attacker.id, msg: `${attacker.name} OVERHEATED! Exploded for ${aoe} AoE!`, ...snap(pBoard, eBoard) });
      }
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

    // Snapshot ATK at time of hit — cleave/splash use this, not post-scaling ATK
    const atkAtHit = attacker.atk;

    // Synth scaling: gain stats after each attack
    if (attacker._synthScale && attacker.hp > 0) {
      const synthMult = attacker._synthScaleMultiplier || 1;
      attacker.atk += attacker._synthScale * synthMult;
      if (attacker._synthScale >= 2) { attacker.hp += attacker._synthScale * synthMult; attacker.maxHp += attacker._synthScale * synthMult; }
    }

    // Role: Striker scaling — gain ATK after each attack
    if (attacker._roleStrikerScale && attacker.hp > 0) {
      attacker.atk += attacker._roleStrikerScale;
    }

    // Regen: heal after attacking
    if (attacker.kw.includes("regen") && attacker.hp > 0) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + 2);
    }

    // Phantom stealth on kill
    if (killed && attacker._phantomStealthOnKill && attacker.hp > 0) {
      attacker._stealthLeft = 2;
    }
    // Role: Infiltrator kill refreshes stealth
    if (killed && attacker._roleKillStealth && attacker.hp > 0) {
      attacker._stealthLeft = Math.max(attacker._stealthLeft || 0, 1);
    }

    // ── UNIVERSAL KILL TRACKING ──
    if (killed && attacker.hp > 0) {
      attacker._killsThisCombat = (attacker._killsThisCombat || 0) + 1;
    }

    // ── INNATE ON-KILL EFFECTS ──
    if (killed && attacker.hp > 0) {
      if (attacker._onKillAtkGain) { attacker.atk += attacker._onKillAtkGain; if (attacker._permanentKillGain) { attacker._permAtkGained = (attacker._permAtkGained || 0) + attacker._onKillAtkGain; } }
      if (attacker._onKillHpGain) { attacker.hp += attacker._onKillHpGain; attacker.maxHp += attacker._onKillHpGain; if (attacker._permanentKillGain) { attacker._permHpGained = (attacker._permHpGained || 0) + attacker._onKillHpGain; } }
      if (attacker._onKillHealFull) attacker.hp = attacker.maxHp;
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
          handleDeath(e, enemies, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
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
        // Hardshell blocks cleave hit entirely
        if (adj.hardshellActive) {
          adj.hardshellActive = false;
          events.push({ type: "hardshell", targetId: adj.id, side: attackerSide === "player" ? "enemy" : "player", msg: `${adj.name} Hardshell blocked cleave!`, ...snap(pBoard, eBoard) });
          return;
        }
        let cleaveDmg = atkAtHit;
        let cleaveShieldAbs = 0;
        if (adj.shield > 0) { cleaveShieldAbs = Math.min(adj.shield, cleaveDmg); adj.shield -= cleaveShieldAbs; cleaveDmg -= cleaveShieldAbs; }
        if (adj._flatDmgReduce && cleaveDmg > 0) cleaveDmg = Math.max(1, cleaveDmg - adj._flatDmgReduce);
        if (adj._flatAbsorb && adj._flatAbsorb > 0 && cleaveDmg > 0) { const abs = Math.min(adj._flatAbsorb, cleaveDmg); adj._flatAbsorb -= abs; cleaveDmg -= abs; }
        if (adj._dmgReduction && cleaveDmg > 0) cleaveDmg = Math.max(1, Math.floor(cleaveDmg * (1 - adj._dmgReduction)));
        if (adj._dmgReduceAboveHalf && adj.hp > adj.maxHp * 0.5 && cleaveDmg > 0) cleaveDmg = Math.max(1, Math.floor(cleaveDmg * (1 - adj._dmgReduceAboveHalf)));
        adj.hp -= cleaveDmg;
        if (adj.hp <= 0 && adj._constructSurvive) { adj.hp = 1; adj._constructSurvive = false; }
        events.push({ type: "cleave", side: attackerSide, attackerId: attacker.id, attackerName: attacker.name, targetId: adj.id, targetName: adj.name, damage: atkAtHit, shieldAbsorbed: cleaveShieldAbs, killed: adj.hp <= 0, ...snap(pBoard, eBoard) });
        if (adj.hp <= 0) cleaveKills.push(adj);
      });
      cleaveKills.forEach(adj => {
        const idx = defenders.indexOf(adj);
        if (idx >= 0) defenders.splice(idx, 1);
        handleDeath(adj, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
      });
    }
    // Splash: 50% ATK to all OTHER enemies
    if (attacker.kw.includes("splash") && attacker.hp > 0) {
      const splashDmg = Math.max(1, Math.floor(atkAtHit * 0.5));
      const splashKills = [];
      defenders.filter(u => u.hp > 0 && u.id !== target.id).forEach(adj => {
        if (adj._dodgeAoe && Math.random() < adj._dodgeAoe) return;
        // Hardshell blocks splash hit entirely
        if (adj.hardshellActive) {
          adj.hardshellActive = false;
          events.push({ type: "hardshell", targetId: adj.id, side: attackerSide === "player" ? "enemy" : "player", msg: `${adj.name} Hardshell blocked splash!`, ...snap(pBoard, eBoard) });
          return;
        }
        let sDmg = splashDmg;
        let sAbs = 0;
        if (adj.shield > 0) { sAbs = Math.min(adj.shield, sDmg); adj.shield -= sAbs; sDmg -= sAbs; }
        if (adj._flatDmgReduce && sDmg > 0) sDmg = Math.max(1, sDmg - adj._flatDmgReduce);
        if (adj._flatAbsorb && adj._flatAbsorb > 0 && sDmg > 0) { const abs = Math.min(adj._flatAbsorb, sDmg); adj._flatAbsorb -= abs; sDmg -= abs; }
        if (adj._dmgReduction && sDmg > 0) sDmg = Math.max(1, Math.floor(sDmg * (1 - adj._dmgReduction)));
        if (adj._dmgReduceAboveHalf && adj.hp > adj.maxHp * 0.5 && sDmg > 0) sDmg = Math.max(1, Math.floor(sDmg * (1 - adj._dmgReduceAboveHalf)));
        adj.hp -= sDmg;
        if (adj.hp <= 0 && adj._constructSurvive) { adj.hp = 1; adj._constructSurvive = false; }
        events.push({ type: "splash", side: attackerSide, attackerId: attacker.id, attackerName: attacker.name, targetId: adj.id, targetName: adj.name, damage: splashDmg, shieldAbsorbed: sAbs, killed: adj.hp <= 0, ...snap(pBoard, eBoard) });
        if (adj.hp <= 0) splashKills.push(adj);
      });
      // Process splash kills: splice + handleDeath
      splashKills.forEach(adj => {
        const idx = defenders.indexOf(adj);
        if (idx >= 0) defenders.splice(idx, 1);
        handleDeath(adj, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
      });
    }
    // Clean cleave/splash kills
    // FIRST: handle counter-killed attacker BEFORE filtering boards
    if (counterKilled) {
      const attackers = attackerSide === "player" ? pBoard : eBoard;
      const idx = attackers.indexOf(attacker);
      if (idx >= 0) attackers.splice(idx, 1);
      handleDeath(attacker, attackers, defenders, attackerSide, target);
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
      handleDeath(target, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
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
              handleDeath(nextTarget, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
            }
          }
        }
      }
      // Blade Runner: overkill damage carries to next target in line
      if (attacker._overkillCarry && attacker.hp > 0 && defenders.length > 0) {
        const overkill = Math.abs(target.hp); // target.hp is negative = overkill
        if (overkill > 0) {
          const nextTarget = defenders.find(d => d.hp > 0);
          if (nextTarget) {
            nextTarget.hp -= overkill;
            events.push({ type: "overflow", side: attackerSide, attackerId: attacker.id, attackerName: attacker.name, targetId: nextTarget.id, targetName: nextTarget.name, damage: overkill, killed: nextTarget.hp <= 0, ...snap(pBoard, eBoard) });
            if (nextTarget.hp <= 0) {
              const oi = defenders.indexOf(nextTarget); if (oi >= 0) defenders.splice(oi, 1);
              handleDeath(nextTarget, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
            }
          }
        }
      }
      // Apex Predator: overkill damage splashes to a random second enemy
      if (attacker._overkillSplash && attacker.hp > 0 && defenders.length > 0) {
        const overkill = Math.abs(target.hp);
        if (overkill > 0) {
          const alive = defenders.filter(d => d.hp > 0);
          if (alive.length > 0) {
            const splashTarget = alive[Math.floor(Math.random() * alive.length)];
            splashTarget.hp -= overkill;
            events.push({ type: "overflow", side: attackerSide, attackerId: attacker.id, attackerName: attacker.name, targetId: splashTarget.id, targetName: splashTarget.name, damage: overkill, killed: splashTarget.hp <= 0, ...snap(pBoard, eBoard) });
            if (splashTarget.hp <= 0) {
              const oi = defenders.indexOf(splashTarget); if (oi >= 0) defenders.splice(oi, 1);
              handleDeath(splashTarget, defenders, attackerSide === "player" ? pBoard : eBoard, attackerSide === "player" ? "enemy" : "player", attacker);
            }
          }
        }
      }
      // Track kills for executeThresholdGrowth (Void Reaper)
      if (attacker._executeThresholdGrowth && attacker._executeBelow) {
        attacker._executeBelow = Math.min(0.9, attacker._executeBelow + attacker._executeThresholdGrowth);
      }
      // On-kill effects: heal half (Omega Predator)
      if (attacker._onKillHealHalf && attacker.hp > 0) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.floor(attacker.maxHp * 0.5));
      }
      // On-kill permanent gain (Scout Fly)
      if (attacker._onKillPermGain) {
        attacker.atk += attacker._onKillPermGain;
        attacker.maxHp += attacker._onKillPermGain;
        attacker.hp += attacker._onKillPermGain;
      }
      // Blink Striker: teleport to backline on kill
      if (attacker._blinkOnKill && attacker.hp > 0) {
        const allies = attackerSide === "player" ? pBoard : eBoard;
        const myIdx = allies.indexOf(attacker);
        if (myIdx >= 0 && myIdx < allies.length - 1) {
          allies.splice(myIdx, 1);
          allies.push(attacker); // Move to back
        }
      }
      // Infection spread on kill (Microbe)
      if (attacker._infectionSpreadOnKill && target._infected && defenders.length > 0) {
        const stacks = target._infectionDmg || 1;
        const spreadDouble = attacker._infectionSpreadDouble ? 2 : 1;
        defenders.filter(d => d.hp > 0 && !d._infected).slice(0, spreadDouble).forEach(d => {
          d._infected = true; d._infectionDmg = stacks;
        });
      }
      // Ascendant Shade: become the killed unit
      if (attacker._onKillBecomeVictim && attacker.hp > 0) {
        attacker.atk = Math.max(attacker.atk, target.atk);
        attacker.name = target.name + " (Shade)";
        // Copy target's innate flags
        Object.keys(target).filter(k => k.startsWith('_') && !['_boardPos'].includes(k)).forEach(k => {
          if (attacker[k] === undefined) attacker[k] = target[k];
        });
        attacker._onKillBecomeVictim = true; // Retain this innate
        events.push({ type: "death_effect", side: attackerSide, unitId: attacker.id, msg: `${attacker.name} became ${target.name}!`, ...snap(pBoard, eBoard) });
      }
      // Apex Strain: gain victim's innate on kill
      if (attacker._onKillGainInnate && attacker.hp > 0) {
        Object.keys(target).filter(k => k.startsWith('_') && !['_boardPos','_stunTurns'].includes(k)).forEach(k => {
          if (attacker[k] === undefined) attacker[k] = target[k];
        });
      }
      // Bounty Hunter: bounty rewards on marked kill
      if (target._bountyTarget && attacker._bountyAtkReward) {
        attacker.atk += attacker._bountyAtkReward;
        events.push({ type: "death_effect", side: attackerSide, unitId: attacker.id, msg: `${attacker.name} collected bounty! +${attacker._bountyAtkReward} ATK!`, ...snap(pBoard, eBoard) });
        // Re-mark next highest-tier
        if (attacker._markHighestTier && defenders.length > 0) {
          const next = [...defenders].filter(d => d.hp > 0).sort((a, b) => b.tier - a.tier)[0];
          if (next) { next._marked = true; next._bountyTarget = true; }
        }
      }
      // Phase Assassin: re-mark and re-phase on kill
      if (attacker._reMarkOnKill && attacker.hp > 0) {
        attacker._stealthLeft = 99;
        if (defenders.length > 0) {
          const next = [...defenders].filter(d => d.hp > 0).sort((a, b) => b.atk - a.atk)[0];
          if (next) { next._marked = true; attacker._phasedTarget = next.id; }
        }
      }
      // Strike Wing: advance targeting forward on kill
      if (attacker._advanceOnKill && attacker._targetBackline) {
        // Already targeting backline — kills move us forward naturally as enemies die
      }
      // War Machine: chain triple — next Synth ally gets triple on their first attack
      if (attacker._chainTripleOnKill && attacker.hp > 0) {
        const allies = attackerSide === "player" ? pBoard : eBoard;
        const nextSynth = allies.find(u => u.faction === "SYNTH" && u.hp > 0 && u.id !== attacker.id && !u._firstAtkMultiplier);
        if (nextSynth) nextSynth._firstAtkMultiplier = 3;
      }
      // Cluster Bomb: chain detonation — if deathAoeDmg killed someone, they also explode
      // (already handled in handleDeath → deathAoeDmg recursion, chainDetonation is a signal)
      // Ransomware: victim's HP → gold (tracked in goldEarned var)
      if (attacker._onKillVictimHpToGold) {
        goldEarned = Math.floor(target.maxHp / 2);
      }
      // Mirror Ghost: decrement attack limit
      if (attacker._copyAttacksLeft !== undefined) {
        attacker._copyAttacksLeft--;
        if (attacker._copyAttacksLeft <= 0) attacker.hp = 0; // Ghost expires
      }
    }

    // Attacker died to thorns (only if not already handled by counter-kill above)
    if (attacker.hp <= 0 && !counterKilled) {
      const attackers = attackerSide === "player" ? pBoard : eBoard;
      const idx = attackers.indexOf(attacker);
      if (idx >= 0) {
        attackers.splice(idx, 1);
        handleDeath(attacker, attackers, defenders, attackerSide, target);
      }
      // If idx < 0, attacker was already spliced (e.g., killed by deadswitch AoE) — skip
    }

    // Clean up any 0 HP units — route through handleDeath for proper death events + deadswitches
    const cleanupDead = (board, enemyBoard, side) => {
      for (let i = board.length - 1; i >= 0; i--) {
        if (board[i] && board[i].hp <= 0) {
          const dead = board[i];
          board.splice(i, 1);
          handleDeath(dead, board, enemyBoard, side);
        }
      }
    };
    cleanupDead(pBoard, eBoard, "player");
    cleanupDead(eBoard, pBoard, "enemy");
  };

  let turnsSinceLastDeath = 0;
  // Synth extra turns extend the combat
  const pExtraTurns = pBoard._synthExtraTurns || 0;
  const eExtraTurns = eBoard._synthExtraTurns || 0;
  // Overclock chip: +6 extra turns
  const overclockBonus = (pBoard._overclockBonus ? 6 : 0) + (eBoard._overclockBonus ? 6 : 0);
  const maxTurns = 60 + Math.max(pExtraTurns, eExtraTurns) + overclockBonus;

  events.push({ type: "phase", phase: "combat", msg: "⚔️ COMBAT PHASE — Fight!", ...snap(pBoard, eBoard) });

  while (pBoard.length > 0 && eBoard.length > 0 && turn < maxTurns) {
    turn++;
    const pBefore = pBoard.length, eBefore = eBoard.length;

    // Psionic shield regen: all units with _shieldRegen regain shield each turn
    [...pBoard, ...eBoard].forEach(u => {
      if (u._shieldRegen && u.hp > 0) u.shield = (u.shield || 0) + u._shieldRegen;
    });

    // ── INNATE PER-TURN PASSIVES ──
    const runPassives = (board, enemy, side) => {
      board.forEach(u => {
        if (u.hp <= 0) return;
        // Heal lowest ally
        if (u._healLowestPerTurn) {
          const lowest = board.filter(a => a.hp > 0 && a.hp < a.maxHp).sort((a,b) => a.hp - b.hp)[0];
          if (lowest) {
            const before = lowest.hp;
            lowest.hp = Math.min(lowest.maxHp, lowest.hp + u._healLowestPerTurn);
            if (lowest.hp > before) events.push({ type: "heal", side, unitId: lowest.id, unitName: lowest.name, amount: lowest.hp - before, source: u.name, ...snap(pBoard, eBoard) });
          }
        }
        // Heal all drones
        if (u._healDronesPerTurn) {
          board.filter(a => a.faction === "DRONE" && a.hp > 0 && a.hp < a.maxHp).forEach(a => {
            const before = a.hp;
            a.hp = Math.min(a.maxHp, a.hp + u._healDronesPerTurn);
            if (a.hp > before) events.push({ type: "heal", side, unitId: a.id, unitName: a.name, amount: a.hp - before, source: u.name, ...snap(pBoard, eBoard) });
          });
        }
        // Self heal
        if (u._selfHealPerTurn) {
          const before = u.hp;
          u.hp = Math.min(u.maxHp, u.hp + u._selfHealPerTurn);
          if (u.hp > before) events.push({ type: "heal", side, unitId: u.id, unitName: u.name, amount: u.hp - before, source: "self-heal", ...snap(pBoard, eBoard) });
        }
        // Random buff
        if (u._randomBuffPerTurn) { u.atk += 1; u.hp += 1; u.maxHp += 1; }
        // Mutagen: +1/+1 each combat turn
        if (u._growPerTurn) {
          u.atk += 1; u.hp += 1; u.maxHp += 1;
          events.push({ type: "passive_buff", side, unitId: u.id, unitName: u.name, msg: `${u.name} grew +1/+1`, ...snap(pBoard, eBoard) });
        }
        // Chaos Engine: random effect each turn
        if (u._chaosPerTurn && u.hp > 0) {
          const roll = Math.random();
          if (roll < 0.25) { u.atk += 2; events.push({ type: "passive_buff", side, unitId: u.id, msg: `${u.name} Chaos: +2 ATK`, ...snap(pBoard, eBoard) }); }
          else if (roll < 0.5) { u.hp += 2; u.maxHp += 2; events.push({ type: "passive_buff", side, unitId: u.id, msg: `${u.name} Chaos: +2 HP`, ...snap(pBoard, eBoard) }); }
          else if (roll < 0.75) {
            const alive = enemy.filter(e => e.hp > 0);
            if (alive.length > 0) { const e = alive[Math.floor(Math.random() * alive.length)]; e.hp -= 3; events.push({ type: "passive_damage", side, unitId: u.id, msg: `${u.name} Chaos: 3 dmg to ${e.name}`, ...snap(pBoard, eBoard) }); }
          }
          else { const ally = board.filter(a => a.hp > 0 && a.id !== u.id)[0]; if (ally) { ally.atk += 1; ally.hp += 1; ally.maxHp += 1; } }
        }
        // Incubator: gestationGrowth — grow +2/+2 per turn while alive
        if (u._gestationGrowth && u.hp > 0) {
          u.atk += 2; u.hp += 2; u.maxHp += 2;
          events.push({ type: "passive_buff", side, unitId: u.id, msg: `${u.name} gestating: +2/+2`, ...snap(pBoard, eBoard) });
        }
        // Foundation: all Constructs gain +1 HP per turn
        if (u._constructHpPerRound && u.hp > 0) {
          board.filter(a => a.faction === "CONSTRUCT" && a.hp > 0).forEach(a => {
            a.hp += u._constructHpPerRound; a.maxHp += u._constructHpPerRound;
          });
        }
        // Monolith: gain +2 max HP per turn
        if (u._growHpPerRound && u.hp > 0) {
          u.hp += u._growHpPerRound; u.maxHp += u._growHpPerRound;
        }
        // Street Samurai: gain ATK each turn survived
        if (u._survivalAtkGain && u.hp > 0) {
          u.atk += u._survivalAtkGain;
          events.push({ type: "passive_buff", side, unitId: u.id, msg: `${u.name} Bushido: +${u._survivalAtkGain} ATK`, ...snap(pBoard, eBoard) });
        }
        // Random mutation: +2 to random stat each turn
        if (u._randomMutation && u.hp > 0) {
          const r = Math.random();
          if (r < 0.33) { u.atk += 2; }
          else if (r < 0.66) { u.hp += 2; u.maxHp += 2; }
          else { u.shield = (u.shield || 0) + 2; }
        }
        // Dimension Ripper: each attack tears a rift; rifts deal damage per turn
        if (u._riftPerAttack && u.hp > 0) {
          u._riftCount = (u._riftCount || 0); // Incremented per attack in doAttack
        }
        if (u._riftDmgPerTurn && u._riftCount && u._riftCount > 0) {
          const riftTotalDmg = u._riftCount * u._riftDmgPerTurn;
          enemy.filter(e => e.hp > 0).forEach(e => { e.hp -= riftTotalDmg; });
          events.push({ type: "passive_damage", side, unitId: u.id, msg: `${u.name}: ${u._riftCount} rifts deal ${riftTotalDmg} total!`, ...snap(pBoard, eBoard) });
        }
        // The Colossus: every N turns, stomp for HP% damage to all enemies
        if (u._stompEvery && u._stompDmgFromHp && u.hp > 0) {
          u._stompCounter = (u._stompCounter || 0) + 1;
          if (u._stompCounter % u._stompEvery === 0) {
            const stompDmg = Math.floor(u.hp * u._stompDmgFromHp);
            enemy.filter(e => e.hp > 0).forEach(e => { e.hp -= stompDmg; });
            events.push({ type: "passive_damage", side, unitId: u.id, msg: `${u.name} STOMP! ${stompDmg} to all!`, ...snap(pBoard, eBoard) });
          }
        }
        // Mothership: spawn a Drone every N turns
        if (u._spawnDroneEveryN && u.hp > 0) {
          u._spawnCounter = (u._spawnCounter || 0) + 1;
          if (u._spawnCounter % u._spawnDroneEveryN === 0 && board.length < MAX_BOARD_SIZE) {
            const spawned = { id: gid(), tn: "Drone", name: "Deploy Drone", faction: "DRONE", tier: 1, atk: 2, hp: 2, maxHp: 2, emoji: "", golden: false, kw: [], kwData: {}, mod: null, shield: 0, hardshellActive: false };
            // Mothership: spawned drones inherit innate
            if (u._spawnedDroneInheritInnate) {
              Object.keys(u).filter(k => k.startsWith('_') && !['_spawnDroneEveryN','_spawnedDroneInheritInnate','_spawnCounter','_boardPos'].includes(k)).forEach(k => {
                spawned[k] = u[k];
              });
            }
            board.push(spawned);
            events.push({ type: "spawn", side, unitId: spawned.id, unitName: spawned.name, source: u.name + " Deploy", ...snap(pBoard, eBoard) });
          }
        }
        // Net Runner: redistribute stolen ATK to allies
        if (u._redistributeStolenAtk && u._stolenAtk && u._stolenAtk > 0) {
          const allies = board.filter(a => a.hp > 0 && a.id !== u.id);
          if (allies.length > 0) {
            const per = Math.floor(u._stolenAtk / allies.length);
            allies.forEach(a => { a.atk += per; });
            u._stolenAtk = 0;
          }
        }
        // Quantum Core: split damage with linked copy
        if (u._splitDamage && u._superLink) {
          // Handled in damage section — flag just needs to be referenced
        }
        // Hive Queen: revive delay counter
        if (u._reviveDelay) {
          u._reviveTimer = (u._reviveTimer || 0) + 1;
        }
        // Patient Infinity: revive half hp flag (read by death handler)
        if (u._reviveHalfHp !== undefined) {
          // Flag stamped — checked in handleDeath revive section
        }
        // AoE tick damage to all enemies
        if (u._aoeTickDmg) {
          const tickKills = [];
          enemy.forEach(e => {
            if (e.hp > 0) {
              e.hp -= u._aoeTickDmg;
              if (e.hp <= 0) tickKills.push(e);
            }
          });
          events.push({ type: "passive_damage", side, unitId: u.id, unitName: u.name, damage: u._aoeTickDmg, msg: `${u.name} dealt ${u._aoeTickDmg} tick damage to all enemies`, ...snap(pBoard, eBoard) });
        }
        // Infection tick damage (with Pandemic double tick + Omega Strain multiplier)
        if (u._infected && u._infectionDmg) {
          // The enemy board has the Virus units that apply multipliers
          const virusBoard = side === "player" ? eBoard : pBoard; // enemies of the infected unit
          // Wait — infection is applied TO enemies by your Virus units. So the Virus board is the OTHER side.
          // If side="player", these are player units being ticked. Enemy viruses applied infection.
          // If side="enemy", these are enemy units being ticked. Player viruses applied infection.
          const infectorBoard = side === "player" ? eBoard : pBoard;
          let tickDmg = u._infectionDmg;
          // Omega Strain: infection multiplier (1.5×)
          const hasMult = infectorBoard.some(v => v._infectionMultiplier && v.hp > 0);
          if (hasMult) {
            const mult = infectorBoard.find(v => v._infectionMultiplier)._infectionMultiplier;
            tickDmg = Math.ceil(tickDmg * mult);
          }
          // Omega Strain: infectionTickDmg — additional flat bonus to tick damage
          if (infectorBoard.some(v => v._infectionTickDmg && v.hp > 0)) {
            tickDmg += 1; // Extra damage per tick
          }
          u.hp -= tickDmg;
          events.push({ type: "passive_damage", side: side === "player" ? "enemy" : "player", unitId: u.id, unitName: u.name, damage: tickDmg, msg: `${u.name} took ${tickDmg} infection damage`, ...snap(pBoard, eBoard) });
          // Pandemic: double tick (tick again)
          if (infectorBoard.some(v => v._doubleInfectionTick && v.hp > 0)) {
            u.hp -= tickDmg;
            events.push({ type: "passive_damage", side: side === "player" ? "enemy" : "player", unitId: u.id, unitName: u.name, damage: tickDmg, msg: `${u.name} double infection tick: -${tickDmg}`, ...snap(pBoard, eBoard) });
          }
          // Plague Lord: heal from all infection damage dealt
          infectorBoard.filter(v => v._healFromInfection && v.hp > 0).forEach(v => {
            v.hp = Math.min(v.maxHp, v.hp + tickDmg);
          });
        }
        // Glitch Imp corruption: take 1 damage per turn
        if (u._corruptDmgPerTurn) {
          u.hp -= u._corruptDmgPerTurn;
          events.push({ type: "passive_damage", side, unitId: u.id, unitName: u.name, damage: u._corruptDmgPerTurn, msg: `${u.name} corrupted: -${u._corruptDmgPerTurn}`, ...snap(pBoard, eBoard) });
        }
        // Void Dancer: alternate targetable/untargetable each turn
        if (u._alternatingUntargetable) {
          u._altTurnCount = (u._altTurnCount || 0) + 1;
          u._isUntargetable = u._altTurnCount % 2 === 1; // odd turns = untargetable
          if (u._isUntargetable) u._stealthLeft = 1; // untargetable via stealth mechanic
        }
        // Ghost expiration: ghosts lose a turn and die when out
        if (u._isGhost) {
          u._ghostTurnsLeft = (u._ghostTurnsLeft || 0) - 1;
          if (u._ghostTurnsLeft <= 0) {
            u.hp = 0;
            events.push({ type: "death", side, unitId: u.id, unitName: u.name, msg: `${u.name} faded away`, ...snap(pBoard, eBoard) });
          }
        }
      });
      // Pandemic: auto-spread infection to random uninfected enemies each turn
      const hasPandemic = board.some(u => u._autoSpreadInfection && u.hp > 0);
      if (hasPandemic) {
        const uninfected = enemy.filter(e => e.hp > 0 && !e._infected);
        if (uninfected.length > 0) {
          const pick = uninfected[Math.floor(Math.random() * uninfected.length)];
          pick._infected = true; pick._infectionDmg = 1;
          events.push({ type: "passive_damage", side, msg: `Pandemic spread infection to ${pick.name}!`, ...snap(pBoard, eBoard) });
        }
      }
      // Clean tick deaths on ENEMY board
      for (let i = enemy.length - 1; i >= 0; i--) {
        if (!enemy[i]) { enemy.splice(i, 1); continue; }
        if (enemy[i].hp <= 0) {
          const dead = enemy[i]; enemy.splice(i, 1);
          events.push({ type: "death", side: enemy === eBoard ? "enemy" : "player", unitId: dead.id, unitName: dead.name, unitEmoji: dead.emoji, msg: `${dead.emoji} ${dead.name} destroyed (tick damage)`, ...snap(pBoard, eBoard) });
          handleDeath(dead, enemy, board, enemy === eBoard ? "enemy" : "player");
        }
      }
      // Clean self-board deaths (ghosts expiring, self-damage)
      for (let i = board.length - 1; i >= 0; i--) {
        if (!board[i]) { board.splice(i, 1); continue; }
        if (board[i].hp <= 0) {
          const dead = board[i]; board.splice(i, 1);
          handleDeath(dead, board, enemy, side);
        }
      }
    };
    runPassives(pBoard, eBoard, "player");
    runPassives(eBoard, pBoard, "enemy");
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
        if (att._roleDoubleAttack) atkCount *= 2;
        if (att._tripleAtkSpeed) atkCount *= 3;
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
        if (att._roleDoubleAttack) atkCount *= 2;
        if (att._tripleAtkSpeed) atkCount *= 3;
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
  // Collect permanent kill gains from both alive AND dead player units
  const allPlayerUnits = [...pBoard, ...pDead];
  const permanentGains = allPlayerUnits.filter(u => u._permanentKillGain && (u._permAtkGained || u._permHpGained))
    .map(u => ({ id: u.id, tn: u.tn || u.name, atkGain: u._permAtkGained || 0, hpGain: u._permHpGained || 0 }));

  // Collect combat kills for ALL player units (alive + dead) for veteran system
  const combatKills = allPlayerUnits.filter(u => u._killsThisCombat > 0)
    .map(u => ({ id: u.id, tn: u.tn || u.name, kills: u._killsThisCombat, role: u.role || '' }));

  events.push({ type: "result", playerWon: pw, draw, dmgToLoser: dmg, pVirusBleed, eVirusBleed, permanentGains, combatKills, pGoldEarned, pBoard: pBoard.map(u => ({ ...u })), eBoard: eBoard.map(u => ({ ...u })) });
  return { playerWon: pw, draw, dmgToLoser: dmg, pVirusBleed, eVirusBleed, events, permanentGains, combatKills, pGoldEarned };
}

export { U, T7_UNITS, mkUnit, simCombat, setupInnateFlags, gid };
