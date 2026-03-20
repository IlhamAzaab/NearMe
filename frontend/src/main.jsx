import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from "@tanstack/react-query";
import './index.css'
import "leaflet/dist/leaflet.css";
import App from './App.jsx'
import { appQueryClient } from "./lib/queryClient";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={appQueryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
