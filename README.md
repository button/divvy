# Divvy

Divvy is a quota / rate limiter service, implemented in NodeJS and backed by Redis. Divvy acts as a thin policy and configuration layer between your services and Redis. Using divvy, you can decouple rate limiting policy from the services which rely on it.

**Table of Contents**

1. [Features](#features)
2. [Requirements](#requirements)
3. [Getting Started](#getting-started)
4. [Configuration](#configuration)
5. [Protocol](#protocol)
6. [Server Options](#server-options)
7. [Statistics](#statistics)
8. [Client Libraries](#client-libraries)
9. [License and Copyright](#license-and-copyright)

## Features

* **Window-based rate limiting**: Divvy keeps track of resource consumption using a per-counter time window. The window starts when a hit arrives, and resets according to a timeout you configure (for example, "10 requests per minute").
* **Count anything**: Divvy doesn't care what you are counting, whether it is HTTP requests or some other type of counter. You can design your counter namespace however you wish (see examples).
* **Automatic "multi-actor" counters**: In addition to global counters, you can create counters that are automatically partitioned by some trait of the request, such as the IP address. This makes it easy to design different limits for different types of users.
* **Precedence-based configuration**: Rate limits are configured and evaluated in order, allowing more specific rules to take precedence over default or fallback rules.
* **Validation**: Divvy will error if you define an unreachable rule configuration.

With Divvy you can express policies like:

* Limit `GET /printer/supplies` to 100 requests per minute globally.
* Limit `POST /printer/print` to 
    * 60 requests/minute for authorized users.
    * 5 requests/minute for everyone else, by IP address.
* No limit for `GET /printer/status`

Continue to [Getting Started](#getting-started) for a more detailed example.

## Requirements

* A Redis server.
* NodeJS version 6.10.x or newer.
* Clients: A TCP connection to the Divvy service.

## Getting Started

In this section, we'll run the server locally and show how to record "hits", the basic command that checks and consumes quota.

### Install

```
$ npm install
```

Optionally, you may run the unittests:

```
$ npm test
```

### Run the server

Launch the server in the foreground:

```
$ node index.js examples/example-config.ini
Listening on port TCP port 8321, Redis host localhost:6379
```

### Consume quota

Now, let's consume some quota! The basic command we will send is:

```
HIT key1=val1 [key2=val2 ...]
```

Connect to the server using telnet:

```
$ telnet localhost 8321
Trying ::1...
Connected to localhost.
Escape character is '^]'.
```

Now send a `HIT`:

```
HIT method=GET path=/status
```

You should see a response like:

```
OK true 999 60
```

Let's look at what each field means:

* **Status**: `OK`: The server understood the command, yay!
* **Allowed**: `true`: We have enough quota for this operation.
* **Credit remaining**: `999`: We have a bunch of quota left, too.
* **Next reset (seconds)**: `60`: Our quota will be set back to `1000` in 60 seconds. 

Let's try a few more and watch our quota decrease:

```
HIT method=GET path=/status
OK true 998 58
HIT method=GET path=/status
OK true 997 58
HIT method=GET path=/status
OK true 995 57
HIT method=GET path=/status
OK true 994 56
```

Now, let's try hitting a different a resource. The example config says there is a limit of _3 requests per hour for GET /pantry/cookies, by IP_. Let's see how many cookies we can get:

```
HIT method=GET path=/pantry/cookies ip=192.168.1.1
OK true 2 3600
HIT method=GET path=/pantry/cookies ip=192.168.1.1
OK true 1 3599
HIT method=GET path=/pantry/cookies ip=192.168.1.1
OK true 0 3598
HIT method=GET path=/pantry/cookies ip=192.168.1.1
OK false 0 3597
```

You can see that the last attempt was denied, because we have already had 3 cookies this hour. What if we use a different IP?

```
HIT method=GET path=/pantry/cookies ip=4.3.2.1
OK true 2 3600
```

This policy illustrates a powerful concept: automatic partitioning of counters based on the _actor_, which in this case is configured to be whatever value is given as `ip`.

## Protocol

This section describes version 1 of the Divvy service protocol.

### Basics

The protocol is a line-oriented "chat" or telnet-style protocol, taking place over a TCP connection (default port 8321). A client sends a request "command" to the server and receives a response message. Requests are always processed by the server in order, on a per-connection basis.

Both request and response messages consist of a sequence of text followed by a newline character `\n`.

Request messages consist of a command word, for example `HIT`, followed by command-specific arguments.

Response messages consist of a status word, for example `OK` or `ERR`, followed by command-specific response or error data.

There is no inherent protocol restriction on multiple concurrent client connections, however order-of-execution is only guaranteed within a connection.

### Data types

Messages make use of boolean, string and numeric data types.

Booleans are serialized as the exact value `true` or `false`.

Strings are serialized as UTF-8 character sequences, and may be either quoted or unquoted. Unquoted strings are available as a convenience when the string has no characters that require quoting (whitespace or equals-sign); there is no difference in processing.

Strings must conform to the following regexes:

* Unquoted: `/^[^"=\s]+$/`
* Quoted: `/^"[^"\n]*"$/`

Numbers are always serialized as decimal integers.

### Commands

#### `HIT [key=value] [key2=value ...]`

Perform a check-and-decrement of quota. Zero or more key-value pairs specify the operation being performed, and will be evaluated by the server against its configuration.

Response: The following fields as positional values:

* `isAllowed`: one of `true`, `false`, indicating whether quota was available.
* `currentCredit`: number of credit(s) available at the end of this command.
* `nextResetSeconds`: time, in seconds, until credit next resets.

Example:
```
HIT method="POST" path="/cgi-bin/upload.cgi"
OK true 57 60

HIT method="DELETE" path="/index.html"
OK false 0 0
```

### Error responses

When a command cannot be processed, the server responds with an error message. The format is:

```
ERR <error-code> [reason]
```

Values:

* `error-code`: A string giving the logical error code. Required. Values include:
    * `unknown-command`: Client tried to execute an unknown command.
    * `unknown`: An unknown error.. spooky!
* `reason`: A string giving a human-interpretable error reason (optional).

## Configuration

Configuration is expressed as a sequence of *buckets*. Buckets have the following required attributes:

* `operation`: Zero or more key-value pairs which must be found in the incoming `HIT` request.
  * The special value `*` may be used here to express, "key must be present, but any value can match".
  * Glob keys are supported in the interest of specifying limits across subpaths, such as `/v1/billing/*`.
* `creditLimit`: The number of hits that are allowed in the quota period.
* `resetSeconds`: The quota period; reset the counter and refresh quota after this many seconds.

Bucket order is signficant: Quota is determined for a `HIT` request by finding the first bucket where all key/value pairs required by the bucket's `operation` match the request. Additional key/value pairs in the request *may* be ignored.

The following optional fields are also supported:

* `comment`: A diagnostic comment, printed when running server with `DEBUG=divvy`.
* `actorField`: Described in _"Actors and multi-tenancy"_.

### File format

Config files are written in [INI file syntax](https://en.wikipedia.org/wiki/INI_file), although we may add other formats later. See `examples/example-config.ini` for an example.

### Actors and multi-tenancy

By default, each bucket will be tracked and decremented as a single counter in the Divvy redis backend. However more often we want to track quota on a "per-something" basis: per IP, per user, per API key, and so on. *Actors* provide this flexibility.

If a bucket configuration specifies `actorField`, Divvy will track a separate counter for every distinct value of that field in `HIT` requests. Here is a short example:

```ini
[method=GET ip=*]
creditLimit = 100
resetSeconds = 60
actorField = 'ip'
comment = '100 requests/second per IP'
```

Now we will get a different credit counter for every unique IP:

```
HIT method=GET ip=10.20.1.3
OK true 99 60
HIT method=GET ip=10.20.1.3
OK true 98 60
HIT method=GET ip=10.20.1.3
OK true 97 60
HIT method=GET ip=192.168.1.1   <-- different ip
OK true 99 60                   <-- fresh quota!
```

**Note:** Divvy never interprets the value of `actorField`. Since Divvy automatically tracks new quota upon receiving a new actor, clients must be careful to normalize these fields.

## Server options

The server can be configured with several environment variables.

* `PORT`: TCP port to listen on (default: `8321`).
* `REDIS_HOST`: Hostname of redis backend (default: `localhost`).
* `REDIS_PORT`: Port number of redis backend (default: `6379`).
* `STATSD_HOST`: Hostname of statsd server, see "Statistics" (no default).
* `STATSD_PORT`: Port of statsd server (no default);
* `STATSD_PREFIX`: Optional prefix to use with statsd metrics (no default).
* `STATSD_USE_TCP`: If non-empty, use tcp instead of udp (no default).

## Statistics

If `STATSD_HOST` and `STATSD_PORT` are given, the server will report certain metrics to it:
* Counters
  * `<prefix>.hit.accepted`: Count `HIT` operations where quota was available.
  * `<prefix>.hit.rejected`: Count `HIT` operations where quota was not availabled.
  * `<prefix>.error.unknown-command`: Count of `ERR unknown-command`.
  * `<prefix>.error.unknown`: Count of `ERR unknown`.
* Timers
  * `<prefix>.hit`: Time to complete `hit` operations.
* Gauges
  * `<prefix>.connections`: Concurrent connections.

## Client Libraries

* NodeJS: [divvy-client-node](https://github.com/button/divvy-client-node)

## License and Copyright

Licensed under the MIT license. See `LICENSE.txt` for full terms.

Copyright 2016 Button, Inc.
