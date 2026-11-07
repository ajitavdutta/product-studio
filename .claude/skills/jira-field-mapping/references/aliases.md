# Roadmap field aliases (normalised, contains-match)

| Roadmap field | Aliases |
|---|---|
| Key | `issue key`, `key`, `issue id` (only if no `issue key`) |
| Title | `summary`, `title`, `name` |
| Type | `issue type`, `issuetype`, `type` |
| Epic | `parent`, `parent id`, `parent key`, `epic link`, `epic` |
| Swimlane / Team | `team`, `squad`, `pod`, `program team` |
| Status | `status` (not `status category`) |
| Sprint | `sprint` |
| Release | `fix version`, `fixversion`, `release` |
| Points | `story point`, `story points`, `estimate`, `sp` (whole word) |
| Start | `start date`, `target start`, `planned start`, `start` |
| End | `due date`, `due`, `target end`, `end date`, `planned end` |
| Tags | `labels`, `label`, `tags` |

Never map these to a field: `created`, `updated`, `resolved`, `last viewed`, `watchers`, `assignee`, `reporter`, `description`, `comment`, `attachment`, `environment`, `votes`, `log work`, `time spent`, `σ …`.
