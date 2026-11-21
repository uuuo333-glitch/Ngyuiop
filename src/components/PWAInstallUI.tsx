import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import type { StoreLanguage } from '../i18n';

export function PhoneDownloadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <Smartphone className="w-full h-full" />
      <Download className="w-[54%] h-[54%] absolute bottom-[18%] bg-[#09090B]/90 rounded-full p-[1px]" />
    </span>
  );
}

interface MobileAppInstallBannerProps {
  visible: boolean;
  lang: StoreLanguage;
  storeName: string;
  onInstall: () => void;
  onDismiss: () => void;
}

export function MobileAppInstallBanner({
  visible,
  lang,
  storeName,
  onInstall,
  onDismiss,
}: MobileAppInstallBannerProps) {
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={lang === 'en' ? 'Install Mobile App' : 'تثبيت تطبيق المتجر'}
      className="md:hidden fixed bottom-[70px] inset-x-2.5 z-40 rounded-xl border border-[#D4AF37]/60 bg-[#12110E]/95 backdrop-blur-md px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.75)] flex items-center justify-between gap-2"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <img
          src="/pwa-192x192.png"
          alt={storeName}
          className="w-8 h-8 rounded-lg border border-[#D4AF37]/40 shrink-0 object-cover"
        />
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-[#F5F2EB] truncate">
            {lang === 'en' ? 'Faster App Experience' : 'تجربة أسرع عبر التطبيق'}
          </div>
          <div className="text-[10px] text-[#E5C158] truncate">
            {lang === 'en' ? 'Install directly on your phone' : 'وصول فوري من شاشة جوالك'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onInstall}
          className="h-8 px-2.5 rounded-lg bg-gradient-to-l from-[#D4AF37] to-[#E5C158] text-[#09090B] text-[11px] font-extrabold flex items-center gap-1 shadow-sm active:scale-95 transition-transform cursor-pointer whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{lang === 'en' ? 'Install Now' : 'تثبيت الآن'}</span>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          aria-label={lang === 'en' ? 'Close' : 'إغلاق'}
          className="w-7 h-7 rounded-lg border border-white/15 bg-[#1B1A16] text-[#9E988C] hover:text-white flex items-center justify-center cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

interface PWAInstallModalProps {
  mode: 'none' | 'ios' | 'android-guide';
  lang: StoreLanguage;
  storeName: string;
  onClose: () => void;
}

export function PWAInstallModal({ mode, lang, storeName, onClose }: PWAInstallModalProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (mode === 'none') return null;

  const isIOSMode = mode === 'ios';

  const handleCopyStoreLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#D4AF37]/45 bg-[#111115] text-[#F5F2EB] p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with App Icon */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt={storeName}
              className="w-12 h-12 rounded-2xl border border-[#D4AF37]/50 shadow-lg shrink-0 object-cover"
            />
            <div className="min-w-0">
              <h3 className="font-display text-base sm:text-lg font-bold text-[#F5F2EB] truncate">
                {isIOSMode
                  ? lang === 'en'
                    ? 'Install App on iPhone'
                    : 'تثبيت التطبيق على الآيفون'
                  : lang === 'en'
                    ? 'Install Mobile App'
                    : 'تثبيت تطبيق المتجر'}
              </h3>
              <p className="text-xs text-[#E5C158] truncate">{storeName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'en' ? 'Close' : 'إغلاق'}
            className="w-9 h-9 rounded-xl border border-white/10 bg-[#18181D] hover:border-[#D4AF37]/50 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOSMode ? (
          /* iOS Safari 2-Step Illustrated Guide */
          <div className="space-y-3">
            {/* Step 1 Card */}
            <div className="p-3.5 rounded-xl border border-[#D4AF37]/25 bg-[#161512] space-y-2.5">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-[#D4AF37] text-[#09090B] text-xs font-extrabold flex items-center justify-center shrink-0">
                  1
                </span>
                <div className="text-xs sm:text-sm font-bold text-[#F5F2EB]">
                  {lang === 'en'
                    ? 'Tap the Share button at the bottom'
                    : 'اضغط على زر المشاركة في الأسفل'}
                </div>
              </div>

              {/* Visual Safari Bottom Bar Preview */}
              <div className="rounded-xl border border-white/10 bg-[#0B0B0F] px-4 py-2.5 flex items-center justify-between text-[#7A756B]">
                <span className="text-xs">◀</span>
                <span className="text-xs">▶</span>
                <div className="relative flex items-center justify-center px-3 py-1 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37] text-[#E5C158]">
                  <Share className="w-5 h-5" />
                  <span className="ms-1.5 text-[11px] font-bold">مشاركة</span>
                </div>
                <span className="text-xs">📖</span>
                <span className="text-xs">❐</span>
              </div>
            </div>

            {/* Step 2 Card */}
            <div className="p-3.5 rounded-xl border border-[#D4AF37]/25 bg-[#161512] space-y-2.5">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-[#D4AF37] text-[#09090B] text-xs font-extrabold flex items-center justify-center shrink-0">
                  2
                </span>
                <div className="text-xs sm:text-sm font-bold text-[#F5F2EB]">
                  {lang === 'en'
                    ? 'Choose "Add to Home Screen"'
                    : 'اختر «إضافة إلى الصفحة الرئيسية»'}
                </div>
              </div>

              {/* Visual iOS Menu Item Preview */}
              <div className="rounded-xl border border-[#D4AF37]/35 bg-[#1C1B17] px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#F5F2EB]">
                  <PlusSquare className="w-5 h-5 text-[#E5C158]" />
                  <span>إضافة إلى الصفحة الرئيسية</span>
                </div>
                <span className="text-[11px] font-bold text-[#09090B] bg-[#D4AF37] px-2 py-0.5 rounded-md">
                  إضافة
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Android Chrome Visual Guide when native prompt not surfaced inside iframe/browser */
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl border border-[#D4AF37]/25 bg-[#161512] space-y-2.5">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-[#D4AF37] text-[#09090B] text-xs font-extrabold flex items-center justify-center shrink-0">
                  1
                </span>
                <div className="text-xs sm:text-sm font-bold text-[#F5F2EB]">
                  {lang === 'en'
                    ? 'Open the browser menu (⋮) in Chrome'
                    : 'افتح قائمة المتصفح (⋮) في أعلى Chrome'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0B0B0F] px-3.5 py-2 flex items-center justify-between text-xs text-[#C5BFB2]">
                <span className="truncate" dir="ltr">
                  {typeof window !== 'undefined' ? window.location.host : 'store'}
                </span>
                <span className="w-7 h-7 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/60 text-[#E5C158] flex items-center justify-center shrink-0">
                  <MoreVertical className="w-4 h-4" />
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[#D4AF37]/25 bg-[#161512] space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-[#D4AF37] text-[#09090B] text-xs font-extrabold flex items-center justify-center shrink-0">
                  2
                </span>
                <div className="text-xs sm:text-sm font-bold text-[#F5F2EB]">
                  {lang === 'en'
                    ? 'Tap "Install App" or "Add to Home Screen"'
                    : 'اختر «تثبيت التطبيق» أو «الإضافة إلى الشاشة الرئيسية»'}
                </div>
              </div>
              <div className="rounded-xl border border-[#D4AF37]/35 bg-[#1C1B17] px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-[#E5C158]">
                <span className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  <span>تثبيت التطبيق</span>
                </span>
                <span className="text-[11px] bg-[#D4AF37] text-[#09090B] px-2 py-0.5 rounded-md">
                  تثبيت
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyStoreLink}
              className="w-full h-10 rounded-xl border border-white/15 bg-[#16161B] hover:border-[#D4AF37]/50 text-xs text-[#C5BFB2] flex items-center justify-center gap-2 cursor-pointer"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">تم نسخ رابط المتجر لفتحه مباشرة في المتصفح</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#D4AF37]" />
                  <span>نسخ رابط المتجر للفتح في متصفح Chrome</span>
                </>
              )}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="btn-gold-wave w-full h-11 rounded-xl text-sm font-bold cursor-pointer"
        >
          {lang === 'en' ? 'Got it' : 'حسناً، فهمت'}
        </button>
      </div>
    </div>
  );
}
