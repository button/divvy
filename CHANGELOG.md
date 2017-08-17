# Divvy Changelog

## v1.1.0 (2017-08-15)

* Feature: Enable Prometheus metric scraping by exporting `HTTP_SERVICE_PORT` and `PROMETHEUS_METRICS_PATH` environment variables.

## v1.0.1 (2017-05-03)

* Bugfix: If an operation contained a glob value, any operations after it were ignored when testing the operation.
* Bumped recommended Node version to v6.10.x or greater.
* Switched code linter to eslint.

## v1.0.0 (2016-10-10)

* Initial release.
