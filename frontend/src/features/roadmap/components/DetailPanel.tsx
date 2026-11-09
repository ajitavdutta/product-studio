import LastPageIcon from '@mui/icons-material/LastPage';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import { type ReactNode, type Ref, useState } from 'react';
import type { RoadmapDocument } from '../../../api/useRoadmap';
// One set of date bounds for every date field: a browser date field reports partial years
// (`0002-…`) while a year is typed, so only plausible years count as finished.
import {
  isFinishedDate,
  MILESTONE_DATE_MAX,
  MILESTONE_DATE_MIN,
} from '../../../lib/roadmap/milestones';
import { statusColor } from '../../../lib/roadmap/statusColor';

type RoadmapItem = RoadmapDocument['items'][number];
export type PanelField = 'statusId' | 'laneId' | 'start' | 'end';
type DateField = 'start' | 'end';

interface DetailPanelProps {
  item: RoadmapItem | null;
  statuses: RoadmapDocument['statuses'];
  lanes: RoadmapDocument['lanes'];
  /** `Runs PI 4 · 2026 S4 → PI 1 · 2027 S3 · crosses Beta launch` */
  spanLabel: string;
  /** Open in Jira target, or null to hide the link. */
  jiraUrl: string | null;
  /** `Synced from Jira 6 Nov, 17:10` */
  syncedLabel: string;
  /** Goes up when the cached document is replaced; remounts the uncontrolled text fields. */
  reloads: number;
  onTitleChange: (title: string) => void;
  onFieldChange: (field: PanelField, value: string) => void;
  onNotesChange: (notes: string) => void;
  onUnschedule: () => void;
  onCollapse: () => void;
  toggleRef?: Ref<HTMLButtonElement>;
}

export const EMPTY_PANEL_MESSAGE = 'Click a bar to see and edit an epic.';
export const DATE_ORDER_MESSAGE = "End date can't be before the start date";
const TITLE_REQUIRED_MESSAGE = 'Enter a title';
const NOTES_LABEL = 'PM notes (saved in the JSON, never sent to Jira)';
/** Stories shown before "+ N more". */
const VISIBLE_STORIES = 4;
const PROGRESS_BAR_HEIGHT = 6;
const STORY_DOT = 8;
const NOTES_ROWS = 3;

/** A finished date that would put the end before the start. */
function isOutOfOrder(item: RoadmapItem, field: DateField, value: string): boolean {
  if (!isFinishedDate(value)) return false;
  const start = field === 'start' ? value : (item.start ?? '');
  const end = field === 'end' ? value : (item.end ?? '');
  return Boolean(start && end && end < start);
}

function Section({ children, grid = false }: { children: ReactNode; grid?: boolean }) {
  return (
    <Box
      sx={{
        p: 2,
        borderBottom: 1,
        borderColor: 'divider',
        display: grid ? 'grid' : 'flex',
        flexDirection: 'column',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: grid ? 1.5 : 1,
      }}
    >
      {children}
    </Box>
  );
}

function CollapseButton({
  onCollapse,
  toggleRef,
}: Pick<DetailPanelProps, 'onCollapse' | 'toggleRef'>) {
  return (
    <IconButton
      ref={toggleRef}
      size="small"
      aria-expanded
      aria-label="Collapse epic details"
      title="Collapse epic details"
      onClick={onCollapse}
    >
      <LastPageIcon fontSize="small" />
    </IconButton>
  );
}

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <Box
      component="aside"
      aria-label="Epic details"
      sx={(theme) => ({
        flex: `1 1 ${String(theme.custom.layout.sidePanelWidth)}px`,
        maxWidth: theme.custom.layout.sidePanelWidth,
        minWidth: 0,
        bgcolor: 'background.paper',
        borderLeft: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        // G-5: below the timeline on a phone.
        [theme.custom.media.mobile]: {
          flexBasis: '100%',
          maxWidth: 'none',
          borderLeft: 0,
          borderTop: 1,
          borderColor: 'divider',
        },
      })}
    >
      {children}
    </Box>
  );
}

/** The epic detail panel (RM-13). Every edit is reported up; the page saves it. */
export function DetailPanel(props: DetailPanelProps) {
  const { item, onCollapse, toggleRef } = props;
  if (!item) {
    return (
      <PanelShell>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box component="span" sx={{ typography: 'body2', color: 'neutral.muted' }}>
            {EMPTY_PANEL_MESSAGE}
          </Box>
          <CollapseButton onCollapse={onCollapse} toggleRef={toggleRef} />
        </Box>
      </PanelShell>
    );
  }
  // Keyed so that switching epics resets drafts and remounts uncontrolled fields.
  return <ItemDetails key={item.id} {...props} item={item} />;
}

function ItemDetails({
  item,
  statuses,
  lanes,
  spanLabel,
  jiraUrl,
  syncedLabel,
  reloads,
  onTitleChange,
  onFieldChange,
  onNotesChange,
  onUnschedule,
  onCollapse,
  toggleRef,
}: DetailPanelProps & { item: RoadmapItem }) {
  const theme = useTheme();
  const [titleMissing, setTitleMissing] = useState(false);
  // What the user is typing into a date field, kept until the field loses focus. The field must
  // not read straight from the query cache while typing: the cache tells React about a save a
  // tick later, React briefly restores the old value, and Chromium's date field then restarts
  // its segment entry (typing 2026 gave 0006). After blur the field shows the saved date again.
  const [dateDraft, setDateDraft] = useState<{ field: DateField; value: string } | null>(null);
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const dateError =
    dateDraft !== null && isOutOfOrder(item, dateDraft.field, dateDraft.value)
      ? DATE_ORDER_MESSAGE
      : null;

  const changeDate = (field: DateField, value: string) => {
    setDateDraft({ field, value });
    if (!isFinishedDate(value) || isOutOfOrder(item, field, value)) return;
    onFieldChange(field, value);
  };

  const dateValue = (field: DateField) =>
    dateDraft?.field === field ? dateDraft.value : (item[field] ?? '');
  const { total, done, inProgress } = item.issues;
  const stories = item.stories ?? [];
  const shownStories = storiesExpanded ? stories : stories.slice(0, VISIBLE_STORIES);
  const statusById = new Map(statuses.map((status) => [status.id, status]));

  const dateField = (field: DateField, label: string) => (
    <TextField
      type="date"
      size="small"
      label={label}
      value={dateValue(field)}
      error={dateError !== null && dateDraft?.field === field}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { min: MILESTONE_DATE_MIN, max: MILESTONE_DATE_MAX },
      }}
      onChange={(event) => {
        changeDate(field, event.target.value);
      }}
      // An unfinished or invalid date goes back to the saved one when the user leaves the field.
      onBlur={() => {
        setDateDraft(null);
      }}
    />
  );

  const selectField = (
    field: 'statusId' | 'laneId',
    label: string,
    options: { id: string; name: string }[],
  ) => (
    <TextField
      select
      size="small"
      label={label}
      value={item[field]}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
      onChange={(event) => {
        onFieldChange(field, event.target.value);
      }}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </TextField>
  );

  return (
    <PanelShell>
      <Section>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box
            component="span"
            sx={{
              fontFamily: theme.typography.fontFamilyMono,
              typography: 'caption',
              color: 'primary.dark',
            }}
          >
            {item.key} · {item.type}
          </Box>
          <CollapseButton onCollapse={onCollapse} toggleRef={toggleRef} />
        </Box>
        <InputBase
          key={reloads}
          defaultValue={item.title}
          error={titleMissing}
          inputProps={{ 'aria-label': 'Epic title', 'aria-invalid': titleMissing }}
          onChange={(event) => {
            const value = event.target.value;
            const blank = value.trim() === '';
            setTitleMissing(blank);
            if (!blank) onTitleChange(value);
          }}
          sx={{
            typography: 'subtitle1',
            mx: -0.75,
            px: 0.75,
            borderRadius: 1,
            '&:hover, &.Mui-focused': { bgcolor: 'neutral.hover' },
          }}
        />
        {titleMissing ? (
          <Box component="span" role="alert" sx={{ typography: 'caption', color: 'error.main' }}>
            {TITLE_REQUIRED_MESSAGE}
          </Box>
        ) : null}
        {jiraUrl ? (
          <Link
            href={jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            sx={{ typography: 'caption', alignSelf: 'flex-start' }}
          >
            Open in Jira ↗
          </Link>
        ) : null}
      </Section>
      <Section grid>
        {selectField('statusId', 'Status', statuses)}
        {selectField('laneId', 'Team', lanes)}
        {dateField('start', 'Start')}
        {dateField('end', 'End')}
        {dateError ? (
          <Box
            component="span"
            role="alert"
            sx={{ gridColumn: '1 / -1', typography: 'caption', color: 'error.main' }}
          >
            {dateError}
          </Box>
        ) : null}
        <Box
          component="span"
          sx={{ gridColumn: '1 / -1', typography: 'caption', color: 'neutral.muted' }}
        >
          {spanLabel}
        </Box>
      </Section>
      <Section>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', typography: 'caption' }}>
          <Box component="span" sx={{ color: 'neutral.muted' }}>
            {total === 0
              ? 'No Jira issues — progress set manually'
              : `Progress from ${String(total)} Jira issues`}
          </Box>
          <Box component="b" sx={{ fontWeight: 'fontWeightMedium' }}>
            {item.progress}%
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={item.progress}
          aria-label="Progress"
          sx={{
            height: PROGRESS_BAR_HEIGHT,
            borderRadius: PROGRESS_BAR_HEIGHT / 2,
            bgcolor: 'neutral.progressTrack',
          }}
        />
        {total > 0 ? (
          <Box sx={{ display: 'flex', gap: 1.5, typography: 'caption', color: 'text.secondary' }}>
            <span>{done} done</span>
            <span>{inProgress} in progress</span>
            <span>{total - done - inProgress} to do</span>
          </Box>
        ) : null}
        {stories.length > 0 ? (
          <Box sx={{ mt: 0.75 }}>
            <Box component="span" sx={{ typography: 'overline', color: 'neutral.muted' }}>
              Stories
            </Box>
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {shownStories.map((story) => (
                <Box
                  component="li"
                  key={story.key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.75,
                    typography: 'caption',
                    borderBottom: 1,
                    borderColor: 'neutral.hover',
                  }}
                >
                  <Box
                    component="span"
                    aria-label={statusById.get(story.statusId)?.name ?? story.statusId}
                    role="img"
                    sx={{
                      width: STORY_DOT,
                      height: STORY_DOT,
                      borderRadius: '50%',
                      flex: 'none',
                      bgcolor: statusColor(statusById.get(story.statusId), theme.palette),
                    }}
                  />
                  <Box
                    component="span"
                    sx={{
                      flex: 'none',
                      fontFamily: theme.typography.fontFamilyMono,
                      color: 'primary.dark',
                    }}
                  >
                    {story.key}
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {story.title}
                  </Box>
                </Box>
              ))}
            </Box>
            {stories.length > shownStories.length ? (
              <Link
                component="button"
                type="button"
                underline="hover"
                aria-expanded={false}
                onClick={() => {
                  setStoriesExpanded(true);
                }}
                sx={{ typography: 'caption', pt: 0.75 }}
              >
                + {stories.length - shownStories.length} more
              </Link>
            ) : null}
          </Box>
        ) : null}
      </Section>
      <Box sx={{ p: 2 }}>
        <TextField
          key={reloads}
          label={NOTES_LABEL}
          multiline
          minRows={NOTES_ROWS}
          fullWidth
          size="small"
          defaultValue={item.notes ?? ''}
          slotProps={{ inputLabel: { shrink: true } }}
          onChange={(event) => {
            onNotesChange(event.target.value);
          }}
        />
      </Box>
      <Box
        sx={{
          mt: 'auto',
          px: 2,
          py: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Button variant="text" onClick={onUnschedule}>
          Unschedule
        </Button>
        <Box component="span" sx={{ typography: 'caption', color: 'neutral.muted' }}>
          {syncedLabel}
        </Box>
      </Box>
    </PanelShell>
  );
}
