import React from 'react';
import ReactDOM from 'react-dom/client';
import { Dashboard } from './components/dashboard/Dashboard';
import '@xterm/xterm/css/xterm.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
);
