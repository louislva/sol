import "./style.css";
import { inject } from "@vercel/analytics";
import { App } from "./app";
import { installConsoleApi } from "./ui/consoleApi";

inject({ mode: import.meta.env.DEV ? "development" : "production" });

const app = new App(document.getElementById("canvas") as HTMLCanvasElement);
installConsoleApi(app);
app.start();
