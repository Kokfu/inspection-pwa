// Mobile UI audit helper. Run once per page load (Invoke-Cdp "@scripts\phone-testing\audit3.js"); it defines
// window.__audit(name) which returns a compact JSON string for the screen that is showing right now.
(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const label = (e) => ((e.innerText || e.getAttribute('aria-label') || e.title || e.name || e.type || e.tagName) + '').replace(/\s+/g, ' ').trim().slice(0, 28);
  const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (e) => { let layers = []; for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255 }; for (const c of layers.reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) }; return base; };
  window.__audit = (name) => {
    const vw = window.innerWidth;
    const all = [...document.querySelectorAll('body *')].filter(vis);
    const interactive = [...document.querySelectorAll('button,a[href],input:not([type=hidden]):not([type=file]),select,textarea,[role=button],summary')].filter(vis);
    const target = (e) => { if ((e.type === 'checkbox' || e.type === 'radio') && e.labels && e.labels[0]) return e.labels[0].getBoundingClientRect(); return e.getBoundingClientRect(); };
    const small = interactive.filter((e) => { const r = target(e); return r.height < 44 || r.width < 44; }).map((e) => { const r = target(e); return label(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); });
    const wide = all.filter((e) => e.getBoundingClientRect().right > vw + 2 && getComputedStyle(e).position !== 'fixed').slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 30));
    const textEls = all.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const tiny = textEls.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => parseFloat(getComputedStyle(e).fontSize) + 'px "' + e.innerText.trim().slice(0, 22) + '"');
    const zoom = interactive.filter((e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !['checkbox', 'radio', 'button', 'submit'].includes(e.type) && parseFloat(getComputedStyle(e).fontSize) < 16).map(label);
    const unlabeled = interactive.filter((e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title).map((e) => (e.name || e.type || e.tagName) + ' ' + label(e));
    const nameless = interactive.filter((e) => /^(BUTTON|A)$/.test(e.tagName) && !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.title && !e.getAttribute('aria-labelledby')).map((e) => e.className.toString().slice(0, 30) || e.tagName);
    const lowContrast = [];
    const onImage = (e) => { for (let n = e; n; n = n.parentElement) { const bi = getComputedStyle(n).backgroundImage; if (bi && bi !== 'none') return true; } return false; };
    for (const e of textEls) { if (onImage(e)) continue; const s = getComputedStyle(e); const fg = rgba(s.color); if (!fg) continue; const bg = bgOf(e); const a = fg.a; const f = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) }; const l1 = lum(f), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight) >= 700; const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5; if (ratio < need && !(e.disabled || e.closest('[disabled],fieldset:disabled'))) lowContrast.push(ratio.toFixed(2) + ' "' + e.innerText.trim().slice(0, 22) + '" ' + size + 'px'); }
    const imgs = [...document.querySelectorAll('img')].filter(vis);
    const imgNoDim = imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length;
    const imgNoAlt = imgs.filter((i) => !i.hasAttribute('alt')).length;
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map((h) => +h.tagName[1]);
    let skips = 0; for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) skips++;
    const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
    const dupIds = Object.keys(ids).filter((k) => ids[k] > 1).slice(0, 4);
    const clipped = all.filter((e) => { const s = getComputedStyle(e); return (s.overflowX === 'hidden') && e.scrollWidth > e.clientWidth + 2 && s.textOverflow !== 'ellipsis' && textEls.includes(e); }).slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 24) + ' "' + e.innerText.trim().slice(0, 20) + '"');
    // focus visibility: tab-focus the first interactive elements the way a keyboard would
    let noFocusRing = [];
    for (const e of interactive.slice(0, 40)) { try { e.focus({ focusVisible: true, preventScroll: true }); } catch { e.focus({ preventScroll: true }); } const s = getComputedStyle(e); const none = (s.outlineStyle === 'none' || parseFloat(s.outlineWidth) === 0) && (s.boxShadow === 'none'); if (none && document.activeElement === e) noFocusRing.push(label(e)); }
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const main = !!document.querySelector('main'), skip = !!document.querySelector('a[href^="#"][class*=skip]');
    const fixed = [...document.querySelectorAll('body *')].filter((e) => vis(e) && ['fixed', 'sticky'].includes(getComputedStyle(e).position)).map((e) => e.tagName + '.' + String(e.className).slice(0, 22) + ' ' + Math.round(e.getBoundingClientRect().height) + 'h');
    const noAutocomplete = interactive.filter((e) => e.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(e.type) && !e.getAttribute('autocomplete')).length;
    const dots = textEls.filter((e) => /\.\.\.(\s|$)/.test(e.innerText || '')).length;
    return JSON.stringify({ screen: name, hash: location.hash.slice(0, 40), vw, overflowX: document.documentElement.scrollWidth > vw + 1 || vw > screen.width + 1, screenW: screen.width, wide, interactive: interactive.length, smallCount: small.length, small: small.slice(0, 6), tinyCount: tiny.length, tiny: [...new Set(tiny)].slice(0, 4), zoomRisk: zoom.slice(0, 4), unlabeled: unlabeled.slice(0, 4), nameless, lowContrastCount: lowContrast.length, lowContrast: [...new Set(lowContrast)].slice(0, 4), imgs: imgs.length, imgNoDim, imgNoAlt, h1: hs.filter((h) => h === 1).length, headingSkips: skips, dupIds, clipped, noFocusRing: noFocusRing.slice(0, 5), main, skip, fixed: fixed.slice(0, 4), noAutocomplete, dots });
  };
  return 'audit ready';
})()
