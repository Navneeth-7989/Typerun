/* =========================================================
   SPRINT · Typing Race — game logic
   Race real people (via Firebase) and/or bots. One unified
   "racer" model drives solo practice and live multiplayer.
   No frameworks, no build step. Runs from a static file host.
   ========================================================= */
(() => {
  "use strict";

  /* ---------- passage pool (rotated via a shuffle bag so it feels fresh) ---------- */
  const PASSAGES = [
    "The quick brown fox jumps over the lazy dog while the morning sun climbs slowly above the distant hills and paints the fields in gold.",
    "Every great runner knows that the race is won long before the starting gun fires, in the quiet hours of practice when nobody is watching.",
    "Focus on the rhythm of your fingers and let the words flow like water down a mountain stream, steady and certain and never in a hurry.",
    "Success is not about being faster than everyone else on a single day but about showing up again and again until speed becomes a habit.",
    "The stadium roared as the sprinters lined up, muscles tense and eyes fixed on the horizon, waiting for the moment the world would blur.",
    "A calm mind types faster than a frantic one, so breathe slowly, trust your training, and watch the letters fall neatly into place.",
    "Precision beats panic in every race worth running, because a single mistake can cost more time than a dozen careful, confident strokes.",
    "When the track stretches out before you and the crowd falls silent, remember that every champion once started exactly where you are now.",
    "The best keyboards feel almost invisible, so that thought becomes text without any friction between the mind and the glowing screen.",
    "Rain fell softly on the empty streets as the city slept, and a single lamp glowed warm against the cool blue shadows of the night.",
    "Curiosity is the engine that pulls a person forward, opening doors that fear would rather keep shut and questions worth chasing.",
    "A good habit is nothing more than a decision you no longer have to make, quietly repeated until it carries you on its own.",
    "The ocean does not hurry, yet it shapes entire coastlines, one patient wave at a time, over years far longer than we can imagine.",
    "Small daily improvements are the true secret to staggering long term results, so measure progress in weeks and not in single days.",
    "He packed a light bag, checked the map one final time, and stepped onto the trail just as the first pale light touched the peaks.",
    "Words are tools, and the more of them you keep sharp and ready, the more precisely you can carve your thoughts into the world.",
    "The clever engineer knew that the simplest design was almost always the strongest, so she deleted far more code than she ever wrote.",
    "Between the mountains and the sea there is a narrow road that few people travel, lined with old pines and the smell of warm dust.",
    "Speed comes from calm, and calm comes from practice, so the fastest hands in any room are usually the ones that look unhurried.",
    "A library is a quiet storm of ideas, each book a lightning bolt waiting for the right reader to reach up and pull it down.",
    "The scientist wrote her notes carefully, knowing that a future stranger might build something wonderful on the foundation she laid.",
    "Autumn arrived overnight, turning the whole valley to copper and flame, and the wind carried the sound of leaves like distant applause.",
    "Trust the process even on the days it feels slow, because roots grow in silence long before the first green shoot breaks the soil.",
    "The old clockmaker believed that time was a river you could not stop, only learn to row across with steady and honest strokes.",
    "Every expert was once a beginner who refused to quit, stumbling through the hard early days until the difficult became familiar.",
    "The city lights blurred into ribbons as the train picked up speed, carrying strangers toward a hundred different tomorrows at once.",
    "A single kind sentence can change the whole shape of someone's day, so spend your words the way you would spend rare and precious coins.",
    "The mountain did not care how badly he wanted to reach the summit; it only rewarded the climber who kept placing one foot higher.",
    "Great writing is mostly rewriting, cutting away everything that does not serve the story until only the sharp bright truth remains.",
    "She learned to code the way others learn a language, one small phrase at a time, until the strange symbols began to whisper back.",
    "The garden taught him patience, for no amount of shouting could make a seed grow faster than its own quiet inner clock allowed.",
    "In the workshop the smell of sawdust and coffee mixed together, and the steady rhythm of the hammer marked the passing of the hours.",
    "Discipline is choosing between what you want now and what you want most, and the gap between those two things is where character grows.",
    "The lighthouse stood alone against the storm, throwing its patient beam across the waves for ships it would never see or meet.",
    "Learning to type without looking is like learning to walk again, awkward at first, then suddenly so natural you forget you ever tried.",
    "The map is not the territory, so put down the plan now and then and let your own two feet discover what the paper left out.",
    "On July 20, 1969, at 10:56 p.m., Neil Armstrong stepped onto the Moon; over 600 million people watched it live on TV.",
    "The recipe needs 2 cups of flour, 1/2 cup of sugar, 3 eggs, and exactly 350 degrees for 25 minutes -- no more, no less.",
    "\"Are you serious?\" he asked. \"We shipped 1,000 units in 48 hours, and returns were under 0.5%!\" The whole team cheered.",
    "Room 214 is on the 2nd floor; take the elevator, turn left, and it's the 3rd door past the water cooler (near exit B).",
    "By 2030, experts predict that 75% of all cars sold will be electric, cutting emissions by roughly 1.8 billion tons a year.",
    "She scored 98, 100, and 95 on her tests -- an average of 97.6 -- which, honestly, was 12 points higher than she expected.",
    "The password must contain at least 8 characters: 1 uppercase, 1 number, and 1 symbol like @, #, or &. Simple, right?",
    "\"Meet me at 5:45,\" the note read, \"and bring $20, two tickets, and that map we bought back in 2019.\" It was signed X.",
    "Water boils at 100 C (212 F) at sea level, but on Mount Everest -- about 8,849 meters up -- it boils near 71 C instead.",
    "He ran the marathon (all 26.2 miles) in 3 hours, 14 minutes, and 9 seconds; his goal? To finish under 3:30 next year.",
    "The invoice totals $4,275.50, due within 30 days; a 2% discount applies if paid before the 15th -- otherwise, full price.",
    "Fun fact: honey never spoils. Archaeologists found 3,000-year-old jars in Egypt that were, believe it or not, still good!",
    "\"Section 4.2,\" the manual warns, \"must not be skipped.\" Yet 9 out of 10 users click 'Next' without reading a word.",
    "Our flight (BA-297) departs at 6:10 a.m. from Gate 42; boarding starts 45 minutes early, so don't arrive after 5:25.",
    "The stock jumped 14% on Monday, dipped 3% on Tuesday, then closed flat -- proving, once again, that markets love drama.",
    "\"Type faster!\" the coach yelled. In 60 seconds she hit 112 words, made only 2 errors, and beat her record by 8 WPM.",
  ];

  const LENGTH_SENTENCES = { short: 1, medium: 2, long: 3 };

  /* ---------- bot templates (visual identity + skill) ---------- */
  const BOT_TEMPLATES = [
    { name: "Rookie", color: "#6ee7b7", baseWpm: 52, sub: "easy",   look: { skin: "#f2c9a0", hair: "#3a2b1a", pants: "#22543d" } },
    { name: "Blaze",  color: "#7cc4ff", baseWpm: 78, sub: "medium", look: { skin: "#e8b98a", hair: "#1a1a1a", pants: "#1e3a5f" } },
    { name: "Nova",   color: "#b79bff", baseWpm: 77, sub: "medium", look: { skin: "#d9a878", hair: "#4a2c1a", pants: "#3b2a5f" } },
    { name: "Titan",  color: "#ff6b81", baseWpm: 93, sub: "hard",   look: { skin: "#c89060", hair: "#0f0f0f", pants: "#5f1e2a" } },
    { name: "Comet",  color: "#ffa94d", baseWpm: 68, sub: "medium", look: { skin: "#e6b58a", hair: "#2a1a0a", pants: "#5f3a1e" } },
  ];

  const YOU_LOOK = { skin: "#f4d0a8", hair: "#2a1c10", pants: "#5f4a1e", color: "#ffd23f" };

  // colors handed to real opponents, in join order (you always keep gold)
  const PLAYER_LOOKS = [
    { color: "#7cf3ff", skin: "#e8c4a0", hair: "#20140a", pants: "#12414a" },
    { color: "#6ee7b7", skin: "#d9a878", hair: "#3a2b1a", pants: "#1f5f3f" },
    { color: "#b79bff", skin: "#c89060", hair: "#0f0f0f", pants: "#3b2a5f" },
    { color: "#ff9bb0", skin: "#f2c9a0", hair: "#4a2c1a", pants: "#5f1e3a" },
    { color: "#ffd98a", skin: "#e6b58a", hair: "#241608", pants: "#5f4a1e" },
  ];

  const FINISH_MARGIN = 0.946; // matches CSS finish line position (right: 5.4%)

  const PERSON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6z"/></svg>';

  /* ---------- state ---------- */
  const S = {
    phase: "menu",          // menu | lobby | countdown | racing | done
    mode: "solo",           // solo | multi
    length: "medium",
    text: "",
    typedCount: 0,
    correctChars: 0,
    keystrokes: 0,
    errors: 0,
    wrongCount: 0,          // uncorrected wrong chars currently on screen
    minWrong: Infinity,     // index of the earliest uncorrected wrong char
    startPerf: 0,           // solo time base (performance.now)
    raceStartAt: 0,         // multi time base (server ms)
    liveAt: false,          // has the countdown finished (typing allowed)?
    lastFrame: 0,
    rafId: 0,
    finished: false,
    racers: [],             // unified list; each has .type: you | bot | remote
    room: null,             // latest multiplayer room snapshot
  };

  /* ---------- element refs ---------- */
  const $ = (s) => document.querySelector(s);
  const el = {
    screens: {
      menu: $("#screen-menu"),
      lobby: $("#screen-lobby"),
      race: $("#screen-race"),
      results: $("#screen-results"),
    },
    // menu
    btnRaceNow: $("#btn-race-now"),
    btnSolo: $("#btn-solo"),
    btnFriends: $("#btn-friends"),
    menuYou: $("#menu-you-name"),
    // friends panel
    friends: $("#friends-panel"),
    btnCreatePrivate: $("#btn-create-private"),
    joinCode: $("#join-code-input"),
    btnJoinCode: $("#btn-join-code"),
    btnFriendsClose: $("#btn-friends-close"),
    friendsError: $("#friends-error"),
    // lobby
    lobbyTitle: $("#lobby-title"),
    lobbyStatus: $("#lobby-status"),
    lobbyTrackLanes: $("#lobby-track-lanes"),
    lobbyCount: $("#lobby-count"),
    lobbyCountNum: $("#lobby-count-num"),
    lobbyCodeWrap: $("#lobby-code-wrap"),
    lobbyCode: $("#lobby-code"),
    btnCopyLink: $("#btn-copy-link"),
    btnLobbyStart: $("#btn-lobby-start"),
    btnLobbyLeave: $("#btn-lobby-leave"),
    lobbyHint: $("#lobby-hint"),
    // race
    lanes: $("#lanes"),
    passage: $("#passage"),
    input: $("#hidden-input"),
    typePanel: $(".type-panel"),
    typeStatus: $("#type-status"),
    countdown: $("#countdown"),
    countdownNum: $("#countdown-num"),
    hud: {
      wpm: $("#hud-wpm"), acc: $("#hud-acc"), pos: $("#hud-pos"),
      time: $("#hud-time"), progress: $("#hud-progress"),
    },
    // results
    resultsCard: $(".results"),
    resultsPlace: $("#results-place"),
    resultsTitle: $("#results-title"),
    resultsBanner: $("#results-banner"),
    resultsBoard: $("#results-board"),
    resultsNote: $("#results-note"),
    resWpm: $("#res-wpm"), resAcc: $("#res-acc"), resTime: $("#res-time"),
    btnAgain: $("#btn-again"), btnMenu: $("#btn-menu"),
  };

  /* ---------- helpers ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  // Seeded RNG so every client in a room generates the SAME passage + bots.
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ordinal = (n) => ["1st", "2nd", "3rd", "4th", "5th"][n - 1] || n + "th";
  const net = () => window.SprintNet;
  const user = () => window.SPRINT_USER || { uid: "local", name: "You", isGuest: true, photoURL: null };

  function showScreen(name) {
    Object.values(el.screens).forEach((s) => s.classList.remove("is-active"));
    el.screens[name].classList.add("is-active");
  }

  /* ---------- passage + bot builders (shared with the network layer) ---------- */
  // Passage is randomized each race; with a seed (the roomId) it is identical
  // on every client so multiplayer racers all type the same text.
  function makePassage(seed) {
    const rnd = seed != null ? mulberry32(hashSeed(String(seed))) : Math.random;
    const lengths = Object.keys(LENGTH_SENTENCES);
    const len = lengths[Math.floor(rnd() * lengths.length)];
    const n = LENGTH_SENTENCES[len];
    const parts = [];
    const used = {};
    for (let i = 0; i < n; i++) {
      let idx = Math.floor(rnd() * PASSAGES.length);
      let guard = 0;
      while (used[idx] && guard++ < PASSAGES.length) idx = (idx + 1) % PASSAGES.length;
      used[idx] = true;
      parts.push(PASSAGES[idx]);
    }
    return parts.join(" ");
  }

  // Deterministic bots: each carries a targetTime (seconds to finish). With a
  // seed, every client generates identical bots and agrees on the outcome.
  function makeBots(passage, count, seed) {
    const rnd = seed != null ? mulberry32(hashSeed(String(seed) + ":bots")) : Math.random;
    const words = passage.length / 5;
    const bots = [];
    for (let i = 0; i < count; i++) {
      const t = BOT_TEMPLATES[i % BOT_TEMPLATES.length];
      const wpm = t.baseWpm + (rnd() * 6 - 3);
      const targetTime = (words / wpm) * 60;
      bots.push({
        id: "bot" + i,
        name: t.name,
        color: t.color,
        sub: t.sub,
        look: { ...t.look, color: t.color },
        wpm: Math.round(wpm),
        targetTime,
        phase: rnd() * Math.PI * 2,
      });
    }
    return bots;
  }

  function botProgress(bot, elapsed) {
    if (elapsed <= 0) return 0;
    if (elapsed >= bot.targetTime) return FINISH_MARGIN;
    const t = elapsed / bot.targetTime;
    const wiggle = Math.sin(elapsed * 2.1 + bot.phase) * 0.010;
    return clamp(t + wiggle, 0, 1) * FINISH_MARGIN;
  }
  function botWpm(bot, elapsed) {
    if (elapsed <= 0 || elapsed >= bot.targetTime) return bot.wpm;
    return Math.max(1, Math.round(bot.wpm + Math.sin(elapsed * 3 + bot.phase) * 4));
  }

  /* ---------- runner + lane markup ---------- */
  function buildRunnerMarkup(look) {
    return `
      <div class="runner" style="--c:${look.color};--skin:${look.skin};--hair:${look.hair};--pants:${look.pants}">
        <span class="head"></span>
        <span class="torso"></span>
        <span class="arm arm--back"></span>
        <span class="leg leg--back"></span>
        <span class="arm arm--front"></span>
        <span class="leg leg--front"></span>
      </div>`;
  }

  function buildLanes() {
    el.lanes.innerHTML = S.racers
      .map((r) => `
      <div class="lane" data-id="${r.id}">
        <span class="lane__tag" style="color:${r.color}">
          <span class="racer-chip__dot" style="background:${r.color};width:9px;height:9px"></span>
          ${escapeHtml(r.label)} <small class="lane__wpm" data-wpm="${r.id}">0 wpm</small>
        </span>
        <div class="runner-unit ${r.type === "you" ? "runner-unit--you" : ""}" data-unit="${r.id}" style="left:2.5%">
          <span class="streak" style="--c:${r.color}"></span>
          <span class="dust"></span><span class="dust"></span><span class="dust"></span>
          ${buildRunnerMarkup(r.look)}
        </div>
      </div>`)
      .join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- passage rendering (chars + gliding caret) ---------- */
  function renderPassage() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < S.text.length; i++) {
      const c = S.text[i];
      const span = document.createElement("span");
      span.className = "ch" + (c === " " ? " space" : "");
      span.textContent = c;
      span.dataset.i = i;
      frag.appendChild(span);
    }
    const caret = document.createElement("span");
    caret.className = "caret";
    const inner = document.createElement("div");
    inner.className = "passage__inner";
    inner.appendChild(caret);
    inner.appendChild(frag);
    el.passage.innerHTML = "";
    el.passage.appendChild(inner);
    el.passageInner = inner;
    S.caret = caret;
    S.chars = inner.querySelectorAll(".ch");
    S.currentEl = null;
    markCurrent();
  }

  function positionCaret(target) {
    if (!S.caret) return;
    if (target) {
      S.caret.style.display = "block";
      S.caret.style.transform = "translate(" + target.offsetLeft + "px," + target.offsetTop + "px)";
    } else if (S.chars.length) {
      const last = S.chars[S.chars.length - 1];
      S.caret.style.transform = "translate(" + (last.offsetLeft + last.offsetWidth) + "px," + last.offsetTop + "px)";
    }
  }

  function markCurrent() {
    if (S.currentEl) S.currentEl.classList.remove("current");
    const next = S.typedCount < S.chars.length ? S.chars[S.typedCount] : null;
    if (next) next.classList.add("current");
    S.currentEl = next;
    positionCaret(next);
    updateScroll(next);
  }

  function updateScroll(activeEl) {
    if (!el.passageInner) return;
    const target = activeEl || S.chars[S.chars.length - 1];
    if (!target) return;
    const lineBox = parseFloat(getComputedStyle(el.passage).lineHeight) || target.offsetHeight || 30;
    const lineIndex = Math.round(target.offsetTop / lineBox);
    const offset = Math.max(0, (lineIndex - 1) * lineBox);
    el.passageInner.style.transform = "translateY(" + -offset + "px)";
  }

  /* ---------- assemble the racer list ---------- */
  function youRacer() {
    return {
      id: "you", type: "you", uid: user().uid,
      label: (user().name || "You") + " (you)",
      color: YOU_LOOK.color, look: { ...YOU_LOOK }, sub: "you",
      progress: 0, wpm: 0, finishTime: null,
    };
  }

  function buildSoloRacers() {
    S.text = makePassage();
    const bots = makeBots(S.text, 4);
    S.racers = [
      youRacer(),
      ...bots.map((b) => ({ ...b, type: "bot", progress: 0, finishTime: null })),
    ];
  }

  function buildMultiRacers(room) {
    S.text = room.passage;
    const others = room.players.filter((p) => p.uid !== room.me);
    const remote = others.map((p, i) => {
      const look = PLAYER_LOOKS[i % PLAYER_LOOKS.length];
      return {
        id: "p_" + p.uid, type: "remote", uid: p.uid,
        label: p.name + (p.isGuest ? "" : " ✓"),
        color: look.color, look: { ...look, color: look.color }, sub: "player",
        progress: p.progress || 0, wpm: p.wpm || 0,
        finished: !!p.finished, finishTime: p.finishTime,
      };
    });
    const bots = (room.bots || []).map((b) => ({
      ...b, type: "bot", progress: 0, finishTime: null,
    }));
    S.racers = [youRacer(), ...remote, ...bots];
  }

  // refresh remote racers' live data from a room snapshot (during the race)
  function syncRemotes(room) {
    room.players.forEach((p) => {
      if (p.uid === room.me) return;
      const r = S.racers.find((x) => x.uid === p.uid);
      if (r) {
        r.progress = p.progress || 0;
        r.wpm = p.wpm || 0;
        r.finished = !!p.finished;
        r.finishTime = p.finishTime;
      }
    });
  }

  /* ---------- time base ---------- */
  function elapsedSec() {
    if (S.mode === "multi") return (net().serverNow() - S.raceStartAt) / 1000;
    return (performance.now() - S.startPerf) / 1000;
  }

  /* ---------- solo start ---------- */
  function startSolo() {
    if (S.phase === "countdown" || S.phase === "racing") return;
    S.mode = "solo";
    resetRaceState();
    buildSoloRacers();
    enterRaceScreen();
    // classic local 3-2-1
    el.countdown.classList.add("is-active");
    const steps = ["3", "2", "1", "GO!"];
    let i = 0;
    const tick = () => {
      const n = el.countdownNum;
      n.textContent = steps[i];
      n.classList.remove("pop", "go");
      void n.offsetWidth;
      n.classList.add(i === steps.length - 1 ? "go" : "pop");
      i++;
      if (i < steps.length) setTimeout(tick, 850);
      else setTimeout(beginSolo, 800);
    };
    S.phase = "countdown";
    tick();
  }

  function beginSolo() {
    el.countdown.classList.remove("is-active");
    S.phase = "racing";
    S.liveAt = true;
    S.startPerf = performance.now();
    S.lastFrame = S.startPerf;
    el.typeStatus.textContent = "GO! Type as fast as you can.";
    el.input.focus();
    document.querySelectorAll(".runner-unit").forEach((u) => u.classList.add("is-running"));
    S.rafId = requestAnimationFrame(loop);
  }

  /* ---------- multiplayer start ---------- */
  function enterMultiRace(room) {
    S.mode = "multi";
    resetRaceState();
    S.room = room;
    S.raceStartAt = room.raceStartAt;
    buildMultiRacers(room);
    enterRaceScreen();
    S.phase = "racing";
    S.liveAt = false;
    S.lastFrame = performance.now();
    document.querySelectorAll(".runner-unit").forEach((u) => u.classList.add("is-running"));
    S.rafId = requestAnimationFrame(loop);
  }

  function resetRaceState() {
    cancelAnimationFrame(S.rafId);
    S.typedCount = 0;
    S.correctChars = 0;
    S.keystrokes = 0;
    S.errors = 0;
    S.wrongCount = 0;
    S.minWrong = Infinity;
    S.finished = false;
    S.liveAt = false;
  }

  function enterRaceScreen() {
    buildLanes();
    renderPassage();
    showScreen("race");
    el.input.value = "";
    el.typeStatus.textContent = "Get ready…";
  }

  /* ---------- the main loop ---------- */
  function loop(now) {
    if (S.phase !== "racing") return;
    const total = S.text.length;
    const elapsed = elapsedSec();

    // multiplayer synced countdown
    if (S.mode === "multi" && !S.liveAt) {
      const remaining = -elapsed; // seconds until go
      if (remaining > 0) {
        el.countdown.classList.add("is-active");
        const num = Math.min(3, Math.ceil(remaining));
        if (el.countdownNum.textContent !== String(num)) {
          el.countdownNum.textContent = num;
          el.countdownNum.classList.remove("pop"); void el.countdownNum.offsetWidth;
          el.countdownNum.classList.add("pop");
        }
      } else {
        el.countdownNum.textContent = "GO!";
        el.countdownNum.classList.add("go");
        setTimeout(() => el.countdown.classList.remove("is-active"), 500);
        S.liveAt = true;
        el.typeStatus.textContent = "GO! Type as fast as you can.";
        el.input.focus();
      }
    }

    // advance bots (deterministic)
    S.racers.forEach((r) => {
      if (r.type !== "bot") return;
      r.progress = botProgress(r, elapsed);
      r.wpmNow = botWpm(r, elapsed);
      if (r.progress >= FINISH_MARGIN && r.finishTime == null) r.finishTime = r.targetTime;
    });

    // you
    const you = S.racers.find((r) => r.type === "you");
    const runElapsed = S.liveAt ? Math.max(0.0001, elapsed) : 0.0001;
    you.wpm = (S.correctChars / 5) / (runElapsed / 60);
    // Runner advances by the correct streak from the start — an uncorrected
    // mistake stops it at that point until the player backspaces and fixes it.
    const progressIndex = S.wrongCount > 0 ? S.minWrong : S.typedCount;
    you.progress = clamp((progressIndex / total) * FINISH_MARGIN, 0, FINISH_MARGIN);

    // push my live state to the room
    if (S.mode === "multi" && S.liveAt && !S.finished) {
      const acc = S.keystrokes > 0 ? (S.correctChars / S.keystrokes) * 100 : 100;
      net().sendProgress({ progress: you.progress, wpm: you.wpm, acc });
    }

    renderRace(elapsed);
    S.rafId = requestAnimationFrame(loop);
  }

  function speedClass(wpm) {
    if (wpm >= 96) return "spd-turbo";
    if (wpm >= 72) return "spd-fast";
    return "";
  }

  function renderRace(elapsed) {
    S.racers.forEach((r) => {
      const wpm = r.type === "you" ? r.wpm : (r.type === "bot" ? r.wpmNow : r.wpm);
      positionRunner(r.id, r.progress, wpm || 0);
    });

    const you = S.racers.find((r) => r.type === "you");
    const acc = S.keystrokes > 0 ? Math.round((S.correctChars / S.keystrokes) * 100) : 100;
    el.hud.wpm.textContent = Math.round(you.wpm || 0);
    el.hud.progress.innerHTML = Math.round((you.progress / FINISH_MARGIN) * 100) + "<small>%</small>";
    el.hud.acc.innerHTML = acc + "<small>%</small>";
    el.hud.time.innerHTML = Math.max(0, elapsed).toFixed(1) + "<small>s</small>";

    const ranked = S.racers.map((r) => ({ id: r.id, p: r.progress })).sort((a, z) => z.p - a.p);
    const youRank = ranked.findIndex((r) => r.id === "you") + 1;
    el.hud.pos.innerHTML = youRank + "<small>" + ordinal(youRank).slice(-2) + "</small>";
  }

  function positionRunner(id, progress, wpm) {
    const unit = el.lanes.querySelector(`[data-unit="${id}"]`);
    if (!unit) return;
    const leftPct = 2.5 + (progress / FINISH_MARGIN) * 90;
    unit.style.left = leftPct + "%";
    const cls = speedClass(wpm);
    unit.classList.remove("spd-fast", "spd-turbo");
    if (cls) unit.classList.add(cls);
    const tag = el.lanes.querySelector(`[data-wpm="${id}"]`);
    if (tag) tag.textContent = Math.max(0, Math.round(wpm)) + " wpm";
  }

  /* ---------- typing input ---------- */
  function onInput() {
    if (S.phase !== "racing" || !S.liveAt || S.finished) { el.input.value = ""; return; }
    const val = el.input.value;
    el.input.value = "";
    for (const ch of val) handleChar(ch);
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      if (S.phase === "racing" || S.phase === "countdown") quitRace();
      return;
    }
    if (S.phase !== "racing" || !S.liveAt || S.finished) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      if (S.typedCount > 0) {
        S.typedCount--;
        const span = S.chars[S.typedCount];
        if (span.classList.contains("correct")) S.correctChars--;
        if (span.classList.contains("wrong")) {
          S.wrongCount = Math.max(0, S.wrongCount - 1);
          if (S.wrongCount === 0) S.minWrong = Infinity;
        }
        span.classList.remove("correct", "wrong");
        if (S.wrongCount === 0) {
          el.typePanel.classList.remove("err");
          el.typeStatus.textContent = "Good — keep going.";
        }
        markCurrent();
      }
    }
  }

  function handleChar(ch) {
    const chars = S.chars;
    if (S.typedCount >= chars.length) return;
    const p = S.typedCount;
    const expected = S.text[p];
    const span = chars[p];
    S.keystrokes++;
    if (ch === expected) {
      span.classList.add("correct");
      span.classList.remove("wrong");
      S.correctChars++;
      S.typedCount++;
    } else {
      span.classList.add("wrong");
      span.classList.remove("correct");
      S.errors++;
      S.typedCount++;
      S.wrongCount++;
      if (p < S.minWrong) S.minWrong = p; // remember the earliest mistake
    }
    // Guide the player: while a mistake is uncorrected, the runner is frozen.
    el.typeStatus.textContent = S.wrongCount > 0
      ? "Wrong letter — backspace and fix it to move forward."
      : "Nice — keep the rhythm going.";
    el.typePanel.classList.toggle("err", S.wrongCount > 0);
    markCurrent();
    // Finish only once the whole passage is typed with no mistakes left.
    if (S.wrongCount === 0 && S.typedCount >= chars.length) finishYou();
  }

  function finishYou() {
    if (S.finished) return;
    S.finished = true;
    const you = S.racers.find((r) => r.type === "you");
    you.progress = FINISH_MARGIN;
    you.finishTime = elapsedSec();
    const unit = el.lanes.querySelector('[data-unit="you"]');
    if (unit) { unit.classList.add("finished"); unit.classList.remove("is-running"); }
    el.typeStatus.textContent = "You crossed the line!";

    if (S.mode === "multi") {
      const acc = S.keystrokes > 0 ? (S.correctChars / S.keystrokes) * 100 : 100;
      net().sendFinished({ progress: FINISH_MARGIN, wpm: you.wpm, acc, time: you.finishTime });
    }
    endRace();
  }

  /* ---------- results ---------- */
  function racerName(r) {
    if (r.type === "you") return user().name;
    if (r.type === "bot") return r.name;
    return (r.label || "Racer").replace(/\s*✓\s*$/, "").trim();
  }

  // A live leaderboard: everyone who has crossed the line by the moment YOU
  // finished is ranked and shown; racers still on the track appear blurred as
  // "racing…", so you never have to wait for the whole field to finish.
  function renderLeaderboard(yourTime, yourWpm) {
    const rows = S.racers.map((r) => {
      let done, time, wpm;
      if (r.type === "you") { done = true; time = yourTime; wpm = yourWpm; }
      else if (r.type === "bot") { done = r.targetTime <= yourTime; time = r.targetTime; wpm = r.wpm; }
      else { done = !!r.finished && r.finishTime != null && r.finishTime <= yourTime; time = r.finishTime; wpm = r.wpm; }
      return { name: racerName(r), color: r.color, isYou: r.type === "you", done, time: time || 0, wpm: wpm || 0, progress: r.progress || 0 };
    });
    const settled = rows.filter((x) => x.done).sort((a, b) => a.time - b.time);
    const pending = rows.filter((x) => !x.done).sort((a, b) => b.progress - a.progress);

    let rank = 0;
    const row = (x, blur) => {
      rank++;
      const meta = x.done ? `${Math.round(x.wpm)} wpm · ${x.time.toFixed(1)}s` : "racing…";
      return `<div class="board-row${x.isYou ? " is-you" : ""}${blur ? " is-pending" : ""}">
        <span class="board-rank">${rank}</span>
        <span class="board-ava" style="--c:${x.color}">${PERSON_SVG}</span>
        <span class="board-name">${escapeHtml(x.name)}${x.isYou ? " <em>you</em>" : ""}</span>
        <span class="board-meta${x.done ? "" : " pending"}">${meta}</span>
      </div>`;
    };
    el.resultsBoard.innerHTML =
      settled.map((x) => row(x, false)).join("") + pending.map((x) => row(x, true)).join("");

    el.resultsNote.hidden = pending.length === 0;
    if (pending.length > 0) el.resultsNote.textContent = "You finished — the rest are still on the track";
  }

  function endRace() {
    if (S.phase === "done") return;
    S.phase = "done";
    cancelAnimationFrame(S.rafId);
    document.querySelectorAll(".runner-unit").forEach((u) => u.classList.remove("is-running"));

    const you = S.racers.find((r) => r.type === "you");
    const yourTime = you.finishTime || elapsedSec();
    const yourWpm = yourTime > 0 ? Math.round((S.correctChars / 5) / (yourTime / 60)) : 0;
    const acc = S.keystrokes > 0 ? Math.round((S.correctChars / S.keystrokes) * 100) : 100;

    // how many racers have already crossed the line before you?
    const ahead = S.racers.filter((r) => {
      if (r.type === "you") return false;
      const fin = r.type === "bot" ? r.targetTime : (r.finished ? r.finishTime : Infinity);
      return fin != null && fin <= yourTime;
    }).length;
    const youPlace = ahead + 1;
    const won = youPlace === 1;
    const field = S.racers.length;

    el.resultsPlace.textContent = ordinal(youPlace);
    el.resultsPlace.classList.toggle("win", won);
    if (el.resultsCard) el.resultsCard.classList.toggle("win", won);
    el.resultsTitle.classList.remove("win", "lose");
    if (won) {
      el.resultsBanner.textContent = "★ VICTORY ★";
      el.resultsTitle.textContent = "You won the race!";
      el.resultsTitle.classList.add("win");
      confetti();
    } else {
      el.resultsBanner.textContent = "RACE COMPLETE";
      el.resultsTitle.textContent = "You placed " + ordinal(youPlace) + " of " + field + ".";
      el.resultsTitle.classList.add("lose");
    }

    el.resWpm.textContent = yourWpm;
    el.resAcc.textContent = acc + "%";
    el.resTime.textContent = yourTime.toFixed(1) + "s";
    el.btnAgain.textContent = "Race again";
    renderLeaderboard(yourTime, yourWpm);
    el.screens.results.classList.add("is-active");
  }

  function confetti() {
    const colors = ["#ffd23f", "#ff8a3d", "#7cf3ff", "#6ee7b7", "#b79bff", "#ff6b81"];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animation = `fall ${rand(2.2, 4.2)}s linear ${rand(0, 0.8)}s forwards`;
      c.style.transform = `rotate(${rand(0, 360)}deg)`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 5200);
    }
  }

  /* ---------- navigation ---------- */
  function quitRace() {
    cancelAnimationFrame(S.rafId);
    S.finished = true;
    if (S.mode === "multi") net().leave();
    goMenu();
  }

  function goMenu() {
    cancelAnimationFrame(S.rafId);
    S.phase = "menu";
    S.mode = "solo";
    S.room = null;
    S._lobbySig = null;
    el.countdown.classList.remove("is-active");
    el.screens.results.classList.remove("is-active");
    if (el.menuYou) el.menuYou.textContent = user().name;
    showScreen("menu");
  }

  async function leaveAndMenu() {
    try { await net().leave(); } catch {}
    goMenu();
  }

  // "Race again" — start a fresh race the same way the last one began:
  // multiplayer quick-match (real players if present, otherwise bots) or solo.
  function raceAgain() {
    el.screens.results.classList.remove("is-active");
    if (S.mode === "multi") doRaceNow();
    else startSolo();
  }

  /* =====================  MULTIPLAYER LOBBY  ===================== */
  function onRoom(room) {
    if (!room) {
      // room vanished (host left / expired)
      if (S.phase !== "done") { goMenu(); toast("The room closed."); }
      return;
    }
    S.room = room;

    if (room.status === "waiting") {
      renderLobby(room);
      return;
    }
    if (room.status === "racing") {
      if (S.phase === "racing" || S.phase === "done") {
        syncRemotes(room);        // live update during the race
      } else {
        enterMultiRace(room);     // first transition into the race
      }
      return;
    }
  }

  // The roster shown on the preview track = real players + the bots that will
  // fill the empty lanes (mirrors the actual bot-fill logic).
  function buildLobbyRoster(room) {
    const list = room.players.map((p, i) => {
      const look = p.uid === room.me
        ? YOU_LOOK
        : PLAYER_LOOKS[(room.players.filter((x, j) => x.uid !== room.me && j < i).length) % PLAYER_LOOKS.length];
      return { name: p.name, color: look.color, isYou: p.uid === room.me };
    });
    const fill = room.isPrivate
      ? (room.players.length < 2 ? 5 - room.players.length : 0)
      : Math.max(0, 5 - room.players.length);
    for (let i = 0; i < fill; i++) {
      const t = BOT_TEMPLATES[i % BOT_TEMPLATES.length];
      list.push({ name: t.name, color: t.color, isYou: false });
    }
    return list;
  }

  function renderLobby(room) {
    S.phase = "lobby";
    showScreen("lobby");
    const waiting = room.isPrivate && !room.startAt; // private room, host hasn't started
    el.lobbyTitle.textContent = room.isPrivate ? "Private race" : "Finding racers";

    // track preview — rebuild only when the roster changes (no flicker on the tick)
    const roster = buildLobbyRoster(room);
    const sig = roster.map((r) => r.name + r.color + r.isYou).join("|");
    if (sig !== S._lobbySig) {
      S._lobbySig = sig;
      el.lobbyTrackLanes.innerHTML = roster.map((r) => `
        <div class="lobby-lane">
          <span class="lobby-lane__tag" style="color:${r.color}">
            <span class="lobby-lane__dot" style="background:${r.color}"></span>
            ${escapeHtml(r.name)}${r.isYou ? " <em>you</em>" : ""}
          </span>
          <span class="lobby-lane__strip"><span class="lobby-lane__runner" style="--c:${r.color}"></span></span>
        </div>`).join("");
    }

    el.lobbyCodeWrap.hidden = !room.isPrivate;
    if (room.isPrivate) el.lobbyCode.textContent = room.code || "—";

    if (waiting) {
      el.lobbyStatus.textContent = room.isHost ? "Ready when you are" : "Waiting for the host…";
      el.lobbyCount.hidden = true;
      el.btnLobbyStart.hidden = !room.isHost;
      el.lobbyHint.textContent = room.isHost
        ? "Share the code — or press Start and bots fill the rest."
        : "The host will start the race soon.";
    } else {
      el.lobbyCount.hidden = false;
      el.btnLobbyStart.hidden = true;
      const secs = Math.max(0, Math.ceil((room.startAt - room.countdownMs - room.serverNow) / 1000));
      el.lobbyCountNum.textContent = secs;
      el.lobbyStatus.textContent = secs > 0 ? "Get ready!" : "Go!";
      const others = room.players.length - 1;
      el.lobbyHint.textContent = others > 0
        ? `Racing ${others} real ${others === 1 ? "player" : "players"} + bots`
        : "Filling the lanes with bots…";
    }
  }

  function toast(msg) {
    el.typeStatus && (el.typeStatus.textContent = msg);
    console.log("[SPRINT]", msg);
  }

  /* ---------- friends panel ---------- */
  function openFriends() {
    el.friendsError.hidden = true;
    el.friends.classList.add("is-open");
    el.joinCode.value = "";
  }
  function closeFriends() { el.friends.classList.remove("is-open"); }
  function friendsError(msg) { el.friendsError.textContent = msg; el.friendsError.hidden = false; }

  const roomCbs = { onRoom, onError: (e) => toast(e.message || "Network error") };

  async function doRaceNow() {
    if (!net()) return toast("Still connecting…");
    disableMenu(true);
    try {
      await net().quickMatch(roomCbs);
    } catch (e) {
      console.error(e);
      toast("Matchmaking failed. Try again.");
      goMenu();
    } finally {
      disableMenu(false);
    }
  }

  async function doCreatePrivate() {
    if (!net()) return friendsError("Still connecting…");
    try {
      const { roomId } = await net().createPrivate(roomCbs);
      S.inviteRoomId = roomId;
      closeFriends();
    } catch (e) {
      console.error(e);
      friendsError("Couldn't create the room.");
    }
  }

  async function doJoinCode() {
    const code = (el.joinCode.value || "").trim();
    if (code.length < 4) return friendsError("Enter the 5-letter code.");
    try {
      await net().joinByCode(code, roomCbs);
      closeFriends();
    } catch (e) {
      console.error(e);
      friendsError(e.message || "Couldn't join that room.");
    }
  }

  async function doJoinRoomId(roomId) {
    try {
      await net().joinRoom(roomId, roomCbs);
    } catch (e) {
      console.error(e);
      toast(e.message || "Couldn't join that room.");
      goMenu();
    }
  }

  function copyInviteLink() {
    const id = S.inviteRoomId || net().roomId;
    if (!id) return;
    const url = location.origin + location.pathname + "?room=" + id;
    navigator.clipboard?.writeText(url).then(
      () => { el.btnCopyLink.textContent = "Copied!"; setTimeout(() => (el.btnCopyLink.textContent = "Copy invite link"), 1500); },
      () => toast(url)
    );
  }

  function disableMenu(v) {
    [el.btnRaceNow, el.btnSolo, el.btnFriends].forEach((b) => b && (b.disabled = v));
    if (el.btnRaceNow) el.btnRaceNow.querySelector("span") && (el.btnRaceNow.querySelector("span").textContent = v ? "Finding a race…" : "Race Now");
  }

  /* ---------- wiring ---------- */
  function init() {
    // menu actions
    el.btnRaceNow?.addEventListener("click", doRaceNow);
    el.btnSolo?.addEventListener("click", startSolo);
    el.btnFriends?.addEventListener("click", openFriends);

    // friends panel
    el.btnCreatePrivate?.addEventListener("click", doCreatePrivate);
    el.btnJoinCode?.addEventListener("click", doJoinCode);
    el.btnFriendsClose?.addEventListener("click", closeFriends);
    el.joinCode?.addEventListener("keydown", (e) => { if (e.key === "Enter") doJoinCode(); });

    // lobby
    el.btnLobbyStart?.addEventListener("click", () => net().hostStart());
    el.btnLobbyLeave?.addEventListener("click", leaveAndMenu);
    el.btnCopyLink?.addEventListener("click", copyInviteLink);

    // results
    el.btnAgain?.addEventListener("click", raceAgain);
    el.btnMenu?.addEventListener("click", leaveAndMenu);

    // typing
    el.input.addEventListener("input", onInput);
    document.addEventListener("keydown", onKeydown);
    el.typePanel.addEventListener("click", () => el.input.focus());
    el.input.addEventListener("focus", () => el.typePanel.classList.add("is-focused"));
    el.input.addEventListener("blur", () => el.typePanel.classList.remove("is-focused"));

    // Enter shortcut: quick race from the menu, continue from results
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (!window.SPRINT_USER) return; // still on the sign-in screen — let the auth form handle Enter
      if (S.phase === "menu" && !el.friends.classList.contains("is-open")) {
        e.preventDefault();
        doRaceNow();
      } else if (S.phase === "done") {
        e.preventDefault();
        raceAgain();
      }
    });

    // give the network layer our passage + bot generators
    const wireNet = () => net()?.configure({ makePassage, makeBots });
    if (net()) wireNet(); else document.addEventListener("sprint:net-ready", wireNet, { once: true });

    // wait for auth, then reveal the menu (+ handle ?room= invite links)
    const start = () => {
      if (el.menuYou) el.menuYou.textContent = user().name;
      showScreen("menu");
      const params = new URLSearchParams(location.search);
      const room = params.get("room");
      if (room) {
        history.replaceState(null, "", location.pathname);
        const go = () => doJoinRoomId(room);
        net() ? go() : document.addEventListener("sprint:net-ready", go, { once: true });
      }
    };
    if (window.SPRINT_USER) start();
    else document.addEventListener("sprint:auth", start, { once: true });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
