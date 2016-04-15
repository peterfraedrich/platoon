// platoon-looper.js

var ini = require('ini'),
    mongo = require('mongojs'),
    http = require('http'),
    bodyParser = require('body-parser'),
    request = require('request'),
    process = require('process'),
    sleep = require('sleep'),
    fs = require('fs'),
    async = require('async'),
    thread = require('child_process').exec,
    thread_sync = require('child_process').execSync,
    sync = require('sync')

var startup_start = process.hrtime() // start the spool up timer
var gc = ini.parse(fs.readFileSync('platoon.conf', 'utf-8'))

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

var sleeper = function (stime, callback) {
    if ((process.hrtime(stime)[0]) < (gc.platoon.check_interval)) {
        var diff = (gc.platoon.check_interval) - (process.hrtime(stime)[0]) 
        log('Health check loop took ' + (process.hrtime(stime)[1] / 1000000).toFixed(2) + ' ms to run, sleeping for ' + diff.toFixed(2) +  's.')
        sleep.sleep(diff)
        return callback(null)
    }
}

var get_healthcheck = function (host, callback) {
    try {
        options = {
            url : 'http://' + host.ip + ':' + gc.agent.port + '/healthcheck',
            forever : false
        }
        request.get(options, function (err, res, body) {
            return callback(null, body)
        })
    } catch (e) {
        return callback(e)
    }
}

var get_last_checkin = function (svc, callback) {
    var dbase = mongo(gc.db.url + '/' + gc.platoon.region, [gc.platoon.cluster_id])
    dbase.collection(gc.platoon.cluster_id).find({ "ip" : svc.ip}, function (err, data) {
        if (!err) {
            //dbase.close()
            return callback(null, data)
        } else {
            //dbase.close()
            return callback('error fetching ip from DB', null)
        }
    })
}

var notify = function (oldv, newv, host, ip, service, callback) {
    alert = thread('/usr/bin/node ./notify.js --host ' + host + ' --ip ' + ip + ' --old ' + oldv + ' --new ' + newv + ' --service ' + service, function (err, stdout) {
        console.log(stdout)
        return callback(null)
    })
}

var db_update = function (data, callback) {
     var dbase = mongo(gc.db.url + '/' + gc.platoon.region, [gc.platoon.cluster_id])
     dbase.collection(gc.platoon.cluster_id).save({ ip : data.ip }, { upsert : true },  function (err, data) {
        if (err) {
            //db.close()
            return callback(err)
        } else {
            //db.close()
            return callback(null)
        }
     })
}

var inspect_data = function (strdata, callback) {
    try {
        var data = JSON.parse(strdata)
    } catch (e) {
        log(e)
        return callback(e)
    }
    var dbase = mongo(gc.db.url + '/' + gc.platoon.region, [gc.platoon.cluster_id])
    dbase.collection(gc.platoon.cluster_id).find({ ip : data.ip }).toArray(function (err, olddata) {
        if (err) {
            log(err)
            return callback(err)
        } else {
            olddata = olddata[0]
            for (s = 0; s < data.services.length; s++) {
                try {
                    if (data.services[s].status != olddata.services[s].status) {
                        notify(olddata.services[s].status, data.services[s].status, data.hostname, data.ip, data.services[s].name, function (err) {
                            if (err) {
                                log(err)
                            }
                        })
                    }
                } catch (e) {
                    // if old status doesn't exist (ie, new service) go to the next iteration
                    continue
                }
            }
            dbase.collection(gc.platoon.cluster_id).update({ ip : data.ip }, data, { $upsert : true }, function (err) {
                //dbase.close()
                if (err) {
                    log(err)
                    return callback(err)
                } else {
                    return callback(null)
                }
            })
        }
    })   
}

log('Started cluster health check loop in ' + (process.hrtime(startup_start)[1] / 1000000).toFixed(2) + 'ms')
async.forever(
    function (next) {
        load_config()
        var stime = process.hrtime()
        var dbase = mongo(gc.db.url + '/' + gc.platoon.region, [gc.platoon.cluster_id])
        dbase.collection(gc.platoon.cluster_id).find(function (err, data) {
            if (err) {
                //dbase.close()
                log(err)
            } else {
                //dbase.close()
                for (i = 0; i < data.length; i++) {
                    get_healthcheck(data[i], function (err, data) {
                        if (err) {
                            log(err)
                            next()
                        } else {
                            inspect_data(data, function (err) {
                                sleeper (stime, function () {
                                    next()
                                })
                            })
                        }
                    })
                }
            }
        })
    }, function (err) {
        if (err) {
            log(err)
            next()
        }
    }
)
