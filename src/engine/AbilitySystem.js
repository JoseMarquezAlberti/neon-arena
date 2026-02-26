/**
 * AbilitySystem.js — Data-driven combat ability resolution
 * Replaces the ~400-line setupInnateFlags regex parser.
 * 
 * Reads structured data from unit-abilities.json and applies combat flags
 * to units at the start of each combat. Same flags, no string parsing.
 */

let ABILITY_MAP = {};

/** Call once at init with the imported JSON */
function setAbilityMap(map) {
  ABILITY_MAP = map;
}

/**
 * Main entry point — drop-in replacement for the old setupInnateFlags.
 * Mutates units in-place (same behavior as original).
 */
function setupInnateFlags(board, enemyBoard) {
  // Pass 1: Apply self-flags and auto-keywords
  board.forEach((u, idx) => {
    const entry = ABILITY_MAP[u.tn || u.name.replace(/^Golden /, '')];
    
    // Faction auto-wiring (always applies, even without an entry)
    applyFactionWiring(u);
    
    if (!entry) return;
    
    // Auto-keywords
    if (entry.autoKeywords) {
      entry.autoKeywords.forEach(ak => {
        if (!u.kw.includes(ak.kw)) {
          u.kw.push(ak.kw);
          if (ak.kwData !== undefined) u.kwData[ak.kw] = ak.kwData;
          if (ak.kw === 'hardshell') u.hardshellActive = true;
        }
      });
    }
    
    // Death effects → auto-add deadswitch keyword
    if (entry.deathEffect && !u.kw.includes('deadswitch')) {
      u.kw.push('deadswitch');
      u.kwData.deadswitch = entry.deathEffect.kwData || u.innate?.replace('On death: ', '') || '';
    }
    
    // Apply all combat flags
    if (entry.flags) {
      applyFlags(u, entry.flags);
    }
  });
  
  // Pass 2: Board-level effects (adjacent buffs, faction scaling, etc.)
  board.forEach((u, idx) => {
    const entry = ABILITY_MAP[u.tn || u.name.replace(/^Golden /, '')];
    if (!entry?.boardEffects) return;
    
    entry.boardEffects.forEach(fx => {
      applyBoardEffect(fx, u, idx, board, enemyBoard);
    });
  });
  
  // Pass 3: Swift sorting
  board.sort((a, b) => (b._swift ? 1 : 0) - (a._swift ? 1 : 0));
  
  // Pass 4: Post-setup effects (copy keywords, steal, silence)
  board.forEach((u, idx) => {
    // Copy adjacent keyword
    if (u._copyAdjacentKw) {
      const neighbors = [idx > 0 ? board[idx-1] : null, idx < board.length-1 ? board[idx+1] : null].filter(Boolean);
      const available = neighbors.flatMap(n => n.kw).filter(k => !u.kw.includes(k));
      if (available.length > 0) {
        const gained = available[Math.floor(Math.random() * available.length)];
        u.kw.push(gained);
        if (gained === 'stealth') u._stealthLeft = 2;
        if (gained === 'hardshell') u.hardshellActive = true;
      }
    }
    
    // Copy enemy keywords
    if (u._copyEnemyKw && enemyBoard.length > 0) {
      const strongest = [...enemyBoard].sort((a,b) => b.atk - a.atk)[0];
      if (strongest) strongest.kw.forEach(k => { if (!u.kw.includes(k)) u.kw.push(k); });
    }
    
    // Steal enemy keyword
    if (u._stealEnemyKw && enemyBoard.length > 0) {
      const strongest = [...enemyBoard].sort((a,b) => b.atk - a.atk)[0];
      if (strongest && strongest.kw.length > 0) {
        const stolen = strongest.kw.splice(Math.floor(Math.random() * strongest.kw.length), 1)[0];
        if (stolen && !u.kw.includes(stolen)) u.kw.push(stolen);
      }
    }
    
    // Silence all enemies
    if (u._silenceAllEnemies) {
      enemyBoard.forEach(e => { e._silenced = true; e.kw = []; e.kwData = {}; e.hardshellActive = false; });
    }
    
    // Random keyword each combat
    if (u._randomKwEachCombat) {
      const pool = ['firewall','hardshell','stealth','cleave','sniper','splash','regen','taunt'];
      const available = pool.filter(k => !u.kw.includes(k));
      if (available.length > 0) {
        const gained = available[Math.floor(Math.random() * available.length)];
        u.kw.push(gained);
        if (gained === 'stealth') u._stealthLeft = 2;
        if (gained === 'hardshell') u.hardshellActive = true;
      }
    }
    
    // Copy strongest enemy innate
    if (u._copyStrongestInnate && enemyBoard.length > 0 && !u._copyDone) {
      u._copyDone = true;
      const strongest = [...enemyBoard].sort((a,b) => b.atk - a.atk)[0];
      if (strongest?.innate && !strongest.innate.toLowerCase().includes('copies')) {
        u.innate = strongest.innate;
        setupInnateFlags([u], enemyBoard);
      }
    }
  });
  
  // Pass 5: Aura ATK
  board.forEach(u => {
    if (u._auraAtk) board.forEach(a => { if (a.id !== u.id) a.atk += u._auraAtk; });
  });
  
  // Pass 6: Start debuffs
  board.forEach(u => {
    if (u._startDebuffRandomAtk && enemyBoard.length > 0) {
      const target = enemyBoard[Math.floor(Math.random() * enemyBoard.length)];
      target.atk = Math.max(0, target.atk - u._startDebuffRandomAtk);
    }
  });
}

// ─── HELPERS ────────────────────────────────────────────

function applyFactionWiring(u) {
  if (u.faction === 'VIRUS') {
    if (!u.kw.includes('splash')) { u.kw.push('splash'); u.kwData.splash = '50% ATK to adjacent enemies'; }
  }
  if (u.faction === 'NEUTRAL') {
    if (!u.kw.includes('adapt')) { u.kw.push('adapt'); }
  }
}

function applyFlags(u, flags) {
  // On-hit
  if (flags.onHitStealAtk !== undefined) u._onHitStealAtk = flags.onHitStealAtk;
  if (flags.onHitInfect) u._onHitInfect = true;
  if (flags.onHitSpreadInfect) u._onHitSpreadInfect = true;
  if (flags.onHitReduceMaxHp) u._onHitReduceMaxHp = true;
  if (flags.onHitRemoveKw) u._onHitRemoveKw = true;
  if (flags.onHitStealStats) u._onHitStealStats = true;
  
  // On-kill
  if (flags.onKillAtkGain !== undefined) u._onKillAtkGain = flags.onKillAtkGain;
  if (flags.onKillHpGain !== undefined) u._onKillHpGain = flags.onKillHpGain;
  if (flags.permanentKillGain) u._permanentKillGain = true;
  if (flags.onKillHealFull) u._onKillHealFull = true;
  if (flags.onKillExtraAttack) u._onKillExtraAttack = true;
  if (flags.onKillStealth) u._onKillStealth = true;
  if (flags.onKillGainHighestStat) u._onKillGainHighestStat = true;
  if (flags.onKillGainVictimAtk) u._onKillGainVictimAtk = true;
  if (flags.onKillSplash !== undefined) u._onKillSplash = flags.onKillSplash;
  if (flags.onKillInfectCount !== undefined) u._onKillInfectCount = flags.onKillInfectCount;
  if (flags.onKillGoldPerTier) u._onKillGoldPerTier = true;
  
  // Death
  if (flags.reviveCount !== undefined) u._reviveCount = flags.reviveCount;
  
  // Combat start
  if (flags.innateStart) u._innateStart = flags.innateStart;
  if (flags.startDebuffRandomAtk !== undefined) u._startDebuffRandomAtk = flags.startDebuffRandomAtk;
  
  // Targeting
  if (flags.targetHighestAtk) u._targetHighestAtk = true;
  if (flags.targetWeakest) u._targetWeakest = true;
  if (flags.targetMostKw) u._targetMostKw = true;
  if (flags.targetBackline) u._targetBackline = true;
  if (flags.targetRandom) u._targetRandom = true;
  if (flags.stealthLeft !== undefined) u._stealthLeft = flags.stealthLeft;
  if (flags.untargetableUntilAttack) u._untargetableUntilAttack = true;
  if (flags.immuneToEffects) u._immuneToEffects = true;
  if (flags.swift) u._swift = true;
  if (flags.splashOneRandom) u._splashOneRandom = true;
  
  // Defense
  if (flags.dodgeChance !== undefined) u._dodgeChance = Math.max(u._dodgeChance || 0, flags.dodgeChance);
  if (flags.dodgeAoe !== undefined) u._dodgeAoe = flags.dodgeAoe;
  if (flags.blockFirstHit) u._blockFirstHit = true;
  if (flags.flatAbsorb !== undefined) u._flatAbsorb = flags.flatAbsorb;
  if (flags.flatDmgReduce !== undefined) u._flatDmgReduce = (u._flatDmgReduce || 0) + flags.flatDmgReduce;
  if (flags.dmgReduceAboveHalf !== undefined) u._dmgReduceAboveHalf = flags.dmgReduceAboveHalf;
  if (flags.surviveLethal) u._surviveLethal = true;
  if (flags.immune) u._immune = true;
  if (flags.immuneTurns !== undefined) u._immuneTurns = flags.immuneTurns;
  if (flags.bonusHp) { u.hp += flags.bonusHp; u.maxHp += flags.bonusHp; }
  if (flags.adjacentAbsorb !== undefined) u._adjacentAbsorb = flags.adjacentAbsorb;
  if (flags.globalAbsorb !== undefined) u._globalAbsorb = flags.globalAbsorb;
  if (flags.boardAbsorb !== undefined) u._boardAbsorb = flags.boardAbsorb;
  if (flags.adjacentTank) u._adjacentTank = true;
  
  // Attack modifiers
  if (flags.firstAtkMultiplier !== undefined) u._firstAtkMultiplier = flags.firstAtkMultiplier;
  if (flags.execDmgMultiplier !== undefined) u._execDmgMultiplier = flags.execDmgMultiplier;
  if (flags.copyTargetAtk) u._copyTargetAtk = true;
  if (flags.firstAtkSilence) u._firstAtkSilence = true;
  if (flags.bonusDmg !== undefined) u._bonusDmg = (u._bonusDmg || 0) + flags.bonusDmg;
  if (flags.bonusDmgIfKw !== undefined) u._bonusDmgIfKw = flags.bonusDmgIfKw;
  if (flags.ignoreShield) u._ignoreShield = true;
  if (flags.shieldDmgBonus !== undefined) u._shieldDmgBonus = flags.shieldDmgBonus;
  if (flags.berserk) u._berserk = true;
  if (flags.dodgeAtkGain !== undefined) u._dodgeAtkGain = flags.dodgeAtkGain;
  
  // Per-turn passives
  if (flags.healLowestPerTurn !== undefined) u._healLowestPerTurn = flags.healLowestPerTurn;
  if (flags.healDronesPerTurn !== undefined) u._healDronesPerTurn = flags.healDronesPerTurn;
  if (flags.selfHealPerTurn !== undefined) u._selfHealPerTurn = flags.selfHealPerTurn;
  if (flags.healOnAttack !== undefined) u._healOnAttack = flags.healOnAttack;
  if (flags.aoeTickDmg !== undefined) u._aoeTickDmg = flags.aoeTickDmg;
  if (flags.doubleAttackEvery3) { u._doubleAttackEvery3 = true; u._attackCounter = 0; }
  if (flags.aoeEvery3) { u._aoeEvery3 = true; u._attackCounter = 0; }
  if (flags.growPerTurn) u._growPerTurn = true;
  if (flags.onDamagedAtkGain !== undefined) u._onDamagedAtkGain = flags.onDamagedAtkGain;
  
  // Special
  if (flags.doubleSynthLinks) u._doubleSynthLinks = true;
  if (flags.doublePsionicShields) u._doublePsionicShields = true;
  if (flags.doubleSynthInnate) u._doubleSynthInnate = true;
  if (flags.doubleVirusDeath) u._doubleVirusDeath = true;
  if (flags.droneShareDmg) u._droneShareDmg = true;
  if (flags.droneHpPool) u._droneHpPool = true;
  if (flags.enemySlowdown) u._enemySlowdown = true;
  if (flags.wildcard) u._wildcard = true;
  if (flags.infectionTickDmg !== undefined) u._infectionTickDmg = flags.infectionTickDmg;
  if (flags.infectionAtkDebuff) u._infectionAtkDebuff = true;
  if (flags.copyStrongestInnate) u._copyStrongestInnate = true;
  if (flags.copyEnemyKw) u._copyEnemyKw = true;
  if (flags.stealEnemyKw) u._stealEnemyKw = true;
  if (flags.silenceAllEnemies) u._silenceAllEnemies = true;
  if (flags.swapAfterAttack) u._swapAfterAttack = true;
  if (flags.swapOnHit) u._swapOnHit = true;
  if (flags.executeBelow !== undefined) u._executeBelow = flags.executeBelow;
  if (flags.randomKwEachCombat) u._randomKwEachCombat = true;
  if (flags.copyAdjacentKw) u._copyAdjacentKw = true;
  if (flags.copyAdjacentInnates) u._copyAdjacentInnates = true;
  if (flags.healAllOnAllyDeath !== undefined) u._healAllOnAllyDeath = flags.healAllOnAllyDeath;
  if (flags.auraAtk !== undefined) u._auraAtk = flags.auraAtk;

  // ── Balance patch flags ──
  if (flags.onKillHealHalf) u._onKillHealHalf = true;
  if (flags.debuffPerPsionic !== undefined) u._debuffPerPsionic = flags.debuffPerPsionic;
  if (flags.maxDebuff !== undefined) u._maxDebuff = flags.maxDebuff;
  if (flags.singleStatSwap) u._singleStatSwap = true;
  if (flags.infectionMultiplier !== undefined) u._infectionMultiplier = flags.infectionMultiplier;
  if (flags.deathMassInfect) u._deathMassInfect = true;
  if (flags.deathInfectStacks !== undefined) u._deathInfectStacks = flags.deathInfectStacks;
  if (flags.shieldOnCombatStart !== undefined) u._shieldOnCombatStart = flags.shieldOnCombatStart;
  if (flags.onHitGainAtk !== undefined) u._onHitGainAtk = flags.onHitGainAtk;
  if (flags.factionDiversityBonus !== undefined) u._factionDiversityBonus = flags.factionDiversityBonus;
  if (flags.reviveCount !== undefined) u._reviveCount = flags.reviveCount;
  if (flags.reviveHpFraction !== undefined) u._reviveHpFraction = flags.reviveHpFraction;
  if (flags.reviveAtkBoost !== undefined) u._reviveAtkBoost = flags.reviveAtkBoost;
  if (flags.collectInnatesOnRevive) u._collectInnatesOnRevive = true;

  // ── Combat-start / board manipulation flags ──
  if (flags.copyAdjacentBuffs) u._copyAdjacentBuffs = true;
  if (flags.copyRandomAllyInnate) u._copyRandomAllyInnate = true;
  if (flags.copyStrongestEnemy) u._copyStrongestEnemy = true;
  if (flags.copyStatRatio !== undefined) u._copyStatRatio = flags.copyStatRatio;
  if (flags.copyAttackLimit !== undefined) u._copyAttackLimit = flags.copyAttackLimit;
  if (flags.stealStrongestInnate) u._stealStrongestInnate = true;
  if (flags.absorbFirstEnemyInnate) u._absorbFirstEnemyInnate = true;
  if (flags.autoOptimizeBoard) u._autoOptimizeBoard = true;
  if (flags.doubleCombatStartInnates) u._doubleCombatStartInnates = true;
  if (flags.doublePsionicStart) u._doublePsionicStart = true;
  if (flags.doublePsionicValues) u._doublePsionicValues = true;
  if (flags.boostPsionicValues !== undefined) u._boostPsionicValues = flags.boostPsionicValues;
  if (flags.synthInnateTriple) u._synthInnateTriple = true;
  if (flags.synthScale) u._synthScale = true;
  if (flags.synthScaleMultiplier !== undefined) u._synthScaleMultiplier = flags.synthScaleMultiplier;
  if (flags.gainStatsPerCombatStartInnate) u._gainStatsPerCombatStartInnate = true;
  if (flags.dmgPerFactionCount !== undefined) u._dmgPerFactionCount = flags.dmgPerFactionCount;
  if (flags.shieldBoardFromAtk) u._shieldBoardFromAtk = true;
  if (flags.shieldWeakest !== undefined) u._shieldWeakest = flags.shieldWeakest;
  if (flags.protectWeakest) u._protectWeakest = true;
  if (flags.shieldByTier !== undefined) u._shieldByTier = flags.shieldByTier;
  if (flags.shieldsPersist) u._shieldsPersist = true;
  if (flags.shieldFromMaxHp !== undefined) u._shieldFromMaxHp = flags.shieldFromMaxHp;
  if (flags.shieldPerDroneCount) u._shieldPerDroneCount = true;
  if (flags.atkFromBoardShields) u._atkFromBoardShields = true;
  if (flags.debuffStrongestAtk !== undefined) u._debuffStrongestAtk = flags.debuffStrongestAtk;
  if (flags.debuffStrongestCount !== undefined) u._debuffStrongestCount = flags.debuffStrongestCount;
  if (flags.debuffAllEnemyAtk) u._debuffAllEnemyAtk = true;
  if (flags.mindControl !== undefined) u._mindControl = flags.mindControl;
  if (flags.mergeWeakestAllies !== undefined) u._mergeWeakestAllies = flags.mergeWeakestAllies;
  if (flags.boardStatSwap) u._boardStatSwap = true;
  if (flags.swapEnemyAtkHp !== undefined) u._swapEnemyAtkHp = flags.swapEnemyAtkHp;
  if (flags.redirectFirstAttacker) u._redirectFirstAttacker = true;
  if (flags.delayEnemies !== undefined) u._delayEnemies = flags.delayEnemies;
  if (flags.delayTurns !== undefined) u._delayTurns = flags.delayTurns;
  if (flags.pullEnemies !== undefined) u._pullEnemies = flags.pullEnemies;
  if (flags.halveAdjacentEnemyAtk) u._halveAdjacentEnemyAtk = true;
  if (flags.hpByPosition !== undefined) u._hpByPosition = flags.hpByPosition;
  if (flags.globalSilenceDuration !== undefined) u._globalSilenceDuration = flags.globalSilenceDuration;
  if (flags.silencePerHacker !== undefined) u._silencePerHacker = flags.silencePerHacker;
  if (flags.healMostDamaged) u._healMostDamaged = true;
  if (flags.cleanseDebuffs) u._cleanseDebuffs = true;

  // ── Mark / target flags ──
  if (flags.markTarget) u._markTarget = true;
  if (flags.markBonusDmg !== undefined) u._markBonusDmg = flags.markBonusDmg;
  if (flags.markHighestAtk) u._markHighestAtk = true;
  if (flags.markHighestTier) u._markHighestTier = true;
  if (flags.phasedUntilMark) u._phasedUntilMark = true;
  if (flags.reMarkOnKill) u._reMarkOnKill = true;
  if (flags.bountyAtkReward !== undefined) u._bountyAtkReward = flags.bountyAtkReward;
  if (flags.bountyGoldReward !== undefined) u._bountyGoldReward = flags.bountyGoldReward;

  // ── On-hit / attack modifier flags ──
  if (flags.lifesteal !== undefined) u._lifesteal = flags.lifesteal;
  if (flags.lockOnDmg !== undefined) u._lockOnDmg = flags.lockOnDmg;
  if (flags.onHitCorruptInnate) u._onHitCorruptInnate = true;
  if (flags.onHitDisableInnate) u._onHitDisableInnate = true;
  if (flags.onHitStealMaxHp !== undefined) u._onHitStealMaxHp = flags.onHitStealMaxHp;
  if (flags.drainShieldPerHit !== undefined) u._drainShieldPerHit = flags.drainShieldPerHit;
  if (flags.bonusDmgPerDebuff !== undefined) u._bonusDmgPerDebuff = flags.bonusDmgPerDebuff;
  if (flags.bonusDmgPerKwRemoved !== undefined) u._bonusDmgPerKwRemoved = flags.bonusDmgPerKwRemoved;
  if (flags.bonusDmgMissingHp) u._bonusDmgMissingHp = true;
  if (flags.bonusDmgNoKw !== undefined) u._bonusDmgNoKw = flags.bonusDmgNoKw;
  if (flags.bonusDmg1Kw !== undefined) u._bonusDmg1Kw = flags.bonusDmg1Kw;
  if (flags.stealRandomBuff) u._stealRandomBuff = true;
  if (flags.trueDamage) u._trueDamage = true;
  if (flags.trueDamageWhileStealthed) u._trueDamageWhileStealthed = true;
  if (flags.trueDmgWhileUntargetable) u._trueDmgWhileUntargetable = true;
  if (flags.destroyShield) u._destroyShield = true;
  if (flags.doubleDmgToShielded) u._doubleDmgToShielded = true;
  if (flags.critEvery3 !== undefined) u._critEvery3 = flags.critEvery3;
  if (flags.arcChain) u._arcChain = true;
  if (flags.arcBounce1 !== undefined) u._arcBounce1 = flags.arcBounce1;
  if (flags.arcBounce2 !== undefined) u._arcBounce2 = flags.arcBounce2;
  if (flags.firstAtkUsesHp) u._firstAtkUsesHp = true;
  if (flags.overkillCarry) u._overkillCarry = true;
  if (flags.overkillSplash) u._overkillSplash = true;
  if (flags.momentumDmg) u._momentumDmg = true;
  if (flags.redistributeStolenAtk) u._redistributeStolenAtk = true;
  if (flags.reflectDamageNearby !== undefined) u._reflectDamageNearby = flags.reflectDamageNearby;
  if (flags.reflectRange !== undefined) u._reflectRange = flags.reflectRange;
  if (flags.forceAllAttackThis) u._forceAllAttackThis = true;
  if (flags.applyAllOnHitFromStealth) u._applyAllOnHitFromStealth = true;

  // ── On-kill flags ──
  if (flags.chainTripleOnKill) u._chainTripleOnKill = true;
  if (flags.onKillBecomeVictim) u._onKillBecomeVictim = true;
  if (flags.onKillGainInnate) u._onKillGainInnate = true;
  if (flags.onKillPermGain) u._onKillPermGain = true;
  if (flags.onKillVictimHpToGold) u._onKillVictimHpToGold = true;
  if (flags.blinkOnKill) u._blinkOnKill = true;
  if (flags.advanceOnKill) u._advanceOnKill = true;

  // ── Infection / virus flags ──
  if (flags.infectionStacks !== undefined) u._infectionStacks = flags.infectionStacks;
  if (flags.doubleStacksIfInfected) u._doubleStacksIfInfected = true;
  if (flags.transferAllStacks) u._transferAllStacks = true;
  if (flags.spreadInfectionOnAttack) u._spreadInfectionOnAttack = true;
  if (flags.dmgPerTotalInfection !== undefined) u._dmgPerTotalInfection = flags.dmgPerTotalInfection;
  if (flags.doubleInfectionTick) u._doubleInfectionTick = true;
  if (flags.autoSpreadInfection) u._autoSpreadInfection = true;
  if (flags.healFromInfection) u._healFromInfection = true;
  if (flags.virusMassInfect) u._virusMassInfect = true;
  if (flags.infectionSpreadOnKill !== undefined) u._infectionSpreadOnKill = flags.infectionSpreadOnKill;
  if (flags.infectionSpreadDouble) u._infectionSpreadDouble = true;
  if (flags.deathInfectAll) u._deathInfectAll = true;
  if (flags.deathInfectionBurst) u._deathInfectionBurst = true;
  if (flags.immortalWhileInfected) u._immortalWhileInfected = true;
  if (flags.randomMutation) u._randomMutation = true;
  if (flags.gestationGrowth) u._gestationGrowth = true;
  if (flags.aoeAllDmg !== undefined) u._aoeAllDmg = flags.aoeAllDmg;
  if (flags.virusHealFromAoe) u._virusHealFromAoe = true;

  // ── Drone / spawn flags ──
  if (flags.droneDeathAtkStack !== undefined) u._droneDeathAtkStack = flags.droneDeathAtkStack;
  if (flags.absorbDeadDroneAtk) u._absorbDeadDroneAtk = true;
  if (flags.healOnDroneDeath !== undefined) u._healOnDroneDeath = flags.healOnDroneDeath;
  if (flags.droneStealth) u._droneStealth = true;
  if (flags.sharedAllDroneInnates) u._shareAllDroneInnates = true;
  if (flags.shareAllDroneInnates) u._shareAllDroneInnates = true;
  if (flags.spawnDroneEveryN !== undefined) u._spawnDroneEveryN = flags.spawnDroneEveryN;
  if (flags.spawnedDroneInheritInnate) u._spawnedDroneInheritInnate = true;
  if (flags.boostNearbyDroneInnate !== undefined) u._boostNearbyDroneInnate = flags.boostNearbyDroneInnate;
  if (flags.reviveDeadDrones) u._reviveDeadDrones = true;
  if (flags.reviveDelay !== undefined) u._reviveDelay = flags.reviveDelay;
  if (flags.reviveMaxPerUnit !== undefined) u._reviveMaxPerUnit = flags.reviveMaxPerUnit;
  if (flags.deathConsumeAllDrones) u._deathConsumeAllDrones = true;
  if (flags.deathSpawnCount !== undefined) u._deathSpawnCount = flags.deathSpawnCount;
  if (flags.spawnTokenOnCombat) u._spawnTokenOnCombat = true;
  if (flags.tokenStats !== undefined) u._tokenStats = flags.tokenStats;

  // ── Death / deadswitch flags ──
  if (flags.deathSplit) u._deathSplit = true;
  if (flags.splitRetainBuffs) u._splitRetainBuffs = true;
  if (flags.recursiveSplit) u._recursiveSplit = true;
  if (flags.deathStunKiller) u._deathStunKiller = true;
  if (flags.deathDmgToKiller !== undefined) u._deathDmgToKiller = flags.deathDmgToKiller;
  if (flags.deathAoeDmg !== undefined) u._deathAoeDmg = flags.deathAoeDmg;
  if (flags.chainDetonation) u._chainDetonation = true;
  if (flags.deathDmgPerMaxHp) u._deathDmgPerMaxHp = true;
  if (flags.deathCurseKiller) u._deathCurseKiller = true;
  if (flags.deathTransferHpToConstruct) u._deathTransferHpToConstruct = true;
  if (flags.deathHpGift) u._deathHpGift = true;
  if (flags.deathSwapEnemies) u._deathSwapEnemies = true;
  if (flags.deathStunSwapped) u._deathStunSwapped = true;
  if (flags.deathGhost) u._deathGhost = true;
  if (flags.ghostPersistTurns !== undefined) u._ghostPersistTurns = flags.ghostPersistTurns;
  if (flags.ghostTrueDmg) u._ghostTrueDmg = true;
  if (flags.deathTrojan) u._deathTrojan = true;
  if (flags.deathPlayerDmg) u._deathPlayerDmg = true;
  if (flags.playerDmgFromAtk) u._playerDmgFromAtk = true;
  if (flags.inheritBuffs) u._inheritBuffs = true;

  // ── Ally death synergy flags ──
  if (flags.onAllyDeathGainStats !== undefined) u._onAllyDeathGainStats = flags.onAllyDeathGainStats;
  if (flags.onAllyDeathFireInnate) u._onAllyDeathFireInnate = true;
  if (flags.collectDeadAllyInnates) u._collectDeadAllyInnates = true;

  // ── Per-turn / conditional flags ──
  if (flags.damageCap !== undefined) u._damageCap = flags.damageCap;
  if (flags.cantBeOneShot) u._cantBeOneShot = true;
  if (flags.antiOneShot !== undefined) u._antiOneShot = flags.antiOneShot;
  if (flags.alternatingDodge) u._alternatingDodge = true;
  if (flags.alternatingUntargetable) u._alternatingUntargetable = true;
  if (flags.bodyguard) u._bodyguard = true;
  if (flags.bodyguardCharges !== undefined) u._bodyguardCharges = flags.bodyguardCharges;
  if (flags.aoeReduction !== undefined) u._aoeReduction = flags.aoeReduction;
  if (flags.aoeReductionTransfer) u._aoeReductionTransfer = true;
  if (flags.counterAttackOnDodge) u._counterAttackOnDodge = true;
  if (flags.gainHpOnReduce) u._gainHpOnReduce = true;
  if (flags.cantBeCountered) u._cantBeCountered = true;
  if (flags.aoeEvery4) { u._aoeEvery4 = true; u._attackCounter = 0; }
  if (flags.aoeCostsHp !== undefined) u._aoeCostsHp = flags.aoeCostsHp;
  if (flags.aoeUsesAtk) u._aoeUsesAtk = true;
  if (flags.aoeStunAll !== undefined) u._aoeStunAll = flags.aoeStunAll;
  if (flags.chaosPerTurn) u._chaosPerTurn = true;
  if (flags.stompEvery !== undefined) u._stompEvery = flags.stompEvery;
  if (flags.stompDmgFromHp !== undefined) u._stompDmgFromHp = flags.stompDmgFromHp;
  if (flags.auraAtkFromHpPercent !== undefined) u._auraAtkFromHpPercent = flags.auraAtkFromHpPercent;
  if (flags.superposition) u._superposition = true;
  if (flags.splitDamage !== undefined) u._splitDamage = flags.splitDamage;
  if (flags.missChance !== undefined) u._missChance = flags.missChance;
  if (flags.missChanceStacks) u._missChanceStacks = true;
  if (flags.nightmareCounter) u._nightmareCounter = true;
  if (flags.riftPerAttack) u._riftPerAttack = true;
  if (flags.riftDmgPerTurn !== undefined) u._riftDmgPerTurn = flags.riftDmgPerTurn;

  // ── Berserk / scaling flags ──
  if (flags.berserkDoubleAt !== undefined) u._berserkDoubleAt = flags.berserkDoubleAt;
  if (flags.berserkTripleAt !== undefined) u._berserkTripleAt = flags.berserkTripleAt;
  if (flags.tripleAtkSpeed) u._tripleAtkSpeed = true;
  if (flags.selfDmgPerAttack !== undefined) u._selfDmgPerAttack = flags.selfDmgPerAttack;
  if (flags.explodeOnSelfKill) u._explodeOnSelfKill = true;
  if (flags.executeThresholdGrowth !== undefined) u._executeThresholdGrowth = flags.executeThresholdGrowth;
  if (flags.survivalAtkGain !== undefined) u._survivalAtkGain = flags.survivalAtkGain;
  if (flags.surviveLethalAtkBonus) u._surviveLethalAtkBonus = true;
  if (flags.surviveLethalAtkBoost) u._surviveLethalAtkBoost = true;
  if (flags.onSurviveHealHalf) u._onSurviveHealHalf = true;
  if (flags.onSurviveDoubleAtk) u._onSurviveDoubleAtk = true;
  if (flags.adaptiveCounter) u._adaptiveCounter = true;
  if (flags.criticalMassThreshold !== undefined) u._criticalMassThreshold = flags.criticalMassThreshold;
  if (flags.criticalMassBonus !== undefined) u._criticalMassBonus = flags.criticalMassBonus;

  // ── Construct flags ──
  if (flags.constructScaleRate !== undefined) u._constructScaleRate = flags.constructScaleRate;
  if (flags.constructBonus !== undefined) u._constructBonus = flags.constructBonus;
  if (flags.constructHpPerRound !== undefined) u._constructHpPerRound = flags.constructHpPerRound;
  if (flags.growHpPerRound !== undefined) u._growHpPerRound = flags.growHpPerRound;
  if (flags.lockedInPlace) u._lockedInPlace = true;
  if (flags.inscribeReflect !== undefined) u._inscribeReflect = flags.inscribeReflect;
  if (flags.teamLethalProtection) u._teamLethalProtection = true;
  if (flags.hpCostPerSave !== undefined) u._hpCostPerSave = flags.hpCostPerSave;
  if (flags.petrifyFirstAttacker) u._petrifyFirstAttacker = true;
  if (flags.immortalWhileConstructAlive) u._immortalWhileConstructAlive = true;

  // ── Phantom / dodge / stealth flags ──
  if (flags.dodgeChance !== undefined) u._dodgeChance = Math.max(u._dodgeChance || 0, flags.dodgeChance);
  if (flags.dodgeAtkGain !== undefined) u._dodgeAtkGain = Math.max(u._dodgeAtkGain || 0, flags.dodgeAtkGain);
  if (flags.teamDodgeBonus !== undefined) u._teamDodgeBonus = flags.teamDodgeBonus;
  if (flags.atkPerTeamDodge !== undefined) u._atkPerTeamDodge = flags.atkPerTeamDodge;
  if (flags.reviveHalfHp) u._reviveHalfHp = true;
  if (flags.rePhaseDelay !== undefined) u._rePhaseDelay = flags.rePhaseDelay;
  if (flags.swapAllyAtkBonus !== undefined) u._swapAllyAtkBonus = flags.swapAllyAtkBonus;
  if (flags.onlyAoECanHit) u._onlyAoECanHit = true;

  // ── Hacker / slowdown flags ──
  if (flags.slowFastestEnemy !== undefined) u._slowFastestEnemy = flags.slowFastestEnemy;
  if (flags.slowdownPerHacker !== undefined) u._slowdownPerHacker = flags.slowdownPerHacker;
  if (flags.interceptEnemyBuffs) u._interceptEnemyBuffs = true;

  // ── Neutral / economy flags ──
  if (flags.soloTriple) u._soloTriple = true;
  if (flags.soloQuadruple) u._soloQuadruple = true;
  if (flags.bonusSellGold !== undefined) u._bonusSellGold = flags.bonusSellGold;
  if (flags.globalBuySellAtkGain !== undefined) u._globalBuySellAtkGain = flags.globalBuySellAtkGain;
  if (flags.goldSpendAtk !== undefined) u._goldSpendAtk = flags.goldSpendAtk;
  if (flags.stimLowestAlly !== undefined) u._stimLowestAlly = flags.stimLowestAlly;
  if (flags.nineLives) u._nineLives = true;
  if (flags.nineLivesAtkGain !== undefined) u._nineLivesAtkGain = flags.nineLivesAtkGain;
}

function applyBoardEffect(fx, unit, idx, board, enemyBoard) {
  const left = idx > 0 ? board[idx-1] : null;
  const right = idx < board.length-1 ? board[idx+1] : null;
  const neighbors = [left, right].filter(Boolean);
  
  switch (fx.type) {
    // ── Adjacent effects ──
    case 'adjacentDmgReduce':
      neighbors.forEach(n => { n._flatDmgReduce = (n._flatDmgReduce || 0) + fx.amount; });
      break;
    case 'adjacentBlockFirst':
      neighbors.forEach(n => {
        n._blockFirstHit = true;
      });
      break;
    case 'adjacentShield':
      neighbors.forEach(n => { n.shield = (n.shield || 0) + fx.amount; });
      break;
    case 'adjacentFactionBuff':
      neighbors.forEach(n => {
        if (!fx.faction || n.faction === fx.faction) {
          n.atk += fx.atk; n.hp += fx.hp; n.maxHp += fx.hp;
        }
      });
      break;
      
    // ── All-ally effects ──
    case 'allShield':
      board.forEach(a => { a.shield = (a.shield || 0) + fx.amount; });
      break;
    case 'allShieldByTier':
      board.forEach(a => { a.shield = (a.shield || 0) + (a.tier || 1); });
      break;
    case 'allShieldByHp':
      board.forEach(a => { a.shield = (a.shield || 0) + a.hp; });
      break;
    case 'allBuff':
      board.forEach(a => { a.atk += fx.atk; a.hp += fx.hp; a.maxHp += fx.hp; });
      break;
    case 'allFactionBuff':
      board.filter(a => a.faction === fx.faction && a.id !== unit.id).forEach(a => {
        a.atk += fx.atk; a.hp += fx.hp; a.maxHp += fx.hp;
      });
      break;
      
    // ── Faction scaling ──
    case 'selfScalePerFaction': {
      const count = board.filter(a => a.faction === fx.faction).length;
      unit.atk += fx.atkPer * count;
      unit.hp += fx.hpPer * count;
      unit.maxHp += fx.hpPer * count;
      break;
    }
    case 'allAtkPerFaction': {
      const count = board.filter(a => a.faction === fx.faction).length;
      board.forEach(a => { a.atk += count; });
      break;
    }
    case 'allBonusDmgPerFaction': {
      const count = board.filter(a => a.faction === fx.faction).length;
      board.forEach(a => { a._bonusDmg = (a._bonusDmg || 0) + count; });
      break;
    }
    case 'loneNeutralBuff':
      if (board.filter(a => a.faction === 'NEUTRAL').length === 1) {
        unit.atk += fx.atk; unit.hp += fx.hp; unit.maxHp += fx.hp;
      }
      break;
    case 'factionAtkBuff':
      board.filter(a => a.faction === fx.faction).forEach(a => { a.atk += fx.amount; });
      break;
      
    // ── Combat start effects ──
    case 'selfAtkPerAlly':
      unit.atk += board.length;
      break;
    case 'startDmgRandomEnemy':
      if (enemyBoard.length > 0) {
        const target = enemyBoard[Math.floor(Math.random() * enemyBoard.length)];
        target.hp -= fx.amount;
      }
      break;
    case 'startDebuffStrongest':
      if (enemyBoard.length > 0) {
        const strongest = [...enemyBoard].sort((a,b) => b.atk - a.atk)[0];
        strongest.atk = Math.max(0, strongest.atk - fx.amount);
      }
      break;
    case 'startDebuffAllEnemies':
      enemyBoard.forEach(e => { e.atk = Math.max(0, e.atk - fx.amount); });
      break;
    case 'stealWeakestEnemy':
      if (enemyBoard.length > 0) {
        const weakest = [...enemyBoard].sort((a,b) => a.atk - b.atk)[0];
        const idx2 = enemyBoard.indexOf(weakest);
        if (idx2 !== -1) {
          enemyBoard.splice(idx2, 1);
          weakest.faction = unit.faction; // Switch sides
          board.push(weakest);
        }
      }
      break;
      
    // ── Enemy debuffs ──
    case 'enemyMissChance':
      enemyBoard.forEach(e => { e._missChance = (e._missChance || 0) + fx.chance; });
      break;
    case 'factionDodge':
      board.filter(a => a.faction === fx.faction).forEach(a => {
        a._dodgeChance = Math.max(a._dodgeChance || 0, fx.chance);
      });
      break;
  }
}

// ─── EXPORTS ────────────────────────────────────────────
export { setupInnateFlags, setAbilityMap };
