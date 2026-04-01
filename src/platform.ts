export interface PlatformContext {
  platform: "discord" | "telegram";
  threadId: string;
  threadName: string;
  sendTyping: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  sendFile: (filePath: string, message?: string) => Promise<void>;
  /** Discord-only: send a sticker by ID */
  sendSticker?: (stickerId: string) => Promise<void>;
}
