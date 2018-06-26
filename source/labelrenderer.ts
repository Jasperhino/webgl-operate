
import { assert } from './auxiliaries';

import { mat4, vec3, vec4 } from 'gl-matrix';

import { AccumulatePass } from './accumulatepass';
import { AntiAliasingKernel } from './antialiasingkernel';
import { BlitPass } from './blitpass';
import { Context } from './context';
import { DefaultFramebuffer } from './defaultframebuffer';
import { Framebuffer } from './framebuffer';
import { MouseEventProvider } from './mouseeventprovider';
// import { NdcFillingTriangle } from './ndcfillingtriangle';
import { Program } from './program';
import { Renderbuffer } from './renderbuffer';
import { Invalidate, Renderer } from './renderer';
import { Shader } from './shader';
import { Texture2 } from './texture2';

import { FontFace } from './fontface';
import { FontLoader } from './fontloader';
import { GlyphVertex, GlyphVertices } from './glyphvertices';
import { Label } from './label';
import { LabelGeometry } from './LabelGeometry';
import { Text } from './text';
import { Typesetter } from './typesetter';

import { TestNavigation } from './debug/testnavigation';


export class LabelRenderer extends Renderer {

    protected _extensions = false;
    protected _program: Program;

    protected _ndcOffsetKernel: AntiAliasingKernel;
    protected _uNdcOffset: WebGLUniformLocation;
    protected _uFrameNumber: WebGLUniformLocation;
    // protected _ndcTriangle: NdcFillingTriangle;

    protected _accumulate: AccumulatePass;
    protected _blit: BlitPass;

    protected _defaultFBO: DefaultFramebuffer;
    protected _colorRenderTexture: Texture2;
    protected _depthRenderbuffer: Renderbuffer;
    protected _intermediateFBO: Framebuffer;

    protected _testNavigation: TestNavigation;

    protected _fontFace: FontFace;
    protected _labelGeometry: LabelGeometry;
    protected _uGlyphAtlas: WebGLUniformLocation;

    protected onInitialize(context: Context, callback: Invalidate,
        mouseEventProvider: MouseEventProvider,
        /* keyEventProvider: KeyEventProvider, */
        /* touchEventProvider: TouchEventProvider */): boolean {

        this.loadFont(context);

        const gl = this._context.gl;
        const gl2facade = this._context.gl2facade;

        /* Enable required extensions. */

        if (this._extensions === false && this._context.isWebGL1) {
            assert(this._context.supportsStandardDerivatives, `expected OES_standard_derivatives support`);
            /* tslint:disable-next-line:no-unused-expression */
            this._context.standardDerivatives;
            this._extensions = true;
        }

        /* Create and configure program and geometry. */

        const vert = new Shader(this._context, gl.VERTEX_SHADER, 'glyphquad.vert');
        vert.initialize(require('./shaders/glyphquad.vert'));


        const frag = new Shader(this._context, gl.FRAGMENT_SHADER, 'glyphquad.frag');
        frag.initialize(require('./shaders/glyphquad.frag'));


        this._program = new Program(this._context);
        this._program.initialize([vert, frag]);

        this._uNdcOffset = this._program.uniform('u_ndcOffset');
        this._uFrameNumber = this._program.uniform('u_frameNumber');

        this._uGlyphAtlas = this._program.uniform('u_glyphs');

        this._labelGeometry = new LabelGeometry(this._context);
        const aVertex = this._program.attribute('a_vertex', 0);
        const aTexCoord = this._program.attribute('a_texCoord', 1);
        this._labelGeometry.initialize(aVertex, aTexCoord);

        // this._ndcTriangle = new NdcFillingTriangle(this._context);
        // const aVertex = this._program.attribute('a_vertex', 0);
        // this._ndcTriangle.initialize(aVertex);

        this._ndcOffsetKernel = new AntiAliasingKernel(this._multiFrameNumber);

        /* Create framebuffers, textures, and render buffers. */

        this._defaultFBO = new DefaultFramebuffer(this._context, 'DefaultFBO');
        this._defaultFBO.initialize();

        this._colorRenderTexture = new Texture2(this._context, 'ColorRenderTexture');
        this._depthRenderbuffer = new Renderbuffer(this._context, 'DepthRenderbuffer');

        this._intermediateFBO = new Framebuffer(this._context, 'IntermediateFBO');

        /* Create and configure accumulation pass. */

        this._accumulate = new AccumulatePass(this._context);
        this._accumulate.initialize(/*this._ndcTriangle*/);
        this._accumulate.precision = this._framePrecision;
        this._accumulate.texture = this._colorRenderTexture;
        // this._accumulate.depthStencilAttachment = this._depthRenderbuffer;

        /* Create and configure blit pass. */

        this._blit = new BlitPass(this._context);
        this._blit.initialize(/*this._ndcTriangle*/);
        this._blit.readBuffer = gl2facade.COLOR_ATTACHMENT0;
        this._blit.drawBuffer = gl.BACK;
        this._blit.target = this._defaultFBO;

        /* Create and configure test navigation. */

        this._testNavigation = new TestNavigation(() => this.invalidate(), mouseEventProvider);

        return true;
    }

    protected onUninitialize(): void {
        super.uninitialize();

        this._uNdcOffset = -1;
        this._uFrameNumber = -1;
        this._uGlyphAtlas = -1;
        this._program.uninitialize();

        // this._ndcTriangle.uninitialize();

        this._intermediateFBO.uninitialize();
        this._defaultFBO.uninitialize();
        this._colorRenderTexture.uninitialize();
        this._depthRenderbuffer.uninitialize();

        this._blit.uninitialize();
    }


    protected onUpdate(): boolean {
        this._testNavigation.update();

        const redraw = this._testNavigation.altered;
        this._testNavigation.reset();

        if (!redraw && !this._altered.any) {
            return false;
        }

        if (this._altered.multiFrameNumber) {
            this._ndcOffsetKernel.width = this._multiFrameNumber;
        }

        return redraw;
    }

    protected onPrepare(): void {

        const gl = this._context.gl;
        const gl2facade = this._context.gl2facade;

        if (!this._intermediateFBO.initialized) {
            this._colorRenderTexture.initialize(this._frameSize[0], this._frameSize[1],
                this._context.isWebGL2 ? gl.RGBA8 : gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE);
            this._depthRenderbuffer.initialize(this._frameSize[0], this._frameSize[1], gl.DEPTH_COMPONENT16);
            this._intermediateFBO.initialize([[gl2facade.COLOR_ATTACHMENT0, this._colorRenderTexture]
                , [gl.DEPTH_ATTACHMENT, this._depthRenderbuffer]]);

        } else if (this._altered.frameSize) {
            this._intermediateFBO.resize(this._frameSize[0], this._frameSize[1]);
        }

        if (this._altered.clearColor) {
            this._intermediateFBO.clearColor(this._clearColor);
        }

        this._accumulate.update();

        this._altered.reset();
    }

    protected onFrame(frameNumber: number): void {
        const gl = this._context.gl;

        gl.viewport(0, 0, this._frameSize[0], this._frameSize[1]);

        let wasBlendEnabled = false;
        const oldBlendSRC: any = gl.getParameter(gl.BLEND_SRC_RGB);
        const oldBlendDST: any = gl.getParameter(gl.BLEND_DST_RGB);

        wasBlendEnabled = gl.isEnabled(gl.BLEND);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this._program.bind();

        const ndcOffset = this._ndcOffsetKernel.get(frameNumber);
        ndcOffset[0] = 2.0 * ndcOffset[0] / this._frameSize[0];
        ndcOffset[1] = 2.0 * ndcOffset[1] / this._frameSize[1];
        gl.uniform2fv(this._uNdcOffset, ndcOffset);
        gl.uniform1i(this._uFrameNumber, frameNumber);

        this._fontFace.glyphTexture.bind(gl.TEXTURE0);
        gl.uniform1i(this._uGlyphAtlas, 0);

        this._intermediateFBO.clear(gl.COLOR_BUFFER_BIT, true, false);

        this._labelGeometry.bind();
        this._labelGeometry.draw();

        // this._ndcTriangle.bind();
        // this._ndcTriangle.draw();
        this._intermediateFBO.unbind();

        this._accumulate.frame(frameNumber);

        this._fontFace.glyphTexture.unbind(gl.TEXTURE0);
        gl.blendFunc(oldBlendSRC, oldBlendDST);
        if (!wasBlendEnabled) {
            gl.disable(gl.BLEND);
        }
    }

    protected onSwap(): void {
        this._blit.framebuffer = this._accumulate.framebuffer ?
            this._accumulate.framebuffer : this._blit.framebuffer = this._intermediateFBO;
        this._blit.frame();
    }

    protected loadFont(context: Context): void {
        const loader = new FontLoader();

        const fontFace: FontFace = loader.load(
            context, './data/opensansr144/opensansr144.fnt', false, () => {
                this.setupScene();
                this.invalidate();
            });

        this._fontFace = fontFace;
    }

    protected setupScene(): void {

        // create Label with Text and
        // tell the Typesetter to typeset that Label with the loaded FontFace (using Glyph or Glyph Vertices)
        const glyphVertices = this.prepareLabel('Hello World!');

        // make a Geometry out of those vertices (or find another way of sending vertices to shader)
        // TODO labelgeometry
        const vertices: Array<number> = [];
        const texCoords: Array<number> = [];

        const l = glyphVertices.length;

        for (let i = 0; i < l; i++) {
            const v = glyphVertices[i];

            // ll
            vertices.push(v.origin[0]);
            vertices.push(v.origin[1]);
            vertices.push(v.origin[2]);
            texCoords.push(v.uvRect[0]);
            texCoords.push(v.uvRect[1]);

            const lr = vec3.create();
            vec3.add(lr, v.origin, v.tangent);
            vertices.push(lr[0]);
            vertices.push(lr[1]);
            vertices.push(lr[2]);
            texCoords.push(v.uvRect[2]);
            texCoords.push(v.uvRect[1]);

            const ul = vec3.create();
            vec3.add(ul, v.origin, v.up);
            vertices.push(ul[0]);
            vertices.push(ul[1]);
            vertices.push(ul[2]);
            texCoords.push(v.uvRect[0]);
            texCoords.push(v.uvRect[3]);

            const ur = vec3.create();
            vec3.add(ur, lr, v.up);
            vertices.push(ur[0]);
            vertices.push(ur[1]);
            vertices.push(ur[2]);
            texCoords.push(v.uvRect[2]);
            texCoords.push(v.uvRect[3]);
        }

        this._labelGeometry.setVertices(Float32Array.from(vertices));
        this._labelGeometry.setTexCoords(Float32Array.from(texCoords));
    }

    protected prepareLabel(/*userTransform: mat4,*/ str: string /*other params*/): GlyphVertices {

        const testLabel: Label = new Label(new Text(str), this._fontFace);

        // const margins: vec4 = config.margins;

        // // compute  transform matrix
        // let transform = mat4.create();

        // // translate to lower left in NDC
        // mat4.translate(transform, transform, vec3.fromValues(-1.0, -1.0, 0.0));

        // // scale glyphs to NDC size
        // // this._size was the viewport size in Haeley
        // mat4.scale(transform, transform, vec3.fromValues(2.0 / this._size[0], 2.0 / this._size[1], 1.0));

        // // scale glyphs to pixel size with respect to the displays ppi
        // // mat4.scale(transform, transform, vec3.fromValues(config.ppiScale, config.ppiScale, config.ppiScale));

        // // translate to origin in point space - scale origin within
        // // margined extend (i.e., viewport with margined areas removed)
        // let marginedExtent: vec2 = vec2.create();
        // vec2.sub(marginedExtent, vec2.fromValues(this._size[0] / config.ppiScale, this._size[1] / config.ppiScale),
        //     vec2.fromValues(margins[3] + margins[1], margins[2] + margins[0]));

        // let v3 = vec3.fromValues(0.5 * marginedExtent[0], 0.5 * marginedExtent[1], 0);
        // vec3.add(v3, v3, vec3.fromValues(margins[3], margins[2], 0.0));
        // mat4.translate(transform, transform, v3);

        // sequence.additionalTransform = transform;

        const numGlyphs = testLabel.length;


        // prepare vertex storage (values will be overridden by typesetter)
        const vertices = new GlyphVertices();
        for (let i = 0; i < numGlyphs; ++i) {

            const vertex: GlyphVertex = {
                origin: vec3.create(),
                tangent: vec3.create(),
                up: vec3.create(),
                // vec2 lowerLeft and vec2 upperRight in glyph texture (uv)
                uvRect: vec4.create(),
            };
            vertices.push(vertex);
        }

        Typesetter.typeset(testLabel, vertices, 0);

        return vertices;
    }

    /**
     * This is ugly, but it should do the trick for now.
     * Later, we want to have a labelrenderpass and a labelpositionpass.
     * The first one bakes the geometry, the second one adapts the placement regarding dynamic placement algorithms.
     * For now, we will have both as a labelrenderer, and split it up later.
     */
}


// protected _superSampling: SuperSampling;


// export enum Sampling {
//     None = 'none',
//     Grid2 = 'grid2',
//     Grid3 = 'grid3',
//     Grid4 = 'grid4',
//     Quincunx = 'quincunx',
//     RGSS = 'rgss',
//     Rooks8 = 'rooks8',
// }


// get superSampling(): SuperSampling {
//     return this._superSampling;
// }

// set superSampling(superSampling: SuperSampling) {
//     this._superSampling = superSampling;
// }


//     // numDepictable
//     // Extent(): number {
//     //     let count = 0;
//     //     for (let c of this._text) {

//     //         /**
//     //          * let number = "h".charCodeAt(0); //(returns number = 104)
//     //          * let char = String.fromCharCode(number); //(returns char = "h")
//     //          */

//     //         if (this._fontFace.depictable(c.charCodeAt(0))) {
//     //             ++count;
//     //         }
//     //     }
//     //     return count;
//     // }


//     protected _additionalTransform: mat4;
//     protected _transformValid: boolean;
//     protected _transform: mat4;

/** TODO GlyphSequenceConfig --> LabelConfig */
//     // public setFromConfig(config: GlyphSequenceConfig) {
//     //     this.wordWrap = config.wordWrap;
//     //     this.lineWidth = config.lineWidth;
//     //     this.alignment = config.alignment;
//     //     this.lineAnchor = config.anchor;
//     //     this.fontColor = config.fontColor;
//     //     this.fontFace = config.fontFace;
//     //     this.fontSize = config.fontSize;
//     //      }

//     // get additionalTransform(): mat4 {
//     //     return this._additionalTransform;
//     // }

//     // set additionalTransform(additionalTransform: mat4) {
//     //     this._transformValid = false;
//     //     this._additionalTransform = additionalTransform;
//     // }

//     // get transform(): mat4 {
//     //     if (!this._transformValid) {
//     //         this.computeTransform();
//     //         this._transformValid = true;
//     //     }
//     //     return this._transform;
//     // }

//     // public computeTransform(): void {
//     //     //assert(this._fontFace);

//     //     this._transform = mat4.create();
//     //     mat4.multiply(this._transform, this._transform, this._additionalTransform);

//     //     let s = this._fontSize / this._fontFace.size;

//     //     mat4.scale(this._transform, this._transform, vec3.fromValues(s, s, s))
//     // }
