/* =========================================================
   SPRINT · Multiplayer network layer (compat / classic script)
   Exposes window.SprintNet for the game script.

   Start model (host-INDEPENDENT):
     - A room shares one absolute go-live time (meta.startAt).
     - EVERY client starts the race on its own when that time
       arrives — no single "host" has to trigger it, so a room
       can never hang because someone left.
     - Empty lanes are filled with DETERMINISTIC bots seeded from
       the roomId, so all clients agree without writing bots.
   ========================================================= */
(function () {
  "use strict";

  var db = window.SprintDB; // set by firebase-init.js
  var TS = (typeof firebase !== "undefined") ? firebase.database.ServerValue.TIMESTAMP : 0;

  var MAX_PLAYERS    = 5;
  var TARGET_TOTAL   = 5;
  var JOIN_WINDOW_MS = 12000; // public: gather + countdown window
  var COUNTDOWN_MS   = 4000;  // 3-2-1-GO shown at the end of the window

  var cfg = {
    makePassage: function () { return "the quick brown fox jumps over the lazy dog"; },
    makeBots: function () { return []; },
  };

  var offset = 0;
  if (db) db.ref(".info/serverTimeOffset").on("value", function (s) { offset = s.val() || 0; });
  function serverNow() { return Date.now() + offset; }

  var cur = null;
  function me() { return window.SPRINT_USER; }

  function playerRecord(u) {
    return {
      name: u.name, photoURL: u.photoURL || null, isGuest: !!u.isGuest,
      progress: 0, wpm: 0, acc: 100, finished: false, finishTime: null, joinedAt: TS,
    };
  }

  function randomCode() {
    var A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", s = "";
    for (var i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }

  /* ===================== MATCHMAKING ===================== */
  function quickMatch(cb) {
    var u = me();
    var newId = db.ref("rooms").push().key;
    var decision = null;

    return db.ref("matchmaking").transaction(function (m) {
      // Fresh clock on every attempt: under contention (many players clicking
      // Race Now at once) transactions retry, and a stale timestamp could let
      // a late retry join a room whose countdown has already begun.
      var now = serverNow();
      var open = m && m.roomId && m.status === "waiting" &&
                 (m.count || 0) < MAX_PLAYERS && (m.startAt || 0) > now + COUNTDOWN_MS;
      if (open) {
        decision = { action: "join", roomId: m.roomId };
        m.count = (m.count || 0) + 1;
        return m;
      }
      decision = { action: "create", roomId: newId, startAt: now + JOIN_WINDOW_MS };
      return { roomId: newId, count: 1, status: "waiting", startAt: now + JOIN_WINDOW_MS };
    }).then(function () {
      if (decision.action === "create") {
        return db.ref("rooms/" + newId + "/meta").set({
          status: "waiting", host: u.uid, private: false,
          createdAt: TS, startAt: decision.startAt, maxPlayers: MAX_PLAYERS,
        }).then(function () { return decision; });
      }
      return decision;
    }).then(function (d) {
      return enterRoom(d.roomId, { isPrivate: false, isHost: d.action === "create" }, cb);
    });
  }

  /* ===================== PRIVATE ROOMS ===================== */
  // opts.challenge === true → a direct 1v1 friend challenge: no shareable
  // code, and the host auto-starts the moment the friend joins (see
  // onRoomSnap). A normal private room keeps its code + manual Start.
  function createPrivate(cb, opts) {
    opts = opts || {};
    var u = me();
    var roomId = db.ref("rooms").push().key;
    var isChallenge = !!opts.challenge;
    var code = isChallenge ? null : randomCode();
    return db.ref("rooms/" + roomId + "/meta").set({
      status: "waiting", host: u.uid, private: true, challenge: isChallenge,
      createdAt: TS, startAt: null, maxPlayers: MAX_PLAYERS, code: code,
    }).then(function () {
      if (code) return db.ref("codes/" + code).set(roomId);
    }).then(function () {
      return enterRoom(roomId, { isPrivate: true, isHost: true, code: code, challenge: isChallenge }, cb);
    }).then(function () {
      return { roomId: roomId, code: code };
    });
  }

  function joinByCode(code, cb) {
    code = (code || "").trim().toUpperCase();
    return db.ref("codes/" + code).once("value").then(function (snap) {
      if (!snap.exists()) throw new Error("No room with that code.");
      return joinRoom(snap.val(), cb);
    });
  }

  function joinRoom(roomId, cb) {
    return db.ref("rooms/" + roomId + "/meta").once("value").then(function (metaSnap) {
      if (!metaSnap.exists()) throw new Error("That room no longer exists.");
      var meta = metaSnap.val();
      if (meta.status !== "waiting") throw new Error("That race has already started.");
      return db.ref("rooms/" + roomId + "/players").once("value").then(function (pSnap) {
        var count = pSnap.exists() ? Object.keys(pSnap.val()).length : 0;
        if (count >= (meta.maxPlayers || MAX_PLAYERS)) throw new Error("That room is full.");
        return enterRoom(roomId, { isPrivate: !!meta.private, isHost: false, code: meta.code }, cb);
      });
    });
  }

  /* ===================== ENTER / LISTEN ===================== */
  function enterRoom(roomId, opts, cb) {
    var u = me();
    return leave().then(function () {
      var playerRef = db.ref("rooms/" + roomId + "/players/" + u.uid);
      return playerRef.set(playerRecord(u)).then(function () {
        playerRef.onDisconnect().remove();

        cur = {
          roomId: roomId, isPrivate: !!opts.isPrivate, isHost: !!opts.isHost,
          challenge: !!opts.challenge, autoStarted: false,
          me: u.uid, playerRef: playerRef, code: opts.code || null,
          started: false, raceState: null, lastSend: 0, cb: cb,
          enteredAt: Date.now(), tickTimer: null,
          roomRef: db.ref("rooms/" + roomId), roomCb: null, lastRoom: null,
        };
        cur.roomCb = function (snap) { onRoomSnap(snap); };
        cur.roomRef.on("value", cur.roomCb);
        cur.tickTimer = setInterval(onTick, 400);
      });
    });
  }

  function buildState(val) {
    var meta = val.meta;
    var playersObj = val.players || {};
    // A "declined" record is a transient signal a challenged friend leaves
    // behind — never a real racer, so split it out of the roster.
    var declinedBy = [];
    var players = Object.keys(playersObj).map(function (uid) {
      var p = playersObj[uid];
      return {
        uid: uid, name: p.name || "Racer", photoURL: p.photoURL || null,
        isGuest: !!p.isGuest, progress: p.progress || 0, wpm: p.wpm || 0,
        acc: p.acc == null ? 100 : p.acc, finished: !!p.finished,
        finishTime: p.finishTime == null ? null : p.finishTime,
        joinedAt: p.joinedAt || 0, isHost: uid === meta.host, declined: !!p.declined,
      };
    }).filter(function (p) {
      if (p.declined) { declinedBy.push(p.uid); return false; }
      return true;
    }).sort(function (a, b) { return a.joinedAt - b.joinedAt; });

    return {
      roomId: cur.roomId, isPrivate: cur.isPrivate, isHost: cur.isHost,
      challenge: !!(meta.challenge || cur.challenge), declinedBy: declinedBy,
      code: cur.code || meta.code || null, status: meta.status,
      passage: meta.passage || null, startAt: meta.startAt || null,
      raceStartAt: meta.raceStartAt || null, maxPlayers: meta.maxPlayers || MAX_PLAYERS,
      bots: meta.bots || [], me: cur.me, players: players,
      serverNow: serverNow(), joinWindowMs: JOIN_WINDOW_MS, countdownMs: COUNTDOWN_MS,
    };
  }

  function onRoomSnap(snap) {
    if (!cur) return;
    var val = snap.val();
    if (!val || !val.meta) { emit(null); return; }
    var state = buildState(val);
    cur.lastRoom = state;

    if (cur.started && cur.raceState) {
      // race is running locally — keep feeding fresh opponent data
      var live = Object.assign({}, cur.raceState, { players: state.players, serverNow: serverNow() });
      emit(live);
      return;
    }
    if (!val.players || !val.players[cur.me]) return; // we were removed
    emit(state);
    maybeAutoStartChallenge(state);
    maybeStartLocal(state);
  }

  // Direct 1v1 challenge: the host doesn't press Start — as soon as the
  // friend joins (roster hits 2 real players) we set the shared go-live time
  // and every client falls into the countdown on its own.
  function maybeAutoStartChallenge(state) {
    if (!cur || !cur.isHost || cur.autoStarted || cur.started) return;
    if (!state.challenge || state.startAt) return;
    if (state.players.length < 2) return;
    cur.autoStarted = true;
    db.ref("rooms/" + cur.roomId + "/meta").update({ startAt: serverNow() + COUNTDOWN_MS });
  }

  // 400ms heartbeat: refresh the lobby countdown + guarantee the start
  function onTick() {
    if (!cur || cur.started) return;
    var state = cur.lastRoom;
    if (!state || state.status === "done") return;
    state = Object.assign({}, state, { serverNow: serverNow() });
    emit(state);
    maybeStartLocal(state);
  }

  function emit(state) { if (cur && cur.cb && cur.cb.onRoom) cur.cb.onRoom(state); }

  // Any client starts the race on its own once the shared go-live time hits.
  function maybeStartLocal(state) {
    if (!cur || cur.started) return;
    var goLive = state.startAt; // absolute ms; null for a private room not yet started
    if (!goLive) return;
    var byClock  = serverNow() >= (goLive - COUNTDOWN_MS);
    var byBackup = (Date.now() - cur.enteredAt) >= (JOIN_WINDOW_MS + 3000); // clock-skew safety net
    if (!byClock && !byBackup) return;

    cur.started = true;
    var seed = cur.roomId;
    var passage = cfg.makePassage(seed);
    var realCount = state.players.length;
    var botCount = cur.isPrivate ? (realCount >= 2 ? 0 : (TARGET_TOTAL - realCount))
                                 : Math.max(0, TARGET_TOTAL - realCount);
    var bots = cfg.makeBots(passage, botCount, seed);
    var raceStartAt = Math.max(goLive, serverNow() + 1500); // guarantee a short countdown

    cur.raceState = Object.assign({}, state, {
      status: "racing", passage: passage, bots: bots, raceStartAt: raceStartAt, serverNow: serverNow(),
    });
    emit(cur.raceState);

    // free the public matchmaking slot so later players open a fresh room
    if (!cur.isPrivate && cur.isHost) {
      db.ref("matchmaking").transaction(function (m) {
        return (m && m.roomId === cur.roomId) ? null : m;
      });
    }
  }

  // Private-room host presses "Start": set a shared go-live time; every client reacts.
  function hostStart() {
    if (!cur || !cur.lastRoom) return;
    db.ref("rooms/" + cur.roomId + "/meta").update({ startAt: serverNow() + COUNTDOWN_MS });
  }

  /* ===================== LIVE SYNC ===================== */
  function sendProgress(data) {
    if (!cur) return;
    var now = Date.now();
    if (now - cur.lastSend < 90) return;
    cur.lastSend = now;
    cur.playerRef.update({
      progress: data.progress || 0,
      wpm: Math.round(data.wpm || 0),
      acc: Math.round(data.acc == null ? 100 : data.acc),
    }).catch(function () {});
  }

  function sendFinished(data) {
    if (!cur) return;
    cur.playerRef.update({
      progress: data.progress || 0,
      wpm: Math.round(data.wpm || 0),
      acc: Math.round(data.acc == null ? 100 : data.acc),
      finished: true, finishTime: data.time || 0,
    }).catch(function () {});
  }

  /* ===================== LEAVE / CLEANUP ===================== */
  function leave() {
    if (!cur) return Promise.resolve();
    var c = cur;
    cur = null;
    if (c.tickTimer) clearInterval(c.tickTimer);
    if (c.roomRef && c.roomCb) c.roomRef.off("value", c.roomCb);
    var p = Promise.resolve();
    try {
      p = c.playerRef.onDisconnect().cancel()
        .then(function () { return c.playerRef.remove(); })
        .catch(function () {});
    } catch (e) {}
    return p.then(function () {
      if (!c.isPrivate) {
        return db.ref("matchmaking").transaction(function (m) {
          if (m && m.roomId === c.roomId) {
            var n = (m.count || 1) - 1;
            return n <= 0 ? null : (m.count = n, m);
          }
          return m;
        }).catch(function () {});
      }
    });
  }

  /* =========================================================
     SOCIAL LAYER — profiles, presence, friends, challenges
     Only real (Google) accounts participate; guests are skipped.
     ========================================================= */

  function isReal(u) { return u && !u.isGuest; }

  // Publish/refresh my public profile + start presence heartbeat. Called once
  // auth resolves. Never clobbers an already-claimed username.
  function bootstrapProfile() {
    var u = me();
    if (!db || !isReal(u)) return;
    db.ref("users/" + u.uid).update({
      displayName: u.name, photoURL: u.photoURL || null, updatedAt: TS,
    }).catch(function () {});
    setupPresence(u.uid);
  }

  function setupPresence(uid) {
    var ref = db.ref("presence/" + uid);
    var conn = db.ref(".info/connected");
    conn.on("value", function (s) {
      if (s.val() === false) return;
      ref.onDisconnect().set({ state: "offline", lastSeen: TS }).then(function () {
        ref.set({ state: "online", lastSeen: TS });
      });
    });
  }

  // Username: lowercase handle, 3-16 chars, letters/digits/underscore.
  var HANDLE_RE = /^[a-z0-9_]{3,16}$/;
  function normalizeHandle(h) { return String(h || "").trim().toLowerCase(); }

  function claimUsername(handle) {
    var u = me();
    handle = normalizeHandle(handle);
    if (!isReal(u)) return Promise.reject(new Error("Sign in with Google to pick a username."));
    if (!HANDLE_RE.test(handle)) {
      return Promise.reject(new Error("3-16 chars: letters, numbers, underscore."));
    }
    // Atomic multi-path write; the /usernames rule rejects a taken handle.
    var update = {};
    update["usernames/" + handle] = u.uid;
    update["users/" + u.uid + "/username"] = handle;
    update["users/" + u.uid + "/displayName"] = u.name;
    update["users/" + u.uid + "/photoURL"] = u.photoURL || null;
    update["users/" + u.uid + "/updatedAt"] = TS;
    return db.ref().update(update).then(function () { return handle; }, function () {
      throw new Error("That username is taken. Try another.");
    });
  }

  function getMyProfile() {
    var u = me();
    if (!isReal(u)) return Promise.resolve(null);
    return db.ref("users/" + u.uid).once("value").then(function (s) { return s.val(); });
  }

  // Is a handle free to claim? True when unclaimed or already owned by me.
  function checkUsername(handle) {
    var u = me();
    handle = normalizeHandle(handle);
    if (!HANDLE_RE.test(handle)) return Promise.resolve(false);
    return db.ref("usernames/" + handle).once("value").then(function (s) {
      return !s.exists() || (u && s.val() === u.uid);
    });
  }

  // Prefix search by username (needs .indexOn username). Excludes self.
  function searchUsers(prefix) {
    var u = me();
    prefix = normalizeHandle(prefix);
    if (!prefix) return Promise.resolve([]);
    return db.ref("users").orderByChild("username")
      .startAt(prefix).endAt(prefix + "").limitToFirst(12)
      .once("value").then(function (snap) {
        var out = [];
        snap.forEach(function (c) {
          var v = c.val();
          if (c.key !== u.uid && v && v.username) {
            out.push({ uid: c.key, username: v.username, displayName: v.displayName || v.username, photoURL: v.photoURL || null });
          }
        });
        return out;
      });
  }

  function sendFriendRequest(toUid) {
    var u = me();
    return getMyProfile().then(function (prof) {
      var update = {};
      update["friendRequests/" + toUid + "/incoming/" + u.uid] = {
        username: (prof && prof.username) || null, displayName: u.name, at: TS,
      };
      update["friendRequests/" + u.uid + "/outgoing/" + toUid] = { at: TS };
      return db.ref().update(update);
    });
  }

  function acceptFriendRequest(fromUid) {
    var u = me();
    var update = {};
    update["friends/" + u.uid + "/" + fromUid] = { since: TS };
    update["friends/" + fromUid + "/" + u.uid] = { since: TS };
    update["friendRequests/" + u.uid + "/incoming/" + fromUid] = null;
    update["friendRequests/" + fromUid + "/outgoing/" + u.uid] = null;
    return db.ref().update(update);
  }

  function declineFriendRequest(fromUid) {
    var u = me();
    var update = {};
    update["friendRequests/" + u.uid + "/incoming/" + fromUid] = null;
    update["friendRequests/" + fromUid + "/outgoing/" + u.uid] = null;
    return db.ref().update(update);
  }

  function removeFriend(friendUid) {
    var u = me();
    var update = {};
    update["friends/" + u.uid + "/" + friendUid] = null;
    update["friends/" + friendUid + "/" + u.uid] = null;
    return db.ref().update(update);
  }

  // Hydrate a list of friend uids into profile objects.
  function loadProfiles(uids) {
    return Promise.all(uids.map(function (uid) {
      return db.ref("users/" + uid).once("value").then(function (s) {
        var v = s.val() || {};
        return { uid: uid, username: v.username || null, displayName: v.displayName || v.username || "Racer", photoURL: v.photoURL || null };
      });
    }));
  }

  function watchFriends(cb) {
    var u = me();
    if (!isReal(u)) { cb([]); return function () {}; }
    var ref = db.ref("friends/" + u.uid);
    var handler = ref.on("value", function (snap) {
      var uids = snap.exists() ? Object.keys(snap.val()) : [];
      loadProfiles(uids).then(cb);
    });
    return function () { ref.off("value", handler); };
  }

  function watchIncomingRequests(cb) {
    var u = me();
    if (!isReal(u)) { cb([]); return function () {}; }
    var ref = db.ref("friendRequests/" + u.uid + "/incoming");
    var handler = ref.on("value", function (snap) {
      var list = [];
      snap.forEach(function (c) {
        var v = c.val() || {};
        list.push({ uid: c.key, username: v.username || null, displayName: v.displayName || v.username || "Racer", at: v.at || 0 });
      });
      cb(list);
    });
    return function () { ref.off("value", handler); };
  }

  function watchPresence(uid, cb) {
    var ref = db.ref("presence/" + uid);
    var handler = ref.on("value", function (s) {
      var v = s.val();
      cb(v && v.state === "online" ? "online" : "offline");
    });
    return function () { ref.off("value", handler); };
  }

  // Guests can't send friend requests, but they CAN sit in a private room and
  // therefore must be able to receive a rematch invite — so this is open to
  // any signed-in user, not just real accounts.
  function watchChallenges(cb) {
    var u = me();
    if (!u || !db) { cb([]); return function () {}; }
    var ref = db.ref("challenges/" + u.uid);
    var handler = ref.on("value", function (snap) {
      var list = [];
      snap.forEach(function (c) {
        var v = c.val() || {};
        list.push({ id: c.key, fromUid: v.fromUid, fromName: v.fromName || "A racer", roomId: v.roomId, code: v.code || null, rematch: !!v.rematch, at: v.at || 0 });
      });
      cb(list);
    });
    return function () { ref.off("value", handler); };
  }

  function sendChallenge(toUid, data) {
    var u = me();
    var ref = db.ref("challenges/" + toUid).push();
    // Auto-cancel the invite if the challenger drops before it's answered.
    ref.onDisconnect().remove();
    return ref.set({
      fromUid: u.uid, fromName: u.name, roomId: data.roomId, code: data.code || null,
      rematch: !!data.rematch, at: TS,
    }).then(function () {
      return {
        id: ref.key, toUid: toUid, roomId: data.roomId,
        // Challenger backs out before the friend answers: pull the invite.
        cancel: function () {
          try { ref.onDisconnect().cancel(); } catch (e) {}
          return ref.remove().catch(function () {});
        },
      };
    });
  }

  function clearChallenge(id) {
    var u = me();
    if (!id) return Promise.resolve();
    return db.ref("challenges/" + u.uid + "/" + id).remove().catch(function () {});
  }

  // A challenged friend says "no". We can't read the challenger's inbox, but
  // both sides can read the room — so drop a short-lived "declined" marker in
  // the room the challenger is sitting in. It's filtered out of the roster
  // (buildState) and surfaces to the host as state.declinedBy.
  function declineChallenge(c) {
    var u = me();
    if (!c || !c.roomId) return Promise.resolve();
    var ref = db.ref("rooms/" + c.roomId + "/players/" + u.uid);
    ref.onDisconnect().remove();
    return ref.set({ declined: true, name: u.name }).then(function () {
      setTimeout(function () {
        try { ref.onDisconnect().cancel(); } catch (e) {}
        ref.remove().catch(function () {});
      }, 4000);
    }).catch(function () {});
  }

  /* ===================== RACE HISTORY / RECORDS ===================== */

  // Persist a finished race + fold it into the personal-record aggregates.
  // Guests keep nothing — records need a real (Google) account.
  function recordRace(data) {
    var u = me();
    if (!db || !isReal(u)) return Promise.resolve();
    var rec = {
      wpm: Math.round(data.wpm || 0),
      acc: Math.round(data.acc == null ? 100 : data.acc),
      time: Math.round((data.time || 0) * 10) / 10,
      place: data.place || 0,
      field: data.field || 1,
      mode: data.mode === "multi" ? "multi" : "solo",
      at: TS,
    };
    return db.ref("raceHistory/" + u.uid).push(rec).then(function () {
      return db.ref("stats/" + u.uid).transaction(function (s) {
        s = s || {};
        s.races = (s.races || 0) + 1;
        s.wins = (s.wins || 0) + (rec.place === 1 ? 1 : 0);
        s.sumWpm = (s.sumWpm || 0) + rec.wpm; // lifetime sums → averages
        s.sumAcc = (s.sumAcc || 0) + rec.acc;
        if (rec.wpm > (s.bestWpm || 0)) s.bestWpm = rec.wpm;
        if (rec.acc > (s.bestAcc || 0)) s.bestAcc = rec.acc;
        return s;
      });
    }).catch(function () {});
  }

  function getStats() {
    var u = me();
    if (!db || !isReal(u)) return Promise.resolve(null);
    return db.ref("stats/" + u.uid).once("value").then(function (s) {
      var v = s.val();
      if (!v || !v.races || v.sumWpm != null) return v;
      // One-time backfill: races recorded before lifetime averages existed
      // have no sums — rebuild them from the full history, then persist.
      return db.ref("raceHistory/" + u.uid).once("value").then(function (h) {
        var sumWpm = 0, sumAcc = 0;
        h.forEach(function (c) {
          var r = c.val() || {};
          sumWpm += r.wpm || 0;
          sumAcc += r.acc || 0;
        });
        return db.ref("stats/" + u.uid).update({ sumWpm: sumWpm, sumAcc: sumAcc }).then(function () {
          v.sumWpm = sumWpm; v.sumAcc = sumAcc;
          return v;
        });
      }).catch(function () { return v; });
    });
  }

  // Newest-first page of race history. Pass the previous page's oldest key as
  // `beforeKey` to fetch the next (older) page — push keys sort chronologically,
  // so orderByKey + limitToLast walks the history backwards.
  function getRaceHistory(limit, beforeKey) {
    var u = me();
    if (!db || !isReal(u)) return Promise.resolve([]);
    var q = db.ref("raceHistory/" + u.uid).orderByKey();
    q = beforeKey ? q.endAt(beforeKey).limitToLast(limit + 1) : q.limitToLast(limit);
    return q.once("value").then(function (snap) {
      var list = [];
      snap.forEach(function (c) { list.push(Object.assign({ key: c.key }, c.val())); });
      if (beforeKey) list = list.filter(function (r) { return r.key !== beforeKey; });
      return list.reverse();
    });
  }

  // Kick off profile + presence as soon as we know who the user is.
  if (window.SPRINT_USER) bootstrapProfile();
  else document.addEventListener("sprint:auth", bootstrapProfile, { once: true });

  /* ===================== PUBLIC API ===================== */
  window.SprintNet = {
    configure: function (o) { for (var k in o) cfg[k] = o[k]; },
    serverNow: serverNow,
    quickMatch: quickMatch,
    createPrivate: createPrivate,
    joinByCode: joinByCode,
    joinRoom: joinRoom,
    hostStart: hostStart,
    sendProgress: sendProgress,
    sendFinished: sendFinished,
    leave: leave,
    // social
    claimUsername: claimUsername,
    checkUsername: checkUsername,
    getMyProfile: getMyProfile,
    searchUsers: searchUsers,
    sendFriendRequest: sendFriendRequest,
    acceptFriendRequest: acceptFriendRequest,
    declineFriendRequest: declineFriendRequest,
    removeFriend: removeFriend,
    watchFriends: watchFriends,
    watchIncomingRequests: watchIncomingRequests,
    watchPresence: watchPresence,
    watchChallenges: watchChallenges,
    sendChallenge: sendChallenge,
    clearChallenge: clearChallenge,
    declineChallenge: declineChallenge,
    // records
    recordRace: recordRace,
    getStats: getStats,
    getRaceHistory: getRaceHistory,
    get roomId() { return cur ? cur.roomId : null; },
  };

  document.dispatchEvent(new Event("sprint:net-ready"));
})();
