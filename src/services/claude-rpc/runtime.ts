import { ManagedRuntime } from "effect";
import { createContext, useContext } from "react";
import { ClaudeCliFromRpc } from "./client";

export const AppRuntime = ManagedRuntime.make(ClaudeCliFromRpc);

type AppRuntimeType = typeof AppRuntime;
const RuntimeContext = createContext<AppRuntimeType>(AppRuntime);

export const RuntimeProvider = RuntimeContext.Provider;
export const useRuntime = () => useContext(RuntimeContext);
