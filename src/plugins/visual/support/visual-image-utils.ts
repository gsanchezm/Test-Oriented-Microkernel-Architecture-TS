// PNG read/write + Pixelmatch comparison.
//
// `pixelmatch` is a small WebGL-free pure-JS implementation of the
// perceptual diff algorithm; combined with `pngjs` it gives us a fully
// open-source, reproducible visual oracle. No commercial dependency.

import { readFileSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { VisualThresholdsApplied } from '@plugins/visual/support/visual-result.types';

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

export function comparePngBuffers(
    actual: Buffer,
    baseline: Buffer,
    thresholds: VisualThresholdsApplied,
    pixelmatchThreshold = 0.1,
): CompareResult {
    const a = decodePng(actual);
    const b = decodePng(baseline);

    if (a.width !== b.width || a.height !== b.height) {
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
            error: `Image size mismatch: actual=${a.width}x${a.height}, baseline=${b.width}x${b.height}`,
        };
    }

    const diff = new PNG({ width: a.width, height: a.height });
    const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
        threshold: pixelmatchThreshold,
        includeAA: false,
    });
    const totalPixels = a.width * a.height;
    const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;

    const passed =
        diffPixels <= thresholds.maxDiffPixels &&
        diffRatio <= thresholds.maxDiffRatio;

    return {
        width: a.width,
        height: a.height,
        diffPixels,
        totalPixels,
        diffRatio,
        passed,
        thresholdUsed: thresholds,
        diffPng: PNG.sync.write(diff),
        sizeMismatch: false,
        error: null,
    };
}
