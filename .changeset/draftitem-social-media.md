---
"@ikenga/contract": minor
---

Add optional social/media fields to `DraftItem` (`channelId`, `firstComment`, `media`) plus `SocialMedia` and `ThreadPost` types, in lockstep with the send-worker's media-capable Buffer adapter (royalti-co social-outbound-unification). All fields are optional, so non-Buffer channels and existing consumers are unaffected.
