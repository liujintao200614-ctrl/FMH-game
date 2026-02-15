export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const pointToSegmentDistance = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0.000001) return Math.hypot(apx, apy);
  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  const projX = a.x + abx * t;
  const projY = a.y + aby * t;
  return Math.hypot(p.x - projX, p.y - projY);
};

export const SHARED_LONG_PRESS_MS = 320;
export const SHARED_ARROW_SMOOTH_FOLLOW = 0.5;
export const SHARED_ARROW_START_OFFSET = 10;
export const SHARED_ARROW_STROKE_WIDTH = 10;
export const SHARED_ARROW_HEAD_LENGTH = 18;
export const SHARED_ARROW_HEAD_WIDTH = 10;
export const SHARED_CAPTURE_RADIUS = 34;
