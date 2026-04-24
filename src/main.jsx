import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Self-hosted variable fonts (one WOFF2 file per family covers all weights).
// Replaces seven render-blocking jsdelivr stylesheets with same-origin fonts.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
