import { useState } from 'react';
import { ExternalLink, HeartHandshake, Sparkles, X } from 'lucide-react';
import type { PublicSettings } from '../types';

interface CharityProps {
  settings: PublicSettings;
}

const DEFAULT_VERSE =
  '﴿ مَّثَلُ الَّذِينَ يُنفِقُونَ أَمْوَالَهُمْ فِي سَبِيلِ اللَّهِ كَمَثَلِ حَبَّةٍ أَنبَتَتْ سَبْعَ سَنَابِلَ فِي كُلِّ سُنبُلَةٍ مِّائَةُ حَبَّةٍ ۗ وَاللَّهُ يُضَاعِفُ لِمَن يَشَاءُ ﴾ [البقرة: 261]';

export function CharitySection({ settings }: CharityProps) {
  const organizations =
    settings.charityOrganizations && settings.charityOrganizations.length > 0
      ? settings.charityOrganizations
      : [
          {
            id: 'org-ehsan',
            name: 'منصة إحسان للعمل الخيري',
            description: 'المنصة الوطنية الرسمية للتبرعات الخيرية في المملكة العربية السعودية.',
            url: settings.charityUrl || 'https://ehsan.sa',
          },
        ];

  const verse = settings.charityPopupVerse || DEFAULT_VERSE;

  return (
    <section
      id="charity"
      aria-label="منصة إحسان والجمعيات الخيرية"
      className="border-t border-[#D4AF37]/25 bg-gradient-to-b from-[#0C0B09] to-[#09090B]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div className="rounded-2xl border border-[#D4AF37]/40 bg-[#12100B] p-6 sm:p-7 space-y-4 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-[#D4AF37]/40 bg-[#19150B] text-xs font-bold text-[#E5C158]">
            <HeartHandshake className="w-4 h-4" />
            <span>إحسان والجمعيات الخيرية المعتمدة</span>
          </div>

          <p className="font-display text-lg sm:text-2xl font-bold text-[#F5E1A4] leading-relaxed max-w-4xl mx-auto">
            {verse}
          </p>

          <p className="text-xs sm:text-sm text-[#C5BFB2]">
            {settings.charityPopupTitle || 'تصدق ولو بالقليل.. واجعل تجارتك مباركة'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {organizations.map((org) => (
            <a
              key={org.id}
              href={org.url || 'https://ehsan.sa'}
              target="_blank"
              rel="noopener noreferrer"
              className="group p-4 rounded-2xl border border-white/10 bg-[#121216] hover:border-[#D4AF37]/60 hover:bg-[#17140D] transition-all flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#F5F2EB] group-hover:text-[#E5C158] transition-colors">
                    {org.name}
                  </span>
                  <ExternalLink className="w-4 h-4 text-[#D4AF37] shrink-0" />
                </div>
                <p className="text-xs text-[#9E988C] leading-relaxed">{org.description}</p>
              </div>
              <div className="text-[11px] font-bold text-[#E5C158] flex items-center gap-1 pt-1 border-t border-white/10">
                <span>تبرع مباشرة عبر الموقع الرسمي</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CharityCornerPopup({ settings }: CharityProps) {
  const [dismissed, setDismissed] = useState(false);

  if (settings.charityPopupEnabled === false || dismissed) {
    return null;
  }

  const targetUrl = settings.charityUrl || 'https://ehsan.sa';
  const title = settings.charityPopupTitle || 'تصدق ولو بالقليل.. واجعل تجارتك مباركة';
  const verse = settings.charityPopupVerse || DEFAULT_VERSE;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 max-w-[320px] sm:max-w-[350px]">
      <a
        href={targetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative rounded-2xl border border-[#D4AF37]/75 bg-[#100E09]/95 backdrop-blur-md p-4 shadow-[0_14px_38px_-8px_rgba(212,175,55,0.45)] hover:border-[#F5E1A4] transition-all group"
      >
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }}
          aria-label="إغلاق التذكير"
          className="absolute top-2.5 left-2.5 w-6 h-6 rounded-full border border-white/15 bg-black/60 hover:border-[#D4AF37] text-[#C5BFB2] hover:text-white flex items-center justify-center cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="space-y-2.5 pl-6">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#E5C158]">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>منصة إحسان الخيرية</span>
          </div>

          <div className="font-display text-sm sm:text-base font-bold text-[#F5F2EB] group-hover:text-[#F5E1A4] transition-colors leading-snug">
            {title}
          </div>

          <p className="text-[11px] text-[#D8C798] leading-relaxed border-r-2 border-[#D4AF37]/60 pr-2">
            {verse}
          </p>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-bold">
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>اضغط للتبرع عبر منصة إحسان</span>
            <ExternalLink className="w-3 h-3" />
          </div>
        </div>
      </a>
    </div>
  );
}
