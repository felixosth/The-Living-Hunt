import type { PartId } from '../content/anatomy';
import { SPECIES } from '../content/species';
import { type Projected, projectAnatomy } from '../sim/shot';
import { snapshot } from './store';

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

/** The side view of your target at its angle to you, with the reticle. */
export function ShotInset() {
  const s = snapshot.value;
  const bow = s?.bow;
  if (!s || !bow) return null;
  const k = bow.species === 'hare' ? 0.5 : 1;
  const parts = projectAnatomy(bow.species, bow.theta);
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
  const r = Math.max(0.01, 2 * bow.sigma);
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
        <circle
          cx={bow.aimU}
          cy={-bow.aimV}
          r={r}
          fill="none"
          stroke={reticle}
          stroke-width={0.012 * k}
        />
        <line
          x1={bow.aimU - r - 0.04 * k}
          x2={bow.aimU - 0.02 * k}
          y1={-bow.aimV}
          y2={-bow.aimV}
          stroke={reticle}
          stroke-width={0.008 * k}
        />
        <line
          x1={bow.aimU + 0.02 * k}
          x2={bow.aimU + r + 0.04 * k}
          y1={-bow.aimV}
          y2={-bow.aimV}
          stroke={reticle}
          stroke-width={0.008 * k}
        />
        <line
          y1={-bow.aimV - r - 0.04 * k}
          y2={-bow.aimV - 0.02 * k}
          x1={bow.aimU}
          x2={bow.aimU}
          stroke={reticle}
          stroke-width={0.008 * k}
        />
        <line
          y1={-bow.aimV + 0.02 * k}
          y2={-bow.aimV + r + 0.04 * k}
          x1={bow.aimU}
          x2={bow.aimU}
          stroke={reticle}
          stroke-width={0.008 * k}
        />
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
      <div class="inset-info dim">
        {bow.brush > 0.3 ? (
          <span class="warn">Branches in the way: the arrow may be turned.</span>
        ) : (
          <span>{ANGLE_ADVICE[bow.angle]}</span>
        )}
      </div>
      <div class="inset-info dim">
        Move the mouse to aim · click to shoot · release right button to let down
      </div>
    </div>
  );
}
