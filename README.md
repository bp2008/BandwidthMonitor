# BandwidthMonitor
A windows service which talks to my router to monitor internet bandwidth usage of every device on the network.

## Requirements
* A router running Tomato firmware.  I wrote this to work with [Tomato firmware by Shibby](http://tomato.groov.pl/) and compatibility with anything else is unlikely.
* A windows PC to act as the server.
* A strong background in computer networking.

## Purpose
This service makes it easier to figure out which devices are using the most bandwidth at any given moment.  The service also keeps the last 10 minutes of usage in memory, so you don't have to keep the browser open to build up the graphs.
