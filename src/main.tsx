import React from 'react';
import ReactDOM from 'react-dom/client';
import './ui/styles/tokens.css';
import './ui/styles/hud.css';
import { App } from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
