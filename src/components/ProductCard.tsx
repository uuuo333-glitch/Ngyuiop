import { Heart, MessageCircle, Pencil, Ruler, Scale, ShoppingBag } from 'lucide-react';
import {
  formatCurrencyPrice,
  getEffectivePriceSar,
  t,
  type StoreLanguage,
} from '../i18n';
import type { CurrencyCode, PublicProduct, PublicSettings } from '../types';
import { DEFAULT_PRODUCT_IMAGE, ResilientImage } from './ResilientImage';
import { ShareButton } from './ShareButton';

interface ProductCardProps {
  product: PublicProduct;
  settings: PublicSettings;
  currency: CurrencyCode;
  lang: StoreLanguage;
  isWishlisted?: boolean;
  isCompared?: boolean;
  onToggleWishlist?: (productId: string) => void;
  onToggleCompare?: (productId: string) => void;
  onAddToCart: (product: PublicProduct) => void;
  onSelect: (product: PublicProduct) => void;
  editMode?: boolean;
  onQuickEdit?: (product: PublicProduct) => void;
}

export function ProductCard({
  product,
  settings,
  currency,
  lang,
  isWishlisted = false,
  isCompared = false,
  onToggleWishlist,
  onToggleCompare,
  onAddToCart,
  onSelect,
  editMode = false,
  onQuickEdit,
}: ProductCardProps) {
  const displayName = lang === 'en' ? product.nameEn || product.name : product.name;
  const displayDesc =
    lang === 'en' ? product.descriptionEn || product.description : product.description;

  const sizes = Array.isArray(product.sizes)
    ? product.sizes.map((s) => s.trim()).filter(Boolean)
    : [];

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

  const rawDigits = settings.whatsappNumber.replace(/\D/g, '');
  const cleanPhone =
    rawDigits.startsWith('05') && rawDigits.length === 10
      ? `966${rawDigits.slice(1)}`
      : rawDigits;
  const whatsappText = encodeURIComponent(
    lang === 'en'
      ? `Hello, I would like to inquire and order:\n${displayName}\n${sizes.length > 0 ? `Sizes: ${sizes.join(', ')}\n` : ''}SKU: ${product.sku || product.id}\nPrice: ${priceDisplay.valueText} ${priceDisplay.unit}`
      : `مرحباً، أود الاستفسار وطلب المنتج:\n${displayName}\n${sizes.length > 0 ? `المقاس: ${sizes.join(' / ')}\n` : ''}${product.sku ? `كود المنتج: ${product.sku}\n` : ''}السعر: ${priceDisplay.valueText} ${priceDisplay.unit}`
  );

  return (
    <article
      onClick={() => onSelect(product)}
      style={{ backgroundColor: settings.surfaceColor || '#121216' }}
      className="store-product-card group rounded-2xl border border-white/10 hover:border-[#D4AF37]/45 transition-all duration-200 hover:-translate-y-0.5 flex flex-col overflow-hidden cursor-pointer min-w-0"
    >
      {/* 1:1 Studio Product Image Container */}
      <div className="relative aspect-square w-full bg-[#0B0B0F] p-1.5 sm:p-2 overflow-hidden border-b border-white/10">
        <ResilientImage
          src={product.images?.[0]}
          defaultFallbackSrc={DEFAULT_PRODUCT_IMAGE}
          alt={displayName}
          className="w-full h-full object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.03]"
        />

        {/* Top Corner Actions: Share + Wishlist Heart */}
        <div
          className="absolute top-2 start-2 end-2 sm:top-3 sm:start-3 sm:end-3 z-10 flex items-center justify-between gap-1 pointer-events-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 pointer-events-auto">
            {onToggleWishlist && (
              <button
                type="button"
                onClick={() => onToggleWishlist(product.id)}
                title={isWishlisted ? t(lang, 'wishlistRemove') : t(lang, 'wishlistAdd')}
                aria-label={isWishlisted ? t(lang, 'wishlistRemove') : t(lang, 'wishlistAdd')}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                  isWishlisted
                    ? 'border-red-500/60 bg-red-950/70 text-red-400'
                    : 'border-white/15 bg-black/65 text-[#C5BFB2] hover:text-red-400 hover:border-red-400/40'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isWishlisted ? 'fill-current' : ''}`} />
              </button>
            )}

            {onToggleCompare && (
              <button
                type="button"
                onClick={() => onToggleCompare(product.id)}
                title={isCompared ? t(lang, 'compared') : t(lang, 'compare')}
                aria-label={t(lang, 'compare')}
                className={`h-7 px-2 sm:h-8 sm:px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                  isCompared
                    ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                    : 'border-white/15 bg-black/65 text-[#E5C158] hover:border-[#D4AF37]'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {isCompared ? t(lang, 'compared') : t(lang, 'compare')}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 pointer-events-auto">
            {editMode && onQuickEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickEdit(product);
                }}
                title="تعديل هذا المنتج"
                className="h-7 px-2 sm:h-8 sm:px-2.5 rounded-lg bg-[#D4AF37] text-[#000000] text-[10px] sm:text-[11px] font-bold flex items-center gap-1 shadow-lg hover:brightness-110 cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
                <span>تعديل</span>
              </button>
            )}
            <ShareButton
              title={displayName}
              text={`${priceDisplay.valueText} ${priceDisplay.unit}`}
              productId={product.id}
              compact
            />
          </div>
        </div>
      </div>

      {/* Product Info */}
      <div className="p-2.5 sm:p-5 flex-1 flex flex-col justify-between gap-2.5 sm:gap-4 min-w-0">
        <div className="space-y-1.5 sm:space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-1.5 text-[10px] sm:text-xs text-[#9E988C]">
            <span className="truncate">{product.category}</span>
            <span
              className={
                product.inStock ? 'text-[#E5C158] shrink-0 truncate max-w-[48%]' : 'text-red-400 shrink-0'
              }
            >
              {product.inStock ? (lang === 'en' ? 'In Stock' : 'متوفر') : t(lang, 'outOfStock')}
            </span>
          </div>

          {product.sku && (
            <div className="text-[10px] sm:text-[11px] font-mono text-[#E5C158]/80 tabular-nums truncate" dir="ltr">
              SKU: {product.sku}
            </div>
          )}

          <h3
            className="text-xs sm:text-base font-bold leading-snug line-clamp-2 group-hover:opacity-90 transition-colors"
            style={{ color: settings.textColor || '#F5F2EB' }}
          >
            {displayName}
          </h3>

          <p className="text-[11px] sm:text-sm text-[#9E988C] line-clamp-2 leading-relaxed">
            {displayDesc}
          </p>

          {sizes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <Ruler className="w-3 h-3 text-[#E5C158]/80 shrink-0" />
              {sizes.slice(0, 2).map((sz, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded bg-[#D4AF37]/12 border border-[#D4AF37]/30 text-[10px] text-[#E5C158] font-medium truncate max-w-[110px]"
                >
                  {sz}
                </span>
              ))}
              {sizes.length > 2 && (
                <span className="text-[10px] text-[#9E988C] font-medium">+{sizes.length - 2}</span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 sm:space-y-3 pt-2 border-t border-white/10">
          <div className="flex items-baseline justify-between gap-1.5 flex-wrap">
            <div
              className="flex items-baseline gap-1 tabular-nums"
              style={{ color: settings.secondaryColor || settings.primaryGoldColor || '#E5C158' }}
            >
              <span className="text-sm sm:text-lg font-bold">{priceDisplay.valueText}</span>
              <span className="text-[11px] sm:text-xs opacity-85">{priceDisplay.unit}</span>
              {compareAtDisplay && (
                <span className="text-[10px] sm:text-xs text-[#847E73] line-through ms-1">
                  {compareAtDisplay.valueText} {compareAtDisplay.unit}
                </span>
              )}
            </div>
            {settings.priceDisplayMode === 'wholesale' && product.wholesalePriceSar ? (
              <span className="px-1.5 py-0.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[9px] sm:text-[10px] font-bold text-[#F5E1A4]">
                {t(lang, 'wholesaleBadge')}
              </span>
            ) : null}
          </div>

          <div
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={!product.inStock}
              onClick={() => onAddToCart(product)}
              className="btn-gold-wave flex-1 min-h-[44px] h-11 px-2.5 sm:px-4 rounded-xl text-[11px] sm:text-sm flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>{t(lang, 'addToCart')}</span>
            </button>

            <a
              href={`https://wa.me/${cleanPhone}?text=${whatsappText}`}
              target="_blank"
              rel="noopener noreferrer"
              title={t(lang, 'whatsappDirectOrder')}
              aria-label={`${t(lang, 'whatsapp')} - ${displayName}`}
              className="min-h-[42px] h-10 sm:h-11 px-2.5 sm:px-3 rounded-xl border border-emerald-500/35 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300 flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>{t(lang, 'whatsapp')}</span>
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
