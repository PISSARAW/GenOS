'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const sharp = require('sharp');
const { defaultFovealVision } = require('./fovealVisionService');
async function crop() {
  const image = await sharp(workerData.screenshotPath).metadata();
  const scan = defaultFovealVision.peripheralScan({ width: image.width, height: image.height, targetType: 'webpage' });
  const roi = scan.candidateRegions[0];
  return defaultFovealVision.fovealCrop(workerData.screenshotPath, roi.bbox, {
    zoomFactor: roi.suggestedZoom, focusNotes: 'Browser page ROI selected from peripheral scan.'
  });
}
crop().then(result => parentPort.postMessage({ result }), error => parentPort.postMessage({ error: error.message }));
