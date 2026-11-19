import crypto from 'node:crypto';
import { type FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import type {
  GeneratedAdsCampaign,
  Product,
  ProductSpec,
  PublicProduct,
  SearchGroundingSource,
  VehicleCompatibilityResult,
} from '../src/types.ts';
import {
  createProduct,
  deleteProduct,
  getAdminSettings,
  getAllOrdersAdmin,
  getAllProductsAdmin,
  getOwnerAlertsAndDigest,
  getPublishedProducts,
  notifyOwnerWebhookIfConfigured,
  stripPrivateProductFields,
  updateProduct,
  updateSettings,
} from './db.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ScrapedProductResult {
  name: string;
  category: string;
  priceSar: number;
  originalExtractedPrice: string;
  description: string;
  images: string[];
  specs: ProductSpec[];
}

function extractHtmlSignals(html: string, baseUrl: string) {
  const images = new Set<string>();
  const addUrl = (raw?: string) => {
    if (!raw) return;
    const cleaned = raw.trim().replace(/&amp;/g, '&');
    if (!cleaned || cleaned.startsWith('data:')) return;
    try {
      const resolved = new URL(cleaned, baseUrl).toString();
      if (
        /\.(png|jpe?g|webp|avif)(\?|$)/i.test(resolved) ||
        resolved.includes('image') ||
        resolved.includes('cdn')
      ) {
        images.add(resolved);
      }
    } catch {
      // ignore invalid URL
    }
  };

  const ogImgRegex =
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:secure_url)["'][^>]+content=["']([^"']+)["']/gi;
  for (const match of html.matchAll(ogImgRegex)) {
    addUrl(match[1]);
  }

  const imgTagRegex =
    /<img[^>]+(?:src|data-src|data-zoom-image|data-large_image)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(imgTagRegex)) {
    const src = match[1];
    if (!/icon|logo|avatar|sprite|pixel|1x1|svg/i.test(src)) {
      addUrl(src);
    }
    if (images.size >= 10) break;
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const metaDescMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  );

  const jsonLdMatches = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ]
    .map((m) => m[1].trim())
    .slice(0, 3)
    .join('\n');

  const plainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);

  return {
    title: titleMatch?.[1]?.trim() ?? '',
    metaDescription: metaDescMatch?.[1]?.trim() ?? '',
    jsonLd: jsonLdMatches.slice(0, 3000),
    textSnippet: plainText,
    foundImages: Array.from(images).slice(0, 8),
  };
}

export async function scrapeProductFromUrl(url: string): Promise<ScrapedProductResult> {
  const ai = getAiClient();
  let fetchedSignals: ReturnType<typeof extractHtmlSignals> | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const html = await resp.text();
      if (html && html.length > 250) {
        fetchedSignals = extractHtmlSignals(html, url);
      }
    }
  } catch {
    // Fallback to Gemini urlContext + googleSearch below
  }

  if (fetchedSignals && (fetchedSignals.textSnippet.length > 150 || fetchedSignals.jsonLd.length > 50)) {
    const prompt = `أنت خبير تجارة إلكترونية فاخرة. قم بتحليل بيانات المنتج المستخرجة من الرابط التالي وتحويلها إلى بيانات عربية احترافية وفاخرة بالريال السعودي (SAR):
الرابط: ${url}
العنوان المستخرج: ${fetchedSignals.title}
الوصف: ${fetchedSignals.metaDescription}
بيانات JSON-LD: ${fetchedSignals.jsonLd}
الصور المستخرجة: ${JSON.stringify(fetchedSignals.foundImages)}
مقتطف النص: ${fetchedSignals.textSnippet}

المطلوب:
- استخرج الاسم الكامل للمنتج باللغة العربية الفاخرة.
- اقترح سعراً مناسباً بالريال السعودي (رقم صحيح) مع حفظ نص السعر الأصلي المكتشف.
- اكتب وصفاً تسويقياً عربياً متكاملاً.
- استخرج المواصفات الفنية في مصفوفة label و value باللغة العربية.
- حافظ على روابط الصور عالية الجودة المستخرجة من الصفحة إن وجدت.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            priceSar: { type: Type.NUMBER },
            originalExtractedPrice: { type: Type.STRING },
            description: { type: Type.STRING },
            images: { type: Type.ARRAY, items: { type: Type.STRING } },
            specs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ['label', 'value'],
              },
            },
          },
          required: [
            'name',
            'category',
            'priceSar',
            'originalExtractedPrice',
            'description',
            'images',
            'specs',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ScrapedProductResult>;
    const mergedImages = Array.from(
      new Set([...(parsed.images ?? []), ...(fetchedSignals.foundImages ?? [])])
    ).filter((img) => typeof img === 'string' && img.startsWith('http'));

    return {
      name: parsed.name || fetchedSignals.title || 'منتج مسحوب جديد',
      category: parsed.category || 'مقتنيات مختارة',
      priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 450,
      originalExtractedPrice: parsed.originalExtractedPrice || 'غير محدد',
      description: parsed.description || fetchedSignals.metaDescription || 'وصف المنتج قيد المراجعة.',
      images: mergedImages,
      specs: Array.isArray(parsed.specs) ? parsed.specs : [],
    };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `اقرأ محتوى رابط المنتج التالي واستخرج بياناته الكاملة باللغة العربية بصيغة JSON فقط:
الرابط: ${url}

أعد كائن JSON يحتوي فقط على المفاتيح التالية:
{
  "name": "اسم المنتج الكامل بالعربية",
  "category": "التصنيف بالعربية",
  "priceSar": 750,
  "originalExtractedPrice": "السعر الأصلي كما ورد في الصفحة",
  "description": "وصف تسويقي مفصل بالعربية",
  "images": ["روابط الصور عالية الجودة إن وجدت"],
  "specs": [{"label": "اسم المواصفة", "value": "القيمة"}]
}`,
    config: {
      tools: [{ urlContext: {} }, { googleSearch: {} }],
    },
  });

  const rawText = (response.text ?? '').trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<ScrapedProductResult>;
      return {
        name: parsed.name || 'منتج مسحوب للمراجعة',
        category: parsed.category || 'مقتنيات مختارة',
        priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 590,
        originalExtractedPrice: parsed.originalExtractedPrice || 'غير محدد',
        description: parsed.description || 'تم استخراج المنتج وحفظه كمسودة سرية للمراجعة.',
        images: Array.isArray(parsed.images)
          ? parsed.images.filter((i) => typeof i === 'string' && i.startsWith('http'))
          : [],
        specs: Array.isArray(parsed.specs) ? parsed.specs : [],
      };
    } catch {
      // fall through
    }
  }

  return {
    name: 'منتج مسحوب للمراجعة اليدوية',
    category: 'مقتنيات مختارة',
    priceSar: 550,
    originalExtractedPrice: 'غير متاح تلقائياً',
    description:
      rawText.slice(0, 500) ||
      'تم حفظ الرابط في قاعدة البيانات السرية للمالك. يرجى استكمال البيانات والصور قبل النشر.',
    images: [],
    specs: [{ label: 'المصدر', value: 'بانتظار مراجعة المالك' }],
  };
}

export interface SimilarScrapedDraftInput {
  storeUrl: string;
  targetProductHint: string;
  profitMarginPercent: number;
  extraProfitSar?: number;
  category?: string;
}

export interface SimilarScrapedItem {
  name: string;
  category: string;
  costPriceSar: number;
  priceSar: number;
  compareAtPriceSar?: number;
  originalExtractedPrice: string;
  description: string;
  images: string[];
  specs: ProductSpec[];
  sourceUrl: string;
  profitMarginPercent: number;
}

function extractStoreCatalogSignals(html: string, baseUrl: string) {
  const base = extractHtmlSignals(html, baseUrl);
  const links: { text: string; url: string }[] = [];
  const seen = new Set<string>();
  const anchorRegex = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(anchorRegex)) {
    const rawHref = m[1]?.trim();
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) continue;
    const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!label || label.length < 4 || label.length > 140) continue;
    try {
      const abs = new URL(rawHref, baseUrl).toString();
      if (!seen.has(abs)) {
        seen.add(abs);
        links.push({ text: label, url: abs });
      }
    } catch {
      // ignore invalid URL
    }
    if (links.length >= 45) break;
  }
  return { ...base, links };
}

function defaultStudioFallbackImage(categoryOrText: string): string {
  const txt = categoryOrText.toLowerCase();
  if (txt.includes('ديزل') || txt.includes('dpf') || txt.includes('diesel')) {
    return '/src/assets/images/product_diesel_dpf_1794821492144.jpg';
  }
  if (txt.includes('سيراميك') || txt.includes('حشوة') || txt.includes('قلب') || txt.includes('ceramic')) {
    return '/src/assets/images/product_ceramic_core_1794821493246.jpg';
  }
  if (txt.includes('طقم') || txt.includes('فلنج') || txt.includes('exhaust') || txt.includes('kit')) {
    return '/src/assets/images/product_universal_exhaust_1794821493897.jpg';
  }
  return '/src/assets/images/product_gasoline_cat_1794821493329.jpg';
}

export async function scrapeSimilarProductsFromUrl(
  input: SimilarScrapedDraftInput
): Promise<SimilarScrapedItem[]> {
  const ai = getAiClient();
  const marginPct = Math.max(0, Math.min(300, Number(input.profitMarginPercent) || 25));
  const extraSar = Math.max(0, Number(input.extraProfitSar) || 0);
  const targetCategory = input.category?.trim() || 'دبات تلوث البنزين';

  let signals: ReturnType<typeof extractStoreCatalogSignals> | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(input.storeUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const html = await resp.text();
      if (html && html.length > 200) {
        signals = extractStoreCatalogSignals(html, input.storeUrl);
      }
    }
  } catch {
    // Fallback to urlContext + googleSearch below
  }

  let rawItems: Array<{
    name?: string;
    category?: string;
    costPriceSar?: number;
    originalExtractedPrice?: string;
    description?: string;
    images?: string[];
    specs?: ProductSpec[];
    sourceUrl?: string;
  }> = [];

  if (signals && (signals.textSnippet.length > 150 || signals.links.length > 3)) {
    const prompt = `أنت خبير تسويق إلكتروني وسحب بيانات منتجات للمتاجر المتخصصة.
وضع المالك رابط المتجر/المنتج التالي: ${input.storeUrl}
وحدد نوع المنتج المشابه المطلوب سحبه: "${input.targetProductHint}"
القسم الافتراضي المقترح: "${targetCategory}"

البيانات المستخرجة من الصفحة:
العنوان: ${signals.title}
JSON-LD: ${signals.jsonLd}
روابط وصفحات مكتشفة: ${JSON.stringify(signals.links.slice(0, 30))}
صور عالية الدقة مكتشفة: ${JSON.stringify(signals.foundImages)}
النص: ${signals.textSnippet}

المطلوب:
استخرج واقترح من 3 إلى 5 منتجات متطابقة أو مشابهة تماماً للمنتج المحدد ("${input.targetProductHint}") من نفس المتجر أو نفس فئته التقنية.
لكل منتج:
- name: اكتب اسماً عربياً جذاباً وواضحاً جداً يفهمه العميل فوراً (اذكر نوع السيارة أو المحرك ديزل/بنزين والميزة الأساسية).
- category: تصنيف عربي دقيق مثل "${targetCategory}".
- costPriceSar: السعر الأساسي التقديري بالريال السعودي (قبل إضافة ربح المالك).
- originalExtractedPrice: السعر الأصلي كما ظهر في المتجر أو التقدير المصدر.
- description: وصف تسويقي عربي احترافي يشرح للعميل الفوائد والمقاسات والتوافق بوضوح تام.
- images: روابط الصور المناسبة من الصور المكتشفة إن وجدت.
- specs: مصفوفة مواصفات (label و value) بالعربية.
- sourceUrl: رابط المنتج المكتشف إن وجد وإلا رابط المتجر الأصلي.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  category: { type: Type.STRING },
                  costPriceSar: { type: Type.NUMBER },
                  originalExtractedPrice: { type: Type.STRING },
                  description: { type: Type.STRING },
                  images: { type: Type.ARRAY, items: { type: Type.STRING } },
                  sourceUrl: { type: Type.STRING },
                  specs: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        value: { type: Type.STRING },
                      },
                      required: ['label', 'value'],
                    },
                  },
                },
                required: ['name', 'category', 'costPriceSar', 'description', 'specs'],
              },
            },
          },
          required: ['items'],
        },
      },
    });
    try {
      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        items?: typeof rawItems;
      };
      if (Array.isArray(parsed.items)) rawItems = parsed.items;
    } catch {
      rawItems = [];
    }
  } else {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `تصفح رابط المتجر التالي واستخرج 3 إلى 5 منتجات مشابهة لـ "${input.targetProductHint}" وأعد النتيجة بصيغة JSON فقط بدون أي نص إضافي:
الرابط: ${input.storeUrl}

الصيغة المطلوبة:
{
  "items": [
    {
      "name": "اسم منتج عربي جذاب وواضح يفهمه العميل",
      "category": "${targetCategory}",
      "costPriceSar": 950,
      "originalExtractedPrice": "السعر المصدر",
      "description": "وصف تسويقي عربي واضح ومقنع للعميل",
      "images": ["https://..."],
      "sourceUrl": "${input.storeUrl}",
      "specs": [{"label": "نوع المحرك", "value": "ديزل / بنزين"}]
    }
  ]
}`,
      config: {
        tools: [{ urlContext: {} }, { googleSearch: {} }],
      },
    });

    const rawText = (response.text ?? '').trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { items?: typeof rawItems };
        if (Array.isArray(parsed.items)) rawItems = parsed.items;
      } catch {
        // fallback below
      }
    }
  }

  if (rawItems.length === 0) {
    rawItems = [
      {
        name: `${input.targetProductHint} — إصدار مطوّر عالي الكفاءة`,
        category: targetCategory,
        costPriceSar: 980,
        originalExtractedPrice: 'مسحوب من المتجر المصدر',
        description: `منتج مشابه لـ ${input.targetProductHint} مهيأ بصياغة عربية واضحة، جاهز لمراجعة السعر وتحسين الصورة قبل النشر للعملاء.`,
        images: signals?.foundImages?.slice(0, 2) || [],
        specs: [
          { label: 'الفئة المستهدفة', value: input.targetProductHint },
          { label: 'الجودة', value: 'معيار مصنع مطابق للفحص الدوري' },
        ],
        sourceUrl: input.storeUrl,
      },
    ];
  }

  return rawItems.slice(0, 6).map((item, idx) => {
    const cost = Number(item.costPriceSar) > 20 ? Math.round(Number(item.costPriceSar)) : 950 + idx * 140;
    const sellingPrice = Math.max(cost + 1, Math.round(cost * (1 + marginPct / 100) + extraSar));
    const compareAt = Math.round(sellingPrice * 1.18);
    const cleanedImages = Array.isArray(item.images)
      ? item.images.filter((u) => typeof u === 'string' && u.startsWith('http'))
      : [];
    const fallbackPool = signals?.foundImages?.filter((u) => u.startsWith('http')) || [];
    const resolvedImages =
      cleanedImages.length > 0
        ? cleanedImages
        : fallbackPool.length > 0
          ? [fallbackPool[idx % fallbackPool.length]]
          : [defaultStudioFallbackImage(`${item.name || ''} ${item.category || targetCategory}`)];

    return {
      name: item.name?.trim() || `${input.targetProductHint} #${idx + 1}`,
      category: item.category?.trim() || targetCategory,
      costPriceSar: cost,
      priceSar: sellingPrice,
      compareAtPriceSar: compareAt,
      originalExtractedPrice: item.originalExtractedPrice || `${cost} ر.س (تقدير المصدر)`,
      description:
        item.description?.trim() ||
        'وصف احترافي جاهز للمراجعة والتعديل قبل النشر في واجهة المتجر.',
      images: resolvedImages,
      specs:
        Array.isArray(item.specs) && item.specs.length > 0
          ? item.specs
          : [{ label: 'النوع', value: input.targetProductHint }],
      sourceUrl: item.sourceUrl?.startsWith('http') ? item.sourceUrl : input.storeUrl,
      profitMarginPercent: marginPct,
    };
  });
}

export async function enhanceProductCopyWithAi(input: {
  name: string;
  category: string;
  description?: string;
  priceSar?: number;
}): Promise<{
  name: string;
  description: string;
  badgeText: string;
  seoKeywords: string[];
  specs: ProductSpec[];
}> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `أنت خبير تسويق وكتابة إعلانية للمتاجر السعودية (متخصص في دبات التلوث للديزل والبنزين وقطع السيارات الفاخرة).
حسّن عنوان ووصف المنتج التالي ليصبح جذاباً جداً وواضحاً يفهمه العميل من النظرة الأولى ويزيد الرغبة في الشراء:
الاسم الحالي: ${input.name}
القسم: ${input.category}
السعر: ${input.priceSar || 1200} ريال سعودي
الوصف الحالي: ${input.description || 'لا يوجد وصف مفصل بعد'}

المطلوب بصيغة JSON:
- name: اسم منتج عربي جذاب ومفهوم للعميل (يذكر النوع والميزة بوضوح).
- description: وصف تسويقي سلس ومقنع يوضح للعميل التوافق والجودة والضمان.
- badgeText: شارة قصيرة جداً من 3 إلى 5 كلمات للوضع على صورة المنتج (مثال: ضمان الفحص الدوري · Euro-6).
- seoKeywords: 6 كلمات مفتاحية عربية قوية.
- specs: 3 إلى 4 مواصفات فنية واضحة (label و value).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          badgeText: { type: Type.STRING },
          seoKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          specs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING },
              },
              required: ['label', 'value'],
            },
          },
        },
        required: ['name', 'description', 'badgeText', 'seoKeywords', 'specs'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<{
    name: string;
    description: string;
    badgeText: string;
    seoKeywords: string[];
    specs: ProductSpec[];
  }>;

  return {
    name: parsed.name || input.name,
    description: parsed.description || input.description || '',
    badgeText: parsed.badgeText || 'جودة مصنعية · ضمان الكفاءة',
    seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [],
    specs: Array.isArray(parsed.specs) ? parsed.specs : [],
  };
}

export async function enhanceStoreIdentityWithAi(input: {
  storeName: string;
  storeTagline: string;
  heroTitle: string;
  focus?: string;
}): Promise<{
  storeName: string;
  storeTagline: string;
  heroTitle: string;
  heroSubtitle: string;
  suggestedCategoryName: string;
  suggestedCategoryDesc: string;
}> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `أنت خبير بناء علامات تجارية فاخرة في السعودية.
حسّن اسم المتجر والعناوين الترحيبية لتكون جذابة وواضحة للعميل السعودي وتزيد الثقة والمبيعات:
الاسم الحالي: ${input.storeName}
الوصف المختصر: ${input.storeTagline}
العنوان الترحيبي الحالي: ${input.heroTitle}
توجه المالك: ${input.focus || 'متجر فاخر متخصص في دبات التلوث للديزل والبنزين'}

أعد بصيغة JSON:
- storeName: اسم متجر عربي ملكي فخم ومميز.
- storeTagline: سطر تعريفي مختصر واضح للعميل.
- heroTitle: عنوان رئيسي جذاب جداً لصفحة الهبوط.
- heroSubtitle: سطر وصفي يشرح قيمة المتجر للعميل بوضوح.
- suggestedCategoryName: اسم قسم إضافي مقترح ومفيد للمتجر.
- suggestedCategoryDesc: وصف قصير للقسم المقترح.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storeName: { type: Type.STRING },
          storeTagline: { type: Type.STRING },
          heroTitle: { type: Type.STRING },
          heroSubtitle: { type: Type.STRING },
          suggestedCategoryName: { type: Type.STRING },
          suggestedCategoryDesc: { type: Type.STRING },
        },
        required: [
          'storeName',
          'storeTagline',
          'heroTitle',
          'heroSubtitle',
          'suggestedCategoryName',
          'suggestedCategoryDesc',
        ],
      },
    },
  });

  return JSON.parse((response.text ?? '{}').trim());
}

export async function generateProductSeoData(
  product: Product,
  storeName: string
): Promise<{
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  schemaMarkup: Record<string, unknown>;
}> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `أنت خبير تحسين محركات البحث (SEO) في السوق السعودي والخليجي. قم بتوليد بيانات SEO عالية التنافسية لمنتج في متجر "${storeName}":
اسم المنتج: ${product.name}
التصنيف: ${product.category}
السعر: ${product.priceSar} ريال سعودي
الوصف: ${product.description}

المطلوب:
- seoTitle: عنوان SEO عربي جذاب بين 40 و 60 حرفاً.
- seoDescription: وصف ميتا بين 120 و 160 حرفاً يشجع على الشراء بالريال السعودي.
- seoKeywords: مصفوفة من 8 كلمات مفتاحية عربية عالية البحث في جوجل السعودية.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          seoTitle: { type: Type.STRING },
          seoDescription: { type: Type.STRING },
          seoKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['seoTitle', 'seoDescription', 'seoKeywords'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string[];
  };

  const seoTitle = parsed.seoTitle || `${product.name} | ${storeName}`;
  const seoDescription = parsed.seoDescription || product.description.slice(0, 155);
  const seoKeywords = parsed.seoKeywords ?? [product.name, product.category, 'دبات تلوث السعودية'];

  const schemaMarkup: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: seoDescription,
    category: product.category,
    image: product.images,
    brand: {
      '@type': 'Brand',
      name: storeName,
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'SAR',
      price: product.priceSar,
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  return { seoTitle, seoDescription, seoKeywords, schemaMarkup };
}

export async function generateAdsAndBanner(input: {
  storeName: string;
  product?: Product | null;
  campaignGoal?: string;
}): Promise<GeneratedAdsCampaign> {
  const ai = getAiClient();
  const contextText = input.product
    ? `المنتج المستهدف: ${input.product.name} - السعر: ${input.product.priceSar} ر.س - التصنيف: ${input.product.category} - الوصف: ${input.product.description}`
    : `حملة عامة لمتجر "${input.storeName}" لإنتاج دبات التلوث للديزل والبنزين`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `أنت مدير تسويق رقمي متخصص في إعلانات جوجل (Google Ads) في السعودية.
${contextText}
الهدف الإعلاني: ${input.campaignGoal || 'زيادة المبيعات واستهداف أصحاب السيارات وورش العادم في السعودية'}

المطلوب بصيغة JSON:
- googleAdsHeadlines: 5 عناوين لإعلانات بحث جوجل باللغة العربية (قصيرة ومباشرة حتى 30 حرفاً).
- googleAdsDescriptions: 3 أوصاف إعلانية جذابة باللغة العربية (حتى 90 حرفاً) تبرز الجودة والريال السعودي.
- googleAdsKeywords: 10 كلمات مفتاحية مستهدفة لـ Google Ads.
- banner: بنر ترويجي جاهز للنشر داخل المتجر يحتوي على title و subtitle و ctaText و discountLabel و accentColor (لون ذهبي فاخر مثل #D4AF37).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          googleAdsHeadlines: { type: Type.ARRAY, items: { type: Type.STRING } },
          googleAdsDescriptions: { type: Type.ARRAY, items: { type: Type.STRING } },
          googleAdsKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          banner: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              subtitle: { type: Type.STRING },
              ctaText: { type: Type.STRING },
              discountLabel: { type: Type.STRING },
              accentColor: { type: Type.STRING },
            },
            required: ['title', 'subtitle', 'ctaText', 'discountLabel', 'accentColor'],
          },
        },
        required: ['googleAdsHeadlines', 'googleAdsDescriptions', 'googleAdsKeywords', 'banner'],
      },
    },
  });

  return JSON.parse((response.text ?? '{}').trim()) as GeneratedAdsCampaign;
}

// ===================================================
// OWNER PERSONAL AI ASSISTANT (GEMINI FUNCTION CALLING)
// ===================================================

const assistantToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_store_updates_and_alerts',
    description:
      'يعرض قائمة جميع المنتجات (المنشورة والمسودات السرية)، الطلبات الجديدة، والتنبيهات الذكية الحالية مع تقرير آخر التحديثات الجاهز لإرساله لواتساب المالك.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'add_new_product',
    description:
      'يضيف منتجاً جديداً إلى قاعدة بيانات المتجر (مثل دبة تلوث ديزل أو بنزين أو فلتر بيئة).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'الاسم الكامل للمنتج بالعربية' },
        category: {
          type: Type.STRING,
          description: 'التصنيف مثل دبات تلوث البنزين أو دبات تلوث الديزل أو قلوب وحشوات السيراميك',
        },
        priceSar: { type: Type.NUMBER, description: 'السعر بالريال السعودي' },
        description: { type: Type.STRING, description: 'وصف احترافي للمنتج' },
        isPublished: {
          type: Type.BOOLEAN,
          description: 'true للنشر فوراً في المتجر أو false للحفظ كمسودة خاصة للمالك',
        },
        specs: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              value: { type: Type.STRING },
            },
            required: ['label', 'value'],
          },
        },
      },
      required: ['name', 'category', 'priceSar', 'description'],
    },
  },
  {
    name: 'update_existing_product',
    description:
      'يعدّل بيانات منتج موجود (السعر، الاسم، الوصف، حالة التوفر في المخزون، أو النشر/الإخفاء) بالبحث عبر المعرّف أو جزء من اسم المنتج.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        searchQuery: { type: Type.STRING, description: 'معرّف المنتج أو جزء من اسمه' },
        newName: { type: Type.STRING },
        newPriceSar: { type: Type.NUMBER },
        newDescription: { type: Type.STRING },
        inStock: { type: Type.BOOLEAN },
        isPublished: { type: Type.BOOLEAN },
      },
      required: ['searchQuery'],
    },
  },
  {
    name: 'delete_product_by_name_or_id',
    description: 'يحذف منتجاً من المتجر بناءً على المعرّف أو الاسم.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        searchQuery: { type: Type.STRING, description: 'معرّف المنتج أو اسمه' },
      },
      required: ['searchQuery'],
    },
  },
  {
    name: 'update_store_identity',
    description: 'يعدّل اسم المتجر أو الوصف المختصر أو العنوان الترحيبي في الواجهة.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        storeName: { type: Type.STRING, description: 'اسم المتجر الجديد' },
        storeTagline: { type: Type.STRING, description: 'الوصف المختصر الجديد' },
        heroTitle: { type: Type.STRING, description: 'العنوان الترحيبي الرئيسي الجديد' },
      },
    },
  },
  {
    name: 'add_store_category',
    description: 'يضيف قسماً (تصنيفاً) جديداً إلى أقسام المتجر الرئيسية.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'اسم القسم الجديد بالعربية' },
        description: { type: Type.STRING, description: 'وصف قصير للقسم' },
      },
      required: ['name'],
    },
  },
];

function findProductMatch(query: string): Product | undefined {
  const q = query.trim().toLowerCase();
  const all = getAllProductsAdmin();
  return (
    all.find((p) => p.id.toLowerCase() === q) ||
    all.find((p) => p.name.toLowerCase().includes(q)) ||
    all.find((p) => p.category.toLowerCase().includes(q))
  );
}

export async function runOwnerAssistantTurn(userMessage: string): Promise<{
  reply: string;
  actionsExecuted: string[];
  whatsappAlertText?: string;
  mutatedStorefront: boolean;
}> {
  const ai = getAiClient();
  const settings = getAdminSettings();
  const actionsExecuted: string[] = [];
  let mutatedStorefront = false;
  let whatsappAlertText: string | undefined;

  const systemInstruction = `أنت المساعد الشخصي الذكي لمالك متجر "${settings.storeName}" (المتخصص في إنتاج دبات التلوث للديزل والبنزين).
مهامك:
1. تنبيه المالك على حالة المنتجات (المنتجات غير المتوفرة، المسودات السرية، والطلبات الجديدة).
2. إضافة منتجات جديدة وتعديل المنتجات الحالية أو نشرها/إخفاؤها باستخدام الأدوات المتاحة لك فوراً عند طلب المالك.
3. تزويد المالك بآخر التحديثات وتجهيز ملخص واتساب احترافي لإرساله إلى رقمه الشخصي.
تحدث دائماً باللغة العربية بأسلوب عملي ومباشر ومهني.`;

  const response1 = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: assistantToolDeclarations }],
    },
  });

  const calls = response1.functionCalls;
  if (!calls || calls.length === 0) {
    const { whatsappDigestText } = getOwnerAlertsAndDigest();
    return {
      reply: response1.text || 'تم استلام طلبك. كيف أساعدك في إدارة المتجر؟',
      actionsExecuted,
      whatsappAlertText: userMessage.includes('واتساب') || userMessage.includes('تحديث')
        ? whatsappDigestText
        : undefined,
      mutatedStorefront,
    };
  }

  const functionResponseParts = [];
  for (const call of calls) {
    const args = (call.args || {}) as Record<string, unknown>;
    let toolResult: Record<string, unknown> = {};

    if (call.name === 'get_store_updates_and_alerts') {
      const { alerts, whatsappDigestText } = getOwnerAlertsAndDigest();
      const products = getAllProductsAdmin().map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priceSar: p.priceSar,
        inStock: p.inStock,
        isPublished: p.isPublished,
      }));
      const orders = getAllOrdersAdmin().slice(0, 10);
      whatsappAlertText = whatsappDigestText;
      actionsExecuted.push('جلب آخر التحديثات والتنبيهات');
      toolResult = { alerts, products, recentOrders: orders, whatsappDigestText };
    } else if (call.name === 'add_new_product') {
      const cat = String(args.category || 'دبات تلوث البنزين');
      const fallbackImg = cat.includes('ديزل')
        ? '/src/assets/images/product_diesel_dpf_1794821492144.jpg'
        : cat.includes('سيراميك')
          ? '/src/assets/images/product_ceramic_core_1794821493246.jpg'
          : '/src/assets/images/product_gasoline_cat_1794821493329.jpg';

      const created = createProduct({
        id: `prod-${crypto.randomUUID().slice(0, 8)}`,
        name: String(args.name || 'دبة تلوث جديدة'),
        category: cat,
        priceSar: Number(args.priceSar) > 0 ? Number(args.priceSar) : 1200,
        description: String(args.description || ''),
        images: [fallbackImg],
        specs: Array.isArray(args.specs) ? (args.specs as ProductSpec[]) : [],
        inStock: true,
        isPublished: args.isPublished !== false,
        createdAt: new Date().toISOString(),
      });
      mutatedStorefront = true;
      actionsExecuted.push(`إضافة منتج: ${created.name} (${created.priceSar} ر.س)`);
      const { whatsappDigestText } = getOwnerAlertsAndDigest();
      whatsappAlertText = `تنبيه المساعد الشخصي:\nتمت إضافة منتج جديد:\n• ${created.name}\n• السعر: ${created.priceSar} ر.س\n• الحالة: ${created.isPublished ? 'منشور في المتجر' : 'مسودة مخفية'}\n\n${whatsappDigestText}`;
      await notifyOwnerWebhookIfConfigured('ai_add_product', whatsappAlertText);
      toolResult = { success: true, product: created };
    } else if (call.name === 'update_existing_product') {
      const match = findProductMatch(String(args.searchQuery || ''));
      if (!match) {
        toolResult = { success: false, error: 'لم يتم العثور على منتج مطابق.' };
      } else {
        const patch: Partial<Product> = {};
        if (typeof args.newName === 'string' && args.newName.trim()) patch.name = args.newName.trim();
        if (typeof args.newPriceSar === 'number' && args.newPriceSar > 0)
          patch.priceSar = args.newPriceSar;
        if (typeof args.newDescription === 'string' && args.newDescription.trim())
          patch.description = args.newDescription.trim();
        if (typeof args.inStock === 'boolean') patch.inStock = args.inStock;
        if (typeof args.isPublished === 'boolean') patch.isPublished = args.isPublished;

        const updated = updateProduct(match.id, patch);
        mutatedStorefront = true;
        actionsExecuted.push(`تعديل منتج: ${updated?.name || match.name}`);
        whatsappAlertText = `تنبيه المساعد الشخصي:\nتم تحديث المنتج: ${updated?.name}\nالسعر: ${updated?.priceSar} ر.س\nالحالة: ${updated?.isPublished ? 'منشور' : 'مسودة مخفية'} | ${updated?.inStock ? 'متوفر' : 'نفد المخزون'}`;
        await notifyOwnerWebhookIfConfigured('ai_update_product', whatsappAlertText);
        toolResult = { success: true, product: updated };
      }
    } else if (call.name === 'delete_product_by_name_or_id') {
      const match = findProductMatch(String(args.searchQuery || ''));
      if (!match) {
        toolResult = { success: false, error: 'المنتج غير موجود.' };
      } else {
        deleteProduct(match.id);
        mutatedStorefront = true;
        actionsExecuted.push(`حذف منتج: ${match.name}`);
        toolResult = { success: true, deletedName: match.name };
      }
    } else if (call.name === 'update_store_identity') {
      const patch: Record<string, string> = {};
      if (typeof args.storeName === 'string' && args.storeName.trim()) {
        patch.storeName = args.storeName.trim();
      }
      if (typeof args.storeTagline === 'string' && args.storeTagline.trim()) {
        patch.storeTagline = args.storeTagline.trim();
      }
      if (typeof args.heroTitle === 'string' && args.heroTitle.trim()) {
        patch.heroTitle = args.heroTitle.trim();
      }
      if (Object.keys(patch).length > 0) {
        const updatedSettings = updateSettings(patch);
        mutatedStorefront = true;
        actionsExecuted.push(`تحديث هوية المتجر إلى: ${updatedSettings.storeName}`);
        toolResult = { success: true, settings: updatedSettings };
      } else {
        toolResult = { success: false, error: 'لم يتم تمرير قيم جديدة لتحديث المتجر.' };
      }
    } else if (call.name === 'add_store_category') {
      const catName = String(args.name || '').trim();
      if (!catName) {
        toolResult = { success: false, error: 'اسم القسم مطلوب.' };
      } else {
        const current = getAdminSettings();
        const existing = current.categories || [];
        if (existing.some((c) => c.name === catName)) {
          toolResult = { success: false, error: 'هذا القسم موجود بالفعل.' };
        } else {
          const newCat = {
            id: `cat-${crypto.randomUUID().slice(0, 6)}`,
            name: catName,
            description: String(args.description || '').trim(),
            isActive: true,
          };
          updateSettings({ categories: [...existing, newCat] });
          mutatedStorefront = true;
          actionsExecuted.push(`إضافة قسم جديد: ${catName}`);
          toolResult = { success: true, category: newCat };
        }
      }
    }

    functionResponseParts.push({
      functionResponse: {
        id: call.id,
        name: call.name,
        response: toolResult,
      },
    });
  }

  const previousContent = response1.candidates?.[0]?.content;
  if (!previousContent) {
    return {
      reply: actionsExecuted.join(' · ') || 'تم تنفيذ المطلوب.',
      actionsExecuted,
      whatsappAlertText,
      mutatedStorefront,
    };
  }

  const response2 = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      { role: 'user', parts: [{ text: userMessage }] },
      previousContent,
      { role: 'user', parts: functionResponseParts },
    ],
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: assistantToolDeclarations }],
    },
  });

  return {
    reply: response2.text || actionsExecuted.join(' · ') || 'تم تنفيذ العملية بنجاح.',
    actionsExecuted,
    whatsappAlertText,
    mutatedStorefront,
  };
}

export async function optimizeBackgroundWithAi(params: {
  target: 'site' | 'hero';
  mediaType: 'video' | 'animated_image' | 'image';
  url?: string;
  styleHint?: string;
}): Promise<{
  recommendedOpacity: number;
  recommendedMotion: 'none' | 'kenburns' | 'float' | 'pulse';
  cssFilter: string;
  resolvedUrl: string;
  explanationAr: string;
}> {
  const ai = getAiClient();
  const settings = getAdminSettings();
  const fallbackUrl =
    params.mediaType === 'video'
      ? '/videos/showcase-1.mp4'
      : '/src/assets/images/hero_catalytic_gold_1794821492784.jpg';
  const resolvedUrl = params.url?.trim() || fallbackUrl;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `أنت مصمم تجربة مستخدم فاخرة لمتجر "${settings.storeName}" باللون الأسود الملكي (${settings.backgroundColor}) والذهبي (${settings.primaryGoldColor}).
يريد المالك ضبط خلفية ${params.target === 'site' ? 'عامة لكامل الموقع' : 'صفحة الهبوط الترحيبية'} من نوع (${params.mediaType === 'video' ? 'مقطع فيديو' : params.mediaType === 'animated_image' ? 'صورة متحركة / GIF' : 'صورة ثابتة'}).
رابط الوسائط: ${resolvedUrl}
توجيه المالك (اختياري): ${params.styleHint || 'إبراز الفخامة الذهبية والحفاظ على وضوح النصوص والمنتجات'}

حدد القيم المثالية بصيغة JSON:
- recommendedOpacity: رقم بين 0.12 و 0.55 (للخلفية العامة يفضل 0.16-0.32 وللهيرو 0.35-0.55)
- recommendedMotion: أحد القيم ('kenburns' | 'float' | 'pulse' | 'none') — استخدم 'none' لمقاطع الفيديو لأن الفيديو متحرك أصلاً، واستخدم 'kenburns' أو 'float' أو 'pulse' للصور المتحركة.
- cssFilter: فلتر CSS متوافق مع المتصفحات مثل "brightness(0.76) contrast(1.14) saturate(1.18)" يوازن الإضاءة مع الذهبي والأسود.
- explanationAr: شرح عربي موجز ومقنع من سطرين يوضح التحسينات التي تم تطبيقها.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedOpacity: { type: Type.NUMBER },
            recommendedMotion: { type: Type.STRING },
            cssFilter: { type: Type.STRING },
            explanationAr: { type: Type.STRING },
          },
          required: [
            'recommendedOpacity',
            'recommendedMotion',
            'cssFilter',
            'explanationAr',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      recommendedOpacity?: number;
      recommendedMotion?: string;
      cssFilter?: string;
      explanationAr?: string;
    };

    const allowedMotions = new Set(['none', 'kenburns', 'float', 'pulse']);
    const motion =
      params.mediaType === 'video'
        ? 'none'
        : allowedMotions.has(String(parsed.recommendedMotion))
          ? (parsed.recommendedMotion as 'none' | 'kenburns' | 'float' | 'pulse')
          : 'kenburns';

    const opacityRaw = Number(parsed.recommendedOpacity);
    const recommendedOpacity =
      Number.isFinite(opacityRaw) && opacityRaw >= 0.1 && opacityRaw <= 0.65
        ? Number(opacityRaw.toFixed(2))
        : params.target === 'site'
          ? 0.24
          : 0.45;

    return {
      recommendedOpacity,
      recommendedMotion: motion,
      cssFilter:
        parsed.cssFilter && parsed.cssFilter.length < 90
          ? parsed.cssFilter
          : 'brightness(0.78) contrast(1.12) saturate(1.15)',
      resolvedUrl,
      explanationAr:
        parsed.explanationAr ||
        'تمت معايرة الشفافية والتباين واللون الذهبي بالذكاء الاصطناعي لضمان فخامة التصميم ووضوح النصوص.',
    };
  } catch {
    return {
      recommendedOpacity: params.target === 'site' ? 0.24 : 0.45,
      recommendedMotion: params.mediaType === 'video' ? 'none' : 'kenburns',
      cssFilter: 'brightness(0.78) contrast(1.12) saturate(1.15)',
      resolvedUrl,
      explanationAr:
        'تمت تهيئة الشفافية والتباين السينمائي للخلفية تلقائياً لتتلاءم مع الهوية الملكية.',
    };
  }
}

export async function translateProductToEnglishWithAi(input: {
  name: string;
  description?: string;
  category?: string;
}): Promise<{ nameEn: string; descriptionEn: string }> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Translate the following Arabic automotive catalytic converter / DPF product into natural, professional commercial English for an e-commerce storefront:
Category: ${input.category || 'Catalytic Converters'}
Arabic Name: ${input.name}
Arabic Description: ${input.description || ''}

Return JSON with:
- nameEn: concise clear English product title.
- descriptionEn: professional English product description highlighting materials, Euro compliance, and fitment.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          nameEn: { type: Type.STRING },
          descriptionEn: { type: Type.STRING },
        },
        required: ['nameEn', 'descriptionEn'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    nameEn?: string;
    descriptionEn?: string;
  };
  return {
    nameEn: parsed.nameEn?.trim() || input.name,
    descriptionEn: parsed.descriptionEn?.trim() || input.description || '',
  };
}

export interface ImportedProductFromUrlResult {
  name: string;
  nameEn: string;
  category: string;
  priceSar: number;
  originalExtractedPrice: string;
  description: string;
  descriptionEn: string;
  images: string[];
  specs: ProductSpec[];
}

export interface ImportProductWithAiResponse {
  blockedByProtection?: boolean;
  warningMessage?: string;
  product: ImportedProductFromUrlResult | null;
}

function isProtectedOrBlockedPage(html: string): boolean {
  const lower = html.toLowerCase();
  const blockMarkers = [
    'cf-browser-verification',
    'challenge-platform',
    'just a moment...',
    'enable javascript and cookies to continue',
    'enter the characters you see below',
    'type the characters you see in this image',
    'sorry, we just need to make sure you\'re not a robot',
    'robot check',
    'captcha-delivery',
    'px-captcha',
    'access to this page has been denied',
    'attention required! | cloudflare',
    'punish-captcha',
  ];
  const hasMarker = blockMarkers.some((m) => lower.includes(m));
  if (hasMarker) return true;
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length < 140;
}

function extractImageUrlsFromRawText(rawText: string): string[] {
  const matches = rawText.match(/https?:\/\/[^\s"'<>()]+?\.(?:png|jpe?g|webp|avif)(?:\?[^\s"'<>()]*)?/gi) || [];
  return Array.from(new Set(matches.map((u) => u.trim())))
    .filter((u) => !/icon|logo|avatar|sprite|pixel|1x1/i.test(u))
    .slice(0, 12);
}

export async function importProductFromUrlWithHtml(input: {
  url?: string;
  htmlContent?: string;
  rawText?: string;
  categories?: string[];
}): Promise<ImportProductWithAiResponse> {
  const ai = getAiClient();
  const cleanUrl = (input.url || '').trim();
  const cleanRawText = (input.rawText || '').trim();
  const categoryList =
    input.categories && input.categories.length > 0
      ? input.categories
      : ['دبات تلوث البنزين', 'دبات تلوث الديزل', 'حساسات الشكمان والأكسجين', 'وصلات وملحقات العادم'];

  // Method 2: Manual pasted product text/details (for protected websites or direct paste)
  if (cleanRawText.length >= 15) {
    const textImages = extractImageUrlsFromRawText(cleanRawText);
    const prompt = `أنت خبير تجارة إلكترونية فاخرة ومترجم تقني محترف. قام مالك المتجر بنسخ ولصق تفاصيل/نص منتج من متجر خارجي، والمطلوب تحليل النص وتحويله إلى بيانات منتج احترافية جاهزة للنشر في المتجر باللغة العربية وبالريال السعودي (SAR):
${cleanUrl ? `الرابط المرجعي (اختياري): ${cleanUrl}` : ''}
الأقسام المتاحة في المتجر (اختر أنسب قسم منها): ${JSON.stringify(categoryList)}
روابط الصور المكتشفة في النص (إن وجدت): ${JSON.stringify(textImages)}
النص والتفاصيل الملصقة:
"""
${cleanRawText.slice(0, 18000)}
"""

المطلوب بدقة:
1. name: اسم المنتج (Product Name) مترجماً ومصاغاً باللغة العربية بشكل احترافي وجذاب يبرز جودة القطعة أو توافقها.
2. nameEn: اسم المنتج التجاري المختصر بالإنجليزية.
3. category: اختر القسم الأنسب للمنتج من قائمة الأقسام المتاحة أعلاه.
4. priceSar: السعر الرقمي التقريبي بالريال السعودي (رقم صحيح موجب؛ وإذا كان السعر بعملة أجنبية مثل USD أو EUR فحوّله للريال السعودي).
5. originalExtractedPrice: نص السعر الأصلي كما ورد في النص (أو "حسب النص" إذا لم يُذكر بوضوح).
6. description: الوصف التفصيلي والمميزات باللغة العربية بأسلوب تسويقي احترافي ومنسق يشرح الفوائد والمواصفات.
7. descriptionEn: وصف موجز احترافي بالإنجليزية.
8. images: مصفوفة روابط الصور عالية الجودة المستخرجة من النص إن وجدت (تبدأ بـ http).
9. specs: مصفوفة مواصفات فنية منسقة {label, value} باللغة العربية مستخلصة من النص.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            nameEn: { type: Type.STRING },
            category: { type: Type.STRING },
            priceSar: { type: Type.NUMBER },
            originalExtractedPrice: { type: Type.STRING },
            description: { type: Type.STRING },
            descriptionEn: { type: Type.STRING },
            images: { type: Type.ARRAY, items: { type: Type.STRING } },
            specs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ['label', 'value'],
              },
            },
          },
          required: [
            'name',
            'nameEn',
            'category',
            'priceSar',
            'originalExtractedPrice',
            'description',
            'descriptionEn',
            'images',
            'specs',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ImportedProductFromUrlResult>;
    const mergedImages = Array.from(
      new Set([...(parsed.images ?? []), ...textImages])
    )
      .filter((img) => typeof img === 'string' && /^https?:\/\//i.test(img.trim()))
      .slice(0, 12);

    return {
      product: {
        name: parsed.name?.trim() || 'منتج مستورد جديد',
        nameEn: parsed.nameEn?.trim() || '',
        category:
          parsed.category && categoryList.includes(parsed.category)
            ? parsed.category
            : categoryList[0],
        priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 590,
        originalExtractedPrice: parsed.originalExtractedPrice?.trim() || 'من النص الملصق',
        description: parsed.description?.trim() || cleanRawText.slice(0, 600),
        descriptionEn: parsed.descriptionEn?.trim() || '',
        images: mergedImages,
        specs: Array.isArray(parsed.specs) ? parsed.specs.filter((s) => s?.label && s?.value) : [],
      },
    };
  }

  // Method 1: Automated URL import (proxy HTML first, then direct server fetch)
  let signals: ReturnType<typeof extractHtmlSignals> | null = null;
  let detectedProtection = false;

  if (input.htmlContent && input.htmlContent.trim().length > 100) {
    if (isProtectedOrBlockedPage(input.htmlContent)) {
      detectedProtection = true;
    } else {
      signals = extractHtmlSignals(input.htmlContent, cleanUrl);
    }
  }

  if (
    !signals ||
    (signals.textSnippet.length < 100 && signals.jsonLd.length < 40 && signals.foundImages.length === 0)
  ) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const resp = await fetch(cleanUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);
      if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
        detectedProtection = true;
      } else if (resp.ok) {
        const directHtml = await resp.text();
        if (directHtml && isProtectedOrBlockedPage(directHtml)) {
          detectedProtection = true;
        } else if (directHtml && directHtml.length > 200) {
          signals = extractHtmlSignals(directHtml, cleanUrl);
        }
      } else {
        detectedProtection = true;
      }
    } catch {
      detectedProtection = true;
    }
  }

  if (signals && (signals.textSnippet.length > 80 || signals.jsonLd.length > 40 || signals.title.length > 5)) {
    const prompt = `أنت خبير تجارة إلكترونية فاخرة ومترجم تقني محترف. قم بتحليل محتوى صفحة المنتج المستخرجة من المتجر الخارجي وتحويله إلى بيانات منتج عربية احترافية متكاملة بالريال السعودي (SAR):
رابط المنتج: ${cleanUrl}
الأقسام المتاحة في المتجر (اختر أنسب قسم منها): ${JSON.stringify(categoryList)}
العنوان المستخرج: ${signals.title}
وصف الميتا: ${signals.metaDescription}
بيانات JSON-LD: ${signals.jsonLd}
روابط الصور المكتشفة: ${JSON.stringify(signals.foundImages)}
محتوى الصفحة النصي: ${signals.textSnippet}

المطلوب بدقة:
1. name: اسم المنتج (Product Name) مترجماً ومصاغاً باللغة العربية بشكل تسويقي احترافي وجذاب.
2. nameEn: اسم المنتج التجاري الواضح بالإنجليزية.
3. category: اختر القسم الأنسب من القائمة المتاحة أعلاه.
4. priceSar: السعر الرقمي التقريبي بالريال السعودي (رقم صحيح موجب؛ وإذا كان السعر بعملة أجنبية مثل USD أو EUR فحوّله للريال السعودي).
5. originalExtractedPrice: نص السعر الأصلي المكتشف في الصفحة كما ورد.
6. description: الوصف التفصيلي والمميزات باللغة العربية بأسلوب تسويقي ومقنع يشرح الجودة والاستخدام.
7. descriptionEn: وصف موجز احترافي بالإنجليزية.
8. images: مصفوفة بجميع روابط الصور عالية الجودة للمنتج (تبدأ بـ http ولا تشمل الأيقونات أو الشعارات الصغيرة).
9. specs: مصفوفة مواصفات فنية منسقة {label, value} باللغة العربية.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            nameEn: { type: Type.STRING },
            category: { type: Type.STRING },
            priceSar: { type: Type.NUMBER },
            originalExtractedPrice: { type: Type.STRING },
            description: { type: Type.STRING },
            descriptionEn: { type: Type.STRING },
            images: { type: Type.ARRAY, items: { type: Type.STRING } },
            specs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ['label', 'value'],
              },
            },
          },
          required: [
            'name',
            'nameEn',
            'category',
            'priceSar',
            'originalExtractedPrice',
            'description',
            'descriptionEn',
            'images',
            'specs',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ImportedProductFromUrlResult>;
    const mergedImages = Array.from(
      new Set([...(parsed.images ?? []), ...(signals.foundImages ?? [])])
    )
      .filter((img) => typeof img === 'string' && /^https?:\/\//i.test(img.trim()))
      .slice(0, 12);

    return {
      product: {
        name: parsed.name?.trim() || signals.title || 'منتج مستورد جديد',
        nameEn: parsed.nameEn?.trim() || signals.title || '',
        category:
          parsed.category && categoryList.includes(parsed.category)
            ? parsed.category
            : categoryList[0],
        priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 590,
        originalExtractedPrice: parsed.originalExtractedPrice?.trim() || 'تقديري',
        description:
          parsed.description?.trim() || signals.metaDescription || 'تم استيراد بيانات المنتج بنجاح.',
        descriptionEn: parsed.descriptionEn?.trim() || '',
        images: mergedImages,
        specs: Array.isArray(parsed.specs) ? parsed.specs.filter((s) => s?.label && s?.value) : [],
      },
    };
  }

  // Site refused automated proxy and direct server fetch -> return clear protected-site signal
  if (detectedProtection || !signals) {
    return {
      blockedByProtection: true,
      warningMessage:
        'الموقع الخارجي محمي ضد السحب الآلي ورفض جلب البيانات من الرابط. يُنصح باستخدام "الطريقة الثانية (اللصق اليدوي)" أدناه: انسخ نص تفاصيل المنتج من صفحة المتجر والصقه ليقوم الذكاء الاصطناعي بتحليله وتعبئة جميع الحقول تلقائياً.',
      product: null,
    };
  }

  return {
    blockedByProtection: true,
    warningMessage:
      'تعذر سحب محتوى كافٍ من الرابط تلقائياً لأن الموقع محمي. يُرجى استخدام "الطريقة الثانية (اللصق اليدوي)" أدناه ولصق نص المنتج مباشرة.',
    product: null,
  };
}

export async function lookupVehicleCompatibilityWithSearch(input: {
  vehicle: string;
  questionOrCode?: string;
}): Promise<VehicleCompatibilityResult> {
  const ai = getAiClient();
  const vehicle = input.vehicle.trim().slice(0, 140);
  const questionOrCode = (input.questionOrCode || '').trim().slice(0, 240);

  const prompt = `أنت مستشار هندسي متخصص في أنظمة العادم ودبات التلوث (Catalytic Converters) وفلاتر الديزل (DPF) لدى مصنع التاج الذهبي في المملكة العربية السعودية.
ابحث باستخدام بحث Google عن المعلومات المحدثة والدقيقة الخاصة بالمركبة والاستفسار التالي:
- المركبة (النوع والموديل والسنة): ${vehicle}
- الاستفسار أو رمز الفحص (OBD): ${questionOrCode || 'تحديد معيار الانبعاثات ونوع دبة التلوث المناسبة للفحص الدوري'}

قدم إجابة عربية واضحة ومنظمة ومختصرة تشمل:
1. معيار الانبعاثات المرجح لهذه المركبة (مثل Euro 4 / Euro 5 / Euro 6) وهل نظامها بنزين أم ديزل (DPF / SCR).
2. شرح أي كود عطل مذكور (إن وجد مثل P0420 أو P2002) والسبب الأكثر شيوعاً له.
3. التوصية العملية لاجتياز الفحص الدوري السعودي (SASO / الفحص الدوري) واختيار قلب السيراميك أو المعدن المناسب أو التنظيف مقابل الاستبدال.

ملاحظة: اعتمد على نتائج البحث المحدثة واكتب الإجابة بوضوح بدون حشو.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const answer =
    (response.text ?? '').trim() ||
    'تعذر الحصول على تفاصيل كافية حالياً. يرجى تجربة تحديد نوع السيارة وسنة الصنع بدقة.';

  const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seenUris = new Set<string>();
  const sources: SearchGroundingSource[] = [];
  for (const chunk of rawChunks) {
    const uri = chunk.web?.uri?.trim();
    if (!uri || seenUris.has(uri)) continue;
    seenUris.add(uri);
    sources.push({
      uri,
      title: chunk.web?.title?.trim() || uri,
    });
    if (sources.length >= 6) break;
  }

  const catalog = getPublishedProducts();
  const haystack = `${vehicle} ${questionOrCode} ${answer}`.toLowerCase();
  const isDiesel =
    /ديزل|diesel|dpf|p2002|p2463|هايلكس|شاحن|فورد f|ايسوزو|isuzu|مرسيدس شاحنة/.test(haystack);

  const scored: { product: PublicProduct; score: number }[] = catalog.map((p) => {
    const pub = stripPrivateProductFields(p);
    const text = `${p.name} ${p.category} ${p.description}`.toLowerCase();
    let score = 0;
    if (isDiesel && (text.includes('ديزل') || text.includes('dpf'))) score += 4;
    if (!isDiesel && (text.includes('بنزين') || text.includes('يورو') || text.includes('سيراميك')))
      score += 3;
    for (const token of vehicle.toLowerCase().split(/\s+/)) {
      if (token.length >= 3 && text.includes(token)) score += 5;
    }
    if (p.inStock) score += 1;
    return { product: pub, score };
  });

  const recommendedProducts = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.product);

  return {
    answer,
    sources,
    recommendedProducts,
  };
}
