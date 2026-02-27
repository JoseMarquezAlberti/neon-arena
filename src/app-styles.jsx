export const styles = `
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
