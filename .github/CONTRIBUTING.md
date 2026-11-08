# Contributing

FolioDash is a draft. Read [AGENTS.md](../AGENTS.md) and the [documentation map](../docs/README.md) first; the rules live there and are not repeated here.

- One branch and one coherent pull request per concern.
- Conform to [CleanStack](../docs/architecture/cleanstack.md), or amend it explicitly in the same pull request. Do not silently settle an open decision; ask the owner when a document cites a decision ID you cannot read.
- Never commit real financial data, account identifiers, credentials or exports, even to a private branch.
- Commits are attributed only to approved humans listed in `.github/allowed-contributors.json`. `npm run verify` checks the complete history and rejects AI or automation authors and co-authors.
- The licence is not chosen yet (FD-011), so external contributions cannot be accepted until it is.
