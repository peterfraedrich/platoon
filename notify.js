// notify.js

var fs = require('fs'),
    request = require('request'),
    process = require('process'),
    ini = require('ini'),
    argv = require('minimist')(process.argv.slice(2)),
    thread = require('child_process').spawn,
    async = require('async')

var stime = process.hrtime() // start the spool up timer
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
    /*
        gets the list of notifier scripts from the ./notifiers folder and filters out
        files that are not script / known extensions. currently supports js, python, 
        shell, and perl.
    */
    var scripts = []
    try {
        var files = fs.readdirSync('./notifiers')
        for (i = 0; i < files.length; i++) {
            // allow only files with script / known extensions; this should cover most cases
            var file = files[i].split('.')[1]
            if (gc.global.script_types.indexOf(file) != -1) {
                scripts.push(files[i])
            }
        }
        return scripts
    } catch (e) {
        log(e)
        return []
    }
}

var channels = load_channels() // get our notification channels from the ./notifiers directory

async.each(channels, function (c, callback) {
    /*
        Spawns a child_process.spawn thread for each notifier script
        and passes informaton as env vars, accesible through
        process.env.VARIABLE_NAME
    */
    var opts = { 
        ip : argv.ip, 
        hostname : argv.host, 
        oldvalue : argv.old, 
        newvalue : argv.new, 
        service : argv.service, 
        clusterid : gc.platoon.cluster_id, 
        region : gc.platoon.region
    }
    var t = thread('./notifiers/' + c, [], {env : opts} ) // spawn thread
    t.stderr.on('data', function (data) {
        log(data.toString()) // log errors
    })  
    t.stdout.on('data', function (data) {
        log(data.toString()) // log outputs
    })
    t.on('close', function(code) {
        return callback() // return when process exits
    })

}, function () {
    // post notifier stuff.
    log('Completed notifications in ' + (process.hrtime(stime)[1] / 1000000).toFixed(2) + 'ms.')
    process.exit(0) // exit
})

// EOF