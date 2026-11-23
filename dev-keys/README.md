# Development licence key

`DEV_ONLY_license_private.hex` is a **published** Ed25519 seed. The app trusts
the matching public key unless you build with `VITE_HASHLY_LICENSE_PUBLIC_KEY`.

Anyone can mint Pro, Team, and white-label keys for a development build:

```bash
npm run license -- issue --dev --plan pro --subject you@example.com --days 30
```

Do not use this key for a release you ship to customers. Generate a new one
and keep the private half off the git remote:

```bash
npm run license -- keygen --out .hashly/license-private.hex
# prints HASHLY_LICENSE_PUBLIC_KEY=...
```

Rebuild the web app with that public key in the environment. The Plans page
stops showing the development-key note when the trust anchor is no longer the
published one.
