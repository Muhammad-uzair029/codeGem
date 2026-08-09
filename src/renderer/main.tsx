import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { AppShell } from './components/layout/AppShell';
import '@xterm/xterm/css/xterm.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppShell />
    <Toaster
      position="bottom-right"
      richColors
      theme="dark"
      toastOptions={{ style: { fontFamily: 'inherit', fontSize: '12px' } }}
    />
  </React.StrictMode>,
);
