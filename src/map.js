import { TILE, COLS, ROWS } from './config.js';

// Serpentine route through the sector, in tile coordinates.
// First point = rift portal, last point = Nexus core.
export const WAYPOINTS = [
  [0, 4], [7, 4], [7, 13], [14, 13], [14, 4], [21, 4], [21, 13], [27, 13], [27, 8], [30, 8],
];

export class GameMap {
  constructor(waypoints = WAYPOINTS) {
    this.points = waypoints.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }));
    this.segs = [];
    let acc = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i], b = this.points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      this.segs.push({ x0: a.x, y0: a.y, ux: dx / len, uy: dy / len, len, start: acc, angle: Math.atan2(dy, dx) });
      acc += len;
    }
    this.length = acc;
    this.portal = this.points[0];
    this.core = this.points[this.points.length - 1];

    // Tiles you can't build on: the path itself and the core pad
    this.blocked = new Set();
    for (let i = 0; i < waypoints.length - 1; i++) {
      let [c, r] = waypoints[i];
      const [c1, r1] = waypoints[i + 1];
      const sc = Math.sign(c1 - c), sr = Math.sign(r1 - r);
      this.block(c, r);
      while (c !== c1 || r !== r1) { c += sc; r += sr; this.block(c, r); }
    }
    const [cc, cr] = waypoints[waypoints.length - 1];
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) this.block(cc + dc, cr + dr);
    this.block(cc + 2, cr);
  }

  block(c, r) { this.blocked.add(c + r * COLS); }

  isBuildable(c, r) {
    return c >= 0 && r >= 0 && c < COLS && r < ROWS && !this.blocked.has(c + r * COLS);
  }

  // Position along the path at distance d, offset sideways by `lane` px
  posAt(d, lane = 0) {
    const segs = this.segs;
    let s = segs[segs.length - 1];
    if (d <= 0) s = segs[0];
    else {
      for (let i = 0; i < segs.length; i++) {
        if (d <= segs[i].start + segs[i].len) { s = segs[i]; break; }
      }
    }
    const t = Math.min(s.len, Math.max(0, d - s.start));
    return {
      x: s.x0 + s.ux * t - s.uy * lane,
      y: s.y0 + s.uy * t + s.ux * lane,
      angle: s.angle,
    };
  }
}
