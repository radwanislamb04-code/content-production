# Planner Agent

## Purpose
Generate strategic weekly and monthly content calendar based on content pillars and platforms. Save to D1 workspace table.

## Input
```json
{
  "month": "2026-08",
  "content_pillars": ["productivity", "AI tips", "behind the scenes"],
  "platforms": ["reels", "stories", "carousel"]
}
```

## Output
```json
{
  "month": "2026-08",
  "calendar": [
    {
      "date": "2026-08-05",
      "day": "Monday",
      "content_type": "reel",
      "topic": "20-min planning ritual",
      "platform": "reels",
      "posting_time": "19:00",
      "priority": "high",
      "content_pillar": "productivity",
      "notes": "Hook: What if you could plan your week in 20 minutes?"
    }
  ],
  "weekly_summary": {
    "week_1": {"reels": 3, "stories": 2, "carousels": 2},
    "week_2": {"reels": 3, "stories": 2, "carousels": 2},
    "week_3": {"reels": 3, "stories": 2, "carousels": 2},
    "week_4": {"reels": 3, "stories": 2, "carousels": 2}
  }
}
```

## Rules
- Never schedule 2 reels back to back
- Monday/Wednesday/Friday = high priority (peak engagement days)
- Reels → 7PM posting time
- Stories → 12PM posting time  
- Carousels → 6PM posting time
- Rotate content pillars evenly across week
- Saturday/Sunday = lighter content (stories only)

## D1 Save
Table: `workspace`
Key: `calendar_{month}` (e.g. calendar_2026-08)
Value: full calendar JSON as string

## API Endpoint
POST /api/workspace
```json
{
  "key": "calendar_2026-08",
  "value": "{calendar JSON}",
  "updated_at": 1234567890
}
```

## Trigger
Dashboard → Planner section → "Generate 7-Day Plan" button

## Activity Log
POST /api/activity
```json
{
  "module": "planner",
  "action": "generated_calendar",
  "detail": "Generated 30-day calendar for 2026-08"
}
```

## Claude Task
1. Take month + pillars + platforms as input
2. Generate full calendar day by day
3. Apply rotation rules (no back-to-back reels)
4. Assign optimal posting times per content type
5. Flag Mon/Wed/Fri as high priority
6. Output complete JSON
7. POST to /api/workspace to save
8. LOG to /api/activity