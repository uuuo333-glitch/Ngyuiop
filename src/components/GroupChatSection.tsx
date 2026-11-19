import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BadgeCheck,
  Car,
  CheckCheck,
  Crown,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import type { GroupChatMessage, PublicSettings } from '../types';

export const DEFAULT_GROUP_CHAT_TITLE =
  'تجارب ومشاكل ملاك السيارات مع دبة التلوث.. وحلول أهل الخبرة';

export const DEFAULT_GROUP_CHAT_MESSAGES: GroupChatMessage[] = [
  {
    id: 'gc-1',
    senderName: 'خالد (صاحب هوندا)',
    roleTag: 'مالك سيارة',
    accent: 'owner_car',
    message:
      'يا شباب عندي هوندا أكورد وظهرت لمبة المكينة (كود P0420) والسيارة صارت تصرف بنزين بزيادة، وش الحل؟',
  },
  {
    id: 'gc-2',
    senderName: 'سعد (صاحب مازدا)',
    roleTag: 'مالك سيارة',
    accent: 'owner_car',
    message:
      'نفس مشكلتك صارت معي في المازدا! رحت لورشة وقالوا فرّغ الدبة، وبعد ما فرغتها طلع صوت مزعج وريحة كربون ورسبت في الفحص الدوري.',
  },
  {
    id: 'gc-3',
    senderName: 'تركي (صاحب لكزس)',
    roleTag: 'مالك سيارة',
    accent: 'owner_car',
    message:
      'انتبهوا من التفريغ يا إخوان، أنا معي لكزس 430 ولما فرغتها ارتفعت حرارة الشكمان وضعف عزم الموتر.',
  },
  {
    id: 'gc-4',
    senderName: 'فيصل (صاحب بي إم دبليو)',
    roleTag: 'مالك سيارة',
    accent: 'owner_car',
    message:
      'فعلاً، خصوصاً في البي إم دبليو والسيارات الحديثة، حساسات الشكمان دقيقة وأي تفريغ يلخبط كمبيوتر السيارة.',
  },
  {
    id: 'gc-5',
    senderName: 'المهندس أحمد',
    roleTag: 'مهندس فحص وتشخيص',
    accent: 'engineer',
    message:
      'حياكم الله جميعاً. كلامكم سليم 100%، تفريغ الدبة يرفع ضغط الحرارة ويضر الحساسات والقير مع الوقت، والحل الصحيح هو استبدالها بدبة مطابقة للمواصفات.',
  },
  {
    id: 'gc-6',
    senderName: 'المعلم فهد',
    roleTag: 'خبير تركيب الدبات',
    accent: 'master',
    message:
      'ومن واقع خبرتنا في التركيب، دباتنا مصممة بقلب سيراميك ومعدن عالي الجودة يطفي لمبة المكينة ويرجع عزم الموتر الطبيعي من أول تشغيل.',
  },
  {
    id: 'gc-7',
    senderName: 'المدير يوسف',
    roleTag: 'إدارة المصنع',
    accent: 'manager',
    message:
      'أبشروا بالخير جميعاً، نوفر لكم دبات تلوث (هوندا، مازدا، لكزس، بي إم دبليو، وجميع السيارات) بمواصفات ألمانية وضمان رسمي وبسعر المصنع المباشر.',
  },
];

interface GroupChatSectionProps {
  settings: PublicSettings;
}

export function GroupChatSection({ settings }: GroupChatSectionProps) {
  const messages =
    Array.isArray(settings.groupChatMessages) && settings.groupChatMessages.length > 0
      ? settings.groupChatMessages
      : DEFAULT_GROUP_CHAT_MESSAGES;
  const title = (settings.groupChatTitle || DEFAULT_GROUP_CHAT_TITLE).trim();

  const [visibleCount, setVisibleCount] = useState<number>(1);
  const [typingNext, setTypingNext] = useState<boolean>(messages.length > 1);
  const [inView, setInView] = useState<boolean>(false);
  const [replaySeed, setReplaySeed] = useState<number>(0);

  const sectionRef = useRef<HTMLElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setVisibleCount(1);
    setTypingNext(messages.length > 1);
  }, [messages.length, replaySeed]);

  useEffect(() => {
    if (!inView) return;
    if (visibleCount >= messages.length) {
      setTypingNext(false);
      return;
    }

    setTypingNext(true);
    const delayMs = visibleCount === 1 ? 1100 : 1550;
    const timer = window.setTimeout(() => {
      setVisibleCount((prev) => Math.min(messages.length, prev + 1));
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [inView, visibleCount, messages.length, replaySeed]);

  useEffect(() => {
    const box = feedRef.current;
    if (!box) return;
    box.scrollTo({
      top: box.scrollHeight,
      behavior: 'smooth',
    });
  }, [visibleCount, typingNext]);

  if (settings.groupChatEnabled === false || messages.length === 0) {
    return null;
  }

  const displayedMessages = messages.slice(0, visibleCount);
  const nextMessage = visibleCount < messages.length ? messages[visibleCount] : null;
  const cleanWa = String(settings.whatsappNumber || '').replace(/[^0-9]/g, '') || '966504597852';

  const handleReplay = () => {
    setVisibleCount(1);
    setTypingNext(messages.length > 1);
    setReplaySeed((s) => s + 1);
    setInView(true);
  };

  const handleShowAll = () => {
    setTypingNext(false);
    setVisibleCount(messages.length);
  };

  const getSpeakerStyle = (accent?: GroupChatMessage['accent']) => {
    switch (accent) {
      case 'manager':
        return {
          isExpert: true,
          bubble:
            'bg-gradient-to-br from-[#2B220B] via-[#1C1709] to-[#141418] border-[#D4AF37]/60 text-[#FAF5E4] shadow-[0_10px_30px_rgba(212,175,55,0.12)]',
          avatar: 'bg-gradient-to-br from-[#D4AF37] to-[#9E7B1E] text-black border-[#F3D87D]',
          nameColor: 'text-[#F3D87D]',
          tagBg: 'bg-[#D4AF37]/20 text-[#F3D87D] border-[#D4AF37]/40',
          icon: Crown,
        };
      case 'engineer':
        return {
          isExpert: true,
          bubble:
            'bg-gradient-to-br from-[#0F241B] to-[#12161A] border-emerald-400/40 text-[#EBF9F2] shadow-[0_8px_24px_rgba(16,185,129,0.08)]',
          avatar: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50',
          nameColor: 'text-emerald-300',
          tagBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35',
          icon: Wrench,
        };
      case 'master':
        return {
          isExpert: true,
          bubble:
            'bg-gradient-to-br from-[#23190D] to-[#131418] border-amber-400/40 text-[#FFF7E6] shadow-[0_8px_24px_rgba(245,158,11,0.08)]',
          avatar: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
          nameColor: 'text-amber-300',
          tagBg: 'bg-amber-500/15 text-amber-300 border-amber-400/35',
          icon: ShieldCheck,
        };
      case 'owner_car':
      default:
        return {
          isExpert: false,
          bubble: 'bg-[#17181E] border-white/12 text-[#ECEAE4]',
          avatar: 'bg-sky-500/15 text-sky-300 border-sky-400/35',
          nameColor: 'text-sky-300',
          tagBg: 'bg-white/5 text-[#B8B2A6] border-white/10',
          icon: Car,
        };
    }
  };

  return (
    <section
      ref={sectionRef}
      id="owners-group-chat"
      className="py-12 px-4 sm:px-6 max-w-6xl mx-auto"
      dir="rtl"
    >
      <div className="rounded-3xl border border-[#D4AF37]/30 bg-gradient-to-b from-[#131318] via-[#0E0E12] to-[#0A0A0D] shadow-[0_20px_60px_rgba(0,0,0,0.55)] overflow-hidden">
        {/* Section & Chat Group Header */}
        <div className="px-5 py-5 sm:px-7 border-b border-white/10 bg-[#15151B]/90 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/12 border border-[#D4AF37]/35 text-[11px] font-bold text-[#E5C158]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span>محادثة جماعية حية · تجارب ملاك السيارات والخبراء</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[#F5F2EA] leading-snug">
              {title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-[#C5BFB2]">
              <Users className="w-3.5 h-3.5 text-[#E5C158]" />
              <span>{messages.length} مشاركين في النقاش</span>
            </span>

            <button
              type="button"
              onClick={handleReplay}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-xs font-bold text-[#E5C158] transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة عرض الحوار</span>
            </button>

            {visibleCount < messages.length && (
              <button
                type="button"
                onClick={handleShowAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#F5F2EA] transition"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>عرض الكل</span>
              </button>
            )}
          </div>
        </div>

        {/* Animated Chat Feed */}
        <div
          ref={feedRef}
          className="p-4 sm:p-6 space-y-4 max-h-[520px] overflow-y-auto scroll-smooth bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.06),transparent_45%)]"
        >
          <AnimatePresence initial={false}>
            {displayedMessages.map((item, idx) => {
              const style = getSpeakerStyle(item.accent);
              const SpeakerIcon = style.icon;
              const initial = item.senderName.trim().charAt(0) || 'ع';

              return (
                <motion.div
                  key={`${item.id}-${replaySeed}`}
                  initial={{ opacity: 0, y: 14, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`flex items-start gap-3 ${
                    style.isExpert ? 'sm:flex-row-reverse sm:text-right' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl border flex items-center justify-center shrink-0 font-black text-sm relative ${style.avatar}`}
                    title={item.senderName}
                  >
                    <span>{initial}</span>
                    <span className="absolute -bottom-1 -left-1 w-5 h-5 rounded-lg bg-[#0D0D10] border border-white/15 flex items-center justify-center">
                      <SpeakerIcon className="w-3 h-3 text-[#E5C158]" />
                    </span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-2xl flex-1 sm:flex-initial rounded-2xl border px-4 py-3 space-y-1.5 ${style.bubble}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs sm:text-sm font-black ${style.nameColor}`}>
                          {item.senderName}
                        </span>
                        {style.isExpert && (
                          <BadgeCheck className="w-4 h-4 text-[#E5C158] shrink-0" />
                        )}
                        {item.roleTag && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.tagBg}`}
                          >
                            {item.roleTag}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#9E988C] flex items-center gap-1">
                        <span>#{idx + 1}</span>
                        <CheckCheck className="w-3 h-3 text-sky-400" />
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm leading-relaxed text-current/95">
                      {item.message}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Animated Typing Indicator */}
          {typingNext && nextMessage && (
            <motion.div
              key={`typing-${visibleCount}-${replaySeed}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/[0.04] border border-white/10 w-fit"
            >
              <MessageCircle className="w-4 h-4 text-[#E5C158] shrink-0" />
              <span className="text-xs font-bold text-[#D9D3C7]">
                {nextMessage.senderName} يكتب الآن
              </span>
              <span className="inline-flex items-center gap-1 pr-1" aria-hidden="true">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E5C158] animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#E5C158] animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#E5C158] animate-bounce [animation-delay:300ms]" />
              </span>
            </motion.div>
          )}
        </div>

        {/* Footer CTA Bar */}
        <div className="px-5 py-4 sm:px-7 border-t border-white/10 bg-[#121217] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-[#B8B2A6]">
            عندك كود P0420 أو مشكلة في دبة التلوث والفحص الدوري؟ اختر الدبة المطابقة لسيارتك أو تواصل مع مهندسينا مباشرة.
          </p>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="#products"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B8941F] text-black text-xs font-black hover:brightness-110 transition"
            >
              تصفح دبات التلوث الآن
            </a>
            <a
              href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(
                'السلام عليكم، أحتاج استشارة فنية لاختيار دبة تلوث مطابقة لسيارتي.'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold transition inline-flex items-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>استشارة فورية عبر واتساب</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
