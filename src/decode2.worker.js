import Decoder from './decode2';

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
  const { signature } = job.data;
  const { patches } = job.data;

  let size;
  if (!node.buffer) return;
  size = node.buffer.byteLength;
  let buffer;
  for (let i = 0; i < 1; i++) {
    const coder = new Decoder(signature, node, patches);
    buffer = coder.decode(node.buffer);
  }
  node.buffer = buffer;
  node.owner = job.owner;
  self.postMessage(node);
});
