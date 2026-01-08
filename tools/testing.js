#!/usr/bin/env node
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

function getPidsUsingPort(port) {
  try {
    if (process.platform === "win32") {
      const out = spawnSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: "utf8", shell: true });
      if (!out.stdout) return [];
      const lines = out.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const pids = [];
      for (const line of lines) {
        const parts = line.split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0") pids.push(pid);
      }
      return Array.from(new Set(pids));
    }

    // POSIX: prefer lsof
    const out = spawnSync(`lsof -ti tcp:${port}`, { encoding: "utf8", shell: true });
    if (out.status === 0 && out.stdout.trim()) {
      return out.stdout.trim().split(/\r?\n/).filter(Boolean);
    }

    // fallback to ss parsing
    const out2 = spawnSync(`ss -ltnp`, { encoding: "utf8", shell: true });
    if (!out2.stdout) return [];
    const pids = [];
    for (const line of out2.stdout.split(/\r?\n/)) {
      if (line.includes(`:${port}`)) {
        const m = line.match(/pid=(\d+),/);
        if (m && m[1]) pids.push(m[1]);
      }
    }
    return Array.from(new Set(pids));
  } catch (e) {
    return [];
  }
}
function findFreePort(start = 8080, max = 8100) {
  for (let p = start; p <= max; p++) {
    const pids = getPidsUsingPort(p);
    if (!pids || pids.length === 0) return p;
  }
  return null;
}

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

function run(cmd, opts = {}) {
  const child = spawn(cmd, { shell: true, stdio: "inherit", ...opts });
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => (code === 0 ? resolve(code) : reject(code)));
    child.on("error", reject);
  });
}

function readExpoUrlFromBackendEnv() {
  try {
    const p = path.join(process.cwd(), "backend", ".env");
    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      if (t.startsWith("EXPO_PUBLIC_API_BASE_URL")) {
        const idx = t.indexOf("=");
        if (idx === -1) continue;
        let v = t.slice(idx + 1).trim();
        // remove inline comments
        const hashIdx = v.indexOf("#");
        if (hashIdx !== -1) v = v.slice(0, hashIdx).trim();
        // strip surrounding quotes
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function openExternalTerminalWithCommand(cmdBase, backendUrl) {
  const mobileDir = path.join(process.cwd(), "mobile");
  // cmdBase should be the base command (e.g. `cd <mobile> && npx expo start ...`).
  // We'll construct a platform-specific full command that sets the env var correctly.
  const posixCmd = `cd ${mobileDir.replace(/"/g, '\\"')} && EXPO_PUBLIC_API_BASE_URL=\"${backendUrl}\" ${cmdBase.split('&&').slice(1).join('&&').trim() || ''}`;
  try {
    if (process.platform === "darwin") {
      const apple = `osascript -e 'tell application "Terminal" to do script "${posixCmd.replace(/"/g, '\\"')}"'`;
      await run(apple);
      return true;
    }
    if (process.platform === "win32") {
      // Use PowerShell to set env var for the session and run Expo.
      const expoArgs = cmdBase.includes('npx') ? cmdBase.split('npx').slice(1).join('npx') : cmdBase;
      const winCmd = `cmd /c start powershell -NoExit -Command "cd '${mobileDir}'; $env:EXPO_PUBLIC_API_BASE_URL='${backendUrl}'; ${expoArgs.replace(/"/g, '"')}"`;
      await run(winCmd);
      return true;
    }
    const terminals = [
      "gnome-terminal",
      "konsole",
      "xfce4-terminal",
      "mate-terminal",
      "lxterminal",
      "x-terminal-emulator",
      "alacritty",
      "xterm",
    ];
    for (const term of terminals) {
      try {
        await run(`command -v ${term}`);
        let full;
        const fullCmd = `cd ${mobileDir.replace(/"/g, '\\"')} && EXPO_PUBLIC_API_BASE_URL=\"${backendUrl}\" ${cmdBase.split('&&').slice(1).join('&&').trim() || ''}`;
        if (term === "alacritty") full = `${term} -e bash -lc "${fullCmd}; exec bash"`;
        else if (term === "konsole") full = `${term} -e bash -c "${fullCmd}; exec bash"`;
        else if (term === "xterm") full = `${term} -e bash -lc "${fullCmd}; exec bash"`;
        else full = `${term} -- bash -lc "${fullCmd}; exec bash"`;
        await run(full);
        return true;
      } catch (e) {
        continue;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function main() {
  // ensure on testing branch
  try {
    const out = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
    const branch = (out.stdout || "").trim();
    if (branch !== "testing") {
      console.error(`Not on 'testing' branch (current: ${branch}). Please switch to testing with "git checkout testing".`);
      process.exit(1);
    }
  } catch (e) {
    console.error("Failed to determine git branch:", e.message || e);
    process.exit(1);
  }

  // Determine free port and build backend URL
  const ip = getLocalIp();
  const chosenPort = findFreePort(8080, 8200);
  if (!chosenPort) {
    console.error("No free port found between 8080 and 8200. Aborting.");
    process.exit(1);
  }
  const backendUrl = `http://${ip}:${chosenPort}`;
  console.log("Using backend URL:", backendUrl);

  try {
    console.log("\nBuilding backend (CJS)...");
    await run(`cd backend && npm run build:cjs`);

    console.log("\nStarting Expo. A new terminal window will open for Expo so backend remains visible here.");
    const expoCmd = `cd ${path.join(process.cwd(), "mobile").replace(/"/g, '\\"')} && EXPO_PUBLIC_API_BASE_URL=\"${backendUrl}\" npx expo start --host lan -c`;
    console.log(`Expo command: ${expoCmd}`);

    const mobileDir = path.join(process.cwd(), "mobile");
    const started = await openExternalTerminalWithCommand(expoCmd, backendUrl);
    if (!started) {
      console.log("Failed to open an external terminal; launching Expo in this terminal and backgrounding the backend.");
      // Start backend as a detached background process on the chosen port so Expo can run in this terminal.
      try {
        const bg = spawn(`cd backend && npm run start`, {
          shell: true,
          detached: true,
          stdio: "ignore",
          env: { ...process.env, SERVER_PORT: String(chosenPort) },
        });
        bg.unref();
        console.log("Backend started in background (detached).");
      } catch (e) {
        console.warn("Failed to start backend in background:", e && e.message ? e.message : e);
      }

      // Run Expo in the current terminal with the env var set for this process.
      await run(`cd ${mobileDir} && npx expo start --host lan -c`, {
        env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: backendUrl },
      });
      // When Expo exits, terminate this script. Backend remains running in background.
      process.exit(0);
    }

    console.log("Starting backend in foreground (logs shown here). Use Ctrl+C to stop.");
    // Start backend on the chosen port
    const backendProc = spawn(`cd backend && npm run start`, {
      shell: true,
      stdio: "inherit",
      env: { ...process.env, SERVER_PORT: String(chosenPort) },
    });
    backendProc.on("exit", (code) => process.exit(code ?? 0));
  } catch (e) {
    console.error("Error:", e && e.message ? e.message : e);
    process.exit(1);
  }
}

main();
