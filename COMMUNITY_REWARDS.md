# Daily rewards and community jar templates

## Rules

- Saving a newly logged expense dated **today in Vietnam (Asia/Ho_Chi_Minh)** automatically grants 20 draw points, once per account/day. No confirmation is needed. Income, transfers, past/future dates and unrelated edits do not qualify. Changing an entry into an expense or correcting its date to today counts as logging today.
- A creator earns 20 points for each distinct **(template, adopting account)**, after adoption is saved successfully. Self-use and repeat use never grant points. Each different template is counted separately.
- Bonuses are spendable character points, not financial management scores or leaderboard scores. Existing inventory, spent points and Admin revocations are preserved.
- Confirmation of real-life spending completeness is neither required nor claimed. Unique accounts are not proof of unique humans; preventing multi-account farming would require an additional identity/anti-abuse policy.

## Usage

Financial Jars → Choose an allocation plan → Community jar templates. Explore published designs or create a template with a public alias, name, description and up to 20 jars. Allocation must total 100%, with at most two decimal places. Creators can unpublish their templates.

Only jar codes/names/percentages/colors/descriptions and the chosen public alias are shared. Bank details, balances, income, transactions, email and private owner IDs are never included in public responses. Text typed into public names/descriptions is public: users must not include personal data there.

Applying a design preserves unspent money, archived jars and transaction history. The previous private configuration is saved for restoring later. Bank links come only from the adopter's own configuration, never from the author; newly created jars may need bank setup.

## Backend guarantees

Authenticated cookie/JWT transport is used by both web and mobile. Points cannot be submitted through finance data or profile patches. Unique PostgreSQL reward/adoption ledgers, server-selected amounts and deterministic owner locks handle retries and concurrency. Finance revision checking, plan application and creator credit commit atomically. Identical re-publication keeps the original template ID and adoption history.

The client flushes pending saves before adoption, pauses stale writes during adoption/reload, and uses a stable action request ID. If a response is lost or the reload fails, use **Reload data**; old local state cannot overwrite the server's newly applied plan.

## Verification

Focused unit/route tests, isolated PostgreSQL concurrency/rollback tests and intercepted browser tests cover these rules. Isolated test schemas contain synthetic accounts/finances and are removed after execution; no production account balances or points are changed by testing.
