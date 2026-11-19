import { useEffect, useState } from 'react';
import { ArrowDownLeft, Pencil, ShieldCheck } from 'lucide-react';
import type { PublicSettings } from '../types';
import { ResilientImage } from './ResilientImage';

interface LandingHeroProps {
  settings: PublicSettings;
  editMode?: boolean;
  onEditSection?: (section: 'identity' | 'hero') => void;
}

export function LandingHero({
  settings,
  editMode = false,
  onEditSection,
}: LandingHeroProps) {
  const slides =
    settings.heroSlideshowImages && settings.heroSlideshowImages.length > 0
      ? settings.heroSlideshowImages.filter(Boolean)
      : [settings.heroImageUrl].filter(Boolean);

  const [slideIdx, setSlideIdx] = useState(0);

  const mode = settings.heroBackdropMode || 'auto';
  const showVideo =
    Boolean(settings.heroVideoUrl?.trim()) &&
    (mode === 'video' || mode === 'auto');
  const showSlideshow =
    !showVideo && (mode === 'slideshow' || (mode === 'auto' && slides.length > 1));

  useEffect(() => {
    if (!showSlideshow || slides.length <= 1) return;
    const timer = setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [showSlideshow, slides.length]);

  if (!settings.heroEnabled) return null;

  const activeImage = showSlideshow
    ? slides[slideIdx % slides.length] || settings.heroImageUrl
    : settings.heroImageUrl || slides[0];

  const motionClass =
    settings.heroAnimatedMotion === 'kenburns'
      ? 'animate-bg-kenburns'
      : settings.heroAnimatedMotion === 'float'
        ? 'animate-bg-float'
        : settings.heroAnimatedMotion === 'pulse'
          ? 'animate-bg-pulse'
          : '';

  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-[#D4AF37]/20 bg-[#09090B]"
    >
      {/* Video / Multi-image Slideshow / Animated Image Backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        {showVideo && settings.heroVideoUrl ? (
          <video
            key={settings.heroVideoUrl}
            src={settings.heroVideoUrl}
            autoPlay
            loop
            muted
            playsInline
            style={
              settings.heroBackdropFilter
                ? { filter: settings.heroBackdropFilter }
                : undefined
            }
            className="w-full h-full object-cover opacity-50"
          />
        ) : (
          <ResilientImage
            src={activeImage}
            alt={settings.storeName}
            style={
              settings.heroBackdropFilter
                ? { filter: settings.heroBackdropFilter }
                : undefined
            }
            className={`w-full h-full object-cover opacity-45 transition-opacity duration-700 ${motionClass}`}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 22% 30%, rgba(212,175,55,0.22), transparent 55%), radial-gradient(circle at 80% 70%, rgba(230,199,103,0.14), transparent 50%), linear-gradient(180deg, rgba(9,9,11,0.72) 0%, rgba(9,9,11,0.58) 45%, rgba(9,9,11,0.96) 100%)',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-16 lg:pt-20 lg:pb-20">
        {editMode && onEditSection && (
          <div className="mb-5 flex items-center justify-end">
            <button
              type="button"
              onClick={() => onEditSection('hero')}
              className="h-9 px-3.5 rounded-xl bg-[#D4AF37] text-[#000000] text-xs font-bold inline-flex items-center gap-1.5 shadow-lg hover:brightness-110 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>تحرير واجهة الهبوط والفيديو</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div
            onClick={() => {
              if (editMode && onEditSection) onEditSection('hero');
            }}
            className={`lg:col-span-7 space-y-6 ${
              editMode
                ? 'p-4 -m-4 rounded-2xl border border-dashed border-[#D4AF37]/60 hover:bg-[#14120E]/50 cursor-pointer transition-colors'
                : ''
            }`}
          >
            <div className="text-xs sm:text-sm font-medium text-[#E5C158]">
              {settings.storeName} · {settings.storeTagline}
            </div>

            <h1 className="font-display text-3xl sm:text-5xl lg:text-[3.25rem] font-bold leading-tight text-[#F5F2EB] text-balance">
              {settings.heroTitle}
            </h1>

            <p className="text-base sm:text-lg text-[#CBC5B9] leading-relaxed max-w-2xl">
              {settings.heroSubtitle}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href="#products"
                className="btn-gold-wave inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl text-sm sm:text-base whitespace-nowrap shrink-0"
              >
                <span>{settings.heroCtaText || 'تصفح المنتجات الآن'}</span>
                <ArrowDownLeft className="w-4 h-4" />
              </a>

              <a
                href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-[#D4AF37]/40 bg-[#141418]/80 hover:bg-[#1B1912] text-[#F5F2EB] hover:text-[#E5C158] text-sm sm:text-base font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <span>استشارة فنية عبر واتساب</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-3">
            <div className="rounded-2xl overflow-hidden border border-[#D4AF37]/30 bg-[#111115] shadow-2xl aspect-[4/3]">
              {showVideo && settings.heroVideoUrl ? (
                <video
                  key={settings.heroVideoUrl}
                  src={settings.heroVideoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={
                    settings.heroBackdropFilter
                      ? { filter: settings.heroBackdropFilter }
                      : undefined
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                <ResilientImage
                  src={activeImage}
                  alt={settings.heroTitle}
                  style={
                    settings.heroBackdropFilter
                      ? { filter: settings.heroBackdropFilter }
                      : undefined
                  }
                  className={`w-full h-full object-cover transition-opacity duration-500 ${motionClass}`}
                />
              )}
            </div>

            {showSlideshow && slides.length > 1 && (
              <div className="flex items-center justify-center gap-2">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`عرض الخلفية ${idx + 1}`}
                    onClick={() => setSlideIdx(idx)}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      idx === slideIdx % slides.length
                        ? 'w-7 bg-[#D4AF37]'
                        : 'w-2 bg-white/25 hover:bg-white/45'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Store Features Strip */}
        {settings.heroFeatures && settings.heroFeatures.length > 0 && (
          <div className="mt-14 pt-8 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {settings.heroFeatures.slice(0, 4).map((feat, idx) => (
              <div
                key={idx}
                className="p-5 rounded-xl border border-white/10 bg-[#121216]/85 hover:border-[#D4AF37]/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 mb-2 text-[#E5C158]">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <h3 className="text-sm font-bold text-[#F5F2EB]">{feat.title}</h3>
                </div>
                <p className="text-xs sm:text-sm text-[#9E988C] leading-relaxed">
                  {feat.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
