const requiredVariables = [
  "WORKOS_CLIENT_ID",
  "WORKOS_COOKIE_PASSWORD",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
];

export function getAuthConfiguration() {
  const missing = requiredVariables.filter((key) => !process.env[key]?.trim());
  const errors = [];

  if (
    process.env.WORKOS_COOKIE_PASSWORD &&
    process.env.WORKOS_COOKIE_PASSWORD.length < 32
  ) {
    errors.push("WORKOS_COOKIE_PASSWORD must contain at least 32 characters.");
  }

  const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  if (redirectUri) {
    try {
      const url = new URL(redirectUri);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push(
          "NEXT_PUBLIC_WORKOS_REDIRECT_URI must be an HTTP or HTTPS URL.",
        );
      }
    } catch {
      errors.push("NEXT_PUBLIC_WORKOS_REDIRECT_URI must be a valid URL.");
    }
  }

  return {
    ready: missing.length === 0 && errors.length === 0,
    missing,
    errors,
  };
}
