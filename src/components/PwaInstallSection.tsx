import { useEffect, useState } from 'react';
import { Check, Download, Smartphone } from 'lucide-react';
import { getPwaState, promptToInstallPwa, subscribeToPwaState } from '../pwa';

export function PwaInstallSection() {
  const [pwaState, setPwaState] = useState(getPwaState);

  useEffect(() => subscribeToPwaState(() => setPwaState(getPwaState())), []);

  async function handleInstall() {
    if (pwaState.canPromptInstall) await promptToInstallPwa();
  }

  return (
    <section aria-labelledby="download-app-title" className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
      <div className="rounded-3xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#19170F] to-[#111114] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="max-w-xl">
          <p className="text-xs font-bold tracking-wide text-[#E5C158]">تطبيق المتجر</p>
          <h2 id="download-app-title" className="mt-2 text-xl sm:text-2xl font-bold text-[#F5F2EB]">
            تسوّق بسهولة من هاتفك أو جهازك اللوحي
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#9E988C]">
            ثبّت نسخة المتجر على Android أو iPhone أو iPad وأضفها إلى شاشتك الرئيسية.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-[#C5BFB2]">
            <Smartphone aria-hidden="true" className="w-5 h-5 text-[#E5C158]" />
            <span>Android · iPhone · iPad</span>
          </div>
          {pwaState.installed ? (
            <div role="status" className="min-h-11 px-4 rounded-xl bg-emerald-950/50 text-emerald-200 text-sm font-bold inline-flex items-center gap-2">
              <Check aria-hidden="true" className="w-4 h-4" />
              <span>التطبيق مثبت</span>
            </div>
          ) : pwaState.canPromptInstall ? (
            <button
              type="button"
              onClick={handleInstall}
              className="min-h-11 px-5 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#09090B] text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Download aria-hidden="true" className="w-4 h-4" />
              <span>تثبيت التطبيق</span>
            </button>
          ) : null}
        </div>

        <div
          id="pwa-install-instructions"
          role="region"
          aria-label="إرشادات تثبيت التطبيق"
          className="basis-full rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5 text-sm text-[#C5BFB2]"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <p className="leading-relaxed">
              <strong className="text-[#F5F2EB]">Android:</strong> افتح الصفحة في Chrome، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» من القائمة.
            </p>
            <p className="leading-relaxed">
              <strong className="text-[#F5F2EB]">iPhone وiPad:</strong> افتح الصفحة في Safari، اضغط «مشاركة»، ثم اختر «إضافة إلى الشاشة الرئيسية» واضغط «إضافة».
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
