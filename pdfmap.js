// PDF trail map import (ported from the GPS Map app).
// Loaded on demand: MuPDF's ~10 MB WebAssembly build is only fetched when a PDF is imported.
// Returns the rendered page as a JPEG blob plus a best-guess placement:
//   1. embedded GeoPDF viewport (/VP GPTS/LPTS), exact when present
//   2. printed "GPS Coordinates" labels (Name: lat, lon) found on the map page, fitted with an affine transform
//   3. nothing: topLeft etc. are null and the caller places it by hand
let mupdf;
async function load(){ if (!mupdf) mupdf = await import('./vendor/mupdf.js'); return mupdf; }

export function fitAffine(points, key){
  // Least-squares fit of target = a*px + b*py + c (exact for 3 points).
  let Sxx=0, Sxy=0, Sx=0, Syy=0, Sy=0, S1=0, Sxt=0, Syt=0, St=0;
  for (const p of points){ const x = p.px, y = p.py, t = p[key]; Sxx+=x*x; Sxy+=x*y; Sx+=x; Syy+=y*y; Sy+=y; S1+=1; Sxt+=x*t; Syt+=y*t; St+=t; }
  return solve3([[Sxx,Sxy,Sx],[Sxy,Syy,Sy],[Sx,Sy,S1]], [Sxt,Syt,St]);
}
export const applyAffine = (cLat, cLon, px, py) => [cLat[0]*px + cLat[1]*py + cLat[2], cLon[0]*px + cLon[1]*py + cLon[2]];
function solve3(A, b){
  const det = m => m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-9) throw new Error('Reference points are too close together to compute a position.');
  const col = (c, v) => A.map((row, i) => row.map((x, j) => j === c ? v[i] : x));
  return [det(col(0, b))/D, det(col(1, b))/D, det(col(2, b))/D];
}

function findViewportGeoref(doc){
  for (let i = 0; i < doc.countPages(); i++){
    const vp0 = doc.loadPage(i).getObject().get('VP', 0);
    if (!vp0 || vp0.isNull()) continue;
    const bbox = vp0.get('BBox').asJS(), measure = vp0.get('Measure');
    const gpts = measure.get('GPTS').asJS(), lpts = measure.get('LPTS').asJS();
    const corners = [];
    for (let j = 0; j < lpts.length / 2; j++) corners.push({ lp: [lpts[j*2], lpts[j*2+1]], gp: [gpts[j*2], gpts[j*2+1]] });
    const nearest = (u, v) => corners.reduce((b, c) => { const d = (c.lp[0]-u)**2 + (c.lp[1]-v)**2; return d < b.d ? { d, gp: c.gp } : b; }, { d: Infinity, gp: null }).gp;
    return { pageIndex: i, bbox, topLeft: nearest(0,1), topRight: nearest(1,1), bottomLeft: nearest(0,0) };
  }
  return null;
}

function parseCoordLines(text){
  const out = [], re = /^(.+?):\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/;
  for (const raw of text.split('\n')){ const m = raw.trim().match(re); if (m) out.push({ name: m[1].trim(), lat: +m[2], lon: +m[3] }); }
  return out;
}
const quadCenter = q => [(q[0]+q[2]+q[4]+q[6])/4, (q[1]+q[3]+q[5]+q[7])/4];

async function renderFullPage(page, targetPx){
  const mb = page.getBounds(), w = mb[2]-mb[0], h = mb[3]-mb[1];
  const scale = Math.min(targetPx, 4000) / Math.max(w, h);
  const matrix = mupdf.Matrix.concat(page.getTransform(), mupdf.Matrix.scale(scale, scale));
  const pix = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
  const url = URL.createObjectURL(new Blob([pix.asPNG()], { type: 'image/png' }));
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not decode the rendered page.')); i.src = url; });
  const canvas = document.createElement('canvas'); canvas.width = pix.getWidth(); canvas.height = pix.getHeight();
  const g = canvas.getContext('2d');
  // MuPDF's pixmap comes out vertically flipped here (verified against real maps in GPS Map); undo it.
  g.translate(0, canvas.height); g.scale(1, -1); g.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  return { canvas, matrix, mediaBox: mb };
}
// Same matrix + flip as renderFullPage, so a PDF point lands on the pixel that shows it.
const toPixel = (m, H, x, y) => [m[0]*x + m[2]*y + m[4], H - (m[1]*x + m[3]*y + m[5])];
const jpeg = c => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not render the PDF page.')), 'image/jpeg', 0.85));

async function autoDetect(doc){
  let entries = [];
  for (let i = 0; i < doc.countPages(); i++){
    const text = doc.loadPage(i).toStructuredText().asText();
    if (/GPS Coordinates/i.test(text)){ const f = parseCoordLines(text); if (f.length > entries.length) entries = f; }
  }
  if (entries.length < 3) return null;
  let best = null;
  for (let i = 0; i < doc.countPages(); i++){
    const st = doc.loadPage(i).toStructuredText(), refs = [];
    for (const e of entries){
      let q = null;
      try{ q = st.search(e.name, {}); }catch{}
      if ((!q || q.length !== 1) && e.name.includes(' ')){ try{ const q2 = st.search(e.name.split(' ')[0], {}); if (q2 && q2.length === 1) q = q2; }catch{} }
      if (q && q.length === 1){ const [px, py] = quadCenter(q[0][0]); refs.push({ px, py, lat: e.lat, lon: e.lon, name: e.name }); }
    }
    if (!best || refs.length > best.refs.length) best = { pageIndex: i, refs };
  }
  if (!best || best.refs.length < 3) return null;
  const { canvas, matrix } = await renderFullPage(doc.loadPage(best.pageIndex), 2000);
  const refs = best.refs.map(r => { const [px, py] = toPixel(matrix, canvas.height, r.px, r.py); return { ...r, px, py }; });
  const cLat = fitAffine(refs, 'lat'), cLon = fitAffine(refs, 'lon');
  return {
    imageBlob: await jpeg(canvas), imageWidth: canvas.width, imageHeight: canvas.height,
    topLeft: applyAffine(cLat, cLon, 0, 0), topRight: applyAffine(cLat, cLon, canvas.width, 0), bottomLeft: applyAffine(cLat, cLon, 0, canvas.height),
    method: `auto-detected (${refs.length} printed GPS points)`, labels: refs.map(r => r.name)
  };
}

export async function parseGeoPdf(file){
  await load();
  const doc = mupdf.Document.openDocument(new Uint8Array(await file.arrayBuffer()), 'application/pdf');
  const vp = findViewportGeoref(doc);
  if (vp){
    const { canvas, mediaBox: mb } = await renderFullPage(doc.loadPage(vp.pageIndex), 2000);
    const W = mb[2]-mb[0], H = mb[3]-mb[1], b = vp.bbox;
    const x0 = Math.min(b[0], b[2]) - mb[0], x1 = Math.max(b[0], b[2]) - mb[0];
    const y0 = mb[3] - Math.max(b[1], b[3]), y1 = mb[3] - Math.min(b[1], b[3]); // PDF y-up -> rows down
    const cx = x0 / W * canvas.width, cy = y0 / H * canvas.height, cw = (x1 - x0) / W * canvas.width, ch = (y1 - y0) / H * canvas.height;
    const crop = document.createElement('canvas'); crop.width = cw; crop.height = ch;
    crop.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    return { imageBlob: await jpeg(crop), imageWidth: cw, imageHeight: ch, topLeft: vp.topLeft, topRight: vp.topRight, bottomLeft: vp.bottomLeft, method: 'embedded metadata', labels: [] };
  }
  const auto = await autoDetect(doc);
  if (auto) return auto;
  const { canvas } = await renderFullPage(doc.loadPage(0), 2000);
  return { imageBlob: await jpeg(canvas), imageWidth: canvas.width, imageHeight: canvas.height, topLeft: null, topRight: null, bottomLeft: null, method: 'manual placement', labels: [] };
}
