// ==================================================
// NEON ARENA — CODEX (Unit Collection / Reference)
// Access: http://localhost:5173/?codex
// ==================================================
import { useState, useMemo } from "react";
import { U, T7_UNITS } from './engine/combat-esm.js';
import FACTIONS_RAW from './data/factions.json';
import KEYWORDS from './data/keywords.json';

// Build faction lookup from JSON
const FACTIONS = Object.fromEntries(
  Object.entries(FACTIONS_RAW).map(([k, v]) => [k, { name: v.name, color: v.color, icon: v.icon, desc: v.desc }])
);

const ROLES_DATA = {
  Vanguard:    { icon: "🛡️", color: "#4488ff", desc: "(2) 20% damage reduction (4) Taunt 2 hits, team absorb +2" },
  Striker:     { icon: "⚔️", color: "#ff4444", desc: "(2) +1 ATK per attack (4) Strongest attacks 2×, all Strikers +2 ATK" },
  Infiltrator: { icon: "🗡️", color: "#aa44ff", desc: "(2) Start Stealthed, bypass frontline (4) Kill refreshes Stealth, +3 backline dmg" },
  Architect:   { icon: "🔧", color: "#44ff88", desc: "(2) Architects gain Shield (4) Team +2 Shield, Architects +4 Shield" },
  Sentinel:    { icon: "⚡", color: "#ffaa00", desc: "(2) Random keyword at start (4) +2/+2 and random keyword" },
};

function KwIcon({ kw, size = 16 }) {
  return (
    <img
      src={`/art/keywords/kw_${kw}.png`}
      alt={kw}
      onError={e => { e.target.style.display = "none"; }}
      style={{ width: size, height: size, imageRendering: "pixelated", verticalAlign: "middle", flexShrink: 0 }}
    />
  );
}

function artPath(name, faction) {
  const c = name.replace(/^Golden /i, "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
  return `/art/units/unit_${faction.toLowerCase()}_${c.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "")}.png`;
}

function tierColor(t) {
  return { 1: "#888", 2: "#44cc44", 3: "#4488ff", 4: "#aa66ff", 5: "#ff8800", 6: "#ff4444", 7: "#ffcc00" }[t] || "#888";
}

function tierLabel(t) {
  return { 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary", 6: "Mythic", 7: "Black Ice" }[t] || "";
}

// ── CARD COMPONENT ──
function CodexCard({ unit, onSelect, selected, FACTIONS }) {
  const fc = FACTIONS[unit.f]?.color || "#888";
  const tc = tierColor(unit.t);
  const imgSrc = artPath(unit.name, unit.f);
  const abilities = [];
  unit.kw.forEach(k => {
    const kwDesc = unit.kwData?.[k];
    if (kwDesc) abilities.push({ kw: k, text: kwDesc });
  });

  return (
    <div
      onClick={() => onSelect(unit)}
      style={{
        width: 220, minHeight: 300, cursor: "pointer",
        background: `linear-gradient(135deg, ${fc}08 0%, #0a0a12 40%, ${fc}05 100%)`,
        border: `2px solid ${selected ? "#fff" : fc + "55"}`,
        borderRadius: 12, padding: 0, overflow: "hidden",
        transition: "all 0.2s ease",
        boxShadow: selected ? `0 0 20px ${fc}66, inset 0 0 20px ${fc}11` : `0 2px 12px #00000066`,
        transform: selected ? "scale(1.03)" : "scale(1)",
        position: "relative",
      }}
    >
      {/* Tier badge */}
      <div style={{
        position: "absolute", top: 8, left: 8, zIndex: 2,
        background: tc + "22", border: `1px solid ${tc}88`,
        borderRadius: 6, padding: "2px 8px",
        fontSize: 10, fontWeight: 800, color: tc, letterSpacing: 1,
        fontFamily: "Orbitron, monospace",
      }}>
        T{unit.t}
      </div>

      {/* Cost badge */}
      <div style={{
        position: "absolute", top: 8, right: 8, zIndex: 2,
        background: "#ffcc0022", border: "1px solid #ffcc0088",
        borderRadius: 6, padding: "2px 8px",
        fontSize: 10, fontWeight: 800, color: "#ffcc00",
        fontFamily: "Orbitron, monospace",
      }}>
        {unit.t}g
      </div>

      {/* Unit art */}
      <div style={{
        width: "100%", height: 160, background: `radial-gradient(ellipse at center, ${fc}15 0%, #0a0a12 70%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        {/* Scanline overlay */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #00000018 2px, #00000018 4px)",
          pointerEvents: "none", zIndex: 1,
        }} />
        <img
          src={imgSrc}
          alt={unit.name}
          onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
          style={{ width: 120, height: 120, objectFit: "contain", imageRendering: "pixelated", zIndex: 0 }}
        />
        <div style={{ display: "none", fontSize: 56, alignItems: "center", justifyContent: "center" }}>{unit.e}</div>
      </div>

      {/* Divider */}
      <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${fc}, transparent)`, margin: "0 12px" }} />

      {/* Info section */}
      <div style={{ padding: "10px 12px" }}>
        {/* Name + Role row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
          <div style={{
            fontFamily: "Orbitron, monospace", fontSize: 13, fontWeight: 800,
            color: "#eee", letterSpacing: 0.5,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            flex: 1, minWidth: 0,
          }}>
            {unit.name}
          </div>
          {unit.role && ROLES_DATA[unit.role] && <div style={{
            background: ROLES_DATA[unit.role].color + "22", border: `1px solid ${ROLES_DATA[unit.role].color}66`,
            borderRadius: 5, padding: "1px 6px",
            fontSize: 9, fontWeight: 700, color: ROLES_DATA[unit.role].color,
            fontFamily: "Orbitron, monospace", letterSpacing: 0.5,
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {ROLES_DATA[unit.role].icon} {unit.role}
          </div>}
        </div>

        {/* Faction */}
        <div style={{
          fontSize: 10, color: fc, fontWeight: 600, marginBottom: 8,
          fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <img src={`/art/factions/faction_${unit.f.toLowerCase()}.png`} alt={unit.f}
            onError={e => { e.target.style.display = "none"; }}
            style={{ width: 14, height: 14, imageRendering: "pixelated" }} />
          {unit.f}
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "#ff444422", borderRadius: 6, padding: "3px 10px",
            border: "1px solid #ff444444",
          }}>
            <span style={{ fontSize: 10, color: "#ff8888" }}>ATK</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#ff4444", fontFamily: "Orbitron, monospace" }}>{unit.a}</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "#44ff6622", borderRadius: 6, padding: "3px 10px",
            border: "1px solid #44ff6644",
          }}>
            <span style={{ fontSize: 10, color: "#88ff88" }}>HP</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#44ff66", fontFamily: "Orbitron, monospace" }}>{unit.h}</span>
          </div>
        </div>

        {/* Keywords */}
        {unit.kw.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: abilities.length > 0 ? 8 : 0 }}>
            {unit.kw.map(k => (
              <span key={k} style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 4,
                background: "#ffffff0a", border: "1px solid #ffffff22",
                color: "#ccc", fontFamily: "monospace", fontWeight: 600,
                display: "inline-flex", alignItems: "center", gap: 3,
              }}>
                <KwIcon kw={k} size={12} /> {KEYWORDS[k]?.name || k}
              </span>
            ))}
          </div>
        )}

        {/* Abilities (kwData text) */}
        {abilities.map((ab, i) => (
          <div key={i} style={{
            fontSize: 10, color: "#aaa", lineHeight: 1.4,
            padding: "4px 6px", marginTop: 2,
            background: `${fc}08`, borderRadius: 4,
            borderLeft: `2px solid ${fc}66`,
          }}>
            <span style={{ color: fc, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <KwIcon kw={ab.kw} size={12} /> {KEYWORDS[ab.kw]?.name}: </span>
            {ab.text}
          </div>
        ))}

        {/* Innate ability */}
        {unit.innate && (
          <div style={{
            fontSize: 10, color: "#ffcc00cc", lineHeight: 1.4,
            padding: "4px 6px", marginTop: 4,
            background: "rgba(255,204,0,0.06)", borderRadius: 4,
            borderLeft: "2px solid rgba(255,204,0,0.4)",
            fontStyle: "italic",
          }}>
            <span style={{ color: "#ffcc00", fontWeight: 700, fontStyle: "normal" }}>⚡ Innate: </span>
            {unit.innate}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DETAIL PANEL ──
function DetailPanel({ unit, onClose, FACTIONS }) {
  if (!unit) return null;
  const fc = FACTIONS[unit.f]?.color || "#888";
  const tc = tierColor(unit.t);
  const imgSrc = artPath(unit.name, unit.f);

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, width: 380, height: "100vh",
      background: `linear-gradient(180deg, #0a0a16 0%, #0d0d18 100%)`,
      borderLeft: `2px solid ${fc}44`,
      zIndex: 1000, overflowY: "auto", padding: "24px 20px",
      boxShadow: `-10px 0 40px #00000088`,
    }}>
      <button onClick={onClose} style={{
        position: "absolute", top: 12, right: 12, background: "none",
        border: "1px solid #ffffff33", borderRadius: 6, color: "#888",
        fontSize: 14, padding: "4px 10px", cursor: "pointer",
      }}>✕</button>

      {/* Art */}
      <div style={{
        width: "100%", height: 240, borderRadius: 12, overflow: "hidden",
        background: `radial-gradient(ellipse at center, ${fc}18 0%, #0a0a12 80%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${fc}33`, marginBottom: 16,
      }}>
        <img
          src={imgSrc} alt={unit.name}
          onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
          style={{ width: 180, height: 180, objectFit: "contain", imageRendering: "pixelated" }}
        />
        <div style={{ display: "none", fontSize: 80, alignItems: "center", justifyContent: "center" }}>{unit.e}</div>
      </div>

      {/* Tier + Name */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 4,
      }}>
        <span style={{
          background: tc + "22", border: `1px solid ${tc}88`, borderRadius: 6,
          padding: "2px 10px", fontSize: 11, fontWeight: 800, color: tc,
          fontFamily: "Orbitron, monospace",
        }}>T{unit.t}</span>
        <span style={{
          fontSize: 10, color: tc, fontWeight: 600, letterSpacing: 1,
          fontFamily: "monospace", textTransform: "uppercase",
        }}>{tierLabel(unit.t)}</span>
      </div>

      <div style={{
        fontFamily: "Orbitron, monospace", fontSize: 22, fontWeight: 900,
        color: "#fff", letterSpacing: 1, marginBottom: 4,
      }}>{unit.name}</div>

      <div style={{
        fontSize: 13, color: fc, fontWeight: 700, marginBottom: 16,
        fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 2,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <img src={`/art/factions/faction_${unit.f.toLowerCase()}.png`} alt={unit.f}
          onError={e => { e.target.style.display = "none"; }}
          style={{ width: 20, height: 20, imageRendering: "pixelated" }} />
        {unit.f}
      </div>

      {/* Stats */}
      <div style={{
        display: "flex", gap: 16, marginBottom: 20,
      }}>
        <div style={{
          flex: 1, textAlign: "center", padding: "12px 0",
          background: "#ff444412", border: "1px solid #ff444433", borderRadius: 8,
        }}>
          <div style={{ fontSize: 10, color: "#ff8888", marginBottom: 4 }}>ATTACK</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#ff4444", fontFamily: "Orbitron, monospace" }}>{unit.a}</div>
        </div>
        <div style={{
          flex: 1, textAlign: "center", padding: "12px 0",
          background: "#44ff6612", border: "1px solid #44ff6633", borderRadius: 8,
        }}>
          <div style={{ fontSize: 10, color: "#88ff88", marginBottom: 4 }}>HEALTH</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#44ff66", fontFamily: "Orbitron, monospace" }}>{unit.h}</div>
        </div>
        <div style={{
          flex: 1, textAlign: "center", padding: "12px 0",
          background: "#ffcc0012", border: "1px solid #ffcc0033", borderRadius: 8,
        }}>
          <div style={{ fontSize: 10, color: "#ffcc88", marginBottom: 4 }}>COST</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#ffcc00", fontFamily: "Orbitron, monospace" }}>{unit.t}</div>
        </div>
      </div>

      {/* Keywords detail */}
      {unit.kw.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, color: "#666", fontWeight: 700, letterSpacing: 2,
            textTransform: "uppercase", marginBottom: 8, fontFamily: "monospace",
          }}>KEYWORDS</div>
          {unit.kw.map(k => (
            <div key={k} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "8px 10px", marginBottom: 4, borderRadius: 6,
              background: "#ffffff06", border: "1px solid #ffffff0a",
            }}>
              <div style={{ flexShrink: 0, marginTop: 2 }}>
                <KwIcon kw={k} size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 800, color: "#ddd", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <KwIcon kw={k} size={18} /> {KEYWORDS[k]?.name || k}
                </div>
                <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>
                  {KEYWORDS[k]?.desc}
                </div>
                {unit.kwData?.[k] && (
                  <div style={{
                    fontSize: 11, color: fc, fontWeight: 600, marginTop: 4,
                    padding: "4px 8px", background: `${fc}0a`, borderRadius: 4,
                    borderLeft: `2px solid ${fc}66`,
                  }}>
                    {unit.kwData[k]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Innate ability */}
      {unit.innate && (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: "rgba(255,204,0,0.06)",
          border: "1px solid rgba(255,204,0,0.2)",
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 11, color: "#666", fontWeight: 700, letterSpacing: 2,
            textTransform: "uppercase", marginBottom: 6, fontFamily: "monospace",
          }}>INNATE ABILITY</div>
          <div style={{
            fontSize: 13, color: "#ffcc00", fontWeight: 600, lineHeight: 1.5,
          }}>
            ⚡ {unit.innate}
          </div>
        </div>
      )}

      {/* T7 Rule-Breaker */}
      {unit._t7rule && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, background: "rgba(255,204,0,0.06)",
          border: "1px solid rgba(255,204,0,0.25)", marginTop: 8,
        }}>
          <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 11, color: "#ffcc00", fontWeight: 800, marginBottom: 4, letterSpacing: 1 }}>
            ⚡ RULE-BREAKER
          </div>
          <div style={{ fontSize: 11, color: "#ffcc00cc", lineHeight: 1.4 }}>
            {unit._t7rule === "synthTripleScale" && "Synths scale at 3x rate (+3/+3 per attack instead of +1/+1). Combat timer +15s."}
            {unit._t7rule === "silenceAll" && "At combat start, permanently silence ALL enemy keywords for this combat."}
            {unit._t7rule === "virusDoubleBleed" && "Virus player-bleed damage doubled. On death, enemy player takes 10 direct damage."}
            {unit._t7rule === "combatRunsTwice" && "Combat runs TWICE — after round 1, all dead units revive at 50% HP for round 2."}
            {unit._t7rule === "tripleSlotBoss" && "Attacks 3x per turn with Cleave+Splash. Takes 40% reduced damage."}
            {unit._t7rule === "droneHiveHP" && "All Drones share HP pool (merged). Damage to any Drone is split across all."}
            {unit._t7rule === "tripleShields" && "All shields tripled. Shield-break stun lasts 5 turns. Allies gain extra shield regen."}
            {unit._t7rule === "immuneToAll" && "Immune to ALL effects (silence, malware kill, steal, debuffs). Pure stats only. +5/+5 per combat permanently."}
          </div>
        </div>
      )}

      {/* Faction info */}
      <div style={{
        padding: "12px", borderRadius: 8, background: `${fc}08`,
        border: `1px solid ${fc}22`,
      }}>
        <div style={{
          fontSize: 11, color: "#666", fontWeight: 700, letterSpacing: 2,
          textTransform: "uppercase", marginBottom: 6, fontFamily: "monospace",
        }}>FACTION BONUS</div>
        <div style={{ fontSize: 12, color: fc, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <img src={`/art/factions/faction_${unit.f.toLowerCase()}.png`} alt={unit.f}
            onError={e => { e.target.style.display = "none"; }}
            style={{ width: 16, height: 16, imageRendering: "pixelated" }} />
          {FACTIONS[unit.f]?.name}
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 4, lineHeight: 1.5 }}>
          {FACTIONS[unit.f]?.desc}
        </div>
      </div>
    </div>
  );
}

// ── MAIN CODEX COMPONENT ──
export default function Codex() {
  const units = useMemo(() => [...U, ...T7_UNITS], []);
  const [filterFaction, setFilterFaction] = useState("ALL");
  const [filterTier, setFilterTier] = useState(0);
  const [filterKw, setFilterKw] = useState("ALL");
  const [filterRole, setFilterRole] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [sortBy, setSortBy] = useState("tier");

  const filtered = useMemo(() => {
    let list = [...units];
    if (filterFaction !== "ALL") list = list.filter(u => u.f === filterFaction);
    if (filterTier > 0) list = list.filter(u => u.t === filterTier);
    if (filterKw !== "ALL") list = list.filter(u => u.kw.includes(filterKw));
    if (filterRole !== "ALL") list = list.filter(u => u.role === filterRole);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.f.toLowerCase().includes(q) ||
        u.kw.some(k => k.includes(q)) ||
        Object.values(u.kwData || {}).some(v => v.toLowerCase().includes(q))
      );
    }
    if (sortBy === "tier") list.sort((a, b) => a.t - b.t || a.f.localeCompare(b.f) || a.name.localeCompare(b.name));
    else if (sortBy === "atk") list.sort((a, b) => b.a - a.a);
    else if (sortBy === "hp") list.sort((a, b) => b.h - a.h);
    else if (sortBy === "faction") list.sort((a, b) => a.f.localeCompare(b.f) || a.t - b.t);
    else if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [units, filterFaction, filterTier, filterKw, filterRole, searchText, sortBy]);

  // Group by tier for section headers
  const grouped = useMemo(() => {
    if (sortBy !== "tier") return null;
    const groups = {};
    filtered.forEach(u => {
      if (!groups[u.t]) groups[u.t] = [];
      groups[u.t].push(u);
    });
    return groups;
  }, [filtered, sortBy]);

  const allKws = [...new Set(units.flatMap(u => u.kw))].sort();

  const btnStyle = (active) => ({
    background: active ? "#ffffff15" : "transparent",
    border: `1px solid ${active ? "#ffffff44" : "#ffffff15"}`,
    borderRadius: 6, padding: "5px 12px", cursor: "pointer",
    color: active ? "#fff" : "#666", fontSize: 11, fontWeight: 700,
    fontFamily: "monospace", transition: "all 0.15s ease",
  });

  const factionBtnStyle = (f, active) => ({
    background: active ? (FACTIONS[f]?.color || "#888") + "22" : "transparent",
    border: `1px solid ${active ? (FACTIONS[f]?.color || "#888") + "88" : "#ffffff15"}`,
    borderRadius: 6, padding: "5px 12px", cursor: "pointer",
    color: active ? FACTIONS[f]?.color || "#fff" : "#666",
    fontSize: 11, fontWeight: 700, fontFamily: "monospace", transition: "all 0.15s ease",
  });

  return (
    <div style={{
      minHeight: "100vh", background: "#08080f",
      color: "#ccc", fontFamily: "monospace",
      paddingRight: selectedUnit ? 380 : 0,
      transition: "padding-right 0.3s ease",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #0d0d1a, #08080f)",
        borderBottom: "1px solid #ffffff0a",
        padding: "20px 24px 16px",
        position: "sticky", top: 0, zIndex: 100,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <a href="/" style={{ color: "#666", textDecoration: "none", fontSize: 12 }}>← BACK</a>
          <div style={{
            fontFamily: "Orbitron, monospace", fontSize: 24, fontWeight: 900,
            color: "#00f0ff", letterSpacing: 4,
            textShadow: "0 0 30px #00f0ff44",
          }}>
            NEON CODEX
          </div>
          <div style={{
            fontSize: 11, color: "#444", fontFamily: "monospace",
            marginLeft: "auto",
          }}>
            {filtered.length} / {units.length} units
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search units, keywords, abilities..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{
            width: "100%", maxWidth: 400, padding: "8px 14px",
            background: "#ffffff08", border: "1px solid #ffffff15",
            borderRadius: 8, color: "#eee", fontSize: 12, fontFamily: "monospace",
            outline: "none", marginBottom: 12,
          }}
        />

        {/* Faction filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          <button style={btnStyle(filterFaction === "ALL")} onClick={() => setFilterFaction("ALL")}>ALL</button>
          {Object.entries(FACTIONS).map(([key, f]) => (
            <button key={key} style={factionBtnStyle(key, filterFaction === key)}
              onClick={() => setFilterFaction(filterFaction === key ? "ALL" : key)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <img src={`/art/factions/faction_${key.toLowerCase()}.png`} alt={f.name}
                  onError={e => { e.target.style.display = "none"; }}
                  style={{ width: 14, height: 14, imageRendering: "pixelated" }} />
                {f.name}
              </span>
            </button>
          ))}
        </div>

        {/* Tier + Keyword + Sort filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#444", fontWeight: 700, marginRight: 4 }}>TIER:</span>
          <button style={btnStyle(filterTier === 0)} onClick={() => setFilterTier(0)}>All</button>
          {[1, 2, 3, 4, 5, 6, 7].map(t => (
            <button key={t} style={{
              ...btnStyle(filterTier === t),
              color: filterTier === t ? tierColor(t) : "#666",
              borderColor: filterTier === t ? tierColor(t) + "66" : "#ffffff15",
            }} onClick={() => setFilterTier(filterTier === t ? 0 : t)}>T{t}</button>
          ))}

          <span style={{ fontSize: 10, color: "#444", fontWeight: 700, marginLeft: 12, marginRight: 4 }}>KW:</span>
          <select
            value={filterKw}
            onChange={e => setFilterKw(e.target.value)}
            style={{
              background: "#0a0a14", border: "1px solid #ffffff22",
              borderRadius: 6, padding: "4px 8px", color: "#ccc",
              fontSize: 11, fontFamily: "monospace",
            }}
          >
            <option value="ALL">All Keywords</option>
            {allKws.map(k => (
              <option key={k} value={k}>{KEYWORDS[k]?.name || k}</option>
            ))}
          </select>

          <span style={{ fontSize: 10, color: "#444", fontWeight: 700, marginLeft: 12, marginRight: 4 }}>ROLE:</span>
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            style={{
              background: "#0a0a14", border: "1px solid #ffffff22",
              borderRadius: 6, padding: "4px 8px", color: "#ccc",
              fontSize: 11, fontFamily: "monospace",
            }}
          >
            <option value="ALL">All Roles</option>
            {Object.entries(ROLES_DATA).map(([k,v]) => (
              <option key={k} value={k}>{v.icon} {k}</option>
            ))}
          </select>

          <span style={{ fontSize: 10, color: "#444", fontWeight: 700, marginLeft: 12, marginRight: 4 }}>SORT:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              background: "#0a0a14", border: "1px solid #ffffff22",
              borderRadius: 6, padding: "4px 8px", color: "#ccc",
              fontSize: 11, fontFamily: "monospace",
            }}
          >
            <option value="tier">By Tier</option>
            <option value="faction">By Faction</option>
            <option value="atk">By ATK ↓</option>
            <option value="hp">By HP ↓</option>
            <option value="name">By Name</option>
          </select>
        </div>
      </div>

      {/* Card grid */}
      <div style={{ padding: "20px 24px" }}>
        {sortBy === "tier" && grouped ? (
          Object.entries(grouped).map(([tier, cards]) => (
            <div key={tier} style={{ marginBottom: 32 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
              }}>
                <div style={{
                  fontFamily: "Orbitron, monospace", fontSize: 16, fontWeight: 900,
                  color: tierColor(parseInt(tier)), letterSpacing: 2,
                }}>
                  TIER {tier}
                </div>
                <div style={{
                  fontSize: 10, color: tierColor(parseInt(tier)) + "88",
                  fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
                }}>
                  {tierLabel(parseInt(tier))} • {cards.length} units
                </div>
                <div style={{
                  flex: 1, height: 1,
                  background: `linear-gradient(90deg, ${tierColor(parseInt(tier))}44, transparent)`,
                }} />
              </div>
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 16,
              }}>
                {cards.map(u => (
                  <CodexCard key={u.name + u.f} unit={u} onSelect={setSelectedUnit}
                    selected={selectedUnit?.name === u.name && selectedUnit?.f === u.f} FACTIONS={FACTIONS} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {filtered.map(u => (
              <CodexCard key={u.name + u.f} unit={u} onSelect={setSelectedUnit}
                selected={selectedUnit?.name === u.name && selectedUnit?.f === u.f} FACTIONS={FACTIONS} />
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 0", color: "#333",
            fontFamily: "Orbitron, monospace", fontSize: 14,
          }}>
            No units match your filters
          </div>
        )}
      </div>

      {/* Detail panel */}
      <DetailPanel unit={selectedUnit} onClose={() => setSelectedUnit(null)} FACTIONS={FACTIONS} />

      {/* Role reference */}
      <div style={{
        padding: "24px", borderTop: "1px solid #ffffff0a",
        background: "linear-gradient(180deg, #0c0c18 0%, #0a0a14 100%)",
      }}>
        <div style={{
          fontFamily: "Orbitron, monospace", fontSize: 13, fontWeight: 800,
          color: "#555", letterSpacing: 2, marginBottom: 16,
        }}>
          ROLE REFERENCE — CLASSES
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {Object.entries(ROLES_DATA).map(([k, r]) => (
            <div key={k} style={{
              padding: "12px 16px", borderRadius: 8,
              background: r.color + "0a", border: `1px solid ${r.color}33`,
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>{r.icon}</span>
                <span style={{ fontFamily: "Orbitron, monospace", fontWeight: 800, fontSize: 13, color: r.color, letterSpacing: 1 }}>{k.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 11, color: "#999", lineHeight: 1.5 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Keyword reference footer */}
      <div style={{
        padding: "24px", borderTop: "1px solid #ffffff0a",
        background: "#0a0a14",
      }}>
        <div style={{
          fontFamily: "Orbitron, monospace", fontSize: 13, fontWeight: 800,
          color: "#444", letterSpacing: 2, marginBottom: 16,
        }}>
          KEYWORD REFERENCE
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(KEYWORDS).map(([k, kw]) => (
            <div key={k} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px", borderRadius: 6,
              background: "#ffffff06", border: "1px solid #ffffff0a",
              minWidth: 200,
            }}>
              <div>
                <span style={{ fontWeight: 800, color: "#ccc", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <KwIcon kw={k} size={16} /> {kw.name}
                </span>
                <span style={{ fontSize: 10, color: "#666", marginLeft: 8 }}>{kw.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
