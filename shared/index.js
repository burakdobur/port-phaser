// Node entry point for the shared domain. Browsers load the same files via <script> tags
// (in this order) and get them on window.PortPhaser.
require('./rules');
require('./room-code');
require('./board');
module.exports = require('./match');
