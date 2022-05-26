import { Socket } from "socket.io";

export enum CallState {
  idle,
  outgoing,
  incoming,
  connected,
}

interface StateIdle {
  call: CallState.idle;
  remoteId: undefined;
}

interface StateOutgoingIncoming {
  call: CallState.outgoing | CallState.incoming;
  remoteId: number;
  timeout: NodeJS.Timeout;
}

interface StateConnected {
  call: CallState.connected;
  remoteId: number;
}

type State = StateIdle | StateOutgoingIncoming | StateConnected;

interface ClientBase {
  id: number;
  socket: Socket;
  state: State;
}

export class Client implements ClientBase {
  id: number;
  socket: Socket;
  state: State;

  constructor(id: number, socket: Socket) {
    this.id = id;
    this.socket = socket;
    this.state = {
      call: CallState.idle,
      remoteId: undefined,
    };
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
