class BitStream {
  constructor(array) {
    this.a = array;
    for (let i = 0; i < array.length; i += 2) {
      const s = array[i];
      array[i] = array[i + 1];
      array[i + 1] = s;
    }
    this.position = 0;
    this.bitsPending = 0;
  }

  read(bits) {
    let bitBuffer = 0;
    while (bits > 0) {
      let partial;
      let bitsConsumed;
      if (this.bitsPending > 0) {
        const byte = (this.a[this.position - 1] &
                      (0xffffffff >>> (32 - this.bitsPending))) >>>
            0;
        bitsConsumed = Math.min(this.bitsPending, bits);
        this.bitsPending -= bitsConsumed;
        partial = byte >>> this.bitsPending;
      } else {
        bitsConsumed = Math.min(32, bits);
        this.bitsPending = 32 - bitsConsumed;
        partial = this.a[this.position++] >>> this.bitsPending;
      }
      bits -= bitsConsumed;
      bitBuffer = ((bitBuffer << bitsConsumed) | partial) >>> 0;
    }
    return bitBuffer;
  }

  replace(bits, value) {
    value = (value & (0xffffffff >>> 32 - bits)) >>> 0;
    value = (value | this.read(bits)) >>> 0;
    return value;
  }
}


class Stream {
  constructor(buffer) {
    this.data = buffer;
    this.buffer = new Uint8Array(buffer);
    this.pos = 0;
  }

  readChar() {
    let c = this.buffer[this.pos++];
    if (c > 127) c -= 256;
    return c;
  }

  readUChar() {
    return this.buffer[this.pos++];
  }

  readInt() {
    let c = this.buffer[this.pos + 3];
    c <<= 8;
    c |= this.buffer[this.pos + 2];
    c <<= 8;
    c |= this.buffer[this.pos + 1];
    c <<= 8;
    c |= this.buffer[this.pos + 0];
    this.pos += 4;
    return c;
  }

  readArray(n) {
    const a = this.buffer.subarray(this.pos, this.pos + n);
    this.pos += n;
    return a;
  }

  readBitStream() {
    const n = this.readInt();
    const pad = this.pos & 0x3;
    if (pad != 0) this.pos += 4 - pad;
    const b = new BitStream(new Uint32Array(this.data, this.pos, n * 2));
    this.pos += n * 8;
    return b;
  }
}

class Engine {
  constructor(wordSize, lookupSize) {
    this.wordSize = wordSize || 8;
    this.lookupSize = lookupSize || 8;
  }

  decompress(stream) {
    const nsymbols = stream.readUChar();
    this.probabilities = stream.readArray(nsymbols * 2);
    this.createDecodingTables();
    const size = stream.readInt();
    const data = new Uint8Array(size);
    const compressedSize = stream.readInt();
    const compressedData = stream.readArray(compressedSize);
    if (size) this._decompress(compressedData, compressedSize, data, size);
    return data;
  }

  createDecodingTables() {
    const nsymbols = this.probabilities.length / 2;
    if (nsymbols <= 1) return;

    const queues = [];
    const buffer = [];

    for (let i = 0; i < nsymbols; i++) {
      const _ = this.probabilities[i * 2];
      const s = [(this.probabilities[i * 2 + 1]) << 8, buffer.length, 1];
      queues[i] = [s];
      buffer.push(this.probabilities[i * 2]);
    }
    const dictionarySize = 1 << this.wordSize;
    let nwords = nsymbols;
    let tableLength = nsymbols;

    while (nwords < dictionarySize - nsymbols + 1) {
      let best = 0;
      let maxProb = 0;
      for (let i = 0; i < nsymbols; i++) {
        const p = queues[i][0][0];
        if (p > maxProb) {
          best = i;
          maxProb = p;
        }
      }
      const symbol = queues[best][0];
      let pos = buffer.length;

      for (let i = 0; i < nsymbols; i++) {
        const sym = this.probabilities[i * 2];
        const prob = this.probabilities[i * 2 + 1] << 8;
        const s = [((prob * symbol[0]) >>> 16), pos, symbol[2] + 1];

        for (let k = 0; k < symbol[2]; k++) {
          buffer[pos + k] = buffer[symbol[1] + k];
        }

        pos += symbol[2];
        buffer[pos++] = sym;
        queues[i].push(s);
      }
      tableLength += (nsymbols - 1) * (symbol[2] + 1) + 1;
      nwords += nsymbols - 1;
      queues[best].shift();
    }

    this.index = new Uint32Array(nwords);
    this.lengths = new Uint32Array(nwords);
    this.table = new Uint8Array(tableLength);
    let word = 0;
    let pos = 0;
    for (let i = 0; i < queues.length; i++) {
      const queue = queues[i];
      for (let k = 0; k < queue.length; k++) {
        const s = queue[k];
        this.index[word] = pos;
        this.lengths[word] = s[2];
        word++;

        for (let j = 0; j < s[2]; j++) this.table[pos + j] = buffer[s[1] + j];
        pos += s[2];
      }
    }
  }

  _decompress(input, inputSize, output, outputSize) {
    let inputPos = 0;
    let outputPos = 0;
    if (this.probabilities.length === 2) {
      const symbol = this.probabilities[0];
      for (let i = 0; i < outputSize; i++) output[i] = symbol;
      return null;
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
    const _ = outputSize - outputPos;
    for (let i = start; i < end; i++) output[outputPos++] = this.table[i];

    return output;
  }
}

class ZPoint {
  constructor(h, l) {
    this.lo = l;
    this.hi = h;
  }

  copy(z) {
    this.lo = z.lo;
    this.hi = z.hi;
  }

  setBit(d) {
    if (d < 32)
      this.lo = (this.lo | (1 << d)) >>> 0;
    else
      this.hi = (this.hi | (1 << (d - 32))) >>> 0;
  }

  toPoint(min, step, buffer, pos) {
    const x = ZPoint.morton3(this.lo, this.hi >>> 1);
    const y = ZPoint.morton3(this.lo >>> 1, this.hi >>> 2);
    const z = ZPoint.morton3(
        (this.lo >>> 2 | (this.hi & 0x1) << 30) >>> 0,
        this.hi >>> 3,
    );

    buffer[pos + 0] = (x + min[0]) * step;
    buffer[pos + 1] = (y + min[1]) * step;
    buffer[pos + 2] = (z + min[2]) * step;
  }

  static morton3(lo, hi) {
    lo = (lo & 0x49249249) >>> 0;
    lo = ((lo | (lo >>> 2)) & 0xc30c30c3) >>> 0;
    lo = ((lo | (lo >>> 4)) & 0x0f00f00f) >>> 0;
    lo = ((lo | (lo >>> 8)) & 0xff0000ff) >>> 0;
    lo = ((lo | (lo >>> 16)) & 0x0000ffff) >>> 0;

    hi = (hi & 0x49249249) >>> 0;
    hi = ((hi | (hi >> 2)) & 0xc30c30c3) >>> 0;
    hi = ((hi | (hi >> 4)) & 0x0f00f00f) >>> 0;
    hi = ((hi | (hi >> 8)) & 0xff0000ff) >>> 0;
    hi = ((hi | (hi >> 16)) & 0x0000ffff) >>> 0;

    return ((hi << 11) | lo) >>> 0;
  }
}

class Decoder {
  constructor(signature, node, patches) {
    this.sig = signature;
    this.node = node;
    this.patches = patches;

    this.last = new Int32Array(this.node.nvert);
    this.last_count = 0;
  }

  decode(input) {
    this.buffer = new ArrayBuffer(
        this.node.nvert *
            (12 + this.sig.texcoords * 8 + this.sig.normals * 6 +
             this.sig.colors * 4) +
        this.node.nface * this.sig.indices * 6);

    let size = this.node.nvert * 12;  // float
    this.coords = new Float32Array(this.buffer, 0, this.node.nvert * 3);

    if (this.sig.texcoords) {
      this.texcoords = new Float32Array(this.buffer, size, this.node.nvert * 2);
      size += this.node.nvert * 8;  // float
    }

    if (this.sig.normals) {
      this.normals = new Int16Array(this.buffer, size, this.node.nvert * 3);
      size += this.node.nvert * 6;  // short
    }

    if (this.sig.colors) {
      this.colors =
          new Uint8ClampedArray(this.buffer, size, this.node.nvert * 4);
      size += this.node.nvert * 4;  // chars
    }
    
    if (this.sig.indices) {
      this.faces = new Uint16Array(this.buffer, size, this.node.nface * 3);
      size += this.node.nface * 6;  // short
    }

    this.stream = new Stream(input);

    this.stack =
        new Float32Array(12);  // min0, min1, min2, step, tmin0, tmin1, tstep

    this.stack[3] = this.stream.readInt();
    this.stack[4] = this.stream.readInt();
    this.stack[5] = this.stream.readInt();

    this.coord_q = this.stream.readChar();
    this.coord_bits = this.stream.readChar() * 3;

    this.stack[6] = Math.pow(2.0, this.coord_q);

    if (this.sig.texcoords) {
      this.stack[9] = this.stream.readInt();
      this.stack[10] = this.stream.readInt();

      this.texcoord_q = this.stream.readChar();
      this.texcoord_bits = this.stream.readChar() * 2;
      this.stack[11] = Math.pow(2.0, this.texcoord_q);
    }

    if (this.sig.indices) {
      this.decodeFaces();
    } else {
      this.decodeCoordinates();
    }

    if (this.sig.normals) this.decodeNormals();

    if (this.sig.colors) this.decodeColors();

    return this.buffer;
  }

  decodeCoordinates() {
    this.min = [this.stack[3], this.stack[4], this.stack[5]];

    const step = Math.pow(2.0, this.coord_q);

    const hibits = Math.max(this.coord_bits - 32, 0);
    const lobits = Math.min(this.coord_bits, 32);

    const bitstream = this.stream.readBitStream();

    const engine = new Engine();
    const diffs = engine.decompress(this.stream);

    const hi = bitstream.read(hibits);
    const lo = bitstream.read(lobits);
    const p = new ZPoint(hi, lo);
    let count = 0;
    p.toPoint(this.min, step, this.coords, count);
    count += 3;
    for (let i = 1; i < this.node.nvert; i++) {
      const d = diffs[i - 1];
      p.setBit(d, 1);
      if (d > 32) {
        p.hi = (p.hi & ~((1 << (d - 32)) - 1)) >>> 0;
        var e = bitstream.read(d - 32);
        p.hi = (p.hi | e) >>> 0;
        p.lo = bitstream.read(32);
      } else if (d == 32) {
        p.lo = bitstream.read(d);
      } else {
        var e = bitstream.read(d);
        p.lo = (p.lo & ~((1 << d) - 1)) >>> 0;
        p.lo = (p.lo | e) >>> 0;
      }
      p.toPoint(this.min, step, this.coords, count);
      count += 3;
    }
  }

  decodeFaces() {
    if (!this.node.nface) return;

    this.vertexCount = 0;
    let start = 0;
    for (let p = 0; p < this.patches.length; p++) {
      const end = this.patches[p];
      this.decodeConnectivity(end - start, start * 3);
      start = end;
    }

    const tot = this.node.nvert * 3;
    const {coords} = this;
    const {stack} = this;
    for (let i = 0; i < tot;) {
      coords[i] = (coords[i] + stack[3]) * stack[6];
      i++;
      coords[i] = (coords[i] + stack[4]) * stack[6];
      i++;
      coords[i] = (coords[i] + stack[5]) * stack[6];
      i++;
    }
    if (this.sig.texcoords) {
      const t_tot = this.node.nvert * 2;
      const t_coords = this.texcoords;
      for (let i = 0; i < tot;) {
        t_coords[i] = (t_coords[i] + stack[9]) * stack[11];
        i++;
        t_coords[i] = (t_coords[i] + stack[10]) * stack[11];
        i++;
      }
    }
  }

  decodeNormals() {
    const norm_q = this.stream.readChar();

    const dengine = new Engine();
    const diffs = dengine.decompress(this.stream);

    const sengine = new Engine();
    const signs = sengine.decompress(this.stream);
    const bitstream = this.stream.readBitStream();

    const side = (1 << (16 - norm_q)) >>> 0;
    let diffcount = 0;
    let signcount = 0;

    if (!this.sig.indices) {
      for (let k = 0; k < 2; k++) {
        let on = 0;
        for (var i = 0; i < this.node.nvert; i++) {
          const d = this.decodeDiff(diffs[diffcount++], bitstream);
          on += d;
          this.normals[3 * i + k] = on * side;
        }
      }
      for (let i = 0; i < this.node.nvert; i++) {
        let offset = i * 3;
        let x = this.normals[offset + 0];
        let y = this.normals[offset + 1];
        let z = 32767.0 * 32767.0 - x * x - y * y;

        if (z < 0) z = 0;
        z = Math.sqrt(z);
        if (z > 32767) z = 32767;
        if (signs[i] == 0) z = -z;
        this.normals[offset + 2] = z;
      }
      return;
    }

    const boundary = this.markBoundary();
    this.computeNormals();

    if (this.sig.texcoords) return;

    const stat = 0;

    for (let i = 0; i < this.node.nvert; i++) {
      if (!boundary[i]) continue;
      let offset = i * 3;
      let x = (this.normals[offset + 0] / side);
      let y = (this.normals[offset + 1] / side);
      const dx = this.decodeDiff(diffs[diffcount++], bitstream);
      const dy = this.decodeDiff(diffs[diffcount++], bitstream);
      x = (x + dx) * side;
      y = (y + dy) * side;

      let z = 32767.0 * 32767.0 - x * x - y * y;

      if (z < 0) z = 0;
      z = Math.sqrt(z);

      if (z > 32767.0) z = 32767.0;
      const signbit = signs[signcount++];

      if ((this.normals[offset + 2] < 0 && signbit == 0) ||
          (this.normals[offset + 2] > 0 && signbit == 1))
        z = -z;
      this.normals[offset + 0] = x;
      this.normals[offset + 1] = y;
      this.normals[offset + 2] = z;
    }
  }

  decodeColors() {
    const colorq = [];
    for (let k = 0; k < 4; k++) colorq[k] = this.stream.readChar();

    const diffs = [];
    for (let k = 0; k < 4; k++) {
      const engine = new Engine();

      diffs[k] = engine.decompress(this.stream);
    }
    const bitstream = this.stream.readBitStream();

    let count = 0;
    if (this.sig.indices) {
      for (let i = 0; i < this.node.nvert; i++) {
        const last = this.last[i] * 4;
        let offset = i * 4;

        for (let k = 0; k < 4; k++) {
          let c = this.decodeDiff(diffs[k][count], bitstream);

          if (last >= 0) c += this.colors[last + k];
          this.colors[offset] = c;
          offset++;
        }
        count++;
      }
    } else {
      for (let k = 0; k < 4; k++)
        this.colors[k] = this.decodeDiff(diffs[k][count], bitstream);
      count++;

      let offset = 4;
      for (let i = 1; i < this.node.nvert; i++) {
        for (let k = 0; k < 4; k++) {
          const d = this.decodeDiff(diffs[k][count], bitstream);
          this.colors[offset] = this.colors[offset - 4] + d;
          offset++;
        }
        count++;
      }
    }

    const steps = [];
    for (let k = 0; k < 4; k++) steps[k] = (1 << (8 - colorq[k]));

    for (let i = 0; i < this.node.nvert; i++) {
      let offset = i * 4;

      const e0 = this.colors[offset + 0] * steps[0];
      const e1 = this.colors[offset + 1] * steps[1];
      const e2 = this.colors[offset + 2] * steps[2];
      const e3 = this.colors[offset + 3] * steps[3];

      this.colors[offset + 0] = (e2 + e0) & 0xff;
      this.colors[offset + 1] = e0;
      this.colors[offset + 2] = (e1 + e0) & 0xff;
      this.colors[offset + 3] = e3;
    }
  }

  markBoundary() {
    const count = new Uint32Array(this.node.nvert);

    let offset = 0;
    for (let i = 0; i < this.node.nface; i++) {
      count[this.faces[offset + 0]] +=
          this.faces[offset + 1] - this.faces[offset + 2];
      count[this.faces[offset + 1]] +=
          this.faces[offset + 2] - this.faces[offset + 0];
      count[this.faces[offset + 2]] +=
          this.faces[offset + 0] - this.faces[offset + 1];
      offset += 3;
    }
    return count;
  }

  norm(buffer, a, b, c) {
    const ba0 = buffer[b + 0] - buffer[a + 0];
    const ba1 = buffer[b + 1] - buffer[a + 1];
    const ba2 = buffer[b + 2] - buffer[a + 2];

    const ca0 = buffer[c + 0] - buffer[a + 0];
    const ca1 = buffer[c + 1] - buffer[a + 1];
    const ca2 = buffer[c + 2] - buffer[a + 2];

    const p = [];
    p[0] = ba1 * ca2 - ba2 * ca1;
    p[1] = ba2 * ca0 - ba0 * ca2;
    p[2] = ba0 * ca1 - ba1 * ca0;
    return p;
  }

  normalize(buffer, offset) {
    const x = buffer[offset + 0];
    const y = buffer[offset + 1];
    const z = buffer[offset + 2];
    const n = Math.sqrt(x * x + y * y + z * z);
    if (n > 0) {
      buffer[offset + 0] = x / n;
      buffer[offset + 1] = y / n;
      buffer[offset + 2] = z / n;
    }
  }

  computeNormals() {
    const tmpNormals = new Float32Array(this.node.nvert * 3);

    let offset = 0;
    for (let i = 0; i < this.node.nface; i++) {
      const a = 3 * this.faces[offset + 0];
      const b = 3 * this.faces[offset + 1];
      const c = 3 * this.faces[offset + 2];

      const buffer = this.coords;
      const ba0 = buffer[b + 0] - buffer[a + 0];
      const ba1 = buffer[b + 1] - buffer[a + 1];
      const ba2 = buffer[b + 2] - buffer[a + 2];

      const ca0 = buffer[c + 0] - buffer[a + 0];
      const ca1 = buffer[c + 1] - buffer[a + 1];
      const ca2 = buffer[c + 2] - buffer[a + 2];

      const n0 = ba1 * ca2 - ba2 * ca1;
      const n1 = ba2 * ca0 - ba0 * ca2;
      const n2 = ba0 * ca1 - ba1 * ca0;

      tmpNormals[a + 0] += n0;
      tmpNormals[a + 1] += n1;
      tmpNormals[a + 2] += n2;
      tmpNormals[b + 0] += n0;
      tmpNormals[b + 1] += n1;
      tmpNormals[b + 2] += n2;
      tmpNormals[c + 0] += n0;
      tmpNormals[c + 1] += n1;
      tmpNormals[c + 2] += n2;
      offset += 3;
    }

    offset = 0;
    for (let i = 0; i < this.node.nvert; i++) {
      const x = tmpNormals[offset + 0];
      const y = tmpNormals[offset + 1];
      const z = tmpNormals[offset + 2];
      const n = Math.sqrt(x * x + y * y + z * z);
      if (n > 0) {
        tmpNormals[offset + 0] = x / n;
        tmpNormals[offset + 1] = y / n;
        tmpNormals[offset + 2] = z / n;
      }
      this.normals[offset + 0] = tmpNormals[offset + 0] * 32767;
      this.normals[offset + 1] = tmpNormals[offset + 1] * 32767;
      this.normals[offset + 2] = tmpNormals[offset + 2] * 32767;
      offset += 3;
    }
  }

  decodeDiff(diff, bitstream) {
    let val;
    if (diff == 0) {
      val = 1;
    } else {
      val = 1 << (diff);
      val |= bitstream.read(diff);
    }
    val--;
    if (val & 0x1)
      val = -((val + 1) >> 1);
    else
      val >>= 1;
    return val;
  }

  decodeConnectivity(length, start) {
    const t = this;
    const cengine = new Engine();
    const clers = cengine.decompress(this.stream);
    let clerCount = 0;

    const dengine = new Engine();
    const diffs = dengine.decompress(this.stream);
    let diffCount = 0;

    let tdiffs;
    let tdiffCount = 0;
    if (t.sig.texcoords) {
      const tengine = new Engine();
      tdiffs = tengine.decompress(this.stream);
    }

    var bitstream = this.stream.readBitStream(bitstream);

    let currentFace = 0;

    const front = new Uint32Array(this.node.nface * 18);
    let frontCount = 0;
    function addFront(_v0, _v1, _v2, _prev, _next) {
      front[frontCount++] = _v0;
      front[frontCount++] = _v1;
      front[frontCount++] = _v2;
      front[frontCount++] = _prev;
      front[frontCount++] = _next;
      front[frontCount++] = 0;
    }
    function _next(t) {
      t++;
      if (t == 3) t = 0;
      return t;
    }
    function _prev(t) {
      t--;
      if (t == -1) t = 2;
      return t;
    }

    const delayed = [];
    const faceorder = [];

    let facesCount = start;
    let totfaces = length;

    const {stack} = this;
    const {coords} = this;
    const {texcoords} = this;
    const hasTexCoords = t.sig.texcoords;

    while (totfaces > 0) {
      if (!faceorder.length && !delayed.length) {
        if (currentFace == this.node.nface) break;

        stack[0] = stack[1] = stack[2] = 0;
        stack[7] = stack[8] = 0;
        let lastIndex = -1;
        const index = [];
        for (let k = 0; k < 3; k++) {
          this.last[this.last_count++] = lastIndex;
          let diff = diffs[diffCount++];
          let tdiff = diff && hasTexCoords ? tdiffs[tdiffCount++] : 0;
          const v = this.decodeVertex(bitstream, diff, tdiff);
          index[k] = v;
          this.faces[facesCount++] = v;
          stack[0] = coords[v * 3];
          stack[1] = coords[v * 3 + 1];
          stack[2] = coords[v * 3 + 2];
          if (t.sig.texcoords) {
            stack[7] = texcoords[v * 2];
            stack[8] = texcoords[v * 2 + 1];
          }
          lastIndex = v;
        }
        const currentEdge = frontCount;
        for (let k = 0; k < 3; k++) {
          faceorder.push(frontCount);
          front[frontCount++] = index[_next(k)];
          front[frontCount++] = index[_prev(k)];
          front[frontCount++] = index[k];
          front[frontCount++] = currentEdge + _prev(k) * 6;
          front[frontCount++] = currentEdge + _next(k) * 6;
          frontCount++;
        }
        currentFace++;
        totfaces--;
        continue;
      }
      let f;
      if (faceorder.length)
        f = faceorder.shift();
      else
        f = delayed.pop();

      const edgeStart = f;

      if (front[edgeStart + 5]) continue;
      front[edgeStart + 5] = 1;

      const c = clers[clerCount++];
      if (c == 4) continue;

      const v0 = front[edgeStart + 0];
      const v1 = front[edgeStart + 1];
      const v2 = front[edgeStart + 2];
      const prev = front[edgeStart + 3];
      const next = front[edgeStart + 4];

      const firstEdge = frontCount;
      let opposite = -1;
      if (c == 0) {
        for (let k = 0; k < 3; k++)
          stack[k] =
              coords[v0 * 3 + k] + coords[v1 * 3 + k] - coords[v2 * 3 + k];

        if (hasTexCoords) {
          for (let k = 0; k < 2; k++) {
            stack[7 + k] = texcoords[v0 * 2 + k] + texcoords[v1 * 2 + k] -
                texcoords[v2 * 2 + k];
          }
        }

        const diff = diffs[diffCount++];
        const tdiff = diff && hasTexCoords ? tdiffs[tdiffCount++] : 0;
        opposite = this.decodeVertex(bitstream, diff, tdiff);
        if (diff != 0) this.last[this.last_count++] = v1;

        front[prev + 4] = firstEdge;
        front[next + 3] = firstEdge + 6;
        faceorder.unshift(frontCount);

        front[frontCount++] = v0;
        front[frontCount++] = opposite;
        front[frontCount++] = v1;
        front[frontCount++] = prev;
        front[frontCount++] = firstEdge + 6;
        frontCount++;

        faceorder.push(frontCount);

        front[frontCount++] = opposite;
        front[frontCount++] = v1;
        front[frontCount++] = v0;
        front[frontCount++] = firstEdge;
        front[frontCount++] = next;
        frontCount++;
      } else if (c == 3) {
        front[prev + 5] = 1;
        front[next + 5] = 1;
        front[front[prev + 3] + 4] = front[next + 4];
        front[front[next + 4] + 3] = front[prev + 3];
        opposite = front[prev + 0];
      } else if (c == 1) {
        front[prev + 5] = 1;
        front[front[prev + 3] + 4] = firstEdge;
        front[next + 3] = firstEdge;
        opposite = front[prev + 0];

        faceorder.unshift(frontCount);

        front[frontCount++] = opposite;
        front[frontCount++] = v1;
        front[frontCount++] = v0;
        front[frontCount++] = front[prev + 3];
        front[frontCount++] = next;
        frontCount++;
      } else if (c == 2) {
        front[next + 5] = 1;
        front[front[next + 4] + 3] = firstEdge;
        front[prev + 4] = firstEdge;
        opposite = front[next + 1];


        faceorder.unshift(frontCount);

        front[frontCount++] = v0;
        front[frontCount++] = opposite;
        front[frontCount++] = v1;
        front[frontCount++] = prev;
        front[frontCount++] = front[next + 4];
        frontCount++;
      } else if (c == 5) {
        front[edgeStart + 5] = 0;
        delayed.push(edgeStart);
        continue;
      }
      this.faces[facesCount++] = v1;
      this.faces[facesCount++] = v0;
      this.faces[facesCount++] = opposite;
      totfaces--;
    }
  }

  decodeVertex(bitstream, diff, tdiff) {
    if (diff == 0) return bitstream.read(16);

    const v = this.vertexCount++;

    const max = 1 << (diff - 1);

    for (let k = 0; k < 3; k++) {
      const d = bitstream.read(diff) - max;
      this.coords[v * 3 + k] = this.stack[k] + d;
    }
    if (this.sig.texcoords) {
      const tmax = 1 << (tdiff - 1);
      for (let k = 0; k < 2; k++) {
        const d = bitstream.read(tdiff) - tmax;
        this.texcoords[v * 2 + k] = this.stack[7 + k] + d;
      }
    }
    return v;
  }

  decodeDiff(diff, bitstream) {
    let val;
    if (diff == 0) {
      return 0;
    }
    val = 1 << diff;
    val += bitstream.read(diff);


    if (val & 0x1)
      val >>>= 1;
    else
      val = -(val >>> 1);

    return val;
  }
}

export default Decoder;
