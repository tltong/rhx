# KaTeX browser assets

Pinned version: **0.18.1** (MIT license; see [LICENSE](./0.18.1/LICENSE)).

These files are served by Firebase Hosting from the same origin as RHX.
The review, practice, results and generator pages use these assets so their
math rendering does not depend on a third-party CDN.

Source: https://registry.npmjs.org/katex/-/katex-0.18.1.tgz

Archive integrity:

```text
sha512-Td8GCYSxDAoMhHOlKmCFMJ/hz5qlAAb71n66Dryw9nfCVfumLo7nhuotbvKom/XPADmrYC3O5QR71EPq4DarJQ==
```

The CSS, KaTeX JavaScript and auto-render JavaScript match the SHA-384 integrity
values already pinned in the pages. The distribution files are unmodified.

To update, download a pinned KaTeX npm release and verify its archive integrity.
Copy `dist/katex.min.css`, `dist/katex.min.js`,
`dist/contrib/auto-render.min.js`, all of `dist/fonts/`, and `LICENSE`
into a new version directory. Keep the fonts beside the CSS, preserve the
license, and update page URLs and integrity values together.
