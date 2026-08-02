# Activity Logger Agent

## Purpose
Centralized logging for all agent actions. Every agent calls this after completing work.

## Input
```json
{
  "module": "string (agent name, e.g. content-scorer)",
  "action": "string (e.g. generated_idea, scored_content, sent_message)",
  "detail": "string (result summary, can be JSON stringified)"
}
```

## Output
```json
{
  "success": true,
  "id": "uuid"
}
```

## D1 Table
`activity` — id, module, action, detail, created_at

## API Endpoint
POST /api/activity
```json
{
  "id": "{uuid}",
  "module": "{module}",
  "action": "{action}",
  "detail": "{detail}",
  "created_at": "{timestamp}"
}
```

## Claude Task
1. Receive module + action + detail
2. Generate UUID
3. POST to /api/activity
4. Confirm insert success

## Error Handling
- If module/action missing: return 400
- If D1 write fails: return 500

## Example
Input: module="content-scorer", action="scored_content", detail="idea_001 scored 8"
Output: {success: true, id: "abc-123"}