import ArrowRight from '@mui/icons-material/ArrowRight';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId } from 'react';

// Prototype `details ol`.
const STEPS_LINE_HEIGHT = 1.7;
const EXPAND_ICON_ROTATION = 'rotate(90deg)';

/** IMP-3: how to get an export out of Jira, disclosed on demand (prototype `<details>`). */
export function JiraExportHelp() {
  const summaryId = useId();
  const detailsId = useId();
  return (
    <Accordion
      slotProps={{ region: { id: detailsId, 'aria-labelledby': summaryId } }}
      disableGutters
      elevation={0}
      square
      sx={{ mt: 2.5, bgcolor: 'transparent', '&::before': { display: 'none' } }}
    >
      <AccordionSummary
        id={summaryId}
        aria-controls={detailsId}
        sx={{
          px: 0,
          minHeight: 0,
          flexDirection: 'row-reverse',
          // row-reverse puts the arrow first, so flex-end is the left edge.
          justifyContent: 'flex-end',
          width: 'fit-content',
          gap: 0.5,
          color: 'primary.main',
          '& .MuiAccordionSummary-content': { m: 0, flexGrow: 0 },
          '& .MuiAccordionSummary-expandIconWrapper': { color: 'primary.main' },
          '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': {
            transform: EXPAND_ICON_ROTATION,
          },
        }}
        expandIcon={<ArrowRight />}
      >
        <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium' }}>
          How do I export from Jira?
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0 }}>
        <Box
          component="ol"
          sx={{ m: 0, typography: 'body2', lineHeight: STEPS_LINE_HEIGHT, color: 'text.secondary' }}
        >
          <li>
            In Jira, open <b>Filters</b> and run the filter or JQL for your epics and stories.
          </li>
          <li>
            Choose <b>Export → Export CSV (all fields)</b>.
          </li>
          <li>Drop the file here.</li>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
