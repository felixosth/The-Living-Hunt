/**
 * PixiJS view of the simulation. Reads snapshots only; never touches WorldState.
 *
 * World drawing units are "world pixels": PX_PER_M per metre. The camera zoom
 * scales the world and overlay containers together.
 *
 * Layers, bottom to top: ground (baked terrain and trails), snow lying on
 * it, your footprints, found signs, tree shadows, agents (the player),
 * canopies (faded around the player) and the cabin roof, then the air (wind,
 * rain and snow) and arrows in flight. Fog closes in over all of it.
 * The overlay above them is not darkened at night; it holds debug drawings.
 */
import {
  Application,
  CanvasSource,
  Container,
  CullerPlugin,
  extensions,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import { terrainDef } from '../content/terrain';
import { hash32 } from '../core/hash';
import { clamp, lerp, lerpAngle } from '../core/math';
import type { SoundKind } from '../sim/events';
import type { RegionMap } from '../sim/region';
import type { Snapshot } from '../sim/snapshot';
import { AirLayer } from './air';
import { AnimalLayer } from './animals';
import { ArrowFlights, type ArrowShot } from './arrows';
import { ScreenCues } from './cues';
import { Footprints } from './footprints';
import { COLORS, TERRAIN_RGB } from './palette';
import { SignLayer } from './signs';

extensions.add(CullerPlugin);

export const PX_PER_M = 16;
/** Terrain texture resolution: texels per tile. */
const TEXELS_PER_TILE = 8;
/** Snow is smooth, so its texture can be coarser. */
const SNOW_TEXELS = 4;
/** Trees are grouped in square chunks so off-screen ones can be culled. */
const TREE_CHUNK_M = 32;
const MIN_ZOOM = 0.3;
/** How far the camera leans towards the mouse, as a share of the mouse's distance from centre. */
const LOOK_AHEAD = 0.6;
const MIN_ZOOM_GOD = 0.12;
const MAX_ZOOM = 2.5;
/** Colour multiplier for the world at full night: dark, cold blue. */
const NIGHT_TINT = [0.2, 0.24, 0.36] as const;
/** Canopies within this distance (m) beyond their edge fade so you can see beneath them. */
const CANOPY_FADE_M = 3;
const CANOPY_FADED_ALPHA = 0.22;
const CANOPY_TEXTURE_PX = 128;

interface TreeChunk {
  container: Container;
  sprites: Sprite[];
  /** [x, y, r] per sprite, in metres. */
  trees: number[];
}

export class Renderer {
  readonly app: Application;
  private world = new Container();
  private overlay = new Container();
  private groundLayer = new Container();
  private snowLayer = new Container();
  /** Snow lying in patches (a dusting) and all over, faded in with the depth. */
  private snowPatchy: Sprite | null = null;
  private snowFull: Sprite | null = null;
  private footprintLayer = new Container();
  private footprints: Footprints;
  /** Fog and thick snowfall, drawn in screen space round the player. */
  private haze = new Graphics();
  private shadowLayer = new Container();
  private signLayer = new Container();
  private signs: SignLayer;
  private agentLayer = new Container();
  private canopyLayer = new Container();
  private airLayer = new Container();
  private air: AirLayer;
  private arrows: ArrowFlights;
  private player = new Container();
  private debug = new Graphics();
  private animals: AnimalLayer;
  private map: RegionMap | null = null;
  private zoom = 0.55;
  private godView = false;
  private regionKey = '';
  private canopyTextures: Texture[] = [];
  private chunks: TreeChunk[] = [];
  private chunkCols = 0;
  private chunkRows = 0;
  private faded = new Set<Sprite>();
  private cues: ScreenCues;
  /** Mouse position in screen pixels, for looking ahead. */
  private pointer: { x: number; y: number } | null = null;
  /** Camera offset from the player, in screen pixels, eased towards the look-ahead target. */
  private look = { x: 0, y: 0 };
  private lastFrame = 0;

  private constructor(app: Application) {
    this.app = app;
    this.world.addChild(
      this.groundLayer,
      this.snowLayer,
      this.footprintLayer,
      this.signLayer,
      this.shadowLayer,
      this.agentLayer,
      this.canopyLayer,
      this.airLayer,
    );
    this.agentLayer.addChild(this.player);
    this.air = new AirLayer(this.airLayer);
    this.arrows = new ArrowFlights(this.airLayer);
    this.footprints = new Footprints(this.footprintLayer);
    this.overlay.addChild(this.debug);
    app.stage.addChild(this.world, this.haze, this.overlay);
    this.cues = new ScreenCues(app.stage);
    this.player.addChild(drawPlayer());
    this.animals = new AnimalLayer(this.agentLayer, this.overlay);
    this.signs = new SignLayer(this.signLayer, this.overlay);
    this.canopyTextures = COLORS.canopy.map((color) => canopyTexture(app, color));
  }

  static async create(host: HTMLElement): Promise<Renderer> {
    const app = new Application();
    await app.init({
      resizeTo: window,
      background: COLORS.background,
      antialias: true,
      autoStart: false,
      preference: 'webgl',
    });
    app.canvas.id = 'game-canvas';
    host.appendChild(app.canvas);
    return new Renderer(app);
  }

  /** Build the static layers for a region (no-op if already shown). */
  setRegion(map: RegionMap, seed: number): void {
    const key = `${seed}:${map.id}`;
    if (key === this.regionKey) return;
    this.regionKey = key;
    this.map = map;
    this.animals.clear();
    this.signs.clear();
    for (const child of this.groundLayer.removeChildren())
      child.destroy({ texture: true, textureSource: true });
    for (const child of this.shadowLayer.removeChildren()) child.destroy();
    for (const child of this.canopyLayer.removeChildren()) child.destroy({ children: true });
    this.faded.clear();

    this.groundLayer.addChild(bakeGround(map, seed));
    for (const child of this.snowLayer.removeChildren()) {
      child.destroy({ texture: true, textureSource: true });
    }
    this.snowPatchy = bakeSnow(map, seed, true);
    this.snowFull = bakeSnow(map, seed, false);
    this.snowLayer.addChild(this.snowPatchy, this.snowFull);
    this.footprints.clear();
    for (const g of drawShadows(map)) this.shadowLayer.addChild(g);
    this.buildCanopies(map);
    this.canopyLayer.addChild(drawCabin(map));
  }

  setGodView(on: boolean): void {
    this.godView = on;
    this.zoomBy(1);
  }

  zoomBy(factor: number): void {
    this.zoom = clamp(this.zoom * factor, this.godView ? MIN_ZOOM_GOD : MIN_ZOOM, MAX_ZOOM);
  }

  render(prev: Snapshot, curr: Snapshot, alpha: number): void {
    const { width, height } = this.app.screen;
    const pxM = lerp(prev.player.x, curr.player.x, alpha);
    const pyM = lerp(prev.player.y, curr.player.y, alpha);
    const x = pxM * PX_PER_M;
    const y = pyM * PX_PER_M;

    this.player.position.set(x, y);
    this.player.rotation = lerpAngle(prev.player.heading, curr.player.heading, alpha);

    this.updateLook(width, height, curr.bow !== null);
    const ox = width / 2 - this.look.x;
    const oy = height / 2 - this.look.y;
    for (const layer of [this.world, this.overlay]) {
      layer.scale.set(this.zoom);
      layer.position.set(ox - x * this.zoom, oy - y * this.zoom);
    }

    this.updateSnow(curr);
    this.footprints.update(curr);
    const seen = this.animals.update(prev, curr, alpha, this.zoom);
    this.signs.update(curr, this.zoom, performance.now());
    this.fadeCanopies([{ x: pxM, y: pyM }, ...seen]);
    const now = performance.now();
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(width, height);
    this.air.update(
      curr,
      { x0: topLeft.x, y0: topLeft.y, x1: bottomRight.x, y1: bottomRight.y },
      this.zoom,
      now,
    );
    this.arrows.update(this.zoom, now, (id) => {
      const b = curr.animals.find((a) => a.id === id);
      if (!b) return null;
      const a = prev.animals.find((p) => p.id === id) ?? b;
      return { x: lerp(a.x, b.x, alpha), y: lerp(a.y, b.y, alpha) };
    });
    this.drawDebug(curr);
    this.cues.draw(
      curr,
      { x: ox, y: oy },
      (wx, wy) => ({
        x: ox + (wx - pxM) * PX_PER_M * this.zoom,
        y: oy + (wy - pyM) * PX_PER_M * this.zoom,
      }),
      width,
      height,
      now,
    );

    // Darken by tinting the whole world (a multiply), not with an overlay pass.
    // Heavy cloud dims the day; snow on the ground lightens the night.
    const light = lerp(prev.light, curr.light, alpha);
    const { cloud, snowCm } = curr.weather;
    const lit = light * (1 - 0.28 * cloud);
    const dark = (1 - lit) * (1 - 0.3 * Math.min(1, snowCm / 5) * (1 - light));
    const tint = NIGHT_TINT.map((night) => lerp(1, night, dark)) as [number, number, number];
    const [r, g, b] = tint.map((k) => Math.round(255 * k)) as [number, number, number];
    this.world.tint = (r << 16) | (g << 8) | b;
    this.drawHaze(curr, width / 2 - this.look.x, height / 2 - this.look.y, width, height, tint);

    this.app.render();
  }

  /** Fade the lying snow in with its depth: a patchy dusting first, then all over. */
  private updateSnow(s: Snapshot): void {
    const cm = s.weather.snowCm;
    if (this.snowPatchy) this.snowPatchy.alpha = clamp(cm / 1.5, 0, 1) * 0.9;
    if (this.snowFull) this.snowFull.alpha = clamp((cm - 1) / 6, 0, 1) * 0.92;
  }

  /**
   * Fog, and the grey of thick snowfall, closing in round the player: clear
   * close by, thickening to a wall at the edge of sight.
   */
  private drawHaze(
    s: Snapshot,
    cx: number,
    cy: number,
    width: number,
    height: number,
    tint: [number, number, number],
  ): void {
    const g = this.haze;
    g.clear();
    const { fog, precip, precipType } = s.weather;
    const falling =
      precipType === 'snow'
        ? 0.45 * Math.min(1, precip / 2)
        : precipType === 'none'
          ? 0
          : 0.18 * Math.min(1, precip / 3);
    const thick = Math.max(fog, falling);
    if (thick < 0.03) return;
    const sightM = 150 * (1 - 0.7 * thick);
    const px = PX_PER_M * this.zoom;
    const r1 = sightM * px;
    const r0 = 0.3 * r1;
    const peak = Math.min(0.9, thick * 1.05);
    const color = COLORS.fog.map((c, i) => Math.round(c * (tint[i] as number))) as number[];
    const fill = ((color[0] as number) << 16) | ((color[1] as number) << 8) | (color[2] as number);
    const RINGS = 24;
    for (let i = 0; i < RINGS; i++) {
      const inner = lerp(r0, r1, i / RINGS);
      const outer = lerp(r0, r1, (i + 1) / RINGS);
      const a = peak * ((i + 0.5) / RINGS) ** 1.4;
      g.circle(cx, cy, outer).fill({ color: fill, alpha: a }).circle(cx, cy, inner).cut();
    }
    const far = Math.hypot(width, height) * 2;
    g.rect(cx - far, cy - far, 2 * far, 2 * far)
      .fill({ color: fill, alpha: peak })
      .circle(cx, cy, r1)
      .cut();
  }

  /** Show an arrow flying from the bow to where it ends up. */
  addArrow(shot: ArrowShot): void {
    this.arrows.add(shot, performance.now());
  }

  /** Where the mouse is, so the camera can look that way (null when it leaves the window). */
  setPointer(p: { x: number; y: number } | null): void {
    this.pointer = p;
  }

  /** Show which way a sound came from, relative to the player (radians, screen convention). */
  addSound(kind: SoundKind, angle: number): void {
    this.cues.addSound(kind, angle, performance.now());
  }

  /**
   * Ease the camera towards the mouse so you can look further in any
   * direction, but never so far the player leaves the screen. It holds still
   * while the bow is drawn, since the mouse is aiming then.
   */
  private updateLook(width: number, height: number, frozen: boolean): void {
    const now = performance.now();
    const dt = this.lastFrame === 0 ? 16 : Math.min(100, now - this.lastFrame);
    this.lastFrame = now;
    if (frozen) return;
    const margin = Math.min(160, Math.min(width, height) * 0.22);
    let tx = 0;
    let ty = 0;
    if (this.pointer) {
      tx = clamp(
        (this.pointer.x - width / 2) * LOOK_AHEAD,
        -(width / 2 - margin),
        width / 2 - margin,
      );
      ty = clamp(
        (this.pointer.y - height / 2) * LOOK_AHEAD,
        -(height / 2 - margin),
        height / 2 - margin,
      );
    }
    const k = 1 - Math.exp(-dt / 280);
    this.look.x += (tx - this.look.x) * k;
    this.look.y += (ty - this.look.y) * k;
  }

  /** Screen pixel to world metres. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.world.position.x) / this.zoom / PX_PER_M,
      y: (sy - this.world.position.y) / this.zoom / PX_PER_M,
    };
  }

  /** World metres to screen pixel. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: this.world.position.x + x * PX_PER_M * this.zoom,
      y: this.world.position.y + y * PX_PER_M * this.zoom,
    };
  }

  /** Metres covered by `px` screen pixels at the current zoom. */
  metresPerPixel(px: number): number {
    return px / this.zoom / PX_PER_M;
  }

  setHoverSign(id: number): void {
    this.signs.setHover(id);
  }

  private buildCanopies(map: RegionMap): void {
    const widthM = map.width * map.tileSize;
    const heightM = map.height * map.tileSize;
    this.chunkCols = Math.ceil(widthM / TREE_CHUNK_M);
    this.chunkRows = Math.ceil(heightM / TREE_CHUNK_M);
    this.chunks = [];
    for (let i = 0; i < this.chunkCols * this.chunkRows; i++) {
      const container = new Container();
      container.cullable = true;
      container.cullableChildren = false;
      const cx = (i % this.chunkCols) * TREE_CHUNK_M;
      const cy = Math.floor(i / this.chunkCols) * TREE_CHUNK_M;
      const pad = 4;
      container.cullArea = new Rectangle(
        (cx - pad) * PX_PER_M,
        (cy - pad) * PX_PER_M,
        (TREE_CHUNK_M + 2 * pad) * PX_PER_M,
        (TREE_CHUNK_M + 2 * pad) * PX_PER_M,
      );
      this.chunks.push({ container, sprites: [], trees: [] });
      this.canopyLayer.addChild(container);
    }
    const { trees } = map;
    for (let i = 0; i < trees.length; i += 3) {
      const tx = trees[i] as number;
      const ty = trees[i + 1] as number;
      const tr = trees[i + 2] as number;
      const chunk = this.chunkAt(tx, ty);
      if (!chunk) continue;
      const texture = this.canopyTextures[hash32(i) % this.canopyTextures.length] as Texture;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(tx * PX_PER_M, ty * PX_PER_M);
      sprite.scale.set((2 * tr * PX_PER_M) / CANOPY_TEXTURE_PX);
      sprite.rotation = ((hash32(i, 7) & 1023) / 1024) * Math.PI * 2;
      chunk.container.addChild(sprite);
      chunk.sprites.push(sprite);
      chunk.trees.push(tx, ty, tr);
    }
  }

  private chunkAt(x: number, y: number): TreeChunk | undefined {
    const cx = Math.floor(x / TREE_CHUNK_M);
    const cy = Math.floor(y / TREE_CHUNK_M);
    if (cx < 0 || cy < 0 || cx >= this.chunkCols || cy >= this.chunkRows) return undefined;
    return this.chunks[cy * this.chunkCols + cx];
  }

  /** Fade canopies over the player and the animals in view, so you can always see them. */
  private fadeCanopies(points: { x: number; y: number }[]): void {
    const stillFaded = new Set<Sprite>();
    for (const { x: px, y: py } of points) this.fadeAround(px, py, stillFaded);
    for (const sprite of this.faded) if (!stillFaded.has(sprite)) sprite.alpha = 1;
    this.faded = stillFaded;
  }

  private fadeAround(px: number, py: number, stillFaded: Set<Sprite>): void {
    // Largest canopy radius is under 3 m.
    const reach = 3 + CANOPY_FADE_M;
    const cx0 = Math.max(0, Math.floor((px - reach) / TREE_CHUNK_M));
    const cx1 = Math.min(this.chunkCols - 1, Math.floor((px + reach) / TREE_CHUNK_M));
    const cy0 = Math.max(0, Math.floor((py - reach) / TREE_CHUNK_M));
    const cy1 = Math.min(this.chunkRows - 1, Math.floor((py + reach) / TREE_CHUNK_M));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.chunks[cy * this.chunkCols + cx] as TreeChunk;
        for (let i = 0; i < chunk.sprites.length; i++) {
          const tx = chunk.trees[i * 3] as number;
          const ty = chunk.trees[i * 3 + 1] as number;
          const tr = chunk.trees[i * 3 + 2] as number;
          const edge = Math.hypot(tx - px, ty - py) - tr;
          if (edge > CANOPY_FADE_M) continue;
          const sprite = chunk.sprites[i] as Sprite;
          const t = clamp(edge / CANOPY_FADE_M, 0, 1);
          const alpha = lerp(CANOPY_FADED_ALPHA, 1, t * t);
          sprite.alpha = stillFaded.has(sprite) ? Math.min(sprite.alpha, alpha) : alpha;
          stillFaded.add(sprite);
        }
      }
    }
  }

  private drawDebug(s: Snapshot): void {
    const g = this.debug;
    g.clear();
    if (!this.godView) return;
    // Points of interest.
    for (const poi of this.map?.pois ?? []) {
      g.circle(poi.x * PX_PER_M, poi.y * PX_PER_M, poi.radius * PX_PER_M).stroke({
        width: 2 / this.zoom,
        color: COLORS.poi[poi.kind],
        alpha: 0.8,
      });
    }
    const px = s.player.x * PX_PER_M;
    const py = s.player.y * PX_PER_M;
    // Scent cone.
    const { angle, halfAngle, range } = s.scent;
    const r = range * PX_PER_M;
    if (halfAngle >= Math.PI) {
      g.circle(px, py, r).fill({ color: COLORS.scent, alpha: 0.12 });
    } else {
      g.moveTo(px, py)
        .arc(px, py, r, angle - halfAngle, angle + halfAngle)
        .lineTo(px, py)
        .fill({ color: COLORS.scent, alpha: 0.14 })
        .stroke({ width: 1.5 / this.zoom, color: COLORS.scent, alpha: 0.5 });
    }
    // Every animal as a dot that stays visible at any zoom, with a line to where it's heading.
    for (const a of s.animals) {
      const ax = a.x * PX_PER_M;
      const ay = a.y * PX_PER_M;
      const goal = a.debug ? this.map?.pois[a.debug.goal] : undefined;
      if (goal && a.activity === 'travelling') {
        g.moveTo(ax, ay)
          .lineTo(goal.x * PX_PER_M, goal.y * PX_PER_M)
          .stroke({ width: 1 / this.zoom, color: COLORS.poi[goal.kind], alpha: 0.5 });
      }
      const ring =
        a.alertness === 'unaware'
          ? COLORS.eyeCalm
          : a.alertness === 'suspicious'
            ? COLORS.eyeSuspicious
            : COLORS.eyeAlarmed;
      g.circle(ax, ay, 4 / this.zoom)
        .fill({ color: a.species === 'roe' ? COLORS.roe : COLORS.hare })
        .stroke({ width: 2 / this.zoom, color: ring });
    }
    // Noise radius.
    if (s.player.noiseRadius > 0) {
      g.circle(px, py, s.player.noiseRadius * PX_PER_M).stroke({
        width: 1.5 / this.zoom,
        color: COLORS.noise,
        alpha: 0.7,
      });
    }
  }
}

function bakeGround(map: RegionMap, seed: number): Sprite {
  const w = map.width * TEXELS_PER_TILE;
  const h = map.height * TEXELS_PER_TILE;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const image = ctx.createImageData(w, h);
  const px = image.data;
  const salt = hash32(seed, 'terrain-texture');

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const rgb = TERRAIN_RGB[map.terrain[ty * map.width + tx] as keyof typeof TERRAIN_RGB];
      // A per-tile tone shift plus per-texel grain gives the ground some life.
      const tileShade = ((hash32(salt, tx, ty) & 255) / 255 - 0.5) * 0.1;
      for (let sy = 0; sy < TEXELS_PER_TILE; sy++) {
        const py = ty * TEXELS_PER_TILE + sy;
        for (let sx = 0; sx < TEXELS_PER_TILE; sx++) {
          const pxX = tx * TEXELS_PER_TILE + sx;
          const grain = ((hash32(salt, pxX, py) & 255) / 255 - 0.5) * 0.12;
          const k = 1 + tileShade + grain;
          const i = (py * w + pxX) * 4;
          px[i] = rgb[0] * k;
          px[i + 1] = rgb[1] * k;
          px[i + 2] = rgb[2] * k;
          px[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  drawTrails(ctx, map);

  const source = new CanvasSource({
    resource: canvas,
    autoGenerateMipmaps: true,
    scaleMode: 'linear',
  });
  const sprite = new Sprite(new Texture({ source }));
  sprite.scale.set((map.tileSize * PX_PER_M) / TEXELS_PER_TILE);
  return sprite;
}

/**
 * Where snow lies, as a white texture over the ground: full in the open,
 * thinner under spruce, none on water, and trodden thin along the game
 * trails. The patchy version is a first dusting in the hollows.
 */
function bakeSnow(map: RegionMap, seed: number, patchy: boolean): Sprite {
  const w = map.width * SNOW_TEXELS;
  const h = map.height * SNOW_TEXELS;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const image = ctx.createImageData(w, h);
  const px = image.data;
  const salt = hash32(seed, 'snow-texture');
  const [sr, sg, sb] = COLORS.snow;
  // Coarse noise, bilinear between per-tile values, for the dusting's patches.
  const corner = (tx: number, ty: number) => (hash32(salt, tx, ty) & 1023) / 1023;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const catchK = terrainDef(map.terrain[ty * map.width + tx] as number).snowCatch;
      const c00 = corner(tx, ty);
      const c10 = corner(tx + 1, ty);
      const c01 = corner(tx, ty + 1);
      const c11 = corner(tx + 1, ty + 1);
      for (let sy = 0; sy < SNOW_TEXELS; sy++) {
        const py = ty * SNOW_TEXELS + sy;
        const fy = sy / SNOW_TEXELS;
        for (let sx = 0; sx < SNOW_TEXELS; sx++) {
          const pxX = tx * SNOW_TEXELS + sx;
          const fx = sx / SNOW_TEXELS;
          const n = lerp(lerp(c00, c10, fx), lerp(c01, c11, fx), fy);
          const grain = ((hash32(salt, pxX, py) & 255) / 255 - 0.5) * 0.08;
          const cover = patchy ? clamp((n - 0.45) * 5, 0, 1) : 1;
          const i = (py * w + pxX) * 4;
          px[i] = sr * (1 + grain);
          px[i + 1] = sg * (1 + grain);
          px[i + 2] = sb * (1 + grain);
          px[i + 3] = 255 * catchK * cover;
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  // Trodden trails show through.
  const scale = SNOW_TEXELS / map.tileSize;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.9 * scale;
  for (const line of map.trails) {
    const pts = smooth(line, 2);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const x = (pts[i] as number) * scale;
      const y = (pts[i + 1] as number) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const source = new CanvasSource({
    resource: canvas,
    autoGenerateMipmaps: true,
    scaleMode: 'linear',
  });
  const sprite = new Sprite(new Texture({ source }));
  sprite.scale.set((map.tileSize * PX_PER_M) / SNOW_TEXELS);
  sprite.alpha = 0;
  return sprite;
}

/** Game trails: worn, lighter earth. Drawn opaque on their own canvas so overlaps don't darken. */
function drawTrails(target: CanvasRenderingContext2D, map: RegionMap): void {
  const scale = TEXELS_PER_TILE / map.tileSize;
  const layer = document.createElement('canvas');
  layer.width = target.canvas.width;
  layer.height = target.canvas.height;
  const ctx = layer.getContext('2d');
  if (!ctx) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = COLORS.trail;
  ctx.lineWidth = 1.3 * scale;
  for (const line of map.trails) {
    const pts = smooth(line, 2);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const x = (pts[i] as number) * scale;
      const y = (pts[i + 1] as number) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  target.globalAlpha = 0.5;
  target.drawImage(layer, 0, 0);
  target.globalAlpha = 1;
}

/** Chaikin corner cutting on a flat [x, y, ...] polyline. */
function smooth(line: Float32Array, rounds: number): number[] {
  let pts = Array.from(line);
  for (let r = 0; r < rounds; r++) {
    if (pts.length < 6) break;
    const out = [pts[0] as number, pts[1] as number];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x0 = pts[i] as number;
      const y0 = pts[i + 1] as number;
      const x1 = pts[i + 2] as number;
      const y1 = pts[i + 3] as number;
      out.push(
        0.75 * x0 + 0.25 * x1,
        0.75 * y0 + 0.25 * y1,
        0.25 * x0 + 0.75 * x1,
        0.25 * y0 + 0.75 * y1,
      );
    }
    out.push(pts[pts.length - 2] as number, pts[pts.length - 1] as number);
    pts = out;
  }
  return pts;
}

function drawShadows(map: RegionMap): Graphics[] {
  const chunkM = 128;
  const cols = Math.ceil((map.width * map.tileSize) / chunkM);
  const rows = Math.ceil((map.height * map.tileSize) / chunkM);
  const chunks: Graphics[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const g = new Graphics();
    g.cullable = true;
    const cx = (i % cols) * chunkM * PX_PER_M;
    const cy = Math.floor(i / cols) * chunkM * PX_PER_M;
    const pad = 4 * PX_PER_M;
    g.cullArea = new Rectangle(
      cx - pad,
      cy - pad,
      chunkM * PX_PER_M + 2 * pad,
      chunkM * PX_PER_M + 2 * pad,
    );
    chunks.push(g);
  }
  const { trees } = map;
  for (let i = 0; i < trees.length; i += 3) {
    const tx = trees[i] as number;
    const ty = trees[i + 1] as number;
    const r = (trees[i + 2] as number) * PX_PER_M;
    const chunk = chunks[Math.floor(ty / chunkM) * cols + Math.floor(tx / chunkM)] as Graphics;
    chunk
      .circle(tx * PX_PER_M + r * 0.35, ty * PX_PER_M + r * 0.35, r)
      .fill({ color: COLORS.shadow, alpha: 0.28 });
  }
  return chunks;
}

function canopyTexture(app: Application, color: number): Texture {
  const r = CANOPY_TEXTURE_PX / 2;
  const g = new Graphics()
    .circle(r, r, r)
    .fill({ color, alpha: 0.96 })
    .circle(r * 0.75, r * 0.75, r * 0.5)
    .fill({ color: COLORS.canopyHighlight, alpha: 0.35 });
  const texture = app.renderer.generateTexture({
    target: g,
    frame: new Rectangle(0, 0, CANOPY_TEXTURE_PX, CANOPY_TEXTURE_PX),
    antialias: true,
  });
  g.destroy();
  return texture;
}

function drawCabin(map: RegionMap): Graphics {
  const { x, y, w, h } = map.cabin;
  const s = PX_PER_M;
  const g = new Graphics();
  // Shadow, roof halves either side of the ridge, the ridge beam, a chimney.
  g.rect((x + 0.6) * s, (y + 0.6) * s, w * s, h * s).fill({ color: COLORS.shadow, alpha: 0.3 });
  g.rect(x * s, y * s, w * s, (h / 2) * s).fill(COLORS.roofDark);
  g.rect(x * s, (y + h / 2) * s, w * s, (h / 2) * s).fill(COLORS.roofLight);
  g.rect(x * s, (y + h / 2 - 0.15) * s, w * s, 0.3 * s).fill(COLORS.ridge);
  g.rect((x + w * 0.72) * s, (y + h * 0.18) * s, 1 * s, 1 * s).fill(COLORS.chimney);
  g.rect(x * s, y * s, w * s, h * s).stroke({ width: 2, color: COLORS.ridge });
  return g;
}

function drawPlayer(): Graphics {
  // Drawn larger than life (1 m radius) so the player stays easy to find.
  const r = 1 * PX_PER_M;
  return new Graphics()
    .circle(r * 0.3, r * 0.3, r)
    .fill({ color: COLORS.shadow, alpha: 0.3 })
    .circle(0, 0, r)
    .fill(COLORS.player)
    .stroke({ width: 2, color: COLORS.playerOutline })
    .poly([r * 0.35, -r * 0.45, r * 1.25, 0, r * 0.35, r * 0.45])
    .fill(COLORS.playerFacing);
}
