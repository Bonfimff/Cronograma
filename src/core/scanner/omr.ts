import jsQR from 'jsqr';
import { boxesOf, CHECK_GROUPS, markerCentroid, type PageTemplate } from '../worksheets/templates';

/**
 * Leitura estruturada da folha (não lê caligrafia).
 *
 * Frente: o QR Code identifica a folha → sessão.
 * Verso: os 4 marcadores dos cantos (■ ■ em cima, └ ┘ embaixo) são localizados na foto;
 *        seus centros correspondem a pontos conhecidos do modelo → homografia modelo→foto.
 *        Isso corrige inclinação e perspectiva e permite medir cada caixa de marcação.
 */

export interface Img { data: Uint8ClampedArray; width: number; height: number }
export type Pt = { x: number; y: number };

export interface OptionReading { value: string; label: string; fill: number; center: Pt }
export interface GroupReading { id: string; title: string; selected: string | null; confident: boolean; options: OptionReading[] }
export interface SheetReading { markers: Pt[]; groups: GroupReading[]; code: string | null }

export function readQR(img: Img): { code: string; corners: Pt[] } | null {
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  if (!r) return null;
  const l = r.location;
  return { code: r.data, corners: [l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner] };
}

// ---------- homografia (4 pontos) ----------
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function homography(src: Pt[], dst: Pt[]): (p: Pt) => Pt {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const [a, bb, c, d, e, f, g, h] = solve(A, b);
  return ({ x, y }) => {
    const w = g * x + h * y + 1;
    return { x: (a * x + bb * y + c) / w, y: (d * x + e * y + f) / w };
  };
}

// ---------- binarização ----------
function grayscale(img: Img): Uint8Array {
  const g = new Uint8Array(img.width * img.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++)
    g[j] = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
  return g;
}

/** Limiar pela cor do papel: só tinta escura (marcadores, caneta) passa; linhas claras não. */
function paperThreshold(g: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i += 7) hist[g[i]]++;
  let total = 0;
  for (const h of hist) total += h;
  let acc = 0, paper = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * 0.93) { paper = v; break; } // o papel é a região mais clara da foto
  }
  return paper * 0.55;
}

// ---------- componentes conectados ----------
interface Blob { area: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; rg2: number }

function blobs(bin: Uint8Array, w: number, h: number, minSide: number, maxSide: number): Blob[] {
  const seen = new Uint8Array(w * h);
  const out: Blob[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!bin[start] || seen[start]) continue;
    let sp = 0, area = 0, sx = 0, sy = 0, sxx = 0;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y; sxx += x * x + y * y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && bin[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && bin[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && bin[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < minSide || bh < minSide || bw > maxSide || bh > maxSide) continue;
    if (bw / bh < 0.6 || bw / bh > 1.67) continue;
    const cx = sx / area, cy = sy / area;
    out.push({ area, x0, y0, x1, y1, cx, cy, rg2: sxx / area - cx * cx - cy * cy });
  }
  return out;
}

/**
 * Classificação independente de rotação, pela razão área / raio de giração²:
 * quadrado cheio ≈ 6 · L (braço 20, espessura 5) ≈ 2,6 · caixa vazada ≈ 1.
 * O L também tem o centroide fora da tinta.
 */
function classify(b: Blob, bin: Uint8Array, w: number): 'square' | 'L' | null {
  const k = b.area / Math.max(b.rg2, 1e-6);
  const inkAtCentroid = bin[Math.round(b.cy) * w + Math.round(b.cx)] === 1;
  if (k > 4.6 && inkAtCentroid) return 'square';
  if (k > 1.9 && k < 3.5 && !inkAtCentroid) return 'L';
  return null;
}

const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const quadArea = (p: Pt[]) => Math.abs(cross(p[0], p[1], p[2]) + cross(p[0], p[2], p[3])) / 2;

/** Encontra os 4 marcadores e devolve na ordem: sup.esq, sup.dir, inf.dir, inf.esq (da página). */
export function findMarkers(img: Img): Pt[] | null {
  const { width: w, height: h } = img;
  const g = grayscale(img);
  const thr = paperThreshold(g);
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) bin[i] = g[i] < thr ? 1 : 0;

  const big = Math.max(w, h);
  const found = blobs(bin, w, h, Math.max(4, big * 0.0025), big * 0.05);
  const squares = found.filter((b) => classify(b, bin, w) === 'square').slice(0, 60);
  const ls = found.filter((b) => classify(b, bin, w) === 'L').slice(0, 60);
  if (squares.length < 2 || ls.length < 2) return null;

  // escolhe a combinação (2 ■ + 2 L) que forma o maior quadrilátero: os marcadores ficam nos cantos
  let best: { pts: Pt[]; area: number } | null = null;
  const pt = (b: Blob) => ({ x: b.cx, y: b.cy });
  for (let a = 0; a < squares.length; a++)
    for (let b = a + 1; b < squares.length; b++)
      for (let c = 0; c < ls.length; c++)
        for (let d = c + 1; d < ls.length; d++) {
          const sq = [pt(squares[a]), pt(squares[b])], l = [pt(ls[c]), pt(ls[d])];
          // direção "para baixo" da página: dos ■ para os L
          const down = { x: (l[0].x + l[1].x - sq[0].x - sq[1].x) / 2, y: (l[0].y + l[1].y - sq[0].y - sq[1].y) / 2 };
          const right = { x: -down.y, y: down.x };
          const proj = (p: Pt) => p.x * right.x + p.y * right.y;
          const [tl, tr] = proj(sq[0]) > proj(sq[1]) ? [sq[0], sq[1]] : [sq[1], sq[0]];
          const [bl, br] = proj(l[0]) > proj(l[1]) ? [l[0], l[1]] : [l[1], l[0]];
          const pts = [tl, tr, br, bl];
          const area = quadArea(pts);
          const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
          const ratio = (dist(tl, tr) + dist(bl, br)) / (dist(tl, bl) + dist(tr, br));
          if (ratio < 0.45 || ratio > 0.95) continue; // proporção da página (≈ 0,66)
          if (!best || area > best.area) best = { pts, area };
        }
  if (!best || best.area < w * h * 0.08) return null;
  return best.pts;
}

// ---------- medição das caixas ----------
const lum = (img: Img, x: number, y: number) => {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
};

function fillRatio(img: Img, map: (p: Pt) => Pt, box: { x: number; y: number; size: number }, thr: number): number {
  const inset = box.size * 0.24; // mede só o miolo, evita a borda impressa
  const n = 12;
  let dark = 0, total = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const p = map({
        x: box.x + inset + ((box.size - 2 * inset) * (i + 0.5)) / n,
        y: box.y + inset + ((box.size - 2 * inset) * (j + 0.5)) / n,
      });
      if (p.x < 0 || p.y < 0 || p.x >= img.width || p.y >= img.height) continue;
      total++;
      if (lum(img, p.x, p.y) < thr) dark++;
    }
  return total ? dark / total : 0;
}

/**
 * Lê o QR da página na posição conhecida do modelo: recorta e endireita a região
 * pela homografia dos marcadores (funciona mesmo com o QR pequeno ou a foto inclinada).
 */
function readQRAt(img: Img, map: (p: Pt) => Pt, page: PageTemplate): string | null {
  const qr = page.elements.find((e): e is Extract<typeof e, { t: 'qr' }> => e.t === 'qr');
  if (!qr) return null;
  const pad = qr.size * 0.3, span = qr.size + 2 * pad, N = 300;
  const out = new Uint8ClampedArray(N * N * 4);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const p = map({ x: qr.x - pad + (span * (i + 0.5)) / N, y: qr.y - pad + (span * (j + 0.5)) / N });
      const x = Math.min(img.width - 1, Math.max(0, Math.round(p.x))), y = Math.min(img.height - 1, Math.max(0, Math.round(p.y)));
      const s = (y * img.width + x) * 4, d = (j * N + i) * 4;
      out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = 255;
    }
  return readQR({ data: out, width: N, height: N })?.code ?? null;
}

export function readSheet(img: Img, page: PageTemplate): SheetReading | null {
  const found = findMarkers(img);
  if (!found) return null;
  const ms = page.elements.filter((e): e is Extract<typeof e, { t: 'marker' }> => e.t === 'marker');
  const ref = (kind: string, left: boolean) => {
    const m = ms.find((x) => x.kind === kind && (kind !== 'square' || (left ? x.x < 500 : x.x > 500)))!;
    return markerCentroid(m.kind, m.x, m.y);
  };
  const src = [ref('square', true), ref('square', false), ref('l-br', false), ref('l-bl', true)];
  const map = homography(src, found);
  const thr = paperThreshold(grayscale(img)) * 1.25;
  const boxes = boxesOf(page);
  const code = readQRAt(img, map, page);

  const groups = CHECK_GROUPS.map((g): GroupReading => {
    const options = g.options.map((o) => {
      const b = boxes.find((x) => x.group === g.id && x.value === o.value)!;
      return { value: o.value, label: o.label, fill: fillRatio(img, map, b, thr), center: map({ x: b.x + b.size / 2, y: b.y + b.size / 2 }) };
    });
    const [best, second] = [...options].sort((a, b) => b.fill - a.fill);
    const marked = best.fill > 0.12;
    return { id: g.id, title: g.title, selected: marked ? best.value : null, confident: marked && best.fill - (second?.fill ?? 0) > 0.1, options };
  });
  return { markers: found, groups, code };
}
