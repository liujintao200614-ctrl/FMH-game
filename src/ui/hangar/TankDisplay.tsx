type TankDisplayProps = {
  imageSrc: string;
  label?: string;
  name?: string;
  desc?: string;
};

export function TankDisplay({ imageSrc, label, name, desc }: TankDisplayProps) {
  return (
    <div className="relative w-full min-h-[460px] flex flex-col items-center gap-4">
      {/* 名称牌（小框） */}
      <div className="px-5 py-2 bg-[#101722]/90 border-[3px] border-[#1f2a36] shadow-[0_6px_0_rgba(0,0,0,0.45)] rounded-sm text-center">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#f0b35c]">
          {label || '型号'}
        </div>
        <div className="text-lg font-bold text-white mt-[2px]">{name || '坦克型号'}</div>
      </div>

      {/* 展示台区域 */}
      <div className="relative w-full min-h-[320px]">
        {/* 展示屏：显示坦克立绘 */}
        <div className="relative mx-auto w-72 h-52 flex items-center justify-center" style={{ transform: 'translateY(-4px)' }}>
          <img
            src={imageSrc}
            alt="Tank preview"
            className="max-h-full max-w-full object-contain drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]"
          />
        </div>
      </div>

      {/* 介绍牌（大框） */}
      <div className="w-full max-w-3xl px-5 py-4 bg-[#0f1620]/85 border-[3px] border-[#1f2a36] shadow-[0_8px_0_rgba(0,0,0,0.45)] rounded-sm">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#f0b35c] mb-1">
          战术简报
        </div>
        <div className="text-sm text-[#e8edf5] leading-relaxed">
          {desc || '选择左侧型号以查看坦克简介与性能侧重。'}
        </div>
      </div>
    </div>
  );
}
