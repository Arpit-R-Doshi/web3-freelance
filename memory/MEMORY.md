# Nexus Global - Project Memory

## Project: Web3 Freelance Platform (Next.js)
**Stack:** Next.js 16, React 19, TypeScript, Wagmi/RainbowKit, Tailwind v4, Prisma v5 (SQLite), bcryptjs, jsonwebtoken, Framer Motion, Sonner toasts, Recharts, Razorpay, Solidity/Foundry

## Key Architecture
- **Auth:** Dual system — JWT (`nexus_token` in localStorage) for email/password users + wallet-based (legacy `nexus_registry` in localStorage)
- **DB:** Prisma v5 + SQLite at `prisma/dev.db`. Schema: User, ClientProfile, WorkerProfile
- **Blockchain:** Local Anvil at `localhost:8545` (chain 31337), MockUSDT + CrossBorderEscrow contracts
- **KYC:** Didit identity verification (redirects + callback to `/verify-success`)

## File Map
- `src/app/page.tsx` — Home: Register (wallet+KYC) + Login (email/password) tabs
- `src/app/verify-success/page.tsx` — KYC callback → redirects to `/onboarding/{role}`
- `src/app/onboarding/client/page.tsx` — Client onboarding: individual vs organisation
- `src/app/onboarding/worker/page.tsx` — Worker onboarding: sub-role + github/skills
- `src/app/api/auth/me/route.ts` — GET: returns full user profile with clientProfile/workerProfile (requires Bearer JWT)
- `src/app/client/profile/page.tsx` — Client profile page (name, email, wallet, type, orgName, taxNumber, KYC date)
- `src/app/worker/profile/page.tsx` — Worker profile page (name, email, wallet, subRole, githubId, skills, KYC date)
- `src/app/api/auth/login/route.ts` — POST: email+password → JWT
- `src/lib/db.ts` — Prisma client singleton
- `src/lib/auth.ts` — Server-side: hashPassword, verifyPassword, signToken, verifyToken
- `src/lib/auth-client.ts` — Browser-safe: decodeToken (no crypto)
- `src/components/layout/RouteGuard.tsx` — JWT + legacy registry auth checks
- `src/components/layout/TopNav.tsx` — JWT-aware user display, logout clears token
- `prisma/schema.prisma` — User, ClientProfile, WorkerProfile models
- `.env` — DATABASE_URL (SQLite)
- `.env.local` — All secrets incl JWT_SECRET, DIDIT_API_KEY, ADMIN_PRIVATE_KEY

## DB Schema
```
User: id, email(unique), password(hashed), name, walletAddress(unique?), role, kycVerified, kycVerifiedAt
ClientProfile: userId, type(individual|organisation), orgName?, taxNumber?
WorkerProfile: userId, subRole(developer|debugger|ui_ux_designer), githubId?, skills(JSON string)
Project: id, name, description, skills(JSON), repoUrl?, repoName?, status, ownerId, budget?, budgetCurrency?, onChainId?, escrowStatus, tokenReleased(Float default 0)
ProjectWorker: id, projectId, workerId (@@unique pair)
Milestone: id, projectId, title, description, simpleExplanation, status, progress, orderIndex, dependencies(JSON), testCases(JSON), testsPassed, testsTotal, lastCommitMsg?, reviewStatus(default "pending"), tokenRelease(Float?)
ProjectCommit: id, projectId, hash, message, authorId?, aiSummary?, milestoneUpdates(JSON)
Notification: id, userId, projectId?, title, message, type, read
LiquidityPool: id, currency(unique), totalDeposited, totalTokens (tracks per-currency fiat deposits and tokens minted)
```

## AI Project System (Phase 3)
- `src/lib/ai.ts` — Groq llama-3.1-8b-instant: extractSkills, generateMilestones, summarizeCommit + fallbacks. Use /\[[\s\S]*\]/ (not /s flag — tsconfig targets ES2017)
- `src/lib/github.ts` — Octokit: createRepo, addCollaborator, setupWebhook (graceful no-op without token)
- `src/lib/sse-store.ts` — In-memory SSE: subscribe/unsubscribe/broadcast(projectId, event)
- `src/lib/commit-validator.ts` — validateCommit: 22% base increment + keyword scoring; unlocks next milestone
- `src/lib/milestone-layout.ts` — layoutMilestones: topological BFS → React Flow Node[]/Edge[]; MilestoneForLayout type includes reviewStatus, tokenRelease

## Escrow + Payment System (Phase 4)
- **Contract:** `CrossBorderEscrow.sol` — has `releaseMilestonePayment(projectId, amount)` (partial release) + `releasePayment(projectId)` (full release, remaining only) + `burnAndWithdraw(amount)` (burn tokens for withdrawal)
- **Multi-currency buy:** `api/razorpay/order` accepts `{ tokens, currency }` (INR/USD/GBP/EUR), always charges INR sandboxed. `api/razorpay/verify` accepts `currency` and updates LiquidityPool after mint.
- **Withdraw:** `api/razorpay/withdraw` — called after client burns on-chain, triggers simulated payout, updates LiquidityPool
- **Liquidity pool:** `api/liquidity` GET — returns all 4 currency pool stats
- **Milestone review:** `api/projects/[id]/milestone-review` POST `{ milestoneId, action, tokenRelease }` — on-chain tx done client-side, this updates DB
- **Project complete:** `api/projects/[id]/complete` POST — marks project completed/released; on-chain tx done client-side
- **Balance check in new project:** `client/projects/new` checks wagmi USDT balance, shows warning if `budget > balance`, shows force top-up gate modal when launching with workers and insufficient balance
- **Milestone approve button:** In `MilestoneDetailPanel` — visible for client role when milestone is `completed` and `reviewStatus !== 'approved'`. Calls `onApproveRequest(milestoneId)` in parent.
- **Project detail page (client):** Has milestone approve modal (calls `releaseMilestonePayment` on-chain + updates DB), "Complete Project" button when all milestones approved (calls `releasePayment` + updates DB), `isClient` detection from JWT
- **Token per milestone release:** `budget / totalMilestones` equal distribution
- `src/app/api/ai/skills/route.ts` — POST {description} → {skills[]}
- `src/app/api/projects/route.ts` — GET list + POST create (AI milestones + GitHub repo)
- `src/app/api/projects/[id]/route.ts` — GET full project+milestones+workers+commits
- `src/app/api/projects/[id]/commit/route.ts` — POST process commit → validate → broadcast SSE
- `src/app/api/projects/[id]/stream/route.ts` — GET SSE endpoint (heartbeat 25s)
- `src/app/api/projects/[id]/workers/route.ts` — POST add / DELETE remove worker
- `src/app/api/workers/route.ts` — GET ?skills= (scored match) or ?email= search
- `src/app/api/webhooks/github/route.ts` — GitHub push webhook, HMAC verified
- `src/components/projects/MilestoneNode.tsx` — Custom React Flow node (status glow/color)
- `src/components/projects/MilestoneFlow.tsx` — ReactFlow canvas + SSE subscription; props: onNodeSelect, onCommitReceived, onMilestoneUpdate (wires SSE milestone updates back to parent stats/state)
- `src/components/projects/MilestoneDetailPanel.tsx` — Framer Motion slide-in. InnerProps requires non-null milestone (Required<Props> doesn't unwrap | null)
- `src/components/projects/CommitActivityFeed.tsx` — Animated live commit feed
- `src/components/projects/ProjectCard.tsx` — Project list card
- `src/app/client/projects/page.tsx` — Client project list
- `src/app/client/projects/new/page.tsx` — 3-step project creation wizard
- `src/app/client/projects/[id]/page.tsx` — Full project dashboard with React Flow
- `src/app/worker/projects/page.tsx` — Worker's assigned projects list

## Env Vars (.env.local — all populated)
GROQ_API_KEY, GITHUB_TOKEN, GITHUB_OWNER=devproduce, GITHUB_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL=http://localhost:3000

## Registration Flow
1. `/` → connect wallet → name + role → KYC (Didit or skip in dev)
2. `/verify-success` → attaches walletAddress to `nexus_pending_registration` → `/onboarding/{role}`
3. `/onboarding/client` → individual/org details + email/password → POST /api/auth/register → JWT → `/client`
4. `/onboarding/worker` → subRole → (if dev/debugger: github+skills) → email/password → JWT → `/worker`

## Login Flow
- `/` login tab → email+password → POST /api/auth/login → JWT → redirect to `/{role}`

## Node.js Constraint
- Node 20.12.2 installed (Prisma v7 requires 20.19+, use Prisma v5)

## CRITICAL: Prisma Schema Changes
After ANY schema change (new models or fields):
1. Stop dev server (kills node.exe holding `query_engine-windows.dll.node`)
2. `npx prisma generate` — regenerates the client (without this, `db.project` etc. are `undefined` at runtime even if TypeScript compiles fine)
3. `npx prisma db push` — syncs schema to SQLite
4. Restart dev server
- Use `--skip-generate` ONLY if you need to push schema while dev server is running, then run generate separately after stopping it.

## Conventions
- JWT stored in `localStorage` as `nexus_token`, user object as `nexus_user`
- Client-side JWT decode via `decodeToken()` from `auth-client.ts` — adds base64 padding before `atob()` to prevent Windows parse errors
- Server-side sign/verify via `signToken()`/`verifyToken()` from `auth.ts` (uses jsonwebtoken)
- All protected routes check `nexus_token` first, fall back to legacy `nexus_registry`

## Known Bugs / Patterns
- **RouteGuard:** checks `nexus_token` role; workers are also allowed to visit `/client/projects/[id]` for read-only project view (exception added to `workerViewingProject` check)
- **Do NOT add per-page `if (!token) router.push("/")` checks** in projects list pages — RouteGuard handles auth; per-page redirect causes logout for legacy users. Only use token redirects in pages that make mandatory API calls that require auth (profile, project detail, new project).
- **Wagmi "Connection interrupted while trying to subscribe"** — cosmetic console error from invalid WalletConnect `projectId: 'TEST_ID'` in ProvidersClient.tsx. Does not affect auth or functionality.
- `client/projects/page.tsx` and `worker/projects/page.tsx` — removed `useRouter` import since no navigation needed; show empty state if no token.
