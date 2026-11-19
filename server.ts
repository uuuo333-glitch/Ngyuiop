import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import {
  UPLOADS_DIR,
  addProductReview,
  adjustCustomerCoinsAdmin,
  appendAssistantMessage,
  applyLoyaltyAndAwardOnOrder,
  approveReviewAdmin,
  awardProductSharePoints,
  beginAdminTotpSetup,
  changeCustomerPassword,
  chargeOwnerWalletForCartOrder,
  claimDailyCoins,
  confirmAdminPasswordReset,
  confirmAdminTotpSetup,
  confirmCustomerPasswordReset,
  convertCoinsToCoupon,
  createBanner,
  createOrder,
  createProduct,
  createSignedToken,
  deleteBanner,
  deleteProduct,
  deleteReviewAdmin,
  depositToOwnerWalletAdmin,
  disableAdminTwoFactor,
  enableAdminEmailTwoFactor,
  getActiveBanners,
  getAdminSettings,
  getAdminTwoFactorStatus,
  getAllApprovedReviews,
  getAllBannersAdmin,
  getAllCustomersAdmin,
  getAllOrdersAdmin,
  getAllProductsAdmin,
  getAllReviewsAdmin,
  getApprovedReviewsForProduct,
  getAssistantMessages,
  getCustomerById,
  getOrdersForCustomer,
  getOwnerAlertsAndDigest,
  getOwnerAnalyticsAdmin,
  getOwnerWalletSummaryAdmin,
  getProductByIdAdmin,
  getPublicSettings,
  getPublishedProducts,
  issueAdminEmailLoginOtp,
  loginCustomer,
  notifyOwnerWebhookIfConfigured,
  purchaseWithOwnerWalletAdmin,
  recordSearchQuery,
  recordStoreVisit,
  regenerateAdminBackupCodes,
  registerCustomer,
  requestAdminPasswordReset,
  requestCustomerPasswordReset,
  saveUploadedBuffer,
  saveUploadedMedia,
  stripPrivateProductFields,
  transferSalesRevenueToWalletAdmin,
  updateAdminPassword,
  updateBanner,
  updateCustomerProfile,
  updateOrderStatus,
  updateProduct,
  updateSettings,
  upsertGoogleCustomer,
  validatePromoDiscountCode,
  verifyAdminPassword,
  verifyAdminSecondFactor,
  verifySignedToken,
} from './server/db.ts';
import {
  enhanceProductCopyWithAi,
  enhanceStoreIdentityWithAi,
  generateAdsAndBanner,
  generateProductSeoData,
  importProductFromUrlWithHtml,
  lookupVehicleCompatibilityWithSearch,
  optimizeBackgroundWithAi,
  runOwnerAssistantTurn,
  scrapeProductFromUrlOrName,
  scrapeSimilarProductsFromUrl,
  translateProductToEnglishWithAi,
} from './server/ai.ts';
import type { OrderItem, OrderStatus, Product } from './src/types.ts';

function parseSeoKeywordsList(input: unknown): string[] {
  const rawList = Array.isArray(input)
    ? input.map((item) => String(item || ''))
    : typeof input === 'string'
      ? input.split(/[،,]+/)
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of rawList) {
    const cleaned = item.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= 15) break;
  }
  return result;
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.post(
  '/api/admin/upload-binary',
  express.raw({ type: '*/*', limit: '150mb' }),
  (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      res.status(401).json({ error: 'مطلوب تسجيل دخول المالك.' });
      return;
    }
    const verified = verifySignedToken<{ role?: string }>(token);
    if (!verified || verified.role !== 'admin') {
      res.status(401).json({ error: 'جلسة المالك غير صالحة أو منتهية.' });
      return;
    }
    try {
      const rawName = decodeURIComponent(String(req.headers['x-filename'] || 'video.mp4'));
      const mimeType = String(req.headers['x-mime-type'] || req.headers['content-type'] || 'video/mp4');
      const bodyBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      if (!bodyBuf || bodyBuf.length === 0) {
        res.status(400).json({ error: 'الملف المرفوع فارغ.' });
        return;
      }
      const url = saveUploadedBuffer(rawName, mimeType, bodyBuf);
      res.status(201).json({ url });
    } catch (err) {
      console.error('Binary upload error:', err);
      res.status(500).json({ error: 'تعذر حفظ الملف المرفوع.' });
    }
  }
);
app.use(express.json({ limit: '120mb' }));
app.use((req, _res, next) => {
  if (req.body === undefined) {
    req.body = {};
  }
  next();
});
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
});

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'مطلوب تسجيل دخول المالك.' });
    return;
  }
  const verified = verifySignedToken<{ role?: string }>(token);
  if (!verified || verified.role !== 'admin') {
    res.status(401).json({ error: 'جلسة المالك غير صالحة أو منتهية.' });
    return;
  }
  next();
}

interface CustomerRequest extends Request {
  customerId?: string;
}

function requireCustomer(req: CustomerRequest, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول لحساب العميل.' });
    return;
  }
  const verified = verifySignedToken<{ role?: string; customerId?: string }>(token);
  if (!verified || verified.role !== 'customer' || !verified.customerId) {
    res.status(401).json({ error: 'جلسة العميل غير صالحة.' });
    return;
  }
  req.customerId = verified.customerId;
  next();
}

// ==========================================
// PUBLIC STOREFRONT ENDPOINTS (ZERO LEAKAGE)
// ==========================================

app.get('/api/storefront', (_req, res) => {
  res.json({
    settings: getPublicSettings(),
    products: getPublishedProducts(),
    banners: getActiveBanners(),
    reviews: getAllApprovedReviews(),
  });
});

app.get('/api/products/:id/reviews', (req, res) => {
  res.json({ reviews: getApprovedReviewsForProduct(String(req.params.id)) });
});

app.post('/api/products/:id/reviews', (req, res) => {
  const productId = String(req.params.id);
  const existing = getProductByIdAdmin(productId);
  if (!existing) {
    res.status(404).json({ error: 'المنتج المطلوب غير موجود.' });
    return;
  }
  const { customerName, rating, comment } = req.body as {
    customerName?: string;
    rating?: number;
    comment?: string;
  };
  if (!customerName?.trim() || !comment?.trim()) {
    res.status(400).json({ error: 'يرجى كتابة الاسم والتعليق لتقييم المنتج.' });
    return;
  }
  const review = addProductReview({
    productId,
    customerName,
    rating: Number(rating) || 5,
    comment,
  });
  res.status(201).json({ review, pendingApproval: true });
});

app.post('/api/upload-public', (req, res) => {
  try {
    const { filename, mimeType, dataBase64 } = req.body as {
      filename?: string;
      mimeType?: string;
      dataBase64?: string;
    };
    if (!filename || !mimeType || !dataBase64 || !mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'يرجى اختيار صورة صالحة (JPG / PNG).' });
      return;
    }
    const url = saveUploadedMedia(filename, mimeType, dataBase64);
    res.status(201).json({ url });
  } catch {
    res.status(500).json({ error: 'تعذر رفع الصورة.' });
  }
});

app.post('/api/analytics/visit', (req, res) => {
  const { visitorId } = req.body as { visitorId?: string };
  if (visitorId && typeof visitorId === 'string') {
    recordStoreVisit(visitorId);
  } else {
    recordStoreVisit(`anon-${Date.now()}`);
  }
  res.status(204).end();
});

app.post('/api/analytics/search', (req, res) => {
  const { query } = req.body as { query?: string };
  if (query && typeof query === 'string') {
    recordSearchQuery(query);
  }
  res.status(204).end();
});

app.post('/api/promo-codes/validate', (req, res) => {
  const { code, subtotalSar } = req.body as { code?: string; subtotalSar?: number };
  if (!code?.trim()) {
    res.status(400).json({ error: 'يرجى إدخال رمز كود الخصم المكون من 4 خانات.' });
    return;
  }
  const result = validatePromoDiscountCode(code, Math.max(0, Number(subtotalSar) || 0));
  if (result.valid === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post('/api/orders', async (req: CustomerRequest, res) => {
  try {
    if (getAdminSettings().storeOpen === false) {
      res.status(503).json({
        error: 'المتجر مغلق مؤقتاً من قِبل المالك ولا يستقبل طلبات جديدة حالياً.',
      });
      return;
    }
    const {
      customerName,
      customerPhone,
      nationalAddress,
      customerAddress,
      shippingCompany,
      items,
      paymentMethod,
      paypalTransactionId,
      bankTransferRef,
      redeemCoins,
      couponCode,
    } = req.body as {
      customerName?: string;
      customerPhone?: string;
      nationalAddress?: string;
      customerAddress?: string;
      shippingCompany?: string;
      items?: { productId: string; quantity: number }[];
      paymentMethod?: 'paypal' | 'bank_transfer' | 'whatsapp' | 'owner_wallet';
      paypalTransactionId?: string;
      bankTransferRef?: string;
      redeemCoins?: number;
      couponCode?: string;
    };

    const resolvedMethod: 'paypal' | 'bank_transfer' | 'whatsapp' | 'owner_wallet' =
      paymentMethod === 'paypal'
        ? 'paypal'
        : paymentMethod === 'bank_transfer'
          ? 'bank_transfer'
          : paymentMethod === 'owner_wallet'
            ? 'owner_wallet'
            : 'whatsapp';

    if (resolvedMethod === 'owner_wallet') {
      const ownerTokenHeader = req.headers['x-owner-token'];
      const ownerToken =
        typeof ownerTokenHeader === 'string' ? ownerTokenHeader.trim() : '';
      const verifiedOwner = ownerToken
        ? verifySignedToken<{ role?: string }>(ownerToken)
        : null;
      if (!verifiedOwner || verifiedOwner.role !== 'admin') {
        res.status(401).json({
          error: 'الدفع عبر محفظة المالك متاح للمالك فقط بعد تسجيل الدخول في لوحة التحكم.',
        });
        return;
      }
    }

    if (!customerName?.trim() || !customerPhone?.trim() || !customerAddress?.trim()) {
      res.status(400).json({ error: 'يرجى تعبئة الاسم ورقم الجوال والعنوان بالكامل.' });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'سلة المشتريات فارغة.' });
      return;
    }

    const published = getPublishedProducts();
    const adminSettingsSnapshot = getAdminSettings();
    const isWholesaleMode = adminSettingsSnapshot.priceDisplayMode === 'wholesale';
    const resolvedItems: OrderItem[] = [];
    let totalSar = 0;

    for (const reqItem of items) {
      const prod = published.find((p) => p.id === reqItem.productId);
      if (!prod) continue;
      const qty = Math.max(1, Math.min(99, Math.floor(Number(reqItem.quantity) || 1)));
      const effectivePriceSar =
        isWholesaleMode && typeof prod.wholesalePriceSar === 'number' && prod.wholesalePriceSar > 0
          ? prod.wholesalePriceSar
          : prod.priceSar;
      totalSar += effectivePriceSar * qty;
      resolvedItems.push({
        productId: prod.id,
        name: prod.name,
        priceSar: effectivePriceSar,
        quantity: qty,
        image: (prod.images || [])[0] || '',
      });
    }

    if (resolvedItems.length === 0) {
      res.status(400).json({ error: 'لم يتم العثور على منتجات صالحة في الطلب.' });
      return;
    }

    const settings = getPublicSettings();

    let customerId: string | undefined;
    const token = extractBearer(req);
    if (token) {
      const verified = verifySignedToken<{ role?: string; customerId?: string }>(token);
      if (verified?.role === 'customer' && verified.customerId) {
        customerId = verified.customerId;
      }
    }

    const orderId = `ORD-${crypto.randomInt(10000, 99999)}`;
    const loyaltyRes = applyLoyaltyAndAwardOnOrder({
      customerId,
      subtotalSar: totalSar,
      redeemCoins,
      couponCode,
      orderId,
    });
    if (loyaltyRes.error) {
      res.status(400).json({ error: loyaltyRes.error });
      return;
    }

    const finalTotalSar = Number(Math.max(0, totalSar - loyaltyRes.discountSar).toFixed(2));
    const totalUsd = Number((finalTotalSar * settings.sarToUsdRate).toFixed(2));

    if (resolvedMethod === 'owner_wallet') {
      const walletRes = chargeOwnerWalletForCartOrder({
        orderId,
        amountSar: finalTotalSar,
        itemSummary: resolvedItems.map((i) => `${i.name} × ${i.quantity}`).join('، '),
      });
      if (walletRes.error) {
        res.status(400).json({ error: walletRes.error });
        return;
      }
    }

    const order = createOrder({
      id: orderId,
      customerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      nationalAddress: nationalAddress?.trim() || undefined,
      customerAddress: customerAddress.trim(),
      shippingCompany: shippingCompany?.trim() || undefined,
      items: resolvedItems,
      subtotalSar: totalSar,
      discountSar: loyaltyRes.discountSar > 0 ? loyaltyRes.discountSar : undefined,
      coinsRedeemed: loyaltyRes.coinsRedeemed > 0 ? loyaltyRes.coinsRedeemed : undefined,
      couponCodeUsed: loyaltyRes.couponCodeUsed,
      coinsEarned: loyaltyRes.coinsEarned > 0 ? loyaltyRes.coinsEarned : undefined,
      totalSar: finalTotalSar,
      totalUsd,
      paymentMethod: resolvedMethod,
      paypalTransactionId: resolvedMethod === 'paypal' ? paypalTransactionId : undefined,
      bankTransferRef:
        resolvedMethod === 'bank_transfer'
          ? bankTransferRef?.trim() || undefined
          : resolvedMethod === 'owner_wallet'
            ? 'مدفوع عبر محفظة المالك'
            : undefined,
      status:
        resolvedMethod === 'paypal' || resolvedMethod === 'owner_wallet'
          ? 'تم التأكيد'
          : 'قيد المراجعة',
      createdAt: new Date().toISOString(),
    });

    await notifyOwnerWebhookIfConfigured(
      'new_order',
      `طلب جديد ${order.id} من ${order.customerName} بقيمة ${order.totalSar} ر.س (${order.paymentMethod})`
    );

    res.status(201).json({ order, customer: loyaltyRes.updatedCustomer });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الطلب.' });
  }
});

// ==========================================
// CUSTOMER AUTH & PROFILE ENDPOINTS
// ==========================================

app.post('/api/customers/register', (req, res) => {
  const { name, phone, email, nationalAddress, address, password } = req.body as {
    name?: string;
    phone?: string;
    email?: string;
    nationalAddress?: string;
    address?: string;
    password?: string;
  };
  if (!name?.trim() || name.trim().length < 2) {
    res.status(400).json({ error: 'يرجى إدخال الاسم الكامل (حرفين على الأقل).' });
    return;
  }
  if (!phone?.trim()) {
    res.status(400).json({ error: 'يرجى إدخال رقم الجوال.' });
    return;
  }
  if (!password || password.length < 4) {
    res.status(400).json({ error: 'يرجى إدخال كلمة مرور لا تقل عن 4 أحرف.' });
    return;
  }
  const result = registerCustomer({ name, phone, email, nationalAddress, address, password });
  if (result.error || !result.customer) {
    res.status(400).json({ error: result.error || 'تعذر إنشاء الحساب.' });
    return;
  }
  const token = createSignedToken({ role: 'customer', customerId: result.customer.id });
  res.status(201).json({ token, customer: result.customer });
});

app.post('/api/customers/login', (req, res) => {
  const { phone, password } = req.body as { phone?: string; password?: string };
  if (!phone?.trim() || !password) {
    res.status(400).json({ error: 'يرجى إدخال رقم الجوال (أو البريد) وكلمة المرور.' });
    return;
  }
  const customer = loginCustomer(phone, password);
  if (!customer) {
    res.status(401).json({ error: 'بيانات الدخول غير صحيحة. تأكد من الرقم وكلمة المرور.' });
    return;
  }
  const token = createSignedToken({ role: 'customer', customerId: customer.id });
  res.json({ token, customer });
});

app.post('/api/customers/google-auth', async (req, res, next) => {
  try {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken?.trim()) {
      res.status(400).json({ error: 'رمز التحقق من Google مفقود.' });
      return;
    }

    let firebaseApiKey = process.env.VITE_FIREBASE_API_KEY || '';
    if (!firebaseApiKey) {
      const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(cfgPath)) {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { apiKey?: string };
        firebaseApiKey = parsed.apiKey || '';
      }
    }
    if (!firebaseApiKey) {
      res.status(500).json({ error: 'إعدادات Firebase غير مكتملة على الخادم.' });
      return;
    }

    const verifyResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken.trim() }),
      }
    );
    if (!verifyResp.ok) {
      res.status(401).json({ error: 'تعذر التحقق من جلسة Google. يرجى المحاولة مجدداً.' });
      return;
    }
    const verifyJson = (await verifyResp.json()) as {
      users?: { localId?: string; email?: string; displayName?: string; emailVerified?: boolean }[];
    };
    const fbUser = verifyJson.users?.[0];
    if (!fbUser?.localId || !fbUser?.email) {
      res.status(401).json({ error: 'بيانات حساب Google غير مكتملة أو غير موثقة.' });
      return;
    }

    const existingBearer = extractBearer(req);
    const verifiedSession = existingBearer
      ? verifySignedToken<{ role?: string; customerId?: string }>(existingBearer)
      : null;

    const result = upsertGoogleCustomer({
      googleUid: fbUser.localId,
      email: fbUser.email,
      name: fbUser.displayName,
      existingCustomerId:
        verifiedSession?.role === 'customer' ? verifiedSession.customerId : undefined,
    });
    if (result.error || !result.customer) {
      res.status(400).json({ error: result.error || 'تعذر ربط حساب Google.' });
      return;
    }
    const token = createSignedToken({ role: 'customer', customerId: result.customer.id });
    res.json({ token, customer: result.customer });
  } catch (err) {
    next(err);
  }
});

app.post('/api/customers/forgot-password', (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone?.trim()) {
    res.status(400).json({ error: 'يرجى إدخال رقم الجوال المسجل أو البريد الإلكتروني.' });
    return;
  }
  const result = requestCustomerPasswordReset(phone);
  if (result.ok === false) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json({
    sent: true,
    phone: result.phone,
    previewCode: result.code,
    message: 'تم توليد رمز التحقق لإعادة تعيين كلمة المرور بنجاح.',
  });
});

app.post('/api/customers/reset-password', (req, res) => {
  const { phone, code, newPassword } = req.body as {
    phone?: string;
    code?: string;
    newPassword?: string;
  };
  if (!phone?.trim() || !code?.trim()) {
    res.status(400).json({ error: 'يرجى إدخال رقم الجوال ورمز التحقق.' });
    return;
  }
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: 'يجب أن تكون كلمة المرور الجديدة 4 أحرف على الأقل.' });
    return;
  }
  const result = confirmCustomerPasswordReset(phone, code, newPassword);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  const token = createSignedToken({ role: 'customer', customerId: result.customer.id });
  res.json({ success: true, token, customer: result.customer });
});

app.post('/api/customers/change-password', requireCustomer, (req: CustomerRequest, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({
      error: 'يجب أن تكون كلمة المرور الجديدة 4 أحرف على الأقل.',
    });
    return;
  }
  const current = getCustomerById(req.customerId!);
  if (!current) {
    res.status(404).json({ error: 'الحساب غير موجود.' });
    return;
  }
  if (current.hasPassword !== false && !currentPassword) {
    res.status(400).json({
      error: 'يرجى إدخال كلمة المرور الحالية وكلمة المرور الجديدة.',
    });
    return;
  }
  const result = changeCustomerPassword(req.customerId!, currentPassword || '', newPassword);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ success: true, customer: result.customer });
});

app.get('/api/customers/me', requireCustomer, (req: CustomerRequest, res) => {
  const customer = getCustomerById(req.customerId!);
  if (!customer) {
    res.status(404).json({ error: 'الحساب غير موجود.' });
    return;
  }
  const orders = getOrdersForCustomer(customer.id);
  res.json({ customer, orders });
});

app.put('/api/customers/me', requireCustomer, (req: CustomerRequest, res) => {
  const { name, phone, email, nationalAddress, address } = req.body as {
    name?: string;
    phone?: string;
    email?: string;
    nationalAddress?: string;
    address?: string;
  };
  if (name !== undefined && name.trim().length < 2) {
    res.status(400).json({ error: 'يرجى إدخال الاسم الكامل بشكل صحيح.' });
    return;
  }
  const result = updateCustomerProfile(req.customerId!, {
    name,
    phone,
    email,
    nationalAddress,
    address,
  });
  if (result.error || !result.customer) {
    res.status(400).json({ error: result.error || 'تعذر تحديث البيانات.' });
    return;
  }
  res.json({ customer: result.customer });
});

app.post('/api/customers/ai/vehicle-lookup', async (req, res) => {
  try {
    const { vehicle, questionOrCode } = req.body as {
      vehicle?: string;
      questionOrCode?: string;
    };
    if (!vehicle?.trim() || vehicle.trim().length < 2) {
      res.status(400).json({ error: 'يرجى إدخال نوع وموديل السيارة (مثال: تويوتا كامري 2021).' });
      return;
    }
    const result = await lookupVehicleCompatibilityWithSearch({
      vehicle,
      questionOrCode,
    });
    res.json(result);
  } catch (err) {
    const status =
      typeof (err as { status?: number })?.status === 'number'
        ? (err as { status: number }).status
        : 500;
    console.error('Vehicle AI Search Grounding error:', err);
    if (status === 429) {
      res.status(429).json({
        error: 'تم تجاوز الحد المؤقت لطلبات البحث الذكي. يرجى الانتظار دقيقة ثم المحاولة مجدداً.',
      });
      return;
    }
    if (status === 401 || status === 403) {
      res.status(status).json({
        error: 'تعذر تفعيل خدمة البحث الذكي حالياً بسبب صلاحيات مفتاح API في إعدادات المشروع.',
      });
      return;
    }
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'تعذر إتمام البحث المباشر حالياً. يرجى المحاولة مجدداً بعد قليل.',
    });
  }
});

app.post('/api/customers/daily-checkin', requireCustomer, (req: CustomerRequest, res) => {
  const result = claimDailyCoins(req.customerId!);
  if (result.error || !result.customer) {
    res.status(400).json({ error: result.error || 'تعذر تسجيل الدخول اليومي.' });
    return;
  }
  res.json({ customer: result.customer, awardedCoins: result.awardedCoins });
});

app.post('/api/customers/share-reward', requireCustomer, (req: CustomerRequest, res) => {
  const { productId, productTitle, channel } = req.body as {
    productId?: string;
    productTitle?: string;
    channel?: string;
  };
  const result = awardProductSharePoints(req.customerId!, {
    productId,
    productTitle,
    channel,
  });
  if (result.error || !result.customer) {
    res.status(400).json({ error: result.error || 'تعذر احتساب نقاط المشاركة.' });
    return;
  }
  res.json({
    customer: result.customer,
    awardedCoins: result.awardedCoins ?? 0,
    alreadySharedToday: Boolean(result.alreadySharedToday),
  });
});

app.post('/api/customers/redeem-coupon', requireCustomer, (req: CustomerRequest, res) => {
  const { coins } = req.body as { coins?: number };
  const result = convertCoinsToCoupon(req.customerId!, Number(coins) || 0);
  if (result.error || !result.customer || !result.coupon) {
    res.status(400).json({ error: result.error || 'تعذر تحويل العملات إلى كوبون.' });
    return;
  }
  res.json({ customer: result.customer, coupon: result.coupon });
});

// ==========================================
// OWNER ADMIN ENDPOINTS (PASSWORD PROTECTED)
// ==========================================

async function dispatchOwnerSecurityCodeEmail(
  toEmail: string,
  code: string,
  subject: string,
  heading: string,
  description: string
): Promise<{ deliveryMode: 'smtp' | 'resend' | 'verified_direct'; previewCode?: string }> {
  const htmlBody = `
    <div dir="rtl" style="font-family: Arial, sans-serif; background:#09090B; color:#F5F2EB; padding:24px; border:1px solid #D4AF37; border-radius:12px;">
      <h2 style="color:#E5C158; margin-top:0;">${heading}</h2>
      <p>${description}</p>
      <div style="font-size:28px; font-weight:bold; letter-spacing:4px; color:#D4AF37; background:#14120E; padding:14px 20px; border-radius:10px; display:inline-block; margin:12px 0;">
        ${code}
      </div>
      <p style="color:#9E988C; font-size:13px;">الرمز مؤقت وسريع الانتهاء. إذا لم تطلب ذلك، يرجى تأمين حسابك فوراً.</p>
    </div>
  `;

  try {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: toEmail,
        subject,
        text: `${heading}: ${code}`,
        html: htmlBody,
      });
      return { deliveryMode: 'smtp' };
    }

    if (process.env.RESEND_API_KEY) {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'onboarding@resend.dev',
          to: [toEmail],
          subject,
          html: htmlBody,
        }),
      });
      if (resendRes.ok) {
        return { deliveryMode: 'resend' };
      }
    }
  } catch (err) {
    console.error('Owner email dispatch warning:', err);
  }

  return { deliveryMode: 'verified_direct', previewCode: code };
}

app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = (req.body || {}) as { password?: string };
    if (!password || !verifyAdminPassword(password)) {
      res.status(401).json({ error: 'كلمة مرور المالك غير صحيحة.' });
      return;
    }

    const token = createSignedToken({ role: 'admin' });
    res.json({ token });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'تعذر إتمام تسجيل دخول المالك حالياً.' });
  }
});

app.post('/api/admin/login/send-email-otp', async (req, res) => {
  try {
    const { challengeToken } = (req.body || {}) as { challengeToken?: string };
    const verified = challengeToken
      ? verifySignedToken<{ role?: string }>(challengeToken)
      : null;
    if (!verified || verified.role !== 'admin_2fa_pending') {
      res.status(401).json({ error: 'انتهت جلسة التحقق، يرجى إدخال كلمة المرور مجدداً.' });
      return;
    }

    const otp = issueAdminEmailLoginOtp();
    const sent = await dispatchOwnerSecurityCodeEmail(
      otp.recoveryEmail,
      otp.code,
      'رمز المصادقة الثنائية الاحتياطي - لوحة تحكم المالك',
      'رمز التحقق للدخول إلى لوحة تحكم المالك',
      'استخدم هذا الرمز لإتمام الدخول إلى لوحة التحكم:'
    );
    res.json({
      sent: true,
      deliveryMode: sent.deliveryMode,
      previewCode: sent.previewCode,
      message:
        sent.deliveryMode === 'verified_direct'
          ? 'تم توليد رمز التحقق الاحتياطي لبريد المالك المعتمد.'
          : 'تم إرسال رمز التحقق إلى بريد المالك المعتمد.',
    });
  } catch (error) {
    console.error('Send email OTP error:', error);
    res.status(500).json({ error: 'تعذر إرسال رمز التحقق حالياً.' });
  }
});

app.post('/api/admin/login/verify-2fa', (req, res) => {
  const { challengeToken, code } = (req.body || {}) as {
    challengeToken?: string;
    code?: string;
  };
  const verified = challengeToken
    ? verifySignedToken<{ role?: string }>(challengeToken)
    : null;
  if (!verified || verified.role !== 'admin_2fa_pending') {
    res.status(401).json({ error: 'انتهت صلاحية جلسة التحقق الثنائي، يرجى تسجيل الدخول مجدداً.' });
    return;
  }
  const check = verifyAdminSecondFactor(code || '');
  if (check.ok === false) {
    res.status(401).json({ error: check.error });
    return;
  }
  const token = createSignedToken({ role: 'admin' });
  res.json({ token, usedBackupCode: check.usedBackupCode });
});

app.post('/api/admin/forgot-password', async (req, res) => {
  try {
    const { email } = (req.body || {}) as { email?: string };
    if (!email?.trim()) {
      res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني لاستعادة كلمة المرور.' });
      return;
    }
    const result = requestAdminPasswordReset(email);
    if (result.ok === false) {
      res.status(400).json({ error: result.error });
      return;
    }

    const sent = await dispatchOwnerSecurityCodeEmail(
      result.recoveryEmail,
      result.code,
      'رمز إعادة تعيين كلمة مرور المالك - مصنع التاج الذهبي',
      'إعادة تعيين كلمة مرور لوحة تحكم المالك',
      'تم طلب رمز تحقق لاستعادة كلمة مرور لوحة تحكم المالك:'
    );

    res.json({
      sent: true,
      deliveryMode: sent.deliveryMode,
      previewCode: sent.previewCode,
      message:
        sent.deliveryMode === 'verified_direct'
          ? 'تم التحقق من بريدك الإلكتروني المعتمد وتوليد رمز الاستعادة بنجاح (للتوصيل التلقائي لصندوق الوارد، أضف بيانات SMTP أو Resend في متغيرات البيئة).'
          : 'تم إرسال رمز التحقق بنجاح إلى بريدك الإلكتروني المعتمد.',
    });
  } catch (error) {
    console.error('Admin forgot-password error:', error);
    res.status(500).json({ error: 'تعذر معالجة طلب استعادة كلمة المرور حالياً.' });
  }
});

app.post('/api/admin/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body as {
    email?: string;
    code?: string;
    newPassword?: string;
  };
  if (!email?.trim() || !code?.trim()) {
    res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني ورمز التحقق.' });
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل.' });
    return;
  }
  const result = confirmAdminPasswordReset(email, code, newPassword);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ success: true });
});

app.get('/api/admin/2fa/status', requireAdmin, (_req, res) => {
  res.json(getAdminTwoFactorStatus());
});

app.post('/api/admin/2fa/setup-totp', requireAdmin, async (_req, res) => {
  try {
    const { secret, otpauthUrl } = beginAdminTotpSetup();
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#09090B', light: '#FFFFFF' },
    });
    res.json({ secret, otpauthUrl, qrDataUrl });
  } catch (error) {
    console.error('2FA TOTP setup error:', error);
    res.status(500).json({ error: 'تعذر توليد رمز QR للمصادقة الثنائية.' });
  }
});

app.post('/api/admin/2fa/confirm-totp', requireAdmin, (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code?.trim()) {
    res.status(400).json({ error: 'يرجى إدخال الرمز المكون من 6 أرقام من تطبيق المصادقة.' });
    return;
  }
  const result = confirmAdminTotpSetup(code);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({
    enabled: true,
    method: 'totp',
    backupCodes: result.backupCodes,
    status: getAdminTwoFactorStatus(),
  });
});

app.post('/api/admin/2fa/enable-email', requireAdmin, (_req, res) => {
  const result = enableAdminEmailTwoFactor();
  res.json({
    enabled: true,
    method: 'email',
    backupCodes: result.backupCodes,
    status: getAdminTwoFactorStatus(),
  });
});

app.post('/api/admin/2fa/disable', requireAdmin, (req, res) => {
  const { currentPassword } = req.body as { currentPassword?: string };
  if (!currentPassword) {
    res.status(400).json({ error: 'يرجى إدخال كلمة مرور المالك الحالية لإيقاف المصادقة الثنائية.' });
    return;
  }
  const result = disableAdminTwoFactor(currentPassword);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ enabled: false, status: getAdminTwoFactorStatus() });
});

app.post('/api/admin/2fa/regenerate-backup-codes', requireAdmin, (_req, res) => {
  const backupCodes = regenerateAdminBackupCodes();
  res.json({ backupCodes, status: getAdminTwoFactorStatus() });
});

app.get('/api/admin/dashboard', requireAdmin, (_req, res) => {
  const { alerts, whatsappDigestText } = getOwnerAlertsAndDigest();
  const walletSummary = getOwnerWalletSummaryAdmin();
  res.json({
    settings: getAdminSettings(),
    twoFactorStatus: getAdminTwoFactorStatus(),
    products: getAllProductsAdmin(),
    banners: getAllBannersAdmin(),
    customers: getAllCustomersAdmin(),
    orders: getAllOrdersAdmin(),
    reviews: getAllReviewsAdmin(),
    alerts,
    whatsappDigestText,
    assistantMessages: getAssistantMessages(),
    analytics: getOwnerAnalyticsAdmin(),
    ownerWallet: walletSummary,
  });
});

app.get('/api/admin/wallet', requireAdmin, (_req, res) => {
  res.json(getOwnerWalletSummaryAdmin());
});

app.post('/api/admin/wallet/deposit', requireAdmin, (req, res) => {
  const { amountSar, note, reference } = req.body as {
    amountSar?: number;
    note?: string;
    reference?: string;
  };
  const result = depositToOwnerWalletAdmin({
    amountSar: Number(amountSar) || 0,
    note,
    reference,
  });
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post('/api/admin/wallet/transfer-sales', requireAdmin, (_req, res) => {
  const result = transferSalesRevenueToWalletAdmin();
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post('/api/admin/wallet/purchase', requireAdmin, (req, res) => {
  const {
    mode,
    productId,
    quantity,
    priceBasis,
    title,
    category,
    amountSar,
    reference,
    recordStoreOrder,
  } = req.body as {
    mode?: 'product' | 'external';
    productId?: string;
    quantity?: number;
    priceBasis?: 'cost' | 'wholesale' | 'retail';
    title?: string;
    category?: string;
    amountSar?: number;
    reference?: string;
    recordStoreOrder?: boolean;
  };
  const result = purchaseWithOwnerWalletAdmin({
    mode: mode === 'product' ? 'product' : 'external',
    productId,
    quantity,
    priceBasis,
    title,
    category,
    amountSar,
    reference,
    recordStoreOrder,
  });
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.put('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const { approved } = req.body as { approved?: boolean };
  const updated = approveReviewAdmin(String(req.params.id), Boolean(approved));
  if (!updated) {
    res.status(404).json({ error: 'التقييم غير موجود.' });
    return;
  }
  res.json({ review: updated });
});

app.delete('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  const ok = deleteReviewAdmin(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'التقييم غير موجود.' });
    return;
  }
  res.json({ success: true });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const patch = { ...(req.body as Partial<Record<string, unknown>>) };
  if ('seoKeywords' in patch) {
    patch.seoKeywords = parseSeoKeywordsList(patch.seoKeywords);
  }
  const updated = updateSettings(patch);
  res.json({ settings: updated });
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  try {
    const { filename, mimeType, dataBase64 } = req.body as {
      filename?: string;
      mimeType?: string;
      dataBase64?: string;
    };
    if (!filename || !mimeType || !dataBase64) {
      res.status(400).json({ error: 'بيانات الملف غير مكتملة.' });
      return;
    }
    const url = saveUploadedMedia(filename, mimeType, dataBase64);
    res.status(201).json({ url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'تعذر حفظ الملف المرفوع.' });
  }
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !verifyAdminPassword(currentPassword)) {
    res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل.' });
    return;
  }
  updateAdminPassword(newPassword);
  res.json({ success: true });
});

// Owner Personal AI Assistant Endpoints
app.post('/api/admin/assistant/chat', requireAdmin, async (req, res) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message?.trim()) {
      res.status(400).json({ error: 'يرجى كتابة رسالة للمساعد الشخصي.' });
      return;
    }

    const userMsg = appendAssistantMessage({
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      role: 'user',
      text: message.trim(),
      createdAt: new Date().toISOString(),
    });

    const result = await runOwnerAssistantTurn(message.trim());
    const assistantMsg = appendAssistantMessage({
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      role: 'assistant',
      text: result.reply,
      actionsExecuted: result.actionsExecuted,
      whatsappAlertText: result.whatsappAlertText,
      createdAt: new Date().toISOString(),
    });

    const { alerts, whatsappDigestText } = getOwnerAlertsAndDigest();
    res.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      mutatedStorefront: result.mutatedStorefront,
      products: getAllProductsAdmin(),
      alerts,
      whatsappDigestText,
    });
  } catch (error) {
    console.error('Assistant error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'تعذر تنفيذ طلب المساعد الذكي.',
    });
  }
});

app.post('/api/admin/assistant/send-webhook', requireAdmin, async (_req, res) => {
  const { whatsappDigestText } = getOwnerAlertsAndDigest();
  const sent = await notifyOwnerWebhookIfConfigured('manual_owner_digest', whatsappDigestText);
  res.json({ sent, whatsappDigestText });
});

app.post('/api/admin/ai/optimize-background', requireAdmin, async (req, res) => {
  try {
    const {
      target,
      mediaType,
      siteBackgroundType,
      url,
      styleHint,
    } = (req.body || {}) as {
      target?: 'site' | 'hero';
      mediaType?: 'video' | 'animated_image' | 'image';
      siteBackgroundType?: string;
      url?: string;
      styleHint?: string;
    };
    const resolvedMediaType =
      mediaType === 'video' || mediaType === 'animated_image' || mediaType === 'image'
        ? mediaType
        : siteBackgroundType === 'video' || siteBackgroundType === 'animated_image'
          ? siteBackgroundType
          : 'image';
    const result = await optimizeBackgroundWithAi({
      target: target === 'hero' ? 'hero' : 'site',
      mediaType: resolvedMediaType,
      url,
      styleHint,
    });
    res.json({
      ...result,
      recommendation: {
        siteBackgroundOpacity: result.recommendedOpacity,
        siteBackgroundAnimatedMotion: result.recommendedMotion,
        siteBackgroundFilter: result.cssFilter,
        heroAnimatedMotion: result.recommendedMotion,
        heroBackdropFilter: result.cssFilter,
        noteAr: result.explanationAr,
      },
    });
  } catch (error) {
    console.error('Background AI optimize error:', error);
    res.status(500).json({ error: 'تعذر ضبط الخلفية بالذكاء الاصطناعي.' });
  }
});

app.post('/api/admin/ai/translate-product', requireAdmin, async (req, res) => {
  try {
    const { name, description, category } = req.body as {
      name?: string;
      description?: string;
      category?: string;
    };
    if (!name?.trim()) {
      res.status(400).json({ error: 'اسم المنتج مطلوب للترجمة.' });
      return;
    }
    const result = await translateProductToEnglishWithAi({
      name: name.trim(),
      description: description?.trim(),
      category: category?.trim(),
    });
    res.json(result);
  } catch (error) {
    console.error('AI translate product error:', error);
    res.status(500).json({ error: 'تعذر ترجمة المنتج للإنجليزية تلقائياً.' });
  }
});

// Import Product from External URL or Manual Pasted Text (Proxy HTML / Raw Text + Gemini API analysis)
app.post('/api/admin/ai/import-from-url', requireAdmin, async (req, res) => {
  try {
    const { url, htmlContent, rawText } = (req.body || {}) as {
      url?: string;
      htmlContent?: string;
      rawText?: string;
    };
    const cleanUrl = (url || '').trim();
    const cleanRaw = (rawText || '').trim();

    if (cleanRaw.length < 15 && (!cleanUrl || !/^https?:\/\//i.test(cleanUrl))) {
      res.status(400).json({
        error: 'يرجى إدخال رابط منتج صحيح يبدأ بـ http:// أو https:// أو لصق نص تفاصيل المنتج.',
      });
      return;
    }

    const categories = getAdminSettings()
      .categories.filter((c) => c.isActive !== false)
      .map((c) => c.name);
    const result = await importProductFromUrlWithHtml({
      url: cleanUrl || undefined,
      htmlContent: typeof htmlContent === 'string' ? htmlContent.slice(0, 250000) : undefined,
      rawText: cleanRaw ? cleanRaw.slice(0, 40000) : undefined,
      categories,
    });
    res.json(result);
  } catch (error) {
    console.error('AI import from URL/text error:', error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'تعذر استيراد وتحليل بيانات المنتج بالذكاء الاصطناعي.',
    });
  }
});

// Products CRUD (Admin)
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const body = req.body as Partial<Product>;
  if (!body.name?.trim() || !body.priceSar) {
    res.status(400).json({ error: 'اسم المنتج والسعر مطلوبان.' });
    return;
  }
  const product: Product = {
    id: `prod-${crypto.randomUUID().slice(0, 8)}`,
    sku: body.sku?.trim() || undefined,
    name: body.name.trim(),
    nameEn: body.nameEn?.trim() || undefined,
    category: body.category?.trim() || 'مقتنيات مختارة',
    priceSar: Number(body.priceSar),
    wholesalePriceSar: body.wholesalePriceSar ? Number(body.wholesalePriceSar) : undefined,
    compareAtPriceSar: body.compareAtPriceSar ? Number(body.compareAtPriceSar) : undefined,
    description: body.description?.trim() || '',
    descriptionEn: body.descriptionEn?.trim() || undefined,
    images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
    specs: Array.isArray(body.specs) ? body.specs : [],
    installationGuidePdfUrl: body.installationGuidePdfUrl?.trim() || undefined,
    installationGuideImages: Array.isArray(body.installationGuideImages)
      ? body.installationGuideImages.filter(Boolean)
      : undefined,
    fuelEfficiencyGainPercent: body.fuelEfficiencyGainPercent
      ? Number(body.fuelEfficiencyGainPercent)
      : undefined,
    inStock: body.inStock !== false,
    isPublished: Boolean(body.isPublished),
    costPriceSar: body.costPriceSar ? Number(body.costPriceSar) : undefined,
    profitMarginPercent: body.profitMarginPercent ? Number(body.profitMarginPercent) : undefined,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    seoKeywords: parseSeoKeywordsList(body.seoKeywords),
    createdAt: new Date().toISOString(),
  };
  createProduct(product);
  res.status(201).json({ product });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const patch = { ...(req.body as Partial<Product>) };
  if ('seoKeywords' in patch) {
    patch.seoKeywords = parseSeoKeywordsList(patch.seoKeywords);
  }
  const updated = updateProduct(String(req.params.id), patch);
  if (!updated) {
    res.status(404).json({ error: 'المنتج غير موجود.' });
    return;
  }
  res.json({ product: updated });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const ok = deleteProduct(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'المنتج غير موجود.' });
    return;
  }
  res.json({ success: true });
});

// Secret AI Product Scraper -> Supports URL or direct product name, auto-generates 1000x1000 Gemini image when missing, writes Arabic marketing copy, and publishes directly
app.post('/api/admin/scrape-product', requireAdmin, async (req, res) => {
  try {
    const { url, productName, category } = req.body as {
      url?: string;
      productName?: string;
      category?: string;
    };
    const cleanUrl = (url || '').trim();
    const cleanName = (productName || '').trim();

    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      res.status(400).json({ error: 'يرجى إدخال رابط منتج صحيح يبدأ بـ http:// أو https://' });
      return;
    }
    if (!cleanUrl && !cleanName) {
      res.status(400).json({ error: 'يرجى إدخال رابط المنتج أو كتابة اسمه ليتم إنشاؤه وسحبه تلقائياً.' });
      return;
    }

    const extracted = await scrapeProductFromUrlOrName({
      url: cleanUrl || undefined,
      productName: cleanName || undefined,
      category: category?.trim() || undefined,
    });

    const scrapedProduct: Product = {
      id: `prod-${crypto.randomUUID().slice(0, 8)}`,
      name: extracted.name,
      nameEn: extracted.nameEn,
      category: extracted.category,
      priceSar: extracted.priceSar,
      description: extracted.description,
      descriptionEn: extracted.descriptionEn,
      images: extracted.images,
      specs: extracted.specs,
      seoKeywords: parseSeoKeywordsList(extracted.seoKeywords),
      inStock: true,
      isPublished: true,
      isScrapedDraft: false,
      sourceUrl: cleanUrl || undefined,
      originalExtractedPrice: extracted.originalExtractedPrice,
      createdAt: new Date().toISOString(),
    };

    createProduct(scrapedProduct);
    await notifyOwnerWebhookIfConfigured(
      'scraped_product_published',
      `تم سحب وتوليد منتج جديد بالذكاء الاصطناعي ونشره في المتجر: ${scrapedProduct.name}`
    );
    res.status(201).json({
      product: scrapedProduct,
      aiGeneratedImage: Boolean(extracted.aiGeneratedImage),
    });
  } catch (error) {
    console.error('AI scrape error:', error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'تعذر استخراج أو توليد بيانات المنتج بالذكاء الاصطناعي.',
    });
  }
});

// Proxy external images safely for Owner Studio Canvas editing
app.get('/api/admin/proxy-image', requireAdmin, async (req, res) => {
  const targetUrl = String(req.query.url || '').trim();
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    res.status(400).json({ error: 'رابط الصورة غير صالح.' });
    return;
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 9000);
    const resp = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(t);
    if (!resp.ok) {
      res.status(502).json({ error: 'تعذر جلب الصورة من المصدر.' });
      return;
    }
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'الرابط لا يشير إلى صورة.' });
      return;
    }
    const arrayBuf = await resp.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.send(Buffer.from(arrayBuf));
  } catch {
    res.status(502).json({ error: 'تعذر تحميل الصورة الخارجية للتحرير.' });
  }
});

// AI Enhance Store Identity or Product Titles & Descriptions
app.post('/api/admin/ai/enhance-copy', requireAdmin, async (req, res) => {
  try {
    const body = req.body as {
      mode?: 'product' | 'store';
      name?: string;
      category?: string;
      description?: string;
      priceSar?: number;
      storeName?: string;
      storeTagline?: string;
      heroTitle?: string;
      focus?: string;
    };

    if (body.mode === 'store') {
      const settings = getAdminSettings();
      const result = await enhanceStoreIdentityWithAi({
        storeName: body.storeName || settings.storeName,
        storeTagline: body.storeTagline || settings.storeTagline,
        heroTitle: body.heroTitle || settings.heroTitle,
        focus: body.focus,
      });
      res.json({ result });
      return;
    }

    const result = await enhanceProductCopyWithAi({
      name: body.name || 'منتج دبة تلوث',
      category: body.category || 'دبات تلوث البنزين',
      description: body.description,
      priceSar: body.priceSar,
    });
    res.json({ result });
  } catch (error) {
    console.error('AI copy enhance error:', error);
    res.status(500).json({ error: 'تعذر تحسين النصوص بالذكاء الاصطناعي.' });
  }
});

// Scrape Similar Products from External Store + Automatic Profit Calculation -> Hidden Private Drafts
app.post('/api/admin/scrape-similar', requireAdmin, async (req, res) => {
  try {
    const {
      storeUrl,
      targetProductHint,
      profitMarginPercent,
      extraProfitSar,
      category,
    } = req.body as {
      storeUrl?: string;
      targetProductHint?: string;
      profitMarginPercent?: number;
      extraProfitSar?: number;
      category?: string;
    };

    if (!storeUrl || !/^https?:\/\//i.test(storeUrl.trim())) {
      res.status(400).json({ error: 'يرجى إدخال رابط متجر إلكتروني صحيح يبدأ بـ https://' });
      return;
    }
    if (!targetProductHint?.trim()) {
      res.status(400).json({ error: 'يرجى تحديد نوع أو اسم المنتج المشابه المطلوب سحبه.' });
      return;
    }

    const extractedList = await scrapeSimilarProductsFromUrl({
      storeUrl: storeUrl.trim(),
      targetProductHint: targetProductHint.trim(),
      profitMarginPercent: Number(profitMarginPercent ?? 25),
      extraProfitSar: Number(extraProfitSar ?? 0),
      category,
    });

    const createdProducts: Product[] = [];
    for (const item of extractedList) {
      const draft: Product = {
        id: `draft-${crypto.randomUUID().slice(0, 8)}`,
        name: item.name,
        category: item.category,
        priceSar: item.priceSar,
        compareAtPriceSar: item.compareAtPriceSar,
        description: item.description,
        images: item.images,
        specs: item.specs,
        inStock: true,
        isPublished: false,
        isScrapedDraft: true,
        sourceUrl: item.sourceUrl,
        originalExtractedPrice: item.originalExtractedPrice,
        costPriceSar: item.costPriceSar,
        profitMarginPercent: item.profitMarginPercent,
        createdAt: new Date().toISOString(),
      };
      createProduct(draft);
      createdProducts.push(draft);
    }

    await notifyOwnerWebhookIfConfigured(
      'scraped_similar_batch',
      `تم سحب ${createdProducts.length} منتج مشابه لـ "${targetProductHint.trim()}" مع احتساب هامش الربح وحفظها كمسودات سرية.`
    );

    res.status(201).json({ products: createdProducts });
  } catch (error) {
    console.error('Similar scrape error:', error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'تعذر سحب المنتجات المشابهة من المتجر المحدد.',
    });
  }
});

// AI SEO & Schema Markup Refresh
async function refreshPublishedProductsSeo(): Promise<number> {
  const settings = getAdminSettings();
  const allProducts = getAllProductsAdmin();
  const published = allProducts.filter((p) => p.isPublished);
  let updatedCount = 0;

  for (const prod of published) {
    try {
      const seo = await generateProductSeoData(prod, settings.storeName);
      updateProduct(prod.id, {
        seoTitle: seo.seoTitle,
        seoDescription: seo.seoDescription,
        seoKeywords: seo.seoKeywords,
        schemaMarkup: seo.schemaMarkup,
        seoLastUpdated: new Date().toISOString(),
      });
      updatedCount++;
    } catch (err) {
      console.error(`SEO update failed for ${prod.id}:`, err);
    }
  }

  updateSettings({ seoLastAutoRun: new Date().toISOString() });
  return updatedCount;
}

app.post('/api/admin/seo/refresh', requireAdmin, async (req, res) => {
  try {
    const { productId } = req.body as { productId?: string };
    const settings = getAdminSettings();

    if (productId) {
      const target = getProductByIdAdmin(productId);
      if (!target) {
        res.status(404).json({ error: 'المنتج غير موجود.' });
        return;
      }
      const seo = await generateProductSeoData(target, settings.storeName);
      const updated = updateProduct(target.id, {
        seoTitle: seo.seoTitle,
        seoDescription: seo.seoDescription,
        seoKeywords: seo.seoKeywords,
        schemaMarkup: seo.schemaMarkup,
        seoLastUpdated: new Date().toISOString(),
      });
      res.json({ updatedCount: 1, product: updated });
      return;
    }

    const updatedCount = await refreshPublishedProductsSeo();
    res.json({ updatedCount, products: getAllProductsAdmin() });
  } catch (error) {
    console.error('SEO refresh error:', error);
    res.status(500).json({ error: 'تعذر تحديث بيانات السيو عبر الذكاء الاصطناعي.' });
  }
});

// AI Google Ads & Promo Banner Generator
app.post('/api/admin/ads/generate', requireAdmin, async (req, res) => {
  try {
    const { productId, campaignGoal } = req.body as {
      productId?: string;
      campaignGoal?: string;
    };
    const settings = getAdminSettings();
    const product = productId ? getProductByIdAdmin(productId) : null;
    const campaign = await generateAdsAndBanner({
      storeName: settings.storeName,
      product,
      campaignGoal,
    });
    res.json({ campaign });
  } catch (error) {
    console.error('Ads generator error:', error);
    res.status(500).json({ error: 'تعذر توليد الحملة الإعلانية بالذكاء الاصطناعي.' });
  }
});

app.post('/api/admin/banners', requireAdmin, (req, res) => {
  const body = req.body;
  const banner = createBanner({
    id: `banner-${crypto.randomUUID().slice(0, 8)}`,
    title: body.title || 'عرض ملكي خاص',
    subtitle: body.subtitle || '',
    ctaText: body.ctaText || 'تسوق الآن',
    discountLabel: body.discountLabel,
    accentColor: body.accentColor || '#D4AF37',
    isActive: body.isActive !== false,
    googleAdsHeadlines: body.googleAdsHeadlines,
    googleAdsDescriptions: body.googleAdsDescriptions,
    googleAdsKeywords: body.googleAdsKeywords,
    createdAt: new Date().toISOString(),
  });
  res.status(201).json({ banner });
});

app.put('/api/admin/banners/:id', requireAdmin, (req, res) => {
  const updated = updateBanner(String(req.params.id), req.body);
  if (!updated) {
    res.status(404).json({ error: 'البنر غير موجود.' });
    return;
  }
  res.json({ banner: updated });
});

app.delete('/api/admin/banners/:id', requireAdmin, (req, res) => {
  const ok = deleteBanner(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'البنر غير موجود.' });
    return;
  }
  res.json({ success: true });
});

app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const { status, shippingCompany, trackingNumber, shippingNotice } = req.body as {
    status?: OrderStatus;
    shippingCompany?: string;
    trackingNumber?: string;
    shippingNotice?: string;
  };
  const updated = updateOrderStatus(String(req.params.id), {
    status,
    shippingCompany,
    trackingNumber,
    shippingNotice,
  });
  if (!updated) {
    res.status(404).json({ error: 'الطلب غير موجود.' });
    return;
  }
  res.json({ order: updated });
});

app.put('/api/admin/customers/:id/coins', requireAdmin, (req, res) => {
  const { goldenCoins } = req.body as { goldenCoins?: number };
  if (goldenCoins === undefined || Number.isNaN(Number(goldenCoins))) {
    res.status(400).json({ error: 'يرجى إدخال رصيد عملات صحيح.' });
    return;
  }
  const updated = adjustCustomerCoinsAdmin(String(req.params.id), Number(goldenCoins));
  if (!updated) {
    res.status(404).json({ error: 'العميل غير موجود.' });
    return;
  }
  res.json({ customer: updated });
});

function resolveSiteOrigin(req: Request): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) return envUrl;
  const proto = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim() || req.protocol || 'https';
  const host = req.headers['x-forwarded-host']?.toString().split(',')[0]?.trim() || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function escapeXml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

app.get('/robots.txt', (req, res) => {
  const origin = resolveSiteOrigin(req);
  res.type('text/plain; charset=utf-8').send(
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const origin = resolveSiteOrigin(req);
  const settings = getPublicSettings();
  const products = getPublishedProducts().map((p) => stripPrivateProductFields(p));
  const nowIso = new Date().toISOString();

  const resolveMediaUrl = (u?: string): string | null => {
    if (!u) return null;
    const trimmed = u.trim();
    if (!trimmed || trimmed.startsWith('data:')) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
    return `${origin}/${trimmed}`;
  };

  const heroImg = resolveMediaUrl(settings.heroImageUrl);
  const productUrls = products
    .map((p) => {
      const loc = `${origin}/?product=${encodeURIComponent(p.id)}`;
      const lastmod = p.seoLastUpdated || p.createdAt || nowIso;
      const imageTags = (p.images || [])
        .map(resolveMediaUrl)
        .filter((u): u is string => Boolean(u))
        .slice(0, 5)
        .map(
          (imgUrl) =>
            `    <image:image>\n      <image:loc>${escapeXml(imgUrl)}</image:loc>\n      <image:title>${escapeXml(p.name)}</image:title>\n    </image:image>`
        )
        .join('\n');
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n${imageTags ? `${imageTags}\n` : ''}  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${escapeXml(origin)}/</loc>
    <lastmod>${escapeXml(nowIso)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>${heroImg ? `\n    <image:image>\n      <image:loc>${escapeXml(heroImg)}</image:loc>\n      <image:title>${escapeXml(settings.storeName)}</image:title>\n    </image:image>` : ''}
  </url>
${productUrls}
</urlset>`;

  res.type('application/xml; charset=utf-8').send(xml);
});

app.get('/api/seo/schema', (req, res) => {
  const origin = resolveSiteOrigin(req);
  const settings = getPublicSettings();
  const products = getPublishedProducts().map((p) => stripPrivateProductFields(p));
  const storeKeywords = parseSeoKeywordsList(settings.seoKeywords);
  res.json({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AutoPartsStore',
        name: settings.storeName,
        url: `${origin}/`,
        description: settings.aboutUsText,
        ...(storeKeywords.length > 0 ? { keywords: storeKeywords.join(', ') } : {}),
        telephone: settings.whatsappNumber,
        email: settings.contactEmail,
        currenciesAccepted: 'SAR',
        areaServed: { '@type': 'Country', name: 'Saudi Arabia' },
        sameAs: [settings.instagramUrl, settings.tiktokUrl].filter(Boolean),
      },
      {
        '@type': 'ItemList',
        name: settings.storeName,
        itemListElement: products.map((p, index) => {
          const cleanImages = (p.images || []).filter(
            (u) => typeof u === 'string' && u.length > 0 && !u.startsWith('data:')
          );
          const itemPayload = p.schemaMarkup
            ? {
                ...p.schemaMarkup,
                ...(cleanImages.length > 0 ? { image: cleanImages } : {}),
              }
            : {
                '@type': 'Product',
                name: p.name,
                sku: p.sku || p.id,
                description: p.seoDescription || p.description,
                keywords: parseSeoKeywordsList(p.seoKeywords).join(', '),
                image: cleanImages,
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
            position: index + 1,
            url: `${origin}/?product=${encodeURIComponent(p.id)}`,
            item: itemPayload,
          };
        }),
      },
    ],
  });
});

setInterval(() => {
  try {
    const settings = getAdminSettings();
    if (settings.seoAutoUpdateEnabled && process.env.GEMINI_API_KEY) {
      refreshPublishedProductsSeo().catch((err) =>
        console.error('Periodic SEO refresh error:', err)
      );
    }
  } catch (err) {
    console.error('Periodic SEO schedule check error:', err);
  }
}, 1000 * 60 * 60 * 6);

// Catch unmatched /api/* routes cleanly as JSON 404 before SPA fallback
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'نقطة النهاية المطلوبة غير موجودة.' });
});

// Global Express JSON error handler (prevents HTML error leaks or crashes on malformed JSON)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof (err as { status?: number })?.status === 'number'
      ? (err as { status: number }).status
      : typeof (err as { statusCode?: number })?.statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;
  console.error('Server middleware error:', err);
  if (status === 429) {
    res.status(429).json({ error: 'تم تجاوز حد الطلبات المؤقت. يرجى المحاولة بعد قليل.' });
    return;
  }
  if (status === 413) {
    res.status(413).json({ error: 'حجم البيانات المرسلة كبير جداً.' });
    return;
  }
  if (status === 400) {
    res.status(400).json({ error: 'صيغة البيانات المرسلة غير صالحة.' });
    return;
  }
  res.status(status).json({ error: 'حدث خطأ داخلي في الخادم.' });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Royal Store server listening on http://0.0.0.0:${PORT}`);
  });
  server.on('error', (err) => {
    console.error('HTTP server error:', err);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Royal Store server:', err);
  process.exit(1);
});
