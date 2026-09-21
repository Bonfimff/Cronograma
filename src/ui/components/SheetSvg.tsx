import { useEffect, useState, type ReactElement } from 'react';
import QRCode from 'qrcode';
import { MARKER, REF_H, REF_W, type Color, type El, type IconName, type PageTemplate } from '../../core/worksheets/templates';
import type { FieldValues } from '../../core/worksheets/fill';
import { qrPayload } from '../../core/qrcodes/ids';

/** Cores da folha (fixas: a folha é sempre clara, independente do tema da tela). */
const C: Record<Color, string> = {
  ink: '#15263a', teal: '#1f5a5c', muted: '#5f6b73', line: '#b9ccd6', fill: '#e5eeec',
  fill2: '#eaf1f0', border: '#c8d4d8', sage: '#5b7f73', white: '#ffffff',
};

// Página A4 com a referência (2:3) centralizada em escala uniforme, com margem segura para a impressora.
const A4_W = 210, A4_H = 297, MARGIN_Y = 6;
const S = (A4_H - 2 * MARGIN_Y) / REF_H; // mm por px de referência
const VB_W = A4_W / S, VB_H = A4_H / S;
const VIEWBOX = `${-(VB_W - REF_W) / 2} ${-(VB_H - REF_H) / 2} ${VB_W} ${VB_H}`;

function useQR(text: string | undefined) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (text) QRCode.toDataURL(text, { margin: 0, errorCorrectionLevel: 'M', width: 400 }).then(setUrl);
  }, [text]);
  return url;
}

function Icon({ name, x, y, size, color }: { name: IconName; x: number; y: number; size: number; color: string }) {
  const k = size / 24;
  const p = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body: Record<IconName, ReactElement> = {
    target: <><circle cx="12" cy="12" r="9" {...p} /><circle cx="12" cy="12" r="5" {...p} /><circle cx="12" cy="12" r="1.5" fill={color} /><path d="M12 12 20 4M17 4h3v3" {...p} /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" {...p} /><path d="M3 10h18M8 3v4M16 3v4" {...p} /><path d="M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2" {...p} /></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12" {...p} /><rect x="3" y="4.5" width="3" height="3" {...p} /><rect x="3" y="10.5" width="3" height="3" {...p} /><rect x="3" y="16.5" width="3" height="3" {...p} /></>,
    book: <><path d="M12 6c-2-1.5-5-2-9-2v14c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2zM12 6v14" {...p} /></>,
    pencil: <><path d="M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3" {...p} /></>,
    bulb: <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z" {...p} /></>,
    check: <><rect x="3" y="4" width="16" height="16" rx="2" {...p} /><path d="M7 12l4 4 10-11" {...p} strokeWidth={2.4} /></>,
    doc: <><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 15h6M9 18h4" {...p} /></>,
    bars: <><rect x="4" y="14" width="3" height="6" {...p} /><rect x="10.5" y="10" width="3" height="10" {...p} /><rect x="17" y="4" width="3" height="16" {...p} /></>,
    star: <><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" {...p} /></>,
    phone: <><rect x="7" y="2" width="10" height="20" rx="2" {...p} /><path d="M11 18h2" {...p} /></>,
  };
  return <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${k})`}>{body[name]}</g>;
}

function trunc(s: string, max?: number) {
  return max && s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Quebra em linhas para campos multilinha. */
function toLines(v: string | string[] | undefined, lines: number, max?: number): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const item of arr) {
    if (!max) { out.push(item); continue; }
    let cur = '';
    for (const w of item.split(/\s+/)) {
      if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    }
    if (cur) out.push(cur);
  }
  if (out.length > lines) out[lines - 1] = trunc(out[lines - 1] + ' …', max);
  return out.slice(0, lines);
}

function render(e: El, i: number, values: FieldValues, qr: Record<string, string>) {
  const font = { fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" };
  switch (e.t) {
    case 'text':
      return (
        <text key={i} x={e.x} y={e.y} fontSize={e.size} fontWeight={e.weight ?? 400} fill={C[e.color ?? 'ink']}
          letterSpacing={e.ls ? `${e.ls}em` : undefined} textAnchor={e.anchor} {...font}>{e.text}</text>
      );
    case 'rect':
      return <rect key={i} x={e.x} y={e.y} width={e.w} height={e.h} rx={e.r} fill={e.fill ? C[e.fill] : 'none'} stroke={e.stroke ? C[e.stroke] : undefined} strokeWidth={e.sw} />;
    case 'line':
      return <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={C[e.color ?? 'line']} strokeWidth={e.sw ?? 1.2} />;
    case 'lines':
      return (
        <g key={i} stroke={C[e.color ?? 'line']} strokeWidth={1.2}>
          {Array.from({ length: e.count }, (_, k) => <line key={k} x1={e.x} x2={e.x + e.w} y1={e.y + k * e.step} y2={e.y + k * e.step} />)}
        </g>
      );
    case 'circle':
      return (
        <g key={i}>
          <circle cx={e.cx} cy={e.cy} r={e.r} fill={C[e.fill]} />
          {e.text && <text x={e.cx} y={e.cy + (e.size ?? 14) * 0.36} textAnchor="middle" fontSize={e.size} fontWeight={600} fill={C[e.textColor ?? 'ink']} {...font}>{e.text}</text>}
        </g>
      );
    case 'icon':
      return <Icon key={i} name={e.name} x={e.x} y={e.y} size={e.size} color={C[e.color ?? 'ink']} />;
    case 'marker': {
      const { square, arm, thick } = MARKER;
      if (e.kind === 'square') return <rect key={i} x={e.x} y={e.y} width={square} height={square} fill="#000" />;
      const left = e.kind === 'l-bl';
      return (
        <g key={i} fill="#000">
          <rect x={left ? e.x : e.x + arm - thick} y={e.y} width={thick} height={arm} />
          <rect x={left ? e.x + thick : e.x} y={e.y + arm - thick} width={arm - thick} height={thick} />
        </g>
      );
    }
    case 'qr':
      return qr[e.page ?? 'front'] ? <image key={i} href={qr[e.page ?? 'front']} x={e.x} y={e.y} width={e.size} height={e.size} style={{ imageRendering: 'pixelated' }} /> : null;
    case 'box':
      return <rect key={i} x={e.x} y={e.y} width={e.size} height={e.size} rx={2} fill="#fff" stroke={C.ink} strokeWidth={1.6} />;
    case 'field': {
      const v = values[e.key];
      if (!v) return null;
      const lines = e.lines ? toLines(v, e.lines, e.maxChars) : [trunc(Array.isArray(v) ? v.join(' ') : v, e.maxChars)];
      return (
        <text key={i} fontSize={e.size} fontWeight={e.weight ?? 400} fill={C[e.color ?? 'ink']} textAnchor={e.anchor} {...font}>
          {lines.map((l, k) => <tspan key={k} x={e.x} y={e.y + k * (e.step ?? 0)}>{l}</tspan>)}
        </text>
      );
    }
  }
}

export function SheetSvg({ page, values, code }: { page: PageTemplate; values: FieldValues; code?: string }) {
  const pages = page.elements.filter((e) => e.t === 'qr').map((e) => (e as { page?: 'front' | 'back' }).page ?? 'front');
  const front = useQR(page.hasQR && code && pages.includes('front') ? qrPayload(code) : undefined);
  const back = useQR(page.hasQR && code && pages.includes('back') ? qrPayload(code, 'back') : undefined);
  const qr = { front, back };
  return (
    <svg className="sheet" xmlns="http://www.w3.org/2000/svg" width={`${A4_W}mm`} height={`${A4_H}mm`} viewBox={VIEWBOX}>
      <rect x={-(VB_W - REF_W) / 2} y={-(VB_H - REF_H) / 2} width={VB_W} height={VB_H} fill="#fff" />
      {page.elements.map((e, i) => render(e, i, values, qr))}
    </svg>
  );
}
