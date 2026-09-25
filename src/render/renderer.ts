/**
 * PixiJS view of the simulation. Reads snapshots only; never touches WorldState.
 *
 * World drawing units are "world pixels": PX_PER_M per metre. The camera zoom
 * scales the world and overlay containers together.
 *
 * Layers, bottom to top: ground (baked terrain and trails), tree shadows,
 * agents (the player), canopies (faded around the player) and the cabin roof.
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
import { hash32 } from '../core/hash';
import { clamp, lerp, lerpAngle } from '../core/math';
import type { RegionMap } from '../sim/region';
import type { Snapshot } from '../sim/snapshot';
import { COLORS, TERRAIN_RGB } from './palette';

extensions.add(CullerPlugin);

export const PX_PER_M = 16;
/** Terrain texture resolution: texels per tile. */
const TEXELS_PER_TILE = 8;
/** Trees are grouped in square chunks so off-screen ones can be culled. */
const TREE_CHUNK_M = 32;
const MIN_ZOOM = 0.35;
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
  private shadowLayer = new Container();
  private agentLayer = new Container();
  private canopyLayer = new Container();
  private player = new Container();
  private debug = new Graphics();
  private zoom = 0.9;
  private godView = false;
  private regionKey = '';
  private canopyTextures: Texture[] = [];
  private chunks: TreeChunk[] = [];
  private chunkCols = 0;
  private chunkRows = 0;
  private faded = new Set<Sprite>();

  private constructor(app: Application) {
    this.app = app;
    this.world.addChild(this.groundLayer, this.shadowLayer, this.agentLayer, this.canopyLayer);
    this.agentLayer.addChild(this.player);
    this.overlay.addChild(this.debug);
    app.stage.addChild(this.world, this.overlay);
    this.player.addChild(drawPlayer());
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
    for (const child of this.groundLayer.removeChildren())
      child.destroy({ texture: true, textureSource: true });
    for (const child of this.shadowLayer.removeChildren()) child.destroy();
    for (const child of this.canopyLayer.removeChildren()) child.destroy({ children: true });
    this.faded.clear();

    this.groundLayer.addChild(bakeGround(map, seed));
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

    for (const layer of [this.world, this.overlay]) {
      layer.scale.set(this.zoom);
      layer.position.set(width / 2 - x * this.zoom, height / 2 - y * this.zoom);
    }

    this.fadeCanopies(pxM, pyM);
    this.drawDebug(curr);

    // Darken by tinting the whole world (a multiply), not with an overlay pass.
    const dark = 1 - lerp(prev.light, curr.light, alpha);
    const [r, g, b] = NIGHT_TINT.map((night) => Math.round(255 * lerp(1, night, dark))) as [
      number,
      number,
      number,
    ];
    this.world.tint = (r << 16) | (g << 8) | b;

    this.app.render();
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

  /** Fade canopies over the player so you can always see yourself and what's near. */
  private fadeCanopies(px: number, py: number): void {
    const stillFaded = new Set<Sprite>();
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
          sprite.alpha = lerp(CANOPY_FADED_ALPHA, 1, t * t);
          stillFaded.add(sprite);
        }
      }
    }
    for (const sprite of this.faded) if (!stillFaded.has(sprite)) sprite.alpha = 1;
    this.faded = stillFaded;
  }

  private drawDebug(s: Snapshot): void {
    const g = this.debug;
    g.clear();
    if (!this.godView) return;
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
  // Drawn larger than life (0.8 m radius) so the player stays easy to find.
  const r = 0.8 * PX_PER_M;
  return new Graphics()
    .circle(r * 0.3, r * 0.3, r)
    .fill({ color: COLORS.shadow, alpha: 0.3 })
    .circle(0, 0, r)
    .fill(COLORS.player)
    .stroke({ width: 2, color: COLORS.playerOutline })
    .poly([r * 0.35, -r * 0.45, r * 1.25, 0, r * 0.35, r * 0.45])
    .fill(COLORS.playerFacing);
}
