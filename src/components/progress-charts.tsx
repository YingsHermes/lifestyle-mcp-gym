"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

export const SERIES_COLORS = ["var(--acid)", "var(--ice)", "var(--amber)", "var(--violet)"];

const compactNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
export const formatCompact = (value: number): string => compactNumber.format(value);

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export function AnimatedNumber({
  value,
  format = formatCompact,
  duration = 900,
}: {
  value: number;
  format?: (value: number) => string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);
  return <>{format(reduced ? value : display)}</>;
}

export interface ChartPoint {
  x: string;
  y: number;
}

const shortDate = (value: string): string =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const VIEW_W = 600;
const VIEW_H = 220;
const PAD = { top: 14, right: 10, bottom: 26, left: 10 };

function plotPoints(points: ChartPoint[], yMin: number, ySpread: number): Array<{ px: number; py: number }> {
  const innerW = VIEW_W - PAD.left - PAD.right;
  const innerH = VIEW_H - PAD.top - PAD.bottom;
  return points.map((point, index) => ({
    px: PAD.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW),
    py: PAD.top + innerH - ((point.y - yMin) / ySpread) * innerH,
  }));
}

function smoothPath(coords: Array<{ px: number; py: number }>): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].px} ${coords[0].py}`;
  let path = `M ${coords[0].px} ${coords[0].py}`;
  for (let index = 0; index < coords.length - 1; index += 1) {
    const current = coords[index];
    const next = coords[index + 1];
    const previous = coords[index - 1] ?? current;
    const after = coords[index + 2] ?? next;
    const cp1x = current.px + (next.px - previous.px) / 6;
    const cp1y = current.py + (next.py - previous.py) / 6;
    const cp2x = next.px - (after.px - current.px) / 6;
    const cp2y = next.py - (after.py - current.py) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.px} ${next.py}`;
  }
  return path;
}

function yDomain(points: ChartPoint[]): { yMin: number; ySpread: number } {
  const values = points.map((point) => point.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max), 1) * 0.2;
  const yMin = Math.max(min - spread * 0.25, Math.min(0, min));
  return { yMin, ySpread: max + spread * 0.15 - yMin || 1 };
}

export function ChartEmpty({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="chart-empty-state">
      <span className="chart-empty-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{hint}</p>
    </div>
  );
}

export function TrendChart({
  label,
  points,
  unit,
  color = "var(--acid)",
  formatY = formatCompact,
}: {
  label: string;
  points: ChartPoint[];
  unit: string;
  color?: string;
  formatY?: (value: number) => string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const { yMin, ySpread } = useMemo(() => yDomain(points), [points]);
  if (points.length < 2) return null;

  const coords = plotPoints(points, yMin, ySpread);
  const linePath = smoothPath(coords);
  const areaPath = `${linePath} L ${coords[coords.length - 1].px} ${VIEW_H - PAD.bottom} L ${coords[0].px} ${VIEW_H - PAD.bottom} Z`;
  const minIndex = points.reduce((best, point, index) => (point.y < points[best].y ? index : best), 0);
  const maxIndex = points.reduce((best, point, index) => (point.y > points[best].y ? index : best), 0);
  const gridRows = [0.25, 0.5, 0.75];
  const hovered = hover === null ? null : { point: points[hover], coord: coords[hover] };

  return (
    <div className="trend-chart" role="img" aria-label={label}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
          setHover(Math.round(fraction * (points.length - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {gridRows.map((row) => (
          <line
            key={row}
            className="chart-grid-line"
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={PAD.top + (VIEW_H - PAD.top - PAD.bottom) * row}
            y2={PAD.top + (VIEW_H - PAD.top - PAD.bottom) * row}
          />
        ))}
        <line className="chart-baseline" x1={PAD.left} x2={VIEW_W - PAD.right} y1={VIEW_H - PAD.bottom} y2={VIEW_H - PAD.bottom} />
        <path className="trend-area" d={areaPath} fill={`url(#${gradientId})`} />
        <path className="trend-line" d={linePath} pathLength={1} style={{ stroke: color }} />
        {[minIndex, maxIndex].map((index) => (
          <g key={index} className="trend-extremum">
            <circle cx={coords[index].px} cy={coords[index].py} r={3} style={{ fill: color }} />
            <text x={coords[index].px} y={coords[index].py - 8} textAnchor="middle">
              {formatY(points[index].y)}
            </text>
          </g>
        ))}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((index) => (
          <text
            key={index}
            className="chart-x-label"
            x={coords[index].px}
            y={VIEW_H - 8}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          >
            {shortDate(points[index].x)}
          </text>
        ))}
        {hovered && (
          <g className="chart-crosshair">
            <line x1={hovered.coord.px} x2={hovered.coord.px} y1={PAD.top} y2={VIEW_H - PAD.bottom} />
            <circle cx={hovered.coord.px} cy={hovered.coord.py} r={4} style={{ fill: color }} />
          </g>
        )}
      </svg>
      {hovered && (
        <div className="chart-tooltip" style={{ left: `${(hovered.coord.px / VIEW_W) * 100}%`, top: `${(hovered.coord.py / VIEW_H) * 100}%` }}>
          <strong>{formatY(hovered.point.y)} {unit}</strong>
          <span>{shortDate(hovered.point.x)}</span>
        </div>
      )}
    </div>
  );
}

export interface StrengthSeries {
  name: string;
  points: ChartPoint[];
}

export function MultiLineChart({
  label,
  series,
  unit,
  formatY = formatCompact,
}: {
  label: string;
  series: StrengthSeries[];
  unit: string;
  formatY?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const usable = series.filter((item) => item.points.length > 0);
  const domain = useMemo(() => {
    const dates = usable.flatMap((item) => item.points.map((point) => new Date(`${point.x.slice(0, 10)}T12:00:00`).getTime()));
    const values = usable.flatMap((item) => item.points.map((point) => point.y));
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || Math.max(Math.abs(max), 1) * 0.2;
    return {
      minDate,
      maxDate,
      dateSpread: Math.max(maxDate - minDate, 86_400_000),
      yMin: Math.max(min - spread * 0.25, 0),
      ySpread: max + spread * 0.2 - Math.max(min - spread * 0.25, 0) || 1,
    };
  }, [usable]);
  if (usable.length === 0) return null;

  const toPx = (date: string) => PAD.left + ((new Date(`${date.slice(0, 10)}T12:00:00`).getTime() - domain.minDate) / domain.dateSpread) * (VIEW_W - PAD.left - PAD.right);
  const toPy = (value: number) => PAD.top + (VIEW_H - PAD.top - PAD.bottom) - ((value - domain.yMin) / domain.ySpread) * (VIEW_H - PAD.top - PAD.bottom);
  const hoverDate = hover === null ? null : new Date(domain.minDate + hover * domain.dateSpread).toISOString().slice(0, 10);
  const hoverRows = hoverDate === null ? [] : usable.map((item, index) => {
    const nearest = item.points.reduce((best, point) =>
      Math.abs(new Date(`${point.x.slice(0, 10)}T12:00:00`).getTime() - new Date(`${hoverDate}T12:00:00`).getTime()) <
      Math.abs(new Date(`${best.x.slice(0, 10)}T12:00:00`).getTime() - new Date(`${hoverDate}T12:00:00`).getTime()) ? point : best);
    return { name: item.name, point: nearest, color: SERIES_COLORS[index % SERIES_COLORS.length] };
  });

  return (
    <div className="trend-chart multi-line-chart" role="img" aria-label={label}>
      <div className="chart-legend" aria-hidden="true">
        {usable.map((item, index) => (
          <span key={item.name}><i style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{item.name}</span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setHover(Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75].map((row) => (
          <line key={row} className="chart-grid-line" x1={PAD.left} x2={VIEW_W - PAD.right} y1={PAD.top + (VIEW_H - PAD.top - PAD.bottom) * row} y2={PAD.top + (VIEW_H - PAD.top - PAD.bottom) * row} />
        ))}
        <line className="chart-baseline" x1={PAD.left} x2={VIEW_W - PAD.right} y1={VIEW_H - PAD.bottom} y2={VIEW_H - PAD.bottom} />
        {usable.map((item, index) => {
          const color = SERIES_COLORS[index % SERIES_COLORS.length];
          const coords = item.points.map((point) => ({ px: toPx(point.x), py: toPy(point.y) }));
          return (
            <g key={item.name}>
              <path className="trend-line" style={{ stroke: color, animationDelay: `${index * 120}ms` }} d={smoothPath(coords)} pathLength={1} />
              {coords.map((coord, coordIndex) => (
                <circle key={coordIndex} className="multi-line-dot" cx={coord.px} cy={coord.py} r={2.4} style={{ fill: color, animationDelay: `${500 + coordIndex * 60}ms` }} />
              ))}
            </g>
          );
        })}
        <text className="chart-x-label" x={PAD.left} y={VIEW_H - 8} textAnchor="start">{shortDate(new Date(domain.minDate).toISOString())}</text>
        <text className="chart-x-label" x={VIEW_W - PAD.right} y={VIEW_H - 8} textAnchor="end">{shortDate(new Date(domain.maxDate).toISOString())}</text>
        {hover !== null && (
          <line className="chart-crosshair-line" x1={PAD.left + hover * (VIEW_W - PAD.left - PAD.right)} x2={PAD.left + hover * (VIEW_W - PAD.left - PAD.right)} y1={PAD.top} y2={VIEW_H - PAD.bottom} />
        )}
      </svg>
      {hover !== null && hoverDate && (
        <div className="chart-tooltip multi-tooltip" style={{ left: `${(PAD.left + hover * (VIEW_W - PAD.left - PAD.right)) / VIEW_W * 100}%`, top: "18%" }}>
          <span>{shortDate(hoverDate)}</span>
          {hoverRows.map((row) => (
            <strong key={row.name}><i style={{ background: row.color }} />{row.name}: {formatY(row.point.y)} {unit}</strong>
          ))}
        </div>
      )}
    </div>
  );
}

export function VolumeBars({
  label,
  bars,
  unit,
  formatY = formatCompact,
}: {
  label: string;
  bars: ChartPoint[];
  unit: string;
  formatY?: (value: number) => string;
}) {
  const maximum = Math.max(...bars.map((bar) => bar.y), 1);
  const labelEvery = Math.max(Math.ceil(bars.length / 10), 1);
  const showValues = bars.length <= 14;
  return (
    <div className="volume-bars" role="img" aria-label={label}>
      {bars.map((bar, index) => (
        <div className="volume-bar" key={bar.x}>
          <span className="volume-bar-value">{showValues && bar.y > 0 ? formatY(bar.y) : ""}</span>
          <span className="volume-bar-track">
            <i className={bar.y > 0 ? "has-volume" : ""} style={{ height: `${Math.max((bar.y / maximum) * 100, 2)}%`, animationDelay: `${Math.min(index * 45, 800)}ms` }} title={bar.y > 0 ? `${formatY(bar.y)} ${unit}` : undefined} />
          </span>
          <span className="volume-bar-label">{index % labelEvery === 0 ? shortDate(bar.x) : ""}</span>
        </div>
      ))}
    </div>
  );
}

export function ConsistencyHeatmap({ days, label }: { days: Array<{ date: string; level: 0 | 1 | 2 | 3 | 4; volumeKg: number }>; label: string }) {
  return (
    <div className="heatmap-wrap" role="img" aria-label={label}>
      <div className="heatmap-grid">
        {days.map((day, index) => (
          <span
            key={day.date}
            className={`heatmap-cell hm-${day.level}`}
            style={{ animationDelay: `${Math.min(index * 6, 900)}ms` }}
            title={`${new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}${day.volumeKg > 0 ? ` · ${formatCompact(day.volumeKg)} kg logged` : " · rest day"}`}
          />
        ))}
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        <span>Less</span>
        <i className="heatmap-cell hm-0" /><i className="heatmap-cell hm-1" /><i className="heatmap-cell hm-2" /><i className="heatmap-cell hm-3" /><i className="heatmap-cell hm-4" />
        <span>More</span>
      </div>
    </div>
  );
}

export function ProgressRing({ value, label, sublabel }: { value: number; label: string; sublabel: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOffset(circumference * (1 - Math.min(Math.max(value, 0), 1))));
    return () => cancelAnimationFrame(frame);
  }, [value, circumference]);
  return (
    <div className="progress-ring">
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle className="ring-track" cx="42" cy="42" r={radius} />
        <circle className="ring-value" cx="42" cy="42" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div className="progress-ring-label">
        <strong>{label}</strong>
        <span>{sublabel}</span>
      </div>
    </div>
  );
}
