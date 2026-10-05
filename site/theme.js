(function () {
  var root = document.documentElement;
  var zh = (root.lang || "").indexOf("zh") === 0;
  var modes = ["system", "light", "dark"];
  var names = zh ? { system: "跟随系统", light: "浅色", dark: "深色" } : { system: "System", light: "Light", dark: "Dark" };
  function saved() {
    try {
      return localStorage.getItem("theme");
    } catch {
      return null;
    }
  }
  function apply(mode) {
    if (mode === "light" || mode === "dark") root.dataset.theme = mode;
    else delete root.dataset.theme;
  }
  apply(saved());
  document.addEventListener("DOMContentLoaded", function () {
    var nav = document.querySelector("header.site nav");
    if (!nav) return;
    var group = document.createElement("div");
    group.className = "theme-toggle";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", zh ? "主题" : "Theme");
    var buttons = modes.map(function (mode) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = names[mode];
      b.addEventListener("click", function () {
        apply(mode);
        try {
          if (mode === "system") localStorage.removeItem("theme");
          else localStorage.setItem("theme", mode);
        } catch {
          // storage unavailable: the choice just won't persist
        }
        mark(mode);
      });
      group.appendChild(b);
      return b;
    });
    function mark(current) {
      buttons.forEach(function (b, i) {
        b.setAttribute("aria-pressed", String(modes[i] === current));
      });
    }
    var s = saved();
    mark(s === "light" || s === "dark" ? s : "system");
    nav.appendChild(group);
  });
})();
