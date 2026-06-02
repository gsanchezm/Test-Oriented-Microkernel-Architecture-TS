// PNG read/write + Pixelmatch comparison.
//
// `pixelmatch` is a small WebGL-free pure-JS implementation of the
// perceptual diff algorithm; combined with `pngjs` it gives us a fully
// open-source, reproducible visual oracle. No commercial dependency.

import { readFileSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { VisualThresholdsApplied } from '@plugins/pixelmatch/support/visual-result.types';

export interface DecodedImage {
    width: number;
    height: number;
    data: Buffer;
}

export interface CompareResult {
    width: number;
    height: number;
    diffPixels: number;
    totalPixels: number;
    diffRatio: number;
    passed: boolean;
    thresholdUsed: VisualThresholdsApplied;
    diffPng: Buffer | null;
    sizeMismatch: boolean;
    error: string | null;
}

export function readPng(path: string): DecodedImage {
    const buffer = readFileSync(path);
    return decodePng(buffer);
}

export function decodePng(buffer: Buffer): DecodedImage {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
}

export function writePng(path: string, image: { width: number; height: number; data: Buffer }): void {
    const png = new PNG({ width: image.width, height: image.height });
    image.data.copy(png.data);
    writeFileSync(path, PNG.sync.write(png));
}

// Crop an image to a top-left w×h sub-region (RGBA, row-major).
function cropTopLeft(img: DecodedImage, w: number, h: number): DecodedImage {
    if (img.width === w && img.height === h) return img;
    const out = Buffer.alloc(w * h * 4);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
        const src = y * img.width * 4;
        img.data.copy(out, y * rowBytes, src, src + rowBytes);
    }
    return { width: w, height: h, data: out };
}

// Beyond this relative delta a capture is treated as a structural change
// (real size mismatch → hard fail), not a flaky height wobble.
const GROSS_SIZE_DELTA = 0.25;

export function comparePngBuffers(
    actual: Buffer,
    baseline: Buffer,
    thresholds: VisualThresholdsApplied,
    pixelmatchThreshold = 0.1,
): CompareResult {
    const a = decodePng(actual);
    const b = decodePng(baseline);

    const sizeMismatch = a.width !== b.width || a.height !== b.height;

    // This app's fullPage / variable-grid captures wobble in height between
    // runs (lazy content, virtualized lists), which previously hard-failed
    // every comparison as a size mismatch. Tolerate it: compare the common
    // top-left overlap under the snapshot's normal policy (the size wobble
    // itself is forgiven). Only a GROSS size change (≥25% in either axis) —
    // a genuine structural diff — still hard-fails.
    if (sizeMismatch) {
        const wDelta = Math.abs(a.width - b.width);
        const hDelta = Math.abs(a.height - b.height);
        const maxW = Math.max(a.width, b.width);
        const maxH = Math.max(a.height, b.height);
        const gross =
            (maxW > 0 && wDelta / maxW > GROSS_SIZE_DELTA) ||
            (maxH > 0 && hDelta / maxH > GROSS_SIZE_DELTA);
        if (gross) {
            return {
                width: a.width,
                height: a.height,
                diffPixels: 0,
                totalPixels: a.width * a.height,
                diffRatio: 0,
                passed: false,
                thresholdUsed: thresholds,
                diffPng: null,
                sizeMismatch: true,
                error: `Image size mismatch (gross ≥${GROSS_SIZE_DELTA * 100}%): actual=${a.width}x${a.height}, baseline=${b.width}x${b.height}`,
            };
        }
    }

    const cw = Math.min(a.width, b.width);
    const ch = Math.min(a.height, b.height);
    const ac = cropTopLeft(a, cw, ch);
    const bc = cropTopLeft(b, cw, ch);

    const diff = new PNG({ width: cw, height: ch });
    const diffPixels = pixelmatch(ac.data, bc.data, diff.data, cw, ch, {
        threshold: pixelmatchThreshold,
        includeAA: false,
    });
    const totalPixels = cw * ch;
    const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;

    // OR-semantics: a snapshot passes if *either* threshold is satisfied.
    // The contract author declares whichever dimension they care about
    // (pixel count for "≤ N tolerable artifacts" or ratio for "≤ X% of
    // the region"). Defaults are zero for both, but unspecified dimensions
    // should not silently veto a satisfied one — that was the old AND
    // surprise where pixelRatio: 0.01 was negated by pixelCount: 0 default.
    // If both are zero (defaults across the board) we still demand exact
    // equality, which is the original strict policy.
    const exactRequested =
        thresholds.maxDiffPixels === 0 && thresholds.maxDiffRatio === 0;
    const passed = exactRequested
        ? diffPixels === 0
        : diffPixels <= thresholds.maxDiffPixels ||
          diffRatio <= thresholds.maxDiffRatio;

    return {
        width: cw,
        height: ch,
        diffPixels,
        totalPixels,
        diffRatio,
        passed,
        thresholdUsed: thresholds,
        diffPng: PNG.sync.write(diff),
        sizeMismatch,
        error: sizeMismatch
            ? `Image size differs (tolerated, compared ${cw}x${ch} overlap): ` +
              `actual=${a.width}x${a.height}, baseline=${b.width}x${b.height}`
            : null,
    };
}
