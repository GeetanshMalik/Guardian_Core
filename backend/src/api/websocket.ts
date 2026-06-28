import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { container } from "../infrastructure/container.js";
import { verifyJwt } from "../infrastructure/jwt.js";
import { metricsRegistry } from "../infrastructure/metrics.js";

interface CustomWebSocket extends WebSocket {
  isAlive: boolean;
}

/**
 * Initialize and start the WebSocket Gateway Server (§22.15)
 * Mounted at: wss://<host>/api/v1/ws
 */
export function initWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({
    server,
    path: "/api/v1/ws"
  });

  const { guardianCore } = container;

  console.log("[WebSocketGateway] Mounted WebSocket Server on path: /api/v1/ws");

  // Keep-alive heartbeat interval (every 30 seconds)
  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as CustomWebSocket;
      if (ws.isAlive === false) {
        console.log("[WebSocketGateway] Client heartbeat lost. Terminating connection.");
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });
  wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
    // Extract token from cookies or query parameters
    const cookieHeader = req.headers.cookie || "";
    let token = "";
    const match = cookieHeader.match(/user_session=([^;]+)/);
    if (match) {
      token = match[1];
    }

    if (!token && req.url) {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        token = urlObj.searchParams.get("token") || "";
      } catch (err) {
        // Silently fail query parsing
      }
    }

    const decoded = verifyJwt(token);
    if (!decoded) {
      console.warn("[WebSocketGateway] Rejecting connection: Invalid or missing token.");
      ws.send(JSON.stringify({
        type: "error",
        payload: { code: "UNAUTHORIZED", message: "Unauthorized connection attempt." }
      }));
      ws.close(4001, "Unauthorized");
      return;
    }

    const customWs = ws as CustomWebSocket;
    customWs.isAlive = true;
    metricsRegistry.setWebSocketCount(wss.clients.size);
    console.log(`[WebSocketGateway] Client "${decoded.email}" connected successfully.`);

    customWs.on("pong", () => {
      customWs.isAlive = true;
    });

    customWs.on("error", (err) => {
      console.error("[WebSocketGateway] Connection error:", err.message);
    });

    customWs.on("close", () => {
      metricsRegistry.setWebSocketCount(wss.clients.size);
      console.log("[WebSocketGateway] Client disconnected.");
    });

    customWs.on("message", async (messageStr: string) => {
      try {
        const data = JSON.parse(messageStr);
        console.log(`[WebSocketGateway] Received message type: "${data.type}"`);

        if (data.type === "conversation.message") {
          const { goalId, message } = data.payload || {};
          if (!goalId || !message) {
            customWs.send(JSON.stringify({
              type: "error",
              payload: { message: "goalId and message are required in payload." }
            }));
            return;
          }

          // 1. Process conversational updates through Roundtable pipeline
          try {
            const { responseMessage, goal } = await guardianCore.processConversation(goalId, message);

            // 2. Stream AI responses incrementally (progressive chunks - §22.16)
            // Split response message into chunks (words) to simulate incremental generation
            const words = responseMessage.split(" ");
            let i = 0;

            const sendNextChunk = () => {
              if (i < words.length) {
                const chunk = words[i] + (i === words.length - 1 ? "" : " ");
                customWs.send(JSON.stringify({
                  type: "conversation.chunk",
                  payload: { chunk }
                }));
                i++;
                // 30ms typing delay per word
                setTimeout(sendNextChunk, 30);
              } else {
                // Done streaming chunks. Send final goal and completion event.
                customWs.send(JSON.stringify({
                  type: "goal.updated",
                  payload: { goal }
                }));
                console.log("[WebSocketGateway] Streamed conversation response fully.");
              }
            };

            // Start typing stream
            sendNextChunk();

          } catch (err: any) {
            customWs.send(JSON.stringify({
              type: "error",
              payload: { message: err.message || "Failed to process message." }
            }));
          }
        } else {
          customWs.send(JSON.stringify({
            type: "error",
            payload: { message: `Unknown message type: "${data.type}"` }
          }));
        }
      } catch (err) {
        customWs.send(JSON.stringify({
          type: "error",
          payload: { message: "Malformed JSON payload." }
        }));
      }
    });
  });
}
