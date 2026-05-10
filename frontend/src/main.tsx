import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import App from "./App"
import "./index.css"
import { applyTheme, getStoredTheme } from "./lib/theme"

applyTheme(getStoredTheme())

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => undefined)
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
