const tools = require("./helper");
const ipaddr = require("ipaddr.js");
const randomstring = require("randomstring");
const crypto = require("crypto");
const debug = require("debug")("nodetunes:rtspmethods");
const OutputStream = require("./streams/output");
const AlacDecoderStream = require("alac2pcm");
const PcmDecoderStream = require("./streams/pcm");

const decoderStreams = {
  "96 AppleLossless": AlacDecoderStream,
  "96 L16/44100/2": PcmDecoderStream
};

module.exports = function rtspMethods(rtspServ) {
  const rtspServer = rtspServ;
  let nonce = "";

  const options = function options(req, res) {
    res.set(
      "Public",
      "ANNOUNCE, SETUP, RECORD, PAUSE, FLUSH, TEARDOWN, OPTIONS, GET_PARAMETER, SET_PARAMETER, POST, GET"
    );

    if (req.getHeader("Apple-Challenge")) {
      // challenge response consists of challenge + ip address + mac address + padding to 32 bytes,
      // encrypted with the ApEx private key (private encryption mode w/ PKCS1 padding)

      const challengeBuf = Buffer.from(
        req.getHeader("Apple-Challenge"),
        "base64"
      );

      let ipAddrRepr = ipaddr.parse(rtspServer.socket.address().address);
      if (ipAddrRepr.kind() === "ipv6" && ipAddrRepr.isIPv4MappedAddress()) {
        ipAddrRepr = ipAddrRepr.toIPv4Address();
      }

      const ipAddr = Buffer.from(ipAddrRepr.toByteArray());

      const macAddr = Buffer.from(
        rtspServer.macAddress.replace(/:/g, ""),
        "hex"
      );
      res.set(
        "Apple-Response",
        tools.generateAppleResponse(challengeBuf, ipAddr, macAddr)
      );
    }

    res.send();
  };

  const announceParse = function announceParse(req, res) {
    const sdp = tools.parseSdp(req.content.toString());

    for (let i = 0; i < sdp.a.length; i += 1) {
      const spIndex = sdp.a[i].indexOf(":");
      const aKey = sdp.a[i].substring(0, spIndex);
      const aValue = sdp.a[i].substring(spIndex + 1);

      if (aKey === "rsaaeskey") {
        rtspServer.audioAesKey = tools.rsaPrivateKey.decrypt(
          Buffer.from(aValue, "base64").toString("binary"),
          "RSA-OAEP"
        );
      } else if (aKey === "aesiv") {
        rtspServer.audioAesIv = Buffer.from(aValue, "base64");
      } else if (aKey === "rtpmap") {
        rtspServer.audioCodec = aValue;

        if (
          aValue.indexOf("L16") === -1 &&
          aValue.indexOf("AppleLossless") === -1
        ) {
          // PCM: L16/(...)
          // ALAC: 96 AppleLossless
          rtspServer.external.emit("error", {
            code: 415,
            message: `Codec not supported (${aValue})`
          });
          res.status(415).send();
        }
      } else if (aKey === "fmtp") {
        rtspServer.audioOptions = aValue.split(" ");
      }
    }

    if (sdp.i) {
      rtspServer.metadata.clientName = sdp.i;
      debug("client name reported (%s)", rtspServer.metadata.clientName);
      rtspServer.external.emit("clientNameChange", sdp.i);
    }

    if (sdp.c) {
      if (sdp.c.indexOf("IP6") !== -1) {
        debug("ipv6 usage detected");
        rtspServer.ipv6 = true;
      }
    }

    const decoderOptions = tools.getDecoderOptions(rtspServer.audioOptions);
    const decoderStream = new decoderStreams[rtspServer.audioCodec](
      decoderOptions
    );

    rtspServer.clientConnected = res.socket;
    rtspServer.outputStream = new OutputStream();
    debug("client considered connected");
    rtspServer.outputStream.setDecoder(decoderStream);
    rtspServer.external.emit("clientConnected", rtspServer.outputStream);

    res.send();
  };

  const announce = function announce(req, res) {
    debug(req.content.toString());

    if (rtspServer.clientConnected) {
      debug("already streaming; rejecting new client");
      res.status(453).send();
    } else if (rtspServer.options.password && !req.getHeader("Authorization")) {
      const md5sum = crypto.createHash("md5");
      md5sum.update = randomstring.generate();
      res.status(401);
      nonce = md5sum.digest("hex").toString("hex");

      res.set("WWW-Authenticate", `Digest realm="roap", nonce="${nonce}"`);
      res.send();
    } else if (rtspServer.options.password && req.getHeader("Authorization")) {
      const auth = req.getHeader("Authorization");

      const params = auth.split(/, /g);
      const map = {};
      params.forEach(param => {
        const pair = param.replace(/["]/g, "").split("=");
        map[pair[0]] = pair[1]; // eslint-disable-line prefer-destructuring
      });

      const expectedResponse = tools.generateRfc2617Response(
        "iTunes",
        "roap",
        rtspServer.options.password,
        nonce,
        map.uri,
        "ANNOUNCE"
      );
      const receivedResponse = map.response;

      if (expectedResponse === receivedResponse) {
        announceParse(req, res);
      } else {
        res.send(401);
      }
    } else {
      announceParse(req, res);
    }
  };

  const setup = function setup(req, res) {
    rtspServer.ports = [];

    const getRandomPort = function getRandomPort() {
      const min = 5000;
      const max = 9999;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    rtspServer.ports = [getRandomPort(), getRandomPort(), getRandomPort()];

    if (rtspServer.ports.length >= 3) {
      rtspServer.rtp.start();

      debug(
        "setting udp ports (audio: %s, control: %s, timing: %s)",
        rtspServer.ports[0],
        rtspServer.ports[1],
        rtspServer.ports[2]
      );

      res.set(
        "Transport",
        `RTP/AVP/UDP;unicast;mode=record;server_port=${
          rtspServer.ports[0]
        };control_port=${rtspServer.ports[1]};timing_port=${
          rtspServer.ports[2]
        }`
      );
      res.set("Session", "1");
      res.set("Audio-Jack-Status", "connected");
      res.send();
    }
  };

  const record = function record(req, res) {
    if (!req.getHeader("RTP-Info")) {
      // jscs:disable
      // it seems like iOS airplay does something else
    } else {
      const rtpInfo = req.getHeader("RTP-Info").split(";");
      const initSeq = rtpInfo[0].split("=")[1];
      const initRtpTime = rtpInfo[1].split("=")[1];
      if (!initSeq || !initRtpTime) {
        res.send(400);
      } else {
        res.set("Audio-Latency", "0"); // FIXME
      }
    }

    res.send();
  };

  const flush = function flush(req, res) {
    res.set("RTP-Info", "rtptime=1147914212"); // FIXME
    res.send();
  };

  const teardown = function teardown(req, res) {
    rtspServer.rtp.stop();
    res.send();
  };

  const setParameter = function setParameter(req, res) {
    if (req.getHeader("Content-Type") === "application/x-dmap-tagged") {
      // metadata dmap/daap format
      const dmapData = tools.parseDmap(req.content);
      rtspServer.metadata = dmapData;
      rtspServer.external.emit("metadataChange", rtspServer.metadata);
      debug("received metadata (%s)", JSON.stringify(rtspServer.metadata));
    } else if (req.getHeader("Content-Type") === "image/jpeg") {
      rtspServer.metadata.artwork = req.content;
      rtspServer.external.emit("artworkChange", req.content);
      debug(
        "received artwork (length: %s)",
        rtspServer.metadata.artwork.length
      );
    } else if (req.getHeader("Content-Type") === "text/parameters") {
      const data = req.content.toString().split(": ");
      rtspServer.metadata = rtspServer.metadata || {};

      debug("received text metadata (%s: %s)", data[0], data[1].trim());

      if (data[0] === "volume") {
        rtspServer.metadata.volume = parseFloat(data[1]);
        rtspServer.external.emit("volumeChange", rtspServer.metadata.volume);
      } else if (data[0] === "progress") {
        rtspServer.metadata.progress = data[1]; // eslint-disable-line prefer-destructuring
        rtspServer.external.emit(
          "progressChange",
          rtspServer.metadata.progress
        );
      }
    } else if (req.getHeader("Content-Type") === "image/none") {
      return;
    } else {
      debug(
        "uncaptured SET_PARAMETER method: %s",
        req.content.toString().trim()
      );
    }

    res.send();
  };

  const getParameter = function getParameter(req, res) {
    debug("uncaptured GET_PARAMETER method: %s", req.content.toString().trim());
    res.send();
  };

  return {
    OPTIONS: options,
    ANNOUNCE: announce,
    SETUP: setup,
    RECORD: record,
    FLUSH: flush,
    TEARDOWN: teardown,
    SET_PARAMETER: setParameter, // metadata, volume control
    GET_PARAMETER: getParameter // asked for by iOS?
  };
};
