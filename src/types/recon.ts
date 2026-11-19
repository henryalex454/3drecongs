export type RenderMode =
  | 'ar_overlay'
  | 'smooth_mesh'
  | 'ar_wire'
  | 'wireframe'
  | 'normals'
  | 'depth'
  | 'points';

export type MeshAlgorithm = 'surface_nets' | 'faceted_mc';

export type InputSource = 'spatial_lab' | 'live_camera';

export type RoomPresetId = 'room_a' | 'mirror_wall' | 'macro_desk' | 'doorway' | 'room_b';

export type ResolutionPreset = 'fast_9cm' | 'balanced_6cm' | 'fine_35mm' | 'macro_15mm';

export interface EngineConfig {
  meshAlgorithm: MeshAlgorithm;
  taubinPasses: number;
  wallOcclusion: boolean;
  mirrorGuard: boolean;
  macroMode: boolean;
  resolution: ResolutionPreset;
  meshOpacity: number;
  showPip: boolean;
}

export interface SpatialAnchor {
  id: string;
  label: string;
  position: [number, number, number];
  normal: [number, number, number];
  room: 'Oda 1' | 'Oda 2' | 'Kamera';
  surfaceType: 'Duvar' | 'Masa / Makro' | 'Ayna Düzlemi' | 'Zemin' | 'Heykel / Obje' | 'Yüzey';
  distanceM: number;
  occluded: boolean;
  confidence: number;
  createdAt: number;
}

export interface CrosshairProbe {
  valid: boolean;
  distanceM: number;
  surfaceType: SpatialAnchor['surfaceType'];
  room: SpatialAnchor['room'];
  isMirror: boolean;
  isMacro: boolean;
  confidence: number;
}

export interface ReconMetrics {
  fps: number;
  processMs: number;
  smoothingMs: number;
  triangles: number;
  vertices: number;
  chunks: number;
  keyframes: number;
  depthSource: 'Lidar / Derinlik' | 'Makro 15mm' | 'Kamera Akışı';
  currentRoom: 'Oda 1' | 'Kapı Eşiği' | 'Oda 2' | 'Canlı Kamera';
  mirrorPixelsClamped: number;
  occludedChunks: number;
  occludedAnchors: number;
  tracking: boolean;
  scanning: boolean;
  macroActive: boolean;
}

export const RENDER_MODE_ORDER: RenderMode[] = [
  'ar_overlay',
  'smooth_mesh',
  'ar_wire',
  'wireframe',
  'normals',
  'depth',
  'points',
];

export const RENDER_MODE_LABELS: Record<RenderMode, string> = {
  ar_overlay: 'AR',
  smooth_mesh: 'Mesh',
  ar_wire: 'AR+Tel',
  wireframe: 'Tel Kafes',
  normals: 'Normal',
  depth: 'Derinlik',
  points: 'Nokta',
};

export const RESOLUTION_VOXEL_M: Record<ResolutionPreset, number> = {
  fast_9cm: 0.09,
  balanced_6cm: 0.062,
  fine_35mm: 0.036,
  macro_15mm: 0.016,
};
