import { detectLargePlan } from './detect.mjs';
import { recognizePlan } from './recognize/index.mjs';

self.onmessage = (e) => {
  try {
    const { pixels, width, height, worldWidth } = e.data,
      progress = (percent, message) => self.postMessage({ progress: percent, message });
    // Architectural recogniser first; the line detector handles sketches and images
    // it does not understand (it returns null for those).
    let result = recognizePlan(pixels, width, height, progress);
    if (result) result.engine = 'plan';
    else {
      result = detectLargePlan(pixels, width, height, worldWidth, progress);
      result.engine = 'lines';
      result.features = [];
      result.scale = null;
    }
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
