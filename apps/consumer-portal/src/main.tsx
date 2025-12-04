import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { TenantConfigProvider } from './context/TenantConfigContext';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TenantConfigProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TenantConfigProvider>
  </React.StrictMode>,
);
