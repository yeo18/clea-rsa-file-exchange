import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs'
import { parseMessageEnvelope, type MessageEnvelope } from '../crypto/messageEnvelope'

export type IncomingMessage = {
  messageId: string
  senderEmail: string
  envelope: MessageEnvelope
}

export type DeliveryReceipt = {
  messageId: string
  delivered: boolean
  code: string
}

export type MessageSocketHandlers = {
  onConnected: () => void
  onDisconnected: () => void
  onIncoming: (message: IncomingMessage) => void
  onReceipt: (receipt: DeliveryReceipt) => void
  onError: () => void
}

export class MessageSocket {
  private readonly client: Client
  private readonly handlers: MessageSocketHandlers

  constructor(handlers: MessageSocketHandlers) {
    this.handlers = handlers
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.client = new Client({
      brokerURL: `${protocol}//${window.location.host}/ws`,
      reconnectDelay: 3_000,
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      onConnect: () => this.subscribe(),
      onWebSocketClose: () => this.handlers.onDisconnected(),
      onWebSocketError: () => this.handlers.onError(),
      onStompError: () => this.handlers.onError(),
    })
  }

  connect(csrfToken: string): void {
    this.client.connectHeaders = { 'X-CSRF-TOKEN': csrfToken }
    try {
      this.client.activate()
    } catch {
      this.handlers.onError()
    }
  }

  publish(messageId: string, recipientId: string, envelope: MessageEnvelope): void {
    if (!this.client.connected) {
      throw new Error('La connexion de messagerie est indisponible.')
    }
    this.client.publish({
      destination: '/app/messages',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId, recipientId, envelope }),
    })
  }

  async disconnect(): Promise<void> {
    await this.client.deactivate()
  }

  private subscribe(): void {
    let messagesSubscription: StompSubscription
    let receiptsSubscription: StompSubscription
    try {
      messagesSubscription = this.client.subscribe(
        '/user/queue/messages',
        (message) => this.handleMessage(message),
      )
      receiptsSubscription = this.client.subscribe(
        '/user/queue/receipts',
        (message) => this.handleReceipt(message),
      )
    } catch {
      this.handlers.onError()
      return
    }
    if (messagesSubscription && receiptsSubscription) {
      this.handlers.onConnected()
    }
  }

  private handleMessage(message: IMessage): void {
    const value = parseJson(message.body)
    if (
      !isRecord(value)
      || typeof value.messageId !== 'string'
      || typeof value.senderEmail !== 'string'
      || !isRecord(value.envelope)
    ) {
      this.handlers.onError()
      return
    }
    try {
      this.handlers.onIncoming({
        messageId: value.messageId,
        senderEmail: value.senderEmail,
        envelope: parseMessageEnvelope(value.envelope),
      })
    } catch {
      this.handlers.onError()
    }
  }

  private handleReceipt(message: IMessage): void {
    const value = parseJson(message.body)
    if (
      !isRecord(value)
      || typeof value.messageId !== 'string'
      || typeof value.delivered !== 'boolean'
      || typeof value.code !== 'string'
    ) {
      this.handlers.onError()
      return
    }
    this.handlers.onReceipt({
      messageId: value.messageId,
      delivered: value.delivered,
      code: value.code,
    })
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
