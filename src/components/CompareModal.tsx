import { Scale, ShoppingBag, Trash2, X } from 'lucide-react';
import {
  formatCurrencyPrice,
  getEffectivePriceSar,
  t,
  type StoreLanguage,
} from '../i18n';
import type { CurrencyCode, PublicProduct, PublicSettings } from '../types';
import { ResilientImage } from './ResilientImage';

interface CompareModalProps {
  open: boolean;
  products: PublicProduct[];
  settings: PublicSettings;
  currency: CurrencyCode;
  lang: StoreLanguage;
  onClose: () => void;
  onRemoveProduct: (productId: string) => void;
  onAddToCart: (product: PublicProduct) => void;
}

function detectEngineKind(product: PublicProduct, lang: StoreLanguage): string {
  const txt = `${product.name} ${product.category} ${product.description} ${(product.specs || [])
    .map((s) => `${s.label} ${s.value}`)
    .join(' ')}`.toLowerCase();
  const hasDiesel = txt.includes('ديزل') || txt.includes('diesel') || txt.includes('dpf');
  const hasGas = txt.includes('بنزين') || txt.includes('gasoline');
  if (hasDiesel && hasGas) {
    return lang === 'en' ? 'Diesel & Gasoline (Dual Euro-6)' : 'ديزل وبنزين (متوافق مع الفئتين)';
  }
  if (hasDiesel) {
    return lang === 'en' ? 'Diesel / DPF Heavy Duty (High Flow)' : 'ديزل / فلتر DPF (كفاءة منع الدخان)';
  }
  if (hasGas) {
    return lang === 'en' ? 'Gasoline Euro-5 / Euro-6 (400 CPSI)' : 'بنزين Euro-5 / Euro-6 (تنقية عالية)';
  }
  return lang === 'en' ? 'Universal Catalytic System' : 'نظام حفاز متعدد التوافق';
}

export function CompareModal({
  open,
  products,
  settings,
  currency,
  lang,
  onClose,
  onRemoveProduct,
  onAddToCart,
}: CompareModalProps) {
  if (!open) return null;

  const allSpecLabels = Array.from(
    new Set(products.flatMap((p) => (p.specs || []).map((s) => s.label)).filter(Boolean))
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-2xl border border-[#D4AF37]/35 bg-[#111115] text-[#F5F2EB] shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 bg-[#14120E] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Scale className="w-5 h-5 text-[#E5C158]" />
            <div>
              <h2 className="font-display text-lg font-bold text-[#F5F2EB]">
                {t(lang, 'compareNow')} ({products.length})
              </h2>
              <p className="text-xs text-[#9E988C]">
                {lang === 'en'
                  ? 'Side-by-side comparison of specs, pricing, and diesel/gasoline efficiency'
                  : 'جدول مقارنة الفروقات في المواصفات، السعر، وكفاءة محركات الديزل والبنزين'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-9 h-9 rounded-lg border border-white/15 bg-[#16161B] hover:border-[#D4AF37] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-x-auto max-h-[78vh] overflow-y-auto">
          {products.length < 2 ? (
            <div className="py-12 text-center text-sm text-[#9E988C]">
              {lang === 'en'
                ? 'Please select at least 2 products to compare.'
                : 'يرجى اختيار منتجين على الأقل من المتجر لعرض جدول المقارنة.'}
            </div>
          ) : (
            <table className="w-full min-w-[640px] text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-start text-[#9E988C] w-44 align-top">
                    {lang === 'en' ? 'Feature' : 'وجه المقارنة'}
                  </th>
                  {products.map((product) => (
                    <th key={product.id} className="p-3 align-top text-start min-w-[200px]">
                      <div className="space-y-2.5">
                        <div className="relative aspect-square w-36 mx-auto rounded-xl border border-white/10 bg-[#0B0B0F] p-2 overflow-hidden">
                          <ResilientImage
                            src={product.images[0]}
                            alt={product.name}
                            className="w-full h-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => onRemoveProduct(product.id)}
                            title={lang === 'en' ? 'Remove' : 'إزالة'}
                            className="absolute top-1.5 end-1.5 w-7 h-7 rounded-lg bg-black/75 border border-white/15 text-red-400 hover:text-red-300 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="font-bold text-[#F5F2EB] text-sm leading-snug">
                          {lang === 'en' ? product.nameEn || product.name : product.name}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                <tr>
                  <td className="p-3 font-medium text-[#9E988C]">
                    {lang === 'en' ? 'Product Code (SKU)' : 'كود المنتج'}
                  </td>
                  {products.map((p) => (
                    <td key={p.id} className="p-3 tabular-nums text-[#E5C158] font-mono text-xs">
                      {p.sku || p.id.toUpperCase().slice(0, 10)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-medium text-[#9E988C]">
                    {lang === 'en' ? 'Price' : 'السعر'}
                  </td>
                  {products.map((p) => {
                    const effSar = getEffectivePriceSar(p, settings.priceDisplayMode);
                    const formatted = formatCurrencyPrice(
                      effSar,
                      currency,
                      settings.currencyRates,
                      lang
                    );
                    return (
                      <td key={p.id} className="p-3 font-bold text-[#E5C158] text-base tabular-nums">
                        {formatted.valueText} {formatted.unit}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="p-3 font-medium text-[#9E988C]">
                    {lang === 'en' ? 'Diesel / Gasoline Efficiency' : 'كفاءة الديزل / البنزين'}
                  </td>
                  {products.map((p) => (
                    <td key={p.id} className="p-3 text-emerald-300 font-medium">
                      {detectEngineKind(p, lang)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-medium text-[#9E988C]">
                    {lang === 'en' ? 'Estimated Fuel Gain' : 'نسبة تحسين استهلاك الوقود'}
                  </td>
                  {products.map((p) => (
                    <td key={p.id} className="p-3 tabular-nums text-[#F5F2EB]">
                      +{p.fuelEfficiencyGainPercent || 14}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-medium text-[#9E988C]">
                    {lang === 'en' ? 'Availability' : 'التوفر'}
                  </td>
                  {products.map((p) => (
                    <td key={p.id} className="p-3">
                      <span
                        className={
                          p.inStock ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'
                        }
                      >
                        {p.inStock ? t(lang, 'availableInStock') : t(lang, 'outOfStock')}
                      </span>
                    </td>
                  ))}
                </tr>
                {allSpecLabels.map((label) => (
                  <tr key={label}>
                    <td className="p-3 font-medium text-[#9E988C]">{label}</td>
                    {products.map((p) => {
                      const match = (p.specs || []).find((s) => s.label === label);
                      return (
                        <td key={p.id} className="p-3 text-[#C5BFB2]">
                          {match?.value || '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="p-3 font-medium text-[#9E988C]">
                    {lang === 'en' ? 'Order' : 'الطلب السريع'}
                  </td>
                  {products.map((p) => (
                    <td key={p.id} className="p-3">
                      <button
                        type="button"
                        disabled={!p.inStock}
                        onClick={() => {
                          onAddToCart(p);
                          onClose();
                        }}
                        className="btn-gold-wave h-9 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>{t(lang, 'addToCart')}</span>
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
