
/* spellchecker: disable */

import { mat4, vec2, vec3, vec4 } from 'gl-matrix';
import { fromVec4, v4 } from '../gl-matrix-extensions';

import { assert } from '../auxiliaries';
import { GLfloat2 } from '../tuples';

import { FontFace } from './fontface';
import { Glyph } from './glyph';
import { GlyphVertex, GlyphVertices } from './glyphvertices';
import { Label } from './label';

/* spellchecker: enable */


type Fragment = [number, number, Typesetter2.FragmentType];
type Line = [number, number, number];


/**
 * The typesetter is responsible for layouting text on the screen or in a virtual space. It takes a label,
 * which defines where it wants to appear (@see {@link Label}), and a font face that is used to display the
 * text, and computes the actual position for each glyph. Its output is a vertex array, which describes the glyphs
 * position and appearance on the screen/in the scene and which can be rendered using a LabelRenderPass.
 */
export class Typesetter2 {

    private static readonly DELIMITERS: string = '\x0A ,.-/()[]<>';

    /**
     * Configuring the vertex for a given glyph to be rendered. If no vertex is given or the glyph is not depictable,
     * this method immediately exits at the beginning.
     * @param fontFace - Font face to be applied for setting up the vertex.
     * @param pen - Typesetting position which is the not-yet-transformed position the glyph will be rendered at.
     * @param glyph - Glyph that is to be rendered/configured.
     * @param vertex - Out param: Associated vertex to store data required for rendering.
     */
    private static writeVertex(fontFace: FontFace, pen: vec2, glyph: Glyph,
        vertex: GlyphVertex | undefined): void {

        if (vertex === undefined || glyph.depictable() === false) {
            return;
        }

        const padding = fontFace.glyphTexturePadding;
        vertex.origin = vec3.fromValues(pen[0], pen[1], 0.0);
        vertex.origin[0] += glyph.bearing[0] - padding[3];
        vertex.origin[1] += glyph.bearing[1] - glyph.extent[1] + padding[0];

        vertex.tangent = vec3.fromValues(glyph.extent[0], 0.0, 0.0);
        vertex.up = vec3.fromValues(0.0, glyph.extent[1], 0.0);

        vertex.uvRect[0] = glyph.subTextureOrigin[0];
        vertex.uvRect[1] = glyph.subTextureOrigin[1];

        const upperRight = vec2.create();
        vec2.add(upperRight, glyph.subTextureOrigin, glyph.subTextureExtent);

        vertex.uvRect[2] = upperRight[0];
        vertex.uvRect[3] = upperRight[1];
    }


    /**
     * Compute an initial line anchor w.r.t. the targeted anchoring.
     * @param label - Label to adjust the y-positions for.
     */
    private static lineAnchorOffset(label: Label): number {
        switch (label.lineAnchor) {
            case Label.LineAnchor.Ascent:
                return label.fontFace!.ascent;
            case Label.LineAnchor.Center:
                return label.fontFace!.size * 0.5 + label.fontFace!.descent;
            case Label.LineAnchor.Descent:
                return label.fontFace!.descent;
            case Label.LineAnchor.Top:
                return label.fontFace!.base;
            case Label.LineAnchor.Bottom:
                return label.fontFace!.base - label.fontFace!.lineHeight;
            case Label.LineAnchor.Baseline:
            default:
                return 0.0;
        }
    }


    /**
     * Resolves a typed float array storing the advances of each of the label's characters.
     * @param label - Label to resolve advances for.
     * @param text - Text to compute advances for, if none is fiven, label.text is used.
     * @returns - A typed float array of all ordered character advances.
     */
    private static advances(label: Label, text?: string): Float32Array {
        assert(label.fontFace !== undefined, `expected a font face for label in order to resolve advances`);
        if (text === undefined) {
            text = label.text.text;
        }

        const advances = new Float32Array(text.length);
        for (let i = 0; i < text.length; ++i) {
            const charCode = text.charCodeAt(i);
            advances[i] = label.fontFace!.glyph(charCode).advance;
        }
        return advances;
    }

    /**
     * Resolves a typed float array storing the kernings of each of the label's characters.
     * @param label - Label to resolve kernings for.
     * @param text - Text to compute advances for, if none is fiven, label.text is used.
     * @returns - A typed float array of all ordered character kernings.
     */
    private static kernings(label: Label, text?: string): Float32Array {
        assert(label.fontFace !== undefined, `expected a font face for label in order to resolve kernings`);

        if (text === undefined) {
            const kernings = new Float32Array(label.length);
            for (let i = 0; i < label.length; ++i) {
                const kerning = label.kerningAfter(i);
                kernings[i] = isNaN(kerning) ? 0.0 : kerning;
            }
            return kernings;
        }

        const kerningAfter = (index: number): number => {
            if (index < 0 || index > text!.length - 1) {
                return NaN;
            }
            return label.fontFace!.kerning(text!.charCodeAt(index), text!.charCodeAt(index + 1));
        };

        const kernings = new Float32Array(text.length);
        for (let i = 0; i < text.length; ++i) {
            const kerning = kerningAfter(i);
            kernings[i] = isNaN(kerning) ? 0.0 : kerning;
        }
        return kernings;
    }


    /**
     * Create array of word, delimiter, and line feed fragments. A fragment thereby denotes the start and exclusive end
     * index as well as the type. The array is intended to favor maintainability over performance.
     * @param label -
     * @returns -
     */
    private static fragments(label: Label): Array<Fragment> {

        const fragments = new Array<Fragment>();

        let isDelimiter: boolean;
        let currentWordIndex = 0;
        for (let i = 0; i < label.length; ++i) {

            isDelimiter = Typesetter2.DELIMITERS.indexOf(label.charAt(i)) > -1;
            if (!isDelimiter /* includes LineFeed */) {
                continue;
            }

            if (currentWordIndex < i) {
                /* Add previous word fragment (indicated by word index below current index). */
                fragments.push([currentWordIndex, i, Typesetter2.FragmentType.Word]);
            }
            const type = label.lineFeedAt(i) ? Typesetter2.FragmentType.LineFeed : Typesetter2.FragmentType.Delimiter;
            fragments.push([i, i + 1, type]);
            currentWordIndex = i + 1;
        }
        /* Account for last fragment that does not end with delimiter. */
        if (!isDelimiter!) {
            fragments.push([currentWordIndex, label.length, Typesetter2.FragmentType.Word]);
        }

        return fragments;
    }

    /**
     * Compute fragment widths without kernings w.r.t. preceding and subsequent fragments.
     * @param fragments -
     * @param advances -
     * @param kernings -
     * @returns -
     */
    private static fragmentWidths(fragments: Array<Fragment>,
        advances: Float32Array, kernings: Float32Array): Float32Array {

        const widths = new Float32Array(fragments.length);
        for (let i = 0; i < fragments.length; ++i) {
            const fragment = fragments[i];
            widths[i] = advances.subarray(fragment[0], fragment[1]).reduce((width, advance, index) =>
                width + advance + (index < fragment[1] ? kernings[index] : 0.0), 0.0);
        }
        return widths;
    }

    /**
     * Computes origin, tangent, and up vector for every vertex of in the given range.
     * @param transform - Transformation to apply to every vertex.
     * @param vertices - Glyph vertices to be transformed (expected untransformed, in typesetting space).
     * @param begin - Vertex index to start alignment at.
     * @param end - Vertex index to stop alignment at.
     */
    private static transformVertex(transform: mat4,
        vertices: GlyphVertices | undefined, begin: number, end: number): void {
        if (vertices === undefined || mat4.equals(transform, mat4.create())) {
            return;
        }

        for (let i: number = begin; i < end; ++i) {
            const v = vertices.vertices[i];

            const lowerLeft: vec4 = vec4.transformMat4(v4(), vec4.fromValues(
                v.origin[0], v.origin[1], v.origin[2], 1.0), transform);
            const lowerRight: vec4 = vec4.transformMat4(v4(), vec4.fromValues(
                v.origin[0] + v.tangent[0], v.origin[1] + v.tangent[1], v.origin[2] + v.tangent[2], 1.0), transform);
            const upperLeft: vec4 = vec4.transformMat4(v4(), vec4.fromValues(
                v.origin[0] + v.up[0], v.origin[1] + v.up[1], v.origin[2] + v.up[2], 1.0), transform);

            v.origin = fromVec4(lowerLeft);
            v.tangent = fromVec4(vec4.sub(v4(), lowerRight, lowerLeft));
            v.up = fromVec4(vec4.sub(v4(), upperLeft, lowerLeft));
        }
    }

    /**
     * Adjusts the vertices for a line after typesetting (done due to line feed, word wrap, or end of line) w.r.t.
     * the targeted line alignment.
     * @param width - Width of the line (e.g., typesetting position at the end of the line in typesetting space).
     * @param alignment - Targeted alignment, e.g., left, center, or right.
     * @param vertices - Glyph vertices for rendering to align the origins' x-components of (expected untransformed).
     * @param begin - Vertex index to start alignment at.
     * @param end - Vertex index to stop alignment at.
     */
    private static transformAlignment(width: number, alignment: Label.Alignment,
        vertices: GlyphVertices | undefined, begin: number, end: number): void {
        if (vertices === undefined || alignment === Label.Alignment.Left) {
            return;
        }

        let offset = -width;
        if (alignment === Label.Alignment.Center) {
            offset *= 0.5;
        }

        /* Origin is expected to be in typesetting space (not transformed yet). */
        for (let i = begin; i < end; ++i) {
            vertices.vertices[i].origin[0] += offset;
        }
    }

    /**
     * Create and transform glyph vertices for rendering.
     * @param label -
     * @param vertices -
     * @param lines -
     */
    private static transform(label: Label, vertices: GlyphVertices, lines: Array<Line>): void {
        for (const line of lines) {
            Typesetter2.transformAlignment(line[2], label.alignment, vertices, line[0], line[1]);
            Typesetter2.transformVertex(label.staticTransform, vertices, line[0], line[1]);
        }
    }


    /**
     * Typesets the given label, transforming the vertices in-world, ready to be rendered.
     * @param label - The label that is to be typeset.
     * @param vertices - The glyph vertices, a prepared (optionally empty) vertex storage.
     */
    static typeset(label: Label, vertices: GlyphVertices): void {

        /** @todo this is so wrong to get the vertices here when we do not even know how many glyphs will be typeset. */
        console.log(label.length, vertices.vertices.length);

        if (label.length === 0) {
            return;
        }

        assert(label.fontFace !== undefined, `expected a font face for label before typesetting`);
        const fontFace = label.fontFace!;

        /* Retrieve advances, kernings, as well as line feed and delimiter indices. */

        const glyphs = (index: number): Glyph => index < label.length ? fontFace.glyph(label.charCodeAt(index)) :
            fontFace.glyph(label.ellipsis.charCodeAt(index - label.length));

        const advances = Typesetter2.advances(label);
        const kernings = Typesetter2.kernings(label);

        const fragments = Typesetter2.fragments(label);
        const fragmentWidths = Typesetter2.fragmentWidths(fragments, advances, kernings);


        const lines = new Array<Line>();
        let vertexIndex = 0;

        const elide = label.elide !== Label.Elide.None;


        /* Typeset Lines. A line is a 3-tuple of start-index, end-index, and line width. The indices are referencing
        vertices of the glyph vertices. They cannot be reused for further typesetting. For it a local advance function
        is defined (easier to maintain without need of so many arguments). */
        const advance = (fragments: Array<Fragment>, fragmentWidths: Float32Array, threshold: number) => {

            const pen: vec2 = vec2.fromValues(0.0, -Typesetter2.lineAnchorOffset(label));
            let firstIndexOfLine = 0;

            for (let i = 0; i < fragments.length; ++i) {

                const fragment = fragments[i];
                if (fragment[0] >= fragment[1]) {
                    continue;
                }

                /* Elide takes precedence, since full line width is used, so every line break is omitted. */
                const lineFeed = !elide && fragment[2] === Typesetter2.FragmentType.LineFeed;
                let wordWrap = false;

                /* If word wrap is desired (no elide, no line feed already and label enabled), then keep words with
                subsequent delimiters into account. These should be moved to the next line together (not split). */
                if (!elide && !lineFeed && label.wrap) {
                    /* If this fragment is a non depictable delimiter keep don't break. */
                    const depictable = fragment[2] !== Typesetter2.FragmentType.Delimiter ||
                        glyphs(fragment[0]).depictable();

                    /* If this fragment is a word then take next depictable delimiter into account. */
                    const lookAhead = fragment[2] === Typesetter2.FragmentType.Word &&
                        i < fragments.length - 1 && fragments[i + 1][2] === Typesetter2.FragmentType.Delimiter;
                    const depictableAhead = lookAhead && glyphs(fragments[i + 1][0]).depictable();

                    wordWrap = pen[0] + (depictable ? fragmentWidths[i] : 0.0)
                        + (depictableAhead ? fragmentWidths[i + 1] : 0.0) > label.lineWidth;
                }

                /* New line! Either line feed or word wrap made it. */
                if (lineFeed || wordWrap) {
                    lines.push([firstIndexOfLine, vertexIndex, pen[0]]);
                    firstIndexOfLine = vertexIndex;

                    pen[0] = 0.0;
                    pen[1] -= fontFace.lineHeight;

                    /* In case of line feed, no additional vertex needs to be written. */
                    if (lineFeed) {
                        continue;
                    }
                }

                /* Advance forward for the next word-fragment. */
                for (let i = fragment[0]; i < fragment[1]; ++i) {
                    Typesetter2.writeVertex(fontFace, pen, glyphs(i), vertices.vertices[vertexIndex]);
                    ++vertexIndex;

                    pen[0] += advances[i] + kernings[i];
                }
            }
            if (firstIndexOfLine < vertexIndex) {
                lines.push([firstIndexOfLine, vertexIndex, pen[0]]);
            }
        };


        if (elide) {


            /* Compute width of ellipsis (reuse default advances, kernings and fragment widths functions). */
            const ellipsisAdvances = Typesetter2.advances(label, label.ellipsis);
            const ellipsisKernings = Typesetter2.kernings(label, label.ellipsis);
            const ellipsisWidth = Typesetter2.fragmentWidths(
                [[0, label.ellipsis.length, Typesetter2.FragmentType.Word]], ellipsisAdvances, ellipsisKernings)[0];

            const thresholds: [number, number] = [0.0, 0.0];
            switch (label.elide) {
                case Label.Elide.Right:
                    thresholds[0] = label.lineWidth - ellipsisWidth;
                    break;
                case Label.Elide.Middle:
                    thresholds[0] = label.lineWidth / 2 - ellipsisWidth / 2;
                    thresholds[1] = thresholds[0];
                    break;
                case Label.Elide.Left:
                    thresholds[1] = label.lineWidth - ellipsisWidth;
                    break;
                default:
            }


            const elideFragments = new Array<Fragment>();
            const elideFragmentWidths = new Array<number>();

            let width = 0.0;
            // tslint:disable-next-line:prefer-for-of
            for (let i0 = 0; i0 < fragments.length; ++i0) {
                const fragment = fragments[i0];

                if (fragment[2] === Typesetter2.FragmentType.LineFeed) {
                    continue;
                }

                /* If next fragment fits as a whole, put it in. */

                if (width + fragmentWidths[i0] < thresholds[0]) {
                    width += fragmentWidths[i0];

                    elideFragments.push(fragment);
                    elideFragmentWidths.push(fragmentWidths[i0]);
                    continue;
                }
                /* If the single delimiter didn't fit, then break. */
                if (fragment[2] === Typesetter2.FragmentType.Delimiter) {
                    break;
                }

                /* Try to cramp as many characters of the fragment (word) as possible. */
                for (let i1 = fragment[0]; i1 < fragment[1]; ++i1) {
                    if (width + advances[i1] + kernings[i1] < thresholds[0]) {
                        width += advances[i1] + kernings[i1];
                        continue;
                    }

                    elideFragments.push([fragment[0], i1, fragment[2]]);
                    elideFragmentWidths.push(width + advances[i1]);
                    break;
                }
                break;
            }


            width = 0.0;
            // // tslint:disable-next-line:prefer-for-of
            // for (let i0 = fragments.length - 1; i0 > -1; --i0) {
            //     const fragment = fragments[i0];

            //     if (fragment[2] === Typesetter2.FragmentType.LineFeed) {
            //         continue;
            //     }

            //     /* If next fragment fits as a whole, put it in. */

            //     if (width + fragmentWidths[i0] < thresholds[1]) {
            //         width += fragmentWidths[i0];

            //         elideFragments.push(fragment);
            //         elideFragmentWidths.push(fragmentWidths[i0]);
            //         continue;
            //     }
            //     /* If the single delimiter didn't fit, then break. */
            //     if (fragment[2] === Typesetter2.FragmentType.Delimiter) {
            //         break;
            //     }

            //     /* Try to cramp as many characters of the fragment (word) as possible. */
            //     for (let i1 = fragment[0]; i1 < fragment[1]; ++i1) {
            //         if (width + advances[i1] + kernings[i1] < thresholds[1]) {
            //             width += advances[i1] + kernings[i1];
            //             continue;
            //         }

            //         elideFragments.push([fragment[0], i1, fragment[2]]);
            //         elideFragmentWidths.push(width + advances[i1]);
            //         break;
            //     }
            //     break;
            // }


            advance(elideFragments, new Float32Array(elideFragmentWidths), NaN);
            // fragments = elideFragments;
            // fragmentWidths = new Float32Array(elideFragmentWidths);

        } else {
            advance(fragments, fragmentWidths, label.lineWidth);
        }


        /* Apply transforms (alignment and static label transform) to all written vertices. */
        Typesetter2.transform(label, vertices, lines);
    }

}


export namespace Typesetter2 {

    export enum FragmentType {
        Word = 0,
        Delimiter = 1,
        LineFeed = 2,
    }

}
