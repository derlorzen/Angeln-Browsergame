// Typen für rooms.mjs (ohne @types/node: Anfrage/Antwort sind node:http-Objekte)
/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeCode(raw: unknown): string;
export function createRooms(opts?: { now?: () => number }): {
  handle(req: any, res: any): Promise<boolean>;
  rooms: Map<string, unknown>;
  stop(): void;
};
