import { describe, expect, it } from 'vitest';
import tokens from '../../../shared/design-tokens.json';
import { theme } from './theme';

describe('theme', () => {
  it('G-1 builds the primary colour from design tokens', () => {
    expect(theme.palette.primary.main).toBe(tokens.color.primary);
  });

  it('maps every status token to a camelCase palette key', () => {
    expect(theme.palette.status).toEqual({
      notStarted: tokens.status['not-started'],
      inProgress: tokens.status['in-progress'],
      atRisk: tokens.status['at-risk'],
      done: tokens.status.done,
    });
  });

  it('exposes all six lane palettes', () => {
    expect(theme.palette.lane).toEqual(tokens.lane);
  });

  it('uses Roboto from tokens', () => {
    expect(theme.typography.fontFamily).toBe(tokens.font.family);
  });

  it('exposes the mono font family from tokens', () => {
    expect(theme.typography.fontFamilyMono).toBe(tokens.font.mono);
  });

  it('exposes the 720px mobile breakpoint and 56px app bar height', () => {
    expect({
      breakpointMobile: theme.custom.layout.breakpointMobile,
      appBarHeight: theme.custom.layout.appBarHeight,
      mobileMedia: theme.custom.media.mobile,
    }).toEqual({
      breakpointMobile: 720,
      appBarHeight: 56,
      mobileMedia: '@media (max-width:720px)',
    });
  });

  it('puts every colour token without a standard slot on the neutral palette', () => {
    expect(theme.palette.neutral).toMatchObject({
      muted: tokens.color.textMuted,
      borderInput: tokens.color.borderInput,
      borderSubtle: tokens.color.borderSubtle,
      hover: tokens.color.hover,
      primaryTint: tokens.color.primaryTint,
      primaryTintSoft: tokens.color.primaryTintSoft,
    });
  });
});
