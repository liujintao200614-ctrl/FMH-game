import { Activity, Sparkles } from 'lucide-react';
import type { GameEventPayload } from '../hooks/useGameEvents';

interface GameEventsPanelProps {
  events: GameEventPayload[];
}

export function GameEventsPanel({ events }: GameEventsPanelProps) {
  return (
    <section className="rounded-2xl bg-[#141414] border border-[#2a2a2a] p-6 text-white space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Activity size={18} />
          <div>
            <p className="text-sm text-[#8f8f8f]">实时事件</p>
            <p className="font-medium">游戏事件播报</p>
          </div>
        </div>
        <div className="px-3 py-1 rounded-full bg-[#1b1b1b] border border-[#2a2a2a] text-[10px] uppercase tracking-[0.2em] text-[#bdbdbd]">
          gameEvent
        </div>
      </div>

      <div className="space-y-2 text-sm text-[#cfcfcf] max-h-56 overflow-auto">
        {events.length === 0 && <p className="text-[#8f8f8f]">暂无事件，完成一局试试。</p>}
        {events.map((e, idx) => (
          <div
            key={`${e.game}-${idx}`}
            className="flex items-center justify-between rounded-xl border border-[#2a2a2a] bg-[#121212] px-3 py-2"
          >
            <div>
              <p className="text-white font-medium">{e.game}</p>
              <p className="text-xs text-[#8f8f8f]">
                难度 {e.difficulty ?? '--'} | {e.result === 'win' ? '胜利' : '失败'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {e.result === 'win' ? (
                <span className="px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#cfcfcf] text-xs">
                  +{e.score ?? 0}
                </span>
              ) : (
                <span className="px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#8f8f8f] text-xs">
                  再接再厉
                </span>
              )}
              <Sparkles size={16} className="text-[#8f8f8f]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
