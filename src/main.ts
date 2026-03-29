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
import { makeProjectStoreLive } from "./services/database/project-store/service";
import { makeDatabaseLive } from "./services/database/service";
import { makeSessionReconstructorLive } from "./services/database/session-reconstructor/service";
import { makeTabStoreLive } from "./services/database/tab-store/service";
import { DevLogger, devLog, ProdLogger } from "./services/diagnostics";
import { makeProdFileLogger } from "./services/diagnostics-file-logger";
import { makeDialogServiceLive } from "./services/dialog/service";
import { DialogRpcHandlers } from "./services/dialog-rpc/handlers";
import { makeGitServiceLive } from "./services/git/service";
import { GitRpcHandlers } from "./services/git-rpc/handlers";
import { PersistenceRpcHandlers } from "./services/persistence-rpc/handlers";
import { makeTabRuntimeManagerLive } from "./services/tab-runtime-manager/service";
import { TabRuntimeManager } from "./services/tab-runtime-manager/service-definition";

if (started) {
  app.quit();
}

const dbPath = path.join(app.getPath("userData"), "mao.db");
mkdirSync(path.dirname(dbPath), { recursive: true });
devLog(`database path: ${dbPath}`, app.isPackaged);

const logFilePath = path.join(app.getPath("logs"), "mao-errors.log");

const SqliteLive = SqliteClient.layer({ filename: dbPath });
const DatabaseLayer = makeDatabaseLive();
const EventStoreLayer = makeEventStoreLive();
const TabStoreLayer = makeTabStoreLive();
const PersistentLayer = makePersistentClaudeCliLive();
const SessionReconstructorLayer = makeSessionReconstructorLive();
const ProjectStoreLayer = makeProjectStoreLive();
const GitServiceLayer = makeGitServiceLive();
const DialogServiceLayer = makeDialogServiceLive();
const TabRuntimeManagerLayer = makeTabRuntimeManagerLive();

const BaseLayer = ClaudeRpcHandlers.pipe(
  Layer.provideMerge(PersistenceRpcHandlers),
  Layer.provideMerge(GitRpcHandlers),
  Layer.provideMerge(DialogRpcHandlers),
  Layer.provideMerge(TabRuntimeManagerLayer),
  Layer.provideMerge(SessionReconstructorLayer),
  Layer.provideMerge(PersistentLayer),
  Layer.provideMerge(ClaudeCliLive),
  Layer.provideMerge(GitServiceLayer),
  Layer.provideMerge(DialogServiceLayer),
  Layer.provideMerge(ProjectStoreLayer),
  Layer.provideMerge(TabStoreLayer),
  Layer.provideMerge(EventStoreLayer),
  Layer.provideMerge(DatabaseLayer),
  Layer.provideMerge(SqliteLive),
  Layer.provideMerge(NodeContext.layer),
);

const LoggerLayer = app.isPackaged
  ? Layer.merge(ProdLogger, makeProdFileLogger(logFilePath))
  : DevLogger;

const ServerLayer = BaseLayer.pipe(Layer.provide(LoggerLayer));

const runtime = ManagedRuntime.make(ServerLayer);

const createWindow = () => {
  devLog("creating window", app.isPackaged);
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
  devLog("app ready", app.isPackaged);
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
  devLog("disposing per-tab runtimes", app.isPackaged);
  try {
    // D-04: Kill all in-flight CLI streams by disposing per-tab runtimes first
    await runtime.runPromise(
      Effect.gen(function* () {
        const manager = yield* TabRuntimeManager;
        yield* manager.disposeAll();
      }),
    );
  } catch (err) {
    devLog(`per-tab runtime disposal error: ${err}`, app.isPackaged);
  }
  devLog("disposing main runtime", app.isPackaged);
  try {
    // D-05: Main runtime dispose handles DB cleanup via acquireRelease
    await runtime.dispose();
  } finally {
    devLog("runtime disposed, exiting", app.isPackaged);
    app.exit(0);
  }
});
