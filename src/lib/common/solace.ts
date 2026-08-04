/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { SolaceConfig } from './types';
import { DEMO_MODE } from './config';
import * as solace from 'solclientjs';

/** Marker delivered to frame subscribers when a feed is explicitly torn down. */
export const INACTIVE_FRAME = 'INACTIVE';

type FrameCallback = (imageData: string) => void;
type JsonCallback = (payload: any) => void;

interface DemoSession {
  connected: boolean;
  demo: boolean;
}

/** Look of the synthetic concourse rendered for a topic while in demo mode. */
export interface DemoFeedOptions {
  /**
   * Render a synthetic concourse animation when nothing is publishing to this
   * topic locally. Viewing rooms opt in; control-panel preview tiles do not,
   * because they must stay dark for the airlines that are not active.
   */
  synthetic?: boolean;
  label?: string;
  code?: string;
  primary?: string;
  accent?: string;
}

/**
 * SolaceCameraClient — thin wrapper over solclientjs for streaming Toronto
 * Pearson terminal camera frames over Solace PubSub+.
 *
 * The control panel publishes JPEG frames as binary attachments with a small
 * text header:  frameId|timestamp|frameSize|<binary JPEG bytes>
 *
 * Unlike a single-feed client, frame callbacks are keyed **per topic** so one
 * session can render several airline feeds at once — the control panel
 * subscribes to all three airline topics to drive its preview wall while
 * publishing to only the active one.
 */
export class SolaceCameraClient {
  private session: solace.Session | DemoSession | null = null;
  private sessionEventCb: any = null;
  private messageEventCb: any = null;
  /** topic -> frame (JPEG data URL) subscribers */
  private frameCallbacks: Map<string, Set<FrameCallback>> = new Map();
  /** topic -> JSON payload subscribers */
  private topicCallbacks: Map<string, Set<JsonCallback>> = new Map();
  private isConnected = false;
  private subscriptions: Set<string> = new Set();
  private demoIntervals: Map<string, number> = new Map();
  private demoOptions: Map<string, DemoFeedOptions> = new Map();
  /** Topics this tab is publishing frames to — suppresses the synthetic feed. */
  private locallyPublished: Set<string> = new Set();
  private frameCounter = 0;
  private static factoryInitialized = false;

  constructor(private config: SolaceConfig) {
    if (!DEMO_MODE) {
      this.initializeSolaceFactory();
    }
  }

  private initializeSolaceFactory(): void {
    if (SolaceCameraClient.factoryInitialized) return;

    try {
      // @ts-ignore
      const factoryProps = new solace.SolclientFactoryProperties();
      factoryProps.profile = solace.SolclientFactoryProfiles.version10;
      solace.SolclientFactory.init(factoryProps);
      SolaceCameraClient.factoryInitialized = true;
      console.log('[OK] Solace factory initialized');
    } catch (error: unknown) {
      console.error('[ERR] Failed to initialize Solace factory:', error);
      throw error;
    }
  }

  async connect(): Promise<void> {
    if (DEMO_MODE) {
      return this.connectDemo();
    }

    return new Promise((resolve, reject) => {
      try {
        const sessionProperties = new solace.SessionProperties({
          url: this.config.url,
          vpnName: this.config.vpnName,
          userName: this.config.username,
          password: this.config.password,
          connectRetries: 3,
          reconnectRetries: 3,
          reconnectRetryWaitInMsecs: 3000
        });

        console.log(`[CONNECT] Attempting Solace connection to: ${this.config.url} (VPN: ${this.config.vpnName})`);
        this.session = solace.SolclientFactory.createSession(sessionProperties);

        this.sessionEventCb = (sessionEvent: any) => {
          const eventType = sessionEvent.type || sessionEvent.sessionEventCode;
          const eventInfo = sessionEvent.infoStr || '';

          if (eventType === solace.SessionEventCode.UP_NOTICE) {
            console.log('[OK] Solace session connected');
            this.isConnected = true;
            resolve();
          } else if (eventType === solace.SessionEventCode.CONNECT_FAILED_ERROR) {
            console.error('[ERR] Solace connection failed:', eventInfo);
            this.isConnected = false;
            reject(new Error(`Connection failed: ${eventInfo}`));
          } else if (eventType === solace.SessionEventCode.DISCONNECTED) {
            console.log('[WARN] Solace session disconnected');
            this.isConnected = false;
          } else if (eventType === solace.SessionEventCode.SUBSCRIPTION_ERROR) {
            console.error('[ERR] Solace subscription error:', eventInfo);
          } else if (eventType === solace.SessionEventCode.RECONNECTING_NOTICE) {
            console.log('[RETRY] Reconnecting to Solace broker...');
          } else if (eventType === solace.SessionEventCode.RECONNECTED_NOTICE) {
            console.log('[OK] Reconnected to Solace broker');
          }
        };

        this.messageEventCb = (message: any) => this.handleMessage(message);

        this.session.on(solace.SessionEventCode.UP_NOTICE, this.sessionEventCb);
        this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, this.sessionEventCb);
        this.session.on(solace.SessionEventCode.DISCONNECTED, this.sessionEventCb);
        this.session.on(solace.SessionEventCode.SUBSCRIPTION_ERROR, this.sessionEventCb);
        this.session.on(solace.SessionEventCode.SUBSCRIPTION_OK, this.sessionEventCb);
        this.session.on(solace.SessionEventCode.MESSAGE, this.messageEventCb);

        this.session.connect();
      } catch (error: unknown) {
        console.error('[ERR] Failed to create Solace session:', error);
        reject(error);
      }
    });
  }

  private async connectDemo(): Promise<void> {
    return new Promise((resolve) => {
      console.log('Running in demo mode - simulating Solace connection');
      setTimeout(() => {
        this.session = { connected: true, demo: true } as DemoSession;
        this.isConnected = true;
        resolve();
      }, 800);
    });
  }

  private isDemoSession(): boolean {
    return DEMO_MODE || !!(this.session && 'demo' in this.session && this.session.demo);
  }

  private brokerSession(): solace.Session | null {
    if (!this.session || !this.isConnected || 'demo' in this.session) return null;
    return this.session as solace.Session;
  }

  private brokerSubscribe(topic: string): void {
    if (this.subscriptions.has(topic)) return;
    const session = this.brokerSession();
    if (!session) {
      console.error(`Solace session not connected — cannot subscribe to ${topic}`);
      return;
    }
    try {
      const destination = solace.SolclientFactory.createTopicDestination(topic);
      session.subscribe(destination, true, topic, 10000);
      this.subscriptions.add(topic);
      console.log(`Subscribed to topic: ${topic}`);
    } catch (error: unknown) {
      console.error(`Failed to subscribe to ${topic}:`, error);
    }
  }

  private brokerUnsubscribe(topic: string): void {
    if (!this.subscriptions.has(topic)) return;
    const session = this.brokerSession();
    if (!session) {
      this.subscriptions.delete(topic);
      return;
    }
    try {
      const destination = solace.SolclientFactory.createTopicDestination(topic);
      session.unsubscribe(destination, true, topic, 10000);
      this.subscriptions.delete(topic);
    } catch (error: unknown) {
      console.error(`Failed to unsubscribe from ${topic}:`, error);
    }
  }

  // ── Frame (video) subscriptions ────────────────────────────────────────────

  /**
   * Subscribe to a camera feed topic. Frames are delivered as JPEG data URLs,
   * or as {@link INACTIVE_FRAME} when the publisher tears the feed down.
   */
  subscribeToFrames(topic: string, onFrame: FrameCallback, demo: DemoFeedOptions = {}): void {
    if (!topic || topic.trim() === '') return;

    const existing = this.frameCallbacks.get(topic);
    if (existing) {
      existing.add(onFrame);
    } else {
      this.frameCallbacks.set(topic, new Set([onFrame]));
    }
    this.demoOptions.set(topic, demo);

    if (this.isDemoSession()) {
      if (demo.synthetic && !this.locallyPublished.has(topic)) {
        this.startDemoFeed(topic);
      }
      return;
    }

    this.brokerSubscribe(topic);
  }

  /** Drop one frame subscriber; unsubscribes from the broker once none remain. */
  unsubscribeFromFrames(topic: string, onFrame?: FrameCallback): void {
    const callbacks = this.frameCallbacks.get(topic);
    if (callbacks && onFrame) {
      callbacks.delete(onFrame);
    }
    if (!callbacks || !onFrame || callbacks.size === 0) {
      this.frameCallbacks.delete(topic);
      this.stopDemoFeed(topic);
      if (!this.isDemoSession()) this.brokerUnsubscribe(topic);
    }
  }

  private emitFrame(topic: string, imageData: string): void {
    const callbacks = this.frameCallbacks.get(topic);
    if (!callbacks) return;
    callbacks.forEach((cb) => cb(imageData));
  }

  // ── JSON (status / control / result) subscriptions ─────────────────────────

  /** Subscribe to a JSON status/control/result topic. */
  subscribeToTopic(topic: string, onMessage: JsonCallback): void {
    if (!topic || topic.trim() === '') return;

    const existing = this.topicCallbacks.get(topic);
    if (existing) {
      existing.add(onMessage);
    } else {
      this.topicCallbacks.set(topic, new Set([onMessage]));
    }

    // In demo mode nothing arrives from a broker; publishControl() loops back
    // to these same callbacks so the local UI still updates.
    if (this.isDemoSession()) return;

    this.brokerSubscribe(topic);
  }

  unsubscribeFromTopic(topic: string, onMessage?: JsonCallback): void {
    const callbacks = this.topicCallbacks.get(topic);
    if (callbacks && onMessage) {
      callbacks.delete(onMessage);
    }
    if (!callbacks || !onMessage || callbacks.size === 0) {
      this.topicCallbacks.delete(topic);
      if (!this.isDemoSession()) this.brokerUnsubscribe(topic);
    }
  }

  private emitJson(topic: string, payload: any): void {
    const callbacks = this.topicCallbacks.get(topic);
    if (!callbacks) return;
    callbacks.forEach((cb) => cb(payload));
  }

  // ── Inbound broker messages ───────────────────────────────────────────────

  private handleMessage(message: any): void {
    try {
      const destination = message.getDestination();
      if (!destination) return;

      const topic = destination.getName();
      const binaryAttachment = message.getBinaryAttachment();
      if (!binaryAttachment) return;

      // JSON status/control/result topics registered via subscribeToTopic()
      if (this.topicCallbacks.has(topic)) {
        let payload: any = null;
        try {
          payload = JSON.parse(binaryAttachment);
        } catch {
          // non-JSON — hand the raw text through so markdown payloads survive
          payload = typeof binaryAttachment === 'string' ? binaryAttachment : null;
        }
        this.emitJson(topic, payload);
        return;
      }

      // Camera feed topics registered via subscribeToFrames()
      if (this.frameCallbacks.has(topic)) {
        try {
          const payload = JSON.parse(binaryAttachment);
          if (payload && payload.type === 'inactive') {
            this.emitFrame(topic, INACTIVE_FRAME);
            return;
          }
        } catch {
          // not JSON — treat as the binary frame format
        }
        this.handleStreamMessage(topic, binaryAttachment);
      }
    } catch (error: unknown) {
      console.error('Error handling message:', error);
    }
  }

  private handleStreamMessage(topic: string, binaryData: string): void {
    try {
      // Parse header: frameId|timestamp|frameSize|<binary JPEG data>
      let pipeCount = 0;
      let headerEndIndex = -1;
      for (let i = 0; i < binaryData.length && pipeCount < 3; i++) {
        if (binaryData.charCodeAt(i) === 124) { // '|'
          pipeCount++;
          if (pipeCount === 3) { headerEndIndex = i; break; }
        }
      }
      if (headerEndIndex === -1) {
        console.warn('Invalid frame format: header not found');
        return;
      }

      const jpegData = binaryData.substring(headerEndIndex + 1);
      const base64Data = btoa(jpegData);
      this.emitFrame(topic, `data:image/jpeg;base64,${base64Data}`);
    } catch (error: unknown) {
      console.error('Error handling stream message:', error);
    }
  }

  // ── Publishing ────────────────────────────────────────────────────────────

  /** Publish a JSON control/status message. */
  publishControl(topic: string, payload: any): void {
    if (this.isDemoSession()) {
      console.log(`[DEMO] Published to ${topic}:`, payload);
      // Loop back so the publishing tab's own subscribers still update.
      if (this.topicCallbacks.has(topic)) {
        this.emitJson(topic, payload);
      } else if (this.frameCallbacks.has(topic) && payload?.type === 'inactive') {
        this.emitFrame(topic, INACTIVE_FRAME);
      }
      return;
    }

    const session = this.brokerSession();
    if (!session) {
      console.warn(`[WARN] Cannot publish to ${topic}: session not ready (connected=${this.isConnected})`);
      return;
    }

    try {
      const message = solace.SolclientFactory.createMessage();
      message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
      message.setBinaryAttachment(JSON.stringify(payload));
      message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
      session.send(message);
    } catch (error: unknown) {
      console.error('Failed to publish control message:', error);
    }
  }

  /** Publish a single JPEG camera frame to the given topic. */
  publishVideoFrame(topic: string, jpegBuffer: ArrayBuffer): void {
    this.locallyPublished.add(topic);
    // A real publisher supersedes the synthetic demo animation on this topic.
    this.stopDemoFeed(topic);

    if (this.isDemoSession()) {
      if (this.frameCallbacks.has(topic)) {
        this.emitFrame(topic, `data:image/jpeg;base64,${arrayBufferToBase64(jpegBuffer)}`);
      }
      return;
    }

    const session = this.brokerSession();
    if (!session) return;

    try {
      const frameId = String(this.frameCounter++);
      const timestamp = String(Date.now());
      const frameSize = String(jpegBuffer.byteLength);
      const headerBytes = new TextEncoder().encode(`${frameId}|${timestamp}|${frameSize}|`);
      const jpegBytes = new Uint8Array(jpegBuffer);
      const combined = new Uint8Array(headerBytes.length + jpegBytes.length);
      combined.set(headerBytes, 0);
      combined.set(jpegBytes, headerBytes.length);

      const message = solace.SolclientFactory.createMessage();
      message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
      message.setBinaryAttachment(combined);
      message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
      session.send(message);
    } catch (error: unknown) {
      console.error('Failed to publish video frame:', error);
    }
  }

  /** Tell subscribers of a feed topic that the camera has moved elsewhere. */
  publishFeedInactive(topic: string): void {
    this.locallyPublished.delete(topic);
    this.publishControl(topic, { type: 'inactive', timestamp: new Date().toISOString() });
  }

  // ── Demo feed ─────────────────────────────────────────────────────────────

  /**
   * Render a synthetic Pearson concourse animation for a topic at ~10 FPS so the
   * viewing rooms are demonstrable with no broker and no camera.
   */
  private startDemoFeed(topic: string): void {
    if (this.demoIntervals.has(topic)) return;

    const id = window.setInterval(() => {
      if (!this.frameCallbacks.has(topic)) return;
      const options = this.demoOptions.get(topic) ?? {};
      const dataUrl = renderSyntheticConcourse(options, topic);
      if (dataUrl) this.emitFrame(topic, dataUrl);
    }, 100);

    this.demoIntervals.set(topic, id);
  }

  private stopDemoFeed(topic: string): void {
    const id = this.demoIntervals.get(topic);
    if (id !== undefined) {
      clearInterval(id);
      this.demoIntervals.delete(topic);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** True when frames can actually reach a broker. */
  isReadyForPublish(): boolean {
    return DEMO_MODE || this.brokerSession() !== null;
  }

  isSessionConnected(): boolean {
    return this.isConnected && this.session !== null;
  }

  disconnect(): void {
    this.demoIntervals.forEach((id) => clearInterval(id));
    this.demoIntervals.clear();
    this.frameCallbacks.clear();
    this.topicCallbacks.clear();
    this.locallyPublished.clear();

    if (this.isDemoSession()) {
      this.session = null;
      this.isConnected = false;
      return;
    }

    const session = this.brokerSession();
    if (!session) return;

    try {
      this.subscriptions.forEach((topic) => {
        const destination = solace.SolclientFactory.createTopicDestination(topic);
        session.unsubscribe(destination, true, topic, 10000);
      });
      this.subscriptions.clear();
      session.disconnect();
      session.dispose();
      this.session = null;
      this.isConnected = false;
    } catch (error: unknown) {
      console.error('Error during disconnect:', error);
    }
  }
}

/** Chunked ArrayBuffer -> base64, avoiding a huge spread into String.fromCharCode. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Draw one frame of the synthetic demo concourse and return it as a data URL. */
function renderSyntheticConcourse(options: DemoFeedOptions, topic: string): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const primary = options.primary ?? '#0057B8';
  const accent = options.accent ?? '#4FA8E0';
  const label = options.label ?? 'Toronto Pearson';
  const code = options.code ?? 'YYZ';
  const time = Date.now() / 1000;

  // Hall + floor
  ctx.fillStyle = '#0A1628';
  ctx.fillRect(0, 0, 640, 360);
  const floor = ctx.createLinearGradient(0, 200, 0, 360);
  floor.addColorStop(0, '#16233B');
  floor.addColorStop(1, '#0A1628');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 200, 640, 160);

  // Perspective floor grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(320 + i * 28, 200);
    ctx.lineTo(320 + i * 120, 360);
    ctx.stroke();
  }
  for (let y = 210; y < 360; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(640, y);
    ctx.stroke();
  }

  // Check-in counter band + airline signage
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 150, 640, 50);
  ctx.fillStyle = primary;
  ctx.fillRect(24, 158, 190, 34);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(`${code} CHECK-IN`, 36, 181);

  // Departure board strip
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(400, 152, 216, 44);
  ctx.fillStyle = accent;
  ctx.font = 'bold 12px monospace';
  for (let row = 0; row < 3; row++) {
    const flight = `${code}${(120 + row * 37 + Math.floor(time / 8)) % 900}`;
    ctx.fillText(`${flight}  ON TIME`, 410, 168 + row * 13);
  }

  // Passengers milling in the hall
  for (let i = 0; i < 26; i++) {
    const seed = i * 12.9898;
    const drift = ((time * (14 + (i % 5) * 4) + i * 47) % 700) - 30;
    const depth = 0.45 + ((Math.sin(seed) + 1) / 2) * 0.55;
    const x = i % 2 === 0 ? drift : 640 - drift;
    const y = 210 + depth * 120;
    const scale = depth * 1.5;
    ctx.fillStyle = `rgba(200, 220, 245, ${0.25 + depth * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, 3.2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 2.6 * scale, y + 2.6 * scale, 5.2 * scale, 13 * scale);
  }

  // Queue snake toward the counter
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(150, 330);
  ctx.bezierCurveTo(260, 300, 200, 250, 320, 225);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px Arial';
  ctx.fillText(label, 20, 36);
  ctx.fillStyle = accent;
  ctx.font = '12px monospace';
  ctx.fillText(new Date().toLocaleTimeString(), 20, 56);
  ctx.fillText(topic, 20, 74);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('SYNTHETIC DEMO FEED · NO BROKER', 20, 348);

  return canvas.toDataURL('image/jpeg', 0.7);
}
