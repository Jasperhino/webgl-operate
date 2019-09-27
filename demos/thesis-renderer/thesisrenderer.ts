
import { mat3, mat4, vec3 } from 'gl-matrix';


import { auxiliaries } from 'webgl-operate';

import {
    AccumulatePass,
    AntiAliasingKernel,
    BlitPass,
    Camera,
    Canvas,
    Context,
    DefaultFramebuffer,
    ForwardSceneRenderPass,
    Framebuffer,
    Geometry,
    GLTFAlphaMode,
    GLTFLoader,
    GLTFPbrMaterial,
    GLTFPrimitive,
    Invalidate,
    Material,
    MouseEventProvider,
    Navigation,
    NdcFillingTriangle,
    Program,
    Renderbuffer,
    Renderer,
    Shader,
    Texture2D,
    TextureCube,
    Wizard,
} from 'webgl-operate';

import { Scene } from './scene';

import { Demo } from '../demo';
import { SphereLight } from './arealight';

// tslint:disable:max-classes-per-file

/**
 * @todo comment
 */
export class ThesisRenderer extends Renderer {

    protected _loader: GLTFLoader;

    protected _navigation: Navigation;

    protected _forwardPass: ForwardSceneRenderPass;
    protected _accumulatePass: AccumulatePass;
    protected _blitPass: BlitPass;

    protected _camera: Camera;

    protected _datsunScene: Scene;
    protected _kitchenScene: Scene;

    protected _intermediateFBO: Framebuffer;
    protected _colorRenderTexture: Texture2D;
    protected _depthRenderbuffer: Renderbuffer;

    protected _defaultFramebuffer: Framebuffer;
    protected _ndcTriangle: NdcFillingTriangle;
    protected _program: Program;
    protected _emptyTexture: Texture2D;

    protected _specularEnvironment: TextureCube;
    protected _brdfLUT: Texture2D;

    protected _uViewProjection: WebGLUniformLocation;
    protected _uModel: WebGLUniformLocation;
    protected _uNormalMatrix: WebGLUniformLocation;

    protected _ndcOffsetKernel: AntiAliasingKernel;
    protected _uNdcOffset: WebGLUniformLocation;

    protected _uBaseColor: WebGLUniformLocation;
    protected _uBaseColorTexCoord: WebGLUniformLocation;
    protected _uMetallicRoughness: WebGLUniformLocation;
    protected _uMetallicRoughnessTexCoord: WebGLUniformLocation;
    protected _uNormal: WebGLUniformLocation;
    protected _uNormalTexCoord: WebGLUniformLocation;
    protected _uEmissive: WebGLUniformLocation;
    protected _uEmissiveTexCoord: WebGLUniformLocation;
    protected _uOcclusion: WebGLUniformLocation;
    protected _uOcclusionTexCoord: WebGLUniformLocation;

    protected _uEye: WebGLUniformLocation;
    protected _uGeometryFlags: WebGLUniformLocation;
    protected _uPbrFlags: WebGLUniformLocation;
    protected _uBaseColorFactor: WebGLUniformLocation;
    protected _uMetallicFactor: WebGLUniformLocation;
    protected _uRoughnessFactor: WebGLUniformLocation;
    protected _uEmissiveFactor: WebGLUniformLocation;
    protected _uNormalScale: WebGLUniformLocation;
    protected _uBlendMode: WebGLUniformLocation;
    protected _uBlendCutoff: WebGLUniformLocation;

    protected _uSphereLightCenter: WebGLUniformLocation;
    protected _uSphereLightRadius: WebGLUniformLocation;
    protected _uSphereLightLuminance: WebGLUniformLocation;

    protected _uSpecularEnvironment: WebGLUniformLocation;
    protected _uBRDFLookupTable: WebGLUniformLocation;

    /**
     * Initializes and sets up rendering passes, navigation, loads a font face and links shaders with program.
     * @param context - valid context to create the object for.
     * @param identifier - meaningful name for identification of this instance.
     * @param mouseEventProvider - required for mouse interaction
     * @returns - whether initialization was successful
     */
    protected onInitialize(context: Context, callback: Invalidate,
        mouseEventProvider: MouseEventProvider,
        /* keyEventProvider: KeyEventProvider, */
        /* touchEventProvider: TouchEventProvider */): boolean {

        const gl = this._context.gl;
        const gl2facade = this._context.gl2facade;

        this._loader = new GLTFLoader(this._context);

        this._datsunScene = new Scene(
            'http://127.0.0.1:8001/1972_datsun_240k_gt/scene_fixed_size.glb',
            new Camera(vec3.fromValues(-1.9631, 1.89, 6.548), vec3.fromValues(0.292, -0.327, -0.13)),
            1, 3000);
        this._datsunScene.addLight(new SphereLight(
            vec3.fromValues(0, 500, 0), 60.0, vec3.fromValues(15, 15, 15)));

        this._kitchenScene = new Scene(
            'http://127.0.0.1:8001/italian_kitchen/scene_fixed_size.glb',
            new Camera(vec3.fromValues(-0.65597, 2.2284, 6.2853), vec3.fromValues(0.24971, 1.1144, -0.7265)),
            0.1, 512);
        this._kitchenScene.addLight(new SphereLight(
            vec3.fromValues(0, 20, 10), 4.0, vec3.fromValues(15, 15, 15)));

        this._emptyTexture = new Texture2D(this._context, 'EmptyTexture');
        this._emptyTexture.initialize(1, 1, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE);

        this._defaultFramebuffer = new DefaultFramebuffer(this._context, 'DefaultFBO');
        this._defaultFramebuffer.initialize();

        this._ndcTriangle = new NdcFillingTriangle(this._context);
        this._ndcTriangle.initialize();

        /* Initialize program, we do not use the default gltf shader here */
        const vert = new Shader(this._context, gl.VERTEX_SHADER, 'gltf_thesis.vert');
        vert.initialize(require('./data/gltf_thesis.vert'));
        const frag = new Shader(this._context, gl.FRAGMENT_SHADER, 'gltf_thesis.frag');
        frag.initialize(require('./data/gltf_thesis.frag'));
        this._program = new Program(this._context, 'ThesisPbrProgram');
        this._program.initialize([vert, frag]);

        this._uViewProjection = this._program.uniform('u_viewProjection');
        this._uModel = this._program.uniform('u_model');
        this._uNormalMatrix = this._program.uniform('u_normalMatrix');

        this._uBaseColor = this._program.uniform('u_baseColor');
        this._uBaseColorTexCoord = this._program.uniform('u_baseColorTexCoord');

        this._uMetallicRoughness = this._program.uniform('u_metallicRoughness');
        this._uMetallicRoughnessTexCoord = this._program.uniform('u_metallicRoughnessTexCoord');

        this._uNormal = this._program.uniform('u_normal');
        this._uNormalTexCoord = this._program.uniform('u_normalTexCoord');

        this._uEmissive = this._program.uniform('u_emissive');
        this._uEmissiveTexCoord = this._program.uniform('u_emissiveTexCoord');

        this._uOcclusion = this._program.uniform('u_occlusion');
        this._uOcclusionTexCoord = this._program.uniform('u_occlusionTexCoord');

        this._uNdcOffset = this._program.uniform('u_ndcOffset');

        this._uEye = this._program.uniform('u_eye');
        this._uGeometryFlags = this._program.uniform('u_geometryFlags');
        this._uPbrFlags = this._program.uniform('u_pbrFlags');
        this._uBaseColorFactor = this._program.uniform('u_baseColorFactor');
        this._uMetallicFactor = this._program.uniform('u_metallicFactor');
        this._uRoughnessFactor = this._program.uniform('u_roughnessFactor');
        this._uEmissiveFactor = this._program.uniform('u_emissiveFactor');
        this._uNormalScale = this._program.uniform('u_normalScale');
        this._uBlendMode = this._program.uniform('u_blendMode');
        this._uBlendCutoff = this._program.uniform('u_blendCutoff');

        this._uSphereLightCenter = this._program.uniform('u_sphereLight.center');
        this._uSphereLightRadius = this._program.uniform('u_sphereLight.radius');
        this._uSphereLightLuminance = this._program.uniform('u_sphereLight.luminance');

        this._uSpecularEnvironment = this._program.uniform('u_specularEnvironment');
        this._uBRDFLookupTable = this._program.uniform('u_brdfLUT');

        /* Camera will be setup by the scenes */
        this._camera = new Camera();

        /* Create and configure navigation */

        this._navigation = new Navigation(callback, mouseEventProvider);
        this._navigation.camera = this._camera;

        /**
         * Setup intermediate FBO and textures
         */
        this._colorRenderTexture = new Texture2D(this._context, 'ColorRenderTexture');
        this._depthRenderbuffer = new Renderbuffer(this._context, 'DepthRenderbuffer');
        this._intermediateFBO = new Framebuffer(this._context, 'IntermediateFBO');

        /* Create and configure forward pass. */

        this._forwardPass = new ForwardSceneRenderPass(context);
        this._forwardPass.initialize();

        this._forwardPass.camera = this._camera;
        this._forwardPass.target = this._intermediateFBO;

        this._forwardPass.program = this._program;
        this._forwardPass.updateModelTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uModel, gl.GL_FALSE, matrix);

            const normalMatrix = mat3.create();
            mat3.normalFromMat4(normalMatrix, matrix);
            gl.uniformMatrix3fv(this._uNormalMatrix, gl.GL_FALSE, normalMatrix);
        };
        this._forwardPass.updateViewProjectionTransform = (matrix: mat4) => {
            gl.uniformMatrix4fv(this._uViewProjection, gl.GL_FALSE, matrix);
        };
        this._forwardPass.bindUniforms = () => {
            gl.uniform3fv(this._uEye, this._camera.eye);

            gl.uniform1i(this._uBaseColor, 0);
            gl.uniform1i(this._uMetallicRoughness, 1);
            gl.uniform1i(this._uNormal, 2);
            gl.uniform1i(this._uOcclusion, 3);
            gl.uniform1i(this._uEmissive, 4);
            gl.uniform1i(this._uSpecularEnvironment, 5);
            gl.uniform1i(this._uBRDFLookupTable, 6);

            this._specularEnvironment.bind(gl.TEXTURE5);
            this._brdfLUT.bind(gl.TEXTURE6);
        };
        this._forwardPass.bindGeometry = (geometry: Geometry) => {
            const primitive = geometry as GLTFPrimitive;
            gl.uniform1i(this._uGeometryFlags, primitive.flags);
        };
        this._forwardPass.bindMaterial = (material: Material) => {
            const pbrMaterial = material as GLTFPbrMaterial;
            auxiliaries.assert(pbrMaterial !== undefined, `Material ${material.name} is not a PBR material.`);

            /**
             * Base color texture
             */
            if (pbrMaterial.baseColorTexture !== undefined) {
                pbrMaterial.baseColorTexture.bind(gl.TEXTURE0);
                gl.uniform1i(this._uBaseColorTexCoord, pbrMaterial.baseColorTexCoord);
            } else {
                this._emptyTexture.bind(gl.TEXTURE0);
            }

            /**
             * Metallic Roughness texture
             */
            if (pbrMaterial.metallicRoughnessTexture !== undefined) {
                pbrMaterial.metallicRoughnessTexture.bind(gl.TEXTURE1);
                gl.uniform1i(this._uMetallicRoughnessTexCoord, pbrMaterial.metallicRoughnessTexCoord);
            } else {
                this._emptyTexture.bind(gl.TEXTURE1);
            }

            /**
             * Normal texture
             */
            if (pbrMaterial.normalTexture !== undefined) {
                pbrMaterial.normalTexture.bind(gl.TEXTURE2);
                gl.uniform1i(this._uNormalTexCoord, pbrMaterial.normalTexCoord);
            } else {
                this._emptyTexture.bind(gl.TEXTURE2);
            }

            /**
             * Occlusion texture
             */
            if (pbrMaterial.occlusionTexture !== undefined) {
                pbrMaterial.occlusionTexture.bind(gl.TEXTURE3);
                gl.uniform1i(this._uOcclusionTexCoord, pbrMaterial.occlusionTexCoord);
            } else {
                this._emptyTexture.bind(gl.TEXTURE3);
            }

            /**
             * Emission texture
             */
            if (pbrMaterial.emissiveTexture !== undefined) {
                pbrMaterial.emissiveTexture.bind(gl.TEXTURE4);
                gl.uniform1i(this._uEmissiveTexCoord, pbrMaterial.emissiveTexCoord);
            } else {
                this._emptyTexture.bind(gl.TEXTURE4);
            }

            /**
             * Material properties
             */
            gl.uniform4fv(this._uBaseColorFactor, pbrMaterial.baseColorFactor);
            gl.uniform3fv(this._uEmissiveFactor, pbrMaterial.emissiveFactor);
            gl.uniform1f(this._uMetallicFactor, pbrMaterial.metallicFactor);
            gl.uniform1f(this._uRoughnessFactor, pbrMaterial.roughnessFactor);
            gl.uniform1f(this._uNormalScale, pbrMaterial.normalScale);
            gl.uniform1i(this._uPbrFlags, pbrMaterial.flags);

            if (pbrMaterial.alphaMode === GLTFAlphaMode.OPAQUE) {
                gl.disable(gl.BLEND);
                gl.uniform1i(this._uBlendMode, 0);
            } else if (pbrMaterial.alphaMode === GLTFAlphaMode.MASK) {
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                gl.uniform1i(this._uBlendMode, 1);
                gl.uniform1f(this._uBlendCutoff, pbrMaterial.alphaCutoff);
            } else if (pbrMaterial.alphaMode === GLTFAlphaMode.BLEND) {
                gl.enable(gl.BLEND);
                // We premultiply in the shader
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

                gl.uniform1i(this._uBlendMode, 2);
            } else {
                auxiliaries.log(auxiliaries.LogLevel.Warning, 'Unknown blend mode encountered.');
            }
        };

        this._accumulatePass = new AccumulatePass(context);
        this._accumulatePass.initialize(this._ndcTriangle);
        this._accumulatePass.precision = this._framePrecision;
        this._accumulatePass.texture = this._colorRenderTexture;

        this._blitPass = new BlitPass(this._context);
        this._blitPass.initialize(this._ndcTriangle);
        this._blitPass.readBuffer = gl2facade.COLOR_ATTACHMENT0;
        this._blitPass.drawBuffer = gl.BACK;
        this._blitPass.target = this._defaultFramebuffer;

        this.loadEnvironmentMap();

        const assetSelect = window.document.getElementById('asset-select')! as HTMLSelectElement;
        assetSelect.onchange = (_) => {
            this.loadAsset();
        };

        return true;
    }

    /**
     * Uninitializes Buffers, Textures, and Program.
     */
    protected onUninitialize(): void {
        super.uninitialize();

        // TODO: make sure that all meshes and programs inside of the scene get cleaned

        // this._mesh.uninitialize();
        // this._meshProgram.uninitialize();
    }

    /**
     * This is invoked in order to check if rendering of a frame is required by means of implementation specific
     * evaluation (e.g., lazy non continuous rendering). Regardless of the return value a new frame (preparation,
     * frame, swap) might be invoked anyway, e.g., when update is forced or canvas or context properties have
     * changed or the renderer was invalidated @see{@link invalidate}.
     * Updates the navigaten and the AntiAliasingKernel.
     * @returns whether to redraw
     */
    protected onUpdate(): boolean {
        if (this._altered.frameSize || this._camera.altered) {
            this._camera.viewport = [this._frameSize[0], this._frameSize[1]];
        }
        if (this._altered.canvasSize || this._camera.altered) {
            this._camera.aspect = this._canvasSize[0] / this._canvasSize[1];
        }

        this._navigation.update();
        this._forwardPass.update();

        return this._altered.any || this._camera.altered;
    }

    /**
     * This is invoked in order to prepare rendering of one or more frames, regarding multi-frame rendering and
     * camera-updates.
     */
    protected onPrepare(): void {
        const gl = this._context.gl;
        const gl2facade = this._context.gl2facade;

        if (this._forwardPass.scene === undefined) {
            this.loadAsset();
        }

        if (!this._intermediateFBO.initialized) {
            this._colorRenderTexture.initialize(this._frameSize[0], this._frameSize[1],
                this._context.isWebGL2 ? gl.RGBA8 : gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE);
            this._depthRenderbuffer.initialize(this._frameSize[0], this._frameSize[1], gl.DEPTH_COMPONENT16);
            this._intermediateFBO.initialize([[gl2facade.COLOR_ATTACHMENT0, this._colorRenderTexture]
                , [gl.DEPTH_ATTACHMENT, this._depthRenderbuffer]]);
        }

        if (this._altered.multiFrameNumber) {
            this._ndcOffsetKernel = new AntiAliasingKernel(this._multiFrameNumber);
        }

        if (this._altered.frameSize) {
            this._intermediateFBO.resize(this._frameSize[0], this._frameSize[1]);
            this._camera.viewport = [this._frameSize[0], this._frameSize[1]];
        }

        if (this._altered.clearColor) {
            this._intermediateFBO.clearColor(this._clearColor);
            this._forwardPass.clearColor = this._clearColor;
        }

        this._accumulatePass.update();
        this._forwardPass.prepare();

        this._altered.reset();
        this._camera.altered = false;
    }

    protected onFrame(frameNumber: number): void {
        const gl = this._context.gl;

        this._program.bind();

        const ndcOffset = this._ndcOffsetKernel.get(frameNumber);
        ndcOffset[0] = 2.0 * ndcOffset[0] / this._frameSize[0];
        ndcOffset[1] = 2.0 * ndcOffset[1] / this._frameSize[1];
        gl.uniform2fv(this._uNdcOffset, ndcOffset);

        this._forwardPass.frame();
        this._accumulatePass.frame(frameNumber);
    }

    protected onSwap(): void {
        this._blitPass.framebuffer = this._accumulatePass.framebuffer ?
            this._accumulatePass.framebuffer : this._blitPass.framebuffer = this._intermediateFBO;
        this._blitPass.frame();
    }

    /**
     * Load asset from URI specified by the HTML select
     */
    protected loadAsset(): void {
        const gl = this._context.gl;

        const assetSelect = window.document.getElementById('asset-select')! as HTMLSelectElement;

        let scene: Scene | undefined;
        if (assetSelect.value === 'Datsun') {
            scene = this._datsunScene;
        } else if (assetSelect.value === 'Kitchen') {
            scene = this._kitchenScene;
        }

        auxiliaries.assert(scene !== undefined, `Unknown scene ${assetSelect.value}.`);

        if (scene === undefined) {
            auxiliaries.log(auxiliaries.LogLevel.Error, `Scene ${assetSelect.value} could not be loaded.`);
            return;
        }

        this._camera = scene!.camera;
        this.updateCamera();

        this._forwardPass.scene = undefined;

        this._loader.uninitialize();
        this._loader.loadAsset(scene!.uri)
            .then(() => {
                this._forwardPass.scene = this._loader.defaultScene;
                this._invalidate(true);
            });

        /**
         * Update lights
         */
        this._program.bind();
        gl.uniform3fv(this._uSphereLightCenter, scene.lights[0].center);
        gl.uniform1f(this._uSphereLightRadius, scene.lights[0].radius);
        gl.uniform3fv(this._uSphereLightLuminance, scene.lights[0].luminance);
        this._program.unbind();
    }

    protected updateCamera(): void {
        // focal length of 50mm
        this._camera.viewport = [this._frameSize[0], this._frameSize[1]];
        this._camera.aspect = this._canvasSize[0] / this._canvasSize[1];
        // Convert from horizontal to vertical FOV
        const horizontalFOV = 39.6 * auxiliaries.DEG2RAD;
        const verticalFOV = 2.0 * Math.atan(Math.tan(horizontalFOV / 2.0) * (1.0 / this._camera.aspect));
        this._camera.fovy = verticalFOV * auxiliaries.RAD2DEG;

        this._forwardPass.camera = this._camera;
        this._navigation.camera = this._camera;
        this._camera.altered = true;
    }

    /**
     * Setup environment lighting
     */
    protected loadEnvironmentMap(): void {
        const gl = this._context.gl;

        this._brdfLUT = new Texture2D(this._context, 'BRDFLookUpTable');
        this._brdfLUT.initialize(1, 1, gl.RG16F, gl.RG, gl.FLOAT);
        this._brdfLUT.wrap(gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
        this._brdfLUT.filter(gl.LINEAR, gl.LINEAR);
        this._brdfLUT.fetch('../examples/data/imagebasedlighting/brdfLUT.png');

        const internalFormatAndType = Wizard.queryInternalTextureFormat(
            this._context, gl.RGBA, Wizard.Precision.byte);

        this._specularEnvironment = new TextureCube(this._context, 'Cubemap');
        this._specularEnvironment.initialize(512, internalFormatAndType[0], gl.RGBA, internalFormatAndType[1]);

        const MIPMAP_LEVELS = 9;

        this._specularEnvironment.filter(gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR);
        this._specularEnvironment.levels(0, MIPMAP_LEVELS - 1);

        for (let mipLevel = 0; mipLevel < MIPMAP_LEVELS; ++mipLevel) {
            this._specularEnvironment.fetch({
                positiveX: `http://127.0.0.1:8002/artificial/studio010/preprocessed-map-px-${mipLevel}.png`,
                negativeX: `http://127.0.0.1:8002/artificial/studio010/preprocessed-map-nx-${mipLevel}.png`,
                positiveY: `http://127.0.0.1:8002/artificial/studio010/preprocessed-map-py-${mipLevel}.png`,
                negativeY: `http://127.0.0.1:8002/artificial/studio010/preprocessed-map-ny-${mipLevel}.png`,
                positiveZ: `http://127.0.0.1:8002/artificial/studio010/preprocessed-map-pz-${mipLevel}.png`,
                negativeZ: `http://127.0.0.1:8002/artificial/studio010/preprocessed-map-nz-${mipLevel}.png`,
            }, mipLevel);
        }
    }
}

export class ThesisDemo extends Demo {

    private _canvas: Canvas;
    private _renderer: ThesisRenderer;

    initialize(element: HTMLCanvasElement | string): boolean {

        this._canvas = new Canvas(element);
        this._canvas.controller.multiFrameNumber = 32;
        this._canvas.framePrecision = Wizard.Precision.byte;
        this._canvas.frameScale = [1.0, 1.0];

        this._renderer = new ThesisRenderer();
        this._canvas.renderer = this._renderer;

        return true;
    }

    uninitialize(): void {
        this._canvas.dispose();
        (this._renderer as Renderer).uninitialize();
    }

    get canvas(): Canvas {
        return this._canvas;
    }

    get renderer(): ThesisRenderer {
        return this._renderer;
    }

}
