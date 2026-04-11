#!/bin/sh
# Railway worker service: run the job worker in the foreground.
set -e
exec node worker.cjs
