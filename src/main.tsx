import { leaving } from "./lib/handoff"; // first: settles browser storage before the backend client reads it
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

if (!leaving) createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
