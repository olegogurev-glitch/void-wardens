// WebGL post-processing for the 2D scene canvas.
//   • multi-scale bloom (soft-threshold prefilter + dual-filter blur chain)
//   • anamorphic horizontal streaks from white-hot cores
//   • shockwave refraction, chromatic aberration, scanline glitch
//   • hot-overflow whitening, flash/damage tint, vignette, scanlines, film grain
// Post.create() returns null when WebGL is unavailable; the renderer then falls back
// to its plain 2D post (vignette + scanlines).

const MAX_WAVES = 8;

const VS = `
attribute vec2 p;
varying vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const HEAD = `precision mediump float;
varying vec2 uv;
uniform sampler2D src;
uniform vec2 tx;   // one source texel
`;

// 4-tap (16-texel) average + soft-knee threshold on the brightest channel
const FS_PRE = HEAD + `
uniform float thr, knee;
void main() {
  vec3 c = texture2D(src, uv + tx * vec2(-1.0, -1.0)).rgb + texture2D(src, uv + tx * vec2(1.0, -1.0)).rgb
         + texture2D(src, uv + tx * vec2(-1.0, 1.0)).rgb + texture2D(src, uv + tx * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - thr + knee, 0.0, 2.0 * knee);
  rq = rq * rq / (4.0 * knee + 1e-4);
  c *= max(rq, br - thr) / max(br, 1e-4);
  gl_FragColor = vec4(c, 1.0);
}`;

// streak source: only near-white pixels (min channel high) — saturated neon stays out
const FS_PRE_WHITE = HEAD + `
uniform float thr, knee;
void main() {
  vec3 c = texture2D(src, uv + tx * vec2(-1.0, -1.0)).rgb + texture2D(src, uv + tx * vec2(1.0, -1.0)).rgb
         + texture2D(src, uv + tx * vec2(-1.0, 1.0)).rgb + texture2D(src, uv + tx * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float w = smoothstep(thr, thr + knee, min(c.r, min(c.g, c.b)));
  gl_FragColor = vec4(c * w, 1.0);
}`;

const FS_DOWN = HEAD + `
void main() {
  vec3 s = texture2D(src, uv).rgb * 4.0;
  s += texture2D(src, uv - tx).rgb;
  s += texture2D(src, uv + tx).rgb;
  s += texture2D(src, uv + vec2(tx.x, -tx.y)).rgb;
  s += texture2D(src, uv - vec2(tx.x, -tx.y)).rgb;
  gl_FragColor = vec4(s * 0.125, 1.0);
}`;

const FS_UP = HEAD + `
uniform float gain;
void main() {
  vec3 s = texture2D(src, uv + vec2(-tx.x * 2.0, 0.0)).rgb;
  s += texture2D(src, uv + vec2(-tx.x, tx.y)).rgb * 2.0;
  s += texture2D(src, uv + vec2(0.0, tx.y * 2.0)).rgb;
  s += texture2D(src, uv + vec2(tx.x, tx.y)).rgb * 2.0;
  s += texture2D(src, uv + vec2(tx.x * 2.0, 0.0)).rgb;
  s += texture2D(src, uv + vec2(tx.x, -tx.y)).rgb * 2.0;
  s += texture2D(src, uv + vec2(0.0, -tx.y * 2.0)).rgb;
  s += texture2D(src, uv + vec2(-tx.x, -tx.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0 * gain, 1.0);
}`;

// horizontal-only blur used for the anamorphic streak chain
const FS_HBLUR = HEAD + `
uniform float gain;
void main() {
  vec2 h = vec2(tx.x, 0.0);
  vec3 s = texture2D(src, uv).rgb * 0.3;
  s += (texture2D(src, uv - h).rgb + texture2D(src, uv + h).rgb) * 0.25;
  s += (texture2D(src, uv - h * 2.5).rgb + texture2D(src, uv + h * 2.5).rgb) * 0.1;
  gl_FragColor = vec4(s * gain, 1.0);
}`;

const FS_COMP = `precision highp float;
varying vec2 uv;
uniform sampler2D scene, bloom, streak;
uniform float aspect, time, bloomI, streakI, ca, glitch, grain, vig, scanP, scanH, scanA, flashA;
uniform vec3 flashC, tint;
uniform vec4 waves[${MAX_WAVES}];   // center uv, radius, amplitude (height units)
uniform float wwid[${MAX_WAVES}];

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 st = uv;
  // shockwave refraction: a lens-like ring that pulls inside / pushes outside
  vec2 off = vec2(0.0);
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    vec4 w = waves[i];
    if (w.w <= 0.0) continue;
    vec2 d = (st - w.xy) * vec2(aspect, 1.0);
    float dist = length(d);
    float x = (dist - w.z) / wwid[i];
    off += d / max(dist, 1e-4) * (x * exp(-x * x)) * w.w;
  }
  off.x /= aspect;
  st -= off;

  // scanline-band glitch on heavy impacts
  if (glitch > 0.0) {
    float tk = floor(time * 30.0);
    float band = floor(st.y * 54.0);
    float h = hash(vec2(band, tk));
    if (h < glitch * 0.45) st.x += (hash(vec2(band * 1.7, tk + 3.1)) - 0.5) * glitch * 0.09;
  }

  vec2 dc = st - 0.5;
  float r2 = dot(dc, dc);
  vec2 cav = dc * ca * (0.4 + r2 * 3.0);
  vec3 col;
  col.r = texture2D(scene, st + cav).r;
  col.g = texture2D(scene, st).g;
  col.b = texture2D(scene, st - cav).b;

  col += texture2D(bloom, st).rgb * bloomI;
  col += texture2D(streak, st).rgb * streakI * tint;

  // hot overflow bleeds into the other channels → saturated neon cores burn toward white
  vec3 over = max(col - 1.0, 0.0);
  col += (over.r + over.g + over.b) * 0.25;

  // flash + damage tint (edges hit harder)
  float edge = smoothstep(0.08, 0.5, r2);
  col += flashC * flashA * (0.3 + edge * 1.4);

  // vignette
  col *= 1.0 - vig * smoothstep(0.12, 0.62, r2 * 1.35);

  // scanlines
  col *= 1.0 - scanA * step(mod(gl_FragCoord.y, scanP), scanH);

  // grain (also dithers the bloom gradients)
  col += (hash(gl_FragCoord.xy * 0.731 + fract(time * 7.13) * 91.7) - 0.5) * grain;

  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  static create(canvas) {
    try {
      const p = new Post(canvas);
      return p.ok ? p : null;
    } catch (err) {
      console.warn('[post] WebGL post-processing unavailable:', err);
      return null;
    }
  }

  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.lost = false;
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!gl) return;
    this.gl = gl;
    this.isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.init(); if (this.w) this.resize(this.w, this.h); this.lost = false; });
    this.init();
    this.ok = true;
  }

  init() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VS);
    const prog = (fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
        u[name] = gl.getUniformLocation(p, name);
      }
      return { p, u };
    };
    this.P = {
      pre: prog(FS_PRE), white: prog(FS_PRE_WHITE), down: prog(FS_DOWN),
      up: prog(FS_UP), hblur: prog(FS_HBLUR), comp: prog(FS_COMP),
    };

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.sceneTex = this.tex();
    this.black = this.tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.fmt = this.pickFormat();
    this.targets = [];
    this.waveBuf = new Float32Array(MAX_WAVES * 4);
    this.wwBuf = new Float32Array(MAX_WAVES);
  }

  tex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // Half-float targets keep the bloom chain from banding/clipping; 8-bit is the fallback.
  pickFormat() {
    const gl = this.gl;
    const candidates = [];
    if (this.isGL2 && gl.getExtension('EXT_color_buffer_float')) candidates.push({ internal: gl.RGBA16F, type: gl.HALF_FLOAT, hdr: true });
    else if (!this.isGL2) {
      const hf = gl.getExtension('OES_texture_half_float');
      const lin = gl.getExtension('OES_texture_half_float_linear');
      gl.getExtension('EXT_color_buffer_half_float');
      if (hf && lin) candidates.push({ internal: gl.RGBA, type: hf.HALF_FLOAT_OES, hdr: true });
    }
    candidates.push({ internal: gl.RGBA, type: gl.UNSIGNED_BYTE, hdr: false });
    for (const f of candidates) {
      const t = this.tex();
      gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, 4, 4, 0, gl.RGBA, f.type, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb); gl.deleteTexture(t);
      if (ok) return f;
    }
    return candidates[candidates.length - 1];
  }

  target(w, h) {
    const gl = this.gl;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const tex = this.tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, this.fmt.internal, w, h, 0, gl.RGBA, this.fmt.type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const t = { tex, fb, w, h };
    this.targets.push(t);
    return t;
  }

  resize(w, h) {
    const gl = this.gl;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    for (const t of this.targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    this.targets = [];
    // bloom pyramid: 1/2 … 1/32
    this.bloom = [2, 4, 8, 16, 32].map((d) => this.target(w / d, h / d));
    // streak chain: quarter height, width shrinking to 1/64
    this.streak = [4, 8, 16, 32, 64].map((d) => this.target(w / d, h / 4));
  }

  pass(prog, dst, src, srcW, srcH, extra) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : this.w, dst ? dst.h : this.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(prog.u.src, 0);
    if (prog.u.tx) gl.uniform2f(prog.u.tx, 1 / srcW, 1 / srcH);
    if (extra) extra(prog.u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // o: { bloom, bloomI, streakI, ca, glitch, grain, vig, scanP, scanH, scanA, flashA, flashC:[r,g,b], waves:[{x,y,r,w,amp}], time }
  render(source, o) {
    if (this.lost || !this.w) return;
    const gl = this.gl, P = this.P;
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const W = this.w, H = this.h;
    const gain = this.fmt.hdr ? 1 : 0.62;

    let bloomTex = this.black, streakTex = this.black;
    if (o.bloom) {
      const B = this.bloom;
      this.pass(P.pre, B[0], this.sceneTex, W, H, (u) => { gl.uniform1f(u.thr, o.thr ?? 0.42); gl.uniform1f(u.knee, 0.3); });
      for (let i = 1; i < B.length; i++) this.pass(P.down, B[i], B[i - 1].tex, B[i - 1].w, B[i - 1].h);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = B.length - 1; i > 0; i--) this.pass(P.up, B[i - 1], B[i].tex, B[i].w, B[i].h, (u) => gl.uniform1f(u.gain, gain));
      gl.disable(gl.BLEND);
      bloomTex = B[0].tex;

      const S = this.streak;
      this.pass(P.white, S[0], this.sceneTex, W, H, (u) => { gl.uniform1f(u.thr, 0.62); gl.uniform1f(u.knee, 0.3); });
      for (let i = 1; i < S.length; i++) this.pass(P.hblur, S[i], S[i - 1].tex, S[i - 1].w, S[i - 1].h, (u) => gl.uniform1f(u.gain, 1));
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = S.length - 1; i > 0; i--) this.pass(P.hblur, S[i - 1], S[i].tex, S[i].w, S[i].h, (u) => gl.uniform1f(u.gain, gain * 0.9));
      gl.disable(gl.BLEND);
      streakTex = S[0].tex;
    }

    // composite
    const C = P.comp, u = C.u;
    gl.useProgram(C.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.uniform1i(u.scene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomTex); gl.uniform1i(u.bloom, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, streakTex); gl.uniform1i(u.streak, 2);
    gl.uniform1f(u.aspect, W / H);
    gl.uniform1f(u.time, o.time % 1000);
    gl.uniform1f(u.bloomI, (o.bloomI ?? 0.9) / (this.fmt.hdr ? 1 : gain));
    gl.uniform1f(u.streakI, (o.streakI ?? 0.5) / (this.fmt.hdr ? 1 : gain));
    gl.uniform3f(u.tint, 0.45, 0.8, 1.0);
    gl.uniform1f(u.ca, o.ca ?? 0.002);
    gl.uniform1f(u.glitch, o.glitch ?? 0);
    gl.uniform1f(u.grain, o.grain ?? 0.03);
    gl.uniform1f(u.vig, o.vig ?? 0.55);
    gl.uniform1f(u.scanP, o.scanP ?? 3);
    gl.uniform1f(u.scanH, o.scanH ?? 1);
    gl.uniform1f(u.scanA, o.scanA ?? 0.12);
    gl.uniform1f(u.flashA, o.flashA ?? 0);
    const fc = o.flashC || [1, 1, 1];
    gl.uniform3f(u.flashC, fc[0], fc[1], fc[2]);
    const wb = this.waveBuf, ww = this.wwBuf;
    wb.fill(0); ww.fill(1);
    const waves = o.waves || [];
    for (let i = 0; i < Math.min(MAX_WAVES, waves.length); i++) {
      const w = waves[i];
      wb[i * 4] = w.x; wb[i * 4 + 1] = w.y; wb[i * 4 + 2] = w.r; wb[i * 4 + 3] = w.amp;
      ww[i] = Math.max(1e-3, w.w);
    }
    gl.uniform4fv(u.waves, wb);
    gl.uniform1fv(u.wwid, ww);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
