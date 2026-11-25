import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { haptic, lockVerticalSwipes } from '../lib/telegram.js';

// Bubble-lens day/night slider: 0 = night (dark), 0.5 = dusk (follow Telegram), 1 = day (light).
// The scene (sky, moon/sun, bunny) is a pure function of the continuous position, so dragging
// left/right scrubs every animation smoothly in both directions.

// Rendered size (CSS px) of the control and its bubble lens.
const W = 112;
const H = 42;
const PAD = 2;
const D = 38;
const TRAVEL = W - PAD * 2 - D;
const ZOOM = 1.65;
// The illustrated world is drawn in a fixed 96x36 viewBox and scaled to W x H.
const VW = 96;
const VH = 36;
const GROUND = 29;

export const THEME_MODES = ['dark', 'auto', 'light'];
const MODE_LABEL = { dark: '夜晚 · 深色', auto: '黄昏 · 跟随 Telegram', light: '白天 · 浅色' };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const tri = (p) => clamp(1 - Math.abs(p - 0.5) * 2, 0, 1);

function hexToRgb(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
}
function mix3(night, dusk, day, p) {
  return p <= 0.5 ? mixHex(night, dusk, p * 2) : mixHex(dusk, day, (p - 0.5) * 2);
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const STARS = [
  [8, 6, 0.7],
  [19, 12, 0.5],
  [29, 5, 0.6],
  [41, 10, 0.45],
  [63, 5, 0.65],
  [74, 13, 0.5],
  [85, 7, 0.6],
  [91, 15, 0.4],
  [35, 16, 0.4],
];
const BULBS = [8, 20, 32, 44, 56, 68, 80, 90];

function Bunny({ p, motion, facing }) {
  const wake = smooth(0.12, 0.42, p); // 0 asleep → 1 awake
  const day = smooth(0.72, 1, p);
  const earAngle = lerp(72, -6, wake);
  const headY = lerp(-5.6, -9.4, wake);
  const headX = lerp(4.6, 3.6, wake);
  const eyeOpen = smooth(0.18, 0.38, p);
  const lookUp = tri(p) * 1.2; // at dusk the bunny gazes up at the sunset
  const bodyRy = lerp(3.6, 4.6, wake);
  const walkHop = -Math.abs(Math.sin(p * Math.PI * 7)) * 2.4 * motion;
  return (
    <g style={{ '--hop': day * (1 - motion) }}>
      <ellipse cx="0" cy="0.4" rx={lerp(7, 5.5, wake)} ry="1" fill="rgba(40,10,25,0.22)" />
      <g transform={`translate(0 ${walkHop.toFixed(2)})`}>
        <g className="dn-bunny-idle">
          <g transform={`scale(${facing} 1)`}>
            <circle cx="-5.6" cy={-bodyRy + 0.6} r="1.7" fill="#fff" />
            <ellipse cx="0" cy={-bodyRy} rx="6" ry={bodyRy} fill="#fff8fa" />
            <g transform={`translate(${headX} ${headY - lookUp})`}>
              <g transform={`rotate(${-earAngle} -0.6 -2.6)`}>
                <ellipse cx="-1.4" cy="-5.6" rx="1.15" ry="3.5" fill="#fff8fa" />
                <ellipse cx="-1.4" cy="-5.4" rx="0.5" ry="2.4" fill="#f6a5bd" />
              </g>
              <g transform={`rotate(${-earAngle * 0.9 + 8} 0.8 -2.6)`}>
                <ellipse cx="0.9" cy="-5.8" rx="1.15" ry="3.6" fill="#fff8fa" />
                <ellipse cx="0.9" cy="-5.6" rx="0.5" ry="2.5" fill="#f6a5bd" />
              </g>
              <circle cx="0" cy="0" r="3.7" fill="#fff8fa" />
              <ellipse
                cx="1.6"
                cy={-0.5 - lookUp * 0.3}
                rx="0.62"
                ry={Math.max(0.14, 0.62 * eyeOpen)}
                fill="#3a1b2b"
              />
              <circle cx="2.2" cy="1.1" r="0.9" fill="#f7b3c6" opacity="0.85" />
              <circle cx="3.55" cy="0.25" r="0.45" fill="#d95b84" />
            </g>
          </g>
        </g>
      </g>
      {/* Night "z z" while sleeping */}
      <g opacity={1 - smooth(0.04, 0.22, p)} className="dn-zzz">
        <text x={facing > 0 ? 5 : -9} y="-12" fontSize="4.2" fontWeight="700" fill="#f6c8d8">
          z
        </text>
        <text x={facing > 0 ? 8 : -12} y="-16" fontSize="3.2" fontWeight="700" fill="#f6c8d8">
          z
        </text>
      </g>
    </g>
  );
}

export function DayNightScene({ p, motion = 0, facing = -1 }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const duskW = smooth(0, 0.5, p);
  const dayW = smooth(0.5, 1, p);
  const moonY = lerp(9, 30, smooth(0.15, 0.55, p));
  // Sunset sits on the right hill at dusk, then climbs to the upper-left by noon.
  const sunY = p < 0.5 ? lerp(36, 21, smooth(0.25, 0.5, p)) : lerp(21, 9, smooth(0.5, 1, p));
  const sunX = lerp(76, 52, smooth(0.5, 1, p));
  const glowW = 1 - smooth(0.55, 0.85, p); // cottage lamp: on at night & dusk, off by day
  const bloom = lerp(0.45, 1, smooth(0.4, 0.95, p));
  const sunR = lerp(5.2, 4.2, smooth(0.5, 1, p));
  // The bunny wanders opposite to the lens: asleep by the rose bush at night, under the lens at
  // dusk, and hopping near the cottage door by day.
  const bunnyX = lerp(80, 30, p);
  return (
    <svg className="dn-scene" viewBox={`0 0 ${VW} ${VH}`} width={W} height={H} aria-hidden="true">
      <defs>
        <linearGradient id={`night${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d1027" />
          <stop offset="1" stopColor="#47213f" />
        </linearGradient>
        <linearGradient id={`dusk${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6d3d7e" />
          <stop offset="0.55" stopColor="#e8708a" />
          <stop offset="1" stopColor="#ffc19a" />
        </linearGradient>
        <linearGradient id={`day${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd3e1" />
          <stop offset="1" stopColor="#fff6f8" />
        </linearGradient>
        <radialGradient id={`glow${uid}`}>
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`lamp${uid}`}>
          <stop offset="0" stopColor="#ffcf73" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffcf73" stopOpacity="0" />
        </radialGradient>
        <mask id={`moon${uid}`}>
          <circle cx="0" cy="0" r="4.4" fill="#fff" />
          <circle cx="2.1" cy="-1.7" r="3.8" fill="#000" />
        </mask>
      </defs>

      <rect width={VW} height={VH} fill={`url(#night${uid})`} />
      <rect width={VW} height={VH} fill={`url(#dusk${uid})`} opacity={duskW} />
      <rect width={VW} height={VH} fill={`url(#day${uid})`} opacity={dayW} />

      {/* Night: twinkling stars + crescent moon */}
      <g opacity={1 - smooth(0.1, 0.5, p)}>
        {STARS.map(([x, y, r], i) => (
          <circle key={i} className="dn-star" cx={x} cy={y} r={r} fill="#ffe9f1" style={{ animationDelay: `${i * 0.37}s` }} />
        ))}
      </g>
      <g transform={`translate(52 ${moonY.toFixed(2)})`} opacity={1 - smooth(0.3, 0.55, p)}>
        <circle r="8" fill={`url(#glow${uid})`} opacity="0.35" />
        <circle r="4.4" fill="#fde6ee" mask={`url(#moon${uid})`} />
      </g>
      <g opacity={1 - smooth(0.05, 0.3, p)}>
        <line className="dn-shoot" x1="70" y1="2" x2="76" y2="0" stroke="#fff3f8" strokeWidth="0.6" strokeLinecap="round" />
      </g>

      {/* Dusk: warm string lights */}
      <g opacity={tri(p)}>
        <path d="M0 3 Q 24 10 48 5 Q 72 10 96 3" fill="none" stroke="rgba(60,20,40,0.45)" strokeWidth="0.5" />
        {BULBS.map((x, i) => {
          // Sit each bulb on the quadratic wire: (0,3)-(24,10)-(48,5) then (48,5)-(72,10)-(96,3)
          const left = x <= 48;
          const t = left ? x / 48 : (x - 48) / 48;
          const [y0, y1] = left ? [3, 5] : [5, 3];
          const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * 10 + t * t * y1;
          return (
            <circle
              key={x}
              className="dn-bulb"
              cx={x}
              cy={y + 1.2}
              r="0.95"
              fill={i % 2 ? '#ffd27a' : '#ff9fbd'}
              style={{ animationDelay: `${i * 0.23}s` }}
            />
          );
        })}
      </g>

      {/* Sun: rises from the horizon at dusk to high noon */}
      <g transform={`translate(${sunX.toFixed(2)} ${sunY.toFixed(2)})`} opacity={smooth(0.26, 0.45, p)}>
        <circle r={sunR * 2.4} fill={`url(#glow${uid})`} opacity={lerp(0.5, 0.8, dayW)} />
        <g className="dn-rays" opacity={smooth(0.75, 1, p)}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <rect key={a} x="-0.35" y={-sunR - 2.6} width="0.7" height="1.6" rx="0.35" fill="#ffc46b" transform={`rotate(${a})`} />
          ))}
        </g>
        <circle r={sunR} fill={mixHex('#ff7d6b', '#ffd36b', dayW)} />
      </g>

      {/* Day: drifting clouds + falling petals */}
      <g opacity={smooth(0.62, 1, p)}>
        <g className="dn-cloud">
          <circle cx="62" cy="9" r="2.6" fill="#fff" />
          <circle cx="65.5" cy="8" r="3.3" fill="#fff" />
          <circle cx="69" cy="9.4" r="2.4" fill="#fff" />
        </g>
        <g className="dn-cloud dn-cloud-b">
          <circle cx="35" cy="6.5" r="1.6" fill="#fff" />
          <circle cx="37.3" cy="5.8" r="2.1" fill="#fff" />
          <circle cx="39.5" cy="6.7" r="1.5" fill="#fff" />
        </g>
        {[24, 58, 84].map((x, i) => (
          <ellipse key={x} className="dn-petal" cx={x} cy="-2" rx="1.1" ry="0.6" fill="#f48fb1" style={{ animationDelay: `${i * 1.3}s` }} />
        ))}
      </g>

      {/* Hills */}
      <path
        d={`M0 25 Q 16 17 34 22 Q 54 14 72 21 Q 86 17 ${VW} 20 V ${VH} H 0 Z`}
        fill={mix3('#341a36', '#a2507a', '#f6c3d2', p)}
      />
      <path d={`M0 ${GROUND} Q 26 24.5 50 27.5 T ${VW} 26.5 V ${VH} H 0 Z`} fill={mix3('#4a2240', '#c8607f', '#eea2b9', p)} />

      {/* Grass tufts */}
      <g stroke={mix3('#6a3a5c', '#e08aa3', '#d77f9c', p)} strokeWidth="0.45" strokeLinecap="round" fill="none">
        {[4, 27, 41, 63, 92].map((x) => (
          <path key={x} d={`M${x} 30 l-0.8 -1.8 M${x} 30 l0 -2.2 M${x} 30 l0.8 -1.7`} />
        ))}
      </g>

      {/* Cottage: window lamp glows at night, chimney smoke curls at dusk */}
      <g transform="translate(14 27.4)">
        <circle cx="-2.5" cy="-4.4" r="6" fill={`url(#lamp${uid})`} opacity={glowW * 0.85} />
        <rect x="2.6" y="-13" width="1.8" height="4" fill={mix3('#5c1f3b', '#8f2a50', '#c2456f', p)} />
        <rect x="-6" y="-8" width="12" height="8" rx="0.8" fill={mix3('#4f2846', '#f0c4d1', '#fff4f7', p)} />
        <path d="M-7.4 -7.4 L0 -13.4 L7.4 -7.4 Z" fill={mix3('#6e1f42', '#a32952', '#c2456f', p)} />
        <rect x="-4.3" y="-6" width="3.6" height="3.3" rx="0.4" fill={mixHex('#cfe9ff', '#ffd47a', glowW)} />
        <path d="M-2.5 -6 V -2.7 M-4.3 -4.35 H -0.7" stroke={mix3('#4f2846', '#f0c4d1', '#fff4f7', p)} strokeWidth="0.35" />
        <rect x="1.2" y="-5" width="2.8" height="5" rx="1.4" fill={mix3('#3a1530', '#8f2a50', '#a32952', p)} />
        <circle cx="3.4" cy="-2.4" r="0.25" fill="#ffd47a" />
        <g opacity={(1 - dayW) * 0.75}>
          {[0, 1, 2].map((i) => (
            <circle key={i} className="dn-smoke" cx="3.5" cy="-14" r={0.8 + i * 0.25} fill="#f3dce6" style={{ animationDelay: `${i * 0.9}s` }} />
          ))}
        </g>
      </g>

      {/* Rose bush: buds at night, full bloom at noon, with butterflies */}
      <g transform="translate(85 27.2)">
        <circle cx="-4.2" cy="-2.4" r="3" fill={mix3('#2f3a37', '#61604a', '#78b585', p)} />
        <circle cx="4.2" cy="-2.2" r="2.9" fill={mix3('#2f3a37', '#61604a', '#78b585', p)} />
        <circle cx="0" cy="-4.2" r="3.7" fill={mix3('#3a4842', '#707452', '#8cc796', p)} />
        {[
          [-3.6, -4.2],
          [1.2, -6.2],
          [4.2, -3],
          [-0.6, -2],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${bloom.toFixed(3)})`}>
            <circle r="1.35" fill={mixHex('#7a2a4a', '#e0457b', smooth(0.3, 1, p))} />
            <circle r="0.6" fill={mixHex('#5a1d36', '#ffb3cb', smooth(0.3, 1, p))} />
          </g>
        ))}
      </g>
      <g opacity={smooth(0.7, 1, p)}>
        {[
          [76, 15, '#ffd36b'],
          [90, 11, '#ffffff'],
        ].map(([x, y, c], i) => (
          <g key={x} transform={`translate(${x} ${y})`}>
            <g className="dn-fly" style={{ animationDelay: `${i * 0.8}s` }}>
              <ellipse className="dn-wing" cx="-0.9" cy="0" rx="1" ry="0.75" fill={c} />
              <ellipse className="dn-wing dn-wing-r" cx="0.9" cy="0" rx="1" ry="0.75" fill={c} />
            </g>
          </g>
        ))}
      </g>

      {/* Dusk fireflies */}
      <g opacity={tri(p) * 0.9}>
        {[
          [20, 21],
          [70, 19],
          [84, 23],
        ].map(([x, y], i) => (
          <circle key={x} className="dn-firefly" cx={x} cy={y} r="0.7" fill="#fff1a8" style={{ animationDelay: `${i * 0.6}s` }} />
        ))}
      </g>

      <g transform={`translate(${bunnyX.toFixed(2)} ${GROUND - 1.2})`}>
        <Bunny p={p} motion={motion} facing={facing} />
      </g>
    </svg>
  );
}

const modeToPos = (mode) => THEME_MODES.indexOf(mode) / 2;
const posToMode = (pos) => THEME_MODES[clamp(Math.round(pos * 2), 0, 2)];
const rubber = (v) => (v < 0 ? Math.max(-0.12, v * 0.28) : v > 1 ? Math.min(1.12, 1 + (v - 1) * 0.28) : v);

export default function DayNightSlider({ mode = 'auto', onChange }) {
  const rootRef = useRef(null);
  const phys = useRef({ x: modeToPos(mode), v: 0, target: modeToPos(mode), raf: 0, last: 0 });
  const drag = useRef(null);
  const [pos, setPos] = useState(() => modeToPos(mode));
  const [dragging, setDragging] = useState(false);
  const [motion, setMotion] = useState(0);
  const [facing, setFacing] = useState(-1);
  const [squash, setSquash] = useState(0);

  const stopSpring = () => {
    if (phys.current.raf) cancelAnimationFrame(phys.current.raf);
    phys.current.raf = 0;
  };

  const springTo = useCallback((target, kick = 0) => {
    const s = phys.current;
    s.target = target;
    s.v += kick;
    if (prefersReducedMotion()) {
      s.x = target;
      s.v = 0;
      setPos(target);
      setMotion(0);
      setSquash(0);
      return;
    }
    if (s.raf) return;
    s.last = performance.now();
    const step = (now) => {
      const dt = Math.min(1 / 30, (now - s.last) / 1000);
      s.last = now;
      const a = -420 * (s.x - s.target) - 24 * s.v;
      s.v += a * dt;
      s.x += s.v * dt;
      const speed = Math.abs(s.v);
      setPos(s.x);
      setMotion(clamp(speed * 0.9, 0, 1));
      setSquash(clamp(s.v * 0.05, -0.14, 0.14));
      if (Math.abs(s.x - s.target) < 0.0008 && speed < 0.01) {
        s.x = s.target;
        s.v = 0;
        s.raf = 0;
        setPos(s.target);
        setMotion(0);
        setSquash(0);
        return;
      }
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }, []);

  // Follow external mode changes (e.g. restored preference) when the user is not dragging.
  useEffect(() => {
    if (drag.current) return;
    const target = modeToPos(mode);
    if (Math.abs(phys.current.target - target) > 0.001) {
      setFacing(target > phys.current.x ? -1 : 1);
      springTo(target);
    }
  }, [mode, springTo]);

  useEffect(() => () => {
    stopSpring();
    lockVerticalSwipes(false);
  }, []);

  const lensCenter = (p) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: rect.left + PAD + D / 2 + clamp(p, 0, 1) * TRAVEL, y: rect.top + H / 2 };
  };

  const commit = (target) => {
    const nextMode = posToMode(target);
    setFacing(target > phys.current.x ? -1 : target < phys.current.x ? 1 : facing);
    springTo(target);
    if (nextMode !== mode) {
      haptic('light');
      onChange?.(nextMode, lensCenter(target));
    }
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    stopSpring();
    rootRef.current?.setPointerCapture?.(e.pointerId);
    lockVerticalSwipes(true);
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      startPos: phys.current.x,
      lastX: e.clientX,
      lastT: performance.now(),
      vel: 0,
      moved: false,
      stop: Math.round(phys.current.x * 2),
      t0: performance.now(),
    };
    setDragging(true);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 3) return;
    d.moved = true;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT) / 1000;
    const inst = (e.clientX - d.lastX) / TRAVEL / dt; // positions per second
    d.vel = d.vel * 0.65 + inst * 0.35;
    d.lastX = e.clientX;
    d.lastT = now;
    const x = rubber(d.startPos + dx / TRAVEL);
    phys.current.x = x;
    phys.current.v = d.vel;
    setPos(x);
    setMotion(clamp(Math.abs(d.vel) * 0.9, 0, 1));
    setSquash(clamp(d.vel * 0.05, -0.14, 0.14));
    if (Math.abs(inst) > 0.05) setFacing(inst > 0 ? -1 : 1);
    const stop = clamp(Math.round(x * 2), 0, 2);
    if (stop !== d.stop) {
      d.stop = stop;
      haptic('selection');
    }
  };

  const endDrag = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    lockVerticalSwipes(false);
    if (!d.moved) {
      // Tap: jump to the stop under the finger; tapping the current stop gives a playful nudge.
      const rect = rootRef.current.getBoundingClientRect();
      const tapPos = clamp((e.clientX - rect.left - PAD - D / 2) / TRAVEL, 0, 1);
      const target = Math.round(tapPos * 2) / 2;
      if (Math.abs(target - modeToPos(mode)) < 0.01) {
        haptic('selection');
        springTo(target, target >= 1 ? -1.6 : 1.6);
      } else {
        commit(target);
      }
      return;
    }
    // A finger that paused before lifting carries no fling; a released bubble close to a stop
    // always settles there, so precise drags land exactly where the user let go.
    const idle = performance.now() - d.lastT > 90;
    const vel = idle ? 0 : clamp(d.vel, -4, 4);
    const here = phys.current.x;
    const nearest = clamp(Math.round(here * 2) / 2, 0, 1);
    const projected = Math.abs(here - nearest) < 0.1 ? nearest : here + vel * 0.07;
    commit(clamp(Math.round(projected * 2) / 2, 0, 1));
  };

  const onKeyDown = (e) => {
    const idx = THEME_MODES.indexOf(mode);
    let next = idx;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = idx - 1;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = idx + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 2;
    else if (e.key === 'Enter' || e.key === ' ') next = (idx + 1) % 3;
    else return;
    e.preventDefault();
    commit(clamp(next, 0, 2) / 2);
  };

  const lensX = clamp(pos, -0.12, 1.12) * TRAVEL;
  const cx = PAD + D / 2 + lensX;
  const cy = H / 2 + 4; // focus slightly below centre so the lens frames the ground scene (cottage / bunny / roses)

  return (
    <div
      ref={rootRef}
      className={`dn-slider${dragging ? ' is-dragging' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="昼夜主题"
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={THEME_MODES.indexOf(mode)}
      aria-valuetext={MODE_LABEL[mode]}
      title={`${MODE_LABEL[mode]}（拖动气泡或点按切换）`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <div className="dn-track">
        <DayNightScene p={clamp(pos, 0, 1)} motion={motion} facing={facing} />
      </div>
      <div className="dn-lens" style={{ transform: `translate3d(${lensX.toFixed(2)}px,0,0)` }}>
        <div
          className="dn-lens-body"
          style={{ '--sx': (1 + Math.abs(squash)).toFixed(3), '--sy': (1 - Math.abs(squash) * 0.7).toFixed(3) }}
        >
          <div className="dn-lens-view">
            <div
              className="dn-lens-scene"
              style={{ transform: `translate(${(D / 2 - cx * ZOOM).toFixed(2)}px, ${(D / 2 - cy * ZOOM).toFixed(2)}px) scale(${ZOOM})` }}
            >
              <DayNightScene p={clamp(pos, 0, 1)} motion={motion} facing={facing} />
            </div>
          </div>
          <span className="dn-lens-glass" />
        </div>
      </div>
    </div>
  );
}
