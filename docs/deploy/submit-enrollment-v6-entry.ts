// submit-enrollment 1.3.0 (Phase A: every 1.3.0 capability OFF via website_private.feature_flags).
// Source is pinned to an immutable commit of feature/enrollment-completion in 2hearts25/hearts25 and is bundled at deploy time,
// so this deployment runs byte-for-byte the code that passed the 1.2.1 and 1.3.0 test suites.
// Commit: 85e638270c6783b54e6d2ab0f6d887aec92487bc
// Rollback: redeploy version 5 (source: branch release/november-content, supabase/functions/submit-enrollment).
import "https://raw.githubusercontent.com/2hearts25/hearts25/85e638270c6783b54e6d2ab0f6d887aec92487bc/supabase/functions/submit-enrollment/index.ts";
