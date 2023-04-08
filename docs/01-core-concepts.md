# Nodesockd core concepts

This page serves as an overview of the core concepts and principles used in
Nodesockd. It's recommended you familiarise yourself with these concepts
first, before attempting to dive into code.

## The most important part

How does Nodesockd actually bridge your app with Nginx? It's quite simple:
when your app worker launches, Nodesockd will generate a unique socket path
that the worker's webserver should bind to. Once the worker is ready to serve
requests, Nodesockd will create a symlink to the worker's unique socket in the
place Nginx _expects_ it to be. Any `proxy_pass` or `upstream` directives in
your Nginx config will point to _symlinks_ to the actual sockets. Nodesockd's
only job, apart from launching your application workers, is to manage these
symlinks.

It follows from this scheme that traffic doesn't actually flow _through_
Nodesockd - in fact, even if the Nodesockd daemon dies after launching your
workers and setting up their symlinks, your app will work just fine unless
the workers themselves die.

As swapping a symlink on the file system for another can be done atomically,
this mechanism allows workers to be replaced with zero downtime.


## Worker lifecycle

A worker can go through 6 different states during its lifetime. Let's briefly
take a look at those:
 - `running`: This is the initial state of a worker after it is launched. It
   just means that the worker process is running.
 - `online`: This is the state workers should spend most of their lifetimes in.
   When a worker is started, it should perform any necessary initialisation and
   then report to the daemon that it is ready to serve requests, at which point
   the daemon will mark the worker as being `online`.
 - `suspended`: This is a special case of the `online` state, we'll get back
   to it later in the [Integration][1] and [Setup][2] chapters.
 - `broken`: When an error occurs in a worker, the worker may decide that its
   time is up and report to the daemon that it needs to be replaced. The daemon
   will mark the worker as `broken` and proceed to replace it as soon as
   possible; but until a replacement worker is available, a `broken` worker
   may still receive requests. It is up to the application to decide whether
   a given error should result in the worker's instant termination, or whether
   the worker can survive another couple of seconds in order to allow being
   replaced with zero downtime.
 - `terminating` and `dead`: These should be pretty self-explanatory.


## Suspended workers

Workers can be launched in a _suspended_ state in a couple of situations.
There is a Promise exposed by the worker integration library; for workers
started the usual way, this Promise will resolve instantly, but for suspended
workers the Promise will not be resolved until the daemon tells the worker
it should resume normal operation. A suspended worker must perform all of its
usual initialisation, all the way up to binding its webserver socket and
reporting itself as being `online` to the daemon, but then it must `await`
the suspension Promise before doing any actual work - that is, at the start
of handling any HTTP requests, as well as at the start of any background
operations and activities.

The suspended state is intended to allow two things: launching standby workers,
and zero-downtime deployment when things like database migrations are involved.
A suspended worker must avoid performing any operations which might depend on
something that might change until the worker is resumed - e.g. it shouldn't
execute any database queries. This way, when you have a database migration you
need to execute during a deployment, the old workers (which depend on the
original database structure) can be replaced with new workers in suspended
state, where they can _accept_ requests, but the actual _handling_ of those
requests is postponed; then the migration can be run, and then the suspended
workers can be resumed, at which point they will process any pending requests
which came while the workers were suspended - meaning that your application
shouldn't lose even a single request (some requests will just be slightly
delayed).

The suspended state is also useful for standby workers, which, if configured,
will be used for faster failover when a worker needs to be replaced. Standby
workers will be started in suspended mode and resumed when they are activated.


Next chapter: [Integrating Nodesockd with your application workers][1]


[1]: ./02-integration.md
[2]: ./04-setup.md
