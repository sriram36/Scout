export const THEME_KEY = "scout-theme";

/**
 * Runs before React hydrates (inlined in layout.tsx) so the saved theme applies
 * on first paint without a flash. Dark is the default.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}})();`;
