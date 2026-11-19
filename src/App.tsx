import { useCallback, useEffect, useRef, useState } from 'react';
import { AnchorSheet } from './components/AnchorSheet';
import { BottomControlDock } from './components/BottomControlDock';
import { CrosshairOverlay } from './components/CrosshairOverlay';
import { ExportApkSheet } from './components/ExportApkSheet';
import {
  ScenarioSettingsSheet,
  type WorkflowScenario,
} from './components/ScenarioSettingsSheet';
import {
  ScannerViewport,
  type ScannerViewportHandle,
} from './components/ScannerViewport';
import { TopHud } from './components/TopHud';
import { generateAndroidApkPatchKit } from './engine/androidPatchExporter';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import { useWakeLock } from './hooks/useWakeLock';
import {
  RENDER_MODE_LABELS,
  RENDER_MODE_ORDER,
  type CrosshairProbe,
  type EngineConfig,
  type InputSource,
  type ReconMetrics,
  type RenderMode,
  type RoomPresetId,
  type SpatialAnchor,
} from './types/recon';

const INITIAL_CONFIG: EngineConfig = {
  meshAlgorithm: 'surface_nets',
  taubinPasses: 3,
  wallOcclusion: true,
  mirrorGuard: true,
  macroMode: false,
  resolution: 'balanced_6cm',
  meshOpacity: 0.72,
  showPip: true,
};

const INITIAL_METRICS: ReconMetrics = {
  fps: 60,
  processMs: 0,
  smoothingMs: 0,
  triangles: 0,
  vertices: 0,
  chunks: 0,
  keyframes: 0,
  depthSource: 'Lidar / Derinlik',
  currentRoom: 'Oda 1',
  mirrorPixelsClamped: 0,
  occludedChunks: 0,
  occludedAnchors: 0,
  tracking: true,
  scanning: true,
  macroActive: false,
};

const INITIAL_PROBE: CrosshairProbe = {
  valid: false,
  distanceM: 0,
  surfaceType: 'Yüzey',
  room: 'Oda 1',
  isMirror: false,
  isMacro: false,
  confidence: 0,
};

function triggerDownload(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  const viewportRef = useRef<ScannerViewportHandle | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const [inputSource, setInputSource] = useState<InputSource>('spatial_lab');
  const [renderMode, setRenderMode] = useState<RenderMode>('ar_overlay');
  const [isScanning, setIsScanning] = useState(true);
  const [config, setConfig] = useState<EngineConfig>(INITIAL_CONFIG);
  const [anchors, setAnchors] = useState<SpatialAnchor[]>([]);
  const [metrics, setMetrics] = useState<ReconMetrics>(INITIAL_METRICS);
  const [probe, setProbe] = useState<CrosshairProbe>(INITIAL_PROBE);
  const [activePreset, setActivePreset] = useState<RoomPresetId>('room_a');
  const [activeScenarioId, setActiveScenarioId] = useState<string>('multi_room');

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showAnchorSheet, setShowAnchorSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();

  useWakeLock(isScanning);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
    }, 3600);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const handlePlaceAnchor = useCallback(() => {
    const res = viewportRef.current?.placeAnchorAtCrosshair();
    if (!res) return;
    if (res.ok && res.anchor && anchors.length >= 1) {
      const prev = anchors[anchors.length - 1];
      const dx = res.anchor.position[0] - prev.position[0];
      const dy = res.anchor.position[1] - prev.position[1];
      const dz = res.anchor.position[2] - prev.position[2];
      const dist = Math.hypot(dx, dy, dz);
      const distLabel = dist < 0.65 ? `${(dist * 100).toFixed(1)} cm` : `${dist.toFixed(2)} m`;
      showNotice(`${res.message} · Önceki anchora mesafe: ${distLabel}`);
    } else {
      showNotice(res.message);
    }
  }, [anchors, showNotice]);

  const handleSelectRenderMode = useCallback(
    (mode: RenderMode) => {
      setRenderMode(mode);
      showNotice(`Görünüm: ${RENDER_MODE_LABELS[mode]}`);
    },
    [showNotice],
  );

  const handleCycleRenderMode = useCallback(() => {
    setRenderMode((prev) => {
      const idx = RENDER_MODE_ORDER.indexOf(prev);
      const next = RENDER_MODE_ORDER[(idx + 1) % RENDER_MODE_ORDER.length];
      showNotice(`Görünüm: ${RENDER_MODE_LABELS[next]}`);
      return next;
    });
  }, [showNotice]);

  const handleToggleMeshAlgorithm = useCallback(() => {
    setConfig((prev) => {
      const next = prev.meshAlgorithm === 'surface_nets' ? 'faceted_mc' : 'surface_nets';
      showNotice(
        next === 'surface_nets'
          ? 'Meshleme: Surface Nets (Pürüzsüz + Taubin)'
          : 'Meshleme: Bloklu MC (Ham İzo-Yüzey)',
      );
      return { ...prev, meshAlgorithm: next };
    });
  }, [showNotice]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 'h') {
        setDockCollapsed((v) => !v);
      } else if (k === 'm') {
        handleCycleRenderMode();
      } else if (k === ' ') {
        e.preventDefault();
        setIsScanning((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCycleRenderMode]);

  const handleSelectPreset = useCallback(
    (preset: RoomPresetId) => {
      setActivePreset(preset);
      viewportRef.current?.flyToPreset(preset);

      if (preset === 'macro_desk') {
        setConfig((c) => ({ ...c, macroMode: true, resolution: 'macro_15mm' }));
        showNotice('Makro Masa (8–45 cm) — 1.5 cm ince TSDF aktif');
      } else if (preset === 'mirror_wall') {
        showNotice(
          config.mirrorGuard
            ? 'Ayna Önü — Ayna Koruma düzlemi kilitliyor'
            : 'Ayna Önü — Koruma kapalı (sanal yansıma hatası görünür)',
        );
      } else if (preset === 'room_b') {
        showNotice(
          config.wallOcclusion
            ? 'Oda 2 — Duvar oklüzyonu Oda 1 sızmasını engelliyor'
            : 'Oda 2 — Oklüzyon kapalı (duvar arkası sızması testi)',
        );
      } else if (preset === 'room_a') {
        setConfig((c) =>
          c.macroMode ? { ...c, macroMode: false, resolution: 'balanced_6cm' } : c,
        );
      }
    },
    [config.mirrorGuard, config.wallOcclusion, showNotice],
  );

  const handleApplyScenario = useCallback(
    (scenario: WorkflowScenario) => {
      setActiveScenarioId(scenario.id);
      setInputSource('spatial_lab');
      setRenderMode(scenario.renderMode);
      setConfig((prev) => ({ ...prev, ...scenario.configPatch }));
      setActivePreset(scenario.preset);
      setShowSettingsSheet(false);
      window.setTimeout(() => {
        viewportRef.current?.flyToPreset(scenario.preset);
      }, 40);
      showNotice(`Senaryo aktif: ${scenario.title}`);
    },
    [showNotice],
  );

  const handleChangeConfig = useCallback((patch: Partial<EngineConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleToggleWallOcclusion = useCallback(() => {
    setConfig((prev) => {
      const next = !prev.wallOcclusion;
      showNotice(
        next
          ? 'Duvar Oklüzyonu AÇIK — yan oda duvar arkası gizleniyor'
          : 'Duvar Oklüzyonu KAPALI — eski X-ray duvar sızması karşılaştırması',
      );
      return { ...prev, wallOcclusion: next };
    });
  }, [showNotice]);

  const handleToggleMirrorGuard = useCallback(() => {
    setConfig((prev) => {
      const next = !prev.mirrorGuard;
      showNotice(
        next
          ? 'Ayna Koruma AÇIK — parlak yansıma çerçeve düzlemine kilitleniyor'
          : 'Ayna Koruma KAPALI — ham sensör yansıma bozulması gösteriliyor',
      );
      return { ...prev, mirrorGuard: next };
    });
  }, [showNotice]);

  const handleToggleMacroMode = useCallback(() => {
    setConfig((prev) => {
      const next = !prev.macroMode;
      showNotice(
        next
          ? 'Makro Mod AÇIK — 8 cm yakın odak ve 1.5 cm ince TSDF'
          : 'Standart Oda Modu — 6 cm dengeli TSDF hacmi',
      );
      return {
        ...prev,
        macroMode: next,
        resolution: next ? 'macro_15mm' : 'balanced_6cm',
      };
    });
  }, [showNotice]);

  const handleExportOBJ = useCallback(() => {
    const data = viewportRef.current?.exportOBJ();
    if (!data) {
      showNotice('Dışa aktarılacak mesh henüz oluşmadı.');
      return;
    }
    triggerDownload(`3drecon-v3-tsdf-${Date.now()}.obj`, data);
    showNotice('Tek parça .OBJ TSDF mesh indirildi.');
  }, [showNotice]);

  const handleExportPLY = useCallback(() => {
    const data = viewportRef.current?.exportPLY();
    if (!data) {
      showNotice('Dışa aktarılacak mesh henüz oluşmadı.');
      return;
    }
    triggerDownload(`3drecon-v3-tsdf-${Date.now()}.ply`, data);
    showNotice('Renkli .PLY yüzey indirildi.');
  }, [showNotice]);

  const handleExportAndroidKit = useCallback(() => {
    const kit = generateAndroidApkPatchKit(config);
    triggerDownload('3drecon-v3-android-cpp-apk-kit.txt', kit);
    showNotice('v3.0 C++ / GLSL Oklüzyon ve APK paketleme kiti indirildi.');
  }, [config, showNotice]);

  const handleTopInstall = useCallback(() => {
    if (isInstallable) {
      void install();
    } else {
      setShowExportSheet(true);
    }
  }, [install, isInstallable]);

  return (
    <main className="relative h-full w-full overflow-hidden bg-[#0A0D12] select-none">
      <ScannerViewport
        ref={viewportRef}
        inputSource={inputSource}
        renderMode={renderMode}
        isScanning={isScanning}
        config={config}
        anchors={anchors}
        onAnchorsChange={setAnchors}
        onMetricsUpdate={setMetrics}
        onCrosshairUpdate={setProbe}
        onNotice={showNotice}
        onCameraError={showNotice}
        onAutoFallbackToLab={() => setInputSource('spatial_lab')}
      />

      <CrosshairOverlay probe={probe} config={config} metrics={metrics} notice={notice} />

      <TopHud
        inputSource={inputSource}
        onChangeInputSource={(src) => {
          setInputSource(src);
          if (src === 'spatial_lab') showNotice('3D Çoklu Oda TSDF Tarama Modu');
        }}
        metrics={metrics}
        isOnline={isOnline}
        isInstallable={isInstallable}
        isIOS={isIOS}
        isInstalled={isInstalled}
        onInstallApp={handleTopInstall}
        onOpenScenarios={() => setShowSettingsSheet(true)}
      />

      <BottomControlDock
        inputSource={inputSource}
        isScanning={isScanning}
        renderMode={renderMode}
        config={config}
        anchorCount={anchors.length}
        activePreset={activePreset}
        dockCollapsed={dockCollapsed}
        onToggleDock={() => setDockCollapsed((v) => !v)}
        onToggleScan={() => setIsScanning((v) => !v)}
        onSelectRenderMode={handleSelectRenderMode}
        onCycleRenderMode={handleCycleRenderMode}
        onToggleMeshAlgorithm={handleToggleMeshAlgorithm}
        onAddAnchor={handlePlaceAnchor}
        onOpenAnchors={() => setShowAnchorSheet(true)}
        onOpenSettings={() => setShowSettingsSheet(true)}
        onOpenExport={() => setShowExportSheet(true)}
        onResetScan={() => viewportRef.current?.resetScan()}
        onSelectPreset={handleSelectPreset}
        onToggleWallOcclusion={handleToggleWallOcclusion}
        onToggleMirrorGuard={handleToggleMirrorGuard}
        onToggleMacroMode={handleToggleMacroMode}
        onNudgeMove={(f, s) => viewportRef.current?.nudgeMove(f, s)}
      />

      <ScenarioSettingsSheet
        open={showSettingsSheet}
        config={config}
        activeScenarioId={activeScenarioId}
        onClose={() => setShowSettingsSheet(false)}
        onApplyScenario={handleApplyScenario}
        onChangeConfig={handleChangeConfig}
      />

      <AnchorSheet
        open={showAnchorSheet}
        anchors={anchors}
        wallOcclusionEnabled={config.wallOcclusion}
        onClose={() => setShowAnchorSheet(false)}
        onFlyTo={(a) => viewportRef.current?.flyToAnchor(a)}
        onRemove={(id) => viewportRef.current?.removeAnchor(id)}
        onRename={(id, label) => viewportRef.current?.renameAnchor(id, label)}
        onAddNow={handlePlaceAnchor}
      />

      <ExportApkSheet
        open={showExportSheet}
        metrics={metrics}
        anchorCount={anchors.length}
        config={config}
        isOnline={isOnline}
        isInstallable={isInstallable}
        isIOS={isIOS}
        isInstalled={isInstalled}
        onInstallApp={install}
        onExportOBJ={handleExportOBJ}
        onExportPLY={handleExportPLY}
        onExportAndroidKit={handleExportAndroidKit}
        onClose={() => setShowExportSheet(false)}
      />
    </main>
  );
}
