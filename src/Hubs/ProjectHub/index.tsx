import React from "react";
import { createRoot } from "react-dom/client";
import * as SDK from "azure-devops-extension-sdk";
import { ScaffoldApp } from "./ScaffoldApp";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import "azure-devops-ui/Core/override.css";

SDK.init().then(() => {
  const container = document.getElementById("root");
  if (container) {
    createRoot(container).render(
      <ErrorBoundary>
        <ScaffoldApp />
      </ErrorBoundary>,
    );
  }
});
