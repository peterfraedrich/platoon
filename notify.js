// notify.js

var fs = require('fs'),
    request = require('request'),
    process = require('process'),
    ini = require('ini'),
    argv = require('minimist')(process.argv.slice(2))

var startup_start = process.hrtime() // start the spool up timer
var gc = ini.parse(fs.readFileSync('platoon.conf', 'utf-8'))

var ts = function () {
    /* 
        returns a timestamp as a string, useful for things
    */
    return Date().toString()
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

var load_channels = function () {
    try {
        return fs.readdirSync('./notifiers')
    } catch (e) {
        log(e)
        return []
    }
}

var type_slack = function (argv, webhook, callback) {
    try {
        if (argv.new == 'ok') {
            color = "#36A64F"
        } else if (argv.new == 'err') {
            color = "#CC0000"
        } else {
            color = "#AAAAAA"
        }
        msg = '*HOST:* ' + argv.host + '\n' + '*IP:* ' + argv.ip + '\n' + '*SERVICE:* ' + argv.service + '\n' + '*TIME:* ' + ts()
        var payload = {
            attachments : [
                {
                    fallback : "Service [" + argv.service + "] on host " + argv.host + " changed state from " + argv.old + " to " + argv.new,
                    pretext : "Service state change on *" + argv.host.toUpperCase() + "*",
                    title: argv.service.toUpperCase() + ' | ' + argv.new.toUpperCase(),
                    color: color,
                    text: msg,
                    mrkdwn_in : [
                        "text",
                        "pretext"
                    ]
                }
            ]
        }
        var options = {
            headers: {'content-type' : 'application/json'},
            json: payload,
            url: webhook,
            from: JSON.stringify({ "text " : msg}),
            timeout: 2000
        }
        request.post(options, function (err, res, body) {
            if (!err) {
                return callback(null)
            } else {
                log(err)
                return callback(err)
            }
        })
    }
    catch (e) {
        log(e)
        return callback(e)
    }
}

var notify = function (args, filename, callback) {
    var fname = './notifiers/' + filename
    var svc = JSON.parse(fs.readFileSync(fname, 'utf-8'))
    if (svc.type.toLowerCase() == 'slack') {
        type_slack(args, svc.url, function (err) {
            if (err) {
                log(err)
                return callback(err)
            } else {
                return callback(null)
            }
        })
    }
}

var channels = load_channels()
for (c = 0; c < channels.length; c++) {
    notify(argv, channels[c], function (err) {
        if (err) {
            log(err)
        }
    })
}