import { TILE, COLS, ROWS } from './config.js';

// One route from a breach to the Core.
export class Path {
  constructor(waypoints) {
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
    this.start = this.points[0];
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

// A sector: one or more paths that converge on a single Core.
export class GameMap {
  constructor(def) {
    this.def = def;
    this.paths = def.paths.map((w) => new Path(w));
    this.core = this.paths[0].points[this.paths[0].points.length - 1];

    this.blocked = new Set();
    for (const waypoints of def.paths) {
      for (let i = 0; i < waypoints.length - 1; i++) {
        let [c, r] = waypoints[i];
        const [c1, r1] = waypoints[i + 1];
        const sc = Math.sign(c1 - c), sr = Math.sign(r1 - r);
        this.block(c, r);
        while (c !== c1 || r !== r1) { c += sc; r += sr; this.block(c, r); }
      }
    }
    const last = def.paths[0][def.paths[0].length - 1];
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) this.block(last[0] + dc, last[1] + dr);
    this.block(last[0] + 2, last[1]);
  }

  block(c, r) { this.blocked.add(c + r * COLS); }

  isBuildable(c, r) {
    return c >= 0 && r >= 0 && c < COLS && r < ROWS && !this.blocked.has(c + r * COLS);
  }
}
