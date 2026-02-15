import { useMemo, useState } from 'react';
import { MapCard } from './MapCard';
import { MapPreviewPanel } from './MapPreviewPanel';
import { maps, MapInfo } from './maps';

export type TankDifficulty = 'easy' | 'normal' | 'hard';

type MapSelectPageProps = {
  onBack?: () => void;
  onStart?: (map: MapInfo, difficulty: TankDifficulty) => void;
  initialDifficulty?: TankDifficulty;
};

const difficultyOptions: Array<{ key: TankDifficulty; label: string; hint: string }> = [
  { key: 'easy', label: '简单', hint: 'AI运营慢，压迫低' },
  { key: 'normal', label: '标准', hint: '均衡节奏' },
  { key: 'hard', label: '困难', hint: 'AI运营快，进攻强' }
];

export function MapSelectPage({ onBack, onStart, initialDifficulty = 'normal' }: MapSelectPageProps) {
  const [selectedKey, setSelectedKey] = useState<string>(maps[0]?.key ?? '');
  const [difficulty, setDifficulty] = useState<TankDifficulty>(initialDifficulty);
  const selected = useMemo(() => maps.find((m) => m.key === selectedKey) ?? null, [selectedKey]);

  const handleStart = (map: MapInfo) => {
    if (onStart) onStart(map, difficulty);
    // 默认回退逻辑留给父组件处理（例如切换 hash 或进入场景）
  };

  return (
    <div
      className="min-h-screen w-full text-white relative overflow-hidden"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(8,10,14,0.65) 0%,rgba(8,10,14,0.45) 35%,rgba(8,10,14,0.65) 100%), url('/images/hangar-main.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute top-0 inset-x-0 h-14 px-6 flex items-center justify-between text-sm bg-black/30 backdrop-blur-[2px] z-20">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1 bg-[#101722] border-2 border-[#f66] text-[#f66] font-semibold tracking-wide"
            >
              返回
            </button>
          )}
          <div className="px-3 py-1 bg-[#0f1620] border-2 border-[#32404f] text-gray-200">
            选择地图 · 确认后直接开战
          </div>
        </div>
        <div className="text-xs text-gray-200">地图数量：{maps.length}</div>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 pt-20 pb-16 flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:hidden mb-1">
          <div className="flex items-center gap-2 bg-[#0e1622]/75 border border-[#2c3a4a] p-2">
            {difficultyOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDifficulty(opt.key)}
                className={`flex-1 px-3 py-2 text-sm border transition ${
                  difficulty === opt.key
                    ? 'border-[#5bd1ff] bg-[#0f2238] text-white'
                    : 'border-[#2b3a4b] bg-[#0c1420] text-[#9bb3d4] hover:text-white'
                }`}
                title={opt.hint}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {maps.length === 0 ? (
          <div className="w-full text-center text-gray-300 bg-black/30 border border-[#2c3a4a] p-6 rounded-md">
            暂无可用地图，请先创建或导入地图配置。
          </div>
        ) : (
          <>
            <div className="flex-1">
              <div className="hidden lg:flex items-center gap-2 mb-4 bg-[#0e1622]/75 border border-[#2c3a4a] p-2">
                {difficultyOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDifficulty(opt.key)}
                    className={`px-4 py-2 text-sm border transition ${
                      difficulty === opt.key
                        ? 'border-[#5bd1ff] bg-[#0f2238] text-white'
                        : 'border-[#2b3a4b] bg-[#0c1420] text-[#9bb3d4] hover:text-white'
                    }`}
                    title={opt.hint}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
              {maps.map((map) => (
                <MapCard key={map.key} map={map} active={selected?.key === map.key} onSelect={(m) => setSelectedKey(m.key)} />
              ))}
            </div>
            </div>
            {selected && (
              <MapPreviewPanel
                map={selected}
                onStart={handleStart}
                onBack={onBack}
                difficultyLabel={difficultyOptions.find((opt) => opt.key === difficulty)?.label}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
