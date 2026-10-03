/* ============================================================
   SPEED DASH — plataforma 2D veloz em Vanilla JS + Canvas
   Seções: Audio | Input | Level | Player | Enemy | Collectible
            Particle | Camera | Collision | GameState | Render | Loop
   ============================================================ */
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 960, H = 540;

/* ============================ AUDIO ============================ */
const AudioSys = {
  ctx: null, muted: false, windGain: null, windFilter: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // vento contínuo (ruído filtrado), ganho controlado pela velocidade
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 600; this.windFilter.Q.value = 0.6;
      this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0;
      src.connect(this.windFilter).connect(this.windGain).connect(this.ctx.destination);
      src.start();
    } catch (e) { /* sem áudio */ }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, dur, type = 'square', vol = 0.15, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  jump()   { this.tone(300, 0.16, 'square', 0.12, 620); },
  spring() { this.tone(180, 0.3, 'square', 0.14, 900); },
  collect(){ this.tone(880, 0.09, 'sine', 0.16); this.tone(1320, 0.12, 'sine', 0.14, null, 0.07); },
  hurt()   { this.tone(220, 0.25, 'sawtooth', 0.18, 70); },
  stomp()  { this.tone(500, 0.12, 'square', 0.16, 120); },
  checkpoint() { this.tone(520, 0.12, 'triangle', 0.16); this.tone(780, 0.18, 'triangle', 0.16, null, 0.1); },
  dash()   { this.tone(200, 0.2, 'sawtooth', 0.1, 800); },
  win()    { [523,659,784,1046,784,1046].forEach((f,i)=>this.tone(f,0.18,'triangle',0.16,null,i*0.11)); },
  lose()   { [400,300,220,140].forEach((f,i)=>this.tone(f,0.22,'sawtooth',0.14,null,i*0.14)); },
  setWind(speed01) {
    if (!this.ctx || !this.windGain || this.muted) { if (this.windGain) this.windGain.gain.value = 0; return; }
    const target = Math.max(0, (speed01 - 0.45)) * 0.22;
    this.windGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
    this.windFilter.frequency.setTargetAtTime(400 + speed01 * 1200, this.ctx.currentTime, 0.2);
  },
  toggle() {
    this.muted = !this.muted;
    document.getElementById('btn-sound').textContent = this.muted ? '🔇' : '🔊';
    if (this.muted && this.windGain) this.windGain.gain.value = 0;
    return this.muted;
  }
};

/* ============================ INPUT ============================ */
const Input = {
  left:false, right:false, down:false, jump:false, jumpPressed:false, dash:false,
  jumpBuffer:0,
  init() {
    const down = (e) => {
      if (['ArrowLeft','ArrowRight','ArrowDown','Space'].includes(e.code)) e.preventDefault();
      AudioSys.init(); AudioSys.resume();
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this.left = true; break;
        case 'ArrowRight': case 'KeyD': this.right = true; break;
        case 'ArrowDown': case 'KeyS': this.down = true; break;
        case 'Space': case 'ArrowUp': case 'KeyW':
          if (!this.jump) this.jumpPressed = true;
          this.jump = true; this.jumpBuffer = 0.14; break;
        case 'ShiftLeft': case 'ShiftRight': this.dash = true; break;
        case 'KeyP': Game.togglePause(); break;
        case 'KeyM': AudioSys.toggle(); break;
        case 'KeyR': Game.restart(); break;
        case 'Enter':
          if (!document.getElementById('screen-start').classList.contains('hidden')) Game.start();
          else if (!document.getElementById('screen-gameover').classList.contains('hidden')) Game.restart();
          else if (!document.getElementById('screen-win').classList.contains('hidden')) Game.nextLevel();
          break;
      }
    };
    const up = (e) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this.left = false; break;
        case 'ArrowRight': case 'KeyD': this.right = false; break;
        case 'ArrowDown': case 'KeyS': this.down = false; break;
        case 'Space': case 'ArrowUp': case 'KeyW': this.jump = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.dash = false; break;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    // touch
    const bind = (id, on, off) => {
      const el = document.getElementById(id);
      const s = (e) => { e.preventDefault(); AudioSys.init(); AudioSys.resume(); on(); };
      const x = (e) => { e.preventDefault(); off(); };
      el.addEventListener('touchstart', s, {passive:false});
      el.addEventListener('touchend', x, {passive:false});
      el.addEventListener('touchcancel', x, {passive:false});
      el.addEventListener('mousedown', s); el.addEventListener('mouseup', x); el.addEventListener('mouseleave', x);
    };
    bind('t-left',  () => this.left = true,  () => this.left = false);
    bind('t-right', () => this.right = true, () => this.right = false);
    bind('t-jump',  () => { this.jump = true; this.jumpPressed = true; this.jumpBuffer = 0.14; }, () => this.jump = false);
    bind('t-dash',  () => this.dash = true,  () => this.dash = false);
  },
  postUpdate(dt) {
    this.jumpPressed = false;
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
  }
};

/* ============================ LEVEL ============================ */
// Estrutura preparada para múltiplas fases: LEVELS[i] = builder
const LEVELS = [];
function buildLevel1() {
  return {
    name: 'Fase 1 — Colinas Turbo',
    width: 6500, spawn: { x: 60, y: 340 },
    solids: [
      {x:0,y:460,w:800,h:100},{x:880,y:460,w:820,h:100},{x:1780,y:460,w:600,h:100},
      {x:2460,y:460,w:700,h:100},{x:3240,y:460,w:600,h:100},{x:3920,y:460,w:800,h:100},
      {x:4800,y:460,w:1700,h:100},
      {x:350,y:360,w:140,h:20},{x:550,y:280,w:140,h:20},
      {x:950,y:350,w:150,h:20},{x:1200,y:270,w:150,h:20},{x:1450,y:350,w:120,h:20},
      {x:1850,y:350,w:140,h:20},{x:2050,y:270,w:140,h:20},
      {x:2550,y:350,w:160,h:20},{x:2800,y:270,w:160,h:20},
      {x:3300,y:340,w:140,h:20},{x:3500,y:260,w:140,h:20},{x:3700,y:340,w:120,h:20},
      {x:4000,y:340,w:140,h:20},{x:4250,y:260,w:140,h:20},{x:4500,y:340,w:120,h:20},
      {x:4900,y:350,w:150,h:20},{x:5150,y:270,w:150,h:20},{x:5400,y:350,w:150,h:20},
      {x:5650,y:270,w:150,h:20},{x:5900,y:350,w:150,h:20},
    ],
    slopes: [
      {x:600,y:400,w:150,h:60,dir:'desc'},
      {x:1000,y:400,w:150,h:60,dir:'asc'},
      {x:2000,y:400,w:160,h:60,dir:'desc'},
      {x:2600,y:400,w:160,h:60,dir:'asc'},
      {x:4100,y:400,w:170,h:60,dir:'desc'},
      {x:5000,y:400,w:170,h:60,dir:'asc'},
    ],
    movers: [
      {x:4720,y:380,w:120,h:20,axis:'x',range:70,speed:1.4,ox:4720,oy:380,t:0,dx:0,dy:0},
      {x:3150,y:350,w:120,h:20,axis:'y',range:100,speed:1.1,ox:3150,oy:350,t:1,dx:0,dy:0},
      {x:2385,y:380,w:100,h:20,axis:'y',range:60,speed:1.6,ox:2385,oy:380,t:2,dx:0,dy:0},
    ],
    springs: [
      {x:745,y:428,w:34,h:32,power:15.5,anim:0},
      {x:2330,y:428,w:34,h:32,power:16.5,anim:0},
      {x:3790,y:428,w:34,h:32,power:16.5,anim:0},
      {x:4660,y:428,w:34,h:32,power:14.5,anim:0},
    ],
    spikes: [
      {x:1300,y:440,w:60,h:20},{x:2200,y:440,w:60,h:20},
      {x:3000,y:440,w:80,h:20},{x:4400,y:440,w:80,h:20},
      {x:5300,y:440,w:80,h:20},{x:6000,y:440,w:100,h:20},
    ],
    crystals: [
      {x:380,y:320},{x:420,y:320},{x:580,y:240},{x:620,y:240},
      {x:660,y:420},{x:700,y:420},
      {x:980,y:310},{x:1230,y:230},{x:1480,y:310},
      {x:1880,y:310},{x:2080,y:230},{x:2120,y:230},
      {x:2580,y:310},{x:2830,y:230},{x:2870,y:230},
      {x:3330,y:300},{x:3530,y:220},{x:3730,y:300},
      {x:4030,y:300},{x:4280,y:220},{x:4530,y:300},
      {x:4930,y:310},{x:5180,y:230},{x:5430,y:310},{x:5680,y:230},{x:5930,y:310},
      {x:3350,y:420},{x:4150,y:420},{x:5050,y:420},{x:5600,y:420},{x:6150,y:400},
    ].map(c => ({...c, taken:false, t:Math.random()*6, collectAnim:0})),
    checkpoints: [
      {x:1650,y:360,w:14,h:100,active:false},
      {x:3240,y:360,w:14,h:100,active:false},
      {x:4800,y:360,w:14,h:100,active:false},
    ],
    finish: { x: 6360, y: 260, w: 30, h: 200 },
    enemies: [
      {type:'patrol', x:1050,y:416,w:32,h:30, minX:950,maxX:1250, vx:1.2, dir:1, alive:true, t:0},
      {type:'patrol', x:1900,y:416,w:32,h:30, minX:1820,maxX:2150, vx:1.6, dir:-1, alive:true, t:0},
      {type:'guard',  x:2700,y:406,w:36,h:54, alive:true, t:0},
      {type:'fly',    x:3200,y:280,w:30,h:28, baseY:280, range:80, speed:2, alive:true, t:1},
      {type:'patrol', x:4050,y:416,w:32,h:30, minX:3960,maxX:4350, vx:1.8, dir:1, alive:true, t:0},
      {type:'fly',    x:5050,y:280,w:30,h:28, baseY:280, range:90, speed:2.2, alive:true, t:3},
      {type:'patrol', x:5500,y:416,w:32,h:30, minX:5350,maxX:5750, vx:2.0, dir:-1, alive:true, t:0},
      {type:'guard',  x:6100,y:406,w:36,h:54, alive:true, t:0},
    ],
    trees: [120,300,520,700,1000,1180,1400,1600,1900,2300,2500,2900,3100,3450,3650,3950,4200,4450,4650,4950,5200,5450,5700,5950,6200,6400],
  };
}
LEVELS.push(buildLevel1);
function buildLevel2() {
  return {
    name: 'Fase 2 — Desfiladeiro do Pôr do Sol',
    width: 7000, spawn: { x: 60, y: 340 },
    theme: {
      sky: ['#2c1e4f', '#c94b6d', '#ffb36b'], sun: '#ffe9a8',
      glow: 'rgba(255,220,150,0.45)', cloud: 'rgba(255,235,220,0.9)',
      far: '#7a5a8c', near: '#4f6b4a', grass: '#8fd45e',
      trunk: '#5a3a20', canopy: '#2f7d3a', canopy2: '#46a04e', stars: false,
    },
    solids: [
      {x:0,y:460,w:700,h:100},{x:800,y:460,w:700,h:100},{x:1650,y:460,w:650,h:100},
      {x:2450,y:460,w:750,h:100},{x:3450,y:460,w:750,h:100},{x:4320,y:460,w:680,h:100},
      {x:5200,y:460,w:800,h:100},{x:6120,y:460,w:880,h:100},
      {x:2700,y:400,w:90,h:60},{x:2790,y:340,w:90,h:120},
      {x:300,y:360,w:140,h:20},{x:480,y:280,w:140,h:20},{x:700,y:350,w:100,h:20},
      {x:900,y:350,w:150,h:20},{x:1100,y:270,w:150,h:20},{x:1300,y:350,w:120,h:20},
      {x:1520,y:350,w:110,h:20},
      {x:1750,y:350,w:150,h:20},{x:1950,y:270,w:150,h:20},{x:2150,y:350,w:120,h:20},
      {x:2900,y:280,w:140,h:20},{x:3100,y:280,w:140,h:20},
      {x:3550,y:350,w:150,h:20},{x:3750,y:270,w:150,h:20},{x:3950,y:350,w:120,h:20},
      {x:4210,y:350,w:100,h:20},
      {x:4400,y:350,w:150,h:20},{x:4600,y:270,w:150,h:20},{x:4800,y:350,w:120,h:20},
      {x:5150,y:270,w:150,h:20},{x:5400,y:270,w:150,h:20},{x:5650,y:270,w:150,h:20},{x:5850,y:350,w:120,h:20},
      {x:6200,y:350,w:150,h:20},{x:6450,y:270,w:150,h:20},{x:6650,y:350,w:150,h:20},
    ],
    slopes: [
      {x:400,y:400,w:150,h:60,dir:'desc'},{x:950,y:400,w:150,h:60,dir:'asc'},
      {x:1800,y:400,w:160,h:60,dir:'desc'},{x:2500,y:400,w:160,h:60,dir:'asc'},
      {x:3600,y:400,w:170,h:60,dir:'desc'},{x:4450,y:400,w:170,h:60,dir:'asc'},
      {x:5350,y:400,w:170,h:60,dir:'desc'},{x:6250,y:400,w:150,h:60,dir:'asc'},
    ],
    movers: [
      {x:3325,y:380,w:120,h:20,axis:'x',range:120,speed:1.3,ox:3325,oy:380,t:0,dx:0,dy:0},
      {x:5300,y:350,w:120,h:20,axis:'y',range:90,speed:1.2,ox:5300,oy:350,t:1,dx:0,dy:0},
      {x:5100,y:380,w:120,h:20,axis:'x',range:90,speed:1.5,ox:5100,oy:380,t:2,dx:0,dy:0},
    ],
    springs: [
      {x:645,y:428,w:34,h:32,power:15.5,anim:0},
      {x:2245,y:428,w:34,h:32,power:15.5,anim:0},
      {x:4945,y:428,w:34,h:32,power:16.5,anim:0},
      {x:5945,y:428,w:34,h:32,power:15.5,anim:0},
    ],
    spikes: [
      {x:1200,y:440,w:60,h:20},{x:2000,y:440,w:60,h:20},
      {x:2900,y:440,w:80,h:20},{x:3800,y:440,w:80,h:20},
      {x:4650,y:440,w:80,h:20},{x:5600,y:440,w:80,h:20},{x:6550,y:440,w:100,h:20},
    ],
    crystals: [
      {x:350,y:320},{x:520,y:240},{x:750,y:300},
      {x:950,y:310},{x:1130,y:230},{x:1330,y:310},{x:1570,y:300},
      {x:1780,y:310},{x:1980,y:230},{x:2180,y:310},
      {x:2740,y:360},{x:2830,y:300},{x:2930,y:240},{x:3130,y:240},
      {x:3600,y:310},{x:3780,y:230},{x:3980,y:310},{x:4260,y:300},
      {x:4430,y:310},{x:4630,y:230},{x:4830,y:310},
      {x:5200,y:310},{x:5450,y:230},{x:5700,y:230},{x:5880,y:310},
      {x:6230,y:310},{x:6480,y:230},{x:6680,y:310},{x:6800,y:400},
    ].map(c => ({...c, taken:false, t:Math.random()*6, collectAnim:0})),
    checkpoints: [
      {x:1670,y:360,w:14,h:100,active:false},
      {x:3470,y:360,w:14,h:100,active:false},
      {x:5220,y:360,w:14,h:100,active:false},
    ],
    finish: { x: 6860, y: 260, w: 30, h: 200 },
    enemies: [
      {type:'patrol', x:1050,y:416,w:32,h:30, minX:950,maxX:1250, vx:1.4, dir:1, alive:true, t:0},
      {type:'patrol', x:1750,y:416,w:32,h:30, minX:1700,maxX:2050, vx:1.6, dir:-1, alive:true, t:0},
      {type:'patrol', x:2500,y:416,w:32,h:30, minX:2480,maxX:2680, vx:1.5, dir:1, alive:true, t:0},
      {type:'guard',  x:3100,y:406,w:36,h:54, alive:true, t:0},
      {type:'fly',    x:1575,y:300,w:30,h:28, baseY:300, range:70, speed:2, alive:true, t:1},
      {type:'fly',    x:3325,y:280,w:30,h:28, baseY:280, range:80, speed:2.2, alive:true, t:2},
      {type:'patrol', x:3600,y:416,w:32,h:30, minX:3500,maxX:3900, vx:1.8, dir:1, alive:true, t:0},
      {type:'patrol', x:4450,y:416,w:32,h:30, minX:4350,maxX:4750, vx:1.8, dir:-1, alive:true, t:0},
      {type:'fly',    x:5100,y:280,w:30,h:28, baseY:280, range:90, speed:2.4, alive:true, t:0},
      {type:'guard',  x:5850,y:406,w:36,h:54, alive:true, t:0},
      {type:'patrol', x:6300,y:416,w:32,h:30, minX:6150,maxX:6600, vx:2.0, dir:-1, alive:true, t:0},
    ],
    trees: [100,280,450,650,900,1100,1350,1700,1950,2200,2500,2750,3000,3500,3750,4000,4400,4650,4900,5250,5500,5750,6200,6450,6700,6900],
  };
}
LEVELS.push(buildLevel2);
function buildLevel3() {
  return {
    name: 'Fase 3 — Caverna Neon',
    width: 7500, spawn: { x: 60, y: 340 },
    theme: {
      sky: ['#050514', '#141a3a', '#2b3a67'], sun: '#e8ecff',
      glow: 'rgba(200,210,255,0.25)', cloud: 'rgba(120,130,180,0.5)',
      far: '#2c3560', near: '#1d2b45', grass: '#3fae7a',
      trunk: '#2a1f3d', canopy: '#1f7a5c', canopy2: '#2fbf8f', stars: true,
    },
    solids: [
      {x:0,y:460,w:600,h:100},{x:720,y:460,w:630,h:100},{x:1470,y:460,w:730,h:100},
      {x:2600,y:460,w:700,h:100},{x:3480,y:460,w:720,h:100},
      {x:4250,y:380,w:200,h:80},{x:4600,y:460,w:700,h:100},
      {x:5480,y:460,w:720,h:100},{x:6350,y:460,w:1150,h:100},
      {x:2250,y:400,w:100,h:60},{x:2350,y:340,w:100,h:120},
      {x:250,y:360,w:140,h:20},{x:420,y:280,w:140,h:20},
      {x:800,y:350,w:150,h:20},{x:1000,y:270,w:150,h:20},{x:1200,y:350,w:120,h:20},
      {x:1550,y:270,w:150,h:20},{x:1800,y:270,w:150,h:20},{x:2000,y:270,w:140,h:20},
      {x:2300,y:300,w:120,h:20},
      {x:2700,y:350,w:150,h:20},{x:2900,y:270,w:150,h:20},{x:3100,y:350,w:120,h:20},
      {x:3330,y:350,w:100,h:20},
      {x:3550,y:350,w:150,h:20},{x:3750,y:270,w:150,h:20},{x:3950,y:350,w:120,h:20},
      {x:4700,y:350,w:150,h:20},{x:4900,y:270,w:150,h:20},{x:5100,y:350,w:120,h:20},
      {x:5550,y:350,w:150,h:20},{x:5750,y:270,w:150,h:20},{x:5950,y:350,w:120,h:20},
      {x:6270,y:340,w:100,h:20},
      {x:6450,y:350,w:150,h:20},{x:6500,y:280,w:140,h:20},{x:6700,y:220,w:140,h:20},
      {x:6950,y:220,w:140,h:20},{x:7150,y:300,w:140,h:20},
    ],
    slopes: [
      {x:300,y:400,w:150,h:60,dir:'desc'},{x:850,y:400,w:150,h:60,dir:'asc'},
      {x:1650,y:400,w:160,h:60,dir:'desc'},{x:2750,y:400,w:160,h:60,dir:'asc'},
      {x:3600,y:400,w:170,h:60,dir:'desc'},{x:4750,y:400,w:170,h:60,dir:'asc'},
      {x:5600,y:400,w:170,h:60,dir:'desc'},{x:6500,y:400,w:150,h:60,dir:'asc'},
    ],
    movers: [
      {x:1600,y:350,w:120,h:20,axis:'y',range:90,speed:1.2,ox:1600,oy:350,t:0,dx:0,dy:0},
      {x:5390,y:380,w:120,h:20,axis:'x',range:80,speed:1.5,ox:5390,oy:380,t:1,dx:0,dy:0},
      {x:1425,y:360,w:110,h:20,axis:'y',range:80,speed:1.6,ox:1425,oy:360,t:2,dx:0,dy:0},
    ],
    springs: [
      {x:545,y:428,w:34,h:32,power:15.5,anim:0},
      {x:2145,y:428,w:34,h:32,power:16.5,anim:0},
      {x:5245,y:428,w:34,h:32,power:16.5,anim:0},
      {x:6680,y:428,w:34,h:32,power:16.5,anim:0},
    ],
    spikes: [
      {x:900,y:440,w:60,h:20},{x:1800,y:440,w:80,h:20},{x:2800,y:440,w:60,h:20},
      {x:3650,y:440,w:80,h:20},{x:4300,y:360,w:60,h:20},{x:4900,y:440,w:80,h:20},
      {x:5800,y:440,w:80,h:20},{x:7050,y:440,w:100,h:20},
    ],
    crystals: [
      {x:280,y:320},{x:450,y:240},{x:660,y:300},
      {x:830,y:310},{x:1030,y:230},{x:1230,y:310},
      {x:1600,y:230},{x:1830,y:230},{x:2030,y:230},{x:2300,y:260},
      {x:2730,y:310},{x:2930,y:230},{x:3130,y:310},{x:3390,y:280},
      {x:3580,y:310},{x:3780,y:230},{x:3980,y:310},
      {x:4300,y:300},{x:4400,y:300},
      {x:4730,y:310},{x:4930,y:230},{x:5130,y:310},{x:5390,y:280},
      {x:5580,y:310},{x:5780,y:230},{x:5980,y:310},{x:6270,y:300},
      {x:6480,y:310},{x:6700,y:180},{x:6950,y:180},{x:7180,y:310},{x:7400,y:400},
    ].map(c => ({...c, taken:false, t:Math.random()*6, collectAnim:0})),
    checkpoints: [
      {x:1520,y:360,w:14,h:100,active:false},
      {x:3500,y:360,w:14,h:100,active:false},
      {x:5500,y:360,w:14,h:100,active:false},
    ],
    finish: { x: 7360, y: 260, w: 30, h: 200 },
    enemies: [
      {type:'patrol', x:850,y:416,w:32,h:30, minX:800,maxX:1100, vx:1.6, dir:1, alive:true, t:0},
      {type:'fly',    x:660,y:300,w:30,h:28, baseY:300, range:60, speed:2.2, alive:true, t:0},
      {type:'guard',  x:1250,y:406,w:36,h:54, alive:true, t:0},
      {type:'patrol', x:1600,y:416,w:32,h:30, minX:1550,maxX:1900, vx:1.8, dir:-1, alive:true, t:0},
      {type:'fly',    x:2400,y:280,w:30,h:28, baseY:280, range:70, speed:2.4, alive:true, t:1},
      {type:'patrol', x:2700,y:416,w:32,h:30, minX:2650,maxX:3000, vx:1.8, dir:1, alive:true, t:0},
      {type:'guard',  x:3200,y:406,w:36,h:54, alive:true, t:0},
      {type:'fly',    x:3390,y:300,w:30,h:28, baseY:300, range:60, speed:2.6, alive:true, t:2},
      {type:'patrol', x:3600,y:416,w:32,h:30, minX:3520,maxX:3900, vx:2.0, dir:1, alive:true, t:0},
      {type:'fly',    x:4300,y:280,w:30,h:28, baseY:280, range:60, speed:2.4, alive:true, t:0},
      {type:'patrol', x:4750,y:416,w:32,h:30, minX:4650,maxX:5050, vx:2.0, dir:-1, alive:true, t:0},
      {type:'patrol', x:5600,y:416,w:32,h:30, minX:5520,maxX:5900, vx:2.0, dir:1, alive:true, t:0},
      {type:'guard',  x:5900,y:406,w:36,h:54, alive:true, t:0},
      {type:'fly',    x:6270,y:300,w:30,h:28, baseY:300, range:60, speed:2.6, alive:true, t:1},
      {type:'patrol', x:6500,y:416,w:32,h:30, minX:6400,maxX:6800, vx:2.2, dir:-1, alive:true, t:0},
      {type:'guard',  x:7250,y:406,w:36,h:54, alive:true, t:0},
    ],
    trees: [80,250,420,780,950,1150,1300,1550,1750,2000,2650,2850,3100,3250,3550,3800,4050,4650,4900,5150,5550,5800,6050,6400,6650,6900,7150,7400],
  };
}
LEVELS.push(buildLevel3);

/* ============================ PARTICLES ============================ */
const Particles = {
  list: [],
  spawn(x,y,vx,vy,life,color,size=4,grav=0.15) {
    if (this.list.length > 400) this.list.shift();
    this.list.push({x,y,vx,vy,life,maxLife:life,color,size,grav});
  },
  burst(x,y,n,color,spd=4) {
    for (let i=0;i<n;i++) {
      const a = Math.random()*Math.PI*2, s = Math.random()*spd+1;
      this.spawn(x,y,Math.cos(a)*s,Math.sin(a)*s-1,0.4+Math.random()*0.4,color,2+Math.random()*4);
    }
  },
  dust(x,y,dir) {
    this.spawn(x,y,-dir*(1+Math.random()*2),(Math.random()-1)*1.5,0.35,'rgba(255,255,255,0.7)',2+Math.random()*3,0.02);
  },
  trail(x,y,vx) {
    this.spawn(x,y,-vx*0.15,(Math.random()-0.5)*1,0.3,vx>0?'#7df9ff':'#ffb3ff',3+Math.random()*3,0);
  },
  sparkle(x,y) { this.burst(x,y,10,'#7df9ff',3); this.burst(x,y,6,'#ffef5a',2); },
  update(dt) {
    const f = dt*60;
    for (let i=this.list.length-1;i>=0;i--) {
      const p = this.list[i];
      p.x += p.vx*f; p.y += p.vy*f; p.vy += p.grav*f; p.life -= dt;
      if (p.life<=0) this.list.splice(i,1);
    }
  },
  draw(cam) {
    for (const p of this.list) {
      ctx.globalAlpha = Math.max(0, p.life/p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x-cam.x, p.y-cam.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  },
  clear(){ this.list.length = 0; }
};

/* ============================ PLAYER ============================ */
const Player = {
  w:30, h:44, x:0, y:0, vx:0, vy:0,
  onGround:false, coyote:0, facing:1,
  lives:3, invuln:0, boost:100, boosting:false,
  runCycle:0, afterimages:[], dead:false,
  groundOneWay:null, groundMover:null, dropTimer:0, _prevBottom:0,
  reset(spawn) {
    this.x = spawn.x; this.y = spawn.y; this.vx = 0; this.vy = 0;
    this.lives = 3; this.invuln = 0; this.boost = 100; this.dead = false;
    this.groundOneWay = null; this.groundMover = null; this.dropTimer = 0;
    this.afterimages.length = 0;
  },
  get maxSpeed() {
    const wantBoost = Input.dash && this.boost > 1 && (Input.right || Input.left);
    return wantBoost ? 6.0 : 4.4;
  },
  update(dt, level) {
    const f = dt*60;
    const ACC_G = 0.5, ACC_A = 0.34, FRI_G = 0.84, FRI_A = 0.985;
    const boosting = Input.dash && this.boost > 1 && (Input.left || Input.right);
    this.boosting = boosting;
    if (this.boost <= 1) { this.boost = Math.min(this.boost, 1); this.boosting = false; }
    // ESTAMINA: correr com Shift gasta rápido; recarrega só quando você solta.
    if (boosting) { this.boost = Math.max(0, this.boost - dt*20); if (Math.random()<0.6) Particles.trail(this.x+this.w/2, this.y+this.h/2, this.vx); }
    else if (!Input.dash) this.boost = Math.min(100, this.boost + dt*11);

    if (this.dropTimer > 0) this.dropTimer -= dt;
    // carrega junto a plataforma móvel em que estava pisando
    if (this.groundMover && this.onGround) {
      this.x += this.groundMover.dx;
      this.y += this.groundMover.dy;
    }

    const maxS = boosting ? 6.0 : 4.4;
    // horizontal
    if (Input.left && !Input.right) {
      this.vx -= (this.onGround?ACC_G:ACC_A)*f; this.facing = -1;
    } else if (Input.right && !Input.left) {
      this.vx += (this.onGround?ACC_G:ACC_A)*f; this.facing = 1;
    } else {
      this.vx *= Math.pow(this.onGround?FRI_G:FRI_A, f);
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }
    // teto rígido: o player nunca deve passar do teto, nem em rampas/molas
    const ceiling = boosting ? 6.0 : 4.4;
    if (this.vx > ceiling) this.vx = ceiling;
    if (this.vx < -ceiling) this.vx = -ceiling;
    // desacelera até o normal quando tira o Shift
    if (!boosting && Math.abs(this.vx) > maxS) this.vx *= Math.pow(0.9, f);

    // descer da plataforma atravessável: ↓ + pular
    if (Input.down && (Input.jumpPressed || Input.jumpBuffer > 0) && this.onGround && this.groundOneWay) {
      this.dropTimer = 0.25; this.onGround = false; this.coyote = 0;
      this.groundOneWay = null; this.groundMover = null;
      this.y += 5; this.vy = 1;
      Input.jumpPressed = false; Input.jumpBuffer = 0;
    }
    // gravidade + pulo
    this.vy += 0.62*f;
    if (this.vy > 15) this.vy = 15;
    if (this.onGround) this.coyote = 0.11; else this.coyote -= dt;
    if (Input.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = -13.2; this.onGround = false; this.coyote = 0; Input.jumpBuffer = 0;
      AudioSys.jump();
      Particles.burst(this.x+this.w/2, this.y+this.h, 8, '#ffffff', 2.5);
    }
    // pulo variável
    if (!Input.jump && this.vy < -4) this.vy += 0.5*f;

    // integra X
    this.x += this.vx * f;
    this.collideX(level);
    // integra Y
    const wasGround = this.onGround;
    this._prevBottom = this.y + this.h;
    this.y += this.vy * f;
    this.onGround = false;
    this.groundOneWay = null; this.groundMover = null;
    this.collideY(level, f);
    this.collideSlopes(level);
    if (!wasGround && this.onGround && this.vy >= 0) {
      if (Math.abs(this.vx) > 2) Particles.burst(this.x+this.w/2, this.y+this.h, 6, '#e8dcc8', 2);
    }
    // poeira correndo
    if (this.onGround && Math.abs(this.vx) > 2.2 && Math.random() < Math.abs(this.vx)/12) {
      Particles.dust(this.x+this.w/2 - this.facing*10, this.y+this.h-2, this.facing);
    }
    // afterimages em alta velocidade
    const spd = Math.abs(this.vx);
    if (spd > 3.2 && this.boost > 0.5) {
      this.afterimages.push({x:this.x,y:this.y,t:0.25,facing:this.facing});
      if (this.afterimages.length > 12) this.afterimages.shift();
    }
    for (let i=this.afterimages.length-1;i>=0;i--) {
      this.afterimages[i].t -= dt;
      if (this.afterimages[i].t<=0) this.afterimages.splice(i,1);
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.onGround) this.runCycle += Math.abs(this.vx)*dt*2.2;
    // limites do mundo
    if (this.x < 0) { this.x = 0; this.vx = 0; }
    if (this.x + this.w > level.width) { this.x = level.width - this.w; this.vx = 0; }
    AudioSys.setWind(Math.min(1, spd/6));
  },
  collideX(level) {
    const boxes = nearbySolids(level, this.x, this.y, this.w, this.h);
    for (const b of boxes) {
      if (b.oneWay) continue; // atravessável: sem colisão lateral
      if (overlap(this.x,this.y,this.w,this.h,b.x,b.y,b.w,b.h)) {
        if (this.vx > 0) this.x = b.x - this.w;
        else if (this.vx < 0) this.x = b.x + b.w;
        this.vx *= -0.08;
        if (Math.abs(this.vx) < 0.4 && Math.abs(this.vx) > 0) { /* gruda suave */ }
        if (Math.abs(this.vx) < 0.6) this.vx = 0;
      }
    }
  },
  collideY(level, f) {
    const boxes = nearbySolids(level, this.x, this.y, this.w, this.h);
    const newBottom = this.y + this.h;
    for (const b of boxes) {
      // Plataforma atravessável estilo Sonic/Mario:
      // só pisa se estiver caindo/parado, vindo de cima e com sobreposição em X.
      // Subindo (pulo) ou descendo de propósito (dropTimer), atravessa.
      if (b.oneWay) {
        if (this.vy < 0 || this.dropTimer > 0) continue;
        const xOver = this.x < b.x + b.w && this.x + this.w > b.x;
        if (!xOver) continue;
        if (this._prevBottom <= b.y + 12 && newBottom >= b.y) {
          this.y = b.y - this.h; this.vy = 0; this.onGround = true;
          this.groundOneWay = b._mover || b;
          if (b._mover) this.groundMover = b._mover;
        }
        continue;
      }
      if (overlap(this.x,this.y,this.w,this.h,b.x,b.y,b.w,b.h)) {
        if (this.vy >= 0) {
          this.y = b.y - this.h; this.vy = 0; this.onGround = true;
        } else {
          this.y = b.y + b.h; this.vy = 0;
        }
      }
    }
    // molas
    for (const s of level.springs) {
      if (overlap(this.x,this.y,this.w,this.h,s.x,s.y,s.w,s.h)) {
        if (this.vy >= 0 && (this.y+this.h) - s.y < 22) {
          this.y = s.y - this.h; this.vy = -s.power; this.onGround = false;
          s.anim = 1; AudioSys.spring();
          Particles.burst(s.x+s.w/2, s.y, 12, '#7CFC00', 4);
        }
      }
      if (s.anim > 0) s.anim -= 0.06;
    }
  },
  collideSlopes(level) {
    for (const s of level.slopes) {
      if (this.x+this.w < s.x || this.x > s.x+s.w) continue;
      const cx = Math.min(Math.max(this.x+this.w/2, s.x), s.x+s.w);
      const t = (cx - s.x)/s.w;
      let surface;
      if (s.dir === 'desc') surface = s.y + t*s.h;       // alto esq -> baixo dir
      else surface = s.y + s.h - t*s.h;                  // baixo esq -> alto dir
      const bottom = this.y + this.h;
      if (bottom >= surface - 12 && bottom <= surface + 14 && this.vy >= 0) {
        this.y = surface - this.h; this.vy = 0; this.onGround = true;
      }
    }
  },
  hurt(fromX) {
    if (this.invuln > 0 || this.dead) return false;
    this.lives--; this.invuln = 2;
    AudioSys.hurt();
    Particles.burst(this.x+this.w/2, this.y+this.h/2, 16, '#ff4d4d', 4);
    // perde parte dos cristais
    const lost = Math.min(Game.crystals, 3);
    Game.crystals -= lost;
    for (let i=0;i<lost*2;i++) Particles.spawn(this.x+this.w/2, this.y, (Math.random()-0.5)*5, -Math.random()*5, 0.7, '#46e0ff', 4, 0.2);
    this.vx = (this.x+this.w/2 < fromX ? -1 : 1) * -6;
    // empurra para trás + para cima
    this.vx = (this.x < fromX ? -6 : 6); this.vy = -8; this.onGround = false;
    Game.updateHUD();
    if (this.lives <= 0) { Game.gameOver(); return true; }
    return true;
  },
  draw(cam) {
    // pisca na invulnerabilidade
    if (this.invuln > 0 && Math.floor(performance.now()/90)%2===0) return;
    // sombra nos pés quando está no chão: ajuda a julgar o pouso
    if (this.onGround) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(this.x-cam.x+this.w/2, this.y-cam.y+this.h+4, this.w/2, 4.5, 0, 0, 7); ctx.fill();
    }
    // afterimages (motion blur simulado)
    for (const a of this.afterimages) {
      ctx.globalAlpha = a.t*1.6;
      drawRunner(a.x-cam.x, a.y-cam.y, this.w, this.h, a.facing, this.runCycle, true);
    }
    ctx.globalAlpha = 1;
    drawRunner(this.x-cam.x, this.y-cam.y, this.w, this.h, this.facing, this.runCycle, false, this.boosting);
  }
};

function drawRunner(px, py, w, h, facing, cycle, ghost, boosting=false) {
  ctx.save();
  ctx.translate(px+w/2, py+h/2);
  ctx.rotate(Math.max(-0.12, Math.min(0.12, Player.vx*0.015)) * facing);
  ctx.translate(-w/2, -h/2);
  const bodyC = ghost ? 'rgba(125,249,255,0.55)' : (boosting ? '#ff9d2e' : '#2e9dff');
  const darkC = ghost ? 'rgba(125,249,255,0.4)' : (boosting ? '#d95f00' : '#1668c4');
  // cachecol voando (efeito velocidade)
  const scarfLen = ghost ? 8 : (10 + Math.abs(Player.vx)*4 + (boosting?10:0));
  ctx.fillStyle = ghost ? 'rgba(255,120,120,0.5)' : '#ff4d5e';
  const wave = Math.sin(cycle*6)*3;
  ctx.beginPath();
  ctx.moveTo(w/2 - facing*8, 12);
  ctx.lineTo(w/2 - facing*scarfLen, 14+wave);
  ctx.lineTo(w/2 - facing*8, 22);
  ctx.closePath(); ctx.fill();
  // pernas
  const legSwing = Math.abs(Player.vx) > 0.3 ? Math.sin(cycle*8)*7 : 0;
  ctx.fillStyle = darkC;
  ctx.fillRect(6, h-12+Math.max(0,legSwing*0.4), 8, 12-Math.max(0,legSwing*0.4));
  ctx.fillRect(w-14, h-12+Math.max(0,-legSwing*0.4), 8, 12-Math.max(0,-legSwing*0.4));
  // corpo
  roundRect(0, 4, w, h-12, 9); ctx.fillStyle = bodyC; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = ghost ? 'rgba(255,255,255,0.6)' : '#0d2f5e'; ctx.stroke();
  // barriga clara
  roundRect(6, h-24, w-12, 12, 6); ctx.fillStyle = ghost?'rgba(255,255,255,0.4)':'#cdeaff'; ctx.fill();
  // olho com contorno
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(w/2 + facing*7, 14, 6.5, 0, 7); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#0d2f5e'; ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(w/2 + facing*9.5, 14, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(w/2 + facing*10.5, 13, 1.1, 0, 7); ctx.fill();
  if (boosting && !ghost) { // sobrancelha de velocidade
    ctx.strokeStyle = '#0d2f5e'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w/2 + facing*1, 5); ctx.lineTo(w/2 + facing*13, 8);
    ctx.stroke();
  }
  // brilho velocidade
  if (boosting && !ghost) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-2, 8, 4, h-20);
  }
  ctx.restore();
}
function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
// pseudo-aleatório determinístico (texturas estáveis, sem flicker)
function hash1(n){ const x = Math.sin(n*127.1+311.7)*43758.5453; return x - Math.floor(x); }
function overlap(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by; }
function nearbySolids(level, x, y, w, h) {
  const out = [];
  for (const b of level.solids) if (b.x < x+120 && b.x+b.w > x-120) out.push(b);
  for (const m of level.movers) {
    const mb = {x:m.x,y:m.y,w:m.w,h:m.h,oneWay:true,_mover:m};
    if (m.x < x+140 && m.x+m.w > x-140 && Math.abs(m.y-y) < 160) out.push(mb);
  }
  return out;
}

/* ============================ ENEMIES ============================ */
const Enemies = {
  update(dt, level) {
    const f = dt*60;
    for (const e of level.enemies) {
      if (!e.alive) continue;
      e.t += dt;
      if (e.type === 'patrol') {
        e.x += e.vx * e.dir * f;
        if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
        if (e.x > e.maxX) { e.x = e.maxX; e.dir = -1; }
        // gravidade simples: gruda no chão
        e.y = groundYAt(level, e.x+e.w/2) - e.h;
      } else if (e.type === 'fly') {
        e.y = e.baseY + Math.sin(e.t*e.speed)*e.range;
      }
      // colisão com player: stomp ou dano
      const p = Player;
      if (overlap(p.x,p.y,p.w,p.h,e.x,e.y,e.w,e.h)) {
        const pBottom = p.y+p.h, eTop = e.y;
        if (p.vy > 1 && pBottom - eTop < 24) {
          e.alive = false; Game.kills++;
          p.y = e.y - p.h; p.vy = -10.5; p.onGround = false;
          AudioSys.stomp();
          Particles.burst(e.x+e.w/2, e.y, 16, '#a78bfa', 4);
          Particles.burst(e.x+e.w/2, e.y, 8, '#ffffff', 3);
          Game.updateHUD();
        } else {
          Player.hurt(e.x+e.w/2);
        }
      }
    }
  },
  draw(cam, level) {
    for (const e of level.enemies) {
      if (!e.alive) continue;
      const sx = e.x-cam.x, sy = e.y-cam.y;
      if (sx < -60 || sx > W+60) continue;
      if (e.type === 'patrol') drawPatroller(sx,sy,e);
      else if (e.type === 'guard') drawGuard(sx,sy,e);
      else drawFlyer(sx,sy,e);
    }
  }
};
function groundYAt(level, x) {
  // acha o topo de sólido mais alto abaixo de y=460 que contenha x
  let best = 560;
  for (const b of level.solids) if (x>=b.x && x<=b.x+b.w && b.y>=400 && b.y<best) best = b.y;
  for (const s of level.slopes) {
    if (x>=s.x && x<=s.x+s.w) {
      const t=(x-s.x)/s.w;
      const surf = s.dir==='desc' ? s.y+t*s.h : s.y+s.h-t*s.h;
      if (surf < best) best = surf;
    }
  }
  return Math.min(best, 460);
}
function drawPatroller(x,y,e){
  const wob = Math.sin(e.t*10)*2;
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x+e.w/2, y+e.h+3, e.w/2, 4, 0, 0, 7); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#241038';
  ctx.fillStyle = '#5b2d8e';
  roundRect(x, y+8+wob*0.3, e.w, e.h-8, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7c3fc4';
  ctx.beginPath(); ctx.arc(x+e.w/2, y+10+wob*0.3, 11, 0, 7); ctx.fill(); ctx.stroke();
  // sobrancelhas bravas = "perigo, pule em cima!"
  ctx.strokeStyle = '#241038'; ctx.lineWidth = 2.5;
  const ex = e.dir*3;
  ctx.beginPath();
  ctx.moveTo(x+e.w/2-9+ex, y+2+wob*0.3); ctx.lineTo(x+e.w/2-2+ex, y+5+wob*0.3);
  ctx.moveTo(x+e.w/2+9+ex, y+2+wob*0.3); ctx.lineTo(x+e.w/2+2+ex, y+5+wob*0.3);
  ctx.stroke();
  ctx.fillStyle = '#ffde59';
  ctx.beginPath(); ctx.arc(x+e.w/2-5+ex, y+9+wob*0.3, 3.4, 0, 7); ctx.arc(x+e.w/2+5+ex, y+9+wob*0.3, 3.4, 0, 7); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(x+e.w/2-5+ex, y+9+wob*0.3, 1.5, 0, 7); ctx.arc(x+e.w/2+5+ex, y+9+wob*0.3, 1.5, 0, 7); ctx.fill();
  // pés
  ctx.fillStyle = '#3a1c5e';
  ctx.fillRect(x+2, y+e.h-4, 10, 5); ctx.fillRect(x+e.w-12, y+e.h-4, 10, 5);
  // espinho no topo
  ctx.fillStyle = '#ff4d5e';
  ctx.beginPath(); ctx.moveTo(x+6,y+2); ctx.lineTo(x+11,y-6); ctx.lineTo(x+16,y+2); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#7a1020'; ctx.stroke();
}
function drawGuard(x,y,e){
  const pulse = 1+Math.sin(e.t*4)*0.05;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x+e.w/2, y+e.h+3, e.w/2+2, 4, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x+e.w/2, y+e.h); ctx.scale(pulse,pulse); ctx.translate(-(x+e.w/2), -(y+e.h));
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#151a24';
  ctx.fillStyle = '#374151';
  roundRect(x, y+10, e.w, e.h-10, 6); ctx.fill(); ctx.stroke();
  // emblema de escudo no peito
  ctx.fillStyle = '#9ca3af';
  ctx.beginPath(); ctx.moveTo(x+e.w/2, y+28); ctx.lineTo(x+e.w/2+7, y+33); ctx.lineTo(x+e.w/2, y+44); ctx.lineTo(x+e.w/2-7, y+33); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9ca3af';
  roundRect(x-3, y, e.w+6, 16, 6); ctx.fill(); ctx.stroke(); // capacete
  ctx.fillStyle = '#ff2222'; // visor brilhante
  roundRect(x+e.w/2-9, y+4, 18, 7, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x+e.w/2-7, y+5, 14, 2);
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(x-6, y+22, 8, 22); ctx.fillRect(x+e.w-2, y+22, 8, 22); // braços/escudo
  ctx.lineWidth = 2; ctx.strokeStyle = '#151a24';
  ctx.strokeRect(x-6, y+22, 8, 22); ctx.strokeRect(x+e.w-2, y+22, 8, 22);
  ctx.restore();
}
function drawFlyer(x,y,e){
  const flap = Math.sin(e.t*14)*5;
  // rastros de voo
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  for (let i=1;i<=2;i++) {
    ctx.beginPath(); ctx.moveTo(x-4*i, y+e.h/2+i*3); ctx.lineTo(x-14*i, y+e.h/2+i*3); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.ellipse(x+4, y+8+flap*0.4, 10, 4, -0.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x+e.w-4, y+8-flap*0.4, 10, 4, 0.5, 0, 7); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#075a75';
  ctx.beginPath(); ctx.ellipse(x+4, y+8+flap*0.4, 10, 4, -0.5, 0, 7); ctx.stroke();
  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath(); ctx.arc(x+e.w/2, y+e.h/2, 12, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x+e.w/2-4, y+e.h/2-2, 4, 0, 7); ctx.arc(x+e.w/2+4, y+e.h/2-2, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(x+e.w/2-4, y+e.h/2-2, 1.8, 0, 7); ctx.arc(x+e.w/2+4, y+e.h/2-2, 1.8, 0, 7); ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.moveTo(x+e.w/2-4, y+e.h/2+6); ctx.lineTo(x+e.w/2+4, y+e.h/2+6); ctx.lineTo(x+e.w/2, y+e.h/2+10); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#7a4d00'; ctx.stroke();
}

/* ============================ CAMERA ============================ */
const Camera = {
  x:0, shake:0,
  reset(){ this.x = 0; this.shake = 0; },
  update(dt, level) {
    const lookAhead = Player.vx * 20;
    const target = Player.x + Player.w/2 - W*0.42 + lookAhead;
    const clamped = Math.max(0, Math.min(level.width - W, target));
    this.x += (clamped - this.x) * Math.min(1, dt*5);
    if (Math.abs(Player.vx) > 5) this.shake = 2;
    else this.shake *= 0.9;
  },
  get sx() { return this.x + (Math.random()-0.5)*this.shake; },
  get sy() { return (Math.random()-0.5)*this.shake*0.5; }
};

/* ============================ GAME STATE ============================ */
const Game = {
  state:'menu', levelIndex:0, level:null,
  time:0, crystals:0, kills:0, respawn:{x:0,y:0},
  clouds:[], best: null,
  init() {
    if (this._ready) return; this._ready = true;
    Input.init();
    this.best = JSON.parse(localStorage.getItem('speeddash_best') || 'null');
    for (let i=0;i<10;i++) this.clouds.push({x:Math.random()*W, y:20+Math.random()*160, s:0.6+Math.random()*1.2, v:6+Math.random()*14});
    this.loadLevel(0);
    this.bindUI();
    requestAnimationFrame(loop);
    setInterval(()=>{ if(this.state==='play') { this.time += 0.1; this.updateHUD(); } }, 100);
  },
  loadLevel(i) {
    this.levelIndex = i;
    this.level = LEVELS[i]();
    // Estilo Sonic/Mario: chão grosso é sólido; plataformas finas e móveis
    // são atravessáveis (passa por baixo, pisa por cima).
    for (const p of this.level.solids) p.oneWay = p.h <= 24;
    for (const m of this.level.movers) m.oneWay = true;
    Player.reset(this.level.spawn);
    this.respawn = {...this.level.spawn};
    Particles.clear();
    Camera.reset();
    this.time = 0; this.crystals = 0; this.kills = 0;
    this.updateHUD();
  },
  start() {
    AudioSys.init(); AudioSys.resume();
    hide('screen-start');
    this.state = 'play';
    toast('🚩 ' + this.level.name);
  },
  restart() {
    hide('screen-gameover'); hide('screen-win'); hide('screen-pause');
    this.loadLevel(this.levelIndex);
    this.state = 'play';
  },
  nextLevel() {
    hide('screen-win');
    if (this.levelIndex + 1 < LEVELS.length) {
      this.loadLevel(this.levelIndex+1);
      this.state = 'play';
      toast('🚩 ' + this.level.name + ' — boa sorte!');
    } else {
      toast('🏆 Você zerou todas as fases! Recomeçando…');
      this.loadLevel(0);
      this.state = 'play';
    }
  },
  togglePause() {
    if (this.state === 'play') { this.state = 'pause'; show('screen-pause'); }
    else if (this.state === 'pause') { this.state = 'play'; hide('screen-pause'); }
  },
  gameOver() {
    this.state = 'over';
    AudioSys.lose(); AudioSys.setWind(0);
    document.getElementById('gameover-stats').textContent =
      `Tempo ${fmtTime(this.time)} • 💎 ${this.crystals} • 👾 ${this.kills} inimigos`;
    show('screen-gameover');
  },
  win() {
    this.state = 'win';
    AudioSys.win(); AudioSys.setWind(0);
    Particles.burst(Player.x, Player.y, 40, '#ffcf3f', 6);
    const total = this.level.crystals.length;
    document.getElementById('win-stats').innerHTML =
      `<div>⏱️ Tempo<b>${fmtTime(this.time)}</b></div>`+
      `<div>💎 Cristais<b>${this.crystals}/${total}</b></div>`+
      `<div>👾 Inimigos<b>${this.kills}</b></div>`+
      `<div>❤️ Vidas<b>${Player.lives}</b></div>`;
    let rec = '';
    if (!this.best || this.time < this.best.time) {
      this.best = { time: +this.time.toFixed(1), crystals: this.crystals };
      localStorage.setItem('speeddash_best', JSON.stringify(this.best));
      rec = '🏆 Novo recorde!';
    } else rec = `Recorde: ${fmtTime(this.best.time)}`;
    document.getElementById('win-record').textContent = rec;
    document.getElementById('btn-next').textContent =
      (this.levelIndex + 1 < LEVELS.length) ? 'Próxima Fase →' : '🏆 Voltar à Fase 1';
    show('screen-win');
  },
  updateHUD() {
    document.getElementById('hud-lives').textContent = '❤️'.repeat(Math.max(0,Player.lives)) + '🤍'.repeat(Math.max(0,3-Player.lives));
    document.getElementById('hud-crystals').textContent = this.crystals;
    document.getElementById('hud-time').textContent = fmtTime(this.time);
    document.getElementById('hud-level').textContent = (this.levelIndex+1) + '/' + LEVELS.length;
    const spd = Math.min(1, Math.abs(Player.vx)/6);
    document.getElementById('speed-fill').style.width = (spd*100)+'%';
    document.getElementById('boost-fill').style.width = Player.boost+'%';
  },
  bindUI() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', () => { AudioSys.init(); AudioSys.resume(); fn(); });
    on('btn-start', ()=>this.start());
    on('btn-l1', ()=>{ this.loadLevel(0); this.start(); });
    on('btn-l2', ()=>{ this.loadLevel(1); this.start(); });
    on('btn-l3', ()=>{ this.loadLevel(2); this.start(); });
    on('btn-resume', ()=>this.togglePause());
    on('btn-restart2', ()=>this.restart());
    on('btn-retry', ()=>this.restart());
    on('btn-replay', ()=>this.restart());
    on('btn-next', ()=>this.nextLevel());
    on('btn-pause', ()=>{ if(this.state==='play'||this.state==='pause') this.togglePause(); });
    on('btn-restart', ()=>this.restart());
    on('btn-sound', ()=>AudioSys.toggle());
    canvas.addEventListener('pointerdown', ()=>{ AudioSys.init(); AudioSys.resume(); });
  },
  update(dt) {
    // nuvens sempre
    for (const c of this.clouds) { c.x -= c.v*dt; if (c.x < -140) { c.x = W+140; c.y = 20+Math.random()*160; } }
    if (this.state !== 'play') return;
    const L = this.level;
    // movers
    for (const m of L.movers) {
      m.t += dt*m.speed;
      const off = Math.sin(m.t)*m.range;
      const nx = m.axis==='x' ? m.ox+off : m.ox;
      const ny = m.axis==='y' ? m.oy+off : m.oy;
      m.dx = nx-m.x; m.dy = ny-m.y; m.x = nx; m.y = ny;
    }
    Player.update(dt, L);
    Enemies.update(dt, L);
    Particles.update(dt);
    Camera.update(dt, L);
    // cristais
    for (const c of L.crystals) {
      c.t += dt;
      if (c.collectAnim > 0) c.collectAnim -= dt;
      if (!c.taken && overlap(Player.x,Player.y,Player.w,Player.h,c.x-14,c.y-14,28,28)) {
        c.taken = true; c.collectAnim = 0.4;
        this.crystals++;
        AudioSys.collect();
        Particles.sparkle(c.x, c.y);
        this.updateHUD();
      }
    }
    // checkpoints
    for (const cp of L.checkpoints) {
      if (!cp.active && Player.x+Player.w > cp.x && Player.x < cp.x+cp.w) {
        cp.active = true; this.respawn = {x:cp.x-20, y:cp.y-40};
        AudioSys.checkpoint(); toast('🚩 Checkpoint!');
        Particles.burst(cp.x, cp.y+20, 14, '#7CFC00', 3);
      }
    }
    // spikes
    for (const s of L.spikes) {
      if (overlap(Player.x+4,Player.y+6,Player.w-8,Player.h-6,s.x,s.y+8,s.w,s.h-8)) {
        Player.hurt(s.x+s.w/2);
      }
    }
    // caiu no buraco
    if (Player.y > 640) {
      Player.lives--; this.updateHUD();
      AudioSys.hurt();
      if (Player.lives <= 0) { this.gameOver(); return; }
      Player.x = this.respawn.x; Player.y = this.respawn.y;
      Player.vx = 0; Player.vy = 0; Player.invuln = 2;
      Camera.x = Math.max(0, Math.min(L.width-W, Player.x - W*0.42));
      toast('Cuidado com os buracos!');
    }
    // chegada
    const fz = L.finish;
    if (overlap(Player.x,Player.y,Player.w,Player.h,fz.x,fz.y,fz.w,fz.h)) this.win();
    this.updateHUD();
  }
};
function fmtTime(t){ const m=Math.floor(t/60), s=t-m*60; return m+':'+(s<10?'0':'')+s.toFixed(1); }
function show(id){ document.getElementById(id).classList.remove('hidden'); }
function hide(id){ document.getElementById(id).classList.add('hidden'); }
let toastTimer=null;
function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.add('hidden'),1800); }

/* ============================ RENDER ============================ */
function render() {
  const L = Game.level;
  const camX = Camera.sx, camY = Camera.sy;
  drawSky();
  drawMountains(camX);
  drawHillsTrees(camX, L);
  drawPlatforms(camX, camY, L);
  drawSlopes(camX, camY, L);
  drawSprings(camX, camY, L);
  drawSpikes(camX, camY, L);
  drawCheckpoints(camX, camY, L);
  drawFinish(camX, camY, L);
  drawCrystals(camX, camY, L);
  Enemies.draw({x:camX,y:camY}, L);
  Player.draw({x:camX,y:camY});
  Particles.draw({x:camX,y:camY});
  drawSpeedLines();
  if (Game.state === 'pause') { /* overlay DOM já cobre */ }
}
const DEFAULT_THEME = {
  sky: ['#3d7dd8', '#7ec8f2', '#c9efff'], sun: '#fff6c9',
  glow: 'rgba(255,246,201,0.35)', cloud: 'rgba(255,255,255,0.92)',
  far: '#6d8fd1', near: '#4e7a4a', grass: '#7ed957',
  trunk: '#6b4423', canopy: '#2f9e44', canopy2: '#40c057', stars: false,
};
function theme() { return Object.assign({}, DEFAULT_THEME, (Game.level && Game.level.theme) || {}); }
function drawSky() {
  const th = theme();
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,th.sky[0]); g.addColorStop(0.55,th.sky[1]); g.addColorStop(1,th.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  if (th.stars) {
    for (let i = 0; i < 90; i++) {
      const sx = (((i*173.3 - Camera.x*0.05) % (W+40)) + (W+40)) % (W+40) - 20;
      const sy = (i*97.7) % 250 + 8;
      const tw = 0.35 + 0.65*Math.abs(Math.sin(performance.now()/700 + i));
      ctx.globalAlpha = tw * (sy < 200 ? 1 : 0.4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx, sy, i%7===0?3:2, i%7===0?3:2);
    }
    ctx.globalAlpha = 1;
  }
  // sol / lua
  ctx.fillStyle = th.sun;
  ctx.beginPath(); ctx.arc(800, 90, 42, 0, 7); ctx.fill();
  ctx.fillStyle = th.glow;
  ctx.beginPath(); ctx.arc(800, 90, 60, 0, 7); ctx.fill();
  // nuvens (parallax leve + movimento próprio)
  ctx.fillStyle = th.cloud;
  for (const c of Game.clouds) {
    const x = (((c.x - Camera.x * 0.08) % (W + 280)) + (W + 280)) % (W + 280) - 140;
    cloud(x, c.y, c.s);
  }
}
function cloud(x,y,s){
  ctx.beginPath();
  ctx.arc(x,y,18*s,0,7); ctx.arc(x+22*s,y+4*s,14*s,0,7); ctx.arc(x-22*s,y+5*s,13*s,0,7); ctx.arc(x+6*s,y-9*s,13*s,0,7);
  ctx.fill();
  // sombreamento inferior: volume
  ctx.fillStyle = 'rgba(140,170,200,0.45)';
  ctx.beginPath(); ctx.ellipse(x, y+10*s, 26*s, 7*s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = theme().cloud;
}
function drawMountains(camX) {
  const th = theme();
  // camada longe (parallax 0.2)
  ctx.fillStyle = th.far;
  ctx.beginPath(); ctx.moveTo(0,H,0,0);
  const off1 = camX*0.2;
  for (let x=-100;x<W+200;x+=160) {
    const wx = x+off1;
    const peak = 300 - Math.abs(((wx%640+640)%640)-320)*0.28;
    ctx.lineTo(x+80, peak); ctx.lineTo(x+160, 460);
  }
  ctx.lineTo(W,H); ctx.closePath(); ctx.fill();
  // neve nos picos da camada longe
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let x=-100;x<W+200;x+=160) {
    const wx = x+off1;
    const peak = 300 - Math.abs(((wx%640+640)%640)-320)*0.28;
    ctx.beginPath();
    ctx.moveTo(x+80-22, peak+16); ctx.lineTo(x+80, peak-2); ctx.lineTo(x+80+22, peak+16);
    ctx.lineTo(x+80+12, peak+12); ctx.lineTo(x+80, peak+17); ctx.lineTo(x+80-12, peak+12);
    ctx.closePath(); ctx.fill();
  }
  // camada perto (parallax 0.4)
  ctx.fillStyle = th.near;
  ctx.beginPath(); ctx.moveTo(0,H,0,0);
  const off2 = camX*0.4;
  for (let x=-100;x<W+200;x+=200) {
    const wx = x+off2;
    const peak = 360 - Math.abs(((wx%800+800)%800)-400)*0.2;
    ctx.lineTo(x+100, peak); ctx.lineTo(x+200, 470);
  }
  ctx.lineTo(W,H); ctx.closePath(); ctx.fill();
}
function drawHillsTrees(camX, L) {
  const th = theme();
  // faixa de grama de fundo
  ctx.fillStyle = th.grass;
  ctx.fillRect(0, 440 - Camera.sy, W, H);
  // árvores com parallax 0.85
  for (const tx of L.trees) {
    const sx = tx - camX*0.85;
    // converte para tela com repetição simples: só desenha se visível
    const screenX = tx - camX;
    if (screenX < -60 || screenX > W+60) continue;
    const gy = 462;
    // sombra no chão
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(screenX+1, gy+2, 20, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = th.trunk;
    ctx.fillRect(screenX-4, gy-46, 10, 46);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(screenX-4, gy-46, 10, 46);
    ctx.fillStyle = th.canopy;
    ctx.beginPath(); ctx.arc(screenX+1, gy-58, 22, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = th.canopy2;
    ctx.beginPath(); ctx.arc(screenX-6, gy-64, 10, 0, 7); ctx.fill();
    // frutinhos: detalhe que diferencia a árvore do cenário
    ctx.fillStyle = '#ff6b6b';
    const fseed = Math.floor(tx/50);
    ctx.beginPath();
    ctx.arc(screenX-8+fseed%3*6, gy-56+(fseed%2)*6, 2.6, 0, 7);
    ctx.arc(screenX+8-fseed%2*5, gy-64, 2.6, 0, 7);
    ctx.fill();
  }
}
function drawPlatforms(camX, camY, L) {
  for (const b of [...L.solids, ...L.movers]) {
    const sx = b.x-camX, sy = b.y-camY;
    if (sx+b.w < -20 || sx > W+20) continue;
    const isMover = L.movers.includes(b);
    const thick = b.h > 40;
    // sombra projetada: dá noção de profundidade
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    if (thick) ctx.fillRect(sx+5, sy+b.h-6, b.w-4, 10);
    else { roundRect(sx+3, sy+7, b.w, b.h, 8); ctx.fill(); }
    if (!isMover && thick) {
      // ===== CHÃO SÓLIDO: terra com grama =====
      const g = ctx.createLinearGradient(0,sy,0,sy+b.h);
      g.addColorStop(0,'#8d5a2b'); g.addColorStop(1,'#4a2a0e');
      ctx.fillStyle = g; ctx.fillRect(sx, sy, b.w, b.h);
      // pedrinhas (determinísticas)
      for (let dx=8; dx<b.w-6; dx+=26) {
        const r1 = hash1(b.x+dx), r2 = hash1(b.x+dx+99);
        ctx.fillStyle = r1>0.5 ? '#a06a35' : '#6e421c';
        ctx.beginPath(); ctx.ellipse(sx+dx+r2*10, sy+30+r1*40, 5, 3.5, 0, 0, 7); ctx.fill();
      }
      // faixa de grama com borda ondulada
      ctx.fillStyle = '#55c65a'; ctx.fillRect(sx, sy, b.w, 14);
      ctx.fillStyle = '#7ded7f';
      for (let dx=0; dx<b.w; dx+=16) {
        ctx.beginPath(); ctx.arc(sx+dx+8, sy+14, 8, 0, Math.PI); ctx.fill();
      }
      ctx.fillStyle = '#2f8f33';
      for (let dx=4; dx<b.w; dx+=18) { // tufinhos de grama
        const hgt = 4+hash1(b.x+dx)*5;
        ctx.fillRect(sx+dx, sy-hgt+2, 2.5, hgt);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(sx, sy, b.w, 3);
      // contorno
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#233d1f';
      ctx.strokeRect(sx+1, sy+1, b.w-2, b.h-2);
    } else if (!isMover) {
      // ===== PLATAFORMA ATRAVESSÁVEL: tábua de madeira clara =====
      const g = ctx.createLinearGradient(0,sy,0,sy+b.h);
      g.addColorStop(0,'#ffd98a'); g.addColorStop(0.45,'#f0a83e'); g.addColorStop(1,'#b06a1a');
      roundRect(sx, sy, b.w, b.h, 9); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#6b3d0c'; ctx.stroke();
      // veios da madeira
      ctx.strokeStyle = 'rgba(107,61,12,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx+5, sy+b.h/2); ctx.lineTo(sx+b.w-5, sy+b.h/2); ctx.stroke();
      // parafusos nas pontas
      ctx.fillStyle = '#5d3408';
      ctx.beginPath(); ctx.arc(sx+9, sy+b.h/2, 2.6, 0, 7); ctx.arc(sx+b.w-9, sy+b.h/2, 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(sx+4, sy+2.5, b.w-8, 3);
      // setas animadas: "pode subir por aqui"
      const bob = Math.sin(performance.now()/350 + b.x)*1.5;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#6b3d0c'; ctx.lineWidth = 2;
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      for (let dx=18; dx<b.w; dx+=34) {
        ctx.lineWidth = 2.5; ctx.strokeText('▲', sx+dx, sy+b.h-5+bob);
        ctx.fillText('▲', sx+dx, sy+b.h-5+bob);
      }
    } else {
      // ===== PLATAFORMA MÓVEL: azul tecnológica =====
      const mv = b._mover || L.movers.find(m => m.x===b.x && m.y===b.y);
      const g = ctx.createLinearGradient(0,sy,0,sy+b.h);
      g.addColorStop(0,'#9be2ff'); g.addColorStop(0.4,'#3aa0e8'); g.addColorStop(1,'#0b5fa5');
      roundRect(sx, sy, b.w, b.h, 9); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#073b63'; ctx.stroke();
      // luzes de borda piscando
      const on = Math.floor(performance.now()/300)%2===0;
      ctx.fillStyle = on ? '#fff36b' : '#8a7a00';
      ctx.beginPath(); ctx.arc(sx+8, sy+b.h/2, 3, 0, 7); ctx.arc(sx+b.w-8, sy+b.h/2, 3, 0, 7); ctx.fill();
      // direção do movimento
      const axis = (mv && mv.axis) || (b.axis) || 'x';
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(axis==='x' ? '⇄ MÓVEL' : '⇅ MÓVEL', sx+b.w/2, sy+15);
    }
  }
}
function drawSlopes(camX, camY, L) {
  for (const s of L.slopes) {
    const sx = s.x-camX, sy = s.y-camY;
    if (sx+s.w < 0 || sx > W) continue;
    ctx.save();
    ctx.beginPath();
    if (s.dir === 'desc') { ctx.moveTo(sx, sy); ctx.lineTo(sx+s.w, sy+s.h); ctx.lineTo(sx+s.w, sy+s.h+40); ctx.lineTo(sx, sy+40); }
    else { ctx.moveTo(sx, sy+s.h); ctx.lineTo(sx+s.w, sy); ctx.lineTo(sx+s.w, sy+40); ctx.lineTo(sx, sy+s.h+40); }
    ctx.closePath();
    ctx.fillStyle = '#8d5a2b'; ctx.fill();
    ctx.save(); ctx.clip();
    // listras diagonais de terra
    ctx.strokeStyle = 'rgba(74,42,14,0.5)'; ctx.lineWidth = 5;
    for (let d=-40; d<s.w+80; d+=20) {
      ctx.beginPath(); ctx.moveTo(sx+d, sy-10); ctx.lineTo(sx+d-30, sy+s.h+50); ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#233d1f'; ctx.stroke();
    // faixa verde da rampa
    ctx.beginPath();
    if (s.dir === 'desc') { ctx.moveTo(sx, sy); ctx.lineTo(sx+s.w, sy+s.h); ctx.lineTo(sx+s.w-10, sy+s.h+2); ctx.lineTo(sx, sy+10); }
    else { ctx.moveTo(sx, sy+s.h); ctx.lineTo(sx+s.w, sy); ctx.lineTo(sx+s.w, sy+10); ctx.lineTo(sx, sy+s.h+10); }
    ctx.closePath(); ctx.fillStyle = '#55c65a'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    if (s.dir === 'desc') { ctx.moveTo(sx, sy); ctx.lineTo(sx+s.w, sy+s.h); ctx.lineTo(sx+s.w-4, sy+s.h+4); ctx.lineTo(sx, sy+4); }
    else { ctx.moveTo(sx, sy+s.h); ctx.lineTo(sx+s.w, sy); ctx.lineTo(sx+s.w, sy+4); ctx.lineTo(sx, sy+s.h+4); }
    ctx.closePath(); ctx.fill();
    // selo de direção: descer = velocidade!
    ctx.fillStyle = s.dir==='desc' ? '#ff8a00' : '#2e9dff';
    ctx.beginPath(); ctx.arc(sx+s.w/2, sy+s.h/2+8, 12, 0, 7); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(s.dir==='desc' ? '⤵' : '⤴', sx+s.w/2, sy+s.h/2+13);
    ctx.restore();
  }
}
function drawSprings(camX, camY, L) {
  for (const s of L.springs) {
    const squash = s.anim>0 ? s.anim*8 : 0;
    const sx = s.x-camX, sy = s.y-camY - squash;
    if (sx < -40 || sx > W+40) continue;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(sx+s.w/2, s.y-camY+s.h+3, s.w/2+3, 4, 0, 0, 7); ctx.fill();
    // base com faixa de alerta
    ctx.fillStyle = '#2b2b33'; roundRect(sx-2, sy+s.h-9, s.w+4, 10, 3); ctx.fill();
    for (let i=0;i<4;i++) {
      ctx.fillStyle = i%2 ? '#2b2b33' : '#ffd23f';
      ctx.fillRect(sx-2+i*((s.w+4)/4), sy+s.h-9, (s.w+4)/4, 4);
    }
    // mola helicoidal
    ctx.strokeStyle = '#8f97a3'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    const coils = 3, top = sy+10, bot = sy+s.h-9;
    for (let i=0;i<=coils*2;i++) {
      const yy = top + (bot-top)*i/(coils*2);
      const xx = sx+s.w/2 + (i%2===0 ? -8 : 8)*(1-squash/24);
      if (i===0) ctx.moveTo(sx+s.w/2, top-2); else ctx.lineTo(xx, yy);
    }
    ctx.stroke(); ctx.lineCap = 'butt';
    // topo vermelho com seta
    const hot = s.anim>0;
    ctx.fillStyle = hot ? '#ffdf3f' : '#e63946';
    roundRect(sx-5, sy, s.w+10, 13, 6); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#7a1020'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('▲▲', sx+s.w/2, sy+10);
    if (hot) { // brilho do impulso
      ctx.fillStyle = 'rgba(255,223,63,0.35)';
      ctx.beginPath(); ctx.arc(sx+s.w/2, sy+5, 22, 0, 7); ctx.fill();
    }
  }
}
function drawSpikes(camX, camY, L) {
  for (const s of L.spikes) {
    const sx = s.x-camX, sy = s.y-camY;
    if (sx+s.w < 0 || sx > W) continue;
    // base de alerta listrada
    ctx.fillStyle = '#2b2b33'; ctx.fillRect(sx-2, sy+13, s.w+4, 8);
    for (let i=0;i*8<s.w+4;i++) {
      ctx.fillStyle = i%2 ? '#2b2b33' : '#ffd23f';
      ctx.fillRect(sx-2+i*8, sy+13, 8, 4);
    }
    // espinhos metálicos com contorno
    const n = Math.max(1, Math.floor(s.w/15));
    const step = s.w/n;
    for (let i=0;i<n;i++) {
      const x = sx+i*step;
      const g = ctx.createLinearGradient(x, sy, x+step, sy);
      g.addColorStop(0,'#f4f7fb'); g.addColorStop(0.5,'#aeb8c4'); g.addColorStop(1,'#6b7480');
      ctx.beginPath(); ctx.moveTo(x+1, sy+15); ctx.lineTo(x+step/2, sy-4); ctx.lineTo(x+step-1, sy+15); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#333a44'; ctx.stroke();
      // ponta afiada
      ctx.fillStyle = '#ff5a3c';
      ctx.beginPath(); ctx.moveTo(x+step/2-2.5, sy+2); ctx.lineTo(x+step/2, sy-4); ctx.lineTo(x+step/2+2.5, sy+2); ctx.closePath(); ctx.fill();
    }
  }
}
function drawCheckpoints(camX, camY, L) {
  for (const cp of L.checkpoints) {
    const sx = cp.x-camX, sy = cp.y-camY;
    if (sx < -60 || sx > W+60) continue;
    // base
    ctx.fillStyle = '#2b2b33'; roundRect(sx-8, sy+cp.h-8, 22, 9, 3); ctx.fill();
    // mastro listrado
    for (let y=0;y<cp.h-8;y+=10) {
      ctx.fillStyle = (y/10)%2 ? '#e8e8ee' : (cp.active ? '#2fbf4f' : '#8a8f9a');
      ctx.fillRect(sx-2, sy+y, 7, 10);
    }
    ctx.lineWidth = 2; ctx.strokeStyle = '#222'; ctx.strokeRect(sx-2, sy, 7, cp.h-8);
    ctx.fillStyle = 'gold'; ctx.beginPath(); ctx.arc(sx+1.5, sy-5, 6, 0, 7); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#7a5b00'; ctx.stroke();
    // bandeira maior com borda
    const wave = Math.sin(performance.now()/280)*2.5;
    ctx.fillStyle = cp.active ? '#37e05a' : '#aeb4bf';
    ctx.fillRect(sx+5, sy+4+wave, 40, 26);
    ctx.lineWidth = 2.5; ctx.strokeStyle = cp.active ? '#0d5c22' : '#4a4f59';
    ctx.strokeRect(sx+5, sy+4+wave, 40, 26);
    ctx.fillStyle = cp.active ? '#fff' : '#3a3f48';
    ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(cp.active ? '✔' : '?', sx+25, sy+23+wave);
    if (cp.active) { // halo pulsante = "já ativado"
      const pr = 26 + Math.sin(performance.now()/300)*4;
      ctx.strokeStyle = 'rgba(55,224,90,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx+25, sy+17, pr, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(55,224,90,0.18)'; ctx.fillRect(sx-16, sy, 66, cp.h);
    }
  }
}
function drawFinish(camX, camY, L) {
  const fz = L.finish;
  const sx = fz.x-camX, sy = fz.y-camY;
  if (sx < -140 || sx > W+140) return;
  const cx = sx+fz.w/2;
  // tapete de chegada
  ctx.fillStyle = 'rgba(255,207,63,0.35)'; ctx.fillRect(sx-30, sy+fz.h-6, 150, 10);
  ctx.fillStyle = '#e63946';
  for (let x=sx-30; x<sx+120; x+=15) ctx.fillRect(x, sy+fz.h-6, 7.5, 10);
  // dois mastros com bolas douradas
  for (const px of [cx-46, cx+46]) {
    const g = ctx.createLinearGradient(px, sy, px+8, sy);
    g.addColorStop(0,'#c7ccd6'); g.addColorStop(1,'#6b7480');
    ctx.fillStyle = g; ctx.fillRect(px-4, sy, 9, fz.h);
    ctx.lineWidth = 2; ctx.strokeStyle = '#333a44'; ctx.strokeRect(px-4, sy, 9, fz.h);
    ctx.fillStyle = 'gold'; ctx.beginPath(); ctx.arc(px+0.5, sy-8, 8, 0, 7); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#7a5b00'; ctx.stroke();
  }
  // faixa quadriculada no topo
  const fy = sy+6;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx-52, fy+28, 112, 8);
  for (let r=0;r<3;r++) for (let c=0;c<11;c++) {
    ctx.fillStyle = (r+c)%2 ? '#111' : '#fff';
    ctx.fillRect(cx-50+c*10, fy+r*10+Math.sin(performance.now()/250+c)*1.5, 10, 10);
  }
  ctx.lineWidth = 3; ctx.strokeStyle = '#111'; ctx.strokeRect(cx-50, fy-2, 110, 34);
  // placa CHEGADA
  ctx.fillStyle = '#ffd23f'; roundRect(cx-52, fy+34, 112, 24, 6); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#7a4d00'; ctx.stroke();
  ctx.fillStyle = '#3a1c00'; ctx.font = '900 13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('★ CHEGADA', cx+2, fy+51);
  // brilho festivo
  const tw = 0.5+0.5*Math.sin(performance.now()/400);
  ctx.fillStyle = `rgba(255,210,63,${0.15+tw*0.15})`;
  ctx.fillRect(cx-60, sy-16, 128, fz.h+20);
}
function drawCrystals(camX, camY, L) {
  for (const c of L.crystals) {
    if (c.taken && c.collectAnim<=0) continue;
    const sx = c.x-camX, sy = c.y-camY + Math.sin(c.t*3)*4;
    if (sx < -30 || sx > W+30) continue;
    if (c.taken) { // animação de coleta: sobe e some
      ctx.globalAlpha = Math.max(0, c.collectAnim*2.2);
      crystalShape(sx, sy - (0.4-c.collectAnim)*60, 1+(0.4-c.collectAnim)*2);
      ctx.globalAlpha = 1;
      continue;
    }
    crystalShape(sx, sy, 1);
  }
}
function crystalShape(x, y, s) {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  // halo pulsante: visível de longe
  const pulse = 12 + Math.sin(performance.now()/300 + x)*2.5;
  ctx.fillStyle = 'rgba(70,224,255,0.28)';
  ctx.beginPath(); ctx.arc(0, 0, pulse+5, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(0, 0, pulse-3, 0, 7); ctx.fill();
  ctx.rotate(Math.sin(performance.now()/400)*0.15);
  // contorno escuro para contraste no céu claro
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#075a8a';
  ctx.beginPath(); ctx.moveTo(0,-13); ctx.lineTo(8,0); ctx.lineTo(0,13); ctx.lineTo(-8,0); ctx.closePath();
  const g = ctx.createLinearGradient(0,-12,0,12);
  g.addColorStop(0,'#e3fbff'); g.addColorStop(0.45,'#46e0ff'); g.addColorStop(1,'#0e7fd8');
  ctx.fillStyle = g; ctx.fill(); ctx.stroke();
  // faceta + brilho girando
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.moveTo(0,-13); ctx.lineTo(4,-1); ctx.lineTo(-3,-4); ctx.closePath(); ctx.fill();
  const a = performance.now()/500;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.8;
  const lx = Math.cos(a)*11, ly = Math.sin(a)*11;
  ctx.beginPath(); ctx.moveTo(-lx,-ly); ctx.lineTo(lx,ly); ctx.moveTo(-ly,lx); ctx.lineTo(ly,-lx); ctx.stroke();
  ctx.restore();
}
function drawSpeedLines() {
  const spd = Math.abs(Player.vx);
  if (spd < 3.6 || Game.state !== 'play') return;
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.6,(spd-3.6)/4.0)})`;
  ctx.lineWidth = 2;
  const n = Math.floor((spd-3.4)*2.6);
  for (let i=0;i<n;i++) {
    const y = Math.random()*H, x = Math.random()*W;
    const len = 30+spd*12+Math.random()*40;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x - Math.sign(Player.vx)*len, y); ctx.stroke();
  }
  // vinheta de velocidade
  const g = ctx.createRadialGradient(W/2,H/2,H*0.35,W/2,H/2,H*0.8);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(0,20,60,${Math.min(0.35,(spd-3.6)/6)})`);
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  ctx.restore();
}

/* ============================ LOOP ============================ */
let last = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, (t-last)/1000 || 0.016);
  last = t;
  Game.update(dt);
  render();
  Input.postUpdate(dt);
}
window.addEventListener('load', () => Game.init());
// fallback caso load já tenha ocorrido
if (document.readyState === 'complete') Game.init();
