import "./style.css";
import { App } from "./app";
import { installConsoleApi } from "./ui/consoleApi";

const app = new App(document.getElementById("canvas") as HTMLCanvasElement);
installConsoleApi(app);
app.start();
