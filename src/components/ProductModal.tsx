import { useEffect, useState } from 'react';
import {
  FileText,
  Fuel,
  Heart,
  MessageCircle,
  Ruler,
  Scale,
  ShoppingBag,
  Star,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  X,
} from 'lucide-react';
import {
  formatCurrencyPrice,
  getEffectivePriceSar,
  t,
  type StoreLanguage,
} from '../i18n';
import type {
  CurrencyCode,
  ProductReview,
  PublicProduct,
  PublicSettings,
} from '../types';
import { DEFAULT_PRODUCT_IMAGE, ResilientImage } from './ResilientImage';
import { ShareButton } from './ShareButton';

interface ProductModalProps {
  product: PublicProduct | null;
  settings: PublicSettings;
  currency: CurrencyCode;
  lang: StoreLanguage;
  reviews: ProductReview[];
  isWishlisted?: boolean;
  isCompared?: boolean;
  onToggleWishlist?: (productId: string) => void;
  onToggleCompare?: (productId: string) => void;
  onClose: () => void;
  onAddToCart: (product: PublicProduct) => void;
  customerToken?: string | null;
  onRequestLogin?: () => void;
  onReactionUpdated?: (productId: string, summary: { likeCount: number; dislikeCount: number; reaction: 'like' | 'dislike' | null }) => void;
}

export function ProductModal({
  product,
  settings,
  currency,
  lang,
  reviews,
  isWishlisted = false,
  isCompared = false,
  onToggleWishlist,
  onToggleCompare,
  onClose,
  onAddToCart,
  customerToken,
  onRequestLogin,
  onReactionUpdated,
}: ProductModalProps) {
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [productReaction, setProductReaction] = useState<'like' | 'dislike' | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [dislikeCount, setDislikeCount] = useState(0);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reactionNotice, setReactionNotice] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [monthlyFuelSpend, setMonthlyFuelSpend] = useState(800);

  // Customer Review Submission Form
  const [reviewerName, setReviewerName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewNotice, setReviewNotice] = useState('');
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    setSelectedImageIdx(0);
    setSelectedSize(
      Array.isArray(product?.sizes) && product.sizes.length > 0 ? product.sizes[0] : ''
    );
    setReviewNotice('');
    setReviewError('');
    setProductReaction(product?.myReaction || null);
    setLikeCount(product?.likeCount || 0);
    setDislikeCount(product?.dislikeCount || 0);
    setReactionNotice('');
  }, [product?.id, product?.sizes, product?.myReaction, product?.likeCount, product?.dislikeCount]);

  if (!product) return null;

  const productSizes = Array.isArray(product.sizes)
    ? product.sizes.map((s) => s.trim()).filter(Boolean)
    : [];

  const displayName = lang === 'en' ? product.nameEn || product.name : product.name;
  const displayDesc =
    lang === 'en' ? product.descriptionEn || product.description : product.description;

  const effectiveSar = getEffectivePriceSar(product, settings.priceDisplayMode);
  const priceDisplay = formatCurrencyPrice(
    effectiveSar,
    currency,
    settings.currencyRates,
    lang
  );
  const compareAtDisplay =
    product.compareAtPriceSar && product.compareAtPriceSar > effectiveSar
      ? formatCurrencyPrice(
          product.compareAtPriceSar,
          currency,
          settings.currencyRates,
          lang
        )
      : null;


  const usdEquivalent = (effectiveSar * settings.sarToUsdRate).toFixed(2);

  const rawDigits = settings.whatsappNumber.replace(/\D/g, '');
  const cleanPhone =
    rawDigits.startsWith('05') && rawDigits.length === 10
      ? `966${rawDigits.slice(1)}`
      : rawDigits;
  const whatsappText = encodeURIComponent(
    lang === 'en'
      ? `Hello, I want to inquire/order:\n• ${displayName}\n${selectedSize ? `• Size: ${selectedSize}\n` : ''}${product.sku ? `• SKU: ${product.sku}\n` : ''}• Price: ${priceDisplay.valueText} ${priceDisplay.unit}`
      : `مرحباً، أرغب في طلب / الاستفسار عن المنتج التالي:\n• ${displayName}\n${selectedSize ? `• المقاس المختار: ${selectedSize}\n` : ''}${product.sku ? `• كود المنتج: ${product.sku}\n` : ''}• السعر: ${priceDisplay.valueText} ${priceDisplay.unit}`
  );

  // Fuel Savings Estimation
  const gainPct = Math.min(35, Math.max(5, Number(product.fuelEfficiencyGainPercent) || 14));
  const monthlySaveSar = Math.round((monthlyFuelSpend * gainPct) / 100);
  const yearlySaveSar = monthlySaveSar * 12;
  const monthlySaveDisplay = formatCurrencyPrice(
    monthlySaveSar,
    currency,
    settings.currencyRates,
    lang
  );
  const yearlySaveDisplay = formatCurrencyPrice(
    yearlySaveSar,
    currency,
    settings.currencyRates,
    lang
  );

  const productReviews = reviews.filter((r) => r.productId === product.id);
  const avgRating =
    productReviews.length > 0
      ? (
          productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length
        ).toFixed(1)
      : null;

  const hasInstallGuide =
    Boolean(product.installationGuidePdfUrl) ||
    (product.installationGuideImages && product.installationGuideImages.length > 0);

  const handleProductReaction = async (reaction: 'like' | 'dislike') => {
    if (!customerToken) {
      setReactionNotice('سجّل الدخول بحساب العميل للمشاركة برأيك.');
      onRequestLogin?.();
      return;
    }

    setReactionBusy(true);
    setReactionNotice('');
    try {
      const res = await fetch(`/api/products/${product.id}/reaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({ reaction }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReactionNotice(data.error || 'تعذر حفظ تفاعلك.');
        return;
      }
      setLikeCount(Number(data.likeCount) || 0);
      setDislikeCount(Number(data.dislikeCount) || 0);
      setProductReaction(data.reaction || null);
      onReactionUpdated?.(product.id, data);
    } catch {
      setReactionNotice('تعذر الاتصال بالخادم لحفظ تفاعلك.');
    } finally {
      setReactionBusy(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerName.trim() || !reviewComment.trim()) return;
    setSubmittingReview(true);
    setReviewError('');
    setReviewNotice('');
    try {
      const res = await fetch(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: reviewerName.trim(),
          rating: reviewRating,
          comment: reviewComment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReviewError(data.error || 'تعذر إرسال التقييم.');
        return;
      }
      setReviewerName('');
      setReviewComment('');
      setReviewRating(5);
      setReviewNotice(t(lang, 'reviewPendingNotice'));
    } catch {
      setReviewError(
        lang === 'en' ? 'Connection error while submitting review.' : 'خطأ في الاتصال بالخادم.'
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-2xl border border-[#D4AF37]/30 bg-[#111115] text-[#F5F2EB] shadow-2xl overflow-hidden my-auto max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق التفاصيل"
          className="sticky top-4 float-end me-4 mt-4 z-20 w-10 h-10 rounded-xl border border-white/15 bg-[#16161B] hover:border-[#D4AF37] flex items-center justify-center text-[#F5F2EB] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Gallery Column (1:1 Studio Container) */}
          <div className="lg:col-span-5 p-5 bg-[#0C0C0F] border-b lg:border-b-0 lg:border-e border-white/10 space-y-3">
            <div className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-[#0B0B0F] p-2">
              <ResilientImage
                src={product.images?.[selectedImageIdx] || product.images?.[0]}
                defaultFallbackSrc={DEFAULT_PRODUCT_IMAGE}
                alt={displayName}
                className="w-full h-full object-contain rounded-lg"
              />
            </div>

            {product.images.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImageIdx(i)}
                    className={`w-16 h-16 aspect-square p-1 bg-[#0B0B0F] rounded-lg overflow-hidden border shrink-0 cursor-pointer ${
                      i === selectedImageIdx ? 'border-[#D4AF37]' : 'border-white/10 opacity-70'
                    }`}
                  >
                    <ResilientImage
                      src={img}
                      alt={`${displayName} ${i + 1}`}
                      className="w-full h-full object-contain"
                    />
                  </button>
                ))}
              </div>
            )}

            {product.videoUrl && product.showProductVideo !== false && (
              <video
                src={product.videoUrl}
                poster={product.images?.[0]}
                controls
                playsInline
                preload="metadata"
                aria-label={`فيديو ${displayName}`}
                className="w-full max-h-72 rounded-xl border border-white/10 bg-black"
              />
            )}

            {/* Quick Wishlist & Compare Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {onToggleWishlist && (
                <button
                  type="button"
                  onClick={() => onToggleWishlist(product.id)}
                  className={`flex-1 h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    isWishlisted
                      ? 'border-red-500/50 bg-red-950/40 text-red-300'
                      : 'border-white/15 bg-[#16161B] text-[#C5BFB2] hover:border-red-400/50'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-current' : ''}`} />
                  <span>{isWishlisted ? t(lang, 'wishlistRemove') : t(lang, 'wishlistAdd')}</span>
                </button>
              )}
              {onToggleCompare && (
                <button
                  type="button"
                  onClick={() => onToggleCompare(product.id)}
                  className={`flex-1 h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    isCompared
                      ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                      : 'border-white/15 bg-[#16161B] text-[#E5C158] hover:border-[#D4AF37]'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>{isCompared ? t(lang, 'compared') : t(lang, 'compare')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Purchase & Technical Details Column */}
          <div className="lg:col-span-7 p-6 space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#E5C158]">
                <span>{product.category}</span>
                <span aria-hidden="true">·</span>
                <span>{product.inStock ? t(lang, 'availableInStock') : t(lang, 'outOfStock')}</span>
                {product.sku && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[#C5BFB2]" dir="ltr">
                      SKU: {product.sku}
                    </span>
                  </>
                )}
                {avgRating && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {avgRating} ({productReviews.length})
                    </span>
                  </>
                )}
              </div>

              <h2 className="font-display text-xl sm:text-2xl font-bold leading-snug text-[#F5F2EB]">
                {displayName}
              </h2>

              <div className="flex flex-wrap items-baseline gap-3 pt-1 tabular-nums">
                <span className="text-2xl font-bold text-[#E5C158]">
                  {priceDisplay.valueText} {priceDisplay.unit}
                </span>
                <span className="text-xs text-[#9E988C]">(≈ ${usdEquivalent} USD)</span>
                {compareAtDisplay && (
                  <span className="text-sm text-[#847E73] line-through">
                    {compareAtDisplay.valueText} {compareAtDisplay.unit}
                  </span>
                )}
              </div>

              {settings.installmentsEnabled !== false &&
                (settings.tabbyEnabled === true || settings.tamaraEnabled === true) && (
                <div className="p-3.5 rounded-xl border border-[#D4AF37]/30 bg-[#15130E] flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-[#F5E1A4]">شعارات خيارات التقسيط</div>
                    <div className="text-[10px] text-[#9E988C]">التفعيل الفعلي يتطلب ربط حساب التاجر لدى المزود.</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {settings.tabbyEnabled === true && (
                      <span className="px-2.5 py-1 rounded-lg bg-white text-[#09090B] text-[11px] font-bold inline-flex items-center gap-1">
                        <img src="https://thesvg.org/icons/tabby/default.svg" alt="Tabby" width="30" height="16" />
                        <span>تقسيط</span>
                      </span>
                    )}
                    {settings.tamaraEnabled === true && (
                      <span className="px-2.5 py-1 rounded-lg bg-white text-[#09090B] text-[11px] font-bold inline-flex items-center gap-1">
                        <img src="https://thesvg.org/icons/tamara/default.svg" alt="Tamara" width="34" height="16" />
                        <span>تقسيط</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              <p className="text-sm text-[#C5BFB2] leading-relaxed">{displayDesc}</p>

              <div className="p-3 rounded-xl border border-white/10 bg-[#15151A] space-y-2">
                <p className="text-xs font-bold text-[#C5BFB2]">ما رأيك بهذا المنتج؟</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={reactionBusy}
                    aria-pressed={productReaction === 'like'}
                    onClick={() => void handleProductReaction('like')}
                    className={`min-h-9 px-3 rounded-lg border text-xs inline-flex items-center gap-2 disabled:opacity-50 ${productReaction === 'like' ? 'border-emerald-400/60 bg-emerald-950/50 text-emerald-200' : 'border-white/10 bg-[#111115] text-[#C5BFB2]'}`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>أعجبني</span>
                    <span className="tabular-nums">{likeCount.toLocaleString('ar-SA')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={reactionBusy}
                    aria-pressed={productReaction === 'dislike'}
                    onClick={() => void handleProductReaction('dislike')}
                    className={`min-h-9 px-3 rounded-lg border text-xs inline-flex items-center gap-2 disabled:opacity-50 ${productReaction === 'dislike' ? 'border-red-400/60 bg-red-950/40 text-red-200' : 'border-white/10 bg-[#111115] text-[#C5BFB2]'}`}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    <span>لم يعجبني</span>
                    <span className="tabular-nums">{dislikeCount.toLocaleString('ar-SA')}</span>
                  </button>
                </div>
                {reactionNotice && <p role="status" className="text-[11px] text-amber-200">{reactionNotice}</p>}
              </div>

              {/* Product Sizes / Dimensions Selector */}
              {productSizes.length > 0 && (
                <div className="p-3.5 rounded-xl border border-[#D4AF37]/25 bg-[#141418] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#E5C158]">
                    <Ruler className="w-3.5 h-3.5" />
                    <span>{lang === 'en' ? 'Available Sizes / Dimensions' : 'المقاسات / الأبعاد المتاحة'}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {productSizes.map((sz) => {
                      const active = selectedSize === sz;
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setSelectedSize(sz)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                            active
                              ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                              : 'border-white/15 bg-[#0C0C0F] text-[#F5F2EB] hover:border-[#D4AF37]/60'
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={!product.inStock}
                    onClick={() => {
                      onAddToCart(product);
                      onClose();
                    }}
                    className="btn-gold-wave flex-1 h-11 px-5 rounded-xl text-sm flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-45"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>{t(lang, 'addToCart')}</span>
                  </button>

                  <ShareButton
                    title={displayName}
                    text={`${priceDisplay.valueText} ${priceDisplay.unit}`}
                    productId={product.id}
                    imageUrl={(product.images || [])[0]}
                  />
                </div>

                <a
                  href={`https://wa.me/${cleanPhone}?text=${whatsappText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 px-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t(lang, 'whatsappDirectOrder')}</span>
                </a>
              </div>

              {/* Technical Specs */}
              {product.specs && product.specs.length > 0 && (
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="text-xs font-bold text-[#E5C158]">{t(lang, 'specsTitle')}</div>
                  <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#15151A]">
                    {product.specs.map((spec, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-4 px-3.5 py-2 text-xs"
                      >
                        <span className="text-[#9E988C]">{spec.label}</span>
                        <span className="text-[#F5F2EB] font-medium">{spec.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fuel Savings Calculator */}
              <div className="p-4 rounded-xl border border-emerald-500/25 bg-[#0E1612] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold">
                    <Fuel className="w-4 h-4" />
                    <span>{t(lang, 'fuelCalcTitle')}</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-400 tabular-nums">
                    +{gainPct}% {lang === 'en' ? 'efficiency' : 'كفاءة'}
                  </span>
                </div>
                <p className="text-[11px] text-[#C5BFB2]">{t(lang, 'fuelCalcDesc')}</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#9E988C]">{t(lang, 'fuelMonthlySpend')}</span>
                    <span className="font-bold text-[#F5F2EB] tabular-nums">
                      {monthlyFuelSpend.toLocaleString(lang === 'en' ? 'en-US' : 'ar-SA')} SAR
                    </span>
                  </div>
                  <input
                    type="range"
                    min={200}
                    max={4000}
                    step={50}
                    value={monthlyFuelSpend}
                    onChange={(e) => setMonthlyFuelSpend(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
                  <div className="p-2.5 rounded-lg bg-black/35 border border-white/10">
                    <div className="text-[10px] text-[#9E988C]">{t(lang, 'fuelMonthlySave')}</div>
                    <div className="text-sm font-bold text-emerald-300 tabular-nums mt-0.5">
                      {monthlySaveDisplay.valueText} {monthlySaveDisplay.unit}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/35 border border-white/10">
                    <div className="text-[10px] text-[#9E988C]">{t(lang, 'fuelYearlySave')}</div>
                    <div className="text-sm font-bold text-[#E5C158] tabular-nums mt-0.5">
                      {yearlySaveDisplay.valueText} {yearlySaveDisplay.unit}
                    </div>
                  </div>
                </div>
              </div>

              {/* Compatibility & Installation Guide */}
              {hasInstallGuide && (
                <div className="p-4 rounded-xl border border-[#D4AF37]/30 bg-[#14120E] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#E5C158]">
                      <Wrench className="w-4 h-4" />
                      <span>{t(lang, 'guideTitle')}</span>
                    </div>
                    {product.installationGuidePdfUrl && (
                      <a
                        href={product.installationGuidePdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="h-8 px-3 rounded-lg bg-[#D4AF37] text-[#09090B] text-[11px] font-bold inline-flex items-center gap-1.5 hover:brightness-110"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{t(lang, 'guideDownloadPdf')}</span>
                      </a>
                    )}
                  </div>

                  {product.installationGuideImages && product.installationGuideImages.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {product.installationGuideImages.map((guideImg, gi) => (
                        <a
                          key={gi}
                          href={guideImg}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="aspect-square rounded-lg border border-white/10 bg-[#0B0B0F] p-1 overflow-hidden hover:border-[#D4AF37]"
                        >
                          <ResilientImage
                            src={guideImg}
                            alt={`${t(lang, 'guideTitle')} ${gi + 1}`}
                            className="w-full h-full object-contain"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Customer Reviews Section */}
              <div className="pt-3 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#E5C158]">
                    <Star className="w-4 h-4 fill-[#E5C158]" />
                    <span>
                      {t(lang, 'reviewsTitle')} ({productReviews.length})
                    </span>
                  </div>
                </div>

                {productReviews.length === 0 ? (
                  <div className="p-3 rounded-xl border border-white/10 bg-[#15151A] text-xs text-[#9E988C]">
                    {t(lang, 'reviewsEmpty')}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {productReviews.map((rev) => (
                      <div
                        key={rev.id}
                        className="p-3 rounded-xl border border-white/10 bg-[#15151A] space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[#F5F2EB]">{rev.customerName}</span>
                          <div className="flex items-center gap-0.5 text-amber-400">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star
                                key={n}
                                className={`w-3 h-3 ${n <= rev.rating ? 'fill-amber-400' : 'opacity-25'}`}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-[#C5BFB2] leading-relaxed">{rev.comment}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Leave a Review Form */}
                <form
                  onSubmit={handleSubmitReview}
                  className="p-3.5 rounded-xl border border-white/10 bg-[#0E0E12] space-y-2.5 text-xs"
                >
                  <div className="font-bold text-[#F5F2EB]">{t(lang, 'writeReview')}</div>
                  {reviewNotice && (
                    <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-emerald-200">
                      {reviewNotice}
                    </div>
                  )}
                  {reviewError && (
                    <div className="p-2 rounded-lg border border-red-500/40 bg-red-950/30 text-red-200">
                      {reviewError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      placeholder={t(lang, 'yourName')}
                      className="h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                    />
                    <div className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-[#16161B] border border-white/15">
                      <span className="text-[#9E988C] me-1">
                        {lang === 'en' ? 'Rating:' : 'التقييم:'}
                      </span>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          className="cursor-pointer"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              star <= reviewRating
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-[#847E73]'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    required
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder={t(lang, 'yourComment')}
                    className="w-full p-2.5 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="h-9 px-4 rounded-lg border border-[#D4AF37]/50 bg-[#171510] hover:border-[#D4AF37] text-[#E5C158] font-bold cursor-pointer disabled:opacity-50"
                  >
                    {submittingReview ? '...' : t(lang, 'submitReview')}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
