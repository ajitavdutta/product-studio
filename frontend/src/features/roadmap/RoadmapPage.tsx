import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import tokens from '../../../../shared/design-tokens.json';
import { ApiError } from '../../api/client';
import { useAutosave } from '../../api/useAutosave';
import { useRoadmap, type RoadmapRead } from '../../api/useRoadmap';
import { useSnackbar } from '../../app/SnackbarProvider';
import { PageContainer } from '../../components/PageContainer';
import { PageHeading } from '../../components/PageHeading';
import { nextSprint, scheduleOps } from '../../lib/roadmap/schedule';
import { sourceChipLabel } from '../../lib/roadmap/sourceLabel';
import {
  atRisk,
  currentSprintSummary,
  issuesDonePercent,
  nextMilestone,
  unscheduled,
} from '../../lib/roadmap/summary';
import {
  defaultRange,
  programIncrements,
  sprintColumnWidth,
  timelineWidth,
  todayIso,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../../lib/timeline';
import { Legend } from './components/Legend';
import { MilestonesRow } from './components/MilestonesRow';
import { RoadmapToolbar } from './components/RoadmapToolbar';
import { SummaryCards } from './components/SummaryCards';
import { Timeline } from './components/Timeline';
import { TimelineHeader } from './components/TimelineHeader';
import { TimelineOverlays } from './components/TimelineOverlays';
import { TimelineRows } from './components/TimelineRows';
import { TRAY_ITEM_MIME, UnscheduledTray } from './components/UnscheduledTray';
import { selectItem } from './selectItem';
import { useRoadmapEditor } from './state';
import { ManagePisAction } from './ManagePisAction';
import { RoadmapDetail } from './RoadmapDetail';
import { RoadmapFileActions } from './RoadmapFileActions';
import { RoadmapResync } from './RoadmapResync';
import { useMilestonesEditor } from './useMilestonesEditor';
import { useTimelineZoom } from './useTimelineZoom';

const NOT_FOUND_STATUS = 404;
const NAME_FIELD_MAX_WIDTH = 480;
const LABEL_COLUMN_WIDTH = tokens.timeline.labelColumnWidth;
/** Read by screen readers, not drawn. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  // Strings: MUI reads a bare 1 as 100%.
  width: '1px',
  height: '1px',
  m: '-1px',
  p: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
const NO_NEXT_SPRINT_MESSAGE = 'Add a PI in Manage PIs to schedule this item';

export function RoadmapPage() {
  // The route always supplies :id; an empty id simply 404s.
  const { id = '' } = useParams();
  const roadmap = useRoadmap(id);

  if (roadmap.isPending) {
    return (
      <PageContainer>
        <Box aria-busy="true" aria-label="Loading the roadmap">
          <Skeleton variant="text" width="40%" height={40} />
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="rounded" height={56} sx={{ mt: 2, maxWidth: NAME_FIELD_MAX_WIDTH }} />
        </Box>
      </PageContainer>
    );
  }

  if (roadmap.isError) {
    if (roadmap.error instanceof ApiError && roadmap.error.status === NOT_FOUND_STATUS) {
      return (
        <PageContainer>
          <PageHeading
            title="We couldn't find that roadmap."
            lede="It may have been deleted. Import a Jira export to start a new one."
          />
          <Box>
            <Button variant="contained" component={RouterLink} to="/import">
              Import from Jira
            </Button>
          </Box>
        </PageContainer>
      );
    }
    return (
      <PageContainer>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void roadmap.refetch()}>
              Retry
            </Button>
          }
        >
          Couldn't load the roadmap.
        </Alert>
      </PageContainer>
    );
  }

  return <RoadmapEditor roadmap={roadmap.data} />;
}

/** The roadmap editor (RM-1–RM-20): toolbar, summary, timeline, tray and legend. */
function RoadmapEditor({ roadmap }: { roadmap: RoadmapRead }) {
  const document = roadmap.document;
  const autosave = useAutosave('roadmap', roadmap.id);
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  // ASSUMPTION 15: today is fixed for the life of the page.
  const [today] = useState(() => todayIso());
  const [resyncOpen, setResyncOpen] = useState(false);

  const view = useRoadmapEditor((state) => state.view);
  const setView = useRoadmapEditor((state) => state.setView);
  const groupBy = useRoadmapEditor((state) => state.groupBy);
  const setGroupBy = useRoadmapEditor((state) => state.setGroupBy);
  const showMilestoneLines = useRoadmapEditor((state) => state.showMilestoneLines);
  const setShowMilestoneLines = useRoadmapEditor((state) => state.setShowMilestoneLines);
  const selectedItemId = useRoadmapEditor((state) => state.selectedItemId);
  const { zoom, containerWidth, stepZoom, resetZoom, fitZoom } = useTimelineZoom(scrollRef);

  const { timeline, items, milestones } = document;
  const pis = useMemo(() => programIncrements(timeline.pis, timeline.sprintLengthDays), [timeline]);
  const range = useMemo(() => defaultRange(view, timeline, items), [view, timeline, items]);
  const trayItems = useMemo(() => unscheduled(items), [items]);
  const colW = sprintColumnWidth(containerWidth, view, zoom, range, timeline.sprintLengthDays);
  const trackWidth = timelineWidth(containerWidth, view, zoom) - LABEL_COLUMN_WIDTH;

  const schedule = useCallback(
    (itemId: string) => {
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) return;
      const sprint = nextSprint(pis, today);
      if (!sprint) {
        snackbar.error(NO_NEXT_SPRINT_MESSAGE);
        return;
      }
      autosave.save(scheduleOps(item, sprint), 'immediate');
      snackbar.notify(`${item.key} scheduled in ${sprint.piName} ${sprint.label}`);
    },
    [items, pis, today, autosave, snackbar],
  );

  const overlayProps = { view, range, pis, today, milestones, showMilestoneLines };
  const milestonesEditor = useMilestonesEditor({
    milestones,
    pis,
    today,
    save: autosave.save,
    notify: snackbar.notify,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* The prototype shows no title; screen-reader users still get the page's heading. */}
      <Box component="h1" sx={VISUALLY_HIDDEN}>
        {document.name}
      </Box>
      <RoadmapToolbar
        sourceLabel={sourceChipLabel(document.source)}
        view={view}
        onViewChange={setView}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        showMilestoneLines={showMilestoneLines}
        onShowMilestoneLinesChange={setShowMilestoneLines}
        zoom={zoom}
        zoomMin={ZOOM_MIN}
        zoomMax={ZOOM_MAX}
        onZoomStep={stepZoom}
        onZoomReset={resetZoom}
        onZoomFit={fitZoom}
        onResync={() => {
          setResyncOpen(true);
        }}
        fileActions={
          <RoadmapFileActions
            roadmap={roadmap}
            saving={autosave.state === 'unsaved'}
            flush={autosave.flush}
          />
        }
        onExport={() => {
          void navigate(
            `/exports?source=roadmap&id=${encodeURIComponent(roadmap.id)}&view=${view}`,
          );
        }}
      />
      <SummaryCards
        issuesDonePercent={issuesDonePercent(items)}
        atRiskTitles={atRisk(items).map((item) => item.title)}
        nextMilestone={nextMilestone(milestones, today)}
        currentSprint={currentSprintSummary(pis, today)}
        unscheduledCount={trayItems.length}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', minWidth: 0 }}>
        <Box
          sx={{
            flex: '999 1 640px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.paper',
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(TRAY_ITEM_MIME)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            const itemId = event.dataTransfer.getData(TRAY_ITEM_MIME);
            if (!itemId) return;
            event.preventDefault();
            // ASSUMPTION 3: a drop schedules into the next sprint, like a click.
            schedule(itemId);
          }}
        >
          <Timeline
            ref={scrollRef}
            view={view}
            zoom={zoom}
            header={
              <TimelineHeader
                view={view}
                range={range}
                pis={pis}
                today={today}
                colW={colW}
                cornerAction={
                  <ManagePisAction
                    timeline={timeline}
                    today={today}
                    onSave={(ops) => {
                      autosave.save(ops, 'immediate');
                    }}
                  />
                }
              />
            }
            milestones={
              <MilestonesRow
                range={range}
                milestones={milestones}
                items={items}
                today={today}
                trackWidth={trackWidth}
                onMilestoneClick={snackbar.notify}
                labelAction={milestonesEditor.labelAction}
                emptyAction={milestonesEditor.emptyAction}
              />
            }
            underlay={<TimelineOverlays layer="grid" {...overlayProps} />}
            overlay={<TimelineOverlays layer="markers" {...overlayProps} />}
          >
            <TimelineRows
              lanes={document.lanes}
              items={items}
              statuses={document.statuses}
              groupBy={groupBy}
              range={range}
              selectedItemId={selectedItemId}
              onSelect={selectItem}
            />
          </Timeline>
          <UnscheduledTray items={trayItems} onSchedule={schedule} />
          <Legend statuses={document.statuses} showIpSprint={view !== 'months'} />
        </Box>
        <RoadmapDetail document={document} pis={pis} autosave={autosave} />
      </Box>
      {milestonesEditor.dialog}
      {resyncOpen && (
        <RoadmapResync
          roadmap={roadmap}
          saving={autosave.state === 'unsaved'}
          replace={autosave.replace}
          onClose={() => {
            setResyncOpen(false);
          }}
        />
      )}
    </Box>
  );
}
