import { useEffect, useState } from 'react';

interface SpeedometerProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  thresholdGood: number;
  thresholdBad: number;
  /** If true, lower values are good (latency, error rate). Default false. */
  invert?: boolean;
}

export function Speedometer({
  value,
  max,
  label,
  unit,
  thresholdGood,
  thresholdBad,
  invert = false,
}: SpeedometerProps) {
  // 220 deg sweep from -200 to +20 (gauge opens at the bottom)
  const startAngle = -200;
  const endAngle = 20;
  const range = endAngle - startAngle; // 220
  const clamped = Math.max(0, Math.min(value, max));
  const pct = max === 0 ? 0 : clamped / max;
  const angle = startAngle + range * pct;

  const size = 180;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = 70;

  const polarToCart = (a: number): [number, number] => {
    const rad = (a * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };

  const arcPath = (a1: number, a2: number) => {
    const [x1, y1] = polarToCart(a1);
    const [x2, y2] = polarToCart(a2);
    const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  // Color zones — purple gradient with green/yellow/red overlay at end
  let color: string;
  if (invert) {
    color =
      pct < thresholdGood / max
        ? 'var(--pass)'
        : pct < thresholdBad / max
          ? 'var(--skip)'
          : 'var(--fail)';
  } else {
    color =
      pct < thresholdGood / max
        ? 'var(--fail)'
        : pct < thresholdBad / max
          ? 'var(--skip)'
          : 'var(--pass)';
  }

  const [needleAngle, setNeedleAngle] = useState(startAngle);
  useEffect(() => {
    const t = setTimeout(() => setNeedleAngle(angle), 60);
    return () => clearTimeout(t);
  }, [angle]);

  // Tick marks
  const ticks = [];
  const tickCount = 10;
  for (let i = 0; i <= tickCount; i++) {
    const a = startAngle + (range * i) / tickCount;
    const inner = 7;
    const outer = 13;
    const rad = (a * Math.PI) / 180;
    const x1 = cx + (r - outer) * Math.cos(rad);
    const y1 = cy + (r - outer) * Math.sin(rad);
    const x2 = cx + (r - inner) * Math.cos(rad);
    const y2 = cy + (r - inner) * Math.sin(rad);
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="oklch(0.45 0.04 290)"
        strokeWidth={i % 2 === 0 ? 2 : 1}
      />,
    );
  }

  const [nx, ny] = polarToCart(needleAngle);
  const gradientId = `g-${label.replace(/\W/g, '')}`;
  const displayValue =
    typeof value === 'number' && value > 1000 ? value.toLocaleString() : value;

  return (
    <div className="gauge">
      <div className="label">{label}</div>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size + 6}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.55 0.16 295)" />
            <stop offset="100%" stopColor="oklch(0.78 0.15 330)" />
          </linearGradient>
        </defs>
        <path
          d={arcPath(startAngle, endAngle)}
          stroke="oklch(0.27 0.04 290)"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={arcPath(startAngle, startAngle + range * pct)}
          stroke={`url(#${gradientId})`}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          style={{ transition: 'd 0.8s ease' }}
        />
        {ticks}
        {/* needle */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="oklch(0.95 0.02 290)"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transition: 'all .9s cubic-bezier(.2,.7,.2,1)' }}
        />
        <circle cx={cx} cy={cy} r="6" fill="oklch(0.95 0.02 290)" />
        <circle cx={cx} cy={cy} r="3" fill="oklch(0.18 0.03 290)" />
      </svg>
      <div className="value" style={{ color }}>
        {displayValue}
      </div>
      <div className="unit">{unit}</div>
    </div>
  );
}
