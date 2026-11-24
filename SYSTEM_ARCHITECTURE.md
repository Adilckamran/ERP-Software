# Fruity Fun Juice Factory — System Architecture (`SYSTEM_ARCHITECTURE.md`)

## 1. High-Level Overview
The **Fruity Fun Juice Factory Management ERP** connects three operational surfaces to one centralized transactional database:
1. **Owner / Admin Panel (`apps/web`)**: Complete executive BI dashboard, voice-based transaction entry, Claude AI business assistant, dealer ledger & reversal management, expense approval, profit & loss accounting, and live GPS route & shop visit monitoring.
2. **Production Manager Panel (`apps/web` role-scoped)**: Production batch planning and verification, configurable flavours/bottle sizes, BOM recipe calculation, raw material procurement, finished goods stock ledger, and machine maintenance reporting.
3. **Booker Panel & Native Android Application (`apps/android` + Interactive Booker Portal)**: Assigned area and shop management, customer registration, idempotent order creation, payment collection, and native Kotlin Foreground Location Service tracking (`LocationTrackingForegroundService`) during authorized working hours.

## 2. Transactional Data Integrity Guarantees
- **Idempotent Production Verification**: Completing a batch sets `inventory_posted = true` inside an atomic transaction, deducting BOM raw materials and incrementing `verified_production_cartons` in Finished Goods exactly once. Subsequent edits or status updates never double-deduct or double-add stock.
- **Strict Finished Goods Formula**:
  `Opening Stock + Verified Production + Approved Returns - Dispatches - Damage = Closing Stock`
  `Available Stock = Closing Stock - Reserved Stock`
- **Traceable Financial Ledgers**: Financial entries in `dealer_ledger` are never silently overwritten. Corrections generate explicit `REVERSAL_ENTRY` records linked via `reverses_entry_id`.
- **Two-Step Confirmed Voice Transactions**: Spoken commands (e.g., *"Ahmed ko 50 hazar rupay diye"*, *"Ali ko mango juice ke 100 cartons diye"*) are parsed into structured JSON, verified against existing database dealers/products/materials, and presented on a mandatory Owner Confirmation Screen before committing.
