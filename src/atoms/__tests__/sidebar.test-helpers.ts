import { Context, Effect } from "effect";

// Minimal mock interface for the RendererRpcClient methods used in hydration tests.
// Only includes reconstructSession since that's all the hydration logic calls.
export interface RendererRpcClientService {
  readonly reconstructSession: (params: {
    readonly sessionId: string;
  }) => Effect.Effect<
    {
      readonly sessionId: string;
      readonly messages: ReadonlyArray<{
        readonly content: string;
        readonly role: string;
        readonly toolUseId?: string;
        readonly isError?: boolean;
      }>;
    },
    unknown
  >;
}

export class RendererRpcClient extends Context.Tag("RendererRpcClient")<
  RendererRpcClient,
  RendererRpcClientService
>() {}
