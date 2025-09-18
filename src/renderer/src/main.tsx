// @ts-ignore
console.createTask = null
import './assets/main.css'

import { createRoot } from 'react-dom/client'
import App from './components/app'

createRoot(document.getElementById('root')!).render(
  // disabled for now to make useUnmountSignal work
  // <StrictMode>
  <App />
  //  </StrictMode>
)
