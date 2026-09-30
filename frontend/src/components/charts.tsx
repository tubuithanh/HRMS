import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

/*
 * Biểu đồ SVG nhẹ cho dashboard, theo quy cách:
 *  - màu theo thứ tự cố định: --viz-1 (xanh), --viz-2 (cam) — đã kiểm định CVD cả sáng/tối
 *  - đường 2px, vùng tô 10%; cột tối đa 24px, bo 4px đầu cột, khe 2px
 *  - lưới 1px nhạt, chữ dùng màu chữ (không dùng màu dữ liệu)
 *  - có tooltip khi di chuột / focus, và chế độ xem bảng cho mọi biểu đồ
 */

export interface Series {
  key: string;
  label: string;
}

const SERIES_COLORS = ['var(--viz-1)', 'var(--viz-2)'];

// ----- Tiện ích -----

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setWidth(ref.current.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Các mốc trục Y tròn số (0, 5, 10… hoặc 0, 20tr, 40tr…). */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

/** Rút gọn số: 1,2 tỷ · 25,4 tr · 730 N. */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf.format(v / 1e9)} tỷ`;
  if (a >= 1e6) return `${nf.format(v / 1e6)} tr`;
  if (a >= 1e4) return `${nf.format(v / 1e3)} N`;
  return nf.format(v);
}

export const fmtNumber = (v: number) => nf.format(v);
export const fmtPercent = (v: number) => `${nf.format(v)}%`;

// ----- Khung biểu đồ: tiêu đề, chú giải, chuyển Biểu đồ / Bảng -----

export function ChartCard(props: {
  title: string;
  subtitle?: string;
  series?: Series[];
  legendShape?: 'rect' | 'line';
  table: { columns: string[]; rows: Array<Array<string | number>> };
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className={`card shadow-sm h-100 ${props.className ?? ''}`}>
      <div className="card-body d-flex flex-column">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
          <div>
            <h2 className="h6 mb-0">{props.title}</h2>
            {props.subtitle && <div className="small text-body-secondary">{props.subtitle}</div>}
          </div>
          <div className="btn-group btn-group-sm" role="group" aria-label="Chế độ xem">
            <button className={`btn ${asTable ? 'btn-outline-secondary' : 'btn-secondary'}`} onClick={() => setAsTable(false)} title="Biểu đồ">
              <i className="bi bi-bar-chart-line" />
            </button>
            <button className={`btn ${asTable ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => setAsTable(true)} title="Bảng số liệu">
              <i className="bi bi-table" />
            </button>
          </div>
        </div>
        {props.series && props.series.length > 1 && !asTable && (
          <div className="d-flex flex-wrap gap-3 small text-body-secondary mb-2">
            {props.series.map((s, i) => (
              <span key={s.key} className="d-inline-flex align-items-center gap-1">
                {props.legendShape === 'line' ? (
                  <span style={{ width: 14, height: 2, background: SERIES_COLORS[i], display: 'inline-block' }} />
                ) : (
                  <span style={{ width: 10, height: 10, background: SERIES_COLORS[i], borderRadius: 2, display: 'inline-block' }} />
                )}
                {s.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex-grow-1">
          {asTable ? (
            <div className="table-responsive" style={{ maxHeight: 260 }}>
              <table className="table table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    {props.table.columns.map((c, i) => (
                      <th key={c} className={i ? 'text-end' : ''}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {props.table.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((v, i) => (
                        <td key={i} className={i ? 'num' : ''}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            props.children
          )}
        </div>
      </div>
    </div>
  );
}

// ----- Tooltip -----

interface TipState {
  x: number;
  y: number;
  title: string;
  rows: Array<{ label: string; value: string; color?: string; shape?: 'line' | 'rect' }>;
}

function Tooltip({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 12, 0), Math.max(width - 190, 0));
  return (
    <div className="viz-tooltip" style={{ left, top: Math.max(tip.y - 10, 0) }} role="status">
      <div className="small text-body-secondary mb-1">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="d-flex align-items-center gap-2">
          {r.color && (
            <span
              style={{
                width: r.shape === 'rect' ? 8 : 12,
                height: r.shape === 'rect' ? 8 : 2,
                background: r.color,
                borderRadius: r.shape === 'rect' ? 2 : 0,
                display: 'inline-block',
              }}
            />
          )}
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</strong>
          <span className="small text-body-secondary">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// ----- Trục chung -----

const PAD = { top: 12, right: 16, bottom: 26, left: 48 };
/** Khoảng trống phía trên khi có nhãn giá trị trên đỉnh cột / cuối đường. */
const LABEL_ROOM = 18;

function YGrid({ ticks, y, width, fmt }: { ticks: number[]; y: (v: number) => number; width: number; fmt: (v: number) => string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'viz-baseline' : 'viz-grid'} />
          <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="viz-tick">
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Chỉ hiện một số nhãn trục X để không chồng chữ. */
function xLabelEvery(n: number, width: number) {
  const fit = Math.max(Math.floor((width - PAD.left - PAD.right) / 56), 1);
  return Math.max(Math.ceil(n / fit), 1);
}

// ----- Biểu đồ đường -----

export function LineChart(props: {
  labels: string[];
  series: Series[];
  data: Array<Record<string, number | null>>;
  height?: number;
  format?: (v: number) => string;
  yMax?: number;
  /** Định dạng số trong tooltip (mặc định = format). */
  tipFormat?: (v: number) => string;
  /** Ghi giá trị cuối ở đầu đường (chỉ khi 1 chuỗi). */
  endLabel?: boolean;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = props.height ?? 220;
  const fmt = props.format ?? fmtNumber;
  const n = props.labels.length;
  const values = props.data.flatMap((d) => props.series.map((s) => d[s.key])).filter((v): v is number => v !== null);
  const ticks = niceTicks(props.yMax ?? Math.max(...values, 0));
  const top = ticks[ticks.length - 1];
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const padTop = PAD.top + (props.endLabel ? LABEL_ROOM : 0);
  const y = (v: number) => padTop + (1 - v / top) * (height - padTop - PAD.bottom);
  const every = xLabelEvery(n, width);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round(((px - PAD.left) / innerW) * (n - 1));
    setHover(Math.min(Math.max(i, 0), n - 1));
  };

  const tip: TipState | null =
    hover === null
      ? null
      : {
          x: x(hover),
          y: PAD.top,
          title: props.labels[hover],
          rows: props.series.map((s, si) => {
            const v = props.data[hover][s.key];
            return { label: s.label, value: v === null ? '—' : (props.tipFormat ?? fmt)(v), color: SERIES_COLORS[si], shape: 'line' as const };
          }),
        };

  return (
    <div ref={ref} className="position-relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={props.series.map((s) => s.label).join(', ')}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          style={{ display: 'block', touchAction: 'pan-y' }}
        >
          <YGrid ticks={ticks} y={y} width={width} fmt={props.format ? (v) => props.format!(v) : fmtNumber} />
          {props.labels.map((l, i) =>
            (n - 1 - i) % every === 0 ? (
              <text key={l + i} x={x(i)} y={height - 6} textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'} className="viz-tick">
                {l}
              </text>
            ) : null,
          )}
          {props.series.map((s, si) => {
            const pts = props.data.map((d, i) => (d[s.key] === null ? null : [x(i), y(d[s.key] as number)]));
            const segs: string[] = [];
            let cur = '';
            pts.forEach((p) => {
              if (!p) {
                if (cur) segs.push(cur);
                cur = '';
              } else cur += `${cur ? 'L' : 'M'}${p[0]},${p[1]}`;
            });
            if (cur) segs.push(cur);
            const first = pts.findIndex((p) => p);
            const lastIdx = pts.length - 1 - [...pts].reverse().findIndex((p) => p);
            const area =
              props.series.length === 1 && first >= 0 && segs.length === 1
                ? `${segs[0]}L${pts[lastIdx]![0]},${y(0)}L${pts[first]![0]},${y(0)}Z`
                : null;
            return (
              <g key={s.key}>
                {area && <path d={area} fill={SERIES_COLORS[si]} opacity={0.1} />}
                {segs.map((d, k) => (
                  <path key={k} d={d} fill="none" stroke={SERIES_COLORS[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                ))}
                {lastIdx >= 0 && pts[lastIdx] && (
                  <circle cx={pts[lastIdx]![0]} cy={pts[lastIdx]![1]} r={4} fill={SERIES_COLORS[si]} stroke="var(--bs-body-bg)" strokeWidth={2} />
                )}
                {props.endLabel && props.series.length === 1 && lastIdx >= 0 && pts[lastIdx] && (
                  <text x={pts[lastIdx]![0] - 8} y={pts[lastIdx]![1] - 10} textAnchor="end" className="viz-label">
                    {fmt(props.data[lastIdx][s.key] as number)}
                  </text>
                )}
              </g>
            );
          })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} className="viz-crosshair" />
              {props.series.map((s, si) => {
                const v = props.data[hover][s.key];
                return v === null ? null : (
                  <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={SERIES_COLORS[si]} stroke="var(--bs-body-bg)" strokeWidth={2} />
                );
              })}
            </g>
          )}
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

// ----- Biểu đồ cột (nhóm hoặc chồng) -----

export function ColumnChart(props: {
  labels: string[];
  series: Series[];
  data: Array<Record<string, number>>;
  stacked?: boolean;
  height?: number;
  format?: (v: number) => string;
  tipFormat?: (v: number) => string;
  /** Ghi giá trị trên đầu cột (chỉ dùng khi ít cột). */
  valueLabels?: boolean;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);
  const height = props.height ?? 220;
  const fmt = props.format ?? fmtNumber;
  const n = props.labels.length;
  const totals = props.data.map((d) =>
    props.stacked ? props.series.reduce((s, x) => s + d[x.key], 0) : Math.max(...props.series.map((x) => d[x.key])),
  );
  const ticks = niceTicks(Math.max(...totals, 0));
  const top = ticks[ticks.length - 1];
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const band = innerW / Math.max(n, 1);
  const padTop = PAD.top + (props.valueLabels ? LABEL_ROOM : 0);
  const y = (v: number) => padTop + (1 - v / top) * (height - padTop - PAD.bottom);
  const groups = props.stacked ? 1 : props.series.length;
  const barW = Math.min(24, Math.max((band * 0.7 - (groups - 1) * 2) / groups, 3));
  const every = xLabelEvery(n, width);
  const GAP = 2;

  /** Cột bo 4px ở đầu, vuông ở chân. */
  const barPath = (bx: number, by: number, w: number, h: number, round: boolean) => {
    if (h <= 0) return '';
    const r = round ? Math.min(4, w / 2, h) : 0;
    return `M${bx},${by + h}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + w - r}Q${bx + w},${by} ${bx + w},${by + r}V${by + h}Z`;
  };

  const show = (i: number, e: { clientX: number; clientY: number } | null, target?: Element) => {
    const rect = ref.current!.getBoundingClientRect();
    const box = target?.getBoundingClientRect();
    const px = e ? e.clientX - rect.left : (box ? box.left - rect.left + box.width / 2 : 0);
    const py = e ? e.clientY - rect.top - 40 : (box ? box.top - rect.top - 40 : 0);
    setTip({
      x: px,
      y: py,
      title: props.labels[i],
      rows: [
        ...props.series.map((s, si) => ({ label: s.label, value: (props.tipFormat ?? fmt)(props.data[i][s.key]), color: SERIES_COLORS[si], shape: 'rect' as const })),
        ...(props.stacked && props.series.length > 1 ? [{ label: 'Tổng', value: (props.tipFormat ?? fmt)(totals[i]) }] : []),
      ],
    });
  };

  return (
    <div ref={ref} className="position-relative">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={props.series.map((s) => s.label).join(', ')} style={{ display: 'block' }}>
          <YGrid ticks={ticks} y={y} width={width} fmt={props.format ? (v) => props.format!(v) : fmtNumber} />
          {props.labels.map((l, i) => {
            const cx = PAD.left + band * i + band / 2;
            const groupW = barW * groups + GAP * (groups - 1);
            let stackBase = 0;
            return (
              <g
                key={l + i}
                className="viz-bar-group"
                tabIndex={0}
                onPointerMove={(e) => show(i, e)}
                onPointerLeave={() => setTip(null)}
                onFocus={(e) => show(i, null, e.currentTarget)}
                onBlur={() => setTip(null)}
              >
                {/* vùng bắt chuột rộng hơn cột */}
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={height - PAD.top - PAD.bottom} fill="transparent" />
                {props.series.map((s, si) => {
                  const v = props.data[i][s.key];
                  if (props.stacked) {
                    const isTop = si === props.series.length - 1 || props.series.slice(si + 1).every((x) => props.data[i][x.key] === 0);
                    const y0 = y(stackBase);
                    const y1 = y(stackBase + v);
                    stackBase += v;
                    const h = y0 - y1 - (si > 0 && v > 0 ? GAP : 0);
                    return <path key={s.key} d={barPath(cx - barW / 2, y1, barW, h, isTop)} fill={SERIES_COLORS[si]} />;
                  }
                  const bx = cx - groupW / 2 + si * (barW + GAP);
                  return <path key={s.key} d={barPath(bx, y(v), barW, y(0) - y(v), true)} fill={SERIES_COLORS[si]} />;
                })}
                {props.valueLabels && (
                  <text x={cx} y={y(totals[i]) - 6} textAnchor="middle" className="viz-label">
                    {totals[i] > 0 ? fmt(totals[i]) : ''}
                  </text>
                )}
                {(n - 1 - i) % every === 0 && (
                  <text x={cx} y={height - 6} textAnchor="middle" className="viz-tick">
                    {l}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

// ----- Thanh ngang (một chuỗi) -----

export function HBarChart(props: { rows: Array<{ label: string; value: number }>; format?: (v: number) => string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const fmt = props.format ?? fmtNumber;
  if (props.rows.length === 0) return <div className="empty">Chưa có dữ liệu</div>;
  const max = Math.max(...props.rows.map((r) => r.value), 1);
  const total = props.rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="d-flex flex-column gap-2" role="list">
      {props.rows.map((r, i) => (
        <div
          key={r.label}
          role="listitem"
          tabIndex={0}
          className={`hbar${hover === i ? ' is-hover' : ''}`}
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
        >
          <div className="d-flex justify-content-between small mb-1 gap-2">
            <span className="text-truncate">{r.label}</span>
            <span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.value)}</strong>
              {props.unit && <span className="text-body-secondary"> {props.unit}</span>}
              {hover === i && total > 0 && <span className="text-body-secondary"> · {Math.round((r.value / total) * 100)}%</span>}
            </span>
          </div>
          <div className="hbar-track">
            {r.value > 0 && <div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ----- Đường nhỏ trong ô KPI -----

export function Sparkline({ values, height = 32 }: { values: number[]; height?: number }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [w, setW] = useState(0);
  useEffect(() => setW(width), [width]);
  if (values.length < 2) return <div ref={ref} style={{ height }} />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const x = (i: number) => 2 + (i / (values.length - 1)) * (w - 4);
  const y = (v: number) => 3 + (1 - (v - min) / span) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  return (
    <div ref={ref} aria-hidden="true">
      {w > 0 && (
        <svg width={w} height={height} style={{ display: 'block' }}>
          <path d={d} fill="none" stroke="var(--viz-muted)" strokeWidth={1.5} strokeLinejoin="round" />
          <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill="var(--viz-1)" />
        </svg>
      )}
    </div>
  );
}
