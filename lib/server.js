const { EventEmitter } = require("events");
const mdns = require("mdns");
const net = require("net");
const portastic = require("portastic");
const randomMac = require("random-mac");
const RtspServer = require("./rtsp");
const util = require("util");
let debug = require("debug")("nodetunes:server");

function NodeTunes(opts) {
  let options = opts;
  options = options || {};
  this.options = options;

  options.serverName = options.serverName || "NodeTunes";
  options.macAddress =
    options.macAddress ||
    randomMac()
      .toUpperCase()
      .replace(/:/g, "");
  options.recordDumps = options.recordDumps || false;
  options.recordMetrics = options.recordMetrics || false;
  options.controlTimeout =
    options.controlTimeout !== undefined && options.controlTimeout !== null
      ? options.controlTimeout
      : 5;

  if (options.verbose) {
    require("debug").enable("nodetunes:*");
    debug = require("debug")("nodetunes:server"); // HACK: need to reload debug here (https://github.com/visionmedia/debug/issues/150)
  }

  this.txtSetup = {
    txtvers: "1", // txt record version?
    ch: "2", // # channels
    cn: "0,1", // codec; 0=pcm, 1=alac, 2=aac, 3=aac elc; fwiw Sonos supports aac; pcm required for iPad+Spotify; OS X works with pcm
    et: "0,1", // encryption; 0=none, 1=rsa, 3=fairplay, 4=mfisap, 5=fairplay2.5; need rsa for os x
    md: "0", // metadata; 0=text, 1=artwork, 2=progress
    pw: options.password ? "true" : "false", // password enabled
    sr: "44100", // sampling rate (e.g. 44.1KHz)
    ss: "16", // sample size (e.g. 16 bit?)
    tp: "TCP,UDP", // transport protocol
    vs: "105.1", // server version?
    am: "AirPort4,107", // device model
    ek: "1", // ? from ApEx; setting to 1 enables iTunes; seems to use ALAC regardless of 'cn' setting
    sv: "false", // ? from ApEx
    da: "true", // ? from ApEx
    vn: "65537", // ? from ApEx; maybe rsa key modulus? happens to be the same value
    fv: "76400.10", // ? from ApEx; maybe AirPort software version (7.6.4)
    sf: "0x5" // ? from ApEx
  };

  this.netServer = null;
  this.rtspServer = new RtspServer(this.options, this);
}

util.inherits(NodeTunes, EventEmitter);

NodeTunes.prototype.start = function startNodeTunes(callback) {
  debug("starting nodetunes server (%s)", this.options.serverName);

  portastic
    .find({
      min: 5000,
      max: 5050,
      retrieve: 1
    })
    .then(ports => {
      const port = ports[0];
      this.netServer = net
        .createServer(this.rtspServer.connectHandler.bind(this.rtspServer))
        .listen(port, () => {
          const ad = mdns.createAdvertisement(mdns.tcp("raop"), port, {
            name: `${this.options.macAddress}@${this.options.serverName}`,
            txtRecord: this.txtSetup
          });
          if (callback) {
            callback(null, {
              port,
              macAddress: this.options.macAddress
            });
          }

          debug("broadcasting mdns advertisement (for port %s)", port);
        });
    });
};

NodeTunes.prototype.stop = function stopNodeTunes() {
  debug("stopping nodetunes server");
  this.netServer.close();
};

module.exports = NodeTunes;
