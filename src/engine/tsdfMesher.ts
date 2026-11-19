import * as THREE from 'three';
import {
  RESOLUTION_VOXEL_M,
  type EngineConfig,
  type MeshAlgorithm,
  type RenderMode,
} from '../types/recon';

export interface DepthFrameInput {
  cols: number;
  rows: number;
  depth: Float32Array;       // Linear eye-space Z depth in meters (0 = invalid)
  colorR: Uint8Array;        // Albedo R 0..255
  colorG: Uint8Array;        // Albedo G 0..255
  colorB: Uint8Array;        // Albedo B 0..255
  roomTag: Uint8Array;       // 0 = Oda 1, 1 = Oda 2, 2 = Kamera
  flags: Uint8Array;         // bit 0 = isMirror, bit 1 = isMacro
  hitPoints: Float32Array;   // World hit positions (cols * rows * 3) for sparse block activation
  hitValid: Uint8Array;      // 1 if valid hit
  minDepth: number;
  maxDepth: number;
  mirrorClampedCount: number;
}

const BLOCK_DIM = 8;
const BLOCK_VOL = BLOCK_DIM * BLOCK_DIM * BLOCK_DIM; // 512 voxels per block
const MAX_WEIGHT = 28;
const MIN_SURFACE_WEIGHT = 0.8;

interface VoxelBlock {
  bx: number;
  by: number;
  bz: number;
  key: string;
  tsdf: Float32Array;       // [-1, 1] signed distance
  weight: Float32Array;     // Running integration weight
  r: Float32Array;          // Fused linear albedo R [0..1]
  g: Float32Array;          // Fused linear albedo G [0..1]
  b: Float32Array;          // Fused linear albedo B [0..1]
  flags: Uint8Array;        // bit 0 = mirror, bit 1 = macro
  roomVotesA: number;
  roomVotesB: number;
  roomVotesCam: number;
  dirty: boolean;
  // Extracted render artifacts for this block (one unified non-overlapping surface!)
  mesh: THREE.Mesh | null;
  wireMesh: THREE.LineSegments | null;
  pointsMesh: THREE.Points | null;
  geometry: THREE.BufferGeometry | null;
  wireGeometry: THREE.BufferGeometry | null;
  // Saved raw vertex positions & topology for instant Taubin re-smoothing & re-coloring
  rawPositions: Float32Array | null;
  smoothedPositions: Float32Array | null;
  albedoColors: Float32Array | null;
  vertexFlags: Uint8Array | null;
  indices: Uint32Array | null;
  triangleCount: number;
  vertexCount: number;
  worldCenter: THREE.Vector3;
  dominantNormal: THREE.Vector3;
}

// Reusable scratch objects (Zero GC inside frame loop)
const _projMat = new THREE.Matrix4();
const _viewMat = new THREE.Matrix4();
const _vWorld = new THREE.Vector3();
const _vCam = new THREE.Vector3();
const _vNdc = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpColor = new THREE.Color();

export function turboColormap(t: number, out: THREE.Color): THREE.Color {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  const r = THREE.MathUtils.clamp(
    0.1357 + x * (4.6154 + x * (-42.6603 + x * (132.1311 + x * (-152.9424 + x * 59.2864)))),
    0,
    1,
  );
  const g = THREE.MathUtils.clamp(
    0.0914 + x * (2.1942 + x * (4.843 + x * (-14.185 + x * (4.2773 + x * 2.8296)))),
    0,
    1,
  );
  const b = THREE.MathUtils.clamp(
    0.1067 + x * (12.6419 + x * (-60.582 + x * (110.3628 + x * (-89.9031 + x * 27.3482)))),
    0,
    1,
  );
  return out.setRGB(r, g, b);
}

function blockKey(bx: number, by: number, bz: number): string {
  return `${bx},${by},${bz}`;
}

function voxelIndex(lx: number, ly: number, lz: number): number {
  return (lz * BLOCK_DIM + ly) * BLOCK_DIM + lx;
}

// 12 cube edges connecting 8 corners (bit0=x, bit1=y, bit2=z)
const CUBE_EDGES: readonly [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7], // X-aligned
  [0, 2], [1, 3], [4, 6], [5, 7], // Y-aligned
  [0, 4], [1, 5], [2, 6], [3, 7], // Z-aligned
];

const CORNER_OFFSETS: readonly [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

/**
 * True Unified World-Space Volumetric TSDF + Seamless Border Surface Nets Mesher.
 *
 * Solves BOTH overlapping meshes AND scattered floating islands by design:
 * 1. Single unified 3D spatial-hashed TSDF volume (8x8x8 voxel blocks) in world space:
 *    Every physical surface has EXACTLY ONE zero-crossing iso-surface regardless of
 *    how many angles or frames scan it.
 * 2. Voxel-centric frustum projection integration:
 *    Projects every voxel in active surface blocks into the live depth buffer so
 *    surfaces fuse solidly without sparse ray-gap holes or disconnected islands.
 * 3. Seamless 1-voxel neighbor halo Surface Nets extraction + Taubin (lambda/mu) smoothing:
 *    Adjacent blocks meet watertightly with shared smooth vertices and outward normals.
 */
export class TsdfVoxelMesher {
  public readonly group = new THREE.Group();
  private readonly blocks = new Map<string, VoxelBlock>();
  private voxelSize = 0.062;
  private truncDist = 0.16;

  private readonly surfaceMaterial: THREE.MeshStandardMaterial;
  private readonly wireMaterial: THREE.LineBasicMaterial;
  private readonly pointsMaterial: THREE.PointsMaterial;

  private currentMode: RenderMode = 'ar_overlay';
  private currentAlgo: MeshAlgorithm = 'surface_nets';
  private keyframeCounter = 0;
  private lastSmoothingMs = 0;
  private lastMirrorClamped = 0;
  private lastOccludedBlocks = 0;
  private totalTriangles = 0;
  private totalVertices = 0;

  constructor(voxelSize = 0.062) {
    this.group.name = 'UnifiedTsdfMesh';
    this.setVoxelSize(voxelSize);

    this.surfaceMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.48,
      metalness: 0.06,
      transparent: true,
      opacity: 0.72,
      side: THREE.FrontSide,
      flatShading: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -1.5,
    });

    this.wireMaterial = new THREE.LineBasicMaterial({
      color: 0x2dd4bf,
      transparent: true,
      opacity: 0.45,
      depthTest: true,
    });

    this.pointsMaterial = new THREE.PointsMaterial({
      size: 0.028,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
    });
  }

  public getVoxelSize(): number {
    return this.voxelSize;
  }

  public setVoxelSize(sizeM: number) {
    if (Math.abs(sizeM - this.voxelSize) < 1e-4 && this.blocks.size > 0) return;
    this.clear();
    this.voxelSize = sizeM;
    this.truncDist = Math.max(sizeM * 2.6, 0.042);
    this.pointsMaterial.size = Math.max(0.012, sizeM * 0.48);
  }

  public clear() {
    for (const b of this.blocks.values()) {
      this.disposeBlockMeshes(b);
    }
    this.blocks.clear();
    this.keyframeCounter = 0;
    this.totalTriangles = 0;
    this.totalVertices = 0;
    this.lastMirrorClamped = 0;
    this.lastOccludedBlocks = 0;
  }

  public dispose() {
    this.clear();
    this.surfaceMaterial.dispose();
    this.wireMaterial.dispose();
    this.pointsMaterial.dispose();
  }

  private disposeBlockMeshes(b: VoxelBlock) {
    if (b.mesh) {
      this.group.remove(b.mesh);
      b.mesh = null;
    }
    if (b.wireMesh) {
      this.group.remove(b.wireMesh);
      b.wireMesh = null;
    }
    if (b.pointsMesh) {
      this.group.remove(b.pointsMesh);
      b.pointsMesh = null;
    }
    if (b.geometry) {
      b.geometry.dispose();
      b.geometry = null;
    }
    if (b.wireGeometry) {
      b.wireGeometry.dispose();
      b.wireGeometry = null;
    }
  }

  private getOrCreateBlock(bx: number, by: number, bz: number): VoxelBlock {
    const key = blockKey(bx, by, bz);
    let block = this.blocks.get(key);
    if (!block) {
      const bs = BLOCK_DIM * this.voxelSize;
      block = {
        bx,
        by,
        bz,
        key,
        tsdf: new Float32Array(BLOCK_VOL).fill(1.0),
        weight: new Float32Array(BLOCK_VOL),
        r: new Float32Array(BLOCK_VOL).fill(0.5),
        g: new Float32Array(BLOCK_VOL).fill(0.75),
        b: new Float32Array(BLOCK_VOL).fill(0.75),
        flags: new Uint8Array(BLOCK_VOL),
        roomVotesA: 0,
        roomVotesB: 0,
        roomVotesCam: 0,
        dirty: false,
        mesh: null,
        wireMesh: null,
        pointsMesh: null,
        geometry: null,
        wireGeometry: null,
        rawPositions: null,
        smoothedPositions: null,
        albedoColors: null,
        vertexFlags: null,
        indices: null,
        triangleCount: 0,
        vertexCount: 0,
        worldCenter: new THREE.Vector3((bx + 0.5) * bs, (by + 0.5) * bs, (bz + 0.5) * bs),
        dominantNormal: new THREE.Vector3(0, 1, 0),
      };
      this.blocks.set(key, block);
    }
    return block;
  }

  private sampleVoxel(
    gx: number,
    gy: number,
    gz: number,
  ): { tsdf: number; weight: number; r: number; g: number; b: number; flags: number } | null {
    const bx = Math.floor(gx / BLOCK_DIM);
    const by = Math.floor(gy / BLOCK_DIM);
    const bz = Math.floor(gz / BLOCK_DIM);
    const block = this.blocks.get(blockKey(bx, by, bz));
    if (!block) return null;
    const lx = gx - bx * BLOCK_DIM;
    const ly = gy - by * BLOCK_DIM;
    const lz = gz - bz * BLOCK_DIM;
    const idx = voxelIndex(lx, ly, lz);
    const w = block.weight[idx];
    if (w < MIN_SURFACE_WEIGHT) return null;
    return {
      tsdf: block.tsdf[idx],
      weight: w,
      r: block.r[idx],
      g: block.g[idx],
      b: block.b[idx],
      flags: block.flags[idx],
    };
  }

  public applyRenderStyle(mode: RenderMode, config: EngineConfig, cameraPos: THREE.Vector3) {
    const targetSize = RESOLUTION_VOXEL_M[config.resolution];
    if (Math.abs(targetSize - this.voxelSize) > 1e-4) {
      this.setVoxelSize(targetSize);
    }

    const algoChanged = this.currentAlgo !== config.meshAlgorithm;
    this.currentMode = mode;
    this.currentAlgo = config.meshAlgorithm;

    const isOverlay = mode === 'ar_overlay' || mode === 'ar_wire';
    const isWireOnly = mode === 'wireframe';
    const isPointsOnly = mode === 'points';
    const showWire = isWireOnly || mode === 'ar_wire';

    this.surfaceMaterial.opacity = isOverlay ? config.meshOpacity : 1.0;
    this.surfaceMaterial.transparent = isOverlay && config.meshOpacity < 0.99;
    this.surfaceMaterial.depthTest = config.wallOcclusion;
    this.surfaceMaterial.depthWrite = !isOverlay || config.meshOpacity > 0.85;
    this.surfaceMaterial.side = config.wallOcclusion ? THREE.FrontSide : THREE.DoubleSide;
    this.surfaceMaterial.flatShading = config.meshAlgorithm === 'faceted_mc';
    this.surfaceMaterial.roughness = mode === 'normals' || mode === 'depth' ? 0.88 : 0.45;
    this.surfaceMaterial.needsUpdate = true;

    this.wireMaterial.depthTest = config.wallOcclusion;
    this.wireMaterial.opacity = isWireOnly ? 0.82 : 0.34;
    this.wireMaterial.color.setHex(mode === 'ar_wire' ? 0x5eead4 : 0x2dd4bf);

    this.pointsMaterial.depthTest = config.wallOcclusion;

    for (const block of this.blocks.values()) {
      if (algoChanged && block.rawPositions && block.indices) {
        this.applySmoothingAndUpload(block, config, cameraPos);
      } else if (block.geometry) {
        this.recolorBlock(block, mode, cameraPos);
      }
      if (block.mesh) block.mesh.visible = !isWireOnly && !isPointsOnly;
      if (block.wireMesh) block.wireMesh.visible = showWire;
      if (block.pointsMesh) block.pointsMesh.visible = isPointsOnly;
    }
  }

  public reSmoothAll(config: EngineConfig, cameraPos: THREE.Vector3) {
    const t0 = performance.now();
    for (const block of this.blocks.values()) {
      if (block.rawPositions && block.indices) {
        this.applySmoothingAndUpload(block, config, cameraPos);
      }
    }
    this.lastSmoothingMs = performance.now() - t0;
  }

  /**
   * Voxel-Centric Frustum Projection TSDF Integration:
   * 1. Activates voxel blocks touching observed hits (+1-block padding for smooth transitions).
   * 2. Projects EVERY voxel of each candidate block into the dense camera depth image.
   * 3. Computes signed distance `sdf = z_measured - z_voxel` and fuses via running weight.
   * 4. Re-extracts ONLY dirty blocks via seamless Surface Nets + Taubin smoothing.
   */
  public integrateDepthFrame(
    frame: DepthFrameInput,
    camera: THREE.PerspectiveCamera,
    config: EngineConfig,
  ) {
    this.keyframeCounter++;
    this.lastMirrorClamped = frame.mirrorClampedCount;

    const vs = this.voxelSize;
    const invVs = 1 / vs;
    const blockWorldSize = BLOCK_DIM * vs;
    const invBlockWorldSize = 1 / blockWorldSize;
    const trunc = this.truncDist;

    // 1. Discover active blocks around observed hit points (sparse allocation)
    const activeBlockKeys = new Set<string>();
    const totalPixels = frame.cols * frame.rows;
    const margin = trunc;

    for (let i = 0; i < totalPixels; i++) {
      if (!frame.hitValid[i]) continue;
      const hx = frame.hitPoints[i * 3];
      const hy = frame.hitPoints[i * 3 + 1];
      const hz = frame.hitPoints[i * 3 + 2];

      const minBx = Math.floor((hx - margin) * invBlockWorldSize);
      const maxBx = Math.floor((hx + margin) * invBlockWorldSize);
      const minBy = Math.floor((hy - margin) * invBlockWorldSize);
      const maxBy = Math.floor((hy + margin) * invBlockWorldSize);
      const minBz = Math.floor((hz - margin) * invBlockWorldSize);
      const maxBz = Math.floor((hz + margin) * invBlockWorldSize);

      for (let bz = minBz; bz <= maxBz; bz++) {
        for (let by = minBy; by <= maxBy; by++) {
          for (let bx = minBx; bx <= maxBx; bx++) {
            const k = blockKey(bx, by, bz);
            if (!activeBlockKeys.has(k)) {
              activeBlockKeys.add(k);
              this.getOrCreateBlock(bx, by, bz);
            }
          }
        }
      }
    }

    if (activeBlockKeys.size === 0) return;

    // Precompute camera matrices once for fast voxel projection
    camera.updateMatrixWorld();
    _viewMat.copy(camera.matrixWorldInverse);
    _projMat.copy(camera.projectionMatrix);

    const cols = frame.cols;
    const rows = frame.rows;
    const dirtyBlocks = new Set<VoxelBlock>();

    // 2. Project every voxel in each active block into the depth buffer & fuse TSDF
    for (const k of activeBlockKeys) {
      const block = this.blocks.get(k);
      if (!block) continue;

      const baseX = block.bx * BLOCK_DIM;
      const baseY = block.by * BLOCK_DIM;
      const baseZ = block.bz * BLOCK_DIM;
      let blockTouched = false;

      for (let lz = 0; lz < BLOCK_DIM; lz++) {
        const wz = (baseZ + lz + 0.5) * vs;
        for (let ly = 0; ly < BLOCK_DIM; ly++) {
          const wy = (baseY + ly + 0.5) * vs;
          for (let lx = 0; lx < BLOCK_DIM; lx++) {
            const wx = (baseX + lx + 0.5) * vs;

            // Transform voxel center into camera eye space (OpenGL/Three: -Z is forward)
            _vWorld.set(wx, wy, wz);
            _vCam.copy(_vWorld).applyMatrix4(_viewMat);
            const zCam = -_vCam.z;
            if (zCam < frame.minDepth || zCam > frame.maxDepth + trunc) continue;

            // Project to NDC [-1, 1]
            _vNdc.copy(_vCam).applyMatrix4(_projMat);
            if (_vNdc.x < -0.96 || _vNdc.x > 0.96 || _vNdc.y < -0.96 || _vNdc.y > 0.96) continue;

            // Map NDC to depth grid floating coordinates
            const fx = (_vNdc.x * 0.5 + 0.5) * (cols - 1);
            const fy = (0.5 - _vNdc.y * 0.5) * (rows - 1);
            const x0 = Math.floor(fx);
            const y0 = Math.floor(fy);
            const x1 = Math.min(cols - 1, x0 + 1);
            const y1 = Math.min(rows - 1, y0 + 1);
            const tx = fx - x0;
            const ty = fy - y0;

            const i00 = y0 * cols + x0;
            const i10 = y0 * cols + x1;
            const i01 = y1 * cols + x0;
            const i11 = y1 * cols + x1;

            const d00 = frame.depth[i00];
            if (d00 <= 0.01) continue;

            // Edge-aware bilinear depth interpolation (never blurs across doorway/object depth jumps!)
            const d10 = frame.depth[i10];
            const d01 = frame.depth[i01];
            const d11 = frame.depth[i11];
            const jumpMax = Math.max(0.14, d00 * 0.06);

            let zMeas = d00;
            if (
              d10 > 0.01 &&
              d01 > 0.01 &&
              d11 > 0.01 &&
              Math.abs(d10 - d00) < jumpMax &&
              Math.abs(d01 - d00) < jumpMax &&
              Math.abs(d11 - d00) < jumpMax
            ) {
              const top = d00 * (1 - tx) + d10 * tx;
              const bot = d01 * (1 - tx) + d11 * tx;
              zMeas = top * (1 - ty) + bot * ty;
            } else {
              // Nearest valid pixel on sharp depth discontinuity
              const nx = tx > 0.5 ? x1 : x0;
              const ny = ty > 0.5 ? y1 : y0;
              const dn = frame.depth[ny * cols + nx];
              if (dn <= 0.01) continue;
              zMeas = dn;
            }

            const sdf = zMeas - zCam;
            if (sdf < -trunc) continue; // Behind surface truncation band

            const idx = voxelIndex(lx, ly, lz);
            const oldW = block.weight[idx];
            const nearestIdx = (ty > 0.5 ? y1 : y0) * cols + (tx > 0.5 ? x1 : x0);

            if (sdf <= trunc) {
              // Inside surface truncation band: fuse signed distance & albedo color
              const tsdfVal = THREE.MathUtils.clamp(sdf / trunc, -1, 1);
              const wNew = 1.0;
              const wSum = Math.min(MAX_WEIGHT, oldW + wNew);
              const blend = wNew / wSum;

              block.tsdf[idx] = oldW === 0 ? tsdfVal : block.tsdf[idx] + (tsdfVal - block.tsdf[idx]) * blend;
              block.weight[idx] = wSum;

              const cr = frame.colorR[nearestIdx] / 255;
              const cg = frame.colorG[nearestIdx] / 255;
              const cb = frame.colorB[nearestIdx] / 255;
              block.r[idx] = oldW === 0 ? cr : block.r[idx] + (cr - block.r[idx]) * blend;
              block.g[idx] = oldW === 0 ? cg : block.g[idx] + (cg - block.g[idx]) * blend;
              block.b[idx] = oldW === 0 ? cb : block.b[idx] + (cb - block.b[idx]) * blend;
              block.flags[idx] |= frame.flags[nearestIdx];

              const rt = frame.roomTag[nearestIdx];
              if (rt === 0) block.roomVotesA++;
              else if (rt === 1) block.roomVotesB++;
              else block.roomVotesCam++;

              blockTouched = true;
            } else if (oldW > 0 && block.tsdf[idx] < 0.35) {
              // Free-space carving: clear stray phantom voxels sitting in empty air!
              const wCarve = 0.65;
              const wSum = Math.min(MAX_WEIGHT, oldW + wCarve);
              block.tsdf[idx] = block.tsdf[idx] + (1.0 - block.tsdf[idx]) * (wCarve / wSum);
              block.weight[idx] = wSum;
              blockTouched = true;
            }
          }
        }
      }

      if (blockTouched) {
        block.dirty = true;
        dirtyBlocks.add(block);
        // Mark adjacent neighbor blocks dirty so shared [-1..8] boundary halos stay 100% seamless
        for (let oz = -1; oz <= 1; oz++) {
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              if (ox === 0 && oy === 0 && oz === 0) continue;
              const nb = this.blocks.get(blockKey(block.bx + ox, block.by + oy, block.bz + oz));
              if (nb) {
                nb.dirty = true;
                dirtyBlocks.add(nb);
              }
            }
          }
        }
      }
    }

    // 3. Extract seamless Surface Nets geometry ONLY for dirty blocks (fast 60fps!)
    const t0 = performance.now();
    for (const block of dirtyBlocks) {
      if (!block.dirty) continue;
      this.extractBlockSurfaceNets(block, config, camera.position);
      block.dirty = false;
    }
    this.lastSmoothingMs = performance.now() - t0;

    // Recompute totals
    let tris = 0;
    let verts = 0;
    for (const b of this.blocks.values()) {
      tris += b.triangleCount;
      verts += b.vertexCount;
    }
    this.totalTriangles = tris;
    this.totalVertices = verts;

    void invVs;
  }

  /**
   * Seamless-border Dual Surface Nets extraction on an 8x8x8 TSDF block.
   * Samples shifted corner lattice [-1..8] (10x10x10 corners -> 9x9x9 dual cells)
   * and emits quads ONLY for this block's owned edges [1..8] (local [0..7]),
   * guaranteeing 100% watertight block seams with ZERO cracks and ZERO overlap.
   */
  private extractBlockSurfaceNets(
    block: VoxelBlock,
    config: EngineConfig,
    cameraPos: THREE.Vector3,
  ) {
    const N = BLOCK_DIM;
    const S = N + 1;     // 9 dual cells per axis (local -1..7 -> indices 0..8)
    const gridN = N + 2; // 10 corners per axis (local -1..8 -> indices 0..9)

    const baseX = block.bx * N;
    const baseY = block.by * N;
    const baseZ = block.bz * N;
    const vs = this.voxelSize;

    const latticeLen = gridN * gridN * gridN;
    const cTsdf = new Float32Array(latticeLen);
    const cValid = new Uint8Array(latticeLen);
    const cR = new Float32Array(latticeLen);
    const cG = new Float32Array(latticeLen);
    const cB = new Float32Array(latticeLen);
    const cFlags = new Uint8Array(latticeLen);

    const cIdx = (x: number, y: number, z: number) => (z * gridN + y) * gridN + x;

    // Sample local coordinates [-1 .. N] (shifted by -1)
    for (let z = 0; z < gridN; z++) {
      for (let y = 0; y < gridN; y++) {
        for (let x = 0; x < gridN; x++) {
          const s = this.sampleVoxel(baseX + x - 1, baseY + y - 1, baseZ + z - 1);
          if (s) {
            const ci = cIdx(x, y, z);
            cTsdf[ci] = s.tsdf;
            cValid[ci] = 1;
            cR[ci] = s.r;
            cG[ci] = s.g;
            cB[ci] = s.b;
            cFlags[ci] = s.flags;
          }
        }
      }
    }

    // Step A: Emit 1 shared vertex per active dual cell (x,y,z in 0..8 -> local -1..7)
    const cellVertIdx = new Int32Array(S * S * S).fill(-1);
    const cellId = (x: number, y: number, z: number) => (z * S + y) * S + x;

    const positions: number[] = [];
    const albedos: number[] = [];
    const vFlags: number[] = [];
    const cornerVals = new Float32Array(8);

    for (let z = 0; z < S; z++) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          let allValid = true;
          let negMask = 0;
          let rSum = 0;
          let gSum = 0;
          let bSum = 0;
          let flagOr = 0;

          for (let c = 0; c < 8; c++) {
            const [ox, oy, oz] = CORNER_OFFSETS[c];
            const ci = cIdx(x + ox, y + oy, z + oz);
            if (!cValid[ci]) {
              allValid = false;
              break;
            }
            const val = cTsdf[ci];
            cornerVals[c] = val;
            if (val < 0) negMask |= 1 << c;
            rSum += cR[ci];
            gSum += cG[ci];
            bSum += cB[ci];
            flagOr |= cFlags[ci];
          }

          if (!allValid || negMask === 0 || negMask === 255) continue;

          let px = 0;
          let py = 0;
          let pz = 0;
          let crossings = 0;

          for (let e = 0; e < 12; e++) {
            const [c0, c1] = CUBE_EDGES[e];
            const v0 = cornerVals[c0];
            const v1 = cornerVals[c1];
            if ((v0 < 0) === (v1 < 0)) continue;
            const denom = v1 - v0;
            const t = Math.abs(denom) > 1e-6 ? THREE.MathUtils.clamp(-v0 / denom, 0.05, 0.95) : 0.5;
            const [x0, y0, z0] = CORNER_OFFSETS[c0];
            const [x1, y1, z1] = CORNER_OFFSETS[c1];
            px += x0 + (x1 - x0) * t;
            py += y0 + (y1 - y0) * t;
            pz += z0 + (z1 - z0) * t;
            crossings++;
          }

          if (crossings === 0) continue;
          const invC = 1 / crossings;
          // Compensate for -1 lattice shift so world position aligns exactly with voxel centers
          const wx = (baseX + (x - 1) + px * invC + 0.5) * vs;
          const wy = (baseY + (y - 1) + py * invC + 0.5) * vs;
          const wz = (baseZ + (z - 1) + pz * invC + 0.5) * vs;

          const vi = positions.length / 3;
          cellVertIdx[cellId(x, y, z)] = vi;
          positions.push(wx, wy, wz);
          albedos.push(rSum / 8, gSum / 8, bSum / 8);
          vFlags.push(flagOr);
        }
      }
    }

    const vertCount = positions.length / 3;
    if (vertCount < 4) {
      this.disposeBlockMeshes(block);
      block.rawPositions = null;
      block.smoothedPositions = null;
      block.albedoColors = null;
      block.vertexFlags = null;
      block.indices = null;
      block.triangleCount = 0;
      block.vertexCount = 0;
      return;
    }

    // Step B: Emit watertight oriented quads for ALL owned grid edges cx,cy,cz in [1..N] (local [0..7])
    const indices: number[] = [];

    const pushQuad = (a: number, b: number, c: number, d: number, flip: boolean) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) {
        indices.push(a, c, b, a, d, c);
      } else {
        indices.push(a, b, c, a, c, d);
      }
    };

    for (let z = 1; z <= N; z++) {
      for (let y = 1; y <= N; y++) {
        for (let x = 1; x <= N; x++) {
          const i0 = cIdx(x, y, z);
          if (!cValid[i0]) continue;
          const s0 = cTsdf[i0] < 0;

          // Edge along +X: (x,y,z) -> (x+1,y,z)
          const ix = cIdx(x + 1, y, z);
          if (cValid[ix] && (cTsdf[ix] < 0) !== s0) {
            const q0 = cellVertIdx[cellId(x, y - 1, z - 1)];
            const q1 = cellVertIdx[cellId(x, y, z - 1)];
            const q2 = cellVertIdx[cellId(x, y, z)];
            const q3 = cellVertIdx[cellId(x, y - 1, z)];
            pushQuad(q0, q1, q2, q3, !s0);
          }

          // Edge along +Y: (x,y,z) -> (x,y+1,z)
          const iy = cIdx(x, y + 1, z);
          if (cValid[iy] && (cTsdf[iy] < 0) !== s0) {
            const q0 = cellVertIdx[cellId(x - 1, y, z - 1)];
            const q1 = cellVertIdx[cellId(x - 1, y, z)];
            const q2 = cellVertIdx[cellId(x, y, z)];
            const q3 = cellVertIdx[cellId(x, y, z - 1)];
            pushQuad(q0, q1, q2, q3, !s0);
          }

          // Edge along +Z: (x,y,z) -> (x,y,z+1)
          const iz = cIdx(x, y, z + 1);
          if (cValid[iz] && (cTsdf[iz] < 0) !== s0) {
            const q0 = cellVertIdx[cellId(x - 1, y - 1, z)];
            const q1 = cellVertIdx[cellId(x, y - 1, z)];
            const q2 = cellVertIdx[cellId(x, y, z)];
            const q3 = cellVertIdx[cellId(x - 1, y, z)];
            pushQuad(q0, q1, q2, q3, !s0);
          }
        }
      }
    }

    // Island / tiny speck filter: discard isolated < 4-triangle micro-specks
    if (indices.length < 12) {
      this.disposeBlockMeshes(block);
      block.rawPositions = null;
      block.smoothedPositions = null;
      block.albedoColors = null;
      block.vertexFlags = null;
      block.indices = null;
      block.triangleCount = 0;
      block.vertexCount = 0;
      return;
    }

    block.rawPositions = new Float32Array(positions);
    block.smoothedPositions = new Float32Array(positions);
    block.albedoColors = new Float32Array(albedos);
    block.vertexFlags = new Uint8Array(vFlags);
    block.indices = new Uint32Array(indices);
    block.vertexCount = vertCount;
    block.triangleCount = Math.floor(indices.length / 3);

    this.applySmoothingAndUpload(block, config, cameraPos);
  }

  /**
   * Runs edge-safe Taubin (lambda = 0.50, mu = -0.53) smoothing on interior vertices
   * (pinning block-boundary vertices so neighbor blocks NEVER separate or crack!)
   * and uploads the unified BufferGeometry + Wireframe + Points meshes.
   */
  private applySmoothingAndUpload(
    block: VoxelBlock,
    config: EngineConfig,
    cameraPos: THREE.Vector3,
  ) {
    const raw = block.rawPositions;
    const smoothed = block.smoothedPositions;
    const indices = block.indices;
    if (!raw || !smoothed || !indices) return;

    const vCount = raw.length / 3;
    smoothed.set(raw);

    const passes = config.meshAlgorithm === 'faceted_mc' ? 0 : Math.min(6, Math.max(0, config.taubinPasses));

    if (passes > 0) {
      // Build fast CSR adjacency & boundary mask so block borders remain 100% watertight
      const adj: number[][] = Array.from({ length: vCount }, () => []);
      const edgeUse = new Map<number, number>();

      const addEdge = (a: number, b: number) => {
        const lo = a < b ? a : b;
        const hi = a < b ? b : a;
        const ek = lo * 65536 + hi;
        edgeUse.set(ek, (edgeUse.get(ek) || 0) + 1);
        adj[a].push(b);
        adj[b].push(a);
      };

      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
      }

      // Pin open-border vertices (edge used only once inside this block) so seams stay locked airtight!
      const pinned = new Uint8Array(vCount);
      for (const [ek, count] of edgeUse.entries()) {
        if (count === 1) {
          const lo = Math.floor(ek / 65536);
          const hi = ek - lo * 65536;
          pinned[lo] = 1;
          pinned[hi] = 1;
        }
      }

      const scratch = new Float32Array(raw.length);
      const step = (src: Float32Array, dst: Float32Array, factor: number) => {
        dst.set(src);
        for (let i = 0; i < vCount; i++) {
          if (pinned[i]) continue;
          const nbs = adj[i];
          if (nbs.length < 3) continue;
          const i3 = i * 3;
          const px = src[i3];
          const py = src[i3 + 1];
          const pz = src[i3 + 2];
          let sx = 0;
          let sy = 0;
          let sz = 0;
          for (let k = 0; k < nbs.length; k++) {
            const n3 = nbs[k] * 3;
            sx += src[n3] - px;
            sy += src[n3 + 1] - py;
            sz += src[n3 + 2] - pz;
          }
          const inv = factor / nbs.length;
          dst[i3] = px + sx * inv;
          dst[i3 + 1] = py + sy * inv;
          dst[i3 + 2] = pz + sz * inv;
        }
      };

      for (let p = 0; p < passes; p++) {
        step(smoothed, scratch, 0.5);
        step(scratch, smoothed, -0.53);
      }
    }

    // Build or update Three.js BufferGeometries
    if (!block.geometry) {
      block.geometry = new THREE.BufferGeometry();
      block.wireGeometry = new THREE.BufferGeometry();

      block.mesh = new THREE.Mesh(block.geometry, this.surfaceMaterial);
      block.mesh.renderOrder = 2;
      block.mesh.frustumCulled = true;

      block.wireMesh = new THREE.LineSegments(block.wireGeometry, this.wireMaterial);
      block.wireMesh.renderOrder = 3;
      block.wireMesh.frustumCulled = true;

      block.pointsMesh = new THREE.Points(block.geometry, this.pointsMaterial);
      block.pointsMesh.renderOrder = 3;
      block.pointsMesh.frustumCulled = true;

      this.group.add(block.mesh);
      this.group.add(block.wireMesh);
      this.group.add(block.pointsMesh);
    }

    const geo = block.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(smoothed), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    // Update block dominant outward normal & centroid for room/wall occlusion culling
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < vCount; i++) {
      nx += normAttr.getX(i);
      ny += normAttr.getY(i);
      nz += normAttr.getZ(i);
    }
    block.dominantNormal.set(nx, ny, nz);
    if (block.dominantNormal.lengthSq() > 1e-4) block.dominantNormal.normalize();
    else block.dominantNormal.set(0, 1, 0);

    // Build clean wireframe edge index buffer (quad outlines without diagonal clutter)
    const wireLines: number[] = [];
    for (let i = 0; i < indices.length; i += 6) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      const d = i + 5 < indices.length ? indices[i + 4] : c;
      wireLines.push(a, b, b, c, c, d, d, a);
    }
    block.wireGeometry!.setAttribute('position', geo.attributes.position);
    block.wireGeometry!.setIndex(wireLines);
    block.wireGeometry!.computeBoundingSphere();

    // Apply vertex colors for current render mode
    this.recolorBlock(block, this.currentMode, cameraPos);

    const isWireOnly = this.currentMode === 'wireframe';
    const isPointsOnly = this.currentMode === 'points';
    const showWire = isWireOnly || this.currentMode === 'ar_wire';
    block.mesh!.visible = !isWireOnly && !isPointsOnly;
    block.wireMesh!.visible = showWire;
    block.pointsMesh!.visible = isPointsOnly;
  }

  private recolorBlock(block: VoxelBlock, mode: RenderMode, cameraPos: THREE.Vector3) {
    const geo = block.geometry;
    const albedos = block.albedoColors;
    const vFlags = block.vertexFlags;
    if (!geo || !albedos || !vFlags) return;

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;
    const vCount = posAttr.count;
    let colAttr = geo.attributes.color as THREE.BufferAttribute | undefined;
    if (!colAttr || colAttr.count !== vCount) {
      colAttr = new THREE.BufferAttribute(new Float32Array(vCount * 3), 3);
      geo.setAttribute('color', colAttr);
    }

    const col = colAttr.array as Float32Array;
    for (let i = 0; i < vCount; i++) {
      const i3 = i * 3;
      const isMirror = (vFlags[i] & 1) !== 0;
      const isMacro = (vFlags[i] & 2) !== 0;

      if (mode === 'normals') {
        col[i3] = normAttr.getX(i) * 0.5 + 0.5;
        col[i3 + 1] = normAttr.getY(i) * 0.5 + 0.5;
        col[i3 + 2] = normAttr.getZ(i) * 0.5 + 0.5;
      } else if (mode === 'depth') {
        const dx = posAttr.getX(i) - cameraPos.x;
        const dy = posAttr.getY(i) - cameraPos.y;
        const dz = posAttr.getZ(i) - cameraPos.z;
        const dist = Math.hypot(dx, dy, dz);
        const dNorm = THREE.MathUtils.clamp((dist - 0.15) / 4.4, 0, 1);
        turboColormap(1 - dNorm, _tmpColor);
        col[i3] = _tmpColor.r;
        col[i3 + 1] = _tmpColor.g;
        col[i3 + 2] = _tmpColor.b;
      } else if (mode === 'smooth_mesh' || mode === 'points') {
        // Real fused architectural/object surface color blended cleanly for studio clarity
        if (isMirror) {
          col[i3] = 0.52;
          col[i3 + 1] = 0.84;
          col[i3 + 2] = 0.96;
        } else {
          col[i3] = THREE.MathUtils.clamp(albedos[i3] * 1.15 + 0.08, 0, 1);
          col[i3 + 1] = THREE.MathUtils.clamp(albedos[i3 + 1] * 1.15 + 0.08, 0, 1);
          col[i3 + 2] = THREE.MathUtils.clamp(albedos[i3 + 2] * 1.15 + 0.08, 0, 1);
        }
      } else {
        // AR & AR+Wire mode: crisp optical teal tint mixed with real surface tone
        if (isMirror) {
          col[i3] = 0.24;
          col[i3 + 1] = 0.76;
          col[i3 + 2] = 0.98;
        } else if (isMacro) {
          col[i3] = 0.95;
          col[i3 + 1] = 0.68;
          col[i3 + 2] = 0.25;
        } else {
          col[i3] = albedos[i3] * 0.35 + 0.1;
          col[i3 + 1] = albedos[i3 + 1] * 0.35 + 0.66;
          col[i3 + 2] = albedos[i3 + 2] * 0.35 + 0.62;
        }
      }
    }
    colAttr.needsUpdate = true;
  }

  /**
   * Real-time Room & Dividing-Wall Portal Occlusion Culling:
   * Guarantees zero X-ray wall bleeding when moving from Oda 1 to Oda 2.
   */
  public updateOcclusionVisibility(
    cameraPos: THREE.Vector3,
    dividingWallZ: number,
    doorwayXRange: [number, number],
    doorwayMaxY: number,
    config: EngineConfig,
  ) {
    let occludedCount = 0;
    const isWireOnly = this.currentMode === 'wireframe';
    const isPointsOnly = this.currentMode === 'points';
    const showWire = isWireOnly || this.currentMode === 'ar_wire';

    const camInRoomB = cameraPos.z < dividingWallZ - 0.14;
    const camInRoomA = cameraPos.z > dividingWallZ + 0.14;

    for (const block of this.blocks.values()) {
      if (!block.mesh || !block.wireMesh || !block.pointsMesh) continue;

      let occluded = false;
      const isCameraBlock = block.roomVotesCam > block.roomVotesA + block.roomVotesB;

      if (config.wallOcclusion && !isCameraBlock) {
        const blockInRoomB = block.worldCenter.z < dividingWallZ;
        const crossesWall = (camInRoomB && !blockInRoomB) || (camInRoomA && blockInRoomB);

        if (crossesWall) {
          const dz = block.worldCenter.z - cameraPos.z;
          if (Math.abs(dz) > 1e-4) {
            const t = (dividingWallZ - cameraPos.z) / dz;
            if (t > 0 && t < 1) {
              const hitX = cameraPos.x + (block.worldCenter.x - cameraPos.x) * t;
              const hitY = cameraPos.y + (block.worldCenter.y - cameraPos.y) * t;
              const throughDoorway =
                hitX > doorwayXRange[0] - 0.35 &&
                hitX < doorwayXRange[1] + 0.35 &&
                hitY > -0.2 &&
                hitY < doorwayMaxY + 0.25;
              if (!throughDoorway) {
                occluded = true;
              }
            }
          }
        }
      }

      if (occluded) {
        occludedCount++;
        block.mesh.visible = false;
        block.wireMesh.visible = false;
        block.pointsMesh.visible = false;
      } else {
        block.mesh.visible = !isWireOnly && !isPointsOnly;
        block.wireMesh.visible = showWire;
        block.pointsMesh.visible = isPointsOnly;

        // Live depth heatmap updates dynamically as camera moves
        if (this.currentMode === 'depth' && block.geometry) {
          _tmpDir.copy(cameraPos);
          this.recolorBlock(block, 'depth', _tmpDir);
        }
      }
    }

    this.lastOccludedBlocks = occludedCount;
  }

  public getStats() {
    let activeMeshedBlocks = 0;
    for (const b of this.blocks.values()) {
      if (b.triangleCount > 0) activeMeshedBlocks++;
    }
    return {
      triangles: this.totalTriangles,
      vertices: this.totalVertices,
      chunks: activeMeshedBlocks,
      keyframes: this.keyframeCounter,
      smoothingMs: this.lastSmoothingMs,
      mirrorPixelsClamped: this.lastMirrorClamped,
      occludedChunks: this.lastOccludedBlocks,
    };
  }

  public exportOBJ(): string {
    const lines: string[] = [
      '# 3Drecon Studio v3.0 — Unified TSDF Surface Nets Export (.obj)',
      `# Voxel: ${(this.voxelSize * 100).toFixed(1)}cm, Triangles: ${this.totalTriangles}, Vertices: ${this.totalVertices}`,
      '',
    ];
    let vOffset = 1;

    for (const b of this.blocks.values()) {
      if (!b.geometry || !b.indices || b.triangleCount === 0) continue;
      const pos = b.geometry.attributes.position as THREE.BufferAttribute;
      const norm = b.geometry.attributes.normal as THREE.BufferAttribute;
      lines.push(`o block_${b.bx}_${b.by}_${b.bz}`);
      for (let i = 0; i < pos.count; i++) {
        lines.push(`v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}`);
        lines.push(`vn ${norm.getX(i).toFixed(4)} ${norm.getY(i).toFixed(4)} ${norm.getZ(i).toFixed(4)}`);
      }
      for (let i = 0; i < b.indices.length; i += 3) {
        const a = b.indices[i] + vOffset;
        const bb = b.indices[i + 1] + vOffset;
        const c = b.indices[i + 2] + vOffset;
        lines.push(`f ${a}//${a} ${bb}//${bb} ${c}//${c}`);
      }
      vOffset += pos.count;
    }
    return lines.join('\n');
  }

  public exportPLY(): string {
    const verts: string[] = [];
    const faces: string[] = [];
    let offset = 0;

    for (const b of this.blocks.values()) {
      if (!b.geometry || !b.indices || b.triangleCount === 0) continue;
      const pos = b.geometry.attributes.position as THREE.BufferAttribute;
      const col = b.geometry.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.round(THREE.MathUtils.clamp(col.getX(i) * 255, 0, 255));
        const g = Math.round(THREE.MathUtils.clamp(col.getY(i) * 255, 0, 255));
        const bl = Math.round(THREE.MathUtils.clamp(col.getZ(i) * 255, 0, 255));
        verts.push(`${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)} ${r} ${g} ${bl}`);
      }
      for (let i = 0; i < b.indices.length; i += 3) {
        faces.push(`3 ${b.indices[i] + offset} ${b.indices[i + 1] + offset} ${b.indices[i + 2] + offset}`);
      }
      offset += pos.count;
    }

    return [
      'ply',
      'format ascii 1.0',
      'comment 3Drecon Studio v3.0 Unified TSDF Mesh',
      `element vertex ${verts.length}`,
      'property float x',
      'property float y',
      'property float z',
      'property uchar red',
      'property uchar green',
      'property uchar blue',
      `element face ${faces.length}`,
      'property list uchar int vertex_indices',
      'end_header',
      ...verts,
      ...faces,
    ].join('\n');
  }
}
