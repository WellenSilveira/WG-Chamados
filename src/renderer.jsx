import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AppTitleBar from './components/AppTitleBar.jsx';

const root = createRoot(document.getElementById('root'));
root.render(
  <>
    <AppTitleBar />
    <div id="app-content">
      <App />
    </div>
  </>,
);
