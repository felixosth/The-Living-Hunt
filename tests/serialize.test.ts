import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  cloneData,
  deserialize,
  serialize,
} from '../src/core/serialize';

describe('serialize', () => {
  it('round-trips every typed array type, including offset views', () => {
    const buffer = new ArrayBuffer(64);
    const value = {
      i8: new Int8Array([-128, 0, 127]),
      u8: new Uint8Array([0, 1, 255]),
      u8c: new Uint8ClampedArray([0, 128, 255]),
      i16: new Int16Array([-32768, 32767]),
      u16: new Uint16Array([0, 65535]),
      i32: new Int32Array([-(2 ** 31), 2 ** 31 - 1]),
      u32: new Uint32Array([0, 2 ** 32 - 1]),
      f32: new Float32Array([1.5, -0.25, 1234.5678]),
      f64: new Float64Array([Math.PI, -1e-300]),
      view: new Float32Array(buffer, 8, 4).fill(2.5),
      nested: { list: [1, 'two', { three: new Uint8Array([3]) }], flag: true, none: null },
    };
    const back = deserialize<typeof value>(serialize(value));
    expect(back).toEqual(value);
    expect(back.view).toBeInstanceOf(Float32Array);
    expect(back.view.length).toBe(4);
  });

  it('base64 matches the platform encoder for any bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        const b64 = bytesToBase64(bytes);
        expect(b64).toBe(Buffer.from(bytes).toString('base64'));
        expect(base64ToBytes(b64)).toEqual(bytes);
      }),
    );
  });

  it('cloneData produces an equal but separate copy', () => {
    const original = { a: [1, 2, 3], t: new Uint16Array([7]) };
    const copy = cloneData(original);
    expect(copy).toEqual(original);
    copy.a.push(4);
    copy.t[0] = 9;
    expect(original.a).toHaveLength(3);
    expect(original.t[0]).toBe(7);
  });
});
