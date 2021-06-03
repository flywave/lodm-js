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

  let size;
  var buffer = job.data.buffer;
  if (!buffer) return;
  size = buffer.byteLength;
  const coder = new DracoDecoder();
  coder.decode(buffer, function (model) {
    self.postMessage({ model, buffer, request: job.data.request });
  });
});
