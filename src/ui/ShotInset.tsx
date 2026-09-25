import { useEffect, useState } from 'preact/hooks';
import type { PartId } from '../content/anatomy';
import { SPECIES } from '../content/species';
import { GAME_SECONDS_PER_REAL_SECOND } from '../core/time';
import { type Projected, projectAnatomy, scatter, sway } from '../sim/shot';
import type { BowView } from '../sim/snapshot';
import { sinceTick, snapshot } from './store';

/** Beyond about this range an animal on edge can move before the arrow arrives. */
const JUMP_RANGE_M = 12;

/** Which organ outlines your anatomy knowledge shows, by level. */
const OUTLINES: PartId[][] = [
  [],
  [],
  ['heart', 'lungs'],
  ['heart', 'lungs', 'liver', 'gut', 'shoulder'],
  ['heart', 'lungs', 'liver', 'gut', 'shoulder', 'spine'],
];

const ORGAN_COLOUR: Partial<Record<PartId, string>> = {
  heart: '#e0605a',
  lungs: '#e89a9a',
  liver: '#8a3a3a',
  gut: '#9a9a5a',
  shoulder: '#e9e0c9',
  spine: '#e9e0c9',
};

function Ellipse({
  p,
  fill,
  stroke,
  dash,
}: {
  p: Projected;
  fill: string;
  stroke?: string;
  dash?: string;
}) {
  return (
    <ellipse
      cx={p.u}
      cy={-p.v}
      rx={p.ru}
      ry={p.rv}
      fill={fill}
      stroke={stroke}
      stroke-width={stroke ? 0.012 : 0}
      stroke-dasharray={dash}
    />
  );
}

const ANGLE_ADVICE: Record<string, string> = {
  broadside: 'Broadside: the vitals are wide open.',
  'quartering away': 'Quartering away: aim behind the ribs, towards the far shoulder.',
  'quartering towards': 'Quartering towards: the shoulder guards the lungs.',
  'facing away': 'Facing away: no clean shot.',
  'facing you': 'Facing you: a small target, easy to miss.',
};

/** Ears, eye and the white rump patch, which flares when the animal is alarmed. */
function Details({
  parts,
  theta,
  species,
  alarmed,
}: {
  parts: Projected[];
  theta: number;
  species: string;
  alarmed: boolean;
}) {
  const head = parts.find((p) => p.id === 'head');
  const body = parts.find((p) => p.id === 'body');
  if (!head || !body) return null;
  const k = species === 'hare' ? 0.45 : 1;
  const side = Math.sin(theta) >= 0 ? 1 : -1;
  // Hares have long ears laid along the back; roe deer short upright ones.
  const earLen = species === 'hare' ? 0.12 : 0.07 * k;
  const rumpU = -0.48 * k * Math.sin(theta);
  const rumpVisible = Math.cos(theta) > -0.2;
  return (
    <g>
      {[-1, 1].map((e) => (
        <ellipse
          key={e}
          cx={head.u - side * (0.02 + 0.03 * (e + 1)) * k}
          cy={-(head.v + head.rv * 0.9 + earLen * 0.6)}
          rx={0.025 * k + 0.01}
          ry={earLen}
          fill="#5c4331"
          transform={`rotate(${-side * 20 * e} ${head.u} ${-(head.v + head.rv)})`}
        />
      ))}
      <circle
        cx={head.u + side * head.ru * 0.35}
        cy={-(head.v + head.rv * 0.2)}
        r={0.012 * k + 0.004}
        fill="#140e0a"
      />
      {rumpVisible && (
        <ellipse
          cx={rumpU}
          cy={-(body.v + 0.04 * k)}
          rx={(alarmed ? 0.1 : 0.06) * k * Math.max(0.35, Math.abs(Math.cos(theta)) + 0.3)}
          ry={(alarmed ? 0.12 : 0.08) * k}
          fill="#f1ead8"
          opacity={alarmed ? 0.95 : 0.6}
        />
      )}
    </g>
  );
}

/** Which way the animal is moving, over its back: longer the faster it goes. */
function MotionArrow({ dir, k, fast }: { dir: 1 | -1; k: number; fast: BowView['motion'] }) {
  const len = (fast === 'slow' ? 0.12 : fast === 'walking' ? 0.25 : 0.4) * k;
  const y = -1.12 * k;
  const x0 = -dir * len * 0.5;
  const x1 = dir * len * 0.5;
  const head = 0.05 * k;
  return (
    <g stroke="#e8c16a" stroke-width={0.014 * k} fill="none" opacity={0.85}>
      <line x1={x0} x2={x1} y1={y} y2={y} />
      <polyline
        points={`${x1 - dir * head},${y - head} ${x1},${y} ${x1 - dir * head},${y + head}`}
      />
    </g>
  );
}

/** Re-render every animation frame while mounted. */
function useEveryFrame(): void {
  const [, setFrame] = useState(0);
  useEffect(() => {
    let id = requestAnimationFrame(function loop() {
      setFrame((f) => f + 1);
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, []);
}

/**
 * The crosshair shows where the arrow would go right now: where you are
 * aiming, moved by the drift and tremor. The circle around the
 * crosshair is the scatter you can't time away.
 */
function Reticle({
  bow,
  time,
  color,
  k,
}: {
  bow: BowView;
  time: number;
  color: string;
  k: number;
}) {
  useEveryFrame();
  const t = time + sinceTick() * GAME_SECONDS_PER_REAL_SECOND;
  const drift = sway(bow.sway, t);
  // The circle shows how ready you are: two standard deviations of the scatter.
  const r = Math.max(0.01, 2 * scatter(bow.sway, t));
  const x = bow.aimU + drift.u;
  const y = -(bow.aimV + drift.v);
  const line = { stroke: color, 'stroke-width': 0.008 * k };
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="none" stroke={color} stroke-width={0.012 * k} />
      <line x1={x - r - 0.04 * k} x2={x - 0.02 * k} y1={y} y2={y} {...line} />
      <line x1={x + 0.02 * k} x2={x + r + 0.04 * k} y1={y} y2={y} {...line} />
      <line y1={y - r - 0.04 * k} y2={y - 0.02 * k} x1={x} x2={x} {...line} />
      <line y1={y + 0.02 * k} y2={y + r + 0.04 * k} x1={x} x2={x} {...line} />
    </g>
  );
}

/** The side view of your target at its angle to you, with the reticle. */
export function ShotInset() {
  const s = snapshot.value;
  const bow = s?.bow;
  if (!s || !bow) return null;
  const k = bow.species === 'hare' ? 0.5 : 1;
  const parts = projectAnatomy(bow.species, bow.theta, bow.headDown);
  // Far-side parts first, so the near side overlaps them.
  const byDepth = [...parts].sort((a, b) => b.depth - a.depth);
  const silhouette = byDepth.filter((p) => ['leg', 'body', 'neck', 'head'].includes(p.id));
  const shown = OUTLINES[bow.anatomyLevel] ?? [];
  const organs = parts.filter((p) => shown.includes(p.id));
  // A novice with a little lore sees only a rough "vitals" area.
  const heart = parts.find((p) => p.id === 'heart');
  const lungs = parts.find((p) => p.id === 'lungs');
  const rough =
    bow.anatomyLevel === 1 && heart && lungs
      ? {
          ...lungs,
          u: (lungs.u + heart.u) / 2,
          v: (lungs.v + heart.v) / 2,
          ru: lungs.ru * 1.5,
          rv: lungs.rv * 1.6,
        }
      : null;
  const reticle =
    bow.breath === 'holding' ? '#9ec3d8' : bow.breath === 'shaking' ? '#e0806a' : '#e8c16a';

  return (
    <div class="panel inset" data-testid="shot-inset">
      <svg
        viewBox={`${-1.15 * k} ${-1.25 * k} ${2.3 * k} ${1.35 * k}`}
        class="inset-svg"
        role="img"
        aria-label="Side view of your target with the aiming reticle"
      >
        <line x1={-2} x2={2} y1={0} y2={0} stroke="#5a5a4a" stroke-width={0.01 * k} />
        {silhouette.map((p, i) => (
          <Ellipse key={`s${i}`} p={p} fill={p.depth > 0.05 ? '#5c4331' : '#7d5c42'} />
        ))}
        <Details
          parts={parts}
          theta={bow.theta}
          species={bow.species}
          alarmed={bow.alertness !== 'unaware'}
        />
        {bow.motion !== 'still' && Math.abs(Math.sin(bow.theta)) > 0.35 && (
          <MotionArrow dir={bow.motionDir} k={k} fast={bow.motion} />
        )}
        {rough && <Ellipse p={rough} fill="none" stroke="#e8c16a" dash="0.03 0.02" />}
        {organs.map((p, i) => (
          <Ellipse
            key={`o${i}`}
            p={p}
            fill="none"
            stroke={ORGAN_COLOUR[p.id] ?? '#fff'}
            dash={bow.anatomyLevel < 4 ? '0.025 0.015' : undefined}
          />
        ))}
        <Reticle bow={bow} time={s.time} color={reticle} k={k} />
      </svg>
      <div class="inset-info">
        <span>
          {SPECIES[bow.species].name} · {Math.round(bow.distance)} m · {bow.angle}
        </span>
        <span class={bow.breath === 'shaking' ? 'warn' : ''}>
          {bow.breath === 'holding'
            ? 'Holding your breath'
            : bow.breath === 'shaking'
              ? 'Shaking: breathe!'
              : bow.breath === 'recovering'
                ? 'Catching your breath'
                : 'Space: hold breath'}
        </span>
      </div>
      <div class="inset-info">
        <span class={bow.alertness === 'unaware' ? 'calm' : 'warn'}>
          {bow.alertness === 'unaware'
            ? bow.headDown
              ? 'Unaware, head down'
              : 'Unaware'
            : bow.alertness === 'suspicious'
              ? 'Suspicious: it is watching'
              : 'Alarmed!'}
        </span>
        <span class="inset-eye" title={`Awareness ${Math.round(bow.awareness * 100)} %`}>
          <span style={{ width: `${Math.round(Math.min(1, bow.awareness) * 100)}%` }} />
        </span>
      </div>
      <div class="inset-info dim">
        {bow.motion === 'running' ? (
          <span class="warn">Running: no shot. Let it go.</span>
        ) : bow.brush > 0.3 ? (
          <span class="warn">Branches in the way: the arrow may be turned.</span>
        ) : bow.motion === 'walking' ? (
          <span class="warn">
            Walking: it moves on {bow.lead.toFixed(1)} m while the arrow flies. Lead it, or stop it
            with a bleat (Q).
          </span>
        ) : bow.looking ? (
          bow.distance > JUMP_RANGE_M ? (
            <span class="warn">
              Stopped by your call, but on edge: at this range it may jump the string.
            </span>
          ) : (
            <span>Stopped by your call and looking: shoot before it moves on.</span>
          )
        ) : bow.alertness !== 'unaware' && bow.distance > JUMP_RANGE_M ? (
          <span class="warn">
            It is on edge: at this range it may jump at the sound of the string.
          </span>
        ) : (
          <span>{ANGLE_ADVICE[bow.angle]}</span>
        )}
      </div>
      <div class="inset-info dim">
        Move the mouse to aim · click as the crosshair drifts over the vitals · release right button
        to let down
      </div>
    </div>
  );
}
