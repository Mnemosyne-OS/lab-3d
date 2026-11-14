import React from 'react';
import ReactDOM from 'react-dom/client';
import { onHostConfig } from '@mnemosyne_os/cartridge-sdk';
import './ui/styles/tokens.css';
import './ui/styles/hud.css';
import './ui/styles/day.css';
import { App } from './app/App';

// Inside a Mnemosyne OS window, before the first paint: the window paints the
// ground and the page stays transparent (`html.in-host` in the CSS).
if (window.parent !== window) document.documentElement.classList.add('in-host');

// Wear the app's theme (skill style-cartouche §0): the host's base lands as
// `data-theme` and its computed variables as inline properties on <html>, at
// load and on every change. Outside the OS the fallbacks in the CSS apply.
onHostConfig();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
