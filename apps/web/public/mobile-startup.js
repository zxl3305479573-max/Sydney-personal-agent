(() => {
  const splash = document.getElementById("mobile-startup");
  const root = document.getElementById("root");
  if (!splash || !root) return;
  if (!window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches) {
    splash.remove();
    return;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const error = splash.querySelector(".mobile-startup-error");
  const refresh = error?.querySelector("button");
  refresh?.addEventListener("click", () => window.location.reload());
  const timeout = window.setTimeout(() => {
    if (error) error.hidden = false;
  }, 8000);
  let finishing = false;
  const observer = new MutationObserver(check);
  observer.observe(root, { subtree: true, childList: true, attributes: true });
  for (const link of document.querySelectorAll("link[data-mobile-styles]")) {
    const enable = () => {
      link.media = "all";
      check();
    };
    if (link.sheet) enable();
    else link.addEventListener("load", enable, { once: true });
  }
  if (["/sso/callback", "/integrations/callback"].includes(window.location.pathname)) {
    finishing = true;
    observer.disconnect();
    window.clearTimeout(timeout);
    splash.remove();
    return;
  }

  function check() {
    if (finishing) return;
    const failed = root.querySelector(
      '[data-rakazo-app-state="failed"], [data-mobile-startup-terminal]',
    );
    const app = root.querySelector('[data-rakazo-app-state="ready"]');
    const pending = root.querySelector("[data-mobile-startup-pending]");
    const ready = app?.firstElementChild && !pending;
    if (!failed && !ready) return;
    if (document.querySelector('link[data-mobile-styles]:not([media="all"])')) return;
    finishing = true;
    observer.disconnect();
    window.clearTimeout(timeout);
    const remaining = failed || reducedMotion ? 0 : Math.max(0, 600 - performance.now());
    window.setTimeout(() => {
      splash.setAttribute("data-finishing", "");
      window.setTimeout(() => splash.remove(), reducedMotion ? 0 : 180);
    }, remaining);
  }
  check();
})();
