import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { watchForUpdates } from './lib/swUpdate'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Outside React: this is about the document, not the tree, and it must survive
// every route change. See the module — without it an installed PWA keeps
// serving whichever build it was opened on, however long ago that was.
watchForUpdates()
