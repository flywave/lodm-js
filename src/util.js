function readUint64(view) {
  const lo = view.getUint32(view.offset, true);
  const hi = view.getUint32(view.offset + 4, true);
  view.offset += 8;
  return ((hi * (1 << 32)) + lo);
}

function readUint32(view) {
  const s = view.getUint32(view.offset, true);
  view.offset += 4;
  return s;
}

function readUint16(view) {
  const s = view.getUint16(view.offset, true);
  view.offset += 2;
  return s;
}

function readFloat32(view) {
  const s = view.getFloat32(view.offset, true);
  view.offset += 4;
  return s;
}

function readUint8(view) {
  const s = view.getUint8(view.offset, true);
  view.offset++;
  return s;
}

export {readUint64, readUint32, readUint16, readUint8, readFloat32};
