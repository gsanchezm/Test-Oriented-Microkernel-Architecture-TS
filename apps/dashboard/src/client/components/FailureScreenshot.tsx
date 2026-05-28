import { useState } from 'react';

interface FailureScreenshotProps {
  src: string;
}

/**
 * Thumbnail of the failure screenshot captured by the After hook.
 * Clicking the thumbnail opens a full-size lightbox overlay; clicking
 * the overlay (or pressing Escape) dismisses it. Falls back gracefully
 * if the image fails to load (e.g. older runs without screenshots).
 */
export function FailureScreenshot({ src }: FailureScreenshotProps) {
  const [lightbox, setLightbox] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored) return null;

  return (
    <>
      <div className="failure-screenshot-wrap">
        <div className="failure-screenshot-label">Failure screenshot</div>
        <button
          type="button"
          className="failure-screenshot-thumb-btn"
          aria-label="View failure screenshot full size"
          onClick={() => setLightbox(true)}
        >
          <img
            src={src}
            alt="Failure screenshot"
            className="failure-screenshot-thumb"
            loading="lazy"
            onError={() => setErrored(true)}
          />
          <span className="failure-screenshot-zoom-hint">Click to enlarge</span>
        </button>
      </div>

      {lightbox && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          className="failure-screenshot-lightbox"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Failure screenshot lightbox"
          onKeyDown={(e) => { if (e.key === 'Escape') setLightbox(false); }}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          <img
            src={src}
            alt="Failure screenshot (full size)"
            className="failure-screenshot-full"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="failure-screenshot-close"
            onClick={() => setLightbox(false)}
            aria-label="Close lightbox"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
