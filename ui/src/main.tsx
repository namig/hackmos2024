import './installSesLockdown.ts';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import ZeroMiles from "./components/ZeroMiles.tsx";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ZeroMiles />
  </React.StrictMode>,
);
