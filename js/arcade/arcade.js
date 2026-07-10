/* =========================================================
   SPRINT · Arcade — solo typing mini-games
   A tiny self-contained engine (canvas loop + a universal
   "type-to-lock" input model + particles + screen shake +
   localStorage best scores) with six plug-in games.
   Zero dependencies, zero build step, never touches the
   Firebase multiplayer path.
   ========================================================= */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };

  /* ---------------- word bank (clean, lowercase, alnum) ---------------- */
  var WORDS = (
    "the of and to in is you that it he was for on are as with his they at be this " +
    "have from or one had by word but not what all were we when your can said there " +
    "use each which she how their will other about out many then them these so some " +
    "her would make like him into time has look two more write see number way could " +
    "people my than first water been call who now find long down day did get come made " +
    "may part over new sound take only little work know place year live me back give most " +
    "very after thing our just name good sentence man think say great where help through " +
    "much before line right too mean old any same tell boy follow came want show also " +
    "spark blaze swift storm pixel vivid orbit lunar comet quartz cobalt ember frost " +
    "nimble rocket turbo glide dash rapid vault surge pulse flare zephyr ranger falcon " +
    "jungle river monkey banana rope canvas rhythm typing keyboard sprint runner victory " +
    "combo streak bonus target laser meteor bomb ninja slice defend escape focus master"
  ).split(/\s+/).filter(Boolean);

  // de-dupe
  (function () { var seen = {}, out = []; for (var i = 0; i < WORDS.length; i++) { var w = WORDS[i]; if (!seen[w]) { seen[w] = 1; out.push(w); } } WORDS = out; })();

  var byLen = {};
  WORDS.forEach(function (w) { (byLen[w.length] = byLen[w.length] || []).push(w); });

  /* ---------------- refs ---------------- */
  var hub = $("#arcade-hub"), grid = $("#arcade-grid"), btnHubClose = $("#btn-arcade-close");
  var btnPlay = $("#btn-play-games");
  var stage = $("#game-stage"), canvas = $("#game-canvas"), ctx = canvas.getContext("2d");
  var glCanvas = $("#game-gl");
  var layer = $("#game-layer");
  var elTitle = $("#game-title"), elStats = $("#game-stats");
  var banner = $("#game-banner"), bannerText = $("#game-banner-text");
  var cdown = $("#game-countdown"), cdownNum = $("#game-countdown-num");
  var over = $("#game-over"), overBadge = $("#game-over-badge"), overTitle = $("#game-over-title"),
      overStats = $("#game-over-stats"), overBest = $("#game-over-best");
  var btnExit = $("#btn-game-exit"), btnAgain = $("#btn-game-again"), btnArcade = $("#btn-game-arcade");
  var btnMute = $("#btn-game-mute");

  /* ---------------- helpers ---------------- */
  var W = 0, H = 0, dpr = 1;
  var current = null, running = false, raf = 0, lastT = 0;
  var phase = "idle", introT = 0, introTotal = 0, introCount = 5; // "idle" | "intro" | "play"
  var activeTarget = null, typedLen = 0;
  var stats = {};
  var particles = [], shake = 0;
  var cdTimers = [], bannerTimer = 0;
  var overAnimToken = 0; // invalidates in-flight results count-ups when the card is rebuilt

  /* ---------------- shared Three.js renderer (3D games) ----------------
     A canvas holds only one context type, so 3D games render their scene to
     the #game-gl WebGL canvas while the 2D #game-canvas keeps drawing word
     tags / particles / HUD juice on top. One renderer is shared across games. */
  var renderer3d = null, _projV = null;
  function ensureRenderer() {
    if (renderer3d) return renderer3d;
    if (!window.THREE) return null;
    renderer3d = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
    renderer3d.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (THREE.sRGBEncoding) renderer3d.outputEncoding = THREE.sRGBEncoding;
    renderer3d.shadowMap.enabled = true;
    renderer3d.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer3d;
  }
  // Project a world position onto the 2D overlay in CSS pixels.
  function toScreen(vec3, camera) {
    if (!window.THREE) return { x: 0, y: 0, visible: false };
    if (!_projV) _projV = new THREE.Vector3();
    _projV.copy(vec3).project(camera);
    return { x: (_projV.x * 0.5 + 0.5) * W, y: (-_projV.y * 0.5 + 0.5) * H, visible: _projV.z < 1 };
  }
  function disposeCurrent() { if (current && current.dispose) { try { current.dispose(); } catch (e) {} } }

  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var randInt = function (a, b) { return Math.floor(rand(a, b + 1)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  var fmt = function (n) { return Math.round(n).toLocaleString(); };
  var easeOutBack = function (x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  function _hex(h) { h = h.replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mix(a, b, k) { var A = _hex(a), B = _hex(b); return "rgb(" + Math.round(A[0] + (B[0] - A[0]) * k) + "," + Math.round(A[1] + (B[1] - A[1]) * k) + "," + Math.round(A[2] + (B[2] - A[2]) * k) + ")"; }
  function updateIntroSmoke(arr, dt) {
    for (var i = arr.length - 1; i >= 0; i--) { var s = arr[i]; s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += 16 * dt; s.vx *= 0.99; if (s.t >= s.life) arr.splice(i, 1); }
    if (arr.length > 220) arr.splice(0, arr.length - 220);
  }

  /* ---------------- sound (procedural Web Audio SFX — no files) ---------------- */
  var AC = null, masterGain = null, _noise = null, audioOn = true;
  try { audioOn = localStorage.getItem("sprint_arcade_mute") !== "1"; } catch (e) {}
  function ensureAudio() {
    if (AC) { if (AC.state === "suspended") AC.resume(); return; }
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      AC = new Ctx();
      masterGain = AC.createGain(); masterGain.gain.value = 0.5;
      var comp = AC.createDynamicsCompressor(); // tame overlapping blasts
      masterGain.connect(comp); comp.connect(AC.destination);
    } catch (e) { AC = null; }
  }
  function getNoise() {
    if (_noise) return _noise;
    var len = Math.floor(AC.sampleRate * 1.2), buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    _noise = buf; return buf;
  }
  // explosion / blast: filtered noise crack + a sub-bass boom
  function sfxBoom(mag) {
    if (!AC || !audioOn) return; mag = mag || 1; var t = AC.currentTime;
    var src = AC.createBufferSource(); src.buffer = getNoise();
    var lp = AC.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(2000, t); lp.frequency.exponentialRampToValueAtTime(160, t + 0.5);
    var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7 * mag, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(lp); lp.connect(g); g.connect(masterGain); src.start(t); src.stop(t + 0.66);
    var o = AC.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    var og = AC.createGain(); og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.6 * mag, t + 0.02); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(og); og.connect(masterGain); o.start(t); o.stop(t + 0.55);
  }
  // falling-bomb ticking: a tense clock-style tick-tock countdown as the bomb drops
  function sfxWhistle(delay) {
    if (!AC || !audioOn) return; var t0 = AC.currentTime + (delay || 0);
    var n = 6, gap = 0.135;
    for (var i = 0; i < n; i++) {
      var t = t0 + i * gap, hi = i % 2 === 0; // alternate tick / tock
      // sharp click transient — the mechanical snap of the tick
      var src = AC.createBufferSource(); src.buffer = getNoise();
      var bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = hi ? 2300 : 1500; bp.Q.value = 7;
      var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(bp); bp.connect(g); g.connect(masterGain); src.start(t); src.stop(t + 0.06);
      // short tonal ping so the tick has a hard, clocky body
      var o = AC.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(hi ? 1300 : 900, t);
      var og = AC.createGain(); og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.13, t + 0.002); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(og); og.connect(masterGain); o.start(t); o.stop(t + 0.05);
    }
  }
  // katana slash: a fast metallic "shing" — airy noise swipe + a bright edge ring
  function sfxSlash() {
    if (!AC || !audioOn) return; var t = AC.currentTime;
    var src = AC.createBufferSource(); src.buffer = getNoise();
    var bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(1100, t); bp.frequency.exponentialRampToValueAtTime(5400, t + 0.11);
    var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(bp); bp.connect(g); g.connect(masterGain); src.start(t); src.stop(t + 0.22);
    var o = AC.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(2500, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.16);
    var og = AC.createGain(); og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.16, t + 0.008); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(og); og.connect(masterGain); o.start(t); o.stop(t + 0.2);
  }
  // crystal shatter: a glassy cluster of quick high pings + a bright noise burst
  function sfxShatter() {
    if (!AC || !audioOn) return; var t0 = AC.currentTime;
    for (var i = 0; i < 5; i++) {
      var t = t0 + i * 0.018;
      var o = AC.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(1600 + Math.random() * 2600, t);
      var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.14);
    }
    var src = AC.createBufferSource(); src.buffer = getNoise();
    var hp = AC.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2600;
    var ng = AC.createGain(); ng.gain.setValueAtTime(0.14, t0); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    src.connect(hp); hp.connect(ng); ng.connect(masterGain); src.start(t0); src.stop(t0 + 0.16);
  }
  // perfect-focus: a deep time-warp whoosh sinking down into a rising shimmer
  function sfxFocus() {
    if (!AC || !audioOn) return; var t = AC.currentTime;
    var o = AC.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(58, t + 0.5);
    var lp = AC.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
    o.connect(lp); lp.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.76);
    for (var i = 0; i < 2; i++) {
      var s = AC.createOscillator(); s.type = "triangle";
      s.frequency.setValueAtTime(600 + i * 5, t + 0.08); s.frequency.exponentialRampToValueAtTime(1800 + i * 24, t + 0.6);
      var sg = AC.createGain(); sg.gain.setValueAtTime(0.0001, t + 0.08);
      sg.gain.exponentialRampToValueAtTime(0.12, t + 0.22); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      s.connect(sg); sg.connect(masterGain); s.start(t + 0.08); s.stop(t + 0.72);
    }
  }
  // defuse pop: a snappy, satisfying "pop" when a bomb is typed away
  function sfxPop() {
    if (!AC || !audioOn) return; var t = AC.currentTime;
    // body — a quick upward pitch blip that gives the bubbly "pop" feel
    var o = AC.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(340, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.08);
    var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.18);
    // click transient — the crisp snap of the pop
    var src = AC.createBufferSource(); src.buffer = getNoise();
    var bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.8;
    var g2 = AC.createGain(); g2.gain.setValueAtTime(0.22, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(bp); bp.connect(g2); g2.connect(masterGain); src.start(t); src.stop(t + 0.06);
  }
  // defeat sting: two detuned saws sinking down + low rumble
  function sfxGameOver() {
    if (!AC || !audioOn) return; var t = AC.currentTime, i;
    for (i = 0; i < 2; i++) {
      var o = AC.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(210 - i * 5, t); o.frequency.exponentialRampToValueAtTime(52, t + 1.1);
      var lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
      var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(lp); lp.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 1.35);
    }
    var src = AC.createBufferSource(); src.buffer = getNoise();
    var lp2 = AC.createBiquadFilter(); lp2.type = "lowpass"; lp2.frequency.value = 130;
    var g2 = AC.createGain(); g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.35, t + 0.1); g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    src.connect(lp2); lp2.connect(g2); g2.connect(masterGain); src.start(t); src.stop(t + 1.25);
  }
  // gunshot: a short filtered-noise crack + a quick downward zap
  function sfxShot() {
    if (!AC || !audioOn) return; var t = AC.currentTime;
    var src = AC.createBufferSource(); src.buffer = getNoise();
    var hp = AC.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1500;
    var g = AC.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(hp); hp.connect(g); g.connect(masterGain); src.start(t); src.stop(t + 0.1);
    var o = AC.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    var og = AC.createGain(); og.gain.setValueAtTime(0.16, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(og); og.connect(masterGain); o.start(t); o.stop(t + 0.1);
  }
  // keystroke tick — a tiny high blip
  function sfxTick() {
    if (!AC || !audioOn) return; var t = AC.currentTime;
    var o = AC.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(1150 + Math.random() * 320, t);
    var g = AC.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.04);
  }
  // hurt — an alarming descending sweep
  function sfxHurt() {
    if (!AC || !audioOn) return; var t = AC.currentTime;
    var o = AC.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(430, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.4);
    var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.26, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.44);
  }
  // level-up — a rising 4-note arpeggio
  function sfxLevelUp() {
    if (!AC || !audioOn) return; var t = AC.currentTime, notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i++) {
      var tt = t + i * 0.09;
      var o = AC.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(notes[i], tt);
      var g = AC.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.2, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.22);
      o.connect(g); g.connect(masterGain); o.start(tt); o.stop(tt + 0.24);
    }
  }
  // combo chime — pitch climbs with the streak
  function sfxCombo(level) {
    if (!AC || !audioOn) return; var t = AC.currentTime, base = 440 + (level || 1) * 40;
    var o = AC.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(base, t);
    var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.16);
    var o2 = AC.createOscillator(); o2.type = "triangle"; o2.frequency.setValueAtTime(base * 1.5, t + 0.06);
    var g2 = AC.createGain(); g2.gain.setValueAtTime(0.0001, t + 0.06); g2.gain.exponentialRampToValueAtTime(0.17, t + 0.08); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o2.connect(g2); g2.connect(masterGain); o2.start(t + 0.06); o2.stop(t + 0.22);
  }
  function setMuted(m) {
    audioOn = !m;
    try { localStorage.setItem("sprint_arcade_mute", m ? "1" : "0"); } catch (e) {}
    if (!m) ensureAudio();
  }

  function wordByLen(min, max) {
    var pool = [];
    for (var L = min; L <= max; L++) if (byLen[L]) pool = pool.concat(byLen[L]);
    if (!pool.length) pool = WORDS;
    return pick(pool);
  }

  /* -------- best scores (localStorage; guests keep their bests) -------- */
  function bestKey(id) { return "sprint_arcade_best_" + id; }
  function getBest(id) { var v = 0; try { v = +localStorage.getItem(bestKey(id)) || 0; } catch (e) {} return v; }
  function setBest(id, v) { try { localStorage.setItem(bestKey(id), String(Math.round(v))); } catch (e) {} }

  /* ---------------- canvas sizing ---------------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (renderer3d) renderer3d.setSize(W, H, false);
    if (current && current.is3D && current.camera) { current.camera.aspect = W / H; current.camera.updateProjectionMatrix(); }
    if (current && current.onResize) current.onResize(api);
  }
  window.addEventListener("resize", function () { if (stage.classList.contains("is-open")) resize(); });

  /* ---------------- HUD stat chips ---------------- */
  function renderStats() {
    elStats.innerHTML = "";
    for (var k in stats) {
      if (!stats.hasOwnProperty(k)) continue;
      var c = document.createElement("div");
      c.className = "game-chip";
      c.innerHTML = "<b>" + stats[k] + "</b><small>" + k + "</small>";
      elStats.appendChild(c);
    }
  }
  function setStat(k, v) { stats[k] = v; renderStats(); }
  function setStats(obj) { stats = obj || {}; renderStats(); }

  /* ---------------- banner (wave / combo call-outs) ---------------- */
  function showBanner(text, ms) {
    ms = ms == null ? 900 : ms;
    bannerText.textContent = text;
    banner.hidden = false;
    banner.classList.remove("is-pop"); void banner.offsetWidth; banner.classList.add("is-pop");
    clearTimeout(bannerTimer);
    if (ms) bannerTimer = setTimeout(function () { banner.hidden = true; }, ms);
  }

  /* ---------------- particles + shake (universal juice) ---------------- */
  function burst(x, y, color, n) {
    n = n || 16;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = rand(50, 300);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.75), t: 0, color: color || "#7cf3ff", r: rand(1.5, 3.6) });
    }
  }
  function doShake(m) { shake = Math.max(shake, m); }
  function updateParticles(dt) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 640 * dt;
    }
    particles = particles.filter(function (p) { return p.t < p.life; });
  }
  function renderParticles(c) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i], k = 1 - p.t / p.life;
      c.globalAlpha = Math.max(0, k);
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
    }
    c.globalAlpha = 1;
  }

  /* ---------------- rounded-rect + word tag drawing ---------------- */
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // Draws a pill with the word centered at (x,y); typed prefix glows.
  function wordTag(c, x, y, target, o) {
    o = o || {};
    // wrong-letter feedback: jitter the tag + flash it red while shakeUntil is live
    var shakeK = 0;
    if (target.shakeUntil) {
      var rem = target.shakeUntil - performance.now();
      if (rem > 0) { shakeK = Math.min(1, rem / 320); x += Math.sin(performance.now() * 0.05) * 6 * shakeK; }
    }
    var size = o.size || 17;
    c.font = "700 " + size + "px 'JetBrains Mono', monospace";
    c.textBaseline = "middle";
    c.textAlign = "left";
    var word = target.word, done = target.typedCount || 0;
    var tw = c.measureText(word).width;
    var padX = o.padX == null ? 12 : o.padX, padY = o.padY == null ? 7 : o.padY;
    var boxW = tw + padX * 2, boxH = size + padY * 2;
    var bx = x - boxW / 2, by = y - boxH / 2;

    // pill background
    c.save();
    var accent = o.accent || "#7cf3ff";
    var shaking = shakeK > 0;
    roundRect(c, bx, by, boxW, boxH, boxH / 2);
    c.fillStyle = o.bg || "rgba(6,10,26,0.82)";
    c.shadowColor = shaking ? "#ff5d73" : (target.isActive ? accent : "rgba(0,0,0,0.5)");
    c.shadowBlur = shaking ? 22 : (target.isActive ? 20 : 8);
    c.fill();
    c.shadowBlur = 0;
    c.lineWidth = shaking ? 2.4 : (target.isActive ? 2 : 1.2);
    c.strokeStyle = shaking ? "#ff5d73" : (target.isActive ? accent : (o.border || "rgba(154,170,235,0.35)"));
    roundRect(c, bx, by, boxW, boxH, boxH / 2); c.stroke();
    c.restore();

    // text, per-char
    var cx = x - tw / 2;
    for (var i = 0; i < word.length; i++) {
      var ch = word[i], cw = c.measureText(ch).width;
      if (i < done) { c.fillStyle = accent; }
      else { c.fillStyle = o.color || "#eef2ff"; }
      c.fillText(ch, cx, y + 1);
      cx += cw;
    }
    return { w: boxW, h: boxH };
  }

  /* ---------------- the API handed to every game ---------------- */
  var api = {
    get ctx() { return ctx; }, get W() { return W; }, get H() { return H; },
    layer: layer,
    setStat: setStat, setStats: setStats, banner: showBanner,
    word: wordByLen, pick: pick, rand: rand, randInt: randInt, clamp: clamp,
    burst: burst, shake: doShake, wordTag: wordTag, roundRect: roundRect,
    end: endGame,
    sound: { boom: sfxBoom, whistle: sfxWhistle, pop: sfxPop, slash: sfxSlash, shatter: sfxShatter, focus: sfxFocus, over: sfxGameOver, shot: sfxShot, tick: sfxTick, hurt: sfxHurt, levelup: sfxLevelUp, combo: sfxCombo },
    // 3D helpers (for is3D games)
    get THREE() { return window.THREE; },
    get renderer() { return renderer3d; },
    toScreen: toScreen,
    now: function () { return performance.now(); },
  };

  /* ---------------- universal typing engine ---------------- */
  function handleChar(ch) {
    if (!current || !current.targets) return;
    var list = current.targets(api) || [];
    if (activeTarget && list.indexOf(activeTarget) < 0) { clearActive(); }

    if (!activeTarget) {
      // Prefer a non-"avoid" (safe) target on the first letter; only lock a
      // flagged target (e.g. a Ninja bomb) if nothing safe matches.
      var safe = null, risky = null;
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (!t.word || t.word[0].toLowerCase() !== ch) continue;
        if (t.avoid) { if (!risky) risky = t; }
        else { safe = t; break; }
      }
      var cand = safe || risky;
      if (!cand) { if (current.miss) current.miss(api, ch); return; }
      activeTarget = cand; typedLen = 1; cand.typedCount = 1; cand.isActive = true;
      if (typedLen >= cand.word.length) completeTarget();
      return;
    }

    var expected = activeTarget.word[typedLen].toLowerCase();
    if (ch === expected) {
      typedLen++; activeTarget.typedCount = typedLen;
      if (typedLen >= activeTarget.word.length) completeTarget();
    } else {
      // Wrong letter: stay put — keep the progress so far and let the player
      // simply retype the correct next letter. Just shake the word for feedback.
      activeTarget.shakeUntil = api.now() + 320;
      if (current.miss) current.miss(api, ch);
    }
  }
  function completeTarget() { var t = activeTarget; clearActive(); if (current.hit) current.hit(t, api); }
  function clearActive() { if (activeTarget) { activeTarget.isActive = false; activeTarget.typedCount = 0; } activeTarget = null; typedLen = 0; }

  function onKeyDown(e) {
    if (!stage.classList.contains("is-open")) return;
    if (e.key === "Escape") { e.preventDefault(); toArcade(); return; }

    // During the cinematic, any key skips straight to play.
    if (phase === "intro") { e.preventDefault(); startPlay(); return; }

    // Game-over screen owns Enter/Esc.
    if (!over.hidden) { if (e.key === "Enter") { e.preventDefault(); replay(); } return; }
    if (!running) return;

    var k = e.key;
    if (k.length !== 1) return;
    var ch = k.toLowerCase();
    if (!/[a-z0-9 ]/.test(ch)) return; // space allowed so sentence targets (spike walls) are typeable
    e.preventDefault();
    handleChar(ch);
  }
  document.addEventListener("keydown", onKeyDown, true);

  /* ---------------- main loop ---------------- */
  function frame(t) {
    if (!running) return;
    var dt = (t - lastT) / 1000; lastT = t;
    if (!(dt > 0)) dt = 0; if (dt > 0.05) dt = 0.05;

    if (phase === "intro") {
      introT += dt;
      // light-coloured countdown ticking above the cinematic
      var per = introTotal / introCount;
      var n = clamp(introCount - Math.floor(introT / per), 1, introCount);
      if (String(n) !== cdownNum.textContent) {
        cdownNum.textContent = n;
        cdownNum.classList.remove("is-pop"); void cdownNum.offsetWidth; cdownNum.classList.add("is-pop");
      }
      if (current.is3D && renderer3d && current.scene && current.camera) renderer3d.render(current.scene, current.camera);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (shake > 0.4) { ctx.translate(rand(-shake, shake), rand(-shake, shake)); shake *= 0.9; } else shake = 0;
      if (current.introFrame) current.introFrame(ctx, api, introT, introTotal);
      updateParticles(dt); renderParticles(ctx);
      ctx.restore();
      if (introT >= introTotal) { startPlay(); return; }
      raf = requestAnimationFrame(frame);
      return;
    }

    current.update(dt, api);
    updateParticles(dt);

    if (current.is3D && renderer3d && current.scene && current.camera) renderer3d.render(current.scene, current.camera);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0.4) { ctx.translate(rand(-shake, shake), rand(-shake, shake)); shake *= 0.86; }
    else shake = 0;
    current.render(ctx, api);
    renderParticles(ctx);
    ctx.restore();

    raf = requestAnimationFrame(frame);
  }

  // Transition from intro (or countdown) into live play.
  function startPlay() {
    phase = "play";
    cdown.hidden = true;
    stage.classList.remove("intro-cine");
    particles = []; shake = 0;
    if (current.init) current.init(api);
    running = true; lastT = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  /* ---------------- countdown → start ---------------- */
  function clearCdTimers() { cdTimers.forEach(clearTimeout); cdTimers = []; }
  function runCountdown(done) {
    clearCdTimers();
    var seq = ["3", "2", "1", "GO"];
    cdown.hidden = false;
    seq.forEach(function (s, i) {
      cdTimers.push(setTimeout(function () {
        cdownNum.textContent = s;
        cdownNum.classList.remove("is-pop"); void cdownNum.offsetWidth; cdownNum.classList.add("is-pop");
      }, i * 650));
    });
    cdTimers.push(setTimeout(function () { cdown.hidden = true; done(); }, seq.length * 650));
  }

  /* ---------------- launch / replay / exit ---------------- */
  function launch(game) {
    ensureAudio(); // the tile click is our gesture to unlock Web Audio
    disposeCurrent(); // free any prior game's 3D resources (also covers replay)
    current = game;
    clearActive(); stats = {}; particles = []; shake = 0;
    layer.innerHTML = ""; over.hidden = true; banner.hidden = true;
    closeHub();
    // 3D games render to the WebGL layer; 2D games hide it and draw on #game-canvas.
    if (game.is3D) { ensureRenderer(); glCanvas.hidden = false; }
    else { glCanvas.hidden = true; }
    stage.classList.add("is-open"); stage.setAttribute("aria-hidden", "false");
    document.body.classList.add("arcade-open");
    elTitle.textContent = game.name;
    stage.style.setProperty("--game-accent", game.color);
    setStats({});
    resize();

    if (game.intro) {
      // cinematic cold-open: the game drives introFrame() while a light
      // countdown ticks above it, then we hand off to live play.
      if (game.introInit) game.introInit(api);
      introTotal = game.intro.duration || 4.5;
      introCount = clamp(game.intro.count || Math.round(introTotal), 1, 5);
      introT = 0; phase = "intro";
      cdown.hidden = false; cdownNum.textContent = introCount;
      stage.classList.add("intro-cine");
      running = true; lastT = performance.now();
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    } else {
      running = false; phase = "idle";
      runCountdown(function () {
        if (current.init) current.init(api);
        phase = "play"; running = true; lastT = performance.now(); raf = requestAnimationFrame(frame);
      });
    }
  }
  function replay() { if (current) launch(current); }

  function stopLoop() { running = false; phase = "idle"; cancelAnimationFrame(raf); clearCdTimers(); stage.classList.remove("intro-cine"); }

  /* Animated count-up for a results value. Parses the first numeric run out of
     the string so prefixes/suffixes ("x7", "88%", "1,234", "12s") are preserved,
     then eases from 0 to the target. Non-numeric values are set verbatim. */
  function animateCount(el, raw, delay) {
    var str = String(raw);
    var m = str.match(/-?\d[\d,]*(\.\d+)?/);
    if (!m) { el.textContent = str; return; }
    var numStr = m[0], pre = str.slice(0, m.index), post = str.slice(m.index + numStr.length);
    var hasComma = numStr.indexOf(",") >= 0;
    var decimals = (numStr.split(".")[1] || "").length;
    var target = parseFloat(numStr.replace(/,/g, ""));
    if (!isFinite(target)) { el.textContent = str; return; }
    function fnum(v) {
      if (decimals > 0) { var s = v.toFixed(decimals); if (hasComma) { var p = s.split("."); p[0] = (+p[0]).toLocaleString(); s = p.join("."); } return s; }
      var iv = Math.round(v); return hasComma ? iv.toLocaleString() : String(iv);
    }
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { el.textContent = pre + fnum(target) + post; return; }
    var token = overAnimToken, dur = 720;
    el.textContent = pre + fnum(0) + post;
    setTimeout(function () {
      if (token !== overAnimToken || !el.isConnected) { return; }
      var start = performance.now();
      (function tick(now) {
        if (token !== overAnimToken || !el.isConnected) return;
        var t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3); // easeOutCubic
        el.textContent = pre + fnum(target * e) + post;
        if (t < 1) requestAnimationFrame(tick); else el.textContent = pre + fnum(target) + post;
      })(performance.now());
    }, delay || 0);
  }

  function endGame(res) {
    stopLoop();
    sfxGameOver(); // defeat sting as the post-game dialog pops
    var id = current.id, best = getBest(id), score = Math.round(res.score || 0);
    var isBest = score > best;
    if (isBest) setBest(id, score);

    overBadge.textContent = res.badge || "GAME OVER";
    overTitle.textContent = res.title || "Nice run!";
    overStats.innerHTML = "";
    overAnimToken++; // supersede any count-ups still running from a prior card
    (res.stats || []).forEach(function (s, i) {
      var d = document.createElement("div");
      d.className = "game-over__stat";
      var span = document.createElement("span"), small = document.createElement("small");
      small.textContent = s.k; d.appendChild(span); d.appendChild(small);
      overStats.appendChild(d);
      animateCount(span, s.v, 160 + i * 90); // stagger to match the chips' cascade-in
    });
    overBest.hidden = false;
    if (isBest) { overBest.textContent = "🏆 New personal best!"; overBest.classList.add("is-best"); }
    else { overBest.textContent = "Best: " + fmt(best) + (res.unit ? " " + res.unit : ""); overBest.classList.remove("is-best"); }
    over.hidden = false;
  }

  function toArcade() {
    stopLoop(); disposeCurrent();
    stage.classList.remove("is-open"); stage.setAttribute("aria-hidden", "true");
    over.hidden = true; cdown.hidden = true; glCanvas.hidden = true;
    current = null; clearActive();
    document.body.classList.remove("arcade-open");
    openHub();
  }
  function exitToMenu() {
    stopLoop(); disposeCurrent();
    stage.classList.remove("is-open"); stage.setAttribute("aria-hidden", "true");
    over.hidden = true; cdown.hidden = true; glCanvas.hidden = true;
    current = null; clearActive();
    document.body.classList.remove("arcade-open");
  }

  /* ================================================================
                              THE  GAMES
     Each game lives in its own file under js/arcade/games/ and registers
     itself via window.SprintArcade.register(game). They load after this
     engine script, so GAMES is populated before the hub is ever opened.
     ================================================================ */
  var GAMES = [];

  /* ================================================================
                          HUB (game picker)
     ================================================================ */
  function buildHub() {
    grid.innerHTML = "";
    GAMES.forEach(function (g, i) {
      var best = getBest(g.id);
      var card = document.createElement("button");
      card.type = "button";
      card.className = "arcade-tile";
      card.style.setProperty("--tile", g.color);
      card.style.animationDelay = (i * 0.05) + "s";
      card.innerHTML =
        '<span class="arcade-tile__icon">' + g.icon + '</span>' +
        '<span class="arcade-tile__body">' +
          '<span class="arcade-tile__name">' + g.name + '</span>' +
          '<span class="arcade-tile__tag">' + g.tagline + '</span>' +
          '<span class="arcade-tile__best">' + (best ? "🏆 Best: " + fmt(best) : "Not played yet") + '</span>' +
        '</span>' +
        '<span class="arcade-tile__go">Play ▸</span>';
      card.addEventListener("click", function () { launch(g); });
      grid.appendChild(card);
    });
  }

  function openHub() { buildHub(); hub.classList.add("is-open"); document.body.classList.add("arcade-open"); }
  function closeHub() { hub.classList.remove("is-open"); if (!stage.classList.contains("is-open")) document.body.classList.remove("arcade-open"); }

  /* ---------------- wiring ---------------- */
  if (btnPlay) btnPlay.addEventListener("click", openHub);
  if (btnHubClose) btnHubClose.addEventListener("click", function () { closeHub(); });
  if (hub) hub.addEventListener("click", function (e) { if (e.target === hub) closeHub(); });
  if (btnExit) btnExit.addEventListener("click", toArcade);
  if (btnAgain) btnAgain.addEventListener("click", replay);
  if (btnArcade) btnArcade.addEventListener("click", toArcade);
  if (canvas) canvas.addEventListener("click", function () { if (phase === "intro") startPlay(); });
  function reflectMute() { if (btnMute) btnMute.classList.toggle("is-muted", !audioOn); }
  reflectMute();
  if (btnMute) btnMute.addEventListener("click", function () { setMuted(audioOn); reflectMute(); });

  window.SprintArcade = {
    open: openHub,
    // Games self-register from their own files (loaded after this engine).
    register: function (g) { if (g && g.id) GAMES.push(g); },
    launch: function (id) { var g = GAMES.filter(function (x) { return x.id === id; })[0]; if (g) launch(g); }
  };
})();
