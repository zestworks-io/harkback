# Security policy

## Reporting a vulnerability

Please report security problems privately, using GitHub's **private vulnerability reporting** on this repository (Security tab, "Report a vulnerability"). Do not open a public issue for them.

Include what you found, how to reproduce it, and the browser and extension version. You will get an answer as soon as the maintainers can look at it.

## Scope

Areas that matter most:

- Content from web pages or model replies reaching the page's DOM or the extension's privileged pages as HTML or script.
- A web page reading or triggering extension behavior (messages, stored records, reunion hints).
- Text from a sensitive source or a private window being recorded or sent to a non-local model.
- Extension permissions broader than the feature that needs them.

Known limits, documented in the extension's privacy notes: API keys are stored unencrypted in extension storage, and reunion hints are visible to the page's own scripts.
