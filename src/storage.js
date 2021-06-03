import config from './config';
import { readFeature } from './feature';
import { readMaterial } from './material';
import { readInstance } from './instance'
import { readFloat32, readUint16, readUint32, readUint64, readUint8 } from './util';

export default class Storage {
  constructor() {
    const t = this;
    t.onLoad = null;
    t.reqAttempt = 0;
  }

  open(url) {
    const mesh = this;
    mesh.url = url;
    mesh.httpRequest(
      0,
      config.padding,
      function () {
        const view = new DataView(this.response);
        view.offset = 0;
        mesh.reqAttempt++;
        const header = mesh.importHeader(view);
        if (!header) {
          console.log('Empty header!');
          if (mesh.reqAttempt < config.maxReqAttempt)
            mesh.open(`${mesh.url}?${Math.random()}`);
          return null;
        }
        mesh.reqAttempt = 0;
        for (const i in header) mesh[i] = header[i];
        mesh.vertex = mesh.signature.vertex;
        mesh.face = mesh.signature.face;
        mesh.renderMode = mesh.face.index ? ['FACE', 'POINT'] : ['POINT'];
        mesh.compressed = (mesh.signature.flags & (4 | 8));
        mesh.decoder4 = (mesh.signature.flags & 4);
        mesh.decoder8 = (mesh.signature.flags & 8);
        mesh.requestIndex();
      },
      () => {
        console.log('Open request error!');
      },
      () => {
        console.log('Open request abort!');
      },
    );
  }

  httpRequest(start, end, load, error, abort, type) {
    if (!type) type = 'arraybuffer';
    const r = new XMLHttpRequest();
    r.open('GET', this.url, true);
    r.responseType = type;
    r.setRequestHeader('Range', `bytes=${start}-${end - 1}`);
    r.onload = function () {
      switch (this.status) {
        case 0:
          // console.log('0 response');
          break;
        case 206:
          // console.log('206 response');
          load.bind(this)();
          break;
        case 200:
          break;
        // console.log('200 response');
      }
    };
    r.onerror = error;
    r.onabort = abort;
    r.send();
    return r;
  }

  requestIndex() {
    const mesh = this;
    const end =
      (config.padding + mesh.nodesCount * config.nodeSize +
        mesh.instanceNodesCount * config.nodeSize +
        mesh.instancesCount * config.instanceSize +
        mesh.patchesCount * config.patchSize +
        mesh.texturesCount * config.textureSize +
        mesh.materialsCount * config.materialSize +
        mesh.featuresCount * config.featureSize);
    mesh.httpRequest(
      config.padding,
      end,
      function () {
        mesh.handleIndex(this.response);
      },
      () => {
        console.log('Index request error!');
      },
      () => {
        console.log('Index request abort!');
      },
    );
  }

  handleIndex(buffer) {
    const t = this;
    const view = new DataView(buffer);
    view.offset = 0;

    const n = t.nodesCount;

    t.noffsets = new Uint32Array(n);
    t.nvertices = new Uint32Array(n);
    t.nfaces = new Uint32Array(n);
    t.nerrors = new Float32Array(n);
    t.nspheres = new Float32Array(n * 5);
    t.nsize = new Float32Array(n);
    t.nfirstpatch = new Uint32Array(n);

    for (let i = 0; i < n; i++) {
      t.noffsets[i] = config.padding * readUint32(view);
      t.nvertices[i] = readUint16(view);
      t.nfaces[i] = readUint16(view);
      t.nerrors[i] = readFloat32(view);
      view.offset += 8;
      for (let k = 0; k < 5; k++) t.nspheres[i * 5 + k] = readFloat32(view);
      t.nfirstpatch[i] = readUint32(view);
    }
    t.sink = n - 1;

    const ninst = t.instanceNodesCount;

    t.ninstoffsets = new Uint32Array(ninst);
    t.ninstvertices = new Uint32Array(ninst);
    t.ninstfaces = new Uint32Array(ninst);
    t.ninsterrors = new Float32Array(ninst);
    t.ninstspheres = new Float32Array(ninst * 5);
    t.ninstsize = new Float32Array(ninst);
    t.ninstfirstpatch = new Uint32Array(ninst);

    for (let i = 0; i < ninst; i++) {
      t.ninstoffsets[i] = config.padding * readUint32(view);
      t.ninstvertices[i] = readUint16(view);
      t.ninstfaces[i] = readUint16(view);
      t.ninsterrors[i] = readFloat32(view);
      view.offset += 8;
      for (let k = 0; k < 5; k++) t.ninstspheres[i * 5 + k] = readFloat32(view);
      t.ninstfirstpatch[i] = readUint32(view);
    }

    t.instances = new Array(t.instancesCount);
    for (let i = 0; i < t.instancesCount; i++) {
      t.instances[i] = readInstance(view);
    }

    t.patches = new Uint32Array(view.buffer, view.offset, t.patchesCount * 5);

    t.nroots = t.nodesCount;
    for (let j = 0; j < t.nroots; j++) {
      for (let i = t.nfirstpatch[j]; i < t.nfirstpatch[j + 1]; i++) {
        if (t.patches[i * 4] < t.nroots) t.nroots = t.patches[i * 4];
      }
    }

    view.offset += t.patchesCount * config.patchSize;

    t.textures = new Uint32Array(t.texturesCount);
    t.texmat = new Array(t.texturesCount);
    for (let i = 0; i < t.texturesCount; i++) {
      t.textures[i] = config.padding * readUint32(view);
      t.texmat[i] = [
        readFloat32(view), readFloat32(view), readFloat32(view),
        readFloat32(view), readFloat32(view), readFloat32(view),
        readFloat32(view), readFloat32(view), readFloat32(view)
      ]
    }

    t.materials = new Array(t.materialsCount);
    for (let i = 0; i < t.materialsCount; i++) {
      t.materials[i] = readMaterial(view);
    }

    t.featoffsets = new Uint32Array(t.featuresCount);
    t.features = new Array(t.featuresCount);
    for (let i = 0; i < t.featuresCount; i++) {
      t.featoffsets[i] = config.padding * readUint32(view);
      t.features[i] = readFeature(view);
    }

    t.vsize = 12 + (t.vertex.normal ? 6 : 0) + (t.vertex.color ? 4 : 0) +
      (t.vertex.texCoord ? 8 : 0);
    t.fsize = 6;

    const tmptexsize = new Uint32Array(n - 1);
    const tmptexcount = new Uint32Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      for (let p = t.nfirstpatch[i]; p != t.nfirstpatch[i + 1]; p++) {
        const tex = t.patches[p * 4 + 2];
        tmptexsize[i] += t.textures[tex + 1] - t.textures[tex];
        tmptexcount[i]++;
      }
      t.nsize[i] = t.vsize * t.nvertices[i] + t.fsize * t.nfaces[i];
    }
    for (let i = 0; i < n - 1; i++) {
      t.nsize[i] += 10 * tmptexsize[i] / tmptexcount[i];
    }

    const tmpinsttexsize = new Uint32Array(ninst - 1);
    const tmpinsttexcount = new Uint32Array(ninst - 1);
    for (let i = 0; i < ninst - 1; i++) {
      for (let p = t.ninstfirstpatch[i]; p != t.ninstfirstpatch[i + 1]; p++) {
        const tex = t.patches[p * 4 + 2];
        tmpinsttexsize[i] += t.textures[tex + 1] - t.textures[tex];
        tmpinsttexcount[i]++;
      }
      t.ninstsize[i] = t.vsize * t.ninstvertices[i] + t.fsize * t.ninstfaces[i];
    }
    for (let i = 0; i < n - 1; i++) {
      t.ninstsize[i] += 10 * tmpinsttexsize[i] / tmpinsttexcount[i];
    }

    t.status = new Uint8Array(n);
    t.frames = new Uint32Array(n);
    t.errors = new Float32Array(n);
    t.ibo = new Array(n);
    t.vbo = new Array(n);
    t.texids = new Array(n);

    t.isReady = true;
    if (t.onLoad) t.onLoad();
  }

  importAttribute(view) {
    const a = {};
    a.type = readUint8(view);
    a.size = readUint8(view);
    a.glType = config.attrGlMap[a.type];
    a.normalized = a.type < 7;
    a.stride = config.attrSizeMap[a.type] * a.size;
    if (a.size == 0) return null;
    return a;
  }

  importElement(view) {
    const e = [];
    for (let i = 0; i < 8; i++) e[i] = this.importAttribute(view);
    return e;
  }

  importVertex(view) {
    const e = this.importElement(view);
    const color = e[2];
    if (color) {
      color.type = 2;
      color.glType = config.attrGlMap[2];
    }
    return {
      position: e[0],
      normal: e[1],
      color: e[2],
      texCoord: e[3],
      data: e[4],
    };
  }

  importFace(view) {
    const e = this.importElement(view);
    const color = e[2];
    if (color) {
      color.type = 2;
      color.glType = config.attrGlMap[2];
    }
    return {
      index: e[0],
      normal: e[1],
      color: e[2],
      texCoord: e[3],
      data: e[4],
    };
  }

  importSignature(view) {
    const s = {};
    s.vertex = this.importVertex(view);
    s.face = this.importFace(view);
    s.flags = readUint32(view);
    return s;
  }

  importHeader(view) {
    const magic = readUint32(view);
    if (magic !== config.magic) return null;
    const h = {};
    h.version = readUint32(view);
    h.verticesCount = readUint64(view);
    h.facesCount = readUint64(view);
    h.signature = this.importSignature(view);
    h.nodesCount = readUint32(view);
    h.instanceNodesCount = readUint32(view);
    h.instancesCount = readUint32(view);
    h.patchesCount = readUint32(view);
    h.texturesCount = readUint32(view);
    h.materialsCount = readUint32(view);
    h.featuresCount = readUint32(view);
    h.sphere = {
      center: [readFloat32(view), readFloat32(view), readFloat32(view)],
      radius: readFloat32(view),
    };
    h.word = [readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view),
    readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view),
    readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view),
    readFloat32(view), readFloat32(view), readFloat32(view), readFloat32(view)];
    h.tile = [readUint32(view), readUint32(view), readUint32(view)];
    return h;
  }
}
