interface DiffTripletProps {
  images: { baseline: string; actual: string; diff: string };
}

/**
 * Pure presentational triplet: baseline / actual / diff overlay for one
 * visual comparison. The `.diff-cell img` rule in styles.css already sets
 * width/height/object-fit — don't re-style inline.
 */
export function DiffTriplet({ images }: DiffTripletProps) {
  return (
    <div className="diff-grid">
      <div className="diff-cell">
        <span className="label">Baseline</span>
        <img src={images.baseline} alt="Baseline" loading="lazy" />
      </div>
      <div className="diff-cell">
        <span className="label">Actual</span>
        <img src={images.actual} alt="Actual" loading="lazy" />
      </div>
      <div className="diff-cell">
        <span className="label" style={{ color: 'var(--fail)' }}>Diff overlay</span>
        <img src={images.diff} alt="Diff overlay" loading="lazy" />
      </div>
    </div>
  );
}
