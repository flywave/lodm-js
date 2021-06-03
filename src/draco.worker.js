import { DracoDecoder } from './draco.js';

self.requests = {};
self.count = 0;
self.postRequest = function (sig, node, patches) {
  const signature = {
    texcoords: sig.texcoords ? 1 : 0,
    colors: sig.colors ? 1 : 0,
    normals: sig.normals ? 1 : 0,
    indices: sig.indices ? 1 : 0,
  };
  self.postMessage({
    signature,
    node: {
      nface: node.nface,
      nvert: node.nvert,
      buffer: node.buffer,
      request: this.count,
    },
    patches,
  });
  this.requests[this.count++] = node;
};

self.addEventListener('message', (job) => {
  if (typeof (job.data) === 'string') return;
  const { node } = job.data;

  let size;
  if (!node.buffer) return;
  size = node.buffer.byteLength;
  let buffer;
  const coder = new DracoDecoder();
  buffer = coder.decode(node.buffer, function (model) {
    self.postMessage({ model, buffer, request: job.data.request });
  });
});
