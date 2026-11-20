interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type PwaStateListener = () => void;

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<PwaStateListener>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredInstallPrompt = null;
    notifyListeners();
  });

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
}

export function getPwaState() {
  return {
    canPromptInstall: deferredInstallPrompt !== null,
    installed,
  };
}

export function subscribeToPwaState(listener: PwaStateListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function promptToInstallPwa(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredInstallPrompt) return 'unavailable';

  const prompt = deferredInstallPrompt;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  deferredInstallPrompt = null;
  if (outcome === 'accepted') installed = true;
  notifyListeners();
  return outcome;
}
