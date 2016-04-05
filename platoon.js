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
    cmd = require('child_process').exec,
    thread = require('child_process').spawn,
    mongo = require('mongojs'),
    process = require('process'),
    sleep = require('sleep')

////////////////////////////////////////////////////////// SETUP
var startup_start = process.hrtime() // start the spool up timer
var app = express();
var gc = ini.parse(fs.readFileSync('platoon.conf', 'utf-8'))
dbase = mongo(gc.db.url + '/' + gc.platoon.region, [gc.platoon.cluster_id])

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
var ts = function () {
    /* 
        returns a timestamp as a string, useful for things
    */
    return Date().toString()
}

var load_config = function () {
    /*
        callable function to load the config file into variable 'gc'
    */
    gc = ini.parse(fs.readFileSync('platoon.conf', 'utf-8'))
}

var log = function (msg) {
    /*
        logging function; outputs a timestamp and logging message to the log file
        defined in the global config. creates a new log if none exist. also writes
        to stdout for use with journald.
    */
    var timestamp = ts()
    // exists is dep'd in node 0.12, use fs.access in 0.12 !
    if (fs.existsSync(gc.global.log) == true) {
        fs.appendFileSync(gc.global.log, timestamp + ' :: ' + msg + '\n')
    } else {
        fs.writeFileSync(gc.global.log, timestamp + ' :: ' + msg + '\n')
    }
    console.log(timestamp + ' :: ' + msg)
    return
}

var db = function () {
    this.checkIn = function (data, gc, callback) {
        dbase.collection(gc.platoon.cluster_id).update({ ip : data.ip}, data, { upsert : true }, function (err) {
            if (err) {
                db.close()
                log(err)
                return callback(err)
            } else {
                db.close()
                return callback(null)
            }
        })
    }
    this.findAll = function (gc, callback) {
        dbase.collection(gc.platoon.cluster_id).find(function (err, data) {
            if (err) {
                db.close()
                log(err) 
                return callback(err)
            } else {
                db.close()
                return callback(null, data)
            }
        })
    }
}

////////////////////////////////////////////////////////// PUBLIC API

app.get('/status', function (req, res) {
    var status = {}
    status.members = []
    var ok = 0
    var err = 0
    var down = []
    dbase.collection(gc.platoon.cluster_id).find(function (err, data) {
        if (err) {
            log(err)
            dbase.close()
            res.sendStatus(500)
        } else {
            console.log(data)
            if (data.length < 1) {
                res.send('cluster has no members. nothing to do.')
            } else {
                for (i = 0; i < data.length; i++) {
                    status.members.push(data[i])
                    var downsvc = 0
                    for (s = 0; s < data[i].services.length; s++) {
                        if (data[i].services[s].status == 'ok') {
                            ok++
                        } else {
                            err++
                            downsvc++
                        }
                    }
                    if (downsvc > 0) {
                        down.push(data[i].hostname)
                    }
                }
                status.down = down
                status.pct = (100 - ((down.length / data.length ) * 100)).toFixed(2) + '%'
                if (down.length == data.length) {
                    status.quorum = false
                }
                else if (down.length < data.length && (down.length / data.length) < gc.platoon.quorum) {
                    status.quorum = false
                } else {
                    status.quorum = true
                }
                status.tot_members = data.length
                status.down_members = down.length
                status.svc_ok = ok
                status.svc_err = err
                res.send(status)
            }
        }
    })
})

////////////////////////////////////////////////////////// SAWN PROCESSES
// healthcheck loop
var hctime = process.hrtime()
var healthcheck_loop = thread('/usr/bin/forever', ['healthcheck.js', '--minUptime=0ms'])
healthcheck_loop.stdout.on('data', function (stdoutlog) {
    console.log(stdoutlog.toString())
})
healthcheck_loop.stderr.on('data', function (stderrlog) {
    console.log(stderrlog.toString())
})
log('Started healthcheck service in ' + (process.hrtime(hctime)[1] / 1000000).toFixed(2) + 'ms')

// heartbeat loop
// var hbtime = process.hrtime()
// var heartbeat_loop = thread('/usr/bin/forever', ['heartbeat.js', '--minUptime=0ms'])
// heartbeat_loop.stdout.on('data', function (stdoutlog) {
//     console.log(stdoutlog.toString().split('\n')[0])
// })
// heartbeat_loop.stderr.on('data', function (stderrlog) {
//     console.log(stderrlog.toString().split('\n')[0])
// })
// log('Started heartbeat service in ' + (process.hrtime(hbtime)[1] / 1000000).toFixed(2) + 'ms')

////////////////////////////////////////////////////////// SERVER
app.listen(gc.global.port, function (err) {
    if (err) {
        log(err)
    }
    log('Platoon leader listening on port ' + gc.global.port)
    log('Platoon spooled up in ' + (process.hrtime(startup_start)[1] / 1000000).toFixed(2) + 'ms')
})