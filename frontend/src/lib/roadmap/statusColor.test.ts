import { describe, expect, it } from 'vitest';
import tokens from '../../../../shared/design-tokens.json';
import { statusColor, type StatusColorPalette } from './statusColor';

const PALETTE: StatusColorPalette = {
  status: {
    notStarted: tokens.status['not-started'],
    inProgress: tokens.status['in-progress'],
    atRisk: tokens.status['at-risk'],
    done: tokens.status.done,
  },
  team: tokens.team,
};

describe('statusColor', () => {
  it('RM-8 a default status uses its status token', () => {
    expect(statusColor({ id: 'at-risk', color: 'deepOrange' }, PALETTE)).toBe(
      tokens.status['at-risk'].color,
    );
  });

  it('RM-8 a custom status uses its team colour key', () => {
    expect(statusColor({ id: 'qa', color: 'teal' }, PALETTE)).toBe(tokens.team.teal);
  });

  it('RM-8 an unknown colour key falls back to Not started grey', () => {
    expect(statusColor({ id: 'qa', color: 'magenta' }, PALETTE)).toBe(
      tokens.status['not-started'].color,
    );
  });

  it('RM-8 a missing status falls back to Not started grey', () => {
    expect(statusColor(undefined, PALETTE)).toBe(tokens.status['not-started'].color);
  });
});
