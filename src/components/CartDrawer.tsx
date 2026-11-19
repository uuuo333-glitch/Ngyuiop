import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Coins,
  Copy,
  CreditCard,
  ExternalLink,
  Landmark,
  MessageCircle,
  Minus,
  Plus,
  ShoppingBag,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CartItem,
  CurrencyCode,
  CustomerProfile,
  Order,
  PublicSettings,
} from '../types';
import {
  formatCurrencyPrice,
  getEffectivePriceSar,
  type StoreLanguage,
} from '../i18n';
import { ResilientImage } from './ResilientImage';
import { ShippingCarriersLogos } from './ShippingCarriersLogos';

interface CartDrawerProps {
  open: boolean;
  items: CartItem[];
  settings: PublicSettings;
  currency?: CurrencyCode;
  lang?: StoreLanguage;
  customer: CustomerProfile | null;
  customerToken: string | null;
  onClose: () => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onCustomerUpdated?: (customer: CustomerProfile) => void;
}

export function CartDrawer({
  open,
  items,
  settings,
  currency = 'SAR',
  lang = 'ar',
  customer,
  customerToken,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onCustomerUpdated,
}: CartDrawerProps) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'paypal' | 'bank' | 'done'>('cart');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalAddress, setNationalAddress] = useState('');
  const [address, setAddress] = useState('');
  const [shippingCompany, setShippingCompany] = useState(
    settings.shippingCarriers?.[0] || 'زاجل (Zajil)'
  );
  const [paypalAccount, setPaypalAccount] = useState('');
  const [bankSenderName, setBankSenderName] = useState('');
  const [bankSenderBank, setBankSenderBank] = useState('');
  const [bankTransferRef, setBankTransferRef] = useState('');
  const [redeemMode, setRedeemMode] = useState<'none' | 'coins' | 'coupon'>('none');
  const [coinsToRedeem, setCoinsToRedeem] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    discountSar: number;
  } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);

  useEffect(() => {
    if (customer) {
      setName((prev) => prev || customer.name);
      setPhone((prev) => prev || customer.phone);
      setNationalAddress((prev) => prev || customer.nationalAddress || '');
      setAddress((prev) => prev || customer.address);
      setBankSenderName((prev) => prev || customer.name);
    }
  }, [customer]);

  if (!open) return null;

  const getItemUnitSar = (p: CartItem['product']) =>
    getEffectivePriceSar(p, settings.priceDisplayMode);
  const subtotalSar = items.reduce(
    (sum, item) => sum + getItemUnitSar(item.product) * item.quantity,
    0
  );
  const coinValueSar = Number(settings.coinValueSar) || 0.1;
  const availableCoins = customer?.goldenCoins ?? 0;
  const unusedCoupons = (customer?.coupons || []).filter((c) => !c.isUsed);
  const matchedCoupon =
    redeemMode === 'coupon' && couponCode.trim()
      ? unusedCoupons.find((c) => c.code.toUpperCase() === couponCode.trim().toUpperCase())
      : undefined;
  const maxUsableCoins = Math.min(availableCoins, Math.floor(subtotalSar / coinValueSar));
  const effectiveCoinsRedeemed =
    customer && settings.loyaltyEnabled !== false && redeemMode === 'coins'
      ? Math.max(0, Math.min(coinsToRedeem, maxUsableCoins))
      : 0;
  const promoDiscountSar = appliedPromo
    ? appliedPromo.discountType === 'percent'
      ? Number(
          Math.min(
            subtotalSar,
            (subtotalSar * Math.min(100, Math.max(0, appliedPromo.discountValue))) / 100
          ).toFixed(2)
        )
      : Number(Math.min(subtotalSar, Math.max(0, appliedPromo.discountValue)).toFixed(2))
    : 0;
  const loyaltyDiscountSar =
    customer && settings.loyaltyEnabled !== false
      ? redeemMode === 'coupon' && matchedCoupon
        ? Math.min(subtotalSar, matchedCoupon.discountSar)
        : Number(Math.min(subtotalSar, effectiveCoinsRedeemed * coinValueSar).toFixed(2))
      : 0;
  const discountSar = appliedPromo ? promoDiscountSar : loyaltyDiscountSar;
  const totalSar = Number(Math.max(0, subtotalSar - discountSar).toFixed(2));
  const estimatedCoinsEarned =
    customer && settings.loyaltyEnabled !== false
      ? Math.floor((totalSar / 100) * (Number(settings.coinsPer100SarPurchase) || 50))
      : 0;
  const totalUsd = Number((totalSar * settings.sarToUsdRate).toFixed(2));
  const rawDigits = settings.whatsappNumber.replace(/\D/g, '');
  const cleanPhone =
    rawDigits.startsWith('05') && rawDigits.length === 10
      ? `966${rawDigits.slice(1)}`
      : rawDigits;

  const rawPaypalMe = (settings.paypalMeUrl || 'https://www.paypal.me/yousefAlmohamad931')
    .trim()
    .replace(/\/+$/, '');
  const normalizedPaypalBase = rawPaypalMe.startsWith('http')
    ? rawPaypalMe
    : `https://www.${rawPaypalMe}`;
  const paypalPaymentUrl = `${normalizedPaypalBase}/${totalUsd}`;

  const buildWhatsappOrderText = (orderId: string, extraNote?: string) => {
    const lines = items.map(
      (i, idx) =>
        `${idx + 1}. ${i.product.name} × ${i.quantity} = ${(getItemUnitSar(i.product) * i.quantity).toLocaleString('ar-SA')} ر.س`
    );
    return [
      `طلب جديد من متجر ${settings.storeName}`,
      `رقم الطلب: ${orderId}`,
      ...(extraNote ? [extraNote] : []),
      `----------------`,
      ...lines,
      `----------------`,
      ...(discountSar > 0
        ? [
            `المجموع الفرعي: ${subtotalSar.toLocaleString('ar-SA')} ريال سعودي`,
            `خصم العملات الذهبية / الكوبون: -${discountSar.toLocaleString('ar-SA')} ريال سعودي`,
          ]
        : []),
      `الإجمالي النهائي: ${totalSar.toLocaleString('ar-SA')} ريال سعودي`,
      `بيانات العميل:`,
      `الاسم: ${name}`,
      `الجوال: ${phone}`,
      ...(nationalAddress.trim() ? [`العنوان الوطني: ${nationalAddress.trim()}`] : []),
      `العنوان: ${address}`,
      ...(shippingCompany.trim() ? [`شركة الشحن المختارة: ${shippingCompany.trim()}`] : []),
    ].join('\n');
  };

  const handleApplyPromoCode = async () => {
    const clean = promoInput.trim().toUpperCase();
    if (clean.length !== 4) {
      setPromoError('يرجى إدخال كود الخصم المكون من 4 خانات.');
      return;
    }
    setPromoBusy(true);
    setPromoError('');
    try {
      const res = await fetch('/api/promo-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean, subtotalSar }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppliedPromo(null);
        setPromoError(data.error || 'كود الخصم غير صحيح.');
        return;
      }
      setAppliedPromo({
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountSar: data.discountSar,
      });
      setRedeemMode('none');
      setCoinsToRedeem(0);
      setCouponCode('');
    } catch {
      setPromoError('تعذر التحقق من كود الخصم.');
    } finally {
      setPromoBusy(false);
    }
  };

  const validateCustomerForm = () => {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setError('يرجى إدخال الاسم الكامل، رقم الجوال، والعنوان لإتمام الطلب.');
      return false;
    }
    setError('');
    return true;
  };

  const submitOrder = async (
    paymentMethod: 'paypal' | 'bank_transfer' | 'whatsapp',
    extra?: { paypalTxId?: string; bankRef?: string }
  ) => {
    setSubmitting(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customerToken) {
        headers.Authorization = `Bearer ${customerToken}`;
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerName: name.trim(),
          customerPhone: phone.trim(),
          nationalAddress: nationalAddress.trim(),
          customerAddress: address.trim(),
          shippingCompany: shippingCompany.trim(),
          items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          paymentMethod,
          paypalTransactionId: extra?.paypalTxId,
          bankTransferRef: extra?.bankRef,
          redeemCoins:
            !appliedPromo && redeemMode === 'coins' ? effectiveCoinsRedeemed : undefined,
          couponCode: appliedPromo
            ? appliedPromo.code
            : redeemMode === 'coupon' && matchedCoupon
              ? matchedCoupon.code
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر حفظ الطلب.');
        return;
      }
      if (data.customer) {
        onCustomerUpdated?.(data.customer as CustomerProfile);
      }
      const savedOrder = data.order as Order;
      setConfirmedOrder(savedOrder);
      if (paymentMethod === 'whatsapp') {
        setWhatsappMessage(buildWhatsappOrderText(savedOrder.id));
      } else if (paymentMethod === 'bank_transfer') {
        setWhatsappMessage(
          buildWhatsappOrderText(
            savedOrder.id,
            `طريقة الدفع: تحويل بنكي (${settings.bankName})${extra?.bankRef ? ` · مرجع الحوالة: ${extra.bankRef}` : ''}`
          )
        );
      } else {
        setWhatsappMessage('');
      }
      setRedeemMode('none');
      setCoinsToRedeem(0);
      setCouponCode('');
      setAppliedPromo(null);
      setPromoInput('');
      setPromoError('');
      onClearCart();
      setStep('done');
    } catch {
      setError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPaypal = () => {
    if (!validateCustomerForm()) return;
    setStep('paypal');
  };

  const handleOpenBankTransfer = () => {
    if (!validateCustomerForm()) return;
    setStep('bank');
  };

  const handleConfirmPaypal = async (e: React.FormEvent) => {
    e.preventDefault();
    const txId = `PP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    await submitOrder('paypal', { paypalTxId: txId });
  };

  const handleConfirmBankTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankSenderName.trim() || !bankSenderBank.trim()) {
      setError('يرجى إدخال الاسم واسم البنك المحوّل منه لإتمام التحويل البنكي.');
      return;
    }
    const combinedBankDetails = [
      `الاسم: ${bankSenderName.trim()}`,
      `البنك: ${bankSenderBank.trim()}`,
      ...(bankTransferRef.trim() ? [`المرجع: ${bankTransferRef.trim()}`] : []),
    ].join(' | ');
    await submitOrder('bank_transfer', { bankRef: combinedBankDetails });
  };

  const handleWhatsappCheckout = async () => {
    if (!validateCustomerForm()) return;
    await submitOrder('whatsapp');
  };

  const resetAndClose = () => {
    setStep('cart');
    setError('');
    setConfirmedOrder(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      onClick={resetAndClose}
    >
      <aside
        className="w-full max-w-md h-full bg-[#0E0E12] border-r border-[#D4AF37]/30 text-[#F5F2EB] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-display text-lg font-bold">
              {step === 'cart' && 'سلة المشتريات'}
              {step === 'checkout' && 'إتمام الطلب'}
              {step === 'paypal' && 'الدفع عبر PayPal'}
              {step === 'bank' && 'الدفع عبر التحويل البنكي'}
              {step === 'done' && 'تأكيد الطلب'}
            </h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="إغلاق السلة"
            className="w-9 h-9 rounded-lg border border-white/10 bg-[#16161B] hover:border-[#D4AF37] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/30 text-red-200 text-xs">
              {error}
            </div>
          )}

          {step === 'cart' && (
            <>
              {items.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <ShoppingBag className="w-10 h-10 text-[#D4AF37]/50 mx-auto" />
                  <div className="text-sm text-[#9E988C]">سلة المشتريات فارغة حالياً</div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {items.map((item) => {
                      const lineTotalSar = getItemUnitSar(item.product) * item.quantity;
                      const formattedLine = formatCurrencyPrice(
                        lineTotalSar,
                        currency,
                        settings.currencyRates,
                        lang
                      );
                      const displayItemName =
                        lang === 'en' ? item.product.nameEn || item.product.name : item.product.name;
                      return (
                      <div
                        key={item.product.id}
                        className="flex gap-3 p-3 rounded-xl border border-white/10 bg-[#141418]"
                      >
                        <div className="w-18 h-18 aspect-square p-1 bg-[#0B0B0F] rounded-lg overflow-hidden border border-white/10 shrink-0">
                          <ResilientImage
                            src={item.product.images[0]}
                            alt={displayItemName}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="text-sm font-medium text-[#F5F2EB] truncate">
                            {displayItemName}
                          </div>
                          <div className="text-xs font-bold text-[#E5C158] tabular-nums">
                            {formattedLine.valueText} {formattedLine.unit}
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-1.5 bg-[#0C0C0F] border border-white/10 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.product.id, -1)}
                                aria-label="تقليل الكمية"
                                className="w-7 h-7 flex items-center justify-center hover:text-[#E5C158] cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center text-xs font-bold tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.product.id, 1)}
                                aria-label="زيادة الكمية"
                                className="w-7 h-7 flex items-center justify-center hover:text-[#E5C158] cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemoveItem(item.product.id)}
                              aria-label="حذف المنتج"
                              className="text-[#9E988C] hover:text-red-400 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>

                  {/* 4-Character Store Promo Discount Code */}
                  <div className="p-3.5 rounded-xl border border-[#D4AF37]/30 bg-[#121216] space-y-2.5 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-[#E5C158]">
                      <Ticket className="w-4 h-4 text-[#D4AF37]" />
                      <span>كود الخصم (4 خانات)</span>
                    </div>
                    {appliedPromo ? (
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-emerald-200">
                        <div>
                          تم تفعيل الكود <span className="font-bold">{appliedPromo.code}</span> (خصم{' '}
                          {promoDiscountSar.toLocaleString('ar-SA')} ر.س)
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedPromo(null);
                            setPromoInput('');
                            setPromoError('');
                          }}
                          className="text-[11px] text-red-300 hover:text-red-200 font-bold cursor-pointer"
                        >
                          إزالة
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            dir="ltr"
                            maxLength={4}
                            value={promoInput}
                            onChange={(e) => {
                              setPromoInput(e.target.value.toUpperCase().slice(0, 4));
                              setPromoError('');
                            }}
                            placeholder="مثال: TAJ5"
                            className="flex-1 h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-xs font-bold text-center tracking-widest uppercase focus:outline-none focus:border-[#D4AF37]"
                          />
                          <button
                            type="button"
                            disabled={promoBusy}
                            onClick={handleApplyPromoCode}
                            className="h-9 px-4 rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:brightness-110 disabled:opacity-50 cursor-pointer shrink-0"
                          >
                            {promoBusy ? 'جاري...' : 'تطبيق'}
                          </button>
                        </div>
                        {promoError && (
                          <div className="text-[11px] text-red-300">{promoError}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Golden Coins Instant Discount & Coupons */}
                  {settings.loyaltyEnabled !== false && (
                    <div className="p-3.5 rounded-xl border border-[#D4AF37]/35 bg-[#14120D] space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-[#F5E1A4]">
                          <Coins className="w-4 h-4 text-[#D4AF37]" />
                          <span>العملات الذهبية وكوبونات الخصم</span>
                        </div>
                        {customer && (
                          <span className="text-[#E5C158] tabular-nums">
                            رصيدك: {availableCoins.toLocaleString('ar-SA')} عملة
                          </span>
                        )}
                      </div>

                      {!customer ? (
                        <div className="text-[11px] text-[#C5BFB2]">
                          سجّل دخولك في «حساب العميل» لكسب عملات ذهبية تلقائياً مع كل طلب واستبدالها بخصم فوري بالريال السعودي.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setRedeemMode('coins');
                                setCoinsToRedeem(maxUsableCoins);
                              }}
                              disabled={availableCoins <= 0}
                              className={`flex-1 h-8 px-2 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-45 ${
                                redeemMode === 'coins'
                                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                                  : 'border-white/15 bg-[#16161B] text-[#E5C158]'
                              }`}
                            >
                              استبدال العملات بخصم
                            </button>
                            <button
                              type="button"
                              onClick={() => setRedeemMode('coupon')}
                              className={`flex-1 h-8 px-2 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                                redeemMode === 'coupon'
                                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                                  : 'border-white/15 bg-[#16161B] text-[#E5C158]'
                              }`}
                            >
                              استخدام كوبون خصم
                            </button>
                            {redeemMode !== 'none' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRedeemMode('none');
                                  setCoinsToRedeem(0);
                                  setCouponCode('');
                                }}
                                className="h-8 px-2 rounded-lg border border-white/15 text-[11px] text-[#9E988C] hover:text-white cursor-pointer"
                              >
                                إلغاء
                              </button>
                            )}
                          </div>

                          {redeemMode === 'coins' && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-[#C5BFB2]">
                                <span>عدد العملات للاستبدال (الحد الأقصى {maxUsableCoins}):</span>
                                <span className="text-emerald-300 font-bold tabular-nums">
                                  خصم {discountSar.toLocaleString('ar-SA')} ر.س
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={Math.max(0, maxUsableCoins)}
                                value={effectiveCoinsRedeemed}
                                onChange={(e) => setCoinsToRedeem(Number(e.target.value))}
                                className="w-full accent-[#D4AF37]"
                              />
                            </div>
                          )}

                          {redeemMode === 'coupon' && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5">
                                <Ticket className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={couponCode}
                                  onChange={(e) => setCouponCode(e.target.value)}
                                  placeholder="أدخل كود الكوبون مثل TAJ-..."
                                  className="flex-1 h-8 px-2.5 rounded-lg bg-[#16161B] border border-white/15 text-xs focus:outline-none focus:border-[#D4AF37]"
                                />
                              </div>
                              {unusedCoupons.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {unusedCoupons.map((c) => (
                                    <button
                                      key={c.code}
                                      type="button"
                                      onClick={() => setCouponCode(c.code)}
                                      className={`px-2 py-1 rounded-md border text-[10px] font-bold cursor-pointer ${
                                        couponCode.toUpperCase() === c.code.toUpperCase()
                                          ? 'border-[#D4AF37] bg-[#D4AF37] text-[#09090B]'
                                          : 'border-[#D4AF37]/40 bg-[#19160E] text-[#F5E1A4]'
                                      }`}
                                    >
                                      {c.code} ({c.discountSar} ر.س)
                                    </button>
                                  ))}
                                </div>
                              )}
                              {couponCode.trim() && !matchedCoupon && (
                                <div className="text-[11px] text-amber-300">
                                  الكوبون غير موجود ضمن كوبوناتك المتاحة.
                                </div>
                              )}
                            </div>
                          )}

                          {estimatedCoinsEarned > 0 && (
                            <div className="text-[11px] text-emerald-300">
                              ستكسب +{estimatedCoinsEarned.toLocaleString('ar-SA')} عملة ذهبية عند إتمام الطلب!
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-[#D4AF37]/25 bg-[#14120E] space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#C5BFB2]">عدد المنتجات:</span>
                  <span className="font-bold tabular-nums">
                    {items.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                </div>
                {discountSar > 0 && (
                  <div className="flex justify-between text-emerald-300">
                    <span>خصم العملات الذهبية / الكوبون:</span>
                    <span className="font-bold tabular-nums">
                      -{discountSar.toLocaleString('ar-SA')} ر.س
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#E5C158]">
                  <span>المجموع النهائي:</span>
                  <span className="tabular-nums">
                    {totalSar.toLocaleString('ar-SA')} ر.س (≈ ${totalUsd})
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">الاسم الكامل</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="أدخل اسمك الكامل"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-[#F5F2EB] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">رقم الجوال</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05XXXXXXXX"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-[#F5F2EB] text-right focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">العنوان الوطني</label>
                  <input
                    type="text"
                    value={nationalAddress}
                    onChange={(e) => setNationalAddress(e.target.value)}
                    placeholder="مثال: RRRD2929 أو الرمز البريدي والحي"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-[#F5F2EB] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">العنوان التفصيلي</label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="المدينة، الحي، الشارع، ورقم المبنى"
                    className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-[#F5F2EB] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <ShippingCarriersLogos
                  settings={settings}
                  interactive
                  selectedCarrier={shippingCompany}
                  onSelectCarrier={setShippingCompany}
                />
              </div>

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleOpenPaypal}
                  className="w-full h-11 px-4 rounded-xl bg-[#0070BA] hover:bg-[#005EA6] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>الدفع عبر PayPal (${totalUsd} USD)</span>
                </button>

                {settings.bankTransferEnabled !== false && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleOpenBankTransfer}
                    className="w-full h-11 px-4 rounded-xl border border-[#D4AF37]/50 bg-[#171510] hover:border-[#D4AF37] text-[#E5C158] text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Landmark className="w-4 h-4" />
                    <span>التحويل البنكي ({totalSar.toLocaleString('ar-SA')} ر.س)</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleWhatsappCheckout}
                  className="w-full h-11 px-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-200 text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>إتمام الطلب وإرساله عبر واتساب</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="w-full py-2 text-xs text-[#9E988C] hover:text-[#F5F2EB] cursor-pointer"
                >
                  العودة لتعديل السلة
                </button>
              </div>
            </div>
          )}

          {step === 'paypal' && (
            <form onSubmit={handleConfirmPaypal} className="space-y-4">
              <div className="p-4 rounded-xl border border-[#0070BA]/40 bg-[#0A1624] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">PayPal.me الدفع المباشر</span>
                  <span className="text-xs text-sky-300" dir="ltr">
                    {normalizedPaypalBase.replace(/^https?:\/\/(www\.)?/, '')}
                  </span>
                </div>
                <div className="text-xs text-sky-200/80">
                  المبلغ المستحق بالريال السعودي:{' '}
                  <strong className="tabular-nums">{totalSar.toLocaleString('ar-SA')} ر.س</strong>
                </div>
                <div className="text-lg font-bold text-white tabular-nums">
                  المبلغ المطلوب تحويله: ${totalUsd} USD
                </div>
                <a
                  href={paypalPaymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-[#0070BA] hover:bg-[#005EA6] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>افتح رابط الدفع PayPal.me (${totalUsd})</span>
                </a>
              </div>

              <div>
                <label className="block text-xs text-[#C5BFB2] mb-1">
                  البريد الإلكتروني لحساب PayPal أو رقم مرجع التحويل بعد الدفع
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={paypalAccount}
                  onChange={(e) => setPaypalAccount(e.target.value)}
                  placeholder="buyer@example.com أو رقم العملية"
                  className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-[#F5F2EB] text-right focus:outline-none focus:border-[#0070BA]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-[#FFC439] hover:bg-[#F5B82E] text-[#09090B] font-bold text-sm transition-colors cursor-pointer"
              >
                {submitting ? 'جاري تسجيل الطلب...' : `تأكيد إتمام الدفع عبر PayPal ($${totalUsd})`}
              </button>

              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="w-full py-2 text-xs text-[#9E988C] hover:text-[#F5F2EB] cursor-pointer"
              >
                رجوع لاختيار وسيلة دفع أخرى
              </button>
            </form>
          )}

          {step === 'bank' && (
            <form onSubmit={handleConfirmBankTransfer} className="space-y-4">
              <div className="p-4 rounded-xl border border-[#D4AF37]/40 bg-[#14120E] space-y-3 text-xs">
                <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
                  <Landmark className="w-4 h-4" />
                  <span>بيانات الحساب البنكي للتحويل</span>
                </div>

                <div className="space-y-1.5 border-t border-white/10 pt-2.5">
                  <div className="flex justify-between">
                    <span className="text-[#9E988C]">اسم البنك:</span>
                    <span className="font-bold text-[#F5F2EB]">{settings.bankName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9E988C]">اسم صاحب الحساب:</span>
                    <span className="font-bold text-[#F5F2EB]">{settings.bankAccountHolder}</span>
                  </div>
                  {settings.bankAccountNumber && (
                    <div className="flex justify-between">
                      <span className="text-[#9E988C]">رقم الحساب:</span>
                      <span className="font-bold text-[#F5F2EB] tabular-nums" dir="ltr">
                        {settings.bankAccountNumber}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1">
                    <span className="text-[#9E988C]">المبلغ المطلوب:</span>
                    <span className="font-bold text-[#E5C158] text-sm tabular-nums">
                      {totalSar.toLocaleString('ar-SA')} ر.س
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#09090B] border border-white/10 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-[#F5F2EB] tabular-nums truncate" dir="ltr">
                    {settings.bankIban}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(settings.bankIban || '');
                      setCopiedIban(true);
                      setTimeout(() => setCopiedIban(false), 1800);
                    }}
                    className="px-2.5 py-1 rounded-md border border-[#D4AF37]/40 bg-[#171510] text-[11px] text-[#E5C158] shrink-0 cursor-pointer"
                  >
                    {copiedIban ? 'تم النسخ' : 'نسخ الآيبان'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#C5BFB2] mb-1">
                      الاسم (اسم المحوّل)
                    </label>
                    <input
                      type="text"
                      required
                      value={bankSenderName}
                      onChange={(e) => setBankSenderName(e.target.value)}
                      placeholder="الاسم الكامل لصاحب الحوالة"
                      className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-[#F5F2EB] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#C5BFB2] mb-1">
                      البنك (البنك المحوّل منه)
                    </label>
                    <input
                      type="text"
                      required
                      value={bankSenderBank}
                      onChange={(e) => setBankSenderBank(e.target.value)}
                      placeholder="مثال: الراجحي، الأهلي، الإنماء..."
                      className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-[#F5F2EB] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#C5BFB2] mb-1">
                    رقم مرجع الحوالة أو آخر 4 أرقام (اختياري)
                  </label>
                  <input
                    type="text"
                    value={bankTransferRef}
                    onChange={(e) => setBankTransferRef(e.target.value)}
                    placeholder="رقم العملية المرجعي إن وجد"
                    className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm text-[#F5F2EB] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-gold-wave w-full h-11 rounded-xl text-sm font-bold cursor-pointer"
              >
                {submitting ? 'جاري تسجيل الحوالة...' : 'تأكيد التحويل البنكي وإتمام الطلب'}
              </button>

              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="w-full py-2 text-xs text-[#9E988C] hover:text-[#F5F2EB] cursor-pointer"
              >
                رجوع لاختيار وسيلة دفع أخرى
              </button>
            </form>
          )}

          {step === 'done' && confirmedOrder && (
            <div className="space-y-4 py-4">
              <div className="p-5 rounded-2xl border border-[#D4AF37]/40 bg-[#14120E] text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <div className="font-display text-lg font-bold text-[#F5F2EB]">
                  تم تسجيل طلبك بنجاح
                </div>
                <div className="text-xs text-[#E5C158] tabular-nums">
                  رقم الطلب: {confirmedOrder.id}
                </div>
                {confirmedOrder.paypalTransactionId && (
                  <div className="text-xs text-sky-300 tabular-nums">
                    رقم عملية PayPal: {confirmedOrder.paypalTransactionId}
                  </div>
                )}
                {confirmedOrder.bankTransferRef && (
                  <div className="text-xs text-amber-300">
                    مرجع التحويل البنكي: {confirmedOrder.bankTransferRef}
                  </div>
                )}
                {confirmedOrder.discountSar && confirmedOrder.discountSar > 0 && (
                  <div className="text-xs text-emerald-300 tabular-nums">
                    خصم العملات الذهبية / الكوبون: -{confirmedOrder.discountSar.toLocaleString('ar-SA')} ر.س
                  </div>
                )}
                <div className="text-sm font-bold text-[#F5F2EB] pt-1 tabular-nums">
                  الإجمالي: {confirmedOrder.totalSar.toLocaleString('ar-SA')} ر.س
                </div>
                {confirmedOrder.coinsEarned && confirmedOrder.coinsEarned > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-xs font-bold text-[#F5E1A4] tabular-nums">
                    <Coins className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>ربحت +{confirmedOrder.coinsEarned.toLocaleString('ar-SA')} عملة ذهبية!</span>
                  </div>
                )}
              </div>

              {whatsappMessage && (
                <div className="space-y-3">
                  <div className="text-xs text-[#C5BFB2]">
                    {confirmedOrder.paymentMethod === 'bank_transfer'
                      ? 'يمكنك إرسال صورة إيصال التحويل عبر واتساب لتأكيد الطلب فوراً:'
                      : 'اضغط أدناه لفتح واتساب وإرسال تفاصيل طلبك الجاهزة مباشرة:'}
                  </div>
                  <pre className="p-3 rounded-xl bg-[#141418] border border-white/10 text-xs text-[#C5BFB2] whitespace-pre-wrap leading-relaxed font-sans">
                    {whatsappMessage}
                  </pre>
                  <div className="flex gap-2">
                    <a
                      href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>
                        {confirmedOrder.paymentMethod === 'bank_transfer'
                          ? 'إرسال إيصال التحويل عبر واتساب'
                          : 'إرسال الطلب عبر واتساب الآن'}
                      </span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(whatsappMessage);
                        setCopiedMsg(true);
                        setTimeout(() => setCopiedMsg(false), 2000);
                      }}
                      className="h-11 px-3 rounded-xl border border-white/15 bg-[#16161B] text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-4 h-4 text-[#D4AF37]" />
                      <span>{copiedMsg ? 'تم النسخ' : 'نسخ'}</span>
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={resetAndClose}
                className="btn-gold-wave w-full h-11 rounded-xl text-sm cursor-pointer"
              >
                متابعة التسوق
              </button>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        {step === 'cart' && items.length > 0 && (
          <div className="p-5 border-t border-white/10 bg-[#121216] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#C5BFB2]">
                {discountSar > 0 ? 'الإجمالي بعد الخصم' : 'الإجمالي'}
              </span>
              <div className="text-left tabular-nums">
                {discountSar > 0 && (
                  <div className="text-[11px] text-emerald-300">
                    تم خصم {discountSar.toLocaleString('ar-SA')} ر.س
                  </div>
                )}
                <div className="text-lg font-bold text-[#E5C158]">
                  {totalSar.toLocaleString('ar-SA')} ر.س
                </div>
                <div className="text-xs text-[#9E988C]">يعادل ≈ ${totalUsd} USD</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep('checkout')}
              className="btn-gold-wave w-full h-11 rounded-xl text-sm cursor-pointer"
            >
              الانتقال لإتمام الطلب
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
