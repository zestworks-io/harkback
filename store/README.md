# Chrome Web Store submission

Everything the dashboard asks for, in one place. Files here are inputs for you to paste or upload; none of them ship in the extension.

| Dashboard field                               | Source                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Package                                       | `pnpm release` → `apps/extension/.output/harkback-<version>-chrome.zip`   |
| Name, summary, description                    | `listing.en.md` (default), `listing.zh-CN.md` (add as a listing language) |
| Screenshots (1280×800, up to 5)               | `assets/1-explain.png` … `assets/5-privacy.png`                           |
| Small promo tile (440×280)                    | `assets/promo-small-440x280.png`                                          |
| Marquee (1400×560, optional)                  | `assets/promo-marquee-1400x560.png`                                       |
| Single purpose, permissions, data disclosures | `privacy-practices.md`                                                    |
| Privacy policy URL                            | the deployed `site/privacy/` page                                         |

## Steps

1. Deploy the website (`site/README.md`) and check that the privacy page opens.
2. Make sure `version` in `apps/extension/package.json` is higher than the published one.
3. `pnpm release`, then load the zip unpacked in `chrome://extensions` and explain one term.
4. If the interface or the screenshots changed: `pnpm --filter @harkback/extension store-assets` rewrites `assets/`. It builds the e2e extension and uses a stub model, so no key is needed.
5. Dashboard → New item → upload the zip → fill the Store listing, Privacy practices and Distribution tabs from the table above → Submit for review.

Reviews of extensions with optional access to all sites take longer than average; answer any reviewer email from the account that owns the item.
