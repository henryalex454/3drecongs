import React from 'react';
import { Building2, Focus, Ruler, Sparkles, X } from 'lucide-react';
import type {
  EngineConfig,
  MeshAlgorithm,
  RenderMode,
  ResolutionPreset,
  RoomPresetId,
} from '../types/recon';

export interface WorkflowScenario {
  id: string;
  title: string;
  summary: string;
  preset: RoomPresetId;
  renderMode: RenderMode;
  configPatch: Partial<EngineConfig>;
  icon: React.ReactNode;
}

export const WORKFLOW_SCENARIOS: WorkflowScenario[] = [
  {
    id: 'multi_room',
    title: 'Çoklu Oda & Duvar Oklüzyonu',
    summary: 'Tek parça TSDF hacmi ile Oda 1’den Oda 2’ye geçin; duvar arkasından sızma olmaz.',
    preset: 'room_a',
    renderMode: 'ar_overlay',
    configPatch: {
      meshAlgorithm: 'surface_nets',
      wallOcclusion: true,
      mirrorGuard: true,
      macroMode: false,
      taubinPasses: 3,
      resolution: 'balanced_6cm',
    },
    icon: <Building2 className="h-4 w-4 text-teal-400" />,
  },
  {
    id: 'mirror_guard',
    title: 'Aynalı & Parlak Yüzey Tarama',
    summary: 'Yansıyan sanal oda derinliğini reddedip ayna düzlemini çerçeveye kilitler.',
    preset: 'mirror_wall',
    renderMode: 'ar_wire',
    configPatch: {
      meshAlgorithm: 'surface_nets',
      wallOcclusion: true,
      mirrorGuard: true,
      macroMode: false,
      taubinPasses: 4,
      resolution: 'balanced_6cm',
    },
    icon: <Sparkles className="h-4 w-4 text-sky-400" />,
  },
  {
    id: 'macro_15mm',
    title: 'Makro Yakın Çekim (8–45 cm)',
    summary: '1.5 cm ince TSDF voxel ve yakın alan derinlik kapısı ile küçük obje detaylarını çıkarır.',
    preset: 'macro_desk',
    renderMode: 'smooth_mesh',
    configPatch: {
      meshAlgorithm: 'surface_nets',
      wallOcclusion: true,
      mirrorGuard: true,
      macroMode: true,
      taubinPasses: 2,
      resolution: 'macro_15mm',
    },
    icon: <Focus className="h-4 w-4 text-amber-400" />,
  },
  {
    id: 'measure_anchor',
    title: 'Ölçüm & Anchor Planlama',
    summary: 'Yüzeye kilitli anchorlar yerleştirip gerçek 3D mesafe ve kot farkı ölçer.',
    preset: 'doorway',
    renderMode: 'ar_overlay',
    configPatch: {
      meshAlgorithm: 'surface_nets',
      wallOcclusion: true,
      mirrorGuard: true,
      macroMode: false,
      taubinPasses: 3,
      resolution: 'balanced_6cm',
    },
    icon: <Ruler className="h-4 w-4 text-teal-300" />,
  },
];

interface ScenarioSettingsSheetProps {
  open: boolean;
  config: EngineConfig;
  activeScenarioId: string;
  onClose: () => void;
  onApplyScenario: (scenario: WorkflowScenario) => void;
  onChangeConfig: (patch: Partial<EngineConfig>) => void;
}

export const ScenarioSettingsSheet: React.FC<ScenarioSettingsSheetProps> = ({
  open,
  config,
  activeScenarioId,
  onClose,
  onApplyScenario,
  onChangeConfig,
}) => {
  if (!open) return null;

  const resolutions: { id: ResolutionPreset; label: string }[] = [
    { id: 'fast_9cm', label: 'Hızlı 9cm' },
    { id: 'balanced_6cm', label: 'Dengeli 6cm' },
    { id: 'fine_35mm', label: 'İnce 3.5cm' },
    { id: 'macro_15mm', label: 'Makro 1.5cm' },
  ];

  const algorithms: { id: MeshAlgorithm; label: string; desc: string }[] = [
    {
      id: 'surface_nets',
      label: 'Surface Nets (Pürüzsüz)',
      desc: 'Paylaşımlı köşe + Taubin yumuşatma, su geçirmez tek parça yüzey',
    },
    {
      id: 'faceted_mc',
      label: 'Bloklu MC (Ham İzo-Yüzey)',
      desc: 'Yumuşatmasız düz üçgenler, ham TSDF hassasiyeti doğrulaması',
    },
  ];

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
              Tarama Senaryoları ve TSDF Motor Ayarları
            </h2>
            <p className="text-xs text-slate-400">
              Tek hacimli TSDF voxel füzyonu, meshleme türü, duvar oklüzyonu ve makro derinlik
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

        <div className="space-y-6 p-5">
          {/* Section 1: 1-Tap Real-World Usage Scenarios */}
          <div>
            <h3 className="mb-2.5 text-xs font-semibold text-slate-300">
              Hazır Kullanım Senaryoları
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {WORKFLOW_SCENARIOS.map((sc) => {
                const selected = activeScenarioId === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => onApplyScenario(sc)}
                    className={`flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition ${
                      selected
                        ? 'border-teal-400/60 bg-teal-500/10'
                        : 'border-white/8 bg-[#161D2A] hover:border-white/18'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                      {sc.icon}
                      <span>{sc.title}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-400">{sc.summary}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Meshing Algorithm & Resolution */}
          <div className="space-y-4 border-t border-white/8 pt-4">
            <h3 className="text-xs font-semibold text-slate-300">
              TSDF Meshleme Türü ve Çözünürlük
            </h3>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {algorithms.map((alg) => {
                const active = config.meshAlgorithm === alg.id;
                return (
                  <button
                    key={alg.id}
                    type="button"
                    onClick={() => onChangeConfig({ meshAlgorithm: alg.id })}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-teal-400/60 bg-teal-500/12'
                        : 'border-white/8 bg-[#161D2A] hover:border-white/18'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-100">{alg.label}</div>
                    <div className="mt-1 text-[11px] leading-snug text-slate-400">{alg.desc}</div>
                  </button>
                );
              })}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-300">TSDF Voxel Boyutu</span>
                <span className="font-mono-num text-teal-400">
                  {resolutions.find((r) => r.id === config.resolution)?.label}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-xl bg-[#0B0F17] p-1 border border-white/8">
                {resolutions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      onChangeConfig({
                        resolution: r.id,
                        macroMode: r.id === 'macro_15mm' ? true : config.macroMode,
                      })
                    }
                    className={`min-h-[38px] rounded-lg text-xs font-medium transition ${
                      config.resolution === r.id
                        ? 'bg-teal-500/20 text-teal-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-300">Taubin Pürüzsüzleştirme (λ/μ)</span>
                <span className="font-mono-num text-teal-400">{config.taubinPasses} geçiş</span>
              </div>
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                value={config.taubinPasses}
                onChange={(e) => onChangeConfig({ taubinPasses: Number(e.target.value) })}
                className="recon-slider w-full"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-300">AR Yüzey Opaklığı</span>
                <span className="font-mono-num text-teal-400">
                  {Math.round(config.meshOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.25}
                max={1}
                step={0.05}
                value={config.meshOpacity}
                onChange={(e) => onChangeConfig({ meshOpacity: Number(e.target.value) })}
                className="recon-slider w-full"
              />
            </div>
          </div>

          {/* Section 3: Core Protections */}
          <div className="space-y-2 border-t border-white/8 pt-4">
            <h3 className="mb-2 text-xs font-semibold text-slate-300">
              Derinlik ve Geometri Korumaları
            </h3>

            {[
              {
                key: 'wallOcclusion' as const,
                title: 'Duvar Oklüzyonu (Yan Oda Koruması)',
                desc: 'Yan odaya geçildiğinde önceki odanın mesh ve anchorlarını duvar arkasında gizler.',
                value: config.wallOcclusion,
              },
              {
                key: 'mirrorGuard' as const,
                title: 'Aynalı Yüzey Koruma (Mirror Guard)',
                desc: 'Ayna ve parlak camlardaki sahte derinliği çerçeve düzlemine kilitler.',
                value: config.mirrorGuard,
              },
              {
                key: 'macroMode' as const,
                title: 'Makro Modu (8–45 cm Yakın Çekim)',
                desc: 'Minimum derinlik eşiğini 25 cm yerine 8 cm’ye indirir ve mikro detay açar.',
                value: config.macroMode,
              },
              {
                key: 'showPip' as const,
                title: 'Canlı Derinlik & Ayna PiP Önizleme',
                desc: 'Sağ üstte canlı ters-derinlik ısı haritası ve ayna maskesini gösterir.',
                value: config.showPip,
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex min-h-[54px] items-center justify-between gap-4 border-b border-white/6 py-2.5 last:border-b-0"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100">{item.title}</div>
                  <div className="text-xs text-slate-400">{item.desc}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.value}
                  onClick={() => onChangeConfig({ [item.key]: !item.value })}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    item.value ? 'bg-teal-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      item.value ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
