import { createRoot } from 'react-dom/client';
import './pwa';
import App from './App.tsx';
import { FirebaseErrorBoundary } from './components/FirebaseErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <FirebaseErrorBoundary>
    <App />
  </FirebaseErrorBoundary>
);
