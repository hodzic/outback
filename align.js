// Auto-align for PDF map overlays: line the water drawn on the map up with OpenStreetMap water.
// Loaded on demand. Everything runs on the device; only the OSM water outlines come from the network (Overpass),
// and the caller keeps them with the map so re-aligning works offline.
//   1. water on the PDF: the most common light-blue colour, closed over labels, small holes filled
//   2. OSM water outlines for the map's area
//   3. a similarity transform (shift, turn, uniform scale) on top of the current placement that minimises a
//      truncated, symmetric chamfer distance between the two shorelines, coarse to fine.
// Tested on a park brochure: shoreline mismatch median 38 m -> 8 m. It refines a placement that is roughly right
// (within a few hundred metres); it is not a global search.

const D = 1000;           // analysis image size (longest side, px)
const MAX_PTS = 1500;     // boundary points used from each side
const STAGES = [400, 200, 100, 60]; // truncation distance per stage, metres

/* ---------- geometry helpers ---------- */
// Local metres around (lat0, lon0), equirectangular: fine over a park-sized area.
export function localFrame(lat0, lon0){
  const r = lat0 * Math.PI / 180;
  const ky = 111132.954 - 559.822 * Math.cos(2 * r), kx = 111412.84 * Math.cos(r);
  return { toM: (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky], toLL: (x, y) => [lat0 + y / ky, lon0 + x / kx] };
}
// Least-squares affine from points {px, py, x, y}: x = a0*px + a1*py + a2, y = b0*px + b1*py + b2
function fit(pts){
  let Sxx = 0, Sxy = 0, Sx = 0, Syy = 0, Sy = 0, n = 0, Xx = 0, Xy = 0, X = 0, Yx = 0, Yy = 0, Y = 0;
  for (const p of pts){ const u = p.px, v = p.py; Sxx += u*u; Sxy += u*v; Sx += u; Syy += v*v; Sy += v; n++; Xx += u*p.x; Xy += v*p.x; X += p.x; Yx += u*p.y; Yy += v*p.y; Y += p.y; }
  const M = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]];
  return [...solve3(M, [Xx, Xy, X]), ...solve3(M, [Yx, Yy, Y])];
}
function solve3(A, b){
  const det = m => m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  const d = det(A), col = (c, v) => A.map((r, i) => r.map((x, j) => j === c ? v[i] : x));
  return [det(col(0, b)) / d, det(col(1, b)) / d, det(col(2, b)) / d];
}

/* ---------- exact Euclidean distance transform (Felzenszwalb & Huttenlocher) ---------- */
// src: Uint8Array, 1 = feature. Returns Float32Array of distances (cells) to the nearest feature.
export function edt(src, W, H){
  const INF = 1e20, f = new Float64Array(Math.max(W, H)), d = new Float64Array(Math.max(W, H)), v = new Int32Array(Math.max(W, H)), z = new Float64Array(Math.max(W, H) + 1);
  const g = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = src[i] ? 0 : INF;
  const pass = n => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++){
      let s;
      while (true){ const p = v[k]; s = ((f[q] + q*q) - (f[p] + p*p)) / (2*q - 2*p); if (s <= z[k]) k--; else break; } // z[0] = -INF stops it
      k++; v[k] = q; z[k] = s; z[k+1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++){ while (z[k+1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
  };
  for (let x = 0; x < W; x++){ for (let y = 0; y < H; y++) f[y] = g[y*W + x]; pass(H); for (let y = 0; y < H; y++) g[y*W + x] = d[y]; }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++){ for (let x = 0; x < W; x++) f[x] = g[y*W + x]; pass(W); for (let x = 0; x < W; x++) out[y*W + x] = Math.sqrt(d[x]); }
  return out;
}
// Bilinear sample with edge clamping
function sample(dt, W, H, x, y){
  x = Math.min(Math.max(x, 0), W - 1.001); y = Math.min(Math.max(y, 0), H - 1.001);
  const i = x | 0, j = y | 0, fx = x - i, fy = y - j, k = j * W + i;
  return (dt[k] * (1 - fx) + dt[k + 1] * fx) * (1 - fy) + (dt[k + W] * (1 - fx) + dt[k + W + 1] * fx) * fy;
}

/* ---------- 1. water on the PDF image ---------- */
// Most common light-blue colour, or null when there is too little of it.
function waterColor(px, n){
  const bins = new Map();
  for (let i = 0; i < n; i += 2){ // every other pixel is plenty
    const r = px[i*4], g = px[i*4+1], b = px[i*4+2];
    if (b < 150 || r < 90 || b - r < 22 || g - b > 12) continue;
    const k = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3), e = bins.get(k);
    if (e){ e.n++; e.r += r; e.g += g; e.b += b; } else bins.set(k, { n: 1, r, g, b });
  }
  let best = null; for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n * 2 < n * 0.004) return null;
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}
// 4-connected flood labelling; returns { lab: Int32Array (0 = not in set), sizes: [] (index = label), touches: [] edge flags }
function label(mask, W, H, want){
  const lab = new Int32Array(W * H), sizes = [0], touches = [false], stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++){
    if (lab[s] || mask[s] !== want) continue;
    const id = sizes.length; let top = 0, n = 0, edge = false; stack[top++] = s; lab[s] = id;
    while (top){
      const p = stack[--top], x = p % W, y = (p / W) | 0; n++;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      if (x > 0 && !lab[p-1] && mask[p-1] === want){ lab[p-1] = id; stack[top++] = p - 1; }
      if (x < W-1 && !lab[p+1] && mask[p+1] === want){ lab[p+1] = id; stack[top++] = p + 1; }
      if (y > 0 && !lab[p-W] && mask[p-W] === want){ lab[p-W] = id; stack[top++] = p - W; }
      if (y < H-1 && !lab[p+W] && mask[p+W] === want){ lab[p+W] = id; stack[top++] = p + W; }
    }
    sizes.push(n); touches.push(edge);
  }
  return { lab, sizes, touches };
}
// RGBA pixels (already scaled to the analysis size) -> water components, each with its shoreline pixels.
// color: [r,g,b] to use instead of auto-detecting.
export function findWater(px, W, H, color){
  const n = W * H, c = color || waterColor(px, n);
  if (!c) return null;
  let mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (Math.abs(px[i*4] - c[0]) + Math.abs(px[i*4+1] - c[1]) + Math.abs(px[i*4+2] - c[2]) < 40) mask[i] = 1;
  // close over labels, trail lines and symbols drawn on the water
  const r = Math.max(2, Math.round(Math.max(W, H) / 330));
  const dIn = edt(mask, W, H), grown = new Uint8Array(n);
  for (let i = 0; i < n; i++) grown[i] = dIn[i] <= r ? 0 : 1; // 1 = still land after growing the water
  const dOut = edt(grown, W, H);
  for (let i = 0; i < n; i++) mask[i] = dOut[i] > r ? 1 : 0;
  // fill small holes (text, icons); keep big ones (islands)
  const holes = label(mask, W, H, 0);
  for (let i = 0; i < n; i++){ const h = holes.lab[i]; if (h && !holes.touches[h] && holes.sizes[h] < n * 0.002) mask[i] = 1; }
  const comps = label(mask, W, H, 1), keep = [];
  for (let id = 1; id < comps.sizes.length; id++) if (comps.sizes[id] >= Math.max(60, n * 0.0015)) keep.push({ id, area: comps.sizes[id], edge: [] });
  if (!keep.length) return null;
  const byId = new Map(keep.map(k => [k.id, k]));
  // shoreline = water pixels next to land; the picture's own border is not a shoreline
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++){
    const p = y * W + x, k = byId.get(comps.lab[p]); if (!k) continue;
    if (!mask[p-1] || !mask[p+1] || !mask[p-W] || !mask[p+W]) k.edge.push(x, y);
  }
  return { color: c.map(Math.round), comps: keep.filter(k => k.edge.length >= 40).sort((a, b) => b.area - a.area) };
}

/* ---------- 2. OSM water ---------- */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
// bbox [south, west, north, east] -> outlines [[[lat, lon], ...], ...]
export async function fetchOsmWater(bbox, signal){
  const b = bbox.map(v => v.toFixed(5)).join(',');
  const q = `[out:json][timeout:30];(way["natural"="water"](${b});relation["natural"="water"](${b});way["waterway"="riverbank"](${b});relation["waterway"="riverbank"](${b});way["natural"="coastline"](${b}););out geom(${b});`;
  let err;
  for (const url of OVERPASS){
    try{
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal });
      if (!r.ok) throw new Error(`OpenStreetMap water lookup failed (${r.status}).`);
      return osmLines(await r.json());
    }catch(e){ err = e; if (signal?.aborted) break; }
  }
  throw err;
}
export function osmLines(j){
  const out = [], take = geom => { // nodes outside the clip box come back as null: split there
    let cur = [];
    for (const g of geom || []){ if (g && g.lat != null){ cur.push([+g.lat.toFixed(6), +g.lon.toFixed(6)]); } else { if (cur.length > 1) out.push(cur); cur = []; } }
    if (cur.length > 1) out.push(cur);
  };
  for (const e of j.elements || []){
    if (e.type === 'way') take(e.geometry);
    else if (e.type === 'relation') for (const m of e.members || []) if (m.type === 'way') take(m.geometry);
  }
  return out;
}

/* ---------- 3. fit ---------- */
// Nelder-Mead on a few parameters
function nelderMead(f, x0, step, iters){
  const n = x0.length; let s = [x0.slice()];
  for (let i = 0; i < n; i++){ const x = x0.slice(); x[i] += step[i]; s.push(x); }
  let fs = s.map(f);
  for (let it = 0; it < iters; it++){
    const ord = fs.map((v, i) => i).sort((a, b) => fs[a] - fs[b]); s = ord.map(i => s[i]); fs = ord.map(i => fs[i]);
    if (Math.abs(fs[n] - fs[0]) < 1e-6 * (1 + Math.abs(fs[0])) && s.every(x => x.every((v, i) => Math.abs(v - s[0][i]) < 0.05))) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += s[i][j] / n;
    const at = t => c.map((v, j) => v + t * (s[n][j] - v));
    const xr = at(-1), fr = f(xr);
    if (fr < fs[0]){ const xe = at(-2), fe = f(xe); if (fe < fr){ s[n] = xe; fs[n] = fe; } else { s[n] = xr; fs[n] = fr; } }
    else if (fr < fs[n-1]){ s[n] = xr; fs[n] = fr; }
    else {
      const xc = fr < fs[n] ? at(-0.5) : at(0.5), fc = f(xc);
      if (fc < Math.min(fr, fs[n])){ s[n] = xc; fs[n] = fc; }
      else for (let i = 1; i <= n; i++){ s[i] = s[i].map((v, j) => s[0][j] + 0.5 * (v - s[0][j])); fs[i] = f(s[i]); }
    }
  }
  const b = fs.indexOf(Math.min(...fs)); return { x: s[b], f: fs[b] };
}
const pick = (arr, max) => { if (arr.length <= max) return arr; const k = arr.length / max, out = []; for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * k)]); return out; };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };

// Analyse the overlay picture once (decode + water detection). blob: the overlay image; W, H: its full size.
export async function analyseImage(blob, W, H, color){
  const bmp = await createImageBitmap(blob), f = Math.min(1, D / Math.max(W, H));
  const w = Math.max(1, Math.round(W * f)), h = Math.max(1, Math.round(H * f));
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const water = findWater(g.getImageData(0, 0, w, h).data, w, h, color);
  return water && { ...water, w, h, f: w / W }; // f: analysis px per overlay px (x and y equal up to rounding)
}

// Footprint of the overlay in lat/lon from its control points (image px -> lat/lon), plus a margin in metres.
export function footprint(cps, W, H, marginM = 0){
  const lat0 = cps.reduce((s, p) => s + p.lat, 0) / cps.length, lon0 = cps.reduce((s, p) => s + p.lon, 0) / cps.length;
  const F = localFrame(lat0, lon0), A = fit(cps.map(p => { const [x, y] = F.toM(p.lat, p.lon); return { px: p.px, py: p.py, x, y }; }));
  const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([u, v]) => F.toLL(A[0]*u + A[1]*v + A[2], A[3]*u + A[4]*v + A[5]));
  const mLat = marginM / 111000, mLon = marginM / (111000 * Math.cos(lat0 * Math.PI / 180));
  return [Math.min(...corners.map(c => c[0])) - mLat, Math.min(...corners.map(c => c[1])) - mLon, Math.max(...corners.map(c => c[0])) + mLat, Math.max(...corners.map(c => c[1])) + mLon];
}

// cps: the 4 control points {px, py, lat, lon} (overlay px); W, H: overlay size; water: from analyseImage; lines: OSM outlines.
// Returns { ok, reason?, cps (new control points), before, after: { median, p90 } metres, shift, turn, scale }.
export function align(cps, W, H, water, lines){
  const lat0 = cps.reduce((s, p) => s + p.lat, 0) / cps.length, lon0 = cps.reduce((s, p) => s + p.lon, 0) / cps.length;
  const F = localFrame(lat0, lon0);
  const A = fit(cps.map(p => { const [x, y] = F.toM(p.lat, p.lon); return { px: p.px, py: p.py, x, y }; }));
  const det = A[0] * A[4] - A[1] * A[3], mPerPx = Math.sqrt(Math.abs(det));
  const toM = (u, v) => [A[0]*u + A[1]*v + A[2], A[3]*u + A[4]*v + A[5]];
  const toPx = (x, y) => { x -= A[2]; y -= A[5]; return [(A[4]*x - A[1]*y) / det, (-A[3]*x + A[0]*y) / det]; };
  const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([u, v]) => toM(u, v));
  const cx = (corners[0][0] + corners[3][0]) / 2, cy = (corners[0][1] + corners[3][1]) / 2;
  const Rm = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy))); // metres from centre to a corner

  // OSM shoreline grid in metres
  const ext = Rm + 1500, res = Math.max(3, 2 * ext / 1200), G = Math.ceil(2 * ext / res);
  const gx = x => (x - cx + ext) / res, gy = y => (cy + ext - y) / res;
  const shore = new Uint8Array(G * G), osmPts = [];
  const f = water.f, ws = water.w, hs = water.h;
  for (const line of lines){
    const P = line.map(([la, lo]) => F.toM(la, lo));
    for (let i = 1; i < P.length; i++){
      const [x0, y0] = P[i-1], [x1, y1] = P[i], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / (res / 2)));
      for (let k = 0; k <= n; k++){
        const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n, u = Math.round(gx(x)), v = Math.round(gy(y));
        if (u < 0 || v < 0 || u >= G || v >= G) continue;
        shore[v * G + u] = 1;
        const [pu, pv] = toPx(x, y); // OSM shoreline that falls on the picture is matched back to it
        if (pu >= 0 && pv >= 0 && pu <= W && pv <= H) osmPts.push(x, y);
      }
    }
  }
  if (!shore.some(Boolean)) return { ok: false, reason: 'OpenStreetMap shows no water here.' };
  const dtO = edt(shore, G, G);
  const osmD = (x, y) => sample(dtO, G, G, gx(x), gy(y)) * res;

  // keep the water patches that sit near OSM water now: drops insets, legends and colour look-alikes
  const T0 = STAGES[0], mapPts = [];
  for (const c of water.comps){
    const ds = []; for (let i = 0; i < c.edge.length; i += 2){ const [x, y] = toM(c.edge[i] / f, c.edge[i+1] / f); ds.push(osmD(x, y)); }
    if (median(ds) < T0 * 0.8) for (let i = 0; i < c.edge.length; i += 2) mapPts.push([c.edge[i] / f, c.edge[i+1] / f]);
  }
  if (mapPts.length < 40) return { ok: false, reason: 'The water on this map is not near OpenStreetMap water. Place it closer by hand first.' };
  const shoreM = new Uint8Array(ws * hs);
  for (const [u, v] of mapPts) shoreM[Math.round(v * f) * ws + Math.round(u * f)] = 1;
  const dtM = edt(shoreM, ws, hs);
  const MP = pick(mapPts, MAX_PTS), OP = [];
  for (let i = 0; i < osmPts.length; i += 2) OP.push([osmPts[i], osmPts[i+1]]);
  const OPs = pick(OP, MAX_PTS);
  const MPm = MP.map(([u, v]) => toM(u, v));

  // similarity about the centre: p' = c + [[1+a, -b], [b, 1+a]] (p - c) + t, with a, b scaled so all 4 params are metres
  const S = q => { const a = q[2] / Rm, b = q[3] / Rm; return { a: 1 + a, b, tx: q[0], ty: q[1] }; };
  const dists = q => {
    const { a, b, tx, ty } = S(q), s2 = a*a + b*b, sc = Math.sqrt(s2);
    const d1 = MPm.map(([x, y]) => { const X = x - cx, Y = y - cy; return osmD(cx + a*X - b*Y + tx, cy + b*X + a*Y + ty); });
    const d2 = OPs.length ? OPs.map(([x, y]) => { // invert the similarity, then to picture px
      const X = x - cx - tx, Y = y - cy - ty, [u, v] = toPx(cx + (a*X + b*Y) / s2, cy + (-b*X + a*Y) / s2);
      return sample(dtM, ws, hs, u * f, v * f) / f * mPerPx * sc; }) : [];
    return [d1, d2];
  };
  const cost = (q, T) => { const [d1, d2] = dists(q); let s1 = 0, s2 = 0; for (const d of d1) s1 += Math.min(d, T) ** 2; for (const d of d2) s2 += Math.min(d, T) ** 2; return s1 / d1.length + (d2.length ? s2 / d2.length : 0); };
  let q = [0, 0, 0, 0];
  for (const T of STAGES) q = nelderMead(x => cost(x, T), q, [T / 4, T / 4, T / 8, T / 8], 400).x;
  const T = STAGES[STAGES.length - 1], c0 = cost([0, 0, 0, 0], T), c1 = cost(q, T);
  const stat = qq => { const [d1] = dists(qq); return { median: median(d1), p90: pct(d1, 0.9) }; };
  const before = stat([0, 0, 0, 0]), after = stat(q), { a, b, tx, ty } = S(q);
  const scale = Math.hypot(a, b), turn = Math.atan2(b, a) * 180 / Math.PI, shift = Math.hypot(tx, ty);
  const sane = scale > 0.75 && scale < 1.33 && Math.abs(turn) < 25 && shift < Math.max(1500, Rm);
  if (!(c1 < c0 * 0.98 && after.median <= before.median) || !sane) return { ok: false, reason: 'Could not improve the placement from the water.', before, after };
  const move = (x, y) => { const X = x - cx, Y = y - cy; return [cx + a*X - b*Y + tx, cy + b*X + a*Y + ty]; };
  const out = cps.map(p => { const [x, y] = move(...toM(p.px, p.py)); const [lat, lon] = F.toLL(x, y); return { ...p, lat, lon }; });
  return { ok: true, cps: out, before, after, shift, turn, scale };
}
