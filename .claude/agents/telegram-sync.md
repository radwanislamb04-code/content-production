## Two-Way Sync
- User replies to Telegram message → webhook receives reply
- Parse reply: "approve" → status = 'approved', "reject" → status = 'rejected'
- UPDATE D1 telegram_tasks accordingly
- Log to activity table

## Batch Limit
Max 10 tasks per run (Telegram rate limit protection).

## D1 Tables
- `telegram_tasks` — READ (status='pending'), UPDATE (status='sent'/'approved'/'rejected')
- `activity` — INSERT log on each run

## API Endpoint
`POST /api/telegram-cron`

## KV Keys Required
- `telegram_bot_token` — Bot token from @BotFather
- `telegram_chat_id` — Your Telegram chat ID

## Activity Log
```json
{
  "module": "telegram-sync",
  "action": "tasks_sent",
  "detail": "Sent 3 tasks to Telegram at 2026-08-02T06:00:00Z"
}
```

## Error Handling
- Telegram API fails → keep status 'pending', log error to activity
- No pending tasks → log "no tasks" to activity, exit
- Missing KV keys → log error, exit

## Claude Task
1. Read KV for telegram_bot_token + telegram_chat_id
2. Query D1: SELECT * FROM telegram_tasks WHERE status='pending' LIMIT 10
3. For each task: format message → POST to Telegram
4. Update D1 status = 'sent' per successful send
5. Log total sent count to activity table

## Example D1 Query
```sql
SELECT * FROM telegram_tasks WHERE status = 'pending' LIMIT 10;
UPDATE telegram_tasks SET status = 'sent' WHERE id = '{task_id}';
```

## Example Telegram API Call
```json
POST https://api.telegram.org/bot{TOKEN}/sendMessage
{
  "chat_id": "{CHAT_ID}",
  "text": "✅ Review Reels\n📝 Task: {task_text}\n🕐 {timestamp}",
  "parse_mode": "HTML"
}
```

## Rules
- Never send more than 10 messages per run
- Always log success AND failure to activity
- On partial failure: send what succeeded, log what failed
- Retry failed tasks on next cron run automatically