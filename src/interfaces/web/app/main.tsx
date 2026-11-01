import { render } from "preact";
import "../shared/tokens.css";
import "../shared/charts/charts.css";
import "./app.css";
import { App } from "./App";

const mount = document.getElementById("app");
if (mount === null) throw new Error("The page has no #app element to render into.");
render(<App />, mount);
