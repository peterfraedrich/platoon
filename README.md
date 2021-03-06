# Platoon

Platoon is a server/agent model, HTTP-based micro-cluster healthcheck system that allows you to monitor arbitrary `services` via scripts and send notifications to arbitrary `notifiers` via scripts. 

Platoon uses MongoDB as a shared backend for all of your micro-clusters, which provides information to the `Platoon UI` server (under development).

### What is a micro-cluster?

For the purposes of this document, a micro-cluster is a collection of same-task hosts (hosts that perform the same function). An example of a micro-cluster would be a group of ten servers hosting copies of a single Java/Tomcat application.


## Platoon Server

The Platoon server is the brain of the micro-cluster. The server initiates the health check requests to the Platoon agents, inspects the data, and reports its findings to the database. Because everything is stored in the database, the server itself is stateless and disposible. If a server were to go down or be deleted it would only take replacing it (with the correct config) and your micro-cluster would resume its state. 

#### Configuration

The configuration for the Platoon server is found in `platoon.conf` of the root application folder and looks something like this:
```ini
[global]                        
port = 5000                     # the port the Platoon server API will listen on
log = platoon.log               # the Platoon logfile location. can be a path (eg, /var/log/platoon.log)
script_types = py,sh,pl,js      # comma-separated list of allowed script extensions for notifier scripts

[db]
url = mongodb://<db_ip>:27017   # the DB URL
port = 27017                    # the DB port

[platoon]
region = as_b                   # region (top level) identifier, must be unique to the database
cluster_id = dev                # cluster identifier, must be unique to that region
check_interval = 5              # how often the server polls the agents, in seconds.
quorum = 60                     # the % of error-free hosts for the cluster to be healthy

[agent]
port = 5001                     # the port the agents in the cluster are listening on

[misc]
downtime_alerts = false         # send downtime alerts for hosts that don't respond
```

#### Notifiers

When the Platoon server detects that the state of a host/service has changed it will call the `notify.js` app in a new thread. The notify thread will run the scripts in the `./notifiers/` folder that match the accepted `script_types` in `platoon.conf`. 

The goal of the notifier scripts is to set and send custom notifications to your desired endpoints. This allows for the greatest flexibility in designing how you want to get notifications. 

When designing your notifier script it is important to know what information is being passed to it. `notify.js` passes the following information to the script as environment variables:

```ini
ip              # ip address of the host that triggered the notification
hostname        # hostname of the host
service         # the name of the service that triggered the notification
oldvalue        # the previous service state
newvalue        # the new service state
region          # the region the host belongs to
clusterid       # the name of the cluster the host belongs to
```

Any output from the script, either to `stdout` or `stderr` will be logged in the server logs.

Platoon server has provided a `Slack` notifier in the `./notifiers/` folder. Replace the `slack_webhook` value with the appropriate webhook URL.

**IMPORTANT** Unless you wish to spawn unnecessary threads ensure that your scripts terminate when they are done! The thread will wait for the script to exit before closing, so if your script never exits the thread will stay open!

#### REST API

The Platoon server has a build-in RESTful API for adding and removing cluster members programmatically and getting the overall cluster health.

```shell
http://<server>:<port>/add?ip=[member_ip_address]
# adds a member to the cluster, returns HTTP status code

http://<server>:<port>/remove?ip=p[member_ip_address]
# removes a member from the cluster, returns HTTP status code

http://<server>:<port>/status
# gets the cluster status, returns JSON object
```

Example result of `/status` :
```python
{
  "members": [                         # list of members
    {
      "_id": 12345",
      "ip": "192.168.1.1",              # member IP
      "hostname": "cluster-member4",    # member hostname
      "services": [                     # member's services
        {
          "name": "test.sh",            # service name
          "status": "err",              # service status (ERR | OK)
          "ms": "8.66"                  # elapsed time for service check
        }
      ],
      "ms": "9.32"                      # elapsed time for all service checks
    }
  ],
  "down": [                             # list of hosts that have 1 service reporting err
    "cluster-member1"
  ],
  "pct": 0,                             # percent of host that are 'up'
  "quorum": false,                      # quorum boolean
  "quorum_target": 60,                  # quorum target percentage
  "tot_members": 1,                     # total members in the cluster
  "down_members": 1,                    # number of memebrs that are 'down'
  "svc_ok": 0,                          # number services that are 'ok'
  "svc_err": 1,                         # number of services that are 'err'
  "region": "as_b",                     # cluster region
  "cluster_id": "dev"                   # cluster id
}
```

## FAQ

* **What is "quorum"?**
    
    "Quorum" is the measure of the overall cluster health. For the quorum to be 'true', the percent of the total members that report no errors has to be greater than the quorum target. EX. if a cluster has 4 members with a target of 70%, and one member is reporting errors, then the cluster has a valid quorum (quorum = true) because 75% of the members are OK.

* **What counts as a member reporting as error?**

    For a member to be in error state it must have at least one service check fail. In the future 'non-critical' service checks will be implemented so that the member will not fail out if a non-critical service check fails, but for now all services should be considered critical.