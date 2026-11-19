import { useState } from 'react';
import { MessageCircle, Upload, Wrench, X } from 'lucide-react';
import type { StoreLanguage } from '../i18n';
import type { PublicSettings } from '../types';

interface CustomFabricationModalProps {
  open: boolean;
  settings: PublicSettings;
  lang: StoreLanguage;
  onClose: () => void;
}

export function CustomFabricationModal({
  open,
  settings,
  lang,
  onClose,
}: CustomFabricationModalProps) {
  const [carMake, setCarMake] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carYear, setCarYear] = useState('');
  const [fuelType, setFuelType] = useState<'ديزل' | 'بنزين'>('بنزين');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [uploadedImageUrl, setUploadedImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const rawDigits = settings.whatsappNumber.replace(/\D/g, '');
  const cleanPhone =
    rawDigits.startsWith('05') && rawDigits.length === 10
      ? `966${rawDigits.slice(1)}`
      : rawDigits;

  const handlePhotoUpload = async (file: File) => {
    if (file.size > 12 * 1024 * 1024) {
      setError(
        lang === 'en' ? 'Image size must be under 12MB.' : 'الحد الأقصى لحجم الصورة 12 ميجابايت.'
      );
      return;
    }
    setUploading(true);
    setError('');
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/upload-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'image/jpeg',
          dataBase64,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'تعذر رفع الصورة.');
        return;
      }
      setUploadedImageUrl(data.url);
    } catch {
      setError(lang === 'en' ? 'Failed to upload image.' : 'تعذر رفع صورة القطعة.');
    } finally {
      setUploading(false);
    }
  };

  const fullImageLink = uploadedImageUrl
    ? uploadedImageUrl.startsWith('http')
      ? uploadedImageUrl
      : `${window.location.origin}${uploadedImageUrl}`
    : '';

  const buildWhatsappHref = () => {
    const lines = [
      `طلب تصنيع خاص لدبة التلوث - ${settings.storeName}`,
      `----------------`,
      `• نوع السيارة: ${carMake || 'غير محدد'}`,
      `• الموديل: ${carModel || 'غير محدد'}`,
      `• سنة الصنع: ${carYear || 'غير محدد'}`,
      `• نوع المحرك: ${fuelType}`,
      ...(customerPhone.trim() ? [`• جوال العميل: ${customerPhone.trim()}`] : []),
      ...(notes.trim() ? [`• ملاحظات إضافية: ${notes.trim()}`] : []),
      ...(fullImageLink ? [`• صورة القطعة القديمة للمطابقة: ${fullImageLink}`] : []),
    ];
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[#D4AF37]/35 bg-[#111115] text-[#F5F2EB] p-6 shadow-2xl space-y-4 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold">
                {lang === 'en' ? 'Custom Fabrication Request' : 'طلب تصنيع خاص'}
              </h2>
              <p className="text-xs text-[#9E988C]">
                {lang === 'en'
                  ? 'Send your engine details & old converter photo directly via WhatsApp'
                  : 'أرسل مواصفات محرك سيارتك مع صورة القطعة القديمة لتقدير المطابقة عبر واتساب'}
              </p>
            </div>
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

        {error && (
          <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/30 text-red-200 text-xs">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[#C5BFB2] mb-1">
              {lang === 'en' ? 'Car Make (Brand)' : 'نوع السيارة (الشركة)'}
            </label>
            <input
              type="text"
              required
              value={carMake}
              onChange={(e) => setCarMake(e.target.value)}
              placeholder={lang === 'en' ? 'e.g. Toyota, Isuzu, GMC' : 'مثال: تويوتا، إيسوزو، فورد'}
              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-[#C5BFB2] mb-1">
              {lang === 'en' ? 'Car Model' : 'الموديل'}
            </label>
            <input
              type="text"
              required
              value={carModel}
              onChange={(e) => setCarModel(e.target.value)}
              placeholder={lang === 'en' ? 'e.g. Hilux, Land Cruiser' : 'مثال: هايلكس، لاندكروزر'}
              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-[#C5BFB2] mb-1">
              {lang === 'en' ? 'Year' : 'سنة الصنع'}
            </label>
            <input
              type="text"
              dir="ltr"
              value={carYear}
              onChange={(e) => setCarYear(e.target.value)}
              placeholder="2024"
              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div>
            <label className="block text-[#C5BFB2] mb-1">
              {lang === 'en' ? 'Engine Fuel Type' : 'نوع المحرك'}
            </label>
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as 'ديزل' | 'بنزين')}
              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="بنزين">{lang === 'en' ? 'Gasoline' : 'بنزين'}</option>
              <option value="ديزل">{lang === 'en' ? 'Diesel (DPF)' : 'ديزل (DPF)'}</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[#C5BFB2] mb-1">
              {lang === 'en' ? 'Your Phone (Optional)' : 'رقم الجوال للتواصل (اختياري)'}
            </label>
            <input
              type="tel"
              dir="ltr"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="05XXXXXXXX"
              className="w-full h-10 px-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[#C5BFB2] mb-1">
              {lang === 'en'
                ? 'Upload Old Converter Photo for Fitment Check'
                : 'رفع صورة لقطعة التلوث القديمة لتقدير مطابقتها'}
            </label>
            <label className="flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-dashed border-[#D4AF37]/50 bg-[#16161B] hover:border-[#D4AF37] text-xs font-bold text-[#E5C158] cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>
                {uploading
                  ? lang === 'en'
                    ? 'Uploading image...'
                    : 'جاري رفع الصورة...'
                  : uploadedImageUrl
                    ? lang === 'en'
                      ? 'Image Uploaded (Click to change)'
                      : 'تم رفع الصورة بنجاح (انقر للتغيير)'
                    : lang === 'en'
                      ? 'Choose JPG / PNG photo from device'
                      : 'اختر صورة القطعة القديمة (JPG / PNG)'}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhotoUpload(f);
                }}
              />
            </label>
            {uploadedImageUrl && (
              <div className="mt-2 flex items-center gap-3 p-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20">
                <img
                  src={uploadedImageUrl}
                  alt="Old converter"
                  className="w-14 h-14 rounded-lg object-contain bg-[#0B0B0F] border border-white/10"
                />
                <span className="text-[11px] text-emerald-300">
                  {lang === 'en'
                    ? 'Photo link attached automatically to your WhatsApp message.'
                    : 'سيتم إرفاق رابط الصورة تلقائياً في رسالة الواتساب.'}
                </span>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[#C5BFB2] mb-1">
              {lang === 'en' ? 'Measurements / Extra Notes' : 'مقاس الماسورة أو ملاحظات إضافية'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                lang === 'en'
                  ? 'Pipe diameter, sensor ports, or chassis number...'
                  : 'مثال: قطر الماسورة، عدد منافذ الحساسات، أو رقم الهيكل...'
              }
              className="w-full p-3 rounded-xl bg-[#16161B] border border-white/15 text-sm focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        </div>

        <a
          href={buildWhatsappHref()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!carMake.trim() || !carModel.trim()) {
              e.preventDefault();
              setError(
                lang === 'en'
                  ? 'Please enter at least the car make and model.'
                  : 'يرجى كتابة نوع السيارة والموديل أولاً.'
              );
            }
          }}
          className="w-full h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          <span>
            {lang === 'en'
              ? 'Send Custom Request via WhatsApp'
              : 'إرسال طلب التصنيع الخاص عبر واتساب'}
          </span>
        </a>
      </div>
    </div>
  );
}
