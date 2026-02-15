import { MapInfo } from './maps';

type MapPreviewPanelProps = {
  map: MapInfo;
  onStart: (map: MapInfo) => void;
  onBack?: () => void;
  difficultyLabel?: string;
};

export function MapPreviewPanel({ map, onStart, onBack, difficultyLabel }: MapPreviewPanelProps) {
  return (
    <div className="w-full lg:w-1/3 bg-[#0d131d]/90 border border-[#2c3a4a] rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between text-sm text-gray-200">
        <span>地图详情</span>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-xs px-2 py-1 border border-[#2c3a4a] bg-[#101a28] hover:border-[#ff5a3c] transition"
          >
            返回
          </button>
        )}
      </div>
      <div className="w-full h-40 bg-[#111927] border border-[#1f2b3a] overflow-hidden flex items-center justify-center">
        {map.thumbnail ? (
          <img
            src={map.thumbnail}
            alt={map.name}
            className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.currentTarget;
                target.onerror = null;
                target.src = '/images/hangar-main.jpg';
              }}
            />
        ) : (
          <div className="text-gray-500 text-sm">暂无预览</div>
        )}
      </div>
      <div>
        <div className="text-lg font-semibold text-white">{map.name}</div>
        <div className="text-sm text-[#9bb3d4]">
          {map.theme} · {map.size} · {map.difficulty}
        </div>
        <div className="text-sm text-gray-200 mt-2">{map.summary}</div>
        {map.recommendedMode && (
          <div className="text-xs text-[#ffb347] mt-2">推荐模式：{map.recommendedMode}</div>
        )}
        {difficultyLabel && (
          <div className="text-xs text-[#8ee3ff] mt-1">AI难度：{difficultyLabel}</div>
        )}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onStart(map)}
          className="flex-1 bg-[#d91e2c] text-white font-semibold py-2 border-2 border-[#5a0f14] tracking-wide"
        >
          开始战斗
        </button>
      </div>
    </div>
  );
}
