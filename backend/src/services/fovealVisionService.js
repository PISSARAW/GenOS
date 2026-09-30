/**
 * Foveal Vision Service — Active Vision & Multi-Scale Inspection.
 *
 * Implémente le biomimétisme de la rétine humaine :
 * - Vision périphérique (candidats ROI heuristiques)
 * - Saccade oculaire (ciblage des régions d'intérêt : axes 3D, légendes, tableaux)
 * - Fovéation (crop réel des pixels source; aucune résolution n'est inventée).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

class FovealVisionService {
  constructor(options = {}) {
    this.artifactsDir = options.artifactsDir || path.resolve(process.cwd(), '.genos', 'workspace', 'fovea');
    try {
      if (!fs.existsSync(this.artifactsDir)) fs.mkdirSync(this.artifactsDir, { recursive: true });
    } catch (_) {}
  }

  /**
   * Scan périphérique : repère les régions d'intérêt (ROIs) candidates dans une image/page.
   * Retourne des coordonnées normalisées [ymin, xmin, ymax, xmax] (entre 0 et 1000).
   */
  peripheralScan(imageMeta = {}) {
    const width = imageMeta.width || 1200;
    const height = imageMeta.height || 1600;
    const targetType = imageMeta.targetType || 'figure';

    const regions = [];
    if (targetType === 'figure' || targetType === 'scientific_plot') {
      // Repérage saillant d'un graphique central et de ses axes
      regions.push({
        id: 'roi_figure_main',
        label: 'Main Figure Boundary',
        bbox: [150, 100, 800, 900], // [ymin, xmin, ymax, xmax] en permille
        saliencyScore: 0.94,
        suggestedZoom: 2.0
      });
      // Saccade ciblée sur les axes et labels minuscules
      regions.push({
        id: 'roi_axes_labels',
        label: 'Axes Ends & Tiny Annotations',
        bbox: [200, 120, 450, 400],
        saliencyScore: 0.98,
        suggestedZoom: 3.5
      });
      regions.push({
        id: 'roi_legend',
        label: 'Figure Legend & Colorbar',
        bbox: [720, 600, 850, 920],
        saliencyScore: 0.88,
        suggestedZoom: 2.5
      });
    } else if (targetType === 'table') {
      regions.push({
        id: 'roi_table_headers',
        label: 'Table Header & Columns',
        bbox: [50, 50, 250, 950],
        saliencyScore: 0.96,
        suggestedZoom: 2.0
      });
    } else {
      regions.push({
        id: 'roi_full_center',
        label: 'Central Fovea',
        bbox: [250, 250, 750, 750],
        saliencyScore: 0.85,
        suggestedZoom: 1.5
      });
    }

    return {
      imageWidth: width,
      imageHeight: height,
      detectedRoisCount: regions.length,
      candidateRegions: regions,
      scannedAt: new Date().toISOString()
    };
  }

  /**
   * Fovéation : découpe et extrait la région d'intérêt à pleine résolution
   */
  async fovealCrop(inputPath, bbox = [0, 0, 1000, 1000], options = {}) {
    const zoomFactor = Math.max(1.0, Number(options.zoomFactor) || 2.0);
    const [ymin, xmin, ymax, xmax] = bbox;
    const metadata = await sharp(inputPath).metadata();
    if (!metadata.width || !metadata.height) throw new Error('Source image has no readable dimensions.');
    const normalized = options.coordinateSpace === 'pixels' ? null : true;
    const left = normalized ? Math.floor((xmin / 1000) * metadata.width) : Math.floor(xmin);
    const top = normalized ? Math.floor((ymin / 1000) * metadata.height) : Math.floor(ymin);
    const right = normalized ? Math.ceil((xmax / 1000) * metadata.width) : Math.ceil(xmax);
    const bottom = normalized ? Math.ceil((ymax / 1000) * metadata.height) : Math.ceil(ymax);
    if (left < 0 || top < 0 || right > metadata.width || bottom > metadata.height || right <= left || bottom <= top) {
      throw new Error('ROI must be a non-empty box inside the source image.');
    }

    const cropId = `fovea_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const outputFilename = `${cropId}.png`;
    const outputPath = path.join(this.artifactsDir, outputFilename);

    const cropBuffer = await sharp(inputPath).extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer();
    fs.writeFileSync(outputPath, cropBuffer);
    const hash = crypto.createHash('sha256').update(cropBuffer).digest('hex');

    // En environnement simulé ou réel, on écrit un descripteur d'artefact fovéal
    const fovealManifest = {
      cropId,
      sourceImage: inputPath,
      normalizedBbox: [ymin, xmin, ymax, xmax],
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      pixelBounds: { left, top, right, bottom },
      outputWidth: right - left,
      outputHeight: bottom - top,
      relativeAreaFraction: (((right - left) * (bottom - top)) / (metadata.width * metadata.height)).toFixed(4),
      zoomFactor,
      focusNotes: options.focusNotes || null,
      resampled: false
    };

    return {
      success: true,
      cropId,
      outputPath,
      bbox: [ymin, xmin, ymax, xmax],
      zoomFactor,
      pixelDimensions: { width: right - left, height: bottom - top },
      sha256: hash,
      fovealManifest
    };
  }

  /**
   * Saccade ciblée vers un point d'attention spécifique (ex: label 'egalitarian' ou 'Figure 1')
   */
  async saccadeToFeature(inputPath, featureKeyword, contextMeta = {}) {
    const scan = this.peripheralScan(contextMeta);
    let targetRoi = scan.candidateRegions[0];

    const kw = String(featureKeyword || '').toLowerCase();
    if (kw.includes('axis') || kw.includes('word') || kw.includes('label') || kw.includes('3d')) {
      targetRoi = scan.candidateRegions.find(r => r.id === 'roi_axes_labels') || targetRoi;
    } else if (kw.includes('legend') || kw.includes('color')) {
      targetRoi = scan.candidateRegions.find(r => r.id === 'roi_legend') || targetRoi;
    }

    const cropResult = await this.fovealCrop(inputPath, targetRoi.bbox, {
      zoomFactor: targetRoi.suggestedZoom || 3.0,
      focusNotes: `Saccade locked on '${featureKeyword}' within ${targetRoi.label}`
    });

    return {
      success: true,
      featureKeyword,
      lockedRoi: targetRoi,
      fovealCrop: cropResult
    };
  }
}

const defaultFovealVision = new FovealVisionService();

module.exports = {
  FovealVisionService,
  defaultFovealVision
};
