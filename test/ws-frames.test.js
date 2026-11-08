// The hand-written RFC 6455 codec (src/ide/ws-frames.js): lengths, masking, fragmentation, errors.
const test = require('node:test');
const assert = require('node:assert');
const { OP, WsError, acceptKey, encodeFrame, closePayload, createDecoder } = require('../src/ide/ws-frames');

const KEY = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
const masked = (op, data, fin = true) => encodeFrame(op, data, { fin, maskKey: KEY });

test('acceptKey matches the RFC 6455 example', () => {
  assert.strictEqual(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('a masked "Hello" frame matches the RFC 6455 example bytes', () => {
  assert.strictEqual(masked(OP.TEXT, 'Hello').toString('hex'), '818537fa213d7f9f4d5158');
  assert.deepStrictEqual(createDecoder().push(masked(OP.TEXT, 'Hello')), [{ kind: 'text', text: 'Hello' }]);
});

test('server frames are unmasked; 7-, 16- and 64-bit lengths round-trip', () => {
  assert.strictEqual(encodeFrame(OP.TEXT, 'Hi').toString('hex'), '81024869');
  for (const n of [0, 125, 126, 65535, 65536, 70000]) {
    const text = 'x'.repeat(n);
    const frame = encodeFrame(OP.TEXT, text);
    const lenField = frame[1] & 0x7f;
    assert.strictEqual(lenField, n < 126 ? n : n < 65536 ? 126 : 127, `length field for ${n}`);
    assert.deepStrictEqual(createDecoder({ requireMask: false }).push(frame), [{ kind: 'text', text }]);
    assert.deepStrictEqual(createDecoder().push(masked(OP.TEXT, text)), [{ kind: 'text', text }]);
  }
});

test('a frame split across chunks byte by byte is decoded once complete', () => {
  const d = createDecoder();
  const bytes = masked(OP.TEXT, 'שלום עולם');
  const events = [];
  for (const b of bytes) events.push(...d.push(Buffer.from([b])));
  assert.deepStrictEqual(events, [{ kind: 'text', text: 'שלום עולם' }]);
});

test('fragmented message with a ping in between is reassembled; the ping comes first', () => {
  const d = createDecoder();
  const chunk = Buffer.concat([
    masked(OP.TEXT, '{"a":', false),
    masked(OP.PING, 'p'),
    masked(OP.CONT, '1', false),
    masked(OP.CONT, '}', true),
  ]);
  const events = d.push(chunk);
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].kind, 'ping');
  assert.strictEqual(events[0].data.toString(), 'p');
  assert.deepStrictEqual(events[1], { kind: 'text', text: '{"a":1}' });
});

test('a UTF-8 character split across fragments decodes', () => {
  const bytes = Buffer.from('א', 'utf8');
  const d = createDecoder();
  const events = d.push(Buffer.concat([masked(OP.TEXT, bytes.subarray(0, 1), false), masked(OP.CONT, bytes.subarray(1))]));
  assert.deepStrictEqual(events, [{ kind: 'text', text: 'א' }]);
});

test('close frame gives code and reason; empty close gives 1005', () => {
  assert.deepStrictEqual(createDecoder().push(masked(OP.CLOSE, closePayload(1000, 'bye'))), [{ kind: 'close', code: 1000, reason: 'bye' }]);
  assert.deepStrictEqual(createDecoder().push(masked(OP.CLOSE, Buffer.alloc(0))), [{ kind: 'close', code: 1005, reason: '' }]);
});

function throwsCode(fn, code) {
  assert.throws(fn, (err) => err instanceof WsError && err.code === code);
}

test('protocol violations throw with the right close code', () => {
  throwsCode(() => createDecoder().push(encodeFrame(OP.TEXT, 'x')), 1002); // unmasked client frame
  throwsCode(() => createDecoder().push(masked(OP.CONT, 'x')), 1002); // continuation first
  throwsCode(() => createDecoder().push(Buffer.concat([masked(OP.TEXT, 'a', false), masked(OP.TEXT, 'b')])), 1002);
  throwsCode(() => createDecoder().push(masked(OP.PING, 'x', false)), 1002); // fragmented control
  throwsCode(() => createDecoder().push(masked(OP.PING, 'x'.repeat(126))), 1002); // control > 125
  const rsv = masked(OP.TEXT, 'x');
  rsv[0] |= 0x40;
  throwsCode(() => createDecoder().push(rsv), 1002);
  throwsCode(() => createDecoder().push(masked(0x3, 'x')), 1002); // reserved opcode
  throwsCode(() => createDecoder().push(masked(OP.TEXT, Buffer.from([0xff, 0xfe]))), 1007);
  throwsCode(() => createDecoder({ maxMessage: 10 }).push(masked(OP.TEXT, 'x'.repeat(11))), 1009);
  throwsCode(() => createDecoder({ maxMessage: 10 }).push(Buffer.concat([masked(OP.TEXT, 'x'.repeat(6), false), masked(OP.CONT, 'x'.repeat(6))])), 1009);
});
