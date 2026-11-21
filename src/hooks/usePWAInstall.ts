import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const BANNER_DISMISS_KEY = 'taj_pwa_banner_dismissed';

function readBannerDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(BANNER_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function saveBannerDismissed(): void {
  try {
    window.sessionStorage.setItem(BANNER_DISMISS_KEY, '1');
  } catch {
    // ignore storage errors in restricted iframes
  }
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as unknown as { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  );
}

function detectPlatform() {
  if (typeof window === 'undefined') {
    return { isIOS: false, isAndroid: false };
  }
  const ua = window.navigator.userAgent.toLowerCase();
  const isIPadOS =
    window.navigator.platform === 'MacIntel' && (window.navigator.maxTouchPoints || 0) > 1;
  const isIOS = /iphone|ipad|ipod/.test(ua) || isIPadOS;
  const isAndroid = /android/.test(ua);
  return { isIOS, isAndroid };
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandalone());
  const [platform, setPlatform] = useState<{ isIOS: boolean; isAndroid: boolean }>(() =>
    detectPlatform()
  );
  const [modalMode, setModalMode] = useState<'none' | 'ios' | 'android-guide'>('none');
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => readBannerDismissed());

  useEffect(() => {
    setIsInstalled(detectStandalone());
    setPlatform(detectPlatform());

    const mq = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayChange = () => {
      setIsInstalled(detectStandalone());
    };
    mq?.addEventListener?.('change', handleDisplayChange);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setModalMode('none');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mq?.removeEventListener?.('change', handleDisplayChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (isInstalled) return;

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          return;
        }
      } catch {
        // Fallback to platform instructions modal below if native prompt fails
      }
    }

    if (platform.isIOS) {
      setModalMode('ios');
    } else {
      setModalMode('android-guide');
    }
  }, [deferredPrompt, isInstalled, platform.isIOS]);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    saveBannerDismissed();
  }, []);

  const closeModal = useCallback(() => {
    setModalMode('none');
  }, []);

  return {
    isInstalled,
    isIOS: platform.isIOS,
    isAndroid: platform.isAndroid,
    canPromptNatively: Boolean(deferredPrompt),
    modalMode,
    bannerDismissed,
    triggerInstall,
    dismissBanner,
    closeModal,
  };
}
