/* =========================================================
   SPRINT · Theme toggle (light / dark)
   The initial theme is applied inline in <head> (before paint,
   so there's no flash). This script only wires the toggle:
   flip the <html data-theme> attribute, persist the choice, and
   keep the switch's aria/pressed state in sync. Icons swap purely
   via CSS on [data-theme] — no DOM churn here.
   Default is DARK (the original "Night Circuit" look).
   ========================================================= */
(function () {
  "use strict";

  var KEY = "sprint_theme";
  var root = document.documentElement;
  var btn = document.getElementById("theme-toggle");

  function current() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    if (btn) {
      btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
      btn.setAttribute(
        "title",
        theme === "light" ? "Switch to dark mode" : "Switch to light mode"
      );
    }
    try { localStorage.setItem(KEY, theme); } catch (e) {}
  }

  // Reflect the already-applied (head-inline) theme onto the button state.
  apply(current());

  if (btn) {
    btn.addEventListener("click", function () {
      apply(current() === "light" ? "dark" : "light");
    });
  }

  // Expose for other scripts if they ever need it.
  window.SprintTheme = { get: current, set: apply, toggle: function () {
    apply(current() === "light" ? "dark" : "light");
  } };
})();
