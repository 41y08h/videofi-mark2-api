import { Socket } from "socket.io";

export enum CallState {
  idle,
  outgoing,
  incoming,
  connected,
}

export class Client {
  id: number;
  socket: Socket;
  callState: CallState;
  inCallWith: Client | null;

  constructor(id: number, socket: Socket) {
    this.id = id;
    this.socket = socket;
    this.callState = CallState.idle;
    this.inCallWith = null;
  }
}

function shortId(list?: number[]) {
  const id = Math.floor(100000 + Math.random() * 900000);
  if (!list) return id;

  return list.includes(id) ? shortId(list) : id;
}

export default class ConnectedClients {
  clients: Client[];
  private generatedIds: number[];

  constructor() {
    this.clients = [];
    this.generatedIds = [];
  }

  add(socket: Socket) {
    const client = new Client(shortId(this.generatedIds), socket);
    this.generatedIds.push(client.id);
    this.clients.push(client);
    return client;
  }

  getBySocketId(socketId: string) {
    const client = this.clients.find((client) => client.socket.id === socketId);
    return client;
  }

  getById(id: number | string) {
    const client = this.clients.find((client) => client.id == id);
    return client;
  }

  remove(socketId: string) {
    this.generatedIds = this.generatedIds.filter(
      (id) => this.getBySocketId(socketId)?.id !== id
    );
    this.clients = this.clients.filter(
      (client) => client.socket.id !== socketId
    );
  }
}
