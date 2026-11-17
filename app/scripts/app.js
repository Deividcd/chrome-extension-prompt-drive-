import { initializeApp } from "./engine.js";
import { startRenderer } from "./render.js";

async function startApplication() {
  startRenderer();
  await initializeApp();
}

startApplication();
