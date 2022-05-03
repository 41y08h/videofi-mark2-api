import "dotenv/config";
import { Server } from "socket.io";
import ConnectedClients, { CallState } from "./ConnectedClients";

const connectedClients = new ConnectedClients();

async function main() {
  const io: Server = require("socket.io")({
    cors: true,
    origins: "*",
    allowEIO3: true,
  });

  io.use(async (socket, next) => {
    const existingClient = connectedClients.getBySocketId(socket.id);
    if (existingClient) return next();

    connectedClients.add(socket);
    next();
  });

  io.on("connection", (socket) => {
    console.log("New connection");

    socket.on("get-id", () => {
      const client = connectedClients.getBySocketId(socket.id);
      if (client) socket.emit("get-id/callback", client.id);
    });

    socket.onAny((event) => {
      console.log(`received event: ${event}`);
    });

    socket.on("offer", (data, ack) => {
      const initiator = connectedClients.getBySocketId(socket.id);
      const receiver = connectedClients.getById(data.remoteId);

      if (!initiator || !receiver)
        return ack({
          error: {
            code: "UNKNOWN",
            message: "Something went wrong",
          },
        });

      if (initiator.id === receiver.id)
        return ack({
          error: {
            code: "BAD_REQUEST",
            message: "You can't connect to yourself",
          },
        });

      if (receiver.state.call !== CallState.idle)
        return ack({
          error: {
            code: "USER_BUSY",
            message: "The user is busy",
          },
        });

      initiator.state = {
        call: CallState.outgoing,
        remoteId: receiver.id,
      };
      receiver.state = {
        call: CallState.incoming,
        remoteId: initiator.id,
      };

      receiver.socket.emit("offer", {
        remoteId: initiator.id,
        signal: data.signal,
      });

      ack({ success: true });
    });

    socket.on("answer", (data, ack) => {
      const receiver = connectedClients.getBySocketId(socket.id);
      if (!receiver)
        return ack({
          error: {
            code: "UNKNOWN",
            message: "Something went wrong",
          },
        });

      if (receiver.state.call !== CallState.incoming)
        return ack({
          error: {
            code: "BAD_REQUEST",
            message: "No incoming call",
          },
        });

      const initiator = connectedClients.getById(receiver.state.remoteId);
      if (!initiator)
        return ack({
          error: {
            code: "UNKNOWN",
            message: "Something went wrong",
          },
        });

      initiator.state = {
        call: CallState.connected,
        remoteId: receiver.id,
      };

      receiver.state = {
        call: CallState.connected,
        remoteId: initiator.id,
      };

      initiator.socket.emit("answer", {
        signal: data.signal,
      });

      ack({ success: true });
    });

    socket.on("ice-candidate", (data) => {
      const initiator = connectedClients.getBySocketId(socket.id);
      const receiver = connectedClients.getById(data.remoteId);

      receiver?.socket.emit("ice-candidate", {
        remoteId: initiator?.id,
        data: data.data,
      });
    });

    socket.on("disconnect-call", (data) => {
      const initiator = connectedClients.getBySocketId(socket.id);
      const receiver = connectedClients.getById(data.remoteId);

      receiver?.socket.emit("disconnect-call", {
        remoteId: initiator?.id,
      });
    });
  });

  io.listen(5000);
  console.log("WS server started on port 5000");
}

main();
