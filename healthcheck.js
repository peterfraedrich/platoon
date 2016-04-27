// platoon-looper.js

var ini = require('ini'),
    mongo = require('mongodb').MongoClient,
    http = require('http'),
    bodyParser = require('body-parser'),
    request = require('sync-request'),
    process = require('process'),
    sleep = require('sleep'),
    fs = require('fs'),
    async = require('async'),
    thread = require('child_process').exec,
    thread_sync = require('child_process').execSync,
    sync = require('sync')

// load configs and start stuff
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
    /*
        sleeps for difference between processing time and timeout in config
        so that time between checks is consistent
    */
    if ((process.hrtime(stime)[0]) < (gc.platoon.check_interval)) {
        var diff = (gc.platoon.check_interval) - (process.hrtime(stime)[0]) 
        log('Health check loop took ' + (process.hrtime(stime)[1] / 1000000).toFixed(2) + ' ms to run, sleeping for ' + diff.toFixed(2) +  's.')
        sleep.sleep(diff)
        return callback(null)
    }
}

var get_healthcheck = function (host, callback) {
    /*
        polls healthcheck data from the cluster members, sync
    */
    try {
        options = {
            url : 'http://' + host.ip + ':' + gc.agent.port + '/healthcheck',
            forever : false
        }
        var res = request('GET', options.url)
        return callback(null, res.body.toString())
    } catch (e) {
        return callback(e)
    }
}

var get_last_checkin = function (svc, callback) {
    /*
        gets the last checkin data from the db to compare
        to the current checkin data
    */
    mongo.connect(gc.db.url + '/' + gc.platoon.region, function (err, dbase) {
        dbase.collection(gc.platoon.cluster_id).find({ "ip" : svc.ip}).toArray(function (err, data) {
            if (!err) {
                dbase.close()
                return callback(null, data)
            } else {
                dbase.close()
                return callback('error fetching ip from DB', null)
            }
        })
    })
    
}

var notify = function (oldv, newv, host, ip, service, callback) {
    /*
        starts the 'notify.js' process in a new thread and passes
        the following info:
        hostname
        IP
        last checkin (oldv)
        current checkin (newv)
        service name (service)
    */
    var t = thread('/usr/bin/node ./notify.js --host ' + host + ' --ip ' + ip + ' --old ' + oldv + ' --new ' + newv + ' --service ' + service)
    t.stdout.on('data', function (data) {
        log(data.toString())
    })
    t.stderr.on('data', function (data) {
        log(data.toString())
    })
    t.on('close', function (code) {
        return callback(null)
    })
}

var db_update = function (data, callback) {
    /*
        updates the DB with the newest checkin data
    */
    mongo.connect(gc.db.url + '/' + gc.platoon.region, function (err, dbase) {
        dbase.collection(gc.platoon.cluster_id).save({ ip : data.ip }, { upsert : true },  function (err, data) {
            if (err) {
                dbase.close()
                return callback(err)
            } else {
                dbase.close()
                return callback(null)
            }
         })
     })
     
}

var inspect_data = function (strdata, callback) {
    /*
        compares old vs new data and sends notification of any differences
    */
    try {
        if (strdata == undefined) {
            return callback(null)
        } else {
            //var data = strdata
            var data = JSON.parse(strdata)
        }
    } catch (e) {
        log(e)
        return callback(e)
    }
    mongo.connect(gc.db.url + '/' + gc.platoon.region, function (err, dbase) {
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
                        log(e)
                        // if old status doesn't exist (ie, new service) go to the next iteration
                        continue
                    }
                }
                dbase.collection(gc.platoon.cluster_id).update({ ip : data.ip }, data, { $upsert : true }, function (err) {
                    dbase.close()
                    if (err) {
                        log(err)
                        return callback(err)
                    } else {
                        return callback(null)
                    }
                })
            }
        })
    })
       
}

log('Started cluster health check loop in ' + (process.hrtime(startup_start)[1] / 1000000).toFixed(2) + 'ms')

mongo.connect(gc.db.url + '/' + gc.platoon.region, function (err, dbase) {
    /*
        this is the main loop.
        -> load config from file
        -> set the loop timestamp
        -> get all hosts in the cluster
        -> iterate over the hosts and run get_healthcheck()
            -> if host is down and config allows it, send down notification
        -> sleep for n seconds
        -> repeat
    */
    async.forever(
        function (next) {
            load_config()
            var stime = process.hrtime()
            dbase.collection(gc.platoon.cluster_id).find().toArray(function (err, data) {
                if (err) {
                    log(err)
                } else {
                    async.each(data, function (d, enext) {
                        get_healthcheck(d, function (err, hdata) {
                            if (err) {
                                // send notifications if host is down & config allows it
                                if (err == 'Error: connect ECONNREFUSED' && gc.misc.downtime_alerts == true) {
                                    notify('UNKNOWN', 'ERR', d.hostname, d.ip, 'HOST_IS_DOWN', function (e) {
                                        log(err + ' [ ' + d.ip + ', ' + d.hostname + ' ] ')
                                        if (e) {
                                            log(e)
                                        }
                                        enext()
                                    })
                                } else {
                                    log(err + ' [ ' + d.ip + ', ' + d.hostname + ' ] ')
                                    enext()
                                }
                            } else {
                                inspect_data(hdata, function (err) {
                                    if (err) {
                                        log(err + ' [ ' + hdata + ' ] ')
                                    } else {
                                        enext()
                                    }
                                })
                            }
                        })
                    }, function (err) {
                        if (err) {
                            log(err)
                        } else {
                            sleeper(stime, function (err) {
                                next()
                            })
                        }

                    })
                }
            })
        }, function (err) {
            if (err) {
                log(err)
                next()
            }
        }
    )
})
    


