# Fruity Fun Juice Factory — API Documentation (`API_DOCUMENTATION.md`)

## 1. `GET /api/erp?actorId=<user_id>`
Returns the role-filtered ERP state and active user profile.
- For `OWNER`: Full access to all modules, financial ledgers, P&L, and all bookers' GPS routes.
- For `BOOKER`: Automatically filters `dealers`, `orders`, `payments`, `dealer_ledger`, and `shop_visits` to only records assigned to `actor.id` and strips `expenses`.

## 2. `POST /api/erp`
Executes server-side validated, atomic database transactions.
Request body:
```json
{
  "action": "ACTION_NAME",
  "actorId": "user-owner-1",
  "payload": {}
}
```
Supported transactional actions:
- `CREATE_FLAVOUR` / `CREATE_BOTTLE_SIZE` / `CREATE_PRODUCT`
- `CREATE_PRODUCTION_BATCH` / `UPDATE_PRODUCTION_BATCH_STATUS` (Enforces single-execution BOM deduction and FG inventory increment via `inventory_posted` guard)
- `CREATE_RAW_MATERIAL` / `RECORD_RAW_MATERIAL_PURCHASE` / `ADJUST_RAW_MATERIAL_STOCK`
- `ADJUST_FINISHED_GOODS`
- `CREATE_DEALER`
- `CREATE_ORDER` (Enforces `idempotency_key` uniqueness and Booker shop assignment)
- `TRANSITION_ORDER_STATUS` (Reserves stock on `Approved`, deducts stock and posts invoice debit on `Dispatched`)
- `RECORD_PAYMENT` / `RECORD_DEALER_RECEIVABLE_ADJUSTMENT` / `REVERSE_LEDGER_ENTRY`
- `CREATE_EXPENSE` / `APPROVE_OR_REJECT_EXPENSE`
- `REPORT_MACHINE_ISSUE` / `RESOLVE_MACHINE_ISSUE`
- `RECORD_GPS_PING` (Evaluates Haversine distance against assigned shop geofences and auto-logs `GPS_GEOFENCE_DETECTED` or `BOTH_VERIFIED` visits)
- `TOGGLE_USER_ACTIVE` / `TOGGLE_BOOKER_DUTY` / `MARK_NOTIFICATION_READ`

## 3. `POST /api/voice`
Parses natural Roman-Urdu, Urdu, or English voice transcripts into structured `ParsedVoiceTransaction` JSON verified against database entities. Never executes unconfirmed transactions.

## 4. `POST /api/ai-assistant`
Executes grounded Owner BI queries against live database figures using Claude (`@anthropic-ai/sdk`) and deterministic SQL-equivalent aggregations.
