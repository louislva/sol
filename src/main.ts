import "./style.css";
import { inject } from "@vercel/analytics";
import { App } from "./app";
import { pageForPath } from "./seo/pages";
import { installAboutPanel } from "./ui/about";
import { installConsoleApi } from "./ui/consoleApi";

inject({ mode: import.meta.env.DEV ? "development" : "production" });

const app = new App(document.getElementById("canvas") as HTMLCanvasElement);
installConsoleApi(app);
app.start();
installAboutPanel();

// A landing page (/voyager-1, /mars, …) opens on its object. Stars and other
// runtime-loaded objects resolve once their catalog arrives.
const landing = pageForPath(location.pathname);
if (landing?.target) {
  const name = landing.target;
  const started = performance.now();
  const open = () => {
    const target = app.world.find(name);
    if (target) void app.present(target, landing.framing ?? "close");
    else if (performance.now() - started < 20_000) setTimeout(open, 250);
  };
  open();
}
