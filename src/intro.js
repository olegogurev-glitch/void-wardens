// Boot console shown on load: the grid monitor detects the breach, traces it to the Core,
// and asks the player to deploy. One button — YES — which also unlocks audio and lets the
// caller go fullscreen/landscape (that has to happen inside the click).
// DOM only; nothing here touches the simulation.

const LINES = [
  { t: 'boot core.sys', st: 'OK', c: 'ok' },
  { t: 'link data bus [01][02]', st: 'OK', c: 'ok' },
  { t: 'scan perimeter', st: 'ANOMALY', c: 'warn', pause: 260 },
  { t: '!! BREACH DETECTED · GRID EDGE · SECTOR 01', c: 'alert', pause: 200 },
  { t: '!! hostile code signatures', st: 'count', c: 'alert' },
  { t: 'trace intrusion target', st: 'THE CORE', c: 'alert', pause: 220 },
  { t: 'core integrity forecast', st: '0% IN 04:00', c: 'alert' },
  { t: 'warden protocol', st: 'STANDING BY', c: 'info', pause: 300 },
];

const esc = (s) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);

export function runIntro({ onDeploy, reduced = false }) {
  const root = document.createElement('div');
  root.className = 'boot';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Breach alert');
  root.innerHTML = `
    <div class="boot-frame">
      <div class="boot-head"><span class="boot-mark"></span>PIXO//SYS <i>·</i> GRID MONITOR <b>v4.17</b><span class="boot-clock"></span></div>
      <div class="boot-log" aria-live="polite"></div>
      <div class="boot-threat"><span>THREAT</span><i class="boot-bar"><i></i></i><b>0%</b></div>
      <div class="boot-ask" hidden>
        <div class="boot-q">&gt; DEPLOY THE PROTECTION?<span class="boot-cursor"></span></div>
        <button class="boot-yes" type="button">YES</button>
        <div class="boot-hint">Enter ↵ · goes fullscreen, landscape</div>
      </div>
    </div>`;
  document.body.appendChild(root);
  const log = root.querySelector('.boot-log');
  const bar = root.querySelector('.boot-bar > i'), pct = root.querySelector('.boot-threat b');
  const ask = root.querySelector('.boot-ask'), yes = root.querySelector('.boot-yes');
  const clock = root.querySelector('.boot-clock');

  const t0 = performance.now();
  let skip = reduced, done = false, threat = 0, timer = null;
  const stamp = () => {
    const s = (performance.now() - t0) / 1000;
    return `[00:00:${String(Math.floor(s)).padStart(2, '0')}.${String(Math.floor((s % 1) * 100)).padStart(2, '0')}]`;
  };
  const clockTick = setInterval(() => { clock.textContent = stamp(); }, 50);
  const wait = (ms) => new Promise((r) => { if (skip) r(); else timer = setTimeout(r, ms); });

  const setThreat = (v) => {
    threat = v;
    bar.style.width = v + '%';
    pct.textContent = Math.round(v) + '%';
    root.classList.toggle('hot', v > 60);
  };

  async function typeLine(L, i) {
    const row = document.createElement('div');
    row.className = 'ln ' + L.c;
    row.innerHTML = `<span class="ts">${stamp()}</span><span class="tx"></span>${L.st ? '<span class="lead"></span><span class="st"></span>' : ''}`;
    log.appendChild(row);
    const tx = row.querySelector('.tx'), st = row.querySelector('.st');
    const text = (L.c === 'alert' && L.t.startsWith('!!') ? '' : '> ') + L.t;
    for (let k = 1; k <= text.length; k++) {
      if (skip) { tx.textContent = text; break; }
      tx.textContent = text.slice(0, k);
      await wait(13);
    }
    if (st) {
      await wait(140);
      if (L.st === 'count') {
        // signature count ticks up
        for (let n = 40; n < 318 && !skip; n += 23) { st.textContent = n + ' ↑'; await wait(28); }
        st.textContent = '318 AND RISING';
      } else st.textContent = L.st;
    }
    if (L.c === 'alert') row.classList.add('flash');
    setThreat(Math.min(100, ((i + 1) / LINES.length) * 86));
    await wait(L.pause || 90);
  }

  async function play() {
    await wait(350);
    for (let i = 0; i < LINES.length; i++) await typeLine(LINES[i], i);
    ask.hidden = false;
    root.classList.add('asking');
    yes.focus({ preventScroll: true });
  }

  // tap / key before the question = fast-forward the log
  const fastForward = () => { if (!skip && ask.hidden) { skip = true; clearTimeout(timer); } };
  root.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.boot-yes')) fastForward(); });

  function deploy() {
    if (done) return;
    done = true;
    clearInterval(clockTick);
    onDeploy?.(); // fullscreen / audio unlock must run inside this gesture
    const row = document.createElement('div');
    row.className = 'ln ok';
    row.innerHTML = `<span class="ts">${stamp()}</span><span class="tx">&gt; warden protocol</span><span class="lead"></span><span class="st">${esc('DEPLOYED')}</span>`;
    log.appendChild(row);
    ask.hidden = true;
    root.classList.add('out');
    window.removeEventListener('keydown', onKey, true);
    setTimeout(() => root.remove(), reduced ? 50 : 700);
  }
  yes.addEventListener('click', deploy);

  function onKey(ev) {
    ev.stopPropagation(); // the game underneath must not see keys while the console is up
    if (ev.repeat) return;
    if (!ask.hidden && (ev.key === 'Enter' || ev.key === ' ' || ev.key.toLowerCase() === 'y')) { ev.preventDefault(); deploy(); return; }
    fastForward();
  }
  window.addEventListener('keydown', onKey, true);

  play();
  return { get threat() { return threat; } };
}
