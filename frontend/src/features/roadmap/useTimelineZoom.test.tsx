import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRoadmapEditor } from './state';
import { useTimelineZoom } from './useTimelineZoom';

const CONTAINER_WIDTH = 1120;

function Harness() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { zoom, containerWidth, stepZoom, resetZoom, fitZoom } = useTimelineZoom(scrollRef);
  return (
    <div>
      <div
        data-testid="scroll"
        ref={(element) => {
          if (element)
            Object.defineProperty(element, 'clientWidth', {
              configurable: true,
              value: CONTAINER_WIDTH,
            });
          scrollRef.current = element;
        }}
      >
        <div />
      </div>
      <output aria-label="zoom">{zoom}</output>
      <output aria-label="width">{containerWidth}</output>
      <button
        type="button"
        onClick={() => {
          stepZoom(1);
        }}
      >
        in
      </button>
      <button type="button" onClick={resetZoom}>
        reset
      </button>
      <button type="button" onClick={fitZoom}>
        fit
      </button>
      <input aria-label="text" />
    </div>
  );
}

const shownZoom = () => screen.getByLabelText('zoom').textContent;

beforeEach(() => {
  window.localStorage.clear();
  useRoadmapEditor.setState({ view: 'sprints', zoom: { sprints: 1, months: 1, pis: 1 } });
});

describe('useTimelineZoom', () => {
  it('RM-20 each view remembers its zoom', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('in'));
    act(() => {
      useRoadmapEditor.getState().setView('months');
    });
    const months = shownZoom();
    act(() => {
      useRoadmapEditor.getState().setView('sprints');
    });

    expect([months, shownZoom()]).toEqual(['1', '1.1']);
  });

  it('RM-20 Ctrl+= steps up', () => {
    render(<Harness />);

    fireEvent.keyDown(window, { key: '=', ctrlKey: true });

    expect(shownZoom()).toBe('1.1');
  });

  it('RM-20 Cmd+- steps down and Ctrl+0 resets', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: '-', metaKey: true });
    const down = shownZoom();

    fireEvent.keyDown(window, { key: '0', ctrlKey: true });

    expect([down, shownZoom()]).toEqual(['0.9', '1']);
  });

  it('RM-20 shortcuts are ignored while typing', () => {
    render(<Harness />);

    fireEvent.keyDown(screen.getByLabelText('text'), { key: '=', ctrlKey: true });

    expect(shownZoom()).toBe('1');
  });

  it('RM-20 Fit fits 13 sprints', () => {
    render(<Harness />);

    fireEvent.click(screen.getByText('fit'));

    expect(shownZoom()).toBe('0.665');
  });

  it('RM-20 Ctrl+wheel zooms continuously', () => {
    render(<Harness />);

    fireEvent.wheel(screen.getByTestId('scroll'), { deltaY: -60, ctrlKey: true });

    expect(shownZoom()).toBe('1.271');
  });

  it('RM-20 a plain wheel scrolls instead of zooming', () => {
    render(<Harness />);

    fireEvent.wheel(screen.getByTestId('scroll'), { deltaY: -60 });

    expect(shownZoom()).toBe('1');
  });

  it('RM-5 reports the scroll box width for sprint labels', () => {
    render(<Harness />);

    expect(screen.getByLabelText('width').textContent).toBe(String(CONTAINER_WIDTH));
  });
});
