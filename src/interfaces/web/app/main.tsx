import { render } from "preact";
import "../shared/tokens.css";
import "../presentation/charts/charts.css";
import "./app.css";
import "../features/overview/portfolio.css";
import "../shared/ui/interactions.css";
import "../shared/ui/motion.css";
import { App } from "./App";
import { watchSystemTheme } from "./systemTheme";

const stopWatchingTheme = watchSystemTheme();
if (import.meta.hot) import.meta.hot.dispose(stopWatchingTheme);

const mount = document.getElementById("app");
if (mount === null) throw new Error("The page has no #app element to render into.");
render(<App />, mount);
