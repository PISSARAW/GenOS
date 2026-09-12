/**
 * Test Suite — Foveal Vision Service & MCP Handler
 * Vérifie l'attention active biomimétique, le scan périphérique, les saccades
 * et le découpage fovéal sans perte pour les graphiques scientifiques (arXiv Figure 1).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { FovealVisionService, defaultFovealVision } = require('../src/services/fovealVisionService');
const { handleFovealVision } = require('../src/services/mcpBioTools/handlers/fovealVision');

async function runTests() {
  console.log('====================================================');
  console.log('       GenOS V3 - Test Foveal Vision Service        ');
  console.log('====================================================');

  const testArtifactsDir = path.resolve(__dirname, '../scratch/test_fovea');
  const fovea = new FovealVisionService({ artifactsDir: testArtifactsDir });

  // 1. Test Peripheral Scan (Low-res saliency map)
  console.log('[1/4] Testing peripheral scan on scientific plot...');
  const scan = fovea.peripheralScan({ width: 1400, height: 1800, targetType: 'scientific_plot' });

  assert.strictEqual(scan.imageWidth, 1400);
  assert.strictEqual(scan.imageHeight, 1800);
  assert.ok(scan.detectedRoisCount >= 3, 'Must detect at least 3 ROIs (figure, axes, legend)');

  const axesRoi = scan.candidateRegions.find(r => r.id === 'roi_axes_labels');
  assert.ok(axesRoi, 'Must detect axes & labels ROI');
  assert.ok(axesRoi.suggestedZoom >= 3.0, 'Axes must request high zoom factor');
  console.log('  -> Peripheral scan successfully mapped salient regions');

  // 2. Test Foveal High-Resolution Crop
  console.log('[2/4] Testing lossless foveal crop...');
  const cropRes = fovea.fovealCrop('mock_arxiv_paper_fig1.png', axesRoi.bbox, {
    zoomFactor: 3.5,
    focusNotes: '6 small words at ends of 3D axes: egalitarian, hierarchical, individualist, etc.'
  });

  assert.strictEqual(cropRes.success, true);
  assert.strictEqual(cropRes.zoomFactor, 3.5);
  assert.ok(cropRes.effectiveResolutionDpi >= 1000);
  assert.ok(cropRes.sha256, 'Must compute SHA-256 hash');
  assert.ok(fs.existsSync(cropRes.outputPath), 'Artifact must be written to disk');
  console.log('  -> Foveal crop written to:', cropRes.outputPath);
  console.log('  -> Effective DPI:', cropRes.effectiveResolutionDpi);

  // 3. Test Saccade to Feature
  console.log('[3/4] Testing saccade attention lock on keyword feature...');
  const saccadeRes = fovea.saccadeToFeature('mock_arxiv_paper_fig1.png', '3d_axis_label', {
    targetType: 'scientific_plot'
  });

  assert.strictEqual(saccadeRes.success, true);
  assert.strictEqual(saccadeRes.lockedRoi.id, 'roi_axes_labels');
  assert.ok(saccadeRes.fovealCrop.sha256);
  console.log('  -> Saccade locked on:', saccadeRes.lockedRoi.label);

  // 4. Test MCP Handler genos_foveal_crop
  console.log('[4/4] Testing MCP Handler genos_foveal_crop...');
  const mcpScan = await handleFovealVision({
    action: 'scan',
    target_type: 'scientific_plot'
  });
  assert.strictEqual(mcpScan.success, true);
  assert.strictEqual(mcpScan.status, 'completed');

  const mcpCrop = await handleFovealVision({
    action: 'crop',
    image_path: 'arxiv_2206_12345_fig1.png',
    bbox: [200, 120, 450, 400],
    zoom_factor: 4.0
  });
  assert.strictEqual(mcpCrop.success, true);
  console.log('  -> MCP integration passed');

  // Nettoyage
  try {
    fs.rmSync(testArtifactsDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n[PASS] All Foveal Vision tests passed successfully!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL] Foveal Vision test failed:', err);
  process.exit(1);
});
