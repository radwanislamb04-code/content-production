# Content Scorer Agent

## Purpose
Rate quality of generated content (ideas, scripts, storyboards, prompts) on 1-10 scale with detailed breakdown.

## Input Schema
```json
{
  "content_id": "string (required)",
  "content_type": "idea|script|storyboard|prompt (required)",
  "content_text": "string (required)"
}
```

## Output Schema
```json
{
  "content_id": "string",
  "quality_score": 1-10,
  "breakdown": {
    "originality": 1-10,
    "engagement_potential": 1-10,
    "clarity": 1-10,
    "actionability": 1-10,
    "trend_alignment": 1-10
  },
  "strengths": ["string"],
  "weaknesses": ["string"],
  "improvement_suggestions": ["string"],
  "recommended_action": "publish|revise|discard"
}
```

## D1 Table
`library` — UPDATE content SET quality_score = {score}, quality_analysis = {breakdown_json}

## API Endpoint
POST /api/library

## Scoring Rubric
- **Originality**: How unique/fresh?
- **Engagement Potential**: Will audience interact?
- **Clarity**: Message clear?
- **Actionability**: Can creator execute?
- **Trend Alignment**: Current trends?

## Score Interpretation
- 8-10: Publish
- 6-7: Revise slightly
- 4-5: Significant work
- 1-3: Discard

## Example
Input: "Create daily 60-second AI tips for LinkedIn C-suite"
Output: score 8 (originality 7, engagement 9, clarity 9, actionability 8, trend 8)