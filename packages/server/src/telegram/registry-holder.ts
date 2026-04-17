/**
 * Singleton holder for BotRegistry — lets command handlers access peer bots
 * without creating a circular import between TelegramBridge and BotRegistry.
 *
 * Set once at server boot (index.ts). Read anywhere.
 */

import type { BotRegistry } from "./bot-registry.js";

let registry: BotRegistry | undefined;

export function setBotRegistry(r: BotRegistry): void {
  registry = r;
}

export function getBotRegistry(): BotRegistry | undefined {
  return registry;
}
