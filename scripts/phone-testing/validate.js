(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const fi = () => document.querySelector('input[type=file]');
  const feed = async (label, file) => {
    const dt = new DataTransfer(); dt.items.add(file);
    const i = fi(); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true }));
    await w(5000);
    const t = document.body.innerText.split('\n').filter((l) => /photo|KB|invalid|unsupported|large|JPEG|image|could not|must/i.test(l) && !/Take Photo|Choose Existing|No photo attached/.test(l)).slice(-2).join(' // ');
    out.push(label + ' -> ' + t);
  };
  const canvas = (w2, h2, noise) => {
    const c = document.createElement('canvas'); c.width = w2; c.height = h2; const g = c.getContext('2d');
    for (let i = 0; i < (noise ? 400 : 20); i++) { g.fillStyle = 'rgb(' + (Math.random() * 255 | 0) + ',' + (Math.random() * 255 | 0) + ',' + (Math.random() * 255 | 0) + ')'; g.fillRect(Math.random() * w2, Math.random() * h2, Math.random() * w2 / 3, Math.random() * h2 / 3); }
    return c;
  };
  const toBlob = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
  await feed('PNG 1000x800', new File([await toBlob(canvas(1000, 800), 'image/png')], 'x.png', { type: 'image/png' }));
  await feed('text file labelled image/jpeg', new File([new Blob(['hello this is not an image'])], 'fake.jpg', { type: 'image/jpeg' }));
  const junk = new Uint8Array(5000); crypto.getRandomValues(junk); junk[0] = 0xFF; junk[1] = 0xD8;
  await feed('garbage bytes with JPEG magic', new File([junk], 'junk.jpg', { type: 'image/jpeg' }));
  const big = await toBlob(canvas(8000, 6000, true), 'image/jpeg', 0.98);
  await feed('large 8000x6000 JPEG (' + Math.round(big.size / 1024) + ' KB)', new File([big], 'big.jpg', { type: 'image/jpeg' }));
  const gif = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));
  await feed('GIF', new File([gif], 'a.gif', { type: 'image/gif' }));
  return out.join(' ;; ');
})()
