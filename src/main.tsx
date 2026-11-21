import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { FirebaseErrorBoundary } from './components/FirebaseErrorBoundary.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // ignore service worker registration errors inside restricted preview contexts
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <FirebaseErrorBoundary>
    <App />
  </FirebaseErrorBoundary>
);
