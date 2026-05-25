import { useEffect, useState } from 'react';

const COLORS = {
  pass: 'oklch(0.78 0.16 155)',
  fail: 'oklch(0.68 0.22 22)',
  skip: 'oklch(0.78 0.13 80)',
  trackBg: 'oklch(0.28 0.04 290)',
};

interface PassFailDonutProps {
  passed: number;
  failed: number;
  skipped: number;
  size?: number;
  thickness?: number;
  /** Bump to replay the entrance animation (e.g. on platform switch). */
  animateKey?: string | number;
  /** Render a flat muted ring with "—" centered (no data). */
  empty?: boolean;
}

export function PassFailDonut({
  passed,
  failed,
  skipped,
  size = 110,
  thickness = 12,
  animateKey,
  empty = false,
}: PassFailDonutProps) {
  const rawTotal = passed + failed + skipped;
  const total = Math.max(1, rawTotal);
  // Auto-detect the empty state: when there's literally nothing to show,
  // fall through to the "—" muted ring without callers having to pass empty.
  const isEmpty = empty || rawTotal === 0;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const segs = isEmpty
    ? []
    : [
        { v: passed,  color: COLORS.pass, key: 'p' },
        { v: failed,  color: COLORS.fail, key: 'f' },
        { v: skipped, color: COLORS.skip, key: 's' },
      ];
  const passPct = isEmpty ? null : Math.round((passed / total) * 100);

  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    setDrawn(false);
    const t = setTimeout(() => setDrawn(true), 30);
    return () => clearTimeout(t);
  }, [animateKey]);

  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={COLORS.trackBg}
          strokeWidth={thickness}
        />
        {segs.map((s) => {
          const len = (s.v / total) * circumference;
          const node = (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
              strokeDasharray={`${drawn ? len : 0} ${circumference}`}
              strokeDashoffset={-offset}
              style={{ transition: 'stroke-dasharray .9s cubic-bezier(.2,.7,.2,1)' }}
            />
          );
          offset += len;
          return node;
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font)',
        }}
      >
        <div style={{ fontSize: size > 130 ? 26 : 22, fontWeight: 700, letterSpacing: '-0.02em', color: isEmpty ? 'var(--text-dim)' : undefined }}>
          {passPct === null ? '—' : `${passPct}%`}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-mute)',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            marginTop: 2,
          }}
        >
          {isEmpty ? 'No data' : 'Pass'}
        </div>
      </div>
    </div>
  );
}
