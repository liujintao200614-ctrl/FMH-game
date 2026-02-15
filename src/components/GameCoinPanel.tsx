import { Coins, TrendingUp, Plus, Calendar } from 'lucide-react';

interface GameCoinPanelProps {
  balance: number;
  delta: number;
}

export function GameCoinPanel({ balance, delta }: GameCoinPanelProps) {
  const deltaPositive = delta >= 0;

  return (
    <section className="rounded-2xl bg-[#141414] border border-[#2a2a2a] p-6 text-white space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#1b1b1b] border border-[#2a2a2a] flex items-center justify-center">
          <Coins />
        </div>
        <div>
          <p className="text-sm text-[#8f8f8f]">GameCoin</p>
          <p className="text-lg font-medium">当前余额</p>
        </div>
      </div>

      <div className="bg-[#121212] rounded-xl p-5 border border-[#2a2a2a]">
        <p className="text-sm text-[#8f8f8f]">余额</p>
        <p className="text-4xl font-medium mt-1">{balance.toLocaleString()} 币</p>
        <div className={`mt-2 flex items-center gap-2 text-sm ${deltaPositive ? 'text-[#b6f2c0]' : 'text-[#f2b6b6]'}`}>
          <TrendingUp size={16} />
          本周 {deltaPositive ? '+' : '-'}
          {Math.abs(delta).toLocaleString()}
        </div>
      </div>

      <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-black font-medium">
        <Plus size={18} />
        购买游戏币
      </button>

      <button className="w-full flex items-center justify-between py-3 px-4 rounded-xl border border-[#2a2a2a] text-[#cfcfcf] hover:border-[#3a3a3a] transition">
        <div className="flex items-center gap-2">
          <Calendar size={18} />
          每日签到
        </div>
        <span className="text-[#d2d2d2] font-medium">+100</span>
      </button>

      <div className="grid grid-cols-2 gap-4 text-sm text-[#cfcfcf]">
        <div className="rounded-xl border border-[#2a2a2a] bg-[#121212] p-4">
          <p className="uppercase text-[10px] tracking-[0.3em] text-[#8f8f8f]">本月消费</p>
          <p className="text-2xl font-medium text-white mt-2">8,500</p>
        </div>
        <div className="rounded-xl border border-[#2a2a2a] bg-[#121212] p-4">
          <p className="uppercase text-[10px] tracking-[0.3em] text-[#8f8f8f]">本月获得</p>
          <p className="text-2xl font-medium text-white mt-2">10,840</p>
        </div>
      </div>
    </section>
  );
}
