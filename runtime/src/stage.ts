export const LOGICAL_WIDTH = 1920;
export const LOGICAL_HEIGHT = 1080;

export function computeProportionalScale(
  viewportWidth: number,
  viewportHeight: number,
  logicalWidth: number = LOGICAL_WIDTH,
  logicalHeight: number = LOGICAL_HEIGHT
): number {
  if (viewportWidth <= 0 || viewportHeight <= 0 || logicalWidth <= 0 || logicalHeight <= 0) {
    return 1;
  }
  const scaleX = viewportWidth / logicalWidth;
  const scaleY = viewportHeight / logicalHeight;
  return Math.min(scaleX, scaleY);
}

export function applyStageTransform(
  stageElement: HTMLElement,
  viewportWidth: number,
  viewportHeight: number
): number {
  const scale = computeProportionalScale(viewportWidth, viewportHeight, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  stageElement.style.width = `${LOGICAL_WIDTH}px`;
  stageElement.style.height = `${LOGICAL_HEIGHT}px`;
  stageElement.style.flexShrink = "0";
  stageElement.style.position = "relative";
  stageElement.style.overflow = "hidden";
  stageElement.style.transformOrigin = "center center";
  stageElement.style.transform = `scale(${scale})`;
  return scale;
}
