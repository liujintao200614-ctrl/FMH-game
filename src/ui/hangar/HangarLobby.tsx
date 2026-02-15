import { useState } from 'react';
import { LeftConsole, TankStat } from './LeftConsole';
import { RightConsole, TankModule } from './RightConsole';
import { TankDisplay } from './TankDisplay';
import { MetalButton } from './MetalButton';

type HangarLobbyProps = {
  onClose?: () => void;
  onSelectTank?: (tank: { key: TankKey; label: string; image: string; name: string; desc: string }) => void;
};

type TankKey = 'light' | 'mid' | 'heavy';

const statsMap: Record<TankKey, TankStat[]> = {
  light: [
    { label: '装甲', value: 520, max: 1000 },
    { label: '火力', value: 620, max: 1000 },
    { label: '射速', value: 820, max: 1000 },
    { label: '机动', value: 920, max: 1000 },
    { label: '视野', value: 840, max: 1000 }
  ],
  mid: [
    { label: '装甲', value: 780, max: 1000 },
    { label: '火力', value: 720, max: 1000 },
    { label: '射速', value: 700, max: 1000 },
    { label: '机动', value: 700, max: 1000 },
    { label: '视野', value: 680, max: 1000 }
  ],
  heavy: [
    { label: '装甲', value: 950, max: 1000 },
    { label: '火力', value: 900, max: 1000 },
    { label: '射速', value: 580, max: 1000 },
    { label: '机动', value: 520, max: 1000 },
    { label: '视野', value: 640, max: 1000 }
  ]
};

const moduleMap: Record<TankKey, TankModule[]> = {
  light: [
    { name: '主炮 · 轻速炮', bonus: '+12% 射速', color: '#d91e2c' },
    { name: '副武 · EMP 闪光', bonus: '+10% 控场', color: '#f0b35c' },
    { name: '传感 · 鹰眼', bonus: '+15% 视野', color: '#8fd1ff' },
    { name: '引擎 · 高转速', bonus: '+14% 机动', color: '#6bd45f' }
  ],
  mid: [
    { name: '主炮 · 磁轨', bonus: '+15% 火力', color: '#d91e2c' },
    { name: '副武 · 火箭巢', bonus: '+12% 爆破', color: '#f0b35c' },
    { name: '装甲 · 复合层', bonus: '+10% 防护', color: '#8fd1ff' },
    { name: '引擎 · 均衡驱动', bonus: '+8% 机动', color: '#6bd45f' }
  ],
  heavy: [
    { name: '主炮 · 双管高爆', bonus: '+18% 火力', color: '#d91e2c' },
    { name: '副武 · 重型榴弹', bonus: '+15% 爆破', color: '#f0b35c' },
    { name: '装甲 · 钨钢', bonus: '+18% 防护', color: '#8fd1ff' },
    { name: '引擎 · 重载驱动', bonus: '+6% 稳定', color: '#6bd45f' }
  ]
};

export function HangarLobby({ onClose, onSelectTank }: HangarLobbyProps) {
  const models: { key: TankKey; label: string; image: string; name: string; desc: string }[] = [
    {
      key: 'light',
      label: '轻型',
      image: '/images/tanks/tank-light.svg',
      name: '轻型侦察',
      desc: '轻型侦察车 · 高机动，护甲薄，适合快速迂回与视野探测。'
    },
    {
      key: 'mid',
      label: '中型',
      image: '/images/tanks/tank-mid.svg',
      name: '中型主战',
      desc: '中型主战 · 均衡火力与防护，主炮稳定输出，适合大多数场景。'
    },
    {
      key: 'heavy',
      label: '重型',
      image: '/images/tanks/tank-heavy.svg',
      name: '重型突击',
      desc: '重型突击 · 厚重装甲，双管短炮高爆发，机动较慢但耐打。'
    }
  ];
  const [current, setCurrent] = useState(models[1]);

  return (
    <div
      className="min-h-screen w-full text-white relative overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg,#0a0d12 0%,#0c1016 35%,#0a0d12 100%), radial-gradient(circle at 20% 15%,rgba(255,255,255,0.05),transparent 32%), radial-gradient(circle at 80% 85%,rgba(255,255,255,0.04),transparent 38%)'
      }}
    >
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src="/videos/hangar.mp4"
        autoPlay
        muted
        loop
        playsInline
      />

      {/* 覆盖层：吊轨与光条 */}
      <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent)] opacity-70 pointer-events-none" />
      <div className="absolute inset-0 opacity-15 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.04) 10px,transparent 10px,transparent 26px)] pointer-events-none" />
      <div className="absolute inset-0 opacity-12 bg-[linear-gradient(120deg,transparent 0%,transparent 45%,rgba(255,255,255,0.08) 50%,transparent 55%,transparent 100%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle at 50% 60%,rgba(255,255,255,0.08),transparent 45%)] opacity-18 pointer-events-none" />

      {/* 顶部返回到模式页 */}
      <div className="absolute top-0 inset-x-0 h-14 px-6 flex items-center justify-between text-sm bg-black/25 backdrop-blur-[2px] z-30">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 bg-[#101722] border-2 border-[#f66] text-[#f66] font-semibold tracking-wide"
        >
          返回模式选择
        </button>
        <div className="px-3 py-1 bg-[#0f1620]/90 border border-[#2e3a47] rounded-sm font-semibold text-xs">
          机库作业
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 pt-20 pb-12 grid lg:grid-cols-[0.18fr,1.5fr,0.18fr] gap-6 items-stretch">
        <LeftConsole stats={statsMap[current.key] ?? statsMap.mid} />
        <div className="flex flex-col gap-6 mt-12 items-center">
          <div className="flex gap-3">
            {models.map((m) => {
              const active = m.key === current.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setCurrent(m)}
                  className={`px-3 py-1 text-xs font-semibold border-2 ${
                    active
                      ? 'border-[#ff5a3c] bg-[#1a202a]'
                      : 'border-[#2e3a47] bg-[#0f1620]/80'
                  }`}
                  style={{ clipPath: 'polygon(8% 0,92% 0,100% 20%,100% 80%,92% 100%,8% 100%,0 80%,0 20%)' }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <TankDisplay imageSrc={current.image} label={current.label} name={current.name} desc={current.desc} />
          <div className="flex justify-center pb-2 -mt-6 gap-4 flex-wrap">
            <MetalButton
              label="确认坦克并选图"
              onClick={() => {
                onSelectTank?.(current);
                onClose?.();
              }}
            />
            <MetalButton label="保存配置" variant="secondary" />
          </div>
        </div>
        <RightConsole modules={moduleMap[current.key] ?? moduleMap.mid} />
      </div>
    </div>
  );
}
