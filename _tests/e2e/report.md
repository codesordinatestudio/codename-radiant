# E2E Test Execution Report

**Execution Time:** 6/30/2026, 5:37:49 PM
**Total:** 19 | **Passed:** 19 | **Failed:** 0

| Status | Suite | Test |
|---|---|---|
| ✅ PASS | Authentication Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should Register a new user |
| ✅ PASS | Authentication Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should Login successfully and return JWT |
| ✅ PASS | Authentication Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should trigger Forgot Password flow and catch email in Mailpit |
| ✅ PASS | Authentication Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should Reset Password securely |
| ✅ PASS | Authentication Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should Verify Login with new password (and reject old) |
| ✅ PASS | CRUD &amp;amp; Relationship Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should Create a Task tied to the User |
| ✅ PASS | CRUD &amp;amp; Relationship Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should Read the Task via the collection (filtering by relationship) |
| ✅ PASS | CRUD &amp;amp; Relationship Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should Update (Patch) the Task to completed |
| ✅ PASS | Realtime / Durable Streams Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should reject SSE stream access without token (Security) |
| ✅ PASS | Realtime / Durable Streams Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should accept SSE stream access with valid token |
| ✅ PASS | Realtime / Durable Streams Layer &amp;gt; E2E: Comprehensive Todo Application Lifecycle | Should Delete the Task securely |
| ✅ PASS | E2E: Email Flow (Forgot / Reset Password) | Should trigger email dispatch on /forgot-password |
| ✅ PASS | E2E: Email Flow (Forgot / Reset Password) | Should reset password using the token sent in the email |
| ✅ PASS | Dev Watcher E2E | watches for file changes and rebuilds |
| ✅ PASS | Dev Watcher E2E | debounces rapid rapid file change events to avoid build race conditions |
| ✅ PASS | E2E CLI Tests | successfully builds a valid radiant project |
| ✅ PASS | E2E CLI Tests | successfully builds a project with global config and env manipulators |
| ✅ PASS | E2E CLI Tests | fails and exits with code 1 for syntax errors |
| ✅ PASS | E2E CLI Tests | fails and exits with code 1 for semantic errors |
