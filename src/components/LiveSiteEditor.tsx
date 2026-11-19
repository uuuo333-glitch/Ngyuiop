import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Film,
  Globe,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  Megaphone,
  Package,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { PublicProduct, PublicSettings, StoreCategory } from '../types';
import { ResilientImage } from './ResilientImage';

export type LiveEditSection =
  | 'identity'
  | 'marquee'
  | 'hero'
  | 'theme'
  | 'categories'
  | 'about'
  | 'seo';

interface LiveSiteEditorProps {
  open: boolean;
  adminToken: string | null;
  draftSettings: PublicSettings;
  hasUnsavedChanges: boolean;
  activeSection: LiveEditSection | null;
  editingProduct: PublicProduct | null;
  onSelectSection: (section: LiveEditSection | null) => void;
  onCloseProductEditor: () => void;
  onChangeDraft: (next: PublicSettings) => void;
  onSaveSettings: () => Promise<void>;
  onResetDraft: () => void;
  onProductUpdated: () => Promise<void> | void;
  onOpenAdminDashboard: () => void;
  onExitEditMode: () => void;
  savingSettings: boolean;
}

const SECTION_TABS: { id: LiveEditSection; label: string; icon: typeof Pencil }[] = [
  { id: 'identity', label: 'الهوية', icon: Sparkles },
  { id: 'marquee', label: 'الأشرطة', icon: Megaphone },
  { id: 'hero', label: 'الهبوط والصور', icon: ImageIcon },
  { id: 'theme', label: 'الألوان والخلفية', icon: Palette },
  { id: 'categories', label: 'الأقسام', icon: Layers },
  { id: 'about', label: 'من نحن والتواصل', icon: Globe },
  { id: 'seo', label: 'جوجل SEO', icon: Search },
];

export function LiveSiteEditor({
  open,
  adminToken,
  draftSettings,
  hasUnsavedChanges,
  activeSection,
  editingProduct,
  onSelectSection,
  onCloseProductEditor,
  onChangeDraft,
  onSaveSettings,
  onResetDraft,
  onProductUpdated,
  onOpenAdminDashboard,
  onExitEditMode,
  savingSettings,
}: LiveSiteEditorProps) {
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [editorMessage, setEditorMessage] = useState('');
  const [editorError, setEditorError] = useState('');

  // Quick Category creation state
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Quick Product Edit state
  const [prodName, setProdName] = useState('');
  const [prodNameEn, setProdNameEn] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodPriceSar, setProdPriceSar] = useState('');
  const [prodWholesaleSar, setProdWholesaleSar] = useState('');
  const [prodCompareSar, setProdCompareSar] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImage, setProdImage] = useState('');
  const [prodInStock, setProdInStock] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);

  // SEO refresh & copy state
  const [refreshingSeo, setRefreshingSeo] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState('');

  useEffect(() => {
    if (editingProduct) {
      setProdName(editingProduct.name || '');
      setProdNameEn(editingProduct.nameEn || '');
      setProdCategory(editingProduct.category || '');
      setProdPriceSar(String(editingProduct.priceSar ?? 0));
      setProdWholesaleSar(
        editingProduct.wholesalePriceSar ? String(editingProduct.wholesalePriceSar) : ''
      );
      setProdCompareSar(
        editingProduct.compareAtPriceSar ? String(editingProduct.compareAtPriceSar) : ''
      );
      setProdDesc(editingProduct.description || '');
      setProdImage(editingProduct.images?.[0] || '');
      setProdInStock(editingProduct.inStock !== false);
      setEditorError('');
      setEditorMessage('');
    }
  }, [editingProduct]);

  if (!open) return null;

  const uploadAdminFile = async (file: File): Promise<string | null> => {
    if (file.size > 140 * 1024 * 1024) {
      setEditorError('الحد الأقصى لحجم الملف المرفوع 140 ميجابايت.');
      return null;
    }
    setUploadingMedia(true);
    setEditorError('');
    try {
      if (adminToken) {
        const binRes = await fetch('/api/admin/upload-binary', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': file.type || 'application/octet-stream',
            'x-filename': encodeURIComponent(file.name),
            'x-mime-type': file.type || 'application/octet-stream',
          },
          body: file,
        });
        if (binRes.ok) {
          const binJson = await binRes.json();
          if (binJson?.url) {
            setEditorMessage(`تم رفع "${file.name}" بنجاح!`);
            return binJson.url as string;
          }
        }
      }
      if (file.size > 15 * 1024 * 1024) {
        setEditorError('تعذر رفع الفيديو لأن حجمه يتجاوز الحد المتاح بدون جلسة صالحة.');
        return null;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('تعذر قراءة الملف.'));
        reader.readAsDataURL(file);
      });
      return dataUrl;
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'تعذر رفع الملف.');
      return null;
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSaveQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !adminToken) return;
    setSavingProduct(true);
    setEditorError('');
    setEditorMessage('');
    try {
      const updatedImages = prodImage.trim()
        ? [prodImage.trim(), ...(editingProduct.images || []).slice(1)]
        : editingProduct.images || [];
      const res = await fetch(`/api/admin/products/${encodeURIComponent(editingProduct.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: prodName.trim(),
          nameEn: prodNameEn.trim(),
          category: prodCategory.trim(),
          priceSar: Math.max(0, Number(prodPriceSar) || 0),
          wholesalePriceSar: prodWholesaleSar.trim()
            ? Math.max(0, Number(prodWholesaleSar) || 0)
            : undefined,
          compareAtPriceSar: prodCompareSar.trim()
            ? Math.max(0, Number(prodCompareSar) || 0)
            : undefined,
          description: prodDesc.trim(),
          images: updatedImages,
          inStock: prodInStock,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditorError(data.error || 'تعذر حفظ تعديلات المنتج.');
        return;
      }
      await onProductUpdated();
      setEditorMessage('تم تحديث المنتج مباشرة في المتجر!');
      setTimeout(() => onCloseProductEditor(), 800);
    } catch {
      setEditorError('خطأ في الاتصال بالخادم أثناء حفظ المنتج.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleRefreshAllSeo = async () => {
    if (!adminToken) return;
    setRefreshingSeo(true);
    setEditorError('');
    setEditorMessage('');
    try {
      const res = await fetch('/api/admin/seo/refresh-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setEditorError(data.error || 'تعذر تحديث بيانات Google SEO حالياً.');
        return;
      }
      await onProductUpdated();
      setEditorMessage(`تم تحسين وتحديث بيانات الظهور في جوجل لـ ${data.updatedCount ?? 0} منتج!`);
    } catch {
      setEditorError('تعذر الاتصال بالخادم لتحديث SEO.');
    } finally {
      setRefreshingSeo(false);
    }
  };

  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const sitemapUrl = `${siteOrigin}/sitemap.xml`;
  const robotsUrl = `${siteOrigin}/robots.txt`;

  const drawerOpen = Boolean(activeSection || editingProduct);

  return (
    <>
      {/* Docked Side Inspector Drawer */}
      {drawerOpen && (
        <aside className="fixed inset-y-0 end-0 z-50 w-full max-w-md bg-[#111115]/98 backdrop-blur-md border-s border-[#D4AF37]/40 text-[#F5F2EB] shadow-2xl flex flex-col">
          <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between gap-2 shrink-0 bg-[#16161B]">
            <div className="flex items-center gap-2 min-w-0">
              {editingProduct ? (
                <Package className="w-4 h-4 text-[#E5C158] shrink-0" />
              ) : (
                <Pencil className="w-4 h-4 text-[#E5C158] shrink-0" />
              )}
              <h3 className="text-sm font-bold truncate">
                {editingProduct
                  ? `تحرير المنتج: ${editingProduct.name}`
                  : SECTION_TABS.find((s) => s.id === activeSection)?.label || 'تحرير الموقع'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                if (editingProduct) onCloseProductEditor();
                else onSelectSection(null);
              }}
              aria-label="إغلاق لوحة التحرير"
              className="w-8 h-8 rounded-lg border border-white/10 bg-[#111115] hover:border-[#D4AF37]/50 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {editorError && (
              <div className="p-2.5 rounded-xl border border-red-500/40 bg-red-950/30 text-red-200">
                {editorError}
              </div>
            )}
            {editorMessage && (
              <div className="p-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 text-emerald-200">
                {editorMessage}
              </div>
            )}

            {/* QUICK PRODUCT EDITOR */}
            {editingProduct ? (
              <form onSubmit={handleSaveQuickProduct} className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-[#16161B]">
                  <div className="w-16 h-16 rounded-lg bg-[#09090B] border border-white/10 p-1 shrink-0">
                    <ResilientImage
                      src={prodImage}
                      alt={prodName}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#D4AF37]/45 bg-[#171510] text-[#E5C158] font-bold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingMedia ? 'جاري الرفع...' : 'تغيير صورة المنتج من الجهاز'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingMedia}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await uploadAdminFile(file);
                          if (url) setProdImage(url);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={prodImage}
                      onChange={(e) => setProdImage(e.target.value)}
                      placeholder="أو الصق رابط الصورة"
                      className="w-full h-8 px-2 rounded-lg bg-[#111115] border border-white/10 text-[11px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[#C5BFB2] mb-1">اسم المنتج (عربي) *</label>
                  <input
                    type="text"
                    required
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div>
                  <label className="block text-[#C5BFB2] mb-1">اسم المنتج (إنجليزي)</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={prodNameEn}
                    onChange={(e) => setProdNameEn(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[#C5BFB2] mb-1">القسم</label>
                    <input
                      type="text"
                      required
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#C5BFB2] mb-1">سعر البيع (ر.س) *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={prodPriceSar}
                      onChange={(e) => setProdPriceSar(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 tabular-nums focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[#C5BFB2] mb-1">سعر الجملة (اختياري)</label>
                    <input
                      type="number"
                      min={0}
                      value={prodWholesaleSar}
                      onChange={(e) => setProdWholesaleSar(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 tabular-nums focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#C5BFB2] mb-1">السعر قبل الخصم (اختياري)</label>
                    <input
                      type="number"
                      min={0}
                      value={prodCompareSar}
                      onChange={(e) => setProdCompareSar(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 tabular-nums focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[#C5BFB2] mb-1">الوصف</label>
                  <textarea
                    rows={3}
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-[#16161B] border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prodInStock}
                    onChange={(e) => setProdInStock(e.target.checked)}
                    className="accent-[#D4AF37]"
                  />
                  <span>المنتج متوفر حالياً للطلب</span>
                </label>

                <button
                  type="submit"
                  disabled={savingProduct}
                  className="btn-gold-wave w-full h-10 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingProduct ? 'جاري الحفظ...' : 'حفظ تعديلات المنتج'}</span>
                </button>
              </form>
            ) : activeSection === 'identity' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[#C5BFB2] mb-1">اسم المتجر / المصنع</label>
                  <input
                    type="text"
                    value={draftSettings.storeName}
                    onChange={(e) => onChangeDraft({ ...draftSettings, storeName: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-[#C5BFB2] mb-1">الشعار النصي المختصر</label>
                  <input
                    type="text"
                    value={draftSettings.storeTagline}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, storeTagline: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-[#C5BFB2] mb-1">وضع عرض الأسعار</label>
                  <select
                    value={draftSettings.priceDisplayMode || 'retail'}
                    onChange={(e) =>
                      onChangeDraft({
                        ...draftSettings,
                        priceDisplayMode: e.target.value === 'wholesale' ? 'wholesale' : 'retail',
                      })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="retail">أسعار التجزئة (للأفراد)</option>
                    <option value="wholesale">أسعار الجملة (للمعارض والورش)</option>
                  </select>
                </div>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[#16161B] border border-white/10 cursor-pointer">
                  <span>المتجر مفتوح لاستقبال الطلبات</span>
                  <input
                    type="checkbox"
                    checked={draftSettings.storeOpen !== false}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, storeOpen: e.target.checked })
                    }
                    className="accent-[#D4AF37]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[#16161B] border border-white/10 cursor-pointer">
                  <span>تفعيل محول العملات الخليجية</span>
                  <input
                    type="checkbox"
                    checked={draftSettings.multiCurrencyEnabled !== false}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, multiCurrencyEnabled: e.target.checked })
                    }
                    className="accent-[#D4AF37]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[#16161B] border border-white/10 cursor-pointer">
                  <span>تفعيل زر تبديل اللغة (عربي / English)</span>
                  <input
                    type="checkbox"
                    checked={draftSettings.allowLanguageSwitch !== false}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, allowLanguageSwitch: e.target.checked })
                    }
                    className="accent-[#D4AF37]"
                  />
                </label>
              </div>
            ) : activeSection === 'marquee' ? (
              <div className="space-y-4">
                <div className="p-3 rounded-xl border border-white/10 bg-[#16161B] space-y-2.5">
                  <label className="flex items-center justify-between font-bold text-[#E5C158] cursor-pointer">
                    <span>الشريط المتحرك الأول (الأعلى)</span>
                    <input
                      type="checkbox"
                      checked={draftSettings.marqueeEnabled}
                      onChange={(e) =>
                        onChangeDraft({ ...draftSettings, marqueeEnabled: e.target.checked })
                      }
                      className="accent-[#D4AF37]"
                    />
                  </label>
                  <textarea
                    rows={2}
                    value={draftSettings.marqueeText}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, marqueeText: e.target.value })
                    }
                    className="w-full p-2.5 rounded-lg bg-[#111115] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="block text-[10px] text-[#9E988C] mb-1">الخلفية</span>
                      <input
                        type="color"
                        value={draftSettings.marqueeBgColor || '#14120E'}
                        onChange={(e) =>
                          onChangeDraft({ ...draftSettings, marqueeBgColor: e.target.value })
                        }
                        className="w-full h-8 rounded bg-transparent cursor-pointer"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#9E988C] mb-1">لون النص</span>
                      <input
                        type="color"
                        value={draftSettings.marqueeTextColor || '#E5C158'}
                        onChange={(e) =>
                          onChangeDraft({ ...draftSettings, marqueeTextColor: e.target.value })
                        }
                        className="w-full h-8 rounded bg-transparent cursor-pointer"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#9E988C] mb-1">السرعة (ث)</span>
                      <input
                        type="number"
                        min={6}
                        max={80}
                        value={draftSettings.marqueeSpeed ?? 28}
                        onChange={(e) =>
                          onChangeDraft({
                            ...draftSettings,
                            marqueeSpeed: Math.max(6, Number(e.target.value) || 28),
                          })
                        }
                        className="w-full h-8 px-2 rounded bg-[#111115] border border-white/15 tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-white/10 bg-[#16161B] space-y-2.5">
                  <label className="flex items-center justify-between font-bold text-[#E5C158] cursor-pointer">
                    <span>الشريط المتحرك الثاني (الفرعي)</span>
                    <input
                      type="checkbox"
                      checked={Boolean(draftSettings.marquee2Enabled)}
                      onChange={(e) =>
                        onChangeDraft({ ...draftSettings, marquee2Enabled: e.target.checked })
                      }
                      className="accent-[#D4AF37]"
                    />
                  </label>
                  <textarea
                    rows={2}
                    value={draftSettings.marquee2Text || ''}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, marquee2Text: e.target.value })
                    }
                    className="w-full p-2.5 rounded-lg bg-[#111115] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="block text-[10px] text-[#9E988C] mb-1">الخلفية</span>
                      <input
                        type="color"
                        value={draftSettings.marquee2BgColor || '#1E180B'}
                        onChange={(e) =>
                          onChangeDraft({ ...draftSettings, marquee2BgColor: e.target.value })
                        }
                        className="w-full h-8 rounded bg-transparent cursor-pointer"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#9E988C] mb-1">لون النص</span>
                      <input
                        type="color"
                        value={draftSettings.marquee2TextColor || '#F5E1A4'}
                        onChange={(e) =>
                          onChangeDraft({ ...draftSettings, marquee2TextColor: e.target.value })
                        }
                        className="w-full h-8 rounded bg-transparent cursor-pointer"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#9E988C] mb-1">السرعة (ث)</span>
                      <input
                        type="number"
                        min={6}
                        max={80}
                        value={draftSettings.marquee2Speed ?? 24}
                        onChange={(e) =>
                          onChangeDraft({
                            ...draftSettings,
                            marquee2Speed: Math.max(6, Number(e.target.value) || 24),
                          })
                        }
                        className="w-full h-8 px-2 rounded bg-[#111115] border border-white/15 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : activeSection === 'hero' ? (
              <div className="space-y-3">
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#16161B] border border-white/10 cursor-pointer">
                  <span>إظهار قسم الهبوط الرئيسي (Landing)</span>
                  <input
                    type="checkbox"
                    checked={draftSettings.heroEnabled}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, heroEnabled: e.target.checked })
                    }
                    className="accent-[#D4AF37]"
                  />
                </label>

                <div>
                  <label className="block text-[#C5BFB2] mb-1">العنوان الترحيبي الرئيسي</label>
                  <input
                    type="text"
                    value={draftSettings.heroTitle}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, heroTitle: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div>
                  <label className="block text-[#C5BFB2] mb-1">النص التوضيحي أسفل العنوان</label>
                  <textarea
                    rows={3}
                    value={draftSettings.heroSubtitle}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, heroSubtitle: e.target.value })
                    }
                    className="w-full p-2.5 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div>
                  <label className="block text-[#C5BFB2] mb-1">نص زر الإجراء الرئيسي</label>
                  <input
                    type="text"
                    value={draftSettings.heroCtaText}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, heroCtaText: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div className="p-3 rounded-xl border border-white/10 bg-[#16161B] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#E5C158]">صورة / مقطع فيديو الهبوط</span>
                    <div className="flex items-center gap-1.5">
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#09090B] font-bold cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>{uploadingMedia ? '...' : 'رفع صورة'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingMedia}
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const url = await uploadAdminFile(f);
                            if (url) {
                              onChangeDraft({
                                ...draftSettings,
                                heroImageUrl: url,
                                heroBackdropMode: 'image',
                              });
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-500/45 bg-emerald-950/35 text-emerald-300 font-bold cursor-pointer">
                        <Film className="w-3 h-3" />
                        <span>{uploadingMedia ? '...' : 'رفع فيديو'}</span>
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime,video/*"
                          className="hidden"
                          disabled={uploadingMedia}
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const url = await uploadAdminFile(f);
                            if (url) {
                              onChangeDraft({
                                ...draftSettings,
                                heroVideoUrl: url,
                                heroBackdropMode: 'video',
                              });
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <select
                    value={draftSettings.heroBackdropMode || 'auto'}
                    onChange={(e) =>
                      onChangeDraft({
                        ...draftSettings,
                        heroBackdropMode: e.target.value as PublicSettings['heroBackdropMode'],
                      })
                    }
                    className="w-full h-8 px-2.5 rounded-lg bg-[#111115] border border-white/15 text-[11px]"
                  >
                    <option value="auto">تلقائي (فيديو إذا وُجد أو شرائح الصور)</option>
                    <option value="video">عرض مقطع الفيديو الرئيسي</option>
                    <option value="slideshow">عرض شرائح الصور</option>
                    <option value="image">صورة رئيسية ثابتة</option>
                  </select>
                  <input
                    type="text"
                    dir="ltr"
                    value={draftSettings.heroImageUrl}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, heroImageUrl: e.target.value })
                    }
                    placeholder="رابط الصورة الرئيسية"
                    className="w-full h-8 px-2.5 rounded-lg bg-[#111115] border border-white/15 text-[11px]"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      dir="ltr"
                      value={draftSettings.heroVideoUrl}
                      onChange={(e) =>
                        onChangeDraft({ ...draftSettings, heroVideoUrl: e.target.value })
                      }
                      placeholder="رابط فيديو MP4 للهبوط (اختياري)"
                      className="flex-1 h-8 px-2.5 rounded-lg bg-[#111115] border border-white/15 text-[11px]"
                    />
                    {draftSettings.heroVideoUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          onChangeDraft({
                            ...draftSettings,
                            heroVideoUrl: '',
                            heroBackdropMode: 'auto',
                          })
                        }
                        className="h-8 px-2 rounded-lg border border-red-500/35 text-red-300 text-[10px] cursor-pointer"
                      >
                        حذف الفيديو
                      </button>
                    )}
                  </div>
                  {draftSettings.heroVideoUrl && (
                    <video
                      key={draftSettings.heroVideoUrl}
                      src={draftSettings.heroVideoUrl}
                      muted
                      loop
                      autoPlay
                      playsInline
                      className="w-full h-24 object-cover rounded-lg border border-white/10 bg-black"
                    />
                  )}
                </div>

                {/* Edit 4 Feature Cards */}
                <div className="space-y-2 pt-1">
                  <div className="font-bold text-[#E5C158]">بطاقات مميزات المتجر (4 بطاقات)</div>
                  {(draftSettings.heroFeatures || []).map((feat, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl border border-white/10 bg-[#16161B] space-y-1.5"
                    >
                      <input
                        type="text"
                        value={feat.title}
                        onChange={(e) => {
                          const next = [...(draftSettings.heroFeatures || [])];
                          next[idx] = { ...next[idx], title: e.target.value };
                          onChangeDraft({ ...draftSettings, heroFeatures: next });
                        }}
                        placeholder={`عنوان الميزة ${idx + 1}`}
                        className="w-full h-8 px-2.5 rounded-lg bg-[#111115] border border-white/10 font-bold"
                      />
                      <textarea
                        rows={2}
                        value={feat.description}
                        onChange={(e) => {
                          const next = [...(draftSettings.heroFeatures || [])];
                          next[idx] = { ...next[idx], description: e.target.value };
                          onChangeDraft({ ...draftSettings, heroFeatures: next });
                        }}
                        placeholder="وصف الميزة"
                        className="w-full p-2 rounded-lg bg-[#111115] border border-white/10 text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : activeSection === 'theme' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-[#16161B] border border-white/10">
                    <span className="block text-[10px] text-[#9E988C] mb-1">اللون الأساسي</span>
                    <input
                      type="color"
                      value={draftSettings.primaryGoldColor || '#D4AF37'}
                      onChange={(e) =>
                        onChangeDraft({ ...draftSettings, primaryGoldColor: e.target.value })
                      }
                      className="w-full h-9 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#16161B] border border-white/10">
                    <span className="block text-[10px] text-[#9E988C] mb-1">خلفية الموقع</span>
                    <input
                      type="color"
                      value={draftSettings.backgroundColor || '#09090B'}
                      onChange={(e) =>
                        onChangeDraft({ ...draftSettings, backgroundColor: e.target.value })
                      }
                      className="w-full h-9 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#16161B] border border-white/10">
                    <span className="block text-[10px] text-[#9E988C] mb-1">لون البطاقات</span>
                    <input
                      type="color"
                      value={draftSettings.surfaceColor || '#131317'}
                      onChange={(e) =>
                        onChangeDraft({ ...draftSettings, surfaceColor: e.target.value })
                      }
                      className="w-full h-9 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[#C5BFB2] mb-1">نمط الأزرار الرئيسية</label>
                  <select
                    value={draftSettings.buttonStyle || 'gold_wave'}
                    onChange={(e) =>
                      onChangeDraft({
                        ...draftSettings,
                        buttonStyle: e.target.value as PublicSettings['buttonStyle'],
                      })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="gold_wave">ذهبي متموج فاخر</option>
                    <option value="solid_gold">ذهبي موحد</option>
                    <option value="outline_gold">إطار ذهبي أنيق</option>
                  </select>
                </div>

                <div className="p-3 rounded-xl border border-white/10 bg-[#16161B] space-y-2.5">
                  <div className="font-bold text-[#E5C158]">خلفية الموقع العامة</div>
                  <select
                    value={draftSettings.siteBackgroundType || 'none'}
                    onChange={(e) =>
                      onChangeDraft({
                        ...draftSettings,
                        siteBackgroundType: e.target.value as PublicSettings['siteBackgroundType'],
                      })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#111115] border border-white/15"
                  >
                    <option value="none">لون خلفية فقط (بدون صورة/فيديو)</option>
                    <option value="image">صورة ثابتة</option>
                    <option value="animated_image">صورة متحركة (Motion)</option>
                    <option value="video">مقطع فيديو متحرك</option>
                  </select>

                  {draftSettings.siteBackgroundType !== 'none' && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={draftSettings.siteBackgroundUrl || ''}
                          onChange={(e) =>
                            onChangeDraft({ ...draftSettings, siteBackgroundUrl: e.target.value })
                          }
                          placeholder="رابط الصورة أو مقطع الفيديو (.mp4)"
                          className="flex-1 min-w-[140px] h-8 px-2.5 rounded-lg bg-[#111115] border border-white/15 text-[11px]"
                        />
                        <label className="h-8 px-2.5 rounded-lg bg-[#D4AF37] text-[#09090B] font-bold flex items-center gap-1 cursor-pointer shrink-0">
                          <Upload className="w-3 h-3" />
                          <span>{uploadingMedia ? '...' : 'صورة'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingMedia}
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const url = await uploadAdminFile(f);
                              if (url) {
                                onChangeDraft({
                                  ...draftSettings,
                                  siteBackgroundUrl: url,
                                  siteBackgroundType: f.type.includes('gif')
                                    ? 'animated_image'
                                    : draftSettings.siteBackgroundType === 'animated_image'
                                      ? 'animated_image'
                                      : 'image',
                                });
                              }
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <label className="h-8 px-2.5 rounded-lg border border-emerald-500/45 bg-emerald-950/35 text-emerald-300 font-bold flex items-center gap-1 cursor-pointer shrink-0">
                          <Film className="w-3 h-3" />
                          <span>{uploadingMedia ? '...' : 'رفع فيديو'}</span>
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/*"
                            className="hidden"
                            disabled={uploadingMedia}
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const url = await uploadAdminFile(f);
                              if (url) {
                                onChangeDraft({
                                  ...draftSettings,
                                  siteBackgroundUrl: url,
                                  siteBackgroundType: 'video',
                                });
                              }
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      {draftSettings.siteBackgroundType === 'video' &&
                        draftSettings.siteBackgroundUrl && (
                          <div className="space-y-1.5">
                            <video
                              key={draftSettings.siteBackgroundUrl}
                              src={draftSettings.siteBackgroundUrl}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-24 object-cover rounded-lg border border-white/10 bg-black"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                onChangeDraft({
                                  ...draftSettings,
                                  siteBackgroundType: 'none',
                                  siteBackgroundUrl: '',
                                })
                              }
                              className="text-[11px] text-red-300 hover:underline cursor-pointer"
                            >
                              إزالة فيديو الخلفية
                            </button>
                          </div>
                        )}
                      <div>
                        <div className="flex justify-between text-[11px] text-[#9E988C] mb-1">
                          <span>شفافية الخلفية</span>
                          <span className="tabular-nums">
                            {Math.round((draftSettings.siteBackgroundOpacity ?? 0.24) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.85}
                          step={0.05}
                          value={draftSettings.siteBackgroundOpacity ?? 0.24}
                          onChange={(e) =>
                            onChangeDraft({
                              ...draftSettings,
                              siteBackgroundOpacity: Number(e.target.value),
                            })
                          }
                          className="w-full accent-[#D4AF37]"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : activeSection === 'categories' ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl border border-[#D4AF37]/30 bg-[#16161B] space-y-2">
                  <div className="font-bold text-[#E5C158]">إضافة قسم جديد للمتجر</div>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="اسم القسم (مثال: دبات سيارات الدفع الرباعي)"
                    className="w-full h-9 px-3 rounded-lg bg-[#111115] border border-white/15"
                  />
                  <input
                    type="text"
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    placeholder="وصف قصير للقسم (اختياري)"
                    className="w-full h-9 px-3 rounded-lg bg-[#111115] border border-white/15"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newCatName.trim();
                      if (!clean) return;
                      const list = draftSettings.categories || [];
                      if (list.some((c) => c.name === clean)) {
                        setEditorError('هذا القسم موجود مسبقاً.');
                        return;
                      }
                      const nextCat: StoreCategory = {
                        id: `cat-${Date.now().toString(36)}`,
                        name: clean,
                        description: newCatDesc.trim(),
                        isActive: true,
                      };
                      onChangeDraft({ ...draftSettings, categories: [...list, nextCat] });
                      setNewCatName('');
                      setNewCatDesc('');
                      setEditorError('');
                    }}
                    className="w-full h-9 rounded-lg bg-[#D4AF37] text-[#09090B] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة القسم</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {(draftSettings.categories || []).map((cat, idx) => (
                    <div
                      key={cat.id}
                      className="p-2.5 rounded-xl border border-white/10 bg-[#16161B] space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={cat.isActive}
                          onChange={(e) => {
                            const next = [...(draftSettings.categories || [])];
                            next[idx] = { ...cat, isActive: e.target.checked };
                            onChangeDraft({ ...draftSettings, categories: next });
                          }}
                          className="accent-[#D4AF37]"
                        />
                        <input
                          type="text"
                          value={cat.name}
                          onChange={(e) => {
                            const next = [...(draftSettings.categories || [])];
                            next[idx] = { ...cat, name: e.target.value };
                            onChangeDraft({ ...draftSettings, categories: next });
                          }}
                          className="flex-1 h-8 px-2 rounded bg-[#111115] border border-white/10 font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = (draftSettings.categories || []).filter(
                              (c) => c.id !== cat.id
                            );
                            onChangeDraft({ ...draftSettings, categories: next });
                          }}
                          className="w-8 h-8 rounded-lg border border-white/10 text-red-400 hover:bg-red-950/30 flex items-center justify-center cursor-pointer"
                          aria-label="حذف القسم"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={cat.description || ''}
                        onChange={(e) => {
                          const next = [...(draftSettings.categories || [])];
                          next[idx] = { ...cat, description: e.target.value };
                          onChangeDraft({ ...draftSettings, categories: next });
                        }}
                        placeholder="وصف القسم"
                        className="w-full h-8 px-2 rounded bg-[#111115] border border-white/10 text-[11px] text-[#C5BFB2]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : activeSection === 'about' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[#C5BFB2] mb-1">نص "من نحن" أسفل الموقع</label>
                  <textarea
                    rows={4}
                    value={draftSettings.aboutUsText}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, aboutUsText: e.target.value })
                    }
                    className="w-full p-2.5 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-[#C5BFB2] mb-1">رقم الواتساب للطلبات</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draftSettings.whatsappNumber}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, whatsappNumber: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-right focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-[#C5BFB2] mb-1">البريد الإلكتروني الظاهر للعملاء</label>
                  <input
                    type="email"
                    dir="ltr"
                    value={draftSettings.contactEmail}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, contactEmail: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 text-right focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-[#C5BFB2] mb-1">رابط إنستقرام</label>
                  <input
                    type="url"
                    dir="ltr"
                    value={draftSettings.instagramUrl}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, instagramUrl: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-[#C5BFB2] mb-1">رابط تيك توك</label>
                  <input
                    type="url"
                    dir="ltr"
                    value={draftSettings.tiktokUrl}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, tiktokUrl: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#16161B] border border-white/15 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>
            ) : activeSection === 'seo' ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl border border-[#D4AF37]/40 bg-white text-slate-900 space-y-1 text-right">
                  <div className="text-[11px] text-emerald-700 font-medium truncate" dir="ltr">
                    {siteOrigin}
                  </div>
                  <div className="text-sm font-bold text-blue-700 leading-snug">
                    {draftSettings.storeName} | {draftSettings.storeTagline}
                  </div>
                  <div className="text-xs text-slate-600 line-clamp-2">
                    {draftSettings.aboutUsText}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-white/10 bg-[#16161B] space-y-2.5">
                  <div className="font-bold text-[#E5C158]">
                    ملفات الفهرسة لمحرك بحث Google (Search Console)
                  </div>
                  <p className="text-[#9E988C] leading-relaxed">
                    موقعك مجهّز تلقائياً بملف خريطة الموقع XML وملف robots.txt وبيانات Schema.org
                    للمنتجات. انسخ رابط الخريطة وأضفه في Google Search Console لتسريع الظهور في
                    النتائج:
                  </p>
                  {[
                    { label: 'خريطة الموقع (Sitemap)', url: sitemapUrl },
                    { label: 'ملف الزحف (Robots)', url: robotsUrl },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#111115] border border-white/10"
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] text-[#9E988C]">{item.label}</div>
                        <div className="text-[11px] text-[#E5C158] truncate" dir="ltr">
                          {item.url}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(item.url);
                          setCopiedUrl(item.url);
                          setTimeout(() => setCopiedUrl(''), 1800);
                        }}
                        className="h-7 px-2.5 rounded border border-white/15 text-[11px] text-white flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {copiedUrl === item.url ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>نسخ</span>
                      </button>
                    </div>
                  ))}
                </div>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[#16161B] border border-white/10 cursor-pointer">
                  <span>تحديث الكلمات المفتاحية وSchema تلقائياً بالذكاء الاصطناعي</span>
                  <input
                    type="checkbox"
                    checked={draftSettings.seoAutoUpdateEnabled}
                    onChange={(e) =>
                      onChangeDraft({ ...draftSettings, seoAutoUpdateEnabled: e.target.checked })
                    }
                    className="accent-[#D4AF37]"
                  />
                </label>

                <button
                  type="button"
                  disabled={refreshingSeo}
                  onClick={handleRefreshAllSeo}
                  className="btn-gold-wave w-full h-10 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshingSeo ? 'animate-spin' : ''}`} />
                  <span>
                    {refreshingSeo
                      ? 'جاري تحديث كلمات البحث وSchema...'
                      : 'تحسين SEO لجميع المنتجات في جوجل الآن'}
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          {!editingProduct && (
            <div className="p-3 border-t border-white/10 bg-[#16161B] flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={savingSettings}
                onClick={onSaveSettings}
                className="btn-gold-wave flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{savingSettings ? 'جاري الحفظ...' : 'حفظ ونشر التعديلات'}</span>
              </button>
              {hasUnsavedChanges && (
                <button
                  type="button"
                  onClick={onResetDraft}
                  className="h-10 px-3 rounded-xl border border-white/15 text-xs text-[#C5BFB2] hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>تراجع</span>
                </button>
              )}
            </div>
          )}
        </aside>
      )}

      {/* Floating Bottom Owner Live-Edit Toolbar */}
      <div className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:start-1/2 sm:-translate-x-1/2 z-40 max-w-5xl rounded-2xl border border-[#D4AF37]/60 bg-[#111115]/95 backdrop-blur-md p-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 px-1">
          <Pencil className="w-4 h-4 text-[#E5C158] shrink-0" />
          <span className="font-bold text-[#F5E1A4] whitespace-nowrap">
            وضع تحرير الموقع المباشر
          </span>
          {hasUnsavedChanges && (
            <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[10px] font-bold">
              غير محفوظ
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {SECTION_TABS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id && !editingProduct;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  onCloseProductEditor();
                  onSelectSection(active ? null : sec.id);
                }}
                className={`h-8 px-2.5 rounded-lg font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#D4AF37] text-[#09090B]'
                    : 'bg-[#18181F] text-[#C5BFB2] hover:text-[#E5C158] border border-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={savingSettings}
            onClick={onSaveSettings}
            className="btn-gold-wave h-8 px-3 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingSettings ? '...' : 'حفظ الموقع'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenAdminDashboard}
            className="h-8 px-2.5 rounded-lg border border-white/15 bg-[#16161B] hover:border-[#D4AF37]/50 text-[#C5BFB2] hover:text-white flex items-center gap-1 cursor-pointer"
            title="العودة للوحة التحكم الكاملة"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">لوحة التحكم</span>
          </button>
          <button
            type="button"
            onClick={onExitEditMode}
            className="h-8 px-2.5 rounded-lg border border-red-500/35 bg-red-950/30 hover:bg-red-950/50 text-red-200 flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>إنهاء</span>
          </button>
        </div>
      </div>
    </>
  );
}
