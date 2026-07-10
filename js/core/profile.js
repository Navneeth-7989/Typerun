/* =========================================================
   SPRINT · Profile (compat / classic script)
   The signed-in chip is now an account dropdown (Profile /
   Sign out). The profile panel shows personal records with
   count-up animation, a WPM-trend sparkline that draws itself
   in, and a paginated race history (7 first, +10 per "See
   more"). Google accounts only — guests get a friendly nudge
   to create a real account.
   Race data is written by game.js via SprintNet.recordRace.
   ========================================================= */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var net = function () { return window.SprintNet; };
  var user = function () { return window.SPRINT_USER; };

  var FIRST_PAGE = 7, PAGE = 10;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var el = {
    wrap: $("#user-wrap"),
    chip: $("#user-chip"),
    menu: $("#user-menu"),
    btnProfile: $("#btn-profile"),
    btnSignout: $("#btn-signout"),
    panel: $("#profile-panel"),
    close: $("#btn-profile-close"),
    ava: $("#profile-ava"),
    name: $("#profile-name"),
    handle: $("#profile-handle"),
    records: $("#profile-records"),
    since: $("#profile-since"),
    wrPct: $("#profile-wr-pct"),
    wrFill: $("#profile-wr-fill"),
    trend: $("#profile-trend"),
    spark: $("#profile-spark"),
    races: $("#profile-races"),
    count: $("#profile-count"),
    more: $("#btn-profile-more"),
    guestModal: $("#profile-guest-modal"),
    guestGo: $("#btn-guest-google"),
    guestLater: $("#btn-guest-later"),
  };

  var S = {
    races: [],         // loaded history, newest first
    earliestKey: null, // pagination cursor
    total: 0,          // stats.races (for hiding "See more")
    loading: false,
    sparkDrawn: false, // draw the trend once per open, not per page
  };

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
  function ordinal(n) {
    return ["1st", "2nd", "3rd", "4th", "5th"][n - 1] || n + "th";
  }
  function timeAgo(ms) {
    if (!ms) return "";
    var d = Date.now() - ms;
    if (d < 60e3) return "just now";
    if (d < 3600e3) return Math.floor(d / 60e3) + "m ago";
    if (d < 86400e3) return Math.floor(d / 3600e3) + "h ago";
    if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + "d ago";
    var t = new Date(ms);
    return t.getDate() + " " + MONTHS[t.getMonth()];
  }

  /* ---------------- account dropdown ---------------- */
  function toggleMenu(force) {
    if (!el.menu) return;
    var open = force != null ? force : el.menu.hidden;
    el.menu.hidden = !open;
    el.wrap.classList.toggle("is-open", open);
    el.chip.setAttribute("aria-expanded", open ? "true" : "false");
  }

  el.chip && el.chip.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleMenu();
  });
  document.addEventListener("click", function (e) {
    if (el.menu && !el.menu.hidden && !el.wrap.contains(e.target)) toggleMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (el.menu && !el.menu.hidden) toggleMenu(false);
    else if (el.panel && !el.panel.hidden) closeProfile();
    else if (el.guestModal && !el.guestModal.hidden) el.guestModal.hidden = true;
  });
  // auth.js owns the sign-out confirmation — we only fold the menu away.
  el.btnSignout && el.btnSignout.addEventListener("click", function () { toggleMenu(false); });

  el.btnProfile && el.btnProfile.addEventListener("click", function () {
    toggleMenu(false);
    var u = user();
    if (!u) return;
    if (u.isGuest) { el.guestModal.hidden = false; return; }
    openProfile();
  });

  /* ---------------- guest nudge ---------------- */
  el.guestLater && el.guestLater.addEventListener("click", function () { el.guestModal.hidden = true; });
  el.guestModal && el.guestModal.addEventListener("click", function (e) {
    if (e.target === el.guestModal) el.guestModal.hidden = true;
  });
  // Drop the anonymous session and land back on the sign-in gate.
  el.guestGo && el.guestGo.addEventListener("click", function () {
    var a = window.SprintAuth;
    (a ? a.signOut() : Promise.resolve()).then(
      function () { location.reload(); },
      function () { location.reload(); }
    );
  });

  /* ---------------- profile panel ---------------- */
  function openProfile() {
    var u = user();
    el.panel.hidden = false;
    S.races = [];
    S.earliestKey = null;
    S.total = 0;
    S.sparkDrawn = false;

    // hero
    el.name.textContent = u.name;
    el.handle.textContent = "";
    var hue = hashHue(u.name);
    if (u.photoURL) {
      el.ava.innerHTML = '<img src="' + esc(u.photoURL) + '" alt="" referrerpolicy="no-referrer" />';
      el.ava.style.background = "none";
    } else {
      el.ava.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6z"/></svg>';
      el.ava.style.background =
        "linear-gradient(135deg, hsl(" + hue + " 78% 60%), hsl(" + ((hue + 40) % 360) + " 78% 48%))";
    }

    // "Racing since" — the account's creation date from Firebase auth.
    var au = window.SprintAuth && window.SprintAuth.currentUser;
    var created = au && au.metadata && au.metadata.creationTime;
    if (created) {
      var cd = new Date(created);
      el.since.querySelector("span").textContent =
        "Racing since " + MONTHS[cd.getMonth()] + " " + cd.getFullYear();
      el.since.hidden = false;
    } else {
      el.since.hidden = true;
    }
    el.wrPct.textContent = "0%";
    el.wrFill.style.width = "0%";

    // loading state
    el.records.innerHTML = "";
    el.trend.hidden = true;
    el.count.textContent = "";
    el.more.hidden = true;
    el.races.innerHTML =
      '<div class="profile-skel"></div><div class="profile-skel"></div><div class="profile-skel"></div>';

    Promise.all([
      net().getStats(),
      net().getRaceHistory(FIRST_PAGE),
      net().getMyProfile().catch(function () { return null; }),
    ]).then(function (res) {
      if (el.panel.hidden) return; // closed while loading
      var stats = res[0] || {};
      var races = res[1] || [];
      var prof = res[2];
      if (prof && prof.username) el.handle.textContent = "@" + prof.username;
      S.total = stats.races || 0;
      renderRecords(stats);
      el.races.innerHTML = "";
      applyRaces(races, true);
    }).catch(function () {
      if (el.panel.hidden) return;
      el.races.innerHTML = '<p class="fr-none">Couldn’t load your stats — check your connection and try again.</p>';
    });
  }

  function closeProfile() { el.panel.hidden = true; }

  el.close && el.close.addEventListener("click", closeProfile);
  el.panel && el.panel.addEventListener("click", function (e) {
    if (e.target === el.panel) closeProfile(); // click backdrop to dismiss
  });

  /* ---------------- personal records (count-up) ---------------- */
  function countUp(node, target, suffix, dur) {
    if (!node) return;
    var t0 = performance.now();
    (function frame(now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      node.textContent = Math.round(target * e) + (suffix || "");
      if (p < 1 && !el.panel.hidden) requestAnimationFrame(frame);
    })(t0);
  }

  function renderRecords(stats) {
    var races = stats.races || 0;
    var wins = stats.wins || 0;
    var avgWpm = races ? Math.round((stats.sumWpm || 0) / races) : 0;
    var avgAcc = races ? Math.round((stats.sumAcc || 0) / races) : 0;
    var cards = [
      { icon: "⚡", val: stats.bestWpm || 0, suffix: "", label: "Highest WPM", cls: "profile-rec--gold" },
      { icon: "🚀", val: avgWpm, suffix: "", label: "Avg speed", cls: "profile-rec--avg" },
      { icon: "🎯", val: stats.bestAcc || 0, suffix: "%", label: "Best accuracy", cls: "" },
      { icon: "📊", val: avgAcc, suffix: "%", label: "Avg accuracy", cls: "profile-rec--avg" },
      { icon: "🏁", val: races, suffix: "", label: "Races", cls: "" },
      { icon: "🏆", val: wins, suffix: "", label: "Wins", cls: "profile-rec--win" },
    ];

    // win-rate bar: count the % up while the gold fill sweeps across
    var pct = races ? Math.round((wins / races) * 100) : 0;
    countUp(el.wrPct, pct, "%", 1100);
    requestAnimationFrame(function () { el.wrFill.style.width = pct + "%"; });
    el.records.innerHTML = cards.map(function (c, i) {
      return '<div class="profile-rec ' + c.cls + '" style="animation-delay:' + (i * 0.07).toFixed(2) + 's">' +
        '<span class="profile-rec__icon">' + c.icon + '</span>' +
        '<span class="profile-rec__val" data-rec="' + i + '">0</span>' +
        '<span class="profile-rec__label">' + c.label + '</span></div>';
    }).join("");
    cards.forEach(function (c, i) {
      countUp(el.records.querySelector('[data-rec="' + i + '"]'), c.val, c.suffix, 850 + i * 130);
    });
  }

  /* ---------------- WPM trend sparkline ---------------- */
  function renderSpark(all) {
    var pts = all.slice(0, 20).reverse(); // chronological, most recent 20
    if (pts.length < 2) { el.trend.hidden = true; return; }
    el.trend.hidden = false;

    var W = 520, H = 64, P = 8;
    var vals = pts.map(function (r) { return r.wpm || 0; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var span = Math.max(1, mx - mn);
    var stepX = (W - P * 2) / (vals.length - 1);
    var coords = vals.map(function (v, i) {
      return [P + i * stepX, P + (H - P * 2) * (1 - (v - mn) / span)];
    });
    var line = coords.map(function (c, i) {
      return (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1);
    }).join(" ");
    var area = line +
      " L" + coords[coords.length - 1][0].toFixed(1) + " " + (H - 2) +
      " L" + coords[0][0].toFixed(1) + " " + (H - 2) + " Z";
    var peak = vals.indexOf(mx);
    var dots = coords.map(function (c, i) {
      return '<circle class="spark-dot' + (i === peak ? " is-peak" : "") + '" cx="' + c[0].toFixed(1) +
        '" cy="' + c[1].toFixed(1) + '" r="' + (i === peak ? 4 : 2.5) +
        '" style="animation-delay:' + (0.5 + i * 0.05).toFixed(2) + 's"/>';
    }).join("");

    el.spark.innerHTML =
      '<defs>' +
      '<linearGradient id="sparkStroke" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#7cf3ff"/><stop offset="0.55" stop-color="#a78bfa"/><stop offset="1" stop-color="#ffd23f"/>' +
      '</linearGradient>' +
      '<linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="rgba(124,243,255,0.26)"/><stop offset="1" stop-color="rgba(124,243,255,0)"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<path class="spark-area" d="' + area + '"/>' +
      '<path class="spark-line" d="' + line + '"/>' +
      dots;

    // draw the line in: dash the full length, then ease the offset to zero
    var path = el.spark.querySelector(".spark-line");
    var L = path.getTotalLength();
    path.style.strokeDasharray = L;
    path.style.strokeDashoffset = L;
    path.getBoundingClientRect(); // commit the dashed state before transitioning
    path.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)";
    path.style.strokeDashoffset = "0";
  }

  /* ---------------- race history ---------------- */
  function raceRow(r, delay) {
    var placeCls = r.place >= 1 && r.place <= 3 ? " p" + r.place : "";
    var live = r.mode === "multi";
    return '<div class="profile-race" style="animation-delay:' + delay.toFixed(2) + 's">' +
      '<span class="profile-race__place' + placeCls + '">' + (r.place ? ordinal(r.place) : "—") + '</span>' +
      '<span class="profile-race__wpm">' + (r.wpm || 0) + '<small>wpm</small></span>' +
      '<span class="profile-race__meta">' + (r.acc || 0) + '% acc · ' + (r.time || 0) + 's</span>' +
      '<span class="profile-race__mode ' + (live ? "live" : "solo") + '">' + (live ? "LIVE" : "SOLO") + '</span>' +
      '<span class="profile-race__when">' + timeAgo(r.at) + '</span>' +
      '</div>';
  }

  function applyRaces(list, isFirst) {
    if (isFirst && !list.length) {
      el.races.innerHTML =
        '<div class="profile-empty">' +
        '<div class="profile-empty__icon">🏁</div>' +
        '<p>No races yet — hit <strong>Race Now</strong> and your history starts here.</p>' +
        '</div>';
      el.more.hidden = true;
      return;
    }
    S.races = S.races.concat(list);
    S.earliestKey = S.races.length ? S.races[S.races.length - 1].key : null;

    el.races.insertAdjacentHTML("beforeend", list.map(function (r, i) {
      return raceRow(r, Math.min(i * 0.06, 0.5));
    }).join(""));

    el.count.textContent = S.total ? "(" + S.total + ")" : "";
    if (!S.sparkDrawn) { S.sparkDrawn = true; renderSpark(S.races); }

    var pageFull = list.length >= (isFirst ? FIRST_PAGE : PAGE);
    el.more.hidden = !(pageFull && (!S.total || S.races.length < S.total));
  }

  el.more && el.more.addEventListener("click", function () {
    if (S.loading || !S.earliestKey) return;
    S.loading = true;
    el.more.disabled = true;
    el.more.textContent = "Loading…";
    net().getRaceHistory(PAGE, S.earliestKey).then(function (list) {
      S.loading = false;
      el.more.disabled = false;
      el.more.textContent = "See more";
      applyRaces(list, false);
    }).catch(function () {
      S.loading = false;
      el.more.disabled = false;
      el.more.textContent = "See more";
    });
  });
})();
