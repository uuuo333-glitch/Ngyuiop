import { Truck } from 'lucide-react';
import type { PublicSettings } from '../types';

interface CarrierMeta {
  key: string;
  label: string;
  shortMark: string;
  accentHex: string;
  subLabel: string;
}

const KNOWN_CARRIERS: CarrierMeta[] = [
  {
    key: 'زاجل',
    label: 'زاجل (Zajil)',
    shortMark: 'ZAJIL',
    accentHex: '#F97316',
    subLabel: 'شحن سريع لجميع المدن',
  },
  {
    key: 'سبل',
    label: 'سبل - البريد السعودي (SPL)',
    shortMark: 'SPL',
    accentHex: '#10B981',
    subLabel: 'توصيل العنوان الوطني',
  },
  {
    key: 'أرامكس',
    label: 'أرامكس (Aramex)',
    shortMark: 'aramex',
    accentHex: '#EF4444',
    subLabel: 'شحن محلي ودولي',
  },
  {
    key: 'سمسا',
    label: 'سمسا إكسبرس (SMSA)',
    shortMark: 'SMSA',
    accentHex: '#A855F7',
    subLabel: 'توصيل سريع ومضمون',
  },
  {
    key: 'DHL',
    label: 'DHL إكسبرس',
    shortMark: 'DHL',
    accentHex: '#FACC15',
    subLabel: 'شحن دولي وداخلي',
  },
  {
    key: 'ريدبوكس',
    label: 'ريدبوكس (RedBox)',
    shortMark: 'RedBox',
    accentHex: '#F43F5E',
    subLabel: 'خزائن واستلام ذكي',
  },
  {
    key: 'J&T',
    label: 'J&T إكسبرس',
    shortMark: 'J&T',
    accentHex: '#DC2626',
    subLabel: 'توصيل لباب المنزل',
  },
];

function resolveCarrierMeta(name: string): CarrierMeta {
  const lower = name.toLowerCase();
  const matched = KNOWN_CARRIERS.find(
    (c) => lower.includes(c.key.toLowerCase()) || lower.includes(c.shortMark.toLowerCase())
  );
  if (matched) {
    return { ...matched, label: name };
  }
  return {
    key: name,
    label: name,
    shortMark: name.slice(0, 4).toUpperCase(),
    accentHex: '#D4AF37',
    subLabel: 'شركة شحن معتمدة',
  };
}

interface ShippingCarriersLogosProps {
  settings: PublicSettings;
  interactive?: boolean;
  selectedCarrier?: string;
  onSelectCarrier?: (carrier: string) => void;
}

export function ShippingCarriersLogos({
  settings,
  interactive = false,
  selectedCarrier = '',
  onSelectCarrier,
}: ShippingCarriersLogosProps) {
  const carriers =
    settings.shippingCarriers && settings.shippingCarriers.length > 0
      ? settings.shippingCarriers
      : KNOWN_CARRIERS.map((c) => c.label);

  if (!interactive && settings.showShippingLogos === false) {
    return null;
  }

  if (interactive) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-[#C5BFB2]">
          <Truck className="w-3.5 h-3.5 text-[#E5C158]" />
          <span>اختر شركة الشحن المفضلة</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {carriers.map((carrierName) => {
            const meta = resolveCarrierMeta(carrierName);
            const active = selectedCarrier === carrierName;
            return (
              <button
                key={carrierName}
                type="button"
                onClick={() => onSelectCarrier?.(carrierName)}
                className={`p-2 rounded-xl border text-right flex items-center gap-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#D4AF37] bg-[#1A160D]'
                    : 'border-white/10 bg-[#141418] hover:border-white/25'
                }`}
              >
                <span
                  className="w-9 h-7 rounded-md flex items-center justify-center text-[10px] font-extrabold shrink-0 border border-white/10 tracking-tighter"
                  style={{
                    backgroundColor: `${meta.accentHex}22`,
                    color: meta.accentHex,
                  }}
                >
                  {meta.shortMark}
                </span>
                <span className="text-[11px] font-bold text-[#F5F2EB] leading-tight line-clamp-2">
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="شركاء الشحن والتوصيل"
      className="border-t border-[#D4AF37]/20 bg-[#0D0D10]/90"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#E5C158]" />
            <h3 className="text-sm font-bold text-[#F5F2EB]">
              شعارات وشركاء الشحن المعتمدون لجميع مناطق المملكة والخليج
            </h3>
          </div>
          <span className="text-xs text-[#9E988C]">
            إشعارات شحن فورية ورقم تتبع مباشر فور تسليم الطلب
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {carriers.map((carrierName) => {
            const meta = resolveCarrierMeta(carrierName);
            return (
              <div
                key={carrierName}
                className="p-2.5 rounded-xl border border-white/10 bg-[#121216] hover:border-[#D4AF37]/40 transition-colors flex items-center gap-2.5"
              >
                <div
                  className="w-10 h-8 rounded-lg flex items-center justify-center text-[11px] font-extrabold shrink-0 border border-white/10"
                  style={{
                    backgroundColor: `${meta.accentHex}1F`,
                    color: meta.accentHex,
                  }}
                >
                  {meta.shortMark}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#F5F2EB] truncate">{meta.label}</div>
                  <div className="text-[10px] text-[#9E988C] truncate">{meta.subLabel}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
