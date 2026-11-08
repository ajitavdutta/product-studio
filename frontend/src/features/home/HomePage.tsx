import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { useDiagrams } from '../../api/useDiagram';
import { useRoadmaps } from '../../api/useRoadmap';
import { PageContainer } from '../../components/PageContainer';
import { PageHeading } from '../../components/PageHeading';
import { RecentDocumentList, type RecentDocument } from '../../components/RecentDocumentList';
import { DeleteDocumentDialog } from './components/DeleteDocumentDialog';
import { HomeTiles } from './components/HomeTiles';
import {
  useDeleteDocument,
  useOpenSavedRoadmap,
  useOpenSwimlanes,
  type DeleteTarget,
  type DocumentKind,
} from './useHome';

// ASSUMPTION (plan): each Home list shows the five most recently updated documents.
const RECENT_LIMIT = 5;
// Prototype `.row > .grow`: the two lists sit side by side until each would be under 420px.
const LIST_FLEX_BASIS = 420;

export function HomePage() {
  const navigate = useNavigate();
  const roadmaps = useRoadmaps();
  const diagrams = useDiagrams();
  const openSavedRoadmap = useOpenSavedRoadmap();
  const swimlanes = useOpenSwimlanes();
  // The target outlives `dialogOpen` so the title keeps its name during the close transition.
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const deletion = useDeleteDocument(dialogOpen ? deleteTarget : null);

  const askToDelete = (kind: DocumentKind) => (item: RecentDocument) => {
    setDeleteTarget({ kind, id: item.id, name: item.name });
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
  };

  return (
    <PageContainer>
      <PageHeading
        title="Welcome back"
        lede="Start a roadmap from a Jira export, reopen a saved one, or draw a workflow."
      />
      <HomeTiles
        onImport={() => void navigate('/import')}
        onRoadmapFile={openSavedRoadmap.open}
        onSwimlanes={swimlanes.open}
        openingRoadmap={openSavedRoadmap.pending}
        openingSwimlanes={swimlanes.pending}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 2.5 }}>
        <Box sx={{ flex: `1 1 ${String(LIST_FLEX_BASIS)}px`, minWidth: 0 }}>
          <RecentDocumentList
            title="Recent roadmaps"
            items={roadmaps.data?.slice(0, RECENT_LIMIT) ?? []}
            loading={roadmaps.isPending}
            error={roadmaps.isError ? "Couldn't load your roadmaps." : null}
            onRetry={() => void roadmaps.refetch()}
            onOpen={(item) => void navigate(`/roadmaps/${item.id}`)}
            onDelete={askToDelete('roadmap')}
            emptyState={
              <EmptyState
                text="No roadmaps yet. Import a Jira export to make one."
                action={
                  <Button variant="contained" component={RouterLink} to="/import">
                    Import from Jira
                  </Button>
                }
              />
            }
          />
        </Box>
        <Box sx={{ flex: `1 1 ${String(LIST_FLEX_BASIS)}px`, minWidth: 0 }}>
          <RecentDocumentList
            title="Swimlane diagrams"
            items={diagrams.data?.slice(0, RECENT_LIMIT) ?? []}
            loading={diagrams.isPending}
            error={diagrams.isError ? "Couldn't load your diagrams." : null}
            onRetry={() => void diagrams.refetch()}
            onOpen={(item) => void navigate(`/diagrams/${item.id}`)}
            onDelete={askToDelete('diagram')}
            emptyState={
              <EmptyState
                text="No diagrams yet."
                action={
                  <Button
                    variant="contained"
                    disabled={swimlanes.pending}
                    onClick={swimlanes.create}
                  >
                    New diagram
                  </Button>
                }
              />
            }
          />
        </Box>
      </Box>
      <DeleteDocumentDialog
        open={dialogOpen}
        name={deleteTarget?.name ?? ''}
        message={deletion.message}
        loading={deletion.loading}
        error={deletion.error}
        onRetry={deletion.retry}
        onConfirm={() => {
          deletion.confirm();
          closeDialog();
        }}
        onClose={closeDialog}
      />
    </PageContainer>
  );
}

function EmptyState({ text, action }: { text: string; action: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5 }}>
      <Typography variant="body2" sx={{ color: 'neutral.muted' }}>
        {text}
      </Typography>
      {action}
    </Box>
  );
}
