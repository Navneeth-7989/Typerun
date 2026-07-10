/* =========================================================
   SPRINT · Authentication (compat / classic script)
   The game is FREE TO PLAY — there is no sign-up wall. On load we
   silently sign the visitor in as an anonymous "Guest" so the live
   backend (matchmaking, rooms, presence) works for everyone. A
   "Sign in" button (top-right) lets anyone upgrade to a real Google
   account to save a unique @username, their stats and race history.
   Guests can play everything; only their history isn't recorded.
   Publishes the user on window.SPRINT_USER + fires "sprint:auth".
   ========================================================= */
(function () {
  "use strict";

  var auth = window.SprintAuth; // set by firebase-init.js
  var $ = function (s) { return document.querySelector(s); };

  var gate      = $("#auth-gate");
  var errorEl   = $("#auth-error");
  var authClose = $("#btn-auth-close");
  var subtitle  = $("#auth-subtitle");

  var signinTop  = $("#btn-signin-top"); // top-right "Sign in" (guests only)
  var chip       = $("#user-wrap");      // account chip + dropdown (Google users)
  var chipName   = $("#user-name");
  var chipAvatar = $("#user-avatar");

  // Unique-username step (shown in the modal after a Google sign-in)
  var userForm   = $("#username-form");
  var userInput  = $("#username-input");
  var userHint   = $("#username-hint");
  var userError  = $("#username-error");
  var userGo     = $("#btn-username-go");

  // Sign-out confirmation
  var signoutModal   = $("#signout-modal");
  var signoutConfirm = $("#btn-signout-confirm");
  var signoutCancel  = $("#btn-signout-cancel");

  var bso = $("#btn-signout");

  var HANDLE_RE = /^[a-z0-9_]{3,16}$/;
  var fbUser = null;      // the raw Firebase user
  var booted = false;     // sprint:auth dispatched exactly once
  var upgrading = false;  // a guest→Google sign-in is in flight

  var ADJ = ["Swift", "Turbo", "Rapid", "Nimble", "Blitz", "Zippy", "Flash", "Vivid", "Sonic", "Quill"];
  var NOUN = ["Typer", "Racer", "Sprinter", "Falcon", "Comet", "Dash", "Bolt", "Arrow", "Pilot", "Ace"];
  function randomName() {
    return ADJ[Math.floor(Math.random() * ADJ.length)] + NOUN[Math.floor(Math.random() * NOUN.length)];
  }
  function hashHue(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function showError(msg) { if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; } }
  function clearError() { if (errorEl) errorEl.hidden = true; }

  // Lightweight top toast for non-fatal sign-in messages (matches game.js).
  var _toastTimer = null;
  function toast(msg) {
    var t = document.getElementById("menu-toast");
    if (!t) { showError(msg); return; }
    t.textContent = msg;
    t.hidden = false; t.classList.add("is-in");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      t.classList.remove("is-in");
      setTimeout(function () { t.hidden = true; }, 220);
    }, 3200);
  }

  function openGate() { if (gate) gate.classList.remove("is-hidden"); }
  function hideGate() { if (gate) gate.classList.add("is-hidden"); }

  // Build + expose the user (updates the chip). Does NOT change screens or
  // toggle top-bar visibility — showGuestUI()/showAccountUI() own that.
  function setUser(user, name) {
    var finalName = ((name && name.trim()) ||
                    (user.displayName && user.displayName.trim()) ||
                    localStorage.getItem("sprint_name") || randomName()).slice(0, 16);
    var u = {
      uid: user.uid,
      name: finalName,
      isGuest: !!user.isAnonymous,
      photoURL: user.photoURL || null,
    };
    window.SPRINT_USER = u;
    localStorage.setItem("sprint_name", u.name);

    chipName.textContent = u.name;
    // Custom avatar tinted from the name.
    var hue = hashHue(u.name);
    chipAvatar.style.background =
      "linear-gradient(135deg, hsl(" + hue + " 78% 60%), hsl(" + ((hue + 40) % 360) + " 78% 48%))";
    return u;
  }

  // Top-right UI: guests get the "Sign in" button, Google users get the chip.
  function showGuestUI()   { if (signinTop) signinTop.hidden = false; if (chip) chip.hidden = true; }
  function showAccountUI() { if (signinTop) signinTop.hidden = true;  if (chip) chip.hidden = false; }

  // Reveal the app exactly once (game.js + net.js boot off this).
  function bootOnce() {
    if (booted) return;
    booted = true;
    document.dispatchEvent(new CustomEvent("sprint:auth", { detail: window.SPRINT_USER }));
  }

  function whenNet(fn) {
    if (window.SprintNet) fn();
    else document.addEventListener("sprint:net-ready", fn, { once: true });
  }

  /* ---- react to the active Firebase user (boot path) ---- */
  function onUser(user) {
    fbUser = user;
    if (user.isAnonymous) {
      setUser(user, "Guest");
      showGuestUI();
      hideGate();
      bootOnce();
      return;
    }
    // Google account: reuse a claimed @username, else prompt to pick one.
    setUser(user, user.displayName || localStorage.getItem("sprint_name"));
    whenNet(function () {
      window.SprintNet.getMyProfile().then(function (p) {
        if (p && p.username) { setUser(user, p.username); showAccountUI(); hideGate(); bootOnce(); }
        else showUsernameStep();
      }).catch(function () { showUsernameStep(); });
    });
  }

  /* ---- guest chooses to create/sign in to a Google account ---- */
  function startGoogleUpgrade() {
    if (!auth) { toast("Sign-in isn't ready yet. Please reload the page."); return; }
    clearError();
    upgrading = true;
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(function (cred) {
      var user = cred.user;
      fbUser = user;
      setUser(user, user.displayName || localStorage.getItem("sprint_name"));
      whenNet(function () {
        window.SprintNet.getMyProfile().then(function (p) {
          // Returning account → reload so the app boots cleanly as that user.
          // New account → pick a unique handle first (then reload on submit).
          if (p && p.username) location.reload();
          else showUsernameStep();
        }).catch(function () { showUsernameStep(); });
      });
    }).catch(function (e) {
      upgrading = false;
      console.error("[auth]", e);
      handleError(e);
    });
  }

  /* ---- unique @username step ---- */
  var uCheckTimer = null;

  function setUserHint(msg, tone) {
    userHint.textContent = msg;
    userHint.classList.remove("is-ok", "is-bad");
    if (tone) userHint.classList.add(tone === "ok" ? "is-ok" : "is-bad");
  }

  function showUsernameStep() {
    openGate();
    if (subtitle) subtitle.textContent = "Pick a unique username to save your name, stats and race history.";
    userError.hidden = true;
    userGo.disabled = false; userGo.textContent = "Continue";
    userInput.value = "";
    setUserHint("3–16 characters · letters, numbers, underscore", "");
    userInput.focus();
  }

  function onUsernameInput() {
    var v = (userInput.value || "").trim().toLowerCase();
    userError.hidden = true;
    clearTimeout(uCheckTimer);
    if (!v) { setUserHint("3–16 characters · letters, numbers, underscore", ""); return; }
    if (!HANDLE_RE.test(v)) { setUserHint("Only letters, numbers, underscore (3–16).", "bad"); return; }
    setUserHint("Checking availability…", "");
    uCheckTimer = setTimeout(function () {
      window.SprintNet.checkUsername(v).then(function (free) {
        if ((userInput.value || "").trim().toLowerCase() !== v) return; // input changed
        if (free) setUserHint("@" + v + " is available!", "ok");
        else setUserHint("@" + v + " is taken — try another.", "bad");
      }).catch(function () { setUserHint("Couldn't check right now — you can still try.", ""); });
    }, 300);
  }

  function submitUsername() {
    var v = (userInput.value || "").trim().toLowerCase();
    userError.hidden = true;
    if (!HANDLE_RE.test(v)) {
      userError.textContent = "Pick 3–16 characters: letters, numbers, underscore.";
      userError.hidden = false; return;
    }
    userGo.disabled = true; userGo.textContent = "Saving…";

    window.SprintNet.claimUsername(v).then(function (handle) {
      setUser(fbUser, handle); // the @username is the name shown on the track
      // Reboot cleanly as the fully-provisioned account (profile + presence).
      location.reload();
    }).catch(function (e) {
      userGo.disabled = false; userGo.textContent = "Continue";
      userError.textContent = (e && e.message) || "That username is taken. Try another.";
      userError.hidden = false;
      setUserHint("@" + v + " is taken — try another.", "bad");
    });
  }

  function handleError(e) {
    var code = e && e.code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    if (code === "auth/operation-not-allowed") {
      toast("Google sign-in isn't enabled for this app yet.");
    } else if (code === "auth/unauthorized-domain") {
      toast("This domain isn't authorized for sign-in.");
    } else if (code === "auth/popup-blocked") {
      toast("Your browser blocked the popup. Allow popups and try again.");
    } else {
      toast("Sign-in failed" + (code ? " (" + code + ")" : "") + ". Please try again.");
    }
  }

  /* ---- close the sign-in / username modal ---- */
  function closeGate() {
    hideGate();
    if (upgrading) {
      // Visitor abandoned the username step — drop the half-finished Google
      // session and fall back to a fresh guest so they can keep playing.
      upgrading = false;
      if (auth) auth.signOut().catch(function () {});
    }
  }

  /* ---- wiring ---- */
  if (signinTop) signinTop.addEventListener("click", startGoogleUpgrade);
  if (authClose) authClose.addEventListener("click", closeGate);
  if (gate) gate.addEventListener("click", function (e) { if (e.target === gate) closeGate(); });
  if (userInput) userInput.addEventListener("input", onUsernameInput);
  if (userForm)  userForm.addEventListener("submit", function (e) { e.preventDefault(); submitUsername(); });

  /* ---- sign out: confirm before exiting ---- */
  function doSignOut() {
    (auth ? auth.signOut() : Promise.resolve()).then(function () { location.reload(); }, function () { location.reload(); });
  }
  function closeSignout() { if (signoutModal) signoutModal.hidden = true; }
  if (bso) bso.addEventListener("click", function () {
    if (signoutModal) signoutModal.hidden = false; else doSignOut();
  });
  if (signoutConfirm) signoutConfirm.addEventListener("click", doSignOut);
  if (signoutCancel)  signoutCancel.addEventListener("click", closeSignout);
  if (signoutModal) signoutModal.addEventListener("click", function (e) {
    if (e.target === signoutModal) closeSignout(); // click backdrop to dismiss
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (signoutModal && !signoutModal.hidden) { closeSignout(); return; }
    if (gate && !gate.classList.contains("is-hidden")) closeGate();
  });

  /* ---- boot: silent guest session, or resume an existing sign-in ---- */
  if (!auth) {
    showError("Couldn't start sign-in. Reload the page.");
    openGate();
  } else {
    auth.onAuthStateChanged(function (user) {
      if (upgrading) return; // the upgrade flow drives its own user handling
      if (user) {
        onUser(user);
      } else {
        // Nobody signed in → sign in anonymously so the game just works.
        auth.signInAnonymously().catch(function (e) {
          console.error("[auth] anon", e);
          showError("Couldn't start a guest session. Check your connection and reload.");
          openGate();
        });
      }
    });
  }
})();
