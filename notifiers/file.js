#!/usr/bin/node

var fs = require('fs'),
	process = require('process')

if (fs.existsSync('/opt/notify.txt') == true) {
	fs.appendFileSync('/opt/notify.txt','notify\n')
	process.exit(0)
} else {
	fs.writeFileSync('/opt/notify.txt', 'notify\n')
	process.exit(0)
}