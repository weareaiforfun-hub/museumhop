import "./lib/handoff"; // first: settles browser storage before the backend client reads it
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ViewNight } from "./components/view-night";
import "./styles.css";

// A view-only link (#view=<token>) gets its own small read-only page instead of the planner.
const view = new URLSearchParams(location.hash.slice(1)).get("view");
createRoot(document.getElementById("root")!).render(<StrictMode>{view && /^[0-9a-f]{48}$/.test(view) ? <ViewNight token={view} /> : <App />}</StrictMode>);
