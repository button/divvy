# Divvy Changelog

## v1.6.0 (2020-03-27)

* Feature: Extend glob support to include non-terminal wildcards.

## v1.5.0 (2019-12-10)

### Breaking changes

* Configuration: A default rule must always be defined.
* Instrumentation: Match "type" is no longer included in statsd or prometheus metrics.

### New features

* Canary rules via configurable `matchPolicy`.

### Other changes

* Bump dependencies.
* Instrumentation: Statsd metrics will be recorded with the label name, when present.

## v1.4.2 (2019-07-08)

* Bump dependencies.

## v1.4.1 (2019-07-03)

* Bump dependencies.

## v1.4.0 (2019-05-08)

* Feature: Support named rules.

## v1.3.0 (2018-06-06)

* Feature: Add support for JSON-based configuration.

## v1.2.0 (2018-04-27)

* Protocol Documentation: Clarify the valid range of values for `creditLimit` and `resetSeconds`.
* Validation: Moved validation of `resetSeconds` from rule evaluation time to configuration parse time, and added validation for `creditLimit`.

## v1.1.0 (2017-08-15)

* Feature: Enable Prometheus metric scraping by exporting `HTTP_SERVICE_PORT` and `PROMETHEUS_METRICS_PATH` environment variables.

## v1.0.1 (2017-05-03)

* Bugfix: If an operation contained a glob value, any operations after it were ignored when testing the operation.
* Bumped recommended Node version to v6.10.x or greater.
* Switched code linter to eslint.

## v1.0.0 (2016-10-10)

* Initial release.
