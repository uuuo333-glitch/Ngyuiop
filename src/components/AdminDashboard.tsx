import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  Cloud,
  Coins,
  Copy,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Film,
  Globe,
  HeartHandshake,
  KeyRound,
  Landmark,
  Languages,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  Megaphone,
  MessageCircle,
  Package,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Tags,
  Ticket,
  Trash2,
  Truck,
  Upload,
  Users,
  Wallet,
  Wand2,
  X,
} from 'lucide-react';
import { auth, googleSignIn, saveProductToFirestore } from '../firebase';
import { DEFAULT_CURRENCY_RATES } from '../i18n';
import type {
  AssistantMessage,
  CurrencyCode,
  CustomerProfile,
  GeneratedAdsCampaign,
  GroupChatMessage,
  Order,
  OrderStatus,
  OwnerAlert,
  OwnerWallet,
  Product,
  ProductReview,
  ProductSpec,
  PromoBanner,
  PromoDiscountCode,
  SiteAnalytics,
  StoreCategory,
  StoreSettings,
} from '../types';
import { GoogleDriveWorkspace } from './GoogleDriveWorkspace';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  DEFAULT_GROUP_CHAT_MESSAGES,
  DEFAULT_GROUP_CHAT_TITLE,
} from './GroupChatSection';
import { ProductImageStudioModal } from './ProductImageStudioModal';
import { ResilientImage } from './ResilientImage';
import { SquareImageCropModal } from './SquareImageCropModal';

interface AdminDashboardProps {
  open: boolean;
  onClose: () => void;
  onStorefrontUpdated: () => void;
}

type AdminTab =
  | 'overview'
  | 'wallet'
  | 'assistant'
  | 'products'
  | 'scraper'
  | 'ai-seo'
  | 'analytics'
  | 'drive'
  | 'settings';

const DEFAULT_OWNER_PASSWORD = '604608';
const FIXED_OWNER_PASSWORDS = ['604608', '2026'];

function isAcceptedOwnerPassword(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  return FIXED_OWNER_PASSWORDS.includes(trimmed) || trimmed === getStoredOwnerPassword();
}

function isAdminTokenFresh(token: string | null): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0]) return false;
  try {
    const b64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { role?: string; exp?: number };
    if (parsed?.role !== 'admin') return false;
    if (typeof parsed.exp === 'number' && Date.now() > parsed.exp - 60_000) return false;
    return true;
  } catch {
    return false;
  }
}

function parseSeoKeywordsText(raw: string): string[] {
  const parts = String(raw || '').split(/[،,]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const cleaned = part.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= 15) break;
  }
  return out;
}

function createFallbackAdminSettings(): StoreSettings {
  return {
    storeName: 'مصنع التاج الذهبي',
    storeTagline: 'دبات التلوث للديزل والبنزين بالمعايير الأوروبية Euro-6',
    categories: [
      { id: 'cat-1', name: 'دبات تلوث البنزين', description: '', isActive: true },
      { id: 'cat-2', name: 'دبات تلوث الديزل DPF', description: '', isActive: true },
      { id: 'cat-3', name: 'القلوب السيراميكية والرياضية', description: '', isActive: true },
    ],
    marqueeEnabled: true,
    marqueeText: 'تصنيع وتوريد دبات التلوث المعتمدة بجميع مقاسات السيارات',
    marqueeBgColor: '#12100B',
    marqueeTextColor: '#E5C158',
    marqueeSpeed: 28,
    marquee2Enabled: true,
    marquee2Text: 'ضمان حقيقي · اجتياز الفحص الدوري · شحن لجميع مناطق المملكة',
    marquee2BgColor: '#0D0D10',
    marquee2TextColor: '#F5F2EB',
    marquee2Speed: 24,
    heroEnabled: true,
    heroTitle: 'مصنع التاج الذهبي لدبات التلوث',
    heroSubtitle: 'تصنيع دبات تلوث للديزل والبنزين بخلايا بلاتين وسيراميك عالية الكفاءة.',
    heroCtaText: 'تصفح المنتجات الآن',
    heroBackdropMode: 'auto',
    heroVideoUrl: '',
    heroImageUrl: '',
    heroSlideshowImages: [],
    heroAnimatedMotion: 'kenburns',
    heroFeatures: [],
    sidebarVideosEnabled: true,
    sidebarVideoCount: 4,
    sidebarVideos: [],
    siteBackgroundType: 'none',
    siteBackgroundUrl: '',
    siteBackgroundOpacity: 0.2,
    siteBackgroundAnimatedMotion: 'kenburns',
    storeOpen: true,
    allowLanguageSwitch: true,
    defaultLanguage: 'ar',
    multiCurrencyEnabled: true,
    currencyRates: { ...DEFAULT_CURRENCY_RATES },
    priceDisplayMode: 'retail',
    installmentsEnabled: true,
    primaryGoldColor: '#D4AF37',
    backgroundColor: '#09090B',
    surfaceColor: '#131317',
    whatsappNumber: '966500000000',
    contactEmail: '',
    paypalBusinessEmail: '',
    paypalMeUrl: '',
    paypalClientId: '',
    paypalButtonsEnabled: true,
    paypalCardEnabled: true,
    bankTransferEnabled: true,
    bankName: '',
    bankAccountHolder: '',
    bankIban: '',
    bankAccountNumber: '',
    sarToUsdRate: 0.266,
    instagramUrl: '',
    tiktokUrl: '',
    aboutUsText: 'مصنع التاج الذهبي لدبات التلوث وقطع العادم المعتمدة بالريال السعودي.',
    showShippingLogos: true,
    shippingCarriers: ['زاجل (Zajil)', 'أرامكس (Aramex)', 'سمسا إكسبرس (SMSA)'],
    loyaltyEnabled: true,
    coinValueSar: 0.1,
    dailyCheckinCoins: 25,
    coinsPer100SarPurchase: 50,
    coinsPerProductShare: 15,
    charityPopupEnabled: true,
    seoAutoUpdateEnabled: true,
    seoKeywords: [],
    groupChatEnabled: true,
    groupChatTitle: DEFAULT_GROUP_CHAT_TITLE,
    groupChatMessages: DEFAULT_GROUP_CHAT_MESSAGES,
    ownerPersonalWhatsapp: '',
    ownerWhatsappWebhookUrl: '',
    autoWhatsappAlertsEnabled: false,
    ownerRecoveryEmail: '',
  };
}

function getStoredOwnerPassword(): string {
  try {
    const stored = localStorage.getItem('taj_owner_secret');
    if (stored === 'Admin@2026') {
      localStorage.setItem('taj_owner_secret', DEFAULT_OWNER_PASSWORD);
      return DEFAULT_OWNER_PASSWORD;
    }
    return stored || DEFAULT_OWNER_PASSWORD;
  } catch {
    return DEFAULT_OWNER_PASSWORD;
  }
}

export function AdminDashboard({
  open,
  onClose,
  onStorefrontUpdated,
}: AdminDashboardProps) {
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem('owner_authenticated') === 'true';
    } catch {
      return false;
    }
  });
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      const candidate =
        localStorage.getItem('taj_admin_token') ||
        sessionStorage.getItem('taj_admin_token') ||
        null;
      return isAdminTokenFresh(candidate) ? candidate : null;
    } catch {
      return null;
    }
  });
  const tokenRef = useRef<string | null>(adminToken);
  const inflightTokenRef = useRef<Promise<string | null> | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loadingData, setLoadingData] = useState(false);
  const [toast, setToast] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);

  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [alerts, setAlerts] = useState<OwnerAlert[]>([]);
  const [whatsappDigestText, setWhatsappDigestText] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [analytics, setAnalytics] = useState<SiteAnalytics | null>(null);

  // Owner Wallet & Purchasing
  const [ownerWallet, setOwnerWallet] = useState<OwnerWallet | null>(null);
  const [availableSalesTransferSar, setAvailableSalesTransferSar] = useState(0);
  const [availableOrdersCount, setAvailableOrdersCount] = useState(0);
  const [walletDepositAmount, setWalletDepositAmount] = useState('1000');
  const [walletDepositNote, setWalletDepositNote] = useState('');
  const [walletDepositBusy, setWalletDepositBusy] = useState(false);
  const [walletTransferBusy, setWalletTransferBusy] = useState(false);
  const [walletPurchaseMode, setWalletPurchaseMode] = useState<'product' | 'external'>('product');
  const [walletSelectedProductId, setWalletSelectedProductId] = useState('');
  const [walletPurchaseQty, setWalletPurchaseQty] = useState(1);
  const [walletPriceBasis, setWalletPriceBasis] = useState<'cost' | 'wholesale' | 'retail'>(
    'wholesale'
  );
  const [walletRecordOrder, setWalletRecordOrder] = useState(true);
  const [walletExtTitle, setWalletExtTitle] = useState('');
  const [walletExtCategory, setWalletExtCategory] = useState('توريد بضاعة ومخزون');
  const [walletExtAmount, setWalletExtAmount] = useState('');
  const [walletPurchaseRef, setWalletPurchaseRef] = useState('');
  const [walletPurchaseBusy, setWalletPurchaseBusy] = useState(false);
  const [walletTxFilter, setWalletTxFilter] = useState<'all' | 'in' | 'out'>('all');

  // Assistant Chat
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);

  // Products filter & editor
  const [productFilter, setProductFilter] = useState<'all' | 'published' | 'drafts'>('all');
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [productSeoKeywordsInput, setProductSeoKeywordsInput] = useState('');
  const [pendingCropFiles, setPendingCropFiles] = useState<File[]>([]);
  const [savingProduct, setSavingProduct] = useState(false);
  const [translatingProduct, setTranslatingProduct] = useState(false);
  const [uploadingProductImages, setUploadingProductImages] = useState(false);
  const [modalImportUrl, setModalImportUrl] = useState('');
  const [modalManualText, setModalManualText] = useState('');
  const [showManualPasteBox, setShowManualPasteBox] = useState(false);
  const [importingFromUrl, setImportingFromUrl] = useState(false);
  const [importingFromText, setImportingFromText] = useState(false);
  const [importUrlStatus, setImportUrlStatus] = useState('');
  const [importUrlWarning, setImportUrlWarning] = useState('');
  const [importUrlError, setImportUrlError] = useState('');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(() => auth.currentUser);
  const [connectingFirebase, setConnectingFirebase] = useState(false);

  // Secret AI Scraper
  const [scraperMode, setScraperMode] = useState<'similar' | 'single'>('single');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeProductName, setScrapeProductName] = useState('');
  const [scrapeCategory, setScrapeCategory] = useState('دبات تلوث البنزين');
  const [scrapeAiGeneratedImg, setScrapeAiGeneratedImg] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [lastScraped, setLastScraped] = useState<Product | null>(null);
  const [similarStoreUrl, setSimilarStoreUrl] = useState('');
  const [similarHint, setSimilarHint] = useState('');
  const [similarCategory, setSimilarCategory] = useState('دبات تلوث البنزين');
  const [profitMarginPercent, setProfitMarginPercent] = useState(30);
  const [extraProfitSar, setExtraProfitSar] = useState(100);
  const [similarBatch, setSimilarBatch] = useState<Product[]>([]);
  const [storeSeoKeywordsInput, setStoreSeoKeywordsInput] = useState('');

  // Store Categories + AI Copy/Identity Enhancement + Studio Image Editor
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [enhancingStore, setEnhancingStore] = useState(false);
  const [enhancingProductCopy, setEnhancingProductCopy] = useState(false);
  const [optimizingBg, setOptimizingBg] = useState(false);
  const [studioTarget, setStudioTarget] = useState<{
    productId?: string;
    fromEditorModal: boolean;
    imageUrl: string;
    name: string;
    category: string;
    priceSar?: number;
  } | null>(null);

  // AI SEO & Google Ads
  const [refreshingSeo, setRefreshingSeo] = useState(false);
  const [adsProductId, setAdsProductId] = useState('');
  const [adsGoal, setAdsGoal] = useState('');
  const [generatingAds, setGeneratingAds] = useState(false);
  const [generatedCampaign, setGeneratedCampaign] = useState<GeneratedAdsCampaign | null>(null);
  const [copiedKey, setCopiedKey] = useState('');

  // Analytics CSV Date Range
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Promo Codes Draft (4-character code)
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoType, setNewPromoType] = useState<'percent' | 'fixed'>('percent');
  const [newPromoValue, setNewPromoValue] = useState('10');

  // Settings, Upload, Coins & Password
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState('');
  const [coinDrafts, setCoinDrafts] = useState<Record<string, string>>({});
  const [adjustingCoinId, setAdjustingCoinId] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwNotice, setPwNotice] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const openProductEditor = (productData: Partial<Product>) => {
    setModalImportUrl('');
    setModalManualText('');
    setShowManualPasteBox(false);
    setImportUrlStatus('');
    setImportUrlWarning('');
    setImportUrlError('');
    setProductSeoKeywordsInput((productData.seoKeywords || []).slice(0, 15).join('، '));
    setEditingProduct({ ...productData });
  };

  const persistAuthTokens = useCallback((token: string | null, secret?: string) => {
    if (token) {
      tokenRef.current = token;
    }
    try {
      localStorage.setItem('owner_authenticated', 'true');
      if (secret) localStorage.setItem('taj_owner_secret', secret);
      if (token) {
        localStorage.setItem('taj_admin_token', token);
        sessionStorage.setItem('taj_admin_token', token);
      }
    } catch {
      // ignore storage quota
    }
  }, []);

  const clearStoredAdminToken = useCallback(() => {
    tokenRef.current = null;
    setAdminToken(null);
    try {
      localStorage.removeItem('taj_admin_token');
      sessionStorage.removeItem('taj_admin_token');
    } catch {
      // ignore
    }
  }, []);

  const requestServerAdminToken = useCallback(
    async (preferredPassword?: string): Promise<string | null> => {
      if (!preferredPassword && inflightTokenRef.current) {
        return inflightTokenRef.current;
      }

      const task = (async (): Promise<string | null> => {
        const candidates = Array.from(
          new Set(
            [preferredPassword, getStoredOwnerPassword(), ...FIXED_OWNER_PASSWORDS].filter(
              (v): v is string => Boolean(v && v.trim())
            )
          )
        );
        for (let attempt = 0; attempt < 2; attempt++) {
          for (const pw of candidates) {
            try {
              const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw }),
              });
              if (res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data?.token) {
                  persistAuthTokens(data.token, pw);
                  setAdminToken(data.token);
                  return data.token as string;
                }
              }
            } catch {
              // retry transient network failure
            }
          }
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 350));
          }
        }
        return null;
      })();

      if (!preferredPassword) {
        inflightTokenRef.current = task;
      }
      try {
        return await task;
      } finally {
        if (inflightTokenRef.current === task) {
          inflightTokenRef.current = null;
        }
      }
    },
    [persistAuthTokens]
  );

  const ensureAdminSessionToken = useCallback(
    async (forceRefresh = false): Promise<string | null> => {
      if (!forceRefresh) {
        let candidate = tokenRef.current || adminToken;
        if (!candidate) {
          try {
            candidate =
              localStorage.getItem('taj_admin_token') ||
              sessionStorage.getItem('taj_admin_token') ||
              null;
          } catch {
            candidate = null;
          }
        }
        if (isAdminTokenFresh(candidate)) {
          tokenRef.current = candidate;
          if (candidate !== adminToken) {
            setAdminToken(candidate);
          }
          return candidate;
        }
      }
      clearStoredAdminToken();
      return requestServerAdminToken();
    },
    [adminToken, clearStoredAdminToken, requestServerAdminToken]
  );

  const adminFetch = useCallback(
    async (input: string, init: RequestInit = {}): Promise<Response> => {
      let tk = await ensureAdminSessionToken(false);
      if (!tk) {
        tk = await ensureAdminSessionToken(true);
      }
      if (!tk) {
        return new Response(
          JSON.stringify({
            error: 'تعذر التحقق من جلسة المالك. يرجى المحاولة مرة أخرى أو إعادة تسجيل الدخول.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const headers = new Headers(init.headers || undefined);
      headers.set('Authorization', `Bearer ${tk}`);
      let res = await fetch(input, { ...init, headers });

      if (res.status === 401) {
        clearStoredAdminToken();
        const freshTk = await ensureAdminSessionToken(true);
        if (freshTk) {
          const retryHeaders = new Headers(init.headers || undefined);
          retryHeaders.set('Authorization', `Bearer ${freshTk}`);
          res = await fetch(input, { ...init, headers: retryHeaders });
        }
      }
      return res;
    },
    [clearStoredAdminToken, ensureAdminSessionToken]
  );

  const loadFallbackDashboardData = useCallback(async () => {
    try {
      const cachedRaw = localStorage.getItem('taj_admin_dashboard_cache');
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached.settings) {
          setSettings(cached.settings);
          setStoreSeoKeywordsInput((cached.settings.seoKeywords || []).slice(0, 15).join('، '));
        } else {
          setSettings((prev) => prev || createFallbackAdminSettings());
        }
        if (cached.products) setProducts(cached.products);
        if (cached.banners) setBanners(cached.banners);
        if (cached.customers) setCustomers(cached.customers);
        if (cached.orders) setOrders(cached.orders);
        if (cached.reviews) setReviews(cached.reviews);
        if (cached.analytics) setAnalytics(cached.analytics);
        return;
      }
      const sfRes = await fetch('/api/storefront');
      if (sfRes.ok) {
        const sfData = await sfRes.json();
        const baseSettings = { ...createFallbackAdminSettings(), ...(sfData.settings || {}) };
        setSettings(baseSettings);
        setStoreSeoKeywordsInput((baseSettings.seoKeywords || []).slice(0, 15).join('، '));
        setProducts(sfData.products || []);
        setBanners(sfData.banners || []);
      } else {
        setSettings((prev) => prev || createFallbackAdminSettings());
      }
    } catch {
      setSettings((prev) => prev || createFallbackAdminSettings());
    }
  }, []);

  const fetchDashboard = useCallback(
    async (tokenOverride?: string) => {
      let tk = tokenOverride || (await ensureAdminSessionToken(false));
      if (!tk) {
        await loadFallbackDashboardData();
        return;
      }
      setLoadingData(true);
      try {
        let res = await fetch('/api/admin/dashboard', {
          headers: { Authorization: `Bearer ${tk}` },
        });
        if (res.status === 401) {
          const refreshed = await ensureAdminSessionToken(true);
          if (refreshed) {
            tk = refreshed;
            res = await fetch('/api/admin/dashboard', {
              headers: { Authorization: `Bearer ${refreshed}` },
            });
          }
        }
        if (!res.ok) {
          await loadFallbackDashboardData();
          return;
        }
        const data = await res.json();
        const loadedSettings = data.settings || createFallbackAdminSettings();
        setSettings(loadedSettings);
        setStoreSeoKeywordsInput((loadedSettings.seoKeywords || []).slice(0, 15).join('، '));
        setProducts(data.products || []);
        setBanners(data.banners || []);
        setCustomers(data.customers || []);
        setOrders(data.orders || []);
        setReviews(data.reviews || []);
        setAlerts(data.alerts || []);
        setWhatsappDigestText(data.whatsappDigestText || '');
        setAssistantMessages(data.assistantMessages || []);
        setAnalytics(data.analytics || null);
        if (data.ownerWallet?.wallet) {
          setOwnerWallet(data.ownerWallet.wallet);
          setAvailableSalesTransferSar(data.ownerWallet.availableSalesTransferSar || 0);
          setAvailableOrdersCount(data.ownerWallet.availableOrdersCount || 0);
        }
        if ((data.products || []).length > 0) {
          setWalletSelectedProductId((prev) => prev || data.products[0].id);
        }
        try {
          localStorage.setItem(
            'taj_admin_dashboard_cache',
            JSON.stringify({
              settings: loadedSettings,
              products: data.products || [],
              banners: data.banners || [],
              customers: data.customers || [],
              orders: data.orders || [],
              reviews: data.reviews || [],
              analytics: data.analytics || null,
            })
          );
        } catch {
          // ignore cache overflow
        }
      } catch {
        await loadFallbackDashboardData();
      } finally {
        setLoadingData(false);
      }
    },
    [ensureAdminSessionToken, loadFallbackDashboardData]
  );

  // Sync background server token when owner_authenticated is already active
  useEffect(() => {
    if (!open || !isOwnerAuthenticated) return;
    void fetchDashboard();
  }, [open, isOwnerAuthenticated, fetchDashboard]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
    });
    return () => unsub();
  }, []);

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const entered = passwordInput.trim();
    if (!entered) {
      setLoginError('يرجى إدخال كلمة مرور المالك');
      return;
    }

    setLoggingIn(true);
    try {
      if (isAcceptedOwnerPassword(entered)) {
        persistAuthTokens(null, entered);
        setPasswordInput('');
        setIsOwnerAuthenticated(true);
        const token = await requestServerAdminToken(entered);
        await fetchDashboard(token || undefined);
        return;
      }

      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: entered }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.token) {
        setLoginError('كلمة المرور غير صحيحة. يرجى إدخال 604608 أو 2026.');
        return;
      }

      persistAuthTokens(data.token, entered);
      setPasswordInput('');
      setIsOwnerAuthenticated(true);
      setAdminToken(data.token);
      await fetchDashboard(data.token);
    } catch {
      if (isAcceptedOwnerPassword(entered)) {
        persistAuthTokens(null, entered);
        setIsOwnerAuthenticated(true);
        setPasswordInput('');
        await fetchDashboard();
      } else {
        setLoginError('كلمة المرور غير صحيحة. يرجى إدخال 604608 أو 2026.');
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    try {
      localStorage.removeItem('owner_authenticated');
      localStorage.removeItem('taj_admin_token');
      sessionStorage.removeItem('taj_admin_token');
    } catch {
      // ignore
    }
    tokenRef.current = null;
    setIsOwnerAuthenticated(false);
    setAdminToken(null);
    setNotifOpen(false);
    onClose();
  };

  const handleUploadFile = async (
    file: File,
    target:
      | 'heroImage'
      | 'heroVideo'
      | 'heroSlideshow'
      | 'siteBg'
      | 'siteBgVideo'
      | 'guidePdf'
      | 'guideImage'
      | 'sidebarVideo-0'
      | 'sidebarVideo-1'
      | 'sidebarVideo-2'
      | 'sidebarVideo-3'
  ) => {
    const isVideoTarget =
      target.startsWith('sidebarVideo-') || target === 'siteBgVideo' || target === 'heroVideo';
    const maxBytes = isVideoTarget ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      showToast(
        isVideoTarget
          ? 'الحد الأقصى لحجم ملف الفيديو المرفوع 100 ميجابايت.'
          : 'الحد الأقصى لحجم الملف المرفوع 20 ميجابايت.'
      );
      return;
    }
    setUploadingTarget(target);
    try {
      let resolvedUrl = '';
      if (isVideoTarget) {
        const res = await adminFetch('/api/admin/upload-binary', {
          method: 'POST',
          headers: {
            'Content-Type': file.type || 'video/mp4',
            'X-Filename': encodeURIComponent(file.name),
            'X-Mime-Type': file.type || 'video/mp4',
          },
          body: file,
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.url) resolvedUrl = data.url as string;
        }
      }

      if (!resolvedUrl) {
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('فشل قراءة الملف'));
          reader.readAsDataURL(file);
        });

        resolvedUrl = dataBase64;
        const res = await adminFetch('/api/admin/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataBase64,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.url) resolvedUrl = data.url as string;
        }
      }

      if (target === 'guidePdf' && editingProduct) {
        setEditingProduct({ ...editingProduct, installationGuidePdfUrl: resolvedUrl });
        showToast('تم رفع ملف دليل التركيب PDF بنجاح.');
        return;
      }
      if (target === 'guideImage' && editingProduct) {
        setEditingProduct({
          ...editingProduct,
          installationGuideImages: [
            ...(editingProduct.installationGuideImages || []).filter(Boolean),
            resolvedUrl,
          ],
        });
        showToast('تمت إضافة صورة دليل التركيب بنجاح.');
        return;
      }

      const activeSettings = settings || createFallbackAdminSettings();
      if (target === 'heroImage') {
        setSettings({ ...activeSettings, heroImageUrl: resolvedUrl });
      } else if (target === 'heroVideo') {
        setSettings({
          ...activeSettings,
          heroVideoUrl: resolvedUrl,
          heroBackdropMode: 'video',
        });
      } else if (target === 'heroSlideshow') {
        setSettings({
          ...activeSettings,
          heroSlideshowImages: [...(activeSettings.heroSlideshowImages || []), resolvedUrl],
          heroBackdropMode: 'slideshow',
        });
      } else if (target === 'siteBg') {
        const isAnimated = file.type.includes('gif') || activeSettings.siteBackgroundType === 'animated_image';
        setSettings({
          ...activeSettings,
          siteBackgroundUrl: resolvedUrl,
          siteBackgroundType: isAnimated ? 'animated_image' : 'image',
        });
      } else if (target === 'siteBgVideo') {
        setSettings({
          ...activeSettings,
          siteBackgroundUrl: resolvedUrl,
          siteBackgroundType: 'video',
        });
      } else if (target.startsWith('sidebarVideo-')) {
        const slotIdx = Number(target.split('-')[1]);
        const currentList = [...(activeSettings.sidebarVideos || [])];
        while (currentList.length <= slotIdx) {
          currentList.push({
            id: `vid-${currentList.length + 1}`,
            title: `فيديو عرض ${currentList.length + 1}`,
            url: '',
          });
        }
        currentList[slotIdx] = { ...currentList[slotIdx], url: resolvedUrl };
        setSettings({ ...activeSettings, sidebarVideos: currentList });
      }
      showToast('تم رفع الملف بنجاح! اضغط "حفظ وتطبيق" لتثبيته في المتجر فوراً.');
    } catch {
      showToast('تعذر رفع الملف.');
    } finally {
      setUploadingTarget('');
    }
  };

  // Trigger interactive 1:1 (1000x1000 px) cropper modal on selected product images
  const handleProductMultiImageUpload = (files: FileList | null) => {
    if (!files || files.length === 0 || !editingProduct) return;
    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        showToast(`الصورة "${file.name}" أكبر من 20 ميجابايت.`);
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length > 0) {
      setPendingCropFiles(validFiles);
    }
  };

  const handleCropModalComplete = async (
    croppedFiles: { dataUrl: string; fileName: string }[]
  ) => {
    setPendingCropFiles([]);
    if (!editingProduct || croppedFiles.length === 0) return;
    setUploadingProductImages(true);
    try {
      const uploadedUrls: string[] = [];

      for (const item of croppedFiles) {
        let finalUrl = item.dataUrl;
        try {
          const res = await adminFetch('/api/admin/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filename: item.fileName,
              mimeType: 'image/jpeg',
              dataBase64: item.dataUrl,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.url) finalUrl = data.url as string;
          }
        } catch {
          // Keep dataUrl fallback when server upload fails
        }
        uploadedUrls.push(finalUrl);
      }

      setEditingProduct((prev) => {
        if (!prev) return prev;
        const existingImages = (prev.images || []).filter((s) => s.trim().length > 0);
        return {
          ...prev,
          images: [...existingImages, ...uploadedUrls],
        };
      });

      showToast(
        `تم قص وضبط مقاس ${uploadedUrls.length} صورة تلقائياً (1000 × 1000 بكسل) وإضافتها بنجاح.`
      );
    } catch {
      showToast('تعذر رفع الصور المقصوصة.');
    } finally {
      setUploadingProductImages(false);
    }
  };

  const handleRemoveEditingImage = (indexToRemove: number) => {
    if (!editingProduct) return;
    const nextImages = (editingProduct.images || []).filter((_, idx) => idx !== indexToRemove);
    setEditingProduct({
      ...editingProduct,
      images: nextImages,
    });
    try {
      const productKey = editingProduct.id || 'draft_new_product';
      const savedMapRaw = localStorage.getItem('taj_product_uploaded_images');
      const savedMap = savedMapRaw ? JSON.parse(savedMapRaw) : {};
      savedMap[productKey] = nextImages;
      localStorage.setItem('taj_product_uploaded_images', JSON.stringify(savedMap));
    } catch {
      // ignore
    }
  };

  const fetchPageHtmlViaProxy = async (
    targetUrl: string
  ): Promise<{ html?: string; blocked: boolean }> => {
    const proxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
    ];
    let sawBlock = false;
    for (const proxyUrl of proxies) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8500);
      try {
        const resp = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
          sawBlock = true;
          continue;
        }
        if (resp.ok) {
          const text = await resp.text();
          if (text && text.length > 200) {
            return { html: text, blocked: false };
          }
          sawBlock = true;
        }
      } catch {
        clearTimeout(timer);
        sawBlock = true;
      }
    }
    return { blocked: sawBlock };
  };

  const applyAiImportedProduct = (
    imported: Partial<Product> & { originalExtractedPrice?: string },
    sourceUrl?: string
  ) => {
    const existingCustomUploads = (editingProduct?.images || []).filter((img) =>
      img.startsWith('data:')
    );
    const importedImages = Array.isArray(imported.images)
      ? imported.images.filter(
          (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0
        )
      : [];
    const combinedImages = Array.from(new Set([...importedImages, ...existingCustomUploads]));

    setEditingProduct((prev) => ({
      ...(prev || {}),
      name: imported.name || prev?.name || '',
      nameEn: imported.nameEn || prev?.nameEn || '',
      description: imported.description || prev?.description || '',
      descriptionEn: imported.descriptionEn || prev?.descriptionEn || '',
      priceSar:
        Number(imported.priceSar) > 0 ? Number(imported.priceSar) : prev?.priceSar || 590,
      category:
        imported.category ||
        prev?.category ||
        settings?.categories?.[0]?.name ||
        'دبات تلوث البنزين',
      images: combinedImages.length > 0 ? combinedImages : prev?.images || [],
      specs:
        Array.isArray(imported.specs) && imported.specs.length > 0
          ? imported.specs
          : prev?.specs || [],
      ...(sourceUrl ? { sourceUrl } : {}),
      originalExtractedPrice: imported.originalExtractedPrice || prev?.originalExtractedPrice,
    }));

    return importedImages.length;
  };

  const handleImportProductFromUrlInModal = async () => {
    if (!editingProduct) return;
    const cleanUrl = modalImportUrl.trim();
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
      setImportUrlError('يرجى إدخال رابط منتج صحيح يبدأ بـ https:// أو http://');
      return;
    }

    setImportingFromUrl(true);
    setImportUrlError('');
    setImportUrlWarning('');
    setImportUrlStatus('جاري جلب محتوى صفحة المنتج عبر البروكسي المجاني...');

    try {
      const proxyResult = await fetchPageHtmlViaProxy(cleanUrl);
      setImportUrlStatus(
        proxyResult.html
          ? 'تم سحب محتوى الصفحة بنجاح — جاري التحليل والصياغة عبر Gemini AI...'
          : 'جاري محاولة قراءة الرابط عبر الخادم والذكاء الاصطناعي...'
      );

      const res = await adminFetch('/api/admin/ai/import-from-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: cleanUrl,
          htmlContent: proxyResult.html,
        }),
      });
      const data = await res.json();

      if (data.blockedByProtection || (!data.product && res.ok)) {
        setImportUrlStatus('');
        setImportUrlWarning(
          data.warningMessage ||
            'الموقع الخارجي محمي ورفض السحب الآلي. يُرجى استخدام "الطريقة الثانية (اللصق اليدوي)" أدناه: انسخ نص تفاصيل المنتج من الصفحة والصقه ليتم تعبئة الحقول فوراً.'
        );
        setShowManualPasteBox(true);
        return;
      }

      if (!res.ok || !data.product) {
        setImportUrlStatus('');
        setImportUrlError(data.error || 'تعذر تحليل بيانات المنتج من الرابط.');
        return;
      }

      const imgCount = applyAiImportedProduct(data.product, cleanUrl);
      setImportUrlStatus(
        `تم استيراد بيانات المنتج وتعبئة الحقول تلقائياً (${imgCount} صورة). راجع البيانات والسعر ثم احفظ في Firebase.`
      );
      showToast('تم استيراد وتعبئة بيانات المنتج وصوره بالذكاء الاصطناعي!');
    } catch {
      setImportUrlStatus('');
      setImportUrlWarning(
        'تعذر السحب الآلي لأن الموقع الخارجي محمي أو يفرض قيود اتصال. استخدم "الطريقة الثانية (اللصق اليدوي)" أدناه للصق نص المنتج مباشرة.'
      );
      setShowManualPasteBox(true);
    } finally {
      setImportingFromUrl(false);
    }
  };

  const handleAnalyzeManualProductText = async () => {
    if (!editingProduct) return;
    const cleanText = modalManualText.trim();
    if (cleanText.length < 15) {
      setImportUrlError('يرجى لصق نص أو تفاصيل المنتج أولاً (15 حرفاً على الأقل).');
      return;
    }

    setImportingFromText(true);
    setImportUrlError('');
    setImportUrlWarning('');
    setImportUrlStatus('جاري تحليل النص الملصق وصياغة البيانات بالعربية عبر Gemini AI...');

    try {
      const res = await adminFetch('/api/admin/ai/import-from-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: modalImportUrl.trim() || undefined,
          rawText: cleanText,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.product) {
        setImportUrlStatus('');
        setImportUrlError(data.error || 'تعذر تحليل النص الملصق بالذكاء الاصطناعي.');
        return;
      }

      const imgCount = applyAiImportedProduct(
        data.product,
        modalImportUrl.trim() || undefined
      );
      setImportUrlStatus(
        `تم تحليل النص وتعبئة جميع حقول المنتج بنجاح${imgCount > 0 ? ` (${imgCount} صورة)` : ''}. يمكنك المراجعة والتعديل قبل الحفظ النهائي.`
      );
      showToast('تم تحليل النص وتعبئة بيانات المنتج بنجاح!');
    } catch {
      setImportUrlError('حدث خطأ أثناء تحليل النص بالذكاء الاصطناعي.');
    } finally {
      setImportingFromText(false);
    }
  };

  const handleQuickGoogleConnectForFirebase = async () => {
    setConnectingFirebase(true);
    try {
      const res = await googleSignIn();
      if (res?.user) {
        setFirebaseUser(res.user);
        showToast('تم ربط حساب Google بنجاح للحفظ الفوري في Firebase!');
      }
    } catch {
      showToast('تعذر إكمال ربط حساب Google. يرجى السماح بالنوافذ المنبثقة.');
    } finally {
      setConnectingFirebase(false);
    }
  };

  const handleTranslateProductWithAi = async () => {
    if (!editingProduct) return;
    setTranslatingProduct(true);
    try {
      const res = await adminFetch('/api/admin/ai/translate-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editingProduct.name || '',
          description: editingProduct.description || '',
          category: editingProduct.category || '',
        }),
      });
      const data = await res.json();
      if (res.ok && (data.nameEn || data.descriptionEn)) {
        setEditingProduct({
          ...editingProduct,
          nameEn: data.nameEn || editingProduct.nameEn || '',
          descriptionEn: data.descriptionEn || editingProduct.descriptionEn || '',
        });
        showToast('تمت الترجمة التلقائية للاسم والوصف إلى الإنجليزية!');
      } else {
        showToast(data.error || 'تعذر الترجمة التلقائية.');
      }
    } catch {
      showToast('تعذر الاتصال بخدمة الترجمة.');
    } finally {
      setTranslatingProduct(false);
    }
  };

  const handleOptimizeBackgroundWithAi = async () => {
    if (!settings) return;
    setOptimizingBg(true);
    try {
      const res = await adminFetch('/api/admin/ai/optimize-background', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storeName: settings.storeName,
          siteBackgroundType: settings.siteBackgroundType,
          siteBackgroundOpacity: settings.siteBackgroundOpacity,
          heroBackdropMode: settings.heroBackdropMode,
        }),
      });
      const data = await res.json();
      if (res.ok && data.recommendation) {
        const rec = data.recommendation;
        const nextSettings: StoreSettings = {
          ...settings,
          siteBackgroundOpacity:
            typeof rec.siteBackgroundOpacity === 'number'
              ? rec.siteBackgroundOpacity
              : settings.siteBackgroundOpacity,
          siteBackgroundAnimatedMotion:
            rec.siteBackgroundAnimatedMotion || settings.siteBackgroundAnimatedMotion || 'kenburns',
          siteBackgroundFilter: rec.siteBackgroundFilter || settings.siteBackgroundFilter || '',
          heroAnimatedMotion:
            rec.heroAnimatedMotion || settings.heroAnimatedMotion || 'kenburns',
          heroBackdropFilter: rec.heroBackdropFilter || settings.heroBackdropFilter || '',
        };
        setSettings(nextSettings);
        showToast(rec.noteAr || 'تم ضبط تباين وحركة الخلفية تلقائياً بالذكاء الاصطناعي!');
      } else {
        showToast(data.error || 'تعذر ضبط الخلفية بالذكاء الاصطناعي.');
      }
    } catch {
      showToast('تعذر الاتصال بخدمة ضبط الخلفية.');
    } finally {
      setOptimizingBg(false);
    }
  };

  const handleApproveReview = async (reviewId: string, approved: boolean) => {
    const res = await adminFetch(`/api/admin/reviews/${reviewId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ approved }),
    });
    if (res.ok) {
      const data = await res.json();
      setReviews((prev) => prev.map((r) => (r.id === reviewId ? data.review : r)));
      onStorefrontUpdated();
      showToast(approved ? 'تم اعتماد ونشر التقييم في المتجر.' : 'تم إخفاء التقييم عن المتجر.');
    } else {
      showToast('تعذر تحديث حالة التقييم.');
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    const res = await adminFetch(`/api/admin/reviews/${reviewId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      onStorefrontUpdated();
      showToast('تم حذف التقييم.');
    } else {
      showToast('تعذر حذف التقييم.');
    }
  };

  const handleExportProfitCsv = () => {
    const startTs = reportFrom ? new Date(`${reportFrom}T00:00:00`).getTime() : 0;
    const endTs = reportTo ? new Date(`${reportTo}T23:59:59`).getTime() : Infinity;

    const rangeOrders = orders.filter((o) => {
      if (o.status === 'ملغي') return false;
      const t = new Date(o.createdAt).getTime();
      return t >= startTs && t <= endTs;
    });

    const statsMap = new Map<
      string,
      { name: string; units: number; revenueSar: number; costSar: number }
    >();

    for (const ord of rangeOrders) {
      for (const it of ord.items) {
        const prod = products.find((p) => p.id === it.productId);
        const unitCost = prod?.costPriceSar ?? Math.round(it.priceSar * 0.65);
        const cur = statsMap.get(it.productId) || {
          name: it.name,
          units: 0,
          revenueSar: 0,
          costSar: 0,
        };
        cur.units += it.quantity;
        cur.revenueSar += it.priceSar * it.quantity;
        cur.costSar += unitCost * it.quantity;
        statsMap.set(it.productId, cur);
      }
    }

    const rows = Array.from(statsMap.entries())
      .map(([pid, s]) => ({
        productId: pid,
        ...s,
        netProfitSar: s.revenueSar - s.costSar,
      }))
      .sort((a, b) => b.units - a.units);

    const header = [
      'كود/معرف المنتج',
      'اسم المنتج',
      'الكمية المباعة',
      'إجمالي المبيعات (SAR)',
      'التكلفة التقديرية (SAR)',
      'صافي الربح (SAR)',
    ].join(',');
    const csvLines = rows.map((r) =>
      [
        `"${r.productId}"`,
        `"${r.name.replace(/"/g, '""')}"`,
        r.units,
        r.revenueSar.toFixed(2),
        r.costSar.toFixed(2),
        r.netProfitSar.toFixed(2),
      ].join(',')
    );
    const totalRev = rows.reduce((s, r) => s + r.revenueSar, 0);
    const totalProfit = rows.reduce((s, r) => s + r.netProfitSar, 0);
    csvLines.push(
      `"الإجمالي للفترة","من ${reportFrom} إلى ${reportTo}",${rows.reduce(
        (s, r) => s + r.units,
        0
      )},${totalRev.toFixed(2)},${rows.reduce((s, r) => s + r.costSar, 0).toFixed(2)},${totalProfit.toFixed(2)}`
    );

    const csvContent = '\uFEFF' + [header, ...csvLines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `taj-profit-report-${reportFrom}-to-${reportTo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('تم تصدير تقرير الأرباح والمنتجات (CSV) بنجاح.');
  };


  const handleAssistantSend = async (promptOverride?: string) => {
    const text = (promptOverride ?? assistantInput).trim();
    if (!text) return;
    if (!promptOverride) setAssistantInput('');
    setAssistantBusy(true);
    try {
      const res = await adminFetch('/api/admin/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'تعذر تنفيذ طلب المساعد.');
        return;
      }
      setAssistantMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
      if (data.products) setProducts(data.products);
      if (data.alerts) setAlerts(data.alerts);
      if (data.whatsappDigestText) setWhatsappDigestText(data.whatsappDigestText);
      if (data.mutatedStorefront) {
        onStorefrontUpdated();
        showToast('نفّذ المساعد الذكي التحديث في المتجر بنجاح.');
      }
    } catch {
      showToast('حدث خطأ في الاتصال بالمساعد الذكي.');
    } finally {
      setAssistantBusy(false);
    }
  };

  const handleSendWebhookDigest = async () => {
    const res = await adminFetch('/api/admin/assistant/send-webhook', {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    if (data.sent) {
      showToast('تم إرسال التقرير تلقائياً إلى Webhook واتساب المالك.');
    } else {
      showToast('لم يتم ضبط رابط Webhook، يمكنك الإرسال مباشرة عبر زر فتح واتساب.');
    }
  };

  const handleOrderUpdate = async (
    orderId: string,
    patch: {
      status?: OrderStatus;
      shippingCompany?: string;
      trackingNumber?: string;
      shippingNotice?: string;
    }
  ) => {
    const res = await adminFetch(`/api/admin/orders/${orderId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
      showToast('تم حفظ تحديث الطلب وإشعار الشحن.');
    } else {
      showToast('تعذر حفظ تحديث الطلب.');
    }
  };

  const handleWalletDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(walletDepositAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('يرجى إدخال مبلغ إيداع صحيح أكبر من صفر.');
      return;
    }
    setWalletDepositBusy(true);
    try {
      const res = await adminFetch('/api/admin/wallet/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amountSar: amt,
          note: walletDepositNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'تعذر شحن المحفظة.');
        return;
      }
      if (data.wallet) setOwnerWallet(data.wallet);
      if (typeof data.availableSalesTransferSar === 'number') {
        setAvailableSalesTransferSar(data.availableSalesTransferSar);
      }
      if (typeof data.availableOrdersCount === 'number') {
        setAvailableOrdersCount(data.availableOrdersCount);
      }
      setWalletDepositNote('');
      showToast(`تم شحن محفظة المالك بمبلغ +${amt.toLocaleString('ar-SA')} ر.س بنجاح.`);
    } catch {
      showToast('تعذر الاتصال بالخادم لإيداع الرصيد.');
    } finally {
      setWalletDepositBusy(false);
    }
  };

  const handleWalletTransferSales = async () => {
    setWalletTransferBusy(true);
    try {
      const res = await adminFetch('/api/admin/wallet/transfer-sales', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'لا توجد مبيعات متاحة للترحيل حالياً.');
        return;
      }
      if (data.wallet) setOwnerWallet(data.wallet);
      setAvailableSalesTransferSar(data.availableSalesTransferSar ?? 0);
      setAvailableOrdersCount(data.availableOrdersCount ?? 0);
      showToast(
        `تم ترحيل +${Number(data.transferredSar || 0).toLocaleString('ar-SA')} ر.س من مبيعات المتجر إلى المحفظة.`
      );
    } catch {
      showToast('تعذر ترحيل المبيعات حالياً.');
    } finally {
      setWalletTransferBusy(false);
    }
  };

  const handleWalletPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setWalletPurchaseBusy(true);
    try {
      const res = await adminFetch('/api/admin/wallet/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          walletPurchaseMode === 'product'
            ? {
                mode: 'product',
                productId: walletSelectedProductId || products[0]?.id,
                quantity: walletPurchaseQty,
                priceBasis: walletPriceBasis,
                reference: walletPurchaseRef.trim() || undefined,
                recordStoreOrder: walletRecordOrder,
              }
            : {
                mode: 'external',
                title: walletExtTitle.trim(),
                category: walletExtCategory,
                amountSar: Number(walletExtAmount) || 0,
                reference: walletPurchaseRef.trim() || undefined,
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'تعذر إتمام عملية الشراء من المحفظة.');
        return;
      }
      if (data.wallet) setOwnerWallet(data.wallet);
      if (data.order) {
        setOrders((prev) => [data.order as Order, ...prev]);
      }
      if (typeof data.availableSalesTransferSar === 'number') {
        setAvailableSalesTransferSar(data.availableSalesTransferSar);
      }
      if (typeof data.availableOrdersCount === 'number') {
        setAvailableOrdersCount(data.availableOrdersCount);
      }
      setWalletExtTitle('');
      setWalletExtAmount('');
      setWalletPurchaseRef('');
      showToast('تم إتمام عملية الشراء وخصم المبلغ من محفظة المالك بنجاح!');
    } catch {
      showToast('تعذر الاتصال بالخادم لإتمام الشراء.');
    } finally {
      setWalletPurchaseBusy(false);
    }
  };

  const handleAdjustCustomerCoins = async (customerId: string, rawAmount: string) => {
    const parsed = Math.max(0, Math.round(Number(rawAmount)));
    if (Number.isNaN(parsed)) {
      showToast('يرجى إدخال رقم صحيح لرصيد العملات.');
      return;
    }
    setAdjustingCoinId(customerId);
    try {
      const res = await adminFetch(`/api/admin/customers/${customerId}/coins`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ goldenCoins: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'تعذر تحديث رصيد العملات.');
        return;
      }
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? data.customer : c)));
      setCoinDrafts((prev) => ({ ...prev, [customerId]: String(data.customer.goldenCoins ?? 0) }));
      showToast(`تم تحديث رصيد العملات الذهبية للعميل إلى ${data.customer.goldenCoins ?? 0} عملة.`);
    } catch {
      showToast('حدث خطأ أثناء تحديث رصيد العملات.');
    } finally {
      setAdjustingCoinId('');
    }
  };

  const handleTogglePublish = async (product: Product) => {
    const nextPublished = !product.isPublished;
    const res = await adminFetch(`/api/admin/products/${product.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isPublished: nextPublished }),
    });
    if (res.ok) {
      const data = await res.json();
      setProducts((prev) => prev.map((p) => (p.id === product.id ? data.product : p)));
      onStorefrontUpdated();
      showToast(nextPublished ? 'تم نشر المنتج في واجهة المتجر.' : 'تم إخفاء المنتج كمسودة سرية.');
    } else {
      showToast('تعذر تحديث حالة نشر المنتج.');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    const res = await adminFetch(`/api/admin/products/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      onStorefrontUpdated();
      showToast('تم حذف المنتج.');
    } else {
      showToast('تعذر حذف المنتج.');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSavingProduct(true);
    try {
      const parsedSeoKeywords = parseSeoKeywordsText(productSeoKeywordsInput);
      const payloadToSave: Partial<Product> = {
        ...editingProduct,
        seoKeywords: parsedSeoKeywords,
      };
      const isNew = !editingProduct.id;
      const endpoint = isNew
        ? '/api/admin/products'
        : `/api/admin/products/${editingProduct.id}`;
      const res = await adminFetch(endpoint, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadToSave),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'تعذر حفظ المنتج.');
        return;
      }

      const savedProduct = data.product as Product;
      if (isNew) {
        setProducts((prev) => [savedProduct, ...prev]);
      } else {
        setProducts((prev) => prev.map((p) => (p.id === savedProduct.id ? savedProduct : p)));
      }

      let syncedToFirebase = false;
      const activeUser = auth.currentUser || firebaseUser;
      if (activeUser && activeUser.emailVerified) {
        try {
          await saveProductToFirestore(activeUser, savedProduct);
          syncedToFirebase = true;
        } catch (err) {
          console.error('Firebase product save error:', err);
        }
      }

      setEditingProduct(null);
      setProductSeoKeywordsInput('');
      setModalImportUrl('');
      setModalManualText('');
      setShowManualPasteBox(false);
      setImportUrlStatus('');
      setImportUrlWarning('');
      setImportUrlError('');
      onStorefrontUpdated();
      showToast(
        syncedToFirebase
          ? 'تم حفظ المنتج في المتجر وقاعدة بيانات Firebase بنجاح!'
          : 'تم حفظ بيانات المنتج وعرضها في المتجر بنجاح.'
      );
    } catch {
      showToast('حدث خطأ في الاتصال بالخادم أثناء حفظ المنتج.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleScrapeProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = scrapeUrl.trim();
    const cleanName = scrapeProductName.trim();
    if (!cleanUrl && !cleanName) {
      showToast('يرجى إدخال رابط المنتج أو كتابة اسم المنتج لتوليده وحفظه تلقائياً.');
      return;
    }
    setScraping(true);
    setLastScraped(null);
    setScrapeAiGeneratedImg(false);
    try {
      const res = await adminFetch('/api/admin/scrape-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: cleanUrl || undefined,
          productName: cleanName || undefined,
          category: scrapeCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'تعذر سحب أو توليد المنتج.');
        return;
      }
      const saved = data.product as Product;
      setProducts((prev) => [saved, ...prev]);
      setLastScraped(saved);
      setScrapeAiGeneratedImg(Boolean(data.aiGeneratedImage));
      setScrapeUrl('');
      setScrapeProductName('');
      onStorefrontUpdated();
      showToast(
        data.aiGeneratedImage
          ? 'تم إنشاء المنتج وتوليد صورة احترافية (1000×1000) ونشره في المتجر وقسم المنتجات فوراً!'
          : 'تم سحب المنتج وصياغة وصفه العربي ونشره في المتجر وقسم المنتجات فوراً!'
      );
    } catch {
      showToast('حدث خطأ أثناء السحب أو التوليد بالذكاء الاصطناعي.');
    } finally {
      setScraping(false);
    }
  };

  const handleScrapeSimilar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!similarStoreUrl.trim() || !similarHint.trim()) return;
    setScraping(true);
    setSimilarBatch([]);
    try {
      const res = await adminFetch('/api/admin/scrape-similar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storeUrl: similarStoreUrl.trim(),
          targetProductHint: similarHint.trim(),
          profitMarginPercent,
          extraProfitSar,
          category: similarCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'تعذر سحب المنتجات المشابهة.');
        return;
      }
      const list = (data.products || []) as Product[];
      setProducts((prev) => [...list, ...prev]);
      setSimilarBatch(list);
      showToast(
        `تم سحب ${list.length} منتج مشابه مع زيادة الأرباح وحفظها في المسودات السرية.`
      );
    } catch {
      showToast('حدث خطأ أثناء تحليل المتجر وسحب المنتجات المشابهة.');
    } finally {
      setScraping(false);
    }
  };

  const persistSettingsObject = async (nextSettings: StoreSettings, message: string) => {
    setSavingSettings(true);
    try {
      const res = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nextSettings),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setStoreSeoKeywordsInput((data.settings?.seoKeywords || []).slice(0, 15).join('، '));
        onStorefrontUpdated();
        showToast(message);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data?.error || 'تعذر حفظ الإعدادات على الخادم.');
      }
    } catch {
      showToast('حدث خطأ أثناء الاتصال بالخادم لحفظ الإعدادات.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddCategory = async () => {
    if (!settings || !newCategoryName.trim()) return;
    const trimmed = newCategoryName.trim();
    const existing = settings.categories || [];
    if (existing.some((c) => c.name === trimmed)) {
      showToast('يوجد قسم بهذا الاسم مسبقاً.');
      return;
    }
    const added: StoreCategory = {
      id: `cat-${Date.now().toString(36)}`,
      name: trimmed,
      description: newCategoryDesc.trim(),
      isActive: true,
    };
    const nextSettings = { ...settings, categories: [...existing, added] };
    setSettings(nextSettings);
    setNewCategoryName('');
    setNewCategoryDesc('');
    await persistSettingsObject(nextSettings, `تم إضافة وحفظ قسم "${trimmed}" في المتجر.`);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!settings) return;
    const nextSettings = {
      ...settings,
      categories: (settings.categories || []).filter((c) => c.id !== id),
    };
    setSettings(nextSettings);
    await persistSettingsObject(nextSettings, 'تم حذف القسم وحفظ التغييرات.');
  };

  const handleToggleCategory = async (id: string) => {
    if (!settings) return;
    const nextSettings = {
      ...settings,
      categories: (settings.categories || []).map((c) =>
        c.id === id ? { ...c, isActive: !c.isActive } : c
      ),
    };
    setSettings(nextSettings);
    await persistSettingsObject(nextSettings, 'تم تحديث حالة القسم وحفظها.');
  };

  const handleEnhanceStoreWithAi = async () => {
    if (!settings) return;
    setEnhancingStore(true);
    try {
      const res = await adminFetch('/api/admin/ai/enhance-copy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'store',
          storeName: settings.storeName,
          storeTagline: settings.storeTagline,
          heroTitle: settings.heroTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.result) {
        showToast(data.error || 'تعذر تحسين عناوين المتجر.');
        return;
      }
      const r = data.result;
      const existingCats = settings.categories || [];
      const shouldAddCat =
        r.suggestedCategoryName &&
        !existingCats.some((c) => c.name === r.suggestedCategoryName);

      const nextSettings: StoreSettings = {
        ...settings,
        storeName: r.storeName || settings.storeName,
        storeTagline: r.storeTagline || settings.storeTagline,
        heroTitle: r.heroTitle || settings.heroTitle,
        heroSubtitle: r.heroSubtitle || settings.heroSubtitle,
        categories: shouldAddCat
          ? [
              ...existingCats,
              {
                id: `cat-${Date.now().toString(36)}`,
                name: r.suggestedCategoryName,
                description: r.suggestedCategoryDesc || '',
                isActive: true,
              },
            ]
          : existingCats,
      };
      setSettings(nextSettings);
      showToast('تمت صياغة اسم وعناوين متجر جذابة بالذكاء الاصطناعي! اضغط "حفظ" لتثبيتها.');
    } finally {
      setEnhancingStore(false);
    }
  };

  const handleEnhanceProductCopyWithAi = async () => {
    if (!editingProduct) return;
    setEnhancingProductCopy(true);
    try {
      const res = await adminFetch('/api/admin/ai/enhance-copy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'product',
          name: editingProduct.name || 'دبة تلوث',
          category: editingProduct.category || 'دبات تلوث البنزين',
          description: editingProduct.description || '',
          priceSar: editingProduct.priceSar,
        }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        const nextKw =
          Array.isArray(data.result.seoKeywords) && data.result.seoKeywords.length > 0
            ? data.result.seoKeywords.slice(0, 15)
            : editingProduct.seoKeywords;
        if (nextKw) {
          setProductSeoKeywordsInput(nextKw.join('، '));
        }
        setEditingProduct({
          ...editingProduct,
          name: data.result.name || editingProduct.name,
          description: data.result.description || editingProduct.description,
          seoKeywords: nextKw,
          specs:
            Array.isArray(data.result.specs) && data.result.specs.length > 0
              ? data.result.specs
              : editingProduct.specs,
        });
        showToast('تم تحسين اسم ووصف المنتج ليفهمه العميل بوضوح!');
      } else {
        showToast(data.error || 'تعذر تحسين بيانات المنتج.');
      }
    } finally {
      setEnhancingProductCopy(false);
    }
  };

  const handleStudioImageSaved = async (newUrl: string) => {
    if (!studioTarget) return;
    if (studioTarget.fromEditorModal && editingProduct) {
      const rest = (editingProduct.images || []).filter(
        (img) => img && img !== studioTarget.imageUrl
      );
      setEditingProduct({
        ...editingProduct,
        images: [newUrl, ...rest],
      });
      showToast('تم تحديث صورة المنتج بنسخة الاستوديو الجذابة!');
    } else if (studioTarget.productId) {
      const prod = products.find((p) => p.id === studioTarget.productId);
      const rest = (prod?.images || []).filter((img) => img && img !== studioTarget.imageUrl);
      const nextImages = [newUrl, ...rest];
      const res = await adminFetch(`/api/admin/products/${studioTarget.productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ images: nextImages }),
      });
      if (res.ok) {
        const data = await res.json();
        setProducts((prev) =>
          prev.map((p) => (p.id === studioTarget.productId ? data.product : p))
        );
        setSimilarBatch((prev) =>
          prev.map((p) => (p.id === studioTarget.productId ? data.product : p))
        );
        if (lastScraped?.id === studioTarget.productId) setLastScraped(data.product);
        onStorefrontUpdated();
        showToast('تم حفظ الصورة المعدّلة الجذابة في المنتج!');
      }
    }
    setStudioTarget(null);
  };

  const handleRefreshSeo = async () => {
    setRefreshingSeo(true);
    try {
      const res = await adminFetch('/api/admin/seo/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.products) setProducts(data.products);
        onStorefrontUpdated();
        showToast(`تم تحديث SEO و Schema Markup لـ ${data.updatedCount} منتج منشور.`);
      } else {
        showToast(data.error || 'تعذر تحديث السيو.');
      }
    } finally {
      setRefreshingSeo(false);
    }
  };

  const handleGenerateAds = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingAds(true);
    try {
      const res = await adminFetch('/api/admin/ads/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: adsProductId || undefined,
          campaignGoal: adsGoal || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedCampaign(data.campaign);
        showToast('تم توليد الحملة الإعلانية والبنر الترويجي بنجاح.');
      } else {
        showToast(data.error || 'تعذر توليد الإعلان.');
      }
    } finally {
      setGeneratingAds(false);
    }
  };

  const handlePublishGeneratedBanner = async () => {
    if (!generatedCampaign) return;
    try {
      const res = await adminFetch('/api/admin/banners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...generatedCampaign.banner,
          googleAdsHeadlines: generatedCampaign.googleAdsHeadlines,
          googleAdsDescriptions: generatedCampaign.googleAdsDescriptions,
          googleAdsKeywords: generatedCampaign.googleAdsKeywords,
          isActive: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.banner) {
        setBanners((prev) => [data.banner, ...prev]);
        onStorefrontUpdated();
        showToast('تم نشر البنر الترويجي في واجهة المتجر بنجاح.');
      } else {
        showToast(data?.error || 'تعذر نشر البنر الترويجي.');
      }
    } catch {
      showToast('حدث خطأ في الاتصال بالخادم أثناء نشر البنر.');
    }
  };

  const handleToggleBanner = async (banner: PromoBanner) => {
    try {
      const res = await adminFetch(`/api/admin/banners/${banner.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !banner.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.banner) {
        setBanners((prev) => prev.map((b) => (b.id === banner.id ? data.banner : b)));
        onStorefrontUpdated();
        showToast(data.banner.isActive ? 'تم إظهار البنر في المتجر.' : 'تم إخفاء البنر.');
      } else {
        showToast(data?.error || 'تعذر تحديث حالة البنر.');
      }
    } catch {
      showToast('تعذر الاتصال بالخادم لتحديث حالة البنر.');
    }
  };

  const handleDeleteBanner = async (id: string) => {
    try {
      const res = await adminFetch(`/api/admin/banners/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setBanners((prev) => prev.filter((b) => b.id !== id));
        onStorefrontUpdated();
        showToast('تم حذف البنر الترويجي.');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data?.error || 'تعذر حذف البنر الترويجي.');
      }
    } catch {
      showToast('حدث خطأ أثناء الاتصال بالخادم لحذف البنر.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    const syncedSettings: StoreSettings = {
      ...settings,
      seoKeywords: parseSeoKeywordsText(storeSeoKeywordsInput),
    };
    await persistSettingsObject(syncedSettings, 'تم حفظ وتطبيق إعدادات المتجر والثيم بنجاح.');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwNotice('');
    if (newPw.trim().length < 6) {
      showToast('يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل.');
      return;
    }

    try {
      const res = await adminFetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: currentPw || getStoredOwnerPassword(),
          newPassword: newPw.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error || 'كلمة المرور الحالية غير صحيحة.');
        return;
      }
    } catch {
      showToast('تعذر الاتصال بالخادم لتحديث كلمة المرور.');
      return;
    }

    try {
      localStorage.setItem('taj_owner_secret', newPw.trim());
    } catch {
      // ignore
    }

    setCurrentPw('');
    setNewPw('');
    setPwNotice('تم حفظ كلمة المرور الجديدة بنجاح.');
    showToast('تم تحديث كلمة مرور المالك بنجاح.');
  };

  const copyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1800);
  };

  if (!isOwnerAuthenticated) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-[#D4AF37]/35 bg-[#111115] p-6 text-[#F5F2EB] shadow-2xl space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="font-display text-xl font-bold">بوابة المالك السرية</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="w-9 h-9 rounded-lg border border-white/10 bg-[#16161B] flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loginError && (
            <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/30 text-red-200 text-xs">
              {loginError}
            </div>
          )}

          <p className="text-xs text-[#9E988C] leading-relaxed">
            أدخل كلمة المرور الثابتة الخاصة بالمالك للدخول المباشر إلى إدارة المنتجات، الطلبات،
            وإعدادات المتجر. يتم حفظ تسجيل الدخول تلقائياً في المتصفح.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-[#C5BFB2] mb-1.5">كلمة مرور المالك</label>
              <input
                type="password"
                required
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3.5 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="btn-gold-wave w-full h-11 rounded-xl text-sm cursor-pointer"
            >
              {loggingIn ? 'جاري الدخول...' : 'دخول مباشر إلى لوحة التحكم'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalRevenueSar = orders
    .filter((o) => o.status !== 'ملغي')
    .reduce((sum, o) => sum + o.totalSar, 0);
  const pendingOrdersCount = orders.filter((o) => o.status === 'قيد المراجعة').length;
  const unapprovedReviewsCount = reviews.filter((r) => !r.approved).length;
  const totalNotifications = pendingOrdersCount + unapprovedReviewsCount + alerts.length;
  const publishedCount = products.filter((p) => p.isPublished).length;
  const draftsCount = products.filter((p) => !p.isPublished).length;
  const filteredProducts = products.filter((p) => {
    if (productFilter === 'published') return p.isPublished;
    if (productFilter === 'drafts') return !p.isPublished;
    return true;
  });

  const ownerWaNumber = (settings?.ownerPersonalWhatsapp || settings?.whatsappNumber || '').replace(
    /\D/g,
    ''
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#09090B] text-[#F5F2EB] flex flex-col overflow-hidden">
      {/* Top Admin Header */}
      <header className="h-16 px-4 sm:px-6 border-b border-white/10 bg-[#111115] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl border border-[#D4AF37]/40 bg-[#171510] flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-4 h-4 text-[#D4AF37]" />
          </span>
          <div className="min-w-0">
            <div className="font-display text-base sm:text-lg font-bold truncate">
              لوحة تحكم المالك · {settings?.storeName || 'المتجر'}
            </div>
            <div className="text-xs text-[#9E988C] truncate">
              إدارة شاملة للمنتجات، المساعد الشخصي والواتساب، الأشرطة المتحركة، والخلفيات
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 relative">
          {/* Owner Header Notifications Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="إشعارات المالك"
              className="relative w-9 h-9 rounded-lg border border-white/15 bg-[#16161B] hover:border-[#D4AF37]/60 flex items-center justify-center text-[#E5C158] cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {totalNotifications > 0 && (
                <span className="absolute -top-1 -end-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {totalNotifications}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute top-full mt-2 end-0 w-72 sm:w-80 rounded-2xl border border-[#D4AF37]/40 bg-[#141418] p-4 shadow-2xl z-50 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="font-bold text-[#E5C158]">إشعارات المالك ({totalNotifications})</span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-[#9E988C] hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  <div className="p-2.5 rounded-xl bg-[#0D0D10] border border-white/10 flex items-center justify-between">
                    <span>طلبات بانتظار المراجعة</span>
                    <span className="font-bold text-[#E5C158] tabular-nums">{pendingOrdersCount}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#0D0D10] border border-white/10 flex items-center justify-between">
                    <span>تقييمات عملاء جديدة للاعتماد</span>
                    <span className="font-bold text-amber-300 tabular-nums">{unapprovedReviewsCount}</span>
                  </div>
                  {alerts.slice(0, 4).map((al) => (
                    <div
                      key={al.id}
                      className="p-2.5 rounded-xl bg-[#0D0D10] border border-amber-500/25 space-y-0.5"
                    >
                      <div className="font-bold text-[#F5F2EB]">{al.title}</div>
                      <div className="text-[#9E988C] text-[11px]">{al.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAdminLogout}
            className="h-9 px-3.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-[#D4AF37]/40 bg-[#171510] hover:border-[#D4AF37] text-xs font-bold text-[#E5C158] cursor-pointer"
          >
            عرض المتجر
          </button>
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-5 end-5 z-50 px-4 py-3 rounded-xl border border-[#D4AF37]/50 bg-[#171510] text-sm text-[#E5C158] shadow-2xl">
          {toast}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="lg:w-64 border-b lg:border-b-0 lg:border-e border-white/10 bg-[#0D0D10] p-3 flex lg:flex-col gap-1.5 overflow-x-auto shrink-0">
          {[
            { id: 'overview', label: 'الطلبات والعملاء', icon: LayoutDashboard },
            { id: 'wallet', label: 'محفظة المالك والشراء', icon: Wallet },
            {
              id: 'assistant',
              label: `المساعد الذكي والواتساب (${alerts.length})`,
              icon: Bot,
            },
            { id: 'products', label: `المنتجات والمسودات (${products.length})`, icon: Package },
            { id: 'scraper', label: 'أداة السحب السرية AI', icon: Wand2 },
            { id: 'ai-seo', label: 'SEO وإعلانات جوجل AI', icon: Megaphone },
            { id: 'analytics', label: 'تقارير الأداء والأرباح', icon: BarChart3 },
            { id: 'drive', label: 'Google Drive السحابي', icon: Cloud },
            { id: 'settings', label: 'الأشرطة والخلفيات والثيم', icon: Palette },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#D4AF37] text-[#09090B] font-bold'
                    : 'text-[#C5BFB2] hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main Admin Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {loadingData && !settings ? (
            <div className="py-16 text-center text-sm text-[#9E988C]">جاري تحميل البيانات...</div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW, ORDERS & CUSTOMERS */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Site Open / Close Instant Switch Banner */}
                  {settings && (
                    <div
                      className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                        settings.storeOpen !== false
                          ? 'border-emerald-500/35 bg-emerald-950/20'
                          : 'border-amber-500/45 bg-amber-950/25'
                      }`}
                    >
                      <div className="space-y-0.5 text-xs sm:text-sm">
                        <div className="font-bold text-[#F5F2EB]">
                          حالة المتجر للزوار:{' '}
                          <span
                            className={
                              settings.storeOpen !== false ? 'text-emerald-300' : 'text-amber-300'
                            }
                          >
                            {settings.storeOpen !== false
                              ? 'مفتوح ويستقبل الطلبات'
                              : 'مغلق مؤقتاً (وضع الصيانة)'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#9E988C]">
                          تحكم بفتح أو إغلاق الموقع للزوار بضغطة زر مع إمكانية دخولك دائماً كمالك.
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={savingSettings}
                        onClick={() => {
                          const nextOpen = settings.storeOpen === false;
                          const nextSettings = { ...settings, storeOpen: nextOpen };
                          setSettings(nextSettings);
                          persistSettingsObject(
                            nextSettings,
                            nextOpen
                              ? 'تم فتح المتجر للزوار بنجاح.'
                              : 'تم إغلاق المتجر مؤقتاً للزوار.'
                          );
                        }}
                        className={`h-10 px-5 rounded-xl text-xs font-bold cursor-pointer ${
                          settings.storeOpen !== false
                            ? 'bg-red-600/85 hover:bg-red-600 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {settings.storeOpen !== false ? 'إغلاق الموقع مؤقتاً' : 'فتح الموقع للعملاء'}
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl border border-white/10 bg-[#121216]">
                      <div className="text-xs text-[#9E988C]">إجمالي المبيعات</div>
                      <div className="text-2xl font-bold text-[#E5C158] mt-1 tabular-nums">
                        {totalRevenueSar.toLocaleString('ar-SA')} ر.س
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/10 bg-[#121216]">
                      <div className="text-xs text-[#9E988C]">إجمالي الطلبات</div>
                      <div className="text-2xl font-bold text-[#F5F2EB] mt-1 tabular-nums">
                        {orders.length}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/10 bg-[#121216]">
                      <div className="text-xs text-[#9E988C]">العملاء المسجلون</div>
                      <div className="text-2xl font-bold text-[#F5F2EB] mt-1 tabular-nums">
                        {customers.length}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/10 bg-[#121216]">
                      <div className="text-xs text-[#9E988C]">منشور / مسودات سرية</div>
                      <div className="text-2xl font-bold text-[#F5F2EB] mt-1 tabular-nums">
                        {publishedCount} / <span className="text-amber-400">{draftsCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Owner-Only Visitor Count & Search Queries Analytics */}
                  <section className="rounded-2xl border border-[#D4AF37]/30 bg-[#121216] p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2 text-[#E5C158]">
                        <Users className="w-5 h-5" />
                        <div>
                          <h3 className="font-bold text-base">
                            إحصائيات الزوار والكلمات التي بحث عنها العملاء
                          </h3>
                          <p className="text-xs text-[#9E988C]">
                            بيانات سرية تظهر للمالك فقط لمعرفة حجم الزيارات وما يبحث عنه الزوار
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => fetchDashboard()}
                        className="h-8 px-3 rounded-lg border border-white/15 bg-[#16161B] hover:border-[#D4AF37]/50 text-xs text-[#E5C158] flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>تحديث الإحصائيات</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl border border-[#D4AF37]/25 bg-[#171510]">
                        <div className="text-xs text-[#C5BFB2]">عدد الزوار (الزيارات الكلية)</div>
                        <div className="text-2xl font-bold text-[#E5C158] mt-1 tabular-nums">
                          {(analytics?.totalVisits ?? 0).toLocaleString('ar-SA')}
                        </div>
                      </div>
                      <div className="p-4 rounded-xl border border-white/10 bg-[#0D0D10]">
                        <div className="text-xs text-[#9E988C]">الزوار الفريدون</div>
                        <div className="text-2xl font-bold text-[#F5F2EB] mt-1 tabular-nums">
                          {(analytics?.uniqueVisitors ?? 0).toLocaleString('ar-SA')}
                        </div>
                      </div>
                      <div className="p-4 rounded-xl border border-white/10 bg-[#0D0D10]">
                        <div className="text-xs text-[#9E988C]">كلمات بحث مختلفة مسجلة</div>
                        <div className="text-2xl font-bold text-[#F5F2EB] mt-1 tabular-nums">
                          {(analytics?.searchQueries.length ?? 0).toLocaleString('ar-SA')}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#C5BFB2]">
                        <Search className="w-3.5 h-3.5 text-[#E5C158]" />
                        <span>الكلمات التي بحث عنها الزوار في شريط البحث</span>
                      </div>

                      {!analytics || analytics.searchQueries.length === 0 ? (
                        <div className="p-5 rounded-xl border border-white/10 bg-[#0D0D10] text-center text-xs text-[#9E988C]">
                          لم يسجل الزوار عمليات بحث بعد. ستظهر الكلمات هنا تلقائياً فور استخدام
                          شريط البحث في المتجر.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0D0D10]">
                          <table className="w-full text-right text-xs">
                            <thead className="border-b border-white/10 text-[#9E988C]">
                              <tr>
                                <th className="px-4 py-2.5">كلمة البحث</th>
                                <th className="px-4 py-2.5">عدد مرات البحث</th>
                                <th className="px-4 py-2.5">آخر بحث</th>
                                <th className="px-4 py-2.5">استغلال في الإعلانات</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                              {analytics.searchQueries.slice(0, 20).map((entry) => (
                                <tr key={entry.term} className="hover:bg-white/[0.02]">
                                  <td className="px-4 py-2.5 font-bold text-[#F5F2EB]">
                                    {entry.term}
                                  </td>
                                  <td className="px-4 py-2.5 font-bold text-[#E5C158] tabular-nums">
                                    {entry.count.toLocaleString('ar-SA')}
                                  </td>
                                  <td className="px-4 py-2.5 text-[#9E988C]">
                                    {new Date(entry.lastSearchedAt).toLocaleString('ar-SA')}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAdsGoal(`استهداف الباحثين عن: ${entry.term}`);
                                        setActiveTab('ai-seo');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-[11px] text-[#E5C158] cursor-pointer"
                                    >
                                      إنشاء حملة جوجل لها
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Orders Table */}
                  <section className="rounded-2xl border border-white/10 bg-[#121216] overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                      <h3 className="font-bold text-base">سجل الطلبات</h3>
                    </div>
                    {orders.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#9E988C]">
                        لا توجد طلبات مسجلة حتى الآن.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs sm:text-sm">
                          <thead className="bg-[#0D0D10] text-[#9E988C] border-b border-white/10">
                            <tr>
                              <th className="px-4 py-3">رقم الطلب</th>
                              <th className="px-4 py-3">العميل</th>
                              <th className="px-4 py-3">العنوان الوطني والتفاصيل</th>
                              <th className="px-4 py-3">الشحن وإشعارات البوليصة</th>
                              <th className="px-4 py-3">طريقة الدفع</th>
                              <th className="px-4 py-3">الإجمالي</th>
                              <th className="px-4 py-3">الحالة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10">
                            {orders.map((order) => {
                              const cleanCustomerDigits = order.customerPhone.replace(/\D/g, '');
                              const waPhone =
                                cleanCustomerDigits.startsWith('05') &&
                                cleanCustomerDigits.length === 10
                                  ? `966${cleanCustomerDigits.slice(1)}`
                                  : cleanCustomerDigits;
                              const notifyText = encodeURIComponent(
                                `مرحباً ${order.customerName}، إشعار شحن لطلبك رقم ${order.id} من ${
                                  settings?.storeName || 'المتجر'
                                }:\nشركة الشحن: ${order.shippingCompany || 'زاجل / سبل'}\n${
                                  order.trackingNumber
                                    ? `رقم التتبع / البوليصة: ${order.trackingNumber}\n`
                                    : ''
                                }${
                                  order.nationalAddress
                                    ? `العنوان الوطني: ${order.nationalAddress}\n`
                                    : ''
                                }${order.shippingNotice || 'تم تسليم شحنتك لشركة الشحن بنجاح.'}`
                              );

                              return (
                                <tr key={order.id} className="hover:bg-white/[0.02] align-top">
                                  <td className="px-4 py-3 font-bold text-[#E5C158] tabular-nums">
                                    {order.id}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="font-medium">{order.customerName}</div>
                                    <div className="text-xs text-[#9E988C]" dir="ltr">
                                      {order.customerPhone}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-[#C5BFB2] max-w-xs space-y-1">
                                    {order.nationalAddress && (
                                      <div className="text-[#E5C158] font-semibold">
                                        العنوان الوطني: {order.nationalAddress}
                                      </div>
                                    )}
                                    <div>{order.customerAddress}</div>
                                  </td>
                                  <td className="px-4 py-3 text-xs space-y-1.5 min-w-[230px]">
                                    <select
                                      value={order.shippingCompany || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setOrders((prev) =>
                                          prev.map((o) =>
                                            o.id === order.id ? { ...o, shippingCompany: val } : o
                                          )
                                        );
                                      }}
                                      className="w-full h-8 px-2 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                                    >
                                      <option value="">اختر شركة الشحن...</option>
                                      {(settings?.shippingCarriers || [
                                        'زاجل (Zajil)',
                                        'سبل - البريد السعودي (SPL)',
                                        'أرامكس (Aramex)',
                                        'سمسا إكسبرس (SMSA)',
                                        'DHL إكسبرس',
                                        'ريدبوكس (RedBox)',
                                        'J&T إكسبرس',
                                      ]).map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      value={order.trackingNumber || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setOrders((prev) =>
                                          prev.map((o) =>
                                            o.id === order.id ? { ...o, trackingNumber: val } : o
                                          )
                                        );
                                      }}
                                      placeholder="رقم التتبع / البوليصة"
                                      className="w-full h-8 px-2 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                                    />
                                    <input
                                      type="text"
                                      value={order.shippingNotice || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setOrders((prev) =>
                                          prev.map((o) =>
                                            o.id === order.id ? { ...o, shippingNotice: val } : o
                                          )
                                        );
                                      }}
                                      placeholder="رسالة إشعار الشحن للعميل"
                                      className="w-full h-8 px-2 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                                    />
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOrderUpdate(order.id, {
                                            shippingCompany: order.shippingCompany || '',
                                            trackingNumber: order.trackingNumber || '',
                                            shippingNotice: order.shippingNotice || '',
                                          })
                                        }
                                        className="h-7 px-2.5 rounded-md bg-[#D4AF37] text-[#09090B] text-[11px] font-bold cursor-pointer"
                                      >
                                        حفظ الشحن
                                      </button>
                                      {waPhone && (
                                        <a
                                          href={`https://wa.me/${waPhone}?text=${notifyText}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="h-7 px-2.5 rounded-md border border-emerald-500/40 bg-emerald-950/35 text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1"
                                        >
                                          <MessageCircle className="w-3 h-3" />
                                          <span>إشعار العميل</span>
                                        </a>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-xs space-y-1">
                                    <div className="font-semibold text-[#F5F2EB]">
                                      {order.paymentMethod === 'paypal'
                                        ? 'PayPal'
                                        : order.paymentMethod === 'bank_transfer'
                                          ? 'تحويل بنكي'
                                          : order.paymentMethod === 'owner_wallet'
                                            ? 'محفظة المالك'
                                            : 'واتساب'}
                                    </div>
                                    {order.bankTransferRef && (
                                      <div className="text-[11px] text-[#E5C158]">
                                        {order.bankTransferRef}
                                      </div>
                                    )}
                                    {order.paypalTransactionId && (
                                      <div className="text-[11px] text-sky-300 tabular-nums" dir="ltr">
                                        {order.paypalTransactionId}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-bold tabular-nums">
                                    {order.totalSar.toLocaleString('ar-SA')} ر.س
                                  </td>
                                  <td className="px-4 py-3">
                                    <select
                                      value={order.status}
                                      onChange={(e) =>
                                        handleOrderUpdate(order.id, {
                                          status: e.target.value as OrderStatus,
                                        })
                                      }
                                      className="h-8 px-2 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                                    >
                                      <option value="قيد المراجعة">قيد المراجعة</option>
                                      <option value="تم التأكيد">تم التأكيد</option>
                                      <option value="مكتمل">مكتمل</option>
                                      <option value="ملغي">ملغي</option>
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* Registered Customers Table */}
                  <section className="rounded-2xl border border-white/10 bg-[#121216] overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/10">
                      <h3 className="font-bold text-base">العملاء المسجلون</h3>
                    </div>
                    {customers.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#9E988C]">
                        لم يقم أي عميل بالتسجيل حتى الآن.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs sm:text-sm">
                          <thead className="bg-[#0D0D10] text-[#9E988C] border-b border-white/10">
                            <tr>
                              <th className="px-4 py-3">الاسم</th>
                              <th className="px-4 py-3">الجوال</th>
                              <th className="px-4 py-3">العنوان الوطني</th>
                              <th className="px-4 py-3">العنوان التفصيلي المحفوظ</th>
                              <th className="px-4 py-3">العملات الذهبية (تعديل الرصيد)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10">
                            {customers.map((c) => {
                              const currentCoins = c.goldenCoins ?? 0;
                              const draftValue =
                                coinDrafts[c.id] !== undefined
                                  ? coinDrafts[c.id]
                                  : String(currentCoins);
                              return (
                                <tr key={c.id}>
                                  <td className="px-4 py-3 font-medium">{c.name}</td>
                                  <td className="px-4 py-3 tabular-nums" dir="ltr">
                                    {c.phone}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-[#E5C158]">
                                    {c.nationalAddress || '—'}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-[#C5BFB2]">{c.address}</td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2 min-w-[200px]">
                                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#E5C158] shrink-0">
                                        <Coins className="w-3.5 h-3.5" />
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        value={draftValue}
                                        onChange={(e) =>
                                          setCoinDrafts((prev) => ({
                                            ...prev,
                                            [c.id]: e.target.value,
                                          }))
                                        }
                                        className="w-24 h-8 px-2.5 rounded-lg bg-[#16161B] border border-[#D4AF37]/35 text-xs text-[#F5F2EB] tabular-nums"
                                      />
                                      <button
                                        type="button"
                                        disabled={adjustingCoinId === c.id}
                                        onClick={() =>
                                          handleAdjustCustomerCoins(c.id, draftValue)
                                        }
                                        className="h-8 px-3 rounded-lg bg-[#D4AF37] text-[#09090B] text-[11px] font-bold hover:brightness-110 disabled:opacity-50 cursor-pointer shrink-0"
                                      >
                                        {adjustingCoinId === c.id ? 'جاري...' : 'تحديث الرصيد'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* Customer Reviews Moderation */}
                  <section className="rounded-2xl border border-white/10 bg-[#121216] overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-[#E5C158] fill-[#E5C158]" />
                        <h3 className="font-bold text-base">
                          تقييمات ومراجعات العملاء ({reviews.length})
                        </h3>
                      </div>
                      {unapprovedReviewsCount > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-950/50 border border-amber-500/40 text-xs text-amber-300 font-bold">
                          {unapprovedReviewsCount} بانتظار الاعتماد
                        </span>
                      )}
                    </div>
                    {reviews.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#9E988C]">
                        لا توجد تقييمات مرسلة من العملاء حتى الآن.
                      </div>
                    ) : (
                      <div className="divide-y divide-white/10">
                        {reviews.map((rev) => {
                          const prod = products.find((p) => p.id === rev.productId);
                          return (
                            <div
                              key={rev.id}
                              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-[#F5F2EB]">{rev.customerName}</span>
                                  <span className="text-amber-400 font-bold">
                                    {'★'.repeat(rev.rating)}
                                  </span>
                                  <span className="text-[#9E988C]">
                                    على: {prod?.name || rev.productId}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-md font-bold ${
                                      rev.approved
                                        ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/30'
                                        : 'bg-amber-950/50 text-amber-300 border border-amber-500/30'
                                    }`}
                                  >
                                    {rev.approved ? 'منشور للعملاء' : 'بانتظار الاعتماد'}
                                  </span>
                                </div>
                                <p className="text-[#C5BFB2]">{rev.comment}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleApproveReview(rev.id, !rev.approved)}
                                  className={`h-8 px-3 rounded-lg font-bold flex items-center gap-1 cursor-pointer ${
                                    rev.approved
                                      ? 'border border-amber-500/40 text-amber-300 bg-amber-950/30'
                                      : 'bg-emerald-600 text-white'
                                  }`}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{rev.approved ? 'إخفاء' : 'اعتماد ونشر'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReview(rev.id)}
                                  className="h-8 px-2.5 rounded-lg border border-white/10 text-red-400 hover:bg-red-950/30 cursor-pointer"
                                  aria-label="حذف التقييم"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* TAB 1.5: OWNER WALLET & PURCHASING */}
              {activeTab === 'wallet' &&
                (() => {
                  const walletBalance = ownerWallet?.balanceSar ?? 0;
                  const walletDeposited = ownerWallet?.totalDepositedSar ?? 0;
                  const walletSpent = ownerWallet?.totalSpentSar ?? 0;
                  const sarToUsd = settings?.sarToUsdRate || 0.2667;
                  const walletUsd = Number((walletBalance * sarToUsd).toFixed(2));
                  const selectedProd =
                    products.find((p) => p.id === walletSelectedProductId) || products[0];
                  const selectedUnitPrice = selectedProd
                    ? walletPriceBasis === 'cost' &&
                      typeof selectedProd.costPriceSar === 'number' &&
                      selectedProd.costPriceSar > 0
                      ? selectedProd.costPriceSar
                      : walletPriceBasis === 'wholesale' &&
                          typeof selectedProd.wholesalePriceSar === 'number' &&
                          selectedProd.wholesalePriceSar > 0
                        ? selectedProd.wholesalePriceSar
                        : selectedProd.priceSar
                    : 0;
                  const estimatedProductTotal = Number(
                    (selectedUnitPrice * Math.max(1, walletPurchaseQty)).toFixed(2)
                  );
                  const activePurchaseTotal =
                    walletPurchaseMode === 'product'
                      ? estimatedProductTotal
                      : Math.max(0, Number(walletExtAmount) || 0);
                  const insufficientWallet = activePurchaseTotal > walletBalance;
                  const walletTxs = (ownerWallet?.transactions || []).filter((tx) => {
                    if (walletTxFilter === 'in') return tx.amountSar >= 0;
                    if (walletTxFilter === 'out') return tx.amountSar < 0;
                    return true;
                  });
                  const rawPaypalUrl = (settings?.paypalMeUrl || '').trim();
                  const paypalDirectHref = rawPaypalUrl
                    ? rawPaypalUrl.startsWith('http')
                      ? rawPaypalUrl
                      : `https://${rawPaypalUrl}`
                    : 'https://www.paypal.com/sa/home';

                  return (
                    <div className="max-w-6xl space-y-6">
                      {/* Top Hero Wallet Balance Card + PayPal SA Hub */}
                      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                        <div className="xl:col-span-8 p-6 rounded-2xl border border-[#D4AF37]/50 bg-gradient-to-br from-[#1C160A] via-[#12110E] to-[#0B0B0E] space-y-5 shadow-xl">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5">
                              <div className="w-14 h-14 rounded-2xl border border-[#D4AF37]/60 bg-[#D4AF37]/15 flex items-center justify-center shrink-0">
                                <Wallet className="w-7 h-7 text-[#F5E1A4]" />
                              </div>
                              <div>
                                <div className="text-xs text-[#C5BFB2]">
                                  رصيد محفظة المالك المتاح للشراء
                                </div>
                                <div className="text-3xl sm:text-4xl font-bold text-[#F5E1A4] tabular-nums mt-0.5">
                                  {walletBalance.toLocaleString('ar-SA')} ر.س
                                </div>
                                <div className="text-xs text-sky-300 tabular-nums mt-0.5">
                                  يعادل تقريباً ${walletUsd.toLocaleString('en-US')} USD
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => fetchDashboard()}
                              className="h-9 px-3.5 rounded-xl border border-white/15 bg-[#16161B] hover:border-[#D4AF37]/50 text-xs text-[#E5C158] flex items-center gap-1.5 cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>تحديث المحفظة</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
                            <div className="p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-950/15">
                              <div className="text-[11px] text-emerald-200/80">
                                إجمالي الإيداعات والترحيل
                              </div>
                              <div className="text-lg font-bold text-emerald-300 tabular-nums mt-0.5">
                                +{walletDeposited.toLocaleString('ar-SA')} ر.س
                              </div>
                            </div>
                            <div className="p-3.5 rounded-xl border border-amber-500/25 bg-amber-950/15">
                              <div className="text-[11px] text-amber-200/80">
                                إجمالي المشتريات والمدفوعات
                              </div>
                              <div className="text-lg font-bold text-amber-300 tabular-nums mt-0.5">
                                -{walletSpent.toLocaleString('ar-SA')} ر.س
                              </div>
                            </div>
                            <div className="p-3.5 rounded-xl border border-[#D4AF37]/30 bg-[#171510]">
                              <div className="text-[11px] text-[#C5BFB2]">
                                مبيعات متاحة للترحيل للمحفظة
                              </div>
                              <div className="text-lg font-bold text-[#E5C158] tabular-nums mt-0.5">
                                {availableSalesTransferSar.toLocaleString('ar-SA')} ر.س
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* PayPal SA Direct Purchasing & Funding Integration Card */}
                        <div className="xl:col-span-4 p-5 rounded-2xl border border-[#0070BA]/45 bg-gradient-to-b from-[#0A1829] to-[#0D1117] flex flex-col justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-sm font-bold text-sky-200">
                                <CreditCard className="w-4 h-4 text-[#38BDF8]" />
                                <span>بوابة PayPal السعودية</span>
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-400/30 text-[10px] font-bold text-sky-200">
                                متصل بالمحفظة
                              </span>
                            </div>
                            <p className="text-xs text-sky-100/80 leading-relaxed">
                              افتح حسابك على PayPal السعودية لإدارة البطاقات، استلام أرباح PayPal، أو تنفيذ مشترياتك الإلكترونية مباشرة وتسجيلها في سجل المحفظة.
                            </p>
                            {settings?.paypalBusinessEmail && (
                              <div className="text-[11px] text-sky-300/90 truncate" dir="ltr">
                                {settings.paypalBusinessEmail}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <a
                              href="https://www.paypal.com/sa/home"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full h-10 px-4 rounded-xl bg-[#0070BA] hover:bg-[#005EA6] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                              <span>فتح PayPal السعودية (paypal.com/sa)</span>
                            </a>
                            <a
                              href={paypalDirectHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full h-9 px-3 rounded-xl border border-sky-400/35 bg-sky-950/35 hover:bg-sky-900/40 text-sky-200 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>فتح رابط PayPal.me الخاص بالمتجر</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Funding Section: Deposit + Transfer Sales Revenue */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Deposit Funds to Owner Wallet */}
                        <form
                          onSubmit={handleWalletDeposit}
                          className="p-5 rounded-2xl border border-white/10 bg-[#121216] space-y-4"
                        >
                          <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                            <ArrowDownToLine className="w-4 h-4" />
                            <span>تغذية وإيداع رصيد في محفظة المالك</span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {[500, 1000, 2500, 5000, 10000].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setWalletDepositAmount(String(preset))}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-bold tabular-nums cursor-pointer ${
                                  Number(walletDepositAmount) === preset
                                    ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                                    : 'border-white/15 bg-[#16161B] text-[#E5C158] hover:border-[#D4AF37]/50'
                                }`}
                              >
                                +{preset.toLocaleString('ar-SA')} ر.س
                              </button>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-[#C5BFB2] mb-1">
                                مبلغ الإيداع (SAR)
                              </label>
                              <input
                                type="number"
                                min={1}
                                step="any"
                                required
                                value={walletDepositAmount}
                                onChange={(e) => setWalletDepositAmount(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm tabular-nums focus:outline-none focus:border-[#D4AF37]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-[#C5BFB2] mb-1">
                                المصدر أو الملاحظة (اختياري)
                              </label>
                              <input
                                type="text"
                                value={walletDepositNote}
                                onChange={(e) => setWalletDepositNote(e.target.value)}
                                placeholder="مثال: رصيد PayPal / تغذية بنكية"
                                className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={walletDepositBusy}
                            className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <Plus className="w-4 h-4" />
                            <span>{walletDepositBusy ? 'جاري الإيداع...' : 'إيداع الرصيد في المحفظة'}</span>
                          </button>
                        </form>

                        {/* Transfer Store Sales Revenue */}
                        <div className="p-5 rounded-2xl border border-[#D4AF37]/30 bg-[#121216] flex flex-col justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                              <Coins className="w-4 h-4" />
                              <span>ترحيل إيرادات مبيعات المتجر إلى المحفظة</span>
                            </div>
                            <p className="text-xs text-[#C5BFB2] leading-relaxed">
                              اسحب صافي قيمة الطلبات المؤكدة وغير الملغاة مباشرة إلى رصيد محفظة المالك لتستخدمه في إعادة شراء البضائع أو دفع الموردين دون احتساب أي طلب مرتين.
                            </p>
                          </div>

                          <div className="p-3.5 rounded-xl border border-[#D4AF37]/25 bg-[#171510] flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[11px] text-[#9E988C]">
                                الطلبات المتاحة للترحيل ({availableOrdersCount} طلب)
                              </div>
                              <div className="text-xl font-bold text-[#F5E1A4] tabular-nums">
                                {availableSalesTransferSar.toLocaleString('ar-SA')} ر.س
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={walletTransferBusy || availableSalesTransferSar <= 0}
                              onClick={handleWalletTransferSales}
                              className="btn-gold-wave h-10 px-4 rounded-xl text-xs font-bold shrink-0 cursor-pointer disabled:opacity-45"
                            >
                              {walletTransferBusy ? 'جاري الترحيل...' : 'ترحيل للمحفظة الآن'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Purchase Action Studio + Transaction Ledger */}
                      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                        {/* Left: Make Purchase with Owner Wallet */}
                        <form
                          onSubmit={handleWalletPurchase}
                          className="xl:col-span-5 p-5 rounded-2xl border border-[#D4AF37]/35 bg-[#121216] space-y-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-bold text-[#F5E1A4]">
                              <ShoppingBag className="w-4 h-4 text-[#D4AF37]" />
                              <span>إجراء عملية شراء من محفظة المالك</span>
                            </div>
                          </div>

                          {/* Purchase Mode Toggle */}
                          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#16161B] border border-white/10">
                            <button
                              type="button"
                              onClick={() => setWalletPurchaseMode('product')}
                              className={`h-9 rounded-lg text-xs font-bold cursor-pointer ${
                                walletPurchaseMode === 'product'
                                  ? 'bg-[#D4AF37] text-[#09090B]'
                                  : 'text-[#C5BFB2] hover:text-white'
                              }`}
                            >
                              شراء منتج من المتجر
                            </button>
                            <button
                              type="button"
                              onClick={() => setWalletPurchaseMode('external')}
                              className={`h-9 rounded-lg text-xs font-bold cursor-pointer ${
                                walletPurchaseMode === 'external'
                                  ? 'bg-[#D4AF37] text-[#09090B]'
                                  : 'text-[#C5BFB2] hover:text-white'
                              }`}
                            >
                              شراء خارجي / PayPal / مورد
                            </button>
                          </div>

                          {walletPurchaseMode === 'product' ? (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs text-[#C5BFB2] mb-1">
                                  اختر المنتج المراد شراؤه
                                </label>
                                <select
                                  value={selectedProd?.id || ''}
                                  onChange={(e) => setWalletSelectedProductId(e.target.value)}
                                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs focus:outline-none focus:border-[#D4AF37]"
                                >
                                  {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} ({p.priceSar} ر.س)
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-[#C5BFB2] mb-1">الكمية</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    value={walletPurchaseQty}
                                    onChange={(e) =>
                                      setWalletPurchaseQty(
                                        Math.max(1, Number(e.target.value) || 1)
                                      )
                                    }
                                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm tabular-nums"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-[#C5BFB2] mb-1">
                                    تسعيرة الشراء
                                  </label>
                                  <select
                                    value={walletPriceBasis}
                                    onChange={(e) =>
                                      setWalletPriceBasis(
                                        e.target.value as 'cost' | 'wholesale' | 'retail'
                                      )
                                    }
                                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                                  >
                                    <option value="wholesale">سعر الجملة</option>
                                    <option value="cost">سعر التكلفة</option>
                                    <option value="retail">سعر البيع العادي</option>
                                  </select>
                                </div>
                              </div>

                              <label className="flex items-center gap-2 text-xs text-[#C5BFB2] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={walletRecordOrder}
                                  onChange={(e) => setWalletRecordOrder(e.target.checked)}
                                />
                                <span>إصدار فاتورة طلب مؤكدة في جدول الطلبات</span>
                              </label>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs text-[#C5BFB2] mb-1">
                                  فئة الشراء / المصروف
                                </label>
                                <select
                                  value={walletExtCategory}
                                  onChange={(e) => setWalletExtCategory(e.target.value)}
                                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                                >
                                  <option value="توريد بضاعة ومخزون">توريد بضاعة ومخزون</option>
                                  <option value="شراء عبر PayPal">شراء عبر PayPal</option>
                                  <option value="دفع لمورد أو مصنع">دفع لمورد أو مصنع</option>
                                  <option value="تسويق وإعلانات جوجل">تسويق وإعلانات جوجل</option>
                                  <option value="شحن ولوجستيات">شحن ولوجستيات</option>
                                  <option value="مصاريف تشغيل">مصاريف تشغيل</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs text-[#C5BFB2] mb-1">
                                  وصف المشتريات أو اسم المورد
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={walletExtTitle}
                                  onChange={(e) => setWalletExtTitle(e.target.value)}
                                  placeholder="مثال: شراء 10 دبات تلوث يورو 6 من المورد / دفع PayPal"
                                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs focus:outline-none focus:border-[#D4AF37]"
                                />
                              </div>

                              <div>
                                <label className="block text-xs text-[#C5BFB2] mb-1">
                                  المبلغ بالريال السعودي (SAR)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  step="any"
                                  required
                                  value={walletExtAmount}
                                  onChange={(e) => setWalletExtAmount(e.target.value)}
                                  placeholder="مثال: 750"
                                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm tabular-nums focus:outline-none focus:border-[#D4AF37]"
                                />
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              مرجع الفاتورة أو رقم عملية PayPal (اختياري)
                            </label>
                            <input
                              type="text"
                              value={walletPurchaseRef}
                              onChange={(e) => setWalletPurchaseRef(e.target.value)}
                              placeholder="مثال: INV-402 أو رقم معاملة PayPal"
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs focus:outline-none focus:border-[#D4AF37]"
                            />
                          </div>

                          <div className="p-3 rounded-xl border border-white/10 bg-[#0D0D10] space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[#9E988C]">إجمالي قيمة الشراء:</span>
                              <span className="font-bold text-[#F5E1A4] tabular-nums">
                                {activePurchaseTotal.toLocaleString('ar-SA')} ر.س
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#9E988C]">الرصيد المتبقي بعد الشراء:</span>
                              <span
                                className={`font-bold tabular-nums ${
                                  insufficientWallet ? 'text-red-400' : 'text-emerald-300'
                                }`}
                              >
                                {insufficientWallet
                                  ? `رصيد غير كافٍ (ينقص ${(activePurchaseTotal - walletBalance).toLocaleString('ar-SA')} ر.س)`
                                  : `${Number((walletBalance - activePurchaseTotal).toFixed(2)).toLocaleString('ar-SA')} ر.س`}
                              </span>
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={
                              walletPurchaseBusy ||
                              activePurchaseTotal <= 0 ||
                              insufficientWallet
                            }
                            className="btn-gold-wave w-full h-11 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                            <span>
                              {walletPurchaseBusy
                                ? 'جاري تنفيذ الشراء...'
                                : `إتمام الشراء وخصم ${activePurchaseTotal.toLocaleString('ar-SA')} ر.س`}
                            </span>
                          </button>
                        </form>

                        {/* Right: Wallet Transaction Ledger */}
                        <div className="xl:col-span-7 p-5 rounded-2xl border border-white/10 bg-[#121216] space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="font-bold text-base text-[#F5E1A4]">
                                سجل عمليات محفظة المالك ({walletTxs.length})
                              </h3>
                              <p className="text-xs text-[#9E988C]">
                                سجل فوري لكل عملية إيداع، ترحيل مبيعات، أو شراء عبر المحفظة
                              </p>
                            </div>
                            <div className="flex gap-1.5">
                              {[
                                { id: 'all', label: 'الكل' },
                                { id: 'in', label: 'الإيداعات (+)' },
                                { id: 'out', label: 'المشتريات (-)' },
                              ].map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() =>
                                    setWalletTxFilter(f.id as 'all' | 'in' | 'out')
                                  }
                                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                                    walletTxFilter === f.id
                                      ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                                      : 'border-white/15 bg-[#16161B] text-[#C5BFB2]'
                                  }`}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {walletTxs.length === 0 ? (
                            <div className="py-12 text-center text-xs text-[#9E988C] border border-dashed border-white/10 rounded-xl">
                              لا توجد عمليات في محفظة المالك حتى الآن. يمكنك إيداع رصيد أو ترحيل مبيعات المتجر للبدء بالشراء.
                            </div>
                          ) : (
                            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pe-1">
                              {walletTxs.map((tx) => {
                                const isPositive = tx.amountSar >= 0;
                                return (
                                  <div
                                    key={tx.id}
                                    className="p-3.5 rounded-xl border border-white/10 bg-[#0D0D10] flex flex-wrap items-center justify-between gap-3"
                                  >
                                    <div className="min-w-0 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            tx.type === 'deposit'
                                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                                              : tx.type === 'sales_transfer'
                                                ? 'bg-[#2A220F] text-[#F5E1A4] border border-[#D4AF37]/30'
                                                : 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
                                          }`}
                                        >
                                          {tx.type === 'deposit'
                                            ? 'إيداع'
                                            : tx.type === 'sales_transfer'
                                              ? 'ترحيل مبيعات'
                                              : 'شراء من المحفظة'}
                                        </span>
                                        <span className="font-bold text-xs text-[#F5F2EB]">
                                          {tx.title}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#9E988C]">
                                        {tx.category && <span>{tx.category}</span>}
                                        {tx.orderId && (
                                          <span className="text-[#E5C158] tabular-nums" dir="ltr">
                                            · {tx.orderId}
                                          </span>
                                        )}
                                        {tx.reference && <span>· مرجع: {tx.reference}</span>}
                                        <span>
                                          · {new Date(tx.createdAt).toLocaleString('ar-SA')}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="text-end shrink-0">
                                      <div
                                        dir="ltr"
                                        className={`text-sm font-bold tabular-nums ${
                                          isPositive ? 'text-emerald-300' : 'text-amber-300'
                                        }`}
                                      >
                                        {isPositive
                                          ? `+${tx.amountSar.toLocaleString('ar-SA')}`
                                          : tx.amountSar.toLocaleString('ar-SA')}{' '}
                                        ر.س
                                      </div>
                                      <div className="text-[10px] text-[#9E988C] tabular-nums">
                                        الرصيد بعد العملية:{' '}
                                        {tx.balanceAfterSar.toLocaleString('ar-SA')} ر.س
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {/* TAB 2: OWNER PERSONAL AI ASSISTANT & WHATSAPP ALERTS */}
              {activeTab === 'assistant' && settings && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  {/* Left: Interactive AI Chat Assistant */}
                  <div className="xl:col-span-7 flex flex-col rounded-2xl border border-[#D4AF37]/30 bg-[#121216] overflow-hidden h-[620px]">
                    <div className="px-5 py-4 border-b border-white/10 bg-[#14120E] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Bot className="w-5 h-5 text-[#E5C158]" />
                        <div>
                          <div className="font-bold text-sm text-[#F5F2EB]">
                            المساعد الشخصي الذكي للمالك
                          </div>
                          <div className="text-xs text-[#9E988C]">
                            يضيف منتجات، يعدل الأسعار والمخزون، وينبهك بالتحديثات فوراً
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Command Prompts */}
                    <div className="px-4 py-2.5 border-b border-white/10 bg-[#0D0D10] flex flex-wrap gap-1.5">
                      {[
                        'أعطني آخر التحديثات والتنبيهات في المتجر',
                        'أضف دبة تلوث تويوتا لاندكروزر بنزين بسعر 1750 ريال ونشرها',
                        'عدّل سعر دبة تلوث الديزل إلى 2690 ريال',
                      ].map((quick, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={assistantBusy}
                          onClick={() => handleAssistantSend(quick)}
                          className="px-2.5 py-1 rounded-lg border border-[#D4AF37]/30 bg-[#171510] hover:border-[#D4AF37] text-[11px] text-[#E5C158] cursor-pointer"
                        >
                          {quick}
                        </button>
                      ))}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {assistantMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.role === 'user' ? 'justify-start' : 'justify-end'
                          }`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl p-3.5 text-xs sm:text-sm space-y-2 ${
                              msg.role === 'user'
                                ? 'bg-[#D4AF37] text-[#09090B] font-medium'
                                : 'bg-[#18181D] border border-white/10 text-[#F5F2EB]'
                            }`}
                          >
                            <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

                            {msg.actionsExecuted && msg.actionsExecuted.length > 0 && (
                              <div className="pt-2 border-t border-white/10 text-[11px] text-emerald-300 space-y-0.5">
                                {msg.actionsExecuted.map((act, i) => (
                                  <div key={i}>✓ {act}</div>
                                ))}
                              </div>
                            )}

                            {msg.whatsappAlertText && ownerWaNumber && (
                              <div className="pt-2">
                                <a
                                  href={`https://wa.me/${ownerWaNumber}?text=${encodeURIComponent(
                                    msg.whatsappAlertText
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>إرسال هذا التحديث إلى واتسابي</span>
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {assistantBusy && (
                        <div className="text-xs text-[#E5C158] px-2">
                          المساعد الشخصي ينفذ الطلب...
                        </div>
                      )}
                    </div>

                    {/* Input */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAssistantSend();
                      }}
                      className="p-3 border-t border-white/10 bg-[#0D0D10] flex gap-2"
                    >
                      <input
                        type="text"
                        value={assistantInput}
                        onChange={(e) => setAssistantInput(e.target.value)}
                        placeholder="اطلب من المساعد: أضف منتج، عدل سعر، انشر مسودة، أو اعرض آخر التحديثات..."
                        className="flex-1 h-10 px-3.5 rounded-xl bg-[#16161B] border border-white/15 text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
                      />
                      <button
                        type="submit"
                        disabled={assistantBusy || !assistantInput.trim()}
                        className="btn-gold-wave h-10 px-4 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                        <span>إرسال</span>
                      </button>
                    </form>
                  </div>

                  {/* Right: Live Smart Alerts & Owner WhatsApp Bridge */}
                  <div className="xl:col-span-5 space-y-5">
                    {/* Live Alerts */}
                    <div className="p-5 rounded-2xl border border-white/10 bg-[#121216] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[#E5C158]">
                          <AlertTriangle className="w-4 h-4" />
                          <h3 className="font-bold text-sm">تنبيهات المنتجات والطلبات</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => fetchDashboard()}
                          className="text-xs text-[#9E988C] hover:text-[#E5C158] flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>تحديث</span>
                        </button>
                      </div>

                      {alerts.length === 0 ? (
                        <div className="p-4 rounded-xl bg-[#0D0D10] text-xs text-emerald-300">
                          جميع المنتجات متوفرة ومنشورة ولا توجد تنبيهات معلقة.
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-60 overflow-y-auto">
                          {alerts.map((al) => (
                            <div
                              key={al.id}
                              className={`p-3 rounded-xl border text-xs space-y-1 ${
                                al.level === 'urgent'
                                  ? 'border-red-500/35 bg-red-950/20 text-red-100'
                                  : al.level === 'warning'
                                    ? 'border-amber-500/35 bg-amber-950/20 text-amber-100'
                                    : 'border-sky-500/35 bg-sky-950/20 text-sky-100'
                              }`}
                            >
                              <div className="font-bold">{al.title}</div>
                              <div className="opacity-85 leading-relaxed">{al.detail}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Owner Private WhatsApp Notification Settings */}
                    <div className="p-5 rounded-2xl border border-emerald-500/30 bg-[#0F1713] space-y-3">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <MessageCircle className="w-4 h-4" />
                        <h3 className="font-bold text-sm">التواصل والتنبيه عبر واتساب المالك</h3>
                      </div>
                      <p className="text-xs text-[#C5BFB2] leading-relaxed">
                        هذا الرقم خاص بالمالك فقط ولا يظهر للعملاء. استلم عليه آخر التحديثات
                        وتنبيهات المنتجات والطلبات.
                      </p>

                      <div className="space-y-2.5">
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            رقم واتساب المالك الشخصي (9665...)
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={settings.ownerPersonalWhatsapp}
                            onChange={(e) =>
                              setSettings({ ...settings, ownerPersonalWhatsapp: e.target.value })
                            }
                            className="w-full h-9 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            رابط Webhook للواتساب التلقائي (اختياري)
                          </label>
                          <input
                            type="url"
                            dir="ltr"
                            value={settings.ownerWhatsappWebhookUrl}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                ownerWhatsappWebhookUrl: e.target.value,
                              })
                            }
                            placeholder="https://hook.example.com/whatsapp-alert"
                            className="w-full h-9 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleSaveSettings}
                            className="h-9 px-4 rounded-xl border border-[#D4AF37]/40 bg-[#171510] text-xs font-bold text-[#E5C158] cursor-pointer"
                          >
                            حفظ رقم الواتساب
                          </button>

                          {ownerWaNumber && (
                            <a
                              href={`https://wa.me/${ownerWaNumber}?text=${encodeURIComponent(
                                whatsappDigestText
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>إرسال التحديثات لواتسابي الآن</span>
                            </a>
                          )}

                          {settings.ownerWhatsappWebhookUrl && (
                            <button
                              type="button"
                              onClick={handleSendWebhookDigest}
                              className="h-9 px-3 rounded-xl border border-emerald-500/40 text-emerald-300 text-xs cursor-pointer"
                            >
                              إرسال عبر Webhook
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: PRODUCTS, SECTIONS & SECRET DRAFTS MANAGER */}
              {activeTab === 'products' && (() => {
                const activeCategories =
                  settings?.categories && settings.categories.length > 0
                    ? settings.categories
                    : createFallbackAdminSettings().categories;
                return (
                <div className="space-y-6">
                  {/* Top Action Bar: Always visible Add Product button + Filter */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-[#D4AF37]/40 bg-[#14120E] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base sm:text-lg font-bold text-[#E5C158]">
                        إدارة المنتجات والمسودات ({products.length})
                      </h3>
                      <p className="text-xs text-[#C5BFB2]">
                        أضف منتجاتك بالريال السعودي مع قص الصورة تلقائياً (1000 × 1000 بكسل) وكلمات البحث SEO
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openProductEditor({
                          name: '',
                          category: activeCategories[0]?.name || 'دبات تلوث البنزين',
                          priceSar: 1200,
                          description: '',
                          images: [],
                          seoKeywords: [],
                          specs: [{ label: 'نوع الوقود', value: 'بنزين / ديزل' }],
                          inStock: true,
                          isPublished: true,
                        })
                      }
                      className="btn-gold-wave h-11 px-5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shrink-0 shadow-lg"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة منتج جديد</span>
                    </button>
                  </div>

                  {/* Quick Section / Category Creator & Save */}
                  {settings && (
                  <div className="p-4 sm:p-5 rounded-2xl border border-[#D4AF37]/30 bg-[#121216] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-sm text-[#E5C158]">
                        أقسام المتجر (أضف قسماً جديداً واحفظه ليظهر في الواجهة)
                      </h3>
                      <button
                        type="button"
                        disabled={savingSettings}
                        onClick={() =>
                          persistSettingsObject(settings, 'تم حفظ أقسام المتجر بنجاح.')
                        }
                        className="h-8 px-4 rounded-lg border border-[#D4AF37]/50 bg-[#171510] text-xs font-bold text-[#E5C158] cursor-pointer"
                      >
                        {savingSettings ? 'جاري الحفظ...' : 'حفظ الأقسام'}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {activeCategories.map((cat) => (
                        <div
                          key={cat.id}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs ${
                            cat.isActive
                              ? 'border-[#D4AF37]/40 bg-[#171510] text-[#F5F2EB]'
                              : 'border-white/10 bg-[#0D0D10] text-[#9E988C] line-through'
                          }`}
                        >
                          <span>{cat.name}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleCategory(cat.id)}
                            title={cat.isActive ? 'إخفاء القسم' : 'تفعيل القسم'}
                            className="text-[#E5C158] hover:opacity-80 cursor-pointer"
                          >
                            {cat.isActive ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id)}
                            title="حذف القسم"
                            className="text-red-400 hover:opacity-80 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="اسم القسم الجديد (مثال: دبات تلوث الشاحنات)"
                        className="sm:col-span-5 h-9 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                      />
                      <input
                        type="text"
                        value={newCategoryDesc}
                        onChange={(e) => setNewCategoryDesc(e.target.value)}
                        placeholder="وصف قصير للقسم (اختياري)"
                        className="sm:col-span-5 h-9 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        className="sm:col-span-2 btn-gold-wave h-9 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة وحفظ</span>
                      </button>
                    </div>
                  </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121216] border border-white/10">
                      {[
                        { id: 'all', label: `الكل (${products.length})` },
                        { id: 'published', label: `المنشورة (${publishedCount})` },
                        { id: 'drafts', label: `المسودات السرية (${draftsCount})` },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setProductFilter(f.id as typeof productFilter)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                            productFilter === f.id
                              ? 'bg-[#D4AF37] text-[#09090B] font-bold'
                              : 'text-[#C5BFB2]'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredProducts.length === 0 ? (
                    <div className="p-8 rounded-2xl border border-white/10 bg-[#121216] text-center space-y-3">
                      <p className="text-sm text-[#C5BFB2]">لا توجد منتجات مطابقة للتصفية الحالية.</p>
                      <button
                        type="button"
                        onClick={() =>
                          openProductEditor({
                            name: '',
                            category: activeCategories[0]?.name || 'دبات تلوث البنزين',
                            priceSar: 1200,
                            description: '',
                            images: [],
                            seoKeywords: [],
                            specs: [{ label: 'نوع الوقود', value: 'بنزين / ديزل' }],
                            inStock: true,
                            isPublished: true,
                          })
                        }
                        className="btn-gold-wave h-10 px-5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة أول منتج الآن</span>
                      </button>
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredProducts.map((product) => (
                      <div
                        key={product.id}
                        className="p-4 rounded-2xl border border-white/10 bg-[#121216] flex gap-4"
                      >
                        <div className="w-24 h-24 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-[#09090B]">
                          <ResilientImage
                            src={(product.images || [])[0] || ''}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-[#9E988C] truncate">{product.category}</span>
                            <span
                              className={
                                product.isPublished
                                  ? 'text-emerald-400 font-bold'
                                  : 'text-amber-400 font-bold'
                              }
                            >
                              {product.isPublished ? 'منشور في المتجر' : 'مخفي / مسودة خاصة'}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-[#F5F2EB] line-clamp-1">
                            {product.name}
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#E5C158] tabular-nums">
                            <span>{Number(product.priceSar || 0).toLocaleString('ar-SA')} ر.س</span>
                            {product.costPriceSar ? (
                              <span className="text-[11px] font-normal text-emerald-300">
                                (التكلفة: {product.costPriceSar} | ربح:{' '}
                                {Math.max(0, Number(product.priceSar || 0) - product.costPriceSar)} ر.س)
                              </span>
                            ) : null}
                          </div>

                          {product.seoKeywords && product.seoKeywords.length > 0 && (
                            <div className="text-[11px] text-[#B8B0A0] truncate">
                              SEO: {product.seoKeywords.slice(0, 4).join('، ')}
                              {product.seoKeywords.length > 4
                                ? ` (+${product.seoKeywords.length - 4})`
                                : ''}
                            </div>
                          )}

                          {product.sourceUrl && (
                            <a
                              href={product.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline truncate max-w-full"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate">رابط المصدر الأصلي السري</span>
                            </a>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => openProductEditor(product)}
                              className="px-3 py-1.5 rounded-lg border border-white/15 bg-[#16161B] hover:border-[#D4AF37] text-xs cursor-pointer"
                            >
                              تعديل
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setStudioTarget({
                                  productId: product.id,
                                  fromEditorModal: false,
                                  imageUrl: (product.images || [])[0] || '',
                                  name: product.name,
                                  category: product.category,
                                  priceSar: product.priceSar,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] flex items-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>تحسين الصورة</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTogglePublish(product)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer ${
                                product.isPublished
                                  ? 'border border-amber-500/40 text-amber-300 bg-amber-950/30'
                                  : 'bg-emerald-600 text-white'
                              }`}
                            >
                              {product.isPublished ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>إخفاء كمسودة</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>نشر في الموقع</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-1.5 rounded-lg border border-white/10 text-red-400 hover:bg-red-950/30 cursor-pointer"
                              aria-label="حذف المنتج"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
                );
              })()}

              {/* TAB 4: SECRET AI PRODUCT SCRAPER (SIMILAR PRODUCTS + PROFIT OR SINGLE URL) */}
              {activeTab === 'scraper' && (
                <div className="max-w-4xl space-y-6">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setScraperMode('similar')}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
                        scraperMode === 'similar'
                          ? 'bg-[#D4AF37] text-[#09090B]'
                          : 'border border-white/15 bg-[#121216] text-[#C5BFB2]'
                      }`}
                    >
                      سحب المنتجات المشابهة من متجر + زيادة الأرباح
                    </button>
                    <button
                      type="button"
                      onClick={() => setScraperMode('single')}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
                        scraperMode === 'single'
                          ? 'bg-[#D4AF37] text-[#09090B]'
                          : 'border border-white/15 bg-[#121216] text-[#C5BFB2]'
                      }`}
                    >
                      سحب رابط منتج محدد واحد
                    </button>
                  </div>

                  {scraperMode === 'similar' ? (
                    <div className="space-y-6">
                      <form
                        onSubmit={handleScrapeSimilar}
                        className="p-6 rounded-2xl border border-[#D4AF37]/35 bg-[#121216] space-y-4"
                      >
                        <div className="flex items-center gap-2.5 text-[#E5C158]">
                          <Wand2 className="w-5 h-5" />
                          <h3 className="font-display text-lg font-bold">
                            سحب المنتجات المشابهة بالذكاء الاصطناعي مع زيادة الأرباح
                          </h3>
                        </div>
                        <p className="text-xs sm:text-sm text-[#C5BFB2] leading-relaxed">
                          ضع رابط المتجر الإلكتروني وحدد نوع المنتج ("مثل هذا المنتج") ليقوم الذكاء
                          الاصطناعي بسحب المنتجات المشابهة، كتابة عناوين وأوصاف جذابة يفهمها
                          العميل، وحساب السعر تلقائياً مع هامش الربح المحدد وحفظها كمسودات سرية
                          لتعديل صورها ونشرها.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              رابط المتجر الإلكتروني أو صفحة المنتجات
                            </label>
                            <input
                              type="url"
                              required
                              dir="ltr"
                              value={similarStoreUrl}
                              onChange={(e) => setSimilarStoreUrl(e.target.value)}
                              placeholder="https://supplier-store.example/catalytic-converters"
                              className="w-full h-11 px-4 rounded-xl bg-[#16161B] border border-white/15 text-sm text-left focus:outline-none focus:border-[#D4AF37]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              المنتج المحدد المطلوب سحب المشابه له
                            </label>
                            <input
                              type="text"
                              required
                              value={similarHint}
                              onChange={(e) => setSimilarHint(e.target.value)}
                              placeholder="مثال: دبة تلوث تويوتا هايلكس ديزل Euro-6"
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              حفظ داخل القسم
                            </label>
                            <select
                              value={similarCategory}
                              onChange={(e) => setSimilarCategory(e.target.value)}
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                            >
                              {(settings?.categories || []).map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              نسبة زيادة الأرباح (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={300}
                              value={profitMarginPercent}
                              onChange={(e) => setProfitMarginPercent(Number(e.target.value))}
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm tabular-nums"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              ربح إضافي ثابت فوق السعر (ر.س)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={extraProfitSar}
                              onChange={(e) => setExtraProfitSar(Number(e.target.value))}
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm tabular-nums"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={scraping}
                          className="btn-gold-wave h-11 px-6 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>
                            {scraping
                              ? 'جاري سحب المنتجات المشابهة وصياغتها...'
                              : 'سحب المنتجات المشابهة وحساب الأرباح'}
                          </span>
                        </button>
                      </form>

                      {similarBatch.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-sm font-bold text-[#E5C158]">
                            المنتجات المشابهة المسحوبة ({similarBatch.length} مسودة سرية جاهزة
                            لتعديل الصورة والنشر)
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {similarBatch.map((item) => (
                              <div
                                key={item.id}
                                className="p-4 rounded-2xl border border-amber-500/40 bg-[#14120E] space-y-3"
                              >
                                <div className="flex gap-3">
                                  <div className="w-24 h-24 rounded-xl overflow-hidden border border-white/10 shrink-0">
                                    <ResilientImage
                                      src={(item.images || [])[0] || ''}
                                      alt={item.name}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="font-bold text-sm text-[#F5F2EB] line-clamp-2">
                                      {item.name}
                                    </div>
                                    <div className="text-xs font-bold text-[#E5C158] tabular-nums">
                                      سعر البيع بالربح:{' '}
                                      {Number(item.priceSar || 0).toLocaleString('ar-SA')} ر.س
                                    </div>
                                    {item.costPriceSar ? (
                                      <div className="text-[11px] text-emerald-300 tabular-nums">
                                        التكلفة التقديرية: {item.costPriceSar} ر.س | صافي الزيادة: +
                                        {Math.max(
                                          0,
                                          Number(item.priceSar || 0) - item.costPriceSar
                                        )}{' '}
                                        ر.س
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                <p className="text-xs text-[#C5BFB2] line-clamp-2">
                                  {item.description}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setStudioTarget({
                                        productId: item.id,
                                        fromEditorModal: false,
                                        imageUrl: (item.images || [])[0] || '',
                                        name: item.name,
                                        category: item.category,
                                        priceSar: item.priceSar,
                                      })
                                    }
                                    className="px-3 py-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] cursor-pointer"
                                  >
                                    تعديل وتحسين الصورة
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openProductEditor(item)}
                                    className="px-3 py-1.5 rounded-lg border border-white/15 bg-[#16161B] text-xs cursor-pointer"
                                  >
                                    تعديل البيانات
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePublish(item)}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                                  >
                                    نشر في المتجر
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="p-6 rounded-2xl border border-[#D4AF37]/30 bg-[#121216] space-y-4">
                        <div className="flex items-center gap-2.5 text-[#E5C158]">
                          <Wand2 className="w-5 h-5" />
                          <h3 className="font-display text-lg font-bold">
                            سحب أو توليد منتج احترافي بالذكاء الاصطناعي (Gemini AI · 1000×1000)
                          </h3>
                        </div>
                        <p className="text-xs sm:text-sm text-[#C5BFB2] leading-relaxed">
                          أدخل <strong className="text-[#E5C158]">رابط المنتج</strong> أو اكتب{' '}
                          <strong className="text-[#E5C158]">اسم المنتج مباشرة</strong> ليقوم
                          Gemini AI تلقائياً بتوليد صورة منتج احترافية بمقاس{' '}
                          <span dir="ltr">1000×1000</span> بكسل إذا لم تتوفر صورة من الرابط، وكتابة
                          وصف تسويقي عربي متكامل والمواصفات، ثم{' '}
                          <strong className="text-emerald-300">حفظه ونشره مباشرة</strong> ليظهر في
                          قسم (المنتجات والمسودات) وفي واجهة المتجر فوراً.
                        </p>

                        <form onSubmit={handleScrapeProduct} className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-[#C5BFB2] mb-1">
                                اسم المنتج (للتوليد المباشر عبر Gemini AI)
                              </label>
                              <input
                                type="text"
                                value={scrapeProductName}
                                onChange={(e) => setScrapeProductName(e.target.value)}
                                placeholder="مثال: دبة تلوث تويوتا كامري 2022 بنزين أصلية Euro-6"
                                className="w-full h-11 px-4 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-[#C5BFB2] mb-1">القسم</label>
                              <select
                                value={scrapeCategory}
                                onChange={(e) => setScrapeCategory(e.target.value)}
                                className="w-full h-11 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                              >
                                {(settings?.categories && settings.categories.length > 0
                                  ? settings.categories
                                  : createFallbackAdminSettings().categories
                                ).map((c) => (
                                  <option key={c.id} value={c.name}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3">
                            <input
                              type="url"
                              dir="ltr"
                              value={scrapeUrl}
                              onChange={(e) => setScrapeUrl(e.target.value)}
                              placeholder="https://example.com/product-page (اختياري عند كتابة اسم المنتج)"
                              className="flex-1 h-11 px-4 rounded-xl bg-[#16161B] border border-white/15 text-sm text-left focus:outline-none focus:border-[#D4AF37]"
                            />
                            <button
                              type="submit"
                              disabled={scraping}
                              className="btn-gold-wave h-11 px-6 rounded-xl text-sm flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
                            >
                              <Sparkles className="w-4 h-4" />
                              <span>
                                {scraping
                                  ? 'جاري التوليد والسحب عبر Gemini...'
                                  : 'سحب / توليد ونشر المنتج فوراً'}
                              </span>
                            </button>
                          </div>
                        </form>
                      </div>

                      {lastScraped && (
                        <div className="p-6 rounded-2xl border border-emerald-500/40 bg-[#101813] space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-emerald-300">
                                ✓ تم الحفظ والنشر في قسم (المنتجات والمسودات) وفي واجهة المتجر مباشرة
                              </span>
                              {scrapeAiGeneratedImg && (
                                <span className="px-2 py-0.5 rounded-md bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[11px] text-[#E5C158] font-bold">
                                  صورة مولدة بـ Gemini 1000×1000
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setStudioTarget({
                                    productId: lastScraped.id,
                                    fromEditorModal: false,
                                    imageUrl: (lastScraped.images || [])[0] || '',
                                    name: lastScraped.name,
                                    category: lastScraped.category,
                                    priceSar: lastScraped.priceSar,
                                  })
                                }
                                className="px-3 py-2 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] cursor-pointer"
                              >
                                تحسين الصورة
                              </button>
                              <button
                                type="button"
                                onClick={() => openProductEditor(lastScraped)}
                                className="btn-gold-wave px-4 py-2 rounded-lg text-xs cursor-pointer"
                              >
                                تعديل البيانات والسعر
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-[#09090B]">
                              <ResilientImage
                                src={(lastScraped.images || [])[0] || ''}
                                alt={lastScraped.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="sm:col-span-2 space-y-2 text-xs">
                              <div className="text-base font-bold text-[#F5F2EB]">
                                {lastScraped.name}
                              </div>
                              <div className="text-[#E5C158] font-bold tabular-nums">
                                السعر المعتمد: {Number(lastScraped.priceSar || 0).toLocaleString('ar-SA')}{' '}
                                ر.س
                                {lastScraped.originalExtractedPrice
                                  ? ` (الأصل: ${lastScraped.originalExtractedPrice})`
                                  : ''}
                              </div>
                              <p className="text-[#C5BFB2] leading-relaxed">
                                {lastScraped.description}
                              </p>
                              {lastScraped.sourceUrl && (
                                <div className="text-sky-400 break-all">
                                  المصدر المحفوظ سرياً: {lastScraped.sourceUrl}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: AI SEO & GOOGLE ADS GENERATOR */}
              {activeTab === 'ai-seo' && (
                <div className="space-y-6">
                  {/* Global Store SEO Keywords (up to 15) */}
                  <section className="p-6 rounded-2xl border border-[#D4AF37]/40 bg-[#14120E] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-[#E5C158]">
                        <Tags className="w-5 h-5" />
                        <div>
                          <h3 className="font-display text-lg font-bold">
                            الكلمات المفتاحية للبحث - SEO Keywords (للمتجر بالكامل)
                          </h3>
                          <p className="text-xs text-[#C5BFB2] mt-0.5">
                            أدخل حتى 15 كلمة أو عبارة مفصولة بفاصلة (، أو ,) ليتم حقنها تلقائياً في
                            أكواد الميتا Meta Tags والبيانات المنظمة لجوجل.
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-lg bg-[#1B1810] border border-[#D4AF37]/40 text-xs font-bold text-[#E5C158] tabular-nums">
                        {parseSeoKeywordsText(storeSeoKeywordsInput).length} / 15
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={storeSeoKeywordsInput}
                        onChange={(e) => setStoreSeoKeywordsInput(e.target.value)}
                        placeholder="دبات التلوث، دبة تلوث ديزل، دبة تلوث بنزين، فلتر البيئة DPF، مصنع التاج الذهبي..."
                        className="flex-1 h-11 px-4 rounded-xl bg-[#16161B] border border-white/15 text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
                      />
                      <button
                        type="button"
                        disabled={savingSettings}
                        onClick={() => {
                          const keywords = parseSeoKeywordsText(storeSeoKeywordsInput);
                          const base = settings || createFallbackAdminSettings();
                          const nextSettings = { ...base, seoKeywords: keywords };
                          setSettings(nextSettings);
                          setStoreSeoKeywordsInput(keywords.join('، '));
                          void persistSettingsObject(
                            nextSettings,
                            `تم حفظ وتطبيق ${keywords.length} كلمة مفتاحية للبحث (SEO) في المتجر.`
                          );
                        }}
                        className="btn-gold-wave h-11 px-5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{savingSettings ? 'جاري الحفظ...' : 'حفظ وتطبيق الكلمات المفتاحية'}</span>
                      </button>
                    </div>

                    {parseSeoKeywordsText(storeSeoKeywordsInput).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {parseSeoKeywordsText(storeSeoKeywordsInput).map((kw, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg border border-[#D4AF37]/30 bg-[#171510] text-[11px] text-[#E5C158]"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="p-6 rounded-2xl border border-white/10 bg-[#121216] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-[#E5C158]">
                          <Globe className="w-5 h-5" />
                          <h3 className="font-display text-lg font-bold">
                            نظام SEO والبيانات المنظمة (Schema Markup) التلقائي
                          </h3>
                        </div>
                        <p className="text-xs text-[#9E988C] mt-1">
                          توليد وتحديث الكلمات المفتاحية، الأوصاف، وبيانات Schema.org تلقائياً ودورياً
                          للمنتجات المنشورة فقط.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={refreshingSeo}
                        onClick={handleRefreshSeo}
                        className="btn-gold-wave h-10 px-5 rounded-xl text-xs sm:text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${refreshingSeo ? 'animate-spin' : ''}`} />
                        <span>
                          {refreshingSeo ? 'جاري التحديث...' : 'تحديث SEO لجميع المنتجات الآن'}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      {products
                        .filter((p) => p.isPublished)
                        .map((p) => (
                          <div
                            key={p.id}
                            className="p-4 rounded-xl border border-white/10 bg-[#0D0D10] space-y-1.5 text-xs"
                          >
                            <div className="font-bold text-[#F5F2EB]">{p.seoTitle || p.name}</div>
                            <div className="text-[#9E988C] line-clamp-2">
                              {p.seoDescription || p.description}
                            </div>
                            <div className="text-[#E5C158]/90 pt-1">
                              {(p.seoKeywords || []).join(' · ')}
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>

                  <section className="p-6 rounded-2xl border border-[#D4AF37]/30 bg-[#121216] space-y-5">
                    <div className="flex items-center gap-2 text-[#E5C158]">
                      <Megaphone className="w-5 h-5" />
                      <h3 className="font-display text-lg font-bold">
                        مولّد حملات إعلانات جوجل (Google Ads) وبنرات العروض
                      </h3>
                    </div>

                    <form onSubmit={handleGenerateAds} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <select
                        value={adsProductId}
                        onChange={(e) => setAdsProductId(e.target.value)}
                        className="h-11 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs sm:text-sm"
                      >
                        <option value="">حملة عامة للمتجر بالكامل</option>
                        {products
                          .filter((p) => p.isPublished)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>

                      <input
                        type="text"
                        value={adsGoal}
                        onChange={(e) => setAdsGoal(e.target.value)}
                        placeholder="الهدف الإعلاني (مثال: استهداف أصحاب سيارات الديزل)"
                        className="h-11 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
                      />

                      <button
                        type="submit"
                        disabled={generatingAds}
                        className="btn-gold-wave h-11 px-5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>
                          {generatingAds ? 'جاري التوليد...' : 'توليد إعلان جوجل وبنر ترويجي'}
                        </span>
                      </button>
                    </form>

                    {generatedCampaign && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-3 border-t border-white/10">
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-[#E5C158]">
                            نصوص Google Ads الجاهزة للنسخ
                          </div>
                          <div className="p-4 rounded-xl border border-white/10 bg-[#0D0D10] space-y-3 text-xs">
                            <div>
                              <div className="flex items-center justify-between text-[#9E988C] mb-1">
                                <span>العناوين (Headlines)</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyText(
                                      'headlines',
                                      generatedCampaign.googleAdsHeadlines.join('\n')
                                    )
                                  }
                                  className="text-[#E5C158] flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedKey === 'headlines' ? (
                                    <Check className="w-3.5 h-3.5" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  <span>نسخ</span>
                                </button>
                              </div>
                              <ul className="space-y-1 text-[#F5F2EB]">
                                {generatedCampaign.googleAdsHeadlines.map((h, i) => (
                                  <li key={i}>• {h}</li>
                                ))}
                              </ul>
                            </div>

                            <div>
                              <div className="flex items-center justify-between text-[#9E988C] mb-1">
                                <span>الأوصاف (Descriptions)</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyText(
                                      'descs',
                                      generatedCampaign.googleAdsDescriptions.join('\n')
                                    )
                                  }
                                  className="text-[#E5C158] flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedKey === 'descs' ? (
                                    <Check className="w-3.5 h-3.5" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  <span>نسخ</span>
                                </button>
                              </div>
                              <ul className="space-y-1 text-[#C5BFB2]">
                                {generatedCampaign.googleAdsDescriptions.map((d, i) => (
                                  <li key={i}>• {d}</li>
                                ))}
                              </ul>
                            </div>

                            <div>
                              <div className="text-[#9E988C] mb-1">الكلمات المفتاحية (Keywords)</div>
                              <div className="text-[#E5C158]">
                                {generatedCampaign.googleAdsKeywords.join(' ، ')}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="text-xs font-bold text-[#E5C158]">
                            معاينة البنر الترويجي داخل المتجر
                          </div>
                          <div className="p-5 rounded-xl border border-[#D4AF37]/40 bg-gradient-to-l from-[#1A160D] to-[#111115] space-y-2">
                            <div className="text-xs text-[#E5C158] font-bold">
                              {generatedCampaign.banner.discountLabel}
                            </div>
                            <div className="font-display text-lg font-bold text-[#F5F2EB]">
                              {generatedCampaign.banner.title}
                            </div>
                            <p className="text-xs text-[#C5BFB2]">
                              {generatedCampaign.banner.subtitle}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handlePublishGeneratedBanner}
                            className="btn-gold-wave w-full h-10 rounded-xl text-xs sm:text-sm cursor-pointer"
                          >
                            نشر هذا البنر في واجهة المتجر بضغطة زر
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-white/10 space-y-2.5">
                      <div className="text-xs font-bold text-[#9E988C]">
                        بنرات العروض الحالية ({banners.length})
                      </div>
                      {banners.map((b) => (
                        <div
                          key={b.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-white/10 bg-[#0D0D10]"
                        >
                          <div>
                            <div className="text-sm font-bold text-[#F5F2EB]">{b.title}</div>
                            <div className="text-xs text-[#9E988C]">{b.subtitle}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleBanner(b)}
                              className={`px-3 py-1 rounded-lg text-xs cursor-pointer ${
                                b.isActive
                                  ? 'bg-emerald-950/50 border border-emerald-500/40 text-emerald-300'
                                  : 'bg-white/5 border border-white/15 text-[#9E988C]'
                              }`}
                            >
                              {b.isActive ? 'ظاهر في المتجر' : 'مخفي'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBanner(b.id)}
                              className="p-1.5 text-red-400 hover:bg-red-950/30 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 5.5: OWNER ANALYTICS, DAILY SEARCH CHART & CSV PROFIT REPORT */}
              {activeTab === 'analytics' && (
                <div className="max-w-5xl space-y-6">
                  <section className="p-6 rounded-2xl border border-[#D4AF37]/30 bg-[#121216] space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-[#E5C158]">
                        <BarChart3 className="w-5 h-5" />
                        <div>
                          <h3 className="font-display text-lg font-bold">
                            تقارير الأداء والزوار والبحث اليومي
                          </h3>
                          <p className="text-xs text-[#9E988C]">
                            متابعة حية لزوار المتجر، أكثر الكلمات بحثاً، وتصدير تقارير الأرباح (CSV)
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => fetchDashboard()}
                        className="h-9 px-3.5 rounded-xl border border-white/15 bg-[#16161B] text-xs text-[#E5C158] flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>تحديث التقارير</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl border border-[#D4AF37]/30 bg-[#171510]">
                        <div className="text-xs text-[#C5BFB2]">إجمالي الزيارات</div>
                        <div className="text-2xl font-bold text-[#E5C158] mt-1 tabular-nums">
                          {(analytics?.totalVisits ?? 0).toLocaleString('ar-SA')}
                        </div>
                      </div>
                      <div className="p-4 rounded-xl border border-white/10 bg-[#0D0D10]">
                        <div className="text-xs text-[#9E988C]">الزوار الفريدون</div>
                        <div className="text-2xl font-bold text-[#F5F2EB] mt-1 tabular-nums">
                          {(analytics?.uniqueVisitors ?? 0).toLocaleString('ar-SA')}
                        </div>
                      </div>
                      <div className="p-4 rounded-xl border border-white/10 bg-[#0D0D10]">
                        <div className="text-xs text-[#9E988C]">إجمالي الطلبات الفعالة</div>
                        <div className="text-2xl font-bold text-emerald-300 mt-1 tabular-nums">
                          {orders.filter((o) => o.status !== 'ملغي').length}
                        </div>
                      </div>
                    </div>

                    {/* 14-Day Daily Search Trend Bar Chart */}
                    <div className="p-4 rounded-xl border border-white/10 bg-[#0D0D10] space-y-3">
                      <div className="text-xs font-bold text-[#E5C158]">
                        مخطط نشاط البحث اليومي (آخر 14 يوماً)
                      </div>
                      {!analytics?.dailySearches || analytics.dailySearches.length === 0 ? (
                        <div className="py-8 text-center text-xs text-[#9E988C]">
                          لا توجد بيانات بحث يومية مسجلة حتى الآن.
                        </div>
                      ) : (
                        <div className="flex items-end gap-2 h-40 pt-4 px-2 overflow-x-auto">
                          {(() => {
                            const maxCount = Math.max(
                              1,
                              ...analytics.dailySearches.map((d) => d.count)
                            );
                            return analytics.dailySearches.map((point) => {
                              const pct = Math.max(10, Math.round((point.count / maxCount) * 100));
                              return (
                                <div
                                  key={point.date}
                                  className="flex-1 min-w-[36px] flex flex-col items-center gap-1.5 h-full justify-end"
                                >
                                  <span className="text-[10px] font-bold text-[#E5C158] tabular-nums">
                                    {point.count}
                                  </span>
                                  <div
                                    className="w-full max-w-[32px] rounded-t-lg bg-gradient-to-t from-[#9E7B1C] to-[#F5E1A4] transition-all"
                                    style={{ height: `${pct}%` }}
                                    title={`${point.date}: ${point.count}`}
                                  />
                                  <span className="text-[10px] text-[#9E988C] tabular-nums" dir="ltr">
                                    {point.date.slice(5)}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Date Range Profit Report CSV Export */}
                    <div className="p-5 rounded-xl border border-emerald-500/30 bg-[#0E1612] space-y-4">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <Download className="w-4 h-4" />
                        <h4 className="font-bold text-sm">
                          تصدير تقرير المبيعات وصافي الأرباح (ملف CSV متوافق مع Excel)
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">من تاريخ</label>
                          <input
                            type="date"
                            dir="ltr"
                            value={reportFrom}
                            onChange={(e) => setReportFrom(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">إلى تاريخ</label>
                          <input
                            type="date"
                            dir="ltr"
                            value={reportTo}
                            onChange={(e) => setReportTo(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleExportProfitCsv}
                          className="btn-gold-wave h-10 px-5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                          <span>تحميل تقرير الأرباح (CSV)</span>
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'drive' && (
                <GoogleDriveWorkspace
                  storeData={{ settings, products, banners, reviews }}
                  onNotify={showToast}
                />
              )}

              {/* TAB 6: DUAL MARQUEES + SPEED, VIDEO/PHOTO BACKGROUNDS, & STORE SETTINGS */}
              {activeTab === 'settings' && settings && (
                <div className="max-w-4xl space-y-6">
                  <form onSubmit={handleSaveSettings} className="space-y-6">
                    {/* Store Identity + AI Store Enhancement + Quick Save */}
                    <section className="p-5 rounded-2xl border border-white/10 bg-[#121216] space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold text-base text-[#E5C158]">
                          هوية المتجر القابلة للتعديل
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={enhancingStore}
                            onClick={handleEnhanceStoreWithAi}
                            className="h-9 px-3.5 rounded-xl border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] flex items-center gap-1.5 cursor-pointer"
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                            <span>
                              {enhancingStore
                                ? 'جاري التوليد...'
                                : 'تحسين الاسم والعناوين بالذكاء الاصطناعي'}
                            </span>
                          </button>
                          <button
                            type="submit"
                            disabled={savingSettings}
                            className="btn-gold-wave h-9 px-4 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            حفظ المتجر
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">اسم المتجر</label>
                          <input
                            type="text"
                            required
                            value={settings.storeName}
                            onChange={(e) =>
                              setSettings({ ...settings, storeName: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">الوصف المختصر</label>
                          <input
                            type="text"
                            value={settings.storeTagline}
                            onChange={(e) =>
                              setSettings({ ...settings, storeTagline: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>
                      </div>
                    </section>

                    {/* Themes, Custom Colors & Exhaust/Standard Button Styles */}
                    <section className="p-5 rounded-2xl border border-[#D4AF37]/30 bg-[#121216] space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Palette className="w-4 h-4 text-[#E5C158]" />
                          <h3 className="font-bold text-base text-[#E5C158]">
                            ثيمات المتجر والألوان وشكل الأزرار (أنظمة العادم / العادي)
                          </h3>
                        </div>
                        <button
                          type="submit"
                          disabled={savingSettings}
                          className="btn-gold-wave h-9 px-4 rounded-xl text-xs font-bold cursor-pointer"
                        >
                          حفظ الثيم والألوان
                        </button>
                      </div>

                      {/* One-Click Theme Presets */}
                      <div className="space-y-2">
                        <div className="text-xs text-[#C5BFB2]">اختر ثيماً جاهزاً للمتجر:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          {[
                            {
                              id: 'royal_gold' as const,
                              label: 'الذهبي والأسود الملكي',
                              gold: '#D4AF37',
                              bg: '#09090B',
                              surface: '#131317',
                            },
                            {
                              id: 'titanium_exhaust' as const,
                              label: 'تيتانيوم العادم المحروق',
                              gold: '#38BDF8',
                              bg: '#080B10',
                              surface: '#111622',
                            },
                            {
                              id: 'carbon_amber' as const,
                              label: 'ألياف الكربون الكهرماني',
                              gold: '#F59E0B',
                              bg: '#0C0C0E',
                              surface: '#17171B',
                            },
                            {
                              id: 'stainless_silver' as const,
                              label: 'الفولاذ المصقول الفضي',
                              gold: '#E2E8F0',
                              bg: '#0A0D10',
                              surface: '#14191F',
                            },
                          ].map((preset) => {
                            const active = settings.themePreset === preset.id;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() =>
                                  setSettings({
                                    ...settings,
                                    themePreset: preset.id,
                                    primaryGoldColor: preset.gold,
                                    backgroundColor: preset.bg,
                                    surfaceColor: preset.surface,
                                  })
                                }
                                className={`p-3 rounded-xl border text-right transition-colors cursor-pointer space-y-2 ${
                                  active
                                    ? 'border-[#D4AF37] bg-[#19160E]'
                                    : 'border-white/10 bg-[#0D0D10] hover:border-white/25'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-4 h-4 rounded-full border border-white/20"
                                    style={{ backgroundColor: preset.gold }}
                                  />
                                  <span
                                    className="w-4 h-4 rounded-full border border-white/20"
                                    style={{ backgroundColor: preset.bg }}
                                  />
                                  <span
                                    className="w-4 h-4 rounded-full border border-white/20"
                                    style={{ backgroundColor: preset.surface }}
                                  />
                                </div>
                                <div className="text-xs font-bold text-[#F5F2EB]">
                                  {preset.label}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Custom Color Pickers */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            اللون الرئيسي (الأزرار واللمسات)
                          </label>
                          <input
                            type="color"
                            value={settings.primaryGoldColor || '#D4AF37'}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                themePreset: 'custom',
                                primaryGoldColor: e.target.value,
                              })
                            }
                            className="w-full h-10 rounded-lg bg-[#16161B] border border-white/15 p-1 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            لون خلفية المتجر
                          </label>
                          <input
                            type="color"
                            value={settings.backgroundColor || '#09090B'}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                themePreset: 'custom',
                                backgroundColor: e.target.value,
                              })
                            }
                            className="w-full h-10 rounded-lg bg-[#16161B] border border-white/15 p-1 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            لون البطاقات والأسطح
                          </label>
                          <input
                            type="color"
                            value={settings.surfaceColor || '#131317'}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                themePreset: 'custom',
                                surfaceColor: e.target.value,
                              })
                            }
                            className="w-full h-10 rounded-lg bg-[#16161B] border border-white/15 p-1 cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Button Style Selector: Standard vs Exhaust System Styles */}
                      <div className="space-y-2.5 pt-2 border-t border-white/10">
                        <div className="text-xs text-[#C5BFB2]">
                          نمط وشكل أزرار الشراء والتصفح في المتجر (تحكم بين النظام العادي وأنظمة العادم):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          {[
                            {
                              id: 'gold_wave' as const,
                              title: 'الموج الذهبي الفاخر',
                              desc: 'تدرج ذهبي متحرك فاخر (الافتراضي)',
                            },
                            {
                              id: 'standard' as const,
                              title: 'النظام العادي البسيط',
                              desc: 'زر عادي صلب بلون المتجر المحدد',
                            },
                            {
                              id: 'exhaust_twin' as const,
                              title: 'شكل أنظمة العادم (تيتانيوم)',
                              desc: 'تصميم معدني مصقول بإطار التيتانيوم',
                            },
                            {
                              id: 'exhaust_flame' as const,
                              title: 'شكل أنظمة العادم (التيربو)',
                              desc: 'معدن داكن مع توهج حرارة المحفز',
                            },
                          ].map((btnOpt) => {
                            const selected = (settings.buttonStyle || 'gold_wave') === btnOpt.id;
                            return (
                              <button
                                key={btnOpt.id}
                                type="button"
                                onClick={() =>
                                  setSettings({ ...settings, buttonStyle: btnOpt.id })
                                }
                                className={`p-3 rounded-xl border text-right transition-colors cursor-pointer space-y-2 ${
                                  selected
                                    ? 'border-[#D4AF37] bg-[#19160E]'
                                    : 'border-white/10 bg-[#0D0D10] hover:border-white/25'
                                }`}
                              >
                                <div className="text-xs font-bold text-[#F5F2EB]">
                                  {btnOpt.title}
                                </div>
                                <div className="text-[11px] text-[#9E988C] leading-snug">
                                  {btnOpt.desc}
                                </div>
                                <div
                                  data-button-style={btnOpt.id}
                                  style={
                                    {
                                      '--royal-gold': settings.primaryGoldColor || '#D4AF37',
                                    } as React.CSSProperties
                                  }
                                  className="pt-1"
                                >
                                  <span className="btn-gold-wave inline-flex w-full h-8 rounded-lg items-center justify-center text-[11px]">
                                    أضف إلى السلة
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </section>

                    {/* Dual Top Marquees + Speed Control */}
                    <section className="p-5 rounded-2xl border border-[#D4AF37]/30 bg-[#121216] space-y-5">
                      <h3 className="font-bold text-base text-[#E5C158]">
                        الشريطان المتحركان في الأعلى وضبط السرعة
                      </h3>

                      {/* Marquee 1 */}
                      <div className="p-4 rounded-xl border border-white/10 bg-[#0D0D10] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[#F5F2EB]">
                            الشريط المتحرك الأول
                          </span>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.marqueeEnabled}
                              onChange={(e) =>
                                setSettings({ ...settings, marqueeEnabled: e.target.checked })
                              }
                            />
                            <span>تفعيل</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={settings.marqueeText}
                          onChange={(e) =>
                            setSettings({ ...settings, marqueeText: e.target.value })
                          }
                          placeholder="نص الشريط المتحرك الأول"
                          className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">لون الخلفية</label>
                            <input
                              type="color"
                              value={settings.marqueeBgColor}
                              onChange={(e) =>
                                setSettings({ ...settings, marqueeBgColor: e.target.value })
                              }
                              className="w-full h-9 rounded-lg bg-[#16161B] border border-white/15 p-1 cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">لون النص</label>
                            <input
                              type="color"
                              value={settings.marqueeTextColor}
                              onChange={(e) =>
                                setSettings({ ...settings, marqueeTextColor: e.target.value })
                              }
                              className="w-full h-9 rounded-lg bg-[#16161B] border border-white/15 p-1 cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-xs text-[#C5BFB2] mb-1">
                              <span>سرعة الحركة</span>
                              <span className="tabular-nums text-[#E5C158]">
                                {settings.marqueeSpeed || 28} ثانية
                              </span>
                            </div>
                            <input
                              type="range"
                              min={8}
                              max={60}
                              value={settings.marqueeSpeed || 28}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  marqueeSpeed: Number(e.target.value),
                                })
                              }
                              className="w-full accent-[#D4AF37]"
                            />
                            <div className="flex justify-between text-[10px] text-[#847E73]">
                              <span>سريع جداً (8ث)</span>
                              <span>بطيء (60ث)</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Marquee 2 */}
                      <div className="p-4 rounded-xl border border-white/10 bg-[#0D0D10] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[#F5F2EB]">
                            الشريط المتحرك الثاني
                          </span>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.marquee2Enabled}
                              onChange={(e) =>
                                setSettings({ ...settings, marquee2Enabled: e.target.checked })
                              }
                            />
                            <span>تفعيل</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          value={settings.marquee2Text}
                          onChange={(e) =>
                            setSettings({ ...settings, marquee2Text: e.target.value })
                          }
                          placeholder="نص الشريط المتحرك الثاني"
                          className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">لون الخلفية</label>
                            <input
                              type="color"
                              value={settings.marquee2BgColor}
                              onChange={(e) =>
                                setSettings({ ...settings, marquee2BgColor: e.target.value })
                              }
                              className="w-full h-9 rounded-lg bg-[#16161B] border border-white/15 p-1 cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">لون النص</label>
                            <input
                              type="color"
                              value={settings.marquee2TextColor}
                              onChange={(e) =>
                                setSettings({ ...settings, marquee2TextColor: e.target.value })
                              }
                              className="w-full h-9 rounded-lg bg-[#16161B] border border-white/15 p-1 cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-xs text-[#C5BFB2] mb-1">
                              <span>سرعة الحركة</span>
                              <span className="tabular-nums text-[#E5C158]">
                                {settings.marquee2Speed || 24} ثانية
                              </span>
                            </div>
                            <input
                              type="range"
                              min={8}
                              max={60}
                              value={settings.marquee2Speed || 24}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  marquee2Speed: Number(e.target.value),
                                })
                              }
                              className="w-full accent-[#D4AF37]"
                            />
                            <div className="flex justify-between text-[10px] text-[#847E73]">
                              <span>سريع جداً (8ث)</span>
                              <span>بطيء (60ث)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Landing Hero + Image Upload */}
                    <section className="p-5 rounded-2xl border border-white/10 bg-[#121216] space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-base text-[#E5C158]">
                          صفحة الهبوط وخلفيات الصور
                        </h3>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.heroEnabled}
                            onChange={(e) =>
                              setSettings({ ...settings, heroEnabled: e.target.checked })
                            }
                          />
                          <span>إظهار صفحة الهبوط</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">العنوان الترحيبي</label>
                          <input
                            type="text"
                            value={settings.heroTitle}
                            onChange={(e) =>
                              setSettings({ ...settings, heroTitle: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">نص زر التصفح</label>
                          <input
                            type="text"
                            value={settings.heroCtaText}
                            onChange={(e) =>
                              setSettings({ ...settings, heroCtaText: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-[#C5BFB2] mb-1">الوصف الترحيبي</label>
                        <textarea
                          rows={2}
                          value={settings.heroSubtitle}
                          onChange={(e) =>
                            setSettings({ ...settings, heroSubtitle: e.target.value })
                          }
                          className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            نمط خلفية صفحة الهبوط
                          </label>
                          <select
                            value={settings.heroBackdropMode || 'auto'}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                heroBackdropMode: e.target.value as StoreSettings['heroBackdropMode'],
                              })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          >
                            <option value="auto">تلقائي (فيديو أو شرائح صور أو صورة)</option>
                            <option value="video">مقطع فيديو إعلاني عريض (1920 × 1080 / MP4)</option>
                            <option value="slideshow">عرض شرائح صور متعددة</option>
                            <option value="image">صورة رئيسية ثابتة</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs text-[#C5BFB2]">
                            صورة الخلفية الرئيسية (رابط أو رفع من جهازك)
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              dir="ltr"
                              value={settings.heroImageUrl}
                              onChange={(e) =>
                                setSettings({ ...settings, heroImageUrl: e.target.value })
                              }
                              className="flex-1 h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                            />
                            <label className="h-10 px-3 rounded-xl border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] flex items-center gap-1 cursor-pointer shrink-0">
                              <Upload className="w-3.5 h-3.5" />
                              <span>{uploadingTarget === 'heroImage' ? '...' : 'رفع'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadFile(f, 'heroImage');
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Main Storefront Hero Promotional Video (MP4 / 1920x1080) */}
                      <div className="p-4 rounded-xl border border-[#D4AF37]/35 bg-[#0D0D10] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#E5C158]">
                            <Film className="w-4 h-4" />
                            <span>فيديو الواجهة الإعلانية الرئيسية (MP4 · 1920 × 1080)</span>
                          </div>
                          <button
                            type="button"
                            disabled={savingSettings}
                            onClick={() => {
                              const nextSettings: StoreSettings = {
                                ...settings,
                                heroBackdropMode: settings.heroVideoUrl?.trim()
                                  ? 'video'
                                  : settings.heroBackdropMode,
                              };
                              setSettings(nextSettings);
                              void persistSettingsObject(
                                nextSettings,
                                'تم حفظ وتطبيق الفيديو الإعلاني في واجهة المتجر الرئيسية فوراً.'
                              );
                            }}
                            className="btn-gold-wave h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{savingSettings ? 'جاري التطبيق...' : 'حفظ وتطبيق'}</span>
                          </button>
                        </div>

                        <p className="text-[11px] text-[#9E988C] leading-relaxed">
                          ارفع ملف فيديو MP4 من جهازك أو ضع رابطاً مباشراً. يتم ضبط المقاس تلقائياً
                          للشاشات العريضة <span dir="ltr">1920 × 1080</span> على الكمبيوتر ويتجاوب مع
                          شاشات الجوال دون قص أو تشويه، مع تشغيل تلقائي متكرر بدون صوت.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            dir="ltr"
                            value={settings.heroVideoUrl || ''}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                heroVideoUrl: e.target.value,
                                heroBackdropMode: e.target.value.trim()
                                  ? 'video'
                                  : settings.heroBackdropMode,
                              })
                            }
                            placeholder="https://example.com/promo.mp4 أو ارفع ملف MP4"
                            className="flex-1 h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                          />
                          <label className="h-10 px-4 rounded-xl border border-[#D4AF37]/45 bg-[#171510] text-xs font-bold text-[#E5C158] flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {uploadingTarget === 'heroVideo'
                                ? 'جاري رفع الفيديو...'
                                : 'رفع فيديو MP4'}
                            </span>
                            <input
                              type="file"
                              accept="video/mp4,video/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadFile(f, 'heroVideo');
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {settings.heroVideoUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setSettings({
                                  ...settings,
                                  heroVideoUrl: '',
                                  heroBackdropMode: 'auto',
                                })
                              }
                              className="h-10 px-3 rounded-xl border border-red-500/35 text-xs text-red-400 hover:bg-red-950/30 cursor-pointer shrink-0"
                            >
                              إزالة الفيديو
                            </button>
                          )}
                        </div>

                        {settings.heroVideoUrl && (
                          <div className="aspect-video w-full rounded-xl overflow-hidden border border-[#D4AF37]/30 bg-[#09090B]">
                            <video
                              src={settings.heroVideoUrl}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-contain bg-[#09090B]"
                            />
                          </div>
                        )}
                      </div>

                      {/* Slideshow Images */}
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-[#C5BFB2]">
                            صور عرض الشرائح المتعددة (رابط في كل سطر)
                          </label>
                          <label className="px-3 py-1 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] flex items-center gap-1 cursor-pointer">
                            <Upload className="w-3 h-3" />
                            <span>
                              {uploadingTarget === 'heroSlideshow'
                                ? 'جاري الرفع...'
                                : '+ رفع صورة للشرائح'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadFile(f, 'heroSlideshow');
                              }}
                            />
                          </label>
                        </div>
                        <textarea
                          rows={3}
                          dir="ltr"
                          value={(settings.heroSlideshowImages || []).join('\n')}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              heroSlideshowImages: e.target.value
                                .split('\n')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                        />
                      </div>

                      {/* Global Store Background (Video, Animated Image, Static Image + AI Optimize) */}
                      <div className="space-y-4 pt-3 border-t border-white/10">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-bold text-[#E5C158]">
                            خلفية المتجر العامة (فيديو أو صورة متحركة أو صورة ثابتة)
                          </div>
                          <button
                            type="button"
                            disabled={optimizingBg}
                            onClick={handleOptimizeBackgroundWithAi}
                            className="h-8 px-3 rounded-lg border border-[#D4AF37]/50 bg-[#171510] text-xs font-bold text-[#E5C158] flex items-center gap-1.5 cursor-pointer"
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                            <span>
                              {optimizingBg ? 'جاري الضبط...' : 'ضبط بالذكاء الاصطناعي'}
                            </span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
                          <select
                            value={settings.siteBackgroundType || 'none'}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                siteBackgroundType: e.target
                                  .value as StoreSettings['siteBackgroundType'],
                              })
                            }
                            className="h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                          >
                            <option value="none">بدون خلفية عامة (أسود ملكي صافي)</option>
                            <option value="image">صورة خلفية ثابتة</option>
                            <option value="animated_image">صورة متحركة / GIF (حركة سينمائية)</option>
                            <option value="video">مقطع فيديو خلفية كامل (.mp4)</option>
                          </select>

                          <select
                            value={settings.siteBackgroundAnimatedMotion || 'kenburns'}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                siteBackgroundAnimatedMotion: e.target
                                  .value as StoreSettings['siteBackgroundAnimatedMotion'],
                              })
                            }
                            className="h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                          >
                            <option value="kenburns">حركة تكبير سينمائية (Ken Burns)</option>
                            <option value="float">حركة طفو ناعمة (Float)</option>
                            <option value="pulse">توهج وتنفس هادئ (Pulse)</option>
                            <option value="none">ثابتة بدون حركة</option>
                          </select>

                          <div className="flex gap-1.5 lg:col-span-2">
                            <input
                              type="text"
                              dir="ltr"
                              value={settings.siteBackgroundUrl || ''}
                              onChange={(e) =>
                                setSettings({ ...settings, siteBackgroundUrl: e.target.value })
                              }
                              placeholder="رابط الصورة المتحركة أو الفيديو (.mp4 / .gif)"
                              className="flex-1 h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                            />
                            <label className="h-10 px-2.5 rounded-xl border border-[#D4AF37]/40 bg-[#171510] text-[11px] text-[#E5C158] flex items-center gap-1 cursor-pointer shrink-0">
                              <Upload className="w-3.5 h-3.5" />
                              <span>{uploadingTarget === 'siteBg' ? '...' : 'صورة'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadFile(f, 'siteBg');
                                }}
                              />
                            </label>
                            <label className="h-10 px-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 text-[11px] text-emerald-300 flex items-center gap-1 cursor-pointer shrink-0">
                              <Film className="w-3.5 h-3.5" />
                              <span>{uploadingTarget === 'siteBgVideo' ? '...' : 'فيديو'}</span>
                              <input
                                type="file"
                                accept="video/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadFile(f, 'siteBgVideo');
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs text-[#C5BFB2] mb-1">
                            <span>شفافية الخلفية العامة</span>
                            <span className="tabular-nums">
                              {Math.round((settings.siteBackgroundOpacity ?? 0.2) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={65}
                            value={Math.round((settings.siteBackgroundOpacity ?? 0.2) * 100)}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                siteBackgroundOpacity: Number(e.target.value) / 100,
                              })
                            }
                            className="w-full accent-[#D4AF37]"
                          />
                        </div>
                      </div>
                    </section>

                    {/* Left Sidebar Video Rail (Desktop 260x620/460 + Mobile Strip) */}
                    <section className="p-5 rounded-2xl border border-[#D4AF37]/35 bg-[#121216] space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4 text-[#E5C158]" />
                          <div>
                            <h3 className="font-bold text-base text-[#E5C158]">
                              العمود الجانبي لمقاطع الفيديو (يسار الصفحة / شريط الجوال)
                            </h3>
                            <p className="text-[11px] text-[#9E988C]">
                              يعرض الفيديوهات بتشغيل تلقائي صامت مع الصوت عند النقر، ويتحول لشريط أفقي أسفل صفحة الهبوط في الجوال.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.sidebarVideosEnabled !== false}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  sidebarVideosEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>تفعيل وإظهار العمود</span>
                          </label>
                          <button
                            type="submit"
                            disabled={savingSettings}
                            className="btn-gold-wave h-9 px-4 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            حفظ الفيديوهات
                          </button>
                        </div>
                      </div>

                      {/* 3 Videos (460px) vs 4 Videos (620px) */}
                      <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-[#0D0D10]">
                        <span className="text-xs text-[#C5BFB2]">عدد المقاطع وارتفاع العمود:</span>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { count: 4 as const, label: '4 مقاطع فيديو (260 × 620 بكسل)' },
                            { count: 3 as const, label: '3 مقاطع فيديو (260 × 460 بكسل)' },
                          ].map((opt) => {
                            const active = (settings.sidebarVideoCount || 4) === opt.count;
                            return (
                              <button
                                key={opt.count}
                                type="button"
                                onClick={() =>
                                  setSettings({ ...settings, sidebarVideoCount: opt.count })
                                }
                                className={`h-9 px-3.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                                  active
                                    ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                                    : 'border-white/15 bg-[#16161B] text-[#C5BFB2] hover:border-white/30'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 4 Video Slot Editors */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {[0, 1, 2, 3].map((slotIdx) => {
                          const list = settings.sidebarVideos || [];
                          const item = list[slotIdx] || {
                            id: `vid-${slotIdx + 1}`,
                            title: `فيديو عرض ${slotIdx + 1}`,
                            url: '',
                          };
                          const isInactiveFourth =
                            slotIdx === 3 && (settings.sidebarVideoCount || 4) === 3;
                          const uploadKey = `sidebarVideo-${slotIdx}` as
                            | 'sidebarVideo-0'
                            | 'sidebarVideo-1'
                            | 'sidebarVideo-2'
                            | 'sidebarVideo-3';

                          const updateSlot = (patch: { title?: string; url?: string }) => {
                            const nextList = [...(settings.sidebarVideos || [])];
                            while (nextList.length <= 3) {
                              const idx = nextList.length;
                              nextList.push({
                                id: `vid-${idx + 1}`,
                                title: `فيديو عرض ${idx + 1}`,
                                url: '',
                              });
                            }
                            nextList[slotIdx] = { ...nextList[slotIdx], ...patch };
                            setSettings({ ...settings, sidebarVideos: nextList });
                          };

                          return (
                            <div
                              key={item.id || slotIdx}
                              className={`p-3.5 rounded-xl border space-y-2.5 ${
                                isInactiveFourth
                                  ? 'border-white/5 bg-[#0A0A0D] opacity-55'
                                  : 'border-white/10 bg-[#0D0D10]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-[#E5C158]">
                                  الفيديو {slotIdx + 1} (250 × 140 بكسل)
                                </span>
                                {isInactiveFourth && (
                                  <span className="text-[10px] text-[#9E988C]">
                                    مخفي عند وضع 3 مقاطع
                                  </span>
                                )}
                              </div>

                              <input
                                type="text"
                                value={item.title || ''}
                                onChange={(e) => updateSlot({ title: e.target.value })}
                                placeholder={`عنوان قصير للفيديو ${slotIdx + 1} (اختياري)`}
                                className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                              />

                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={item.url || ''}
                                  onChange={(e) => updateSlot({ url: e.target.value })}
                                  placeholder="رابط الفيديو المباشر (.mp4 أو YouTube)"
                                  className="flex-1 h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                                />
                                <label className="h-9 px-3 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] flex items-center gap-1 cursor-pointer shrink-0">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>
                                    {uploadingTarget === uploadKey ? 'جاري...' : 'رفع فيديو'}
                                  </span>
                                  <input
                                    type="file"
                                    accept="video/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleUploadFile(f, uploadKey);
                                    }}
                                  />
                                </label>
                              </div>

                              {item.url && (
                                <div className="flex items-center justify-between gap-3 pt-1">
                                  {item.url.includes('youtube.com') ||
                                  item.url.includes('youtu.be') ? (
                                    <span className="text-[11px] text-emerald-300">
                                      رابط YouTube جاهز للعرض
                                    </span>
                                  ) : (
                                    <video
                                      src={item.url}
                                      muted
                                      autoPlay
                                      loop
                                      playsInline
                                      className="w-[125px] h-[70px] rounded-lg object-cover border border-[#D4AF37]/40 bg-black"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => updateSlot({ url: '' })}
                                    className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer"
                                  >
                                    مسح الرابط
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* Payment, Bank Transfer, Contact, Social & Footer */}
                    <section className="p-5 rounded-2xl border border-white/10 bg-[#121216] space-y-5">
                      <h3 className="font-bold text-base text-[#E5C158]">
                        الدفع (PayPal والتحويل البنكي)، التواصل، وقسم من نحن
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            رقم الواتساب والتواصل العام (مثال: 966504597852 أو 0504597852)
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={settings.whatsappNumber}
                            onChange={(e) =>
                              setSettings({ ...settings, whatsappNumber: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            البريد الإلكتروني للتواصل (اتصل بنا)
                          </label>
                          <input
                            type="email"
                            dir="ltr"
                            value={settings.contactEmail || ''}
                            onChange={(e) =>
                              setSettings({ ...settings, contactEmail: e.target.value })
                            }
                            placeholder="uuuo333@gmail.com"
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">رابط إنستقرام</label>
                          <input
                            type="url"
                            dir="ltr"
                            value={settings.instagramUrl}
                            onChange={(e) =>
                              setSettings({ ...settings, instagramUrl: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">رابط تيك توك</label>
                          <input
                            type="url"
                            dir="ltr"
                            value={settings.tiktokUrl}
                            onChange={(e) =>
                              setSettings({ ...settings, tiktokUrl: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>
                      </div>

                      {/* PayPal Gateway & Credit Cards Settings */}
                      <div className="p-4 rounded-xl border border-[#0070BA]/40 bg-[#0A1624] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-bold text-sky-200">
                            <CreditCard className="w-4 h-4 text-[#38BDF8]" />
                            <span>بوابة الدفع باي بال (PayPal) والبطاقات الائتمانية</span>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                              settings.paypalClientId?.trim()
                                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/35'
                                : 'bg-amber-950/50 text-amber-200 border border-amber-500/35'
                            }`}
                          >
                            {settings.paypalClientId?.trim()
                              ? 'مربوط عبر Client ID وجاهز في السلة'
                              : 'وضع PayPal.me (أدخل Client ID لتفعيل الأزرار الذكية)'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-sky-100 mb-1 font-bold">
                              رمز الربط (PayPal Client ID)
                            </label>
                            <input
                              type="text"
                              dir="ltr"
                              value={settings.paypalClientId || ''}
                              onChange={(e) =>
                                setSettings({ ...settings, paypalClientId: e.target.value })
                              }
                              placeholder="AYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (أو sb للتجربة)"
                              className="w-full h-10 px-3 rounded-xl bg-[#0D1117] border border-sky-400/35 text-sm text-white focus:outline-none focus:border-[#38BDF8]"
                            />
                            <p className="text-[11px] text-sky-200/75 mt-1">
                              أدخل PayPal Client ID من لوحة مطوري باي بال (أو استخدم sb للتجربة) لتظهر أزرار الدفع بباي بال والبطاقات الائتمانية مباشرة في صفحة السلة وإتمام الطلب.
                            </p>
                          </div>

                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              رابط الدفع المباشر PayPal.me
                            </label>
                            <input
                              type="url"
                              dir="ltr"
                              value={settings.paypalMeUrl || ''}
                              onChange={(e) =>
                                setSettings({ ...settings, paypalMeUrl: e.target.value })
                              }
                              placeholder="https://www.paypal.me/yousefAlmohamad931"
                              className="w-full h-10 px-3 rounded-xl bg-[#0D1117] border border-white/15 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              حساب PayPal التجاري (اختياري)
                            </label>
                            <input
                              type="email"
                              dir="ltr"
                              value={settings.paypalBusinessEmail}
                              onChange={(e) =>
                                setSettings({ ...settings, paypalBusinessEmail: e.target.value })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-[#0D1117] border border-white/15 text-sm"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 pt-1">
                          <label className="flex items-center gap-2 text-xs text-sky-100 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.paypalButtonsEnabled !== false}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  paypalButtonsEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>تفعيل أزرار الدفع بباي بال (PayPal) في السلة وإتمام الطلب</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs text-sky-100 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.paypalCardEnabled !== false}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  paypalCardEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>تفعيل الدفع بالبطاقات الائتمانية (Visa / Mastercard)</span>
                          </label>
                        </div>
                      </div>

                      {/* Bank Transfer Settings */}
                      <div className="p-4 rounded-xl border border-[#D4AF37]/25 bg-[#0D0D10] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                            <Landmark className="w-4 h-4" />
                            <span>إعدادات التحويل البنكي (الاسم والبنك والآيبان)</span>
                          </div>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.bankTransferEnabled !== false}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  bankTransferEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>تفعيل التحويل البنكي للعملاء</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              الاسم (اسم صاحب الحساب البنكي)
                            </label>
                            <input
                              type="text"
                              value={settings.bankAccountHolder || ''}
                              onChange={(e) =>
                                setSettings({ ...settings, bankAccountHolder: e.target.value })
                              }
                              placeholder="اسم المستفيد الكامل"
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              البنك (اسم البنك)
                            </label>
                            <input
                              type="text"
                              value={settings.bankName || ''}
                              onChange={(e) =>
                                setSettings({ ...settings, bankName: e.target.value })
                              }
                              placeholder="مثال: مصرف الراجحي"
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              رقم الآيبان (IBAN)
                            </label>
                            <input
                              type="text"
                              dir="ltr"
                              value={settings.bankIban || ''}
                              onChange={(e) =>
                                setSettings({ ...settings, bankIban: e.target.value })
                              }
                              placeholder="SA0000000000000000000000"
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              رقم الحساب البنكي (اختياري)
                            </label>
                            <input
                              type="text"
                              dir="ltr"
                              value={settings.bankAccountNumber || ''}
                              onChange={(e) =>
                                setSettings({ ...settings, bankAccountNumber: e.target.value })
                              }
                              placeholder="رقم الحساب"
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Shipping Carriers & Badges Settings */}
                      <div className="p-4 rounded-xl border border-[#D4AF37]/25 bg-[#0D0D10] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                            <Truck className="w-4 h-4" />
                            <span>شعارات وشركات الشحن المعتمدة (زاجل، سبل، وجميع الشركات)</span>
                          </div>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.showShippingLogos !== false}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  showShippingLogos: e.target.checked,
                                })
                              }
                            />
                            <span>عرض شعارات شركات الشحن في واجهة المتجر</span>
                          </label>
                        </div>
                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            قائمة شركات الشحن المتاحة للعملاء (شركة في كل سطر)
                          </label>
                          <textarea
                            rows={4}
                            value={(settings.shippingCarriers || []).join('\n')}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                shippingCarriers: e.target.value
                                  .split('\n')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="زاجل (Zajil)&#10;سبل - البريد السعودي (SPL)&#10;أرامكس (Aramex)"
                            className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                          />
                        </div>
                      </div>

                      {/* Homepage Animated Group Chat Editor */}
                      <div className="p-4 rounded-xl border border-[#D4AF37]/30 bg-[#0D0D10] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                            <MessageCircle className="w-4 h-4" />
                            <span>المحادثة الجماعية المتحركة في الرئيسية (تجارب الملاك والخبراء)</span>
                          </div>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.groupChatEnabled !== false}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  groupChatEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>عرض قسم المحادثة الجماعية في الصفحة الرئيسية</span>
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            عنوان قسم المحادثة الجماعية
                          </label>
                          <input
                            type="text"
                            value={settings.groupChatTitle ?? DEFAULT_GROUP_CHAT_TITLE}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                groupChatTitle: e.target.value,
                              })
                            }
                            placeholder={DEFAULT_GROUP_CHAT_TITLE}
                            className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>

                        <div className="space-y-3">
                          {(settings.groupChatMessages && settings.groupChatMessages.length > 0
                            ? settings.groupChatMessages
                            : DEFAULT_GROUP_CHAT_MESSAGES
                          ).map((msg, idx) => {
                            const currentList =
                              settings.groupChatMessages && settings.groupChatMessages.length > 0
                                ? settings.groupChatMessages
                                : DEFAULT_GROUP_CHAT_MESSAGES;
                            const updateItem = (patch: Partial<GroupChatMessage>) => {
                              const next = currentList.map((item, i) =>
                                i === idx ? { ...item, ...patch } : item
                              );
                              setSettings({ ...settings, groupChatMessages: next });
                            };
                            const removeItem = () => {
                              const next = currentList.filter((_, i) => i !== idx);
                              setSettings({ ...settings, groupChatMessages: next });
                            };

                            return (
                              <div
                                key={msg.id || idx}
                                className="p-3 rounded-xl border border-white/10 bg-[#141419] space-y-2.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-[#E5C158]">
                                    الرسالة #{idx + 1}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={removeItem}
                                    disabled={currentList.length <= 1}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-400/25 text-[11px] text-red-300 disabled:opacity-40"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>حذف</span>
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                  <div>
                                    <label className="block text-[11px] text-[#9E988C] mb-1">
                                      الاسم المعروض
                                    </label>
                                    <input
                                      type="text"
                                      value={msg.senderName}
                                      onChange={(e) => updateItem({ senderName: e.target.value })}
                                      placeholder="مثال: خالد (صاحب هوندا)"
                                      className="w-full h-9 px-3 rounded-lg bg-[#1A1A20] border border-white/15 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-[#9E988C] mb-1">
                                      الصفة / اللقب
                                    </label>
                                    <input
                                      type="text"
                                      value={msg.roleTag || ''}
                                      onChange={(e) => updateItem({ roleTag: e.target.value })}
                                      placeholder="مثال: مالك سيارة / مهندس فحص"
                                      className="w-full h-9 px-3 rounded-lg bg-[#1A1A20] border border-white/15 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-[#9E988C] mb-1">
                                      نمط اللون والشارة
                                    </label>
                                    <select
                                      value={msg.accent || 'owner_car'}
                                      onChange={(e) =>
                                        updateItem({
                                          accent: e.target.value as GroupChatMessage['accent'],
                                        })
                                      }
                                      className="w-full h-9 px-3 rounded-lg bg-[#1A1A20] border border-white/15 text-xs"
                                    >
                                      <option value="owner_car">مالك سيارة</option>
                                      <option value="engineer">مهندس فحص وتشخيص</option>
                                      <option value="master">معلم وخبير تركيب</option>
                                      <option value="manager">المدير (تاج ذهبي)</option>
                                    </select>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[11px] text-[#9E988C] mb-1">
                                    نص الرسالة
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={msg.message}
                                    onChange={(e) => updateItem({ message: e.target.value })}
                                    className="w-full p-2.5 rounded-lg bg-[#1A1A20] border border-white/15 text-xs leading-relaxed"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const current =
                                  settings.groupChatMessages && settings.groupChatMessages.length > 0
                                    ? settings.groupChatMessages
                                    : DEFAULT_GROUP_CHAT_MESSAGES;
                                setSettings({
                                  ...settings,
                                  groupChatMessages: [
                                    ...current,
                                    {
                                      id: `gc-${Date.now()}`,
                                      senderName: 'عميل جديد',
                                      roleTag: 'مالك سيارة',
                                      accent: 'owner_car',
                                      message: '',
                                    },
                                  ],
                                });
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-xs font-bold text-[#E5C158]"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>إضافة رسالة جديدة</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setSettings({
                                  ...settings,
                                  groupChatTitle: DEFAULT_GROUP_CHAT_TITLE,
                                  groupChatMessages: DEFAULT_GROUP_CHAT_MESSAGES.map((m) => ({
                                    ...m,
                                  })),
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#C5BFB2]"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>استعادة الحوار الافتراضي</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={savingSettings}
                            onClick={() =>
                              void persistSettingsObject(
                                settings,
                                'تم حفظ وتحديث المحادثة الجماعية في الصفحة الرئيسية بنجاح.'
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B8941F] text-black text-xs font-black hover:brightness-110 disabled:opacity-60"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>حفظ تعديلات المحادثة فوراً</span>
                          </button>
                        </div>
                      </div>

                      {/* Golden Coins Loyalty & Rewards System */}
                      <div className="p-4 rounded-xl border border-[#D4AF37]/30 bg-[#0D0D10] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                            <Coins className="w-4 h-4" />
                            <span>نظام العملات الذهبية (نقاط الولاء والمكافآت)</span>
                          </div>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.loyaltyEnabled !== false}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  loyaltyEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>تفعيل نظام العملات الذهبية للعملاء</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              قيمة النقطة الواحدة بالريال (SAR)
                            </label>
                            <input
                              type="number"
                              min={0.01}
                              step={0.05}
                              value={settings.coinValueSar ?? 0.1}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  coinValueSar: Number(e.target.value),
                                })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              نقاط تسجيل الدخول اليومي
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={settings.dailyCheckinCoins ?? 25}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  dailyCheckinCoins: Number(e.target.value),
                                })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              نقاط كل 100 ريال مشتريات
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={settings.coinsPer100SarPurchase ?? 50}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  coinsPer100SarPurchase: Number(e.target.value),
                                })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              نقاط مشاركة المنتج
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={settings.coinsPerProductShare ?? 15}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  coinsPerProductShare: Number(e.target.value),
                                })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm tabular-nums"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-[#9E988C]">
                          يمكنك أيضاً تعديل رصيد العملات الذهبية لأي عميل مسجل مباشرة من تبويب "نظرة عامة" ← جدول العملاء المسجلون.
                        </p>
                      </div>

                      {/* Ehsan & Charity Popup Settings */}
                      <div className="p-4 rounded-xl border border-emerald-500/30 bg-[#0D0D10] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                            <HeartHandshake className="w-4 h-4 text-emerald-400" />
                            <span>إحسان والجمعيات الخيرية وإشعار الصدقة المنبثق</span>
                          </div>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.charityPopupEnabled !== false}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  charityPopupEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>تفعيل إشعار التذكير بالصدقة في زاوية الشاشة</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              العبارة التشجيعية في الإشعار
                            </label>
                            <input
                              type="text"
                              value={settings.charityPopupTitle || ''}
                              onChange={(e) =>
                                setSettings({ ...settings, charityPopupTitle: e.target.value })
                              }
                              placeholder="تصدق ولو بالقليل.. واجعل تجارتك مباركة"
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#C5BFB2] mb-1">
                              رابط التبرع الرسمي (منصة إحسان)
                            </label>
                            <input
                              type="url"
                              dir="ltr"
                              value={settings.charityUrl || 'https://ehsan.sa'}
                              onChange={(e) =>
                                setSettings({ ...settings, charityUrl: e.target.value })
                              }
                              placeholder="https://ehsan.sa"
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-[#C5BFB2] mb-1">
                            الآية القرآنية عن الصدقة
                          </label>
                          <textarea
                            rows={2}
                            value={settings.charityPopupVerse || ''}
                            onChange={(e) =>
                              setSettings({ ...settings, charityPopupVerse: e.target.value })
                            }
                            placeholder="﴿ مَّثَلُ الَّذِينَ يُنفِقُونَ أَمْوَالَهُمْ فِي سَبِيلِ اللَّهِ كَمَثَلِ حَبَّةٍ أَنبَتَتْ سَبْعَ سَنَابِلَ فِي كُلِّ سُنبُلَةٍ مِّائَةُ حَبَّةٍ ۗ وَاللَّهُ يُضَاعِفُ لِمَن يَشَاءُ ﴾ [البقرة: 261]"
                            className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                          />
                        </div>
                      </div>

                      {/* Bilingual Language, Gulf Multi-Currency, Wholesale/Retail Pricing & Installments */}
                      <div className="p-4 rounded-xl border border-[#D4AF37]/30 bg-[#0D0D10] space-y-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                          <Languages className="w-4 h-4" />
                          <span>اللغة الإنجليزية، عملات الخليج، تسعير الجملة/التجزئة، والتقسيط</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                          <label className="flex items-center gap-2 p-2.5 rounded-lg border border-white/10 bg-[#16161B] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.allowLanguageSwitch !== false}
                              onChange={(e) =>
                                setSettings({ ...settings, allowLanguageSwitch: e.target.checked })
                              }
                            />
                            <span>إظهار زر تبديل العربية / الإنجليزية للعملاء</span>
                          </label>

                          <label className="flex items-center gap-2 p-2.5 rounded-lg border border-white/10 bg-[#16161B] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.multiCurrencyEnabled !== false}
                              onChange={(e) =>
                                setSettings({ ...settings, multiCurrencyEnabled: e.target.checked })
                              }
                            />
                            <span>تفعيل محول عملات دول الخليج</span>
                          </label>

                          <label className="flex items-center gap-2 p-2.5 rounded-lg border border-white/10 bg-[#16161B] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.installmentsEnabled !== false}
                              onChange={(e) =>
                                setSettings({ ...settings, installmentsEnabled: e.target.checked })
                              }
                            />
                            <span>عرض خيار التقسيط (تمارا وتابي 4 دفعات)</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block text-[#C5BFB2] mb-1">
                              اللغة الافتراضية للمتجر عند الفتح
                            </label>
                            <select
                              value={settings.defaultLanguage || 'ar'}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  defaultLanguage: e.target.value as 'ar' | 'en',
                                })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15"
                            >
                              <option value="ar">العربية (RTL)</option>
                              <option value="en">الإنجليزية (English LTR)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[#C5BFB2] mb-1">
                              وضع عرض الأسعار في المتجر
                            </label>
                            <select
                              value={settings.priceDisplayMode || 'retail'}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  priceDisplayMode: e.target.value as 'retail' | 'wholesale',
                                })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15"
                            >
                              <option value="retail">سعر التجزئة (للأفراد)</option>
                              <option value="wholesale">سعر الجملة (للتجار والورش)</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                          {(['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR'] as CurrencyCode[]).map(
                            (code) => (
                              <div key={code}>
                                <label className="block text-[10px] text-[#9E988C] mb-1">
                                  سعر {code} مقابل 1 ر.س
                                </label>
                                <input
                                  type="number"
                                  step="0.001"
                                  dir="ltr"
                                  value={
                                    settings.currencyRates?.[code] ?? DEFAULT_CURRENCY_RATES[code]
                                  }
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      currencyRates: {
                                        ...DEFAULT_CURRENCY_RATES,
                                        ...(settings.currencyRates || {}),
                                        [code]: Number(e.target.value),
                                      },
                                    })
                                  }
                                  className="w-full h-8 px-2 rounded-lg bg-[#16161B] border border-white/15 text-xs tabular-nums"
                                />
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      {/* 4-Character Store Promo Discount Codes Manager */}
                      <div className="p-4 rounded-xl border border-[#D4AF37]/30 bg-[#0D0D10] space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                          <Ticket className="w-4 h-4" />
                          <span>أكواد الخصم للمتجر (4 خانات فقط مثل TAJ5)</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <input
                            type="text"
                            dir="ltr"
                            maxLength={4}
                            value={newPromoCode}
                            onChange={(e) => setNewPromoCode(e.target.value.toUpperCase().slice(0, 4))}
                            placeholder="TAJ5"
                            className="sm:col-span-3 h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-xs font-bold text-center tracking-widest uppercase"
                          />
                          <select
                            value={newPromoType}
                            onChange={(e) => setNewPromoType(e.target.value as 'percent' | 'fixed')}
                            className="sm:col-span-4 h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                          >
                            <option value="percent">نسبة مئوية (%)</option>
                            <option value="fixed">مبلغ ثابت بالريال (ر.س)</option>
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={newPromoValue}
                            onChange={(e) => setNewPromoValue(e.target.value)}
                            placeholder="القيمة"
                            className="sm:col-span-2 h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-xs tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const clean = newPromoCode.trim().toUpperCase();
                              if (clean.length !== 4) {
                                showToast('يجب أن يتكون كود الخصم من 4 خانات بالضبط.');
                                return;
                              }
                              const val = Number(newPromoValue) || 0;
                              if (val <= 0) {
                                showToast('يرجى إدخال قيمة خصم أكبر من صفر.');
                                return;
                              }
                              const existing = settings.promoDiscountCodes || [];
                              if (existing.some((p) => p.code.toUpperCase() === clean)) {
                                showToast('يوجد كود بنفس الاسم مسبقاً.');
                                return;
                              }
                              const item: PromoDiscountCode = {
                                id: `promo-${Date.now().toString(36)}`,
                                code: clean,
                                discountType: newPromoType,
                                discountValue: val,
                                isActive: true,
                                usageCount: 0,
                                createdAt: new Date().toISOString(),
                              };
                              setSettings({
                                ...settings,
                                promoDiscountCodes: [item, ...existing],
                              });
                              setNewPromoCode('');
                              showToast(`تمت إضافة الكود ${clean}! اضغط "حفظ جميع إعدادات المتجر والثيم".`);
                            }}
                            className="sm:col-span-3 h-9 px-3 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>إضافة كود</span>
                          </button>
                        </div>

                        {(settings.promoDiscountCodes || []).length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {(settings.promoDiscountCodes || []).map((pc) => (
                              <div
                                key={pc.id}
                                className="px-3 py-2 rounded-lg border border-white/10 bg-[#16161B] flex items-center justify-between gap-2 text-xs"
                              >
                                <div>
                                  <span className="font-bold text-[#E5C158] font-mono" dir="ltr">
                                    {pc.code}
                                  </span>{' '}
                                  <span className="text-[#C5BFB2]">
                                    ({pc.discountType === 'percent' ? `${pc.discountValue}%` : `${pc.discountValue} ر.س`})
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSettings({
                                        ...settings,
                                        promoDiscountCodes: (settings.promoDiscountCodes || []).map(
                                          (x) => (x.id === pc.id ? { ...x, isActive: !x.isActive } : x)
                                        ),
                                      })
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                      pc.isActive
                                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-white/5 text-[#9E988C]'
                                    }`}
                                  >
                                    {pc.isActive ? 'فعال' : 'معطل'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSettings({
                                        ...settings,
                                        promoDiscountCodes: (settings.promoDiscountCodes || []).filter(
                                          (x) => x.id !== pc.id
                                        ),
                                      })
                                    }
                                    className="text-red-400 hover:text-red-300 cursor-pointer"
                                    aria-label="حذف الكود"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Site Open / Close Details */}
                      <div className="p-4 rounded-xl border border-white/10 bg-[#0D0D10] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#E5C158]">
                            إعدادات فتح وإغلاق الموقع للزوار
                          </span>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.storeOpen !== false}
                              onChange={(e) =>
                                setSettings({ ...settings, storeOpen: e.target.checked })
                              }
                            />
                            <span>الموقع مفتوح للعملاء حالياً</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <input
                            type="text"
                            value={settings.storeClosedTitle || ''}
                            onChange={(e) =>
                              setSettings({ ...settings, storeClosedTitle: e.target.value })
                            }
                            placeholder="عنوان صفحة الإغلاق"
                            className="h-9 px-3 rounded-lg bg-[#16161B] border border-white/15"
                          />
                          <input
                            type="text"
                            value={settings.storeClosedMessage || ''}
                            onChange={(e) =>
                              setSettings({ ...settings, storeClosedMessage: e.target.value })
                            }
                            placeholder="رسالة الصيانة للعملاء"
                            className="h-9 px-3 rounded-lg bg-[#16161B] border border-white/15"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-[#C5BFB2] mb-1">
                          نص "من نحن" أسفل الصفحة
                        </label>
                        <textarea
                          rows={3}
                          value={settings.aboutUsText}
                          onChange={(e) =>
                            setSettings({ ...settings, aboutUsText: e.target.value })
                          }
                          className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                        />
                      </div>
                    </section>

                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="btn-gold-wave h-11 px-8 rounded-xl text-sm cursor-pointer"
                    >
                      {savingSettings ? 'جاري الحفظ...' : 'حفظ جميع إعدادات المتجر والثيم'}
                    </button>
                  </form>

                  {/* Owner Password Update (Saved to localStorage for next login) */}
                  <form
                    onSubmit={handleChangePassword}
                    className="p-5 rounded-2xl border border-[#D4AF37]/30 bg-[#121216] space-y-4"
                  >
                    <div className="flex items-center gap-2 text-[#E5C158]">
                      <KeyRound className="w-4 h-4" />
                      <div>
                        <h3 className="font-bold text-base">تغيير كلمة مرور بوابة المالك</h3>
                        <p className="text-[11px] text-[#9E988C]">
                          تُحفظ كلمة المرور الجديدة مباشرة في المتصفح (localStorage) لاستخدامها عند تسجيل الدخول القادم.
                        </p>
                      </div>
                    </div>
                    {pwNotice && (
                      <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30 text-emerald-200 text-xs">
                        {pwNotice}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input
                        type="password"
                        required
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        placeholder="كلمة المرور الحالية"
                        className="h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                      />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
                        className="h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        className="btn-gold-wave h-10 px-5 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        حفظ كلمة المرور الجديدة
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await adminFetch('/api/admin/change-password', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                currentPassword: currentPw || getStoredOwnerPassword(),
                                newPassword: DEFAULT_OWNER_PASSWORD,
                              }),
                            });
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              showToast(
                                data?.error || 'تعذر إعادة التعيين عبر الخادم. تحقق من كلمة المرور الحالية.'
                              );
                              return;
                            }
                          } catch {
                            showToast('تعذر الاتصال بالخادم لتحديث كلمة المرور.');
                            return;
                          }
                          try {
                            localStorage.setItem('taj_owner_secret', DEFAULT_OWNER_PASSWORD);
                          } catch {
                            // ignore
                          }
                          setPwNotice(
                            `تمت إعادة تعيين كلمة المرور إلى الافتراضية (${DEFAULT_OWNER_PASSWORD}).`
                          );
                          showToast('تمت إعادة تعيين كلمة مرور المالك للافتراضية.');
                        }}
                        className="h-10 px-4 rounded-xl border border-amber-500/40 bg-amber-950/20 hover:bg-amber-950/40 text-xs font-bold text-amber-300 cursor-pointer"
                      >
                        إعادة التعيين للافتراضية ({DEFAULT_OWNER_PASSWORD})
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Product Editor Modal */}
      {editingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto"
          onClick={() => setEditingProduct(null)}
        >
          <form
            onSubmit={handleSaveProduct}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-2xl border border-[#D4AF37]/35 bg-[#121216] p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#E5C158]">
                {editingProduct.id ? 'تعديل بيانات المنتج' : 'إضافة منتج جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* AI Product Importer: Method 1 (URL via CORS Proxy) + Method 2 (Manual Paste Fallback) */}
            <div className="p-4 rounded-2xl border border-[#D4AF37]/45 bg-gradient-to-br from-[#17140D] to-[#111116] space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#E5C158]">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-[#E5C158]">
                      استيراد بيانات المنتج بالذكاء الاصطناعي (AI Product Importer)
                    </div>
                    <div className="text-[11px] text-[#B8B0A0]">
                      استورد البيانات بالرابط مباشرة أو الصق نص صفحة المنتج للمتاجر المحمية ليتم تحليلها وتعبئة الحقول فوراً.
                    </div>
                  </div>
                </div>
                {firebaseUser?.emailVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-500/35 text-[11px] text-emerald-300">
                    <Database className="w-3.5 h-3.5" />
                    <span>مربوط مع Firebase ({firebaseUser.email})</span>
                  </span>
                ) : (
                  <GoogleSignInButton
                    onClick={handleQuickGoogleConnectForFirebase}
                    disabled={connectingFirebase}
                    label={connectingFirebase ? 'جاري الربط...' : 'ربط Firebase لحفظ المنتج سحابياً'}
                    className="!h-8 !px-3 !text-[11px]"
                  />
                )}
              </div>

              {/* Method 1: Import from URL */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-[#E5C158]/90 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  <span>الطريقة الأولى: الاستيراد من رابط خارجي</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    dir="ltr"
                    value={modalImportUrl}
                    onChange={(e) => setModalImportUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!importingFromUrl && !importingFromText) {
                          void handleImportProductFromUrlInModal();
                        }
                      }
                    }}
                    placeholder="https://example-store.com/product-page"
                    className="flex-1 h-10 px-3 rounded-xl bg-[#0B0B0F] border border-[#D4AF37]/30 text-xs sm:text-sm text-white placeholder:text-white/35 focus:border-[#E5C158] outline-none"
                  />
                  <button
                    type="button"
                    disabled={importingFromUrl || importingFromText}
                    onClick={handleImportProductFromUrlInModal}
                    className="btn-gold-wave h-10 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    {importingFromUrl ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    <span>
                      {importingFromUrl ? 'جاري الجلب...' : 'جلب البيانات من الرابط'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Yellow Warning Banner when external store is protected */}
              {importUrlWarning && (
                <div className="flex items-start gap-2.5 text-xs text-amber-200 bg-amber-950/45 border border-amber-400/50 rounded-xl px-3.5 py-2.5 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{importUrlWarning}</span>
                </div>
              )}

              {/* Method 2: Manual Paste Fallback for Protected Sites */}
              <div className="pt-1 border-t border-white/10 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowManualPasteBox((v) => !v)}
                  className="text-xs font-bold text-[#E5C158] hover:text-[#F3D77A] flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>
                    الطريقة الثانية: أو الصق تفاصيل/نص صفحة المنتج هنا (Paste Product Text)
                  </span>
                  <span className="text-[10px] text-[#9E988C] font-normal">
                    {showManualPasteBox ? '▲ إخفاء' : '▼ فتح المربع'}
                  </span>
                </button>

                {showManualPasteBox && (
                  <div className="space-y-2 pt-1">
                    <textarea
                      rows={4}
                      value={modalManualText}
                      onChange={(e) => setModalManualText(e.target.value)}
                      placeholder="انسخ اسم المنتج ووصفه وسعره وأي مواصفات أو روابط صور من أمازون أو علي إكسبريس أو أي متجر محمي والصقه هنا..."
                      className="w-full p-3 rounded-xl bg-[#0B0B0F] border border-[#D4AF37]/30 text-xs sm:text-sm text-white placeholder:text-white/35 focus:border-[#E5C158] outline-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#9E988C]">
                        سيقوم Gemini AI بصياغة الاسم والوصف بالعربية واستخراج السعر والقسم والصور تلقائياً.
                      </span>
                      <button
                        type="button"
                        disabled={importingFromText || importingFromUrl}
                        onClick={handleAnalyzeManualProductText}
                        className="h-9 px-4 rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-xs font-bold text-[#E5C158] flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-60"
                      >
                        {importingFromText ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {importingFromText ? 'جاري التحليل...' : 'تحليل وتعبئة البيانات'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {(importingFromUrl || importingFromText) && importUrlStatus && (
                <div className="flex items-center gap-2 text-xs text-sky-300 bg-sky-950/30 border border-sky-500/25 rounded-xl px-3 py-2">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{importUrlStatus}</span>
                </div>
              )}

              {!importingFromUrl && !importingFromText && importUrlStatus && !importUrlError && !importUrlWarning && (
                <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/25 rounded-xl px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{importUrlStatus}</span>
                </div>
              )}

              {importUrlError && (
                <div className="text-xs text-red-300 bg-red-950/35 border border-red-500/30 rounded-xl px-3 py-2">
                  {importUrlError}
                </div>
              )}

              {editingProduct.originalExtractedPrice && (
                <div className="text-[11px] text-[#E5C158]/90">
                  السعر الأصلي المكتشف في المصدر: {editingProduct.originalExtractedPrice} — يمكنك تعديل السعر النهائي بالريال أدناه قبل الحفظ.
                </div>
              )}
            </div>

            {editingProduct.sourceUrl && (
              <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-950/20 text-xs text-sky-300 break-all">
                رابط المصدر الأصلي (سري للمالك فقط): {editingProduct.sourceUrl}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[#D4AF37]/30 bg-[#14120E]">
                <div className="text-xs text-[#C5BFB2]">
                  أدوات الذكاء الاصطناعي والترجمة وتجميل المنتج:
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={enhancingProductCopy}
                    onClick={handleEnhanceProductCopyWithAi}
                    className="px-3 py-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>
                      {enhancingProductCopy
                        ? 'جاري التحسين...'
                        : 'كتابة اسم ووصف جذاب بالذكاء الاصطناعي'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={translatingProduct}
                    onClick={handleTranslateProductWithAi}
                    className="px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-950/30 text-xs text-sky-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Languages className="w-3.5 h-3.5" />
                    <span>
                      {translatingProduct
                        ? 'جاري الترجمة...'
                        : 'ترجمة تلقائية للإنجليزية (AI)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStudioTarget({
                        productId: editingProduct.id,
                        fromEditorModal: true,
                        imageUrl: (editingProduct.images || [])[0] || '',
                        name: editingProduct.name || 'منتج جديد',
                        category: editingProduct.category || 'دبات تلوث البنزين',
                        priceSar: editingProduct.priceSar,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-xs text-emerald-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>تحسين الصورة في الاستوديو</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#C5BFB2] mb-1">اسم المنتج (عربي)</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#C5BFB2] mb-1">
                  اسم المنتج بالإنجليزية (English Name)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editingProduct.nameEn || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, nameEn: e.target.value })}
                  placeholder="Auto-filled or custom English title"
                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#C5BFB2] mb-1">رقم كود المنتج (SKU)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={editingProduct.sku || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                  placeholder="TAJ-101"
                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-[#C5BFB2] mb-1">القسم</label>
                <input
                  type="text"
                  required
                  list="store-categories-datalist"
                  value={editingProduct.category || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, category: e.target.value })
                  }
                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                />
                <datalist id="store-categories-datalist">
                  {(settings?.categories || []).map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              {/* Profit Margin + Cost + Retail + Wholesale Auto-Calculator */}
              <div className="sm:col-span-2 p-3.5 rounded-xl border border-[#D4AF37]/25 bg-[#0D0D10] grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                <div>
                  <label className="block text-[#9E988C] mb-1">التكلفة (ر.س)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingProduct.costPriceSar ?? ''}
                    onChange={(e) => {
                      const cost = Number(e.target.value) || 0;
                      const margin = Number(editingProduct.profitMarginPercent) || 0;
                      const nextRetail =
                        margin > 0 && cost > 0
                          ? Math.round(cost * (1 + margin / 100))
                          : editingProduct.priceSar || 0;
                      setEditingProduct({
                        ...editingProduct,
                        costPriceSar: cost,
                        priceSar: nextRetail,
                      });
                    }}
                    className="w-full h-9 px-2.5 rounded-lg bg-[#16161B] border border-white/15 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[#9E988C] mb-1">هامش الربح (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={editingProduct.profitMarginPercent ?? ''}
                    onChange={(e) => {
                      const margin = Number(e.target.value) || 0;
                      const cost = Number(editingProduct.costPriceSar) || 0;
                      const nextRetail =
                        cost > 0 ? Math.round(cost * (1 + margin / 100)) : editingProduct.priceSar || 0;
                      setEditingProduct({
                        ...editingProduct,
                        profitMarginPercent: margin,
                        priceSar: nextRetail,
                      });
                    }}
                    className="w-full h-9 px-2.5 rounded-lg bg-[#16161B] border border-white/15 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[#E5C158] font-bold mb-1">سعر البيع (ر.س) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editingProduct.priceSar || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, priceSar: Number(e.target.value) })
                    }
                    className="w-full h-9 px-2.5 rounded-lg bg-[#16161B] border border-[#D4AF37]/50 font-bold text-[#E5C158] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[#9E988C] mb-1">سعر الجملة (ر.س)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingProduct.wholesalePriceSar ?? ''}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        wholesalePriceSar: Number(e.target.value) || undefined,
                      })
                    }
                    className="w-full h-9 px-2.5 rounded-lg bg-[#16161B] border border-white/15 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[#9E988C] mb-1">توفير الوقود (%)</label>
                  <input
                    type="number"
                    min={5}
                    max={35}
                    value={editingProduct.fuelEfficiencyGainPercent ?? 14}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        fuelEfficiencyGainPercent: Number(e.target.value) || 14,
                      })
                    }
                    className="w-full h-9 px-2.5 rounded-lg bg-[#16161B] border border-white/15 tabular-nums"
                  />
                </div>
              </div>

              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">الوصف الكامل (عربي)</label>
                  <textarea
                    rows={3}
                    value={editingProduct.description || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, description: e.target.value })
                    }
                    className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">
                    الوصف بالإنجليزية (English Description)
                  </label>
                  <textarea
                    rows={3}
                    dir="ltr"
                    value={editingProduct.descriptionEn || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, descriptionEn: e.target.value })
                    }
                    placeholder="English product description..."
                    className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-sm"
                  />
                </div>
              </div>

              {/* Product Images: Multi-File Device Upload (Auto-Cropped 1000x1000) + Thumbnails w/ X Delete + Text URL Box */}
              <div className="sm:col-span-2 p-4 rounded-xl border border-[#D4AF37]/30 bg-[#0D0D10] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-[#E5C158]">
                      صور المنتج وروابط الصور (قص تلقائي 1000 × 1000 بكسل)
                    </div>
                    <div className="text-[11px] text-[#9E988C]">
                      يمكنك رفع صورة من جهازك مع أداة قص وضبط مقاس الصورة تلقائياً إلى مربع (1000 ×
                      1000 بكسل) أو وضع رابط الصورة مباشرة بالأسفل.
                    </div>
                  </div>
                  <label className="btn-gold-wave h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0">
                    <Upload className="w-4 h-4" />
                    <span>
                      {uploadingProductImages
                        ? 'جاري الرفع والضبط...'
                        : 'رفع صور من الجهاز (قص تلقائي 1000×1000)'}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleProductMultiImageUpload(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {/* Uploaded / Added Images Thumbnails with (X) Delete Button */}
                {(editingProduct.images || []).filter((s) => s.trim().length > 0).length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 pt-1">
                    {(editingProduct.images || []).map((imgUrl, imgIdx) => {
                      if (!imgUrl || !imgUrl.trim()) return null;
                      return (
                        <div
                          key={imgIdx}
                          className="relative aspect-square rounded-xl border border-white/15 bg-[#0B0B0F] p-1 overflow-hidden group"
                        >
                          <ResilientImage
                            src={imgUrl}
                            alt={`صورة ${imgIdx + 1}`}
                            className="w-full h-full object-contain rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveEditingImage(imgIdx)}
                            title="حذف الصورة"
                            aria-label="حذف الصورة"
                            className="absolute top-1 end-1 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-md cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-[#C5BFB2] mb-1">
                    روابط الصور (رابط في كل سطر — متاح لإضافة روابط خارجية بجانب الصور المرفوعة)
                  </label>
                  <textarea
                    rows={2}
                    dir="ltr"
                    value={(editingProduct.images || []).join('\n')}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        images: e.target.value.split('\n').map((s) => s.trim()),
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-[#16161B] border border-white/15 text-xs"
                  />
                </div>
              </div>

              {/* Installation & Compatibility Guide (PDF + Images) */}
              <div className="sm:col-span-2 p-4 rounded-xl border border-white/10 bg-[#0D0D10] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#E5C158]">
                  <FileText className="w-4 h-4" />
                  <span>دليل التوافق والتركيب (ملف PDF أو صور خطوات التركيب)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={editingProduct.installationGuidePdfUrl || ''}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        installationGuidePdfUrl: e.target.value,
                      })
                    }
                    placeholder="رابط دليل التركيب PDF أو ارفع ملفاً"
                    className="flex-1 h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                  />
                  <label className="h-9 px-3 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] flex items-center gap-1 cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingTarget === 'guidePdf' ? '...' : 'رفع PDF'}</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadFile(f, 'guidePdf');
                      }}
                    />
                  </label>
                  <label className="h-9 px-3 rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-xs text-emerald-300 flex items-center gap-1 cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingTarget === 'guideImage' ? '...' : '+ صورة تركيب'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadFile(f, 'guideImage');
                      }}
                    />
                  </label>
                </div>

                {(editingProduct.installationGuideImages || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(editingProduct.installationGuideImages || []).map((gImg, gi) => (
                      <div
                        key={gi}
                        className="relative w-16 h-16 rounded-lg border border-white/15 bg-[#0B0B0F] p-1 overflow-hidden"
                      >
                        <ResilientImage
                          src={gImg}
                          alt={`دليل ${gi + 1}`}
                          className="w-full h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditingProduct({
                              ...editingProduct,
                              installationGuideImages: (
                                editingProduct.installationGuideImages || []
                              ).filter((_, i) => i !== gi),
                            })
                          }
                          className="absolute top-0.5 end-0.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-[#C5BFB2]">المواصفات الفنية</label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingProduct({
                        ...editingProduct,
                        specs: [...(editingProduct.specs || []), { label: '', value: '' }],
                      })
                    }
                    className="text-xs text-[#E5C158] cursor-pointer"
                  >
                    + إضافة مواصفة
                  </button>
                </div>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {(editingProduct.specs || []).map((sp: ProductSpec, idx: number) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="المواصفة"
                        value={sp.label}
                        onChange={(e) => {
                          const next = [...(editingProduct.specs || [])];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setEditingProduct({ ...editingProduct, specs: next });
                        }}
                        className="flex-1 h-9 px-2.5 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="القيمة"
                        value={sp.value}
                        onChange={(e) => {
                          const next = [...(editingProduct.specs || [])];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setEditingProduct({ ...editingProduct, specs: next });
                        }}
                        className="flex-1 h-9 px-2.5 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {/* Product SEO Keywords (up to 15) */}
              <div className="sm:col-span-2 p-4 rounded-xl border border-[#D4AF37]/30 bg-[#0D0D10] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#E5C158]">
                    <Tags className="w-4 h-4" />
                    <span>الكلمات المفتاحية للبحث - SEO Keywords</span>
                  </div>
                  <span className="text-[11px] font-bold text-[#E5C158] tabular-nums">
                    {parseSeoKeywordsText(productSeoKeywordsInput).length} / 15
                  </span>
                </div>
                <input
                  type="text"
                  value={productSeoKeywordsInput}
                  onChange={(e) => setProductSeoKeywordsInput(e.target.value)}
                  placeholder="أدخل حتى 15 كلمة أو عبارة مفصولة بفاصلة (مثال: دبة تلوث تويوتا، فلتر بيئة DPF، دبة عادم Euro 6)"
                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs focus:outline-none focus:border-[#D4AF37]"
                />
                {parseSeoKeywordsText(productSeoKeywordsInput).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {parseSeoKeywordsText(productSeoKeywordsInput).map((kw, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md border border-[#D4AF37]/30 bg-[#171510] text-[10px] text-[#E5C158]"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-white/10">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.inStock !== false}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, inStock: e.target.checked })
                  }
                />
                <span>متوفر بالمخزون</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-[#E5C158] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingProduct.isPublished)}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, isPublished: e.target.checked })
                  }
                />
                <span>نشر في الموقع (ظاهر للعملاء)</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="h-10 px-4 rounded-xl border border-white/15 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingProduct}
                className="btn-gold-wave h-10 px-6 rounded-xl text-xs sm:text-sm cursor-pointer"
              >
                {savingProduct ? 'جاري الحفظ...' : 'حفظ المنتج'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Interactive 1000x1000 Square Image Cropper Modal */}
      {pendingCropFiles.length > 0 && (
        <SquareImageCropModal
          files={pendingCropFiles}
          onCancel={() => setPendingCropFiles([])}
          onComplete={handleCropModalComplete}
        />
      )}

      {/* Luxury Studio Image Editor Modal */}
      {studioTarget && (
        <ProductImageStudioModal
          open={Boolean(studioTarget)}
          adminToken={adminToken || tokenRef.current || ''}
          imageUrl={studioTarget.imageUrl}
          productName={studioTarget.name}
          productCategory={studioTarget.category}
          priceSar={studioTarget.priceSar}
          onClose={() => setStudioTarget(null)}
          onSaved={handleStudioImageSaved}
        />
      )}
    </div>
  );
}
