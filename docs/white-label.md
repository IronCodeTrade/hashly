# White-label

A white-label licence lets a company show its own product name and two
colours. The security model does not change: keys stay on the user's device,
and the build still must not hold funds or sell hashrate.

In Settings, with a valid white-label key, enter:

- Product name, 2 to 32 characters
- Accent and graphite as `#rrggbb`
- An optional `https://` support link

`parseBrand` rejects other URL schemes, including `javascript:`.
Without the licence, the app ignores a custom brand and stays Hashly.

Quote requests are a conversation with Hashly / Infinitas. This repository
does not price them and does not take payment.
