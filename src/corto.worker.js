import CortoDecoder from './corto.em.js';

self.requests = {};
self.count = 0;
self.postRequest = function (node) {
  self.postMessage({
    buffer: node.buffer,
    request: self.count,
    rgba_colors: true,
    short_index: true,
    short_normals: true,
  });
  self.buffer = null;
  self.requests[self.count++] = node;
};

self.addEventListener('message', (job) => {
  if (typeof (job.data) === 'string') return;

  var buffer = job.data.buffer;
  if (!buffer) return;
  if (!CortoDecoder.instance)
    await CortoDecoder.ready;

  var model = CortoDecoder.decode(buffer, job.data.short_index, job.data.short_normals, job.data.rgba_colors ? 4 : 3);

  self.postMessage({ model, buffer, request: job.data.request });
});
