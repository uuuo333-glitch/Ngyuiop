import { useEffect, useState, type CSSProperties } from 'react';
import { ShieldCheck } from 'lucide-react';

export const DEFAULT_PRODUCT_IMAGE = '/src/assets/images/product_gasoline_cat_1794821493329.jpg';

interface ResilientImageProps {
  src?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  fallbackLabel?: string;
  defaultFallbackSrc?: string;
}

export function ResilientImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
  style,
  fallbackLabel,
  defaultFallbackSrc,
}: ResilientImageProps) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [secondaryFailed, setSecondaryFailed] = useState(false);

  useEffect(() => {
    setPrimaryFailed(false);
    setSecondaryFailed(false);
  }, [src, defaultFallbackSrc]);

  const cleanSrc = typeof src === 'string' ? src.trim() : '';
  const activeSrc =
    cleanSrc && !primaryFailed
      ? cleanSrc
      : defaultFallbackSrc && !secondaryFailed
        ? defaultFallbackSrc
        : '';

  if (!activeSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#16161B] via-[#0E0E12] to-[#1D1910] border border-[#D4AF37]/20 text-center p-4 ${className}`}
        style={style}
        role="img"
        aria-label={alt}
      >
        <ShieldCheck className="w-8 h-8 text-[#D4AF37]/70 mb-2" />
        <span className="text-xs text-[#D4AF37]/80 font-medium line-clamp-2 max-w-[18ch]">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  const isShowingFallback = !cleanSrc || primaryFailed;

  return (
    <img
      src={activeSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => {
        if (!isShowingFallback) {
          setPrimaryFailed(true);
        } else {
          setSecondaryFailed(true);
        }
      }}
      className={className}
      style={style}
    />
  );
}
