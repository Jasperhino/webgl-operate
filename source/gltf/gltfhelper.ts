import { log, LogLevel } from '../auxiliaries';

export class GLTFHelper {
    static modeToEnum(gl: any, mode: number): GLenum {
        if (mode < 0 || mode > 6) {
            log(LogLevel.Error, `Specified draw mode is ${mode} but is required to be between 0 and 6`);
        }

        if (mode === 0) {
            return gl.POINTS;
        }
        if (mode === 1) {
            return gl.LINES;
        }
        if (mode === 2) {
            return gl.LINE_LOOP;
        }
        if (mode === 3) {
            return gl.LINE_STRIP;
        }
        if (mode === 4) {
            return gl.TRIANGLES;
        }
        if (mode === 5) {
            return gl.TRIANGLE_STRIP;
        }
        if (mode === 6) {
            return gl.TRIANGLE_FAN;
        }

        return gl.TRIANGLES;
    }

    static nameToAttributeIndex(name: string): number {
        if (name === 'POSITION') {
            return 0;
        }
        if (name === 'NORMAL') {
            return 1;
        }
        if (name === 'TANGENT') {
            return 2;
        }
        if (name === 'TEXCOORD_0') {
            return 3;
        }
        if (name === 'TEXCOORD_1') {
            return 4;
        }
        if (name === 'JOINTS_0') {
            return 5;
        }
        if (name === 'WEIGHTS_0') {
            return 6;
        }

        log(LogLevel.Warning, `Unknown attribute name '${name}' encountered. \
            Possibly this model uses an unsupported extension.`);

        return -1;
    }

    static isPowerOfTwo(x: number): boolean {
        return (x & (x - 1)) === 0;
    }

    static nextHighestPowerOfTwo(x: number): number {
        --x;
        for (let i = 1; i < 32; i <<= 1) {
            x = x | x >> i;
        }
        return x + 1;
    }
}
