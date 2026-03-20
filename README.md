# snap-coin-msg

A wallet-to-wallet structured messaging app built on the SNAP Coin network.
Uses micro-payment amounts as opcodes to encode meaning into transactions.
Also supports plain SNAP transfers — all activity visible in a unified ledger.

## How It Works

SNAP Coin is feeless by design. That makes it possible to send dozens of
micro-payment transactions as a conversation without any cost beyond the
dust amounts themselves — which arrive at the destination wallet intact.

This app encodes structured messages as opcode amounts using the
[snap-coin-opcode](https://github.com/OIEIEIO/snap-coin-opcode) dictionary.
Every transaction on chain is a word, phrase, or signal. Any wallet that
knows the dictionary can read the conversation directly from the chain.
```
user picks a word from the keyboard
→ compiled to opcode amount  e.g. 0.00100010 = HELLO
→ submitted as a real SNAP transaction via snap-coin-pay
→ receiver sees the amount confirmed on chain
→ decoded back to meaning via the dictionary
```

Plain SNAP transfers work the same way — enter an amount, pick a contact,
confirm with PIN. Both opcodes and transfers appear in the same ledger.

## Dependencies
```
snap-coin-pay    — atomic deposit/withdrawal processing
snap-coin-opcode — opcode dictionary, encoder, decoder
snap-coin        — SNAP Coin node and chain types
```

## Stack

- Rust / Axum — backend server
- WebSocket — live chain event streaming
- Vanilla HTML/CSS/JS — frontend, no framework
- SNAP node API on port 3003

## Features

- Wallet-to-wallet opcode messaging via semantic keyboard
- Plain SNAP transfers — amount input with PIN confirmation
- Unified ledger — all transactions in and out, opcodes and transfers
- Live chain event stream — blocks, mempool, confirmations
- Auto-refresh — balances update on every block, history every 20 blocks
- Current chain height display
- Wallet balance display with hide/show toggle
- Multi-wallet support — left and right columns, moveable
- Wallets start collapsed — expand what you need
- Per-wallet PIN encryption — private key never stored in plaintext
- Secure wallet creation — full address and key shown once with copy buttons
- Contact nicknames for addressing
- Watchlist for read-only pair monitoring
- Node connection status
- Decode view toggle — raw amounts or decoded meanings

## Setup
```bash
git clone https://github.com/OIEIEIO/snap-coin-msg
cd snap-coin-msg
```

Requires local paths to `snap-coin-pay` and `snap-coin-opcode`:
```toml
snap-coin-pay    = { path = "../snap-coin-pay" }
snap-coin-opcode = { path = "../snap-coin-opcode" }
```

Copy and edit the env file:
```bash
cp .env.example .env
```
```
BIND_ADDR=0.0.0.0:8080
NODE_API=127.0.0.1:3003
DICTIONARY_PATH=../snap-coin-opcode/dictionary/dictionary.json
OPCODE_GENESIS_HEIGHT=123114
```

Build and run:
```bash
cargo run
```

Open in browser at the URL printed on startup.

## Opcode Format

Opcodes are encoded in SNAP's 8 decimal places:
```
0.0FFOOOO0

0     = reserved
FF    = family   (00-99)
OOOO  = opcode   (0000-9999)
0     = reserved
```

Example:
```
0.00100010  = family 01 (handshake)  opcode 0001  = HELLO
0.00300210  = family 03 (scheduling) opcode 0021  = MEET_TOMORROW_1400
0.00700010  = family 07 (question)   opcode 0001  = AVAILABLE?
```

## Dictionary

The opcode dictionary lives in
[snap-coin-opcode](https://github.com/OIEIEIO/snap-coin-opcode) and is the
single source of truth for all words, phrases, families and meanings.

Current version: **v0.3.0** — 83 opcodes across 8 families.

| Family | Name        | Words |
|--------|-------------|-------|
| 01     | handshake   | HELLO, ACK, BYE, NICE_TO_MEET_YOU, YOURE_WELCOME |
| 02     | response    | YES, NO, ACCEPT, REJECT |
| 03     | scheduling  | Meet Today/Tomorrow 06:00–17:00 |
| 04     | workflow    | QUOTE → PAYMENT lifecycle |
| 05     | status      | URGENT, PENDING, DELAYED, CANCELLED |
| 06     | single_word | AVAILABLE, OK, THANKS, SORRY, GOOD, GREAT, DONE, READY, BUSY + more |
| 07     | question    | AVAILABLE?, CONFIRMED?, QUOTE_READY?, JOB_COMPLETE?, PAYMENT_SENT? |
| 08     | answer      | YES/NO paired answers to family 07 questions |

Any wallet with the dictionary can decode every conversation ever sent on
the protocol directly from the chain — no server required.

## Why This Is Only Possible on a Feeless Chain

On most blockchain networks every transaction carries a fee. Sending 10
individual opcode transactions to have a short conversation would cost more
in fees than the messages are worth.

SNAP Coin is feeless by design. A full wallet-to-wallet conversation costs
nothing beyond the dust amounts used as opcodes — and those amounts are not
burned, they arrive at the destination wallet intact.

This transforms SNAP transactions from simple value transfer into a
structured communication layer. The chain becomes a permanent, ordered,
machine-readable message archive.

## Related

- [snap-coin-opcode](https://github.com/OIEIEIO/snap-coin-opcode) — opcode library
- [snapcoin-db-inspector](https://github.com/OIEIEIO/snapcoin-db-inspector) — chain scanner

## License

MIT