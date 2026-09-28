# Security

For a suspected vulnerability, avoid publishing credentials or personal conversation data in an issue. Contact the maintainer through an available private GitHub channel first. This project currently has no dedicated security inbox.

The extension ships no third-party runtime code or remote scripts. Release archives are assembled from an explicit file allowlist. Browser profiles and test output are excluded from source control and packaging.

Changes to host permissions, network requests, storage, DOM serialization, or release packaging deserve special review. Validate both source and extension archives; a clean working directory or a `.gitignore` alone is not proof that a release is safe.
