# Zotero web API fixtures

Responses of `https://api.zotero.org` in the shape the real service sends, for the import tests. They were cut from real
responses (public group library 204704 and a `/keys/current` response as Zotero's server code writes it), with names,
user ids and a library proxy's session token replaced. `PAPRVISA` keeps that record's real proxy `DOI` and `url` fields.

- `keys-current.json`: `GET /keys/current`; `keys-current-no-library.json`: a key that cannot read the library (`access.user` is `[]`).
- `annotations-1.json`, `annotations-2.json`: `GET /users/4242424/items?itemType=annotation&limit=100`, two pages.
- `items.json`: the papers and attachments, served for `GET /users/4242424/items?itemKey=…`.

The headers the service sends with them (`Total-Results`, `Last-Modified-Version`, `Link`) are added by the test that serves them.
