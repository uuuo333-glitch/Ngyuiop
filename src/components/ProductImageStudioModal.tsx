import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Image as ImageIcon, RotateCcw, Sparkles, Upload, Wand2, X } from 'lucide-react';

interface ProductImageStudioModalProps {
  open: boolean;
  adminToken: string;
  imageUrl: string;
  productName: string;
  productCategory: string;
  priceSar?: number;
  onClose: () => void;
  onSaved: (newUrl: string) => void;
}

export function ProductImageStudioModal({
  open,
  adminToken,
  imageUrl,
  productName,
  productCategory,
  priceSar,
  onClose,
  onSaved,
}: ProductImageStudioModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [brightness, setBrightness] = useState(106);
  const [contrast, setContrast] = useState(114);
  const [saturate, setSaturate] = useState(112);
  const [goldWarmth, setGoldWarmth] = useState(14);
  const [vignette, setVignette] = useState(32);
  const [goldFrame, setGoldFrame] = useState(true);
  const [showCallout, setShowCallout] = useState(true);
  const [calloutText, setCalloutText] = useState('جودة مصنعية · ضمان الفحص الدوري');
  const [showPriceTag, setShowPriceTag] = useState(false);

  const [saving, setSaving] = useState(false);
  const [generatingBadge, setGeneratingBadge] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setLoadError('');

    let cancelled = false;
    const loadSource = async () => {
      try {
        let finalSrc = imageUrl || '/src/assets/images/product_gasoline_cat_1794821493329.jpg';
        if (/^https?:\/\//i.test(finalSrc) && !finalSrc.startsWith(window.location.origin)) {
          const resp = await fetch(
            `/api/admin/proxy-image?url=${encodeURIComponent(finalSrc)}`,
            {
              headers: {
                Authorization: `Bearer ${adminToken}`,
                'X-Admin-Token': adminToken,
              },
              credentials: 'same-origin',
            }
          );
          if (!resp.ok) {
            throw new Error('تعذر جلب الصورة من الرابط الخارجي. يمكنك رفع صورة بديلة من جهازك.');
          }
          const blob = await resp.blob();
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = URL.createObjectURL(blob);
          finalSrc = objectUrlRef.current;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (cancelled) return;
          imgRef.current = img;
          setLoaded(true);
        };
        img.onerror = () => {
          if (cancelled) return;
          setLoadError('تعذر عرض الصورة للتحرير. جرب رفع صورة من جهازك.');
        };
        img.src = finalSrc;
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'تعذر تحميل الصورة للتحرير.'
          );
        }
      }
    };

    loadSource();
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [open, imageUrl, adminToken]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !loaded) return;

    const size = 900;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Studio deep black backdrop
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, size, size);

    // Subtle radial spotlight behind product
    const spot = ctx.createRadialGradient(size / 2, size / 2, 60, size / 2, size / 2, size * 0.65);
    spot.addColorStop(0, 'rgba(212, 175, 55, 0.16)');
    spot.addColorStop(1, 'rgba(9, 9, 11, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, size, size);

    // Draw image cover-fitted inside studio area
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const dx = (size - drawW) / 2;
    const dy = (size - drawH) / 2;

    ctx.save();
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;
    ctx.drawImage(img, dx, dy, drawW, drawH);
    ctx.restore();

    // Warm golden ambient sheen
    if (goldWarmth > 0) {
      ctx.save();
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, `rgba(212, 175, 55, ${(goldWarmth / 100) * 0.35})`);
      grad.addColorStop(0.5, 'rgba(212, 175, 55, 0.02)');
      grad.addColorStop(1, `rgba(180, 130, 30, ${(goldWarmth / 100) * 0.28})`);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }

    // Studio vignette
    if (vignette > 0) {
      const vig = ctx.createRadialGradient(
        size / 2,
        size / 2,
        size * 0.25,
        size / 2,
        size / 2,
        size * 0.72
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, vignette / 100)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, size, size);
    }

    // Luxury double golden frame
    if (goldFrame) {
      ctx.save();
      const frameGrad = ctx.createLinearGradient(0, 0, size, size);
      frameGrad.addColorStop(0, '#F7E7B4');
      frameGrad.addColorStop(0.5, '#D4AF37');
      frameGrad.addColorStop(1, '#9E7B1E');
      ctx.strokeStyle = frameGrad;
      ctx.lineWidth = 10;
      ctx.strokeRect(18, 18, size - 36, size - 36);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(245, 225, 164, 0.45)';
      ctx.strokeRect(32, 32, size - 64, size - 64);
      ctx.restore();
    }

    // Top-right golden promotional badge
    if (showCallout && calloutText.trim()) {
      ctx.save();
      ctx.font = '700 28px "Tajawal", "Cairo", sans-serif';
      const txt = calloutText.trim().slice(0, 42);
      const metrics = ctx.measureText(txt);
      const padX = 28;
      const boxW = Math.min(size - 96, metrics.width + padX * 2);
      const boxH = 56;
      const bx = size - 48 - boxW;
      const by = 48;

      ctx.fillStyle = 'rgba(13, 13, 16, 0.86)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 14);
      ctx.fill();

      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#F5E1A4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx + boxW / 2, by + boxH / 2 + 2, boxW - 24);
      ctx.restore();
    }

    // Optional bottom-left SAR Price pill
    if (showPriceTag && priceSar && priceSar > 0) {
      ctx.save();
      const priceLabel = `${priceSar.toLocaleString('ar-SA')} ر.س`;
      ctx.font = '800 34px "Tajawal", "Cairo", sans-serif';
      const metrics = ctx.measureText(priceLabel);
      const boxW = metrics.width + 52;
      const boxH = 62;
      const bx = 48;
      const by = size - 48 - boxH;

      const bgGrad = ctx.createLinearGradient(bx, by, bx + boxW, by + boxH);
      bgGrad.addColorStop(0, '#F5E1A4');
      bgGrad.addColorStop(0.5, '#D4AF37');
      bgGrad.addColorStop(1, '#B38728');
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 16);
      ctx.fill();

      ctx.fillStyle = '#09090B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceLabel, bx + boxW / 2, by + boxH / 2 + 2);
      ctx.restore();
    }
  }, [
    loaded,
    brightness,
    contrast,
    saturate,
    goldWarmth,
    vignette,
    goldFrame,
    showCallout,
    calloutText,
    showPriceTag,
    priceSar,
  ]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  if (!open) return null;

  const applyPreset = (preset: 'royal' | 'hd' | 'promo' | 'reset') => {
    if (preset === 'royal') {
      setBrightness(106);
      setContrast(118);
      setSaturate(114);
      setGoldWarmth(22);
      setVignette(38);
      setGoldFrame(true);
      setShowCallout(true);
    } else if (preset === 'hd') {
      setBrightness(110);
      setContrast(122);
      setSaturate(116);
      setGoldWarmth(6);
      setVignette(14);
      setGoldFrame(false);
    } else if (preset === 'promo') {
      setBrightness(105);
      setContrast(116);
      setSaturate(118);
      setGoldWarmth(18);
      setVignette(36);
      setGoldFrame(true);
      setShowCallout(true);
      setShowPriceTag(true);
    } else {
      setBrightness(100);
      setContrast(100);
      setSaturate(100);
      setGoldWarmth(0);
      setVignette(0);
      setGoldFrame(false);
      setShowCallout(false);
      setShowPriceTag(false);
    }
  };

  const handleLocalFilePick = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        setLoadError('');
        setLoaded(true);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleAiBadgeSuggestion = async () => {
    setGeneratingBadge(true);
    try {
      const res = await fetch('/api/admin/ai/enhance-copy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          mode: 'product',
          name: productName,
          category: productCategory,
          priceSar,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result?.badgeText) {
          setCalloutText(data.result.badgeText);
          setShowCallout(true);
        }
      }
    } finally {
      setGeneratingBadge(false);
    }
  };

  const handleSaveEditedImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const dataBase64 = canvas.toDataURL('image/jpeg', 0.92);
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          filename: `studio_${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          dataBase64,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        onSaved(data.url as string);
        onClose();
      } else {
        setLoadError(data.error || 'تعذر حفظ الصورة المعدلة.');
      }
    } catch {
      setLoadError('حدث خطأ أثناء حفظ الصورة المعدلة.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl rounded-2xl border border-[#D4AF37]/40 bg-[#111115] text-[#F5F2EB] p-5 sm:p-6 space-y-5 my-auto shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <ImageIcon className="w-5 h-5 text-[#E5C158]" />
            <div>
              <h3 className="font-display text-lg font-bold text-[#E5C158]">
                استوديو تعديل وتحسين صورة المنتج
              </h3>
              <p className="text-xs text-[#9E988C] truncate max-w-md">{productName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-white/15 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Canvas Preview */}
          <div className="lg:col-span-6 space-y-3">
            <div className="aspect-square rounded-2xl border border-[#D4AF37]/30 bg-[#09090B] overflow-hidden flex items-center justify-center">
              {loadError ? (
                <div className="p-6 text-center space-y-3 text-xs text-amber-300">
                  <div>{loadError}</div>
                  <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#D4AF37]/40 bg-[#171510] text-[#E5C158] cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>اختر صورة من جهازك</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLocalFilePick(f);
                      }}
                    />
                  </label>
                </div>
              ) : (
                <canvas ref={canvasRef} className="w-full h-full object-contain" />
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset('royal')}
                className="px-3 py-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-xs text-[#E5C158] cursor-pointer"
              >
                لمسة ملكية ذهبية
              </button>
              <button
                type="button"
                onClick={() => applyPreset('hd')}
                className="px-3 py-1.5 rounded-lg border border-white/15 bg-[#16161B] text-xs text-[#F5F2EB] cursor-pointer"
              >
                وضوح وإشراق HD
              </button>
              <button
                type="button"
                onClick={() => applyPreset('promo')}
                className="px-3 py-1.5 rounded-lg border border-white/15 bg-[#16161B] text-xs text-[#F5F2EB] cursor-pointer"
              >
                بطاقة عرض مع السعر
              </button>
              <button
                type="button"
                onClick={() => applyPreset('reset')}
                className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-[#9E988C] flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>الأصل</span>
              </button>
            </div>
          </div>

          {/* Studio Adjustments */}
          <div className="lg:col-span-6 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[#C5BFB2] mb-1">
                  <span>السطوع</span>
                  <span className="tabular-nums text-[#E5C158]">{brightness}%</span>
                </div>
                <input
                  type="range"
                  min={75}
                  max={145}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-[#D4AF37]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[#C5BFB2] mb-1">
                  <span>التباين والوضوح</span>
                  <span className="tabular-nums text-[#E5C158]">{contrast}%</span>
                </div>
                <input
                  type="range"
                  min={80}
                  max={150}
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  className="w-full accent-[#D4AF37]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[#C5BFB2] mb-1">
                  <span>حيوية الألوان</span>
                  <span className="tabular-nums text-[#E5C158]">{saturate}%</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={160}
                  value={saturate}
                  onChange={(e) => setSaturate(Number(e.target.value))}
                  className="w-full accent-[#D4AF37]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[#C5BFB2] mb-1">
                  <span>توهج ذهبي</span>
                  <span className="tabular-nums text-[#E5C158]">{goldWarmth}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={goldWarmth}
                  onChange={(e) => setGoldWarmth(Number(e.target.value))}
                  className="w-full accent-[#D4AF37]"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[#C5BFB2] mb-1">
                <span>تركيز الإضاءة (Vignette)</span>
                <span className="tabular-nums text-[#E5C158]">{vignette}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={75}
                value={vignette}
                onChange={(e) => setVignette(Number(e.target.value))}
                className="w-full accent-[#D4AF37]"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-white/10 bg-[#0D0D10] space-y-3">
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={goldFrame}
                    onChange={(e) => setGoldFrame(e.target.checked)}
                  />
                  <span>إطار ذهبي ملكي</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCallout}
                    onChange={(e) => setShowCallout(e.target.checked)}
                  />
                  <span>شارة جودة جذابة</span>
                </label>
                {priceSar && priceSar > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPriceTag}
                      onChange={(e) => setShowPriceTag(e.target.checked)}
                    />
                    <span>إظهار السعر على الصورة</span>
                  </label>
                )}
              </div>

              {showCallout && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={calloutText}
                    onChange={(e) => setCalloutText(e.target.value)}
                    placeholder="اكتب عبارة جذابة قصيرة..."
                    className="flex-1 h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-xs"
                  />
                  <button
                    type="button"
                    disabled={generatingBadge}
                    onClick={handleAiBadgeSuggestion}
                    className="px-3 h-9 rounded-lg border border-[#D4AF37]/40 bg-[#171510] text-[#E5C158] flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>{generatingBadge ? '...' : 'اقتراح AI'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <label className="h-10 px-3.5 rounded-xl border border-white/15 bg-[#16161B] text-xs flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#E5C158]" />
                <span>تبديل بصورة من جهازك</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLocalFilePick(f);
                  }}
                />
              </label>

              <button
                type="button"
                disabled={!loaded || saving}
                onClick={handleSaveEditedImage}
                className="btn-gold-wave h-10 px-6 rounded-xl text-xs sm:text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <Sparkles className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{saving ? 'جاري الحفظ...' : 'حفظ الصورة المعدّلة للمنتج'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
