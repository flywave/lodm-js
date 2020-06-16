import config from './config';
import {getContext} from './context';
import {matInv, matMul} from './math';
import PriorityQueue from './priority-queue';
import Storage from './storage';

export default class Renderable {
  constructor(gl) {
    this.gl = gl;
    this.onLoad = function() {};
    this.onUpdate = null;
    this.drawBudget = config.drawBudget;
    this.attributes = null;
  }

  open(url) {
    this.context = getContext(this.gl);

    this.modelMatrix = new Float32Array(16);
    this.viewMatrix = new Float32Array(16);
    this.projectionMatrix = new Float32Array(16);
    this.modelView = new Float32Array(16);
    this.modelViewInv = new Float32Array(16);
    this.modelViewProj = new Float32Array(16);
    this.modelViewProjInv = new Float32Array(16);
    this.planes = new Float32Array(24);
    this.viewport = new Float32Array(4);
    this.viewpoint = new Float32Array(4);

    this.context.meshes.forEach((m) => {
      if (m.url === url) {
        this.mesh = m;
        this.renderMode = this.mesh.renderMode;
        this.mode = this.renderMode[0];
        this.onLoad();
      }
    });

    if (!this.mesh) {
      this.mesh = new Storage();
      this.mesh.onLoad = () => {
        this.renderMode = this.mesh.renderMode;
        this.mode = this.renderMode[0];
        this.onLoad();
      };
      this.mesh.open(url);
      this.context.meshes.push(this.mesh);
    }
  }

  close() {
    // noop
  }

  get isReady() {
    return this.mesh.isReady;
  }

  setPrimitiveMode(mode) {
    this.mode = mode;
  }

  get datasetRadius() {
    if (!this.isReady) return 1.0;
    return this.mesh.sphere.radius;
  }

  get datasetCenter() {
    if (!this.isReady) return [0, 0, 0];
    return this.mesh.sphere.center;
  }

  updateView(viewport, projection, modelView) {
    for (let i = 0; i < 16; i++) {
      this.projectionMatrix[i] = projection[i];
      this.modelView[i] = modelView[i];
    }
    for (let i = 0; i < 4; i++) this.viewport[i] = viewport[i];

    matMul(this.projectionMatrix, this.modelView, this.modelViewProj);
    matInv(this.modelViewProj, this.modelViewProjInv);

    matInv(this.modelView, this.modelViewInv);
    this.viewpoint[0] = this.modelViewInv[12];
    this.viewpoint[1] = this.modelViewInv[13];
    this.viewpoint[2] = this.modelViewInv[14];
    this.viewpoint[3] = 1.0;

    const m = this.modelViewProj;
    const mi = this.modelViewProjInv;
    const p = this.planes;

    p[0] = m[0] + m[3];
    p[1] = m[4] + m[7];
    p[2] = m[8] + m[11];
    p[3] = m[12] + m[15];
    p[4] = -m[0] + m[3];
    p[5] = -m[4] + m[7];
    p[6] = -m[8] + m[11];
    p[7] = -m[12] + m[15];
    p[8] = m[1] + m[3];
    p[9] = m[5] + m[7];
    p[10] = m[9] + m[11];
    p[11] = m[13] + m[15];
    p[12] = -m[1] + m[3];
    p[13] = -m[5] + m[7];
    p[14] = -m[9] + m[11];
    p[15] = -m[13] + m[15];
    p[16] = -m[2] + m[3];
    p[17] = -m[6] + m[7];
    p[18] = -m[10] + m[11];
    p[19] = -m[14] + m[15];
    p[20] = -m[2] + m[3];
    p[21] = -m[6] + m[7];
    p[22] = -m[10] + m[11];
    p[23] = -m[14] + m[15];

    for (let i = 0; i < 16; i += 4) {
      const l =
          Math.sqrt(p[i] * p[i] + p[i + 1] * p[i + 1] + p[i + 2] * p[i + 2]);
      p[i] /= l;
      p[i + 1] /= l;
      p[i + 2] /= l;
      p[i + 3] /= l;
    }
    const r3 = mi[3] + mi[15];
    const r0 = (mi[0] + mi[12]) / r3;
    const r1 = (mi[1] + mi[13]) / r3;
    const r2 = (mi[2] + mi[14]) / r3;

    const l3 = -mi[3] + mi[15];
    const l0 = (-mi[0] + mi[12]) / l3 - r0;
    const l1 = (-mi[1] + mi[13]) / l3 - r1;
    const l2 = (-mi[2] + mi[14]) / l3 - r2;

    const side = Math.sqrt(l0 * l0 + l1 * l1 + l2 * l2);

    const c0 = mi[12] / mi[15] - this.viewpoint[0];
    const c1 = mi[13] / mi[15] - this.viewpoint[1];
    const c2 = mi[14] / mi[15] - this.viewpoint[2];
    const dist = Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2);

    const resolution = (2 * side / dist) / this.viewport[2];
    this.currentResolution === resolution ? this.sameResolution = true :
                                            this.sameResolution = false;
    this.currentResolution = resolution;
  }

  isVisible(x, y, z, r) {
    const p = this.planes;
    for (let i = 0; i < 24; i += 4) {
      if (p[i] * x + p[i + 1] * y + p[i + 2] * z + p[i + 3] + r < 0)
        return false;
    }
    return true;
  }

  insertNode(node) {
    this.visited[node] = 1;

    const error = this.nodeError(node);
    if (node > 0 && error < this.targetError) return;

    const {errors} = this.mesh;
    const {frames} = this.mesh;
    if (frames[node] !== this.context.frame || errors[node] < error) {
      errors[node] = error;
      frames[node] = this.context.frame;
    }
    this.visitQueue.push(node, error);
  }

  insertChildren(node, block) {
    for (let i = this.mesh.nfirstpatch[node];
         i < this.mesh.nfirstpatch[node + 1]; ++i) {
      const child = this.mesh.patches[i * 4];
      if (child == this.mesh.sink) return;
      if (block) this.blocked[child] = 1;
      if (!this.visited[child]) this.insertNode(child);
    }
  }

  expandNode(node, error) {
    if (node > 0 && error < this.targetError) {
      return false;
    }

    if (this.drawSize > this.drawBudget) {
      return false;
    }

    if (this.mesh.status[node] != 1) {
      return false;
    }

    const sp = this.mesh.nspheres;
    const off = node * 5;
    if (this.isVisible(sp[off], sp[off + 1], sp[off + 2], sp[off + 3]))
      this.drawSize += this.mesh.nvertices[node] * 0.8;

    return true;
  }

  nodeError(n, tight) {
    const spheres = this.mesh.nspheres;
    const b = this.viewpoint;
    const off = n * 5;
    const cx = spheres[off + 0];
    const cy = spheres[off + 1];
    const cz = spheres[off + 2];
    let r = spheres[off + 3];
    if (tight) r = spheres[off + 4];
    const d0 = b[0] - cx;
    const d1 = b[1] - cy;
    const d2 = b[2] - cz;
    let dist = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2) - r;
    if (dist < 0.1) dist = 0.1;

    let error = this.mesh.nerrors[n] / (this.currentResolution * dist);

    if (!this.isVisible(cx, cy.cz, spheres[off + 4])) error /= 1000.0;
    return error;
  }

  traversal() {
    if (!this.isReady) return;

    if (this.sameResolution)
      if (!this.visitQueue.size && !this.nblocked) return;

    const n = this.mesh.nodesCount;
    this.visited = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.selected = new Uint8Array(n);

    this.visitQueue = new PriorityQueue(n);
    for (let i = 0; i < this.mesh.nroots; i++) this.insertNode(i);

    this.targetError = this.context.currentError;
    this.currentError = 1e20;
    this.drawSize = 0;
    this.nblocked = 0;

    let requested = 0;
    while (this.visitQueue.size && this.nblocked < config.maxBlocked) {
      const error = this.visitQueue.error[0];
      const node = this.visitQueue.pop();
      if ((requested < config.maxPending) && (this.mesh.status[node] === 0)) {
        this.context.candidates.push({
          id: node,
          instance: this,
          mesh: this.mesh,
          frame: this.context.frame,
          error,
        });
        requested++;
      }

      const blocked = this.blocked[node] || !this.expandNode(node, error);
      if (blocked)
        this.nblocked++;
      else {
        this.selected[node] = 1;
        this.currentError = error;
      }
      this.insertChildren(node, blocked);
    }
  }

  renderNodes() {
    const m = this.mesh;
    const {gl} = this;
    let attr = this.attributes;

    const vertexEnabled =
        gl.getVertexAttrib(attr.position, gl.VERTEX_ATTRIB_ARRAY_ENABLED);
    const normalEnabled = attr.normal >= 0 ?
        gl.getVertexAttrib(attr.normal, gl.VERTEX_ATTRIB_ARRAY_ENABLED) :
        false;
    const colorEnabled = attr.color >= 0 ?
        gl.getVertexAttrib(attr.color, gl.VERTEX_ATTRIB_ARRAY_ENABLED) :
        false;
    const uvEnabled = attr.uv >= 0 ?
        gl.getVertexAttrib(attr.uv, gl.VERTEX_ATTRIB_ARRAY_ENABLED) :
        false;

    let rendered = 0;
    let lastTexture = -1;

    for (let n = 0; n < m.nodesCount; n++) {
      if (!this.selected[n]) continue;

      if (this.mode != 'POINT') {
        let skip = true;
        for (let p = m.nfirstpatch[n]; p < m.nfirstpatch[n + 1]; p++) {
          const child = m.patches[p * 4];
          if (!this.selected[child]) {
            skip = false;
            break;
          }
        }
        if (skip) continue;
      }

      const sp = m.nspheres;
      const off = n * 5;
      if (!this.isVisible(sp[off], sp[off + 1], sp[off + 2], sp[off + 4]))
        continue;

      const nv = m.nvertices[n];

      if (this.mode == 'POINT') {
        const {pointsize} = this;
        let _pointsize = pointsize;
        const error = this.nodeError(n);
        if (!_pointsize) _pointsize = Math.ceil(1.2 * Math.min(error, 5));

        if (typeof attr.size === 'object') {
          gl.uniform1f(attr.size, 1.0);
          gl.uniform1f(attr.scale, 1.0);
        } else {
          gl.vertexAttrib1fv(attr.size, [_pointsize]);
        }

        const count = nv;
        if (count != 0) {
          if (m.vertex.texCoord) {
            const texid = m.patches[m.nfirstpatch[n] * 4 + 2];
            if (texid != -1 && texid != lastTexture) {
              var tex = m.texids[texid];
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, tex);
              lastTexture = texid;
            }
          }
          gl.drawArrays(gl.POINTS, 0, count);
          rendered += count;
        }
        continue;
      }

      let offset = 0;
      let end = 0;

      for (let p = m.nfirstpatch[n]; p < m.nfirstpatch[n + 1]; ++p) {
        const child = m.patches[p * 4];

        let mtlid = m.patches[p * 4 + 3];
        let nextmtlid = m.patches[(p + 1) * 4 + 3];

        if (!this.selected[child]) {
          end = m.patches[p * 4 + 1];
          if (nextmtlid === mtlid && (p + 1) < m.nfirstpatch[n + 1]) continue;
        }

        if (end > offset) {
          var mtl = this.useMaterial(mtlid);

          gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo[n]);

          gl.enableVertexAttribArray(mtl.attr.position);
          gl.vertexAttribPointer(mtl.attr.position, 3, gl.FLOAT, false, 0, 0);

          let offset1 = nv * 12;

          if (m.vertex.texCoord && mtl.attr.uv !== null && mtl.attr.uv >= 0) {
            gl.enableVertexAttribArray(mtl.attr.uv);
            gl.vertexAttribPointer(mtl.attr.uv, 2, gl.FLOAT, false, 8, offset1),
                offset1 += nv * 8;
          } else if (m.vertex.texCoord) {
            offset1 += nv * 8;
          }

          if (m.vertex.color && mtl.attr.color !== null &&
              mtl.attr.color >= 0) {
            gl.enableVertexAttribArray(mtl.attr.color);
            gl.vertexAttribPointer(
                mtl.attr.color, 4, gl.UNSIGNED_BYTE, true, 4, offset1);
            offset1 += nv * 4;
          } else if (m.vertex.color) {
            offset1 += nv * 4;
          }

          if (m.vertex.normal && mtl.attr.normal !== null &&
              mtl.attr.normal >= 0) {
            gl.enableVertexAttribArray(mtl.attr.normal);
            gl.vertexAttribPointer(
                mtl.attr.normal, 3, gl.SHORT, false, 6, offset1);
          }

          if (m.vertex.texCoord && mtl.map) {
            const texid = m.patches[p * 4 + 2];
            var tex = m.texids[texid];
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            if (mtl.attr.map !== null) {
              gl.uniform1i(mtl.attr.map, 0);
            }
          }

          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo[n]);
          gl.drawElements(
              gl.TRIANGLES,
              (end - offset) * 3,
              gl.UNSIGNED_SHORT,
              offset * 6,
          );
          gl.bindBuffer(gl.ARRAY_BUFFER, null);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
          gl.bindTexture(gl.TEXTURE_2D, null);
          rendered += end - offset;
        }
        offset = m.patches[p * 4 + 1];
      }
    }

    this.context.rendered += rendered;

    if (!vertexEnabled) gl.disableVertexAttribArray(attr.position);
    if (!normalEnabled && attr.normal >= 0)
      gl.disableVertexAttribArray(attr.normal);
    if (!colorEnabled && attr.color >= 0)
      gl.disableVertexAttribArray(attr.color);
    if (!uvEnabled && attr.uv >= 0) gl.disableVertexAttribArray(attr.uv);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    if (this.mode != 'POINT') gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  render() {
    this.traversal();
    this.renderNodes();
  }
}
