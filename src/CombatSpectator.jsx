// ═══════════════════════════════════════════════════════════════════
// COMBAT SPECTATOR — Debug viewer for watching fights step-by-step
// Access via: localhost:5173?spectator
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { U, mkUnit, simCombat, gid } from './engine/combat-esm.js';
import ABILITY_MAP from './data/unit-abilities.json';

// ── FACTION COLORS ──
const FC = {
  SYNTH:     { color: "#00f0ff", bg: "rgba(0,240,255,0.08)", border: "rgba(0,240,255,0.4)" },
  HACKER:    { color: "#ff00ff", bg: "rgba(255,0,255,0.08)", border: "rgba(255,0,255,0.4)" },
  AUGMENTED: { color: "#ff6600", bg: "rgba(255,102,0,0.08)", border: "rgba(255,102,0,0.4)" },
  DRONE:     { color: "#66ff00", bg: "rgba(102,255,0,0.08)", border: "rgba(102,255,0,0.4)" },
  PSIONIC:   { color: "#aa66ff", bg: "rgba(170,102,255,0.08)", border: "rgba(170,102,255,0.4)" },
  VIRUS:     { color: "#cc0044", bg: "rgba(204,0,68,0.08)", border: "rgba(204,0,68,0.4)" },
  PHANTOM:   { color: "#8844cc", bg: "rgba(136,68,204,0.08)", border: "rgba(136,68,204,0.4)" },
  CONSTRUCT: { color: "#bb8844", bg: "rgba(187,136,68,0.08)", border: "rgba(187,136,68,0.4)" },
  NEUTRAL:   { color: "#999999", bg: "rgba(153,153,153,0.08)", border: "rgba(153,153,153,0.4)" },
};
const fc = (faction) => FC[faction] || FC.NEUTRAL;

const FACTIONS = ['SYNTH','HACKER','AUGMENTED','DRONE','PSIONIC','VIRUS','PHANTOM','CONSTRUCT','NEUTRAL'];

// ── ART PATH ──
const artPath = (name, faction) => {
  const c = name.replace(/^Golden /i,"").replace(/[^a-zA-Z0-9 ]/g,"").trim();
  return `/art/units/unit_${faction.toLowerCase()}_${c.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/_+$/,"")}.png`;
};

// ── EVENT TYPE ICONS & COLORS ──
const EVT_META = {
  start:          { icon: "⚔️", color: "#00f0ff", label: "COMBAT START" },
  announce:       { icon: "📢", color: "#ffcc00", label: "ANNOUNCE" },
  combo:          { icon: "🔗", color: "#ffcc00", label: "COMBO" },
  hack:           { icon: "💜", color: "#ff00ff", label: "HACK" },
  initprot:       { icon: "🛡️", color: "#00f0ff", label: "INIT PROT" },
  innate_start:   { icon: "⚡", color: "#ffaa00", label: "INNATE" },
  attack:         { icon: "⚔️", color: "#ff6644", label: "ATTACK" },
  death:          { icon: "💀", color: "#ff2222", label: "DEATH" },
  deadswitch:     { icon: "💣", color: "#aa66ff", label: "DEADSWITCH" },
  ds_hit:         { icon: "💥", color: "#ff4466", label: "DS HIT" },
  ds_buff:        { icon: "✨", color: "#44ff66", label: "DS BUFF" },
  ds_debuff:      { icon: "🔻", color: "#ff4466", label: "DS DEBUFF" },
  dodge:          { icon: "💨", color: "#8844cc", label: "DODGE" },
  hardshell:      { icon: "🛡️", color: "#6688ff", label: "HARDSHELL" },
  cleave:         { icon: "🔪", color: "#ff8800", label: "CLEAVE" },
  splash:         { icon: "💦", color: "#ffcc00", label: "SPLASH" },
  overflow:       { icon: "🌊", color: "#ff4444", label: "OVERFLOW" },
  execute_destroy:{ icon: "☠️", color: "#ff0000", label: "EXECUTE" },
  stun:           { icon: "⭐", color: "#ffff00", label: "STUN" },
  thorns:         { icon: "🌹", color: "#ff6688", label: "THORNS" },
  spawn:          { icon: "🐣", color: "#66ff88", label: "SPAWN" },
  passives:       { icon: "🔄", color: "#66aaff", label: "PASSIVES" },
  heal:           { icon: "💚", color: "#44ff66", label: "HEAL" },
  synth_scale:    { icon: "📈", color: "#00f0ff", label: "SYNTH SCALE" },
  scale:          { icon: "📈", color: "#00f0ff", label: "SCALE" },
  survive:        { icon: "🛡️", color: "#ffcc00", label: "SURVIVE" },
  revive:         { icon: "🔄", color: "#44ff88", label: "REVIVE" },
  infect:         { icon: "🦠", color: "#cc0044", label: "INFECT" },
  infect_tick:    { icon: "🦠", color: "#ff2266", label: "INFECT TICK" },
  aoe_tick:       { icon: "🔥", color: "#ff8800", label: "AOE TICK" },
  steal:          { icon: "🫳", color: "#ff00ff", label: "STEAL" },
  on_kill:        { icon: "💢", color: "#ff4444", label: "ON KILL" },
  shield_regen:   { icon: "🛡️", color: "#6688ff", label: "SHIELD REGEN" },
  slowdown:       { icon: "🐌", color: "#888888", label: "SLOWDOWN" },
  result:         { icon: "🏆", color: "#ffffff", label: "RESULT" },
};

// ── RANDOM BOARD GENERATION ──
function randomBoard(size = 7) {
  // Pick 1-3 factions weighted, fill board
  const numFactions = 1 + Math.floor(Math.random() * 3);
  const picks = [];
  const shuffled = [...FACTIONS].sort(() => Math.random() - 0.5);
  for (let i = 0; i < numFactions; i++) picks.push(shuffled[i]);

  const pool = U.filter(u => picks.includes(u.f));
  if (pool.length < size) pool.push(...U.filter(u => !picks.includes(u.f)).sort(() => Math.random() - 0.5));

  const shuffPool = [...pool].sort(() => Math.random() - 0.5);
  const board = [];
  for (let i = 0; i < size && i < shuffPool.length; i++) {
    const u = mkUnit(shuffPool[i], Math.random() < 0.08); // 8% golden
    // randomize tier somewhat — pick from varied tiers
    board.push(u);
  }
  return board;
}

// ── COVERAGE BOARD GENERATION ──
// Builds boards that guarantee specific units are included
function coverageBoard(mustInclude, size = 7) {
  const board = [];
  // Add required units first
  for (const tmpl of mustInclude.slice(0, size)) {
    board.push(mkUnit(tmpl, Math.random() < 0.08));
  }
  // Fill remaining slots with random units from same factions (for synergy)
  if (board.length < size) {
    const usedFactions = [...new Set(board.map(u => u.faction))];
    const filler = U.filter(u => usedFactions.includes(u.f) && !mustInclude.includes(u))
      .sort(() => Math.random() - 0.5);
    for (let i = 0; board.length < size && i < filler.length; i++) {
      board.push(mkUnit(filler[i], Math.random() < 0.05));
    }
  }
  // If still short, add any random units
  if (board.length < size) {
    const remaining = U.filter(u => !board.some(b => b.tn === u.name)).sort(() => Math.random() - 0.5);
    for (let i = 0; board.length < size && i < remaining.length; i++) {
      board.push(mkUnit(remaining[i], false));
    }
  }
  return board;
}

// ── FORMAT EVENT FOR LOG ──
function formatEvent(evt, idx) {
  const meta = EVT_META[evt.type] || { icon: "❓", color: "#888", label: evt.type.toUpperCase() };
  let desc = "";
  const side = evt.side ? (evt.side === "player" ? "🔵P" : "🔴E") : "  ";

  switch (evt.type) {
    case "start": {
      const pc = evt.pBoard?.length || 0;
      const ec = evt.eBoard?.length || 0;
      desc = `Player ${pc} units vs Enemy ${ec} units`;
      break;
    }
    case "announce": desc = evt.msg || ""; break;
    case "combo": desc = `${evt.name}: ${evt.desc || ""}`; break;
    case "hack": desc = evt.msg || ""; break;
    case "initprot": desc = `${evt.unitName}: ${evt.msg || ""}`; break;
    case "innate_start": desc = `${evt.unitName}: ${evt.msg || ""}`; break;
    case "attack": {
      const shield = evt.shieldAbsorbed > 0 ? ` (${evt.shieldAbsorbed} shielded)` : "";
      const kill = evt.killed ? " → KILLED" : "";
      const counter = evt.counterDmg > 0 ? ` [counter: ${evt.actualCounterDmg}${evt.counterKilled ? " → COUNTER KILL" : ""}]` : "";
      const malware = evt.malware ? " 🦠MALWARE" : "";
      desc = `${evt.attackerName} → ${evt.targetName} for ${evt.damage}${shield}${kill}${counter}${malware}`;
      break;
    }
    case "death": desc = `${evt.unitEmoji || ""} ${evt.unitName || ("Unit " + evt.unitId)} destroyed`; break;
    case "deadswitch": desc = evt.msg || evt.name || ""; break;
    case "ds_hit": desc = `${evt.sourceName} → ${evt.targetName} for ${evt.damage}${evt.killed ? " → KILLED" : ""}`; break;
    case "ds_buff": desc = `${evt.sourceName} → ${evt.targetName}: ${evt.buff}`; break;
    case "ds_debuff": desc = `${evt.sourceName} → ${evt.targetName}: -${evt.amount} ${evt.stat}`; break;
    case "dodge": desc = evt.msg || "Dodged!"; break;
    case "hardshell": desc = evt.msg || "Hardshell blocked!"; break;
    case "cleave": desc = `Cleave → ${evt.targetName || evt.targetId} for ${evt.damage}${evt.killed ? " → KILLED" : ""}`; break;
    case "splash": desc = `Splash → ${evt.targetName || evt.targetId} for ${evt.damage}${evt.killed ? " → KILLED" : ""}`; break;
    case "overflow": desc = `Overflow → ${evt.targetName || evt.targetId} for ${evt.damage}${evt.killed ? " → KILLED" : ""}`; break;
    case "execute_destroy": desc = evt.msg || "Executed!"; break;
    case "stun": desc = evt.msg || "Stunned!"; break;
    case "thorns": desc = `Thorns → ${evt.targetId} for ${evt.damage}`; break;
    case "spawn": desc = `${evt.unitName || "unit"} spawned (from ${evt.source || "?"})`; break;
    case "passives": desc = JSON.stringify(evt).slice(0, 140); break;
    case "heal": desc = `${evt.unitName || "?"} healed for ${evt.amount || "?"}${evt.source ? " ("+evt.source+")" : ""}`; break;
    case "synth_scale": desc = `${evt.unitName || "?"} scaled: ${evt.msg || ""}`; break;
    case "scale": desc = `${evt.unitName || "?"}: ${evt.msg || "scaled"}`; break;
    case "survive": desc = `${evt.unitName || "?"} survived lethal! (${evt.source || "?"})`; break;
    case "revive": desc = `${evt.unitName || "?"} revived! ${evt.hp ? `[${evt.atk}/${evt.hp}]` : ""} (${evt.source || "?"})`; break;
    case "infect": desc = evt.msg || `${evt.attackerName} infected ${evt.targetName}`; break;
    case "infect_tick": desc = `${evt.unitName || "?"} takes ${evt.damage} infection damage`; break;
    case "aoe_tick": desc = `${evt.unitName || "?"} deals ${evt.damage} AOE to ${evt.targets || "?"} enemies`; break;
    case "steal": desc = `${evt.attackerName} steals ${evt.amount} ${evt.stat} from ${evt.targetName}`; break;
    case "on_kill": desc = `${evt.unitName} killed ${evt.victimName}: ${evt.buffs}`; break;
    case "shield_regen": desc = `${evt.unitName} regenerates ${evt.amount} shield (total: ${evt.total})`; break;
    case "slowdown": desc = `${evt.unitName} slowed (DDoS)`; break;
    case "result": {
      desc = evt.playerWon ? `✅ PLAYER WINS — ${evt.dmgToLoser} damage` : evt.draw ? "🤝 DRAW" : `❌ PLAYER LOSES — takes ${evt.dmgToLoser} damage`;
      break;
    }
    default: desc = JSON.stringify(evt).slice(0, 120);
  }

  return { idx, side, icon: meta.icon, color: meta.color, label: meta.label, desc, type: evt.type };
}

// ── UNIT CARD COMPONENT ──
function UnitCard({ unit, highlight, isAttacker, isTarget, isDead }) {
  const f = fc(unit.faction);
  const hpPct = Math.max(0, unit.hp / unit.maxHp);
  const abilities = ABILITY_MAP[unit.name.replace(/^Golden /, "")] || {};
  const innate = unit.innate || abilities.innate || "";

  return (
    <div style={{
      width: 120, minHeight: 170, borderRadius: 8, position: "relative",
      border: `2px solid ${isAttacker ? "#ffcc00" : isTarget ? "#ff4444" : isDead ? "#333" : f.border}`,
      background: isDead ? "rgba(20,10,10,0.9)" : f.bg,
      opacity: isDead ? 0.35 : 1,
      transition: "all 0.3s ease",
      transform: isAttacker ? "scale(1.08) translateY(-4px)" : isTarget ? "scale(1.04)" : "scale(1)",
      boxShadow: isAttacker ? "0 0 20px rgba(255,204,0,0.3)" : isTarget ? "0 0 20px rgba(255,68,68,0.3)" : "none",
      overflow: "hidden", flexShrink: 0,
    }}>
      {/* Faction strip */}
      <div style={{ height: 3, background: f.color, opacity: isDead ? 0.3 : 0.7 }} />

      {/* Tier badge */}
      <div style={{
        position: "absolute", top: 5, right: 5, fontSize: 9, fontWeight: 800,
        color: f.color, opacity: 0.7, fontFamily: "monospace",
      }}>T{unit.tier}</div>

      {/* Golden badge */}
      {unit.golden && <div style={{
        position: "absolute", top: 4, left: 4, fontSize: 9, fontWeight: 900,
        color: "#ffcc00", textShadow: "0 0 8px rgba(255,204,0,0.5)",
      }}>★</div>}

      {/* Art */}
      <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", margin: "2px 4px" }}>
        <img
          src={artPath(unit.tn || unit.name, unit.faction)}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4, filter: isDead ? "grayscale(1) brightness(0.3)" : "none" }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      </div>

      {/* Name */}
      <div style={{
        fontSize: 9, fontWeight: 700, color: isDead ? "#555" : f.color,
        textAlign: "center", padding: "2px 3px", fontFamily: "'Orbitron', monospace",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{unit.name}</div>

      {/* Stats */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "2px 0" }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: "#ff6644", fontFamily: "monospace" }}>⚔{unit.atk}</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: hpPct > 0.5 ? "#44ff66" : hpPct > 0.25 ? "#ffaa00" : "#ff4444", fontFamily: "monospace" }}>♥{Math.max(0, unit.hp)}</span>
      </div>

      {/* HP bar */}
      <div style={{ margin: "0 6px 3px", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
        <div style={{
          width: `${hpPct * 100}%`, height: "100%", borderRadius: 2,
          background: hpPct > 0.5 ? "#44ff66" : hpPct > 0.25 ? "#ffaa00" : "#ff4444",
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* Shield */}
      {unit.shield > 0 && (
        <div style={{ textAlign: "center", fontSize: 10, color: "#6688ff", fontWeight: 700, fontFamily: "monospace" }}>
          🛡{unit.shield}
        </div>
      )}

      {/* Keywords */}
      {unit.kw?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: "2px 4px", justifyContent: "center" }}>
          {unit.kw.map((k, i) => (
            <span key={i} style={{
              fontSize: 7, padding: "1px 3px", borderRadius: 3,
              background: "rgba(255,255,255,0.06)", color: "#aaa", fontFamily: "monospace",
              textTransform: "uppercase", fontWeight: 600,
            }}>{k}</span>
          ))}
        </div>
      )}

      {isDead && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          fontSize: 28, opacity: 0.5,
        }}>💀</div>
      )}
    </div>
  );
}

// ── SIDE ANNOUNCE COMPONENT ──
function SideAnnounce({ text, color, side }) {
  if (!text) return null;
  return (
    <div style={{
      padding: "6px 14px", borderRadius: 6, margin: "4px 0",
      background: "rgba(5,8,16,0.9)",
      border: `1px solid ${color}33`,
      color, fontSize: 11, fontWeight: 700, fontFamily: "'Orbitron', monospace",
      textAlign: side === "player" ? "left" : "right",
      textShadow: `0 0 12px ${color}44`,
      animation: "specFadeIn 0.3s ease-out",
      maxWidth: "100%", wordBreak: "break-word",
    }}>
      {text}
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// MAIN SPECTATOR COMPONENT
// ═══════════════════════════════════════════════════════
export default function CombatSpectator() {
  const [events, setEvents] = useState([]);
  const [eventIdx, setEventIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pBoard, setPBoard] = useState([]);
  const [eBoard, setEBoard] = useState([]);
  const [pAnnounce, setPAnnounce] = useState([]);
  const [eAnnounce, setEAnnounce] = useState([]);
  const [log, setLog] = useState([]);
  const [highlight, setHighlight] = useState({});
  const [result, setResult] = useState(null);
  const [initInfo, setInitInfo] = useState(null);
  const [filterTypes, setFilterTypes] = useState(null); // null = show all
  const [showAudit, setShowAudit] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const logRef = useRef(null);
  const timerRef = useRef(null);

  // ── Copy combat log to clipboard ──
  const copyLog = useCallback(() => {
    const text = log.map(entry => {
      return `${entry.side} ${entry.label.padEnd(14)} ${entry.desc}`;
    }).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      alert("Combat log copied to clipboard! (" + log.length + " lines)");
    }).catch(() => {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Combat log copied!");
    });
  }, [log]);

  // ── Export raw events as JSON ──
  const exportJSON = useCallback(() => {
    const data = {
      timestamp: new Date().toISOString(),
      playerBoard: initInfo?.pBoard?.map(u => ({ name: u.name, faction: u.faction, tier: u.tier, atk: u.atk, hp: u.hp, kw: u.kw, innate: u.innate, golden: u.golden })),
      enemyBoard: initInfo?.eBoard?.map(u => ({ name: u.name, faction: u.faction, tier: u.tier, atk: u.atk, hp: u.hp, kw: u.kw, innate: u.innate, golden: u.golden })),
      eventCount: events.length,
      events: events.map(e => ({ type: e.type, side: e.side, ...(e.attackerName ? { attacker: e.attackerName } : {}), ...(e.targetName ? { target: e.targetName } : {}), ...(e.damage ? { damage: e.damage } : {}), ...(e.killed ? { killed: true } : {}), ...(e.msg ? { msg: e.msg } : {}), ...(e.unitName ? { unit: e.unitName } : {}) })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `combat-log-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  }, [events, initInfo]);

  // ── Innate audit: track which innates triggered ──
  const innateAudit = useMemo(() => {
    if (!initInfo) return null;
    const allUnits = [...(initInfo.pBoard || []), ...(initInfo.eBoard || [])];
    const audit = allUnits.filter(u => u.innate).map(u => {
      const inn = u.innate || "";
      const lo = inn.toLowerCase();
      const triggers = [];

      // Check events for this unit's innate firing
      events.forEach((evt, i) => {
        if (evt.type === "innate_start" && evt.unitId === u.id) triggers.push({ idx: i, type: "innate_start", msg: evt.msg });
        if (evt.type === "deadswitch" && evt.unitId === u.id) triggers.push({ idx: i, type: "deadswitch", msg: evt.msg });
        if (evt.type === "spawn" && evt.source?.includes(u.name)) triggers.push({ idx: i, type: "spawn", msg: evt.unitName });
        if (evt.type === "ds_hit" && evt.sourceId === u.id) triggers.push({ idx: i, type: "ds_hit", msg: `→ ${evt.targetName} for ${evt.damage}` });
        if (evt.type === "ds_buff" && evt.sourceId === u.id) triggers.push({ idx: i, type: "ds_buff", msg: `→ ${evt.targetName}: ${evt.buff}` });
        if (evt.type === "revive" && evt.unitId === u.id) triggers.push({ idx: i, type: "revive", msg: `Revived! (${evt.source})` });
        if (evt.type === "survive" && evt.unitId === u.id) triggers.push({ idx: i, type: "survive", msg: `Survived! (${evt.source})` });
        if (evt.type === "infect" && evt.attackerId === u.id) triggers.push({ idx: i, type: "infect", msg: `→ ${evt.targetName}` });
        if (evt.type === "infect_tick" && evt.unitId === u.id) triggers.push({ idx: i, type: "infect_tick", msg: `-${evt.damage}` });
        if (evt.type === "aoe_tick" && evt.unitId === u.id) triggers.push({ idx: i, type: "aoe_tick", msg: `${evt.damage} to ${evt.targets}` });
        if (evt.type === "steal" && evt.attackerId === u.id) triggers.push({ idx: i, type: "steal", msg: `${evt.amount} ${evt.stat} from ${evt.targetName}` });
        if (evt.type === "on_kill" && evt.unitId === u.id) triggers.push({ idx: i, type: "on_kill", msg: `${evt.buffs}` });
        if (evt.type === "heal" && evt.unitId === u.id) triggers.push({ idx: i, type: "heal", msg: `+${evt.amount} (${evt.source})` });
        if (evt.type === "scale" && evt.unitId === u.id) triggers.push({ idx: i, type: "scale", msg: evt.msg });
        if (evt.type === "shield_regen" && evt.unitId === u.id) triggers.push({ idx: i, type: "shield_regen", msg: `+${evt.amount}` });
      });

      // Determine expected behavior
      let expectType = "passive"; // default
      if (lo.startsWith("on death:")) expectType = "deadswitch";
      else if (lo.includes("on combat start")) expectType = "innate_start";
      else if (lo.startsWith("on hit:")) expectType = "on_hit";
      else if (lo.startsWith("on kill:")) expectType = "on_kill";
      else if (lo.startsWith("on buy:")) expectType = "on_buy";
      else if (lo.includes("survives lethal") || lo.includes("instead of dying")) expectType = "survive";
      else if (lo.includes("infect") || lo.includes("infection")) expectType = "infect";
      else if (lo.includes("regenerate") || lo.includes("regen")) expectType = "regen";
      else if (lo.includes("per turn") || lo.includes("each turn") || lo.includes("every turn")) expectType = "per_turn";
      else if (lo.includes("heal")) expectType = "heal";

      // Check if it died (for deadswitch validation)
      const died = events.some(e => e.type === "death" && (e.unitId === u.id || e.unitName === u.name) && e.side === (initInfo.pBoard.includes(u) ? "player" : "enemy"));

      let status = "✅";
      if (expectType === "deadswitch" && died && triggers.length === 0) status = "❌ DEAD BUT NO TRIGGER";
      else if (expectType === "deadswitch" && !died) status = "⏳ SURVIVED (not tested)";
      else if (expectType === "innate_start" && triggers.filter(t => t.type === "innate_start").length === 0) status = "❌ NO innate_start EVENT";
      else if (expectType === "on_buy") status = "⏭️ SHOP ONLY";
      else if (expectType === "on_hit") status = triggers.length > 0 ? `✅ ${triggers.length}x` : "🔧 ON-HIT (flag-based)";
      else if (expectType === "on_kill") status = triggers.length > 0 ? `✅ ${triggers.length}x` : "⏳ NO KILLS";
      else if (expectType === "survive") status = triggers.some(t => t.type === "survive" || t.type === "revive") ? `✅ TRIGGERED` : "⏳ NOT TESTED";
      else if (expectType === "infect") status = triggers.some(t => t.type === "infect") ? `✅ ${triggers.length}x` : "🔧 FLAG-BASED";
      else if (expectType === "per_turn") status = triggers.length > 0 ? `✅ ${triggers.length}x` : "🔧 PER-TURN (flag)";
      else if (expectType === "heal") status = triggers.length > 0 ? `✅ ${triggers.length}x` : "🔧 HEAL (flag)";
      else if (expectType === "regen") status = triggers.length > 0 ? `✅ ${triggers.length}x` : "🔧 REGEN (flag)";
      else if (triggers.length > 0) status = `✅ ${triggers.length}x`;
      else if (expectType === "passive") status = "🔧 PASSIVE (flag-based)";

      return { name: u.name, faction: u.faction, innate: inn, expectType, triggers, status, died };
    });
    return audit;
  }, [events, initInfo]);

  // ── Batch run: run N fights, track innate coverage ──
  const runBatch = useCallback((count, mode = "random") => {
    setBatchRunning(true);
    setBatchResults(null);
    setTimeout(() => {
      const unitsSeen = {};
      const errors = [];
      let totalFights = 0;

      if (mode === "coverage") {
        // Phase 1: Cycle through ALL units, placing each on player side
        // Each unit appears at least once as player and once as enemy
        const allTemplates = [...U].filter(u => u.innate);
        const chunks = [];
        const shuffled = [...allTemplates].sort(() => Math.random() - 0.5);

        // Build boards of 7, cycling through all units
        for (let i = 0; i < shuffled.length; i += 7) {
          const chunk = shuffled.slice(i, i + 7);
          if (chunk.length < 7) {
            // Pad with random units
            const pad = allTemplates.filter(t => !chunk.includes(t)).sort(() => Math.random() - 0.5);
            while (chunk.length < 7 && pad.length > 0) chunk.push(pad.shift());
          }
          chunks.push(chunk);
        }

        // Run each chunk as player vs random enemy, then swap
        for (const chunk of chunks) {
          // Fight 1: chunk as player
          const p1 = coverageBoard(chunk, 7);
          const e1 = randomBoard(7);
          runSingleFight(p1, e1, unitsSeen, errors, totalFights);
          totalFights++;

          // Fight 2: chunk as enemy
          const p2 = randomBoard(7);
          const e2 = coverageBoard(chunk, 7);
          runSingleFight(p2, e2, unitsSeen, errors, totalFights);
          totalFights++;
        }

        // Phase 2: Extra random fights to increase death coverage
        const extraRounds = Math.max(0, count - totalFights);
        // Prioritize under-tested units
        for (let run = 0; run < extraRounds; run++) {
          // Find units with lowest death coverage
          const underTested = allTemplates
            .filter(t => {
              const key = t.name;
              const lo = (t.innate || "").toLowerCase();
              if (!lo.startsWith("on death:")) return false;
              const data = unitsSeen[key];
              return !data || data.triggered === 0;
            })
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);

          const p = underTested.length > 0
            ? coverageBoard(underTested, 7)
            : randomBoard(7);
          const e = randomBoard(7);
          runSingleFight(p, e, unitsSeen, errors, totalFights);
          totalFights++;
        }
      } else {
        // Pure random mode
        for (let run = 0; run < count; run++) {
          const p = randomBoard(7);
          const e = randomBoard(7);
          runSingleFight(p, e, unitsSeen, errors, run);
          totalFights++;
        }
      }

      // Calculate coverage stats
      const allWithInnate = U.filter(u => u.innate);
      const covered = allWithInnate.filter(u => unitsSeen[u.name]?.seen > 0).length;
      const deathUnits = allWithInnate.filter(u => u.innate.toLowerCase().startsWith("on death:"));
      const deathTested = deathUnits.filter(u => {
        const d = unitsSeen[u.name];
        return d && (d.triggered > 0 || d.deathNoDS > 0);
      }).length;
      const startUnits = allWithInnate.filter(u => u.innate.toLowerCase().includes("on combat start"));
      const startTested = startUnits.filter(u => unitsSeen[u.name]?.triggered > 0).length;

      setBatchResults({
        count: totalFights, mode, unitsSeen, errors,
        coverage: { total: allWithInnate.length, covered, deathUnits: deathUnits.length, deathTested, startUnits: startUnits.length, startTested },
      });
      setBatchRunning(false);
    }, 50);
  }, []);

  // ── Helper: run a single fight and track results ──
  function runSingleFight(p, e, unitsSeen, errors, runIdx) {
    const allUnits = [...p, ...e];

    allUnits.forEach(u => {
      if (!u.innate) return;
      const key = u.name.replace(/^Golden /, "");
      if (!unitsSeen[key]) unitsSeen[key] = { innate: u.innate, seen: 0, triggered: 0, broken: 0, deathNoDS: 0 };
      unitsSeen[key].seen++;
    });

    try {
      const r = simCombat(
        p.map(u => ({ ...u, kw: [...(u.kw || [])], kwData: { ...(u.kwData || {}) } })),
        e.map(u => ({ ...u, kw: [...(u.kw || [])], kwData: { ...(u.kwData || {}) } }))
      );

      const deaths = r.events.filter(ev => ev.type === "death");
      const dsEvents = r.events.filter(ev => ev.type === "deadswitch");
      const innateEvents = r.events.filter(ev => ev.type === "innate_start");

      allUnits.forEach(u => {
        if (!u.innate) return;
        const key = u.name.replace(/^Golden /, "");
        const lo = u.innate.toLowerCase();

        if (lo.startsWith("on death:")) {
          const died = deaths.some(d => d.unitId === u.id);
          if (died) {
            const triggered = dsEvents.some(d => d.unitId === u.id);
            if (triggered) unitsSeen[key].triggered++;
            else { unitsSeen[key].deathNoDS++; unitsSeen[key].broken++; }
          }
        } else if (lo.includes("on combat start")) {
          const fired = innateEvents.some(d => d.unitId === u.id);
          if (fired) unitsSeen[key].triggered++;
        } else {
          // Count any event referencing this unit as a trigger
          const anyTrigger = r.events.some(e =>
            (e.unitId === u.id || e.attackerId === u.id || e.sourceId === u.id) &&
            ['heal','scale','infect','infect_tick','aoe_tick','steal','on_kill','survive','revive','shield_regen','spawn'].includes(e.type)
          );
          if (anyTrigger) unitsSeen[key].triggered++;
        }
      });
    } catch(err) {
      errors.push(`Run ${runIdx}: ${err.message}`);
    }
  }

  // ── Generate new fight ──
  const newFight = useCallback(() => {
    setPlaying(false);
    setResult(null);
    setEventIdx(-1);
    setPBoard([]); setEBoard([]);
    setPAnnounce([]); setEAnnounce([]);
    setLog([]); setHighlight({});

    const p = randomBoard(7);
    const e = randomBoard(7);

    // Log pre-combat info
    const preLog = [];
    preLog.push({ idx: 0, side: "  ", icon: "📋", color: "#00f0ff", label: "SETUP", desc: "──── PRE-COMBAT BOARD ANALYSIS ────", type: "setup" });

    const logSide = (board, label, sideTag) => {
      const factionCounts = {};
      board.forEach(u => { factionCounts[u.faction] = (factionCounts[u.faction] || 0) + 1; });
      preLog.push({ idx: preLog.length, side: sideTag, icon: "👥", color: sideTag === "🔵P" ? "#00aaff" : "#ff4444",
        label: "BOARD", desc: `${label}: ${board.map(u => `${u.name}[${u.faction.slice(0,3)} T${u.tier} ${u.atk}/${u.hp}]`).join(", ")}`, type: "setup" });
      preLog.push({ idx: preLog.length, side: sideTag, icon: "🏷️", color: "#aaa",
        label: "FACTIONS", desc: `${label} factions: ${Object.entries(factionCounts).map(([f,c]) => `${f}×${c}`).join(", ")}`, type: "setup" });

      board.forEach(u => {
        const entry = ABILITY_MAP[u.name.replace(/^Golden /, "")] || {};
        const flags = entry.flags || {};
        const kws = entry.autoKeywords?.map(k => k.kw).join(",") || "-";
        const be = entry.boardEffects?.map(b => b.type).join(",") || "-";
        const flagStr = Object.keys(flags).join(",") || "-";
        const innate = u.innate || "";
        preLog.push({ idx: preLog.length, side: sideTag, icon: "🔧", color: fc(u.faction).color,
          label: "UNIT", desc: `${u.name} [${u.faction} T${u.tier}] ATK:${u.atk} HP:${u.hp}${u.golden ? " ★GOLDEN" : ""} | kw:[${(u.kw||[]).join(",")}] auto:[${kws}] board:[${be}] flags:[${flagStr}] | "${innate}"`, type: "setup" });
      });
    };
    logSide(p, "PLAYER", "🔵P");
    logSide(e, "ENEMY", "🔴E");
    preLog.push({ idx: preLog.length, side: "  ", icon: "📋", color: "#00f0ff", label: "SETUP", desc: "──── COMBAT BEGINS ────", type: "setup" });

    // Run combat
    const r = simCombat(
      p.map(u => ({ ...u, kw: [...(u.kw || [])], kwData: { ...(u.kwData || {}) } })),
      e.map(u => ({ ...u, kw: [...(u.kw || [])], kwData: { ...(u.kwData || {}) } }))
    );

    const formatted = r.events.map((evt, i) => formatEvent(evt, preLog.length + i));

    setEvents(r.events);
    setLog([...preLog, ...formatted]);
    setInitInfo({ pBoard: p, eBoard: e, eventCount: r.events.length });
    setEventIdx(-1);
  }, []);

  // ── Process single event ──
  const processEvent = useCallback((idx) => {
    if (idx < 0 || idx >= events.length) return;
    const evt = events[idx];

    // Update boards from event snapshots
    if (evt.pBoard) setPBoard(evt.pBoard.map(u => ({ ...u })));
    if (evt.eBoard) setEBoard(evt.eBoard.map(u => ({ ...u })));

    // Side-specific announcements
    const side = evt.side;
    const addAnnounce = (text, color, targetSide) => {
      const setter = targetSide === "player" ? setPAnnounce : setEAnnounce;
      setter(prev => [...prev.slice(-4), { text, color, id: Date.now() + Math.random() }]);
    };

    // Clear highlights
    const hl = {};

    switch (evt.type) {
      case "start":
        if (evt.pBoard) setPBoard(evt.pBoard);
        if (evt.eBoard) setEBoard(evt.eBoard);
        break;

      case "announce":
        // Faction announcements go to the side that benefits
        if (side === "player" || !side) addAnnounce(evt.msg, "#00f0ff", "player");
        if (side === "enemy" || !side) addAnnounce(evt.msg, "#ff4444", "enemy");
        break;

      case "combo":
        addAnnounce(`🔗 ${evt.name}: ${evt.desc}`, "#ffcc00", side || "player");
        break;

      case "hack":
        addAnnounce(evt.msg, "#ff00ff", side || "player");
        break;

      case "initprot":
        addAnnounce(`🛡️ ${evt.msg}`, "#00f0ff", side || "player");
        if (evt.unitId) hl[evt.unitId] = "buff";
        break;

      case "innate_start":
        addAnnounce(`⚡ ${evt.msg}`, "#ffaa00", side || "player");
        if (evt.unitId) hl[evt.unitId] = "buff";
        break;

      case "attack":
        hl[evt.attackerId] = "attacker";
        hl[evt.targetId] = "target";
        if (evt.killed) {
          addAnnounce(`⚔️ ${evt.attackerName} killed ${evt.targetName}! (-${evt.damage})`, "#ff4444", side || "player");
        }
        break;

      case "death":
        if (evt.unitId) hl[evt.unitId] = "dead";
        addAnnounce(`💀 Unit destroyed`, "#ff2222", side || "player");
        break;

      case "deadswitch":
        addAnnounce(`💣 ${evt.msg}`, "#aa66ff", side || "player");
        break;

      case "ds_hit":
        addAnnounce(`💥 ${evt.sourceName} → ${evt.targetName} for ${evt.damage}`, "#ff4466", side || "enemy");
        break;

      case "ds_buff":
        addAnnounce(`✨ ${evt.sourceName} buffs ${evt.targetName}: ${evt.buff}`, "#44ff66", side || "player");
        break;

      case "ds_debuff":
        addAnnounce(`🔻 ${evt.sourceName} debuffs ${evt.targetName}: -${evt.amount} ${evt.stat}`, "#ff4466", side || "player");
        break;

      case "dodge":
        addAnnounce(`💨 ${evt.msg}`, "#8844cc", side || "enemy");
        if (evt.targetId) hl[evt.targetId] = "dodge";
        break;

      case "hardshell":
        addAnnounce(`🛡️ ${evt.msg}`, "#6688ff", side || "enemy");
        if (evt.targetId) hl[evt.targetId] = "shield";
        break;

      case "cleave":
        addAnnounce(`🔪 Cleave → ${evt.targetName || "?"} for ${evt.damage}${evt.killed ? " 💀" : ""}`, "#ff8800", side || "player");
        if (evt.targetId) hl[evt.targetId] = "target";
        break;

      case "splash":
        addAnnounce(`💦 Splash → ${evt.targetName || "?"} for ${evt.damage}${evt.killed ? " 💀" : ""}`, "#ffcc00", side || "player");
        if (evt.targetId) hl[evt.targetId] = "target";
        break;

      case "overflow":
        addAnnounce(`🌊 Overflow → ${evt.targetName || "?"} for ${evt.damage}${evt.killed ? " 💀" : ""}`, "#ff4444", side || "player");
        if (evt.targetId) hl[evt.targetId] = "target";
        break;

      case "execute_destroy":
        addAnnounce(`☠️ ${evt.msg}`, "#ff0000", side || "player");
        break;

      case "stun":
        addAnnounce(`⭐ ${evt.msg}`, "#ffff00", side || "player");
        break;

      case "result":
        setResult(evt);
        break;

      // ── New event types from innate ability system ──
      case "spawn":
        addAnnounce(`🐣 ${evt.unitName || "unit"} spawned (${evt.source || "?"})`, "#66ff88", side || "player");
        if (evt.unitId) hl[evt.unitId] = "buff";
        break;

      case "heal":
        addAnnounce(`💚 ${evt.unitName} healed ${evt.amount} HP (${evt.source || "?"})`, "#44ff66", side || "player");
        if (evt.unitId) hl[evt.unitId] = "buff";
        break;

      case "thorns":
        addAnnounce(`🌹 Thorns → attacker for ${evt.damage}`, "#ff6688", side || "enemy");
        if (evt.targetId) hl[evt.targetId] = "target";
        break;

      case "scale":
      case "synth_scale":
        addAnnounce(`📈 ${evt.unitName}: ${evt.msg || "scaled"}`, "#00f0ff", side || "player");
        if (evt.unitId) hl[evt.unitId] = "buff";
        break;

      case "survive":
        addAnnounce(`🛡️ ${evt.unitName} SURVIVED! (${evt.source || "?"})`, "#ffcc00", side || "player");
        if (evt.unitId) hl[evt.unitId] = "buff";
        break;

      case "revive":
        addAnnounce(`🔄 ${evt.unitName} REVIVED! ${evt.hp ? `[${evt.atk}/${evt.hp}]` : ""} (${evt.source})`, "#44ff88", side || "player");
        if (evt.unitId) hl[evt.unitId] = "buff";
        break;

      case "infect":
        addAnnounce(`🦠 ${evt.msg || "Infected!"}`, "#cc0044", side || "player");
        if (evt.targetId) hl[evt.targetId] = "target";
        break;

      case "infect_tick":
        addAnnounce(`🦠 ${evt.unitName} -${evt.damage} (infection)`, "#ff2266", side || "player");
        if (evt.unitId) hl[evt.unitId] = "target";
        break;

      case "aoe_tick":
        addAnnounce(`🔥 ${evt.unitName} AOE: ${evt.damage} to ${evt.targets} enemies`, "#ff8800", side || "player");
        if (evt.unitId) hl[evt.unitId] = "attacker";
        break;

      case "steal":
        addAnnounce(`🫳 ${evt.attackerName} stole ${evt.amount} ${evt.stat} from ${evt.targetName}`, "#ff00ff", side || "player");
        if (evt.attackerId) hl[evt.attackerId] = "attacker";
        if (evt.targetId) hl[evt.targetId] = "target";
        break;

      case "on_kill":
        addAnnounce(`💢 ${evt.unitName}: ${evt.buffs}`, "#ff4444", side || "player");
        if (evt.unitId) hl[evt.unitId] = "attacker";
        break;

      case "shield_regen":
        addAnnounce(`🛡️ ${evt.unitName} +${evt.amount} shield`, "#6688ff", side || "player");
        if (evt.unitId) hl[evt.unitId] = "buff";
        break;

      case "slowdown":
        addAnnounce(`🐌 ${evt.unitName} slowed (DDoS)`, "#888888", side || "player");
        if (evt.unitId) hl[evt.unitId] = "target";
        break;

      case "passives":
        // Silent - just update board state from snapshot
        break;
    }

    setHighlight(hl);
    setEventIdx(idx);
  }, [events]);

  // ── Step forward ──
  const stepForward = useCallback(() => {
    setEventIdx(prev => {
      const next = prev + 1;
      if (next < events.length) {
        processEvent(next);
        return next;
      }
      setPlaying(false);
      return prev;
    });
  }, [events, processEvent]);

  // ── Step backward ──
  const stepBack = useCallback(() => {
    setEventIdx(prev => {
      if (prev <= 0) return prev;
      // Replay from start up to prev-1
      const target = prev - 1;
      setPBoard([]); setEBoard([]);
      setPAnnounce([]); setEAnnounce([]);
      setHighlight({});
      for (let i = 0; i <= target; i++) {
        const evt = events[i];
        if (evt.pBoard) setPBoard(evt.pBoard.map(u => ({ ...u })));
        if (evt.eBoard) setEBoard(evt.eBoard.map(u => ({ ...u })));
      }
      processEvent(target);
      return target;
    });
  }, [events, processEvent]);

  // ── Auto-play timer ──
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!playing || eventIdx >= events.length - 1) return;

    const evt = events[eventIdx + 1];
    let baseDelay = 800; // default
    if (evt) {
      switch (evt.type) {
        case "start": baseDelay = 1500; break;
        case "announce": baseDelay = 1400; break;
        case "combo": baseDelay = 1400; break;
        case "hack": baseDelay = 1000; break;
        case "initprot": case "innate_start": baseDelay = 1000; break;
        case "attack": baseDelay = evt.killed ? 1200 : 900; break;
        case "death": baseDelay = 800; break;
        case "deadswitch": baseDelay = 1400; break;
        case "ds_hit": case "ds_buff": case "ds_debuff": baseDelay = 700; break;
        case "dodge": case "hardshell": baseDelay = 700; break;
        case "cleave": case "splash": case "overflow": baseDelay = 600; break;
        case "result": baseDelay = 2000; break;
        default: baseDelay = 600;
      }
    }

    const delay = baseDelay / speed;
    timerRef.current = setTimeout(() => {
      stepForward();
    }, delay);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, eventIdx, events, speed, stepForward]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current && eventIdx >= 0) {
      const setupCount = log.length - events.length;
      const targetRow = setupCount + eventIdx;
      const rows = logRef.current.querySelectorAll('.spec-log-row');
      if (rows[targetRow]) {
        rows[targetRow].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [eventIdx, log, events.length]);

  // ── Init on mount ──
  useEffect(() => { newFight(); }, [newFight]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); }
      if (e.key === "ArrowRight") { e.preventDefault(); stepForward(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); stepBack(); }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); newFight(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stepForward, stepBack, newFight]);

  // ── Find dead units from current boards ──
  const pAlive = new Set(pBoard.map(u => u.id));
  const eAlive = new Set(eBoard.map(u => u.id));

  // Track all units that ever appeared
  const allPUnits = useMemo(() => {
    const map = new Map();
    events.forEach(e => {
      (e.pBoard || []).forEach(u => { if (!map.has(u.id)) map.set(u.id, u); else map.set(u.id, u); });
    });
    return map;
  }, [events]);

  const allEUnits = useMemo(() => {
    const map = new Map();
    events.forEach(e => {
      (e.eBoard || []).forEach(u => { if (!map.has(u.id)) map.set(u.id, u); else map.set(u.id, u); });
    });
    return map;
  }, [events]);

  // Get current snapshot: alive units from current boards + dead units from history
  const pDisplay = useMemo(() => {
    const alive = pBoard.map(u => ({ ...u, _dead: false }));
    const aliveIds = new Set(alive.map(u => u.id));
    // Add dead units from history that aren't in current board
    for (const [id, u] of allPUnits) {
      if (!aliveIds.has(id) && eventIdx >= 0) {
        alive.push({ ...u, hp: 0, _dead: true });
      }
    }
    return alive;
  }, [pBoard, allPUnits, eventIdx]);

  const eDisplay = useMemo(() => {
    const alive = eBoard.map(u => ({ ...u, _dead: false }));
    const aliveIds = new Set(alive.map(u => u.id));
    for (const [id, u] of allEUnits) {
      if (!aliveIds.has(id) && eventIdx >= 0) {
        alive.push({ ...u, hp: 0, _dead: true });
      }
    }
    return alive;
  }, [eBoard, allEUnits, eventIdx]);

  const setupCount = log.length - events.length;

  return (
    <div style={{
      width: "100vw", height: "100vh", background: "#060a14",
      color: "#ccc", fontFamily: "'Courier New', monospace",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>

      {/* ── TOP BAR: Controls ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
        background: "rgba(0,0,0,0.5)", borderBottom: "1px solid rgba(0,240,255,0.1)",
        flexShrink: 0, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#00f0ff", letterSpacing: 3, marginRight: 12, fontFamily: "'Orbitron', monospace" }}>
          COMBAT SPECTATOR
        </div>

        <button onClick={newFight} style={btnStyle("#ff6600")}>🎲 NEW FIGHT [N]</button>
        <button onClick={copyLog} style={btnStyle("#44ff66")}>📋 COPY LOG</button>
        <button onClick={exportJSON} style={btnStyle("#00f0ff")}>💾 EXPORT JSON</button>

        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />

        <button onClick={() => runBatch(50, "random")} disabled={batchRunning} style={btnStyle("#ffcc00")}>
          {batchRunning ? "⏳ RUNNING..." : "🎲 BATCH 50"}
        </button>
        <button onClick={() => runBatch(200, "random")} disabled={batchRunning} style={btnStyle("#ffcc00")}>
          {batchRunning ? "..." : "🎲 BATCH 200"}
        </button>
        <button onClick={() => runBatch(100, "coverage")} disabled={batchRunning} style={btnStyle("#44ff66")}>
          {batchRunning ? "..." : "🧬 COVERAGE"}
        </button>
        <button onClick={() => setShowAudit(!showAudit)} style={btnStyle(showAudit ? "#ff00ff" : "#aa66ff")}>
          {showAudit ? "✕ HIDE AUDIT" : "🔍 INNATE AUDIT"}
        </button>

        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />

        <button onClick={stepBack} disabled={eventIdx <= 0} style={btnStyle("#888")}>◀ BACK [←]</button>
        <button onClick={() => setPlaying(!playing)} style={btnStyle(playing ? "#ff4444" : "#44ff66")}>
          {playing ? "⏸ PAUSE" : "▶ PLAY"} [SPACE]
        </button>
        <button onClick={stepForward} disabled={eventIdx >= events.length - 1} style={btnStyle("#888")}>FWD ▶ [→]</button>

        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#888" }}>SPEED:</span>
          {[0.25, 0.5, 1, 2, 4].map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={{
              ...btnStyle(speed === s ? "#00f0ff" : "#444"),
              padding: "3px 8px", fontSize: 10,
              background: speed === s ? "rgba(0,240,255,0.15)" : "rgba(255,255,255,0.03)",
            }}>{s}x</button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", fontSize: 11, color: "#666" }}>
          Event {eventIdx + 1} / {events.length}
          {result && <span style={{ color: result.playerWon ? "#44ff66" : result.draw ? "#aaa" : "#ff4444", marginLeft: 8, fontWeight: 700 }}>
            {result.playerWon ? "PLAYER WIN" : result.draw ? "DRAW" : "PLAYER LOSS"}
          </span>}
        </div>
      </div>
      {/* ── EVENT FILTER BAR ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4, padding: "4px 16px",
        background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(0,240,255,0.06)",
        flexShrink: 0, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 9, color: "#666", marginRight: 6 }}>FILTER:</span>
        <button onClick={() => setFilterTypes(null)} style={{
          ...btnStyle(filterTypes === null ? "#00f0ff" : "#444"), padding: "2px 6px", fontSize: 8,
          background: filterTypes === null ? "rgba(0,240,255,0.15)" : "transparent",
        }}>ALL</button>
        {Object.entries(EVT_META).map(([type, meta]) => (
          <button key={type} onClick={() => setFilterTypes(prev => {
            if (!prev) return new Set([type]);
            const next = new Set(prev);
            if (next.has(type)) next.delete(type); else next.add(type);
            return next.size === 0 ? null : next;
          })} style={{
            ...btnStyle(filterTypes?.has(type) ? meta.color : "#333"), padding: "2px 6px", fontSize: 8,
            background: filterTypes?.has(type) ? `${meta.color}22` : "transparent",
          }}>{meta.icon} {type}</button>
        ))}
      </div>

      {/* ── BATCH RESULTS PANEL ── */}
      {batchResults && (
        <div style={{
          maxHeight: 300, overflow: "auto", padding: "8px 16px",
          background: "rgba(20,10,0,0.9)", borderBottom: "1px solid rgba(255,204,0,0.2)",
          flexShrink: 0, fontSize: 10, fontFamily: "monospace",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "#ffcc00", fontWeight: 700, fontSize: 12 }}>
              🧪 BATCH RESULTS — {batchResults.count} fights ({batchResults.mode || "random"})
            </span>
            <button onClick={() => setBatchResults(null)} style={btnStyle("#ff4444")}>✕ CLOSE</button>
          </div>
          {batchResults.coverage && (
            <div style={{ display: "flex", gap: 16, marginBottom: 8, padding: "4px 8px", background: "rgba(0,240,255,0.05)", borderRadius: 4 }}>
              <span style={{ color: "#00f0ff", fontSize: 11 }}>
                📊 Units seen: <b>{batchResults.coverage.covered}/{batchResults.coverage.total}</b>
              </span>
              <span style={{ color: batchResults.coverage.deathTested === batchResults.coverage.deathUnits ? "#44ff66" : "#ffaa00", fontSize: 11 }}>
                💀 Deaths tested: <b>{batchResults.coverage.deathTested}/{batchResults.coverage.deathUnits}</b>
              </span>
              <span style={{ color: batchResults.coverage.startTested === batchResults.coverage.startUnits ? "#44ff66" : "#ffaa00", fontSize: 11 }}>
                ⚡ Starts tested: <b>{batchResults.coverage.startTested}/{batchResults.coverage.startUnits}</b>
              </span>
              {batchResults.coverage.covered < batchResults.coverage.total && (
                <span style={{ color: "#ff4444", fontSize: 11 }}>
                  ❌ Missing: {batchResults.coverage.total - batchResults.coverage.covered} units never appeared
                </span>
              )}
            </div>
          )}
          {batchResults.errors.length > 0 && (
            <div style={{ color: "#ff4444", marginBottom: 6 }}>ERRORS: {batchResults.errors.join(", ")}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "200px 60px 60px 60px 60px 1fr", gap: "2px 8px", lineHeight: 1.6 }}>
            <span style={{ color: "#888", fontWeight: 700 }}>UNIT</span>
            <span style={{ color: "#888", fontWeight: 700 }}>SEEN</span>
            <span style={{ color: "#888", fontWeight: 700 }}>FIRED</span>
            <span style={{ color: "#888", fontWeight: 700 }}>BROKE</span>
            <span style={{ color: "#888", fontWeight: 700 }}>NO-DS</span>
            <span style={{ color: "#888", fontWeight: 700 }}>INNATE</span>
            {Object.entries(batchResults.unitsSeen)
              .sort((a, b) => b[1].broken - a[1].broken || b[1].deathNoDS - a[1].deathNoDS || a[0].localeCompare(b[0]))
              .map(([name, data]) => (
                <React.Fragment key={name}>
                  <span style={{ color: data.broken > 0 ? "#ff4444" : data.triggered > 0 ? "#44ff66" : "#aaa" }}>{name}</span>
                  <span style={{ color: "#888" }}>{data.seen}</span>
                  <span style={{ color: data.triggered > 0 ? "#44ff66" : "#666" }}>{data.triggered}</span>
                  <span style={{ color: data.broken > 0 ? "#ff4444" : "#333" }}>{data.broken}</span>
                  <span style={{ color: data.deathNoDS > 0 ? "#ff6600" : "#333" }}>{data.deathNoDS}</span>
                  <span style={{ color: "#666" }}>{data.innate?.slice(0, 50)}</span>
                </React.Fragment>
              ))}
          </div>
        </div>
      )}

      {/* ── INNATE AUDIT PANEL ── */}
      {showAudit && innateAudit && (
        <div style={{
          maxHeight: 250, overflow: "auto", padding: "8px 16px",
          background: "rgba(10,0,20,0.9)", borderBottom: "1px solid rgba(170,102,255,0.2)",
          flexShrink: 0, fontSize: 10, fontFamily: "monospace",
        }}>
          <div style={{ color: "#aa66ff", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
            🔍 INNATE AUDIT — This Fight
          </div>
          {innateAudit.map((a, i) => (
            <div key={i} style={{
              display: "flex", gap: 8, padding: "2px 0",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              color: a.status.startsWith("❌") ? "#ff4444" : a.status.startsWith("✅") ? "#44ff66" : "#888",
            }}>
              <span style={{ minWidth: 160 }}>{a.name}</span>
              <span style={{ minWidth: 50, color: fc(a.faction).color, fontSize: 8 }}>{a.faction.slice(0,5)}</span>
              <span style={{ minWidth: 80, fontSize: 8, color: "#888" }}>{a.expectType}</span>
              <span style={{ minWidth: 140 }}>{a.status}</span>
              <span style={{ color: "#555", flex: 1 }}>{a.innate?.slice(0, 60)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── BATTLEFIELD (left 65%) ── */}
        <div style={{ flex: "0 0 65%", display: "flex", flexDirection: "column", borderRight: "1px solid rgba(0,240,255,0.06)" }}>

          {/* PLAYER SIDE */}
          <div style={{ flex: 1, padding: "8px 12px", borderBottom: "1px solid rgba(0,240,255,0.06)", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#00aaff", letterSpacing: 2, marginBottom: 4, fontFamily: "'Orbitron', monospace" }}>
              🔵 PLAYER SIDE ({pBoard.length} alive)
            </div>

            {/* Player announcements */}
            <div style={{ minHeight: 28, maxHeight: 80, overflow: "auto", marginBottom: 4 }}>
              {pAnnounce.slice(-3).map(a => (
                <SideAnnounce key={a.id} text={a.text} color={a.color} side="player" />
              ))}
            </div>

            {/* Player units */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", overflow: "auto", flex: 1, alignContent: "flex-start" }}>
              {pDisplay.map(u => (
                <UnitCard
                  key={u.id} unit={u}
                  highlight={highlight[u.id]}
                  isAttacker={highlight[u.id] === "attacker"}
                  isTarget={highlight[u.id] === "target"}
                  isDead={u._dead}
                />
              ))}
            </div>
          </div>

          {/* DIVIDER */}
          <div style={{ height: 2, background: "linear-gradient(90deg, transparent, rgba(255,0,255,0.3), transparent)", flexShrink: 0 }} />

          {/* ENEMY SIDE */}
          <div style={{ flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#ff4444", letterSpacing: 2, marginBottom: 4, fontFamily: "'Orbitron', monospace" }}>
              🔴 ENEMY SIDE ({eBoard.length} alive)
            </div>

            {/* Enemy announcements */}
            <div style={{ minHeight: 28, maxHeight: 80, overflow: "auto", marginBottom: 4 }}>
              {eAnnounce.slice(-3).map(a => (
                <SideAnnounce key={a.id} text={a.text} color={a.color} side="enemy" />
              ))}
            </div>

            {/* Enemy units */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", overflow: "auto", flex: 1, alignContent: "flex-start" }}>
              {eDisplay.map(u => (
                <UnitCard
                  key={u.id} unit={u}
                  highlight={highlight[u.id]}
                  isAttacker={highlight[u.id] === "attacker"}
                  isTarget={highlight[u.id] === "target"}
                  isDead={u._dead}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── COMBAT LOG (right 35%) ── */}
        <div style={{ flex: "0 0 35%", display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.3)" }}>
          <div style={{
            padding: "8px 12px", fontSize: 11, fontWeight: 800, color: "#00f0ff",
            letterSpacing: 2, borderBottom: "1px solid rgba(0,240,255,0.1)",
            fontFamily: "'Orbitron', monospace", flexShrink: 0,
          }}>
            COMBAT LOG ({log.length} entries)
          </div>

          <div ref={logRef} style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
            {log.map((entry, i) => {
              const isSetup = entry.type === "setup";
              const isCurrent = !isSetup && (i - setupCount) === eventIdx;
              const isPast = !isSetup && (i - setupCount) < eventIdx;
              const isFuture = !isSetup && (i - setupCount) > eventIdx;

              // Apply filter
              if (filterTypes && !isSetup && !filterTypes.has(entry.type)) return null;

              return (
                <div
                  key={i}
                  className="spec-log-row"
                  onClick={() => {
                    if (!isSetup) {
                      const evtI = i - setupCount;
                      // Replay to this point
                      setPBoard([]); setEBoard([]);
                      setPAnnounce([]); setEAnnounce([]);
                      for (let j = 0; j <= evtI; j++) processEvent(j);
                    }
                  }}
                  style={{
                    display: "flex", gap: 6, padding: "3px 10px", fontSize: 10, lineHeight: 1.5,
                    cursor: isSetup ? "default" : "pointer",
                    background: isCurrent ? "rgba(0,240,255,0.08)" : "transparent",
                    borderLeft: isCurrent ? "3px solid #00f0ff" : "3px solid transparent",
                    opacity: isFuture ? 0.25 : isSetup ? 0.55 : isPast ? 0.65 : 1,
                    transition: "all 0.15s",
                    fontFamily: "monospace",
                  }}
                  onMouseOver={e => { if (!isSetup) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseOut={e => { e.currentTarget.style.background = isCurrent ? "rgba(0,240,255,0.08)" : "transparent"; }}
                >
                  {/* Index */}
                  <span style={{ color: "#444", minWidth: 28, textAlign: "right", flexShrink: 0 }}>
                    {isSetup ? "  " : String(i - setupCount + 1).padStart(3, "0")}
                  </span>

                  {/* Side indicator */}
                  <span style={{ minWidth: 22, flexShrink: 0, textAlign: "center" }}>{entry.side}</span>

                  {/* Icon */}
                  <span style={{ minWidth: 16, flexShrink: 0 }}>{entry.icon}</span>

                  {/* Label */}
                  <span style={{
                    color: entry.color, fontWeight: 700, minWidth: 70, flexShrink: 0,
                    fontSize: 9, letterSpacing: 0.5,
                  }}>{entry.label}</span>

                  {/* Description */}
                  <span style={{ color: isCurrent ? "#fff" : "#aaa", flex: 1, wordBreak: "break-word" }}>
                    {entry.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        @keyframes specFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .spec-log-row:hover { background: rgba(255,255,255,0.02) !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        ::-webkit-scrollbar-thumb { background: rgba(0,240,255,0.15); border-radius: 3px; }
      `}</style>
    </div>
  );
}

// ── Button style helper ──
function btnStyle(color) {
  return {
    background: "rgba(255,255,255,0.04)", border: `1px solid ${color}44`,
    color, padding: "5px 12px", fontSize: 10, fontWeight: 700,
    cursor: "pointer", borderRadius: 4, fontFamily: "'Orbitron', monospace",
    letterSpacing: 1, textTransform: "uppercase", transition: "all 0.2s",
  };
}
