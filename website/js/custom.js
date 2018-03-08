
var canvas;
var context;
var renderer;

$(document).ready(function () {
    new Clipboard('.btn-clipboard');

    // initialize test canvas
    canvas = new gloperate.Canvas('test-canvas');
    context = canvas.context;
    canvas.controller.multiFrameNumber = 1024;
    renderer = new gloperate.debug.TestRenderer();
    canvas.renderer = renderer;
});
