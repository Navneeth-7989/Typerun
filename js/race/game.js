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
  ];

  // Number-and-symbol passages are a rare spice: roughly 1 race in 30 draws
  // from this pool instead of the plain-prose one (see makePassage).
  const NUMBER_CHANCE = 1 / 30;
  const NUMBER_PASSAGES = [
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

  /* ---------- bots: a big name pool, difficulty tiers, look palette ----------
     Names + looks are shuffled fresh every race (seeded by roomId, so all
     clients still agree), and difficulties are split as evenly as possible
     across easy / medium / hard — see botPlan() / makeBots(). */
  const BOT_NAMES = [
    "Blaze", "Nova", "Titan", "Comet", "Rookie", "Zephyr", "Vortex", "Falcon",
    "Bolt", "Rocket", "Dash", "Echo", "Cipher", "Quartz", "Onyx", "Raven",
    "Ace", "Flash", "Storm", "Phoenix", "Maverick", "Turbo", "Ghost", "Viper",
    "Sonic", "Ember", "Frost", "Rebel", "Jet", "Karma",
  ];

  // Skill bands (WPM). One band per difficulty; the bot's actual WPM is drawn
  // randomly within the band so no two same-tier bots feel identical.
  const BOT_TIERS = [
    { sub: "easy",   min: 49, max: 58 },
    { sub: "medium", min: 72, max: 83 },
    { sub: "hard",   min: 90, max: 99 },
  ];

  // Visual identities handed out to bots (color + skin/hair/pants).
  const BOT_LOOKS = [
    { color: "#6ee7b7", skin: "#f2c9a0", hair: "#3a2b1a", pants: "#22543d" },
    { color: "#7cc4ff", skin: "#e8b98a", hair: "#1a1a1a", pants: "#1e3a5f" },
    { color: "#b79bff", skin: "#d9a878", hair: "#4a2c1a", pants: "#3b2a5f" },
    { color: "#ff6b81", skin: "#c89060", hair: "#0f0f0f", pants: "#5f1e2a" },
    { color: "#ffa94d", skin: "#e6b58a", hair: "#2a1a0a", pants: "#5f3a1e" },
    { color: "#7cf3ff", skin: "#e8c4a0", hair: "#20140a", pants: "#12414a" },
    { color: "#ff9bb0", skin: "#f2c9a0", hair: "#4a2c1a", pants: "#5f1e3a" },
    { color: "#a0e57c", skin: "#d9a878", hair: "#2a1a0a", pants: "#2f5f1e" },
  ];

  const YOU_LOOK = { skin: "#f4d0a8", hair: "#2a1c10", pants: "#5f4a1e", color: "#ffd23f" };

  // Rotating facts / records / tips shown while the lobby fills up.
  const TIPS = [
    { icon: "🏆", text: "World record: Stella Pajunas typed 216 WPM way back in 1946." },
    { icon: "🏆", text: "Barbara Blackburn held the Guinness record at 212 WPM peak." },
    { icon: "⌨️", text: "The average typist manages ~40 WPM. Pros cruise past 70." },
    { icon: "🎯", text: "Accuracy beats speed — one typo can cost more than three careful keys." },
    { icon: "👀", text: "Don't look down. Trust your fingers and build muscle memory." },
    { icon: "⏱️", text: "10 focused minutes a day beats one long marathon session." },
    { icon: "🌊", text: "Keep a steady rhythm — smooth is fast; bursts and stalls are slow." },
    { icon: "🕰️", text: "QWERTY was designed in 1874 to slow typists and stop key jams." },
    { icon: "🚀", text: "Touch typing can literally double your hunt-and-peck speed." },
    { icon: "🧠", text: "Let your eyes read a few characters ahead of your fingers." },
    { icon: "🏠", text: "F and J have little bumps so your fingers always find home row." },
    { icon: "💆", text: "Relax your shoulders and wrists — tension is the enemy of speed." },
    { icon: "📈", text: "Consistency compounds: small daily gains add up shockingly fast." },
    { icon: "🔥", text: "Warm up your hands first — typing fast is a finger sport." },
  ];

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
    lockedUpto: 0,          // chars committed by completed words (can't backspace past)
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
    lobbyTip: $("#lobby-tip"),
    lobbyTipIcon: $("#lobby-tip-icon"),
    lobbyTipText: $("#lobby-tip-text"),
    lobbyCodeWrap: $("#lobby-code-wrap"),
    lobbyCode: $("#lobby-code"),
    btnCopyLink: $("#btn-copy-link"),
    btnLobbyStart: $("#btn-lobby-start"),
    btnLobbyLeave: $("#btn-lobby-leave"),
    lobbyHint: $("#lobby-hint"),
    // 1v1 challenge "waiting" popup
    waitModal: $("#challenge-wait-modal"),
    waitTitle: $("#challenge-wait-title"),
    waitText: $("#challenge-wait-text"),
    btnWaitCancel: $("#btn-challenge-wait-cancel"),
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
    // Rare treat: a number-heavy race. The roll uses the same seeded rng, so
    // every client in a multiplayer room agrees on the pool too.
    const pool = rnd() < NUMBER_CHANCE ? NUMBER_PASSAGES : PASSAGES;
    const lengths = Object.keys(LENGTH_SENTENCES);
    const len = lengths[Math.floor(rnd() * lengths.length)];
    const n = LENGTH_SENTENCES[len];
    const parts = [];
    const used = {};
    for (let i = 0; i < n; i++) {
      let idx = Math.floor(rnd() * pool.length);
      let guard = 0;
      while (used[idx] && guard++ < pool.length) idx = (idx + 1) % pool.length;
      used[idx] = true;
      parts.push(pool[idx]);
    }
    return parts.join(" ");
  }

  // Fisher-Yates shuffle driven by a supplied 0..1 RNG (returns a new array).
  function shuffled(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // The lane plan: which name / look / difficulty each bot gets. Names and
  // looks are shuffled fresh per race and difficulties are round-robined so
  // easy/medium/hard stay evenly split, then their lane order is shuffled.
  // Seeded by roomId, so the lobby preview and every client's race agree.
  function botPlan(count, seed) {
    const rnd = seed != null ? mulberry32(hashSeed(String(seed) + ":botnames")) : Math.random;
    const names = shuffled(BOT_NAMES, rnd);
    const looks = shuffled(BOT_LOOKS, rnd);
    const tierList = [];
    for (let i = 0; i < count; i++) tierList.push(BOT_TIERS[i % BOT_TIERS.length]);
    const tiers = shuffled(tierList, rnd);
    const plan = [];
    for (let i = 0; i < count; i++) {
      const look = looks[i % looks.length];
      plan.push({ name: names[i % names.length], color: look.color, sub: tiers[i].sub, tier: tiers[i], look: { ...look } });
    }
    return plan;
  }

  // Deterministic bots: each carries a targetTime (seconds to finish). With a
  // seed, every client generates identical bots and agrees on the outcome.
  // Skill (WPM within the tier band) uses its own seeded stream so it stays
  // independent of the name/look shuffle in botPlan.
  function makeBots(passage, count, seed) {
    const rnd = seed != null ? mulberry32(hashSeed(String(seed) + ":botskill")) : Math.random;
    const words = passage.length / 5;
    return botPlan(count, seed).map((b, i) => {
      const wpm = b.tier.min + rnd() * (b.tier.max - b.tier.min);
      return {
        id: "bot" + i,
        name: b.name,
        color: b.color,
        sub: b.sub,
        look: { ...b.look, color: b.color },
        wpm: Math.round(wpm),
        targetTime: (words / wpm) * 60,
        phase: rnd() * Math.PI * 2,
      };
    });
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
    cancelAnimationFrame(S.caretRaf);
    S.caretRaf = 0;
    S.caretX = S.caretY = null; // fresh passage: snap, don't glide from the old spot
    S.caret = caret;
    S.chars = inner.querySelectorAll(".ch");
    S.currentEl = null;
    markCurrent();
  }

  function positionCaret(target) {
    if (!S.caret) return;
    if (target) {
      S.caret.style.display = "block";
      S.caretTX = target.offsetLeft;
      S.caretTY = target.offsetTop;
    } else if (S.chars.length) {
      const last = S.chars[S.chars.length - 1];
      S.caretTX = last.offsetLeft + last.offsetWidth;
      S.caretTY = last.offsetTop;
    } else return;
    // Solid while moving; the blink comes back once the caret sits still.
    S.caret.style.animation = "none";
    clearTimeout(S.caretIdleTimer);
    S.caretIdleTimer = setTimeout(() => { if (S.caret) S.caret.style.animation = ""; }, 650);
    if (S.caretX == null) snapCaret();
    else startCaretChase();
  }

  function snapCaret() {
    S.caretX = S.caretTX;
    S.caretY = S.caretTY;
    S.caret.style.transform = "translate(" + S.caretX + "px," + S.caretY + "px)";
  }

  // Per-frame exponential chase: most of the gap closes on the very next
  // frame, then the caret eases into place — smooth, but it never trails the
  // typed text the way a fixed-duration CSS transition does.
  function startCaretChase() {
    if (S.caretRaf) return;
    let prev = performance.now();
    const step = (now) => {
      S.caretRaf = 0;
      if (!S.caret) return;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const k = 1 - Math.exp(-dt * 28);
      S.caretX += (S.caretTX - S.caretX) * k;
      S.caretY += (S.caretTY - S.caretY) * k;
      if (Math.abs(S.caretTX - S.caretX) < 0.4 && Math.abs(S.caretTY - S.caretY) < 0.4) {
        snapCaret();
        return;
      }
      S.caret.style.transform = "translate(" + S.caretX + "px," + S.caretY + "px)";
      S.caretRaf = requestAnimationFrame(step);
    };
    S.caretRaf = requestAnimationFrame(step);
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

  /* ---------- countdown overlay (shared by solo + multi) ---------- */
  const GO_HIDE_MS = 900; // let the GO! animation finish while the dim clears

  function showCountdown() {
    clearTimeout(S.cdHideTimer);
    el.countdown.classList.remove("is-live");
    el.countdown.classList.add("is-active");
  }
  function setCountdownStep(text, isGo) {
    const n = el.countdownNum;
    n.textContent = text;
    n.classList.remove("pop", "go");
    void n.offsetWidth;
    n.classList.add(isGo ? "go" : "pop");
  }
  function goCountdown() {
    setCountdownStep("GO!", true);
    el.countdown.classList.add("is-live"); // fade the dim out so the track is visible the moment typing opens
    clearTimeout(S.cdHideTimer);
    S.cdHideTimer = setTimeout(hideCountdown, GO_HIDE_MS);
  }
  function hideCountdown() {
    clearTimeout(S.cdHideTimer);
    el.countdown.classList.remove("is-active", "is-live");
  }

  /* ---------- multiplayer start ---------- */
  function enterMultiRace(room) {
    stopLobbyTips();
    hideWaitModal();          // challenge accepted — drop the "waiting" popup
    S.pendingChallenges = []; // already answered; nothing left to cancel
    S.mode = "multi";
    resetRaceState();
    S.room = room;
    S.raceRoomId = room.roomId; // the race we're now running (see onRoom sync guard)

    // Remember who we raced + how, so "Race again" can rematch the same people
    // instead of dropping into a random quick match.
    //   challenge → re-challenge that one friend (auto-start)
    //   private   → reopen a private room and invite everyone back
    //   public    → a fresh quick match (random players + bots)
    S.lastRace = {
      kind: room.challenge ? "challenge" : (room.isPrivate ? "private" : "public"),
      wasHost: !!room.isHost, // only the private-room host may launch a rematch
      opponents: room.players
        .filter((p) => p.uid !== room.me && p.uid)
        .map((p) => ({ uid: p.uid, name: p.name })),
    };
    S.raceStartAt = room.raceStartAt;
    // Freeze the go-moment onto the local frame clock: serverNow()'s offset
    // estimate can shift mid-countdown, which made digits hold or skip.
    S.goPerf = performance.now() + (room.raceStartAt - net().serverNow());
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
    S.lockedUpto = 0;
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
      const remaining = (S.goPerf - now) / 1000; // seconds until go
      if (remaining > 0) {
        if (!el.countdown.classList.contains("is-active")) showCountdown();
        const num = String(Math.min(3, Math.ceil(remaining)));
        if (el.countdownNum.textContent !== num) setCountdownStep(num, false);
      } else {
        goCountdown();
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
      // Only the current word is editable — stop at the last committed word.
      if (S.typedCount > S.lockedUpto) {
        S.typedCount--;
        const span = S.chars[S.typedCount];
        if (span.classList.contains("correct")) S.correctChars--;
        if (span.classList.contains("wrong")) {
          S.wrongCount = Math.max(0, S.wrongCount - 1);
          if (S.wrongCount === 0) S.minWrong = Infinity;
        }
        span.classList.remove("correct", "wrong", "locked");
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
    // Word lock: once there's an uncorrected mistake, let the player finish the
    // word that holds it, but block the space into the next word (and beyond)
    // until they backspace and fix it. `minWrong` is the earliest bad char, so
    // the word ends at the next space at/after it (or the passage end).
    if (S.wrongCount > 0) {
      const nextSpace = S.text.indexOf(" ", S.minWrong);
      const wordEnd = nextSpace === -1 ? S.text.length : nextSpace;
      if (S.typedCount >= wordEnd) {
        el.typeStatus.textContent = "Fix the mistake — backspace to the red letters.";
        el.typePanel.classList.add("err");
        return; // swallow the keystroke; no advancing into the next word
      }
    }
    const p = S.typedCount;
    const expected = S.text[p];
    const span = chars[p];
    S.keystrokes++;
    if (ch === expected) {
      span.classList.add("correct");
      span.classList.remove("wrong");
      S.correctChars++;
      S.typedCount++;
      // A correctly typed space commits the word before it: once a word is
      // done it's locked, so backspace can never reach back into it — the
      // player may only edit the word they're currently on.
      if (expected === " ") S.lockedUpto = S.typedCount;
    } else {
      span.classList.add("wrong");
      span.classList.remove("correct");
      S.errors++;
      S.typedCount++;
      S.wrongCount++;
      if (p < S.minWrong) S.minWrong = p; // remember the earliest mistake
    }
    // While an earlier mistake is still uncorrected, the runner is frozen — so
    // every key typed past that point is "locked": it appears in the passage but
    // earns no ground. Flag those chars with a red glow so the freeze is felt,
    // even when the keys themselves are technically correct.
    if (S.wrongCount > 0 && p > S.minWrong) span.classList.add("locked");
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
    // Save the run to the profile history (real accounts only; guests keep nothing).
    if (net() && net().recordRace && !user().isGuest) {
      net().recordRace({ wpm: yourWpm, acc, time: yourTime, place: youPlace, field, mode: S.mode });
    }
    // In a private room only the host can rematch — tell everyone else upfront.
    const privateGuest = S.mode === "multi" && S.lastRace && S.lastRace.kind === "private" && !S.lastRace.wasHost;
    el.btnAgain.textContent = privateGuest ? "Waiting for host…" : "Race again";
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
    stopLobbyTips();
    hideWaitModal();
    clearPendingChallenge(); // pull any still-open invite we sent
    S.phase = "menu";
    S.mode = "solo";
    S.room = null;
    S.raceRoomId = null;
    S._lobbySig = null;
    hideCountdown();
    el.screens.results.classList.remove("is-active");
    if (el.menuYou) el.menuYou.textContent = user().name;
    showScreen("menu");
  }

  async function leaveAndMenu() {
    try { await net().leave(); } catch {}
    goMenu();
  }

  // Send this client back to its own home screen — used when a rematch is
  // declined so BOTH the challenger and the decliner leave the arena. No-op if
  // we're already on the menu (e.g. a challenge declined straight from there).
  function goHome() {
    if (S.phase === "menu") return;
    leaveAndMenu();
  }

  // "Race again" — replay the SAME kind of race we just finished:
  //   1v1 friend match   → re-challenge that friend (popup on their screen)
  //   private room       → rematch invite to everyone who was in the room
  //   public quick match → a fresh random quick match
  function raceAgain() {
    const hideResults = () => el.screens.results.classList.remove("is-active");
    if (S.mode !== "multi") { hideResults(); goMenu(); return; }
    const lr = S.lastRace;
    if (lr && (lr.kind === "challenge" || lr.kind === "private")) {
      // Private room: only the host may launch the rematch, so there's exactly
      // one initiator and everyone else just waits for the invite popup.
      if (lr.kind === "private" && !lr.wasHost) {
        if (el.resultsNote) { el.resultsNote.hidden = false; el.resultsNote.textContent = "Only the host can start a rematch — hang tight."; }
        return; // stay on the results screen
      }
      const opps = (lr.opponents || []).filter((o) => o && o.uid);
      if (opps.length) { hideResults(); rematch(opps, lr.kind === "private"); return; }
      hideResults(); goMenu(); menuToast("Your rivals already left."); return;
    }
    hideResults();
    doRaceNow();
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
      // Direct 1v1 challenge: no lobby / code — just a "waiting" popup that
      // gives way to the countdown the instant the friend joins.
      if (room.challenge) { renderChallengeWait(room); return; }
      renderLobby(room);
      return;
    }
    if (room.status === "racing") {
      // Only sync when it's the race we're already running. A different roomId
      // means a fresh race (e.g. a rematch started from the results screen),
      // so we must enter it even though our phase is still "racing"/"done".
      if (S.raceRoomId === room.roomId && (S.phase === "racing" || S.phase === "done")) {
        syncRemotes(room);        // live update during the race
      } else {
        enterMultiRace(room);     // first transition into the race
      }
      return;
    }
  }

  // The roster shown on the preview track = real players + the empty lanes.
  // Public rooms preview the bots that will fill in (mirrors the bot-fill logic);
  // private rooms never get bots, so open lanes show a blurred placeholder until
  // a real player joins and their name is confirmed.
  function buildLobbyRoster(room) {
    const list = room.players.map((p, i) => {
      const look = p.uid === room.me
        ? YOU_LOOK
        : PLAYER_LOOKS[(room.players.filter((x, j) => x.uid !== room.me && j < i).length) % PLAYER_LOOKS.length];
      return { name: p.name, color: look.color, isYou: p.uid === room.me };
    });
    const fill = Math.max(0, 5 - room.players.length);
    const plan = room.isPrivate ? null : botPlan(fill, room.roomId);
    for (let i = 0; i < fill; i++) {
      if (room.isPrivate) {
        list.push({ name: "Waiting…", color: "#5c6c9c", isYou: false, pending: true });
      } else {
        list.push({ name: plan[i].name, color: plan[i].color, isYou: false });
      }
    }
    return list;
  }

  let _tipIdx = -1;
  function showRandomTip() {
    if (!el.lobbyTip) return;
    let i = Math.floor(Math.random() * TIPS.length);
    if (i === _tipIdx) i = (i + 1) % TIPS.length; // don't repeat the same tip twice
    _tipIdx = i;
    el.lobbyTipIcon.textContent = TIPS[i].icon;
    el.lobbyTipText.textContent = TIPS[i].text;
    el.lobbyTip.classList.remove("is-in");
    void el.lobbyTip.offsetWidth; // restart the fade-in
    el.lobbyTip.classList.add("is-in");
  }
  function startLobbyTips() {
    if (S._tipTimer) return;
    showRandomTip();
    S._tipTimer = setInterval(showRandomTip, 4200);
  }
  function stopLobbyTips() {
    if (S._tipTimer) { clearInterval(S._tipTimer); S._tipTimer = null; }
  }

  function renderLobby(room) {
    S.phase = "lobby";
    showScreen("lobby");
    startLobbyTips();
    const waiting = room.isPrivate && !room.startAt; // private room, host hasn't started
    el.lobbyTitle.textContent = room.isPrivate ? "Private race" : "Finding racers";

    // track preview — rebuild only when the roster changes (no flicker on the tick)
    const roster = buildLobbyRoster(room);
    const sig = roster.map((r) => r.name + r.color + r.isYou + (r.pending ? "~" : "")).join("|");
    if (sig !== S._lobbySig) {
      S._lobbySig = sig;
      el.lobbyTrackLanes.innerHTML = roster.map((r) => `
        <div class="lobby-lane${r.pending ? " lobby-lane--pending" : ""}">
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
        ? "Share the code with friends, then start when everyone's in."
        : "The host will start the race soon.";
    } else {
      el.lobbyCount.hidden = false;
      el.btnLobbyStart.hidden = true;
      const secs = Math.max(0, Math.ceil((room.startAt - room.countdownMs - room.serverNow) / 1000));
      el.lobbyCountNum.textContent = secs;
      el.lobbyStatus.textContent = secs > 0 ? "Get ready!" : "Go!";
      const others = room.players.length - 1;
      el.lobbyHint.textContent = room.isPrivate
        ? (others > 0
            ? `Racing ${others} real ${others === 1 ? "player" : "players"}`
            : "Get ready — the race is about to start!")
        : (others > 0
            ? `Racing ${others} real ${others === 1 ? "player" : "players"}`
            : "Race starting soon…");
    }
  }

  /* ---------- 1v1 challenge "waiting" popup ---------- */
  function showWaitModal(title, text) {
    if (!el.waitModal) return;
    if (title != null) el.waitTitle.textContent = title;
    if (text != null) el.waitText.textContent = text;
    el.waitModal.hidden = false;
  }
  function hideWaitModal() {
    if (el.waitModal) el.waitModal.hidden = true;
  }

  // Challenge room, still "waiting": show the popup instead of the lobby.
  // Host is parked here until the friend joins; the joiner only flashes it
  // for a beat before the host's auto-start flips the room to "racing".
  function renderChallengeWait(room) {
    S.phase = "lobby";
    // The friend tapped "Decline" — bail out and tell the challenger.
    if (room.isHost && room.declinedBy && room.declinedBy.length) {
      onChallengeDeclined();
      return;
    }
    if (room.isHost) {
      const name = S.challengeName || "your friend";
      showWaitModal("Waiting for " + name + "…", "The race starts the moment they accept.");
    } else {
      showWaitModal("Challenge accepted!", "Get ready — the race is about to begin.");
    }
  }

  function onChallengeDeclined() {
    const name = S.challengeName || "Your friend";
    clearPendingChallenge();
    hideWaitModal();
    leaveAndMenu();
    menuToast(name + " declined the challenge.");
  }

  // Toast on the menu overlay (the in-race `toast` writes the race status line,
  // which isn't visible once we're back on the menu).
  let _menuToastTimer = null;
  function menuToast(msg) {
    const t = document.getElementById("menu-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    t.classList.add("is-in");
    clearTimeout(_menuToastTimer);
    _menuToastTimer = setTimeout(() => {
      t.classList.remove("is-in");
      setTimeout(() => { t.hidden = true; }, 220);
    }, 2800);
  }

  function clearPendingChallenge() {
    (S.pendingChallenges || []).forEach((ch) => { if (ch && ch.cancel) ch.cancel(); });
    S.pendingChallenges = [];
  }

  // Challenger backs out before the friend answers.
  function cancelChallengeWait() {
    hideWaitModal();
    clearPendingChallenge();
    leaveAndMenu();
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

  /* ---------- friends bridge ----------
     The social UI (friends.js) drives races through this tiny hook so it can
     reuse the exact room flow the menu uses — no duplicate lobby logic. */
  // Fire a direct 1v1 challenge (also the 1v1 "Race again" rematch path): spin
  // up a code-less challenge room, invite the friend, and show a "waiting"
  // popup. No lobby, no Start button — the race auto-starts (net layer) the
  // instant the friend joins.
  function challengeFriend(friendUid, friendName, isRematch) {
    if (!net()) return Promise.reject(new Error("Still connecting…"));
    closeFriends();
    el.screens.results.classList.remove("is-active");
    S.challengeName = friendName || "your friend";
    return net().createPrivate(roomCbs, { challenge: true }).then((r) =>
      net().sendChallenge(friendUid, { roomId: r.roomId, rematch: !!isRematch })
    ).then((ch) => {
      (S.pendingChallenges = S.pendingChallenges || []).push(ch);
      showWaitModal("Waiting for " + S.challengeName + "…", "The race starts the moment they accept.");
    });
  }

  // Accept an incoming 1v1 / rematch challenge by joining the challenger's room.
  function acceptChallenge(roomId) {
    closeFriends();
    doJoinRoomId(roomId);
  }

  // "Race again" for a friend match. A 1v1 re-challenges that single friend
  // (auto-start, same as the original challenge). A private room reopens a
  // fresh private room and drops a rematch invite on everyone who was just
  // racing, then parks the host in the lobby to Start once they've rejoined.
  function rematch(opponents, isPrivateRoom) {
    if (!net()) return Promise.reject(new Error("Still connecting…"));
    const others = (opponents || []).filter((o) => o && o.uid);
    if (!others.length) { goMenu(); menuToast("No one left to rematch."); return Promise.resolve(); }

    if (!isPrivateRoom && others.length === 1) {
      return challengeFriend(others[0].uid, others[0].name, true);
    }

    el.screens.results.classList.remove("is-active");
    clearPendingChallenge();
    return net().createPrivate(roomCbs).then((res) => {
      S.inviteRoomId = res.roomId;
      return Promise.all(others.map((o) =>
        net().sendChallenge(o.uid, { roomId: res.roomId, rematch: true })
          .then((ch) => { (S.pendingChallenges = S.pendingChallenges || []).push(ch); })
          .catch(() => {})
      ));
    });
  }

  window.SprintGame = {
    challengeFriend: challengeFriend,
    acceptChallenge: acceptChallenge,
    rematch: rematch,
    goHome: goHome,
  };

  async function doRaceNow() {
    if (!net() || !window.SPRINT_USER) return toast("Still connecting…");
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
    if (!net() || !window.SPRINT_USER) return friendsError("Still connecting…");
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
    if (!net() || !window.SPRINT_USER) return friendsError("Still connecting…");
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
    [el.btnRaceNow, el.btnFriends].forEach((b) => b && (b.disabled = v));
    if (el.btnRaceNow) el.btnRaceNow.querySelector("span") && (el.btnRaceNow.querySelector("span").textContent = v ? "Finding a race…" : "Race Now");
  }

  /* ---------- wiring ---------- */
  function init() {
    // menu actions
    el.btnRaceNow?.addEventListener("click", doRaceNow);
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

    // 1v1 challenge "waiting" popup
    el.btnWaitCancel?.addEventListener("click", cancelChallengeWait);

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
      if (document.body.classList.contains("arcade-open")) return; // arcade owns the keyboard
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
