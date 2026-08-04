# Ideator Agent

## Purpose
Generate 5 viral reel content ideas from provided keywords. For each idea, write a complete entry to the D1 library table (type: idea) using the existing POST /api/library route pattern.

## Input
```json
{
  "keywords": ["string", "string"],
  "platform": "instagram|tiktok|linkedin",
  "tone": "professional|casual|humorous|inspirational"
}
```

## Output
```json
{
  "ideas": [
    {
      "id": "idea_{timestamp}_{index}",
      "title": "Hook-style title (max 60 chars)",
      "content": "Full idea description with hook, body, and CTA",
      "type": "idea",
      "status": "draft",
      "content_pillar": "{auto-tagged pillar}",
      "keywords_applied": ["string"],
      "hook": "One-line hook text",
      "body": "2-3 sentence body/structure",
      "cta": "Call to action line",
      "platform": "instagram|tiktok|linkedin"
    }
  ],
  "keywords_received": ["string"],
  "total_generated": 5
}
```

## D1 Table
`library` — INSERT each idea as a separate row: id, type=idea, title, content, status=draft, created_at, updated_at

## API Endpoint
POST /api/library (existing route: library.$type.ts)

## Content Idea Rules

**Generation:**
- Generate exactly 5 unique ideas
- Each idea must use at least 1 of the provided keywords
- Ideas must be tailored to the specified platform
- Tone must match the requested tone
- Avoid repeating the same hook structure across ideas

**Idea Structure (stored in `content` field as JSON string):**
```json
{
  "hook": "First-line hook (should grab attention in 3 seconds)",
  "body": "Shot-by-shot body (2-3 sentences describing what happens)",
  "cta": "Call to action for the end"
}
```

**Title format:**
- Hook-style, max 60 characters
- Must be attention-grabbing, not descriptive

## Content Pillar Auto-Tag
- Keywords map: "productivity" → "productivity", "AI" → "AI tips", "tips" → "AI tips", "behind" → "behind the scenes", "process" → "behind the scenes", "story" → "storytelling", "brand" → "brand building", "growth" → "growth strategy", "tutorial" → "tutorials", "how-to" → "tutorials"
- If no match: content_pillar = "uncategorized"
- Use the idea's full content (hook + body + CTA) for tagging, not just the title

## Uniqueness Rules
- No two ideas should share the same hook opening (e.g., don't start 3 with "What if...")
- Spread across different content pillars when possible
- Vary CTA types (follow, comment, save, share, link in bio)

## Claude Task
1. Receive keywords + platform + tone
2. Generate 5 distinct viral reel ideas
3. For each idea: build title, content (hook+body+cta), auto-tag content_pillar
4. POST each idea to /api/library as type=idea with status=draft
5. LOG generation via activity-logger: module="ideator", action="generated_ideas", detail={count, keywords, pillars}
6. Return full JSON output

## Error Handling
- No keywords provided: return error "keywords array is required"
- Invalid platform: return error "platform must be instagram, tiktok, or linkedin"
- Invalid tone: return error "tone must be professional, casual, humorous, or inspirational"
- API failure: return error with details, do not block output

## Example
Input: {keywords: ["AI", "productivity"], platform: "instagram", tone: "professional"}

Output: 5 ideas like:
- Title: "3 AI Tools That Saved Me 10 Hours/Week"
  Content: {"hook": "...", "body": "...", "cta": "Save this for your next workflow"}
  content_pillar: "AI tips"

- Title: "The AI Workflow Nobody Talks About"
  Content: {"hook": "...", "body": "...", "cta": "Follow for more hidden gems"}
  content_pillar: "AI tips"
