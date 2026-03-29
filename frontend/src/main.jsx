import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/poppins/300.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/material-symbols-outlined";
import "./index.css";
import "leaflet/dist/leaflet.css";
import App from "./App.jsx";
import { appQueryClient } from "./lib/queryClient";
import { initializeApiAuthInterceptor } from "./lib/apiClient";

initializeApiAuthInterceptor();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={appQueryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
