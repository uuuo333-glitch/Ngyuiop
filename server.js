// server.ts
import "dotenv/config";
import crypto3 from "node:crypto";
import path2 from "node:path";
import express from "express";
import nodemailer from "nodemailer";
import QRCode from "qrcode";

// server/db.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
var DATA_DIR = path.resolve(process.cwd(), "data");
var UPLOADS_DIR = path.join(DATA_DIR, "uploads");
var DB_FILE = path.join(DATA_DIR, "store.json");
var SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update(process.cwd() + "_royal_taj_secret").digest("hex");
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
function verifyPassword(password, storedHash) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}
function createSignedToken(payload) {
  const data = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + 1e3 * 60 * 60 * 24 * 7 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}
function verifySignedToken(token) {
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
var BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function generateBase32Secret(byteLength = 20) {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[value << 5 - bits & 31];
  }
  return output;
}
function decodeBase32(input) {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = value << 5 | idx;
    bits += 5;
    if (bits >= 8) {
      out.push(value >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function computeTotpAtCounter(secretBase32, counter) {
  const key = decodeBase32(secretBase32);
  const buf = Buffer.alloc(8);
  let high = Math.floor(counter / 4294967296);
  let low = counter >>> 0;
  buf.writeUInt32BE(high, 0);
  buf.writeUInt32BE(low, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = (hmac[offset] & 127) << 24 | (hmac[offset + 1] & 255) << 16 | (hmac[offset + 2] & 255) << 8 | hmac[offset + 3] & 255;
  return String(binary % 1e6).padStart(6, "0");
}
function verifyTotpCode(secretBase32, code, window = 1) {
  const cleanCode = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const currentCounter = Math.floor(Date.now() / 1e3 / 30);
  for (let step = -window; step <= window; step++) {
    const expected = computeTotpAtCounter(secretBase32, currentCounter + step);
    if (expected.length === cleanCode.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanCode))) {
      return true;
    }
  }
  return false;
}
function generateBackupCodesSet(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const partA = crypto.randomBytes(2).toString("hex").toUpperCase();
    const partB = crypto.randomBytes(2).toString("hex").toUpperCase();
    codes.push(`TAJ-${partA}-${partB}`);
  }
  return codes;
}
function defaultSettings() {
  return {
    storeName: "\u0645\u0635\u0646\u0639 \u0627\u0644\u062A\u0627\u062C \u0627\u0644\u0630\u0647\u0628\u064A \u0644\u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B",
    storeTagline: "\u0625\u0646\u062A\u0627\u062C \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0644\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646",
    storeOpen: true,
    storeClosedTitle: "\u0627\u0644\u0645\u062A\u062C\u0631 \u0645\u063A\u0644\u0642 \u0645\u0624\u0642\u062A\u0627\u064B \u0644\u0644\u0635\u064A\u0627\u0646\u0629 \u0648\u0627\u0644\u062A\u062D\u062F\u064A\u062B",
    storeClosedMessage: "\u0646\u0639\u0645\u0644 \u062D\u0627\u0644\u064A\u0627\u064B \u0639\u0644\u0649 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0648\u062A\u062C\u0647\u064A\u0632 \u0645\u0646\u062A\u062C\u0627\u062A \u0648\u0639\u0631\u0648\u0636 \u062C\u062F\u064A\u062F\u0629. \u064A\u0645\u0643\u0646\u0643\u0645 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0646\u0627 \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628 \u0644\u0623\u064A \u0627\u0633\u062A\u0641\u0633\u0627\u0631 \u0623\u0648 \u0637\u0644\u0628 \u0639\u0627\u062C\u0644\u060C \u0648\u0633\u0646\u0639\u0648\u062F \u0644\u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0642\u0631\u064A\u0628\u0627\u064B.",
    allowLanguageSwitch: true,
    defaultLanguage: "ar",
    multiCurrencyEnabled: true,
    currencyRates: {
      SAR: 1,
      AED: 0.98,
      KWD: 0.082,
      QAR: 0.97,
      BHD: 0.1,
      OMR: 0.103
    },
    priceDisplayMode: "retail",
    installmentsEnabled: true,
    showImageUrlFields: true,
    categories: [
      {
        id: "cat-gasoline",
        name: "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0628\u0646\u0632\u064A\u0646",
        description: "\u0645\u062D\u0648\u0644\u0627\u062A \u062D\u0641\u0627\u0632\u0629 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0644\u0645\u062D\u0631\u0643\u0627\u062A \u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0627\u0644\u062D\u062F\u064A\u062B\u0629",
        isActive: true
      },
      {
        id: "cat-diesel",
        name: "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u062F\u064A\u0632\u0644",
        description: "\u0641\u0644\u0627\u062A\u0631 \u062C\u0633\u064A\u0645\u0627\u062A DPF \u0648\u0645\u062D\u0641\u0632\u0627\u062A \u0623\u0643\u0633\u062F\u0629 \u0644\u0645\u0646\u0639 \u0627\u0644\u062F\u062E\u0627\u0646 \u0627\u0644\u0623\u0633\u0648\u062F",
        isActive: true
      },
      {
        id: "cat-ceramic",
        name: "\u0642\u0644\u0648\u0628 \u0648\u062D\u0634\u0648\u0627\u062A \u0627\u0644\u0633\u064A\u0631\u0627\u0645\u064A\u0643",
        description: "\u0642\u0644\u0648\u0628 \u0633\u064A\u0631\u0627\u0645\u064A\u0643 \u0628\u0644\u0627\u062A\u064A\u0646 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0643\u062B\u0627\u0641\u0629 \u0644\u0644\u062A\u0635\u0646\u064A\u0639 \u0648\u0627\u0644\u062A\u062C\u062F\u064A\u062F",
        isActive: true
      },
      {
        id: "cat-kits",
        name: "\u0623\u0637\u0642\u0645 \u0627\u0644\u0639\u0627\u062F\u0645 \u0648\u0627\u0644\u0641\u0644\u0646\u062C\u0627\u062A",
        description: "\u0623\u0637\u0642\u0645 \u062A\u0631\u0643\u064A\u0628 \u0643\u0627\u0645\u0644\u0629 \u0628\u0627\u0644\u0641\u0644\u0646\u062C\u0627\u062A \u0648\u0627\u0644\u062C\u0627\u0632\u0643\u064A\u062A\u0627\u062A \u0627\u0644\u062D\u0631\u0627\u0631\u064A\u0629",
        isActive: true
      }
    ],
    marqueeEnabled: true,
    marqueeText: "\u0625\u0646\u062A\u0627\u062C \u0648\u0637\u0646\u064A \u0648\u062A\u0648\u0631\u064A\u062F \u0645\u0628\u0627\u0634\u0631 \u0644\u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B (\u062F\u064A\u0632\u0644 \u0648\u0628\u0646\u0632\u064A\u0646) \u0628\u0645\u0639\u0627\u064A\u064A\u0631 Euro-6 \xB7 \u0636\u0645\u0627\u0646 \u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0648\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0641\u062D\u0635 \u0627\u0644\u062F\u0648\u0631\u064A \xB7 \u062F\u0641\u0639 \u0622\u0645\u0646 \u0639\u0628\u0631 PayPal \u0623\u0648 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0641\u0648\u0631\u064A \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628",
    marqueeBgColor: "#14120E",
    marqueeTextColor: "#E5C158",
    marqueeSpeed: 28,
    marquee2Enabled: true,
    marquee2Text: "\u0645\u062A\u0648\u0641\u0631 \u0627\u0644\u0622\u0646: \u0641\u0644\u0627\u062A\u0631 \u062C\u0633\u064A\u0645\u0627\u062A \u0627\u0644\u062F\u064A\u0632\u0644 DPF \xB7 \u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0628\u0646\u0632\u064A\u0646 \u0644\u062D\u0627\u0645 TIG \xB7 \u0642\u0644\u0648\u0628 \u0633\u064A\u0631\u0627\u0645\u064A\u0643 \u0628\u0644\u0627\u062A\u064A\u0646 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0643\u062B\u0627\u0641\u0629 \xB7 \u0627\u0633\u062A\u0634\u0627\u0631\u0629 \u0641\u0646\u064A\u0629 \u0641\u0648\u0631\u064A\u0629 \u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u0645\u0642\u0627\u0633 \u0627\u0644\u0645\u0646\u0627\u0633\u0628",
    marquee2BgColor: "#1E180B",
    marquee2TextColor: "#F5E1A4",
    marquee2Speed: 24,
    heroEnabled: true,
    heroTitle: "\u0625\u0646\u062A\u0627\u062C \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0644\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0628\u062F\u0642\u0629 \u0647\u0646\u062F\u0633\u064A\u0629 \u0641\u0627\u0626\u0642\u0629",
    heroSubtitle: "\u0646\u0635\u0646\u0639 \u0648\u0646\u0648\u0641\u0631 \u0623\u062D\u062F\u062B \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0648\u0641\u0644\u0627\u062A\u0631 \u0627\u0644\u062C\u0633\u064A\u0645\u0627\u062A (DPF) \u0648\u0627\u0644\u0645\u062D\u0648\u0644\u0627\u062A \u0627\u0644\u062D\u0641\u0627\u0632\u0629 \u0645\u0646 \u0627\u0644\u0641\u0648\u0644\u0627\u0630 \u0627\u0644\u0645\u0642\u0627\u0648\u0645 \u0644\u0644\u0635\u062F\u0623 \u0648\u062E\u0644\u0627\u064A\u0627 \u0627\u0644\u0628\u0644\u0627\u062A\u064A\u0646 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0644\u062A\u0646\u0642\u064A\u0629 \u0627\u0644\u0639\u0627\u062F\u0645 \u0648\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0645\u062D\u0631\u0643.",
    heroCtaText: "\u062A\u0635\u0641\u062D \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u0622\u0646",
    heroBackdropMode: "auto",
    heroVideoUrl: "",
    heroImageUrl: "/src/assets/images/hero_catalytic_gold_1794821492784.jpg",
    heroSlideshowImages: [
      "/src/assets/images/hero_catalytic_gold_1794821492784.jpg",
      "/src/assets/images/product_gasoline_cat_1794821493329.jpg",
      "/src/assets/images/product_diesel_dpf_1794821492144.jpg"
    ],
    heroFeatures: [
      {
        title: "\u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0645\u0639\u0627\u064A\u064A\u0631 Euro-6 \u0648\u0627\u0644\u0641\u062D\u0635 \u0627\u0644\u062F\u0648\u0631\u064A",
        description: "\u0643\u0641\u0627\u0621\u0629 \u062A\u0631\u0634\u064A\u062D \u0639\u0627\u0644\u064A\u0629 \u0644\u0644\u063A\u0627\u0632\u0627\u062A \u0627\u0644\u0636\u0627\u0631\u0629 \u062A\u0636\u0645\u0646 \u0627\u0633\u062A\u0642\u0631\u0627\u0631 \u0627\u0644\u062D\u0633\u0627\u0633\u0627\u062A \u0648\u0625\u0637\u0641\u0627\u0621 \u0644\u0645\u0628\u0629 \u0627\u0644\u0645\u062D\u0631\u0643."
      },
      {
        title: "\u062F\u0641\u0639 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0622\u0645\u0646 \u0639\u0628\u0631 PayPal",
        description: "\u0625\u062A\u0645\u0627\u0645 \u0641\u0648\u0631\u064A \u0648\u0645\u0648\u062B\u0648\u0642 \u0644\u0644\u0637\u0644\u0628\u0627\u062A \u0645\u0639 \u062A\u062D\u0648\u064A\u0644 \u062F\u0642\u064A\u0642 \u0645\u0646 \u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A."
      },
      {
        title: "\u0627\u0633\u062A\u0634\u0627\u0631\u0629 \u0641\u0646\u064A\u0629 \u0648\u0637\u0644\u0628 \u0645\u0628\u0627\u0634\u0631 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628",
        description: "\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0642\u0627\u0633 \u0627\u0644\u0645\u0646\u0627\u0633\u0628 \u0644\u0633\u064A\u0627\u0631\u062A\u0643 (\u062F\u064A\u0632\u0644 \u0623\u0648 \u0628\u0646\u0632\u064A\u0646) \u0648\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0637\u0644\u0628 \u062E\u0644\u0627\u0644 \u062F\u0642\u0627\u0626\u0642."
      },
      {
        title: "\u0644\u062D\u0627\u0645 TIG \u0633\u062A\u0627\u0646\u0644\u0633 \u0633\u062A\u064A\u0644 304 \u0645\u0642\u0627\u0648\u0645 \u0644\u0644\u062D\u0631\u0627\u0631\u0629",
        description: "\u0647\u064A\u0627\u0643\u0644 \u0645\u0639\u062F\u0646\u064A\u0629 \u0633\u0645\u064A\u0643\u0629 \u062A\u062A\u062D\u0645\u0644 \u062F\u0631\u062C\u0627\u062A \u0627\u0644\u062D\u0631\u0627\u0631\u0629 \u0627\u0644\u0642\u0635\u0648\u0649 \u0648\u062A\u0645\u0646\u0639 \u0627\u0644\u062A\u0622\u0643\u0644 \u0648\u0627\u0644\u062A\u0647\u0631\u064A\u0628."
      }
    ],
    sidebarVideosEnabled: true,
    sidebarVideoCount: 4,
    sidebarVideos: [
      { id: "vid-1", title: "\u062A\u0635\u0646\u064A\u0639 \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0627\u0644\u0630\u0647\u0628\u064A\u0629", url: "/videos/showcase-1.mp4" },
      { id: "vid-2", title: "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0644\u062D\u0627\u0645 TIG", url: "/videos/showcase-2.mp4" },
      { id: "vid-3", title: "\u0641\u0644\u0627\u062A\u0631 \u062C\u0633\u064A\u0645\u0627\u062A \u0627\u0644\u062F\u064A\u0632\u0644 DPF", url: "/videos/showcase-3.mp4" },
      { id: "vid-4", title: "\u062E\u0644\u0627\u064A\u0627 \u0627\u0644\u0633\u064A\u0631\u0627\u0645\u064A\u0643 \u0627\u0644\u0628\u0644\u0627\u062A\u064A\u0646\u064A\u0629", url: "/videos/showcase-4.mp4" }
    ],
    siteBackgroundType: "none",
    siteBackgroundUrl: "",
    siteBackgroundOpacity: 0.2,
    themePreset: "royal_gold",
    buttonStyle: "gold_wave",
    primaryGoldColor: "#D4AF37",
    backgroundColor: "#09090B",
    surfaceColor: "#131317",
    whatsappNumber: "966504597852",
    contactEmail: "uuuo333@gmail.com",
    paypalBusinessEmail: "payments@taj-catalytic.example",
    paypalMeUrl: "https://www.paypal.me/yousefAlmohamad931",
    bankTransferEnabled: true,
    bankName: "\u0645\u0635\u0631\u0641 \u0627\u0644\u0631\u0627\u062C\u062D\u064A",
    bankAccountHolder: "\u0645\u0635\u0646\u0639 \u0627\u0644\u062A\u0627\u062C \u0627\u0644\u0630\u0647\u0628\u064A \u0644\u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B",
    bankIban: "SA0000000000000000000000",
    bankAccountNumber: "",
    sarToUsdRate: 0.2667,
    instagramUrl: "https://instagram.com",
    tiktokUrl: "https://tiktok.com",
    aboutUsText: "\u0645\u0646\u0634\u0623\u0629 \u0635\u0646\u0627\u0639\u064A\u0629 \u0648\u062A\u062C\u0627\u0631\u064A\u0629 \u0645\u062A\u062E\u0635\u0635\u0629 \u0641\u064A \u0625\u0646\u062A\u0627\u062C \u0648\u062A\u0648\u0631\u064A\u062F \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0644\u0645\u0631\u0643\u0628\u0627\u062A \u0627\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646\u060C \u0648\u0641\u0644\u0627\u062A\u0631 \u0627\u0644\u0628\u064A\u0626\u0629 (DPF) \u0648\u0642\u0644\u0648\u0628 \u0627\u0644\u0633\u064A\u0631\u0627\u0645\u064A\u0643 \u0627\u0644\u062D\u0641\u0627\u0632\u0629 \u0641\u064A \u0627\u0644\u0645\u0645\u0644\u0643\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 \u0648\u0627\u0644\u062E\u0644\u064A\u062C \u0648\u0641\u0642 \u0623\u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629.",
    showShippingLogos: true,
    shippingCarriers: [
      "\u0632\u0627\u062C\u0644 (Zajil)",
      "\u0633\u0628\u0644 - \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0633\u0639\u0648\u062F\u064A (SPL)",
      "\u0623\u0631\u0627\u0645\u0643\u0633 (Aramex)",
      "\u0633\u0645\u0633\u0627 \u0625\u0643\u0633\u0628\u0631\u0633 (SMSA)",
      "DHL \u0625\u0643\u0633\u0628\u0631\u0633",
      "\u0631\u064A\u062F\u0628\u0648\u0643\u0633 (RedBox)",
      "J&T \u0625\u0643\u0633\u0628\u0631\u0633"
    ],
    loyaltyEnabled: true,
    coinValueSar: 0.1,
    dailyCheckinCoins: 25,
    coinsPer100SarPurchase: 50,
    charityPopupEnabled: true,
    charityPopupTitle: "\u062A\u0635\u062F\u0642 \u0648\u0644\u0648 \u0628\u0627\u0644\u0642\u0644\u064A\u0644.. \u0648\u0627\u062C\u0639\u0644 \u062A\u062C\u0627\u0631\u062A\u0643 \u0645\u0628\u0627\u0631\u0643\u0629",
    charityPopupVerse: "\uFD3F \u0645\u0651\u064E\u062B\u064E\u0644\u064F \u0627\u0644\u0651\u064E\u0630\u0650\u064A\u0646\u064E \u064A\u064F\u0646\u0641\u0650\u0642\u064F\u0648\u0646\u064E \u0623\u064E\u0645\u0652\u0648\u064E\u0627\u0644\u064E\u0647\u064F\u0645\u0652 \u0641\u0650\u064A \u0633\u064E\u0628\u0650\u064A\u0644\u0650 \u0627\u0644\u0644\u0651\u064E\u0647\u0650 \u0643\u064E\u0645\u064E\u062B\u064E\u0644\u0650 \u062D\u064E\u0628\u0651\u064E\u0629\u064D \u0623\u064E\u0646\u0628\u064E\u062A\u064E\u062A\u0652 \u0633\u064E\u0628\u0652\u0639\u064E \u0633\u064E\u0646\u064E\u0627\u0628\u0650\u0644\u064E \u0641\u0650\u064A \u0643\u064F\u0644\u0651\u0650 \u0633\u064F\u0646\u0628\u064F\u0644\u064E\u0629\u064D \u0645\u0651\u0650\u0627\u0626\u064E\u0629\u064F \u062D\u064E\u0628\u0651\u064E\u0629\u064D \u06D7 \u0648\u064E\u0627\u0644\u0644\u0651\u064E\u0647\u064F \u064A\u064F\u0636\u064E\u0627\u0639\u0650\u0641\u064F \u0644\u0650\u0645\u064E\u0646 \u064A\u064E\u0634\u064E\u0627\u0621\u064F \uFD3E [\u0627\u0644\u0628\u0642\u0631\u0629: 261]",
    charityUrl: "https://ehsan.sa",
    charityOrganizations: [
      {
        id: "org-ehsan",
        name: "\u0645\u0646\u0635\u0629 \u0625\u062D\u0633\u0627\u0646 \u0644\u0644\u0639\u0645\u0644 \u0627\u0644\u062E\u064A\u0631\u064A",
        description: "\u0627\u0644\u0645\u0646\u0635\u0629 \u0627\u0644\u0648\u0637\u0646\u064A\u0629 \u0627\u0644\u0631\u0633\u0645\u064A\u0629 \u0644\u0644\u062A\u0628\u0631\u0639\u0627\u062A \u0627\u0644\u062E\u064A\u0631\u064A\u0629 \u0641\u064A \u0627\u0644\u0645\u0645\u0644\u0643\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629.",
        url: "https://ehsan.sa"
      },
      {
        id: "org-ensan",
        name: "\u062C\u0645\u0639\u064A\u0629 \u0625\u0646\u0633\u0627\u0646 \u0644\u0631\u0639\u0627\u064A\u0629 \u0627\u0644\u0623\u064A\u062A\u0627\u0645",
        description: "\u0643\u0641\u0627\u0644\u0629 \u0627\u0644\u0623\u064A\u062A\u0627\u0645 \u0648\u0631\u0639\u0627\u064A\u0629 \u0623\u0633\u0631\u0647\u0645 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u0648\u0627\u0644\u0635\u062D\u064A\u0629 \u0648\u0627\u0644\u0627\u062C\u062A\u0645\u0627\u0639\u064A\u0629.",
        url: "https://ensan.org.sa"
      },
      {
        id: "org-donations",
        name: "\u0645\u0646\u0635\u0629 \u062A\u0628\u0631\u0639 \u0627\u0644\u0648\u0637\u0646\u064A\u0629",
        description: "\u0628\u0648\u0627\u0628\u0629 \u062F\u0639\u0645 \u0627\u0644\u062C\u0645\u0639\u064A\u0627\u062A \u0627\u0644\u062E\u064A\u0631\u064A\u0629 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 \u062A\u062D\u062A \u0625\u0634\u0631\u0627\u0641 \u0627\u0644\u0645\u0648\u0627\u0631\u062F \u0627\u0644\u0628\u0634\u0631\u064A\u0629.",
        url: "https://donations.sa"
      },
      {
        id: "org-shefa",
        name: "\u0645\u0646\u0635\u0629 \u0634\u0641\u0627\u0621 \u0644\u0644\u0631\u0639\u0627\u064A\u0629 \u0627\u0644\u0635\u062D\u064A\u0629",
        description: "\u062A\u0642\u062F\u064A\u0645 \u0627\u0644\u0639\u0644\u0627\u062C \u0648\u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u062C\u0631\u0627\u062D\u064A\u0629 \u0644\u0644\u0645\u0631\u0636\u0649 \u0627\u0644\u0645\u062D\u062A\u0627\u062C\u064A\u0646.",
        url: "https://shefa.sa"
      }
    ],
    seoAutoUpdateEnabled: true,
    seoLastAutoRun: (/* @__PURE__ */ new Date()).toISOString(),
    promoDiscountCodes: [
      {
        id: "promo-taj5",
        code: "TAJ5",
        discountType: "percent",
        discountValue: 5,
        isActive: true,
        usageCount: 0,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: "promo-2026",
        code: "2026",
        discountType: "fixed",
        discountValue: 50,
        isActive: true,
        usageCount: 0,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    ],
    ownerPersonalWhatsapp: "966500000000",
    ownerWhatsappWebhookUrl: "",
    autoWhatsappAlertsEnabled: true,
    ownerRecoveryEmail: "uuuo333@gmail.com",
    ownerTwoFactorEnabled: false,
    ownerTwoFactorMethod: "totp"
  };
}
function buildInitialSeed() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const defaultAdminPassword = process.env.ADMIN_PASSWORD || "604608";
  const settings = defaultSettings();
  const products = [
    {
      id: "prod-gasoline-euro6",
      sku: "TAJ-GAS-01",
      name: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0628\u0646\u0632\u064A\u0646 \u0633\u062A\u0627\u0646\u0644\u0633 \u0633\u062A\u064A\u0644 TIG \u0645\u0639 \u0645\u0646\u0627\u0641\u0630 \u062D\u0633\u0627\u0633\u0627\u062A \u0645\u0632\u062F\u0648\u062C\u0629",
      nameEn: "TIG Stainless Steel Gasoline Catalytic Converter with Dual O2 Ports",
      category: "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0628\u0646\u0632\u064A\u0646",
      priceSar: 1350,
      wholesalePriceSar: 1080,
      compareAtPriceSar: 1650,
      description: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0644\u0645\u062D\u0631\u0643\u0627\u062A \u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0627\u0644\u062D\u062F\u064A\u062B\u0629\u060C \u0645\u0635\u0646\u0639\u0629 \u0645\u0646 \u0627\u0644\u0641\u0648\u0644\u0627\u0630 \u0627\u0644\u0645\u0642\u0627\u0648\u0645 \u0644\u0644\u0635\u062F\u0623 304 \u0628\u0644\u062D\u0627\u0645 TIG \u062F\u0642\u064A\u0642\u060C \u0645\u0632\u0648\u062F\u0629 \u0628\u0645\u0646\u0641\u0630\u064A \u062D\u0633\u0627\u0633\u0627\u062A \u0623\u0643\u0633\u062C\u064A\u0646 O2 \u0648\u062E\u0644\u064A\u0629 \u0633\u064A\u0631\u0627\u0645\u064A\u0643 400 CPSI \u0645\u0634\u0628\u0639\u0629 \u0628\u0627\u0644\u0628\u0644\u0627\u062A\u064A\u0646 \u0648\u0627\u0644\u0628\u0644\u0627\u062F\u064A\u0648\u0645.",
      descriptionEn: "High-efficiency gasoline catalytic converter crafted from 304 stainless steel with TIG welding, dual O2 sensor ports, and 400 CPSI platinum/palladium ceramic core.",
      images: ["/src/assets/images/product_gasoline_cat_1794821493329.jpg"],
      specs: [
        { label: "\u0646\u0648\u0639 \u0627\u0644\u0648\u0642\u0648\u062F", value: "\u0628\u0646\u0632\u064A\u0646 (Gasoline) - 4 \u0648 6 \u0648 8 \u0633\u0644\u0646\u062F\u0631" },
        { label: "\u0627\u0644\u0645\u0639\u064A\u0627\u0631 \u0627\u0644\u0628\u064A\u0626\u064A", value: "Euro-5 / Euro-6 \u0627\u0644\u0645\u0639\u062A\u0645\u062F" },
        { label: "\u0627\u0644\u0647\u064A\u0643\u0644 \u0648\u0627\u0644\u0644\u062D\u0627\u0645", value: "\u0633\u062A\u0627\u0646\u0644\u0633 \u0633\u062A\u064A\u0644 304 \u0628\u0644\u062D\u0627\u0645 TIG \u062D\u0631\u0627\u0631\u064A" },
        { label: "\u0643\u062B\u0627\u0641\u0629 \u0627\u0644\u062E\u0644\u064A\u0629", value: "400 \u062E\u0644\u064A\u0629 \u0644\u0643\u0644 \u0628\u0648\u0635\u0629 (CPSI)" }
      ],
      fuelEfficiencyGainPercent: 14,
      inStock: true,
      isPublished: true,
      seoTitle: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0628\u0646\u0632\u064A\u0646 \u0633\u062A\u0627\u0646\u0644\u0633 \u0633\u062A\u064A\u0644 Euro-6 | \u0625\u0646\u062A\u0627\u062C \u0627\u0644\u062A\u0627\u062C \u0627\u0644\u0630\u0647\u0628\u064A",
      seoDescription: "\u0627\u0637\u0644\u0628 \u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0628\u0646\u0632\u064A\u0646 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0643\u0641\u0627\u0621\u0629 \u0628\u0645\u0646\u0627\u0641\u0630 \u062D\u0633\u0627\u0633\u0627\u062A \u0645\u0632\u062F\u0648\u062C\u0629 \u0648\u0644\u062D\u0627\u0645 TIG \u0628\u0633\u0639\u0631 1350 \u0631\u064A\u0627\u0644 \u0633\u0639\u0648\u062F\u064A \u0644\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0641\u062D\u0635 \u0627\u0644\u062F\u0648\u0631\u064A \u0648\u062A\u0646\u0642\u064A\u0629 \u0627\u0644\u0639\u0627\u062F\u0645.",
      seoKeywords: ["\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0628\u0646\u0632\u064A\u0646", "\u062F\u0628\u0629 \u0631\u0635\u0627\u0635 \u0628\u0646\u0632\u064A\u0646", "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629", "\u0645\u062D\u0648\u0644 \u062D\u0641\u0627\u0632 \u0628\u0646\u0632\u064A\u0646"],
      seoLastUpdated: now,
      createdAt: now
    },
    {
      id: "prod-diesel-dpf",
      name: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0648\u0641\u0644\u062A\u0631 \u062C\u0633\u064A\u0645\u0627\u062A \u062F\u064A\u0632\u0644 DPF \u0644\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0634\u0627\u0642\u0629",
      category: "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u062F\u064A\u0632\u0644",
      priceSar: 2850,
      compareAtPriceSar: 3400,
      description: "\u0645\u0646\u0638\u0648\u0645\u0629 \u0645\u062A\u0643\u0627\u0645\u0644\u0629 \u0644\u062A\u0646\u0642\u064A\u0629 \u0639\u0627\u062F\u0645 \u0645\u062D\u0631\u0643\u0627\u062A \u0627\u0644\u062F\u064A\u0632\u0644 (DPF + DOC) \u0644\u0644\u0633\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0631\u0628\u0627\u0639\u064A\u0629 \u0627\u0644\u062F\u0641\u0639 \u0648\u0627\u0644\u0634\u0627\u062D\u0646\u0627\u062A \u0627\u0644\u062E\u0641\u064A\u0641\u0629\u060C \u062A\u0645\u0646\u0639 \u0627\u0644\u062F\u062E\u0627\u0646 \u0627\u0644\u0623\u0633\u0648\u062F \u0648\u062A\u062E\u0641\u0636 \u0627\u0644\u0627\u0646\u0628\u0639\u0627\u062B\u0627\u062A \u0645\u0639 \u062F\u0639\u0645 \u0643\u0627\u0645\u0644 \u0644\u062D\u0633\u0627\u0633\u0627\u062A \u0627\u0644\u0636\u063A\u0637 \u0648\u0627\u0644\u062D\u0631\u0627\u0631\u0629.",
      images: ["/src/assets/images/product_diesel_dpf_1794821492144.jpg"],
      specs: [
        { label: "\u0646\u0648\u0639 \u0627\u0644\u0648\u0642\u0648\u062F", value: "\u062F\u064A\u0632\u0644 (Diesel Turbo / Common Rail)" },
        { label: "\u0627\u0644\u0646\u0638\u0627\u0645", value: "\u0641\u0644\u062A\u0631 \u062C\u0633\u064A\u0645\u0627\u062A DPF + \u0645\u062D\u0641\u0632 \u0623\u0643\u0633\u062F\u0629 DOC" },
        { label: "\u0645\u0642\u0627\u0648\u0645\u0629 \u0627\u0644\u062D\u0631\u0627\u0631\u0629", value: "\u062D\u062A\u0649 1100 \u062F\u0631\u062C\u0629 \u0645\u0626\u0648\u064A\u0629" },
        { label: "\u0627\u0644\u062A\u0648\u0635\u064A\u0644\u0627\u062A", value: "\u0641\u0644\u0646\u062C\u0627\u062A \u0648\u062D\u0633\u0627\u0633\u0627\u062A \u0636\u063A\u0637 \u062A\u0641\u0627\u0636\u0644\u064A \u062C\u0627\u0647\u0632\u0629" }
      ],
      inStock: true,
      isPublished: true,
      seoTitle: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u062F\u064A\u0632\u0644 \u0648\u0641\u0644\u062A\u0631 DPF \u0644\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0634\u0627\u0642\u0629 | \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A",
      seoDescription: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u062F\u064A\u0632\u0644 \u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629 \u0645\u0639 \u0641\u0644\u062A\u0631 \u062C\u0633\u064A\u0645\u0627\u062A DPF \u0648\u0645\u0646\u0627\u0641\u0630 \u062D\u0633\u0627\u0633\u0627\u062A \u0644\u0645\u0646\u0639 \u0627\u0644\u062F\u062E\u0627\u0646 \u0627\u0644\u0623\u0633\u0648\u062F \u0648\u062A\u062D\u0633\u064A\u0646 \u0623\u062F\u0627\u0621 \u0627\u0644\u062A\u064A\u0631\u0628\u0648 \u0628\u0633\u0639\u0631 2850 \u0631\u064A\u0627\u0644 \u0633\u0639\u0648\u062F\u064A.",
      seoKeywords: ["\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u062F\u064A\u0632\u0644", "\u0641\u0644\u062A\u0631 DPF \u062F\u064A\u0632\u0644", "\u0645\u0646\u0639 \u062F\u062E\u0627\u0646 \u0627\u0644\u062F\u064A\u0632\u0644", "\u062F\u0628\u0629 \u0628\u064A\u0626\u0629 \u062F\u064A\u0632\u0644"],
      seoLastUpdated: now,
      createdAt: now
    },
    {
      id: "prod-ceramic-core",
      name: "\u0642\u0644\u0628 \u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0633\u064A\u0631\u0627\u0645\u064A\u0643 \u062D\u0641\u0627\u0632 (\u062D\u0634\u0648\u0629 \u0628\u0644\u0627\u062A\u064A\u0646 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0643\u062B\u0627\u0641\u0629)",
      category: "\u0642\u0644\u0648\u0628 \u0648\u062D\u0634\u0648\u0627\u062A \u0627\u0644\u0633\u064A\u0631\u0627\u0645\u064A\u0643",
      priceSar: 780,
      compareAtPriceSar: 950,
      description: "\u0642\u0644\u0628 \u0633\u064A\u0631\u0627\u0645\u064A\u0643 \u062F\u0627\u062E\u0644\u064A \u0628\u0646\u0638\u0627\u0645 \u0642\u0631\u0635 \u0627\u0644\u0639\u0633\u0644 (Honeycomb) \u0645\u0637\u0644\u064A \u0628\u0637\u0628\u0642\u0629 \u0645\u0639\u0627\u062F\u0646 \u062B\u0645\u064A\u0646\u0629 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u062A\u0631\u0643\u064A\u0632 (\u0628\u0644\u0627\u062A\u064A\u0646\u060C \u0628\u0627\u0644\u0627\u062F\u064A\u0648\u0645\u060C \u0631\u0648\u062F\u064A\u0648\u0645) \u0644\u0625\u0639\u0627\u062F\u0629 \u062A\u0623\u0647\u064A\u0644 \u0648\u062A\u0635\u0646\u064A\u0639 \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0644\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0628\u0643\u0641\u0627\u0621\u0629 \u0627\u0644\u0645\u0635\u0646\u0639.",
      images: ["/src/assets/images/product_ceramic_core_1794821493246.jpg"],
      specs: [
        { label: "\u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645", value: "\u062A\u062C\u0645\u064A\u0639 \u0648\u062A\u0635\u0646\u064A\u0639 \u062F\u0628\u0627\u062A \u0627\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646" },
        { label: "\u0627\u0644\u0637\u0644\u0627\u0621 \u0627\u0644\u062D\u0641\u0627\u0632", value: "\u0628\u0644\u0627\u062A\u064A\u0646 + \u0628\u0627\u0644\u0627\u062F\u064A\u0648\u0645 + \u0631\u0648\u062F\u064A\u0648\u0645 \u0639\u0627\u0644\u064A \u0627\u0644\u062A\u0631\u0643\u064A\u0632" },
        { label: "\u062A\u0646\u0648\u0639 \u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062A", value: "\u0645\u062A\u0648\u0641\u0631 \u0628\u0623\u0642\u0637\u0627\u0631 4 / 4.5 / 5 \u0628\u0648\u0635\u0629" },
        { label: "\u062A\u062F\u0641\u0642 \u0627\u0644\u0647\u0648\u0627\u0621", value: "\u0627\u0646\u0633\u064A\u0627\u0628\u064A \u064A\u0645\u0646\u0639 \u0643\u062A\u0645\u0629 \u0627\u0644\u0645\u062D\u0631\u0643" }
      ],
      inStock: true,
      isPublished: true,
      seoTitle: "\u0642\u0644\u0628 \u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0633\u064A\u0631\u0627\u0645\u064A\u0643 \u062D\u0634\u0648\u0629 \u0628\u0644\u0627\u062A\u064A\u0646 | \u062A\u0635\u0646\u064A\u0639 \u062F\u0628\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629",
      seoDescription: "\u062D\u0634\u0648\u0629 \u0648\u0642\u0644\u0628 \u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0633\u064A\u0631\u0627\u0645\u064A\u0643 \u0623\u0635\u0644\u064A \u0645\u0634\u0628\u0639 \u0628\u0627\u0644\u0628\u0644\u0627\u062A\u064A\u0646 \u0644\u0625\u0639\u0627\u062F\u0629 \u062A\u0635\u0646\u064A\u0639 \u0648\u062A\u062C\u062F\u064A\u062F \u062F\u0628\u0627\u062A \u0627\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0628\u0633\u0639\u0631 780 \u0631\u064A\u0627\u0644 \u0633\u0639\u0648\u062F\u064A.",
      seoKeywords: ["\u0642\u0644\u0628 \u062F\u0628\u0629 \u062A\u0644\u0648\u062B", "\u062D\u0634\u0648\u0629 \u062F\u0628\u0629 \u0627\u0644\u0631\u0635\u0627\u0635", "\u0633\u064A\u0631\u0627\u0645\u064A\u0643 \u062F\u0628\u0629 \u0627\u0644\u062A\u0644\u0648\u062B", "\u0631\u0635\u0627\u0635 \u062F\u0628\u0629 \u0627\u0644\u0628\u064A\u0626\u0629"],
      seoLastUpdated: now,
      createdAt: now
    },
    {
      id: "prod-universal-kit",
      name: "\u0637\u0642\u0645 \u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0648\u0643\u0627\u062A\u0645 \u0639\u0627\u062F\u0645 Euro-6 \u0634\u0627\u0645\u0644 \u0627\u0644\u0641\u0644\u0646\u062C\u0627\u062A (\u062F\u064A\u0632\u0644 \u0648\u0628\u0646\u0632\u064A\u0646)",
      category: "\u0623\u0637\u0642\u0645 \u0627\u0644\u0639\u0627\u062F\u0645 \u0648\u0627\u0644\u0641\u0644\u0646\u062C\u0627\u062A",
      priceSar: 1890,
      description: "\u0637\u0642\u0645 \u0625\u0646\u062A\u0627\u062C \u0645\u062A\u0643\u0627\u0645\u0644 \u064A\u062C\u0645\u0639 \u062F\u0628\u0629 \u0627\u0644\u062A\u0644\u0648\u062B \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 \u0648\u0643\u0627\u062A\u0645 \u0627\u0644\u0635\u0648\u062A \u0627\u0644\u062E\u0644\u0641\u064A \u0645\u0639 \u062C\u0645\u064A\u0639 \u0627\u0644\u0641\u0644\u0646\u062C\u0627\u062A \u0627\u0644\u0645\u0639\u062F\u0646\u064A\u0629 \u0648\u0627\u0644\u062C\u0627\u0632\u0643\u064A\u062A\u0627\u062A \u0627\u0644\u062D\u0631\u0627\u0631\u064A\u0629 \u0648\u0645\u0633\u0627\u0645\u064A\u0631 \u0627\u0644\u062A\u062B\u0628\u064A\u062A \u0644\u0644\u062A\u0631\u0643\u064A\u0628 \u0627\u0644\u0633\u0631\u064A\u0639 \u0639\u0644\u0649 \u0645\u062E\u062A\u0644\u0641 \u0627\u0644\u0633\u064A\u0627\u0631\u0627\u062A.",
      images: ["/src/assets/images/product_universal_exhaust_1794821493897.jpg"],
      specs: [
        { label: "\u0627\u0644\u062A\u0648\u0627\u0641\u0642", value: "\u0645\u062A\u0648\u0627\u0641\u0642 \u0645\u0639 \u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0648\u0627\u0644\u062F\u064A\u0632\u0644 (2.5 / 3 \u0628\u0648\u0635\u0629)" },
        { label: "\u0645\u062D\u062A\u0648\u064A\u0627\u062A \u0627\u0644\u0637\u0642\u0645", value: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B + \u0643\u0627\u062A\u0645 + 4 \u0641\u0644\u0646\u062C\u0627\u062A + \u062C\u0627\u0632\u0643\u064A\u062A\u0627\u062A \u0648\u0645\u0633\u0627\u0645\u064A\u0631" },
        { label: "\u0627\u0644\u062E\u0627\u0645\u0629", value: "\u0641\u0648\u0644\u0627\u0630 \u0645\u0642\u0627\u0648\u0645 \u0644\u0644\u0635\u062F\u0623 \u0648\u0645\u0637\u0627\u0628\u0642 \u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062A OEM" }
      ],
      inStock: true,
      isPublished: true,
      seoTitle: "\u0637\u0642\u0645 \u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0648\u0643\u0627\u062A\u0645 Euro-6 \u0645\u0639 \u0627\u0644\u0641\u0644\u0646\u062C\u0627\u062A | \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A",
      seoDescription: "\u0637\u0642\u0645 \u0645\u062A\u0643\u0627\u0645\u0644 \u0644\u062F\u0628\u0629 \u0627\u0644\u062A\u0644\u0648\u062B \u0648\u0643\u0627\u062A\u0645 \u0627\u0644\u0639\u0627\u062F\u0645 \u0628\u0641\u0644\u0646\u062C\u0627\u062A \u0627\u0644\u062A\u0631\u0643\u064A\u0628 \u0644\u0633\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0648\u0627\u0644\u062F\u064A\u0632\u0644 \u0628\u0633\u0639\u0631 1890 \u0631\u064A\u0627\u0644 \u0633\u0639\u0648\u062F\u064A.",
      seoKeywords: ["\u0637\u0642\u0645 \u062F\u0628\u0629 \u062A\u0644\u0648\u062B", "\u0641\u0644\u0646\u062C\u0627\u062A \u062F\u0628\u0629 \u0627\u0644\u062A\u0644\u0648\u062B", "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0639\u0627\u0644\u0645\u064A\u0629 Euro 6"],
      seoLastUpdated: now,
      createdAt: now
    },
    {
      id: "prod-titanium-hybrid",
      name: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0647\u062C\u064A\u0646\u0629 \u0645\u062A\u0637\u0648\u0631\u0629 (\u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0630\u0647\u0628\u064A \u0639\u0627\u0644\u064A \u0627\u0644\u0623\u062F\u0627\u0621)",
      category: "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0628\u0646\u0632\u064A\u0646",
      priceSar: 2150,
      description: "\u0625\u0635\u062F\u0627\u0631 \u0647\u0646\u062F\u0633\u064A \u0641\u0627\u062E\u0631 \u064A\u062C\u0645\u0639 \u0628\u064A\u0646 \u0627\u0644\u0645\u0631\u0648\u0646\u0629 \u0627\u0644\u0645\u0642\u0627\u0648\u0645\u0629 \u0644\u0644\u0627\u0647\u062A\u0632\u0627\u0632 (Flex Pipe) \u0648\u0645\u0628\u062F\u062F \u0627\u0644\u062D\u0631\u0627\u0631\u0629 \u0627\u0644\u0630\u0647\u0628\u064A\u060C \u0645\u0635\u0645\u0645 \u062E\u0635\u064A\u0635\u0627\u064B \u0644\u0633\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u062F\u0641\u0639 \u0627\u0644\u0631\u0628\u0627\u0639\u064A \u0648\u0627\u0644\u0645\u062D\u0631\u0643\u0627\u062A \u0630\u0627\u062A \u0627\u0644\u0639\u0632\u0645 \u0627\u0644\u0639\u0627\u0644\u064A.",
      images: ["/src/assets/images/hero_catalytic_gold_1794821492784.jpg"],
      specs: [
        { label: "\u0627\u0644\u062A\u0635\u0645\u064A\u0645", value: "\u0648\u0635\u0644\u0629 \u0645\u0631\u0646\u0629 \u0645\u062F\u0645\u062C\u0629 + \u062F\u0631\u0639 \u062D\u0631\u0627\u0631\u064A \u0630\u0647\u0628\u064A" },
        { label: "\u0627\u0644\u0633\u0639\u0629 \u0627\u0644\u0645\u062F\u0639\u0648\u0645\u0629", value: "\u0645\u062D\u0631\u0643\u0627\u062A \u0645\u0646 2.0 \u0644\u062A\u0631 \u062D\u062A\u0649 5.7 \u0644\u062A\u0631" },
        { label: "\u0645\u0646\u0627\u0641\u0630 \u0627\u0644\u062D\u0633\u0627\u0633\u0627\u062A", value: "\u0645\u0646\u0641\u0630\u0627\u0646 \u0628\u0645\u0633\u0646\u0646\u0627\u062A \u0642\u064A\u0627\u0633\u064A\u0629 M18x1.5" }
      ],
      inStock: true,
      isPublished: true,
      seoTitle: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0623\u062F\u0627\u0621 \u0628\u0648\u0635\u0644\u0629 \u0645\u0631\u0646\u0629 | \u0625\u0646\u062A\u0627\u062C \u0627\u0644\u062A\u0627\u062C \u0627\u0644\u0630\u0647\u0628\u064A",
      seoDescription: "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0645\u0637\u0648\u0631\u0629 \u0628\u0648\u0635\u0644\u0629 \u0645\u0631\u0646\u0629 \u0648\u062F\u0631\u0639 \u062D\u0631\u0627\u0631\u064A \u0644\u0633\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u062F\u0641\u0639 \u0627\u0644\u0631\u0628\u0627\u0639\u064A \u0648\u0645\u062D\u0631\u0643\u0627\u062A \u0627\u0644\u0639\u0632\u0645 \u0627\u0644\u0639\u0627\u0644\u064A \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A.",
      seoKeywords: ["\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0631\u064A\u0627\u0636\u064A\u0629", "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u062C\u064A\u0628", "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B 8 \u0633\u0644\u0646\u062F\u0631"],
      seoLastUpdated: now,
      createdAt: now
    },
    {
      id: "draft-secret-sample",
      name: "\u0645\u0633\u0648\u062F\u0629 \u062E\u0627\u0635\u0629: \u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0634\u0627\u062D\u0646\u0627\u062A \u062F\u064A\u0632\u0644 \u062B\u0642\u064A\u0644\u0629 Euro-6 (\u0645\u062E\u0641\u064A)",
      category: "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u062F\u064A\u0632\u0644",
      priceSar: 4200,
      description: "\u0645\u0646\u062A\u062C \u062A\u0645 \u0633\u062D\u0628\u0647 \u0648\u062D\u0641\u0638\u0647 \u0643\u0645\u0633\u0648\u062F\u0629 \u0633\u0631\u064A\u0629 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0648\u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u0642\u0628\u0644 \u0627\u0644\u0646\u0634\u0631 \u0644\u0644\u0645\u062A\u062C\u0631. \u0644\u0627 \u064A\u0638\u0647\u0631 \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0646\u0647\u0627\u0626\u064A\u0627\u064B \u062D\u062A\u0649 \u064A\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u062E\u064A\u0627\u0631 \u0627\u0644\u0646\u0634\u0631.",
      images: ["/src/assets/images/product_diesel_dpf_1794821492144.jpg"],
      specs: [
        { label: "\u0627\u0644\u062D\u0627\u0644\u0629", value: "\u0645\u0633\u0648\u062F\u0629 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0645\u0646 \u0627\u0644\u0645\u0627\u0644\u0643" }
      ],
      inStock: true,
      isPublished: false,
      isScrapedDraft: true,
      sourceUrl: "https://private-supplier-catalog.example/item/heavy-diesel-dpf-euro6",
      originalExtractedPrice: "$780 USD",
      createdAt: now
    }
  ];
  const banners = [
    {
      id: "banner-royal-launch",
      title: "\u062E\u0635\u0648\u0645\u0627\u062A \u0627\u0644\u0625\u0646\u062A\u0627\u062C \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0644\u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B 2026",
      subtitle: "\u0625\u0646\u062A\u0627\u062C \u0645\u062D\u0644\u064A \u0641\u0627\u0626\u0642 \u0627\u0644\u062C\u0648\u062F\u0629 \u0644\u0633\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0645\u0639 \u0636\u0645\u0627\u0646 \u0627\u062C\u062A\u064A\u0627\u0632 \u0627\u0644\u0641\u062D\u0635 \u0627\u0644\u062F\u0648\u0631\u064A",
      ctaText: "\u0627\u0633\u062A\u0639\u0631\u0636 \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B",
      discountLabel: "\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0645\u0635\u0646\u0639",
      accentColor: "#D4AF37",
      isActive: true,
      googleAdsHeadlines: [
        "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u062F\u064A\u0632\u0644 \u0648\u0628\u0646\u0632\u064A\u0646 \u0623\u0635\u0644\u064A\u0629",
        "\u0625\u0646\u062A\u0627\u062C \u0645\u0628\u0627\u0634\u0631 \u0628\u0636\u0645\u0627\u0646 \u0627\u0644\u0641\u062D\u0635 \u0627\u0644\u062F\u0648\u0631\u064A",
        "\u0641\u0644\u0627\u062A\u0631 \u0628\u064A\u0626\u0629 DPF \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A"
      ],
      googleAdsDescriptions: [
        "\u062A\u062E\u0644\u0635 \u0645\u0646 \u0644\u0645\u0628\u0629 \u0627\u0644\u0645\u062D\u0631\u0643 \u0648\u0627\u0644\u062F\u062E\u0627\u0646 \u0627\u0644\u0623\u0633\u0648\u062F \u0628\u0623\u0639\u0644\u0649 \u062C\u0648\u062F\u0629 \u062A\u0635\u0646\u064A\u0639 \u0648\u0628\u0633\u0639\u0631 \u0627\u0644\u0645\u0635\u0646\u0639 \u0627\u0644\u0645\u0628\u0627\u0634\u0631."
      ],
      googleAdsKeywords: ["\u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B", "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u062F\u064A\u0632\u0644", "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u0628\u0646\u0632\u064A\u0646", "\u0641\u0644\u062A\u0631 DPF"],
      createdAt: now
    }
  ];
  const assistantMessages = [
    {
      id: "msg-welcome",
      role: "assistant",
      text: "\u0645\u0631\u062D\u0628\u0627\u064B \u0628\u0643 \u064A\u0627 \u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u062A\u062C\u0631! \u0623\u0646\u0627 \u0645\u0633\u0627\u0639\u062F\u0643 \u0627\u0644\u0634\u062E\u0635\u064A \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A. \u0623\u0633\u062A\u0637\u064A\u0639 \u062A\u0646\u0628\u064A\u0647\u0643 \u0639\u0644\u0649 \u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0648\u0627\u0644\u0637\u0644\u0628\u0627\u062A\u060C \u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C\u0627\u062A \u062C\u062F\u064A\u062F\u0629 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A\u060C \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0623\u0648 \u0627\u0644\u0646\u0634\u0631 \u0641\u0648\u0631\u0627\u064B\u060C \u0648\u062A\u062C\u0647\u064A\u0632 \u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0644\u0625\u0631\u0633\u0627\u0644\u0647\u0627 \u0625\u0644\u0649 \u0648\u0627\u062A\u0633\u0627\u0628\u0643 \u0627\u0644\u062E\u0627\u0635.",
      createdAt: now
    }
  ];
  return {
    adminPasswordHash: hashPassword(defaultAdminPassword),
    settings,
    products,
    banners,
    customers: [],
    orders: [],
    assistantMessages,
    analytics: {
      totalVisits: 0,
      uniqueVisitorTokens: [],
      searchQueries: [],
      updatedAt: now
    }
  };
}
var cachedDb = null;
function ensureDb() {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = buildInitialSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
    cachedDb = seed;
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const defaults = defaultSettings();
    parsed.settings = { ...defaults, ...parsed.settings || {} };
    if (!parsed.settings.whatsappNumber || parsed.settings.whatsappNumber === "966500000000") {
      parsed.settings.whatsappNumber = "966504597852";
    }
    if (!parsed.settings.contactEmail || parsed.settings.contactEmail === "dbattloth.2@gmail.com") {
      parsed.settings.contactEmail = "uuuo333@gmail.com";
      saveDb(parsed);
    }
    if (!parsed.settings.paypalMeUrl) {
      parsed.settings.paypalMeUrl = "https://www.paypal.me/yousefAlmohamad931";
    }
    if (!parsed.settings.ownerRecoveryEmail) {
      parsed.settings.ownerRecoveryEmail = "uuuo333@gmail.com";
    }
    if (typeof parsed.settings.storeOpen !== "boolean") {
      parsed.settings.storeOpen = true;
    }
    if (!Array.isArray(parsed.settings.categories) || parsed.settings.categories.length === 0) {
      parsed.settings.categories = defaults.categories;
    }
    if (!Array.isArray(parsed.settings.sidebarVideos) || parsed.settings.sidebarVideos.length === 0) {
      parsed.settings.sidebarVideos = defaults.sidebarVideos;
    }
    if (!Array.isArray(parsed.settings.shippingCarriers) || parsed.settings.shippingCarriers.length === 0) {
      parsed.settings.shippingCarriers = defaults.shippingCarriers;
    }
    if (!Array.isArray(parsed.settings.charityOrganizations) || parsed.settings.charityOrganizations.length === 0) {
      parsed.settings.charityOrganizations = defaults.charityOrganizations;
    }
    if (!Array.isArray(parsed.settings.promoDiscountCodes)) {
      parsed.settings.promoDiscountCodes = defaults.promoDiscountCodes;
    }
    if (!parsed.settings.currencyRates) {
      parsed.settings.currencyRates = defaults.currencyRates;
    }
    parsed.adminTwoFactorEnabled = false;
    parsed.settings.ownerTwoFactorEnabled = false;
    if (!Array.isArray(parsed.reviews)) {
      parsed.reviews = [];
    }
    parsed.customers = (parsed.customers || []).map((c) => ({
      ...c,
      goldenCoins: typeof c.goldenCoins === "number" ? c.goldenCoins : 0,
      coupons: Array.isArray(c.coupons) ? c.coupons : []
    }));
    if (!Array.isArray(parsed.assistantMessages)) {
      parsed.assistantMessages = buildInitialSeed().assistantMessages;
    }
    if (!parsed.analytics) {
      parsed.analytics = {
        totalVisits: 0,
        uniqueVisitorTokens: [],
        searchQueries: [],
        dailySearchCounts: {},
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    if (!parsed.adminPasswordHash || verifyPassword("Admin@2026", parsed.adminPasswordHash)) {
      parsed.adminPasswordHash = hashPassword(process.env.ADMIN_PASSWORD || "604608");
      saveDb(parsed);
    }
    cachedDb = parsed;
    return cachedDb;
  } catch {
    const seed = buildInitialSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
    cachedDb = seed;
    return cachedDb;
  }
}
function saveDb(db) {
  cachedDb = db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmpFile, DB_FILE);
}
function saveUploadedMedia(filename, mimeType, dataBase64) {
  ensureDb();
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const rawExt = path.extname(filename).replace(".", "").toLowerCase();
  const mimeSub = mimeType.split("/")[1]?.toLowerCase() || "";
  let ext = rawExt && /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : "";
  if (!ext) {
    if (mimeSub.includes("quicktime")) ext = "mov";
    else if (mimeSub.includes("mp4")) ext = "mp4";
    else if (mimeSub.includes("webm")) ext = "webm";
    else ext = mimeSub.replace(/[^a-z0-9]/gi, "") || "bin";
  }
  const baseName = path.basename(filename, path.extname(filename)).replace(/[^a-z0-9_-]/gi, "_").slice(0, 32);
  const finalName = `${baseName || "media"}_${Date.now()}.${ext}`;
  const cleanB64 = dataBase64.includes(",") ? dataBase64.split(",")[1] : dataBase64;
  const buf = Buffer.from(cleanB64, "base64");
  fs.writeFileSync(path.join(UPLOADS_DIR, finalName), buf);
  return `/uploads/${finalName}`;
}
function stripPrivateProductFields(product) {
  const {
    sourceUrl: _s,
    isScrapedDraft: _d,
    originalExtractedPrice: _o,
    costPriceSar: _c,
    profitMarginPercent: _p,
    ...pub
  } = product;
  return pub;
}
function getPublicSettings() {
  const db = ensureDb();
  const {
    paypalBusinessEmail,
    promoDiscountCodes: _pdc,
    ownerPersonalWhatsapp: _ow,
    ownerWhatsappWebhookUrl: _wh,
    autoWhatsappAlertsEnabled: _aw,
    ownerRecoveryEmail: _re,
    ownerTwoFactorEnabled: _tfe,
    ownerTwoFactorMethod: _tfm,
    showImageUrlFields: _siu,
    ...rest
  } = db.settings;
  return {
    ...rest,
    paypalMerchantLabel: paypalBusinessEmail ? "PayPal Verified Merchant" : "PayPal"
  };
}
function getAdminSettings() {
  const db = ensureDb();
  return {
    ...db.settings,
    ownerTwoFactorEnabled: Boolean(db.adminTwoFactorEnabled),
    ownerTwoFactorMethod: db.adminTwoFactorMethod || "totp"
  };
}
function updateSettings(patch) {
  const db = ensureDb();
  const {
    ownerTwoFactorEnabled: _tfe,
    ownerTwoFactorMethod: _tfm,
    ...safePatch
  } = patch;
  if (Array.isArray(safePatch.promoDiscountCodes)) {
    safePatch.promoDiscountCodes = safePatch.promoDiscountCodes.map((item) => ({
      ...item,
      code: String(item.code || "").trim().toUpperCase().slice(0, 4),
      discountValue: Math.max(0, Number(item.discountValue) || 0)
    })).filter((item) => item.code.length === 4);
  }
  db.settings = { ...db.settings, ...safePatch };
  saveDb(db);
  return getAdminSettings();
}
function verifyAdminPassword(password) {
  const db = ensureDb();
  return verifyPassword(password, db.adminPasswordHash);
}
function updateAdminPassword(newPassword) {
  const db = ensureDb();
  db.adminPasswordHash = hashPassword(newPassword);
  delete db.adminResetCodeHash;
  delete db.adminResetExpiresAt;
  saveDb(db);
}
function requestAdminPasswordReset(emailInput) {
  const db = ensureDb();
  const configuredEmail = (db.settings.ownerRecoveryEmail || "uuuo333@gmail.com").trim().toLowerCase();
  const candidate = emailInput.trim().toLowerCase();
  const allowedEmails = /* @__PURE__ */ new Set([configuredEmail, "dbattloth.221@gmail.com"]);
  if (!candidate || !allowedEmails.has(candidate)) {
    return {
      ok: false,
      error: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0627\u0644\u0645\u062F\u062E\u0644 \u063A\u064A\u0631 \u0645\u0637\u0627\u0628\u0642 \u0644\u0628\u0631\u064A\u062F \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0627\u0644\u0643."
    };
  }
  const code = String(crypto.randomInt(1e5, 999999));
  db.adminResetCodeHash = hashPassword(code);
  db.adminResetExpiresAt = Date.now() + 15 * 60 * 1e3;
  saveDb(db);
  return {
    ok: true,
    code,
    recoveryEmail: candidate
  };
}
function confirmAdminPasswordReset(emailInput, code, newPassword) {
  const db = ensureDb();
  const configuredEmail = (db.settings.ownerRecoveryEmail || "uuuo333@gmail.com").trim().toLowerCase();
  const candidate = emailInput.trim().toLowerCase();
  const allowedEmails = /* @__PURE__ */ new Set([configuredEmail, "dbattloth.221@gmail.com"]);
  if (!candidate || !allowedEmails.has(candidate)) {
    return { ok: false, error: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u063A\u064A\u0631 \u0645\u0637\u0627\u0628\u0642." };
  }
  if (!db.adminResetCodeHash || !db.adminResetExpiresAt || Date.now() > db.adminResetExpiresAt) {
    return { ok: false, error: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0623\u0648 \u0644\u0645 \u064A\u062A\u0645 \u0637\u0644\u0628\u0647 \u0628\u0639\u062F." };
  }
  if (!verifyPassword(code.trim(), db.adminResetCodeHash)) {
    return { ok: false, error: "\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D." };
  }
  db.adminPasswordHash = hashPassword(newPassword);
  delete db.adminResetCodeHash;
  delete db.adminResetExpiresAt;
  saveDb(db);
  return { ok: true };
}
function getAdminTwoFactorStatus() {
  const db = ensureDb();
  return {
    enabled: Boolean(db.adminTwoFactorEnabled),
    method: db.adminTwoFactorMethod || "totp",
    hasTotpSecret: Boolean(db.adminTotpSecret),
    backupCodesRemaining: (db.adminTwoFactorBackupCodeHashes || []).length,
    recoveryEmail: db.settings.ownerRecoveryEmail || "uuuo333@gmail.com"
  };
}
function beginAdminTotpSetup() {
  const db = ensureDb();
  const secret = generateBase32Secret(20);
  db.adminTotpPendingSecret = secret;
  saveDb(db);
  const issuer = encodeURIComponent("Taj Al-Dhahabi Admin");
  const account = encodeURIComponent(db.settings.ownerRecoveryEmail || "uuuo333@gmail.com");
  const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauthUrl };
}
function confirmAdminTotpSetup(code) {
  const db = ensureDb();
  const pending = db.adminTotpPendingSecret;
  if (!pending) {
    return { ok: false, error: "\u0644\u0645 \u064A\u062A\u0645 \u0628\u062F\u0621 \u0625\u0639\u062F\u0627\u062F \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629. \u0627\u0636\u063A\u0637 \u0625\u0646\u0634\u0627\u0621 \u0631\u0645\u0632 QR \u0623\u0648\u0644\u0627\u064B." };
  }
  if (!verifyTotpCode(pending, code, 1)) {
    return {
      ok: false,
      error: "\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u0645\u0643\u0648\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D. \u062A\u0623\u0643\u062F \u0645\u0646 \u0645\u0632\u0627\u0645\u0646\u0629 \u0648\u0642\u062A \u0627\u0644\u062C\u0647\u0627\u0632 \u0648\u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u0627\u064B."
    };
  }
  const backupCodes = generateBackupCodesSet(8);
  db.adminTotpSecret = pending;
  delete db.adminTotpPendingSecret;
  db.adminTwoFactorEnabled = true;
  db.adminTwoFactorMethod = "totp";
  db.adminTwoFactorBackupCodeHashes = backupCodes.map((c) => hashPassword(c));
  db.settings.ownerTwoFactorEnabled = true;
  db.settings.ownerTwoFactorMethod = "totp";
  saveDb(db);
  return { ok: true, backupCodes };
}
function enableAdminEmailTwoFactor() {
  const db = ensureDb();
  const backupCodes = generateBackupCodesSet(8);
  db.adminTwoFactorEnabled = true;
  db.adminTwoFactorMethod = "email";
  db.adminTwoFactorBackupCodeHashes = backupCodes.map((c) => hashPassword(c));
  db.settings.ownerTwoFactorEnabled = true;
  db.settings.ownerTwoFactorMethod = "email";
  saveDb(db);
  return { backupCodes };
}
function disableAdminTwoFactor(currentPassword) {
  const db = ensureDb();
  if (!verifyPassword(currentPassword, db.adminPasswordHash)) {
    return { ok: false, error: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0627\u0644\u0643 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629." };
  }
  db.adminTwoFactorEnabled = false;
  delete db.adminTotpSecret;
  delete db.adminTotpPendingSecret;
  delete db.adminTwoFactorBackupCodeHashes;
  delete db.adminLoginOtpHash;
  delete db.adminLoginOtpExpiresAt;
  db.settings.ownerTwoFactorEnabled = false;
  saveDb(db);
  return { ok: true };
}
function regenerateAdminBackupCodes() {
  const db = ensureDb();
  const backupCodes = generateBackupCodesSet(8);
  db.adminTwoFactorBackupCodeHashes = backupCodes.map((c) => hashPassword(c));
  saveDb(db);
  return backupCodes;
}
function issueAdminEmailLoginOtp() {
  const db = ensureDb();
  const code = String(crypto.randomInt(1e5, 999999));
  db.adminLoginOtpHash = hashPassword(code);
  db.adminLoginOtpExpiresAt = Date.now() + 10 * 60 * 1e3;
  saveDb(db);
  return {
    code,
    recoveryEmail: db.settings.ownerRecoveryEmail || "uuuo333@gmail.com"
  };
}
function verifyAdminSecondFactor(codeInput) {
  const db = ensureDb();
  const clean = codeInput.trim().toUpperCase();
  if (!clean) {
    return { ok: false, error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u062B\u0646\u0627\u0626\u064A." };
  }
  if (db.adminTotpSecret && verifyTotpCode(db.adminTotpSecret, clean, 1)) {
    delete db.adminLoginOtpHash;
    delete db.adminLoginOtpExpiresAt;
    saveDb(db);
    return { ok: true };
  }
  if (db.adminLoginOtpHash && db.adminLoginOtpExpiresAt && Date.now() <= db.adminLoginOtpExpiresAt && verifyPassword(clean, db.adminLoginOtpHash)) {
    delete db.adminLoginOtpHash;
    delete db.adminLoginOtpExpiresAt;
    saveDb(db);
    return { ok: true };
  }
  const hashes = db.adminTwoFactorBackupCodeHashes || [];
  for (let i = 0; i < hashes.length; i++) {
    if (verifyPassword(clean, hashes[i])) {
      db.adminTwoFactorBackupCodeHashes = hashes.filter((_, idx) => idx !== i);
      delete db.adminLoginOtpHash;
      delete db.adminLoginOtpExpiresAt;
      saveDb(db);
      return { ok: true, usedBackupCode: true };
    }
  }
  return { ok: false, error: "\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u062B\u0646\u0627\u0626\u064A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D \u0623\u0648 \u0645\u0646\u062A\u0647\u064A \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629." };
}
function getPublishedProducts() {
  const db = ensureDb();
  return db.products.filter((p) => p.isPublished === true).map(stripPrivateProductFields);
}
function getAllProductsAdmin() {
  return [...ensureDb().products];
}
function getProductByIdAdmin(id) {
  return ensureDb().products.find((p) => p.id === id);
}
function createProduct(product) {
  const db = ensureDb();
  db.products.unshift(product);
  saveDb(db);
  return product;
}
function updateProduct(id, patch) {
  const db = ensureDb();
  const idx = db.products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  db.products[idx] = { ...db.products[idx], ...patch, id };
  saveDb(db);
  return db.products[idx];
}
function deleteProduct(id) {
  const db = ensureDb();
  const before = db.products.length;
  db.products = db.products.filter((p) => p.id !== id);
  if (db.products.length === before) return false;
  saveDb(db);
  return true;
}
function getActiveBanners() {
  return ensureDb().banners.filter((b) => b.isActive);
}
function getAllBannersAdmin() {
  return [...ensureDb().banners];
}
function createBanner(banner) {
  const db = ensureDb();
  db.banners.unshift(banner);
  saveDb(db);
  return banner;
}
function updateBanner(id, patch) {
  const db = ensureDb();
  const idx = db.banners.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  db.banners[idx] = { ...db.banners[idx], ...patch, id };
  saveDb(db);
  return db.banners[idx];
}
function deleteBanner(id) {
  const db = ensureDb();
  const before = db.banners.length;
  db.banners = db.banners.filter((b) => b.id !== id);
  if (db.banners.length === before) return false;
  saveDb(db);
  return true;
}
function registerCustomer(input) {
  const db = ensureDb();
  const normalizedPhone = input.phone.trim();
  if (db.customers.some((c) => c.phone === normalizedPhone)) {
    return { error: "\u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B. \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644." };
  }
  const customer = {
    id: `cust-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    phone: normalizedPhone,
    nationalAddress: input.nationalAddress?.trim() || "",
    address: input.address.trim(),
    goldenCoins: 0,
    coupons: [],
    passwordHash: hashPassword(input.password),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.customers.unshift(customer);
  saveDb(db);
  const { passwordHash: _ph, ...profile } = customer;
  return { customer: profile };
}
function loginCustomer(phone, password) {
  const db = ensureDb();
  const found = db.customers.find((c) => c.phone === phone.trim());
  if (!found) return null;
  if (!verifyPassword(password, found.passwordHash)) return null;
  const { passwordHash: _ph, resetCodeHash: _rc, resetExpiresAt: _re, ...profile } = found;
  return profile;
}
function getCustomerById(id) {
  const found = ensureDb().customers.find((c) => c.id === id);
  if (!found) return null;
  const { passwordHash: _ph, resetCodeHash: _rc, resetExpiresAt: _re, ...profile } = found;
  return profile;
}
function requestCustomerPasswordReset(phoneInput) {
  const db = ensureDb();
  const normalized = phoneInput.replace(/\D/g, "");
  const idx = db.customers.findIndex((c) => {
    const storedDigits = c.phone.replace(/\D/g, "");
    return c.phone === phoneInput.trim() || normalized.length >= 9 && storedDigits.endsWith(normalized.slice(-9));
  });
  if (idx === -1) {
    return { ok: false, error: "\u0644\u0627 \u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0639\u0645\u064A\u0644 \u0645\u0633\u062C\u0644 \u0628\u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645." };
  }
  const code = String(crypto.randomInt(1e5, 999999));
  db.customers[idx].resetCodeHash = hashPassword(code);
  db.customers[idx].resetExpiresAt = Date.now() + 15 * 60 * 1e3;
  saveDb(db);
  return { ok: true, code, phone: db.customers[idx].phone };
}
function confirmCustomerPasswordReset(phoneInput, code, newPassword) {
  const db = ensureDb();
  const normalized = phoneInput.replace(/\D/g, "");
  const idx = db.customers.findIndex((c) => {
    const storedDigits = c.phone.replace(/\D/g, "");
    return c.phone === phoneInput.trim() || normalized.length >= 9 && storedDigits.endsWith(normalized.slice(-9));
  });
  if (idx === -1) {
    return { ok: false, error: "\u0644\u0627 \u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0639\u0645\u064A\u0644 \u0645\u0633\u062C\u0644 \u0628\u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645." };
  }
  const customer = db.customers[idx];
  if (!customer.resetCodeHash || !customer.resetExpiresAt || Date.now() > customer.resetExpiresAt) {
    return { ok: false, error: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0623\u0648 \u0644\u0645 \u064A\u062A\u0645 \u0637\u0644\u0628\u0647 \u0628\u0639\u062F." };
  }
  if (!verifyPassword(code.trim(), customer.resetCodeHash)) {
    return { ok: false, error: "\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D." };
  }
  customer.passwordHash = hashPassword(newPassword);
  delete customer.resetCodeHash;
  delete customer.resetExpiresAt;
  saveDb(db);
  const { passwordHash: _ph, resetCodeHash: _rc, resetExpiresAt: _re, ...profile } = customer;
  return { ok: true, customer: profile };
}
function changeCustomerPassword(customerId, currentPassword, newPassword) {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return { ok: false, error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." };
  if (!verifyPassword(currentPassword, db.customers[idx].passwordHash)) {
    return { ok: false, error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629." };
  }
  db.customers[idx].passwordHash = hashPassword(newPassword);
  saveDb(db);
  return { ok: true };
}
function updateCustomerProfile(id, patch) {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  db.customers[idx] = {
    ...db.customers[idx],
    name: patch.name !== void 0 ? patch.name.trim() : db.customers[idx].name,
    phone: patch.phone !== void 0 ? patch.phone.trim() : db.customers[idx].phone,
    nationalAddress: patch.nationalAddress !== void 0 ? patch.nationalAddress.trim() : db.customers[idx].nationalAddress,
    address: patch.address !== void 0 ? patch.address.trim() : db.customers[idx].address
  };
  saveDb(db);
  const { passwordHash: _ph, resetCodeHash: _rc, resetExpiresAt: _re, ...profile } = db.customers[idx];
  return profile;
}
function getAllCustomersAdmin() {
  return ensureDb().customers.map(({ passwordHash: _ph, resetCodeHash: _rc, resetExpiresAt: _re, ...profile }) => profile);
}
function createOrder(order) {
  const db = ensureDb();
  db.orders.unshift(order);
  saveDb(db);
  return order;
}
function getAllOrdersAdmin() {
  return [...ensureDb().orders];
}
function getOrdersForCustomer(customerId) {
  return ensureDb().orders.filter((o) => o.customerId === customerId);
}
function updateOrderStatus(id, patch) {
  const db = ensureDb();
  const idx = db.orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  db.orders[idx] = {
    ...db.orders[idx],
    ...patch.status !== void 0 ? { status: patch.status } : {},
    ...patch.shippingCompany !== void 0 ? { shippingCompany: patch.shippingCompany.trim() } : {},
    ...patch.trackingNumber !== void 0 ? { trackingNumber: patch.trackingNumber.trim() } : {},
    ...patch.shippingNotice !== void 0 ? { shippingNotice: patch.shippingNotice.trim() } : {}
  };
  saveDb(db);
  return db.orders[idx];
}
function claimDailyCoins(customerId) {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return { error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." };
  if (db.settings.loyaltyEnabled === false) {
    return { error: "\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0627\u0644\u0630\u0647\u0628\u064A\u0629 \u0645\u062A\u0648\u0642\u0641 \u062D\u0627\u0644\u064A\u0627\u064B \u0645\u0646 \u0642\u0628\u0644 \u0627\u0644\u0645\u0627\u0644\u0643." };
  }
  const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const current = db.customers[idx];
  if (current.lastDailyClaimDate === today) {
    return { error: "\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0645\u0643\u0627\u0641\u0623\u0629 \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u064A\u0648\u0645\u064A \u0644\u0647\u0630\u0627 \u0627\u0644\u064A\u0648\u0645 \u0645\u0633\u0628\u0642\u0627\u064B. \u0639\u062F \u063A\u062F\u0627\u064B!" };
  }
  const award = Math.max(1, Math.floor(Number(db.settings.dailyCheckinCoins) || 25));
  current.goldenCoins = (current.goldenCoins || 0) + award;
  current.lastDailyClaimDate = today;
  db.customers[idx] = current;
  saveDb(db);
  const { passwordHash: _ph, ...profile } = current;
  return { customer: profile, awardedCoins: award };
}
function convertCoinsToCoupon(customerId, coinsToSpend) {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return { error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." };
  if (db.settings.loyaltyEnabled === false) {
    return { error: "\u0646\u0638\u0627\u0645 \u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0627\u0644\u0630\u0647\u0628\u064A\u0629 \u0645\u062A\u0648\u0642\u0641 \u062D\u0627\u0644\u064A\u0627\u064B." };
  }
  const cleanCoins = Math.floor(Number(coinsToSpend) || 0);
  if (cleanCoins < 5) {
    return { error: "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649 \u0644\u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0625\u0644\u0649 \u0643\u0648\u0628\u0648\u0646 \u0647\u0648 5 \u0639\u0645\u0644\u0627\u062A \u0630\u0647\u0628\u064A\u0629." };
  }
  const current = db.customers[idx];
  const balance = current.goldenCoins || 0;
  if (balance < cleanCoins) {
    return { error: "\u0631\u0635\u064A\u062F\u0643 \u0645\u0646 \u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0627\u0644\u0630\u0647\u0628\u064A\u0629 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D." };
  }
  const coinValue = Number(db.settings.coinValueSar) || 0.1;
  const discountSar = Number((cleanCoins * coinValue).toFixed(2));
  const coupon = {
    code: `TAJ-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    coinsSpent: cleanCoins,
    discountSar,
    isUsed: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  current.goldenCoins = balance - cleanCoins;
  current.coupons = [coupon, ...current.coupons || []];
  db.customers[idx] = current;
  saveDb(db);
  const { passwordHash: _ph, ...profile } = current;
  return { customer: profile, coupon };
}
function validatePromoDiscountCode(codeInput, subtotalSar) {
  const db = ensureDb();
  const clean = codeInput.trim().toUpperCase();
  if (clean.length !== 4) {
    return { valid: false, error: "\u064A\u062C\u0628 \u0623\u0646 \u064A\u062A\u0643\u0648\u0646 \u0631\u0645\u0632 \u0643\u0648\u062F \u0627\u0644\u062E\u0635\u0645 \u0645\u0646 4 \u062E\u0627\u0646\u0627\u062A." };
  }
  const found = (db.settings.promoDiscountCodes || []).find(
    (p) => p.isActive && p.code.trim().toUpperCase() === clean
  );
  if (!found) {
    return { valid: false, error: "\u0643\u0648\u062F \u0627\u0644\u062E\u0635\u0645 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D \u0623\u0648 \u063A\u064A\u0631 \u0645\u0641\u0639\u0644 \u062D\u0627\u0644\u064A\u0627\u064B." };
  }
  const rawDiscount = found.discountType === "percent" ? subtotalSar * Math.min(100, Math.max(0, Number(found.discountValue) || 0)) / 100 : Math.max(0, Number(found.discountValue) || 0);
  const discountSar = Number(Math.min(subtotalSar, rawDiscount).toFixed(2));
  return {
    valid: true,
    code: found.code.toUpperCase(),
    discountType: found.discountType,
    discountValue: found.discountValue,
    discountSar
  };
}
function applyLoyaltyAndAwardOnOrder(params) {
  const db = ensureDb();
  let discountSar = 0;
  let coinsRedeemed = 0;
  let couponCodeUsed;
  const cleanInputCode = params.couponCode?.trim().toUpperCase();
  const promoCodes = db.settings.promoDiscountCodes || [];
  const promoIdx = cleanInputCode ? promoCodes.findIndex((p) => p.isActive && p.code.trim().toUpperCase() === cleanInputCode) : -1;
  if (promoIdx !== -1) {
    const promo = promoCodes[promoIdx];
    const rawDiscount = promo.discountType === "percent" ? params.subtotalSar * Math.min(100, Math.max(0, Number(promo.discountValue) || 0)) / 100 : Math.max(0, Number(promo.discountValue) || 0);
    discountSar = Number(Math.min(params.subtotalSar, rawDiscount).toFixed(2));
    promoCodes[promoIdx] = {
      ...promo,
      usageCount: (promo.usageCount || 0) + 1
    };
    db.settings.promoDiscountCodes = promoCodes;
    couponCodeUsed = promo.code.toUpperCase();
    saveDb(db);
  }
  if (!params.customerId || db.settings.loyaltyEnabled === false) {
    return {
      discountSar,
      coinsRedeemed: 0,
      couponCodeUsed,
      coinsEarned: 0
    };
  }
  const idx = db.customers.findIndex((c) => c.id === params.customerId);
  if (idx === -1) {
    return {
      discountSar,
      coinsRedeemed: 0,
      couponCodeUsed,
      coinsEarned: 0
    };
  }
  const current = db.customers[idx];
  const coinValue = Number(db.settings.coinValueSar) || 0.1;
  if (!couponCodeUsed && cleanInputCode) {
    const coupons = current.coupons || [];
    const cIdx = coupons.findIndex((c) => c.code.toUpperCase() === cleanInputCode && !c.isUsed);
    if (cIdx === -1) {
      return {
        discountSar: 0,
        coinsRedeemed: 0,
        coinsEarned: 0,
        error: "\u0643\u0648\u062F \u0627\u0644\u0643\u0648\u0628\u0648\u0646 \u0623\u0648 \u0627\u0644\u062E\u0635\u0645 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u062A\u0645 \u0627\u0633\u062A\u062E\u062F\u0627\u0645\u0647 \u0645\u0633\u0628\u0642\u0627\u064B."
      };
    }
    discountSar = Math.min(params.subtotalSar, coupons[cIdx].discountSar);
    coupons[cIdx] = { ...coupons[cIdx], isUsed: true, usedOnOrderId: params.orderId };
    current.coupons = coupons;
    couponCodeUsed = coupons[cIdx].code;
  } else if (!couponCodeUsed && params.redeemCoins && params.redeemCoins > 0) {
    const requested = Math.floor(Number(params.redeemCoins) || 0);
    const available = current.goldenCoins || 0;
    if (requested > available) {
      return {
        discountSar: 0,
        coinsRedeemed: 0,
        coinsEarned: 0,
        error: "\u0631\u0635\u064A\u062F \u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0627\u0644\u0630\u0647\u0628\u064A\u0629 \u0627\u0644\u0645\u062E\u062A\u0627\u0631 \u064A\u062A\u062C\u0627\u0648\u0632 \u0631\u0635\u064A\u062F\u0643 \u0627\u0644\u0645\u062A\u0627\u062D."
      };
    }
    const maxUsableCoins = Math.floor(params.subtotalSar / coinValue);
    coinsRedeemed = Math.min(requested, maxUsableCoins);
    discountSar = Number(Math.min(params.subtotalSar, coinsRedeemed * coinValue).toFixed(2));
    current.goldenCoins = available - coinsRedeemed;
  }
  const finalPaidSar = Math.max(0, params.subtotalSar - discountSar);
  const ratePer100 = Math.max(0, Number(db.settings.coinsPer100SarPurchase) || 50);
  const coinsEarned = Math.floor(finalPaidSar / 100 * ratePer100);
  current.goldenCoins = (current.goldenCoins || 0) + coinsEarned;
  db.customers[idx] = current;
  saveDb(db);
  const { passwordHash: _ph, ...profile } = current;
  return {
    discountSar,
    coinsRedeemed,
    couponCodeUsed,
    coinsEarned,
    updatedCustomer: profile
  };
}
function adjustCustomerCoinsAdmin(customerId, newBalance) {
  const db = ensureDb();
  const idx = db.customers.findIndex((c) => c.id === customerId);
  if (idx === -1) return null;
  db.customers[idx] = {
    ...db.customers[idx],
    goldenCoins: Math.max(0, Math.floor(Number(newBalance) || 0))
  };
  saveDb(db);
  const { passwordHash: _ph, ...profile } = db.customers[idx];
  return profile;
}
function getAssistantMessages() {
  return [...ensureDb().assistantMessages || []];
}
function appendAssistantMessage(msg) {
  const db = ensureDb();
  const list = db.assistantMessages || [];
  list.push(msg);
  db.assistantMessages = list.slice(-40);
  saveDb(db);
  return msg;
}
function getOwnerAlertsAndDigest() {
  const db = ensureDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const alerts = [];
  const outOfStock = db.products.filter((p) => !p.inStock);
  if (outOfStock.length > 0) {
    alerts.push({
      id: "alert-out-of-stock",
      level: "urgent",
      title: `\u062A\u0646\u0628\u064A\u0647 \u0645\u062E\u0632\u0648\u0646: ${outOfStock.length} \u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631 \u062D\u0627\u0644\u064A\u0627\u064B`,
      detail: outOfStock.map((p) => p.name).join(" \u060C "),
      createdAt: now
    });
  }
  const drafts = db.products.filter((p) => !p.isPublished);
  if (drafts.length > 0) {
    alerts.push({
      id: "alert-drafts",
      level: "warning",
      title: `\u0645\u0633\u0648\u062F\u0627\u062A \u0633\u0631\u064A\u0629 \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 (${drafts.length})`,
      detail: drafts.map((p) => p.name).join(" \u060C "),
      createdAt: now
    });
  }
  const missingSeo = db.products.filter(
    (p) => p.isPublished && (!p.seoKeywords || p.seoKeywords.length === 0)
  );
  if (missingSeo.length > 0) {
    alerts.push({
      id: "alert-seo",
      level: "info",
      title: `\u0645\u0646\u062A\u062C\u0627\u062A \u062A\u062D\u062A\u0627\u062C \u062A\u062D\u062F\u064A\u062B SEO (${missingSeo.length})`,
      detail: missingSeo.map((p) => p.name).join(" \u060C "),
      createdAt: now
    });
  }
  const pendingOrders = db.orders.filter((o) => o.status === "\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629");
  if (pendingOrders.length > 0) {
    alerts.push({
      id: "alert-pending-orders",
      level: "urgent",
      title: `\u0637\u0644\u0628\u0627\u062A \u062C\u062F\u064A\u062F\u0629 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 (${pendingOrders.length})`,
      detail: pendingOrders.slice(0, 3).map((o) => `${o.id} - ${o.customerName} (${o.totalSar} \u0631.\u0633)`).join(" | "),
      createdAt: now
    });
  }
  const publishedCount = db.products.filter((p) => p.isPublished).length;
  const totalSales = db.orders.filter((o) => o.status !== "\u0645\u0644\u063A\u064A").reduce((s, o) => s + o.totalSar, 0);
  const lines = [
    `\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0634\u062E\u0635\u064A - ${db.settings.storeName}`,
    `\u0627\u0644\u062A\u0627\u0631\u064A\u062E: ${(/* @__PURE__ */ new Date()).toLocaleString("ar-SA")}`,
    `----------------`,
    `\u2022 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629: ${publishedCount} | \u0627\u0644\u0645\u0633\u0648\u062F\u0627\u062A \u0627\u0644\u0633\u0631\u064A\u0629: ${drafts.length}`,
    `\u2022 \u0645\u0646\u062A\u062C\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631\u0629: ${outOfStock.length}`,
    `\u2022 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0637\u0644\u0628\u0627\u062A: ${db.orders.length} (\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629: ${pendingOrders.length})`,
    `\u2022 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A: ${totalSales.toLocaleString("ar-SA")} \u0631\u064A\u0627\u0644 \u0633\u0639\u0648\u062F\u064A`,
    `\u2022 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0633\u062C\u0644\u0648\u0646: ${db.customers.length}`
  ];
  if (alerts.length > 0) {
    lines.push(`----------------`, `\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0646\u0634\u0637\u0629:`);
    alerts.forEach((a) => lines.push(`- ${a.title}: ${a.detail}`));
  }
  return {
    alerts,
    whatsappDigestText: lines.join("\n")
  };
}
async function notifyOwnerWebhookIfConfigured(event, message) {
  const settings = getAdminSettings();
  if (!settings.autoWhatsappAlertsEnabled || !settings.ownerWhatsappWebhookUrl?.trim()) {
    return false;
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5e3);
    await fetch(settings.ownerWhatsappWebhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        event,
        storeName: settings.storeName,
        whatsappNumber: settings.ownerPersonalWhatsapp,
        message,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      })
    });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}
function getAllApprovedReviews() {
  return [...ensureDb().reviews || []].filter((r) => r.approved);
}
function getApprovedReviewsForProduct(productId) {
  return getAllApprovedReviews().filter((r) => r.productId === productId);
}
function addProductReview(input) {
  const db = ensureDb();
  const review = {
    id: `rev-${crypto.randomUUID().slice(0, 8)}`,
    productId: input.productId,
    customerName: input.customerName.trim().slice(0, 80),
    rating: Math.max(1, Math.min(5, Math.round(Number(input.rating) || 5))),
    comment: input.comment.trim().slice(0, 800),
    approved: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.reviews = [review, ...db.reviews || []];
  saveDb(db);
  return review;
}
function getAllReviewsAdmin() {
  return [...ensureDb().reviews || []];
}
function approveReviewAdmin(id, approved) {
  const db = ensureDb();
  const list = db.reviews || [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], approved };
  db.reviews = list;
  saveDb(db);
  return list[idx];
}
function deleteReviewAdmin(id) {
  const db = ensureDb();
  const list = db.reviews || [];
  const before = list.length;
  db.reviews = list.filter((r) => r.id !== id);
  if (db.reviews.length === before) return false;
  saveDb(db);
  return true;
}
function recordStoreVisit(visitorId) {
  const db = ensureDb();
  const analytics = db.analytics || {
    totalVisits: 0,
    uniqueVisitorTokens: [],
    searchQueries: [],
    dailySearchCounts: {},
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  analytics.totalVisits += 1;
  const cleanId = visitorId.trim().slice(0, 64);
  if (cleanId && !analytics.uniqueVisitorTokens.includes(cleanId)) {
    analytics.uniqueVisitorTokens.push(cleanId);
    if (analytics.uniqueVisitorTokens.length > 5e3) {
      analytics.uniqueVisitorTokens = analytics.uniqueVisitorTokens.slice(-5e3);
    }
  }
  analytics.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  db.analytics = analytics;
  saveDb(db);
}
function recordSearchQuery(term) {
  const clean = term.trim().replace(/\s+/g, " ").slice(0, 120);
  if (clean.length < 2) return;
  const db = ensureDb();
  const analytics = db.analytics || {
    totalVisits: 0,
    uniqueVisitorTokens: [],
    searchQueries: [],
    dailySearchCounts: {},
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const lower = clean.toLowerCase();
  const existingIdx = analytics.searchQueries.findIndex((q) => q.term.toLowerCase() === lower);
  if (existingIdx >= 0) {
    analytics.searchQueries[existingIdx] = {
      term: clean,
      count: analytics.searchQueries[existingIdx].count + 1,
      lastSearchedAt: now
    };
  } else {
    analytics.searchQueries.unshift({
      term: clean,
      count: 1,
      lastSearchedAt: now
    });
  }
  analytics.searchQueries.sort((a, b) => b.count - a.count);
  analytics.searchQueries = analytics.searchQueries.slice(0, 150);
  const dayKey = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const dailyMap = { ...analytics.dailySearchCounts || {} };
  dailyMap[dayKey] = (dailyMap[dayKey] || 0) + 1;
  analytics.dailySearchCounts = dailyMap;
  analytics.updatedAt = now;
  db.analytics = analytics;
  saveDb(db);
}
function getOwnerAnalyticsAdmin() {
  const db = ensureDb();
  const a = db.analytics || {
    totalVisits: 0,
    uniqueVisitorTokens: [],
    searchQueries: [],
    dailySearchCounts: {},
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const dailyMap = a.dailySearchCounts || {};
  const dailySearches = Object.entries(dailyMap).sort(([d1], [d2]) => d1.localeCompare(d2)).slice(-14).map(([date, count]) => ({ date, count }));
  return {
    totalVisits: a.totalVisits,
    uniqueVisitors: a.uniqueVisitorTokens.length,
    searchQueries: [...a.searchQueries],
    dailySearches,
    updatedAt: a.updatedAt
  };
}

// server/ai.ts
import crypto2 from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function extractHtmlSignals(html, baseUrl) {
  const images = /* @__PURE__ */ new Set();
  const addUrl = (raw) => {
    if (!raw) return;
    const cleaned = raw.trim().replace(/&amp;/g, "&");
    if (!cleaned || cleaned.startsWith("data:")) return;
    try {
      const resolved = new URL(cleaned, baseUrl).toString();
      if (/\.(png|jpe?g|webp|avif)(\?|$)/i.test(resolved) || resolved.includes("image") || resolved.includes("cdn")) {
        images.add(resolved);
      }
    } catch {
    }
  };
  const ogImgRegex = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:secure_url)["'][^>]+content=["']([^"']+)["']/gi;
  for (const match of html.matchAll(ogImgRegex)) {
    addUrl(match[1]);
  }
  const imgTagRegex = /<img[^>]+(?:src|data-src|data-zoom-image|data-large_image)=["']([^"']+)["'][^>]*>/gi;
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
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ].map((m) => m[1].trim()).slice(0, 3).join("\n");
  const plainText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 6e3);
  return {
    title: titleMatch?.[1]?.trim() ?? "",
    metaDescription: metaDescMatch?.[1]?.trim() ?? "",
    jsonLd: jsonLdMatches.slice(0, 3e3),
    textSnippet: plainText,
    foundImages: Array.from(images).slice(0, 8)
  };
}
async function scrapeProductFromUrl(url) {
  const ai = getAiClient();
  let fetchedSignals = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9e3);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const html = await resp.text();
      if (html && html.length > 250) {
        fetchedSignals = extractHtmlSignals(html, url);
      }
    }
  } catch {
  }
  if (fetchedSignals && (fetchedSignals.textSnippet.length > 150 || fetchedSignals.jsonLd.length > 50)) {
    const prompt = `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u062A\u062C\u0627\u0631\u0629 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629 \u0641\u0627\u062E\u0631\u0629. \u0642\u0645 \u0628\u062A\u062D\u0644\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C\u0629 \u0645\u0646 \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u062A\u0627\u0644\u064A \u0648\u062A\u062D\u0648\u064A\u0644\u0647\u0627 \u0625\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0639\u0631\u0628\u064A\u0629 \u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629 \u0648\u0641\u0627\u062E\u0631\u0629 \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A (SAR):
\u0627\u0644\u0631\u0627\u0628\u0637: ${url}
\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C: ${fetchedSignals.title}
\u0627\u0644\u0648\u0635\u0641: ${fetchedSignals.metaDescription}
\u0628\u064A\u0627\u0646\u0627\u062A JSON-LD: ${fetchedSignals.jsonLd}
\u0627\u0644\u0635\u0648\u0631 \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C\u0629: ${JSON.stringify(fetchedSignals.foundImages)}
\u0645\u0642\u062A\u0637\u0641 \u0627\u0644\u0646\u0635: ${fetchedSignals.textSnippet}

\u0627\u0644\u0645\u0637\u0644\u0648\u0628:
- \u0627\u0633\u062A\u062E\u0631\u062C \u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u0644\u0645\u0646\u062A\u062C \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0641\u0627\u062E\u0631\u0629.
- \u0627\u0642\u062A\u0631\u062D \u0633\u0639\u0631\u0627\u064B \u0645\u0646\u0627\u0633\u0628\u0627\u064B \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A (\u0631\u0642\u0645 \u0635\u062D\u064A\u062D) \u0645\u0639 \u062D\u0641\u0638 \u0646\u0635 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0623\u0635\u0644\u064A \u0627\u0644\u0645\u0643\u062A\u0634\u0641.
- \u0627\u0643\u062A\u0628 \u0648\u0635\u0641\u0627\u064B \u062A\u0633\u0648\u064A\u0642\u064A\u0627\u064B \u0639\u0631\u0628\u064A\u0627\u064B \u0645\u062A\u0643\u0627\u0645\u0644\u0627\u064B.
- \u0627\u0633\u062A\u062E\u0631\u062C \u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0627\u0644\u0641\u0646\u064A\u0629 \u0641\u064A \u0645\u0635\u0641\u0648\u0641\u0629 label \u0648 value \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629.
- \u062D\u0627\u0641\u0638 \u0639\u0644\u0649 \u0631\u0648\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u062C\u0648\u062F\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C\u0629 \u0645\u0646 \u0627\u0644\u0635\u0641\u062D\u0629 \u0625\u0646 \u0648\u062C\u062F\u062A.`;
    const response2 = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
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
                  value: { type: Type.STRING }
                },
                required: ["label", "value"]
              }
            }
          },
          required: [
            "name",
            "category",
            "priceSar",
            "originalExtractedPrice",
            "description",
            "images",
            "specs"
          ]
        }
      }
    });
    const parsed = JSON.parse((response2.text ?? "{}").trim());
    const mergedImages = Array.from(
      /* @__PURE__ */ new Set([...parsed.images ?? [], ...fetchedSignals.foundImages ?? []])
    ).filter((img) => typeof img === "string" && img.startsWith("http"));
    return {
      name: parsed.name || fetchedSignals.title || "\u0645\u0646\u062A\u062C \u0645\u0633\u062D\u0648\u0628 \u062C\u062F\u064A\u062F",
      category: parsed.category || "\u0645\u0642\u062A\u0646\u064A\u0627\u062A \u0645\u062E\u062A\u0627\u0631\u0629",
      priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 450,
      originalExtractedPrice: parsed.originalExtractedPrice || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F",
      description: parsed.description || fetchedSignals.metaDescription || "\u0648\u0635\u0641 \u0627\u0644\u0645\u0646\u062A\u062C \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629.",
      images: mergedImages,
      specs: Array.isArray(parsed.specs) ? parsed.specs : []
    };
  }
  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `\u0627\u0642\u0631\u0623 \u0645\u062D\u062A\u0648\u0649 \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u062A\u0627\u0644\u064A \u0648\u0627\u0633\u062A\u062E\u0631\u062C \u0628\u064A\u0627\u0646\u0627\u062A\u0647 \u0627\u0644\u0643\u0627\u0645\u0644\u0629 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0628\u0635\u064A\u063A\u0629 JSON \u0641\u0642\u0637:
\u0627\u0644\u0631\u0627\u0628\u0637: ${url}

\u0623\u0639\u062F \u0643\u0627\u0626\u0646 JSON \u064A\u062D\u062A\u0648\u064A \u0641\u0642\u0637 \u0639\u0644\u0649 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u062A\u0627\u0644\u064A\u0629:
{
  "name": "\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u0643\u0627\u0645\u0644 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
  "category": "\u0627\u0644\u062A\u0635\u0646\u064A\u0641 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
  "priceSar": 750,
  "originalExtractedPrice": "\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0623\u0635\u0644\u064A \u0643\u0645\u0627 \u0648\u0631\u062F \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629",
  "description": "\u0648\u0635\u0641 \u062A\u0633\u0648\u064A\u0642\u064A \u0645\u0641\u0635\u0644 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
  "images": ["\u0631\u0648\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u062C\u0648\u062F\u0629 \u0625\u0646 \u0648\u062C\u062F\u062A"],
  "specs": [{"label": "\u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0629", "value": "\u0627\u0644\u0642\u064A\u0645\u0629"}]
}`,
    config: {
      tools: [{ urlContext: {} }, { googleSearch: {} }]
    }
  });
  const rawText = (response.text ?? "").trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        name: parsed.name || "\u0645\u0646\u062A\u062C \u0645\u0633\u062D\u0648\u0628 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629",
        category: parsed.category || "\u0645\u0642\u062A\u0646\u064A\u0627\u062A \u0645\u062E\u062A\u0627\u0631\u0629",
        priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 590,
        originalExtractedPrice: parsed.originalExtractedPrice || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F",
        description: parsed.description || "\u062A\u0645 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0627\u0644\u0645\u0646\u062A\u062C \u0648\u062D\u0641\u0638\u0647 \u0643\u0645\u0633\u0648\u062F\u0629 \u0633\u0631\u064A\u0629 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629.",
        images: Array.isArray(parsed.images) ? parsed.images.filter((i) => typeof i === "string" && i.startsWith("http")) : [],
        specs: Array.isArray(parsed.specs) ? parsed.specs : []
      };
    } catch {
    }
  }
  return {
    name: "\u0645\u0646\u062A\u062C \u0645\u0633\u062D\u0648\u0628 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u064A\u062F\u0648\u064A\u0629",
    category: "\u0645\u0642\u062A\u0646\u064A\u0627\u062A \u0645\u062E\u062A\u0627\u0631\u0629",
    priceSar: 550,
    originalExtractedPrice: "\u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B",
    description: rawText.slice(0, 500) || "\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0631\u0627\u0628\u0637 \u0641\u064A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u0631\u064A\u0629 \u0644\u0644\u0645\u0627\u0644\u0643. \u064A\u0631\u062C\u0649 \u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0648\u0627\u0644\u0635\u0648\u0631 \u0642\u0628\u0644 \u0627\u0644\u0646\u0634\u0631.",
    images: [],
    specs: [{ label: "\u0627\u0644\u0645\u0635\u062F\u0631", value: "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0645\u0627\u0644\u0643" }]
  };
}
function extractStoreCatalogSignals(html, baseUrl) {
  const base = extractHtmlSignals(html, baseUrl);
  const links = [];
  const seen = /* @__PURE__ */ new Set();
  const anchorRegex = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(anchorRegex)) {
    const rawHref = m[1]?.trim();
    if (!rawHref || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:")) continue;
    const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!label || label.length < 4 || label.length > 140) continue;
    try {
      const abs = new URL(rawHref, baseUrl).toString();
      if (!seen.has(abs)) {
        seen.add(abs);
        links.push({ text: label, url: abs });
      }
    } catch {
    }
    if (links.length >= 45) break;
  }
  return { ...base, links };
}
function defaultStudioFallbackImage(categoryOrText) {
  const txt = categoryOrText.toLowerCase();
  if (txt.includes("\u062F\u064A\u0632\u0644") || txt.includes("dpf") || txt.includes("diesel")) {
    return "/src/assets/images/product_diesel_dpf_1794821492144.jpg";
  }
  if (txt.includes("\u0633\u064A\u0631\u0627\u0645\u064A\u0643") || txt.includes("\u062D\u0634\u0648\u0629") || txt.includes("\u0642\u0644\u0628") || txt.includes("ceramic")) {
    return "/src/assets/images/product_ceramic_core_1794821493246.jpg";
  }
  if (txt.includes("\u0637\u0642\u0645") || txt.includes("\u0641\u0644\u0646\u062C") || txt.includes("exhaust") || txt.includes("kit")) {
    return "/src/assets/images/product_universal_exhaust_1794821493897.jpg";
  }
  return "/src/assets/images/product_gasoline_cat_1794821493329.jpg";
}
async function scrapeSimilarProductsFromUrl(input) {
  const ai = getAiClient();
  const marginPct = Math.max(0, Math.min(300, Number(input.profitMarginPercent) || 25));
  const extraSar = Math.max(0, Number(input.extraProfitSar) || 0);
  const targetCategory = input.category?.trim() || "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0628\u0646\u0632\u064A\u0646";
  let signals = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1e4);
    const resp = await fetch(input.storeUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const html = await resp.text();
      if (html && html.length > 200) {
        signals = extractStoreCatalogSignals(html, input.storeUrl);
      }
    }
  } catch {
  }
  let rawItems = [];
  if (signals && (signals.textSnippet.length > 150 || signals.links.length > 3)) {
    const prompt = `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u062A\u0633\u0648\u064A\u0642 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0648\u0633\u062D\u0628 \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0646\u062A\u062C\u0627\u062A \u0644\u0644\u0645\u062A\u0627\u062C\u0631 \u0627\u0644\u0645\u062A\u062E\u0635\u0635\u0629.
\u0648\u0636\u0639 \u0627\u0644\u0645\u0627\u0644\u0643 \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u062A\u062C\u0631/\u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u062A\u0627\u0644\u064A: ${input.storeUrl}
\u0648\u062D\u062F\u062F \u0646\u0648\u0639 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u0645\u0634\u0627\u0628\u0647 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0633\u062D\u0628\u0647: "${input.targetProductHint}"
\u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0627\u0644\u0645\u0642\u062A\u0631\u062D: "${targetCategory}"

\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C\u0629 \u0645\u0646 \u0627\u0644\u0635\u0641\u062D\u0629:
\u0627\u0644\u0639\u0646\u0648\u0627\u0646: ${signals.title}
JSON-LD: ${signals.jsonLd}
\u0631\u0648\u0627\u0628\u0637 \u0648\u0635\u0641\u062D\u0627\u062A \u0645\u0643\u062A\u0634\u0641\u0629: ${JSON.stringify(signals.links.slice(0, 30))}
\u0635\u0648\u0631 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u062F\u0642\u0629 \u0645\u0643\u062A\u0634\u0641\u0629: ${JSON.stringify(signals.foundImages)}
\u0627\u0644\u0646\u0635: ${signals.textSnippet}

\u0627\u0644\u0645\u0637\u0644\u0648\u0628:
\u0627\u0633\u062A\u062E\u0631\u062C \u0648\u0627\u0642\u062A\u0631\u062D \u0645\u0646 3 \u0625\u0644\u0649 5 \u0645\u0646\u062A\u062C\u0627\u062A \u0645\u062A\u0637\u0627\u0628\u0642\u0629 \u0623\u0648 \u0645\u0634\u0627\u0628\u0647\u0629 \u062A\u0645\u0627\u0645\u0627\u064B \u0644\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u0645\u062D\u062F\u062F ("${input.targetProductHint}") \u0645\u0646 \u0646\u0641\u0633 \u0627\u0644\u0645\u062A\u062C\u0631 \u0623\u0648 \u0646\u0641\u0633 \u0641\u0626\u062A\u0647 \u0627\u0644\u062A\u0642\u0646\u064A\u0629.
\u0644\u0643\u0644 \u0645\u0646\u062A\u062C:
- name: \u0627\u0643\u062A\u0628 \u0627\u0633\u0645\u0627\u064B \u0639\u0631\u0628\u064A\u0627\u064B \u062C\u0630\u0627\u0628\u0627\u064B \u0648\u0648\u0627\u0636\u062D\u0627\u064B \u062C\u062F\u0627\u064B \u064A\u0641\u0647\u0645\u0647 \u0627\u0644\u0639\u0645\u064A\u0644 \u0641\u0648\u0631\u0627\u064B (\u0627\u0630\u0643\u0631 \u0646\u0648\u0639 \u0627\u0644\u0633\u064A\u0627\u0631\u0629 \u0623\u0648 \u0627\u0644\u0645\u062D\u0631\u0643 \u062F\u064A\u0632\u0644/\u0628\u0646\u0632\u064A\u0646 \u0648\u0627\u0644\u0645\u064A\u0632\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629).
- category: \u062A\u0635\u0646\u064A\u0641 \u0639\u0631\u0628\u064A \u062F\u0642\u064A\u0642 \u0645\u062B\u0644 "${targetCategory}".
- costPriceSar: \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0623\u0633\u0627\u0633\u064A \u0627\u0644\u062A\u0642\u062F\u064A\u0631\u064A \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A (\u0642\u0628\u0644 \u0625\u0636\u0627\u0641\u0629 \u0631\u0628\u062D \u0627\u0644\u0645\u0627\u0644\u0643).
- originalExtractedPrice: \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0623\u0635\u0644\u064A \u0643\u0645\u0627 \u0638\u0647\u0631 \u0641\u064A \u0627\u0644\u0645\u062A\u062C\u0631 \u0623\u0648 \u0627\u0644\u062A\u0642\u062F\u064A\u0631 \u0627\u0644\u0645\u0635\u062F\u0631.
- description: \u0648\u0635\u0641 \u062A\u0633\u0648\u064A\u0642\u064A \u0639\u0631\u0628\u064A \u0627\u062D\u062A\u0631\u0627\u0641\u064A \u064A\u0634\u0631\u062D \u0644\u0644\u0639\u0645\u064A\u0644 \u0627\u0644\u0641\u0648\u0627\u0626\u062F \u0648\u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062A \u0648\u0627\u0644\u062A\u0648\u0627\u0641\u0642 \u0628\u0648\u0636\u0648\u062D \u062A\u0627\u0645.
- images: \u0631\u0648\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631 \u0627\u0644\u0645\u0646\u0627\u0633\u0628\u0629 \u0645\u0646 \u0627\u0644\u0635\u0648\u0631 \u0627\u0644\u0645\u0643\u062A\u0634\u0641\u0629 \u0625\u0646 \u0648\u062C\u062F\u062A.
- specs: \u0645\u0635\u0641\u0648\u0641\u0629 \u0645\u0648\u0627\u0635\u0641\u0627\u062A (label \u0648 value) \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629.
- sourceUrl: \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u0645\u0643\u062A\u0634\u0641 \u0625\u0646 \u0648\u062C\u062F \u0648\u0625\u0644\u0627 \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u0623\u0635\u0644\u064A.`;
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
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
                        value: { type: Type.STRING }
                      },
                      required: ["label", "value"]
                    }
                  }
                },
                required: ["name", "category", "costPriceSar", "description", "specs"]
              }
            }
          },
          required: ["items"]
        }
      }
    });
    try {
      const parsed = JSON.parse((response.text ?? "{}").trim());
      if (Array.isArray(parsed.items)) rawItems = parsed.items;
    } catch {
      rawItems = [];
    }
  } else {
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `\u062A\u0635\u0641\u062D \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u062A\u0627\u0644\u064A \u0648\u0627\u0633\u062A\u062E\u0631\u062C 3 \u0625\u0644\u0649 5 \u0645\u0646\u062A\u062C\u0627\u062A \u0645\u0634\u0627\u0628\u0647\u0629 \u0644\u0640 "${input.targetProductHint}" \u0648\u0623\u0639\u062F \u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0628\u0635\u064A\u063A\u0629 JSON \u0641\u0642\u0637 \u0628\u062F\u0648\u0646 \u0623\u064A \u0646\u0635 \u0625\u0636\u0627\u0641\u064A:
\u0627\u0644\u0631\u0627\u0628\u0637: ${input.storeUrl}

\u0627\u0644\u0635\u064A\u063A\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629:
{
  "items": [
    {
      "name": "\u0627\u0633\u0645 \u0645\u0646\u062A\u062C \u0639\u0631\u0628\u064A \u062C\u0630\u0627\u0628 \u0648\u0648\u0627\u0636\u062D \u064A\u0641\u0647\u0645\u0647 \u0627\u0644\u0639\u0645\u064A\u0644",
      "category": "${targetCategory}",
      "costPriceSar": 950,
      "originalExtractedPrice": "\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0635\u062F\u0631",
      "description": "\u0648\u0635\u0641 \u062A\u0633\u0648\u064A\u0642\u064A \u0639\u0631\u0628\u064A \u0648\u0627\u0636\u062D \u0648\u0645\u0642\u0646\u0639 \u0644\u0644\u0639\u0645\u064A\u0644",
      "images": ["https://..."],
      "sourceUrl": "${input.storeUrl}",
      "specs": [{"label": "\u0646\u0648\u0639 \u0627\u0644\u0645\u062D\u0631\u0643", "value": "\u062F\u064A\u0632\u0644 / \u0628\u0646\u0632\u064A\u0646"}]
    }
  ]
}`,
      config: {
        tools: [{ urlContext: {} }, { googleSearch: {} }]
      }
    });
    const rawText = (response.text ?? "").trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.items)) rawItems = parsed.items;
      } catch {
      }
    }
  }
  if (rawItems.length === 0) {
    rawItems = [
      {
        name: `${input.targetProductHint} \u2014 \u0625\u0635\u062F\u0627\u0631 \u0645\u0637\u0648\u0651\u0631 \u0639\u0627\u0644\u064A \u0627\u0644\u0643\u0641\u0627\u0621\u0629`,
        category: targetCategory,
        costPriceSar: 980,
        originalExtractedPrice: "\u0645\u0633\u062D\u0648\u0628 \u0645\u0646 \u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u0645\u0635\u062F\u0631",
        description: `\u0645\u0646\u062A\u062C \u0645\u0634\u0627\u0628\u0647 \u0644\u0640 ${input.targetProductHint} \u0645\u0647\u064A\u0623 \u0628\u0635\u064A\u0627\u063A\u0629 \u0639\u0631\u0628\u064A\u0629 \u0648\u0627\u0636\u062D\u0629\u060C \u062C\u0627\u0647\u0632 \u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0633\u0639\u0631 \u0648\u062A\u062D\u0633\u064A\u0646 \u0627\u0644\u0635\u0648\u0631\u0629 \u0642\u0628\u0644 \u0627\u0644\u0646\u0634\u0631 \u0644\u0644\u0639\u0645\u0644\u0627\u0621.`,
        images: signals?.foundImages?.slice(0, 2) || [],
        specs: [
          { label: "\u0627\u0644\u0641\u0626\u0629 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641\u0629", value: input.targetProductHint },
          { label: "\u0627\u0644\u062C\u0648\u062F\u0629", value: "\u0645\u0639\u064A\u0627\u0631 \u0645\u0635\u0646\u0639 \u0645\u0637\u0627\u0628\u0642 \u0644\u0644\u0641\u062D\u0635 \u0627\u0644\u062F\u0648\u0631\u064A" }
        ],
        sourceUrl: input.storeUrl
      }
    ];
  }
  return rawItems.slice(0, 6).map((item, idx) => {
    const cost = Number(item.costPriceSar) > 20 ? Math.round(Number(item.costPriceSar)) : 950 + idx * 140;
    const sellingPrice = Math.max(cost + 1, Math.round(cost * (1 + marginPct / 100) + extraSar));
    const compareAt = Math.round(sellingPrice * 1.18);
    const cleanedImages = Array.isArray(item.images) ? item.images.filter((u) => typeof u === "string" && u.startsWith("http")) : [];
    const fallbackPool = signals?.foundImages?.filter((u) => u.startsWith("http")) || [];
    const resolvedImages = cleanedImages.length > 0 ? cleanedImages : fallbackPool.length > 0 ? [fallbackPool[idx % fallbackPool.length]] : [defaultStudioFallbackImage(`${item.name || ""} ${item.category || targetCategory}`)];
    return {
      name: item.name?.trim() || `${input.targetProductHint} #${idx + 1}`,
      category: item.category?.trim() || targetCategory,
      costPriceSar: cost,
      priceSar: sellingPrice,
      compareAtPriceSar: compareAt,
      originalExtractedPrice: item.originalExtractedPrice || `${cost} \u0631.\u0633 (\u062A\u0642\u062F\u064A\u0631 \u0627\u0644\u0645\u0635\u062F\u0631)`,
      description: item.description?.trim() || "\u0648\u0635\u0641 \u0627\u062D\u062A\u0631\u0627\u0641\u064A \u062C\u0627\u0647\u0632 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0648\u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u0642\u0628\u0644 \u0627\u0644\u0646\u0634\u0631 \u0641\u064A \u0648\u0627\u062C\u0647\u0629 \u0627\u0644\u0645\u062A\u062C\u0631.",
      images: resolvedImages,
      specs: Array.isArray(item.specs) && item.specs.length > 0 ? item.specs : [{ label: "\u0627\u0644\u0646\u0648\u0639", value: input.targetProductHint }],
      sourceUrl: item.sourceUrl?.startsWith("http") ? item.sourceUrl : input.storeUrl,
      profitMarginPercent: marginPct
    };
  });
}
async function enhanceProductCopyWithAi(input) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u062A\u0633\u0648\u064A\u0642 \u0648\u0643\u062A\u0627\u0628\u0629 \u0625\u0639\u0644\u0627\u0646\u064A\u0629 \u0644\u0644\u0645\u062A\u0627\u062C\u0631 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629 (\u0645\u062A\u062E\u0635\u0635 \u0641\u064A \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0644\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0648\u0642\u0637\u0639 \u0627\u0644\u0633\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0641\u0627\u062E\u0631\u0629).
\u062D\u0633\u0651\u0646 \u0639\u0646\u0648\u0627\u0646 \u0648\u0648\u0635\u0641 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u062A\u0627\u0644\u064A \u0644\u064A\u0635\u0628\u062D \u062C\u0630\u0627\u0628\u0627\u064B \u062C\u062F\u0627\u064B \u0648\u0648\u0627\u0636\u062D\u0627\u064B \u064A\u0641\u0647\u0645\u0647 \u0627\u0644\u0639\u0645\u064A\u0644 \u0645\u0646 \u0627\u0644\u0646\u0638\u0631\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0648\u064A\u0632\u064A\u062F \u0627\u0644\u0631\u063A\u0628\u0629 \u0641\u064A \u0627\u0644\u0634\u0631\u0627\u0621:
\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u062D\u0627\u0644\u064A: ${input.name}
\u0627\u0644\u0642\u0633\u0645: ${input.category}
\u0627\u0644\u0633\u0639\u0631: ${input.priceSar || 1200} \u0631\u064A\u0627\u0644 \u0633\u0639\u0648\u062F\u064A
\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u062D\u0627\u0644\u064A: ${input.description || "\u0644\u0627 \u064A\u0648\u062C\u062F \u0648\u0635\u0641 \u0645\u0641\u0635\u0644 \u0628\u0639\u062F"}

\u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0628\u0635\u064A\u063A\u0629 JSON:
- name: \u0627\u0633\u0645 \u0645\u0646\u062A\u062C \u0639\u0631\u0628\u064A \u062C\u0630\u0627\u0628 \u0648\u0645\u0641\u0647\u0648\u0645 \u0644\u0644\u0639\u0645\u064A\u0644 (\u064A\u0630\u0643\u0631 \u0627\u0644\u0646\u0648\u0639 \u0648\u0627\u0644\u0645\u064A\u0632\u0629 \u0628\u0648\u0636\u0648\u062D).
- description: \u0648\u0635\u0641 \u062A\u0633\u0648\u064A\u0642\u064A \u0633\u0644\u0633 \u0648\u0645\u0642\u0646\u0639 \u064A\u0648\u0636\u062D \u0644\u0644\u0639\u0645\u064A\u0644 \u0627\u0644\u062A\u0648\u0627\u0641\u0642 \u0648\u0627\u0644\u062C\u0648\u062F\u0629 \u0648\u0627\u0644\u0636\u0645\u0627\u0646.
- badgeText: \u0634\u0627\u0631\u0629 \u0642\u0635\u064A\u0631\u0629 \u062C\u062F\u0627\u064B \u0645\u0646 3 \u0625\u0644\u0649 5 \u0643\u0644\u0645\u0627\u062A \u0644\u0644\u0648\u0636\u0639 \u0639\u0644\u0649 \u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0646\u062A\u062C (\u0645\u062B\u0627\u0644: \u0636\u0645\u0627\u0646 \u0627\u0644\u0641\u062D\u0635 \u0627\u0644\u062F\u0648\u0631\u064A \xB7 Euro-6).
- seoKeywords: 6 \u0643\u0644\u0645\u0627\u062A \u0645\u0641\u062A\u0627\u062D\u064A\u0629 \u0639\u0631\u0628\u064A\u0629 \u0642\u0648\u064A\u0629.
- specs: 3 \u0625\u0644\u0649 4 \u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0641\u0646\u064A\u0629 \u0648\u0627\u0636\u062D\u0629 (label \u0648 value).`,
    config: {
      responseMimeType: "application/json",
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
                value: { type: Type.STRING }
              },
              required: ["label", "value"]
            }
          }
        },
        required: ["name", "description", "badgeText", "seoKeywords", "specs"]
      }
    }
  });
  const parsed = JSON.parse((response.text ?? "{}").trim());
  return {
    name: parsed.name || input.name,
    description: parsed.description || input.description || "",
    badgeText: parsed.badgeText || "\u062C\u0648\u062F\u0629 \u0645\u0635\u0646\u0639\u064A\u0629 \xB7 \u0636\u0645\u0627\u0646 \u0627\u0644\u0643\u0641\u0627\u0621\u0629",
    seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [],
    specs: Array.isArray(parsed.specs) ? parsed.specs : []
  };
}
async function enhanceStoreIdentityWithAi(input) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u0628\u0646\u0627\u0621 \u0639\u0644\u0627\u0645\u0627\u062A \u062A\u062C\u0627\u0631\u064A\u0629 \u0641\u0627\u062E\u0631\u0629 \u0641\u064A \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629.
\u062D\u0633\u0651\u0646 \u0627\u0633\u0645 \u0627\u0644\u0645\u062A\u062C\u0631 \u0648\u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646 \u0627\u0644\u062A\u0631\u062D\u064A\u0628\u064A\u0629 \u0644\u062A\u0643\u0648\u0646 \u062C\u0630\u0627\u0628\u0629 \u0648\u0648\u0627\u0636\u062D\u0629 \u0644\u0644\u0639\u0645\u064A\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A \u0648\u062A\u0632\u064A\u062F \u0627\u0644\u062B\u0642\u0629 \u0648\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A:
\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u062D\u0627\u0644\u064A: ${input.storeName}
\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0645\u062E\u062A\u0635\u0631: ${input.storeTagline}
\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062A\u0631\u062D\u064A\u0628\u064A \u0627\u0644\u062D\u0627\u0644\u064A: ${input.heroTitle}
\u062A\u0648\u062C\u0647 \u0627\u0644\u0645\u0627\u0644\u0643: ${input.focus || "\u0645\u062A\u062C\u0631 \u0641\u0627\u062E\u0631 \u0645\u062A\u062E\u0635\u0635 \u0641\u064A \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0644\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646"}

\u0623\u0639\u062F \u0628\u0635\u064A\u063A\u0629 JSON:
- storeName: \u0627\u0633\u0645 \u0645\u062A\u062C\u0631 \u0639\u0631\u0628\u064A \u0645\u0644\u0643\u064A \u0641\u062E\u0645 \u0648\u0645\u0645\u064A\u0632.
- storeTagline: \u0633\u0637\u0631 \u062A\u0639\u0631\u064A\u0641\u064A \u0645\u062E\u062A\u0635\u0631 \u0648\u0627\u0636\u062D \u0644\u0644\u0639\u0645\u064A\u0644.
- heroTitle: \u0639\u0646\u0648\u0627\u0646 \u0631\u0626\u064A\u0633\u064A \u062C\u0630\u0627\u0628 \u062C\u062F\u0627\u064B \u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0647\u0628\u0648\u0637.
- heroSubtitle: \u0633\u0637\u0631 \u0648\u0635\u0641\u064A \u064A\u0634\u0631\u062D \u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u062A\u062C\u0631 \u0644\u0644\u0639\u0645\u064A\u0644 \u0628\u0648\u0636\u0648\u062D.
- suggestedCategoryName: \u0627\u0633\u0645 \u0642\u0633\u0645 \u0625\u0636\u0627\u0641\u064A \u0645\u0642\u062A\u0631\u062D \u0648\u0645\u0641\u064A\u062F \u0644\u0644\u0645\u062A\u062C\u0631.
- suggestedCategoryDesc: \u0648\u0635\u0641 \u0642\u0635\u064A\u0631 \u0644\u0644\u0642\u0633\u0645 \u0627\u0644\u0645\u0642\u062A\u0631\u062D.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storeName: { type: Type.STRING },
          storeTagline: { type: Type.STRING },
          heroTitle: { type: Type.STRING },
          heroSubtitle: { type: Type.STRING },
          suggestedCategoryName: { type: Type.STRING },
          suggestedCategoryDesc: { type: Type.STRING }
        },
        required: [
          "storeName",
          "storeTagline",
          "heroTitle",
          "heroSubtitle",
          "suggestedCategoryName",
          "suggestedCategoryDesc"
        ]
      }
    }
  });
  return JSON.parse((response.text ?? "{}").trim());
}
async function generateProductSeoData(product, storeName) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u062A\u062D\u0633\u064A\u0646 \u0645\u062D\u0631\u0643\u0627\u062A \u0627\u0644\u0628\u062D\u062B (SEO) \u0641\u064A \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0633\u0639\u0648\u062F\u064A \u0648\u0627\u0644\u062E\u0644\u064A\u062C\u064A. \u0642\u0645 \u0628\u062A\u0648\u0644\u064A\u062F \u0628\u064A\u0627\u0646\u0627\u062A SEO \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u062A\u0646\u0627\u0641\u0633\u064A\u0629 \u0644\u0645\u0646\u062A\u062C \u0641\u064A \u0645\u062A\u062C\u0631 "${storeName}":
\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C: ${product.name}
\u0627\u0644\u062A\u0635\u0646\u064A\u0641: ${product.category}
\u0627\u0644\u0633\u0639\u0631: ${product.priceSar} \u0631\u064A\u0627\u0644 \u0633\u0639\u0648\u062F\u064A
\u0627\u0644\u0648\u0635\u0641: ${product.description}

\u0627\u0644\u0645\u0637\u0644\u0648\u0628:
- seoTitle: \u0639\u0646\u0648\u0627\u0646 SEO \u0639\u0631\u0628\u064A \u062C\u0630\u0627\u0628 \u0628\u064A\u0646 40 \u0648 60 \u062D\u0631\u0641\u0627\u064B.
- seoDescription: \u0648\u0635\u0641 \u0645\u064A\u062A\u0627 \u0628\u064A\u0646 120 \u0648 160 \u062D\u0631\u0641\u0627\u064B \u064A\u0634\u062C\u0639 \u0639\u0644\u0649 \u0627\u0644\u0634\u0631\u0627\u0621 \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A.
- seoKeywords: \u0645\u0635\u0641\u0648\u0641\u0629 \u0645\u0646 8 \u0643\u0644\u0645\u0627\u062A \u0645\u0641\u062A\u0627\u062D\u064A\u0629 \u0639\u0631\u0628\u064A\u0629 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0628\u062D\u062B \u0641\u064A \u062C\u0648\u062C\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          seoTitle: { type: Type.STRING },
          seoDescription: { type: Type.STRING },
          seoKeywords: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["seoTitle", "seoDescription", "seoKeywords"]
      }
    }
  });
  const parsed = JSON.parse((response.text ?? "{}").trim());
  const seoTitle = parsed.seoTitle || `${product.name} | ${storeName}`;
  const seoDescription = parsed.seoDescription || product.description.slice(0, 155);
  const seoKeywords = parsed.seoKeywords ?? [product.name, product.category, "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629"];
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: seoDescription,
    category: product.category,
    image: product.images,
    brand: {
      "@type": "Brand",
      name: storeName
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "SAR",
      price: product.priceSar,
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
    }
  };
  return { seoTitle, seoDescription, seoKeywords, schemaMarkup };
}
async function generateAdsAndBanner(input) {
  const ai = getAiClient();
  const contextText = input.product ? `\u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641: ${input.product.name} - \u0627\u0644\u0633\u0639\u0631: ${input.product.priceSar} \u0631.\u0633 - \u0627\u0644\u062A\u0635\u0646\u064A\u0641: ${input.product.category} - \u0627\u0644\u0648\u0635\u0641: ${input.product.description}` : `\u062D\u0645\u0644\u0629 \u0639\u0627\u0645\u0629 \u0644\u0645\u062A\u062C\u0631 "${input.storeName}" \u0644\u0625\u0646\u062A\u0627\u062C \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0644\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646`;
  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `\u0623\u0646\u062A \u0645\u062F\u064A\u0631 \u062A\u0633\u0648\u064A\u0642 \u0631\u0642\u0645\u064A \u0645\u062A\u062E\u0635\u0635 \u0641\u064A \u0625\u0639\u0644\u0627\u0646\u0627\u062A \u062C\u0648\u062C\u0644 (Google Ads) \u0641\u064A \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629.
${contextText}
\u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u0625\u0639\u0644\u0627\u0646\u064A: ${input.campaignGoal || "\u0632\u064A\u0627\u062F\u0629 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0648\u0627\u0633\u062A\u0647\u062F\u0627\u0641 \u0623\u0635\u062D\u0627\u0628 \u0627\u0644\u0633\u064A\u0627\u0631\u0627\u062A \u0648\u0648\u0631\u0634 \u0627\u0644\u0639\u0627\u062F\u0645 \u0641\u064A \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629"}

\u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0628\u0635\u064A\u063A\u0629 JSON:
- googleAdsHeadlines: 5 \u0639\u0646\u0627\u0648\u064A\u0646 \u0644\u0625\u0639\u0644\u0627\u0646\u0627\u062A \u0628\u062D\u062B \u062C\u0648\u062C\u0644 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 (\u0642\u0635\u064A\u0631\u0629 \u0648\u0645\u0628\u0627\u0634\u0631\u0629 \u062D\u062A\u0649 30 \u062D\u0631\u0641\u0627\u064B).
- googleAdsDescriptions: 3 \u0623\u0648\u0635\u0627\u0641 \u0625\u0639\u0644\u0627\u0646\u064A\u0629 \u062C\u0630\u0627\u0628\u0629 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 (\u062D\u062A\u0649 90 \u062D\u0631\u0641\u0627\u064B) \u062A\u0628\u0631\u0632 \u0627\u0644\u062C\u0648\u062F\u0629 \u0648\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A.
- googleAdsKeywords: 10 \u0643\u0644\u0645\u0627\u062A \u0645\u0641\u062A\u0627\u062D\u064A\u0629 \u0645\u0633\u062A\u0647\u062F\u0641\u0629 \u0644\u0640 Google Ads.
- banner: \u0628\u0646\u0631 \u062A\u0631\u0648\u064A\u062C\u064A \u062C\u0627\u0647\u0632 \u0644\u0644\u0646\u0634\u0631 \u062F\u0627\u062E\u0644 \u0627\u0644\u0645\u062A\u062C\u0631 \u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 title \u0648 subtitle \u0648 ctaText \u0648 discountLabel \u0648 accentColor (\u0644\u0648\u0646 \u0630\u0647\u0628\u064A \u0641\u0627\u062E\u0631 \u0645\u062B\u0644 #D4AF37).`,
    config: {
      responseMimeType: "application/json",
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
              accentColor: { type: Type.STRING }
            },
            required: ["title", "subtitle", "ctaText", "discountLabel", "accentColor"]
          }
        },
        required: ["googleAdsHeadlines", "googleAdsDescriptions", "googleAdsKeywords", "banner"]
      }
    }
  });
  return JSON.parse((response.text ?? "{}").trim());
}
var assistantToolDeclarations = [
  {
    name: "get_store_updates_and_alerts",
    description: "\u064A\u0639\u0631\u0636 \u0642\u0627\u0626\u0645\u0629 \u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A (\u0627\u0644\u0645\u0646\u0634\u0648\u0631\u0629 \u0648\u0627\u0644\u0645\u0633\u0648\u062F\u0627\u062A \u0627\u0644\u0633\u0631\u064A\u0629)\u060C \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u062C\u062F\u064A\u062F\u0629\u060C \u0648\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0630\u0643\u064A\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0645\u0639 \u062A\u0642\u0631\u064A\u0631 \u0622\u062E\u0631 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0627\u0644\u062C\u0627\u0647\u0632 \u0644\u0625\u0631\u0633\u0627\u0644\u0647 \u0644\u0648\u0627\u062A\u0633\u0627\u0628 \u0627\u0644\u0645\u0627\u0644\u0643.",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  },
  {
    name: "add_new_product",
    description: "\u064A\u0636\u064A\u0641 \u0645\u0646\u062A\u062C\u0627\u064B \u062C\u062F\u064A\u062F\u0627\u064B \u0625\u0644\u0649 \u0642\u0627\u0639\u062F\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062A\u062C\u0631 (\u0645\u062B\u0644 \u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u062F\u064A\u0632\u0644 \u0623\u0648 \u0628\u0646\u0632\u064A\u0646 \u0623\u0648 \u0641\u0644\u062A\u0631 \u0628\u064A\u0626\u0629).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u0644\u0645\u0646\u062A\u062C \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629" },
        category: {
          type: Type.STRING,
          description: "\u0627\u0644\u062A\u0635\u0646\u064A\u0641 \u0645\u062B\u0644 \u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0628\u0646\u0632\u064A\u0646 \u0623\u0648 \u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u062F\u064A\u0632\u0644 \u0623\u0648 \u0642\u0644\u0648\u0628 \u0648\u062D\u0634\u0648\u0627\u062A \u0627\u0644\u0633\u064A\u0631\u0627\u0645\u064A\u0643"
        },
        priceSar: { type: Type.NUMBER, description: "\u0627\u0644\u0633\u0639\u0631 \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A" },
        description: { type: Type.STRING, description: "\u0648\u0635\u0641 \u0627\u062D\u062A\u0631\u0627\u0641\u064A \u0644\u0644\u0645\u0646\u062A\u062C" },
        isPublished: {
          type: Type.BOOLEAN,
          description: "true \u0644\u0644\u0646\u0634\u0631 \u0641\u0648\u0631\u0627\u064B \u0641\u064A \u0627\u0644\u0645\u062A\u062C\u0631 \u0623\u0648 false \u0644\u0644\u062D\u0641\u0638 \u0643\u0645\u0633\u0648\u062F\u0629 \u062E\u0627\u0635\u0629 \u0644\u0644\u0645\u0627\u0644\u0643"
        },
        specs: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              value: { type: Type.STRING }
            },
            required: ["label", "value"]
          }
        }
      },
      required: ["name", "category", "priceSar", "description"]
    }
  },
  {
    name: "update_existing_product",
    description: "\u064A\u0639\u062F\u0651\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0646\u062A\u062C \u0645\u0648\u062C\u0648\u062F (\u0627\u0644\u0633\u0639\u0631\u060C \u0627\u0644\u0627\u0633\u0645\u060C \u0627\u0644\u0648\u0635\u0641\u060C \u062D\u0627\u0644\u0629 \u0627\u0644\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0645\u062E\u0632\u0648\u0646\u060C \u0623\u0648 \u0627\u0644\u0646\u0634\u0631/\u0627\u0644\u0625\u062E\u0641\u0627\u0621) \u0628\u0627\u0644\u0628\u062D\u062B \u0639\u0628\u0631 \u0627\u0644\u0645\u0639\u0631\u0651\u0641 \u0623\u0648 \u062C\u0632\u0621 \u0645\u0646 \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        searchQuery: { type: Type.STRING, description: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0646\u062A\u062C \u0623\u0648 \u062C\u0632\u0621 \u0645\u0646 \u0627\u0633\u0645\u0647" },
        newName: { type: Type.STRING },
        newPriceSar: { type: Type.NUMBER },
        newDescription: { type: Type.STRING },
        inStock: { type: Type.BOOLEAN },
        isPublished: { type: Type.BOOLEAN }
      },
      required: ["searchQuery"]
    }
  },
  {
    name: "delete_product_by_name_or_id",
    description: "\u064A\u062D\u0630\u0641 \u0645\u0646\u062A\u062C\u0627\u064B \u0645\u0646 \u0627\u0644\u0645\u062A\u062C\u0631 \u0628\u0646\u0627\u0621\u064B \u0639\u0644\u0649 \u0627\u0644\u0645\u0639\u0631\u0651\u0641 \u0623\u0648 \u0627\u0644\u0627\u0633\u0645.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        searchQuery: { type: Type.STRING, description: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0646\u062A\u062C \u0623\u0648 \u0627\u0633\u0645\u0647" }
      },
      required: ["searchQuery"]
    }
  },
  {
    name: "update_store_identity",
    description: "\u064A\u0639\u062F\u0651\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u062A\u062C\u0631 \u0623\u0648 \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0645\u062E\u062A\u0635\u0631 \u0623\u0648 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062A\u0631\u062D\u064A\u0628\u064A \u0641\u064A \u0627\u0644\u0648\u0627\u062C\u0647\u0629.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        storeName: { type: Type.STRING, description: "\u0627\u0633\u0645 \u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u062C\u062F\u064A\u062F" },
        storeTagline: { type: Type.STRING, description: "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0645\u062E\u062A\u0635\u0631 \u0627\u0644\u062C\u062F\u064A\u062F" },
        heroTitle: { type: Type.STRING, description: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062A\u0631\u062D\u064A\u0628\u064A \u0627\u0644\u0631\u0626\u064A\u0633\u064A \u0627\u0644\u062C\u062F\u064A\u062F" }
      }
    }
  },
  {
    name: "add_store_category",
    description: "\u064A\u0636\u064A\u0641 \u0642\u0633\u0645\u0627\u064B (\u062A\u0635\u0646\u064A\u0641\u0627\u064B) \u062C\u062F\u064A\u062F\u0627\u064B \u0625\u0644\u0649 \u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "\u0627\u0633\u0645 \u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u062C\u062F\u064A\u062F \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629" },
        description: { type: Type.STRING, description: "\u0648\u0635\u0641 \u0642\u0635\u064A\u0631 \u0644\u0644\u0642\u0633\u0645" }
      },
      required: ["name"]
    }
  }
];
function findProductMatch(query) {
  const q = query.trim().toLowerCase();
  const all = getAllProductsAdmin();
  return all.find((p) => p.id.toLowerCase() === q) || all.find((p) => p.name.toLowerCase().includes(q)) || all.find((p) => p.category.toLowerCase().includes(q));
}
async function runOwnerAssistantTurn(userMessage) {
  const ai = getAiClient();
  const settings = getAdminSettings();
  const actionsExecuted = [];
  let mutatedStorefront = false;
  let whatsappAlertText;
  const systemInstruction = `\u0623\u0646\u062A \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0634\u062E\u0635\u064A \u0627\u0644\u0630\u0643\u064A \u0644\u0645\u0627\u0644\u0643 \u0645\u062A\u062C\u0631 "${settings.storeName}" (\u0627\u0644\u0645\u062A\u062E\u0635\u0635 \u0641\u064A \u0625\u0646\u062A\u0627\u062C \u062F\u0628\u0627\u062A \u0627\u0644\u062A\u0644\u0648\u062B \u0644\u0644\u062F\u064A\u0632\u0644 \u0648\u0627\u0644\u0628\u0646\u0632\u064A\u0646).
\u0645\u0647\u0627\u0645\u0643:
1. \u062A\u0646\u0628\u064A\u0647 \u0627\u0644\u0645\u0627\u0644\u0643 \u0639\u0644\u0649 \u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A (\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u063A\u064A\u0631 \u0627\u0644\u0645\u062A\u0648\u0641\u0631\u0629\u060C \u0627\u0644\u0645\u0633\u0648\u062F\u0627\u062A \u0627\u0644\u0633\u0631\u064A\u0629\u060C \u0648\u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u062C\u062F\u064A\u062F\u0629).
2. \u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C\u0627\u062A \u062C\u062F\u064A\u062F\u0629 \u0648\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0623\u0648 \u0646\u0634\u0631\u0647\u0627/\u0625\u062E\u0641\u0627\u0624\u0647\u0627 \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0644\u0643 \u0641\u0648\u0631\u0627\u064B \u0639\u0646\u062F \u0637\u0644\u0628 \u0627\u0644\u0645\u0627\u0644\u0643.
3. \u062A\u0632\u0648\u064A\u062F \u0627\u0644\u0645\u0627\u0644\u0643 \u0628\u0622\u062E\u0631 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0648\u062A\u062C\u0647\u064A\u0632 \u0645\u0644\u062E\u0635 \u0648\u0627\u062A\u0633\u0627\u0628 \u0627\u062D\u062A\u0631\u0627\u0641\u064A \u0644\u0625\u0631\u0633\u0627\u0644\u0647 \u0625\u0644\u0649 \u0631\u0642\u0645\u0647 \u0627\u0644\u0634\u062E\u0635\u064A.
\u062A\u062D\u062F\u062B \u062F\u0627\u0626\u0645\u0627\u064B \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0628\u0623\u0633\u0644\u0648\u0628 \u0639\u0645\u0644\u064A \u0648\u0645\u0628\u0627\u0634\u0631 \u0648\u0645\u0647\u0646\u064A.`;
  const response1 = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: assistantToolDeclarations }]
    }
  });
  const calls = response1.functionCalls;
  if (!calls || calls.length === 0) {
    const { whatsappDigestText } = getOwnerAlertsAndDigest();
    return {
      reply: response1.text || "\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0637\u0644\u0628\u0643. \u0643\u064A\u0641 \u0623\u0633\u0627\u0639\u062F\u0643 \u0641\u064A \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062A\u062C\u0631\u061F",
      actionsExecuted,
      whatsappAlertText: userMessage.includes("\u0648\u0627\u062A\u0633\u0627\u0628") || userMessage.includes("\u062A\u062D\u062F\u064A\u062B") ? whatsappDigestText : void 0,
      mutatedStorefront
    };
  }
  const functionResponseParts = [];
  for (const call of calls) {
    const args = call.args || {};
    let toolResult = {};
    if (call.name === "get_store_updates_and_alerts") {
      const { alerts, whatsappDigestText } = getOwnerAlertsAndDigest();
      const products = getAllProductsAdmin().map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priceSar: p.priceSar,
        inStock: p.inStock,
        isPublished: p.isPublished
      }));
      const orders = getAllOrdersAdmin().slice(0, 10);
      whatsappAlertText = whatsappDigestText;
      actionsExecuted.push("\u062C\u0644\u0628 \u0622\u062E\u0631 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0648\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A");
      toolResult = { alerts, products, recentOrders: orders, whatsappDigestText };
    } else if (call.name === "add_new_product") {
      const cat = String(args.category || "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0628\u0646\u0632\u064A\u0646");
      const fallbackImg = cat.includes("\u062F\u064A\u0632\u0644") ? "/src/assets/images/product_diesel_dpf_1794821492144.jpg" : cat.includes("\u0633\u064A\u0631\u0627\u0645\u064A\u0643") ? "/src/assets/images/product_ceramic_core_1794821493246.jpg" : "/src/assets/images/product_gasoline_cat_1794821493329.jpg";
      const created = createProduct({
        id: `prod-${crypto2.randomUUID().slice(0, 8)}`,
        name: String(args.name || "\u062F\u0628\u0629 \u062A\u0644\u0648\u062B \u062C\u062F\u064A\u062F\u0629"),
        category: cat,
        priceSar: Number(args.priceSar) > 0 ? Number(args.priceSar) : 1200,
        description: String(args.description || ""),
        images: [fallbackImg],
        specs: Array.isArray(args.specs) ? args.specs : [],
        inStock: true,
        isPublished: args.isPublished !== false,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      mutatedStorefront = true;
      actionsExecuted.push(`\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C: ${created.name} (${created.priceSar} \u0631.\u0633)`);
      const { whatsappDigestText } = getOwnerAlertsAndDigest();
      whatsappAlertText = `\u062A\u0646\u0628\u064A\u0647 \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0634\u062E\u0635\u064A:
\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C \u062C\u062F\u064A\u062F:
\u2022 ${created.name}
\u2022 \u0627\u0644\u0633\u0639\u0631: ${created.priceSar} \u0631.\u0633
\u2022 \u0627\u0644\u062D\u0627\u0644\u0629: ${created.isPublished ? "\u0645\u0646\u0634\u0648\u0631 \u0641\u064A \u0627\u0644\u0645\u062A\u062C\u0631" : "\u0645\u0633\u0648\u062F\u0629 \u0645\u062E\u0641\u064A\u0629"}

${whatsappDigestText}`;
      await notifyOwnerWebhookIfConfigured("ai_add_product", whatsappAlertText);
      toolResult = { success: true, product: created };
    } else if (call.name === "update_existing_product") {
      const match = findProductMatch(String(args.searchQuery || ""));
      if (!match) {
        toolResult = { success: false, error: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u0646\u062A\u062C \u0645\u0637\u0627\u0628\u0642." };
      } else {
        const patch = {};
        if (typeof args.newName === "string" && args.newName.trim()) patch.name = args.newName.trim();
        if (typeof args.newPriceSar === "number" && args.newPriceSar > 0)
          patch.priceSar = args.newPriceSar;
        if (typeof args.newDescription === "string" && args.newDescription.trim())
          patch.description = args.newDescription.trim();
        if (typeof args.inStock === "boolean") patch.inStock = args.inStock;
        if (typeof args.isPublished === "boolean") patch.isPublished = args.isPublished;
        const updated = updateProduct(match.id, patch);
        mutatedStorefront = true;
        actionsExecuted.push(`\u062A\u0639\u062F\u064A\u0644 \u0645\u0646\u062A\u062C: ${updated?.name || match.name}`);
        whatsappAlertText = `\u062A\u0646\u0628\u064A\u0647 \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0634\u062E\u0635\u064A:
\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0646\u062A\u062C: ${updated?.name}
\u0627\u0644\u0633\u0639\u0631: ${updated?.priceSar} \u0631.\u0633
\u0627\u0644\u062D\u0627\u0644\u0629: ${updated?.isPublished ? "\u0645\u0646\u0634\u0648\u0631" : "\u0645\u0633\u0648\u062F\u0629 \u0645\u062E\u0641\u064A\u0629"} | ${updated?.inStock ? "\u0645\u062A\u0648\u0641\u0631" : "\u0646\u0641\u062F \u0627\u0644\u0645\u062E\u0632\u0648\u0646"}`;
        await notifyOwnerWebhookIfConfigured("ai_update_product", whatsappAlertText);
        toolResult = { success: true, product: updated };
      }
    } else if (call.name === "delete_product_by_name_or_id") {
      const match = findProductMatch(String(args.searchQuery || ""));
      if (!match) {
        toolResult = { success: false, error: "\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." };
      } else {
        deleteProduct(match.id);
        mutatedStorefront = true;
        actionsExecuted.push(`\u062D\u0630\u0641 \u0645\u0646\u062A\u062C: ${match.name}`);
        toolResult = { success: true, deletedName: match.name };
      }
    } else if (call.name === "update_store_identity") {
      const patch = {};
      if (typeof args.storeName === "string" && args.storeName.trim()) {
        patch.storeName = args.storeName.trim();
      }
      if (typeof args.storeTagline === "string" && args.storeTagline.trim()) {
        patch.storeTagline = args.storeTagline.trim();
      }
      if (typeof args.heroTitle === "string" && args.heroTitle.trim()) {
        patch.heroTitle = args.heroTitle.trim();
      }
      if (Object.keys(patch).length > 0) {
        const updatedSettings = updateSettings(patch);
        mutatedStorefront = true;
        actionsExecuted.push(`\u062A\u062D\u062F\u064A\u062B \u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u062A\u062C\u0631 \u0625\u0644\u0649: ${updatedSettings.storeName}`);
        toolResult = { success: true, settings: updatedSettings };
      } else {
        toolResult = { success: false, error: "\u0644\u0645 \u064A\u062A\u0645 \u062A\u0645\u0631\u064A\u0631 \u0642\u064A\u0645 \u062C\u062F\u064A\u062F\u0629 \u0644\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u062A\u062C\u0631." };
      }
    } else if (call.name === "add_store_category") {
      const catName = String(args.name || "").trim();
      if (!catName) {
        toolResult = { success: false, error: "\u0627\u0633\u0645 \u0627\u0644\u0642\u0633\u0645 \u0645\u0637\u0644\u0648\u0628." };
      } else {
        const current = getAdminSettings();
        const existing = current.categories || [];
        if (existing.some((c) => c.name === catName)) {
          toolResult = { success: false, error: "\u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645 \u0645\u0648\u062C\u0648\u062F \u0628\u0627\u0644\u0641\u0639\u0644." };
        } else {
          const newCat = {
            id: `cat-${crypto2.randomUUID().slice(0, 6)}`,
            name: catName,
            description: String(args.description || "").trim(),
            isActive: true
          };
          updateSettings({ categories: [...existing, newCat] });
          mutatedStorefront = true;
          actionsExecuted.push(`\u0625\u0636\u0627\u0641\u0629 \u0642\u0633\u0645 \u062C\u062F\u064A\u062F: ${catName}`);
          toolResult = { success: true, category: newCat };
        }
      }
    }
    functionResponseParts.push({
      functionResponse: {
        id: call.id,
        name: call.name,
        response: toolResult
      }
    });
  }
  const previousContent = response1.candidates?.[0]?.content;
  if (!previousContent) {
    return {
      reply: actionsExecuted.join(" \xB7 ") || "\u062A\u0645 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0645\u0637\u0644\u0648\u0628.",
      actionsExecuted,
      whatsappAlertText,
      mutatedStorefront
    };
  }
  const response2 = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: [
      { role: "user", parts: [{ text: userMessage }] },
      previousContent,
      { role: "user", parts: functionResponseParts }
    ],
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: assistantToolDeclarations }]
    }
  });
  return {
    reply: response2.text || actionsExecuted.join(" \xB7 ") || "\u062A\u0645 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0628\u0646\u062C\u0627\u062D.",
    actionsExecuted,
    whatsappAlertText,
    mutatedStorefront
  };
}
async function optimizeBackgroundWithAi(params) {
  const ai = getAiClient();
  const settings = getAdminSettings();
  const fallbackUrl = params.mediaType === "video" ? "/videos/showcase-1.mp4" : "/src/assets/images/hero_catalytic_gold_1794821492784.jpg";
  const resolvedUrl = params.url?.trim() || fallbackUrl;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `\u0623\u0646\u062A \u0645\u0635\u0645\u0645 \u062A\u062C\u0631\u0628\u0629 \u0645\u0633\u062A\u062E\u062F\u0645 \u0641\u0627\u062E\u0631\u0629 \u0644\u0645\u062A\u062C\u0631 "${settings.storeName}" \u0628\u0627\u0644\u0644\u0648\u0646 \u0627\u0644\u0623\u0633\u0648\u062F \u0627\u0644\u0645\u0644\u0643\u064A (${settings.backgroundColor}) \u0648\u0627\u0644\u0630\u0647\u0628\u064A (${settings.primaryGoldColor}).
\u064A\u0631\u064A\u062F \u0627\u0644\u0645\u0627\u0644\u0643 \u0636\u0628\u0637 \u062E\u0644\u0641\u064A\u0629 ${params.target === "site" ? "\u0639\u0627\u0645\u0629 \u0644\u0643\u0627\u0645\u0644 \u0627\u0644\u0645\u0648\u0642\u0639" : "\u0635\u0641\u062D\u0629 \u0627\u0644\u0647\u0628\u0648\u0637 \u0627\u0644\u062A\u0631\u062D\u064A\u0628\u064A\u0629"} \u0645\u0646 \u0646\u0648\u0639 (${params.mediaType === "video" ? "\u0645\u0642\u0637\u0639 \u0641\u064A\u062F\u064A\u0648" : params.mediaType === "animated_image" ? "\u0635\u0648\u0631\u0629 \u0645\u062A\u062D\u0631\u0643\u0629 / GIF" : "\u0635\u0648\u0631\u0629 \u062B\u0627\u0628\u062A\u0629"}).
\u0631\u0627\u0628\u0637 \u0627\u0644\u0648\u0633\u0627\u0626\u0637: ${resolvedUrl}
\u062A\u0648\u062C\u064A\u0647 \u0627\u0644\u0645\u0627\u0644\u0643 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A): ${params.styleHint || "\u0625\u0628\u0631\u0627\u0632 \u0627\u0644\u0641\u062E\u0627\u0645\u0629 \u0627\u0644\u0630\u0647\u0628\u064A\u0629 \u0648\u0627\u0644\u062D\u0641\u0627\u0638 \u0639\u0644\u0649 \u0648\u0636\u0648\u062D \u0627\u0644\u0646\u0635\u0648\u0635 \u0648\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A"}

\u062D\u062F\u062F \u0627\u0644\u0642\u064A\u0645 \u0627\u0644\u0645\u062B\u0627\u0644\u064A\u0629 \u0628\u0635\u064A\u063A\u0629 JSON:
- recommendedOpacity: \u0631\u0642\u0645 \u0628\u064A\u0646 0.12 \u0648 0.55 (\u0644\u0644\u062E\u0644\u0641\u064A\u0629 \u0627\u0644\u0639\u0627\u0645\u0629 \u064A\u0641\u0636\u0644 0.16-0.32 \u0648\u0644\u0644\u0647\u064A\u0631\u0648 0.35-0.55)
- recommendedMotion: \u0623\u062D\u062F \u0627\u0644\u0642\u064A\u0645 ('kenburns' | 'float' | 'pulse' | 'none') \u2014 \u0627\u0633\u062A\u062E\u062F\u0645 'none' \u0644\u0645\u0642\u0627\u0637\u0639 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0644\u0623\u0646 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0645\u062A\u062D\u0631\u0643 \u0623\u0635\u0644\u0627\u064B\u060C \u0648\u0627\u0633\u062A\u062E\u062F\u0645 'kenburns' \u0623\u0648 'float' \u0623\u0648 'pulse' \u0644\u0644\u0635\u0648\u0631 \u0627\u0644\u0645\u062A\u062D\u0631\u0643\u0629.
- cssFilter: \u0641\u0644\u062A\u0631 CSS \u0645\u062A\u0648\u0627\u0641\u0642 \u0645\u0639 \u0627\u0644\u0645\u062A\u0635\u0641\u062D\u0627\u062A \u0645\u062B\u0644 "brightness(0.76) contrast(1.14) saturate(1.18)" \u064A\u0648\u0627\u0632\u0646 \u0627\u0644\u0625\u0636\u0627\u0621\u0629 \u0645\u0639 \u0627\u0644\u0630\u0647\u0628\u064A \u0648\u0627\u0644\u0623\u0633\u0648\u062F.
- explanationAr: \u0634\u0631\u062D \u0639\u0631\u0628\u064A \u0645\u0648\u062C\u0632 \u0648\u0645\u0642\u0646\u0639 \u0645\u0646 \u0633\u0637\u0631\u064A\u0646 \u064A\u0648\u0636\u062D \u0627\u0644\u062A\u062D\u0633\u064A\u0646\u0627\u062A \u0627\u0644\u062A\u064A \u062A\u0645 \u062A\u0637\u0628\u064A\u0642\u0647\u0627.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedOpacity: { type: Type.NUMBER },
            recommendedMotion: { type: Type.STRING },
            cssFilter: { type: Type.STRING },
            explanationAr: { type: Type.STRING }
          },
          required: [
            "recommendedOpacity",
            "recommendedMotion",
            "cssFilter",
            "explanationAr"
          ]
        }
      }
    });
    const parsed = JSON.parse((response.text ?? "{}").trim());
    const allowedMotions = /* @__PURE__ */ new Set(["none", "kenburns", "float", "pulse"]);
    const motion = params.mediaType === "video" ? "none" : allowedMotions.has(String(parsed.recommendedMotion)) ? parsed.recommendedMotion : "kenburns";
    const opacityRaw = Number(parsed.recommendedOpacity);
    const recommendedOpacity = Number.isFinite(opacityRaw) && opacityRaw >= 0.1 && opacityRaw <= 0.65 ? Number(opacityRaw.toFixed(2)) : params.target === "site" ? 0.24 : 0.45;
    return {
      recommendedOpacity,
      recommendedMotion: motion,
      cssFilter: parsed.cssFilter && parsed.cssFilter.length < 90 ? parsed.cssFilter : "brightness(0.78) contrast(1.12) saturate(1.15)",
      resolvedUrl,
      explanationAr: parsed.explanationAr || "\u062A\u0645\u062A \u0645\u0639\u0627\u064A\u0631\u0629 \u0627\u0644\u0634\u0641\u0627\u0641\u064A\u0629 \u0648\u0627\u0644\u062A\u0628\u0627\u064A\u0646 \u0648\u0627\u0644\u0644\u0648\u0646 \u0627\u0644\u0630\u0647\u0628\u064A \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0644\u0636\u0645\u0627\u0646 \u0641\u062E\u0627\u0645\u0629 \u0627\u0644\u062A\u0635\u0645\u064A\u0645 \u0648\u0648\u0636\u0648\u062D \u0627\u0644\u0646\u0635\u0648\u0635."
    };
  } catch {
    return {
      recommendedOpacity: params.target === "site" ? 0.24 : 0.45,
      recommendedMotion: params.mediaType === "video" ? "none" : "kenburns",
      cssFilter: "brightness(0.78) contrast(1.12) saturate(1.15)",
      resolvedUrl,
      explanationAr: "\u062A\u0645\u062A \u062A\u0647\u064A\u0626\u0629 \u0627\u0644\u0634\u0641\u0627\u0641\u064A\u0629 \u0648\u0627\u0644\u062A\u0628\u0627\u064A\u0646 \u0627\u0644\u0633\u064A\u0646\u0645\u0627\u0626\u064A \u0644\u0644\u062E\u0644\u0641\u064A\u0629 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0644\u062A\u062A\u0644\u0627\u0621\u0645 \u0645\u0639 \u0627\u0644\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u0644\u0643\u064A\u0629."
    };
  }
}
async function translateProductToEnglishWithAi(input) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `Translate the following Arabic automotive catalytic converter / DPF product into natural, professional commercial English for an e-commerce storefront:
Category: ${input.category || "Catalytic Converters"}
Arabic Name: ${input.name}
Arabic Description: ${input.description || ""}

Return JSON with:
- nameEn: concise clear English product title.
- descriptionEn: professional English product description highlighting materials, Euro compliance, and fitment.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          nameEn: { type: Type.STRING },
          descriptionEn: { type: Type.STRING }
        },
        required: ["nameEn", "descriptionEn"]
      }
    }
  });
  const parsed = JSON.parse((response.text ?? "{}").trim());
  return {
    nameEn: parsed.nameEn?.trim() || input.name,
    descriptionEn: parsed.descriptionEn?.trim() || input.description || ""
  };
}
async function importProductFromUrlWithHtml(input) {
  const ai = getAiClient();
  const cleanUrl = input.url.trim();
  const categoryList = input.categories && input.categories.length > 0 ? input.categories : ["\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0628\u0646\u0632\u064A\u0646", "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u062F\u064A\u0632\u0644", "\u062D\u0633\u0627\u0633\u0627\u062A \u0627\u0644\u0634\u0643\u0645\u0627\u0646 \u0648\u0627\u0644\u0623\u0643\u0633\u062C\u064A\u0646", "\u0648\u0635\u0644\u0627\u062A \u0648\u0645\u0644\u062D\u0642\u0627\u062A \u0627\u0644\u0639\u0627\u062F\u0645"];
  let signals = null;
  if (input.htmlContent && input.htmlContent.trim().length > 200) {
    signals = extractHtmlSignals(input.htmlContent, cleanUrl);
  }
  if (!signals || signals.textSnippet.length < 100 && signals.jsonLd.length < 40 && signals.foundImages.length === 0) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9e3);
      const resp = await fetch(cleanUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const directHtml = await resp.text();
        if (directHtml && directHtml.length > 200) {
          signals = extractHtmlSignals(directHtml, cleanUrl);
        }
      }
    } catch {
    }
  }
  if (signals && (signals.textSnippet.length > 80 || signals.jsonLd.length > 40 || signals.title.length > 5)) {
    const prompt = `\u0623\u0646\u062A \u062E\u0628\u064A\u0631 \u062A\u062C\u0627\u0631\u0629 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629 \u0641\u0627\u062E\u0631\u0629 \u0648\u0645\u062A\u0631\u062C\u0645 \u062A\u0642\u0646\u064A \u0645\u062D\u062A\u0631\u0641. \u0642\u0645 \u0628\u062A\u062D\u0644\u064A\u0644 \u0645\u062D\u062A\u0648\u0649 \u0635\u0641\u062D\u0629 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C\u0629 \u0645\u0646 \u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u062E\u0627\u0631\u062C\u064A \u0648\u062A\u062D\u0648\u064A\u0644\u0647 \u0625\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0646\u062A\u062C \u0639\u0631\u0628\u064A\u0629 \u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629 \u0645\u062A\u0643\u0627\u0645\u0644\u0629 \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A (SAR):
\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0646\u062A\u062C: ${cleanUrl}
\u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0641\u064A \u0627\u0644\u0645\u062A\u062C\u0631 (\u0627\u062E\u062A\u0631 \u0623\u0646\u0633\u0628 \u0642\u0633\u0645 \u0645\u0646\u0647\u0627): ${JSON.stringify(categoryList)}
\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0633\u062A\u062E\u0631\u062C: ${signals.title}
\u0648\u0635\u0641 \u0627\u0644\u0645\u064A\u062A\u0627: ${signals.metaDescription}
\u0628\u064A\u0627\u0646\u0627\u062A JSON-LD: ${signals.jsonLd}
\u0631\u0648\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631 \u0627\u0644\u0645\u0643\u062A\u0634\u0641\u0629: ${JSON.stringify(signals.foundImages)}
\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0646\u0635\u064A: ${signals.textSnippet}

\u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0628\u062F\u0642\u0629:
1. name: \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C \u0645\u062A\u0631\u062C\u0645\u0627\u064B \u0648\u0645\u0635\u0627\u063A\u0627\u064B \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0628\u0634\u0643\u0644 \u0627\u062D\u062A\u0631\u0627\u0641\u064A \u0648\u062C\u0630\u0627\u0628 \u064A\u0648\u0636\u062D \u0646\u0648\u0639 \u0627\u0644\u0642\u0637\u0639\u0629 \u0623\u0648 \u0627\u0644\u062A\u0648\u0627\u0641\u0642.
2. nameEn: \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u062A\u062C\u0627\u0631\u064A \u0627\u0644\u0648\u0627\u0636\u062D \u0628\u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629.
3. category: \u0627\u062E\u062A\u0631 \u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0623\u0646\u0633\u0628 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0623\u0639\u0644\u0627\u0647.
4. priceSar: \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u062A\u0642\u0631\u064A\u0628\u064A \u0628\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A (\u0631\u0642\u0645 \u0635\u062D\u064A\u062D \u0645\u0648\u062C\u0628\u061B \u0648\u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0623\u0635\u0644\u064A \u0628\u0639\u0645\u0644\u0629 \u0623\u062C\u0646\u0628\u064A\u0629 \u0645\u062B\u0644 USD \u0623\u0648 EUR \u0641\u062D\u0648\u0651\u0644\u0647 \u0644\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A \u062A\u0642\u0631\u064A\u0628\u0627\u064B).
5. originalExtractedPrice: \u0646\u0635 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0623\u0635\u0644\u064A \u0627\u0644\u0645\u0643\u062A\u0634\u0641 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629 \u0643\u0645\u0627 \u0648\u0631\u062F.
6. description: \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u0644\u0645\u0646\u062A\u062C \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0628\u0623\u0633\u0644\u0648\u0628 \u062A\u0633\u0648\u064A\u0642\u064A \u0648\u0645\u0642\u0646\u0639 \u064A\u0634\u0631\u062D \u0627\u0644\u0645\u0645\u064A\u0632\u0627\u062A \u0648\u0627\u0644\u062C\u0648\u062F\u0629 \u0648\u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645.
7. descriptionEn: \u0648\u0635\u0641 \u0645\u0648\u062C\u0632 \u0627\u062D\u062A\u0631\u0627\u0641\u064A \u0628\u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629.
8. images: \u0645\u0635\u0641\u0648\u0641\u0629 \u0628\u062C\u0645\u064A\u0639 \u0631\u0648\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631 \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u062C\u0648\u062F\u0629 \u0644\u0644\u0645\u0646\u062A\u062C (\u062A\u0628\u062F\u0623 \u0628\u0640 http \u0648\u0644\u0627 \u062A\u0634\u0645\u0644 \u0627\u0644\u0623\u064A\u0642\u0648\u0646\u0627\u062A \u0623\u0648 \u0627\u0644\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0635\u063A\u064A\u0631\u0629).
9. specs: \u0645\u0635\u0641\u0648\u0641\u0629 \u0645\u0648\u0627\u0635\u0641\u0627\u062A \u0641\u0646\u064A\u0629 \u0645\u0646\u0633\u0642\u0629 {label, value} \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629.`;
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
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
                  value: { type: Type.STRING }
                },
                required: ["label", "value"]
              }
            }
          },
          required: [
            "name",
            "nameEn",
            "category",
            "priceSar",
            "originalExtractedPrice",
            "description",
            "descriptionEn",
            "images",
            "specs"
          ]
        }
      }
    });
    const parsed = JSON.parse((response.text ?? "{}").trim());
    const mergedImages = Array.from(
      /* @__PURE__ */ new Set([...parsed.images ?? [], ...signals.foundImages ?? []])
    ).filter((img) => typeof img === "string" && /^https?:\/\//i.test(img.trim())).slice(0, 12);
    return {
      name: parsed.name?.trim() || signals.title || "\u0645\u0646\u062A\u062C \u0645\u0633\u062A\u0648\u0631\u062F \u062C\u062F\u064A\u062F",
      nameEn: parsed.nameEn?.trim() || signals.title || "",
      category: parsed.category && categoryList.includes(parsed.category) ? parsed.category : categoryList[0],
      priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 590,
      originalExtractedPrice: parsed.originalExtractedPrice?.trim() || "\u062A\u0642\u062F\u064A\u0631\u064A",
      description: parsed.description?.trim() || signals.metaDescription || "\u062A\u0645 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0646\u062A\u062C \u0628\u0646\u062C\u0627\u062D.",
      descriptionEn: parsed.descriptionEn?.trim() || "",
      images: mergedImages,
      specs: Array.isArray(parsed.specs) ? parsed.specs.filter((s) => s?.label && s?.value) : []
    };
  }
  const fallbackResponse = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `\u0627\u0642\u0631\u0623 \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u062A\u0627\u0644\u064A \u0648\u062D\u0644\u0644 \u0628\u064A\u0627\u0646\u0627\u062A\u0647 \u0648\u0627\u0633\u062A\u062E\u0631\u062C\u0647\u0627 \u0645\u062A\u0631\u062C\u0645\u0629 \u0648\u0645\u0635\u0627\u063A\u0629 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0628\u0635\u064A\u063A\u0629 JSON \u0641\u0642\u0637:
\u0627\u0644\u0631\u0627\u0628\u0637: ${cleanUrl}
\u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0645\u062A\u0627\u062D\u0629: ${JSON.stringify(categoryList)}

\u0623\u0639\u062F \u0643\u0627\u0626\u0646 JSON \u0641\u0642\u0637 \u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u062A\u0627\u0644\u064A\u0629:
{
  "name": "\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C \u0645\u062A\u0631\u062C\u0645\u0627\u064B \u0648\u0645\u0635\u0627\u063A\u0627\u064B \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0628\u0627\u062D\u062A\u0631\u0627\u0641\u064A\u0629",
  "nameEn": "Clear English product title",
  "category": "\u0623\u0646\u0633\u0628 \u0642\u0633\u0645 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629",
  "priceSar": 750,
  "originalExtractedPrice": "\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0623\u0635\u0644\u064A \u0643\u0645\u0627 \u0648\u0631\u062F",
  "description": "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u0644\u0645\u0646\u062A\u062C \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
  "descriptionEn": "Professional English description",
  "images": ["\u0631\u0648\u0627\u0628\u0637 \u0635\u0648\u0631 \u0627\u0644\u0645\u0646\u062A\u062C \u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u062C\u0648\u062F\u0629 \u0625\u0646 \u0648\u062C\u062F\u062A"],
  "specs": [{"label": "\u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0629", "value": "\u0627\u0644\u0642\u064A\u0645\u0629"}]
}`,
    config: {
      tools: [{ urlContext: {} }, { googleSearch: {} }]
    }
  });
  const rawText = (fallbackResponse.text ?? "").trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        name: parsed.name?.trim() || "\u0645\u0646\u062A\u062C \u0645\u0633\u062A\u0648\u0631\u062F \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629",
        nameEn: parsed.nameEn?.trim() || "",
        category: parsed.category && categoryList.includes(parsed.category) ? parsed.category : categoryList[0],
        priceSar: Number(parsed.priceSar) > 0 ? Math.round(Number(parsed.priceSar)) : 650,
        originalExtractedPrice: parsed.originalExtractedPrice?.trim() || "\u062A\u0642\u062F\u064A\u0631\u064A",
        description: parsed.description?.trim() || "\u064A\u0631\u062C\u0649 \u0645\u0631\u0627\u062C\u0639\u0629 \u0648\u0635\u0641 \u0627\u0644\u0645\u0646\u062A\u062C \u0648\u062A\u0639\u062F\u064A\u0644\u0647 \u0642\u0628\u0644 \u0627\u0644\u062D\u0641\u0638.",
        descriptionEn: parsed.descriptionEn?.trim() || "",
        images: Array.isArray(parsed.images) ? parsed.images.filter((i) => typeof i === "string" && /^https?:\/\//i.test(i.trim())).slice(0, 12) : [],
        specs: Array.isArray(parsed.specs) ? parsed.specs.filter((s) => s?.label && s?.value) : []
      };
    } catch {
    }
  }
  return {
    name: "\u0645\u0646\u062A\u062C \u0645\u0633\u062A\u0648\u0631\u062F \u0645\u0646 \u0631\u0627\u0628\u0637 \u062E\u0627\u0631\u062C\u064A",
    nameEn: "",
    category: categoryList[0],
    priceSar: 650,
    originalExtractedPrice: "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F",
    description: rawText.slice(0, 500) || "\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u062A\u0641\u0627\u0635\u064A\u0644 \u0643\u0627\u0645\u0644\u0629 \u0645\u0646 \u0627\u0644\u0645\u0635\u062F\u0631 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B. \u064A\u0631\u062C\u0649 \u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0648\u062A\u062D\u062F\u064A\u062B\u0647\u0627.",
    descriptionEn: "",
    images: [],
    specs: [{ label: "\u0627\u0644\u0645\u0635\u062F\u0631", value: "\u0645\u0633\u062A\u0648\u0631\u062F \u0639\u0628\u0631 \u0631\u0627\u0628\u0637" }]
  };
}

// server.ts
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
app.use(express.json({ limit: "65mb" }));
app.use("/uploads", express.static(UPLOADS_DIR));
function extractBearer(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}
function requireAdmin(req, res, next) {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: "\u0645\u0637\u0644\u0648\u0628 \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0627\u0644\u0645\u0627\u0644\u0643." });
    return;
  }
  const verified = verifySignedToken(token);
  if (!verified || verified.role !== "admin") {
    res.status(401).json({ error: "\u062C\u0644\u0633\u0629 \u0627\u0644\u0645\u0627\u0644\u0643 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629 \u0623\u0648 \u0645\u0646\u062A\u0647\u064A\u0629." });
    return;
  }
  next();
}
function requireCustomer(req, res, next) {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: "\u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0639\u0645\u064A\u0644." });
    return;
  }
  const verified = verifySignedToken(token);
  if (!verified || verified.role !== "customer" || !verified.customerId) {
    res.status(401).json({ error: "\u062C\u0644\u0633\u0629 \u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629." });
    return;
  }
  req.customerId = verified.customerId;
  next();
}
app.get("/api/storefront", (_req, res) => {
  res.json({
    settings: getPublicSettings(),
    products: getPublishedProducts(),
    banners: getActiveBanners(),
    reviews: getAllApprovedReviews()
  });
});
app.get("/api/products/:id/reviews", (req, res) => {
  res.json({ reviews: getApprovedReviewsForProduct(String(req.params.id)) });
});
app.post("/api/products/:id/reviews", (req, res) => {
  const { customerName, rating, comment } = req.body;
  if (!customerName?.trim() || !comment?.trim()) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 \u0627\u0644\u0627\u0633\u0645 \u0648\u0627\u0644\u062A\u0639\u0644\u064A\u0642 \u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0645\u0646\u062A\u062C." });
    return;
  }
  const review = addProductReview({
    productId: String(req.params.id),
    customerName,
    rating: Number(rating) || 5,
    comment
  });
  res.status(201).json({ review, pendingApproval: true });
});
app.post("/api/upload-public", (req, res) => {
  try {
    const { filename, mimeType, dataBase64 } = req.body;
    if (!filename || !mimeType || !dataBase64 || !mimeType.startsWith("image/")) {
      res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0635\u0648\u0631\u0629 \u0635\u0627\u0644\u062D\u0629 (JPG / PNG)." });
      return;
    }
    const url = saveUploadedMedia(filename, mimeType, dataBase64);
    res.status(201).json({ url });
  } catch {
    res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629." });
  }
});
app.post("/api/analytics/visit", (req, res) => {
  const { visitorId } = req.body;
  if (visitorId && typeof visitorId === "string") {
    recordStoreVisit(visitorId);
  } else {
    recordStoreVisit(`anon-${Date.now()}`);
  }
  res.status(204).end();
});
app.post("/api/analytics/search", (req, res) => {
  const { query } = req.body;
  if (query && typeof query === "string") {
    recordSearchQuery(query);
  }
  res.status(204).end();
});
app.post("/api/promo-codes/validate", (req, res) => {
  const { code, subtotalSar } = req.body;
  if (!code?.trim()) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0645\u0632 \u0643\u0648\u062F \u0627\u0644\u062E\u0635\u0645 \u0627\u0644\u0645\u0643\u0648\u0646 \u0645\u0646 4 \u062E\u0627\u0646\u0627\u062A." });
    return;
  }
  const result = validatePromoDiscountCode(code, Math.max(0, Number(subtotalSar) || 0));
  if (result.valid === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});
app.post("/api/orders", async (req, res) => {
  try {
    if (getAdminSettings().storeOpen === false) {
      res.status(503).json({
        error: "\u0627\u0644\u0645\u062A\u062C\u0631 \u0645\u063A\u0644\u0642 \u0645\u0624\u0642\u062A\u0627\u064B \u0645\u0646 \u0642\u0650\u0628\u0644 \u0627\u0644\u0645\u0627\u0644\u0643 \u0648\u0644\u0627 \u064A\u0633\u062A\u0642\u0628\u0644 \u0637\u0644\u0628\u0627\u062A \u062C\u062F\u064A\u062F\u0629 \u062D\u0627\u0644\u064A\u0627\u064B."
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
      couponCode
    } = req.body;
    if (!customerName?.trim() || !customerPhone?.trim() || !customerAddress?.trim()) {
      res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u062A\u0639\u0628\u0626\u0629 \u0627\u0644\u0627\u0633\u0645 \u0648\u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644 \u0648\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0628\u0627\u0644\u0643\u0627\u0645\u0644." });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "\u0633\u0644\u0629 \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0641\u0627\u0631\u063A\u0629." });
      return;
    }
    const published = getPublishedProducts();
    const resolvedItems = [];
    let totalSar = 0;
    for (const reqItem of items) {
      const prod = published.find((p) => p.id === reqItem.productId);
      if (!prod) continue;
      const qty = Math.max(1, Math.min(99, Math.floor(Number(reqItem.quantity) || 1)));
      totalSar += prod.priceSar * qty;
      resolvedItems.push({
        productId: prod.id,
        name: prod.name,
        priceSar: prod.priceSar,
        quantity: qty,
        image: prod.images[0] || ""
      });
    }
    if (resolvedItems.length === 0) {
      res.status(400).json({ error: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u0646\u062A\u062C\u0627\u062A \u0635\u0627\u0644\u062D\u0629 \u0641\u064A \u0627\u0644\u0637\u0644\u0628." });
      return;
    }
    const settings = getPublicSettings();
    let customerId;
    const token = extractBearer(req);
    if (token) {
      const verified = verifySignedToken(token);
      if (verified?.role === "customer" && verified.customerId) {
        customerId = verified.customerId;
      }
    }
    const orderId = `ORD-${crypto3.randomInt(1e4, 99999)}`;
    const loyaltyRes = applyLoyaltyAndAwardOnOrder({
      customerId,
      subtotalSar: totalSar,
      redeemCoins,
      couponCode,
      orderId
    });
    if (loyaltyRes.error) {
      res.status(400).json({ error: loyaltyRes.error });
      return;
    }
    const finalTotalSar = Number(Math.max(0, totalSar - loyaltyRes.discountSar).toFixed(2));
    const totalUsd = Number((finalTotalSar * settings.sarToUsdRate).toFixed(2));
    const resolvedMethod = paymentMethod === "paypal" ? "paypal" : paymentMethod === "bank_transfer" ? "bank_transfer" : "whatsapp";
    const order = createOrder({
      id: orderId,
      customerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      nationalAddress: nationalAddress?.trim() || void 0,
      customerAddress: customerAddress.trim(),
      shippingCompany: shippingCompany?.trim() || void 0,
      items: resolvedItems,
      subtotalSar: totalSar,
      discountSar: loyaltyRes.discountSar > 0 ? loyaltyRes.discountSar : void 0,
      coinsRedeemed: loyaltyRes.coinsRedeemed > 0 ? loyaltyRes.coinsRedeemed : void 0,
      couponCodeUsed: loyaltyRes.couponCodeUsed,
      coinsEarned: loyaltyRes.coinsEarned > 0 ? loyaltyRes.coinsEarned : void 0,
      totalSar: finalTotalSar,
      totalUsd,
      paymentMethod: resolvedMethod,
      paypalTransactionId: resolvedMethod === "paypal" ? paypalTransactionId : void 0,
      bankTransferRef: resolvedMethod === "bank_transfer" ? bankTransferRef?.trim() || void 0 : void 0,
      status: resolvedMethod === "paypal" ? "\u062A\u0645 \u0627\u0644\u062A\u0623\u0643\u064A\u062F" : "\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    await notifyOwnerWebhookIfConfigured(
      "new_order",
      `\u0637\u0644\u0628 \u062C\u062F\u064A\u062F ${order.id} \u0645\u0646 ${order.customerName} \u0628\u0642\u064A\u0645\u0629 ${order.totalSar} \u0631.\u0633 (${order.paymentMethod})`
    );
    res.status(201).json({ order, customer: loyaltyRes.updatedCustomer });
  } catch (error) {
    console.error("Order creation error:", error);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0637\u0644\u0628." });
  }
});
app.post("/api/customers/register", (req, res) => {
  const { name, phone, nationalAddress, address, password } = req.body;
  if (!name?.trim() || !phone?.trim() || !address?.trim() || !password || password.length < 4) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0627\u0633\u0645\u060C \u0627\u0644\u062C\u0648\u0627\u0644\u060C \u0627\u0644\u0639\u0646\u0648\u0627\u0646\u060C \u0648\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 (4 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644)." });
    return;
  }
  const result = registerCustomer({ name, phone, nationalAddress, address, password });
  if (result.error || !result.customer) {
    res.status(400).json({ error: result.error || "\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062D\u0633\u0627\u0628." });
    return;
  }
  const token = createSignedToken({ role: "customer", customerId: result.customer.id });
  res.status(201).json({ token, customer: result.customer });
});
app.post("/api/customers/login", (req, res) => {
  const { phone, password } = req.body;
  if (!phone?.trim() || !password) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644 \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631." });
    return;
  }
  const customer = loginCustomer(phone, password);
  if (!customer) {
    res.status(401).json({ error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629." });
    return;
  }
  const token = createSignedToken({ role: "customer", customerId: customer.id });
  res.json({ token, customer });
});
app.post("/api/customers/forgot-password", (req, res) => {
  const { phone } = req.body;
  if (!phone?.trim()) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644 \u0627\u0644\u0645\u0633\u062C\u0644." });
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
    message: "\u062A\u0645 \u062A\u0648\u0644\u064A\u062F \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0644\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0628\u0646\u062C\u0627\u062D."
  });
});
app.post("/api/customers/reset-password", (req, res) => {
  const { phone, code, newPassword } = req.body;
  if (!phone?.trim() || !code?.trim()) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644 \u0648\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642." });
    return;
  }
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: "\u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 4 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644." });
    return;
  }
  const result = confirmCustomerPasswordReset(phone, code, newPassword);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  const token = createSignedToken({ role: "customer", customerId: result.customer.id });
  res.json({ success: true, token, customer: result.customer });
});
app.post("/api/customers/change-password", requireCustomer, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 4) {
    res.status(400).json({
      error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 (4 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644)."
    });
    return;
  }
  const result = changeCustomerPassword(req.customerId, currentPassword, newPassword);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ success: true });
});
app.get("/api/customers/me", requireCustomer, (req, res) => {
  const customer = getCustomerById(req.customerId);
  if (!customer) {
    res.status(404).json({ error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  const orders = getOrdersForCustomer(customer.id);
  res.json({ customer, orders });
});
app.put("/api/customers/me", requireCustomer, (req, res) => {
  const { name, phone, nationalAddress, address } = req.body;
  const updated = updateCustomerProfile(req.customerId, {
    name,
    phone,
    nationalAddress,
    address
  });
  if (!updated) {
    res.status(404).json({ error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  res.json({ customer: updated });
});
app.post("/api/customers/daily-checkin", requireCustomer, (req, res) => {
  const result = claimDailyCoins(req.customerId);
  if (result.error || !result.customer) {
    res.status(400).json({ error: result.error || "\u062A\u0639\u0630\u0631 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u064A\u0648\u0645\u064A." });
    return;
  }
  res.json({ customer: result.customer, awardedCoins: result.awardedCoins });
});
app.post("/api/customers/redeem-coupon", requireCustomer, (req, res) => {
  const { coins } = req.body;
  const result = convertCoinsToCoupon(req.customerId, Number(coins) || 0);
  if (result.error || !result.customer || !result.coupon) {
    res.status(400).json({ error: result.error || "\u062A\u0639\u0630\u0631 \u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0625\u0644\u0649 \u0643\u0648\u0628\u0648\u0646." });
    return;
  }
  res.json({ customer: result.customer, coupon: result.coupon });
});
async function dispatchOwnerSecurityCodeEmail(toEmail, code, subject, heading, description) {
  const htmlBody = `
    <div dir="rtl" style="font-family: Arial, sans-serif; background:#09090B; color:#F5F2EB; padding:24px; border:1px solid #D4AF37; border-radius:12px;">
      <h2 style="color:#E5C158; margin-top:0;">${heading}</h2>
      <p>${description}</p>
      <div style="font-size:28px; font-weight:bold; letter-spacing:4px; color:#D4AF37; background:#14120E; padding:14px 20px; border-radius:10px; display:inline-block; margin:12px 0;">
        ${code}
      </div>
      <p style="color:#9E988C; font-size:13px;">\u0627\u0644\u0631\u0645\u0632 \u0645\u0624\u0642\u062A \u0648\u0633\u0631\u064A\u0639 \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621. \u0625\u0630\u0627 \u0644\u0645 \u062A\u0637\u0644\u0628 \u0630\u0644\u0643\u060C \u064A\u0631\u062C\u0649 \u062A\u0623\u0645\u064A\u0646 \u062D\u0633\u0627\u0628\u0643 \u0641\u0648\u0631\u0627\u064B.</p>
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
          pass: process.env.SMTP_PASS
        }
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: toEmail,
        subject,
        text: `${heading}: ${code}`,
        html: htmlBody
      });
      return { deliveryMode: "smtp" };
    }
    if (process.env.RESEND_API_KEY) {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "onboarding@resend.dev",
          to: [toEmail],
          subject,
          html: htmlBody
        })
      });
      if (resendRes.ok) {
        return { deliveryMode: "resend" };
      }
    }
  } catch (err) {
    console.error("Owner email dispatch warning:", err);
  }
  return { deliveryMode: "verified_direct", previewCode: code };
}
app.post("/api/admin/login", async (req, res) => {
  const { password } = req.body;
  if (!password || !verifyAdminPassword(password)) {
    res.status(401).json({ error: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0627\u0644\u0643 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629." });
    return;
  }
  const twoFactor = getAdminTwoFactorStatus();
  if (!twoFactor.enabled) {
    const token = createSignedToken({ role: "admin" });
    res.json({ token });
    return;
  }
  const challengeToken = createSignedToken({
    role: "admin_2fa_pending",
    exp: Date.now() + 1e3 * 60 * 10
  });
  if (twoFactor.method === "email") {
    const otp = issueAdminEmailLoginOtp();
    const sent = await dispatchOwnerSecurityCodeEmail(
      otp.recoveryEmail,
      otp.code,
      "\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629 (2FA) - \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0627\u0644\u0645\u0627\u0644\u0643",
      "\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0644\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0627\u0644\u0645\u0627\u0644\u0643",
      "\u0623\u062F\u062E\u0644 \u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632 \u0644\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629 \u0648\u0627\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645:"
    );
    res.json({
      requires2fa: true,
      method: "email",
      challengeToken,
      deliveryMode: sent.deliveryMode,
      previewCode: sent.previewCode,
      message: sent.deliveryMode === "verified_direct" ? "\u062A\u0645 \u062A\u0648\u0644\u064A\u062F \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u062B\u0646\u0627\u0626\u064A \u0644\u0644\u0625\u064A\u0645\u064A\u0644 \u0627\u0644\u0645\u0639\u062A\u0645\u062F (\u0644\u0644\u062A\u0648\u0635\u064A\u0644 \u0644\u0635\u0646\u062F\u0648\u0642 \u0627\u0644\u0648\u0627\u0631\u062F\u060C \u0623\u0636\u0641 SMTP \u0623\u0648 Resend \u0641\u064A \u0627\u0644\u0645\u062A\u063A\u064A\u0631\u0627\u062A)." : "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629 \u0625\u0644\u0649 \u0628\u0631\u064A\u062F \u0627\u0644\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0639\u062A\u0645\u062F."
    });
    return;
  }
  res.json({
    requires2fa: true,
    method: "totp",
    challengeToken,
    message: "\u0623\u062F\u062E\u0644 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0645\u0643\u0648\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645 \u0645\u0646 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 (Google Authenticator)."
  });
});
app.post("/api/admin/login/send-email-otp", async (req, res) => {
  const { challengeToken } = req.body;
  const verified = challengeToken ? verifySignedToken(challengeToken) : null;
  if (!verified || verified.role !== "admin_2fa_pending") {
    res.status(401).json({ error: "\u0627\u0646\u062A\u0647\u062A \u062C\u0644\u0633\u0629 \u0627\u0644\u062A\u062D\u0642\u0642\u060C \u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0645\u062C\u062F\u062F\u0627\u064B." });
    return;
  }
  const otp = issueAdminEmailLoginOtp();
  const sent = await dispatchOwnerSecurityCodeEmail(
    otp.recoveryEmail,
    otp.code,
    "\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A - \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0627\u0644\u0645\u0627\u0644\u0643",
    "\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0644\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0627\u0644\u0645\u0627\u0644\u0643",
    "\u0627\u0633\u062A\u062E\u062F\u0645 \u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632 \u0644\u0625\u062A\u0645\u0627\u0645 \u0627\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645:"
  );
  res.json({
    sent: true,
    deliveryMode: sent.deliveryMode,
    previewCode: sent.previewCode,
    message: sent.deliveryMode === "verified_direct" ? "\u062A\u0645 \u062A\u0648\u0644\u064A\u062F \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A \u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0639\u062A\u0645\u062F." : "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0625\u0644\u0649 \u0628\u0631\u064A\u062F \u0627\u0644\u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0639\u062A\u0645\u062F."
  });
});
app.post("/api/admin/login/verify-2fa", (req, res) => {
  const { challengeToken, code } = req.body;
  const verified = challengeToken ? verifySignedToken(challengeToken) : null;
  if (!verified || verified.role !== "admin_2fa_pending") {
    res.status(401).json({ error: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u062C\u0644\u0633\u0629 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u060C \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u062C\u062F\u062F\u0627\u064B." });
    return;
  }
  const check = verifyAdminSecondFactor(code || "");
  if (check.ok === false) {
    res.status(401).json({ error: check.error });
    return;
  }
  const token = createSignedToken({ role: "admin" });
  res.json({ token, usedBackupCode: check.usedBackupCode });
});
app.post("/api/admin/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631." });
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
    "\u0631\u0645\u0632 \u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0627\u0644\u0643 - \u0645\u0635\u0646\u0639 \u0627\u0644\u062A\u0627\u062C \u0627\u0644\u0630\u0647\u0628\u064A",
    "\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0627\u0644\u0645\u0627\u0644\u0643",
    "\u062A\u0645 \u0637\u0644\u0628 \u0631\u0645\u0632 \u062A\u062D\u0642\u0642 \u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0627\u0644\u0645\u0627\u0644\u0643:"
  );
  res.json({
    sent: true,
    deliveryMode: sent.deliveryMode,
    previewCode: sent.previewCode,
    message: sent.deliveryMode === "verified_direct" ? "\u062A\u0645 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0628\u0631\u064A\u062F\u0643 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0648\u062A\u0648\u0644\u064A\u062F \u0631\u0645\u0632 \u0627\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0628\u0646\u062C\u0627\u062D (\u0644\u0644\u062A\u0648\u0635\u064A\u0644 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A \u0644\u0635\u0646\u062F\u0648\u0642 \u0627\u0644\u0648\u0627\u0631\u062F\u060C \u0623\u0636\u0641 \u0628\u064A\u0627\u0646\u0627\u062A SMTP \u0623\u0648 Resend \u0641\u064A \u0645\u062A\u063A\u064A\u0631\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629)." : "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0628\u0646\u062C\u0627\u062D \u0625\u0644\u0649 \u0628\u0631\u064A\u062F\u0643 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0627\u0644\u0645\u0639\u062A\u0645\u062F."
  });
});
app.post("/api/admin/reset-password", (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email?.trim() || !code?.trim()) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0648\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642." });
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "\u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 6 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644." });
    return;
  }
  const result = confirmAdminPasswordReset(email, code, newPassword);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ success: true });
});
app.get("/api/admin/2fa/status", requireAdmin, (_req, res) => {
  res.json(getAdminTwoFactorStatus());
});
app.post("/api/admin/2fa/setup-totp", requireAdmin, async (_req, res) => {
  try {
    const { secret, otpauthUrl } = beginAdminTotpSetup();
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 220,
      margin: 1,
      color: { dark: "#09090B", light: "#FFFFFF" }
    });
    res.json({ secret, otpauthUrl, qrDataUrl });
  } catch (error) {
    console.error("2FA TOTP setup error:", error);
    res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u062A\u0648\u0644\u064A\u062F \u0631\u0645\u0632 QR \u0644\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629." });
  }
});
app.post("/api/admin/2fa/confirm-totp", requireAdmin, (req, res) => {
  const { code } = req.body;
  if (!code?.trim()) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0645\u0643\u0648\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645 \u0645\u0646 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629." });
    return;
  }
  const result = confirmAdminTotpSetup(code);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({
    enabled: true,
    method: "totp",
    backupCodes: result.backupCodes,
    status: getAdminTwoFactorStatus()
  });
});
app.post("/api/admin/2fa/enable-email", requireAdmin, (_req, res) => {
  const result = enableAdminEmailTwoFactor();
  res.json({
    enabled: true,
    method: "email",
    backupCodes: result.backupCodes,
    status: getAdminTwoFactorStatus()
  });
});
app.post("/api/admin/2fa/disable", requireAdmin, (req, res) => {
  const { currentPassword } = req.body;
  if (!currentPassword) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0627\u0644\u0643 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0644\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0645\u0635\u0627\u062F\u0642\u0629 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629." });
    return;
  }
  const result = disableAdminTwoFactor(currentPassword);
  if (result.ok === false) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ enabled: false, status: getAdminTwoFactorStatus() });
});
app.post("/api/admin/2fa/regenerate-backup-codes", requireAdmin, (_req, res) => {
  const backupCodes = regenerateAdminBackupCodes();
  res.json({ backupCodes, status: getAdminTwoFactorStatus() });
});
app.get("/api/admin/dashboard", requireAdmin, (_req, res) => {
  const { alerts, whatsappDigestText } = getOwnerAlertsAndDigest();
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
    analytics: getOwnerAnalyticsAdmin()
  });
});
app.put("/api/admin/reviews/:id", requireAdmin, (req, res) => {
  const { approved } = req.body;
  const updated = approveReviewAdmin(String(req.params.id), Boolean(approved));
  if (!updated) {
    res.status(404).json({ error: "\u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  res.json({ review: updated });
});
app.delete("/api/admin/reviews/:id", requireAdmin, (req, res) => {
  const ok = deleteReviewAdmin(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "\u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  res.json({ success: true });
});
app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const updated = updateSettings(req.body);
  res.json({ settings: updated });
});
app.post("/api/admin/upload", requireAdmin, (req, res) => {
  try {
    const { filename, mimeType, dataBase64 } = req.body;
    if (!filename || !mimeType || !dataBase64) {
      res.status(400).json({ error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629." });
      return;
    }
    const url = saveUploadedMedia(filename, mimeType, dataBase64);
    res.status(201).json({ url });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0631\u0641\u0648\u0639." });
  }
});
app.post("/api/admin/change-password", requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !verifyAdminPassword(currentPassword)) {
    res.status(400).json({ error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629." });
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "\u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 6 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644." });
    return;
  }
  updateAdminPassword(newPassword);
  res.json({ success: true });
});
app.post("/api/admin/assistant/chat", requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 \u0631\u0633\u0627\u0644\u0629 \u0644\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0634\u062E\u0635\u064A." });
      return;
    }
    const userMsg = appendAssistantMessage({
      id: `msg-${crypto3.randomUUID().slice(0, 8)}`,
      role: "user",
      text: message.trim(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const result = await runOwnerAssistantTurn(message.trim());
    const assistantMsg = appendAssistantMessage({
      id: `msg-${crypto3.randomUUID().slice(0, 8)}`,
      role: "assistant",
      text: result.reply,
      actionsExecuted: result.actionsExecuted,
      whatsappAlertText: result.whatsappAlertText,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const { alerts, whatsappDigestText } = getOwnerAlertsAndDigest();
    res.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      mutatedStorefront: result.mutatedStorefront,
      products: getAllProductsAdmin(),
      alerts,
      whatsappDigestText
    });
  } catch (error) {
    console.error("Assistant error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u0646\u0641\u064A\u0630 \u0637\u0644\u0628 \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0630\u0643\u064A."
    });
  }
});
app.post("/api/admin/assistant/send-webhook", requireAdmin, async (_req, res) => {
  const { whatsappDigestText } = getOwnerAlertsAndDigest();
  const sent = await notifyOwnerWebhookIfConfigured("manual_owner_digest", whatsappDigestText);
  res.json({ sent, whatsappDigestText });
});
app.post("/api/admin/ai/optimize-background", requireAdmin, async (req, res) => {
  try {
    const { target, mediaType, url, styleHint } = req.body;
    const result = await optimizeBackgroundWithAi({
      target: target === "hero" ? "hero" : "site",
      mediaType: mediaType === "video" || mediaType === "animated_image" ? mediaType : "image",
      url,
      styleHint
    });
    res.json(result);
  } catch (error) {
    console.error("Background AI optimize error:", error);
    res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u0636\u0628\u0637 \u0627\u0644\u062E\u0644\u0641\u064A\u0629 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A." });
  }
});
app.post("/api/admin/ai/translate-product", requireAdmin, async (req, res) => {
  try {
    const { name, description, category } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C \u0645\u0637\u0644\u0648\u0628 \u0644\u0644\u062A\u0631\u062C\u0645\u0629." });
      return;
    }
    const result = await translateProductToEnglishWithAi({
      name: name.trim(),
      description: description?.trim(),
      category: category?.trim()
    });
    res.json(result);
  } catch (error) {
    console.error("AI translate product error:", error);
    res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u062A\u0631\u062C\u0645\u0629 \u0627\u0644\u0645\u0646\u062A\u062C \u0644\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B." });
  }
});
app.post("/api/admin/ai/import-from-url", requireAdmin, async (req, res) => {
  try {
    const { url, htmlContent } = req.body;
    if (!url || !/^https?:\/\//i.test(url.trim())) {
      res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0627\u0628\u0637 \u0645\u0646\u062A\u062C \u0635\u062D\u064A\u062D \u064A\u0628\u062F\u0623 \u0628\u0640 http:// \u0623\u0648 https://" });
      return;
    }
    const categories = getAdminSettings().categories.filter((c) => c.isActive !== false).map((c) => c.name);
    const extracted = await importProductFromUrlWithHtml({
      url: url.trim(),
      htmlContent: typeof htmlContent === "string" ? htmlContent.slice(0, 25e4) : void 0,
      categories
    });
    res.json({ product: extracted });
  } catch (error) {
    console.error("AI import from URL error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0648\u062A\u062D\u0644\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0646\u062A\u062C \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A."
    });
  }
});
app.post("/api/admin/products", requireAdmin, (req, res) => {
  const body = req.body;
  if (!body.name?.trim() || !body.priceSar) {
    res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C \u0648\u0627\u0644\u0633\u0639\u0631 \u0645\u0637\u0644\u0648\u0628\u0627\u0646." });
    return;
  }
  const product = {
    id: `prod-${crypto3.randomUUID().slice(0, 8)}`,
    sku: body.sku?.trim() || void 0,
    name: body.name.trim(),
    nameEn: body.nameEn?.trim() || void 0,
    category: body.category?.trim() || "\u0645\u0642\u062A\u0646\u064A\u0627\u062A \u0645\u062E\u062A\u0627\u0631\u0629",
    priceSar: Number(body.priceSar),
    wholesalePriceSar: body.wholesalePriceSar ? Number(body.wholesalePriceSar) : void 0,
    compareAtPriceSar: body.compareAtPriceSar ? Number(body.compareAtPriceSar) : void 0,
    description: body.description?.trim() || "",
    descriptionEn: body.descriptionEn?.trim() || void 0,
    images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
    specs: Array.isArray(body.specs) ? body.specs : [],
    installationGuidePdfUrl: body.installationGuidePdfUrl?.trim() || void 0,
    installationGuideImages: Array.isArray(body.installationGuideImages) ? body.installationGuideImages.filter(Boolean) : void 0,
    fuelEfficiencyGainPercent: body.fuelEfficiencyGainPercent ? Number(body.fuelEfficiencyGainPercent) : void 0,
    inStock: body.inStock !== false,
    isPublished: Boolean(body.isPublished),
    costPriceSar: body.costPriceSar ? Number(body.costPriceSar) : void 0,
    profitMarginPercent: body.profitMarginPercent ? Number(body.profitMarginPercent) : void 0,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
    seoKeywords: body.seoKeywords,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  createProduct(product);
  res.status(201).json({ product });
});
app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  const updated = updateProduct(String(req.params.id), req.body);
  if (!updated) {
    res.status(404).json({ error: "\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  res.json({ product: updated });
});
app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  const ok = deleteProduct(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  res.json({ success: true });
});
app.post("/api/admin/scrape-product", requireAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !/^https?:\/\//i.test(url.trim())) {
      res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0627\u0628\u0637 \u0645\u0646\u062A\u062C \u0635\u062D\u064A\u062D \u064A\u0628\u062F\u0623 \u0628\u0640 http:// \u0623\u0648 https://" });
      return;
    }
    const extracted = await scrapeProductFromUrl(url.trim());
    const draftProduct = {
      id: `draft-${crypto3.randomUUID().slice(0, 8)}`,
      name: extracted.name,
      category: extracted.category,
      priceSar: extracted.priceSar,
      description: extracted.description,
      images: extracted.images,
      specs: extracted.specs,
      inStock: true,
      isPublished: false,
      isScrapedDraft: true,
      sourceUrl: url.trim(),
      originalExtractedPrice: extracted.originalExtractedPrice,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    createProduct(draftProduct);
    await notifyOwnerWebhookIfConfigured(
      "scraped_draft_saved",
      `\u062A\u0645 \u0633\u062D\u0628 \u0648\u062D\u0641\u0638 \u0645\u0633\u0648\u062F\u0629 \u0633\u0631\u064A\u0629 \u062C\u062F\u064A\u062F\u0629 \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629: ${draftProduct.name}`
    );
    res.status(201).json({ product: draftProduct });
  } catch (error) {
    console.error("AI scrape error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0646\u062A\u062C \u0645\u0646 \u0627\u0644\u0631\u0627\u0628\u0637."
    });
  }
});
app.get("/api/admin/proxy-image", requireAdmin, async (req, res) => {
  const targetUrl = String(req.query.url || "").trim();
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    res.status(400).json({ error: "\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0648\u0631\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
    return;
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 9e3);
    const resp = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      }
    });
    clearTimeout(t);
    if (!resp.ok) {
      res.status(502).json({ error: "\u062A\u0639\u0630\u0631 \u062C\u0644\u0628 \u0627\u0644\u0635\u0648\u0631\u0629 \u0645\u0646 \u0627\u0644\u0645\u0635\u062F\u0631." });
      return;
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      res.status(400).json({ error: "\u0627\u0644\u0631\u0627\u0628\u0637 \u0644\u0627 \u064A\u0634\u064A\u0631 \u0625\u0644\u0649 \u0635\u0648\u0631\u0629." });
      return;
    }
    const arrayBuf = await resp.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.send(Buffer.from(arrayBuf));
  } catch {
    res.status(502).json({ error: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u062E\u0627\u0631\u062C\u064A\u0629 \u0644\u0644\u062A\u062D\u0631\u064A\u0631." });
  }
});
app.post("/api/admin/ai/enhance-copy", requireAdmin, async (req, res) => {
  try {
    const body = req.body;
    if (body.mode === "store") {
      const settings = getAdminSettings();
      const result2 = await enhanceStoreIdentityWithAi({
        storeName: body.storeName || settings.storeName,
        storeTagline: body.storeTagline || settings.storeTagline,
        heroTitle: body.heroTitle || settings.heroTitle,
        focus: body.focus
      });
      res.json({ result: result2 });
      return;
    }
    const result = await enhanceProductCopyWithAi({
      name: body.name || "\u0645\u0646\u062A\u062C \u062F\u0628\u0629 \u062A\u0644\u0648\u062B",
      category: body.category || "\u062F\u0628\u0627\u062A \u062A\u0644\u0648\u062B \u0627\u0644\u0628\u0646\u0632\u064A\u0646",
      description: body.description,
      priceSar: body.priceSar
    });
    res.json({ result });
  } catch (error) {
    console.error("AI copy enhance error:", error);
    res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0633\u064A\u0646 \u0627\u0644\u0646\u0635\u0648\u0635 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A." });
  }
});
app.post("/api/admin/scrape-similar", requireAdmin, async (req, res) => {
  try {
    const {
      storeUrl,
      targetProductHint,
      profitMarginPercent,
      extraProfitSar,
      category
    } = req.body;
    if (!storeUrl || !/^https?:\/\//i.test(storeUrl.trim())) {
      res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0627\u0628\u0637 \u0645\u062A\u062C\u0631 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0635\u062D\u064A\u062D \u064A\u0628\u062F\u0623 \u0628\u0640 https://" });
      return;
    }
    if (!targetProductHint?.trim()) {
      res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u062A\u062D\u062F\u064A\u062F \u0646\u0648\u0639 \u0623\u0648 \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u0645\u0634\u0627\u0628\u0647 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0633\u062D\u0628\u0647." });
      return;
    }
    const extractedList = await scrapeSimilarProductsFromUrl({
      storeUrl: storeUrl.trim(),
      targetProductHint: targetProductHint.trim(),
      profitMarginPercent: Number(profitMarginPercent ?? 25),
      extraProfitSar: Number(extraProfitSar ?? 0),
      category
    });
    const createdProducts = [];
    for (const item of extractedList) {
      const draft = {
        id: `draft-${crypto3.randomUUID().slice(0, 8)}`,
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
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      createProduct(draft);
      createdProducts.push(draft);
    }
    await notifyOwnerWebhookIfConfigured(
      "scraped_similar_batch",
      `\u062A\u0645 \u0633\u062D\u0628 ${createdProducts.length} \u0645\u0646\u062A\u062C \u0645\u0634\u0627\u0628\u0647 \u0644\u0640 "${targetProductHint.trim()}" \u0645\u0639 \u0627\u062D\u062A\u0633\u0627\u0628 \u0647\u0627\u0645\u0634 \u0627\u0644\u0631\u0628\u062D \u0648\u062D\u0641\u0638\u0647\u0627 \u0643\u0645\u0633\u0648\u062F\u0627\u062A \u0633\u0631\u064A\u0629.`
    );
    res.status(201).json({ products: createdProducts });
  } catch (error) {
    console.error("Similar scrape error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0633\u062D\u0628 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u0645\u0634\u0627\u0628\u0647\u0629 \u0645\u0646 \u0627\u0644\u0645\u062A\u062C\u0631 \u0627\u0644\u0645\u062D\u062F\u062F."
    });
  }
});
async function refreshPublishedProductsSeo() {
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
        seoLastUpdated: (/* @__PURE__ */ new Date()).toISOString()
      });
      updatedCount++;
    } catch (err) {
      console.error(`SEO update failed for ${prod.id}:`, err);
    }
  }
  updateSettings({ seoLastAutoRun: (/* @__PURE__ */ new Date()).toISOString() });
  return updatedCount;
}
app.post("/api/admin/seo/refresh", requireAdmin, async (req, res) => {
  try {
    const { productId } = req.body;
    const settings = getAdminSettings();
    if (productId) {
      const target = getProductByIdAdmin(productId);
      if (!target) {
        res.status(404).json({ error: "\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
        return;
      }
      const seo = await generateProductSeoData(target, settings.storeName);
      const updated = updateProduct(target.id, {
        seoTitle: seo.seoTitle,
        seoDescription: seo.seoDescription,
        seoKeywords: seo.seoKeywords,
        schemaMarkup: seo.schemaMarkup,
        seoLastUpdated: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json({ updatedCount: 1, product: updated });
      return;
    }
    const updatedCount = await refreshPublishedProductsSeo();
    res.json({ updatedCount, products: getAllProductsAdmin() });
  } catch (error) {
    console.error("SEO refresh error:", error);
    res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u064A\u0648 \u0639\u0628\u0631 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A." });
  }
});
app.post("/api/admin/ads/generate", requireAdmin, async (req, res) => {
  try {
    const { productId, campaignGoal } = req.body;
    const settings = getAdminSettings();
    const product = productId ? getProductByIdAdmin(productId) : null;
    const campaign = await generateAdsAndBanner({
      storeName: settings.storeName,
      product,
      campaignGoal
    });
    res.json({ campaign });
  } catch (error) {
    console.error("Ads generator error:", error);
    res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u062A\u0648\u0644\u064A\u062F \u0627\u0644\u062D\u0645\u0644\u0629 \u0627\u0644\u0625\u0639\u0644\u0627\u0646\u064A\u0629 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A." });
  }
});
app.post("/api/admin/banners", requireAdmin, (req, res) => {
  const body = req.body;
  const banner = createBanner({
    id: `banner-${crypto3.randomUUID().slice(0, 8)}`,
    title: body.title || "\u0639\u0631\u0636 \u0645\u0644\u0643\u064A \u062E\u0627\u0635",
    subtitle: body.subtitle || "",
    ctaText: body.ctaText || "\u062A\u0633\u0648\u0642 \u0627\u0644\u0622\u0646",
    discountLabel: body.discountLabel,
    accentColor: body.accentColor || "#D4AF37",
    isActive: body.isActive !== false,
    googleAdsHeadlines: body.googleAdsHeadlines,
    googleAdsDescriptions: body.googleAdsDescriptions,
    googleAdsKeywords: body.googleAdsKeywords,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  res.status(201).json({ banner });
});
app.put("/api/admin/banners/:id", requireAdmin, (req, res) => {
  const updated = updateBanner(String(req.params.id), req.body);
  if (!updated) {
    res.status(404).json({ error: "\u0627\u0644\u0628\u0646\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  res.json({ banner: updated });
});
app.delete("/api/admin/banners/:id", requireAdmin, (req, res) => {
  const ok = deleteBanner(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "\u0627\u0644\u0628\u0646\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  res.json({ success: true });
});
app.put("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const { status, shippingCompany, trackingNumber, shippingNotice } = req.body;
  const updated = updateOrderStatus(String(req.params.id), {
    status,
    shippingCompany,
    trackingNumber,
    shippingNotice
  });
  if (!updated) {
    res.status(404).json({ error: "\u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  res.json({ order: updated });
});
app.put("/api/admin/customers/:id/coins", requireAdmin, (req, res) => {
  const { goldenCoins } = req.body;
  if (goldenCoins === void 0 || Number.isNaN(Number(goldenCoins))) {
    res.status(400).json({ error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0631\u0635\u064A\u062F \u0639\u0645\u0644\u0627\u062A \u0635\u062D\u064A\u062D." });
    return;
  }
  const updated = adjustCustomerCoinsAdmin(String(req.params.id), Number(goldenCoins));
  if (!updated) {
    res.status(404).json({ error: "\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
    return;
  }
  res.json({ customer: updated });
});
app.get("/api/seo/schema", (_req, res) => {
  const settings = getPublicSettings();
  const products = getPublishedProducts().map((p) => stripPrivateProductFields(p));
  res.json({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: settings.storeName,
    itemListElement: products.map((p, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: p.schemaMarkup || {
        "@type": "Product",
        name: p.name,
        description: p.seoDescription || p.description,
        image: p.images,
        offers: {
          "@type": "Offer",
          priceCurrency: "SAR",
          price: p.priceSar
        }
      }
    }))
  });
});
setInterval(() => {
  const settings = getAdminSettings();
  if (settings.seoAutoUpdateEnabled && process.env.GEMINI_API_KEY) {
    refreshPublishedProductsSeo().catch(
      (err) => console.error("Periodic SEO refresh error:", err)
    );
  }
}, 1e3 * 60 * 60 * 6);
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Royal Store server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();
