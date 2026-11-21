import { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  AlertCircle,
  Award,
  Check,
  Cloud,
  Coins,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Gift,
  Heart,
  History,
  LogOut,
  Package,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  ensureFirestoreUserProfile,
  getAccessToken,
  googleLogout,
  googleSignIn,
  initAuth,
  recordDriveBackupInFirestore,
} from '../firebase';
import { ensureDriveFolder, uploadFileToDrive } from '../services/googleDrive';
import {
  formatCurrencyPrice,
  getEffectivePriceSar,
  t,
  type StoreLanguage,
} from '../i18n';
import type {
  CurrencyCode,
  CustomerProfile,
  Order,
  PublicProduct,
  PublicSettings,
  VehicleCompatibilityResult,
} from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ResilientImage } from './ResilientImage';

interface CustomerAuthModalProps {
  open: boolean;
  initialTab?: 'account' | 'wishlist';
  customer: CustomerProfile | null;
  token: string | null;
  settings?: PublicSettings | null;
  currency?: CurrencyCode;
  lang?: StoreLanguage;
  wishlistProducts?: PublicProduct[];
  onToggleWishlist?: (productId: string) => void;
  onAddToCart?: (product: PublicProduct) => void;
  onSelectProduct?: (product: PublicProduct) => void;
  onUseCouponInCart?: (code: string) => void;
  onClose: () => void;
  onAuthSuccess: (customer: CustomerProfile, token: string) => void;
  onCustomerUpdated?: (customer: CustomerProfile) => void;
  onOwnerGoogleLogin?: (adminToken: string) => void;
  onLogout: () => void;
}

export function CustomerAuthModal({
  open,
  initialTab = 'account',
  customer,
  token,
  settings,
  currency = 'SAR',
  lang = 'ar',
  wishlistProducts = [],
  onToggleWishlist,
  onAddToCart,
  onSelectProduct,
  onUseCouponInCart,
  onClose,
  onAuthSuccess,
  onCustomerUpdated,
  onOwnerGoogleLogin,
  onLogout,
}: CustomerAuthModalProps) {
  const [portalTab, setPortalTab] = useState<'account' | 'wishlist' | 'advisor'>(initialTab);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'profile' | 'orders'>('overview');
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nationalAddress, setNationalAddress] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [acctCurrentPw, setAcctCurrentPw] = useState('');
  const [acctNewPw, setAcctNewPw] = useState('');
  const [showAcctPw, setShowAcctPw] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [coinsToConvert, setCoinsToConvert] = useState('50');
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [convertingCoupon, setConvertingCoupon] = useState(false);
  const [copiedCoupon, setCopiedCoupon] = useState('');
  const [lastCreatedCoupon, setLastCreatedCoupon] = useState<{
    code: string;
    discountSar: number;
  } | null>(null);

  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [uploadingDriveDoc, setUploadingDriveDoc] = useState(false);

  // Google Search Grounding Compatibility Advisor state
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [vehicleIssueOrCode, setVehicleIssueOrCode] = useState('');
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorResult, setAdvisorResult] = useState<VehicleCompatibilityResult | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (u, tk) => {
        setGoogleUser(u);
        setGoogleToken(tk);
      },
      (u) => {
        setGoogleUser(u);
        setGoogleToken(null);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (open) {
      setPortalTab(initialTab);
      setError('');
      setMessage('');
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open && customer && token) {
      setName(customer.name || '');
      setPhone(customer.phone || '');
      setEmail(customer.email || '');
      setNationalAddress(customer.nationalAddress || '');
      setAddress(customer.address || '');
      fetch('/api/customers/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.orders) setOrders(data.orders);
          if (data?.customer) onCustomerUpdated?.(data.customer);
        })
        .catch(() => {});
    }
  }, [open, customer?.id, token]);

  const handleCustomerGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        const idToken = await res.user.getIdToken();

        // Direct Owner Admin entry for dbattloth.221@gmail.com without asking for any password
        if (res.user.email?.trim().toLowerCase() === 'dbattloth.221@gmail.com' && onOwnerGoogleLogin) {
          const adminResp = await fetch('/api/admin/google-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ idToken }),
          });
          const adminData = await adminResp.json().catch(() => ({}));
          if (adminResp.ok && adminData?.token) {
            onOwnerGoogleLogin(adminData.token as string);
            return;
          }
          setError(adminData.error || 'تعذر فتح لوحة المالك بحساب Google.');
          return;
        }

        try {
          await ensureFirestoreUserProfile(res.user, {
            phone: phone || customer?.phone,
            nationalAddress: nationalAddress || customer?.nationalAddress,
            address: address || customer?.address,
          });
        } catch {
          // Non-blocking profile sync
        }

        // Authenticate / link into the Store Customer Portal automatically
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
          const authResp = await fetch('/api/customers/google-auth', {
            method: 'POST',
            headers,
            body: JSON.stringify({ idToken }),
          });
          const authData = await authResp.json();
          if (authResp.ok && authData.customer && authData.token) {
            onAuthSuccess(authData.customer, authData.token);
            setPortalTab('account');
            setDashboardTab('overview');
            setMessage(
              lang === 'en'
                ? `Signed in via Google (${res.user.email}) — Dashboard & Drive synced.`
                : `تم تسجيل الدخول بحساب Google (${res.user.email}) وفتح لوحة العميل ومزامنة Drive بنجاح.`
            );
            return;
          }
        } catch {
          // If backend customer link fails, keep Firebase + Firestore sync notice
        }

        setMessage(
          lang === 'en'
            ? `Signed in with Google (${res.user.email}) — Firestore & Drive synced.`
            : `تم تسجيل الدخول عبر Google (${res.user.email}) ومزامنة المفضلة و Drive بنجاح.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCustomerDriveUpload = async (file: File) => {
    const tk = googleToken || (await getAccessToken());
    if (!tk || !googleUser) {
      setError('يرجى تسجيل الدخول بحساب Google أولاً للرفع إلى Google Drive.');
      return;
    }
    setUploadingDriveDoc(true);
    setError('');
    setMessage('');
    try {
      const folderId = await ensureDriveFolder(tk, 'Taj Al-Thahabi Customer Docs');
      const uploaded = await uploadFileToDrive(tk, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        content: file,
        folderId,
      });
      await recordDriveBackupInFirestore(googleUser, {
        driveFileId: uploaded.id,
        fileName: uploaded.name,
        mimeType: uploaded.mimeType,
        category: 'invoice',
        webViewLink: uploaded.webViewLink,
        sizeBytes: file.size,
      });
      setMessage(`تم حفظ الملف "${uploaded.name}" في مجلدك الخاص على Google Drive!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر رفع الملف إلى Google Drive.');
    } finally {
      setUploadingDriveDoc(false);
    }
  };

  const handleVehicleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleQuery.trim() || vehicleQuery.trim().length < 2) {
      setError('يرجى كتابة نوع وموديل وسنة السيارة (مثال: تويوتا كامري 2021).');
      return;
    }
    setAdvisorLoading(true);
    setError('');
    try {
      const res = await fetch('/api/customers/ai/vehicle-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: vehicleQuery.trim(),
          questionOrCode: vehicleIssueOrCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر إجراء البحث المباشر حالياً.');
        return;
      }
      setAdvisorResult(data as VehicleCompatibilityResult);
    } catch {
      setError('تعذر الاتصال بخدمة البحث الذكي.');
    } finally {
      setAdvisorLoading(false);
    }
  };

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/customers/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر تسجيل الدخول.');
        return;
      }
      if (data.isOwner && data.adminToken && onOwnerGoogleLogin) {
        setPassword('');
        onOwnerGoogleLogin(data.adminToken as string);
        return;
      }
      onAuthSuccess(data.customer, data.token);
      setPassword('');
      setDashboardTab('overview');
      setMessage(`مرحباً بعودتك، ${data.customer.name}!`);
    } catch {
      setError('خطأ في الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!name.trim() || name.trim().length < 2) {
      setError('يرجى إدخال الاسم الكامل (حرفين على الأقل).');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }
    if (password.length < 4) {
      setError('يجب أن تتكون كلمة المرور من 4 أحرف على الأقل.');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين. يرجى التأكد قبل المتابعة.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/customers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          nationalAddress: nationalAddress.trim(),
          address: address.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر إنشاء الحساب.');
        return;
      }
      onAuthSuccess(data.customer, data.token);
      setPassword('');
      setConfirmPassword('');
      setDashboardTab('overview');
      setMessage('تم إنشاء حسابك وحفظ بياناتك بنجاح! مرحباً بك في مصنع التاج الذهبي.');
    } catch {
      setError('خطأ في الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (acctNewPw.length < 4) {
      setError('يجب أن تكون كلمة المرور الجديدة 4 أحرف على الأقل.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/customers/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: acctCurrentPw,
          newPassword: acctNewPw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر تحديث كلمة المرور.');
        return;
      }
      if (data.customer) {
        onCustomerUpdated?.(data.customer);
      }
      setAcctCurrentPw('');
      setAcctNewPw('');
      setMessage('تم حفظ كلمة مرور حسابك بنجاح.');
    } catch {
      setError('خطأ في الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/customers/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          nationalAddress: nationalAddress.trim(),
          address: address.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر تحديث البيانات.');
        return;
      }
      onAuthSuccess(data.customer, token);
      setMessage('تم حفظ وتحديث بيانات ملفك بنجاح.');
    } catch {
      setError('خطأ في الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  const handleDailyCheckin = async () => {
    if (!token) return;
    setClaimingDaily(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/customers/daily-checkin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر الحصول على مكافأة الدخول اليومي.');
        return;
      }
      onCustomerUpdated?.(data.customer);
      setMessage(`تمت إضافة +${data.awardedCoins} عملة ذهبية مجانية لحسابك اليوم!`);
    } catch {
      setError('خطأ في الاتصال بالخادم.');
    } finally {
      setClaimingDaily(false);
    }
  };

  const handleConvertCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setConvertingCoupon(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/customers/redeem-coupon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ coins: Number(coinsToConvert) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر تحويل العملات إلى كوبون.');
        return;
      }
      onCustomerUpdated?.(data.customer);
      setLastCreatedCoupon({
        code: data.coupon.code,
        discountSar: data.coupon.discountSar,
      });
      setMessage(
        `تم إنشاء كود الخصم الفوري ${data.coupon.code} بقيمة ${data.coupon.discountSar} ر.س بنجاح!`
      );
    } catch {
      setError('خطأ في الاتصال بالخادم.');
    } finally {
      setConvertingCoupon(false);
    }
  };

  const switchAuthMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const isWide = Boolean(customer) || portalTab === 'advisor';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${
          isWide ? 'max-w-2xl' : 'max-w-lg'
        } rounded-2xl border border-[#D4AF37]/30 bg-[#111115] text-[#F5F2EB] p-5 sm:p-6 shadow-2xl space-y-4 my-auto transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {portalTab === 'wishlist' ? (
              <Heart className="w-5 h-5 text-red-400 fill-red-400 shrink-0" />
            ) : portalTab === 'advisor' ? (
              <Sparkles className="w-5 h-5 text-[#E5C158] shrink-0" />
            ) : (
              <User className="w-5 h-5 text-[#D4AF37] shrink-0" />
            )}
            <h2 className="font-display text-lg sm:text-xl font-bold truncate">
              {portalTab === 'wishlist'
                ? `${t(lang, 'wishlistTitle')} (${wishlistProducts.length})`
                : portalTab === 'advisor'
                  ? lang === 'en'
                    ? 'AI Vehicle & Emissions Advisor'
                    : 'مستشار توافق دبات التلوث (بحث Google المباشر)'
                  : customer
                    ? lang === 'en'
                      ? 'Customer Dashboard'
                      : 'لوحة تحكم العميل'
                    : mode === 'login'
                      ? lang === 'en'
                        ? 'Customer Login'
                        : 'تسجيل دخول العملاء'
                      : lang === 'en'
                        ? 'Create Account'
                        : 'إنشاء حساب جديد بالبريد الإلكتروني'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-9 h-9 rounded-lg border border-white/10 bg-[#16161B] hover:border-[#D4AF37]/50 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Portal Tabs: Account | Wishlist | AI Vehicle Advisor */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#16161B] border border-white/10">
          <button
            type="button"
            onClick={() => {
              setPortalTab('account');
              setError('');
            }}
            className={`py-2 px-2 text-[11px] sm:text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              portalTab === 'account' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-[#9E988C] hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {customer ? 'لوحة العميل' : lang === 'en' ? 'Account' : 'دخول / تسجيل'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPortalTab('wishlist');
              setError('');
            }}
            className={`py-2 px-2 text-[11px] sm:text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              portalTab === 'wishlist' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-[#9E988C] hover:text-white'
            }`}
          >
            <Heart className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {t(lang, 'wishlistTitle')} ({wishlistProducts.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPortalTab('advisor');
              setError('');
            }}
            className={`py-2 px-2 text-[11px] sm:text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              portalTab === 'advisor' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-[#9E988C] hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">فحص التوافق</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/30 text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30 text-emerald-200 text-xs flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        {/* TAB 2: WISHLIST */}
        {portalTab === 'wishlist' ? (
          <div className="space-y-3 max-h-[65vh] overflow-y-auto">
            {wishlistProducts.length === 0 ? (
              <div className="py-12 text-center space-y-2 text-xs text-[#9E988C]">
                <Heart className="w-8 h-8 text-[#D4AF37]/40 mx-auto" />
                <div>
                  {lang === 'en'
                    ? 'Your wishlist is empty. Tap the heart icon on any product to save it here.'
                    : 'قائمة المفضلة فارغة حالياً. اضغط على أيقونة القلب في أي منتج لحفظه هنا والعودة إليه لاحقاً.'}
                </div>
              </div>
            ) : (
              wishlistProducts.map((product) => {
                const effPrice = formatCurrencyPrice(
                  getEffectivePriceSar(product, settings?.priceDisplayMode),
                  currency,
                  settings?.currencyRates,
                  lang
                );
                const pName = lang === 'en' ? product.nameEn || product.name : product.name;
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-[#15151A]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProduct?.(product);
                        onClose();
                      }}
                      className="w-16 h-16 aspect-square p-1 rounded-lg bg-[#0B0B0F] border border-white/10 shrink-0 cursor-pointer"
                    >
                      <ResilientImage
                        src={product.images[0]}
                        alt={pName}
                        className="w-full h-full object-contain"
                      />
                    </button>
                    <div className="min-w-0 flex-1 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProduct?.(product);
                          onClose();
                        }}
                        className="text-xs sm:text-sm font-bold text-[#F5F2EB] hover:text-[#E5C158] truncate block text-start w-full cursor-pointer"
                      >
                        {pName}
                      </button>
                      <div className="text-xs font-bold text-[#E5C158] tabular-nums">
                        {effPrice.valueText} {effPrice.unit}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onAddToCart && (
                        <button
                          type="button"
                          disabled={!product.inStock}
                          onClick={() => onAddToCart(product)}
                          title={t(lang, 'addToCart')}
                          className="h-8 px-2.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-45"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onToggleWishlist && (
                        <button
                          type="button"
                          onClick={() => onToggleWishlist(product.id)}
                          title="إزالة من المفضلة"
                          className="w-8 h-8 rounded-lg border border-white/10 text-red-400 hover:bg-red-950/30 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : portalTab === 'advisor' ? (
          /* TAB 3: LIVE GOOGLE SEARCH GROUNDING VEHICLE COMPATIBILITY ADVISOR */
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pl-1">
            <div className="p-3.5 rounded-xl border border-[#D4AF37]/30 bg-gradient-to-l from-[#18140B] to-[#131317] text-xs text-[#C5BFB2] leading-relaxed space-y-1">
              <div className="font-bold text-[#E5C158] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>مستشار التوافق والفحص الدوري — مدعوم ببحث Google المباشر</span>
              </div>
              <p>
                اكتب نوع سيارتك وموديلها أو رمز فحص الأعطال (مثل P0420 أو P2002) للحصول على توصية
                فورية محدثة بمعيار الانبعاثات والمصادر الموثوقة، مع ترشيح القطع المتوفرة في المتجر.
              </p>
            </div>

            <form onSubmit={handleVehicleLookup} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">
                    نوع وموديل وسنة السيارة *
                  </label>
                  <input
                    type="text"
                    required
                    value={vehicleQuery}
                    onChange={(e) => setVehicleQuery(e.target.value)}
                    placeholder="مثال: تويوتا كامري 2021 أو هايلكس ديزل 2022"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">
                    كود الفحص أو الاستفسار (اختياري)
                  </label>
                  <input
                    type="text"
                    value={vehicleIssueOrCode}
                    onChange={(e) => setVehicleIssueOrCode(e.target.value)}
                    placeholder="مثال: P0420 أو شروط الفحص الدوري"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { car: 'تويوتا كامري 2020', q: 'كود P0420 ومعيار Euro' },
                  { car: 'هايلكس ديزل 2022', q: 'تنظيف أو تغيير فلتر DPF' },
                  { car: 'جمس يوكن 2019', q: 'دبة التلوث المناسبة للفحص الدوري' },
                ].map((preset) => (
                  <button
                    key={preset.car}
                    type="button"
                    onClick={() => {
                      setVehicleQuery(preset.car);
                      setVehicleIssueOrCode(preset.q);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-white/10 bg-[#16161B] hover:border-[#D4AF37]/50 text-[11px] text-[#C5BFB2] hover:text-[#E5C158] cursor-pointer"
                  >
                    {preset.car}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={advisorLoading}
                className="btn-gold-wave w-full h-10 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>
                  {advisorLoading
                    ? 'جاري البحث والتحليل المباشر عبر Google...'
                    : 'فحص التوافق والانبعاثات الآن'}
                </span>
              </button>
            </form>

            {advisorResult && (
              <div className="space-y-4 pt-2 border-t border-white/10">
                <div className="p-4 rounded-xl border border-[#D4AF37]/30 bg-[#15151A] text-xs sm:text-sm text-[#F5F2EB] leading-relaxed whitespace-pre-line">
                  {advisorResult.answer}
                </div>

                {advisorResult.sources.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-[#E5C158]">
                      مصادر البحث الموثوقة (Google Search):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {advisorResult.sources.map((src) => (
                        <a
                          key={src.uri}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 bg-[#16161B] hover:border-[#D4AF37]/60 text-[11px] text-[#C5BFB2] hover:text-[#E5C158] max-w-full"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[220px]">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {advisorResult.recommendedProducts.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-[#E5C158]">
                      منتجات مرشحة من مصنع التاج الذهبي:
                    </div>
                    <div className="space-y-2">
                      {advisorResult.recommendedProducts.map((product) => {
                        const effPrice = formatCurrencyPrice(
                          getEffectivePriceSar(product, settings?.priceDisplayMode),
                          currency,
                          settings?.currencyRates,
                          lang
                        );
                        const pName = lang === 'en' ? product.nameEn || product.name : product.name;
                        return (
                          <div
                            key={product.id}
                            className="flex items-center gap-3 p-2.5 rounded-xl border border-white/10 bg-[#15151A]"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                onSelectProduct?.(product);
                                onClose();
                              }}
                              className="w-12 h-12 rounded-lg bg-[#0B0B0F] border border-white/10 p-1 shrink-0 cursor-pointer"
                            >
                              <ResilientImage
                                src={product.images[0]}
                                alt={pName}
                                className="w-full h-full object-contain"
                              />
                            </button>
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectProduct?.(product);
                                  onClose();
                                }}
                                className="text-xs font-bold text-[#F5F2EB] hover:text-[#E5C158] truncate block text-start w-full cursor-pointer"
                              >
                                {pName}
                              </button>
                              <div className="text-[11px] font-bold text-[#E5C158] tabular-nums">
                                {effPrice.valueText} {effPrice.unit}
                              </div>
                            </div>
                            {onAddToCart && (
                              <button
                                type="button"
                                disabled={!product.inStock}
                                onClick={() => onAddToCart(product)}
                                className="h-8 px-3 rounded-lg bg-[#D4AF37] text-[#09090B] text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-45 shrink-0"
                              >
                                <ShoppingBag className="w-3.5 h-3.5" />
                                <span>أضف للسلة</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : customer ? (
          /* TAB 1A: LOGGED-IN CUSTOMER DASHBOARD */
          <div className="space-y-4 max-h-[72vh] overflow-y-auto pl-1">
            {/* Customer Identity Summary Bar */}
            <div className="p-3.5 rounded-xl border border-[#D4AF37]/30 bg-gradient-to-l from-[#1A160B] to-[#141418] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl border border-[#D4AF37]/50 bg-[#171510] flex items-center justify-center text-[#E5C158] font-bold text-sm shrink-0">
                  {(customer.name || 'ع').slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#F5F2EB] truncate flex items-center gap-1.5">
                    <span>{customer.name}</span>
                    {customer.googleUid && (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                  </div>
                  <div className="text-[11px] text-[#9E988C] flex flex-wrap items-center gap-2">
                    <span dir="ltr">
                      {customer.phone || 'رقم الجوال غير مكتمل'}
                    </span>
                    {customer.email && (
                      <span dir="ltr" className="text-[#C5BFB2]">
                        • {customer.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="h-9 px-3 rounded-lg border border-red-500/35 bg-red-950/25 hover:bg-red-950/45 text-xs font-bold text-red-300 flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>تسجيل الخروج</span>
              </button>
            </div>

            {/* Profile completeness prompt for Google-onboarded customers */}
            {(!customer.phone || !customer.address) && (
              <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/25 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
                <span>
                  أكمل رقم الجوال وعنوان التوصيل لتسريع إتمام طلباتك واستخدام الكوبونات.
                </span>
                <button
                  type="button"
                  onClick={() => setDashboardTab('profile')}
                  className="px-3 py-1 rounded-lg bg-amber-500 text-black font-bold text-[11px] cursor-pointer"
                >
                  استكمال البيانات
                </button>
              </div>
            )}

            {/* Customer Dashboard Sub-Navigation */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#16161B] border border-white/10">
              <button
                type="button"
                onClick={() => setDashboardTab('overview')}
                className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg flex items-center justify-center gap-1 cursor-pointer ${
                  dashboardTab === 'overview'
                    ? 'bg-[#D4AF37]/20 text-[#E5C158] border border-[#D4AF37]/40'
                    : 'text-[#9E988C] hover:text-white'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>الولاء والخدمات</span>
              </button>
              <button
                type="button"
                onClick={() => setDashboardTab('profile')}
                className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg flex items-center justify-center gap-1 cursor-pointer ${
                  dashboardTab === 'profile'
                    ? 'bg-[#D4AF37]/20 text-[#E5C158] border border-[#D4AF37]/40'
                    : 'text-[#9E988C] hover:text-white'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>بياناتي والأمان</span>
              </button>
              <button
                type="button"
                onClick={() => setDashboardTab('orders')}
                className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg flex items-center justify-center gap-1 cursor-pointer ${
                  dashboardTab === 'orders'
                    ? 'bg-[#D4AF37]/20 text-[#E5C158] border border-[#D4AF37]/40'
                    : 'text-[#9E988C] hover:text-white'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>طلباتي ({orders.length})</span>
              </button>
            </div>

            {dashboardTab === 'overview' && (
              <div className="space-y-4">
                {/* Interactive Loyalty Points Card */}
                {settings?.loyaltyEnabled !== false &&
                  (() => {
                    const currentCoins = customer.goldenCoins ?? 0;
                    const coinSar = settings?.coinValueSar ?? 0.1;
                    const coinsSarValue = Number((currentCoins * coinSar).toFixed(2));
                    const tierInfo =
                      currentCoins >= 500
                        ? { label: 'عضو ملكي VIP', nextTarget: 1000, prevTarget: 500 }
                        : currentCoins >= 200
                          ? { label: 'عضو ذهبي', nextTarget: 500, prevTarget: 200 }
                          : currentCoins >= 50
                            ? { label: 'عضو فضي', nextTarget: 200, prevTarget: 50 }
                            : { label: 'عضو برونزي', nextTarget: 50, prevTarget: 0 };
                    const progressPercent = Math.min(
                      100,
                      Math.max(
                        6,
                        Math.round(
                          ((currentCoins - tierInfo.prevTarget) /
                            Math.max(1, tierInfo.nextTarget - tierInfo.prevTarget)) *
                            100
                        )
                      )
                    );
                    const remainingToNext = Math.max(0, tierInfo.nextTarget - currentCoins);
                    const today = new Date().toLocaleDateString('en-CA', {
                      timeZone: 'Asia/Riyadh',
                    });
                    const alreadyClaimed = customer.lastDailyClaimDate === today;
                    const presetAmounts = [25, 50, 100, 200];
                    const numericConvert = Math.max(0, Math.floor(Number(coinsToConvert) || 0));
                    const historyItems = customer.loyaltyHistory || [];

                    return (
                      <div className="p-4 sm:p-5 rounded-2xl border border-[#D4AF37]/50 bg-gradient-to-br from-[#1B160B] via-[#11100C] to-[#0B0B0D] space-y-4">
                        {/* Header & Points Balance */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl border border-[#D4AF37]/60 bg-[#D4AF37]/15 flex items-center justify-center shrink-0">
                              <Coins className="w-6 h-6 text-[#F5E1A4]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[#C5BFB2]">
                                  رصيد نقاط الولاء التفاعلي
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[10px] font-bold text-[#F5E1A4]">
                                  <Award className="w-3 h-3 text-[#D4AF37]" />
                                  {tierInfo.label}
                                </span>
                              </div>
                              <div className="text-2xl font-bold text-[#F5E1A4] tabular-nums mt-0.5">
                                {currentCoins.toLocaleString('ar-SA')}{' '}
                                <span className="text-sm font-medium text-[#E5C158]">نقطة</span>
                              </div>
                              <div className="text-[11px] text-emerald-300/90 tabular-nums">
                                تعادل خصم فوري بقيمة {coinsSarValue.toFixed(2)} ر.س في السلة
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={claimingDaily || alreadyClaimed}
                            onClick={handleDailyCheckin}
                            className={`h-10 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 ${
                              alreadyClaimed
                                ? 'border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 cursor-default'
                                : 'btn-gold-wave cursor-pointer'
                            }`}
                          >
                            <Gift className="w-4 h-4" />
                            <span>
                              {alreadyClaimed
                                ? 'تم استلام مكافأة اليوم'
                                : claimingDaily
                                  ? 'جاري الإضافة...'
                                  : `دخول يومي (+${settings?.dailyCheckinCoins ?? 25} نقطة)`}
                            </span>
                          </button>
                        </div>

                        {/* Interactive Tier Progress Bar */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] text-[#C5BFB2]">
                            <span>التقدم نحو المستوى التالي ({tierInfo.nextTarget} نقطة)</span>
                            <span className="text-[#E5C158] font-bold tabular-nums">
                              {remainingToNext === 0
                                ? 'وصلت لأعلى مستوى!'
                                : `متبقي ${remainingToNext} نقطة`}
                            </span>
                          </div>
                          <div className="w-full h-2.5 rounded-full bg-black/50 border border-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#B8860B] via-[#D4AF37] to-[#F5E1A4] transition-all duration-500"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* How to Earn Points Interactive Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                          <div className="p-2.5 rounded-xl border border-emerald-500/25 bg-emerald-950/15 space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
                              <span className="flex items-center gap-1">
                                <ShoppingBag className="w-3.5 h-3.5" />
                                المشتريات
                              </span>
                              <span className="tabular-nums">
                                +{settings?.coinsPer100SarPurchase ?? 50} نقطة
                              </span>
                            </div>
                            <p className="text-[10px] text-[#C5BFB2]">
                              عن كل 100 ر.س مشتريات تُضاف تلقائياً لحسابك
                            </p>
                          </div>

                          <div className="p-2.5 rounded-xl border border-sky-500/25 bg-sky-950/15 space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-sky-300">
                              <span className="flex items-center gap-1">
                                <Share2 className="w-3.5 h-3.5" />
                                مشاركة المنتجات
                              </span>
                              <span className="tabular-nums">
                                +{settings?.coinsPerProductShare ?? 15} نقطة
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[10px] text-[#C5BFB2]">
                                عن كل منتج تشاركه يومياً
                              </p>
                              <button
                                type="button"
                                onClick={onClose}
                                className="text-[10px] font-bold text-sky-300 hover:underline shrink-0 cursor-pointer"
                              >
                                شارك منتجاً
                              </button>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl border border-[#D4AF37]/25 bg-[#1B170B] space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-[#F5E1A4]">
                              <span className="flex items-center gap-1">
                                <Gift className="w-3.5 h-3.5 text-[#D4AF37]" />
                                الدخول اليومي
                              </span>
                              <span className="tabular-nums">
                                +{settings?.dailyCheckinCoins ?? 25} نقطة
                              </span>
                            </div>
                            <p className="text-[10px] text-[#C5BFB2]">
                              مكافأة مجانية متجددة كل 24 ساعة
                            </p>
                          </div>
                        </div>

                        {/* Convert Points to Instant Discount Code */}
                        <form
                          onSubmit={handleConvertCoupon}
                          className="pt-3 border-t border-white/10 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#C5BFB2]">
                            <div className="flex items-center gap-1.5 font-bold text-[#F5E1A4]">
                              <Ticket className="w-4 h-4 text-[#E5C158]" />
                              <span>تحويل النقاط إلى كود خصم فوري للسلة (الحد الأدنى 5 نقاط)</span>
                            </div>
                            <span className="text-[11px] text-[#E5C158] tabular-nums">
                              = {(numericConvert * coinSar).toFixed(2)} ر.س خصم
                            </span>
                          </div>

                          {/* Quick Preset Chips */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {presetAmounts.map((amt) => (
                              <button
                                key={amt}
                                type="button"
                                disabled={currentCoins < amt}
                                onClick={() => setCoinsToConvert(String(amt))}
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-35 ${
                                  Number(coinsToConvert) === amt
                                    ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                                    : 'border-white/15 bg-[#16161B] text-[#E5C158] hover:border-[#D4AF37]/60'
                                }`}
                              >
                                {amt} نقطة ({(amt * coinSar).toFixed(1)} ر.س)
                              </button>
                            ))}
                            {currentCoins >= 5 && (
                              <button
                                type="button"
                                onClick={() => setCoinsToConvert(String(currentCoins))}
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                                  Number(coinsToConvert) === currentCoins
                                    ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                                    : 'border-[#D4AF37]/40 bg-[#1B170B] text-[#F5E1A4] hover:border-[#D4AF37]'
                                }`}
                              >
                                كل الرصيد ({currentCoins})
                              </button>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="number"
                              min={5}
                              max={Math.max(5, currentCoins)}
                              value={coinsToConvert}
                              onChange={(e) => setCoinsToConvert(e.target.value)}
                              className="w-28 h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-xs tabular-nums focus:outline-none focus:border-[#D4AF37]"
                            />
                            <button
                              type="submit"
                              disabled={
                                convertingCoupon ||
                                currentCoins < 5 ||
                                numericConvert < 5 ||
                                numericConvert > currentCoins
                              }
                              className="flex-1 h-10 px-3 rounded-xl btn-gold-wave text-xs font-bold disabled:opacity-45 cursor-pointer"
                            >
                              {convertingCoupon
                                ? 'جاري إصدار كود الخصم...'
                                : `إنشاء كود خصم فوري (${(numericConvert * coinSar).toFixed(2)} ر.س)`}
                            </button>
                          </div>

                          {lastCreatedCoupon && (
                            <div className="p-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="text-emerald-200">
                                تم إصدار كودك الفوري:{' '}
                                <span className="font-bold text-white tabular-nums" dir="ltr">
                                  {lastCreatedCoupon.code}
                                </span>{' '}
                                (بقيمة {lastCreatedCoupon.discountSar} ر.س)
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(lastCreatedCoupon.code);
                                    setCopiedCoupon(lastCreatedCoupon.code);
                                    setTimeout(() => setCopiedCoupon(''), 1800);
                                  }}
                                  className="h-7 px-2.5 rounded-lg border border-white/20 bg-black/40 text-[11px] text-white flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>{copiedCoupon === lastCreatedCoupon.code ? 'تم النسخ' : 'نسخ'}</span>
                                </button>
                                {onUseCouponInCart && (
                                  <button
                                    type="button"
                                    onClick={() => onUseCouponInCart(lastCreatedCoupon.code)}
                                    className="h-7 px-2.5 rounded-lg bg-emerald-500 text-[#09090B] text-[11px] font-bold hover:brightness-110 cursor-pointer"
                                  >
                                    استخدام في السلة الآن
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </form>

                        {/* Active & Saved Coupons List */}
                        {(customer.coupons || []).length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-white/10">
                            <div className="flex items-center justify-between text-[11px] text-[#C5BFB2]">
                              <span className="flex items-center gap-1 font-bold text-[#E5C158]">
                                <Tag className="w-3.5 h-3.5" />
                                أكواد الخصم الفورية الخاصة بك ({(customer.coupons || []).filter((c) => !c.isUsed).length} متاح)
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                              {(customer.coupons || []).map((cp) => (
                                <div
                                  key={cp.code}
                                  className={`px-2.5 py-2 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${
                                    cp.isUsed
                                      ? 'border-white/5 bg-black/40 text-[#847E73] line-through'
                                      : 'border-[#D4AF37]/45 bg-[#14120E] text-[#F5E1A4]'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="font-bold tabular-nums truncate" dir="ltr">
                                      {cp.code}
                                    </div>
                                    <div className="text-[10px] text-[#E5C158]">
                                      خصم {cp.discountSar} ر.س {cp.isUsed ? '· تم استخدامه' : '· جاهز للسلة'}
                                    </div>
                                  </div>
                                  {!cp.isUsed && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(cp.code);
                                          setCopiedCoupon(cp.code);
                                          setTimeout(() => setCopiedCoupon(''), 1800);
                                        }}
                                        className="h-7 w-7 rounded-lg border border-white/15 bg-black/40 flex items-center justify-center text-[#E5C158] hover:text-white cursor-pointer"
                                        aria-label="نسخ الكوبون"
                                      >
                                        {copiedCoupon === cp.code ? (
                                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        ) : (
                                          <Copy className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                      {onUseCouponInCart && (
                                        <button
                                          type="button"
                                          onClick={() => onUseCouponInCart(cp.code)}
                                          className="h-7 px-2 rounded-lg bg-[#D4AF37] text-[#09090B] text-[10px] font-bold hover:brightness-110 cursor-pointer"
                                        >
                                          تطبيق بالسلة
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Interactive Loyalty Points Activity Log */}
                        <div className="space-y-2 pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between text-[11px] text-[#C5BFB2]">
                            <span className="flex items-center gap-1 font-bold text-[#E5C158]">
                              <History className="w-3.5 h-3.5" />
                              سجل حركات نقاط الولاء
                            </span>
                            {(customer.sharedProductsCount ?? 0) > 0 && (
                              <span className="text-[10px] text-sky-300 tabular-nums">
                                منتجات تمت مشاركتها: {customer.sharedProductsCount}
                              </span>
                            )}
                          </div>
                          {historyItems.length === 0 ? (
                            <div className="p-2.5 rounded-xl border border-white/10 bg-black/30 text-[11px] text-[#9E988C]">
                              لا توجد حركات نقاط بعد. اطلب من المتجر أو شارك أي منتج أو استلم مكافأة الدخول اليومي لبدء جمع النقاط!
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-36 overflow-y-auto">
                              {historyItems.slice(0, 10).map((item) => (
                                <div
                                  key={item.id}
                                  className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-[#141418] flex items-center justify-between gap-2 text-[11px]"
                                >
                                  <div className="min-w-0 flex items-center gap-2">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                        item.type === 'purchase'
                                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                                          : item.type === 'share'
                                            ? 'bg-sky-950/60 text-sky-300 border border-sky-500/30'
                                            : item.type === 'daily'
                                              ? 'bg-[#2A220F] text-[#F5E1A4] border border-[#D4AF37]/30'
                                              : 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
                                      }`}
                                    >
                                      {item.type === 'purchase'
                                        ? 'شراء'
                                        : item.type === 'share'
                                          ? 'مشاركة'
                                          : item.type === 'daily'
                                            ? 'يومي'
                                            : 'استبدال'}
                                    </span>
                                    <span className="text-[#E6E0D3] truncate">{item.description}</span>
                                  </div>
                                  <span
                                    dir="ltr"
                                    className={`font-bold tabular-nums shrink-0 ${
                                      item.points >= 0 ? 'text-emerald-300' : 'text-amber-300'
                                    }`}
                                  >
                                    {item.points >= 0 ? `+${item.points}` : item.points}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                {/* Google Drive Sync Strip */}
                <div className="p-3 rounded-xl border border-white/10 bg-[#15151A] flex flex-wrap items-center justify-between gap-2.5">
                  {googleUser && googleToken ? (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div className="text-[11px] truncate">
                          <span className="font-bold text-emerald-300">
                            {googleUser.displayName}
                          </span>
                          <span className="text-[#9E988C] ms-1.5" dir="ltr">
                            ({googleUser.email})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <label className="h-8 px-2.5 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-[11px] font-bold text-[#E5C158] flex items-center gap-1 cursor-pointer">
                          <Upload className="w-3 h-3" />
                          <span>{uploadingDriveDoc ? '...' : 'حفظ فواتيرك في Drive'}</span>
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploadingDriveDoc}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleCustomerDriveUpload(f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void googleLogout()}
                          className="h-8 px-2.5 rounded-lg border border-white/15 text-[11px] text-red-300 cursor-pointer"
                        >
                          فصل Google
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[11px] text-[#C5BFB2]">
                        مزامنة المفضلة وحفظ فواتيرك على Google Drive:
                      </div>
                      <GoogleSignInButton
                        onClick={handleCustomerGoogleLogin}
                        disabled={googleLoading}
                        label={googleLoading ? '...' : 'ربط حساب Google'}
                        className="h-8 px-3 text-xs"
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {dashboardTab === 'profile' && (
              <div className="space-y-4">
                <form onSubmit={handleUpdateProfile} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#C5BFB2] mb-1">الاسم الكامل</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#C5BFB2] mb-1">رقم الجوال</label>
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="05XXXXXXXX"
                        className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-right focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#C5BFB2] mb-1">
                        البريد الإلكتروني (اختياري)
                      </label>
                      <input
                        type="email"
                        dir="ltr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-right focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#C5BFB2] mb-1">العنوان الوطني</label>
                      <input
                        type="text"
                        value={nationalAddress}
                        onChange={(e) => setNationalAddress(e.target.value)}
                        placeholder="مثال: RRRD2929"
                        className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[#C5BFB2] mb-1">
                      تفاصيل العنوان المحفوظ
                    </label>
                    <textarea
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="المدينة، الحي، الشارع"
                      className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-gold-wave w-full h-10 rounded-xl text-sm font-bold cursor-pointer"
                  >
                    {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                  </button>
                </form>

                {/* Change or Set Customer Password */}
                <form
                  onSubmit={handleAccountChangePassword}
                  className="p-4 rounded-xl border border-white/10 bg-[#15151A] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-[#E5C158]">
                      {customer.hasPassword === false
                        ? 'تعيين كلمة مرور للدخول بالجوال لاحقاً'
                        : lang === 'en'
                          ? 'Change Password'
                          : 'تغيير كلمة مرور الحساب'}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAcctPw((v) => !v)}
                      className="text-[11px] text-[#9E988C] hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      {showAcctPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showAcctPw ? 'إخفاء' : 'إظهار'}</span>
                    </button>
                  </div>
                  <div
                    className={`grid grid-cols-1 ${
                      customer.hasPassword === false ? '' : 'sm:grid-cols-2'
                    } gap-2.5`}
                  >
                    {customer.hasPassword !== false && (
                      <input
                        type={showAcctPw ? 'text' : 'password'}
                        required
                        value={acctCurrentPw}
                        onChange={(e) => setAcctCurrentPw(e.target.value)}
                        placeholder={lang === 'en' ? 'Current password' : 'كلمة المرور الحالية'}
                        className="h-9 px-3 rounded-lg bg-[#111115] border border-white/15 text-xs focus:outline-none focus:border-[#D4AF37]"
                      />
                    )}
                    <input
                      type={showAcctPw ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={acctNewPw}
                      onChange={(e) => setAcctNewPw(e.target.value)}
                      placeholder={
                        lang === 'en'
                          ? 'New password (min 4 chars)'
                          : 'كلمة المرور الجديدة (4 أحرف على الأقل)'
                      }
                      className="h-9 px-3 rounded-lg bg-[#111115] border border-white/15 text-xs focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="h-9 px-4 rounded-lg border border-[#D4AF37]/45 bg-[#171510] text-xs font-bold text-[#E5C158] cursor-pointer"
                  >
                    {customer.hasPassword === false
                      ? 'تعيين كلمة المرور'
                      : lang === 'en'
                        ? 'Update Password'
                        : 'تحديث كلمة المرور'}
                  </button>
                </form>
              </div>
            )}

            {dashboardTab === 'orders' && (
              <div className="space-y-3">
                {orders.length === 0 ? (
                  <div className="py-10 text-center space-y-2 text-xs text-[#9E988C]">
                    <Package className="w-8 h-8 text-[#D4AF37]/40 mx-auto" />
                    <div>لم تقم بأي طلبات حتى الآن.</div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {orders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-3.5 rounded-xl border border-white/10 bg-[#15151A] text-xs space-y-1.5"
                      >
                        <div className="flex justify-between font-bold">
                          <span className="text-[#E5C158] tabular-nums">{ord.id}</span>
                          <span className="px-2 py-0.5 rounded bg-white/5 text-[#F5F2EB]">
                            {ord.status}
                          </span>
                        </div>
                        <div className="flex justify-between text-[#9E988C]">
                          <span>{ord.items.length} منتج</span>
                          <span className="tabular-nums font-bold text-[#F5F2EB]">
                            {ord.totalSar.toLocaleString('ar-SA')} ر.س
                          </span>
                        </div>
                        {(ord.trackingNumber || ord.shippingNotice) && (
                          <div className="pt-1.5 mt-1 border-t border-white/10 text-[11px] space-y-0.5 text-[#C5BFB2]">
                            {ord.trackingNumber && (
                              <div dir="ltr" className="text-right">
                                رقم المتابعة:{' '}
                                <strong className="text-emerald-300">{ord.trackingNumber}</strong>
                              </div>
                            )}
                            {ord.shippingNotice && (
                              <div className="text-emerald-200">{ord.shippingNotice}</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* TAB 1B: GOOGLE FIREBASE SIGN-IN + EMAIL & PASSWORD LOGIN / REGISTER */
          <div className="space-y-4">
            {/* Primary Option 1: Firebase Google Authentication */}
            <div className="p-3.5 rounded-xl border border-[#D4AF37]/35 bg-gradient-to-l from-[#18140C] to-[#141418] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#E5C158]">
                  {lang === 'en'
                    ? 'Sign in with Google Account'
                    : 'تسجيل الدخول السريع بحساب Google'}
                </div>
                <span className="text-[10px] text-[#9E988C]">دخول فوري بدون رمز تحقق</span>
              </div>
              <GoogleSignInButton
                onClick={handleCustomerGoogleLogin}
                disabled={googleLoading}
                label={
                  googleLoading
                    ? 'جاري تسجيل الدخول بحساب Google...'
                    : lang === 'en'
                      ? 'Continue with Google'
                      : 'تسجيل الدخول بحساب Google'
                }
                className="w-full h-11 text-sm font-bold"
              />
            </div>

            {/* Visual Divider */}
            <div className="flex items-center gap-3 text-[11px] text-[#9E988C]">
              <span className="h-px flex-1 bg-white/10" />
              <span>أو الدخول بالبريد الإلكتروني وكلمة المرور</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            {/* Clean 2-Tab Mode Switcher (Email Login | Create Email Account) */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#16161B] border border-white/10">
              <button
                type="button"
                onClick={() => switchAuthMode('login')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  mode === 'login' ? 'bg-[#D4AF37] text-[#09090B]' : 'text-[#9E988C] hover:text-white'
                }`}
              >
                البريد الإلكتروني وكلمة المرور
              </button>
              <button
                type="button"
                onClick={() => switchAuthMode('register')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[#D4AF37] text-[#09090B]'
                    : 'text-[#9E988C] hover:text-white'
                }`}
              >
                إنشاء حساب جديد
              </button>
            </div>

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">
                    البريد الإلكتروني *
                  </label>
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-left focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">كلمة المرور *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-10 ps-3 pe-10 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-[#9E988C] hover:text-white cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gold-wave w-full h-11 rounded-xl text-sm font-bold cursor-pointer"
                >
                  {loading ? 'جاري الدخول...' : 'دخول بالبريد الإلكتروني وكلمة المرور'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3 max-h-[56vh] overflow-y-auto pl-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#C5BFB2] mb-1">الاسم الكامل *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="مثال: محمد العتيبي"
                      className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#C5BFB2] mb-1">
                      البريد الإلكتروني *
                    </label>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-left focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#C5BFB2] mb-1">كلمة المرور *</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={4}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="4 أحرف على الأقل"
                        className="w-full h-10 ps-3 pe-10 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        className="absolute end-3 top-1/2 -translate-y-1/2 text-[#9E988C] hover:text-white cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[#C5BFB2] mb-1">
                      تأكيد كلمة المرور *
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="أعد كتابة كلمة المرور"
                      className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#C5BFB2] mb-1">
                      رقم الجوال (اختياري)
                    </label>
                    <input
                      type="tel"
                      dir="ltr"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="05XXXXXXXX"
                      className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-left focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#C5BFB2] mb-1">
                      العنوان الوطني (اختياري)
                    </label>
                    <input
                      type="text"
                      value={nationalAddress}
                      onChange={(e) => setNationalAddress(e.target.value)}
                      placeholder="مثال: RRRD2929"
                      className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">
                    المدينة وتفاصيل العنوان (اختياري)
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="المدينة، الحي، الشارع"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gold-wave w-full h-11 rounded-xl text-sm font-bold cursor-pointer"
                >
                  {loading ? 'جاري التسجيل...' : 'إنشاء الحساب والدخول'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
