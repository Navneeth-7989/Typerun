/* =========================================================
   SPRINT · Arcade — "斬 KIRI · Neon Blade" (3D typing slasher)
   You stand on a floating obsidian platform beneath a blood
   moon and a neon torii gate. An undead horde shambles out of
   the dark, a word branded above each one. Type it and your
   katana answers — time snaps to slow-motion and the zombie is
   cut down in a burst of light. Chain clean kills to fill ZANSHIN (残心);
   fill it and enter PERFECT FOCUS, freezing time to clear the
   whole screen in one balletic sweep. Let three shards slip
   past your guard and the night falls silent.

   Built on the arcade engine's shared Three.js layer: the 3D
   scene renders to #game-gl, word tags + the blade FX + HUD
   draw on the 2D overlay. Registers via SprintArcade.register().
   ========================================================= */
(function () {
  "use strict";
  var A = window.SprintArcade;
  if (!A) return;

  var THREE = null;   // set from api.THREE
  var G = null;       // the live game object

  /* ------------------------------------------------ helpers */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function fmt(n) { return Math.round(n).toLocaleString(); }
  function colorHex(css) { return parseInt(css.replace("#", "0x"), 16); }
  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  /* ------------------------------------------------ word banks (night / blade theme) */
  var SHORT = ["cut","arc","ash","fog","ice","vow","zen","dao","oni","ryu","ken","jin","dusk","dawn","mist","silk","jade","iron","calm","edge","fang","claw","howl","gale","void","moon","star","rain","snow","wind","pine","koi","bow","slay","kata","hush","pale","dire","riven"];
  var MED = ["shadow","temple","dragon","lantern","ronin","shogun","katana","bushido","samurai","crimson","midnight","whisper","silence","thunder","blossom","phantom","cherry","moonlit","tempest","serpent","warrior","ember","twilight","kimono","feudal","honor","valor","spirit","raven","frost","willow","cinder","glaive","onyx","nimbus","vesper"];
  var LONG = ["reflection","meditation","discipline","precision","avalanche","nightfall","moonlight","resonance","ferocity","tranquil","ephemeral","cascade","luminous","silhouette","ceremony","sanctuary","wanderer","ancestor","immortal","invincible","serenity","obsidian","nocturne","equinox"];
  var LINES = ["one cut one kill","still the mind","the blade knows","breathe and strike","shadows fall away","no wasted motion","flow like water","the moon is watching","empty your thoughts","let the edge decide"];
  var BOSS = [
    "an oni rises from the crimson mist and only a flawless blade can send it back to the dark",
    "still your breath focus your eyes and cut the demon down in a single perfect motion",
    "the final shadow blocks the gate so strike true and let not one letter fall astray"
  ];

  /* ------------------------------------------------ config */
  var CFG = {
    camPos: [0, 3.6, 10.2], look: [0, 0.9, -13], fov: 60,
    spawnZ: -33, guardZ: 5.2,
    xSpread: 7.0, yMin: 1.4, yMax: 5.6,
    baseSpeed: 2.9, speedPerLevel: 0.2, speedCap: 7.5,
    gapBase: 1.75, gapPerLevel: 0.07, gapMin: 0.45,
    concBase: 2, concStep: 0.4, concMax: 7,
    countBase: 7, countPerLevel: 2, countMax: 30,
    bossEvery: 5, maxGuard: 3, zanMax: 100
  };

  /* ------------------------------------------------ shard type registry */
  // tier picks the word bank; color drives the glowing eyes + neon rim.
  var KINDS = {
    shard:  { tier: "short", color: "#7dff8a", skin: 0x6a8a4a, cloth: 0x33442a, speedMul: 1.0,  score: 10, zan: 8,  scale: 1.3,  boss: false }, // walker
    rune:   { tier: "med",   color: "#49e6ff", skin: 0x5a7a86, cloth: 0x243a42, speedMul: 1.3,  score: 15, zan: 10, scale: 1.2,  boss: false }, // ghoul (fast)
    sigil:  { tier: "long",  color: "#ff3aa8", skin: 0x7a5a6a, cloth: 0x3a2030, speedMul: 0.8,  score: 26, zan: 13, scale: 1.65, boss: false }, // brute
    verse:  { tier: "line",  color: "#ffd24a", skin: 0x8a7a5a, cloth: 0x3a3020, speedMul: 0.75, score: 42, zan: 18, scale: 1.45, boss: false }, // revenant
    oni:    { tier: "boss",  color: "#ff5a2a", skin: 0x5a2020, cloth: 0x2a0d0d, speedMul: 0.55, score: 90, zan: 40, scale: 2.4,  boss: true  }  // oni brute
  };
  function wordFor(tier) {
    if (tier === "short") return pick(SHORT);
    if (tier === "med") return pick(MED);
    if (tier === "long") return pick(LONG);
    if (tier === "line") return pick(LINES);
    return pick(BOSS);
  }

  /* ------------------------------------------------ shared THREE scratch + glow texture */
  var _v = null, _v2 = null, _q = null, _up = null;
  function tmp() { if (!_v) { _v = new THREE.Vector3(); _v2 = new THREE.Vector3(); _q = new THREE.Quaternion(); _up = new THREE.Vector3(0, 1, 0); } }

  function makeGlowTexture() {
    var cv = document.createElement("canvas"); cv.width = cv.height = 128;
    var g = cv.getContext("2d");
    var grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.2, "rgba(255,255,255,0.72)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.26)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }

  /* ------------------------------------------------ material helpers */
  function mat(color, opts) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0.1, flatShading: true }, opts || {})); }
  function emis(color, i) { return new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: i || 0.7, roughness: 0.4, metalness: 0.2, flatShading: true }); }
  function glowSprite(color, size, opacity) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G._glowTex, color: color, transparent: true, opacity: opacity == null ? 0.8 : opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size); return s;
  }

  /* ------------------------------------------------ world builders */
  // A compact, realistic katana: dark wrapped tsuka, oval tsuba, brass habaki
  // and a gently curved (sori) polished-steel blade. Kept short so it reads as
  // a real sword in-hand rather than a glowing bar.
  function buildKatana() {
    var g = new THREE.Group();
    // smooth (non-flat) polished steel so the blade reads as one clean piece
    var steel = new THREE.MeshStandardMaterial({ color: 0xccd8e8, metalness: 0.9, roughness: 0.17 });
    // pommel (kashira) + wrapped handle (tsuka)
    var kashira = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 10), mat(0x24242a, { metalness: 0.6, roughness: 0.4 })); kashira.position.y = -0.55; g.add(kashira);
    var tsuka = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.05, 0.5, 10), mat(0x161016, { roughness: 0.95 })); tsuka.position.y = -0.3; g.add(tsuka);
    for (var w = 0; w < 5; w++) { var wr = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.11), mat(0x08080c, { roughness: 1 })); wr.position.y = -0.5 + w * 0.1; wr.rotation.y = 0.6; g.add(wr); }
    // guard (tsuba) — flattened oval
    var tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.03, 20), mat(0x1e1e1d, { metalness: 0.7, roughness: 0.35 })); tsuba.position.y = 0.0; tsuba.scale.set(1, 1, 1.25); g.add(tsuba);
    // brass collar (habaki)
    var habaki = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.05), mat(0xc9a24a, { metalness: 0.8, roughness: 0.3 })); habaki.position.y = 0.08; g.add(habaki);
    // curved blade — ONE smooth tapered steel piece with a gentle sori, so it
    // never shows segment "breaks". Built from a silhouette Shape + Extrude.
    var bladeLen = 1.4, sori = 0.13, N = 28, base = 0.14;
    var spinePts = [], edgePts = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N, yv = base + t * bladeLen, cxv = -sori * t * t, ww = 0.03 * (1 - 0.08 * t);
      if (t > 0.8) ww *= Math.max(0.04, 1 - (t - 0.8) / 0.2); // taper into the kissaki
      spinePts.push([cxv + ww, yv]); edgePts.push([cxv - ww, yv]);
    }
    var shape = new THREE.Shape();
    shape.moveTo(edgePts[0][0], edgePts[0][1]);
    for (var a2 = 1; a2 < edgePts.length; a2++) shape.lineTo(edgePts[a2][0], edgePts[a2][1]);
    for (var b2 = spinePts.length - 1; b2 >= 0; b2--) shape.lineTo(spinePts[b2][0], spinePts[b2][1]);
    shape.closePath();
    var bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.005, bevelSegments: 1, steps: 1 });
    bladeGeo.translate(0, 0, -0.013);
    var blade = new THREE.Mesh(bladeGeo, steel); blade.castShadow = true; g.add(blade);
    // subtle hamon (temper line) tracing the edge — the hand-forged detail
    var hamonPts = [];
    for (var h = 0; h <= N; h++) { var th = h / N; hamonPts.push(new THREE.Vector3(-sori * th * th - 0.017, base + th * bladeLen, 0.016)); }
    var hamon = new THREE.Line(new THREE.BufferGeometry().setFromPoints(hamonPts), new THREE.LineBasicMaterial({ color: 0xeef6ff, transparent: true, opacity: 0.45 })); g.add(hamon);
    // faint edge glow + a light that flares on a cut (kept subtle — it's steel)
    var flare = glowSprite(0xbfe8ff, 0.8, 0.0); flare.position.set(-sori * 0.5, base + bladeLen * 0.5, 0); g.add(flare);
    var light = new THREE.PointLight(0x9fd8ff, 0.7, 7, 2); light.position.set(0.05, 0.7, 0.15); g.add(light);
    g.userData = { flare: flare, light: light };
    g.position.set(1.05, -1.25, -1.8);
    g.rotation.set(0.0, 0.0, 0.5);
    return g;
  }

  function buildTorii() {
    var g = new THREE.Group();
    var pillarMat = emis(0xc2381f, 0.35);
    var beamMat = emis(0xd83f22, 0.5);
    [-3.4, 3.4].forEach(function (x) {
      var p = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 12, 12), pillarMat);
      p.position.set(x, 6, 0); g.add(p);
    });
    var top = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.9, 0.9), beamMat); top.position.set(0, 12.2, 0); top.rotation.z = 0.02; g.add(top);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.6, 1.2), beamMat); cap.position.set(0, 12.9, 0); g.add(cap);
    var mid = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.6, 0.7), beamMat); mid.position.set(0, 9.6, 0); g.add(mid);
    var plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.3), emis(0xffcf5a, 0.7)); plate.position.set(0, 10.9, 0.3); g.add(plate);
    g.position.set(0, 0, -58);
    return g;
  }

  function buildLantern(color) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 1.3, roughness: 0.5, transparent: true, opacity: 0.92 }));
    body.scale.set(1, 1.25, 1); g.add(body);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.14, 8), mat(0x14100c)); cap.position.y = 0.66; g.add(cap);
    g.add(glowSprite(color, 3.2, 0.55));
    return g;
  }

  // A box-built undead figure, hunched forward with reaching arms and glowing
  // (colour-coded) eyes. Modelled facing +z so it reaches toward the player.
  function buildZombie(def) {
    var g = new THREE.Group();
    var col = colorHex(def.color);
    var legMat = mat(def.cloth, { roughness: 1 });
    var ll = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.24), legMat); ll.position.set(-0.17, 0.45, 0);
    var rl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.24), legMat); rl.position.set(0.17, 0.45, 0);
    g.add(ll); g.add(rl);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.98, 0.42), mat(def.cloth, { roughness: 0.95 }));
    torso.position.set(0, 1.28, 0.06); torso.rotation.x = 0.3; g.add(torso);
    // ragged collar accent so the torso reads as tattered
    var collar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.46), mat(def.skin, { roughness: 1 })); collar.position.set(0, 1.72, 0.12); g.add(collar);
    var armMat = mat(def.skin, { roughness: 0.9 });
    var la = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.8), armMat); la.position.set(-0.42, 1.5, 0.42); la.rotation.x = -0.15; g.add(la);
    var ra = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.8), armMat); ra.position.set(0.42, 1.5, 0.42); ra.rotation.x = -0.15; g.add(ra);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.46), mat(def.skin, { roughness: 0.9 }));
    head.position.set(0, 1.94, 0.16); head.rotation.x = 0.18; g.add(head);
    var eyeMat = emis(col, 1.6);
    [-0.1, 0.1].forEach(function (px) { var e = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.05), eyeMat); e.position.set(px, 1.97, 0.4); g.add(e); });
    if (def.boss) { // oni horns mark the boss brute
      var hMat = emis(0xffcf5a, 0.6);
      [-0.24, 0.24].forEach(function (px) { var h = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 6), hMat); h.position.set(px, 2.32, 0.1); h.rotation.z = px > 0 ? -0.4 : 0.4; g.add(h); });
    }
    var glow = glowSprite(col, def.boss ? 4.6 : 1.9, 0.55); glow.position.set(0, 2.0, 0.1); g.add(glow);
    g.userData = { legs: [ll, rl], arms: [la, ra], head: head, glow: glow, eyes: eyeMat };
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  function buildScene(a) {
    THREE = a.THREE;
    if (a.renderer) { a.renderer.toneMapping = THREE.ACESFilmicToneMapping; a.renderer.toneMappingExposure = 1.18; }
    if (!G._glowTex) G._glowTex = makeGlowTexture();

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06060f);
    scene.fog = new THREE.FogExp2(0x06060f, 0.017);

    var camera = new THREE.PerspectiveCamera(CFG.fov, a.W / a.H || 1.6, 0.1, 300);
    camera.position.set(CFG.camPos[0], CFG.camPos[1], CFG.camPos[2]);
    camera.lookAt(CFG.look[0], CFG.look[1], CFG.look[2]);

    // lighting — cool moonlight from above, warm neon glow from below
    scene.add(new THREE.HemisphereLight(0x3a4a80, 0x160a12, 0.6));
    var key = new THREE.DirectionalLight(0xbcd0ff, 0.9); key.position.set(-8, 22, 6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 1; key.shadow.camera.far = 90;
    key.shadow.camera.left = -30; key.shadow.camera.right = 30; key.shadow.camera.top = 30; key.shadow.camera.bottom = -20;
    scene.add(key);
    var rim = new THREE.PointLight(0xff3aa8, 1.3, 34, 2); rim.position.set(0, 4, 8); scene.add(rim);
    var warm = new THREE.PointLight(0xff6a2a, 1.1, 80, 2); warm.position.set(0, 16, -52); scene.add(warm);

    // blood moon — solid disc + big additive halo
    var moon = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: 0xff5636 }));
    moon.position.set(0, 15, -78); scene.add(moon);
    var moonGlow = glowSprite(0xff6a3a, 42, 0.85); moonGlow.position.set(0, 15, -77); scene.add(moonGlow);

    var torii = buildTorii(); scene.add(torii);

    // floating platform — dark glossy disc that reads as wet obsidian
    var floor = new THREE.Mesh(new THREE.CircleGeometry(46, 64), new THREE.MeshStandardMaterial({ color: 0x0a0a14, metalness: 0.85, roughness: 0.24 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true; scene.add(floor);
    // concentric neon rings on the floor
    var rings = [];
    for (var r = 0; r < 5; r++) {
      var ring = new THREE.Mesh(new THREE.TorusGeometry(6 + r * 7.5, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: r % 2 ? 0x7c5cff : 0x35e0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring); rings.push(ring);
    }
    // guard line — a bright arc near the player
    var guardLine = new THREE.Mesh(new THREE.BoxGeometry(15, 0.05, 0.16), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    guardLine.position.set(0, 0.03, CFG.guardZ); scene.add(guardLine);

    // distant floating lanterns
    var lanterns = [];
    [[-11, 7, -40, 0xffb44a], [12, 9, -46, 0xff7a9a], [-15, 5.5, -30, 0x9a7cff]].forEach(function (l) {
      var lan = buildLantern(l[3]); lan.position.set(l[0], l[1], l[2]); scene.add(lan);
      lanterns.push({ mesh: lan, base: l[1], phase: Math.random() * 6.28 });
    });

    // rain — many short falling streaks
    var rainN = 320, rpos = new Float32Array(rainN * 6);
    for (var i = 0; i < rainN; i++) {
      var rx = rand(-26, 26), ry = rand(-2, 26), rz = rand(-40, 12), len = rand(0.5, 1.1);
      rpos[i * 6] = rx; rpos[i * 6 + 1] = ry; rpos[i * 6 + 2] = rz;
      rpos[i * 6 + 3] = rx + 0.12; rpos[i * 6 + 4] = ry - len; rpos[i * 6 + 5] = rz;
    }
    var rgeo = new THREE.BufferGeometry(); rgeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
    var rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.24 })); scene.add(rain);

    // cherry-blossom petals drifting
    var petN = 120, ppos = new Float32Array(petN * 3), pph = [];
    for (var p = 0; p < petN; p++) { ppos[p * 3] = rand(-24, 24); ppos[p * 3 + 1] = rand(0, 20); ppos[p * 3 + 2] = rand(-42, 10); pph.push(rand(0, 6.28)); }
    var pgeoP = new THREE.BufferGeometry(); pgeoP.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
    var petals = new THREE.Points(pgeoP, new THREE.PointsMaterial({ color: 0xffc7de, size: 0.16, transparent: true, opacity: 0.75, map: G._glowTex, depthWrite: false }));
    scene.add(petals);

    // katana held first-person
    var katana = buildKatana(); camera.add(katana); scene.add(camera);

    // shatter particle pool
    var particles = [], pgeo = new THREE.TetrahedronGeometry(0.16, 0);
    for (var q = 0; q < 260; q++) { var pm = new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial({ color: 0xffffff })); pm.visible = false; scene.add(pm); particles.push({ mesh: pm, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, max: 1 }); }

    G.scene = scene; G.camera = camera; G.katana = katana; G.moon = moon; G.moonGlow = moonGlow;
    G.torii = torii; G.lanterns = lanterns; G.rain = rain; G.petals = petals; G._petPhase = pph;
    G.rings = rings; G.particles = particles; G._pgeo = pgeo; G._key = key; G._rim = rim;
    G.shakeMag = 0; G.fovPunch = 0; G.katT = 0; G.slashDir = 1; G.clock = 0;
  }

  /* ------------------------------------------------ shatter fx */
  function explode(pos, hex, count) {
    var P = G.particles; count = count || 22;
    for (var i = 0, s = 0; i < P.length && s < count; i++) {
      var p = P[i]; if (p.life > 0) continue; s++;
      p.mesh.position.copy(pos); p.mesh.visible = true; p.mesh.material.color.setHex(hex);
      var speed = 4 + Math.random() * 9;
      p.vel.set(Math.random() - 0.5, Math.random() * 1.1 + 0.15, Math.random() - 0.5).normalize().multiplyScalar(speed);
      p.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
      p.max = 0.5 + Math.random() * 0.55; p.life = p.max; p.mesh.scale.setScalar(1 + Math.random());
    }
  }

  /* ------------------------------------------------ spawning */
  function curSpeed() { return Math.min(CFG.speedCap, CFG.baseSpeed + (G.level - 1) * CFG.speedPerLevel); }
  function concurrency() { return Math.min(CFG.concMax, Math.floor(CFG.concBase + (G.level - 1) * CFG.concStep)); }
  function spawnGap() { return Math.max(CFG.gapMin, CFG.gapBase - (G.level - 1) * CFG.gapPerLevel); }

  function activeFirstLetters() {
    var s = {};
    for (var i = 0; i < G.shards.length; i++) { var e = G.shards[i]; if (!e.dead && e.typedCount === 0) s[e.word[0]] = 1; }
    return s;
  }
  function makeWord(def) {
    // avoid two live shards sharing a first letter where possible (cleaner lock-on)
    var used = activeFirstLetters();
    for (var tries = 0; tries < 8; tries++) { var w = wordFor(def.tier); if (!used[w[0]] || def.boss || def.tier === "line") return w; }
    return wordFor(def.tier);
  }

  function pickKind() {
    var pool = [], L = G.level;
    function add(id, n) { for (var i = 0; i < n; i++) pool.push(id); }
    add("shard", 6); add("rune", 3);
    if (L >= 2) { add("rune", 2); add("sigil", 2); }
    if (L >= 3) add("sigil", 2);
    if (L >= 4) { add("verse", 1); add("sigil", 1); }
    if (L >= 6) { add("verse", 2); add("rune", 2); }
    return pool[(Math.random() * pool.length) | 0];
  }

  function freeSlotX() {
    // spread shards across x so their labels don't stack
    for (var t = 0; t < 10; t++) {
      var x = rand(-CFG.xSpread, CFG.xSpread), ok = true;
      for (var i = 0; i < G.shards.length; i++) { var e = G.shards[i]; if (e.dead) continue; if (Math.abs(e.group.position.x - x) < 2.0 && e.group.position.z < CFG.spawnZ + 14) { ok = false; break; } }
      if (ok) return x;
    }
    return rand(-CFG.xSpread, CFG.xSpread);
  }

  function spawnShard(kindId) {
    var def = KINDS[kindId], group = buildZombie(def);
    var x = def.boss ? 0 : freeSlotX();
    group.position.set(x, 0, CFG.spawnZ - rand(0, 5));
    group.scale.setScalar(def.scale);
    G.scene.add(group);
    var e = {
      kind: kindId, def: def, group: group, word: makeWord(def),
      speed: curSpeed() * def.speedMul * rand(0.92, 1.08),
      baseX: x, phase: rand(0, 6.28), walk: rand(0, 6.28),
      color: def.color, boss: def.boss,
      labelY: (def.boss ? 2.5 : 2.25) * def.scale + 0.4,
      lunging: false, lungeT: 0,
      dead: false, typedCount: 0, isActive: false, shakeUntil: 0
    };
    G.shards.push(e);
    if (def.boss) { G.hasBoss = true; G.bossAlive = true; }
    return e;
  }

  /* ------------------------------------------------ shard lifecycle */
  function removeShardMesh(group) {
    G.scene.remove(group);
    group.traverse(function (o) {
      if (o.isMesh || o.isSprite) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map && o.material.map !== G._glowTex) o.material.map.dispose(); o.material.dispose(); }
      }
    });
  }
  function spliceShard(e) { var i = G.shards.indexOf(e); if (i >= 0) G.shards.splice(i, 1); }

  function slashStreak(x, y, color) {
    G.slashDir = -G.slashDir;
    var ang = G.slashDir > 0 ? -0.62 : 0.62;
    G.streaks.push({ x: x, y: y, ang: ang, t: 0, life: 0.26, color: color, len: rand(240, 340) });
    G.katT = 0.18;
  }

  // A clean cut: shatter, score, build ZANSHIN, slow-mo punch.
  function cutShard(e, focus) {
    if (e.dead) return; e.dead = true;
    tmp();
    _v.copy(e.group.position); _v.y += e.labelY * 0.55;
    var scr = G._a.toScreen(_v.clone(), G.camera);
    explode(_v.clone(), colorHex(e.color), e.boss ? 46 : 26);
    explode(_v.clone(), 0x6a0f18, e.boss ? 24 : 14); // dark gib burst
    if (scr.visible) { G._a.burst(scr.x, scr.y, e.color, e.boss ? 30 : 16); G._a.burst(scr.x, scr.y, "#8a1226", e.boss ? 22 : 12); G._a.burst(scr.x, scr.y, "#ffffff", 8); if (!focus) slashStreak(scr.x, scr.y, e.color); }
    G._a.sound.slash(); G._a.sound.shatter();

    // scoring — each clean kill is worth its shard's value
    var gain = e.def.score;
    G.score += gain; G.cleared++;
    G.keysCorrect += e.word.replace(/ /g, "").length;

    if (scr.visible) G.pops.push({ x: scr.x, y: scr.y - 18, text: "+" + gain, color: e.boss ? "#ffd24a" : e.color, t: 0, life: 0.9, big: e.boss });

    // ZANSHIN + juice
    if (!G.focusMode) G.zan = Math.min(CFG.zanMax, G.zan + e.def.zan);
    G.shakeMag = Math.min(1.5, G.shakeMag + (e.boss ? 0.7 : 0.32));
    G.fovPunch = e.boss ? 7 : 4.2;
    G.katana.userData.flare.material.opacity = 1;
    if (!focus) G.hitstopT = e.boss ? 0.16 : 0.11;

    if (e.boss) { G.bossAlive = false; G._a.banner("ONI SLAIN  +" + fmt(gain), 1100); }

    removeShardMesh(e.group); spliceShard(e);
  }

  // At the guard line a zombie commits to a lunge — it can no longer be typed,
  // rears back, then swipes down and drives forward before landing the hit.
  function startLunge(e) {
    if (e.lunging) return;
    e.lunging = true; e.lungeT = 0; e.isActive = false;
    G.shakeMag = Math.min(1.5, G.shakeMag + 0.22);
  }
  function lungeStep(e, dt) {
    e.lungeT += dt;
    var dur = 0.36, t = e.lungeT / dur, m = e.group, u = m.userData;
    if (t < 0.4) { // wind-up: rear back, raise the arms
      var k = t / 0.4;
      if (u.arms) { u.arms[0].rotation.x = -0.15 - k * 1.5; u.arms[1].rotation.x = -0.15 - k * 1.5; }
      m.rotation.x = -k * 0.18;
    } else { // strike: swipe the arms down and lunge toward the player
      var k2 = (t - 0.4) / 0.6;
      if (u.arms) { var ar = -1.65 + k2 * 2.4; u.arms[0].rotation.x = ar; u.arms[1].rotation.x = ar; }
      m.position.z += dt * 7;
      m.rotation.x = -0.18 + k2 * 0.42;
      m.scale.setScalar(e.def.scale * (1 + k2 * 0.14));
    }
    if (e.lungeT >= dur) breachShard(e);
  }

  function breachShard(e) {
    if (e.dead) return; e.dead = true;
    if (e.boss) G.bossAlive = false;
    G.guard -= 1;
    G.zan = Math.max(0, G.zan - 40);
    G.shakeMag = Math.min(1.6, G.shakeMag + 0.7);
    G._flashT = 0.45; G._a.sound.hurt();
    removeShardMesh(e.group); spliceShard(e);
    updateHUD();
    if (G.guard <= 0) { endRun(); return; }
  }

  /* ------------------------------------------------ PERFECT FOCUS */
  function enterFocus() {
    G.focusMode = true; G.focusT = 0; G.focusStepT = 0.16; G.zan = 0;
    G._a.sound.focus(); G._a.banner("残心 · PERFECT FOCUS", 1300);
    G.fovPunch = 9; G.shakeMag = Math.min(1.5, G.shakeMag + 0.4);
  }
  function focusUpdate(dt) {
    G.focusT += dt; G.focusStepT -= dt;
    // clear one shard at a time in a rhythmic sweep (nearest first)
    if (G.focusStepT <= 0) {
      var live = G.shards.filter(function (s) { return !s.dead; });
      if (live.length) {
        live.sort(function (p, q) { return q.group.position.z - p.group.position.z; });
        var e = live[0];
        var bonus = 20; G.score += bonus;
        cutShard(e, true);
        G.focusStepT = 0.14;
      }
    }
    // exit once everything on screen is cleared (with a short tail)
    var remaining = 0; for (var i = 0; i < G.shards.length; i++) if (!G.shards[i].dead) remaining++;
    if (remaining === 0 && G.focusT > 0.5) { G.focusMode = false; checkWaveEnd(); }
    if (G.focusT > 3.2) { G.focusMode = false; checkWaveEnd(); } // safety cap
  }

  /* ------------------------------------------------ level flow */
  function rankFor(level) {
    if (level >= 25) return "龍 DRAGON";
    if (level >= 18) return "水 WATER";
    if (level >= 12) return "金 STEEL";
    if (level >= 7) return "火 FIRE";
    if (level >= 3) return "木 WOOD";
    return "石 STONE";
  }
  function startLevel(n) {
    G.level = n;
    for (var i = 0; i < G.shards.length; i++) removeShardMesh(G.shards[i].group);
    G.shards.length = 0;
    G.hasBoss = (n % CFG.bossEvery === 0); G.bossAlive = false;
    G.toSpawn = Math.min(CFG.countMax, CFG.countBase + (n - 1) * CFG.countPerLevel);
    if (G.hasBoss) G.toSpawn = Math.max(3, Math.round(G.toSpawn * 0.55));
    G.spawnTimer = 0.7;
    if (G.hasBoss) spawnShard("oni");
    updateHUD();
  }
  function completeLevel() {
    var flawless = G.guard >= CFG.maxGuard;
    var bonus = 40 + (flawless ? 25 : 0);
    G.score += bonus;
    G._a.sound.levelup();
    G._a.banner((flawless ? "FLAWLESS +25 · " : "") + rankFor(G.level + 1) + " · WAVE " + (G.level + 1), 1200);
    startLevel(G.level + 1);
  }
  function checkWaveEnd() { if (!G.focusMode && G.toSpawn <= 0 && G.shards.length === 0 && !G.bossAlive) completeLevel(); }

  function endRun() {
    var elapsed = Math.max(0.001, G.elapsed);
    var wpm = Math.round((G.keysCorrect / 5) / (elapsed / 60));
    var acc = G.keysTyped > 0 ? Math.round((G.keysCorrect / G.keysTyped) * 100) : 100;
    G._a.end({
      score: G.score, unit: "pts", badge: "THE NIGHT FALLS SILENT",
      title: "You reached " + rankFor(G.level) + " · wave " + G.level,
      stats: [
        { k: "Score", v: fmt(G.score) },
        { k: "WPM", v: wpm },
        { k: "Accuracy", v: acc + "%" },
        { k: "Zombies Cut", v: fmt(G.cleared) }
      ]
    });
  }

  function updateHUD() {
    var wpm = G.elapsed > 0.5 ? Math.round((G.keysCorrect / 5) / (G.elapsed / 60)) : 0;
    G._a.setStats({ Wave: G.level, Score: fmt(G.score), Attacks: (CFG.maxGuard - G.guard) + "/" + CFG.maxGuard, WPM: wpm });
  }

  /* ------------------------------------------------ per-frame scene juice */
  function stepShard(e, dt) {
    var m = e.group, now = G.clock, u = m.userData;
    m.position.z += e.speed * dt;
    e.walk += dt * (2.4 + e.speed * 0.9);
    m.position.x = e.baseX + Math.sin(now * 1.1 + e.phase) * 0.12;
    m.rotation.y = Math.sin(now * 0.7 + e.phase) * 0.08;
    var sw = Math.sin(e.walk);
    if (u.legs) { u.legs[0].rotation.x = sw * 0.5; u.legs[1].rotation.x = -sw * 0.5; }
    if (u.arms) { var ar = -0.15 + Math.sin(e.walk) * 0.12; u.arms[0].rotation.x = ar; u.arms[1].rotation.x = ar - 0.05; }
    if (u.head) u.head.rotation.z = Math.sin(now * 2 + e.phase) * 0.06;
    m.position.y = Math.abs(sw) * 0.05; // shamble bob
    if (e.isActive) {
      var pulse = 1 + Math.sin(now * 16) * 0.05;
      u.glow.material.opacity = 1.0; u.eyes.emissiveIntensity = 2.8;
      m.scale.setScalar(e.def.scale * pulse);
    } else {
      u.glow.material.opacity = 0.55; u.eyes.emissiveIntensity = 1.6;
      m.scale.setScalar(e.def.scale);
    }
  }

  function updateJuice(dt) {
    tmp();
    var cam = G.camera, now = G.clock;
    // camera shake + gentle idle sway
    G.shakeMag *= Math.pow(0.0016, dt); if (G.shakeMag < 0.001) G.shakeMag = 0;
    var ox = (Math.random() - 0.5) * G.shakeMag * 0.9, oy = (Math.random() - 0.5) * G.shakeMag * 0.9;
    cam.position.set(CFG.camPos[0] + ox + Math.sin(now * 0.5) * 0.12, CFG.camPos[1] + oy + Math.sin(now * 0.7) * 0.08, CFG.camPos[2]);
    cam.lookAt(CFG.look[0] + ox * 0.4, CFG.look[1] + oy * 0.4, CFG.look[2]);
    // fov punch recover
    G.fovPunch += (0 - G.fovPunch) * Math.min(1, dt * 9);
    cam.fov = CFG.fov - G.fovPunch; cam.updateProjectionMatrix();

    // katana — rest sway + slash flick
    var kat = G.katana, rest = 0.5;
    if (G.katT > 0) {
      G.katT -= dt; var k = Math.max(0, G.katT / 0.18);
      kat.rotation.z = rest + G.slashDir * 1.05 * k;
      kat.rotation.x = -0.4 * k;
      kat.position.set(1.05 - G.slashDir * 0.42 * k, -1.25 + 0.3 * k, -1.8 + 0.26 * k);
      kat.userData.light.intensity = 0.7 + 6 * k;
    } else {
      kat.rotation.z = rest + Math.sin(now * 1.4) * 0.03; kat.rotation.x = 0;
      kat.position.set(1.05, -1.25 + Math.sin(now * 1.1) * 0.02, -1.8);
      kat.userData.light.intensity = 0.7;
    }
    kat.userData.flare.material.opacity += (0 - kat.userData.flare.material.opacity) * Math.min(1, dt * 6);

    // shatter particles
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i]; if (p.life <= 0) continue;
      p.life -= dt; if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 22 * dt; p.vel.multiplyScalar(Math.pow(0.16, dt));
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.scale.setScalar(Math.max(0.05, p.life / p.max) * 1.4);
    }

    // moon glow breathe + rim pulse
    G.moonGlow.material.opacity = 0.78 + Math.sin(now * 0.6) * 0.08;
    G._rim.intensity = 1.1 + Math.sin(now * 2.2) * 0.3;

    // lanterns bob
    for (var l = 0; l < G.lanterns.length; l++) { var ln = G.lanterns[l]; ln.mesh.position.y = ln.base + Math.sin(now * 0.9 + ln.phase) * 0.5; }

    // rain fall + recycle
    var ra = G.rain.geometry.attributes.position.array, rspeed = 26 * dt;
    for (var r = 0; r < ra.length; r += 6) {
      ra[r + 1] -= rspeed; ra[r + 4] -= rspeed;
      if (ra[r + 1] < -3) { var top = rand(20, 28), len = ra[r + 1] - ra[r + 4]; ra[r + 1] = top; ra[r + 4] = top - Math.abs(len); }
    }
    G.rain.geometry.attributes.position.needsUpdate = true;

    // petals drift down + sway, recycle
    var pa = G.petals.geometry.attributes.position.array, ph = G._petPhase;
    for (var q = 0, idx = 0; q < pa.length; q += 3, idx++) {
      pa[q + 1] -= dt * 1.1; pa[q] += Math.sin(now * 0.8 + ph[idx]) * dt * 0.7;
      if (pa[q + 1] < -0.5) { pa[q + 1] = rand(16, 22); pa[q] = rand(-24, 24); }
    }
    G.petals.geometry.attributes.position.needsUpdate = true;

    // rings shimmer
    for (var g = 0; g < G.rings.length; g++) G.rings[g].material.opacity = 0.2 + Math.sin(now * 1.5 + g) * 0.1;

    // score pops + slash streaks advance
    for (var pi = G.pops.length - 1; pi >= 0; pi--) { var pop = G.pops[pi]; pop.t += dt; pop.y -= dt * 34; if (pop.t >= pop.life) G.pops.splice(pi, 1); }
    for (var si = G.streaks.length - 1; si >= 0; si--) { var st = G.streaks[si]; st.t += dt; if (st.t >= st.life) G.streaks.splice(si, 1); }
  }

  /* ================================================ the game object */
  var game = {
    id: "kiri", name: "斬 KIRI · Neon Blade", icon: "🗡️", color: "#49e6ff", is3D: true,
    tagline: "An undead horde shambles out of the dark. Type the word above each zombie to cut it down before it reaches your guard. Chain kills to unleash Perfect Focus.",
    intro: { duration: 4.4, count: 4 },

    _reset: function (a) {
      G = this; this._a = a; THREE = a.THREE;
      this.shards = []; this.pops = []; this.streaks = [];
      this.level = 1; this.score = 0; this.cleared = 0;
      this.guard = CFG.maxGuard; this.zan = 0; this.focusMode = false; this.focusT = 0;
      this.elapsed = 0; this.clock = 0; this.keysCorrect = 0; this.keysTyped = 0;
      this.hitstopT = 0; this._flashT = 0; this._it = 0;
      this.toSpawn = 0; this.spawnTimer = 999; this.hasBoss = false; this.bossAlive = false;
    },

    introInit: function (a) {
      this._reset(a);
      buildScene(a);
      // a few shards drifting through the cold-open, plus one ready to be cut
      for (var i = 0; i < 3; i++) { var e = spawnShard("shard"); e.group.position.z = CFG.spawnZ + i * 8; e.speed = 3.4; }
    },
    introFrame: function (c, a, t, total) {
      G = this; this._a = a;
      var dt = Math.min(0.05, t - (this._it || 0)); this._it = t;
      this.clock += dt;
      for (var i = 0; i < this.shards.length; i++) stepShard(this.shards[i], dt * 0.7);
      // a scripted cut mid-cinematic for flavour
      if (!this._cineCut && t > 2.1 && this.shards.length) { this._cineCut = true; var s = this.shards[this.shards.length - 1]; s.group.position.z = 2; cutShard(s, false); }
      updateJuice(dt);

      var W = a.W, H = a.H, m = Math.min(1, t / 0.7), e = easeOutBack(clamp(m, 0, 1));
      c.save(); c.textAlign = "center"; c.textBaseline = "middle";
      // kanji mark
      c.globalAlpha = m;
      c.shadowColor = "rgba(73,230,255,0.85)"; c.shadowBlur = 40;
      c.fillStyle = "#eafcff";
      c.font = "800 " + Math.round(clamp(H * 0.16, 60, 150)) + "px 'Sora', system-ui, sans-serif";
      c.save(); c.translate(W / 2, H * 0.34); c.scale(0.7 + 0.3 * e, 0.7 + 0.3 * e); c.fillText("斬", 0, 0); c.restore();
      // title
      c.shadowBlur = 26;
      c.fillStyle = "#fff";
      c.font = "800 " + Math.round(clamp(H * 0.085, 30, 74)) + "px 'Sora', system-ui, sans-serif";
      c.fillText("KIRI", W / 2, H * 0.56);
      c.shadowBlur = 0;
      var m2 = clamp((t - 0.6) / 0.6, 0, 1); c.globalAlpha = m2;
      c.fillStyle = "#8fe6ff";
      c.font = "700 " + Math.round(clamp(H * 0.03, 13, 26)) + "px 'Sora', system-ui, sans-serif";
      c.fillText("N E O N   B L A D E", W / 2, H * 0.56 + clamp(H * 0.07, 30, 60));
      var m3 = clamp((t - 1.3) / 0.6, 0, 1); c.globalAlpha = m3 * 0.9;
      c.fillStyle = "rgba(220,238,255,0.9)";
      c.font = "600 " + Math.round(clamp(H * 0.026, 12, 22)) + "px 'JetBrains Mono', monospace";
      c.fillText("TYPE · SLASH · SURVIVE", W / 2, H * 0.72);
      c.restore();

      // cinematic letterbox
      c.save(); c.fillStyle = "#000"; var bar = H * 0.09 * Math.min(1, t / 0.5);
      c.fillRect(0, 0, W, bar); c.fillRect(0, H - bar, W, bar); c.restore();
    },

    init: function (a) {
      if (this.scene) this.dispose();
      this._reset(a);
      buildScene(a);
      startLevel(1);
      updateHUD();
    },

    onResize: function (a) { /* camera aspect handled by the engine */ },

    update: function (dt, a) {
      G = this; this._a = a;
      this.elapsed += dt; this.clock += dt;
      if (this._flashT > 0) this._flashT -= dt;

      if (this.focusMode) { focusUpdate(dt); updateJuice(dt); updateHUD(); return; }

      if (this.hitstopT > 0) this.hitstopT -= dt;
      var moveDt = this.hitstopT > 0 ? dt * 0.12 : dt;

      // spawn director
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.toSpawn > 0 && this.shards.length < concurrency()) {
        spawnShard(pickKind()); this.toSpawn -= 1;
        this.spawnTimer = spawnGap() * (0.7 + Math.random() * 0.6);
      }

      // move shards; at the guard line they rear up into a lunge-attack, then breach
      for (var i = this.shards.length - 1; i >= 0; i--) {
        var e = this.shards[i]; if (e.dead) continue;
        if (e.lunging) { lungeStep(e, dt); continue; }
        stepShard(e, moveDt);
        if (e.group.position.z >= CFG.guardZ) startLunge(e);
      }

      // trigger Perfect Focus when the meter is full and there's something to clear
      if (this.zan >= CFG.zanMax && this.shards.length > 0) enterFocus();

      updateJuice(dt);
      updateHUD();
      checkWaveEnd();
    },

    targets: function () {
      var out = [];
      for (var i = 0; i < this.shards.length; i++) { var e = this.shards[i]; if (!e.dead && !e.lunging && e.word) out.push(e); }
      out.sort(function (p, q) { return q.group.position.z - p.group.position.z; }); // nearest first
      return out;
    },

    hit: function (e, a) {
      if (!e || e.dead) return;
      this.keysTyped += e.word.replace(/ /g, "").length;
      cutShard(e, false);
      updateHUD();
      checkWaveEnd();
    },

    miss: function (a, ch) { this.keysTyped++; a.sound.tick(); },

    render: function (c, a) {
      var cam = this.camera, W = a.W, H = a.H, active = null, now = a.now();

      // word tags on each shard
      for (var i = 0; i < this.shards.length; i++) {
        var e = this.shards[i]; if (e.dead || e.lunging || !e.word) continue;
        tmp(); _v.copy(e.group.position); _v.y += e.labelY;
        var p = a.toScreen(_v.clone(), cam);
        if (!p.visible) continue;
        var near = e.group.position.z > 1.5;
        a.wordTag(c, p.x, p.y, e, {
          accent: e.color,
          size: e.boss ? 15 : (e.def.tier === "line" ? 14 : 17),
          bg: near ? "rgba(30,4,10,0.9)" : "rgba(6,10,26,0.82)"
        });
        if (e.isActive) active = { x: p.x, y: p.y };
      }

      // lock-on reticle — a rotating diamond around the active shard
      if (active) {
        c.save(); c.translate(active.x, active.y); c.rotate(now * 0.004);
        c.strokeStyle = "#8fe6ff"; c.lineWidth = 2; c.globalAlpha = 0.9; c.shadowColor = "#49e6ff"; c.shadowBlur = 12;
        var rr = 34;
        c.beginPath(); c.moveTo(0, -rr); c.lineTo(rr, 0); c.lineTo(0, rr); c.lineTo(-rr, 0); c.closePath(); c.stroke();
        c.restore();
      }

      // katana slash streaks (anime cut lines)
      c.save(); c.globalCompositeOperation = "lighter";
      for (var s = 0; s < this.streaks.length; s++) {
        var st = this.streaks[s], k = 1 - st.t / st.life, len = st.len * (0.7 + 0.3 * (1 - k));
        c.save(); c.translate(st.x, st.y); c.rotate(st.ang);
        c.strokeStyle = st.color; c.globalAlpha = 0.5 * k; c.lineWidth = 12 * k + 2;
        c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.stroke();
        c.strokeStyle = "#ffffff"; c.globalAlpha = k; c.lineWidth = 3 * k + 1;
        c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.stroke();
        c.restore();
      }
      c.restore();

      // floating score pops
      c.save(); c.textAlign = "center"; c.textBaseline = "middle";
      for (var pi = 0; pi < this.pops.length; pi++) {
        var pop = this.pops[pi], a2 = clamp(1 - pop.t / pop.life, 0, 1);
        c.globalAlpha = a2; c.fillStyle = pop.color; c.shadowColor = pop.color; c.shadowBlur = 12;
        c.font = "800 " + (pop.big ? 30 : 20) + "px 'Sora', system-ui, sans-serif";
        c.fillText(pop.text, pop.x, pop.y);
      }
      c.restore();

      this._drawHUD(c, a);

      // Perfect-Focus ink wash
      if (this.focusMode) {
        var pf = clamp(this.focusT / 0.3, 0, 1);
        c.save();
        c.globalAlpha = 0.28 * pf; c.fillStyle = "#eaf6ff"; c.fillRect(0, 0, W, H);
        c.globalAlpha = 0.9; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillStyle = "#0a0a16"; c.font = "900 " + Math.round(clamp(H * 0.14, 50, 130)) + "px 'Sora', system-ui, sans-serif";
        c.globalAlpha = 0.16; c.fillText("残心", W / 2, H * 0.5);
        c.globalAlpha = 0.95; c.fillStyle = "#ff3aa8"; c.shadowColor = "#ff3aa8"; c.shadowBlur = 20;
        c.font = "800 " + Math.round(clamp(H * 0.04, 18, 34)) + "px 'Sora', system-ui, sans-serif";
        c.fillText("PERFECT FOCUS", W / 2, H * 0.5 + clamp(H * 0.1, 40, 90));
        c.restore();
      }

      // red guard-breach flash
      if (this._flashT > 0) { c.save(); c.globalAlpha = Math.min(0.5, this._flashT); c.fillStyle = "#ff1a2a"; c.fillRect(0, 0, W, H); c.restore(); }

      // cinematic vignette
      c.save();
      var vg = c.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.92);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
      c.fillStyle = vg; c.fillRect(0, 0, W, H); c.restore();
    },

    // guard pips (bottom-left) + Zanshin meter (bottom-right)
    _drawHUD: function (c, a) {
      var W = a.W, H = a.H, now = a.now();
      // guard
      c.save(); c.textBaseline = "middle";
      c.font = "700 13px 'JetBrains Mono', monospace"; c.textAlign = "left";
      c.fillStyle = "rgba(220,236,255,0.75)"; c.fillText("GUARD", 26, H - 42);
      for (var i = 0; i < CFG.maxGuard; i++) {
        var gx = 26 + i * 26, gy = H - 22, on = i < this.guard;
        c.save(); c.translate(gx + 8, gy); c.rotate(Math.PI / 4);
        c.fillStyle = on ? "#49e6ff" : "rgba(120,140,180,0.22)";
        if (on) { c.shadowColor = "#49e6ff"; c.shadowBlur = 12; }
        c.fillRect(-7, -7, 14, 14); c.restore();
      }
      c.restore();

      // Zanshin meter
      var mw = clamp(W * 0.24, 160, 300), mh = 12, mx = W - 26 - mw, my = H - 28;
      var full = this.zan >= CFG.zanMax;
      c.save();
      c.textAlign = "right"; c.textBaseline = "alphabetic"; c.font = "700 13px 'JetBrains Mono', monospace";
      c.fillStyle = full ? "#ffd24a" : "rgba(220,236,255,0.75)";
      c.fillText(full ? "残心 · FULL — CHAIN A CUT!" : "残心  ZANSHIN", W - 26, my - 8);
      // track
      a.roundRect(c, mx, my, mw, mh, mh / 2); c.fillStyle = "rgba(10,16,34,0.85)"; c.fill();
      c.lineWidth = 1.2; c.strokeStyle = "rgba(154,170,235,0.35)"; a.roundRect(c, mx, my, mw, mh, mh / 2); c.stroke();
      // fill
      var fw = (mw - 4) * clamp(this.zan / CFG.zanMax, 0, 1);
      if (fw > 2) {
        var grd = c.createLinearGradient(mx, 0, mx + mw, 0);
        if (full) { grd.addColorStop(0, "#ffd24a"); grd.addColorStop(1, "#ff8a3d"); }
        else { grd.addColorStop(0, "#35e0ff"); grd.addColorStop(1, "#7c5cff"); }
        c.save(); c.shadowColor = full ? "#ffd24a" : "#49e6ff"; c.shadowBlur = full ? 18 + Math.sin(now * 0.01) * 6 : 10;
        a.roundRect(c, mx + 2, my + 2, fw, mh - 4, (mh - 4) / 2); c.fillStyle = grd; c.fill(); c.restore();
      }
      c.restore();
    },

    dispose: function () {
      if (!this.scene) return;
      if (this.shards) this.shards.forEach(function (e) { removeShardMesh(e.group); });
      this.shards = [];
      this.scene.traverse(function (o) {
        if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) { if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); }); else o.material.dispose(); }
        }
      });
      if (this._a && this._a.renderer) { this._a.renderer.toneMapping = THREE.NoToneMapping; this._a.renderer.toneMappingExposure = 1; }
      this.scene = null; this.camera = null; this.katana = null; this.moon = null; this.moonGlow = null;
      this.torii = null; this.lanterns = null; this.rain = null; this.petals = null; this.rings = null; this.particles = null;
    }
  };

  A.register(game);
})();
