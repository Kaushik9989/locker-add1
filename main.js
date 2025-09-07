const { app, BrowserWindow, globalShortcut, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// --- Important: helps avoid white/black screen on some GPUs
app.disableHardwareAcceleration();

let mainWindow;
let splashWindow;
const APP_URL = 'http://127.0.0.1:6010'; // force IPv4

// simple logger to a file you can read later
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  const logPath = path.join(app.getPath('userData'), 'kiosk.log');
  try { fs.appendFileSync(logPath, line); } catch {} // ignore if fails
  console.log(...args);
}

function checkServerReady(url, onReady, timeoutMs = 60000) {
  const start = Date.now();
  const timer = setInterval(() => {
    http.get(url, (res) => {
      if (res.statusCode === 200) {
        clearInterval(timer);
        onReady();
      } else {
        log(`Waiting: ${url} → ${res.statusCode}`);
      }
    }).on('error', (err) => {
      log(`Waiting: ${url} → ${err.message}`);
    });

    if (Date.now() - start > timeoutMs) {
      clearInterval(timer);
      showError(`Backend did not become ready within ${timeoutMs / 1000}s at ${url}.`);
    }
  }, 1000);
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    resizable: false,
    movable: false,
    webPreferences: { nodeIntegration: false }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

let forceQuit = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // enable the following only if you need them; kept conservative for security
      // enableRemoteModule: false
    }
  });

  mainWindow.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault();
      log('Blocked attempt to close mainWindow (Alt+F4 or system)');
    }
  });

  globalShortcut.register('F12', () => {
    if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  globalShortcut.register('Control+R', () => {
    if (mainWindow) mainWindow.reload();
  });

  globalShortcut.register('Shift+D', () => {
    log('Secret quit triggered');
    forceQuit = true;
    app.quit();
  });

  mainWindow.loadURL(APP_URL);

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function showError(htmlMsg) {
  if (!mainWindow) {
    // replace splash with an error screen
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.loadURL(`data:text/html;charset=utf-8,
        <html><body style="background:#111;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
          <div>
            <h1>Unable to start</h1>
            <p style="max-width:700px">${htmlMsg}</p>
            <p>Press <b>F12</b> for DevTools, <b>Ctrl+R</b> to retry, <b>Shift+D</b> to quit.</p>
          </div>
        </body></html>`);
    }
    return;
  }
  if (!mainWindow.isDestroyed()) {
    mainWindow.loadURL(`data:text/html;charset=utf-8,
      <html><body style="background:#111;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
        <div>
          <h1>Load error</h1>
          <p style="max-width:700px">${htmlMsg}</p>
          <p>Press <b>F12</b> for DevTools, <b>Ctrl+R</b> to retry, <b>Shift+D</b> to quit.</p>
        </div>
      </body></html>`);
  }
}

// --- Permission handler: allow geolocation only for APP_URL origin
function setupPermissionHandler() {
  const allowedOrigin = (() => {
    try {
      return new URL(APP_URL).origin;
    } catch {
      return null;
    }
  })();

  if (!allowedOrigin) {
    log('Invalid APP_URL; permission handler not installed.');
    return;
  }

  // Use defaultSession to intercept permission requests
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    try {
      const requestOrigin = details && details.requestingUrl ? new URL(details.requestingUrl).origin : webContents.getURL() ? new URL(webContents.getURL()).origin : null;

      if (permission === 'geolocation') {
        // Allow geolocation only for our app origin
        if (requestOrigin === allowedOrigin) {
          log(`Granting geolocation for origin ${requestOrigin}`);
          return callback(true);
        } else {
          log(`Blocking geolocation for origin ${requestOrigin}`);
          return callback(false);
        }
      }

      // Default: deny other risky permissions (camera/microphone, etc.)
      return callback(false);
    } catch (err) {
      log('Permission handler error:', err && err.message);
      return callback(false);
    }
  });
}

app.whenReady().then(() => {
  // Optional: comment out during testing so it doesn't auto-launch at login
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });

  setupPermissionHandler();
  createSplash();
  checkServerReady(APP_URL, createMainWindow);

  // Safety: if you also had code that spawned the server, remove it when using PM2
  // Do NOT spawn server.js here when backend is managed by PM2
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
