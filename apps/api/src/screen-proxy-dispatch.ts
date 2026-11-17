import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { novncRequestPath } from "@rakazo/core/node/screen-proxy";

type HttpHandler = (request: IncomingMessage, response: ServerResponse) => void;
type UpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

export function createScreenProxyDispatch(options: {
  screen: {
    handleHttp: (
      request: IncomingMessage,
      response: ServerResponse,
      next: () => void,
    ) => void;
    handleUpgrade: UpgradeHandler;
  };
  http: HttpHandler;
  upgrade?: UpgradeHandler;
}) {
  return {
    handleHttp(request: IncomingMessage, response: ServerResponse) {
      if (novncRequestPath(request.url)) {
        options.screen.handleHttp(request, response, () => options.http(request, response));
      } else {
        options.http(request, response);
      }
    },
    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
      if (novncRequestPath(request.url)) {
        options.screen.handleUpgrade(request, socket, head);
      } else if (options.upgrade) {
        options.upgrade(request, socket, head);
      } else {
        socket.destroy();
      }
    },
  };
}
