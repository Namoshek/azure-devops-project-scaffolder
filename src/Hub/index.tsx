import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { ScaffoldApp } from "./ScaffoldApp";
import "azure-devops-ui/Core/override.css";

SDK.init().then(() => {
  ReactDOM.render(<ScaffoldApp />, document.getElementById("root"));
});
