import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CreditCard, Loader2 } from 'lucide-react';

interface PayPalOrderActions {
  order: {
    create: (payload: {
      intent: 'CAPTURE';
      purchase_units: {
        amount: {
          currency_code: string;
          value: string;
        };
        description?: string;
      }[];
    }) => Promise<string>;
    capture: () => Promise<{
      id?: string;
      status?: string;
      payer?: {
        email_address?: string;
      };
    }>;
  };
}

interface PayPalNamespace {
  Buttons: (config: {
    style?: {
      layout?: 'vertical' | 'horizontal';
      color?: 'gold' | 'blue' | 'silver' | 'white' | 'black';
      shape?: 'rect' | 'pill';
      label?: 'paypal' | 'checkout' | 'buynow' | 'pay';
      height?: number;
    };
    createOrder: (_data: unknown, actions: PayPalOrderActions) => Promise<string>;
    onApprove: (_data: { orderID?: string }, actions: PayPalOrderActions) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }) => {
    render: (container: HTMLElement) => Promise<void>;
    close?: () => Promise<void>;
  };
}

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

interface PayPalSmartButtonsProps {
  clientId: string;
  amountUsd: number;
  description: string;
  cardEnabled?: boolean;
  onSuccess: (details: { transactionId: string; payerEmail?: string }) => void;
  onError?: (message: string) => void;
}

export function PayPalSmartButtons({
  clientId,
  amountUsd,
  description,
  cardEnabled = true,
  onSuccess,
  onError,
}: PayPalSmartButtonsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');

  const amountRef = useRef(amountUsd);
  const descRef = useRef(description);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    amountRef.current = amountUsd;
    descRef.current = description;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [amountUsd, description, onSuccess, onError]);

  useEffect(() => {
    const cleanClientId = clientId.trim();
    if (!cleanClientId) {
      setStatus('error');
      setErrorText('رمز الربط PayPal Client ID غير متوفر.');
      return;
    }

    let cancelled = false;
    let renderedInstance: { close?: () => Promise<void> } | null = null;
    const sdkKey = `${cleanClientId}|${cardEnabled ? 'card_on' : 'card_off'}`;

    const mountButtons = async () => {
      if (cancelled || !containerRef.current || !window.paypal?.Buttons) return;
      containerRef.current.innerHTML = '';
      try {
        const instance = window.paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'paypal',
            height: 44,
          },
          createOrder: (_data, actions) => {
            const safeVal = Math.max(0.5, Number(amountRef.current) || 0.5).toFixed(2);
            return actions.order.create({
              intent: 'CAPTURE',
              purchase_units: [
                {
                  amount: {
                    currency_code: 'USD',
                    value: safeVal,
                  },
                  description: descRef.current.slice(0, 120),
                },
              ],
            });
          },
          onApprove: async (data, actions) => {
            try {
              const details = await actions.order.capture();
              const txId = details.id || data.orderID || `PP-${Date.now()}`;
              onSuccessRef.current({
                transactionId: txId,
                payerEmail: details.payer?.email_address,
              });
            } catch {
              const msg = 'تعذر تأكيد التقاط الدفع من PayPal. يرجى المحاولة مرة أخرى.';
              setErrorText(msg);
              onErrorRef.current?.(msg);
            }
          },
          onCancel: () => {
            onErrorRef.current?.('تم إلغاء نافذة الدفع قبل إتمام العملية.');
          },
          onError: () => {
            const msg =
              'تعذر تشغيل بوابة PayPal بهذا الرمز. تأكد من صحة PayPal Client ID في لوحة تحكم المالك.';
            setErrorText(msg);
            setStatus('error');
            onErrorRef.current?.(msg);
          },
        });
        renderedInstance = instance;
        await instance.render(containerRef.current);
        if (!cancelled) {
          setStatus('ready');
          setErrorText('');
        }
      } catch {
        if (!cancelled) {
          const msg =
            'تعذر تحميل أزرار PayPal والبطاقات الائتمانية. تحقق من صحة PayPal Client ID.';
          setStatus('error');
          setErrorText(msg);
          onErrorRef.current?.(msg);
        }
      }
    };

    setStatus('loading');
    setErrorText('');

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-paypal-sdk-script="true"]'
    );
    if (existingScript && existingScript.dataset.sdkKey === sdkKey && window.paypal?.Buttons) {
      void mountButtons();
      return () => {
        cancelled = true;
        void renderedInstance?.close?.();
      };
    }

    if (existingScript) {
      existingScript.remove();
      try {
        delete window.paypal;
      } catch {
        window.paypal = undefined;
      }
    }

    const fundingParam = cardEnabled ? '&enable-funding=card' : '&disable-funding=card';
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      cleanClientId
    )}&currency=USD&intent=capture&components=buttons${fundingParam}`;
    script.async = true;
    script.dataset.paypalSdkScript = 'true';
    script.dataset.sdkKey = sdkKey;

    script.onload = () => {
      if (!cancelled) {
        void mountButtons();
      }
    };
    script.onerror = () => {
      if (!cancelled) {
        const msg =
          'فشل الاتصال بخادم PayPal أو أن رمز PayPal Client ID غير صالح.';
        setStatus('error');
        setErrorText(msg);
        onErrorRef.current?.(msg);
      }
    };

    document.head.appendChild(script);

    return () => {
      cancelled = true;
      void renderedInstance?.close?.();
    };
  }, [clientId, cardEnabled]);

  return (
    <div className="space-y-2.5">
      {status === 'loading' && (
        <div className="p-4 rounded-xl border border-sky-500/30 bg-[#0A1624] flex items-center justify-center gap-2 text-xs text-sky-200">
          <Loader2 className="w-4 h-4 animate-spin text-[#38BDF8]" />
          <span>جاري تحميل أزرار الدفع الآمنة من PayPal والبطاقات الائتمانية...</span>
        </div>
      )}

      {status === 'error' && errorText && (
        <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/30 flex items-start gap-2 text-xs text-amber-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
          <span>{errorText}</span>
        </div>
      )}

      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden bg-white/95 p-2.5 min-h-[54px]"
        style={{ display: status === 'error' ? 'none' : 'block' }}
      />

      {status === 'ready' && (
        <div className="flex items-center justify-center gap-2 text-[11px] text-[#9E988C]">
          <CreditCard className="w-3.5 h-3.5 text-[#38BDF8]" />
          <span>
            {cardEnabled
              ? 'يدعم الدفع بحساب PayPal أو البطاقات الائتمانية (Visa / Mastercard)'
              : 'يدعم الدفع المباشر عبر حساب PayPal'}
          </span>
        </div>
      )}
    </div>
  );
}
