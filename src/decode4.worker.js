import Decoder from './decode4';

self.requests = {};
self.count = 0;
self.postRequest = function (node) {
  self.postMessage({
    buffer: node.buffer,
    request: self.count,
    rgba_colors: true,
    short_normals: true,
  });
  self.requests[self.count++] = node;
};

self.addEventListener('message', (job) => {
  if (typeof (job.data) === 'string') return;

  const { buffer } = job.data;
  if (!buffer) return;

  const decoder = new Decoder(buffer);

  if (decoder.attributes.normal && job.data.short_normals) decoder.attributes.normal.type = 3;
  if (decoder.attributes.color && job.data.rgba_colors) decoder.attributes.color.outcomponents = 4;

  const model = decoder.decode();

  self.postMessage({ model, buffer, request: job.data.request });
});
