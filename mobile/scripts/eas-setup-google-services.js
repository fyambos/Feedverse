const fs = require("fs");
const path = require("path");

function log(msg) {
  // Keep logs minimal but visible in EAS build output
  console.log(`[eas-setup] ${msg}`);
}

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

(function main() {
  const platform = String(process.env.EAS_BUILD_PLATFORM ?? "").trim().toLowerCase();
  if (platform && platform !== "android") {
    // Only needed for Android google-services.json
    return;
  }

  const dest = path.join(__dirname, "..", "google-services.json");
  const envVal = String(process.env.GOOGLE_SERVICES_JSON ?? "").trim();

  if (!envVal) {
    log("GOOGLE_SERVICES_JSON not set; leaving google-services.json as-is.");
    return;
  }

  // EAS "file" env vars are exposed as a path to a temporary file.
  if (fileExists(envVal)) {
    fs.copyFileSync(envVal, dest);
    log(`Copied GOOGLE_SERVICES_JSON file to ${path.relative(process.cwd(), dest)}`);
    return;
  }

  // Fallback: sometimes users provide raw JSON string in env.
  if (envVal.startsWith("{") && envVal.endsWith("}")) {
    fs.writeFileSync(dest, envVal, { encoding: "utf8" });
    log(`Wrote GOOGLE_SERVICES_JSON contents to ${path.relative(process.cwd(), dest)}`);
    return;
  }

  log(
    `GOOGLE_SERVICES_JSON was set but not a readable file path; got: ${envVal.slice(0, 40)}${envVal.length > 40 ? "…" : ""}`,
  );
})();
