#!/usr/bin/env node
const { spawn, spawnSync } = require("child_process");
const os = require("os");
const path = require("path");

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
  const sh = spawn("bash", ["-lc", cmd], { stdio: "inherit", ...opts });
  return new Promise((resolve, reject) => {
    sh.on("exit", (code) => (code === 0 ? resolve(code) : reject(code)));
    sh.on("error", reject);
  });
}

async function openExternalTerminal(cmd) {
  const escaped = cmd.replace(/"/g, '\\"');
  const mobileDir = path.join(process.cwd(), "mobile");
  try {
    if (process.platform === "darwin") {
      const apple = `osascript -e 'tell application "Terminal" to do script "${escaped}"'`;
      await run(apple);
      return true;
    }
    if (process.platform === "win32") {
      const winCmd = `cmd /c start powershell -NoExit -Command "cd '${mobileDir}'; ${cmd.replace(/"/g, '"')}"`;
      await run(winCmd);
      return true;
    }
    const terminals = ["gnome-terminal","konsole","xfce4-terminal","mate-terminal","lxterminal","x-terminal-emulator","alacritty","xterm"];
    for (const term of terminals) {
      try {
        await run(`command -v ${term}`);
        let full;
        if (term === "alacritty") full = `${term} -e bash -lc "${escaped}; exec bash"`;
        else if (term === "konsole") full = `${term} -e bash -c "${escaped}; exec bash"`;
        else if (term === "xterm") full = `${term} -e bash -lc "${escaped}; exec bash"`;
        else full = `${term} -- bash -lc "${escaped}; exec bash"`;
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
  // ensure on dev branch
  try {
    const out = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
    const branch = (out.stdout || "").trim();
    if (branch !== "dev") {
      console.error(`Not on 'dev' branch (current: ${branch}). Please switch to dev with "git checkout dev"`);
      process.exit(1);
    }
  } catch (e) {
    console.error("Failed to determine git branch:", e.message || e);
    process.exit(1);
  }

  const ip = getLocalIp();
  const backendUrl = `http://${ip}:8080`;

  console.log("Detected local IP:", ip);
  console.log("Using backend URL:", backendUrl);

  try {
    console.log("\nBuilding backend (CJS)...");
    await run(`cd backend && npm run build:cjs`);

    console.log("\nStarting Expo. A new terminal window will open for Expo so backend remains visible here.");
    const expoCmd = `cd ${path.join(process.cwd(), "mobile").replace(/"/g, '\\"')} && EXPO_PUBLIC_API_BASE_URL=\"${backendUrl}\" npx expo start --host lan -c`;
    console.log(`Expo command: ${expoCmd}`);

    const started = await openExternalTerminal(expoCmd);
    if (!started) {
      console.log("Failed to open an external terminal; starting Expo in background as fallback.");
      await run(expoCmd + " > /dev/null 2>&1 &");
    }

    console.log("Starting backend in foreground (logs shown here). Use Ctrl+C to stop.");
    const backendProc = spawn("bash", ["-lc", `cd backend && npm run start`], { stdio: "inherit" });
    backendProc.on("exit", (code) => process.exit(code ?? 0));
  } catch (e) {
    console.error("Error:", e && e.message ? e.message : e);
    process.exit(1);
  }
}

main();
