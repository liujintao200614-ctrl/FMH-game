import { useEffect, useMemo, useRef, useState } from 'react';

type FlyBirdPageProps = {
  onClose?: () => void;
};

type Chapter = {
  id: number;
  name: string;
  theme: string;
  levels: number;
};

type ItemType = 'shield' | 'magnet' | 'slow' | 'dash' | 'curse';

const chapters: Chapter[] = [
  { id: 1, name: '飞鸟关卡', theme: '#7dd3fc', levels: 6 }
];

const levelConfigs = [
  { gapSize: 240, speed: 190, interval: 290, distance: 2200, items: ['shield', 'slow'] as ItemType[] },
  { gapSize: 230, speed: 200, interval: 280, distance: 2400, items: ['shield', 'slow', 'magnet'] as ItemType[] },
  { gapSize: 220, speed: 210, interval: 270, distance: 2600, items: ['shield', 'slow', 'magnet'] as ItemType[] },
  { gapSize: 210, speed: 220, interval: 260, distance: 2800, items: ['shield', 'slow', 'magnet', 'dash'] as ItemType[] },
  { gapSize: 200, speed: 230, interval: 250, distance: 3000, items: ['shield', 'slow', 'magnet', 'dash', 'curse'] as ItemType[] },
  { gapSize: 190, speed: 240, interval: 240, distance: 3200, items: ['shield', 'slow', 'magnet', 'dash', 'curse'] as ItemType[] }
];

const itemStyle: Record<ItemType, { label: string; fill: string; stroke: string }> = {
  shield: { label: '护', fill: '#a5f3fc', stroke: '#0ea5e9' },
  magnet: { label: '吸', fill: '#fde68a', stroke: '#f59e0b' },
  slow: { label: '缓', fill: '#c7d2fe', stroke: '#6366f1' },
  dash: { label: '冲', fill: '#fca5a5', stroke: '#ef4444' },
  curse: { label: '厄', fill: '#ddd6fe', stroke: '#7c3aed' }
};

export function FlyBirdPage({ onClose }: FlyBirdPageProps) {
  const [view, setView] = useState<'lobby' | 'game'>('lobby');
  const [chapterId, setChapterId] = useState(1);
  const [level, setLevel] = useState(1);
  const [unlockedLevel, setUnlockedLevel] = useState(1);
  const [status, setStatus] = useState<'ready' | 'running' | 'over'>('ready');
  const [outcome, setOutcome] = useState<'success' | 'fail' | null>(null);
  const [distance, setDistance] = useState(0);
  const [progress, setProgress] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [effectsTick, setEffectsTick] = useState(0);
  const statusRef = useRef(status);
  const outcomeStateRef = useRef(outcome);
  const distanceRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const birdRef = useRef({ x: 160, y: 200, vy: 0, rot: 0 });
  const obstaclesRef = useRef<Array<{ x: number; gapY: number }>>([]);
  const nextObstacleRef = useRef(0);
  const itemsRef = useRef<Array<{ x: number; y: number; type: ItemType; taken: boolean }>>([]);
  const nextItemRef = useRef(0);
  const speedRef = useRef(220);
  const levelDistanceRef = useRef(1500);
  const bgOffsetRef = useRef({ far: 0, mid: 0, near: 0 });
  const flapRef = useRef(0);
  const shakeRef = useRef(0);
  const sparklesRef = useRef<Array<{ x: number; y: number; r: number; life: number }>>([]);
  const itemParticlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; size: number; color: string }>>([]);
  const outcomeRef = useRef({ slow: 0, dim: 0, lift: 0 });
  const successFadeRef = useRef(0);
  const effectsRef = useRef({
    shield: 0,
    magnet: 0,
    slow: 0,
    dash: 0,
    curse: 0
  });
  const effectsPulseRef = useRef(0);
  const maxLevel = levelConfigs.length;

  const activeChapter = useMemo(
    () => chapters.find((item) => item.id === chapterId) ?? chapters[0],
    [chapterId]
  );
  const activeLevel = useMemo(() => levelConfigs[Math.max(0, Math.min(level - 1, maxLevel - 1))], [level, maxLevel]);

  const resetGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setStatus('ready');
      return;
    }
    birdRef.current = { x: 160, y: canvas.height / 2, vy: 0, rot: 0 };
    obstaclesRef.current = [];
    nextObstacleRef.current = 0;
    itemsRef.current = [];
    nextItemRef.current = 240;
    speedRef.current = activeLevel.speed; 
    levelDistanceRef.current = activeLevel.distance;
    bgOffsetRef.current = { far: 0, mid: 0, near: 0 };
    distanceRef.current = 0;
    setDistance(0);
    setProgress(0);
    effectsRef.current = { shield: 0, magnet: 0, slow: 0, dash: 0, curse: 0 };
    setOutcome(null);
    setStatus('ready');
    outcomeRef.current = { slow: 0, dim: 0, lift: 0 };
    successFadeRef.current = 0;
  };

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    outcomeStateRef.current = outcome;
  }, [outcome]);

  useEffect(() => {
    if (view !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextWidth = Math.max(300, Math.floor(rect.width));
      const nextHeight = Math.max(400, Math.floor(rect.height));
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      setCanvasSize({ width: nextWidth, height: nextHeight });
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener('resize', resize);

    resetGame();

    const spawnObstacle = () => {
      const gapSize = activeLevel.gapSize;
      const gapY = Math.max(120, Math.min(canvas.height - 120 - gapSize, Math.random() * (canvas.height - gapSize)));
      obstaclesRef.current.push({ x: canvas.width + 60, gapY });
      // Items spawn separately; keep obstacle spawn clean.
    };

    const spawnItem = () => {
      const availableItems = activeLevel.items;
      if (!availableItems.length) return;
      const type = availableItems[Math.floor(Math.random() * availableItems.length)];
      const baseX = canvas.width + 140;
      const gapSize = activeLevel.gapSize;
      const overlapObstacles = obstaclesRef.current.filter(
        (obs) => baseX + 16 > obs.x && baseX - 16 < obs.x + 60
      );
      let gapY = overlapObstacles[0]?.gapY;
      if (gapY === undefined) {
        const nearest = obstaclesRef.current.reduce(
          (best, obs) => (Math.abs(obs.x - baseX) < Math.abs(best.x - baseX) ? obs : best),
          obstaclesRef.current[0]
        );
        gapY = nearest?.gapY;
      }
      if (gapY === undefined) {
        gapY = Math.max(120, Math.min(canvas.height - 120 - gapSize, Math.random() * (canvas.height - gapSize)));
      }
      const margin = 20;
      const minY = gapY + margin;
      const maxY = gapY + gapSize - margin;
      if (maxY <= minY) return;
      let y = minY + Math.random() * (maxY - minY);

      // Final safety: if any overlapping obstacle would cover the item, pull it to the gap center.
      const bad = overlapObstacles.some((obs) => {
        const topHeight = obs.gapY;
        const bottomY = obs.gapY + gapSize;
        return y - 16 < topHeight || y + 16 > bottomY;
      });
      if (bad && overlapObstacles[0]) {
        y = overlapObstacles[0].gapY + gapSize / 2;
      }

      itemsRef.current.push({ x: baseX, y, type, taken: false });
    };

    const step = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const dt = Math.min(0.02, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;

      if (flapRef.current > 0) flapRef.current = Math.max(0, flapRef.current - dt);
      if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - dt);

      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#7ba4c6');
      gradient.addColorStop(0.6, '#d39bb4');
      gradient.addColorStop(1, '#f7c9a7');
      ctx.save();
      if (shakeRef.current > 0) {
        const s = shakeRef.current / 0.25;
        const amp = 6 * s;
        ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const finishSlow = outcomeRef.current.slow > 0 ? 0.45 : 1;
      const slowFactor = effectsRef.current.slow > 0 ? 0.65 : 1;
      const dashFactor = effectsRef.current.dash > 0 ? 1.25 : 1;
      const speed = speedRef.current * slowFactor * dashFactor * finishSlow;
      const bg = bgOffsetRef.current;
      bg.far -= speed * 0.12 * dt;
      bg.mid -= speed * 0.25 * dt;
      bg.near -= speed * 0.45 * dt;
      const wrap = (value: number, width: number) => {
        if (value < -width) return value + width;
        if (value > width) return value - width;
        return value;
      };
      bg.far = wrap(bg.far, canvas.width);
      bg.mid = wrap(bg.mid, canvas.width);
      bg.near = wrap(bg.near, canvas.width);

      ctx.fillStyle = 'rgba(255,230,220,0.6)';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc((i * 47 + bg.far) % canvas.width, (i * 89) % canvas.height, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,214,214,0.45)';
      for (let i = 0; i < 20; i++) {
        ctx.fillRect((i * 120 + bg.mid) % canvas.width, canvas.height - 120 - (i % 3) * 30, 80, 6);
      }
      ctx.fillStyle = 'rgba(255,180,200,0.35)';
      for (let i = 0; i < 16; i++) {
        ctx.fillRect((i * 140 + bg.near) % canvas.width, canvas.height - 60 - (i % 4) * 18, 100, 10);
      }

      // Painterly cloud blobs
      const cloudColors = ['rgba(255,210,200,0.45)', 'rgba(255,180,200,0.35)', 'rgba(180,140,180,0.3)'];
      for (let i = 0; i < 8; i++) {
        const x = (i * 220 + bg.mid * 0.6) % canvas.width;
        const y = 80 + (i % 4) * 70;
        ctx.fillStyle = cloudColors[i % cloudColors.length];
        ctx.beginPath();
        ctx.ellipse(x, y, 140, 60, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 60, y + 10, 90, 45, -0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - 60, y + 20, 100, 50, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (statusRef.current === 'running') {
        effectsRef.current.shield = Math.max(0, effectsRef.current.shield - dt);
        effectsRef.current.magnet = Math.max(0, effectsRef.current.magnet - dt);
        effectsRef.current.slow = Math.max(0, effectsRef.current.slow - dt);
        effectsRef.current.dash = Math.max(0, effectsRef.current.dash - dt);
        effectsRef.current.curse = Math.max(0, effectsRef.current.curse - dt);
        if (time - effectsPulseRef.current > 200) {
          effectsPulseRef.current = time;
          setEffectsTick((prev) => prev + 1);
        }

        const bird = birdRef.current;
        const gravity = effectsRef.current.curse > 0 ? 1050 : 820;
        bird.vy += gravity * dt;
        bird.y += bird.vy * dt;
        bird.rot = bird.vy * 0.002;

        nextObstacleRef.current -= speed * dt;
        if (nextObstacleRef.current <= 0 && distanceRef.current < levelDistanceRef.current - 260) {
          spawnObstacle();
          nextObstacleRef.current = activeLevel.interval;
        }

        nextItemRef.current -= speed * dt;
        if (nextItemRef.current <= 0 && distanceRef.current < levelDistanceRef.current - 220) {
          spawnItem();
          nextItemRef.current = 620 + Math.random() * 280;
        }

        obstaclesRef.current = obstaclesRef.current
          .map((obs) => ({ ...obs, x: obs.x - speed * dt }))
          .filter((obs) => obs.x > -80);

        itemsRef.current = itemsRef.current
          .map((item) => ({ ...item, x: item.x - speed * dt }))
          .filter((item) => item.x > -40 && !item.taken);

        distanceRef.current += speed * dt;
        const dist = distanceRef.current;
        setDistance(dist);
        setProgress(Math.min(100, (dist / levelDistanceRef.current) * 100));

      }

      outcomeRef.current.slow = Math.max(0, outcomeRef.current.slow - dt);
      outcomeRef.current.dim = Math.max(0, outcomeRef.current.dim - dt);
      outcomeRef.current.lift = Math.max(0, outcomeRef.current.lift - dt);

      const bird = birdRef.current;
      const flapT = flapRef.current > 0 ? flapRef.current / 0.2 : 0;
      const wingLift = flapT * 6;
      const bob = Math.sin(time / 120) * (statusRef.current === 'running' ? 2 : 4);
      if (statusRef.current === 'over' && outcomeStateRef.current === 'fail') {
        bird.vy += 600 * dt;
        bird.y += bird.vy * dt;
        bird.rot = Math.min(1.2, bird.rot + 1.5 * dt);
      }
      // Body
      ctx.fillStyle = '#ffd17a';
      ctx.save();
      ctx.translate(bird.x, bird.y + bob);
      ctx.rotate(bird.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wing
      ctx.fillStyle = '#f6b24a';
      ctx.beginPath();
      ctx.ellipse(-2, -wingLift, 10, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#ff8f3d';
      ctx.beginPath();
      ctx.moveTo(16, -2);
      ctx.lineTo(26, 2);
      ctx.lineTo(16, 6);
      ctx.closePath();
      ctx.fill();
      // Eye
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.arc(6, -4, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#7fa6c9';
      ctx.strokeStyle = '#6b4a5a';
      ctx.lineWidth = 3;
      obstaclesRef.current.forEach((obs) => {
        const gapSize = activeLevel.gapSize;
        const topHeight = obs.gapY;
        const bottomY = obs.gapY + gapSize;
        ctx.fillRect(obs.x, 0, 60, topHeight);
        ctx.fillRect(obs.x, bottomY, 60, canvas.height - bottomY);
        ctx.strokeRect(obs.x, 0, 60, topHeight);
        ctx.strokeRect(obs.x, bottomY, 60, canvas.height - bottomY);

        if (statusRef.current === 'running') {
          const collideX = bird.x + 18 > obs.x && bird.x - 18 < obs.x + 60;
          const collideY = bird.y - 14 < topHeight || bird.y + 14 > bottomY;
          if (collideX && collideY) {
            if (effectsRef.current.dash > 0) {
              return;
            }
            if (effectsRef.current.shield > 0) {
              effectsRef.current.shield = 0;
              shakeRef.current = 0.15;
              return;
            }
            shakeRef.current = 0.25;
            setOutcome('fail');
            outcomeRef.current.dim = 0.6;
            setStatus('over');
          }
        }
      });

      // Finish trigger (no visible gate)
      const finishOffset = levelDistanceRef.current - distanceRef.current;
      if (finishOffset < canvas.width + 40) {
        const finishX = canvas.width + finishOffset;
        if (statusRef.current === 'running' && bird.x + 18 >= finishX) {
          setProgress(100);
          setOutcome('success');
          outcomeRef.current.slow = 0.7;
          outcomeRef.current.lift = 0.6;
          successFadeRef.current = 0;
          setStatus('over');
          setUnlockedLevel((prev) => Math.min(maxLevel, Math.max(prev, level + 1)));
        }
      }

      itemsRef.current.forEach((item) => {
        const style = itemStyle[item.type];
        const bob = Math.sin(time / 200 + item.x * 0.01) * 5;
        const pulse = 0.8 + 0.5 * Math.sin(time / 220);
        const glow = ctx.createRadialGradient(item.x, item.y + bob, 2, item.x, item.y + bob, 26);
        glow.addColorStop(0, `${style.fill}cc`);
        glow.addColorStop(1, `${style.fill}00`);
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(item.x, item.y + bob, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = style.fill;
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(item.x, item.y + bob, 14 + pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = `${style.stroke}80`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(item.x, item.y + bob, 20 + pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#2b1f2d';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(style.label, item.x, item.y + bob + 0.5);

        if (statusRef.current === 'running') {
          const dx = bird.x - item.x;
          const dy = bird.y - (item.y + bob);
          const attract = effectsRef.current.magnet > 0 ? 54 : 24;
          if (Math.hypot(dx, dy) < attract) {
            item.taken = true;
            sparklesRef.current.push({ x: item.x, y: item.y + bob, r: 6, life: 0.5 });
            const burstColor = style.stroke;
            for (let i = 0; i < 8; i++) {
              const angle = (Math.PI * 2 * i) / 8;
              itemParticlesRef.current.push({
                x: item.x,
                y: item.y + bob,
                vx: Math.cos(angle) * (30 + Math.random() * 20),
                vy: Math.sin(angle) * (30 + Math.random() * 20),
                life: 0.5,
                size: 2 + Math.random() * 2,
                color: burstColor
              });
            }
            if (item.type === 'shield') effectsRef.current.shield = 8;
            if (item.type === 'magnet') effectsRef.current.magnet = 6;
            if (item.type === 'slow') effectsRef.current.slow = 4;
            if (item.type === 'dash') effectsRef.current.dash = 1.2;
            if (item.type === 'curse') effectsRef.current.curse = 4;
          }
        }
      });

      if (statusRef.current === 'running') {
        if (bird.y < 8 || bird.y > canvas.height - 8) {
          if (effectsRef.current.dash > 0) {
            bird.y = Math.min(Math.max(bird.y, 8), canvas.height - 8);
            return;
          }
          if (effectsRef.current.shield > 0) {
            effectsRef.current.shield = 0;
            shakeRef.current = 0.15;
          } else {
            shakeRef.current = 0.25;
            setOutcome('fail');
            outcomeRef.current.dim = 0.6;
            setStatus('over');
          }
        }
      }

      // Sparkles
      sparklesRef.current = sparklesRef.current
        .map((s) => ({ ...s, life: s.life - dt, r: s.r + 18 * dt }))
        .filter((s) => s.life > 0);
      sparklesRef.current.forEach((s) => {
        ctx.strokeStyle = `rgba(255,214,156,${Math.max(0, s.life / 0.5)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.stroke();
      });

      itemParticlesRef.current = itemParticlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          life: p.life - dt
        }))
        .filter((p) => p.life > 0);
      itemParticlesRef.current.forEach((p) => {
        ctx.fillStyle = `${p.color}${Math.floor(Math.max(0, p.life / 0.5) * 255)
          .toString(16)
          .padStart(2, '0')}`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      if (outcomeRef.current.lift > 0) {
        const alpha = Math.min(0.35, outcomeRef.current.lift);
        ctx.fillStyle = `rgba(255,240,220,${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (outcomeRef.current.dim > 0) {
        const alpha = Math.min(0.35, outcomeRef.current.dim);
        ctx.fillStyle = `rgba(40,24,40,${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (statusRef.current === 'over' && outcomeStateRef.current === 'success') {
        successFadeRef.current = Math.min(1, successFadeRef.current + dt * 2);
        ctx.fillStyle = `rgba(43,31,45,${0.9 * successFadeRef.current})`;
        ctx.font = '600 42px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('通关成功', canvas.width / 2, canvas.height * 0.45);
      }

      ctx.restore();

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      window.removeEventListener('resize', resize);
      ro.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastTimeRef.current = 0;
    };
  }, [view, level, activeLevel, maxLevel]);

  const handleFlap = () => {
    if (statusRef.current === 'over') return;
    if (statusRef.current === 'ready') setStatus('running');
    const bird = birdRef.current;
    bird.vy = effectsRef.current.curse > 0 ? -320 : -380;
    flapRef.current = 0.2;
  };

  useEffect(() => {
    if (view !== 'game') return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        handleFlap();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view]);

  return (
    <div className="min-h-screen text-[#2b1f2d] bg-gradient-to-b from-[#7aa6c6] via-[#d9a2b6] to-[#f7c9a7]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 left-[-10%] h-[320px] w-[70%] rounded-[999px] bg-[#ffd9c7]/70 blur-3xl" />
        <div className="absolute top-6 right-[-5%] h-[260px] w-[60%] rounded-[999px] bg-[#f5b1c3]/60 blur-3xl" />
        <div className="absolute bottom-[-60px] left-[-10%] h-[280px] w-[75%] rounded-[999px] bg-[#f7c9a7]/70 blur-3xl" />
      </div>
      {view === 'lobby' ? (
        <main className="max-w-6xl mx-auto px-6 py-12 flex flex-col gap-10">
          <header className="flex flex-col gap-4">
            <div className="text-xs uppercase tracking-[0.35em] text-[#8a4f6a]">Fly Bird Run</div>
            <h1 className="text-4xl md:text-6xl font-semibold text-[#2b1f2d]">飞鸟跑酷</h1>
            <p className="text-sm md:text-base text-[#5a4250] max-w-2xl">
              轻点上升，松开下落，穿越障碍并拾取道具。章节关卡制，跑酷通关为目标。
            </p>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="rounded-[32px] border border-white/70 bg-white/50 p-6 shadow-[0_20px_60px_rgba(139,87,115,0.18)] backdrop-blur">
              <div className="text-xs uppercase tracking-[0.2em] text-[#8a4f6a]">关卡</div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <div className="text-2xl font-semibold text-[#2b1f2d]">{activeChapter.name}</div>
                  <div className="mt-2 text-sm text-[#5a4250]">躲避障碍，拾取道具，跑满进度通关。</div>
                </div>
                <div className="w-24 h-24 rounded-2xl bg-white/70 flex items-center justify-center text-sm text-[#5a4250] shadow-[0_10px_30px_rgba(139,87,115,0.15)]">
                  Lv {level}
                </div>
              </div>
              <div className="mt-6 h-2 rounded-full bg-white/70">
                <div className="h-2 rounded-full" style={{ width: '0%', background: activeChapter.theme }} />
              </div>
            </div>

            <div className="rounded-[32px] border border-white/70 bg-white/50 p-6 shadow-[0_20px_60px_rgba(139,87,115,0.18)] backdrop-blur">
              <div className="text-xs uppercase tracking-[0.2em] text-[#8a4f6a]">开始</div>
              <div className="mt-4 text-sm text-[#5a4250]">通关上一关卡后可解锁下一关。</div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {Array.from({ length: activeChapter.levels }).map((_, index) => {
                  const nextLevel = index + 1;
                  const locked = nextLevel > unlockedLevel;
                  return (
                    <button
                      key={nextLevel}
                      type="button"
                      onClick={() => {
                        if (!locked) setLevel(nextLevel);
                      }}
                      className={`rounded-2xl border px-3 py-2 text-xs ${
                        locked
                          ? 'border-white/40 bg-white/40 text-[#b08aa0]'
                          : nextLevel === level
                            ? 'border-white/90 bg-white/90 text-[#2b1f2d]'
                            : 'border-white/70 bg-white/70 text-[#5a4250]'
                      }`}
                    >
                      {locked ? `🔒 ${nextLevel}` : `关卡 ${nextLevel}`}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setView('game')}
                  className="w-full rounded-2xl bg-[#ff9f80] py-3 font-semibold text-[#2b1f2d] shadow-[0_12px_30px_rgba(255,159,128,0.35)]"
                >
                  开始跑酷（关卡 {level}）
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-2xl border border-white/70 py-3 text-sm text-[#5a4250] hover:border-white"
                >
                  返回大厅
                </button>
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className="min-h-screen flex flex-col">
          <div className="flex-1 px-0 pb-0 min-h-0">
            <div
              ref={stageRef}
              data-effects-tick={effectsTick}
              className="relative h-screen rounded-none border-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,237,230,0.9),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(255,214,214,0.7),transparent_55%),linear-gradient(180deg,#7ba4c6,#f7c9a7)] shadow-none overflow-hidden"
              onClick={handleFlap}
              onTouchStart={(event) => {
                event.preventDefault();
                handleFlap();
              }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,226,214,0.6),transparent_55%),radial-gradient(circle_at_70%_40%,rgba(255,200,210,0.5),transparent_55%),radial-gradient(circle_at_50%_70%,rgba(190,150,190,0.35),transparent_60%)]" />
                <div className="absolute inset-0 mix-blend-soft-light opacity-70" style={{ backgroundImage: 'url(\"data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%27120%27 height=%27120%27><filter id=%27n%27 x=%270%27 y=%270%27 width=%27100%25%27 height=%27100%25%27><feTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%272%27 stitchTiles=%27stitch%27/></filter><rect width=%27120%27 height=%27120%27 filter=%27url(%23n)%27 opacity=%270.25%27/></svg>\")' }} />
              </div>
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-[#8a4f6a]">
                <div>
                  第 {chapterId} 章 · {activeChapter.name} / 关卡 {level}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetGame}
                    className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] text-[#5a4250] shadow-[0_10px_20px_rgba(139,87,115,0.15)]"
                  >
                    重开
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('lobby')}
                    className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] text-[#5a4250] shadow-[0_10px_20px_rgba(139,87,115,0.15)]"
                  >
                    返回
                  </button>
                </div>
              </div>

              <div className="absolute top-12 left-6 right-6 flex items-center justify-between text-sm text-white/80">
                <div className="flex items-center gap-4">
                  <span className="text-[#4b2f3f]">距离 {Math.floor(distance)}m</span>
                  <span className="text-[#4b2f3f]">
                    状态
                    {effectsRef.current.shield > 0 && ' · 护盾'}
                    {effectsRef.current.magnet > 0 && ' · 吸附'}
                    {effectsRef.current.slow > 0 && ' · 慢速'}
                    {effectsRef.current.dash > 0 && ' · 冲刺'}
                    {effectsRef.current.curse > 0 && ' · 诅咒'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-white/70 text-[#4b2f3f] shadow-[0_8px_20px_rgba(139,87,115,0.2)]">
                    进度 {Math.floor(progress)}%
                  </span>
                </div>
              </div>

              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
              <div className="absolute top-4 left-4 rounded-full bg-white/70 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#8a4f6a] shadow-[0_8px_20px_rgba(139,87,115,0.15)]">
                {canvasSize.width}×{canvasSize.height} · {status}
              </div>

              {status !== 'running' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                  <div className="text-lg font-semibold">
                    {status === 'over' ? (outcome === 'success' ? '通关成功' : '挑战失败') : '准备起飞'}
                  </div>
                    <p className="text-sm text-[#5a4250] mt-2">
                      目标：躲开障碍，进度达到 100% 即通关
                    </p>
                    <p className="text-sm text-[#6a4a5a] mt-1">操作：点击/空格上升，松开下落</p>
                    {status === 'ready' && (
                      <button
                        type="button"
                        onClick={handleFlap}
                        className="mt-4 rounded-full bg-[#ff9f80] px-4 py-2 text-sm text-[#2b1f2d] shadow-[0_12px_26px_rgba(255,159,128,0.35)]"
                      >
                        开始
                      </button>
                    )}
                    {status === 'over' && (
                      <div className="mt-4 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={resetGame}
                          className="rounded-full bg-white/70 px-4 py-2 text-sm text-[#5a4250] shadow-[0_10px_20px_rgba(139,87,115,0.2)]"
                        >
                          再来一次
                        </button>
                        {outcome === 'success' && level < maxLevel && (
                          <button
                            type="button"
                            onClick={() => {
                              setLevel(level + 1);
                              setOutcome(null);
                              setView('game');
                            }}
                            className="rounded-full bg-[#ff9f80] px-4 py-2 text-sm text-[#2b1f2d] shadow-[0_12px_26px_rgba(255,159,128,0.35)]"
                          >
                            下一关
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setView('lobby')}
                          className="rounded-full border border-white/70 px-4 py-2 text-sm text-[#5a4250]"
                        >
                          返回关卡
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="absolute bottom-6 left-6 text-xs uppercase tracking-[0.2em] text-[#8a4f6a]">
                Tap / Space 上升
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
