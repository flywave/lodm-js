import config from './config';
import {contexts, getContext} from './context';
import Decoder2 from './decode2.worker.js';
import Decoder4 from './decode4.worker.js';
import Renderable from './renderable';
import Storage from './storage';

let decoder2 = null;
let decoder4 = null;

function startFrame(gl, fps) {
  const c = getContext(gl);

  c.frame++;
  c.candidates = [];
  if (fps && c.targetFps) {
    const r = c.targetFps / fps;
    if (r > 1.1) c.currentError *= 1.05;
    if (r < 0.9) c.currentError *= 0.95;

    if (c.currentError < c.targetError) c.currentError = c.targetError;
    if (c.currentError > 10) c.currentError = 10;
  }
  c.rendered = 0;
}

function endFrame(gl) {
  refreshCache(gl);
}

function removeNode(context, node) {
  const n = node.id;
  const m = node.mesh;
  if (m.status[n] == 0) return;

  m.status[n] = 0;

  if (m.georeq.readyState != 4) m.georeq.abort();

  context.cacheSize -= m.nsize[n];
  context.gl.deleteBuffer(m.vbo[n]);
  context.gl.deleteBuffer(m.ibo[n]);
  m.vbo[n] = m.ibo[n] = null;

  if (!m.vertex.texCoord) return;
  if (m.texreq && m.texreq.readyState != 4) m.texreq.abort();
  const tex = m.patches[m.nfirstpatch[n] * 4 + 2];
  m.texref[tex]--;

  if (m.texref[tex] == 0 && m.texids[tex]) {
    context.gl.deleteTexture(m.texids[tex]);
    m.texids[tex] = null;
  }
}

function requestNode(context, node) {
  const n = node.id;
  const m = node.mesh;

  m.status[n] = 2;

  context.pending++;
  context.cacheSize += m.nsize[n];

  node.reqAttempt = 0;
  node.context = context;
  node.nvert = m.nvertices[n];
  node.nface = m.nfaces[n];

  requestNodeGeometry(context, node);
  requestNodeTexture(context, node);
}

function requestNodeGeometry(context, node) {
  const n = node.id;
  const m = node.mesh;

  m.status[n]++;
  m.georeq = m.httpRequest(
      m.noffsets[n],
      m.noffsets[n + 1],
      function() {
        loadNodeGeometry(this, context, node);
      },
      () => {
        recoverNode(context, node, 0);
      },
      () => {
        removeNode(context, node);
      },
      'arraybuffer',
  );
}

function requestNodeTexture(context, node) {
  const n = node.id;
  const m = node.mesh;

  if (!m.vertex.texCoord) return;

  const tex = m.patches[m.nfirstpatch[n] * 4 + 2];
  m.texref[tex]++;
  if (m.texids[tex]) return;

  m.status[n]++;
  m.texreq = m.httpRequest(
      m.textures[tex],
      m.textures[tex + 1],
      function() {
        loadNodeTexture(this, context, node, tex);
      },
      () => {
        recoverNode(context, node, 1);
      },
      () => {
        removeNode(context, node);
      },
      'blob',
  );
}

function recoverNode(context, node, id) {
  const n = node.id;
  const m = node.mesh;
  if (m.status[n] == 0) return;

  m.status[n]--;

  if (node.reqAttempt > config.maxReqAttempt) {
    removeNode(context, node);
    return;
  }

  node.reqAttempt++;

  switch (id) {
    case 0:
      requestNodeGeometry(context, node);
      break;
    case 1:
      requestNodeTexture(context, node);
      break;
  }
}

function loadNodeGeometry(request, context, node) {
  const n = node.id;
  const m = node.mesh;
  if (m.status[n] == 0) return;

  node.buffer = request.response;

  if (!m.compressed)
    setupNode(node);
  else if (m.decoder2) {
    const sig = {
      texcoords: m.vertex.texCoord,
      normals: m.vertex.normal,
      colors: m.vertex.color,
      indices: m.face.index,
    };
    const patches = [];
    for (let k = m.nfirstpatch[n]; k < m.nfirstpatch[n + 1]; k++)
      patches.push(m.patches[k * 4 + 1]);
    if (!decoder2) decoder2 = new Decoder2();

    decoder2.onmessage = (e) => {
      const node = decoder2.requests[e.data.request];
      node.buffer = e.data.buffer;
      setupNode(node);
    };
    decoder2.postRequest(sig, node, patches);
  } else {
    if (!decoder4) decoder4 = new Decoder4();

    decoder4.onmessage = (e) => {
      const node = decoder4.requests[e.data.request];
      node.buffer = e.data.buffer;
      node.model = e.data.model;
      setupNode(node);
    };
    decoder4.postRequest(node);
  }
}

function loadNodeTexture(request, context, node, texid) {
  const n = node.id;
  const m = node.mesh;
  if (m.status[n] == 0) return;

  const blob = request.response;

  const urlCreator = window.URL || window.webkitURL;
  const img = document.createElement('img');
  img.onerror = function(e) {
    console.log('Texture loading error!');
  };
  img.src = urlCreator.createObjectURL(blob);

  const {gl} = context;
  img.onload = function() {
    urlCreator.revokeObjectURL(img.src);

    const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const tex = m.texids[texid] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const s = gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        img,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);

    m.status[n]--;

    if (m.status[n] == 2) {
      m.status[n]--;
      node.reqAttempt = 0;
      node.context.pending--;
      node.instance.onUpdate && node.instance.onUpdate();
      refreshCache(gl);
    }
  };
}

function processData(n, coords, normals, colors) {
  while (n > 0) {
    const i = Math.floor(Math.random() * n);
    n--;
    for (let k = 0; k < 3; k++) {
      const v = coords[n * 3 + k];
      coords[n * 3 + k] = coords[i * 3 + k];
      coords[i * 3 + k] = v;

      if (normals) {
        const v = normals[n * 3 + k];
        normals[n * 3 + k] = normals[i * 3 + k];
        normals[i * 3 + k] = v;
      }
      if (colors) {
        const v = colors[n * 4 + k];
        colors[n * 4 + k] = colors[i * 4 + k];
        colors[i * 4 + k] = v;
      }
    }
  }
}

function setupNode(node) {
  const m = node.mesh;
  const n = node.id;
  const nv = m.nvertices[n];
  const nf = m.nfaces[n];
  const {model} = node;
  let v = null;
  let no = null;
  let co = null;

  let vertices;
  let indices;

  if (!m.decoder4) {
    indices = new Uint8Array(node.buffer, nv * m.vsize, nf * m.fsize);
    vertices = new Uint8Array(nv * m.vsize);
    const view = new Uint8Array(node.buffer, 0, nv * m.vsize);
    v = view.subarray(0, nv * 12);
    vertices.set(v);
    let off = nv * 12;
    if (m.vertex.texCoord) {
      const uv = view.subarray(off, off + nv * 8);
      vertices.set(uv, off);
      off += nv * 8;
    }
    if (m.vertex.normal && m.vertex.color) {
      no = view.subarray(off, off + nv * 6);
      co = view.subarray(off + nv * 6, off + nv * 6 + nv * 4);
      vertices.set(co, off);
      vertices.set(no, off + nv * 4);
    } else {
      if (m.vertex.normal) {
        no = view.subarray(off, off + nv * 6);
        vertices.set(no, off);
      }
      if (m.vertex.color) {
        co = view.subarray(off, off + nv * 4);
        vertices.set(co, off);
      }
    }
  } else {
    indices = node.model.index;
    vertices = new ArrayBuffer(nv * m.vsize);
    v = new Float32Array(vertices, 0, nv * 3);
    v.set(model.position);
    let off = nv * 12;
    if (model.uv) {
      const uv = new Float32Array(vertices, off, nv * 2);
      uv.set(model.uv);
      off += nv * 8;
    }
    if (model.color) {
      co = new Uint8Array(vertices, off, nv * 4);
      co.set(model.color);
      off += nv * 4;
    }
    if (model.normal) {
      no = new Int16Array(vertices, off, nv * 3);
      no.set(model.normal);
    }
  }

  if (nf == 0) processData(nv, v, no, co);

  const {gl} = node.context;
  const vbo = m.vbo[n] = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const ibo = m.ibo[n] = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  m.status[n]--;

  if (m.status[n] == 2) {
    m.status[n]--;  // ready
    node.reqAttempt = 0;
    node.context.pending--;
    node.instance.onUpdate && node.instance.onUpdate();
    refreshCache(gl);
  }
}

function refreshCache(gl) {
  const context = getContext(gl);

  let res = null;
  context.candidates.forEach((e) => {
    if (e.mesh.status[e.id] == 0 && (!res || e.error > res.error)) res = e;
  });
  context.candidates = [];
  if (!res) return;

  while (context.cacheSize > config.maxCacheSize) {
    let old = null;
    context.meshes.forEach((m) => {
      const n = m.nodesCount;
      for (let i = 0; i < n; i++) {
        if (!old || (m.status[i] == 1 && m.errors[i] < old.error)) {
          old = {
            error: m.errors[i],
            frame: m.frames[i],
            mesh: m,
            id: i,
          };
        }
      }
    });

    if (!old || (old.error >= res.error && old.frame == res.frame)) return;
    removeNode(context, old);
  }

  requestNode(context, res);

  if (context.pending < config.maxPending) refreshCache(gl);
}

function setTargetError(gl, error) {
  const context = getContext(gl);
  context.targetError = error;
}

function setTargetFps(gl, fps) {
  const context = getContext(gl);
  context.targetFps = fps;
}

function setMaxCacheSize(gl, size) {
  const context = getContext(gl);
  context.maxCacheSize = size;
}

const Debug = config.debug;

export {
  Storage,
  Renderable,
  Debug,
  contexts,
  startFrame,
  endFrame,
  refreshCache,
  setTargetError,
  setTargetFps,
  setMaxCacheSize,
};
