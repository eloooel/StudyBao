# ADR 0005 — Authentication: Google Sign-In, one allow-listed email

- **Status:** **Conditional** — applies only if cloud sync is enabled. [ADR 0006](0006-in-app-notifications-only.md)
  removed the other reason auth existed (authenticating a push backend), so if sync is dropped this
  ADR does not apply and the app needs no auth at all.
- **Date:** 2026-02 (planning; narrowed 2026-09)
- **Supersedes:** decision #6 in the original build guide ("single-user app, no login is fine")

## Context

The original guide recommended two things that cannot both be true:

- **Decision #1:** cloud sync via Firebase (Firestore free tier) so she can move between phone and
  laptop.
- **Decision #6:** "simple single-user app (no login) is fine and simplest."

Firestore security rules need an authenticated identity to scope data to. Without one, the only
options are:

1. **Open rules** — her notes, review history, and study schedule become world-readable and
   world-writable by anyone who learns the project ID.
2. **A shared secret in the client** — not a secret; it ships in the bundle and is visible in
   devtools.
3. **Security by obscurity** — an unguessable project ID. Not a security model.

**Update (2026-09).** There was originally a second, independent reason for auth: the push backend
needed to authenticate its callers. [ADR 0006](0006-in-app-notifications-only.md) removed the backend
entirely, so that reason is gone. What remains is the sync reason only — which means this ADR is
**conditional on cloud sync being wanted at all**. If it is not, skip all of this: no auth, no
Firestore, no rules file.

## Decision

**Firebase Auth with the Google provider, allow-listed to her single email address.**

- Firestore rules are owner-only:
  `allow read, write: if request.auth != null && request.auth.token.email == '<her email>';`
- Rules are tested against the Firebase emulator (allowed user, denied anonymous, denied other
  authenticated user) before any deploy.
- Client config (including `apiKey`) is not treated as a secret — it is not one. **The rules are the
  security boundary.**
- The PWA is additionally `noindex` and unlisted. This is hygiene, not a control.
- Backend endpoints require a Firebase ID token; the token's email is checked against the allow-list.

## Consequences

**Good**

- Cloud sync becomes safe with a five-minute setup and no custom auth code.
- Firestore rules become a one-liner that is easy to review and hard to get wrong.
- Two devices share data through a real identity, so an iOS reinstall (which changes anonymous auth
  UIDs) does not orphan her data. This is why Google Sign-In beats anonymous auth here.

**Bad / cost**

- Requires a Google account for her (she has one; this is a phone-first user in 2026) and a one-time
  sign-in. This is the only additional friction added to the product.
- Ties the app to Google as an identity provider. Acceptable for a single-user personal tool; if she
  ever wants off Google, the migration is an auth-provider change plus a rules change.
- If she ever wants a friend to use it, "one allow-listed email" needs revisiting — an explicit
  `members` collection and a rules change, not an open-rules shortcut.

## Alternatives considered

- **No auth, local-only, no sync (the original guide's spirit).** Simplest and safest, but she studies
  on two devices, so this loses a core feature. Rejected — but note that if sync is ever dropped,
  this ADR becomes moot and should be revisited rather than silently kept.
- **Anonymous auth.** No sign-in friction, but the UID is per-install: an iOS reinstall, a cleared
  browser, or a second device creates a *new* identity, silently orphaning her data. Rejected.
- **Email-link (magic link) auth.** Workable, but adds an email round-trip and a deliverability
  dependency; on iOS, opening the link from an installed PWA is a worse experience than Google
  Sign-In.
- **A passphrase/PIN enforced client-side.** Not a security control — bypassable. Rejected.
