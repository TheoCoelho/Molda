// @ts-nocheck

let installed = false;

export function installFabricEraser(fabric) {
  if (!fabric || installed || fabric.EraserBrush) {
    installed = true;
    return;
  }
  installed = true;

  var __drawClipPath = fabric.Object.prototype._drawClipPath;
  var _needsItsOwnCache = fabric.Object.prototype.needsItsOwnCache;
  var _toObject = fabric.Object.prototype.toObject;
  var _getSvgCommons = fabric.Object.prototype.getSvgCommons;
  var __createBaseClipPathSVGMarkup =
    fabric.Object.prototype._createBaseClipPathSVGMarkup;
  var __createBaseSVGMarkup = fabric.Object.prototype._createBaseSVGMarkup;

  function cloneWithProps(target, props) {
    if (!target || typeof target.clone !== "function") {
      return Promise.resolve(null);
    }
    try {
      var result = target.clone();
      if (result && typeof result.then === "function") {
        return result.then(function (clone) {
          if (clone && props && typeof clone.set === "function") {
            props.forEach(function (prop) {
              if (prop in target) {
                clone.set(prop, target[prop]);
              }
            });
          }
          return clone;
        });
      }
      if (result) {
        if (props && typeof result.set === "function") {
          props.forEach(function (prop) {
            if (prop in target) {
              result.set(prop, target[prop]);
            }
          });
        }
        return Promise.resolve(result);
      }
    } catch (err) {
      // fall back to callback signature
    }
    return new Promise(function (resolve) {
      target.clone(function (clone) {
        if (clone && props && typeof clone.set === "function") {
          props.forEach(function (prop) {
            if (prop in target) {
              clone.set(prop, target[prop]);
            }
          });
        }
        resolve(clone);
      }, props);
    });
  }

  fabric.Object.prototype.cacheProperties.push("eraser");
  fabric.Object.prototype.stateProperties.push("eraser");

  fabric.util.object.extend(fabric.Object.prototype, {
    erasable: true,
    eraser: undefined,
    needsItsOwnCache: function () {
      return _needsItsOwnCache.call(this) || !!this.eraser;
    },
    _drawClipPath: function (ctx, clipPath) {
      __drawClipPath.call(this, ctx, clipPath);
      if (this.eraser) {
        var size = this._getNonTransformedDimensions();
        this.eraser.isType && this.eraser.isType("eraser") &&
          this.eraser.set({
            width: size.x,
            height: size.y,
          });
        __drawClipPath.call(this, ctx, this.eraser);
      }
    },
    toObject: function (propertiesToInclude) {
      var object = _toObject.call(
        this,
        ["erasable"].concat(propertiesToInclude)
      );
      if (this.eraser && !this.eraser.excludeFromExport) {
        object.eraser = this.eraser.toObject(propertiesToInclude);
      }
      return object;
    },
    getSvgCommons: function () {
      return (
        _getSvgCommons.call(this) +
        (this.eraser ? 'mask="url(#' + this.eraser.clipPathId + ')" ' : "")
      );
    },
    _createEraserSVGMarkup: function (reviver) {
      if (this.eraser) {
        this.eraser.clipPathId = "MASK_" + fabric.Object.__uid++;
        return [
          "<mask id=\"",
          this.eraser.clipPathId,
          "\" >",
          this.eraser.toSVG(reviver),
          "</mask>",
          "\n",
        ].join("");
      }
      return "";
    },
    _createBaseClipPathSVGMarkup: function (objectMarkup, options) {
      return [
        this._createEraserSVGMarkup(options && options.reviver),
        __createBaseClipPathSVGMarkup.call(this, objectMarkup, options),
      ].join("");
    },
    _createBaseSVGMarkup: function (objectMarkup, options) {
      return [
        this._createEraserSVGMarkup(options && options.reviver),
        __createBaseSVGMarkup.call(this, objectMarkup, options),
      ].join("");
    },
  });

  fabric.util.object.extend(fabric.Group.prototype, {
    _addEraserPathToObjects: function (path) {
      return Promise.all(
        this._objects.map(function (object) {
          return fabric.EraserBrush.prototype._addPathToObjectEraser.call(
            fabric.EraserBrush.prototype,
            object,
            path
          );
        })
      );
    },
    applyEraserToObjects: function () {
      var _this = this,
        eraser = this.eraser;
      return Promise.resolve().then(function () {
        if (eraser) {
          delete _this.eraser;
          var transform = _this.calcTransformMatrix();
          return cloneWithProps(eraser).then(function (eraserClone) {
            if (!eraserClone) {
              return;
            }
            var clipPath = _this.clipPath;
            return Promise.all(
              eraserClone.getObjects("path").map(function (path) {
                var originalTransform = fabric.util.multiplyTransformMatrices(
                  transform,
                  path.calcTransformMatrix()
                );
                fabric.util.applyTransformToObject(path, originalTransform);
                return clipPath
                  ? cloneWithProps(clipPath, [
                      "absolutePositioned",
                      "inverted",
                    ]).then(function (_clipPath) {
                      if (!_clipPath) {
                        return;
                      }
                      var eraserPath =
                        fabric.EraserBrush.prototype.applyClipPathToPath.call(
                          fabric.EraserBrush.prototype,
                          path,
                          _clipPath,
                          transform
                        );
                      return _this._addEraserPathToObjects(eraserPath);
                    })
                  : _this._addEraserPathToObjects(path);
              })
            );
          });
        }
      });
    },
  });

  fabric.Eraser = fabric.util.createClass(fabric.Group, {
    type: "eraser",
    originX: "center",
    originY: "center",
    layout: "fixed",
    drawObject: function (ctx) {
      ctx.save();
      ctx.fillStyle = "black";
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.restore();
      this.callSuper("drawObject", ctx);
    },
    _toSVG: function (reviver) {
      var svgString = ["<g ", "COMMON_PARTS", " >\n"];
      var x = -this.width / 2,
        y = -this.height / 2;
      var rectSvg = [
        "<rect ",
        'fill="white" ',
        'x="',
        x,
        '" y="',
        y,
        '" width="',
        this.width,
        '" height="',
        this.height,
        '" />\n',
      ].join("");
      svgString.push("\t\t", rectSvg);
      for (var i = 0, len = this._objects.length; i < len; i++) {
        svgString.push("\t\t", this._objects[i].toSVG(reviver));
      }
      svgString.push("</g>\n");
      return svgString;
    },
  });

  fabric.Eraser.fromObject = function (object) {
    var objects = object.objects || [],
      options = fabric.util.object.clone(object, true);
    delete options.objects;
    return Promise.all([
      fabric.util.enlivenObjects(objects),
      fabric.util.enlivenObjectEnlivables(options),
    ]).then(function (enlivedProps) {
      return new fabric.Eraser(
        enlivedProps[0],
        Object.assign(options, enlivedProps[1]),
        true
      );
    });
  };

  var __renderOverlay = fabric.Canvas.prototype._renderOverlay;
  fabric.util.object.extend(fabric.Canvas.prototype, {
    isErasing: function () {
      return (
        this.isDrawingMode &&
        this.freeDrawingBrush &&
        this.freeDrawingBrush.type === "eraser" &&
        this.freeDrawingBrush._isErasing
      );
    },
    _renderOverlay: function (ctx) {
      __renderOverlay.call(this, ctx);
      this.isErasing() && this.freeDrawingBrush._render();
    },
  });

  fabric.EraserBrush = fabric.util.createClass(
    fabric.PencilBrush,
    {
      type: "eraser",
      inverted: false,
      erasingWidthAliasing: 4,
      _isErasing: false,
      _isErasable: function (object) {
        return object.erasable !== false;
      },
      _prepareCollectionTraversal: function (
        collection,
        objects,
        ctx,
        restorationContext
      ) {
        objects.forEach(function (obj) {
          var dirty = false;
          if (obj.forEachObject && obj.erasable === "deep") {
            this._prepareCollectionTraversal(
              obj,
              obj._objects,
              ctx,
              restorationContext
            );
          } else if (!this.inverted && obj.erasable && obj.visible) {
            obj.visible = false;
            restorationContext.visibility.push(obj);
            dirty = true;
          } else if (
            this.inverted &&
            obj.erasable &&
            obj.eraser &&
            obj.visible
          ) {
            var eraser = obj.eraser;
            obj.eraser = undefined;
            obj.dirty = true;
            restorationContext.eraser.push([obj, eraser]);
            dirty = true;
          }
          if (dirty && collection instanceof fabric.Object) {
            collection.dirty = true;
            restorationContext.collection.push(collection);
          }
        }, this);
      },
      preparePattern: function (objects) {
        if (!this._patternCanvas) {
          this._patternCanvas = fabric.util.createCanvasElement();
        }
        var canvas = this._patternCanvas;
        objects =
          objects || this.canvas._objectsToRender || this.canvas._objects;
        canvas.width = this.canvas.width;
        canvas.height = this.canvas.height;
        var patternCtx = canvas.getContext("2d");
        if (this.canvas._isRetinaScaling()) {
          var retinaScaling = this.canvas.getRetinaScaling();
          this.canvas.__initRetinaScaling(retinaScaling, canvas, patternCtx);
        }
        var backgroundImage = this.canvas.backgroundImage,
          bgErasable = backgroundImage && this._isErasable(backgroundImage),
          overlayImage = this.canvas.overlayImage,
          overlayErasable = overlayImage && this._isErasable(overlayImage);
        if (
          !this.inverted &&
          ((backgroundImage && !bgErasable) || !!this.canvas.backgroundColor)
        ) {
          if (bgErasable) {
            this.canvas.backgroundImage = undefined;
          }
          this.canvas._renderBackground(patternCtx);
          if (bgErasable) {
            this.canvas.backgroundImage = backgroundImage;
          }
        } else if (this.inverted) {
          var eraser = backgroundImage && backgroundImage.eraser;
          if (eraser) {
            backgroundImage.eraser = undefined;
            backgroundImage.dirty = true;
          }
          this.canvas._renderBackground(patternCtx);
          if (eraser) {
            backgroundImage.eraser = eraser;
            backgroundImage.dirty = true;
          }
        }
        patternCtx.save();
        patternCtx.transform.apply(patternCtx, this.canvas.viewportTransform);
        var restorationContext = { visibility: [], eraser: [], collection: [] };
        this._prepareCollectionTraversal(
          this.canvas,
          objects,
          patternCtx,
          restorationContext
        );
        this.canvas._renderObjects(patternCtx, objects);
        restorationContext.visibility.forEach(function (obj) {
          obj.visible = true;
        });
        restorationContext.eraser.forEach(function (entry) {
          var obj = entry[0],
            eraser = entry[1];
          obj.eraser = eraser;
          obj.dirty = true;
        });
        restorationContext.collection.forEach(function (obj) {
          obj.dirty = true;
        });
        patternCtx.restore();
        if (
          !this.inverted &&
          ((overlayImage && !overlayErasable) || !!this.canvas.overlayColor)
        ) {
          if (overlayErasable) {
            this.canvas.overlayImage = undefined;
          }
          __renderOverlay.call(this.canvas, patternCtx);
          if (overlayErasable) {
            this.canvas.overlayImage = overlayImage;
          }
        } else if (this.inverted) {
          var eraser = overlayImage && overlayImage.eraser;
          if (eraser) {
            overlayImage.eraser = undefined;
            overlayImage.dirty = true;
          }
          __renderOverlay.call(this.canvas, patternCtx);
          if (eraser) {
            overlayImage.eraser = eraser;
            overlayImage.dirty = true;
          }
        }
      },
      _setBrushStyles: function (ctx) {
        this.callSuper("_setBrushStyles", ctx);
        ctx.strokeStyle = "black";
      },
      _saveAndTransform: function (ctx) {
        this.callSuper("_saveAndTransform", ctx);
        this._setBrushStyles(ctx);
        ctx.globalCompositeOperation =
          ctx === this.canvas.getContext()
            ? "destination-out"
            : "destination-in";
      },
      needsFullRender: function () {
        return true;
      },
      onMouseDown: function (pointer, options) {
        if (!this.canvas._isMainEvent(options.e)) {
          return;
        }
        this._prepareForDrawing(pointer);
        this._captureDrawingPath(pointer);
        this.preparePattern();
        this._isErasing = true;
        this.canvas.fire("erasing:start");
        this._render();
      },
      _render: function () {
        var ctx,
          lineWidth = this.width;
        var t = this.canvas.getRetinaScaling(),
          s = 1 / t;
        ctx = this.canvas.getContext();
        if (lineWidth - this.erasingWidthAliasing > 0) {
          this.width = lineWidth - this.erasingWidthAliasing;
          this.callSuper("_render", ctx);
          this.width = lineWidth;
        }
        ctx = this.canvas.contextTop;
        this.canvas.clearContext(ctx);
        ctx.save();
        ctx.scale(s, s);
        ctx.drawImage(this._patternCanvas, 0, 0);
        ctx.restore();
        this.callSuper("_render", ctx);
      },
      createPath: function (pathData) {
        var path = this.callSuper("createPath", pathData);
        path.globalCompositeOperation = this.inverted
          ? "source-over"
          : "destination-out";
        path.stroke = this.inverted ? "white" : "black";
        return path;
      },
      applyClipPathToPath: function (
        path,
        clipPath,
        clipPathContainerTransformMatrix
      ) {
        var pathInvTransform = fabric.util.invertTransform(
            path.calcTransformMatrix()
          ),
          clipPathTransform = clipPath.calcTransformMatrix(),
          transform = clipPath.absolutePositioned
            ? pathInvTransform
            : fabric.util.multiplyTransformMatrices(
                pathInvTransform,
                clipPathContainerTransformMatrix
              );
        clipPath.absolutePositioned = false;
        fabric.util.applyTransformToObject(
          clipPath,
          fabric.util.multiplyTransformMatrices(transform, clipPathTransform)
        );
        path.clipPath = path.clipPath
          ? fabric.util.mergeClipPaths(clipPath, path.clipPath)
          : clipPath;
        return path;
      },
      clonePathWithClipPath: function (path, object) {
        var objTransform = object.calcTransformMatrix();
        var clipPath = object.clipPath;
        var _this = this;
        return Promise.all([
          cloneWithProps(path),
          cloneWithProps(clipPath, ["absolutePositioned", "inverted"]),
        ]).then(function (clones) {
          if (!clones[0] || !clones[1]) {
            return clones[0];
          }
          return _this.applyClipPathToPath(clones[0], clones[1], objTransform);
        });
      },
      _addPathToObjectEraser: function (obj, path, context) {
        var _this = this;
        if (obj.forEachObject && obj.erasable === "deep") {
          var targets = obj._objects.filter(function (_obj) {
            return _obj.erasable;
          });
          if (targets.length > 0 && obj.clipPath) {
            return this.clonePathWithClipPath(path, obj).then(function (_path) {
              if (!_path) {
                return;
              }
              return Promise.all(
                targets.map(function (_obj) {
                  return _this._addPathToObjectEraser(_obj, _path, context);
                })
              );
            });
          } else if (targets.length > 0) {
            return Promise.all(
              targets.map(function (_obj) {
                return _this._addPathToObjectEraser(_obj, path, context);
              })
            );
          }
          return;
        }
        var eraser = obj.eraser;
        if (!eraser) {
          eraser = new fabric.Eraser();
          obj.eraser = eraser;
        }
        return cloneWithProps(path).then(function (clonedPath) {
          if (!clonedPath) {
            return;
          }
          var desiredTransform = fabric.util.multiplyTransformMatrices(
            fabric.util.invertTransform(obj.calcTransformMatrix()),
            clonedPath.calcTransformMatrix()
          );
          fabric.util.applyTransformToObject(clonedPath, desiredTransform);
          eraser.add(clonedPath);
          obj.set("dirty", true);
          obj.fire("erasing:end", {
            path: clonedPath,
          });
          if (context) {
            (obj.group ? context.subTargets : context.targets).push(obj);
          }
          return clonedPath;
        });
      },
      applyEraserToCanvas: function (path, context) {
        var canvas = this.canvas;
        return Promise.all(
          ["backgroundImage", "overlayImage"].map(
            function (prop) {
              var drawable = canvas[prop];
              return (
                drawable &&
                drawable.erasable &&
                this._addPathToObjectEraser(drawable, path).then(function (res) {
                  if (context && res) {
                    context.drawables[prop] = drawable;
                  }
                  return res;
                })
              );
            },
            this
          )
        );
      },
      _finalizeAndAddPath: function () {
        var ctx = this.canvas.contextTop,
          canvas = this.canvas;
        ctx.closePath();
        if (this.decimate) {
          this._points = this.decimatePoints(this._points, this.decimate);
        }
        canvas.clearContext(canvas.contextTop);
        this._isErasing = false;
        var pathData =
          this._points && this._points.length > 1
            ? this.convertPointsToSVGPath(this._points)
            : null;
        if (!pathData || this._isEmptySVGPath(pathData)) {
          canvas.fire("erasing:end");
          canvas.requestRenderAll();
          return;
        }
        var path = this.createPath(pathData);
        path.setCoords();
        canvas.fire("before:path:created", { path: path });
        var _this = this;
        var context = {
          targets: [],
          subTargets: [],
          drawables: {},
        };
        var tasks = canvas._objects.map(function (obj) {
          return (
            obj.erasable &&
            obj.intersectsWithObject(path, true, true) &&
            _this._addPathToObjectEraser(obj, path, context)
          );
        });
        tasks.push(_this.applyEraserToCanvas(path, context));
        return Promise.all(tasks).then(function () {
          canvas.fire(
            "erasing:end",
            Object.assign(context, {
              path: path,
            })
          );

          canvas.requestRenderAll();
          _this._resetShadow();

          canvas.fire("path:created", { path: path });
        });
      },
    }
  );
}
