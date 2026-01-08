#!/usr/bin/env node
const { spawn, spawnSync } = require("child_process");
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
    const out = spawnSync(`lsof -ti tcp:${port}`, { encoding: "utf8", shell: true });
    if (out.status === 0 && out.stdout.trim()) {
      return out.stdout.trim().split(/\r?\n/).filter(Boolean);
    }
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

// Interactive kill helpers removed; we pick an available port instead.
function findFreePort(start = 8080, max = 8200) {
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
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
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

async function main() {
  const ip = getLocalIp();
  const chosenPort = findFreePort(8080, 8200);
  if (!chosenPort) {
    console.error("No free port found between 8080 and 8200. Aborting.");
    process.exit(1);
  }
  const backendUrl = `http://${ip}:${chosenPort}`;
    console.log("Detected local IP:", ip);
    console.log("Using backend URL:", backendUrl);

    // ensure on beta branch
    try {
      const out = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
      const branch = (out.stdout || "").trim();
      if (branch !== "beta") {
        console.error(`Not on 'beta' branch (current: ${branch}). Please switch to beta with "git checkout beta"`);
        process.exit(1);
      }
    } catch (e) {
      console.error("Failed to determine git branch:", e.message || e);
      process.exit(1);
    }
  const noExpo = process.argv.includes("--no-expo");

  // Build and start backend in background, save PID to .beta_backend.pid and logs to backend_beta.log
  try {
    console.log("\nBuilding backend (CJS)...");
    await run(`cd backend && npm run build:cjs`);

    // We will OPEN Expo in a separate Terminal (so backend logs remain in this terminal),
    // then run the backend in the current terminal (foreground) so you see logs live.

    if (noExpo) {
      // If user requested no Expo, just run backend in foreground here.
      console.log("--no-expo provided; running backend in foreground. Use Ctrl+C to stop.");
      const backendProc = spawn(`cd backend && npm run start`, { shell: true, stdio: "inherit" });
      backendProc.on("exit", (code) => process.exit(code ?? 0));
      return;
    }

    // Start Expo with EXPO_PUBLIC_API_BASE_URL set to backendUrl
    console.log("\nStarting Expo. A new terminal window will open for Expo so backend remains visible here.");
    const expoCmd = `cd ${path.join(process.cwd(), "mobile").replace(/"/g, "\\\"")} && EXPO_PUBLIC_API_BASE_URL=\"${backendUrl}\" npx expo start --host lan -c`;
    console.log(`Expo command: ${expoCmd}`);

    // Open an external terminal window to run Expo so the backend stays live in this terminal.
    const mobileDir = path.join(process.cwd(), "mobile");
    const escapedExpoCmd = expoCmd.replace(/"/g, '\\"');

    const openExternalTerminal = async () => {
      try {
        if (process.platform === "darwin") {
          // macOS: Terminal.app via AppleScript
          const apple = `osascript -e 'tell application "Terminal" to do script "${escapedExpoCmd}"'`;
          await run(apple);
          console.log("Expo started in a new Terminal.app window.");
          return true;
        }

        if (process.platform === "win32") {
          // Windows: open PowerShell in new window
          // Use cmd start to create a new window and run PowerShell there
          const winCmd = `cmd /c start powershell -NoExit -Command "cd '${mobileDir}'; $env:EXPO_PUBLIC_API_BASE_URL='${backendUrl}'; npx expo start --host lan"`;
          await run(winCmd);
          console.log("Expo started in a new PowerShell window.");
          return true;
        }

        // Linux: try common terminal emulators
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
            // Check existence
            await run(`command -v ${term}`);
            let cmd;
            if (term === "alacritty") {
              cmd = `${term} -e bash -lc \"${escapedExpoCmd}; exec bash\"`;
            } else if (term === "konsole") {
              cmd = `${term} -e bash -c \"${escapedExpoCmd}; exec bash\"`;
            } else if (term === "xterm") {
              cmd = `${term} -e bash -lc \"${escapedExpoCmd}; exec bash\"`;
            } else {
              cmd = `${term} -- bash -lc \"${escapedExpoCmd}; exec bash\"`;
            }
            await run(cmd);
            console.log(`Expo started in ${term}.`);
            return true;
          } catch (e) {
            // try next terminal
            continue;
          }
        }

        return false;
      } catch (e) {
        return false;
      }
    };

    const started = await openExternalTerminal();
    if (!started) {
      console.log("Failed to open an external terminal; launching Expo in this terminal and backgrounding the backend.");
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

      await run(`cd ${path.join(process.cwd(), "mobile")} && npx expo start --host lan -c`, {
        env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: backendUrl },
      });
      process.exit(0);
    }

    // Now start backend in foreground so logs appear here.
    console.log("Starting backend in foreground (logs shown here). Use Ctrl+C to stop.");
    // Start backend on the chosen port in foreground
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
