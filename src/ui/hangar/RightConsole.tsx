export type TankModule = {
  name: string;
  bonus: string;
  color: string;
};

type RightConsoleProps = {
  modules: TankModule[];
};

export function RightConsole({ modules }: RightConsoleProps) {
  return (
    <div
      className="h-full flex flex-col gap-3 border-[3px] border-[#1c2430] bg-[#0f141c]/80 shadow-[0_6px_0_rgba(0,0,0,0.4)] p-3 relative overflow-hidden scale-90"
      style={{ clipPath: 'polygon(0 0, 92% 0, 100% 12%, 100% 100%, 8% 100%, 0 90%)' }}
    >
      <div className="absolute inset-0 opacity-08 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.04) 6px,transparent 6px,transparent 20px)] pointer-events-none" />
      <div className="flex items-center gap-2 text-xs text-[#f0b35c] font-mono tracking-[0.18em]">
        <span className="px-2 py-[2px] border border-[#5f3c11] bg-[#1a1208]">装备</span>
        配备清单
      </div>
      {modules.map((m) => (
        <div
          key={m.name}
          className="px-3 py-2 border-[3px] border-[#1c2430] bg-[#0f141c] relative overflow-hidden transition-all duration-300 ease-out"
          style={{ clipPath: 'polygon(6% 0, 100% 0, 100% 82%, 94% 100%, 0 100%, 0 18%)' }}
        >
          <div className="absolute inset-0 opacity-08 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.14),transparent_45%)] pointer-events-none" />
          <div className="flex items-center justify-between text-xs text-[#e8edf5] transition-all duration-300 ease-out">
            <span>{m.name}</span>
            <span className="text-[#f0b35c]">{m.bonus}</span>
          </div>
          <div className="mt-2 h-2 rounded-sm transition-all duration-300 ease-out" style={{ background: m.color }} />
        </div>
      ))}
    </div>
  );
}
