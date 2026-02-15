import React from 'react';
export type TankStat = { label: string; value: number; max?: number };

type LeftConsoleProps = {
  stats: TankStat[];
};

export function LeftConsole({ stats }: LeftConsoleProps) {
  return (
    <div
      className="h-full flex flex-col gap-3 border-[3px] border-[#1c2430] bg-[#0f141c]/80 shadow-[0_6px_0_rgba(0,0,0,0.4)] p-3 relative overflow-hidden scale-90"
      style={{ clipPath: 'polygon(10% 0, 100% 0, 100% 90%, 92% 100%, 0 100%, 0 10%)' }}
    >
      <div className="absolute inset-0 opacity-08 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.04) 6px,transparent 6px,transparent 20px)] pointer-events-none" />
      <div className="flex items-center gap-2 text-xs text-[#f0b35c] font-mono tracking-[0.18em]">
        <span className="px-2 py-[2px] border border-[#5f3c11] bg-[#1a1208]">状态</span>
        坦克属性
      </div>
      {stats.map((s) => (
        <button
          key={s.label}
          className={[
            'w-full text-left px-3 py-3 border-[3px] transition-all duration-300 ease-out relative overflow-hidden',
            'border-[#1c2430] bg-[#0f141c] hover:border-[#d91e2c]'
          ].join(' ')}
          style={{ clipPath: 'polygon(6% 0, 100% 0, 100% 82%, 94% 100%, 0 100%, 0 18%)' }}
        >
          <div className="absolute inset-0 opacity-06 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_45%)] pointer-events-none" />
          <div className="flex items-center justify-between text-sm text-[#e8edf5] font-semibold transition-all duration-300 ease-out">
            <span>{s.label}</span>
            <span className="text-[10px] text-[#f0b35c] font-mono">{s.value}</span>
          </div>
          <div className="w-full h-2 mt-2 bg-[#1a2028] border border-[#2b323a] relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-in-out"
              style={{
                width: `${Math.min(100, (s.value / (s.max || 1000)) * 100)}%`,
                background: '#d91e2c',
                transition: 'width 0.5s ease-in-out'
              }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}
