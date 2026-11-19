import React from 'react';
import type { CrosshairProbe, EngineConfig, ReconMetrics } from '../types/recon';

interface CrosshairOverlayProps {
  probe: CrosshairProbe;
  config: EngineConfig;
  metrics: ReconMetrics;
  notice: string | null;
}

export const CrosshairOverlay: React.FC<CrosshairOverlayProps> = ({
  probe,
  config,
  metrics,
  notice,
}) => {
  const distText = !probe.valid
    ? 'Yüzey aranıyor'
    : probe.distanceM < 0.65
      ? `${Math.round(probe.distanceM * 100)} cm`
      : `${probe.distanceM.toFixed(2)} m`;

  const isMirrorWarn = probe.valid && probe.isMirror && !config.mirrorGuard;
  const isMirrorSealed = probe.valid && probe.isMirror && config.mirrorGuard;
  const isMacroLock = probe.valid && (probe.isMacro || config.macroMode) && probe.distanceM < 0.6;

  const reticleStroke = isMirrorWarn
    ? 'border-amber-400'
    : isMirrorSealed
      ? 'border-sky-400'
      : isMacroLock
        ? 'border-amber-300'
        : probe.valid
          ? 'border-teal-400'
          : 'border-slate-500/70';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
      {/* Transient Toast Notice (top-center, well clear of top HUD) */}
      {notice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 max-w-[90vw] rounded-xl border border-white/12 bg-[#0E131C]/95 px-4 py-2 text-center text-xs font-medium text-slate-100 shadow-lg">
          {notice}
        </div>
      )}

      {/* Subtle Room Occlusion Confirmation when walls hide other-room geometry */}
      {metrics.occludedChunks > 0 && config.wallOcclusion && (
        <div className="fixed left-3 top-20 hidden sm:block rounded-lg border border-white/10 bg-[#0A0D12]/88 px-2.5 py-1.5 text-[11px] text-slate-300 font-mono-num">
          Duvar oklüzyonu: {metrics.occludedChunks} parça
          {metrics.occludedAnchors > 0 ? ` · ${metrics.occludedAnchors} anchor gizli` : ' gizli'}
        </div>
      )}

      {/* Precision Optical Center Reticle */}
      <div className="relative flex flex-col items-center">
        <div className="relative h-10 w-10">
          <span className={`absolute left-0 top-0 h-2.5 w-2.5 border-l-2 border-t-2 ${reticleStroke}`} />
          <span className={`absolute right-0 top-0 h-2.5 w-2.5 border-r-2 border-t-2 ${reticleStroke}`} />
          <span className={`absolute left-0 bottom-0 h-2.5 w-2.5 border-l-2 border-b-2 ${reticleStroke}`} />
          <span className={`absolute right-0 bottom-0 h-2.5 w-2.5 border-r-2 border-b-2 ${reticleStroke}`} />
          <span
            className={`absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              isMirrorWarn
                ? 'bg-amber-400'
                : isMirrorSealed
                  ? 'bg-sky-400'
                  : probe.valid
                    ? 'bg-teal-400'
                    : 'bg-slate-500'
            }`}
          />
        </div>

        {/* Clean Unboxed Surface & Distance Readout */}
        <div className="mt-2 rounded-md bg-[#0A0D12]/82 px-2.5 py-1 text-[11px] font-medium text-slate-200 font-mono-num whitespace-nowrap border border-white/8">
          <span>{distText}</span>
          {probe.valid && (
            <>
              <span className="mx-1.5 text-slate-500" aria-hidden="true">·</span>
              <span
                className={
                  isMirrorWarn
                    ? 'text-amber-400'
                    : isMirrorSealed
                      ? 'text-sky-300'
                      : isMacroLock
                        ? 'text-amber-300'
                        : 'text-slate-300'
                }
              >
                {isMirrorWarn
                  ? 'Ayna Yansıma Hatası'
                  : isMirrorSealed
                    ? 'Ayna Düzlemi Kilitli'
                    : isMacroLock
                      ? 'Makro 5mm'
                      : probe.surfaceType}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
