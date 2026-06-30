# E2E Test Execution Report

**Execution Time:** 6/30/2026, 5:58:36 PM
**Total:** 25 | **Passed:** 25 | **Failed:** 0

| Status | Suite | Test |
|---|---|---|
| ✅ PASS | Authentication Layer > E2E: Comprehensive Todo Application Lifecycle | Should Register a new user |
| ✅ PASS | Authentication Layer > E2E: Comprehensive Todo Application Lifecycle | Should Login successfully and return JWT |
| ✅ PASS | Authentication Layer > E2E: Comprehensive Todo Application Lifecycle | Should trigger Forgot Password flow and catch email in Mailpit |
| ✅ PASS | Authentication Layer > E2E: Comprehensive Todo Application Lifecycle | Should Reset Password securely |
| ✅ PASS | Authentication Layer > E2E: Comprehensive Todo Application Lifecycle | Should Verify Login with new password (and reject old) |
| ✅ PASS | CRUD &amp; Relationship Layer > E2E: Comprehensive Todo Application Lifecycle | Should Create a Task tied to the User |
| ✅ PASS | CRUD &amp; Relationship Layer > E2E: Comprehensive Todo Application Lifecycle | Should Read the Task via the collection (filtering by relationship) |
| ✅ PASS | CRUD &amp; Relationship Layer > E2E: Comprehensive Todo Application Lifecycle | Should Update (Patch) the Task to completed |
| ✅ PASS | Realtime / Durable Streams Layer > E2E: Comprehensive Todo Application Lifecycle | Should reject SSE stream access without token (Security) |
| ✅ PASS | Realtime / Durable Streams Layer > E2E: Comprehensive Todo Application Lifecycle | Should accept SSE stream access with valid token |
| ✅ PASS | Realtime / Durable Streams Layer > E2E: Comprehensive Todo Application Lifecycle | Should Delete the Task securely |
| ✅ PASS | Custom Endpoints Layer > E2E: Comprehensive Todo Application Lifecycle | Should hit custom endpoint successfully |
| ✅ PASS | Lifecycle Hooks Layer > E2E: Comprehensive Todo Application Lifecycle | Should mutate data via beforeCreate hook |
| ✅ PASS | Access Control Layer > E2E: Comprehensive Todo Application Lifecycle | Should allow update for regular user |
| ✅ PASS | Access Control Layer > E2E: Comprehensive Todo Application Lifecycle | Should register hacker user and deny update |
| ✅ PASS | Background Workers Layer > E2E: Comprehensive Todo Application Lifecycle | Should enqueue and process a job successfully |
| ✅ PASS | Cron Scheduler Layer > E2E: Comprehensive Todo Application Lifecycle | Should trigger cron programmatically via BullMQ |
| ✅ PASS | E2E: Email Flow (Forgot / Reset Password) | Should trigger email dispatch on /forgot-password |
| ✅ PASS | E2E: Email Flow (Forgot / Reset Password) | Should reset password using the token sent in the email |
| ✅ PASS | Dev Watcher E2E | watches for file changes and rebuilds |
| ✅ PASS | Dev Watcher E2E | debounces rapid rapid file change events to avoid build race conditions |
| ✅ PASS | E2E CLI Tests | successfully builds a valid radiant project |
| ✅ PASS | E2E CLI Tests | successfully builds a project with global config and env manipulators |
| ✅ PASS | E2E CLI Tests | fails and exits with code 1 for syntax errors |
| ✅ PASS | E2E CLI Tests | fails and exits with code 1 for semantic errors |
