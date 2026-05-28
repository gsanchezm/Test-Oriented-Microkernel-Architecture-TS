import { useState } from 'react';

import type { VisualDiffImages } from '@shared/types';

interface DiffTripletProps {
  /**
   * baseline / actual / diff sources. `baseline` and `diff` are optional:
   * baseline is absent on first-run bootstrap, diff is absent when the snapshot
   * is identical / within tolerance (no diff PNG is produced — requesting it 500s).
   */
  images: VisualDiffImages;
}

/** Centered muted placeholder for an absent/failed image cell. */
function CellPlaceholder({ label, body, labelColor }: { label: string; body: string; labelColor?: string }) {
  return (
    <div className="diff-cell">
      <span className="label" style={labelColor ? { color: labelColor } : undefined}>
        {label}
      </span>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 16,
          color: 'var(--text-mute)',
          fontSize: 12.5,
        }}
      >
        {body}
      </div>
    </div>
  );
}

/**
 * Pure presentational triplet: baseline / actual / diff overlay for one
 * visual comparison. The `.diff-cell img` rule in styles.css already sets
 * width/height/object-fit — don't re-style inline.
 *
 * `baseline` and `diff` may be undefined (see VisualDiffImages). When a source
 * is missing — or its `<img>` fails to load — a muted placeholder cell renders
 * instead of a broken-image icon.
 */
export function DiffTriplet({ images }: DiffTripletProps) {
  const [baselineErr, setBaselineErr] = useState(false);
  const [actualErr, setActualErr] = useState(false);
  const [diffErr, setDiffErr] = useState(false);

  const showBaseline = !!images.baseline && !baselineErr;
  const showActual = !!images.actual && !actualErr;
  const showDiff = !!images.diff && !diffErr;

  return (
    <div className="diff-grid">
      {showBaseline ? (
        <div className="diff-cell">
          <span className="label">Baseline</span>
          <img src={images.baseline} alt="Baseline" loading="lazy" onError={() => setBaselineErr(true)} />
        </div>
      ) : (
        <CellPlaceholder label="Baseline" body="Sin baseline" />
      )}

      {showActual ? (
        <div className="diff-cell">
          <span className="label">Actual</span>
          <img src={images.actual} alt="Actual" loading="lazy" onError={() => setActualErr(true)} />
        </div>
      ) : (
        <CellPlaceholder label="Actual" body="Sin captura" />
      )}

      {showDiff ? (
        <div className="diff-cell">
          <span className="label" style={{ color: 'var(--fail)' }}>Diff overlay</span>
          <img src={images.diff} alt="Diff overlay" loading="lazy" onError={() => setDiffErr(true)} />
        </div>
      ) : (
        <CellPlaceholder label="Diff overlay" body="✓ Idéntico — sin diferencias" />
      )}
    </div>
  );
}
