interface ImportMetaEnv {
  readonly VITE_HASHLY_CHECKOUT_URL?: string;
  readonly VITE_HASHLY_LICENSE_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
