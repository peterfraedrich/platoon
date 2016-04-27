// platoon.js

/*
    TODO:
    

*/


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
    os = require('os'),
    methodOverride = require('method-override'),
    request = require('request'),
    thread = require('child_process').spawn,
    mongo = require('mongodb').MongoClient,
    process = require('process'),
    sleep = require('sleep'),
    cmd = require('exec-sync')

////////////////////////////////////////////////////////// SETUP
var startup_start = process.hrtime() // start the spool up timer
var app = express();
var gc = ini.parse(fs.readFileSync('platoon.conf', 'utf-8'))
//dbase = mongo.connect(gc.db.url + '/' + gc.platoon.region)
//cluster_db = mongo.connect(gc.db.url + '/cluster')

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

var startup = function (callback) {
    /*
        on startup, checks in with the DB and makes sure it exists, if not, it puts itself there.
        this is for the UI so it knows where all the cluster managers are.
    */
    var host_data = {}
    // get IP
    host_data.ip = get_ip()
    host_data.hostname = cmd('hostname')
    host_data.port = gc.global.port
    host_data.region = gc.platoon.region
    host_data.cluster_id = gc.platoon.cluster_id
    mongo.connect(gc.db.url + '/cluster', function (err, cluster_db) {
        cluster_db.collection('servers').update({ip: host_data.ip}, host_data, {upsert : true}, function (err) {
            if (err) {
                cluster_db.close()
                return callback(err)
            } else {
                cluster_db.close()
                return callback(null)
            }
        })
    }) 
}

var get_hostname = function () {
    cmd('hostname', function (err, stdout) {
        return stdout.split('\n')[0]
    })
}

var get_ip = function () {
    var ifaces = os.networkInterfaces()
    for (i = 0; i < Object.keys(ifaces).length; i++) {
        if (ifaces[Object.keys(ifaces)[i]][0].internal != true && ifaces[Object.keys(ifaces)[i]][0].family == 'IPv4') {
            return ifaces[Object.keys(ifaces)[i]][0].address
        }
    }
}

var get_status = function (callback) {
    var status = {}
    status.members = []
    var ok = 0
    var err = 0
    var down = []
    mongo.connect(gc.db.url + '/' + gc.platoon.region, function (err, dbase) {
        dbase.collection(gc.platoon.cluster_id).find().toArray(function (err, data) {
            dbase.close()
            if (err) {
                log(err)
                dbase.close()
                return callback(err)
            } else {
                dbase.close()
                if (data.length < 1) {
                    return callback(null, '{}')
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
                    status.pct = (100 - ((down.length / data.length ) * 100))
                    if (down.length == data.length) {
                        status.quorum = false
                    }
                    else if (down.length < data.length && (100 - (down.length / data.length) * 100) <= gc.platoon.quorum) {
                        status.quorum = false
                    } else {
                        status.quorum = true
                    }
                    status.quorum_target = Number(gc.platoon.quorum)
                    status.tot_members = data.length
                    status.down_members = down.length
                    status.svc_ok = ok
                    status.svc_err = err
                    status.region = gc.platoon.region
                    status.cluster_id = gc.platoon.cluster_id
                    return callback(null, status)
                }
            }
        })
    })
}

var db = function () {
    this.checkIn = function (data, gc, callback) {
        mongo.connect(gc.db.url + '/' + gc.platoon.region, function (err, dbase) {
            dbase.collection(gc.platoon.cluster_id).update({ ip : data.ip}, data, { upsert : true }, function (err) {
                if (err) {
                    dbase.close()
                    log(err)
                    return callback(err)
                } else {
                    dbase.close()
                    return callback(null)
                }
            })
        })
    }
    this.findAll = function (gc, callback) {
        mongo.connect(gc.db.url + '/' + gc.platoon.region, function (err, dbase) {
            dbase.collection(gc.platoon.cluster_id).find().toArray(function (err, data) {
                if (err) {
                    dbase.close()
                    log(err) 
                    return callback(err)
                } else {
                    dbase.close()
                    return callback(null, data)
                }
            })
        })
    }
}

////////////////////////////////////////////////////////// PUBLIC API

app.get('/status', function (req, res) {
    get_status(function (err, cluster_status) {
        if (err) {
            console.log(err)
            res.send(err)
        } else {
            console.log(cluster_status)
            res.send(cluster_status)
        }  
    })
})

app.post('/add', function (req, res) {
    if (req.query.ip == undefined) {
        res.sendStatus(400)
    } else {
        var data = {
            ip: req.query.ip
        }
        mongo.connect(gc.db.url + '/' + gc.platoon.region, function (err, dbase) {
            dbase.collection(gc.platoon.cluster_id).update({ ip : data.ip}, data, { upsert : true }, function (err) {
                if (err) {
                    dbase.close()
                    log(err)
                    res.sendStatus(500)
                } else {
                    dbase.close()
                    res.sendStatus(200)
                }
            })
        })
    }
})

app.post('/remove', function (req, res) {
    if (req.query.ip == undefined) {
        res.sendStatus(400)
    } else {
        var data = {
            ip: req.query.ip
        }
        mongo.connect(gc.db.url + '/' + gc.platoon.region, function (err, dbase) {
            dbase.collection(gc.platoon.cluster_id).remove({ ip : data.ip }, function (err) {
                if (err) {
                    dbase.close()
                    log(err)
                    res.sendstatus(500)
                } else {
                    dbase.close()
                    res.sendStatus(200)
                }
            })
        })
    }
})

////////////////////////////////////////////////////////// SPAWN PROCESSES
// healthcheck loop
var hctime = process.hrtime()
var healthcheck_loop = thread('/usr/bin/nodemon', ['healthcheck.js', '--minUptime=0ms'])
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
    startup(function (err) {
        if (err) {
            log(err)
        }
            log('Platoon leader listening on port ' + gc.global.port)
            log('Platoon spooled up in ' + (process.hrtime(startup_start)[1] / 1000000).toFixed(2) + 'ms')
    })
})