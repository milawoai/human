# Hippocampus Memory Store V1

## Scope
- SQLite (`~/.ai_secretary/sqlite/memory.db`) + FTS5 (`memory_fts`)
- Markdown parse/chunk/search
- Obsidian vault incremental reindex (`mtime + content_hash`)
- Neural topics exposed via `brain.hippocampus.memory.*`

## Config
Set in `~/.ai_secretary/config.json` under `memory`:
- `dbPath`
- `obsidianVaultPath`
- `ignoreDirs`
- `includeExts`
- `chunk.minChars/maxChars/overlapChars`

## Reindex
Neural topic:
- `brain.hippocampus.memory.reindex`

Return stats:
- `scanned`
- `created`
- `updated`
- `skipped`
- `failed`
- `durationMs`
- `failedSources`

## Search
Neural topic:
- `brain.hippocampus.memory.search`

Current implementation uses FTS `MATCH` and returns a stable snippet from `substr(content, 1, 180)`.

## Verification
- `yarn workspace backend verify:memory-smoke`
- `yarn workspace backend typecheck`

## Operational Notes
- Reindex logs summary line in `IngestService`.
- Failed documents are recorded in `failedSources` for retry diagnostics.
- `brain.profiles` can be empty for memory-only local verification.
