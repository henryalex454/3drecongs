import React from 'react';
import { Camera, Download, Layers, SlidersHorizontal, WifiOff } from 'lucide-react';
import type { InputSource, ReconMetrics } from '../types/recon';

interface TopHudProps {
  inputSource: InputSource;
  onChangeInputSource: (src: InputSource) => void;
  metrics: ReconMetrics;
  isOnline: boolean;
  isInstallable: boolean;
  isIOS: boolean;
  isInstalled: boolean;
  onInstallApp: () => void;
  onOpenScenarios: () => void;
}

function formatCompactCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export const TopHud: React.FC<TopHudProps> = ({
  inputSource,
  onChangeInputSource,
  metrics,
  isOnline,
  isInstallable,
  isIOS,
  isInstalled,
  onInstallApp,
  onOpenScenarios,
}) => {
  return (
    <header className="pointer-events-auto fixed top-0 left-0 right-0 z-20 pt-safe">
      <div className="mx-auto flex h-13 max-w-7xl items-center justify-between gap-3 border-b border-white/10 bg-[#0A0D12]/92 px-3 sm:px-5">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="flex items-center gap-4 min-w-0 shrink-0">
          <span className="text-[15px] font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
            3Drecon
          </span>

          {/* Quiet unboxed live telemetry on sm+ screens */}
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-mono-num whitespace-nowrap">
            <span className="text-teal-400 font-medium">{metrics.currentRoom}</span>
            <span aria-hidden="true">·</span>
            <span>{Math.round(metrics.fps)} FPS</span>
            <span aria-hidden="true">·</span>
            <span>{formatCompactCount(metrics.triangles)} üçgen</span>
            <span aria-hidden="true">·</span>
            <span>{metrics.processMs.toFixed(1)} ms</span>
            {!isOnline && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <WifiOff className="h-3 w-3" />
                  Çevrimdışı
                </span>
              </>
            )}
          </div>
        </div>

        {/* Zone 2: Clean Segmented Source Switch (3D Oda | Canlı Kamera) */}
        <div
          role="tablist"
          aria-label="Tarama Kaynağı"
          className="flex items-center gap-0.5 rounded-lg bg-[#141A24] p-0.5 border border-white/8 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={inputSource === 'spatial_lab'}
            onClick={() => onChangeInputSource('spatial_lab')}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              inputSource === 'spatial_lab'
                ? 'bg-teal-500/20 text-teal-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>3D Oda</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inputSource === 'live_camera'}
            onClick={() => onChangeInputSource('live_camera')}
            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              inputSource === 'live_camera'
                ? 'bg-teal-500/20 text-teal-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Kamera</span>
          </button>
        </div>

        {/* Zone 3: Single Primary Action (Install App / Scenarios) */}
        <div className="flex items-center gap-2 shrink-0">
          {!isInstalled && (isInstallable || isIOS) ? (
            <button
              type="button"
              onClick={onInstallApp}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400 active:scale-[0.98] transition whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Kur</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenScenarios}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#141A24] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#1B2330] active:scale-[0.98] transition whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-teal-400" />
              <span className="hidden sm:inline">Senaryolar</span>
              <span className="sm:hidden">Mod</span>
            </button>
          )}
        </div>
      </div>

      {/* Ultra-slim mobile-only telemetry line (unboxed, clean separators, stays inside 15% sticky cap) */}
      <div className="flex md:hidden items-center justify-between bg-[#0A0D12]/80 px-3 py-1 text-[11px] text-slate-400 font-mono-num border-b border-white/5">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-teal-400 font-medium">{metrics.currentRoom}</span>
          <span aria-hidden="true">·</span>
          <span>{formatCompactCount(metrics.triangles)} üçgen</span>
          <span aria-hidden="true">·</span>
          <span>{Math.round(metrics.fps)} FPS</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {metrics.macroActive && <span className="text-amber-300">Makro</span>}
          {!isOnline && <span className="text-amber-400">Çevrimdışı</span>}
        </div>
      </div>
    </header>
  );
};
