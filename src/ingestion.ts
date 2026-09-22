import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Connection, PublicKey, type Logs } from "@solana/web3.js";
import type { AppConfig } from "./config.js";

const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMPSWAP_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const WSOL_MINT = "So11111111111111111111111111111111111111112";

const PUMP_TRADE_EVENT = Uint8Array.from([189, 219, 127, 211, 78, 230, 97, 238]);
const PUMPSWAP_BUY_EVENT = Uint8Array.from([103, 244, 82, 31, 44, 245, 119, 119]);

export interface FinalizedBuyEvent {
  eventId: string;
  signature: string;
  slot: number;
  source: "pump" | "pumpswap";
  mint: string;
  buyer: string;
  quoteMint: string;
  buyVolumeLamports: string;
  observedAt: string;
}

export interface BuyVolumeWindow {
  mint: string;
  fromSlot?: number;
  toSlot?: number;
  eventCount: number;
  buyVolumeLamports: string;
  reflectionPoolLamports: string;
  reflectionRateBps: number;
  events: FinalizedBuyEvent[];
}

class Reader {
  private readonly data: Uint8Array;
  private offset = 0;

  constructor(bytes: Uint8Array) {
    this.data = bytes;
  }

  u64(): bigint {
    if (this.offset + 8 > this.data.length) throw new Error("event payload is truncated");
    const value = new DataView(this.data.buffer, this.data.byteOffset + this.offset, 8).getBigUint64(0, true);
    this.offset += 8;
    return value;
  }

  pubkey(): string {
    if (this.offset + 32 > this.data.length) throw new Error("event payload is truncated");
    const value = new PublicKey(this.data.slice(this.offset, this.offset + 32)).toBase58();
    this.offset += 32;
    return value;
  }

  bool(): boolean {
    if (this.offset + 1 > this.data.length) throw new Error("event payload is truncated");
    return this.data[this.offset++] !== 0;
  }
}

function equalPrefix(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

function decodeLogData(line: string): Uint8Array | undefined {
  const marker = "Program data: ";
  if (!line.startsWith(marker)) return undefined;
  try {
    return Uint8Array.from(Buffer.from(line.slice(marker.length), "base64"));
  } catch {
    return undefined;
  }
}

function parsePumpEvent(data: Uint8Array, expectedMint: string): Omit<FinalizedBuyEvent, "eventId" | "signature" | "slot" | "observedAt"> | undefined {
  if (!equalPrefix(data, PUMP_TRADE_EVENT)) return undefined;
  const reader = new Reader(data.slice(8));
  const mint = reader.pubkey();
  const solAmount = reader.u64();
  reader.u64(); // token_amount
  const isBuy = reader.bool();
  const buyer = reader.pubkey();
  if (!isBuy || mint !== expectedMint || solAmount <= 0n) return undefined;
  return {
    source: "pump",
    mint,
    buyer,
    quoteMint: WSOL_MINT,
    buyVolumeLamports: solAmount.toString()
  };
}

function parsePumpSwapBuyEvent(data: Uint8Array): { pool: string; buyer: string; quoteAmountLamports: bigint } | undefined {
  if (!equalPrefix(data, PUMPSWAP_BUY_EVENT)) return undefined;
  const reader = new Reader(data.slice(8));
  reader.u64(); // timestamp
  reader.u64(); // base_amount_out
  reader.u64(); // max_quote_amount_in
  reader.u64(); // user_base_token_reserves
  reader.u64(); // user_quote_token_reserves
  reader.u64(); // pool_base_token_reserves
  reader.u64(); // pool_quote_token_reserves
  const quoteAmountIn = reader.u64();
  reader.u64(); // lp_fee_basis_points
  reader.u64(); // lp_fee
  reader.u64(); // protocol_fee_basis_points
  reader.u64(); // protocol_fee
  reader.u64(); // quote_amount_in_with_lp_fee
  reader.u64(); // user_quote_amount_in
  const pool = reader.pubkey();
  const buyer = reader.pubkey();
  return quoteAmountIn > 0n ? { pool, buyer, quoteAmountLamports: quoteAmountIn } : undefined;
}

async function pumpSwapPoolMints(connection: Connection, pool: string): Promise<{ baseMint: string; quoteMint: string } | undefined> {
  const account = await connection.getAccountInfo(new PublicKey(pool), "finalized");
  if (!account || !account.owner.equals(PUMPSWAP_PROGRAM_ID) || account.data.length < 107) return undefined;
  const data = account.data;
  const baseMint = new PublicKey(data.slice(43, 75)).toBase58();
  const quoteMint = new PublicKey(data.slice(75, 107)).toBase58();
  return { baseMint, quoteMint };
}

function eventFile(config: AppConfig): string {
  return join(config.dataDir, "ingestion", "buy-events.jsonl");
}

async function loadSeen(config: AppConfig): Promise<Set<string>> {
  try {
    const text = await readFile(eventFile(config), "utf8");
    return new Set(text.split("\n").filter(Boolean).map((line) => {
      try { return (JSON.parse(line) as FinalizedBuyEvent).eventId; } catch { return ""; }
    }).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function appendEvents(config: AppConfig, events: FinalizedBuyEvent[]): Promise<void> {
  if (!events.length) return;
  const path = eventFile(config);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");
}

async function decodeLogs(
  config: AppConfig,
  connection: Connection,
  signature: string,
  slot: number,
  logs: string[],
  seen: Set<string>
): Promise<FinalizedBuyEvent[]> {
  const events: FinalizedBuyEvent[] = [];
  let index = 0;
  for (const line of logs) {
    const data = decodeLogData(line);
    if (!data) continue;

    const pump = parsePumpEvent(data, config.mint);
    if (pump) {
      const eventId = `${signature}:pump:${index++}`;
      if (!seen.has(eventId)) {
        events.push({ eventId, signature, slot, ...pump, observedAt: new Date().toISOString() });
        seen.add(eventId);
      }
      continue;
    }

    const swap = parsePumpSwapBuyEvent(data);
    if (!swap) continue;
    const pool = await pumpSwapPoolMints(connection, swap.pool);
    if (!pool || pool.baseMint !== config.mint || pool.quoteMint !== WSOL_MINT) continue;

    const eventId = `${signature}:pumpswap:${index++}`;
    if (!seen.has(eventId)) {
      events.push({
        eventId,
        signature,
        slot,
        source: "pumpswap",
        mint: config.mint,
        buyer: swap.buyer,
        quoteMint: pool.quoteMint,
        buyVolumeLamports: swap.quoteAmountLamports.toString(),
        observedAt: new Date().toISOString()
      });
      seen.add(eventId);
    }
  }
  return events;
}

async function fetchSignatureLogs(connection: Connection, signature: string) {
  return connection.getTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0
  });
}

export async function scanFinalizedBuyVolume(
  config: AppConfig,
  options: { pages?: number; pageSize?: number; before?: string } = {}
): Promise<BuyVolumeWindow> {
  const connection = new Connection(config.rpcUrl, "finalized");
  const seen = await loadSeen(config);
  const collected: FinalizedBuyEvent[] = [];
  let before = options.before;
  const pages = Math.max(1, Math.min(options.pages ?? 5, 100));
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 1000, 1000));

  for (let page = 0; page < pages; page += 1) {
    const signatures = await connection.getSignaturesForAddress(new PublicKey(config.mint), {
      limit: pageSize,
      before
    }, "finalized");
    if (!signatures.length) break;

    for (const item of signatures) {
      if (item.err) continue;
      const tx = await fetchSignatureLogs(connection, item.signature);
      if (!tx?.meta?.logMessages) continue;
      const events = await decodeLogs(config, connection, item.signature, tx.slot, tx.meta.logMessages, seen);
      collected.push(...events);
    }
    before = signatures[signatures.length - 1]?.signature;
    if (signatures.length < pageSize) break;
  }

  await appendEvents(config, collected);
  return summarizeBuyVolume(config.mint, collected);
}

export async function loadStoredBuyEvents(config: AppConfig): Promise<FinalizedBuyEvent[]> {
  try {
    const text = await readFile(eventFile(config), "utf8");
    return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as FinalizedBuyEvent);
  } catch {
    return [];
  }
}

export function summarizeBuyVolume(mint: string, events: FinalizedBuyEvent[]): BuyVolumeWindow {
  const filtered = events.filter((event) => event.mint === mint);
  const total = filtered.reduce((sum, event) => sum + BigInt(event.buyVolumeLamports), 0n);
  return {
    mint,
    eventCount: filtered.length,
    buyVolumeLamports: total.toString(),
    reflectionPoolLamports: ((total * 2n) / 10_000n).toString(),
    reflectionRateBps: 2,
    events: filtered
  };
}

export async function watchFinalizedBuys(
  config: AppConfig,
  onEvent?: (event: FinalizedBuyEvent) => void
): Promise<() => Promise<void>> {
  const connection = new Connection(config.rpcUrl, "finalized");
  const seen = await loadSeen(config);
  const subscriptions: number[] = [];

  const subscribe = async (programId: PublicKey): Promise<void> => {
    const id = await connection.onLogs(programId, async (result: Logs, context) => {
      if (result.err) return;
      try {
        const events = await decodeLogs(config, connection, result.signature, context.slot, result.logs, seen);
        await appendEvents(config, events);
        for (const event of events) onEvent?.(event);
      } catch (error) {
        console.error(`ingestion error for ${result.signature}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, "finalized");
    subscriptions.push(id);
  };

  await subscribe(PUMP_PROGRAM_ID);
  await subscribe(PUMPSWAP_PROGRAM_ID);

  return async () => {
    for (const id of subscriptions) await connection.removeOnLogsListener(id);
  };
}

export async function getCreatorRewardsBalance(config: AppConfig): Promise<bigint> {
  const connection = new Connection(config.rpcUrl, "finalized");
  return BigInt(await connection.getBalance(new PublicKey(config.creatorRewardsAddress), "finalized"));
}
