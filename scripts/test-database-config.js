function configurationError(code, message) {
  return Object.assign(new Error(message), { code });
}

function parseTarget(value, field) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    const protocol = url.protocol.toLowerCase();
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (
      !["postgres:", "postgresql:"].includes(protocol) ||
      !url.hostname ||
      !database ||
      database.includes("/")
    ) {
      throw new Error("invalid connection target");
    }
    return {
      field,
      hostname: url.hostname.toLowerCase(),
      port: url.port || "5432",
      database,
    };
  } catch {
    throw configurationError(
      "TEST_DATABASE_URL_INVALID",
      "Test database configuration must be a valid PostgreSQL connection URL.",
    );
  }
}

function sameTarget(first, second) {
  return (
    first.hostname === second.hostname &&
    first.port === second.port &&
    first.database === second.database
  );
}

export function resolveTestDatabaseUrl({
  testDatabaseUrl,
  databaseUrl,
  directDatabaseUrl,
} = {}) {
  const testTarget = parseTarget(testDatabaseUrl, "TEST_DATABASE_URL");
  if (!testTarget) {
    throw configurationError(
      "TEST_DATABASE_URL_REQUIRED",
      "Set TEST_DATABASE_URL to an isolated PostgreSQL test database before running integration tests.",
    );
  }

  for (const [field, value] of [
    ["DATABASE_URL", databaseUrl],
    ["DIRECT_DATABASE_URL", directDatabaseUrl],
  ]) {
    const applicationTarget = parseTarget(value, field);
    if (applicationTarget && sameTarget(testTarget, applicationTarget)) {
      throw configurationError(
        "TEST_DATABASE_TARGET_IS_APPLICATION_DATABASE",
        "The configured test database matches an application database target. Use a separate test database.",
      );
    }
  }

  return testDatabaseUrl.trim();
}
