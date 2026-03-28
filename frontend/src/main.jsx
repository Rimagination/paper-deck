import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ScanSciAuthProvider } from "./auth";
import { LanguageProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <ScanSciAuthProvider>
          <App />
        </ScanSciAuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);
