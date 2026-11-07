// MUI module augmentation for the custom palettes and `theme.custom` built in theme.ts.
// Named theme-types.d.ts, not theme.d.ts: TypeScript skips a .d.ts that sits next to a
// .ts file of the same name, so the augmentation would silently never load.
import type { CSSProperties } from 'react';
import type tokens from '../../../shared/design-tokens.json';
import type { CustomTheme, NeutralPalette, StatusPalette } from './theme';

declare module '@mui/material/styles' {
  interface Palette {
    status: StatusPalette;
    team: typeof tokens.team;
    lane: typeof tokens.lane;
    milestone: typeof tokens.milestone;
    timeline: typeof tokens.timeline;
    diagram: typeof tokens.diagram;
    watermark: typeof tokens.watermark;
    neutral: NeutralPalette;
  }
  interface PaletteOptions {
    status?: StatusPalette;
    team?: typeof tokens.team;
    lane?: typeof tokens.lane;
    milestone?: typeof tokens.milestone;
    timeline?: typeof tokens.timeline;
    diagram?: typeof tokens.diagram;
    watermark?: typeof tokens.watermark;
    neutral?: NeutralPalette;
  }

  interface Theme {
    custom: CustomTheme;
  }
  interface ThemeOptions {
    custom?: CustomTheme;
  }

  interface TypographyVariants {
    fontFamilyMono: CSSProperties['fontFamily'];
  }
  interface TypographyVariantsOptions {
    fontFamilyMono?: CSSProperties['fontFamily'];
  }
}
