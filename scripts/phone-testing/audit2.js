(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const nameless = [...document.querySelectorAll('button')].filter((e) => vis(e) && !(e.innerText || '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('title') && !(e.labels && e.labels.length))
    .map((e) => { const r = e.getBoundingClientRect(); return e.className.toString().slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' html=' + e.innerHTML.slice(0, 60).replace(/\s+/g, ' '); });
  const tiny = [...document.querySelectorAll('body *')].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
    .map((e) => parseFloat(getComputedStyle(e).fontSize) + 'px "' + e.innerText.trim().slice(0, 30) + '" ' + e.tagName + '.' + String(e.className).slice(0, 25));
  const signout = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Sign out');
  const cs = getComputedStyle(signout);
  return JSON.stringify({ nameless, tiny, signoutStyle: { h: signout.getBoundingClientRect().height, font: cs.fontSize, pad: cs.padding, cls: signout.className } }, null, 1);
})()
