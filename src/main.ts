import { Scene } from "@vectojs/core";
import { attachDevtools, auditScene } from "@vectojs/devtools";
import { createDemoModel } from "@vectojs/sheets-core";
import { SheetsApp } from "./view/SheetsApp";
import { measureSceneContainer } from "./view/sceneSizing";

declare global {
  interface Window {
    __app?: {
      scene: Scene;
      model: ReturnType<typeof createDemoModel>;
      app: SheetsApp;
      audit: () => ReturnType<typeof auditScene>;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#sheets-canvas");
if (!canvas) throw new Error("Native Sheets requires #sheets-canvas");
const container = document.querySelector<HTMLElement>("#sheets-root");
if (!container) throw new Error("Native Sheets requires #sheets-root");

const scene = new Scene(canvas, { disableWindowResize: true });
scene.renderMode = "onDemand";
const model = createDemoModel();
const app = new SheetsApp(scene, model);

const resize = (): void => {
  const { width, height } = measureSceneContainer(container);
  app.resize(width, height);
};
const observer = new ResizeObserver(resize);
observer.observe(container);
resize();
scene.start();

window.__app = {
  scene,
  model,
  app,
  audit: () => auditScene(scene),
};

if (new URLSearchParams(window.location.search).has("debug")) {
  attachDevtools(scene, { refreshInterval: 0 });
}

window.addEventListener(
  "beforeunload",
  () => {
    observer.disconnect();
    app.destroy();
    scene.destroy();
  },
  { once: true },
);
