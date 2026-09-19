import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n/index.ts';
import './styles.css';
import { App } from './App.tsx';
import { initNative } from './lib/native-init.ts';

void initNative();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
