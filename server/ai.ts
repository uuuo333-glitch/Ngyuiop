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
  saveUploadedMedia,
  stripPrivateProductFields,
  updateProduct,
  updateSettings,
} from './db.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY غير مضبوط في متغيرات البيئة على الخادم.');
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

function safeParseAiJson<T>(rawText: string | undefined, fallback: T): T {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {
        // ignore
      }
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]) as T;
      } catch {
        // ignore
      }
    }
    return fallback;
  }
}

export async function generateProductSquareImageWithGemini(input: {
  name: string;
  category?: string;
  description?: string;
}): Promise<string> {
  const ai = getAiClient();
  const prompt = [
    `Create a high-end commercial studio product photograph in exact 1:1 square composition for e-commerce (1000x1000 aesthetic).`,
    `Product: ${input.name}`,
    input.category ? `Category: ${input.category}` : '',
    input.description ? `Details: ${input.description.slice(0, 320)}` : '',
    `Style requirements: Precision stainless-steel 304 automotive catalytic converter / exhaust DPF / platinum ceramic honeycombs or luxury automotive hardware centered in frame on a sleek matte dark obsidian studio pedestal (#09090B) with subtle warm brushed-gold rim lighting, ultra-sharp metallic reflections, crisp studio depth of field, NO text, NO watermark, NO logos, NO price tags.`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-image',
    contents: prompt,
    config: {
      imageConfig: {
        aspectRatio: '1:1',
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
      const safeName = `ai-product-${Date.now().toString(36)}.${ext}`;
      return saveUploadedMedia(safeName, mimeType, part.inlineData.data);
    }
  }

  throw new Error('لم يُرجِع نموذج Gemini صورة صالحة للمنتج.');
}

interface ScrapedProductResult {
  name: string;
  nameEn?: string;
  category: string;
  priceSar: number;
  originalExtractedPrice: string;
  description: string;
  descriptionEn?: string;
  images: string[];
  specs: ProductSpec[];
  seoKeywords?: string[];
  aiGeneratedImage?: boolean;
}

export function sanitizeAndNormalizeProductUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  let normalizedInput = trimmed;
  if (!/^https?:\/\//i.test(normalizedInput)) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(normalizedInput)) {
      normalizedInput = `https://${normalizedInput}`;
    } else {
      return trimmed;
    }
  }

  try {
    let parsed = new URL(normalizedInput);

    // Unwrap common tracking redirect query params if present
    for (const redirectParam of ['url', 'u', 'target', 'redirect', 'dest']) {
      const inner = parsed.searchParams.get(redirectParam);
      if (inner && /^https?:\/\//i.test(inner)) {
        try {
          parsed = new URL(inner);
          break;
        } catch {
          // keep outer
        }
      }
    }

    const hostLower = parsed.hostname.toLowerCase();

    // Canonicalize AliExpress mobile/localized links cleanly to avoid anti-bot redirect loops
    const aliItemMatch = parsed.pathname.match(/\/item\/(\d+)\.html/i) ||
      parsed.pathname.match(/\/i\/(\d+)\.html/i);
    if (hostLower.includes('aliexpress.') && aliItemMatch?.[1]) {
      const skuId = parsed.searchParams.get('skuId') || parsed.searchParams.get('sku_id');
      return skuId
        ? `https://www.aliexpress.com/item/${aliItemMatch[1]}.html?skuId=${encodeURIComponent(skuId)}`
        : `https://www.aliexpress.com/item/${aliItemMatch[1]}.html`;
    }

    // Canonicalize Amazon DP product links cleanly
    const amazonAsinMatch = parsed.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (hostLower.includes('amazon.') && amazonAsinMatch?.[1]) {
      return `${parsed.protocol}//${parsed.hostname}/dp/${amazonAsinMatch[1].toUpperCase()}`;
    }

    // Remove tracking / telemetry / affiliate query params while preserving meaningful IDs
    const trackingKeys = new Set([
      'spm',
      'pdp_npi',
      'pdp_ext_f',
      'algo_pvid',
      'algo_exp_id',
      'btsid',
      'ws_ab_test',
      'aff_fcid',
      'aff_fsk',
      'aff_platform',
      'aff_trace_key',
      'terminal_id',
      'sk',
      'srcsns',
      'spreadtype',
      'social_params',
      'biztype',
      'gatewayadapt',
      'fbclid',
      'gclid',
      'gbraid',
      'wbraid',
      'mc_cid',
      'mc_eid',
      'igshid',
      'ref',
      'ref_',
      'tag',
      'linkcode',
      'camp',
      'creative',
      'th',
      'psc',
      '_t',
      'tt',
      'curpageLogUid',
      'curpageloguid',
      'utparam-url',
      'scm',
      'scm_id',
      'scm-url',
      'pvid',
      'gps-id',
      'tdsourcetag',
    ]);

    const cleanParams = new URLSearchParams();
    for (const [k, v] of parsed.searchParams.entries()) {
      const kl = k.toLowerCase();
      if (kl.startsWith('utm_') || kl.startsWith('aff_') || kl.startsWith('pdp_') || trackingKeys.has(kl)) {
        continue;
      }
      cleanParams.append(k, v);
    }

    parsed.search = cleanParams.toString() ? `?${cleanParams.toString()}` : '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

const CURRENCY_TO_SAR_RATES: Record<string, number> = {
  SAR: 1,
  SR: 1,
  USD: 3.75,
  EUR: 4.08,
  GBP: 4.78,
  CNY: 0.52,
  RMB: 0.52,
  JPY: 0.025,
  AED: 1.021,
  KWD: 12.22,
  QAR: 1.03,
  BHD: 9.95,
  OMR: 9.75,
  TRY: 0.11,
  EGP: 0.077,
};

function convertCurrencyAmountToSar(amount: number, currencyHint?: string): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const c = (currencyHint || '').toUpperCase().trim();
  let rate = 3.75; // Default to USD for international marketplaces when symbol isn't SAR
  if (!c || c === 'SAR' || c === 'ر.س' || c === 'SR' || c === 'ريال') {
    rate = 1;
  } else if (c.includes('USD') || c === '$' || c.includes('US$') || c.includes('US $')) {
    rate = CURRENCY_TO_SAR_RATES.USD;
  } else if (c.includes('CNY') || c.includes('RMB') || c === '¥' || c.includes('元')) {
    rate = CURRENCY_TO_SAR_RATES.CNY;
  } else if (c.includes('JPY') || c.includes('円')) {
    rate = CURRENCY_TO_SAR_RATES.JPY;
  } else if (c.includes('EUR') || c === '€') {
    rate = CURRENCY_TO_SAR_RATES.EUR;
  } else if (c.includes('GBP') || c === '£') {
    rate = CURRENCY_TO_SAR_RATES.GBP;
  } else if (c.includes('AED') || c.includes('د.إ')) {
    rate = CURRENCY_TO_SAR_RATES.AED;
  } else if (c.includes('KWD') || c.includes('د.ك')) {
    rate = CURRENCY_TO_SAR_RATES.KWD;
  } else if (c.includes('QAR') || c.includes('ر.ق')) {
    rate = CURRENCY_TO_SAR_RATES.QAR;
  } else if (c.includes('BHD') || c.includes('د.ب')) {
    rate = CURRENCY_TO_SAR_RATES.BHD;
  } else if (c.includes('OMR') || c.includes('ر.ع')) {
    rate = CURRENCY_TO_SAR_RATES.OMR;
  } else if (c.includes('TRY') || c === '₺') {
    rate = CURRENCY_TO_SAR_RATES.TRY;
  } else if (c.includes('EGP') || c.includes('ج.م')) {
    rate = CURRENCY_TO_SAR_RATES.EGP;
  }
  const converted = Math.round(amount * rate);
  return converted > 0 ? converted : null;
}

function normalizeExtractedImageUrl(raw: string, baseUrl: string): string | null {
  if (!raw) return null;
  let cleaned = raw.trim().replace(/&amp;/g, '&').replace(/^\/\//, 'https://');
  if (!cleaned || cleaned.startsWith('data:')) return null;
  // Upgrade AliExpress thumbnail URLs to full resolution
  if (cleaned.includes('alicdn.com')) {
    cleaned = cleaned.replace(/\.(jpg|jpeg|png|webp)_\d+x\d+[^/]*\.(?:jpg|jpeg|png|webp)/i, '.$1');
    cleaned = cleaned.replace(/_\d+x\d+[^/]*\.(?:jpg|jpeg|png|webp)/i, '.jpg');
    cleaned = cleaned.replace(/\.(jpg|jpeg|png)_\.webp$/i, '.$1');
  }
  try {
    const resolved = new URL(cleaned, baseUrl).toString();
    if (!/^https?:\/\//i.test(resolved)) return null;
    if (/icon|logo|avatar|sprite|pixel|1x1|favicon|\.svg(\?|$)|spacer|loading|placeholder/i.test(resolved)) {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
}

interface ExtractedPageSignals {
  title: string;
  metaDescription: string;
  jsonLd: string;
  textSnippet: string;
  foundImages: string[];
  detectedPriceText?: string;
  detectedPriceSar?: number;
}

function detectPriceHintFromText(text: string): { text?: string; sar?: number } {
  const patterns: Array<{ regex: RegExp; currency: string }> = [
    { regex: /(?:SAR|ر\.س\.?|ريال(?:\s*سعودي)?)\s*[:：]?\s*(\d{1,6}(?:[.,]\d{1,2})?)/i, currency: 'SAR' },
    { regex: /(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:SAR|ر\.س\.?|ريال(?:\s*سعودي)?)/i, currency: 'SAR' },
    { regex: /(?:US\s*\$|USD|\$)\s*(\d{1,5}(?:[.,]\d{1,2})?)/i, currency: 'USD' },
    { regex: /(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:USD|US\$)/i, currency: 'USD' },
    { regex: /(?:EUR|€)\s*(\d{1,5}(?:[.,]\d{1,2})?)/i, currency: 'EUR' },
    { regex: /(?:GBP|£)\s*(\d{1,5}(?:[.,]\d{1,2})?)/i, currency: 'GBP' },
    { regex: /(?:CNY|RMB|¥|元)\s*(\d{1,6}(?:[.,]\d{1,2})?)/i, currency: 'CNY' },
    { regex: /(?:AED|د\.إ)\s*(\d{1,6}(?:[.,]\d{1,2})?)/i, currency: 'AED' },
  ];

  for (const p of patterns) {
    const m = text.match(p.regex);
    if (m?.[1]) {
      const val = Number(m[1].replace(/,/g, ''));
      const sar = convertCurrencyAmountToSar(val, p.currency);
      if (sar && sar >= 5) {
        return { text: m[0].trim(), sar };
      }
    }
  }
  return {};
}

function extractHtmlSignals(html: string, baseUrl: string): ExtractedPageSignals {
  const images = new Set<string>();
  const addUrl = (raw?: string) => {
    if (!raw) return;
    const normalized = normalizeExtractedImageUrl(raw, baseUrl);
    if (normalized) images.add(normalized);
  };

  const ogTitleMatch = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i
  );
  const ogImgRegex =
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:secure_url)["'][^>]+content=["']([^"']+)["']/gi;
  for (const match of html.matchAll(ogImgRegex)) {
    addUrl(match[1]);
  }

  // Meta price hints
  const metaPriceAmount = html.match(
    /<meta[^>]+(?:property|itemprop|name)=["'](?:product:price:amount|og:price:amount|price)["'][^>]+content=["']([^"']+)["']/i
  )?.[1];
  const metaPriceCurrency = html.match(
    /<meta[^>]+(?:property|itemprop|name)=["'](?:product:price:currency|og:price:currency|priceCurrency)["'][^>]+content=["']([^"']+)["']/i
  )?.[1];

  // Extract AliExpress / JS hydration image lists & titles directly from HTML scripts
  const aliImageListMatch = html.match(/"imagePathList"\s*:\s*(\[[^\]]+\])/i);
  if (aliImageListMatch?.[1]) {
    try {
      const list = JSON.parse(aliImageListMatch[1]) as unknown[];
      for (const item of list) {
        if (typeof item === 'string') addUrl(item);
      }
    } catch {
      // ignore parse failure
    }
  }
  const alicdnMatches = html.match(/https?:\/\/[a-z0-9.-]*alicdn\.com\/kf\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)/gi) || [];
  for (const u of alicdnMatches.slice(0, 12)) {
    addUrl(u);
  }

  const aliSubject =
    html.match(/"subject"\s*:\s*"([^"]{8,300})"/i)?.[1] ||
    html.match(/"title"\s*:\s*"([^"]{10,300})"/i)?.[1] ||
    '';

  const aliFormattedPrice =
    html.match(/"formatedActivityPrice"\s*:\s*"([^"]{2,40})"/i)?.[1] ||
    html.match(/"formatedPrice"\s*:\s*"([^"]{2,40})"/i)?.[1] ||
    html.match(/"actSkuMultiCurrencyCalPrice"\s*:\s*"([^"]{1,30})"/i)?.[1] ||
    html.match(/"minActivityAmount"\s*:\s*\{[^}]*"value"\s*:\s*([0-9.]+)/i)?.[1] ||
    '';

  const imgTagRegex =
    /<img[^>]+(?:src|data-src|data-zoom-image|data-large_image|data-old-hires)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(imgTagRegex)) {
    addUrl(match[1]);
    if (images.size >= 14) break;
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const metaDescMatch = html.match(
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i
  );

  const jsonLdMatches = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ]
    .map((m) => m[1].trim())
    .slice(0, 4)
    .join('\n');

  // Extract JSON-LD images and offer price if available
  const ldImgMatches = jsonLdMatches.match(/https?:\/\/[^\s"',\]]+\.(?:png|jpe?g|webp)/gi) || [];
  for (const u of ldImgMatches.slice(0, 8)) addUrl(u);

  const plainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 7000);

  let detectedPriceText: string | undefined;
  let detectedPriceSar: number | undefined;
  if (metaPriceAmount && !Number.isNaN(Number(metaPriceAmount))) {
    const sar = convertCurrencyAmountToSar(Number(metaPriceAmount), metaPriceCurrency || 'USD');
    if (sar) {
      detectedPriceSar = sar;
      detectedPriceText = `${metaPriceAmount} ${metaPriceCurrency || 'USD'}`.trim();
    }
  }
  if (!detectedPriceSar && aliFormattedPrice) {
    const pHint = detectPriceHintFromText(aliFormattedPrice);
    if (pHint.sar) {
      detectedPriceSar = pHint.sar;
      detectedPriceText = pHint.text;
    } else if (!Number.isNaN(Number(aliFormattedPrice))) {
      const sar = convertCurrencyAmountToSar(Number(aliFormattedPrice), 'USD');
      if (sar) {
        detectedPriceSar = sar;
        detectedPriceText = `$${aliFormattedPrice}`;
      }
    }
  }
  if (!detectedPriceSar) {
    const pHint = detectPriceHintFromText(`${jsonLdMatches} ${plainText}`);
    detectedPriceSar = pHint.sar;
    detectedPriceText = pHint.text;
  }

  return {
    title: (ogTitleMatch?.[1] || aliSubject || titleMatch?.[1] || '').trim(),
    metaDescription: metaDescMatch?.[1]?.trim() ?? '',
    jsonLd: jsonLdMatches.slice(0, 3500),
    textSnippet: plainText,
    foundImages: Array.from(images).slice(0, 12),
    detectedPriceText,
    detectedPriceSar,
  };
}

function extractReaderSignals(markdownText: string, baseUrl: string): ExtractedPageSignals | null {
  const clean = (markdownText || '').trim();
  if (clean.length < 100) return null;

  const lower = clean.toLowerCase();
  if (
    lower.includes('captcha') &&
    lower.includes('slide to verify') &&
    clean.length < 700
  ) {
    return null;
  }

  const titleLine = clean.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ||
    clean.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    '';

  const images = new Set<string>();
  const mdImageRegex = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;
  for (const m of clean.matchAll(mdImageRegex)) {
    const norm = normalizeExtractedImageUrl(m[1], baseUrl);
    if (norm) images.add(norm);
    if (images.size >= 12) break;
  }
  const bareImages = clean.match(/https?:\/\/[^\s"'<>()]+\.(?:png|jpe?g|webp|avif)(?:\?[^\s"'<>()]*)?/gi) || [];
  for (const u of bareImages) {
    const norm = normalizeExtractedImageUrl(u, baseUrl);
    if (norm) images.add(norm);
    if (images.size >= 12) break;
  }

  const priceHint = detectPriceHintFromText(clean);

  return {
    title: titleLine,
    metaDescription: '',
    jsonLd: '',
    textSnippet: clean.slice(0, 8000),
    foundImages: Array.from(images).slice(0, 12),
    detectedPriceText: priceHint.text,
    detectedPriceSar: priceHint.sar,
  };
}

async function fetchExternalPageRobust(rawUrl: string): Promise<{
  cleanUrl: string;
  signals: ExtractedPageSignals | null;
  sawProtection: boolean;
}> {
  const cleanUrl = sanitizeAndNormalizeProductUrl(rawUrl);
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
    return { cleanUrl, signals: null, sawProtection: false };
  }

  let bestSignals: ExtractedPageSignals | null = null;
  let sawProtection = false;

  const browserHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: 'https://www.google.com/',
    'Upgrade-Insecure-Requests': '1',
  };

  // Layer 1: Direct fetch with realistic headers + embedded hydration extraction
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const resp = await fetch(cleanUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: browserHeaders,
    });
    clearTimeout(timer);

    if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
      sawProtection = true;
    } else if (resp.ok) {
      const html = await resp.text();
      if (html && html.length > 250) {
        const extracted = extractHtmlSignals(html, cleanUrl);
        const blocked = isProtectedOrBlockedPage(html);
        if (
          !blocked &&
          (extracted.textSnippet.length > 140 ||
            extracted.jsonLd.length > 40 ||
            extracted.foundImages.length > 0 ||
            extracted.title.length > 8)
        ) {
          bestSignals = extracted;
        } else if (extracted.title.length > 10 && extracted.foundImages.length > 0) {
          // AliExpress/SPA often ships runParams & og tags even when plain text is short
          bestSignals = extracted;
        } else {
          sawProtection = blocked;
        }
      }
    } else {
      sawProtection = true;
    }
  } catch {
    sawProtection = true;
  }

  // Layer 2: Reader proxy (r.jina.ai) to bypass anti-bot JS rendering & Cloudflare gates
  if (
    !bestSignals ||
    bestSignals.textSnippet.length < 180 ||
    bestSignals.foundImages.length === 0
  ) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 14000);
      const jinaResp = await fetch(`https://r.jina.ai/${cleanUrl}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': browserHeaders['User-Agent'],
          Accept: 'text/plain, text/markdown',
          'X-Return-Format': 'markdown',
        },
      });
      clearTimeout(timer);
      if (jinaResp.ok) {
        const md = await jinaResp.text();
        const readerSignals = extractReaderSignals(md, cleanUrl);
        if (readerSignals) {
          bestSignals = {
            title: bestSignals?.title || readerSignals.title,
            metaDescription: bestSignals?.metaDescription || readerSignals.metaDescription,
            jsonLd: bestSignals?.jsonLd || readerSignals.jsonLd,
            textSnippet:
              readerSignals.textSnippet.length > (bestSignals?.textSnippet.length || 0)
                ? readerSignals.textSnippet
                : bestSignals?.textSnippet || readerSignals.textSnippet,
            foundImages: Array.from(
              new Set([...(bestSignals?.foundImages || []), ...readerSignals.foundImages])
            ).slice(0, 12),
            detectedPriceText: bestSignals?.detectedPriceText || readerSignals.detectedPriceText,
            detectedPriceSar: bestSignals?.detectedPriceSar || readerSignals.detectedPriceSar,
          };
        }
      }
    } catch {
      // Continue to layer 3
    }
  }

  // Layer 3: Microlink public metadata API fallback for stubborn OG-only targets
  if (!bestSignals || (!bestSignals.title && bestSignals.foundImages.length === 0)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const mlResp = await fetch(
        `https://api.microlink.io/?url=${encodeURIComponent(cleanUrl)}`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (mlResp.ok) {
        const mlJson = (await mlResp.json().catch(() => null)) as {
          status?: string;
          data?: {
            title?: string;
            description?: string;
            image?: { url?: string };
            logo?: { url?: string };
          };
        } | null;
        if (mlJson?.status === 'success' && mlJson.data) {
          const mlImgs = [mlJson.data.image?.url]
            .map((u) => (u ? normalizeExtractedImageUrl(u, cleanUrl) : null))
            .filter((u): u is string => Boolean(u));
          if (mlJson.data.title || mlJson.data.description || mlImgs.length > 0) {
            bestSignals = {
              title: mlJson.data.title || bestSignals?.title || '',
              metaDescription: mlJson.data.description || bestSignals?.metaDescription || '',
              jsonLd: bestSignals?.jsonLd || '',
              textSnippet:
                `${mlJson.data.title || ''}\n${mlJson.data.description || ''}`.trim() ||
                bestSignals?.textSnippet ||
                '',
              foundImages: Array.from(
                new Set([...(bestSignals?.foundImages || []), ...mlImgs])
              ).slice(0, 12),
              detectedPriceText: bestSignals?.detectedPriceText,
              detectedPriceSar: bestSignals?.detectedPriceSar,
            };
          }
        }
      }
    } catch {
      // Continue to Gemini search grounding if caller supports it
    }
  }

  return { cleanUrl, signals: bestSignals, sawProtection };
}

export async function scrapeProductFromUrlOrName(input: {
  url?: string;
  productName?: string;
  category?: string;
}): Promise<ScrapedProductResult> {
  const ai = getAiClient();
  const cleanUrl = sanitizeAndNormalizeProductUrl(input.url || '');
  const cleanName = (input.productName || '').trim();
  const defaultCategory = input.category?.trim() || 'دبات تلوث البنزين';

  let fetchedSignals: ExtractedPageSignals | null = null;
  if (cleanUrl && /^https?:\/\//i.test(cleanUrl)) {
    const fetched = await fetchExternalPageRobust(cleanUrl);
    fetchedSignals = fetched.signals;
  }

  let baseResult: ScrapedProductResult | null = null;

  if (
    fetchedSignals &&
    (fetchedSignals.textSnippet.length > 100 ||
      fetchedSignals.jsonLd.length > 40 ||
      fetchedSignals.title.length > 6)
  ) {
    const prompt = `أنت خبير تجارة إلكترونية فاخرة ومترجم تقني محترف. قم بتحليل بيانات المنتج المستخرجة من الرابط التالي وتحويلها إلى بيانات عربية تسويقية احترافية بالريال السعودي (SAR):
الرابط المنظف: ${cleanUrl}
${cleanName ? `اسم مقترح من المالك: ${cleanName}` : ''}
العنوان المستخرج: ${fetchedSignals.title}
الوصف: ${fetchedSignals.metaDescription}
${fetchedSignals.detectedPriceSar ? `السعر المكتشف والمحوّل تقديرياً للريال السعودي: ${fetchedSignals.detectedPriceSar} ر.س (الأصلي: ${fetchedSignals.detectedPriceText || ''})` : ''}
بيانات JSON-LD: ${fetchedSignals.jsonLd}
الصور المستخرجة: ${JSON.stringify(fetchedSignals.foundImages)}
مقتطف النص: ${fetchedSignals.textSnippet}

المطلوب بصيغة JSON (مع التحويل الدقيق للعملات إلى الريال السعودي SAR: USD × 3.75، EUR × 4.08، CNY/RMB × 0.52، GBP × 4.78):
- name: الاسم الكامل للمنتج باللغة العربية الفاخرة والمقنعة.
- nameEn: اسم المنتج التجاري بالإنجليزية.
- category: تصنيف عربي مناسب مثل "${defaultCategory}".
- priceSar: سعر البيع بالريال السعودي SAR (رقم صحيح موجب، حوّل العملة الأجنبية بدقة للريال السعودي).
- originalExtractedPrice: نص السعر الأصلي المكتشف مع عملته.
- description: وصف تسويقي عربي كامل وجذاب يوضح المزايا الفنية، التوافق، وجودة التصنيع والضمان.
- descriptionEn: وصف إنجليزي موجز واحترافي.
- images: روابط الصور الحقيقية للمنتج المستخرجة من الصفحة فقط (إن وجدت).
- seoKeywords: 6 كلمات مفتاحية عربية للسيو.
- specs: المواصفات الفنية {label, value} بالعربية.`;

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
          required: [
            'name',
            'nameEn',
            'category',
            'priceSar',
            'originalExtractedPrice',
            'description',
            'descriptionEn',
            'images',
            'seoKeywords',
            'specs',
          ],
        },
      },
    });

    const parsed = safeParseAiJson<Partial<ScrapedProductResult>>(response.text, {});
    const mergedImages = Array.from(
      new Set([...(parsed.images ?? []), ...(fetchedSignals.foundImages ?? [])])
    ).filter((img) => typeof img === 'string' && /^https?:\/\//i.test(img));

    baseResult = {
      name: parsed.name?.trim() || cleanName || fetchedSignals.title || 'منتج مسحوب جديد',
      nameEn: parsed.nameEn?.trim() || undefined,
      category: parsed.category?.trim() || defaultCategory,
      priceSar:
        Number(parsed.priceSar) > 0
          ? Math.round(Number(parsed.priceSar))
          : fetchedSignals.detectedPriceSar || 750,
      originalExtractedPrice:
        parsed.originalExtractedPrice || fetchedSignals.detectedPriceText || 'من الرابط الخارجي',
      description:
        parsed.description?.trim() ||
        fetchedSignals.metaDescription ||
        'وصف احترافي جاهز في المتجر.',
      descriptionEn: parsed.descriptionEn?.trim() || undefined,
      images: mergedImages,
      seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [],
      specs: Array.isArray(parsed.specs) ? parsed.specs : [],
    };
  } else if (cleanUrl && /^https?:\/\//i.test(cleanUrl)) {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `اقرأ رابط المنتج التالي واستخرج بياناته التسويقية الكاملة باللغة العربية بالريال السعودي بصيغة JSON فقط:
الرابط: ${cleanUrl}
${cleanName ? `اسم مرجعي: ${cleanName}` : ''}

أعد كائن JSON يحتوي على:
{
  "name": "اسم المنتج الكامل بالعربية",
  "nameEn": "English product name",
  "category": "${defaultCategory}",
  "priceSar": 850,
  "originalExtractedPrice": "السعر المصدر",
  "description": "وصف تسويقي عربي كامل يبرز المزايا والجودة والتوافق",
  "descriptionEn": "Professional English summary",
  "images": ["روابط الصور الحقيقية إن توفرت وإلا مصفوفة فارغة"],
  "seoKeywords": ["كلمات مفتاحية عربية"],
  "specs": [{"label": "المواصفة", "value": "القيمة"}]
}`,
      config: {
        tools: [{ urlContext: {} }, { googleSearch: {} }],
      },
    });

    const parsed = safeParseAiJson<Partial<ScrapedProductResult>>(response.text, {});
    const cleanImgs = Array.isArray(parsed.images)
      ? parsed.images.filter((i) => typeof i === 'string' && /^https?:\/\//i.test(i.trim()))
      : [];

    baseResult = {
      name: parsed.name?.trim() || cleanName || 'منتج مسحوب بالذكاء الاصطناعي',
      nameEn: parsed.nameEn?.trim() || undefined,
      category: parsed.category?.trim() || defaultCategory,
      priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 790,
      originalExtractedPrice: parsed.originalExtractedPrice || 'تقدير بالذكاء الاصطناعي',
      description:
        parsed.description?.trim() ||
        'منتج عالي الجودة مجهز بصياغة تسويقية عربية شاملة وفق أعلى معايير الكفاءة والأداء.',
      descriptionEn: parsed.descriptionEn?.trim() || undefined,
      images: cleanImgs,
      seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [],
      specs: Array.isArray(parsed.specs) ? parsed.specs : [],
    };
  } else {
    const targetName = cleanName || 'دبة تلوث عالية الكفاءة Euro-6';
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `أنت مدير منتجات وخبير تسويق رقمي لمتجر سعودي فاخر متخصص في قطع غيار السيارات ودبات التلوث وفلاتر البيئة.
طلب المالك إنشاء منتج جديد متكامل انطلاقاً من الاسم التالي فقط:
"${targetName}"
القسم المستهدف: "${defaultCategory}"

اكتب بيانات تسويقية وفنية كاملة ومقنعة بصيغة JSON:
- name: اسم تسويقي عربي احترافي واضح للمنتج.
- nameEn: اسم إنجليزي احترافي مطابق.
- category: "${defaultCategory}" أو القسم الأنسب بالعربية.
- priceSar: سعر بيع عادل وواقعي بالريال السعودي في السوق السعودي (رقم صحيح موجب).
- originalExtractedPrice: "تسعير مقترح تلقائياً عبر Gemini AI".
- description: وصف تسويقي عربي كامل واحترافي يشمل الفوائد، الأداء، التوافق، اجتياز الفحص الدوري، الخامات، والضمان.
- descriptionEn: وصف إنجليزي احترافي متكامل.
- seoKeywords: 6 كلمات مفتاحية عربية قوية.
- specs: 4 مواصفات فنية دقيقة {label, value} باللغة العربية.`,
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
          required: [
            'name',
            'nameEn',
            'category',
            'priceSar',
            'originalExtractedPrice',
            'description',
            'descriptionEn',
            'seoKeywords',
            'specs',
          ],
        },
      },
    });

    const parsed = safeParseAiJson<Partial<ScrapedProductResult>>(response.text, {});
    baseResult = {
      name: parsed.name?.trim() || targetName,
      nameEn: parsed.nameEn?.trim() || undefined,
      category: parsed.category?.trim() || defaultCategory,
      priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 950,
      originalExtractedPrice: parsed.originalExtractedPrice || 'تسعير تلقائي AI',
      description:
        parsed.description?.trim() ||
        `${targetName} مصنعة بخامات عالية التحمل وكفاءة ترشيح متقدمة تضمن ثبات الأداء واجتياز الفحص الدوري.`,
      descriptionEn: parsed.descriptionEn?.trim() || undefined,
      images: [],
      seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [],
      specs:
        Array.isArray(parsed.specs) && parsed.specs.length > 0
          ? parsed.specs
          : [{ label: 'المعيار', value: 'Euro-6 / مطابق للفحص الدوري' }],
    };
  }

  let aiGeneratedImage = false;
  if (!baseResult.images || baseResult.images.length === 0) {
    const generatedImgUrl = await generateProductSquareImageWithGemini({
      name: baseResult.name,
      category: baseResult.category,
      description: baseResult.description,
    });
    baseResult.images = [generatedImgUrl];
    aiGeneratedImage = true;
  }

  return {
    ...baseResult,
    aiGeneratedImage,
  };
}

export async function scrapeProductFromUrl(url: string): Promise<ScrapedProductResult> {
  return scrapeProductFromUrlOrName({ url });
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
    const parsed = safeParseAiJson<{ items?: typeof rawItems }>(response.text, {});
    rawItems = Array.isArray(parsed.items) ? parsed.items : [];
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

    const parsed = safeParseAiJson<{ items?: typeof rawItems }>(response.text, {});
    if (Array.isArray(parsed.items)) rawItems = parsed.items;
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

  const parsed = safeParseAiJson<
    Partial<{
      name: string;
      description: string;
      badgeText: string;
      seoKeywords: string[];
      specs: ProductSpec[];
    }>
  >(response.text, {});

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

  return safeParseAiJson(response.text, {
    storeName: input.storeName,
    storeTagline: input.storeTagline,
    heroTitle: input.heroTitle,
    heroSubtitle: 'جودة هندسية فائقة ومطابقة لمعايير الفحص الدوري.',
    suggestedCategoryName: 'دبات التلوث الرياضية',
    suggestedCategoryDesc: 'محولات حفازة عالية التدفق للسيارات الحديثة.',
  });
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

  const parsed = safeParseAiJson<{
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string[];
  }>(response.text, {});

  const seoTitle = parsed.seoTitle || `${product.name} | ${storeName}`;
  const seoDescription = parsed.seoDescription || product.description.slice(0, 155);
  const seoKeywords = parsed.seoKeywords ?? [product.name, product.category, 'دبات تلوث السعودية'];

  const schemaMarkup: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: seoDescription,
    category: product.category,
    image: (product.images || []).filter((u) => typeof u === 'string' && !u.startsWith('data:')),
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

  return safeParseAiJson<GeneratedAdsCampaign>(response.text, {
    googleAdsHeadlines: ['دبات تلوث معتمدة Euro-6', 'شحن سريع لجميع مناطق المملكة'],
    googleAdsDescriptions: ['اطلب الآن دبات التلوث للديزل والبنزين بالريال السعودي وبضمان الجودة.'],
    googleAdsKeywords: ['دبات تلوث', 'فلتر DPF', 'قطع غيار السعودية'],
    banner: {
      title: `عروض ${input.storeName}`,
      subtitle: 'تشكيلة دبات التلوث للديزل والبنزين بمعايير Euro-6',
      ctaText: 'تسوق الآن',
      discountLabel: 'عرض خاص',
      accentColor: '#D4AF37',
    },
  });
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

    const parsed = safeParseAiJson<{
      recommendedOpacity?: number;
      recommendedMotion?: string;
      cssFilter?: string;
      explanationAr?: string;
    }>(response.text, {});

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

  const parsed = safeParseAiJson<{
    nameEn?: string;
    descriptionEn?: string;
  }>(response.text, {});
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
  sizes: string[];
  specs: ProductSpec[];
}

export interface ImportProductWithAiResponse {
  blockedByProtection?: boolean;
  warningMessage?: string;
  cleanedUrl?: string;
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
  const rawInputUrl = (input.url || '').trim();
  const cleanUrl = rawInputUrl ? sanitizeAndNormalizeProductUrl(rawInputUrl) : '';
  const cleanRawText = (input.rawText || '').trim();
  const categoryList =
    input.categories && input.categories.length > 0
      ? input.categories
      : ['دبات تلوث البنزين', 'دبات تلوث الديزل', 'حساسات الشكمان والأكسجين', 'وصلات وملحقات العادم'];

  const extractSizesFromText = (text: string): string[] => {
    const found = new Set<string>();
    const inchMatches =
      text.match(/\b(\d+(?:\.\d+)?)\s*(?:inch|inches|in\b|"|بوصة|انش|إنش)/gi) || [];
    for (const m of inchMatches) {
      const num = m.match(/\d+(?:\.\d+)?/)?.[0];
      if (num) found.add(`${num} بوصة`);
    }
    const mmMatches = text.match(/\b(\d{2,4}(?:\.\d+)?)\s*(?:mm|ملم|مم)\b/gi) || [];
    for (const m of mmMatches) {
      const num = m.match(/\d+(?:\.\d+)?/)?.[0];
      if (num) found.add(`${num} مم`);
    }
    const cmMatches = text.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:cm|سم)\b/gi) || [];
    for (const m of cmMatches) {
      const num = m.match(/\d+(?:\.\d+)?/)?.[0];
      if (num) found.add(`${num} سم`);
    }
    return Array.from(found).slice(0, 12);
  };

  // Method 2: Manual pasted product text/details (for protected websites or direct paste)
  if (cleanRawText.length >= 15) {
    const textImages = extractImageUrlsFromRawText(cleanRawText);
    const detectedFromText = detectPriceHintFromText(cleanRawText);
    const regexSizes = extractSizesFromText(cleanRawText);
    const prompt = `أنت خبير تجارة إلكترونية فاخرة ومترجم تقني محترف. قام مالك المتجر بنسخ ولصق تفاصيل/نص منتج من متجر خارجي، والمطلوب تحليل النص وتحويله إلى بيانات منتج احترافية جاهزة للنشر في المتجر باللغة العربية وبالريال السعودي (SAR):
${cleanUrl ? `الرابط المرجعي المنظف: ${cleanUrl}` : ''}
الأقسام المتاحة في المتجر (اختر أنسب قسم منها): ${JSON.stringify(categoryList)}
${detectedFromText.sar ? `سعر مرجعي مكتشف بالريال: ${detectedFromText.sar} ر.س (${detectedFromText.text})` : ''}
روابط الصور المكتشفة في النص (إن وجدت): ${JSON.stringify(textImages)}
النص والتفاصيل الملصقة:
"""
${cleanRawText.slice(0, 18000)}
"""

المطلوب بدقة (مع تحويل أي عملة أجنبية للريال السعودي SAR بدقة: USD × 3.75، EUR × 4.08، CNY/RMB × 0.52، GBP × 4.78):
1. name: اسم المنتج (Product Name) مترجماً ومصاغاً باللغة العربية بشكل احترافي وجذاب يبرز جودة القطعة أو توافقها.
2. nameEn: اسم المنتج التجاري المختصر بالإنجليزية.
3. category: اختر القسم الأنسب للمنتج من قائمة الأقسام المتاحة أعلاه.
4. priceSar: السعر الرقمي النهائي بالريال السعودي SAR (رقم صحيح موجب).
5. originalExtractedPrice: نص السعر الأصلي كما ورد في النص مع عملته.
6. description: الوصف التفصيلي والمميزات باللغة العربية بأسلوب تسويقي احترافي ومنسق يشرح الفوائد والمواصفات.
7. descriptionEn: وصف موجز احترافي بالإنجليزية.
8. images: مصفوفة روابط الصور عالية الجودة المستخرجة من النص إن وجدت (تبدأ بـ http).
9. sizes: مصفوفة المقاسات أو الأبعاد المتاحة للمنتج المستخلصة من النص (مثل "2.5 بوصة (63 ملم)" أو "3 بوصة" أو "الطول 35 سم"، أو مصفوفة فارغة [] إذا لم يُذكر مقاس).
10. specs: مصفوفة مواصفات فنية منسقة {label, value} باللغة العربية مستخلصة من النص.`;

    const extractSchemaConfig = {
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
          sizes: { type: Type.ARRAY, items: { type: Type.STRING } },
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
          'sizes',
          'specs',
        ],
      },
    };

    let parsed: Partial<ImportedProductFromUrlResult> = {};
    for (const modelName of ['gemini-4-hydrogen', 'gemini-2.5-flash'] as const) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: extractSchemaConfig,
        });
        parsed = safeParseAiJson<Partial<ImportedProductFromUrlResult>>(response.text, {});
        if (parsed.name || parsed.description || parsed.priceSar) {
          break;
        }
      } catch (err) {
        console.warn(`AI rawText import attempt (${modelName}) failed:`, err);
      }
    }

    const mergedImages = Array.from(
      new Set([...(parsed.images ?? []), ...textImages])
    )
      .filter((img) => typeof img === 'string' && /^https?:\/\//i.test(img.trim()))
      .slice(0, 12);

    const parsedSizes = Array.isArray(parsed.sizes) && parsed.sizes.length > 0
      ? Array.from(new Set(parsed.sizes.map((s) => String(s || '').trim()).filter(Boolean))).slice(0, 20)
      : regexSizes;

    const resolvedPrice =
      Number(parsed.priceSar) > 0
        ? Math.round(Number(parsed.priceSar))
        : detectedFromText.sar || 590;

    const firstLine = cleanRawText.split(/\r?\n/)[0]?.trim().slice(0, 110) || 'منتج مستورد جديد';
    const lowerText = cleanRawText.toLowerCase();
    const guessedCat =
      categoryList.find(
        (c) =>
          (c.includes('ديزل') && (lowerText.includes('diesel') || lowerText.includes('dpf'))) ||
          (c.includes('سيراميك') && (lowerText.includes('ceramic') || lowerText.includes('core')))
      ) || categoryList[0];

    return {
      cleanedUrl: cleanUrl || undefined,
      product: {
        name: parsed.name?.trim() || firstLine,
        nameEn: parsed.nameEn?.trim() || (/[a-zA-Z]/.test(firstLine) ? firstLine : ''),
        category:
          parsed.category && categoryList.includes(parsed.category)
            ? parsed.category
            : guessedCat,
        priceSar: resolvedPrice,
        originalExtractedPrice:
          parsed.originalExtractedPrice?.trim() || detectedFromText.text || 'من النص الملصق',
        description: parsed.description?.trim() || cleanRawText.slice(0, 600),
        descriptionEn: parsed.descriptionEn?.trim() || '',
        images: mergedImages,
        sizes: parsedSizes,
        specs: Array.isArray(parsed.specs) ? parsed.specs.filter((s) => s?.label && s?.value) : [],
      },
    };
  }

  // Method 1: Automated URL import (Proxy HTML + Multi-Layer Backend Extraction: Direct -> AliExpress hydration -> r.jina.ai -> microlink -> Gemini Grounding)
  let signals: ExtractedPageSignals | null = null;
  let detectedProtection = false;

  if (input.htmlContent && input.htmlContent.trim().length > 150) {
    if (!isProtectedOrBlockedPage(input.htmlContent)) {
      const proxySignals = extractHtmlSignals(input.htmlContent, cleanUrl);
      if (
        proxySignals.textSnippet.length > 100 ||
        proxySignals.jsonLd.length > 40 ||
        proxySignals.foundImages.length > 0
      ) {
        signals = proxySignals;
      }
    } else {
      detectedProtection = true;
    }
  }

  if (
    !signals ||
    (signals.textSnippet.length < 140 && signals.jsonLd.length < 40 && signals.foundImages.length === 0)
  ) {
    const robust = await fetchExternalPageRobust(cleanUrl);
    if (robust.signals) {
      signals = robust.signals;
    }
    if (robust.sawProtection && !robust.signals) {
      detectedProtection = true;
    }
  }

  if (
    signals &&
    (signals.textSnippet.length > 60 ||
      signals.jsonLd.length > 35 ||
      signals.title.length > 5 ||
      signals.foundImages.length > 0)
  ) {
    const prompt = `أنت خبير تجارة إلكترونية فاخرة ومترجم تقني محترف. قم بتحليل محتوى صفحة المنتج المستخرجة من المتجر الخارجي وتحويله إلى بيانات منتج عربية احترافية متكاملة بالريال السعودي (SAR):
رابط المنتج المنظف: ${cleanUrl}
الأقسام المتاحة في المتجر (اختر أنسب قسم منها): ${JSON.stringify(categoryList)}
العنوان المستخرج: ${signals.title}
وصف الميتا: ${signals.metaDescription}
${signals.detectedPriceSar ? `السعر المكتشف والمحوّل مرجعياً للريال السعودي: ${signals.detectedPriceSar} ر.س (النص الأصلي: ${signals.detectedPriceText || ''})` : ''}
بيانات JSON-LD: ${signals.jsonLd}
روابط الصور المكتشفة: ${JSON.stringify(signals.foundImages)}
محتوى الصفحة النصي: ${signals.textSnippet}

المطلوب بدقة (تأكد من تحويل أي عملة إلى الريال السعودي SAR: USD × 3.75، EUR × 4.08، CNY/RMB × 0.52، GBP × 4.78):
1. name: اسم المنتج (Product Name) مترجماً ومصاغاً باللغة العربية بشكل تسويقي احترافي وجذاب.
2. nameEn: اسم المنتج التجاري الواضح بالإنجليزية.
3. category: اختر القسم الأنسب من القائمة المتاحة أعلاه.
4. priceSar: السعر الرقمي بالريال السعودي SAR (رقم صحيح موجب).
5. originalExtractedPrice: نص السعر الأصلي المكتشف في الصفحة كما ورد مع عملته.
6. description: الوصف التفصيلي والمميزات باللغة العربية بأسلوب تسويقي ومقنع يشرح الجودة والاستخدام والتوافق.
7. descriptionEn: وصف موجز احترافي بالإنجليزية.
8. images: مصفوفة بجميع روابط الصور عالية الجودة للمنتج (تبدأ بـ http ولا تشمل الأيقونات أو الشعارات الصغيرة).
9. sizes: مصفوفة المقاسات أو الأبعاد المتاحة للمنتج المستخرجة من الصفحة (أو [] إن لم تذكر).
10. specs: مصفوفة مواصفات فنية منسقة {label, value} باللغة العربية.`;

    try {
      const response = await Promise.race([
        ai.models.generateContent({
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
                sizes: { type: Type.ARRAY, items: { type: Type.STRING } },
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
                'sizes',
                'specs',
              ],
            },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini import timeout')), 14000)
        ),
      ]);

      const parsed = safeParseAiJson<Partial<ImportedProductFromUrlResult>>(response.text, {});
      const mergedImages = Array.from(
        new Set([...(parsed.images ?? []), ...(signals.foundImages ?? [])])
      )
        .filter((img) => typeof img === 'string' && /^https?:\/\//i.test(img.trim()))
        .slice(0, 12);

      const parsedSizes = Array.isArray(parsed.sizes)
        ? Array.from(new Set(parsed.sizes.map((s) => String(s || '').trim()).filter(Boolean))).slice(0, 20)
        : [];

      const resolvedPriceSar =
        Number(parsed.priceSar) > 0
          ? Math.round(Number(parsed.priceSar))
          : signals.detectedPriceSar || 590;

      return {
        cleanedUrl: cleanUrl,
        product: {
          name: parsed.name?.trim() || signals.title || 'منتج مستورد جديد',
          nameEn: parsed.nameEn?.trim() || signals.title || '',
          category:
            parsed.category && categoryList.includes(parsed.category)
              ? parsed.category
              : categoryList[0],
          priceSar: resolvedPriceSar,
          originalExtractedPrice:
            parsed.originalExtractedPrice?.trim() || signals.detectedPriceText || 'من الرابط الخارجي',
          description:
            parsed.description?.trim() || signals.metaDescription || 'تم استخراج بيانات المنتج بنجاح.',
          descriptionEn: parsed.descriptionEn?.trim() || '',
          images: mergedImages,
          sizes: parsedSizes,
          specs: Array.isArray(parsed.specs) ? parsed.specs.filter((s) => s?.label && s?.value) : [],
        },
      };
    } catch (aiErr) {
      console.warn('Gemini import enrichment unavailable, returning extracted HTML signals:', aiErr);
      const fallbackImages = (signals.foundImages ?? [])
        .filter((img) => typeof img === 'string' && /^https?:\/\//i.test(img.trim()))
        .slice(0, 12);
      const lowerTitle = `${signals.title} ${signals.metaDescription}`.toLowerCase();
      const guessedCategory =
        categoryList.find((c) =>
          (c.includes('ديزل') && (lowerTitle.includes('diesel') || lowerTitle.includes('dpf'))) ||
          (c.includes('سيراميك') && (lowerTitle.includes('ceramic') || lowerTitle.includes('core')))
        ) || categoryList[0];
      return {
        cleanedUrl: cleanUrl,
        product: {
          name: signals.title || 'منتج مستورد من الرابط',
          nameEn: signals.title || '',
          category: guessedCategory,
          priceSar: signals.detectedPriceSar || 590,
          originalExtractedPrice: signals.detectedPriceText || 'من الرابط الخارجي',
          description:
            signals.metaDescription ||
            signals.textSnippet.slice(0, 450) ||
            'تم استخراج بيانات المنتج وصوره وتحويل السعر إلى الريال السعودي.',
          descriptionEn: signals.metaDescription || '',
          images: fallbackImages,
          sizes: [],
          specs: [],
        },
      };
    }
  }

  // Layer 4: Final fallback using Gemini urlContext + googleSearch before reporting protection
  if (cleanUrl && /^https?:\/\//i.test(cleanUrl)) {
    try {
      const groundingResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `استخرج بيانات المنتج التالي من هذا الرابط المنظف باستخدام بحث Google وقراءة الرابط:
الرابط: ${cleanUrl}
الأقسام المتاحة في متجرنا: ${JSON.stringify(categoryList)}

أعد كائن JSON فقط بالتنسيق التالي (وحوّل السعر للريال السعودي SAR بدقة: USD×3.75، EUR×4.08، CNY×0.52). إذا تعذر العثور على أي معلومات حقيقية للمنتج تماماً أعد {"found": false}:
{
  "found": true,
  "name": "اسم المنتج بالعربية",
  "nameEn": "English Title",
  "category": "${categoryList[0]}",
  "priceSar": 450,
  "originalExtractedPrice": "$120 USD",
  "description": "وصف تفصيلي عربي",
  "descriptionEn": "English description",
  "images": ["https://..."],
  "sizes": ["2.5 بوصة", "3 بوصة"],
  "specs": [{"label": "المواصفة", "value": "القيمة"}]
}`,
        config: {
          tools: [{ urlContext: {} }, { googleSearch: {} }],
        },
      });

      const grounded = safeParseAiJson<
        Partial<ImportedProductFromUrlResult> & { found?: boolean }
      >(groundingResp.text, {});

      if (grounded.found !== false && grounded.name && grounded.name.trim().length >= 4) {
        const cleanImgs = Array.isArray(grounded.images)
          ? grounded.images.filter((i) => typeof i === 'string' && /^https?:\/\//i.test(i.trim()))
          : [];
        const cleanSizes = Array.isArray(grounded.sizes)
          ? Array.from(new Set(grounded.sizes.map((s) => String(s || '').trim()).filter(Boolean))).slice(0, 20)
          : [];
        return {
          cleanedUrl: cleanUrl,
          product: {
            name: grounded.name.trim(),
            nameEn: grounded.nameEn?.trim() || '',
            category:
              grounded.category && categoryList.includes(grounded.category)
                ? grounded.category
                : categoryList[0],
            priceSar: Number(grounded.priceSar) > 0 ? Math.round(Number(grounded.priceSar)) : 590,
            originalExtractedPrice:
              grounded.originalExtractedPrice?.trim() || 'مستخرج عبر بحث Google للرابط',
            description:
              grounded.description?.trim() || 'تم استخراج وصف المنتج ومواصفاته عبر بحث الويب.',
            descriptionEn: grounded.descriptionEn?.trim() || '',
            images: cleanImgs,
            sizes: cleanSizes,
            specs: Array.isArray(grounded.specs)
              ? grounded.specs.filter((s) => s?.label && s?.value)
              : [],
          },
        };
      }
    } catch {
      // Fall through to protected-site response cleanly
    }
  }

  // Site refused automated proxy and all 4 server-side extraction layers -> return clear protected-site signal
  return {
    cleanedUrl: cleanUrl,
    blockedByProtection: true,
    warningMessage: detectedProtection
      ? 'الموقع الخارجي محمي ضد السحب الآلي ورفض جلب البيانات حتى بعد تنظيف الرابط. يُنصح باستخدام "الطريقة الثانية (اللصق اليدوي)" أدناه: انسخ نص تفاصيل المنتج من صفحة المتجر والصقه ليقوم الذكاء الاصطناعي بتحليله وتعبئة جميع الحقول والأسعار بالريال تلقائياً.'
      : 'تعذر سحب محتوى كافٍ من الرابط تلقائياً لأن صفحة المنتج تعتمد على حماية ديناميكية. يُرجى استخدام "الطريقة الثانية (اللصق اليدوي)" أدناه ولصق نص المنتج مباشرة.',
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

export interface GeneratedStoreThemeResult {
  themeName: string;
  primaryGoldColor: string;
  secondaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  themeFontFamily: 'Tajawal' | 'El Messiri' | 'Cairo' | 'IBM Plex Sans Arabic' | 'Readex Pro';
  cardStyle: 'luxury_bordered' | 'glass_modern' | 'sharp_industrial' | 'elevated_soft';
  buttonStyle: 'gold_wave' | 'standard' | 'exhaust_twin' | 'exhaust_flame';
  rationale: string;
}

const VALID_HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

export async function generateStoreThemeWithAi(
  themePrompt: string
): Promise<GeneratedStoreThemeResult> {
  const cleanDesc = (themePrompt || 'ثيم ليلي فخم باللون الأسود والذهبي').trim().slice(0, 350);

  const buildKeywordFallbackTheme = (): GeneratedStoreThemeResult => {
    const t = cleanDesc.toLowerCase();
    if (/أحمر|رياضي|تيربو|سبورت|red|sport/.test(t)) {
      return {
        themeName: 'الرياضي الجريء باللون الأحمر',
        primaryGoldColor: '#EF4444',
        secondaryColor: '#F97316',
        backgroundColor: '#0B0B0E',
        surfaceColor: '#16161B',
        textColor: '#F9FAFB',
        themeFontFamily: 'Readex Pro',
        cardStyle: 'glass_modern',
        buttonStyle: 'exhaust_flame',
        rationale: 'ثيم رياضي ديناميكي بالأحمر والرمادي الداكن يبرز طابع الأداء العالي والسرعة.',
      };
    }
    if (/فاتح|أبيض|نهار|عصري|light|white/.test(t)) {
      return {
        themeName: 'الفاتح العصري المشرق',
        primaryGoldColor: '#B45309',
        secondaryColor: '#D97706',
        backgroundColor: '#F8FAFC',
        surfaceColor: '#FFFFFF',
        textColor: '#111827',
        themeFontFamily: 'Cairo',
        cardStyle: 'elevated_soft',
        buttonStyle: 'standard',
        rationale: 'تصميم فاتح نظيف وتباين مريح للعين يبرز تفاصيل المنتجات بدقة ووضوح.',
      };
    }
    if (/أزرق|تيتانيوم|معدني|فضي|blue|silver|titanium/.test(t)) {
      return {
        themeName: 'التيتانيوم المعدني الحديث',
        primaryGoldColor: '#38BDF8',
        secondaryColor: '#7DD3FC',
        backgroundColor: '#080B10',
        surfaceColor: '#111622',
        textColor: '#F1F5F9',
        themeFontFamily: 'IBM Plex Sans Arabic',
        cardStyle: 'sharp_industrial',
        buttonStyle: 'exhaust_twin',
        rationale: 'هوية معدنية هندسية مستوحاة من التيتانيوم وأنظمة العادم الاحترافية.',
      };
    }
    if (/أخضر|زمرد|طبيعي|green|emerald/.test(t)) {
      return {
        themeName: 'الزمردي الفاخر',
        primaryGoldColor: '#10B981',
        secondaryColor: '#34D399',
        backgroundColor: '#070D0B',
        surfaceColor: '#0F1A16',
        textColor: '#ECFDF5',
        themeFontFamily: 'Tajawal',
        cardStyle: 'glass_modern',
        buttonStyle: 'standard',
        rationale: 'أخضر زمردي أنيق مع خلفية داكنة عميقة يعكس معايير حماية البيئة وتنقية العادم.',
      };
    }
    return {
      themeName: 'الليلي الفخم بالأسود والذهبي',
      primaryGoldColor: '#D4AF37',
      secondaryColor: '#E5C158',
      backgroundColor: '#09090B',
      surfaceColor: '#121216',
      textColor: '#F5F2EB',
      themeFontFamily: 'El Messiri',
      cardStyle: 'luxury_bordered',
      buttonStyle: 'gold_wave',
      rationale: 'ثيم ليلي فخم يجمع بين الأسود الداكن والذهبي الملكي مع خط عربي أنيق.',
    };
  };

  try {
    const ai = getAiClient();
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `أنت مدير تصميم واجهات وتجربة مستخدم (UI/UX Design Director) متخصص في المتاجر الإلكترونية الفاخرة للسيارات وقطع الغيار.
طلب مالك المتجر تصميم ثيم متكامل بالوصف التالي:
"${cleanDesc}"

صمّم لوحة ألوان متناسقة تماماً ومقروءة بنسبة تباين عالية جداً (High Contrast WCAG AA) وحدد الخط العربي ونمط البطاقات والأزرار الأنسب:
- themeName: اسم الثيم المقترح بالعربية (3-5 كلمات).
- primaryGoldColor: اللون الرئيسي (الأزرار والروابط) بصيغة Hex مثل #D4AF37 أو #EF4444.
- secondaryColor: اللون الثانوي للشارات والعناوين الفرعية بصيغة Hex.
- backgroundColor: لون خلفية الصفحة الرئيسية بصيغة Hex (تأكد من ملاءمته للتباين مع textColor).
- surfaceColor: لون خلفية بطاقات المنتجات والحاويات بصيغة Hex.
- textColor: لون النصوص الأساسية بصيغة Hex (فاتح إذا كانت الخلفية داكنة، وداكن جداً إذا كانت الخلفية فاتحة).
- themeFontFamily: اختر خطاً واحداً من القائمة الحرفية: "Tajawal" | "El Messiri" | "Cairo" | "IBM Plex Sans Arabic" | "Readex Pro".
- cardStyle: اختر نمط البطاقات الأنسب من: "luxury_bordered" | "glass_modern" | "sharp_industrial" | "elevated_soft".
- buttonStyle: اختر نمط الأزرار الأنسب من: "gold_wave" | "standard" | "exhaust_twin" | "exhaust_flame".
- rationale: شرح مختصر من جملة واحدة بالعربية لسبب اختيار هذه التوليفة.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              themeName: { type: Type.STRING },
              primaryGoldColor: { type: Type.STRING },
              secondaryColor: { type: Type.STRING },
              backgroundColor: { type: Type.STRING },
              surfaceColor: { type: Type.STRING },
              textColor: { type: Type.STRING },
              themeFontFamily: { type: Type.STRING },
              cardStyle: { type: Type.STRING },
              buttonStyle: { type: Type.STRING },
              rationale: { type: Type.STRING },
            },
            required: [
              'themeName',
              'primaryGoldColor',
              'secondaryColor',
              'backgroundColor',
              'surfaceColor',
              'textColor',
              'themeFontFamily',
              'cardStyle',
              'buttonStyle',
              'rationale',
            ],
          },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini theme timeout')), 12000)
      ),
    ]);

    const parsed = safeParseAiJson<Partial<GeneratedStoreThemeResult>>(response.text, {});
    const allowedFonts: GeneratedStoreThemeResult['themeFontFamily'][] = [
      'Tajawal',
      'El Messiri',
      'Cairo',
      'IBM Plex Sans Arabic',
      'Readex Pro',
    ];
    const allowedCards: GeneratedStoreThemeResult['cardStyle'][] = [
      'luxury_bordered',
      'glass_modern',
      'sharp_industrial',
      'elevated_soft',
    ];
    const allowedButtons: GeneratedStoreThemeResult['buttonStyle'][] = [
      'gold_wave',
      'standard',
      'exhaust_twin',
      'exhaust_flame',
    ];

    const fallback = buildKeywordFallbackTheme();
    return {
      themeName: parsed.themeName?.trim() || fallback.themeName,
      primaryGoldColor: VALID_HEX_REGEX.test(parsed.primaryGoldColor || '')
        ? parsed.primaryGoldColor!
        : fallback.primaryGoldColor,
      secondaryColor: VALID_HEX_REGEX.test(parsed.secondaryColor || '')
        ? parsed.secondaryColor!
        : fallback.secondaryColor,
      backgroundColor: VALID_HEX_REGEX.test(parsed.backgroundColor || '')
        ? parsed.backgroundColor!
        : fallback.backgroundColor,
      surfaceColor: VALID_HEX_REGEX.test(parsed.surfaceColor || '')
        ? parsed.surfaceColor!
        : fallback.surfaceColor,
      textColor: VALID_HEX_REGEX.test(parsed.textColor || '')
        ? parsed.textColor!
        : fallback.textColor,
      themeFontFamily: allowedFonts.includes(
        parsed.themeFontFamily as GeneratedStoreThemeResult['themeFontFamily']
      )
        ? (parsed.themeFontFamily as GeneratedStoreThemeResult['themeFontFamily'])
        : fallback.themeFontFamily,
      cardStyle: allowedCards.includes(parsed.cardStyle as GeneratedStoreThemeResult['cardStyle'])
        ? (parsed.cardStyle as GeneratedStoreThemeResult['cardStyle'])
        : fallback.cardStyle,
      buttonStyle: allowedButtons.includes(
        parsed.buttonStyle as GeneratedStoreThemeResult['buttonStyle']
      )
        ? (parsed.buttonStyle as GeneratedStoreThemeResult['buttonStyle'])
        : fallback.buttonStyle,
      rationale: parsed.rationale?.trim() || fallback.rationale,
    };
  } catch (err) {
    console.warn('Gemini theme generator unavailable, using smart keyword palette fallback:', err);
    return buildKeywordFallbackTheme();
  }
}

