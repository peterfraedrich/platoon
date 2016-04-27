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
port = 5000
log = platoon.log

[db]
url = mongodb://<db_ip>:27017
port = 27017

[platoon]
region = as_b
cluster_id = dev
check_interval = 5
quorum = 60

[agent]
port = 5001

[misc]
downtime_alerts = false
```

