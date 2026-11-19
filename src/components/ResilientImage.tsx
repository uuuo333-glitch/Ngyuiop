import { useEffect, useState, type CSSProperties } from 'react';
import { ShieldCheck } from 'lucide-react';

interface ResilientImageProps {
  src?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  fallbackLabel?: string;
}

export function ResilientImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
  style,
  fallbackLabel,
}: ResilientImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
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

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
      style={style}
    />
  );
}
