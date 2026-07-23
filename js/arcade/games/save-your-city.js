/* =========================================================
   SPRINT · Arcade — "Save Your City" (2D)
   A B-2 bomber prowls the night skyline dropping word-bombs.
   Type each one to defuse it before it strikes a rooftop.
   Endless, escalating levels — every wave falls faster and
   thicker than the last, with an "AIR RAID" boss every 5.
   Three rooftop hits and the city burns.

   Pure 2D canvas render on the arcade engine's #game-canvas — the
   layered night sky, skyline, searchlights, flames, smoke, bomber
   and bombs are all drawn with the 2D context.
   Registers itself via SprintArcade.register(game).
   ========================================================= */
(function () {
  "use strict";
  var A = window.SprintArcade;
  if (!A) return;

  /* ---------------- local helpers (mirror the engine's) ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function fmt(n) { return Math.round(n).toLocaleString(); }
  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  function _hex(h) { h = h.replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mix(a, b, k) { var ca = _hex(a), cb = _hex(b); return "rgb(" + Math.round(ca[0] + (cb[0] - ca[0]) * k) + "," + Math.round(ca[1] + (cb[1] - ca[1]) * k) + "," + Math.round(ca[2] + (cb[2] - ca[2]) * k) + ")"; }
  function updateIntroSmoke(arr, dt) {
    for (var i = arr.length - 1; i >= 0; i--) { var s = arr[i]; s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += 16 * dt; s.vx *= 0.99; if (s.t >= s.life) arr.splice(i, 1); }
    if (arr.length > 220) arr.splice(0, arr.length - 220);
  }

  /* ---------------- endless-level difficulty curve ---------------- */
  var CFG = {
    MAX_HITS: 3,
    countBase: 6, countPerLevel: 2, countMax: 40,     // bombs per wave
    speedBase: 96, speedPerLevel: 9, speedCap: 320,   // fall speed (px/s)
    gapBase: 1.85, gapPerLevel: 0.08, gapMin: 0.5,    // seconds between drops
    hardBase: 0.10, hardPerLevel: 0.022, hardCap: 0.5,// chance of a tricky word
    concEvery: 3, concMax: 4,                          // simultaneous drops
    raidEvery: 5                                        // boss "air raid" cadence
  };
  function lvlCount(n) { return Math.min(CFG.countMax, CFG.countBase + (n - 1) * CFG.countPerLevel); }
  function lvlSpeed(n) { return Math.min(CFG.speedCap, CFG.speedBase + (n - 1) * CFG.speedPerLevel); }
  function lvlGap(n) { return Math.max(CFG.gapMin, CFG.gapBase - (n - 1) * CFG.gapPerLevel); }
  function lvlHard(n) { return Math.min(CFG.hardCap, CFG.hardBase + (n - 1) * CFG.hardPerLevel); }
  function lvlConc(n) { return Math.min(CFG.concMax, 1 + Math.floor((n - 1) / CFG.concEvery)); }

  /* ---------- shared assets ---------- */
  // A pool of genuinely tricky words that show up more often as the raid escalates.
  var HARD_WORDS = (
    "rhythm sphinx zephyr quorum juxtapose labyrinth silhouette bureaucracy " +
    "conscience asymmetric onomatopoeia kaleidoscope quintessential unequivocally " +
    "philosophical extemporaneous nauseous liaison maelstrom paradigm mnemonic " +
    "isthmus czar fjord glyph crypt lymph tsunami vacuum awkward jinx pyx " +
    "conscientious surveillance entrepreneur handkerchief millennium bourgeois " +
    "hierarchy pneumonia sovereignty camouflage rendezvous questionnaire"
  ).split(/\s+/).filter(Boolean);
  // Short sentences carried by the boss "bunker-buster" every 5th level.
  var BOSS_LINES = ["hold the line", "defend the city", "clear the skies", "stand your ground", "not on my watch", "save them all", "break the raid now"];

  // A realistic falling aerial bomb, nose pointing down, with a warm heat
  // tracer. Anchored so the nose tip sits at (x, noseY); the tail rises above.
  function drawBomb(c, x, noseY, t, i, scale, boss) {
    scale = scale || 1;
    c.save();
    c.translate(x, noseY);
    c.rotate(Math.sin(t * 5 + i) * 0.06); // subtle tumble as it falls
    c.scale(scale, scale);
    var r = 6.5, L = 40; // body radius, length
    // heat-glow tracer trailing up behind the bomb
    c.save(); c.globalCompositeOperation = "lighter";
    var tg = c.createLinearGradient(0, -L, 0, -L - 60);
    tg.addColorStop(0, boss ? "rgba(255,120,40,0.5)" : "rgba(255,180,90,0.42)");
    tg.addColorStop(1, "rgba(255,180,90,0)");
    c.fillStyle = tg; c.beginPath(); c.moveTo(-3, -L); c.lineTo(3, -L); c.lineTo(1.2, -L - 60); c.lineTo(-1.2, -L - 60); c.closePath(); c.fill();
    c.restore();
    // tail fins (3 blades fanning from the top)
    c.fillStyle = boss ? "#39421f" : "#2b3350";
    c.beginPath(); c.moveTo(-r, -L + 6); c.lineTo(-r - 6, -L - 4); c.lineTo(-r, -L + 12); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(r, -L + 6); c.lineTo(r + 6, -L - 4); c.lineTo(r, -L + 12); c.closePath(); c.fill();
    c.fillStyle = boss ? "#4a562a" : "#353d5c";
    c.fillRect(-2, -L - 2, 4, 12); // center fin
    // body — steel casing, pointed nose at bottom (y=0)
    var g = c.createLinearGradient(-r, 0, r, 0);
    if (boss) { g.addColorStop(0, "#2a3016"); g.addColorStop(0.45, "#6b7a3a"); g.addColorStop(0.6, "#8f9f52"); g.addColorStop(1, "#333a1c"); }
    else { g.addColorStop(0, "#232a42"); g.addColorStop(0.45, "#5b678f"); g.addColorStop(0.6, "#7e8ab4"); g.addColorStop(1, "#2b3350"); }
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 0);                              // nose tip
    c.quadraticCurveTo(-r, -r * 1.1, -r, -r * 2.2);
    c.lineTo(-r, -L + 8);
    c.quadraticCurveTo(-r, -L, 0, -L);           // rounded tail
    c.quadraticCurveTo(r, -L, r, -L + 8);
    c.lineTo(r, -r * 2.2);
    c.quadraticCurveTo(r, -r * 1.1, 0, 0);
    c.closePath(); c.fill();
    // warning bands + highlight
    c.fillStyle = "#d0432f"; c.fillRect(-r, -L + 20, r * 2, 4);
    if (boss) { c.fillStyle = "#ffcf3f"; c.fillRect(-r, -L + 28, r * 2, 3); }
    c.fillStyle = "rgba(255,255,255,0.4)"; c.fillRect(-r + 1.5, -L + 10, 1.6, L - 16);
    c.restore();
  }

  var game = {
    id: "drop", name: "Save Your City", icon: "🏙️", color: "#ff8a3d",
    tagline: "A B-2 bomber prowls the night skyline dropping word-bombs. Type each one to defuse it before it hits a rooftop. Endless escalating levels, an air-raid boss every 5, three hits and the city burns.",

    init: function (a) {
      this._inIntro = false;
      this.bombs = []; this.smoke = []; this.pops = []; this.rings = [];
      this.score = 0; this.cleared = 0; this.hits = 0;
      this.keysCorrect = 0; this.wrong = 0;
      this.elapsed = 0; this.emberT = 0; this.smokeT = 0; this._flash = 0; this.shoot = null;
      this._buildCity(a);
      this.jet = { x: a.W * 0.5, y: a.H * 0.11, vx: 90, bob: 0, blink: 0, yf: 0.11, ph: 0 };
      this.jets = [this.jet]; // a fleet grows to match the wave's simultaneous drops
      this._startLevel(1, a);
    },

    onResize: function (a) {
      this._buildCity(a);
      if (this.jets) for (var i = 0; i < this.jets.length; i++) {
        var jj = this.jets[i];
        jj.y = a.H * jj.yf;
        jj.x = clamp(jj.x, a.W * 0.14, a.W * 0.86);
      }
      if (this._inIntro && this._intro) this._introBuild(a);
    },

    /* ================= CINEMATIC COLD-OPEN ================= */
    intro: { duration: 4.6, count: 5 },

    introInit: function (a) {
      this._inIntro = true;
      this._introBuild(a);
      if (a.sound) for (var i = 0; i < 6; i++) a.sound.whistle(0.1 + i * 0.4 + Math.random() * 0.22);
    },

    _introBuild: function (a) {
      this._buildCity(a);
      this.smoke = [];
      this._intro = { bomber: { x: -a.W * 0.25, y: a.H * 0.15 }, booms: [], frontX: -40, lastBoomX: -999 };
      for (var i = 0; i < this.buildings.length; i++) this.buildings[i].burning = false;
    },

    introFrame: function (c, a, t, total) {
      var W = a.W, H = a.H, S = this._intro, i;
      var lit = clamp(t / 0.6, 0, 1);
      var burnStart = 0.7, burnEnd = 2.9;
      var prog = clamp((t - burnStart) / (burnEnd - burnStart), 0, 1);

      var heat = clamp((t - burnStart) / 1.6, 0, 1);
      var sky = c.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#05060f");
      sky.addColorStop(0.55, mix("#0a1030", "#2a0a12", heat));
      sky.addColorStop(1, mix("#0b1228", "#5a1408", heat));
      c.fillStyle = sky; c.fillRect(0, 0, W, H);

      c.globalAlpha = 0.6 * lit * (1 - heat * 0.85);
      for (i = 0; i < this.stars.length; i++) { var st = this.stars[i]; c.fillStyle = "#dfe8ff"; c.beginPath(); c.arc(st.x, st.y, st.r, 0, 7); c.fill(); }
      c.globalAlpha = 1;
      c.save(); c.globalAlpha = (1 - heat * 0.7) * lit; c.shadowColor = "rgba(255,240,200,0.5)"; c.shadowBlur = 36;
      c.fillStyle = "#f4ecd0"; c.beginPath(); c.arc(W * 0.82, H * 0.17, 30, 0, 7); c.fill(); c.restore();

      S.frontX = -40 + prog * (W + 80);
      for (i = 0; i < this.buildings.length; i++) {
        var b = this.buildings[i];
        if (!b.burning && (b.x + b.w / 2) < S.frontX) {
          b.burning = true; b.flames = [];
          var fn = Math.max(3, Math.round(b.w / 12));
          for (var k = 0; k < fn; k++) b.flames.push({ ph: rand(0, 6.28), x: rand(0.08, 0.92) });
          this._renderCity(a);
          S.booms.push({ x: b.x + b.w / 2, y: b.top, r: 4, t: 0, life: rand(0.5, 0.8), big: b.w > 80 });
          a.shake(9);
          if (a.sound && (S.lastBoomT == null || t - S.lastBoomT > 0.1)) { a.sound.boom(rand(0.5, 0.95)); S.lastBoomT = t; }
          for (var e = 0; e < 6; e++) this.smoke.push({ x: b.x + b.w / 2 + rand(-b.w / 3, b.w / 3), y: b.top, vx: rand(-12, 18), vy: -rand(26, 46), r: rand(12, 24), t: 0, life: rand(2.4, 4) });
        }
      }

      if (this._city) c.drawImage(this._city, 0, 0, W, H);

      updateIntroSmoke(this.smoke, 1 / 60);
      c.save();
      for (i = 0; i < this.smoke.length; i++) {
        var sm = this.smoke[i], kk = sm.t / sm.life;
        c.globalAlpha = 0.42 * (1 - kk);
        c.fillStyle = mix("#1a1c22", "#000000", 0.4);
        c.beginPath(); c.arc(sm.x, sm.y, sm.r, 0, 7); c.fill();
      }
      c.restore(); c.globalAlpha = 1;

      for (i = 0; i < this.buildings.length; i++) if (this.buildings[i].burning) this._fire(c, this.buildings[i], t, a);

      c.save(); c.globalCompositeOperation = "lighter";
      var gg = c.createLinearGradient(0, H * 0.7, 0, H);
      gg.addColorStop(0, "rgba(255,80,20,0)"); gg.addColorStop(1, "rgba(255,90,25," + (0.28 * heat) + ")");
      c.fillStyle = gg; c.fillRect(0, H * 0.7, W, H * 0.3); c.restore();

      c.save(); c.globalCompositeOperation = "lighter";
      for (i = S.booms.length - 1; i >= 0; i--) {
        var bm = S.booms[i]; bm.t += 1 / 60; var bk = bm.t / bm.life;
        if (bk >= 1) { S.booms.splice(i, 1); continue; }
        var rr = (bm.big ? 90 : 60) * bk;
        var fgr = c.createRadialGradient(bm.x, bm.y, 1, bm.x, bm.y, rr);
        fgr.addColorStop(0, "rgba(255,255,230," + (1 - bk) + ")");
        fgr.addColorStop(0.4, "rgba(255,160,50," + (0.8 * (1 - bk)) + ")");
        fgr.addColorStop(1, "rgba(200,40,10,0)");
        c.fillStyle = fgr; c.beginPath(); c.arc(bm.x, bm.y, rr, 0, 7); c.fill();
      }
      c.restore();

      var bx = -W * 0.25 + (t / 2.6) * (W * 1.5);
      if (bx < W * 1.3) this._jet(c, { x: bx, y: H * 0.15 + Math.sin(t * 2) * 5, vx: 1, bob: 0, blink: t }, t);

      var msgStart = 2.35;
      if (t > msgStart) {
        var m = clamp((t - msgStart) / 0.6, 0, 1), e = easeOutBack(m);
        c.save();
        c.textAlign = "center"; c.textBaseline = "middle";
        c.translate(W / 2 + Math.sin(t * 30) * (1 - m) * 6, H * 0.52);
        c.scale(0.75 + 0.25 * e, 0.75 + 0.25 * e);
        c.globalAlpha = m;
        c.shadowColor = "rgba(255,120,40,0.9)"; c.shadowBlur = 34;
        c.fillStyle = "#fff";
        c.font = "800 " + Math.round(clamp(H * 0.1, 34, 92)) + "px 'Sora', system-ui, sans-serif";
        c.fillText("SAVE YOUR CITY", 0, 0);
        c.shadowBlur = 0;
        var m2 = clamp((t - msgStart - 0.35) / 0.5, 0, 1);
        c.globalAlpha = m2;
        c.fillStyle = "rgba(255,205,170,0.95)";
        c.font = "700 " + Math.round(clamp(H * 0.032, 13, 30)) + "px 'Sora', system-ui, sans-serif";
        c.fillText("F R O M   T H E   A T T A C K", 0, clamp(H * 0.08, 34, 74));
        c.restore();
      }

      c.save();
      var vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
      c.fillStyle = vg; c.fillRect(0, 0, W, H); c.restore();
    },

    /* ================= LEVEL FLOW ================= */
    _startLevel: function (n, a) {
      this.level = n;
      this.hitsThisLevel = 0;
      this.levelDone = false;
      this.raid = (n % CFG.raidEvery === 0);
      var base = lvlCount(n);
      this.toSpawn = this.raid ? Math.max(4, Math.round(base * 0.7)) : base;
      this.bossAlive = false;
      this.spawnT = 0.9;
      this._syncBombers(a);
      if (this.raid) this._spawnBoss(a);
      this._updateHUD(a);
    },

    // Keep one bomber in the air for every bomb this wave can drop at once, so
    // simultaneous word-bombs each fall from their own plane. Extra bombers fly
    // at staggered altitudes and headings for depth, and the primary jet
    // (jets[0]) is always kept in sync with this.jet.
    _syncBombers: function (a) {
      var want = lvlConc(this.level);
      while (this.jets.length < want) {
        var idx = this.jets.length;
        var yf = 0.11 + idx * 0.055;                 // stagger altitude for depth
        var dir = idx % 2 === 0 ? 1 : -1;            // fan out across the sky
        this.jets.push({
          x: a.W * (idx % 2 === 0 ? 0.3 : 0.7),
          y: a.H * yf, vx: dir * (78 + idx * 12),
          bob: 0, blink: rand(0, 6), yf: yf, ph: rand(0, 6.28)
        });
      }
      if (this.jets.length > want) this.jets.length = Math.max(1, want);
      this.jet = this.jets[0];
    },

    _spawnBoss: function (a) {
      var v = lvlSpeed(this.level) * 0.5;
      this.bombs.push({
        x: clamp(a.W * 0.5, 120, a.W - 120), y: this.jet.y + 16, word: pick(BOSS_LINES),
        typedCount: 0, isActive: false, vy: v, boss: true, no: 30, to: 34
      });
      this.bossAlive = true;
      if (a.sound) a.sound.hurt();
      a.banner("⚠ AIR RAID — LEVEL " + this.level, 1200);
      this._pop(a.W / 2, a.H * 0.34, "AIR RAID", "#ff5d73", 1.4, 30);
    },

    _completeLevel: function (a) {
      var perfect = this.hitsThisLevel === 0;
      var bonus = 50 + (perfect ? 20 : 0); // +50 per level cleared, small perfect-wave bonus
      this.score += bonus;
      if (a.sound) a.sound.levelup();
      this._flash = 0.55;
      // clean-wave reward: rebuild one gutted building and buy back a hit
      if (perfect && this.hits > 0) { this.hits--; this._repairOne(a); }
      a.banner((perfect ? "PERFECT +20 · " : "") + "LEVEL " + (this.level + 1), 1100);
      this._pop(a.W / 2, a.H * 0.4, "LEVEL " + (this.level + 1), "#ffd23f", 1.4, 30);
      this._startLevel(this.level + 1, a);
    },

    _repairOne: function (a) {
      var burnt = [];
      for (var i = 0; i < this.buildings.length; i++) if (this.buildings[i].burning) burnt.push(this.buildings[i]);
      if (!burnt.length) return;
      var b = pick(burnt);
      b.burning = false; b.flames = null;
      for (var w = 0; w < b.windows.length; w++) { b.windows[w].lit = Math.random() < 0.58; b.windows[w].warm = Math.random() < 0.72; }
      this._renderCity(a);
      this._pop(b.x + b.w / 2, b.top - 10, "REBUILT", "#6ee7b7", 1.2, 18);
    },

    _checkEnd: function (a) {
      if (this.levelDone) return;
      if (this.toSpawn <= 0 && this.bombs.length === 0) { this.levelDone = true; this._completeLevel(a); }
    },

    /* ---- city model ---- */
    _buildCity: function (a) {
      var W = a.W, H = a.H, i;
      this.horizon = H * 0.55;
      // far, dim back-layer silhouettes for depth (atmospheric perspective)
      this.back = [];
      var bx = -20;
      while (bx < W + 20) { var bw = randInt(30, 60), bh = rand(H * 0.08, H * 0.2); this.back.push({ x: bx, w: bw, h: bh }); bx += bw - randInt(2, 8); }
      // main front skyline
      var buildings = [], x = -14;
      var roofs = ["flat", "flat", "antenna", "water", "penthouse", "billboard", "setback"];
      while (x < W + 14) {
        var w = randInt(50, 104);
        var centre = clamp(1 - Math.abs((x + w / 2) / W - 0.5) * 1.3, 0.18, 1);
        var h = rand(H * 0.09, H * 0.12 + centre * H * 0.19);
        var b = {
          x: x, w: w, h: h, top: H - h,
          hue: pick(["#0c1230", "#0f1738", "#0a1026", "#111a3e", "#0d1533"]),
          roof: pick(roofs), sign: pick(["#7cf3ff", "#ff6b81", "#ffd23f", "#a78bfa"]),
          burning: false, flames: null, char: 0, windows: [],
        };
        var cols = Math.max(2, Math.floor(w / 15));
        var rows = Math.max(3, Math.floor(h / 20));
        var gap = (w - cols * 7) / (cols + 1);
        for (var r = 0; r < rows; r++) for (var cc = 0; cc < cols; cc++) {
          b.windows.push({ wx: gap + cc * (7 + gap), wy: 14 + r * 18, lit: Math.random() < 0.58, warm: Math.random() < 0.72, tw: Math.random() < 0.16, ph: rand(0, 6.28) });
        }
        buildings.push(b); x += w + randInt(0, 3);
      }
      this.buildings = buildings;
      // two star layers for parallax + twinkle
      this.stars = [];
      for (var s = 0; s < 90; s++) this.stars.push({ x: Math.random() * W, y: Math.random() * H * 0.55, r: rand(0.5, 1.8), ph: rand(0, 6.28) });
      this.starsFar = [];
      for (var s2 = 0; s2 < 150; s2++) this.starsFar.push({ x: Math.random() * W, y: Math.random() * H * 0.5, r: rand(0.3, 0.9), ph: rand(0, 6.28) });
      // drifting moonlit clouds
      this.clouds = [];
      for (i = 0; i < 5; i++) this.clouds.push({ x: rand(0, W), y: rand(H * 0.05, H * 0.34), s: rand(70, 150), a: rand(0.05, 0.13), vx: rand(3, 11) });
      // ground searchlights sweeping the sky (air-raid atmosphere)
      this.beams = [];
      for (i = 0; i < 3; i++) this.beams.push({ x: W * (0.22 + 0.28 * i), y: this.horizon + rand(-10, 20), ph: rand(0, 6.28), sp: rand(0.25, 0.5), amp: rand(0.5, 0.85), len: H * rand(0.8, 1.05), col: pick(["#9fd0ff", "#bfe0ff", "#a8e8ff"]) });
      this._renderCity(a);
    },

    _buildingAt: function (x) {
      var bs = this.buildings;
      for (var i = 0; i < bs.length; i++) if (x >= bs[i].x && x < bs[i].x + bs[i].w) return bs[i];
      return bs.length ? bs[bs.length - 1] : null;
    },

    _renderCity: function (a) {
      var W = a.W, H = a.H, d = Math.min(window.devicePixelRatio || 1, 2), i;
      var cv = this._city || (this._city = document.createElement("canvas"));
      cv.width = Math.round(W * d); cv.height = Math.round(H * d);
      var g = cv.getContext("2d");
      g.setTransform(d, 0, 0, d, 0, 0);
      g.clearRect(0, 0, W, H);
      // bluish atmospheric haze rising off the skyline base
      var grd = g.createLinearGradient(0, this.horizon, 0, H);
      grd.addColorStop(0, "rgba(70,90,160,0)"); grd.addColorStop(1, "rgba(120,70,150,0.22)");
      g.fillStyle = grd; g.fillRect(0, this.horizon, W, H - this.horizon);
      // far back-layer, hazed by distance
      for (i = 0; i < this.back.length; i++) { var bk = this.back[i]; g.fillStyle = "rgba(24,32,66,0.6)"; g.fillRect(bk.x, H - bk.h, bk.w, bk.h); }
      g.fillStyle = "rgba(90,110,180,0.05)"; g.fillRect(0, this.horizon, W, H * 0.12);

      for (i = 0; i < this.buildings.length; i++) {
        var b = this.buildings[i], topY = b.top;
        if (b.burning) {
          g.fillStyle = "#140c12"; g.fillRect(b.x, topY, b.w, H - topY);
          g.fillStyle = "rgba(70,20,10,0.5)"; g.fillRect(b.x, topY, b.w, H - topY);
          continue;
        }
        // vertical facade gradient for depth
        var fg = g.createLinearGradient(b.x, topY, b.x, H);
        fg.addColorStop(0, mix(b.hue, "#1a2452", 0.35)); fg.addColorStop(1, b.hue);
        g.fillStyle = fg; g.fillRect(b.x, topY, b.w, H - topY);
        g.fillStyle = "rgba(150,180,255,0.07)"; g.fillRect(b.x, topY, 2, H - topY);
        g.fillStyle = "rgba(0,0,0,0.30)"; g.fillRect(b.x + b.w - 3, topY, 3, H - topY);
        g.fillStyle = "rgba(170,200,255,0.16)"; g.fillRect(b.x, topY, b.w, 2);
        // windows
        for (var wi = 0; wi < b.windows.length; wi++) {
          var win = b.windows[wi]; if (!win.lit || win.tw) continue;
          g.fillStyle = win.warm ? "rgba(255,214,150,0.92)" : "rgba(150,200,255,0.85)";
          g.fillRect(b.x + win.wx, topY + win.wy, 7, 10);
        }
        this._roof(g, b);
      }
      g.fillStyle = "rgba(255,200,120,0.06)"; g.fillRect(0, H - 8, W, 8);
    },

    _roof: function (g, b) {
      var cx = b.x + b.w / 2, topY = b.top;
      switch (b.roof) {
        case "antenna":
          g.strokeStyle = "#2a3358"; g.lineWidth = 2.5;
          g.beginPath(); g.moveTo(cx, topY); g.lineTo(cx, topY - 28); g.stroke();
          g.strokeStyle = "#1f2748"; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(cx - 6, topY - 18); g.lineTo(cx + 6, topY - 18); g.stroke();
          b.beacon = topY - 28; b.beaconX = cx; break;
        case "water": {
          var wx2 = b.x + b.w * 0.6, ww = Math.min(22, b.w * 0.4);
          g.fillStyle = "#171f40";
          g.beginPath(); g.moveTo(wx2, topY - 6); g.lineTo(wx2 + ww, topY - 6); g.lineTo(wx2 + ww - 3, topY - 20); g.lineTo(wx2 + 3, topY - 20); g.closePath(); g.fill();
          g.strokeStyle = "#171f40"; g.lineWidth = 2;
          g.beginPath(); g.moveTo(wx2 + 2, topY); g.lineTo(wx2 + 2, topY - 6); g.moveTo(wx2 + ww - 2, topY); g.lineTo(wx2 + ww - 2, topY - 6); g.stroke();
          break;
        }
        case "penthouse":
          g.fillStyle = "#0a1026"; g.fillRect(cx - b.w * 0.25, topY - 16, b.w * 0.5, 16);
          g.fillStyle = "rgba(255,214,150,0.8)"; g.fillRect(cx - 5, topY - 12, 4, 6); g.fillRect(cx + 2, topY - 12, 4, 6);
          break;
        case "billboard":
          // glowing neon sign
          g.save(); g.shadowColor = b.sign; g.shadowBlur = 12;
          g.fillStyle = b.sign; g.globalAlpha = 0.9; g.fillRect(cx - b.w * 0.3, topY - 22, b.w * 0.6, 14); g.restore();
          g.globalAlpha = 1; g.fillStyle = "#0a1026"; g.fillRect(cx - 1, topY - 8, 2, 8); break;
        case "setback":
          g.fillStyle = b.hue; g.fillRect(cx - b.w * 0.32, topY - 22, b.w * 0.64, 22);
          g.fillStyle = "rgba(150,180,255,0.14)"; g.fillRect(cx - b.w * 0.32, topY - 22, b.w * 0.64, 2);
          break;
      }
    },

    /* ---- loop ---- */
    update: function (dt, a) {
      this.elapsed += dt;
      for (var ji = 0; ji < this.jets.length; ji++) {
        var j = this.jets[ji];
        j.x += j.vx * dt; j.blink += dt;
        if (j.x < a.W * 0.14) { j.x = a.W * 0.14; j.vx = Math.abs(j.vx); }
        if (j.x > a.W * 0.86) { j.x = a.W * 0.86; j.vx = -Math.abs(j.vx); }
        j.bob = Math.sin(this.elapsed * 1.5 + j.ph) * 6;
      }

      // spawn this level's bombs, dropping several at once on later levels
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.toSpawn > 0) {
        this.spawnT = lvlGap(this.level) * rand(0.75, 1.2);
        var k = Math.min(this.toSpawn, lvlConc(this.level));
        for (var s = 0; s < k; s++) {
          var hardChance = lvlHard(this.level), word;
          if (Math.random() < hardChance) word = pick(HARD_WORDS);
          else { var len = randInt(3, Math.min(8, 3 + Math.floor(this.level / 2))); word = a.word(len, len); }
          // release each simultaneous bomb from its own bomber, so it visibly
          // drops from a distinct plane instead of a random point in the sky
          var jet = this.jets[s % this.jets.length];
          var px = clamp(jet.x + rand(-14, 14), 40, a.W - 40);
          var v = lvlSpeed(this.level) * rand(0.9, 1.12);
          this.bombs.push({ x: px, y: jet.y + jet.bob + 16, word: word, typedCount: 0, isActive: false, vy: v, no: 16, to: 16 });
          this.toSpawn--;
        }
        if (a.sound) a.sound.whistle();
      }

      // fall → ignite the moment the nose meets a rooftop
      for (var i = this.bombs.length - 1; i >= 0; i--) {
        var b = this.bombs[i];
        b.y += b.vy * dt;
        var bld = this._buildingAt(b.x);
        var roofY = bld ? bld.top : a.H;
        if (b.y - b.no >= roofY) { this.bombs.splice(i, 1); this._impact(b, bld, a); if (this.hits >= CFG.MAX_HITS) return; }
      }

      // embers + smoke from burning buildings
      this.emberT -= dt; this.smokeT -= dt;
      var emit = this.emberT <= 0, puff = this.smokeT <= 0;
      if (emit) this.emberT = 0.1;
      if (puff) this.smokeT = 0.16;
      for (var kk = 0; kk < this.buildings.length; kk++) {
        var bb = this.buildings[kk]; if (!bb.burning) continue;
        if (emit) a.burst(bb.x + bb.w / 2 + rand(-bb.w / 3, bb.w / 3), bb.top + rand(0, bb.h * 0.5), pick(["#ff8a3d", "#ffd23f", "#ff5d73"]), 2);
        if (puff) this.smoke.push({ x: bb.x + bb.w / 2 + rand(-bb.w / 4, bb.w / 4), y: bb.top - 4, vx: rand(-8, 14), vy: -rand(24, 40), r: rand(10, 20), t: 0, life: rand(2.2, 3.6) });
      }
      for (var sm2 = this.smoke.length - 1; sm2 >= 0; sm2--) {
        var sm = this.smoke[sm2]; sm.t += dt; sm.x += sm.vx * dt; sm.y += sm.vy * dt; sm.r += 14 * dt; sm.vx *= 0.99;
        if (sm.t >= sm.life) this.smoke.splice(sm2, 1);
      }
      if (this.smoke.length > 160) this.smoke.splice(0, this.smoke.length - 160);

      // atmosphere: clouds drift, searchlights sweep, rare shooting star
      for (var ci = 0; ci < this.clouds.length; ci++) { var cl = this.clouds[ci]; cl.x += cl.vx * dt; if (cl.x - cl.s > a.W) cl.x = -cl.s; }
      for (var bi = 0; bi < this.beams.length; bi++) this.beams[bi].ph += this.beams[bi].sp * dt;
      if (this.shoot) { var sh = this.shoot; sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.t += dt; if (sh.t >= sh.life) this.shoot = null; }
      else if (Math.random() < dt * 0.35) { this.shoot = { x: rand(a.W * 0.1, a.W * 0.9), y: rand(a.H * 0.05, a.H * 0.3), vx: rand(-260, -120), vy: rand(60, 130), t: 0, life: rand(0.5, 0.9) }; }

      // floating score pops + defuse rings
      for (var pi = this.pops.length - 1; pi >= 0; pi--) { var p = this.pops[pi]; p.t += dt; p.y += p.vy * dt; if (p.t >= p.life) this.pops.splice(pi, 1); }
      for (var ri = this.rings.length - 1; ri >= 0; ri--) { var rg = this.rings[ri]; rg.t += dt; if (rg.t >= rg.life) this.rings.splice(ri, 1); }
      if (this._flash > 0) this._flash = Math.max(0, this._flash - dt);
    },

    _impact: function (bomb, bld, a) {
      var dmg = bomb.boss ? 2 : 1;
      this.hits = Math.min(CFG.MAX_HITS, this.hits + dmg);
      this.hitsThisLevel += dmg;
      if (bomb.boss) this.bossAlive = false;
      if (bld && !bld.burning) {
        bld.burning = true; bld.flames = [];
        var t = Math.max(3, Math.round(bld.w / 12));
        for (var i = 0; i < t; i++) bld.flames.push({ ph: rand(0, 6.28), x: rand(0.08, 0.92) });
        this._renderCity(a);
      }
      a.shake(bomb.boss ? 30 : 20);
      if (a.sound) a.sound.boom(bomb.boss ? 1.5 : 1.25);
      a.burst(bomb.x, bomb.y - bomb.no, "#ffd23f", 26); a.burst(bomb.x, bomb.y - bomb.no, "#ff8a3d", 34); a.burst(bomb.x, bomb.y - bomb.no, "#ff5d73", 20);
      this._ring(bomb.x, bomb.y - bomb.no, "#ff5d73", bomb.boss ? 120 : 80);
      a.banner(this.hits >= CFG.MAX_HITS ? "CITY DOWN" : "ROOFTOP HIT! 🔥", 750);
      this._updateHUD(a);
      if (this.hits >= CFG.MAX_HITS) { this._endRun(a); return; }
      this._checkEnd(a);
    },

    _endRun: function (a) {
      var elapsed = Math.max(0.001, this.elapsed);
      var wpm = Math.round((this.keysCorrect / 5) / (elapsed / 60));
      var acc = (this.keysCorrect + this.wrong) > 0 ? Math.round(this.keysCorrect / (this.keysCorrect + this.wrong) * 100) : 100;
      a.end({
        score: this.score, unit: "pts", badge: "CITY IN FLAMES", title: "You reached level " + this.level,
        stats: [
          { k: "Score", v: fmt(this.score) },
          { k: "WPM", v: wpm },
          { k: "Accuracy", v: acc + "%" }
        ],
      });
    },

    targets: function () { return this.bombs.slice().sort(function (p, q) { return q.y - p.y; }); },

    hit: function (b, a) {
      var idx = this.bombs.indexOf(b); if (idx >= 0) this.bombs.splice(idx, 1);
      if (b.boss) this.bossAlive = false;
      var hard = b.boss || HARD_WORDS.indexOf(b.word) >= 0;
      this.keysCorrect += b.word.replace(/\s/g, "").length;
      // simple scoring: 10 for a basic word, 20 for a long/tricky one, 30 for a raid boss
      var large = HARD_WORDS.indexOf(b.word) >= 0 || b.word.length >= 7;
      var gain = b.boss ? 30 : (large ? 20 : 10);
      this.score += gain; this.cleared++;
      a.burst(b.x, b.y - b.no, "#7cf3ff", b.boss ? 34 : 20); a.burst(b.x, b.y - b.no, "#ffd23f", b.boss ? 16 : 8); a.shake(b.boss ? 10 : 3);
      this._ring(b.x, b.y - b.no, "#7cf3ff", b.boss ? 110 : 54);
      this._pop(b.x, b.y - b.no - 10, "+" + fmt(gain), b.boss ? "#ffd23f" : "#7cf3ff", 1.0, b.boss ? 22 : 16);
      this._updateHUD(a);
      if (b.boss) { a.banner("RAID CLEARED! +" + fmt(gain), 900); if (a.sound) a.sound.levelup(); }
      else { if (a.sound) a.sound.pop(); if (hard) a.banner("HARD WORD! +" + fmt(gain), 650); }
      this._checkEnd(a);
    },

    miss: function (a) { this.wrong++; },

    _pop: function (x, y, text, color, life, size) { this.pops.push({ x: x, y: y, text: text, color: color, t: 0, life: life || 1, vy: -46, size: size || 16 }); },
    _ring: function (x, y, color, max) { this.rings.push({ x: x, y: y, color: color, t: 0, life: 0.5, max: max || 60 }); },

    _updateHUD: function (a) {
      a.setStats({
        Level: this.level,
        Score: fmt(this.score),
        Hits: this.hits + " / " + CFG.MAX_HITS
      });
    },

    /* ---- render ---- */
    render: function (c, a) {
      var t = this.elapsed, W = a.W, H = a.H, i;

      // 1) layered night sky
      this._sky(c, a);
      // 2) far + near stars with twinkle
      for (i = 0; i < this.starsFar.length; i++) { var sf = this.starsFar[i]; c.globalAlpha = 0.22 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.1 + sf.ph)); c.fillStyle = "#cdd8ff"; c.beginPath(); c.arc(sf.x, sf.y, sf.r, 0, 7); c.fill(); }
      for (i = 0; i < this.stars.length; i++) { var st = this.stars[i]; c.globalAlpha = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.6 + st.ph)); c.fillStyle = "#eef4ff"; c.beginPath(); c.arc(st.x, st.y, st.r, 0, 7); c.fill(); }
      c.globalAlpha = 1;
      // shooting star
      if (this.shoot) { var sh = this.shoot, k = 1 - sh.t / sh.life; c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = "rgba(200,225,255," + (0.8 * k) + ")"; c.lineWidth = 2; c.beginPath(); c.moveTo(sh.x, sh.y); c.lineTo(sh.x - sh.vx * 0.06, sh.y - sh.vy * 0.06); c.stroke(); c.restore(); }
      // 3) moon
      this._moon(c, a);
      // 4) drifting clouds
      this._clouds(c, a);
      // 5) searchlight beams
      this._searchlights(c, a, t);

      // 6) city skyline (cached offscreen)
      if (this._city) c.drawImage(this._city, 0, 0, W, H);

      // 7) live twinkling windows + rooftop beacons
      for (i = 0; i < this.buildings.length; i++) {
        var b = this.buildings[i];
        if (!b.burning) {
          for (var wi = 0; wi < b.windows.length; wi++) {
            var win = b.windows[wi]; if (!win.lit || !win.tw) continue;
            c.globalAlpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3 + win.ph));
            c.fillStyle = win.warm ? "rgba(255,214,150,1)" : "rgba(150,200,255,1)";
            c.fillRect(b.x + win.wx, b.top + win.wy, 7, 10);
          }
        }
        c.globalAlpha = 1;
        if (b.beacon != null && Math.sin(t * 4 + b.x) > 0.2) {
          c.fillStyle = "#ff5d73"; c.shadowColor = "#ff5d73"; c.shadowBlur = 8;
          c.beginPath(); c.arc(b.beaconX, b.beacon, 2.4, 0, 7); c.fill(); c.shadowBlur = 0;
        }
      }
      c.globalAlpha = 1;

      // 8) smoke behind flames
      c.save();
      for (i = 0; i < this.smoke.length; i++) { var smk = this.smoke[i], sk = smk.t / smk.life; c.globalAlpha = 0.32 * (1 - sk); c.fillStyle = "#2a2f3a"; c.beginPath(); c.arc(smk.x, smk.y, smk.r, 0, 7); c.fill(); }
      c.restore(); c.globalAlpha = 1;

      // 9) full-building fire
      for (i = 0; i < this.buildings.length; i++) if (this.buildings[i].burning) this._fire(c, this.buildings[i], t, a);

      // 10) bomber fleet (extra planes appear once waves drop several at once)
      for (i = 0; i < this.jets.length; i++) this._jet(c, this.jets[i], t);

      // 11) bombs + word tags
      for (i = 0; i < this.bombs.length; i++) {
        var bmb = this.bombs[i];
        drawBomb(c, bmb.x, bmb.y - bmb.no, t, i, bmb.boss ? 1.9 : 1, bmb.boss);
        a.wordTag(c, bmb.x, bmb.y + bmb.to, bmb, { accent: bmb.boss ? "#ff6b81" : "#ffb454", size: bmb.boss ? 18 : 16 });
      }

      // 12) defuse rings + floating score pops
      c.save(); c.globalCompositeOperation = "lighter";
      for (i = 0; i < this.rings.length; i++) {
        var rg = this.rings[i], rk = rg.t / rg.life;
        c.globalAlpha = (1 - rk) * 0.8; c.strokeStyle = rg.color; c.lineWidth = 3 * (1 - rk) + 0.5;
        c.beginPath(); c.arc(rg.x, rg.y, rg.max * easeOutBack(Math.min(1, rk)), 0, 7); c.stroke();
      }
      c.restore(); c.globalAlpha = 1;
      c.textAlign = "center"; c.textBaseline = "middle";
      for (i = 0; i < this.pops.length; i++) {
        var p = this.pops[i], pk = p.t / p.life;
        c.globalAlpha = Math.max(0, 1 - pk);
        c.font = "800 " + Math.round(p.size * (1 + 0.15 * (1 - pk))) + "px 'Sora', system-ui, sans-serif";
        c.fillStyle = p.color; c.shadowColor = p.color; c.shadowBlur = 12;
        c.fillText(p.text, p.x, p.y); c.shadowBlur = 0;
      }
      c.globalAlpha = 1; c.textAlign = "left";

      // 13) subtle vignette + level-up flash
      c.save();
      var vg = c.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.42)");
      c.fillStyle = vg; c.fillRect(0, 0, W, H); c.restore();
      if (this._flash > 0) { c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = this._flash * 0.5; c.fillStyle = "#7cc8ff"; c.fillRect(0, 0, W, H); c.restore(); c.globalAlpha = 1; }
    },

    /* ---- atmosphere painters ---- */
    _sky: function (c, a) {
      var W = a.W, H = a.H;
      var sky = c.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#04050e"); sky.addColorStop(0.42, "#070c22"); sky.addColorStop(0.7, "#111a3e"); sky.addColorStop(1, "#241a3a");
      c.fillStyle = sky; c.fillRect(0, 0, W, H);
      // faint nebula band
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.10;
      var neb = c.createRadialGradient(W * 0.32, H * 0.24, 10, W * 0.32, H * 0.24, W * 0.5);
      neb.addColorStop(0, "#5a4bff"); neb.addColorStop(0.5, "#2a3aa0"); neb.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = neb; c.fillRect(0, 0, W, H * 0.6); c.restore();
    },

    _moon: function (c, a) {
      var mx = a.W * 0.83, my = a.H * 0.18, R = clamp(a.H * 0.06, 22, 42);
      c.save();
      // halo
      c.globalCompositeOperation = "lighter";
      var halo = c.createRadialGradient(mx, my, R * 0.5, mx, my, R * 3.2);
      halo.addColorStop(0, "rgba(230,235,255,0.35)"); halo.addColorStop(1, "rgba(230,235,255,0)");
      c.fillStyle = halo; c.beginPath(); c.arc(mx, my, R * 3.2, 0, 7); c.fill();
      c.globalCompositeOperation = "source-over";
      // disc
      var disc = c.createRadialGradient(mx - R * 0.3, my - R * 0.3, R * 0.2, mx, my, R);
      disc.addColorStop(0, "#fffaf0"); disc.addColorStop(0.7, "#f0ead2"); disc.addColorStop(1, "#d6d2be");
      c.fillStyle = disc; c.beginPath(); c.arc(mx, my, R, 0, 7); c.fill();
      // craters
      c.globalAlpha = 0.12; c.fillStyle = "#8a8672";
      c.beginPath(); c.arc(mx - R * 0.25, my - R * 0.1, R * 0.16, 0, 7); c.fill();
      c.beginPath(); c.arc(mx + R * 0.2, my + R * 0.22, R * 0.12, 0, 7); c.fill();
      c.beginPath(); c.arc(mx + R * 0.05, my - R * 0.3, R * 0.09, 0, 7); c.fill();
      c.restore();
    },

    _clouds: function (c, a) {
      c.save();
      for (var i = 0; i < this.clouds.length; i++) {
        var cl = this.clouds[i];
        var gr = c.createRadialGradient(cl.x, cl.y, cl.s * 0.15, cl.x, cl.y, cl.s);
        gr.addColorStop(0, "rgba(120,130,175," + cl.a + ")"); gr.addColorStop(1, "rgba(120,130,175,0)");
        c.fillStyle = gr; c.beginPath(); c.ellipse(cl.x, cl.y, cl.s, cl.s * 0.42, 0, 0, 7); c.fill();
      }
      c.restore();
    },

    _searchlights: function (c, a, t) {
      c.save(); c.globalCompositeOperation = "lighter";
      for (var i = 0; i < this.beams.length; i++) {
        var bm = this.beams[i];
        var ang = -Math.PI / 2 + Math.sin(bm.ph) * bm.amp; // sweep around vertical
        c.save();
        c.translate(bm.x, bm.y); c.rotate(ang);
        var gr = c.createLinearGradient(0, 0, 0, -bm.len);
        gr.addColorStop(0, "rgba(180,210,255,0.16)"); gr.addColorStop(0.6, "rgba(180,210,255,0.05)"); gr.addColorStop(1, "rgba(180,210,255,0)");
        c.fillStyle = gr;
        c.beginPath(); c.moveTo(-4, 0); c.lineTo(-bm.len * 0.13, -bm.len); c.lineTo(bm.len * 0.13, -bm.len); c.lineTo(4, 0); c.closePath(); c.fill();
        // bright source glow
        var sg = c.createRadialGradient(0, 0, 0, 0, 0, 10); sg.addColorStop(0, "rgba(210,230,255,0.6)"); sg.addColorStop(1, "rgba(210,230,255,0)");
        c.fillStyle = sg; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill();
        c.restore();
      }
      c.restore();
    },

    _fire: function (c, b, t, a) {
      var x = b.x, w = b.w, top = b.top, baseY = a.H;
      c.save();
      c.globalCompositeOperation = "lighter";
      var glow = c.createLinearGradient(0, top - 20, 0, baseY);
      glow.addColorStop(0, "rgba(255,140,50,0.30)"); glow.addColorStop(1, "rgba(255,60,20,0.12)");
      c.fillStyle = glow; c.fillRect(x - 6, top - 20, w + 12, baseY - top + 20);
      for (var wi = 0; wi < b.windows.length; wi++) {
        var win = b.windows[wi];
        var fl = 0.5 + 0.5 * Math.sin(t * 12 + win.ph);
        c.globalAlpha = 0.4 + 0.55 * fl;
        c.fillStyle = fl > 0.6 ? "rgba(255,220,120,0.95)" : "rgba(255,110,40,0.9)";
        c.fillRect(x + win.wx - 1, top + win.wy - 1, 9, 12);
      }
      c.globalAlpha = 1;
      var n = b.flames.length;
      for (var i = 0; i < n; i++) {
        var f = b.flames[i];
        var fx = x + f.x * w;
        var flick = 0.7 + 0.3 * Math.sin(t * 9 + f.ph) + Math.random() * 0.12;
        var reach = (b.h * 0.55 + 30) * flick;
        var wd = (w / n) * 1.2;
        var g = c.createRadialGradient(fx, top - reach * 0.3, 1, fx, top - reach * 0.3, reach);
        g.addColorStop(0, "rgba(255,246,200,0.95)");
        g.addColorStop(0.4, "rgba(255,150,45,0.7)");
        g.addColorStop(1, "rgba(200,30,10,0)");
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(fx - wd / 2, top + 6);
        c.quadraticCurveTo(fx - wd / 2, top - reach * 0.6, fx, top - reach);
        c.quadraticCurveTo(fx + wd / 2, top - reach * 0.6, fx + wd / 2, top + 6);
        c.closePath(); c.fill();
      }
      c.restore();
    },

    // B-2 style flying-wing stealth bomber (top-down) with a soft contrail.
    _jet: function (c, j, t) {
      var face = j.vx >= 0 ? 1 : -1, y = j.y + j.bob;
      // contrail behind the jet (drawn in world space, trailing the travel dir)
      c.save(); c.globalCompositeOperation = "lighter";
      var cg = c.createLinearGradient(j.x, y, j.x - face * 150, y);
      cg.addColorStop(0, "rgba(160,200,255,0.22)"); cg.addColorStop(1, "rgba(160,200,255,0)");
      c.fillStyle = cg; c.beginPath(); c.moveTo(j.x, y - 4); c.lineTo(j.x - face * 150, y - 1); c.lineTo(j.x - face * 150, y + 1); c.lineTo(j.x, y + 4); c.closePath(); c.fill();
      c.restore();

      c.save();
      c.translate(j.x, y); c.scale(face, 1);
      var S = 1.5; c.scale(S, S);
      c.fillStyle = "rgba(0,0,0,0.28)";
      c.beginPath(); c.ellipse(0, 8, 54, 12, 0, 0, 7); c.fill();
      c.beginPath();
      c.moveTo(46, 0);
      c.lineTo(-6, -30); c.lineTo(-16, -30); c.lineTo(-8, -14); c.lineTo(-20, -8); c.lineTo(-12, 0);
      c.lineTo(-20, 8); c.lineTo(-8, 14); c.lineTo(-16, 30); c.lineTo(-6, 30);
      c.closePath();
      var body = c.createLinearGradient(-20, 0, 46, 0);
      body.addColorStop(0, "#161b2e"); body.addColorStop(1, "#333c5c");
      c.fillStyle = body; c.fill();
      c.strokeStyle = "rgba(0,0,0,0.4)"; c.lineWidth = 1; c.stroke();
      c.fillStyle = "rgba(120,150,220,0.18)";
      c.beginPath(); c.moveTo(40, 0); c.lineTo(6, -6); c.lineTo(6, 6); c.closePath(); c.fill();
      c.fillStyle = "#455277";
      c.beginPath(); c.ellipse(22, 0, 8, 5, 0, 0, 7); c.fill();
      // engine exhaust glow at the trailing edge
      c.globalCompositeOperation = "lighter";
      c.fillStyle = "rgba(124,200,255,0.55)";
      c.beginPath(); c.arc(-14, -4, 3.4, 0, 7); c.fill();
      c.beginPath(); c.arc(-14, 4, 3.4, 0, 7); c.fill();
      c.globalCompositeOperation = "source-over";
      if (Math.sin(j.blink * 6) > 0) { c.fillStyle = "#ff5d73"; c.beginPath(); c.arc(-16, -30, 2, 0, 7); c.fill(); }
      else { c.fillStyle = "#6ee7b7"; c.beginPath(); c.arc(-16, 30, 2, 0, 7); c.fill(); }
      c.restore();
    },
  };

  A.register(game);
})();
