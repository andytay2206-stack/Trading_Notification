# Futures Trading Notification System

A notification service that will monitor futures markets according to the owner's trading specifications and deliver alerts to a phone and/or email.

## Current status

Project initialized. Trading rules, data source, supported futures contracts, notification channels, deployment target, and risk controls still need to be defined before implementation.

## Development workflow

- Each coherent feature or extension should receive its own Git commit after relevant checks pass.
- Secrets such as API keys, email credentials, phone numbers, and webhook tokens must never be committed.
- Local Codex continuity records live in `.codex-notes/` and are intentionally excluded from Git.
- User-facing architecture, setup, and operating instructions will be added to tracked documentation as the system develops.

## Safety boundary

The initial system is notification-only. It will not place or manage trades unless that scope is explicitly changed later. Alerts are informational and require independent verification before acting.

