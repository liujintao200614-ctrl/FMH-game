import { Bell, ChevronRight } from 'lucide-react';

export interface Announcement {
  title: string;
  description: string;
  time: string;
  isNew?: boolean;
}

interface AnnouncementPanelProps {
  announcements: Announcement[];
}

export function AnnouncementPanel({ announcements }: AnnouncementPanelProps) {
  const hasAnnouncements = announcements.length > 0;

  return (
    <section className="lobby-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Bell size={18} />
          更新公告
        </div>
        {hasAnnouncements ? (
          <a href="#" className="text-sm text-white/80 hover:text-white">
            查看全部
          </a>
        ) : null}
      </div>
      <div className="lobby-panel-title">SYSTEM_LOG_MONITOR</div>
      {hasAnnouncements ? (
        <div className="space-y-4">
          {announcements.map((item) => (
            <article
              key={item.title}
              className="lobby-announce-item p-4 rounded-2xl transition flex items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold">{item.title}</p>
                  {item.isNew && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/60 bg-white/20 text-white">
                      NEW
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/85 mt-1">{item.description}</p>
                <p className="text-xs text-white/70 mt-1">{item.time}</p>
              </div>
              <ChevronRight className="text-white/70" size={20} />
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-white/75 text-sm">
          暂无更新公告
        </div>
      )}
    </section>
  );
}
