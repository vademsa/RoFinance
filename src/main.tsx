import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isAdminPagePath } from '../shared/admin';

const AdminPage = lazy(() => import('./components/admin/AdminPage'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminPagePath(window.location.pathname)
      ? <Suspense fallback={<p role="status">RoFinance Admin…</p>}><AdminPage /></Suspense>
      : <App />}
  </StrictMode>,
);
