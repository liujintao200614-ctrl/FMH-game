import { Sparkles, TrendingUp, Star } from 'lucide-react';

export function Banner() {
  return (
    <section className="grid gap-6 lg:grid-cols-[1.6fr,0.8fr]">
      <div className="relative rounded-2xl border border-[#2a2a2a] bg-[#141414] p-8">
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#2a2a2a] text-[#cfcfcf] text-xs uppercase tracking-[0.25em]">
            <Sparkles size={16} />
            本周精选
          </div>
          <h2 className="text-4xl lg:text-5xl font-medium mt-5 text-[#f2f2f2]">极限挑战赛</h2>
          <p className="mt-4 text-[#a8a8a8] text-base leading-relaxed max-w-2xl">
            参加极限挑战赛赢取双倍游戏币奖励。挑战新关卡，展示你的街机技巧。
          </p>
          <div className="flex flex-wrap gap-4 mt-8">
            <button className="px-6 py-3 rounded-full bg-[#f2f2f2] text-[#0f0f0f] font-medium transition hover:bg-white">
              立即参与
            </button>
            <button className="px-6 py-3 rounded-full border border-[#2a2a2a] text-[#d2d2d2] hover:text-white transition">
              了解更多
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-4">
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1b1b1b] border border-[#2a2a2a] flex items-center justify-center">
              <TrendingUp className="text-[#cfcfcf]" size={20} />
            </div>
            <div>
              <p className="text-[#8f8f8f] text-sm">在线玩家</p>
              <p className="text-3xl font-medium text-[#f2f2f2]">12,458</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1b1b1b] border border-[#2a2a2a] flex items-center justify-center">
              <Star className="text-[#cfcfcf]" size={20} />
            </div>
            <div>
              <p className="text-[#8f8f8f] text-sm">今日奖池</p>
              <p className="text-3xl font-medium text-[#f2f2f2]">50,000</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
