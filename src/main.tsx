import React from "react";
import ReactDOM from "react-dom/client";
import WorkingHourWebApp from "../app/WorkingHourWebApp";
import "../app/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkingHourWebApp />
  </React.StrictMode>,
);
