/* =========================================================
   SPRINT · Firebase bootstrap (compat / classic script)
   Initializes the shared app. Exposes firebase.auth() and
   firebase.database() globally for auth.js and net.js.
   ========================================================= */
(function () {
  "use strict";

  var firebaseConfig = {
    apiKey: "AIzaSyC--QRS8JWRjDQkzYzIf8Yo-p4-eFvk6P8",
    authDomain: "sprint-typing.firebaseapp.com",
    databaseURL: "https://sprint-typing-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "sprint-typing",
    storageBucket: "sprint-typing.firebasestorage.app",
    messagingSenderId: "967427238856",
    appId: "1:967427238856:web:81c6205b0e801e554f6efd",
    measurementId: "G-T5Z7GBKQJQ",
  };

  if (typeof firebase === "undefined") {
    showFatal("Firebase failed to load. Check your internet connection and reload.");
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
    window.SprintAuth = firebase.auth();
    window.SprintDB = firebase.database();
  } catch (e) {
    console.error("[firebase-init]", e);
    showFatal("Couldn't start Firebase: " + (e && e.message ? e.message : e));
  }

  function showFatal(msg) {
    // The sign-in modal is hidden by default — reveal it so the error shows.
    var gate = document.getElementById("auth-gate");
    if (gate) gate.classList.remove("is-hidden");
    var err = document.getElementById("auth-error");
    if (err) { err.textContent = msg; err.hidden = false; }
  }
})();
