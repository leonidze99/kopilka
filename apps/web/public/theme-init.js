// Applies the chosen theme before the first paint, or a dark-theme user
// sees a white flash. A file, not an inline script: the Content Security
// Policy allows scripts from this origin only. Keep the key in sync with
// src/shared/lib/theme.ts.
try {
  var theme = localStorage.getItem('kopilka:theme');
  if (theme === 'light' || theme === 'dark')
    document.documentElement.dataset.theme = theme;
} catch {
  // Storage blocked: the system theme it is.
}
