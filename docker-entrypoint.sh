#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ] && [ -z "${SPRING_DATASOURCE_URL:-}" ]; then
  database_authority_and_path="${DATABASE_URL#*://}"
  database_authority="${database_authority_and_path%%/*}"
  database_host_and_port="${database_authority##*@}"
  database_path="${database_authority_and_path#*/}"
  database_name="${database_path%%\?*}"
  database_host="${database_host_and_port%%:*}"
  database_port="${database_host_and_port#*:}"

  if [ "$database_host" = "$database_port" ]; then
    database_port=5432
  fi
  if [ -z "$database_host" ] || [ -z "$database_name" ]; then
    echo "DATABASE_URL does not contain a database host and name." >&2
    exit 1
  fi

  export SPRING_DATASOURCE_URL="jdbc:postgresql://${database_host}:${database_port}/${database_name}?sslmode=require"
fi

exec java -jar /app/app.jar
