/* =========================================================
   SPRINT · Arcade — "Save Your Girlfriend" (3D typing shooter)
   She's tied to the post on the right; a horde pours in from the
   left. Your keyboard is the gun — type the word over each enemy
   to blast it before it reaches her. Endless escalating levels,
   a NIGHTMARE boss every 5. Lose all her hearts → game over.

   Built on the arcade engine's shared Three.js layer:
   the 3D scene renders to #game-gl, word tags + reticle draw on
   the 2D overlay. Registers itself via SprintArcade.register().
   ========================================================= */
(function () {
  "use strict";
  var A = window.SprintArcade;
  if (!A) return;

  var THREE = null;         // set from api.THREE at init
  var G = null;             // the live game object (set in init/introInit)

  /* ------------------------------------------------ word banks */
  var TINY = ["run","die","hit","gun","aim","fox","jab","zap","cut","hex","fog","ice","sky","war","raw","vex","rip","fly","sob","arc","kill","dash","rage","burn","fear","grim","howl","claw","bite","dusk","slay","fang","rush","void","gore","hunt","pyre","grip"];
  var EASY = ["zombie","attack","danger","sprint","rescue","shadow","hunter","poison","hollow","frozen","escape","silent","beacon","throne","wander","gravel","cinder","molten","shiver","plague","ravage","shroud","harbor","candle","meadow","velvet","cobalt","amber","tunnel","hazard","impact","vortex","wither","grasp","clutch","menace","rumble","cavern","gloomy","static","crisis"];
  var MEDIUM = ["apocalypse","graveyard","nightmare","adrenaline","resistance","detonation","predator","infection","onslaught","obsidian","labyrinth","sanctuary","twilight","avalanche","catalyst","tremor","harbinger","quarantine","devourer","eclipse","crossfire","gauntlet","overdrive","juggernaut","firestorm","wasteland","phantom","corrosion","renegade","warpath","backbone","keystroke","velocity","momentum","trigger"];
  var HARD = ["unstoppable","annihilation","catastrophe","resurrection","extermination","pandemonium","invulnerable","decimation","reinforcement","counterattack","checkpoint","flamethrower","thunderstorm","constellation","kaleidoscope","indestructible","overwhelming","acceleration","disintegrate","obliteration","unbreakable"];
  var SENTENCES = ["the wall is closing fast","hold the line and stay calm","type every word to break it","she is counting on you now","keep your fingers steady","one more wave and you are free","clear the path and reach her","the horde grows but so do you","your words are the only weapon","each letter is a bullet you fire"];
  var BOSS_LINES = ["the final horror rises from the ruined city and only your fastest typing can end it now","a towering nightmare blocks the road and every word you land carves it down to nothing","steady your hands ignore the panic and unleash a perfect storm of letters upon the beast"];
  var BANKS = { tiny: TINY, easy: EASY, medium: MEDIUM, hard: HARD };

  function pickFrom(arr, avoidFirst) {
    if (avoidFirst && avoidFirst.size) {
      var c = arr.filter(function (w) { return !avoidFirst.has(w[0]); });
      if (c.length) arr = c;
    }
    return arr[(Math.random() * arr.length) | 0];
  }
  function pickWord(tier, avoidFirst) { return pickFrom(BANKS[tier] || EASY, avoidFirst); }
  function pickSentence() { return SENTENCES[(Math.random() * SENTENCES.length) | 0]; }
  function pickBoss() { return BOSS_LINES[(Math.random() * BOSS_LINES.length) | 0]; }

  /* ------------------------------------------------ config */
  var CFG = {
    dangerLineX: 7, spawnX: -40, laneZ: 6,
    girlfriend: { x: 8.8, z: -3.1 }, maxHearts: 6,
    baseSpeed: 2.0, speedPerLevel: 0.13, speedCap: 6.0,
    gapBase: 1.7, gapPerLevel: 0.06, gapMin: 0.4,
    concurrencyBase: 3, concurrencyStep: 0.6, concurrencyMax: 12,
    countBase: 6, countPerLevel: 2, countMax: 26,
    bossEvery: 5, comboMultStep: 0.15, comboMultCap: 8
  };
  var BASE_CAM = [15, 6.5, 0], LOOK = [-6, 2.6, 0];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function colorHex(css) { return parseInt(css.replace("#", "0x"), 16); }

  /* ------------------------------------------------ materials */
  function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, flatShading: true, roughness: 0.85, metalness: 0.05 }, opts || {}));
  }
  function emis(color, i) {
    return new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: i || 0.6, flatShading: true, roughness: 0.5 });
  }

  /* ------------------------------------------------ enemy mesh builders */
  function buildZombie(scale, skin, cloth) {
    var g = new THREE.Group(), m = mat(skin), c = mat(cloth);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.45), c); torso.position.y = 1.05; g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), m); head.position.set(0.05, 1.85, 0); g.add(head);
    var eye = emis(0xff3020, 1.2);
    [[-0.12, 0.18], [0.12, 0.18]].forEach(function (p) { var e = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.06), eye); e.position.set(0.26, 1.9 + p[1] - 0.18, p[0]); g.add(e); });
    [[-0.42], [0.42]].forEach(function (p) { var arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.18), m); arm.position.set(0.55, 1.25, p[0]); arm.rotation.z = -0.15; g.add(arm); });
    [[-0.2], [0.2]].forEach(function (p) { var leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.22), c); leg.position.set(0, 0.45, p[0]); g.add(leg); });
    g.scale.setScalar(scale);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildWall() {
    var g = new THREE.Group();
    var slab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.4, 5.2), mat(0x6b1f1f, { metalness: 0.3, roughness: 0.6 })); slab.position.y = 1.7; g.add(slab);
    var spikeMat = mat(0xc0c0cc, { metalness: 0.6, roughness: 0.3 });
    for (var yi = 0; yi < 4; yi++) for (var zi = 0; zi < 5; zi++) {
      var s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), spikeMat);
      s.rotation.z = -Math.PI / 2; s.position.set(0.65, 0.7 + yi * 0.75, -2.0 + zi * 1.0); g.add(s);
    }
    var glow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.4, 5.2), emis(0xff2a2a, 0.5)); glow.position.set(-0.32, 1.7, 0); g.add(glow);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildBoulder(scale) {
    var g = new THREE.Group();
    var rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), mat(0x777680, { roughness: 1 })); rock.position.y = 1.1; g.add(rock);
    g.scale.setScalar(scale); g.userData.spin = rock;
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildDart() {
    var g = new THREE.Group();
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8), mat(0x5a3a1a)); shaft.rotation.z = -Math.PI / 2; shaft.position.y = 1.4; g.add(shaft);
    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), emis(0xffd24a, 0.4)); tip.rotation.z = -Math.PI / 2; tip.position.set(0.95, 1.4, 0); g.add(tip);
    var fl = mat(0xcc3344);
    [[0, 0.18], [0, -0.18], [0.18, 0], [-0.18, 0]].forEach(function (p) { var f = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.28), fl); f.position.set(-0.7, 1.4 + p[0], p[1]); g.add(f); });
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildBomber() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), mat(0x222228, { metalness: 0.5, roughness: 0.4 })); body.position.y = 1.0; g.add(body);
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), emis(0xff5a1a, 0.9)); core.position.y = 1.0; g.add(core);
    var fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), mat(0x333333)); fuse.position.y = 1.9; g.add(fuse);
    var spark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), emis(0xffe08a, 1.5)); spark.position.y = 2.15; g.add(spark);
    g.userData.pulse = core;
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildBat() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(0x2a2030)); body.position.y = 2.0; g.add(body);
    var wingMat = mat(0x140f1a);
    var wl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.9), wingMat); wl.position.set(0, 2.0, 0.55); g.add(wl);
    var wr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.9), wingMat); wr.position.set(0, 2.0, -0.55); g.add(wr);
    g.userData.wings = [wl, wr];
    var e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), emis(0xff2020, 1.5)); e.position.set(0.24, 2.02, 0); g.add(e);
    return g;
  }
  function buildWraith() {
    var g = new THREE.Group();
    var m = new THREE.MeshStandardMaterial({ color: 0xaad4ff, emissive: 0x335577, emissiveIntensity: 0.5, transparent: true, opacity: 0.55, flatShading: true, roughness: 0.4 });
    var body = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 8), m); body.position.y = 1.4; g.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), m); head.position.y = 2.5; g.add(head);
    var eye = emis(0x66eaff, 1.4);
    [[-0.14], [0.14]].forEach(function (p) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eye); e.position.set(0.32, 2.55, p[0]); g.add(e); });
    g.userData.ghostMats = [m];
    return g;
  }
  function buildSpider() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), mat(0x1a1a22)); body.position.y = 0.8; g.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(0x24242e)); head.position.set(0.5, 0.8, 0); g.add(head);
    var eye = emis(0xff3355, 1.4);
    [[-0.1], [0.1]].forEach(function (p) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eye); e.position.set(0.72, 0.85, p[0]); g.add(e); });
    var legMat = mat(0x0e0e14);
    for (var i = 0; i < 4; i++) {
      var z = (i < 2 ? 1 : -1) * (0.4 + (i % 2) * 0.25), xoff = (i % 2 ? 0.3 : -0.3);
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 1.1, 6), legMat);
      leg.rotation.x = z > 0 ? 0.9 : -0.9; leg.rotation.z = 0.3; leg.position.set(xoff, 0.7, z); g.add(leg);
    }
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildGolem(scale) {
    var g = new THREE.Group(), rockCol = 0x555a52;
    var torso = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.2), mat(rockCol, { roughness: 1 })); torso.position.y = 1.9; g.add(torso);
    var head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), mat(0x484d46, { roughness: 1 })); head.position.y = 3.0; g.add(head);
    var glow = emis(0xffa030, 0.8);
    [[-0.3], [0.3]].forEach(function (p) { var e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), glow); e.position.set(0.55, 3.0, p[0]); g.add(e); });
    [[-1.0], [1.0]].forEach(function (p) { var arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), mat(rockCol, { roughness: 1 })); arm.position.set(0.4, 1.9, p[0]); g.add(arm); });
    var crack = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.15, 1.22), emis(0xff5a1a, 0.9)); crack.position.y = 1.6; g.add(crack);
    g.scale.setScalar(scale);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildBoss() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.2, 2.0), mat(0x2a0d0d, { roughness: 0.7 })); body.position.y = 2.6; g.add(body);
    var head = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), mat(0x3a1010)); head.position.y = 5.1; g.add(head);
    var eye = emis(0xff2a2a, 1.6);
    [[-0.35], [0.35]].forEach(function (p) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), eye); e.position.set(0.9, 5.15, p[0]); g.add(e); });
    var hm = mat(0x111111);
    [[-0.5], [0.5]].forEach(function (p) { var h = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 6), hm); h.position.set(0, 5.9, p[0]); h.rotation.x = p[0] > 0 ? -0.4 : 0.4; g.add(h); });
    [[-1.6], [1.6]].forEach(function (p) { var arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.9), mat(0x2a0d0d)); arm.position.set(0.5, 2.8, p[0]); g.add(arm); });
    var glow = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.3, 2.02), emis(0xff3a1a, 1.0)); glow.position.y = 1.4; g.add(glow);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  /* ------------------------------------------------ type registry */
  var TYPES = {
    shambler: { name: "Shambler", category: "zombie", tier: "easy", speedMul: 1.0, score: 100, color: "#7dff8a", labelY: 2.6, behavior: "walk", build: function () { return buildZombie(1.0, 0x6a8a4a, 0x3a4a2a); } },
    runner:   { name: "Runner", category: "zombie", tier: "tiny", speedMul: 2.1, score: 140, color: "#b6ff5a", labelY: 2.5, behavior: "walk", build: function () { return buildZombie(0.85, 0x8aa050, 0x555522); } },
    brute:    { name: "Brute", category: "zombie", tier: "hard", speedMul: 0.75, score: 260, color: "#ff9a5a", labelY: 3.2, behavior: "walk", build: function () { return buildZombie(1.5, 0x4f6a3a, 0x333322); } },
    crawler:  { name: "Crawler", category: "zombie", tier: "easy", speedMul: 1.35, score: 130, color: "#9dffb0", labelY: 1.4, behavior: "walk", build: function () { var z = buildZombie(0.9, 0x6a8a4a, 0x3a4a2a); z.rotation.z = -1.35; z.position.y = -0.2; return z; } },
    spider:   { name: "Spider", category: "beast", tier: "medium", speedMul: 1.5, score: 200, color: "#ff6ea0", labelY: 2.0, behavior: "burst", build: function () { return buildSpider(); } },
    bat:      { name: "Bat", category: "beast", tier: "tiny", speedMul: 2.4, score: 120, color: "#d98cff", labelY: 2.9, behavior: "wobble", build: function () { return buildBat(); } },
    wraith:   { name: "Wraith", category: "ghost", tier: "medium", speedMul: 1.1, score: 220, color: "#7fe9ff", labelY: 3.2, behavior: "fade", build: function () { return buildWraith(); } },
    boulder:  { name: "Boulder", category: "stone", tier: "easy", speedMul: 1.2, score: 150, color: "#d7d2c4", labelY: 2.6, behavior: "roll", build: function () { return buildBoulder(1.0); } },
    dart:     { name: "Dart", category: "arrow", tier: "tiny", speedMul: 3.2, score: 160, color: "#ffe14a", labelY: 2.3, behavior: "walk", build: function () { return buildDart(); } },
    bomber:   { name: "Bomber", category: "bomb", tier: "medium", speedMul: 1.0, score: 240, color: "#ff8a3a", labelY: 2.6, behavior: "walk", build: function () { return buildBomber(); }, damage: 2 },
    golem:    { name: "Golem", category: "stone", tier: "hard", speedMul: 0.6, score: 320, color: "#ffb45a", labelY: 4.0, behavior: "walk", build: function () { return buildGolem(1.0); } },
    wall:     { name: "Spike Wall", category: "wall", tier: "sentence", speedMul: 0.7, score: 500, color: "#ff5a5a", labelY: 4.0, behavior: "walk", build: function () { return buildWall(); }, damage: 3, avoid: true },
    boss:     { name: "NIGHTMARE", category: "boss", tier: "boss", speedMul: 0.55, score: 2000, color: "#ff3a3a", labelY: 7.0, behavior: "walk", build: function () { return buildBoss(); }, damage: 5, avoid: true }
  };

  /* ------------------------------------------------ scene construction */
  function buildGirlfriend() {
    var g = new THREE.Group();
    g.position.set(CFG.girlfriend.x, 0, CFG.girlfriend.z);
    g.rotation.y = Math.PI * 0.5;
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.6, 10), mat(0x5a3d22)); post.position.set(0, 1.8, -0.45); g.add(post);
    var crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8), mat(0x5a3d22)); crossbar.rotation.z = Math.PI / 2; crossbar.position.set(0, 2.7, -0.45); g.add(crossbar);
    var dress = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.6, 1.5, 14), mat(0xff5f9e)); dress.position.y = 0.95; g.add(dress);
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 12), mat(0xff86b6)); torso.position.y = 1.7; g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), mat(0xffd9b8)); head.position.y = 2.25; g.add(head);
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 14), mat(0x4a2c1a)); hair.scale.set(1, 0.9, 1); hair.position.set(0, 2.35, -0.06); g.add(hair);
    var eye = mat(0x2a2a2a);
    [[-0.12], [0.12]].forEach(function (p) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eye); e.position.set(p[0], 2.28, 0.3); g.add(e); });
    [[-0.42], [0.42]].forEach(function (p) { var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8), mat(0xffd9b8)); arm.position.set(p[0], 1.65, -0.2); arm.rotation.x = 0.5; g.add(arm); });
    var rope = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 16), mat(0xbfa76a)); rope.position.set(0, 1.5, 0); rope.rotation.y = Math.PI / 2; g.add(rope);
    var heart = new THREE.Group(), hm = emis(0xff3a6a, 1.1);
    var l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), hm); l.position.set(-0.12, 0, 0);
    var r = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), hm); r.position.set(0.12, 0, 0);
    var b = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.36, 4), hm); b.position.set(0, -0.22, 0); b.rotation.z = Math.PI;
    heart.add(l); heart.add(r); heart.add(b); heart.position.set(0, 3.1, 0); heart.scale.setScalar(0.9);
    g.add(heart); g.userData.heart = heart;
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildGun() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.34, 0.34), mat(0x2b2f36, { metalness: 0.7, roughness: 0.35 })); body.position.set(0, 0, -0.3); g.add(body);
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 12), mat(0x1c1f24, { metalness: 0.8, roughness: 0.3 })); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -1.1); g.add(barrel);
    var grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.32), mat(0x14161a)); grip.position.set(0.35, -0.4, 0.1); grip.rotation.x = 0.25; g.add(grip);
    var accent = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), emis(0x35e0ff, 0.9)); accent.position.set(0, 0.16, -0.3); g.add(accent);
    var muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -1.75); g.add(muzzle);
    var flash = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0 })); muzzle.add(flash);
    var mlight = new THREE.PointLight(0xffcc66, 0, 12, 2); muzzle.add(mlight);
    g.userData.muzzle = muzzle; g.userData.flash = flash; g.userData.mlight = mlight;
    g.position.set(-1.15, -1.0, -1.7);
    return g;
  }

  function buildScene(a) {
    THREE = a.THREE;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0710);
    scene.fog = new THREE.Fog(0x0a0710, 18, 62);
    var camera = new THREE.PerspectiveCamera(60, a.W / a.H || 1.6, 0.1, 200);
    camera.position.set(BASE_CAM[0], BASE_CAM[1], BASE_CAM[2]);
    camera.lookAt(LOOK[0], LOOK[1], LOOK[2]);

    scene.add(new THREE.HemisphereLight(0x4a5a8a, 0x1a0f10, 0.55));
    var key = new THREE.DirectionalLight(0xfff0dd, 1.0); key.position.set(10, 20, 8); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 1; key.shadow.camera.far = 80;
    key.shadow.camera.left = -40; key.shadow.camera.right = 20; key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
    scene.add(key);
    var rim = new THREE.PointLight(0xff3a3a, 1.2, 40, 2); rim.position.set(CFG.dangerLineX, 4, 0); scene.add(rim);
    var warm = new THREE.PointLight(0xffb060, 1.0, 20, 2); warm.position.set(CFG.girlfriend.x, 4, CFG.girlfriend.z); scene.add(warm);

    var ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 60), mat(0x120c16, { roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    var grid = new THREE.GridHelper(160, 80, 0x35204a, 0x241634); grid.position.y = 0.02; scene.add(grid);
    [-CFG.laneZ - 1.2, CFG.laneZ + 1.2].forEach(function (z) { var strip = new THREE.Mesh(new THREE.BoxGeometry(90, 0.12, 0.25), emis(0x9b3bff, 0.8)); strip.position.set(-18, 0.06, z); scene.add(strip); });
    var dl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, (CFG.laneZ + 1.2) * 2), emis(0xff2a2a, 1.0)); dl.position.set(CFG.dangerLineX, 0.07, 0); scene.add(dl);
    for (var i = 0; i < 10; i++) { var bd = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 3, 4 + Math.random() * 8, 2 + Math.random() * 3), mat(0x0d0a14)); bd.position.set(-55 - Math.random() * 20, 2 + Math.random() * 4, -20 + Math.random() * 40); scene.add(bd); }

    var girlfriend = buildGirlfriend(); scene.add(girlfriend);
    var gun = buildGun(); camera.add(gun); scene.add(camera);

    // embers
    var eg = new THREE.BufferGeometry(), n = 140, pos = new Float32Array(n * 3);
    for (var e = 0; e < n; e++) { pos[e * 3] = -40 + Math.random() * 60; pos[e * 3 + 1] = Math.random() * 12; pos[e * 3 + 2] = -14 + Math.random() * 28; }
    eg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xff8844, size: 0.12, transparent: true, opacity: 0.6 })); scene.add(embers);

    // particle pool (explosions)
    var particles = [], pgeo = new THREE.TetrahedronGeometry(0.16, 0);
    for (var p = 0; p < 200; p++) { var pm = new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial({ color: 0xffffff })); pm.visible = false; scene.add(pm); particles.push({ mesh: pm, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, max: 1 }); }
    // tracer pool
    var tracers = [], tgeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 6);
    for (var tr = 0; tr < 28; tr++) { var tm = new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0 })); tm.visible = false; scene.add(tm); tracers.push({ mesh: tm, life: 0, max: 0.12 }); }

    G.scene = scene; G.camera = camera; G.girlfriend = girlfriend; G.gfHeart = girlfriend.userData.heart;
    G.gun = gun; G.embers = embers; G.particles = particles; G.tracers = tracers;
    G._pgeo = pgeo; G._tgeo = tgeo;
    G.shakeMag = 0; G.gunKick = 0; G.gunRot = 0; G.muzzleT = 0; G.gfShakeT = 0; G.gfHopT = 0; G.clock = 0;
  }

  /* ------------------------------------------------ juice */
  var _v = null, _q = null, _up = null;
  function tmp() { if (!_v) { _v = new THREE.Vector3(); _q = new THREE.Quaternion(); _up = new THREE.Vector3(0, 1, 0); } }
  function hitPoint(e, out) { return out.copy(e.mesh.position).addScaledVector(_up, e.def.labelY * 0.55); }

  function explode(pos, hex, count) {
    var P = G.particles; count = count || 18;
    for (var i = 0, s = 0; i < P.length && s < count; i++) {
      var p = P[i]; if (p.life > 0) continue; s++;
      p.mesh.position.copy(pos); p.mesh.visible = true; p.mesh.material.color.setHex(hex);
      var speed = 3 + Math.random() * 7;
      p.vel.set(Math.random() - 0.5, Math.random() * 1.2 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed);
      p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      p.max = 0.5 + Math.random() * 0.5; p.life = p.max; p.mesh.scale.setScalar(1);
    }
  }
  function fireTracer(targetPos) {
    var T = G.tracers, t = null;
    for (var i = 0; i < T.length; i++) if (T[i].life <= 0) { t = T[i]; break; }
    if (!t) t = T[0];
    var muzzle = G.gun.userData.muzzle, a = muzzle.getWorldPosition(new THREE.Vector3());
    var dir = _v.copy(targetPos).sub(a), len = dir.length();
    t.mesh.position.copy(a).addScaledVector(dir, 0.5);
    _q.setFromUnitVectors(_up, dir.clone().normalize()); t.mesh.quaternion.copy(_q);
    t.mesh.scale.set(1, len, 1); t.mesh.material.opacity = 1; t.mesh.visible = true; t.life = t.max;
  }
  function gunRecoil() {
    G.gunKick = 0.32; G.gunRot = 0.18; G.muzzleT = 0.07;
    G.gun.userData.flash.material.opacity = 1; G.gun.userData.mlight.intensity = 6;
  }
  function fireAt(e) {
    tmp(); gunRecoil(); G._a.sound.shot(); G._a.sound.tick();
    hitPoint(e, _v); fireTracer(_v);
    explode(_v.clone(), colorHex(e.def.color), 5);
  }

  /* ------------------------------------------------ spawning */
  function baseSpeed() { return Math.min(CFG.speedCap, CFG.baseSpeed + G.level * CFG.speedPerLevel); }
  function concurrency() { return Math.min(CFG.concurrencyMax, Math.floor(CFG.concurrencyBase + G.level * CFG.concurrencyStep)); }
  function spawnGap() { return Math.max(CFG.gapMin, CFG.gapBase - G.level * CFG.gapPerLevel); }

  function activeFirstLetters() {
    var s = new Set();
    for (var i = 0; i < G.enemies.length; i++) { var e = G.enemies[i]; if (!e.dead && e.typedCount === 0) s.add(e.word[0]); }
    return s;
  }
  function makeWord(def) {
    if (def.tier === "sentence") return pickSentence();
    if (def.tier === "boss") return pickBoss();
    return pickWord(def.tier, activeFirstLetters());
  }
  function pickTypeId() {
    var pool = [], L = G.level;
    function add(id, w) { for (var i = 0; i < w; i++) pool.push(id); }
    add("shambler", 5); add("boulder", 2); add("runner", 3);
    if (L >= 2) { add("dart", 2); add("spider", 2); add("crawler", 2); add("wall", 2); add("bat", 2); }
    if (L >= 3) { add("brute", 2); add("bomber", 2); add("wraith", 2); }
    if (L >= 4) { add("golem", 1); add("wall", 1); }
    if (L >= 6) { add("brute", 1); add("wall", 1); add("golem", 1); }
    return pool[(Math.random() * pool.length) | 0];
  }
  function spawnEnemy(typeId, zOverride) {
    var def = TYPES[typeId], mesh = def.build();
    var z = zOverride != null ? zOverride
      : def.category === "boss" ? 0
      : def.category === "wall" ? (Math.random() * 2 - 1) * (CFG.laneZ * 0.5)
      : (Math.random() * 2 - 1) * (CFG.laneZ - 0.6);
    mesh.position.set(CFG.spawnX - Math.random() * 3, mesh.position.y, z);
    G.scene.add(mesh);
    var e = {
      def: def, mesh: mesh, word: makeWord(def), category: def.category,
      speed: baseSpeed() * def.speedMul, behavior: def.behavior,
      baseY: mesh.position.y, baseZ: z, phase: Math.random() * Math.PI * 2,
      burstT: 0, moving: true, damage: def.damage || 1, color: def.color,
      dead: false, avoid: !!def.avoid,
      // typing-engine fields:
      typedCount: 0, isActive: false, shakeUntil: 0, _lastTyped: 0
    };
    G.enemies.push(e);
    if (def.category === "boss") { G.hasBoss = true; G.bossAlive = true; }
    return e;
  }
  function spawnCluster() {
    var n = 2 + ((Math.random() * 2) | 0), pack = ["shambler", "runner", "crawler"];
    var room = Math.max(1, concurrency() - G.enemies.length), used = Math.min(n, G.toSpawn, room);
    for (var i = 0; i < used; i++) { var zz = (i - (used - 1) / 2) * 2.2; spawnEnemy(pack[(Math.random() * pack.length) | 0], clamp(zz, -CFG.laneZ + 0.6, CFG.laneZ - 0.6)); }
    return used;
  }

  /* ------------------------------------------------ enemy lifecycle */
  function removeEnemyMesh(mesh) {
    G.scene.remove(mesh);
    mesh.traverse(function (o) {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); }); else o.material.dispose(); }
    });
  }
  function splice(e) { var i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); }

  function killEnemy(e) {
    if (e.dead) return; e.dead = true;
    tmp();
    _v.copy(e.mesh.position).add(new THREE.Vector3(0, e.def.labelY * 0.4, 0));
    explode(_v.clone(), colorHex(e.def.color), 26);
    G.shakeMag = Math.min(1.4, G.shakeMag + 0.34); G._a.sound.boom(0.7); G.hitstopT = 0.045;
    if (e.def.category === "boss") G.bossAlive = false;
    removeEnemyMesh(e.mesh); splice(e);
  }
  function enemyReaches(e) {
    if (e.dead) return; e.dead = true;
    if (e.def.category === "boss") G.bossAlive = false;
    G.hearts -= e.damage; G.combo = 0;
    G.gfShakeT = 0.4; G.shakeMag = Math.min(1.4, G.shakeMag + 0.6); G._a.sound.hurt();
    G._flashT = 0.4;
    removeEnemyMesh(e.mesh); splice(e);
    updateHUD();
    if (G.hearts <= 0) { endRun(); return; }
  }

  /* ------------------------------------------------ level flow */
  function startLevel(n) {
    G.level = n;
    // clear leftovers
    for (var i = 0; i < G.enemies.length; i++) removeEnemyMesh(G.enemies[i].mesh);
    G.enemies.length = 0;
    G.combo = 0;
    G.waveStart = G.runElapsed;
    G.hasBoss = (n % CFG.bossEvery === 0); G.bossAlive = false;
    G.toSpawn = Math.min(CFG.countMax, CFG.countBase + n * CFG.countPerLevel);
    if (G.hasBoss) G.toSpawn = Math.max(4, Math.round(G.toSpawn * 0.6));
    G.spawnedTotal = 0; G.spawnTimer = 0.6;
    if (G.hasBoss) spawnEnemy("boss");
    updateHUD();
  }
  function completeLevel() {
    var perfect = G.hearts >= CFG.maxHearts;
    var bonus = G.hearts * 250 + (perfect ? 1000 : 0);
    G.score += bonus;
    G._a.sound.levelup();
    G.gfHopT = 1.0;
    G._a.banner((perfect ? "PERFECT WAVE +1000 · " : "") + "LEVEL " + (G.level + 1), 1100);
    startLevel(G.level + 1);
  }
  function checkWaveEnd() { if (G.toSpawn <= 0 && G.enemies.length === 0 && !G.bossAlive) completeLevel(); }

  function endRun() {
    var elapsed = Math.max(0.001, G.runElapsed);
    var wpm = Math.round((G.keysCorrect / 5) / (elapsed / 60));
    var acc = G.keysTyped > 0 ? Math.round((G.keysCorrect / G.keysTyped) * 100) : 100;
    G._a.end({
      score: G.score, unit: "pts", badge: "SHE'S GONE",
      title: "You reached level " + G.level,
      stats: [
        { k: "Score", v: Math.round(G.score).toLocaleString() },
        { k: "Level", v: G.level },
        { k: "Max Combo", v: "x" + G.comboMax },
        { k: "WPM", v: wpm }
      ]
    });
  }

  function comboMult() { return Math.min(CFG.comboMultCap, 1 + G.combo * CFG.comboMultStep); }

  function updateHUD() {
    var a = G._a;
    var h = "";
    for (var i = 0; i < CFG.maxHearts; i++) h += i < G.hearts ? "❤" : "🖤";
    var elapsed = G.runElapsed;
    var wpm = elapsed > 0.5 ? Math.round((G.keysCorrect / 5) / (elapsed / 60)) : 0;
    a.setStats({
      Level: G.level,
      Score: Math.round(G.score).toLocaleString(),
      Combo: G.combo > 0 ? "x" + comboMult().toFixed(1) : "—",
      Hearts: h,
      WPM: wpm
    });
  }

  /* ------------------------------------------------ per-frame scene juice */
  function stepEnemy(e, dt) {
    var m = e.mesh, now = G.clock;
    m.position.x += e.speed * dt;
    switch (e.behavior) {
      case "walk": if (e.category === "zombie") m.position.y = e.baseY + Math.abs(Math.sin((m.position.x + e.phase) * 2.2)) * 0.12; break;
      case "roll": if (m.userData.spin) m.userData.spin.rotation.z -= e.speed * dt * 1.4; break;
      case "wobble":
        m.position.z = e.baseZ + Math.sin(now * 4 + e.phase) * 1.3;
        m.position.y = e.baseY + Math.sin(now * 8 + e.phase) * 0.2;
        if (m.userData.wings) { var f = Math.sin(now * 22) * 0.6; m.userData.wings[0].rotation.x = f; m.userData.wings[1].rotation.x = -f; }
        break;
      case "burst":
        e.burstT -= dt; if (e.burstT <= 0) { e.moving = !e.moving; e.burstT = e.moving ? 0.5 : 0.35; }
        if (e.moving) m.position.x += e.speed * 0.9 * dt; break;
      case "fade":
        if (m.userData.ghostMats) { var o = 0.35 + (Math.sin(now * 2.5 + e.phase) * 0.5 + 0.5) * 0.5; m.userData.ghostMats[0].opacity = o; } break;
    }
    if (m.userData.pulse) { var s = 1 + Math.sin(now * 10) * 0.08; m.userData.pulse.scale.setScalar(s); }
  }

  function updateSceneJuice(dt) {
    tmp();
    var cam = G.camera;
    // screen shake
    G.shakeMag *= Math.pow(0.0015, dt); if (G.shakeMag < 0.001) G.shakeMag = 0;
    var ox = (Math.random() - 0.5) * G.shakeMag * 2.2, oy = (Math.random() - 0.5) * G.shakeMag * 2.2, oz = (Math.random() - 0.5) * G.shakeMag * 1.2;
    cam.position.set(BASE_CAM[0] + ox, BASE_CAM[1] + oy, BASE_CAM[2] + oz);
    cam.lookAt(LOOK[0] + ox * 0.3, LOOK[1] + oy * 0.3, LOOK[2] + oz * 0.3);

    // gun recoil recover
    G.gunKick += (0 - G.gunKick) * Math.min(1, dt * 14);
    G.gunRot += (0 - G.gunRot) * Math.min(1, dt * 14);
    G.gun.position.set(-1.15, -1.0 + Math.sin(G.clock * 1.6) * 0.02, -1.7 + G.gunKick);
    G.gun.rotation.x = G.gunRot;
    if (G.muzzleT > 0) {
      G.muzzleT -= dt; var f = Math.max(0, G.muzzleT / 0.07);
      G.gun.userData.flash.material.opacity = f; G.gun.userData.mlight.intensity = f * 6;
    }

    // tracers
    for (var i = 0; i < G.tracers.length; i++) { var t = G.tracers[i]; if (t.life > 0) { t.life -= dt; t.mesh.material.opacity = Math.max(0, t.life / t.max); if (t.life <= 0) t.mesh.visible = false; } }
    // particles
    for (var j = 0; j < G.particles.length; j++) {
      var p = G.particles[j]; if (p.life <= 0) continue;
      p.life -= dt; if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 20 * dt; p.vel.multiplyScalar(Math.pow(0.12, dt));
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.scale.setScalar(Math.max(0.05, p.life / p.max));
    }

    // girlfriend idle / hit / saved
    if (G.gfShakeT > 0) { G.gfShakeT -= dt; G.girlfriend.position.x = CFG.girlfriend.x + (Math.random() - 0.5) * 0.25; G.girlfriend.rotation.z = (Math.random() - 0.5) * 0.15; }
    else { G.girlfriend.position.x = CFG.girlfriend.x; G.girlfriend.rotation.z = Math.sin(G.clock * 1.4) * 0.05; }
    if (G.gfHopT > 0) { G.gfHopT -= dt; G.girlfriend.position.y = Math.abs(Math.sin(G.clock * 12)) * 0.4 * G.gfHopT; } else G.girlfriend.position.y = 0;
    if (G.gfHeart) { var hb = 1 + Math.sin(G.clock * 5) * 0.12; G.gfHeart.scale.setScalar(0.9 * hb); G.gfHeart.rotation.y = G.clock * 1.5; }

    // embers drift
    var arr = G.embers.geometry.attributes.position.array;
    for (var e = 1; e < arr.length; e += 3) { arr[e] += dt * 0.4; if (arr[e] > 12) arr[e] = 0; }
    G.embers.geometry.attributes.position.needsUpdate = true;
    G.embers.rotation.y += dt * 0.02;
  }

  /* ------------------------------------------------ the game object */
  var game = {
    id: "gf", name: "Save Your Girlfriend", icon: "💘", color: "#ff3aa8", is3D: true,
    tagline: "She's tied to the post. A horde storms in from the left. Your keyboard is the gun — type the word over each monster to blast it before it reaches her. Endless levels, a boss every 5.",
    intro: { duration: 3.4, count: 4 },

    introInit: function (a) {
      G = this; this._a = a; THREE = a.THREE;
      this.enemies = [];
      this.level = 1; this.score = 0; this.hearts = CFG.maxHearts; this.combo = 0; this.comboMax = 0;
      this.runElapsed = 0; this.keysTyped = 0; this.keysCorrect = 0;
      this.toSpawn = 0; this.spawnTimer = 999; this.hasBoss = false; this.bossAlive = false;
      this.hitstopT = 0; this._flashT = 0;
      buildScene(a);
      // a few distant enemies shambling in for the cold-open
      for (var i = 0; i < 4; i++) { var e = spawnEnemy(i % 2 ? "runner" : "shambler"); e.mesh.position.x = -30 - i * 4; }
    },
    introFrame: function (c, a, t, total) {
      // engine renders the 3D scene; we advance juice + draw the title
      G = this; var dt = Math.min(0.05, t - (this._it || 0)); this._it = t;
      this.clock += dt;
      for (var i = 0; i < this.enemies.length; i++) stepEnemy(this.enemies[i], dt * 0.6);
      updateSceneJuice(dt);
      // title card
      var W = a.W, H = a.H, m = Math.min(1, t / 0.6);
      c.save(); c.textAlign = "center"; c.textBaseline = "middle"; c.globalAlpha = m;
      c.shadowColor = "rgba(255,58,168,0.8)"; c.shadowBlur = 34; c.fillStyle = "#fff";
      c.font = "800 " + Math.round(clamp(H * 0.09, 30, 78)) + "px 'Sora', system-ui, sans-serif";
      c.fillText("SAVE YOUR", W / 2, H * 0.4);
      c.fillStyle = "#ff6ab6"; c.fillText("GIRLFRIEND", W / 2, H * 0.4 + clamp(H * 0.1, 34, 84));
      c.shadowBlur = 0; c.globalAlpha = Math.min(1, Math.max(0, (t - 0.5) / 0.6));
      c.fillStyle = "rgba(240,224,255,0.9)"; c.font = "700 " + Math.round(clamp(H * 0.028, 12, 24)) + "px 'Sora', system-ui, sans-serif";
      c.fillText("YOUR KEYBOARD IS THE ONLY WEAPON", W / 2, H * 0.4 + clamp(H * 0.19, 70, 150));
      c.restore();
    },

    init: function (a) {
      G = this; this._a = a; THREE = a.THREE;
      // Rebuild fresh (intro may or may not have run). Dispose any prior scene first.
      if (this.scene) this.dispose();
      this.enemies = [];
      this.level = 1; this.score = 0; this.hearts = CFG.maxHearts; this.combo = 0; this.comboMax = 0;
      this.runElapsed = 0; this.waveStart = 0; this.keysTyped = 0; this.keysCorrect = 0;
      this.hitstopT = 0; this._flashT = 0; this._it = 0;
      buildScene(a);
      startLevel(1);
      updateHUD();
    },

    onResize: function (a) { /* camera aspect handled by the engine */ },

    update: function (dt, a) {
      G = this; this._a = a;
      if (this.hitstopT > 0) this.hitstopT -= dt;
      var moveDt = this.hitstopT > 0 ? dt * 0.06 : dt;
      this.runElapsed += dt; this.clock += dt;
      if (this._flashT > 0) this._flashT -= dt;

      // spawn director
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.toSpawn > 0 && this.enemies.length < concurrency()) {
        var spawned = 1, clusterChance = 0.25 + this.level * 0.03;
        if (this.toSpawn >= 2 && Math.random() < clusterChance) spawned = spawnCluster();
        else spawnEnemy(pickTypeId());
        this.toSpawn -= spawned; this.spawnedTotal += spawned;
        this.spawnTimer = spawnGap() * (0.7 + Math.random() * 0.6);
      }

      // move + behaviors + per-letter shot detection + breach test
      for (var i = this.enemies.length - 1; i >= 0; i--) {
        var e = this.enemies[i]; if (e.dead) continue;
        // fire a shot each time the engine advanced this word's typed count
        if (e.typedCount > e._lastTyped) { fireAt(e); e._lastTyped = e.typedCount; }
        else if (e.typedCount < e._lastTyped) { e._lastTyped = e.typedCount; }
        stepEnemy(e, moveDt);
        if (e.mesh.position.x >= CFG.dangerLineX) { enemyReaches(e); continue; }
      }

      updateSceneJuice(dt);
      updateHUD();
    },

    // The engine's typing model: return live enemies as targets.
    targets: function () {
      var out = [];
      for (var i = 0; i < this.enemies.length; i++) { var e = this.enemies[i]; if (!e.dead && e.word) out.push(e); }
      // most-urgent (furthest right) first helps first-letter acquisition
      out.sort(function (p, q) { return q.mesh.position.x - p.mesh.position.x; });
      return out;
    },

    // Word fully typed → destroy the enemy, score + combo.
    hit: function (e, a) {
      if (!e || e.dead) return;
      // count the whole word toward WPM/accuracy
      this.keysCorrect += e.word.replace(/ /g, "").length;
      this.keysTyped += e.word.replace(/ /g, "").length;
      tmp(); hitPoint(e, _v); fireTracer(_v); a.sound.shot();
      var scr = a.toScreen(e.mesh.position.clone().add(new THREE.Vector3(0, e.def.labelY * 0.5, 0)), this.camera);
      this.combo++; this.comboMax = Math.max(this.comboMax, this.combo);
      var gain = Math.round(e.def.score * comboMult());
      this.score += gain;
      if (scr.visible) a.burst(scr.x, scr.y, e.def.color, 14);
      if (this.combo > 0 && this.combo % 5 === 0) { a.sound.combo(this.combo / 5); a.banner("COMBO x" + comboMult().toFixed(1), 700); this.shakeMag = Math.min(1.4, this.shakeMag + 0.5); }
      killEnemy(e);
      updateHUD();
      checkWaveEnd();
    },

    miss: function (a, ch) { this.keysTyped++; a.sound.tick(); },

    render: function (c, a) {
      // 3D already drawn by the engine. Draw word tags + reticle on the 2D overlay.
      var cam = this.camera, active = null;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i]; if (e.dead || !e.word) continue;
        var lp = e.mesh.position.clone(); lp.y += e.def.labelY;
        var p = a.toScreen(lp, cam);
        if (!p.visible) continue;
        var far = clamp((e.mesh.position.x - CFG.spawnX) / (CFG.dangerLineX - CFG.spawnX), 0, 1);
        var near = far > 0.72;
        a.wordTag(c, p.x, p.y, e, { accent: e.color, size: e.category === "boss" ? 15 : (e.category === "wall" ? 14 : 17), bg: near ? "rgba(40,6,10,0.9)" : "rgba(6,10,26,0.82)" });
        if (e.isActive) active = p;
      }
      // reticle on the active target
      if (active) {
        c.save(); c.strokeStyle = "#35e0ff"; c.lineWidth = 2; c.globalAlpha = 0.9;
        c.beginPath(); c.arc(active.x, active.y, 30, 0, 7); c.stroke();
        c.globalAlpha = 1; c.restore();
      }
      // red damage flash
      if (this._flashT > 0) { c.save(); c.globalAlpha = Math.min(0.5, this._flashT); c.fillStyle = "#ff1a1a"; c.fillRect(0, 0, a.W, a.H); c.restore(); }
    },

    dispose: function () {
      if (!this.scene) return;
      var self = this;
      if (this.enemies) this.enemies.forEach(function (e) { removeEnemyMesh(e.mesh); });
      this.enemies = [];
      this.scene.traverse(function (o) {
        if (o.isMesh || o.isPoints) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) { if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); }); else o.material.dispose(); }
        }
      });
      this.scene = null; this.camera = null; this.girlfriend = null; this.gun = null;
      this.embers = null; this.particles = null; this.tracers = null;
    }
  };

  A.register(game);
})();
