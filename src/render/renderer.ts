/**
 * PixiJS view of the simulation. Reads snapshots only; never touches WorldState.
 *
 * World drawing units are "world pixels": PX_PER_M per metre. The camera zoom
 * scales the whole world container.
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
/** Trees are drawn in square chunks so off-screen ones can be culled. */
const TREE_CHUNK_M = 128;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 2.5;
/** Colour multiplier for the world at full night: dark, cold blue. */
const NIGHT_TINT = [0.2, 0.24, 0.36] as const;

export class Renderer {
  readonly app: Application;
  private world = new Container();
  private terrainLayer = new Container();
  private treeLayer = new Container();
  private player = new Container();
  private zoom = 0.9;
  private regionKey = '';

  private constructor(app: Application) {
    this.app = app;
    // Player above the canopy for now; canopy fading over the player comes with M1.
    this.world.addChild(this.terrainLayer, this.treeLayer, this.player);
    app.stage.addChild(this.world);
    this.player.addChild(drawPlayer());
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

  /** Build the terrain and tree layers for a region (no-op if already shown). */
  setRegion(map: RegionMap, seed: number): void {
    const key = `${seed}:${map.id}`;
    if (key === this.regionKey) return;
    this.regionKey = key;
    for (const child of this.terrainLayer.removeChildren())
      child.destroy({ texture: true, textureSource: true });
    for (const child of this.treeLayer.removeChildren()) child.destroy();
    this.terrainLayer.addChild(bakeTerrain(map, seed));
    for (const chunk of drawTrees(map)) this.treeLayer.addChild(chunk);
  }

  zoomBy(factor: number): void {
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  }

  render(prev: Snapshot, curr: Snapshot, alpha: number): void {
    const { width, height } = this.app.screen;
    const x = lerp(prev.player.x, curr.player.x, alpha) * PX_PER_M;
    const y = lerp(prev.player.y, curr.player.y, alpha) * PX_PER_M;

    this.player.position.set(x, y);
    this.player.rotation = lerpAngle(prev.player.heading, curr.player.heading, alpha);

    this.world.scale.set(this.zoom);
    this.world.position.set(width / 2 - x * this.zoom, height / 2 - y * this.zoom);

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
}

function bakeTerrain(map: RegionMap, seed: number): Sprite {
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

  const source = new CanvasSource({
    resource: canvas,
    autoGenerateMipmaps: true,
    scaleMode: 'linear',
  });
  const sprite = new Sprite(new Texture({ source }));
  sprite.scale.set((map.tileSize * PX_PER_M) / TEXELS_PER_TILE);
  return sprite;
}

function drawTrees(map: RegionMap): Graphics[] {
  const cols = Math.ceil((map.width * map.tileSize) / TREE_CHUNK_M);
  const rows = Math.ceil((map.height * map.tileSize) / TREE_CHUNK_M);
  const chunks: Graphics[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const g = new Graphics();
    g.cullable = true;
    chunks.push(g);
  }

  const { trees } = map;
  // Shadows first (in every chunk), then canopies, so shadows never cover a neighbour's crown.
  for (const pass of ['shadow', 'canopy'] as const) {
    for (let i = 0; i < trees.length; i += 3) {
      const x = (trees[i] as number) * PX_PER_M;
      const y = (trees[i + 1] as number) * PX_PER_M;
      const r = (trees[i + 2] as number) * PX_PER_M;
      const chunk = chunks[
        Math.floor((trees[i + 1] as number) / TREE_CHUNK_M) * cols +
          Math.floor((trees[i] as number) / TREE_CHUNK_M)
      ] as Graphics;
      if (pass === 'shadow') {
        chunk.circle(x + r * 0.35, y + r * 0.35, r).fill({ color: COLORS.shadow, alpha: 0.28 });
      } else {
        const color = COLORS.canopy[hash32(i) % COLORS.canopy.length] as number;
        chunk.circle(x, y, r).fill({ color, alpha: 0.96 });
        chunk
          .circle(x - r * 0.25, y - r * 0.25, r * 0.5)
          .fill({ color: COLORS.canopyHighlight, alpha: 0.35 });
      }
    }
  }
  for (const [i, chunk] of chunks.entries()) {
    const cx = (i % cols) * TREE_CHUNK_M * PX_PER_M;
    const cy = Math.floor(i / cols) * TREE_CHUNK_M * PX_PER_M;
    const pad = 4 * PX_PER_M;
    chunk.cullArea = new Rectangle(
      cx - pad,
      cy - pad,
      TREE_CHUNK_M * PX_PER_M + 2 * pad,
      TREE_CHUNK_M * PX_PER_M + 2 * pad,
    );
  }
  return chunks;
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
