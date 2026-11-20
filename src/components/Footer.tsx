import { Mail, MessageCircle, Pencil, Phone } from 'lucide-react';
import { PwaInstallSection } from './PwaInstallSection';
import type { PublicSettings } from '../types';

import type { StoreLanguage } from '../i18n';

interface FooterProps {
  settings: PublicSettings;
  lang?: StoreLanguage;
  onOpenAdmin: () => void;
  editMode?: boolean;
  onEditSection?: (section: 'about') => void;
}

function toWaInternational(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.startsWith('05') && digits.length === 10) return `966${digits.slice(1)}`;
  return digits;
}

function toDisplayLocalPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.startsWith('9665') && digits.length === 12) return `0${digits.slice(3)}`;
  return digits;
}

export function Footer({
  settings,
  lang = 'ar',
  onOpenAdmin,
  editMode = false,
  onEditSection,
}: FooterProps) {
  const cleanPhone = toWaInternational(settings.whatsappNumber);
  const displayPhone = toDisplayLocalPhone(settings.whatsappNumber);

  return (
    <footer id="about" className="border-t border-[#D4AF37]/20 bg-[#0B0B0E] text-[#C5BFB2]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* About Us (Editable from Admin) */}
        <div
          onClick={() => {
            if (editMode && onEditSection) onEditSection('about');
          }}
          className={`md:col-span-6 space-y-3 ${
            editMode
              ? 'p-4 -m-4 rounded-2xl border border-dashed border-[#D4AF37]/60 hover:bg-[#14120E]/50 cursor-pointer'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="font-display text-xl font-bold text-[#F5F2EB]">
              {lang === 'en' ? `About Us · ${settings.storeName}` : `من نحن · ${settings.storeName}`}
            </div>
            {editMode && onEditSection && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditSection('about');
                }}
                className="h-8 px-3 rounded-lg bg-[#D4AF37] text-[#000000] text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Pencil className="w-3 h-3" />
                <span>تحرير من نحن والتواصل</span>
              </button>
            )}
          </div>
          <p className="text-sm leading-relaxed text-[#9E988C] max-w-2xl">
            {settings.aboutUsText}
          </p>
        </div>

        {/* Contact Us (WhatsApp & Email) + Social Media */}
        <div className="md:col-span-6 space-y-4 md:text-end">
          <div className="text-sm font-bold text-[#E5C158]">
            {lang === 'en' ? 'Contact & Follow Us' : 'اتصل بنا وتابعنا'}
          </div>

          <div className="flex flex-wrap md:justify-end gap-3 text-xs">
            {displayPhone && (
              <a
                href={`tel:${displayPhone}`}
                dir="ltr"
                className="h-10 px-4 rounded-xl border border-white/15 bg-[#141418] hover:border-[#D4AF37]/50 text-[#F5F2EB] flex items-center gap-2 transition-colors tabular-nums"
              >
                <Phone className="w-4 h-4 text-[#E5C158]" />
                <span>{displayPhone}</span>
              </a>
            )}

            {settings.contactEmail && (
              <a
                href={`mailto:${settings.contactEmail}`}
                dir="ltr"
                className="h-10 px-4 rounded-xl border border-white/15 bg-[#141418] hover:border-[#D4AF37]/50 text-[#F5F2EB] flex items-center gap-2 transition-colors"
              >
                <Mail className="w-4 h-4 text-[#E5C158]" />
                <span>{settings.contactEmail}</span>
              </a>
            )}
          </div>

          <div className="flex flex-wrap md:justify-end items-center gap-3">
            {settings.instagramUrl && (
              <a
                href={settings.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="إنستقرام"
                className="h-10 px-4 rounded-xl border border-white/15 bg-[#141418] hover:border-[#D4AF37]/50 text-xs font-medium text-[#F5F2EB] flex items-center gap-2 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#E5C158]" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                </svg>
                <span>إنستقرام</span>
              </a>
            )}

            {settings.tiktokUrl && (
              <a
                href={settings.tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="تيك توك"
                className="h-10 px-4 rounded-xl border border-white/15 bg-[#141418] hover:border-[#D4AF37]/50 text-xs font-medium text-[#F5F2EB] flex items-center gap-2 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#E5C158]" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.81a8.23 8.23 0 0 0 4.76 1.5V6.86c-.34 0-.68-.06-1-.17z" />
                </svg>
                <span>تيك توك</span>
              </a>
            )}

            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/40 text-xs font-bold text-emerald-300 flex items-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>واتساب مباشر ({displayPhone})</span>
            </a>
          </div>
        </div>
      </div>

      <PwaInstallSection />

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-24 md:pb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#847E73]">
          <span>
            © {new Date().getFullYear()} {settings.storeName}. جميع الحقوق محفوظة.
          </span>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="hover:text-[#E5C158] transition-colors cursor-pointer"
          >
            بوابة إدارة المالك
          </button>
        </div>
      </div>
    </footer>
  );
}
