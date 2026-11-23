"""Overlapping, bounded-size raster analysis in original sheet coordinates."""

import cv2
import numpy as np


def tile_origins(length, size=1024, overlap=128):
    return sorted(
        set(range(0, max(1, length - size + 1), size - overlap)) | {max(0, length - size)}
    )


def extract_lines(gray, progress=lambda *_: None):
    h, w = gray.shape
    regions = [(x, y) for y in tile_origins(h) for x in tile_origins(w)]
    raw = []
    for index, (x, y) in enumerate(regions):
        progress(
            45 + int(15 * index / len(regions)), f'Analizando zona {index + 1} de {len(regions)}…'
        )
        tile = gray[y : y + 1024, x : x + 1024]
        blur = cv2.GaussianBlur(tile, (0, 0), 18)
        normalized = cv2.divide(tile, blur, scale=255)
        edges = cv2.Canny(normalized, 55, 155)
        found = cv2.HoughLinesP(edges, 1, np.pi / 360, 24, minLineLength=24, maxLineGap=3)
        if found is not None:
            raw.extend(found.reshape(-1, 4) + np.array([x, y, x, y]))
    # Shift edge detections onto the centre of their actual ink stroke. This
    # avoids reconstructing the two sides of a filled wall as separate walls.
    centered, widths = [], []
    offsets = np.arange(-24, 25)
    for line in raw:
        line = np.asarray(line, dtype=float)
        delta = line[2:] - line[:2]
        normal = np.array([-delta[1], delta[0]]) / np.linalg.norm(delta)
        centres, strokes = [], []
        for t in np.linspace(0.1, 0.9, 9):
            p = line[:2] + t * delta
            samples = np.rint(p + offsets[:, None] * normal).astype(int)
            ink = gray[np.clip(samples[:, 1], 0, h - 1), np.clip(samples[:, 0], 0, w - 1)] < 145
            near = np.flatnonzero(ink & (np.abs(offsets) <= 3))
            if not len(near):
                continue
            seed = near[np.argmin(np.abs(offsets[near]))]
            lo = hi = seed
            while lo > 0 and ink[lo - 1]:
                lo -= 1
            while hi < len(ink) - 1 and ink[hi + 1]:
                hi += 1
            centres.append((offsets[lo] + offsets[hi]) / 2)
            strokes.append(hi - lo + 1)
        if centres:
            line += np.tile(normal * np.median(centres), 2)
        centered.append(line)
        widths.append(float(np.median(strokes)) if strokes else 0)
    # Only use stroke hierarchy when substantial bold geometry is present.
    # Thin, double-outline CAD plans keep their strokes for geometric review.
    lengths = np.array([np.linalg.norm(l[2:] - l[:2]) for l in centered])
    bold = np.array(widths) >= 3
    filtered = 0
    if len(lengths) and lengths[bold].sum() > max(500, lengths.sum() * 0.25):
        filtered = int((~bold).sum())
        centered = [l for l, keep in zip(centered, bold) if keep]
    return centered, {'tiles': len(regions), 'thin_candidates_removed': filtered}
