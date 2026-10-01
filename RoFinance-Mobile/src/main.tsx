import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeMobileStorage } from './lib/deviceInit';

initializeMobileStorage()
  .then(() => createRoot(document.getElementById('root')!).render(
    <StrictMode><App /></StrictMode>,
  ))
  .catch(() => {
    const root = document.getElementById('root');
    if (root) root.textContent = 'Không thể khởi tạo lưu trữ bảo mật. Vui lòng mở lại ứng dụng.';
  });
