// Applies the saved theme before first paint. Served as a file because the CSP disallows inline scripts.
(() => {
  const valid = (value) => value === "dark" || value === "light";
  let mode = "";
  try {
    const prefix = "evalcue_theme=";
    const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    if (cookie) mode = decodeURIComponent(cookie.slice(prefix.length));
  } catch { /* Cookies may be unavailable. */ }
  if (!valid(mode)) {
    try { mode = localStorage.getItem("ia:theme") || ""; } catch { /* Storage may be unavailable. */ }
  }
  if (!valid(mode)) mode = "light";
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  root.style.backgroundColor = mode === "dark" ? "#0e0f11" : "#fafbff";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#0e0f11" : "#ffffff");
})();
