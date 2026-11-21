import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AssistantMessage,
  CustomerProfile,
  LoyaltyCoupon,
  LoyaltyHistoryItem,
  Order,
  OrderStatus,
  OwnerAlert,
  OwnerWallet,
  OwnerWalletTransaction,
  Product,
  ProductReview,
  PromoBanner,
  PromoDiscountCode,
  PublicProduct,
  PublicSettings,
  SearchLogEntry,
  SiteAnalytics,
  StoreSettings,
} from '../src/types.ts';

interface StoredAnalytics {
  totalVisits: number;
  uniqueVisitorTokens: string[];
  searchQueries: SearchLogEntry[];
  dailySearchCounts?: Record<string, number>;
  updatedAt: string;
}

interface StoredCustomer extends CustomerProfile {
  passwordHash: string;
  resetCodeHash?: string;
  resetExpiresAt?: number;
  sharedProductsHistory?: Record<string, string>;
}

interface DatabaseSchema {
  adminPasswordHash: string;
  adminResetCodeHash?: string;
  adminResetExpiresAt?: number;
  adminTwoFactorEnabled?: boolean;
  adminTwoFactorMethod?: 'totp' | 'email';
  adminTotpSecret?: string;
  adminTotpPendingSecret?: string;
  adminTwoFactorBackupCodeHashes?: string[];
  adminLoginOtpHash?: string;
  adminLoginOtpExpiresAt?: number;
  settings: StoreSettings;
  products: Product[];
  banners: PromoBanner[];
  reviews?: ProductReview[];
  customers: StoredCustomer[];
  orders: Order[];
  ownerWallet?: OwnerWallet;
  assistantMessages?: AssistantMessage[];
  analytics?: StoredAnalytics;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'store.json');
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash('sha256')
    .update('royal_taj_gold_persistent_session_secret_v2')
    .digest('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function createSignedToken(payload: Record<string, unknown>): string {
  const data = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifySignedToken<T extends Record<string, unknown>>(token: string): T | null {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(data)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T & {
      exp?: number;
    };
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(byteLength = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function computeTotpAtCounter(secretBase32: string, counter: number): string {
  const key = decodeBase32(secretBase32);
  const buf = Buffer.alloc(8);
  let high = Math.floor(counter / 0x100000000);
  let low = counter >>> 0;
  buf.writeUInt32BE(high, 0);
  buf.writeUInt32BE(low, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function verifyTotpCode(secretBase32: string, code: string, window = 1): boolean {
  const cleanCode = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const currentCounter = Math.floor(Date.now() / 1000 / 30);
  for (let step = -window; step <= window; step++) {
    const expected = computeTotpAtCounter(secretBase32, currentCounter + step);
    if (
      expected.length === cleanCode.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanCode))
    ) {
      return true;
    }
  }
  return false;
}

function generateBackupCodesSet(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const partA = crypto.randomBytes(2).toString('hex').toUpperCase();
    const partB = crypto.randomBytes(2).toString('hex').toUpperCase();
    codes.push(`TAJ-${partA}-${partB}`);
  }
  return codes;
}

export const DEFAULT_GROUP_CHAT_TITLE =
  'تجارب ومشاكل ملاك السيارات مع دبة التلوث.. وحلول أهل الخبرة';

export const DEFAULT_GROUP_CHAT_MESSAGES = [
  {
    id: 'gc-1',
    senderName: 'خالد (صاحب هوندا)',
    roleTag: 'مالك سيارة',
    accent: 'owner_car' as const,
    message:
      'يا شباب عندي هوندا أكورد وظهرت لمبة المكينة (كود P0420) والسيارة صارت تصرف بنزين بزيادة، وش الحل؟',
  },
  {
    id: 'gc-2',
    senderName: 'سعد (صاحب مازدا)',
    roleTag: 'مالك سيارة',
    accent: 'owner_car' as const,
    message:
      'نفس مشكلتك صارت معي في المازدا! رحت لورشة وقالوا فرّغ الدبة، وبعد ما فرغتها طلع صوت مزعج وريحة كربون ورسبت في الفحص الدوري.',
  },
  {
    id: 'gc-3',
    senderName: 'تركي (صاحب لكزس)',
    roleTag: 'مالك سيارة',
    accent: 'owner_car' as const,
    message:
      'انتبهوا من التفريغ يا إخوان، أنا معي لكزس 430 ولما فرغتها ارتفعت حرارة الشكمان وضعف عزم الموتر.',
  },
  {
    id: 'gc-4',
    senderName: 'فيصل (صاحب بي إم دبليو)',
    roleTag: 'مالك سيارة',
    accent: 'owner_car' as const,
    message:
      'فعلاً، خصوصاً في البي إم دبليو والسيارات الحديثة، حساسات الشكمان دقيقة وأي تفريغ يلخبط كمبيوتر السيارة.',
  },
  {
    id: 'gc-5',
    senderName: 'المهندس أحمد',
    roleTag: 'مهندس فحص وتشخيص',
    accent: 'engineer' as const,
    message:
      'حياكم الله جميعاً. كلامكم سليم 100%، تفريغ الدبة يرفع ضغط الحرارة ويضر الحساسات والقير مع الوقت، والحل الصحيح هو استبدالها بدبة مطابقة للمواصفات.',
  },
  {
    id: 'gc-6',
    senderName: 'المعلم فهد',
    roleTag: 'خبير تركيب الدبات',
    accent: 'master' as const,
    message:
      'ومن واقع خبرتنا في التركيب، دباتنا مصممة بقلب سيراميك ومعدن عالي الجودة يطفي لمبة المكينة ويرجع عزم الموتر الطبيعي من أول تشغيل.',
  },
  {
    id: 'gc-7',
    senderName: 'المدير يوسف',
    roleTag: 'إدارة المصنع',
    accent: 'manager' as const,
    message:
      'أبشروا بالخير جميعاً، نوفر لكم دبات تلوث (هوندا، مازدا، لكزس، بي إم دبليو، وجميع السيارات) بمواصفات ألمانية وضمان رسمي وبسعر المصنع المباشر.',
  },
];

function defaultSettings(): StoreSettings {
  return {
    storeName: 'مصنع التاج الذهبي لدبات التلوث',
    storeTagline: 'إنتاج دبات التلوث للديزل والبنزين',
    storeLogoUrl: '',
    storeOpen: true,
    storeClosedTitle: 'المتجر مغلق مؤقتاً للصيانة والتحديث',
    storeClosedMessage:
      'نعمل حالياً على تحديث المخزون وتجهيز منتجات وعروض جديدة. يمكنكم التواصل معنا مباشرة عبر واتساب لأي استفسار أو طلب عاجل، وسنعود لاستقبال الطلبات قريباً.',
    allowLanguageSwitch: true,
    defaultLanguage: 'ar',
    multiCurrencyEnabled: true,
    currencyRates: {
      SAR: 1,
      AED: 0.98,
      KWD: 0.082,
      QAR: 0.97,
      BHD: 0.1,
      OMR: 0.103,
    },
    priceDisplayMode: 'retail',
    installmentsEnabled: true,
    showImageUrlFields: true,
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
    cardStyle: 'luxury_bordered',
    themeFontFamily: 'Tajawal',
    primaryGoldColor: '#D4AF37',
    secondaryColor: '#E5C158',
    backgroundColor: '#09090B',
    surfaceColor: '#121216',
    textColor: '#F5F2EB',
    productsSectionBgUrl: '',
    productsSectionBgOpacity: 0.25,
    whatsappNumber: '966504597852',
    contactEmail: 'uuuo333@gmail.com',
    paypalBusinessEmail: 'payments@taj-catalytic.example',
    paypalMeUrl: 'https://www.paypal.me/yousefAlmohamad931',
    paypalClientId: '',
    paypalButtonsEnabled: true,
    paypalCardEnabled: true,
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
    coinsPerProductShare: 15,
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
    seoLastAutoRun: new Date().toISOString(),
    groupChatEnabled: true,
    groupChatTitle: DEFAULT_GROUP_CHAT_TITLE,
    groupChatMessages: DEFAULT_GROUP_CHAT_MESSAGES,
    promoDiscountCodes: [
      {
        id: 'promo-taj5',
        code: 'TAJ5',
        discountType: 'percent',
        discountValue: 5,
        isActive: true,
        usageCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'promo-2026',
        code: '2026',
        discountType: 'fixed',
        discountValue: 50,
        isActive: true,
        usageCount: 0,
        createdAt: new Date().toISOString(),
      },
    ],
    ownerPersonalWhatsapp: '966500000000',
    ownerWhatsappWebhookUrl: '',
    autoWhatsappAlertsEnabled: true,
    ownerRecoveryEmail: 'uuuo333@gmail.com',
    ownerTwoFactorEnabled: false,
    ownerTwoFactorMethod: 'totp',
  };
}

function buildInitialSeed(): DatabaseSchema {
  const now = new Date().toISOString();
  const defaultAdminPassword = process.env.ADMIN_PASSWORD || '604608';
  const settings = defaultSettings();

  const products: Product[] = [
    {
      id: 'prod-gasoline-euro6',
      sku: 'TAJ-GAS-01',
      name: 'دبة تلوث بنزين ستانلس ستيل TIG مع منافذ حساسات مزدوجة',
      nameEn: 'TIG Stainless Steel Gasoline Catalytic Converter with Dual O2 Ports',
      category: 'دبات تلوث البنزين',
      priceSar: 1350,
      wholesalePriceSar: 1080,
      compareAtPriceSar: 1650,
      description:
        'دبة تلوث عالية الكفاءة لمحركات البنزين الحديثة، مصنعة من الفولاذ المقاوم للصدأ 304 بلحام TIG دقيق، مزودة بمنفذي حساسات أكسجين O2 وخلية سيراميك 400 CPSI مشبعة بالبلاتين والبلاديوم.',
      descriptionEn:
        'High-efficiency gasoline catalytic converter crafted from 304 stainless steel with TIG welding, dual O2 sensor ports, and 400 CPSI platinum/palladium ceramic core.',
      images: ['/src/assets/images/product_gasoline_cat_1794821493329.jpg'],
      specs: [
        { label: 'نوع الوقود', value: 'بنزين (Gasoline) - 4 و 6 و 8 سلندر' },
        { label: 'المعيار البيئي', value: 'Euro-5 / Euro-6 المعتمد' },
        { label: 'الهيكل واللحام', value: 'ستانلس ستيل 304 بلحام TIG حراري' },
        { label: 'كثافة الخلية', value: '400 خلية لكل بوصة (CPSI)' },
      ],
      fuelEfficiencyGainPercent: 14,
      inStock: true,
      isPublished: true,
      seoTitle: 'دبة تلوث بنزين ستانلس ستيل Euro-6 | إنتاج التاج الذهبي',
      seoDescription:
        'اطلب دبة تلوث بنزين عالية الكفاءة بمنافذ حساسات مزدوجة ولحام TIG بسعر 1350 ريال سعودي لتجاوز الفحص الدوري وتنقية العادم.',
      seoKeywords: ['دبة تلوث بنزين', 'دبة رصاص بنزين', 'دبات تلوث السعودية', 'محول حفاز بنزين'],
      seoLastUpdated: now,
      createdAt: now,
    },
    {
      id: 'prod-diesel-dpf',
      name: 'دبة تلوث وفلتر جسيمات ديزل DPF للخدمة الشاقة',
      category: 'دبات تلوث الديزل',
      priceSar: 2850,
      compareAtPriceSar: 3400,
      description:
        'منظومة متكاملة لتنقية عادم محركات الديزل (DPF + DOC) للسيارات الرباعية الدفع والشاحنات الخفيفة، تمنع الدخان الأسود وتخفض الانبعاثات مع دعم كامل لحساسات الضغط والحرارة.',
      images: ['/src/assets/images/product_diesel_dpf_1794821492144.jpg'],
      specs: [
        { label: 'نوع الوقود', value: 'ديزل (Diesel Turbo / Common Rail)' },
        { label: 'النظام', value: 'فلتر جسيمات DPF + محفز أكسدة DOC' },
        { label: 'مقاومة الحرارة', value: 'حتى 1100 درجة مئوية' },
        { label: 'التوصيلات', value: 'فلنجات وحساسات ضغط تفاضلي جاهزة' },
      ],
      inStock: true,
      isPublished: true,
      seoTitle: 'دبة تلوث ديزل وفلتر DPF للخدمة الشاقة | بالريال السعودي',
      seoDescription:
        'دبة تلوث ديزل احترافية مع فلتر جسيمات DPF ومنافذ حساسات لمنع الدخان الأسود وتحسين أداء التيربو بسعر 2850 ريال سعودي.',
      seoKeywords: ['دبة تلوث ديزل', 'فلتر DPF ديزل', 'منع دخان الديزل', 'دبة بيئة ديزل'],
      seoLastUpdated: now,
      createdAt: now,
    },
    {
      id: 'prod-ceramic-core',
      name: 'قلب دبة تلوث سيراميك حفاز (حشوة بلاتين عالية الكثافة)',
      category: 'قلوب وحشوات السيراميك',
      priceSar: 780,
      compareAtPriceSar: 950,
      description:
        'قلب سيراميك داخلي بنظام قرص العسل (Honeycomb) مطلي بطبقة معادن ثمينة عالية التركيز (بلاتين، بالاديوم، روديوم) لإعادة تأهيل وتصنيع دبات التلوث للديزل والبنزين بكفاءة المصنع.',
      images: ['/src/assets/images/product_ceramic_core_1794821493246.jpg'],
      specs: [
        { label: 'الاستخدام', value: 'تجميع وتصنيع دبات الديزل والبنزين' },
        { label: 'الطلاء الحفاز', value: 'بلاتين + بالاديوم + روديوم عالي التركيز' },
        { label: 'تنوع المقاسات', value: 'متوفر بأقطار 4 / 4.5 / 5 بوصة' },
        { label: 'تدفق الهواء', value: 'انسيابي يمنع كتمة المحرك' },
      ],
      inStock: true,
      isPublished: true,
      seoTitle: 'قلب دبة تلوث سيراميك حشوة بلاتين | تصنيع دبات البيئة',
      seoDescription:
        'حشوة وقلب دبة تلوث سيراميك أصلي مشبع بالبلاتين لإعادة تصنيع وتجديد دبات الديزل والبنزين بسعر 780 ريال سعودي.',
      seoKeywords: ['قلب دبة تلوث', 'حشوة دبة الرصاص', 'سيراميك دبة التلوث', 'رصاص دبة البيئة'],
      seoLastUpdated: now,
      createdAt: now,
    },
    {
      id: 'prod-universal-kit',
      name: 'طقم دبة تلوث وكاتم عادم Euro-6 شامل الفلنجات (ديزل وبنزين)',
      category: 'أطقم العادم والفلنجات',
      priceSar: 1890,
      description:
        'طقم إنتاج متكامل يجمع دبة التلوث الرئيسية وكاتم الصوت الخلفي مع جميع الفلنجات المعدنية والجازكيتات الحرارية ومسامير التثبيت للتركيب السريع على مختلف السيارات.',
      images: ['/src/assets/images/product_universal_exhaust_1794821493897.jpg'],
      specs: [
        { label: 'التوافق', value: 'متوافق مع أنظمة البنزين والديزل (2.5 / 3 بوصة)' },
        { label: 'محتويات الطقم', value: 'دبة تلوث + كاتم + 4 فلنجات + جازكيتات ومسامير' },
        { label: 'الخامة', value: 'فولاذ مقاوم للصدأ ومطابق لمواصفات OEM' },
      ],
      inStock: true,
      isPublished: true,
      seoTitle: 'طقم دبة تلوث وكاتم Euro-6 مع الفلنجات | بالريال السعودي',
      seoDescription:
        'طقم متكامل لدبة التلوث وكاتم العادم بفلنجات التركيب لسيارات البنزين والديزل بسعر 1890 ريال سعودي.',
      seoKeywords: ['طقم دبة تلوث', 'فلنجات دبة التلوث', 'دبة تلوث عالمية Euro 6'],
      seoLastUpdated: now,
      createdAt: now,
    },
    {
      id: 'prod-titanium-hybrid',
      name: 'دبة تلوث هجينة متطورة (الإصدار الذهبي عالي الأداء)',
      category: 'دبات تلوث البنزين',
      priceSar: 2150,
      description:
        'إصدار هندسي فاخر يجمع بين المرونة المقاومة للاهتزاز (Flex Pipe) ومبدد الحرارة الذهبي، مصمم خصيصاً لسيارات الدفع الرباعي والمحركات ذات العزم العالي.',
      images: ['/src/assets/images/hero_catalytic_gold_1794821492784.jpg'],
      specs: [
        { label: 'التصميم', value: 'وصلة مرنة مدمجة + درع حراري ذهبي' },
        { label: 'السعة المدعومة', value: 'محركات من 2.0 لتر حتى 5.7 لتر' },
        { label: 'منافذ الحساسات', value: 'منفذان بمسننات قياسية M18x1.5' },
      ],
      inStock: true,
      isPublished: true,
      seoTitle: 'دبة تلوث عالية الأداء بوصلة مرنة | إنتاج التاج الذهبي',
      seoDescription:
        'دبة تلوث مطورة بوصلة مرنة ودرع حراري لسيارات الدفع الرباعي ومحركات العزم العالي بالريال السعودي.',
      seoKeywords: ['دبة تلوث رياضية', 'دبة تلوث جيب', 'دبة تلوث 8 سلندر'],
      seoLastUpdated: now,
      createdAt: now,
    },
    {
      id: 'draft-secret-sample',
      name: 'مسودة خاصة: دبة تلوث شاحنات ديزل ثقيلة Euro-6 (مخفي)',
      category: 'دبات تلوث الديزل',
      priceSar: 4200,
      description:
        'منتج تم سحبه وحفظه كمسودة سرية للمراجعة والتعديل قبل النشر للمتجر. لا يظهر للعملاء نهائياً حتى يتم تفعيل خيار النشر.',
      images: ['/src/assets/images/product_diesel_dpf_1794821492144.jpg'],
      specs: [
        { label: 'الحالة', value: 'مسودة قيد المراجعة من المالك' },
      ],
      inStock: true,
      isPublished: false,
      isScrapedDraft: true,
      sourceUrl: 'https://private-supplier-catalog.example/item/heavy-diesel-dpf-euro6',
      originalExtractedPrice: '$780 USD',
      createdAt: now,
    },
  ];

  const banners: PromoBanner[] = [
    {
      id: 'banner-royal-launch',
      title: 'خصومات الإنتاج المباشر لدبات التلوث 2026',
      subtitle: 'إنتاج محلي فائق الجودة لسيارات الديزل والبنزين مع ضمان اجتياز الفحص الدوري',
      ctaText: 'استعرض دبات التلوث',
      discountLabel: 'إصدار المصنع',
      accentColor: '#D4AF37',
      isActive: true,
      googleAdsHeadlines: [
        'دبات تلوث ديزل وبنزين أصلية',
        'إنتاج مباشر بضمان الفحص الدوري',
        'فلاتر بيئة DPF بالريال السعودي',
      ],
      googleAdsDescriptions: [
        'تخلص من لمبة المحرك والدخان الأسود بأعلى جودة تصنيع وبسعر المصنع المباشر.',
      ],
      googleAdsKeywords: ['دبات التلوث', 'دبة تلوث ديزل', 'دبة تلوث بنزين', 'فلتر DPF'],
      createdAt: now,
    },
  ];

  const assistantMessages: AssistantMessage[] = [
    {
      id: 'msg-welcome',
      role: 'assistant',
      text: 'مرحباً بك يا مالك المتجر! أنا مساعدك الشخصي بالذكاء الاصطناعي. أستطيع تنبيهك على حالة المنتجات والطلبات، إضافة منتجات جديدة بالذكاء الاصطناعي، تعديل الأسعار أو النشر فوراً، وتجهيز تقارير التحديثات لإرسالها إلى واتسابك الخاص.',
      createdAt: now,
    },
  ];

  return {
    adminPasswordHash: hashPassword(defaultAdminPassword),
    settings,
    products,
    banners,
    customers: [],
    orders: [],
    assistantMessages,
    analytics: {
      totalVisits: 0,
      uniqueVisitorTokens: [],
      searchQueries: [],
      updatedAt: now,
    },
  };
}

let cachedDb: DatabaseSchema | null = null;

function ensureDb(): DatabaseSchema {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = buildInitialSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
    cachedDb = seed;
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    const defaults = defaultSettings();
    parsed.settings = { ...defaults, ...(parsed.settings || {}) };
    if (!parsed.settings.whatsappNumber || parsed.settings.whatsappNumber === '966500000000') {
      parsed.settings.whatsappNumber = '966504597852';
    }
    if (!parsed.settings.contactEmail || parsed.settings.contactEmail === 'dbattloth.2@gmail.com') {
      parsed.settings.contactEmail = 'uuuo333@gmail.com';
      saveDb(parsed);
    }
    if (!parsed.settings.paypalMeUrl) {
      parsed.settings.paypalMeUrl = 'https://www.paypal.me/yousefAlmohamad931';
    }
    if (typeof parsed.settings.paypalClientId !== 'string') {
      parsed.settings.paypalClientId = '';
    }
    if (typeof parsed.settings.paypalButtonsEnabled !== 'boolean') {
      parsed.settings.paypalButtonsEnabled = true;
    }
    if (typeof parsed.settings.paypalCardEnabled !== 'boolean') {
      parsed.settings.paypalCardEnabled = true;
    }
    if (!parsed.settings.ownerRecoveryEmail) {
      parsed.settings.ownerRecoveryEmail = 'uuuo333@gmail.com';
    }
    if (typeof parsed.settings.storeOpen !== 'boolean') {
      parsed.settings.storeOpen = true;
    }
    if (!Array.isArray(parsed.settings.categories) || parsed.settings.categories.length === 0) {
      parsed.settings.categories = defaults.categories;
    }
    if (!Array.isArray(parsed.settings.sidebarVideos) || parsed.settings.sidebarVideos.length === 0) {
      parsed.settings.sidebarVideos = defaults.sidebarVideos;
    }
    if (!Array.isArray(parsed.settings.shippingCarriers) || parsed.settings.shippingCarriers.length === 0) {
      parsed.settings.shippingCarriers = defaults.shippingCarriers;
    }
    if (!Array.isArray(parsed.settings.charityOrganizations) || parsed.settings.charityOrganizations.length === 0) {
      parsed.settings.charityOrganizations = defaults.charityOrganizations;
    }
    if (!Array.isArray(parsed.settings.promoDiscountCodes)) {
      parsed.settings.promoDiscountCodes = defaults.promoDiscountCodes;
    }
    if (!parsed.settings.currencyRates) {
      parsed.settings.currencyRates = defaults.currencyRates;
    }
    if (typeof parsed.settings.coinsPerProductShare !== 'number') {
      parsed.settings.coinsPerProductShare = defaults.coinsPerProductShare;
    }
    if (typeof parsed.settings.groupChatEnabled !== 'boolean') {
      parsed.settings.groupChatEnabled = true;
    }
    if (typeof parsed.settings.groupChatTitle !== 'string' || !parsed.settings.groupChatTitle.trim()) {
      parsed.settings.groupChatTitle = DEFAULT_GROUP_CHAT_TITLE;
    }
    if (!Array.isArray(parsed.settings.groupChatMessages) || parsed.settings.groupChatMessages.length === 0) {
      parsed.settings.groupChatMessages = DEFAULT_GROUP_CHAT_MESSAGES;
    }
    // Keep server adminTwoFactorEnabled disabled (direct password login mode)
    parsed.adminTwoFactorEnabled = false;
    parsed.settings.ownerTwoFactorEnabled = false;
    if (!Array.isArray(parsed.reviews)) {
      parsed.reviews = [];
    }
    parsed.customers = (parsed.customers || []).map((c) => ({
      ...c,
      goldenCoins: typeof c.goldenCoins === 'number' ? c.goldenCoins : 0,
      coupons: Array.isArray(c.coupons) ? c.coupons : [],
      loyaltyHistory: Array.isArray(c.loyaltyHistory) ? c.loyaltyHistory : [],
      sharedProductsHistory:
        c.sharedProductsHistory && typeof c.sharedProductsHistory === 'object'
          ? c.sharedProductsHistory
          : {},
    }));
    if (!parsed.ownerWallet || typeof parsed.ownerWallet !== 'object') {
      parsed.ownerWallet = {
        balanceSar: 0,
        totalDepositedSar: 0,
        totalSpentSar: 0,
        transferredOrderIds: [],
        transactions: [],
        updatedAt: new Date().toISOString(),
      };
    } else {
      parsed.ownerWallet = {
        balanceSar: Number.isFinite(Number(parsed.ownerWallet.balanceSar))
          ? Math.max(0, Number(parsed.ownerWallet.balanceSar))
          : 0,
        totalDepositedSar: Number.isFinite(Number(parsed.ownerWallet.totalDepositedSar))
          ? Math.max(0, Number(parsed.ownerWallet.totalDepositedSar))
          : 0,
        totalSpentSar: Number.isFinite(Number(parsed.ownerWallet.totalSpentSar))
          ? Math.max(0, Number(parsed.ownerWallet.totalSpentSar))
          : 0,
        transferredOrderIds: Array.isArray(parsed.ownerWallet.transferredOrderIds)
          ? parsed.ownerWallet.transferredOrderIds
          : [],
        transactions: Array.isArray(parsed.ownerWallet.transactions)
          ? parsed.ownerWallet.transactions
          : [],
        updatedAt: parsed.ownerWallet.updatedAt || new Date().toISOString(),
      };
    }
    if (!Array.isArray(parsed.assistantMessages)) {
      parsed.assistantMessages = buildInitialSeed().assistantMessages;
    }
    if (!parsed.analytics) {
      parsed.analytics = {
        totalVisits: 0,
        uniqueVisitorTokens: [],
        searchQueries: [],
        dailySearchCounts: {},
        updatedAt: new Date().toISOString(),
      };
    }
    if (!parsed.adminPasswordHash || verifyPassword('Admin@2026', parsed.adminPasswordHash)) {
      parsed.adminPasswordHash = hashPassword(process.env.ADMIN_PASSWORD || '604608');
      saveDb(parsed);
    }
    cachedDb = parsed;
    return cachedDb;
  } catch {
    const seed = buildInitialSeed();
    saveDb(seed);
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    return seed;
  }
}

function saveDb(db: DatabaseSchema): void {
  cachedDb = db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function saveUploadedBuffer(
  filename: string,
  mimeType: string,
  buf: Buffer
): string {
  ensureDb();
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const rawExt = path.extname(filename).replace('.', '').toLowerCase();
  const mimeSub = mimeType.split('/')[1]?.toLowerCase() || '';
  let ext = rawExt && /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : '';
  if (!ext) {
    if (mimeSub.includes('quicktime')) ext = 'mov';
    else if (mimeSub.includes('mp4')) ext = 'mp4';
    else if (mimeSub.includes('webm')) ext = 'webm';
    else ext = mimeSub.replace(/[^a-z0-9]/gi, '') || 'bin';
  }
  const baseName = path
    .basename(filename, path.extname(filename))
    .replace(/[^a-z0-9_-]/gi, '_')
    .slice(0, 32);
  const finalName = `${baseName || 'media'}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, finalName), buf);
  return `/uploads/${finalName}`;
}

export function saveUploadedMedia(
  filename: string,
  mimeType: string,
  dataBase64: string
): string {
  const cleanB64 = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
  const buf = Buffer.from(cleanB64, 'base64');
  return saveUploadedBuffer(filename, mimeType, buf);
}

export function stripPrivateProductFields(product: Product): PublicProduct {
  const {
    sourceUrl: _s,
    isScrapedDraft: _d,
    originalExtractedPrice: _o,
    costPriceSar: _c,
    profitMarginPercent: _p,
    ...pub
  } = product;
  return pub;
}

export function getPublicSettings(): PublicSettings {
  const db = ensureDb();
  const {
    paypalBusinessEmail,
    promoDiscountCodes: _pdc,
    ownerPersonalWhatsapp: _ow,
    ownerWhatsappWebhookUrl: _wh,
    autoWhatsappAlertsEnabled: _aw,
    ownerRecoveryEmail: _re,
    ownerTwoFactorEnabled: _tfe,
    ownerTwoFactorMethod: _tfm,
    showImageUrlFields: _siu,
    ...rest
  } = db.settings;
  return {
    ...rest,
    paypalMerchantLabel: paypalBusinessEmail ? 'PayPal Verified Merchant' : 'PayPal',
  };
}

export function getAdminSettings(): StoreSettings {
  const db = ensureDb();
  return {
    ...db.settings,
    ownerTwoFactorEnabled: Boolean(db.adminTwoFactorEnabled),
    ownerTwoFactorMethod: db.adminTwoFactorMethod || 'totp',
  };
}

export function updateSettings(patch: Partial<StoreSettings>): StoreSettings {
  const db = ensureDb();
  const {
    ownerTwoFactorEnabled: _tfe,
    ownerTwoFactorMethod: _tfm,
    ...safePatch
  } = patch;
  if (Array.isArray(safePatch.promoDiscountCodes)) {
    safePatch.promoDiscountCodes = safePatch.promoDiscountCodes
      .map((item: PromoDiscountCode) => ({
        ...item,
        code: String(item.code || '')
          .trim()
          .toUpperCase()
          .slice(0, 4),
        discountValue: Math.max(0, Number(item.discountValue) || 0),
      }))
      .filter((item) => item.code.length === 4);
  }
  if (Array.isArray(safePatch.groupChatMessages)) {
    safePatch.groupChatMessages = safePatch.groupChatMessages
      .map((item, idx) => ({
        id: String(item.id || `gc-${idx + 1}`),
        senderName: String(item.senderName || '').trim(),
        roleTag: item.roleTag ? String(item.roleTag).trim() : '',
        accent:
          item.accent === 'engineer' ||
          item.accent === 'master' ||
          item.accent === 'manager' ||
          item.accent === 'owner_car'
            ? item.accent
            : 'owner_car',
        message: String(item.message || '').trim(),
      }))
      .filter((item) => item.senderName.length > 0 && item.message.length > 0);
  }
  db.settings = { ...db.settings, ...safePatch };
  saveDb(db);
  return getAdminSettings();
}

const FIXED_OWNER_PASSWORDS = new Set(['604608', '2026']);

export function verifyAdminPassword(password: string): boolean {
  const clean = String(password || '').trim();
  if (!clean) return false;
  if (FIXED_OWNER_PASSWORDS.has(clean)) return true;
  const db = ensureDb();
  return verifyPassword(clean, db.adminPasswordHash);
}

export function updateAdminPassword(newPassword: string): void {
  const db = ensureDb();
  db.adminPasswordHash = hashPassword(newPassword);
  delete db.adminResetCodeHash;
  delete db.adminResetExpiresAt;
  saveDb(db);
}

export function requestAdminPasswordReset(
  emailInput: string
): { ok: true; code: string; recoveryEmail: string } | { ok: false; error: string } {
  const db = ensureDb();
  const configuredEmail = (db.settings.ownerRecoveryEmail || 'uuuo333@gmail.com').trim().toLowerCase();
  const candidate = emailInput.trim().toLowerCase();
  const allowedEmails = new Set([configuredEmail, 'dbattloth.221@gmail.com']);
  if (!candidate || !allowedEmails.has(candidate)) {
    return {
      ok: false,
      error: 'البريد الإلكتروني المدخل غير مطابق لبريد استعادة كلمة مرور المالك.',
    };
  }
  const code = String(crypto.randomInt(100000, 999999));
  db.adminResetCodeHash = hashPassword(code);
  db.adminResetExpiresAt = Date.now() + 15 * 60 * 1000;
  saveDb(db);
  return {
    ok: true,
    code,
    recoveryEmail: candidate,
  };
}

export function confirmAdminPasswordReset(
  emailInput: string,
  code: string,
  newPassword: string
): { ok: true } | { ok: false; error: string } {
  const db = ensureDb();
  const configuredEmail = (db.settings.ownerRecoveryEmail || 'uuuo333@gmail.com').trim().toLowerCase();
  const candidate = emailInput.trim().toLowerCase();
  const allowedEmails = new Set([configuredEmail, 'dbattloth.221@gmail.com']);
  if (!candidate || !allowedEmails.has(candidate)) {
    return { ok: false, error: 'البريد الإلكتروني غير مطابق.' };
  }
  if (!db.adminResetCodeHash || !db.adminResetExpiresAt || Date.now() > db.adminResetExpiresAt) {
    return { ok: false, error: 'انتهت صلاحية رمز التحقق أو لم يتم طلبه بعد.' };
  }
  if (!verifyPassword(code.trim(), db.adminResetCodeHash)) {
    return { ok: false, error: 'رمز التحقق غير صحيح.' };
  }
  db.adminPasswordHash = hashPassword(newPassword);
  delete db.adminResetCodeHash;
  delete db.adminResetExpiresAt;
  saveDb(db);
  return { ok: true };
}

export function getAdminTwoFactorStatus() {
  const db = ensureDb();
  return {
    enabled: false,
    method: 'totp' as 'totp' | 'email',
    hasTotpSecret: false,
    backupCodesRemaining: 0,
    recoveryEmail: db.settings.ownerRecoveryEmail || 'uuuo333@gmail.com',
  };
}

export function beginAdminTotpSetup() {
  const db = ensureDb();
  const secret = generateBase32Secret(20);
  db.adminTotpPendingSecret = secret;
  saveDb(db);
  const issuer = encodeURIComponent('Taj Al-Dhahabi Admin');
  const account = encodeURIComponent(db.settings.ownerRecoveryEmail || 'uuuo333@gmail.com');
  const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauthUrl };
}

export function confirmAdminTotpSetup(
  code: string
): { ok: true; backupCodes: string[] } | { ok: false; error: string } {
  const db = ensureDb();
  const pending = db.adminTotpPendingSecret;
  if (!pending) {
    return { ok: false, error: 'لم يتم بدء إعداد تطبيق المصادقة. اضغط إنشاء رمز QR أولاً.' };
  }
  if (!verifyTotpCode(pending, code, 1)) {
    return {
      ok: false,
      error: 'رمز المصادقة المكون من 6 أرقام غير صحيح. تأكد من مزامنة وقت الجهاز وحاول مجدداً.',
    };
  }
  const backupCodes = generateBackupCodesSet(8);
  db.adminTotpSecret = pending;
  delete db.adminTotpPendingSecret;
  db.adminTwoFactorEnabled = true;
  db.adminTwoFactorMethod = 'totp';
  db.adminTwoFactorBackupCodeHashes = backupCodes.map((c) => hashPassword(c));
  db.settings.ownerTwoFactorEnabled = true;
  db.settings.ownerTwoFactorMethod = 'totp';
  saveDb(db);
  return { ok: true, backupCodes };
}

export function enableAdminEmailTwoFactor(): { backupCodes: string[] } {
  const db = ensureDb();
  const backupCodes = generateBackupCodesSet(8);
  db.adminTwoFactorEnabled = true;
  db.adminTwoFactorMethod = 'email';
  db.adminTwoFactorBackupCodeHashes = backupCodes.map((c) => hashPassword(c));
  db.settings.ownerTwoFactorEnabled = true;
  db.settings.ownerTwoFactorMethod = 'email';
  saveDb(db);
  return { backupCodes };
}

export function disableAdminTwoFactor(
  currentPassword: string
): { ok: true } | { ok: false; error: string } {
  const db = ensureDb();
  if (!verifyPassword(currentPassword, db.adminPasswordHash)) {
    return { ok: false, error: 'كلمة مرور المالك الحالية غير صحيحة.' };
  }
  db.adminTwoFactorEnabled = false;
  delete db.adminTotpSecret;
  delete db.adminTotpPendingSecret;
  delete db.adminTwoFactorBackupCodeHashes;
  delete db.adminLoginOtpHash;
  delete db.adminLoginOtpExpiresAt;
  db.settings.ownerTwoFactorEnabled = false;
  saveDb(db);
  return { ok: true };
}

export function regenerateAdminBackupCodes(): string[] {
  const db = ensureDb();
  const backupCodes = generateBackupCodesSet(8);
  db.adminTwoFactorBackupCodeHashes = backupCodes.map((c) => hashPassword(c));
  saveDb(db);
  return backupCodes;
}

export function issueAdminEmailLoginOtp(): { code: string; recoveryEmail: string } {
  const db = ensureDb();
  const code = String(crypto.randomInt(100000, 999999));
  db.adminLoginOtpHash = hashPassword(code);
  db.adminLoginOtpExpiresAt = Date.now() + 10 * 60 * 1000;
  saveDb(db);
  return {
    code,
    recoveryEmail: db.settings.ownerRecoveryEmail || 'uuuo333@gmail.com',
  };
}

export function verifyAdminSecondFactor(
  codeInput: string
): { ok: true; usedBackupCode?: boolean } | { ok: false; error: string } {
  const db = ensureDb();
  const clean = codeInput.trim().toUpperCase();
  if (!clean) {
    return { ok: false, error: 'يرجى إدخال رمز التحقق الثنائي.' };
  }

  // 1. Check TOTP Authenticator secret if configured
  if (db.adminTotpSecret && verifyTotpCode(db.adminTotpSecret, clean, 1)) {
    delete db.adminLoginOtpHash;
    delete db.adminLoginOtpExpiresAt;
    saveDb(db);
    return { ok: true };
  }

  // 2. Check Email 6-digit OTP if issued and valid
  if (
    db.adminLoginOtpHash &&
    db.adminLoginOtpExpiresAt &&
    Date.now() <= db.adminLoginOtpExpiresAt &&
    verifyPassword(clean, db.adminLoginOtpHash)
  ) {
    delete db.adminLoginOtpHash;
    delete db.adminLoginOtpExpiresAt;
    saveDb(db);
    return { ok: true };
  }

  // 3. Check One-time Emergency Backup Codes
  const hashes = db.adminTwoFactorBackupCodeHashes || [];
  for (let i = 0; i < hashes.length; i++) {
    if (verifyPassword(clean, hashes[i])) {
      db.adminTwoFactorBackupCodeHashes = hashes.filter((_, idx) => idx !== i);
      delete db.adminLoginOtpHash;
      delete db.adminLoginOtpExpiresAt;
      saveDb(db);
      return { ok: true, usedBackupCode: true };
    }
  }

  return { ok: false, error: 'رمز التحقق الثنائي غير صحيح أو منتهي الصلاحية.' };
}

export function getPublishedProducts(): PublicProduct[] {
  const db = ensureDb();
  return db.products.filter((p) => p.isPublished === true).map(stripPrivateProductFields);
}

export function getAllProductsAdmin(): Product[] {
  return [...ensureDb().products];
}

export function getProductByIdAdmin(id: string): Product | undefined {
  return ensureDb().products.find((p) => p.id === id);
}

export function createProduct(product: Product): Product {
  const db = ensureDb();
  db.products.unshift(product);
  saveDb(db);
  return product;
}

export function updateProduct(id: string, patch: Partial<Product>): Product | null {
  const db = ensureDb();
  const idx = db.products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  db.products[idx] = { ...db.products[idx], ...patch, id };
  saveDb(db);
  return db.products[idx];
}

export function deleteProduct(id: string): boolean {
  const db = ensureDb();
  const before = db.products.length;
  db.products = db.products.filter((p) => p.id !== id);
  if (db.products.length === before) return false;
  saveDb(db);
  return true;
}

export function getActiveBanners(): PromoBanner[] {
  return ensureDb().banners.filter((b) => b.isActive);
}

export function getAllBannersAdmin(): PromoBanner[] {
  return [...ensureDb().banners];
}

export function createBanner(banner: PromoBanner): PromoBanner {
  const db = ensureDb();
  db.banners.unshift(banner);
  saveDb(db);
  return banner;
}

export function updateBanner(id: string, patch: Partial<PromoBanner>): PromoBanner | null {
  const db = ensureDb();
  const idx = db.banners.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  db.banners[idx] = { ...db.banners[idx], ...patch, id };
  saveDb(db);
  return db.banners[idx];
}

export function deleteBanner(id: string): boolean {
  const db = ensureDb();
  const before = db.banners.length;
  db.banners = db.banners.filter((b) => b.id !== id);
  if (db.banners.length === before) return false;
  saveDb(db);
  return true;
}

function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizeSaudiPhone(raw: string): string {
  const digits = toWesternDigits(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00966') && digits.length >= 14) {
    return `0${digits.slice(5)}`;
  }
  if (digits.startsWith('966') && digits.length >= 12) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith('5') && digits.length === 9) {
    return `0${digits}`;
  }
  return digits;
}

function phonesMatch(a: string, b: string): boolean {
  const na = normalizeSaudiPhone(a);
  const nb = normalizeSaudiPhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 9 && nb.length >= 9) {
    return na.slice(-9) === nb.slice(-9);
  }
  return false;
}

function toCustomerProfile(c: StoredCustomer): CustomerProfile {
  const {
    passwordHash: ph,
    resetCodeHash: _rc,
    resetExpiresAt: _re,
    sharedProductsHistory,
    ...rest
  } = c;
  return {
    ...rest,
    loyaltyHistory: Array.isArray(rest.loyaltyHistory) ? rest.loyaltyHistory : [],
    sharedProductsCount: Object.keys(sharedProductsHistory || {}).length,
    hasPassword: Boolean(ph),
  };
}

function appendLoyaltyHistory(
  customer: StoredCustomer,
  entry: Omit<LoyaltyHistoryItem, 'id' | 'createdAt'>
): void {
  const item: LoyaltyHistoryItem = {
    id: `ly-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  customer.loyaltyHistory = [item, ...(customer.loyaltyHistory || [])].slice(0, 30);
}

export function registerCustomer(input: {
  name: string;
  phone?: string;
  email?: string;
  nationalAddress?: string;
  address?: string;
  password: string;
}): { customer?: CustomerProfile; error?: string } {
  const db = ensureDb();
  const rawPhone = (input.phone || '').trim();
  const normalizedPhone = rawPhone ? normalizeSaudiPhone(rawPhone) : '';
  const cleanEmail = (input.email || '').trim().toLowerCase();

  if (!cleanEmail && normalizedPhone.length < 9) {
    return { error: 'يرجى إدخال البريد الإلكتروني أو رقم جوال صحيح.' };
  }
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { error: 'يرجى إدخال بريد إلكتروني صحيح.' };
  }
  if (rawPhone && normalizedPhone.length < 9) {
    return { error: 'يرجى إدخال رقم جوال صحيح (مثال: 05XXXXXXXX).' };
  }
  if (normalizedPhone && db.customers.some((c) => c.phone && phonesMatch(c.phone, normalizedPhone))) {
    return { error: 'رقم الجوال مسجل مسبقاً. يرجى تسجيل الدخول.' };
  }
  if (cleanEmail && db.customers.some((c) => c.email?.toLowerCase() === cleanEmail)) {
    return { error: 'البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول.' };
  }
  const customer: StoredCustomer = {
    id: `cust-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    phone: normalizedPhone,
    email: cleanEmail || undefined,
    nationalAddress: input.nationalAddress?.trim() || '',
    address: input.address?.trim() || '',
    goldenCoins: 0,
    coupons: [],
    loyaltyHistory: [],
    sharedProductsHistory: {},
    passwordHash: hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };
  db.customers.unshift(customer);
  saveDb(db);
  return { customer: toCustomerProfile(customer) };
}

export function loginCustomer(phoneOrEmail: string, password: string): CustomerProfile | null {
  const db = ensureDb();
  const clean = phoneOrEmail.trim();
  const isEmail = clean.includes('@');
  const found = db.customers.find((c) =>
    isEmail ? c.email?.toLowerCase() === clean.toLowerCase() : phonesMatch(c.phone, clean)
  );
  if (!found || !found.passwordHash) return null;
  if (!verifyPassword(password, found.passwordHash)) return null;
  return toCustomerProfile(found);
}

export function upsertGoogleCustomer(input: {
  googleUid: string;
  email: string;
  name?: string;
  existingCustomerId?: string;
}): { customer?: CustomerProfile; error?: string } {
  const db = ensureDb();
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanName = input.name?.trim() || cleanEmail.split('@')[0] || 'عميل التاج الذهبي';

  if (input.existingCustomerId) {
    const existingIdx = db.customers.findIndex((c) => c.id === input.existingCustomerId);
    if (existingIdx !== -1) {
      const conflict = db.customers.find(
        (c) =>
          c.id !== input.existingCustomerId &&
          ((c.googleUid && c.googleUid === input.googleUid) ||
            (c.email && c.email.toLowerCase() === cleanEmail))
      );
      if (conflict) {
        return { error: 'حساب Google هذا مرتبط بحساب عميل آخر مسبقاً.' };
      }
      db.customers[existingIdx] = {
        ...db.customers[existingIdx],
        googleUid: input.googleUid,
        email: db.customers[existingIdx].email || cleanEmail,
        name: db.customers[existingIdx].name || cleanName,
      };
      saveDb(db);
      return { customer: toCustomerProfile(db.customers[existingIdx]) };
    }
  }

  const matchedIdx = db.customers.findIndex(
    (c) =>
      c.googleUid === input.googleUid ||
      (c.email && c.email.toLowerCase() === cleanEmail)
  );

  if (matchedIdx !== -1) {
    db.customers[matchedIdx] = {
      ...db.customers[matchedIdx],
      googleUid: input.googleUid,
      email: db.customers[matchedIdx].email || cleanEmail,
      name: db.customers[matchedIdx].name || cleanName,
    };
    saveDb(db);
    return { customer: toCustomerProfile(db.customers[matchedIdx]) };
  }

  const created: StoredCustomer = {
    id: `cust-${crypto.randomUUID().slice(0, 8)}`,
    name: cleanName,
    phone: '',
    email: cleanEmail,
    googleUid: input.googleUid,
    nationalAddress: '',
    address: '',
    goldenCoins: 0,
    coupons: [],
    loyaltyHistory: [],
    sharedProductsHistory: {},
    passwordHash: '',
    createdAt: new Date().toISOString(),
  };
  db.customers.unshift(created);
  saveDb(db);
  return { customer: toCustomerProfile(created) };
}

export function getCustomerById(id: string): CustomerProfile | null {
  const found = ensureDb().customers.find((c) => c.id === id);
  if (!found) return null;
  return toCustomerProfile(found);
}

export function requestCustomerPasswordReset(
  phoneInput: string
): { ok: true; code: string; phone: string } | { ok: false; error: string } {
  const db = ensureDb();
  const clean = phoneInput.trim();
  const idx = db.customers.findIndex((c) =>
    clean.includes('@')
      ? c.email?.toLowerCase() === clean.toLowerCase()
      : phonesMatch(c.phone, clean)
  );
  if (idx === -1) {
    return { ok: false, error: 'لا يوجد حساب عميل مسجل بهذه البيانات.' };
  }
  const code = String(crypto.randomInt(100000, 999999));
  db.customers[idx].resetCodeHash = hashPassword(code);
  db.customers[idx].resetExpiresAt = Date.now() + 15 * 60 * 1000;
  saveDb(db);
  return { ok: true, code, phone: db.customers[idx].phone || db.customers[idx].email || clean };
}

export function confirmCustomerPasswordReset(
  phoneInput: string,
  code: string,
  newPassword: string
): { ok: true; customer: CustomerProfile } | { ok: false; error: string } {
  const db = ensureDb();
  const clean = phoneInput.trim();
  const idx = db.customers.findIndex((c) =>
    clean.includes('@')
      ? c.email?.toLowerCase() === clean.toLowerCase()
      : phonesMatch(c.phone, clean)
  );
  if (idx === -1) {
    return { ok: false, error: 'لا يوجد حساب عميل مسجل بهذه البيانات.' };
  }
  const customer = db.customers[idx];
  if (!customer.resetCodeHash || !customer.resetExpiresAt || Date.now() > customer.resetExpiresAt) {
    return { ok: false, error: 'انتهت صلاحية رمز التحقق أو لم يتم طلبه بعد.' };
  }
  if (!verifyPassword(toWesternDigits(code.trim()), customer.resetCodeHash)) {
    return { ok: false, error: 'رمز التحقق غير صحيح.' };
  }
  customer.passwordHash = hashPassword(newPassword);
  delete customer.resetCodeHash;
  delete customer.resetExpiresAt;
  saveDb(db);
  return { ok: true, customer: toCustomerProfile(customer) };
}

export function changeCustomerPassword(
  customerId: string,
  currentPassword: string,
  newPassword: string
): { ok: true; customer: CustomerProfile } | { ok: false; error: string } {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return { ok: false, error: 'الحساب غير موجود.' };
  if (db.customers[idx].passwordHash && !verifyPassword(currentPassword, db.customers[idx].passwordHash)) {
    return { ok: false, error: 'كلمة المرور الحالية غير صحيحة.' };
  }
  db.customers[idx].passwordHash = hashPassword(newPassword);
  saveDb(db);
  return { ok: true, customer: toCustomerProfile(db.customers[idx]) };
}

export function updateCustomerProfile(
  id: string,
  patch: {
    name?: string;
    phone?: string;
    email?: string;
    nationalAddress?: string;
    address?: string;
  }
): { customer?: CustomerProfile; error?: string } {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === id);
  if (idx === -1) return { error: 'الحساب غير موجود.' };

  let nextPhone = db.customers[idx].phone;
  if (patch.phone !== undefined) {
    const trimmedPhone = patch.phone.trim();
    if (trimmedPhone) {
      const normalizedPhone = normalizeSaudiPhone(trimmedPhone);
      if (normalizedPhone.length < 9) {
        return { error: 'يرجى إدخال رقم جوال صحيح (مثال: 05XXXXXXXX).' };
      }
      if (db.customers.some((c) => c.id !== id && phonesMatch(c.phone, normalizedPhone))) {
        return { error: 'رقم الجوال مستخدم في حساب عميل آخر.' };
      }
      nextPhone = normalizedPhone;
    } else if (db.customers[idx].email) {
      nextPhone = '';
    } else {
      return { error: 'يرجى إدخال رقم جوال صحيح.' };
    }
  }

  let nextEmail = db.customers[idx].email;
  if (patch.email !== undefined) {
    const cleanedEmail = patch.email.trim().toLowerCase();
    if (
      cleanedEmail &&
      db.customers.some((c) => c.id !== id && c.email?.toLowerCase() === cleanedEmail)
    ) {
      return { error: 'البريد الإلكتروني مستخدم في حساب عميل آخر.' };
    }
    nextEmail = cleanedEmail || undefined;
  }

  db.customers[idx] = {
    ...db.customers[idx],
    name: patch.name !== undefined ? patch.name.trim() : db.customers[idx].name,
    phone: nextPhone,
    email: nextEmail,
    nationalAddress:
      patch.nationalAddress !== undefined
        ? patch.nationalAddress.trim()
        : db.customers[idx].nationalAddress,
    address: patch.address !== undefined ? patch.address.trim() : db.customers[idx].address,
  };
  saveDb(db);
  return { customer: toCustomerProfile(db.customers[idx]) };
}

export function getAllCustomersAdmin(): CustomerProfile[] {
  return ensureDb().customers.map(toCustomerProfile);
}

export function createOrder(order: Order): Order {
  const db = ensureDb();
  db.orders.unshift(order);
  saveDb(db);
  return order;
}

export function getAllOrdersAdmin(): Order[] {
  return [...ensureDb().orders];
}

export function getOrdersForCustomer(customerId: string): Order[] {
  return ensureDb().orders.filter((o) => o.customerId === customerId);
}

export function updateOrderStatus(
  id: string,
  patch: {
    status?: OrderStatus;
    shippingCompany?: string;
    trackingNumber?: string;
    shippingNotice?: string;
  }
): Order | null {
  const db = ensureDb();
  const idx = db.orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  db.orders[idx] = {
    ...db.orders[idx],
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.shippingCompany !== undefined
      ? { shippingCompany: patch.shippingCompany.trim() }
      : {}),
    ...(patch.trackingNumber !== undefined
      ? { trackingNumber: patch.trackingNumber.trim() }
      : {}),
    ...(patch.shippingNotice !== undefined
      ? { shippingNotice: patch.shippingNotice.trim() }
      : {}),
  };
  saveDb(db);
  return db.orders[idx];
}

export function claimDailyCoins(customerId: string): {
  customer?: CustomerProfile;
  awardedCoins?: number;
  error?: string;
} {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return { error: 'الحساب غير موجود.' };
  if (db.settings.loyaltyEnabled === false) {
    return { error: 'نظام العملات الذهبية متوقف حالياً من قبل المالك.' };
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  const current = db.customers[idx];
  if (current.lastDailyClaimDate === today) {
    return { error: 'تم استلام مكافأة الدخول اليومي لهذا اليوم مسبقاً. عد غداً!' };
  }
  const rawDaily = Number(db.settings.dailyCheckinCoins);
  const award =
    db.settings.dailyCheckinCoins !== undefined && Number.isFinite(rawDaily)
      ? Math.max(0, Math.floor(rawDaily))
      : 25;
  current.goldenCoins = (current.goldenCoins || 0) + award;
  current.lastDailyClaimDate = today;
  if (award > 0) {
    appendLoyaltyHistory(current, {
      type: 'daily',
      points: award,
      description: 'مكافأة تسجيل الدخول اليومي',
    });
  }
  db.customers[idx] = current;
  saveDb(db);
  return { customer: toCustomerProfile(current), awardedCoins: award };
}

export function awardProductSharePoints(
  customerId: string,
  params: { productId?: string; productTitle?: string; channel?: string }
): {
  customer?: CustomerProfile;
  awardedCoins?: number;
  alreadySharedToday?: boolean;
  error?: string;
} {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return { error: 'الحساب غير موجود.' };
  if (db.settings.loyaltyEnabled === false) {
    return { error: 'نظام نقاط الولاء متوقف حالياً من قبل المالك.' };
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  const current = db.customers[idx];
  const shareKey = (params.productId || 'store').trim() || 'store';
  const shareMap = current.sharedProductsHistory || {};
  if (shareMap[shareKey] === today) {
    return {
      customer: toCustomerProfile(current),
      awardedCoins: 0,
      alreadySharedToday: true,
    };
  }
  const rawShare = Number(db.settings.coinsPerProductShare);
  const award =
    db.settings.coinsPerProductShare !== undefined && Number.isFinite(rawShare)
      ? Math.max(0, Math.floor(rawShare))
      : 15;
  current.goldenCoins = (current.goldenCoins || 0) + award;
  current.sharedProductsHistory = {
    ...shareMap,
    [shareKey]: today,
  };
  if (award > 0) {
    const cleanTitle = params.productTitle?.trim();
    appendLoyaltyHistory(current, {
      type: 'share',
      points: award,
      description: cleanTitle
        ? `مكافأة مشاركة المنتج: ${cleanTitle}`
        : 'مكافأة مشاركة متجر التاج الذهبي',
    });
  }
  db.customers[idx] = current;
  saveDb(db);
  return {
    customer: toCustomerProfile(current),
    awardedCoins: award,
    alreadySharedToday: false,
  };
}

export function convertCoinsToCoupon(
  customerId: string,
  coinsToSpend: number
): {
  customer?: CustomerProfile;
  coupon?: LoyaltyCoupon;
  error?: string;
} {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return { error: 'الحساب غير موجود.' };
  if (db.settings.loyaltyEnabled === false) {
    return { error: 'نظام العملات الذهبية متوقف حالياً.' };
  }
  const cleanCoins = Math.floor(Number(coinsToSpend) || 0);
  if (cleanCoins < 5) {
    return { error: 'الحد الأدنى لتحويل النقاط إلى كوبون خصم هو 5 نقاط.' };
  }
  const current = db.customers[idx];
  const balance = current.goldenCoins || 0;
  if (balance < cleanCoins) {
    return { error: 'رصيدك من نقاط الولاء غير كافٍ.' };
  }
  const rawCoinVal = Number(db.settings.coinValueSar);
  const coinValue =
    db.settings.coinValueSar !== undefined && Number.isFinite(rawCoinVal) && rawCoinVal > 0
      ? rawCoinVal
      : 0.1;
  const discountSar = Number((cleanCoins * coinValue).toFixed(2));
  const coupon: LoyaltyCoupon = {
    code: `TAJ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    coinsSpent: cleanCoins,
    discountSar,
    isUsed: false,
    createdAt: new Date().toISOString(),
  };
  current.goldenCoins = balance - cleanCoins;
  current.coupons = [coupon, ...(current.coupons || [])];
  appendLoyaltyHistory(current, {
    type: 'redeem',
    points: -cleanCoins,
    description: `تحويل ${cleanCoins} نقطة إلى كود خصم فوري ${coupon.code} (${discountSar} ر.س)`,
  });
  db.customers[idx] = current;
  saveDb(db);
  return { customer: toCustomerProfile(current), coupon };
}

export function validatePromoDiscountCode(
  codeInput: string,
  subtotalSar: number
):
  | {
      valid: true;
      code: string;
      discountType: 'percent' | 'fixed';
      discountValue: number;
      discountSar: number;
    }
  | { valid: false; error: string } {
  const db = ensureDb();
  const clean = codeInput.trim().toUpperCase();
  if (clean.length !== 4) {
    return { valid: false, error: 'يجب أن يتكون رمز كود الخصم من 4 خانات.' };
  }
  const found = (db.settings.promoDiscountCodes || []).find(
    (p) => p.isActive && p.code.trim().toUpperCase() === clean
  );
  if (!found) {
    return { valid: false, error: 'كود الخصم غير صحيح أو غير مفعل حالياً.' };
  }
  const rawDiscount =
    found.discountType === 'percent'
      ? (subtotalSar * Math.min(100, Math.max(0, Number(found.discountValue) || 0))) / 100
      : Math.max(0, Number(found.discountValue) || 0);
  const discountSar = Number(Math.min(subtotalSar, rawDiscount).toFixed(2));
  return {
    valid: true,
    code: found.code.toUpperCase(),
    discountType: found.discountType,
    discountValue: found.discountValue,
    discountSar,
  };
}

export function applyLoyaltyAndAwardOnOrder(params: {
  customerId?: string;
  subtotalSar: number;
  redeemCoins?: number;
  couponCode?: string;
  orderId: string;
}): {
  discountSar: number;
  coinsRedeemed: number;
  couponCodeUsed?: string;
  coinsEarned: number;
  updatedCustomer?: CustomerProfile;
  error?: string;
} {
  const db = ensureDb();
  let discountSar = 0;
  let coinsRedeemed = 0;
  let couponCodeUsed: string | undefined;

  const cleanInputCode = params.couponCode?.trim().toUpperCase();
  const promoCodes = db.settings.promoDiscountCodes || [];
  const promoIdx = cleanInputCode
    ? promoCodes.findIndex((p) => p.isActive && p.code.trim().toUpperCase() === cleanInputCode)
    : -1;

  if (promoIdx !== -1) {
    const promo = promoCodes[promoIdx];
    const rawDiscount =
      promo.discountType === 'percent'
        ? (params.subtotalSar * Math.min(100, Math.max(0, Number(promo.discountValue) || 0))) /
          100
        : Math.max(0, Number(promo.discountValue) || 0);
    discountSar = Number(Math.min(params.subtotalSar, rawDiscount).toFixed(2));
    promoCodes[promoIdx] = {
      ...promo,
      usageCount: (promo.usageCount || 0) + 1,
    };
    db.settings.promoDiscountCodes = promoCodes;
    couponCodeUsed = promo.code.toUpperCase();
    saveDb(db);
  }

  if (!params.customerId || db.settings.loyaltyEnabled === false) {
    return {
      discountSar,
      coinsRedeemed: 0,
      couponCodeUsed,
      coinsEarned: 0,
    };
  }
  const idx = db.customers.findIndex((c) => c.id === params.customerId);
  if (idx === -1) {
    return {
      discountSar,
      coinsRedeemed: 0,
      couponCodeUsed,
      coinsEarned: 0,
    };
  }

  const current = db.customers[idx];
  const rawOrderCoinVal = Number(db.settings.coinValueSar);
  const coinValue =
    db.settings.coinValueSar !== undefined && Number.isFinite(rawOrderCoinVal) && rawOrderCoinVal > 0
      ? rawOrderCoinVal
      : 0.1;

  if (!couponCodeUsed && cleanInputCode) {
    const coupons = current.coupons || [];
    const cIdx = coupons.findIndex((c) => c.code.toUpperCase() === cleanInputCode && !c.isUsed);
    if (cIdx === -1) {
      return {
        discountSar: 0,
        coinsRedeemed: 0,
        coinsEarned: 0,
        error: 'كود الكوبون أو الخصم غير صالح أو تم استخدامه مسبقاً.',
      };
    }
    discountSar = Math.min(params.subtotalSar, coupons[cIdx].discountSar);
    coupons[cIdx] = { ...coupons[cIdx], isUsed: true, usedOnOrderId: params.orderId };
    current.coupons = coupons;
    couponCodeUsed = coupons[cIdx].code;
  } else if (!couponCodeUsed && params.redeemCoins && params.redeemCoins > 0) {
    const requested = Math.floor(Number(params.redeemCoins) || 0);
    const available = current.goldenCoins || 0;
    if (requested > available) {
      return {
        discountSar: 0,
        coinsRedeemed: 0,
        coinsEarned: 0,
        error: 'رصيد العملات الذهبية المختار يتجاوز رصيدك المتاح.',
      };
    }
    const maxUsableCoins = Math.floor(params.subtotalSar / coinValue);
    coinsRedeemed = Math.min(requested, maxUsableCoins);
    discountSar = Number(Math.min(params.subtotalSar, coinsRedeemed * coinValue).toFixed(2));
    current.goldenCoins = available - coinsRedeemed;
    if (coinsRedeemed > 0) {
      appendLoyaltyHistory(current, {
        type: 'redeem',
        points: -coinsRedeemed,
        description: `استبدال نقاط عند إتمام الطلب ${params.orderId} (خصم ${discountSar} ر.س)`,
      });
    }
  }

  const finalPaidSar = Math.max(0, params.subtotalSar - discountSar);
  const rawRate = Number(db.settings.coinsPer100SarPurchase);
  const ratePer100 =
    db.settings.coinsPer100SarPurchase !== undefined && Number.isFinite(rawRate)
      ? Math.max(0, rawRate)
      : 50;
  const coinsEarned = Math.floor((finalPaidSar / 100) * ratePer100);
  current.goldenCoins = (current.goldenCoins || 0) + coinsEarned;
  if (coinsEarned > 0) {
    appendLoyaltyHistory(current, {
      type: 'purchase',
      points: coinsEarned,
      description: `مكافأة عملية شراء — الطلب ${params.orderId}`,
    });
  }

  db.customers[idx] = current;
  saveDb(db);
  return {
    discountSar,
    coinsRedeemed,
    couponCodeUsed,
    coinsEarned,
    updatedCustomer: toCustomerProfile(current),
  };
}

export function adjustCustomerCoinsAdmin(
  customerId: string,
  newBalance: number
): CustomerProfile | null {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return null;
  db.customers[idx] = {
    ...db.customers[idx],
    goldenCoins: Math.max(0, Math.floor(Number(newBalance) || 0)),
  };
  saveDb(db);
  return toCustomerProfile(db.customers[idx]);
}

export function getAssistantMessages(): AssistantMessage[] {
  return [...(ensureDb().assistantMessages || [])];
}

export function appendAssistantMessage(msg: AssistantMessage): AssistantMessage {
  const db = ensureDb();
  const list = db.assistantMessages || [];
  list.push(msg);
  db.assistantMessages = list.slice(-40);
  saveDb(db);
  return msg;
}

export function getOwnerAlertsAndDigest(): {
  alerts: OwnerAlert[];
  whatsappDigestText: string;
} {
  const db = ensureDb();
  const now = new Date().toISOString();
  const alerts: OwnerAlert[] = [];

  const outOfStock = db.products.filter((p) => !p.inStock);
  if (outOfStock.length > 0) {
    alerts.push({
      id: 'alert-out-of-stock',
      level: 'urgent',
      title: `تنبيه مخزون: ${outOfStock.length} منتج غير متوفر حالياً`,
      detail: outOfStock.map((p) => p.name).join(' ، '),
      createdAt: now,
    });
  }

  const drafts = db.products.filter((p) => !p.isPublished);
  if (drafts.length > 0) {
    alerts.push({
      id: 'alert-drafts',
      level: 'warning',
      title: `مسودات سرية بانتظار المراجعة (${drafts.length})`,
      detail: drafts.map((p) => p.name).join(' ، '),
      createdAt: now,
    });
  }

  const missingSeo = db.products.filter(
    (p) => p.isPublished && (!p.seoKeywords || p.seoKeywords.length === 0)
  );
  if (missingSeo.length > 0) {
    alerts.push({
      id: 'alert-seo',
      level: 'info',
      title: `منتجات تحتاج تحديث SEO (${missingSeo.length})`,
      detail: missingSeo.map((p) => p.name).join(' ، '),
      createdAt: now,
    });
  }

  const pendingOrders = db.orders.filter((o) => o.status === 'قيد المراجعة');
  if (pendingOrders.length > 0) {
    alerts.push({
      id: 'alert-pending-orders',
      level: 'urgent',
      title: `طلبات جديدة قيد المراجعة (${pendingOrders.length})`,
      detail: pendingOrders
        .slice(0, 3)
        .map((o) => `${o.id} - ${o.customerName} (${o.totalSar} ر.س)`)
        .join(' | '),
      createdAt: now,
    });
  }

  const publishedCount = db.products.filter((p) => p.isPublished).length;
  const totalSales = db.orders
    .filter((o) => o.status !== 'ملغي')
    .reduce((s, o) => s + o.totalSar, 0);

  const lines = [
    `تقرير المساعد الشخصي - ${db.settings.storeName}`,
    `التاريخ: ${new Date().toLocaleString('ar-SA')}`,
    `----------------`,
    `• المنتجات المنشورة: ${publishedCount} | المسودات السرية: ${drafts.length}`,
    `• منتجات غير متوفرة: ${outOfStock.length}`,
    `• إجمالي الطلبات: ${db.orders.length} (قيد المراجعة: ${pendingOrders.length})`,
    `• إجمالي المبيعات: ${totalSales.toLocaleString('ar-SA')} ريال سعودي`,
    `• العملاء المسجلون: ${db.customers.length}`,
  ];

  if (alerts.length > 0) {
    lines.push(`----------------`, `التنبيهات النشطة:`);
    alerts.forEach((a) => lines.push(`- ${a.title}: ${a.detail}`));
  }

  return {
    alerts,
    whatsappDigestText: lines.join('\n'),
  };
}

export async function notifyOwnerWebhookIfConfigured(
  event: string,
  message: string
): Promise<boolean> {
  const settings = getAdminSettings();
  if (!settings.autoWhatsappAlertsEnabled || !settings.ownerWhatsappWebhookUrl?.trim()) {
    return false;
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    await fetch(settings.ownerWhatsappWebhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        event,
        storeName: settings.storeName,
        whatsappNumber: settings.ownerPersonalWhatsapp,
        message,
        timestamp: new Date().toISOString(),
      }),
    });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

export function getAllApprovedReviews(): ProductReview[] {
  return [...(ensureDb().reviews || [])].filter((r) => r.approved);
}

export function getApprovedReviewsForProduct(productId: string): ProductReview[] {
  return getAllApprovedReviews().filter((r) => r.productId === productId);
}

export function addProductReview(input: {
  productId: string;
  customerName: string;
  rating: number;
  comment: string;
}): ProductReview {
  const db = ensureDb();
  const review: ProductReview = {
    id: `rev-${crypto.randomUUID().slice(0, 8)}`,
    productId: input.productId,
    customerName: input.customerName.trim().slice(0, 80),
    rating: Math.max(1, Math.min(5, Math.round(Number(input.rating) || 5))),
    comment: input.comment.trim().slice(0, 800),
    approved: false,
    createdAt: new Date().toISOString(),
  };
  db.reviews = [review, ...(db.reviews || [])];
  saveDb(db);
  return review;
}

// ==========================================
// OWNER WALLET & PURCHASING
// ==========================================

function ensureWalletRef(db: DatabaseSchema): OwnerWallet {
  if (!db.ownerWallet) {
    db.ownerWallet = {
      balanceSar: 0,
      totalDepositedSar: 0,
      totalSpentSar: 0,
      transferredOrderIds: [],
      transactions: [],
      updatedAt: new Date().toISOString(),
    };
  }
  return db.ownerWallet;
}

export function getOwnerWalletSummaryAdmin(): {
  wallet: OwnerWallet;
  availableSalesTransferSar: number;
  availableOrdersCount: number;
} {
  const db = ensureDb();
  const wallet = ensureWalletRef(db);
  const transferredSet = new Set(wallet.transferredOrderIds || []);
  const eligibleOrders = db.orders.filter(
    (o) =>
      o.status !== 'ملغي' &&
      o.paymentMethod !== 'owner_wallet' &&
      !transferredSet.has(o.id)
  );
  const availableSalesTransferSar = Number(
    eligibleOrders.reduce((sum, o) => sum + (Number(o.totalSar) || 0), 0).toFixed(2)
  );
  return {
    wallet: {
      ...wallet,
      transactions: [...(wallet.transactions || [])],
      transferredOrderIds: [...(wallet.transferredOrderIds || [])],
    },
    availableSalesTransferSar,
    availableOrdersCount: eligibleOrders.length,
  };
}

export function depositToOwnerWalletAdmin(params: {
  amountSar: number;
  note?: string;
  reference?: string;
}): {
  wallet?: OwnerWallet;
  transaction?: OwnerWalletTransaction;
  availableSalesTransferSar?: number;
  availableOrdersCount?: number;
  error?: string;
} {
  const amount = Number(Number(params.amountSar).toFixed(2));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'يرجى إدخال مبلغ إيداع صحيح أكبر من صفر بالريال السعودي.' };
  }
  const db = ensureDb();
  const wallet = ensureWalletRef(db);
  const nextBalance = Number((wallet.balanceSar + amount).toFixed(2));
  const now = new Date().toISOString();
  const tx: OwnerWalletTransaction = {
    id: `WAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    type: 'deposit',
    amountSar: amount,
    balanceAfterSar: nextBalance,
    title: params.note?.trim() || 'إيداع وشحن رصيد محفظة المالك',
    category: 'تغذية المحفظة',
    reference: params.reference?.trim() || undefined,
    createdAt: now,
  };
  wallet.balanceSar = nextBalance;
  wallet.totalDepositedSar = Number((wallet.totalDepositedSar + amount).toFixed(2));
  wallet.transactions = [tx, ...(wallet.transactions || [])].slice(0, 100);
  wallet.updatedAt = now;
  db.ownerWallet = wallet;
  saveDb(db);

  const summary = getOwnerWalletSummaryAdmin();
  return {
    wallet: summary.wallet,
    transaction: tx,
    availableSalesTransferSar: summary.availableSalesTransferSar,
    availableOrdersCount: summary.availableOrdersCount,
  };
}

export function transferSalesRevenueToWalletAdmin(): {
  wallet?: OwnerWallet;
  transferredSar?: number;
  ordersCount?: number;
  transaction?: OwnerWalletTransaction;
  availableSalesTransferSar?: number;
  availableOrdersCount?: number;
  error?: string;
} {
  const db = ensureDb();
  const wallet = ensureWalletRef(db);
  const transferredSet = new Set(wallet.transferredOrderIds || []);
  const eligibleOrders = db.orders.filter(
    (o) =>
      o.status !== 'ملغي' &&
      o.paymentMethod !== 'owner_wallet' &&
      !transferredSet.has(o.id)
  );
  const transferAmount = Number(
    eligibleOrders.reduce((sum, o) => sum + (Number(o.totalSar) || 0), 0).toFixed(2)
  );
  if (eligibleOrders.length === 0 || transferAmount <= 0) {
    return { error: 'لا توجد إيرادات طلبات جديدة غير مرحّلة إلى المحفظة حالياً.' };
  }
  const nextBalance = Number((wallet.balanceSar + transferAmount).toFixed(2));
  const now = new Date().toISOString();
  const tx: OwnerWalletTransaction = {
    id: `WAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    type: 'sales_transfer',
    amountSar: transferAmount,
    balanceAfterSar: nextBalance,
    title: `ترحيل إيرادات ${eligibleOrders.length} طلب من مبيعات المتجر`,
    category: 'إيرادات المبيعات',
    reference: eligibleOrders
      .slice(0, 5)
      .map((o) => o.id)
      .join('، '),
    createdAt: now,
  };
  wallet.balanceSar = nextBalance;
  wallet.totalDepositedSar = Number((wallet.totalDepositedSar + transferAmount).toFixed(2));
  wallet.transferredOrderIds = [
    ...(wallet.transferredOrderIds || []),
    ...eligibleOrders.map((o) => o.id),
  ];
  wallet.transactions = [tx, ...(wallet.transactions || [])].slice(0, 100);
  wallet.updatedAt = now;
  db.ownerWallet = wallet;
  saveDb(db);

  const summary = getOwnerWalletSummaryAdmin();
  return {
    wallet: summary.wallet,
    transferredSar: transferAmount,
    ordersCount: eligibleOrders.length,
    transaction: tx,
    availableSalesTransferSar: summary.availableSalesTransferSar,
    availableOrdersCount: summary.availableOrdersCount,
  };
}

export function purchaseWithOwnerWalletAdmin(params: {
  mode: 'product' | 'external';
  productId?: string;
  quantity?: number;
  priceBasis?: 'cost' | 'wholesale' | 'retail';
  title?: string;
  category?: string;
  amountSar?: number;
  reference?: string;
  recordStoreOrder?: boolean;
}): {
  wallet?: OwnerWallet;
  transaction?: OwnerWalletTransaction;
  order?: Order;
  availableSalesTransferSar?: number;
  availableOrdersCount?: number;
  error?: string;
} {
  const db = ensureDb();
  const wallet = ensureWalletRef(db);
  const now = new Date().toISOString();

  let finalAmount = 0;
  let txTitle = '';
  let txCategory = params.category?.trim() || 'مشتريات المالك';
  let purchasedProduct: Product | undefined;
  let qty = 1;

  if (params.mode === 'product') {
    purchasedProduct = db.products.find((p) => p.id === params.productId);
    if (!purchasedProduct) {
      return { error: 'يرجى اختيار منتج صالح للشراء من المحفظة.' };
    }
    qty = Math.max(1, Math.min(999, Math.floor(Number(params.quantity) || 1)));
    const basis = params.priceBasis || 'wholesale';
    const unitPrice =
      basis === 'cost' && typeof purchasedProduct.costPriceSar === 'number' && purchasedProduct.costPriceSar > 0
        ? purchasedProduct.costPriceSar
        : basis === 'wholesale' &&
            typeof purchasedProduct.wholesalePriceSar === 'number' &&
            purchasedProduct.wholesalePriceSar > 0
          ? purchasedProduct.wholesalePriceSar
          : purchasedProduct.priceSar;
    finalAmount = Number((unitPrice * qty).toFixed(2));
    txTitle = `شراء ${purchasedProduct.name} (×${qty})`;
    txCategory = params.category?.trim() || 'شراء منتج من المتجر';
  } else {
    finalAmount = Number(Number(params.amountSar || 0).toFixed(2));
    txTitle = params.title?.trim() || '';
    if (!txTitle) {
      return { error: 'يرجى إدخال وصف عملية الشراء أو اسم المورد.' };
    }
  }

  if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
    return { error: 'يرجى إدخال مبلغ شراء صحيح أكبر من صفر.' };
  }

  if (wallet.balanceSar < finalAmount) {
    const missing = Number((finalAmount - wallet.balanceSar).toFixed(2));
    return {
      error: `رصيد محفظة المالك (${wallet.balanceSar.toLocaleString('ar-SA')} ر.س) غير كافٍ لإتمام الشراء. ينقصك ${missing.toLocaleString('ar-SA')} ر.س.`,
    };
  }

  const nextBalance = Number((wallet.balanceSar - finalAmount).toFixed(2));
  let createdOrder: Order | undefined;

  if (params.mode === 'product' && purchasedProduct && params.recordStoreOrder !== false) {
    const unitSar = Number((finalAmount / qty).toFixed(2));
    const orderId = `ORD-${crypto.randomInt(10000, 99999)}`;
    createdOrder = {
      id: orderId,
      customerName: 'شراء مباشر — محفظة المالك',
      customerPhone: db.settings.whatsappNumber || '0500000000',
      customerAddress: 'طلب داخلي مدفوع من محفظة المالك',
      items: [
        {
          productId: purchasedProduct.id,
          name: purchasedProduct.name,
          priceSar: unitSar,
          quantity: qty,
          image: (purchasedProduct.images || [])[0] || '',
        },
      ],
      subtotalSar: finalAmount,
      totalSar: finalAmount,
      totalUsd: Number((finalAmount * (db.settings.sarToUsdRate || 0.2667)).toFixed(2)),
      paymentMethod: 'owner_wallet',
      bankTransferRef: params.reference?.trim() || 'مدفوع من محفظة المالك',
      status: 'تم التأكيد',
      createdAt: now,
    };
    db.orders.unshift(createdOrder);
  }

  const tx: OwnerWalletTransaction = {
    id: `WAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    type: 'purchase',
    amountSar: -finalAmount,
    balanceAfterSar: nextBalance,
    title: txTitle,
    category: txCategory,
    reference: params.reference?.trim() || undefined,
    orderId: createdOrder?.id,
    productId: purchasedProduct?.id,
    quantity: purchasedProduct ? qty : undefined,
    createdAt: now,
  };

  wallet.balanceSar = nextBalance;
  wallet.totalSpentSar = Number((wallet.totalSpentSar + finalAmount).toFixed(2));
  wallet.transactions = [tx, ...(wallet.transactions || [])].slice(0, 100);
  wallet.updatedAt = now;
  db.ownerWallet = wallet;
  saveDb(db);

  const summary = getOwnerWalletSummaryAdmin();
  return {
    wallet: summary.wallet,
    transaction: tx,
    order: createdOrder,
    availableSalesTransferSar: summary.availableSalesTransferSar,
    availableOrdersCount: summary.availableOrdersCount,
  };
}

export function chargeOwnerWalletForCartOrder(params: {
  orderId: string;
  amountSar: number;
  itemSummary: string;
}): { wallet?: OwnerWallet; error?: string } {
  const db = ensureDb();
  const wallet = ensureWalletRef(db);
  const amount = Number(Number(params.amountSar).toFixed(2));
  if (amount <= 0) {
    return { wallet };
  }
  if (wallet.balanceSar < amount) {
    const missing = Number((amount - wallet.balanceSar).toFixed(2));
    return {
      error: `رصيد محفظة المالك (${wallet.balanceSar.toLocaleString('ar-SA')} ر.س) غير كافٍ. ينقصك ${missing.toLocaleString('ar-SA')} ر.س.`,
    };
  }
  const now = new Date().toISOString();
  const nextBalance = Number((wallet.balanceSar - amount).toFixed(2));
  const tx: OwnerWalletTransaction = {
    id: `WAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    type: 'purchase',
    amountSar: -amount,
    balanceAfterSar: nextBalance,
    title: `شراء عبر السلة — ${params.itemSummary || params.orderId}`,
    category: 'شراء من المتجر (السلة)',
    orderId: params.orderId,
    createdAt: now,
  };
  wallet.balanceSar = nextBalance;
  wallet.totalSpentSar = Number((wallet.totalSpentSar + amount).toFixed(2));
  wallet.transactions = [tx, ...(wallet.transactions || [])].slice(0, 100);
  wallet.updatedAt = now;
  db.ownerWallet = wallet;
  saveDb(db);
  return { wallet };
}

export function getAllReviewsAdmin(): ProductReview[] {
  return [...(ensureDb().reviews || [])];
}

export function approveReviewAdmin(id: string, approved: boolean): ProductReview | null {
  const db = ensureDb();
  const list = db.reviews || [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], approved };
  db.reviews = list;
  saveDb(db);
  return list[idx];
}

export function deleteReviewAdmin(id: string): boolean {
  const db = ensureDb();
  const list = db.reviews || [];
  const before = list.length;
  db.reviews = list.filter((r) => r.id !== id);
  if (db.reviews.length === before) return false;
  saveDb(db);
  return true;
}

export function recordStoreVisit(visitorId: string): void {
  const db = ensureDb();
  const analytics: StoredAnalytics = db.analytics || {
    totalVisits: 0,
    uniqueVisitorTokens: [],
    searchQueries: [],
    dailySearchCounts: {},
    updatedAt: new Date().toISOString(),
  };
  analytics.totalVisits += 1;
  const cleanId = visitorId.trim().slice(0, 64);
  if (cleanId && !analytics.uniqueVisitorTokens.includes(cleanId)) {
    analytics.uniqueVisitorTokens.push(cleanId);
    if (analytics.uniqueVisitorTokens.length > 5000) {
      analytics.uniqueVisitorTokens = analytics.uniqueVisitorTokens.slice(-5000);
    }
  }
  analytics.updatedAt = new Date().toISOString();
  db.analytics = analytics;
  saveDb(db);
}

export function recordSearchQuery(term: string): void {
  const clean = term.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (clean.length < 2) return;
  const db = ensureDb();
  const analytics: StoredAnalytics = db.analytics || {
    totalVisits: 0,
    uniqueVisitorTokens: [],
    searchQueries: [],
    dailySearchCounts: {},
    updatedAt: new Date().toISOString(),
  };
  const now = new Date().toISOString();
  const lower = clean.toLowerCase();
  const existingIdx = analytics.searchQueries.findIndex((q) => q.term.toLowerCase() === lower);
  if (existingIdx >= 0) {
    analytics.searchQueries[existingIdx] = {
      term: clean,
      count: analytics.searchQueries[existingIdx].count + 1,
      lastSearchedAt: now,
    };
  } else {
    analytics.searchQueries.unshift({
      term: clean,
      count: 1,
      lastSearchedAt: now,
    });
  }
  analytics.searchQueries.sort((a, b) => b.count - a.count);
  analytics.searchQueries = analytics.searchQueries.slice(0, 150);

  const dayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  const dailyMap = { ...(analytics.dailySearchCounts || {}) };
  dailyMap[dayKey] = (dailyMap[dayKey] || 0) + 1;
  analytics.dailySearchCounts = dailyMap;

  analytics.updatedAt = now;
  db.analytics = analytics;
  saveDb(db);
}

export function getOwnerAnalyticsAdmin(): SiteAnalytics {
  const db = ensureDb();
  const a = db.analytics || {
    totalVisits: 0,
    uniqueVisitorTokens: [],
    searchQueries: [],
    dailySearchCounts: {},
    updatedAt: new Date().toISOString(),
  };
  const dailyMap = a.dailySearchCounts || {};
  const dailySearches = Object.entries(dailyMap)
    .sort(([d1], [d2]) => d1.localeCompare(d2))
    .slice(-14)
    .map(([date, count]) => ({ date, count }));
  return {
    totalVisits: a.totalVisits,
    uniqueVisitors: a.uniqueVisitorTokens.length,
    searchQueries: [...a.searchQueries],
    dailySearches,
    updatedAt: a.updatedAt,
  };
}
