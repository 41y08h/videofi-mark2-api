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

      if (initiator.state.call != CallState.idle) return;

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

      const timeout = setTimeout(() => {
        receiver.state = {
          call: CallState.idle,
          remoteId: undefined,
        };
        initiator.state = {
          call: CallState.idle,
          remoteId: undefined,
        };

        console.log("timeout");

        initiator.socket.emit("outgoing-time-out");
        receiver.socket.emit("incoming-time-out");
      }, 10 * 1000);

      initiator.state = {
        call: CallState.outgoing,
        remoteId: receiver.id,
        timeout,
      };
      receiver.state = {
        call: CallState.incoming,
        remoteId: initiator.id,
        timeout,
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
      if (!initiator || initiator.state.call !== CallState.outgoing)
        return ack({
          error: {
            code: "UNKNOWN",
            message: "Something went wrong",
          },
        });

      clearTimeout(initiator.state.timeout);

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
      const transmitter = connectedClients.getBySocketId(socket.id);

      if (!transmitter) return;
      if (transmitter.state.call == CallState.idle) return;

      const receiver = connectedClients.getById(transmitter.state.remoteId);

      receiver?.socket.emit("ice-candidate", {
        candidate: data.candidate,
      });
    });

    socket.on("reject-offer", () => {
      const receiver = connectedClients.getBySocketId(socket.id);

      if (!receiver) return;
      if (receiver.state.call !== CallState.incoming) return;

      const initiator = connectedClients.getById(receiver.state.remoteId);
      if (!initiator) return;

      clearTimeout(receiver.state.timeout);

      receiver.state = {
        call: CallState.idle,
        remoteId: undefined,
      };
      initiator.state = {
        call: CallState.idle,
        remoteId: undefined,
      };

      initiator.socket.emit("offer-rejected");
    });

    socket.on("end-offer", () => {
      const initiator = connectedClients.getBySocketId(socket.id);
      if (!initiator) return;
      if (initiator.state.call !== CallState.outgoing) return;

      const receiver = connectedClients.getById(initiator.state.remoteId);
      if (!receiver) return;

      clearTimeout(initiator.state.timeout);

      receiver.state = {
        call: CallState.idle,
        remoteId: undefined,
      };
      initiator.state = {
        call: CallState.idle,
        remoteId: undefined,
      };

      receiver.socket.emit("offer-ended");
    });

    socket.on("disconnect-call", (data) => {
      const initiator = connectedClients.getBySocketId(socket.id);
      if (!initiator) return;

      if (initiator.state.call !== CallState.connected) return;
      const receiver = connectedClients.getById(initiator.state.remoteId);
      if (!receiver) return;

      receiver.state = {
        call: CallState.idle,
        remoteId: undefined,
      };
      initiator.state = {
        call: CallState.idle,
        remoteId: undefined,
      };

      receiver.socket.emit("call-disconnected");
    });
  });

  io.listen(5000);
  console.log("WS server started on port 5000");
}

main();
