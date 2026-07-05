/* =========================================================
   SPRINT · Friends (compat / classic script)
   The social half of the "Friends" panel: unique @usernames,
   search, friend requests (accept/decline), a live friends list
   with online/offline presence, and realtime 1v1 challenges.

   Data lives in window.SprintNet (Firebase). Races are launched
   through window.SprintGame so we reuse the exact room flow the
   menu already uses. Google accounts only — guests stay on the
   left (rooms / code) half.
   ========================================================= */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var net = function () { return window.SprintNet; };
  var game = function () { return window.SprintGame; };
  var user = function () { return window.SPRINT_USER; };

  var el = {
    panel: $("#friends-panel"),
    btnFriends: $("#btn-friends"),
    badge: $("#friends-badge"),
    social: $("#friends-social"),
    toast: $("#menu-toast"),
    modal: $("#challenge-modal"),
    modalFrom: $("#challenge-from"),
    modalAccept: $("#btn-challenge-accept"),
    modalDecline: $("#btn-challenge-decline"),
  };

  var S = {
    profile: null,          // my /users record (or null)
    friends: [],            // [{uid, username, displayName, photoURL}]
    presence: {},           // uid -> "online" | "offline"
    presenceUnsubs: {},     // uid -> unsubscribe fn
    requests: [],           // incoming friend requests
    requested: {},          // uid -> true (outgoing this session)
    friendSet: {},          // uid -> true (quick lookup for search rows)
    challenge: null,        // active incoming challenge {id, fromName, roomId}
    started: false,         // social subscriptions running
    searchTimer: null,
  };

  var PERSON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6z"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function hashHue(str) {
    var h = 0;
    for (var i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function avatar(name) {
    var hue = hashHue(name || "?");
    return '<span class="fr-ava" style="background:linear-gradient(135deg,hsl(' + hue +
      ' 78% 60%),hsl(' + ((hue + 40) % 360) + ' 78% 48%))">' + PERSON_SVG + '</span>';
  }

  var toastTimer = null;
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.hidden = false;
    el.toast.classList.add("is-in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove("is-in");
      setTimeout(function () { el.toast.hidden = true; }, 220);
    }, 2600);
  }

  function isGoogle() { var u = user(); return !!u && !u.isGuest; }
  function hasUsername() { return !!(S.profile && S.profile.username); }

  /* ---------------- render the right-hand social pane ---------------- */
  function renderPane() {
    if (!el.social) return;

    if (!isGoogle()) {
      el.social.innerHTML =
        '<div class="fr-empty">' +
        '<div class="fr-empty__icon">🔒</div>' +
        '<p>Sign in with <strong>Google</strong> to add friends and challenge them to a 1v1.</p>' +
        '<p class="fr-empty__sub">Guests can still create or join a private room on the left.</p>' +
        '</div>';
      return;
    }

    if (!hasUsername()) {
      el.social.innerHTML =
        '<div class="fr-claim">' +
        '<p class="fr-claim__lead">Pick a unique <strong>@username</strong> so friends can find you.</p>' +
        '<div class="fr-claim__row">' +
        '<span class="fr-at">@</span>' +
        '<input id="fr-handle" class="guest-input" placeholder="yourname" maxlength="16" autocomplete="off" spellcheck="false" />' +
        '</div>' +
        '<button id="fr-claim-btn" class="btn btn--primary btn--block">Claim username</button>' +
        '<p class="fr-hint">3–16 characters · letters, numbers, underscore</p>' +
        '<p id="fr-claim-err" class="auth-error" hidden></p>' +
        '</div>';
      var input = $("#fr-handle"), btn = $("#fr-claim-btn"), err = $("#fr-claim-err");
      var submit = function () {
        var v = (input.value || "").trim().toLowerCase();
        err.hidden = true;
        btn.disabled = true; btn.textContent = "Claiming…";
        net().claimUsername(v).then(function (handle) {
          S.profile = S.profile || {};
          S.profile.username = handle;
          toast("Username @" + handle + " is yours!");
          renderPane();
        }).catch(function (e) {
          err.textContent = e.message || "Couldn't claim that."; err.hidden = false;
          btn.disabled = false; btn.textContent = "Claim username";
        });
      };
      btn.addEventListener("click", submit);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
      input.focus();
      return;
    }

    // Full social view.
    el.social.innerHTML =
      '<p class="fr-me">You are <strong>@' + esc(S.profile.username) + '</strong></p>' +
      '<div class="fr-search">' +
      '<input id="fr-search-input" class="guest-input" placeholder="Search by @username" autocomplete="off" spellcheck="false" />' +
      '</div>' +
      '<div id="fr-results" class="fr-list fr-list--results"></div>' +
      '<div id="fr-requests-wrap" hidden>' +
      '<h3 class="fr-subhead">Friend requests</h3>' +
      '<div id="fr-requests" class="fr-list"></div>' +
      '</div>' +
      '<h3 class="fr-subhead">Friends <span id="fr-count" class="fr-count"></span></h3>' +
      '<div id="fr-friends" class="fr-list"></div>';

    var search = $("#fr-search-input");
    search.addEventListener("input", function () {
      clearTimeout(S.searchTimer);
      var q = search.value;
      S.searchTimer = setTimeout(function () { runSearch(q); }, 260);
    });

    renderRequests();
    renderFriends();
  }

  /* ---------------- search ---------------- */
  function runSearch(q) {
    var box = $("#fr-results");
    if (!box) return;
    q = (q || "").trim().toLowerCase();
    if (!q) { box.innerHTML = ""; return; }
    net().searchUsers(q).then(function (list) {
      if ($("#fr-search-input") == null) return; // pane re-rendered meanwhile
      if (!list.length) { box.innerHTML = '<p class="fr-none">No one found for “' + esc(q) + '”.</p>'; return; }
      box.innerHTML = list.map(function (u) {
        var action;
        if (S.friendSet[u.uid]) action = '<span class="fr-tag">Friends</span>';
        else if (S.requested[u.uid]) action = '<span class="fr-tag">Requested</span>';
        else action = '<button class="btn btn--ghost btn--sm fr-add" data-uid="' + u.uid + '">Add</button>';
        return rowMarkup(u, action);
      }).join("");
      box.querySelectorAll(".fr-add").forEach(function (b) {
        b.addEventListener("click", function () {
          var uid = b.dataset.uid;
          b.disabled = true;
          net().sendFriendRequest(uid).then(function () {
            S.requested[uid] = true;
            b.outerHTML = '<span class="fr-tag">Requested</span>';
            toast("Friend request sent.");
          }).catch(function () { b.disabled = false; toast("Couldn't send request."); });
        });
      });
    }).catch(function () { box.innerHTML = '<p class="fr-none">Search failed. Try again.</p>'; });
  }

  function rowMarkup(u, actionHtml, extraClass) {
    return '<div class="fr-row ' + (extraClass || "") + '">' +
      avatar(u.displayName || u.username) +
      '<span class="fr-id">' +
      '<span class="fr-name">' + esc(u.displayName || u.username || "Racer") + '</span>' +
      (u.username ? '<span class="fr-handle">@' + esc(u.username) + '</span>' : '') +
      '</span>' +
      '<span class="fr-actions">' + actionHtml + '</span>' +
      '</div>';
  }

  /* ---------------- incoming friend requests ---------------- */
  function renderRequests() {
    var wrap = $("#fr-requests-wrap"), box = $("#fr-requests");
    if (!box) return;
    wrap.hidden = S.requests.length === 0;
    box.innerHTML = S.requests.map(function (r) {
      var actions =
        '<button class="btn btn--primary btn--sm fr-accept" data-uid="' + r.uid + '">Accept</button>' +
        '<button class="btn btn--ghost btn--sm fr-decline" data-uid="' + r.uid + '">Decline</button>';
      return rowMarkup(r, actions);
    }).join("");
    box.querySelectorAll(".fr-accept").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true;
        net().acceptFriendRequest(b.dataset.uid).then(function () { toast("Friend added!"); })
          .catch(function () { b.disabled = false; toast("Couldn't accept."); });
      });
    });
    box.querySelectorAll(".fr-decline").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true;
        net().declineFriendRequest(b.dataset.uid).catch(function () {});
      });
    });
  }

  /* ---------------- friends list + presence ---------------- */
  function renderFriends() {
    var box = $("#fr-friends"), count = $("#fr-count");
    if (!box) return;
    if (count) count.textContent = S.friends.length ? "(" + S.friends.length + ")" : "";
    if (!S.friends.length) {
      box.innerHTML = '<p class="fr-none">No friends yet — search a @username above to add one.</p>';
      return;
    }
    // online first, then by name
    var sorted = S.friends.slice().sort(function (a, z) {
      var ao = S.presence[a.uid] === "online" ? 0 : 1;
      var zo = S.presence[z.uid] === "online" ? 0 : 1;
      if (ao !== zo) return ao - zo;
      return (a.displayName || "").localeCompare(z.displayName || "");
    });
    box.innerHTML = sorted.map(function (u) {
      var online = S.presence[u.uid] === "online";
      var dot = '<span class="fr-dot ' + (online ? "is-on" : "is-off") + '" title="' + (online ? "Online" : "Offline") + '"></span>';
      var actions =
        '<button class="btn btn--primary btn--sm fr-challenge" data-uid="' + u.uid + '" data-name="' + esc(u.displayName || "") + '"' + (online ? "" : " disabled") + '>Challenge</button>' +
        '<button class="btn btn--ghost btn--sm fr-remove" data-uid="' + u.uid + '" title="Remove friend">✕</button>';
      return '<div class="fr-row">' + dot + avatar(u.displayName || u.username) +
        '<span class="fr-id"><span class="fr-name">' + esc(u.displayName || u.username || "Racer") + '</span>' +
        (u.username ? '<span class="fr-handle">@' + esc(u.username) + '</span>' : '') +
        '</span><span class="fr-actions">' + actions + '</span></div>';
    }).join("");

    box.querySelectorAll(".fr-challenge").forEach(function (b) {
      b.addEventListener("click", function () {
        var name = b.dataset.name || "your friend";
        b.disabled = true;
        game().challengeFriend(b.dataset.uid, name).catch(function () {
          b.disabled = false; toast("Couldn't send challenge.");
        });
      });
    });
    box.querySelectorAll(".fr-remove").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true;
        net().removeFriend(b.dataset.uid).then(function () { toast("Friend removed."); })
          .catch(function () { b.disabled = false; });
      });
    });
  }

  // Keep a presence subscription per friend; add new, drop gone.
  function syncPresenceSubs() {
    var want = {};
    S.friends.forEach(function (f) { want[f.uid] = true; });
    Object.keys(S.presenceUnsubs).forEach(function (uid) {
      if (!want[uid]) { S.presenceUnsubs[uid](); delete S.presenceUnsubs[uid]; delete S.presence[uid]; }
    });
    S.friends.forEach(function (f) {
      if (S.presenceUnsubs[f.uid]) return;
      S.presenceUnsubs[f.uid] = net().watchPresence(f.uid, function (state) {
        S.presence[f.uid] = state;
        renderFriends();
      });
    });
  }

  /* ---------------- badge ---------------- */
  function updateBadge() {
    if (!el.badge) return;
    var n = S.requests.length + (S.challenge ? 1 : 0);
    if (n > 0) { el.badge.textContent = n; el.badge.hidden = false; }
    else el.badge.hidden = true;
  }

  /* ---------------- incoming challenge modal ---------------- */
  function showChallenge(c) {
    S.challenge = c;
    el.modalFrom.textContent = c.fromName;
    el.modal.hidden = false;
    updateBadge();
  }
  function hideChallenge() {
    S.challenge = null;
    el.modal.hidden = true;
    updateBadge();
  }
  function onChallenges(list) {
    // Newest pending challenge wins; if none, dismiss.
    if (!list.length) { if (S.challenge) hideChallenge(); return; }
    var c = list.sort(function (a, z) { return z.at - a.at; })[0];
    if (!S.challenge || S.challenge.id !== c.id) showChallenge(c);
  }

  /* ---------------- start live subscriptions ---------------- */
  function startSubs() {
    if (S.started || !isGoogle() || !net()) return;
    S.started = true;

    net().getMyProfile().then(function (p) { S.profile = p || {}; renderPane(); })
      .catch(function () { S.profile = {}; renderPane(); });

    net().watchFriends(function (list) {
      S.friends = list;
      S.friendSet = {};
      list.forEach(function (f) { S.friendSet[f.uid] = true; delete S.requested[f.uid]; });
      syncPresenceSubs();
      renderFriends();
    });

    net().watchIncomingRequests(function (list) {
      S.requests = list;
      renderRequests();
      updateBadge();
    });

    net().watchChallenges(onChallenges);
  }

  /* ---------------- wiring ---------------- */
  function wireModal() {
    el.modalAccept && el.modalAccept.addEventListener("click", function () {
      if (!S.challenge) return;
      var c = S.challenge;
      hideChallenge();
      net().clearChallenge(c.id).catch(function () {});
      game().acceptChallenge(c.roomId);
    });
    el.modalDecline && el.modalDecline.addEventListener("click", function () {
      if (!S.challenge) return;
      var c = S.challenge;
      hideChallenge();
      net().declineChallenge(c).catch(function () {}); // let the challenger know
      net().clearChallenge(c.id).catch(function () {});
    });
  }

  function boot() {
    wireModal();
    // Re-render the pane whenever the panel is opened (state may have changed).
    el.btnFriends && el.btnFriends.addEventListener("click", function () {
      renderPane();
      setTimeout(function () { var s = $("#fr-search-input"); s && s.focus(); }, 30);
    });
    renderPane();
    if (net()) startSubs();
    else document.addEventListener("sprint:net-ready", startSubs, { once: true });
  }

  // Wait until we know who the user is.
  if (window.SPRINT_USER) boot();
  else document.addEventListener("sprint:auth", boot, { once: true });
})();
