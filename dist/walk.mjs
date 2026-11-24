// Walkthrough movement: collisions with walls, sliding, and help through doors.
// Positions are in metres, centred on the model like the 3D scene (x across, z down
// the plan); `model` is { W, D, T, walls, rooms } with walls in normalised plan units.

/** Half the walker's width: what has to fit between a wall and the camera. */
export const BODY = 0.12;

/**
 * Position of (x, z) relative to a wall segment: `along` is the distance past either
 * end (0 within its span), `across` the distance to its axis, `t` the projection (0–1).
 */
function relative(model, x, z, s) {
  const { W, D } = model,
    ax = (s.a.x - 0.5) * W,
    az = (s.a.y - 0.5) * D,
    dx = (s.b.x - s.a.x) * W,
    dz = (s.b.y - s.a.y) * D,
    L = Math.hypot(dx, dz) || 1e-9,
    u = ((x - ax) * dx + (z - az) * dz) / L;
  return {
    L,
    t: u / L,
    along: Math.max(0, -u, u - L),
    across: Math.abs((x - ax) * dz - (z - az) * dx) / L,
    ux: dx / L,
    uz: dz / L,
  };
}

export function blocked(model, x, z, ghost = false) {
  if (!model) return true;
  const { W, D, T, walls } = model;
  if (ghost) return Math.abs(x) > W / 2 + 3 || Math.abs(z) > D / 2 + 3;
  if (Math.abs(x) > W / 2 || Math.abs(z) > D / 2) return true;
  // Walls are boxes with square ends (not capsules), so a door's full width stays free:
  // only the walker's own half-width is kept away from the jambs.
  return walls.some((s) => {
    if (s.type === 'door') return false;
    const r = relative(model, x, z, s);
    return r.across < (s.thickness || T) / 2 + BODY && r.along < BODY;
  });
}

/** Nudge a step sideways towards the clear part of a door the walker is heading through. */
function doorAssist(model, p, dx, dz) {
  const step = Math.hypot(dx, dz);
  let best = null;
  for (const s of model.walls) {
    if (s.type !== 'door') continue;
    const r = relative(model, p.x, p.z, s);
    if (r.across > 0.9 || r.along > 0.35 || r.L < 2 * BODY + 0.05) continue;
    // Only when moving across the door, not along the wall.
    if (Math.abs(dx * -r.uz + dz * r.ux) < 0.45 * step) continue;
    if (!best || r.across < best.across) best = r;
  }
  if (!best) return [dx, dz];
  const margin = Math.min(0.5, (BODY + 0.06) / best.L),
    offset = (Math.max(margin, Math.min(1 - margin, best.t)) - best.t) * best.L,
    push = Math.max(-0.6 * step, Math.min(0.6 * step, offset));
  return [dx + best.ux * push, dz + best.uz * push];
}

/** Move `p` ({ x, z }, changed in place), sliding along whatever is in the way. */
export function move(model, p, dx, dz, ghost = false) {
  if (!model || (!dx && !dz)) return p;
  // Inside a wall (e.g. after walking through walls): move freely until clear.
  if (blocked(model, p.x, p.z, ghost)) {
    const { W, D } = model;
    p.x = Math.max(-W / 2 - 3, Math.min(W / 2 + 3, p.x + dx));
    p.z = Math.max(-D / 2 - 3, Math.min(D / 2 + 3, p.z + dz));
    return p;
  }
  if (!ghost) [dx, dz] = doorAssist(model, p, dx, dz);
  // Straight on if possible, otherwise the step turned towards the obstacle's surface
  // and shortened by the cosine of the turn: that slides along walls at any angle.
  for (const a of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
    const c = Math.cos(a),
      sn = Math.sin(a),
      mx = (dx * c - dz * sn) * c,
      mz = (dx * sn + dz * c) * c;
    if (!blocked(model, p.x + mx, p.z + mz, ghost)) {
      p.x += mx;
      p.z += mz;
      return p;
    }
  }
  return p;
}

/** A free spot inside a room, as normalised plan coordinates: the one closest to its centre. */
export function roomSpot(model, room) {
  const { W, D } = model;
  const spots = room.runs
    .flatMap((r) => [0.5, 0.25, 0.75].map((f) => ({ x: r.x + r.w * f, y: r.y + r.h / 2 })))
    .sort(
      (p, q) =>
        Math.hypot((p.x - room.center.x) * W, (p.y - room.center.y) * D) -
        Math.hypot((q.x - room.center.x) * W, (q.y - room.center.y) * D),
    );
  return spots.find((p) => !blocked(model, (p.x - 0.5) * W, (p.y - 0.5) * D));
}
