import { describe, expect, it } from 'vitest';
import {
  anchoredScrollLeft,
  baseMinWidth,
  clampZoom,
  fitZoom,
  stepZoom,
  wheelZoom,
  ZOOM_STEPS,
} from './zoom';

describe('zoom', () => {
  it('RM-20 steps walk the documented ladder up and down', () => {
    const up: number[] = [];
    for (let zoom = 0.5; up.length < ZOOM_STEPS.length - 1;) up.push((zoom = stepZoom(zoom, 1)));

    expect(up).toEqual(ZOOM_STEPS.slice(1));
  });

  it('RM-20 steps stop at the limits', () => {
    expect([stepZoom(0.5, -1), stepZoom(3, 1)]).toEqual([0.5, 3]);
  });

  it('RM-20 steps from an off-ladder zoom go to the neighbouring step', () => {
    expect([stepZoom(1.05, 1), stepZoom(1.05, -1)]).toEqual([1.1, 1]);
  });

  it('RM-20 clamp keeps zoom in 50–300%', () => {
    expect([clampZoom(0.1), clampZoom(9), clampZoom(1.23456)]).toEqual([0.5, 3, 1.235]);
  });

  it('RM-20 Fit rounds down', () => {
    // (1120 - 220) / (1572 - 220) = 0.66568…, which rounds up to 0.666 but must floor to 0.665.
    expect(fitZoom(1120, baseMinWidth('sprints'))).toBe(0.665);
  });

  it('RM-20 Fit is 100% when the container is wider than the minimum', () => {
    expect(fitZoom(1600, baseMinWidth('months'))).toBe(1);
  });

  it('RM-20 wheel clamps deltaY', () => {
    expect(wheelZoom(1, -500)).toBe(wheelZoom(1, -60));
  });

  it('RM-20 wheel zooms in on a negative deltaY', () => {
    expect(wheelZoom(1, -60)).toBe(1.271);
  });

  it('RM-20 anchor keeps the pointer date still', () => {
    const oldWidth = 1572;
    const newWidth = 2924;
    const scrollLeft = 300;
    const anchorX = 400;
    const before = (scrollLeft + anchorX - 220) / (oldWidth - 220);

    const next = anchoredScrollLeft(oldWidth, newWidth, scrollLeft, anchorX);

    expect((next + anchorX - 220) / (newWidth - 220)).toBeCloseTo(before, 9);
  });

  it('RM-20 base widths: 13 sprints, else 900px', () => {
    expect([baseMinWidth('sprints'), baseMinWidth('months'), baseMinWidth('pis')]).toEqual([
      1572, 900, 900,
    ]);
  });
});
