# Library Manager Agent

## Purpose
Central CRUD layer for all library content (idea/script/storyboard/prompt). Wraps existing
/api/library routes with validation, duplicate detection, and content_pillar tagging.

## Input
```json
{
  "action": "create|read|update|delete",
  "type": "idea|script|storyboard|prompt",
  "payload": { }
}
```

## Output
```json
{
  "success": true,
  "action": "create",
  "data": { },
  "warnings": ["string"]
}
```

## D1 Table
`library` — id, type, title, content, quality_score, quality_analysis, status, content_pillar, created_at

## API Endpoint
POST /api/library (existing route: library.$type.ts)
GET /api/library/{type}/{id} (existing route: library.$type.$id.ts)

## CRUD Rules

**Create:**
- Validate type is one of: idea/script/storyboard/prompt
- Check duplicate: query existing titles in same type, if similarity high → add warning
  "Similar content exists: {existing_title}" but still create (don't block)
- Auto-tag content_pillar: infer from text (e.g. contains "productivity" → tag "productivity")
- Insert with status = "draft"

**Read:**
- Filter by type, content_pillar, date range, status
- Sort by created_at desc default

**Update:**
- Allowed fields: quality_score, quality_analysis, status, content_pillar
- status transitions: draft → published, draft → archived, published → archived
- Reject direct draft → archived → published (must go through draft again)

**Delete:**
- Soft-delete only: set status = "archived"
- Never hard-delete rows

## Duplicate Detection Logic
- Compare new title against last 50 entries of same type
- Simple keyword overlap check (not full NLP) — 3+ shared significant words = flag
- Flag as warning, not blocker

## Content Pillar Auto-Tag
- Keywords map: "productivity"→productivity, "AI"/"tips"→AI tips, "behind"/"process"→behind the scenes
- If no match: content_pillar = "uncategorized"

## Claude Task
1. Receive action + type + payload
2. If create: validate → check duplicates → auto-tag → insert
3. If read: build filter query → return results
4. If update: validate allowed fields + status transition → update
5. If delete: set status=archived
6. Log every action via activity-logger (module: "library-manager")

## Error Handling
- Invalid type: 400
- Invalid status transition: 400
- Record not found (update/delete): 404
- D1 failure: 500

## Example
Input: {action: "create", type: "idea", payload: {title: "Daily AI tips for LinkedIn", content: "..."}}
Output: {success: true, action: "create", data: {id: "idea_456", content_pillar: "AI tips"}, warnings: []}