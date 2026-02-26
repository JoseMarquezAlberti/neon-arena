// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// NEON ARENA â€” PixiJS Combat Renderer (BattleArenaPixi)
// Drop-in replacement for the CSS-based BattleArena component.
//
// INSTALL: npm install pixi.js
// USAGE:  Replace <BattleArena events={cEvents} onComplete={done}/>
//         with    <BattleArenaPixi events={cEvents} onComplete={done}/>
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import { useState, useEffect, useRef } from "react";
import * as PIXI from "pixi.js";

// â”€â”€ CONSTANTS (mirrors App.jsx) â”€â”€
const FACTIONS_DATA = {
  SYNTH:      { color: 0x00f0ff, hex: "#00f0ff" },
  HACKER:     { color: 0xff00ff, hex: "#ff00ff" },
  AUGMENTED:  { color: 0xff6600, hex: "#ff6600" },
  DRONE:      { color: 0x66ff00, hex: "#66ff00" },
  PSIONIC:    { color: 0xaa66ff, hex: "#aa66ff" },
  VIRUS:      { color: 0xcc0044, hex: "#cc0044" },
  PHANTOM:    { color: 0x8844cc, hex: "#8844cc" },
  CONSTRUCT:  { color: 0xbb8844, hex: "#bb8844" },
  NEUTRAL:    { color: 0x999999, hex: "#999999" },
};

// Keyword colors (for particle effects and borders)
const KW_COLORS = {
  firewall: 0x00f0ff, deadswitch: 0xaa66ff, bootseq: 0x00f0ff, initprot: 0x00f0ff,
  hardshell: 0x6688ff, malware: 0xff00ff, link: 0x00f0ff, execute: 0xff4444,
  cleave: 0xff8800, sniper: 0xff4444, splash: 0xffcc00, stealth: 0x8844cc,
  regen: 0x44ff66, adapt: 0xaa66ff, taunt: 0xff8800,
};

function artPath(name, faction) {
  const c = name.replace(/^Golden /i,"").replace(/[^a-zA-Z0-9 ]/g,"").trim();
  return `/art/units/unit_${faction.toLowerCase()}_${c.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/_+$/,"")}.png`;
}

// â”€â”€ EASING FUNCTIONS â”€â”€
const ease = {
  linear: t => t,
  quadOut: t => t * (2 - t),
  quadIn: t => t * t,
  cubicOut: t => (--t) * t * t + 1,
  elasticOut: t => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
  },
  backOut: t => { const s = 1.70158; return (--t) * t * ((s + 1) * t + s) + 1; },
  sineInOut: t => -(Math.cos(Math.PI * t) - 1) / 2,
};

// â”€â”€ TWEEN ENGINE (runs on PIXI ticker) â”€â”€
class TweenManager {
  constructor() { this.tweens = []; }

  add(target, props, duration, easeFn = ease.quadOut, onComplete) {
    const start = {};
    for (const key in props) start[key] = target[key];
    this.tweens.push({ target, start, end: props, duration, easeFn, elapsed: 0, onComplete });
  }

  update(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.elapsed += dt;
      const t = Math.min(1, tw.elapsed / tw.duration);
      const e = tw.easeFn(t);
      for (const key in tw.end) {
        tw.target[key] = tw.start[key] + (tw.end[key] - tw.start[key]) * e;
      }
      if (t >= 1) {
        for (const key in tw.end) tw.target[key] = tw.end[key];
        if (tw.onComplete) tw.onComplete();
        this.tweens.splice(i, 1);
      }
    }
  }

  clear() { this.tweens = []; }
  get active() { return this.tweens.length > 0; }
}

// â”€â”€ PARTICLE SYSTEM â”€â”€
class Particle {
  constructor(gfx, x, y, color, size, vx, vy, life, gravity = 0) {
    this.gfx = gfx; this.x = x; this.y = y; this.color = color;
    this.size = size; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.gravity = gravity;
    this.alpha = 1;
  }
  update(dt) {
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.alpha = Math.max(0, this.life / this.maxLife);
    return this.life > 0;
  }
}

class ParticleSystem {
  constructor(stage) {
    this.gfx = new PIXI.Graphics();
    stage.addChild(this.gfx);
    this.particles = [];
  }

  emit(x, y, color, count = 12, spread = 150, life = 0.6, size = 3, gravity = 200) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = spread * (0.5 + Math.random() * 0.5);
      this.particles.push(new Particle(
        this.gfx, x, y, color, size * (0.5 + Math.random()),
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        life * (0.5 + Math.random() * 0.5), gravity
      ));
    }
  }

  // Directional burst (for slash, projectile trail)
  emitDirectional(x, y, color, angle, count = 6, spread = 120, life = 0.4) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * 0.8;
      const speed = spread * (0.3 + Math.random() * 0.7);
      this.particles.push(new Particle(
        this.gfx, x, y, color, 2 + Math.random() * 2,
        Math.cos(a) * speed, Math.sin(a) * speed, life * (0.5 + Math.random()), 0
      ));
    }
  }

  // Ring burst (for shields, hardshell)
  emitRing(x, y, color, radius = 40, count = 16, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius * 0.3;
      const py = y + Math.sin(angle) * radius * 0.3;
      this.particles.push(new Particle(
        this.gfx, px, py, color, 2,
        Math.cos(angle) * radius * 1.5, Math.sin(angle) * radius * 1.5,
        life, 0
      ));
    }
  }

  update(dt) {
    this.gfx.clear();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p.update(dt)) { this.particles.splice(i, 1); continue; }
      this.gfx.beginFill(p.color, p.alpha * 0.9);
      this.gfx.drawCircle(p.x, p.y, p.size * p.alpha);
      this.gfx.endFill();
      // Glow layer
      this.gfx.beginFill(p.color, p.alpha * 0.25);
      this.gfx.drawCircle(p.x, p.y, p.size * 2.5 * p.alpha);
      this.gfx.endFill();
    }
  }

  clear() { this.particles = []; this.gfx.clear(); }
}

// â”€â”€ FLOATING TEXT (damage numbers, status text) â”€â”€
class FloatingText {
  constructor(stage, x, y, text, color, fontSize = 18) {
    this.txt = new PIXI.Text(text, {
      fontFamily: "Orbitron, monospace",
      fontSize, fontWeight: "900", fill: color,
      stroke: "#000000", strokeThickness: 3,
      dropShadow: true, dropShadowColor: "#000000",
      dropShadowDistance: 0, dropShadowBlur: 8,
    });
    this.txt.anchor.set(0.5);
    this.txt.x = x; this.txt.y = y;
    this.txt.scale.set(1.4);
    stage.addChild(this.txt);
    this.vy = -80; this.life = 1.0; this.maxLife = 1.0; this.gravity = 60;
  }
  update(dt) {
    this.vy += this.gravity * dt;
    this.txt.y += this.vy * dt;
    this.life -= dt;
    const t = this.life / this.maxLife;
    this.txt.alpha = Math.max(0, t);
    this.txt.scale.set(0.8 + t * 0.6);
    return this.life > 0;
  }
  destroy() { if (this.txt.parent) this.txt.parent.removeChild(this.txt); this.txt.destroy(); }
}
// ── FLASH OVERLAY (full-screen color flash on impact) ──
class FlashOverlay {
  constructor(stage, w, h) {
    this.gfx = new PIXI.Graphics();
    this.gfx.zIndex = 999;
    this.w = w; this.h = h;
    this.gfx.alpha = 0;
    stage.addChild(this.gfx);
    this.active = false; this.life = 0; this.maxLife = 0;
  }
  flash(color = 0xffffff, intensity = 0.3, duration = 0.12) {
    this.gfx.clear();
    this.gfx.beginFill(color, 1);
    this.gfx.drawRect(-50, -50, this.w + 100, this.h + 100);
    this.gfx.endFill();
    this.gfx.alpha = intensity;
    this.active = true; this.life = duration; this.maxLife = duration;
  }
  update(dt) {
    if (!this.active) return;
    this.life -= dt;
    if (this.life <= 0) { this.gfx.alpha = 0; this.active = false; return; }
    this.gfx.alpha = (this.life / this.maxLife) * 0.4;
  }
}

// ── IMPACT RING (expanding energy ring at hit point) ──
class ImpactRingSystem {
  constructor(stage) {
    this.gfx = new PIXI.Graphics();
    this.gfx.zIndex = 150;
    stage.addChild(this.gfx);
    this.rings = [];
  }
  emit(x, y, color, maxRadius = 60, duration = 0.35, lineWidth = 3) {
    this.rings.push({ x, y, color, maxRadius, duration, lineWidth, life: duration, maxLife: duration });
  }
  update(dt) {
    this.gfx.clear();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      const t = 1 - r.life / r.maxLife;
      const radius = r.maxRadius * (t * (2 - t)); // quadOut
      const alpha = (1 - t) * 0.8;
      this.gfx.lineStyle(r.lineWidth * (1 - t * 0.5), r.color, alpha);
      this.gfx.drawCircle(r.x, r.y, radius);
      this.gfx.lineStyle(r.lineWidth * 2 * (1 - t), r.color, alpha * 0.15);
      this.gfx.drawCircle(r.x, r.y, radius * 0.85);
    }
  }
  clear() { this.rings = []; this.gfx.clear(); }
}

// ── SPEED LINES (motion streaks during attack lunges) ──
class SpeedLineSystem {
  constructor(stage, w, h) {
    this.gfx = new PIXI.Graphics();
    this.gfx.zIndex = 90;
    stage.addChild(this.gfx);
    this.lines = []; this.w = w; this.h = h;
  }
  burst(cx, cy, angle, count = 12, life = 0.2) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * 1.2;
      const dist = 60 + Math.random() * 180;
      const len = 25 + Math.random() * 50;
      this.lines.push({
        x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist,
        angle: a, len, life, maxLife: life, width: 1 + Math.random() * 2,
      });
    }
  }
  update(dt) {
    this.gfx.clear();
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.life -= dt;
      if (l.life <= 0) { this.lines.splice(i, 1); continue; }
      const alpha = (l.life / l.maxLife) * 0.45;
      const dx = Math.cos(l.angle) * l.len;
      const dy = Math.sin(l.angle) * l.len;
      this.gfx.lineStyle(l.width, 0xffffff, alpha);
      this.gfx.moveTo(l.x, l.y);
      this.gfx.lineTo(l.x + dx, l.y + dy);
    }
  }
  clear() { this.lines = []; this.gfx.clear(); }
}

// ── AMBIENT SYSTEM (floating neon dust on the battlefield) ──
class AmbientSystem {
  constructor(stage, w, h) {
    this.gfx = new PIXI.Graphics();
    this.gfx.zIndex = 5;
    stage.addChild(this.gfx);
    this.motes = []; this.w = w; this.h = h;
    const colors = [0x00f0ff, 0xff00ff, 0xaa66ff, 0x66ff00, 0xff6600];
    for (let i = 0; i < 40; i++) {
      this.motes.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 8, vy: -3 - Math.random() * 5,
        size: 0.5 + Math.random() * 1.5, color: colors[i % colors.length],
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  update(dt, time) {
    this.gfx.clear();
    for (const m of this.motes) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.y < -10) { m.y = this.h + 10; m.x = Math.random() * this.w; }
      if (m.x < -10) m.x = this.w + 10;
      if (m.x > this.w + 10) m.x = -10;
      const flicker = 0.15 + Math.sin(time * 2 + m.phase) * 0.1;
      this.gfx.beginFill(m.color, flicker);
      this.gfx.drawCircle(m.x, m.y, m.size);
      this.gfx.endFill();
    }
  }
}

// ── AFTERIMAGE (ghost trail during unit movement) ──
class AfterimageSystem {
  constructor(stage) {
    this.gfx = new PIXI.Graphics();
    this.gfx.zIndex = 80;
    stage.addChild(this.gfx);
    this.images = [];
  }
  add(x, y, w, h, color, alpha = 0.3, life = 0.15) {
    this.images.push({ x, y, w, h, color, alpha, life, maxLife: life });
  }
  update(dt) {
    this.gfx.clear();
    for (let i = this.images.length - 1; i >= 0; i--) {
      const im = this.images[i];
      im.life -= dt;
      if (im.life <= 0) { this.images.splice(i, 1); continue; }
      const t = im.life / im.maxLife;
      this.gfx.beginFill(im.color, im.alpha * t * 0.5);
      this.gfx.drawRoundedRect(im.x - im.w / 2, im.y - im.h / 2, im.w, im.h, 8);
      this.gfx.endFill();
    }
  }
  clear() { this.images = []; this.gfx.clear(); }
}

// ── FACTION DEATH FX CONFIGS ──
const FACTION_DEATH_FX = {
  VIRUS:     { colors: [0xcc0044, 0xff0066, 0x00ff00], count: 24, spread: 180, gravity: 50, life: 0.8 },
  PHANTOM:   { colors: [0x8844cc, 0xaa66ff, 0x6622aa], count: 20, spread: 100, gravity: -30, life: 1.0 },
  CONSTRUCT: { colors: [0xbb8844, 0xff8800, 0xffcc00], count: 28, spread: 200, gravity: 350, life: 0.6 },
  SYNTH:     { colors: [0x00f0ff, 0x0088ff, 0xffffff], count: 22, spread: 160, gravity: 80, life: 0.7 },
  HACKER:    { colors: [0xff00ff, 0xff66ff, 0x8800ff], count: 22, spread: 140, gravity: 60, life: 0.7 },
  AUGMENTED: { colors: [0xff6600, 0xff8844, 0xffcc00], count: 24, spread: 170, gravity: 150, life: 0.6 },
  DRONE:     { colors: [0x66ff00, 0x00ff66, 0xaaff00], count: 20, spread: 130, gravity: 100, life: 0.7 },
  PSIONIC:   { colors: [0xaa66ff, 0xff66ff, 0x6600ff], count: 18, spread: 120, gravity: -20, life: 0.9 },
  NEUTRAL:   { colors: [0x999999, 0xcccccc, 0x666666], count: 16, spread: 120, gravity: 150, life: 0.5 },
};



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// UNIT SPRITE â€” A container representing one combat unit
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class UnitSprite {
  constructor(unit, stage, w, h, side) {
    this.unit = { ...unit };
    this.id = unit.id;
    this.side = side;
    this.dead = false;
    this.baseX = 0;
    this.baseY = 0;
    this.idlePhase = Math.random() * Math.PI * 2;
    this.fc = FACTIONS_DATA[unit.faction] || FACTIONS_DATA.NEUTRAL;

    // Container
    this.container = new PIXI.Container();
    this.container.sortableChildren = true;
    stage.addChild(this.container);

    const cardW = Math.min(130, w * 0.1);
    const cardH = cardW * 1.4;
    this.cardW = cardW;
    this.cardH = cardH;

    // Shadow under card
    this.shadow = new PIXI.Graphics();
    this.shadow.beginFill(0x000000, 0.3);
    this.shadow.drawEllipse(0, cardH * 0.55, cardW * 0.45, 8);
    this.shadow.endFill();
    this.shadow.zIndex = 0;
    this.container.addChild(this.shadow);

    // Card background
    this.card = new PIXI.Graphics();
    this._drawCard(1.0);
    this.card.zIndex = 1;
    this.container.addChild(this.card);

    // Unit art sprite
    this.art = PIXI.Sprite.from(artPath(unit.tn || unit.name, unit.faction));
    this.art.anchor.set(0.5, 0.5);
    this.art.width = cardW - 8;
    this.art.height = cardH * 0.55;
    this.art.y = -cardH * 0.12;
    this.art.zIndex = 2;
    this.container.addChild(this.art);

    // Faction color strip at top
    this.strip = new PIXI.Graphics();
    this.strip.beginFill(this.fc.color, 0.6);
    this.strip.drawRoundedRect(-cardW / 2, -cardH / 2, cardW, 3, 2);
    this.strip.endFill();
    this.strip.zIndex = 3;
    this.container.addChild(this.strip);

    // Name text
    this.nameTxt = new PIXI.Text(unit.name.length > 12 ? unit.name.slice(0, 11) + "â€¦" : unit.name, {
      fontFamily: "Orbitron, monospace", fontSize: 10, fontWeight: "700",
      fill: this.fc.hex, stroke: "#000000", strokeThickness: 2,
    });
    this.nameTxt.anchor.set(0.5, 0);
    this.nameTxt.y = cardH * 0.28;
    this.nameTxt.zIndex = 3;
    this.container.addChild(this.nameTxt);

    // Stats bar â€” split into colored ATK (red) and HP (green), positioned above HP bar
    this.atkTxt = new PIXI.Text(`${unit.atk}`, {
      fontFamily: "Orbitron, monospace", fontSize: 11, fontWeight: "900",
      fill: "#ff6644", stroke: "#000000", strokeThickness: 3,
    });
    this.atkTxt.anchor.set(1, 1);
    this.atkTxt.x = -4;
    this.atkTxt.y = cardH / 2 - 10;
    this.atkTxt.zIndex = 5;
    this.container.addChild(this.atkTxt);

    this.hpTxt = new PIXI.Text(`${unit.hp}`, {
      fontFamily: "Orbitron, monospace", fontSize: 11, fontWeight: "900",
      fill: "#44ff66", stroke: "#000000", strokeThickness: 3,
    });
    this.hpTxt.anchor.set(0, 1);
    this.hpTxt.x = 4;
    this.hpTxt.y = cardH / 2 - 10;
    this.hpTxt.zIndex = 5;
    this.container.addChild(this.hpTxt);

    // HP bar â€” flush to bottom of card
    this.hpBarBg = new PIXI.Graphics();
    this.hpBarBg.beginFill(0x111111, 0.8);
    this.hpBarBg.drawRoundedRect(-cardW / 2 + 4, cardH / 2 - 6, cardW - 8, 4, 2);
    this.hpBarBg.endFill();
    this.hpBarBg.zIndex = 5;
    this.container.addChild(this.hpBarBg);

    this.hpBar = new PIXI.Graphics();
    this.hpBar.zIndex = 4;
    this.container.addChild(this.hpBar);
    this._drawHpBar();

    // Shield bubble (conditional)
    this.shieldGfx = new PIXI.Graphics();
    this.shieldGfx.zIndex = 5;
    this.container.addChild(this.shieldGfx);
    this.shieldTxt = null;
    if (unit.shield > 0) this._drawShield();

    // Keyword icons (art sprites at top-right)
    this.kwIcons = new PIXI.Container();
    this.kwIcons.zIndex = 6;
    this.container.addChild(this.kwIcons);
    this._drawKwIcons();

    // Golden shimmer
    if (unit.golden) {
      this.goldenGfx = new PIXI.Graphics();
      this.goldenGfx.zIndex = 7;
      this.container.addChild(this.goldenGfx);
    }

    // Unit aura glow (pulsing faction-colored glow beneath unit)
    this.auraGfx = new PIXI.Graphics();
    this.auraGfx.zIndex = -1;
    this.container.addChild(this.auraGfx);

    // Firewall / Taunt border indicator
    if (unit.kw?.includes("firewall") || unit.kw?.includes("taunt")) {
      this._drawFirewallBorder();
    }
  }

  _drawCard(alpha = 1) {
    this.card.clear();
    this.card.beginFill(0x080c18, 0.92 * alpha);
    this.card.lineStyle(2, this.fc.color, 0.6 * alpha);
    this.card.drawRoundedRect(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, 10);
    this.card.endFill();
  }

  _drawHpBar() {
    this.hpBar.clear();
    const pct = Math.max(0, this.unit.hp / this.unit.maxHp);
    const barW = this.cardW - 8;
    const color = pct > 0.5 ? 0x44ff66 : pct > 0.25 ? 0xffaa00 : 0xff4444;
    this.hpBar.beginFill(color, 0.9);
    this.hpBar.drawRoundedRect(-this.cardW / 2 + 4, this.cardH / 2 - 6, barW * pct, 4, 2);
    this.hpBar.endFill();
    // Glow
    this.hpBar.beginFill(color, 0.2);
    this.hpBar.drawRoundedRect(-this.cardW / 2 + 4, this.cardH / 2 - 8, barW * pct, 8, 3);
    this.hpBar.endFill();
  }

  _drawShield() {
    this.shieldGfx.clear();
    if (this.unit.shield <= 0) {
      if (this.shieldTxt) this.shieldTxt.text = "";
      return;
    }
    const r = this.cardW * 0.52;
    // Hexagonal barrier
    const sides = 6;
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 / sides) * i - Math.PI / 2;
      points.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    // Inner glow fill
    this.shieldGfx.beginFill(0x6688ff, 0.06);
    this.shieldGfx.drawPolygon(points);
    this.shieldGfx.endFill();
    // Outer edge
    this.shieldGfx.lineStyle(2, 0x88aaff, 0.6);
    this.shieldGfx.drawPolygon(points);
    // Inner edge
    const r2 = r * 0.85;
    const points2 = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 / sides) * i - Math.PI / 2;
      points2.push(Math.cos(angle) * r2, Math.sin(angle) * r2);
    }
    this.shieldGfx.lineStyle(1, 0x6688ff, 0.25);
    this.shieldGfx.drawPolygon(points2);
    // Corner accents
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 / sides) * i - Math.PI / 2;
      const cx = Math.cos(angle) * r, cy = Math.sin(angle) * r;
      this.shieldGfx.lineStyle(0);
      this.shieldGfx.beginFill(0xaaccff, 0.5);
      this.shieldGfx.drawCircle(cx, cy, 2.5);
      this.shieldGfx.endFill();
    }
    // Shield value badge
    if (!this.shieldTxt) {
      this.shieldTxt = new PIXI.Text("", {
        fontFamily: "Orbitron, monospace", fontSize: 9, fontWeight: "900",
        fill: "#88bbff", stroke: "#000000", strokeThickness: 2,
      });
      this.shieldTxt.anchor.set(0.5);
      this.shieldTxt.y = -this.cardH / 2 - 10;
      this.shieldTxt.zIndex = 8;
      this.container.addChild(this.shieldTxt);
    }
    this.shieldTxt.text = `${this.unit.shield}`;
  }

  _drawKwIcons() {
    this.kwIcons.removeChildren();
    const kws = this.unit.kw || [];
    const iconSize = 14;
    const gap = 2;
    const padRight = 10;
    const padTop = 10;
    // Max icons that fit vertically inside card (leave room for name/stats)
    const maxSlots = Math.floor((this.cardH - 40) / (iconSize + gap));
    const visibleKws = kws.slice(0, maxSlots);
    
    visibleKws.forEach((k, idx) => {
      const sprite = PIXI.Sprite.from(`/art/keywords/kw_${k}.png`);
      sprite.anchor.set(0.5);
      sprite.width = iconSize;
      sprite.height = iconSize;
      // Stack vertically down the right edge, inside the card
      sprite.x = this.cardW / 2 - padRight;
      sprite.y = -this.cardH / 2 + padTop + idx * (iconSize + gap);
      this.kwIcons.addChild(sprite);
    });
    // Mod icon at bottom-left
    if (this.unit.mod) {
      const modId = typeof this.unit.mod === "object" ? this.unit.mod.id : this.unit.mod;
      const modSprite = PIXI.Sprite.from(`/art/mods/mod_${modId}.png`);
      modSprite.anchor.set(0.5);
      modSprite.width = 14;
      modSprite.height = 14;
      modSprite.x = -this.cardW / 2 + 12;
      modSprite.y = this.cardH / 2 - 14;
      this.kwIcons.addChild(modSprite);
    }
  }

  _drawFirewallBorder() {
    const isTaunt = this.unit.kw?.includes("taunt");
    const color = isTaunt ? 0xff8800 : 0x00f0ff;
    const fw = new PIXI.Graphics();
    fw.lineStyle(3, color, 0.6);
    fw.drawRoundedRect(-this.cardW / 2 - 2, -this.cardH / 2 - 2, this.cardW + 4, this.cardH + 4, 12);
    // Chevrons
    fw.beginFill(color, 0.5);
    fw.drawPolygon([-8, -this.cardH / 2 - 6, 0, -this.cardH / 2 - 12, 8, -this.cardH / 2 - 6]);
    fw.endFill();
    fw.beginFill(color, 0.5);
    fw.drawPolygon([-8, this.cardH / 2 + 6, 0, this.cardH / 2 + 12, 8, this.cardH / 2 + 6]);
    fw.endFill();
    fw.zIndex = 5;
    this.container.addChild(fw);
    this.fwBorder = fw;
  }

  setPosition(x, y) {
    this.baseX = x; this.baseY = y;
    this.container.x = x; this.container.y = y;
  }

  updateUnit(u) {
    this.unit = { ...u };
    this.atkTxt.text = `${u.atk}`;
    this.hpTxt.text = `${Math.max(0, u.hp)}`;
    // Flash HP red when damaged
    if (u.hp < this.unit.maxHp * 0.5) this.hpTxt.style.fill = u.hp <= 0 ? "#ff0000" : "#ffaa00";
    else this.hpTxt.style.fill = "#44ff66";
    this._drawHpBar();
    this._drawShield();
  }

  // Idle bob animation (called every frame)
  idleUpdate(time) {
    if (this.dead) return;
    const bob = Math.sin(time * 2 + this.idlePhase) * 3;
    this.container.y = this.baseY + bob;
    // Pulsing aura glow
    if (this.auraGfx) {
      this.auraGfx.clear();
      const pulse = 0.08 + Math.sin(time * 3 + this.idlePhase) * 0.04;
      const auraR = this.cardW * 0.6;
      this.auraGfx.beginFill(this.fc.color, pulse);
      this.auraGfx.drawEllipse(0, this.cardH * 0.3, auraR, auraR * 0.4);
      this.auraGfx.endFill();
      // Inner bright core
      this.auraGfx.beginFill(this.fc.color, pulse * 0.6);
      this.auraGfx.drawEllipse(0, this.cardH * 0.3, auraR * 0.5, auraR * 0.25);
      this.auraGfx.endFill();
    }
  }

  flashColor(color, duration = 0.15) {
    const original = this.card.tint;
    this.card.tint = color;
    setTimeout(() => { if (!this.dead) this.card.tint = 0xffffff; }, duration * 1000);
  }

  die() {
    this.dead = true;
    this.container.alpha = 0;
    this.container.visible = false;
  }

  destroy() {
    if (this.container.parent) this.container.parent.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BATTLE ARENA PIXI â€” React Component
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function BattleArenaPixi({ events, onComplete }) {
  // â”€â”€ TIERED SOUND SYSTEM â”€â”€
  // Tier 1: SFX (always play, can overlap, short clips from /sounds/sfx/)
  // Tier 2: Voice (key moments ONLY, cooldown enforced, from /sounds/announcer/)
  // SFX loads from /sounds/sfx/ â€” no root /sounds/ loading

  // SFX cache & player â€” loads from /sounds/sfx/, fire-and-forget
  const sfxCache = useRef({});
  const playSFX = (name, vol = 0.4) => {
    try {
      if (!sfxCache.current[name]) {
        sfxCache.current[name] = new Audio(`/sounds/sfx/${name}.mp3`);
        sfxCache.current[name].onerror = () => {};
      }
      const a = sfxCache.current[name].cloneNode();
      a.volume = Math.min(vol, 1);
      a.play().catch(() => {});
    } catch (e) {}
  };

  // Voice announcer â€” SINGLE CHANNEL, critical moments only
  // Uses custom deep announcer voice from generate-voices.cjs
  // Only plays for: fight start, victory, defeat, draw
  // Everything else = SFX only (no voice overlap)
  const voiceCooldown = useRef(0);
  const voiceAudio = useRef(null);
  const playVoice = (name, vol = 0.5) => {
    const now = Date.now();
    if (now - voiceCooldown.current < 2000) return;
    voiceCooldown.current = now;
    try {
      if (voiceAudio.current) { voiceAudio.current.pause(); voiceAudio.current = null; }
      const a = new Audio(`/sounds/announcer/${name}.mp3?v=2`);
      a.volume = Math.min(vol, 1);
      a.play().catch(() => {});
      voiceAudio.current = a;
      a.onended = () => { if (voiceAudio.current === a) voiceAudio.current = null; };
    } catch (e) {}
  };

  // Combined: play SFX always + voice only if important & cooldown allows
  const soundEvent = (sfxName, voiceName = null, sfxVol = 0.4, voiceVol = 0.5) => {
    if (sfxName) playSFX(sfxName, sfxVol);
    if (voiceName) playVoice(voiceName, voiceVol);
  };

  const containerRef = useRef(null);
  const appRef = useRef(null);
  const [announce, setAnnounce] = useState("");
  const [announceType, setAnnounceType] = useState("");
  const [result, setResult] = useState(null);
  const [combatLog, setCombatLog] = useState([]);
  const logRef = useRef(null);
  const eid = useRef(0);
  const stripEmoji = (s) => s ? s.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g,' ').trim() : s;
  const addLog = (msg, color) => setCombatLog(prev => [...prev.slice(-18), { msg: stripEmoji(msg), color, id: ++eid.current }]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [combatLog]);

  useEffect(() => {
    if (!events || events.length === 0 || !containerRef.current) return;

    // â”€â”€ CREATE PIXI APP â”€â”€
    const el = containerRef.current;
    const W = el.clientWidth || 900;
    const H = el.clientHeight || 600;

    let destroyed = false;
    let cleanupFn = null;

    // PIXI v7/v8 compatible boot
    const boot = async () => {
      const isV8 = typeof PIXI.Application.prototype.init === 'function';
      let app;
      if (isV8) {
        app = new PIXI.Application();
        await app.init({ width: W, height: H, background: 0x050810, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
      } else {
        app = new PIXI.Application({ width: W, height: H, backgroundColor: 0x050810, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
      }
      if (destroyed) { try { app.destroy(true); } catch(e) {} return; }

      const canvas = app.canvas || app.view;
      if (!canvas) { console.error("PIXI: no canvas element found"); return; }
      el.appendChild(canvas);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.borderRadius = "12px";
      appRef.current = app;

    const tweens = new TweenManager();
    const particles = new ParticleSystem(app.stage);
    const floatingTexts = [];

    // ── NEW VFX SYSTEMS ──
    const flashOverlay = new FlashOverlay(app.stage, W, H);
    const impactRings = new ImpactRingSystem(app.stage);
    const speedLines = new SpeedLineSystem(app.stage, W, H);
    const ambient = new AmbientSystem(app.stage, W, H);
    const afterimages = new AfterimageSystem(app.stage);

    // ── HIT FREEZE (brief pause on big hits) ──
    let hitFreezeTimer = 0; // when > 0, event processing pauses

    // ── KILL COUNTER (escalating effects) ──
    let killStreak = 0;
    let killStreakTimer = 0; // resets after 3s of no kills

    // ── TIME DILATION (slow-mo on kills) ──
    let timeDilation = 1.0; // 1.0 = normal, 0.3 = slow-mo
    let timeDilationTimer = 0;

    // â”€â”€ DRAW ARENA FLOOR â”€â”€
    const floor = new PIXI.Graphics();
    // Grid lines
    const gridColor = 0x00f0ff;
    const gridAlpha = 0.04;
    for (let x = 0; x < W; x += 60) {
      floor.lineStyle(1, gridColor, gridAlpha);
      floor.moveTo(x, 0); floor.lineTo(x, H);
    }
    for (let y = 0; y < H; y += 60) {
      floor.lineStyle(1, gridColor, gridAlpha);
      floor.moveTo(0, y); floor.lineTo(W, y);
    }
    // VS divider line
    floor.lineStyle(2, 0x00f0ff, 0.08);
    floor.moveTo(W * 0.05, H * 0.48);
    floor.lineTo(W * 0.95, H * 0.48);

    // Scanlines overlay
    for (let y = 0; y < H; y += 3) {
      floor.lineStyle(1, 0x000000, 0.06);
      floor.moveTo(0, y); floor.lineTo(W, y);
    }

    // Corner vignette gradients (darken edges)
    const vigR = Math.max(W, H) * 0.7;
    const corners = [[0,0],[W,0],[0,H],[W,H]];
    for (const [cx, cy] of corners) {
      floor.beginFill(0x000000, 0.15);
      floor.drawCircle(cx, cy, vigR * 0.3);
      floor.endFill();
    }

    // Edge glow lines (top = enemy red, bottom = player cyan)
    floor.lineStyle(2, 0xff4444, 0.06);
    floor.moveTo(0, 2); floor.lineTo(W, 2);
    floor.lineStyle(2, 0x00f0ff, 0.06);
    floor.moveTo(0, H - 2); floor.lineTo(W, H - 2);

    app.stage.addChild(floor);

    // Side labels
    const makeSideLabel = (text, y, color) => {
      const label = new PIXI.Text(text, {
        fontFamily: "Orbitron, monospace", fontSize: 12, fontWeight: "700",
        fill: color, letterSpacing: 3,
      });
      label.anchor.set(0.5);
      label.x = W / 2; label.y = y;
      label.alpha = 0.3;
      app.stage.addChild(label);
      return label;
    };
    makeSideLabel("â–¼  E N E M Y  â–¼", H * 0.02 + 8, "#ff4444");
    makeSideLabel("â–²  Y O U  â–²", H * 0.96 - 8, "#00f0ff");

    // â”€â”€ UNIT MANAGEMENT â”€â”€
    const pSprites = new Map();
    const eSprites = new Map();
    let time = 0;

    const positionUnits = (sprites, count, side, animate = false) => {
      const entries = [];
      for (const [id, s] of sprites) {
        if (!s.dead) entries.push(s);
      }
      const total = entries.length;
      if (total === 0) return;
      const rowY = side === "enemy" ? H * 0.2 : H * 0.72;
      const spacing = Math.min(W * 0.12, (W * 0.8) / (total + 1));
      const startX = W / 2 - (total - 1) * spacing / 2;
      entries.forEach((sprite, i) => {
        const x = startX + i * spacing;
        if (animate && (Math.abs(sprite.baseX - x) > 2 || Math.abs(sprite.baseY - rowY) > 2)) {
          // Smooth reposition when units shift after deaths/spawns
          sprite.baseX = x; sprite.baseY = rowY;
          tweens.add(sprite.container, { x, y: rowY }, 0.25, ease.quadOut);
        } else {
          sprite.setPosition(x, rowY);
        }
      });
    };

    const syncUnits = (unitData, spriteMap, side) => {
      const ids = new Set(unitData.map(u => u.id));
      // 1. Mark dead sprites AND remove from Map (critical: prevents ghost references)
      for (const [id, sprite] of spriteMap) {
        if (!ids.has(id)) {
          if (!sprite.dead) sprite.die();
          sprite.destroy();
          spriteMap.delete(id);
        }
      }
      // 2. Add new sprites / update existing
      unitData.forEach(u => {
        if (spriteMap.has(u.id)) {
          const existing = spriteMap.get(u.id);
          // Revive if was dead (e.g. Chrono Weaver resurrection)
          if (existing.dead) {
            existing.dead = false;
            existing.container.alpha = 1;
            existing.container.visible = true;
            existing.container.scale.set(1, 1);
          }
          existing.updateUnit(u);
        } else {
          const sprite = new UnitSprite(u, app.stage, W, H, side);
          spriteMap.set(u.id, sprite);
        }
      });
      // 3. Position all living sprites (animate to smooth board shifts)
      positionUnits(spriteMap, unitData.length, side, true);
    };

    // Only returns LIVING sprites — dead sprites are already removed from Maps
    const getSprite = (id) => {
      const s = pSprites.get(id) || eSprites.get(id);
      if (s && s.dead) return null;
      return s || null;
    };

    const getSpriteCenter = (id) => {
      const s = getSprite(id);
      if (!s || s.dead) return { x: W / 2, y: H / 2 };
      return { x: s.container.x, y: s.container.y };
    };

    // â”€â”€ TARGET LINE â”€â”€
    const targetLine = new PIXI.Graphics();
    targetLine.zIndex = 100;
    app.stage.addChild(targetLine);

    const drawTargetLine = (from, to, color = 0xff4444) => {
      targetLine.clear();
      const dx = to.x - from.x, dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / dist, ny = dy / dist;
      // Core beam
      targetLine.lineStyle(3, color, 0.7);
      targetLine.moveTo(from.x, from.y);
      targetLine.lineTo(to.x, to.y);
      // Outer glow
      targetLine.lineStyle(8, color, 0.15);
      targetLine.moveTo(from.x, from.y);
      targetLine.lineTo(to.x, to.y);
      // Arrow head at target
      const ax = to.x - nx * 14, ay = to.y - ny * 14;
      const px = -ny * 7, py = nx * 7;
      targetLine.lineStyle(0);
      targetLine.beginFill(color, 0.8);
      targetLine.moveTo(to.x, to.y);
      targetLine.lineTo(ax + px, ay + py);
      targetLine.lineTo(ax - px, ay - py);
      targetLine.closePath();
      targetLine.endFill();
      // Energy dots along beam
      const dotCount = Math.floor(dist / 20);
      for (let i = 0; i < dotCount; i++) {
        const t = (i + 0.5) / dotCount;
        const cx = from.x + dx * t, cy = from.y + dy * t;
        const jx = (Math.random() - 0.5) * 4, jy = (Math.random() - 0.5) * 4;
        targetLine.beginFill(0xffffff, 0.6);
        targetLine.drawCircle(cx + jx, cy + jy, 1.5);
        targetLine.endFill();
      }
    };
    const clearTargetLine = () => targetLine.clear();

    // â”€â”€ SCREEN SHAKE â”€â”€
    let shakeIntensity = 0;
    let shakeDuration = 0;
    let shakeAngle = 0;

    const screenShake = (intensity = 5, duration = 0.2, angle = null) => {
      shakeIntensity = Math.max(shakeIntensity, intensity);
      shakeDuration = Math.max(shakeDuration, duration);
      shakeAngle = angle !== null ? angle : Math.random() * Math.PI * 2;
    };

    const directionalShake = (fromX, fromY, toX, toY, intensity = 6, duration = 0.15) => {
      const angle = Math.atan2(toY - fromY, toX - fromX);
      screenShake(intensity, duration, angle);
    };

    // â”€â”€ EVENT QUEUE â”€â”€
    const eventQueue = [...events];
    let currentEvent = null;
    let eventTimer = 0;
    let eventDuration = 0;
    let processing = false;

    const processEvent = (evt) => {
      currentEvent = evt;
      processing = true;

      switch (evt.type) {
        case "start": {
          soundEvent("sfx-fight-start", "ann-fight", 0.5, 0.6);
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          // Entrance animation: units drop in from off-screen
          for (const [, s] of pSprites) {
            const targetY = s.baseY;
            s.container.y = H + 100;
            s.container.alpha = 0;
            tweens.add(s.container, { y: targetY, alpha: 1 }, 0.5, ease.backOut);
          }
          for (const [, s] of eSprites) {
            const targetY = s.baseY;
            s.container.y = -100;
            s.container.alpha = 0;
            tweens.add(s.container, { y: targetY, alpha: 1 }, 0.5, ease.backOut);
          }
          // Dramatic entrance flash
          flashOverlay.flash(0x00f0ff, 0.2, 0.3);
          screenShake(3, 0.3);
          eventDuration = 1000;
          break;
        }

        case "combo": {
          soundEvent("sfx-combo", null, 0.5, 0);
          setAnnounce(evt.name + " ACTIVATED!");
          setAnnounceType("combo");
          addLog(evt.name + "!", "#ffcc00");

          // Golden flash on all player units with staggered rings
          let comboDelay = 0;
          for (const [, s] of pSprites) {
            if (s.dead) continue;
            particles.emitRing(s.container.x, s.container.y, 0xffcc00, 35, 10, 0.5);
            impactRings.emit(s.container.x, s.container.y, 0xffcc00, 50, 0.4, 2);
            // Scale pulse
            tweens.add(s.container.scale, { x: 1.15, y: 1.15 }, 0.12, ease.quadOut, () => {
              tweens.add(s.container.scale, { x: 1, y: 1 }, 0.2, ease.elasticOut);
            });
          }
          // Golden flash overlay
          flashOverlay.flash(0xffcc00, 0.25, 0.15);
          screenShake(4, 0.15);

          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 900;
          setTimeout(() => { setAnnounce(""); }, 600);
          break;
        }

        case "hack": {
          playSFX("sfx-malware", 0.35);
          setAnnounce(evt.msg);
          setAnnounceType("hack");
          addLog(evt.msg, "#ff00ff");
          // Purple particles on debuffed side
          const targets = evt.side === "player" ? eSprites : pSprites;
          for (const [, s] of targets) {
            particles.emit(s.container.x, s.container.y, 0xff00ff, 8, 60, 0.5, 2, 0);
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 750;
          setTimeout(() => { setAnnounce(""); }, 500);
          break;
        }

        case "initprot": {
          playSFX("sfx-initprot", 0.3);
          setAnnounce(evt.msg);
          setAnnounceType("buff");
          addLog(evt.msg, "#00f0ff");
          const s = getSprite(evt.unitId);
          if (s) {
            particles.emitRing(s.container.x, s.container.y, 0x00f0ff, 40, 16, 0.5);
            tweens.add(s.container.scale, { x: 1.2, y: 1.2 }, 0.15, ease.quadOut, () => {
              tweens.add(s.container.scale, { x: 1, y: 1 }, 0.2, ease.elasticOut);
            });
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 600;
          setTimeout(() => { setAnnounce(""); }, 400);
          break;
        }

        case "innate_start": {
          playSFX("sfx-initprot", 0.25);
          setAnnounce(evt.msg);
          setAnnounceType("buff");
          addLog(evt.msg, "#ffcc00");
          const si = getSprite(evt.unitId);
          if (si) {
            particles.emitRing(si.container.x, si.container.y, 0xffcc00, 36, 14, 0.4);
            tweens.add(si.container.scale, { x: 1.2, y: 1.2 }, 0.15, ease.quadOut, () => {
              tweens.add(si.container.scale, { x: 1, y: 1 }, 0.2, ease.elasticOut);
            });
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 600;
          setTimeout(() => { setAnnounce(""); }, 400);
          break;
        }

        case "announce": {
          setAnnounce(evt.msg);
          setAnnounceType("stalemate");
          eventDuration = 1200;
          setTimeout(() => { setAnnounce(""); }, 900);
          break;
        }

        case "attack": {
          playSFX("atk-swoosh", 0.3);
          const atkSprite = getSprite(evt.attackerId);
          const tgtSprite = getSprite(evt.targetId);
          if (!atkSprite || !tgtSprite) {
            if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
            if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
            eventDuration = 100;
            break;
          }

          const atkPos = { x: atkSprite.container.x, y: atkSprite.container.y };
          const tgtPos = { x: tgtSprite.container.x, y: tgtSprite.container.y };
          const atkBase = { x: atkSprite.baseX, y: atkSprite.baseY };
          const dx = (tgtPos.x - atkPos.x) * 0.6;
          const dy = (tgtPos.y - atkPos.y) * 0.6;
          const fc = FACTIONS_DATA[evt.attackerFaction]?.color || 0xff4444;
          const hitAngle = Math.atan2(tgtPos.y - atkPos.y, tgtPos.x - atkPos.x);

          // Scale effects by damage (big hits feel different from pokes)
          const dmgRaw = evt.damage || 0;
          const isHeavy = dmgRaw >= 40;
          const isCrit = dmgRaw >= 70;

          drawTargetLine(atkPos, tgtPos, fc);

          // Phase 1: Wind up (pull back slightly)
          tweens.add(atkSprite.container, {
            x: atkBase.x - dx * 0.15,
            y: atkBase.y - dy * 0.15,
          }, 0.08, ease.quadIn, () => {
            if (atkSprite.dead) { clearTargetLine(); return; }

            // Afterimage trail during lunge
            afterimages.add(atkSprite.container.x, atkSprite.container.y,
              atkSprite.cardW, atkSprite.cardH, fc, 0.4, 0.2);

            // Phase 2: Lunge forward
            tweens.add(atkSprite.container, {
              x: atkBase.x + dx, y: atkBase.y + dy,
            }, 0.12, ease.quadOut, () => {
              clearTargetLine();
              if (atkSprite.dead && tgtSprite.dead) {
                if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
                if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
                return;
              }

              // ── IMPACT MOMENT ──

              // Flash overlay (scales with damage)
              if (isCrit) {
                flashOverlay.flash(fc, 0.4, 0.15);
                hitFreezeTimer = 0.06; // Brief freeze on crits
              } else if (isHeavy) {
                flashOverlay.flash(0xffffff, 0.2, 0.1);
              } else {
                flashOverlay.flash(0xffffff, 0.08, 0.06);
              }

              // Impact ring at hit point
              impactRings.emit(tgtPos.x, tgtPos.y, fc, isHeavy ? 80 : 50, 0.35, isHeavy ? 4 : 2);

              // Speed lines radiating from impact
              if (isHeavy) {
                speedLines.burst(tgtPos.x, tgtPos.y, hitAngle + Math.PI, isCrit ? 16 : 10, 0.25);
              }

              // Second afterimage at impact point
              afterimages.add(atkSprite.container.x, atkSprite.container.y,
                atkSprite.cardW, atkSprite.cardH, fc, 0.3, 0.15);

              // Directional shake (shakes toward the hit direction)
              directionalShake(atkPos.x, atkPos.y, tgtPos.x, tgtPos.y,
                isCrit ? 12 : isHeavy ? 8 : 5,
                isCrit ? 0.25 : 0.15);

              // Particles (more on heavy hits)
              const pCount = isCrit ? 24 : isHeavy ? 18 : 12;
              const pSpread = isCrit ? 180 : isHeavy ? 140 : 100;
              particles.emit(tgtPos.x, tgtPos.y, fc, pCount, pSpread, 0.5, isCrit ? 4 : 3, 150);

              // White sparks at impact point
              particles.emit(tgtPos.x, tgtPos.y, 0xffffff, isCrit ? 10 : 5, 80, 0.25, 1.5, 0);

              // Sound
              const dmgText = evt.malware ? "MALWARE" : `-${evt.damage - (evt.shieldAbsorbed || 0)}`;
              const dmgColor = evt.malware ? "#ff00ff" : evt.shieldAbsorbed > 0 ? "#6688ff" : "#ff4444";
              if (evt.malware) {
                soundEvent("sfx-malware", null, 0.5, 0);
              } else {
                playSFX("atk-impact", isCrit ? 0.5 : 0.3);
              }

              // Damage number (bigger font for bigger hits)
              const fontSize = isCrit ? 26 : isHeavy ? 22 : evt.malware ? 22 : 18;
              floatingTexts.push(new FloatingText(app.stage, tgtPos.x, tgtPos.y - 30, dmgText, dmgColor, fontSize));

              // Shield absorbed
              if (evt.shieldAbsorbed > 0) {
                floatingTexts.push(new FloatingText(app.stage, tgtPos.x + 20, tgtPos.y - 15, `SH:${evt.shieldAbsorbed}`, "#6688ff", 14));
                impactRings.emit(tgtPos.x, tgtPos.y, 0x6688ff, 40, 0.25, 2);
              }

              // Psychic Wall absorb
              if (evt.absorbInfo) {
                const tankSpr = getSprite(evt.absorbInfo.tankId);
                if (tankSpr && !tankSpr.dead) {
                  floatingTexts.push(new FloatingText(app.stage, tankSpr.container.x, tankSpr.container.y - 25, `ABSORB -${evt.absorbInfo.absorbed}`, "#aa66ff", 14));
                  tankSpr.flashColor(0xaa66ff, 0.2);
                  particles.emit(tankSpr.container.x, tankSpr.container.y, 0xaa66ff, 6, 40, 0.3, 2, 0);
                }
              }

              // Hive Mind share
              if (evt.hiveShareCount > 0) {
                floatingTexts.push(new FloatingText(app.stage, tgtPos.x - 20, tgtPos.y - 45, `HIVE SPLIT \u00d7${evt.hiveShareCount + 1}`, "#66ff00", 12));
              }

              // Ransomware gold
              if (evt.goldEarned > 0) {
                floatingTexts.push(new FloatingText(app.stage, atkPos.x, atkPos.y - 40, `+${evt.goldEarned}g`, "#ffcc00", 16));
              }

              // Counter damage
              if (evt.counterDmg > 0) {
                floatingTexts.push(new FloatingText(app.stage, atkPos.x, atkPos.y - 20, `-${evt.counterDmg - (evt.counterAbs || 0)}`, "#ff8844", 14));
                impactRings.emit(atkPos.x, atkPos.y, 0xff8844, 35, 0.2, 2);
              }

              // Target hit reaction
              if (!tgtSprite.dead) {
                tgtSprite.flashColor(0xff4444, 0.2);
                const squashX = isCrit ? 0.75 : 0.85;
                const squashY = isCrit ? 1.2 : 1.1;
                tweens.add(tgtSprite.container.scale, { x: squashX, y: squashY }, 0.06, ease.quadOut, () => {
                  if (!tgtSprite.dead) tweens.add(tgtSprite.container.scale, { x: 1, y: 1 }, 0.25, ease.elasticOut);
                });
              }

              // Return attacker
              if (!atkSprite.dead) {
                tweens.add(atkSprite.container, { x: atkBase.x, y: atkBase.y }, 0.25, ease.elasticOut);
              }

              if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
              if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");

              addLog(`${evt.attackerName} \u2192 ${evt.targetName} (-${evt.damage})`, FACTIONS_DATA[evt.attackerFaction]?.hex || "#ff4444");
            });
          });

          eventDuration = 900;
          break;
        }

        case "dodge": {
          playSFX("sfx-dodge", 0.4);
          const tgt = getSprite(evt.targetId);
          if (tgt) {
            const dodgeX = tgt.baseX + (Math.random() > 0.5 ? 40 : -40);
            // Quick slide sideways
            tweens.add(tgt.container, { x: dodgeX }, 0.1, ease.quadOut, () => {
              // Ghost trail
              particles.emitDirectional(tgt.container.x, tgt.container.y, 0x8844cc, Math.random() * Math.PI * 2, 6, 40, 0.3);
              // Snap back
              tweens.add(tgt.container, { x: tgt.baseX }, 0.2, ease.elasticOut);
            });
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 30, "MISS", "#aa66ff", 20));
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(evt.msg, "#aa66ff");
          eventDuration = 650;
          break;
        }

        case "hardshell": {
          playSFX("sfx-hardshell", 0.4);
          const tgt = getSprite(evt.targetId);
          if (tgt) {
            particles.emitRing(tgt.container.x, tgt.container.y, 0x6688ff, 45, 20, 0.6);
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 30, "BLOCKED", "#6688ff", 18));
            // Shield pop animation
            tweens.add(tgt.container.scale, { x: 1.15, y: 1.15 }, 0.1, ease.quadOut, () => {
              tweens.add(tgt.container.scale, { x: 1, y: 1 }, 0.2, ease.elasticOut);
            });
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(evt.msg, "#6688ff");
          eventDuration = 700;
          break;
        }

        case "cleave": {
          playSFX("sfx-cleave", 0.4);
          const tgt = getSprite(evt.targetId);
          if (tgt && !tgt.dead) {
            particles.emitDirectional(tgt.container.x, tgt.container.y, 0xff8800, Math.PI * 0.5, 8, 80, 0.4);
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 20, `-${evt.damage - (evt.shieldAbsorbed || 0)}`, "#ff8800", 16));
            tgt.flashColor(0xff8800, 0.2);
            screenShake(3, 0.1);
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(`Cleave: -${evt.damage}`, "#ff8800");
          eventDuration = 550;
          break;
        }

        case "splash": {
          playSFX("sfx-splash", 0.35);
          const tgt = getSprite(evt.targetId);
          if (tgt && !tgt.dead) {
            particles.emit(tgt.container.x, tgt.container.y, 0xffcc00, 6, 50, 0.3, 2, 0);
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x + (Math.random() - 0.5) * 30, tgt.container.y - 15, `-${evt.damage - (evt.shieldAbsorbed || 0)}`, "#ffcc00", 14));
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(`Splash: -${evt.damage}`, "#ffcc00");
          eventDuration = 450;
          break;
        }

        case "overflow": {
          playSFX("sfx-overflow", 0.4);
          const tgt = getSprite(evt.targetId);
          const atk = getSprite(evt.attackerId);
          if (tgt && atk) {
            // Virus tendrils from attacker to new target
            particles.emitDirectional(atk.container.x, atk.container.y, 0xcc0044, Math.atan2(tgt.container.y - atk.container.y, tgt.container.x - atk.container.x), 10, 150, 0.5);
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 20, `-${evt.damage}`, "#cc0044", 16));
            tgt.flashColor(0xcc0044, 0.2);
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(`Overflow: -${evt.damage}`, "#cc0044");
          eventDuration = 550;
          break;
        }

        case "execute_destroy": {
          soundEvent("sfx-execute", null, 0.5, 0);
          const victim = getSprite(evt.victimId);
          if (victim) {
            const vx = victim.container.x, vy = victim.container.y;
            const fc = FACTIONS_DATA[victim.unit.faction]?.color || 0xff0000;

            // Massive execution effects
            floatingTexts.push(new FloatingText(app.stage, vx, vy - 10, "EXECUTED", "#ff0000", 28));
            particles.emit(vx, vy, 0xff0000, 28, 180, 0.8, 5, 100);
            particles.emit(vx, vy, fc, 16, 120, 0.6, 3, 50);
            particles.emit(vx, vy, 0xffffff, 10, 60, 0.2, 2, 0);

            // Double impact ring
            impactRings.emit(vx, vy, 0xff0000, 100, 0.5, 5);
            impactRings.emit(vx, vy, 0xffffff, 60, 0.3, 3);

            // Full screen flash + heavy shake
            flashOverlay.flash(0xff0000, 0.45, 0.2);
            screenShake(14, 0.3);

            // Speed lines from execution point
            speedLines.burst(vx, vy, 0, 20, 0.3);

            // Hard freeze on execution
            hitFreezeTimer = 0.08;
            timeDilation = 0.25;
            timeDilationTimer = 0.3;
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(evt.msg, "#ff4444");
          eventDuration = 850;
          break;
        }

        case "thorns": {
          playSFX("sfx-shield-break", 0.35);
          const tgt = getSprite(evt.targetId);
          if (tgt) {
            particles.emit(tgt.container.x, tgt.container.y, 0xff8800, 8, 60, 0.4, 2, 50);
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 20, `-${evt.damage}`, "#ff8800", 14));
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(`Thorns: -${evt.damage}`, "#ff8800");
          eventDuration = 450;
          break;
        }

        case "death": {
          playSFX("sfx-death", 0.4);
          const sprite = getSprite(evt.unitId);
          if (sprite && !sprite.dead) {
            const faction = sprite.unit.faction || "NEUTRAL";
            const fc = FACTIONS_DATA[faction]?.color || 0xff4444;
            const deathFx = FACTION_DEATH_FX[faction] || FACTION_DEATH_FX.NEUTRAL;
            const dx = sprite.container.x, dy = sprite.container.y;

            // Faction-specific death explosion
            for (const color of deathFx.colors) {
              particles.emit(dx, dy, color,
                Math.floor(deathFx.count / deathFx.colors.length),
                deathFx.spread, deathFx.life,
                3 + Math.random() * 2, deathFx.gravity);
            }
            // White core flash
            particles.emit(dx, dy, 0xffffff, 8, 60, 0.2, 2, 0);

            // Flash overlay on death
            flashOverlay.flash(fc, 0.2, 0.1);

            // Impact ring at death position
            impactRings.emit(dx, dy, fc, 70, 0.4, 3);
            impactRings.emit(dx, dy, 0xffffff, 40, 0.25, 2);

            // Screen shake
            screenShake(7, 0.2);

            // Slow-mo on kill
            timeDilation = 0.35;
            timeDilationTimer = 0.2;

            // Kill streak
            killStreak++;
            killStreakTimer = 3.0;
            if (killStreak >= 3) {
              // Multi-kill: extra drama
              flashOverlay.flash(0xff0000, 0.35, 0.15);
              screenShake(12, 0.3);
              floatingTexts.push(new FloatingText(app.stage, W / 2, H * 0.45,
                killStreak >= 5 ? "RAMPAGE!" : killStreak >= 4 ? "MASSACRE!" : "MULTI-KILL!",
                "#ff4444", killStreak >= 5 ? 30 : 24));
            }

            // Death animation
            sprite.container.alpha = 0.6;
            tweens.add(sprite.container.scale, { x: 1.4, y: 0.4 }, 0.12, ease.quadOut);
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 700;
          break;
        }

        case "deadswitch": {
          soundEvent("sfx-deadswitch", null, 0.45, 0);
          const sprite = getSprite(evt.unitId);
          const pos = sprite ? { x: sprite.container.x, y: sprite.container.y } : { x: W / 2, y: H / 2 };

          // Purple explosion with expanding shockwave
          particles.emit(pos.x, pos.y, 0xaa66ff, 20, 150, 0.7, 3, 0);
          particles.emit(pos.x, pos.y, 0xff66ff, 10, 80, 0.4, 2, 0);
          particles.emit(pos.x, pos.y, 0xffffff, 6, 50, 0.2, 1.5, 0);

          // Double shockwave rings
          impactRings.emit(pos.x, pos.y, 0xaa66ff, 90, 0.5, 4);
          impactRings.emit(pos.x, pos.y, 0xff66ff, 60, 0.35, 2);

          // Flash + shake
          flashOverlay.flash(0xaa66ff, 0.3, 0.12);
          screenShake(8, 0.2);

          floatingTexts.push(new FloatingText(app.stage, pos.x, pos.y - 20, "DEADSWITCH", "#aa66ff", 20));

          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog((evt.msg || "Deadswitch!"), "#aa66ff");
          eventDuration = 750;
          break;
        }

        case "ds_hit": {
          // Deadswitch AoE per-target damage
          playSFX("sfx-splash", 0.3);
          const tgt = getSprite(evt.targetId);
          if (tgt) {
            particles.emit(tgt.container.x, tgt.container.y, 0xaa66ff, 6, 50, 0.3, 2, 0);
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x + (Math.random() - 0.5) * 20, tgt.container.y - 15, `-${evt.damage}`, "#cc66ff", 14));
            tgt.flashColor(0xaa66ff, 0.15);
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(`${evt.sourceName} DS: -${evt.damage} ${evt.targetName}${evt.killed ? " KILLED" : ""}`, "#aa66ff");
          eventDuration = 350;
          break;
        }

        case "ds_buff": {
          // Deadswitch AoE per-target buff
          playSFX("sfx-initprot", 0.25);
          const tgt = getSprite(evt.targetId);
          if (tgt) {
            particles.emitRing(tgt.container.x, tgt.container.y, 0x44ff66, 25, 8, 0.3);
            const buffText = evt.buff || "+buff";
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 20, buffText, "#44ff66", 14));
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(`${evt.sourceName} DS: ${evt.buff} ${evt.targetName}`, "#44ff66");
          eventDuration = 300;
          break;
        }

        case "ds_debuff": {
          // Deadswitch AoE per-target debuff
          playSFX("sfx-malware", 0.25);
          const tgt = getSprite(evt.targetId);
          if (tgt) {
            particles.emit(tgt.container.x, tgt.container.y, 0xff4444, 4, 30, 0.25, 2, 0);
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 20, `-${evt.amount} ${evt.stat.toUpperCase()}`, "#ff6644", 14));
            tgt.flashColor(0xff4444, 0.15);
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(`${evt.sourceName} DS: -${evt.amount} ${evt.stat} ${evt.targetName}`, "#ff6644");
          eventDuration = 300;
          break;
        }

        case "stun": {
          // Psionic stun — unit skips turn
          playSFX("sfx-shield-break", 0.3);
          const tgt = getSprite(evt.unitId);
          if (tgt) {
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 25, "STUNNED", "#ffcc00", 18));
            particles.emitRing(tgt.container.x, tgt.container.y, 0xffcc00, 30, 10, 0.3);
            // Shake in place
            tweens.add(tgt.container, { x: tgt.baseX + 8 }, 0.05, ease.linear, () => {
              tweens.add(tgt.container, { x: tgt.baseX - 8 }, 0.05, ease.linear, () => {
                tweens.add(tgt.container, { x: tgt.baseX }, 0.05, ease.linear);
              });
            });
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          addLog(evt.msg || "STUNNED!", "#ffcc00");
          eventDuration = 500;
          break;
        }

        case "result": {
          const sfxName = evt.playerWon ? "sfx-victory" : evt.draw ? "sfx-draw" : "sfx-defeat";
          const voiceName = evt.playerWon ? "ann-victory" : evt.draw ? "ann-draw" : "ann-defeat";
          soundEvent(sfxName, voiceName, 0.5, 0.6);

          // Victory/defeat flash
          const resultColor = evt.playerWon ? 0x44ff66 : evt.draw ? 0xffffff : 0xff4444;
          flashOverlay.flash(resultColor, 0.4, 0.3);
          screenShake(evt.playerWon ? 6 : 8, 0.3);

          // Particle celebration/despair
          if (evt.playerWon) {
            for (let i = 0; i < 5; i++) {
              setTimeout(() => {
                particles.emit(W * (0.2 + Math.random() * 0.6), H * (0.3 + Math.random() * 0.4),
                  [0x44ff66, 0xffcc00, 0x00f0ff][i % 3], 15, 200, 0.8, 3, -50);
              }, i * 150);
            }
          }

          // Show permanent gain indicators on surviving units
          if (evt.permanentGains && evt.permanentGains.length > 0) {
            evt.permanentGains.forEach(g => {
              const spr = getSprite(g.id);
              if (spr && !spr.dead) {
                const txt = `PERM ${g.atkGain > 0 ? '+' + g.atkGain + ' ATK' : ''}${g.hpGain > 0 ? ' +' + g.hpGain + ' HP' : ''}`;
                floatingTexts.push(new FloatingText(app.stage, spr.container.x, spr.container.y - 35, txt, "#ffcc00", 14));
                particles.emitRing(spr.container.x, spr.container.y, 0xffcc00, 35, 12, 0.5);
              }
            });
          }

          // Ransomware gold total
          if (evt.pGoldEarned > 0) {
            addLog(`💰 Ransomware: +${evt.pGoldEarned}g from kills!`, "#ffcc00");
          }

          // Virus bleed total
          if (evt.pVirusBleed > 0) {
            addLog(`🦠 Virus bleed: ${evt.pVirusBleed} damage to enemy!`, "#cc0044");
          }

          setResult(evt);
          eventDuration = 99999; // Stays until user closes
          break;
        }

        case "spawn": {
          playSFX("sfx-initprot", 0.3);
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          const spawned = getSprite(evt.unitId);
          if (spawned) {
            spawned.container.alpha = 0;
            spawned.container.scale.set(0.3, 0.3);
            tweens.add(spawned.container, { alpha: 1 }, 0.3, ease.quadOut);
            tweens.add(spawned.container.scale, { x: 1, y: 1 }, 0.4, ease.elasticOut);
            particles.emit(spawned.container.x, spawned.container.y, 0x44ff66, 10, 60, 0.4, 2, 0);
          }
          const sideLabel = evt.side === "player" ? "ALLY" : "ENEMY";
          addLog(`${sideLabel} ${evt.unitName} spawned! (${evt.source})`, evt.side === "player" ? "#44ff66" : "#ff6644");
          eventDuration = 450;
          break;
        }

        case "slowdown": {
          const tgt = getSprite(evt.unitId);
          if (tgt && !tgt.dead) {
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 25, "DDoS SLOWED", "#ff00ff", 14));
            tgt.flashColor(0xff00ff, 0.15);
            particles.emit(tgt.container.x, tgt.container.y, 0xff00ff, 4, 30, 0.2, 2, 0);
          }
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 350;
          break;
        }

        case "passives": {
          // Silent state sync — heals, infection ticks, etc. already applied
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 50; // Very fast, don't slow down combat
          break;
        }

        // ── NEW INNATE ABILITY EVENTS ──

        case "heal": {
          const tgt = getSprite(evt.unitId);
          if (tgt && !tgt.dead) {
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 30, `+${evt.amount} HP`, "#44ff66", 16));
            particles.emit(tgt.container.x, tgt.container.y, 0x44ff66, 6, 40, 0.3, 1.5, 0);
            tgt.flashColor(0x44ff66, 0.2);
          }
          addLog(`${evt.unitName} healed +${evt.amount} (${evt.source || "?"})`, "#44ff66");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 350;
          break;
        }

        case "scale": {
          const tgt = getSprite(evt.unitId);
          if (tgt && !tgt.dead) {
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 30, evt.msg || "SCALED", "#00f0ff", 14));
            particles.emitRing(tgt.container.x, tgt.container.y, 0x00f0ff, 25, 8, 0.3);
            tweens.add(tgt.container.scale, { x: 1.1, y: 1.1 }, 0.1, ease.quadOut, () => {
              tweens.add(tgt.container.scale, { x: 1, y: 1 }, 0.15, ease.quadOut);
            });
          }
          addLog(`${evt.unitName}: ${evt.msg || "scaled"}`, "#00f0ff");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 300;
          break;
        }

        case "survive": {
          playSFX("sfx-initprot", 0.4);
          const tgt = getSprite(evt.unitId);
          if (tgt && !tgt.dead) {
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 35, "SURVIVED!", "#ffcc00", 22));
            particles.emitRing(tgt.container.x, tgt.container.y, 0xffcc00, 45, 16, 0.5);
            impactRings.emit(tgt.container.x, tgt.container.y, 0xffcc00, 60, 0.5, 2);
            tgt.flashColor(0xffcc00, 0.3);
            screenShake(3, 0.15);
          }
          addLog(`${evt.unitName} SURVIVED! (${evt.source || "?"})`, "#ffcc00");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 600;
          break;
        }

        case "revive": {
          soundEvent("sfx-deadswitch", null, 0.5, 0);
          const tgt = getSprite(evt.unitId);
          if (tgt) {
            tgt.container.alpha = 0;
            tgt.container.scale.set(0.2, 0.2);
            tweens.add(tgt.container, { alpha: 1 }, 0.4, ease.quadOut);
            tweens.add(tgt.container.scale, { x: 1, y: 1 }, 0.5, ease.elasticOut);
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 35, "REVIVED!", "#44ff88", 24));
            particles.emitRing(tgt.container.x, tgt.container.y, 0x44ff88, 50, 20, 0.6);
            impactRings.emit(tgt.container.x, tgt.container.y, 0x44ff88, 70, 0.5, 2);
          }
          flashOverlay.flash(0x44ff88, 0.15, 0.1);
          screenShake(4, 0.2);
          setAnnounce(`${evt.unitName} REVIVED!`);
          setAnnounceType("buff");
          addLog(`${evt.unitName} REVIVED! (${evt.source || "?"})`, "#44ff88");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 800;
          setTimeout(() => { setAnnounce(""); }, 600);
          break;
        }

        case "infect": {
          playSFX("sfx-malware", 0.3);
          const tgt = getSprite(evt.targetId);
          if (tgt && !tgt.dead) {
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 25, "INFECTED!", "#cc0044", 16));
            particles.emit(tgt.container.x, tgt.container.y, 0xcc0044, 8, 40, 0.4, 2, 0);
            tgt.flashColor(0xcc0044, 0.25);
          }
          addLog(evt.msg || `${evt.attackerName} infected ${evt.targetName}`, "#cc0044");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 400;
          break;
        }

        case "infect_tick": {
          const tgt = getSprite(evt.unitId);
          if (tgt && !tgt.dead) {
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 20, `-${evt.damage}`, "#ff2266", 14));
            particles.emit(tgt.container.x, tgt.container.y, 0xff2266, 4, 25, 0.2, 1.5, 0);
            tgt.flashColor(0xff2266, 0.15);
          }
          addLog(`${evt.unitName} -${evt.damage} (infection)`, "#ff2266");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 250;
          break;
        }

        case "aoe_tick": {
          const src = getSprite(evt.unitId);
          if (src && !src.dead) {
            floatingTexts.push(new FloatingText(app.stage, src.container.x, src.container.y - 30, `AOE -${evt.damage}`, "#ff8800", 16));
            // Particles on all enemies
            const enemies = evt.side === "player" ? eSprites : pSprites;
            for (const [, s] of enemies) {
              if (s.dead) continue;
              particles.emit(s.container.x, s.container.y, 0xff8800, 3, 20, 0.2, 1, 0);
            }
          }
          addLog(`${evt.unitName} AOE: -${evt.damage} to ${evt.targets} enemies`, "#ff8800");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 350;
          break;
        }

        case "steal": {
          const atk = getSprite(evt.attackerId);
          const tgt = getSprite(evt.targetId);
          if (atk && !atk.dead) {
            floatingTexts.push(new FloatingText(app.stage, atk.container.x, atk.container.y - 30, `+${evt.amount} ${evt.stat}`, "#ff00ff", 14));
            particles.emit(atk.container.x, atk.container.y, 0xff00ff, 4, 30, 0.2, 1.5, 0);
          }
          if (tgt && !tgt.dead) {
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 20, `-${evt.amount} ${evt.stat}`, "#ff6644", 12));
            tgt.flashColor(0xff6644, 0.15);
          }
          addLog(`${evt.attackerName} stole ${evt.amount} ${evt.stat} from ${evt.targetName}`, "#ff00ff");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 350;
          break;
        }

        case "on_kill": {
          const killer = getSprite(evt.unitId);
          if (killer && !killer.dead) {
            floatingTexts.push(new FloatingText(app.stage, killer.container.x, killer.container.y - 35, evt.buffs || "KILL BONUS", "#ff4444", 16));
            particles.emitRing(killer.container.x, killer.container.y, 0xff4444, 30, 10, 0.3);
            tweens.add(killer.container.scale, { x: 1.15, y: 1.15 }, 0.1, ease.quadOut, () => {
              tweens.add(killer.container.scale, { x: 1, y: 1 }, 0.15, ease.elasticOut);
            });
          }
          addLog(`${evt.unitName}: ${evt.buffs || "kill bonus"}`, "#ff4444");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 400;
          break;
        }

        case "shield_regen": {
          const tgt = getSprite(evt.unitId);
          if (tgt && !tgt.dead) {
            floatingTexts.push(new FloatingText(app.stage, tgt.container.x, tgt.container.y - 25, `+${evt.amount} SH`, "#6688ff", 14));
            particles.emit(tgt.container.x, tgt.container.y, 0x6688ff, 4, 30, 0.2, 1, 0);
          }
          addLog(`${evt.unitName} +${evt.amount} shield`, "#6688ff");
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 250;
          break;
        }

        default: {
          if (evt.pBoard) syncUnits(evt.pBoard, pSprites, "player");
          if (evt.eBoard) syncUnits(evt.eBoard, eSprites, "enemy");
          eventDuration = 300;
        }
      }
    };

    // â”€â”€ MAIN LOOP â”€â”€
    app.ticker.add((delta) => {
      const dt = delta / 60; // Convert to seconds
      time += dt;

      // Hit freeze (pause processing briefly on big hits)
      if (hitFreezeTimer > 0) {
        hitFreezeTimer -= dt;
        // Still update particles/visuals during freeze for drama
        particles.update(dt * 0.3);
        flashOverlay.update(dt);
        impactRings.update(dt * 0.5);
        return; // Skip everything else during freeze
      }

      // Time dilation (slow-mo on kills)
      if (timeDilationTimer > 0) {
        timeDilationTimer -= dt;
        if (timeDilationTimer <= 0) timeDilation = 1.0;
      }
      const effectiveDt = dt * timeDilation;

      // Kill streak decay
      if (killStreakTimer > 0) {
        killStreakTimer -= dt;
        if (killStreakTimer <= 0) killStreak = 0;
      }

      // Update tweens
      tweens.update(effectiveDt);

      // Update all VFX systems
      particles.update(effectiveDt);
      flashOverlay.update(dt); // flash always runs at real speed
      impactRings.update(effectiveDt);
      speedLines.update(effectiveDt);
      ambient.update(dt, time); // ambient always real speed
      afterimages.update(effectiveDt);

      // Update floating texts
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        if (!floatingTexts[i].update(effectiveDt)) {
          floatingTexts[i].destroy();
          floatingTexts.splice(i, 1);
        }
      }

      // Directional screen shake
      if (shakeDuration > 0) {
        shakeDuration -= dt;
        const decay = shakeDuration > 0 ? 1 : 0;
        const jitter = shakeIntensity * decay;
        // Primarily shake along the hit direction with some perpendicular noise
        const mainX = Math.cos(shakeAngle) * jitter * (Math.random() * 0.5 + 0.5);
        const mainY = Math.sin(shakeAngle) * jitter * (Math.random() * 0.5 + 0.5);
        const noiseX = (Math.random() - 0.5) * jitter * 0.4;
        const noiseY = (Math.random() - 0.5) * jitter * 0.4;
        app.stage.x = mainX + noiseX;
        app.stage.y = mainY + noiseY;
      } else {
        app.stage.x = 0;
        app.stage.y = 0;
      }

      // Idle bob on all living units
      for (const [, s] of pSprites) s.idleUpdate(time);
      for (const [, s] of eSprites) s.idleUpdate(time);

      // Golden shimmer
      for (const [, s] of pSprites) {
        if (s.unit.golden && s.goldenGfx && !s.dead) {
          s.goldenGfx.clear();
          const shimX = Math.sin(time * 3) * s.cardW * 0.3;
          s.goldenGfx.beginFill(0xffcc00, 0.08 + Math.sin(time * 4) * 0.04);
          s.goldenGfx.drawRoundedRect(-s.cardW / 2 + shimX, -s.cardH / 2, s.cardW * 0.4, s.cardH, 10);
          s.goldenGfx.endFill();
        }
      }

      // Event queue processing
      if (processing) {
        eventTimer += effectiveDt * 1000; // ms (respects time dilation)
        if (eventTimer >= eventDuration) {
          processing = false;
          eventTimer = 0;
          currentEvent = null;
        }
      }

      if (!processing && eventQueue.length > 0) {
        const next = eventQueue.shift();
        eventTimer = 0;
        processEvent(next);
      }

      // All events done, no result = something wrong, auto-complete after 2s
      if (!processing && eventQueue.length === 0 && !result) {
        // Give some buffer time for final animations
      }
    });

    // Store cleanup for this boot instance
    cleanupFn = () => {
      tweens.clear();
      particles.clear();
      impactRings.clear();
      speedLines.clear();
      afterimages.clear();
      floatingTexts.forEach(ft => ft.destroy());
      for (const [, s] of pSprites) s.destroy();
      for (const [, s] of eSprites) s.destroy();
      try {
        const canvas = app.canvas || app.view;
        app.destroy(true, { children: true });
        if (canvas && el.contains(canvas)) el.removeChild(canvas);
      } catch(e) {}
      appRef.current = null;
    };

    }; // end boot()

    boot();

    return () => {
      destroyed = true;
      if (cleanupFn) cleanupFn();
    };
  }, [events]); // Only re-run when events change

  // â”€â”€ RENDER (Canvas + React overlays) â”€â”€
  return (
    <div className="ba-pixi-wrap" style={{
      position: "relative", width: "100%", height: "100vh",
      background: "#050810", overflow: "hidden",
    }}>
      {/* PixiJS Canvas */}
      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />

      {/* React Overlays â€” sit on top of canvas */}

      {/* Announce Banner */}
      {announce && (
        <div className={`ba-announce ba-announce-${announceType}`} style={{
          position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)",
          fontFamily: "'Orbitron', monospace", fontSize: "1.8rem", fontWeight: 900,
          color: announceType === "combo" ? "#ffcc00" : announceType === "hack" ? "#ff00ff" : "#00f0ff",
          textShadow: "0 0 30px currentColor, 0 0 60px currentColor",
          letterSpacing: "4px", textTransform: "uppercase",
          padding: "14px 36px", borderRadius: "12px",
          background: "rgba(5,8,16,0.8)", border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(8px)", zIndex: 200,
          animation: "ba-announce-in 0.4s cubic-bezier(0.34,1.56,0.64,1)",
          pointerEvents: "none",
        }}>
          {announce}
        </div>
      )}

      {/* Combat Log */}
      <div ref={logRef} style={{
        position: "absolute", top: "30%", right: "1.5%", width: "220px", maxHeight: "240px",
        overflowY: "auto", background: "rgba(0,0,0,0.55)", borderRadius: "8px",
        border: "1px solid rgba(0,240,255,0.06)", backdropFilter: "blur(6px)",
        padding: "8px 10px", zIndex: 150, pointerEvents: "auto",
      }}>
        <div style={{
          fontFamily: "'Orbitron', monospace", fontSize: "0.6rem", fontWeight: 700,
          color: "#00f0ff", letterSpacing: "2px", textTransform: "uppercase",
          borderBottom: "1px solid rgba(0,240,255,0.1)", paddingBottom: "4px", marginBottom: "4px",
        }}>COMBAT LOG</div>
        {combatLog.map(l => (
          <div key={l.id} style={{
            fontSize: "0.65rem", color: l.color || "#ddd", padding: "2px 0",
            fontFamily: "monospace", opacity: 0.9, lineHeight: 1.35,
          }}>{l.msg}</div>
        ))}
      </div>

      {/* Result Overlay */}
      {result && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.6)", zIndex: 300, backdropFilter: "blur(4px)",
        }}>
          <div style={{
            textAlign: "center", padding: "36px 52px", borderRadius: "18px",
            background: result.playerWon ? "rgba(0,60,30,0.85)" : result.draw ? "rgba(40,40,40,0.85)" : "rgba(60,0,0,0.85)",
            border: `2px solid ${result.playerWon ? "rgba(68,255,102,0.4)" : result.draw ? "rgba(255,255,255,0.15)" : "rgba(255,68,68,0.4)"}`,
            boxShadow: `0 0 60px ${result.playerWon ? "rgba(68,255,102,0.15)" : "rgba(255,68,68,0.15)"}`,
            animation: "ba-announce-in 0.4s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            <div style={{
              fontFamily: "'Orbitron', monospace", fontSize: "2.4rem", fontWeight: 900,
              color: result.playerWon ? "#44ff66" : result.draw ? "#aaaaaa" : "#ff4444",
              letterSpacing: "5px", textShadow: "0 0 30px currentColor",
              textTransform: "uppercase",
            }}>
              {result.playerWon ? "VICTORY" : result.draw ? "DRAW" : "DEFEAT"}
            </div>
            {!result.draw && (
              <div style={{
                fontFamily: "'Orbitron', monospace", fontSize: "0.95rem", fontWeight: 700,
                color: result.playerWon ? "rgba(68,255,102,0.7)" : "rgba(255,68,68,0.7)",
                marginTop: "10px",
              }}>
                {result.playerWon ? `Deal ${result.dmgToLoser} damage!` : `Take ${result.dmgToLoser} damage!`}
              </div>
            )}
            <button onClick={() => onComplete(result)} style={{
              marginTop: "20px", fontFamily: "'Orbitron', monospace", fontSize: "0.9rem",
              fontWeight: 800, color: "#00f0ff", background: "rgba(0,240,255,0.08)",
              border: "1px solid rgba(0,240,255,0.3)", borderRadius: "8px",
              padding: "10px 30px", cursor: "pointer", letterSpacing: "2px",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => { e.target.style.background = "rgba(0,240,255,0.15)"; e.target.style.boxShadow = "0 0 20px rgba(0,240,255,0.2)"; }}
            onMouseOut={(e) => { e.target.style.background = "rgba(0,240,255,0.08)"; e.target.style.boxShadow = "none"; }}
            >
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
