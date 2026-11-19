import { useState } from 'react';
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react';

interface ShareButtonProps {
  title: string;
  text?: string;
  productId?: string;
  compact?: boolean;
  className?: string;
}

export function ShareButton({
  title,
  text,
  productId,
  compact = false,
  className = '',
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== 'undefined'
      ? productId
        ? `${window.location.origin}${window.location.pathname}?product=${encodeURIComponent(productId)}`
        : `${window.location.origin}${window.location.pathname}`
      : '';

  const shareMessage = text ? `${title} - ${text}` : title;
  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(`${shareMessage}\n${shareUrl}`)}`;
  const xShareHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}&url=${encodeURIComponent(shareUrl)}`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleTrigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title,
          text: shareMessage,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to inline share popover if user cancels or platform restricts Web Share
      }
    }
    setOpen((prev) => !prev);
  };

  return (
    <div className={`relative inline-block ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleTrigger}
        aria-label={`مشاركة ${title}`}
        className={
          compact
            ? 'inline-flex items-center justify-center w-9 h-9 rounded-lg border border-white/15 bg-[#16161B]/90 text-[#E5C158] hover:border-[#D4AF37]/60 hover:bg-[#1E1C14] transition-colors cursor-pointer'
            : 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-[#16161B] text-[#F5F2EB] hover:border-[#D4AF37]/60 hover:text-[#E5C158] text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer'
        }
      >
        <Share2 className="w-4 h-4 shrink-0" />
        {!compact && <span>مشاركة</span>}
      </button>

      {open && (
        <div
          className="absolute end-0 bottom-full mb-2 z-40 w-56 rounded-xl border border-[#D4AF37]/30 bg-[#121216] shadow-2xl p-2 text-start"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1.5 text-xs text-[#9E988C] border-b border-white/10 mb-1">
            مشاركة المنتج
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-[#F5F2EB] hover:bg-white/5 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-[#D4AF37]" />
              )}
              {copied ? 'تم نسخ الرابط!' : 'نسخ رابط المنتج'}
            </span>
          </button>
          <a
            href={whatsappShareHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-[#F5F2EB] hover:bg-white/5 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>مشاركة عبر واتساب</span>
          </a>
          <a
            href={xShareHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-[#F5F2EB] hover:bg-white/5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>مشاركة عبر منصة X</span>
          </a>
        </div>
      )}
    </div>
  );
}
