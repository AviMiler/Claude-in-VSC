// Hand-written RFC 6455 WebSocket codec for the IDE server (PLAN.md section 7). Pure: no sockets,
// no vscode. The server side: client frames must be masked, server frames are not.
const crypto = require('crypto');

const OP = Object.freeze({ CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa });
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_MAX_MESSAGE = 16 * 1024 * 1024;

// A protocol violation; `code` is the close code to send (1002 protocol, 1007 bad UTF-8, 1009 too big).
class WsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// The Sec-WebSocket-Accept value for a client's Sec-WebSocket-Key.
function acceptKey(key) {
  return crypto.createHash('sha1').update(String(key) + WS_GUID).digest('base64');
}

function applyMask(data, maskKey) {
  const out = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i += 1) out[i] = data[i] ^ maskKey[i & 3];
  return out;
}

// One frame. `maskKey` (4 bytes) only for client frames (tests); the server sends unmasked.
function encodeFrame(opcode, payload = Buffer.alloc(0), { fin = true, maskKey = null } = {}) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const len = data.length;
  const lenBytes = len < 126 ? 0 : len < 65536 ? 2 : 8;
  const head = Buffer.alloc(2 + lenBytes + (maskKey ? 4 : 0));
  head[0] = (fin ? 0x80 : 0) | (opcode & 0x0f);
  head[1] = (maskKey ? 0x80 : 0) | (lenBytes === 0 ? len : lenBytes === 2 ? 126 : 127);
  if (lenBytes === 2) head.writeUInt16BE(len, 2);
  if (lenBytes === 8) head.writeBigUInt64BE(BigInt(len), 2);
  if (!maskKey) return Buffer.concat([head, data]);
  maskKey.copy(head, 2 + lenBytes);
  return Buffer.concat([head, applyMask(data, maskKey)]);
}

// The payload of a close frame: a 2-byte code and an optional UTF-8 reason.
function closePayload(code, reason = '') {
  const r = Buffer.from(String(reason).slice(0, 100), 'utf8');
  const out = Buffer.alloc(2 + r.length);
  out.writeUInt16BE(code, 0);
  r.copy(out, 2);
  return out;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
function decodeText(buf) {
  try {
    return utf8.decode(buf);
  } catch {
    throw new WsError(1007, 'invalid UTF-8 in a text message');
  }
}

// A streaming decoder: push(chunk) returns the complete events in it, in order:
// {kind:'text', text} | {kind:'binary', data} | {kind:'ping', data} | {kind:'pong', data} |
// {kind:'close', code, reason}. Fragmented messages are reassembled; control frames may arrive
// between fragments. Throws WsError on a protocol violation (the caller closes with err.code).
function createDecoder({ requireMask = true, maxMessage = DEFAULT_MAX_MESSAGE } = {}) {
  let buf = Buffer.alloc(0);
  let fragments = null; // { opcode, parts, size } while a fragmented message is open

  function readFrame() {
    if (buf.length < 2) return null;
    const b0 = buf[0];
    const b1 = buf[1];
    if (b0 & 0x70) throw new WsError(1002, 'reserved bits set (no extension was negotiated)');
    const fin = Boolean(b0 & 0x80);
    const opcode = b0 & 0x0f;
    const masked = Boolean(b1 & 0x80);
    let len = b1 & 0x7f;
    let off = 2;
    if (len === 126) {
      if (buf.length < 4) return null;
      len = buf.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (buf.length < 10) return null;
      const big = buf.readBigUInt64BE(2);
      if (big > BigInt(maxMessage)) throw new WsError(1009, 'frame too big');
      len = Number(big);
      off = 10;
    }
    if (len > maxMessage) throw new WsError(1009, 'frame too big');
    if (requireMask && !masked) throw new WsError(1002, 'client frame not masked');
    const maskOff = off;
    if (masked) off += 4;
    if (buf.length < off + len) return null;
    let payload = buf.subarray(off, off + len);
    if (masked) payload = applyMask(payload, buf.subarray(maskOff, maskOff + 4));
    buf = buf.subarray(off + len);
    return { fin, opcode, payload };
  }

  function toEvent(frame) {
    const { fin, opcode, payload } = frame;
    if (opcode >= 0x8) {
      if (!fin || payload.length > 125) throw new WsError(1002, 'bad control frame');
      if (opcode === OP.PING) return { kind: 'ping', data: payload };
      if (opcode === OP.PONG) return { kind: 'pong', data: payload };
      if (opcode === OP.CLOSE) {
        if (payload.length === 1) throw new WsError(1002, 'bad close payload');
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        return { kind: 'close', code, reason: payload.length > 2 ? decodeText(payload.subarray(2)) : '' };
      }
      throw new WsError(1002, `unknown control opcode ${opcode}`);
    }
    if (opcode === OP.CONT) {
      if (!fragments) throw new WsError(1002, 'continuation without a started message');
    } else if (opcode === OP.TEXT || opcode === OP.BINARY) {
      if (fragments) throw new WsError(1002, 'new message before the fragmented one ended');
      fragments = { opcode, parts: [], size: 0 };
    } else {
      throw new WsError(1002, `unknown opcode ${opcode}`);
    }
    fragments.parts.push(payload);
    fragments.size += payload.length;
    if (fragments.size > maxMessage) throw new WsError(1009, 'message too big');
    if (!fin) return null;
    const whole = Buffer.concat(fragments.parts);
    const kind = fragments.opcode === OP.TEXT ? 'text' : 'binary';
    fragments = null;
    return kind === 'text' ? { kind, text: decodeText(whole) } : { kind, data: whole };
  }

  return {
    push(chunk) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const events = [];
      for (let frame = readFrame(); frame; frame = readFrame()) {
        const ev = toEvent(frame);
        if (ev) events.push(ev);
      }
      return events;
    },
  };
}

module.exports = { OP, WsError, acceptKey, applyMask, encodeFrame, closePayload, createDecoder, DEFAULT_MAX_MESSAGE };
