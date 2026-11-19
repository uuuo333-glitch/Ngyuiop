import { Heart, MessageCircle, Pencil, Scale, ShoppingBag } from 'lucide-react';
import {
  formatCurrencyPrice,
  getEffectivePriceSar,
  t,
  type StoreLanguage,
} from '../i18n';
import type { CurrencyCode, PublicProduct, PublicSettings } from '../types';
import { ResilientImage } from './ResilientImage';
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
      ? `Hello, I would like to inquire and order:\n${displayName}\nSKU: ${product.sku || product.id}\nPrice: ${priceDisplay.valueText} ${priceDisplay.unit}`
      : `مرحباً، أود الاستفسار وطلب المنتج:\n${displayName}\n${product.sku ? `كود المنتج: ${product.sku}\n` : ''}السعر: ${priceDisplay.valueText} ${priceDisplay.unit}`
  );

  return (
    <article
      onClick={() => onSelect(product)}
      className="group rounded-2xl border border-white/10 bg-[#121216] hover:border-[#D4AF37]/45 transition-all duration-200 hover:-translate-y-0.5 flex flex-col overflow-hidden cursor-pointer"
    >
      {/* 1:1 Studio Product Image Container */}
      <div className="relative aspect-square w-full bg-[#0B0B0F] p-2 overflow-hidden border-b border-white/10">
        <ResilientImage
          src={product.images[0]}
          alt={displayName}
          className="w-full h-full object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.03]"
        />

        {/* Top Corner Actions: Share + Wishlist Heart */}
        <div
          className="absolute top-3 start-3 end-3 z-10 flex items-center justify-between gap-2 pointer-events-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {onToggleWishlist && (
              <button
                type="button"
                onClick={() => onToggleWishlist(product.id)}
                title={isWishlisted ? t(lang, 'wishlistRemove') : t(lang, 'wishlistAdd')}
                aria-label={isWishlisted ? t(lang, 'wishlistRemove') : t(lang, 'wishlistAdd')}
                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                  isWishlisted
                    ? 'border-red-500/60 bg-red-950/70 text-red-400'
                    : 'border-white/15 bg-black/65 text-[#C5BFB2] hover:text-red-400 hover:border-red-400/40'
                }`}
              >
                <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
              </button>
            )}

            {onToggleCompare && (
              <button
                type="button"
                onClick={() => onToggleCompare(product.id)}
                title={isCompared ? t(lang, 'compared') : t(lang, 'compare')}
                aria-label={t(lang, 'compare')}
                className={`h-8 px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                  isCompared
                    ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                    : 'border-white/15 bg-black/65 text-[#E5C158] hover:border-[#D4AF37]'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>{isCompared ? t(lang, 'compared') : t(lang, 'compare')}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            {editMode && onQuickEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickEdit(product);
                }}
                title="تعديل هذا المنتج"
                className="h-8 px-2.5 rounded-lg bg-[#D4AF37] text-[#000000] text-[11px] font-bold flex items-center gap-1 shadow-lg hover:brightness-110 cursor-pointer"
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
      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-[#9E988C]">
            <span className="truncate">{product.category}</span>
            <span className={product.inStock ? 'text-[#E5C158] shrink-0' : 'text-red-400 shrink-0'}>
              {product.inStock ? t(lang, 'availableInStock') : t(lang, 'outOfStock')}
            </span>
          </div>

          {product.sku && (
            <div className="text-[11px] font-mono text-[#E5C158]/80 tabular-nums" dir="ltr">
              SKU: {product.sku}
            </div>
          )}

          <h3 className="text-base font-bold text-[#F5F2EB] leading-snug line-clamp-2 group-hover:text-[#E5C158] transition-colors">
            {displayName}
          </h3>

          <p className="text-xs sm:text-sm text-[#9E988C] line-clamp-2 leading-relaxed">
            {displayDesc}
          </p>
        </div>

        <div className="space-y-3 pt-2 border-t border-white/10">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-lg font-bold text-[#E5C158]">{priceDisplay.valueText}</span>
              <span className="text-xs text-[#E5C158]/80">{priceDisplay.unit}</span>
              {compareAtDisplay && (
                <span className="text-xs text-[#847E73] line-through ms-1">
                  {compareAtDisplay.valueText} {compareAtDisplay.unit}
                </span>
              )}
            </div>
            {settings.priceDisplayMode === 'wholesale' && product.wholesalePriceSar ? (
              <span className="px-2 py-0.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[10px] font-bold text-[#F5E1A4]">
                {t(lang, 'wholesaleBadge')}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              disabled={!product.inStock}
              onClick={() => onAddToCart(product)}
              className="btn-gold-wave flex-1 h-10 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>{t(lang, 'addToCart')}</span>
            </button>

            <a
              href={`https://wa.me/${cleanPhone}?text=${whatsappText}`}
              target="_blank"
              rel="noopener noreferrer"
              title={t(lang, 'whatsappDirectOrder')}
              aria-label={`${t(lang, 'whatsapp')} - ${displayName}`}
              className="h-10 px-3 rounded-xl border border-emerald-500/35 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{t(lang, 'whatsapp')}</span>
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
