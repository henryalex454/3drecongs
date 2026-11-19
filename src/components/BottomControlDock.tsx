import React, { useState } from 'react';
import {
  Anchor,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Focus,
  List,
  Move,
  Pause,
  Play,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  RENDER_MODE_LABELS,
  RENDER_MODE_ORDER,
  type EngineConfig,
  type InputSource,
  type RenderMode,
  type RoomPresetId,
} from '../types/recon';

interface BottomControlDockProps {
  inputSource: InputSource;
  isScanning: boolean;
  renderMode: RenderMode;
  config: EngineConfig;
  anchorCount: number;
  activePreset: RoomPresetId;
  dockCollapsed: boolean;
  onToggleDock: () => void;
  onToggleScan: () => void;
  onSelectRenderMode: (mode: RenderMode) => void;
  onCycleRenderMode: () => void;
  onToggleMeshAlgorithm: () => void;
  onAddAnchor: () => void;
  onOpenAnchors: () => void;
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onResetScan: () => void;
  onSelectPreset: (preset: RoomPresetId) => void;
  onToggleWallOcclusion: () => void;
  onToggleMirrorGuard: () => void;
  onToggleMacroMode: () => void;
  onNudgeMove: (forward: number, strafe: number) => void;
}

const ROOM_QUICK_JUMPS: { id: RoomPresetId; label: string }[] = [
  { id: 'room_a', label: 'Oda 1' },
  { id: 'mirror_wall', label: 'Ayna' },
  { id: 'macro_desk', label: 'Makro' },
  { id: 'doorway', label: 'Kapı' },
  { id: 'room_b', label: 'Oda 2' },
];

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  inputSource,
  isScanning,
  renderMode,
  config,
  anchorCount,
  activePreset,
  dockCollapsed,
  onToggleDock,
  onToggleScan,
  onSelectRenderMode,
  onCycleRenderMode,
  onToggleMeshAlgorithm,
  onAddAnchor,
  onOpenAnchors,
  onOpenSettings,
  onOpenExport,
  onResetScan,
  onSelectPreset,
  onToggleWallOcclusion,
  onToggleMirrorGuard,
  onToggleMacroMode,
  onNudgeMove,
}) => {
  const [showMovePad, setShowMovePad] = useState(false);

  const bindWalk = (forward: number, strafe: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      onNudgeMove(forward, strafe);
    },
    onPointerUp: () => onNudgeMove(0, 0),
    onPointerLeave: () => onNudgeMove(0, 0),
    onPointerCancel: () => onNudgeMove(0, 0),
  });

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 flex flex-col items-center px-2.5 pb-safe">
      {/* Optional One-Handed Mobile Walk Pad */}
      {showMovePad && !dockCollapsed && inputSource === 'spatial_lab' && (
        <div className="pointer-events-auto mb-2 flex items-center gap-1 rounded-2xl border border-white/12 bg-[#0D121B]/95 p-1.5 shadow-xl">
          <button
            type="button"
            aria-label="Sola yürü"
            {...bindWalk(0, -1)}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#161E2C] text-slate-200 active:bg-teal-500/25 active:text-teal-300"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              aria-label="İleri yürü"
              {...bindWalk(1, 0)}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#161E2C] text-slate-200 active:bg-teal-500/25 active:text-teal-300"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Geri yürü"
              {...bindWalk(-1, 0)}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#161E2C] text-slate-200 active:bg-teal-500/25 active:text-teal-300"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            aria-label="Sağa yürü"
            {...bindWalk(0, 1)}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#161E2C] text-slate-200 active:bg-teal-500/25 active:text-teal-300"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Collapse / Expand Zen Mode Handle */}
      <button
        type="button"
        onClick={onToggleDock}
        aria-expanded={!dockCollapsed}
        className="pointer-events-auto mb-1 inline-flex min-h-[30px] items-center gap-1.5 rounded-t-xl border border-b-0 border-white/10 bg-[#0D121B]/92 px-3.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
      >
        {dockCollapsed ? (
          <>
            <ChevronUp className="h-3.5 w-3.5 text-teal-400" />
            <span>Kontrolleri Göster</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            <span>Tam Ekran</span>
          </>
        )}
      </button>

      {/* Collapsible Unified Bottom Control Dock */}
      <div
        className={`pointer-events-auto w-full max-w-[860px] rounded-2xl border border-white/12 bg-[#0D121B]/95 shadow-2xl transition-transform duration-200 ${
          dockCollapsed ? 'translate-y-[120%] hidden' : 'translate-y-0'
        }`}
      >
        {/* Row 1: Direct 1-Tap Mesh & Render Mode Selector (Restored from ReconControlBar.kt + expanded) */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto border-b border-white/8 px-2.5 py-1.5">
          <div
            role="tablist"
            aria-label="Mesh ve Görünüm Türleri"
            className="flex items-center gap-1 shrink-0"
          >
            {RENDER_MODE_ORDER.map((mode) => {
              const selected = renderMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onSelectRenderMode(mode)}
                  className={`min-h-[32px] rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    selected
                      ? 'bg-teal-500 text-slate-950 font-semibold'
                      : 'bg-[#151C28] text-slate-300 hover:bg-[#1E2738] hover:text-white'
                  }`}
                >
                  {RENDER_MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onToggleMeshAlgorithm}
            className="min-h-[32px] inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#151C28] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-teal-400/40 whitespace-nowrap shrink-0 transition-colors"
            title="Meshleme algoritmasını değiştir (Surface Nets Pürüzsüz / Bloklu MC)"
          >
            <Box className="h-3.5 w-3.5 text-teal-400" />
            <span>{config.meshAlgorithm === 'surface_nets' ? 'Surface Nets' : 'Bloklu MC'}</span>
          </button>
        </div>

        {/* Row 2: Room Quick Jumps & Instant Engine Protections */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto border-b border-white/8 px-2.5 py-1.5">
          {inputSource === 'spatial_lab' ? (
            <div className="flex items-center gap-1 shrink-0">
              {ROOM_QUICK_JUMPS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectPreset(item.id)}
                  className={`min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    activePreset === item.id
                      ? 'bg-white/12 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowMovePad((v) => !v)}
                aria-label="Yürüyüş tuşları"
                className={`min-h-[30px] inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  showMovePad
                    ? 'bg-white/12 text-slate-100'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Move className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Yürü</span>
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-400 px-1 whitespace-nowrap">
              Canlı arka kamera TSDF akışı
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleWallOcclusion}
              className={`min-h-[30px] inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                config.wallOcclusion
                  ? 'bg-teal-500/18 text-teal-300'
                  : 'bg-rose-500/18 text-rose-300'
              }`}
              title="Yan odaya geçince duvar arkasından sızmayı engelle"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>{config.wallOcclusion ? 'Oklüzyon' : 'Oklüzyon Kapalı'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMirrorGuard}
              className={`min-h-[30px] inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                config.mirrorGuard
                  ? 'bg-sky-500/18 text-sky-300'
                  : 'bg-amber-500/18 text-amber-300'
              }`}
              title="Aynalı yüzeylerde sanal derinlik patlamasını düzleme kilitle"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{config.mirrorGuard ? 'Ayna Korumalı' : 'Ayna Ham'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMacroMode}
              className={`min-h-[30px] inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                config.macroMode
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
              title="8-45 cm yakın çekim makro derinlik modu"
            >
              <Focus className="h-3.5 w-3.5" />
              <span>Makro</span>
            </button>
          </div>
        </div>

        {/* Row 3: Primary Scanner Action Bar (≥44px thumb hitboxes) */}
        <div className="grid grid-cols-7 items-center gap-1 px-2 py-1.5">
          <button
            type="button"
            onClick={onResetScan}
            className="flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-slate-300 hover:bg-white/6 active:scale-95 transition"
          >
            <RotateCcw className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium whitespace-nowrap">Sıfırla</span>
          </button>

          <button
            type="button"
            onClick={onAddAnchor}
            className="flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-teal-300 hover:bg-teal-500/12 active:scale-95 transition"
          >
            <Anchor className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium whitespace-nowrap">+ Anchor</span>
          </button>

          <button
            type="button"
            onClick={onOpenAnchors}
            className="flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-slate-300 hover:bg-white/6 active:scale-95 transition"
          >
            <List className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium whitespace-nowrap font-mono-num">
              Liste ({anchorCount})
            </span>
          </button>

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={onToggleScan}
              aria-label={isScanning ? 'Taramayı Duraklat' : 'Taramayı Başlat'}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg active:scale-95 transition ${
                isScanning
                  ? 'bg-teal-500 text-slate-950 hover:bg-teal-400'
                  : 'bg-[#1D2636] text-slate-100 border border-white/15 hover:bg-[#263247]'
              }`}
            >
              {isScanning ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current ml-0.5" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onCycleRenderMode}
            className="flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-slate-300 hover:bg-white/6 active:scale-95 transition"
          >
            <Eye className="h-[18px] w-[18px] text-teal-400" />
            <span className="text-[10px] font-medium truncate max-w-full px-0.5">
              {RENDER_MODE_LABELS[renderMode]}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-slate-300 hover:bg-white/6 active:scale-95 transition"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium whitespace-nowrap">Motor</span>
          </button>

          <button
            type="button"
            onClick={onOpenExport}
            className="flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-slate-300 hover:bg-white/6 active:scale-95 transition"
          >
            <Download className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium whitespace-nowrap">Aktar/APK</span>
          </button>
        </div>
      </div>
    </div>
  );
};
