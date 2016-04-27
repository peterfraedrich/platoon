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