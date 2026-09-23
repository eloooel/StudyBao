---
name: change-data-model
description: Add or change a Dexie table, field, or index, or the sync contract. Use for any change to stored data, including new fields on cards, decks, lessons, or sessions.
---

Read `docs/ai/change-data-model.md` and follow it exactly. This is the highest-risk change class in
this repo — there is no undo on her phone. Bump the Dexie version, write an idempotent upgrade, and
test it against pre-existing data before claiming it works. The user's request: $ARGUMENTS
