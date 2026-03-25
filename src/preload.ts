import { contextBridge, ipcRenderer } from "electron";
import {
  RPC_FROM_CLIENT,
  RPC_FROM_SERVER,
} from "./services/claude-rpc/channels";

export const electronAPI = {
  rpc: {
    send(message: unknown) {
      ipcRenderer.send(RPC_FROM_CLIENT, message);
    },
    onMessage<T = unknown>(callback: (message: T) => void) {
      const handler = (_event: Electron.IpcRendererEvent, message: T) => {
        callback(message);
      };
      ipcRenderer.on(RPC_FROM_SERVER, handler);
      return () => {
        ipcRenderer.removeListener(RPC_FROM_SERVER, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
