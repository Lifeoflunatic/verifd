# verifd — Claude Brief

Core: Out-of-band verify (SMS/WA link or 10–12s voice ping) → temporary vPass (30m/24h/30d) → next call rings like a contact.
Constraints: existing number; privacy-first; near-zero COGS.
iOS: NO auto-messaging; Call Directory labels; temp contacts only for 30-day vPass; Shortcut/Live Voicemail for 15–30m; BG purge + deny-after-expiry fallback.
Android: CallScreeningService + post-call sheet; optional default-SMS "Power Mode"; dual-SIM aware.
Backend: Fastify TS — /verify/start, /verify/submit, /pass/check; SQLite dev → Postgres; rate limits; expiry sweeper.
Web-verify: 6-sec form (Name, Reason, optional 3-sec voice).
Voice Ping: rare, explicitly consented, business-hours default.
Workflow: HANDON→HANDOFF ritual; update RELAY.md; produce `---HANDOFF---`.