// The fonts downloaded by `npm run fonts` (public/fonts → dist/fonts); without them the system fonts are used.
let warned = false;

export async function loadFonts(doc: Document, base: string, f: typeof fetch = fetch): Promise<boolean> {
  const href = new URL('fonts/fonts.css', base).href;
  try { const r = await f(href); if (!r.ok) throw new Error(String(r.status)); }
  catch {
    if (!warned) { warned = true; console.warn('字型尚未下載：在 tellcut/ 執行 npm run fonts（目前使用系統字型）'); }
    return false;
  }
  await new Promise<void>((res) => {
    const l = doc.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.dataset.fonts = '';
    l.onload = l.onerror = () => res();
    doc.head.appendChild(l);
  });
  return true;
}
