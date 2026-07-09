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
  // falling-bomb whistle: descending tone
  function sfxWhistle(delay) {
    if (!AC || !audioOn) return; var t = AC.currentTime + (delay || 0);
    var o = AC.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(280, t + 0.5);
    var g = AC.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.6);
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
    sound: { boom: sfxBoom, whistle: sfxWhistle, over: sfxGameOver },
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
    if (!/[a-z0-9]/.test(ch)) return;
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
    current = game;
    clearActive(); stats = {}; particles = []; shake = 0;
    layer.innerHTML = ""; over.hidden = true; banner.hidden = true;
    closeHub();
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

  function endGame(res) {
    stopLoop();
    sfxGameOver(); // defeat sting as the post-game dialog pops
    var id = current.id, best = getBest(id), score = Math.round(res.score || 0);
    var isBest = score > best;
    if (isBest) setBest(id, score);

    overBadge.textContent = res.badge || "GAME OVER";
    overTitle.textContent = res.title || "Nice run!";
    overStats.innerHTML = "";
    (res.stats || []).forEach(function (s) {
      var d = document.createElement("div");
      d.className = "game-over__stat";
      d.innerHTML = "<span>" + s.v + "</span><small>" + s.k + "</small>";
      overStats.appendChild(d);
    });
    overBest.hidden = false;
    if (isBest) { overBest.textContent = "🏆 New personal best!"; overBest.classList.add("is-best"); }
    else { overBest.textContent = "Best: " + fmt(best) + (res.unit ? " " + res.unit : ""); overBest.classList.remove("is-best"); }
    over.hidden = false;
  }

  function toArcade() {
    stopLoop();
    stage.classList.remove("is-open"); stage.setAttribute("aria-hidden", "true");
    over.hidden = true; cdown.hidden = true;
    current = null; clearActive();
    document.body.classList.remove("arcade-open");
    openHub();
  }
  function exitToMenu() {
    stopLoop();
    stage.classList.remove("is-open"); stage.setAttribute("aria-hidden", "true");
    over.hidden = true; cdown.hidden = true;
    current = null; clearActive();
    document.body.classList.remove("arcade-open");
  }

  /* ================================================================
                              THE  GAMES
     ================================================================ */
  var GAMES = [];

  /* ---------- WORD DROP · shared assets ---------- */
  // A pool of genuinely tricky words that show up more often as the raid escalates.
  var HARD_WORDS = (
    "rhythm sphinx zephyr quorum juxtapose labyrinth silhouette bureaucracy " +
    "conscience asymmetric onomatopoeia kaleidoscope quintessential unequivocally " +
    "philosophical extemporaneous nauseous liaison maelstrom paradigm mnemonic " +
    "isthmus czar fjord glyph crypt lymph tsunami vacuum awkward jinx pyx " +
    "conscientious surveillance entrepreneur handkerchief millennium bourgeois " +
    "hierarchy pneumonia sovereignty camouflage rendezvous questionnaire"
  ).split(/\s+/).filter(Boolean);

  function buildingTop(b) { return b.top; }

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

  GAMES.push({
    id: "drop", name: "Save Your City", icon: "🏙️", color: "#ff8a3d",
    tagline: "A B-2 bomber prowls the night skyline dropping word-bombs. Type each one to defuse it before it hits a rooftop. Three hits and the city burns.",
    MAX_HITS: 3,

    init: function (a) {
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
      if (phase === "intro" && this._intro) this._introBuild(a);
    },

    /* ================= CINEMATIC COLD-OPEN =================
       The B-2 sweeps in, the skyline detonates left-to-right into charred
       husks under black smoke, and "SAVE YOUR CITY" slams in over the blaze
       while a light countdown ticks above. Then live play hands you a fresh
       city to defend. ~4.6s; skippable with any key/click. */
    intro: { duration: 4.6, count: 5 },

    introInit: function (a) {
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
  });

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

  window.SprintArcade = { open: openHub, launch: function (id) { var g = GAMES.filter(function (x) { return x.id === id; })[0]; if (g) launch(g); } };
})();
