import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import type { RollupRules as Rules } from '../../../lib/importMapping/mapping';

interface RollupRulesProps {
  rules: Rules;
  onChange: (rule: keyof Rules, value: boolean) => void;
}

/** Prototype copy, in the prototype's order. */
const RULE_LABELS: ReadonlyArray<readonly [keyof Rules, string]> = [
  ['rollUpStories', 'Roll stories up into their epic — the bar spans earliest start to latest end'],
  ['useSprintDates', 'Use sprint dates when an issue has no start or due date'],
  ['unscheduledTray', 'Put issues without dates in the Unscheduled tray'],
  ['fixVersionsAsMilestones', 'Turn Fix versions into milestones'],
];

/** IMP-8: the four roll-up switches. */
export function RollupRules({ rules, onChange }: RollupRulesProps) {
  const headingId = useId();
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{
        p: 2,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      <Typography
        id={headingId}
        variant="body2"
        component="h3"
        sx={{ fontWeight: 'fontWeightMedium', mb: 0.5 }}
      >
        Roll-up rules
      </Typography>
      {RULE_LABELS.map(([rule, label]) => (
        <FormControlLabel
          key={rule}
          label={label}
          slotProps={{ typography: { variant: 'body2' } }}
          control={
            <Checkbox
              size="small"
              checked={rules[rule]}
              onChange={(event) => {
                onChange(rule, event.target.checked);
              }}
            />
          }
        />
      ))}
    </Box>
  );
}
