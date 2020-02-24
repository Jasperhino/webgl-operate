
import { mat4, vec3, vec4 } from 'gl-matrix';

import { m4 } from './gl-matrix-extensions';
import { log, LogLevel } from './auxiliaries';

import { Camera } from './camera';
import { GLsizei2 } from './tuples';


/**
 * Support Class that wraps the calculation of camera tiling and iteration with various algorithms
 * by giving access to a adjusted camera which NDC-Coordinates match the current tile index.
 * Iteration can be done manually (variant: 1) or automatically (variant: 2).
 * It is intended to be used like:
 *
 * // setup
 * tileCameraGenerator = new TileCameraGenerator();
 * tileCameraGenerator.sourceCamera = camera;
 * tileCameraGenerator.sourceViewport = canvSize;
 * tileCameraGenerator.tileSize = [128, 128];
 * tileCameraGenerator.padding = new vec4();
 * tileCamera = tileRender.camera;
 * tileCameraGenerator.algorithm = TileCameraGenerator.IteratorAlgorithm.ScanLine;
 * let offset: [number, number];
 *
 * iteration variant 1:
 * for (let i = 0; i < tileCameraGenerator.numberOfTiles(); ++i){
 *      tileCameraGenerator.tile = i; // property
 *      tileCameraGenerator.update();
 *      offset = tileCameraGenerator.offset;
 *      "render camera"
 * }
 *
 * iteration variant 2:
 * while(tileCameraGenerator.nextTile()){
 *      offset = tileCameraGenerator.offset;
 *      "render"
 * }
 * // reset generator
 * tileCameraGenerator.resetTileRendering();
 *
 * NOTE: Use updateCameraProperties if the source camera is altered.
 */


export class TileCameraGenerator {

    /** @see {@link eye} */
    protected _camera: Camera | undefined;

    /** @see {@link sourceCamera} */
    protected _sourceCamera: Camera | undefined;

    /** @see {@link tile} */
    protected _tile = -1;

    /** @see {@link sourceViewport} */
    protected _sourceViewport: GLsizei2 | undefined;

    /** @see {@link tileSize} */
    protected _tileSize: GLsizei2 | undefined;

    /** @see {@link padding} */
    protected _padding: vec4 = vec4.fromValues(0, 0, 0, 0);

    /** @see {@link algorithm} */
    protected _algorithm: TileCameraGenerator.IterationAlgorithm = TileCameraGenerator.IterationAlgorithm.ScanLine;

    protected _valid: boolean;
    protected _currentOffset: [number, number] = [0, 0];
    protected _iterationAlgorithmIndices: [number, number][] = [];

    /**
     * Ensures that the _iterationAlgorithmIndices are valid by
     * filling the array if it is empty
     */
    protected ensureValidIterationIndices(): void {
        if (this._iterationAlgorithmIndices.length <= 0) {
            switch (this._algorithm) {
                case TileCameraGenerator.IterationAlgorithm.ScanLine:
                    this.fillIterationIndicesWithScanLine();
                    break;
                case TileCameraGenerator.IterationAlgorithm.HilbertCurve:
                    this.fillIterationIndicesWithHilbert();
                    break;
                case TileCameraGenerator.IterationAlgorithm.ZCurve:
                    this.fillIterationIndicesWithZCurve();
                    break;
                default:
                    this.fillIterationIndicesWithScanLine();
            }
        }
    }

    /**
     * Converts the tile index from the selected Algorithm to table indices.
     * @returns - The converted tile index.
     */
    protected tileIndexToTableIndices(): [number, number] {
        this.ensureValidIterationIndices();
        return this._iterationAlgorithmIndices[this.tile];
    }

    /**
     * Fills the iterationAlgorithmIndices with the table indices
     * from the ZCurve-Iteration-Algorithm.
     */
    protected fillIterationIndicesWithScanLine(): void {
        this._iterationAlgorithmIndices = new Array(this.numberOfTiles());
        for (let y = 0; y < this.numberOfYTiles(); y++) {
            for (let x = 0; x < this.numberOfXTiles(); x++) {
                this._iterationAlgorithmIndices[x + y * this.numberOfXTiles()] = [x, y];
            }
        }
    }

    /**
     * Fills the iterationAlgorithmIndices with the table indices
     * from the ZCurve-Iteration-Algorithm.
     */
    protected fillIterationIndicesWithZCurve(): void {
        this._iterationAlgorithmIndices = new Array(this.numberOfTiles());
        const tableSize = this.numberOfXTiles() > this.numberOfYTiles() ? this.numberOfXTiles() : this.numberOfYTiles();
        const maxZIndexBitLength = Math.floor(Math.log2(tableSize)) * 2;

        // iterate over the z-curve until all indices in the tile-range are collected
        let zIndex = 0;
        for (let numberOfFoundIndices = 0; numberOfFoundIndices < this.numberOfTiles(); zIndex++) {
            let x = 0;
            let y = 0;
            // Bit-Magic that maps the z-curve index to table indices
            // (see Definition of Z-Curve for further information)
            for (let currentBit = 0; currentBit < maxZIndexBitLength; currentBit++) {
                const xBit = zIndex >> (currentBit * 2) & 1;
                x += xBit << currentBit;
                const yBit = zIndex >> (currentBit * 2 + 1) & 1;
                y += yBit << currentBit;
            }
            // add all table indices that are int the tile-range
            if (x < this.numberOfXTiles() && y < this.numberOfYTiles()) {
                this._iterationAlgorithmIndices[numberOfFoundIndices] = [x, y];
                numberOfFoundIndices++;
            }
        }
    }

    /**
     * Fills the iterationAlgorithmIndices with the table indices
     * from the HilbertCurve-Iteration-Algorithm.
     */
    protected fillIterationIndicesWithHilbert(): void {
        this._iterationAlgorithmIndices = new Array(this.numberOfTiles());
        const tableSize = this.numberOfXTiles() > this.numberOfYTiles() ? this.numberOfXTiles() : this.numberOfYTiles();
        const recursionDepth = Math.ceil(Math.log2(tableSize));
        const tableSizeNextPowerOfTwo = Math.pow(2, recursionDepth);
        this.genHilbertIndices(0, 0, tableSizeNextPowerOfTwo, 0, 0, tableSizeNextPowerOfTwo, recursionDepth, 0);
    }

    /**
     * Recursively fills the iterationAlgorithmIndices with the HilbertCurve.
     * Do not use this method. Use fillIterationIndicesWithHilbert() instead.
     */
    protected genHilbertIndices(x: number, y: number,
        xi: number, xj: number, yi: number, yj: number, depth: number, hilbertIndex: number): number {
        if (depth <= 0) {
            x = x + (xi + yi - 1) / 2;
            y = y + (xj + yj - 1) / 2;
            if (x < this.numberOfXTiles() && y < this.numberOfYTiles()) {
                this._iterationAlgorithmIndices[hilbertIndex] = [x, y];
                return hilbertIndex + 1;
            }
        } else {
            hilbertIndex = this.genHilbertIndices(x, y, yi / 2, yj / 2, xi / 2, xj / 2, depth - 1, hilbertIndex);
            hilbertIndex = this.genHilbertIndices(x + xi / 2, y + xj / 2, xi / 2, xj / 2, yi / 2, yj / 2,
                depth - 1, hilbertIndex);
            hilbertIndex = this.genHilbertIndices(x + xi / 2 + yi / 2, y + xj / 2 + yj / 2, xi / 2, xj / 2, yi / 2,
                yj / 2, depth - 1, hilbertIndex);
            hilbertIndex = this.genHilbertIndices(x + xi / 2 + yi, y + xj / 2 + yj, -yi / 2, -yj / 2, -xi / 2,
                -xj / 2, depth - 1, hilbertIndex);
        }
        return hilbertIndex;
    }

    /**
     * Returns the padded tileSize.
     * @returns - The padded tileSize.
     */
    protected getPaddedTileSize(): [number, number] {
        return [this.padding[1] + this.padding[3] + this.tileSize[0],
        this.padding[0] + this.padding[2] + this.tileSize[1]];
    }

    /**
     * Used for Iterator behavior. It sets the tile to 0 (first tile) if the value of tile is negative
     * and therefore initiates the iteration.
     * Otherwise it increments the tile and calls update to directly change the camera.
     * If the tile index would get out of range it returns false to indicate, that all tiles were rendered.
     * @returns - If the camera has been set to a next tile.
     */
    public nextTile(): boolean {
        if (this.tile >= this.numberOfTiles() - 1) {
            return false;
        }
        if (this.tile < 0) {
            this.tile = -1;
        }
        ++this.tile;
        this.update();
        return true;
    }

    /**
     * Returns if tiles still need to be rendered.
     */
    public hasNextTile(): boolean {
        return this.tile < this.numberOfTiles() - 1 && this.tile >= 0;
    }

    /**
     * Resets the tile index to prepare the generator for the next rendering.
     * Should be called after iteration with nextTile().
     */
    public resetTileRendering(): void {
        this.tile = -1;
        this._currentOffset[0] = 0;
        this._currentOffset[1] = 0;
    }

    /**
     * Reassigns all values from the source camera to the tile camera.
     * Should be called when the source camera is altered.
     */
    public updateCameraProperties(): void {
        this.sourceCamera.copyAllValues(this.camera);
    }

    /**
     * Updates the camera view frustum to current tile based on
     * the sourceViewport, tileSize and the padding.
     * If the tile is less than zero, the camera is set to the first tile.
     * If the tile is too high, the camera is not updated and remains in the last valid state.
     * @returns - the offset of the new camera tile.
     */
    public update(): [number, number] {
        // do nothing and return the last offset if no property has changed.
        if (this._valid) {
            return this._currentOffset;
        }

        // If an invalid index is requested: Do not change the camera and return the last valid tile offset.
        if (this.numberOfTiles() <= this.tile || 0 > this.tile) {
            log(LogLevel.Warning, `index:${this.tile} is out of bounds: ${this.numberOfTiles()}
                . Returning the first Tile`);
            return this._currentOffset;
        }

        this._valid = true;
        const tableIndices = this.tileIndexToTableIndices();
        const viewport = this.sourceViewport;
        const paddedTileSize = this.getPaddedTileSize();

        // Calculate the padded tile center coordinates in the viewport-space.
        const paddedTileCenter = [0, 0];
        paddedTileCenter[0] = tableIndices[0] * this.tileSize[0] + paddedTileSize[0] / 2;
        paddedTileCenter[1] = tableIndices[1] * this.tileSize[1] + paddedTileSize[1] / 2;

        // Calculate the offset which is needed for the return.
        const offset: [number, number] = [0, 0];
        offset[0] = tableIndices[0] * this.tileSize[0];
        offset[1] = tableIndices[1] * this.tileSize[1];

        // Scale down the padded tile center coordinates to padded tile center NDC coordinates.
        const paddedTileCenterNDC = [paddedTileCenter[0] * 2 / viewport[0] - 1
            , paddedTileCenter[1] * 2 / viewport[1] - 1];

        // Create the scale vector that scales up the padded tile to the NDC-range of -1;1.
        const scaleVec = vec3.fromValues(viewport[0] / paddedTileSize[0], viewport[1] / paddedTileSize[1], 1);

        // Create the translation vector which shifts the padded tile center NDC into the origin.
        const translationVec = vec3.fromValues(-paddedTileCenterNDC[0], -paddedTileCenterNDC[1], 0);

        // Combine the translation ans scale into the matrix.
        const tileNDCCorrectionMatrix = mat4.scale(m4(), mat4.identity(m4()), scaleVec);
        const translateMatrix = mat4.translate(m4(), tileNDCCorrectionMatrix, translationVec);

        // Set the postViewProjection matrix and offset to the new calculated values.
        this.camera.postViewProjection = translateMatrix;
        this._currentOffset = offset;

        return offset;
    }

    /**
     * Returns the number of tiles along the X axis
     * based on the how many of tileSize fit inside the sourceViewport.
     * @returns - The number of tiles along the X axis.
     */
    public numberOfXTiles(): number {
        return Math.ceil(this.sourceViewport[0] / this.tileSize[0]);
    }

    /**
     * Returns the number of tiles along the Y axis
     * based on the how many of tileSize fit inside the sourceViewport.
     * @returns - The number of tiles along the Y axis.
     */
    public numberOfYTiles(): number {
        return Math.ceil(this.sourceViewport[1] / this.tileSize[1]);
    }


    /**
     * Returns the total number of tiles
     * based on the how many of tileSize fit inside the sourceViewport.
     * @returns - The total number of tiles.
     */
    public numberOfTiles(): number {
        return this.numberOfXTiles() * this.numberOfYTiles();
    }

    /**
     * Returns the offset of the current tile.
     * The padding is not included in the offset.
     * @returns - Current tile offset.
     */
    get offset(): [number, number] {
        return this._currentOffset;
    }

    /**
     * Returns the reference to the camera
     * that has the viewport of the current tile of the sourceCamera.
     * It returns a default camera if the camera is undefined.
     * This is the case when the sourceCamera has not been set.
     * @returns - The reference to the tile viewing camera.
     */
    get camera(): Camera {
        if (this._camera) {
            return this._camera;
        } else {
            return new Camera();
        }
    }

    /**
     * Returns the sourceCamera which viewport should be divided in tiles.
     * If the sourceCamera has not been set, it returns a default camera.
     * @returns - The sourceCamera which viewport should be divided in tiles.
     */
    get sourceCamera(): Camera {
        if (this._sourceCamera) {
            return this._sourceCamera;
        } else {
            return new Camera();
        }
    }

    /**
     * Sets the sourceCamera which viewport should be divided in tiles.
     * Additionally it creates a deep copy of the sourceCamera
     * which is used as the tiled camera.
     * @param camera - The sourceCamera which viewport should be divided in tiles.
     */
    set sourceCamera(camera: Camera) {
        if (this._sourceCamera !== camera) {
            this._sourceCamera = camera;
            this._camera = camera.copy();
            this._valid = false;
        }
    }

    /**
     * Returns the current tile index.
     * @returns - The current tile index.
     */
    get tile(): number {
        return this._tile;
    }

    /**
     * Sets the current tile index.
     * @param index - The new index.
     */
    set tile(index: number) {
        if (this._tile !== index) {
            this._tile = index;
            this._valid = false;
        }
    }

    /**
     * Returns the size of the original viewport
     * which should be divided in tiles based on the tile size.
     * If the viewport has not been set, it returns [-1, -1].
     * @returns - Size of the Viewport.
     */
    get sourceViewport(): GLsizei2 {
        if (this._sourceViewport) {
            return this._sourceViewport;
        } else {
            return [-1, -1];
        }
    }

    /**
     * Sets the size of the viewport from the sourceCamera.
     * It checks if the sourceViewport is compatible with the selected algorithm
     * and eventually adjusts the tileSize to match the conditions of the algorithm.
     */
    set sourceViewport(viewport: GLsizei2) {
        if (this._sourceViewport !== viewport) {
            this._sourceViewport = viewport;
            this._iterationAlgorithmIndices = [];
            this._valid = false;
        }
    }

    /**
     * Returns the tileSize.
     * If the tilesSize has not been set it returns [-1, -1] as invalid.
     */
    get tileSize(): GLsizei2 {
        if (this._tileSize) {
            return this._tileSize;
        } else {
            return [-1, -1];
        }
    }

    /**
     * Sets the tileSize.
     * The tileSize eventually changes to match the selected algorithms constraints.
     */
    set tileSize(tileSize: GLsizei2) {
        if (this._tileSize !== tileSize) {
            this._tileSize = tileSize;
            this._iterationAlgorithmIndices = [];
            this._valid = false;
        }
    }

    /**
     * Returns the padding per tile in CSS order: top, right, bottom, left.
     * The standard is (0, 0, 0, 0).
     */
    get padding(): vec4 {
        return this._padding;
    }

    /**
     * Stets the padding per tile in CSS order: top, right, bottom, left.
     * The standard is (0, 0, 0, 0).
     */
    set padding(padding: vec4) {
        if (this._padding !== padding) {
            this._padding = padding;
            this._valid = false;
        }
    }

    /**
     * Returns the selected IterationAlgorithm which determines the order
     * in which the tiles are rendered.
     * The default is TileCameraGenerator.IterationAlgorithm.ScanLine.
     */
    get algorithm(): TileCameraGenerator.IterationAlgorithm {
        return this._algorithm;
    }

    /**
     * Sets the selected IterationAlgorithm which determines the order
     * in which the tiles are rendered.
     * The default is TileCameraGenerator.IterationAlgorithm.ScanLine.
     * If needed, it automatically adjusts the tileSize to match the new algorithm.
     */
    set algorithm(algorithm: TileCameraGenerator.IterationAlgorithm) {
        if (this._algorithm !== algorithm) {
            this._algorithm = algorithm;
            this._iterationAlgorithmIndices = [];
            this._valid = false;
        }
    }
}

/**
 * The enum that is used to select one of the different the IterationAlgorithms.
 */
export namespace TileCameraGenerator {

    export enum IterationAlgorithm {
        /**
         * ScanLine conditions: none.
         */
        ScanLine = 'scanline',

        /**
         * HilbertCurve conditions: Both numberOfXTiles, numberOfYTiles need to be equal and need to be a power of two.
         * In the case that the condition is not satisfied
         * the next higher number than numberOfTilesX/Y that is power of two is calculated.
         * The Iteration will be calculated with this number and tiles that lay outside the viewport are skipped.
         */
        HilbertCurve = 'hilbertcurve',

        /**
         * ZCurve conditions: Both numberOfXTiles, numberOfYTiles need to be equal and need to be a power of two.
         * In the case that the condition is not satisfied
         * the next higher number than numberOfTilesX/Y that is power of two is calculated.
         * The Iteration will be calculated with this number and tiles that lay outside the viewport are skipped.
         */
        ZCurve = 'zCurve',
    }
}
