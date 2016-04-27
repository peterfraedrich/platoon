#!/usr/bin/node

// CHANGEME //
var slack_webhook = "https://hooks.slack.com/services/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"

var process = require('process'),
	request = require('request')

var argv = process.env

var ts = function () {
    /* 
        returns a timestamp as a string, useful for things
    */
    return Date().toString()
}

var type_slack = function (argv, webhook, callback) {
	/*
		sends the JSON message to the slack webhook specified above
	*/
    try {
        if (argv.newvalue.toUpperCase() == 'OK') {
            color = "#36A64F"
        } else if (argv.newvalue.toUpperCase() == 'ERR') {
            color = "#CC0000"
        } else {
            color = "#AAAAAA"
        }
        msg = '*DOMAIN:* `' + argv.hostname + '.' + argv.clusterid + '.' + argv.region + '`\n' + '*IP:* ' + argv.ip + '\n' + '*SERVICE:* ' + argv.service + '\n' + '*TIME:* ' + ts() 
        var payload = {
            attachments : [
                {
                    fallback : "Service [" + argv.service + "] on host " + argv.hostname + " changed state from " + argv.oldvalue + " to " + argv.newvalue,
                    pretext : "Service state change on *" + argv.hostname.toUpperCase() + "*",
                    title: argv.service.toUpperCase() + ' | ' + argv.newvalue.toUpperCase(),
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
                console.log(err)
                return callback(err)
            }
        })
    }
    catch (e) {
        console.log(e)
        return callback(e)
    }
}

type_slack(argv, slack_webhook, function (err) {
	/*
		call the slack notifier
	*/
	if (err) {
		console.log(err)
		process.exit(0) // even with an err exit with code 0 so parent process continues
	} else {
		process.exit(0)
	}
})