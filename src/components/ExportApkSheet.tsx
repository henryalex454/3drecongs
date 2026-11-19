import React, { useState } from 'react';
import { Check, Code2, Download, FileBox, Smartphone, Wifi, WifiOff, X } from 'lucide-react';
import type { EngineConfig, ReconMetrics } from '../types/recon';

interface ExportApkSheetProps {
  open: boolean;
  metrics: ReconMetrics;
  anchorCount: number;
  config: EngineConfig;
  isOnline: boolean;
  isInstallable: boolean;
  isIOS: boolean;
  isInstalled: boolean;
  onInstallApp: () => Promise<boolean>;
  onExportOBJ: () => void;
  onExportPLY: () => void;
  onExportAndroidKit: () => void;
  onClose: () => void;
}

export const ExportApkSheet: React.FC<ExportApkSheetProps> = ({
  open,
  metrics,
  anchorCount,
  isOnline,
  isInstallable,
  isIOS,
  isInstalled,
  onInstallApp,
  onExportOBJ,
  onExportPLY,
  onExportAndroidKit,
  onClose,
}) => {
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (!open) return null;

  const hasMesh = metrics.triangles > 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[86vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/12 bg-[#11161F] pb-safe shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto my-2.5 h-1 w-10 rounded-full bg-slate-700 sm:hidden" />

        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-slate-50">
              3D Mesh Dışa Aktar & Android APK
            </h2>
            <p className="text-xs text-slate-400">
              Pürüzsüzleştirilmiş geometri, C++/GLSL v3.0 yaması ve mobil kurulum
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

        <div className="space-y-5 p-5">
          {/* Tabular Mesh Summary */}
          <div className="grid grid-cols-4 gap-2 border-b border-white/8 pb-4 text-center font-mono-num">
            <div>
              <div className="text-base font-semibold text-teal-400">
                {metrics.triangles.toLocaleString('tr-TR')}
              </div>
              <div className="text-[11px] text-slate-400">Üçgen</div>
            </div>
            <div>
              <div className="text-base font-semibold text-slate-100">
                {metrics.vertices.toLocaleString('tr-TR')}
              </div>
              <div className="text-[11px] text-slate-400">Köşe</div>
            </div>
            <div>
              <div className="text-base font-semibold text-slate-100">{metrics.chunks}</div>
              <div className="text-[11px] text-slate-400">Blok</div>
            </div>
            <div>
              <div className="text-base font-semibold text-slate-100">{anchorCount}</div>
              <div className="text-[11px] text-slate-400">Anchor</div>
            </div>
          </div>

          {/* 3D Mesh Downloads */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300">3D Geometri Çıktıları</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!hasMesh}
                onClick={onExportOBJ}
                className="flex min-h-[52px] items-center justify-between rounded-xl border border-white/10 bg-[#161D2A] px-4 py-3 text-left hover:border-teal-400/50 disabled:opacity-45 transition"
              >
                <div className="flex items-center gap-3">
                  <FileBox className="h-5 w-5 text-teal-400 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Wavefront .OBJ</div>
                    <div className="text-[11px] text-slate-400">Pürüzsüz normalli mesh</div>
                  </div>
                </div>
                <Download className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                disabled={!hasMesh}
                onClick={onExportPLY}
                className="flex min-h-[52px] items-center justify-between rounded-xl border border-white/10 bg-[#161D2A] px-4 py-3 text-left hover:border-teal-400/50 disabled:opacity-45 transition"
              >
                <div className="flex items-center gap-3">
                  <FileBox className="h-5 w-5 text-sky-400 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Stanford .PLY</div>
                    <div className="text-[11px] text-slate-400">Renkli yüzey & derinlik</div>
                  </div>
                </div>
                <Download className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Android Native C++/GLSL v3.0 Patch + Capacitor APK Bundle */}
          <div className="space-y-2 border-t border-white/8 pt-4">
            <h3 className="text-xs font-semibold text-slate-300">
              Android APK & iskenderozkul/3Drecon v3.0 Yaması
            </h3>
            <button
              type="button"
              onClick={onExportAndroidKit}
              className="flex min-h-[56px] w-full items-center justify-between rounded-xl border border-teal-500/35 bg-teal-500/10 px-4 py-3 text-left hover:bg-teal-500/16 transition"
            >
              <div className="flex items-center gap-3">
                <Code2 className="h-5 w-5 text-teal-300 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    v3.0 C++ / GLSL Oklüzyon + APK Paket Kiti İndir
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Taubin C++ motoru, ARCore duvar oklüzyon shader ve Capacitor APK yapılandırması
                  </div>
                </div>
              </div>
              <Download className="h-4 w-4 text-teal-300 shrink-0" />
            </button>
          </div>

          {/* Mobile App Installability (PWA / Standalone Android & iOS) */}
          <div className="space-y-3 border-t border-white/8 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Smartphone className="h-4 w-4 text-teal-400" />
                <span>Telefon Uygulaması Kurulumu (PWA / APK Modu)</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                {isOnline ? (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-teal-400" />
                    Çevrimdışı önbellek hazır
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                    Çevrimdışı modda çalışıyor
                  </>
                )}
              </span>
            </div>

            {isInstalled ? (
              <div className="flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 py-2.5 text-xs text-teal-200">
                <Check className="h-4 w-4 shrink-0" />
                <span>Uygulama cihazınızda tam ekran (standalone) modda kurulu çalışıyor.</span>
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={() => void onInstallApp()}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-teal-400 transition"
              >
                <Download className="h-4 w-4" />
                <span>Telefona Uygulama Olarak Kur</span>
              </button>
            ) : isIOS ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowIOSGuide((v) => !v)}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-[#161D2A] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-[#1E2738]"
                >
                  <span>iOS Safari Ana Ekrana Ekleme Rehberi</span>
                </button>
                {showIOSGuide && (
                  <p className="rounded-xl bg-[#0B0F17] p-3 text-xs leading-relaxed text-slate-300 border border-white/8">
                    1. Safari alt çubuğundaki <strong>Paylaş</strong> simgesine dokunun.
                    <br />
                    2. Aşağı kaydırıp <strong>Ana Ekrana Ekle</strong> seçeneğini onaylayın.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-slate-400">
                Android Chrome menüsünden <strong>“Uygulamayı yükle”</strong> seçerek tam ekran
                uygulama olarak kurabilir veya yukarıdaki Capacitor APK paketiyle imzalı{' '}
                <code>.apk</code> derleyebilirsiniz.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
