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

      if (receiver.callState !== CallState.idle)
        return ack({
          error: {
            code: "USER_BUSY",
            message: "The user is busy",
          },
        });

      initiator.callState = CallState.outgoing;
      initiator.inCallWith = receiver;

      receiver.callState = CallState.incoming;
      receiver.inCallWith = initiator;

      receiver.socket.emit("offer", {
        remoteId: initiator?.id,
        data: data.data,
      });

      ack({ success: true });

      const offerTimeout = setTimeout(() => {
        // Notiy the initiator that the call was timed out
        initiator.socket.emit("offer/timeout");

        // Unsubscribe the handlers
        receiver.socket.off("end-offer", clearOfferTimeout);
        receiver.socket.off("answer", clearOfferTimeout);
      }, 20 * 1000);

      const clearOfferTimeout = () => {
        clearTimeout(offerTimeout);
      };

      initiator.socket.on("end-offer", clearOfferTimeout);
      receiver.socket.once("answer", clearOfferTimeout);
    });

    socket.on("end-offer", () => {
      const initiator = connectedClients.getBySocketId(socket.id);
      if (initiator?.callState !== CallState.outgoing) return;
      initiator?.inCallWith?.socket.emit("offer-ended");
    });

    socket.on("answer", (data) => {
      const initiator = connectedClients.getBySocketId(socket.id);
      const receiver = connectedClients.getById(data.remoteId);

      receiver?.socket.emit("answer", {
        remoteId: initiator?.id,
        data: data.data,
      });
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
