import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import App from './App';

// Theo chế độ sáng/tối của hệ điều hành (Bootstrap 5.3 color modes).
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () =>
  document.documentElement.setAttribute('data-bs-theme', dark.matches ? 'dark' : 'light');
applyTheme();
dark.addEventListener('change', applyTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
