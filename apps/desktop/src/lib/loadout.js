import { deflateSync, inflateSync } from 'fflate';
import { capitalize } from '@/lib/text';
// ── Loadout codec ─────────────────────────────────────────────────────────────
//
// A generic, WoW-talent-loadout-style binary share codec: pack *bits and
// indices* (not JSON), DEFLATE the body, frame it with a version + checksum, and
// emit a short, opaque, clipboard-safe base64url string under a namespacing
// prefix. Domain code supplies only the body schema (`write`/`read` over the
// BitWriter/BitReader); everything else — compression, integrity, framing,
// whitespace tolerance, typed errors — lives here so a new shareable thing
// (e.g. an enabled-skills set) is just a new `createLoadout({ … })`.
// ── Little-endian bit writer (WoW's WriteBits, low bit first) ────────────────
export class BitWriter {
    bits = [];
    bit(v) {
        this.bits.push(v ? 1 : 0);
    }
    uint(value, width) {
        let v = value >>> 0;
        for (let i = 0; i < width; i += 1) {
            this.bits.push(v & 1);
            v >>>= 1;
        }
    }
    // LEB128-style varint: 7 payload bits per group, high "continue" bit set while
    // more groups follow.
    varint(value) {
        let v = Math.max(0, Math.floor(value));
        do {
            const group = v & 0x7f;
            v = Math.floor(v / 128);
            this.bit(v > 0 ? 1 : 0);
            this.uint(group, 7);
        } while (v > 0);
    }
    str(s) {
        const bytes = new TextEncoder().encode(s);
        this.varint(bytes.length);
        for (const b of bytes) {
            this.uint(b, 8);
        }
    }
    bytes() {
        const out = new Uint8Array(Math.ceil(this.bits.length / 8));
        for (let i = 0; i < this.bits.length; i += 1) {
            if (this.bits[i]) {
                out[i >> 3] |= 1 << (i & 7);
            }
        }
        return out;
    }
}
export class BitReader {
    buf;
    pos = 0;
    constructor(buf) {
        this.buf = buf;
    }
    bit() {
        if (this.pos >= this.buf.length * 8) {
            throw new RangeError('loadout truncated');
        }
        const i = this.pos++;
        return (this.buf[i >> 3] >> (i & 7)) & 1;
    }
    uint(width) {
        let v = 0;
        for (let i = 0; i < width; i += 1) {
            v |= this.bit() << i;
        }
        return v >>> 0;
    }
    varint() {
        let v = 0;
        let shift = 0;
        for (;;) {
            const cont = this.bit();
            v += this.uint(7) * 2 ** shift;
            shift += 7;
            if (!cont) {
                return v;
            }
        }
    }
    str() {
        const len = this.varint();
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i += 1) {
            bytes[i] = this.uint(8);
        }
        return new TextDecoder().decode(bytes);
    }
}
// Interns repeated strings (labels, categories, …) so each record spends one
// varint id instead of the full string; DEFLATE then squeezes the dictionary.
export class Dict {
    index = new Map();
    list = [];
    id(s) {
        const hit = this.index.get(s);
        if (hit !== undefined) {
            return hit;
        }
        const id = this.list.length;
        this.index.set(s, id);
        this.list.push(s);
        return id;
    }
}
// Index of `value` in a fixed enum table, clamped to 0 so an unknown value
// decodes to the table's first (default) member instead of throwing.
export const idxOf = (table, value) => {
    const i = table.indexOf(value);
    return i < 0 ? 0 : i;
};
// Bits needed to address `n` items positionally (fixed-width back-references).
export const indexBits = (n) => (n <= 1 ? 1 : Math.ceil(Math.log2(n)));
// ── base64url over the raw bytes (URL- and clipboard-safe, no padding) ────────
function toBase64Url(buf) {
    let bin = '';
    for (const b of buf) {
        bin += String.fromCharCode(b);
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}
// FNV-1a over the body bytes, low 16 bits — a tamper/corruption gate, not crypto.
function checksum16(buf) {
    let h = 0x811c9dc5;
    for (const b of buf) {
        h ^= b;
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) & 0xffff;
}
export class LoadoutError extends Error {
}
const HEAD_BYTES = 3; // 8-bit version + 16-bit checksum
// Build an encode/decode pair for a domain value. The body schema is the only
// thing a caller writes; everything else (deflate, version+checksum frame,
// base64url, whitespace tolerance, typed errors) is shared.
export function createLoadout(spec) {
    const Err = spec.error ?? LoadoutError;
    const noun = spec.noun ?? 'code';
    const Noun = capitalize(noun);
    const encode = (value) => {
        const body = new BitWriter();
        spec.write(body, value);
        const payload = deflateSync(body.bytes(), { level: 9 });
        const head = new BitWriter();
        head.uint(spec.version, 8);
        head.uint(checksum16(payload), 16);
        const headBytes = head.bytes();
        const framed = new Uint8Array(headBytes.length + payload.length);
        framed.set(headBytes, 0);
        framed.set(payload, headBytes.length);
        return spec.prefix + toBase64Url(framed);
    };
    const decode = (code) => {
        // Strip ALL whitespace, not just the ends — a pasted code often picks up soft
        // wraps / newlines, and base64 decoding chokes on any of it.
        const cleaned = code.replace(/\s+/g, '');
        const raw = cleaned.startsWith(spec.prefix) ? cleaned.slice(spec.prefix.length) : cleaned;
        if (!raw) {
            throw new Err(`That doesn't look like a ${noun}.`);
        }
        let framed;
        try {
            framed = fromBase64Url(raw);
        }
        catch {
            throw new Err(`That doesn't look like a ${noun}.`);
        }
        if (framed.length <= HEAD_BYTES) {
            throw new Err(`${Noun} is too short to be valid.`);
        }
        const head = new BitReader(framed.subarray(0, HEAD_BYTES));
        const version = head.uint(8);
        const storedSum = head.uint(16);
        if (version !== spec.version) {
            throw new Err(`${Noun} is version ${version}; this build reads version ${spec.version}.`);
        }
        const payload = framed.subarray(HEAD_BYTES);
        if (checksum16(payload) !== storedSum) {
            throw new Err(`${Noun} looks corrupted (checksum mismatch).`);
        }
        try {
            return spec.read(new BitReader(inflateSync(payload)));
        }
        catch (err) {
            throw new Err(err instanceof Error ? `${Noun} is malformed: ${err.message}` : `${Noun} is malformed.`);
        }
    };
    return { decode, encode };
}
