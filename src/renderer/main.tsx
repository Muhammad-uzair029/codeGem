import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppShell } from './components/layout/AppShell';
import '@xterm/xterm/css/xterm.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>,
);
