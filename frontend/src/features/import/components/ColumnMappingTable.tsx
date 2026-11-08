import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import { alpha } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import type { ImportColumn, RoadmapField } from '../../../api/useImports';
import { ROADMAP_FIELD_LABELS, ROADMAP_FIELDS } from '../../../lib/importMapping/fieldLabels';
import { mappingStats, type ColumnFields } from '../../../lib/importMapping/mapping';

interface ColumnMappingTableProps {
  /** The session's listed columns, in file order. */
  columns: readonly ImportColumn[];
  /** The draft's column id → field map. */
  fields: ColumnFields;
  /** How many other columns the server set aside (`session.ignoredColumns.length`). */
  ignoredCount: number;
  onChange: (columnId: string, field: RoadmapField) => void;
}

// Prototype `table.map`: wide enough that the three columns never crush on a phone.
const TABLE_MIN_WIDTH = 520;
const FIELD_COLUMN_WIDTH = 220;
const BADGE_RADIUS = 12;
const BADGE_TINT_OPACITY = 0.1;
// The "Choose a field…" placeholder has no field, so it needs a value no field uses.
const UNMAPPED_VALUE = '';

function isRoadmapField(value: string): value is RoadmapField {
  return (ROADMAP_FIELDS as readonly string[]).includes(value);
}

/** IMP-4/IMP-5: each listed Jira column, a sample value, and the roadmap field it feeds. */
export function ColumnMappingTable({
  columns,
  fields,
  ignoredCount,
  onChange,
}: ColumnMappingTableProps) {
  const headingId = useId();
  const { mapped, total } = mappingStats(columns, fields);
  const complete = mapped === total;

  return (
    <Box component="section" aria-labelledby={headingId}>
      <Box
        sx={{
          px: 2,
          py: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography id={headingId} variant="subtitle2" component="h2">
          Map Jira columns to roadmap fields
        </Typography>
        <Typography
          variant="caption"
          role="status"
          sx={(theme) => ({
            fontWeight: 'fontWeightMedium',
            px: 1.25,
            py: 0.5,
            borderRadius: `${String(BADGE_RADIUS)}px`,
            ...(complete
              ? {
                  color: 'success.main',
                  bgcolor: alpha(theme.palette.success.main, BADGE_TINT_OPACITY),
                }
              : { color: 'neutral.warningText', bgcolor: 'neutral.warningTint' }),
          })}
        >
          Auto-mapped {mapped} of {total}
        </Typography>
      </Box>
      <TableContainer>
        <Table size="small" sx={{ minWidth: TABLE_MIN_WIDTH }}>
          <TableHead>
            <TableRow>
              <HeaderCell>Jira column</HeaderCell>
              <HeaderCell>Sample value</HeaderCell>
              <HeaderCell width={FIELD_COLUMN_WIDTH}>Roadmap field</HeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {columns.map((column) => (
              <ColumnRow
                key={column.id}
                column={column}
                field={fields[column.id]}
                onChange={onChange}
              />
            ))}
            {ignoredCount > 0 && (
              <TableRow>
                <TableCell colSpan={3} sx={{ px: 2, color: 'neutral.muted' }}>
                  <Typography variant="caption">
                    + {ignoredCount} other columns aren't needed and will be ignored
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function HeaderCell({ children, width }: { children: string; width?: number }) {
  return (
    <TableCell
      sx={{
        px: 2,
        py: 1.25,
        width,
        color: 'neutral.muted',
        typography: 'caption',
        fontWeight: 'fontWeightMedium',
      }}
    >
      {children}
    </TableCell>
  );
}

interface ColumnRowProps {
  column: ImportColumn;
  field: RoadmapField | undefined;
  onChange: (columnId: string, field: RoadmapField) => void;
}

function ColumnRow({ column, field, onChange }: ColumnRowProps) {
  const sniffed = column.confidence === 'sniffed';
  const unmapped = field === undefined;
  const sample = column.samples[0] ?? '';

  return (
    <TableRow
      data-confidence={column.confidence ?? 'none'}
      sx={sniffed ? { bgcolor: 'neutral.noticeTint' } : undefined}
    >
      <TableCell sx={{ px: 2, py: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium' }}>
          {column.label}
        </Typography>
        {sniffed && (
          <Typography variant="caption" component="div" sx={{ color: 'neutral.warningText' }}>
            Check this
          </Typography>
        )}
        {column.note && (
          <Typography variant="caption" component="div" sx={{ color: 'neutral.muted' }}>
            {column.note}
          </Typography>
        )}
      </TableCell>
      <TableCell
        sx={{
          px: 2,
          py: 0.75,
          color: 'neutral.muted',
          // After `typography`, which would otherwise reset the font family.
          typography: 'caption',
          fontFamily: 'fontFamilyMono',
          overflowWrap: 'anywhere',
        }}
      >
        {sample}
      </TableCell>
      <TableCell sx={{ px: 2, py: 0.75 }}>
        <Select
          native
          size="small"
          fullWidth
          value={field ?? UNMAPPED_VALUE}
          onChange={(event) => {
            const value = event.target.value;
            if (isRoadmapField(value)) onChange(column.id, value);
          }}
          inputProps={{ 'aria-label': `Roadmap field for ${column.label}` }}
          sx={
            unmapped
              ? (theme) => ({
                  color: 'neutral.warningText',
                  bgcolor: 'neutral.warningTint',
                  '& .MuiOutlinedInput-notchedOutline, &:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: theme.palette.warning.main,
                    borderWidth: 2,
                  },
                })
              : undefined
          }
        >
          {unmapped && (
            <option value={UNMAPPED_VALUE} disabled>
              Choose a field…
            </option>
          )}
          {ROADMAP_FIELDS.map((option) => (
            <option key={option} value={option}>
              {ROADMAP_FIELD_LABELS[option]}
            </option>
          ))}
        </Select>
      </TableCell>
    </TableRow>
  );
}
