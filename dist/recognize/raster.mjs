// Low-level raster operations for plan recognition. Everything works on flat typed
// arrays (row-major, width × height) so it runs fast inside a Web Worker without
// external libraries.

/** RGBA (alpha composited on white) -> 8-bit luminance. */
export function toGray(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const k = i * 4,
      alpha = rgba[k + 3] / 255;
    gray[i] = Math.round(
      (rgba[k] * 0.299 + rgba[k + 1] * 0.587 + rgba[k + 2] * 0.114) * alpha + 255 * (1 - alpha),
    );
  }
  return gray;
}

/** Bilinear resize of a grayscale image. */
export function resizeGray(src, w, h, nw, nh) {
  const out = new Uint8Array(nw * nh),
    sx = w / nw,
    sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5)),
      y0 = Math.floor(fy),
      y1 = Math.min(h - 1, y0 + 1),
      ty = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5)),
        x0 = Math.floor(fx),
        x1 = Math.min(w - 1, x0 + 1),
        tx = fx - x0,
        top = src[y0 * w + x0] * (1 - tx) + src[y0 * w + x1] * tx,
        bottom = src[y1 * w + x0] * (1 - tx) + src[y1 * w + x1] * tx;
      out[y * nw + x] = Math.round(top * (1 - ty) + bottom * ty);
    }
  }
  return out;
}

/** Shrink by an integer factor keeping the darkest pixel, so thin lines survive. */
export function minPool(src, w, h, f) {
  const nw = Math.ceil(w / f),
    nh = Math.ceil(h / f),
    out = new Uint8Array(nw * nh).fill(255);
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / f) * nw;
    for (let x = 0; x < w; x++) {
      const k = row + Math.floor(x / f),
        v = src[y * w + x];
      if (v < out[k]) out[k] = v;
    }
  }
  return { gray: out, width: nw, height: nh };
}

export function histogram(gray) {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  return hist;
}

/** Otsu threshold restricted to levels [lo, hi). */
export function otsu(hist, lo = 0, hi = 256) {
  let total = 0,
    sum = 0;
  for (let i = lo; i < hi; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  let best = -1,
    threshold = Math.round((lo + hi) / 2),
    weight = 0,
    acc = 0;
  for (let i = lo; i < hi - 1; i++) {
    weight += hist[i];
    acc += i * hist[i];
    if (!weight || weight === total) continue;
    const m0 = acc / weight,
      m1 = (sum - acc) / (total - weight),
      v = weight * (total - weight) * (m0 - m1) ** 2;
    if (v > best) {
      best = v;
      threshold = i + 1;
    }
  }
  return threshold;
}

/**
 * Paper level and the lightest "fill" level (floor tints are common in plans).
 * Ink is anything clearly darker than both.
 */
export function inkThreshold(hist, total) {
  let paper = 255;
  for (let i = 255, best = -1; i >= 128; i--)
    if (hist[i] > best) {
      best = hist[i];
      paper = i;
    }
  // Light modes below the paper that cover a meaningful share of the sheet (floor fills).
  let fill = paper;
  for (let i = paper - 6; i >= 150; i--) {
    let local = 0;
    for (let j = i - 2; j <= i + 2; j++) local += hist[j] || 0;
    if (local > total * 0.03) fill = Math.min(fill, i - 2);
  }
  return Math.max(60, Math.min(paper - 30, fill - 10));
}

export function threshold(gray, t) {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] < t ? 1 : 0;
  return out;
}

// --- Morphology (binary, rectangular structuring elements, separable) -----------

// Erosion keeps x if [x - r0, x + r1] is fully set; dilation is its exact adjoint,
// so open = dilate(erode) restores every stroke at least k pixels long.
const leftRadius = (k) => Math.floor((k - 1) / 2);

function erodeRows(src, w, h, k) {
  const out = new Uint8Array(src.length),
    r0 = leftRadius(k),
    r1 = k - 1 - r0,
    runEnd = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let run = 0;
    for (let x = 0; x < w; x++) {
      run = src[row + x] ? run + 1 : 0;
      runEnd[x] = run; // set pixels ending at x (inclusive)
    }
    let ahead = 0;
    for (let x = w - 1; x >= 0; x--) {
      ahead = src[row + x] ? ahead + 1 : 0; // set pixels starting at x (inclusive)
      if (ahead > r1 && runEnd[x] > r0) out[row + x] = 1;
    }
  }
  return out;
}

function dilateRows(src, w, h, k) {
  // x is set if some source pixel p has p - r0 <= x <= p + r1.
  const out = new Uint8Array(src.length),
    r0 = leftRadius(k),
    r1 = k - 1 - r0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let last = -1e9;
    for (let x = 0; x < w; x++) {
      if (src[row + x]) last = x;
      if (x - last <= r1) out[row + x] = 1;
    }
    let next = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (src[row + x]) next = x;
      if (next - x <= r0) out[row + x] = 1;
    }
  }
  return out;
}

export function transpose(src, w, h) {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + y] = src[y * w + x];
  return out;
}

export function erode(src, w, h, kx, ky = kx) {
  let out = kx > 1 ? erodeRows(src, w, h, kx) : src;
  if (ky > 1) out = transpose(erodeRows(transpose(out, w, h), h, w, ky), h, w);
  return out;
}

export function dilate(src, w, h, kx, ky = kx) {
  let out = kx > 1 ? dilateRows(src, w, h, kx) : src;
  if (ky > 1) out = transpose(dilateRows(transpose(out, w, h), h, w, ky), h, w);
  return out;
}

export const open = (src, w, h, kx, ky = kx) => dilate(erode(src, w, h, kx, ky), w, h, kx, ky);
export const close = (src, w, h, kx, ky = kx) => erode(dilate(src, w, h, kx, ky), w, h, kx, ky);

export function and(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] & b[i];
  return out;
}
export function andNot(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] && !b[i] ? 1 : 0;
  return out;
}

// --- Grayscale morphology ------------------------------------------------------

function extremeRows(src, w, h, k, pickMax) {
  const out = new Uint8Array(src.length),
    r = k >> 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = src[row + x];
      for (let d = Math.max(0, x - r); d <= Math.min(w - 1, x + r); d++) {
        const u = src[row + d];
        if (pickMax ? u > v : u < v) v = u;
      }
      out[row + x] = v;
    }
  }
  return out;
}

function grayFilter(src, w, h, k, pickMax) {
  const rows = extremeRows(src, w, h, k, pickMax);
  return transpose(extremeRows(transpose(rows, w, h), h, w, k, pickMax), h, w);
}

/**
 * Black-hat: how much darker each pixel is than its local background (grayscale
 * closing with a k×k square). Faint lines on a tinted floor score like dark lines
 * on white paper; flat fills score zero.
 */
export function blackHat(gray, w, h, k) {
  const closed = grayFilter(grayFilter(gray, w, h, k, true), w, h, k, false),
    out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = closed[i] - gray[i];
  return out;
}

// --- Distance transform (exact Euclidean, Felzenszwalb & Huttenlocher) ----------

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      const p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k] && k > 0) k--;
      else break;
    }
    if (s <= z[k]) {
      // k === 0 and the new parabola dominates
      v[0] = q;
      z[0] = -Infinity;
      z[1] = Infinity;
      continue;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

/** Distance (pixels) from each set pixel to the nearest unset pixel. */
export function distanceTransform(mask, w, h) {
  const INF = 1e20,
    n = Math.max(w, h),
    f = new Float64Array(n),
    d = new Float64Array(n),
    v = new Int32Array(n),
    z = new Float64Array(n + 1),
    out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? INF : 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = out[row + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[row + x] = Math.sqrt(d[x]);
  }
  return out;
}

/**
 * Stroke-width histogram from distance-transform ridges. Index = stroke width in
 * pixels (2·d − 1 rounded); value = number of ridge pixels, i.e. stroke length.
 */
export function strokeWidths(dist, w, h, maxWidth = 160) {
  const hist = new Float64Array(maxWidth + 1);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x,
        d = dist[k];
      if (d < 0.9) continue;
      if (
        d < dist[k - 1] ||
        d < dist[k + 1] ||
        d < dist[k - w] ||
        d < dist[k + w] ||
        d < dist[k - w - 1] ||
        d < dist[k - w + 1] ||
        d < dist[k + w - 1] ||
        d < dist[k + w + 1]
      )
        continue;
      const width = Math.min(maxWidth, Math.max(1, Math.round(2 * d - 1)));
      hist[width]++;
    }
  return hist;
}

/** Fraction of set pixels in an axis-aligned rectangle (clipped to the image). */
export function coverage(mask, w, h, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w - 1, Math.ceil(x1));
  y1 = Math.min(h - 1, Math.ceil(y1));
  if (x1 < x0 || y1 < y0) return 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) n += mask[y * w + x];
  return n / ((x1 - x0 + 1) * (y1 - y0 + 1));
}

export function at(mask, w, h, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  return x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0;
}
