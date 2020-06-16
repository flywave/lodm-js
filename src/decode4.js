class BitStream {
  constructor(array) {
    this.a = array;
    this.current = array[0];
    this.position = 0;
    this.pending = 32;
  }

  read(bits) {
    if (bits > this.pending) {
      this.pending = bits - this.pending;
      let result = (this.current << this.pending) >>> 0;
      this.pending = 32 - this.pending;

      this.current = this.a[++this.position];
      result |= (this.current >>> this.pending);
      this.current = (this.current & ((1 << this.pending) - 1)) >>> 0;
      return result;
    }
    this.pending -= bits;
    let result = (this.current >>> this.pending);
    this.current = (this.current & ((1 << this.pending) - 1)) >>> 0;
    return result;
  }
}

class Stream {
  constructor(buffer, byteOffset, byteLength) {
    this.data = buffer;
    this.buffer = new Uint8Array(buffer);
    this.pos = byteOffset || 0;
    this.view = new DataView(buffer);
    this.logs = new Uint8Array(16768);
  }

  readChar() {
    let c = this.buffer[this.pos++];
    if (c > 127) c -= 256;
    return c;
  }

  readUChar() {
    return this.buffer[this.pos++];
  }

  readShort() {
    this.pos += 2;
    return this.view.getInt16(this.pos - 2, true);
  }

  readFloat() {
    this.pos += 4;
    return this.view.getFloat32(this.pos - 4, true);
  }

  readInt() {
    this.pos += 4;
    return this.view.getInt32(this.pos - 4, true);
  }

  readArray(n) {
    const a = this.buffer.subarray(this.pos, this.pos + n);
    this.pos += n;
    return a;
  }

  readString() {
    const n = this.readShort();
    const s = String.fromCharCode.apply(null, this.readArray(n - 1));
    this.pos++;
    return s;
  }

  readBitStream() {
    const n = this.readInt();
    const pad = this.pos & 0x3;
    if (pad != 0) this.pos += 4 - pad;
    const b = new BitStream(new Uint32Array(this.data, this.pos, n));
    this.pos += n * 4;
    return b;
  }

  decodeArray(N, values) {
    const bitstream = this.readBitStream();

    const engine = new Engine();
    while (this.logs.length < values.length)
      this.logs = new Uint8Array(values.length);

    engine.decompress(this, this.logs);

    for (let i = 0; i < this.logs.readed; i++) {
      const diff = this.logs[i];
      if (diff == 0) {
        for (var c = 0; c < N; c++) values[i * N + c] = 0;
        continue;
      }
      const max = (1 << diff) >>> 1;
      for (var c = 0; c < N; c++)
        values[i * N + c] = bitstream.read(diff) - max;
    }
    return this.logs.readed;
  }

  decodeValues(N, values) {
    const bitstream = this.readBitStream();
    const engine = new Engine();
    const size = values.length / N;
    while (this.logs.length < size) this.logs = new Uint8Array(size);

    for (let c = 0; c < N; c++) {
      engine.decompress(this, this.logs);

      for (let i = 0; i < this.logs.readed; i++) {
        const diff = this.logs[i];
        if (diff == 0) {
          values[i * N + c] = 0;
          continue;
        }

        let val = bitstream.read(diff);
        const middle = (1 << (diff - 1)) >>> 0;
        if (val < middle) val = -val - middle;
        values[i * N + c] = val;
      }
    }
    return this.logs.readed;
  }

  decodeDiffs(values) {
    const bitstream = this.readBitStream();
    const engine = new Engine();
    const size = values.length;
    while (this.logs.length < size) this.logs = new Uint8Array(size);

    engine.decompress(this, this.logs);

    for (let i = 0; i < this.logs.readed; i++) {
      const diff = this.logs[i];
      if (diff == 0) {
        values[i] = 0;
        continue;
      }
      const max = (1 << diff) >>> 1;
      values[i] = bitstream.read(diff) - max;
    }
    return this.logs.readed;
  }

  decodeIndices(values) {
    const bitstream = this.readBitStream();

    const engine = new Engine();
    const size = values.length;
    while (this.logs.length < size) this.logs = new Uint8Array(size);

    engine.decompress(this, this.logs);

    for (let i = 0; i < this.logs.readed; i++) {
      const ret = this.logs[i];
      if (ret == 0) {
        values[i] = 0;
        continue;
      }
      values[i] = (1 << ret) + bitstream.read(ret) - 1;
    }
    return this.logs.readed;
  }
}


class Engine {
  constructor() {
    this.wordsize = 8;
    this.dictionarySize = 256;
    this.starts = new Uint32Array(256);
    this.queue = new Uint32Array(512);
    this.index = new Uint32Array(512);
    this.lengths = new Uint32Array(512);
    this.table = new Uint8Array(8192);
  }

  decompress(stream, data) {
    const nsymbols = stream.readUChar();
    this.probs = stream.readArray(nsymbols * 2);
    this.createDecodingTables();
    const size = stream.readInt();
    if (size > 100000000) throw ('TOO LARGE!');
    if (!data) data = new Uint8Array(size);
    if (data.length < size) throw 'Array for results too small';
    data.readed = size;

    const compressedSize = stream.readInt();
    if (size > 100000000) throw ('TOO LARGE!');
    const compressedData = stream.readArray(compressedSize);
    if (size) this._decompress(compressedData, compressedSize, data, size);
    return data;
  }

  createDecodingTables() {
    const nsymbols = this.probs.length / 2;
    if (nsymbols <= 1) return;

    let end = 0;
    let pos = 0;
    let nwords = 0;

    for (let i = 0; i < nsymbols; i++) this.queue[i] = this.probs[2 * i + 1] << 8;

    const maxRepeat = Math.floor((this.dictionarySize - 1) / (nsymbols - 1));
    let repeat = 2;
    const p0 = this.queue[0];
    const p1 = this.queue[1];
    let prob = (p0 * p0) >>> 16;
    while (prob > p1 && repeat < maxRepeat) {
      prob = (prob * p0) >>> 16;
      repeat++;
    }

    if (repeat >= 16) {
      this.table[pos++] = this.probs[0];
      for (let k = 1; k < nsymbols; k++) {
        for (let i = 0; i < repeat - 1; i++) this.table[pos++] = this.probs[0];
        this.table[pos++] = this.probs[2 * k];
      }
      this.starts[0] = (repeat - 1) * nsymbols;
      for (let k = 1; k < nsymbols; k++) this.starts[k] = k;

      for (let col = 0; col < repeat; col++) {
        for (let row = 1; row < nsymbols; row++) {
          const off = (row + col * nsymbols);
          if (col > 0) this.queue[off] = (prob * this.queue[row]) >> 16;
          this.index[off] = row * repeat - col;
          this.lengths[off] = col + 1;
        }
        if (col == 0)
          prob = p0;
        else
          prob = (prob * p0) >>> 16;
      }
      const first = ((repeat - 1) * nsymbols);
      this.queue[first] = prob;
      this.index[first] = 0;
      this.lengths[first] = repeat;

      nwords = 1 + repeat * (nsymbols - 1);
      end = repeat * nsymbols;
    } else {
      for (let i = 0; i < nsymbols; i++) {
        this.queue[i] = this.probs[i * 2 + 1] << 8;
        this.index[i] = i;
        this.lengths[i] = 1;

        this.starts[i] = i;
        this.table[i] = this.probs[i * 2];
      }
      pos = nsymbols;
      end = nsymbols;
      nwords = nsymbols;
    }

    while (nwords < this.dictionarySize) {
      let best = 0;
      let maxProb = 0;
      for (let i = 0; i < nsymbols; i++) {
        const p = this.queue[this.starts[i]];
        if (p > maxProb) {
          best = i;
          maxProb = p;
        }
      }
      const start = this.starts[best];
      const offset = this.index[start];
      const len = this.lengths[start];

      for (let i = 0; i < nsymbols; i++) {
        this.queue[end] = (this.queue[i] * this.queue[start]) >>> 16;
        this.index[end] = pos;
        this.lengths[end] = len + 1;
        end++;

        for (let k = 0; k < len; k++)
          this.table[pos + k] = this.table[offset + k];
        pos += len;
        this.table[pos++] = this.probs[i * 2];
        if (i + nwords == this.dictionarySize - 1) break;
      }
      if (i == nsymbols) this.starts[best] += nsymbols;
      nwords += nsymbols - 1;
    }

    let word = 0;
    for (let i = 0, row = 0; i < end; i++, row++) {
      if (row >= nsymbols) row = 0;
      if (this.starts[row] > i) continue;

      this.index[word] = this.index[i];
      this.lengths[word] = this.lengths[i];
      word++;
    }
  }

  _decompress(input, inputSize, output, outputSize) {
    let inputPos = 0;
    let outputPos = 0;
    if (this.probs.length == 2) {
      const symbol = this.probs[0];
      for (let i = 0; i < outputSize; i++) output[i] = symbol;
      return;
    }

    while (inputPos < inputSize - 1) {
      const symbol = input[inputPos++];
      const start = this.index[symbol];
      const end = start + this.lengths[symbol];
      for (let i = start; i < end; i++) output[outputPos++] = this.table[i];
    }

    const symbol = input[inputPos];
    const start = this.index[symbol];
    const end = start + outputSize - outputPos;

    for (let i = start; i < end; i++) output[outputPos++] = this.table[i];

    return output;
  }
}


class Attribute {
  constructor(name, q, components, type, strategy) {
    this.name = name;
    this.q = q;
    this.components = components;
    this.type = type;
    this.strategy = strategy;
    this.Type = {
      UINT32: 0,
      INT32: 1,
      UINT16: 2,
      INT16: 3,
      UINT8: 4,
      INT8: 5,
      FLOAT: 6,
      DOUBLE: 7,
    };

    Strategy = {PARALLEL: 1, CORRELATED: 2};
  }

  init(nvert, nface) {
    const n = nvert * this.components;
    this.values = new Int32Array(n);

    switch (this.type) {
      case this.Type.UINT32:
      case this.Type.INT32:
        this.values = this.buffer = new Int32Array(n);
        break;
      case this.Type.UINT16:
      case this.Type.INT16:
        this.buffer = new Int16Array(n);
        break;
      case this.Type.UINT8:
        this.buffer = new Uint8Array(n);
        break;
      case this.Type.INT8:
        this.buffer = new Int8Array(n);
        break;
      case this.Type.FLOAT:
      case this.Type.DOUBLE:
        this.buffer = new Float32Array(n);
        break;
      default:
        throw 'Error if reading';
    }
  }

  decode(nvert, stream) {
    if (this.strategy & this.Strategy.CORRELATED)
      stream.decodeArray(this.components, this.values);
    else
      stream.decodeValues(this.components, this.values);
  }

  deltaDecode(nvert, context) {
    const {values} = t;
    const N = this.components;

    if (this.strategy & this.Strategy.PARALLEL) {
      const n = context.length / 3;
      for (let i = 1; i < n; i++) {
        for (let c = 0; c < N; c++) {
          values[i * N + c] += values[context[i * 3] * N + c] +
              values[context[i * 3 + 1] * N + c] -
              values[context[i * 3 + 2] * N + c];
        }
      }
    } else if (context) {
      const n = context.length / 3;
      for (let i = 1; i < n; i++)
        for (let c = 0; c < N; c++)
          values[i * N + c] += values[context[i * 3] * N + c];
    } else {
      for (let i = N; i < nvert * N; i++) values[i] += values[i - N];
    }
  }

  postDelta() {
    // noop
  }

  dequantize(nvert) {
    const n = this.components * nvert;
    switch (this.type) {
      case this.Type.UINT32:
      case this.Type.INT32:
        break;
      case this.Type.UINT16:
      case this.Type.INT16:
      case this.Type.UINT8:
      case this.Type.INT8:
        for (let i = 0; i < n; i++) this.buffer[i] = this.values[i] * this.q;
        break;
      case this.Type.FLOAT:
      case this.Type.DOUBLE:
        for (let i = 0; i < n; i++) this.buffer[i] = this.values[i] * this.q;
        break;
    }
  }
}

class ColorAttr extends Attribute {
  constructor(name, q, components, type, strategy) {
    super(name, q, components, type, strategy);
    this.qc = [];
    this.outcomponents = 3;
  }

  decode(nvert, stream) {
    for (let c = 0; c < 4; c++) this.qc[c] = stream.readUChar();
    Attribute.prototype.decode.call(this, nvert, stream);
  }

  dequantize(nvert) {
    for (let i = 0; i < nvert; i++) {
      const offset = i * 4;
      const rgboff = i * this.outcomponents;

      const e0 = this.values[offset + 0];
      const e1 = this.values[offset + 1];
      const e2 = this.values[offset + 2];

      this.buffer[rgboff + 0] = ((e2 + e0) * this.qc[0]) & 0xff;
      this.buffer[rgboff + 1] = e0 * this.qc[1];
      this.buffer[rgboff + 2] = ((e1 + e0) * this.qc[2]) & 0xff;
      this.buffer[offset + 3] = this.values[offset + 3] * this.qc[3];
    }
  }
}

class NormalAttr extends Attribute {
  constructor(name, q, components, type, strategy) {
    super(name, q, components, type, strategy);
    this.Prediction = {DIFF: 0, ESTIMATED: 1, BORDER: 2};
  }

  init(nvert, nface) {
    const n = nvert * this.components;
    this.values = new Int32Array(2 * nvert);

    switch (this.type) {
      case this.Type.INT16:
        this.buffer = new Int16Array(n);
        break;
      case this.Type.FLOAT:
      case this.Type.DOUBLE:
        this.buffer = new Float32Array(n);
        break;
      default:
        throw 'Error if reading';
    }
  }

  decode(nvert, stream) {
    this.prediction = stream.readUChar();

    stream.decodeArray(2, this.values);
  }

  deltaDecode(nvert, context) {
    if (this.prediction != this.Prediction.DIFF) return;

    if (context) {
      for (let i = 1; i < nvert; i++) {
        for (let c = 0; c < 2; c++) {
          const d = this.values[i * 2 + c];
          this.values[i * 2 + c] += this.values[context[i * 3] * 2 + c];
        }
      }
    } else {
      for (let i = 2; i < nvert * 2; i++) {
        const d = this.values[i];
        this.values[i] += this.values[i - 2];
      }
    }
  }

  postDelta(nvert, nface, attrs, index) {
    if (this.prediction == this.Prediction.DIFF) return;

    if (!attrs.position)
      throw 'No position attribute found. Use DIFF normal strategy instead.';

    const coord = attrs.position;

    this.estimated = new Float32Array(nvert * 3);
    this.estimateNormals(nvert, coord.values, nface, index.faces);

    if (this.prediction == this.Prediction.BORDER) {
      this.boundary = new Uint32Array(nvert);
      this.markBoundary(nvert, nface, index.faces, this.boundary);
    }

    this.computeNormals(nvert);
  }

  dequantize(nvert) {
    if (this.prediction != this.Prediction.DIFF) return;

    for (let i = 0; i < nvert; i++)
      this.toSphere(i, this.values, i, this.buffer, this.q);
  }

  computeNormals(nvert) {
    const norm = this.estimated;

    if (this.prediction == this.Prediction.ESTIMATED) {
      for (let i = 0; i < nvert; i++) {
        this.toOcta(i, norm, i, this.values, this.q);
        this.toSphere(i, this.values, i, this.buffer, this.q);
      }
    } else {
      let count = 0;
      for (let i = 0, k = 0; i < nvert; i++, k += 3) {
        if (this.boundary[i] != 0) {
          this.toOcta(i, norm, count, this.values, this.q);
          this.toSphere(count, this.values, i, this.buffer, this.q);
          count++;
        } else {
          let len = 1 /
              Math.sqrt(
                  norm[k] * norm[k] + norm[k + 1] * norm[k + 1] +
                      norm[k + 2] * norm[k + 2],
              );
          if (this.type == this.Type.INT16) len *= 32767;

          this.buffer[k] = norm[k] * len;
          this.buffer[k + 1] = norm[k + 1] * len;
          this.buffer[k + 2] = norm[k + 2] * len;
        }
      }
    }
  }

  markBoundary(nvert, nface, index, boundary) {
    for (let f = 0; f < nface * 3; f += 3) {
      boundary[index[f + 0]] ^= index[f + 1] ^ index[f + 2];
      boundary[index[f + 1]] ^= index[f + 2] ^ index[f + 0];
      boundary[index[f + 2]] ^= index[f + 0] ^ index[f + 1];
    }
  }

  estimateNormals(nvert, coords, nface, index) {
    for (let f = 0; f < nface * 3; f += 3) {
      const a = 3 * index[f + 0];
      const b = 3 * index[f + 1];
      const c = 3 * index[f + 2];

      const ba0 = coords[b + 0] - coords[a + 0];
      const ba1 = coords[b + 1] - coords[a + 1];
      const ba2 = coords[b + 2] - coords[a + 2];

      const ca0 = coords[c + 0] - coords[a + 0];
      const ca1 = coords[c + 1] - coords[a + 1];
      const ca2 = coords[c + 2] - coords[a + 2];

      const n0 = ba1 * ca2 - ba2 * ca1;
      const n1 = ba2 * ca0 - ba0 * ca2;
      const n2 = ba0 * ca1 - ba1 * ca0;

      this.estimated[a + 0] += n0;
      this.estimated[a + 1] += n1;
      this.estimated[a + 2] += n2;
      this.estimated[b + 0] += n0;
      this.estimated[b + 1] += n1;
      this.estimated[b + 2] += n2;
      this.estimated[c + 0] += n0;
      this.estimated[c + 1] += n1;
      this.estimated[c + 2] += n2;
    }
  }

  toSphere(i, input, o, out, unit) {
    const j = i * 2;
    const k = o * 3;
    const av0 = input[j] > 0 ? input[j] : -input[j];
    const av1 = input[j + 1] > 0 ? input[j + 1] : -input[j + 1];
    out[k] = input[j];
    out[k + 1] = input[j + 1];
    out[k + 2] = unit - av0 - av1;
    if (out[k + 2] < 0) {
      out[k] = (input[j] > 0) ? unit - av1 : av1 - unit;
      out[k + 1] = (input[j + 1] > 0) ? unit - av0 : av0 - unit;
    }
    let len = 1 /
        Math.sqrt(
            out[k] * out[k] + out[k + 1] * out[k + 1] + out[k + 2] * out[k + 2],
        );
    if (this.type == this.Type.INT16) len *= 32767;

    out[k] *= len;
    out[k + 1] *= len;
    out[k + 2] *= len;
  }

  toOcta(i, input, o, output, unit) {
    const k = o * 2;
    const j = i * 3;

    const av0 = input[j] > 0 ? input[j] : -input[j];
    const av1 = input[j + 1] > 0 ? input[j + 1] : -input[j + 1];
    const av2 = input[j + 2] > 0 ? input[j + 2] : -input[j + 2];
    const len = av0 + av1 + av2;
    let p0 = input[j] / len;
    let p1 = input[j + 1] / len;

    const ap0 = p0 > 0 ? p0 : -p0;
    const ap1 = p1 > 0 ? p1 : -p1;

    if (input[j + 2] < 0) {
      p0 = (input[j] >= 0) ? 1.0 - ap1 : ap1 - 1;
      p1 = (input[j + 1] >= 0) ? 1.0 - ap0 : ap0 - 1;
    }
    output[k] += p0 * unit;
    output[k + 1] += p1 * unit;
  }
}

class IndexAttr {
  constructor(nvert, nface, type) {
    if ((!type && nface < (1 << 16)) || type == 0)
      this.faces = new Uint16Array(nface * 3);
    else if (!type || type == 2)
      this.faces = new Uint32Array(nface * 3);
    else
      throw 'Unsupported type';
    this.prediction = new Uint32Array(nvert * 3);
  }

  decode(stream) {
    const max_front = stream.readInt();
    this.front = new Int32Array(max_front * 5);

    const engine = new Engine();
    this.clers = engine.decompress(stream);
    this.bitstream = stream.readBitStream();
  }

  decodeGroups(stream) {
    const n = stream.readInt();
    this.groups = new Array(n);
    for (let i = 0; i < n; i++) {
      const end = stream.readInt();
      const np = stream.readUChar();
      const g = {end, properties: {}};
      for (let k = 0; k < np; k++) {
        const key = stream.readString();
        g.properties[key] = stream.readString();
      }
      this.groups[i] = g;
    }
  }
}

class Decoder {
  constructor(data, byteOffset, byteLength) {
    if (byteOffset & 0x3) throw 'Memory aligned on 4 bytes is mandatory';

    const stream = this.stream = new Stream(data, byteOffset, byteLength);

    const magic = stream.readInt();
    if (magic != 2021286656) return;

    const version = stream.readInt();
    this.entropy = stream.readUChar();

    this.geometry = {};
    let n = stream.readInt();
    for (let i = 0; i < n; i++) {
      const key = stream.readString();
      this.geometry[key] = stream.readString();
    }

    n = stream.readInt();

    this.attributes = {};
    for (let i = 0; i < n; i++) {
      const a = {};
      const name = stream.readString();
      const codec = stream.readInt();
      const q = stream.readFloat();
      const components = stream.readUChar();
      const type = stream.readUChar();
      const strategy = stream.readUChar();
      let attr;
      switch (codec) {
        case 2:
          attr = NormalAttr;
          break;
        case 3:
          attr = ColorAttr;
          break;
        case 1:
        default:
          attr = Attribute;
          break;
      }
      this.attributes[name] = new attr(name, q, components, type, strategy);
    }

    this.geometry.nvert = this.nvert = this.stream.readInt();
    this.geometry.nface = this.nface = this.stream.readInt();
  }

  decode() {
    this.last = new Uint32Array(this.nvert * 3);
    this.lastCount = 0;

    for (const i in this.attributes)
      this.attributes[i].init(this.nvert, this.nface);

    if (this.nface == 0)
      this.decodePointCloud();
    else
      this.decodeMesh();

    return this.geometry;
  }

  decodePointCloud() {
    this.index = new IndexAttr(this.nvert, this.nface, 0);
    this.index.decodeGroups(this.stream);
    this.geometry.groups = this.index.groups;
    for (const i in this.attributes) {
      const a = this.attributes[i];
      a.decode(this.nvert, this.stream);
      a.deltaDecode(this.nvert);
      a.dequantize(this.nvert);
      this.geometry[a.name] = a.buffer;
    }
  }

  decodeMesh() {
    this.index = new IndexAttr(this.nvert, this.nface);
    this.index.decodeGroups(this.stream);
    this.index.decode(this.stream);

    this.vertexCount = 0;
    let start = 0;
    this.cler = 0;
    for (let p = 0; p < this.index.groups.length; p++) {
      const {end} = this.index.groups[p];
      this.decodeFaces(start * 3, end * 3);
      start = end;
    }
    this.geometry.index = this.index.faces;
    this.geometry.groups = this.index.groups;
    for (let i in this.attributes)
      this.attributes[i].decode(this.nvert, this.stream);
    for (let i in this.attributes)
      this.attributes[i].deltaDecode(this.nvert, this.index.prediction);
    for (let i in this.attributes)
      this.attributes[i].postDelta(
          this.nvert, this.nface, this.attributes, this.index);
    for (let i in this.attributes) {
      const a = this.attributes[i];
      a.dequantize(this.nvert);
      this.geometry[a.name] = a.buffer;
    }
  }

  ilog2(p) {
    let k = 0;
    while (p >>= 1) {
      ++k;
    }
    return k;
  }

  decodeFaces(start, end) {
    const {clers} = this.index;
    const {bitstream} = this.index;

    const {front} = this.index;
    let frontCount = 0;

    function addFront(_v0, _v1, _v2, _prev, _next) {
      front[frontCount] = _v0;
      front[frontCount + 1] = _v1;
      front[frontCount + 2] = _v2;
      front[frontCount + 3] = _prev;
      front[frontCount + 4] = _next;
      frontCount += 5;
    }

    const faceorder = new Uint32Array((end - start));
    let orderFront = 0;
    let orderBack = 0;

    const delayed = [];

    const splitbits = this.ilog2(this.nvert) + 1;

    let newEdge = -1;

    const {prediction} = this.index;

    while (start < end) {
      if (newEdge == -1 && orderFront >= orderBack && !delayed.length) {
        let lastIndex = this.vertexCount - 1;
        const vindex = [];

        let split = 0;
        if (clers[this.cler++] == 6) {
          split = bitstream.read(3);
        }

        for (let k = 0; k < 3; k++) {
          let v;
          if (split & (1 << k))
            v = bitstream.read(splitbits);
          else {
            prediction[this.vertexCount * 3] =
                prediction[this.vertexCount * 3 + 1] =
                    prediction[this.vertexCount * 3 + 2] = lastIndex;
            lastIndex = v = this.vertexCount++;
          }
          vindex[k] = v;
          this.index.faces[start++] = v;
        }

        const currentEdge = frontCount;
        faceorder[orderBack++] = frontCount;
        addFront(
            vindex[1],
            vindex[2],
            vindex[0],
            currentEdge + 2 * 5,
            currentEdge + 1 * 5,
        );
        faceorder[orderBack++] = frontCount;
        addFront(
            vindex[2],
            vindex[0],
            vindex[1],
            currentEdge + 0 * 5,
            currentEdge + 2 * 5,
        );
        faceorder[orderBack++] = frontCount;
        addFront(
            vindex[0],
            vindex[1],
            vindex[2],
            currentEdge + 1 * 5,
            currentEdge + 0 * 5,
        );
        continue;
      }
      let edge;
      if (newEdge != -1) {
        edge = newEdge;
        newEdge = -1;
      } else if (orderFront < orderBack) {
        edge = faceorder[orderFront++];
      } else {
        edge = delayed.pop();
      }
      if (typeof (edge) === 'undefined') throw 'aarrhhj';

      if (front[edge] < 0) continue;

      const c = clers[this.cler++];
      if (c == 4) continue;

      const v0 = front[edge + 0];
      const v1 = front[edge + 1];
      const v2 = front[edge + 2];
      const prev = front[edge + 3];
      const next = front[edge + 4];

      newEdge = frontCount;
      let opposite = -1;
      if (c == 0 || c == 6) {
        if (c == 6) {
          opposite = bitstream.read(splitbits);
        } else {
          prediction[this.vertexCount * 3] = v1;
          prediction[this.vertexCount * 3 + 1] = v0;
          prediction[this.vertexCount * 3 + 2] = v2;
          opposite = this.vertexCount++;
        }

        front[prev + 4] = newEdge;
        front[next + 3] = newEdge + 5;

        front[frontCount] = v0;
        front[frontCount + 1] = opposite;
        front[frontCount + 2] = v1;
        front[frontCount + 3] = prev;
        front[frontCount + 4] = newEdge + 5;
        frontCount += 5;

        faceorder[orderBack++] = frontCount;

        front[frontCount] = opposite;
        front[frontCount + 1] = v1;
        front[frontCount + 2] = v0;
        front[frontCount + 3] = newEdge;
        front[frontCount + 4] = next;
        frontCount += 5;
      } else if (c == 1) {
        front[front[prev + 3] + 4] = newEdge;
        front[next + 3] = newEdge;
        opposite = front[prev];

        front[frontCount] = opposite;
        front[frontCount + 1] = v1;
        front[frontCount + 2] = v0;
        front[frontCount + 3] = front[prev + 3];
        front[frontCount + 4] = next;
        frontCount += 5;

        front[prev] = -1;
      } else if (c == 2) {
        front[front[next + 4] + 3] = newEdge;
        front[prev + 4] = newEdge;
        opposite = front[next + 1];

        front[frontCount] = v0;
        front[frontCount + 1] = opposite;
        front[frontCount + 2] = v1;
        front[frontCount + 3] = prev;
        front[frontCount + 4] = front[next + 4];
        frontCount += 5;

        front[next] = -1;
      } else if (c == 5) {
        delayed.push(edge);
        newEdge = -1;

        continue;
      } else if (c == 3) {
        front[front[prev + 3] + 4] = front[next + 4];
        front[front[next + 4] + 3] = front[prev + 3];

        opposite = front[prev];

        front[prev] = -1;
        front[next] = -1;
        newEdge = -1;
      } else {
        throw 'INVALID CLER!';
      }
      if (v1 >= this.nvert || v0 >= this.nvert || opposite >= this.nvert)
        throw 'Topological error';
      this.index.faces[start] = v1;
      this.index.faces[start + 1] = v0;
      this.index.faces[start + 2] = opposite;
      start += 3;
    }
  }
}

export default Decoder;
