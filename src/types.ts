export interface ProductSpec {
  label: string;
  value: string;
}

export interface StoreCategory {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  sku?: string;
  name: string;
  nameEn?: string;
  category: string;
  priceSar: number;
  wholesalePriceSar?: number;
  compareAtPriceSar?: number;
  description: string;
  descriptionEn?: string;
  images: string[];
  specs: ProductSpec[];
  inStock: boolean;
  isPublished: boolean;
  installationGuidePdfUrl?: string;
  installationGuideImages?: string[];
  fuelEfficiencyGainPercent?: number;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  seoLastUpdated?: string;
  schemaMarkup?: Record<string, unknown>;
  createdAt: string;
  // Owner-only private fields (never sent to storefront clients)
  sourceUrl?: string;
  isScrapedDraft?: boolean;
  originalExtractedPrice?: string;
  costPriceSar?: number;
  profitMarginPercent?: number;
}

export type PublicProduct = Omit<
  Product,
  | 'sourceUrl'
  | 'isScrapedDraft'
  | 'originalExtractedPrice'
  | 'costPriceSar'
  | 'profitMarginPercent'
>;

export interface ProductReview {
  id: string;
  productId: string;
  customerName: string;
  rating: number;
  comment: string;
  approved: boolean;
  createdAt: string;
}

export type CurrencyCode = 'SAR' | 'AED' | 'KWD' | 'QAR' | 'BHD' | 'OMR';

export interface HeroFeature {
  title: string;
  description: string;
}

export interface SidebarVideoItem {
  id: string;
  title?: string;
  url: string;
}

export interface GroupChatMessage {
  id: string;
  senderName: string;
  roleTag?: string;
  message: string;
  accent?: 'owner_car' | 'engineer' | 'master' | 'manager';
}

export interface StoreSettings {
  storeName: string;
  storeTagline: string;
  categories: StoreCategory[];
  // Top Marquee Bar 1
  marqueeEnabled: boolean;
  marqueeText: string;
  marqueeBgColor: string;
  marqueeTextColor: string;
  marqueeSpeed: number;
  // Top Marquee Bar 2
  marquee2Enabled: boolean;
  marquee2Text: string;
  marquee2BgColor: string;
  marquee2TextColor: string;
  marquee2Speed: number;
  // Hero & Media Backgrounds
  heroEnabled: boolean;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaText: string;
  heroBackdropMode: 'auto' | 'image' | 'slideshow' | 'video';
  heroVideoUrl?: string;
  heroImageUrl: string;
  heroSlideshowImages: string[];
  heroAnimatedMotion?: 'none' | 'kenburns' | 'float' | 'pulse';
  heroBackdropFilter?: string;
  heroFeatures: HeroFeature[];
  // Left Sidebar Video Rail (Desktop 260x620/460, Mobile horizontal strip below hero)
  sidebarVideosEnabled?: boolean;
  sidebarVideoCount?: 3 | 4;
  sidebarVideos?: SidebarVideoItem[];
  // Global Storefront Background (Image, Animated Image/GIF, or Video)
  siteBackgroundType: 'none' | 'image' | 'video' | 'animated_image';
  siteBackgroundUrl: string;
  siteBackgroundOpacity: number;
  siteBackgroundAnimatedMotion?: 'none' | 'kenburns' | 'float' | 'pulse';
  siteBackgroundFilter?: string;
  // Store Availability (Open / Closed by Owner)
  storeOpen?: boolean;
  storeClosedTitle?: string;
  storeClosedMessage?: string;
  // Localization, Currency, Pricing & Installments
  allowLanguageSwitch?: boolean;
  defaultLanguage?: 'ar' | 'en';
  multiCurrencyEnabled?: boolean;
  currencyRates?: Record<CurrencyCode, number>;
  priceDisplayMode?: 'retail' | 'wholesale';
  installmentsEnabled?: boolean;
  showImageUrlFields?: boolean;
  // Theme & Commerce
  themePreset?: 'royal_gold' | 'titanium_exhaust' | 'carbon_amber' | 'stainless_silver' | 'custom';
  buttonStyle?: 'gold_wave' | 'standard' | 'exhaust_twin' | 'exhaust_flame';
  primaryGoldColor: string;
  backgroundColor: string;
  surfaceColor: string;
  whatsappNumber: string;
  contactEmail: string;
  paypalBusinessEmail: string;
  paypalMeUrl: string;
  paypalClientId?: string;
  paypalButtonsEnabled?: boolean;
  paypalCardEnabled?: boolean;
  bankTransferEnabled: boolean;
  bankName: string;
  bankAccountHolder: string;
  bankIban: string;
  bankAccountNumber: string;
  sarToUsdRate: number;
  instagramUrl: string;
  tiktokUrl: string;
  aboutUsText: string;
  showShippingLogos?: boolean;
  shippingCarriers?: string[];
  // Golden Coins Loyalty & Rewards
  loyaltyEnabled?: boolean;
  coinValueSar?: number;
  dailyCheckinCoins?: number;
  coinsPer100SarPurchase?: number;
  coinsPerProductShare?: number;
  // Ehsan & Charity Popup + Organizations
  charityPopupEnabled?: boolean;
  charityPopupTitle?: string;
  charityPopupVerse?: string;
  charityUrl?: string;
  charityOrganizations?: {
    id: string;
    name: string;
    description: string;
    url: string;
  }[];
  seoAutoUpdateEnabled: boolean;
  seoKeywords?: string[];
  seoLastAutoRun?: string;
  // Homepage Animated Group Chat Showcase
  groupChatEnabled?: boolean;
  groupChatTitle?: string;
  groupChatMessages?: GroupChatMessage[];
  // Owner-only private WhatsApp AI Assistant, Password Recovery, Promo Codes & 2FA settings
  promoDiscountCodes?: PromoDiscountCode[];
  ownerPersonalWhatsapp: string;
  ownerWhatsappWebhookUrl: string;
  autoWhatsappAlertsEnabled: boolean;
  ownerRecoveryEmail: string;
  ownerTwoFactorEnabled?: boolean;
  ownerTwoFactorMethod?: 'totp' | 'email';
}

export interface PromoDiscountCode {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  isActive: boolean;
  usageCount?: number;
  createdAt: string;
}

export type PublicSettings = Omit<
  StoreSettings,
  | 'paypalBusinessEmail'
  | 'promoDiscountCodes'
  | 'ownerPersonalWhatsapp'
  | 'ownerWhatsappWebhookUrl'
  | 'autoWhatsappAlertsEnabled'
  | 'ownerRecoveryEmail'
  | 'ownerTwoFactorEnabled'
  | 'ownerTwoFactorMethod'
  | 'showImageUrlFields'
> & {
  paypalMerchantLabel: string;
};

export interface PromoBanner {
  id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  discountLabel?: string;
  accentColor: string;
  isActive: boolean;
  googleAdsHeadlines?: string[];
  googleAdsDescriptions?: string[];
  googleAdsKeywords?: string[];
  createdAt: string;
}

export interface LoyaltyCoupon {
  code: string;
  coinsSpent: number;
  discountSar: number;
  isUsed: boolean;
  usedOnOrderId?: string;
  createdAt: string;
}

export interface LoyaltyHistoryItem {
  id: string;
  type: 'purchase' | 'share' | 'daily' | 'redeem';
  points: number;
  description: string;
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  googleUid?: string;
  hasPassword?: boolean;
  nationalAddress?: string;
  address: string;
  goldenCoins?: number;
  lastDailyClaimDate?: string;
  coupons?: LoyaltyCoupon[];
  loyaltyHistory?: LoyaltyHistoryItem[];
  sharedProductsCount?: number;
  createdAt: string;
}

export interface SearchGroundingSource {
  title: string;
  uri: string;
}

export interface VehicleCompatibilityResult {
  answer: string;
  sources: SearchGroundingSource[];
  recommendedProducts: PublicProduct[];
}

export interface OrderItem {
  productId: string;
  name: string;
  priceSar: number;
  quantity: number;
  image: string;
}

export type OrderStatus = 'قيد المراجعة' | 'تم التأكيد' | 'مكتمل' | 'ملغي';

export interface Order {
  id: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  nationalAddress?: string;
  customerAddress: string;
  shippingCompany?: string;
  trackingNumber?: string;
  shippingNotice?: string;
  items: OrderItem[];
  subtotalSar?: number;
  discountSar?: number;
  coinsRedeemed?: number;
  couponCodeUsed?: string;
  coinsEarned?: number;
  totalSar: number;
  totalUsd: number;
  paymentMethod: 'paypal' | 'bank_transfer' | 'whatsapp' | 'owner_wallet';
  paypalTransactionId?: string;
  bankTransferRef?: string;
  status: OrderStatus;
  createdAt: string;
}

export type OwnerWalletTxType = 'deposit' | 'sales_transfer' | 'purchase' | 'refund';

export interface OwnerWalletTransaction {
  id: string;
  type: OwnerWalletTxType;
  amountSar: number;
  balanceAfterSar: number;
  title: string;
  category?: string;
  reference?: string;
  orderId?: string;
  productId?: string;
  quantity?: number;
  createdAt: string;
}

export interface OwnerWallet {
  balanceSar: number;
  totalDepositedSar: number;
  totalSpentSar: number;
  transferredOrderIds?: string[];
  transactions: OwnerWalletTransaction[];
  updatedAt: string;
}

export interface CartItem {
  product: PublicProduct;
  quantity: number;
}

export interface StorefrontPayload {
  settings: PublicSettings;
  products: PublicProduct[];
  banners: PromoBanner[];
  reviews?: ProductReview[];
}

export interface GeneratedAdsCampaign {
  googleAdsHeadlines: string[];
  googleAdsDescriptions: string[];
  googleAdsKeywords: string[];
  banner: {
    title: string;
    subtitle: string;
    ctaText: string;
    discountLabel: string;
    accentColor: string;
  };
}

export interface OwnerAlert {
  id: string;
  level: 'warning' | 'info' | 'urgent';
  title: string;
  detail: string;
  createdAt: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actionsExecuted?: string[];
  whatsappAlertText?: string;
  createdAt: string;
}

export interface SearchLogEntry {
  term: string;
  count: number;
  lastSearchedAt: string;
}

export interface DailySearchPoint {
  date: string;
  count: number;
}

export interface SiteAnalytics {
  totalVisits: number;
  uniqueVisitors: number;
  searchQueries: SearchLogEntry[];
  dailySearches?: DailySearchPoint[];
  updatedAt: string;
}
