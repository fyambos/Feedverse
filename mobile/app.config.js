// Dynamic Expo config so EAS can use file environment variables (e.g. GOOGLE_SERVICES_JSON)
// without committing sensitive files to git.

const appJson = require("./app.json");

module.exports = ({ config }) => {
  const baseExpo = appJson.expo ?? {};
  const merged = {
    ...baseExpo,
    ...config,
    android: {
      ...(baseExpo.android ?? {}),
      ...(config.android ?? {}),
      // Official EAS file env var flow:
      // - If GOOGLE_SERVICES_JSON is created with `--type file`, it will be a PATH on the builder.
      // - Fallback supports local dev where the file exists in the repo working tree.
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? (baseExpo.android?.googleServicesFile || "./google-services.json"),
    },
  };

  return { expo: merged };
};
