import * as THREE from 'three';
import type { EngineConfig } from '../types/recon';
import type { DepthFrameInput } from './tsdfMesher';

export interface LiveDepthResult {
  frame: DepthFrameInput;
  mirrorMask: Uint8Array;
  centerDepthM: number;
  centerIsMirror: boolean;
}

const _ndc = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _camDir = new THREE.Vector3();

/**
 * Real-time client-side monocular + optical-flow depth and specular/mirror detector
 * outputting unified DepthFrameInput buffers for the TsdfVoxelMesher.
 */
export class LiveCameraDepthEstimator {
  private readonly cols = 40;
  private readonly rows = 30;
  private readonly workCanvas: HTMLCanvasElement;
  private readonly workCtx: CanvasRenderingContext2D;
  private prevLuma: Float32Array | null = null;
  private temporalDepth: Float32Array;

  constructor() {
    this.workCanvas = document.createElement('canvas');
    this.workCanvas.width = this.cols;
    this.workCanvas.height = this.rows;
    this.workCtx = this.workCanvas.getContext('2d', { willReadFrequently: true })!;
    this.temporalDepth = new Float32Array(this.cols * this.rows).fill(1.4);
  }

  public reset() {
    this.prevLuma = null;
    this.temporalDepth.fill(1.4);
  }

  public processVideoFrame(
    video: HTMLVideoElement,
    camera: THREE.PerspectiveCamera,
    config: EngineConfig,
  ): LiveDepthResult | null {
    if (video.readyState < 2 || video.videoWidth === 0) return null;

    const { cols, rows } = this;
    const total = cols * rows;
    this.workCtx.drawImage(video, 0, 0, cols, rows);
    const img = this.workCtx.getImageData(0, 0, cols, rows).data;

    const luma = new Float32Array(total);
    const saturation = new Float32Array(total);
    const mirrorMask = new Uint8Array(total);
    const colorR = new Uint8Array(total);
    const colorG = new Uint8Array(total);
    const colorB = new Uint8Array(total);

    for (let i = 0; i < total; i++) {
      const p = i * 4;
      colorR[i] = img[p];
      colorG[i] = img[p + 1];
      colorB[i] = img[p + 2];
      const r = img[p] / 255;
      const g = img[p + 1] / 255;
      const b = img[p + 2] / 255;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      saturation[i] = maxC > 0.01 ? (maxC - minC) / maxC : 0;
    }

    const depth = new Float32Array(total);
    const roomTag = new Uint8Array(total).fill(2);
    const flags = new Uint8Array(total);
    const hitPoints = new Float32Array(total * 3);
    const hitValid = new Uint8Array(total);

    const minDepth = config.macroMode ? 0.08 : 0.28;
    const maxDepth = config.macroMode ? 0.65 : 4.2;

    let mirrorPixelCount = 0;
    let nonMirrorDepthSum = 0;
    let nonMirrorCount = 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const xm = Math.max(0, x - 1);
        const xp = Math.min(cols - 1, x + 1);
        const ym = Math.max(0, y - 1);
        const yp = Math.min(rows - 1, y + 1);
        const gx = luma[y * cols + xp] - luma[y * cols + xm];
        const gy = luma[yp * cols + x] - luma[ym * cols + x];
        const grad = Math.hypot(gx, gy);

        const motion = this.prevLuma ? Math.abs(luma[idx] - this.prevLuma[idx]) : 0;
        const isMirror =
          (luma[idx] > 0.85 && saturation[idx] < 0.14) ||
          (luma[idx] > 0.74 && grad < 0.032 && saturation[idx] < 0.18);

        if (isMirror) {
          mirrorMask[idx] = 1;
          flags[idx] |= 1;
          mirrorPixelCount++;
        }

        const yNorm = y / (rows - 1);
        const nearCue = THREE.MathUtils.clamp(grad * 1.85 + motion * 1.3 + yNorm * 0.42, 0, 1);
        let estDepth = THREE.MathUtils.lerp(maxDepth * 0.76, minDepth + 0.14, nearCue);

        if (isMirror && !config.mirrorGuard) {
          estDepth = Math.min(maxDepth, estDepth * 2.1 + 0.8);
        }

        const prevD = this.temporalDepth[idx];
        const alpha = Math.abs(estDepth - prevD) > 0.35 ? 0.55 : 0.22;
        const fused = prevD * (1 - alpha) + estDepth * alpha;
        this.temporalDepth[idx] = fused;
        depth[idx] = fused;

        if (!isMirror) {
          nonMirrorDepthSum += fused;
          nonMirrorCount++;
        }
      }
    }

    if (config.mirrorGuard && mirrorPixelCount > 0 && nonMirrorCount > 0) {
      const planeDepth = nonMirrorDepthSum / nonMirrorCount;
      for (let i = 0; i < total; i++) {
        if (mirrorMask[i]) {
          depth[i] = planeDepth;
          this.temporalDepth[i] = planeDepth;
        }
      }
    }

    this.prevLuma = luma;

    camera.getWorldDirection(_camDir);
    const camPos = camera.position;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const zEye = depth[idx];
        const u = (x / (cols - 1)) * 2 - 1;
        const v = 1 - (y / (rows - 1)) * 2;
        _ndc.set(u, v, 0.5).unproject(camera);
        _rayDir.copy(_ndc).sub(camPos).normalize();
        const cosAngle = Math.max(0.25, _rayDir.dot(_camDir));
        const rayDist = zEye / cosAngle;

        hitPoints[idx * 3] = camPos.x + _rayDir.x * rayDist;
        hitPoints[idx * 3 + 1] = camPos.y + _rayDir.y * rayDist;
        hitPoints[idx * 3 + 2] = camPos.z + _rayDir.z * rayDist;
        hitValid[idx] = 1;
        if (config.macroMode && zEye <= 0.5) flags[idx] |= 2;
      }
    }

    const centerIdx = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    return {
      frame: {
        cols,
        rows,
        depth,
        colorR,
        colorG,
        colorB,
        roomTag,
        flags,
        hitPoints,
        hitValid,
        minDepth,
        maxDepth,
        mirrorClampedCount: config.mirrorGuard ? mirrorPixelCount : 0,
      },
      mirrorMask,
      centerDepthM: depth[centerIdx],
      centerIsMirror: mirrorMask[centerIdx] === 1,
    };
  }
}
