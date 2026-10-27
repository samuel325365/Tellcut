// The home page and the gallery pick light or dark before the first paint (theme.tsx keeps it after); the editor (?id=) stays
// dark. A classic script file, not inline: the server's CSP runs only this server's own script files.
try {
  if (!/[?&]id=/.test(location.search)) {
    var t = localStorage.getItem('tellcut.theme');
    document.documentElement.dataset.theme = t === 'light' || t === 'dark' ? t : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
} catch (e) {}
