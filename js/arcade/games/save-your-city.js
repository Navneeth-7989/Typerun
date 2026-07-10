/* =========================================================
   SPRINT · Arcade — "Save Your City" (2D)
   A B-2 bomber prowls the night skyline dropping word-bombs.
   Type each one to defuse it before it strikes a rooftop.
   Three rooftop hits and the city burns.

   Pure 2D canvas render on the arcade engine's #game-canvas — the
   skyline, flames, smoke and bomber are all drawn with the 2D context.
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

  // A realistic falling aerial bomb, nose pointing down. Anchored so the nose
  // tip sits at (x, noseY) and the finned tail rises above it.
  function drawBomb(c, x, noseY, t, i) {
    c.save();
    c.translate(x, noseY);
    c.rotate(Math.sin(t * 5 + i) * 0.06); // subtle tumble as it falls
    var r = 6.5, L = 40; // body radius, length
    // faint speed streaks above the tail
    c.strokeStyle = "rgba(180,200,255,0.16)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-2, -L - 6); c.lineTo(-2, -L - 18); c.moveTo(2, -L - 4); c.lineTo(2, -L - 16); c.stroke();
    // tail fins (3 blades fanning from the top)
    c.fillStyle = "#2b3350";
    c.beginPath(); c.moveTo(-r, -L + 6); c.lineTo(-r - 6, -L - 4); c.lineTo(-r, -L + 12); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(r, -L + 6); c.lineTo(r + 6, -L - 4); c.lineTo(r, -L + 12); c.closePath(); c.fill();
    c.fillStyle = "#353d5c";
    c.fillRect(-2, -L - 2, 4, 12); // center fin
    // body — steel casing, pointed nose at bottom (y=0)
    var g = c.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, "#232a42"); g.addColorStop(0.45, "#5b678f"); g.addColorStop(0.6, "#7e8ab4"); g.addColorStop(1, "#2b3350");
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
    // warning band + highlight
    c.fillStyle = "#d0432f"; c.fillRect(-r, -L + 20, r * 2, 4);
    c.fillStyle = "rgba(255,255,255,0.4)"; c.fillRect(-r + 1.5, -L + 10, 1.6, L - 16);
    c.restore();
  }

  var game = {
    id: "drop", name: "Save Your City", icon: "🏙️", color: "#ff8a3d",
    tagline: "A B-2 bomber prowls the night skyline dropping word-bombs. Type each one to defuse it before it hits a rooftop. Three hits and the city burns.",
    MAX_HITS: 3,

    init: function (a) {
      this._inIntro = false;
      this.bombs = []; this.smoke = []; this.score = 0; this.cleared = 0; this.hits = 0;
      this.elapsed = 0; this.spawnT = 1.4; this.gap = 1.9; this.speed = 105;
      this.emberT = 0; this.smokeT = 0;
      this._buildCity(a);
      this.jet = { x: a.W * 0.5, y: a.H * 0.11, vx: 90, bob: 0, blink: 0 };
      a.setStats({ Score: 0, Defused: 0, Hits: "0 / 3" });
    },

    onResize: function (a) {
      this._buildCity(a);
      if (this.jet) this.jet.y = a.H * 0.11;
      if (this._inIntro && this._intro) this._introBuild(a);
    },

    /* ================= CINEMATIC COLD-OPEN =================
       The B-2 sweeps in, the skyline detonates left-to-right into charred
       husks under black smoke, and "SAVE YOUR CITY" slams in over the blaze
       while a light countdown ticks above. Then live play hands you a fresh
       city to defend. ~4.6s; skippable with any key/click. */
    intro: { duration: 4.6, count: 5 },

    introInit: function (a) {
      this._inIntro = true;
      this._introBuild(a);
      // a volley of falling-bomb whistles raining over the city
      if (a.sound) for (var i = 0; i < 6; i++) a.sound.whistle(0.1 + i * 0.4 + Math.random() * 0.22);
    },

    _introBuild: function (a) {
      // reuse the real city model so the look is consistent, then wipe it out
      this._buildCity(a);
      this.smoke = [];
      this._intro = {
        bomber: { x: -a.W * 0.25, y: a.H * 0.15 },
        booms: [],           // expanding fireballs
        frontX: -40,          // destruction wavefront
        lastBoomX: -999,
      };
      for (var i = 0; i < this.buildings.length; i++) this.buildings[i].burning = false;
    },

    introFrame: function (c, a, t, total) {
      var W = a.W, H = a.H, S = this._intro, i;
      var lit = clamp(t / 0.6, 0, 1);                       // fade-in
      var burnStart = 0.7, burnEnd = 2.9;
      var prog = clamp((t - burnStart) / (burnEnd - burnStart), 0, 1); // 0..1 sweep

      // --- sky: night deepening into a hellish red as the city burns ---
      var heat = clamp((t - burnStart) / 1.6, 0, 1);
      var sky = c.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#05060f");
      sky.addColorStop(0.55, mix("#0a1030", "#2a0a12", heat));
      sky.addColorStop(1, mix("#0b1228", "#5a1408", heat));
      c.fillStyle = sky; c.fillRect(0, 0, W, H);

      // stars, fading as smoke rolls in
      c.globalAlpha = 0.6 * lit * (1 - heat * 0.85);
      for (i = 0; i < this.stars.length; i++) { var st = this.stars[i]; c.fillStyle = "#dfe8ff"; c.beginPath(); c.arc(st.x, st.y, st.r, 0, 7); c.fill(); }
      c.globalAlpha = 1;
      // moon
      c.save(); c.globalAlpha = (1 - heat * 0.7) * lit; c.shadowColor = "rgba(255,240,200,0.5)"; c.shadowBlur = 36;
      c.fillStyle = "#f4ecd0"; c.beginPath(); c.arc(W * 0.82, H * 0.17, 30, 0, 7); c.fill(); c.restore();

      // --- destruction wavefront ignites buildings as it passes ---
      S.frontX = -40 + prog * (W + 80);
      for (i = 0; i < this.buildings.length; i++) {
        var b = this.buildings[i];
        if (!b.burning && (b.x + b.w / 2) < S.frontX) {
          b.burning = true;
          b.flames = [];
          var fn = Math.max(3, Math.round(b.w / 12));
          for (var k = 0; k < fn; k++) b.flames.push({ ph: rand(0, 6.28), x: rand(0.08, 0.92) });
          this._renderCity(a);                              // char it in the offscreen layer
          S.booms.push({ x: b.x + b.w / 2, y: b.top, r: 4, t: 0, life: rand(0.5, 0.8), big: b.w > 80 });
          a.shake(9);
          // throttled blasts so the cascade sounds like bombs raining across the city
          if (a.sound && (S.lastBoomT == null || t - S.lastBoomT > 0.1)) { a.sound.boom(rand(0.5, 0.95)); S.lastBoomT = t; }
          for (var e = 0; e < 6; e++) this.smoke.push({ x: b.x + b.w / 2 + rand(-b.w / 3, b.w / 3), y: b.top, vx: rand(-12, 18), vy: -rand(26, 46), r: rand(12, 24), t: 0, life: rand(2.4, 4) });
        }
      }

      // city (charred + intact) from the offscreen layer
      if (this._city) c.drawImage(this._city, 0, 0, W, H);

      // smoke first (behind flames), thicker over time
      updateIntroSmoke(this.smoke, 1 / 60);
      c.save();
      for (i = 0; i < this.smoke.length; i++) {
        var sm = this.smoke[i], kk = sm.t / sm.life;
        c.globalAlpha = 0.42 * (1 - kk);
        c.fillStyle = mix("#1a1c22", "#000000", 0.4);
        c.beginPath(); c.arc(sm.x, sm.y, sm.r, 0, 7); c.fill();
      }
      c.restore(); c.globalAlpha = 1;

      // flames on every burning building
      for (i = 0; i < this.buildings.length; i++) if (this.buildings[i].burning) this._fire(c, this.buildings[i], t, a);

      // ground heat glow
      c.save(); c.globalCompositeOperation = "lighter";
      var gg = c.createLinearGradient(0, H * 0.7, 0, H);
      gg.addColorStop(0, "rgba(255,80,20,0)"); gg.addColorStop(1, "rgba(255,90,25," + (0.28 * heat) + ")");
      c.fillStyle = gg; c.fillRect(0, H * 0.7, W, H * 0.3); c.restore();

      // expanding fireballs
      c.save(); c.globalCompositeOperation = "lighter";
      for (i = S.booms.length - 1; i >= 0; i--) {
        var bm = S.booms[i]; bm.t += 1 / 60; var bk = bm.t / bm.life;
        if (bk >= 1) { S.booms.splice(i, 1); continue; }
        var rr = (bm.big ? 90 : 60) * bk;
        var fg = c.createRadialGradient(bm.x, bm.y, 1, bm.x, bm.y, rr);
        fg.addColorStop(0, "rgba(255,255,230," + (1 - bk) + ")");
        fg.addColorStop(0.4, "rgba(255,160,50," + (0.8 * (1 - bk)) + ")");
        fg.addColorStop(1, "rgba(200,40,10,0)");
        c.fillStyle = fg; c.beginPath(); c.arc(bm.x, bm.y, rr, 0, 7); c.fill();
      }
      c.restore();

      // --- the bomber flies across, ahead of the wavefront ---
      var bx = -W * 0.25 + (t / 2.6) * (W * 1.5);
      if (bx < W * 1.3) this._jet(c, { x: bx, y: H * 0.15 + Math.sin(t * 2) * 5, vx: 1, bob: 0, blink: t }, t);

      // --- title card: "SAVE YOUR CITY" over the blaze ---
      var msgStart = 2.35;
      if (t > msgStart) {
        var m = clamp((t - msgStart) / 0.6, 0, 1), e = easeOutBack(m);
        c.save();
        c.textAlign = "center"; c.textBaseline = "middle";
        c.translate(W / 2 + Math.sin(t * 30) * (1 - m) * 6, H * 0.52);
        c.scale(0.75 + 0.25 * e, 0.75 + 0.25 * e);
        c.globalAlpha = m;
        // heavy glow
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

      // subtle dark vignette to frame it all
      c.save();
      var vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
      c.fillStyle = vg; c.fillRect(0, 0, W, H); c.restore();
    },

    /* ---- city model ---- */
    _buildCity: function (a) {
      var W = a.W, H = a.H;
      this.horizon = H * 0.55;
      // far, dim back-layer silhouettes for depth
      this.back = [];
      var bx = -20;
      while (bx < W + 20) { var bw = randInt(30, 60), bh = rand(H * 0.08, H * 0.2); this.back.push({ x: bx, w: bw, h: bh }); bx += bw - randInt(2, 8); }
      // main front skyline (a little shorter than before, more variety)
      var buildings = [], x = -14;
      var roofs = ["flat", "flat", "antenna", "water", "penthouse", "billboard", "setback"];
      while (x < W + 14) {
        var w = randInt(50, 104);
        var centre = clamp(1 - Math.abs((x + w / 2) / W - 0.5) * 1.3, 0.18, 1);
        var h = rand(H * 0.09, H * 0.12 + centre * H * 0.19); // shorter still → lower rooftops, more time to type
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
      this.stars = [];
      for (var s = 0; s < 90; s++) this.stars.push({ x: Math.random() * W, y: Math.random() * H * 0.55, r: rand(0.4, 1.7), ph: rand(0, 6.28) });
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
      // haze glow over the skyline base
      var grd = g.createLinearGradient(0, this.horizon, 0, H);
      grd.addColorStop(0, "rgba(70,90,160,0)"); grd.addColorStop(1, "rgba(120,70,150,0.22)");
      g.fillStyle = grd; g.fillRect(0, this.horizon, W, H - this.horizon);
      // far back-layer
      for (i = 0; i < this.back.length; i++) { var bk = this.back[i]; g.fillStyle = "rgba(20,28,60,0.6)"; g.fillRect(bk.x, H - bk.h, bk.w, bk.h); }

      for (i = 0; i < this.buildings.length; i++) {
        var b = this.buildings[i], topY = b.top;
        if (b.burning) {
          // charred husk — dark, windows blown
          g.fillStyle = "#140c12"; g.fillRect(b.x, topY, b.w, H - topY);
          g.fillStyle = "rgba(70,20,10,0.5)"; g.fillRect(b.x, topY, b.w, H - topY);
          continue;
        }
        // body + edge shading
        g.fillStyle = b.hue; g.fillRect(b.x, topY, b.w, H - topY);
        g.fillStyle = "rgba(150,180,255,0.06)"; g.fillRect(b.x, topY, 2, H - topY);
        g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(b.x + b.w - 3, topY, 3, H - topY);
        g.fillStyle = "rgba(170,200,255,0.14)"; g.fillRect(b.x, topY, b.w, 2);
        // windows
        for (var wi = 0; wi < b.windows.length; wi++) {
          var win = b.windows[wi]; if (!win.lit || win.tw) continue;
          g.fillStyle = win.warm ? "rgba(255,214,150,0.92)" : "rgba(150,200,255,0.85)";
          g.fillRect(b.x + win.wx, topY + win.wy, 7, 10);
        }
        this._roof(g, b);
      }
      // street glow + lamps
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
          g.fillStyle = b.sign; g.globalAlpha = 0.85; g.fillRect(cx - b.w * 0.3, topY - 22, b.w * 0.6, 14); g.globalAlpha = 1;
          g.fillStyle = "#0a1026"; g.fillRect(cx - 1, topY - 8, 2, 8); break;
        case "setback":
          g.fillStyle = b.hue; g.fillRect(cx - b.w * 0.32, topY - 22, b.w * 0.64, 22);
          g.fillStyle = "rgba(150,180,255,0.14)"; g.fillRect(cx - b.w * 0.32, topY - 22, b.w * 0.64, 2);
          break;
      }
    },

    /* ---- loop ---- */
    update: function (dt, a) {
      this.elapsed += dt;
      var j = this.jet;
      j.x += j.vx * dt; j.blink += dt;
      if (j.x < a.W * 0.14) { j.x = a.W * 0.14; j.vx = Math.abs(j.vx); }
      if (j.x > a.W * 0.86) { j.x = a.W * 0.86; j.vx = -Math.abs(j.vx); }
      j.bob = Math.sin(this.elapsed * 1.5) * 6;

      this.gap = Math.max(0.7, 1.9 - this.elapsed * 0.02);
      this.speed = 105 + this.elapsed * 4;

      // drop a bomb
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = this.gap * rand(0.75, 1.25);
        var hardChance = Math.min(0.4, 0.12 + this.elapsed * 0.006);
        var word;
        if (Math.random() < hardChance) word = pick(HARD_WORDS);
        else { var len = randInt(3, Math.min(7, 3 + Math.floor(this.elapsed / 22))); word = a.word(len, len); }
        this.bombs.push({ x: clamp(j.x, 40, a.W - 40), y: j.y + j.bob + 16, word: word, typedCount: 0, isActive: false, vy: this.speed * rand(0.9, 1.1) });
        if (a.sound) a.sound.whistle();
      }

      // fall → ignite the moment the nose meets a rooftop
      for (var i = this.bombs.length - 1; i >= 0; i--) {
        var b = this.bombs[i];
        b.y += b.vy * dt;
        var bld = this._buildingAt(b.x);
        var roofY = bld ? bld.top : a.H;
        if (b.y - 16 >= roofY) { this.bombs.splice(i, 1); this._impact(b, bld, a); if (this.hits >= this.MAX_HITS) return; }
      }

      // embers + smoke from burning buildings
      this.emberT -= dt; this.smokeT -= dt;
      var emit = this.emberT <= 0, puff = this.smokeT <= 0;
      if (emit) this.emberT = 0.1;
      if (puff) this.smokeT = 0.16;
      for (var k = 0; k < this.buildings.length; k++) {
        var bb = this.buildings[k]; if (!bb.burning) continue;
        if (emit) a.burst(bb.x + bb.w / 2 + rand(-bb.w / 3, bb.w / 3), bb.top + rand(0, bb.h * 0.5), pick(["#ff8a3d", "#ffd23f", "#ff5d73"]), 2);
        if (puff) this.smoke.push({ x: bb.x + bb.w / 2 + rand(-bb.w / 4, bb.w / 4), y: bb.top - 4, vx: rand(-8, 14), vy: -rand(24, 40), r: rand(10, 20), t: 0, life: rand(2.2, 3.6) });
      }
      // advance smoke
      for (var s = this.smoke.length - 1; s >= 0; s--) {
        var sm = this.smoke[s]; sm.t += dt; sm.x += sm.vx * dt; sm.y += sm.vy * dt; sm.r += 14 * dt; sm.vx *= 0.99;
        if (sm.t >= sm.life) this.smoke.splice(s, 1);
      }
      if (this.smoke.length > 160) this.smoke.splice(0, this.smoke.length - 160);
    },

    _impact: function (bomb, bld, a) {
      this.hits++;
      if (bld && !bld.burning) {
        bld.burning = true;
        bld.flames = [];
        var t = Math.max(3, Math.round(bld.w / 12));
        for (var i = 0; i < t; i++) bld.flames.push({ ph: rand(0, 6.28), x: rand(0.08, 0.92) });
        this._renderCity(a);
      }
      a.shake(20);
      if (a.sound) a.sound.boom(1.25); // blast/fire when a bomb strikes a rooftop
      a.burst(bomb.x, bomb.y - 16, "#ffd23f", 26); a.burst(bomb.x, bomb.y - 16, "#ff8a3d", 34); a.burst(bomb.x, bomb.y - 16, "#ff5d73", 20);
      a.setStat("Hits", this.hits + " / " + this.MAX_HITS);
      a.banner(this.hits >= this.MAX_HITS ? "CITY DOWN" : "ROOFTOP HIT! 🔥", 750);
      if (this.hits >= this.MAX_HITS) {
        a.end({
          score: this.score, unit: "pts", badge: "CITY IN FLAMES", title: "Held out for " + Math.round(this.elapsed) + "s",
          stats: [{ k: "Score", v: fmt(this.score) }, { k: "Defused", v: this.cleared }, { k: "Time", v: Math.round(this.elapsed) + "s" }],
        });
      }
    },

    targets: function () { return this.bombs.slice().sort(function (p, q) { return q.y - p.y; }); },

    hit: function (b, a) {
      var idx = this.bombs.indexOf(b); if (idx >= 0) this.bombs.splice(idx, 1);
      var hard = HARD_WORDS.indexOf(b.word) >= 0;
      this.score += (hard ? 30 : 12) + b.word.length * 3; this.cleared++;
      a.burst(b.x, b.y - 16, "#7cf3ff", 20); a.burst(b.x, b.y - 16, "#ffd23f", 8); a.shake(3);
      a.setStat("Score", fmt(this.score)); a.setStat("Defused", this.cleared);
      if (hard) a.banner("HARD WORD! +" + (30 + b.word.length * 3), 650);
      else if (this.cleared % 15 === 0) a.banner(this.cleared + " DEFUSED! 🛡️", 700);
    },

    miss: function (a) {},

    /* ---- render ---- */
    render: function (c, a) {
      var t = this.elapsed, i;
      // stars
      for (i = 0; i < this.stars.length; i++) {
        var st = this.stars[i];
        c.globalAlpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.5 + st.ph));
        c.fillStyle = "#dfe8ff"; c.beginPath(); c.arc(st.x, st.y, st.r, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
      // moon
      c.save(); c.shadowColor = "rgba(255,240,200,0.5)"; c.shadowBlur = 40;
      c.fillStyle = "#f4ecd0"; c.beginPath(); c.arc(a.W * 0.84, a.H * 0.18, 32, 0, 7); c.fill(); c.restore();

      // city
      if (this._city) c.drawImage(this._city, 0, 0, a.W, a.H);

      // live twinkling windows + rooftop beacons
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

      // smoke (behind flames)
      c.save();
      for (i = 0; i < this.smoke.length; i++) {
        var sm = this.smoke[i], k = sm.t / sm.life;
        c.globalAlpha = 0.32 * (1 - k);
        c.fillStyle = "#2a2f3a";
        c.beginPath(); c.arc(sm.x, sm.y, sm.r, 0, 7); c.fill();
      }
      c.restore();
      c.globalAlpha = 1;

      // full-building fire
      for (i = 0; i < this.buildings.length; i++) if (this.buildings[i].burning) this._fire(c, this.buildings[i], t, a);

      // bomber
      this._jet(c, this.jet, t);

      // bombs
      for (i = 0; i < this.bombs.length; i++) {
        var bmb = this.bombs[i];
        drawBomb(c, bmb.x, bmb.y - 16, t, i);
        a.wordTag(c, bmb.x, bmb.y + 16, bmb, { accent: "#ffb454", size: 16 });
      }
    },

    _fire: function (c, b, t, a) {
      var x = b.x, w = b.w, top = b.top, baseY = a.H;
      c.save();
      c.globalCompositeOperation = "lighter";
      // whole-facade glow
      var glow = c.createLinearGradient(0, top - 20, 0, baseY);
      glow.addColorStop(0, "rgba(255,140,50,0.30)"); glow.addColorStop(1, "rgba(255,60,20,0.12)");
      c.fillStyle = glow; c.fillRect(x - 6, top - 20, w + 12, baseY - top + 20);
      // window fires flickering up the facade
      for (var wi = 0; wi < b.windows.length; wi++) {
        var win = b.windows[wi];
        var fl = 0.5 + 0.5 * Math.sin(t * 12 + win.ph);
        c.globalAlpha = 0.4 + 0.55 * fl;
        c.fillStyle = fl > 0.6 ? "rgba(255,220,120,0.95)" : "rgba(255,110,40,0.9)";
        c.fillRect(x + win.wx - 1, top + win.wy - 1, 9, 12);
      }
      c.globalAlpha = 1;
      // flame tongues rising the full height, tallest at the roof
      var n = b.flames.length;
      for (var i = 0; i < n; i++) {
        var f = b.flames[i];
        var fx = x + f.x * w;
        var flick = 0.7 + 0.3 * Math.sin(t * 9 + f.ph) + Math.random() * 0.12;
        var reach = (b.h * 0.55 + 30) * flick;         // licks well up the building
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

    // B-2 style flying-wing stealth bomber (top-down), bigger than the old heli.
    _jet: function (c, j, t) {
      var face = j.vx >= 0 ? 1 : -1, y = j.y + j.bob;
      c.save();
      c.translate(j.x, y); c.scale(face, 1);
      var S = 1.5; c.scale(S, S);
      // soft shadow
      c.fillStyle = "rgba(0,0,0,0.28)";
      c.beginPath(); c.ellipse(0, 8, 54, 12, 0, 0, 7); c.fill();
      // flying-wing planform (nose points +x)
      c.beginPath();
      c.moveTo(46, 0);            // nose
      c.lineTo(-6, -30);          // leading edge → left tip
      c.lineTo(-16, -30);         // left wingtip
      c.lineTo(-8, -14);          // trailing sawtooth
      c.lineTo(-20, -8);
      c.lineTo(-12, 0);
      c.lineTo(-20, 8);           // mirror
      c.lineTo(-8, 14);
      c.lineTo(-16, 30);
      c.lineTo(-6, 30);
      c.closePath();
      var body = c.createLinearGradient(-20, 0, 46, 0);
      body.addColorStop(0, "#161b2e"); body.addColorStop(1, "#333c5c");
      c.fillStyle = body; c.fill();
      c.strokeStyle = "rgba(0,0,0,0.4)"; c.lineWidth = 1; c.stroke();
      // center spine + cockpit bump
      c.fillStyle = "rgba(120,150,220,0.18)";
      c.beginPath(); c.moveTo(40, 0); c.lineTo(6, -6); c.lineTo(6, 6); c.closePath(); c.fill();
      c.fillStyle = "#455277";
      c.beginPath(); c.ellipse(22, 0, 8, 5, 0, 0, 7); c.fill();
      // engine exhaust glow at the trailing edge
      c.globalCompositeOperation = "lighter";
      c.fillStyle = "rgba(124,200,255,0.5)";
      c.beginPath(); c.arc(-14, -4, 3, 0, 7); c.fill();
      c.beginPath(); c.arc(-14, 4, 3, 0, 7); c.fill();
      c.globalCompositeOperation = "source-over";
      // wingtip nav lights
      if (Math.sin(j.blink * 6) > 0) { c.fillStyle = "#ff5d73"; c.beginPath(); c.arc(-16, -30, 2, 0, 7); c.fill(); }
      else { c.fillStyle = "#6ee7b7"; c.beginPath(); c.arc(-16, 30, 2, 0, 7); c.fill(); }
      c.restore();
    },
  };

  A.register(game);
})();
