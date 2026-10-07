import type { Clock, Ids } from "../ports";

export const systemClock: Clock = { now: () => new Date() };

export const cryptoIds: Ids = { uuid: () => crypto.randomUUID() };
