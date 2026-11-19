import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { User } from 'firebase/auth';
import { Crown, Lock, Mail, MessageCircle, Scale, Wrench, X } from 'lucide-react';
import { fetchFirestoreWishlistIds, initAuth, syncWishlistItemToFirestore } from './firebase';
import { AdminDashboard } from './components/AdminDashboard';
import { CartDrawer } from './components/CartDrawer';
import { CharityCornerPopup, CharitySection } from './components/CharitySectionAndPopup';
import { CompareModal } from './components/CompareModal';
import { CustomFabricationModal } from './components/CustomFabricationModal';
import { CustomerAuthModal } from './components/CustomerAuthModal';
import { Footer } from './components/Footer';
import { HeaderBars } from './components/HeaderBars';
import { LandingHero } from './components/LandingHero';
import { ProductCard } from './components/ProductCard';
import { ProductModal } from './components/ProductModal';
import { ShareButton } from './components/ShareButton';
import { ShippingCarriersLogos } from './components/ShippingCarriersLogos';
import { VideoSidebarRail } from './components/VideoSidebarRail';
import { DEFAULT_CURRENCY_RATES, t, type StoreLanguage } from './i18n';
import type {
  CartItem,
  CurrencyCode,
  CustomerProfile,
  ProductReview,
  PromoBanner,
  PublicProduct,
  PublicSettings,
} from './types';

const INITIAL_PUBLIC_SETTINGS: PublicSettings = {
  storeName: 'مصنع التاج الذهبي لدبات التلوث',
  storeTagline: 'إنتاج دبات التلوث للديزل والبنزين',
  storeOpen: true,
  storeClosedTitle: 'المتجر مغلق مؤقتاً للصيانة والتحديث',
  storeClosedMessage:
    'نعمل حالياً على تحديث المخزون وتجهيز منتجات وعروض جديدة. يمكنكم التواصل معنا مباشرة عبر واتساب لأي استفسار أو طلب عاجل، وسنعود لاستقبال الطلبات قريباً.',
  allowLanguageSwitch: true,
  defaultLanguage: 'ar',
  multiCurrencyEnabled: true,
  currencyRates: DEFAULT_CURRENCY_RATES,
  priceDisplayMode: 'retail',
  installmentsEnabled: true,
  categories: [
    {
      id: 'cat-gasoline',
      name: 'دبات تلوث البنزين',
      description: 'محولات حفازة عالية الكفاءة لمحركات البنزين الحديثة',
      isActive: true,
    },
    {
      id: 'cat-diesel',
      name: 'دبات تلوث الديزل',
      description: 'فلاتر جسيمات DPF ومحفزات أكسدة لمنع الدخان الأسود',
      isActive: true,
    },
    {
      id: 'cat-ceramic',
      name: 'قلوب وحشوات السيراميك',
      description: 'قلوب سيراميك بلاتين عالية الكثافة للتصنيع والتجديد',
      isActive: true,
    },
    {
      id: 'cat-kits',
      name: 'أطقم العادم والفلنجات',
      description: 'أطقم تركيب كاملة بالفلنجات والجازكيتات الحرارية',
      isActive: true,
    },
  ],
  marqueeEnabled: true,
  marqueeText:
    'إنتاج وطني وتوريد مباشر لدبات التلوث (ديزل وبنزين) بمعايير Euro-6 · ضمان الكفاءة وتجاوز الفحص الدوري · دفع آمن عبر PayPal أو الطلب الفوري عبر واتساب',
  marqueeBgColor: '#14120E',
  marqueeTextColor: '#E5C158',
  marqueeSpeed: 28,
  marquee2Enabled: true,
  marquee2Text:
    'متوفر الآن: فلاتر جسيمات الديزل DPF · دبات تلوث بنزين لحام TIG · قلوب سيراميك بلاتين عالية الكثافة · استشارة فنية فورية لاختيار المقاس المناسب',
  marquee2BgColor: '#1E180B',
  marquee2TextColor: '#F5E1A4',
  marquee2Speed: 24,
  heroEnabled: true,
  heroTitle: 'إنتاج دبات التلوث للديزل والبنزين بدقة هندسية فائقة',
  heroSubtitle:
    'نصنع ونوفر أحدث دبات التلوث وفلاتر الجسيمات (DPF) والمحولات الحفازة من الفولاذ المقاوم للصدأ وخلايا البلاتين عالية الكفاءة لتنقية العادم وحماية المحرك.',
  heroCtaText: 'تصفح المنتجات الآن',
  heroBackdropMode: 'auto',
  heroVideoUrl: '',
  heroImageUrl: '/src/assets/images/hero_catalytic_gold_1794821492784.jpg',
  heroSlideshowImages: [
    '/src/assets/images/hero_catalytic_gold_1794821492784.jpg',
    '/src/assets/images/product_gasoline_cat_1794821493329.jpg',
    '/src/assets/images/product_diesel_dpf_1794821492144.jpg',
  ],
  heroFeatures: [
    {
      title: 'مطابقة لمعايير Euro-6 والفحص الدوري',
      description: 'كفاءة ترشيح عالية للغازات الضارة تضمن استقرار الحساسات وإطفاء لمبة المحرك.',
    },
    {
      title: 'دفع إلكتروني آمن عبر PayPal',
      description: 'إتمام فوري وموثوق للطلبات مع تحويل دقيق من الريال السعودي.',
    },
    {
      title: 'استشارة فنية وطلب مباشر عبر واتساب',
      description: 'تحديد المقاس المناسب لسيارتك (ديزل أو بنزين) وتأكيد الطلب خلال دقائق.',
    },
    {
      title: 'لحام TIG ستانلس ستيل 304 مقاوم للحرارة',
      description: 'هياكل معدنية سميكة تتحمل درجات الحرارة القصوى وتمنع التآكل والتهريب.',
    },
  ],
  sidebarVideosEnabled: true,
  sidebarVideoCount: 4,
  sidebarVideos: [
    { id: 'vid-1', title: 'تصنيع دبات التلوث الذهبية', url: '/videos/showcase-1.mp4' },
    { id: 'vid-2', title: 'دبات تلوث البنزين لحام TIG', url: '/videos/showcase-2.mp4' },
    { id: 'vid-3', title: 'فلاتر جسيمات الديزل DPF', url: '/videos/showcase-3.mp4' },
    { id: 'vid-4', title: 'خلايا السيراميك البلاتينية', url: '/videos/showcase-4.mp4' },
  ],
  siteBackgroundType: 'none',
  siteBackgroundUrl: '',
  siteBackgroundOpacity: 0.2,
  themePreset: 'royal_gold',
  buttonStyle: 'gold_wave',
  primaryGoldColor: '#D4AF37',
  backgroundColor: '#09090B',
  surfaceColor: '#131317',
  whatsappNumber: '966504597852',
  contactEmail: 'uuuo333@gmail.com',
  paypalMeUrl: 'https://www.paypal.me/yousefAlmohamad931',
  paypalMerchantLabel: 'PayPal Official',
  bankTransferEnabled: true,
  bankName: 'مصرف الراجحي',
  bankAccountHolder: 'مصنع التاج الذهبي لدبات التلوث',
  bankIban: 'SA0000000000000000000000',
  bankAccountNumber: '',
  sarToUsdRate: 0.2667,
  instagramUrl: 'https://instagram.com',
  tiktokUrl: 'https://tiktok.com',
  aboutUsText:
    'منشأة صناعية وتجارية متخصصة في إنتاج وتوريد دبات التلوث لمركبات الديزل والبنزين، وفلاتر البيئة (DPF) وقلوب السيراميك الحفازة في المملكة العربية السعودية والخليج وفق أعلى المواصفات الهندسية.',
  showShippingLogos: true,
  shippingCarriers: [
    'زاجل (Zajil)',
    'سبل - البريد السعودي (SPL)',
    'أرامكس (Aramex)',
    'سمسا إكسبرس (SMSA)',
    'DHL إكسبرس',
    'ريدبوكس (RedBox)',
    'J&T إكسبرس',
  ],
  loyaltyEnabled: true,
  coinValueSar: 0.1,
  dailyCheckinCoins: 25,
  coinsPer100SarPurchase: 50,
  charityPopupEnabled: true,
  charityPopupTitle: 'تصدق ولو بالقليل.. واجعل تجارتك مباركة',
  charityPopupVerse:
    '﴿ مَّثَلُ الَّذِينَ يُنفِقُونَ أَمْوَالَهُمْ فِي سَبِيلِ اللَّهِ كَمَثَلِ حَبَّةٍ أَنبَتَتْ سَبْعَ سَنَابِلَ فِي كُلِّ سُنبُلَةٍ مِّائَةُ حَبَّةٍ ۗ وَاللَّهُ يُضَاعِفُ لِمَن يَشَاءُ ﴾ [البقرة: 261]',
  charityUrl: 'https://ehsan.sa',
  charityOrganizations: [
    {
      id: 'org-ehsan',
      name: 'منصة إحسان للعمل الخيري',
      description: 'المنصة الوطنية الرسمية للتبرعات الخيرية في المملكة العربية السعودية.',
      url: 'https://ehsan.sa',
    },
    {
      id: 'org-ensan',
      name: 'جمعية إنسان لرعاية الأيتام',
      description: 'كفالة الأيتام ورعاية أسرهم التعليمية والصحية والاجتماعية.',
      url: 'https://ensan.org.sa',
    },
    {
      id: 'org-donations',
      name: 'منصة تبرع الوطنية',
      description: 'بوابة دعم الجمعيات الخيرية المعتمدة تحت إشراف الموارد البشرية.',
      url: 'https://donations.sa',
    },
    {
      id: 'org-shefa',
      name: 'منصة شفاء للرعاية الصحية',
      description: 'تقديم العلاج والعمليات الجراحية للمرضى المحتاجين.',
      url: 'https://shefa.sa',
    },
  ],
  seoAutoUpdateEnabled: true,
};

function readCachedStorefront(): {
  settings?: PublicSettings;
  products?: PublicProduct[];
  banners?: PromoBanner[];
  reviews?: ProductReview[];
} {
  try {
    const raw = localStorage.getItem('taj_storefront_cache');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [initialCache] = useState(() => readCachedStorefront());
  const [settings, setSettings] = useState<PublicSettings>(
    () => initialCache.settings || INITIAL_PUBLIC_SETTINGS
  );
  const [products, setProducts] = useState<PublicProduct[]>(
    () => initialCache.products || []
  );
  const [banners, setBanners] = useState<PromoBanner[]>(
    () => initialCache.banners || []
  );
  const [reviews, setReviews] = useState<ProductReview[]>(
    () => initialCache.reviews || []
  );

  const [lang, setLang] = useState<StoreLanguage>(() => {
    const saved = localStorage.getItem('taj_lang');
    if (saved === 'en' || saved === 'ar') return saved;
    return initialCache.settings?.defaultLanguage === 'en' ? 'en' : 'ar';
  });

  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    const saved = localStorage.getItem('taj_currency') as CurrencyCode | null;
    if (saved && ['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR'].includes(saved)) return saved;
    return 'SAR';
  });

  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);

  const [wishlistIds, setWishlistIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('taj_wishlist');
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [customFabOpen, setCustomFabOpen] = useState(false);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('taj_cart');
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);

  const [customerToken, setCustomerToken] = useState<string | null>(() =>
    localStorage.getItem('taj_customer_token')
  );
  const [customer, setCustomer] = useState<CustomerProfile | null>(() => {
    try {
      const saved = localStorage.getItem('taj_customer_profile');
      return saved ? (JSON.parse(saved) as CustomerProfile) : null;
    } catch {
      return null;
    }
  });
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerModalTab, setCustomerModalTab] = useState<'account' | 'wishlist'>('account');
  const [adminOpen, setAdminOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState('');
  const [bgMediaError, setBgMediaError] = useState(false);

  // Sync HTML dir/lang with active storefront language
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
    try {
      localStorage.setItem('taj_lang', lang);
    } catch {
      // ignore
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem('taj_currency', currency);
    } catch {
      // ignore
    }
  }, [currency]);

  const [googleUser, setGoogleUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (user) => {
        setGoogleUser(user);
        void fetchFirestoreWishlistIds(user)
          .then((cloudIds) => {
            if (cloudIds.length > 0) {
              setWishlistIds((prev) => Array.from(new Set([...prev, ...cloudIds])));
            }
          })
          .catch(() => {});
      },
      (user) => {
        setGoogleUser(user);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('taj_wishlist', JSON.stringify(wishlistIds));
    } catch {
      // ignore
    }
  }, [wishlistIds]);

  const loadStorefront = useCallback(async () => {
    try {
      const res = await fetch('/api/storefront');
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
        if (!localStorage.getItem('taj_lang') && (data.settings.defaultLanguage === 'en' || data.settings.defaultLanguage === 'ar')) {
          setLang(data.settings.defaultLanguage);
        }
      }
      setProducts(data.products || []);
      setBanners(data.banners || []);
      setReviews(data.reviews || []);
      try {
        localStorage.setItem(
          'taj_storefront_cache',
          JSON.stringify({
            settings: data.settings,
            products: data.products || [],
            banners: data.banners || [],
            reviews: data.reviews || [],
          })
        );
      } catch {
        // ignore cache storage errors
      }
    } catch {
      // keep instant fallback/cached storefront visible
    }
  }, []);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

  // Silent store visit counter
  useEffect(() => {
    try {
      if (sessionStorage.getItem('taj_visit_logged')) return;
      sessionStorage.setItem('taj_visit_logged', '1');
      let vid = localStorage.getItem('taj_visitor_id');
      if (!vid) {
        vid = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('taj_visitor_id', vid);
      }
      fetch('/api/analytics/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: vid }),
      }).catch(() => {});
    } catch {
      // ignore
    }
  }, []);

  // Open shared product link if ?product=<id> is in URL
  useEffect(() => {
    if (products.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('product');
    if (sharedId) {
      const found = products.find((p) => p.id === sharedId);
      if (found) setSelectedProduct(found);
    }
  }, [products]);

  // Persist cart
  useEffect(() => {
    try {
      localStorage.setItem('taj_cart', JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  // Sync customer session on mount
  useEffect(() => {
    if (!customerToken) return;
    fetch('/api/customers/me', {
      headers: { Authorization: `Bearer ${customerToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.customer) {
          setCustomer(data.customer);
          localStorage.setItem('taj_customer_profile', JSON.stringify(data.customer));
        } else {
          localStorage.removeItem('taj_customer_token');
          localStorage.removeItem('taj_customer_profile');
          setCustomerToken(null);
          setCustomer(null);
        }
      })
      .catch(() => {});
  }, [customerToken]);

  useEffect(() => {
    setBgMediaError(false);
  }, [settings?.siteBackgroundUrl, settings?.siteBackgroundType]);

  // Dynamic SEO Keywords (Store + Selected Product, up to 15 each) & Schema.org JSON-LD injection in <head>
  useEffect(() => {
    if (!settings) return;

    const upsertMeta = (
      attr: 'name' | 'property',
      key: string,
      content: string
    ) => {
      if (!content) return;
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const storeKeywords = (settings.seoKeywords || [])
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 15);
    const activeProductKeywords = selectedProduct
      ? (selectedProduct.seoKeywords || [selectedProduct.name, selectedProduct.category])
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 15)
      : [];
    const fallbackProductsKeywords = products
      .flatMap((p) => p.seoKeywords || [p.name, p.category])
      .map((k) => k.trim())
      .filter(Boolean);

    const combinedKeywords = Array.from(
      new Set(
        selectedProduct
          ? [...activeProductKeywords, ...storeKeywords]
          : [...storeKeywords, ...fallbackProductsKeywords]
      )
    ).slice(0, 15);

    const pageTitle = selectedProduct
      ? `${selectedProduct.seoTitle || selectedProduct.name} | ${settings.storeName}`
      : `${settings.storeName} | ${settings.storeTagline}`;
    const pageDesc = selectedProduct
      ? (selectedProduct.seoDescription || selectedProduct.description || settings.aboutUsText).slice(
          0,
          160
        )
      : settings.aboutUsText.slice(0, 160);

    document.title = pageTitle;

    upsertMeta('name', 'description', pageDesc);
    if (combinedKeywords.length > 0) {
      upsertMeta('name', 'keywords', combinedKeywords.join('، '));
    }
    upsertMeta('property', 'og:title', pageTitle);
    upsertMeta('property', 'og:description', pageDesc);
    upsertMeta('name', 'twitter:title', pageTitle);
    upsertMeta('name', 'twitter:description', pageDesc);

    let scriptEl = document.getElementById('products-schema-jsonld') as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = 'products-schema-jsonld';
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }

    const schemaPayload = selectedProduct
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: selectedProduct.name,
          sku: selectedProduct.sku || selectedProduct.id,
          description: selectedProduct.seoDescription || selectedProduct.description,
          category: selectedProduct.category,
          ...(combinedKeywords.length > 0 ? { keywords: combinedKeywords.join(', ') } : {}),
          image: (selectedProduct.images || []).filter(
            (u) => typeof u === 'string' && u.length > 0 && !u.startsWith('data:')
          ),
          offers: {
            '@type': 'Offer',
            priceCurrency: 'SAR',
            price: selectedProduct.priceSar,
            availability: selectedProduct.inStock
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          },
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: settings.storeName,
          ...(storeKeywords.length > 0 ? { keywords: storeKeywords.join(', ') } : {}),
          itemListElement: products.map((p, idx) => {
            const cleanImgs = (p.images || []).filter(
              (u) => typeof u === 'string' && u.length > 0 && !u.startsWith('data:')
            );
            const fallbackItem = {
              '@type': 'Product',
              name: p.name,
              sku: p.sku || p.id,
              description: p.seoDescription || p.description,
              category: p.category,
              ...(p.seoKeywords?.length ? { keywords: p.seoKeywords.slice(0, 15).join(', ') } : {}),
              image: cleanImgs,
              offers: {
                '@type': 'Offer',
                priceCurrency: 'SAR',
                price: p.priceSar,
                availability: p.inStock
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
              },
            };
            return {
              '@type': 'ListItem',
              position: idx + 1,
              item: p.schemaMarkup
                ? {
                    ...p.schemaMarkup,
                    ...(cleanImgs.length > 0 ? { image: cleanImgs } : {}),
                  }
                : fallbackItem,
            };
          }),
        };
    scriptEl.textContent = JSON.stringify(schemaPayload);
  }, [settings, products, selectedProduct]);

  const categories = useMemo(() => {
    const activeConfigured = (settings?.categories || [])
      .filter((c) => c.isActive)
      .map((c) => c.name);
    const productCats = products.map((p) => p.category).filter(Boolean);
    const unique = Array.from(new Set([...activeConfigured, ...productCats]));
    return ['الكل', ...unique];
  }, [settings, products]);

  const activeCategoryDescription = useMemo(() => {
    if (selectedCategory === 'الكل') return '';
    return settings?.categories?.find((c) => c.name === selectedCategory)?.description || '';
  }, [settings, selectedCategory]);

  const visibleProducts = useMemo(() => {
    if (selectedCategory === 'الكل') return products;
    return products.filter((p) => p.category === selectedCategory);
  }, [products, selectedCategory]);

  const wishlistProducts = useMemo(
    () => products.filter((p) => wishlistIds.includes(p.id)),
    [products, wishlistIds]
  );

  const comparedProducts = useMemo(
    () => products.filter((p) => compareIds.includes(p.id)),
    [products, compareIds]
  );

  const handleToggleWishlist = (productId: string) => {
    const exists = wishlistIds.includes(productId);
    const nextSaved = !exists;
    setWishlistIds((prev) =>
      exists ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
    if (googleUser) {
      const targetProd = products.find((p) => p.id === productId);
      void syncWishlistItemToFirestore(
        googleUser,
        {
          id: productId,
          name: targetProd?.name || productId,
          priceSar: targetProd?.priceSar ?? 0,
          imageUrl: targetProd?.images?.[0] || '',
        },
        nextSaved
      ).catch(() => {});
    }
  };

  const handleToggleCompare = (productId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(productId)) return prev.filter((id) => id !== productId);
      if (prev.length >= 4) {
        return [...prev.slice(1), productId];
      }
      return [...prev, productId];
    });
  };

  const handleAddToCart = (product: PublicProduct) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1 }];
    });
    const label = lang === 'en' ? product.nameEn || product.name : product.name;
    setCartNotice(
      lang === 'en' ? `Added "${label}" to cart` : `تمت إضافة "${label}" إلى السلة`
    );
    setTimeout(() => setCartNotice(''), 2500);
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const handleCustomerAuthSuccess = (profile: CustomerProfile, token: string) => {
    setCustomer(profile);
    setCustomerToken(token);
    localStorage.setItem('taj_customer_token', token);
    localStorage.setItem('taj_customer_profile', JSON.stringify(profile));
  };

  const handleCustomerUpdated = (profile: CustomerProfile) => {
    setCustomer(profile);
    localStorage.setItem('taj_customer_profile', JSON.stringify(profile));
  };

  const handleCustomerLogout = () => {
    setCustomer(null);
    setCustomerToken(null);
    localStorage.removeItem('taj_customer_token');
    localStorage.removeItem('taj_customer_profile');
  };

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const rawWaDigits = settings.whatsappNumber.replace(/\D/g, '');
  const cleanWhatsapp =
    rawWaDigits.startsWith('05') && rawWaDigits.length === 10
      ? `966${rawWaDigits.slice(1)}`
      : rawWaDigits;
  const hasSidebarVideos =
    settings.sidebarVideosEnabled !== false && (settings.sidebarVideos || []).length > 0;

  if (settings.storeOpen === false) {
    return (
      <div
        data-button-style={settings.buttonStyle || 'gold_wave'}
        className="relative min-h-screen flex flex-col items-center justify-center p-6 text-[#F5F2EB] overflow-hidden"
        style={
          {
            backgroundColor: settings.backgroundColor || '#09090B',
            '--royal-gold': settings.primaryGoldColor || '#D4AF37',
            '--royal-bg': settings.backgroundColor || '#09090B',
            '--royal-surface': settings.surfaceColor || '#131317',
          } as CSSProperties
        }
      >
        <div className="w-full max-w-xl rounded-3xl border border-[#D4AF37]/40 bg-[#121216]/95 p-7 sm:p-10 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl border border-[#D4AF37]/50 bg-[#1A160B] flex items-center justify-center text-[#E5C158]">
            <Crown className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg border border-amber-500/35 bg-amber-950/30 text-amber-200 text-xs font-bold">
              <span>إشعار المتجر</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F2EB]">
              {settings.storeName}
            </h1>
            <h2 className="text-base sm:text-lg font-bold text-[#E5C158]">
              {settings.storeClosedTitle || 'المتجر مغلق مؤقتاً للصيانة والتحديث'}
            </h2>
            <p className="text-sm text-[#C5BFB2] leading-relaxed pt-1">
              {settings.storeClosedMessage ||
                'نعمل حالياً على تحديث المخزون وتجهيز منتجات وعروض جديدة. يمكنكم التواصل معنا مباشرة عبر واتساب لأي استفسار.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {cleanWhatsapp && (
              <a
                href={`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
                  `مرحباً ${settings.storeName}، لدي استفسار.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>تواصل معنا عبر واتساب</span>
              </a>
            )}
            {settings.contactEmail && (
              <a
                href={`mailto:${settings.contactEmail}`}
                className="h-11 px-5 rounded-xl border border-[#D4AF37]/45 bg-[#171510] text-[#E5C158] text-sm font-bold inline-flex items-center gap-2 hover:bg-[#1E1A11]"
              >
                <Mail className="w-4 h-4" />
                <span>{settings.contactEmail}</span>
              </a>
            )}
          </div>

          <div className="pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => setAdminOpen(true)}
              className="inline-flex items-center gap-2 text-xs text-[#9E988C] hover:text-[#E5C158] transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>دخول المالك لإدارة وفتح الموقع</span>
            </button>
          </div>
        </div>

        <AdminDashboard
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          onStorefrontUpdated={loadStorefront}
        />
      </div>
    );
  }

  return (
    <div
      data-button-style={settings.buttonStyle || 'gold_wave'}
      className="relative min-h-screen flex flex-col text-[#F5F2EB]"
      style={
        {
          backgroundColor: settings.backgroundColor || '#09090B',
          '--royal-gold': settings.primaryGoldColor || '#D4AF37',
          '--royal-bg': settings.backgroundColor || '#09090B',
          '--royal-surface': settings.surfaceColor || '#131317',
        } as CSSProperties
      }
    >
      {/* Optional Owner Global Background (Video, Animated Image/GIF, or Static Image) */}
      {settings.siteBackgroundType !== 'none' && settings.siteBackgroundUrl && !bgMediaError && (
        <div
          className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
          style={{ opacity: settings.siteBackgroundOpacity ?? 0.24 }}
        >
          {settings.siteBackgroundType === 'video' ? (
            <video
              key={settings.siteBackgroundUrl}
              src={settings.siteBackgroundUrl}
              autoPlay
              loop
              muted
              playsInline
              onError={() => setBgMediaError(true)}
              style={
                settings.siteBackgroundFilter
                  ? { filter: settings.siteBackgroundFilter }
                  : undefined
              }
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={settings.siteBackgroundUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setBgMediaError(true)}
              style={
                settings.siteBackgroundFilter
                  ? { filter: settings.siteBackgroundFilter }
                  : undefined
              }
              className={`w-full h-full object-cover ${
                settings.siteBackgroundAnimatedMotion === 'kenburns'
                  ? 'animate-bg-kenburns'
                  : settings.siteBackgroundAnimatedMotion === 'float'
                    ? 'animate-bg-float'
                    : settings.siteBackgroundAnimatedMotion === 'pulse'
                      ? 'animate-bg-pulse'
                      : settings.siteBackgroundType === 'animated_image'
                        ? 'animate-bg-kenburns'
                        : ''
              }`}
            />
          )}
        </div>
      )}

      <div className="relative z-10 flex flex-col min-h-screen">
        <HeaderBars
          settings={settings}
          products={products}
          cartCount={cartCount}
          wishlistCount={wishlistProducts.length}
          customer={customer}
          currency={currency}
          lang={lang}
          onCurrencyChange={setCurrency}
          onLanguageChange={setLang}
          onOpenCustomFab={() => setCustomFabOpen(true)}
          onOpenCart={() => setCartOpen(true)}
          onOpenCustomerAuth={() => {
            setCustomerModalTab('account');
            setCustomerModalOpen(true);
          }}
          onOpenWishlist={() => {
            setCustomerModalTab('wishlist');
            setCustomerModalOpen(true);
          }}
          onOpenAdmin={() => setAdminOpen(true)}
          onSelectProduct={(p) => setSelectedProduct(p)}
        />

        <main className="flex-1">
          <div
            className={
              hasSidebarVideos
                ? 'lg:max-w-[1560px] lg:mx-auto lg:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-6 lg:items-start'
                : ''
            }
          >
            <div className={hasSidebarVideos ? 'lg:col-start-1 lg:row-start-1 min-w-0' : ''}>
              <LandingHero settings={settings} />
            </div>

            {hasSidebarVideos && (
              <div className="px-4 sm:px-6 mt-5 lg:px-0 lg:mt-6 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24 shrink-0">
                <VideoSidebarRail settings={settings} />
              </div>
            )}

            <div className={hasSidebarVideos ? 'lg:col-start-1 lg:row-start-2 min-w-0' : ''}>
              {/* Active AI Promotional Banners */}
              {banners.length > 0 && (
                <section id="offers" className="max-w-7xl mx-auto px-4 sm:px-6 pt-10">
                  <div className="space-y-4">
                    {banners.map((banner) => (
                      <div
                        key={banner.id}
                        className="rounded-2xl border border-[#D4AF37]/35 bg-gradient-to-l from-[#18140B] via-[#121216] to-[#0D0D10] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"
                      >
                        <div className="space-y-1.5">
                          {banner.discountLabel && (
                            <div className="text-xs font-bold text-[#E5C158]">
                              {banner.discountLabel}
                            </div>
                          )}
                          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F5F2EB]">
                            {banner.title}
                          </h2>
                          <p className="text-sm text-[#C5BFB2] max-w-2xl">{banner.subtitle}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <a
                            href="#products"
                            className="btn-gold-wave h-11 px-6 rounded-xl text-sm flex items-center justify-center whitespace-nowrap"
                          >
                            {banner.ctaText || 'تسوق الآن'}
                          </a>
                          <ShareButton title={banner.title} text={banner.subtitle} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Products Catalog Section */}
              <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 py-14 space-y-8">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-white/10 pb-6">
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-[#E5C158]">
                      {t(lang, 'approvedProducts')}
                    </div>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F2EB]">
                      {t(lang, 'catalogHeading')}
                    </h2>
                    {activeCategoryDescription && (
                      <p className="text-xs sm:text-sm text-[#C5BFB2]">
                        {activeCategoryDescription}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Custom Fabrication Button */}
                    <button
                      type="button"
                      onClick={() => setCustomFabOpen(true)}
                      className="h-10 px-4 rounded-xl border border-[#D4AF37]/50 bg-[#171510] hover:border-[#D4AF37] text-xs font-bold text-[#E5C158] flex items-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <Wrench className="w-4 h-4" />
                      <span>{t(lang, 'customFab')}</span>
                    </button>

                    {/* Category Filter Tabs */}
                    <div
                      className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl border border-white/10"
                      style={{ backgroundColor: settings.surfaceColor || '#121216' }}
                    >
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          style={
                            selectedCategory === cat
                              ? {
                                  backgroundColor: settings.primaryGoldColor || '#D4AF37',
                                  color: '#09090B',
                                }
                              : undefined
                          }
                          className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            selectedCategory === cat
                              ? 'font-bold'
                              : 'text-[#C5BFB2] hover:text-[#F5F2EB]'
                          }`}
                        >
                          {cat === 'الكل' ? t(lang, 'allCategory') : cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {visibleProducts.length === 0 ? (
                  <div className="py-16 text-center rounded-2xl border border-white/10 bg-[#121216] text-sm text-[#9E988C]">
                    {t(lang, 'noProductsInCategory')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        settings={settings}
                        currency={currency}
                        lang={lang}
                        isWishlisted={wishlistIds.includes(product.id)}
                        isCompared={compareIds.includes(product.id)}
                        onToggleWishlist={handleToggleWishlist}
                        onToggleCompare={handleToggleCompare}
                        onAddToCart={handleAddToCart}
                        onSelect={(p) => setSelectedProduct(p)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>

        <ShippingCarriersLogos settings={settings} />
        <CharitySection settings={settings} />
        <Footer settings={settings} lang={lang} onOpenAdmin={() => setAdminOpen(true)} />

        {/* Floating Product Comparison Bar */}
        {comparedProducts.length > 0 && (
          <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 max-w-xl rounded-2xl border border-[#D4AF37]/50 bg-[#121216]/95 backdrop-blur-md p-3 shadow-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Scale className="w-4 h-4 text-[#E5C158] shrink-0" />
              <span className="text-xs font-bold text-[#F5F2EB] truncate">
                {t(lang, 'compareNow')} ({comparedProducts.length})
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCompareOpen(true)}
                className="btn-gold-wave h-8 px-3.5 rounded-lg text-xs font-bold cursor-pointer"
              >
                {t(lang, 'compareNow')}
              </button>
              <button
                type="button"
                onClick={() => setCompareIds([])}
                aria-label={t(lang, 'clearCompare')}
                className="h-8 px-2.5 rounded-lg border border-white/15 text-xs text-[#9E988C] hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t(lang, 'clearCompare')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Cart Notification Toast */}
        {cartNotice && (
          <div className="fixed top-24 start-4 sm:start-6 z-50 px-4 py-3 rounded-xl border border-[#D4AF37]/50 bg-[#14120E] text-xs sm:text-sm text-[#E5C158] shadow-2xl">
            {cartNotice}
          </div>
        )}

        {/* Corner Ehsan & Charity Reminder Popup */}
        <CharityCornerPopup settings={settings} />

        {/* Floating Fixed WhatsApp Button */}
        <a
          href={`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
            `مرحباً ${settings.storeName}، لدي استفسار عن منتجاتكم.`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="تواصل مباشر عبر واتساب"
          className="fixed bottom-4 start-4 sm:bottom-6 sm:start-6 z-30 h-12 px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xl flex items-center gap-2 text-xs sm:text-sm font-bold transition-transform hover:scale-105"
        >
          <MessageCircle className="w-5 h-5 shrink-0" />
          <span className="hidden sm:inline">{t(lang, 'askWhatsappFloating')}</span>
        </a>

        {/* Modals & Drawers */}
        <ProductModal
          product={selectedProduct}
          settings={settings}
          currency={currency}
          lang={lang}
          reviews={reviews}
          isWishlisted={selectedProduct ? wishlistIds.includes(selectedProduct.id) : false}
          isCompared={selectedProduct ? compareIds.includes(selectedProduct.id) : false}
          onToggleWishlist={handleToggleWishlist}
          onToggleCompare={handleToggleCompare}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
        />

        <CompareModal
          open={compareOpen}
          products={comparedProducts}
          settings={settings}
          currency={currency}
          lang={lang}
          onClose={() => setCompareOpen(false)}
          onRemoveProduct={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
          onAddToCart={handleAddToCart}
        />

        <CustomFabricationModal
          open={customFabOpen}
          settings={settings}
          lang={lang}
          onClose={() => setCustomFabOpen(false)}
        />

        <CartDrawer
          open={cartOpen}
          items={cart}
          settings={settings}
          currency={currency}
          lang={lang}
          customer={customer}
          customerToken={customerToken}
          onClose={() => setCartOpen(false)}
          onUpdateQty={handleUpdateQty}
          onRemoveItem={handleRemoveItem}
          onClearCart={() => setCart([])}
          onCustomerUpdated={handleCustomerUpdated}
        />

        <CustomerAuthModal
          open={customerModalOpen}
          initialTab={customerModalTab}
          customer={customer}
          token={customerToken}
          settings={settings}
          currency={currency}
          lang={lang}
          wishlistProducts={wishlistProducts}
          onToggleWishlist={handleToggleWishlist}
          onAddToCart={handleAddToCart}
          onSelectProduct={(p) => setSelectedProduct(p)}
          onClose={() => setCustomerModalOpen(false)}
          onAuthSuccess={handleCustomerAuthSuccess}
          onCustomerUpdated={handleCustomerUpdated}
          onLogout={handleCustomerLogout}
        />

        <AdminDashboard
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          onStorefrontUpdated={loadStorefront}
        />
      </div>
    </div>
  );
}
