import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const params = new URLSearchParams(window.location.search);

if (params.has('spectator')) {
  // Lazy-load spectator to avoid bundling it in main app
  import('./CombatSpectator.jsx').then(({ default: CombatSpectator }) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <CombatSpectator />
      </StrictMode>,
    );
  });
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
