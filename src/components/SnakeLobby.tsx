import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Settings, Volume2, Activity } from 'lucide-react';

interface SnakeLobbyProps {
  onStart?: (payload: {
    nickname: string;
    mode: 'casual' | 'normal' | 'fast';
    enableBot: boolean;
    skinId: string;
    majorMode: 'team' | 'score' | 'infinite';
    scoreTarget: number | null;
    teamMode: boolean;
    teamCount: number;
    snakesPerTeam: number;
    playerTeamId: number;
  }) => void;
  onBack?: () => void;
}

function randomName() {
  const prefixes = ['Star', 'Cosmo', 'Nebula', 'Nova', 'Void', 'Galaxy', 'Astro'];
  const suffixes = ['Runner', 'Rider', 'Pilot', 'Hunter', 'Seeker', 'Drifter', 'Strider'];
  return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
}

export function SnakeLobby({ onStart, onBack }: SnakeLobbyProps) {
  const [settings, setSettings] = useState({
    nickname: randomName(),
    mode: 'normal' as 'casual' | 'normal' | 'fast',
    enableBot: false,
    teamMode: false,
    teamCount: 2,
    snakesPerTeam: 3,
    playerTeamId: 1
  });
  const [skinId] = useState('aurora');
  const [activeMode, setActiveMode] = useState<'team' | 'score' | 'infinite'>('team');
  const [showTeamConfig, setShowTeamConfig] = useState(false);
  const [showScoreConfig, setShowScoreConfig] = useState(false);
  const [showInfiniteConfig, setShowInfiniteConfig] = useState(false);
  const [scoreTier, setScoreTier] = useState(10000);
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarWrapRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const target = 72;
    const duration = 1400;
    const start = performance.now();
    setProgress(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const canvas = radarCanvasRef.current;
    const wrap = radarWrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    const dots = Array.from({ length: 12 }, (_, i) => ({
      angle: Math.random() * Math.PI * 2,
      radius: Math.random() * 0.42 + 0.08,
      speed: (Math.random() * 0.15 + 0.05) * (i % 2 === 0 ? 1 : -1),
      hue: i % 3 === 0 ? 'pink' : 'cyan'
    }));

    const resize = () => {
      const size = wrap.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = (t: number) => {
      if (t - last < 33) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = t;
      const size = wrap.clientWidth;
      const center = size / 2;
      const radius = center - 12;
      ctx.clearRect(0, 0, size, size);

      // grid
      ctx.strokeStyle = 'rgba(90, 130, 200, 0.18)';
      ctx.lineWidth = 1;
      const step = size / 10;
      for (let i = 1; i < 10; i++) {
        const p = i * step;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.stroke();
      }

      // rings
      ctx.strokeStyle = 'rgba(110, 214, 255, 0.35)';
      ctx.lineWidth = 1.5;
      [0.25, 0.5, 0.75, 1].forEach((r) => {
        ctx.beginPath();
        ctx.arc(center, center, radius * r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // sweep
      const sweepAngle = (t / 1000) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(53, 227, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(center + Math.cos(sweepAngle) * radius, center + Math.sin(sweepAngle) * radius);
      ctx.stroke();

      // dots
      dots.forEach((d, idx) => {
        d.angle += d.speed * 0.01;
        const r = radius * d.radius;
        const x = center + Math.cos(d.angle) * r;
        const y = center + Math.sin(d.angle) * r;
        const pulse = 0.6 + 0.4 * Math.sin(t / 600 + idx);
        ctx.fillStyle = d.hue === 'pink' ? `rgba(208,76,255,${pulse})` : `rgba(53,227,255,${pulse})`;
        ctx.shadowColor = d.hue === 'pink' ? 'rgba(208,76,255,0.6)' : 'rgba(53,227,255,0.6)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  const handleStart = () => {
    if (activeMode === 'team') {
      setSettings((s) => ({ ...s, teamMode: true }));
      setShowTeamConfig(true);
      return;
    }
    if (activeMode === 'score') {
      setSettings((s) => ({ ...s, teamMode: false }));
      setShowScoreConfig(true);
      return;
    }
    if (activeMode === 'infinite') {
      setSettings((s) => ({ ...s, teamMode: false }));
      setShowInfiniteConfig(true);
      return;
    }
    onStart?.({
      nickname: settings.nickname.trim() || 'SpaceTraveler',
      mode: settings.mode,
      enableBot: settings.enableBot,
      skinId,
      majorMode: activeMode,
      scoreTarget: activeMode === 'score' ? scoreTier : null,
      teamMode: activeMode === 'team',
      teamCount: settings.teamCount,
      snakesPerTeam: settings.snakesPerTeam,
      playerTeamId: settings.playerTeamId
    });
  };

  if (showTeamConfig) {
    return (
      <div className="min-h-screen text-[#e9e9ff]">
        <div className="protocol-shell">
          <div className="protocol-header">
            <div>贪吃蛇大作战</div>
            <button className="protocol-button" type="button" onClick={() => setShowTeamConfig(false)}>
              返回大厅
            </button>
          </div>
          <div className="protocol-header" style={{ marginTop: 4 }}>
            <div>团队对抗 // 协议配置</div>
          </div>
          <div className="protocol-rule" />

          <div className="protocol-grid">
            <div className="protocol-panel">
              <div className="protocol-title">A. 队伍分配</div>
              <div className="space-y-3">
                <div className="protocol-field">
                  <span>队伍数量</span>
                  <input
                    type="number"
                    min={2}
                    max={4}
                    value={settings.teamCount}
                    onChange={(e) => {
                      const next = Math.min(4, Math.max(2, Number(e.target.value) || 2));
                      setSettings((s) => ({
                        ...s,
                        teamCount: next,
                        playerTeamId: Math.min(Math.max(1, s.playerTeamId), next)
                      }));
                    }}
                    className="protocol-input w-20 text-center"
                  />
                </div>
                <div className="protocol-field">
                  <span>每队人数</span>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={settings.snakesPerTeam}
                    onChange={(e) => {
                      const next = Math.min(4, Math.max(1, Number(e.target.value) || 1));
                      setSettings((s) => ({ ...s, snakesPerTeam: next }));
                    }}
                    className="protocol-input w-20 text-center"
                  />
                </div>
                <div className="protocol-field">
                  <span>你所在队伍</span>
                  <select
                    value={settings.playerTeamId}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        playerTeamId: Math.min(Math.max(1, Number(e.target.value) || 1), s.teamCount)
                      }))
                    }
                    className="protocol-input w-28"
                  >
                    {Array.from({ length: settings.teamCount }, (_, i) => i + 1).map((id) => (
                      <option key={id} value={id}>
                        队伍 {id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-[#9aa0ff] font-mono uppercase tracking-[0.14em]">
                  队伍积分累计决定胜负
                </div>
              </div>
            </div>

            <div className="protocol-panel">
              <div className="protocol-title">B. 玩家档案</div>
              <label className="block text-xs text-[#9aa0ff] mb-2 font-mono uppercase tracking-[0.18em]">代号</label>
              <input
                value={settings.nickname}
                onChange={(e) => setSettings((s) => ({ ...s, nickname: e.target.value }))}
                className="protocol-input"
                placeholder="输入玩家昵称"
              />
              <div className="mt-4 text-xs text-[#9aa0ff] font-mono uppercase tracking-[0.18em]">难度选择</div>
              <div className="protocol-tags mt-3">
                {['休闲', '标准', '极速'].map((label) => {
                  const key = label === '休闲' ? 'casual' : label === '标准' ? 'normal' : 'fast';
                  const active = settings.mode === key;
                  return (
                  <button
                    key={label}
                    type="button"
                    className={`protocol-tag ${active ? 'protocol-tag-active' : ''}`}
                    onClick={() => setSettings((s) => ({ ...s, mode: key }))}
                  >
                    {label}
                  </button>
                );
                })}
              </div>
            </div>

            <div className="protocol-panel">
              <div className="protocol-title">C. 规则概览</div>
              <div className="space-y-2 text-xs text-[#b7bcff] font-mono uppercase tracking-[0.12em]">
                <div>队伍积分累计决定胜负</div>
                <div>地图碰撞与道具规则沿用基础模式</div>
                <div>不足人数自动由 AI 补齐</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <button
              className="protocol-button"
              type="button"
              onClick={() => {
                onStart?.({
                  nickname: settings.nickname.trim() || 'SpaceTraveler',
                  mode: settings.mode,
                  enableBot: true,
                  skinId,
                  majorMode: 'team',
                  scoreTarget: null,
                  teamMode: true,
                  teamCount: settings.teamCount,
                  snakesPerTeam: settings.snakesPerTeam,
                  playerTeamId: settings.playerTeamId
                });
              }}
            >
              启动对抗
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showScoreConfig) {
    return (
      <div className="min-h-screen text-[#e9e9ff]">
        <div className="protocol-shell">
          <div className="protocol-header">
            <div>贪吃蛇大作战</div>
            <button className="protocol-button" type="button" onClick={() => setShowScoreConfig(false)}>
              返回大厅
            </button>
          </div>
          <div className="protocol-header" style={{ marginTop: 4 }}>
            <div>积分模式 // 目标配置</div>
          </div>
          <div className="protocol-rule" />

          <div className="protocol-grid">
            <div className="protocol-panel">
              <div className="protocol-title">A. 目标档位</div>
              <div className="score-panel">
                {[
                  { label: '新手', value: 5000, level: 'LV_01' },
                  { label: '入门', value: 10000, level: 'LV_02' },
                  { label: '精英', value: 15000, level: 'LV_03' },
                  { label: '大师', value: 20000, level: 'LV_04' }
                ].map((tier) => (
                  <button
                    key={tier.value}
                    type="button"
                    className={`score-card ${scoreTier === tier.value ? 'active' : ''}`}
                    onClick={() => setScoreTier(tier.value)}
                  >
                    <div>
                      <div>{tier.label}</div>
                      <small>{tier.level} //</small>
                    </div>
                    <div>{tier.value}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="protocol-panel">
              <div className="protocol-title">B. 玩家档案</div>
              <label className="block text-xs text-[#9aa0ff] mb-2 font-mono uppercase tracking-[0.18em]">代号</label>
              <input
                value={settings.nickname}
                onChange={(e) => setSettings((s) => ({ ...s, nickname: e.target.value }))}
                className="protocol-input"
                placeholder="输入玩家昵称"
              />
              <div className="mt-4 text-xs text-[#9aa0ff] font-mono uppercase tracking-[0.18em]">难度选择</div>
              <div className="protocol-tags mt-3">
                {['休闲', '标准', '极速'].map((label) => {
                  const key = label === '休闲' ? 'casual' : label === '标准' ? 'normal' : 'fast';
                  const active = settings.mode === key;
                  return (
                  <button
                    key={label}
                    type="button"
                    className={`protocol-tag ${active ? 'protocol-tag-active' : ''}`}
                    onClick={() => setSettings((s) => ({ ...s, mode: key }))}
                  >
                    {label}
                  </button>
                );
                })}
              </div>
            </div>

            <div className="protocol-panel">
              <div className="protocol-title">C. 规则概览</div>
              <div className="space-y-2 text-xs text-[#b7bcff] font-mono uppercase tracking-[0.12em]">
                <div>达到目标分数即完成挑战</div>
                <div>积分仅计入本局成绩</div>
                <div>碰撞规则沿用基础模式</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <button
              className="protocol-button"
              type="button"
              onClick={() => {
                onStart?.({
                  nickname: settings.nickname.trim() || 'SpaceTraveler',
                  mode: settings.mode,
                  enableBot: true,
                  skinId,
                  majorMode: 'score',
                  scoreTarget: scoreTier,
                  teamMode: false,
                  teamCount: settings.teamCount,
                  snakesPerTeam: settings.snakesPerTeam,
                  playerTeamId: settings.playerTeamId
                });
              }}
            >
              启动挑战
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showInfiniteConfig) {
    return (
      <div className="min-h-screen text-[#e9e9ff]">
        <div className="protocol-shell">
          <div className="protocol-header">
            <div>贪吃蛇大作战</div>
            <button className="protocol-button" type="button" onClick={() => setShowInfiniteConfig(false)}>
              返回大厅
            </button>
          </div>
          <div className="protocol-header" style={{ marginTop: 4 }}>
            <div>无限模式 // 生存配置</div>
          </div>
          <div className="protocol-rule" />

          <div className="protocol-grid">
            <div className="protocol-panel">
              <div className="protocol-title">A. 生存规则</div>
              <div className="space-y-2 text-xs text-[#b7bcff] font-mono uppercase tracking-[0.12em]">
                <div>无分数目标，直到死亡为止</div>
                <div>碰撞规则沿用基础模式</div>
                <div>成绩以存活时长 + 分数记录</div>
              </div>
            </div>

            <div className="protocol-panel">
              <div className="protocol-title">B. 玩家档案</div>
              <label className="block text-xs text-[#9aa0ff] mb-2 font-mono uppercase tracking-[0.18em]">代号</label>
              <input
                value={settings.nickname}
                onChange={(e) => setSettings((s) => ({ ...s, nickname: e.target.value }))}
                className="protocol-input"
                placeholder="输入玩家昵称"
              />
              <div className="mt-4 text-xs text-[#9aa0ff] font-mono uppercase tracking-[0.18em]">难度选择</div>
              <div className="protocol-tags mt-3">
                {['休闲', '标准', '极速'].map((label) => {
                  const key = label === '休闲' ? 'casual' : label === '标准' ? 'normal' : 'fast';
                  const active = settings.mode === key;
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`protocol-tag ${active ? 'protocol-tag-active' : ''}`}
                      onClick={() => setSettings((s) => ({ ...s, mode: key }))}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="protocol-panel">
              <div className="protocol-title">C. 生存指标</div>
              <div className="space-y-2 text-xs text-[#b7bcff] font-mono uppercase tracking-[0.12em]">
                <div>预计生存时长：--</div>
                <div>风险等级：{settings.mode === 'casual' ? '低' : settings.mode === 'normal' ? '中' : '高'}</div>
                <div>记录方式：本地</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <button
              className="protocol-button"
              type="button"
              onClick={() => {
                onStart?.({
                  nickname: settings.nickname.trim() || 'SpaceTraveler',
                  mode: settings.mode,
                  enableBot: true,
                  skinId,
                  majorMode: 'infinite',
                  scoreTarget: null,
                  teamMode: false,
                  teamCount: settings.teamCount,
                  snakesPerTeam: settings.snakesPerTeam,
                  playerTeamId: settings.playerTeamId
                });
              }}
            >
              启动生存
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#e9e9ff]">
      <div className="snake-ops-shell">
        <div className="snake-ops-header">
          <div>贪吃蛇大作战 // 大厅界面</div>
        </div>
        <div className="snake-ops-rule" />

        <div className="snake-ops-grid">
          <div className="snake-panel h-full flex flex-col">
            <div className="snake-panel-title">模式选择</div>
            <div className="flex flex-col gap-3 flex-1">
              {[
                { key: 'team', label: '团队对抗' },
                { key: 'score', label: '积分模式' },
                { key: 'infinite', label: '无限模式' }
              ].map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  className={`mode-card ${activeMode === mode.key ? 'active' : ''} flex-1`}
                  onClick={() => setActiveMode(mode.key as 'team' | 'score' | 'infinite')}
                >
                  <Activity size={18} />
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="radar-panel">
            <div className="snake-panel-title">全局活动网格</div>
            <div className="radar-circle" ref={radarWrapRef}>
              <canvas ref={radarCanvasRef} className="absolute inset-0" />
            </div>
            <div className="objective-bar">
              当前目标: 等待指令
              <div className="objective-track">
                <div className="objective-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <div className="snake-panel">
            <div className="snake-panel-title">玩家命名</div>
            <label className="block text-xs text-[#9aa0ff] mb-2 font-mono uppercase tracking-[0.18em]">
              代号
            </label>
            <input
              value={settings.nickname}
              onChange={(e) => setSettings((s) => ({ ...s, nickname: e.target.value }))}
              placeholder="输入玩家昵称"
              className="w-full rounded-lg bg-[#0c0a1a] border border-[#6f6bff] text-[#e9e9ff] px-3 py-2 text-sm focus:outline-none focus:border-[#35e3ff]"
            />
            <div className="text-xs text-[#7f86ff] mt-2 font-mono uppercase tracking-[0.16em]">
              当前模式：{activeMode === 'team' ? '团队对抗' : activeMode === 'score' ? '积分模式' : '无限模式'}
            </div>
          </div>

        </div>

        <div className="flex items-center justify-between">
          <div className="snake-ready-icon">🐍</div>
          <div className="flex gap-3">
            {onBack && (
              <button className="px-4 py-2 rounded-xl border border-[#7b6cff] text-[#c9c9ff]" onClick={onBack}>
                返回大厅
              </button>
            )}
            <button className="lobby-button px-5 py-2" onClick={handleStart}>
              开始游戏
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
