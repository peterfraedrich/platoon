// platoon.js

////////////////////////////////////////////////////////// DEPS
var application_root = __dirname,
    express = require('express'),
    http = require('http'),
    sys = require('sys'),
    ini = require('ini'),
    errorhandler = require('errorhandler'),
    bodyParser = require('body-parser'),
    path = require('path'),
    fs = require('fs'),
    methodOverride = require('method-override'),
    request = require('request'),
    cmd = require('child_process').exec

////////////////////////////////////////////////////////// SETUP
var app = express();
var gc = ini.parse(fs.readFileSync('platoon.conf', 'utf-8'))

////////////////////////////////////////////////////////// ALLOW XSS / CORS
var allowCrossDomain = function(req, res, next) {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
      res.header('Access-Control-Allow-Methods', '*');
      res.header('Access-Control-Allow-Headers', '*');
      res.header('Access-Control-Allow-Headers', 'X-Requested-With, Accept, Origin, Referer, User-Agent, Content-Type, Authorization');

      // intercept OPTIONS method
      if (req.method === 'OPTIONS') {
        res.send(200);
      }
      else {
        next();
      }
    };

    app.use(allowCrossDomain);   // make sure this is is called before the router
    app.use(bodyParser.urlencoded({extended : true}));
    app.use(bodyParser.json());
    app.use(methodOverride());
    app.use(errorhandler());
    app.use(express.static(path.join(application_root, "public")));

////////////////////////////////////////////////////////// PRIVATE LOGIC


////////////////////////////////////////////////////////// PUBLIC API


////////////////////////////////////////////////////////// SERVER
app.listen(gc.global.api_port, function () {
    console.log('Healthcheck service listening on port ' + gc.global.port);
});