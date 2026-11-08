import Check from '@mui/icons-material/Check';
import Box from '@mui/material/Box';
import { Fragment } from 'react';

export const IMPORT_STEPS = ['Upload', 'Map fields', 'Preview & save'] as const;

/** Zero-based index into `IMPORT_STEPS`. */
export type ImportStepIndex = 0 | 1 | 2;

interface ImportStepperProps {
  active: ImportStepIndex;
}

// Prototype `.stepper .n` and `.stepper .ln`.
const NUMBER_SIZE = 24;
const CONNECTOR_WIDTH = 32;
const CHECK_SIZE = 16;

/** The three import steps (prototype `.stepper`): done steps get a tick, the current one `aria-current`. */
export function ImportStepper({ active }: ImportStepperProps) {
  return (
    <Box
      component="ol"
      aria-label="Import steps"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.25,
        listStyle: 'none',
        m: 0,
        p: 0,
        typography: 'body2',
      }}
    >
      {IMPORT_STEPS.map((label, index) => {
        const done = index < active;
        const current = index === active;
        const stateColor = done ? 'success.main' : current ? 'primary.main' : 'neutral.muted';
        return (
          <Fragment key={label}>
            {index > 0 && (
              <Box
                component="li"
                aria-hidden
                sx={{ width: CONNECTOR_WIDTH, height: '1px', bgcolor: 'neutral.borderInput' }}
              />
            )}
            <Box
              component="li"
              aria-current={current ? 'step' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: stateColor,
                fontWeight: done || current ? 'fontWeightMedium' : 'fontWeightRegular',
              }}
            >
              <Box
                component="span"
                sx={{
                  width: NUMBER_SIZE,
                  height: NUMBER_SIZE,
                  borderRadius: '50%',
                  border: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  typography: 'caption',
                  borderColor: done || current ? stateColor : 'neutral.borderInput',
                  bgcolor: done || current ? stateColor : 'transparent',
                  color: done || current ? 'background.paper' : 'inherit',
                }}
              >
                {done ? <Check aria-label="Done" sx={{ fontSize: CHECK_SIZE }} /> : index + 1}
              </Box>
              {label}
            </Box>
          </Fragment>
        );
      })}
    </Box>
  );
}
