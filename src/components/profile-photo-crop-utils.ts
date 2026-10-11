type Point = { x: number; y: number };
const CROP_SIZE = 320;

export function profileCropRect(width: number, height: number, zoom: number, offset: Point) {
  const scale = Math.max(CROP_SIZE / width, CROP_SIZE / height) * zoom;
  const sourceSize = CROP_SIZE / scale;
  const centerX = width / 2 - offset.x / scale;
  const centerY = height / 2 - offset.y / scale;
  return {
    x: Math.max(0, Math.min(width - sourceSize, centerX - sourceSize / 2)),
    y: Math.max(0, Math.min(height - sourceSize, centerY - sourceSize / 2)),
    size: sourceSize,
  };
}
