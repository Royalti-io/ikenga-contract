// Shell ↔ pkg RPC envelope. Same shape on both transports (postMessage for
// iframe pkgs, direct call for mounted pkgs).

export interface RpcRequest<TParams = unknown> {
  id: string;
  method: string;
  params: TParams;
}

export interface RpcResponse<TResult = unknown> {
  id: string;
  result?: TResult;
  error?: { code: string; message: string; data?: unknown };
}

export type RpcMessage = RpcRequest | RpcResponse;
