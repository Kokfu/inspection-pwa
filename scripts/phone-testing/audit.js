(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const audit = (name) => {
    const vw = window.innerWidth;
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const interactive = [...document.querySelectorAll('button,a[href],input:not([type=hidden]):not([type=file]),select,textarea,[role=button]')].filter(vis);
    const small = interactive.filter((e) => { const r = e.getBoundingClientRect(); return (r.height < 44 || r.width < 44) && !(e.type === 'radio' || e.type === 'checkbox'); }).map((e) => (e.innerText || e.getAttribute('aria-label') || e.name || e.type || e.tagName).replace(/\s+/g, ' ').slice(0, 24) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
    const overflowX = document.documentElement.scrollWidth > vw + 1;
    const wide = [...document.querySelectorAll('body *')].filter((e) => vis(e) && e.getBoundingClientRect().right > vw + 2 && getComputedStyle(e).position !== 'fixed').slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 30));
    const tiny = [...document.querySelectorAll('body *')].filter((e) => vis(e) && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).length;
    const zoomRisk = [...document.querySelectorAll('input:not([type=file]):not([type=checkbox]):not([type=radio]),select,textarea')].filter((e) => vis(e) && parseFloat(getComputedStyle(e).fontSize) < 16).length;
    const unlabeled = [...document.querySelectorAll('input:not([type=hidden]):not([type=file]),select,textarea')].filter((e) => vis(e) && !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).length;
    const noName = interactive.filter((e) => !(e.innerText || '').trim() && !e.getAttribute('aria-label') && !(e.labels && e.labels.length) && e.tagName === 'BUTTON').length;
    return { screen: name, vw, overflowX, wide, interactive: interactive.length, smallTargets: small.slice(0, 8), smallCount: small.length, tinyTextNodes: tiny, zoomRiskInputs: zoomRisk, unlabeledInputs: unlabeled, namelessButtons: noName };
  };
  const out = [];
  location.hash = '#/jobs'; await w(1500); out.push(audit('jobs list'));
  location.hash = '#/new-service-visit'; await w(1800); out.push(audit('new service visit'));
  location.hash = '#/job/' + window.__job62; await w(1800); out.push(audit('job page'));
  location.hash = '#/smoke-ventilation-form/6ed0bf77-0d13-46c3-8104-8ef87e649569'; await w(2500); out.push(audit('smoke form'));
  return JSON.stringify(out, null, 1);
})()
