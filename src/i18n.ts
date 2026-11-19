import type { CurrencyCode, PublicProduct } from './types';

export type StoreLanguage = 'ar' | 'en';

export const DEFAULT_CURRENCY_RATES: Record<CurrencyCode, number> = {
  SAR: 1,
  AED: 0.98,
  KWD: 0.082,
  QAR: 0.97,
  BHD: 0.1,
  OMR: 0.103,
};

export const CURRENCY_META: Record<
  CurrencyCode,
  { symbolAr: string; symbolEn: string; nameAr: string; nameEn: string; decimals: number }
> = {
  SAR: { symbolAr: 'ر.س', symbolEn: 'SAR', nameAr: 'الريال السعودي', nameEn: 'Saudi Riyal', decimals: 0 },
  AED: { symbolAr: 'د.إ', symbolEn: 'AED', nameAr: 'الدرهم الإماراتي', nameEn: 'UAE Dirham', decimals: 0 },
  KWD: { symbolAr: 'د.ك', symbolEn: 'KWD', nameAr: 'الدينار الكويتي', nameEn: 'Kuwaiti Dinar', decimals: 2 },
  QAR: { symbolAr: 'ر.ق', symbolEn: 'QAR', nameAr: 'الريال القطري', nameEn: 'Qatari Riyal', decimals: 0 },
  BHD: { symbolAr: 'د.ب', symbolEn: 'BHD', nameAr: 'الدينار البحريني', nameEn: 'Bahraini Dinar', decimals: 2 },
  OMR: { symbolAr: 'ر.ع', symbolEn: 'OMR', nameAr: 'الريال العماني', nameEn: 'Omani Rial', decimals: 2 },
};

export function getEffectivePriceSar(
  product: Pick<PublicProduct, 'priceSar' | 'wholesalePriceSar'>,
  priceDisplayMode?: 'retail' | 'wholesale'
): number {
  if (
    priceDisplayMode === 'wholesale' &&
    typeof product.wholesalePriceSar === 'number' &&
    product.wholesalePriceSar > 0
  ) {
    return product.wholesalePriceSar;
  }
  return product.priceSar;
}

export function formatCurrencyPrice(
  amountSar: number,
  currency: CurrencyCode,
  rates?: Partial<Record<CurrencyCode, number>>,
  lang: StoreLanguage = 'ar'
): { valueText: string; unit: string; numeric: number } {
  const rate = (rates && rates[currency]) || DEFAULT_CURRENCY_RATES[currency] || 1;
  const meta = CURRENCY_META[currency] || CURRENCY_META.SAR;
  const converted = amountSar * rate;
  const rounded =
    meta.decimals > 0
      ? Number(converted.toFixed(meta.decimals))
      : Math.round(converted);
  const locale = lang === 'en' ? 'en-US' : 'ar-SA';
  return {
    valueText: rounded.toLocaleString(locale, {
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    }),
    unit: lang === 'en' ? meta.symbolEn : meta.symbolAr,
    numeric: rounded,
  };
}

const DICT = {
  ar: {
    navHome: 'الرئيسية',
    navProducts: 'المنتجات',
    navOffers: 'العروض',
    navAbout: 'من نحن',
    searchPlaceholder: 'ابحث عن دبة تلوث ديزل، بنزين، فلتر DPF أو كود المنتج...',
    customerLogin: 'دخول العملاء',
    cart: 'السلة',
    customFab: 'طلب تصنيع خاص',
    approvedProducts: 'المنتجات المعتمدة',
    catalogHeading: 'تشكيلة دبات التلوث للديزل والبنزين',
    allCategory: 'الكل',
    noProductsInCategory: 'لا توجد منتجات منشورة في هذا التصنيف حالياً.',
    availableInStock: 'متوفر للإنتاج والتسليم',
    outOfStock: 'غير متوفر حالياً',
    addToCart: 'أضف إلى السلة',
    whatsapp: 'واتساب',
    whatsappDirectOrder: 'طلب أو استفسار مباشر عبر واتساب',
    compare: 'قارن',
    compared: 'محدد للمقارنة',
    compareNow: 'مقارنة المنتجات',
    clearCompare: 'مسح',
    wishlistAdd: 'إضافة للمفضلة',
    wishlistRemove: 'في المفضلة',
    wholesaleBadge: 'سعر الجملة',
    specsTitle: 'المواصفات الفنية',
    installmentsTitle: 'خيار الدفع بالتقسيط بدون فوائد',
    installmentsText: 'قسّم مشترياتك على 4 دفعات شهرية ميسرة بقيمة',
    fuelCalcTitle: 'حاسبة التوفير في الوقود',
    fuelCalcDesc: 'قدّر التوفير الشهري والسنوي المتوقع في استهلاك الوقود بعد تركيب دبة التلوث النظيفة.',
    fuelMonthlySpend: 'متوسط صرفك الشهري للوقود (ر.س)',
    fuelMonthlySave: 'التوفير الشهري التقديري',
    fuelYearlySave: 'التوفير السنوي التقديري',
    guideTitle: 'دليل التوافق والتركيب',
    guideDownloadPdf: 'تحميل دليل التركيب (PDF)',
    reviewsTitle: 'تقييمات وآراء العملاء',
    reviewsEmpty: 'لا توجد تقييمات منشورة لهذا المنتج حتى الآن. كن أول من يقيّم!',
    writeReview: 'أضف تقييمك للمنتج',
    yourName: 'الاسم',
    yourComment: 'تعليقك وتجربتك مع المنتج',
    submitReview: 'إرسال التقييم',
    reviewPendingNotice: 'شكراً لك! تم استلام تقييمك وسيُنشر فور مراجعة واعتماد المالك.',
    askWhatsappFloating: 'استفسر عبر واتساب',
    addedToCartNotice: 'تمت إضافة المنتج إلى السلة',
    wishlistTitle: 'قائمة المفضلة',
  },
  en: {
    navHome: 'Home',
    navProducts: 'Products',
    navOffers: 'Offers',
    navAbout: 'About Us',
    searchPlaceholder: 'Search catalytic converter, diesel DPF, gasoline, or SKU...',
    customerLogin: 'Customer Portal',
    cart: 'Cart',
    customFab: 'Custom Fabrication',
    approvedProducts: 'Certified Engineering',
    catalogHeading: 'Diesel & Gasoline Catalytic Converters',
    allCategory: 'All',
    noProductsInCategory: 'No published products in this category yet.',
    availableInStock: 'In Stock & Ready',
    outOfStock: 'Out of Stock',
    addToCart: 'Add to Cart',
    whatsapp: 'WhatsApp',
    whatsappDirectOrder: 'Order or Inquire via WhatsApp',
    compare: 'Compare',
    compared: 'Selected',
    compareNow: 'Compare Products',
    clearCompare: 'Clear',
    wishlistAdd: 'Add to Wishlist',
    wishlistRemove: 'Wishlisted',
    wholesaleBadge: 'Wholesale Price',
    specsTitle: 'Technical Specifications',
    installmentsTitle: 'Interest-Free Installments',
    installmentsText: 'Split into 4 monthly interest-free payments of',
    fuelCalcTitle: 'Fuel Savings Calculator',
    fuelCalcDesc: 'Estimate monthly & annual fuel savings after replacing a clogged converter.',
    fuelMonthlySpend: 'Monthly Fuel Spend (SAR)',
    fuelMonthlySave: 'Estimated Monthly Savings',
    fuelYearlySave: 'Estimated Yearly Savings',
    guideTitle: 'Compatibility & Installation Guide',
    guideDownloadPdf: 'Download Installation Guide (PDF)',
    reviewsTitle: 'Customer Reviews',
    reviewsEmpty: 'No published reviews for this product yet. Be the first to review!',
    writeReview: 'Leave a Product Review',
    yourName: 'Your Name',
    yourComment: 'Share your experience with this converter',
    submitReview: 'Submit Review',
    reviewPendingNotice: 'Thank you! Your review has been submitted for owner approval.',
    askWhatsappFloating: 'Ask via WhatsApp',
    addedToCartNotice: 'Added to shopping cart',
    wishlistTitle: 'My Wishlist',
  },
} as const;

export type DictKey = keyof typeof DICT.ar;

export function t(lang: StoreLanguage, key: DictKey): string {
  return DICT[lang]?.[key] ?? DICT.ar[key];
}
