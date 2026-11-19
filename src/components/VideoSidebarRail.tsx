import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { PublicSettings, SidebarVideoItem } from '../types';

interface VideoSidebarRailProps {
  settings: PublicSettings;
  className?: string;
}

function getYoutubeEmbedUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '').trim();
      return id
        ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&rel=0`
        : null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) {
        return `https://www.youtube.com/embed/${v}?autoplay=1&mute=1&loop=1&playlist=${v}&rel=0`;
      }
      if (parsed.pathname.includes('/shorts/')) {
        const id = parsed.pathname.split('/shorts/')[1]?.split('/')[0];
        return id
          ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&rel=0`
          : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function VideoSidebarRail({ settings, className = '' }: VideoSidebarRailProps) {
  const [unmutedId, setUnmutedId] = useState<string | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const enabled = settings.sidebarVideosEnabled !== false;
  const count = settings.sidebarVideoCount === 3 ? 3 : 4;
  const allVideos = settings.sidebarVideos || [];
  const visibleVideos: SidebarVideoItem[] = allVideos.slice(0, count);

  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, el]) => {
      if (!el) return;
      el.muted = unmutedId !== id;
      if (el.paused) {
        el.play().catch(() => {});
      }
    });
  }, [unmutedId, visibleVideos]);

  if (!enabled || visibleVideos.length === 0) {
    return null;
  }

  const handleToggleSound = (itemId: string) => {
    setUnmutedId((prev) => {
      const next = prev === itemId ? null : itemId;
      Object.entries(videoRefs.current).forEach(([id, el]) => {
        if (!el) return;
        el.muted = next !== id;
        if (next === id) {
          el.volume = 1;
          el.play().catch(() => {});
        }
      });
      return next;
    });
  };

  return (
    <aside
      aria-label="مقاطع فيديو عرض المنتجات"
      className={`${className} w-full lg:w-[260px] ${
        count === 3 ? 'lg:h-[460px] lg:py-[9px]' : 'lg:h-[620px] lg:py-[14px]'
      } p-2.5 lg:px-[4px] rounded-2xl border bg-[#0D0D10]/95 backdrop-blur-md shadow-[0_0_28px_-8px_rgba(212,175,55,0.42)] flex flex-row lg:flex-col items-center lg:justify-center gap-[10px] overflow-x-auto lg:overflow-hidden`}
      style={{
        borderColor: settings.primaryGoldColor
          ? `${settings.primaryGoldColor}CC`
          : 'rgba(212, 175, 55, 0.8)',
      }}
    >
      {visibleVideos.map((item, idx) => {
        const trimmedUrl = (item.url || '').trim();
        const ytEmbed = trimmedUrl ? getYoutubeEmbedUrl(trimmedUrl) : null;
        const isUnmuted = unmutedId === item.id;

        return (
          <div
            key={item.id || idx}
            onClick={() => {
              if (!ytEmbed && trimmedUrl) {
                handleToggleSound(item.id);
              }
            }}
            role={ytEmbed ? undefined : 'button'}
            tabIndex={ytEmbed ? undefined : 0}
            onKeyDown={(e) => {
              if (!ytEmbed && trimmedUrl && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                handleToggleSound(item.id);
              }
            }}
            aria-label={
              item.title
                ? `${item.title} - ${isUnmuted ? 'كتم الصوت' : 'تشغيل الصوت'}`
                : isUnmuted
                  ? 'كتم الصوت'
                  : 'تشغيل الصوت'
            }
            className="relative w-[250px] h-[140px] shrink-0 rounded-xl overflow-hidden border bg-black group cursor-pointer transition-colors"
            style={{
              borderColor: isUnmuted
                ? settings.primaryGoldColor || '#D4AF37'
                : 'rgba(212, 175, 55, 0.45)',
            }}
          >
            {ytEmbed ? (
              <iframe
                src={ytEmbed}
                title={item.title || `فيديو ${idx + 1}`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            ) : trimmedUrl ? (
              <>
                <video
                  ref={(el) => {
                    videoRefs.current[item.id] = el;
                  }}
                  src={trimmedUrl}
                  autoPlay
                  loop
                  muted={!isUnmuted}
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />

                {/* Sound Toggle Indicator */}
                <span
                  className={`absolute top-2 left-2 z-10 h-6 px-2 rounded-md border flex items-center gap-1 text-[10px] font-bold transition-colors ${
                    isUnmuted
                      ? 'bg-[#D4AF37] text-[#09090B] border-[#F5E1A4]'
                      : 'bg-black/70 text-[#F5F2EB] border-[#D4AF37]/45 group-hover:border-[#D4AF37]'
                  }`}
                >
                  {isUnmuted ? (
                    <>
                      <Volume2 className="w-3 h-3" />
                      <span>الصوت يعمل</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3 h-3 text-[#E5C158]" />
                      <span>تشغيل الصوت</span>
                    </>
                  )}
                </span>

                {item.title && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2.5 py-1.5 pointer-events-none">
                    <div className="text-[11px] font-medium text-[#F5F2EB] truncate">
                      {item.title}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] text-[#9E988C] px-3 text-center bg-[#121216]">
                فيديو {idx + 1} · بانتظار رفع الفيديو أو الرابط
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
