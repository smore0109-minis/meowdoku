/*
 * 從截圖辨識 MeowDoku 盤面
 *   detectBoard(img)          → 盤面外框 {x,y,w,h}
 *   detectN(img, box)         → 格數 N
 *   readColors(img, box, N)   → { colors: N×N 顏色編號, palette: [{rgb, css, name}] }
 * img 是 canvas 的 ImageData。
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 找盤面外框

  function detectBoard(img) {
    const { width: W, height: H, data } = img;
    const ds = Math.max(1, Math.ceil(Math.max(W, H) / 320));
    const w = Math.floor(W / ds), h = Math.floor(H / ds);
    const small = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < ds; dy++) {
          for (let dx = 0; dx < ds; dx++) {
            const p = ((y * ds + dy) * W + (x * ds + dx)) * 4;
            r += data[p]; g += data[p + 1]; b += data[p + 2];
          }
        }
        const n = ds * ds, q = (y * w + x) * 3;
        small[q] = r / n; small[q + 1] = g / n; small[q + 2] = b / n;
      }
    }

    // 背景色 = 圖片邊緣最常見的顏色
    const hist = new Map();
    const addBorder = (x, y) => {
      const q = (y * w + x) * 3;
      const key = ((small[q] >> 4) << 8) | ((small[q + 1] >> 4) << 4) | (small[q + 2] >> 4);
      hist.set(key, (hist.get(key) || 0) + 1);
    };
    for (let x = 0; x < w; x++) { addBorder(x, 0); addBorder(x, h - 1); }
    for (let y = 0; y < h; y++) { addBorder(0, y); addBorder(w - 1, y); }
    let bgKey = 0, best = -1;
    for (const [k, v] of hist) if (v > best) { best = v; bgKey = k; }
    const bg = [((bgKey >> 8) & 15) * 16 + 8, ((bgKey >> 4) & 15) * 16 + 8, (bgKey & 15) * 16 + 8];

    // 非背景遮罩，再膨脹一點以連接格子之間的縫
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const dr = small[i * 3] - bg[0], dg = small[i * 3 + 1] - bg[1], db = small[i * 3 + 2] - bg[2];
      mask[i] = dr * dr + dg * dg + db * db > 40 * 40 ? 1 : 0;
    }
    const rad = Math.max(1, Math.round(Math.min(w, h) * 0.008));
    const dil = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        for (let dy = -rad; dy <= rad; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -rad; dx <= rad; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            dil[yy * w + xx] = 1;
          }
        }
      }
    }

    // 最大的連通區塊（以原始遮罩像素數量計分，偏好接近正方形）
    const label = new Int32Array(w * h).fill(-1);
    let bestBox = null, bestScore = -1;
    const stack = [];
    for (let s = 0; s < w * h; s++) {
      if (!dil[s] || label[s] >= 0) continue;
      let x0 = w, y0 = h, x1 = 0, y1 = 0, cnt = 0;
      stack.push(s); label[s] = s;
      while (stack.length) {
        const p = stack.pop();
        const x = p % w, y = (p / w) | 0;
        cnt += mask[p];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const nb = [p - 1, p + 1, p - w, p + w];
        if (x === 0) nb[0] = -1; if (x === w - 1) nb[1] = -1;
        for (const q of nb) if (q >= 0 && q < w * h && dil[q] && label[q] < 0) { label[q] = s; stack.push(q); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const square = Math.min(bw, bh) / Math.max(bw, bh);
      const score = cnt * (0.3 + square);
      if (score > bestScore) { bestScore = score; bestBox = { x0, y0, x1, y1 }; }
    }
    if (!bestBox) return { x: 0, y: 0, w: W, h: H };
    // 扣掉膨脹造成的外擴
    const x = Math.max(0, (bestBox.x0 + rad) * ds);
    const y = Math.max(0, (bestBox.y0 + rad) * ds);
    const x2 = Math.min(W, (bestBox.x1 - rad + 1) * ds);
    const y2 = Math.min(H, (bestBox.y1 - rad + 1) * ds);
    return { x, y, w: x2 - x, h: y2 - y };
  }

  // ---------------------------------------------------------------- 判斷格數

  function profiles(img, box) {
    const { width: W, data } = img;
    const bx = Math.round(box.x), by = Math.round(box.y), bw = Math.round(box.w), bh = Math.round(box.h);
    const px = new Float32Array(bw), py = new Float32Array(bh);
    const at = (x, y) => (y * W + x) * 4;
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const p = at(x, y);
        if (x > bx) {
          const q = at(x - 1, y);
          px[x - bx] += Math.abs(data[p] - data[q]) + Math.abs(data[p + 1] - data[q + 1]) + Math.abs(data[p + 2] - data[q + 2]);
        }
        if (y > by) {
          const q = at(x, y - 1);
          py[y - by] += Math.abs(data[p] - data[q]) + Math.abs(data[p + 1] - data[q + 1]) + Math.abs(data[p + 2] - data[q + 2]);
        }
      }
    }
    return { px, py };
  }

  function gridScore(P, n) {
    const L = P.length, step = L / n;
    const r = Math.max(1, Math.round(step * 0.06));
    let mean = 0;
    for (let i = 0; i < L; i++) mean += P[i];
    mean = mean / L + 1e-6;
    const maxAround = (pos) => {
      let m = 0;
      for (let x = Math.max(0, Math.round(pos) - r); x <= Math.min(L - 1, Math.round(pos) + r); x++) m = Math.max(m, P[x]);
      return m;
    };
    let line = 0, mid = 0;
    for (let i = 1; i < n; i++) line += maxAround(i * step);
    for (let i = 0; i < n; i++) mid += maxAround((i + 0.5) * step);
    return (line / (n - 1) - mid / n) / mean;
  }

  function detectN(img, box, minN = 4, maxN = 16) {
    const { px, py } = profiles(img, box);
    let bestN = minN, best = -Infinity;
    const scores = {};
    for (let n = minN; n <= maxN; n++) {
      if (box.w / n < 6 || box.h / n < 6) break;
      const s = gridScore(px, n) + gridScore(py, n);
      scores[n] = s;
      if (s > best) { best = s; bestN = n; }
    }
    return { n: bestN, scores };
  }

  // ---------------------------------------------------------------- 顏色

  function rgb2lab([r, g, b]) {
    const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
    const R = f(r), G = f(g), Bl = f(b);
    let x = (R * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047;
    let y = R * 0.2126 + G * 0.7152 + Bl * 0.0722;
    let z = (R * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
    const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    x = t(x); y = t(y); z = t(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  function sampleCells(img, box, n) {
    const { width: W, data } = img;
    const out = [];
    const cw = box.w / n, ch = box.h / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x0 = Math.round(box.x + (c + 0.28) * cw), x1 = Math.round(box.x + (c + 0.72) * cw);
        const y0 = Math.round(box.y + (r + 0.28) * ch), y1 = Math.round(box.y + (r + 0.72) * ch);
        const R = [], G = [], B = [];
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const p = (y * W + x) * 4;
            R.push(data[p]); G.push(data[p + 1]); B.push(data[p + 2]);
          }
        }
        const med = (a) => { a.sort((u, v) => u - v); return a[a.length >> 1] || 0; };
        out.push([med(R), med(G), med(B)]);
      }
    }
    return out;
  }

  // 聚合式分群，直到剩下 k 群
  function cluster(labs, k) {
    let groups = labs.map((l, i) => ({ sum: l.slice(), n: 1, members: [i] }));
    const cen = (g) => [g.sum[0] / g.n, g.sum[1] / g.n, g.sum[2] / g.n];
    while (groups.length > k) {
      let bi = 0, bj = 1, bd = Infinity;
      const cs = groups.map(cen);
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const d = dist2(cs[i], cs[j]);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
      }
      const a = groups[bi], b = groups[bj];
      a.sum = a.sum.map((v, t) => v + b.sum[t]); a.n += b.n; a.members = a.members.concat(b.members);
      groups.splice(bj, 1);
    }
    return groups;
  }

  function hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h;
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function baseName(rgb) {
    const [h, s, l] = hsl(rgb);
    if (s < 0.12 || l > 0.95) return l > 0.85 ? '白' : l < 0.2 ? '黑' : '灰';
    if (l < 0.12) return '黑';
    if (h < 12 || h >= 345) return l > 0.75 ? '粉' : '紅';
    if (h < 42) return l < 0.42 ? '棕' : '橙';
    if (h < 66) return '黃';
    if (h < 90) return '黃綠';
    if (h < 160) return '綠';
    if (h < 195) return '青';
    if (h < 255) return '藍';
    if (h < 290) return '紫';
    return l < 0.45 ? '紫紅' : '粉';
  }

  function nameColors(rgbs) {
    const base = rgbs.map(baseName);
    const names = base.slice();
    const groups = {};
    base.forEach((b, i) => (groups[b] = groups[b] || []).push(i));
    for (const [b, idx] of Object.entries(groups)) {
      if (idx.length === 1) continue;
      idx.sort((i, j) => hsl(rgbs[j])[2] - hsl(rgbs[i])[2]); // 亮 → 暗
      if (idx.length === 2) { names[idx[0]] = '淺' + b; names[idx[1]] = '深' + b; }
      else idx.forEach((i, t) => (names[i] = b + (t + 1)));
    }
    return names.map((n) => n + '色');
  }

  const toCss = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;

  function readColors(img, box, n) {
    const rgbs = sampleCells(img, box, n);
    const labs = rgbs.map(rgb2lab);
    const groups = cluster(labs, n);
    // 依照第一次出現的位置排序，讓編號穩定（左上 → 右下）
    groups.sort((a, b) => Math.min(...a.members) - Math.min(...b.members));
    const colors = Array.from({ length: n }, () => new Array(n).fill(0));
    const palette = groups.map((g, k) => {
      const avg = [0, 1, 2].map((t) => g.members.reduce((s, i) => s + rgbs[i][t], 0) / g.members.length);
      for (const i of g.members) colors[(i / n) | 0][i % n] = k;
      return { rgb: avg };
    });
    const names = nameColors(palette.map((p) => p.rgb));
    palette.forEach((p, k) => { p.css = toCss(p.rgb); p.name = names[k]; });

    // 可信度：群內最大差異 vs 群間最小差異
    let intra = 0, inter = Infinity;
    const cLab = palette.map((p) => rgb2lab(p.rgb));
    labs.forEach((l, i) => { intra = Math.max(intra, Math.sqrt(dist2(l, cLab[colors[(i / n) | 0][i % n]]))); });
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) inter = Math.min(inter, Math.sqrt(dist2(cLab[a], cLab[b])));
    return { colors, palette, confident: inter > 2.5 * intra && inter > 8, intra, inter };
  }

  global.MeowDetect = { detectBoard, detectN, readColors, nameColors, toCss };
})(typeof window !== 'undefined' ? window : globalThis);
