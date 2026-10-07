const { defaultFovealVision } = require('../../fovealVisionService');

async function handleFovealVision(args) {
  const action = args.action || 'crop';
  const imagePath = args.image_path || args.imagePath || args.target_file || 'figure_1.png';

  if (['scan', 'peripheral_scan'].includes(action)) {
    return fovealVisionScan({ args });
  }

  if (action === 'saccade') {
    return fovealVisionSaccade({ args, imagePath });
  }

  // Action par défaut : crop fovéal haute résolution
  return cropFovealImage(args, imagePath);

}

function handleFovealVisionError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'local_service',
    output: e.message || String(e)
  };
}

module.exports = {
  handleFovealVision,
  handleFovealVisionError
};

async function fovealVisionScan({ args }) {
  const scan = defaultFovealVision.peripheralScan({
    width: args.width,
    height: args.height,
    targetType: args.target_type || args.targetType
  });
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local_service',
    output: JSON.stringify(scan, null, 2)
  };
}

async function fovealVisionSaccade({ args, imagePath }) {
  const saccade = await defaultFovealVision.saccadeToFeature(imagePath, args.keyword || args.feature || 'axis_label', {
    targetType: args.target_type || 'scientific_plot'
  });
  return {
    configured: true,
    success: saccade.success,
    status: 'completed',
    transport: 'local_service',
    output: JSON.stringify(saccade, null, 2)
  };
}

async function cropFovealImage(args, imagePath) {
  const bbox = Array.isArray(args.bbox) ? args.bbox : [150, 100, 800, 900];
  const crop = await defaultFovealVision.fovealCrop(imagePath, bbox, {
    zoomFactor: args.zoom_factor || args.zoomFactor || 2.5,
    focusNotes: args.notes || args.focus
  });

  return {
    configured: true,
    success: crop.success,
    status: 'completed',
    transport: 'local_service',
    output: JSON.stringify(crop, null, 2)
  };
}
