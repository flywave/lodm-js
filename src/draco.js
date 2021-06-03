
DracoDecoder = function (dracoPath) {
    var t = this;
    t.dracoDecoderType = {};
    t.dracoSrcPath = (dracoPath !== undefined) ? dracoPath : './';
    if (typeof DracoDecoderModule === 'undefined') {
        t.loadDracoDecoder(this);
    }
};

DracoDecoder.prototype.decode = function (buffer, callback) {
    var dracoData = new Uint8Array(buffer);
    var scope = this;
    t.getDecoder(this,
        function (dracoDecoder) {
            scope.decodeDracoFileInternal(dracoData, dracoDecoder, callback);
        });
};

DracoDecoder.prototype.decodeDracoFileInternal = function (dracoData, draco, callback) {

    var decoder = new draco.Decoder();

    var dracoBuffer = new draco.DecoderBuffer();
    dracoBuffer.Init(dracoData, dracoData.length);


    var is_mesh = decoder.GetEncodedGeometryType(mesh) !== decoder.TRIANGULAR_MESH;

    var dracoGeometry = is_mesh ? new draco.Mesh() : new draco.PointCloud();

    var decodingStatus;
    if (is_mesh) {
        decodingStatus = decoder.DecodeBufferToMesh(dracoBuffer, dracoGeometry);
    } else {
        decodingStatus = decoder.DecodeBufferToPointCloud(dracoBuffer, dracoGeometry);
    }

    if (!decodingStatus.ok()) {
        data.position += 5;
        var version = data.readUByte() + '.' + data.readUByte();

        console.log("Warning: Draco", version, "decoding failed:", decodingStatus.error_msg(), "You may need update 'draco_decoder.js'.");

        draco.destroy(dracoBuffer);
        return;
    }

    var geometry = {
        nvert: nvert,
        nface: nface,
    }

    if (is_mesh) {
        geometry.indices = t.readIndices(draco, decoder, dracoGeometry);
    }

    geometry.position = t.readFloat32Array(draco, decoder, dracoGeometry, decoder.POSITION);

    if (t.hasNormal(decoder, dracoGeometry)) {
        geometry.normal = t.readFloat32Array(draco, decoder, dracoGeometry, decoder.NORMAL);
    }

    if (t.hasColor(decoder, dracoGeometry)) {
        geometry.color = t.readUInt8Array(draco, decoder, dracoGeometry, decoder.COLOR);
    }

    if (t.hasUv(decoder, dracoGeometry)) {
        geometry.uv = t.readFloat32Array(draco, decoder, dracoGeometry, decoder.TEX_COORD);
    }

    draco.destroy(dracoGeometry);
    draco.destroy(dracoBuffer);
    draco.destroy(decoder);

    callback(geometry);
};

DracoDecoder.prototype.hasNormal = function (decoder, mesh) {
    return decoder.GetAttributeId(decoder, mesh, decoder.NORMAL) > 0;
};

DracoDecoder.prototype.hasColor = function (decoder, mesh) {
    return decoder.GetAttributeId(decoder, mesh, decoder.COLOR) > 0;
};

DracoDecoder.prototype.hasUv = function (decoder, mesh) {
    return decoder.GetAttributeId(decoder, mesh, decoder.TEX_COORD) > 0;
};

DracoDecoder.prototype.readIndices = function (module, decoder, mesh) {
    var numFaces = mesh.num_faces(),
        numIndices = numFaces * 3,
        indices = new Uint16Array(numIndices);

    var ia = new module.DracoInt32Array();

    for (var i = 0; i < numFaces; ++i) {
        decoder.GetFaceFromMesh(mesh, i, ia);

        var index = i * 3;

        indices[index] = ia.GetValue(0);
        indices[index + 1] = ia.GetValue(1);
        indices[index + 2] = ia.GetValue(2);
    }

    module.destroy(ia);

    return indices;
};

DracoDecoder.prototype.readFloat32Array = function (module, decoder, mesh, attrib) {
    var attribute = decoder.GetAttribute(mesh, attrib),
        numPoints = mesh.num_points();

    var dracoArray = new module.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attribute, dracoArray);

    var size = numPoints * attribute.num_components(),
        output = new Float32Array(size);

    for (var i = 0; i < size; ++i) {
        output[i] = dracoArray.GetValue(i);
    }

    module.destroy(dracoArray);

    return output;
};

DracoDecoder.prototype.readInt16Array = function (module, decoder, mesh, attrib) {
    var attribute = decoder.GetAttribute(mesh, attrib),
        numPoints = mesh.num_points();

    var dracoArray = new module.DracoInt16Array();
    decoder.GetAttributeInt16ForAllPoints(mesh, attribute, dracoArray);

    var size = numPoints * attribute.num_components(),
        output = new Int16Array(size);

    for (var i = 0; i < size; ++i) {
        output[i] = dracoArray.GetValue(i);
    }

    module.destroy(dracoArray);

    return output;
};

DracoDecoder.prototype.readUInt8Array = function (module, decoder, mesh, attrib) {
    var attribute = decoder.GetAttribute(mesh, attrib),
        numPoints = mesh.num_points();

    var dracoArray = new module.DracoUInt8Array();
    decoder.GetAttributeUInt8ForAllPoints(mesh, attribute, dracoArray);

    var size = numPoints * attribute.num_components(),
        output = new Uint8Array(size);

    for (var i = 0; i < size; ++i) {
        output[i] = dracoArray.GetValue(i);
    }

    module.destroy(dracoArray);

    return output;
};

DracoDecoder.prototype.loadJavaScriptFile = function (path, onLoadFunc,
    dracoDecoder) {
    var head = document.getElementsByTagName('head')[0];
    var element = document.createElement('script');
    element.id = "decoder_script";
    element.type = 'text/javascript';
    element.src = path;
    if (onLoadFunc !== null) {
        element.onload = onLoadFunc(dracoDecoder);
    } else {
        element.onload = function (dracoDecoder) {
            dracoDecoder.timeLoaded = performance.now();
        };
    }

    var previous_decoder_script = document.getElementById("decoder_script");
    if (previous_decoder_script !== null) {
        previous_decoder_script.parentNode.removeChild(previous_decoder_script);
    }
    head.appendChild(element);
};

DracoDecoder.prototype.loadWebAssemblyDecoder = function (dracoDecoder) {
    dracoDecoder.dracoDecoderType['wasmBinaryFile'] =
        dracoDecoder.dracoSrcPath + 'draco_decoder.wasm';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', dracoDecoder.dracoSrcPath + 'draco_decoder.wasm', true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function () {
        dracoDecoder.dracoDecoderType['wasmBinary'] = xhr.response;
        dracoDecoder.timeLoaded = performance.now();
    };
    xhr.send(null)
};

DracoDecoder.prototype.loadDracoDecoder = function (dracoDecoder) {
    if (typeof WebAssembly !== 'object' ||
        dracoDecoder.dracoDecoderType.type === 'js') {
        this.loadJavaScriptFile(dracoDecoder.dracoSrcPath +
            'draco_decoder.js', null, dracoDecoder);
    } else {
        this.loadJavaScriptFile(dracoDecoder.dracoSrcPath +
            'draco_wasm_wrapper.js',
            function (dracoDecoder) {
                this.loadWebAssemblyDecoder(dracoDecoder);
            }, dracoDecoder);
    }
};

DracoDecoder.prototype.getDecoder = (function () {
    var decoder;
    var decoderCreationCalled = false;
    var t = this;
    return function (dracoDecoder, onDracoDecoderModuleLoadedCallback) {
        if (typeof decoder !== 'undefined') {
            if (typeof onDracoDecoderModuleLoadedCallback !== 'undefined') {
                onDracoDecoderModuleLoadedCallback(decoder);
            }
        } else {
            if (typeof DracoDecoderModule === 'undefined') {
                if (dracoDecoder.timeLoaded > 0) {
                    var waitMs = performance.now() - dracoDecoder.timeLoaded;
                    if (waitMs > 5000) {
                        throw new Error(
                            'DracoDecoder: DracoDecoderModule not found.');
                    }
                }
            } else {
                if (!decoderCreationCalled) {
                    decoderCreationCalled = true;
                    dracoDecoder.dracoDecoderType['onModuleLoaded'] =
                        function (module) {
                            if (typeof onDracoDecoderModuleLoadedCallback ===
                                'function') {
                                decoder = module;
                            }
                        };
                    DracoDecoderModule(dracoDecoder.dracoDecoderType);
                }
            }

            setTimeout(function () {
                t.getDecoder(dracoDecoder,
                    onDracoDecoderModuleLoadedCallback);
            }, 10);
        }
    };

})();


export { DracoDecoder };
