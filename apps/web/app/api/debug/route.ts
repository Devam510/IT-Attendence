// DELETED — was a temporary debug endpoint used during Neon→Supabase migration.
// Exposed DATABASE_URL hint, NODE_ENV, and ran raw DB queries with NO auth guard.
// Do NOT restore this file. Use Vercel logs / Supabase dashboard for DB debugging.
// 
// If DB connectivity debugging is needed again:
//   1. Add withRole("SADM") guard
//   2. Never expose env var values — only "SET" / "NOT SET"
//   3. Delete immediately after use

export {};
