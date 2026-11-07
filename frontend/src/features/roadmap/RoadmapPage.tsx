import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { useAutosave } from '../../api/useAutosave';
import { useRoadmap, type RoadmapRead } from '../../api/useRoadmap';
import { PageContainer } from '../../components/PageContainer';
import { PageHeading } from '../../components/PageHeading';

const NOT_FOUND_STATUS = 404;
const NAME_MAX_LENGTH = 200;
const NAME_FIELD_MAX_WIDTH = 480;

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

  return <RoadmapPlaceholder roadmap={roadmap.data} />;
}

/** ASSUMPTION: a stand-in until the M3 editor; its name field exercises autosave (G-2). */
function RoadmapPlaceholder({ roadmap }: { roadmap: RoadmapRead }) {
  const autosave = useAutosave('roadmap', roadmap.id);
  const [nameMissing, setNameMissing] = useState(false);

  return (
    <PageContainer>
      <PageHeading
        title={roadmap.document.name}
        lede="The roadmap editor arrives in a later milestone."
      />
      <TextField
        // Uncontrolled so typing never fights the cache; remount when the server's copy replaces ours.
        key={autosave.reloads}
        label="Roadmap name"
        defaultValue={roadmap.document.name}
        error={nameMissing}
        helperText={nameMissing ? 'Enter a name' : undefined}
        slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
        onChange={(event) => {
          const value = event.target.value;
          const isBlank = value.trim() === '';
          setNameMissing(isBlank);
          if (!isBlank) autosave.save([{ op: 'set', path: '/name', value }], 'text');
        }}
        sx={{ maxWidth: NAME_FIELD_MAX_WIDTH }}
      />
    </PageContainer>
  );
}
