import { mkdirSync } from "node:fs";
import path from "node:path";
import { NodeContext } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect, Layer, ManagedRuntime } from "effect";
import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";
import { makePersistentClaudeCliLive } from "./services/claude-cli/persistent/service";
import { ClaudeCliLive } from "./services/claude-cli/service";
import {
  ClaudeRpcHandlers,
  startRpcServer,
} from "./services/claude-rpc/server";
import { makeEventStoreLive } from "./services/database/event-store/service";
import { makeDatabaseLive } from "./services/database/service";
import { makeSessionReconstructorLive } from "./services/database/session-reconstructor/service";
import { makeTabStoreLive } from "./services/database/tab-store/service";
import { DevLogger, ProdLogger } from "./services/diagnostics";
import { PersistenceRpcHandlers } from "./services/persistence-rpc/handlers";

if (started) {
  app.quit();
}

const dbPath = path.join(app.getPath("userData"), "mao.db");
mkdirSync(path.dirname(dbPath), { recursive: true });
if (!app.isPackaged) console.log(`[mao:lifecycle] database path: ${dbPath}`);

const SqliteLive = SqliteClient.layer({ filename: dbPath });
const DatabaseLayer = makeDatabaseLive();
const EventStoreLayer = makeEventStoreLive();
const TabStoreLayer = makeTabStoreLive();
const PersistentLayer = makePersistentClaudeCliLive();
const SessionReconstructorLayer = makeSessionReconstructorLive();

const BaseLayer = ClaudeRpcHandlers.pipe(
  Layer.provideMerge(PersistenceRpcHandlers),
  Layer.provideMerge(SessionReconstructorLayer),
  Layer.provideMerge(PersistentLayer),
  Layer.provideMerge(ClaudeCliLive),
  Layer.provideMerge(TabStoreLayer),
  Layer.provideMerge(EventStoreLayer),
  Layer.provideMerge(DatabaseLayer),
  Layer.provideMerge(SqliteLive),
  Layer.provideMerge(NodeContext.layer),
);

const ServerLayer = BaseLayer.pipe(
  Layer.provide(app.isPackaged ? ProdLogger : DevLogger),
);

const runtime = ManagedRuntime.make(ServerLayer);

const createWindow = () => {
  if (!app.isPackaged) console.log("[mao:lifecycle] creating window");
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
};

app.on("ready", () => {
  if (!app.isPackaged) console.log("[mao:lifecycle] app ready");
  createWindow();
  runtime.runFork(startRpcServer.pipe(Effect.scoped));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

let isQuitting = false;
app.on("before-quit", async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  if (!app.isPackaged) console.log("[mao:lifecycle] disposing runtime");
  try {
    await runtime.dispose();
  } finally {
    if (!app.isPackaged)
      console.log("[mao:lifecycle] runtime disposed, exiting");
    app.exit(0);
  }
});
