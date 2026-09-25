/**
 * Readings: what the player learns from inspecting a sign. A reading is the
 * truth, blurred by knowledge. Ranges always contain the true value, and the
 * same sign read at the same knowledge gives the same reading.
 */
import { BLOOD_LORE, BloodType } from '../content/blood';
import { SPECIES, type SpeciesId } from '../content/species';
import { hash32 } from '../core/hash';
import { compassName, radToDeg } from '../core/math';
import { nextFloat, seedRng } from '../core/rng';
import { type Knowledge, level } from './knowledge';
import { PrintGait, type SignRecord } from './signs';

export interface Range {
  lo: number;
  hi: number;
}

export interface Reading {
  signId: number;
  kind: SignRecord['kindName'];
  title: string;
  /** The reading in the journal's voice. */
  lines: string[];
  /** Knowledge levels used: species familiarity and literacy in this kind of sign. */
  speciesLevel: number;
  literacy: number;
  /** Structured facts, for tests and tools. */
  species: SpeciesId | null;
  ageH: Range | null;
  weightKg: Range | null;
  headingDeg: number | null;
  sameAnimalAsBefore: boolean;
}

const COMPASS_WORDS: Record<string, string> = {
  N: 'north',
  NE: 'north-east',
  E: 'east',
  SE: 'south-east',
  S: 'south',
  SW: 'south-west',
  W: 'west',
  NW: 'north-west',
};

/** Relative width of a range, by level (index 0 unused: level 0 gives no range). */
const AGE_WIDTH = [0, 1.2, 0.7, 0.4, 0.2];
const WEIGHT_WIDTH = [0, 0.8, 0.5, 0.3, 0.12];

/**
 * A range of relative width `rel` around `truth`, offset by `u` (0..1) so the
 * truth isn't always in the middle, and rounded outwards to `step`.
 */
export function blur(truth: number, rel: number, u: number, step: number, minWidth = step): Range {
  const width = Math.max(minWidth, Math.abs(truth) * rel);
  const lo = truth - width * (0.15 + 0.7 * u);
  const hi = lo + width;
  return {
    lo: Math.max(0, Math.floor(lo / step) * step),
    hi: Math.ceil(hi / step) * step,
  };
}

function formatAge(r: Range): string {
  if (r.hi <= 1) return `${Math.round(r.lo * 60)}–${Math.round(r.hi * 60)} minutes old`;
  if (r.hi <= 72) return `${round1(r.lo)}–${round1(r.hi)} hours old`;
  return `${Math.floor(r.lo / 24)}–${Math.ceil(r.hi / 24)} days old`;
}

function round1(n: number): string {
  return n < 10 ? String(Math.round(n * 2) / 2) : String(Math.round(n));
}

function ageWords(ageH: number): string {
  if (ageH < 2) return 'Very fresh.';
  if (ageH < 12) return 'Fresh, from today.';
  if (ageH < 36) return 'A day or so old.';
  return 'Old.';
}

const TITLES: Record<SignRecord['kindName'], string> = {
  print: 'Prints',
  pellets: 'Droppings',
  bed: 'A bed',
  browse: 'Browsed twigs',
  blood: 'Blood',
  arrow: 'Your arrow',
};

/** What someone who doesn't know the species makes of the sign. */
const UNSURE: Record<SpeciesId, Partial<Record<SignRecord['kindName'], string>>> = {
  roe: {
    print: 'Cloven hooves, small and pointed. A deer? A sheep or goat?',
    pellets: 'Small, dark, bullet-shaped pellets. A deer? A sheep?',
    bed: 'An oval of pressed-down grass. Something lay here.',
    browse: 'Twigs torn off, not cut.',
  },
  hare: {
    print: 'Two long feet side by side, two small ones behind. A hare? A rabbit?',
    pellets: 'Round, fibrous pellets. A hare or a rabbit?',
    bed: 'A shallow scrape under cover. A small animal rested here.',
    browse: 'Twigs cut cleanly at a slant.',
  },
};

export interface ReadingContext {
  /** Whether the player has read another sign of the same animal before. */
  sameAnimalAsBefore: boolean;
}

export function readSign(
  sign: SignRecord,
  k: Knowledge,
  now: number,
  ctx: ReadingContext = { sameAnimalAsBefore: false },
): Reading {
  const literacy = level(k.signs[sign.kindName]);
  const speciesLevel = level(k.species[sign.species]);
  const rng = seedRng(hash32(sign.id, literacy, speciesLevel, 'reading'));
  const lines: string[] = [];
  const def = SPECIES[sign.species];
  const ageH = Math.max(0, (now - sign.t) / 3600);

  const reading: Reading = {
    signId: sign.id,
    kind: sign.kindName,
    title: TITLES[sign.kindName],
    lines,
    speciesLevel,
    literacy,
    species: null,
    ageH: null,
    weightKg: null,
    headingDeg: null,
    sameAnimalAsBefore: false,
  };

  if (sign.kindName === 'arrow') {
    lines.push(
      sign.detail === BloodType.None
        ? 'Your arrow, clean. A miss.'
        : `Your arrow. ${BLOOD_LORE[sign.detail as Exclude<BloodType, 0>].looks} on the shaft.`,
    );
    return reading;
  }

  // Who made it.
  const idLevel = Math.min(speciesLevel, literacy + 1);
  if (sign.kindName === 'blood') {
    lines.push(idLevel >= 1 ? `Blood. The ${def.name} you hit?` : 'Blood.');
  } else if (idLevel === 0) {
    lines.push(UNSURE[sign.species][sign.kindName] ?? 'Something passed here.');
  } else {
    reading.species = sign.species;
    const name = def.name.charAt(0).toUpperCase() + def.name.slice(1);
    lines.push(idLevel === 1 ? `${name}, probably.` : `${name}.`);
  }

  // How old.
  if (literacy === 0) {
    lines.push(ageWords(ageH));
  } else {
    const r = blur(ageH, AGE_WIDTH[literacy] as number, nextFloat(rng), ageH < 2 ? 0.25 : 1, 0.5);
    reading.ageH = r;
    lines.push(`About ${formatAge(r)}.`);
  }

  // Size, from the print's depth and size, a bed's length or droppings' size.
  const sizeLevel = Math.min(speciesLevel, literacy);
  if (sizeLevel >= 1 && (sign.kindName === 'print' || sign.kindName === 'bed')) {
    const r = blur(
      sign.weight,
      WEIGHT_WIDTH[sizeLevel] as number,
      nextFloat(rng),
      sign.weight < 8 ? 0.5 : 1,
    );
    reading.weightKg = r;
    const young = sizeLevel >= 3 && sign.weight < def.weightKg.juvenile[1] + 0.5;
    lines.push(`${young ? 'A young one, ' : 'An animal of '}${r.lo}–${r.hi} kg.`);
  }

  switch (sign.kindName) {
    case 'print': {
      if (literacy >= 1) {
        const deg = Math.round((((radToDeg(sign.heading) + 90) % 360) + 360) % 360);
        reading.headingDeg = deg;
        const dir = COMPASS_WORDS[compassName(deg)];
        const gait =
          literacy >= 2
            ? sign.detail === PrintGait.Bound
              ? 'Bounding'
              : sign.detail === PrintGait.Trot
                ? 'Trotting'
                : 'Walking'
            : sign.detail === PrintGait.Bound
              ? 'Moving fast'
              : 'Heading';
        lines.push(`${gait} ${dir}.`);
        if (literacy >= 3 && sign.detail === PrintGait.Bound) {
          lines.push('Long leaps, toes spread wide: it was running from something.');
        }
      }
      break;
    }
    case 'bed': {
      if (literacy >= 2 && sign.detail > 1) lines.push(`Beds for ${sign.detail}, close together.`);
      else if (literacy >= 1 && sign.detail > 1) lines.push('More than one bed here?');
      break;
    }
    case 'browse': {
      if (literacy >= 1) {
        const r = blur(
          sign.detail,
          [0, 0.4, 0.25, 0.12, 0.05][literacy] as number,
          nextFloat(rng),
          5,
        );
        lines.push(`Bitten ${r.lo}–${r.hi} cm above the ground.`);
      }
      break;
    }
    case 'pellets': {
      if (literacy >= 2) lines.push(ageH < 12 ? 'Still moist and glossy.' : 'Dry and dull.');
      break;
    }
    case 'blood': {
      const lore = BLOOD_LORE[(sign.detail || BloodType.Sparse) as Exclude<BloodType, 0>];
      if (literacy >= 1) lines.push(`${lore.looks}.`);
      if (literacy >= 2) lines.push(`That means ${lore.means}.`);
      if (literacy >= 3) lines.push(lore.advice);
      break;
    }
  }

  if (ctx.sameAnimalAsBefore && speciesLevel >= 3 && literacy >= 3) {
    reading.sameAnimalAsBefore = true;
    lines.push('The same animal as a sign you read before.');
  }
  return reading;
}
