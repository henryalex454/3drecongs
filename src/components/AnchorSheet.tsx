import React, { useMemo, useState } from 'react';
import { Anchor, Compass, EyeOff, Pencil, Ruler, Trash2, X } from 'lucide-react';
import type { SpatialAnchor } from '../types/recon';

interface AnchorSheetProps {
  open: boolean;
  anchors: SpatialAnchor[];
  wallOcclusionEnabled: boolean;
  onClose: () => void;
  onFlyTo: (anchor: SpatialAnchor) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onAddNow: () => void;
}

function formatDistance(meters: number): string {
  if (meters < 0.65) return `${(meters * 100).toFixed(1)} cm`;
  return `${meters.toFixed(2)} m`;
}

export const AnchorSheet: React.FC<AnchorSheetProps> = ({
  open,
  anchors,
  wallOcclusionEnabled,
  onClose,
  onFlyTo,
  onRemove,
  onRename,
  onAddNow,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');

  // Pairwise 3D Euclidean distances between consecutive anchors for architectural/macro measurement
  const measurements = useMemo(() => {
    const pairs: {
      from: SpatialAnchor;
      to: SpatialAnchor;
      distM: number;
      deltaYM: number;
    }[] = [];
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1];
      const b = anchors[i];
      const dx = b.position[0] - a.position[0];
      const dy = b.position[1] - a.position[1];
      const dz = b.position[2] - a.position[2];
      pairs.push({
        from: a,
        to: b,
        distM: Math.hypot(dx, dy, dz),
        deltaYM: Math.abs(dy),
      });
    }
    return pairs;
  }, [anchors]);

  if (!open) return null;

  const commitRename = (id: string) => {
    const trimmed = draftLabel.trim();
    if (trimmed) onRename(id, trimmed);
    setEditingId(null);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[84vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/12 bg-[#11161F] pb-safe shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto my-2.5 h-1 w-10 rounded-full bg-slate-700 sm:hidden" />

        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-slate-50">
              Uzamsal Anchorlar ve 3D Ölçümler
            </h2>
            <p className="text-xs text-slate-400">
              Yüzey normaline kilitli · Duvar arkasında otomatik gizleme{' '}
              {wallOcclusionEnabled ? 'aktif' : 'kapalı'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-white/8 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {anchors.length === 0 ? (
            <div className="py-8 text-center">
              <Anchor className="mx-auto h-8 w-8 text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-200">
                Henüz yerleştirilmiş anchor yok
              </p>
              <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">
                Bir duvara, aynaya veya makro objeye nişan alıp anchor yerleştirin. İki anchor
                eklediğinizde aralarındaki gerçek 3D mesafe otomatik hesaplanır.
              </p>
              <button
                type="button"
                onClick={() => {
                  onAddNow();
                  onClose();
                }}
                className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400"
              >
                <Anchor className="h-4 w-4" />
                <span>Nişangaha Anchor Ekle</span>
              </button>
            </div>
          ) : (
            <>
              {/* Anchor List */}
              <div className="divide-y divide-white/8">
                {anchors.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      {editingId === a.id ? (
                        <input
                          type="text"
                          value={draftLabel}
                          autoFocus
                          onChange={(e) => setDraftLabel(e.target.value)}
                          onBlur={() => commitRename(a.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(a.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full rounded-lg border border-teal-400/50 bg-[#0A0D12] px-2.5 py-1 text-sm text-slate-100 outline-none"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-100">
                            {a.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(a.id);
                              setDraftLabel(a.label);
                            }}
                            aria-label="Yeniden adlandır"
                            className="p-1 text-slate-500 hover:text-slate-200"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 font-mono-num">
                        <span>{a.room}</span>
                        <span aria-hidden="true">·</span>
                        <span>{a.surfaceType}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDistance(a.distanceM)}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            a.occluded
                              ? 'inline-flex items-center gap-1 text-amber-400'
                              : 'text-teal-400'
                          }
                        >
                          {a.occluded && <EyeOff className="h-3 w-3" />}
                          {a.occluded
                            ? wallOcclusionEnabled
                              ? 'Duvar Arkasında (Gizli)'
                              : 'Duvar Arkasında (Sızıyor)'
                            : 'Görünür'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onFlyTo(a);
                          onClose();
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#18202E] px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-500/18"
                      >
                        <Compass className="h-3.5 w-3.5" />
                        <span>Git</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(a.id)}
                        aria-label="Anchor sil"
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-500/15 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pairwise 3D Measurements */}
              {measurements.length > 0 && (
                <div className="border-t border-white/8 pt-4">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <Ruler className="h-3.5 w-3.5 text-teal-400" />
                    <span>Anchorlar Arası 3D Mesafe Ölçümü</span>
                  </div>
                  <div className="space-y-2">
                    {measurements.map((m) => (
                      <div
                        key={`${m.from.id}-${m.to.id}`}
                        className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0C1018] px-3.5 py-2.5 text-xs"
                      >
                        <span className="truncate text-slate-300 pr-2">
                          {m.from.label} → {m.to.label}
                        </span>
                        <span className="font-mono-num font-semibold text-teal-300 whitespace-nowrap">
                          {formatDistance(m.distM)}
                          <span className="ml-2 text-slate-500 font-normal">
                            ΔY {formatDistance(m.deltaYM)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
