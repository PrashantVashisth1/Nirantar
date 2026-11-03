import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted fonts (no third-party font requests). Each file uses
// unicode-range, so the browser only downloads Bengali or Devanagari glyphs
// when that text is actually on screen.
import '@fontsource-variable/noto-sans';
import '@fontsource-variable/noto-sans-devanagari';
import '@fontsource-variable/noto-sans-bengali';
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/noto-serif-devanagari';
import '@fontsource-variable/noto-serif-bengali';
import '@fontsource-variable/noto-sans-mono';
import './styles/globals.css';
import './i18n';

import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
