// 在瀏覽器裡跑：產生「做到一半」的假截圖（有貓、有白色 ×），檢查辨識結果
window.runDetectTest = function ({ catScale = 0.75, xWidth = 0.09, gap = 0, bg = '#f5efe6', trials = 6, pal: palOpt } = {}) {
  const pal = palOpt || ['#e57373', '#ffb74d', '#fff176', '#81c784', '#4fc3f7', '#9575cd', '#f06292', '#a1887f', '#90a4ae', '#aed581'];
  const out = [];
  for (let t = 0; t < trials; t++) {
    const n = 5 + (t % 4);
    const colors = MeowSolver.generate(n, 1000 + t);
    const sol = MeowSolver.search(MeowSolver.buildBoard(colors), new Int8Array(n * n), 1)[0];
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 2000;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 2000);
    const bx = 60, by = 500, bs = 960, cs = bs / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      ctx.fillStyle = pal[colors[r][c]];
      ctx.fillRect(bx + c * cs + gap, by + r * cs + gap, cs - 2 * gap, cs - 2 * gap);
    }
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(bx + i * cs, by); ctx.lineTo(bx + i * cs, by + bs); ctx.moveTo(bx, by + i * cs); ctx.lineTo(bx + bs, by + i * cs); ctx.stroke(); }
    // 一半的貓、大約 60% 的空格畫白色 ×
    const mark = {};
    const rnd = ((s) => () => ((s = (s * 16807) % 2147483647) / 2147483647))(77 + t);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c, x = bx + (c + 0.5) * cs, y = by + (r + 0.5) * cs;
      if (sol.includes(i) && rnd() < 0.6) {
        ctx.font = `${Math.round(cs * catScale)}px "Segoe UI Emoji", sans-serif`;
        ctx.fillText('🐱', x, y + cs * 0.04); mark[i] = 'cat';
      } else if (!sol.includes(i) && rnd() < 0.6) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = cs * xWidth; ctx.lineCap = 'round';
        const d = cs * 0.3;
        mark[i] = 'x'; ctx.beginPath(); ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d); ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d); ctx.stroke();
      }
    }
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const box = MeowDetect.detectBoard(img);
    const N = MeowDetect.detectN(img, box).n;
    let wrong = null;
    if (N === n) {
      const rc = MeowDetect.readColors(img, box, n).colors;
      // 以多數決對應顏色編號，計算錯格數
      const vote = {};
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const k = colors[r][c] + ',' + rc[r][c]; vote[k] = (vote[k] || 0) + 1; }
      const map = {};
      Object.entries(vote).sort((a, b) => b[1] - a[1]).forEach(([k]) => { const [a, b] = k.split(','); if (map[a] === undefined && !Object.values(map).includes(b)) map[a] = b; });
      const w = { cat: 0, x: 0, none: 0 };
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (map[colors[r][c]] !== String(rc[r][c])) w[mark[r * n + c] || 'none']++;
      wrong = w.cat + w.x + w.none ? `${w.cat + w.x + w.none}(貓${w.cat}/×${w.x}/空${w.none})` : 0;
    }
    out.push(`${n}x${n}: N=${N}${N === n ? '' : ' ✗'} 錯格=${wrong}`);
    if (t === 0) window.__halfCanvas = cv;
  }
  return out.join(' | ');
};
