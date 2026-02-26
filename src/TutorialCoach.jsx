/**
 * TutorialCoach.jsx — Interactive first-game onboarding system
 * 
 * NOT a text dump. A contextual coach that watches game state and shows
 * the right tip at the right moment during actual gameplay.
 * 
 * Usage: <TutorialCoach active={tutorialMode} gameState={{gs, round, board, bench, shop, gold, tier, ...}} onDismiss={()=>setTutorialMode(false)} />
 */
import { useState, useEffect, useRef, useMemo } from "react";

// ═══ TUTORIAL STEP DEFINITIONS ═══
// Each step: { id, phase, condition, title, text, highlight?, pulse?, autoAdvance? }
// condition(state) → boolean: when to show this step
// autoAdvance(state) → boolean: when to auto-move to next step
const STEPS = [
  // ── OPERATOR PICK ──
  {
    id: "op-pick",
    phase: "operatorPick",
    title: "CHOOSE YOUR OPERATOR",
    text: "Each operator changes how you play. Don't overthink it — pick whoever sounds fun.",
    hint: "👆 Click any operator card below to begin",
    position: "top",
  },
  // ── ROUND 1: FIRST SHOP ──
  {
    id: "shop-intro",
    phase: "shop",
    round: [1, 1],
    title: "THE SHOP",
    text: "This is your shop. Units cost gold equal to their tier. You have 6 gold — buy 2-3 units to start building your team.",
    hint: "👆 Click units in the shop to buy them",
    highlight: "shop-row",
    autoAdvance: (s) => s.board.length + s.bench.length >= 2,
  },
  {
    id: "board-explain",
    phase: "shop",
    round: [1, 1],
    condition: (s) => s.board.length + s.bench.length >= 2,
    title: "YOUR BOARD",
    text: "Units on the board fight. Units on the bench wait. Click a board unit to select it, then click another to swap positions. Leftmost units attack first and take hits first.",
    hint: "Position tanks on the left, damage dealers on the right",
    highlight: "board-area",
    dismiss: true,
  },
  // ── ROUND 1: FIRST COMBAT ──
  {
    id: "first-combat",
    phase: "combat",
    round: [1, 1],
    title: "COMBAT",
    text: "Your units auto-battle! Watch how positioning affects who gets hit. After combat, you'll return to shop with gold.",
    position: "top",
  },
  // ── ROUND 2: FACTIONS ──
  {
    id: "factions",
    phase: "shop",
    round: [2, 2],
    title: "FACTIONS = POWER",
    text: "See the colored borders on units? Those are factions. Buy 2+ units from the SAME faction to unlock powerful bonuses. Check the synergy bar on the left.",
    hint: "🎯 Try buying units that share a faction color",
    highlight: "synergy-bar",
    dismiss: true,
  },
  // ── ROUND 3: ECONOMY ──
  {
    id: "economy",
    phase: "shop",
    round: [3, 3],
    title: "ECONOMY",
    text: "Reroll costs 1 gold — get new units in the shop. Tier Up unlocks stronger units. For now, focus on buying pairs: 3 copies of the same unit = GOLDEN triple with 2× stats!",
    hint: "💰 Reroll to find copies of units you already own",
    highlight: "econ-btns",
    dismiss: true,
  },
  // ── ROUND 4: CHIPS ──
  {
    id: "chips",
    phase: "shop",
    round: [4, 6],
    condition: (s) => s.shop.some(u => u.isChip),
    title: "⟐ AUGMENT CHIPS",
    text: "See those diamond icons in the shop? Those are Chips — permanent buffs you apply to a unit. Buy a chip, then click any unit to augment it. This is how you customize your build.",
    hint: "⟐ Buy a chip from the shop and apply it to your strongest unit",
    highlight: "shop-row",
    dismiss: true,
  },
  // ── ROUND 5: BOSS WARNING ──
  {
    id: "boss-warning",
    phase: "shop",
    round: [5, 5],
    title: "⚠️ BOSS INCOMING",
    text: "Round 5 is a BOSS round! The enemy will be tougher than normal. Make sure your board is full and your units are positioned well. Tanks left, carries right.",
    hint: "Spend all your gold — you want maximum power for this fight",
    dismiss: true,
  },
  // ── ROUND 6+: COMBOS ──
  {
    id: "combos",
    phase: "shop",
    round: [6, 8],
    title: "CROSS-FACTION COMBOS",
    text: "Have 2+ of two different factions? That can unlock a Combo bonus! Check the combo section in the synergy bar. Combos give extra gold and powerful effects.",
    dismiss: true,
  },
  // ── ROUND 7+: INNATES ──
  {
    id: "innates",
    phase: "shop",
    round: [7, 9],
    title: "UNIT INNATES",
    text: "Every unit has a UNIQUE innate ability — hover over units on your board to read them. Some heal, some steal stats, some explode on death. Build around units whose innates match your strategy.",
    hint: "Hover any board unit to see its innate ability in the info panel",
    dismiss: true,
  },
  // ── ROUND 10: MID-GAME ──
  {
    id: "midgame",
    phase: "shop",
    round: [10, 10],
    title: "MID-GAME",
    text: "You've survived 10 rounds — nice! From here, focus on: upgrading your tier for stronger units, tripling units into goldens, and deepening your faction synergies. The deeper your faction count, the stronger the bonus.",
    dismiss: true,
  },
  // ── GRADUATION ──
  {
    id: "graduation",
    phase: "shop",
    round: [11, 20],
    title: "YOU'RE ON YOUR OWN",
    text: "That's the basics! Press TAB to scout your next opponent. Win streaks and loss streaks both give bonus gold. Tier 6 unlocks after completing mastery goals. Good luck, operator.",
    hint: "Press ❌ to dismiss the coach permanently",
    dismiss: true,
    final: true,
  },
];

// ═══ COACH COMPONENT ═══
export default function TutorialCoach({ active, gameState, onDismiss }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dismissed, setDismissed] = useState(new Set());
  const [visible, setVisible] = useState(true);
  const [animating, setAnimating] = useState(false);
  const prevPhaseRef = useRef(null);
  const prevRoundRef = useRef(0);

  // Find the current applicable step
  const activeStep = useMemo(() => {
    if (!active || !visible) return null;
    const { gs, round, board, bench, shop, gold, tier } = gameState;

    for (let i = currentStep; i < STEPS.length; i++) {
      const step = STEPS[i];
      if (dismissed.has(step.id)) continue;

      // Phase match
      if (step.phase && step.phase !== gs) continue;

      // Round range match
      if (step.round) {
        const [min, max] = step.round;
        if (round < min || round > max) continue;
      }

      // Custom condition
      if (step.condition && !step.condition({ gs, round, board, bench, shop, gold, tier })) continue;

      return { ...step, index: i };
    }
    return null;
  }, [active, visible, currentStep, dismissed, gameState]);

  // Auto-advance when condition met
  useEffect(() => {
    if (!activeStep?.autoAdvance) return;
    const { gs, round, board, bench, shop, gold, tier } = gameState;
    if (activeStep.autoAdvance({ gs, round, board, bench, shop, gold, tier })) {
      advanceStep(activeStep.index);
    }
  }, [activeStep, gameState]);

  // Auto-advance on phase/round change
  useEffect(() => {
    const { gs, round } = gameState;
    if (gs !== prevPhaseRef.current || round !== prevRoundRef.current) {
      prevPhaseRef.current = gs;
      prevRoundRef.current = round;
      // When phase changes, allow next relevant step to show
      if (activeStep && activeStep.phase !== gs) {
        setCurrentStep(activeStep.index + 1);
      }
    }
  }, [gameState.gs, gameState.round]);

  const advanceStep = (fromIndex) => {
    setAnimating(true);
    setTimeout(() => {
      setCurrentStep(fromIndex + 1);
      setAnimating(false);
    }, 300);
  };

  const dismissStep = () => {
    if (!activeStep) return;
    if (activeStep.final) {
      // Graduation — dismiss coach entirely
      setVisible(false);
      if (onDismiss) onDismiss();
      return;
    }
    setDismissed(prev => new Set([...prev, activeStep.id]));
    advanceStep(activeStep.index);
  };

  const dismissAll = () => {
    setVisible(false);
    if (onDismiss) onDismiss();
  };

  if (!active || !visible || !activeStep) return null;

  const posClass = activeStep.position === "center" ? "tc-center" :
    activeStep.position === "top" ? "tc-top" :
    activeStep.position === "bottom-right" ? "tc-bottom-right" : "tc-bottom-left";

  return (
    <>
      <style>{coachStyles}</style>
      <div className={`tutorial-coach ${posClass} ${animating ? "tc-exit" : "tc-enter"}`}>
        {/* Pulse indicator for highlighted elements */}
        {activeStep.highlight && (
          <div className="tc-highlight-pulse" data-target={activeStep.highlight} />
        )}

        {/* Coach card */}
        <div className="tc-card">
          <div className="tc-header">
            <div className="tc-step-indicator">
              {STEPS.filter(s => !s.condition || s.phase === "shop").map((s, i) => (
                <div key={s.id} className={`tc-dot ${s.id === activeStep.id ? "active" : i < activeStep.index ? "done" : ""}`} />
              ))}
            </div>
            <button className="tc-dismiss-all" onClick={dismissAll} title="Turn off coach">✕</button>
          </div>

          <div className="tc-title">{activeStep.title}</div>
          <div className="tc-text">{activeStep.text}</div>

          {activeStep.hint && (
            <div className="tc-hint">{activeStep.hint}</div>
          )}

          <div className="tc-footer">
            {activeStep.dismiss && (
              <button className="tc-btn tc-btn-next" onClick={dismissStep}>
                {activeStep.final ? "CLOSE COACH" : "GOT IT →"}
              </button>
            )}
            {!activeStep.dismiss && !activeStep.autoAdvance && (
              <div className="tc-waiting">Waiting for action...</div>
            )}
            {activeStep.autoAdvance && (
              <div className="tc-waiting">Complete the action above ↑</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ═══ STYLES ═══
const coachStyles = `
/* ── Tutorial Coach Container ── */
.tutorial-coach {
  position: fixed;
  z-index: 80;
  pointer-events: auto;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.tc-bottom-left {
  bottom: 20px;
  left: 20px;
  max-width: 380px;
}
.tc-bottom-right {
  bottom: 20px;
  right: 20px;
  max-width: 380px;
}
.tc-top {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 480px;
  width: calc(100% - 40px);
}
.tc-center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 420px;
}

/* ── Animations ── */
.tc-enter {
  animation: tc-slide-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.tc-exit {
  animation: tc-slide-out 0.3s ease-in forwards;
}
@keyframes tc-slide-in {
  from { opacity: 0; transform: translateY(30px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes tc-slide-out {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(20px) scale(0.95); }
}
.tc-center.tc-enter {
  animation: tc-center-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes tc-center-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.tc-top.tc-enter {
  animation: tc-top-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.tc-top.tc-exit {
  animation: tc-top-out 0.3s ease-in forwards;
}
@keyframes tc-top-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes tc-top-out {
  from { opacity: 1; transform: translateX(-50%) translateY(0); }
  to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
}

/* ── Card ── */
.tc-card {
  background: linear-gradient(135deg, rgba(8, 12, 24, 0.97), rgba(12, 18, 35, 0.97));
  border: 1px solid rgba(0, 240, 255, 0.3);
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 
    0 0 30px rgba(0, 240, 255, 0.08),
    0 8px 32px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(0, 240, 255, 0.1);
  backdrop-filter: blur(12px);
  position: relative;
  overflow: hidden;
}
.tc-top .tc-card {
  padding: 10px 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  align-items: center;
}
.tc-top .tc-header { margin-bottom: 0; }
.tc-top .tc-title { margin-bottom: 0; font-size: 0.75rem; white-space: nowrap; }
.tc-top .tc-text { margin-bottom: 0; font-size: 0.78rem; flex: 1; min-width: 200px; }
.tc-top .tc-hint { margin-bottom: 0; padding: 5px 10px; font-size: 0.7rem; flex-basis: 100%; }
.tc-top .tc-footer { margin-left: auto; }
.tc-top .tc-step-indicator { display: none; }
.tc-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00f0ff, transparent);
  animation: tc-glow-scan 3s ease-in-out infinite;
}
@keyframes tc-glow-scan {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}

/* ── Header ── */
.tc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.tc-step-indicator {
  display: flex;
  gap: 4px;
}
.tc-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  transition: all 0.3s;
}
.tc-dot.active {
  background: #00f0ff;
  box-shadow: 0 0 8px rgba(0, 240, 255, 0.5);
  width: 18px;
  border-radius: 3px;
}
.tc-dot.done {
  background: rgba(0, 240, 255, 0.4);
}
.tc-dismiss-all {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.4);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.tc-dismiss-all:hover {
  border-color: #ff4444;
  color: #ff4444;
}

/* ── Content ── */
.tc-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.85rem;
  font-weight: 800;
  color: #00f0ff;
  margin-bottom: 8px;
  letter-spacing: 1.5px;
}
.tc-text {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
  margin-bottom: 8px;
}
.tc-hint {
  font-size: 0.75rem;
  color: #ffcc00;
  padding: 8px 12px;
  background: rgba(255, 204, 0, 0.08);
  border: 1px solid rgba(255, 204, 0, 0.2);
  border-radius: 6px;
  margin-bottom: 10px;
  font-weight: 600;
}

/* ── Footer ── */
.tc-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.tc-btn {
  background: none;
  border: 1px solid rgba(0, 240, 255, 0.4);
  color: #00f0ff;
  padding: 6px 16px;
  border-radius: 6px;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 1px;
  transition: all 0.2s;
}
.tc-btn:hover {
  background: rgba(0, 240, 255, 0.1);
  border-color: #00f0ff;
  box-shadow: 0 0 12px rgba(0, 240, 255, 0.2);
}
.tc-btn-next {
  border-color: rgba(0, 240, 255, 0.5);
}
.tc-waiting {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
  animation: tc-pulse 2s ease-in-out infinite;
}
@keyframes tc-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

/* ── Highlight Pulse (overlay for targeted UI elements) ── */
.tc-highlight-pulse {
  display: none; /* Actual highlighting done via data attributes in parent */
}

/* ── Responsive ── */
@media (max-width: 600px) {
  .tc-bottom-left, .tc-bottom-right {
    left: 8px;
    right: 8px;
    bottom: 8px;
    max-width: none;
  }
  .tc-card {
    padding: 12px 14px;
  }
  .tc-title {
    font-size: 0.75rem;
  }
  .tc-text {
    font-size: 0.75rem;
  }
}
`;
