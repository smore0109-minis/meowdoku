/*
 * MeowDoku 解題核心
 *
 * 規則：
 *   1. 貓的周圍八格不會有其他貓
 *   2. 每種顏色裡恰好一隻貓
 *   3. 每個橫列 / 直行恰好一隻貓
 *
 * solve(colors, opts) 會回傳一連串「人類看得懂」的推理步驟。
 * 同時可在瀏覽器 (window.MeowSolver) 與 Node (module.exports) 使用。
 */
(function (global) {
  'use strict';

  const CAND = 0, X = 1, CAT = 2;

  const DEFAULT_CSS = [
    '#f28b82', '#fbbc04', '#fff475', '#ccff90', '#a7ffeb', '#aecbfa', '#d7aefb', '#fdcfe8',
    '#e6c9a8', '#cbf0f8', '#b0bec5', '#ffab91', '#80cbc4', '#9fa8da', '#c5e1a5', '#ffe082',
  ];

  // ---------------------------------------------------------------- 盤面結構

  function buildBoard(colors) {
    const N = colors.length;
    const size = N * N;
    const color = new Int16Array(size);
    for (let r = 0; r < N; r++) {
      if (colors[r].length !== N) throw new Error('盤面必須是 N×N');
      for (let c = 0; c < N; c++) color[r * N + c] = colors[r][c];
    }
    let K = 0;
    for (let i = 0; i < size; i++) K = Math.max(K, color[i] + 1);

    const regions = [];
    for (let k = 0; k < K; k++) regions.push({ id: regions.length, type: 'color', idx: k, cells: [] });
    for (let r = 0; r < N; r++) regions.push({ id: regions.length, type: 'row', idx: r, cells: [] });
    for (let c = 0; c < N; c++) regions.push({ id: regions.length, type: 'col', idx: c, cells: [] });

    const regOf = [];
    for (let i = 0; i < size; i++) {
      const r = (i / N) | 0, c = i % N;
      const ids = { color: color[i], row: K + r, col: K + N + c };
      regions[ids.color].cells.push(i);
      regions[ids.row].cells.push(i);
      regions[ids.col].cells.push(i);
      regOf.push(ids);
    }

    // conflict[i][j] = 1 表示 i 放貓後 j 就不能放貓
    const conflict = [];
    const zone = [];
    for (let i = 0; i < size; i++) {
      const ri = (i / N) | 0, ci = i % N;
      const row = new Uint8Array(size);
      const list = [];
      for (let j = 0; j < size; j++) {
        if (j === i) continue;
        const rj = (j / N) | 0, cj = j % N;
        if (ri === rj || ci === cj || color[i] === color[j] ||
            (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1)) {
          row[j] = 1;
          list.push(j);
        }
      }
      conflict.push(row);
      zone.push(list);
    }
    return { N, K, size, color, regions, regOf, conflict, zone };
  }

  function validateColors(colors) {
    const N = colors.length;
    if (N < 2) return '盤面太小';
    const used = new Array(N).fill(0);
    for (const row of colors) {
      if (row.length !== N) return '盤面必須是 N×N';
      for (const k of row) {
        if (!(k >= 0 && k < N)) return `顏色編號 ${k} 超出範圍（共 ${N} 種顏色）`;
        used[k]++;
      }
    }
    const missing = used.map((n, k) => (n ? -1 : k)).filter((k) => k >= 0);
    if (missing.length) return `有 ${missing.length} 種顏色沒有出現在盤面上，${N}×${N} 的盤面需要剛好 ${N} 種顏色`;
    return null;
  }

  const cands = (st, R) => R.cells.filter((i) => st[i] === CAND);
  const hasCat = (st, R) => R.cells.some((i) => st[i] === CAT);

  function placeCat(B, st, i) {
    st[i] = CAT;
    const elim = [];
    for (const j of B.zone[i]) if (st[j] === CAND) { st[j] = X; elim.push(j); }
    return elim;
  }

  function findEmptyRegion(B, st) {
    for (const R of B.regions) if (!hasCat(st, R) && cands(st, R).length === 0) return R;
    return null;
  }

  function findSingleRaw(B, st) {
    for (const R of B.regions) {
      if (hasCat(st, R)) continue;
      const cs = cands(st, R);
      if (cs.length === 1) return { R, cell: cs[0] };
    }
    return null;
  }

  const countCats = (st) => st.reduce((n, v) => n + (v === CAT), 0);

  // ---------------------------------------------------------------- 暴力搜尋（檢查唯一解 / 最後手段）

  function search(B, st, limit) {
    const N = B.N;
    const sols = [];
    const colUsed = new Uint8Array(N);
    const colorUsed = new Uint8Array(B.K);
    const pick = new Int16Array(N);
    const fixed = new Int16Array(N).fill(-1);
    for (let i = 0; i < B.size; i++) if (st[i] === CAT) fixed[(i / N) | 0] = i % N;

    (function rec(r, prev) {
      if (r === N) { sols.push(Array.from(pick, (c, rr) => rr * N + c)); return sols.length >= limit; }
      for (let c = 0; c < N; c++) {
        if (fixed[r] >= 0 && c !== fixed[r]) continue;
        const i = r * N + c;
        if (st[i] === X || colUsed[c] || colorUsed[B.color[i]]) continue;
        if (prev >= 0 && Math.abs(c - prev) <= 1) continue;
        colUsed[c] = 1; colorUsed[B.color[i]] = 1; pick[r] = c;
        const stop = rec(r + 1, c);
        colUsed[c] = 0; colorUsed[B.color[i]] = 0;
        if (stop) return true;
      }
      return false;
    })(0, -1);
    return sols;
  }

  // ---------------------------------------------------------------- 文字格式

  function makeFmt(B, opts) {
    const names = opts.colorNames || [];
    const css = opts.colorCss || [];
    const N = B.N;
    const colorName = (k) => names[k] || `顏色${k + 1}`;
    const colorCss = (k) => css[k] || DEFAULT_CSS[k % DEFAULT_CSS.length];
    const cellName = (i) => `R${((i / N) | 0) + 1}C${(i % N) + 1}`;
    const F = {
      cell: (i) => `<b class="ref" data-cells="${i}">${cellName(i)}</b>`,
      cells(list) {
        const sorted = Array.from(list).sort((a, b) => a - b);
        return sorted.map(F.cell).join('、');
      },
      region(R) {
        const data = `data-cells="${R.cells.join(',')}"`;
        if (R.type === 'color') {
          return `<b class="ref" ${data}><span class="sw" style="background:${colorCss(R.idx)}"></span>${colorName(R.idx)}區</b>`;
        }
        if (R.type === 'row') return `<b class="ref" ${data}>橫列 ${R.idx + 1}</b>`;
        return `<b class="ref" ${data}>直行 ${R.idx + 1}</b>`;
      },
      regions: (list) => list.map(F.region).join('、'),
      plainCell: cellName,
    };
    return F;
  }

  const elimSentence = (n) =>
    n ? `<br>放貓後，和它同橫列、同直行、同顏色或相鄰（九宮格）的 ${n} 個格子都不可能再有貓，全部排除。` : '';

  // ---------------------------------------------------------------- 推理規則

  // 規則 1：某區域只剩一格
  function ruleSingle(B, st, F) {
    const hit = findSingleRaw(B, st);
    if (!hit) return null;
    const { R, cell } = hit;
    const tmp = st.slice();
    const elim = placeCat(B, tmp, cell);
    return {
      kind: 'single',
      title: '唯一位置',
      html: `${F.region(R)} 只剩下 ${F.cell(cell)} 這一格可以放貓，所以這裡一定是貓 🐱。${elimSentence(elim.length)}`,
      place: [cell],
      focus: R.cells.slice(),
    };
  }

  // 規則 2：k 個 A 型區域的候選格全部落在 k 個 B 型區域內
  const PAIRS = [
    ['color', 'row'], ['color', 'col'], ['row', 'color'], ['col', 'color'], ['row', 'col'], ['col', 'row'],
  ];

  function ruleConfine(B, st, F, kMin, kMax) {
    const unsolved = {};
    for (const t of ['color', 'row', 'col']) {
      unsolved[t] = B.regions.filter((R) => R.type === t && !hasCat(st, R));
    }
    for (let k = kMin; k <= kMax; k++) {
      for (const [ta, tb] of PAIRS) {
        const As = unsolved[ta];
        if (k >= As.length) continue;
        const combo = [];
        let found = null;
        const rec = (start, bset) => {
          if (combo.length === k) {
            if (bset.size !== k) return false;
            const inCombo = new Set(combo.map((R) => R.id));
            const elim = [];
            for (const bid of bset) {
              for (const i of B.regions[bid].cells) {
                if (st[i] === CAND && !inCombo.has(B.regOf[i][ta])) elim.push(i);
              }
            }
            if (!elim.length) return false;
            found = { As: combo.slice(), Bs: Array.from(bset).sort((a, b) => a - b).map((id) => B.regions[id]), elim };
            return true;
          }
          for (let a = start; a < As.length; a++) {
            const next = new Set(bset);
            for (const i of cands(st, As[a])) next.add(B.regOf[i][tb]);
            if (next.size > k) continue;
            combo.push(As[a]);
            if (rec(a + 1, next)) return true;
            combo.pop();
          }
          return false;
        };
        rec(0, new Set());
        if (found) return confineStep(F, st, found, k);
      }
    }
    return null;
  }

  function confineStep(F, st, { As, Bs, elim }, k) {
    const focus = [];
    for (const A of As) for (const i of A.cells) if (st[i] === CAND) focus.push(i);
    let html;
    if (k === 1) {
      const A = As[0], Bk = Bs[0];
      html = `${F.region(A)} 剩下的候選格（${F.cells(focus)}）全部都在 ${F.region(Bk)} 裡。` +
        `<br>${F.region(A)} 一定要有一隻貓，而 ${F.region(Bk)} 只能有一隻貓 → ${F.region(Bk)} 的那隻貓一定屬於 ${F.region(A)}。` +
        `<br>所以 ${F.region(Bk)} 裡其他格子都不能放貓：排除 ${F.cells(elim)}。`;
    } else {
      html = `${F.regions(As)} 這 ${k} 個區域剩下的候選格，全部落在 ${F.regions(Bs)} 這 ${k} 個區域裡。` +
        `<br>前者總共需要 ${k} 隻貓，而後者最多也只能放 ${k} 隻 → ${F.regions(Bs)} 的貓全部被前面那 ${k} 個區域用掉了。` +
        `<br>所以 ${F.regions(Bs)} 裡其他格子都不能放貓：排除 ${F.cells(elim)}。`;
    }
    return {
      kind: 'confine',
      title: k === 1 ? '區域鎖定' : `${k} 區聯合鎖定`,
      html,
      elim,
      focus,
    };
  }

  // 規則 3：某格放貓會讓另一個區域完全沒有位置
  function ruleWouldEmpty(B, st, F) {
    const regs = B.regions
      .filter((R) => !hasCat(st, R))
      .map((R) => ({ R, cs: cands(st, R) }))
      .sort((a, b) => a.cs.length - b.cs.length);
    for (const { R, cs } of regs) {
      const inR = new Set(R.cells);
      const hits = [];
      for (let i = 0; i < B.size; i++) {
        if (st[i] !== CAND || inR.has(i)) continue;
        if (cs.every((j) => B.conflict[i][j])) hits.push(i);
      }
      if (!hits.length) continue;
      const one = hits.length === 1;
      return {
        kind: 'block',
        title: '牽連排除',
        html: `${F.region(R)} 目前只剩 ${F.cells(cs)} 可以放貓。` +
          `<br>如果在 ${F.cells(hits)} ${one ? '' : '其中任何一格'}放貓，會因為同橫列 / 同直行 / 同顏色 / 相鄰，` +
          `把 ${F.region(R)} 剩下的候選格一次全部排除，${F.region(R)} 就沒有貓了，不合規則。` +
          `<br>所以 ${F.cells(hits)} 不能放貓，排除。`,
        elim: hits,
        focus: cs,
      };
    }
    return null;
  }

  // 規則 4：假設法（只用「唯一位置」往下推，找矛盾）
  function trySingles(B, st0, i0) {
    const st = st0.slice();
    const chain = [{ cell: i0, R: null }];
    placeCat(B, st, i0);
    for (let guard = 0; guard < B.size; guard++) {
      const bad = findEmptyRegion(B, st);
      if (bad) return { bad, chain };
      const s = findSingleRaw(B, st);
      if (!s) return null;
      placeCat(B, st, s.cell);
      chain.push(s);
    }
    return null;
  }

  function ruleTrial(B, st, F) {
    let best = null;
    for (let i = 0; i < B.size; i++) {
      if (st[i] !== CAND) continue;
      const res = trySingles(B, st, i);
      if (res && (!best || res.chain.length < best.chain.length)) best = res;
    }
    if (!best) return null;
    const i0 = best.chain[0].cell;
    const lines = [`先把 ${F.cell(i0)} 當成貓，排除它牽連到的格子`];
    for (const s of best.chain.slice(1)) {
      lines.push(`→ ${F.region(s.R)} 只剩 ${F.cell(s.cell)}，必須放貓`);
    }
    lines.push(`→ 結果 ${F.region(best.bad)} 已經沒有任何格子可以放貓，<b>矛盾！</b>`);
    return {
      kind: 'trial',
      title: '假設法',
      html: `假設 ${F.cell(i0)} 有貓：<ol>${lines.map((l) => `<li>${l}</li>`).join('')}</ol>所以 ${F.cell(i0)} 不能放貓，排除。`,
      elim: [i0],
      focus: best.chain.map((s) => s.cell).concat(best.bad.cells.filter((j) => st[j] === CAND)),
    };
  }

  // 規則 5：更深的假設法（假設後用所有規則推，直到矛盾）
  function propagateAll(B, st) {
    const noFmt = makeFmt(B, {});
    for (let guard = 0; guard < 4 * B.size; guard++) {
      if (findEmptyRegion(B, st)) return false;
      if (countCats(st) === B.N) return true;
      const s = ruleSingle(B, st, noFmt) || ruleConfine(B, st, noFmt, 1, B.N - 1) || ruleWouldEmpty(B, st, noFmt);
      if (!s) return null;
      applyStep(B, st, s);
    }
    return null;
  }

  function ruleDeepTrial(B, st, F) {
    for (let i = 0; i < B.size; i++) {
      if (st[i] !== CAND) continue;
      const tmp = st.slice();
      placeCat(B, tmp, i);
      if (propagateAll(B, tmp) === false) {
        return {
          kind: 'trial',
          title: '深度假設',
          html: `假設 ${F.cell(i)} 有貓，再用前面的各種技巧（唯一位置、區域鎖定、牽連排除）一路推下去，` +
            `最後會出現某個區域沒有任何格子能放貓的矛盾。<br>所以 ${F.cell(i)} 不能放貓，排除。`,
          elim: [i],
          focus: [i],
        };
      }
    }
    return null;
  }

  function applyStep(B, st, step) {
    for (const i of step.place || []) placeCat(B, st, i);
    for (const i of step.elim || []) if (st[i] === CAND) st[i] = X;
  }

  // ---------------------------------------------------------------- 主流程

  function solve(colors, opts = {}) {
    const err = validateColors(colors);
    if (err) return { ok: false, error: err, steps: [] };

    const B = buildBoard(colors);
    const F = makeFmt(B, opts);
    const st = new Int8Array(B.size);
    const steps = [];

    const sols = search(B, st, 2);
    if (sols.length === 0) {
      return { ok: false, error: '這個盤面無解，可能是顏色辨識錯誤，請檢查並修正格子顏色。', steps };
    }
    const unique = sols.length === 1;

    steps.push({
      kind: 'start', title: '初始盤面',
      html: `${B.N}×${B.N} 的盤面，共 ${B.N} 種顏色，要找出 ${B.N} 隻貓。` +
        (unique ? '' : '<br>⚠️ 注意：這個盤面有不只一組解，可能是顏色辨識有誤，最後可能需要用猜的。'),
      state: st.slice(), prev: st.slice(),
    });

    for (let guard = 0; guard < 4 * B.size && countCats(st) < B.N; guard++) {
      const step =
        ruleSingle(B, st, F) ||
        ruleConfine(B, st, F, 1, 1) ||
        ruleWouldEmpty(B, st, F) ||
        ruleConfine(B, st, F, 2, B.N - 1) ||
        ruleTrial(B, st, F) ||
        ruleDeepTrial(B, st, F) ||
        guessStep(B, st, F);
      if (!step) break;
      const prev = st.slice();
      applyStep(B, st, step);
      step.prev = prev;
      step.state = st.slice();
      steps.push(step);
      if (findEmptyRegion(B, st)) {
        steps.push({ kind: 'error', title: '矛盾', html: '推理出現矛盾，請檢查盤面顏色是否正確。', state: st.slice(), prev: st.slice() });
        return { ok: false, error: '推理出現矛盾', steps, unique };
      }
    }

    const solved = countCats(st) === B.N;
    if (solved) {
      const cats = [];
      for (let i = 0; i < B.size; i++) if (st[i] === CAT) cats.push(i);
      steps.push({
        kind: 'done', title: '完成！',
        html: `${B.N} 隻貓都找到了：${F.cells(cats)} 🎉`,
        state: st.slice(), prev: st.slice(), focus: cats,
      });
    }
    return { ok: solved, unique, steps, error: solved ? null : '無法解出' };
  }

  function guessStep(B, st, F) {
    const sols = search(B, st, 1);
    if (!sols.length) return null;
    const place = sols[0].filter((i) => st[i] !== CAT);
    return {
      kind: 'guess',
      title: '電腦搜尋',
      html: `到這裡已經無法用邏輯推理繼續（盤面可能不只一組解）。以下由電腦搜尋出一組可行解：${F.cells(place)}。`,
      place,
      focus: place,
    };
  }

  // ---------------------------------------------------------------- 隨機出題（示範用）

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(N, seed = Date.now()) {
    const rnd = mulberry32(seed);
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    for (let attempt = 0; attempt < 2000; attempt++) {
      // 1. 隨機擺貓
      const pos = new Array(N).fill(-1);
      const used = new Uint8Array(N);
      const place = (r) => {
        if (r === N) return true;
        for (const c of shuffle([...Array(N).keys()])) {
          if (used[c] || (r > 0 && Math.abs(c - pos[r - 1]) <= 1)) continue;
          used[c] = 1; pos[r] = c;
          if (place(r + 1)) return true;
          used[c] = 0;
        }
        return false;
      };
      if (!place(0)) continue;
      // 2. 從每隻貓長出顏色區域
      const colors = Array.from({ length: N }, () => new Array(N).fill(-1));
      const frontier = [];
      const order = shuffle([...Array(N).keys()]);
      for (let r = 0; r < N; r++) { colors[r][pos[r]] = order[r]; frontier.push([r, pos[r]]); }
      let left = N * N - N;
      while (left > 0) {
        const f = (rnd() * frontier.length) | 0;
        const [r, c] = frontier[f];
        const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < N && x >= 0 && x < N && colors[y][x] < 0);
        if (!nb.length) { frontier.splice(f, 1); continue; }
        const [y, x] = nb[(rnd() * nb.length) | 0];
        colors[y][x] = colors[r][c];
        frontier.push([y, x]);
        left--;
      }
      const B = buildBoard(colors);
      if (search(B, new Int8Array(B.size), 2).length === 1) return colors;
    }
    return null;
  }

  const api = { solve, generate, validateColors, buildBoard, search, CAND, X, CAT, DEFAULT_CSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.MeowSolver = api;
})(typeof window !== 'undefined' ? window : globalThis);
