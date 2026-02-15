import { MapInfo } from './maps';

type MapCardProps = {
  map: MapInfo;
  active: boolean;
  onSelect: (map: MapInfo) => void;
};

export function MapCard({ map, active, onSelect }: MapCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(map)}
      className={`relative text-left p-4 h-48 bg-[#0f1620]/85 border-2 ${
        active ? 'border-[#ff5a3c] shadow-[0_0_20px_rgba(255,90,60,0.3)]' : 'border-[#2c3a4a]'
      } text-white flex flex-col justify-between transition`}
      style={{ clipPath: 'polygon(6% 0,94% 0,100% 12%,100% 88%,94% 100%,6% 100%,0 88%,0 12%)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#ffb347] font-semibold">{map.theme}</span>
        <span className="text-[10px] px-2 py-1 bg-[#1a2532] border border-[#2f3d4f]">
          {map.size} / {map.difficulty}
        </span>
      </div>
      <div>
        <div className="text-xl font-bold flex items-center gap-2">{map.name}</div>
        <div className="text-sm text-gray-200 mt-1 line-clamp-2">{map.summary}</div>
        {map.features && (
          <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-[#9bb3d4]">
            {map.features.map((f) => (
              <span key={f} className="px-2 py-[2px] bg-[#122133] border border-[#22354b] rounded-sm">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="h-1 bg-[#1f2b3a]">
        <div
          className="h-full bg-gradient-to-r from-[#ff5a3c] to-[#ffb347]"
          style={{ width: active ? '100%' : '40%' }}
        />
      </div>
    </button>
  );
}
