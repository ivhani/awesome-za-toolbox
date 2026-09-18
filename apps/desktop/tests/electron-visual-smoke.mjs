import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = path.resolve(desktopDirectory, "../..");
const outputPath = path.join(repositoryDirectory, "tmp", "desktop-visual-smoke.png");
const port = await reservePort();
const child = spawn(electronPath, [desktopDirectory, `--remote-debugging-port=${port}`], {
  cwd: desktopDirectory,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

try {
  const target = await waitForPage(port);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const image = await captureScreenshot(target.webSocketDebuggerUrl);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, image);
  process.stdout.write(`${outputPath}\n`);
} finally {
  child.kill();
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
}

async function reservePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a debugging port.");
  server.close();
  await once(server, "close");
  return address.port;
}

async function waitForPage(debuggingPort) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.title === "Awesome ZA Toolbox");
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch {
      // Electron has not opened its local debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Electron did not expose the desktop renderer within 15 seconds.");
}

async function captureScreenshot(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await once(socket, "open");
  let sequence = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      socket.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send("Page.enable");
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  socket.close();
  return Buffer.from(result.data, "base64");
}
