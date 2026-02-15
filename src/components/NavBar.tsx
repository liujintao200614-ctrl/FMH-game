import { Gamepad2, Home, Trophy, Settings, User } from 'lucide-react';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}

const navItems: NavItem[] = [
  { label: '主页', icon: <Home size={16} />, active: true },
  { label: '游戏库', icon: <Gamepad2 size={16} /> },
  { label: '排行榜', icon: <Trophy size={16} /> },
  { label: '设置', icon: <Settings size={16} /> }
];

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 bg-[#0f0f0f]/90 backdrop-blur border-b border-[#242424]">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
              <Gamepad2 className="text-[#eaeaea]" size={20} />
            </div>
            <div className="text-sm">
              <p className="text-[11px] uppercase tracking-[0.35em] text-[#8f8f8f]">FMH LOCAL ARCADE</p>
              <p className="text-[#f2f2f2] font-medium text-lg">游戏大厅</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-2">
            {navItems.map((item) => (
              <button
                key={item.label}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition ${
                  item.active
                    ? 'bg-[#1a1a1a] border-[#2a2a2a] text-[#f2f2f2]'
                    : 'border-transparent text-[#9a9a9a] hover:text-[#f2f2f2]'
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-right leading-tight">
            <p className="text-[#8f8f8f]">玩家2025</p>
            <p className="text-[#f2f2f2] font-medium">等级 42</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
            <User className="text-[#eaeaea]" size={18} />
          </div>
        </div>
      </div>
    </header>
  );
}
