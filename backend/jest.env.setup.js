const path = require('path');

// Always load backend/.env for Jest runs (independent of the cwd used to invoke Jest).
// Do not override any env vars that are already set by the shell/CI.
require('dotenv').config({
  path: path.join(__dirname, '.env'),
  override: false,
});
