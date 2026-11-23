/**
 * THE WORLD — front page for Sunday 22 November 2026.
 *
 * Standalone: `node main.ts` writes /output/entry.png.
 * No dependencies, no network, no Date/Math.random: every run is byte-identical.
 *
 *   raster:   flat RGBA byte buffer, opaque, alpha-composited by hand
 *   type:     hand-drawn 5x7 bitmap font, proportional advance, drawn as pixel squares
 *   png:      IHDR + IDAT (zlib.deflateSync) + IEND with a table-driven CRC32
 *
 * Page grid: 1520 x 2165. Lead package occupies exactly 60% of the page height.
 */

import * as fs from "node:fs";
import * as zlib from "node:zlib";

/* ============================================================ 1. geometry == */

const W = 1520;
const M = 56;                                 // page margin
const CONTENT = W - 2 * M;                    // 1408

const GUT = 40;                               // column gutter
const SIDE_W = 448;                           // right hand column
const LEAD_W = CONTENT - GUT - SIDE_W;        // 920
const SIDE_X = M + LEAD_W + GUT;              // 1016

const LEAD_TOP = 330;                         // first baseline row under the masthead rule
const TICK_H = 600;
// the lead package is fixed at 60% of the page height: H = 0.4H + lead top + gap + ticker + margin
const H = Math.round((LEAD_TOP + 22 + TICK_H + M) / 0.4);
const LEAD_H = Math.round(H * 0.6);
const LEAD_BOT = LEAD_TOP + LEAD_H;
const TICK_TOP = LEAD_BOT + 22;

/* =============================================================== 2. colour == */

type RGB = [number, number, number];

const INK: RGB = [18, 24, 31];                // #12181f
const PAPER: RGB = [242, 236, 225];           // #f2ece1
const PAPER_HI: RGB = [248, 244, 236];
const PAPER_LO: RGB = [231, 223, 208];
const BRICK: RGB = [179, 64, 47];             // #b3402f
const BRICK_DK: RGB = [143, 45, 31];          // #8f2d1f, for small type on paper
const TEAL: RGB = [47, 111, 106];             // #2f6f6a
const WHITE: RGB = [250, 247, 241];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
const INK_SOFT = mix(INK, PAPER, 0.36);
const HAIR = mix(INK, PAPER, 0.62);

/* ================================================================ 3. raster = */

const buf = new Uint8Array(W * H * 4);

function px(x: number, y: number, c: RGB, a = 1) {
  if (a <= 0) return;
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 4;
  buf[i + 3] = 255;                           // canvas is opaque everywhere
  if (a >= 1) {
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    return;
  }
  buf[i] += (c[0] - buf[i]) * a;
  buf[i + 1] += (c[1] - buf[i + 1]) * a;
  buf[i + 2] += (c[2] - buf[i + 2]) * a;
}

function rect(x: number, y: number, w: number, h: number, c: RGB, a = 1) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(i, j, c, a);
}

function gradRect(x: number, y: number, w: number, h: number, c0: RGB, c1: RGB) {
  for (let j = 0; j < h; j++) {
    const c = mix(c0, c1, h <= 1 ? 0 : j / (h - 1));
    for (let i = x; i < x + w; i++) px(i, y + j, c);
  }
}

function disc(cx: number, cy: number, r: number, c: RGB, a = 1) {
  const r2 = r * r;
  for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++)
    for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
      const dx = i - cx, dy = j - cy;
      if (dx * dx + dy * dy <= r2) px(i, j, c, a);
    }
}

function ring(cx: number, cy: number, r: number, c: RGB, thick: number, a = 1) {
  const ro = r + thick + 1;
  for (let j = Math.floor(cy - ro); j <= Math.ceil(cy + ro); j++)
    for (let i = Math.floor(cx - ro); i <= Math.ceil(cx + ro); i++) {
      const d = Math.hypot(i - cx, j - cy);
      if (Math.abs(d - r) <= thick) px(i, j, c, a);
    }
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1, a = 1) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const h = (thick - 1) / 2;
  for (let s = 0; s <= n; s++) {
    const x = Math.round(x0 + (dx * s) / n);
    const y = Math.round(y0 + (dy * s) / n);
    for (let oy = -h; oy <= h; oy++) for (let ox = -h; ox <= h; ox++) px(x + ox, y + oy, c, a);
  }
}

function poly(pts: [number, number][], c: RGB, a = 1) {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
  for (let y = Math.floor(lo); y <= Math.ceil(hi); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) px(x, y, c, a);
  }
}

/* =========================================================== 4. bitmap font = */
/* Cell is 5 wide, 7 tall (rows 0..6). '#' marks ink. Lower case sits on a five
   row x-height (rows 2..6) and may use rows 7..8 for descenders.              */

const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  a: [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  c: [".....", ".....", ".###.", "#...#", "#....", "#...#", ".###."],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  f: ["..##.", ".#...", "####.", ".#...", ".#...", ".#...", ".#..."],
  g: [".....", ".....", ".####", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  i: ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  j: ["...#.", ".....", "...#.", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  k: ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  l: [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  p: [".....", ".....", "####.", "#...#", "#...#", "#...#", "####.", "#....", "#...."],
  q: [".....", ".....", ".####", "#...#", "#...#", "#...#", ".####", "....#", "....#"],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  t: [".#...", ".#...", "####.", ".#...", ".#...", ".#...", "..##."],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".####"],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  w: [".....", ".....", "#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  y: [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".####", "....#", ".###."],
  z: [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".....", ".##..", ".#..."],
  ":": [".....", ".....", ".##..", ".##..", ".....", ".##..", ".##.."],
  ";": [".....", ".....", ".##..", ".##..", ".....", ".##..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", ".##.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", ".##.."],
  "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
  '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "&": [".##..", "#..#.", "#...#", ".##..", "#.#.#", "#..#.", ".##.#"],
  "%": ["#...#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...#"],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "*": ["..#..", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "..#.."],
  "\u00b7": [".....", ".....", ".....", "..#..", ".....", ".....", "....."],
};

type TStyle = {
  sz: number;      // cell height
  cw?: number;     // cell width (defaults to sz; smaller = condensed)
  tk?: number;     // tracking, device px
  be?: number;     // extra stroke weight, device px
  color: RGB;
  a?: number;
};

/** condensed text size used for body copy, briefs and captions */
function body(sz: number, color: RGB, tk = 2): TStyle {
  return { sz, cw: Math.max(2, Math.round(sz * 0.8)), tk, color };
}
const cellW = (st: TStyle) => st.cw ?? st.sz;

/** stroke weight: display sizes get a heavier cut, text sizes stay clean */
function strokeOf(sz: number) { return sz >= 8 ? 2 : sz >= 6 ? 1 : 0; }

function glyph(ch: string) { return GLYPHS[ch] ?? GLYPHS[" "]; }

function isBlank(ch: string) {
  const g = glyph(ch);
  for (const r of g) if (r !== ".....") return false;
  return true;
}

function inkBounds(ch: string) {
  const g = glyph(ch);
  let lo = 5, hi = -1;
  for (let r = 0; r < g.length; r++)
    for (let c = 0; c < 5; c++)
      if (g[r][c] === "#") { if (c < lo) lo = c; if (c > hi) hi = c; }
  return { lo, hi };
}

function advance(ch: string, st: TStyle) {
  const tk = st.tk ?? 1;
  const cw = cellW(st);
  if (isBlank(ch)) return Math.round(cw * 2.4) + tk;
  const { lo, hi } = inkBounds(ch);
  return (hi - lo + 1) * cw + (st.be ?? strokeOf(st.sz)) + tk;
}

function textW(s: string, st: TStyle) {
  let w = 0;
  for (const ch of s) w += advance(ch, st);
  return s.length ? w - (st.tk ?? 1) : 0;
}

function drawText(x: number, y: number, s: string, st: TStyle) {
  const bold = st.be ?? strokeOf(st.sz);      // heavier strokes on display sizes
  const cw = cellW(st);
  let cx = x;
  for (const ch of s) {
    const g = glyph(ch);
    const { lo, hi } = inkBounds(ch);
    if (hi >= 0)
      for (let r = 0; r < g.length; r++)
        for (let c = lo; c <= hi; c++)
          if (g[r][c] === "#")
            rect(cx + (c - lo) * cw, y + r * st.sz, cw + bold, st.sz, st.color, st.a ?? 1);
    cx += advance(ch, st);
  }
}

function textCenter(x: number, y: number, w: number, s: string, st: TStyle) {
  drawText(x + Math.round((w - textW(s, st)) / 2), y, s, st);
}

function textRight(xr: number, y: number, s: string, st: TStyle) {
  drawText(xr - textW(s, st), y, s, st);
}

function fitScale(lines: string[], maxW: number, cap: number, tk = 1) {
  let sz = cap;
  for (const l of lines) while (sz > 1 && textW(l, { sz, tk, color: INK }) > maxW) sz--;
  return sz;
}

function wrapText(s: string, maxW: number, st: TStyle) {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (textW(cand, st) <= maxW) { cur = cand; continue; }
    if (cur) lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** largest size in `sizes` whose wrapped text fits maxH over nCols; never truncates */
function fitParagraph(text: string, colW: number, maxH: number, sizes: number[], tk: number, nCols: number) {
  const last = { sz: sizes[sizes.length - 1], lines: [] as string[], per: 0, lh: 0 };
  for (const sz of sizes) {
    const st = body(sz, INK, tk);
    const lines = wrapText(text, colW, st);
    const per = Math.ceil(lines.length / nCols);
    const lh = sz * 7 + Math.round(sz * 3);
    last.sz = sz; last.lines = lines; last.per = per; last.lh = lh;
    if (per * lh <= maxH) return last;
  }
  return last;
}

/* ================================================================ 5. content = */

const LEAD_HEAD = ["COP31 ENDS", "WITH NO GLOBAL", "CLIMATE DEAL"];
const LEAD_DECK =
  "The European Union rejected the closing text over its silence on fossil fuels.";
const LEAD_BODY =
  "Negotiators sat through two extra days of talks, far past the deadline, before the gavel fell. The closing text dropped every mention of coal, oil and gas, and the summit ended without an agreed outcome. The mood in the hall soured in the final hours. A small group of states now carries the work into January.";
const LEAD_CAP = "The summit closed with no agreed text after two weeks of talks in Brasilia.";
const LEAD_CREDIT = "GRAPHIC: THE WORLD";

const SIDE_ITEMS = [
  {
    kicker: "UNITED STATES",
    head: ["DEMOCRATS", "TAKE THE HOUSE", "IN A LANDSLIDE"],
    body: "The party wins its widest House majority in three decades, a blow to President Trump.",
    photo: false,
  },
  {
    kicker: "GULF OF FINLAND",
    head: ["FIRE ABOARD", "A RUSSIAN SHIP"],
    body: "The Sparta II was ablaze off Finland on Sunday night.",
    photo: true,
  },
  {
    kicker: "DEMOGRAPHY",
    head: ["ISLAM TO PASS", "CHRISTIANITY"],
    body: "A new report projects it will be the largest faith in the world by 2035.",
    photo: false,
  },
];

const TICKER = [
  { reg: "UKRAINE", txt: "An overnight attack on the Kyiv region left two dead in the rubble and four wounded." },
  { reg: "WEST BANK", txt: "Settlers attacked Palestinian villages across the occupied West Bank late on Sunday." },
  { reg: "HAITI", txt: "Two soldiers from El Salvador were killed and two wounded on duty in the country." },
  { reg: "CHINA", txt: "Beijing set 2030 targets for elderly care and for childcare places nationwide." },
];

/* ============================================================= 6. the page == */

function drawPaper() {
  gradRect(0, 0, W, H, PAPER_HI, PAPER_LO);
  for (let y = 0; y < H; y++) {
    const dy = (y / (H - 1)) * 2 - 1;
    for (let x = 0; x < W; x++) {
      const dx = (x / (W - 1)) * 2 - 1;
      const d = Math.hypot(dx, dy) / 1.4142;
      const v = Math.max(0, d - 0.55) / 0.45;
      if (v > 0) px(x, y, [184, 164, 130], Math.min(0.22, v * 0.22));
    }
  }
}

function drawMasthead() {
  rect(M, 56, CONTENT, 5, INK);

  const folioL = "VOL. I  \u00b7  NO. 187";
  const folioR = "WORLD DESK  \u00b7  EVENING EDITION";
  const fs: TStyle = { sz: 3, tk: 2, color: INK_SOFT };
  drawText(M, 70, folioL, fs);
  textRight(M + CONTENT, 70, folioR, fs);

  const title = "THE WORLD";
  const tsz = fitScale([title], CONTENT - 160, 17);
  textCenter(M, 98, CONTENT, title, { sz: tsz, tk: 2, color: INK });

  textCenter(M, 230, CONTENT, "SUNDAY 22 NOVEMBER 2026", { sz: 5, tk: 2, color: INK });

  rect(M, 270, CONTENT, 2, TEAL);
  textCenter(M, 278, CONTENT,
    "KYIV HIT OVERNIGHT  \u00b7  SETTLER ATTACKS  \u00b7  CHINA SETS 2030 CARE GOALS",
    { sz: 4, cw: 3, tk: 3, be: 1, color: INK });
  rect(M, 312, CONTENT, 4, INK);
}

/* --- the globe: meridians, parallels, and a cracked, overheating flank ---- */
function drawGlobe(x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const tx = i / (w - 1), ty = j / (h - 1);
      const cool = mix([11, 18, 25], [19, 36, 40], ty);
      const warm = mix([20, 18, 20], [92, 36, 22], ty);
      px(x + i, y + j, mix(cool, warm, Math.pow(tx, 1.8)));
    }
  for (let j = 0; j < h; j += 4)
    for (let i = 0; i < w; i++) px(x + i, y + j, [130, 200, 200], 0.045);

  const cx = x + w * 0.5, cy = y + h * 0.5, R = h * 0.42;

  for (const k of [1.6, 1.95, 2.35]) ring(cx, cy, R * k, [120, 205, 205], 1, 0.10);
  ring(cx, cy, R + 11, [255, 152, 92], 7, 0.055);
  ring(cx, cy, R + 5, [110, 205, 200], 3, 0.10);

  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      if (i * i + j * j > R * R) continue;
      const nx = i / R, ny = j / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const sh = Math.max(0.20, (0.26 + 0.86 * Math.max(0, nz * 0.72 - nx * 0.36 - ny * 0.34)) / 1.1);
      const warm = Math.max(0, Math.min(1, (nx + 0.12) / 0.95));
      const base = mix([46, 112, 116], [206, 88, 46], Math.pow(warm, 1.4));
      px(Math.round(cx + i), Math.round(cy + j), [
        Math.min(255, base[0] * sh * (1 + warm * 0.55)), base[1] * sh, base[2] * sh,
      ], 0.95);
    }

  for (const deg of [-75, -50, -25, 0, 25, 50, 75]) {
    const a = Math.abs(R * Math.sin((deg * Math.PI) / 180));
    for (let t = 0; t <= 900; t++) {
      const th = (t / 900) * Math.PI * 2;
      const gx = Math.round(cx + a * Math.cos(th)), gy = Math.round(cy + R * Math.sin(th));
      px(gx, gy, [180, 240, 234], 0.33);
      px(gx, gy + 1, [180, 240, 234], 0.16);
    }
  }
  for (const deg of [-62, -32, 0, 32, 62]) {
    const ph = (deg * Math.PI) / 180;
    const yy = cy - R * Math.sin(ph), half = R * Math.cos(ph);
    for (let i = -half; i <= half; i++) px(Math.round(cx + i), Math.round(yy), [180, 240, 234], 0.29);
  }
  ring(cx, cy, R, [196, 248, 242], 1.6, 0.95);
  ring(cx, cy, R - 3, [12, 26, 30], 1, 0.45);

  // heat wash on the sunward flank
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      if (i * i + j * j > R * R) continue;
      const heat = Math.max(0, Math.min(1, (i / R + 0.05) / 0.95));
      if (heat <= 0.02) continue;
      const streak = ((i * 5 + j * 3) % 9 + 9) % 9;
      px(Math.round(cx + i), Math.round(cy + j), [255, 138, 62], heat * (streak < 2 ? 0.5 : 0.22));
    }

  const cracks: number[][][] = [
    [[-8, -R * 0.9], [4, -R * 0.62], [-4, -R * 0.34], [8, -R * 0.08], [0, R * 0.18], [10, R * 0.44], [3, R * 0.72], [11, R * 0.94]],
    [[4, -R * 0.62], [R * 0.36, -R * 0.56], [R * 0.58, -R * 0.68], [R * 0.86, -R * 0.52]],
    [[8, -R * 0.08], [R * 0.44, -R * 0.02], [R * 0.7, R * 0.14], [R * 0.92, R * 0.04]],
    [[0, R * 0.18], [-R * 0.3, R * 0.32], [-R * 0.22, R * 0.52], [-R * 0.46, R * 0.64]],
    [[10, R * 0.44], [R * 0.32, R * 0.58], [R * 0.52, R * 0.5]],
  ];
  for (const path of cracks)
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i], [bx, by] = path[i + 1];
      line(cx + ax, cy + ay, cx + bx, cy + by, [26, 14, 10], 3, 0.9);
      line(cx + ax, cy + ay, cx + bx, cy + by, [255, 196, 126], 1, 0.55);
    }
  for (const [sx, sy, r] of [
    [R * 0.72, -R * 0.64, 4], [R * 0.88, -R * 0.12, 3], [R * 0.6, R * 0.52, 4], [R * 0.3, R * 0.8, 3],
  ] as [number, number, number][]) {
    disc(cx + sx, cy + sy, r, [255, 186, 112], 0.55);
    disc(cx + sx, cy + sy, 1, [255, 250, 235], 1);
  }

  halftone(x + 3, y + 3, w - 6, h - 6, 10);
  rect(x, y, w, 3, INK);
  rect(x, y + h - 3, w, 3, INK);
  rect(x, y, 3, h, INK);
  rect(x + w - 3, y, 3, h, INK);
}

/* --- photo strip: a ship burning at sea (colour blocks + silhouette) ------ */
function drawFireStrip(x: number, y: number, w: number, h: number) {
  const sea = y + Math.round(h * 0.76);
  gradRect(x, y, w, sea - y, [30, 40, 52], [128, 64, 38]);
  gradRect(x, sea, w, y + h - sea, [34, 44, 54], [16, 22, 30]);

  for (let j = 0; j < sea - y; j++)
    for (let i = 0; i < w; i++) {
      const d = Math.hypot(i - w * 0.5, (j - (sea - y) * 0.68) * 1.35) / (w * 0.46);
      const a = Math.max(0, 1 - d) ** 2 * 0.8;
      if (a > 0.01) px(x + i, y + j, [255, 142, 54], a);
    }

  for (const [sx, sy, r, a] of [
    [0.66, 0.18, 24, 0.26], [0.74, 0.11, 18, 0.22], [0.82, 0.06, 13, 0.16], [0.6, 0.28, 18, 0.16],
  ] as [number, number, number, number][])
    disc(x + w * sx, y + h * sy, r, [104, 104, 108], a);

  const hullTop = sea - Math.round(h * 0.2);
  poly([[x + w * 0.19, hullTop], [x + w * 0.84, hullTop], [x + w * 0.78, sea], [x + w * 0.25, sea]], [10, 14, 18]);
  rect(x + w * 0.27, hullTop - 2, Math.round(w * 0.56), 3, [10, 14, 18]);
  rect(x + w * 0.44, hullTop - Math.round(h * 0.19), Math.round(w * 0.14), Math.round(h * 0.19), [10, 14, 18]);
  rect(x + w * 0.61, hullTop - Math.round(h * 0.13), Math.round(w * 0.05), Math.round(h * 0.13), [10, 14, 18]);
  rect(x + w * 0.332, hullTop - Math.round(h * 0.3), 3, Math.round(h * 0.3), [10, 14, 18]);
  rect(x + w * 0.3, hullTop - Math.round(h * 0.22), 14, 2, [10, 14, 18]);
  // rim light along the deck, cast by the blaze
  rect(x + w * 0.2, hullTop - 1, Math.round(w * 0.63), 2, [255, 152, 74], 0.5);

  const fx = x + w * 0.5, fy = hullTop - 1;
  for (const [dx, hh, ww, col] of [
    [-0.09, 0.78, 0.13, [190, 66, 44]], [0.02, 1.15, 0.15, [236, 108, 42]],
    [0.12, 0.9, 0.12, [250, 158, 56]], [0.2, 0.6, 0.09, [255, 214, 120]],
  ] as [number, number, number, RGB][]) {
    const bx = fx + w * dx, th = h * 0.3 * hh, half = (w * ww) / 2;
    poly([[bx - half, fy], [bx + half, fy], [bx + half - 3, fy - th * 0.5], [bx, fy - th], [bx - half + 3, fy - th * 0.45]], col);
  }
  for (const [sx, sy, r] of [[0.42, 0.3, 2], [0.56, 0.18, 2], [0.34, 0.42, 2], [0.61, 0.44, 2]] as [number, number, number][])
    disc(x + w * sx, y + h * sy, r, [255, 236, 176], 0.95);

  for (let j = 0; j < y + h - sea; j++)
    for (let i = 0; i < w; i++) {
      const u = (i - w * 0.46) / (w * 0.22);
      const a = Math.max(0, 1 - Math.abs(u)) * Math.max(0, 1 - j / (y + h - sea)) * 0.75;
      if (a > 0.01) px(x + i, sea + j, [255, 142, 60], a);
    }
  for (let k = 0; k < 10; k++)
    rect(x + ((k * 131) % (w - 60)), sea + 3 + k * 2, 24 + ((k * 47) % 70), 1, [12, 18, 24], 0.4);

  halftone(x + 3, y + 3, w - 6, h - 6, 10);
  rect(x, y, w, 3, INK);
  rect(x, y + h - 3, w, 3, INK);
  rect(x, y, 3, h, INK);
  rect(x + w - 3, y, 3, h, INK);
}

/* --- lead package --------------------------------------------------------- */
function drawLead() {
  const x = M, w = LEAD_W;
  let y = LEAD_TOP;

  const kw = textW("CLIMATE", { sz: 6, tk: 2, color: WHITE });
  rect(x, y, kw + 40, 46, BRICK);
  drawText(x + 20, y + 2, "CLIMATE", { sz: 6, tk: 2, color: WHITE });
  rect(x + kw + 54, y + 22, w - kw - 54, 2, TEAL);

  y += 46 + 24;
  const hsz = fitScale(LEAD_HEAD, w, 13, 4);
  const hlh = hsz * 7 + Math.round(hsz * 2);
  for (const l of LEAD_HEAD) { drawText(x, y, l, { sz: hsz, tk: 4, color: INK }); y += hlh; }
  y -= Math.round(hsz * 0.7);
  rect(x, y, w, 4, INK);
  y += 30;

  const dSt: TStyle = { sz: 5, cw: 4, tk: 2, be: 1, color: INK };
  for (const l of wrapText(LEAD_DECK, w, dSt)) { drawText(x, y, l, dSt); y += 5 * 7 + 14; }
  y += 18;

  rect(x, y, w, 2, HAIR);
  drawText(x, y + 10, "BY OUR CLIMATE EDITOR  \u00b7  BRASILIA", { sz: 3, tk: 3, be: 1, color: INK_SOFT });
  y += 10 + 21 + 22;

  const ih = 360;
  drawGlobe(x, y, w, ih);
  y += ih + 14;

  const cSt = body(4, INK_SOFT);
  for (const l of wrapText(LEAD_CAP, w, cSt)) { drawText(x, y, l, cSt); y += 4 * 7 + 8; }
  drawText(x, y + 2, LEAD_CREDIT, { sz: 3, tk: 2, be: 1, color: BRICK_DK });
  y += 29 + 16;

  const colW = Math.floor((w - 34) / 2);
  const p = fitParagraph(LEAD_BODY, colW, LEAD_BOT - y, [5, 4], 2, 2);
  p.lines.slice(0, p.per * 2).forEach((l, i) => {
    const c = Math.floor(i / p.per);
    drawText(x + c * (colW + 34), y + (i % p.per) * p.lh, l, body(p.sz, INK));
  });
  rect(x + colW + 17, y, 1, Math.min(p.per * p.lh, LEAD_BOT - y), HAIR);
  report("lead.body", y, y + p.per * p.lh, LEAD_BOT, p.sz + "pt " + p.lines.length + "L");
}

/* --- right hand column ---------------------------------------------------- */
function drawSidebar() {
  const x = SIDE_X, w = SIDE_W;
  const avail = LEAD_H - 52;
  const slots = [Math.round(avail * 0.349), Math.round(avail * 0.326), 0];
  slots[2] = avail - slots[0] - slots[1];
  let y = LEAD_TOP;

  SIDE_ITEMS.forEach((item, idx) => {
    const top = y;
    if (idx > 0) { rect(x, y - 16, w, 2, HAIR); y += 10; }

    rect(x, y + 3, 14, 14, BRICK);
    drawText(x + 24, y, item.kicker, { sz: 4, tk: 2, be: 1, color: BRICK_DK });
    y += 28 + 12;

    const hsz = fitScale(item.head, w, 7);
    for (const l of item.head) { drawText(x, y, l, { sz: hsz, tk: 1, color: INK }); y += hsz * 7 + Math.round(hsz * 1.7); }
    y += 8;

    if (item.photo) {
      drawFireStrip(x, y, w, 130);
      y += 130 + 10;
    }
    const bottom = top + slots[idx];
    const bSt = body(4, INK);
    const p = fitParagraph(item.body, w, bottom - y, [5, 4], 2, 1);
    p.lines.forEach((l, li) => drawText(x, y + li * p.lh, l, bSt));
    y = bottom;
    report("side." + idx, y - slots[idx], y, LEAD_BOT, p.sz + "pt " + p.lines.length + "L");
  });
}

/* --- footer ticker -------------------------------------------------------- */
function drawTicker() {
  rect(M, TICK_TOP, CONTENT, 46, INK);
  drawText(M + 20, TICK_TOP + 8, "IN BRIEF", { sz: 5, tk: 2, color: WHITE });
  textRight(M + CONTENT - 20, TICK_TOP + 15, "THE DAY IN BRIEF", { sz: 3, tk: 2, color: WHITE });

  const gridY = TICK_TOP + 46 + 30;
  const cw = (CONTENT - 80) / 2;
  const rh = (H - M - gridY - 20) / 2;
  rect(M + cw + 40, gridY, 2, rh * 2 + 20, HAIR);
  rect(M, gridY + rh + 10, CONTENT, 2, HAIR);

  TICKER.forEach((item, i) => {
    const cx = M + (i % 2) * (cw + 80);
    const cy = gridY + Math.floor(i / 2) * (rh + 20);
    rect(cx, cy + 4, 12, 12, BRICK);
    drawText(cx + 20, cy, item.reg, { sz: 4, tk: 2, be: 1, color: BRICK_DK });
    const p = fitParagraph(item.txt, cw, rh - 36, [5, 4], 2, 1);
    p.lines.forEach((l, li) => drawText(cx, cy + 36 + li * p.lh, l, body(p.sz, INK)));
    report("brief." + item.reg, cy, cy + 36 + p.lines.length * p.lh, cy + rh, p.sz + "pt " + p.lines.length + "L");
  });
}

/** ordered 4x4 Bayer screen: gives the artwork a printed, screened look */
function halftone(x: number, y: number, w: number, h: number, levels: number) {
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const step = 255 / (levels - 1);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const xi = x + i, yi = y + j;
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const k = (yi * W + xi) * 4;
      const t = (B[(j % 4) * 4 + (i % 4)] + 0.5) / 16;
      for (let c = 0; c < 3; c++) {
        const scaled = buf[k + c] / step;
        const fl = Math.floor(scaled);
        buf[k + c] = Math.min(255, (scaled - fl > t ? fl + 1 : fl) * step);
      }
    }
}

/* --- print texture -------------------------------------------------------- */
function drawGrain() {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let hsh = (x * 374761393 + y * 668265263) | 0;
      hsh = (hsh ^ (hsh >>> 13)) * 1274126177;
      const n = ((hsh ^ (hsh >>> 16)) >>> 0) / 4294967295;
      if (n < 0.42) {
        const i = (y * W + x) * 4;
        const d = n < 0.21 ? -6 : 6;
        buf[i] = Math.max(0, Math.min(255, buf[i] + d));
        buf[i + 1] = Math.max(0, Math.min(255, buf[i + 1] + d));
        buf[i + 2] = Math.max(0, Math.min(255, buf[i + 2] + d));
      }
    }
}

/* --- layout guard: report every block so overflow cannot hide -------------- */
const LAYOUT: { name: string; top: number; bottom: number; limit: number; note: string }[] = [];
function report(name: string, top: number, bottom: number, limit: number, note: string) {
  LAYOUT.push({ name, top, bottom, limit, note });
}

/* ============================================================== 7. encoder == */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** pick the cheapest of the five PNG filters for every scan line */
function filterScanlines(rgba: Uint8Array, w: number, h: number) {
  const stride = w * 4;
  const out = new Uint8Array((stride + 1) * h);
  const prev = new Uint8Array(stride);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < h; y++) {
    const cur = rgba.subarray(y * stride, (y + 1) * stride);
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const dst = cand[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0;
        const b = prev[i];
        const c = i >= 4 ? prev[i - 4] : 0;
        let v: number;
        if (f === 0) v = cur[i];
        else if (f === 1) v = cur[i] - a;
        else if (f === 2) v = cur[i] - b;
        else if (f === 3) v = cur[i] - ((a + b) >> 1);
        else {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        v &= 0xff;
        dst[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    out[y * (stride + 1)] = best;
    out.set(cand[best], y * (stride + 1) + 1);
    prev.set(cur);
  }
  return out;
}

function encodePNG(w: number, h: number, rgba: Uint8Array) {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(zlib.deflateSync(filterScanlines(rgba, w, h), { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];
  let total = 0;
  for (const p of parts) total += p.length;
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return png;
}

/* ================================================================= 8. main == */

function main() {
  drawPaper();
  drawMasthead();
  rect(SIDE_X - 20, LEAD_TOP, 2, LEAD_H, HAIR);
  drawLead();
  drawSidebar();
  drawTicker();
  drawGrain();

  const png = encodePNG(W, H, buf);
  fs.mkdirSync("/output", { recursive: true });
  fs.writeFileSync("/output/entry.png", png);

  for (const b of LAYOUT) {
    const over = b.bottom > b.limit ? "  OVERFLOW" : "";
    console.log(`  ${b.name.padEnd(14)} ${b.top}..${b.bottom} (limit ${b.limit}) ${b.note}${over}`);
  }
  console.log(`entry.png ${W}x${H} ${(png.length / 1024).toFixed(0)} KiB  lead=${((LEAD_H / H) * 100).toFixed(1)}% of page height`);
}

main();
