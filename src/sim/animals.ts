/**
 * Animal agents: spawning, daily routines, movement, awareness and flight.
 *
 * Roe deer feed at dawn, at dusk and through the night, drink at the fords and
 * bed down in thickets by day, getting up now and then to browse. Herd members
 * follow their leader. Mountain hares rest in forms by day and feed on meadow
 * edges at night; they sit tight until you come close, then burst away.
 */
import { SPECIES, type SpeciesId } from '../content/species';
import { clamp, lerpAngle } from '../core/math';
import { chance, nextRange, pick, type RngState } from '../core/rng';
import {
  daylight,
  type GameTime,
  SECONDS_PER_HOUR,
  secondOfDay,
  sunAltitudeDeg,
} from '../core/time';
import { type SimEvent, SOUND_RANGE_M, type SoundKind } from './events';
import { cellCentre, cellOf, downhill, isCellOpen } from './nav';
import { PERCEPTION_RANGE_M, type PlayerCues, perceivePlayer, playerCanSee } from './perception';
import { coverAt, isWalkable, type Poi, type PoiKind, poiField, type RegionMap } from './region';
import type { Animal, AnimalHome, PlayerState, WorldState } from './state';

export const SUSPICIOUS = 0.3;
export const ALARMED = 0.7;
const FLEE_AT = 0.95;
/** Awareness lost per game minute without fresh stimulus. */
const AWARENESS_DECAY = 0.1;
/** How long the player's ground scent lingers, in game seconds. */
export const SCENT_TRAIL_LIFE = 6 * SECONDS_PER_HOUR;
export const SCENT_CELL_M = 8;
/** Longest single movement, so animals never skip across a blocked tile. */
const SUBSTEP_M = 1.5;

// ---------------------------------------------------------------------------
// Time of day
// ---------------------------------------------------------------------------

export type DayPart = 'dawn' | 'day' | 'dusk' | 'night';

export function dayPart(t: GameTime): DayPart {
  const sun = daylight(t);
  const rise = sun.sunrise ?? 6 * SECONDS_PER_HOUR;
  const set = sun.sunset ?? 18 * SECONDS_PER_HOUR;
  const s = secondOfDay(t);
  const h = SECONDS_PER_HOUR;
  if (s >= rise - 1.5 * h && s < rise + 2 * h) return 'dawn';
  if (s >= rise + 2 * h && s < set - 2.5 * h) return 'day';
  if (s >= set - 2.5 * h && s < set + 1.5 * h) return 'dusk';
  return 'night';
}

function hareActive(t: GameTime): boolean {
  const part = dayPart(t);
  if (part === 'day') return false;
  if (part === 'dawn') return sunAltitudeDeg(t) < 2;
  return true;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

function nearest(from: { x: number; y: number }, list: Poi[], n: number): Poi[] {
  return [...list]
    .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))
    .slice(0, n);
}

function makeAnimal(
  state: WorldState,
  rng: RngState,
  species: SpeciesId,
  sex: 'f' | 'm',
  juvenile: boolean,
  groupId: number | null,
  home: AnimalHome,
  at: { x: number; y: number },
): Animal {
  const def = SPECIES[species];
  const [lo, hi] = juvenile
    ? def.weightKg.juvenile
    : sex === 'f'
      ? def.weightKg.female
      : def.weightKg.male;
  const id = state.nextAnimalId++;
  return {
    id,
    species,
    sex,
    juvenile,
    weightKg: Math.round(nextRange(rng, lo, hi) * 10) / 10,
    groupId: groupId ?? id,
    home,
    x: at.x + nextRange(rng, -2, 2),
    y: at.y + nextRange(rng, -2, 2),
    heading: nextRange(rng, -Math.PI, Math.PI),
    speed: 0,
    activity: 'bedded',
    goal: home.rest[0] ?? -1,
    spotX: at.x,
    spotY: at.y,
    until: state.time + Math.round(nextRange(rng, 0, 2 * SECONDS_PER_HOUR)),
    lastDrink: state.time - Math.round(nextRange(rng, 0, 8 * SECONDS_PER_HOUR)),
    awareness: 0,
    alarmX: at.x,
    alarmY: at.y,
    lastCall: 0,
    scentCheckedAt: 0,
    wariness: 0,
    seen: false,
  };
}

/** Populate the region: a few roe deer groups, one per bedding thicket, and a hare per form. */
export function spawnAnimals(state: WorldState, map: RegionMap): void {
  const rng = state.rng.ecology;
  const of = (kind: PoiKind) => map.pois.filter((p) => p.kind === kind);
  const beds = of('bed');
  const feeds = of('feed');
  const waters = of('water');

  for (const bed of beds.slice(0, 4)) {
    const otherBed = nearest(
      bed,
      beds.filter((b) => b !== bed),
      1,
    );
    const home: AnimalHome = {
      rest: [bed.index, ...otherBed.map((b) => b.index)],
      feed: nearest(bed, feeds, 3).map((p) => p.index),
      water: nearest(bed, waters, 2).map((p) => p.index),
    };
    const roll = nextRange(rng, 0, 1);
    const members: Array<['f' | 'm', boolean]> =
      roll < 0.3
        ? [
            ['f', false],
            ['f', true],
            ['m', true],
          ]
        : roll < 0.65
          ? [
              ['f', false],
              [chance(rng, 0.5) ? 'f' : 'm', true],
            ]
          : roll < 0.9
            ? [['m', false]]
            : [
                ['f', false],
                ['f', false],
              ];
    let leader: number | null = null;
    for (const [sex, juvenile] of members) {
      const a = makeAnimal(state, rng, 'roe', sex, juvenile, leader, home, bed);
      leader ??= a.id;
      state.animals.push(a);
    }
  }

  for (const form of of('form')) {
    const home: AnimalHome = {
      rest: [form.index],
      feed: nearest(form, feeds, 1).map((p) => p.index),
      water: [],
    };
    state.animals.push(
      makeAnimal(state, rng, 'hare', chance(rng, 0.5) ? 'f' : 'm', false, null, home, form),
    );
  }
}

// ---------------------------------------------------------------------------
// The per-step update
// ---------------------------------------------------------------------------

interface Ctx {
  state: WorldState;
  map: RegionMap;
  dt: number;
  now: GameTime;
  rng: RngState;
  events: SimEvent[];
  cues: PlayerCues | null;
  byId: Map<number, Animal>;
}

/**
 * Advance every animal by `dt` game seconds. `cues` describes the player, or is
 * null when no one is in the region (the warm-up before you arrive).
 */
export function updateAnimals(
  state: WorldState,
  map: RegionMap,
  dt: number,
  events: SimEvent[],
  cues: PlayerCues | null,
): void {
  const ctx: Ctx = {
    state,
    map,
    dt,
    now: state.time,
    rng: state.rng.ai,
    events,
    cues,
    byId: new Map(state.animals.map((a) => [a.id, a])),
  };
  for (const a of state.animals) {
    if (cues) sense(a, ctx, cues);
    if (a.species === 'roe') checkScentTrail(a, ctx);
  }
  for (const a of state.animals) behave(a, ctx);
}

/** Record the player's ground scent in the cell they're standing in. */
export function markScentTrail(state: WorldState, map: RegionMap, player: PlayerState): void {
  const cols = Math.ceil((map.width * map.tileSize) / SCENT_CELL_M);
  const cx = Math.floor(player.x / SCENT_CELL_M);
  const cy = Math.floor(player.y / SCENT_CELL_M);
  const i = cy * cols + cx;
  if (i >= 0 && i < state.scentTrail.length) state.scentTrail[i] = state.time;
}

/** After the player has had a look: flag who is in view and report new sightings. */
export function updateSightings(
  state: WorldState,
  map: RegionMap,
  light: number,
  events: SimEvent[],
): void {
  for (const a of state.animals) {
    const seen = playerCanSee(state.player, a, map, light, state.time);
    if (seen && !a.seen) {
      events.push({
        type: 'sighted',
        animalId: a.id,
        species: a.species,
        x: a.x,
        y: a.y,
        time: state.time,
      });
    }
    a.seen = seen;
  }
}

// ---------------------------------------------------------------------------
// Senses and alarm
// ---------------------------------------------------------------------------

function sense(a: Animal, ctx: Ctx, cues: PlayerCues): void {
  const minutes = ctx.dt / 60;
  if (a.activity === 'fleeing') return;
  const d = Math.hypot(cues.x - a.x, cues.y - a.y);
  if (d > PERCEPTION_RANGE_M) {
    a.awareness = Math.max(0, a.awareness - AWARENESS_DECAY * minutes);
    return;
  }
  const def = SPECIES[a.species];
  const p = perceivePlayer(a, cues, ctx.map);
  let gain = p.stimulus * def.alertness * (1 + a.wariness) * minutes;
  // A hare in its form trusts its camouflage.
  if (a.species === 'hare' && a.activity === 'bedded') gain *= 0.35;
  if (p.smell > 0.08) {
    gain += (0.5 + p.smell) * 2 * minutes;
    a.awareness = Math.max(a.awareness, ALARMED + 0.02);
  }
  if (gain > 0.001) {
    a.alarmX = cues.x;
    a.alarmY = cues.y;
  }
  const before = a.awareness;
  a.awareness = clamp(a.awareness + gain - AWARENESS_DECAY * minutes, 0, 1);

  const flushRange = def.flushDistance * (1 + a.wariness);
  const flushed =
    a.activity === 'bedded' &&
    def.flushDistance > 0 &&
    (d < flushRange * 0.5 || (d < flushRange && a.awareness > 0.1));
  if (flushed || a.awareness >= FLEE_AT || p.smell > 0.3) {
    startFlight(a, ctx);
  } else if (a.awareness >= ALARMED) {
    call(a, ctx);
    if (before < ALARMED) alertGroup(a, ctx, 0.6);
  }
}

/** Crossing the player's fresh trail: nervous, or off at once if it's very fresh. */
function checkScentTrail(a: Animal, ctx: Ctx): void {
  if (a.activity === 'fleeing' || ctx.now - a.scentCheckedAt < 20 * 60) return;
  const cols = Math.ceil((ctx.map.width * ctx.map.tileSize) / SCENT_CELL_M);
  const cx = Math.floor(a.x / SCENT_CELL_M);
  const cy = Math.floor(a.y / SCENT_CELL_M);
  const laid = ctx.state.scentTrail[cy * cols + cx] ?? 0;
  if (laid === 0) return;
  const strength = 1 - (ctx.now - laid) / SCENT_TRAIL_LIFE;
  if (strength < 0.1) return;
  a.scentCheckedAt = ctx.now;
  a.alarmX = (cx + 0.5) * SCENT_CELL_M;
  a.alarmY = (cy + 0.5) * SCENT_CELL_M;
  a.wariness = Math.min(1, a.wariness + 0.1);
  if (strength > 0.75) {
    a.awareness = Math.max(a.awareness, ALARMED + 0.05);
    call(a, ctx);
    alertGroup(a, ctx, 0.6);
  } else {
    a.awareness = Math.max(a.awareness, SUSPICIOUS + 0.1);
  }
}

function emitSound(ctx: Ctx, kind: SoundKind, a: Animal): void {
  const { player } = ctx.state;
  if (!ctx.cues || Math.hypot(player.x - a.x, player.y - a.y) > SOUND_RANGE_M[kind]) return;
  ctx.events.push({ type: 'sound', kind, species: a.species, x: a.x, y: a.y, time: ctx.now });
}

/** An alarm call (a roe deer's bark), spaced out, which puts nearby deer on edge. */
function call(a: Animal, ctx: Ctx): void {
  if (!SPECIES[a.species].alarmCall || ctx.now - a.lastCall < 90) return;
  a.lastCall = ctx.now;
  emitSound(ctx, 'bark', a);
  for (const other of ctx.state.animals) {
    if (other === a || other.species !== a.species || other.activity === 'fleeing') continue;
    if (Math.hypot(other.x - a.x, other.y - a.y) > 150) continue;
    if (other.awareness < 0.45) {
      other.awareness = 0.45;
      other.alarmX = a.alarmX;
      other.alarmY = a.alarmY;
    }
  }
}

function alertGroup(a: Animal, ctx: Ctx, level: number): void {
  for (const mate of ctx.state.animals) {
    if (mate === a || mate.groupId !== a.groupId || mate.activity === 'fleeing') continue;
    if (mate.awareness < level) {
      mate.awareness = level;
      mate.alarmX = a.alarmX;
      mate.alarmY = a.alarmY;
    }
  }
}

function startFlight(a: Animal, ctx: Ctx, fromGroup = false): void {
  if (a.activity === 'fleeing') return;
  const [lo, hi] = a.species === 'roe' ? [240, 480] : [150, 300];
  a.activity = 'fleeing';
  a.until = ctx.now + Math.round(nextRange(ctx.rng, lo, hi));
  a.awareness = 1;
  a.wariness = Math.min(1, a.wariness + 0.3);
  if (!fromGroup) {
    if (a.species === 'roe') {
      call(a, ctx);
      emitSound(ctx, 'crash', a);
    } else {
      emitSound(ctx, 'flush', a);
    }
  }
  for (const mate of ctx.state.animals) {
    if (mate === a || mate.groupId !== a.groupId) continue;
    mate.alarmX = a.alarmX;
    mate.alarmY = a.alarmY;
    startFlight(mate, ctx, true);
  }
}

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

function behave(a: Animal, ctx: Ctx): void {
  const def = SPECIES[a.species];
  let moved = 0;
  if (a.activity === 'fleeing') {
    moved = flee(a, ctx, (def.speed.flee * ctx.dt) / 60);
    if (ctx.now >= a.until) {
      a.awareness = 0.45;
      travelTo(a, ctx, chooseRest(a, ctx));
    }
  } else if (a.awareness >= SUSPICIOUS) {
    // Stand and stare at where the danger was.
    a.heading = lerpAngle(a.heading, Math.atan2(a.alarmY - a.y, a.alarmX - a.x), 0.5);
  } else {
    moved = routine(a, ctx);
  }
  a.speed = moved / (ctx.dt / 60);
}

function leaderOf(a: Animal, ctx: Ctx): Animal | null {
  if (a.groupId === a.id) return null;
  const leader = ctx.byId.get(a.groupId);
  return leader && leader.activity !== 'fleeing' ? leader : null;
}

/** Follow the daily routine; returns the distance moved. */
function routine(a: Animal, ctx: Ctx): number {
  const def = SPECIES[a.species];
  const leader = leaderOf(a, ctx);
  if (leader) return follow(a, leader, ctx);

  switch (a.activity) {
    case 'travelling': {
      const moved = travel(a, ctx, (def.speed.walk * ctx.dt) / 60);
      if (arrived(a, ctx)) settle(a, ctx);
      return moved;
    }
    case 'feeding': {
      const moved = graze(a, ctx);
      if (ctx.now >= a.until) decide(a, ctx);
      return moved;
    }
    case 'drinking':
      if (ctx.now >= a.until) {
        a.lastDrink = ctx.now;
        decide(a, ctx);
      }
      return 0;
    default:
      if (ctx.now >= a.until) decide(a, ctx);
      return 0;
  }
}

function follow(a: Animal, leader: Animal, ctx: Ctx): number {
  const def = SPECIES[a.species];
  if (a.goal !== leader.goal) {
    a.goal = leader.goal;
    a.activity = 'travelling';
    pickSpot(a, ctx, leader);
  }
  if (a.activity === 'travelling') {
    const moved = travel(a, ctx, (def.speed.walk * ctx.dt) / 60);
    if (arrived(a, ctx)) {
      a.activity = leader.activity === 'travelling' ? 'feeding' : leader.activity;
      pickSpot(a, ctx, leader);
    }
    return moved;
  }
  if (leader.activity !== 'travelling' && a.activity !== leader.activity) {
    a.activity = leader.activity;
    pickSpot(a, ctx, leader);
  }
  a.until = leader.until;
  if (a.activity === 'drinking') a.lastDrink = ctx.now;
  return a.activity === 'feeding' ? graze(a, ctx) : 0;
}

function poiKind(a: Animal, ctx: Ctx): PoiKind | null {
  return a.goal >= 0 ? (ctx.map.pois[a.goal]?.kind ?? null) : null;
}

/** Arrived at the goal area: start what it came to do. */
function settle(a: Animal, ctx: Ctx): void {
  const kind = poiKind(a, ctx);
  if (kind === 'water') begin(a, ctx, 'drinking', 5, 10);
  else if (kind === 'feed') begin(a, ctx, 'feeding', 40, 90);
  else if (a.species === 'hare') begin(a, ctx, 'bedded', 20, 40);
  else begin(a, ctx, 'bedded', 80, 160);
}

function begin(
  a: Animal,
  ctx: Ctx,
  activity: Animal['activity'],
  minMin: number,
  maxMin: number,
): void {
  a.activity = activity;
  a.until = ctx.now + Math.round(nextRange(ctx.rng, minMin, maxMin) * 60);
  if (activity === 'feeding') pickSpot(a, ctx, null);
}

function travelTo(a: Animal, ctx: Ctx, poi: number): void {
  a.goal = poi;
  a.activity = 'travelling';
  pickSpot(a, ctx, null);
}

/** Choose what to do next when the current activity runs out. */
function decide(a: Animal, ctx: Ctx): void {
  const kind = poiKind(a, ctx);
  const here = a.activity !== 'travelling';
  const { rng, now } = ctx;
  const { home } = a;

  if (a.species === 'hare') {
    if (!hareActive(now)) {
      if (kind === 'form' && here) begin(a, ctx, 'bedded', 20, 40);
      else travelTo(a, ctx, home.rest[0] ?? a.goal);
    } else if (kind === 'feed' && here) {
      begin(a, ctx, 'feeding', 20, 50);
    } else if (home.feed.length > 0) {
      travelTo(a, ctx, pick(rng, home.feed));
    }
    return;
  }

  const part = dayPart(now);
  if (part === 'day') {
    if (kind === 'bed' && here) {
      if (a.activity === 'bedded') begin(a, ctx, 'feeding', 15, 35);
      else begin(a, ctx, 'bedded', 80, 160);
    } else {
      travelTo(a, ctx, chooseRest(a, ctx));
    }
    return;
  }
  const thirsty = now - a.lastDrink > 9 * SECONDS_PER_HOUR;
  if (thirsty && kind !== 'water' && home.water.length > 0) {
    travelTo(a, ctx, home.water[0] as number);
  } else if (kind === 'feed' && here) {
    if (a.activity === 'feeding' && part === 'night' && chance(rng, 0.35)) {
      begin(a, ctx, 'bedded', 40, 90);
    } else if (a.activity === 'feeding' && chance(rng, 0.3) && home.feed.length > 1) {
      travelTo(
        a,
        ctx,
        pick(
          rng,
          home.feed.filter((f) => f !== a.goal),
        ),
      );
    } else {
      begin(a, ctx, 'feeding', 40, 90);
    }
  } else if (home.feed.length > 0) {
    travelTo(a, ctx, pick(rng, home.feed));
  } else {
    begin(a, ctx, 'bedded', 60, 120);
  }
}

/** Where to rest: normally the home bed; when wary, whichever is furthest from the danger. */
function chooseRest(a: Animal, ctx: Ctx): number {
  const { rest } = a.home;
  if (rest.length === 0) return a.goal;
  if (a.wariness < 0.3 || rest.length === 1) return rest[0] as number;
  let best = rest[0] as number;
  let bestD = -1;
  for (const r of rest) {
    const p = ctx.map.pois[r] as Poi;
    const d = Math.hypot(p.x - a.alarmX, p.y - a.alarmY);
    if (d > bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

function arrived(a: Animal, ctx: Ctx): boolean {
  const p = ctx.map.pois[a.goal];
  if (!p) return true;
  return Math.hypot(a.x - p.x, a.y - p.y) < Math.max(3, p.radius * 0.7);
}

/** A walkable spot in the goal area (near the leader's for herd members). */
function pickSpot(a: Animal, ctx: Ctx, leader: Animal | null): void {
  const p = ctx.map.pois[a.goal];
  if (!p) return;
  for (let i = 0; i < 6; i++) {
    const [cx, cy, r] = leader ? [leader.spotX, leader.spotY, 4] : [p.x, p.y, p.radius];
    const ang = nextRange(ctx.rng, 0, Math.PI * 2);
    const dist = nextRange(ctx.rng, leader ? 1.5 : 0, r);
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist;
    if (isWalkable(ctx.map, x, y) && isCellOpen(ctx.map.nav, cellOf(ctx.map.nav, x, y))) {
      a.spotX = x;
      a.spotY = y;
      return;
    }
  }
  a.spotX = p.x;
  a.spotY = p.y;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/** Move straight towards a point, sliding along obstacles. Returns the distance moved. */
function moveToward(a: Animal, map: RegionMap, tx: number, ty: number, maxDist: number): number {
  const dx = tx - a.x;
  const dy = ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6 || maxDist <= 0) return 0;
  const step = Math.min(maxDist, d);
  const nx = a.x + (dx / d) * step;
  const ny = a.y + (dy / d) * step;
  a.heading = Math.atan2(dy, dx);
  const x0 = a.x;
  const y0 = a.y;
  if (isWalkable(map, nx, ny)) {
    a.x = nx;
    a.y = ny;
  } else if (isWalkable(map, nx, a.y)) {
    a.x = nx;
  } else if (isWalkable(map, a.x, ny)) {
    a.y = ny;
  }
  return Math.hypot(a.x - x0, a.y - y0);
}

/** Walk towards the goal along its distance field (so along game trails where they help). */
function travel(a: Animal, ctx: Ctx, distance: number): number {
  const { map } = ctx;
  const p = map.pois[a.goal];
  if (!p) return 0;
  const field = poiField(map, a.goal);
  let left = distance;
  let moved = 0;
  while (left > 1e-6) {
    const cell = cellOf(map.nav, a.x, a.y);
    const next = cell < 0 ? cell : downhill(map.nav, field, cell);
    const target =
      next < 0 || next === cell ? { x: a.spotX, y: a.spotY } : cellCentre(map.nav, next);
    const step = moveToward(a, map, target.x, target.y, Math.min(left, SUBSTEP_M));
    if (step < 1e-6) break;
    moved += step;
    left -= step;
    if (arrived(a, ctx)) break;
  }
  return moved;
}

/** Amble between spots while feeding. */
function graze(a: Animal, ctx: Ctx): number {
  const def = SPECIES[a.species];
  if (Math.hypot(a.spotX - a.x, a.spotY - a.y) < 0.3) {
    if (chance(ctx.rng, Math.min(1, 0.15 * (ctx.dt / 60)))) pickSpot(a, ctx, leaderOf(a, ctx));
    return 0;
  }
  return moveToward(a, ctx.map, a.spotX, a.spotY, (def.speed.graze * ctx.dt) / 60);
}

const FLEE_DIRECTIONS = 16;

/** Bound away from the danger, keeping momentum and preferring cover. */
function flee(a: Animal, ctx: Ctx, distance: number): number {
  const { map } = ctx;
  let left = distance;
  let moved = 0;
  while (left > 1e-6) {
    const away = Math.atan2(a.y - a.alarmY, a.x - a.alarmX);
    let bestScore = Number.NEGATIVE_INFINITY;
    let best = away;
    for (let k = 0; k < FLEE_DIRECTIONS; k++) {
      const dir = away + (k / FLEE_DIRECTIONS) * Math.PI * 2;
      const ax = a.x + Math.cos(dir) * 3;
      const ay = a.y + Math.sin(dir) * 3;
      if (!isWalkable(map, a.x + Math.cos(dir) * 1.5, a.y + Math.sin(dir) * 1.5)) continue;
      if (!isCellOpen(map.nav, cellOf(map.nav, ax, ay))) continue;
      const score =
        2 * Math.cos(dir - away) +
        0.8 * Math.cos(dir - a.heading) +
        0.6 * coverAt(map, a.x + Math.cos(dir) * 8, a.y + Math.sin(dir) * 8);
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    if (bestScore === Number.NEGATIVE_INFINITY) break;
    const step = moveToward(
      a,
      map,
      a.x + Math.cos(best) * SUBSTEP_M,
      a.y + Math.sin(best) * SUBSTEP_M,
      Math.min(left, SUBSTEP_M),
    );
    if (step < 1e-6) break;
    moved += step;
    left -= step;
  }
  return moved;
}

/** Once a day, old frights fade. */
export function calmAnimals(state: WorldState): void {
  for (const a of state.animals) a.wariness *= 0.6;
}
