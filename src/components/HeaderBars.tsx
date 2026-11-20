import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Coins,
  Globe,
  Heart,
  Lock,
  Pencil,
  Search,
  ShoppingBag,
  User,
  Wrench,
  X,
} from 'lucide-react';
import {
  CURRENCY_META,
  formatCurrencyPrice,
  getEffectivePriceSar,
  t,
  type StoreLanguage,
} from '../i18n';
import type {
  CurrencyCode,
  CustomerProfile,
  PublicProduct,
  PublicSettings,
} from '../types';
import { ResilientImage } from './ResilientImage';

interface HeaderBarsProps {
  settings: PublicSettings;
  products: PublicProduct[];
  cartCount: number;
  wishlistCount: number;
  customer: CustomerProfile | null;
  currency: CurrencyCode;
  lang: StoreLanguage;
  onCurrencyChange: (currency: CurrencyCode) => void;
  onLanguageChange: (lang: StoreLanguage) => void;
  onOpenCustomFab: () => void;
  onOpenCart: () => void;
  onOpenCustomerAuth: () => void;
  onOpenWishlist: () => void;
  onOpenAdmin: () => void;
  onSelectProduct: (product: PublicProduct) => void;
  editMode?: boolean;
  onEditSection?: (section: 'marquee' | 'identity') => void;
}

const CURRENCY_KEYS: CurrencyCode[] = ['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR'];

export function HeaderBars({
  settings,
  products,
  cartCount,
  wishlistCount,
  customer,
  currency,
  lang,
  onCurrencyChange,
  onLanguageChange,
  onOpenCustomFab,
  onOpenCart,
  onOpenCustomerAuth,
  onOpenWishlist,
  onOpenAdmin,
  onSelectProduct,
  editMode = false,
  onEditSection,
}: HeaderBarsProps) {
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const lastLoggedQueryRef = useRef<string>('');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) return;
    const timer = setTimeout(() => {
      if (lastLoggedQueryRef.current === clean.toLowerCase()) return;
      lastLoggedQueryRef.current = clean.toLowerCase();
      fetch('/api/analytics/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: clean }),
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [query]);

  const matchedProducts = normalizedQuery
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(normalizedQuery) ||
            (p.nameEn || '').toLowerCase().includes(normalizedQuery) ||
            (p.sku || '').toLowerCase().includes(normalizedQuery) ||
            p.category.toLowerCase().includes(normalizedQuery) ||
            p.description.toLowerCase().includes(normalizedQuery) ||
            (p.seoKeywords || []).some((k) => k.toLowerCase().includes(normalizedQuery))
        )
        .slice(0, 6)
    : [];

  return (
    <div className="sticky top-0 z-40 w-full">
      {/* Top Bar 1: Animated Announcement Marquee #1 */}
      {settings.marqueeEnabled && settings.marqueeText && (
        <div
          onClick={() => {
            if (editMode && onEditSection) onEditSection('marquee');
          }}
          className={`relative h-7 overflow-hidden border-b border-[#D4AF37]/25 flex items-center text-[11px] sm:text-xs font-medium ${
            editMode ? 'cursor-pointer ring-1 ring-inset ring-[#D4AF37]/70' : ''
          }`}
          style={{
            backgroundColor: settings.marqueeBgColor || '#14120E',
            color: settings.marqueeTextColor || '#E5C158',
          }}
        >
          <div className="w-full overflow-hidden whitespace-nowrap">
            <div
              className="animate-marquee-rtl gap-12 px-4"
              style={
                {
                  '--marquee-duration': `${Math.max(6, Number(settings.marqueeSpeed) || 28)}s`,
                } as CSSProperties
              }
            >
              <span>{settings.marqueeText}</span>
              <span aria-hidden="true" className="mx-8 opacity-40">
                ◆
              </span>
              <span aria-hidden="true">{settings.marqueeText}</span>
            </div>
          </div>
          {editMode && onEditSection && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditSection('marquee');
              }}
              className="absolute start-2 z-10 h-5 px-2 rounded bg-[#D4AF37] text-[#000000] text-[10px] font-bold flex items-center gap-1 shadow cursor-pointer"
            >
              <Pencil className="w-2.5 h-2.5" />
              <span>تعديل الأشرطة</span>
            </button>
          )}
        </div>
      )}

      {/* Top Bar 2: Animated Announcement Marquee #2 */}
      {settings.marquee2Enabled && settings.marquee2Text && (
        <div
          className="h-7 overflow-hidden border-b border-[#D4AF37]/20 flex items-center text-[11px] sm:text-xs font-medium"
          style={{
            backgroundColor: settings.marquee2BgColor || '#1E180B',
            color: settings.marquee2TextColor || '#F5E1A4',
          }}
        >
          <div className="w-full overflow-hidden whitespace-nowrap">
            <div
              className="animate-marquee-ltr gap-12 px-4"
              style={
                {
                  '--marquee-duration': `${Math.max(6, Number(settings.marquee2Speed) || 24)}s`,
                } as CSSProperties
              }
            >
              <span>{settings.marquee2Text}</span>
              <span aria-hidden="true" className="mx-8 opacity-40">
                ◆
              </span>
              <span aria-hidden="true">{settings.marquee2Text}</span>
            </div>
          </div>
        </div>
      )}

      {/* Navbar directly underneath */}
      <header
        className="border-b border-white/10 backdrop-blur-md transition-colors"
        style={{ backgroundColor: `${settings.backgroundColor || '#09090B'}E8` }}
      >
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 min-h-14 sm:min-h-16 py-2 flex items-center justify-between gap-1.5 sm:gap-3 overflow-x-clip">
          {/* Brand Wordmark */}
          <div className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap min-w-0 flex-1">
            <a
              href="#top"
              onClick={(e) => {
                if (editMode && onEditSection) {
                  e.preventDefault();
                  onEditSection('identity');
                }
              }}
              className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap min-w-0 max-w-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg ${
                editMode ? 'px-2 py-1 border border-dashed border-[#D4AF37]/70 bg-[#171510]/60' : ''
              }`}
            >
              <span
                className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center border border-[#D4AF37]/50 bg-[#14120E] overflow-hidden shrink-0"
                style={{ borderColor: `${settings.primaryGoldColor || '#D4AF37'}80` }}
                aria-hidden="true"
              >
                {settings.storeLogoUrl?.trim() ? (
                  <img
                    src={settings.storeLogoUrl.trim()}
                    alt={settings.storeName}
                    className="w-full h-full object-contain p-0.5"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4"
                    style={{ color: settings.primaryGoldColor || '#D4AF37' }}
                    fill="currentColor"
                  >
                    <path d="M3 18h18v2H3v-2zm0-2l2-9 4.5 3.5L12 4l2.5 6.5L19 7l2 9H3z" />
                  </svg>
                )}
              </span>
              <span
                className="font-display text-[11px] sm:text-base font-bold group-hover:opacity-90 transition-opacity min-w-0 truncate"
                style={{ color: settings.textColor || '#F5F2EB' }}
              >
                {settings.storeName}
              </span>
              {editMode && (
                <Pencil className="w-3.5 h-3.5 text-[#E5C158] shrink-0" />
              )}
            </a>
          </div>

          {/* Navigation Links (Wide Desktop) */}
          <nav className="hidden xl:flex items-center gap-4 text-xs font-medium text-[#C5BFB2] shrink-0">
            <a href="#top" className="hover:text-[#E5C158] transition-colors whitespace-nowrap">
              {t(lang, 'navHome')}
            </a>
            <a
              href="#products"
              className="hover:text-[#E5C158] transition-colors whitespace-nowrap"
            >
              {t(lang, 'navProducts')}
            </a>
            <a href="#offers" className="hover:text-[#E5C158] transition-colors whitespace-nowrap">
              {t(lang, 'navOffers')}
            </a>
            <a href="#about" className="hover:text-[#E5C158] transition-colors whitespace-nowrap">
              {t(lang, 'navAbout')}
            </a>
            <button
              type="button"
              onClick={onOpenCustomFab}
              className="px-2.5 py-1 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-[#E5C158] hover:border-[#D4AF37] flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Wrench className="w-3 h-3" />
              <span>{t(lang, 'customFab')}</span>
            </button>
          </nav>

          {/* Smart Live Search */}
          <div
            ref={searchBoxRef}
            className="relative flex-1 min-w-[160px] max-w-sm hidden md:block"
          >
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#D4AF37]/80 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
              <input
                type="text"
                value={query}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchFocused(true);
                }}
                placeholder={t(lang, 'searchPlaceholder')}
                className="w-full h-10 ps-10 pe-9 rounded-xl bg-[#141418] border border-white/10 text-xs sm:text-sm text-[#F5F2EB] placeholder:text-[#847E73] focus:outline-none focus:border-[#D4AF37]/60 transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-[#9E988C] hover:text-[#F5F2EB] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {searchFocused && normalizedQuery.length > 0 && (
              <div className="absolute top-full mt-2 right-0 left-0 rounded-xl border border-[#D4AF37]/30 bg-[#121216] shadow-2xl overflow-hidden z-50">
                {matchedProducts.length === 0 ? (
                  <div className="p-4 text-center text-sm text-[#9E988C]">
                    {lang === 'en'
                      ? `No matching products for "${query}"`
                      : `لا توجد منتجات مطابقة لـ "${query}"`}
                  </div>
                ) : (
                  <div className="divide-y divide-white/10 max-h-80 overflow-y-auto">
                    {matchedProducts.map((product) => {
                      const effPrice = formatCurrencyPrice(
                        getEffectivePriceSar(product, settings.priceDisplayMode),
                        currency,
                        settings.currencyRates,
                        lang
                      );
                      const pTitle =
                        lang === 'en' ? product.nameEn || product.name : product.name;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            onSelectProduct(product);
                            setSearchFocused(false);
                            setQuery('');
                          }}
                          className="w-full flex items-center gap-3 p-2.5 text-start hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <div className="w-12 h-12 aspect-square p-1 bg-[#0B0B0F] rounded-lg overflow-hidden shrink-0 border border-white/10">
                            <ResilientImage
                              src={product.images[0]}
                              alt={pTitle}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-[#F5F2EB] truncate">
                              {pTitle}
                            </div>
                            <div className="text-xs text-[#9E988C] truncate">
                              {product.sku ? `${product.sku} · ` : ''}
                              {product.category}
                            </div>
                          </div>
                          <div className="text-sm font-bold text-[#E5C158] tabular-nums whitespace-nowrap shrink-0">
                            {effPrice.valueText} {effPrice.unit}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label="Search"
              className="md:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-white/10 bg-[#141418] flex items-center justify-center text-[#F5F2EB] hover:border-[#D4AF37]/50 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4AF37]" />
            </button>

            {/* Gulf Currency Switcher */}
            {settings.multiCurrencyEnabled !== false && (
              <select
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
                aria-label="Currency"
                className="h-8 sm:h-9 px-1.5 sm:px-2 rounded-xl border border-white/10 bg-[#141418] text-[10px] sm:text-xs font-bold text-[#E5C158] focus:outline-none focus:border-[#D4AF37] cursor-pointer max-w-[74px] sm:max-w-none"
              >
                {CURRENCY_KEYS.map((code) => (
                  <option key={code} value={code}>
                    {code} ({CURRENCY_META[code].symbolAr})
                  </option>
                ))}
              </select>
            )}

            {/* AR/EN Switcher */}
            {settings.allowLanguageSwitch !== false && (
              <button
                type="button"
                onClick={() => onLanguageChange(lang === 'ar' ? 'en' : 'ar')}
                title={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
                className="h-8 sm:h-9 px-1.5 sm:px-2.5 rounded-xl border border-white/10 bg-[#141418] hover:border-[#D4AF37]/50 text-[10px] sm:text-xs font-bold text-[#F5F2EB] flex items-center gap-1 cursor-pointer"
              >
                <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#D4AF37]" />
                <span>{lang === 'ar' ? 'EN' : 'AR'}</span>
              </button>
            )}

            {/* Wishlist Shortcut */}
            <button
              type="button"
              onClick={onOpenWishlist}
              title={t(lang, 'wishlistTitle')}
              aria-label={t(lang, 'wishlistTitle')}
              className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-white/10 bg-[#141418] hover:border-red-400/50 flex items-center justify-center text-[#F5F2EB] cursor-pointer"
            >
              <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${wishlistCount > 0 ? 'text-red-400 fill-red-400' : 'text-[#C5BFB2]'}`} />
              {wishlistCount > 0 && (
                <span className="absolute -top-1 -end-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {wishlistCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenCustomerAuth}
              className="h-8 sm:h-9 px-2 sm:px-3 rounded-xl border border-white/10 bg-[#141418] hover:border-[#D4AF37]/50 text-xs font-medium text-[#F5F2EB] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4AF37] shrink-0" />
              <span className="hidden lg:inline">
                {customer ? customer.name : t(lang, 'customerLogin')}
              </span>
              {customer && settings.loyaltyEnabled !== false && (
                <span
                  title="Golden Coins"
                  className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#F5E1A4] text-[10px] font-bold tabular-nums"
                >
                  <Coins className="w-3 h-3 text-[#D4AF37]" />
                  <span>{(customer.goldenCoins ?? 0).toLocaleString('en-US')}</span>
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              aria-label={t(lang, 'cart')}
              className="relative h-8 sm:h-9 px-2 sm:px-3 rounded-xl border border-[#D4AF37]/40 bg-[#171510] hover:border-[#D4AF37] text-xs font-medium text-[#F5F2EB] flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E5C158]" />
              <span className="hidden sm:inline">{t(lang, 'cart')}</span>
              <span className="inline-flex items-center justify-center min-w-4 sm:min-w-5 h-4 sm:h-5 px-1 rounded-md bg-[#D4AF37] text-[#09090B] text-[10px] sm:text-xs font-bold tabular-nums">
                {cartCount}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenAdmin}
              title={lang === 'en' ? 'Owner Portal' : 'لوحة تحكم المالك'}
              aria-label="لوحة تحكم المالك"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-white/10 bg-[#141418] hover:border-[#D4AF37]/50 flex items-center justify-center text-[#9E988C] hover:text-[#E5C158] transition-colors shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Expandable Search Drawer */}
        {mobileSearchOpen && (
          <div className="md:hidden border-t border-white/10 px-4 py-3 bg-[#0D0D10]">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#D4AF37] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(lang, 'searchPlaceholder')}
                className="w-full h-10 ps-10 pe-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-[#F5F2EB] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            {normalizedQuery.length > 0 && (
              <div className="mt-2 rounded-xl border border-white/10 bg-[#141418] divide-y divide-white/10 max-h-64 overflow-y-auto">
                {matchedProducts.length === 0 ? (
                  <div className="p-3 text-xs text-center text-[#9E988C]">
                    {lang === 'en' ? 'No matching results' : 'لا توجد نتائج مطابقة'}
                  </div>
                ) : (
                  matchedProducts.map((product) => {
                    const effPrice = formatCurrencyPrice(
                      getEffectivePriceSar(product, settings.priceDisplayMode),
                      currency,
                      settings.currencyRates,
                      lang
                    );
                    const pTitle = lang === 'en' ? product.nameEn || product.name : product.name;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          onSelectProduct(product);
                          setMobileSearchOpen(false);
                          setQuery('');
                        }}
                        className="w-full flex items-center gap-3 p-2.5 text-start"
                      >
                        <div className="w-11 h-11 aspect-square p-0.5 bg-[#0B0B0F] rounded-lg overflow-hidden shrink-0">
                          <ResilientImage
                            src={product.images[0]}
                            alt={pTitle}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[#F5F2EB] truncate">
                            {pTitle}
                          </div>
                        </div>
                        <div className="text-xs font-bold text-[#E5C158] tabular-nums shrink-0">
                          {effPrice.valueText} {effPrice.unit}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </header>
    </div>
  );
}
