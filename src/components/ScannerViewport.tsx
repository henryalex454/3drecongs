import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LiveCameraDepthEstimator } from '../engine/liveCameraDepth';
import { buildMultiRoomScene, ROOM_PRESETS, type MultiRoomRig } from '../engine/multiRoomScene';
import { createProceduralTextures } from '../engine/proceduralTextures';
import { TsdfVoxelMesher, turboColormap } from '../engine/tsdfMesher';
import {
  RESOLUTION_VOXEL_M,
  type CrosshairProbe,
  type EngineConfig,
  type InputSource,
  type ReconMetrics,
  type RenderMode,
  type RoomPresetId,
  type SpatialAnchor,
} from '../types/recon';

export interface ScannerViewportHandle {
  placeAnchorAtCrosshair: () => { ok: boolean; message: string; anchor?: SpatialAnchor };
  removeAnchor: (id: string) => void;
  renameAnchor: (id: string, label: string) => void;
  flyToAnchor: (anchor: SpatialAnchor) => void;
  flyToPreset: (preset: RoomPresetId) => void;
  resetScan: () => void;
  exportOBJ: () => string;
  exportPLY: () => string;
  nudgeMove: (forward: number, strafe: number) => void;
}

interface ScannerViewportProps {
  inputSource: InputSource;
  renderMode: RenderMode;
  isScanning: boolean;
  config: EngineConfig;
  anchors: SpatialAnchor[];
  onAnchorsChange: React.Dispatch<React.SetStateAction<SpatialAnchor[]>>;
  onMetricsUpdate: (metrics: ReconMetrics) => void;
  onCrosshairUpdate: (probe: CrosshairProbe) => void;
  onNotice: (message: string) => void;
  onCameraError: (message: string) => void;
  onAutoFallbackToLab: () => void;
}

// Module-level pre-allocated vectors to keep render loop GC-free
const _ndc = new THREE.Vector2();
const _rayDir = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _tmpNormal = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpPos = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _lookTarget = new THREE.Vector3();
const _bgPhysical = new THREE.Color(0x0b0f17);
const _bgSolid = new THREE.Color(0x070a0f);

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createAnchorMarker3D(isOccluded: boolean): THREE.Group {
  const group = new THREE.Group();

  const ringMat = new THREE.MeshStandardMaterial({
    color: isOccluded ? 0xf59e0b : 0x2dd4bf,
    emissive: isOccluded ? 0x92400e : 0x0f766e,
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.65,
    depthTest: true,
    transparent: true,
    opacity: 0.96,
  });

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0x2dd4bf,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.4,
    depthTest: true,
  });

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.007, 12, 32), ringMat);
  group.add(outerRing);

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 10, 24), coreMat);
  group.add(innerRing);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.045, 10), coreMat);
  stem.rotation.x = Math.PI / 2;
  stem.position.z = 0.022;
  group.add(stem);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 12, 12), ringMat);
  tip.position.z = 0.045;
  group.add(tip);

  group.renderOrder = 5;
  return group;
}

function extractHitRgb(hitObject: THREE.Object3D, out: THREE.Color): THREE.Color {
  if (hitObject instanceof THREE.Mesh) {
    const mat = Array.isArray(hitObject.material) ? hitObject.material[0] : hitObject.material;
    if (mat && 'color' in mat && mat.color instanceof THREE.Color) {
      return out.copy(mat.color);
    }
  }
  return out.setRGB(0.45, 0.55, 0.62);
}

export const ScannerViewport = React.forwardRef<ScannerViewportHandle, ScannerViewportProps>(
  function ScannerViewport(
    {
      inputSource,
      renderMode,
      isScanning,
      config,
      anchors,
      onAnchorsChange,
      onMetricsUpdate,
      onCrosshairUpdate,
      onNotice,
      onCameraError,
      onAutoFallbackToLab,
    },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const depthPipRef = useRef<HTMLCanvasElement | null>(null);
    const maskPipRef = useRef<HTMLCanvasElement | null>(null);
    const [contextLost, setContextLost] = useState(false);
    const [webglError, setWebglError] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);

    const stateRef = useRef({
      inputSource,
      renderMode,
      isScanning,
      config,
      anchors,
    });
    stateRef.current = { inputSource, renderMode, isScanning, config, anchors };

    const callbacksRef = useRef({
      onAnchorsChange,
      onMetricsUpdate,
      onCrosshairUpdate,
      onNotice,
      onCameraError,
      onAutoFallbackToLab,
    });
    callbacksRef.current = {
      onAnchorsChange,
      onMetricsUpdate,
      onCrosshairUpdate,
      onNotice,
      onCameraError,
      onAutoFallbackToLab,
    };

    const engineRef = useRef<{
      camera: THREE.PerspectiveCamera;
      mesher: TsdfVoxelMesher;
      multiRoom: MultiRoomRig;
      raycaster: THREE.Raycaster;
      anchorGroup: THREE.Group;
      anchorMeshes: Map<string, THREE.Group>;
      liveEstimator: LiveCameraDepthEstimator;
      yaw: number;
      pitch: number;
      camPos: THREE.Vector3;
      transition: {
        active: boolean;
        targetPos: THREE.Vector3;
        targetYaw: number;
        targetPitch: number;
      };
      lastProbe: {
        valid: boolean;
        point: THREE.Vector3;
        normal: THREE.Vector3;
        distanceM: number;
        room: SpatialAnchor['room'];
        surfaceType: SpatialAnchor['surfaceType'];
        isMirror: boolean;
        isMacro: boolean;
        confidence: number;
      };
      keys: Set<string>;
      nudgeVelocity: { forward: number; strafe: number };
      syncAnchorMeshes: (list: SpatialAnchor[]) => void;
    } | null>(null);

    // Live Rear Camera Stream activation / cleanup
    useEffect(() => {
      let stream: MediaStream | null = null;
      let cancelled = false;

      if (inputSource !== 'live_camera') {
        setCameraReady(false);
        return;
      }

      const startCamera = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          callbacksRef.current.onCameraError(
            'Tarayıcı kamera API desteği bulunamadı. 3D Oda simülasyonuna dönülüyor.',
          );
          callbacksRef.current.onAutoFallbackToLab();
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setCameraReady(true);
            engineRef.current?.mesher.clear();
            engineRef.current?.liveEstimator.reset();
            callbacksRef.current.onNotice(
              'Canlı arka kamera aktif — telefonu yavaşça gezdirin.',
            );
          }
        } catch {
          if (!cancelled) {
            callbacksRef.current.onCameraError(
              'Kamera izni verilmedi veya cihaz kamerası kullanılamıyor. 3D Oda moduna geçildi.',
            );
            callbacksRef.current.onAutoFallbackToLab();
          }
        }
      };

      void startCamera();

      return () => {
        cancelled = true;
        setCameraReady(false);
        if (stream) stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      };
    }, [inputSource]);

    // Sync render style, physical room visibility, and voxel resolution
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;
      const inLab = inputSource === 'spatial_lab';
      eng.multiRoom.root.visible = inLab;
      if (inLab) {
        // Show physical room behind translucent AR / AR+Wire modes;
        // in solid Mesh / Wireframe / Normals / Depth / Points modes hide physical color
        // while keeping hardware depthWrite ON for strict wall occlusion!
        const showPhysical = renderMode === 'ar_overlay' || renderMode === 'ar_wire';
        eng.multiRoom.setPhysicalVisibility(showPhysical);
      }
      eng.mesher.applyRenderStyle(renderMode, config, eng.camPos);
    }, [renderMode, config, inputSource]);

    // Re-smooth unified TSDF blocks immediately when Taubin pass count changes
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.mesher.reSmoothAll(config, eng.camPos);
    }, [config.taubinPasses]);

    // Sync 3D anchor marker objects when anchor list changes
    useEffect(() => {
      engineRef.current?.syncAnchorMeshes(anchors);
    }, [anchors]);

    const clampCameraPosition = (next: THREE.Vector3, prev: THREE.Vector3, rig: MultiRoomRig) => {
      next.x = THREE.MathUtils.clamp(next.x, -2.86, 2.86);
      next.y = THREE.MathUtils.clamp(next.y, 0.45, 2.38);
      next.z = THREE.MathUtils.clamp(next.z, -7.82, 2.08);

      const wallMinZ = rig.dividingWallZ - 0.28;
      const wallMaxZ = rig.dividingWallZ + 0.28;
      const inDoorwayX = next.x > rig.doorwayXRange[0] + 0.16 && next.x < rig.doorwayXRange[1] - 0.16;

      if (!inDoorwayX && next.z > wallMinZ && next.z < wallMaxZ) {
        next.z = prev.z >= rig.dividingWallZ ? wallMaxZ : wallMinZ;
      }
    };

    useImperativeHandle(ref, () => ({
      placeAnchorAtCrosshair: () => {
        const eng = engineRef.current;
        if (!eng) return { ok: false, message: 'Motor henüz hazır değil.' };
        const probe = eng.lastProbe;
        if (!probe.valid) {
          return {
            ok: false,
            message: 'Anchor için gerçek bir yüzeye nişan alın (boşluğa yerleştirilemez).',
          };
        }

        const count = stateRef.current.anchors.length + 1;
        const distLabel =
          probe.distanceM < 0.6
            ? `${Math.round(probe.distanceM * 100)} cm`
            : `${probe.distanceM.toFixed(2)} m`;
        const anchor: SpatialAnchor = {
          id: `anc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          label: `${probe.surfaceType} #${count}`,
          position: [probe.point.x, probe.point.y, probe.point.z],
          normal: [probe.normal.x, probe.normal.y, probe.normal.z],
          room: probe.room,
          surfaceType: probe.surfaceType,
          distanceM: probe.distanceM,
          occluded: false,
          confidence: probe.confidence,
          createdAt: Date.now(),
        };
        callbacksRef.current.onAnchorsChange((prev) => [...prev, anchor]);
        return {
          ok: true,
          message: `Anchor kilitlendi: ${anchor.label} (${distLabel})`,
          anchor,
        };
      },

      removeAnchor: (id: string) => {
        callbacksRef.current.onAnchorsChange((prev) => prev.filter((a) => a.id !== id));
      },

      renameAnchor: (id: string, label: string) => {
        callbacksRef.current.onAnchorsChange((prev) =>
          prev.map((a) => (a.id === id ? { ...a, label } : a)),
        );
      },

      flyToAnchor: (anchor: SpatialAnchor) => {
        const eng = engineRef.current;
        if (!eng) return;
        const pos = new THREE.Vector3(...anchor.position);
        const norm = new THREE.Vector3(...anchor.normal).normalize();
        const standoff = anchor.surfaceType === 'Masa / Makro' ? 0.42 : 1.25;
        const desiredPos = pos.clone().addScaledVector(norm, standoff);
        desiredPos.y = THREE.MathUtils.clamp(desiredPos.y + 0.12, 0.72, 2.1);
        clampCameraPosition(desiredPos, desiredPos, eng.multiRoom);

        const lookDir = pos.clone().sub(desiredPos).normalize();
        const yaw = Math.atan2(-lookDir.x, -lookDir.z);
        const pitch = Math.asin(THREE.MathUtils.clamp(lookDir.y, -0.95, 0.95));

        eng.transition = {
          active: true,
          targetPos: desiredPos,
          targetYaw: yaw,
          targetPitch: pitch,
        };
      },

      flyToPreset: (preset: RoomPresetId) => {
        const eng = engineRef.current;
        if (!eng) return;
        const p = ROOM_PRESETS[preset];
        const lookDir = p.target.clone().sub(p.position).normalize();
        const yaw = Math.atan2(-lookDir.x, -lookDir.z);
        const pitch = Math.asin(THREE.MathUtils.clamp(lookDir.y, -0.95, 0.95));
        eng.transition = {
          active: true,
          targetPos: p.position.clone(),
          targetYaw: yaw,
          targetPitch: pitch,
        };
      },

      resetScan: () => {
        const eng = engineRef.current;
        if (!eng) return;
        eng.mesher.clear();
        eng.liveEstimator.reset();
        callbacksRef.current.onAnchorsChange([]);
        callbacksRef.current.onNotice('TSDF hacmi ve anchorlar sıfırlandı.');
      },

      exportOBJ: () => engineRef.current?.mesher.exportOBJ() ?? '',
      exportPLY: () => engineRef.current?.mesher.exportPLY() ?? '',

      nudgeMove: (forward: number, strafe: number) => {
        const eng = engineRef.current;
        if (!eng) return;
        eng.transition.active = false;
        eng.nudgeVelocity.forward = forward;
        eng.nudgeVelocity.strafe = strafe;
      },
    }));

    // Main Three.js WebGL initialization & real-time unified TSDF loop (mounts ONCE)
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareGl();

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !isSoftwareGl,
          alpha: true,
          powerPreference: 'high-performance',
        });
      } catch (err) {
        setWebglError(
          err instanceof Error
            ? err.message
            : 'WebGL 3D bağlamı bu tarayıcıda başlatılamadı.',
        );
        return;
      }
      setWebglError(null);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(
        container.clientWidth || window.innerWidth,
        container.clientHeight || window.innerHeight,
      );
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b0f17);
      scene.fog = new THREE.FogExp2(0x0b0f17, 0.042);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      pmrem.dispose();

      const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.85);
      scene.add(hemiLight);

      const roomAKey = new THREE.DirectionalLight(0xfff4e0, 1.55);
      roomAKey.position.set(1.8, 2.65, 1.2);
      roomAKey.castShadow = !isSoftwareGl;
      roomAKey.shadow.mapSize.set(1024, 1024);
      roomAKey.shadow.camera.near = 0.2;
      roomAKey.shadow.camera.far = 12;
      roomAKey.shadow.camera.left = -4;
      roomAKey.shadow.camera.right = 4;
      roomAKey.shadow.camera.top = 4;
      roomAKey.shadow.camera.bottom = -4;
      roomAKey.shadow.bias = -0.0005;
      roomAKey.shadow.normalBias = 0.02;
      scene.add(roomAKey);

      const roomBPoint = new THREE.PointLight(0xe0f2fe, 2.2, 9.5, 1.5);
      roomBPoint.position.set(0.0, 2.45, -5.6);
      scene.add(roomBPoint);

      const macroDeskSpot = new THREE.PointLight(0xffe7c2, 1.35, 3.6, 1.6);
      macroDeskSpot.position.set(1.5, 1.72, -0.78);
      scene.add(macroDeskSpot);

      const camera = new THREE.PerspectiveCamera(
        60,
        (container.clientWidth || window.innerWidth) /
          (container.clientHeight || window.innerHeight),
        0.04,
        40,
      );

      const initialPreset = ROOM_PRESETS.room_a;
      const camPos = initialPreset.position.clone();
      const initDir = initialPreset.target.clone().sub(camPos).normalize();
      const yaw = Math.atan2(-initDir.x, -initDir.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(initDir.y, -0.95, 0.95));

      const textures = createProceduralTextures(renderer.capabilities.getMaxAnisotropy());
      const multiRoom = buildMultiRoomScene(textures, isSoftwareGl);
      scene.add(multiRoom.root);

      const mesher = new TsdfVoxelMesher(RESOLUTION_VOXEL_M[stateRef.current.config.resolution]);
      scene.add(mesher.group);
      mesher.applyRenderStyle(stateRef.current.renderMode, stateRef.current.config, camPos);

      const anchorGroup = new THREE.Group();
      anchorGroup.name = 'SpatialAnchors';
      scene.add(anchorGroup);
      const anchorMeshes = new Map<string, THREE.Group>();

      const raycaster = new THREE.Raycaster();
      const liveEstimator = new LiveCameraDepthEstimator();

      const syncAnchorMeshes = (list: SpatialAnchor[]) => {
        const activeIds = new Set(list.map((a) => a.id));
        for (const [id, meshGroup] of anchorMeshes.entries()) {
          if (!activeIds.has(id)) {
            anchorGroup.remove(meshGroup);
            meshGroup.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
                else obj.material.dispose();
              }
            });
            anchorMeshes.delete(id);
          }
        }
        for (const anchor of list) {
          if (!anchorMeshes.has(anchor.id)) {
            const marker = createAnchorMarker3D(anchor.occluded);
            _tmpNormal.set(...anchor.normal).normalize();
            marker.position.set(...anchor.position).addScaledVector(_tmpNormal, 0.014);
            _tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _tmpNormal);
            marker.quaternion.copy(_tmpQuat);
            anchorGroup.add(marker);
            anchorMeshes.set(anchor.id, marker);
          }
        }
      };

      const keys = new Set<string>();
      const engState = {
        camera,
        mesher,
        multiRoom,
        raycaster,
        anchorGroup,
        anchorMeshes,
        liveEstimator,
        yaw,
        pitch,
        camPos,
        transition: {
          active: false,
          targetPos: camPos.clone(),
          targetYaw: yaw,
          targetPitch: pitch,
        },
        lastProbe: {
          valid: false,
          point: new THREE.Vector3(),
          normal: new THREE.Vector3(0, 1, 0),
          distanceM: 0,
          room: 'Oda 1' as SpatialAnchor['room'],
          surfaceType: 'Yüzey' as SpatialAnchor['surfaceType'],
          isMirror: false,
          isMacro: false,
          confidence: 0,
        },
        keys,
        nudgeVelocity: { forward: 0, strafe: 0 },
        syncAnchorMeshes,
      };
      engineRef.current = engState;

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // Reusable depth-capture buffers for 44x32 frustum sampling (Zero GC!)
      const SCAN_COLS = 44;
      const SCAN_ROWS = 32;
      const SCAN_TOTAL = SCAN_COLS * SCAN_ROWS;
      const depthBuf = new Float32Array(SCAN_TOTAL);
      const colorRBuf = new Uint8Array(SCAN_TOTAL);
      const colorGBuf = new Uint8Array(SCAN_TOTAL);
      const colorBBuf = new Uint8Array(SCAN_TOTAL);
      const roomTagBuf = new Uint8Array(SCAN_TOTAL);
      const flagsBuf = new Uint8Array(SCAN_TOTAL);
      const hitPointsBuf = new Float32Array(SCAN_TOTAL * 3);
      const hitValidBuf = new Uint8Array(SCAN_TOTAL);
      const mirrorMaskBuf = new Uint8Array(SCAN_TOTAL);

      // Offscreen PiP helper canvas reused every frame
      const pipScratch = document.createElement('canvas');
      pipScratch.width = SCAN_COLS;
      pipScratch.height = SCAN_ROWS;
      const pipScratchCtx = pipScratch.getContext('2d')!;

      // Pointer & multi-touch navigation
      let isDragging = false;
      let lastPtrX = 0;
      let lastPtrY = 0;
      let pinchStartDist = 0;
      const activePointers = new Map<number, { x: number; y: number }>();

      const onPointerDown = (e: PointerEvent) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        engState.transition.active = false;
        if (activePointers.size === 1) {
          isDragging = true;
          lastPtrX = e.clientX;
          lastPtrY = e.clientY;
        } else if (activePointers.size === 2) {
          isDragging = false;
          const pts = Array.from(activePointers.values());
          pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 2) {
          const pts = Array.from(activePointers.values());
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const delta = (dist - pinchStartDist) * 0.008;
          pinchStartDist = dist;
          if (stateRef.current.inputSource === 'spatial_lab') {
            _camDir.set(-Math.sin(engState.yaw), 0, -Math.cos(engState.yaw)).normalize();
            const prev = engState.camPos.clone();
            engState.camPos.addScaledVector(_camDir, delta);
            clampCameraPosition(engState.camPos, prev, multiRoom);
          }
          return;
        }

        if (!isDragging) return;
        const dx = e.clientX - lastPtrX;
        const dy = e.clientY - lastPtrY;
        lastPtrX = e.clientX;
        lastPtrY = e.clientY;
        engState.yaw -= dx * 0.0046;
        engState.pitch = THREE.MathUtils.clamp(engState.pitch - dy * 0.004, -1.22, 1.15);
      };

      const onPointerUp = (e: PointerEvent) => {
        activePointers.delete(e.pointerId);
        if (activePointers.size < 2) pinchStartDist = 0;
        if (activePointers.size === 0) isDragging = false;
      };

      const onWheel = (e: WheelEvent) => {
        if (stateRef.current.inputSource !== 'spatial_lab') return;
        e.preventDefault();
        engState.transition.active = false;
        _camDir.set(-Math.sin(engState.yaw), 0, -Math.cos(engState.yaw)).normalize();
        const prev = engState.camPos.clone();
        engState.camPos.addScaledVector(_camDir, -e.deltaY * 0.0022);
        clampCameraPosition(engState.camPos, prev, multiRoom);
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
          engState.transition.active = false;
          keys.add(k);
        }
      };
      const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());

      const onDeviceOrientation = (e: DeviceOrientationEvent) => {
        if (stateRef.current.inputSource !== 'live_camera') return;
        if (e.alpha == null || e.beta == null) return;
        engState.yaw = THREE.MathUtils.degToRad(e.alpha);
        engState.pitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(e.beta - 90), -1.1, 1.1);
      };

      const domEl = renderer.domElement;
      domEl.addEventListener('pointerdown', onPointerDown);
      domEl.addEventListener('pointermove', onPointerMove);
      domEl.addEventListener('pointerup', onPointerUp);
      domEl.addEventListener('pointercancel', onPointerUp);
      domEl.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('deviceorientation', onDeviceOrientation);

      const onContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const onContextRestored = () => setContextLost(false);
      domEl.addEventListener('webglcontextlost', onContextLost);
      domEl.addEventListener('webglcontextrestored', onContextRestored);

      const onResize = () => {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      const drawPipCanvases = (
        depthMap: Float32Array,
        mirrorMask: Uint8Array,
        cols: number,
        rows: number,
        maxDepth: number,
        mirrorGuard: boolean,
      ) => {
        if (!stateRef.current.config.showPip) return;
        const dCanvas = depthPipRef.current;
        const mCanvas = maskPipRef.current;
        if (!dCanvas || !mCanvas) return;

        const dCtx = dCanvas.getContext('2d');
        const mCtx = mCanvas.getContext('2d');
        if (!dCtx || !mCtx) return;

        if (pipScratch.width !== cols || pipScratch.height !== rows) {
          pipScratch.width = cols;
          pipScratch.height = rows;
        }

        const dImg = pipScratchCtx.createImageData(cols, rows);
        const mImg = pipScratchCtx.createImageData(cols, rows);

        for (let i = 0; i < cols * rows; i++) {
          const p = i * 4;
          const d = depthMap[i];
          if (d <= 0.01) {
            dImg.data[p] = 12;
            dImg.data[p + 1] = 16;
            dImg.data[p + 2] = 24;
            dImg.data[p + 3] = 255;
            mImg.data[p] = 15;
            mImg.data[p + 1] = 23;
            mImg.data[p + 2] = 42;
            mImg.data[p + 3] = 255;
          } else {
            const inv = 1 - THREE.MathUtils.clamp((d - 0.08) / maxDepth, 0, 1);
            turboColormap(inv, _tmpColor);
            dImg.data[p] = Math.round(_tmpColor.r * 255);
            dImg.data[p + 1] = Math.round(_tmpColor.g * 255);
            dImg.data[p + 2] = Math.round(_tmpColor.b * 255);
            dImg.data[p + 3] = 255;

            if (mirrorMask[i]) {
              mImg.data[p] = mirrorGuard ? 56 : 245;
              mImg.data[p + 1] = mirrorGuard ? 189 : 158;
              mImg.data[p + 2] = mirrorGuard ? 248 : 11;
              mImg.data[p + 3] = 255;
            } else {
              mImg.data[p] = 20;
              mImg.data[p + 1] = 184;
              mImg.data[p + 2] = 166;
              mImg.data[p + 3] = 255;
            }
          }
        }

        pipScratchCtx.putImageData(dImg, 0, 0);
        dCtx.imageSmoothingEnabled = false;
        dCtx.drawImage(pipScratch, 0, 0, dCanvas.width, dCanvas.height);

        pipScratchCtx.putImageData(mImg, 0, 0);
        mCtx.imageSmoothingEnabled = false;
        mCtx.drawImage(pipScratch, 0, 0, mCanvas.width, mCanvas.height);
      };

      let frameId = 0;
      let stopped = false;
      let prevTime = performance.now();
      let lastScanTime = 0;
      let lastMetricsTime = 0;
      let fpsAccum = 0;
      let fpsFrames = 0;
      let currentFps = 60;
      let lastProcessMs = 3.2;

      const afterDraw = (cb: () => void) => {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || typeof gl.fenceSync !== 'function') {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (stopped) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      };

      /**
       * Captures a dense 44x32 linear eye-space depth frame from the current camera pose
       * and integrates it into the unified World-Space TSDF Volume (zero overlap, zero islands!).
       */
      const runSpatialLabScan = (cfg: EngineConfig) => {
        const t0 = performance.now();
        const macroActive =
          cfg.macroMode || (engState.lastProbe.valid && engState.lastProbe.distanceM < 0.52);
        const minDepth = macroActive ? 0.08 : 0.24;
        const maxDepth = macroActive ? 1.35 : 5.4;

        depthBuf.fill(0);
        flagsBuf.fill(0);
        hitValidBuf.fill(0);
        mirrorMaskBuf.fill(0);

        camera.updateMatrixWorld();
        camera.getWorldDirection(_camDir);
        raycaster.near = minDepth;
        raycaster.far = maxDepth;

        let mirrorClampedCount = 0;

        for (let r = 0; r < SCAN_ROWS; r++) {
          const v = 1 - (r / (SCAN_ROWS - 1)) * 2;
          for (let c = 0; c < SCAN_COLS; c++) {
            const idx = r * SCAN_COLS + c;
            const u = (c / (SCAN_COLS - 1)) * 2 - 1;
            _ndc.set(u, v);
            raycaster.setFromCamera(_ndc, camera);
            const hits = raycaster.intersectObjects(multiRoom.scannableMeshes, false);
            if (hits.length === 0) continue;

            const hit = hits[0];
            const meta = hit.object.userData as {
              room?: 'Oda 1' | 'Oda 2';
              isMirror?: boolean;
              isMacro?: boolean;
            };
            const isMirror = Boolean(meta.isMirror);
            const isMacro = Boolean(meta.isMacro) || hit.distance < 0.52;

            const cosAngle = Math.max(0.25, raycaster.ray.direction.dot(_camDir));
            let rayDist = hit.distance;
            let hx = hit.point.x;
            let hy = hit.point.y;
            let hz = hit.point.z;

            if (isMirror) {
              mirrorMaskBuf[idx] = 1;
              flagsBuf[idx] |= 1;
              if (cfg.mirrorGuard) {
                // Mirror Guard ON: clamp flat onto physical mirror plane x = mirrorBounds.x
                hx = multiRoom.mirrorBounds.x;
                mirrorClampedCount++;
              } else {
                // Mirror Guard OFF: simulate reflected virtual room depth blowout behind wall
                const virtualExtra = 1.05 + Math.sin(hy * 4.5 + hz * 3.5) * 0.22;
                rayDist += virtualExtra;
                hx = camera.position.x + raycaster.ray.direction.x * rayDist;
                hy = camera.position.y + raycaster.ray.direction.y * rayDist;
                hz = camera.position.z + raycaster.ray.direction.z * rayDist;
              }
            }

            if (isMacro) flagsBuf[idx] |= 2;

            // Convert Euclidean ray distance to linear camera eye-space Z depth!
            const zEye = rayDist * cosAngle;
            depthBuf[idx] = zEye;
            hitPointsBuf[idx * 3] = hx;
            hitPointsBuf[idx * 3 + 1] = hy;
            hitPointsBuf[idx * 3 + 2] = hz;
            hitValidBuf[idx] = 1;
            roomTagBuf[idx] = meta.room === 'Oda 2' ? 1 : 0;

            extractHitRgb(hit.object, _tmpColor);
            colorRBuf[idx] = Math.round(_tmpColor.r * 255);
            colorGBuf[idx] = Math.round(_tmpColor.g * 255);
            colorBBuf[idx] = Math.round(_tmpColor.b * 255);
          }
        }

        mesher.integrateDepthFrame(
          {
            cols: SCAN_COLS,
            rows: SCAN_ROWS,
            depth: depthBuf,
            colorR: colorRBuf,
            colorG: colorGBuf,
            colorB: colorBBuf,
            roomTag: roomTagBuf,
            flags: flagsBuf,
            hitPoints: hitPointsBuf,
            hitValid: hitValidBuf,
            minDepth,
            maxDepth,
            mirrorClampedCount,
          },
          camera,
          cfg,
        );

        drawPipCanvases(depthBuf, mirrorMaskBuf, SCAN_COLS, SCAN_ROWS, maxDepth, cfg.mirrorGuard);
        lastProcessMs = performance.now() - t0;
      };

      const tick = () => {
        if (stopped) return;
        const now = performance.now();
        const dt = Math.min((now - prevTime) / 1000, 0.08);
        prevTime = now;

        fpsAccum += dt;
        fpsFrames++;
        if (fpsAccum >= 0.35) {
          currentFps = fpsFrames / fpsAccum;
          fpsAccum = 0;
          fpsFrames = 0;
        }

        const {
          inputSource: src,
          renderMode: mode,
          isScanning: scanning,
          config: cfg,
          anchors: anchorList,
        } = stateRef.current;

        // 1. Update camera pose
        if (src === 'spatial_lab') {
          if (engState.transition.active) {
            const lambda = 6.5;
            engState.camPos.x = THREE.MathUtils.damp(
              engState.camPos.x,
              engState.transition.targetPos.x,
              lambda,
              dt,
            );
            engState.camPos.y = THREE.MathUtils.damp(
              engState.camPos.y,
              engState.transition.targetPos.y,
              lambda,
              dt,
            );
            engState.camPos.z = THREE.MathUtils.damp(
              engState.camPos.z,
              engState.transition.targetPos.z,
              lambda,
              dt,
            );

            let dyaw = engState.transition.targetYaw - engState.yaw;
            while (dyaw > Math.PI) dyaw -= Math.PI * 2;
            while (dyaw < -Math.PI) dyaw += Math.PI * 2;
            engState.yaw += dyaw * (1 - Math.exp(-lambda * dt));
            engState.pitch = THREE.MathUtils.damp(
              engState.pitch,
              engState.transition.targetPitch,
              lambda,
              dt,
            );

            if (
              engState.camPos.distanceTo(engState.transition.targetPos) < 0.015 &&
              Math.abs(dyaw) < 0.015 &&
              Math.abs(engState.pitch - engState.transition.targetPitch) < 0.015
            ) {
              engState.transition.active = false;
            }
          } else {
            let moveF = engState.nudgeVelocity.forward;
            let moveS = engState.nudgeVelocity.strafe;
            if (keys.has('w') || keys.has('arrowup')) moveF += 1;
            if (keys.has('s') || keys.has('arrowdown')) moveF -= 1;
            if (keys.has('d') || keys.has('arrowright')) moveS += 1;
            if (keys.has('a') || keys.has('arrowleft')) moveS -= 1;

            if (moveF !== 0 || moveS !== 0) {
              const speed = cfg.macroMode ? 0.95 : 2.15;
              _camDir.set(-Math.sin(engState.yaw), 0, -Math.cos(engState.yaw)).normalize();
              _camRight.crossVectors(_camDir, _worldUp).normalize();
              const prev = engState.camPos.clone();
              engState.camPos.addScaledVector(_camDir, moveF * speed * dt);
              engState.camPos.addScaledVector(_camRight, moveS * speed * dt);
              clampCameraPosition(engState.camPos, prev, multiRoom);
            }
          }

          camera.position.copy(engState.camPos);
          _lookTarget
            .set(
              -Math.sin(engState.yaw) * Math.cos(engState.pitch),
              Math.sin(engState.pitch),
              -Math.cos(engState.yaw) * Math.cos(engState.pitch),
            )
            .add(engState.camPos);
          camera.lookAt(_lookTarget);
          const showPhysical = mode === 'ar_overlay' || mode === 'ar_wire';
          scene.background = showPhysical ? _bgPhysical : _bgSolid;
          renderer.setClearAlpha(1);
        } else {
          camera.position.set(0, 1.45, 0);
          _lookTarget
            .set(
              -Math.sin(engState.yaw) * Math.cos(engState.pitch),
              Math.sin(engState.pitch),
              -Math.cos(engState.yaw) * Math.cos(engState.pitch),
            )
            .add(camera.position);
          camera.lookAt(_lookTarget);
          scene.background = null;
          renderer.setClearColor(0x000000, 0);
        }

        // 2. Center Crosshair Raycast Probe
        if (src === 'spatial_lab') {
          _ndc.set(0, 0);
          raycaster.near = cfg.macroMode ? 0.08 : 0.22;
          raycaster.far = 8.5;
          raycaster.setFromCamera(_ndc, camera);
          const centerHits = raycaster.intersectObjects(multiRoom.scannableMeshes, false);
          if (centerHits.length > 0) {
            const hit = centerHits[0];
            const meta = hit.object.userData as {
              room?: 'Oda 1' | 'Oda 2';
              surfaceType?: SpatialAnchor['surfaceType'];
              isMirror?: boolean;
              isMacro?: boolean;
            };
            const normal = hit.face
              ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
              : new THREE.Vector3(0, 1, 0);
            engState.lastProbe = {
              valid: true,
              point: hit.point.clone(),
              normal,
              distanceM: hit.distance,
              room: meta.room || 'Oda 1',
              surfaceType: meta.surfaceType || 'Yüzey',
              isMirror: Boolean(meta.isMirror),
              isMacro: Boolean(meta.isMacro) || hit.distance < 0.52,
              confidence: meta.isMirror && !cfg.mirrorGuard ? 0.35 : 0.96,
            };
          } else {
            engState.lastProbe.valid = false;
          }
        }

        // 3. Throttled Unified TSDF Depth Integration
        const scanIntervalMs = isSoftwareGl ? 420 : 150;
        if (scanning && now - lastScanTime >= scanIntervalMs) {
          lastScanTime = now;
          if (src === 'spatial_lab') {
            runSpatialLabScan(cfg);
          } else if (videoRef.current && videoRef.current.readyState >= 2) {
            const t0 = performance.now();
            const live = liveEstimator.processVideoFrame(videoRef.current, camera, cfg);
            if (live) {
              mesher.integrateDepthFrame(live.frame, camera, cfg);
              drawPipCanvases(
                live.frame.depth,
                live.mirrorMask,
                live.frame.cols,
                live.frame.rows,
                live.frame.maxDepth,
                cfg.mirrorGuard,
              );
              camera.getWorldDirection(_camDir);
              const centerPoint = camera.position
                .clone()
                .addScaledVector(_camDir, live.centerDepthM);
              engState.lastProbe = {
                valid: live.centerDepthM > 0.08,
                point: centerPoint,
                normal: _camDir.clone().negate(),
                distanceM: live.centerDepthM,
                room: 'Kamera',
                surfaceType: live.centerIsMirror
                  ? 'Ayna Düzlemi'
                  : cfg.macroMode
                    ? 'Masa / Makro'
                    : 'Yüzey',
                isMirror: live.centerIsMirror,
                isMacro: cfg.macroMode && live.centerDepthM <= 0.48,
                confidence: live.centerIsMirror && !cfg.mirrorGuard ? 0.32 : 0.88,
              };
            }
            lastProcessMs = performance.now() - t0;
          }
        }

        // 4. Real-Time Wall & Room Depth Occlusion for BOTH TSDF Blocks AND 3D Anchors
        if (src === 'spatial_lab') {
          mesher.updateOcclusionVisibility(
            engState.camPos,
            multiRoom.dividingWallZ,
            multiRoom.doorwayXRange,
            multiRoom.doorwayMaxY,
            cfg,
          );
        }

        let occludedAnchorsCount = 0;
        let anchorOcclusionChanged = false;
        const updatedOcclusion = new Map<string, boolean>();

        for (const anchor of anchorList) {
          const marker = anchorMeshes.get(anchor.id);
          if (!marker) continue;

          let isBlocked = false;
          if (src === 'spatial_lab') {
            _tmpPos.set(...anchor.position);
            const distToAnchor = engState.camPos.distanceTo(_tmpPos);
            _rayDir.copy(_tmpPos).sub(engState.camPos).normalize();
            raycaster.set(engState.camPos, _rayDir);
            raycaster.near = 0.05;
            raycaster.far = Math.max(0.1, distToAnchor - 0.07);
            const occluders = raycaster.intersectObjects(multiRoom.occluderMeshes, false);
            isBlocked = occluders.length > 0;
          }

          if (isBlocked) occludedAnchorsCount++;
          if (anchor.occluded !== isBlocked) {
            anchorOcclusionChanged = true;
            updatedOcclusion.set(anchor.id, isBlocked);
          }

          marker.visible = cfg.wallOcclusion ? !isBlocked : true;
          marker.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
              child.material.depthTest = cfg.wallOcclusion;
            }
          });
        }

        if (anchorOcclusionChanged) {
          callbacksRef.current.onAnchorsChange((prev) =>
            prev.map((a) =>
              updatedOcclusion.has(a.id) ? { ...a, occluded: updatedOcclusion.get(a.id)! } : a,
            ),
          );
        }

        // 5. Render Frame
        renderer.render(scene, camera);

        // 6. Throttled HUD metrics
        if (now - lastMetricsTime >= 240) {
          lastMetricsTime = now;
          const stats = mesher.getStats();
          const currentRoom: ReconMetrics['currentRoom'] =
            src === 'live_camera'
              ? 'Canlı Kamera'
              : engState.camPos.z < multiRoom.dividingWallZ - 0.35
                ? 'Oda 2'
                : engState.camPos.z > multiRoom.dividingWallZ + 0.35
                  ? 'Oda 1'
                  : 'Kapı Eşiği';

          const macroActive =
            cfg.macroMode || (engState.lastProbe.valid && engState.lastProbe.distanceM < 0.52);

          callbacksRef.current.onCrosshairUpdate({
            valid: engState.lastProbe.valid,
            distanceM: engState.lastProbe.distanceM,
            surfaceType: engState.lastProbe.surfaceType,
            room: engState.lastProbe.room,
            isMirror: engState.lastProbe.isMirror,
            isMacro: engState.lastProbe.isMacro,
            confidence: engState.lastProbe.confidence,
          });

          callbacksRef.current.onMetricsUpdate({
            fps: currentFps,
            processMs: lastProcessMs,
            smoothingMs: stats.smoothingMs,
            triangles: stats.triangles,
            vertices: stats.vertices,
            chunks: stats.chunks,
            keyframes: stats.keyframes,
            depthSource:
              src === 'live_camera'
                ? 'Kamera Akışı'
                : macroActive
                  ? 'Makro 15mm'
                  : 'Lidar / Derinlik',
            currentRoom,
            mirrorPixelsClamped: stats.mirrorPixelsClamped,
            occludedChunks: stats.occludedChunks,
            occludedAnchors: occludedAnchorsCount,
            tracking: true,
            scanning,
            macroActive,
          });
        }

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      };

      frameId = requestAnimationFrame(tick);

      return () => {
        stopped = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        domEl.removeEventListener('pointerdown', onPointerDown);
        domEl.removeEventListener('pointermove', onPointerMove);
        domEl.removeEventListener('pointerup', onPointerUp);
        domEl.removeEventListener('pointercancel', onPointerUp);
        domEl.removeEventListener('wheel', onWheel);
        domEl.removeEventListener('webglcontextlost', onContextLost);
        domEl.removeEventListener('webglcontextrestored', onContextRestored);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('deviceorientation', onDeviceOrientation);
        window.removeEventListener('resize', onResize);

        mesher.dispose();
        multiRoom.dispose();
        textures.dispose();
        envRT.dispose();
        renderer.dispose();
        engineRef.current = null;
      };
    }, []);

    return (
      <div className="relative w-full h-full overflow-hidden bg-[#0A0D12]">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
            inputSource === 'live_camera' && cameraReady
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
        />

        <div
          ref={mountRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        />

        {(contextLost || webglError) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0A0D12] p-6 text-center">
            <div className="max-w-sm rounded-2xl border border-slate-800 bg-[#11161F] p-6">
              <h2 className="text-base font-semibold text-slate-100">
                {webglError ? 'WebGL Başlatılamadı' : 'WebGL Bağlamı Yenileniyor'}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {webglError ||
                  'Grafik bağlamı geçici olarak duraklatıldı. Tarama hacmi korunuyor.'}
              </p>
            </div>
          </div>
        )}

        {config.showPip && (
          <div className="pointer-events-none absolute right-3 top-16 z-10 flex flex-col gap-1.5 sm:flex-row">
            <div className="rounded-lg border border-white/10 bg-[#0A0D12]/90 p-1">
              <canvas ref={depthPipRef} width={76} height={56} className="block rounded-[4px]" />
              <div className="mt-0.5 text-center text-[10px] font-medium text-slate-300">
                Derinlik
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0A0D12]/90 p-1">
              <canvas ref={maskPipRef} width={76} height={56} className="block rounded-[4px]" />
              <div className="mt-0.5 text-center text-[10px] font-medium text-slate-300">
                Ayna / Güven
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);
