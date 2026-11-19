import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Crop, Maximize2, Move, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

interface SquareImageCropModalProps {
  files: File[];
  onCancel: () => void;
  onComplete: (croppedFiles: { dataUrl: string; fileName: string }[]) => void;
}

const TARGET_SIZE = 1000;
const PREVIEW_BOX = 320;

export function SquareImageCropModal({
  files,
  onCancel,
  onComplete,
}: SquareImageCropModalProps) {
  const [index, setIndex] = useState(0);
  const [imageSrc, setImageSrc] = useState('');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('cover');
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<{ dataUrl: string; fileName: string }[]>([]);

  const dragStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const currentFile = files[index];

  useEffect(() => {
    if (!currentFile) return;
    let active = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (!active) return;
      setImageSrc(String(reader.result || ''));
      setNaturalSize(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setFitMode('cover');
    };
    reader.readAsDataURL(currentFile);
    return () => {
      active = false;
    };
  }, [currentFile]);

  const computeBaseScale = useCallback(
    (w: number, h: number, mode: 'cover' | 'contain') => {
      if (!w || !h) return 1;
      return mode === 'cover'
        ? Math.max(TARGET_SIZE / w, TARGET_SIZE / h)
        : Math.min(TARGET_SIZE / w, TARGET_SIZE / h);
    },
    []
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: dragStartRef.current.origX + dx,
      y: dragStartRef.current.origY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
    dragStartRef.current = null;
  };

  const renderCroppedSquareDataUrl = (): string | null => {
    const img = imgRef.current;
    if (!img || !naturalSize) return null;

    const canvas = document.createElement('canvas');
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Clean obsidian dark studio background so padded or PNG images match store aesthetics
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);

    const baseScale = computeBaseScale(naturalSize.w, naturalSize.h, fitMode);
    const totalScale = baseScale * zoom;
    const drawW = naturalSize.w * totalScale;
    const drawH = naturalSize.h * totalScale;
    const previewToTargetRatio = TARGET_SIZE / PREVIEW_BOX;

    const centerX = TARGET_SIZE / 2 + offset.x * previewToTargetRatio;
    const centerY = TARGET_SIZE / 2 + offset.y * previewToTargetRatio;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);

    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const handleConfirmCurrent = () => {
    if (!currentFile || !naturalSize) return;
    setSaving(true);
    try {
      const dataUrl = renderCroppedSquareDataUrl();
      if (!dataUrl) return;
      const baseName = currentFile.name.replace(/\.[^/.]+$/, '') || `product-${index + 1}`;
      const nextItem = {
        dataUrl,
        fileName: `${baseName}-1000x1000.jpg`,
      };
      const updatedResults = [...results, nextItem];

      if (index + 1 < files.length) {
        setResults(updatedResults);
        setIndex(index + 1);
      } else {
        onComplete(updatedResults);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!currentFile) return null;

  const previewScale = naturalSize
    ? computeBaseScale(naturalSize.w, naturalSize.h, fitMode) * (PREVIEW_BOX / TARGET_SIZE) * zoom
    : 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[#D4AF37]/45 bg-[#121216] p-5 sm:p-6 text-[#F5F2EB] shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[#E5C158]">
            <Crop className="w-5 h-5" />
            <div>
              <h3 className="font-display text-base sm:text-lg font-bold">
                قص وضبط مقاس الصورة تلقائياً (1000 × 1000 بكسل)
              </h3>
              <p className="text-[11px] text-[#9E988C]">
                صورة {index + 1} من {files.length} · اسحب الصورة للضبط داخل الإطار المربع
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="إلغاء القص"
            className="w-8 h-8 rounded-lg border border-white/15 bg-[#16161B] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative overflow-hidden rounded-2xl border-2 border-[#D4AF37] bg-[#09090B] select-none touch-none cursor-grab active:cursor-grabbing shadow-inner"
            style={{ width: PREVIEW_BOX, height: PREVIEW_BOX }}
          >
            {imageSrc && (
              <img
                ref={imgRef}
                src={imageSrc}
                alt="معاينة القص"
                draggable={false}
                onLoad={(e) => {
                  const target = e.currentTarget;
                  setNaturalSize({
                    w: target.naturalWidth || TARGET_SIZE,
                    h: target.naturalHeight || TARGET_SIZE,
                  });
                }}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  maxWidth: 'none',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${previewScale})`,
                  transformOrigin: 'center center',
                }}
              />
            )}

            {/* Rule of thirds guide overlay */}
            <div className="pointer-events-none absolute inset-0 border border-white/10">
              <div className="absolute inset-x-0 top-1/3 border-t border-white/15" />
              <div className="absolute inset-x-0 top-2/3 border-t border-white/15" />
              <div className="absolute inset-y-0 start-1/3 border-s border-white/15" />
              <div className="absolute inset-y-0 start-2/3 border-s border-white/15" />
            </div>

            <div className="pointer-events-none absolute bottom-2 start-2 px-2 py-0.5 rounded-md bg-black/75 border border-[#D4AF37]/40 text-[10px] font-bold text-[#E5C158] flex items-center gap-1">
              <Move className="w-3 h-3" />
              <span>1000 × 1000 px</span>
            </div>
          </div>

          <div className="w-full max-w-[320px] space-y-2.5">
            <div className="flex items-center gap-2.5">
              <ZoomOut className="w-4 h-4 text-[#9E988C] shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-[#D4AF37]"
              />
              <ZoomIn className="w-4 h-4 text-[#E5C158] shrink-0" />
              <span className="text-xs text-[#C5BFB2] tabular-nums w-11 text-end">
                {zoom.toFixed(1)}×
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => setFitMode((m) => (m === 'cover' ? 'contain' : 'cover'))}
                className="px-3 py-1.5 rounded-lg border border-white/15 bg-[#16161B] hover:border-[#D4AF37]/50 text-[#E5C158] flex items-center gap-1.5 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>
                  {fitMode === 'cover' ? 'احتواء كامل داخل المربع' : 'ملء الإطار المربع'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
                className="px-3 py-1.5 rounded-lg border border-white/15 bg-[#16161B] hover:text-white text-[#C5BFB2] flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>توسيط</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-xl border border-white/15 text-xs text-[#C5BFB2] cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={saving || !naturalSize}
            onClick={handleConfirmCurrent}
            className="btn-gold-wave h-10 px-5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>
              {index + 1 < files.length
                ? 'اعتماد 1000×1000 والانتقال للتالية'
                : 'اعتماد ورفع بمقاس 1000×1000'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
