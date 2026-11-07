---
name: jira-field-mapping
description: How Product Studio reads Jira CSV/JSON/XML exports and maps Jira columns to roadmap fields — detection order, aliases, value sniffing, repeated columns, status mapping, templates and roll-up. Use when building or changing the importer, the Map Fields screen, re-sync, or mapping templates.
---

# Jira field mapping

Requirements: `IMP-1`–`IMP-12`, `RM-15`. Fixtures: `docs/fixtures/jira/`. Alias table: [references/aliases.md](references/aliases.md).

## 1. Read the file (backend `app/importers/jira/`)

| Format | Detect | Columns come from |
|---|---|---|
| CSV | `.csv`/`.txt` or the first line contains `Issue key` / `Summary` | The header row. Strip the BOM; sniff `,` or `;` delimiters with `csv.Sniffer` limited to these two |
| JSON | Top-level `issues[]` (REST search) | `fields.*` keys. If `names` (from `expand=names`) is present, map `customfield_10016` → "Story Points" and so on; otherwise use the id |
| XML | `<rss><channel><item>` (Jira XML view) | Child element names plus `<customfield><customfieldname>`. Parse with **defusedxml** |

Return `columns: [{name, fieldId?, samples: first 5 non-empty values, fill: fraction non-empty}]`, `rowCount` and distinct `statuses`.

## 2. Normalise each column name
Lower-case it, trim it, and collapse whitespace. Strip a `Custom field (…)` wrapper, so `Custom field (Start date)` becomes `start date`. Strip a trailing `[...]`.

## 3. Match, most certain first. Each roadmap field is used at most once
1. **Saved template.** If the template has an entry for this exact column name *or* custom-field id, use it (`confidence: "template"`).
2. **Standard Jira names** (exact): `issue key`, `summary`, `issue type`, `status`, `sprint`, `fix versions`/`fix version/s`, `parent`, `parent id`, `epic link`, `labels`, `components`, `due date`. Confidence `exact`.
3. **Aliases** from [references/aliases.md](references/aliases.md), using contains-matching on the normalised name. Confidence `alias`.
4. **Value sniffing**, only for still-unmapped columns with `fill ≥ 0.3`. Confidence `sniffed`, which the UI highlights for confirmation.
   - `^[A-Z][A-Z0-9]+-\d+$` in 80% or more of samples: **Key**, or **Epic** if Key is already taken.
   - ISO or Jira dates (`2026-11-16`, `16/Nov/26 9:00 AM`) in 80% or more: **Start**, then **End**. Pick the earlier-median column as Start.
   - `Sprint 24`, `PAY Sprint 24`, `\bS\d+\b`: **Sprint**.
   - Integers or halves `0–100`, mostly ≤ 40: **Points**.
5. Anything else that looks relevant (fill ≥ 0.5, short values) is shown unmapped with **Choose a field…**. Everything else is counted in "+N other columns ignored".

**Epic Link vs Parent.** Accept both as **Epic**, and prefer `Parent` when both have values. Team-managed and newer projects use Parent.

**Team.** There is no standard field. Candidates, in order: a column named `team`, the Atlassian Team field (`customfield_*` named "Team"), `components`, then `labels`. If you sniff it from Components or Labels, mark it `sniffed`.

## 4. Repeated columns (`IMP-6`)
Jira repeats a column for each value of a multi-value field (`Sprint, Sprint, Sprint`). Group columns with the same normalised name:
- **Sprint:** keep the last non-empty value per row, the most recent sprint. Keep the full list in `item.sprints` for the tooltip.
- **Labels, Components, Fix versions:** join them into a list.

## 5. Status mapping (`IMP-7`)
Defaults:

| Jira status | Roadmap status |
|---|---|
| To Do, Open, Backlog, Selected for Development | Not started |
| In Progress, In Review, In QA, Code Review | In progress |
| Blocked, Impeded, On Hold | At risk |
| Done, Closed, Resolved, Released | Done |

Unknown statuses default to Not started, and the user can remap them. Store the result as `statuses[].jiraStatuses`.

## 6. Build items (`IMP-8`)
- Items are rows whose Type is Epic, plus stories whose **Epic** points at an epic key. Stories roll up into their epic:
  - `start = min(story.start)` and `end = max(story.end)`;
  - `issues.total/done/inProgress` are counted from the story statuses;
  - `progress = round(100 * (done + 0.5 * inProgress) / total)`.
- If an item has no dates and "use sprint dates" is on, take the sprint's dates from the PI cadence by sprint name (`S3`, `Sprint 24` → the cadence lookup), or else from the `Sprint` value's own start/end if the export has them.
- Items without dates go to the Unscheduled tray. Items without a team go to an **Unassigned** lane.
- Warnings are counted, e.g. "9 issues have no dates → Unscheduled", "3 issues have no team → Unassigned lane", and `"<Column>" isn't mapped yet`.

## 7. Templates (`IMP-9`)
Save `{columnName or fieldId: field}` and the status map. Apply the template first on the next import. "Update mapping template" overwrites only the entries the user changed.

## 8. Re-sync (`RM-15`)
Map the new file with the roadmap's template, match items by **key**, then diff `title`, `start`, `end`, `status`, `progress`, `issues`, and the new or removed keys. Never overwrite `notes`, milestones, lanes the user renamed, or fields the user edited after import (track an `editedFields` set per item).

## Gotchas
- CSV exports from Jira Cloud can exceed 200 columns. Always stream them and never load them into pandas.
- Dates may be localised (`06/Nov/26`). Parse with `dateutil` with `dayfirst` detection from samples, and store ISO dates.
- Excel saves CSV as cp1252. Try utf-8-sig first, then cp1252, and report which one you used.
